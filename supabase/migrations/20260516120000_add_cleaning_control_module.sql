-- Adds the cleaning control segment: properties, cleaning schedule, execution, finances,
-- commissions, staff visibility and private evidence photos.

ALTER TABLE public.tenants
  DROP CONSTRAINT IF EXISTS tenants_package_type_check;

ALTER TABLE public.tenants
  ADD CONSTRAINT tenants_package_type_check
  CHECK (package_type IN ('salon', 'aesthetic_clinic', 'cleaning_control', 'business_erp'));

COMMENT ON COLUMN public.tenants.package_type IS
  'Commercial package used to enable product modules. salon = current package; aesthetic_clinic = clinical/aesthetic module; cleaning_control = cleaning operations; business_erp = all segments.';

CREATE TABLE IF NOT EXISTS public.tenant_segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  segment text NOT NULL CHECK (segment IN ('salon', 'aesthetic_clinic', 'cleaning_control')),
  is_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, segment)
);

INSERT INTO public.tenant_segments (tenant_id, segment, is_enabled)
SELECT id, 'salon', true
FROM public.tenants
ON CONFLICT (tenant_id, segment) DO NOTHING;

INSERT INTO public.tenant_segments (tenant_id, segment, is_enabled)
SELECT id, 'aesthetic_clinic', true
FROM public.tenants
WHERE package_type IN ('aesthetic_clinic', 'business_erp')
ON CONFLICT (tenant_id, segment) DO UPDATE SET is_enabled = true;

INSERT INTO public.tenant_segments (tenant_id, segment, is_enabled)
SELECT id, 'cleaning_control', true
FROM public.tenants
WHERE package_type IN ('cleaning_control', 'business_erp')
ON CONFLICT (tenant_id, segment) DO UPDATE SET is_enabled = true;

CREATE OR REPLACE FUNCTION public.has_aesthetic_package(_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tenants
    WHERE id = _tenant_id
      AND package_type IN ('aesthetic_clinic', 'business_erp')
  )
  OR EXISTS (
    SELECT 1
    FROM public.tenant_segments
    WHERE tenant_id = _tenant_id
      AND segment = 'aesthetic_clinic'
      AND is_enabled
  )
$$;

CREATE OR REPLACE FUNCTION public.has_cleaning_package(_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tenants
    WHERE id = _tenant_id
      AND package_type IN ('cleaning_control', 'business_erp')
  )
  OR EXISTS (
    SELECT 1
    FROM public.tenant_segments
    WHERE tenant_id = _tenant_id
      AND segment = 'cleaning_control'
      AND is_enabled
  )
$$;

