-- Harden tenant authorization, online booking writes and Storage access.
-- This migration keeps the existing app contracts while moving critical checks to the database.

CREATE OR REPLACE FUNCTION public.is_super_admin(_email text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _email IS NOT NULL
    AND lower(_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    AND EXISTS (
      SELECT 1
      FROM public.super_admins
      WHERE lower(email) = lower(_email)
    )
$$;

CREATE OR REPLACE FUNCTION public.get_user_tenant_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tenant_id
  FROM public.profiles
  WHERE id = _user_id
    AND (
      _user_id = auth.uid()
      OR public.is_super_admin(auth.jwt() ->> 'email')
    )
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (
    _user_id = auth.uid()
    OR public.is_super_admin(auth.jwt() ->> 'email')
  )
  AND EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role, _tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (
    _user_id = auth.uid()
    OR public.is_super_admin(auth.jwt() ->> 'email')
  )
  AND EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
      AND tenant_id = _tenant_id
  )
$$;

CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _permission public.permission_type)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (
    _user_id = auth.uid()
    OR public.is_super_admin(auth.jwt() ->> 'email')
  )
  AND (
    EXISTS (
      SELECT 1
      FROM public.user_permissions
      WHERE user_id = _user_id
        AND permission = _permission
    )
    OR EXISTS (
      SELECT 1
      FROM public.user_roles
      WHERE user_id = _user_id
        AND role = 'admin'
    )
  )
$$;

CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _permission public.permission_type, _tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (
    _user_id = auth.uid()
    OR public.is_super_admin(auth.jwt() ->> 'email')
  )
  AND (
    EXISTS (
      SELECT 1
      FROM public.user_permissions
      WHERE user_id = _user_id
        AND permission = _permission
        AND tenant_id = _tenant_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.user_roles
      WHERE user_id = _user_id
        AND role = 'admin'
        AND tenant_id = _tenant_id
    )
  )
$$;

CREATE OR REPLACE FUNCTION public.can_tenant_modify(_tenant_id uuid)
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
      AND status = 'active'
      AND (subscription_due_date IS NULL OR subscription_due_date >= current_date)
  )
$$;

CREATE OR REPLACE FUNCTION public.is_tenant_active(_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.can_tenant_modify(_tenant_id)
$$;

CREATE OR REPLACE FUNCTION public.is_tenant_booking_active(_tenant_id uuid)
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
      AND status = 'active'
      AND booking_slug IS NOT NULL
      AND (subscription_due_date IS NULL OR subscription_due_date >= current_date)
  )
$$;

