-- Permissão de escopo da agenda: quem NÃO tem 'view_all_schedule' (e não é
-- admin) enxerga apenas a própria agenda. Recepção/financeiro recebem a
-- permissão; profissional comum fica restrito ao próprio horário.
-- ADD VALUE precisa estar isolado (não pode ser usado na mesma transação);
-- o backfill vem numa migration separada.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'view_all_schedule'
      AND enumtypid = 'public.permission_type'::regtype
  ) THEN
    ALTER TYPE public.permission_type ADD VALUE 'view_all_schedule';
  END IF;
END
$$;
