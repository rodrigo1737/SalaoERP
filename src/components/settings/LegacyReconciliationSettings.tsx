import { type ChangeEvent, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileSearch, Upload } from 'lucide-react';
import { toast } from 'sonner';

import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/context/DataContext';
import { supabase } from '@/integrations/supabase/client';
import { calculateSettlementAmount, normalizeCommissionSettlementKind } from '@/lib/commissionSettlement';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  addMinutes,
  asText,
  buildNotes,
  chunkArray,
  DEFAULT_BATCH_SIZE,
  getField,
  hasRequiredHeaders,
  IMPORT_PAGE_SIZE,
  normalizeText,
  onlyDigits,
  parseDateTime,
  parseMoney,
  parseNumber,
  RawRow,
  readWorkbookRows,
} from './importUtils';

type ReconciliationItemType = 'service' | 'product' | 'tip';
type ReconciliationStatus = 'exact' | 'missing' | 'needs_financial' | 'service_mismatch' | 'value_mismatch' | 'both_mismatch' | 'finance_only';

type ReconciliationRow = {
  sourceRow: number;
  itemType: ReconciliationItemType;
  commandNumber: string;
  clientName: string;
  clientPhone: string | null;
  clientEmail: string | null;
  professionalName: string;
  serviceName: string;
  category: string | null;
  startTime: string;
  totalValue: number;
  commissionRate: number;
  sourceCommissionValue: number;
  sourceNetValue: number;
  notes: string | null;
  duplicateKey: string;
};

type ExistingClient = { id: string; name: string; phone: string | null; email: string | null };
type ExistingProfessional = {
  id: string;
  name: string;
  nickname: string;
  settlement_type?: 'commission' | 'transfer' | null;
};
type ExistingService = { id: string; name: string; duration_minutes: number; default_price: number };
type ExistingAppointment = {
  id: string;
  client_id: string | null;
  professional_id: string | null;
  service_id: string | null;
  start_time: string;
  total_value: number | null;
  notes: string | null;
};
type ExistingCashSession = { id: string; opened_at: string; status: 'open' | 'closed' };
type ExistingTransaction = { id: string; reference_id: string | null; reference_type: string | null };
type ExistingCommission = { id: string; appointment_id: string | null; transaction_id: string | null };
type ExistingDependencies = {
  clients: ExistingClient[];
  professionals: ExistingProfessional[];
  services: ExistingService[];
  appointments: ExistingAppointment[];
  cashSessions: ExistingCashSession[];
  transactions: ExistingTransaction[];
  commissions: ExistingCommission[];
};
type AnalyzedRow = ReconciliationRow & {
  status: ReconciliationStatus;
  matchedAppointmentId?: string;
};

const REQUIRED_HEADERS = ['Data', 'Comanda', 'Item', 'Tipo', 'Profissional', 'Cliente', 'Valor'];
const SOURCE_YEAR = 2026;
const SOURCE_NOTE_PREFIX = 'Origem conciliação histórica 2026';

const canonicalProfessional = (value: string) => {
  const normalized = normalizeText(value);
  return ['gabi', 'gabriela', 'gabriela benevenuto'].includes(normalized) ? 'gabi' : normalized;
};

const clientMatchKey = (name: string, phone?: string | null, email?: string | null) => {
  if (phone) return `phone:${onlyDigits(phone)}`;
  if (email) return `email:${normalizeText(email)}`;
  return `name:${normalizeText(name)}`;
};

const appointmentKey = ({
  date,
  commandNumber,
  clientName,
  professionalName,
  serviceName,
  totalValue,
}: {
  date: string;
  commandNumber: string;
  clientName: string;
  professionalName: string;
  serviceName: string;
  totalValue: number;
}) => [
  date,
  commandNumber,
  normalizeText(clientName),
  canonicalProfessional(professionalName),
  normalizeText(serviceName),
  totalValue.toFixed(2),
].join('|');

