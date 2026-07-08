create index if not exists idx_clients_tenant_deleted_name
  on public.clients (tenant_id, deleted_at, name);

create index if not exists idx_clients_tenant_deleted_phone
  on public.clients (tenant_id, deleted_at, phone);

create index if not exists idx_appointments_tenant_deleted_start_status
  on public.appointments (tenant_id, deleted_at, start_time, status);

create index if not exists idx_appointments_tenant_client_deleted_start
  on public.appointments (tenant_id, client_id, deleted_at, start_time desc);

create index if not exists idx_transactions_tenant_created_type
  on public.transactions (tenant_id, created_at desc, type);

create index if not exists idx_transactions_tenant_cash_session_created
  on public.transactions (tenant_id, cash_session_id, created_at desc);

create index if not exists idx_commissions_tenant_created_status
  on public.commissions (tenant_id, created_at desc, status);

create index if not exists idx_cash_sessions_tenant_status_opened
  on public.cash_sessions (tenant_id, status, opened_at desc);

create index if not exists idx_cleaning_appointments_tenant_deleted_start_status
  on public.cleaning_appointments (tenant_id, deleted_at, start_time, status);

create index if not exists idx_cleaning_appointments_tenant_client_deleted_start
  on public.cleaning_appointments (tenant_id, client_id, deleted_at, start_time desc);

create index if not exists idx_cleaning_financial_entries_tenant_deleted_created_type_status
  on public.cleaning_financial_entries (tenant_id, deleted_at, created_at desc, entry_type, status);
