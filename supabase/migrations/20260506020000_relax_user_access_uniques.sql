alter table public.user_roles
  drop constraint if exists user_roles_user_id_role_key;

alter table public.user_permissions
  drop constraint if exists user_permissions_user_id_permission_key;
