-- Harden public booking access, client account tenant isolation, photo scoping, and online booking limits.

REVOKE ALL ON TABLE public.tenants FROM anon;
REVOKE ALL ON TABLE public.tenant_settings FROM anon;
REVOKE ALL ON TABLE public.professionals FROM anon;
REVOKE ALL ON TABLE public.services FROM anon;
REVOKE ALL ON TABLE public.service_professionals FROM anon;

CREATE OR REPLACE FUNCTION public.get_public_booking_tenant(_slug text)
RETURNS TABLE (
  tenant_id uuid,
  tenant_name text,
  booking_slug text,
  package_type text,
  logo_url text,
  primary_color text,
  working_hours_start integer,
  working_hours_end integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    t.id AS tenant_id,
    t.name AS tenant_name,
    t.booking_slug,
    t.package_type::text,
    ts.logo_url,
    ts.primary_color,
    ts.working_hours_start,
    ts.working_hours_end
  FROM public.tenants t
  LEFT JOIN public.tenant_settings ts
    ON ts.tenant_id = t.id
  WHERE t.booking_slug = _slug
    AND public.is_tenant_booking_active(t.id)
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.get_public_booking_professionals(_slug text)
RETURNS TABLE (
  professional_id uuid,
  professional_name text,
  nickname text,
  photo_url text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id AS professional_id,
    p.name AS professional_name,
    p.nickname,
    p.photo_url
  FROM public.tenants t
  JOIN public.professionals p
    ON p.tenant_id = t.id
  WHERE t.booking_slug = _slug
    AND public.is_tenant_booking_active(t.id)
    AND p.is_active = true
    AND p.has_schedule = true
    AND p.deleted_at IS NULL
  ORDER BY p.name
$$;

CREATE OR REPLACE FUNCTION public.get_public_booking_services(_slug text)
RETURNS TABLE (
  service_id uuid,
  service_name text,
  description text,
  category text,
  duration_minutes integer,
  break_time_minutes integer,
  default_price numeric,
  price_type text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    s.id AS service_id,
    s.name AS service_name,
    s.description,
    s.category,
    s.duration_minutes,
    s.break_time_minutes,
    s.default_price,
    s.price_type::text
  FROM public.tenants t
  JOIN public.services s
    ON s.tenant_id = t.id
  WHERE t.booking_slug = _slug
    AND public.is_tenant_booking_active(t.id)
    AND s.is_active = true
    AND s.allow_online_booking = true
    AND s.deleted_at IS NULL
  ORDER BY s.name
$$;

CREATE OR REPLACE FUNCTION public.get_public_booking_service_professionals(_slug text)
RETURNS TABLE (
  service_id uuid,
  professional_id uuid,
  duration_minutes integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    sp.service_id,
    sp.professional_id,
    sp.duration_minutes
  FROM public.tenants t
  JOIN public.service_professionals sp
    ON sp.tenant_id = t.id
  JOIN public.services s
    ON s.id = sp.service_id
   AND s.tenant_id = t.id
  JOIN public.professionals p
    ON p.id = sp.professional_id
   AND p.tenant_id = t.id
  WHERE t.booking_slug = _slug
    AND public.is_tenant_booking_active(t.id)
    AND s.is_active = true
    AND s.allow_online_booking = true
    AND s.deleted_at IS NULL
    AND p.is_active = true
    AND p.has_schedule = true
    AND p.deleted_at IS NULL
$$;

REVOKE ALL ON FUNCTION public.get_public_booking_tenant(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_public_booking_professionals(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_public_booking_services(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_public_booking_service_professionals(text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_public_booking_tenant(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_booking_professionals(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_booking_services(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_booking_service_professionals(text) TO anon, authenticated;

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
);

DROP POLICY IF EXISTS "Clients can update their own account" ON public.client_accounts;
CREATE POLICY "Clients can update their own account"
ON public.client_accounts
FOR UPDATE
USING (user_id = auth.uid())
WITH CHECK (
  user_id = auth.uid()
  AND tenant_id = (
    SELECT existing.tenant_id
    FROM public.client_accounts existing
    WHERE existing.id = client_accounts.id
      AND existing.user_id = auth.uid()
  )
  AND (
    client_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM public.clients c
      WHERE c.id = client_accounts.client_id
        AND c.tenant_id = client_accounts.tenant_id
        AND c.deleted_at IS NULL
    )
  )
  AND (
    preferred_professional_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM public.professionals p
      WHERE p.id = client_accounts.preferred_professional_id
        AND p.tenant_id = client_accounts.tenant_id
        AND p.deleted_at IS NULL
    )
  )
);

CREATE OR REPLACE FUNCTION public.storage_object_client_user_id(_name text)
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

CREATE OR REPLACE FUNCTION public.can_manage_client_photo(_tenant_id uuid, _client_user_id uuid DEFAULT NULL)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _tenant_id IS NOT NULL
    AND (
      public.can_manage_tenant_storage(_tenant_id)
      OR (
        _client_user_id IS NOT NULL
        AND _client_user_id = auth.uid()
        AND EXISTS (
          SELECT 1
          FROM public.client_accounts
          WHERE user_id = auth.uid()
            AND tenant_id = _tenant_id
        )
      )
    )
$$;

CREATE OR REPLACE FUNCTION public.can_manage_client_photo(_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.can_manage_client_photo(_tenant_id, NULL)
$$;

DROP POLICY IF EXISTS "Tenant users can upload client photos" ON storage.objects;
DROP POLICY IF EXISTS "Tenant users can view client photos" ON storage.objects;
DROP POLICY IF EXISTS "Tenant users can update client photos" ON storage.objects;
DROP POLICY IF EXISTS "Tenant users can delete client photos" ON storage.objects;

CREATE POLICY "Tenant users can upload client photos"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'client-photos'
  AND auth.role() = 'authenticated'
  AND public.storage_object_tenant_id(name) IS NOT NULL
  AND public.storage_object_client_user_id(name) IS NOT NULL
  AND public.can_manage_client_photo(
    public.storage_object_tenant_id(name),
    public.storage_object_client_user_id(name)
  )
);

CREATE POLICY "Tenant users can view client photos"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'client-photos'
  AND auth.role() = 'authenticated'
  AND public.can_manage_client_photo(
    public.storage_object_tenant_id(name),
    public.storage_object_client_user_id(name)
  )
);

CREATE POLICY "Tenant users can update client photos"
ON storage.objects
FOR UPDATE
USING (
  bucket_id = 'client-photos'
  AND auth.role() = 'authenticated'
  AND public.can_manage_client_photo(
    public.storage_object_tenant_id(name),
    public.storage_object_client_user_id(name)
  )
)
WITH CHECK (
  bucket_id = 'client-photos'
  AND auth.role() = 'authenticated'
  AND public.storage_object_tenant_id(name) IS NOT NULL
  AND public.storage_object_client_user_id(name) IS NOT NULL
  AND public.can_manage_client_photo(
    public.storage_object_tenant_id(name),
    public.storage_object_client_user_id(name)
  )
);

CREATE POLICY "Tenant users can delete client photos"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'client-photos'
  AND auth.role() = 'authenticated'
  AND public.can_manage_client_photo(
    public.storage_object_tenant_id(name),
    public.storage_object_client_user_id(name)
  )
);

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
    AND (
      SELECT COUNT(*)
      FROM public.appointments a
      WHERE a.tenant_id = _tenant_id
        AND a.client_user_id = _client_user_id
        AND a.deleted_at IS NULL
        AND a.status IN ('pre_scheduled', 'scheduled', 'confirmed', 'in_progress')
        AND a.start_time >= now()
    ) < 5
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
