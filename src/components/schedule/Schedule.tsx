import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Clock,
  Search,
  UserPlus,
  X,
  CreditCard,
  Wallet,
  QrCode,
  AlertCircle,
  Banknote,
  Globe,
} from 'lucide-react';
import { AppointmentDetailDialog } from './AppointmentDetailDialog';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Combobox } from '@/components/ui/combobox';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useData, Appointment } from '@/context/DataContext';
import { useStock } from '@/context/StockContext';
import { useAuth } from '@/contexts/AuthContext';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';
import { cn } from '@/lib/utils';
import { BillItemsEditor, BillItem } from './BillItemsEditor';

const appointmentStatusLabels: Record<string, string> = {
  pre_scheduled: 'Pré-Agendado',
  scheduled: 'Agendado',
  confirmed: 'Confirmado',
  in_progress: 'Em Atendimento',
  completed: 'Finalizado',
  cancelled: 'Cancelado',
};

const professionalHeaderColors = [
  '#EFF6FF',
  '#F0FDF4',
  '#FAF5FF',
  '#FFFBEB',
  '#FDF2F8',
  '#ECFEFF',
  '#FFF1F2',
  '#EEF2FF',
  '#F0FDFA',
  '#FFF7ED',
];

const getProfessionalColor = (index: number) => {
  return professionalHeaderColors[index % professionalHeaderColors.length];
};

// ITEM 13: slots gerados dinamicamente via hook abaixo, não mais constante global

const formatDate = (date: Date) => {
  return date.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
};

const getTimeFromISO = (isoString: string) => {
  const date = new Date(isoString);
  return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
};

const isSameCalendarDay = (first: Date, second: Date) => {
  return first.getFullYear() === second.getFullYear()
    && first.getMonth() === second.getMonth()
    && first.getDate() === second.getDate();
};

