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
import { Appointment } from '@/context/DataContext';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ClientHistoryDialog } from './ClientHistoryDialog';

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
  professionals: Professional[];
  services: Service[];
  isAdmin: boolean;
  canEditAppointment: boolean;
  onUpdateStatus: (status: Appointment['status']) => void;
  onSave: (data: { 
    total_value: number; 
    professional_id: string;
    service_id: string;
    start_time: string;
    end_time: string;
    notes: string;
  }) => void;
  onOpenCloseBill: () => void;
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

export function AppointmentDetailDialog({
  open,
  onOpenChange,
  appointment,
  appointments,
  professionals,
  services,
  isAdmin,
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

  // Initialize with appointment data
  useEffect(() => {
    if (appointment) {
      const start = new Date(appointment.start_time);
      const end = new Date(appointment.end_time);
      const durationMinutes = (end.getTime() - start.getTime()) / (1000 * 60);
      
      setSelectedDate(start);
      setNotes(appointment.notes || '');
      setSelectedStatus(appointment.status);
      
      // Set main service row
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
  }, [appointment]);

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
          updatedRow.value = service.default_price.toString();
          updatedRow.duration = service.duration_minutes.toString();
          updatedRow.endTime = calculateEndTime(updatedRow.startTime, service.duration_minutes.toString());
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
    
    const [startHour, startMin] = mainRow.startTime.split(':').map(Number);
    
    // Calculate total end time from all services
    const lastRow = serviceRows[serviceRows.length - 1];
    const [endHour, endMin] = lastRow.endTime.split(':').map(Number);
    
    const newStartTime = new Date(selectedDate);
    newStartTime.setHours(startHour, startMin, 0, 0);
    
    const newEndTime = new Date(selectedDate);
    newEndTime.setHours(endHour, endMin, 0, 0);
    
    // Calculate total value from all services
    const totalValue = serviceRows.reduce((sum, row) => sum + (parseFloat(row.value) || 0), 0);
    
    const saveData = {
      total_value: totalValue,
      professional_id: mainRow.professionalId,
      service_id: mainRow.serviceId,
      start_time: newStartTime.toISOString(),
      end_time: newEndTime.toISOString(),
      notes,
    };
    
    // Check for conflicts
    const conflicts = checkForConflicts(mainRow.professionalId, newStartTime, newEndTime);
    
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
    if (appointment?.client?.phone) {
      const phone = appointment.client.phone.replace(/\D/g, '');
      const formattedPhone = phone.startsWith('55') ? phone : `55${phone}`;
      window.open(`https://wa.me/${formattedPhone}`, '_blank', 'noopener,noreferrer');
    }
  };

  if (!appointment) return null;

  const canEdit = canEditAppointment && appointment.status !== 'completed' && appointment.status !== 'cancelled';
  const totalValue = serviceRows.reduce((sum, row) => sum + (parseFloat(row.value) || 0), 0);

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
                  <AvatarImage src={appointment.client?.photo_url || undefined} alt={appointment.client?.name} />
                  <AvatarFallback className="bg-primary-soft text-primary text-lg font-semibold">
                    {appointment.client?.name?.charAt(0) || '?'}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <button 
                    onClick={() => setShowClientHistory(true)}
                    className="flex items-center gap-1 text-lg font-semibold text-primary hover:underline cursor-pointer"
                    title="Ver histórico de atendimentos"
                  >
                    {appointment.client?.name}
                    <History className="w-4 h-4 opacity-60" />
                  </button>
                  {appointment.client?.phone && (
                    <button 
                      onClick={handleWhatsApp}
                      className="flex items-center gap-1 text-sm text-primary hover:underline"
                    >
                      <Phone className="w-3 h-3" />
                      {appointment.client.phone}
                    </button>
                  )}
                </div>
              </div>
              {isAdmin && (
                <Button 
                  onClick={onOpenCloseBill}
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
                          {services.map(s => (
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
                          {professionals.map(p => (
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

            {/* Admin Actions */}
            {isAdmin && (
              <div className="pt-3 border-t border-border space-y-2">
                <p className="text-xs text-muted-foreground">Ações de Administrador:</p>
                <div className="flex gap-2">
                  {appointment.status === 'completed' && (
                    <Button 
                      size="sm" 
                      variant="outline" 
                      className="text-warning border-warning hover:bg-warning/10"
                      onClick={onRefund}
                    >
                      <RotateCcw className="w-4 h-4 mr-1" />
                      Estornar
                    </Button>
                  )}
                  <Button 
                    size="sm" 
                    variant="outline" 
                    className="text-destructive border-destructive hover:bg-destructive/10"
                    onClick={onDelete}
                  >
                    <Trash2 className="w-4 h-4 mr-1" />
                    Excluir
                  </Button>
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
                <p className="text-sm text-muted-foreground">{appointment.client?.name}</p>
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
                    {format(new Date(apt.start_time), 'HH:mm')} às {format(new Date(apt.end_time), 'HH:mm')}
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
