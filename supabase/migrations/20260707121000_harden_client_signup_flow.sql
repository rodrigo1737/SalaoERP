-- Fallback migration file created manually because Supabase CLI is unavailable in this workspace.

-- Remove duplicate account rows before enforcing uniqueness.
delete from public.client_accounts ca_dupe
using public.client_accounts ca_keep
where ca_dupe.id > ca_keep.id
  and ca_dupe.user_id = ca_keep.user_id
  and ca_dupe.tenant_id = ca_keep.tenant_id;

-- Remove duplicate preferred service rows before enforcing uniqueness.
delete from public.client_preferred_services cps_dupe
using public.client_preferred_services cps_keep
where cps_dupe.id > cps_keep.id
  and cps_dupe.client_account_id = cps_keep.client_account_id
  and cps_dupe.service_id = cps_keep.service_id;

create unique index if not exists uq_client_accounts_user_tenant
  on public.client_accounts (user_id, tenant_id);

create unique index if not exists uq_client_preferred_services_account_service
  on public.client_preferred_services (client_account_id, service_id);
