-- Permite que o PRÓPRIO admin do tenant promova/rebaixe administradores sem
-- depender do fluxo super admin (B2B) nem de edge function. SECURITY DEFINER:
-- valida que o chamador é admin (ou super admin) do tenant, protege o owner e
-- impede rebaixar o último administrador.
CREATE OR REPLACE FUNCTION public.set_tenant_admin_role(
  _tenant_id uuid,
  _target_user_id uuid,
  _make_admin boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := auth.uid();
  caller_is_admin boolean;
  target_is_owner boolean;
  remaining integer;
BEGIN
  IF caller IS NULL THEN
    RAISE EXCEPTION 'Não autenticado.';
  END IF;
  IF _tenant_id IS NULL OR _target_user_id IS NULL THEN
    RAISE EXCEPTION 'Parâmetros obrigatórios ausentes.';
  END IF;

  SELECT (
    public.is_super_admin(auth.jwt() ->> 'email')
    OR public.has_role(caller, 'admin'::public.app_role, _tenant_id)
  ) INTO caller_is_admin;

  IF NOT COALESCE(caller_is_admin, false) THEN
    RAISE EXCEPTION 'Sem permissão para gerenciar administradores.';
  END IF;

  IF _make_admin THEN
    INSERT INTO public.user_roles (user_id, tenant_id, role)
    VALUES (_target_user_id, _tenant_id, 'admin')
    ON CONFLICT (user_id, role, tenant_id) DO NOTHING;
  ELSE
    SELECT COALESCE(is_owner, false) INTO target_is_owner
    FROM public.profiles
    WHERE id = _target_user_id;

    IF COALESCE(target_is_owner, false) THEN
      RAISE EXCEPTION 'O owner não pode ser rebaixado.';
    END IF;

    -- Quantos admins/owners restam no tenant sem contar o alvo?
    SELECT count(*) INTO remaining
    FROM (
      SELECT ur.user_id
      FROM public.user_roles ur
      WHERE ur.tenant_id = _tenant_id
        AND ur.role = 'admin'
        AND ur.user_id <> _target_user_id
      UNION
      SELECT p.id
      FROM public.profiles p
      WHERE p.tenant_id = _tenant_id
        AND COALESCE(p.is_owner, false) = true
        AND p.id <> _target_user_id
    ) AS remaining_admins;

    IF remaining = 0 THEN
      RAISE EXCEPTION 'Não é possível rebaixar o último administrador do cliente.';
    END IF;

    DELETE FROM public.user_roles
    WHERE user_id = _target_user_id
      AND tenant_id = _tenant_id
      AND role = 'admin';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_tenant_admin_role(uuid, uuid, boolean) TO authenticated;
