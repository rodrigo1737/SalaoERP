import { useState } from 'react';
import { motion } from 'framer-motion';
import { 
  DollarSign, 
  TrendingUp, 
  TrendingDown,
  Clock,
  CreditCard,
  Banknote,
  Smartphone,
  X,
  CheckCircle2,
  AlertCircle,
  History,
  Ticket,
  User
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
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
import { CashHistory } from './CashHistory';

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
    transactions, 
    professionals,
    openCashSession, 
    closeCashSession, 
    addTransaction,
    addVoucher
  } = useData();
  const { toast } = useToast();
  
  const [isOpenDialogOpen, setIsOpenDialogOpen] = useState(false);
  const [isCloseDialogOpen, setIsCloseDialogOpen] = useState(false);
  const [isTransactionDialogOpen, setIsTransactionDialogOpen] = useState(false);
  const [isVoucherDialogOpen, setIsVoucherDialogOpen] = useState(false);
  const [transactionType, setTransactionType] = useState<'income' | 'expense'>('income');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  // Voucher form
  const [voucherProfessionalId, setVoucherProfessionalId] = useState('');
  const [voucherAmount, setVoucherAmount] = useState('');
  const [voucherDescription, setVoucherDescription] = useState('');

  // Open cash form
  const [openingBalance, setOpeningBalance] = useState('');

  // Close cash form
  const [closingBalance, setClosingBalance] = useState('');
  const [closingNotes, setClosingNotes] = useState('');

  // Transaction form
  const [transactionCategory, setTransactionCategory] = useState('');
  const [transactionDescription, setTransactionDescription] = useState('');
  const [transactionAmount, setTransactionAmount] = useState('');
  const [transactionPaymentMethod, setTransactionPaymentMethod] = useState('cash');

  // Get session transactions
  const sessionTransactions = currentCashSession
    ? transactions.filter(t => t.cash_session_id === currentCashSession.id)
    : [];

  // Calculate totals
  const totalIncome = sessionTransactions
    .filter(t => t.type === 'income')
    .reduce((sum, t) => sum + Number(t.amount), 0);

  const totalExpense = sessionTransactions
    .filter(t => t.type === 'expense')
    .reduce((sum, t) => sum + Number(t.amount), 0);

  const cashIncome = sessionTransactions
    .filter(t => t.type === 'income' && t.payment_method === 'cash')
    .reduce((sum, t) => sum + Number(t.amount), 0);

  const cashExpense = sessionTransactions
    .filter(t => t.type === 'expense' && t.payment_method === 'cash')
    .reduce((sum, t) => sum + Number(t.amount), 0);

  const expectedCashBalance = currentCashSession 
    ? currentCashSession.opening_balance + cashIncome - cashExpense 
    : 0;

  const handleOpenCash = async () => {
    if (!openingBalance) return;

    setIsSubmitting(true);
    try {
      await openCashSession(parseFloat(openingBalance));
      toast({ title: "Caixa aberto", description: "Bom trabalho hoje!" });
      setIsOpenDialogOpen(false);
      setOpeningBalance('');
    } catch (error) {
      toast({ variant: "destructive", title: "Erro", description: "Não foi possível abrir o caixa" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCloseCash = async () => {
    if (!closingBalance) return;

    setIsSubmitting(true);
    try {
      await closeCashSession(parseFloat(closingBalance), closingNotes);
      toast({ title: "Caixa fechado", description: "Até amanhã!" });
      setIsCloseDialogOpen(false);
      setClosingBalance('');
      setClosingNotes('');
    } catch (error) {
      toast({ variant: "destructive", title: "Erro", description: "Não foi possível fechar o caixa" });
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
        title: transactionType === 'income' ? "Entrada registrada" : "Saída registrada",
        description: `R$ ${parseFloat(transactionAmount).toFixed(2)}`
      });
      setIsTransactionDialogOpen(false);
      setTransactionCategory('');
      setTransactionDescription('');
      setTransactionAmount('');
      setTransactionPaymentMethod('cash');
    } catch (error) {
      toast({ variant: "destructive", title: "Erro", description: "Não foi possível registrar" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddVoucher = async () => {
    if (!voucherProfessionalId || !voucherAmount) return;

    setIsSubmitting(true);
    try {
      await addVoucher(
        voucherProfessionalId,
        parseFloat(voucherAmount),
        voucherDescription || undefined
      );
      toast({ 
        title: "Vale registrado",
        description: `R$ ${parseFloat(voucherAmount).toFixed(2)} debitado das comissões`
      });
      setIsVoucherDialogOpen(false);
      setVoucherProfessionalId('');
      setVoucherAmount('');
      setVoucherDescription('');
    } catch (error) {
      toast({ variant: "destructive", title: "Erro", description: "Não foi possível registrar vale" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const activeProfessionals = professionals.filter(p => p.is_active);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { 
      style: 'currency', 
      currency: 'BRL' 
    }).format(value);
  };

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString('pt-BR', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  // Show history view
  if (showHistory) {
    return <CashHistory onBack={() => setShowHistory(false)} />;
  }

  return (
    <div className="p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl lg:text-4xl font-display font-bold text-foreground">
            Caixa
          </h1>
          <p className="text-muted-foreground mt-1">
            {currentCashSession ? (
              <>
                <span className="text-success font-medium">Aberto</span> desde{' '}
                {new Date(currentCashSession.opened_at).toLocaleTimeString('pt-BR', { 
                  hour: '2-digit', 
                  minute: '2-digit' 
                })}
              </>
            ) : (
              'Caixa fechado'
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowHistory(true)}>
            <History className="w-4 h-4 mr-2" />
            Histórico
          </Button>
          {!currentCashSession ? (
            <Button onClick={() => setIsOpenDialogOpen(true)}>
              <DollarSign className="w-4 h-4 mr-2" />
              Abrir Caixa
            </Button>
          ) : (
            <>
              <Button 
                variant="outline"
                onClick={() => setIsVoucherDialogOpen(true)}
              >
                <Ticket className="w-4 h-4 mr-2" />
                Vale
              </Button>
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
              <Button variant="destructive" onClick={() => setIsCloseDialogOpen(true)}>
                <X className="w-4 h-4 mr-2" />
                Fechar Caixa
              </Button>
            </>
          )}
        </div>
      </div>

      {currentCashSession ? (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="p-5 border-0 shadow-md">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Abertura</p>
                  <p className="text-2xl font-bold text-foreground">
                    {formatCurrency(currentCashSession.opening_balance)}
                  </p>
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
                  <p className="text-2xl font-bold text-success">
                    {formatCurrency(totalIncome)}
                  </p>
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
                  <p className="text-2xl font-bold text-destructive">
                    {formatCurrency(totalExpense)}
                  </p>
                </div>
                <div className="w-12 h-12 rounded-xl bg-destructive-soft flex items-center justify-center">
                  <TrendingDown className="w-6 h-6 text-destructive" />
                </div>
              </div>
            </Card>

            <Card className="p-5 border-0 shadow-md">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Saldo em Caixa</p>
                  <p className="text-2xl font-bold text-primary">
                    {formatCurrency(expectedCashBalance)}
                  </p>
                </div>
                <div className="w-12 h-12 rounded-xl bg-primary-soft flex items-center justify-center">
                  <Banknote className="w-6 h-6 text-primary" />
                </div>
              </div>
            </Card>
          </div>

          {/* Transactions List */}
          <Card className="p-6 border-0 shadow-lg">
            <h2 className="text-lg font-display font-semibold text-foreground mb-4">
              Movimentações de Hoje
            </h2>
            
            {sessionTransactions.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <DollarSign className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>Nenhuma movimentação registrada</p>
              </div>
            ) : (
              <div className="space-y-3">
                {sessionTransactions.map((transaction, index) => {
                  const PaymentIcon = paymentMethods.find(p => p.value === transaction.payment_method)?.icon || Banknote;
                  
                  return (
                    <motion.div
                      key={transaction.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.05 }}
                      className="flex items-center justify-between p-4 rounded-xl bg-secondary/30"
                    >
                      <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                          transaction.type === 'income' ? 'bg-success-soft' : 'bg-destructive-soft'
                        }`}>
                          {transaction.type === 'income' ? (
                            <TrendingUp className="w-5 h-5 text-success" />
                          ) : (
                            <TrendingDown className="w-5 h-5 text-destructive" />
                          )}
                        </div>
                        <div>
                          <p className="font-medium text-foreground">
                            {transaction.description || transaction.category}
                          </p>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <span>{formatTime(transaction.created_at)}</span>
                            <span>•</span>
                            <PaymentIcon className="w-3 h-3" />
                            <span>{paymentMethods.find(p => p.value === transaction.payment_method)?.label}</span>
                          </div>
                        </div>
                      </div>
                      <p className={`text-lg font-bold ${
                        transaction.type === 'income' ? 'text-success' : 'text-destructive'
                      }`}>
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
      ) : (
        <Card className="p-12 border-0 shadow-lg text-center">
          <DollarSign className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
          <h2 className="text-xl font-display font-semibold text-foreground mb-2">
            Caixa Fechado
          </h2>
          <p className="text-muted-foreground mb-6">
            Abra o caixa para começar a registrar movimentações
          </p>
          <Button onClick={() => setIsOpenDialogOpen(true)}>
            <DollarSign className="w-4 h-4 mr-2" />
            Abrir Caixa
          </Button>
        </Card>
      )}

      {/* Open Cash Dialog */}
      <Dialog open={isOpenDialogOpen} onOpenChange={setIsOpenDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">Abrir Caixa</DialogTitle>
            <DialogDescription>
              Informe o saldo inicial do caixa
            </DialogDescription>
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
                onChange={(e) => setOpeningBalance(e.target.value)}
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

      {/* Close Cash Dialog */}
      <Dialog open={isCloseDialogOpen} onOpenChange={setIsCloseDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">Fechar Caixa</DialogTitle>
            <DialogDescription>
              Informe o saldo final contado no caixa
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="p-4 rounded-lg bg-secondary/50 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Saldo esperado (dinheiro):</span>
                <span className="font-bold text-foreground">{formatCurrency(expectedCashBalance)}</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="closingBalance">Saldo Contado (R$)</Label>
              <Input
                id="closingBalance"
                type="number"
                min="0"
                step="0.01"
                placeholder="0,00"
                value={closingBalance}
                onChange={(e) => setClosingBalance(e.target.value)}
              />
            </div>

            {closingBalance && (
              <div className={`p-4 rounded-lg flex items-center gap-3 ${
                parseFloat(closingBalance) === expectedCashBalance
                  ? 'bg-success-soft'
                  : 'bg-warning-soft'
              }`}>
                {parseFloat(closingBalance) === expectedCashBalance ? (
                  <>
                    <CheckCircle2 className="w-5 h-5 text-success" />
                    <span className="text-success font-medium">Caixa batendo!</span>
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-5 h-5 text-warning" />
                    <span className="text-warning font-medium">
                      Diferença: {formatCurrency(parseFloat(closingBalance) - expectedCashBalance)}
                    </span>
                  </>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="closingNotes">Observações</Label>
              <Textarea
                id="closingNotes"
                placeholder="Observações do fechamento..."
                value={closingNotes}
                onChange={(e) => setClosingNotes(e.target.value)}
              />
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setIsCloseDialogOpen(false)}>
                Cancelar
              </Button>
              <Button 
                variant="destructive" 
                onClick={handleCloseCash} 
                disabled={!closingBalance || isSubmitting}
              >
                {isSubmitting ? 'Fechando...' : 'Fechar Caixa'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Transaction Dialog */}
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
                    expenseCategories.map(cat => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
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
                onChange={(e) => setTransactionDescription(e.target.value)}
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
                onChange={(e) => setTransactionAmount(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Forma de Pagamento</Label>
              <div className="grid grid-cols-2 gap-2">
                {paymentMethods.map(method => {
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
              <Button 
                onClick={handleAddTransaction} 
                disabled={!transactionCategory || !transactionAmount || isSubmitting}
              >
                {isSubmitting ? 'Salvando...' : 'Registrar'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Voucher Dialog */}
      <Dialog open={isVoucherDialogOpen} onOpenChange={setIsVoucherDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">
              <div className="flex items-center gap-2">
                <Ticket className="w-5 h-5 text-primary" />
                Emitir Vale
              </div>
            </DialogTitle>
            <DialogDescription>
              O vale será descontado do saldo de comissões do profissional
            </DialogDescription>
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
                  {activeProfessionals.map(prof => (
                    <SelectItem key={prof.id} value={prof.id}>
                      {prof.nickname} - {prof.name}
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
                onChange={(e) => setVoucherAmount(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="voucherDescription">Descrição (opcional)</Label>
              <Input
                id="voucherDescription"
                placeholder="Ex: Adiantamento, despesa..."
                value={voucherDescription}
                onChange={(e) => setVoucherDescription(e.target.value)}
              />
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setIsVoucherDialogOpen(false)}>
                Cancelar
              </Button>
              <Button 
                onClick={handleAddVoucher} 
                disabled={!voucherProfessionalId || !voucherAmount || isSubmitting}
              >
                {isSubmitting ? 'Emitindo...' : 'Emitir Vale'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
