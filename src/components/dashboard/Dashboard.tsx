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
import { useMemo } from 'react';

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
  in_progress: 'Em Andamento',
  completed: 'Concluído',
  cancelled: 'Cancelado',
  no_show: 'Não Compareceu',
};

export function Dashboard({ onNavigate }: DashboardProps) {
  const { 
    appointments, 
    clients, 
    professionals, 
    transactions, 
    currentCashSession,
    loading 
  } = useData();
  const { user } = useAuth();

  const stats = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const endOfToday = new Date(today);
    endOfToday.setHours(23, 59, 59, 999);

    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const endOfMonth   = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59, 999);

    // ITEM 19: ambos (hoje e mês) calculados a partir da mesma fonte: transactions de tipo income
    const incomeTransactions = transactions.filter(t => t.type === 'income');

    const todayRevenue = incomeTransactions
      .filter(t => {
        const d = new Date(t.created_at);
        return d >= today && d <= endOfToday;
      })
      .reduce((sum, t) => sum + Number(t.amount), 0);

    const monthRevenue = incomeTransactions
      .filter(t => {
        const tDate = new Date(t.created_at);
        return tDate >= startOfMonth && tDate <= endOfMonth;
      })
      .reduce((sum, t) => sum + Number(t.amount), 0);

    // Filter today's appointments (para contagem — não para receita)
    const todayAppts = appointments.filter(apt => {
      const aptDate = new Date(apt.start_time);
      return aptDate >= today && aptDate <= endOfToday;
    });

    // Active clients (clients with appointments in the last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const activeClientIds = new Set(
      appointments
        .filter(apt => new Date(apt.start_time) >= thirtyDaysAgo && apt.client_id)
        .map(apt => apt.client_id)
    );

    // Current cash session stats
    const sessionTransactions = currentCashSession
      ? transactions.filter(t => t.cash_session_id === currentCashSession.id)
      : [];
    
    const cashSessionIncome = sessionTransactions
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + Number(t.amount), 0);
    
    const cashSessionExpense = sessionTransactions
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + Number(t.amount), 0);

    return {
      todayRevenue,
      todayAppointments: todayAppts.length,
      activeClients: activeClientIds.size || clients.length,
      monthRevenue,
      cashSessionIncome,
      cashSessionExpense,
      cashSessionBalance: currentCashSession 
        ? currentCashSession.opening_balance + cashSessionIncome - cashSessionExpense 
        : 0,
    };
  }, [appointments, transactions, clients, currentCashSession]);

  const upcomingAppointments = useMemo(() => {
    const now = new Date();
    return appointments
      .filter(apt => new Date(apt.start_time) >= now && apt.status !== 'cancelled')
      .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
      .slice(0, 4);
  }, [appointments]);

  const activeProfessionals = useMemo(() => {
    return professionals.filter(p => p.is_active).slice(0, 4);
  }, [professionals]);

  const statCards = [
    {
      title: 'Faturamento Hoje',
      value: formatCurrency(stats.todayRevenue),
      icon: DollarSign,
      trend: stats.todayRevenue > 0 ? '+' + formatCurrency(stats.todayRevenue) : 'R$ 0',
      trendUp: stats.todayRevenue > 0,
      color: 'primary',
    },
    {
      title: 'Agendamentos Hoje',
      value: stats.todayAppointments.toString(),
      icon: Calendar,
      trend: stats.todayAppointments > 0 ? `${stats.todayAppointments} hoje` : 'Nenhum',
      trendUp: stats.todayAppointments > 0,
      color: 'success',
    },
    {
      title: 'Clientes Cadastrados',
      value: clients.length.toString(),
      icon: Users,
      trend: stats.activeClients > 0 ? `${stats.activeClients} ativos` : 'Nenhum',
      trendUp: stats.activeClients > 0,
      color: 'info',
    },
    {
      title: 'Faturamento Mensal',
      value: formatCurrency(stats.monthRevenue),
      icon: TrendingUp,
      trend: stats.monthRevenue > 0 ? 'Este mês' : 'Sem movimentos',
      trendUp: stats.monthRevenue > 0,
      color: 'accent',
    },
  ];

  const userName = user?.user_metadata?.full_name || 'Usuário';

  if (loading) {
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
            Aqui está o resumo do seu salão hoje
          </p>
        </div>
        <Button variant="hero" size="lg" onClick={() => onNavigate('agenda')}>
          <Calendar className="w-5 h-5 mr-2" />
          Ver Agenda
        </Button>
      </div>

      {/* Cash Session Alert or Summary */}
      {!currentCashSession ? (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <Card className="p-4 border-warning/50 bg-warning/10">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-warning" />
              <div className="flex-1">
                <p className="font-medium text-foreground">Caixa fechado</p>
                <p className="text-sm text-muted-foreground">
                  Abra o caixa para registrar movimentos financeiros e fechar comandas
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={() => onNavigate('cashier')}>
                Abrir Caixa
              </Button>
            </div>
          </Card>
        </motion.div>
      ) : (
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
                  <p className="font-bold text-success">{formatCurrency(stats.cashSessionIncome)}</p>
                </div>
                <div className="text-center sm:text-right">
                  <p className="text-xs text-muted-foreground">Saídas</p>
                  <p className="font-bold text-destructive">{formatCurrency(stats.cashSessionExpense)}</p>
                </div>
                <div className="text-center sm:text-right">
                  <p className="text-xs text-muted-foreground">Saldo</p>
                  <p className="font-bold text-primary">{formatCurrency(stats.cashSessionBalance)}</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => onNavigate('cashier')}>
                  Ver Caixa
                </Button>
              </div>
            </div>
          </Card>
        </motion.div>
      )}

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
              <Button variant="ghost" size="sm" onClick={() => onNavigate('agenda')}>
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
                    onClick={() => onNavigate('agenda')}
                  >
                    Criar novo agendamento
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
            <Button variant="default" onClick={() => onNavigate('agenda')}>
              <Calendar className="w-4 h-4 mr-2" />
              Novo Agendamento
            </Button>
            <Button variant="secondary" onClick={() => onNavigate('clients')}>
              <Users className="w-4 h-4 mr-2" />
              Cadastrar Cliente
            </Button>
            <Button variant="secondary" onClick={() => onNavigate('cashier')}>
              <DollarSign className="w-4 h-4 mr-2" />
              {currentCashSession ? 'Ver Caixa' : 'Abrir Caixa'}
            </Button>
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
