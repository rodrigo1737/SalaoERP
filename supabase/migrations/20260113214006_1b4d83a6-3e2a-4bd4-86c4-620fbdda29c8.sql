
-- Fix user_roles RLS policies - remove direct auth.users access
DROP POLICY IF EXISTS "Users can view roles in their tenant" ON public.user_roles;

CREATE POLICY "Users can view roles in their tenant"
ON public.user_roles
FOR SELECT
USING (
  user_id = auth.uid()
  OR (
    tenant_id = get_user_tenant_id(auth.uid())
    AND has_role(auth.uid(), 'admin'::app_role)
  )
  OR is_super_admin(auth.jwt() ->> 'email')
);

-- Fix super_admins RLS policies
DROP POLICY IF EXISTS "Users can check if they are super admin" ON public.super_admins;

CREATE POLICY "Users can check if they are super admin"
ON public.super_admins
FOR SELECT
USING (
  email = (auth.jwt() ->> 'email')
  OR is_super_admin(auth.jwt() ->> 'email')
);

DROP POLICY IF EXISTS "Super admins can manage super_admins" ON public.super_admins;

CREATE POLICY "Super admins can manage super_admins"
ON public.super_admins
FOR ALL
USING (is_super_admin(auth.jwt() ->> 'email'));

-- Fix user_permissions RLS policies
DROP POLICY IF EXISTS "Users can view permissions in their tenant" ON public.user_permissions;

CREATE POLICY "Users can view permissions in their tenant"
ON public.user_permissions
FOR SELECT
USING (
  user_id = auth.uid()
  OR (
    tenant_id = get_user_tenant_id(auth.uid())
    AND has_role(auth.uid(), 'admin'::app_role)
  )
  OR is_super_admin(auth.jwt() ->> 'email')
);

DROP POLICY IF EXISTS "Admins can manage permissions in their tenant" ON public.user_permissions;

CREATE POLICY "Admins can manage permissions in their tenant"
ON public.user_permissions
FOR ALL
USING (
  (
    tenant_id = get_user_tenant_id(auth.uid())
    AND has_role(auth.uid(), 'admin'::app_role)
  )
  OR is_super_admin(auth.jwt() ->> 'email')
);

DROP POLICY IF EXISTS "Admins can manage roles in their tenant" ON public.user_roles;

CREATE POLICY "Admins can manage roles in their tenant"
ON public.user_roles
FOR ALL
USING (
  (
    tenant_id = get_user_tenant_id(auth.uid())
    AND has_role(auth.uid(), 'admin'::app_role)
  )
  OR is_super_admin(auth.jwt() ->> 'email')
);
