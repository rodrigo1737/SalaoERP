-- Um agendamento pode conter vários serviços (ex.: pé + postiça no mesmo card).
-- Cada linha guarda serviço, profissional, horário e valor próprios, permitindo
-- comissão por profissional na cobrança. O appointments mantém o 1º serviço e o
-- total (denormalizados) para a grade e relatórios; agendamentos legados sem
-- linhas continuam válidos (o app sintetiza a linha única a partir do próprio
-- agendamento).
CREATE TABLE IF NOT EXISTS public.appointment_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  appointment_id uuid NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  service_id uuid NOT NULL,
  professional_id uuid NOT NULL,
  start_time timestamptz,
  end_time timestamptz,
  value numeric NOT NULL DEFAULT 0,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_appointment_services_appointment
  ON public.appointment_services (appointment_id);
CREATE INDEX IF NOT EXISTS idx_appointment_services_tenant
  ON public.appointment_services (tenant_id);

ALTER TABLE public.appointment_services ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant appointment services are viewable by staff" ON public.appointment_services;
CREATE POLICY "Tenant appointment services are viewable by staff"
ON public.appointment_services
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

DROP POLICY IF EXISTS "Tenant appointment services are manageable by schedule staff" ON public.appointment_services;
CREATE POLICY "Tenant appointment services are manageable by schedule staff"
ON public.appointment_services
FOR ALL
USING (
  tenant_id IS NOT NULL
  AND public.can_tenant_modify(tenant_id)
  AND (
    public.has_role(auth.uid(), 'admin', tenant_id)
    OR public.has_permission(auth.uid(), 'edit_schedule', tenant_id)
    OR public.has_permission(auth.uid(), 'close_bill', tenant_id)
  )
)
WITH CHECK (
  tenant_id IS NOT NULL
  AND public.can_tenant_modify(tenant_id)
  AND (
    public.has_role(auth.uid(), 'admin', tenant_id)
    OR public.has_permission(auth.uid(), 'edit_schedule', tenant_id)
    OR public.has_permission(auth.uid(), 'close_bill', tenant_id)
  )
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'appointment_services'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.appointment_services;
  END IF;
END $$;
