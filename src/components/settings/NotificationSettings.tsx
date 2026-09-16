import { useCallback, useEffect, useState } from 'react';
import { Bell, BellOff, CalendarDays, CheckCircle2, Clock3, Download, Loader2, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  createPushSubscription,
  getCurrentPushSubscription,
  isIosDevice,
  isStandaloneWebApp,
  serializePushSubscription,
  supportsWebPush,
} from '@/lib/pushNotifications';

const REMINDER_OPTIONS = [5, 10, 15, 20, 25, 30] as const;
const WEEKDAYS = [
  { value: 1, label: 'Seg' },
  { value: 2, label: 'Ter' },
  { value: 3, label: 'Qua' },
  { value: 4, label: 'Qui' },
  { value: 5, label: 'Sex' },
  { value: 6, label: 'Sáb' },
  { value: 7, label: 'Dom' },
] as const;

export function NotificationSettings() {
  const { user, tenantId, currentProfessional } = useAuth();
  const [reminderMinutes, setReminderMinutes] = useState(10);
  const [enabled, setEnabled] = useState(true);
  const [newAppointmentEnabled, setNewAppointmentEnabled] = useState(false);
  const [dailySummaryEnabled, setDailySummaryEnabled] = useState(false);
  const [dailySummaryTime, setDailySummaryTime] = useState('07:00');
  const [dailySummaryWeekdays, setDailySummaryWeekdays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [deviceEnabled, setDeviceEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const pushSupported = supportsWebPush();
  const requiresIosInstall = isIosDevice() && !isStandaloneWebApp();
  const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY?.trim() ?? '';

  const loadSettings = useCallback(async () => {
    if (!user || !tenantId) return;
    setLoading(true);

    try {
      const [{ data: preference, error: preferenceError }, subscription] = await Promise.all([
        supabase
          .from('user_notification_preferences')
          .select('appointment_reminders_enabled, appointment_reminder_minutes, daily_summary_enabled, daily_summary_time, daily_summary_weekdays, new_appointment_push_enabled')
          .eq('tenant_id', tenantId)
          .eq('user_id', user.id)
          .maybeSingle(),
        getCurrentPushSubscription().catch(() => null),
      ]);

      if (preferenceError) throw preferenceError;
      if (preference) {
        setEnabled(preference.appointment_reminders_enabled);
        setNewAppointmentEnabled(preference.new_appointment_push_enabled);
        setReminderMinutes(preference.appointment_reminder_minutes);
        setDailySummaryEnabled(preference.daily_summary_enabled);
        setDailySummaryTime(preference.daily_summary_time.slice(0, 5));
        setDailySummaryWeekdays(preference.daily_summary_weekdays);
      }

      if (subscription) {
        const { data: registeredSubscription, error: subscriptionError } = await supabase
          .from('push_subscriptions')
          .select('id')
          .eq('tenant_id', tenantId)
          .eq('user_id', user.id)
          .eq('endpoint', subscription.endpoint)
          .is('revoked_at', null)
          .maybeSingle();
        if (subscriptionError) throw subscriptionError;
        setDeviceEnabled(Boolean(registeredSubscription));
      } else {
        setDeviceEnabled(false);
      }
    } catch (error) {
      console.error('Error loading notification settings:', error);
      toast.error('Não foi possível carregar as configurações de notificação.');
    } finally {
      setLoading(false);
    }
  }, [tenantId, user]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const saveAppointmentPreference = async (minutes: number, remindersEnabled = enabled) => {
    if (!user || !tenantId) return;
    const { error } = await supabase
      .from('user_notification_preferences')
      .upsert({
        tenant_id: tenantId,
        user_id: user.id,
        appointment_reminders_enabled: remindersEnabled,
        appointment_reminder_minutes: minutes,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'tenant_id,user_id' });
    if (error) throw error;
  };

  const handleMinutesChange = async (value: string) => {
    const minutes = Number(value);
    setReminderMinutes(minutes);
    setSaving(true);
    try {
      await saveAppointmentPreference(minutes);
      toast.success(`Aviso configurado para ${minutes} minutos antes.`);
    } catch (error) {
      console.error('Error saving reminder interval:', error);
      toast.error('Não foi possível salvar o tempo do aviso.');
      await loadSettings();
    } finally {
      setSaving(false);
    }
  };

  const handleEnableDevice = async () => {
    if (!user || !tenantId || requiresIosInstall) return;
    setSaving(true);

    try {
      const subscription = await createPushSubscription(vapidPublicKey);
      const serialized = serializePushSubscription(subscription);
      if (!serialized.p256dh || !serialized.auth_key) throw new Error('Assinatura push incompleta.');

      const { error } = await supabase.from('push_subscriptions').upsert({
        tenant_id: tenantId,
        user_id: user.id,
        ...serialized,
        user_agent: navigator.userAgent,
        last_seen_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        revoked_at: null,
      }, { onConflict: 'endpoint' });
      if (error) throw error;

      await saveAppointmentPreference(reminderMinutes, true);
      setEnabled(true);
      setDeviceEnabled(true);
      toast.success('Notificações ativadas neste aparelho.');
    } catch (error) {
      console.error('Error enabling push notifications:', error);
      toast.error(error instanceof Error ? error.message : 'Não foi possível ativar as notificações.');
    } finally {
      setSaving(false);
    }
  };

  const handleWeekdayToggle = (weekday: number) => {
    if (dailySummaryWeekdays.length === 1 && dailySummaryWeekdays.includes(weekday)) {
      toast.error('Escolha pelo menos um dia da semana.');
      return;
    }
    setDailySummaryWeekdays((current) => (
      current.includes(weekday)
        ? current.filter((value) => value !== weekday)
        : [...current, weekday].sort((a, b) => a - b)
    ));
  };

  const handleNewAppointmentChange = async (checked: boolean) => {
    if (!user || !tenantId) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('user_notification_preferences').upsert({
        tenant_id: tenantId,
        user_id: user.id,
        new_appointment_push_enabled: checked,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'tenant_id,user_id' });
      if (error) throw error;
      setNewAppointmentEnabled(checked);
      toast.success(checked ? 'Avisos de novos agendamentos ativados.' : 'Avisos de novos agendamentos desativados.');
    } catch {
      toast.error('Não foi possível salvar a preferência.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveDailySummary = async () => {
    if (!user || !tenantId) return;
    if (dailySummaryEnabled && dailySummaryWeekdays.length === 0) {
      toast.error('Escolha pelo menos um dia da semana.');
      return;
    }
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(dailySummaryTime)) {
      toast.error('Informe um horário válido para o resumo.');
      return;
    }

    setSaving(true);
    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo';
      const { error } = await supabase
        .from('user_notification_preferences')
        .upsert({
          tenant_id: tenantId,
          user_id: user.id,
          daily_summary_enabled: dailySummaryEnabled,
          daily_summary_time: dailySummaryTime,
          daily_summary_weekdays: dailySummaryWeekdays,
          notification_timezone: timezone,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'tenant_id,user_id' });
      if (error) throw error;

      toast.success(dailySummaryEnabled
        ? `Resumo diário configurado para ${dailySummaryTime}.`
        : 'Resumo diário desativado.');
    } catch (error) {
      console.error('Error saving daily summary settings:', error);
      toast.error('Não foi possível salvar o resumo diário.');
      await loadSettings();
    } finally {
      setSaving(false);
    }
  };

  const handleDisableDevice = async () => {
    if (!user || !tenantId) return;
    setSaving(true);

    try {
      const subscription = await getCurrentPushSubscription();
      if (subscription) {
        const { error } = await supabase
          .from('push_subscriptions')
          .update({ revoked_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq('tenant_id', tenantId)
          .eq('user_id', user.id)
          .eq('endpoint', subscription.endpoint);
        if (error) throw error;
        await subscription.unsubscribe();
      }

      setDeviceEnabled(false);
      toast.success('Notificações desativadas neste aparelho.');
    } catch (error) {
      console.error('Error disabling push notifications:', error);
      toast.error('Não foi possível desativar as notificações.');
    } finally {
      setSaving(false);
    }
  };

  if (!currentProfessional) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Bell className="h-5 w-5" /> Notificações</CardTitle>
          <CardDescription>Os avisos de agenda estão disponíveis para usuários vinculados a um profissional.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Bell className="h-5 w-5" /> Avisos da agenda</CardTitle>
        <CardDescription>
          Receba no celular o nome do cliente, horário e procedimento antes de cada atendimento.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="rounded-lg border p-4">
          <div className="flex items-start gap-3">
            <Smartphone className="mt-0.5 h-5 w-5 text-primary" />
            <div className="flex-1 space-y-1">
              <p className="font-medium">Este aparelho</p>
              <p className="text-sm text-muted-foreground">
                {deviceEnabled ? 'Autorizado para receber notificações.' : 'Ainda não está autorizado.'}
              </p>
            </div>
            {deviceEnabled && <CheckCircle2 className="h-5 w-5 text-emerald-600" />}
          </div>

          {requiresIosInstall && (
            <div className="mt-4 rounded-md bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
              <p className="flex items-center gap-2 font-medium"><Download className="h-4 w-4" /> Instale no iPhone primeiro</p>
              <p className="mt-1">No Safari, toque em Compartilhar → Adicionar à Tela de Início. Depois abra pelo novo ícone e volte aqui.</p>
            </div>
          )}

          {!pushSupported && !requiresIosInstall && (
            <p className="mt-4 text-sm text-destructive">Este navegador não oferece suporte a notificações push.</p>
          )}

          {!vapidPublicKey && (
            <p className="mt-4 text-sm text-destructive">As chaves de notificação ainda não foram configuradas no sistema.</p>
          )}

          <Button
            className="mt-4"
            variant={deviceEnabled ? 'outline' : 'default'}
            onClick={deviceEnabled ? handleDisableDevice : handleEnableDevice}
            disabled={loading || saving || !pushSupported || requiresIosInstall || (!deviceEnabled && !vapidPublicKey)}
          >
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : deviceEnabled ? <BellOff className="mr-2 h-4 w-4" /> : <Bell className="mr-2 h-4 w-4" />}
            {deviceEnabled ? 'Desativar neste aparelho' : 'Ativar neste aparelho'}
          </Button>
        </div>

        <div className="flex items-start justify-between gap-4 rounded-lg border p-4">
          <div>
            <Label htmlFor="new-appointment-push">Receber aviso de novo agendamento</Label>
            <p className="mt-1 text-sm text-muted-foreground">Receba o cliente, a data, o horário e os procedimentos quando incluírem um atendimento na sua agenda.</p>
          </div>
          <Switch id="new-appointment-push" checked={newAppointmentEnabled} onCheckedChange={handleNewAppointmentChange} disabled={loading || saving} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="appointment-reminder-minutes">Avisar antes do atendimento</Label>
          <Select value={String(reminderMinutes)} onValueChange={handleMinutesChange} disabled={loading || saving}>
            <SelectTrigger id="appointment-reminder-minutes" className="w-full sm:w-64">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {REMINDER_OPTIONS.map((minutes) => (
                <SelectItem key={minutes} value={String(minutes)}>{minutes} minutos antes</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-sm text-muted-foreground">A preferência vale para todos os aparelhos autorizados deste usuário.</p>
        </div>

        <div className="space-y-4 rounded-lg border p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <CalendarDays className="mt-0.5 h-5 w-5 text-primary" />
              <div>
                <Label htmlFor="daily-schedule-summary" className="text-base">Resumo da agenda do dia</Label>
                <p className="mt-1 text-sm text-muted-foreground">
                  Receba uma lista com os horários e nomes dos clientes previstos para o dia.
                </p>
              </div>
            </div>
            <Switch
              id="daily-schedule-summary"
              checked={dailySummaryEnabled}
              onCheckedChange={setDailySummaryEnabled}
              disabled={loading || saving}
            />
          </div>

          <div className="space-y-2">
            <Label>Dias de envio</Label>
            <div className="flex flex-wrap gap-2">
              {WEEKDAYS.map((weekday) => {
                const selected = dailySummaryWeekdays.includes(weekday.value);
                return (
                  <Button
                    key={weekday.value}
                    type="button"
                    size="sm"
                    variant={selected ? 'default' : 'outline'}
                    aria-pressed={selected}
                    onClick={() => handleWeekdayToggle(weekday.value)}
                    disabled={loading || saving || !dailySummaryEnabled}
                  >
                    {weekday.label}
                  </Button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="daily-summary-time" className="flex items-center gap-2">
              <Clock3 className="h-4 w-4" /> Horário do resumo
            </Label>
            <Input
              id="daily-summary-time"
              type="time"
              value={dailySummaryTime}
              onChange={(event) => setDailySummaryTime(event.target.value)}
              className="w-full sm:w-48"
              disabled={loading || saving || !dailySummaryEnabled}
            />
          </div>

          <Button type="button" onClick={handleSaveDailySummary} disabled={loading || saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salvar resumo diário
          </Button>
          <p className="text-sm text-muted-foreground">
            O horário considera o fuso deste aparelho. Se não houver atendimentos, você também receberá essa informação.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
