-- Create tenant_settings table for customization
CREATE TABLE public.tenant_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL UNIQUE REFERENCES public.tenants(id) ON DELETE CASCADE,
  salon_name text,
  logo_url text,
  primary_color text DEFAULT '#1e40af',
  secondary_color text DEFAULT '#3b82f6',
  accent_color text DEFAULT '#60a5fa',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.tenant_settings ENABLE ROW LEVEL SECURITY;

-- Admins can view and manage their tenant settings
CREATE POLICY "Admins can view their tenant settings"
ON public.tenant_settings
FOR SELECT
USING (
  (tenant_id = get_user_tenant_id(auth.uid()) AND has_role(auth.uid(), 'admin'))
  OR is_super_admin(auth.jwt() ->> 'email')
);

CREATE POLICY "Admins can insert their tenant settings"
ON public.tenant_settings
FOR INSERT
WITH CHECK (
  (tenant_id = get_user_tenant_id(auth.uid()) AND has_role(auth.uid(), 'admin') AND can_tenant_modify(tenant_id))
  OR is_super_admin(auth.jwt() ->> 'email')
);

CREATE POLICY "Admins can update their tenant settings"
ON public.tenant_settings
FOR UPDATE
USING (
  (tenant_id = get_user_tenant_id(auth.uid()) AND has_role(auth.uid(), 'admin') AND can_tenant_modify(tenant_id))
  OR is_super_admin(auth.jwt() ->> 'email')
);

-- Create trigger for updated_at
CREATE TRIGGER update_tenant_settings_updated_at
BEFORE UPDATE ON public.tenant_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create storage bucket for salon logos
INSERT INTO storage.buckets (id, name, public) VALUES ('salon-logos', 'salon-logos', true);

-- Storage policies for salon logos
CREATE POLICY "Anyone can view salon logos"
ON storage.objects
FOR SELECT
USING (bucket_id = 'salon-logos');

CREATE POLICY "Admins can upload their tenant logo"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'salon-logos' 
  AND (
    (auth.uid() IS NOT NULL AND has_role(auth.uid(), 'admin'))
    OR is_super_admin(auth.jwt() ->> 'email')
  )
);

CREATE POLICY "Admins can update their tenant logo"
ON storage.objects
FOR UPDATE
USING (
  bucket_id = 'salon-logos' 
  AND (
    (auth.uid() IS NOT NULL AND has_role(auth.uid(), 'admin'))
    OR is_super_admin(auth.jwt() ->> 'email')
  )
);

CREATE POLICY "Admins can delete their tenant logo"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'salon-logos' 
  AND (
    (auth.uid() IS NOT NULL AND has_role(auth.uid(), 'admin'))
    OR is_super_admin(auth.jwt() ->> 'email')
  )
);