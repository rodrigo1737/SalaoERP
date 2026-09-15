CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE TABLE public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth_key text NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

CREATE INDEX push_subscriptions_user_active_idx
  ON public.push_subscriptions (user_id, tenant_id)
  WHERE revoked_at IS NULL;

CREATE INDEX push_subscriptions_tenant_idx
  ON public.push_subscriptions (tenant_id);

CREATE TABLE public.user_notification_preferences (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  appointment_reminders_enabled boolean NOT NULL DEFAULT true,
  appointment_reminder_minutes smallint NOT NULL DEFAULT 10
    CHECK (appointment_reminder_minutes IN (5, 10, 15, 20, 25, 30)),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, user_id)
);

CREATE INDEX user_notification_preferences_user_idx
  ON public.user_notification_preferences (user_id);

CREATE TABLE public.appointment_reminder_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  appointment_id uuid NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subscription_id uuid NOT NULL REFERENCES public.push_subscriptions(id) ON DELETE CASCADE,
  appointment_start_time timestamptz NOT NULL,
  reminder_minutes smallint NOT NULL,
  status text NOT NULL DEFAULT 'processing'
    CHECK (status IN ('processing', 'sent', 'failed')),
  attempts smallint NOT NULL DEFAULT 1 CHECK (attempts BETWEEN 1 AND 3),
  attempted_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  error_code text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (appointment_id, subscription_id, appointment_start_time)
);

CREATE INDEX appointment_reminder_deliveries_status_idx
  ON public.appointment_reminder_deliveries (status, attempted_at);

CREATE INDEX appointment_reminder_deliveries_subscription_idx
  ON public.appointment_reminder_deliveries (subscription_id);

CREATE INDEX appointment_reminder_deliveries_user_idx
  ON public.appointment_reminder_deliveries (user_id);

CREATE INDEX appointment_reminder_deliveries_tenant_idx
  ON public.appointment_reminder_deliveries (tenant_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointment_reminder_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own push subscriptions"
ON public.push_subscriptions
FOR SELECT TO authenticated
USING (
  user_id = (SELECT auth.uid())
  AND tenant_id = (SELECT public.get_user_tenant_id(auth.uid()))
);

CREATE POLICY "Users can create their own push subscriptions"
ON public.push_subscriptions
FOR INSERT TO authenticated
WITH CHECK (
  user_id = (SELECT auth.uid())
  AND tenant_id = (SELECT public.get_user_tenant_id(auth.uid()))
);

CREATE POLICY "Users can update their own push subscriptions"
ON public.push_subscriptions
FOR UPDATE TO authenticated
USING (
  user_id = (SELECT auth.uid())
  AND tenant_id = (SELECT public.get_user_tenant_id(auth.uid()))
)
WITH CHECK (
  user_id = (SELECT auth.uid())
  AND tenant_id = (SELECT public.get_user_tenant_id(auth.uid()))
);

CREATE POLICY "Users can delete their own push subscriptions"
ON public.push_subscriptions
FOR DELETE TO authenticated
USING (
  user_id = (SELECT auth.uid())
  AND tenant_id = (SELECT public.get_user_tenant_id(auth.uid()))
);

CREATE POLICY "Users can view their notification preferences"
ON public.user_notification_preferences
FOR SELECT TO authenticated
USING (
  user_id = (SELECT auth.uid())
  AND tenant_id = (SELECT public.get_user_tenant_id(auth.uid()))
);

CREATE POLICY "Users can create their notification preferences"
ON public.user_notification_preferences
FOR INSERT TO authenticated
WITH CHECK (
  user_id = (SELECT auth.uid())
  AND tenant_id = (SELECT public.get_user_tenant_id(auth.uid()))
);

CREATE POLICY "Users can update their notification preferences"
ON public.user_notification_preferences
FOR UPDATE TO authenticated
USING (
  user_id = (SELECT auth.uid())
  AND tenant_id = (SELECT public.get_user_tenant_id(auth.uid()))
)
WITH CHECK (
  user_id = (SELECT auth.uid())
  AND tenant_id = (SELECT public.get_user_tenant_id(auth.uid()))
);

REVOKE ALL ON public.push_subscriptions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.user_notification_preferences FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.appointment_reminder_deliveries FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.user_notification_preferences TO authenticated;
GRANT ALL ON public.push_subscriptions TO service_role;
GRANT ALL ON public.user_notification_preferences TO service_role;
GRANT ALL ON public.appointment_reminder_deliveries TO service_role;

CREATE OR REPLACE FUNCTION private.invoke_appointment_reminder_dispatch()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  project_url text;
  cron_secret text;
BEGIN
  SELECT decrypted_secret
    INTO project_url
    FROM vault.decrypted_secrets
   WHERE name = 'project_url'
   LIMIT 1;

  SELECT decrypted_secret
    INTO cron_secret
    FROM vault.decrypted_secrets
   WHERE name = 'appointment_reminder_cron_secret'
   LIMIT 1;

  IF project_url IS NULL OR cron_secret IS NULL THEN
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := rtrim(project_url, '/') || '/functions/v1/send-appointment-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', cron_secret
    ),
    body := jsonb_build_object('invoked_at', now()),
    timeout_milliseconds := 10000
  );
END;
$$;

REVOKE ALL ON FUNCTION private.invoke_appointment_reminder_dispatch() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.invoke_appointment_reminder_dispatch() TO postgres, service_role;

DO $$
DECLARE
  existing_job_id bigint;
BEGIN
  SELECT jobid
    INTO existing_job_id
    FROM cron.job
   WHERE jobname = 'send-appointment-reminders-every-minute'
   LIMIT 1;

  IF existing_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(existing_job_id);
  END IF;

  PERFORM cron.schedule(
    'send-appointment-reminders-every-minute',
    '* * * * *',
    'SELECT private.invoke_appointment_reminder_dispatch();'
  );
END;
$$;
