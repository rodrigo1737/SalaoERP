-- Allow users to view their own tenant
CREATE POLICY "Users can view their own tenant" 
ON public.tenants 
FOR SELECT 
USING (id = get_user_tenant_id(auth.uid()) OR is_super_admin((auth.jwt() ->> 'email'::text)));