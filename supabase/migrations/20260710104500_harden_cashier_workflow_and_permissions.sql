ALTER TABLE public.cash_sessions
  ADD COLUMN IF NOT EXISTS closed_by uuid,
  ADD COLUMN IF NOT EXISTS divergence_reason text,
  ADD COLUMN IF NOT EXISTS is_late_closure boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.cash_session_is_same_business_day(_opened_at timestamptz)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT timezone('America/Sao_Paulo', _opened_at)::date = timezone('America/Sao_Paulo', now())::date;
$$;

UPDATE public.cash_sessions
SET is_late_closure = true
WHERE status = 'closed'
  AND closed_at IS NOT NULL
  AND timezone('America/Sao_Paulo', closed_at)::date > timezone('America/Sao_Paulo', opened_at)::date;

DROP POLICY IF EXISTS "Tenant cash sessions can be viewed by cashier staff" ON public.cash_sessions;
DROP POLICY IF EXISTS "Tenant cash sessions can be managed by cashier staff" ON public.cash_sessions;
DROP POLICY IF EXISTS "Tenant cash sessions can be viewed by finance history staff" ON public.cash_sessions;
DROP POLICY IF EXISTS "Tenant cash sessions can be inserted by cashier staff" ON public.cash_sessions;
DROP POLICY IF EXISTS "Tenant cash sessions can be updated by authorized staff" ON public.cash_sessions;

CREATE POLICY "Tenant cash sessions can be viewed by authorized staff"
ON public.cash_sessions
FOR SELECT
USING (
  tenant_id IS NOT NULL
  AND (
    public.has_role(auth.uid(), 'admin', tenant_id)
    OR public.has_permission(auth.uid(), 'manage_cash_flow', tenant_id)
    OR public.has_permission(auth.uid(), 'view_financial_history', tenant_id)
    OR public.has_permission(auth.uid(), 'reverse_financial_entries', tenant_id)
  )
);

CREATE POLICY "Tenant cash sessions can be inserted by cashier staff"
ON public.cash_sessions
FOR INSERT
WITH CHECK (
  tenant_id IS NOT NULL
  AND public.can_tenant_modify(tenant_id)
  AND (
    public.has_role(auth.uid(), 'admin', tenant_id)
    OR public.has_permission(auth.uid(), 'manage_cash_flow', tenant_id)
    OR public.has_permission(auth.uid(), 'reverse_financial_entries', tenant_id)
  )
);

CREATE POLICY "Tenant cash sessions can be updated by authorized staff"
ON public.cash_sessions
FOR UPDATE
USING (
  tenant_id IS NOT NULL
  AND public.can_tenant_modify(tenant_id)
  AND (
    public.has_role(auth.uid(), 'admin', tenant_id)
    OR public.has_permission(auth.uid(), 'reverse_financial_entries', tenant_id)
    OR (
      public.has_permission(auth.uid(), 'manage_cash_flow', tenant_id)
      AND public.cash_session_is_same_business_day(opened_at)
    )
  )
)
WITH CHECK (
  tenant_id IS NOT NULL
  AND public.can_tenant_modify(tenant_id)
  AND (
    public.has_role(auth.uid(), 'admin', tenant_id)
    OR public.has_permission(auth.uid(), 'reverse_financial_entries', tenant_id)
    OR (
      public.has_permission(auth.uid(), 'manage_cash_flow', tenant_id)
      AND public.cash_session_is_same_business_day(opened_at)
    )
  )
);

DROP POLICY IF EXISTS "Tenant transactions can be viewed by cashier staff" ON public.transactions;
DROP POLICY IF EXISTS "Tenant transactions can be inserted by cashier staff" ON public.transactions;
DROP POLICY IF EXISTS "Tenant transactions can be updated for refunds" ON public.transactions;
DROP POLICY IF EXISTS "Tenant transactions can be viewed by finance history staff" ON public.transactions;
DROP POLICY IF EXISTS "Tenant transactions can be inserted by finance history staff" ON public.transactions;
DROP POLICY IF EXISTS "Tenant transactions can be updated by finance history staff" ON public.transactions;

CREATE POLICY "Tenant transactions can be viewed by authorized staff"
ON public.transactions
FOR SELECT
USING (
  tenant_id IS NOT NULL
  AND (
    public.has_role(auth.uid(), 'admin', tenant_id)
    OR public.has_permission(auth.uid(), 'manage_cash_flow', tenant_id)
    OR public.has_permission(auth.uid(), 'refund_bill', tenant_id)
    OR public.has_permission(auth.uid(), 'view_financial_history', tenant_id)
    OR public.has_permission(auth.uid(), 'reverse_financial_entries', tenant_id)
  )
);

