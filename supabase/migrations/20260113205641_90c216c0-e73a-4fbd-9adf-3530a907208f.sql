-- Criar enum para status do tenant
CREATE TYPE public.tenant_status AS ENUM ('active', 'readonly', 'blocked');

-- Criar enum para forma de pagamento
CREATE TYPE public.payment_method_type AS ENUM ('pix', 'boleto', 'cartao', 'transferencia');

-- Criar tabela de tenants (clientes B2B)
CREATE TABLE public.tenants (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  cnpj TEXT,
  cpf TEXT,
  payment_method payment_method_type NOT NULL DEFAULT 'pix',
  subscription_due_date DATE,
  status tenant_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Criar tabela de super admins (emails que podem gerenciar tenants)
CREATE TABLE public.super_admins (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Adicionar tenant_id em todas as tabelas existentes
ALTER TABLE public.professionals ADD COLUMN tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.clients ADD COLUMN tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.services ADD COLUMN tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.products ADD COLUMN tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.appointments ADD COLUMN tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.cash_sessions ADD COLUMN tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.transactions ADD COLUMN tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.commissions ADD COLUMN tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.profiles ADD COLUMN tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.user_roles ADD COLUMN tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.user_permissions ADD COLUMN tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;

-- Habilitar RLS na tabela tenants
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.super_admins ENABLE ROW LEVEL SECURITY;

-- Função para verificar se é super admin
CREATE OR REPLACE FUNCTION public.is_super_admin(_email TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.super_admins
    WHERE email = _email
  )
$$;

-- Função para pegar o tenant_id do usuário atual
CREATE OR REPLACE FUNCTION public.get_user_tenant_id(_user_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tenant_id
  FROM public.profiles
  WHERE id = _user_id
  LIMIT 1
$$;

-- Função para verificar se o tenant está ativo (não bloqueado)
CREATE OR REPLACE FUNCTION public.is_tenant_active(_tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tenants
    WHERE id = _tenant_id
    AND status = 'active'
  )
$$;

-- Função para verificar se o tenant pode modificar dados (não readonly nem blocked)
CREATE OR REPLACE FUNCTION public.can_tenant_modify(_tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tenants
    WHERE id = _tenant_id
    AND status = 'active'
  )
$$;

-- Políticas para super_admins (apenas super admins podem ver)
CREATE POLICY "Super admins can view super_admins"
ON public.super_admins FOR SELECT
USING (public.is_super_admin((SELECT email FROM auth.users WHERE id = auth.uid())));

CREATE POLICY "Super admins can manage super_admins"
ON public.super_admins FOR ALL
USING (public.is_super_admin((SELECT email FROM auth.users WHERE id = auth.uid())));

-- Políticas para tenants
CREATE POLICY "Super admins can view all tenants"
ON public.tenants FOR SELECT
USING (public.is_super_admin((SELECT email FROM auth.users WHERE id = auth.uid())));

CREATE POLICY "Super admins can manage tenants"
ON public.tenants FOR ALL
USING (public.is_super_admin((SELECT email FROM auth.users WHERE id = auth.uid())));

-- Atualizar políticas das tabelas existentes para filtrar por tenant_id
-- Primeiro dropar as políticas antigas

-- PROFESSIONALS
DROP POLICY IF EXISTS "Authenticated users can manage professionals" ON public.professionals;
DROP POLICY IF EXISTS "Authenticated users can view professionals" ON public.professionals;

CREATE POLICY "Users can view professionals in their tenant"
ON public.professionals FOR SELECT
USING (
  tenant_id = public.get_user_tenant_id(auth.uid())
  OR public.is_super_admin((SELECT email FROM auth.users WHERE id = auth.uid()))
);

CREATE POLICY "Users can manage professionals in their tenant"
ON public.professionals FOR ALL
USING (
  (tenant_id = public.get_user_tenant_id(auth.uid()) AND public.can_tenant_modify(tenant_id))
  OR public.is_super_admin((SELECT email FROM auth.users WHERE id = auth.uid()))
);

-- CLIENTS
DROP POLICY IF EXISTS "Authenticated users can manage clients" ON public.clients;
DROP POLICY IF EXISTS "Authenticated users can view clients" ON public.clients;

CREATE POLICY "Users can view clients in their tenant"
ON public.clients FOR SELECT
USING (
  tenant_id = public.get_user_tenant_id(auth.uid())
  OR public.is_super_admin((SELECT email FROM auth.users WHERE id = auth.uid()))
);

CREATE POLICY "Users can manage clients in their tenant"
ON public.clients FOR ALL
USING (
  (tenant_id = public.get_user_tenant_id(auth.uid()) AND public.can_tenant_modify(tenant_id))
  OR public.is_super_admin((SELECT email FROM auth.users WHERE id = auth.uid()))
);

-- SERVICES
DROP POLICY IF EXISTS "Authenticated users can manage services" ON public.services;
DROP POLICY IF EXISTS "Authenticated users can view services" ON public.services;

CREATE POLICY "Users can view services in their tenant"
ON public.services FOR SELECT
USING (
  tenant_id = public.get_user_tenant_id(auth.uid())
  OR public.is_super_admin((SELECT email FROM auth.users WHERE id = auth.uid()))
);

CREATE POLICY "Users can manage services in their tenant"
ON public.services FOR ALL
USING (
  (tenant_id = public.get_user_tenant_id(auth.uid()) AND public.can_tenant_modify(tenant_id))
  OR public.is_super_admin((SELECT email FROM auth.users WHERE id = auth.uid()))
);

-- PRODUCTS
DROP POLICY IF EXISTS "Authenticated users can manage products" ON public.products;
DROP POLICY IF EXISTS "Authenticated users can view products" ON public.products;

CREATE POLICY "Users can view products in their tenant"
ON public.products FOR SELECT
USING (
  tenant_id = public.get_user_tenant_id(auth.uid())
  OR public.is_super_admin((SELECT email FROM auth.users WHERE id = auth.uid()))
);

CREATE POLICY "Users can manage products in their tenant"
ON public.products FOR ALL
USING (
  (tenant_id = public.get_user_tenant_id(auth.uid()) AND public.can_tenant_modify(tenant_id))
  OR public.is_super_admin((SELECT email FROM auth.users WHERE id = auth.uid()))
);

-- APPOINTMENTS
DROP POLICY IF EXISTS "Authenticated users can manage appointments" ON public.appointments;
DROP POLICY IF EXISTS "Authenticated users can view appointments" ON public.appointments;

CREATE POLICY "Users can view appointments in their tenant"
ON public.appointments FOR SELECT
USING (
  tenant_id = public.get_user_tenant_id(auth.uid())
  OR public.is_super_admin((SELECT email FROM auth.users WHERE id = auth.uid()))
);

CREATE POLICY "Users can manage appointments in their tenant"
ON public.appointments FOR ALL
USING (
  (tenant_id = public.get_user_tenant_id(auth.uid()) AND public.can_tenant_modify(tenant_id))
  OR public.is_super_admin((SELECT email FROM auth.users WHERE id = auth.uid()))
);

-- CASH_SESSIONS
DROP POLICY IF EXISTS "Authenticated users can insert cash sessions" ON public.cash_sessions;
DROP POLICY IF EXISTS "Authenticated users can update cash sessions" ON public.cash_sessions;
DROP POLICY IF EXISTS "Authenticated users can view cash sessions" ON public.cash_sessions;

CREATE POLICY "Users can view cash_sessions in their tenant"
ON public.cash_sessions FOR SELECT
USING (
  tenant_id = public.get_user_tenant_id(auth.uid())
  OR public.is_super_admin((SELECT email FROM auth.users WHERE id = auth.uid()))
);

CREATE POLICY "Users can insert cash_sessions in their tenant"
ON public.cash_sessions FOR INSERT
WITH CHECK (
  (tenant_id = public.get_user_tenant_id(auth.uid()) AND public.can_tenant_modify(tenant_id))
  OR public.is_super_admin((SELECT email FROM auth.users WHERE id = auth.uid()))
);

CREATE POLICY "Users can update cash_sessions in their tenant"
ON public.cash_sessions FOR UPDATE
USING (
  (tenant_id = public.get_user_tenant_id(auth.uid()) AND public.can_tenant_modify(tenant_id))
  OR public.is_super_admin((SELECT email FROM auth.users WHERE id = auth.uid()))
);

-- TRANSACTIONS
DROP POLICY IF EXISTS "Authenticated users can insert transactions" ON public.transactions;
DROP POLICY IF EXISTS "Authenticated users can update transactions" ON public.transactions;
DROP POLICY IF EXISTS "Authenticated users can view transactions" ON public.transactions;

CREATE POLICY "Users can view transactions in their tenant"
ON public.transactions FOR SELECT
USING (
  tenant_id = public.get_user_tenant_id(auth.uid())
  OR public.is_super_admin((SELECT email FROM auth.users WHERE id = auth.uid()))
);

CREATE POLICY "Users can insert transactions in their tenant"
ON public.transactions FOR INSERT
WITH CHECK (
  (tenant_id = public.get_user_tenant_id(auth.uid()) AND public.can_tenant_modify(tenant_id))
  OR public.is_super_admin((SELECT email FROM auth.users WHERE id = auth.uid()))
);

CREATE POLICY "Users can update transactions in their tenant"
ON public.transactions FOR UPDATE
USING (
  (tenant_id = public.get_user_tenant_id(auth.uid()) AND public.can_tenant_modify(tenant_id))
  OR public.is_super_admin((SELECT email FROM auth.users WHERE id = auth.uid()))
);

-- COMMISSIONS
DROP POLICY IF EXISTS "Authenticated users can manage commissions" ON public.commissions;
DROP POLICY IF EXISTS "Authenticated users can view commissions" ON public.commissions;

CREATE POLICY "Users can view commissions in their tenant"
ON public.commissions FOR SELECT
USING (
  tenant_id = public.get_user_tenant_id(auth.uid())
  OR public.is_super_admin((SELECT email FROM auth.users WHERE id = auth.uid()))
);

CREATE POLICY "Users can manage commissions in their tenant"
ON public.commissions FOR ALL
USING (
  (tenant_id = public.get_user_tenant_id(auth.uid()) AND public.can_tenant_modify(tenant_id))
  OR public.is_super_admin((SELECT email FROM auth.users WHERE id = auth.uid()))
);

-- PROFILES - atualizar políticas
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;

CREATE POLICY "Users can view own profile or admin can view tenant profiles"
ON public.profiles FOR SELECT
USING (
  id = auth.uid()
  OR (tenant_id = public.get_user_tenant_id(auth.uid()) AND public.has_role(auth.uid(), 'admin'))
  OR public.is_super_admin((SELECT email FROM auth.users WHERE id = auth.uid()))
);

CREATE POLICY "Users can update own profile"
ON public.profiles FOR UPDATE
USING (id = auth.uid());

CREATE POLICY "Super admins can insert profiles"
ON public.profiles FOR INSERT
WITH CHECK (
  id = auth.uid()
  OR public.is_super_admin((SELECT email FROM auth.users WHERE id = auth.uid()))
);

-- USER_ROLES - atualizar políticas
DROP POLICY IF EXISTS "Admins can delete roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can insert roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can update roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can view all roles" ON public.user_roles;

CREATE POLICY "Users can view roles in their tenant"
ON public.user_roles FOR SELECT
USING (
  user_id = auth.uid()
  OR (tenant_id = public.get_user_tenant_id(auth.uid()) AND public.has_role(auth.uid(), 'admin'))
  OR public.is_super_admin((SELECT email FROM auth.users WHERE id = auth.uid()))
);

CREATE POLICY "Admins can manage roles in their tenant"
ON public.user_roles FOR ALL
USING (
  (tenant_id = public.get_user_tenant_id(auth.uid()) AND public.has_role(auth.uid(), 'admin'))
  OR public.is_super_admin((SELECT email FROM auth.users WHERE id = auth.uid()))
);

-- USER_PERMISSIONS - atualizar políticas
DROP POLICY IF EXISTS "Admins can manage permissions" ON public.user_permissions;
DROP POLICY IF EXISTS "Admins can view all permissions" ON public.user_permissions;

CREATE POLICY "Users can view permissions in their tenant"
ON public.user_permissions FOR SELECT
USING (
  user_id = auth.uid()
  OR (tenant_id = public.get_user_tenant_id(auth.uid()) AND public.has_role(auth.uid(), 'admin'))
  OR public.is_super_admin((SELECT email FROM auth.users WHERE id = auth.uid()))
);

CREATE POLICY "Admins can manage permissions in their tenant"
ON public.user_permissions FOR ALL
USING (
  (tenant_id = public.get_user_tenant_id(auth.uid()) AND public.has_role(auth.uid(), 'admin'))
  OR public.is_super_admin((SELECT email FROM auth.users WHERE id = auth.uid()))
);

-- Trigger para atualizar updated_at nos tenants
CREATE TRIGGER update_tenants_updated_at
BEFORE UPDATE ON public.tenants
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();