-- Drop the existing SELECT policy for commissions
DROP POLICY IF EXISTS "Users can view commissions in their tenant" ON public.commissions;

-- Create new secure SELECT policy
-- Admins and super admins can see all commissions in their tenant
-- Professionals can only see their own commissions
CREATE POLICY "Users can view their own or tenant commissions as admin"
ON public.commissions
FOR SELECT
USING (
  (
    tenant_id = get_user_tenant_id(auth.uid()) 
    AND (
      -- Admins can see all commissions in their tenant
      has_role(auth.uid(), 'admin') 
      OR 
      -- Professionals can only see their own commissions
      professional_id IN (SELECT id FROM public.professionals WHERE user_id = auth.uid())
    )
  )
  OR is_super_admin(auth.jwt() ->> 'email')
);