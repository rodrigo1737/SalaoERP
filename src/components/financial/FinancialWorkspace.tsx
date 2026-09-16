import { useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BarChart3, DollarSign, ReceiptText, RefreshCw, Wallet, ArrowDownRight, ArrowUpRight, Clock3 } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/context/DataContext';
import { Card, CardContent } from '@/components/ui/card';
import { Cashier } from '@/components/cashier/Cashier';
import { CashHistory } from '@/components/cashier/CashHistory';
import { Commissions } from '@/components/commissions/Commissions';
import { ProfessionalStatement } from '@/components/commissions/ProfessionalStatement';
import { CommissionReprocessing } from '@/components/commissions/CommissionReprocessing';

type FinancialTabId =
  | 'overview'
  | 'cashier'
  | 'financial-history'
  | 'commissions'
  | 'professional-statement'
  | 'commission-reprocessing';

interface FinancialWorkspaceProps {
  initialTab?: FinancialTabId;
}

const TAB_LABELS: Record<FinancialTabId, string> = {
  overview: 'Visão Geral',
  cashier: 'Caixa do Dia',
  'financial-history': 'Historico e Fluxo',
  commissions: 'Comissoes e Repasses',
  'professional-statement': 'Extrato do Profissional',
  'commission-reprocessing': 'Reprocessamento',
};

const TAB_ICONS: Record<FinancialTabId, typeof DollarSign> = {
  overview: BarChart3,
  cashier: DollarSign,
  'financial-history': ReceiptText,
  commissions: Wallet,
  'professional-statement': BarChart3,
  'commission-reprocessing': RefreshCw,
};

const isFinancialTab = (value: string | null): value is FinancialTabId => (
  value === 'overview'
  ||
  value === 'cashier'
  || value === 'financial-history'
  || value === 'commissions'
  || value === 'professional-statement'
  || value === 'commission-reprocessing'
);

