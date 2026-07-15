import { useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BarChart3, DollarSign, ReceiptText, RefreshCw, Wallet } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/contexts/AuthContext';
import { Cashier } from '@/components/cashier/Cashier';
import { CashHistory } from '@/components/cashier/CashHistory';
import { Commissions } from '@/components/commissions/Commissions';
import { ProfessionalStatement } from '@/components/commissions/ProfessionalStatement';
import { CommissionReprocessing } from '@/components/commissions/CommissionReprocessing';

type FinancialTabId =
  | 'cashier'
  | 'financial-history'
  | 'commissions'
  | 'professional-statement'
  | 'commission-reprocessing';

interface FinancialWorkspaceProps {
  initialTab?: FinancialTabId;
}

const TAB_LABELS: Record<FinancialTabId, string> = {
  cashier: 'Caixa do Dia',
  'financial-history': 'Historico e Fluxo',
  commissions: 'Comissoes e Repasses',
  'professional-statement': 'Extrato do Profissional',
  'commission-reprocessing': 'Reprocessamento',
};

const TAB_ICONS: Record<FinancialTabId, typeof DollarSign> = {
  cashier: DollarSign,
  'financial-history': ReceiptText,
  commissions: Wallet,
  'professional-statement': BarChart3,
  'commission-reprocessing': RefreshCw,
};

const isFinancialTab = (value: string | null): value is FinancialTabId => (
  value === 'cashier'
  || value === 'financial-history'
  || value === 'commissions'
  || value === 'professional-statement'
  || value === 'commission-reprocessing'
);

export function FinancialWorkspace({ initialTab = 'financial-history' }: FinancialWorkspaceProps) {
  const { userRole, hasPermission } = useAuth();
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
    const tabs: FinancialTabId[] = [];

    if (canManageCashFlow) tabs.push('cashier');
    if (canViewFinancialHistory) tabs.push('financial-history');
    if (canViewCommissions) tabs.push('commissions', 'professional-statement');
    if (canReprocessCommissions) tabs.push('commission-reprocessing');

    return Array.from(new Set(tabs));
  }, [canManageCashFlow, canReprocessCommissions, canViewCommissions, canViewFinancialHistory]);

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
    <div className="space-y-6 p-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-display font-bold text-foreground">Financeiro</h1>
        <p className="text-muted-foreground">
          Caixa do dia, historico financeiro, comissoes, repasses e reprocessamentos no mesmo lugar.
        </p>
      </div>

      <Tabs value={currentTab} onValueChange={handleTabChange} className="space-y-6">
        <TabsList className="h-auto w-full justify-start overflow-x-auto rounded-xl border border-border bg-card p-1">
          {visibleTabs.map((tabId) => {
            const Icon = TAB_ICONS[tabId];
            return (
              <TabsTrigger
                key={tabId}
                value={tabId}
                className="gap-2 whitespace-nowrap rounded-lg px-4 py-2"
              >
                <Icon className="h-4 w-4" />
                {TAB_LABELS[tabId]}
              </TabsTrigger>
            );
          })}
        </TabsList>

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