CREATE OR REPLACE FUNCTION public.current_user_professional_id(_tenant_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id
  FROM public.professionals
  WHERE tenant_id = _tenant_id
    AND user_id = auth.uid()
    AND deleted_at IS NULL
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.can_view_cleaning(_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_cleaning_package(_tenant_id)
    AND (
      public.is_super_admin(auth.jwt() ->> 'email')
      OR public.has_role(auth.uid(), 'admin', _tenant_id)
      OR public.has_permission(auth.uid(), 'view_schedule', _tenant_id)
      OR public.has_permission(auth.uid(), 'edit_schedule', _tenant_id)
    )
$$;

CREATE OR REPLACE FUNCTION public.can_manage_cleaning(_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_cleaning_package(_tenant_id)
    AND public.can_tenant_modify(_tenant_id)
    AND (
      public.is_super_admin(auth.jwt() ->> 'email')
      OR public.has_role(auth.uid(), 'admin', _tenant_id)
      OR public.has_permission(auth.uid(), 'edit_schedule', _tenant_id)
    )
$$;

CREATE OR REPLACE FUNCTION public.can_view_cleaning_financial(_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_cleaning_package(_tenant_id)
    AND (
      public.is_super_admin(auth.jwt() ->> 'email')
      OR public.has_role(auth.uid(), 'admin', _tenant_id)
      OR public.has_permission(auth.uid(), 'manage_cash_flow', _tenant_id)
    )
$$;

ALTER TABLE public.professionals
  ADD COLUMN IF NOT EXISTS works_cleaning boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cleaning_role text,
  ADD COLUMN IF NOT EXISTS cleaning_commission_type text NOT NULL DEFAULT 'percent' CHECK (cleaning_commission_type IN ('percent', 'fixed', 'mixed')),
  ADD COLUMN IF NOT EXISTS cleaning_commission_percent numeric(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cleaning_commission_fixed numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS can_view_cleaning_commission boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.cleaning_properties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  name text NOT NULL,
  property_type text NOT NULL DEFAULT 'apartamento',
  address text NOT NULL,
  complement text,
  access_instructions text,
  sensitive_access_notes text,
  internal_notes text,
  default_duration_minutes integer NOT NULL DEFAULT 180,
  default_price numeric(10,2) NOT NULL DEFAULT 0,
  default_recurrence text NOT NULL DEFAULT 'none',
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.cleaning_teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  leader_professional_id uuid REFERENCES public.professionals(id) ON DELETE SET NULL,
  color text,
  capacity_per_day integer NOT NULL DEFAULT 1,
  regions text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.cleaning_team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES public.cleaning_teams(id) ON DELETE CASCADE,
  professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (team_id, professional_id)
);

CREATE TABLE IF NOT EXISTS public.cleaning_service_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  category text NOT NULL DEFAULT 'Limpeza',
  duration_minutes integer NOT NULL DEFAULT 180,
  default_price numeric(10,2) NOT NULL DEFAULT 0,
  cost_price numeric(10,2) NOT NULL DEFAULT 0,
  commission_type text NOT NULL DEFAULT 'percent' CHECK (commission_type IN ('percent', 'fixed', 'mixed')),
  commission_percent numeric(5,2) NOT NULL DEFAULT 0,
  commission_fixed numeric(10,2) NOT NULL DEFAULT 0,
  requires_checklist boolean NOT NULL DEFAULT true,
  requires_photos boolean NOT NULL DEFAULT true,
  uses_product_control_default boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.cleaning_appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  property_id uuid REFERENCES public.cleaning_properties(id) ON DELETE SET NULL,
  service_setting_id uuid REFERENCES public.cleaning_service_settings(id) ON DELETE SET NULL,
  professional_id uuid REFERENCES public.professionals(id) ON DELETE SET NULL,
  team_id uuid REFERENCES public.cleaning_teams(id) ON DELETE SET NULL,
  start_time timestamptz NOT NULL,
  end_time timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'confirmed', 'on_the_way', 'in_progress', 'completed', 'cancelled', 'no_show')),
  financial_status text NOT NULL DEFAULT 'pending' CHECK (financial_status IN ('pending', 'partial', 'paid', 'commission_paid', 'cancelled')),
  recurrence_type text NOT NULL DEFAULT 'none' CHECK (recurrence_type IN ('none', 'weekly', 'biweekly', 'monthly', 'custom')),
  address text NOT NULL,
  access_instructions text,
  service_name_snapshot text NOT NULL,
  client_name_snapshot text NOT NULL,
  assignee_name_snapshot text,
  quoted_amount numeric(10,2) NOT NULL DEFAULT 0,
  commission_amount numeric(10,2) NOT NULL DEFAULT 0,
  uses_product_control boolean NOT NULL DEFAULT false,
  requires_checklist boolean NOT NULL DEFAULT true,
  requires_photos boolean NOT NULL DEFAULT true,
  internal_notes text,
  execution_notes text,
  started_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  cancellation_reason text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CHECK (start_time < end_time),
  CHECK (professional_id IS NOT NULL OR team_id IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS public.cleaning_checklist_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  service_setting_id uuid REFERENCES public.cleaning_service_settings(id) ON DELETE CASCADE,
  title text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.cleaning_checklist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  template_id uuid REFERENCES public.cleaning_checklist_templates(id) ON DELETE CASCADE,
  label text NOT NULL,
  is_required boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.cleaning_appointment_checklist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  appointment_id uuid NOT NULL REFERENCES public.cleaning_appointments(id) ON DELETE CASCADE,
  label text NOT NULL,
  is_required boolean NOT NULL DEFAULT true,
  is_completed boolean NOT NULL DEFAULT false,
  completed_by uuid,
  completed_at timestamptz,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.cleaning_appointment_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  appointment_id uuid NOT NULL REFERENCES public.cleaning_appointments(id) ON DELETE CASCADE,
  photo_type text NOT NULL DEFAULT 'after' CHECK (photo_type IN ('before', 'after', 'issue', 'delivery')),
  storage_path text NOT NULL,
  notes text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.cleaning_financial_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  appointment_id uuid REFERENCES public.cleaning_appointments(id) ON DELETE SET NULL,
  entry_type text NOT NULL CHECK (entry_type IN ('receivable', 'received', 'expense', 'commission_payment')),
  category text NOT NULL,
  description text,
  amount numeric(10,2) NOT NULL DEFAULT 0,
  payment_method text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'cancelled')),
  due_date date,
  paid_at timestamptz,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.cleaning_commission_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  professional_id uuid REFERENCES public.professionals(id) ON DELETE CASCADE,
  team_id uuid REFERENCES public.cleaning_teams(id) ON DELETE CASCADE,
  service_setting_id uuid REFERENCES public.cleaning_service_settings(id) ON DELETE CASCADE,
  commission_type text NOT NULL DEFAULT 'percent' CHECK (commission_type IN ('percent', 'fixed', 'mixed')),
  commission_percent numeric(5,2) NOT NULL DEFAULT 0,
  commission_fixed numeric(10,2) NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.cleaning_commission_payables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  appointment_id uuid REFERENCES public.cleaning_appointments(id) ON DELETE SET NULL,
  professional_id uuid REFERENCES public.professionals(id) ON DELETE SET NULL,
  team_id uuid REFERENCES public.cleaning_teams(id) ON DELETE SET NULL,
  base_amount numeric(10,2) NOT NULL DEFAULT 0,
  commission_amount numeric(10,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'paid', 'cancelled')),
  due_date date,
  paid_at timestamptz,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.cleaning_staff_visibility (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  can_view_client_phone boolean NOT NULL DEFAULT true,
  can_view_full_address boolean NOT NULL DEFAULT true,
  can_view_access_instructions boolean NOT NULL DEFAULT true,
  can_view_internal_notes boolean NOT NULL DEFAULT false,
  can_view_customer_price boolean NOT NULL DEFAULT false,
  can_view_own_commission boolean NOT NULL DEFAULT false,
  can_view_financial_status boolean NOT NULL DEFAULT false,
  can_view_team_schedule boolean NOT NULL DEFAULT false,
  can_view_client_history boolean NOT NULL DEFAULT false,
  can_manage_products_used boolean NOT NULL DEFAULT false,
  can_cancel_own_appointment boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, professional_id)
);