CREATE POLICY "Tenant transactions can be inserted by authorized staff"
ON public.transactions
FOR INSERT
WITH CHECK (
  tenant_id IS NOT NULL
  AND public.can_tenant_modify(tenant_id)
  AND (
    public.has_role(auth.uid(), 'admin', tenant_id)
    OR public.has_permission(auth.uid(), 'reverse_financial_entries', tenant_id)
    OR (
      public.has_permission(auth.uid(), 'manage_cash_flow', tenant_id)
      AND reference_type = 'appointment'
      AND reference_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.appointments AS appointment
        WHERE appointment.id::text = transactions.reference_id
          AND appointment.tenant_id = transactions.tenant_id
      )
    )
  )
);

CREATE POLICY "Tenant transactions can be updated for financial corrections"
ON public.transactions
FOR UPDATE
USING (
  tenant_id IS NOT NULL
  AND public.can_tenant_modify(tenant_id)
  AND (
    public.has_role(auth.uid(), 'admin', tenant_id)
    OR public.has_permission(auth.uid(), 'refund_bill', tenant_id)
    OR public.has_permission(auth.uid(), 'reverse_financial_entries', tenant_id)
  )
)
WITH CHECK (
  tenant_id IS NOT NULL
  AND public.can_tenant_modify(tenant_id)
  AND (
    public.has_role(auth.uid(), 'admin', tenant_id)
    OR public.has_permission(auth.uid(), 'refund_bill', tenant_id)
    OR public.has_permission(auth.uid(), 'reverse_financial_entries', tenant_id)
  )
);

DROP POLICY IF EXISTS "Tenant commissions can be viewed by finance history staff" ON public.commissions;
DROP POLICY IF EXISTS "Tenant commissions can be inserted by finance staff" ON public.commissions;
DROP POLICY IF EXISTS "Tenant commissions can be updated by finance staff" ON public.commissions;
DROP POLICY IF EXISTS "Tenant commissions can be deleted by finance staff" ON public.commissions;

CREATE POLICY "Tenant commissions can be viewed by authorized staff"
ON public.commissions
FOR SELECT
USING (
  tenant_id IS NOT NULL
  AND (
    public.has_role(auth.uid(), 'admin', tenant_id)
    OR public.has_permission(auth.uid(), 'view_commissions', tenant_id)
    OR public.has_permission(auth.uid(), 'view_financial_history', tenant_id)
    OR public.has_permission(auth.uid(), 'reverse_financial_entries', tenant_id)
  )
);

CREATE POLICY "Tenant commissions can be inserted by authorized staff"
ON public.commissions
FOR INSERT
WITH CHECK (
  tenant_id IS NOT NULL
  AND public.can_tenant_modify(tenant_id)
  AND (
    public.has_role(auth.uid(), 'admin', tenant_id)
    OR public.has_permission(auth.uid(), 'reverse_financial_entries', tenant_id)
    OR (
      public.has_permission(auth.uid(), 'close_bill', tenant_id)
      AND type IN ('service', 'product')
      AND appointment_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.appointments AS appointment
        WHERE appointment.id::text = commissions.appointment_id
          AND appointment.tenant_id = commissions.tenant_id
      )
    )
  )
);

CREATE POLICY "Tenant commissions can be updated by finance staff"
ON public.commissions
FOR UPDATE
USING (
  tenant_id IS NOT NULL
  AND public.can_tenant_modify(tenant_id)
  AND (
    public.has_role(auth.uid(), 'admin', tenant_id)
    OR public.has_permission(auth.uid(), 'reverse_financial_entries', tenant_id)
  )
)
WITH CHECK (
  tenant_id IS NOT NULL
  AND public.can_tenant_modify(tenant_id)
  AND (
    public.has_role(auth.uid(), 'admin', tenant_id)
    OR public.has_permission(auth.uid(), 'reverse_financial_entries', tenant_id)
  )
);

CREATE POLICY "Tenant commissions can be deleted by finance staff"
ON public.commissions
FOR DELETE
USING (
  tenant_id IS NOT NULL
  AND public.can_tenant_modify(tenant_id)
  AND (
    public.has_role(auth.uid(), 'admin', tenant_id)
    OR public.has_permission(auth.uid(), 'reverse_financial_entries', tenant_id)
  )
);
