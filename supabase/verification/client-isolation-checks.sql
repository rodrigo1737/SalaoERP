-- Executar no SQL Editor para auditar isolamento e integridade do fluxo público.

-- 1) Garante unicidade do vínculo login x tenant no portal do cliente.
select user_id, tenant_id, count(*) as total
from public.client_accounts
group by user_id, tenant_id
having count(*) > 1;

-- 2) Garante que preferências não foram duplicadas.
select client_account_id, service_id, count(*) as total
from public.client_preferred_services
group by client_account_id, service_id
having count(*) > 1;

-- 3) Confere se existe conta apontando para cliente de outro tenant.
select
  ca.id as client_account_id,
  ca.tenant_id as account_tenant_id,
  c.tenant_id as client_tenant_id,
  c.id as client_id
from public.client_accounts ca
join public.clients c on c.id = ca.client_id
where ca.tenant_id is distinct from c.tenant_id;

-- 4) Lista políticas atuais das tabelas sensíveis do portal do cliente.
select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('clients', 'client_accounts', 'client_preferred_services')
order by tablename, policyname;