CREATE OR REPLACE FUNCTION public.storage_object_tenant_id(_name text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, storage
AS $$
  SELECT CASE
    WHEN (storage.foldername(_name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN ((storage.foldername(_name))[1])::uuid
    ELSE NULL
  END
$$;

CREATE OR REPLACE FUNCTION public.can_manage_tenant_storage(_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_super_admin(auth.jwt() ->> 'email')
    OR public.has_role(auth.uid(), 'admin', _tenant_id)
$$;

CREATE OR REPLACE FUNCTION public.can_manage_client_photo(_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.can_manage_tenant_storage(_tenant_id)
    OR EXISTS (
      SELECT 1
      FROM public.client_accounts
      WHERE user_id = auth.uid()
        AND tenant_id = _tenant_id
    )
$$;

CREATE OR REPLACE FUNCTION public.can_upload_client_photo(_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.can_manage_client_photo(_tenant_id)
    OR public.is_tenant_booking_active(_tenant_id)
$$;

CREATE OR REPLACE FUNCTION public.can_manage_professional_photo(_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.can_manage_tenant_storage(_tenant_id)
    OR EXISTS (
      SELECT 1
      FROM public.professionals
      WHERE user_id = auth.uid()
        AND tenant_id = _tenant_id
    )
$$;

CREATE OR REPLACE FUNCTION public.can_client_create_online_appointment(
  _tenant_id uuid,
  _client_id uuid,
  _professional_id uuid,
  _service_id uuid,
  _client_user_id uuid,
  _start_time timestamp with time zone,
  _end_time timestamp with time zone
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _client_user_id = auth.uid()
    AND _start_time < _end_time
    AND public.is_tenant_booking_active(_tenant_id)
    AND EXISTS (
      SELECT 1
      FROM public.client_accounts ca
      JOIN public.clients c ON c.id = ca.client_id
      WHERE ca.user_id = auth.uid()
        AND ca.tenant_id = _tenant_id
        AND ca.client_id = _client_id
        AND c.tenant_id = _tenant_id
        AND c.deleted_at IS NULL
    )
    AND EXISTS (
      SELECT 1
      FROM public.services s
      WHERE s.id = _service_id
        AND s.tenant_id = _tenant_id
        AND s.is_active = true
        AND s.allow_online_booking = true
        AND s.deleted_at IS NULL
    )
    AND EXISTS (
      SELECT 1
      FROM public.professionals p
      WHERE p.id = _professional_id
        AND p.tenant_id = _tenant_id
        AND p.is_active = true
        AND p.deleted_at IS NULL
    )
    AND EXISTS (
      SELECT 1
      FROM public.service_professionals sp
      WHERE sp.tenant_id = _tenant_id
        AND sp.service_id = _service_id
        AND sp.professional_id = _professional_id
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.appointments a
      WHERE a.tenant_id = _tenant_id
        AND a.professional_id = _professional_id
        AND a.deleted_at IS NULL
        AND a.status IN ('pre_scheduled', 'scheduled', 'confirmed', 'in_progress')
        AND tstzrange(a.start_time, a.end_time, '[)') && tstzrange(_start_time, _end_time, '[)')
    )
$$;

CREATE OR REPLACE FUNCTION public.guard_client_appointment_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  requester uuid := auth.uid();
BEGIN
  IF requester IS NULL THEN
    RETURN NEW;
  END IF;

  IF public.is_super_admin(auth.jwt() ->> 'email')
    OR NEW.tenant_id = public.get_user_tenant_id(requester) THEN
    RETURN NEW;
  END IF;

  IF OLD.client_user_id = requester THEN
    IF NEW.id = OLD.id
      AND NEW.tenant_id IS NOT DISTINCT FROM OLD.tenant_id
      AND NEW.client_id IS NOT DISTINCT FROM OLD.client_id
      AND NEW.client_user_id IS NOT DISTINCT FROM OLD.client_user_id
      AND NEW.professional_id IS NOT DISTINCT FROM OLD.professional_id
      AND NEW.service_id IS NOT DISTINCT FROM OLD.service_id
      AND NEW.start_time IS NOT DISTINCT FROM OLD.start_time
      AND NEW.end_time IS NOT DISTINCT FROM OLD.end_time
      AND NEW.booking_source IS NOT DISTINCT FROM OLD.booking_source
      AND NEW.notes IS NOT DISTINCT FROM OLD.notes
      AND NEW.total_value IS NOT DISTINCT FROM OLD.total_value
      AND NEW.deleted_at IS NOT DISTINCT FROM OLD.deleted_at
      AND OLD.status IN ('pre_scheduled', 'scheduled', 'confirmed')
      AND NEW.status = 'cancelled' THEN
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'Clientes podem apenas cancelar os próprios agendamentos elegíveis.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_client_appointment_update ON public.appointments;
CREATE TRIGGER guard_client_appointment_update
BEFORE UPDATE ON public.appointments
FOR EACH ROW
EXECUTE FUNCTION public.guard_client_appointment_update();

ALTER TABLE public.appointments
  DROP CONSTRAINT IF EXISTS appointments_status_check;

ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_status_check
  CHECK (status = ANY (ARRAY[
    'pre_scheduled',
    'scheduled',
    'confirmed',
    'in_progress',
    'completed',
    'cancelled'
  ]));

DROP POLICY IF EXISTS "Clients can create appointments" ON public.appointments;
CREATE POLICY "Clients can create appointments"
ON public.appointments
FOR INSERT
WITH CHECK (
  booking_source = 'online'
  AND status = 'pre_scheduled'
  AND public.can_client_create_online_appointment(
    tenant_id,
    client_id,
    professional_id,
    service_id,
    client_user_id,
    start_time,
    end_time
  )
);

DROP POLICY IF EXISTS "Clients can update their own appointments" ON public.appointments;
CREATE POLICY "Clients can update their own appointments"
ON public.appointments
FOR UPDATE
USING (
  client_user_id = auth.uid()
  AND status IN ('pre_scheduled', 'scheduled', 'confirmed')
)
WITH CHECK (
  client_user_id = auth.uid()
  AND status = 'cancelled'
  AND tenant_id IN (
    SELECT tenant_id
    FROM public.client_accounts
    WHERE user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Allow client self-registration" ON public.clients;
CREATE POLICY "Allow client self-registration"
ON public.clients
FOR INSERT
TO authenticated
WITH CHECK (
  tenant_id IN (
    SELECT tenant_id
    FROM public.client_accounts
    WHERE user_id = auth.uid()
  )
  OR public.is_tenant_booking_active(tenant_id)
);

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
      WHERE c.id = client_id
        AND c.tenant_id = client_accounts.tenant_id
        AND c.deleted_at IS NULL
    )
  )
  AND (
    preferred_professional_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM public.professionals p
      WHERE p.id = preferred_professional_id
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
      WHERE c.id = client_id
        AND c.tenant_id = client_accounts.tenant_id
        AND c.deleted_at IS NULL
    )
  )
  AND (
    preferred_professional_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM public.professionals p
      WHERE p.id = preferred_professional_id
        AND p.tenant_id = client_accounts.tenant_id
        AND p.deleted_at IS NULL
    )
  )
);

UPDATE storage.buckets
SET
  file_size_limit = 2097152,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
WHERE id IN ('client-photos', 'professional-photos', 'salon-logos');

DROP POLICY IF EXISTS "Anyone can view client photos" ON storage.objects;
DROP POLICY IF EXISTS "Public read access to professional photos" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view salon logos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload client photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update client photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete client photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload professional photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update professional photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete professional photos" ON storage.objects;
DROP POLICY IF EXISTS "Admins can upload their tenant logo" ON storage.objects;
DROP POLICY IF EXISTS "Admins can update their tenant logo" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete their tenant logo" ON storage.objects;

CREATE POLICY "Tenant users can upload client photos"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'client-photos'
  AND auth.role() = 'authenticated'
  AND public.can_upload_client_photo(public.storage_object_tenant_id(name))
);

CREATE POLICY "Tenant users can view client photos"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'client-photos'
  AND auth.role() = 'authenticated'
  AND public.can_manage_client_photo(public.storage_object_tenant_id(name))
);

CREATE POLICY "Tenant users can update client photos"
ON storage.objects
FOR UPDATE
USING (
  bucket_id = 'client-photos'
  AND auth.role() = 'authenticated'
  AND public.can_manage_client_photo(public.storage_object_tenant_id(name))
)
WITH CHECK (
  bucket_id = 'client-photos'
  AND auth.role() = 'authenticated'
  AND public.can_manage_client_photo(public.storage_object_tenant_id(name))
);

CREATE POLICY "Tenant users can delete client photos"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'client-photos'
  AND auth.role() = 'authenticated'
  AND public.can_manage_client_photo(public.storage_object_tenant_id(name))
);

CREATE POLICY "Tenant users can upload professional photos"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'professional-photos'
  AND auth.role() = 'authenticated'
  AND public.can_manage_professional_photo(public.storage_object_tenant_id(name))
);

CREATE POLICY "Tenant users can view professional photos"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'professional-photos'
  AND auth.role() = 'authenticated'
  AND public.can_manage_professional_photo(public.storage_object_tenant_id(name))
);