export function FinancialWorkspace({ initialTab = 'financial-history' }: FinancialWorkspaceProps) {
  const { userRole, hasPermission } = useAuth();
  const { currentCashSession, pendingCashSession, transactions, commissions } = useData();
  const [searchParams, setSearchParams] = useSearchParams();

  const isAdmin = userRole === 'admin';
  const canManageCashFlow = isAdmin || hasPermission('manage_cash_flow');
  const canViewFinancialHistory = isAdmin
    || hasPermission('view_financial_history')
    || hasPermission('reverse_financial_entries');
  const canViewCommissions = isAdmin
    || hasPermission('view_commissions')
    || hasPermission('view_financial_history')
    || hasPermission('reverse_financial_entries');
  const canReprocessCommissions = isAdmin || hasPermission('reverse_financial_entries');

  const visibleTabs = useMemo<FinancialTabId[]>(() => {
    const tabs: FinancialTabId[] = ['overview'];

    if (canManageCashFlow) tabs.push('cashier');
    if (canViewFinancialHistory) tabs.push('financial-history');
    if (canViewCommissions) tabs.push('commissions', 'professional-statement');
    if (canReprocessCommissions) tabs.push('commission-reprocessing');

    return Array.from(new Set(tabs));
  }, [canManageCashFlow, canReprocessCommissions, canViewCommissions, canViewFinancialHistory]);

  const overview = useMemo(() => {
    const today = new Date();
    const isToday = (value: string) => {
      const date = new Date(value);
      return date.getFullYear() === today.getFullYear()
        && date.getMonth() === today.getMonth()
        && date.getDate() === today.getDate();
    };
    const todayTransactions = transactions.filter((transaction) => isToday(transaction.created_at) && !transaction.reversed_at);
    const income = todayTransactions.filter((transaction) => transaction.type === 'income').reduce((sum, item) => sum + Number(item.amount), 0);
    const expense = todayTransactions.filter((transaction) => transaction.type === 'expense').reduce((sum, item) => sum + Number(item.amount), 0);
    const pendingCommissions = commissions.filter((commission) => commission.status === 'pending').reduce((sum, item) => sum + Math.max(0, Number(item.commission_value) - Number(item.settled_amount ?? 0)), 0);
    return { income, expense, balance: Number(currentCashSession?.opening_balance ?? pendingCashSession?.opening_balance ?? 0) + income - expense, pendingCommissions };
  }, [commissions, currentCashSession, pendingCashSession, transactions]);

  const requestedTab = searchParams.get('tab');
  const currentTab = useMemo<FinancialTabId>(() => {
    if (isFinancialTab(requestedTab) && visibleTabs.includes(requestedTab)) {
      return requestedTab;
    }

    if (visibleTabs.includes(initialTab)) {
      return initialTab;
    }

    return visibleTabs[0] ?? 'financial-history';
  }, [initialTab, requestedTab, visibleTabs]);

  useEffect(() => {
    if (!visibleTabs.length) return;
    if (requestedTab === currentTab) return;

    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('tab', currentTab);
    setSearchParams(nextParams, { replace: true });
  }, [currentTab, requestedTab, searchParams, setSearchParams, visibleTabs]);

  const handleTabChange = (value: string) => {
    if (!isFinancialTab(value)) return;
    if (!visibleTabs.includes(value)) return;

    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('tab', value);
    setSearchParams(nextParams, { replace: true });
  };

  if (visibleTabs.length === 0) {
    return null;
  }

  return (
    <div className="space-y-5 p-4 sm:space-y-6 sm:p-6 lg:p-8">
      <div className="rounded-2xl border border-primary/10 bg-gradient-to-br from-card via-card to-primary-soft/40 p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Visão financeira</p>
            <h1 className="text-2xl font-display font-bold text-foreground sm:text-3xl">Gestão Financeira</h1>
            <p className="max-w-2xl text-sm text-muted-foreground sm:text-base">
              Caixa do dia, histórico financeiro, comissões, repasses e reprocessamentos em um só lugar.
            </p>
          </div>
          <div className="hidden rounded-xl border border-border/60 bg-background/70 px-3 py-2 text-xs text-muted-foreground sm:block">
            Selecione uma área para começar
          </div>
        </div>
      </div>

      <Tabs value={currentTab} onValueChange={handleTabChange} className="space-y-6">
        <TabsList aria-label="Áreas financeiras" className="h-auto w-full flex-wrap justify-start gap-1 rounded-xl border border-border/70 bg-card/95 p-1.5 shadow-sm">
          {visibleTabs.map((tabId) => {
            const Icon = TAB_ICONS[tabId];
            return (
              <TabsTrigger
                key={tabId}
                value={tabId}
                className="min-h-10 flex-1 gap-2 rounded-lg px-3 py-2 text-xs sm:flex-none sm:px-4 sm:text-sm"
              >
                <Icon className="h-4 w-4" />
                {TAB_LABELS[tabId]}
              </TabsTrigger>
            );
          })}
        </TabsList>

        <TabsContent value="overview" className="mt-0 space-y-5">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: 'Saldo do caixa', value: overview.balance, icon: Wallet, tone: 'text-primary', bg: 'bg-primary-soft/60' },
              { label: 'Entradas hoje', value: overview.income, icon: ArrowUpRight, tone: 'text-success', bg: 'bg-success-soft/70' },
              { label: 'Saídas hoje', value: overview.expense, icon: ArrowDownRight, tone: 'text-destructive', bg: 'bg-destructive-soft/70' },
              { label: 'Comissões pendentes', value: overview.pendingCommissions, icon: Clock3, tone: 'text-warning', bg: 'bg-warning-soft/70' },
            ].map(({ label, value, icon: Icon, tone, bg }) => (
              <Card key={label} className="border-border/60 shadow-sm">
                <CardContent className="flex items-center justify-between p-5">
                  <div><p className="text-sm text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-semibold tracking-tight text-foreground">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)}</p></div>
                  <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${bg}`}><Icon className={`h-5 w-5 ${tone}`} /></div>
                </CardContent>
              </Card>
            ))}
          </div>
          <Card className="border-border/60 bg-muted/20 shadow-sm"><CardContent className="p-5 text-sm text-muted-foreground">Resumo calculado com os lançamentos já carregados para este usuário e tenant.</CardContent></Card>
        </TabsContent>

        {visibleTabs.includes('cashier') && (
          <TabsContent value="cashier" className="mt-0">
            <Cashier />
          </TabsContent>
        )}

        {visibleTabs.includes('financial-history') && (
          <TabsContent value="financial-history" className="mt-0">
            <CashHistory />
          </TabsContent>
        )}

        {visibleTabs.includes('commissions') && (
          <TabsContent value="commissions" className="mt-0">
            <Commissions />
          </TabsContent>
        )}

        {visibleTabs.includes('professional-statement') && (
          <TabsContent value="professional-statement" className="mt-0">
            <ProfessionalStatement />
          </TabsContent>
        )}

        {visibleTabs.includes('commission-reprocessing') && (
          <TabsContent value="commission-reprocessing" className="mt-0">
            <CommissionReprocessing />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
