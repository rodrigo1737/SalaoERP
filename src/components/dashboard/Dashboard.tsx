import { motion } from 'framer-motion';
import {
  TrendingUp,
  Calendar,
  Users,
  DollarSign,
  ArrowUpRight,
  ArrowDownRight,
  AlertCircle,
  Banknote,
  Clock
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useData } from '@/context/DataContext';
import { useAuth } from '@/contexts/AuthContext';
import { useEffect, useMemo, useState } from 'react';
import { isCleaningControlTenant } from '@/lib/tenantSegments';
import { supabase } from '@/integrations/supabase/client';

interface DashboardProps {
  onNavigate: (page: string) => void;
}

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('pt-BR', { 
    style: 'currency', 
    currency: 'BRL' 
  }).format(value);
};

const formatTime = (isoString: string) => {
  return new Date(isoString).toLocaleTimeString('pt-BR', { 
    hour: '2-digit', 
    minute: '2-digit' 
  });
};

const appointmentStatusLabels: Record<string, string> = {
  scheduled: 'Agendado',
  confirmed: 'Confirmado',
  on_the_way: 'A caminho',
  in_progress: 'Em Andamento',
  completed: 'Concluído',
  cancelled: 'Cancelado',
  no_show: 'Não Compareceu',
};

// Shape mínimo consumido pelo Dashboard — comum entre appointments (salão) e cleaning_appointments
interface DashboardAppointment {
  id: string;
  start_time: string;
  end_time: string;
  status: string;
  client_id: string | null;
  client?: { name?: string | null } | null;
  service?: { name?: string | null } | null;
  professional?: { nickname?: string | null } | null;
}

interface DashboardStats {
  todayRevenue: number;
  todayAppointments: number;
  clientsCount: number;
  activeClients: number;
  monthRevenue: number;
  todayExpense: number;
  todayNetBalance: number;
  cashSessionIncome: number;
  cashSessionExpense: number;
  cashSessionBalance: number;
}

const startOfDay = (date: Date) => {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
};

const endOfDay = (date: Date) => {
  const value = new Date(date);
  value.setHours(23, 59, 59, 999);
  return value;
};

