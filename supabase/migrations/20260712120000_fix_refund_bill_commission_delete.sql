-- A tela trata 'refund_bill' como suficiente para "Estornar e Reabrir
-- Comanda" (rótulo em Admin.tsx, canRefundBills no DataContext), mas a
-- policy de DELETE em commissions só aceitava admin/reverse_financial_entries.
-- Um usuário só com refund_bill conseguia reabrir o agendamento (essa policy
-- já aceitava refund_bill) mas o DELETE da comissão antiga era barrado pelo
-- RLS silenciosamente — a comanda reabria com a comissão antiga órfã ainda
-- no banco. Alinha a policy com o modelo de permissão que a UI já promete.
DROP POLICY IF EXISTS "Tenant commissions can be deleted by finance staff" ON public.commissions;
CREATE POLICY "Tenant commissions can be deleted by finance staff"
ON public.commissions
FOR DELETE
USING (
  tenant_id IS NOT NULL
  AND public.can_tenant_modify(tenant_id)
  AND (
    public.has_role(auth.uid(), 'admin', tenant_id)
    OR public.has_permission(auth.uid(), 'refund_bill', tenant_id)
    OR public.has_permission(auth.uid(), 'reverse_financial_entries', tenant_id)
  )
);
