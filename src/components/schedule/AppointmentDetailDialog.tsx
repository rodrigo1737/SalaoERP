import { useState, useEffect } from 'react';
import { 
  Phone, 
  Calendar as CalendarIcon,
  MessageCircle,
  DollarSign,
  RotateCcw,
  Trash2,
  Plus,
  AlertTriangle,
  History,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { 
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { Appointment, ServiceProfessional } from '@/context/DataContext';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ClientHistoryDialog } from './ClientHistoryDialog';
import { getAvailableServicesForProfessional, getServiceDurationForProfessional, isServiceAvailableForProfessional } from '@/lib/serviceProfessionalAvailability';
import { toast } from 'sonner';

interface Professional {
  id: string;
  name: string;
  nickname: string;
}

interface Service {
  id: string;
  name: string;
  default_price: number;
  duration_minutes: number;
}

interface ServiceRow {
  id: string;
  serviceId: string;
  professionalId: string;
  duration: string;
  startTime: string;
  endTime: string;
  value: string;
}

interface AppointmentDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appointment: Appointment | null;
  appointments: Appointment[];
  initialServiceLines?: Array<{
    service_id: string;
    professional_id: string;
    start_time?: string | null;
    end_time?: string | null;
    value: number;
  }>;
  professionals: Professional[];
  services: Service[];
  serviceProfessionalLinks: ServiceProfessional[];
  isAdmin: boolean;
  canCloseBill?: boolean;
  canRefundBill?: boolean;
  canOpenBill?: boolean;
  canEditAppointment: boolean;
  onUpdateStatus: (status: Appointment['status']) => void;
  onSave: (data: {
    total_value: number;
    professional_id: string;
    service_id: string;
    start_time: string;
    end_time: string;
    notes: string;
    additionalServices?: Array<{
      professional_id: string;
      service_id: string;
      start_time: string;
      end_time: string;
      total_value: number;
    }>;
  }) => void;
  onOpenCloseBill: (serviceLines?: Array<{ service_id: string; professional_id: string; value: number }>) => void;
  onRefund: () => void;
  onDelete: () => void;
}

const statusOptions = [
  { value: 'pre_scheduled', label: 'Pré-Agendado', color: 'bg-orange-500' },
  { value: 'scheduled', label: 'Agendado', color: 'bg-info' },
  { value: 'confirmed', label: 'Confirmado', color: 'bg-success' },
  { value: 'in_progress', label: 'Em Atendimento', color: 'bg-warning' },
  { value: 'completed', label: 'Finalizado', color: 'bg-muted-foreground' },
  { value: 'cancelled', label: 'Cancelado', color: 'bg-destructive/50 text-destructive-foreground' },
];

const isValidDateValue = (value: string | null | undefined) => {
  if (!value) return false;
  return !Number.isNaN(new Date(value).getTime());
};

const buildSafeStartDate = (appointment: Appointment) => {
  if (isValidDateValue(appointment.start_time)) {
    return new Date(appointment.start_time);
  }

  if (isValidDateValue(appointment.created_at)) {
    return new Date(appointment.created_at);
  }

  return new Date();
};

const buildSafeEndDate = (appointment: Appointment, start: Date) => {
  if (isValidDateValue(appointment.end_time)) {
    const parsedEnd = new Date(appointment.end_time);
    if (parsedEnd.getTime() > start.getTime()) {
      return parsedEnd;
    }
  }

  const fallbackDuration = Math.max(appointment.service?.duration_minutes || 60, 1);
  return new Date(start.getTime() + fallbackDuration * 60 * 1000);
};

const formatTimeRangeLabel = (startValue: string, endValue: string) => {
  const safeStart = isValidDateValue(startValue) ? new Date(startValue) : null;
  const safeEnd = isValidDateValue(endValue) ? new Date(endValue) : null;

  if (!safeStart || !safeEnd) {
    return 'Horário importado';
  }

  return `${format(safeStart, 'HH:mm')} às ${format(safeEnd, 'HH:mm')}`;
};

