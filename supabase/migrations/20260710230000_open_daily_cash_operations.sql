-- O caixa do dia é único por tenant e deve ser operado sem restrição por
-- admin e recepção: quem opera caixa (manage_cash_flow) pode lançar entradas
-- e saídas manuais (antes só movimentos vinculados a comanda), e quem fecha
-- comandas (close_bill) enxerga a sessão do dia e suas movimentações.
-- Estornos, vales e regularização de caixas pendentes continuam restritos a
-- admin/reverse_financial_entries.

DROP POLICY IF EXISTS "Tenant transactions can be inserted by authorized staff" ON public.transactions;
CREATE POLICY "Tenant transactions can be inserted by authorized staff"
ON public.transactions
FOR INSERT
WITH CHECK (
  tenant_id IS NOT NULL
  AND public.can_tenant_modify(tenant_id)
  AND (
    public.has_role(auth.uid(), 'admin', tenant_id)
    OR public.has_permission(auth.uid(), 'reverse_financial_entries', tenant_id)
    OR public.has_permission(auth.uid(), 'manage_cash_flow', tenant_id)
  )
);

DROP POLICY IF EXISTS "Tenant transactions can be viewed by authorized staff" ON public.transactions;
CREATE POLICY "Tenant transactions can be viewed by authorized staff"
ON public.transactions
FOR SELECT
USING (
  tenant_id IN (
    SELECT public.tenants_with_financial_access(
      ARRAY[
        'manage_cash_flow',
        'close_bill',
        'refund_bill',
        'view_financial_history',
        'reverse_financial_entries'
      ]::public.permission_type[]
    )
  )
);

DROP POLICY IF EXISTS "Tenant cash sessions can be viewed by authorized staff" ON public.cash_sessions;
CREATE POLICY "Tenant cash sessions can be viewed by authorized staff"
ON public.cash_sessions
FOR SELECT
USING (
  tenant_id IN (
    SELECT public.tenants_with_financial_access(
      ARRAY[
        'manage_cash_flow',
        'close_bill',
        'view_financial_history',
        'reverse_financial_entries'
      ]::public.permission_type[]
    )
  )
);
