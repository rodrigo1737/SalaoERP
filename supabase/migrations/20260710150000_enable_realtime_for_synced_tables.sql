-- O frontend assina postgres_changes destas tabelas (DataContext.setupRealtime),
-- mas nenhuma migration as adicionou à publication supabase_realtime — sem isso
-- nenhum evento é emitido e um usuário não vê o caixa aberto/fechado por outro.
DO $$
DECLARE
  synced_table text;
BEGIN
  FOREACH synced_table IN ARRAY ARRAY[
    'cash_sessions',
    'transactions',
    'clients',
    'products',
    'appointments',
    'commissions'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = synced_table
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', synced_table);
    END IF;
  END LOOP;
END $$;
