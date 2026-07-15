CREATE TABLE IF NOT EXISTS public.appointment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  appointment_id uuid NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  previous_status text,
  next_status text,
  snapshot jsonb,
  metadata jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_appointment_events_tenant_created
  ON public.appointment_events (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_appointment_events_appointment
  ON public.appointment_events (appointment_id, created_at DESC);

ALTER TABLE public.appointment_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant appointment events are viewable by staff" ON public.appointment_events;
CREATE POLICY "Tenant appointment events are viewable by staff"
ON public.appointment_events
FOR SELECT
USING (
  tenant_id IS NOT NULL
  AND (
    public.has_role(auth.uid(), 'admin', tenant_id)
    OR public.has_permission(auth.uid(), 'view_schedule', tenant_id)
    OR public.has_permission(auth.uid(), 'edit_schedule', tenant_id)
    OR public.has_permission(auth.uid(), 'close_bill', tenant_id)
    OR public.has_permission(auth.uid(), 'manage_cash_flow', tenant_id)
    OR public.has_permission(auth.uid(), 'refund_bill', tenant_id)
    OR public.has_permission(auth.uid(), 'view_financial_history', tenant_id)
    OR public.has_permission(auth.uid(), 'reverse_financial_entries', tenant_id)
  )
);

DROP POLICY IF EXISTS "Tenant appointment events are insertable by schedule staff" ON public.appointment_events;
CREATE POLICY "Tenant appointment events are insertable by schedule staff"
ON public.appointment_events
FOR INSERT
WITH CHECK (
  tenant_id IS NOT NULL
  AND public.can_tenant_modify(tenant_id)
  AND (
    public.has_role(auth.uid(), 'admin', tenant_id)
    OR public.has_permission(auth.uid(), 'edit_schedule', tenant_id)
    OR public.has_permission(auth.uid(), 'close_bill', tenant_id)
    OR public.has_permission(auth.uid(), 'manage_cash_flow', tenant_id)
    OR public.has_permission(auth.uid(), 'refund_bill', tenant_id)
    OR public.has_permission(auth.uid(), 'reverse_financial_entries', tenant_id)
  )
);

CREATE TABLE IF NOT EXISTS public.financial_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  transaction_id uuid REFERENCES public.transactions(id) ON DELETE SET NULL,
  cash_session_id uuid REFERENCES public.cash_sessions(id) ON DELETE SET NULL,
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
  commission_id uuid REFERENCES public.commissions(id) ON DELETE SET NULL,
  action_type text NOT NULL,
  entity_type text NOT NULL,
  description text NOT NULL,
  before_state jsonb,
  after_state jsonb,
  metadata jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_financial_audit_logs_tenant_created
  ON public.financial_audit_logs (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_financial_audit_logs_transaction
  ON public.financial_audit_logs (transaction_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_financial_audit_logs_appointment
  ON public.financial_audit_logs (appointment_id, created_at DESC);

ALTER TABLE public.financial_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant financial audit logs are viewable by finance staff" ON public.financial_audit_logs;
CREATE POLICY "Tenant financial audit logs are viewable by finance staff"
ON public.financial_audit_logs
FOR SELECT
USING (
  tenant_id IS NOT NULL
  AND (
    public.has_role(auth.uid(), 'admin', tenant_id)
    OR public.has_permission(auth.uid(), 'manage_cash_flow', tenant_id)
    OR public.has_permission(auth.uid(), 'view_financial_history', tenant_id)
    OR public.has_permission(auth.uid(), 'refund_bill', tenant_id)
    OR public.has_permission(auth.uid(), 'reverse_financial_entries', tenant_id)
  )
);

DROP POLICY IF EXISTS "Tenant financial audit logs are insertable by finance staff" ON public.financial_audit_logs;
CREATE POLICY "Tenant financial audit logs are insertable by finance staff"
ON public.financial_audit_logs
FOR INSERT
WITH CHECK (
  tenant_id IS NOT NULL
  AND public.can_tenant_modify(tenant_id)
  AND (
    public.has_role(auth.uid(), 'admin', tenant_id)
    OR public.has_permission(auth.uid(), 'manage_cash_flow', tenant_id)
    OR public.has_permission(auth.uid(), 'close_bill', tenant_id)
    OR public.has_permission(auth.uid(), 'refund_bill', tenant_id)
    OR public.has_permission(auth.uid(), 'reverse_financial_entries', tenant_id)
  )
);

DO $$
DECLARE
  synced_table text;
BEGIN
  FOREACH synced_table IN ARRAY ARRAY[
    'appointment_events',
    'financial_audit_logs'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = synced_table
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', synced_table);
    END IF;
  END LOOP;
END $$;
