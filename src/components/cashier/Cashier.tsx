import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  AlertCircle,
  Banknote,
  CheckCircle2,
  Clock,
  CreditCard,
  DollarSign,
  Smartphone,
  Ticket,
  TrendingDown,
  TrendingUp,
  User,
  X,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useData, Transaction } from '@/context/DataContext';
import { useAuth } from '@/contexts/AuthContext';

const paymentMethods = [
  { value: 'cash', label: 'Dinheiro', icon: Banknote },
  { value: 'credit_card', label: 'Cartão Crédito', icon: CreditCard },
  { value: 'debit_card', label: 'Cartão Débito', icon: CreditCard },
  { value: 'pix', label: 'PIX', icon: Smartphone },
  { value: 'other', label: 'Transferência', icon: CreditCard },
];

const expenseCategories = [
  'Pagamento de Comissão',
  'Vale',
  'Fornecedor',
  'Aluguel',
  'Energia',
  'Água',
  'Internet',
  'Salário',
  'Material',
  'Manutenção',
  'Outros',
];

export function Cashier() {
  const {
    currentCashSession,
    pendingCashSession,
    transactions,
    professionals,
    cashLoading,
    transactionsLoading,
    openCashSession,
    closeCashSession,
    addTransaction,
    addVoucher,
  } = useData();
  const { userRole, hasPermission } = useAuth();
  const { toast } = useToast();

  const canManageCashFlow = userRole === 'admin' || hasPermission('manage_cash_flow');
  const canPerformAdvancedFinancialOps = userRole === 'admin' || hasPermission('reverse_financial_entries');

  const [isOpenDialogOpen, setIsOpenDialogOpen] = useState(false);
  const [isCloseDialogOpen, setIsCloseDialogOpen] = useState(false);
  const [isTransactionDialogOpen, setIsTransactionDialogOpen] = useState(false);
  const [isVoucherDialogOpen, setIsVoucherDialogOpen] = useState(false);
  const [isPendingDialogOpen, setIsPendingDialogOpen] = useState(false);
  const [transactionType, setTransactionType] = useState<'income' | 'expense'>('income');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [closeTargetSessionId, setCloseTargetSessionId] = useState<string | null>(null);

  const [voucherProfessionalId, setVoucherProfessionalId] = useState('');
  const [voucherAmount, setVoucherAmount] = useState('');
  const [voucherDescription, setVoucherDescription] = useState('');

  const [openingBalance, setOpeningBalance] = useState('');

  const [closingBalance, setClosingBalance] = useState('');
  const [closingNotes, setClosingNotes] = useState('');
  const [closingDivergenceReason, setClosingDivergenceReason] = useState('');

  const [transactionCategory, setTransactionCategory] = useState('');
  const [transactionDescription, setTransactionDescription] = useState('');
  const [transactionAmount, setTransactionAmount] = useState('');
  const [transactionPaymentMethod, setTransactionPaymentMethod] = useState('cash');

  const activeSession = currentCashSession ?? pendingCashSession ?? null;
  const hasPendingSession = Boolean(pendingCashSession);
  const isPendingOnlyState = Boolean(pendingCashSession && !currentCashSession);
  const closeTargetSession = closeTargetSessionId
    ? [currentCashSession, pendingCashSession].find((session) => session?.id === closeTargetSessionId) ?? activeSession
    : activeSession;
  const isClosingPendingSession = Boolean(
    closeTargetSession && pendingCashSession && closeTargetSession.id === pendingCashSession.id,
  );

  useEffect(() => {
    setIsPendingDialogOpen(Boolean(isPendingOnlyState));
  }, [isPendingOnlyState]);

  const sessionTransactions = useMemo(
    () =>
      activeSession
        ? transactions
            .filter((transaction) => transaction.cash_session_id === activeSession.id)
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        : [],
    [activeSession, transactions],
  );

  const totalIncome = sessionTransactions
    .filter((transaction) => transaction.type === 'income' && !transaction.reversed_at)
    .reduce((sum, transaction) => sum + Number(transaction.amount), 0);

  const totalExpense = sessionTransactions
    .filter((transaction) => transaction.type === 'expense' && !transaction.reversed_at)
    .reduce((sum, transaction) => sum + Number(transaction.amount), 0);

  const cashIncome = sessionTransactions
    .filter((transaction) => transaction.type === 'income' && transaction.payment_method === 'cash' && !transaction.reversed_at)
    .reduce((sum, transaction) => sum + Number(transaction.amount), 0);

  const cashExpense = sessionTransactions
    .filter((transaction) => transaction.type === 'expense' && transaction.payment_method === 'cash' && !transaction.reversed_at)
    .reduce((sum, transaction) => sum + Number(transaction.amount), 0);

  const expectedCashBalance = activeSession
    ? Number(activeSession.opening_balance || 0) + cashIncome - cashExpense
    : 0;

  const closeSessionTransactions = useMemo(
    () =>
      closeTargetSession
        ? transactions
            .filter((transaction) => transaction.cash_session_id === closeTargetSession.id)
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        : [],
    [closeTargetSession, transactions],
  );

  const closeSessionCashIncome = closeSessionTransactions
    .filter((transaction) => transaction.type === 'income' && transaction.payment_method === 'cash' && !transaction.reversed_at)
    .reduce((sum, transaction) => sum + Number(transaction.amount), 0);

  const closeSessionCashExpense = closeSessionTransactions
    .filter((transaction) => transaction.type === 'expense' && transaction.payment_method === 'cash' && !transaction.reversed_at)
    .reduce((sum, transaction) => sum + Number(transaction.amount), 0);

  const closeExpectedCashBalance = closeTargetSession
    ? Number(closeTargetSession.opening_balance || 0) + closeSessionCashIncome - closeSessionCashExpense
    : 0;

  const countedBalance = closingBalance ? parseFloat(closingBalance) : null;
  const balanceDifference = countedBalance !== null ? countedBalance - closeExpectedCashBalance : null;
  const requiresDivergenceReason = balanceDifference !== null && Math.abs(balanceDifference) > 0.009;

  const activeProfessionals = professionals.filter((professional) => professional.is_active);

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);

  const formatTime = (dateString: string) =>
    new Date(dateString).toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    });

  const formatDateTime = (dateString: string) =>
    new Date(dateString).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  const resetCloseDialog = () => {
    setClosingBalance('');
    setClosingNotes('');
    setClosingDivergenceReason('');
    setCloseTargetSessionId(null);
  };

  const openCloseDialog = (sessionId?: string | null) => {
    setCloseTargetSessionId(sessionId ?? activeSession?.id ?? null);
    setIsCloseDialogOpen(true);
  };

  const handleOpenCash = async () => {
    if (!openingBalance) return;

    if (pendingCashSession) {
      setIsOpenDialogOpen(false);
      setIsPendingDialogOpen(true);
      return;
    }

    setIsSubmitting(true);
    try {
      const session = await openCashSession(parseFloat(openingBalance));
      if (!session) return;
      toast({ title: 'Caixa aberto', description: 'Movimento iniciado com sucesso.' });
      setIsOpenDialogOpen(false);
      setOpeningBalance('');
    } catch (error) {
      toast({ variant: 'destructive', title: 'Erro', description: 'Não foi possível abrir o caixa.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCloseCash = async () => {
    if (!closingBalance || !closeTargetSession) return;

    if (isClosingPendingSession && !canPerformAdvancedFinancialOps) {
      toast({
        variant: 'destructive',
        title: 'Sem permissão',
        description: 'Somente administrativo ou financeiro pode encerrar caixas pendentes.',
      });
      return;
    }

    if (requiresDivergenceReason && !closingDivergenceReason.trim()) {
      toast({
        variant: 'destructive',
        title: 'Justificativa obrigatória',
        description: 'Informe o motivo da divergência para concluir o fechamento.',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      await closeCashSession(parseFloat(closingBalance), closingNotes || undefined, {
        sessionId: closeTargetSession?.id,
        divergenceReason: requiresDivergenceReason ? closingDivergenceReason.trim() : undefined,
      });
      toast({
        title: isClosingPendingSession ? 'Pendência regularizada' : 'Caixa fechado',
        description: isClosingPendingSession ? 'O caixa antigo foi encerrado com sucesso.' : 'Até amanhã!',
      });
      setIsCloseDialogOpen(false);
      setIsPendingDialogOpen(false);
      resetCloseDialog();
    } catch (error) {
      toast({ variant: 'destructive', title: 'Erro', description: 'Não foi possível fechar o caixa.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddTransaction = async () => {
    if (!transactionCategory || !transactionAmount) return;

    setIsSubmitting(true);
    try {
      await addTransaction({
        type: transactionType,
        category: transactionCategory,
        description: transactionDescription,
        amount: parseFloat(transactionAmount),
        payment_method: transactionPaymentMethod as Transaction['payment_method'],
      });
      toast({
        title: transactionType === 'income' ? 'Entrada registrada' : 'Saída registrada',
        description: `R$ ${parseFloat(transactionAmount).toFixed(2)}`,
      });
      setIsTransactionDialogOpen(false);
      setTransactionCategory('');
      setTransactionDescription('');
      setTransactionAmount('');
      setTransactionPaymentMethod('cash');
    } catch (error) {
      toast({ variant: 'destructive', title: 'Erro', description: 'Não foi possível registrar o movimento.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddVoucher = async () => {
    if (!voucherProfessionalId || !voucherAmount) return;

    setIsSubmitting(true);
    try {
      await addVoucher(voucherProfessionalId, parseFloat(voucherAmount), voucherDescription || undefined);
      toast({
        title: 'Vale registrado',
        description: `R$ ${parseFloat(voucherAmount).toFixed(2)} debitado das comissões.`,
      });
      setIsVoucherDialogOpen(false);
      setVoucherProfessionalId('');
      setVoucherAmount('');
      setVoucherDescription('');
    } catch (error) {
      toast({ variant: 'destructive', title: 'Erro', description: 'Não foi possível registrar o vale.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const statusCopy = currentCashSession
    ? {
        title: 'Caixa aberto',
        tone: 'text-success',
        description: `Aberto em ${formatDateTime(currentCashSession.opened_at)}`,
      }
    : pendingCashSession
      ? {
          title: 'Caixa pendente',
          tone: 'text-warning',
          description: `Aberto em ${formatDateTime(pendingCashSession.opened_at)} e aguardando encerramento`,
        }
      : cashLoading
        ? {
            title: 'Carregando caixa',
            tone: 'text-muted-foreground',
            description: 'Sincronizando com o servidor...',
          }
        : {
            title: 'Caixa fechado',
            tone: 'text-muted-foreground',
            description: 'Sem caixa aberto no momento',
          };

  if (!canManageCashFlow && !canPerformAdvancedFinancialOps) {
    return (
      <div className="p-6 lg:p-8 space-y-6">
        <div>
          <h1 className="text-3xl lg:text-4xl font-display font-bold text-foreground">Caixa</h1>
          <p className="text-muted-foreground mt-1">Este usuário não possui permissão para operar o caixa.</p>
        </div>

        <Card className="p-8 border-0 shadow-lg">
          <div className="space-y-2">
            <p className="text-lg font-semibold text-foreground">Acesso restrito</p>
            <p className="text-muted-foreground">
              Libere <strong>Operar Caixa do Dia</strong> para rotina diária ou <strong>Estornos e Ajustes Financeiros</strong> para regularizações avançadas.
            </p>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl lg:text-4xl font-display font-bold text-foreground">Caixa</h1>
          <p className={`mt-1 ${statusCopy.tone}`}>
            <span className="font-medium">{statusCopy.title}</span>
            {statusCopy.description ? ` • ${statusCopy.description}` : ''}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {!activeSession ? (
            cashLoading ? null : (
              <Button onClick={() => setIsOpenDialogOpen(true)}>
                <DollarSign className="w-4 h-4 mr-2" />
                Abrir Caixa
              </Button>
            )
          ) : isPendingOnlyState ? (
            canPerformAdvancedFinancialOps ? (
              <Button variant="destructive" onClick={() => openCloseDialog(pendingCashSession?.id)}>
                <AlertCircle className="w-4 h-4 mr-2" />
                Encerrar Pendência
              </Button>
            ) : null
          ) : (
            <>
              {canPerformAdvancedFinancialOps ? (
                <Button variant="outline" onClick={() => setIsVoucherDialogOpen(true)}>
                  <Ticket className="w-4 h-4 mr-2" />
                  Vale
                </Button>
              ) : null}
              {canManageCashFlow || canPerformAdvancedFinancialOps ? (
                <>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setTransactionType('expense');
                      setIsTransactionDialogOpen(true);
                    }}
                  >
                    <TrendingDown className="w-4 h-4 mr-2" />
                    Saída
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setTransactionType('income');
                      setIsTransactionDialogOpen(true);
                    }}
                  >
                    <TrendingUp className="w-4 h-4 mr-2" />
                    Entrada
                  </Button>
                </>
              ) : null}
                  <Button variant="destructive" onClick={() => openCloseDialog(activeSession?.id)}>
                    <X className="w-4 h-4 mr-2" />
                    Fechar Caixa
                  </Button>
            </>
          )}
        </div>
      </div>

      {hasPendingSession ? (
        <Card className="p-6 border border-warning/40 bg-warning-soft/40 shadow-md">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-warning" />
                <h2 className="text-lg font-display font-semibold text-foreground">Caixa pendente de data anterior</h2>
              </div>
              <p className="text-sm text-muted-foreground">
                O sistema encontrou um caixa antigo em aberto. Uma nova abertura fica bloqueada até a regularização desse fechamento.
              </p>
            </div>
            {canPerformAdvancedFinancialOps ? (
              <Button variant="destructive" onClick={() => openCloseDialog(pendingCashSession?.id)}>
                Ir para Encerramento
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground">
                Solicite a um administrador ou financeiro para concluir a regularização.
              </p>
            )}
          </div>
        </Card>
      ) : null}

      {activeSession ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="p-5 border-0 shadow-md">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{isPendingOnlyState ? 'Abertura pendente' : 'Abertura'}</p>
                  <p className="text-2xl font-bold text-foreground">{formatCurrency(activeSession.opening_balance)}</p>
                </div>
                <div className="w-12 h-12 rounded-xl bg-secondary flex items-center justify-center">
                  <Clock className="w-6 h-6 text-muted-foreground" />
                </div>
              </div>
            </Card>

            <Card className="p-5 border-0 shadow-md">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Entradas</p>
                  <p className="text-2xl font-bold text-success">{formatCurrency(totalIncome)}</p>
                </div>
                <div className="w-12 h-12 rounded-xl bg-success-soft flex items-center justify-center">
                  <TrendingUp className="w-6 h-6 text-success" />
                </div>
              </div>
            </Card>

            <Card className="p-5 border-0 shadow-md">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Saídas</p>
                  <p className="text-2xl font-bold text-destructive">{formatCurrency(totalExpense)}</p>
                </div>
                <div className="w-12 h-12 rounded-xl bg-destructive-soft flex items-center justify-center">
                  <TrendingDown className="w-6 h-6 text-destructive" />
                </div>
              </div>
            </Card>

            <Card className="p-5 border-0 shadow-md">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Saldo em Dinheiro</p>
                  <p className="text-2xl font-bold text-primary">{formatCurrency(expectedCashBalance)}</p>
                </div>
                <div className="w-12 h-12 rounded-xl bg-primary-soft flex items-center justify-center">
                  <Banknote className="w-6 h-6 text-primary" />
                </div>
              </div>
            </Card>
          </div>

          <Card className="p-6 border-0 shadow-lg">
              <h2 className="text-lg font-display font-semibold text-foreground mb-4">
                {isPendingOnlyState ? 'Movimentações do Caixa Pendente' : 'Movimentações do Dia'}
              </h2>

            {sessionTransactions.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                {transactionsLoading ? (
                  <>
                    <Clock className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>Carregando movimentações...</p>
                  </>
                ) : (
                  <>
                    <DollarSign className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>Nenhuma movimentação registrada</p>
                  </>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {sessionTransactions.map((transaction, index) => {
                  const PaymentIcon = paymentMethods.find((method) => method.value === transaction.payment_method)?.icon || Banknote;

                  return (
                    <motion.div
                      key={transaction.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.04 }}
                      className="flex items-center justify-between p-4 rounded-xl bg-secondary/30"
                    >
                      <div className="flex items-center gap-4">
                        <div
                          className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                            transaction.type === 'income' ? 'bg-success-soft' : 'bg-destructive-soft'
                          }`}
                        >
                          {transaction.type === 'income' ? (
                            <TrendingUp className="w-5 h-5 text-success" />
                          ) : (
                            <TrendingDown className="w-5 h-5 text-destructive" />
                          )}
                        </div>
                        <div>
                          <p className="font-medium text-foreground">{transaction.description || transaction.category}</p>
                          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                            <span>{formatTime(transaction.created_at)}</span>
                            <span>•</span>
                            <PaymentIcon className="w-3 h-3" />
                            <span>{paymentMethods.find((method) => method.value === transaction.payment_method)?.label}</span>
                            {transaction.reversed_at ? (
                              <>
                                <span>•</span>
                                <span className="text-amber-600 font-medium">Estornado</span>
                              </>
                            ) : null}
                          </div>
                        </div>
                      </div>
                      <p className={`text-lg font-bold ${transaction.type === 'income' ? 'text-success' : 'text-destructive'}`}>
                        {transaction.type === 'income' ? '+' : '-'}
                        {formatCurrency(Number(transaction.amount))}
                      </p>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </Card>
        </>
      ) : cashLoading ? (
        <Card className="p-12 border-0 shadow-lg text-center">
          <Clock className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
          <h2 className="text-xl font-display font-semibold text-foreground mb-2">Carregando caixa...</h2>
          <p className="text-muted-foreground">Sincronizando o estado do caixa com o servidor.</p>
        </Card>
      ) : (
        <Card className="p-12 border-0 shadow-lg text-center">
          <DollarSign className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
          <h2 className="text-xl font-display font-semibold text-foreground mb-2">Caixa Fechado</h2>
          <p className="text-muted-foreground mb-6">Abra o caixa para começar a registrar movimentações.</p>
          <Button onClick={() => setIsOpenDialogOpen(true)}>
            <DollarSign className="w-4 h-4 mr-2" />
            Abrir Caixa
          </Button>
        </Card>
      )}

      <Dialog open={isPendingDialogOpen} onOpenChange={setIsPendingDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">Caixa pendente encontrado</DialogTitle>
            <DialogDescription>
              Existe um caixa aberto em data anterior. O sistema não libera nova abertura até regularizar essa pendência.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="rounded-xl border border-warning/40 bg-warning-soft/40 p-4 text-sm text-foreground">
              {pendingCashSession ? (
                <>
                  Caixa iniciado em <strong>{formatDateTime(pendingCashSession.opened_at)}</strong>.
                </>
              ) : null}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsPendingDialogOpen(false)}>
                Cancelar
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  setIsPendingDialogOpen(false);
                  if (canPerformAdvancedFinancialOps) {
                    openCloseDialog(pendingCashSession?.id);
                  } else {
                    toast({
                      variant: 'destructive',
                      title: 'Regularização restrita',
                      description: 'Somente administrativo ou financeiro pode encerrar caixas pendentes.',
                    });
                  }
                }}
              >
                Ir para Encerramento
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isOpenDialogOpen} onOpenChange={setIsOpenDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">Abrir Caixa</DialogTitle>
            <DialogDescription>Informe o saldo inicial do caixa.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="openingBalance">Saldo Inicial (R$)</Label>
              <Input
                id="openingBalance"
                type="number"
                min="0"
                step="0.01"
                placeholder="0,00"
                value={openingBalance}
                onChange={(event) => setOpeningBalance(event.target.value)}
              />
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setIsOpenDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleOpenCash} disabled={!openingBalance || isSubmitting}>
                {isSubmitting ? 'Abrindo...' : 'Abrir Caixa'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isCloseDialogOpen}
        onOpenChange={(open) => {
          setIsCloseDialogOpen(open);
          if (!open) resetCloseDialog();
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">
              {isClosingPendingSession ? 'Encerrar Caixa Pendente' : 'Fechar Caixa'}
            </DialogTitle>
            <DialogDescription>
              Informe primeiro o saldo físico contado. O saldo esperado será exibido em seguida para conferência.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="closingBalance">Saldo Contado (R$)</Label>
              <Input
                id="closingBalance"
                type="number"
                min="0"
                step="0.01"
                placeholder="0,00"
                value={closingBalance}
                onChange={(event) => setClosingBalance(event.target.value)}
              />
            </div>

            {countedBalance !== null ? (
              <div className={`p-4 rounded-lg flex items-center gap-3 ${requiresDivergenceReason ? 'bg-warning-soft' : 'bg-success-soft'}`}>
                {requiresDivergenceReason ? (
                  <>
                    <AlertCircle className="w-5 h-5 text-warning" />
                    <div className="space-y-1">
                      <span className="block text-warning font-medium">
                        Divergência encontrada: {formatCurrency(balanceDifference ?? 0)}
                      </span>
                      <span className="block text-sm text-muted-foreground">
                        Saldo esperado: {formatCurrency(closeExpectedCashBalance)}
                      </span>
                    </div>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-5 h-5 text-success" />
                    <div className="space-y-1">
                      <span className="block text-success font-medium">Caixa conferido sem divergência.</span>
                      <span className="block text-sm text-muted-foreground">
                        Saldo esperado: {formatCurrency(closeExpectedCashBalance)}
                      </span>
                    </div>
                  </>
                )}
              </div>
            ) : null}

            {requiresDivergenceReason ? (
              <div className="space-y-2">
                <Label htmlFor="closingDivergenceReason">Justificativa da Divergência</Label>
                <Textarea
                  id="closingDivergenceReason"
                  placeholder="Descreva o motivo da diferença encontrada no fechamento..."
                  value={closingDivergenceReason}
                  onChange={(event) => setClosingDivergenceReason(event.target.value)}
                />
              </div>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="closingNotes">Observações</Label>
              <Textarea
                id="closingNotes"
                placeholder="Observações do fechamento..."
                value={closingNotes}
                onChange={(event) => setClosingNotes(event.target.value)}
              />
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setIsCloseDialogOpen(false)}>
                Cancelar
              </Button>
              <Button
                variant="destructive"
                onClick={handleCloseCash}
                disabled={!closingBalance || isSubmitting || (requiresDivergenceReason && !closingDivergenceReason.trim())}
              >
                {isSubmitting ? 'Fechando...' : 'Fechar Caixa'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isTransactionDialogOpen} onOpenChange={setIsTransactionDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">
              {transactionType === 'income' ? 'Nova Entrada' : 'Nova Saída'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Categoria</Label>
              <Select value={transactionCategory} onValueChange={setTransactionCategory}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a categoria" />
                </SelectTrigger>
                <SelectContent>
                  {transactionType === 'income' ? (
                    <>
                      <SelectItem value="service">Serviço</SelectItem>
                      <SelectItem value="product">Produto</SelectItem>
                      <SelectItem value="other">Outros</SelectItem>
                    </>
                  ) : (
                    expenseCategories.map((category) => (
                      <SelectItem key={category} value={category}>
                        {category}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Descrição</Label>
              <Input
                id="description"
                placeholder="Descrição da movimentação"
                value={transactionDescription}
                onChange={(event) => setTransactionDescription(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="amount">Valor (R$)</Label>
              <Input
                id="amount"
                type="number"
                min="0"
                step="0.01"
                placeholder="0,00"
                value={transactionAmount}
                onChange={(event) => setTransactionAmount(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Forma de Pagamento</Label>
              <div className="grid grid-cols-2 gap-2">
                {paymentMethods.map((method) => {
                  const Icon = method.icon;
                  return (
                    <Button
                      key={method.value}
                      type="button"
                      variant={transactionPaymentMethod === method.value ? 'default' : 'outline'}
                      className="justify-start"
                      onClick={() => setTransactionPaymentMethod(method.value)}
                    >
                      <Icon className="w-4 h-4 mr-2" />
                      {method.label}
                    </Button>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setIsTransactionDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleAddTransaction} disabled={!transactionCategory || !transactionAmount || isSubmitting}>
                {isSubmitting ? 'Salvando...' : 'Registrar'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isVoucherDialogOpen} onOpenChange={setIsVoucherDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">
              <div className="flex items-center gap-2">
                <Ticket className="w-5 h-5 text-primary" />
                Emitir Vale
              </div>
            </DialogTitle>
            <DialogDescription>O vale será descontado do saldo de comissões do profissional.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Profissional</Label>
              <Select value={voucherProfessionalId} onValueChange={setVoucherProfessionalId}>
                <SelectTrigger>
                  <User className="w-4 h-4 mr-2" />
                  <SelectValue placeholder="Selecione o profissional" />
                </SelectTrigger>
                <SelectContent>
                  {activeProfessionals.map((professional) => (
                    <SelectItem key={professional.id} value={professional.id}>
                      {professional.nickname} - {professional.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="voucherAmount">Valor do Vale (R$)</Label>
              <Input
                id="voucherAmount"
                type="number"
                min="0"
                step="0.01"
                placeholder="0,00"
                value={voucherAmount}
                onChange={(event) => setVoucherAmount(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="voucherDescription">Descrição (opcional)</Label>
              <Input
                id="voucherDescription"
                placeholder="Ex: adiantamento, despesa..."
                value={voucherDescription}
                onChange={(event) => setVoucherDescription(event.target.value)}
              />
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setIsVoucherDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleAddVoucher} disabled={!voucherProfessionalId || !voucherAmount || isSubmitting}>
                {isSubmitting ? 'Emitindo...' : 'Emitir Vale'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