export function AppointmentDetailDialog({
  open,
  onOpenChange,
  appointment,
  appointments,
  initialServiceLines,
  professionals,
  services,
  serviceProfessionalLinks,
  isAdmin,
  canCloseBill = false,
  canRefundBill = false,
  canOpenBill = true,
  canEditAppointment,
  onUpdateStatus,
  onSave,
  onOpenCloseBill,
  onRefund,
  onDelete,
}: AppointmentDetailDialogProps) {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [serviceRows, setServiceRows] = useState<ServiceRow[]>([]);
  const [notes, setNotes] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('scheduled');
  const [showConflictDialog, setShowConflictDialog] = useState(false);
  const [conflictingAppointments, setConflictingAppointments] = useState<Appointment[]>([]);
  const [showClientHistory, setShowClientHistory] = useState(false);
  const [pendingSaveData, setPendingSaveData] = useState<{
    total_value: number;
    professional_id: string;
    service_id: string;
    start_time: string;
    end_time: string;
    notes: string;
  } | null>(null);

  const getServicesForProfessional = (professionalId: string, currentServiceId?: string) => (
    getAvailableServicesForProfessional(services, serviceProfessionalLinks, professionalId, currentServiceId)
  );
  const getProfessionalsForService = (serviceId: string, currentProfessionalId?: string) => (
    !serviceId
      ? professionals
      : professionals.filter((professional) => (
          isServiceAvailableForProfessional(serviceProfessionalLinks, professional.id, serviceId)
          || professional.id === currentProfessionalId
        ))
  );

  // Initialize with appointment data
  useEffect(() => {
    if (appointment) {
      const start = buildSafeStartDate(appointment);
      const end = buildSafeEndDate(appointment, start);
      const durationMinutes = Math.max(
        1,
        Math.round((end.getTime() - start.getTime()) / (1000 * 60)),
      );
      
      setSelectedDate(start);
      setNotes(appointment.notes || '');
      setSelectedStatus(appointment.status);

      // Múltiplos serviços persistidos → uma linha por serviço; senão, a linha
      // única a partir do próprio agendamento (compatível com registros antigos).
      if (initialServiceLines && initialServiceLines.length > 0) {
        setServiceRows(initialServiceLines.map((line, index) => {
          const lineStart = line.start_time && isValidDateValue(line.start_time)
            ? new Date(line.start_time)
            : start;
          const lineEnd = line.end_time && isValidDateValue(line.end_time)
            ? new Date(line.end_time)
            : new Date(lineStart.getTime() + 30 * 60 * 1000);
          const lineDuration = Math.max(1, Math.round((lineEnd.getTime() - lineStart.getTime()) / (1000 * 60)));
          return {
            id: index === 0 ? 'main' : (crypto.randomUUID?.() ?? `line-${index}`),
            serviceId: line.service_id || '',
            professionalId: line.professional_id || '',
            duration: lineDuration.toString(),
            startTime: format(lineStart, 'HH:mm'),
            endTime: format(lineEnd, 'HH:mm'),
            value: line.value?.toString() || '',
          };
        }));
      } else {
        setServiceRows([{
          id: 'main',
          serviceId: appointment.service_id || '',
          professionalId: appointment.professional_id || '',
          duration: durationMinutes.toString(),
          startTime: format(start, 'HH:mm'),
          endTime: format(end, 'HH:mm'),
          value: appointment.total_value?.toString() || '',
        }]);
      }
    }
  }, [appointment, initialServiceLines]);

  // Calculate end time based on start time and duration for a specific row
  const calculateEndTime = (startTime: string, duration: string): string => {
    if (startTime && duration) {
      const [hours, minutes] = startTime.split(':').map(Number);
      const totalMinutes = hours * 60 + minutes + parseInt(duration);
      const endHours = Math.floor(totalMinutes / 60);
      const endMins = totalMinutes % 60;
      return `${endHours.toString().padStart(2, '0')}:${endMins.toString().padStart(2, '0')}`;
    }
    return startTime;
  };

  const updateServiceRow = (rowId: string, field: keyof ServiceRow, value: string) => {
    setServiceRows(prev => prev.map(row => {
      if (row.id !== rowId) return row;
      
      const updatedRow = { ...row, [field]: value };
      
      // If changing service, update default value and duration
      if (field === 'serviceId') {
        const service = services.find(s => s.id === value);
        if (service) {
          const resolvedDuration = getServiceDurationForProfessional(
            services,
            serviceProfessionalLinks,
            updatedRow.professionalId,
            service.id,
          ) ?? service.duration_minutes;
          updatedRow.value = service.default_price.toString();
          updatedRow.duration = resolvedDuration.toString();
          updatedRow.endTime = calculateEndTime(updatedRow.startTime, resolvedDuration.toString());
        }
      }

      if (field === 'professionalId' && updatedRow.serviceId) {
        const stillAvailable = isServiceAvailableForProfessional(
          serviceProfessionalLinks,
          value,
          updatedRow.serviceId,
        );

        if (!stillAvailable) {
          updatedRow.serviceId = '';
          updatedRow.value = '';
          updatedRow.duration = '30';
          updatedRow.endTime = calculateEndTime(updatedRow.startTime, '30');
        } else {
          const resolvedDuration = getServiceDurationForProfessional(
            services,
            serviceProfessionalLinks,
            value,
            updatedRow.serviceId,
          );
          if (resolvedDuration) {
            updatedRow.duration = resolvedDuration.toString();
            updatedRow.endTime = calculateEndTime(updatedRow.startTime, resolvedDuration.toString());
          }
        }
      }
      
      // If changing start time or duration, recalculate end time
      if (field === 'startTime' || field === 'duration') {
        const startT = field === 'startTime' ? value : updatedRow.startTime;
        const dur = field === 'duration' ? value : updatedRow.duration;
        updatedRow.endTime = calculateEndTime(startT, dur);
      }
      
      return updatedRow;
    }));
  };

  const addServiceRow = () => {
    const lastRow = serviceRows[serviceRows.length - 1];
    const newStartTime = lastRow?.endTime || '09:00';
    
    setServiceRows(prev => [...prev, {
      id: crypto.randomUUID(),
      serviceId: '',
      professionalId: lastRow?.professionalId || '',
      duration: '30',
      startTime: newStartTime,
      endTime: calculateEndTime(newStartTime, '30'),
      value: '',
    }]);
  };

  const removeServiceRow = (rowId: string) => {
    if (serviceRows.length <= 1) return; // Keep at least one row
    setServiceRows(prev => prev.filter(row => row.id !== rowId));
  };

  // Check for conflicts with existing appointments
  const checkForConflicts = (
    professionalId: string,
    startTime: Date,
    endTime: Date
  ): Appointment[] => {
    return appointments.filter(apt => {
      // Skip the current appointment being edited
      if (apt.id === appointment?.id) return false;
      
      // Only check same professional
      if (apt.professional_id !== professionalId) return false;
      
      // Skip cancelled appointments
      if (apt.status === 'cancelled') return false;
      
      const aptStart = new Date(apt.start_time);
      const aptEnd = new Date(apt.end_time);
      
      // Check if times overlap
      const overlaps = startTime < aptEnd && endTime > aptStart;
      return overlaps;
    });
  };

  const handleSave = () => {
    if (!appointment || serviceRows.length === 0) return;
    
    // Use the first (main) service row for the appointment
    const mainRow = serviceRows[0];
    if (!mainRow.serviceId || !mainRow.professionalId) {
      toast.error('Selecione o serviço e o profissional principal para salvar o agendamento.');
      return;
    }

    const invalidRow = serviceRows.find((row) => (
      !row.serviceId
      || !row.professionalId
      || !isServiceAvailableForProfessional(serviceProfessionalLinks, row.professionalId, row.serviceId)
    ));

    if (invalidRow) {
      toast.error('Existe um serviço que não está habilitado para o profissional selecionado.');
      return;
    }
    
    const buildRowTimes = (row: ServiceRow) => {
      const [startH, startM] = row.startTime.split(':').map(Number);
      const [endH, endM] = row.endTime.split(':').map(Number);
      const start = new Date(selectedDate);
      start.setHours(startH, startM, 0, 0);
      const end = new Date(selectedDate);
      end.setHours(endH, endM, 0, 0);
      if (end.getTime() <= start.getTime()) {
        end.setTime(start.getTime() + 30 * 60 * 1000);
      }
      return { start, end };
    };

    // O agendamento principal guarda o serviço da 1ª linha; cada serviço
    // adicional vira um agendamento-irmão (mesmo cliente/dia) para não perder
    // dados — o modelo guarda um serviço por agendamento e a comanda unificada
    // reagrupa todos na cobrança.
    const { start: newStartTime, end: mainEndTime } = buildRowTimes(mainRow);

    const additionalServices = serviceRows.slice(1).map((row) => {
      const { start, end } = buildRowTimes(row);
      return {
        professional_id: row.professionalId,
        service_id: row.serviceId,
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        total_value: parseFloat(row.value) || 0,
      };
    });

    const saveData = {
      total_value: parseFloat(mainRow.value) || 0,
      professional_id: mainRow.professionalId,
      service_id: mainRow.serviceId,
      start_time: newStartTime.toISOString(),
      end_time: mainEndTime.toISOString(),
      notes,
      additionalServices,
    };
    
    // Check for conflicts
    const conflicts = checkForConflicts(mainRow.professionalId, newStartTime, mainEndTime);
    
    if (conflicts.length > 0) {
      // Store pending save data and show confirmation dialog
      setPendingSaveData(saveData);
      setConflictingAppointments(conflicts);
      setShowConflictDialog(true);
    } else {
      // No conflicts, save directly
      onSave(saveData);
      
      // Also update status if changed
      if (selectedStatus !== appointment.status) {
        onUpdateStatus(selectedStatus as Appointment['status']);
      }
    }
  };

  const handleConfirmOverlap = () => {
    if (pendingSaveData) {
      onSave(pendingSaveData);
      
      // Also update status if changed
      if (selectedStatus !== appointment?.status) {
        onUpdateStatus(selectedStatus as Appointment['status']);
      }
    }
    setShowConflictDialog(false);
    setPendingSaveData(null);
    setConflictingAppointments([]);
  };

  const handleCancelOverlap = () => {
    setShowConflictDialog(false);
    setPendingSaveData(null);
    setConflictingAppointments([]);
  };

  const handleWhatsApp = () => {
    const phoneValue = appointment?.client?.phone;
    if (phoneValue) {
      const phone = phoneValue.replace(/\D/g, '');
      const formattedPhone = phone.startsWith('55') ? phone : `55${phone}`;
      window.open(`https://wa.me/${formattedPhone}`, '_blank', 'noopener,noreferrer');
    }
  };

  if (!appointment) return null;

  const canEdit = canEditAppointment && appointment.status !== 'completed' && appointment.status !== 'cancelled';
  const totalValue = serviceRows.reduce((sum, row) => sum + (parseFloat(row.value) || 0), 0);
  const clientName = appointment.client?.name || 'Cliente importado';
  const clientPhone = appointment.client?.phone || '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl p-0 gap-0 overflow-hidden max-h-[90vh] overflow-y-auto">
        <Tabs defaultValue="reserva" className="w-full">
          <div className="border-b bg-muted/30">
            <TabsList className="h-auto p-0 bg-transparent rounded-none">
              <TabsTrigger 
                value="reserva" 
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-6 py-3"
              >
                Reserva
              </TabsTrigger>
              <TabsTrigger 
                value="informacoes"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-6 py-3"
              >
                Informações
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="reserva" className="p-6 mt-0 space-y-5">
            {/* Client Header */}
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <Avatar className="w-12 h-12 border-2 border-border">
                  <AvatarImage src={appointment.client?.photo_url || undefined} alt={clientName} />
                  <AvatarFallback className="bg-primary-soft text-primary text-lg font-semibold">
                    {clientName.charAt(0) || '?'}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <button 
                    onClick={() => appointment.client_id && setShowClientHistory(true)}
                    className="flex items-center gap-1 text-lg font-semibold text-primary hover:underline cursor-pointer"
                    title="Ver histórico de atendimentos"
                    disabled={!appointment.client_id}
                  >
                    {clientName}
                    <History className="w-4 h-4 opacity-60" />
                  </button>
                  {clientPhone && (
                    <button 
                      onClick={handleWhatsApp}
                      className="flex items-center gap-1 text-sm text-primary hover:underline"
                    >
                      <Phone className="w-3 h-3" />
                      {clientPhone}
                    </button>
                  )}
                </div>
              </div>
              {canCloseBill && canOpenBill && (
                <Button
                  onClick={() => {
                    // Leva as linhas atuais (serviço, profissional, valor) para a
                    // comanda — inclusive alterações ainda não salvas.
                    const lines = serviceRows
                      .filter((row) => row.serviceId && row.professionalId)
                      .map((row) => ({
                        service_id: row.serviceId,
                        professional_id: row.professionalId,
                        value: parseFloat(row.value) || 0,
                      }));
                    onOpenCloseBill(lines);
                  }}
                  disabled={appointment.status === 'completed' || appointment.status === 'cancelled'}
                  className="bg-success hover:bg-success/90 text-success-foreground"
                >
                  <DollarSign className="w-4 h-4 mr-1" />
                  Abrir Comanda
                </Button>
              )}
            </div>

            {/* Date and WhatsApp Row */}
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Label className="text-sm font-medium">Data:</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      disabled={!canEdit}
                      className="w-[130px] justify-start text-left font-normal"
                    >
                      <CalendarIcon className="w-4 h-4 mr-2" />
                      {format(selectedDate, 'dd/MM/yyyy')}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={selectedDate}
                      onSelect={(date) => date && setSelectedDate(date)}
                      locale={ptBR}
                      initialFocus
                      className="p-3 pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="flex-1" />
              <Button 
                variant="outline" 
                className="bg-success hover:bg-success/90 text-success-foreground border-success"
                onClick={handleWhatsApp}
                disabled={!appointment.client?.phone}
              >
                <MessageCircle className="w-4 h-4 mr-2" />
                Enviar Whatsapp
              </Button>
            </div>

            {/* Service Grid */}
            <div className="space-y-2">
              <div className="border rounded-lg overflow-hidden">
                <div className="grid grid-cols-[2fr_1.5fr_60px_80px_80px_90px_40px] bg-muted/50 text-sm font-medium border-b">
                  <div className="p-2 border-r">Serviço</div>
                  <div className="p-2 border-r">Profissional</div>
                  <div className="p-2 border-r text-center">Tempo</div>
                  <div className="p-2 border-r text-center">Início</div>
                  <div className="p-2 border-r text-center">Fim</div>
                  <div className="p-2 border-r text-center">Valor (R$)</div>
                  <div className="p-2 text-center"></div>
                </div>
                
                {serviceRows.map((row, index) => (
                  <div key={row.id} className="grid grid-cols-[2fr_1.5fr_60px_80px_80px_90px_40px] text-sm border-b last:border-b-0">
                    <div className="p-1.5 border-r">
                      <Select 
                        value={row.serviceId} 
                        onValueChange={(val) => updateServiceRow(row.id, 'serviceId', val)} 
                        disabled={!canEdit}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                        <SelectContent>
                          {getServicesForProfessional(row.professionalId, row.serviceId).map(s => (
                            <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="p-1.5 border-r">
                      <Select 
                        value={row.professionalId} 
                        onValueChange={(val) => updateServiceRow(row.id, 'professionalId', val)} 
                        disabled={!canEdit}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                        <SelectContent>
                          {getProfessionalsForService(row.serviceId, row.professionalId).map(p => (
                            <SelectItem key={p.id} value={p.id}>{p.nickname}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="p-1.5 border-r">
                      <Input 
                        type="number" 
                        value={row.duration} 
                        onChange={(e) => updateServiceRow(row.id, 'duration', e.target.value)}
                        disabled={!canEdit}
                        className="h-8 text-xs text-center px-1"
                      />
                    </div>
                    <div className="p-1.5 border-r">
                      <Input 
                        type="time" 
                        value={row.startTime} 
                        onChange={(e) => updateServiceRow(row.id, 'startTime', e.target.value)}
                        disabled={!canEdit}
                        className="h-8 text-xs px-1"
                      />
                    </div>
                    <div className="p-1.5 border-r">
                      <Input 
                        type="time" 
                        value={row.endTime} 
                        onChange={(e) => updateServiceRow(row.id, 'endTime', e.target.value)}
                        disabled={!canEdit}
                        className="h-8 text-xs px-1"
                      />
                    </div>
                    <div className="p-1.5 border-r">
                      <Input 
                        type="number" 
                        value={row.value} 
                        onChange={(e) => updateServiceRow(row.id, 'value', e.target.value)}
                        disabled={!canEdit}
                        className="h-8 text-xs text-center px-1"
                        step="0.01"
                      />
                    </div>
                    <div className="p-1.5 flex items-center justify-center">
                      {serviceRows.length > 1 && canEdit && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => removeServiceRow(row.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Add Service Button and Total */}
              <div className="flex items-center justify-between">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!canEdit}
                  className="text-muted-foreground"
                  onClick={addServiceRow}
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Adicionar serviço
                </Button>
                
                {serviceRows.length > 1 && (
                  <div className="text-sm font-semibold">
                    Total: <span className="text-primary">R$ {totalValue.toFixed(2)}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Status Selection */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Status:</Label>
              <div className="flex flex-wrap gap-2">
                {statusOptions.map((status) => (
                  <button
                    key={status.value}
                    type="button"
                    onClick={() => canEdit && setSelectedStatus(status.value)}
                    disabled={!canEdit}
                    className={cn(
                      "px-4 py-2 rounded-full text-sm font-medium transition-all flex items-center gap-2",
                      selectedStatus === status.value
                        ? `${status.color} text-white shadow-md scale-105`
                        : "bg-muted text-muted-foreground hover:bg-muted/80",
                      !canEdit && "opacity-50 cursor-not-allowed"
                    )}
                  >
                    <span className={cn(
                      "w-2 h-2 rounded-full",
                      selectedStatus === status.value ? "bg-white" : status.color
                    )} />
                    {status.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Admin/Finance Actions */}
            {(isAdmin || canRefundBill) && (
              <div className="pt-3 border-t border-border space-y-2">
                <p className="text-xs text-muted-foreground">Ações de Administrador/Financeiro:</p>
                <div className="flex gap-2">
                  {appointment.status === 'completed' && canRefundBill && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-warning border-warning hover:bg-warning/10"
                      onClick={onRefund}
                    >
                      <RotateCcw className="w-4 h-4 mr-1" />
                      Estornar e Reabrir
                    </Button>
                  )}
                  {isAdmin && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive border-destructive hover:bg-destructive/10"
                      onClick={onDelete}
                    >
                      <Trash2 className="w-4 h-4 mr-1" />
                      Excluir
                    </Button>
                  )}
                </div>
              </div>
            )}

            {/* Footer Actions */}
            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSave} disabled={!canEdit}>
                Salvar
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="informacoes" className="p-6 mt-0 space-y-4">
            <div className="space-y-4">
              <div>
                <Label className="text-sm font-medium">Cliente</Label>
                <p className="text-sm text-muted-foreground">{clientName}</p>
              </div>
              <div>
                <Label className="text-sm font-medium">Telefone</Label>
                <p className="text-sm text-muted-foreground">{appointment.client?.phone || '-'}</p>
              </div>
              <div>
                <Label className="text-sm font-medium">Email</Label>
                <p className="text-sm text-muted-foreground">{appointment.client?.email || '-'}</p>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">Observações</Label>
                <Textarea 
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Adicione observações sobre o atendimento..."
                  className="min-h-[100px]"
                  disabled={!canEdit}
                />
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>

      {/* Conflict Confirmation Dialog */}
      <AlertDialog open={showConflictDialog} onOpenChange={setShowConflictDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-warning">
              <AlertTriangle className="w-5 h-5" />
              Conflito de Horário Detectado
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p>
                Já existe(m) {conflictingAppointments.length} agendamento(s) neste horário para o profissional selecionado:
              </p>
              <ul className="space-y-2">
                {conflictingAppointments.map(apt => (
                  <li key={apt.id} className="bg-muted/50 p-2 rounded-md text-sm">
                    <span className="font-medium">{apt.client?.name}</span>
                    {' - '}
                    {formatTimeRangeLabel(apt.start_time, apt.end_time)}
                    {apt.service && (
                      <span className="text-muted-foreground"> ({apt.service.name})</span>
                    )}
                  </li>
                ))}
              </ul>
              <p className="font-medium">
                Deseja fazer um encaixe mesmo assim?
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancelOverlap}>
              Não, voltar
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleConfirmOverlap}
              className="bg-warning hover:bg-warning/90 text-warning-foreground"
            >
              Sim, fazer encaixe
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Client History Dialog */}
      <ClientHistoryDialog
        open={showClientHistory}
        onOpenChange={setShowClientHistory}
        clientId={appointment?.client_id || null}
        clientName={appointment?.client?.name || 'Cliente'}
      />
    </Dialog>
  );
}