const coreAppointmentKey = (row: {
  date: string;
  commandNumber: string;
  clientName: string;
  professionalName: string;
}) => [
  row.date,
  row.commandNumber,
  normalizeText(row.clientName),
  canonicalProfessional(row.professionalName),
].join('|');

const businessDate = (isoDateTime: string) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(isoDateTime));

const parseItemType = (value: unknown): ReconciliationItemType | null => {
  const type = normalizeText(asText(value));
  if (!type || type === 'servico') return 'service';
  if (type === 'produto') return 'product';
  if (type === 'caixinha') return 'tip';
  return null;
};

const parseSourceRows = (rawRows: RawRow[]) => {
  const validRows: ReconciliationRow[] = [];
  const internalKeys = new Set<string>();
  let invalidCount = 0;
  let duplicatedInFile = 0;
  let outsideYear = 0;

  rawRows.forEach((row, index) => {
    const itemType = parseItemType(getField(row, 'Tipo'));
    const startTime = parseDateTime(getField(row, 'UA')) || parseDateTime(getField(row, 'Data'), '12:00');
    if (!itemType || !startTime || !businessDate(startTime).startsWith(`${SOURCE_YEAR}-`)) {
      if (itemType && startTime) outsideYear += 1;
      else invalidCount += 1;
      return;
    }

    const commandNumber = asText(getField(row, 'Comanda'));
    const clientName = asText(getField(row, 'Cliente')).replace(/\s+/g, ' ').trim();
    const professionalName = asText(getField(row, 'Profissional')).replace(/\s+/g, ' ').trim();
    const serviceName = asText(getField(row, 'Item')).replace(/\s+/g, ' ').trim();
    const totalValue = Math.max(0, parseMoney(getField(row, 'Valor')) - parseMoney(getField(row, 'Desconto')));

    if (!commandNumber || !clientName || !serviceName) {
      invalidCount += 1;
      return;
    }

    const duplicateKey = appointmentKey({
      date: businessDate(startTime),
      commandNumber,
      clientName,
      professionalName,
      serviceName,
      totalValue,
    });
    if (internalKeys.has(duplicateKey)) {
      duplicatedInFile += 1;
      return;
    }
    internalKeys.add(duplicateKey);

    validRows.push({
      sourceRow: index + 2,
      itemType,
      commandNumber,
      clientName,
      clientPhone: onlyDigits(getField(row, 'Celular')) || onlyDigits(getField(row, 'Telefone')) || null,
      clientEmail: asText(getField(row, 'Email')).toLowerCase() || null,
      professionalName,
      serviceName,
      category: asText(getField(row, 'Categoria')) || null,
      startTime,
      totalValue,
      commissionRate: parseNumber(getField(row, 'Comissão (%)')),
      sourceCommissionValue: parseMoney(getField(row, 'Comissão')),
      sourceNetValue: parseMoney(getField(row, 'Líquido')),
      notes: buildNotes([
        [SOURCE_NOTE_PREFIX, `linha ${index + 2}`],
        ['Comanda legada', commandNumber],
        ['Categoria legada', getField(row, 'Categoria')],
        ['Assistente 1', getField(row, 'Assistente 1')],
        ['Assistente 2', getField(row, 'Assistente 2')],
        ['Comissão (%) origem', getField(row, 'Comissão (%)')],
        ['Comissão valor origem', getField(row, 'Comissão')],
        ['Líquido origem', getField(row, 'Líquido')],
        ['Custo origem', getField(row, 'Custo')],
        ['UA origem', getField(row, 'UA')],
      ]) || null,
      duplicateKey,
    });
  });

  return { validRows, invalidCount, duplicatedInFile, outsideYear };
};

const extractLegacyCommand = (notes?: string | null) =>
  notes?.match(/Comanda legada:\s*([^\n]+)/i)?.[1]?.trim() ?? null;

