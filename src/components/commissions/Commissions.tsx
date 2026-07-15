import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import * as XLSX from 'xlsx';
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
  CalendarIcon,
  FileSpreadsheet,
  FileText,
  Eye,
  Wallet,
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
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { useData, type AppointmentServiceRow } from '@/context/DataContext';
import { useAuth } from '@/contexts/AuthContext';
import {
  getSettlementActionLabel,
  getSettlementDialogTitle,
  getSettlementPaidLabel,
  getSettlementPendingLabel,
  normalizeCommissionSettlementKind,
} from '@/lib/commissionSettlement';

type PaymentMethod = 'cash' | 'pix' | 'transfer';

interface PaymentDialogState {
  isOpen: boolean;
  type: 'single' | 'all';
  commissionId?: string;
  professionalId?: string;
  professionalName?: string;
  amount?: number;
  count?: number;
  isTransfer?: boolean;
}

const paymentMethodLabels = {
  cash: 'Dinheiro',
  pix: 'PIX',
  transfer: 'Transferência',
} as const;

function getCommissionPaymentMethod(method?: string | null) {
  if (method === 'cash' || method === 'pix' || method === 'transfer') {
    return method;
  }

  return null;
}

export function Commissions() {
  const {
    professionals,
    commissions,
    appointments,
    services,
    payCommission,
    payAllCommissions,
    refreshData,
    reprocessPendingCommissions,
    fetchAppointmentServices,
  } = useData();
  const { userRole, currentProfessional, hasPermission } = useAuth();
  const { toast } = useToast();
  const [professionalFilter, setProfessionalFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [startDate, setStartDate] = useState<Date | undefined>(startOfMonth(new Date()));
  const [endDate, setEndDate] = useState<Date | undefined>(endOfDay(new Date()));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<PaymentMethod>('pix');
  const [settleAmount, setSettleAmount] = useState<string>('');
  const [paymentDialog, setPaymentDialog] = useState<PaymentDialogState>({
    isOpen: false,
    type: 'single',
  });
  const [viewDialog, setViewDialog] = useState<{ isOpen: boolean; commission?: typeof commissions[number] }>({
    isOpen: false,
  });
  const [viewServiceRows, setViewServiceRows] = useState<AppointmentServiceRow[]>([]);
  const [isLoadingView, setIsLoadingView] = useState(false);

  // Date range for filtering
  const dateRange = useMemo(() => {
    if (!startDate && !endDate) return null;
    return {
      start: startDate ? startOfDay(startDate) : new Date(0),
      end: endDate ? endOfDay(endDate) : endOfDay(new Date()),
    };
  }, [startDate, endDate]);

  // Refresh data when window gains focus (catches updates from other users).
  // Somente comissões: o refresh completo recarregava todas as entidades
  // (transações inteiras inclusive) e travava a tela.
  useEffect(() => {
    const handleFocus = () => {
      refreshData(['commissions']);
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [refreshData]);

  const handleManualRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await refreshData(['professionals', 'commissions']);
    setIsRefreshing(false);
  }, [refreshData]);

  const isAdmin = userRole === 'admin';
  const isProfessionalScopedUser = userRole === 'staff' && !!currentProfessional;
  const canViewAllCommissions = isAdmin || (userRole === 'staff' && !isProfessionalScopedUser && hasPermission('view_commissions'));
  const canSettleCommissions = isAdmin || hasPermission('reverse_financial_entries');
  const canReprocessCommissions = isAdmin || hasPermission('reverse_financial_entries');

  // Filter commissions - professionals only see their own
  const visibleCommissions = useMemo(() => (
    canViewAllCommissions
      ? commissions
      : currentProfessional
        ? commissions.filter(c => c.professional_id === currentProfessional.id)
        : []
  ), [canViewAllCommissions, commissions, currentProfessional]);

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

  const professionalsById = useMemo(
    () => new Map(professionals.map((professional) => [professional.id, professional])),
    [professionals],
  );

  const appointmentsById = useMemo(
    () => new Map(appointments.map((appointment) => [appointment.id, appointment])),
    [appointments],
  );

  const servicesById = useMemo(
    () => new Map(services.map((service) => [service.id, service])),
    [services],
  );

  const getClientName = useCallback((commission: typeof commissions[number]) => {
    const appointment = commission.appointment_id ? appointmentsById.get(commission.appointment_id) : undefined;
    return appointment?.client?.name ?? '-';
  }, [appointmentsById]);

  // Renderização incremental: listas grandes travavam a página.
  const [visibleCount, setVisibleCount] = useState(50);
  useEffect(() => {
    setVisibleCount(50);
  }, [professionalFilter, statusFilter, startDate, endDate]);
  const visibleFilteredCommissions = filteredCommissions.slice(0, visibleCount);

  // Filter professionals for display - professionals only see themselves
  const visibleProfessionals = useMemo(() => (
    canViewAllCommissions
      ? professionals
      : currentProfessional
        ? professionals.filter(p => p.id === currentProfessional.id)
        : []
  ), [canViewAllCommissions, currentProfessional, professionals]);

  // Group by professional using period-filtered commissions.
  // Vale (commission_value negativo) fica 'pending' até ser netado num
  // pagamento em lote — por isso totalPending já sai líquido (comissão menos
  // vale ainda não abatido). totalVouchers é só informativo (todo vale já
  // emitido no período, pago ou não), não é subtraído de novo em "total"
  // para não contar o vale pendente duas vezes.
  const commissionsByProfessional = visibleProfessionals
    .filter(prof => professionalFilter === 'all' || prof.id === professionalFilter)
    .map(prof => {
    const profCommissions = periodFilteredCommissions.filter(c => c.professional_id === prof.id);
    const pending = profCommissions.filter(c => c.status === 'pending');
    const serviceRows = profCommissions.filter(c => c.type !== 'voucher');
    const totalPending = pending.reduce((sum, c) => sum + Number(c.commission_value), 0);
    const totalPaid = profCommissions
      .filter(c => c.status === 'paid' && c.type !== 'voucher')
      .reduce((sum, c) => sum + Number(c.commission_value), 0);
    const totalVouchers = profCommissions
      .filter(c => c.type === 'voucher')
      .reduce((sum, c) => sum + Math.abs(Number(c.commission_value)), 0);
    const grossAttended = serviceRows.reduce((sum, c) => sum + Number(c.base_value ?? 0), 0);
    const totalGenerated = serviceRows.reduce((sum, c) => sum + Number(c.commission_value), 0);
    const professionalGrossValue = grossAttended - totalGenerated;

    return {
      professional: prof,
      pendingCount: pending.length,
      totalPending,
      totalPaid,
      totalVouchers,
      grossAttended,
      professionalGrossValue,
      totalGenerated,
      total: totalPending + totalPaid,
    };
  }).filter(p => p.pendingCount > 0 || p.totalPaid > 0 || p.totalVouchers > 0);

  const openPaySingleDialog = (commissionId: string) => {
    const commission = commissions.find(c => c.id === commissionId);
    if (!commission) return;
    
    const professional = professionals.find(p => p.id === commission.professional_id);
    const settlementKind = normalizeCommissionSettlementKind(
      commission.settlement_kind,
      professional?.settlement_type,
    );
    const remaining = Math.max(0, Math.abs(Number(commission.commission_value)) - Math.abs(Number(commission.settled_amount ?? 0)));
    setPaymentDialog({
      isOpen: true,
      type: 'single',
      commissionId,
      professionalName: professional?.nickname || 'Profissional',
      amount: remaining,
      isTransfer: settlementKind === 'transfer_receivable',
    });
    setSettleAmount(remaining.toFixed(2));
    setSelectedPaymentMethod('pix');
  };

  const openPayAllDialog = (professionalId: string) => {
    const professional = professionals.find(p => p.id === professionalId);
    // Repasse não neta vale no mesmo lote (direção financeira oposta) —
    // mesma regra aplicada em payAllCommissions no DataContext.
    const isTransferProfessional = professional?.settlement_type === 'transfer';
    const profCommissions = commissions.filter(
      c => c.professional_id === professionalId
        && c.status === 'pending'
        && (c.type !== 'voucher' || !isTransferProfessional)
    );
    // Vale (negativo) abate do total, igual ao cálculo do backend.
    const totalAmount = profCommissions.reduce((sum, c) => {
      if (c.type === 'voucher') return sum + Number(c.commission_value);
      return sum + Math.max(0, Math.abs(Number(c.commission_value)) - Math.abs(Number(c.settled_amount ?? 0)));
    }, 0);
    const settlementKind = normalizeCommissionSettlementKind(
      profCommissions.find((c) => c.type !== 'voucher')?.settlement_kind,
      professional?.settlement_type,
    );

    setPaymentDialog({
      isOpen: true,
      type: 'all',
      professionalId,
      professionalName: professional?.nickname || 'Profissional',
      amount: totalAmount,
      count: profCommissions.length,
      isTransfer: settlementKind === 'transfer_receivable',
    });
    setSelectedPaymentMethod('pix');
  };

  const openViewCommission = async (commission: typeof commissions[number]) => {
    setViewDialog({ isOpen: true, commission });
    setViewServiceRows([]);
    if (!commission.appointment_id) return;
    setIsLoadingView(true);
    try {
      const rows = await fetchAppointmentServices(commission.appointment_id);
      setViewServiceRows(rows);
    } finally {
      setIsLoadingView(false);
    }
  };

  const buildExportRows = () => filteredCommissions.map((c) => ({
    Data: formatDate(c.created_at),
    Profissional: c.professional?.nickname ?? c.professional_name_snapshot ?? '-',
    Cliente: getClientName(c),
    'Serviço': c.type === 'voucher' ? 'Vale' : (c.service_name_snapshot ?? '-'),
    'Valor Cobrado': c.type === 'voucher' ? 0 : Number(c.base_value ?? 0),
    'Valor Comissão': Number(c.commission_value),
    Status: c.status === 'paid' ? 'Pago' : 'Pendente',
  }));

  const handleExportExcel = () => {
    const rows = buildExportRows();
    if (rows.length === 0) {
      toast({ title: 'Nada para exportar', description: 'Não há comissões no filtro atual.' });
      return;
    }
    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Comissões');
    XLSX.writeFile(workbook, `comissoes_${format(new Date(), 'yyyy-MM-dd_HHmm')}.xlsx`);
  };

  const handleExportPdf = () => {
    if (filteredCommissions.length === 0) {
      toast({ title: 'Nada para exportar', description: 'Não há comissões no filtro atual.' });
      return;
    }
    window.print();
  };

  const handleReprocessPending = async () => {
    if (!startDate || !endDate) {
      toast({
        variant: 'destructive',
        title: 'Período obrigatório',
        description: 'Informe as datas inicial e final para reprocessar as comissões pendentes.',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await reprocessPendingCommissions({
        dateFrom: startOfDay(startDate).toISOString(),
        dateTo: endOfDay(endDate).toISOString(),
        professionalId: professionalFilter === 'all' ? null : professionalFilter,
      });

      if (!result) return;

      toast({
        title: 'Reprocessamento concluído',
        description: result.skippedCount > 0
          ? `${result.recalculatedCount} comissão(ões) recalculada(s) e ${result.skippedCount} item(ns) pendente(s) para ajuste manual.`
          : `${result.recalculatedCount} comissão(ões) recalculada(s) com sucesso.`,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmPayment = async () => {
    setIsSubmitting(true);
    try {
      if (paymentDialog.type === 'single' && paymentDialog.commissionId) {
        const parsedAmount = parseFloat(settleAmount);
        const full = paymentDialog.amount ?? 0;
        // Valor informado (parcial) ou o saldo cheio; o contexto limita ao saldo.
        const amount = Number.isFinite(parsedAmount) && parsedAmount > 0 ? parsedAmount : full;
        await payCommission(paymentDialog.commissionId, selectedPaymentMethod, amount);
      } else if (paymentDialog.type === 'all' && paymentDialog.professionalId) {
        await payAllCommissions(paymentDialog.professionalId, selectedPaymentMethod);
        toast({
          title: paymentDialog.isTransfer ? "Repasses recebidos" : "Comissões pagas",
          description: `${paymentDialog.count} ${paymentDialog.isTransfer ? 'repasses registrados' : 'comissões registradas'} no fluxo de caixa`,
        });
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

  const getCommissionSettlementKind = (commission: typeof commissions[number]) => (
    normalizeCommissionSettlementKind(
      commission.settlement_kind,
      commission.professional?.settlement_type,
    )
  );

  const getProfessionalTotalLabel = (professionalSettlementType?: string | null) => (
    normalizeCommissionSettlementKind(undefined, professionalSettlementType) === 'transfer_receivable'
      ? 'Total a repassar ao estabelecimento'
      : 'Total a receber'
  );

  return (
    <>
    <div className="p-6 lg:p-8 space-y-6 print:hidden">
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
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleManualRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
          {canReprocessCommissions && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleReprocessPending}
              disabled={isSubmitting}
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${isSubmitting ? 'animate-spin' : ''}`} />
              Reprocessar pendentes
            </Button>
          )}
        </div>
      </div>

      {/* Filters */}
      <Card className="p-4 border-0 shadow-md">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-sm font-medium text-muted-foreground">Filtros</h2>
        </div>
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
      </Card>

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
                {normalizeCommissionSettlementKind(undefined, item.professional.settlement_type) === 'transfer_receivable' && (
                  <Badge variant="outline" className="border-primary/40 text-primary">Repasse</Badge>
                )}
              </div>

              <div className="space-y-2 mb-4">
                {normalizeCommissionSettlementKind(undefined, item.professional.settlement_type) === 'transfer_receivable' ? (
                  <>
                    <div className="flex items-center justify-between p-2 rounded-lg bg-secondary/40">
                      <div className="flex items-center gap-2">
                        <Wallet className="w-4 h-4 text-foreground shrink-0" />
                        <span className="text-xs text-muted-foreground">Bruto atendido</span>
                      </div>
                      <p className="text-sm font-bold text-foreground">
                        {formatCurrency(item.grossAttended)}
                      </p>
                    </div>
                    <div className="flex items-center justify-between p-2 rounded-lg bg-secondary/40">
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4 text-foreground shrink-0" />
                        <span className="text-xs text-muted-foreground">Valor profissional</span>
                      </div>
                      <p className="text-sm font-bold text-foreground">
                        {formatCurrency(item.professionalGrossValue)}
                      </p>
                    </div>
                    <div className="flex items-center justify-between p-2 rounded-lg bg-warning-soft">
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-warning shrink-0" />
                        <span className="text-xs text-muted-foreground">Repasse pendente</span>
                      </div>
                      <p className="text-sm font-bold text-warning">
                        {formatCurrency(item.totalPending)}
                      </p>
                    </div>
                    <div className="flex items-center justify-between p-2 rounded-lg bg-success-soft">
                      <div className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-success shrink-0" />
                        <span className="text-xs text-muted-foreground">Repasse recebido</span>
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
                        <span className="text-xs font-medium text-foreground">
                          Total a repassar ao estabelecimento
                        </span>
                      </div>
                      <p className="text-sm font-bold text-primary">
                        {formatCurrency(item.total)}
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-center justify-between p-2 rounded-lg bg-warning-soft">
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-warning shrink-0" />
                        <span className="text-xs text-muted-foreground">
                          {getSettlementPendingLabel(normalizeCommissionSettlementKind(undefined, item.professional.settlement_type))}
                        </span>
                      </div>
                      <p className="text-sm font-bold text-warning">
                        {formatCurrency(item.totalPending)}
                      </p>
                    </div>
                    <div className="flex items-center justify-between p-2 rounded-lg bg-success-soft">
                      <div className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-success shrink-0" />
                        <span className="text-xs text-muted-foreground">
                          {getSettlementPaidLabel(normalizeCommissionSettlementKind(undefined, item.professional.settlement_type))}
                        </span>
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
                        <span className="text-xs font-medium text-foreground">
                          {getProfessionalTotalLabel(item.professional.settlement_type)}
                        </span>
                      </div>
                      <p className="text-sm font-bold text-primary">
                        {formatCurrency(item.total)}
                      </p>
                    </div>
                  </>
                )}
              </div>

              {canSettleCommissions && item.pendingCount > 0 && item.totalPending > 0.009 && (
                <Button
                  className="w-full"
                  onClick={() => openPayAllDialog(item.professional.id)}
                  disabled={isSubmitting}
                >
                  <DollarSign className="w-4 h-4 mr-2" />
                  {`${getSettlementActionLabel(normalizeCommissionSettlementKind(undefined, item.professional.settlement_type))} Todos (${item.pendingCount})`}
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

      {/* Commission List */}
      {visibleCommissions.length > 0 && (
        <>
          <Card className="p-6 border-0 shadow-lg">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
              <h2 className="text-lg font-display font-semibold text-foreground">
                Histórico de Comissões
              </h2>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={handleExportExcel}>
                  <FileSpreadsheet className="w-4 h-4 mr-2" />
                  Excel
                </Button>
                <Button variant="outline" size="sm" onClick={handleExportPdf}>
                  <FileText className="w-4 h-4 mr-2" />
                  PDF
                </Button>
              </div>
            </div>

            <div className="space-y-3">
              {visibleFilteredCommissions.map((commission, index) => {
                const settlementKind = getCommissionSettlementKind(commission);
                return (
                <motion.div
                  key={commission.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: Math.min(index * 0.03, 0.4) }}
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
                        {commission.type !== 'voucher' && getClientName(commission) !== '-' && (
                          <span className="font-normal text-muted-foreground"> • {getClientName(commission)}</span>
                        )}
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
                        {commission.type !== 'voucher' && (
                          <>
                            <span>•</span>
                            <span>{commission.service_name_snapshot ?? 'Serviço'}</span>
                          </>
                        )}
                      </div>
                      {commission.type !== 'voucher' && commission.status === 'paid' && (
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          {commission.paid_at && <span>Pago em {formatDate(commission.paid_at)}</span>}
                          {getCommissionPaymentMethod(commission.payment_method) && (
                            <>
                              <span>•</span>
                              <span>{paymentMethodLabels[getCommissionPaymentMethod(commission.payment_method)!]}</span>
                            </>
                          )}
                          {commission.transaction_id && (
                            <>
                              <span>•</span>
                              <span>Mov. {commission.transaction_id.slice(0, 8).toUpperCase()}</span>
                              <span>•</span>
                              <span>Lançado no financeiro</span>
                            </>
                          )}
                        </div>
                      )}
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

                    {commission.type !== 'voucher' && (
                      <Badge variant="outline">
                        {settlementKind === 'transfer_receivable' ? 'Repasse' : 'Comissão'}
                      </Badge>
                    )}
                    
                    {canSettleCommissions && commission.type !== 'voucher' && commission.status === 'pending' && (
                      <Button
                        size="sm"
                        onClick={() => openPaySingleDialog(commission.id)}
                        disabled={isSubmitting}
                      >
                        {getSettlementActionLabel(settlementKind)}
                      </Button>
                    )}

                    {commission.type !== 'voucher' && commission.status === 'paid' && (
                      <Badge variant="success">
                        {getSettlementPaidLabel(settlementKind)}
                      </Badge>
                    )}

                    {commission.appointment_id && (
                      <Button
                        size="sm"
                        variant="ghost"
                        title="Ver comanda"
                        onClick={() => openViewCommission(commission)}
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </motion.div>
                );
              })}
            </div>

            {filteredCommissions.length > visibleCount && (
              <div className="mt-4 text-center">
                <Button variant="outline" onClick={() => setVisibleCount((count) => count + 100)}>
                  Mostrar mais ({filteredCommissions.length - visibleCount} restantes)
                </Button>
              </div>
            )}
          </Card>
        </>
      )}

      {/* Payment Method Dialog */}
      <Dialog open={paymentDialog.isOpen} onOpenChange={(open) => !open && setPaymentDialog({ isOpen: false, type: 'single' })}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{getSettlementDialogTitle(paymentDialog.isTransfer ? 'transfer_receivable' : 'commission_payable')}</DialogTitle>
            <DialogDescription>
              {paymentDialog.isTransfer
                ? (paymentDialog.type === 'single'
                    ? `Receber repasse de ${paymentDialog.professionalName}`
                    : `Receber ${paymentDialog.count} repasses de ${paymentDialog.professionalName}`)
                : (paymentDialog.type === 'single'
                    ? `Pagar comissão de ${paymentDialog.professionalName}`
                    : `Pagar ${paymentDialog.count} comissões de ${paymentDialog.professionalName}`)
              }
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 space-y-4">
            <div className="p-4 rounded-lg bg-primary/10 border border-primary/20">
              <p className="text-sm text-muted-foreground">{paymentDialog.type === 'single' ? 'Saldo a liquidar' : 'Valor total'}</p>
              <p className="text-2xl font-bold text-primary">{formatCurrency(paymentDialog.amount || 0)}</p>
            </div>

            {paymentDialog.type === 'single' && (
              <div className="space-y-2">
                <Label className="text-sm font-medium">
                  Valor a {paymentDialog.isTransfer ? 'receber' : 'pagar'} agora
                </Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  max={paymentDialog.amount || undefined}
                  value={settleAmount}
                  onChange={(e) => setSettleAmount(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Informe um valor menor que o saldo para uma liquidação parcial. O restante fica pendente.
                </p>
              </div>
            )}

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
              {isSubmitting ? 'Processando...' : paymentDialog.isTransfer ? 'Confirmar Recebimento' : 'Confirmar Pagamento'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Comanda Dialog (somente leitura) */}
      <Dialog open={viewDialog.isOpen} onOpenChange={(open) => !open && setViewDialog({ isOpen: false })}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Comanda</DialogTitle>
            <DialogDescription>Visualização somente leitura</DialogDescription>
          </DialogHeader>
          {(() => {
            const commission = viewDialog.commission;
            if (!commission) return null;
            const appointment = commission.appointment_id ? appointmentsById.get(commission.appointment_id) : undefined;
            if (!appointment) {
              return (
                <p className="text-sm text-muted-foreground py-4">
                  Não há comanda associada a este lançamento.
                </p>
              );
            }
            return (
              <div className="space-y-4 py-2">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-muted-foreground">Cliente</p>
                    <p className="font-medium">{appointment.client?.name ?? '-'}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Data</p>
                    <p className="font-medium">{new Date(appointment.start_time).toLocaleString('pt-BR')}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Status</p>
                    <p className="font-medium capitalize">{appointment.status.replace('_', ' ')}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Total</p>
                    <p className="font-medium">{formatCurrency(Number(appointment.total_value ?? 0))}</p>
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium mb-2">Serviços</p>
                  {isLoadingView ? (
                    <p className="text-sm text-muted-foreground">Carregando...</p>
                  ) : (
                    <div className="space-y-2">
                      {viewServiceRows.length > 0 ? (
                        viewServiceRows.map((row) => {
                          const service = servicesById.get(row.service_id);
                          const prof = professionalsById.get(row.professional_id);
                          return (
                            <div key={row.id} className="flex items-center justify-between p-2 rounded-lg bg-secondary/30 text-sm">
                              <span>{service?.name ?? 'Serviço'} — {prof?.nickname ?? ''}</span>
                              <span className="font-medium">{formatCurrency(Number(row.value))}</span>
                            </div>
                          );
                        })
                      ) : (
                        <div className="flex items-center justify-between p-2 rounded-lg bg-secondary/30 text-sm">
                          <span>{commission.service_name_snapshot ?? appointment.service?.name ?? 'Serviço'} — {appointment.professional?.nickname ?? ''}</span>
                          <span className="font-medium">{formatCurrency(Number(appointment.total_value ?? commission.base_value ?? 0))}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewDialog({ isOpen: false })}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>

    {/* Relatório imprimível (PDF via impressão do navegador) */}
    <div className="hidden print:block p-8 text-black bg-white">
      <h1 className="text-2xl font-bold mb-1">Relatório de Comissões</h1>
      <p className="text-sm mb-4">
        Período: {startDate ? format(startDate, 'dd/MM/yyyy', { locale: ptBR }) : '-'} a {endDate ? format(endDate, 'dd/MM/yyyy', { locale: ptBR }) : '-'}
        {professionalFilter !== 'all' && ` • Profissional: ${professionalsById.get(professionalFilter)?.nickname ?? ''}`}
        {statusFilter !== 'all' && ` • Status: ${statusFilter === 'paid' ? 'Pago' : 'Pendente'}`}
      </p>
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-black">
            <th className="text-left py-1 pr-2">Data</th>
            <th className="text-left py-1 pr-2">Profissional</th>
            <th className="text-left py-1 pr-2">Cliente</th>
            <th className="text-left py-1 pr-2">Serviço</th>
            <th className="text-right py-1 pr-2">Valor Cobrado</th>
            <th className="text-right py-1 pr-2">Valor Comissão</th>
            <th className="text-left py-1">Status</th>
          </tr>
        </thead>
        <tbody>
          {filteredCommissions.map((c) => (
            <tr key={c.id} className="border-b border-gray-300">
              <td className="py-1 pr-2">{formatDate(c.created_at)}</td>
              <td className="py-1 pr-2">{c.professional?.nickname ?? c.professional_name_snapshot ?? '-'}</td>
              <td className="py-1 pr-2">{getClientName(c)}</td>
              <td className="py-1 pr-2">{c.type === 'voucher' ? 'Vale' : (c.service_name_snapshot ?? '-')}</td>
              <td className="py-1 pr-2 text-right">{c.type === 'voucher' ? '-' : formatCurrency(Number(c.base_value ?? 0))}</td>
              <td className="py-1 pr-2 text-right">{formatCurrency(Number(c.commission_value))}</td>
              <td className="py-1">{c.status === 'paid' ? 'Pago' : 'Pendente'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    </>
  );
}
