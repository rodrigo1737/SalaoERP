-- Vales fazem parte da rotina diária do caixa: quem opera o caixa
-- (manage_cash_flow, ex.: recepção) pode registrar o desconto de vale nas
-- comissões, desde que amarrado à transação de caixa correspondente.
-- Demais lançamentos de comissão seguem restritos como antes.
DROP POLICY IF EXISTS "Tenant commissions can be inserted by authorized staff" ON public.commissions;
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
        WHERE appointment.id = commissions.appointment_id
          AND appointment.tenant_id = commissions.tenant_id
      )
    )
    OR (
      public.has_permission(auth.uid(), 'manage_cash_flow', tenant_id)
      AND type = 'voucher'
      AND transaction_id IS NOT NULL
    )
  )
);
