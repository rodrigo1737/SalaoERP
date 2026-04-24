-- Drop existing SELECT policy
DROP POLICY IF EXISTS "Super admins can view super_admins" ON public.super_admins;

-- Create new policy that allows users to check if their own email is a super admin
CREATE POLICY "Users can check if they are super admin"
ON public.super_admins
FOR SELECT
USING (
  email = (SELECT email FROM auth.users WHERE id = auth.uid())
  OR is_super_admin((SELECT email FROM auth.users WHERE id = auth.uid())::text)
);