const normalizeText = (value?: string | null) => {
  return (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
};

export function Schedule() {
  const { clients, professionals, services, products, appointments, loading, addClient, addService, addAppointment, updateAppointment, deleteAppointment, refundAppointment, currentCashSession, completeAppointment } = useData();
  const { settings: tenantSettings } = useTenantSettings();

  // ITEM 13: horários configuráveis; fallback para 8–20 se tenant não configurou ainda
  const workStart = tenantSettings?.working_hours_start ?? 8;
  const workEnd   = tenantSettings?.working_hours_end   ?? 20;
  const timeSlots: string[] = [];
  for (let hour = workStart; hour < workEnd; hour++) {
    timeSlots.push(`${String(hour).padStart(2, '0')}:00`);
    timeSlots.push(`${String(hour).padStart(2, '0')}:30`);
  }
  const { registerSale, registerServiceConsumption } = useStock();
  const { userRole, currentProfessional, loading: authLoading, hasPermission } = useAuth();
  const { toast } = useToast();
  const isAdmin = userRole === 'admin';
  const canViewSchedule = isAdmin || hasPermission('view_schedule') || hasPermission('edit_schedule');
  const canEditSchedule = isAdmin || hasPermission('edit_schedule');

  const scheduleProfessionals = professionals.filter(p => p.is_active && p.has_schedule);

  const [currentDate, setCurrentDate] = useState(new Date());
  const [columnCount, setColumnCount] = useState(5);
  const [scheduleSearch, setScheduleSearch] = useState('');
  const [selectedProfessionalIds, setSelectedProfessionalIds] = useState<string[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<{ time: string; professionalId: string } | null>(null);
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
  const [isNewAppointmentOpen, setIsNewAppointmentOpen] = useState(false);
  const [isAppointmentDetailOpen, setIsAppointmentDetailOpen] = useState(false);
  const [isClosingBill, setIsClosingBill] = useState(false);
  const [isAddingClient, setIsAddingClient] = useState(false);
  const [isAddingService, setIsAddingService] = useState(false);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string>('');
  const [billItems, setBillItems] = useState<BillItem[]>([]);

  const [formClient, setFormClient] = useState('');
  const [formService, setFormService] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formTime, setFormTime] = useState('');
  const [newClientName, setNewClientName] = useState('');
  const [newClientPhone, setNewClientPhone] = useState('');
  const [newServiceName, setNewServiceName] = useState('');
  const [newServicePrice, setNewServicePrice] = useState('');
  const [newServiceDuration, setNewServiceDuration] = useState('60');
  const [newServiceCategory, setNewServiceCategory] = useState('Outros');
  const [editValue, setEditValue] = useState('');
  const [editDuration, setEditDuration] = useState('');

  const baseVisibleProfessionals = isAdmin
    ? scheduleProfessionals
    : currentProfessional
      ? scheduleProfessionals.filter(p => p.id === currentProfessional.id)
      : [];
  const filteredVisibleProfessionals = selectedProfessionalIds.length > 0
    ? baseVisibleProfessionals.filter(p => selectedProfessionalIds.includes(p.id))
    : baseVisibleProfessionals;
  const visibleProfessionals = filteredVisibleProfessionals.slice(0, columnCount);
  const allProfessionalsSelected = selectedProfessionalIds.length === 0 || selectedProfessionalIds.length === baseVisibleProfessionals.length;
  const calendarMonthStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
  const calendarStart = new Date(calendarMonthStart);
  calendarStart.setDate(calendarStart.getDate() - calendarStart.getDay());
  const calendarDays = Array.from({ length: 42 }, (_, index) => {
    const day = new Date(calendarStart);
    day.setDate(calendarStart.getDate() + index);
    return day;
  });
  const normalizedScheduleSearch = normalizeText(scheduleSearch.trim());

  useEffect(() => {
    if (selectedAppointment) {
      setEditValue(selectedAppointment.total_value?.toString() || '');
      setEditDuration(selectedAppointment.service?.duration_minutes?.toString() || '');
    }
  }, [selectedAppointment]);

  const navigateDate = (direction: 'prev' | 'next') => {
    const newDate = new Date(currentDate);
    newDate.setDate(newDate.getDate() + (direction === 'next' ? 1 : -1));
    setCurrentDate(newDate);
  };

  const goToToday = () => setCurrentDate(new Date());

  const navigateCalendarMonth = (direction: 'prev' | 'next') => {
    const newDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + (direction === 'next' ? 1 : -1), 1);
    setCurrentDate(newDate);
  };

  const toggleProfessionalFilter = (professionalId: string) => {
    setSelectedProfessionalIds(prev => {
      if (prev.length === 0) {
        return baseVisibleProfessionals.map(professional => professional.id).filter(id => id !== professionalId);
      }

      if (prev.includes(professionalId)) {
        const next = prev.filter(id => id !== professionalId);
        return next.length === 0 ? [] : next;
      }

      return [...prev, professionalId];
    });
  };

  const appointmentMatchesSearch = (appointment: Appointment) => {
    if (!normalizedScheduleSearch) return true;

    const clientName = appointment.client?.name || clients.find(client => client.id === appointment.client_id)?.name;
    const serviceName = appointment.service?.name || services.find(service => service.id === appointment.service_id)?.name;
    const professionalName = professionals.find(professional => professional.id === appointment.professional_id)?.name;
    const professionalNickname = professionals.find(professional => professional.id === appointment.professional_id)?.nickname;

    return [
      clientName,
      serviceName,
      professionalName,
      professionalNickname,
      appointment.notes,
      appointmentStatusLabels[appointment.status],
    ].some(value => normalizeText(value).includes(normalizedScheduleSearch));
  };

  const getAppointmentForSlot = (time: string, professionalId: string): Appointment | undefined => {
    return appointments.find(apt => {
      const aptDate = new Date(apt.start_time);
      const isSameDay = aptDate.toDateString() === currentDate.toDateString();
      const aptTime = getTimeFromISO(apt.start_time);
      return isSameDay && aptTime === time && apt.professional_id === professionalId;
    });
  };

  // Get ALL appointments that occupy a specific time slot (for overlapping display)
  const getAppointmentsForSlot = (time: string, professionalId: string): Appointment[] => {
    const [slotHour, slotMinute] = time.split(':').map(Number);
    const slotMinutes = slotHour * 60 + slotMinute;

    return appointments.filter(apt => {
      const aptDate = new Date(apt.start_time);
      const isSameDay = aptDate.toDateString() === currentDate.toDateString();
      if (!isSameDay || apt.professional_id !== professionalId) return false;

      const startMinutes = aptDate.getHours() * 60 + aptDate.getMinutes();
      const endDate = new Date(apt.end_time);
      const endMinutes = endDate.getHours() * 60 + endDate.getMinutes();

      return slotMinutes >= startMinutes && slotMinutes < endMinutes;
    });
  };

  // Get appointments that START at a specific time (for rendering the card)
  const getAppointmentsStartingAt = (time: string, professionalId: string): Appointment[] => {
    return appointments.filter(apt => {
      const aptDate = new Date(apt.start_time);
      const isSameDay = aptDate.toDateString() === currentDate.toDateString();
      const aptTime = getTimeFromISO(apt.start_time);
      return isSameDay && aptTime === time && apt.professional_id === professionalId && appointmentMatchesSearch(apt);
    });
  };

  const isSlotOccupied = (time: string, professionalId: string): Appointment | undefined => {
    const occupyingAppointments = getAppointmentsForSlot(time, professionalId);
    return occupyingAppointments[0];
  };

  const handleSlotClick = (time: string, professionalId: string) => {
    if (!canEditSchedule) return;
    // Allow creating new appointment on any slot (even if there are existing appointments)
    setSelectedSlot({ time, professionalId });
    setFormClient('');
    setFormService('');
    setFormNotes('');
    setFormTime(time);
    setIsAddingClient(false);
    setIsAddingService(false);
    setIsNewAppointmentOpen(true);
  };

  const canUseQuickService = isAddingService && !!newServiceName.trim();
  const canCreateAppointment = !!formClient && !!formTime && (!!formService || canUseQuickService);

  const resetQuickServiceForm = () => {
    setIsAddingService(false);
    setNewServiceName('');
    setNewServicePrice('');
    setNewServiceDuration('60');
    setNewServiceCategory('Outros');
  };

  const createQuickService = async () => {
    if (!newServiceName.trim()) return null;

    const service = await addService({
      name: newServiceName.trim(),
      category: newServiceCategory || 'Outros',
      duration_minutes: parseInt(newServiceDuration) || 60,
      break_time_minutes: 0,
      allow_online_booking: false,
      description: undefined,
      price_type: 'fixed',
      default_price: parseFloat(newServicePrice) || 0,
      cost_price: 0,
      suggested_return_days: undefined,
      is_active: true,
    });

    if (service) {
      setFormService(service.id);
      resetQuickServiceForm();
    }

    return service;
  };

  const handleQuickAddService = async () => {
    await createQuickService();
  };

  const handleCreateAppointment = async () => {
    if (!canEditSchedule) return;
    if (!selectedSlot || !formClient || !formTime) return;

    const client = clients.find(c => c.id === formClient);
    let service = services.find(s => s.id === formService);
    if (!service && canUseQuickService) {
      service = await createQuickService();
    }
    const professional = professionals.find(p => p.id === selectedSlot.professionalId);

    if (!client || !service || !professional) return;

    const [hour, minute] = formTime.split(':').map(Number);
    const startTime = new Date(currentDate);
    startTime.setHours(hour, minute, 0, 0);

    const endTime = new Date(startTime);
    endTime.setMinutes(endTime.getMinutes() + service.duration_minutes);

    await addAppointment({
      client_id: client.id,
      professional_id: professional.id,
      service_id: service.id,
      start_time: startTime.toISOString(),
      end_time: endTime.toISOString(),
      status: 'scheduled',
      notes: formNotes,
      total_value: service.default_price,
    });

    toast({ title: "Agendamento criado", description: `${client.name} às ${formTime}` });
    setIsNewAppointmentOpen(false);
  };

  const handleUpdateStatus = async (newStatus: Appointment['status']) => {
    if (!canEditSchedule) return;
    if (!selectedAppointment) return;
    await updateAppointment(selectedAppointment.id, { status: newStatus, total_value: parseFloat(editValue) || selectedAppointment.total_value });
    setSelectedAppointment({ ...selectedAppointment, status: newStatus });
  };

  const handleOpenCloseBill = () => {
    // Check if cash session is open
    if (!currentCashSession) {
      toast({
        variant: "destructive",
        title: "Caixa fechado",
        description: "Abra o caixa antes de fechar comandas"
      });
      return;
    }
    setSelectedPaymentMethod('');
    setBillItems([]); // Reset additional items
    setIsClosingBill(true);
  };

  const handleCloseBill = async () => {
    if (!selectedAppointment || !selectedPaymentMethod) return;

    // Double check cash session
    if (!currentCashSession) {
      toast({
        variant: "destructive",
        title: "Caixa fechado",
        description: "Abra o caixa antes de fechar comandas"
      });
      return;
    }

    const baseValue = parseFloat(editValue) || selectedAppointment.total_value || 0;
    const additionalTotal = billItems.reduce((sum, item) => sum + item.total, 0);
    const totalValue = baseValue + additionalTotal;

    // Build notes with additional items
    let notes = selectedAppointment.notes || '';
    if (billItems.length > 0) {
      const itemsDesc = billItems.map(item =>
        `${item.name} (${item.quantity}x R$${item.unitPrice.toFixed(2)})`
      ).join(', ');
      notes = `${notes} [Adicionais: ${itemsDesc}]`.trim();
    }
    if (selectedPaymentMethod === 'pending') {
      notes = `${notes} [PENDENTE: R$${totalValue.toFixed(2)}]`.trim();
    }

    // Update total_value before completing
    await updateAppointment(selectedAppointment.id, {
      total_value: totalValue,
      notes: notes
    });

    // Map payment methods to database format
    const paymentMethodMap: Record<string, string> = {
      pix: 'pix',
      credit: 'credit_card',
      debit: 'debit_card',
      cash: 'cash',
      pending: 'other'
    };

    // Complete appointment with proper payment method
    const transactionId = await completeAppointment(selectedAppointment.id, paymentMethodMap[selectedPaymentMethod], {
      total_value: totalValue,
      notes,
    });

    // ETAPA 3: Baixa automática de estoque para produtos vendidos
    const productItems = billItems.filter(item => item.type === 'product' && item.productId);
    for (const item of productItems) {
      if (item.productId) {
        await registerSale(item.productId, item.quantity, item.unitPrice, transactionId || undefined);
      }
    }

    // ETAPA 4: Baixa automática de insumos vinculados ao serviço
    if (selectedAppointment.service_id) {
      await registerServiceConsumption(selectedAppointment.service_id, selectedAppointment.id);
    }

    const paymentLabels: Record<string, string> = {
      pix: 'PIX',
      credit: 'Cartão de Crédito',
      debit: 'Cartão de Débito',
      cash: 'Dinheiro',
      pending: 'Pendente'
    };

    toast({
      title: "Comanda fechada",
      description: `R$ ${totalValue.toFixed(2)} - ${paymentLabels[selectedPaymentMethod]}${billItems.length > 0 ? ` (+${billItems.length} item(s))` : ''}`
    });

    setIsClosingBill(false);
    setIsAppointmentDetailOpen(false);
    setSelectedAppointment(null);
    setBillItems([]);
  };

  const getSlotHeight = (appointment: Appointment) => {
    const startTime = new Date(appointment.start_time);
    const endTime = new Date(appointment.end_time);
    const durationMinutes = (endTime.getTime() - startTime.getTime()) / (1000 * 60);
    return durationMinutes / 30;
  };

  const isFirstSlotOfAppointment = (time: string, appointment: Appointment) => {
    return getTimeFromISO(appointment.start_time) === time;
  };

  // Show loading state while data is being fetched
  if (loading || authLoading) {
    return (
      <div className="p-6 lg:p-8">
        <h1 className="text-3xl font-display font-bold text-foreground mb-4">Agenda</h1>
        <Card className="p-12 text-center">
          <p className="text-muted-foreground">Carregando...</p>
        </Card>
      </div>
    );
  }

  if (professionals.length === 0) {
    return (
      <div className="p-6 lg:p-8">
        <h1 className="text-3xl font-display font-bold text-foreground mb-4">Agenda</h1>
        <Card className="p-12 text-center">
          <p className="text-muted-foreground">Cadastre profissionais para visualizar a agenda</p>
        </Card>
      </div>
    );
  }

  if (scheduleProfessionals.length === 0 && isAdmin) {
    return (
      <div className="p-6 lg:p-8">
        <h1 className="text-3xl font-display font-bold text-foreground mb-4">Agenda</h1>
        <Card className="p-12 text-center">
          <p className="text-muted-foreground">Nenhum profissional ativo está configurado para aparecer na agenda.</p>
        </Card>
      </div>
    );
  }

  if (!canViewSchedule) {
    return (
      <div className="p-6 lg:p-8">
        <h1 className="text-3xl font-display font-bold text-foreground mb-4">Agenda</h1>
        <Card className="p-12 text-center">
          <p className="text-muted-foreground">Você não tem permissão para visualizar a agenda.</p>
        </Card>
      </div>
    );
  }

  // If professional user but no visible professionals (user_id not linked)
  if (visibleProfessionals.length === 0 && !isAdmin) {
    const message = currentProfessional && !currentProfessional.has_schedule
      ? 'Seu profissional não está configurado para aparecer na agenda. Entre em contato com o administrador.'
      : 'Seu perfil de profissional não está vinculado corretamente. Entre em contato com o administrador.';

    return (
      <div className="p-6 lg:p-8">
        <h1 className="text-3xl font-display font-bold text-foreground mb-4">Agenda</h1>
        <Card className="p-12 text-center">
          <p className="text-muted-foreground">{message}</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div>
        <h1 className="text-3xl lg:text-4xl font-display font-bold text-foreground">Agenda</h1>
        <p className="text-muted-foreground mt-1 capitalize">{formatDate(currentDate)}</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[150px_minmax(0,1fr)]">
        <div className="space-y-3">
          <Card className="p-2 border-0 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <Button variant="ghost" size="icon-sm" onClick={() => navigateCalendarMonth('prev')} aria-label="Mês anterior">
                <ChevronLeft className="w-3 h-3" />
              </Button>
              <p className="text-[11px] font-semibold capitalize leading-tight text-center">
                {currentDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
              </p>
              <Button variant="ghost" size="icon-sm" onClick={() => navigateCalendarMonth('next')} aria-label="Próximo mês">
                <ChevronRight className="w-3 h-3" />
              </Button>
            </div>

            <div className="grid grid-cols-7 gap-0.5 text-center text-[10px] font-semibold text-muted-foreground mb-1">
              {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((weekday, index) => (
                <span key={`${weekday}-${index}`} className="py-0.5">{weekday}</span>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-0.5">
              {calendarDays.map((day) => {
                const isCurrentMonth = day.getMonth() === currentDate.getMonth();
                const isSelected = isSameCalendarDay(day, currentDate);
                const isToday = isSameCalendarDay(day, new Date());

                return (
                  <button
                    key={day.toISOString()}
                    type="button"
                    onClick={() => setCurrentDate(new Date(day))}
                    className={cn(
                      "h-5 rounded text-[11px] leading-none transition-colors hover:bg-primary/10",
                      !isCurrentMonth && "text-muted-foreground/50",
                      isToday && !isSelected && "font-semibold text-primary",
                      isSelected && "bg-primary text-primary-foreground shadow-sm hover:bg-primary"
                    )}
                  >
                    {day.getDate()}
                  </button>
                );
              })}
            </div>
          </Card>

          <Card className="border-0 shadow-sm overflow-hidden">
            <div className="border-b border-border p-3">
              <p className="text-sm font-semibold text-foreground">Profissionais</p>
            </div>
            <div className="p-3 space-y-2">
              {isAdmin && (
                <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    checked={allProfessionalsSelected}
                    onChange={() => setSelectedProfessionalIds([])}
                    className="h-3.5 w-3.5 accent-primary"
                  />
                  Todos
                </label>
              )}

              {baseVisibleProfessionals.map((professional) => {
                const isChecked = selectedProfessionalIds.length === 0 || selectedProfessionalIds.includes(professional.id);

                return (
                  <label key={professional.id} className="flex items-center gap-2 text-xs text-foreground cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleProfessionalFilter(professional.id)}
                      className="h-3.5 w-3.5 accent-primary"
                    />
                    <span className="truncate">{professional.nickname || professional.name}</span>
                  </label>
                );
              })}
            </div>
          </Card>
        </div>

        <div className="min-w-0 space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={goToToday}>Hoje</Button>
              <Button variant="ghost" size="icon-sm" onClick={() => navigateDate('prev')} aria-label="Dia anterior">
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="icon-sm" onClick={() => navigateDate('next')} aria-label="Próximo dia">
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>

            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-end">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground whitespace-nowrap">Ajustar colunas:</span>
                {[3, 5, 8, 10, 12].map((option) => (
                  <Button
                    key={option}
                    type="button"
                    variant={columnCount === option ? 'default' : 'outline'}
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={() => setColumnCount(option)}
                  >
                    {option}
                  </Button>
                ))}
              </div>

              <div className="relative md:w-80">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={scheduleSearch}
                  onChange={(event) => setScheduleSearch(event.target.value)}
                  placeholder="Pesquisar agendamento"
                  className="pl-9"
                />
              </div>
            </div>
          </div>

          {visibleProfessionals.length === 0 ? (
            <Card className="p-12 text-center border-0 shadow-sm">
              <p className="text-muted-foreground">Selecione pelo menos um profissional para visualizar a agenda.</p>
            </Card>
          ) : (
            <Card className="border-0 shadow-lg overflow-hidden">
              <div className="overflow-x-auto">
                <div className="min-w-[800px]">
                  <div className="grid border-b border-border" style={{ gridTemplateColumns: `64px repeat(${visibleProfessionals.length}, minmax(150px, 1fr))` }}>
                    <div className="p-3 bg-secondary/50 flex items-center justify-center"><Clock className="w-4 h-4 text-muted-foreground" /></div>
                    {visibleProfessionals.map((professional, index) => (
                      <div
                        key={professional.id}
                        className="p-3 border-l border-border"
                        style={{ backgroundColor: professional.schedule_color || getProfessionalColor(index) }}
                      >
                        <div className="flex items-center gap-2">
                          <Avatar className="w-8 h-8 shadow-sm">
                            <AvatarImage src={professional.photo_url || undefined} alt={professional.name} />
                            <AvatarFallback className="bg-white/80 text-xs font-semibold text-foreground">
                              {(professional.nickname || professional.name || '?').charAt(0)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-foreground">{professional.nickname || professional.name}</p>
                            <p className="text-[11px] text-muted-foreground capitalize">{professional.type}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="max-h-[600px] overflow-y-auto scrollbar-thin">
                    {timeSlots.map((time) => {
                      return (
                        <div key={time} className="grid border-b border-border/50 last:border-0" style={{ gridTemplateColumns: `64px repeat(${visibleProfessionals.length}, minmax(150px, 1fr))` }}>
                          <div className="p-3 flex items-center justify-center bg-muted/30">
                            <span className="text-sm font-medium text-muted-foreground">{time}</span>
                          </div>
                          {visibleProfessionals.map((professional) => {
                            const occupyingAppointments = getAppointmentsForSlot(time, professional.id);
                            const appointmentsStartingNow = getAppointmentsStartingAt(time, professional.id);
                            const hasOccupyingAppointment = occupyingAppointments.length > 0;

                            // Check if any appointments that START at this time exist
                            const hasAppointmentsStarting = appointmentsStartingNow.length > 0;

                            // For slots that are occupied but appointment doesn't start here, show empty slot
                            if (hasOccupyingAppointment && !hasAppointmentsStarting) {
                              return <div key={professional.id} className="border-l border-border/50 relative min-h-[48px]" />;
                            }

                            return (
                              <div
                                key={professional.id}
                                className={cn(
                                  "relative border-l border-border/50 min-h-[48px]",
                                  !hasAppointmentsStarting && canEditSchedule && "hover:bg-primary/5 cursor-pointer transition-colors"
                                )}
                                onClick={() => !hasAppointmentsStarting && canEditSchedule && handleSlotClick(time, professional.id)}
                              >
                                {/* Thin clickable strip for new appointment - only show when there are appointments */}
                                {hasAppointmentsStarting && canEditSchedule && (
                                  <div
                                    className="absolute right-0 top-0 bottom-0 w-4 hover:bg-primary/20 cursor-pointer transition-colors z-20 flex items-center justify-center group border-l border-dashed border-transparent hover:border-primary/30"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleSlotClick(time, professional.id);
                                    }}
                                    title="Novo agendamento"
                                  >
                                    <Plus className="w-3 h-3 text-transparent group-hover:text-primary/60 transition-colors" />
                                  </div>
                                )}

                                {hasAppointmentsStarting && (
                                  <div className="absolute top-0 left-0 right-4 flex">
                                    {appointmentsStartingNow.map((appointment, aptIndex) => {
                                      const slotCount = getSlotHeight(appointment);
                                      const cardWidthPercent = 100 / appointmentsStartingNow.length;

                                      return (
                                        <motion.div
                                          key={appointment.id}
                                          initial={{ opacity: 0, scale: 0.95 }}
                                          animate={{ opacity: 1, scale: 1 }}
                                          className={cn(
                                            "rounded-lg p-2 cursor-pointer z-10 shadow-sm border transition-all hover:shadow-md m-0.5",
                                            (appointment.status as string) === 'pre_scheduled' && "bg-orange-100 border-orange-400 border-dashed border-2 animate-pulse",
                                            appointment.status === 'scheduled' && "bg-info-soft border-info/30",
                                            appointment.status === 'confirmed' && "bg-success-soft border-success/30",
                                            appointment.status === 'in_progress' && "bg-warning-soft border-warning/30",
                                            appointment.status === 'completed' && "bg-primary-soft border-primary/30",
                                            appointment.status === 'cancelled' && "bg-destructive-soft border-destructive/30 opacity-60",
                                          )}
                                          style={{
                                            height: `calc(${slotCount * 48}px - 4px)`,
                                            width: `calc(${cardWidthPercent}% - 4px)`,
                                            position: 'absolute',
                                            left: `calc(${aptIndex * cardWidthPercent}% + 2px)`,
                                            top: '2px'
                                          }}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setSelectedAppointment(appointment);
                                            setIsAppointmentDetailOpen(true);
                                          }}
                                        >
                                          <div className="flex flex-col h-full overflow-hidden">
                                            <div className="flex items-start gap-1">
                                              <Avatar className="w-6 h-6 shrink-0 border border-border/50">
                                                <AvatarImage src={appointment.client?.photo_url || undefined} alt={appointment.client?.name} />
                                                <AvatarFallback className="text-[9px] bg-background/50">
                                                  {appointment.client?.name?.charAt(0) || '?'}
                                                </AvatarFallback>
                                              </Avatar>
                                              <div className="flex-1 min-w-0">
                                                <div className="flex items-start justify-between gap-1">
                                                  <p className="text-xs font-medium text-foreground truncate flex-1">{appointment.client?.name}</p>
                                                  {appointment.booking_source === 'online' && (
                                                    <span className="flex items-center gap-0.5 text-[8px] font-medium bg-primary/10 text-primary px-1 py-0.5 rounded shrink-0" title="Agendamento online">
                                                      <Globe className="w-2 h-2" />
                                                    </span>
                                                  )}
                                                </div>
                                                <p className="text-[10px] text-muted-foreground truncate">{appointment.service?.name}</p>
                                              </div>
                                            </div>
                                            {slotCount > 1.5 && (
                                              <Badge variant={appointment.status as any} className="mt-auto text-[9px] px-1 py-0 w-fit">
                                                {appointmentStatusLabels[appointment.status]}
                                              </Badge>
                                            )}
                                          </div>
                                        </motion.div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </Card>
          )}
        </div>
      </div>

      {/* New Appointment Dialog */}
      <Dialog open={isNewAppointmentOpen} onOpenChange={setIsNewAppointmentOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Novo Agendamento</DialogTitle>
            <DialogDescription>{professionals.find(p => p.id === selectedSlot?.professionalId)?.nickname}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Horário</Label>
              <Select value={formTime} onValueChange={setFormTime}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o horário" />
                </SelectTrigger>
                <SelectContent>
                  {timeSlots.map((time) => (
                    <SelectItem key={time} value={time}>{time}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Cliente</Label>
                {!isAddingClient && (
                  <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setIsAddingClient(true)}>
                    <UserPlus className="w-3 h-3 mr-1" />Novo
                  </Button>
                )}
              </div>
              {isAddingClient ? (
                <div className="p-3 rounded-lg border bg-secondary/30 space-y-2">
                  <Input placeholder="Nome" value={newClientName} onChange={(e) => setNewClientName(e.target.value)} />
                  <Input placeholder="Telefone" value={newClientPhone} onChange={(e) => setNewClientPhone(e.target.value)} />
                  <div className="flex gap-2">
                    <Button size="sm" disabled={!newClientName} onClick={async () => {
                      const client = await addClient({ name: newClientName, phone: newClientPhone || undefined });
                      if (client) { setFormClient(client.id); setIsAddingClient(false); setNewClientName(''); setNewClientPhone(''); }
                    }}><Plus className="w-3 h-3 mr-1" />Adicionar</Button>
                    <Button size="sm" variant="ghost" onClick={() => setIsAddingClient(false)}><X className="w-3 h-3" /></Button>
                  </div>
                </div>
              ) : (
                <Combobox
                  options={clients.map(c => ({ value: c.id, label: c.name, sublabel: c.phone || undefined }))}
                  value={formClient}
                  onValueChange={setFormClient}
                  placeholder="Selecione"
                  searchPlaceholder="Buscar cliente..."
                  emptyMessage="Nenhum cliente encontrado."
                />
              )}
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Serviço</Label>
                {!isAddingService && (
                  <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setIsAddingService(true)}>
                    <Plus className="w-3 h-3 mr-1" />Novo
                  </Button>
                )}
              </div>
              {isAddingService ? (
                <div className="p-3 rounded-lg border bg-secondary/30 space-y-2">
                  <Input placeholder="Nome do serviço" value={newServiceName} onChange={(e) => setNewServiceName(e.target.value)} />
                  <div className="grid grid-cols-3 gap-2">
                    <Input placeholder="Categoria" value={newServiceCategory} onChange={(e) => setNewServiceCategory(e.target.value)} />
                    <Input placeholder="Valor" type="number" step="0.01" min="0" value={newServicePrice} onChange={(e) => setNewServicePrice(e.target.value)} />
                    <Input placeholder="Min" type="number" min="15" step="15" value={newServiceDuration} onChange={(e) => setNewServiceDuration(e.target.value)} />
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" disabled={!newServiceName.trim()} onClick={handleQuickAddService}>
                      <Plus className="w-3 h-3 mr-1" />Adicionar
                    </Button>
                    <Button size="sm" variant="ghost" onClick={resetQuickServiceForm}>
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              ) : (
                <Combobox
                  options={services.map(s => ({ value: s.id, label: s.name, sublabel: `R$ ${s.default_price}` }))}
                  value={formService}
                  onValueChange={setFormService}
                  placeholder="Selecione"
                  searchPlaceholder="Buscar serviço..."
                  emptyMessage="Nenhum serviço encontrado."
                />
              )}
            </div>
            <div className="space-y-2">
              <Label>Observações</Label>
              <Textarea value={formNotes} onChange={(e) => setFormNotes(e.target.value)} />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsNewAppointmentOpen(false)}>Cancelar</Button>
              <Button onClick={handleCreateAppointment} disabled={!canCreateAppointment}><Plus className="w-4 h-4 mr-2" />Agendar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Appointment Detail Dialog */}
      <AppointmentDetailDialog
        open={isAppointmentDetailOpen}
        onOpenChange={setIsAppointmentDetailOpen}
        appointment={selectedAppointment}
        appointments={appointments}
        professionals={scheduleProfessionals}
        services={services}
        isAdmin={isAdmin}
        canEditAppointment={canEditSchedule}
        onUpdateStatus={handleUpdateStatus}
        onSave={async (data) => {
          if (!canEditSchedule) return;
          if (!selectedAppointment) return;
          await updateAppointment(selectedAppointment.id, {
            total_value: data.total_value,
            professional_id: data.professional_id,
            service_id: data.service_id,
            start_time: data.start_time,
            end_time: data.end_time,
            notes: data.notes,
          });
          toast({ title: "Agendamento atualizado" });
          setIsAppointmentDetailOpen(false);
        }}
        onOpenCloseBill={handleOpenCloseBill}
        onRefund={async () => {
          if (!selectedAppointment) return;
          await refundAppointment(selectedAppointment.id);
          toast({ title: "Estorno realizado", description: "Pagamento estornado e comissão removida" });
          setIsAppointmentDetailOpen(false);
        }}
        onDelete={async () => {
          if (!selectedAppointment) return;
          await deleteAppointment(selectedAppointment.id);
          toast({ title: "Agendamento excluído", description: "O agendamento foi removido" });
          setIsAppointmentDetailOpen(false);
        }}
      />

      {/* Close Bill Dialog */}
      <Dialog open={isClosingBill} onOpenChange={setIsClosingBill}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Fechar Comanda</DialogTitle>
            <DialogDescription>
              {selectedAppointment?.client?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* Bill Items Editor */}
            <BillItemsEditor
              items={billItems}
              onItemsChange={setBillItems}
              services={services}
              products={products}
              baseServiceName={selectedAppointment?.service?.name}
              baseServiceValue={parseFloat(editValue) || selectedAppointment?.total_value || 0}
              onBaseServiceValueChange={(value) => setEditValue(value.toString())}
            />

            <div className="space-y-2">
              <Label>Forma de Pagamento</Label>
              <div className="grid grid-cols-3 gap-3">
                <Button
                  type="button"
                  variant={selectedPaymentMethod === 'cash' ? 'default' : 'outline'}
                  className="h-16 flex-col gap-1"
                  onClick={() => setSelectedPaymentMethod('cash')}
                >
                  <Banknote className="w-5 h-5" />
                  <span className="text-xs">Dinheiro</span>
                </Button>
                <Button
                  type="button"
                  variant={selectedPaymentMethod === 'pix' ? 'default' : 'outline'}
                  className="h-16 flex-col gap-1"
                  onClick={() => setSelectedPaymentMethod('pix')}
                >
                  <QrCode className="w-5 h-5" />
                  <span className="text-xs">PIX</span>
                </Button>
                <Button
                  type="button"
                  variant={selectedPaymentMethod === 'credit' ? 'default' : 'outline'}
                  className="h-16 flex-col gap-1"
                  onClick={() => setSelectedPaymentMethod('credit')}
                >
                  <CreditCard className="w-5 h-5" />
                  <span className="text-xs">Crédito</span>
                </Button>
                <Button
                  type="button"
                  variant={selectedPaymentMethod === 'debit' ? 'default' : 'outline'}
                  className="h-16 flex-col gap-1"
                  onClick={() => setSelectedPaymentMethod('debit')}
                >
                  <Wallet className="w-5 h-5" />
                  <span className="text-xs">Débito</span>
                </Button>
                <Button
                  type="button"
                  variant={selectedPaymentMethod === 'pending' ? 'destructive' : 'outline'}
                  className="h-16 flex-col gap-1 col-span-2"
                  onClick={() => setSelectedPaymentMethod('pending')}
                >
                  <AlertCircle className="w-5 h-5" />
                  <span className="text-xs">Pendente</span>
                </Button>
              </div>
              {selectedPaymentMethod === 'pending' && (
                <p className="text-xs text-warning text-center mt-2">
                  O valor será acumulado como pendente para este cliente
                </p>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setIsClosingBill(false)}>Cancelar</Button>
              <Button onClick={handleCloseBill} disabled={!selectedPaymentMethod}>
                Confirmar Pagamento
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
