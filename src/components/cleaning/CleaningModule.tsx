import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { addMinutes, format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  DollarSign,
  Home,
  KeyRound,
  Loader2,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/context/DataContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

type CleaningStatus = 'scheduled' | 'confirmed' | 'on_the_way' | 'in_progress' | 'completed' | 'cancelled' | 'no_show';
type FinancialStatus = 'pending' | 'partial' | 'paid' | 'commission_paid' | 'cancelled';
type CommissionType = 'percent' | 'fixed' | 'mixed';

interface CleaningProperty {
  id: string;
  tenant_id: string;
  client_id: string;
  name: string;
  property_type: string;
  address: string;
  complement?: string | null;
  access_instructions?: string | null;
  internal_notes?: string | null;
  default_duration_minutes: number;
  default_price: number;
  default_recurrence: string;
  is_active: boolean;
}

interface CleaningService {
  id: string;
  name: string;
  category: string;
  duration_minutes: number;
  default_price: number;
  cost_price: number;
  commission_type: CommissionType;
  commission_percent: number;
  commission_fixed: number;
  requires_checklist: boolean;
  requires_photos: boolean;
  uses_product_control_default: boolean;
  is_active: boolean;
}

interface CleaningTeam {
  id: string;
  name: string;
  leader_professional_id?: string | null;
  color?: string | null;
  capacity_per_day: number;
  regions?: string | null;
  is_active: boolean;
}

interface CleaningTeamMember {
  id: string;
  team_id: string;
  professional_id: string;
}

interface CleaningAppointment {
  id: string;
  client_id: string;
  property_id?: string | null;
  service_setting_id?: string | null;
  professional_id?: string | null;
  team_id?: string | null;
  start_time: string;
  end_time: string;
  status: CleaningStatus;
  financial_status: FinancialStatus;
  recurrence_type: string;
  address: string;
  access_instructions?: string | null;
  service_name_snapshot: string;
  client_name_snapshot: string;
  assignee_name_snapshot?: string | null;
  quoted_amount: number;
  commission_amount: number;
  uses_product_control: boolean;
  requires_checklist: boolean;
  requires_photos: boolean;
  internal_notes?: string | null;
  execution_notes?: string | null;
}

interface CleaningFinancialEntry {
  id: string;
  appointment_id?: string | null;
  entry_type: 'receivable' | 'received' | 'expense' | 'commission_payment';
  category: string;
  description?: string | null;
  amount: number;
  payment_method?: string | null;
  status: 'pending' | 'paid' | 'cancelled';
  due_date?: string | null;
  paid_at?: string | null;
}

interface CleaningCommissionPayable {
  id: string;
  appointment_id?: string | null;
  professional_id?: string | null;
  team_id?: string | null;
  base_amount: number;
  commission_amount: number;
  status: 'pending' | 'approved' | 'paid' | 'cancelled';
  due_date?: string | null;
  paid_at?: string | null;
}

interface CleaningChecklistItem {
  id: string;
  appointment_id: string;
  label: string;
  is_required: boolean;
  is_completed: boolean;
  sort_order: number;
}

interface CleaningPhoto {
  id: string;
  appointment_id: string;
  photo_type: 'before' | 'after' | 'issue' | 'delivery';
  storage_path: string;
  notes?: string | null;
}

interface StaffVisibility {
  id?: string;
  professional_id: string;
  can_view_client_phone: boolean;
  can_view_full_address: boolean;
  can_view_access_instructions: boolean;
  can_view_internal_notes: boolean;
  can_view_customer_price: boolean;
  can_view_own_commission: boolean;
  can_view_financial_status: boolean;
  can_view_team_schedule: boolean;
  can_view_client_history: boolean;
  can_manage_products_used: boolean;
  can_cancel_own_appointment: boolean;
}

const db = supabase as any;
const CLEANING_PAGE_SIZE = 1000;

async function fetchCleaningPages<T>(queryFactory: () => any): Promise<T[]> {
  const rows: T[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await queryFactory().range(from, from + CLEANING_PAGE_SIZE - 1);
    if (error) throw error;

    const page = (data as T[]) ?? [];
    rows.push(...page);

    if (page.length < CLEANING_PAGE_SIZE) break;
    from += CLEANING_PAGE_SIZE;
  }

  return rows;
}

const statusLabels: Record<CleaningStatus, string> = {
  scheduled: 'Agendado',
  confirmed: 'Confirmado',
  on_the_way: 'Em deslocamento',
  in_progress: 'Em andamento',
  completed: 'Concluído',
  cancelled: 'Cancelado',
  no_show: 'Não compareceu',
};

const financialLabels: Record<FinancialStatus, string> = {
  pending: 'Pendente',
  partial: 'Parcial',
  paid: 'Pago',
  commission_paid: 'Repassado',
  cancelled: 'Cancelado',
};

const visibilityLabels: Array<{ key: keyof Omit<StaffVisibility, 'id' | 'professional_id'>; label: string }> = [
  { key: 'can_view_client_phone', label: 'Ver telefone do cliente' },
  { key: 'can_view_full_address', label: 'Ver endereço completo' },
  { key: 'can_view_access_instructions', label: 'Ver instruções de acesso' },
  { key: 'can_view_internal_notes', label: 'Ver observações internas' },
  { key: 'can_view_customer_price', label: 'Ver valor cobrado' },
  { key: 'can_view_own_commission', label: 'Ver própria comissão' },
  { key: 'can_view_financial_status', label: 'Ver status financeiro' },
  { key: 'can_view_team_schedule', label: 'Ver agenda da equipe' },
  { key: 'can_view_client_history', label: 'Ver histórico do cliente' },
  { key: 'can_manage_products_used', label: 'Informar produtos utilizados' },
  { key: 'can_cancel_own_appointment', label: 'Cancelar atendimento próprio' },
];

const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

const defaultChecklistItems = [
  'Banheiros',
  'Cozinha',
  'Quartos',
  'Sala',
  'Varanda',
  'Retirada de lixo',
  'Fotos antes',
  'Fotos depois',
  'Observações finais',
];

const initialProperty = {
  client_id: '',
  name: '',
  property_type: 'apartamento',
  address: '',
  complement: '',
  access_instructions: '',
  internal_notes: '',
  default_duration_minutes: 180,
  default_price: 0,
  default_recurrence: 'none',
};

const initialService = {
  name: '',
  category: 'Limpeza',
  duration_minutes: 180,
  default_price: 0,
  cost_price: 0,
  commission_type: 'percent' as CommissionType,
  commission_percent: 0,
  commission_fixed: 0,
  requires_checklist: true,
  requires_photos: true,
  uses_product_control_default: false,
};

const initialTeam = {
  name: '',
  leader_professional_id: '',
  color: '#2563eb',
  capacity_per_day: 1,
  regions: '',
};

const todayISO = () => new Date().toISOString().slice(0, 10);

const initialAppointment = {
  client_id: '',
  property_id: '',
  service_setting_id: '',
  assignee_type: 'professional',
  professional_id: '',
  team_id: '',
  date: todayISO(),
  time: '09:00',
  recurrence_type: 'none',
  address: '',
  access_instructions: '',
  quoted_amount: 0,
  commission_amount: 0,
  uses_product_control: false,
  requires_checklist: true,
  requires_photos: true,
  internal_notes: '',
};

function calculateCommission(amount: number, type: CommissionType, percent: number, fixed: number) {
  if (type === 'fixed') return fixed;
  if (type === 'mixed') return fixed + (amount * percent) / 100;
  return (amount * percent) / 100;
}

export function CleaningModule() {
  const { currentTenant, tenantId, user, userRole, hasPermission, canModify } = useAuth();
  const { clients, professionals, refreshData, currentCashSession } = useData();
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('agenda');
  const [properties, setProperties] = useState<CleaningProperty[]>([]);
  const [services, setServices] = useState<CleaningService[]>([]);
  const [teams, setTeams] = useState<CleaningTeam[]>([]);
  const [teamMembers, setTeamMembers] = useState<CleaningTeamMember[]>([]);
  const [appointments, setAppointments] = useState<CleaningAppointment[]>([]);
  const [financialEntries, setFinancialEntries] = useState<CleaningFinancialEntry[]>([]);
  const [commissions, setCommissions] = useState<CleaningCommissionPayable[]>([]);
  const [checklistItems, setChecklistItems] = useState<CleaningChecklistItem[]>([]);
  const [photos, setPhotos] = useState<CleaningPhoto[]>([]);
  const [visibility, setVisibility] = useState<StaffVisibility[]>([]);
  const [selectedDate, setSelectedDate] = useState(todayISO());
  const [propertyForm, setPropertyForm] = useState(initialProperty);
  const [serviceForm, setServiceForm] = useState(initialService);
  const [teamForm, setTeamForm] = useState(initialTeam);
  const [appointmentForm, setAppointmentForm] = useState(initialAppointment);
  const [teamMemberSelection, setTeamMemberSelection] = useState<Record<string, string>>({});
  const [dialogs, setDialogs] = useState({ property: false, service: false, team: false, appointment: false });

  const isAdmin = userRole === 'admin';
  const cleaningEnabled = currentTenant?.package_type === 'cleaning_control' || currentTenant?.package_type === 'business_erp';
  const canOperateCleaning = isAdmin || hasPermission('edit_schedule');
  const canManageCleaning = canModify() && canOperateCleaning;
  const canViewFinancial = isAdmin || hasPermission('manage_cash_flow');
  const canViewCommissions = canViewFinancial || hasPermission('view_commissions');

  const recordCleaningTransaction = useCallback(async (transaction: {
    type: 'income' | 'expense';
    category: string;
    description: string;
    amount: number;
    payment_method?: 'cash' | 'credit_card' | 'debit_card' | 'pix' | 'other';
    reference_id: string;
    reference_type: string;
  }) => {
    if (!tenantId) return null;

    const { data, error } = await db
      .from('transactions')
      .insert({
        ...transaction,
        cash_session_id: currentCashSession?.id ?? null,
        tenant_id: tenantId,
        created_by: user?.id,
      })
      .select()
      .single();

    if (error) {
      console.error('Error recording cleaning financial transaction:', error);
      toast.warning('Lançamento atualizado, mas não entrou no caixa global. Verifique manualmente.');
      return null;
    }

    await refreshData(['transactions', 'cash']);
    return data;
  }, [currentCashSession?.id, tenantId, user?.id, refreshData]);

  const cleaningProfessionals = useMemo(
    () => professionals.filter((professional) => professional.works_cleaning || professional.has_schedule),
    [professionals],
  );

  const loadCleaningData = useCallback(async () => {
    if (!tenantId || !cleaningEnabled) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const [
        propertiesData,
        servicesData,
        teamsData,
        membersData,
        appointmentsData,
        checklistData,
        photosData,
        financialData,
        commissionsData,
        visibilityData,
      ] = await Promise.all([
        canOperateCleaning
          ? fetchCleaningPages<CleaningProperty>(() => db.from('cleaning_properties').select('*').eq('tenant_id', tenantId).is('deleted_at', null).order('name'))
          : Promise.resolve([]),
        canOperateCleaning
          ? fetchCleaningPages<CleaningService>(() => db.from('cleaning_service_settings').select('*').eq('tenant_id', tenantId).is('deleted_at', null).order('name'))
          : Promise.resolve([]),
        canOperateCleaning
          ? fetchCleaningPages<CleaningTeam>(() => db.from('cleaning_teams').select('*').eq('tenant_id', tenantId).is('deleted_at', null).order('name'))
          : Promise.resolve([]),
        canOperateCleaning
          ? fetchCleaningPages<CleaningTeamMember>(() => db.from('cleaning_team_members').select('*').eq('tenant_id', tenantId).is('deleted_at', null))
          : Promise.resolve([]),
        fetchCleaningPages<CleaningAppointment>(() =>
          db
            .from('cleaning_appointments')
            .select('*')
            .eq('tenant_id', tenantId)
            .is('deleted_at', null)
            .order('start_time', { ascending: true }),
        ),
        fetchCleaningPages<CleaningChecklistItem>(() => db.from('cleaning_appointment_checklist').select('*').eq('tenant_id', tenantId).order('sort_order')),
        fetchCleaningPages<CleaningPhoto>(() => db.from('cleaning_appointment_photos').select('*').eq('tenant_id', tenantId).is('deleted_at', null).order('created_at', { ascending: false })),
        canViewFinancial
          ? fetchCleaningPages<CleaningFinancialEntry>(() => db.from('cleaning_financial_entries').select('*').eq('tenant_id', tenantId).is('deleted_at', null).order('created_at', { ascending: false }))
          : Promise.resolve([]),
        canViewCommissions
          ? fetchCleaningPages<CleaningCommissionPayable>(() => db.from('cleaning_commission_payables').select('*').eq('tenant_id', tenantId).is('deleted_at', null).order('created_at', { ascending: false }))
          : Promise.resolve([]),
        isAdmin
          ? fetchCleaningPages<StaffVisibility>(() => db.from('cleaning_staff_visibility').select('*').eq('tenant_id', tenantId))
          : Promise.resolve([]),
      ]);

      setProperties(propertiesData);
      setServices(servicesData);
      setTeams(teamsData);
      setTeamMembers(membersData);
      setAppointments(appointmentsData);
      setChecklistItems(checklistData);
      setPhotos(photosData);
      setFinancialEntries(financialData);
      setCommissions(commissionsData);
      setVisibility(visibilityData);
    } catch (error) {
      console.error('Error loading cleaning module:', error);
      toast.error('Erro ao carregar o módulo de limpeza.');
    } finally {
      setLoading(false);
    }
  }, [tenantId, cleaningEnabled, canOperateCleaning, canViewFinancial, canViewCommissions, isAdmin]);

  useEffect(() => {
    loadCleaningData();
  }, [loadCleaningData]);

  const dashboard = useMemo(() => {
    const dayAppointments = appointments.filter((appointment) => appointment.start_time.slice(0, 10) === selectedDate);
    const revenue = financialEntries
      .filter((entry) => entry.entry_type === 'receivable' || entry.entry_type === 'received')
      .reduce((sum, entry) => sum + Number(entry.amount ?? 0), 0);
    const expenses = financialEntries
      .filter((entry) => entry.entry_type === 'expense')
      .reduce((sum, entry) => sum + Number(entry.amount ?? 0), 0);
    const commissionTotal = commissions.reduce((sum, entry) => sum + Number(entry.commission_amount ?? 0), 0);

    return {
      dayAppointments,
      revenue,
      expenses,
      commissionTotal,
      grossProfit: revenue - expenses - commissionTotal,
    };
  }, [appointments, selectedDate, financialEntries, commissions]);

  const updateAppointmentDefaults = (field: string, value: string | number | boolean) => {
    const next = { ...appointmentForm, [field]: value };

    if (field === 'client_id') {
      next.property_id = '';
      next.address = '';
      next.access_instructions = '';
    }

    if (field === 'property_id') {
      const property = properties.find((item) => item.id === value);
      if (property) {
        next.client_id = property.client_id;
        next.address = [property.address, property.complement].filter(Boolean).join(' - ');
        next.access_instructions = property.access_instructions ?? '';
        next.quoted_amount = Number(property.default_price ?? next.quoted_amount);
        next.recurrence_type = property.default_recurrence || 'none';
      }
    }

    if (field === 'service_setting_id') {
      const service = services.find((item) => item.id === value);
      if (service) {
        next.quoted_amount = Number(service.default_price ?? 0);
        next.commission_amount = calculateCommission(
          Number(service.default_price ?? 0),
          service.commission_type,
          Number(service.commission_percent ?? 0),
          Number(service.commission_fixed ?? 0),
        );
        next.uses_product_control = service.uses_product_control_default;
        next.requires_checklist = service.requires_checklist;
        next.requires_photos = service.requires_photos;
      }
    }

    if (field === 'quoted_amount') {
      const service = services.find((item) => item.id === next.service_setting_id);
      if (service) {
        next.commission_amount = calculateCommission(
          Number(value),
          service.commission_type,
          Number(service.commission_percent ?? 0),
          Number(service.commission_fixed ?? 0),
        );
      }
    }

    setAppointmentForm(next);
  };

  const createProperty = async () => {
    if (!tenantId || !propertyForm.client_id || !propertyForm.name.trim() || !propertyForm.address.trim()) {
      toast.error('Informe cliente, nome do local e endereço.');
      return;
    }

    const { error } = await db.from('cleaning_properties').insert({
      ...propertyForm,
      tenant_id: tenantId,
      default_duration_minutes: Number(propertyForm.default_duration_minutes),
      default_price: Number(propertyForm.default_price),
    });

    if (error) {
      toast.error('Erro ao cadastrar imóvel.');
      return;
    }

    toast.success('Imóvel cadastrado.');
    setPropertyForm(initialProperty);
    setDialogs((prev) => ({ ...prev, property: false }));
    loadCleaningData();
  };

  const createService = async () => {
    if (!tenantId || !serviceForm.name.trim()) {
      toast.error('Informe o nome do serviço.');
      return;
    }

    const { error } = await db.from('cleaning_service_settings').insert({
      ...serviceForm,
      tenant_id: tenantId,
      duration_minutes: Number(serviceForm.duration_minutes),
      default_price: Number(serviceForm.default_price),
      cost_price: Number(serviceForm.cost_price),
      commission_percent: Number(serviceForm.commission_percent),
      commission_fixed: Number(serviceForm.commission_fixed),
    });

    if (error) {
      toast.error('Erro ao cadastrar serviço.');
      return;
    }

    toast.success('Serviço cadastrado.');
    setServiceForm(initialService);
    setDialogs((prev) => ({ ...prev, service: false }));
    loadCleaningData();
  };

  const createTeam = async () => {
    if (!tenantId || !teamForm.name.trim()) {
      toast.error('Informe o nome da equipe.');
      return;
    }

    const { error } = await db.from('cleaning_teams').insert({
      ...teamForm,
      tenant_id: tenantId,
      leader_professional_id: teamForm.leader_professional_id || null,
      capacity_per_day: Number(teamForm.capacity_per_day),
    });

    if (error) {
      toast.error('Erro ao cadastrar equipe.');
      return;
    }

    toast.success('Equipe cadastrada.');
    setTeamForm(initialTeam);
    setDialogs((prev) => ({ ...prev, team: false }));
    loadCleaningData();
  };

  const toggleWorksCleaning = async (professionalId: string, enabled: boolean) => {
    const { error } = await db
      .from('professionals')
      .update({ works_cleaning: enabled })
      .eq('id', professionalId)
      .eq('tenant_id', tenantId);

    if (error) {
      toast.error('Erro ao atualizar profissional.');
      return;
    }

    await refreshData(['professionals']);
    toast.success(enabled ? 'Profissional liberado para limpeza.' : 'Profissional removido da limpeza.');
  };

  const addTeamMember = async (teamId: string) => {
    if (!tenantId) return;
    const professionalId = teamMemberSelection[teamId];
    if (!professionalId) {
      toast.error('Selecione um profissional.');
      return;
    }

    const { error } = await db.from('cleaning_team_members').upsert({
      tenant_id: tenantId,
      team_id: teamId,
      professional_id: professionalId,
      deleted_at: null,
    }, { onConflict: 'team_id,professional_id' });

    if (error) {
      toast.error('Erro ao adicionar membro.');
      return;
    }

    setTeamMemberSelection((prev) => ({ ...prev, [teamId]: '' }));
    toast.success('Membro adicionado à equipe.');
    loadCleaningData();
  };

  const removeTeamMember = async (memberId: string) => {
    const { error } = await db
      .from('cleaning_team_members')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', memberId)
      .eq('tenant_id', tenantId);

    if (error) {
      toast.error('Erro ao remover membro.');
      return;
    }

    toast.success('Membro removido da equipe.');
    loadCleaningData();
  };

  const createAppointment = async () => {
    if (!tenantId) return;
    const client = clients.find((item) => item.id === appointmentForm.client_id);
    const service = services.find((item) => item.id === appointmentForm.service_setting_id);
    const professional = professionals.find((item) => item.id === appointmentForm.professional_id);
    const team = teams.find((item) => item.id === appointmentForm.team_id);
    const property = properties.find((item) => item.id === appointmentForm.property_id);

    if (!client || !service || !appointmentForm.address.trim()) {
      toast.error('Informe cliente, serviço e endereço.');
      return;
    }

    if (appointmentForm.assignee_type === 'professional' && !professional) {
      toast.error('Selecione o profissional.');
      return;
    }

    if (appointmentForm.assignee_type === 'team' && !team) {
      toast.error('Selecione a equipe.');
      return;
    }

    const start = new Date(`${appointmentForm.date}T${appointmentForm.time}:00`);
    const end = addMinutes(start, service.duration_minutes);
    const quotedAmount = Number(appointmentForm.quoted_amount);
    const commissionAmount = Number(appointmentForm.commission_amount);

    const { data, error } = await db
      .from('cleaning_appointments')
      .insert({
        tenant_id: tenantId,
        client_id: client.id,
        property_id: property?.id ?? null,
        service_setting_id: service.id,
        professional_id: appointmentForm.assignee_type === 'professional' ? professional?.id : null,
        team_id: appointmentForm.assignee_type === 'team' ? team?.id : null,
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        recurrence_type: appointmentForm.recurrence_type,
        address: appointmentForm.address.trim(),
        access_instructions: appointmentForm.access_instructions.trim() || null,
        service_name_snapshot: service.name,
        client_name_snapshot: client.name,
        assignee_name_snapshot: professional?.nickname || professional?.name || team?.name || null,
        quoted_amount: quotedAmount,
        commission_amount: commissionAmount,
        uses_product_control: appointmentForm.uses_product_control,
        requires_checklist: appointmentForm.requires_checklist,
        requires_photos: appointmentForm.requires_photos,
        internal_notes: appointmentForm.internal_notes.trim() || null,
      })
      .select()
      .single();

    if (error) {
      toast.error('Erro ao criar agendamento de limpeza.');
      return;
    }

    await Promise.all([
      db.from('cleaning_financial_entries').insert({
        tenant_id: tenantId,
        appointment_id: data.id,
        entry_type: 'receivable',
        category: 'Limpeza',
        description: `${service.name} - ${client.name}`,
        amount: quotedAmount,
        status: 'pending',
        due_date: appointmentForm.date,
      }),
      commissionAmount > 0
        ? db.from('cleaning_commission_payables').insert({
            tenant_id: tenantId,
            appointment_id: data.id,
            professional_id: appointmentForm.assignee_type === 'professional' ? professional?.id : null,
            team_id: appointmentForm.assignee_type === 'team' ? team?.id : null,
            base_amount: quotedAmount,
            commission_amount: commissionAmount,
            status: 'pending',
            due_date: appointmentForm.date,
          })
        : Promise.resolve({ error: null }),
      appointmentForm.requires_checklist
        ? db.from('cleaning_appointment_checklist').insert(
            defaultChecklistItems.map((label, index) => ({
              tenant_id: tenantId,
              appointment_id: data.id,
              label,
              is_required: !label.toLowerCase().includes('observa'),
              sort_order: index,
            })),
          )
        : Promise.resolve({ error: null }),
    ]);

    toast.success('Agendamento de limpeza criado.');
    setAppointmentForm(initialAppointment);
    setDialogs((prev) => ({ ...prev, appointment: false }));
    loadCleaningData();
  };

  const updateAppointmentStatus = async (appointment: CleaningAppointment, status: CleaningStatus) => {
    if (status === 'completed') {
      const items = checklistItems.filter((item) => item.appointment_id === appointment.id);
      const missingRequiredItems = appointment.requires_checklist
        && items.some((item) => item.is_required && !item.is_completed);
      const appointmentPhotos = photos.filter((photo) => photo.appointment_id === appointment.id);
      const hasBefore = appointmentPhotos.some((photo) => photo.photo_type === 'before');
      const hasAfter = appointmentPhotos.some((photo) => photo.photo_type === 'after');

      if (missingRequiredItems) {
        toast.error('Conclua os itens obrigatórios do checklist antes de finalizar.');
        return;
      }

      if (appointment.requires_photos && (!hasBefore || !hasAfter)) {
        toast.error('Inclua fotos antes e depois antes de finalizar.');
        return;
      }
    }

    const payload: Record<string, unknown> = { status };
    if (status === 'in_progress') payload.started_at = new Date().toISOString();
    if (status === 'completed') {
      payload.completed_at = new Date().toISOString();
      payload.financial_status = appointment.financial_status === 'pending' ? 'pending' : appointment.financial_status;
    }
    if (status === 'cancelled') {
      payload.cancelled_at = new Date().toISOString();
      payload.financial_status = 'cancelled';
    }

    const { error } = await db
      .from('cleaning_appointments')
      .update(payload)
      .eq('id', appointment.id)
      .eq('tenant_id', tenantId);

    if (error) {
      toast.error('Erro ao atualizar atendimento.');
      return;
    }

    toast.success('Atendimento atualizado.');
    loadCleaningData();
  };

  const toggleChecklistItem = async (item: CleaningChecklistItem, checked: boolean) => {
    const { error } = await db
      .from('cleaning_appointment_checklist')
      .update({
        is_completed: checked,
        completed_at: checked ? new Date().toISOString() : null,
      })
      .eq('id', item.id)
      .eq('tenant_id', tenantId);

    if (error) {
      toast.error('Erro ao atualizar checklist.');
      return;
    }

    setChecklistItems((prev) => prev.map((entry) => (
      entry.id === item.id ? { ...entry, is_completed: checked } : entry
    )));
  };

  const uploadPhoto = async (appointment: CleaningAppointment, file: File, photoType: CleaningPhoto['photo_type']) => {
    if (!tenantId || !file) return;

    const extension = file.name.split('.').pop() || 'jpg';
    const path = `${tenantId}/${appointment.id}/${photoType}-${Date.now()}.${extension}`;
    const { error: uploadError } = await supabase.storage
      .from('cleaning-appointment-photos')
      .upload(path, file, { upsert: false });

    if (uploadError) {
      toast.error('Erro ao enviar foto.');
      return;
    }

    const { error } = await db.from('cleaning_appointment_photos').insert({
      tenant_id: tenantId,
      appointment_id: appointment.id,
      photo_type: photoType,
      storage_path: path,
    });

    if (error) {
      toast.error('Foto enviada, mas houve erro ao registrar evidência.');
      return;
    }

    toast.success('Foto registrada.');
    loadCleaningData();
  };

  const markFinancialEntryPaid = async (entry: CleaningFinancialEntry) => {
    const paidAt = new Date().toISOString();
    const { error } = await db
      .from('cleaning_financial_entries')
      .update({
        status: 'paid',
        paid_at: paidAt,
        entry_type: entry.entry_type === 'receivable' ? 'received' : entry.entry_type,
      })
      .eq('id', entry.id)
      .eq('tenant_id', tenantId);

    if (error) {
      toast.error('Erro ao baixar lançamento.');
      return;
    }

    if (entry.appointment_id && entry.entry_type === 'receivable') {
      await db
        .from('cleaning_appointments')
        .update({ financial_status: 'paid' })
        .eq('id', entry.appointment_id)
        .eq('tenant_id', tenantId);
    }

    if (entry.entry_type === 'receivable' || entry.entry_type === 'received') {
      await recordCleaningTransaction({
        type: 'income',
        category: 'Limpeza',
        description: entry.description || 'Recebimento de limpeza',
        amount: Number(entry.amount),
        payment_method: 'other',
        reference_id: entry.id,
        reference_type: 'cleaning_receivable',
      });
    } else if (entry.entry_type === 'expense' || entry.entry_type === 'commission_payment') {
      await recordCleaningTransaction({
        type: 'expense',
        category: entry.category || 'Limpeza',
        description: entry.description || 'Despesa de limpeza',
        amount: Number(entry.amount),
        payment_method: 'other',
        reference_id: entry.id,
        reference_type: entry.entry_type === 'commission_payment' ? 'cleaning_commission' : 'cleaning_expense',
      });
    }

    toast.success('Lançamento marcado como pago.');
    loadCleaningData();
  };

  const updateCommissionStatus = async (commission: CleaningCommissionPayable, status: CleaningCommissionPayable['status']) => {
    const paidAt = status === 'paid' ? new Date().toISOString() : null;
    const { error } = await db
      .from('cleaning_commission_payables')
      .update({
        status,
        paid_at: paidAt,
      })
      .eq('id', commission.id)
      .eq('tenant_id', tenantId);

    if (error) {
      toast.error('Erro ao atualizar repasse.');
      return;
    }

    if (status === 'paid') {
      await db.from('cleaning_financial_entries').insert({
        tenant_id: tenantId,
        appointment_id: commission.appointment_id,
        entry_type: 'commission_payment',
        category: 'Repasse',
        description: 'Repasse de limpeza',
        amount: commission.commission_amount,
        status: 'paid',
        paid_at: paidAt,
      });

      await recordCleaningTransaction({
        type: 'expense',
        category: 'Repasse Limpeza',
        description: 'Repasse de limpeza',
        amount: Number(commission.commission_amount),
        payment_method: 'other',
        reference_id: commission.id,
        reference_type: 'cleaning_commission',
      });

      if (commission.appointment_id) {
        await db
          .from('cleaning_appointments')
          .update({ financial_status: 'commission_paid' })
          .eq('id', commission.appointment_id)
          .eq('tenant_id', tenantId);
      }
    }

    toast.success('Repasse atualizado.');
    loadCleaningData();
  };

  const saveVisibility = async (professionalId: string, key: keyof Omit<StaffVisibility, 'id' | 'professional_id'>, value: boolean) => {
    if (!tenantId) return;
    const current = visibility.find((item) => item.professional_id === professionalId);
    const payload: StaffVisibility & { tenant_id: string } = {
      tenant_id: tenantId,
      professional_id: professionalId,
      can_view_client_phone: current?.can_view_client_phone ?? true,
      can_view_full_address: current?.can_view_full_address ?? true,
      can_view_access_instructions: current?.can_view_access_instructions ?? true,
      can_view_internal_notes: current?.can_view_internal_notes ?? false,
      can_view_customer_price: current?.can_view_customer_price ?? false,
      can_view_own_commission: current?.can_view_own_commission ?? false,
      can_view_financial_status: current?.can_view_financial_status ?? false,
      can_view_team_schedule: current?.can_view_team_schedule ?? false,
      can_view_client_history: current?.can_view_client_history ?? false,
      can_manage_products_used: current?.can_manage_products_used ?? false,
      can_cancel_own_appointment: current?.can_cancel_own_appointment ?? false,
      [key]: value,
    };

    const { error } = await db
      .from('cleaning_staff_visibility')
      .upsert(payload, { onConflict: 'tenant_id,professional_id' });

    if (error) {
      toast.error('Erro ao salvar permissão.');
      return;
    }

    setVisibility((prev) => {
      const exists = prev.some((item) => item.professional_id === professionalId);
      if (exists) return prev.map((item) => (item.professional_id === professionalId ? payload : item));
      return [...prev, payload];
    });
  };

  if (!cleaningEnabled) {
    return (
      <div className="p-6 space-y-4">
        <h1 className="text-4xl font-display font-bold text-foreground">Controle de Limpeza</h1>
        <Card>
          <CardContent className="p-8">
            <div className="max-w-2xl space-y-3">
              <Badge variant="outline">Pacote não habilitado</Badge>
              <h2 className="text-2xl font-semibold">Este cliente B2B ainda não possui o segmento de limpeza.</h2>
              <p className="text-muted-foreground">
                Libere o pacote Controle de Limpeza ou ERP completo no cadastro B2B para ativar agenda, imóveis,
                checklist, financeiro, repasses e permissões de funcionários.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-8 flex items-center gap-3 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin" />
        Carregando controle de limpeza...
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <h1 className="text-4xl font-display font-bold text-foreground">Controle de Limpeza</h1>
          <p className="text-muted-foreground mt-1">
            Agenda, imóveis, execução, repasses, caixa e permissões integrados ao ERP.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={loadCleaningData}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Atualizar
          </Button>
          <Dialog open={dialogs.appointment} onOpenChange={(open) => setDialogs((prev) => ({ ...prev, appointment: open }))}>
            <DialogTrigger asChild>
              <Button disabled={!canManageCleaning}>
                <Plus className="w-4 h-4 mr-2" />
                Nova limpeza
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Novo agendamento de limpeza</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Cliente</Label>
                  <Select value={appointmentForm.client_id} onValueChange={(value) => updateAppointmentDefaults('client_id', value)}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      {clients.map((client) => <SelectItem key={client.id} value={client.id}>{client.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Imóvel/unidade</Label>
                  <Select value={appointmentForm.property_id} onValueChange={(value) => updateAppointmentDefaults('property_id', value)}>
                    <SelectTrigger><SelectValue placeholder="Opcional" /></SelectTrigger>
                    <SelectContent>
                      {properties
                        .filter((property) => !appointmentForm.client_id || property.client_id === appointmentForm.client_id)
                        .map((property) => <SelectItem key={property.id} value={property.id}>{property.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Endereço do atendimento</Label>
                  <Input value={appointmentForm.address} onChange={(event) => updateAppointmentDefaults('address', event.target.value)} />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Instruções de acesso</Label>
                  <Input value={appointmentForm.access_instructions} onChange={(event) => updateAppointmentDefaults('access_instructions', event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Serviço</Label>
                  <Select value={appointmentForm.service_setting_id} onValueChange={(value) => updateAppointmentDefaults('service_setting_id', value)}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      {services.filter((service) => service.is_active).map((service) => (
                        <SelectItem key={service.id} value={service.id}>{service.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Responsável</Label>
                  <Select value={appointmentForm.assignee_type} onValueChange={(value) => updateAppointmentDefaults('assignee_type', value)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="professional">Profissional</SelectItem>
                      <SelectItem value="team">Equipe</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {appointmentForm.assignee_type === 'professional' ? (
                  <div className="space-y-2">
                    <Label>Profissional</Label>
                    <Select value={appointmentForm.professional_id} onValueChange={(value) => updateAppointmentDefaults('professional_id', value)}>
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        {cleaningProfessionals.map((professional) => (
                          <SelectItem key={professional.id} value={professional.id}>{professional.nickname || professional.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label>Equipe</Label>
                    <Select value={appointmentForm.team_id} onValueChange={(value) => updateAppointmentDefaults('team_id', value)}>
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        {teams.filter((team) => team.is_active).map((team) => (
                          <SelectItem key={team.id} value={team.id}>{team.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="space-y-2">
                  <Label>Data</Label>
                  <Input type="date" value={appointmentForm.date} onChange={(event) => updateAppointmentDefaults('date', event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Horário</Label>
                  <Input type="time" value={appointmentForm.time} onChange={(event) => updateAppointmentDefaults('time', event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Recorrência</Label>
                  <Select value={appointmentForm.recurrence_type} onValueChange={(value) => updateAppointmentDefaults('recurrence_type', value)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sem recorrência</SelectItem>
                      <SelectItem value="weekly">Semanal</SelectItem>
                      <SelectItem value="biweekly">Quinzenal</SelectItem>
                      <SelectItem value="monthly">Mensal</SelectItem>
                      <SelectItem value="custom">Personalizada</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Valor cobrado</Label>
                  <Input type="number" min="0" step="0.01" value={appointmentForm.quoted_amount} onChange={(event) => updateAppointmentDefaults('quoted_amount', Number(event.target.value))} />
                </div>
                <div className="space-y-2">
                  <Label>Repasse previsto</Label>
                  <Input type="number" min="0" step="0.01" value={appointmentForm.commission_amount} onChange={(event) => updateAppointmentDefaults('commission_amount', Number(event.target.value))} />
                </div>
                <div className="grid gap-3 rounded-lg border p-4 md:col-span-2">
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox checked={appointmentForm.requires_checklist} onCheckedChange={(checked) => updateAppointmentDefaults('requires_checklist', Boolean(checked))} />
                    Exigir checklist para concluir
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox checked={appointmentForm.requires_photos} onCheckedChange={(checked) => updateAppointmentDefaults('requires_photos', Boolean(checked))} />
                    Exigir fotos antes/depois
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox checked={appointmentForm.uses_product_control} onCheckedChange={(checked) => updateAppointmentDefaults('uses_product_control', Boolean(checked))} />
                    Controlar produtos neste atendimento
                  </label>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Observações internas</Label>
                  <Textarea value={appointmentForm.internal_notes} onChange={(event) => updateAppointmentDefaults('internal_notes', event.target.value)} />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline" onClick={() => setDialogs((prev) => ({ ...prev, appointment: false }))}>Cancelar</Button>
                <Button onClick={createAppointment}>Agendar</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Metric icon={CalendarDays} label="Limpezas no dia" value={dashboard.dayAppointments.length.toString()} />
        <Metric icon={DollarSign} label="Receita prevista" value={money.format(dashboard.revenue)} />
        <Metric icon={Users} label="Repasses" value={money.format(dashboard.commissionTotal)} />
        <Metric icon={Sparkles} label="Lucro bruto" value={money.format(dashboard.grossProfit)} />
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex h-auto flex-wrap justify-start">
          <TabsTrigger value="agenda">Agenda</TabsTrigger>
          <TabsTrigger value="properties" disabled={!canOperateCleaning}>Imóveis</TabsTrigger>
          <TabsTrigger value="services" disabled={!canOperateCleaning}>Serviços</TabsTrigger>
          <TabsTrigger value="teams" disabled={!canOperateCleaning}>Equipes</TabsTrigger>
          <TabsTrigger value="finance" disabled={!canViewFinancial}>Financeiro</TabsTrigger>
          <TabsTrigger value="permissions" disabled={!isAdmin}>Permissões</TabsTrigger>
        </TabsList>

        <TabsContent value="agenda" className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Input className="w-48" type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} />
            <Badge variant="outline">{format(parseISO(`${selectedDate}T12:00:00`), "EEEE, dd 'de' MMMM", { locale: ptBR })}</Badge>
          </div>
          <AppointmentsTable
            appointments={dashboard.dayAppointments}
            checklistItems={checklistItems}
            photos={photos}
            canManage={canManageCleaning}
            onStatusChange={updateAppointmentStatus}
            onChecklistToggle={toggleChecklistItem}
            onPhotoUpload={uploadPhoto}
          />
        </TabsContent>

        <TabsContent value="properties" className="space-y-4">
          <HeaderAction
            title="Clientes e imóveis"
            description="Locais de atendimento vinculados aos clientes do ERP."
            buttonLabel="Novo imóvel"
            disabled={!canManageCleaning}
            open={dialogs.property}
            onOpenChange={(open) => setDialogs((prev) => ({ ...prev, property: open }))}
          >
            <div className="grid gap-4">
              <Select value={propertyForm.client_id} onValueChange={(value) => setPropertyForm((prev) => ({ ...prev, client_id: value }))}>
                <SelectTrigger><SelectValue placeholder="Cliente" /></SelectTrigger>
                <SelectContent>{clients.map((client) => <SelectItem key={client.id} value={client.id}>{client.name}</SelectItem>)}</SelectContent>
              </Select>
              <Input placeholder="Nome do local" value={propertyForm.name} onChange={(event) => setPropertyForm((prev) => ({ ...prev, name: event.target.value }))} />
              <Input placeholder="Tipo: apartamento, casa, Airbnb..." value={propertyForm.property_type} onChange={(event) => setPropertyForm((prev) => ({ ...prev, property_type: event.target.value }))} />
              <Input placeholder="Endereço completo" value={propertyForm.address} onChange={(event) => setPropertyForm((prev) => ({ ...prev, address: event.target.value }))} />
              <Input placeholder="Complemento" value={propertyForm.complement} onChange={(event) => setPropertyForm((prev) => ({ ...prev, complement: event.target.value }))} />
              <Textarea placeholder="Instruções de acesso" value={propertyForm.access_instructions} onChange={(event) => setPropertyForm((prev) => ({ ...prev, access_instructions: event.target.value }))} />
              <div className="grid grid-cols-2 gap-3">
                <Input type="number" placeholder="Duração padrão" value={propertyForm.default_duration_minutes} onChange={(event) => setPropertyForm((prev) => ({ ...prev, default_duration_minutes: Number(event.target.value) }))} />
                <Input type="number" placeholder="Valor padrão" value={propertyForm.default_price} onChange={(event) => setPropertyForm((prev) => ({ ...prev, default_price: Number(event.target.value) }))} />
              </div>
              <Button onClick={createProperty}>Salvar imóvel</Button>
            </div>
          </HeaderAction>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {properties.map((property) => (
              <Card key={property.id}>
                <CardHeader>
                  <CardTitle className="text-lg">{property.name}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <p className="font-medium">{clients.find((client) => client.id === property.client_id)?.name ?? 'Cliente'}</p>
                  <p className="text-muted-foreground">{property.address}</p>
                  <Badge variant="secondary">{property.property_type}</Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="services" className="space-y-4">
          <HeaderAction
            title="Serviços de limpeza"
            description="Inclui limpeza, passadoria, organizer e serviços combinados."
            buttonLabel="Novo serviço"
            disabled={!canManageCleaning}
            open={dialogs.service}
            onOpenChange={(open) => setDialogs((prev) => ({ ...prev, service: open }))}
          >
            <div className="grid gap-4">
              <Input placeholder="Nome do serviço" value={serviceForm.name} onChange={(event) => setServiceForm((prev) => ({ ...prev, name: event.target.value }))} />
              <Input placeholder="Categoria" value={serviceForm.category} onChange={(event) => setServiceForm((prev) => ({ ...prev, category: event.target.value }))} />
              <div className="grid grid-cols-2 gap-3">
                <Input type="number" placeholder="Duração" value={serviceForm.duration_minutes} onChange={(event) => setServiceForm((prev) => ({ ...prev, duration_minutes: Number(event.target.value) }))} />
                <Input type="number" placeholder="Valor" value={serviceForm.default_price} onChange={(event) => setServiceForm((prev) => ({ ...prev, default_price: Number(event.target.value) }))} />
              </div>
              <Select value={serviceForm.commission_type} onValueChange={(value) => setServiceForm((prev) => ({ ...prev, commission_type: value as CommissionType }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="percent">Percentual</SelectItem>
                  <SelectItem value="fixed">Valor fixo</SelectItem>
                  <SelectItem value="mixed">Misto</SelectItem>
                </SelectContent>
              </Select>
              <div className="grid grid-cols-2 gap-3">
                <Input type="number" placeholder="% repasse" value={serviceForm.commission_percent} onChange={(event) => setServiceForm((prev) => ({ ...prev, commission_percent: Number(event.target.value) }))} />
                <Input type="number" placeholder="Repasse fixo" value={serviceForm.commission_fixed} onChange={(event) => setServiceForm((prev) => ({ ...prev, commission_fixed: Number(event.target.value) }))} />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={serviceForm.requires_checklist} onCheckedChange={(checked) => setServiceForm((prev) => ({ ...prev, requires_checklist: Boolean(checked) }))} />
                Exige checklist
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={serviceForm.requires_photos} onCheckedChange={(checked) => setServiceForm((prev) => ({ ...prev, requires_photos: Boolean(checked) }))} />
                Exige fotos
              </label>
              <Button onClick={createService}>Salvar serviço</Button>
            </div>
          </HeaderAction>
          <DataTable headers={['Serviço', 'Categoria', 'Duração', 'Valor', 'Repasse', 'Controles']}>
            {services.map((service) => (
              <TableRow key={service.id}>
                <TableCell className="font-medium">{service.name}</TableCell>
                <TableCell>{service.category}</TableCell>
                <TableCell>{service.duration_minutes} min</TableCell>
                <TableCell>{money.format(Number(service.default_price))}</TableCell>
                <TableCell>{service.commission_type === 'percent' ? `${service.commission_percent}%` : money.format(Number(service.commission_fixed))}</TableCell>
                <TableCell className="space-x-1">
                  {service.requires_checklist && <Badge variant="secondary">Checklist</Badge>}
                  {service.requires_photos && <Badge variant="secondary">Fotos</Badge>}
                </TableCell>
              </TableRow>
            ))}
          </DataTable>
        </TabsContent>

        <TabsContent value="teams" className="space-y-4">
          <HeaderAction
            title="Profissionais e equipes"
            description="Define quem atua em limpeza e quais equipes podem receber agenda."
            buttonLabel="Nova equipe"
            disabled={!canManageCleaning}
            open={dialogs.team}
            onOpenChange={(open) => setDialogs((prev) => ({ ...prev, team: open }))}
          >
            <div className="grid gap-4">
              <Input placeholder="Nome da equipe" value={teamForm.name} onChange={(event) => setTeamForm((prev) => ({ ...prev, name: event.target.value }))} />
              <Select value={teamForm.leader_professional_id} onValueChange={(value) => setTeamForm((prev) => ({ ...prev, leader_professional_id: value }))}>
                <SelectTrigger><SelectValue placeholder="Responsável" /></SelectTrigger>
                <SelectContent>{cleaningProfessionals.map((professional) => <SelectItem key={professional.id} value={professional.id}>{professional.nickname || professional.name}</SelectItem>)}</SelectContent>
              </Select>
              <Input type="color" value={teamForm.color} onChange={(event) => setTeamForm((prev) => ({ ...prev, color: event.target.value }))} />
              <Input placeholder="Regiões atendidas" value={teamForm.regions} onChange={(event) => setTeamForm((prev) => ({ ...prev, regions: event.target.value }))} />
              <Button onClick={createTeam}>Salvar equipe</Button>
            </div>
          </HeaderAction>
          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader><CardTitle>Profissionais liberados</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {professionals.map((professional) => (
                    <div key={professional.id} className="flex items-center justify-between rounded-lg border p-3">
                      <div>
                        <p className="font-medium">{professional.nickname || professional.name}</p>
                        <p className="text-xs text-muted-foreground">{professional.specialty || 'Sem especialidade'}</p>
                      </div>
                      <Checkbox
                        checked={Boolean(professional.works_cleaning)}
                        disabled={!canManageCleaning}
                        onCheckedChange={(checked) => toggleWorksCleaning(professional.id, Boolean(checked))}
                      />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Equipes</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {teams.map((team) => (
                  <div key={team.id} className="rounded-lg border p-3">
                    <div className="flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full" style={{ backgroundColor: team.color || '#2563eb' }} />
                      <p className="font-medium">{team.name}</p>
                    </div>
                    <div className="mt-3 space-y-2">
                      {teamMembers.filter((member) => member.team_id === team.id).map((member) => {
                        const professional = professionals.find((item) => item.id === member.professional_id);
                        return (
                          <div key={member.id} className="flex items-center justify-between rounded-md bg-muted px-2 py-1 text-sm">
                            <span>{professional?.nickname || professional?.name || 'Profissional'}</span>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2"
                              disabled={!canManageCleaning}
                              onClick={() => removeTeamMember(member.id)}
                            >
                              Remover
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                    <div className="mt-3 flex gap-2">
                      <Select
                        value={teamMemberSelection[team.id] || ''}
                        onValueChange={(value) => setTeamMemberSelection((prev) => ({ ...prev, [team.id]: value }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Adicionar membro" />
                        </SelectTrigger>
                        <SelectContent>
                          {cleaningProfessionals.map((professional) => (
                            <SelectItem key={professional.id} value={professional.id}>
                              {professional.nickname || professional.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button variant="outline" disabled={!canManageCleaning} onClick={() => addTeamMember(team.id)}>
                        Adicionar
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="finance" className="space-y-4">
          <DataTable headers={['Tipo', 'Descrição', 'Valor', 'Status', 'Vencimento', 'Ações']}>
            {financialEntries.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell>{entry.entry_type}</TableCell>
                <TableCell>{entry.description || entry.category}</TableCell>
                <TableCell>{money.format(Number(entry.amount))}</TableCell>
                <TableCell><Badge variant={entry.status === 'paid' ? 'default' : 'secondary'}>{entry.status}</Badge></TableCell>
                <TableCell>{entry.due_date ? format(parseISO(`${entry.due_date}T12:00:00`), 'dd/MM/yyyy') : '-'}</TableCell>
                <TableCell>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!canManageCleaning || entry.status === 'paid'}
                    onClick={() => markFinancialEntryPaid(entry)}
                  >
                    Baixar
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </DataTable>

          <div>
            <h2 className="mb-3 text-2xl font-semibold">Repasses</h2>
            <DataTable headers={['Responsável', 'Base', 'Repasse', 'Status', 'Ações']}>
              {commissions.map((commission) => {
                const professional = professionals.find((item) => item.id === commission.professional_id);
                const team = teams.find((item) => item.id === commission.team_id);
                return (
                  <TableRow key={commission.id}>
                    <TableCell>{professional?.nickname || professional?.name || team?.name || 'Responsável'}</TableCell>
                    <TableCell>{money.format(Number(commission.base_amount))}</TableCell>
                    <TableCell>{money.format(Number(commission.commission_amount))}</TableCell>
                    <TableCell><Badge variant={commission.status === 'paid' ? 'default' : 'secondary'}>{commission.status}</Badge></TableCell>
                    <TableCell className="space-x-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!canManageCleaning || commission.status !== 'pending'}
                        onClick={() => updateCommissionStatus(commission, 'approved')}
                      >
                        Aprovar
                      </Button>
                      <Button
                        size="sm"
                        disabled={!canManageCleaning || commission.status === 'paid'}
                        onClick={() => updateCommissionStatus(commission, 'paid')}
                      >
                        Pagar
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </DataTable>
          </div>
        </TabsContent>

        <TabsContent value="permissions" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><ShieldCheck className="w-5 h-5" /> Permissões de funcionário</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {cleaningProfessionals.map((professional) => {
                const row = visibility.find((item) => item.professional_id === professional.id);
                return (
                  <div key={professional.id} className="rounded-lg border p-4">
                    <div className="mb-3">
                      <p className="font-medium">{professional.nickname || professional.name}</p>
                      <p className="text-xs text-muted-foreground">Configure o que este funcionário visualiza no módulo limpeza.</p>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                      {visibilityLabels.map((option) => (
                        <label key={option.key} className="flex items-center gap-2 text-sm">
                          <Checkbox
                            checked={Boolean(row?.[option.key])}
                            onCheckedChange={(checked) => saveVisibility(professional.id, option.key, Boolean(checked))}
                          />
                          {option.label}
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Metric({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between p-5">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-2xl font-semibold">{value}</p>
        </div>
        <Icon className="h-8 w-8 text-primary" />
      </CardContent>
    </Card>
  );
}

function HeaderAction({
  title,
  description,
  buttonLabel,
  disabled,
  open,
  onOpenChange,
  children,
}: {
  title: string;
  description: string;
  buttonLabel: string;
  disabled: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div>
        <h2 className="text-2xl font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogTrigger asChild>
          <Button disabled={disabled}>
            <Plus className="w-4 h-4 mr-2" />
            {buttonLabel}
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>{buttonLabel}</DialogTitle></DialogHeader>
          {children}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DataTable({ headers, children }: { headers: string[]; children: ReactNode }) {
  return (
    <div className="rounded-lg border bg-card overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            {headers.map((header) => <TableHead key={header}>{header}</TableHead>)}
          </TableRow>
        </TableHeader>
        <TableBody>{children}</TableBody>
      </Table>
    </div>
  );
}

function AppointmentsTable({
  appointments,
  checklistItems,
  photos,
  canManage,
  onStatusChange,
  onChecklistToggle,
  onPhotoUpload,
}: {
  appointments: CleaningAppointment[];
  checklistItems: CleaningChecklistItem[];
  photos: CleaningPhoto[];
  canManage: boolean;
  onStatusChange: (appointment: CleaningAppointment, status: CleaningStatus) => void;
  onChecklistToggle: (item: CleaningChecklistItem, checked: boolean) => void;
  onPhotoUpload: (appointment: CleaningAppointment, file: File, photoType: CleaningPhoto['photo_type']) => void;
}) {
  if (appointments.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground">
          Nenhuma limpeza agendada para este dia.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-3">
      {appointments.map((appointment) => {
        const items = checklistItems.filter((item) => item.appointment_id === appointment.id);
        const appointmentPhotos = photos.filter((photo) => photo.appointment_id === appointment.id);
        const beforeCount = appointmentPhotos.filter((photo) => photo.photo_type === 'before').length;
        const afterCount = appointmentPhotos.filter((photo) => photo.photo_type === 'after').length;

        return (
          <Card key={appointment.id} className={cn(appointment.status === 'completed' && 'border-green-300')}>
            <CardContent className="space-y-4 p-4">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge>{format(parseISO(appointment.start_time), 'HH:mm')}</Badge>
                    <Badge variant="secondary">{statusLabels[appointment.status]}</Badge>
                    <Badge variant="outline">{financialLabels[appointment.financial_status]}</Badge>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold">{appointment.client_name_snapshot}</h3>
                    <p className="text-sm text-muted-foreground">{appointment.service_name_snapshot}</p>
                  </div>
                  <div className="grid gap-2 text-sm text-muted-foreground md:grid-cols-2">
                    <span className="flex items-center gap-2"><Home className="w-4 h-4" /> {appointment.address}</span>
                    <span className="flex items-center gap-2"><Users className="w-4 h-4" /> {appointment.assignee_name_snapshot || 'Responsável'}</span>
                    {appointment.access_instructions && (
                      <span className="flex items-center gap-2"><KeyRound className="w-4 h-4" /> {appointment.access_instructions}</span>
                    )}
                    <span className="flex items-center gap-2">
                      <ClipboardCheck className="w-4 h-4" />
                      Checklist: {items.filter((item) => item.is_completed).length}/{items.length || 0} | Fotos: {beforeCount} antes, {afterCount} depois
                    </span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" disabled={!canManage || appointment.status === 'completed'} onClick={() => onStatusChange(appointment, 'in_progress')}>
                    Iniciar
                  </Button>
                  <Button size="sm" disabled={!canManage || appointment.status === 'completed'} onClick={() => onStatusChange(appointment, 'completed')}>
                    <CheckCircle2 className="w-4 h-4 mr-1" />
                    Concluir
                  </Button>
                  <Button size="sm" variant="destructive" disabled={!canManage || appointment.status === 'completed'} onClick={() => onStatusChange(appointment, 'cancelled')}>
                    Cancelar
                  </Button>
                </div>
              </div>

              {items.length > 0 && (
                <div className="rounded-lg border p-3">
                  <p className="mb-2 text-sm font-medium">Checklist de execução</p>
                  <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                    {items.map((item) => (
                      <label key={item.id} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={item.is_completed}
                          disabled={!canManage || appointment.status === 'completed'}
                          onCheckedChange={(checked) => onChecklistToggle(item, Boolean(checked))}
                        />
                        {item.label}
                        {item.is_required && <span className="text-destructive">*</span>}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid gap-3 rounded-lg border p-3 md:grid-cols-2">
                <div className="space-y-2">
                  <p className="text-sm font-medium">Fotos antes</p>
                  <Input
                    type="file"
                    accept="image/*"
                    disabled={!canManage || appointment.status === 'completed'}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) onPhotoUpload(appointment, file, 'before');
                      event.currentTarget.value = '';
                    }}
                  />
                  <p className="text-xs text-muted-foreground">{beforeCount} foto(s) registrada(s)</p>
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium">Fotos depois</p>
                  <Input
                    type="file"
                    accept="image/*"
                    disabled={!canManage || appointment.status === 'completed'}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) onPhotoUpload(appointment, file, 'after');
                      event.currentTarget.value = '';
                    }}
                  />
                  <p className="text-xs text-muted-foreground">{afterCount} foto(s) registrada(s)</p>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
