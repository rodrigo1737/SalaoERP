-- Adds the aesthetic/clinical package module: anamnesis, treatment evolution and private photos.

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
      AND package_type = 'aesthetic_clinic'
  )
$$;

CREATE TABLE IF NOT EXISTS public.aesthetic_anamneses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  professional_id uuid REFERENCES public.professionals(id) ON DELETE SET NULL,
  title text NOT NULL DEFAULT 'Anamnese estética',
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.aesthetic_evolutions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  professional_id uuid REFERENCES public.professionals(id) ON DELETE SET NULL,
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
  procedure_name text NOT NULL,
  notes text,
  measurements jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.aesthetic_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  evolution_id uuid REFERENCES public.aesthetic_evolutions(id) ON DELETE SET NULL,
  category text NOT NULL DEFAULT 'avaliacao',
  body_region text,
  storage_path text NOT NULL,
  notes text,
  taken_at date,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS aesthetic_anamneses_tenant_client_idx
  ON public.aesthetic_anamneses (tenant_id, client_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS aesthetic_evolutions_tenant_client_idx
  ON public.aesthetic_evolutions (tenant_id, client_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS aesthetic_photos_tenant_client_idx
  ON public.aesthetic_photos (tenant_id, client_id, created_at DESC)
  WHERE deleted_at IS NULL;

ALTER TABLE public.aesthetic_anamneses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aesthetic_evolutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aesthetic_photos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant admins can view aesthetic anamneses" ON public.aesthetic_anamneses;
CREATE POLICY "Tenant admins can view aesthetic anamneses"
ON public.aesthetic_anamneses
FOR SELECT
USING (
  public.has_aesthetic_package(tenant_id)
  AND (
    public.is_super_admin(auth.jwt() ->> 'email')
    OR public.has_role(auth.uid(), 'admin', tenant_id)
  )
);

DROP POLICY IF EXISTS "Tenant admins can manage aesthetic anamneses" ON public.aesthetic_anamneses;
CREATE POLICY "Tenant admins can manage aesthetic anamneses"
ON public.aesthetic_anamneses
FOR ALL
USING (
  public.has_aesthetic_package(tenant_id)
  AND public.can_tenant_modify(tenant_id)
  AND (
    public.is_super_admin(auth.jwt() ->> 'email')
    OR public.has_role(auth.uid(), 'admin', tenant_id)
  )
)
WITH CHECK (
  public.has_aesthetic_package(tenant_id)
  AND public.can_tenant_modify(tenant_id)
  AND (
    public.is_super_admin(auth.jwt() ->> 'email')
    OR public.has_role(auth.uid(), 'admin', tenant_id)
  )
);

DROP POLICY IF EXISTS "Tenant admins can view aesthetic evolutions" ON public.aesthetic_evolutions;
CREATE POLICY "Tenant admins can view aesthetic evolutions"
ON public.aesthetic_evolutions
FOR SELECT
USING (
  public.has_aesthetic_package(tenant_id)
  AND (
    public.is_super_admin(auth.jwt() ->> 'email')
    OR public.has_role(auth.uid(), 'admin', tenant_id)
  )
);

DROP POLICY IF EXISTS "Tenant admins can manage aesthetic evolutions" ON public.aesthetic_evolutions;
CREATE POLICY "Tenant admins can manage aesthetic evolutions"
ON public.aesthetic_evolutions
FOR ALL
USING (
  public.has_aesthetic_package(tenant_id)
  AND public.can_tenant_modify(tenant_id)
  AND (
    public.is_super_admin(auth.jwt() ->> 'email')
    OR public.has_role(auth.uid(), 'admin', tenant_id)
  )
)
WITH CHECK (
  public.has_aesthetic_package(tenant_id)
  AND public.can_tenant_modify(tenant_id)
  AND (
    public.is_super_admin(auth.jwt() ->> 'email')
    OR public.has_role(auth.uid(), 'admin', tenant_id)
  )
);

DROP POLICY IF EXISTS "Tenant admins can view aesthetic photos" ON public.aesthetic_photos;
CREATE POLICY "Tenant admins can view aesthetic photos"
ON public.aesthetic_photos
FOR SELECT
USING (
  public.has_aesthetic_package(tenant_id)
  AND (
    public.is_super_admin(auth.jwt() ->> 'email')
    OR public.has_role(auth.uid(), 'admin', tenant_id)
  )
);

DROP POLICY IF EXISTS "Tenant admins can manage aesthetic photos" ON public.aesthetic_photos;
CREATE POLICY "Tenant admins can manage aesthetic photos"
ON public.aesthetic_photos
FOR ALL
USING (
  public.has_aesthetic_package(tenant_id)
  AND public.can_tenant_modify(tenant_id)
  AND (
    public.is_super_admin(auth.jwt() ->> 'email')
    OR public.has_role(auth.uid(), 'admin', tenant_id)
  )
)
WITH CHECK (
  public.has_aesthetic_package(tenant_id)
  AND public.can_tenant_modify(tenant_id)
  AND (
    public.is_super_admin(auth.jwt() ->> 'email')
    OR public.has_role(auth.uid(), 'admin', tenant_id)
  )
);

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'aesthetic-client-photos',
  'aesthetic-client-photos',
  false,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

DROP POLICY IF EXISTS "Tenant admins can upload aesthetic photos" ON storage.objects;
CREATE POLICY "Tenant admins can upload aesthetic photos"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'aesthetic-client-photos'
  AND auth.role() = 'authenticated'
  AND public.has_aesthetic_package(public.storage_object_tenant_id(name))
  AND public.can_tenant_modify(public.storage_object_tenant_id(name))
  AND public.can_manage_tenant_storage(public.storage_object_tenant_id(name))
);

DROP POLICY IF EXISTS "Tenant admins can view aesthetic photos" ON storage.objects;
CREATE POLICY "Tenant admins can view aesthetic photos"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'aesthetic-client-photos'
  AND auth.role() = 'authenticated'
  AND public.has_aesthetic_package(public.storage_object_tenant_id(name))
  AND public.can_manage_tenant_storage(public.storage_object_tenant_id(name))
);

DROP POLICY IF EXISTS "Tenant admins can update aesthetic photos" ON storage.objects;
CREATE POLICY "Tenant admins can update aesthetic photos"
ON storage.objects
FOR UPDATE
USING (
  bucket_id = 'aesthetic-client-photos'
  AND auth.role() = 'authenticated'
  AND public.has_aesthetic_package(public.storage_object_tenant_id(name))
  AND public.can_manage_tenant_storage(public.storage_object_tenant_id(name))
)
WITH CHECK (
  bucket_id = 'aesthetic-client-photos'
  AND auth.role() = 'authenticated'
  AND public.has_aesthetic_package(public.storage_object_tenant_id(name))
  AND public.can_tenant_modify(public.storage_object_tenant_id(name))
  AND public.can_manage_tenant_storage(public.storage_object_tenant_id(name))
);

DROP POLICY IF EXISTS "Tenant admins can delete aesthetic photos" ON storage.objects;
CREATE POLICY "Tenant admins can delete aesthetic photos"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'aesthetic-client-photos'
  AND auth.role() = 'authenticated'
  AND public.has_aesthetic_package(public.storage_object_tenant_id(name))
  AND public.can_manage_tenant_storage(public.storage_object_tenant_id(name))
);
