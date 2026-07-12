-- Liquidação parcial de comissão/repasse: acompanha o quanto já foi liquidado
-- (settled_amount) e registra cada liquidação para auditoria. A comissão só vira
-- 'paid' quando o total liquidado alcança o valor cheio.
ALTER TABLE public.commissions
  ADD COLUMN IF NOT EXISTS settled_amount numeric NOT NULL DEFAULT 0;

-- Comissões já pagas contam como totalmente liquidadas.
UPDATE public.commissions
SET settled_amount = commission_value
WHERE status = 'paid' AND settled_amount = 0;

CREATE TABLE IF NOT EXISTS public.commission_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  commission_id uuid NOT NULL REFERENCES public.commissions(id) ON DELETE CASCADE,
  amount numeric NOT NULL,
  payment_method text,
  transaction_id uuid,
  settlement_kind text NOT NULL DEFAULT 'commission_payable',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_commission_settlements_commission ON public.commission_settlements (commission_id);
CREATE INDEX IF NOT EXISTS idx_commission_settlements_tenant ON public.commission_settlements (tenant_id);

ALTER TABLE public.commission_settlements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant commission settlements viewable by financial staff" ON public.commission_settlements;
CREATE POLICY "Tenant commission settlements viewable by financial staff"
ON public.commission_settlements
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

DROP POLICY IF EXISTS "Tenant commission settlements insertable by financial staff" ON public.commission_settlements;
CREATE POLICY "Tenant commission settlements insertable by financial staff"
ON public.commission_settlements
FOR INSERT
WITH CHECK (
  tenant_id IS NOT NULL
  AND public.can_tenant_modify(tenant_id)
  AND (
    public.has_role(auth.uid(), 'admin', tenant_id)
    OR public.has_permission(auth.uid(), 'reverse_financial_entries', tenant_id)
  )
);
