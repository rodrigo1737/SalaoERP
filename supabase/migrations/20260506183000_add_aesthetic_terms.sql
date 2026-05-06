-- Adds consent/term records for the aesthetic clinic module.

CREATE TABLE IF NOT EXISTS public.aesthetic_terms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  title text NOT NULL,
  content text NOT NULL,
  signature_name text,
  accepted_at timestamptz,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS aesthetic_terms_tenant_client_idx
  ON public.aesthetic_terms (tenant_id, client_id, created_at DESC)
  WHERE deleted_at IS NULL;

ALTER TABLE public.aesthetic_terms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant admins can view aesthetic terms" ON public.aesthetic_terms;
CREATE POLICY "Tenant admins can view aesthetic terms"
ON public.aesthetic_terms
FOR SELECT
USING (
  public.has_aesthetic_package(tenant_id)
  AND (
    public.is_super_admin(auth.jwt() ->> 'email')
    OR public.has_role(auth.uid(), 'admin', tenant_id)
  )
);

DROP POLICY IF EXISTS "Tenant admins can manage aesthetic terms" ON public.aesthetic_terms;
CREATE POLICY "Tenant admins can manage aesthetic terms"
ON public.aesthetic_terms
FOR ALL
USING (
  public.has_aesthetic_package(tenant_id)
  AND public.can_tenant_modify(tenant_id)
  AND (
    public.is_super_admin(auth.jwt() ->> 'email')
    OR public.has_role(auth.uid(), 'admin', tenant_id)
  )
)
WITH CHECK (
  public.has_aesthetic_package(tenant_id)
  AND public.can_tenant_modify(tenant_id)
  AND (
    public.is_super_admin(auth.jwt() ->> 'email')
    OR public.has_role(auth.uid(), 'admin', tenant_id)
  )
);
