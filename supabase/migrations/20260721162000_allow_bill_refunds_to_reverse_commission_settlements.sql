-- Estorno de comissões/repasses também é uma operação de estorno de comanda.
-- Usuários com refund_bill já podem estornar o movimento financeiro; a mesma
-- permissão precisa alcançar as linhas de liquidação que restauram o saldo.
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
    OR public.has_permission(auth.uid(), 'refund_bill', tenant_id)
  )
)
WITH CHECK (
  tenant_id IS NOT NULL
  AND public.can_tenant_modify(tenant_id)
  AND (
    public.has_role(auth.uid(), 'admin', tenant_id)
    OR public.has_permission(auth.uid(), 'reverse_financial_entries', tenant_id)
    OR public.has_permission(auth.uid(), 'refund_bill', tenant_id)
  )
);
