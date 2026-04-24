import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Building2, 
  Users, 
  DollarSign, 
  AlertTriangle, 
  CheckCircle, 
  Clock, 
  Ban,
  TrendingUp,
  CalendarDays,
  ArrowRight,
  Loader2
} from 'lucide-react';
import { format, differenceInDays, startOfMonth, endOfMonth, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Tenant {
  id: string;
  name: string;
  status: 'active' | 'readonly' | 'blocked';
  subscription_due_date: string | null;
  payment_method: string;
  created_at: string;
}

interface SuperAdminDashboardProps {
  onNavigate: (page: string) => void;
}

export function SuperAdminDashboard({ onNavigate }: SuperAdminDashboardProps) {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTenants();
  }, []);

  const fetchTenants = async () => {
    try {
      const { data, error } = await supabase
        .from('tenants')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setTenants(data || []);
    } catch (error) {
      console.error('Error fetching tenants:', error);
    } finally {
      setLoading(false);
    }
  };

  const stats = useMemo(() => {
    const today = new Date();
    const active = tenants.filter(t => t.status === 'active').length;
    const readonly = tenants.filter(t => t.status === 'readonly').length;
    const blocked = tenants.filter(t => t.status === 'blocked').length;
    
    // Tenants with subscription expiring in 7 days
    const expiringSoon = tenants.filter(t => {
      if (!t.subscription_due_date) return false;
      const dueDate = parseISO(t.subscription_due_date);
      const daysUntil = differenceInDays(dueDate, today);
      return daysUntil >= 0 && daysUntil <= 7;
    });

    // Tenants with expired subscription (overdue)
    const overdue = tenants.filter(t => {
      if (!t.subscription_due_date) return false;
      const dueDate = parseISO(t.subscription_due_date);
      return dueDate < today;
    });

    // New tenants this month
    const monthStart = startOfMonth(today);
    const monthEnd = endOfMonth(today);
    const newThisMonth = tenants.filter(t => {
      const createdAt = parseISO(t.created_at);
      return createdAt >= monthStart && createdAt <= monthEnd;
    }).length;

    return {
      total: tenants.length,
      active,
      readonly,
      blocked,
      expiringSoon,
      overdue,
      newThisMonth
    };
  }, [tenants]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">Ativo</Badge>;
      case 'readonly':
        return <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20">Somente Leitura</Badge>;
      case 'blocked':
        return <Badge className="bg-destructive/10 text-destructive border-destructive/20">Bloqueado</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">
            Painel Super Admin
          </h1>
          <p className="text-muted-foreground mt-1">
            Gestão da plataforma MultiSoluction ERP
          </p>
        </div>
        <Button onClick={() => onNavigate('tenants')} className="gap-2">
          <Building2 className="w-4 h-4" />
          Gerenciar Clientes B2B
          <ArrowRight className="w-4 h-4" />
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total de Clientes
            </CardTitle>
            <Building2 className="w-5 h-5 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground">{stats.total}</div>
            <p className="text-xs text-muted-foreground mt-1">
              +{stats.newThisMonth} este mês
            </p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-emerald-500/5 to-emerald-500/10 border-emerald-500/20">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Clientes Ativos
            </CardTitle>
            <CheckCircle className="w-5 h-5 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground">{stats.active}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {stats.total > 0 ? Math.round((stats.active / stats.total) * 100) : 0}% do total
            </p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-amber-500/5 to-amber-500/10 border-amber-500/20">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Somente Leitura
            </CardTitle>
            <Clock className="w-5 h-5 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground">{stats.readonly}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Pendente de pagamento
            </p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-destructive/5 to-destructive/10 border-destructive/20">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Bloqueados
            </CardTitle>
            <Ban className="w-5 h-5 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground">{stats.blocked}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Acesso suspenso
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Alerts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Expiring Soon */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              <CardTitle className="text-lg">Vencendo em Breve</CardTitle>
            </div>
            <CardDescription>
              Clientes com assinatura vencendo nos próximos 7 dias
            </CardDescription>
          </CardHeader>
          <CardContent>
            {stats.expiringSoon.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                Nenhum vencimento próximo
              </p>
            ) : (
              <div className="space-y-3">
                {stats.expiringSoon.slice(0, 5).map((tenant) => (
                  <div 
                    key={tenant.id} 
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                  >
                    <div>
                      <p className="font-medium text-sm">{tenant.name}</p>
                      <p className="text-xs text-muted-foreground">
                        Vence em {format(parseISO(tenant.subscription_due_date!), "dd/MM/yyyy", { locale: ptBR })}
                      </p>
                    </div>
                    <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/20">
                      {differenceInDays(parseISO(tenant.subscription_due_date!), new Date())} dias
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Overdue */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-destructive" />
              <CardTitle className="text-lg">Inadimplentes</CardTitle>
            </div>
            <CardDescription>
              Clientes com assinatura vencida
            </CardDescription>
          </CardHeader>
          <CardContent>
            {stats.overdue.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                Nenhum cliente inadimplente
              </p>
            ) : (
              <div className="space-y-3">
                {stats.overdue.slice(0, 5).map((tenant) => (
                  <div 
                    key={tenant.id} 
                    className="flex items-center justify-between p-3 rounded-lg bg-destructive/5"
                  >
                    <div>
                      <p className="font-medium text-sm">{tenant.name}</p>
                      <p className="text-xs text-muted-foreground">
                        Venceu em {format(parseISO(tenant.subscription_due_date!), "dd/MM/yyyy", { locale: ptBR })}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {getStatusBadge(tenant.status)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Tenants */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">Clientes Recentes</CardTitle>
              <CardDescription>
                Últimos clientes cadastrados na plataforma
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => onNavigate('tenants')}>
              Ver Todos
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {tenants.slice(0, 5).map((tenant) => (
              <div 
                key={tenant.id} 
                className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <Building2 className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium">{tenant.name}</p>
                    <p className="text-sm text-muted-foreground">
                      Cadastrado em {format(parseISO(tenant.created_at), "dd/MM/yyyy", { locale: ptBR })}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {tenant.subscription_due_date && (
                    <div className="text-right text-sm">
                      <p className="text-muted-foreground">Vencimento</p>
                      <p className="font-medium">
                        {format(parseISO(tenant.subscription_due_date), "dd/MM/yyyy", { locale: ptBR })}
                      </p>
                    </div>
                  )}
                  {getStatusBadge(tenant.status)}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
