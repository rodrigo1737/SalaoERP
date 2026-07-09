import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { isCleaningControlTenant } from '@/lib/tenantSegments';

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
  specialty?: string;
  commission_service?: number;
  commission_product?: number;
  is_active: boolean;
  has_schedule: boolean;
  schedule_color?: string;
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

export interface CashSession {
  id: string;
  opened_at: string;
  closed_at?: string;
  opening_balance: number;
  closing_balance?: number;
  expected_balance?: number;
  difference?: number;
  status: 'open' | 'closed';
  notes?: string;
  created_by?: string;
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
  reversal_reason?: string | null;
  created_by?: string;
  created_at: string;
}

export interface Commission {
  id: string;
  professional_id: string;
  appointment_id?: string;
  transaction_id?: string;
  payment_method?: 'cash' | 'pix' | 'transfer' | null;
  type: 'service' | 'product' | 'voucher';
  base_value: number;
  commission_rate: number;
  commission_value: number;
  status: 'pending' | 'paid';
  paid_at?: string;
  created_at: string;
  professional?: Professional;
}

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
  loading: boolean;
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
  refundAppointment: (id: string) => Promise<void>;
  completeAppointment: (id: string, paymentMethod: string, overrides?: Partial<Appointment>) => Promise<string | null>;
  // Cash
  openCashSession: (openingBalance: number) => Promise<CashSession | null>;
  closeCashSession: (closingBalance: number, notes?: string) => Promise<void>;
  addTransaction: (transaction: Omit<Transaction, 'id' | 'created_at'>) => Promise<Transaction | null>;
  reverseTransaction: (transactionId: string, reason?: string) => Promise<boolean>;
  // Commissions
  payCommission: (id: string, paymentMethod: 'cash' | 'pix' | 'transfer') => Promise<void>;
  payAllCommissions: (professionalId: string, paymentMethod: 'cash' | 'pix' | 'transfer') => Promise<void>;
  addVoucher: (professionalId: string, amount: number, description?: string) => Promise<void>;
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
    professional: professionalsById.get(c.professional_id),
  }));
}

