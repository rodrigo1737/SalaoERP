-- Qualify tenant checks in client account policies to prevent cross-tenant references.

DROP POLICY IF EXISTS "Anyone can create client account during signup" ON public.client_accounts;
CREATE POLICY "Anyone can create client account during signup"
ON public.client_accounts
FOR INSERT
WITH CHECK (
  user_id = auth.uid()
  AND public.is_tenant_booking_active(tenant_id)
  AND (
    client_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM public.clients c
      WHERE c.id = client_accounts.client_id
        AND c.tenant_id = client_accounts.tenant_id
        AND c.deleted_at IS NULL
    )
  )
  AND (
    preferred_professional_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM public.professionals p
      WHERE p.id = client_accounts.preferred_professional_id
        AND p.tenant_id = client_accounts.tenant_id
        AND p.deleted_at IS NULL
    )
  )
);

DROP POLICY IF EXISTS "Clients can update their own account" ON public.client_accounts;
CREATE POLICY "Clients can update their own account"
ON public.client_accounts
FOR UPDATE
USING (user_id = auth.uid())
WITH CHECK (
  user_id = auth.uid()
  AND (
    client_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM public.clients c
      WHERE c.id = client_accounts.client_id
        AND c.tenant_id = client_accounts.tenant_id
        AND c.deleted_at IS NULL
    )
  )
  AND (
    preferred_professional_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM public.professionals p
      WHERE p.id = client_accounts.preferred_professional_id
        AND p.tenant_id = client_accounts.tenant_id
        AND p.deleted_at IS NULL
    )
  )
);
