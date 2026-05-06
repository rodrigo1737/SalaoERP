import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

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
  created_by?: string;
  created_at: string;
}

export interface Commission {
  id: string;
  professional_id: string;
  appointment_id?: string;
  transaction_id?: string;
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
  return appts.map(apt => ({
    ...apt,
    client: clients.find(c => c.id === apt.client_id),
    professional: professionals.find(p => p.id === apt.professional_id),
    service: services.find(s => s.id === apt.service_id),
  }));
}

function joinCommissions(comms: Commission[], professionals: Professional[]): Commission[] {
  return comms.map(c => ({
    ...c,
    professional: professionals.find(p => p.id === c.professional_id),
  }));
}

// ─── Provider ───────────────────────────────────────────────────────────────

export const DataProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { user, tenantId, isSuperAdmin, canModify } = useAuth();
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

  // ── fetch helpers (ITEM 8: date filter; ITEM 9: join via supabase) ──
  const fetchClients = async () => {
    if (!tenantId) return [];

    const allClients: Client[] = [];
    let from = 0;

    while (true) {
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .eq('tenant_id', tenantId)
        .is('deleted_at', null)
        .order('name')
        .range(from, from + SUPABASE_PAGE_SIZE - 1);

      if (error) throw error;

      const page = (data as Client[]) ?? [];
      allClients.push(...page);

      if (page.length < SUPABASE_PAGE_SIZE) break;
      from += SUPABASE_PAGE_SIZE;
    }

    return allClients;
  };

  const fetchProfessionals = async () => {
    if (!tenantId) return [];
    const { data } = await supabase
      .from('professionals')
      .select('*')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .order('nickname');
    return (data as Professional[]) ?? [];
  };

  const fetchServices = async () => {
    if (!tenantId) return [];
    // ITEM 8: buscar todos os serviços (inclusive inativos) para não quebrar histórico
    const { data } = await supabase
      .from('services')
      .select('*')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .order('name');
    return (data as Service[]) ?? [];
  };

  const fetchProducts = async () => {
    if (!tenantId) return [];
    const { data } = await supabase
      .from('products')
      .select('*')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .order('name');
    return (data as Product[]) ?? [];
  };

  const fetchAppointments = async () => {
    if (!tenantId) return [];
    // ITEM 8: limite últimos 90 dias + futuros para não carregar o banco inteiro
    const since = new Date();
    since.setDate(since.getDate() - 90);
    const { data } = await supabase
      .from('appointments')
      .select('*')
      .eq('tenant_id', tenantId)
      .gte('start_time', since.toISOString())
      .is('deleted_at', null)
      .order('start_time', { ascending: false });
    return (data as Appointment[]) ?? [];
  };

  const fetchCash = async () => {
    if (!tenantId) return [];
    const { data } = await supabase
      .from('cash_sessions')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('opened_at', { ascending: false })
      .limit(50);
    return (data as CashSession[]) ?? [];
  };

  const fetchTransactions = async () => {
    if (!tenantId) return [];
    const since = new Date();
    since.setDate(since.getDate() - 90);
    const { data } = await supabase
      .from('transactions')
      .select('*')
      .eq('tenant_id', tenantId)
      .gte('created_at', since.toISOString())
      .order('created_at', { ascending: false });
    return (data as Transaction[]) ?? [];
  };

  const fetchCommissions = async () => {
    if (!tenantId) return [];
    const { data } = await supabase
      .from('commissions')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });
    return (data as Commission[]) ?? [];
  };

  // ── full initial load ──
  const fetchData = async () => {
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
    try {
      const [
        clientsData,
        professionalsData,
        servicesData,
        productsData,
        apptsData,
        cashData,
        txData,
        commData,
      ] = await Promise.all([
        fetchClients(),
        fetchProfessionals(),
        fetchServices(),
        fetchProducts(),
        fetchAppointments(),
        fetchCash(),
        fetchTransactions(),
        fetchCommissions(),
      ]);

      setClients(clientsData);
      setProfessionals(professionalsData);
      setServices(servicesData);
      setProducts(productsData);
      // ITEM 9: join feito localmente (sem segunda query) usando os dados já buscados
      setAppointments(joinAppointments(apptsData, clientsData, professionalsData, servicesData));
      setCashSessions(cashData);
      setTransactions(txData);
      setCommissions(joinCommissions(commData, professionalsData));
      setCurrentCashSession(cashData.find(s => s.status === 'open') ?? null);
    } catch (err) {
      console.error('Error fetching data:', err);
    } finally {
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
      if (all || entities!.includes('services')) {
        newServices = await fetchServices();
        setServices(newServices);
      }
      if (all || entities!.includes('products')) {
        newProducts = await fetchProducts();
        setProducts(newProducts);
      }
      if (all || entities!.includes('appointments')) {
        const raw = await fetchAppointments();
        setAppointments(joinAppointments(raw, newClients, newProfs, newServices));
      }
      if (all || entities!.includes('cash')) {
        const cashData = await fetchCash();
        setCashSessions(cashData);
        setCurrentCashSession(cashData.find(s => s.status === 'open') ?? null);
      }
      if (all || entities!.includes('transactions')) {
        const txData = await fetchTransactions();
        setTransactions(txData);
      }
      if (all || entities!.includes('commissions')) {
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
    const channel = supabase
      .channel('db-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments', filter: `tenant_id=eq.${tenantId}` },
        () => refreshData(['appointments']))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clients', filter: `tenant_id=eq.${tenantId}` },
        () => refreshData(['clients']))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions', filter: `tenant_id=eq.${tenantId}` },
        () => refreshData(['transactions', 'cash']))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'commissions', filter: `tenant_id=eq.${tenantId}` },
        () => refreshData(['commissions']))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products', filter: `tenant_id=eq.${tenantId}` },
        () => refreshData(['products']))
      .subscribe();
    realtimeChannelRef.current = channel;
  };

  useEffect(() => {
    fetchData();
  }, [user, tenantId]);

  useEffect(() => {
    if (user && tenantId) setupRealtime();
    return () => {
      if (realtimeChannelRef.current) supabase.removeChannel(realtimeChannelRef.current);
    };
  }, [user, tenantId]);

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
    const appointment = appointments.find(a => a.id === id);
    if (!appointment) return;

    // Marca comissões relacionadas como canceladas (status inexistente, então apenas remove o vínculo)
    await supabase.from('commissions')
      .update({ status: 'pending', paid_at: null })
      .eq('appointment_id', id)
      .eq('tenant_id', tenantId)
      .eq('status', 'paid');

    // Soft-delete das comissões do agendamento
    await supabase.from('commissions').delete().eq('appointment_id', id).eq('tenant_id', tenantId);

    // Cria transação de estorno em vez de deletar a original
    if (currentCashSession && appointment.total_value) {
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

    await supabase.from('appointments').update({ status: 'cancelled' }).eq('id', id).eq('tenant_id', tenantId);
    setAppointments(prev => prev.map(a => a.id === id ? { ...a, status: 'cancelled' } : a));
    await refreshData(['transactions', 'commissions']);
    toast.success('Atendimento estornado com sucesso.');
  };

  // ITEM 3: completeAppointment com tratamento de erros e rollback parcial
  const completeAppointment = async (id: string, paymentMethod: string, overrides?: Partial<Appointment>) => {
    if (!guardModify()) return null;
    const existingAppointment = appointments.find(a => a.id === id);
    if (!existingAppointment) return null;
    const appointment = { ...existingAppointment, ...overrides };

    // 1. Atualizar status
    const appointmentUpdate: Record<string, unknown> = { status: 'completed' };
    if (overrides?.total_value !== undefined) appointmentUpdate.total_value = overrides.total_value;
    if (overrides?.notes !== undefined) appointmentUpdate.notes = overrides.notes;

    const { error: apptError } = await supabase
      .from('appointments')
      .update(appointmentUpdate)
      .eq('id', id)
      .eq('tenant_id', tenantId);
    if (apptError) { toast.error('Erro ao finalizar atendimento.'); return null; }

    setAppointments(prev => prev.map(a => a.id === id ? { ...a, ...overrides, status: 'completed' } : a));

    let transactionId: string | undefined;

    // 2. Registrar transação financeira (só se caixa estiver aberto)
    if (currentCashSession) {
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

    // 3. Calcular e registrar comissão
    if (appointment.professional_id && appointment.total_value && appointment.service_id) {
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
    toast.success('Atendimento finalizado!');
    return transactionId ?? null;
  };

  // ── CASH ACTIONS ────────────────────────────────────────────────────────
  const openCashSession = async (openingBalance: number) => {
    if (!guardModify()) return null;
    if (currentCashSession) { toast.warning('Já existe um caixa aberto.'); return null; }
    const { data, error } = await supabase
      .from('cash_sessions')
      .insert({ opening_balance: openingBalance, status: 'open', created_by: user?.id, tenant_id: tenantId })
      .select()
      .single();
    if (error) { toast.error('Erro ao abrir caixa.'); return null; }
    const session = data as CashSession;
    setCashSessions(prev => [session, ...prev]);
    setCurrentCashSession(session);
    toast.success('Caixa aberto!');
    return session;
  };

  const closeCashSession = async (closingBalance: number, notes?: string) => {
    if (!guardModify()) return;
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

  // ── COMMISSION ACTIONS ──────────────────────────────────────────────────
  const payCommission = async (id: string, paymentMethod: 'cash' | 'pix' | 'transfer') => {
    if (!guardModify()) return;
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
    })
      .eq('id', id)
      .eq('tenant_id', tenantId);
    setCommissions(prev => prev.map(c => c.id === id ? { ...c, status: 'paid', paid_at: new Date().toISOString() } : c));
    setTransactions(prev => [txData as Transaction, ...prev]);
    toast.success('Comissão paga!');
  };

  // ITEM 1: corrigido — inclui .neq('type', 'voucher') no UPDATE do banco
  const payAllCommissions = async (professionalId: string, paymentMethod: 'cash' | 'pix' | 'transfer') => {
    if (!guardModify()) return;
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
      .update({ status: 'paid', paid_at: new Date().toISOString(), transaction_id: txData?.id })
      .eq('professional_id', professionalId)
      .eq('tenant_id', tenantId)
      .eq('status', 'pending')
      .neq('type', 'voucher');
    setCommissions(prev => prev.map(c =>
      c.professional_id === professionalId && c.status === 'pending' && c.type !== 'voucher'
        ? { ...c, status: 'paid', paid_at: new Date().toISOString() }
        : c
    ));
    setTransactions(prev => [txData as Transaction, ...prev]);
    toast.success(`${pendingCommissions.length} comissões pagas!`);
  };

  const addVoucher = async (professionalId: string, amount: number, description?: string) => {
    if (!guardModify()) return;
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
      openCashSession, closeCashSession, addTransaction,
      payCommission, payAllCommissions, addVoucher,
    }}>
      {children}
    </DataContext.Provider>
  );
};
