-- Torna explícita a composição de cada liquidação e permite estorno seguro.
-- Linhas antigas são consideradas liquidações de serviço ativas.
ALTER TABLE public.commission_settlements
  ADD COLUMN IF NOT EXISTS component_type text NOT NULL DEFAULT 'service',
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS reversed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reversed_by uuid,
  ADD COLUMN IF NOT EXISTS reversal_transaction_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.commission_settlements'::regclass
      AND conname = 'commission_settlements_component_type_check'
  ) THEN
    ALTER TABLE public.commission_settlements
      ADD CONSTRAINT commission_settlements_component_type_check
      CHECK (component_type IN ('service', 'voucher'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.commission_settlements'::regclass
      AND conname = 'commission_settlements_status_check'
  ) THEN
    ALTER TABLE public.commission_settlements
      ADD CONSTRAINT commission_settlements_status_check
      CHECK (status IN ('active', 'reversed'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_commission_settlements_active_commission
  ON public.commission_settlements (tenant_id, commission_id, status);

CREATE INDEX IF NOT EXISTS idx_commission_settlements_transaction
  ON public.commission_settlements (tenant_id, transaction_id, status);

DROP POLICY IF EXISTS "Tenant commission settlements reversible by financial staff" ON public.commission_settlements;
CREATE POLICY "Tenant commission settlements reversible by financial staff"
ON public.commission_settlements
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
