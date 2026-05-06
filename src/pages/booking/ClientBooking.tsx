import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { useClientAuth } from '@/contexts/ClientAuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Calendar } from '@/components/ui/calendar';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Loader2, Clock, DollarSign, CheckCircle2, ArrowLeft, ArrowRight, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { format, addMinutes, isBefore, isToday, startOfDay, parseISO, setHours, setMinutes } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';

interface TenantInfo {
  id: string;
  name: string;
}

interface Professional {
  id: string;
  name: string;
  nickname: string;
  photo_url?: string;
}

interface Service {
  id: string;
  name: string;
  description?: string;
  category?: string;
  duration_minutes: number;
  default_price: number;
  price_type: string;
  break_time_minutes?: number;
}

interface Appointment {
  id: string;
  professional_id: string;
  start_time: string;
  end_time: string;
  status: string;
}

interface ServiceProfessional {
  service_id: string;
  professional_id: string;
  duration_minutes: number | null;
}

type BookingStep = 'service' | 'professional' | 'datetime' | 'confirm';

const ClientBooking: React.FC = () => {
  const navigate = useNavigate();
  const { tenant } = useOutletContext<{ tenant: TenantInfo }>();
  const { user, clientAccount, loading: authLoading } = useClientAuth();

  const [step, setStep] = useState<BookingStep>('service');
  const [services, setServices] = useState<Service[]>([]);
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [serviceProfessionals, setServiceProfessionals] = useState<ServiceProfessional[]>([]);
  const [existingAppointments, setExistingAppointments] = useState<Appointment[]>([]);
  const [workingHours, setWorkingHours] = useState({ start: 8, end: 20 });
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Selected values
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [selectedProfessional, setSelectedProfessional] = useState<Professional | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('../login');
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);

      // Fetch services available for online booking
      const { data: servData } = await supabase
        .from('services')
        .select('id, name, description, category, duration_minutes, break_time_minutes, default_price, price_type')
        .eq('tenant_id', tenant.id)
        .eq('is_active', true)
        .eq('allow_online_booking', true)
        .order('name');

      if (servData) {
        setServices(servData);
      }

      // Fetch active professionals
      const { data: profData } = await supabase
        .from('professionals')
        .select('id, name, nickname, photo_url')
        .eq('tenant_id', tenant.id)
        .eq('is_active', true)
        .eq('has_schedule', true)
        .order('name');

      if (profData) {
        setProfessionals(profData);
      }

      const { data: serviceProfessionalData } = await supabase
        .from('service_professionals')
        .select('service_id, professional_id, duration_minutes')
        .eq('tenant_id', tenant.id);

      if (serviceProfessionalData) {
        setServiceProfessionals(serviceProfessionalData);
      }

      const { data: settingsData } = await supabase
        .from('tenant_settings')
        .select('working_hours_start, working_hours_end')
        .eq('tenant_id', tenant.id)
        .maybeSingle();

      if (settingsData?.working_hours_start != null && settingsData?.working_hours_end != null) {
        setWorkingHours({
          start: settingsData.working_hours_start,
          end: settingsData.working_hours_end,
        });
      }

      setLoading(false);
    };

    fetchData();
  }, [tenant.id]);

  // Fetch appointments for selected date with real-time updates
  const fetchAppointments = useCallback(async () => {
    if (!selectedDate) return;

    const dateStr = format(selectedDate, 'yyyy-MM-dd');
    const { data } = await supabase
      .from('appointments')
      .select('id, professional_id, start_time, end_time, status')
      .eq('tenant_id', tenant.id)
      .gte('start_time', `${dateStr}T00:00:00`)
      .lt('start_time', `${dateStr}T23:59:59`)
      .in('status', ['scheduled', 'confirmed', 'in_progress', 'pre_scheduled']);

    if (data) {
      setExistingAppointments(data);
    }
  }, [selectedDate, tenant.id]);

  useEffect(() => {
    fetchAppointments();
  }, [fetchAppointments]);

  // Real-time subscription for appointments
  useEffect(() => {
    if (!selectedDate || !tenant.id) return;

    const dateStr = format(selectedDate, 'yyyy-MM-dd');

    const channel = supabase
      .channel('online-booking-appointments')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'appointments',
          filter: `tenant_id=eq.${tenant.id}`,
        },
        (payload) => {
          // Refetch appointments when there's any change
          fetchAppointments();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedDate, tenant.id, fetchAppointments]);

  // Generate available time slots
  const availableTimeSlots = useMemo(() => {
    if (!selectedDate || !selectedProfessional || !selectedService) return [];

    const slots: string[] = [];
    const startHour = workingHours.start;
    const endHour = workingHours.end;
    const slotInterval = 30; // 30 min intervals

    const now = new Date();
    const isSelectedToday = isToday(selectedDate);

    for (let hour = startHour; hour < endHour; hour++) {
      for (let minute = 0; minute < 60; minute += slotInterval) {
        const slotStart = setMinutes(setHours(selectedDate, hour), minute);
        const configuredDuration = serviceProfessionals.find(sp =>
          sp.service_id === selectedService.id && sp.professional_id === selectedProfessional.id
        )?.duration_minutes;
        const duration = configuredDuration || selectedService.duration_minutes;
        const slotEnd = addMinutes(slotStart, duration + (selectedService.break_time_minutes || 0));
        const workdayEnd = setMinutes(setHours(selectedDate, endHour), 0);

        // Skip past times for today
        if ((isSelectedToday && isBefore(slotStart, now)) || slotEnd > workdayEnd) {
          continue;
        }

        // Check if slot conflicts with existing appointments for this professional
        const hasConflict = existingAppointments.some(apt => {
          if (apt.professional_id !== selectedProfessional.id) return false;
          const aptStart = parseISO(apt.start_time);
          const aptEnd = parseISO(apt.end_time);
          return (
            (slotStart >= aptStart && slotStart < aptEnd) ||
            (slotEnd > aptStart && slotEnd <= aptEnd) ||
            (slotStart <= aptStart && slotEnd >= aptEnd)
          );
        });

        if (!hasConflict) {
          slots.push(format(slotStart, 'HH:mm'));
        }
      }
    }

    return slots;
  }, [selectedDate, selectedProfessional, selectedService, existingAppointments, serviceProfessionals, workingHours]);

  const professionalsForSelectedService = useMemo(() => {
    if (!selectedService) return professionals;
    const linkedProfessionalIds = serviceProfessionals
      .filter(sp => sp.service_id === selectedService.id)
      .map(sp => sp.professional_id);

    if (linkedProfessionalIds.length === 0) return professionals;
    return professionals.filter(prof => linkedProfessionalIds.includes(prof.id));
  }, [professionals, selectedService, serviceProfessionals]);

  const handleSelectService = (service: Service) => {
    setSelectedService(service);
    setSelectedProfessional(null);
    setSelectedDate(undefined);
    setSelectedTime(null);
    setStep('professional');
  };

  const handleSelectProfessional = (professional: Professional) => {
    setSelectedProfessional(professional);
    setStep('datetime');
  };

  const handleSelectTime = (time: string) => {
    setSelectedTime(time);
    setStep('confirm');
  };

  const handleConfirmBooking = async () => {
    if (!selectedService || !selectedProfessional || !selectedDate || !selectedTime || !clientAccount) {
      toast.error('Selecione todos os campos');
      return;
    }

    setSubmitting(true);

    try {
      const [hours, minutes] = selectedTime.split(':').map(Number);
      const startTime = setMinutes(setHours(selectedDate, hours), minutes);
      const configuredDuration = serviceProfessionals.find(sp =>
        sp.service_id === selectedService.id && sp.professional_id === selectedProfessional.id
      )?.duration_minutes;
      const duration = configuredDuration || selectedService.duration_minutes;
      const totalBlockedMinutes = duration + (selectedService.break_time_minutes || 0);
      const endTime = addMinutes(startTime, totalBlockedMinutes);

      const { data: conflicts } = await supabase
        .from('appointments')
        .select('id')
        .eq('tenant_id', tenant.id)
        .eq('professional_id', selectedProfessional.id)
        .in('status', ['scheduled', 'confirmed', 'in_progress', 'pre_scheduled'])
        .lt('start_time', endTime.toISOString())
        .gt('end_time', startTime.toISOString());

      if (conflicts && conflicts.length > 0) {
        toast.error('Horário indisponível', {
          description: 'Outro agendamento foi criado neste intervalo. Escolha outro horário.',
        });
        await fetchAppointments();
        setSubmitting(false);
        return;
      }

      const { error } = await supabase.from('appointments').insert({
        tenant_id: tenant.id,
        client_id: clientAccount.client_id,
        client_user_id: user?.id,
        professional_id: selectedProfessional.id,
        service_id: selectedService.id,
        start_time: startTime.toISOString(),
        end_time: endTime.toISOString(),
        total_value: selectedService.default_price,
        status: 'pre_scheduled',
        booking_source: 'online',
        notes: 'Pré-agendamento online - aguardando confirmação',
      });

      if (error) {
        console.error('Error creating appointment:', error);
        toast.error('Erro ao criar agendamento', {
          description: 'Tente novamente ou escolha outro horário.',
        });
        setSubmitting(false);
        return;
      }

      toast.success('Pré-agendamento realizado!', {
        description: `${format(startTime, "EEEE, dd 'de' MMMM 'às' HH:mm", { locale: ptBR })}. Aguardando confirmação do salão.`,
      });

      navigate('../meus-agendamentos');
    } catch (error) {
      console.error('Error:', error);
      toast.error('Erro inesperado');
    } finally {
      setSubmitting(false);
    }
  };

  const goBack = () => {
    if (step === 'professional') {
      setStep('service');
      setSelectedProfessional(null);
    } else if (step === 'datetime') {
      setStep('professional');
      setSelectedDate(undefined);
      setSelectedTime(null);
    } else if (step === 'confirm') {
      setStep('datetime');
      setSelectedTime(null);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Progress Indicator */}
      <div className="flex items-center justify-center gap-2 mb-6">
        {['service', 'professional', 'datetime', 'confirm'].map((s, i) => (
          <React.Fragment key={s}>
            <div
              className={cn(
                'w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors',
                step === s
                  ? 'bg-primary text-primary-foreground'
                  : ['service', 'professional', 'datetime', 'confirm'].indexOf(step) > i
                  ? 'bg-primary/20 text-primary'
                  : 'bg-muted text-muted-foreground'
              )}
            >
              {i + 1}
            </div>
            {i < 3 && (
              <div
                className={cn(
                  'w-8 h-0.5',
                  ['service', 'professional', 'datetime', 'confirm'].indexOf(step) > i
                    ? 'bg-primary'
                    : 'bg-muted'
                )}
              />
            )}
          </React.Fragment>
        ))}
      </div>

      {/* Step: Select Service */}
      {step === 'service' && (
        <Card>
          <CardHeader>
            <CardTitle>Escolha o Serviço</CardTitle>
            <CardDescription>Selecione o serviço que deseja agendar</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3">
              {services.map(service => (
                <button
                  key={service.id}
                  onClick={() => handleSelectService(service)}
                  className="flex items-center justify-between p-4 border rounded-lg hover:border-primary hover:bg-primary/5 transition-colors text-left"
                >
                  <div>
                    <h3 className="font-medium">{service.name}</h3>
                    {service.description && (
                      <p className="text-sm text-muted-foreground mt-1">{service.description}</p>
                    )}
                    <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        {service.duration_minutes} min
                      </span>
                      <span className="flex items-center gap-1">
                        <DollarSign className="h-3.5 w-3.5" />
                        {service.price_type === 'starting_at' ? 'A partir de ' : ''}
                        R$ {service.default_price.toFixed(2)}
                      </span>
                    </div>
                  </div>
                  <ArrowRight className="h-5 w-5 text-muted-foreground" />
                </button>
              ))}
              {services.length === 0 && (
                <p className="text-center text-muted-foreground py-8">
                  Nenhum serviço disponível para agendamento online.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step: Select Professional */}
      {step === 'professional' && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" onClick={goBack}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div>
                <CardTitle>Escolha o Profissional</CardTitle>
                <CardDescription>
                  Para: {selectedService?.name}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2">
              {professionalsForSelectedService.map(prof => (
                <button
                  key={prof.id}
                  onClick={() => handleSelectProfessional(prof)}
                  className="flex items-center gap-3 p-4 border rounded-lg hover:border-primary hover:bg-primary/5 transition-colors text-left"
                >
                  <Avatar className="h-12 w-12">
                    <AvatarImage src={prof.photo_url} alt={prof.name} />
                    <AvatarFallback>{(prof.nickname || prof.name).charAt(0)}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <h3 className="font-medium">{prof.nickname || prof.name}</h3>
                    <p className="text-sm text-muted-foreground">{prof.name}</p>
                  </div>
                  <ArrowRight className="h-5 w-5 text-muted-foreground" />
                </button>
              ))}
              {professionalsForSelectedService.length === 0 && (
                <p className="text-center text-muted-foreground py-8 sm:col-span-2">
                  Nenhum profissional disponível para este serviço.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step: Select Date and Time */}
      {step === 'datetime' && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" onClick={goBack}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div>
                <CardTitle>Data e Horário</CardTitle>
                <CardDescription>
                  {selectedService?.name} com {selectedProfessional?.nickname}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-6 md:grid-cols-2">
              {/* Calendar */}
              <div>
                <p className="text-sm font-medium mb-2">Escolha a data:</p>
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={setSelectedDate}
                  disabled={date => isBefore(startOfDay(date), startOfDay(new Date()))}
                  className="rounded-md border pointer-events-auto"
                  locale={ptBR}
                />
              </div>

              {/* Time Slots */}
              <div>
                <p className="text-sm font-medium mb-2">
                  {selectedDate
                    ? `Horários disponíveis em ${format(selectedDate, "dd 'de' MMMM", { locale: ptBR })}:`
                    : 'Selecione uma data primeiro'}
                </p>
                {selectedDate && (
                  <div className="grid grid-cols-3 gap-2 max-h-[300px] overflow-y-auto">
                    {availableTimeSlots.length > 0 ? (
                      availableTimeSlots.map(time => (
                        <Button
                          key={time}
                          variant="outline"
                          size="sm"
                          onClick={() => handleSelectTime(time)}
                          className="hover:bg-primary hover:text-primary-foreground"
                        >
                          {time}
                        </Button>
                      ))
                    ) : (
                      <p className="col-span-3 text-center text-muted-foreground py-4">
                        Nenhum horário disponível nesta data.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step: Confirm */}
      {step === 'confirm' && selectedService && selectedProfessional && selectedDate && selectedTime && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" onClick={goBack}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                  Confirmar Agendamento
                </CardTitle>
                <CardDescription>Revise os detalhes antes de confirmar</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="p-4 bg-muted rounded-lg space-y-3">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Serviço:</span>
                  <span className="font-medium">{selectedService.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Profissional:</span>
                  <span className="font-medium">{selectedProfessional.nickname || selectedProfessional.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Data:</span>
                  <span className="font-medium">
                    {format(selectedDate, "EEEE, dd 'de' MMMM", { locale: ptBR })}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Horário:</span>
                  <span className="font-medium">{selectedTime}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Duração:</span>
                  <span className="font-medium">
                    {(serviceProfessionals.find(sp =>
                      sp.service_id === selectedService.id && sp.professional_id === selectedProfessional.id
                    )?.duration_minutes || selectedService.duration_minutes)} minutos
                  </span>
                </div>
                <div className="border-t pt-3 flex justify-between">
                  <span className="text-muted-foreground">Valor:</span>
                  <span className="font-bold text-lg">R$ {selectedService.default_price.toFixed(2)}</span>
                </div>
              </div>

              <Button
                className="w-full"
                size="lg"
                onClick={handleConfirmBooking}
                disabled={submitting}
              >
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Confirmando...
                  </>
                ) : (
                  'Confirmar Agendamento'
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default ClientBooking;
