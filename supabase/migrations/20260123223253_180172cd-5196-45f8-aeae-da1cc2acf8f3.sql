-- Allow public read access to services and professionals for booking (using anon key)
-- This is needed for the booking page before user logs in

-- Create a function to check if a tenant has online booking enabled
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
  )
$$;

-- Allow public read access to services for booking
CREATE POLICY "Public can view services for online booking"
ON public.services
FOR SELECT
TO anon
USING (
  is_active = true
  AND allow_online_booking = true
  AND is_tenant_booking_active(tenant_id)
);

-- Allow public read access to professionals for booking
CREATE POLICY "Public can view professionals for online booking"
ON public.professionals
FOR SELECT
TO anon
USING (
  is_active = true
  AND is_tenant_booking_active(tenant_id)
);

-- Allow public read access to tenants by booking_slug
CREATE POLICY "Public can view tenant by booking slug"
ON public.tenants
FOR SELECT
TO anon
USING (
  status = 'active'
  AND booking_slug IS NOT NULL
);

-- Allow public read access to tenant_settings for booking page customization
CREATE POLICY "Public can view tenant settings for booking"
ON public.tenant_settings
FOR SELECT
TO anon
USING (
  tenant_id IN (
    SELECT id FROM public.tenants
    WHERE status = 'active'
    AND booking_slug IS NOT NULL
  )
);

-- Allow clients to insert themselves into the clients table during signup
CREATE POLICY "Allow client self-registration"
ON public.clients
FOR INSERT
TO authenticated
WITH CHECK (
  tenant_id IN (
    SELECT tenant_id FROM public.client_accounts WHERE user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.tenants t
    WHERE t.id = tenant_id
    AND t.status = 'active'
    AND t.booking_slug IS NOT NULL
  )
);

-- Allow clients to view their own client record
CREATE POLICY "Clients can view their own record"
ON public.clients
FOR SELECT
USING (
  id IN (
    SELECT client_id FROM public.client_accounts WHERE user_id = auth.uid()
  )
);