CREATE POLICY "Tenant users can update professional photos"
ON storage.objects
FOR UPDATE
USING (
  bucket_id = 'professional-photos'
  AND auth.role() = 'authenticated'
  AND public.can_manage_professional_photo(public.storage_object_tenant_id(name))
)
WITH CHECK (
  bucket_id = 'professional-photos'
  AND auth.role() = 'authenticated'
  AND public.can_manage_professional_photo(public.storage_object_tenant_id(name))
);

CREATE POLICY "Tenant users can delete professional photos"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'professional-photos'
  AND auth.role() = 'authenticated'
  AND public.can_manage_professional_photo(public.storage_object_tenant_id(name))
);

CREATE POLICY "Tenant admins can upload salon logos"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'salon-logos'
  AND auth.role() = 'authenticated'
  AND public.can_manage_tenant_storage(public.storage_object_tenant_id(name))
);

CREATE POLICY "Tenant admins can view salon logos"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'salon-logos'
  AND auth.role() = 'authenticated'
  AND public.can_manage_tenant_storage(public.storage_object_tenant_id(name))
);

CREATE POLICY "Tenant admins can update salon logos"
ON storage.objects
FOR UPDATE
USING (
  bucket_id = 'salon-logos'
  AND auth.role() = 'authenticated'
  AND public.can_manage_tenant_storage(public.storage_object_tenant_id(name))
)
WITH CHECK (
  bucket_id = 'salon-logos'
  AND auth.role() = 'authenticated'
  AND public.can_manage_tenant_storage(public.storage_object_tenant_id(name))
);

CREATE POLICY "Tenant admins can delete salon logos"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'salon-logos'
  AND auth.role() = 'authenticated'
  AND public.can_manage_tenant_storage(public.storage_object_tenant_id(name))
);
