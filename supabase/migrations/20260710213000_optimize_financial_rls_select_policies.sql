-- As policies de SELECT financeiras chamavam has_role()/has_permission() para
-- CADA linha retornada (cada chamada consulta user_roles/user_permissions),
-- deixando a carga de transactions/commissions lenta em bases grandes — a
-- ponto de statement timeout. Esta função resolve os tenants autorizados UMA
-- única vez por consulta (subplano não correlacionado) e as policies passam a
-- comparar tenant_id contra esse conjunto, aproveitando os índices existentes.
-- A semântica é idêntica: admin do tenant OU portador de uma das permissões.
CREATE OR REPLACE FUNCTION public.tenants_with_financial_access(_permissions public.permission_type[])
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ur.tenant_id
  FROM public.user_roles AS ur
  WHERE ur.user_id = auth.uid()
    AND ur.role = 'admin'
    AND ur.tenant_id IS NOT NULL
  UNION
  SELECT up.tenant_id
  FROM public.user_permissions AS up
  WHERE up.user_id = auth.uid()
    AND up.permission = ANY (_permissions)
    AND up.tenant_id IS NOT NULL
$$;

DROP POLICY IF EXISTS "Tenant transactions can be viewed by authorized staff" ON public.transactions;
CREATE POLICY "Tenant transactions can be viewed by authorized staff"
ON public.transactions
FOR SELECT
USING (
  tenant_id IN (
    SELECT public.tenants_with_financial_access(
      ARRAY[
        'manage_cash_flow',
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
        'view_financial_history',
        'reverse_financial_entries'
      ]::public.permission_type[]
    )
  )
);

DROP POLICY IF EXISTS "Tenant commissions can be viewed by authorized staff" ON public.commissions;
CREATE POLICY "Tenant commissions can be viewed by authorized staff"
ON public.commissions
FOR SELECT
USING (
  tenant_id IN (
    SELECT public.tenants_with_financial_access(
      ARRAY[
        'view_commissions',
        'view_financial_history',
        'reverse_financial_entries'
      ]::public.permission_type[]
    )
  )
);
