-- Add booking_slug to tenants for unique booking URL
ALTER TABLE public.tenants 
ADD COLUMN IF NOT EXISTS booking_slug TEXT UNIQUE;

-- Create index for fast slug lookup
CREATE INDEX IF NOT EXISTS idx_tenants_booking_slug ON public.tenants(booking_slug);

-- Add booking_source to appointments to track where booking came from
ALTER TABLE public.appointments 
ADD COLUMN IF NOT EXISTS booking_source TEXT NOT NULL DEFAULT 'admin';

-- Add client_user_id to appointments to track which client account made the booking
ALTER TABLE public.appointments 
ADD COLUMN IF NOT EXISTS client_user_id UUID REFERENCES auth.users(id);

-- Create client_accounts table for client self-service login
CREATE TABLE IF NOT EXISTS public.client_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  tenant_id UUID NOT NULL,
  preferred_professional_id UUID REFERENCES public.professionals(id),
  terms_accepted_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on client_accounts
ALTER TABLE public.client_accounts ENABLE ROW LEVEL SECURITY;

-- RLS policies for client_accounts
CREATE POLICY "Clients can view their own account"
ON public.client_accounts
FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "Clients can update their own account"
ON public.client_accounts
FOR UPDATE
USING (user_id = auth.uid());

CREATE POLICY "Anyone can create client account during signup"
ON public.client_accounts
FOR INSERT
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can view client accounts in their tenant"
ON public.client_accounts
FOR SELECT
USING (
  (tenant_id = get_user_tenant_id(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role))
  OR is_super_admin(auth.jwt() ->> 'email'::text)
);

-- Create client_preferred_services table
CREATE TABLE IF NOT EXISTS public.client_preferred_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_account_id UUID REFERENCES public.client_accounts(id) ON DELETE CASCADE NOT NULL,
  service_id UUID REFERENCES public.services(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(client_account_id, service_id)
);

-- Enable RLS
ALTER TABLE public.client_preferred_services ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients can manage their preferred services"
ON public.client_preferred_services
FOR ALL
USING (
  client_account_id IN (
    SELECT id FROM public.client_accounts WHERE user_id = auth.uid()
  )
);

-- Add trigger for updated_at on client_accounts
CREATE TRIGGER update_client_accounts_updated_at
BEFORE UPDATE ON public.client_accounts
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Policy for clients to view services of their tenant (for booking)
CREATE POLICY "Clients can view services for booking"
ON public.services
FOR SELECT
USING (
  tenant_id IN (
    SELECT tenant_id FROM public.client_accounts WHERE user_id = auth.uid()
  )
);

-- Policy for clients to view professionals of their tenant (for booking)
CREATE POLICY "Clients can view professionals for booking"
ON public.professionals
FOR SELECT
USING (
  tenant_id IN (
    SELECT tenant_id FROM public.client_accounts WHERE user_id = auth.uid()
  )
);

-- Policy for clients to view their own appointments
CREATE POLICY "Clients can view their own appointments"
ON public.appointments
FOR SELECT
USING (client_user_id = auth.uid());

-- Policy for clients to create appointments
CREATE POLICY "Clients can create appointments"
ON public.appointments
FOR INSERT
WITH CHECK (
  client_user_id = auth.uid()
  AND booking_source = 'online'
  AND tenant_id IN (
    SELECT tenant_id FROM public.client_accounts WHERE user_id = auth.uid()
  )
);

-- Policy for clients to update their own appointments (cancel/reschedule)
CREATE POLICY "Clients can update their own appointments"
ON public.appointments
FOR UPDATE
USING (
  client_user_id = auth.uid()
  AND status IN ('scheduled', 'confirmed')
);

-- Generate booking slugs for existing tenants
UPDATE public.tenants 
SET booking_slug = LOWER(REPLACE(REPLACE(name, ' ', '-'), '''', '')) || '-' || SUBSTRING(id::text, 1, 8)
WHERE booking_slug IS NULL;