CREATE INDEX IF NOT EXISTS tenant_segments_tenant_idx ON public.tenant_segments (tenant_id, segment);
CREATE INDEX IF NOT EXISTS cleaning_properties_tenant_client_idx ON public.cleaning_properties (tenant_id, client_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS cleaning_teams_tenant_idx ON public.cleaning_teams (tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS cleaning_team_members_team_idx ON public.cleaning_team_members (tenant_id, team_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS cleaning_services_tenant_idx ON public.cleaning_service_settings (tenant_id, is_active) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS cleaning_appointments_tenant_start_idx ON public.cleaning_appointments (tenant_id, start_time) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS cleaning_appointments_professional_idx ON public.cleaning_appointments (tenant_id, professional_id, start_time) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS cleaning_financial_entries_tenant_idx ON public.cleaning_financial_entries (tenant_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS cleaning_commission_payables_tenant_idx ON public.cleaning_commission_payables (tenant_id, created_at DESC) WHERE deleted_at IS NULL;

ALTER TABLE public.tenant_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cleaning_properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cleaning_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cleaning_team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cleaning_service_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cleaning_appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cleaning_checklist_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cleaning_checklist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cleaning_appointment_checklist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cleaning_appointment_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cleaning_financial_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cleaning_commission_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cleaning_commission_payables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cleaning_staff_visibility ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.can_view_cleaning_appointment(
  _tenant_id uuid,
  _professional_id uuid,
  _team_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_cleaning_package(_tenant_id)
    AND (
      public.is_super_admin(auth.jwt() ->> 'email')
      OR public.has_role(auth.uid(), 'admin', _tenant_id)
      OR public.has_permission(auth.uid(), 'edit_schedule', _tenant_id)
      OR (
        public.has_permission(auth.uid(), 'view_schedule', _tenant_id)
        AND (
          _professional_id = public.current_user_professional_id(_tenant_id)
          OR EXISTS (
            SELECT 1
            FROM public.cleaning_team_members ctm
            WHERE ctm.team_id = _team_id
              AND ctm.professional_id = public.current_user_professional_id(_tenant_id)
              AND ctm.deleted_at IS NULL
          )
        )
      )
    )
$$;

CREATE OR REPLACE FUNCTION public.can_view_cleaning_commission(
  _tenant_id uuid,
  _professional_id uuid,
  _team_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_cleaning_package(_tenant_id)
    AND (
      public.is_super_admin(auth.jwt() ->> 'email')
      OR public.has_role(auth.uid(), 'admin', _tenant_id)
      OR public.has_permission(auth.uid(), 'manage_cash_flow', _tenant_id)
      OR (
        public.has_permission(auth.uid(), 'view_commissions', _tenant_id)
        AND (
          _professional_id = public.current_user_professional_id(_tenant_id)
          OR EXISTS (
            SELECT 1
            FROM public.cleaning_team_members ctm
            WHERE ctm.team_id = _team_id
              AND ctm.professional_id = public.current_user_professional_id(_tenant_id)
              AND ctm.deleted_at IS NULL
          )
        )
      )
    )
$$;

CREATE OR REPLACE FUNCTION public.cleaning_storage_appointment_id(_name text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, storage
AS $$
  SELECT CASE
    WHEN (storage.foldername(_name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN ((storage.foldername(_name))[2])::uuid
    ELSE NULL
  END
$$;

CREATE OR REPLACE FUNCTION public.can_view_cleaning_storage_object(_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, storage
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.cleaning_appointments ca
    WHERE ca.id = public.cleaning_storage_appointment_id(_name)
      AND ca.tenant_id = public.storage_object_tenant_id(_name)
      AND ca.deleted_at IS NULL
      AND public.can_view_cleaning_appointment(ca.tenant_id, ca.professional_id, ca.team_id)
  )
$$;

DROP POLICY IF EXISTS "Tenant admins can manage tenant segments" ON public.tenant_segments;
CREATE POLICY "Tenant admins can manage tenant segments"
ON public.tenant_segments
FOR ALL
USING (public.is_super_admin(auth.jwt() ->> 'email') OR public.has_role(auth.uid(), 'admin', tenant_id))
WITH CHECK (public.is_super_admin(auth.jwt() ->> 'email') OR public.has_role(auth.uid(), 'admin', tenant_id));

DROP POLICY IF EXISTS "Users can view cleaning properties" ON public.cleaning_properties;
CREATE POLICY "Users can view cleaning properties"
ON public.cleaning_properties
FOR SELECT
USING (
  public.has_cleaning_package(tenant_id)
  AND (
    public.is_super_admin(auth.jwt() ->> 'email')
    OR public.has_role(auth.uid(), 'admin', tenant_id)
    OR public.has_permission(auth.uid(), 'edit_schedule', tenant_id)
  )
);

DROP POLICY IF EXISTS "Users can manage cleaning properties" ON public.cleaning_properties;
CREATE POLICY "Users can manage cleaning properties"
ON public.cleaning_properties
FOR ALL
USING (public.can_manage_cleaning(tenant_id))
WITH CHECK (public.can_manage_cleaning(tenant_id));

DROP POLICY IF EXISTS "Users can view cleaning teams" ON public.cleaning_teams;
CREATE POLICY "Users can view cleaning teams"
ON public.cleaning_teams
FOR SELECT
USING (public.can_view_cleaning(tenant_id));

DROP POLICY IF EXISTS "Users can manage cleaning teams" ON public.cleaning_teams;
CREATE POLICY "Users can manage cleaning teams"
ON public.cleaning_teams
FOR ALL
USING (public.can_manage_cleaning(tenant_id))
WITH CHECK (public.can_manage_cleaning(tenant_id));

DROP POLICY IF EXISTS "Users can view cleaning team members" ON public.cleaning_team_members;
CREATE POLICY "Users can view cleaning team members"
ON public.cleaning_team_members
FOR SELECT
USING (public.can_view_cleaning(tenant_id));

DROP POLICY IF EXISTS "Users can manage cleaning team members" ON public.cleaning_team_members;
CREATE POLICY "Users can manage cleaning team members"
ON public.cleaning_team_members
FOR ALL
USING (public.can_manage_cleaning(tenant_id))
WITH CHECK (public.can_manage_cleaning(tenant_id));

DROP POLICY IF EXISTS "Users can view cleaning services" ON public.cleaning_service_settings;
CREATE POLICY "Users can view cleaning services"
ON public.cleaning_service_settings
FOR SELECT
USING (public.can_view_cleaning(tenant_id));

DROP POLICY IF EXISTS "Users can manage cleaning services" ON public.cleaning_service_settings;
CREATE POLICY "Users can manage cleaning services"
ON public.cleaning_service_settings
FOR ALL
USING (public.can_manage_cleaning(tenant_id))
WITH CHECK (public.can_manage_cleaning(tenant_id));

DROP POLICY IF EXISTS "Users can view cleaning appointments" ON public.cleaning_appointments;
CREATE POLICY "Users can view cleaning appointments"
ON public.cleaning_appointments
FOR SELECT
USING (public.can_view_cleaning_appointment(tenant_id, professional_id, team_id));

DROP POLICY IF EXISTS "Users can manage cleaning appointments" ON public.cleaning_appointments;
CREATE POLICY "Users can manage cleaning appointments"
ON public.cleaning_appointments
FOR ALL
USING (public.can_manage_cleaning(tenant_id))
WITH CHECK (public.can_manage_cleaning(tenant_id));

DROP POLICY IF EXISTS "Users can view cleaning checklist templates" ON public.cleaning_checklist_templates;
CREATE POLICY "Users can view cleaning checklist templates"
ON public.cleaning_checklist_templates
FOR SELECT
USING (public.can_view_cleaning(tenant_id));

DROP POLICY IF EXISTS "Users can manage cleaning checklist templates" ON public.cleaning_checklist_templates;
CREATE POLICY "Users can manage cleaning checklist templates"
ON public.cleaning_checklist_templates
FOR ALL
USING (public.can_manage_cleaning(tenant_id))
WITH CHECK (public.can_manage_cleaning(tenant_id));

DROP POLICY IF EXISTS "Users can view cleaning checklist items" ON public.cleaning_checklist_items;
CREATE POLICY "Users can view cleaning checklist items"
ON public.cleaning_checklist_items
FOR SELECT
USING (public.can_view_cleaning(tenant_id));

DROP POLICY IF EXISTS "Users can manage cleaning checklist items" ON public.cleaning_checklist_items;
CREATE POLICY "Users can manage cleaning checklist items"
ON public.cleaning_checklist_items
FOR ALL
USING (public.can_manage_cleaning(tenant_id))
WITH CHECK (public.can_manage_cleaning(tenant_id));

DROP POLICY IF EXISTS "Users can view cleaning appointment checklist" ON public.cleaning_appointment_checklist;
CREATE POLICY "Users can view cleaning appointment checklist"
ON public.cleaning_appointment_checklist
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.cleaning_appointments ca
    WHERE ca.id = appointment_id
      AND ca.tenant_id = tenant_id
      AND ca.deleted_at IS NULL
      AND public.can_view_cleaning_appointment(ca.tenant_id, ca.professional_id, ca.team_id)
  )
);

DROP POLICY IF EXISTS "Users can manage cleaning appointment checklist" ON public.cleaning_appointment_checklist;
CREATE POLICY "Users can manage cleaning appointment checklist"
ON public.cleaning_appointment_checklist
FOR ALL
USING (public.can_manage_cleaning(tenant_id))
WITH CHECK (public.can_manage_cleaning(tenant_id));

DROP POLICY IF EXISTS "Users can view cleaning appointment photos" ON public.cleaning_appointment_photos;
CREATE POLICY "Users can view cleaning appointment photos"
ON public.cleaning_appointment_photos
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.cleaning_appointments ca
    WHERE ca.id = appointment_id
      AND ca.tenant_id = tenant_id
      AND ca.deleted_at IS NULL
      AND public.can_view_cleaning_appointment(ca.tenant_id, ca.professional_id, ca.team_id)
  )
);

DROP POLICY IF EXISTS "Users can manage cleaning appointment photos" ON public.cleaning_appointment_photos;
CREATE POLICY "Users can manage cleaning appointment photos"
ON public.cleaning_appointment_photos
FOR ALL
USING (public.can_manage_cleaning(tenant_id))
WITH CHECK (public.can_manage_cleaning(tenant_id));

DROP POLICY IF EXISTS "Finance can view cleaning entries" ON public.cleaning_financial_entries;
CREATE POLICY "Finance can view cleaning entries"
ON public.cleaning_financial_entries
FOR SELECT
USING (public.can_view_cleaning_financial(tenant_id));

DROP POLICY IF EXISTS "Finance can manage cleaning entries" ON public.cleaning_financial_entries;
CREATE POLICY "Finance can manage cleaning entries"
ON public.cleaning_financial_entries
FOR ALL
USING (public.can_view_cleaning_financial(tenant_id) AND public.can_tenant_modify(tenant_id))
WITH CHECK (public.can_view_cleaning_financial(tenant_id) AND public.can_tenant_modify(tenant_id));

DROP POLICY IF EXISTS "Finance can view cleaning commission rules" ON public.cleaning_commission_rules;
CREATE POLICY "Finance can view cleaning commission rules"
ON public.cleaning_commission_rules
FOR SELECT
USING (public.can_view_cleaning_financial(tenant_id));

DROP POLICY IF EXISTS "Finance can manage cleaning commission rules" ON public.cleaning_commission_rules;
CREATE POLICY "Finance can manage cleaning commission rules"
ON public.cleaning_commission_rules
FOR ALL
USING (public.can_view_cleaning_financial(tenant_id) AND public.can_tenant_modify(tenant_id))
WITH CHECK (public.can_view_cleaning_financial(tenant_id) AND public.can_tenant_modify(tenant_id));

DROP POLICY IF EXISTS "Users can view own cleaning commissions" ON public.cleaning_commission_payables;
CREATE POLICY "Users can view own cleaning commissions"
ON public.cleaning_commission_payables
FOR SELECT
USING (public.can_view_cleaning_commission(tenant_id, professional_id, team_id));

DROP POLICY IF EXISTS "Finance can manage cleaning commissions" ON public.cleaning_commission_payables;
CREATE POLICY "Finance can manage cleaning commissions"
ON public.cleaning_commission_payables
FOR ALL
USING (public.can_view_cleaning_financial(tenant_id) AND public.can_tenant_modify(tenant_id))
WITH CHECK (public.can_view_cleaning_financial(tenant_id) AND public.can_tenant_modify(tenant_id));

DROP POLICY IF EXISTS "Users can view cleaning staff visibility" ON public.cleaning_staff_visibility;
CREATE POLICY "Users can view cleaning staff visibility"
ON public.cleaning_staff_visibility
FOR SELECT
USING (
  public.can_view_cleaning_financial(tenant_id)
  OR professional_id = public.current_user_professional_id(tenant_id)
);

DROP POLICY IF EXISTS "Admins can manage cleaning staff visibility" ON public.cleaning_staff_visibility;
CREATE POLICY "Admins can manage cleaning staff visibility"
ON public.cleaning_staff_visibility
FOR ALL
USING (public.can_view_cleaning_financial(tenant_id) AND public.can_tenant_modify(tenant_id))
WITH CHECK (public.can_view_cleaning_financial(tenant_id) AND public.can_tenant_modify(tenant_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.tenant_segments,
  public.cleaning_properties,
  public.cleaning_teams,
  public.cleaning_team_members,
  public.cleaning_service_settings,
  public.cleaning_appointments,
  public.cleaning_checklist_templates,
  public.cleaning_checklist_items,
  public.cleaning_appointment_checklist,
  public.cleaning_appointment_photos,
  public.cleaning_financial_entries,
  public.cleaning_commission_rules,
  public.cleaning_commission_payables,
  public.cleaning_staff_visibility
TO authenticated;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'cleaning-appointment-photos',
  'cleaning-appointment-photos',
  false,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

DROP POLICY IF EXISTS "Users can upload cleaning photos" ON storage.objects;
CREATE POLICY "Users can upload cleaning photos"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'cleaning-appointment-photos'
  AND auth.role() = 'authenticated'
  AND public.has_cleaning_package(public.storage_object_tenant_id(name))
  AND public.can_manage_cleaning(public.storage_object_tenant_id(name))
);

DROP POLICY IF EXISTS "Users can view cleaning photos" ON storage.objects;
CREATE POLICY "Users can view cleaning photos"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'cleaning-appointment-photos'
  AND auth.role() = 'authenticated'
  AND public.has_cleaning_package(public.storage_object_tenant_id(name))
  AND public.can_view_cleaning_storage_object(name)
);

DROP POLICY IF EXISTS "Users can update cleaning photos" ON storage.objects;
CREATE POLICY "Users can update cleaning photos"
ON storage.objects
FOR UPDATE
USING (
  bucket_id = 'cleaning-appointment-photos'
  AND auth.role() = 'authenticated'
  AND public.has_cleaning_package(public.storage_object_tenant_id(name))
  AND public.can_manage_cleaning(public.storage_object_tenant_id(name))
)
WITH CHECK (
  bucket_id = 'cleaning-appointment-photos'
  AND auth.role() = 'authenticated'
  AND public.has_cleaning_package(public.storage_object_tenant_id(name))
  AND public.can_manage_cleaning(public.storage_object_tenant_id(name))
);

DROP POLICY IF EXISTS "Users can delete cleaning photos" ON storage.objects;
CREATE POLICY "Users can delete cleaning photos"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'cleaning-appointment-photos'
  AND auth.role() = 'authenticated'
  AND public.has_cleaning_package(public.storage_object_tenant_id(name))
  AND public.can_manage_cleaning(public.storage_object_tenant_id(name))
);