const mapStatusLabel = (status: ReconciliationStatus) => {
  if (status === 'exact') return 'Já conciliado';
  if (status === 'missing') return 'Ausente';
  if (status === 'needs_financial') return 'Financeiro/comissão pendente';
  if (status === 'service_mismatch') return 'Serviço divergente';
  if (status === 'value_mismatch') return 'Valor divergente';
  if (status === 'both_mismatch') return 'Serviço e valor divergentes';
  return 'Financeiro sem atendimento';
};

export function LegacyReconciliationSettings() {
  const { tenantId, canModify, userRole } = useAuth();
  const { refreshData } = useData();
  const [fileName, setFileName] = useState('');
  const [sourceRows, setSourceRows] = useState<ReconciliationRow[]>([]);
  const [analysis, setAnalysis] = useState<AnalyzedRow[]>([]);
  const [invalidCount, setInvalidCount] = useState(0);
  const [duplicatedInFile, setDuplicatedInFile] = useState(0);
  const [outsideYear, setOutsideYear] = useState(0);
  const [parsing, setParsing] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [lastResult, setLastResult] = useState<string | null>(null);

  const counts = useMemo(() => ({
    missing: analysis.filter((row) => row.status === 'missing').length,
    needsFinancial: analysis.filter((row) => row.status === 'needs_financial').length,
    mismatches: analysis.filter((row) => ['service_mismatch', 'value_mismatch', 'both_mismatch'].includes(row.status)).length,
    financeOnly: analysis.filter((row) => row.status === 'finance_only').length,
    exact: analysis.filter((row) => row.status === 'exact').length,
    missingWithProfessional: analysis.filter((row) => row.status === 'missing' && !!row.professionalName).length,
    missingWithoutProfessional: analysis.filter((row) => row.status === 'missing' && !row.professionalName).length,
  }), [analysis]);

  const fetchAllDependencies = async (): Promise<ExistingDependencies> => {
    if (!tenantId) {
      return { clients: [], professionals: [], services: [], appointments: [], cashSessions: [], transactions: [], commissions: [] };
    }

    const loadPaged = async <T,>(table: string, select: string, filterDeleted = true) => {
      const items: T[] = [];
      let from = 0;
      while (true) {
        let query = supabase.from(table as never).select(select).eq('tenant_id', tenantId).range(from, from + IMPORT_PAGE_SIZE - 1);
        if (filterDeleted) query = query.is('deleted_at', null);
        const { data, error } = await query;
        if (error) throw error;
        items.push(...((data as T[]) ?? []));
        if (!data || data.length < IMPORT_PAGE_SIZE) break;
        from += IMPORT_PAGE_SIZE;
      }
      return items;
    };

    const [clients, professionals, services, appointments, cashSessions, transactions, commissions] = await Promise.all([
      loadPaged<ExistingClient>('clients', 'id, name, phone, email'),
      loadPaged<ExistingProfessional>('professionals', 'id, name, nickname, settlement_type'),
      loadPaged<ExistingService>('services', 'id, name, duration_minutes, default_price'),
      loadPaged<ExistingAppointment>('appointments', 'id, client_id, professional_id, service_id, start_time, total_value, notes'),
      loadPaged<ExistingCashSession>('cash_sessions', 'id, opened_at, status', false),
      loadPaged<ExistingTransaction>('transactions', 'id, reference_id, reference_type', false),
      loadPaged<ExistingCommission>('commissions', 'id, appointment_id, transaction_id', false),
    ]);

    return {
      clients,
      professionals,
      services,
      appointments,
      cashSessions,
      transactions,
      commissions,
    };
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    setFileName(file?.name ?? '');
    setSourceRows([]);
    setAnalysis([]);
    setLastResult(null);
    if (!file) return;

    setParsing(true);
    try {
      const { rawRows, headers } = await readWorkbookRows(file);
      const missingHeaders = hasRequiredHeaders(headers, REQUIRED_HEADERS);
      if (missingHeaders.length > 0) {
        toast.error(`A planilha precisa conter as colunas: ${missingHeaders.join(', ')}`);
        return;
      }
      const parsed = parseSourceRows(rawRows);
      setSourceRows(parsed.validRows);
      setInvalidCount(parsed.invalidCount);
      setDuplicatedInFile(parsed.duplicatedInFile);
      setOutsideYear(parsed.outsideYear);
      toast.success(`${parsed.validRows.length} itens de 2026 prontos para conciliação.`);
    } catch (error) {
      console.error('Erro ao ler planilha de conciliação:', error);
      toast.error('Não foi possível ler a planilha XLSX.');
    } finally {
      setParsing(false);
    }
  };

  const analyze = async () => {
    if (!tenantId || !canModify() || sourceRows.length === 0) {
      toast.error('Selecione uma planilha válida em uma conta de cliente com permissão de alteração.');
      return;
    }
    setAnalyzing(true);
    try {
      const deps = await fetchAllDependencies();
      const clientById = new Map(deps.clients.map((client) => [client.id, client]));
      const professionalById = new Map(deps.professionals.map((professional) => [professional.id, professional]));
      const serviceById = new Map(deps.services.map((service) => [service.id, service]));
      const exactAppointments = new Map<string, ExistingAppointment>();
      const coreKeys = new Map<string, Array<{ serviceName: string; totalValue: number }>>();
      const transactionReferences = new Set(deps.transactions.map((transaction) => transaction.reference_id).filter(Boolean));
      const commissionAppointments = new Set(deps.commissions.map((commission) => commission.appointment_id).filter(Boolean));

      deps.appointments.forEach((appointment) => {
        const commandNumber = extractLegacyCommand(appointment.notes);
        if (!commandNumber) return;
        const client = appointment.client_id ? clientById.get(appointment.client_id) : undefined;
        const professional = appointment.professional_id ? professionalById.get(appointment.professional_id) : undefined;
        const service = appointment.service_id ? serviceById.get(appointment.service_id) : undefined;
        if (!client || !service) return;
        const date = businessDate(appointment.start_time);
        const coreKey = coreAppointmentKey({ date, commandNumber, clientName: client.name, professionalName: professional?.nickname || professional?.name || '' });
        const row = { serviceName: service.name, totalValue: Number(appointment.total_value ?? 0) };
        coreKeys.set(coreKey, [...(coreKeys.get(coreKey) ?? []), row]);
        exactAppointments.set(
          appointmentKey({ date, commandNumber, clientName: client.name, professionalName: professional?.nickname || professional?.name || '', serviceName: service.name, totalValue: row.totalValue }),
          appointment,
        );
      });

      const analyzed = sourceRows.map((row): AnalyzedRow => {
        if (row.itemType !== 'service') {
          const sourceReference = `legacy-2026-row-${row.sourceRow}`;
          return { ...row, status: transactionReferences.has(sourceReference) ? 'exact' : 'finance_only' };
        }
        const exactKey = appointmentKey({ date: businessDate(row.startTime), commandNumber: row.commandNumber, clientName: row.clientName, professionalName: row.professionalName, serviceName: row.serviceName, totalValue: row.totalValue });
        const exactAppointment = exactAppointments.get(exactKey);
        if (exactAppointment) {
          const requiresCommission = !!row.professionalName && (row.commissionRate > 0 || row.sourceCommissionValue > 0);
          const hasTransaction = transactionReferences.has(exactAppointment.id);
          const hasCommission = commissionAppointments.has(exactAppointment.id);
          return {
            ...row,
            matchedAppointmentId: exactAppointment.id,
            status: hasTransaction && (!requiresCommission || hasCommission) ? 'exact' : 'needs_financial',
          };
        }
        const core = coreKeys.get(coreAppointmentKey({ date: businessDate(row.startTime), commandNumber: row.commandNumber, clientName: row.clientName, professionalName: row.professionalName })) ?? [];
        if (core.length === 0) return { ...row, status: 'missing' };
        const hasService = core.some((candidate) => normalizeText(candidate.serviceName) === normalizeText(row.serviceName));
        const hasValue = core.some((candidate) => Math.abs(candidate.totalValue - row.totalValue) < 0.01);
        if (hasService && !hasValue) return { ...row, status: 'value_mismatch' };
        if (!hasService && hasValue) return { ...row, status: 'service_mismatch' };
        return { ...row, status: 'both_mismatch' };
      });

      setAnalysis(analyzed);
      toast.success('Conciliação concluída. Somente ausências e vínculos financeiros pendentes serão elegíveis para inclusão.');
    } catch (error) {
      console.error('Erro ao analisar conciliação:', error);
      toast.error('Não foi possível consultar os vínculos atuais do cliente.');
    } finally {
      setAnalyzing(false);
    }
  };

  const importMissing = async () => {
    if (!tenantId || userRole !== 'admin' || !canModify()) {
      toast.error('A conciliação histórica só pode ser executada por um administrador.');
      return;
    }
    const rowsToImport = analysis.filter((row) => ['missing', 'needs_financial', 'finance_only'].includes(row.status));
    if (rowsToImport.length === 0) {
      toast.info('Não há pendências elegíveis para inclusão.');
      return;
    }

    setImporting(true);
    setProgress(0);
    try {
      const deps = await fetchAllDependencies();
      const clientMap = new Map<string, ExistingClient>();
      deps.clients.forEach((client) => {
        clientMap.set(clientMatchKey(client.name, client.phone, client.email), client);
        clientMap.set(`name:${normalizeText(client.name)}`, client);
      });
      const professionalMap = new Map<string, ExistingProfessional>();
      deps.professionals.forEach((professional) => {
        professionalMap.set(`name:${canonicalProfessional(professional.name)}`, professional);
        professionalMap.set(`name:${canonicalProfessional(professional.nickname)}`, professional);
      });
      const serviceMap = new Map<string, ExistingService>();
      deps.services.forEach((service) => serviceMap.set(`name:${normalizeText(service.name)}`, service));
      const cashByDate = new Map<string, ExistingCashSession[]>();
      deps.cashSessions.forEach((session) => cashByDate.set(businessDate(session.opened_at), [...(cashByDate.get(businessDate(session.opened_at)) ?? []), session]));
      const transactionReferences = new Set(deps.transactions.map((transaction) => transaction.reference_id).filter(Boolean));

      const missingServices = Array.from(new Set(rowsToImport.filter((row) => row.itemType === 'service').map((row) => row.serviceName).filter((name) => !serviceMap.has(`name:${normalizeText(name)}`))));
      for (const chunk of chunkArray(missingServices, DEFAULT_BATCH_SIZE)) {
        if (chunk.length === 0) continue;
        const { data, error } = await supabase.from('services').insert(chunk.map((name) => ({
          tenant_id: tenantId,
          name,
          description: 'Serviço criado automaticamente durante a conciliação histórica 2026.',
          category: 'Importado',
          default_price: 0,
          duration_minutes: 60,
          break_time_minutes: 0,
          allow_online_booking: false,
          price_type: 'fixed' as const,
          cost_price: 0,
          is_active: true,
        }))).select('id, name, duration_minutes, default_price');
        if (error) throw error;
        (data ?? []).forEach((service) => serviceMap.set(`name:${normalizeText(service.name)}`, service as ExistingService));
      }

      const rowsWithRefs = rowsToImport.map((row) => {
        const client = clientMap.get(clientMatchKey(row.clientName, row.clientPhone, row.clientEmail)) || clientMap.get(`name:${normalizeText(row.clientName)}`);
        const professional = row.professionalName ? professionalMap.get(`name:${canonicalProfessional(row.professionalName)}`) : undefined;
        const service = row.itemType === 'service' ? serviceMap.get(`name:${normalizeText(row.serviceName)}`) : undefined;
        const sessionCandidates = cashByDate.get(businessDate(row.startTime)) ?? [];
        return { row, client, professional, service, cashSession: sessionCandidates.length === 1 ? sessionCandidates[0] : null };
      });

      const appointmentPayload = rowsWithRefs
        .filter(({ row, client, service }) => row.status === 'missing' && row.itemType === 'service' && !!client && !!service)
        .map(({ row, client, professional, service }) => ({
          sourceRow: row.sourceRow,
          payload: {
            tenant_id: tenantId,
            client_id: client!.id,
            professional_id: professional?.id ?? null,
            service_id: service!.id,
            start_time: row.startTime,
            end_time: addMinutes(row.startTime, service!.duration_minutes || 60),
            status: 'completed' as const,
            notes: `${row.notes ?? ''}${professional ? '' : '\nComissão pendente: profissional não identificado na base atual.'}`.trim(),
            total_value: row.totalValue,
            booking_source: 'admin' as const,
            created_at: row.startTime,
          },
        }));

      for (const chunk of chunkArray(appointmentPayload, DEFAULT_BATCH_SIZE)) {
        if (chunk.length === 0) continue;
        const { error } = await supabase.from('appointments').insert(chunk.map((item) => item.payload));
        if (error) throw error;
      }

      const { data: insertedAppointments, error: insertedAppointmentsError } = await supabase
        .from('appointments')
        .select('id, client_id, professional_id, service_id, start_time, total_value, notes')
        .eq('tenant_id', tenantId)
        .like('notes', `${SOURCE_NOTE_PREFIX}%`);
      if (insertedAppointmentsError) throw insertedAppointmentsError;

      const appointmentBySourceRow = new Map<number, ExistingAppointment>();
      (insertedAppointments ?? []).forEach((appointment) => {
        const match = appointment.notes?.match(new RegExp(`${SOURCE_NOTE_PREFIX}\\s*:\\s*linha (\\d+)`, 'i'));
        if (match) appointmentBySourceRow.set(Number(match[1]), appointment as ExistingAppointment);
      });

      const appointmentById = new Map<string, ExistingAppointment>();
      deps.appointments.forEach((appointment) => appointmentById.set(appointment.id, appointment));
      (insertedAppointments ?? []).forEach((appointment) => appointmentById.set(appointment.id, appointment as ExistingAppointment));

      const resolvedRows = rowsWithRefs.map((entry) => ({
        ...entry,
        appointment: entry.row.itemType === 'service'
          ? entry.row.matchedAppointmentId
            ? appointmentById.get(entry.row.matchedAppointmentId)
            : appointmentBySourceRow.get(entry.row.sourceRow)
          : undefined,
      }));

      const transactionRows: Array<Record<string, unknown>> = [];
      resolvedRows.forEach(({ row, cashSession, appointment }) => {
        const referenceId = row.itemType === 'service'
          ? appointment?.id
          : `legacy-2026-row-${row.sourceRow}`;
        if (!referenceId || transactionReferences.has(referenceId)) return;
        transactionRows.push({
          tenant_id: tenantId,
          cash_session_id: cashSession?.id ?? null,
          type: 'income',
          category: row.itemType === 'product' ? 'product' : row.itemType === 'tip' ? 'tip' : 'service',
          description: `${row.serviceName} - ${row.clientName} (Comanda ${row.commandNumber}) | Conciliação histórica 2026${cashSession ? '' : ' | caixa não identificado'}`,
          amount: row.totalValue,
          payment_method: 'other',
          reference_id: referenceId,
          reference_type: row.itemType === 'service' ? 'appointment' : 'legacy_reconciliation',
          created_by: null,
          created_at: row.startTime,
        });
      });

      const insertedTransactions: Array<{ id: string; reference_id: string | null; reference_type: string | null }> = [];
      for (const chunk of chunkArray(transactionRows, DEFAULT_BATCH_SIZE)) {
        if (chunk.length === 0) continue;
        const { data, error } = await supabase.from('transactions').insert(chunk).select('id, reference_id, reference_type');
        if (error) throw error;
        insertedTransactions.push(...((data ?? []) as typeof insertedTransactions));
      }
      const transactionByReference = new Map<string | null, { id: string; reference_id: string | null; reference_type: string | null }>();
      deps.transactions.forEach((transaction) => transactionByReference.set(transaction.reference_id, transaction));
      insertedTransactions.forEach((transaction) => transactionByReference.set(transaction.reference_id, transaction));

      const commissionRows: Array<Record<string, unknown>> = [];
      resolvedRows.forEach(({ row, professional, service, cashSession, appointment }) => {
        if (row.itemType !== 'service' || !professional || !service || !appointment) return;
        if (commissionAppointments.has(appointment.id)) return;
        if (row.commissionRate <= 0 && row.sourceCommissionValue <= 0) return;
        const transaction = appointment ? transactionByReference.get(appointment.id) : undefined;
        const settlementKind = normalizeCommissionSettlementKind(undefined, professional.settlement_type);
        const commissionValue = calculateSettlementAmount(row.totalValue, row.commissionRate, settlementKind);
        commissionRows.push({
          tenant_id: tenantId,
          professional_id: professional.id,
          appointment_id: appointment.id,
          service_id: service.id,
          transaction_id: transaction?.id ?? null,
          cash_session_id: cashSession?.id ?? null,
          type: 'service',
          base_value: row.totalValue,
          commission_rate: row.commissionRate,
          commission_value: commissionValue,
          settlement_kind: settlementKind,
          service_name_snapshot: service.name,
          professional_name_snapshot: professional.nickname || professional.name,
          rule_source_id: null,
          calculation_source: 'legacy',
          status: 'pending',
          created_at: row.startTime,
        });
      });

      for (const chunk of chunkArray(commissionRows, DEFAULT_BATCH_SIZE)) {
        if (chunk.length === 0) continue;
        const { error } = await supabase.from('commissions').insert(chunk);
        if (error) throw error;
      }

      await refreshData(['clients', 'services', 'appointments', 'transactions', 'commissions']);
      const unresolvedClients = resolvedRows.filter(({ row, client }) => ['missing', 'needs_financial'].includes(row.status) && !client).length;
      const noCashSession = resolvedRows.filter(({ row, cashSession }) => ['missing', 'needs_financial', 'finance_only'].includes(row.status) && !cashSession).length;
      const importedAppointments = appointmentPayload.length;
      const importedTransactions = transactionRows.length;
      const importedCommissions = commissionRows.length;
      setProgress(100);
      const result = `${importedAppointments} atendimentos, ${importedTransactions} movimentos financeiros e ${importedCommissions} comissões importados. ${noCashSession} ficaram com caixa não identificado e forma de pagamento “outro”; ${unresolvedClients} clientes não foram encontrados.`;
      setLastResult(result);
      toast.success(result);
    } catch (error) {
      console.error('Erro ao importar conciliação histórica:', error);
      toast.error(error instanceof Error ? error.message : 'Não foi possível concluir a conciliação histórica.');
    } finally {
      setImporting(false);
    }
  };

  const previewRows = analysis.filter((row) => row.status !== 'missing' && row.status !== 'exact').slice(0, 12);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileSearch className="h-5 w-5" />
          Conciliação histórica 2026
        </CardTitle>
        <CardDescription>
          Compara data, comanda, cliente, profissional, serviço e valor. Inclui atendimentos ausentes e completa vínculos financeiros pendentes sem duplicar o que já existe.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 md:grid-cols-[1fr_auto_auto] md:items-end">
          <div className="space-y-2">
            <Label htmlFor="legacy-reconciliation-file">Planilha XLSX</Label>
            <Input id="legacy-reconciliation-file" type="file" accept=".xlsx,.xls" onChange={handleFileChange} disabled={parsing || analyzing || importing} />
            {fileName ? <p className="text-xs text-muted-foreground">{fileName}</p> : null}
          </div>
          <Button variant="outline" onClick={analyze} disabled={parsing || analyzing || importing || sourceRows.length === 0}>
            <FileSearch className="mr-2 h-4 w-4" />
            {analyzing ? 'Consultando...' : 'Validar no sistema'}
          </Button>
          <Button onClick={importMissing} disabled={parsing || analyzing || importing || analysis.length === 0 || userRole !== 'admin'}>
            <Upload className="mr-2 h-4 w-4" />
            {importing ? 'Importando...' : 'Importar pendências elegíveis'}
          </Button>
        </div>

        {sourceRows.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Metric label="Linhas 2026" value={sourceRows.length} />
            <Metric label="Duplicadas na planilha" value={duplicatedInFile} />
            <Metric label="Fora de 2026" value={outsideYear} />
            <Metric label="Inválidas" value={invalidCount} />
            <Metric label="Status" value={analysis.length ? 'validado' : 'aguardando'} />
          </div>
        ) : null}

        {analysis.length > 0 ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
              <Metric label="Ausentes elegíveis" value={counts.missingWithProfessional} tone="success" />
              <Metric label="Sem profissional" value={counts.missingWithoutProfessional} tone="warning" />
              <Metric label="Financeiro pendente" value={counts.needsFinancial} tone="warning" />
              <Metric label="Divergências" value={counts.mismatches} tone="warning" />
              <Metric label="Produto/caixinha" value={counts.financeOnly} tone="warning" />
              <Metric label="Já conciliados" value={counts.exact} tone="success" />
            </div>
            <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
              <p>
                O arquivo não informa a forma de pagamento. Quando não houver uma única sessão de caixa na data, o movimento será criado sem caixa identificado e com pagamento “outro”, para não inventar conciliação de numerário.
              </p>
            </div>
            {previewRows.length > 0 ? (
              <div className="rounded-lg border">
                <div className="border-b p-4 text-sm font-medium">Primeiras divergências que ficaram fora da importação automática</div>
                <Table>
                  <TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Comanda</TableHead><TableHead>Cliente</TableHead><TableHead>Profissional</TableHead><TableHead>Serviço</TableHead><TableHead>Valor</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                  <TableBody>{previewRows.map((row) => <TableRow key={`${row.sourceRow}-${row.status}`}><TableCell>{businessDate(row.startTime)}</TableCell><TableCell>{row.commandNumber}</TableCell><TableCell>{row.clientName}</TableCell><TableCell>{row.professionalName || 'Não informado'}</TableCell><TableCell>{row.serviceName}</TableCell><TableCell>R$ {row.totalValue.toFixed(2).replace('.', ',')}</TableCell><TableCell>{mapStatusLabel(row.status)}</TableCell></TableRow>)}</TableBody>
                </Table>
              </div>
            ) : <div className="flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-950"><CheckCircle2 className="h-5 w-5" />Nenhuma divergência foi localizada.</div>}
          </>
        ) : null}

        {importing ? <Progress value={progress} /> : null}
        {lastResult ? <p className="text-sm text-muted-foreground">{lastResult}</p> : null}
      </CardContent>
    </Card>
  );
}

function Metric({ label, value, tone }: { label: string; value: string | number; tone?: 'success' | 'warning' }) {
  return <div className={`rounded-lg border p-4 ${tone === 'success' ? 'border-emerald-200 bg-emerald-50' : tone === 'warning' ? 'border-amber-200 bg-amber-50' : 'bg-muted/30'}`}><p className="text-xs text-muted-foreground">{label}</p><p className="text-xl font-semibold">{value}</p></div>;
}
