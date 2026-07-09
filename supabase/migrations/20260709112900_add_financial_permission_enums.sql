DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum
    WHERE enumlabel = 'view_financial_history'
      AND enumtypid = 'public.permission_type'::regtype
  ) THEN
    ALTER TYPE public.permission_type ADD VALUE 'view_financial_history';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum
    WHERE enumlabel = 'reverse_financial_entries'
      AND enumtypid = 'public.permission_type'::regtype
  ) THEN
    ALTER TYPE public.permission_type ADD VALUE 'reverse_financial_entries';
  END IF;
END $$;
