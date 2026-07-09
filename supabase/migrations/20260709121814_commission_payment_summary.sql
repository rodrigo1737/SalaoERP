ALTER TABLE public.commissions
ADD COLUMN IF NOT EXISTS payment_method text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'commissions_payment_method_check'
  ) THEN
    ALTER TABLE public.commissions
      ADD CONSTRAINT commissions_payment_method_check
      CHECK (
        payment_method IS NULL
        OR payment_method IN ('cash', 'pix', 'transfer')
      );
  END IF;
END $$;

UPDATE public.commissions AS commissions
SET payment_method = CASE
  WHEN transactions.payment_method = 'cash' THEN 'cash'
  WHEN transactions.payment_method = 'pix' THEN 'pix'
  ELSE 'transfer'
END
FROM public.transactions AS transactions
WHERE commissions.transaction_id = transactions.id
  AND commissions.type <> 'voucher'
  AND commissions.status = 'paid'
  AND commissions.payment_method IS NULL;
