-- Apply policies only after the new enum labels have committed.

DROP POLICY IF EXISTS "Tenant schedule blocks are manageable by schedule staff" ON public.professional_schedule_blocks;
CREATE POLICY "Tenant schedule blocks are manageable by schedule staff"
ON public.professional_schedule_blocks
FOR ALL TO authenticated
USING (
  tenant_id = public.get_user_tenant_id(auth.uid())
  AND (
    public.has_role(auth.uid(), 'admin', tenant_id)
    OR public.has_permission(auth.uid(), 'edit_schedule', tenant_id)
    OR public.has_permission(auth.uid(), 'manage_all_schedule_blocks', tenant_id)
    OR (
      public.has_permission(auth.uid(), 'manage_schedule_blocks', tenant_id)
      AND professional_id IN (
        SELECT p.id
        FROM public.professionals p
        WHERE p.user_id = auth.uid()
          AND p.tenant_id = professional_schedule_blocks.tenant_id
          AND p.deleted_at IS NULL
      )
    )
  )
)
WITH CHECK (
  tenant_id = public.get_user_tenant_id(auth.uid())
  AND (
    public.has_role(auth.uid(), 'admin', tenant_id)
    OR public.has_permission(auth.uid(), 'edit_schedule', tenant_id)
    OR public.has_permission(auth.uid(), 'manage_all_schedule_blocks', tenant_id)
    OR (
      public.has_permission(auth.uid(), 'manage_schedule_blocks', tenant_id)
      AND professional_id IN (
        SELECT p.id
        FROM public.professionals p
        WHERE p.user_id = auth.uid()
          AND p.tenant_id = professional_schedule_blocks.tenant_id
          AND p.deleted_at IS NULL
      )
    )
  )
);

DROP POLICY IF EXISTS "Tenant schedule blocks are viewable by schedule staff" ON public.professional_schedule_blocks;
CREATE POLICY "Tenant schedule blocks are viewable by schedule staff"
ON public.professional_schedule_blocks
FOR SELECT TO authenticated
USING (
  tenant_id = public.get_user_tenant_id(auth.uid())
  AND (
    public.has_role(auth.uid(), 'admin', tenant_id)
    OR public.has_permission(auth.uid(), 'view_schedule', tenant_id)
    OR public.has_permission(auth.uid(), 'edit_schedule', tenant_id)
    OR public.has_permission(auth.uid(), 'manage_all_schedule_blocks', tenant_id)
    OR (
      public.has_permission(auth.uid(), 'manage_schedule_blocks', tenant_id)
      AND professional_id IN (
        SELECT p.id
        FROM public.professionals p
        WHERE p.user_id = auth.uid()
          AND p.tenant_id = professional_schedule_blocks.tenant_id
          AND p.deleted_at IS NULL
      )
    )
  )
);