function getLatestOpenCashSession(cashSessions: CashSession[]): CashSession | null {
  return cashSessions
    .filter((session) => session.status === 'open')
    .sort((a, b) => new Date(b.opened_at).getTime() - new Date(a.opened_at).getTime())[0] ?? null;
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
  const realtimeChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const fetchRequestRef = useRef(0);
  const isCleaningTenant = isCleaningControlTenant(currentTenant);
  const isAdminUser = userRole === 'admin';
  const canViewScheduleData = isAdminUser || hasPermission('view_schedule') || hasPermission('edit_schedule');
  const canManageCashFlow = isAdminUser || hasPermission('manage_cash_flow');
  const canCloseBill = isAdminUser || hasPermission('close_bill') || hasPermission('manage_cash_flow');
  const canRefundBills = isAdminUser || hasPermission('refund_bill') || hasPermission('reverse_financial_entries');
  const canViewFinancialHistory = isAdminUser
    || hasPermission('view_financial_history')
    || hasPermission('reverse_financial_entries')
    || hasPermission('manage_cash_flow')
    || hasPermission('refund_bill');
  const canViewCashData = canViewFinancialHistory;
  const canViewCommissionsData = isAdminUser
    || hasPermission('view_commissions')
    || hasPermission('view_financial_history')
    || hasPermission('reverse_financial_entries')
    || hasPermission('manage_cash_flow');

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
      setLoading(false);
      return;
    }

    setLoading(true);
    setAppointments([]);
    setCashSessions([]);
    setCurrentCashSession(null);
    setTransactions([]);
    setCommissions([]);

    try {
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

      Promise.all([
        !isCleaningTenant && canViewScheduleData ? fetchAppointments() : Promise.resolve([] as Appointment[]),
        !isCleaningTenant && canViewCashData ? fetchCash() : Promise.resolve([] as CashSession[]),
        canViewCashData ? fetchTransactions() : Promise.resolve([] as Transaction[]),
        !isCleaningTenant && canViewCommissionsData ? fetchCommissions() : Promise.resolve([] as Commission[]),
      ])
        .then(([apptsData, cashData, txData, commData]) => {
          if (requestId !== fetchRequestRef.current) return;
          setAppointments(joinAppointments(apptsData, clientsData, professionalsData, servicesData));
          setCashSessions(cashData);
          setCurrentCashSession(getLatestOpenCashSession(cashData));
          setTransactions(txData);
          setCommissions(joinCommissions(commData, professionalsData));
        })
        .catch((err) => {
          if (requestId !== fetchRequestRef.current) return;
          console.error('Error fetching background financial data:', err);
        });
    } catch (err) {
      console.error('Error fetching data:', err);
      setLoading(false);
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
        setCashSessions(cashData);
        setCurrentCashSession(getLatestOpenCashSession(cashData));
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
  const setupRealtime = () => {
    if (realtimeChannelRef.current) {
      supabase.removeChannel(realtimeChannelRef.current);
    }
    const channelName = isCleaningTenant ? 'db-changes-cleaning' : 'db-changes-full';
    let channel = supabase
      .channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clients', filter: `tenant_id=eq.${tenantId}` },
        () => refreshData(['clients']))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cash_sessions', filter: `tenant_id=eq.${tenantId}` },
        () => refreshData(['cash']))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions', filter: `tenant_id=eq.${tenantId}` },
        () => refreshData(isCleaningTenant ? ['transactions'] : ['transactions', 'cash']));

    if (!isCleaningTenant) {
      channel = channel
        .on('postgres_changes', { event: '*', schema: 'public', table: 'products', filter: `tenant_id=eq.${tenantId}` },
          () => refreshData(['products']))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments', filter: `tenant_id=eq.${tenantId}` },
          () => refreshData(['appointments']))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'commissions', filter: `tenant_id=eq.${tenantId}` },
          () => refreshData(['commissions']));
    }

    realtimeChannelRef.current = channel.subscribe();
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
    };
  }, [
    user,
    tenantId,
    isCleaningTenant,
    canViewScheduleData,
    canViewCashData,
    canViewCommissionsData,
  ]);

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

  const createReversalTransaction = async (
    originalTransaction: Transaction,
    options?: {
      description?: string;
      category?: string;
      paymentMethod?: Transaction['payment_method'];
      referenceId?: string | null;
      referenceType?: string | null;
      amount?: number;
    },
  ) => {
    if (!tenantId || !user?.id || !currentCashSession) {
      throw new Error('Abra o caixa antes de registrar o estorno.');
    }

    const reversalPayload = {
      cash_session_id: currentCashSession.id,
      type: originalTransaction.type === 'income' ? 'expense' : 'income',
      category: options?.category ?? `Estorno ${originalTransaction.category}`,
      description: options?.description
        ?? `Estorno financeiro: ${originalTransaction.description ?? originalTransaction.category}`,
      amount: options?.amount ?? Number(originalTransaction.amount),
      payment_method: options?.paymentMethod ?? originalTransaction.payment_method ?? 'other',
      reference_id: options?.referenceId ?? originalTransaction.id,
      reference_type: options?.referenceType ?? 'transaction_reversal',
      created_by: user.id,
      tenant_id: tenantId,
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
    toast.success('Agendamento criado!');
    return joined;
  };

  const updateAppointment = async (id: string, data: Partial<Appointment>) => {
    if (!guardModify()) return;
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
    setAppointments(prev => prev.map(a => {
      if (a.id !== id) return a;
      const updated = { ...a, ...data };
      return joinAppointments([updated], clients, professionals, services)[0];
    }));
  };

  // ITEM 4: não deleta comissões manualmente — FK ON DELETE SET NULL já trata isso
  const deleteAppointment = async (id: string) => {
    if (!guardModify()) return;
    // Soft delete para preservar histórico
    const { error } = await supabase
      .from('appointments')
      .update({ deleted_at: new Date().toISOString(), status: 'cancelled' })
      .eq('id', id)
      .eq('tenant_id', tenantId);
    if (error) { toast.error('Erro ao remover agendamento.'); return; }
    setAppointments(prev => prev.filter(a => a.id !== id));
    toast.success('Agendamento removido.');
  };

  // ITEM 2: cria transação de estorno em vez de deletar
  const refundAppointment = async (id: string) => {
    if (!guardModify()) return;
    if (!guardFinancialPermission(canRefundBills, 'Você não tem permissão para estornar comandas.')) return;
    const appointment = appointments.find(a => a.id === id);
    if (!appointment) return;

    if (!currentCashSession) {
      toast.error('Abra o caixa antes de estornar e reabrir uma comanda.');
      return;
    }

    const { data: refundRows, error: reopenError } = await supabase
      .from('appointments')
      .update({ status: 'in_progress' })
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .eq('status', 'completed')
      .select('id');

    if (reopenError) {
      toast.error('Erro ao reabrir a comanda.');
      return;
    }

    const wasReopenedNow = (refundRows?.length ?? 0) > 0;

    if (!wasReopenedNow) {
      const { data: persistedAppointment } = await supabase
        .from('appointments')
        .select('status')
        .eq('id', id)
        .eq('tenant_id', tenantId)
        .maybeSingle();

      if (persistedAppointment?.status !== 'completed') {
        toast.warning('A comanda já está aberta ou não pode ser estornada neste status.');
        return;
      }
    }

    await supabase.from('commissions')
      .delete()
      .eq('appointment_id', id)
      .eq('tenant_id', tenantId);

    const { data: activePaymentTx } = await supabase
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

    if (activePaymentTx?.id) {
      await supabase
        .from('transactions')
        .update({ reference_type: 'appointment_refunded' })
        .eq('tenant_id', tenantId)
        .eq('id', activePaymentTx.id);
    }

    if (wasReopenedNow && appointment.total_value) {
      await supabase.from('transactions').insert({
        cash_session_id: currentCashSession.id,
        type: 'expense',
        category: 'Estorno',
        description: `Estorno: ${appointment.service?.name ?? 'Serviço'} - ${appointment.client?.name ?? 'Cliente'}`,
        amount: appointment.total_value,
        payment_method: 'other',
        reference_id: id,
        reference_type: 'refund',
        created_by: user?.id,
        tenant_id: tenantId,
      });
    }

    setAppointments(prev => prev.map(a => a.id === id ? { ...a, status: 'in_progress' } : a));
    await refreshData(['transactions', 'commissions']);
    toast.success('Pagamento estornado e comanda reaberta com sucesso.');
  };

  // ITEM 3: completeAppointment com tratamento de erros e rollback parcial
  const completeAppointment = async (id: string, paymentMethod: string, overrides?: Partial<Appointment>) => {
    if (!guardModify()) return null;
    if (!guardFinancialPermission(canCloseBill, 'Você não tem permissão para receber e encerrar comandas.')) return null;
    const existingAppointment = appointments.find(a => a.id === id);
    if (!existingAppointment) return null;
    const appointment = { ...existingAppointment, ...overrides };

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

    if (currentCashSession && !transactionId) {
      const { data: txData, error: txError } = await supabase
        .from('transactions')
        .insert({
          cash_session_id: currentCashSession.id,
          type: 'income',
          category: 'service',
          description: `${appointment.service?.name ?? 'Serviço'} - ${appointment.client?.name ?? 'Cliente'}`,
          amount: appointment.total_value ?? 0,
          payment_method: paymentMethod,
          reference_id: id,
          reference_type: 'appointment',
          created_by: user?.id,
          tenant_id: tenantId,
        })
        .select()
        .single();

      if (txError) {
        toast.warning('Atendimento finalizado, mas houve erro ao registrar no caixa. Verifique manualmente.');
      } else {
        transactionId = txData?.id;
      }
    }

    if (appointment.professional_id && appointment.total_value && appointment.service_id && !existingCommission?.id) {
      const { data: spData } = await supabase
        .from('service_professionals')
        .select('commission_rate')
        .eq('service_id', appointment.service_id)
        .eq('professional_id', appointment.professional_id)
        .eq('tenant_id', tenantId)
        .maybeSingle();

      // ITEM 20: aviso explícito quando usando comissão padrão
      const usingDefault = !spData;
      const commissionRate = spData?.commission_rate ?? 50;
      if (usingDefault) {
        toast.warning(`Comissão padrão de 50% aplicada (profissional sem tabela para este serviço).`);
      }

      const commissionValue = (appointment.total_value * commissionRate) / 100;
      const { error: commError } = await supabase.from('commissions').insert({
        professional_id: appointment.professional_id,
        appointment_id: id,
        transaction_id: transactionId,
        type: 'service',
        base_value: appointment.total_value,
        commission_rate: commissionRate,
        commission_value: commissionValue,
        status: 'pending',
        tenant_id: tenantId,
      });

      if (commError) {
        toast.warning('Atendimento finalizado, mas houve erro ao registrar comissão. Verifique manualmente.');
      }
    }

    await refreshData(['transactions', 'commissions']);
    if (wasCompletedNow) {
      toast.success('Atendimento finalizado!');
    }
    return transactionId ?? null;
  };

  // ── CASH ACTIONS ────────────────────────────────────────────────────────
  const openCashSession = async (openingBalance: number) => {
    if (!guardModify()) return null;
    if (!guardFinancialPermission(canManageCashFlow, 'Você não tem permissão para abrir o caixa.')) return null;
    if (currentCashSession) { toast.warning('Já existe um caixa aberto.'); return null; }
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
    setCashSessions(prev => [session, ...prev]);
    setCurrentCashSession(session);
    toast.success('Caixa aberto!');
    return session;
  };

  const closeCashSession = async (closingBalance: number, notes?: string) => {
    if (!guardModify()) return;
    if (!guardFinancialPermission(canManageCashFlow, 'Você não tem permissão para fechar o caixa.')) return;
    if (!currentCashSession) return;
    const sessionTxs = transactions.filter(t => t.cash_session_id === currentCashSession.id);
    const cashTxs = sessionTxs.filter(t => t.payment_method === 'cash');
    const totalCashIn  = cashTxs.filter(t => t.type === 'income') .reduce((s, t) => s + Number(t.amount), 0);
    const totalCashOut = cashTxs.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0);
    const expectedBalance = currentCashSession.opening_balance + totalCashIn - totalCashOut;
    const difference = closingBalance - expectedBalance;
    const { error } = await supabase.from('cash_sessions').update({
      closed_at: new Date().toISOString(),
      closing_balance: closingBalance,
      expected_balance: expectedBalance,
      difference,
      status: 'closed',
      notes,
    })
      .eq('id', currentCashSession.id)
      .eq('tenant_id', tenantId);
    if (error) { toast.error('Erro ao fechar caixa.'); return; }
    await refreshData(['cash']);
    toast.success('Caixa fechado!');
  };

  const addTransaction = async (transactionData: Omit<Transaction, 'id' | 'created_at'>) => {
    if (!guardModify()) return null;
    if (!guardFinancialPermission(canManageCashFlow, 'Você não tem permissão para lançar movimentos financeiros.')) return null;
    if (!currentCashSession) {
      toast.error('Abra o caixa antes de lançar uma movimentação.');
      return null;
    }
    const { data, error } = await supabase
      .from('transactions')
      .insert({ ...transactionData, cash_session_id: currentCashSession?.id, created_by: user?.id, tenant_id: tenantId })
      .select()
      .single();
    if (error) { toast.error('Erro ao registrar transação.'); return null; }
    const tx = data as Transaction;
    setTransactions(prev => [tx, ...prev]);
    toast.success('Transação registrada!');
    return tx;
  };

  const reverseTransaction = async (transactionId: string, reason?: string) => {
    if (!guardModify()) return false;
    if (!guardFinancialPermission(canRefundBills, 'Você não tem permissão para estornar movimentos financeiros.')) return false;
    if (!currentCashSession) {
      toast.error('Abra o caixa antes de registrar um estorno.');
      return false;
    }

    const originalTransaction = transactions.find((transaction) => transaction.id === transactionId);
    if (!originalTransaction) {
      toast.error('Movimentação não encontrada.');
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

      if (originalTransaction.reference_type === 'appointment') {
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

        reversalTransaction = await createReversalTransaction(originalTransaction, {
          category: 'Estorno de Comanda',
          description: `Estorno de comanda: ${originalTransaction.description ?? 'Pagamento do atendimento'}`,
          paymentMethod: originalTransaction.payment_method,
          referenceId: appointmentId,
          referenceType: 'refund',
        });

        await markTransactionAsReversed(originalTransaction.id, reversalTransaction.id, reason, 'appointment_refunded');
      } else if (originalTransaction.reference_type === 'commission') {
        const commissionId = originalTransaction.reference_id;
        if (!commissionId) {
          toast.error('Comissão vinculada não encontrada.');
          return false;
        }

        const { error: commissionError } = await supabase
          .from('commissions')
          .update({ status: 'pending', paid_at: null, transaction_id: null, payment_method: null })
          .eq('id', commissionId)
          .eq('tenant_id', tenantId);

        if (commissionError) throw commissionError;

        reversalTransaction = await createReversalTransaction(originalTransaction, {
          category: 'Estorno de Comissão',
          description: `Estorno de pagamento de comissão: ${originalTransaction.description ?? 'Comissão'}`,
          paymentMethod: originalTransaction.payment_method,
          referenceId: commissionId,
          referenceType: 'commission_reversal',
        });

        await markTransactionAsReversed(originalTransaction.id, reversalTransaction.id, reason);
      } else if (originalTransaction.reference_type === 'commission_batch') {
        const { error: commissionBatchError } = await supabase
          .from('commissions')
          .update({ status: 'pending', paid_at: null, transaction_id: null, payment_method: null })
          .eq('tenant_id', tenantId)
          .eq('transaction_id', originalTransaction.id);

        if (commissionBatchError) throw commissionBatchError;

        reversalTransaction = await createReversalTransaction(originalTransaction, {
          category: 'Estorno de Comissões',
          description: `Estorno de pagamento em lote: ${originalTransaction.description ?? 'Comissões'}`,
          paymentMethod: originalTransaction.payment_method,
          referenceId: originalTransaction.reference_id,
          referenceType: 'commission_batch_reversal',
        });

        await markTransactionAsReversed(originalTransaction.id, reversalTransaction.id, reason);
      } else if (originalTransaction.reference_type === 'voucher') {
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
      } else {
        reversalTransaction = await createReversalTransaction(originalTransaction, {
          category: `Estorno ${originalTransaction.category}`,
          description: `Estorno financeiro: ${originalTransaction.description ?? originalTransaction.category}`,
          paymentMethod: originalTransaction.payment_method,
        });

        await markTransactionAsReversed(originalTransaction.id, reversalTransaction.id, reason);
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
  const payCommission = async (id: string, paymentMethod: 'cash' | 'pix' | 'transfer') => {
    if (!guardModify()) return;
    if (!guardFinancialPermission(canManageCashFlow, 'Você não tem permissão para pagar comissões.')) return;
    if (!currentCashSession) {
      toast.error('Abra o caixa antes de pagar comissões.');
      return;
    }
    const commission = commissions.find(c => c.id === id);
    if (!commission) { toast.error('Comissão não encontrada.'); return; }
    const professional = professionals.find(p => p.id === commission.professional_id);
    const methodLabel = paymentMethod === 'cash' ? 'Dinheiro' : paymentMethod === 'pix' ? 'PIX' : 'Transferência';
    const { data: txData, error: txError } = await supabase
      .from('transactions')
      .insert({
        cash_session_id: currentCashSession?.id,
        type: 'expense',
        category: 'Pagamento de Comissão',
        description: `Comissão - ${professional?.nickname ?? 'Profissional'} (${methodLabel})`,
        amount: Number(commission.commission_value),
        payment_method: paymentMethod === 'transfer' ? 'other' : paymentMethod,
        reference_id: id,
        reference_type: 'commission',
        created_by: user?.id,
        tenant_id: tenantId,
      })
      .select()
      .single();
    if (txError) { toast.error('Erro ao registrar pagamento no caixa.'); return; }
    await supabase.from('commissions').update({
      status: 'paid',
      paid_at: new Date().toISOString(),
      transaction_id: txData?.id,
      payment_method: paymentMethod,
    })
      .eq('id', id)
      .eq('tenant_id', tenantId);
    setCommissions(prev => prev.map(c => c.id === id ? {
      ...c,
      status: 'paid',
      paid_at: new Date().toISOString(),
      transaction_id: txData?.id,
      payment_method: paymentMethod,
    } : c));
    setTransactions(prev => [txData as Transaction, ...prev]);
    toast.success('Comissão paga!');
  };

  // ITEM 1: corrigido — inclui .neq('type', 'voucher') no UPDATE do banco
  const payAllCommissions = async (professionalId: string, paymentMethod: 'cash' | 'pix' | 'transfer') => {
    if (!guardModify()) return;
    if (!guardFinancialPermission(canManageCashFlow, 'Você não tem permissão para pagar comissões.')) return;
    if (!currentCashSession) {
      toast.error('Abra o caixa antes de pagar comissões.');
      return;
    }
    const pendingCommissions = commissions.filter(
      c => c.professional_id === professionalId && c.status === 'pending' && c.type !== 'voucher'
    );
    if (pendingCommissions.length === 0) { toast.info('Nenhuma comissão pendente para pagar.'); return; }
    const totalAmount = pendingCommissions.reduce((s, c) => s + Number(c.commission_value), 0);
    const professional = professionals.find(p => p.id === professionalId);
    const methodLabel = paymentMethod === 'cash' ? 'Dinheiro' : paymentMethod === 'pix' ? 'PIX' : 'Transferência';
    const { data: txData, error: txError } = await supabase
      .from('transactions')
      .insert({
        cash_session_id: currentCashSession?.id,
        type: 'expense',
        category: 'Pagamento de Comissão',
        description: `Comissões (${pendingCommissions.length}x) - ${professional?.nickname ?? 'Profissional'} (${methodLabel})`,
        amount: totalAmount,
        payment_method: paymentMethod === 'transfer' ? 'other' : paymentMethod,
        reference_id: professionalId,
        reference_type: 'commission_batch',
        created_by: user?.id,
        tenant_id: tenantId,
      })
      .select()
      .single();
    if (txError) { toast.error('Erro ao registrar pagamento no caixa.'); return; }
    // ITEM 1: filtro .neq('type', 'voucher') adicionado para evitar pagar vouchers
    await supabase
      .from('commissions')
      .update({
        status: 'paid',
        paid_at: new Date().toISOString(),
        transaction_id: txData?.id,
        payment_method: paymentMethod,
      })
      .eq('professional_id', professionalId)
      .eq('tenant_id', tenantId)
      .eq('status', 'pending')
      .neq('type', 'voucher');
    setCommissions(prev => prev.map(c =>
      c.professional_id === professionalId && c.status === 'pending' && c.type !== 'voucher'
        ? {
            ...c,
            status: 'paid',
            paid_at: new Date().toISOString(),
            transaction_id: txData?.id,
            payment_method: paymentMethod,
          }
        : c
    ));
    setTransactions(prev => [txData as Transaction, ...prev]);
    toast.success(`${pendingCommissions.length} comissões pagas!`);
  };

  const addVoucher = async (professionalId: string, amount: number, description?: string) => {
    if (!guardModify()) return;
    if (!guardFinancialPermission(canManageCashFlow, 'Você não tem permissão para registrar vales.')) return;
    if (!currentCashSession) {
      toast.error('Abra o caixa antes de registrar vales.');
      return;
    }
    const professional = professionals.find(p => p.id === professionalId);
    const voucherDescription = description ?? `Vale para ${professional?.nickname ?? 'Profissional'}`;
    const { data: txData, error: txError } = await supabase
      .from('transactions')
      .insert({
        cash_session_id: currentCashSession?.id,
        type: 'expense',
        category: 'Vale',
        description: voucherDescription,
        amount,
        payment_method: 'cash',
        reference_id: professionalId,
        reference_type: 'voucher',
        created_by: user?.id,
        tenant_id: tenantId,
      })
      .select()
      .single();
    if (txError) { toast.error('Erro ao registrar vale.'); return; }
    const { error: commError } = await supabase.from('commissions').insert({
      professional_id: professionalId,
      transaction_id: txData?.id,
      type: 'voucher',
      base_value: amount,
      commission_rate: 100,
      commission_value: -amount,
      status: 'paid',
      paid_at: new Date().toISOString(),
      tenant_id: tenantId,
    });
    if (commError) { toast.error('Erro ao registrar vale nas comissões.'); return; }
    await refreshData(['transactions', 'commissions']);
    toast.success('Vale registrado!');
  };

  return (
    <DataContext.Provider value={{
      clients, professionals, services, products, appointments,
      cashSessions, transactions, commissions, currentCashSession, loading,
      refreshData,
      addClient, updateClient, deleteClient,
      addProfessional, updateProfessional, deleteProfessional,
      addService, updateService, deleteService,
      addProduct, updateProduct, deleteProduct, updateProductStock,
      addAppointment, updateAppointment, deleteAppointment, refundAppointment, completeAppointment,
      openCashSession, closeCashSession, addTransaction, reverseTransaction,
      payCommission, payAllCommissions, addVoucher,
    }}>
      {children}
    </DataContext.Provider>
  );
};
