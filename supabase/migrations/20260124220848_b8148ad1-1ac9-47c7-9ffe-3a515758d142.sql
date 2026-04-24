
-- Drop existing SELECT policy for appointments that allows viewing all tenant appointments
DROP POLICY IF EXISTS "Users can view appointments in their tenant" ON appointments;

-- Create new SELECT policy: admins see all tenant appointments, professionals see only their own
CREATE POLICY "Users can view appointments in their tenant or own"
ON appointments
FOR SELECT
USING (
  -- Super admin can see all
  is_super_admin(auth.jwt() ->> 'email')
  OR 
  -- Admin can see all in tenant
  (tenant_id = get_user_tenant_id(auth.uid()) AND has_role(auth.uid(), 'admin'))
  OR
  -- Professional can see only their own appointments
  (tenant_id = get_user_tenant_id(auth.uid()) AND professional_id IN (
    SELECT id FROM professionals WHERE user_id = auth.uid()
  ))
  OR
  -- Client can see their own appointments (handled separately already)
  client_user_id = auth.uid()
);
