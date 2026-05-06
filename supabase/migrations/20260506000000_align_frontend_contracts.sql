-- Align database contract with the frontend flows.
-- Safe to run more than once.

alter table public.clients
  add column if not exists deleted_at timestamp with time zone;

alter table public.professionals
  add column if not exists deleted_at timestamp with time zone;

alter table public.services
  add column if not exists deleted_at timestamp with time zone;

alter table public.products
  add column if not exists deleted_at timestamp with time zone;

alter table public.appointments
  add column if not exists deleted_at timestamp with time zone;

alter table public.tenant_settings
  add column if not exists working_hours_start integer not null default 8,
  add column if not exists working_hours_end integer not null default 20;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'tenant_settings_working_hours_check'
  ) then
    alter table public.tenant_settings
      add constraint tenant_settings_working_hours_check
      check (
        working_hours_start >= 0
        and working_hours_start <= 23
        and working_hours_end >= 1
        and working_hours_end <= 24
        and working_hours_start < working_hours_end
      )
      not valid;
  end if;
end $$;

alter table public.tenant_settings
  validate constraint tenant_settings_working_hours_check;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'client_accounts_tenant_id_fkey'
  ) then
    alter table public.client_accounts
      add constraint client_accounts_tenant_id_fkey
      foreign key (tenant_id) references public.tenants(id)
      on delete cascade
      not valid;
  end if;
end $$;

alter table public.client_accounts
  validate constraint client_accounts_tenant_id_fkey;

create index if not exists idx_clients_tenant_deleted_at
  on public.clients (tenant_id, deleted_at);

create index if not exists idx_professionals_tenant_deleted_at
  on public.professionals (tenant_id, deleted_at);

create index if not exists idx_services_tenant_deleted_at
  on public.services (tenant_id, deleted_at);

create index if not exists idx_products_tenant_deleted_at
  on public.products (tenant_id, deleted_at);

create index if not exists idx_appointments_tenant_deleted_at_start_time
  on public.appointments (tenant_id, deleted_at, start_time);

create index if not exists idx_client_accounts_user_tenant
  on public.client_accounts (user_id, tenant_id);

delete from public.user_roles ur_keep
using public.user_roles ur_dupe
where ur_keep.ctid < ur_dupe.ctid
  and ur_keep.user_id = ur_dupe.user_id
  and ur_keep.role = ur_dupe.role
  and ur_keep.tenant_id is not distinct from ur_dupe.tenant_id;

delete from public.user_permissions up_keep
using public.user_permissions up_dupe
where up_keep.ctid < up_dupe.ctid
  and up_keep.user_id = up_dupe.user_id
  and up_keep.permission = up_dupe.permission
  and up_keep.tenant_id is not distinct from up_dupe.tenant_id;

create unique index if not exists idx_user_roles_user_tenant_role
  on public.user_roles (user_id, role, tenant_id);

create unique index if not exists idx_user_permissions_user_tenant_permission
  on public.user_permissions (user_id, tenant_id, permission);
