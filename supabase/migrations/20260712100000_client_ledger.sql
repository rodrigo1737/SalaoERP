-- Razão financeiro do cliente: dívidas (pendências de comanda) e créditos
-- (valores deixados para consumo futuro), com baixa parcial. Substitui a
-- convenção frágil de marcar "[PENDENTE: R$x]" nas observações do agendamento.
CREATE TABLE IF NOT EXISTS public.client_ledger_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
  transaction_id uuid,
  entry_type text NOT NULL CHECK (entry_type IN ('debt', 'credit')),
  amount numeric NOT NULL CHECK (amount > 0),
  settled_amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'settled')),
  description text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  settled_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_client_ledger_client ON public.client_ledger_entries (tenant_id, client_id, status);
CREATE INDEX IF NOT EXISTS idx_client_ledger_appointment ON public.client_ledger_entries (appointment_id);

ALTER TABLE public.client_ledger_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant client ledger viewable by staff" ON public.client_ledger_entries;
CREATE POLICY "Tenant client ledger viewable by staff"
ON public.client_ledger_entries
FOR SELECT
USING (
  tenant_id IS NOT NULL
  AND (
    public.has_role(auth.uid(), 'admin', tenant_id)
    OR public.has_permission(auth.uid(), 'view_schedule', tenant_id)
    OR public.has_permission(auth.uid(), 'edit_schedule', tenant_id)
    OR public.has_permission(auth.uid(), 'close_bill', tenant_id)
    OR public.has_permission(auth.uid(), 'manage_cash_flow', tenant_id)
    OR public.has_permission(auth.uid(), 'view_clients', tenant_id)
    OR public.has_permission(auth.uid(), 'view_financial_history', tenant_id)
    OR public.has_permission(auth.uid(), 'reverse_financial_entries', tenant_id)
  )
);

DROP POLICY IF EXISTS "Tenant client ledger manageable by cashier staff" ON public.client_ledger_entries;
CREATE POLICY "Tenant client ledger manageable by cashier staff"
ON public.client_ledger_entries
FOR ALL
USING (
  tenant_id IS NOT NULL
  AND public.can_tenant_modify(tenant_id)
  AND (
    public.has_role(auth.uid(), 'admin', tenant_id)
    OR public.has_permission(auth.uid(), 'close_bill', tenant_id)
    OR public.has_permission(auth.uid(), 'manage_cash_flow', tenant_id)
    OR public.has_permission(auth.uid(), 'reverse_financial_entries', tenant_id)
  )
)
WITH CHECK (
  tenant_id IS NOT NULL
  AND public.can_tenant_modify(tenant_id)
  AND (
    public.has_role(auth.uid(), 'admin', tenant_id)
    OR public.has_permission(auth.uid(), 'close_bill', tenant_id)
    OR public.has_permission(auth.uid(), 'manage_cash_flow', tenant_id)
    OR public.has_permission(auth.uid(), 'reverse_financial_entries', tenant_id)
  )
);

-- Backfill: converte as tags "[PENDENTE: R$x]" já existentes nas observações
-- em dívidas do razão (uma por tag), sem duplicar em re-execuções.
INSERT INTO public.client_ledger_entries (tenant_id, client_id, appointment_id, entry_type, amount, description)
SELECT
  a.tenant_id,
  a.client_id,
  a.id,
  'debt',
  replace(m.matched[1], ',', '.')::numeric,
  'Pendência importada das observações da comanda'
FROM public.appointments a
CROSS JOIN LATERAL regexp_matches(a.notes, '\[PENDENTE: R\$\s*([0-9]+(?:[.,][0-9]{1,2})?)\]', 'g') AS m(matched)
WHERE a.client_id IS NOT NULL
  AND a.notes LIKE '%[PENDENTE:%'
  AND replace(m.matched[1], ',', '.')::numeric > 0
  AND NOT EXISTS (
    SELECT 1 FROM public.client_ledger_entries e
    WHERE e.appointment_id = a.id AND e.entry_type = 'debt'
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'client_ledger_entries'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.client_ledger_entries;
  END IF;
END $$;
