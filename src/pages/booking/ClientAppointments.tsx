import React, { useState, useEffect } from 'react';
import { useNavigate, useOutletContext, Link } from 'react-router-dom';
import { useClientAuth } from '@/contexts/ClientAuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Loader2, Calendar, Clock, User, Plus, X, LogOut } from 'lucide-react';
import { toast } from 'sonner';
import { format, parseISO, isFuture, isPast } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface TenantInfo {
  id: string;
  name: string;
}

interface Appointment {
  id: string;
  start_time: string;
  end_time: string;
  status: string;
  total_value?: number;
  notes?: string;
  service?: {
    name: string;
    duration_minutes: number;
  };
  professional?: {
    name: string;
    nickname: string;
    photo_url?: string;
  };
}

const statusLabels: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  pre_scheduled: { label: 'Pré-Agendado', variant: 'secondary' },
  scheduled: { label: 'Agendado', variant: 'secondary' },
  confirmed: { label: 'Confirmado', variant: 'default' },
  in_progress: { label: 'Em Atendimento', variant: 'default' },
  completed: { label: 'Concluído', variant: 'outline' },
  cancelled: { label: 'Cancelado', variant: 'destructive' },
};

const ClientAppointments: React.FC = () => {
  const navigate = useNavigate();
  const { tenant } = useOutletContext<{ tenant: TenantInfo }>();
  const { user, clientAccount, signOut, loading: authLoading } = useClientAuth();

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('../login');
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    const fetchAppointments = async () => {
      if (!user) return;

      setLoading(true);

      const { data, error } = await supabase
        .from('appointments')
        .select(`
          id,
          start_time,
          end_time,
          status,
          total_value,
          notes,
          service:services(name, duration_minutes),
          professional:professionals(name, nickname, photo_url)
        `)
        .eq('client_user_id', user.id)
        .order('start_time', { ascending: false });

      if (error) {
        console.error('Error fetching appointments:', error);
        toast.error('Erro ao carregar agendamentos');
      } else if (data) {
        // Transform to handle single objects from joins
        const transformed = data.map(apt => ({
          ...apt,
          service: Array.isArray(apt.service) ? apt.service[0] : apt.service,
          professional: Array.isArray(apt.professional) ? apt.professional[0] : apt.professional,
        }));
        setAppointments(transformed as Appointment[]);
      }

      setLoading(false);
    };

    if (user) {
      fetchAppointments();
    }
  }, [user]);

  const handleCancelAppointment = async (appointmentId: string) => {
    setCancellingId(appointmentId);

    const { error } = await supabase
      .from('appointments')
      .update({ status: 'cancelled' })
      .eq('id', appointmentId)
      .eq('client_user_id', user?.id);

    if (error) {
      console.error('Error cancelling appointment:', error);
      toast.error('Erro ao cancelar agendamento');
    } else {
      toast.success('Agendamento cancelado');
      setAppointments(prev =>
        prev.map(apt => (apt.id === appointmentId ? { ...apt, status: 'cancelled' } : apt))
      );
    }

    setCancellingId(null);
  };

  const handleLogout = async () => {
    await signOut();
    navigate('../login');
  };

  const upcomingAppointments = appointments.filter(
    apt => isFuture(parseISO(apt.start_time)) && apt.status !== 'cancelled' && apt.status !== 'completed'
  );

  const pastAppointments = appointments.filter(
    apt => isPast(parseISO(apt.start_time)) || apt.status === 'cancelled' || apt.status === 'completed'
  );

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const AppointmentCard = ({ apt, canCancel = false }: { apt: Appointment; canCancel?: boolean }) => {
    const status = statusLabels[apt.status] || { label: apt.status, variant: 'outline' as const };

    return (
      <Card>
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 space-y-2">
              <div className="flex items-center gap-2">
                <Badge variant={status.variant}>{status.label}</Badge>
              </div>
              
              <h3 className="font-medium">{apt.service?.name || 'Serviço'}</h3>
              
              <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" />
                  {format(parseISO(apt.start_time), "dd 'de' MMMM", { locale: ptBR })}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  {format(parseISO(apt.start_time), 'HH:mm')}
                </span>
                <span className="flex items-center gap-1">
                  <User className="h-3.5 w-3.5" />
                  {apt.professional?.nickname || apt.professional?.name || 'Profissional'}
                </span>
              </div>

              {apt.total_value && (
                <p className="text-sm font-medium">R$ {apt.total_value.toFixed(2)}</p>
              )}
            </div>

            {canCancel && (apt.status === 'scheduled' || apt.status === 'confirmed' || apt.status === 'pre_scheduled') && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Cancelar agendamento?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Você tem certeza que deseja cancelar este agendamento? Esta ação não pode ser
                      desfeita.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Manter</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => handleCancelAppointment(apt.id)}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      {cancellingId === apt.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        'Cancelar Agendamento'
                      )}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Meus Agendamentos</h1>
          <p className="text-muted-foreground">Gerencie seus horários em {tenant.name}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild>
            <Link to="../agendar">
              <Plus className="h-4 w-4 mr-2" />
              Novo Agendamento
            </Link>
          </Button>
          <Button variant="outline" size="icon" onClick={handleLogout} title="Sair">
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Tabs defaultValue="upcoming" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="upcoming">
            Próximos ({upcomingAppointments.length})
          </TabsTrigger>
          <TabsTrigger value="past">
            Histórico ({pastAppointments.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="upcoming" className="space-y-4 mt-4">
          {upcomingAppointments.length > 0 ? (
            upcomingAppointments.map(apt => (
              <AppointmentCard key={apt.id} apt={apt} canCancel />
            ))
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <Calendar className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="font-medium mb-2">Nenhum agendamento futuro</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Que tal agendar um horário?
                </p>
                <Button asChild>
                  <Link to="../agendar">
                    <Plus className="h-4 w-4 mr-2" />
                    Agendar Agora
                  </Link>
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="past" className="space-y-4 mt-4">
          {pastAppointments.length > 0 ? (
            pastAppointments.map(apt => <AppointmentCard key={apt.id} apt={apt} />)
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <Calendar className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="font-medium mb-2">Nenhum histórico</h3>
                <p className="text-sm text-muted-foreground">
                  Seus agendamentos anteriores aparecerão aqui.
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ClientAppointments;
