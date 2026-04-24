
-- Fix tenants RLS policies - remove direct auth.users access
DROP POLICY IF EXISTS "Super admins can view all tenants" ON public.tenants;

CREATE POLICY "Super admins can view all tenants"
ON public.tenants
FOR SELECT
USING (is_super_admin(auth.jwt() ->> 'email'));

DROP POLICY IF EXISTS "Super admins can manage tenants" ON public.tenants;

CREATE POLICY "Super admins can manage tenants"
ON public.tenants
FOR ALL
USING (is_super_admin(auth.jwt() ->> 'email'));

-- Fix profiles RLS policies
DROP POLICY IF EXISTS "Users can view own profile or admin can view tenant profiles" ON public.profiles;

CREATE POLICY "Users can view own profile or admin can view tenant profiles"
ON public.profiles
FOR SELECT
USING (
  id = auth.uid()
  OR (
    tenant_id = get_user_tenant_id(auth.uid())
    AND has_role(auth.uid(), 'admin'::app_role)
  )
  OR is_super_admin(auth.jwt() ->> 'email')
);

DROP POLICY IF EXISTS "Super admins can insert profiles" ON public.profiles;

CREATE POLICY "Super admins can insert profiles"
ON public.profiles
FOR INSERT
WITH CHECK (
  id = auth.uid()
  OR is_super_admin(auth.jwt() ->> 'email')
);

-- Fix appointments RLS policies
DROP POLICY IF EXISTS "Users can view appointments in their tenant" ON public.appointments;

CREATE POLICY "Users can view appointments in their tenant"
ON public.appointments
FOR SELECT
USING (
  tenant_id = get_user_tenant_id(auth.uid())
  OR is_super_admin(auth.jwt() ->> 'email')
);

DROP POLICY IF EXISTS "Users can manage appointments in their tenant" ON public.appointments;

CREATE POLICY "Users can manage appointments in their tenant"
ON public.appointments
FOR ALL
USING (
  (tenant_id = get_user_tenant_id(auth.uid()) AND can_tenant_modify(tenant_id))
  OR is_super_admin(auth.jwt() ->> 'email')
);

-- Fix clients RLS policies
DROP POLICY IF EXISTS "Users can view clients in their tenant" ON public.clients;

CREATE POLICY "Users can view clients in their tenant"
ON public.clients
FOR SELECT
USING (
  tenant_id = get_user_tenant_id(auth.uid())
  OR is_super_admin(auth.jwt() ->> 'email')
);

DROP POLICY IF EXISTS "Users can manage clients in their tenant" ON public.clients;

CREATE POLICY "Users can manage clients in their tenant"
ON public.clients
FOR ALL
USING (
  (tenant_id = get_user_tenant_id(auth.uid()) AND can_tenant_modify(tenant_id))
  OR is_super_admin(auth.jwt() ->> 'email')
);

-- Fix professionals RLS policies
DROP POLICY IF EXISTS "Users can view professionals in their tenant" ON public.professionals;

CREATE POLICY "Users can view professionals in their tenant"
ON public.professionals
FOR SELECT
USING (
  tenant_id = get_user_tenant_id(auth.uid())
  OR is_super_admin(auth.jwt() ->> 'email')
);

DROP POLICY IF EXISTS "Users can manage professionals in their tenant" ON public.professionals;

CREATE POLICY "Users can manage professionals in their tenant"
ON public.professionals
FOR ALL
USING (
  (tenant_id = get_user_tenant_id(auth.uid()) AND can_tenant_modify(tenant_id))
  OR is_super_admin(auth.jwt() ->> 'email')
);

-- Fix services RLS policies
DROP POLICY IF EXISTS "Users can view services in their tenant" ON public.services;

CREATE POLICY "Users can view services in their tenant"
ON public.services
FOR SELECT
USING (
  tenant_id = get_user_tenant_id(auth.uid())
  OR is_super_admin(auth.jwt() ->> 'email')
);

DROP POLICY IF EXISTS "Users can manage services in their tenant" ON public.services;

