DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum
    WHERE enumlabel = 'refund_bill'
      AND enumtypid = 'public.permission_type'::regtype
  ) THEN
    ALTER TYPE public.permission_type ADD VALUE 'refund_bill';
  END IF;
END $$;
