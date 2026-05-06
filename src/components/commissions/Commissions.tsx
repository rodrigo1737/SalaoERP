import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { 
  DollarSign, 
  Check,
  Clock,
  User,
  Filter,
  Ticket,
  Banknote,
  CreditCard,
  Building2,
  RefreshCw,
  CalendarIcon
} from 'lucide-react';
import { startOfDay, endOfDay, startOfMonth, isWithinInterval, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useData } from '@/context/DataContext';
import { useAuth } from '@/contexts/AuthContext';

type PaymentMethod = 'cash' | 'pix' | 'transfer';

interface PaymentDialogState {
  isOpen: boolean;
  type: 'single' | 'all';
  commissionId?: string;
  professionalId?: string;
  professionalName?: string;
  amount?: number;
  count?: number;
}

export function Commissions() {
  const { professionals, commissions, payCommission, payAllCommissions, refreshData } = useData();
  const { userRole, currentProfessional } = useAuth();
  const { toast } = useToast();
  const [professionalFilter, setProfessionalFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [startDate, setStartDate] = useState<Date | undefined>(startOfMonth(new Date()));
  const [endDate, setEndDate] = useState<Date | undefined>(endOfDay(new Date()));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<PaymentMethod>('pix');
  const [paymentDialog, setPaymentDialog] = useState<PaymentDialogState>({
    isOpen: false,
    type: 'single',
  });

  // Date range for filtering
  const dateRange = useMemo(() => {
    if (!startDate && !endDate) return null;
    return {
      start: startDate ? startOfDay(startDate) : new Date(0),
      end: endDate ? endOfDay(endDate) : endOfDay(new Date()),
    };
  }, [startDate, endDate]);

  // Refresh data when window gains focus (catches updates from other users)
  useEffect(() => {
    const handleFocus = () => {
      refreshData();
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [refreshData]);

  const handleManualRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await refreshData();
    setIsRefreshing(false);
  }, [refreshData]);

  const isAdmin = userRole === 'admin';

  // Filter commissions - professionals only see their own
  const visibleCommissions = isAdmin
    ? commissions
    : currentProfessional
      ? commissions.filter(c => c.professional_id === currentProfessional.id)
      : [];

  // Apply period filter
  const periodFilteredCommissions = useMemo(() => {
    if (!dateRange) return visibleCommissions;
    return visibleCommissions.filter(c => {
      const commissionDate = new Date(c.created_at);
      return isWithinInterval(commissionDate, { start: dateRange.start, end: dateRange.end });
    });
  }, [visibleCommissions, dateRange]);

  const filteredCommissions = periodFilteredCommissions.filter(comm => {
    const matchesProfessional = professionalFilter === 'all' || comm.professional_id === professionalFilter;
    const matchesStatus = statusFilter === 'all' || comm.status === statusFilter;
    return matchesProfessional && matchesStatus;
  });

  // Filter professionals for display - professionals only see themselves
  const visibleProfessionals = isAdmin
    ? professionals
    : currentProfessional
      ? professionals.filter(p => p.id === currentProfessional.id)
      : [];

  // Group by professional using period-filtered commissions
  const commissionsByProfessional = visibleProfessionals.map(prof => {
    const profCommissions = periodFilteredCommissions.filter(c => c.professional_id === prof.id);
    const pending = profCommissions.filter(c => c.status === 'pending');
    const totalPending = pending.reduce((sum, c) => sum + Number(c.commission_value), 0);
    const totalPaid = profCommissions
      .filter(c => c.status === 'paid' && c.type !== 'voucher')
      .reduce((sum, c) => sum + Number(c.commission_value), 0);
    const totalVouchers = profCommissions
      .filter(c => c.type === 'voucher')
      .reduce((sum, c) => sum + Math.abs(Number(c.commission_value)), 0);

    return {
      professional: prof,
      pendingCount: pending.length,
      totalPending,
      totalPaid,
      totalVouchers,
      netBalance: totalPaid - totalVouchers,
      total: totalPending + totalPaid - totalVouchers,
    };
  }).filter(p => p.pendingCount > 0 || p.totalPaid > 0 || p.totalVouchers > 0);

  const openPaySingleDialog = (commissionId: string) => {
    const commission = commissions.find(c => c.id === commissionId);
    if (!commission) return;
    
    const professional = professionals.find(p => p.id === commission.professional_id);
    setPaymentDialog({
      isOpen: true,
      type: 'single',
      commissionId,
      professionalName: professional?.nickname || 'Profissional',
      amount: Number(commission.commission_value),
    });
    setSelectedPaymentMethod('pix');
  };

  const openPayAllDialog = (professionalId: string) => {
    const profCommissions = commissions.filter(
      c => c.professional_id === professionalId && c.status === 'pending' && c.type !== 'voucher'
    );
    const totalAmount = profCommissions.reduce((sum, c) => sum + Number(c.commission_value), 0);
    const professional = professionals.find(p => p.id === professionalId);
    
    setPaymentDialog({
      isOpen: true,
      type: 'all',
      professionalId,
      professionalName: professional?.nickname || 'Profissional',
      amount: totalAmount,
      count: profCommissions.length,
    });
    setSelectedPaymentMethod('pix');
  };

  const handleConfirmPayment = async () => {
    setIsSubmitting(true);
    try {
      if (paymentDialog.type === 'single' && paymentDialog.commissionId) {
        await payCommission(paymentDialog.commissionId, selectedPaymentMethod);
        toast({ title: "Comissão paga", description: "Pagamento registrado no fluxo de caixa" });
      } else if (paymentDialog.type === 'all' && paymentDialog.professionalId) {
        await payAllCommissions(paymentDialog.professionalId, selectedPaymentMethod);
        toast({ title: "Comissões pagas", description: `${paymentDialog.count} comissões registradas no fluxo de caixa` });
      }
      setPaymentDialog({ isOpen: false, type: 'single' });
    } catch (error) {
      toast({ variant: "destructive", title: "Erro", description: "Não foi possível processar o pagamento" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { 
      style: 'currency', 
      currency: 'BRL' 
    }).format(value);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
    });
  };

  const totalPendingAll = periodFilteredCommissions
    .filter(c => c.status === 'pending')
    .reduce((sum, c) => sum + Number(c.commission_value), 0);

  return (
    <div className="p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl lg:text-4xl font-display font-bold text-foreground">
            Comissões
          </h1>
          <p className="text-muted-foreground mt-1">
            {formatCurrency(totalPendingAll)} pendente
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleManualRefresh}
          disabled={isRefreshing}
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
          Atualizar
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {commissionsByProfessional.map((item, index) => (
          <motion.div
            key={item.professional.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
          >
            <Card className="p-5 border-0 shadow-md">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-primary-glow flex items-center justify-center">
                    <span className="text-lg font-bold text-primary-foreground">
                      {item.professional.nickname.charAt(0)}
                    </span>
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground">{item.professional.nickname}</h3>
                    <p className="text-sm text-muted-foreground">{item.professional.name}</p>
                  </div>
                </div>
              </div>

              <div className="space-y-2 mb-4">
                <div className="flex items-center justify-between p-2 rounded-lg bg-warning-soft">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-warning shrink-0" />
                    <span className="text-xs text-muted-foreground">Pendente</span>
                  </div>
                  <p className="text-sm font-bold text-warning">
                    {formatCurrency(item.totalPending)}
                  </p>
                </div>
                <div className="flex items-center justify-between p-2 rounded-lg bg-success-soft">
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-success shrink-0" />
                    <span className="text-xs text-muted-foreground">Pago</span>
                  </div>
                  <p className="text-sm font-bold text-success">
                    {formatCurrency(item.totalPaid)}
                  </p>
                </div>
                <div className="flex items-center justify-between p-2 rounded-lg bg-destructive-soft">
                  <div className="flex items-center gap-2">
                    <Ticket className="w-4 h-4 text-destructive shrink-0" />
                    <span className="text-xs text-muted-foreground">Vales</span>
                  </div>
                  <p className="text-sm font-bold text-destructive">
                    -{formatCurrency(item.totalVouchers)}
                  </p>
                </div>
                <div className="flex items-center justify-between p-2 rounded-lg bg-primary/10 border border-primary/20">
                  <div className="flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-primary shrink-0" />
                    <span className="text-xs font-medium text-foreground">Total</span>
                  </div>
                  <p className="text-sm font-bold text-primary">
                    {formatCurrency(item.total)}
                  </p>
                </div>
              </div>

              {isAdmin && item.pendingCount > 0 && (
                <Button 
                  className="w-full" 
                  onClick={() => openPayAllDialog(item.professional.id)}
                  disabled={isSubmitting}
                >
                  <DollarSign className="w-4 h-4 mr-2" />
                  Pagar Todas ({item.pendingCount})
                </Button>
              )}
            </Card>
          </motion.div>
        ))}
      </div>

      {commissionsByProfessional.length === 0 && (
        <Card className="p-12 border-0 shadow-lg text-center">
          <DollarSign className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
          <h2 className="text-xl font-display font-semibold text-foreground mb-2">
            Nenhuma Comissão
          </h2>
          <p className="text-muted-foreground">
            As comissões serão geradas automaticamente ao finalizar atendimentos
          </p>
        </Card>
      )}

      {/* Filters */}
      {visibleCommissions.length > 0 && (
        <>
          <div className="flex flex-col sm:flex-row flex-wrap gap-4">
            {/* Date From Filter */}
            <div className="flex items-center gap-2">
              <Label className="text-sm text-muted-foreground whitespace-nowrap">De:</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-[140px] justify-start text-left font-normal",
                      !startDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {startDate ? format(startDate, "dd/MM/yyyy", { locale: ptBR }) : "Selecione"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={startDate}
                    onSelect={setStartDate}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                    locale={ptBR}
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Date To Filter */}
            <div className="flex items-center gap-2">
              <Label className="text-sm text-muted-foreground whitespace-nowrap">Até:</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-[140px] justify-start text-left font-normal",
                      !endDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {endDate ? format(endDate, "dd/MM/yyyy", { locale: ptBR }) : "Selecione"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={endDate}
                    onSelect={setEndDate}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                    locale={ptBR}
                  />
                </PopoverContent>
              </Popover>
            </div>

            {isAdmin && (
              <Select value={professionalFilter} onValueChange={setProfessionalFilter}>
                <SelectTrigger className="w-full sm:w-[200px]">
                  <User className="w-4 h-4 mr-2" />
                  <SelectValue placeholder="Profissional" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {visibleProfessionals.map(prof => (
                    <SelectItem key={prof.id} value={prof.id}>
                      {prof.nickname}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-[200px]">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="pending">Pendente</SelectItem>
                <SelectItem value="paid">Pago</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Commission List */}
          <Card className="p-6 border-0 shadow-lg">
            <h2 className="text-lg font-display font-semibold text-foreground mb-4">
              Histórico de Comissões
            </h2>
            
            <div className="space-y-3">
              {filteredCommissions.map((commission, index) => (
                <motion.div
                  key={commission.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.03 }}
                  className="flex items-center justify-between p-4 rounded-xl bg-secondary/30"
                >
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                      commission.type === 'voucher' 
                        ? 'bg-destructive-soft' 
                        : commission.status === 'pending' 
                          ? 'bg-warning-soft' 
                          : 'bg-success-soft'
                    }`}>
                      {commission.type === 'voucher' ? (
                        <Ticket className="w-5 h-5 text-destructive" />
                      ) : commission.status === 'pending' ? (
                        <Clock className="w-5 h-5 text-warning" />
                      ) : (
                        <Check className="w-5 h-5 text-success" />
                      )}
                    </div>
                    <div>
                      <p className="font-medium text-foreground">
                        {commission.professional?.nickname}
                      </p>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span>{formatDate(commission.created_at)}</span>
                        <span>•</span>
                        <span>
                          {commission.type === 'voucher' 
                            ? 'Vale' 
                            : commission.type === 'service' 
                              ? 'Serviço' 
                              : 'Produto'}
                        </span>
                        {commission.type !== 'voucher' && (
                          <>
                            <span>•</span>
                            <span>{commission.commission_rate}%</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className={`text-lg font-bold ${
                        commission.type === 'voucher' ? 'text-destructive' : 'text-foreground'
                      }`}>
                        {commission.type === 'voucher' ? '-' : ''}
                        {formatCurrency(Math.abs(Number(commission.commission_value)))}
                      </p>
                      {commission.type !== 'voucher' && (
                        <p className="text-xs text-muted-foreground">
                          de {formatCurrency(Number(commission.base_value))}
                        </p>
                      )}
                    </div>
                    
                    {commission.type === 'voucher' && (
                      <Badge variant="destructive">Vale</Badge>
                    )}
                    
                    {isAdmin && commission.type !== 'voucher' && commission.status === 'pending' && (
                      <Button 
                        size="sm" 
                        onClick={() => openPaySingleDialog(commission.id)}
                        disabled={isSubmitting}
                      >
                        Pagar
                      </Button>
                    )}
                    
                    {commission.type !== 'voucher' && commission.status === 'paid' && (
                      <Badge variant="success">Pago</Badge>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
          </Card>
        </>
      )}

      {/* Payment Method Dialog */}
      <Dialog open={paymentDialog.isOpen} onOpenChange={(open) => !open && setPaymentDialog({ isOpen: false, type: 'single' })}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Confirmar Pagamento</DialogTitle>
            <DialogDescription>
              {paymentDialog.type === 'single' 
                ? `Pagar comissão de ${paymentDialog.professionalName}`
                : `Pagar ${paymentDialog.count} comissões de ${paymentDialog.professionalName}`
              }
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 space-y-4">
            <div className="p-4 rounded-lg bg-primary/10 border border-primary/20">
              <p className="text-sm text-muted-foreground">Valor total</p>
              <p className="text-2xl font-bold text-primary">{formatCurrency(paymentDialog.amount || 0)}</p>
            </div>

            <div className="space-y-3">
              <Label className="text-sm font-medium">Forma de Pagamento</Label>
              <RadioGroup 
                value={selectedPaymentMethod} 
                onValueChange={(value) => setSelectedPaymentMethod(value as PaymentMethod)}
                className="grid grid-cols-1 gap-3"
              >
                <Label
                  htmlFor="payment-pix"
                  className={`flex items-center gap-3 p-4 rounded-lg border-2 cursor-pointer transition-all ${
                    selectedPaymentMethod === 'pix' 
                      ? 'border-primary bg-primary/5' 
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  <RadioGroupItem value="pix" id="payment-pix" />
                  <CreditCard className="w-5 h-5 text-primary" />
                  <div>
                    <p className="font-medium">PIX</p>
                    <p className="text-xs text-muted-foreground">Transferência instantânea</p>
                  </div>
                </Label>

                <Label
                  htmlFor="payment-transfer"
                  className={`flex items-center gap-3 p-4 rounded-lg border-2 cursor-pointer transition-all ${
                    selectedPaymentMethod === 'transfer' 
                      ? 'border-primary bg-primary/5' 
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  <RadioGroupItem value="transfer" id="payment-transfer" />
                  <Building2 className="w-5 h-5 text-primary" />
                  <div>
                    <p className="font-medium">Transferência Bancária</p>
                    <p className="text-xs text-muted-foreground">TED/DOC</p>
                  </div>
                </Label>

                <Label
                  htmlFor="payment-cash"
                  className={`flex items-center gap-3 p-4 rounded-lg border-2 cursor-pointer transition-all ${
                    selectedPaymentMethod === 'cash' 
                      ? 'border-primary bg-primary/5' 
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  <RadioGroupItem value="cash" id="payment-cash" />
                  <Banknote className="w-5 h-5 text-primary" />
                  <div>
                    <p className="font-medium">Dinheiro</p>
                    <p className="text-xs text-muted-foreground">Pagamento em espécie</p>
                  </div>
                </Label>
              </RadioGroup>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button 
              variant="outline" 
              onClick={() => setPaymentDialog({ isOpen: false, type: 'single' })}
              disabled={isSubmitting}
            >
              Cancelar
            </Button>
            <Button onClick={handleConfirmPayment} disabled={isSubmitting}>
              {isSubmitting ? 'Processando...' : 'Confirmar Pagamento'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
