CREATE OR REPLACE FUNCTION public.get_my_access_context()
RETURNS TABLE (
  tenant_id uuid,
  is_owner boolean,
  is_super_admin boolean,
  profile_email text,
  full_name text,
  tenant_name text,
  tenant_status text,
  subscription_due_date date,
  package_type text,
  roles text[],
  permissions text[],
  professional_id uuid,
  professional_name text,
  professional_nickname text,
  professional_has_schedule boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH profile_row AS (
    SELECT p.id, p.tenant_id, p.is_owner, p.email, p.full_name
    FROM public.profiles AS p
    WHERE p.id = auth.uid()
    LIMIT 1
  ),
  tenant_row AS (
    SELECT t.id, t.name, t.status, t.subscription_due_date, t.package_type
    FROM public.tenants AS t
    JOIN profile_row AS p ON p.tenant_id = t.id
    LIMIT 1
  ),
  role_rows AS (
    SELECT array_remove(array_agg(DISTINCT ur.role::text), NULL) AS items
    FROM public.user_roles AS ur
    JOIN profile_row AS p ON p.tenant_id IS NOT DISTINCT FROM ur.tenant_id
    WHERE ur.user_id = auth.uid()
  ),
  permission_rows AS (
    SELECT array_remove(array_agg(DISTINCT up.permission::text), NULL) AS items
    FROM public.user_permissions AS up
    JOIN profile_row AS p ON p.tenant_id IS NOT DISTINCT FROM up.tenant_id
    WHERE up.user_id = auth.uid()
  ),
  professional_row AS (
    SELECT pr.id, pr.name, pr.nickname, pr.has_schedule
    FROM public.professionals AS pr
    JOIN profile_row AS p ON pr.tenant_id = p.tenant_id
    WHERE pr.user_id = auth.uid()
    ORDER BY pr.created_at DESC NULLS LAST, pr.id DESC
    LIMIT 1
  )
  SELECT
    p.tenant_id,
    COALESCE(p.is_owner, false) AS is_owner,
    public.is_super_admin(auth.jwt() ->> 'email') AS is_super_admin,
    p.email AS profile_email,
    p.full_name,
    t.name AS tenant_name,
    t.status::text AS tenant_status,
    t.subscription_due_date,
    COALESCE(t.package_type::text, 'salon') AS package_type,
    COALESCE(r.items, ARRAY[]::text[]) AS roles,
    COALESCE(pm.items, ARRAY[]::text[]) AS permissions,
    pr.id AS professional_id,
    pr.name AS professional_name,
    pr.nickname AS professional_nickname,
    COALESCE(pr.has_schedule, false) AS professional_has_schedule
  FROM profile_row AS p
  LEFT JOIN tenant_row AS t ON true
  LEFT JOIN role_rows AS r ON true
  LEFT JOIN permission_rows AS pm ON true
  LEFT JOIN professional_row AS pr ON true
$$;

WITH ranked_open_sessions AS (
  SELECT
    id,
    tenant_id,
    row_number() OVER (
      PARTITION BY tenant_id
      ORDER BY opened_at DESC, created_at DESC, id DESC
    ) AS row_num
  FROM public.cash_sessions
  WHERE status = 'open'
    AND tenant_id IS NOT NULL
)
UPDATE public.cash_sessions AS cs
SET
  status = 'closed',
  closed_at = COALESCE(cs.closed_at, now()),
  notes = concat_ws(
    E'\n',
    NULLIF(cs.notes, ''),
    'Caixa fechado automaticamente para manter apenas uma sessao aberta por tenant.'
  )
FROM ranked_open_sessions AS ranked
WHERE cs.id = ranked.id
  AND ranked.row_num > 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_cash_sessions_single_open_per_tenant
  ON public.cash_sessions (tenant_id)
  WHERE status = 'open' AND tenant_id IS NOT NULL;

ALTER TABLE public.cash_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant cash sessions can be viewed by cashier staff" ON public.cash_sessions;
CREATE POLICY "Tenant cash sessions can be viewed by cashier staff"
ON public.cash_sessions
FOR SELECT
USING (
  tenant_id IS NOT NULL
  AND (
    public.has_role(auth.uid(), 'admin', tenant_id)
    OR public.has_permission(auth.uid(), 'manage_cash_flow', tenant_id)
  )
);

DROP POLICY IF EXISTS "Tenant cash sessions can be managed by cashier staff" ON public.cash_sessions;
CREATE POLICY "Tenant cash sessions can be managed by cashier staff"
ON public.cash_sessions
FOR ALL
USING (
  tenant_id IS NOT NULL
  AND public.can_tenant_modify(tenant_id)
  AND (
    public.has_role(auth.uid(), 'admin', tenant_id)
    OR public.has_permission(auth.uid(), 'manage_cash_flow', tenant_id)
  )
)
WITH CHECK (
  tenant_id IS NOT NULL
  AND public.can_tenant_modify(tenant_id)
  AND (
    public.has_role(auth.uid(), 'admin', tenant_id)
    OR public.has_permission(auth.uid(), 'manage_cash_flow', tenant_id)
  )
);

DROP POLICY IF EXISTS "Tenant transactions can be viewed by cashier staff" ON public.transactions;
CREATE POLICY "Tenant transactions can be viewed by cashier staff"
ON public.transactions
FOR SELECT
USING (
  tenant_id IS NOT NULL
  AND (
    public.has_role(auth.uid(), 'admin', tenant_id)
    OR public.has_permission(auth.uid(), 'manage_cash_flow', tenant_id)
    OR public.has_permission(auth.uid(), 'refund_bill', tenant_id)
  )
);

DROP POLICY IF EXISTS "Tenant transactions can be inserted by cashier staff" ON public.transactions;
CREATE POLICY "Tenant transactions can be inserted by cashier staff"
ON public.transactions
FOR INSERT
WITH CHECK (
  tenant_id IS NOT NULL
  AND public.can_tenant_modify(tenant_id)
  AND (
    public.has_role(auth.uid(), 'admin', tenant_id)
    OR public.has_permission(auth.uid(), 'manage_cash_flow', tenant_id)
  )
);

DROP POLICY IF EXISTS "Tenant transactions can be updated for refunds" ON public.transactions;
CREATE POLICY "Tenant transactions can be updated for refunds"
ON public.transactions
FOR UPDATE
USING (
  tenant_id IS NOT NULL
  AND public.can_tenant_modify(tenant_id)
  AND (
    public.has_role(auth.uid(), 'admin', tenant_id)
    OR public.has_permission(auth.uid(), 'refund_bill', tenant_id)
  )
)
WITH CHECK (
  tenant_id IS NOT NULL
  AND public.can_tenant_modify(tenant_id)
  AND (
    public.has_role(auth.uid(), 'admin', tenant_id)
    OR public.has_permission(auth.uid(), 'refund_bill', tenant_id)
  )
);
