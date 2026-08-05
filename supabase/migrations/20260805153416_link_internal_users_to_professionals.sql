-- Link an internal user to a professional without rewriting operational history.
-- The relationship is optional, one-to-one and always restricted to one tenant.

DO $$
DECLARE
  duplicate_user_id uuid;
BEGIN
  SELECT user_id
  INTO duplicate_user_id
  FROM public.professionals
  WHERE user_id IS NOT NULL
  GROUP BY user_id
  HAVING count(*) > 1
  LIMIT 1;

  IF duplicate_user_id IS NOT NULL THEN
    RAISE EXCEPTION
      'Nao foi possivel garantir o vinculo 1:1: o usuario % esta ligado a mais de um profissional',
      duplicate_user_id
      USING ERRCODE = '23505';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_professionals_unique_user_link
  ON public.professionals (user_id)
  WHERE user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.professional_user_link_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE RESTRICT,
  previous_user_id uuid,
  new_user_id uuid,
  changed_by uuid NOT NULL,
  apply_professional_scope boolean NOT NULL DEFAULT false,
  action text NOT NULL CHECK (action IN ('link', 'unlink', 'relink')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_professional_user_link_audit_tenant_created
  ON public.professional_user_link_audit (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_professional_user_link_audit_professional_created
  ON public.professional_user_link_audit (professional_id, created_at DESC);

ALTER TABLE public.professional_user_link_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant admins can view professional user link audit"
  ON public.professional_user_link_audit;

CREATE POLICY "Tenant admins can view professional user link audit"
ON public.professional_user_link_audit
FOR SELECT
TO authenticated
USING (
  public.is_super_admin(auth.jwt() ->> 'email')
  OR public.has_role(auth.uid(), 'admin'::public.app_role, tenant_id)
);

REVOKE ALL ON TABLE public.professional_user_link_audit FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.professional_user_link_audit TO authenticated;

CREATE SCHEMA IF NOT EXISTS private;

CREATE OR REPLACE FUNCTION private.set_professional_user_link(
  _tenant_id uuid,
  _professional_id uuid,
  _target_user_id uuid,
  _apply_professional_scope boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  caller_id uuid := auth.uid();
  previous_user_id uuid;
  target_is_owner boolean := false;
  target_is_admin boolean := false;
  audit_action text;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Autenticacao obrigatoria' USING ERRCODE = '42501';
  END IF;

  IF NOT (
    public.is_super_admin(auth.jwt() ->> 'email')
    OR public.has_role(caller_id, 'admin'::public.app_role, _tenant_id)
  ) THEN
    RAISE EXCEPTION 'Somente administradores podem alterar o vinculo profissional'
      USING ERRCODE = '42501';
  END IF;

  SELECT pr.user_id
  INTO previous_user_id
  FROM public.professionals AS pr
  WHERE pr.id = _professional_id
    AND pr.tenant_id = _tenant_id
    AND pr.is_active = true
    AND pr.deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profissional ativo nao encontrado neste cliente B2B'
      USING ERRCODE = 'P0002';
  END IF;

  IF _target_user_id IS NOT NULL THEN
    SELECT coalesce(p.is_owner, false)
    INTO target_is_owner
    FROM public.profiles AS p
    WHERE p.id = _target_user_id
      AND p.tenant_id = _tenant_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Usuario interno nao encontrado neste cliente B2B'
        USING ERRCODE = 'P0002';
    END IF;

    SELECT EXISTS (
      SELECT 1
      FROM public.user_roles AS ur
      WHERE ur.user_id = _target_user_id
        AND ur.tenant_id = _tenant_id
        AND ur.role = 'admin'::public.app_role
    )
    INTO target_is_admin;

    IF NOT target_is_owner AND NOT EXISTS (
      SELECT 1
      FROM public.user_roles AS ur
      WHERE ur.user_id = _target_user_id
        AND ur.tenant_id = _tenant_id
    ) THEN
      RAISE EXCEPTION 'O usuario precisa ter um acesso interno ativo neste cliente B2B'
        USING ERRCODE = '42501';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.professionals AS linked_professional
      WHERE linked_professional.user_id = _target_user_id
        AND linked_professional.id <> _professional_id
    ) THEN
      RAISE EXCEPTION 'Este usuario ja esta vinculado a outro profissional'
        USING ERRCODE = '23505';
    END IF;
  END IF;

  UPDATE public.professionals
  SET user_id = _target_user_id,
      updated_at = now()
  WHERE id = _professional_id
    AND tenant_id = _tenant_id;

  IF _target_user_id IS NOT NULL
     AND _apply_professional_scope
     AND NOT target_is_owner
     AND NOT target_is_admin THEN
    INSERT INTO public.user_permissions (user_id, tenant_id, permission)
    VALUES
      (_target_user_id, _tenant_id, 'view_schedule'::public.permission_type),
      (_target_user_id, _tenant_id, 'view_commissions'::public.permission_type),
      (_target_user_id, _tenant_id, 'manage_schedule_blocks'::public.permission_type)
    ON CONFLICT (user_id, tenant_id, permission) DO NOTHING;

    DELETE FROM public.user_permissions
    WHERE user_id = _target_user_id
      AND tenant_id = _tenant_id
      AND permission IN (
        'view_all_schedule'::public.permission_type,
        'manage_all_schedule_blocks'::public.permission_type
      );
  END IF;

  audit_action := CASE
    WHEN previous_user_id IS NULL AND _target_user_id IS NOT NULL THEN 'link'
    WHEN previous_user_id IS NOT NULL AND _target_user_id IS NULL THEN 'unlink'
    ELSE 'relink'
  END;

  INSERT INTO public.professional_user_link_audit (
    tenant_id,
    professional_id,
    previous_user_id,
    new_user_id,
    changed_by,
    apply_professional_scope,
    action
  )
  VALUES (
    _tenant_id,
    _professional_id,
    previous_user_id,
    _target_user_id,
    caller_id,
    _apply_professional_scope,
    audit_action
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.set_professional_user_link(
  _tenant_id uuid,
  _professional_id uuid,
  _target_user_id uuid,
  _apply_professional_scope boolean DEFAULT false
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
  SELECT private.set_professional_user_link(
    _tenant_id,
    _professional_id,
    _target_user_id,
    _apply_professional_scope
  );
$$;

REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION private.set_professional_user_link(uuid, uuid, uuid, boolean)
  FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.set_professional_user_link(uuid, uuid, uuid, boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_professional_user_link(uuid, uuid, uuid, boolean)
  TO authenticated;

NOTIFY pgrst, 'reload schema';