CREATE POLICY "Users can manage services in their tenant"
ON public.services
FOR ALL
USING (
  (tenant_id = get_user_tenant_id(auth.uid()) AND can_tenant_modify(tenant_id))
  OR is_super_admin(auth.jwt() ->> 'email')
);

-- Fix products RLS policies
DROP POLICY IF EXISTS "Users can view products in their tenant" ON public.products;

CREATE POLICY "Users can view products in their tenant"
ON public.products
FOR SELECT
USING (
  tenant_id = get_user_tenant_id(auth.uid())
  OR is_super_admin(auth.jwt() ->> 'email')
);

DROP POLICY IF EXISTS "Users can manage products in their tenant" ON public.products;

CREATE POLICY "Users can manage products in their tenant"
ON public.products
FOR ALL
USING (
  (tenant_id = get_user_tenant_id(auth.uid()) AND can_tenant_modify(tenant_id))
  OR is_super_admin(auth.jwt() ->> 'email')
);

-- Fix commissions RLS policies
DROP POLICY IF EXISTS "Users can view commissions in their tenant" ON public.commissions;

CREATE POLICY "Users can view commissions in their tenant"
ON public.commissions
FOR SELECT
USING (
  tenant_id = get_user_tenant_id(auth.uid())
  OR is_super_admin(auth.jwt() ->> 'email')
);

DROP POLICY IF EXISTS "Users can manage commissions in their tenant" ON public.commissions;

CREATE POLICY "Users can manage commissions in their tenant"
ON public.commissions
FOR ALL
USING (
  (tenant_id = get_user_tenant_id(auth.uid()) AND can_tenant_modify(tenant_id))
  OR is_super_admin(auth.jwt() ->> 'email')
);

-- Fix transactions RLS policies
DROP POLICY IF EXISTS "Users can view transactions in their tenant" ON public.transactions;

CREATE POLICY "Users can view transactions in their tenant"
ON public.transactions
FOR SELECT
USING (
  tenant_id = get_user_tenant_id(auth.uid())
  OR is_super_admin(auth.jwt() ->> 'email')
);

DROP POLICY IF EXISTS "Users can insert transactions in their tenant" ON public.transactions;

CREATE POLICY "Users can insert transactions in their tenant"
ON public.transactions
FOR INSERT
WITH CHECK (
  (tenant_id = get_user_tenant_id(auth.uid()) AND can_tenant_modify(tenant_id))
  OR is_super_admin(auth.jwt() ->> 'email')
);

DROP POLICY IF EXISTS "Users can update transactions in their tenant" ON public.transactions;

CREATE POLICY "Users can update transactions in their tenant"
ON public.transactions
FOR UPDATE
USING (
  (tenant_id = get_user_tenant_id(auth.uid()) AND can_tenant_modify(tenant_id))
  OR is_super_admin(auth.jwt() ->> 'email')
);

-- Fix cash_sessions RLS policies
DROP POLICY IF EXISTS "Users can view cash_sessions in their tenant" ON public.cash_sessions;

CREATE POLICY "Users can view cash_sessions in their tenant"
ON public.cash_sessions
FOR SELECT
USING (
  tenant_id = get_user_tenant_id(auth.uid())
  OR is_super_admin(auth.jwt() ->> 'email')
);

DROP POLICY IF EXISTS "Users can insert cash_sessions in their tenant" ON public.cash_sessions;

CREATE POLICY "Users can insert cash_sessions in their tenant"
ON public.cash_sessions
FOR INSERT
WITH CHECK (
  (tenant_id = get_user_tenant_id(auth.uid()) AND can_tenant_modify(tenant_id))
  OR is_super_admin(auth.jwt() ->> 'email')
);

DROP POLICY IF EXISTS "Users can update cash_sessions in their tenant" ON public.cash_sessions;

CREATE POLICY "Users can update cash_sessions in their tenant"
ON public.cash_sessions
FOR UPDATE
USING (
  (tenant_id = get_user_tenant_id(auth.uid()) AND can_tenant_modify(tenant_id))
  OR is_super_admin(auth.jwt() ->> 'email')
);
