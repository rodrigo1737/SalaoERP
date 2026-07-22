import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { REALTIME_SUBSCRIBE_STATES } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { isCleaningControlTenant } from '@/lib/tenantSegments';
import {
  calculateSettlementAmount,
  CommissionSettlementKind,
  getSettlementDirection,
  getSettlementTransactionCategory,
  normalizeCommissionSettlementKind,
} from '@/lib/commissionSettlement';

const COMMISSION_SETTLEMENT_TOLERANCE = 0.009;

const getCommissionOutstandingAmount = (
  commission: Pick<Commission, 'commission_value' | 'settled_amount' | 'status'>,
) => (
  Math.max(
    0,
    Math.abs(Number(commission.commission_value ?? 0))
      - Math.abs(Number(
        commission.settled_amount
          ?? (('status' in commission && commission.status === 'paid') ? commission.commission_value : 0),
      )),
  )
);

export interface Client {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  birth_date?: string;
  notes?: string;
  photo_url?: string;
  created_at: string;
}

export interface Professional {
  id: string;
  user_id?: string;
  name: string;
  nickname: string;
  phone?: string;
  email?: string;
  type: 'owner' | 'employee' | 'freelancer';
  settlement_type?: 'commission' | 'transfer';
  specialty?: string;
  commission_service?: number;
  commission_product?: number;
  is_active: boolean;
  has_schedule: boolean;
  schedule_color?: string;
  schedule_start_time?: string | null;
  schedule_end_time?: string | null;
  works_cleaning?: boolean;
  cleaning_role?: string;
  cleaning_commission_type?: 'percent' | 'fixed' | 'mixed';
  cleaning_commission_percent?: number;
  cleaning_commission_fixed?: number;
  can_view_cleaning_commission?: boolean;
  photo_url?: string;
  created_at: string;
}

export interface Service {
  id: string;
  name: string;
  description?: string;
  category?: string;
  duration_minutes: number;
  default_price: number;
  break_time_minutes: number;
  allow_online_booking: boolean;
  price_type: 'fixed' | 'variable' | 'starting_at';
  cost_price: number;
  suggested_return_days?: number;
  is_active: boolean;
  created_at: string;
}

export interface ServiceProfessional {
  id: string;
  service_id: string;
  professional_id: string;
  commission_rate: number;
  assistant_commission_rate: number;
  settlement_kind?: CommissionSettlementKind;
  duration_minutes?: number;
  tenant_id?: string;
  created_at: string;
  updated_at: string;
  professional?: Professional;
}

export interface Product {
  id: string;
  name: string;
  description?: string;
  category?: string;
  sku?: string;
  barcode?: string;
  cost_price: number;
  sale_price: number;
  stock_quantity: number;
  min_stock?: number;
  unit: string;
  type: 'revenda' | 'uso_interno';
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Appointment {
  id: string;
  client_id?: string;
  professional_id?: string;
  service_id?: string;
  start_time: string;
  end_time: string;
  status: 'pre_scheduled' | 'scheduled' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled';
  notes?: string;
  total_value?: number;
  booking_source?: 'admin' | 'online';
  client_user_id?: string;
  created_at: string;
  // Joined data
  client?: Client;
  professional?: Professional;
  service?: Service;
}

// Linha de serviço de um agendamento (múltiplos serviços por card).
export interface AppointmentServiceLine {
  service_id: string;
  professional_id: string;
  start_time?: string | null;
  end_time?: string | null;
  value: number;
}

export interface AppointmentServiceRow extends AppointmentServiceLine {
  id: string;
  appointment_id: string;
  tenant_id: string;
  position: number;
  created_at: string;
}

// Razão do cliente: dívidas (pendências) e créditos com baixa parcial.
export interface ClientLedgerEntry {
  id: string;
  tenant_id: string;
  client_id: string;
  appointment_id?: string | null;
  transaction_id?: string | null;
  entry_type: 'debt' | 'credit';
  amount: number;
  settled_amount: number;
  status: 'open' | 'settled';
  description?: string | null;
  created_at: string;
  settled_at?: string | null;
}

export interface ClientBalances {
  pendingTotal: number;
  creditTotal: number;
  entries: ClientLedgerEntry[];
}

// Linha de pagamento no fechamento da comanda (pagamento dividido).
export type BillPaymentMethod = 'cash' | 'pix' | 'credit_card' | 'debit_card' | 'client_credit' | 'pending';
export interface BillPaymentLine {
  method: BillPaymentMethod;
  amount: number;
}

export interface CashSession {
  id: string;
  opened_at: string;
  closed_at?: string;
  closed_by?: string;
  opening_balance: number;
  closing_balance?: number;
  expected_balance?: number;
  difference?: number;
  divergence_reason?: string;
  is_late_closure?: boolean;
  status: 'open' | 'closed';
  notes?: string;
  created_by?: string;
  created_at: string;
}

export interface CashSessionRegularization {
  id: string;
  tenant_id: string;
  cash_session_id: string;
  status: 'active' | 'closed' | 'cancelled';
  reason: string;
  started_by: string;
  started_at: string;
  ended_by?: string | null;
  ended_at?: string | null;
  ended_reason?: string | null;
  closing_balance?: number | null;
  expected_balance?: number | null;
  difference?: number | null;
  divergence_reason?: string | null;
  created_at: string;
}

export interface Transaction {
  id: string;
  cash_session_id?: string;
  type: 'income' | 'expense';
  category: string;
  description?: string;
  amount: number;
  payment_method?: 'cash' | 'credit_card' | 'debit_card' | 'pix' | 'other';
  reference_id?: string;
  reference_type?: string;
  reversed_at?: string | null;
  reversed_by?: string | null;
  reversal_transaction_id?: string | null;
  reversal_of_transaction_id?: string | null;
  reversal_reason?: string | null;
  created_by?: string;
  created_at: string;
}

export interface Commission {
  id: string;
  professional_id: string;
  appointment_id?: string;
  service_id?: string;
  transaction_id?: string;
  cash_session_id?: string | null;
  payment_method?: 'cash' | 'pix' | 'transfer' | null;
  type: 'service' | 'product' | 'voucher';
  base_value: number;
  commission_rate: number;
  commission_value: number;
  settlement_kind?: CommissionSettlementKind;
  service_name_snapshot?: string;
  professional_name_snapshot?: string;
  rule_source_id?: string | null;
  calculation_source?: 'service_mapping' | 'manual_mapping' | 'reprocess' | 'legacy' | 'voucher';
  status: 'pending' | 'paid';
  settled_amount?: number;
  paid_at?: string;
  created_at: string;
  professional?: Professional;
}

export interface CommissionReprocessResult {
  recalculatedCount: number;
  skippedCount: number;
  skippedItems: string[];
}

export interface CommissionReprocessPreviewItem {
  commissionId: string;
  professionalName: string;
  serviceName: string;
  baseValue: number;
  currentRate: number;
  currentValue: number;
  nextRate: number | null;
  nextValue: number | null;
  difference: number;
  alreadyPaid: boolean;
  status: 'ok' | 'no_rule' | 'no_service';
}

export interface CommissionReprocessPreview {
  items: CommissionReprocessPreviewItem[];
  affectedCount: number;
  skippedCount: number;
  totalCurrent: number;
  totalNext: number;
  totalDifference: number;
}

type AppointmentEventType =
  | 'created'
  | 'updated'
  | 'completed'
  | 'reopened'
  | 'cancelled'
  | 'payment_registered'
  | 'payment_reversed'
  | 'partial_payment_reversed'
  | 'commissions_reprocessed';

type FinancialAuditAction =
  | 'cash_opened'
  | 'cash_closed'
  | 'cash_reopened'
  | 'transaction_created'
  | 'transaction_reversed'
  | 'appointment_payment_registered'
  | 'appointment_fully_refunded'
  | 'appointment_partially_refunded'
  | 'commission_paid'
  | 'commission_batch_paid'
  | 'voucher_created'
  | 'commission_reprocessed';

interface DataContextType {
  clients: Client[];
  professionals: Professional[];
  services: Service[];
  products: Product[];
  appointments: Appointment[];
  cashSessions: CashSession[];
  transactions: Transaction[];
  commissions: Commission[];
  currentCashSession: CashSession | null;
  pendingCashSession: CashSession | null;
  selectedHistoricalCashSession: CashSession | null;
  activeCashRegularization: CashSessionRegularization | null;
  loading: boolean;
  cashLoading: boolean;
  transactionsLoading: boolean;
  ensureCashSessionState: () => Promise<{
    currentCashSession: CashSession | null;
    pendingCashSession: CashSession | null;
  }>;
  refreshData: (entities?: Array<'clients'|'professionals'|'services'|'products'|'appointments'|'cash'|'transactions'|'commissions'>) => Promise<void>;
  // Clients
  addClient: (client: Omit<Client, 'id' | 'created_at'>) => Promise<Client | null>;
  updateClient: (id: string, data: Partial<Client>) => Promise<void>;
  deleteClient: (id: string) => Promise<void>;
  // Professionals
  addProfessional: (professional: Omit<Professional, 'id' | 'created_at'>) => Promise<Professional | null>;
  updateProfessional: (id: string, data: Partial<Professional>) => Promise<void>;
  deleteProfessional: (id: string) => Promise<void>;
  // Services
  addService: (service: Omit<Service, 'id' | 'created_at'>) => Promise<Service | null>;
  updateService: (id: string, data: Partial<Service>) => Promise<void>;
  deleteService: (id: string) => Promise<void>;
  // Products
  addProduct: (product: Omit<Product, 'id' | 'created_at' | 'updated_at'>) => Promise<Product | null>;
  updateProduct: (id: string, data: Partial<Product>) => Promise<void>;
  deleteProduct: (id: string) => Promise<void>;
  updateProductStock: (id: string, newQuantity: number, reason?: string) => Promise<void>;
  // Appointments
  addAppointment: (appointment: Omit<Appointment, 'id' | 'created_at'>) => Promise<Appointment | null>;
  updateAppointment: (id: string, data: Partial<Appointment>) => Promise<void>;
  deleteAppointment: (id: string) => Promise<void>;
  refundAppointment: (id: string) => Promise<boolean>;
  completeAppointment: (
    id: string,
    paymentMethod: string,
    overrides?: Partial<Appointment>,
    options?: {
      skipCommission?: boolean;
      commissionLines?: AppointmentServiceLine[];
      skipTransaction?: boolean;
      cashSessionId?: string | null;
      movementDate?: string | null;
    },
  ) => Promise<string | null>;
  fetchAppointmentServices: (appointmentId: string) => Promise<AppointmentServiceRow[]>;
  saveAppointmentServices: (appointmentId: string, lines: AppointmentServiceLine[]) => Promise<void>;
  fetchClientBalances: (clientId: string) => Promise<ClientBalances>;
  registerBillPayments: (params: {
    appointmentId: string;
    clientId?: string | null;
    clientName?: string;
    lines: BillPaymentLine[];
    currentDue: number;
    includePreviousDebts?: boolean;
    idempotencyKey?: string | null;
    creditDeposit?: { method: 'cash' | 'pix' | 'credit_card' | 'debit_card'; amount: number } | null;
    cashSessionId?: string | null;
    appointmentDate?: string | null;
  }) => Promise<boolean>;
  // Cash
  openCashSession: (openingBalance: number) => Promise<CashSession | null>;
  reopenCurrentCashSession: (sessionId: string) => Promise<boolean>;
  closeCashSession: (
    closingBalance: number,
    notes?: string,
    options?: { sessionId?: string; divergenceReason?: string },
  ) => Promise<void>;
  selectHistoricalCashSession: (sessionId: string | null, reason?: string) => void;
  clearHistoricalCashSession: () => void;
  startHistoricalCashRegularization: (sessionId: string, reason?: string) => Promise<CashSessionRegularization | null>;
  finishHistoricalCashRegularization: (closingBalance: number, divergenceReason?: string) => Promise<boolean>;
  cancelHistoricalCashRegularization: (reason?: string) => Promise<boolean>;
  addTransaction: (transaction: Omit<Transaction, 'id' | 'created_at'>) => Promise<Transaction | null>;
  reverseTransaction: (transactionId: string, reason?: string) => Promise<boolean>;
  // Commissions
  payCommission: (id: string, paymentMethod: 'cash' | 'pix' | 'transfer', amount?: number) => Promise<void>;
  payAllCommissions: (professionalId: string, paymentMethod: 'cash' | 'pix' | 'transfer') => Promise<void>;
  addVoucher: (professionalId: string, amount: number, description?: string) => Promise<boolean>;
  reprocessPendingCommissions: (
    filters: { dateFrom: string; dateTo: string; professionalId?: string | null; includePaid?: boolean }
  ) => Promise<CommissionReprocessResult | null>;
  previewReprocessPendingCommissions: (
    filters: { dateFrom: string; dateTo: string; professionalId?: string | null; includePaid?: boolean }
  ) => Promise<CommissionReprocessPreview | null>;
}

const DataContext = createContext<DataContextType | undefined>(undefined);
const SUPABASE_PAGE_SIZE = 1000;

export const useData = () => {
  const context = useContext(DataContext);
  if (!context) throw new Error('useData must be used within a DataProvider');
  return context;
};

// ─── helpers ────────────────────────────────────────────────────────────────

function joinAppointments(
  appts: Appointment[],
  clients: Client[],
  professionals: Professional[],
  services: Service[],
): Appointment[] {
  const clientsById = new Map(clients.map((client) => [client.id, client]));
  const professionalsById = new Map(professionals.map((professional) => [professional.id, professional]));
  const servicesById = new Map(services.map((service) => [service.id, service]));

  return appts.map(apt => ({
    ...apt,
    client: apt.client_id ? clientsById.get(apt.client_id) : undefined,
    professional: apt.professional_id ? professionalsById.get(apt.professional_id) : undefined,
    service: apt.service_id ? servicesById.get(apt.service_id) : undefined,
  }));
}

function joinCommissions(comms: Commission[], professionals: Professional[]): Commission[] {
  const professionalsById = new Map(professionals.map((professional) => [professional.id, professional]));

  return comms.map(c => ({
    ...c,
    settlement_kind: normalizeCommissionSettlementKind(c.settlement_kind),
    professional: professionalsById.get(c.professional_id),
  }));
}

function getLatestOpenCashSession(cashSessions: CashSession[]): CashSession | null {
  return cashSessions
    .filter((session) => session.status === 'open')
    .sort((a, b) => new Date(b.opened_at).getTime() - new Date(a.opened_at).getTime())[0] ?? null;
}

function getBusinessDateKey(value: string | Date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value));
}

function findCashSessionByBusinessDate(cashSessions: CashSession[], value?: string | Date | null) {
  if (!value) return null;
  const targetBusinessDate = getBusinessDateKey(value);
  return cashSessions.find((session) => getBusinessDateKey(session.opened_at) === targetBusinessDate) ?? null;
}

function isSessionFromPreviousDay(session: CashSession, reference = new Date()) {
  return getBusinessDateKey(session.opened_at) < getBusinessDateKey(reference);
}

// Movimentos lançados num caixa aberto de data anterior carregam a data
// daquele caixa (com o horário atual), para o fechamento e os relatórios
// refletirem o dia do movimento do caixa — ex.: caixa de sábado regularizado
// na terça recebe lançamentos datados de sábado. Retorna undefined quando o
// caixa é do dia (usa o default now() do banco).
function getSessionMovementTimestamp(session: CashSession | null | undefined) {
  if (!session || !isSessionFromPreviousDay(session)) return undefined;
  const openedAt = new Date(session.opened_at);
  const now = new Date();
  const stamped = new Date(openedAt);
  stamped.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
  if (stamped < openedAt) return session.opened_at;
  return stamped.toISOString();
}

function resolveCashSessionState(cashSessions: CashSession[]) {
  const openSessions = cashSessions
    .filter((session) => session.status === 'open')
    .sort((a, b) => new Date(b.opened_at).getTime() - new Date(a.opened_at).getTime());

  const currentCashSession = openSessions.find((session) => !isSessionFromPreviousDay(session)) ?? null;
  const pendingCashSession = openSessions
    .filter((session) => isSessionFromPreviousDay(session))
    .sort((a, b) => new Date(a.opened_at).getTime() - new Date(b.opened_at).getTime())[0] ?? null;

  return {
    currentCashSession,
    pendingCashSession,
  };
}

// ─── Provider ───────────────────────────────────────────────────────────────

