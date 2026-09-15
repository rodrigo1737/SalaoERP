-- Audit trail for privileged password changes performed by tenant admins.
-- Passwords and password hashes must never be stored in this table.

CREATE TABLE IF NOT EXISTS public.internal_user_security_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  target_user_id uuid NOT NULL,
  target_professional_id uuid REFERENCES public.professionals(id) ON DELETE SET NULL,
  changed_by uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('password_changed')),
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'succeeded', 'failed')),
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_internal_user_security_audit_tenant_created
  ON public.internal_user_security_audit (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_internal_user_security_audit_target_created
  ON public.internal_user_security_audit (target_user_id, created_at DESC);

ALTER TABLE public.internal_user_security_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant admins can view internal user security audit"
  ON public.internal_user_security_audit;

CREATE POLICY "Tenant admins can view internal user security audit"
ON public.internal_user_security_audit
FOR SELECT
TO authenticated
USING (
  public.is_super_admin(auth.jwt() ->> 'email')
  OR public.has_role(auth.uid(), 'admin'::public.app_role, tenant_id)
);

REVOKE ALL ON TABLE public.internal_user_security_audit FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.internal_user_security_audit TO authenticated;
