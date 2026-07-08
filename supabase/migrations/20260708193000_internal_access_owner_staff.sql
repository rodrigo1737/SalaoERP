DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum
    WHERE enumlabel = 'staff'
      AND enumtypid = 'public.app_role'::regtype
  ) THEN
    ALTER TYPE public.app_role ADD VALUE 'staff';
  END IF;
END
$$;

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS is_owner boolean NOT NULL DEFAULT false;

UPDATE public.profiles AS profile
SET is_owner = true
WHERE EXISTS (
  SELECT 1
  FROM public.user_roles AS role
  WHERE role.user_id = profile.id
    AND role.tenant_id = profile.tenant_id
    AND role.role = 'admin'
)
AND EXISTS (
  SELECT 1
  FROM public.professionals AS professional
  WHERE professional.user_id = profile.id
    AND professional.tenant_id = profile.tenant_id
    AND professional.type = 'owner'
    AND professional.deleted_at IS NULL
)
OR (
  EXISTS (
    SELECT 1
    FROM public.user_roles AS role
    WHERE role.user_id = profile.id
      AND role.tenant_id = profile.tenant_id
      AND role.role = 'admin'
  )
  AND (
    SELECT COUNT(*)
    FROM public.user_roles AS tenant_admins
    WHERE tenant_admins.tenant_id = profile.tenant_id
      AND tenant_admins.role = 'admin'
  ) = 1
);

CREATE OR REPLACE FUNCTION public.prevent_owner_internal_access_changes()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_user_id uuid;
  owner_profile record;
BEGIN
  target_user_id := COALESCE(NEW.user_id, OLD.user_id);

  SELECT id, email
  INTO owner_profile
  FROM public.profiles
  WHERE id = target_user_id
    AND COALESCE(is_owner, false) = true;

  IF owner_profile.id IS NOT NULL THEN
    RAISE EXCEPTION 'Owner access cannot be changed.';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS prevent_owner_permission_changes ON public.user_permissions;
CREATE TRIGGER prevent_owner_permission_changes
BEFORE INSERT OR UPDATE OR DELETE ON public.user_permissions
FOR EACH ROW
EXECUTE FUNCTION public.prevent_owner_internal_access_changes();

DROP TRIGGER IF EXISTS prevent_owner_role_changes ON public.user_roles;
CREATE TRIGGER prevent_owner_role_changes
BEFORE UPDATE OR DELETE ON public.user_roles
FOR EACH ROW
EXECUTE FUNCTION public.prevent_owner_internal_access_changes();
