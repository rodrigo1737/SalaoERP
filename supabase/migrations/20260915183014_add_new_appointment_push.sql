ALTER TABLE public.user_notification_preferences
  ADD COLUMN new_appointment_push_enabled boolean NOT NULL DEFAULT false;

CREATE TABLE public.new_appointment_push_deliveries
  (LIKE public.appointment_reminder_deliveries INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES);
ALTER TABLE public.new_appointment_push_deliveries
  ADD FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE,
  ADD FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD FOREIGN KEY (appointment_id) REFERENCES public.appointments(id) ON DELETE CASCADE,
  ADD FOREIGN KEY (subscription_id) REFERENCES public.push_subscriptions(id) ON DELETE CASCADE;
ALTER TABLE public.new_appointment_push_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.new_appointment_push_deliveries FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.new_appointment_push_deliveries TO service_role;

CREATE OR REPLACE FUNCTION private.notify_new_appointment_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  project_url text;
  cron_secret text;
  target_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'appointments' THEN
    target_id := NEW.id;
  ELSE
    target_id := NEW.appointment_id;
  END IF;
  -- Service rows can also arrive in a separate transaction. Repeated invocations
  -- are deduplicated per appointment and device by the delivery table.
  IF NOT EXISTS (
    SELECT 1 FROM public.appointments a
    WHERE a.id = target_id AND a.deleted_at IS NULL
      AND a.status IN ('scheduled', 'confirmed') AND a.start_time > now()
      AND a.created_at >= now() - interval '5 minutes'
  ) THEN
    RETURN NEW;
  END IF;
  SELECT decrypted_secret INTO project_url FROM vault.decrypted_secrets WHERE name = 'project_url' LIMIT 1;
  SELECT decrypted_secret INTO cron_secret FROM vault.decrypted_secrets WHERE name = 'appointment_reminder_cron_secret' LIMIT 1;
  IF project_url IS NOT NULL AND cron_secret IS NOT NULL THEN
    PERFORM net.http_post(
      url := rtrim(project_url, '/') || '/functions/v1/send-appointment-reminders',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', cron_secret),
      body := jsonb_build_object('type', 'new_appointment', 'appointmentId', target_id),
      timeout_milliseconds := 10000
    );
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.notify_new_appointment_push() FROM PUBLIC, anon, authenticated;

CREATE CONSTRAINT TRIGGER notify_new_appointment_push
AFTER INSERT ON public.appointments DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION private.notify_new_appointment_push();

CREATE CONSTRAINT TRIGGER notify_new_appointment_service_push
AFTER INSERT ON public.appointment_services DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION private.notify_new_appointment_push();
