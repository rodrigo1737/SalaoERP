
-- Allow professionals to view their tenant settings (for branding in sidebar)
CREATE POLICY "Professionals can view their tenant settings"
ON public.tenant_settings
FOR SELECT
USING (
  tenant_id = get_user_tenant_id(auth.uid())
);
