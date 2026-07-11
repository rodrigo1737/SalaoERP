-- Preserva o comportamento atual: quem hoje vê a agenda por 'view_schedule' e
-- NÃO está vinculado a um profissional (recepção, financeiro, staff interno)
-- ganha 'view_all_schedule' para continuar vendo a agenda completa.
-- Profissionais vinculados ficam de fora → passam a ver só a própria agenda.
INSERT INTO public.user_permissions (user_id, tenant_id, permission)
SELECT DISTINCT up.user_id, up.tenant_id, 'view_all_schedule'::public.permission_type
FROM public.user_permissions up
WHERE up.permission IN ('view_schedule', 'edit_schedule')
  AND NOT EXISTS (
    SELECT 1
    FROM public.professionals pr
    WHERE pr.user_id = up.user_id
      AND pr.tenant_id IS NOT DISTINCT FROM up.tenant_id
      AND pr.deleted_at IS NULL
  )
ON CONFLICT (user_id, tenant_id, permission) DO NOTHING;
