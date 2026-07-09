DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum
    WHERE enumlabel = 'view_financial_history'
      AND enumtypid = 'public.permission_type'::regtype
  ) THEN
    ALTER TYPE public.permission_type ADD VALUE 'view_financial_history';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum
    WHERE enumlabel = 'reverse_financial_entries'
      AND enumtypid = 'public.permission_type'::regtype
  ) THEN
    ALTER TYPE public.permission_type ADD VALUE 'reverse_financial_entries';
  END IF;
END $$;

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS reversed_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS reversed_by uuid,
  ADD COLUMN IF NOT EXISTS reversal_transaction_id uuid,
  ADD COLUMN IF NOT EXISTS reversal_reason text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'transactions_reversal_transaction_id_fkey'
  ) THEN
    ALTER TABLE public.transactions
      ADD CONSTRAINT transactions_reversal_transaction_id_fkey
      FOREIGN KEY (reversal_transaction_id) REFERENCES public.transactions(id)
      ON DELETE SET NULL
      NOT VALID;
  END IF;
END $$;

ALTER TABLE public.transactions
  VALIDATE CONSTRAINT transactions_reversal_transaction_id_fkey;

CREATE INDEX IF NOT EXISTS idx_transactions_tenant_reversed_created
  ON public.transactions (tenant_id, reversed_at, created_at DESC);

DROP POLICY IF EXISTS "Tenant appointments can be reopened by finance staff" ON public.appointments;
DROP POLICY IF EXISTS "Tenant appointments can be viewed by finance staff" ON public.appointments;
CREATE POLICY "Tenant appointments can be viewed by finance staff"
ON public.appointments
FOR SELECT
USING (
  tenant_id IS NOT NULL
  AND (
    public.has_role(auth.uid(), 'admin', tenant_id)
    OR public.has_permission(auth.uid(), 'refund_bill', tenant_id)
    OR public.has_permission(auth.uid(), 'view_financial_history', tenant_id)
    OR public.has_permission(auth.uid(), 'reverse_financial_entries', tenant_id)
  )
);

CREATE POLICY "Tenant appointments can be reopened by finance staff"
ON public.appointments
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

DROP POLICY IF EXISTS "Tenant cash sessions can be viewed by finance history staff" ON public.cash_sessions;
CREATE POLICY "Tenant cash sessions can be viewed by finance history staff"
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

DROP POLICY IF EXISTS "Tenant transactions can be viewed by finance history staff" ON public.transactions;
CREATE POLICY "Tenant transactions can be viewed by finance history staff"
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

DROP POLICY IF EXISTS "Tenant transactions can be inserted by finance history staff" ON public.transactions;
CREATE POLICY "Tenant transactions can be inserted by finance history staff"
ON public.transactions
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

DROP POLICY IF EXISTS "Tenant transactions can be updated by finance history staff" ON public.transactions;
CREATE POLICY "Tenant transactions can be updated by finance history staff"
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
CREATE POLICY "Tenant commissions can be viewed by finance history staff"
ON public.commissions
FOR SELECT
USING (
  tenant_id IS NOT NULL
  AND (
    public.has_role(auth.uid(), 'admin', tenant_id)
    OR public.has_permission(auth.uid(), 'view_commissions', tenant_id)
    OR public.has_permission(auth.uid(), 'manage_cash_flow', tenant_id)
    OR public.has_permission(auth.uid(), 'view_financial_history', tenant_id)
    OR public.has_permission(auth.uid(), 'reverse_financial_entries', tenant_id)
  )
);

DROP POLICY IF EXISTS "Tenant commissions can be inserted by finance staff" ON public.commissions;
CREATE POLICY "Tenant commissions can be inserted by finance staff"
ON public.commissions
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

DROP POLICY IF EXISTS "Tenant commissions can be updated by finance staff" ON public.commissions;
CREATE POLICY "Tenant commissions can be updated by finance staff"
ON public.commissions
FOR UPDATE
USING (
  tenant_id IS NOT NULL
  AND public.can_tenant_modify(tenant_id)
  AND (
    public.has_role(auth.uid(), 'admin', tenant_id)
    OR public.has_permission(auth.uid(), 'manage_cash_flow', tenant_id)
    OR public.has_permission(auth.uid(), 'reverse_financial_entries', tenant_id)
  )
)
WITH CHECK (
  tenant_id IS NOT NULL
  AND public.can_tenant_modify(tenant_id)
  AND (
    public.has_role(auth.uid(), 'admin', tenant_id)
    OR public.has_permission(auth.uid(), 'manage_cash_flow', tenant_id)
    OR public.has_permission(auth.uid(), 'reverse_financial_entries', tenant_id)
  )
);

DROP POLICY IF EXISTS "Tenant commissions can be deleted by finance staff" ON public.commissions;
CREATE POLICY "Tenant commissions can be deleted by finance staff"
ON public.commissions
FOR DELETE
USING (
  tenant_id IS NOT NULL
  AND public.can_tenant_modify(tenant_id)
  AND (
    public.has_role(auth.uid(), 'admin', tenant_id)
    OR public.has_permission(auth.uid(), 'manage_cash_flow', tenant_id)
    OR public.has_permission(auth.uid(), 'reverse_financial_entries', tenant_id)
  )
);
