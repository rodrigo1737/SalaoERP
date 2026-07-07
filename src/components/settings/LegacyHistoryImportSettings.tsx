import { type ChangeEvent, useMemo, useState } from 'react';
import { FileSpreadsheet, Upload } from 'lucide-react';
import { toast } from 'sonner';

import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/context/DataContext';
import { supabase } from '@/integrations/supabase/client';
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
  RawRow,
  readWorkbookRows,
} from './importUtils';

type HistoryImportRow = {
  sourceRow: number;
  commandNumber: string;
  clientName: string;
  clientPhone: string | null;
  clientEmail: string | null;
  professionalName: string;
  serviceName: string;
  category: string | null;
  startTime: string;
  totalValue: number;
  notes: string | null;
  duplicateKey: string;
};

type ExistingClient = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
};

type ExistingProfessional = {
  id: string;
  name: string;
  nickname: string;
};

type ExistingService = {
  id: string;
  name: string;
  duration_minutes: number;
  default_price: number;
};

type ExistingAppointment = {
  client_id: string | null;
  professional_id: string | null;
  service_id: string | null;
  start_time: string;
  status: string;
};

const REQUIRED_HEADERS = ['Data', 'Comanda', 'Item', 'Profissional', 'Cliente', 'Valor'];

const buildDuplicateKey = (row: {
  commandNumber: string;
  clientName: string;
  professionalName: string;
  serviceName: string;
  startTime: string;
}) =>
  [
    row.commandNumber,
    normalizeText(row.clientName),
    normalizeText(row.professionalName),
    normalizeText(row.serviceName),
    row.startTime.slice(0, 16),
  ].join(':');

const parseImportRows = (rows: RawRow[]) => {
  const validRows: HistoryImportRow[] = [];
  const invalidRows: number[] = [];
  const internalKeys = new Set<string>();
  let duplicatedInFile = 0;

  rows.forEach((row, index) => {
    const itemType = normalizeText(asText(getField(row, 'Tipo')));
    if (itemType && itemType !== 'servico' && itemType !== 'serviço') {
      return;
    }

    const commandNumber = asText(getField(row, 'Comanda'));
    const clientName = asText(getField(row, 'Cliente')).replace(/\s+/g, ' ').trim();
    const professionalName = asText(getField(row, 'Profissional')).replace(/\s+/g, ' ').trim();
    const serviceName = asText(getField(row, 'Item')).replace(/\s+/g, ' ').trim();
    const startTime =
      parseDateTime(getField(row, 'UA')) ||
      parseDateTime(getField(row, 'Data'), '12:00') ||
      null;
    const grossValue = parseMoney(getField(row, 'Valor'));
    const discount = parseMoney(getField(row, 'Desconto'));
    const totalValue = Math.max(0, grossValue - discount);

    if (!commandNumber || !clientName || !professionalName || !serviceName || !startTime) {
      invalidRows.push(index + 2);
      return;
    }

    const duplicateKey = buildDuplicateKey({
      commandNumber,
      clientName,
      professionalName,
      serviceName,
      startTime,
    });

    if (internalKeys.has(duplicateKey)) {
      duplicatedInFile += 1;
      return;
    }

    internalKeys.add(duplicateKey);
    validRows.push({
      sourceRow: index + 2,
      commandNumber,
      clientName,
      clientPhone: onlyDigits(getField(row, 'Celular')) || onlyDigits(getField(row, 'Telefone')) || null,
      clientEmail: asText(getField(row, 'Email')).toLowerCase() || null,
      professionalName,
      serviceName,
      category: asText(getField(row, 'Categoria')) || null,
      startTime,
      totalValue,
      notes:
        buildNotes([
          ['Comanda legada', commandNumber],
          ['Categoria legada', getField(row, 'Categoria')],
          ['Assistente 1', getField(row, 'Assistente 1')],
          ['Assistente 2', getField(row, 'Assistente 2')],
          ['Comissão (%)', getField(row, 'Comissão (%)')],
          ['Quantidade', getField(row, 'Qtd.')],
          ['Custo', getField(row, 'Custo')],
          ['Comissão valor', getField(row, 'Comissão')],
          ['Líquido', getField(row, 'Líquido')],
          ['UA', getField(row, 'UA')],
        ]) || null,
      duplicateKey,
    });
  });

  return { validRows, invalidRows, duplicatedInFile };
};

