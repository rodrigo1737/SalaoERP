ALTER TABLE public.service_professionals
  ADD COLUMN IF NOT EXISTS settlement_kind text;

UPDATE public.service_professionals sp
SET settlement_kind = CASE
  WHEN COALESCE(p.settlement_type, 'commission') = 'transfer' THEN 'transfer_receivable'
  ELSE 'commission_payable'
END
FROM public.professionals p
WHERE p.id = sp.professional_id
  AND (sp.settlement_kind IS NULL OR sp.settlement_kind = '');

ALTER TABLE public.service_professionals
  ALTER COLUMN settlement_kind SET DEFAULT 'commission_payable';

ALTER TABLE public.service_professionals
  ALTER COLUMN settlement_kind SET NOT NULL;

ALTER TABLE public.service_professionals
  DROP CONSTRAINT IF EXISTS service_professionals_settlement_kind_check;

ALTER TABLE public.service_professionals
  ADD CONSTRAINT service_professionals_settlement_kind_check
  CHECK (settlement_kind IN ('commission_payable', 'transfer_receivable'));

ALTER TABLE public.commissions
  ADD COLUMN IF NOT EXISTS service_id uuid REFERENCES public.services(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS service_name_snapshot text,
  ADD COLUMN IF NOT EXISTS professional_name_snapshot text,
  ADD COLUMN IF NOT EXISTS settlement_kind text,
  ADD COLUMN IF NOT EXISTS rule_source_id uuid REFERENCES public.service_professionals(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS calculation_source text;

-- UPDATE ... FROM não permite referenciar a tabela-alvo dentro dos JOINs do
-- FROM; por isso as junções ficam numa CTE que resolve os valores por id.
WITH commission_snapshot AS (
  SELECT
    c.id,
    COALESCE(c.service_id, aps.service_id, a.service_id) AS service_id,
    COALESCE(c.service_name_snapshot, s.name, legacy_service.name) AS service_name_snapshot,
    COALESCE(c.professional_name_snapshot, p.nickname, p.name) AS professional_name_snapshot,
    COALESCE(
      c.settlement_kind,
      sp.settlement_kind,
      CASE
        WHEN c.type = 'voucher' THEN 'commission_payable'
        WHEN COALESCE(p.settlement_type, 'commission') = 'transfer' THEN 'transfer_receivable'
        ELSE 'commission_payable'
      END
    ) AS settlement_kind,
    COALESCE(c.rule_source_id, sp.id) AS rule_source_id,
    COALESCE(
      c.calculation_source,
      CASE
        WHEN sp.id IS NOT NULL THEN 'service_mapping'
        WHEN c.type = 'voucher' THEN 'voucher'
        ELSE 'legacy'
      END
    ) AS calculation_source
  FROM public.commissions c
  LEFT JOIN public.professionals p
    ON p.id = c.professional_id
  LEFT JOIN public.appointments a
    ON a.id = c.appointment_id
  LEFT JOIN LATERAL (
    SELECT aps_inner.service_id
    FROM public.appointment_services aps_inner
    WHERE aps_inner.appointment_id = c.appointment_id
      AND aps_inner.professional_id = c.professional_id
    ORDER BY aps_inner.position
    LIMIT 1
  ) aps ON true
  LEFT JOIN public.services s
    ON s.id = COALESCE(aps.service_id, a.service_id)
  LEFT JOIN public.services legacy_service
    ON legacy_service.id = a.service_id
  LEFT JOIN public.service_professionals sp
    ON sp.service_id = COALESCE(aps.service_id, a.service_id)
   AND sp.professional_id = c.professional_id
   AND sp.tenant_id = c.tenant_id
)
UPDATE public.commissions c
SET
  service_id = commission_snapshot.service_id,
  service_name_snapshot = commission_snapshot.service_name_snapshot,
  professional_name_snapshot = commission_snapshot.professional_name_snapshot,
  settlement_kind = commission_snapshot.settlement_kind,
  rule_source_id = commission_snapshot.rule_source_id,
  calculation_source = commission_snapshot.calculation_source
FROM commission_snapshot
WHERE commission_snapshot.id = c.id;

UPDATE public.commissions
SET settlement_kind = 'commission_payable'
WHERE settlement_kind IS NULL OR settlement_kind = '';

UPDATE public.commissions
SET calculation_source = 'legacy'
WHERE calculation_source IS NULL OR calculation_source = '';

ALTER TABLE public.commissions
  ALTER COLUMN settlement_kind SET DEFAULT 'commission_payable';

ALTER TABLE public.commissions
  ALTER COLUMN settlement_kind SET NOT NULL;

ALTER TABLE public.commissions
  ALTER COLUMN calculation_source SET DEFAULT 'service_mapping';

ALTER TABLE public.commissions
  ALTER COLUMN calculation_source SET NOT NULL;

ALTER TABLE public.commissions
  DROP CONSTRAINT IF EXISTS commissions_settlement_kind_check;

ALTER TABLE public.commissions
  ADD CONSTRAINT commissions_settlement_kind_check
  CHECK (settlement_kind IN ('commission_payable', 'transfer_receivable'));

ALTER TABLE public.commissions
  DROP CONSTRAINT IF EXISTS commissions_calculation_source_check;

ALTER TABLE public.commissions
  ADD CONSTRAINT commissions_calculation_source_check
  CHECK (calculation_source IN ('service_mapping', 'manual_mapping', 'reprocess', 'legacy', 'voucher'));

CREATE INDEX IF NOT EXISTS idx_commissions_service_id
  ON public.commissions (service_id);

CREATE INDEX IF NOT EXISTS idx_commissions_settlement_kind
  ON public.commissions (tenant_id, settlement_kind, status);

CREATE INDEX IF NOT EXISTS idx_service_professionals_settlement_kind
  ON public.service_professionals (tenant_id, settlement_kind);

CREATE TABLE IF NOT EXISTS public.commission_reprocessing_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  professional_id uuid REFERENCES public.professionals(id) ON DELETE SET NULL,
  date_from timestamptz NOT NULL,
  date_to timestamptz NOT NULL,
  mode text NOT NULL DEFAULT 'pending_only',
  recalculated_count integer NOT NULL DEFAULT 0,
  skipped_count integer NOT NULL DEFAULT 0,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.commission_reprocessing_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant commission reprocessing runs are viewable by financial staff" ON public.commission_reprocessing_runs;
CREATE POLICY "Tenant commission reprocessing runs are viewable by financial staff"
ON public.commission_reprocessing_runs
FOR SELECT
USING (
  tenant_id IS NOT NULL
  AND (
    public.has_role(auth.uid(), 'admin', tenant_id)
    OR public.has_permission(auth.uid(), 'reverse_financial_entries', tenant_id)
    OR public.has_permission(auth.uid(), 'view_financial_history', tenant_id)
  )
);

DROP POLICY IF EXISTS "Tenant commission reprocessing runs are insertable by financial staff" ON public.commission_reprocessing_runs;
CREATE POLICY "Tenant commission reprocessing runs are insertable by financial staff"
ON public.commission_reprocessing_runs
FOR INSERT
WITH CHECK (
  tenant_id IS NOT NULL
  AND public.can_tenant_modify(tenant_id)
  AND (
    public.has_role(auth.uid(), 'admin', tenant_id)
    OR public.has_permission(auth.uid(), 'reverse_financial_entries', tenant_id)
  )
);