export function Dashboard({ onNavigate }: DashboardProps) {
  const { professionals, currentCashSession, pendingCashSession, transactions } = useData();
  const { user, currentTenant, tenantId, userRole, hasPermission } = useAuth();
  const isCleaningSegment = isCleaningControlTenant(currentTenant);
  const canManageCashFlow = userRole === 'admin' || hasPermission('manage_cash_flow');
  const canViewFinancialArea = canManageCashFlow
    || hasPermission('view_financial_history')
    || hasPermission('reverse_financial_entries')
    || hasPermission('refund_bill');
  const activeCashSession = currentCashSession ?? pendingCashSession ?? null;
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [dashboardStats, setDashboardStats] = useState<DashboardStats>({
    todayRevenue: 0,
    todayAppointments: 0,
    clientsCount: 0,
    activeClients: 0,
    monthRevenue: 0,
    todayExpense: 0,
    todayNetBalance: 0,
    cashSessionIncome: 0,
    cashSessionExpense: 0,
    cashSessionBalance: 0,
  });
  const [upcomingAppointments, setUpcomingAppointments] = useState<DashboardAppointment[]>([]);
  const cashSessionSummary = useMemo(() => {
    if (!activeCashSession) {
      return {
        income: 0,
        expense: 0,
        balance: 0,
      };
    }

    const sessionTransactions = transactions.filter(
      (transaction) => transaction.cash_session_id === activeCashSession.id && !transaction.reversed_at,
    );

    const income = sessionTransactions
      .filter((transaction) => transaction.type === 'income')
      .reduce((sum, transaction) => sum + Number(transaction.amount), 0);
    const expense = sessionTransactions
      .filter((transaction) => transaction.type === 'expense')
      .reduce((sum, transaction) => sum + Number(transaction.amount), 0);

    return {
      income,
      expense,
      balance: Number(activeCashSession.opening_balance || 0) + income - expense,
    };
  }, [activeCashSession, transactions]);

  // Para tenants de limpeza, os agendamentos vêm de `cleaning_appointments`.
  // Para os demais, mantém a fonte do DataContext (`appointments`).
  useEffect(() => {
    let cancelled = false;
    if (!tenantId) {
      setUpcomingAppointments([]);
      return;
    }

    const fetchDashboardData = async () => {
      setDashboardLoading(true);

      const now = new Date();
      const todayStart = startOfDay(now);
      const todayEnd = endOfDay(now);
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const tomorrowEnd = endOfDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
      const thirtyDaysAgo = new Date(now);
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      try {
        if (isCleaningSegment) {
          const [
            todayAppointmentsResponse,
            clientsCountResponse,
            activeClientsResponse,
            todayRevenueResponse,
            todayExpenseResponse,
            monthRevenueResponse,
            upcomingResponse,
          ] = await Promise.all([
            supabase
              .from('cleaning_appointments')
              .select('id', { count: 'exact', head: true })
              .eq('tenant_id', tenantId)
              .is('deleted_at', null)
              .neq('status', 'cancelled')
              .gte('start_time', todayStart.toISOString())
              .lte('start_time', todayEnd.toISOString()),
            supabase
              .from('clients')
              .select('id', { count: 'exact', head: true })
              .eq('tenant_id', tenantId)
              .is('deleted_at', null),
            supabase
              .from('cleaning_appointments')
              .select('client_id')
              .eq('tenant_id', tenantId)
              .is('deleted_at', null)
              .gte('start_time', thirtyDaysAgo.toISOString())
              .lte('start_time', todayEnd.toISOString()),
            supabase
              .from('cleaning_financial_entries')
              .select('amount')
              .eq('tenant_id', tenantId)
              .is('deleted_at', null)
              .in('entry_type', ['receivable', 'received'])
              .neq('status', 'cancelled')
              .gte('created_at', todayStart.toISOString())
              .lte('created_at', todayEnd.toISOString()),
            supabase
              .from('cleaning_financial_entries')
              .select('amount')
              .eq('tenant_id', tenantId)
              .is('deleted_at', null)
              .in('entry_type', ['expense', 'commission_payment'])
              .neq('status', 'cancelled')
              .gte('created_at', todayStart.toISOString())
              .lte('created_at', todayEnd.toISOString()),
            supabase
              .from('cleaning_financial_entries')
              .select('amount')
              .eq('tenant_id', tenantId)
              .is('deleted_at', null)
              .in('entry_type', ['receivable', 'received'])
              .neq('status', 'cancelled')
              .gte('created_at', monthStart.toISOString())
              .lte('created_at', todayEnd.toISOString()),
            supabase
              .from('cleaning_appointments')
              .select('id, start_time, end_time, status, client_id, client_name_snapshot, service_name_snapshot, assignee_name_snapshot')
              .eq('tenant_id', tenantId)
              .is('deleted_at', null)
              .neq('status', 'cancelled')
              .gte('start_time', now.toISOString())
              .lte('start_time', tomorrowEnd.toISOString())
              .order('start_time', { ascending: true })
              .limit(4),
          ]);

          if (cancelled) return;

          const todayRevenue = (todayRevenueResponse.data || []).reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
          const todayExpense = (todayExpenseResponse.data || []).reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
          const monthRevenue = (monthRevenueResponse.data || []).reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
          const activeClients = new Set((activeClientsResponse.data || []).map((item) => item.client_id).filter(Boolean)).size;

          setDashboardStats({
            todayRevenue,
            todayAppointments: todayAppointmentsResponse.count || 0,
            clientsCount: clientsCountResponse.count || 0,
            activeClients,
            monthRevenue,
            todayExpense,
            todayNetBalance: todayRevenue - todayExpense,
            cashSessionIncome: todayRevenue,
            cashSessionExpense: todayExpense,
            cashSessionBalance: todayRevenue - todayExpense,
          });
          setUpcomingAppointments(((upcomingResponse.data || []).map((row) => ({
            id: row.id,
            start_time: row.start_time,
            end_time: row.end_time,
            status: row.status,
            client_id: row.client_id,
            client: { name: row.client_name_snapshot },
            service: { name: row.service_name_snapshot },
            professional: { nickname: row.assignee_name_snapshot },
          })) as DashboardAppointment[]));
        } else {
          const [
            todayRevenueResponse,
            todayAppointmentsResponse,
            monthRevenueResponse,
            upcomingResponse,
            activeClientsResponse,
            clientsCountResponse,
          ] = await Promise.all([
            supabase
              .from('appointments')
              .select('total_value')
              .eq('tenant_id', tenantId)
              .is('deleted_at', null)
              .eq('status', 'completed')
              .gte('start_time', todayStart.toISOString())
              .lte('start_time', todayEnd.toISOString()),
            supabase
              .from('appointments')
              .select('id', { count: 'exact', head: true })
              .eq('tenant_id', tenantId)
              .is('deleted_at', null)
              .neq('status', 'cancelled')
              .gte('start_time', todayStart.toISOString())
              .lte('start_time', todayEnd.toISOString()),
            supabase
              .from('appointments')
              .select('total_value')
              .eq('tenant_id', tenantId)
              .is('deleted_at', null)
              .eq('status', 'completed')
              .gte('start_time', monthStart.toISOString())
              .lte('start_time', todayEnd.toISOString()),
            supabase
              .from('appointments')
              .select(`
                id,
                start_time,
                end_time,
                status,
                client_id,
                client:clients(name),
                service:services(name),
                professional:professionals(nickname)
              `)
              .eq('tenant_id', tenantId)
              .is('deleted_at', null)
              .neq('status', 'cancelled')
              .gte('start_time', now.toISOString())
              .lte('start_time', tomorrowEnd.toISOString())
              .order('start_time', { ascending: true })
              .limit(4),
            supabase
              .from('appointments')
              .select('client_id')
              .eq('tenant_id', tenantId)
              .is('deleted_at', null)
              .gte('start_time', thirtyDaysAgo.toISOString())
              .lte('start_time', todayEnd.toISOString()),
            supabase
              .from('clients')
              .select('id', { count: 'exact', head: true })
              .eq('tenant_id', tenantId)
              .is('deleted_at', null),
          ]);

          if (cancelled) return;

          const todayRevenue = (todayRevenueResponse.data || []).reduce((sum, item) => sum + Number(item.total_value || 0), 0);
          const monthRevenue = (monthRevenueResponse.data || []).reduce((sum, item) => sum + Number(item.total_value || 0), 0);
          const activeClients = new Set((activeClientsResponse.data || []).map((item) => item.client_id).filter(Boolean)).size;

          setDashboardStats({
            todayRevenue,
            todayAppointments: todayAppointmentsResponse.count || 0,
            clientsCount: clientsCountResponse.count || 0,
            activeClients,
            monthRevenue,
            todayExpense: 0,
            todayNetBalance: todayRevenue,
            cashSessionIncome: 0,
            cashSessionExpense: 0,
            cashSessionBalance: 0,
          });
          setUpcomingAppointments((upcomingResponse.data as DashboardAppointment[]) || []);
        }
      } catch (error) {
        if (cancelled) return;
        console.error('Erro ao carregar dashboard:', error);
        setDashboardStats({
          todayRevenue: 0,
          todayAppointments: 0,
          clientsCount: 0,
          activeClients: 0,
          monthRevenue: 0,
          todayExpense: 0,
          todayNetBalance: 0,
          cashSessionIncome: 0,
          cashSessionExpense: 0,
          cashSessionBalance: 0,
        });
        setUpcomingAppointments([]);
      } finally {
        if (!cancelled) setDashboardLoading(false);
      }
    };

    fetchDashboardData();
    return () => {
      cancelled = true;
    };
  }, [isCleaningSegment, tenantId]);

  const displayStats = isCleaningSegment
    ? dashboardStats
    : {
        ...dashboardStats,
        cashSessionIncome: cashSessionSummary.income,
        cashSessionExpense: cashSessionSummary.expense,
        cashSessionBalance: cashSessionSummary.balance,
      };

  const activeProfessionals = useMemo(() => {
    return professionals.filter(p => p.is_active).slice(0, 4);
  }, [professionals]);

  const statCards = [
    {
      title: 'Faturamento Hoje',
      value: formatCurrency(displayStats.todayRevenue),
      icon: DollarSign,
      trend: displayStats.todayRevenue > 0 ? '+' + formatCurrency(displayStats.todayRevenue) : 'R$ 0',
      trendUp: displayStats.todayRevenue > 0,
      color: 'primary',
    },
    {
      title: 'Agendamentos Hoje',
      value: displayStats.todayAppointments.toString(),
      icon: Calendar,
      trend: displayStats.todayAppointments > 0 ? `${displayStats.todayAppointments} hoje` : 'Nenhum',
      trendUp: displayStats.todayAppointments > 0,
      color: 'success',
    },
    {
      title: 'Clientes Cadastrados',
      value: displayStats.clientsCount.toString(),
      icon: Users,
      trend: displayStats.activeClients > 0 ? `${displayStats.activeClients} ativos` : 'Nenhum',
      trendUp: displayStats.activeClients > 0,
      color: 'info',
    },
    {
      title: 'Faturamento Mensal',
      value: formatCurrency(displayStats.monthRevenue),
      icon: TrendingUp,
      trend: displayStats.monthRevenue > 0 ? 'Do dia 1 até hoje' : 'Sem movimentos',
      trendUp: displayStats.monthRevenue > 0,
      color: 'accent',
    },
  ];

  const userName = user?.user_metadata?.full_name || 'Usuário';
  const dashboardSubtitle = isCleaningSegment
    ? 'Aqui está o resumo da sua operação de limpeza hoje'
    : 'Aqui está o resumo do seu salão hoje';
  const primarySchedulePage = isCleaningSegment ? 'cleaning' : 'agenda';
  const primaryScheduleLabel = isCleaningSegment ? 'Ver Agenda Limpeza' : 'Ver Agenda';
  const newAppointmentLabel = isCleaningSegment ? 'Nova Limpeza' : 'Novo Agendamento';
  const financialPage = canManageCashFlow ? 'cashier' : 'financial-management';
  const financialActionLabel = canManageCashFlow
    ? (activeCashSession ? 'Ver Caixa' : 'Abrir Caixa')
    : 'Gestão Financeira';

  if (dashboardLoading) {
    return (
      <div className="p-6 lg:p-8 flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Carregando dados...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl lg:text-4xl font-display font-bold text-foreground">
            Bem-vindo(a), {userName}
          </h1>
          <p className="text-muted-foreground mt-1">
            {dashboardSubtitle}
          </p>
        </div>
        <Button variant="hero" size="lg" onClick={() => onNavigate(primarySchedulePage)}>
          <Calendar className="w-5 h-5 mr-2" />
          {primaryScheduleLabel}
        </Button>
      </div>

      {/* Cash Session Alert or Summary */}
      {isCleaningSegment ? (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <Card className="p-4 border-primary/30 bg-primary/5">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="flex items-center gap-3">
                <Banknote className="w-5 h-5 text-primary" />
                <div>
                  <p className="font-medium text-foreground">Conta Corrente</p>
                  <p className="text-sm text-muted-foreground">
                    Movimentos da limpeza lançados direto no fluxo financeiro
                  </p>
                </div>
              </div>
              <div className="flex-1 flex flex-wrap gap-4 sm:justify-end">
                <div className="text-center sm:text-right">
                  <p className="text-xs text-muted-foreground">Entradas hoje</p>
                  <p className="font-bold text-success">{formatCurrency(displayStats.todayRevenue)}</p>
                </div>
                <div className="text-center sm:text-right">
                  <p className="text-xs text-muted-foreground">Saídas hoje</p>
                  <p className="font-bold text-destructive">{formatCurrency(displayStats.todayExpense)}</p>
                </div>
                <div className="text-center sm:text-right">
                  <p className="text-xs text-muted-foreground">Saldo do dia</p>
                  <p className="font-bold text-primary">{formatCurrency(displayStats.todayNetBalance)}</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => onNavigate('cleaning')}>
                  Ver Fluxo
                </Button>
              </div>
            </div>
          </Card>
        </motion.div>
      ) : null}

      {canViewFinancialArea && pendingCashSession ? (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <Card className="p-4 border-warning/50 bg-warning/10">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-warning" />
              <div className="flex-1">
                <p className="font-medium text-foreground">Caixa pendente de regularização</p>
                <p className="text-sm text-muted-foreground">
                  Existe um caixa aberto desde {new Date(pendingCashSession.opened_at).toLocaleDateString('pt-BR')}. Regularize esse fechamento antes de iniciar um novo movimento.
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={() => onNavigate('cashier')}>
                Regularizar Caixa
              </Button>
            </div>
          </Card>
        </motion.div>
      ) : null}

      {canViewFinancialArea && !currentCashSession && !pendingCashSession ? (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <Card className="p-4 border-warning/50 bg-warning/10">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-warning" />
              <div className="flex-1">
                <p className="font-medium text-foreground">
                  {canManageCashFlow ? 'Caixa fechado' : 'Sem caixa aberto no momento'}
                </p>
                <p className="text-sm text-muted-foreground">
                  {canManageCashFlow
                    ? 'Abra o caixa para registrar movimentos financeiros e fechar comandas'
                    : 'Consulte a gestão financeira para acompanhar os movimentos e o status do caixa.'}
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={() => onNavigate(financialPage)}>
                {financialActionLabel}
              </Button>
            </div>
          </Card>
        </motion.div>
      ) : null}

      {canViewFinancialArea && currentCashSession ? (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <Card className="p-4 border-success/50 bg-success/10">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="flex items-center gap-3">
                <Banknote className="w-5 h-5 text-success" />
                <div>
                  <p className="font-medium text-foreground">Caixa Aberto</p>
                  <p className="text-sm text-muted-foreground">
                    <Clock className="w-3 h-3 inline mr-1" />
                    Desde {new Date(currentCashSession.opened_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
              <div className="flex-1 flex flex-wrap gap-4 sm:justify-end">
                <div className="text-center sm:text-right">
                  <p className="text-xs text-muted-foreground">Entradas</p>
                  <p className="font-bold text-success">{formatCurrency(displayStats.cashSessionIncome)}</p>
                </div>
                <div className="text-center sm:text-right">
                  <p className="text-xs text-muted-foreground">Saídas</p>
                  <p className="font-bold text-destructive">{formatCurrency(displayStats.cashSessionExpense)}</p>
                </div>
                <div className="text-center sm:text-right">
                  <p className="text-xs text-muted-foreground">Saldo</p>
                  <p className="font-bold text-primary">{formatCurrency(displayStats.cashSessionBalance)}</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => onNavigate(financialPage)}>
                  {canManageCashFlow ? 'Ver Caixa' : 'Gestão Financeira'}
                </Button>
              </div>
            </div>
          </Card>
        </motion.div>
      ) : null}

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
        {statCards.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <motion.div
              key={stat.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
            >
              <Card className="p-6 hover:shadow-lg transition-shadow duration-300 border-0 shadow-md">
                <div className="flex items-start justify-between">
                  <div className={`p-3 rounded-xl bg-${stat.color}-soft`}>
                    <Icon className={`w-6 h-6 text-${stat.color}`} />
                  </div>
                  <div className={`flex items-center gap-1 text-sm font-medium ${stat.trendUp ? 'text-success' : 'text-muted-foreground'}`}>
                    {stat.trend}
                    {stat.trendUp ? (
                      <ArrowUpRight className="w-4 h-4" />
                    ) : (
                      <ArrowDownRight className="w-4 h-4" />
                    )}
                  </div>
                </div>
                <div className="mt-4">
                  <p className="text-2xl font-bold text-foreground">{stat.value}</p>
                  <p className="text-sm text-muted-foreground mt-1">{stat.title}</p>
                </div>
              </Card>
            </motion.div>
          );
        })}
      </div>

      {/* Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Upcoming Appointments */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="lg:col-span-2"
        >
          <Card className="p-6 border-0 shadow-md">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-display font-semibold text-foreground">
                Próximos Atendimentos
              </h2>
              <Button variant="ghost" size="sm" onClick={() => onNavigate(primarySchedulePage)}>
                Ver todos
              </Button>
            </div>
            <div className="space-y-4">
              {upcomingAppointments.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Calendar className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>Nenhum agendamento próximo</p>
                  <Button
                    variant="link"
                    className="mt-2"
                    onClick={() => onNavigate(primarySchedulePage)}
                  >
                    {newAppointmentLabel}
                  </Button>
                </div>
              ) : (
                upcomingAppointments.map((appointment) => (
                  <div
                    key={appointment.id}
                    className="flex items-center gap-4 p-4 rounded-xl bg-secondary/50 hover:bg-secondary transition-colors"
                  >
                    <div className="flex-shrink-0 w-16 text-center">
                      <p className="text-lg font-semibold text-foreground">
                        {formatTime(appointment.start_time)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatTime(appointment.end_time)}
                      </p>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-foreground truncate">
                        {appointment.client?.name || 'Cliente não informado'}
                      </p>
                      <p className="text-sm text-muted-foreground truncate">
                        {appointment.service?.name || 'Serviço'} • {appointment.professional?.nickname || 'Profissional'}
                      </p>
                    </div>
                    <Badge variant={appointment.status as any}>
                      {appointmentStatusLabels[appointment.status] || appointment.status}
                    </Badge>
                  </div>
                ))
              )}
            </div>
          </Card>
        </motion.div>

        {/* Professionals */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        >
          <Card className="p-6 border-0 shadow-md">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-display font-semibold text-foreground">
                Equipe
              </h2>
              <Button variant="ghost" size="sm" onClick={() => onNavigate('professionals')}>
                Ver todos
              </Button>
            </div>
            <div className="space-y-4">
              {activeProfessionals.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>Nenhum profissional cadastrado</p>
                  <Button 
                    variant="link" 
                    className="mt-2"
                    onClick={() => onNavigate('professionals')}
                  >
                    Cadastrar profissional
                  </Button>
                </div>
              ) : (
                activeProfessionals.map((professional) => (
                  <div
                    key={professional.id}
                    className="flex items-center gap-3 p-3 rounded-xl hover:bg-secondary/50 transition-colors"
                  >
                    <div className="w-10 h-10 rounded-full bg-primary-soft flex items-center justify-center">
                      <span className="text-sm font-semibold text-primary">
                        {professional.nickname.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-foreground truncate">
                        {professional.nickname}
                      </p>
                      <p className="text-xs text-muted-foreground capitalize">
                        {professional.type === 'employee' ? 'Funcionário' : 
                         professional.type === 'owner' ? 'Proprietário' : 
                         professional.type === 'freelancer' ? 'Freelancer' : professional.type}
                      </p>
                    </div>
                    <Badge variant={professional.is_active ? "success" : "secondary"} className="flex-shrink-0">
                      {professional.is_active ? 'Ativo' : 'Inativo'}
                    </Badge>
                  </div>
                ))
              )}
            </div>
          </Card>
        </motion.div>
      </div>

      {/* Quick Actions */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
      >
        <Card className="p-6 border-0 shadow-md bg-gradient-to-r from-primary/5 to-accent/5">
          <h2 className="text-xl font-display font-semibold text-foreground mb-4">
            Ações Rápidas
          </h2>
          <div className="flex flex-wrap gap-3">
            <Button variant="default" onClick={() => onNavigate(primarySchedulePage)}>
              <Calendar className="w-4 h-4 mr-2" />
              {newAppointmentLabel}
            </Button>
            <Button variant="secondary" onClick={() => onNavigate('clients')}>
              <Users className="w-4 h-4 mr-2" />
              Cadastrar Cliente
            </Button>
            {isCleaningSegment ? (
              <Button variant="secondary" onClick={() => onNavigate('cleaning')}>
                <DollarSign className="w-4 h-4 mr-2" />
                Conta Corrente
              </Button>
            ) : canViewFinancialArea ? (
              <Button variant="secondary" onClick={() => onNavigate(financialPage)}>
                <DollarSign className="w-4 h-4 mr-2" />
                {financialActionLabel}
              </Button>
            ) : null}
            <Button variant="secondary" onClick={() => onNavigate('commissions')}>
              <TrendingUp className="w-4 h-4 mr-2" />
              Comissões
            </Button>
          </div>
        </Card>
      </motion.div>
    </div>
  );
}