const clientMatchKey = (name: string, phone?: string | null, email?: string | null) => {
  if (phone) return `phone:${onlyDigits(phone)}`;
  if (email) return `email:${normalizeText(email)}`;
  return `name:${normalizeText(name)}`;
};

const serviceMatchKey = (name: string) => `name:${normalizeText(name)}`;

const appointmentMatchKey = ({
  clientId,
  professionalId,
  serviceId,
  startTime,
}: {
  clientId: string;
  professionalId: string;
  serviceId: string;
  startTime: string;
}) => [clientId, professionalId, serviceId, startTime.slice(0, 16)].join(':');

export function LegacyHistoryImportSettings() {
  const { tenantId, canModify } = useAuth();
  const { refreshData } = useData();
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<HistoryImportRow[]>([]);
  const [invalidCount, setInvalidCount] = useState(0);
  const [duplicatedInFile, setDuplicatedInFile] = useState(0);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [lastResult, setLastResult] = useState<string | null>(null);

  const previewRows = useMemo(() => rows.slice(0, 10), [rows]);

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    setLastResult(null);
    setRows([]);
    setInvalidCount(0);
    setDuplicatedInFile(0);

    if (!file) {
      setFileName('');
      return;
    }

    setFileName(file.name);
    setParsing(true);

    try {
      const { rawRows, headers } = await readWorkbookRows(file);
      const missingHeaders = hasRequiredHeaders(headers, REQUIRED_HEADERS);

      if (missingHeaders.length > 0) {
        toast.error(`A planilha precisa conter as colunas: ${missingHeaders.join(', ')}`);
        return;
      }

      const parsed = parseImportRows(rawRows);
      setRows(parsed.validRows);
      setInvalidCount(parsed.invalidRows.length);
      setDuplicatedInFile(parsed.duplicatedInFile);
      toast.success(`${parsed.validRows.length} atendimentos históricos prontos para validação.`);
    } catch (error) {
      console.error('Erro ao ler planilha de histórico:', error);
      toast.error('Não foi possível ler a planilha XLSX.');
    } finally {
      setParsing(false);
    }
  };

  const fetchAllDependencies = async () => {
    if (!tenantId) {
      return {
        clients: [] as ExistingClient[],
        professionals: [] as ExistingProfessional[],
        services: [] as ExistingService[],
        appointments: [] as ExistingAppointment[],
      };
    }

    const loadPaged = async <T,>(table: string, select: string) => {
      const items: T[] = [];
      let from = 0;

      while (true) {
        const query = supabase
          .from(table as never)
          .select(select)
          .eq('tenant_id', tenantId)
          .range(from, from + IMPORT_PAGE_SIZE - 1);

        const { data, error } = table === 'appointments' ? await query.is('deleted_at', null) : await query.is('deleted_at', null);

        if (error) throw error;
        items.push(...((data as T[]) ?? []));
        if (!data || data.length < IMPORT_PAGE_SIZE) break;
        from += IMPORT_PAGE_SIZE;
      }

      return items;
    };

    const [clients, professionals, services, appointments] = await Promise.all([
      loadPaged<ExistingClient>('clients', 'id, name, phone, email'),
      loadPaged<ExistingProfessional>('professionals', 'id, name, nickname'),
      loadPaged<ExistingService>('services', 'id, name, duration_minutes, default_price'),
      loadPaged<ExistingAppointment>('appointments', 'client_id, professional_id, service_id, start_time, status'),
    ]);

    return { clients, professionals, services, appointments };
  };

  const handleImport = async () => {
    if (!tenantId) {
      toast.error('Entre em uma conta de cliente para importar o histórico.');
      return;
    }

    if (!canModify()) {
      toast.error('Este cliente não permite alterações no momento.');
      return;
    }

    if (rows.length === 0) {
      toast.error('Selecione uma planilha XLSX válida antes de importar.');
      return;
    }

    setImporting(true);
    setProgress(0);
    setLastResult(null);

    try {
      const { clients, professionals, services, appointments } = await fetchAllDependencies();

      const clientMap = new Map<string, ExistingClient>();
      clients.forEach((client) => {
        clientMap.set(clientMatchKey(client.name, client.phone, client.email), client);
        clientMap.set(`name:${normalizeText(client.name)}`, client);
      });

      const professionalMap = new Map<string, ExistingProfessional>();
      professionals.forEach((professional) => {
        professionalMap.set(`name:${normalizeText(professional.name)}`, professional);
        professionalMap.set(`name:${normalizeText(professional.nickname)}`, professional);
      });

      const serviceMap = new Map<string, ExistingService>();
      services.forEach((service) => serviceMap.set(serviceMatchKey(service.name), service));

      const existingAppointmentKeys = new Set<string>();
      appointments.forEach((appointment) => {
        if (!appointment.client_id || !appointment.professional_id || !appointment.service_id) return;
        existingAppointmentKeys.add(
          appointmentMatchKey({
            clientId: appointment.client_id,
            professionalId: appointment.professional_id,
            serviceId: appointment.service_id,
            startTime: appointment.start_time,
          }),
        );
      });

      const missingServices = Array.from(
        new Set(
          rows
            .map((row) => row.serviceName)
            .filter((name) => !serviceMap.has(serviceMatchKey(name))),
        ),
      );

      if (missingServices.length > 0) {
        for (const chunk of chunkArray(missingServices, DEFAULT_BATCH_SIZE)) {
          const payload = chunk.map((name) => ({
            tenant_id: tenantId,
            name,
            description: 'Serviço criado automaticamente durante a importação de histórico.',
            category: 'Importado',
            default_price: 0,
            duration_minutes: 60,
            break_time_minutes: 0,
            allow_online_booking: false,
            price_type: 'fixed' as const,
            cost_price: 0,
            is_active: true,
          }));

          const { data, error } = await supabase
            .from('services')
            .insert(payload)
            .select('id, name, duration_minutes, default_price');

          if (error) throw error;
          (data ?? []).forEach((service) => serviceMap.set(serviceMatchKey(service.name), service));
        }
      }

      const missingClients = rows.filter((row) => !clientMap.has(clientMatchKey(row.clientName, row.clientPhone, row.clientEmail)));
      const uniqueMissingClients = Array.from(
        new Map(
          missingClients.map((row) => [
            clientMatchKey(row.clientName, row.clientPhone, row.clientEmail),
            row,
          ]),
        ).values(),
      );

      if (uniqueMissingClients.length > 0) {
        for (const chunk of chunkArray(uniqueMissingClients, DEFAULT_BATCH_SIZE)) {
          const payload = chunk.map((row) => ({
            tenant_id: tenantId,
            name: row.clientName,
            phone: row.clientPhone,
            email: row.clientEmail,
            notes: 'Cliente criado automaticamente durante a importação de histórico.',
            created_at: row.startTime,
          }));

          const { data, error } = await supabase
            .from('clients')
            .insert(payload)
            .select('id, name, phone, email');

          if (error) throw error;
          (data ?? []).forEach((client) => {
            clientMap.set(clientMatchKey(client.name, client.phone, client.email), client);
            clientMap.set(`name:${normalizeText(client.name)}`, client);
          });
        }
      }

      const payload: Array<Record<string, unknown>> = [];
      let skippedExisting = 0;
      let skippedWithoutProfessional = 0;

      rows.forEach((row) => {
        const client = clientMap.get(clientMatchKey(row.clientName, row.clientPhone, row.clientEmail))
          || clientMap.get(`name:${normalizeText(row.clientName)}`);
        const professional = professionalMap.get(`name:${normalizeText(row.professionalName)}`);
        const service = serviceMap.get(serviceMatchKey(row.serviceName));

        if (!client || !professional || !service) {
          if (!professional) skippedWithoutProfessional += 1;
          return;
        }

        const matchKey = appointmentMatchKey({
          clientId: client.id,
          professionalId: professional.id,
          serviceId: service.id,
          startTime: row.startTime,
        });

        if (existingAppointmentKeys.has(matchKey)) {
          skippedExisting += 1;
          return;
        }

        existingAppointmentKeys.add(matchKey);
        payload.push({
          tenant_id: tenantId,
          client_id: client.id,
          professional_id: professional.id,
          service_id: service.id,
          start_time: row.startTime,
          end_time: addMinutes(row.startTime, service.duration_minutes || 60),
          status: 'completed',
          notes: row.notes,
          total_value: row.totalValue || service.default_price || 0,
          booking_source: 'admin',
          created_at: row.startTime,
        });
      });

      if (payload.length === 0) {
        const message = `Nenhum histórico novo para importar. ${skippedExisting} já existiam e ${skippedWithoutProfessional} ficaram sem profissional correspondente.`;
        setLastResult(message);
        toast.info(message);
        return;
      }

      let imported = 0;
      for (const chunk of chunkArray(payload, DEFAULT_BATCH_SIZE)) {
        const { error } = await supabase.from('appointments').insert(chunk);
        if (error) throw error;

        imported += chunk.length;
        setProgress(Math.round((imported / payload.length) * 100));
      }

      await refreshData(['clients', 'services', 'appointments']);
      const result = `${imported} atendimentos históricos importados com sucesso. ${skippedExisting} já existiam e ${skippedWithoutProfessional} ficaram sem profissional correspondente.`;
      setLastResult(result);
      toast.success(result);
    } catch (error) {
      console.error('Erro ao importar histórico:', error);
      toast.error('Não foi possível concluir a importação do histórico.');
    } finally {
      setImporting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileSpreadsheet className="h-5 w-5" />
          Importar Histórico e Itens de Comanda
        </CardTitle>
        <CardDescription>
          Converte os serviços históricos em atendimentos finalizados no cliente logado, sem recriar caixa nem comissão para evitar duplicidade com a planilha financeira.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
          <div className="space-y-2">
            <Label htmlFor="legacy-history-import-file">Planilha XLSX</Label>
            <Input
              id="legacy-history-import-file"
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileChange}
              disabled={parsing || importing}
            />
            {fileName ? <p className="text-xs text-muted-foreground">{fileName}</p> : null}
          </div>

          <Button onClick={handleImport} disabled={parsing || importing || rows.length === 0}>
            <Upload className="mr-2 h-4 w-4" />
            {importing ? 'Importando...' : 'Importar histórico'}
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">Linhas válidas</p>
              <p className="text-2xl font-semibold">{rows.length}</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">Linhas inválidas</p>
              <p className="text-2xl font-semibold">{invalidCount}</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">Duplicados na planilha</p>
              <p className="text-2xl font-semibold">{duplicatedInFile}</p>
            </CardContent>
          </Card>
        </div>

        {(parsing || importing) && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>{parsing ? 'Lendo planilha...' : 'Importando histórico...'}</span>
              <span>{progress}%</span>
            </div>
            <Progress value={parsing ? undefined : progress} />
          </div>
        )}

        {lastResult ? (
          <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm text-foreground">
            {lastResult}
          </div>
        ) : null}

        <div className="space-y-3">
          <div>
            <h3 className="text-sm font-medium text-foreground">Pré-visualização</h3>
            <p className="text-xs text-muted-foreground">
              Mostrando as 10 primeiras linhas válidas detectadas na planilha.
            </p>
          </div>

          <div className="overflow-hidden rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Linha</TableHead>
                  <TableHead>Comanda</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Profissional</TableHead>
                  <TableHead>Serviço</TableHead>
                  <TableHead>Valor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {previewRows.length > 0 ? (
                  previewRows.map((row) => (
                    <TableRow key={row.duplicateKey}>
                      <TableCell>{row.sourceRow}</TableCell>
                      <TableCell>{row.commandNumber}</TableCell>
                      <TableCell>{row.clientName}</TableCell>
                      <TableCell>{row.professionalName}</TableCell>
                      <TableCell>{row.serviceName}</TableCell>
                      <TableCell>R$ {row.totalValue.toFixed(2)}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                      Selecione uma planilha para visualizar o histórico.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