export const DataProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { user, tenantId, isSuperAdmin, canModify, currentTenant, hasPermission, userRole } = useAuth();
  const [loading, setLoading] = useState(true);
  const [clients, setClients] = useState<Client[]>([]);
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [cashSessions, setCashSessions] = useState<CashSession[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [currentCashSession, setCurrentCashSession] = useState<CashSession | null>(null);
  const [pendingCashSession, setPendingCashSession] = useState<CashSession | null>(null);
  const [activeCashRegularization, setActiveCashRegularization] = useState<CashSessionRegularization | null>(null);
  const [cashLoading, setCashLoading] = useState(true);
  const [transactionsLoading, setTransactionsLoading] = useState(true);
  const realtimeChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const fetchRequestRef = useRef(0);
  type RefreshEntity = 'clients'|'professionals'|'services'|'products'|'appointments'|'cash'|'transactions'|'commissions';
  const pendingRealtimeEntitiesRef = useRef<Set<RefreshEntity>>(new Set());
  const realtimeDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastLoadedTenantRef = useRef<string | null>(null);
  const isCleaningTenant = isCleaningControlTenant(currentTenant);
  const isAdminUser = userRole === 'admin';
  const canViewScheduleData = isAdminUser || hasPermission('view_schedule') || hasPermission('edit_schedule');
  const canManageCashFlow = isAdminUser || hasPermission('manage_cash_flow');
  const canCloseBill = isAdminUser || hasPermission('close_bill') || hasPermission('manage_cash_flow');
  const canRefundBills = isAdminUser || hasPermission('refund_bill') || hasPermission('reverse_financial_entries');
  const canPerformAdvancedFinancialOps = isAdminUser || hasPermission('reverse_financial_entries');
  const canOperateCashSessions = canManageCashFlow || canPerformAdvancedFinancialOps;
  const canViewFinancialHistory = isAdminUser
    || hasPermission('view_financial_history')
    || hasPermission('reverse_financial_entries')
    || hasPermission('refund_bill');
  const canViewCashData = canViewFinancialHistory || canManageCashFlow || canCloseBill;
  const canViewCommissionsData = isAdminUser
    || hasPermission('view_commissions')
    || hasPermission('view_financial_history')
    || hasPermission('reverse_financial_entries');
  const selectedHistoricalCashSession = activeCashRegularization
    ? cashSessions.find((session) => session.id === activeCashRegularization.cash_session_id) ?? null
    : null;

  const applyCashSessionsState = (cashData: CashSession[]) => {
    setCashSessions(cashData);
    const state = resolveCashSessionState(cashData);
    setCurrentCashSession(state.currentCashSession);
    setPendingCashSession(state.pendingCashSession);
  };

  useEffect(() => {
    setActiveCashRegularization(null);
  }, [tenantId]);

  const fetchAllPages = async <T,>(queryFactory: () => any): Promise<T[]> => {
    const rows: T[] = [];
    let from = 0;

    while (true) {
      const { data, error } = await queryFactory().range(from, from + SUPABASE_PAGE_SIZE - 1);
      if (error) throw error;

      const page = (data as T[]) ?? [];
      rows.push(...page);

      if (page.length < SUPABASE_PAGE_SIZE) break;
      from += SUPABASE_PAGE_SIZE;
    }

    return rows;
  };

  // ── fetch helpers (ITEM 8: date filter; ITEM 9: join via supabase) ──
  const fetchClients = async () => {
    if (!tenantId) return [];
    return fetchAllPages<Client>(() =>
      supabase
        .from('clients')
        .select('*')
        .eq('tenant_id', tenantId)
        .is('deleted_at', null)
        .order('name'),
    );
  };

  const fetchProfessionals = async () => {
    if (!tenantId) return [];
    return fetchAllPages<Professional>(() =>
      supabase
        .from('professionals')
        .select('*')
        .eq('tenant_id', tenantId)
        .is('deleted_at', null)
        .order('nickname'),
    );
  };

  const fetchServices = async () => {
    if (!tenantId) return [];
    // ITEM 8: buscar todos os serviços (inclusive inativos) para não quebrar histórico
    return fetchAllPages<Service>(() =>
      supabase
        .from('services')
        .select('*')
        .eq('tenant_id', tenantId)
        .is('deleted_at', null)
        .order('name'),
    );
  };

  const fetchProducts = async () => {
    if (!tenantId) return [];
    return fetchAllPages<Product>(() =>
      supabase
        .from('products')
        .select('*')
        .eq('tenant_id', tenantId)
        .is('deleted_at', null)
        .order('name'),
    );
  };

  const fetchAppointments = async () => {
    if (!tenantId) return [];
    return fetchAllPages<Appointment>(() =>
      supabase
        .from('appointments')
        .select('*')
        .eq('tenant_id', tenantId)
        .is('deleted_at', null)
        .order('start_time', { ascending: false }),
    );
  };

  const fetchCash = async () => {
    if (!tenantId) return [];
    return fetchAllPages<CashSession>(() =>
      supabase
        .from('cash_sessions')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('opened_at', { ascending: false }),
    );
  };

  const fetchActiveCashRegularization = async (): Promise<CashSessionRegularization | null> => {
    if (!tenantId || !canViewCashData) return null;
    const { data, error } = await (supabase as any)
      .from('cash_session_regularizations')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('status', 'active')
      .maybeSingle();
    if (error) {
      // Compatibilidade durante o deploy: a tela continua carregando o caixa
      // legado caso a migration ainda nao tenha chegado ao ambiente remoto.
      console.error('Erro ao consultar regularizacao ativa:', error);
      return null;
    }
    return (data as CashSessionRegularization | null) ?? null;
  };

  const fetchTransactions = async () => {
    if (!tenantId) return [];
    return fetchAllPages<Transaction>(() =>
      supabase
        .from('transactions')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false }),
    );
  };

  const fetchCommissions = async () => {
    if (!tenantId) return [];
    return fetchAllPages<Commission>(() =>
      supabase
        .from('commissions')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false }),
    );
  };

  const resolveCommissionMapping = async (serviceId: string, professionalId: string) => {
    if (!tenantId) return null;

    const { data, error } = await supabase
      .from('service_professionals')
      .select('id, service_id, professional_id, commission_rate, assistant_commission_rate, settlement_kind, duration_minutes, tenant_id, created_at, updated_at')
      .eq('service_id', serviceId)
      .eq('professional_id', professionalId)
      .eq('tenant_id', tenantId)
      .order('updated_at', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Erro ao resolver vínculo de comissão:', error);
      return null;
    }

    const rows = (data as ServiceProfessional[] | null) ?? [];
    if (rows.length > 1) {
      console.warn('Mais de um vínculo encontrado para serviço/profissional. Usando o mais recente.', {
        tenantId,
        serviceId,
        professionalId,
        count: rows.length,
      });
    }

    const resolved = rows[0] ?? null;

    return resolved
      ? {
          ...resolved,
          settlement_kind: normalizeCommissionSettlementKind(
            resolved.settlement_kind,
          ),
        }
      : null;
  };

  // ── full initial load ──
  const fetchData = async () => {
    const requestId = ++fetchRequestRef.current;

    if (!user || !tenantId) {
      setClients([]);
      setProfessionals([]);
      setServices([]);
      setProducts([]);
      setAppointments([]);
      setCashSessions([]);
      setTransactions([]);
      setCommissions([]);
      setCurrentCashSession(null);
      setPendingCashSession(null);
      setActiveCashRegularization(null);
      setCashLoading(false);
      setTransactionsLoading(false);
      setLoading(false);
      lastLoadedTenantRef.current = null;
      return;
    }

    setLoading(true);
    setCashLoading(true);
    setTransactionsLoading(true);
    // Só descarta o estado atual quando o tenant muda; em recargas do mesmo
    // tenant (ex.: permissões que terminam de carregar) os dados anteriores
    // permanecem visíveis até a nova resposta chegar.
    if (lastLoadedTenantRef.current !== tenantId) {
      setAppointments([]);
      setCashSessions([]);
      setCurrentCashSession(null);
      setPendingCashSession(null);
      setActiveCashRegularization(null);
      setTransactions([]);
      setCommissions([]);
    }
    lastLoadedTenantRef.current = tenantId;

    try {
      // O caixa é resolvido em paralelo e aplicado assim que responder: a
      // tabela é pequena e o estado do caixa não pode esperar o download de
      // transações/agendamentos/comissões (potencialmente lento).
      const cashFetchPromise = (!isCleaningTenant && canViewCashData
        ? Promise.all([fetchCash(), fetchActiveCashRegularization()])
        : Promise.resolve([[] as CashSession[], null] as const))
        .then(async ([cashData, regularization]) => {
          if (requestId !== fetchRequestRef.current) return;
          applyCashSessionsState(cashData);
          setActiveCashRegularization(regularization);

          // As movimentações da sessão aberta chegam junto com o estado do
          // caixa (consulta pequena e indexada); o histórico completo continua
          // baixando em background e substitui tudo quando terminar.
          const openSessionIds = cashData
            .filter((session) => session.status === 'open')
            .map((session) => session.id);
          if (openSessionIds.length === 0) return;

          const { data: sessionTxData, error: sessionTxError } = await supabase
            .from('transactions')
            .select('*')
            .eq('tenant_id', tenantId)
            .in('cash_session_id', openSessionIds)
            .order('created_at', { ascending: false });
          if (sessionTxError) throw sessionTxError;
          if (requestId !== fetchRequestRef.current) return;

          const sessionTxs = (sessionTxData ?? []) as Transaction[];
          setTransactions((previous) => {
            const freshIds = new Set(sessionTxs.map((transaction) => transaction.id));
            return [...sessionTxs, ...previous.filter((transaction) => !freshIds.has(transaction.id))];
          });
        })
        .catch((err) => {
          console.error('Error fetching cash sessions:', err);
        })
        .finally(() => {
          if (requestId === fetchRequestRef.current) setCashLoading(false);
        });

      const [
        clientsData,
        professionalsData,
        servicesData,
        productsData,
      ] = await Promise.all([
        fetchClients(),
        fetchProfessionals(),
        isCleaningTenant ? Promise.resolve([] as Service[]) : fetchServices(),
        isCleaningTenant ? Promise.resolve([] as Product[]) : fetchProducts(),
      ]);

      if (requestId !== fetchRequestRef.current) return;

      setClients(clientsData);
      setProfessionals(professionalsData);
      setServices(servicesData);
      setProducts(productsData);
      setLoading(false);

      const backgroundResults = await Promise.allSettled([
        !isCleaningTenant && canViewScheduleData ? fetchAppointments() : Promise.resolve([] as Appointment[]),
        canViewCashData ? fetchTransactions() : Promise.resolve([] as Transaction[]),
        !isCleaningTenant && canViewCommissionsData ? fetchCommissions() : Promise.resolve([] as Commission[]),
      ]);

      if (requestId !== fetchRequestRef.current) return;

      const [appointmentsResult, transactionsResult, commissionsResult] = backgroundResults;

      if (appointmentsResult.status === 'fulfilled') {
        setAppointments(joinAppointments(appointmentsResult.value, clientsData, professionalsData, servicesData));
      } else {
        console.error('Error fetching appointments:', appointmentsResult.reason);
      }

      if (transactionsResult.status === 'fulfilled') {
        setTransactions(transactionsResult.value);
      } else {
        console.error('Error fetching transactions:', transactionsResult.reason);
      }
      setTransactionsLoading(false);

      if (commissionsResult.status === 'fulfilled') {
        setCommissions(joinCommissions(commissionsResult.value, professionalsData));
      } else {
        console.error('Error fetching commissions:', commissionsResult.reason);
      }

      await cashFetchPromise;
    } catch (err) {
      console.error('Error fetching data:', err);
      setLoading(false);
      setCashLoading(false);
      setTransactionsLoading(false);
    }
  };

  // ITEM 7: refreshData seletivo — recarrega apenas as entidades informadas
  const refreshData = async (
    entities?: Array<'clients'|'professionals'|'services'|'products'|'appointments'|'cash'|'transactions'|'commissions'>
  ) => {
    const all = !entities || entities.length === 0;
    try {
      let newClients = clients;
      let newProfs = professionals;
      let newServices = services;
      let newProducts = products;

      if (all || entities!.includes('clients')) {
        newClients = await fetchClients();
        setClients(newClients);
      }
      if (all || entities!.includes('professionals')) {
        newProfs = await fetchProfessionals();
        setProfessionals(newProfs);
      }
      if (!isCleaningTenant && (all || entities!.includes('services'))) {
        newServices = await fetchServices();
        setServices(newServices);
      }
      if (!isCleaningTenant && (all || entities!.includes('products'))) {
        newProducts = await fetchProducts();
        setProducts(newProducts);
      }
      if (!isCleaningTenant && canViewScheduleData && (all || entities!.includes('appointments'))) {
        const raw = await fetchAppointments();
        setAppointments(joinAppointments(raw, newClients, newProfs, newServices));
      }
      if (!isCleaningTenant && canViewCashData && (all || entities!.includes('cash'))) {
        const cashData = await fetchCash();
        applyCashSessionsState(cashData);
      }
      if (canViewCashData && (all || entities!.includes('transactions'))) {
        const txData = await fetchTransactions();
        setTransactions(txData);
      }
      if (!isCleaningTenant && canViewCommissionsData && (all || entities!.includes('commissions'))) {
        const commData = await fetchCommissions();
        setCommissions(joinCommissions(commData, newProfs));
      }
    } catch (err) {
      console.error('Error refreshing data:', err);
    }
  };

  // ITEM 18: Supabase Realtime — re-sincroniza entidades alteradas por outros usuários
  // Agrupa eventos do Realtime que chegam em rajada (ex.: fechar uma comanda
  // muda transactions + commissions quase ao mesmo tempo) numa única recarga,
  // em vez de uma recarga completa do histórico por evento — isso era a causa
  // da lentidão após salvar comanda, lançar saída/vale ou reprocessar comissão.
  const scheduleRealtimeRefresh = (entities: RefreshEntity[]) => {
    entities.forEach((entity) => pendingRealtimeEntitiesRef.current.add(entity));
    if (realtimeDebounceTimerRef.current) clearTimeout(realtimeDebounceTimerRef.current);
    realtimeDebounceTimerRef.current = setTimeout(() => {
      const pending = Array.from(pendingRealtimeEntitiesRef.current);
      pendingRealtimeEntitiesRef.current.clear();
      realtimeDebounceTimerRef.current = null;
      if (pending.length > 0) refreshData(pending);
    }, 600);
  };

  const setupRealtime = () => {
    if (realtimeChannelRef.current) {
      supabase.removeChannel(realtimeChannelRef.current);
    }
    const channelName = isCleaningTenant ? 'db-changes-cleaning' : 'db-changes-full';
    let channel = supabase
      .channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clients', filter: `tenant_id=eq.${tenantId}` },
        () => scheduleRealtimeRefresh(['clients']))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cash_sessions', filter: `tenant_id=eq.${tenantId}` },
        () => scheduleRealtimeRefresh(['cash']))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions', filter: `tenant_id=eq.${tenantId}` },
        () => scheduleRealtimeRefresh(isCleaningTenant ? ['transactions'] : ['transactions', 'cash']));

    if (!isCleaningTenant) {
      channel = channel
        .on('postgres_changes', { event: '*', schema: 'public', table: 'products', filter: `tenant_id=eq.${tenantId}` },
          () => scheduleRealtimeRefresh(['products']))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments', filter: `tenant_id=eq.${tenantId}` },
          () => scheduleRealtimeRefresh(['appointments']))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'commissions', filter: `tenant_id=eq.${tenantId}` },
          () => scheduleRealtimeRefresh(['commissions']));
    }

    let hasSubscribed = false;
    realtimeChannelRef.current = channel.subscribe((status) => {
      if (status === REALTIME_SUBSCRIBE_STATES.SUBSCRIBED) {
        // Reassinatura após queda de conexão: eventos podem ter sido perdidos
        // enquanto o socket esteve fora, então re-sincroniza o essencial.
        if (hasSubscribed) {
          refreshData(isCleaningTenant ? ['transactions'] : ['cash', 'transactions']);
        }
        hasSubscribed = true;
      } else if (
        status === REALTIME_SUBSCRIBE_STATES.CHANNEL_ERROR
        || status === REALTIME_SUBSCRIBE_STATES.TIMED_OUT
      ) {
        console.error('Supabase Realtime indisponível:', status);
      }
    });
  };

  useEffect(() => {
    fetchData();
  }, [
    user,
    tenantId,
    isCleaningTenant,
    canViewScheduleData,
    canViewCashData,
    canViewCommissionsData,
  ]);

  useEffect(() => {
    if (user && tenantId) setupRealtime();
    return () => {
      if (realtimeChannelRef.current) supabase.removeChannel(realtimeChannelRef.current);
      if (realtimeDebounceTimerRef.current) {
        clearTimeout(realtimeDebounceTimerRef.current);
        realtimeDebounceTimerRef.current = null;
      }
      pendingRealtimeEntitiesRef.current.clear();
    };
  }, [
    user,
    tenantId,
    isCleaningTenant,
    canViewScheduleData,
    canViewCashData,
    canViewCommissionsData,
  ]);

  // Ao voltar o foco para a aba, re-sincroniza o caixa: o socket Realtime pode
  // ter sido derrubado pelo navegador enquanto a aba esteve inativa.
  useEffect(() => {
    if (!user || !tenantId) return;
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        refreshData(['cash']);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [user, tenantId, isCleaningTenant, canViewCashData]);

  // ── guard helper ──
  const guardModify = (label = 'realizar esta operação') => {
    if (!canModify()) {
      toast.error('Operação bloqueada. Sua conta está com restrições.');
      return false;
    }
    if (!tenantId && !isSuperAdmin) {
      toast.error('Erro: Tenant não identificado.');
      return false;
    }
    return true;
  };

  const guardFinancialPermission = (allowed: boolean, message: string) => {
    if (!allowed) {
      toast.error(message);
      return false;
    }
    return true;
  };

  const toAuditJson = (value: unknown) => JSON.parse(JSON.stringify(value ?? null));

  const buildAppointmentSnapshot = (
    appointment?: Partial<Appointment> | null,
  ): Record<string, unknown> | null => {
    if (!appointment) return null;
    return {
      id: appointment.id ?? null,
      client_id: appointment.client_id ?? null,
      professional_id: appointment.professional_id ?? null,
      service_id: appointment.service_id ?? null,
      start_time: appointment.start_time ?? null,
      end_time: appointment.end_time ?? null,
      status: appointment.status ?? null,
      notes: appointment.notes ?? null,
      total_value: appointment.total_value ?? null,
      booking_source: appointment.booking_source ?? null,
      client_user_id: appointment.client_user_id ?? null,
      deleted_at: (appointment as { deleted_at?: string | null }).deleted_at ?? null,
    };
  };

  const recordAppointmentEvent = async (params: {
    appointmentId: string;
    eventType: AppointmentEventType;
    previousStatus?: Appointment['status'] | null;
    nextStatus?: Appointment['status'] | null;
    snapshot?: Partial<Appointment> | null;
    metadata?: Record<string, unknown> | null;
  }) => {
    if (!tenantId || !params.appointmentId) return;
    const { error } = await (supabase as any)
      .from('appointment_events')
      .insert({
        tenant_id: tenantId,
        appointment_id: params.appointmentId,
        event_type: params.eventType,
        previous_status: params.previousStatus ?? null,
        next_status: params.nextStatus ?? null,
        snapshot: buildAppointmentSnapshot(params.snapshot),
        metadata: toAuditJson(params.metadata),
        created_by: user?.id ?? null,
      });

    if (error) {
      console.error('Erro ao registrar histórico do agendamento:', error);
    }
  };

  const recordFinancialAudit = async (params: {
    actionType: FinancialAuditAction;
    entityType: 'cash_session' | 'transaction' | 'appointment' | 'commission';
    description: string;
    transactionId?: string | null;
    cashSessionId?: string | null;
    appointmentId?: string | null;
    commissionId?: string | null;
    beforeState?: Record<string, unknown> | null;
    afterState?: Record<string, unknown> | null;
    metadata?: Record<string, unknown> | null;
  }) => {
    if (!tenantId) return;
    const { error } = await (supabase as any)
      .from('financial_audit_logs')
      .insert({
        tenant_id: tenantId,
        transaction_id: params.transactionId ?? null,
        cash_session_id: params.cashSessionId ?? null,
        appointment_id: params.appointmentId ?? null,
        commission_id: params.commissionId ?? null,
        action_type: params.actionType,
        entity_type: params.entityType,
        description: params.description,
        before_state: toAuditJson(params.beforeState),
        after_state: toAuditJson(params.afterState),
        metadata: toAuditJson(params.metadata),
        created_by: user?.id ?? null,
      });

    if (error) {
      console.error('Erro ao registrar auditoria financeira:', error);
    }
  };

  // Garante um estado de caixa confiável antes de guards de fluxo (fechar
  // comanda, etc.): se a sincronização inicial ainda não terminou, consulta o
  // banco diretamente em vez de acusar "caixa fechado" com dados incompletos.
  const ensureCashSessionState = async () => {
    if (!cashLoading) {
      return { currentCashSession, pendingCashSession };
    }
    try {
      const cashData = await fetchCash();
      applyCashSessionsState(cashData);
      setCashLoading(false);
      return resolveCashSessionState(cashData);
    } catch (err) {
      console.error('Error fetching cash sessions:', err);
      return { currentCashSession, pendingCashSession };
    }
  };

  const getCashOperationTargetSession = (
    options?: {
      allowPendingSession?: boolean;
      sessionId?: string;
      permissionMessage?: string;
      requireActiveCash?: boolean;
    },
  ) => {
    const explicitSession = options?.sessionId
      ? cashSessions.find((session) => session.id === options.sessionId)
      : null;

    const candidateSession = explicitSession
      ?? currentCashSession
      ?? (options?.allowPendingSession ? pendingCashSession : null)
      ?? getLatestOpenCashSession(cashSessions);

    if (!candidateSession) {
      if (options?.requireActiveCash ?? true) {
        toast.error('Abra o caixa antes de continuar.');
      }
      return null;
    }

    if (isSessionFromPreviousDay(candidateSession) && !options?.allowPendingSession) {
      toast.error('Existe um caixa pendente de data anterior. Regularize o fechamento antes de lançar novas operações.');
      return null;
    }

    if (
      isSessionFromPreviousDay(candidateSession)
      && !canPerformAdvancedFinancialOps
      && (options?.allowPendingSession || options?.sessionId)
    ) {
      toast.error(options?.permissionMessage ?? 'Somente usuários financeiros podem encerrar ou ajustar caixas pendentes.');
      return null;
    }

    return candidateSession;
  };

  const getBillingTargetSession = (
    options?: {
      cashSessionId?: string | null;
      appointmentDate?: string | null;
      requireActiveCash?: boolean;
    },
  ) => {
    const explicitSession = options?.cashSessionId
      ? cashSessions.find((session) => session.id === options.cashSessionId)
      : null;
    const historicalTargetSession = explicitSession ?? selectedHistoricalCashSession;

    if (historicalTargetSession) {
      if (!canPerformAdvancedFinancialOps) {
        toast.error('Somente administradores ou usuários financeiros podem regularizar comandas em caixas históricos.');
        return null;
      }
      if (
        historicalTargetSession.status === 'closed'
        && activeCashRegularization?.cash_session_id !== historicalTargetSession.id
      ) {
        toast.error('Inicie a regularização deste caixa antes de lançar a comanda antiga.');
        return null;
      }
      return historicalTargetSession;
    }

    const sameDayOpenSession = findCashSessionByBusinessDate(
      cashSessions.filter((session) => session.status === 'open'),
      options?.appointmentDate,
    );

    const candidateSession = sameDayOpenSession
      ?? currentCashSession
      ?? (isAdminUser ? pendingCashSession : null)
      ?? getLatestOpenCashSession(cashSessions);

    if (!candidateSession) {
      if (options?.requireActiveCash ?? true) {
        toast.error('Abra o caixa antes de receber pagamentos.');
      }
      return null;
    }

    if (isSessionFromPreviousDay(candidateSession) && !isAdminUser) {
      toast.error('Existe um caixa pendente de data anterior. Regularize o fechamento antes de receber novas comandas.');
      return null;
    }

    return candidateSession;
  };

  const startHistoricalCashRegularization = async (
    sessionId: string,
    reason = 'Regularizacao retroativa de comanda antiga',
  ): Promise<CashSessionRegularization | null> => {
    if (!canPerformAdvancedFinancialOps) {
      toast.error('Somente administradores ou usuários financeiros podem regularizar caixas antigos.');
      return null;
    }

    const targetSession = cashSessions.find((session) => session.id === sessionId) ?? null;
    if (!targetSession) {
      toast.error('Não foi possível localizar o caixa selecionado para regularização.');
      return null;
    }
    if (targetSession.status !== 'closed') {
      toast.error('Somente caixas fechados podem entrar em regularização retroativa.');
      return null;
    }
    if (activeCashRegularization && activeCashRegularization.cash_session_id !== sessionId) {
      toast.error('Já existe outra regularização retroativa ativa para este cliente.');
      return null;
    }

    const { data, error } = await (supabase as any).rpc('start_cash_session_regularization', {
      _cash_session_id: sessionId,
      _reason: reason,
    });
    if (error) {
      console.error('Erro ao iniciar regularização retroativa:', error);
      toast.error(error.message || 'Não foi possível iniciar a regularização retroativa.');
      return null;
    }

    const regularization = (data?.id ? data : data?.[0]) as CashSessionRegularization | undefined;
    if (!regularization) {
      toast.error('A regularização não retornou um identificador válido.');
      return null;
    }
    setActiveCashRegularization(regularization);
    toast.success('Regularização retroativa iniciada.');
    return regularization;
  };

  const finishHistoricalCashRegularization = async (
    closingBalance: number,
    divergenceReason?: string,
  ): Promise<boolean> => {
    if (!activeCashRegularization) {
      toast.error('Não existe regularização retroativa ativa.');
      return false;
    }
    const { data, error } = await (supabase as any).rpc('finish_cash_session_regularization', {
      _regularization_id: activeCashRegularization.id,
      _closing_balance: closingBalance,
      _divergence_reason: divergenceReason ?? null,
    });
    if (error) {
      console.error('Erro ao finalizar regularização retroativa:', error);
      toast.error(error.message || 'Não foi possível finalizar a regularização retroativa.');
      return false;
    }
    setActiveCashRegularization(null);
    await refreshData(['cash']);
    toast.success('Regularização retroativa finalizada.');
    return Boolean(data);
  };

  const cancelHistoricalCashRegularization = async (
    reason = 'Regularização encerrada pelo operador',
  ): Promise<boolean> => {
    if (!activeCashRegularization) return true;
    const { error } = await (supabase as any).rpc('cancel_cash_session_regularization', {
      _regularization_id: activeCashRegularization.id,
      _reason: reason,
    });
    if (error) {
      console.error('Erro ao cancelar regularização retroativa:', error);
      toast.error(error.message || 'Não foi possível encerrar a regularização retroativa.');
      return false;
    }
    setActiveCashRegularization(null);
    toast.success('Regularização retroativa encerrada.');
    return true;
  };

  // Compatibilidade com os componentes existentes: o antigo seletor local
  // agora inicia uma operação persistida no banco, e não apenas estado React.
  const selectHistoricalCashSession = (sessionId: string | null, reason?: string) => {
    if (!sessionId) {
      void cancelHistoricalCashRegularization();
      return;
    }
    void startHistoricalCashRegularization(sessionId, reason);
  };

  const clearHistoricalCashSession = () => {
    void cancelHistoricalCashRegularization();
  };

  const createReversalTransaction = async (
    originalTransaction: Transaction,
    options?: {
      description?: string;
      category?: string;
      paymentMethod?: Transaction['payment_method'];
      referenceId?: string | null;
      referenceType?: string | null;
      amount?: number;
      cashSessionId?: string | null;
      reversalOfTransactionId?: string | null;
    },
  ) => {
    const targetSession = options?.cashSessionId || originalTransaction.cash_session_id
      ? getBillingTargetSession({
          cashSessionId: options?.cashSessionId ?? originalTransaction.cash_session_id,
          requireActiveCash: false,
        })
      : getCashOperationTargetSession({
          allowPendingSession: true,
          permissionMessage: 'Somente usuários financeiros podem estornar movimentos em caixas pendentes.',
        });

    if (!tenantId || !user?.id || !targetSession) {
      throw new Error('Abra o caixa antes de registrar o estorno.');
    }

    const movementTimestamp = getSessionMovementTimestamp(targetSession);

    const reversalPayload = {
      cash_session_id: targetSession.id,
      type: originalTransaction.type === 'income' ? 'expense' : 'income',
      category: options?.category ?? `Estorno ${originalTransaction.category}`,
      description: options?.description
        ?? `Estorno financeiro: ${originalTransaction.description ?? originalTransaction.category}`,
      amount: options?.amount ?? Number(originalTransaction.amount),
      payment_method: options?.paymentMethod ?? originalTransaction.payment_method ?? 'other',
      reference_id: options?.referenceId ?? originalTransaction.id,
      reference_type: options?.referenceType ?? 'transaction_reversal',
      reversal_of_transaction_id: options?.reversalOfTransactionId ?? originalTransaction.id,
      created_by: user.id,
      tenant_id: tenantId,
      ...(movementTimestamp ? { created_at: movementTimestamp } : {}),
    };

    const { data, error } = await supabase
      .from('transactions')
      .insert(reversalPayload)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return data as Transaction;
  };

  const markTransactionAsReversed = async (
    transactionId: string,
    reversalTransactionId: string,
    reason?: string,
    referenceType?: string,
  ) => {
    const updates: Record<string, unknown> = {
      reversed_at: new Date().toISOString(),
      reversed_by: user?.id ?? null,
      reversal_transaction_id: reversalTransactionId,
      reversal_reason: reason ?? null,
    };

    if (referenceType) {
      updates.reference_type = referenceType;
    }

    const { error } = await supabase
      .from('transactions')
      .update(updates)
      .eq('id', transactionId)
      .eq('tenant_id', tenantId)
      .is('reversed_at', null);

    if (error) {
      throw error;
    }
  };

  // ── CLIENT ACTIONS ──────────────────────────────────────────────────────
  const addClient = async (clientData: Omit<Client, 'id' | 'created_at'>) => {
    if (!guardModify()) return null;
    const { data, error } = await supabase
      .from('clients')
      .insert({ ...clientData, tenant_id: tenantId })
      .select()
      .single();
    if (error) { toast.error('Erro ao cadastrar cliente.'); return null; }
    // ITEM 7: optimistic update
    setClients(prev => [...prev, data as Client].sort((a, b) => a.name.localeCompare(b.name)));
    toast.success('Cliente cadastrado com sucesso!');
    return data as Client;
  };

  const updateClient = async (id: string, data: Partial<Client>) => {
    if (!guardModify()) return;
    const { error } = await supabase.from('clients').update(data).eq('id', id).eq('tenant_id', tenantId);
    if (error) { toast.error('Erro ao atualizar cliente.'); return; }
    setClients(prev => prev.map(c => c.id === id ? { ...c, ...data } : c));
    toast.success('Cliente atualizado!');
  };

  // ITEM 16: soft delete
  const deleteClient = async (id: string) => {
    if (!guardModify()) return;
    const { error } = await supabase
      .from('clients')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
      .eq('tenant_id', tenantId);
    if (error) { toast.error('Erro ao remover cliente.'); return; }
    setClients(prev => prev.filter(c => c.id !== id));
    toast.success('Cliente removido.');
  };

  // ── PROFESSIONAL ACTIONS ────────────────────────────────────────────────
  const addProfessional = async (professionalData: Omit<Professional, 'id' | 'created_at'>) => {
    if (!guardModify()) return null;
    const { data, error } = await supabase
      .from('professionals')
      .insert({ ...professionalData, tenant_id: tenantId })
      .select()
      .single();
    if (error) { toast.error('Erro ao cadastrar profissional.'); return null; }
    setProfessionals(prev => [...prev, data as Professional].sort((a, b) => a.nickname.localeCompare(b.nickname)));
    toast.success('Profissional cadastrado!');
    return data as Professional;
  };

  const updateProfessional = async (id: string, data: Partial<Professional>) => {
    if (!guardModify()) return;
    const { error } = await supabase.from('professionals').update(data).eq('id', id).eq('tenant_id', tenantId);
    if (error) { toast.error('Erro ao atualizar profissional.'); return; }
    setProfessionals(prev => prev.map(p => p.id === id ? { ...p, ...data } : p));
    toast.success('Profissional atualizado!');
  };

  const deleteProfessional = async (id: string) => {
    if (!guardModify()) return;
    const { error } = await supabase
      .from('professionals')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
      .eq('tenant_id', tenantId);
    if (error) { toast.error('Erro ao remover profissional.'); return; }
    setProfessionals(prev => prev.filter(p => p.id !== id));
    toast.success('Profissional removido.');
  };

  // ── SERVICE ACTIONS ─────────────────────────────────────────────────────
  const addService = async (serviceData: Omit<Service, 'id' | 'created_at'>) => {
    if (!guardModify()) return null;
    const { data, error } = await supabase
      .from('services')
      .insert({ ...serviceData, tenant_id: tenantId })
      .select()
      .single();
    if (error) { toast.error('Erro ao cadastrar serviço.'); return null; }
    setServices(prev => [...prev, data as Service].sort((a, b) => a.name.localeCompare(b.name)));
    toast.success('Serviço cadastrado!');
    return data as Service;
  };

  const updateService = async (id: string, data: Partial<Service>) => {
    if (!guardModify()) return;
    const { error } = await supabase.from('services').update(data).eq('id', id).eq('tenant_id', tenantId);
    if (error) { toast.error('Erro ao atualizar serviço.'); return; }
    setServices(prev => prev.map(s => s.id === id ? { ...s, ...data } : s));
    toast.success('Serviço atualizado!');
  };

  const deleteService = async (id: string) => {
    if (!guardModify()) return;
    const { error } = await supabase
      .from('services')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
      .eq('tenant_id', tenantId);
    if (error) { toast.error('Erro ao remover serviço.'); return; }
    setServices(prev => prev.filter(s => s.id !== id));
    toast.success('Serviço removido.');
  };

  // ── PRODUCT ACTIONS ─────────────────────────────────────────────────────
  const addProduct = async (productData: Omit<Product, 'id' | 'created_at' | 'updated_at'>) => {
    if (!guardModify()) return null;
    const { data, error } = await supabase
      .from('products')
      .insert({ ...productData, tenant_id: tenantId })
      .select()
      .single();
    if (error) { toast.error('Erro ao cadastrar produto.'); return null; }
    setProducts(prev => [...prev, data as Product].sort((a, b) => a.name.localeCompare(b.name)));
    toast.success('Produto cadastrado!');
    return data as Product;
  };

  const updateProduct = async (id: string, data: Partial<Product>) => {
    if (!guardModify()) return;
    const { error } = await supabase.from('products').update(data).eq('id', id).eq('tenant_id', tenantId);
    if (error) { toast.error('Erro ao atualizar produto.'); return; }
    setProducts(prev => prev.map(p => p.id === id ? { ...p, ...data } : p));
    toast.success('Produto atualizado!');
  };

  const deleteProduct = async (id: string) => {
    if (!guardModify()) return;
    const { error } = await supabase
      .from('products')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
      .eq('tenant_id', tenantId);
    if (error) { toast.error('Erro ao remover produto.'); return; }
    setProducts(prev => prev.filter(p => p.id !== id));
    toast.success('Produto removido.');
  };

  // ITEM 5: updateProductStock cria stock_movement em vez de update direto
  const updateProductStock = async (id: string, newQuantity: number, reason = 'Ajuste manual') => {
    if (!guardModify()) return;
    const product = products.find(p => p.id === id);
    if (!product) return;
    const previousStock = product.stock_quantity;
    const quantityDelta = newQuantity - previousStock;
    const movementType = quantityDelta >= 0 ? 'adjustment' : 'adjustment';

    const { error } = await supabase.from('stock_movements').insert({
      product_id: id,
      movement_type: movementType,
      quantity: Math.abs(quantityDelta),
      previous_stock: previousStock,
      new_stock: newQuantity,
      reason,
      tenant_id: tenantId,
    });
    if (error) { toast.error('Erro ao ajustar estoque.'); return; }
    // Trigger do banco atualiza stock_quantity automaticamente (migration 002)
    setProducts(prev => prev.map(p => p.id === id ? { ...p, stock_quantity: newQuantity } : p));
    toast.success('Estoque ajustado!');
  };

  // ── APPOINTMENT ACTIONS ─────────────────────────────────────────────────
  const addAppointment = async (appointmentData: Omit<Appointment, 'id' | 'created_at'>) => {
    if (!guardModify()) return null;
    const { data, error } = await supabase
      .from('appointments')
      .insert({
        client_id: appointmentData.client_id,
        professional_id: appointmentData.professional_id,
        service_id: appointmentData.service_id,
        start_time: appointmentData.start_time,
        end_time: appointmentData.end_time,
        status: appointmentData.status,
        notes: appointmentData.notes,
        total_value: appointmentData.total_value,
        tenant_id: tenantId,
      })
      .select()
      .single();
    if (error) { toast.error('Erro ao criar agendamento.'); return null; }
    const joined = joinAppointments([data as Appointment], clients, professionals, services)[0];
    setAppointments(prev => [joined, ...prev]);
    await recordAppointmentEvent({
      appointmentId: joined.id,
      eventType: 'created',
      nextStatus: joined.status,
      snapshot: joined,
      metadata: {
        source: 'schedule',
      },
    });
    toast.success('Agendamento criado!');
    return joined;
  };

  const updateAppointment = async (id: string, data: Partial<Appointment>) => {
    if (!guardModify()) return;
    const previousAppointment = appointments.find((appointment) => appointment.id === id) ?? null;
    const updateData: Record<string, unknown> = {};
    if (data.status !== undefined)          updateData.status = data.status;
    if (data.notes !== undefined)           updateData.notes = data.notes;
    if (data.total_value !== undefined)     updateData.total_value = data.total_value;
    if (data.end_time !== undefined)        updateData.end_time = data.end_time;
    if (data.start_time !== undefined)      updateData.start_time = data.start_time;
    if (data.professional_id !== undefined) updateData.professional_id = data.professional_id;
    if (data.service_id !== undefined)      updateData.service_id = data.service_id;
    const { error } = await supabase.from('appointments').update(updateData).eq('id', id).eq('tenant_id', tenantId);
    if (error) { toast.error('Erro ao atualizar agendamento.'); return; }
    const nextAppointment = previousAppointment ? { ...previousAppointment, ...data } : { id, ...data };
    setAppointments(prev => prev.map(a => {
      if (a.id !== id) return a;
      const updated = { ...a, ...data };
      return joinAppointments([updated], clients, professionals, services)[0];
    }));
    await recordAppointmentEvent({
      appointmentId: id,
      eventType: 'updated',
      previousStatus: previousAppointment?.status ?? null,
      nextStatus: (nextAppointment as Appointment).status ?? previousAppointment?.status ?? null,
      snapshot: nextAppointment as Partial<Appointment>,
      metadata: {
        changed_fields: Object.keys(updateData),
        before: buildAppointmentSnapshot(previousAppointment),
        after: buildAppointmentSnapshot(nextAppointment as Partial<Appointment>),
      },
    });
  };

  // ITEM 4: não deleta comissões manualmente — FK ON DELETE SET NULL já trata isso
  const deleteAppointment = async (id: string) => {
    if (!guardModify()) return;
    const previousAppointment = appointments.find((appointment) => appointment.id === id) ?? null;
    // Soft delete para preservar histórico
    const { error } = await supabase
      .from('appointments')
      .update({ deleted_at: new Date().toISOString(), status: 'cancelled' })
      .eq('id', id)
      .eq('tenant_id', tenantId);
    if (error) { toast.error('Erro ao remover agendamento.'); return; }
    setAppointments(prev => prev.filter(a => a.id !== id));
    await recordAppointmentEvent({
      appointmentId: id,
      eventType: 'cancelled',
      previousStatus: previousAppointment?.status ?? null,
      nextStatus: 'cancelled',
      snapshot: previousAppointment ? { ...previousAppointment, status: 'cancelled', deleted_at: new Date().toISOString() } as Partial<Appointment> : { id, status: 'cancelled' },
      metadata: {
        soft_delete: true,
      },
    });
    toast.success('Agendamento removido.');
  };

  // ITEM 2: cria transação de estorno em vez de deletar
  const refundAppointment = async (id: string): Promise<boolean> => {
    if (!guardModify()) return false;
    if (!guardFinancialPermission(canRefundBills, 'Você não tem permissão para estornar comandas.')) return false;
    const appointment = appointments.find(a => a.id === id);
    if (!appointment) return false;

    const historicalSession = selectedHistoricalCashSession;
    if (historicalSession && !guardFinancialPermission(
      canPerformAdvancedFinancialOps,
      'Somente administradores ou usuários financeiros podem reabrir comandas em regularização histórica.',
    )) return false;

    const activeSession = historicalSession
      ? getBillingTargetSession({
          cashSessionId: historicalSession.id,
          requireActiveCash: false,
        })
      : getCashOperationTargetSession({
          allowPendingSession: false,
          permissionMessage: 'Existe um caixa pendente de data anterior. Regularize-o antes de registrar estornos.',
        });

    if (!activeSession) {
      toast.error('Abra o caixa antes de estornar e reabrir uma comanda.');
      return false;
    }

    // Fazemos todas as validações antes de alterar o status. Isso evita que
    // uma comissão já paga ou uma falha de leitura deixe a comanda parcialmente
    // reaberta.
    const { data: persistedAppointment, error: statusCheckError } = await supabase
      .from('appointments')
      .select('status')
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (statusCheckError || !persistedAppointment) {
      console.error('Erro ao verificar status da comanda antes do estorno:', statusCheckError);
      toast.error('Não foi possível confirmar o estorno. Verifique suas permissões e tente novamente.');
      return false;
    }

    if (persistedAppointment.status !== 'completed') {
      toast.warning('A comanda já está aberta ou não pode ser estornada neste status.');
      return false;
    }

    const { data: relatedCommissionRows, error: commissionReadError } = await supabase
      .from('commissions')
      .select('*')
      .eq('appointment_id', id)
      .eq('tenant_id', tenantId);

    if (commissionReadError) {
      console.error('Erro ao carregar comissões da comanda:', commissionReadError);
      toast.error('Não foi possível validar as comissões vinculadas antes do estorno.');
      return false;
    }

    const relatedCommissions = (relatedCommissionRows as Commission[] | null) ?? [];
    const paidCommissions = relatedCommissions.filter((commission) => commission.status === 'paid');
    if (paidCommissions.length > 0) {
      toast.error('Estorne primeiro os pagamentos de comissão vinculados a esta comanda.');
      return false;
    }

    const { data: activePaymentRows, error: activePaymentError } = await supabase
      .from('transactions')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('reference_id', id)
      .eq('reference_type', 'appointment')
      .eq('type', 'income')
      .is('reversed_at', null)
      .order('created_at', { ascending: true });

    if (activePaymentError) {
      console.error('Erro ao carregar pagamentos ativos da comanda:', activePaymentError);
      toast.error('Não foi possível localizar os pagamentos da comanda para estorno.');
      return false;
    }

    const activePaymentTransactions = (activePaymentRows as Transaction[] | null) ?? [];

    const { data: refundRows, error: reopenError } = await supabase
      .from('appointments')
      .update({ status: 'in_progress' })
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .eq('status', 'completed')
      .select('id');

    if (reopenError) {
      console.error('Erro ao reabrir a comanda:', reopenError);
      toast.error(reopenError.message || 'Erro ao reabrir a comanda.');
      return false;
    }

    const wasReopenedNow = (refundRows?.length ?? 0) > 0;

    if (!wasReopenedNow) {
      // Outra sessão pode ter reaberto a comanda entre o pré-voo e o UPDATE.
      // Não seguimos com estornos nesse caso para evitar duplicidade.
      toast.warning('A comanda foi alterada por outro usuário. Atualize a tela e tente novamente.');
      return false;
    }

    const { error: deleteCommissionError } = await supabase.from('commissions')
      .delete()
      .eq('appointment_id', id)
      .eq('tenant_id', tenantId)
      .eq('status', 'pending');

    if (deleteCommissionError) {
      console.error('Erro ao remover comissão da comanda estornada:', deleteCommissionError);
      toast.error('Comanda reaberta, mas houve erro ao remover a comissão vinculada. Verifique manualmente.');
    }

    const insertedRefundTransactions: Transaction[] = [];
    for (const paymentTransaction of activePaymentTransactions) {
      try {
        const refundTx = await createReversalTransaction(paymentTransaction, {
          category: 'Estorno de Comanda',
          description: `Estorno de comanda: ${paymentTransaction.description ?? `${appointment.service?.name ?? 'Serviço'} - ${appointment.client?.name ?? 'Cliente'}`}`,
          paymentMethod: paymentTransaction.payment_method,
          referenceId: id,
          referenceType: 'refund',
          amount: Number(paymentTransaction.amount),
          cashSessionId: activeSession.id,
        });

        insertedRefundTransactions.push(refundTx);
        await markTransactionAsReversed(paymentTransaction.id, refundTx.id, 'Estorno completo da comanda.', 'appointment_refunded');
        await recordFinancialAudit({
          actionType: 'appointment_fully_refunded',
          entityType: 'transaction',
          description: `Pagamento da comanda estornado: ${paymentTransaction.description ?? 'Pagamento do atendimento'}`,
          transactionId: paymentTransaction.id,
          cashSessionId: refundTx.cash_session_id ?? paymentTransaction.cash_session_id ?? activeSession.id,
          appointmentId: id,
          beforeState: paymentTransaction as unknown as Record<string, unknown>,
          afterState: {
            reversed_at: new Date().toISOString(),
            reversal_transaction_id: refundTx.id,
            reversal_reason: 'Estorno completo da comanda.',
          },
          metadata: {
            reversal_transaction_id: refundTx.id,
          },
        });
      } catch (refundError) {
        console.error('Erro ao estornar pagamento da comanda:', refundError);
        toast.error('A comanda foi reaberta, mas houve erro ao estornar um ou mais pagamentos. Verifique manualmente.');
        return false;
      }
    }

    setAppointments(prev => prev.map(a => a.id === id ? { ...a, status: 'in_progress' } : a));
    if (!deleteCommissionError) {
      setCommissions(prev => prev.filter(c => !(c.appointment_id === id && c.status === 'pending')));
    }
    if (insertedRefundTransactions.length > 0) {
      setTransactions(prev => [...insertedRefundTransactions, ...prev]);
    }

    await recordAppointmentEvent({
      appointmentId: id,
      eventType: 'reopened',
      previousStatus: 'completed',
      nextStatus: 'in_progress',
      snapshot: { ...appointment, status: 'in_progress' },
      metadata: {
        reason: 'full_refund',
        reversed_payment_count: activePaymentTransactions.length,
        historical_cash_regularization: Boolean(historicalSession),
        cash_business_date: getBusinessDateKey(activeSession.opened_at),
      },
    });

    await recordFinancialAudit({
      actionType: 'appointment_fully_refunded',
      entityType: 'appointment',
      description: `Comanda reaberta após estorno completo${appointment.client?.name ? ` de ${appointment.client.name}` : ''}.`,
      appointmentId: id,
      cashSessionId: activeSession.id,
      beforeState: buildAppointmentSnapshot(appointment),
      afterState: buildAppointmentSnapshot({ ...appointment, status: 'in_progress' }),
      metadata: {
        reversed_payment_count: activePaymentTransactions.length,
        historical_cash_regularization: Boolean(historicalSession),
        cash_business_date: getBusinessDateKey(activeSession.opened_at),
      },
    });

    if (!deleteCommissionError) {
      toast.success(historicalSession
        ? 'Pagamento estornado. A comanda foi reaberta para manutenção no caixa histórico.'
        : 'Pagamento estornado e comanda reaberta com sucesso.');
    }
    return true;
  };

  // ── APPOINTMENT SERVICES (múltiplos serviços por agendamento) ────────────
  const fetchAppointmentServices = async (appointmentId: string): Promise<AppointmentServiceRow[]> => {
    if (!tenantId) return [];
    const { data, error } = await supabase
      .from('appointment_services')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('appointment_id', appointmentId)
      .order('position', { ascending: true });
    if (error) {
      console.error('Erro ao carregar serviços do agendamento:', error);
      return [];
    }
    return (data as AppointmentServiceRow[]) ?? [];
  };

  const saveAppointmentServices = async (appointmentId: string, lines: AppointmentServiceLine[]) => {
    if (!tenantId) return;
    // Substitui o conjunto de linhas do agendamento (delete + insert).
    const { error: deleteError } = await supabase
      .from('appointment_services')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('appointment_id', appointmentId);
    if (deleteError) {
      console.error('Erro ao limpar serviços do agendamento:', deleteError);
      throw deleteError;
    }
    if (lines.length === 0) return;
    const payload = lines.map((line, index) => ({
      tenant_id: tenantId,
      appointment_id: appointmentId,
      service_id: line.service_id,
      professional_id: line.professional_id,
      start_time: line.start_time ?? null,
      end_time: line.end_time ?? null,
      value: line.value,
      position: index,
    }));
    const { error: insertError } = await supabase.from('appointment_services').insert(payload);
    if (insertError) {
      console.error('Erro ao salvar serviços do agendamento:', insertError);
      throw insertError;
    }
  };

  // ── CLIENT LEDGER (pendências e créditos do cliente) ────────────────────
  const fetchClientBalances = async (clientId: string): Promise<ClientBalances> => {
    const empty: ClientBalances = { pendingTotal: 0, creditTotal: 0, entries: [] };
    if (!tenantId || !clientId) return empty;
    const { data, error } = await supabase
      .from('client_ledger_entries')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('client_id', clientId)
      .order('created_at', { ascending: true });
    if (error) {
      console.error('Erro ao carregar saldos do cliente:', error);
      return empty;
    }
    const entries = (data as ClientLedgerEntry[]) ?? [];
    const openRemaining = (entry: ClientLedgerEntry) =>
      Math.max(0, Number(entry.amount) - Number(entry.settled_amount ?? 0));
    return {
      pendingTotal: entries.filter((e) => e.entry_type === 'debt' && e.status === 'open').reduce((s, e) => s + openRemaining(e), 0),
      creditTotal: entries.filter((e) => e.entry_type === 'credit' && e.status === 'open').reduce((s, e) => s + openRemaining(e), 0),
      entries,
    };
  };

  // Consome créditos abertos do cliente (FIFO) até o valor pedido.
  const consumeClientCredit = async (clientId: string, amount: number): Promise<boolean> => {
    const balances = await fetchClientBalances(clientId);
    if (balances.creditTotal + 0.009 < amount) {
      toast.error('Crédito do cliente insuficiente para o valor informado.');
      return false;
    }
    let remaining = amount;
    for (const entry of balances.entries) {
      if (remaining <= 0.009) break;
      if (entry.entry_type !== 'credit' || entry.status !== 'open') continue;
      const available = Math.max(0, Number(entry.amount) - Number(entry.settled_amount ?? 0));
      if (available <= 0.009) continue;
      const take = Math.min(available, remaining);
      const newSettled = Number(entry.settled_amount ?? 0) + take;
      const fully = newSettled >= Number(entry.amount) - 0.009;
      const { error } = await supabase
        .from('client_ledger_entries')
        .update({
          settled_amount: newSettled,
          status: fully ? 'settled' : 'open',
          settled_at: fully ? new Date().toISOString() : null,
        })
        .eq('id', entry.id)
        .eq('tenant_id', tenantId);
      if (error) {
        console.error('Erro ao consumir crédito do cliente:', error);
        return false;
      }
      remaining -= take;
    }
    return remaining <= 0.009;
  };

  // Registra os pagamentos (divididos) de uma comanda: transações no caixa
  // para os métodos reais, dívida no razão para a parcela pendente, consumo de
  // crédito para a parcela paga com saldo, e depósito de crédito opcional.
  const registerBillPayments = async (params: {
    appointmentId: string;
    clientId?: string | null;
    clientName?: string;
    lines: BillPaymentLine[];
    currentDue: number;
    includePreviousDebts?: boolean;
    idempotencyKey?: string | null;
    creditDeposit?: { method: 'cash' | 'pix' | 'credit_card' | 'debit_card'; amount: number } | null;
    cashSessionId?: string | null;
    appointmentDate?: string | null;
  }): Promise<boolean> => {
    if (!tenantId) return false;
    const { data: result, error } = await supabase.rpc('register_client_bill_payment' as never, {
      _appointment_id: params.appointmentId,
      _cash_session_id: params.cashSessionId ?? null,
      _current_due: params.currentDue,
      _include_previous_debts: params.includePreviousDebts ?? false,
      _lines: params.lines,
      _credit_deposit_amount: params.creditDeposit?.amount ?? 0,
      _credit_deposit_method: params.creditDeposit?.method ?? null,
      _idempotency_key: params.idempotencyKey ?? null,
    } as never);

    if (error) {
      console.error('Erro ao registrar pagamento atômico da comanda:', error);
      toast.error(error.message || 'Não foi possível registrar o pagamento da comanda.');
      return false;
    }

    const batch = (result ?? {}) as {
      transaction_ids?: string[];
      pending_total?: number;
      previous_debt_settled?: number;
      current_debt_created?: number;
      idempotent_replay?: boolean;
    };

    // A operação já foi confirmada no banco; atualiza apenas as linhas que
    // foram criadas para que o caixa reflita o resultado sem recarga total.
    const transactionIds = Array.isArray(batch.transaction_ids) ? batch.transaction_ids : [];
    if (transactionIds.length > 0) {
      const { data: newTransactions } = await supabase
        .from('transactions')
        .select('*')
        .in('id', transactionIds)
        .eq('tenant_id', tenantId);
      if (newTransactions?.length) {
        setTransactions((previous) => [
          ...(newTransactions as Transaction[]),
          ...previous.filter((transaction) => !transactionIds.includes(transaction.id)),
        ]);
      }
    }

    if (!batch.idempotent_replay) {
      await recordAppointmentEvent({
        appointmentId: params.appointmentId,
        eventType: 'payment_registered',
        snapshot: appointments.find((appointment) => appointment.id === params.appointmentId) ?? { id: params.appointmentId },
        metadata: {
          paid_lines: params.lines,
          credit_deposit: params.creditDeposit ?? null,
          pending_amount: batch.pending_total ?? null,
          previous_debt_settled: batch.previous_debt_settled ?? 0,
          current_debt_created: batch.current_debt_created ?? 0,
          cash_session_id: params.cashSessionId ?? null,
          idempotent_replay: false,
        },
      });
    }

    return true;
  };

  // ITEM 3: completeAppointment com tratamento de erros e rollback parcial
  const completeAppointment = async (
    id: string,
    paymentMethod: string,
    overrides?: Partial<Appointment>,
    options?: {
      skipCommission?: boolean;
      commissionLines?: AppointmentServiceLine[];
      skipTransaction?: boolean;
      cashSessionId?: string | null;
      movementDate?: string | null;
    },
  ) => {
    if (!guardModify()) return null;
    if (!guardFinancialPermission(canCloseBill, 'Você não tem permissão para receber e encerrar comandas.')) return null;
    // Admin pode faturar comandas mesmo com caixa pendente de data anterior:
    // o movimento entra na sessão aberta com a data do próprio lançamento.
    if (pendingCashSession && !canPerformAdvancedFinancialOps && !activeCashRegularization) {
      toast.error('Existe um caixa pendente de data anterior. Regularize o fechamento antes de receber novas comandas.');
      return null;
    }
    const existingAppointment = appointments.find(a => a.id === id);
    if (!existingAppointment) return null;
    const appointment = { ...existingAppointment, ...overrides };

    const commissionLines: AppointmentServiceLine[] = options?.commissionLines?.length
      ? options.commissionLines
      : (appointment.professional_id && appointment.service_id && appointment.total_value
          ? [{
              service_id: appointment.service_id,
              professional_id: appointment.professional_id,
              value: appointment.total_value,
            }]
          : []);

    const resolvedCommissionMappings = new Map<string, ServiceProfessional>();
    if (commissionLines.length > 0 && !options?.skipCommission) {
      for (const line of commissionLines) {
        if (!line.professional_id || !line.service_id || !line.value) continue;
        const mapping = await resolveCommissionMapping(line.service_id, line.professional_id);
        if (!mapping) {
          const serviceName = services.find((service) => service.id === line.service_id)?.name ?? 'Serviço';
          const professionalName = professionals.find((professional) => professional.id === line.professional_id)?.nickname
            ?? professionals.find((professional) => professional.id === line.professional_id)?.name
            ?? 'Profissional';
          toast.error(`Configure a comissão de ${professionalName} para ${serviceName} antes de fechar a comanda.`);
          return null;
        }
        resolvedCommissionMappings.set(`${line.service_id}:${line.professional_id}`, mapping);
      }
    }

    const { data: existingPaymentTx } = await supabase
      .from('transactions')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('reference_id', id)
      .eq('reference_type', 'appointment')
      .eq('type', 'income')
      .is('reversed_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: existingCommission } = await supabase
      .from('commissions')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('appointment_id', id)
      .eq('type', 'service')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const billingSession = getBillingTargetSession({
      cashSessionId: options?.cashSessionId ?? null,
      appointmentDate: options?.movementDate ?? appointment.start_time,
      requireActiveCash: false,
    });
    if ((options?.cashSessionId || activeCashRegularization) && !billingSession) {
      return null;
    }

    const appointmentUpdate: Record<string, unknown> = { status: 'completed' };
    if (overrides?.total_value !== undefined) appointmentUpdate.total_value = overrides.total_value;
    if (overrides?.notes !== undefined) appointmentUpdate.notes = overrides.notes;

    const { data: completedRows, error: apptError } = await supabase
      .from('appointments')
      .update(appointmentUpdate)
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .neq('status', 'completed')
      .select('id');
    if (apptError) { toast.error('Erro ao finalizar atendimento.'); return null; }

    const wasCompletedNow = (completedRows?.length ?? 0) > 0;

    setAppointments(prev => prev.map(a => a.id === id ? { ...a, ...overrides, status: 'completed' } : a));

    let transactionId: string | undefined = existingPaymentTx?.id;

    if (!wasCompletedNow && !transactionId) {
      const { data: persistedPaymentTx } = await supabase
        .from('transactions')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('reference_id', id)
        .eq('reference_type', 'appointment')
        .eq('type', 'income')
        .is('reversed_at', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      transactionId = persistedPaymentTx?.id;
    }

    const billSettlementKinds = commissionLines
      .map((line) => resolvedCommissionMappings.get(`${line.service_id}:${line.professional_id}`)?.settlement_kind)
      .filter(Boolean) as CommissionSettlementKind[];
    const allTransferSettlement = billSettlementKinds.length > 0 && billSettlementKinds.every((kind) => kind === 'transfer_receivable');
    const movementTimestamp = getSessionMovementTimestamp(billingSession);

    // skipTransaction: os pagamentos foram lançados por fora (pagamento
    // dividido via registerBillPayments) — não duplica a entrada no caixa.
    let insertedTransaction: Transaction | undefined;
    if (billingSession && !transactionId && !allTransferSettlement && !options?.skipTransaction) {
      const { data: txData, error: txError } = await supabase
        .from('transactions')
        .insert({
          cash_session_id: billingSession.id,
          type: 'income',
          category: 'service',
          description: `${appointment.service?.name ?? 'Serviço'} - ${appointment.client?.name ?? 'Cliente'}`,
          amount: appointment.total_value ?? 0,
          payment_method: paymentMethod,
          reference_id: id,
          reference_type: 'appointment',
          created_by: user?.id,
          tenant_id: tenantId,
          ...(movementTimestamp ? { created_at: movementTimestamp } : {}),
        })
        .select()
        .single();

      if (txError) {
        toast.warning('Atendimento finalizado, mas houve erro ao registrar no caixa. Verifique manualmente.');
      } else {
        transactionId = txData?.id;
        insertedTransaction = txData as Transaction;
      }
    }

    // Insere e já devolve a linha (evita recarregar todo o histórico depois).
    const insertedCommissionRows: Commission[] = [];
    if (commissionLines.length > 0 && !existingCommission?.id && !options?.skipCommission) {
      for (const line of commissionLines) {
        if (!line.professional_id || !line.service_id || !line.value) continue;
        const mapping = resolvedCommissionMappings.get(`${line.service_id}:${line.professional_id}`);
        if (!mapping) continue;
        const commissionRate = Number(mapping.commission_rate) || 0;
        const settlementKind = normalizeCommissionSettlementKind(mapping.settlement_kind);
        const commissionValue = calculateSettlementAmount(line.value, commissionRate, settlementKind);
        const service = services.find((item) => item.id === line.service_id);
        const professional = professionals.find((item) => item.id === line.professional_id);
        const { data: commissionRow, error: commError } = await supabase.from('commissions').insert({
          professional_id: line.professional_id,
          appointment_id: id,
          service_id: line.service_id,
          transaction_id: transactionId,
          cash_session_id: billingSession?.id ?? null,
          type: 'service',
          base_value: line.value,
          commission_rate: commissionRate,
          commission_value: commissionValue,
          settlement_kind: settlementKind,
          service_name_snapshot: service?.name ?? appointment.service?.name ?? 'Serviço',
          professional_name_snapshot: professional?.nickname ?? professional?.name ?? 'Profissional',
          rule_source_id: mapping.id,
          calculation_source: 'service_mapping',
          status: 'pending',
          tenant_id: tenantId,
          ...(movementTimestamp ? { created_at: movementTimestamp } : {}),
        }).select().single();

        if (commError) {
          toast.warning('Atendimento finalizado, mas houve erro ao registrar comissão. Verifique manualmente.');
        } else if (commissionRow) {
          insertedCommissionRows.push({ ...(commissionRow as Commission), professional });
        }
      }
    }

    // Atualização otimista local: evita recarregar todo o histórico
    // financeiro do tenant a cada comanda fechada (ficava lento com o tempo).
    if (insertedTransaction) {
      setTransactions(prev => [insertedTransaction as Transaction, ...prev]);
      await recordFinancialAudit({
        actionType: 'transaction_created',
        entityType: 'transaction',
        description: `Recebimento da comanda registrado para ${appointment.client?.name ?? 'Cliente'}.`,
        transactionId: insertedTransaction.id,
        cashSessionId: insertedTransaction.cash_session_id ?? billingSession?.id ?? null,
        appointmentId: id,
        afterState: insertedTransaction as unknown as Record<string, unknown>,
        metadata: {
          payment_method: paymentMethod,
          source: 'complete_appointment',
          used_historical_cash_session: billingSession?.status === 'closed',
          cash_business_date: billingSession ? getBusinessDateKey(billingSession.opened_at) : null,
        },
      });
    }
    if (insertedCommissionRows.length > 0) {
      setCommissions(prev => [...insertedCommissionRows, ...prev]);
    }
    await recordAppointmentEvent({
      appointmentId: id,
      eventType: 'completed',
      previousStatus: existingAppointment.status,
      nextStatus: 'completed',
      snapshot: { ...appointment, status: 'completed' },
      metadata: {
        commission_lines: commissionLines.length,
        generated_commissions: insertedCommissionRows.length,
        transaction_id: transactionId ?? null,
        skipped_transaction: options?.skipTransaction ?? false,
        cash_session_id: billingSession?.id ?? null,
        used_historical_cash_session: billingSession?.status === 'closed',
      },
    });
    if (wasCompletedNow) {
      toast.success('Atendimento finalizado!');
    }
    return transactionId ?? null;
  };

  // ── CASH ACTIONS ────────────────────────────────────────────────────────
  const openCashSession = async (openingBalance: number) => {
    if (!guardModify()) return null;
    if (!guardFinancialPermission(canOperateCashSessions, 'Você não tem permissão para abrir o caixa.')) return null;
    const { data: openSessions, error: openSessionsError } = await supabase
      .from('cash_sessions')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('status', 'open')
      .order('opened_at', { ascending: false });

    if (openSessionsError) {
      toast.error('Não foi possível validar o estado atual do caixa.');
      return null;
    }

    const liveCashSessions = (openSessions as CashSession[]) ?? [];
    if (liveCashSessions.length > 0) {
      const mergedSessions = [
        ...liveCashSessions,
        ...cashSessions.filter((cashSession) => cashSession.status !== 'open'),
      ].filter((session, index, allSessions) => allSessions.findIndex((candidate) => candidate.id === session.id) === index);

      applyCashSessionsState(mergedSessions);
      const liveState = resolveCashSessionState(liveCashSessions);

      if (liveState.pendingCashSession) {
        toast.warning('Existe um caixa pendente de data anterior. Regularize o fechamento antes de abrir um novo caixa.');
        return null;
      }

      if (liveState.currentCashSession) {
        toast.warning('Já existe um caixa aberto para hoje.');
        return null;
      }
    }

    const { data, error } = await supabase
      .from('cash_sessions')
      .insert({ opening_balance: openingBalance, status: 'open', created_by: user?.id, tenant_id: tenantId })
      .select()
      .single();
    if (error) {
      if (error.code === '23505') {
        toast.warning('Já existe um caixa aberto para este cliente.');
      } else {
        toast.error('Erro ao abrir caixa.');
      }
      return null;
    }
    const session = data as CashSession;
    applyCashSessionsState([session, ...cashSessions.filter((cashSession) => cashSession.id !== session.id)]);
    await recordFinancialAudit({
      actionType: 'cash_opened',
      entityType: 'cash_session',
      description: 'Caixa aberto.',
      cashSessionId: session.id,
      afterState: session as unknown as Record<string, unknown>,
      metadata: {
        opening_balance: openingBalance,
      },
    });
    toast.success('Caixa aberto!');
    return session;
  };

  const closeCashSession = async (
    closingBalance: number,
    notes?: string,
    options?: { sessionId?: string; divergenceReason?: string },
  ) => {
    if (!guardModify()) return;
    if (!guardFinancialPermission(canOperateCashSessions, 'Você não tem permissão para fechar o caixa.')) return;
    const targetSession = getCashOperationTargetSession({
      allowPendingSession: true,
      sessionId: options?.sessionId,
      permissionMessage: 'Somente usuários financeiros podem encerrar caixas pendentes de datas anteriores.',
    });
    if (!targetSession) return;

    const sessionTxs = transactions.filter(
      (transaction) => transaction.cash_session_id === targetSession.id && !transaction.reversed_at,
    );
    const cashTxs = sessionTxs.filter(t => t.payment_method === 'cash');
    const totalCashIn  = cashTxs.filter(t => t.type === 'income') .reduce((s, t) => s + Number(t.amount), 0);
    const totalCashOut = cashTxs.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0);
    const expectedBalance = targetSession.opening_balance + totalCashIn - totalCashOut;
    const difference = closingBalance - expectedBalance;
    const hasDifference = Math.abs(difference) > 0.009;

    if (hasDifference && !options?.divergenceReason?.trim()) {
      toast.error('Informe uma justificativa para divergência no fechamento do caixa.');
      return;
    }

    const beforeState = {
      ...targetSession,
      expected_balance: expectedBalance,
    } as Record<string, unknown>;
    const closePayload = {
      closed_at: new Date().toISOString(),
      closing_balance: closingBalance,
      expected_balance: expectedBalance,
      difference,
      divergence_reason: hasDifference ? options?.divergenceReason?.trim() ?? null : null,
      closed_by: user?.id ?? null,
      is_late_closure: isSessionFromPreviousDay(targetSession),
      status: 'closed',
      notes,
    };
    const { error } = await supabase.from('cash_sessions').update(closePayload)
      .eq('id', targetSession.id)
      .eq('tenant_id', tenantId);
    if (error) { toast.error('Erro ao fechar caixa.'); return; }
    await recordFinancialAudit({
      actionType: 'cash_closed',
      entityType: 'cash_session',
      description: 'Caixa fechado.',
      cashSessionId: targetSession.id,
      beforeState,
      afterState: {
        ...beforeState,
        ...closePayload,
      },
      metadata: {
        difference,
      },
    });
    await refreshData(['cash']);
    toast.success('Caixa fechado!');
  };

  const reopenCurrentCashSession = async (sessionId: string): Promise<boolean> => {
    if (!guardModify()) return false;
    if (!guardFinancialPermission(canManageCashFlow, 'Você não tem permissão para reabrir o caixa do dia.')) return false;

    const targetSession = cashSessions.find((session) => session.id === sessionId) ?? null;
    if (!targetSession) {
      toast.error('Não foi possível localizar o caixa selecionado.');
      return false;
    }
    if (targetSession.status !== 'closed' || isSessionFromPreviousDay(targetSession)) {
      toast.error('Somente o caixa fechado do dia corrente pode ser reaberto.');
      return false;
    }

    const { data, error } = await (supabase as any).rpc('reopen_current_cash_session', {
      _cash_session_id: sessionId,
    });
    if (error) {
      console.error('Erro ao reabrir caixa do dia:', error);
      toast.error(error.message || 'Não foi possível reabrir o caixa do dia.');
      return false;
    }

    const reopenedSession = (data?.id ? data : data?.[0]) as CashSession | undefined;
    if (!reopenedSession) {
      toast.error('A reabertura não retornou um caixa válido.');
      return false;
    }

    applyCashSessionsState([
      reopenedSession,
      ...cashSessions.filter((cashSession) => cashSession.id !== reopenedSession.id),
    ]);
    await refreshData(['cash']);
    toast.success('Caixa do dia reaberto.');
    return true;
  };

  const addTransaction = async (transactionData: Omit<Transaction, 'id' | 'created_at'>) => {
    if (!guardModify()) return null;
    if (!guardFinancialPermission(canOperateCashSessions, 'Você não tem permissão para lançar entradas e saídas no caixa.')) return null;
    const targetSession = getCashOperationTargetSession({
      allowPendingSession: true,
      permissionMessage: 'Somente usuários financeiros podem ajustar movimentos em caixas pendentes.',
    });
    if (!targetSession) return null;
    const movementTimestamp = getSessionMovementTimestamp(targetSession);
    const { data, error } = await supabase
      .from('transactions')
      .insert({
        ...transactionData,
        cash_session_id: targetSession.id,
        created_by: user?.id,
        tenant_id: tenantId,
        ...(movementTimestamp ? { created_at: movementTimestamp } : {}),
      })
      .select()
      .single();
    if (error) { toast.error('Erro ao registrar transação.'); return null; }
    const tx = data as Transaction;
    setTransactions(prev => [tx, ...prev]);
    await recordFinancialAudit({
      actionType: 'transaction_created',
      entityType: 'transaction',
      description: `Movimento manual registrado: ${tx.description ?? tx.category}.`,
      transactionId: tx.id,
      cashSessionId: targetSession.id,
      afterState: tx as unknown as Record<string, unknown>,
    });
    toast.success('Transação registrada!');
    return tx;
  };

  const reverseTransaction = async (transactionId: string, reason?: string) => {
    if (!guardModify()) return false;
    if (!guardFinancialPermission(canRefundBills, 'Você não tem permissão para estornar movimentos financeiros.')) return false;

    const originalTransaction = transactions.find((transaction) => transaction.id === transactionId);
    if (!originalTransaction) {
      toast.error('Movimentação não encontrada.');
      return false;
    }

    // O estorno pertence ao mesmo caixa financeiro do movimento original.
    // A data da ação continua sendo registrada na auditoria/reversed_at.
    const targetSession = originalTransaction.cash_session_id
      ? getBillingTargetSession({
          cashSessionId: originalTransaction.cash_session_id,
          requireActiveCash: false,
        })
      : getCashOperationTargetSession({
          allowPendingSession: true,
          permissionMessage: 'Somente usuários financeiros podem estornar movimentos em caixas pendentes.',
        });
    if (!targetSession) {
      toast.error('Regularize ou abra o caixa de origem antes de registrar o estorno.');
      return false;
    }

    if (originalTransaction.reversed_at || originalTransaction.reversal_transaction_id) {
      toast.warning('Esta movimentação já foi estornada anteriormente.');
      return false;
    }

    if (originalTransaction.reference_type === 'transaction_reversal' || originalTransaction.reference_type === 'refund') {
      toast.warning('O sistema não permite estornar um estorno novamente.');
      return false;
    }

    try {
      let reversalTransaction: Transaction;
      const restoreCommissionSettlements = async (sourceTransactionId: string, reversalTransactionId: string) => {
        const { data: settlementRows, error: settlementReadError } = await (supabase as any)
          .from('commission_settlements')
          .select('*')
          .eq('tenant_id', tenantId)
          .eq('transaction_id', sourceTransactionId)
          .eq('status', 'active');
        if (settlementReadError) throw settlementReadError;
        if (!settlementRows || settlementRows.length === 0) return false;

        for (const settlement of settlementRows) {
          const { data: commissionRow, error: commissionReadError } = await supabase
            .from('commissions')
            .select('id, commission_value, settled_amount, status')
            .eq('tenant_id', tenantId)
            .eq('id', settlement.commission_id)
            .maybeSingle();
          if (commissionReadError) throw commissionReadError;
          if (!commissionRow) continue;

          const restoredAmount = Math.max(
            0,
            Math.abs(Number(commissionRow.settled_amount ?? 0)) - Math.abs(Number(settlement.amount ?? 0)),
          );
          const fullySettled = restoredAmount >= Math.abs(Number(commissionRow.commission_value ?? 0)) - COMMISSION_SETTLEMENT_TOLERANCE;
          const { error: commissionRestoreError } = await supabase
            .from('commissions')
            .update({
              status: fullySettled ? 'paid' : 'pending',
              settled_amount: restoredAmount,
              paid_at: fullySettled ? undefined : null,
              payment_method: fullySettled ? undefined : null,
            })
            .eq('tenant_id', tenantId)
            .eq('id', settlement.commission_id);
          if (commissionRestoreError) throw commissionRestoreError;

          const { error: settlementRestoreError } = await (supabase as any)
            .from('commission_settlements')
            .update({
              status: 'reversed',
              reversed_at: new Date().toISOString(),
              reversed_by: user?.id ?? null,
              reversal_transaction_id: reversalTransactionId,
            })
            .eq('tenant_id', tenantId)
            .eq('id', settlement.id)
            .eq('status', 'active');
          if (settlementRestoreError) throw settlementRestoreError;
        }
        return true;
      };

      if (originalTransaction.reference_type === 'client_ledger_settlement') {
        const { data: settlement, error: settlementError } = await (supabase as any)
          .from('client_ledger_settlements')
          .select('*')
          .eq('tenant_id', tenantId)
          .eq('transaction_id', originalTransaction.id)
          .eq('status', 'active')
          .maybeSingle();

        if (settlementError) throw settlementError;
        if (!settlement) {
          toast.error('A baixa da pendência vinculada não foi encontrada.');
          return false;
        }

        const { data: ledgerEntry, error: ledgerReadError } = await supabase
          .from('client_ledger_entries')
          .select('*')
          .eq('tenant_id', tenantId)
          .eq('id', settlement.ledger_entry_id)
          .maybeSingle();
        if (ledgerReadError) throw ledgerReadError;
        if (!ledgerEntry) {
          toast.error('O lançamento da pendência vinculada não foi encontrado.');
          return false;
        }

        const restoredSettledAmount = Math.max(0, Number(ledgerEntry.settled_amount ?? 0) - Number(settlement.amount));
        const { error: ledgerRestoreError } = await supabase
          .from('client_ledger_entries')
          .update({
            settled_amount: restoredSettledAmount,
            status: 'open',
            settled_at: null,
          })
          .eq('tenant_id', tenantId)
          .eq('id', settlement.ledger_entry_id);
        if (ledgerRestoreError) throw ledgerRestoreError;

        reversalTransaction = await createReversalTransaction(originalTransaction, {
          category: 'Estorno de baixa de pendência',
          description: `Estorno de baixa de pendência: ${originalTransaction.description ?? 'Baixa de cliente'}`,
          paymentMethod: originalTransaction.payment_method,
          referenceId: settlement.appointment_id ?? originalTransaction.reference_id,
          referenceType: 'client_ledger_settlement_reversal',
        });

        await markTransactionAsReversed(originalTransaction.id, reversalTransaction.id, reason);
        const { error: settlementRestoreError } = await (supabase as any)
          .from('client_ledger_settlements')
          .update({
            status: 'reversed',
            reversed_at: new Date().toISOString(),
            reversed_by: user?.id ?? null,
            reversal_transaction_id: reversalTransaction.id,
          })
          .eq('tenant_id', tenantId)
          .eq('id', settlement.id)
          .eq('status', 'active');
        if (settlementRestoreError) throw settlementRestoreError;

        await recordFinancialAudit({
          actionType: 'transaction_reversed',
          entityType: 'transaction',
          description: 'Baixa de pendência estornada e saldo do cliente restaurado.',
          transactionId: originalTransaction.id,
          cashSessionId: reversalTransaction.cash_session_id ?? originalTransaction.cash_session_id ?? targetSession.id,
          appointmentId: settlement.appointment_id ?? originalTransaction.reference_id ?? null,
          beforeState: originalTransaction as unknown as Record<string, unknown>,
          afterState: {
            reversed_at: new Date().toISOString(),
            reversal_transaction_id: reversalTransaction.id,
            restored_ledger_entry_id: settlement.ledger_entry_id,
            restored_amount: settlement.amount,
            reversal_reason: reason ?? null,
          },
        });
      } else if (originalTransaction.reference_type === 'appointment') {
        const appointmentId = originalTransaction.reference_id;
        if (!appointmentId) {
          toast.error('A comanda vinculada não foi encontrada.');
          return false;
        }

        const relatedCommissions = commissions.filter((commission) => commission.appointment_id === appointmentId);
        const paidCommissions = relatedCommissions.filter((commission) => commission.status === 'paid');
        if (paidCommissions.length > 0) {
          toast.error('Estorne primeiro os pagamentos de comissão vinculados a esta comanda.');
          return false;
        }
        const appointmentRecord = appointments.find((item) => item.id === appointmentId) ?? null;
        const { data: activeAppointmentTxRows, error: activeAppointmentTxError } = await supabase
          .from('transactions')
          .select('*')
          .eq('tenant_id', tenantId)
          .eq('reference_id', appointmentId)
          .eq('reference_type', 'appointment')
          .eq('type', 'income')
          .is('reversed_at', null);

        if (activeAppointmentTxError) throw activeAppointmentTxError;

        const activeAppointmentTransactions = ((activeAppointmentTxRows as Transaction[] | null) ?? [])
          .filter((transaction) => transaction.id !== originalTransaction.id);
        const isFullRefund = activeAppointmentTransactions.length === 0;

        if (isFullRefund) {
          const { error: appointmentError } = await supabase
            .from('appointments')
            .update({ status: 'in_progress' })
            .eq('id', appointmentId)
            .eq('tenant_id', tenantId);

          if (appointmentError) throw appointmentError;

          if (relatedCommissions.length > 0) {
            const { error: deleteCommissionError } = await supabase
              .from('commissions')
              .delete()
              .eq('tenant_id', tenantId)
              .eq('appointment_id', appointmentId)
              .eq('status', 'pending');

            if (deleteCommissionError) throw deleteCommissionError;
          }
        } else if (appointmentRecord?.client_id) {
          const { error: debtError } = await supabase.from('client_ledger_entries').insert({
            tenant_id: tenantId,
            client_id: appointmentRecord.client_id,
            appointment_id: appointmentId,
            entry_type: 'debt',
            amount: Number(originalTransaction.amount),
            description: 'Pendência gerada por estorno parcial da comanda',
            created_by: user?.id ?? null,
          });
          if (debtError) throw debtError;
        }

        reversalTransaction = await createReversalTransaction(originalTransaction, {
          category: isFullRefund ? 'Estorno de Comanda' : 'Estorno Parcial de Comanda',
          description: `${isFullRefund ? 'Estorno de comanda' : 'Estorno parcial de comanda'}: ${originalTransaction.description ?? 'Pagamento do atendimento'}`,
          paymentMethod: originalTransaction.payment_method,
          referenceId: appointmentId,
          referenceType: 'refund',
        });

        await markTransactionAsReversed(
          originalTransaction.id,
          reversalTransaction.id,
          reason ?? (isFullRefund ? 'Estorno completo da comanda.' : 'Estorno parcial do pagamento da comanda.'),
          isFullRefund ? 'appointment_refunded' : 'appointment_partial_refund',
        );

        if (isFullRefund) {
          await recordAppointmentEvent({
            appointmentId,
            eventType: 'reopened',
            previousStatus: appointmentRecord?.status ?? 'completed',
            nextStatus: 'in_progress',
            snapshot: appointmentRecord ? { ...appointmentRecord, status: 'in_progress' } : { id: appointmentId, status: 'in_progress' },
            metadata: {
              reason: 'payment_reversed',
              transaction_id: originalTransaction.id,
            },
          });
        } else {
          await recordAppointmentEvent({
            appointmentId,
            eventType: 'partial_payment_reversed',
            previousStatus: appointmentRecord?.status ?? null,
            nextStatus: appointmentRecord?.status ?? null,
            snapshot: appointmentRecord,
            metadata: {
              transaction_id: originalTransaction.id,
              reversed_amount: Number(originalTransaction.amount),
              remaining_active_payment_count: activeAppointmentTransactions.length,
            },
          });
        }

        await recordFinancialAudit({
          actionType: isFullRefund ? 'appointment_fully_refunded' : 'appointment_partially_refunded',
          entityType: 'transaction',
          description: isFullRefund
            ? 'Estorno completo da comanda registrado.'
            : 'Estorno parcial da comanda registrado.',
          transactionId: originalTransaction.id,
          cashSessionId: reversalTransaction.cash_session_id ?? originalTransaction.cash_session_id ?? targetSession.id,
          appointmentId,
          beforeState: originalTransaction as unknown as Record<string, unknown>,
          afterState: {
            reversed_at: new Date().toISOString(),
            reversal_transaction_id: reversalTransaction.id,
            reversal_reason: reason ?? null,
            appointment_status: isFullRefund ? 'in_progress' : appointmentRecord?.status ?? null,
          },
          metadata: {
            reversal_transaction_id: reversalTransaction.id,
            full_refund: isFullRefund,
            remaining_active_payment_count: activeAppointmentTransactions.length,
          },
        });
      } else if (originalTransaction.reference_type === 'commission') {
        const commissionId = originalTransaction.reference_id;
        if (!commissionId) {
          toast.error('Comissão vinculada não encontrada.');
          return false;
        }

        reversalTransaction = await createReversalTransaction(originalTransaction, {
          category: 'Estorno de Comissão',
          description: `Estorno de pagamento de comissão: ${originalTransaction.description ?? 'Comissão'}`,
          paymentMethod: originalTransaction.payment_method,
          referenceId: commissionId,
          referenceType: 'commission_reversal',
        });

        const restoredBySettlement = await restoreCommissionSettlements(originalTransaction.id, reversalTransaction.id);
        if (!restoredBySettlement) {
          const { error: commissionError } = await supabase
            .from('commissions')
            .update({ status: 'pending', settled_amount: 0, paid_at: null, transaction_id: null, payment_method: null })
            .eq('id', commissionId)
            .eq('tenant_id', tenantId);
          if (commissionError) throw commissionError;
        }

        await markTransactionAsReversed(originalTransaction.id, reversalTransaction.id, reason);
        await recordFinancialAudit({
          actionType: 'transaction_reversed',
          entityType: 'transaction',
          description: 'Pagamento de comissão estornado.',
          transactionId: originalTransaction.id,
          commissionId,
          cashSessionId: reversalTransaction.cash_session_id ?? originalTransaction.cash_session_id ?? targetSession.id,
          beforeState: originalTransaction as unknown as Record<string, unknown>,
          afterState: {
            reversed_at: new Date().toISOString(),
            reversal_transaction_id: reversalTransaction.id,
            reversal_reason: reason ?? null,
          },
        });
      } else if (originalTransaction.reference_type === 'commission_batch') {
        reversalTransaction = await createReversalTransaction(originalTransaction, {
          category: 'Estorno de Comissões',
          description: `Estorno de pagamento em lote: ${originalTransaction.description ?? 'Comissões'}`,
          paymentMethod: originalTransaction.payment_method,
          referenceId: originalTransaction.reference_id,
          referenceType: 'commission_batch_reversal',
        });

        const restoredBySettlement = await restoreCommissionSettlements(originalTransaction.id, reversalTransaction.id);
        if (!restoredBySettlement) {
          const { error: commissionBatchError } = await supabase
            .from('commissions')
            .update({ status: 'pending', settled_amount: 0, paid_at: null, transaction_id: null, payment_method: null })
            .eq('tenant_id', tenantId)
            .eq('transaction_id', originalTransaction.id);
          if (commissionBatchError) throw commissionBatchError;
        }

        await markTransactionAsReversed(originalTransaction.id, reversalTransaction.id, reason);
        await recordFinancialAudit({
          actionType: 'transaction_reversed',
          entityType: 'transaction',
          description: 'Pagamento em lote de comissões estornado.',
          transactionId: originalTransaction.id,
          cashSessionId: reversalTransaction.cash_session_id ?? originalTransaction.cash_session_id ?? targetSession.id,
          beforeState: originalTransaction as unknown as Record<string, unknown>,
          afterState: {
            reversed_at: new Date().toISOString(),
            reversal_transaction_id: reversalTransaction.id,
            reversal_reason: reason ?? null,
          },
        });
      } else if (originalTransaction.reference_type === 'voucher') {
        const { data: voucherCommission, error: voucherReadError } = await supabase
          .from('commissions')
          .select('id, settled_amount')
          .eq('tenant_id', tenantId)
          .eq('transaction_id', originalTransaction.id)
          .eq('type', 'voucher')
          .maybeSingle();
        if (voucherReadError) throw voucherReadError;
        if (Number(voucherCommission?.settled_amount ?? 0) > COMMISSION_SETTLEMENT_TOLERANCE) {
          toast.error('Este vale já foi abatido em comissão/repasse. Estorne primeiro a liquidação correspondente.');
          return false;
        }
        const { error: voucherDeleteError } = await supabase
          .from('commissions')
          .delete()
          .eq('tenant_id', tenantId)
          .eq('transaction_id', originalTransaction.id)
          .eq('type', 'voucher');

        if (voucherDeleteError) throw voucherDeleteError;

        reversalTransaction = await createReversalTransaction(originalTransaction, {
          category: 'Estorno de Vale',
          description: `Estorno de vale: ${originalTransaction.description ?? 'Vale do profissional'}`,
          paymentMethod: originalTransaction.payment_method,
          referenceId: originalTransaction.reference_id,
          referenceType: 'voucher_reversal',
        });

        await markTransactionAsReversed(originalTransaction.id, reversalTransaction.id, reason);
        await recordFinancialAudit({
          actionType: 'transaction_reversed',
          entityType: 'transaction',
          description: 'Vale estornado.',
          transactionId: originalTransaction.id,
          cashSessionId: reversalTransaction.cash_session_id ?? originalTransaction.cash_session_id ?? targetSession.id,
          beforeState: originalTransaction as unknown as Record<string, unknown>,
          afterState: {
            reversed_at: new Date().toISOString(),
            reversal_transaction_id: reversalTransaction.id,
            reversal_reason: reason ?? null,
          },
        });
      } else {
        reversalTransaction = await createReversalTransaction(originalTransaction, {
          category: `Estorno ${originalTransaction.category}`,
          description: `Estorno financeiro: ${originalTransaction.description ?? originalTransaction.category}`,
          paymentMethod: originalTransaction.payment_method,
        });

        await markTransactionAsReversed(originalTransaction.id, reversalTransaction.id, reason);
        await recordFinancialAudit({
          actionType: 'transaction_reversed',
          entityType: 'transaction',
          description: 'Movimentação financeira estornada.',
          transactionId: originalTransaction.id,
          cashSessionId: reversalTransaction.cash_session_id ?? originalTransaction.cash_session_id ?? targetSession.id,
          beforeState: originalTransaction as unknown as Record<string, unknown>,
          afterState: {
            reversed_at: new Date().toISOString(),
            reversal_transaction_id: reversalTransaction.id,
            reversal_reason: reason ?? null,
          },
        });
      }

      await refreshData(['appointments', 'cash', 'transactions', 'commissions']);
      toast.success('Movimentação estornada com sucesso.');
      return true;
    } catch (error) {
      console.error('Error reversing transaction:', error);
      toast.error('Não foi possível estornar a movimentação.');
      return false;
    }
  };

  // ── COMMISSION ACTIONS ──────────────────────────────────────────────────
  const payCommission = async (id: string, paymentMethod: 'cash' | 'pix' | 'transfer', amount?: number) => {
    if (!guardModify()) return;
    if (!guardFinancialPermission(canPerformAdvancedFinancialOps, 'Somente usuários financeiros podem pagar comissões.')) return;
    const targetSession = getCashOperationTargetSession({
      allowPendingSession: true,
      permissionMessage: 'Somente usuários financeiros podem ajustar pagamentos em caixas pendentes.',
    });
    if (!targetSession) {
      toast.error('Abra o caixa antes de pagar comissões.');
      return;
    }
    const commission = commissions.find(c => c.id === id);
    if (!commission) { toast.error('Comissão não encontrada.'); return; }
    if (commission.type === 'voucher') {
      toast.info('O vale já foi lançado como saída. A liquidação deve ocorrer junto da comissão ou do repasse.');
      return;
    }
    const professional = professionals.find(p => p.id === commission.professional_id);
    const settlementKind = normalizeCommissionSettlementKind(
      commission.settlement_kind,
      professional?.settlement_type,
    );

    const isTransfer = settlementKind === 'transfer_receivable';
    const serviceTotal = Math.abs(Number(commission.commission_value));
    const serviceSettled = Math.abs(Number(commission.settled_amount ?? 0));
    const serviceOutstanding = Math.max(0, serviceTotal - serviceSettled);
    if (serviceOutstanding <= COMMISSION_SETTLEMENT_TOLERANCE) {
      toast.info('Esta comissão já está totalmente liquidada.');
      return;
    }

    // Vales são componentes do mesmo acerto, nunca movimentos soltos:
    // repasse recupera o vale como receita; comissão normal o abate do valor
    // pago ao profissional.
    const voucherRows = commissions.filter((item) =>
      item.professional_id === commission.professional_id
      && item.type === 'voucher'
      && item.status === 'pending',
    );
    const voucherOutstanding = voucherRows.reduce(
      (sum, item) => sum + getCommissionOutstandingAmount(item),
      0,
    );
    const applicableVoucherAmount = Math.min(voucherOutstanding, serviceOutstanding);
    const fullNetAmount = isTransfer
      ? serviceOutstanding + voucherOutstanding
      : Math.max(0, serviceOutstanding - applicableVoucherAmount);
    const numericAmount = Number(amount);
    const hasRequestedAmount = Number.isFinite(numericAmount) && numericAmount > COMMISSION_SETTLEMENT_TOLERANCE;
    const isFullRequest = !hasRequestedAmount || numericAmount >= fullNetAmount - COMMISSION_SETTLEMENT_TOLERANCE;
    const transactionAmount = isFullRequest
      ? fullNetAmount
      : Math.min(Math.max(0, numericAmount), fullNetAmount);
    const servicePayAmount = isTransfer || !isFullRequest
      ? Math.min(serviceOutstanding, transactionAmount)
      : serviceOutstanding;
    const voucherPayAmount = isTransfer
      ? Math.min(voucherOutstanding, Math.max(0, transactionAmount - servicePayAmount))
      : (isFullRequest ? applicableVoucherAmount : 0);
    const isPartial = transactionAmount + COMMISSION_SETTLEMENT_TOLERANCE < fullNetAmount;
    const allocations: Array<{
      commission: Commission;
      amount: number;
      componentType: 'service' | 'voucher';
      settlementKind: CommissionSettlementKind;
    }> = [];

    if (servicePayAmount > COMMISSION_SETTLEMENT_TOLERANCE) {
      allocations.push({
        commission,
        amount: servicePayAmount,
        componentType: 'service',
        settlementKind,
      });
    }

    let voucherBudget = voucherPayAmount;
    for (const voucher of voucherRows) {
      const outstanding = getCommissionOutstandingAmount(voucher);
      const settledAmount = Math.min(outstanding, Math.max(0, voucherBudget));
      if (settledAmount <= COMMISSION_SETTLEMENT_TOLERANCE) continue;
      allocations.push({
        commission: voucher,
        amount: settledAmount,
        componentType: 'voucher',
        settlementKind: isTransfer ? 'transfer_receivable' : settlementKind,
      });
      voucherBudget -= settledAmount;
      if (voucherBudget <= COMMISSION_SETTLEMENT_TOLERANCE) break;
    }

    if (allocations.length === 0) {
      toast.info('Nenhum saldo disponível para liquidar neste acerto.');
      return;
    }

    const methodLabel = paymentMethod === 'cash' ? 'Dinheiro' : paymentMethod === 'pix' ? 'PIX' : 'Transferência';
    const movementTimestamp = getSessionMovementTimestamp(targetSession);
    const paidAt = movementTimestamp ?? new Date().toISOString();
    let txData: Transaction | null = null;
    if (transactionAmount > COMMISSION_SETTLEMENT_TOLERANCE) {
      const description = isTransfer
        ? `Repasse${voucherPayAmount > COMMISSION_SETTLEMENT_TOLERANCE ? ' e recuperação de vales' : ''}${isPartial ? ' (parcial)' : ''}`
        : `Comissão${voucherPayAmount > COMMISSION_SETTLEMENT_TOLERANCE ? ' líquida com abatimento de vale' : ''}${isPartial ? ' (parcial)' : ''}`;
      const { data, error: txError } = await supabase
        .from('transactions')
        .insert({
          cash_session_id: targetSession.id,
          type: getSettlementDirection(settlementKind),
          category: getSettlementTransactionCategory(settlementKind),
          description: `${description} - ${commission.professional_name_snapshot ?? professional?.nickname ?? 'Profissional'} (${methodLabel})`,
          amount: transactionAmount,
          payment_method: paymentMethod === 'transfer' ? 'other' : paymentMethod,
          reference_id: id,
          reference_type: 'commission',
          created_by: user?.id,
          tenant_id: tenantId,
          ...(movementTimestamp ? { created_at: movementTimestamp } : {}),
        })
        .select()
        .single();
      if (txError) {
        toast.error(isTransfer ? 'Erro ao registrar recebimento no caixa.' : 'Erro ao registrar pagamento no caixa.');
        return;
      }
      txData = data as Transaction;
    }

    const { data: settlementRows, error: settlementError } = await (supabase as any)
      .from('commission_settlements')
      .insert(allocations.map(({ commission: rowCommission, amount: rowAmount, componentType, settlementKind: rowKind }) => ({
        tenant_id: tenantId,
        commission_id: rowCommission.id,
        amount: rowAmount,
        payment_method: paymentMethod,
        transaction_id: txData?.id ?? null,
        settlement_kind: rowKind,
        created_by: user?.id ?? null,
        component_type: componentType,
        status: 'active',
      })))
      .select('id, commission_id, amount, transaction_id, component_type');
    if (settlementError) {
      if (txData) {
        const reversal = await createReversalTransaction(txData, {
          category: 'Estorno de liquidação',
          description: 'Estorno técnico por falha ao registrar a composição da liquidação.',
          paymentMethod: txData.payment_method,
          referenceId: id,
          referenceType: 'commission_settlement_error',
        });
        await markTransactionAsReversed(txData.id, reversal.id, 'Falha ao registrar a composição da liquidação.');
      }
      toast.error('Não foi possível registrar a composição da liquidação. Nenhum valor foi baixado.');
      return;
    }

    const updatedCommissions = new Map<string, { status: 'pending' | 'paid'; settledAmount: number }>();
    try {
      for (const { commission: rowCommission, amount: rowAmount } of allocations) {
        const rowTotal = Math.abs(Number(rowCommission.commission_value));
        const nextSettled = Math.abs(Number(rowCommission.settled_amount ?? 0)) + rowAmount;
        const fullySettled = nextSettled >= rowTotal - COMMISSION_SETTLEMENT_TOLERANCE;
        const { error: updateError } = await supabase
          .from('commissions')
          .update({
            status: fullySettled ? 'paid' : 'pending',
            settled_amount: nextSettled,
            paid_at: fullySettled ? paidAt : null,
            payment_method: paymentMethod,
          })
          .eq('id', rowCommission.id)
          .eq('tenant_id', tenantId);
        if (updateError) throw updateError;
        updatedCommissions.set(rowCommission.id, {
          status: fullySettled ? 'paid' : 'pending',
          settledAmount: nextSettled,
        });
      }
    } catch (commissionUpdateError) {
      console.error('Falha ao atualizar a composição da liquidação; iniciando rollback:', commissionUpdateError);
      let rollbackCompleted = true;
      try {
        let reversal: Transaction | null = null;
        if (txData) {
          reversal = await createReversalTransaction(txData, {
            category: 'Estorno de liquidação',
            description: 'Estorno técnico por falha ao atualizar a composição da liquidação.',
            paymentMethod: txData.payment_method,
            referenceId: id,
            referenceType: 'commission_settlement_error',
          });
          await markTransactionAsReversed(txData.id, reversal.id, 'Falha ao atualizar a composição da liquidação.');
        }

        const settlementIds = ((settlementRows ?? []) as Array<{ id: string }>).map((row) => row.id);
        if (settlementIds.length > 0) {
          const { error: settlementRollbackError } = await (supabase as any)
            .from('commission_settlements')
            .update({
              status: 'reversed',
              reversed_at: new Date().toISOString(),
              reversed_by: user?.id ?? null,
              reversal_transaction_id: reversal?.id ?? null,
            })
            .eq('tenant_id', tenantId)
            .in('id', settlementIds)
            .eq('status', 'active');
          if (settlementRollbackError) throw settlementRollbackError;
        }

        for (const { commission: rowCommission } of allocations) {
          const original = commissions.find((item) => item.id === rowCommission.id);
          if (!original) continue;
          const { error: commissionRollbackError } = await supabase
            .from('commissions')
            .update({
              status: original.status,
              settled_amount: original.settled_amount ?? 0,
              paid_at: original.paid_at ?? null,
              payment_method: original.payment_method ?? null,
            })
            .eq('tenant_id', tenantId)
            .eq('id', rowCommission.id);
          if (commissionRollbackError) throw commissionRollbackError;
        }
      } catch (rollbackError) {
        rollbackCompleted = false;
        console.error('Não foi possível concluir o rollback da liquidação:', rollbackError);
      }

      toast.error(
        rollbackCompleted
          ? 'A liquidação falhou e foi estornada automaticamente. Nenhum valor foi baixado.'
          : 'A liquidação não foi concluída e o estorno automático falhou. Verifique o financeiro antes de repetir.',
      );
      return;
    }

    setCommissions(prev => prev.map((item) => {
      const updated = updatedCommissions.get(item.id);
      return updated
        ? {
            ...item,
            status: updated.status,
            settled_amount: updated.settledAmount,
            paid_at: updated.status === 'paid' ? paidAt : undefined,
            payment_method: paymentMethod,
          }
        : item;
    }));
    if (txData) setTransactions(prev => [txData as Transaction, ...prev]);
    await recordFinancialAudit({
      actionType: 'commission_paid',
      entityType: 'commission',
      description: `${isTransfer ? 'Repasse recebido' : 'Comissão paga'}${voucherPayAmount > COMMISSION_SETTLEMENT_TOLERANCE ? ' com acerto de vales' : ''}${isPartial ? ' parcialmente' : ''}.`,
      transactionId: txData?.id,
      cashSessionId: targetSession.id,
      commissionId: id,
      afterState: {
        transaction_id: txData?.id ?? null,
        amount: transactionAmount,
        payment_method: paymentMethod,
        settlement_kind: settlementKind,
        allocations: allocations.map(({ commission: rowCommission, amount: rowAmount, componentType }) => ({
          commission_id: rowCommission.id,
          amount: rowAmount,
          component_type: componentType,
        })),
      },
    });

    if (isPartial) {
      toast.success(`Liquidação parcial registrada. Saldo líquido restante: ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Math.max(0, fullNetAmount - transactionAmount))}.`);
    } else {
      toast.success(isTransfer ? 'Repasse e vales registrados!' : 'Comissão e vales registrados!');
    }
  };

  const payAllCommissions = async (professionalId: string, paymentMethod: 'cash' | 'pix' | 'transfer') => {
    if (!guardModify()) return;
    if (!guardFinancialPermission(canPerformAdvancedFinancialOps, 'Somente usuários financeiros podem pagar comissões.')) return;
    const targetSession = getCashOperationTargetSession({
      allowPendingSession: true,
      permissionMessage: 'Somente usuários financeiros podem ajustar pagamentos em caixas pendentes.',
    });
    if (!targetSession) {
      toast.error('Abra o caixa antes de pagar comissões.');
      return;
    }
    const professional = professionals.find(p => p.id === professionalId);
    const pendingCommissions = commissions.filter(
      c => c.professional_id === professionalId && c.status === 'pending',
    );
    const serviceRows = pendingCommissions.filter(c => c.type !== 'voucher');
    const voucherRows = pendingCommissions.filter(c => c.type === 'voucher');
    const serviceOutstanding = serviceRows.reduce((sum, c) => sum + getCommissionOutstandingAmount(c), 0);
    const voucherOutstanding = voucherRows.reduce((sum, c) => sum + getCommissionOutstandingAmount(c), 0);
    if (pendingCommissions.length === 0 || (serviceOutstanding <= COMMISSION_SETTLEMENT_TOLERANCE && voucherOutstanding <= COMMISSION_SETTLEMENT_TOLERANCE)) {
      toast.info('Nenhuma comissão ou vale pendente para liquidar.');
      return;
    }

    const settlementKind = normalizeCommissionSettlementKind(
      serviceRows[0]?.settlement_kind,
      professional?.settlement_type,
    );
    const isTransfer = settlementKind === 'transfer_receivable';
    // Repasse: o estabelecimento recebe a sua parcela e também recupera os
    // vales que já foram antecipados ao profissional. Comissão normal: o
    // vale reduz o pagamento líquido ao profissional, nunca vira receita.
    const totalAmount = isTransfer
      ? serviceOutstanding + voucherOutstanding
      : Math.max(0, serviceOutstanding - voucherOutstanding);
    const voucherApplied = isTransfer
      ? voucherOutstanding
      : Math.min(voucherOutstanding, serviceOutstanding);
    let voucherBudget = voucherApplied;
    const allocations = [
      ...(isTransfer ? voucherRows : serviceRows),
      ...(isTransfer ? serviceRows : voucherRows),
    ].reduce<Array<{
      commission: Commission;
      amount: number;
      componentType: 'service' | 'voucher';
    }>>((result, commission) => {
      const outstanding = getCommissionOutstandingAmount(commission);
      const prior = result
        .filter((item) => item.commission.id === commission.id)
        .reduce((sum, item) => sum + item.amount, 0);
      const available = Math.max(0, outstanding - prior);
      const componentType = commission.type === 'voucher' ? 'voucher' : 'service';
      const componentLimit = componentType === 'voucher' && !isTransfer
        ? voucherBudget
        : available;
      const amount = Math.min(available, Math.max(0, componentLimit));
      if (amount > COMMISSION_SETTLEMENT_TOLERANCE) {
        result.push({ commission, amount, componentType });
        if (componentType === 'voucher' && !isTransfer) voucherBudget -= amount;
      }
      return result;
    }, []);

    if (allocations.length === 0) {
      toast.info('Os vales pendentes já cobrem a comissão deste profissional.');
      return;
    }

    const methodLabel = paymentMethod === 'cash' ? 'Dinheiro' : paymentMethod === 'pix' ? 'PIX' : 'Transferência';
    const movementTimestamp = getSessionMovementTimestamp(targetSession);
    const paidAt = movementTimestamp ?? new Date().toISOString();
    let txData: Transaction | null = null;
    if (totalAmount > COMMISSION_SETTLEMENT_TOLERANCE) {
      const { data, error: txError } = await supabase
        .from('transactions')
        .insert({
          cash_session_id: targetSession.id,
          type: getSettlementDirection(settlementKind),
          category: getSettlementTransactionCategory(settlementKind),
          description: `${isTransfer ? 'Repasses e recuperação de vales' : 'Comissões líquidas'} (${pendingCommissions.length}x) - ${professional?.nickname ?? 'Profissional'} (${methodLabel})`,
          amount: totalAmount,
          payment_method: paymentMethod === 'transfer' ? 'other' : paymentMethod,
          reference_id: professionalId,
          reference_type: 'commission_batch',
          created_by: user?.id,
          tenant_id: tenantId,
          ...(movementTimestamp ? { created_at: movementTimestamp } : {}),
        })
        .select()
        .single();
      if (txError) {
        toast.error(isTransfer ? 'Erro ao registrar recebimento no caixa.' : 'Erro ao registrar pagamento no caixa.');
        return;
      }
      txData = data as Transaction;
    }

    const { data: settlementRows, error: settlementError } = await (supabase as any)
      .from('commission_settlements')
      .insert(allocations.map(({ commission, amount, componentType }) => ({
        tenant_id: tenantId,
        commission_id: commission.id,
        amount,
        payment_method: paymentMethod,
        transaction_id: txData?.id ?? null,
        settlement_kind: componentType === 'voucher' && isTransfer
          ? 'transfer_receivable'
          : settlementKind,
        component_type: componentType,
        status: 'active',
        created_by: user?.id ?? null,
      })))
      .select('id, commission_id, amount, transaction_id, component_type');
    if (settlementError) {
      if (txData) {
        const reversal = await createReversalTransaction(txData, {
          category: 'Estorno de liquidação',
          description: 'Estorno técnico por falha ao registrar a composição da liquidação.',
          paymentMethod: txData.payment_method,
          referenceId: professionalId,
          referenceType: 'commission_batch_settlement_error',
        });
        await markTransactionAsReversed(txData.id, reversal.id, 'Falha ao registrar a composição da liquidação.');
      }
      toast.error('Não foi possível registrar a composição da liquidação. Nenhum valor foi baixado.');
      return;
    }

    const updatedCommissions = new Map<string, { status: 'pending' | 'paid'; settledAmount: number }>();
    try {
      for (const { commission, amount } of allocations) {
        const nextSettled = Math.abs(Number(commission.settled_amount ?? 0)) + amount;
        const fullySettled = nextSettled >= Math.abs(Number(commission.commission_value)) - COMMISSION_SETTLEMENT_TOLERANCE;
        const { error: updateError } = await supabase
          .from('commissions')
          .update({
            status: fullySettled ? 'paid' : 'pending',
            paid_at: fullySettled ? paidAt : null,
            payment_method: paymentMethod,
            settled_amount: nextSettled,
          })
          .eq('id', commission.id)
          .eq('tenant_id', tenantId);
        if (updateError) throw updateError;
        updatedCommissions.set(commission.id, {
          status: fullySettled ? 'paid' : 'pending',
          settledAmount: nextSettled,
        });
      }
    } catch (updateError) {
      console.error('Falha ao atualizar as comissões do lote; iniciando rollback:', updateError);
      let rollbackCompleted = true;
      try {
        const settlementIds = ((settlementRows ?? []) as Array<{ id: string }>).map((row) => row.id);
        if (settlementIds.length > 0) {
          const { error: settlementRollbackError } = await (supabase as any)
            .from('commission_settlements')
            .update({
              status: 'reversed',
              reversed_at: new Date().toISOString(),
              reversed_by: user?.id ?? null,
            })
            .eq('tenant_id', tenantId)
            .in('id', settlementIds)
            .eq('status', 'active');
          if (settlementRollbackError) throw settlementRollbackError;
        }

        for (const { commission } of allocations) {
          const original = commissions.find((item) => item.id === commission.id);
          if (!original) continue;
          const { error: commissionRollbackError } = await supabase
            .from('commissions')
            .update({
              status: original.status,
              settled_amount: original.settled_amount ?? 0,
              paid_at: original.paid_at ?? null,
              payment_method: original.payment_method ?? null,
            })
            .eq('tenant_id', tenantId)
            .eq('id', commission.id);
          if (commissionRollbackError) throw commissionRollbackError;
        }

        if (txData) {
          const reversal = await createReversalTransaction(txData, {
            category: 'Estorno de liquidação',
            description: 'Estorno técnico por falha ao atualizar o lote de comissões.',
            paymentMethod: txData.payment_method,
            referenceId: professionalId,
            referenceType: 'commission_batch_settlement_error',
          });
          await markTransactionAsReversed(txData.id, reversal.id, 'Falha ao atualizar o lote de comissões.');
        }
      } catch (rollbackError) {
        rollbackCompleted = false;
        console.error('Não foi possível concluir o rollback do lote de comissões:', rollbackError);
      }

      toast.error(
        rollbackCompleted
          ? 'A liquidação em lote falhou e foi estornada automaticamente. Nenhum valor foi baixado.'
          : 'A liquidação em lote falhou e o estorno automático não foi concluído. Verifique o financeiro antes de repetir.',
      );
      return;
    }

    setCommissions(prev => prev.map(c =>
      updatedCommissions.has(c.id)
        ? (() => {
            const updated = updatedCommissions.get(c.id)!;
            return {
              ...c,
              status: updated.status,
              paid_at: updated.status === 'paid' ? paidAt : undefined,
              payment_method: paymentMethod,
              settled_amount: updated.settledAmount,
            };
          })()
        : c
    ));
    if (txData) setTransactions(prev => [txData as Transaction, ...prev]);
    await recordFinancialAudit({
      actionType: 'commission_batch_paid',
      entityType: 'commission',
      description: isTransfer
        ? 'Lote de repasses recebido com recuperação de vales.'
        : 'Lote de comissões liquidado com abatimento de vales.',
      transactionId: txData?.id,
      cashSessionId: targetSession.id,
      afterState: {
        professional_id: professionalId,
        commission_count: updatedCommissions.size,
        amount: totalAmount,
        payment_method: paymentMethod,
        allocations: allocations.map(({ commission, amount, componentType }) => ({
          commission_id: commission.id,
          amount,
          component_type: componentType,
        })),
      },
    });
    toast.success(isTransfer
      ? `${updatedCommissions.size} item(ns) de repasse/vale liquidados!`
      : `${updatedCommissions.size} item(ns) de comissão/vale liquidados!`);
  };

  const addVoucher = async (professionalId: string, amount: number, description?: string): Promise<boolean> => {
    if (!guardModify()) return false;
    if (!guardFinancialPermission(canOperateCashSessions, 'Você não tem permissão para registrar vales e adiantamentos.')) return false;
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('Informe um valor de vale maior que zero.');
      return false;
    }
    const targetSession = getCashOperationTargetSession({
      allowPendingSession: true,
      permissionMessage: 'Somente usuários financeiros podem ajustar vales em caixas pendentes.',
    });
    if (!targetSession) {
      toast.error('Abra o caixa antes de registrar vales.');
      return false;
    }
    const professional = professionals.find(p => p.id === professionalId);
    const voucherDescription = description ?? `Vale para ${professional?.nickname ?? 'Profissional'}`;
    const movementTimestamp = getSessionMovementTimestamp(targetSession);
    const idempotencyKey = `voucher-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const { data: rpcData, error: rpcError } = await (supabase as any).rpc('register_voucher_atomic', {
      _professional_id: professionalId,
      _amount: amount,
      _description: voucherDescription,
      _cash_session_id: targetSession.id,
      _movement_timestamp: movementTimestamp ?? null,
      _idempotency_key: idempotencyKey,
    });

    if (rpcError) {
      console.error('Erro ao registrar vale de forma atomica:', rpcError);
      toast.error(rpcError.message || 'Erro ao registrar vale e debitar a comissão.');
      return false;
    }

    const result = (Array.isArray(rpcData) ? rpcData[0] : rpcData) as {
      transaction_id?: string;
      commission_id?: string;
    } | null;
    if (!result?.transaction_id || !result.commission_id) {
      console.error('Resposta inesperada ao registrar vale:', rpcData);
      await refreshData(['transactions', 'commissions']);
      toast.error('O vale foi processado, mas a resposta não pôde ser confirmada. Confira o extrato antes de tentar novamente.');
      return false;
    }

    const [{ data: txData, error: txFetchError }, { data: commissionRow, error: commFetchError }] = await Promise.all([
      supabase.from('transactions').select('*').eq('id', result.transaction_id).maybeSingle(),
      supabase.from('commissions').select('*').eq('id', result.commission_id).maybeSingle(),
    ]);

    if (txFetchError || commFetchError || !txData || !commissionRow) {
      console.warn('Vale registrado, mas a atualização local será recarregada:', { txFetchError, commFetchError });
      await refreshData(['transactions', 'commissions']);
    } else {
      setTransactions(prev => [txData as Transaction, ...prev.filter(t => t.id !== txData.id)]);
      setCommissions(prev => [
        { ...(commissionRow as Commission), professional },
        ...prev.filter(c => c.id !== commissionRow.id),
      ]);
    }

    toast.success('Vale registrado e vinculado à comissão!');
    return true;
  };

  // Simulação: calcula o recálculo SEM gravar, para a tela mostrar diferença
  // e sinalizar riscos antes de aplicar.
  const previewReprocessPendingCommissions = async (
    filters: { dateFrom: string; dateTo: string; professionalId?: string | null; includePaid?: boolean }
  ): Promise<CommissionReprocessPreview | null> => {
    if (!guardFinancialPermission(canViewFinancialHistory || canPerformAdvancedFinancialOps, 'Sem permissão para simular reprocessamento.')) return null;
    if (!tenantId) return null;

    const baseQuery = supabase
      .from('commissions')
      .select('*')
      .eq('tenant_id', tenantId)
      .in('status', filters.includePaid ? ['pending', 'paid'] : ['pending'])
      .eq('type', 'service')
      .gte('created_at', filters.dateFrom)
      .lte('created_at', filters.dateTo)
      .order('created_at', { ascending: true });

    const { data, error } = await (filters.professionalId ? baseQuery.eq('professional_id', filters.professionalId) : baseQuery);
    if (error) {
      console.error('Erro ao simular reprocessamento:', error);
      toast.error('Não foi possível simular o reprocessamento.');
      return null;
    }

    const rows = (data as Commission[]) ?? [];
    const items: CommissionReprocessPreviewItem[] = [];
    let affectedCount = 0;
    let skippedCount = 0;
    let totalCurrent = 0;
    let totalNext = 0;

    for (const commission of rows) {
      const professional = professionals.find((item) => item.id === commission.professional_id);
      const service = services.find((item) => item.id === commission.service_id);
      const professionalName = professional?.nickname ?? professional?.name ?? commission.professional_name_snapshot ?? 'Profissional';
      const serviceName = service?.name ?? commission.service_name_snapshot ?? 'Serviço';
      const currentValue = Number(commission.commission_value) || 0;
      totalCurrent += currentValue;

      const alreadyPaid = commission.status === 'paid';

      if (!commission.service_id || !commission.professional_id) {
        skippedCount += 1;
        totalNext += currentValue;
        items.push({ commissionId: commission.id, professionalName, serviceName, baseValue: Number(commission.base_value) || 0, currentRate: Number(commission.commission_rate) || 0, currentValue, nextRate: null, nextValue: null, difference: 0, alreadyPaid, status: 'no_service' });
        continue;
      }

      const mapping = await resolveCommissionMapping(commission.service_id, commission.professional_id);
      if (!mapping) {
        skippedCount += 1;
        totalNext += currentValue;
        items.push({ commissionId: commission.id, professionalName, serviceName, baseValue: Number(commission.base_value) || 0, currentRate: Number(commission.commission_rate) || 0, currentValue, nextRate: null, nextValue: null, difference: 0, alreadyPaid, status: 'no_rule' });
        continue;
      }

      const nextRate = Number(mapping.commission_rate) || 0;
      const nextValue = calculateSettlementAmount(
        Number(commission.base_value),
        nextRate,
        mapping.settlement_kind,
      );
      totalNext += nextValue;
      const difference = nextValue - currentValue;
      if (Math.abs(difference) > 0.009) affectedCount += 1;
      items.push({ commissionId: commission.id, professionalName, serviceName, baseValue: Number(commission.base_value) || 0, currentRate: Number(commission.commission_rate) || 0, currentValue, nextRate, nextValue, difference, alreadyPaid, status: 'ok' });
    }

    return {
      items,
      affectedCount,
      skippedCount,
      totalCurrent,
      totalNext,
      totalDifference: totalNext - totalCurrent,
    };
  };

  const reprocessPendingCommissions = async (
    filters: { dateFrom: string; dateTo: string; professionalId?: string | null; includePaid?: boolean }
  ): Promise<CommissionReprocessResult | null> => {
    if (!guardModify()) return null;
    if (!guardFinancialPermission(canPerformAdvancedFinancialOps, 'Somente usuários financeiros podem reprocessar comissões.')) return null;
    if (!tenantId) return null;

    const query = supabase
      .from('commissions')
      .select('*')
      .eq('tenant_id', tenantId)
      .in('status', filters.includePaid ? ['pending', 'paid'] : ['pending'])
      .eq('type', 'service')
      .gte('created_at', filters.dateFrom)
      .lte('created_at', filters.dateTo)
      .order('created_at', { ascending: true });

    const scopedQuery = filters.professionalId
      ? query.eq('professional_id', filters.professionalId)
      : query;

    const { data, error } = await scopedQuery;

    if (error) {
      console.error('Erro ao carregar comissões para reprocessamento:', error);
      toast.error('Não foi possível carregar as comissões para reprocessamento.');
      return null;
    }

    // Ajuste de comissões já pagas exige caixa aberto para lançar a diferença.
    const adjustmentSession = filters.includePaid
      ? getCashOperationTargetSession({ allowPendingSession: true, requireActiveCash: false })
      : null;
    const adjustmentTimestamp = getSessionMovementTimestamp(adjustmentSession);

    const rows = (data as Commission[]) ?? [];
    let recalculatedCount = 0;
    const skippedItems: string[] = [];
    // Acumula as mudanças para aplicar localmente no final, em vez de
    // recarregar todo o histórico financeiro do tenant (fica lento com escala).
    const commissionPatches = new Map<string, Partial<Commission>>();
    const insertedAdjustmentTransactions: Transaction[] = [];

    for (const commission of rows) {
      if (!commission.service_id || !commission.professional_id) {
        skippedItems.push(`${commission.professional_name_snapshot ?? 'Profissional'} sem serviço vinculado no histórico`);
        continue;
      }

      const mapping = await resolveCommissionMapping(commission.service_id, commission.professional_id);
      if (!mapping) {
        skippedItems.push(`${commission.professional_name_snapshot ?? 'Profissional'} / ${commission.service_name_snapshot ?? 'Serviço'} sem regra cadastrada`);
        continue;
      }

      const nextRate = Number(mapping.commission_rate) || 0;
      const settlementKind = normalizeCommissionSettlementKind(mapping.settlement_kind);
      const nextValue = calculateSettlementAmount(
        Number(commission.base_value),
        nextRate,
        settlementKind,
      );
      const professional = professionals.find((item) => item.id === commission.professional_id);
      const service = services.find((item) => item.id === commission.service_id);
      const isPaid = commission.status === 'paid';
      const delta = nextValue - Number(commission.commission_value);

      // Comissão paga: lança no caixa apenas a diferença (ajuste) antes de
      // atualizar o valor. Sem caixa aberto, não altera para não descasar.
      if (isPaid && Math.abs(delta) > 0.009) {
        if (!adjustmentSession) {
          skippedItems.push(`${commission.professional_name_snapshot ?? 'Profissional'} / ${commission.service_name_snapshot ?? 'Serviço'} paga: abra o caixa para lançar o ajuste`);
          continue;
        }
        // payable: delta>0 → saída (paga mais); delta<0 → entrada (estorno).
        // receivable: delta>0 → entrada (recebe mais); delta<0 → saída.
        const baseIsExpense = settlementKind !== 'transfer_receivable';
        const movementType = (delta > 0) === baseIsExpense ? 'expense' : 'income';
        const { data: adjTx, error: adjError } = await supabase.from('transactions').insert({
          cash_session_id: adjustmentSession.id,
          type: movementType,
          category: settlementKind === 'transfer_receivable' ? 'Ajuste de Repasse' : 'Ajuste de Comissão',
          description: `Ajuste (reprocessamento) - ${commission.professional_name_snapshot ?? professional?.nickname ?? 'Profissional'} / ${commission.service_name_snapshot ?? service?.name ?? 'Serviço'}`,
          amount: Math.abs(delta),
          payment_method: commission.payment_method ?? 'other',
          reference_id: commission.id,
          reference_type: 'commission',
          created_by: user?.id,
          tenant_id: tenantId,
          ...(adjustmentTimestamp ? { created_at: adjustmentTimestamp } : {}),
        }).select().single();
        if (adjError) {
          console.error('Erro ao lançar ajuste de comissão:', adjError);
          skippedItems.push(`${commission.professional_name_snapshot ?? 'Profissional'} / ${commission.service_name_snapshot ?? 'Serviço'} com erro no ajuste de caixa`);
          continue;
        }
        if (adjTx) insertedAdjustmentTransactions.push(adjTx as Transaction);
      }

      const patch: Partial<Commission> = {
        commission_rate: nextRate,
        commission_value: nextValue,
        settlement_kind: settlementKind,
        professional_name_snapshot: professional?.nickname ?? professional?.name ?? commission.professional_name_snapshot ?? 'Profissional',
        service_name_snapshot: service?.name ?? commission.service_name_snapshot ?? 'Serviço',
        rule_source_id: mapping.id,
        calculation_source: 'reprocess',
        // Paga mantém-se paga e totalmente liquidada no novo valor.
        ...(isPaid ? { settled_amount: nextValue } : {}),
      };

      const { error: updateError } = await supabase
        .from('commissions')
        .update(patch)
        .eq('id', commission.id)
        .eq('tenant_id', tenantId);

      if (updateError) {
        console.error('Erro ao reprocessar comissão:', updateError);
        skippedItems.push(`${commission.professional_name_snapshot ?? 'Profissional'} / ${commission.service_name_snapshot ?? 'Serviço'} com erro de atualização`);
        continue;
      }

      commissionPatches.set(commission.id, patch);
      recalculatedCount += 1;
    }

    await supabase.from('commission_reprocessing_runs').insert({
      tenant_id: tenantId,
      professional_id: filters.professionalId ?? null,
      date_from: filters.dateFrom,
      date_to: filters.dateTo,
      mode: filters.includePaid ? 'pending_and_paid' : 'pending_only',
      recalculated_count: recalculatedCount,
      skipped_count: skippedItems.length,
      summary: { skipped_items: skippedItems },
      created_by: user?.id ?? null,
    });

    // Otimista: aplica só as linhas que de fato mudaram, em vez de recarregar
    // todo o histórico financeiro do tenant.
    if (commissionPatches.size > 0) {
      setCommissions(prev => prev.map(c => {
        const patch = commissionPatches.get(c.id);
        return patch ? { ...c, ...patch } : c;
      }));
    }
    if (insertedAdjustmentTransactions.length > 0) {
      setTransactions(prev => [...insertedAdjustmentTransactions, ...prev]);
    }

    await recordFinancialAudit({
      actionType: 'commission_reprocessed',
      entityType: 'commission',
      description: 'Reprocessamento de comissões executado.',
      cashSessionId: adjustmentSession?.id ?? null,
      afterState: {
        recalculated_count: recalculatedCount,
        skipped_count: skippedItems.length,
        adjustment_transaction_count: insertedAdjustmentTransactions.length,
      },
      metadata: {
        date_from: filters.dateFrom,
        date_to: filters.dateTo,
        include_paid: filters.includePaid ?? false,
        professional_id: filters.professionalId ?? null,
      },
    });

    return {
      recalculatedCount,
      skippedCount: skippedItems.length,
      skippedItems,
    };
  };

  return (
    <DataContext.Provider value={{
      clients, professionals, services, products, appointments,
      cashSessions, transactions, commissions, currentCashSession, pendingCashSession, selectedHistoricalCashSession,
      activeCashRegularization, loading, cashLoading, transactionsLoading,
      ensureCashSessionState,
      refreshData,
      addClient, updateClient, deleteClient,
      addProfessional, updateProfessional, deleteProfessional,
      addService, updateService, deleteService,
      addProduct, updateProduct, deleteProduct, updateProductStock,
      addAppointment, updateAppointment, deleteAppointment, refundAppointment, completeAppointment,
      fetchAppointmentServices, saveAppointmentServices,
      fetchClientBalances, registerBillPayments,
      openCashSession, reopenCurrentCashSession, closeCashSession, selectHistoricalCashSession, clearHistoricalCashSession,
      startHistoricalCashRegularization, finishHistoricalCashRegularization, cancelHistoricalCashRegularization,
      addTransaction, reverseTransaction,
      payCommission, payAllCommissions, addVoucher, reprocessPendingCommissions, previewReprocessPendingCommissions,
    }}>
      {children}
    </DataContext.Provider>
  );
};
