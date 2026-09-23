-- Verificacao somente leitura para executar depois do deploy da migration
-- 20260923143444_harden_core_rls_and_stock_writes.sql.

-- 1) O resultado deve ser vazio: nenhuma politica legada permissiva pode
-- continuar ativa nas tabelas centrais e financeiras.
SELECT tablename, policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND (
    (tablename = 'clients' AND policyname = 'Users can manage clients in their tenant')
    OR (tablename = 'services' AND policyname = 'Users can manage services in their tenant')
    OR (tablename = 'service_professionals' AND policyname = 'Users can manage service_professionals in their tenant')
    OR (tablename = 'professionals' AND policyname = 'Users can manage professionals in their tenant')
    OR (tablename = 'products' AND policyname = 'Users can manage products in their tenant')
    OR (tablename = 'stock_movements' AND policyname = 'Users can insert stock movements in their tenant')
    OR (tablename = 'transactions' AND policyname IN (
      'Users can view transactions in their tenant',
      'Users can insert transactions in their tenant',
      'Users can update transactions in their tenant',
      'Users can manage transactions in their tenant'
    ))
    OR (tablename = 'commissions' AND policyname = 'Users can manage commissions in their tenant')
  )
ORDER BY tablename, policyname;

-- 2) Inventario das politicas efetivas para revisao humana.
SELECT tablename, policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'clients',
    'services',
    'service_professionals',
    'professionals',
    'products',
    'stock_movements',
    'transactions',
    'commissions',
    'client_bill_payment_batches'
  )
ORDER BY tablename, cmd, policyname;

-- 3) A funcao publica deve ser SECURITY INVOKER; a implementacao elevada deve
-- ficar no schema private. Ambas devem ter search_path vazio e o endpoint
-- publico deve estar disponivel somente ao papel authenticated.
SELECT
  routine.oid::regprocedure AS function_signature,
  routine.prosecdef AS security_definer,
  routine.proconfig AS function_config,
  has_function_privilege('anon', routine.oid, 'EXECUTE') AS anon_can_execute,
  has_function_privilege('authenticated', routine.oid, 'EXECUTE') AS authenticated_can_execute
FROM pg_proc AS routine
WHERE routine.oid IN (
  'public.register_operational_stock_movement(uuid,text,integer,numeric,uuid,uuid,uuid)'::regprocedure,
  'private.register_operational_stock_movement_impl(uuid,text,integer,numeric,uuid,uuid,uuid)'::regprocedure
)
ORDER BY 1;

-- 4) Os dois indices garantem idempotencia de venda e consumo por comanda.
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname IN (
    'idx_stock_movements_sale_idempotency',
    'idx_stock_movements_consumption_idempotency'
  )
ORDER BY indexname;
