import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  AlertCircle,
  ArrowLeft,
  Calendar,
  Clock,
  DollarSign,
  Receipt,
  RotateCcw,
  Search,
  ShieldCheck,
  Ticket,
  TrendingDown,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { useData, CashSession, Transaction } from '@/context/DataContext';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';

interface CashHistoryProps {
  onBack?: () => void;
}

const formatCurrency = (value: number) => (
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value)
);

const formatDate = (dateString?: string | null) => {
  if (!dateString) return '--';
  return new Date(dateString).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
};

const formatDateTime = (dateString?: string | null) => {
  if (!dateString) return '--';
  return new Date(dateString).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const referenceTypeLabels: Record<string, string> = {
  appointment: 'Comanda',
  appointment_refunded: 'Comanda estornada',
  refund: 'Estorno de comanda',
  commission: 'Pagamento de comissão',
  commission_batch: 'Pagamento em lote',
  commission_reversal: 'Estorno de comissão',
  commission_batch_reversal: 'Estorno em lote',
  voucher: 'Vale',
  voucher_reversal: 'Estorno de vale',
  transaction_reversal: 'Estorno financeiro',
};

const paymentMethodLabels: Record<string, string> = {
  cash: 'Dinheiro',
  credit_card: 'Crédito',
  debit_card: 'Débito',
  pix: 'PIX',
  other: 'Outro',
};

const normalizeDateInput = (value: string, endOfDay = false) => {
  if (!value) return null;
  return new Date(`${value}T${endOfDay ? '23:59:59' : '00:00:00'}`);
};

const isDateBetween = (dateString: string, dateFrom: string, dateTo: string) => {
  const date = new Date(dateString);
  const from = normalizeDateInput(dateFrom, false);
  const to = normalizeDateInput(dateTo, true);

  if (from && date < from) return false;
  if (to && date > to) return false;
  return true;
};

const getMovementTone = (transaction: Transaction) => {
  if (transaction.reversed_at) return 'muted';
  return transaction.type === 'income' ? 'success' : 'danger';
};

export function CashHistory({ onBack }: CashHistoryProps) {
  const {
    cashSessions,
    transactions,
    commissions,
    currentCashSession,
    pendingCashSession,
    reverseTransaction,
    loading,
  } = useData();
  const { userRole, hasPermission } = useAuth();

  const canViewFinancialHistory = userRole === 'admin'
    || hasPermission('view_financial_history')
    || hasPermission('reverse_financial_entries');
  const canReverseFinancialEntries = userRole === 'admin'
    || hasPermission('refund_bill')
    || hasPermission('reverse_financial_entries');

  const [tab, setTab] = useState('sessions');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [search, setSearch] = useState('');

  const normalizedSearch = search.trim().toLowerCase();
  const transactionsBySessionId = useMemo(() => {
    const grouped = new Map<string, Transaction[]>();
    transactions.forEach((transaction) => {
      const sessionId = transaction.cash_session_id ?? 'sem-caixa';
      const current = grouped.get(sessionId) ?? [];
      current.push(transaction);
      grouped.set(sessionId, current);
    });
    return grouped;
  }, [transactions]);

  const transactionById = useMemo(
    () => new Map(transactions.map((transaction) => [transaction.id, transaction])),
    [transactions],
  );

  const filteredTransactions = useMemo(() => (
    transactions.filter((transaction) => {
      if (!isDateBetween(transaction.created_at, dateFrom, dateTo)) return false;
      if (!normalizedSearch) return true;

      const haystack = [
        transaction.category,
        transaction.description,
        transaction.reference_type,
        paymentMethodLabels[transaction.payment_method ?? ''] ?? transaction.payment_method,
      ].join(' ').toLowerCase();

      return haystack.includes(normalizedSearch);
    })
  ), [dateFrom, dateTo, normalizedSearch, transactions]);

  const filteredSessions = useMemo(() => (
    cashSessions.filter((session) => {
      if (!isDateBetween(session.opened_at, dateFrom, dateTo)) return false;
      if (!normalizedSearch) return true;
      const haystack = [
        session.status,
        session.notes,
        formatDate(session.opened_at),
      ].join(' ').toLowerCase();
      return haystack.includes(normalizedSearch);
    })
  ), [cashSessions, dateFrom, dateTo, normalizedSearch]);

  const filteredCommissions = useMemo(() => (
    commissions.filter((commission) => {
      const baseDate = commission.paid_at ?? commission.created_at;
      if (!isDateBetween(baseDate, dateFrom, dateTo)) return false;
      if (!normalizedSearch) return true;

      const professionalName = commission.professional?.nickname ?? commission.professional?.name ?? '';
      const typeLabel = commission.type === 'voucher' ? 'vale' : 'comissão';
      return [professionalName, typeLabel, commission.status].join(' ').toLowerCase().includes(normalizedSearch);
    })
  ), [commissions, dateFrom, dateTo, normalizedSearch]);

  const summary = useMemo(() => {
    const grossIncome = filteredTransactions
      .filter((transaction) => transaction.type === 'income')
      .reduce((sum, transaction) => sum + Number(transaction.amount), 0);

    const grossExpense = filteredTransactions
      .filter((transaction) => transaction.type === 'expense')
      .reduce((sum, transaction) => sum + Number(transaction.amount), 0);

    const reversedCount = filteredTransactions.filter((transaction) => transaction.reversed_at).length;

    return {
      grossIncome,
      grossExpense,
      net: grossIncome - grossExpense,
      reversedCount,
      openSessions: filteredSessions.filter((session) => session.status === 'open').length,
      closedSessions: filteredSessions.filter((session) => session.status === 'closed').length,
    };
  }, [filteredSessions, filteredTransactions]);

  const getSessionStats = (session: CashSession) => {
    const sessionTransactions = (transactionsBySessionId.get(session.id) ?? []).filter((transaction) =>
      isDateBetween(transaction.created_at, dateFrom, dateTo),
    );

    const totalIncome = sessionTransactions
      .filter((transaction) => transaction.type === 'income')
      .reduce((sum, transaction) => sum + Number(transaction.amount), 0);

    const totalExpense = sessionTransactions
      .filter((transaction) => transaction.type === 'expense')
      .reduce((sum, transaction) => sum + Number(transaction.amount), 0);

    return {
      totalIncome,
      totalExpense,
      transactions: sessionTransactions.sort((a, b) => (
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      )),
    };
  };

  const getReferenceLabel = (transaction: Transaction) => (
    referenceTypeLabels[transaction.reference_type ?? ''] ?? transaction.reference_type ?? 'Movimento manual'
  );

  const handleReverse = async (transaction: Transaction) => {
    await reverseTransaction(transaction.id);
  };

  const canReverseTransaction = (transaction: Transaction) => (
    canReverseFinancialEntries
    && !transaction.reversed_at
    && transaction.reference_type !== 'transaction_reversal'
    && transaction.reference_type !== 'refund'
  );

  if (!canViewFinancialHistory) {
    return (
      <div className="p-6 lg:p-8 space-y-6">
        <div className="flex items-center gap-4">
          {onBack ? (
            <Button variant="ghost" size="icon" onClick={onBack}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
          ) : null}
          <div>
            <h1 className="text-3xl lg:text-4xl font-display font-bold text-foreground">
              Gestão Financeira
            </h1>
            <p className="text-muted-foreground mt-1">
              Este usuário não possui acesso ao histórico financeiro.
            </p>
          </div>
        </div>

        <Card className="p-8 border-0 shadow-lg">
          <div className="flex items-start gap-4">
            <ShieldCheck className="w-10 h-10 text-primary shrink-0" />
            <div className="space-y-2">
              <h2 className="text-xl font-semibold text-foreground">Acesso controlado por permissão</h2>
              <p className="text-muted-foreground">
                Libere <strong>Visualizar Histórico Financeiro</strong> ou <strong>Estornar Movimentos Financeiros</strong> na tela de
                administração para este usuário.
              </p>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div className="flex items-center gap-4">
        {onBack ? (
          <Button variant="ghost" size="icon" onClick={onBack}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
        ) : null}
        <div className="flex-1">
          <h1 className="text-3xl lg:text-4xl font-display font-bold text-foreground">
            Gestão Financeira
          </h1>
          <p className="text-muted-foreground mt-1">
            Histórico de caixas, entradas, saídas, comissões, vales e estornos.
          </p>
        </div>
        {pendingCashSession ? (
          <Badge variant="warning" className="gap-1">
            <AlertCircle className="w-3.5 h-3.5" />
            Caixa pendente de regularização
          </Badge>
        ) : currentCashSession ? (
          <Badge variant="success" className="gap-1">
            <Wallet className="w-3.5 h-3.5" />
            Caixa atual aberto
          </Badge>
        ) : (
          <Badge variant="secondary">Sem caixa aberto no momento</Badge>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <Card className="p-4 border-0 shadow-md">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">Entradas</span>
            <TrendingUp className="w-4 h-4 text-success" />
          </div>
          <p className="text-2xl font-bold text-foreground">{formatCurrency(summary.grossIncome)}</p>
        </Card>
        <Card className="p-4 border-0 shadow-md">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">Saídas</span>
            <TrendingDown className="w-4 h-4 text-destructive" />
          </div>
          <p className="text-2xl font-bold text-foreground">{formatCurrency(summary.grossExpense)}</p>
        </Card>
        <Card className="p-4 border-0 shadow-md">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">Saldo líquido</span>
            <DollarSign className="w-4 h-4 text-primary" />
          </div>
          <p className="text-2xl font-bold text-foreground">{formatCurrency(summary.net)}</p>
        </Card>
        <Card className="p-4 border-0 shadow-md">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">Caixas</span>
            <Calendar className="w-4 h-4 text-primary" />
          </div>
          <p className="text-2xl font-bold text-foreground">{summary.openSessions} abertos / {summary.closedSessions} fechados</p>
        </Card>
        <Card className="p-4 border-0 shadow-md">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">Movimentos estornados</span>
            <RotateCcw className="w-4 h-4 text-amber-500" />
          </div>
          <p className="text-2xl font-bold text-foreground">{summary.reversedCount}</p>
        </Card>
      </div>

      <Card className="p-4 border-0 shadow-md">
        <div className="grid gap-3 lg:grid-cols-[1fr_180px_180px]">
          <div className="relative">
            <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por categoria, descrição, tipo, profissional..."
              className="pl-9"
            />
          </div>
          <Input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
          <Input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
        </div>
      </Card>

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="sessions">Histórico de Caixas</TabsTrigger>
          <TabsTrigger value="transactions">Entradas e Saídas</TabsTrigger>
          <TabsTrigger value="commissions">Comissões e Vales</TabsTrigger>
        </TabsList>

        <TabsContent value="sessions" className="space-y-4">
          {loading ? (
            <Card className="p-8 border-0 shadow-md text-center text-muted-foreground">
              Carregando histórico financeiro...
            </Card>
          ) : filteredSessions.length === 0 ? (
            <Card className="p-8 border-0 shadow-md text-center text-muted-foreground">
              Nenhum caixa encontrado para o filtro atual.
            </Card>
          ) : (
            filteredSessions.map((session, index) => {
              const stats = getSessionStats(session);
              return (
                <motion.div
                  key={session.id}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.03 }}
                >
                  <Card className="p-5 border-0 shadow-md space-y-4">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <h2 className="text-xl font-semibold text-foreground">
                            Caixa de {formatDate(session.opened_at)}
                          </h2>
                          <Badge variant={session.status === 'open' ? 'success' : 'secondary'}>
                            {session.status === 'open' ? 'Aberto' : 'Fechado'}
                          </Badge>
                          {session.is_late_closure ? (
                            <Badge variant="warning">Fechamento tardio</Badge>
                          ) : null}
                        </div>
                        <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                          <span className="inline-flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5" />
                            Abertura: {formatDateTime(session.opened_at)}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5" />
                            Fechamento: {formatDateTime(session.closed_at)}
                          </span>
                        </div>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-3">
                        <div className="rounded-xl bg-secondary/40 px-4 py-3">
                          <p className="text-xs uppercase tracking-wide text-muted-foreground">Abertura</p>
                          <p className="font-semibold text-foreground">{formatCurrency(session.opening_balance)}</p>
                        </div>
                        <div className="rounded-xl bg-secondary/40 px-4 py-3">
                          <p className="text-xs uppercase tracking-wide text-muted-foreground">Entradas / Saídas</p>
                          <p className="font-semibold text-foreground">
                            {formatCurrency(stats.totalIncome)} / {formatCurrency(stats.totalExpense)}
                          </p>
                        </div>
                        <div className="rounded-xl bg-secondary/40 px-4 py-3">
                          <p className="text-xs uppercase tracking-wide text-muted-foreground">Fechamento</p>
                          <p className="font-semibold text-foreground">{formatCurrency(session.closing_balance ?? 0)}</p>
                        </div>
                      </div>
                    </div>

                    {session.notes ? (
                      <div className="rounded-xl border border-border/60 bg-background/60 px-4 py-3 text-sm text-muted-foreground">
                        {session.notes}
                      </div>
                    ) : null}

                    {session.difference !== null && session.difference !== undefined ? (
                      <div className="grid gap-3 md:grid-cols-2">
                        <div className="rounded-xl border border-border/60 bg-background/60 px-4 py-3 text-sm">
                          <p className="text-muted-foreground">Saldo esperado</p>
                          <p className="font-semibold text-foreground">{formatCurrency(session.expected_balance ?? 0)}</p>
                        </div>
                        <div className="rounded-xl border border-border/60 bg-background/60 px-4 py-3 text-sm">
                          <p className="text-muted-foreground">Diferença apurada</p>
                          <p className={cn(
                            'font-semibold',
                            Number(session.difference ?? 0) === 0 ? 'text-success' : 'text-warning',
                          )}>
                            {formatCurrency(session.difference ?? 0)}
                          </p>
                        </div>
                        {session.divergence_reason ? (
                          <div className="md:col-span-2 rounded-xl border border-warning/30 bg-warning-soft/30 px-4 py-3 text-sm text-muted-foreground">
                            <span className="font-medium text-foreground">Justificativa:</span> {session.divergence_reason}
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="font-medium text-foreground">Movimentos do caixa</h3>
                        <span className="text-sm text-muted-foreground">{stats.transactions.length} registro(s)</span>
                      </div>

                      {stats.transactions.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                          Nenhuma movimentação encontrada neste caixa para o filtro atual.
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {stats.transactions.map((transaction) => (
                            <div
                              key={transaction.id}
                              className={cn(
                                'rounded-2xl border px-4 py-3',
                                transaction.reversed_at ? 'border-amber-200 bg-amber-50/70' : 'border-border bg-background/70',
                              )}
                            >
                              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                                <div className="space-y-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <Badge variant={transaction.type === 'income' ? 'success' : 'destructive'}>
                                      {transaction.type === 'income' ? 'Entrada' : 'Saída'}
                                    </Badge>
                                    <Badge variant="outline">{getReferenceLabel(transaction)}</Badge>
                                    {transaction.reversed_at ? (
                                      <Badge variant="warning">Estornado</Badge>
                                    ) : null}
                                  </div>
                                  <p className="font-medium text-foreground">{transaction.category}</p>
                                  <p className="text-sm text-muted-foreground">
                                    {transaction.description || 'Sem descrição'} • {paymentMethodLabels[transaction.payment_method ?? ''] ?? 'Outro'}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {formatDateTime(transaction.created_at)}
                                    {transaction.reversed_at ? ` • Estornado em ${formatDateTime(transaction.reversed_at)}` : ''}
                                  </p>
                                </div>

                                <div className="flex items-center gap-3 lg:flex-col lg:items-end">
                                  <p className={cn(
                                    'text-lg font-semibold',
                                    getMovementTone(transaction) === 'success' && 'text-success',
                                    getMovementTone(transaction) === 'danger' && 'text-destructive',
                                    getMovementTone(transaction) === 'muted' && 'text-muted-foreground',
                                  )}>
                                    {transaction.type === 'income' ? '+' : '-'}
                                    {formatCurrency(Number(transaction.amount))}
                                  </p>
                                  {canReverseTransaction(transaction) ? (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => handleReverse(transaction)}
                                    >
                                      <RotateCcw className="w-4 h-4 mr-2" />
                                      Estornar
                                    </Button>
                                  ) : null}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </Card>
                </motion.div>
              );
            })
          )}
        </TabsContent>

        <TabsContent value="transactions" className="space-y-4">
          {filteredTransactions.length === 0 ? (
            <Card className="p-8 border-0 shadow-md text-center text-muted-foreground">
              Nenhuma movimentação encontrada.
            </Card>
          ) : (
            filteredTransactions.map((transaction, index) => (
              <motion.div
                key={transaction.id}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.02 }}
              >
                <Card className="p-4 border-0 shadow-sm">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={transaction.type === 'income' ? 'success' : 'destructive'}>
                          {transaction.type === 'income' ? 'Entrada' : 'Saída'}
                        </Badge>
                        <Badge variant="outline">{getReferenceLabel(transaction)}</Badge>
                        {transaction.reversed_at ? <Badge variant="warning">Estornado</Badge> : null}
                      </div>
                      <p className="font-medium text-foreground">{transaction.category}</p>
                      <p className="text-sm text-muted-foreground">
                        {transaction.description || 'Sem descrição'}
                      </p>
                      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                        <span>{formatDateTime(transaction.created_at)}</span>
                        <span>{paymentMethodLabels[transaction.payment_method ?? ''] ?? 'Outro'}</span>
                        <span>
                          {transaction.cash_session_id
                            ? `Caixa ${formatDate(
                                cashSessions.find((session) => session.id === transaction.cash_session_id)?.opened_at,
                              )}`
                            : 'Sem caixa vinculado'}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 lg:flex-col lg:items-end">
                      <p className={cn(
                        'text-lg font-semibold',
                        transaction.reversed_at
                          ? 'text-muted-foreground'
                          : transaction.type === 'income'
                            ? 'text-success'
                            : 'text-destructive',
                      )}>
                        {transaction.type === 'income' ? '+' : '-'}
                        {formatCurrency(Number(transaction.amount))}
                      </p>
                      {canReverseTransaction(transaction) ? (
                        <Button variant="outline" size="sm" onClick={() => handleReverse(transaction)}>
                          <RotateCcw className="w-4 h-4 mr-2" />
                          Estornar
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </Card>
              </motion.div>
            ))
          )}
        </TabsContent>

        <TabsContent value="commissions" className="space-y-4">
          {filteredCommissions.length === 0 ? (
            <Card className="p-8 border-0 shadow-md text-center text-muted-foreground">
              Nenhuma comissão ou vale encontrada.
            </Card>
          ) : (
            filteredCommissions.map((commission, index) => {
              const relatedTransaction = commission.transaction_id
                ? transactionById.get(commission.transaction_id)
                : undefined;

              return (
                <motion.div
                  key={commission.id}
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.02 }}
                >
                  <Card className="p-4 border-0 shadow-sm">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant={commission.type === 'voucher' ? 'warning' : 'outline'}>
                            {commission.type === 'voucher' ? (
                              <>
                                <Ticket className="w-3.5 h-3.5 mr-1" />
                                Vale
                              </>
                            ) : (
                              <>
                                <Receipt className="w-3.5 h-3.5 mr-1" />
                                Comissão
                              </>
                            )}
                          </Badge>
                          <Badge variant={commission.status === 'paid' ? 'success' : 'secondary'}>
                            {commission.status === 'paid' ? 'Pago' : 'Pendente'}
                          </Badge>
                          {relatedTransaction?.reversed_at ? <Badge variant="warning">Movimento estornado</Badge> : null}
                        </div>
                        <p className="font-medium text-foreground">
                          {commission.professional?.nickname ?? commission.professional?.name ?? 'Profissional'}
                        </p>
                        <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                          <span>Base: {formatCurrency(Number(commission.base_value))}</span>
                          <span>Valor: {formatCurrency(Number(commission.commission_value))}</span>
                          <span>Percentual: {Number(commission.commission_rate)}%</span>
                          <span>
                            {commission.status === 'paid'
                              ? `Pago em ${formatDateTime(commission.paid_at)}`
                              : `Criado em ${formatDateTime(commission.created_at)}`}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 lg:flex-col lg:items-end">
                        <p className={cn(
                          'text-lg font-semibold',
                          commission.commission_value >= 0 ? 'text-foreground' : 'text-destructive',
                        )}>
                          {formatCurrency(Number(commission.commission_value))}
                        </p>
                        {relatedTransaction && canReverseTransaction(relatedTransaction) ? (
                          <Button variant="outline" size="sm" onClick={() => handleReverse(relatedTransaction)}>
                            <RotateCcw className="w-4 h-4 mr-2" />
                            Estornar movimento
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  </Card>
                </motion.div>
              );
            })
          )}
        </TabsContent>
      </Tabs>

      {canReverseFinancialEntries ? (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-900">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <div>
            Ao estornar um movimento, o sistema registra a contrapartida no caixa atual e tenta refletir isso em comissões,
            vales e comandas vinculadas, preservando o histórico.
          </div>
        </div>
      ) : null}
    </div>
  );
}
