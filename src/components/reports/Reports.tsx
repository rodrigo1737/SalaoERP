import { useState, useMemo } from 'react';
import { useData } from '@/context/DataContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  BarChart3, 
  TrendingUp, 
  TrendingDown, 
  Users, 
  DollarSign, 
  Calendar,
  UserX,
  Award,
  Scissors,
  Clock,
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react';
import { format, subDays, subMonths, startOfMonth, endOfMonth, isWithinInterval, differenceInDays, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Legend,
  AreaChart,
  Area
} from 'recharts';

type PeriodFilter = '7d' | '30d' | '90d' | '12m' | 'custom';

const CHART_COLORS = [
  'hsl(215, 70%, 50%)',
  'hsl(38, 75%, 55%)',
  'hsl(142, 55%, 45%)',
  'hsl(260, 50%, 55%)',
  'hsl(0, 72%, 51%)',
  'hsl(180, 60%, 45%)',
  'hsl(280, 60%, 50%)',
  'hsl(45, 80%, 50%)',
];

export function Reports() {
  const { transactions, appointments, commissions, clients, professionals, services, cashSessions } = useData();
  const [period, setPeriod] = useState<PeriodFilter>('30d');
  const [inactiveDays, setInactiveDays] = useState('60');

  // Calculate date range based on period
  const dateRange = useMemo(() => {
    const end = new Date();
    let start: Date;
    
    switch (period) {
      case '7d':
        start = subDays(end, 7);
        break;
      case '30d':
        start = subDays(end, 30);
        break;
      case '90d':
        start = subDays(end, 90);
        break;
      case '12m':
        start = subMonths(end, 12);
        break;
      default:
        start = subDays(end, 30);
    }
    
    return { start, end };
  }, [period]);

  // Filter data by period
  const filteredTransactions = useMemo(() => {
    return transactions.filter(t => {
      const date = new Date(t.created_at);
      return isWithinInterval(date, { start: dateRange.start, end: dateRange.end });
    });
  }, [transactions, dateRange]);

  const filteredAppointments = useMemo(() => {
    return appointments.filter(a => {
      const date = new Date(a.start_time);
      return isWithinInterval(date, { start: dateRange.start, end: dateRange.end });
    });
  }, [appointments, dateRange]);

  const filteredCommissions = useMemo(() => {
    return commissions.filter(c => {
      const date = new Date(c.created_at);
      return isWithinInterval(date, { start: dateRange.start, end: dateRange.end });
    });
  }, [commissions, dateRange]);

  // Cash Flow Data (including commission payments)
  const cashFlowData = useMemo(() => {
    const dailyData: Record<string, { date: string; income: number; expense: number }> = {};
    
    // Add transaction income/expense
    filteredTransactions.forEach(t => {
      const dateKey = format(new Date(t.created_at), 'yyyy-MM-dd');
      if (!dailyData[dateKey]) {
        dailyData[dateKey] = { date: dateKey, income: 0, expense: 0 };
      }
      if (t.type === 'income') {
        dailyData[dateKey].income += Number(t.amount);
      } else {
        dailyData[dateKey].expense += Number(t.amount);
      }
    });

    // Add paid commissions as expenses (using paid_at date, avoiding double counting)
    const commissionTransactionIds = new Set(
      filteredTransactions
        .filter(t => t.reference_type === 'commission' || t.reference_type === 'commission_batch')
        .map(t => t.reference_id)
    );

    filteredCommissions
      .filter(c => c.status === 'paid' && c.paid_at && c.type !== 'voucher')
      .filter(c => !commissionTransactionIds.has(c.id)) // Avoid double counting
      .forEach(c => {
        const dateKey = format(new Date(c.paid_at!), 'yyyy-MM-dd');
        if (!dailyData[dateKey]) {
          dailyData[dateKey] = { date: dateKey, income: 0, expense: 0 };
        }
        dailyData[dateKey].expense += Number(c.commission_value);
      });
    
    return Object.values(dailyData)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(d => ({
        ...d,
        displayDate: format(new Date(d.date), 'dd/MM', { locale: ptBR }),
        net: d.income - d.expense,
      }));
  }, [filteredTransactions, filteredCommissions]);

  const totalIncome = filteredTransactions
    .filter(t => t.type === 'income')
    .reduce((sum, t) => sum + Number(t.amount), 0);

  // Calculate expenses from transactions
  const transactionExpenses = filteredTransactions
    .filter(t => t.type === 'expense')
    .reduce((sum, t) => sum + Number(t.amount), 0);

  // Calculate paid commissions (those that might not have expense transactions)
  const paidCommissionsTotal = filteredCommissions
    .filter(c => c.status === 'paid' && c.type !== 'voucher')
    .reduce((sum, c) => sum + Number(c.commission_value), 0);

  // Get commission expense transactions to avoid double counting
  const commissionExpenseTransactions = filteredTransactions
    .filter(t => t.type === 'expense' && (t.category === 'Pagamento de Comissão' || t.reference_type === 'commission' || t.reference_type === 'commission_batch'))
    .reduce((sum, t) => sum + Number(t.amount), 0);

  // Total expense = transaction expenses + paid commissions not yet recorded as transactions
  const totalExpense = transactionExpenses + Math.max(0, paidCommissionsTotal - commissionExpenseTransactions);

  const netBalance = totalIncome - totalExpense;

  // Commission Data
  const commissionsByProfessional = useMemo(() => {
    const data: Record<string, { name: string; total: number; pending: number; paid: number; count: number }> = {};
    
    filteredCommissions.forEach(c => {
      const prof = professionals.find(p => p.id === c.professional_id);
      const name = prof?.nickname || 'Desconhecido';
      
      if (!data[c.professional_id]) {
        data[c.professional_id] = { name, total: 0, pending: 0, paid: 0, count: 0 };
      }
      
      data[c.professional_id].total += Number(c.commission_value);
      data[c.professional_id].count += 1;
      
      if (c.status === 'paid') {
        data[c.professional_id].paid += Number(c.commission_value);
      } else {
        data[c.professional_id].pending += Number(c.commission_value);
      }
    });
    
    return Object.values(data).sort((a, b) => b.total - a.total);
  }, [filteredCommissions, professionals]);

  const totalCommissions = filteredCommissions.reduce((sum, c) => sum + Number(c.commission_value), 0);
  const pendingCommissions = filteredCommissions
    .filter(c => c.status === 'pending')
    .reduce((sum, c) => sum + Number(c.commission_value), 0);

  // Most Profitable Professionals
  const profitableProfessionals = useMemo(() => {
    const data: Record<string, { name: string; revenue: number; commissions: number; profit: number; appointments: number }> = {};
    
    filteredAppointments
      .filter(a => a.status === 'completed' && a.professional_id)
      .forEach(a => {
        const prof = professionals.find(p => p.id === a.professional_id);
        const name = prof?.nickname || 'Desconhecido';
        const revenue = Number(a.total_value) || 0;
        
        if (!data[a.professional_id!]) {
          data[a.professional_id!] = { name, revenue: 0, commissions: 0, profit: 0, appointments: 0 };
        }
        
        data[a.professional_id!].revenue += revenue;
        data[a.professional_id!].appointments += 1;
      });
    
    // Add commissions
    filteredCommissions.forEach(c => {
      if (data[c.professional_id]) {
        data[c.professional_id].commissions += Number(c.commission_value);
      }
    });
    
    // Calculate profit
    Object.values(data).forEach(d => {
      d.profit = d.revenue - d.commissions;
    });
    
    return Object.values(data).sort((a, b) => b.profit - a.profit);
  }, [filteredAppointments, filteredCommissions, professionals]);

  // Most Profitable Clients
  const profitableClients = useMemo(() => {
    const data: Record<string, { name: string; totalSpent: number; visits: number; avgTicket: number }> = {};
    
    filteredAppointments
      .filter(a => a.status === 'completed' && a.client_id)
      .forEach(a => {
        const client = clients.find(c => c.id === a.client_id);
        const name = client?.name || 'Desconhecido';
        const value = Number(a.total_value) || 0;
        
        if (!data[a.client_id!]) {
          data[a.client_id!] = { name, totalSpent: 0, visits: 0, avgTicket: 0 };
        }
        
        data[a.client_id!].totalSpent += value;
        data[a.client_id!].visits += 1;
      });
    
    // Calculate average ticket
    Object.values(data).forEach(d => {
      d.avgTicket = d.visits > 0 ? d.totalSpent / d.visits : 0;
    });
    
    return Object.values(data).sort((a, b) => b.totalSpent - a.totalSpent).slice(0, 10);
  }, [filteredAppointments, clients]);

  // Inactive Clients
  const inactiveClients = useMemo(() => {
    const daysThreshold = parseInt(inactiveDays);
    const now = new Date();
    
    const clientLastVisit: Record<string, Date> = {};
    
    appointments
      .filter(a => a.status === 'completed' && a.client_id)
      .forEach(a => {
        const visitDate = new Date(a.start_time);
        if (!clientLastVisit[a.client_id!] || visitDate > clientLastVisit[a.client_id!]) {
          clientLastVisit[a.client_id!] = visitDate;
        }
      });
    
    return clients
      .filter(c => {
        const lastVisit = clientLastVisit[c.id];
        if (!lastVisit) return true; // Never visited
        return differenceInDays(now, lastVisit) > daysThreshold;
      })
      .map(c => ({
        ...c,
        lastVisit: clientLastVisit[c.id] 
          ? format(clientLastVisit[c.id], 'dd/MM/yyyy', { locale: ptBR })
          : 'Nunca',
        daysSinceVisit: clientLastVisit[c.id] 
          ? differenceInDays(now, clientLastVisit[c.id])
          : null,
      }))
      .sort((a, b) => {
        if (!a.daysSinceVisit) return -1;
        if (!b.daysSinceVisit) return 1;
        return b.daysSinceVisit - a.daysSinceVisit;
      });
  }, [clients, appointments, inactiveDays]);

  // Services Revenue
  const servicesRevenue = useMemo(() => {
    const data: Record<string, { name: string; revenue: number; count: number }> = {};
    
    filteredAppointments
      .filter(a => a.status === 'completed' && a.service_id)
      .forEach(a => {
        const service = services.find(s => s.id === a.service_id);
        const name = service?.name || 'Desconhecido';
        const revenue = Number(a.total_value) || 0;
        
        if (!data[a.service_id!]) {
          data[a.service_id!] = { name, revenue: 0, count: 0 };
        }
        
        data[a.service_id!].revenue += revenue;
        data[a.service_id!].count += 1;
      });
    
    return Object.values(data).sort((a, b) => b.revenue - a.revenue);
  }, [filteredAppointments, services]);

  // Payment Methods Distribution
  const paymentMethodsData = useMemo(() => {
    const data: Record<string, number> = {};
    
    filteredTransactions
      .filter(t => t.type === 'income' && t.payment_method)
      .forEach(t => {
        const method = t.payment_method || 'other';
        data[method] = (data[method] || 0) + Number(t.amount);
      });
    
    const labels: Record<string, string> = {
      pix: 'PIX',
      credit_card: 'Crédito',
      debit_card: 'Débito',
      cash: 'Dinheiro',
      other: 'Outros',
    };
    
    return Object.entries(data).map(([key, value]) => ({
      name: labels[key] || key,
      value,
    }));
  }, [filteredTransactions]);

  // Expense Categories Distribution
  const expenseCategoriesData = useMemo(() => {
    const data: Record<string, number> = {};
    
    // Add transaction expenses by category
    filteredTransactions
      .filter(t => t.type === 'expense')
      .forEach(t => {
        const category = t.category || 'Outros';
        data[category] = (data[category] || 0) + Number(t.amount);
      });

    // Add paid commissions that don't have transaction records
    const commissionTransactionIds = new Set(
      filteredTransactions
        .filter(t => t.reference_type === 'commission' || t.reference_type === 'commission_batch')
        .map(t => t.reference_id)
    );

    const unrecordedCommissions = filteredCommissions
      .filter(c => c.status === 'paid' && c.type !== 'voucher')
      .filter(c => !commissionTransactionIds.has(c.id))
      .reduce((sum, c) => sum + Number(c.commission_value), 0);

    if (unrecordedCommissions > 0) {
      data['Comissões'] = (data['Comissões'] || 0) + unrecordedCommissions;
    }

    // Normalize category names
    const normalizedData: Record<string, number> = {};
    Object.entries(data).forEach(([key, value]) => {
      let normalizedKey = key;
      if (key === 'Pagamento de Comissão' || key === 'Comissão') {
        normalizedKey = 'Comissões';
      } else if (key === 'Vale') {
        normalizedKey = 'Vales';
      }
      normalizedData[normalizedKey] = (normalizedData[normalizedKey] || 0) + value;
    });
    
    return Object.entries(normalizedData)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [filteredTransactions, filteredCommissions]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Relatórios</h1>
          <p className="text-muted-foreground">Análise completa do seu negócio</p>
        </div>
        
        <div className="flex items-center gap-3">
          <Select value={period} onValueChange={(v) => setPeriod(v as PeriodFilter)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Período" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Últimos 7 dias</SelectItem>
              <SelectItem value="30d">Últimos 30 dias</SelectItem>
              <SelectItem value="90d">Últimos 90 dias</SelectItem>
              <SelectItem value="12m">Últimos 12 meses</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-l-4 border-l-success">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Receita Total</p>
                <p className="text-2xl font-bold text-success">{formatCurrency(totalIncome)}</p>
              </div>
              <div className="w-12 h-12 rounded-full bg-success/10 flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-success" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-destructive">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Despesas</p>
                <p className="text-2xl font-bold text-destructive">{formatCurrency(totalExpense)}</p>
              </div>
              <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
                <TrendingDown className="w-6 h-6 text-destructive" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-primary">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Lucro Líquido</p>
                <p className={`text-2xl font-bold ${netBalance >= 0 ? 'text-success' : 'text-destructive'}`}>
                  {formatCurrency(netBalance)}
                </p>
              </div>
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <DollarSign className="w-6 h-6 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-warning">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Comissões Pendentes</p>
                <p className="text-2xl font-bold text-warning">{formatCurrency(pendingCommissions)}</p>
              </div>
              <div className="w-12 h-12 rounded-full bg-warning/10 flex items-center justify-center">
                <Clock className="w-6 h-6 text-warning" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs defaultValue="cashflow" className="space-y-4">
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-6 h-auto gap-1">
          <TabsTrigger value="cashflow" className="text-xs md:text-sm">Fluxo de Caixa</TabsTrigger>
          <TabsTrigger value="commissions" className="text-xs md:text-sm">Comissões</TabsTrigger>
          <TabsTrigger value="professionals" className="text-xs md:text-sm">Profissionais</TabsTrigger>
          <TabsTrigger value="clients" className="text-xs md:text-sm">Clientes</TabsTrigger>
          <TabsTrigger value="services" className="text-xs md:text-sm">Serviços</TabsTrigger>
          <TabsTrigger value="inactive" className="text-xs md:text-sm">Inativos</TabsTrigger>
        </TabsList>

        {/* Cash Flow Tab */}
        <TabsContent value="cashflow" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-primary" />
                  Fluxo de Caixa Diário
                </CardTitle>
                <CardDescription>Entradas e saídas por dia</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={cashFlowData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="displayDate" className="text-xs" />
                      <YAxis className="text-xs" tickFormatter={(v) => `R$${v}`} />
                      <Tooltip 
                        formatter={(value: number) => formatCurrency(value)}
                        labelClassName="font-medium"
                      />
                      <Legend />
                      <Bar dataKey="income" name="Entradas" fill="hsl(142, 55%, 45%)" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="expense" name="Saídas" fill="hsl(0, 72%, 51%)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="w-5 h-5 text-primary" />
                  Formas de Pagamento
                </CardTitle>
                <CardDescription>Distribuição por método de pagamento</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={paymentMethodsData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                        outerRadius={100}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {paymentMethodsData.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: number) => formatCurrency(value)} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Cash Flow Balance Over Time */}
          <Card>
            <CardHeader>
              <CardTitle>Evolução do Saldo</CardTitle>
              <CardDescription>Resultado líquido diário</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={cashFlowData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="displayDate" className="text-xs" />
                    <YAxis className="text-xs" tickFormatter={(v) => `R$${v}`} />
                    <Tooltip formatter={(value: number) => formatCurrency(value)} />
                    <Area 
                      type="monotone" 
                      dataKey="net" 
                      name="Saldo Líquido"
                      stroke="hsl(215, 70%, 50%)" 
                      fill="hsl(215, 70%, 50% / 0.2)" 
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Expense Breakdown */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingDown className="w-5 h-5 text-destructive" />
                  Despesas por Categoria
                </CardTitle>
                <CardDescription>Distribuição das saídas</CardDescription>
              </CardHeader>
              <CardContent>
                {expenseCategoriesData.length > 0 ? (
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={expenseCategoriesData}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                          outerRadius={100}
                          fill="#8884d8"
                          dataKey="value"
                        >
                          {expenseCategoriesData.map((_, index) => (
                            <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value: number) => formatCurrency(value)} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                    <p>Nenhuma despesa no período</p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-destructive" />
                  Detalhamento de Despesas
                </CardTitle>
                <CardDescription>Valores por categoria</CardDescription>
              </CardHeader>
              <CardContent>
                {expenseCategoriesData.length > 0 ? (
                  <div className="space-y-3">
                    {expenseCategoriesData.map((item, index) => (
                      <div key={item.name} className="flex items-center justify-between p-3 rounded-lg bg-secondary/30">
                        <div className="flex items-center gap-3">
                          <div 
                            className="w-3 h-3 rounded-full" 
                            style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}
                          />
                          <span className="font-medium text-foreground">{item.name}</span>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-destructive">{formatCurrency(item.value)}</p>
                          <p className="text-xs text-muted-foreground">
                            {totalExpense > 0 ? ((item.value / totalExpense) * 100).toFixed(1) : 0}%
                          </p>
                        </div>
                      </div>
                    ))}
                    <div className="flex items-center justify-between p-3 rounded-lg bg-destructive/10 border border-destructive/20 mt-4">
                      <span className="font-semibold text-foreground">Total de Despesas</span>
                      <p className="font-bold text-destructive text-lg">{formatCurrency(totalExpense)}</p>
                    </div>
                  </div>
                ) : (
                  <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                    <p>Nenhuma despesa no período</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Commissions Tab */}
        <TabsContent value="commissions" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="w-5 h-5 text-primary" />
                  Comissões por Profissional
                </CardTitle>
                <CardDescription>Total de comissões geradas</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={commissionsByProfessional} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis type="number" tickFormatter={(v) => `R$${v}`} className="text-xs" />
                      <YAxis dataKey="name" type="category" className="text-xs" width={100} />
                      <Tooltip formatter={(value: number) => formatCurrency(value)} />
                      <Legend />
                      <Bar dataKey="paid" name="Pago" stackId="a" fill="hsl(142, 55%, 45%)" />
                      <Bar dataKey="pending" name="Pendente" stackId="a" fill="hsl(38, 92%, 50%)" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Resumo de Comissões</CardTitle>
                <CardDescription>Detalhamento por profissional</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 max-h-[300px] overflow-y-auto scrollbar-thin">
                  {commissionsByProfessional.map((prof, index) => (
                    <div key={index} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                          <span className="text-sm font-medium text-primary">{prof.name[0]}</span>
                        </div>
                        <div>
                          <p className="font-medium text-sm">{prof.name}</p>
                          <p className="text-xs text-muted-foreground">{prof.count} serviços</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-sm">{formatCurrency(prof.total)}</p>
                        {prof.pending > 0 && (
                          <Badge variant="outline" className="text-warning border-warning">
                            {formatCurrency(prof.pending)} pendente
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Professionals Tab */}
        <TabsContent value="professionals" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Award className="w-5 h-5 text-primary" />
                Profissionais Mais Rentáveis
              </CardTitle>
              <CardDescription>Ranking por lucro líquido (receita - comissões)</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={profitableProfessionals}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="name" className="text-xs" />
                    <YAxis tickFormatter={(v) => `R$${v}`} className="text-xs" />
                    <Tooltip formatter={(value: number) => formatCurrency(value)} />
                    <Legend />
                    <Bar dataKey="revenue" name="Receita" fill="hsl(215, 70%, 50%)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="commissions" name="Comissões" fill="hsl(38, 75%, 55%)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="profit" name="Lucro" fill="hsl(142, 55%, 45%)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {profitableProfessionals.slice(0, 6).map((prof, index) => (
              <Card key={index}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      index === 0 ? 'bg-yellow-100 text-yellow-600' :
                      index === 1 ? 'bg-gray-100 text-gray-600' :
                      index === 2 ? 'bg-amber-100 text-amber-700' :
                      'bg-primary/10 text-primary'
                    }`}>
                      {index < 3 ? <Award className="w-5 h-5" /> : <span className="font-bold">{index + 1}</span>}
                    </div>
                    <div>
                      <p className="font-semibold">{prof.name}</p>
                      <p className="text-xs text-muted-foreground">{prof.appointments} atendimentos</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div>
                      <p className="text-xs text-muted-foreground">Receita</p>
                      <p className="text-sm font-medium text-primary">{formatCurrency(prof.revenue)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Comissão</p>
                      <p className="text-sm font-medium text-warning">{formatCurrency(prof.commissions)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Lucro</p>
                      <p className="text-sm font-medium text-success">{formatCurrency(prof.profit)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Clients Tab */}
        <TabsContent value="clients" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5 text-primary" />
                Clientes Mais Rentáveis
              </CardTitle>
              <CardDescription>Top 10 clientes por valor gasto</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={profitableClients} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis type="number" tickFormatter={(v) => `R$${v}`} className="text-xs" />
                    <YAxis dataKey="name" type="category" className="text-xs" width={120} />
                    <Tooltip formatter={(value: number) => formatCurrency(value)} />
                    <Bar dataKey="totalSpent" name="Total Gasto" fill="hsl(215, 70%, 50%)" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            {profitableClients.slice(0, 5).map((client, index) => (
              <Card key={index} className={index === 0 ? 'border-primary/50 bg-primary/5' : ''}>
                <CardContent className="p-4 text-center">
                  <div className={`w-12 h-12 mx-auto mb-2 rounded-full flex items-center justify-center ${
                    index === 0 ? 'bg-primary text-primary-foreground' : 'bg-muted'
                  }`}>
                    <span className="font-bold">{index + 1}º</span>
                  </div>
                  <p className="font-semibold text-sm truncate">{client.name}</p>
                  <p className="text-lg font-bold text-primary">{formatCurrency(client.totalSpent)}</p>
                  <div className="flex justify-center gap-2 mt-2 text-xs text-muted-foreground">
                    <span>{client.visits} visitas</span>
                    <span>•</span>
                    <span>Ticket: {formatCurrency(client.avgTicket)}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Services Tab */}
        <TabsContent value="services" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Scissors className="w-5 h-5 text-primary" />
                  Receita por Serviço
                </CardTitle>
                <CardDescription>Faturamento por tipo de serviço</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={servicesRevenue}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, percent }) => `${name.substring(0, 15)}... (${(percent * 100).toFixed(0)}%)`}
                        outerRadius={100}
                        fill="#8884d8"
                        dataKey="revenue"
                      >
                        {servicesRevenue.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: number) => formatCurrency(value)} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Detalhamento de Serviços</CardTitle>
                <CardDescription>Receita e quantidade por serviço</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 max-h-[300px] overflow-y-auto scrollbar-thin">
                  {servicesRevenue.map((service, index) => (
                    <div key={index} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <div 
                          className="w-3 h-3 rounded-full" 
                          style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}
                        />
                        <div>
                          <p className="font-medium text-sm">{service.name}</p>
                          <p className="text-xs text-muted-foreground">{service.count} realizações</p>
                        </div>
                      </div>
                      <p className="font-bold text-sm">{formatCurrency(service.revenue)}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Inactive Clients Tab */}
        <TabsContent value="inactive" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <UserX className="w-5 h-5 text-destructive" />
                    Clientes Inativos
                  </CardTitle>
                  <CardDescription>Clientes que não retornaram no período selecionado</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Período de inatividade:</span>
                  <Select value={inactiveDays} onValueChange={setInactiveDays}>
                    <SelectTrigger className="w-[150px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="30">30 dias</SelectItem>
                      <SelectItem value="60">60 dias</SelectItem>
                      <SelectItem value="90">90 dias</SelectItem>
                      <SelectItem value="180">180 dias</SelectItem>
                      <SelectItem value="365">1 ano</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="mb-4 p-4 bg-destructive/10 rounded-lg border border-destructive/20">
                <div className="flex items-center gap-2">
                  <UserX className="w-5 h-5 text-destructive" />
                  <span className="font-semibold text-destructive">
                    {inactiveClients.length} clientes inativos
                  </span>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  Clientes sem visitas há mais de {inactiveDays} dias
                </p>
              </div>

              <div className="space-y-2 max-h-[400px] overflow-y-auto scrollbar-thin">
                {inactiveClients.map((client) => (
                  <div key={client.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg hover:bg-muted/70 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center">
                        <span className="text-sm font-medium text-destructive">{client.name[0]}</span>
                      </div>
                      <div>
                        <p className="font-medium">{client.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {client.phone || client.email || 'Sem contato'}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-muted-foreground">Última visita</p>
                      <Badge variant={client.lastVisit === 'Nunca' ? 'destructive' : 'outline'}>
                        {client.lastVisit}
                        {client.daysSinceVisit && ` (${client.daysSinceVisit} dias)`}
                      </Badge>
                    </div>
                  </div>
                ))}
                {inactiveClients.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    <Users className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p>Nenhum cliente inativo encontrado!</p>
                    <p className="text-sm">Seus clientes estão bem engajados.</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
