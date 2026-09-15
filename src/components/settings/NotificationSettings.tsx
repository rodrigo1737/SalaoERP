import { useCallback, useEffect, useState } from 'react';
import { Bell, BellOff, CheckCircle2, Download, Loader2, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  createPushSubscription,
  getCurrentPushSubscription,
  isIosDevice,
  isStandaloneWebApp,
  serializePushSubscription,
  supportsWebPush,
} from '@/lib/pushNotifications';

const REMINDER_OPTIONS = [5, 10, 15, 20, 25, 30] as const;

export function NotificationSettings() {
  const { user, tenantId, currentProfessional } = useAuth();
  const [reminderMinutes, setReminderMinutes] = useState(10);
  const [enabled, setEnabled] = useState(true);
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
          .select('appointment_reminders_enabled, appointment_reminder_minutes')
          .eq('tenant_id', tenantId)
          .eq('user_id', user.id)
          .maybeSingle(),
        getCurrentPushSubscription().catch(() => null),
      ]);

      if (preferenceError) throw preferenceError;
      if (preference) {
        setEnabled(preference.appointment_reminders_enabled);
        setReminderMinutes(preference.appointment_reminder_minutes);
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

  const savePreference = async (minutes: number, remindersEnabled = enabled) => {
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
      await savePreference(minutes);
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

      await savePreference(reminderMinutes, true);
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
      </CardContent>
    </Card>
  );
}
