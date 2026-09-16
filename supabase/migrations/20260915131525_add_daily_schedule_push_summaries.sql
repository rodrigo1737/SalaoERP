ALTER TABLE public.user_notification_preferences
  ADD COLUMN daily_summary_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN daily_summary_time time without time zone NOT NULL DEFAULT '07:00',
  ADD COLUMN daily_summary_weekdays smallint[] NOT NULL DEFAULT ARRAY[1, 2, 3, 4, 5]::smallint[],
  ADD COLUMN notification_timezone text NOT NULL DEFAULT 'America/Sao_Paulo';

ALTER TABLE public.user_notification_preferences
  ADD CONSTRAINT user_notification_preferences_daily_summary_weekdays_check
  CHECK (
    cardinality(daily_summary_weekdays) BETWEEN 1 AND 7
    AND daily_summary_weekdays <@ ARRAY[1, 2, 3, 4, 5, 6, 7]::smallint[]
  ),
  ADD CONSTRAINT user_notification_preferences_notification_timezone_check
  CHECK (length(notification_timezone) BETWEEN 1 AND 100);

CREATE INDEX user_notification_preferences_daily_summary_enabled_idx
  ON public.user_notification_preferences (tenant_id, user_id)
  WHERE daily_summary_enabled = true;

CREATE TABLE public.daily_schedule_summary_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subscription_id uuid NOT NULL REFERENCES public.push_subscriptions(id) ON DELETE CASCADE,
  summary_date date NOT NULL,
  status text NOT NULL DEFAULT 'processing'
    CHECK (status IN ('processing', 'sent', 'failed')),
  attempts smallint NOT NULL DEFAULT 1 CHECK (attempts BETWEEN 1 AND 3),
  attempted_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  error_code text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, subscription_id, summary_date)
);

CREATE INDEX daily_schedule_summary_deliveries_subscription_idx
  ON public.daily_schedule_summary_deliveries (subscription_id);

CREATE INDEX daily_schedule_summary_deliveries_tenant_idx
  ON public.daily_schedule_summary_deliveries (tenant_id);

ALTER TABLE public.daily_schedule_summary_deliveries ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.daily_schedule_summary_deliveries FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.daily_schedule_summary_deliveries TO service_role;
