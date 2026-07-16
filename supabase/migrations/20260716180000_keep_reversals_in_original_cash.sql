-- Keep financial reversals in the same cash session as the original movement.
-- The reversal action timestamp remains `created_at` on the audit log and
-- `reversed_at` on the original transaction.

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS reversal_of_transaction_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'transactions_reversal_of_transaction_id_fkey'
  ) THEN
    ALTER TABLE public.transactions
      ADD CONSTRAINT transactions_reversal_of_transaction_id_fkey
      FOREIGN KEY (reversal_of_transaction_id)
      REFERENCES public.transactions(id)
      ON DELETE SET NULL
      NOT VALID;
  END IF;
END $$;

ALTER TABLE public.transactions
  VALIDATE CONSTRAINT transactions_reversal_of_transaction_id_fkey;

-- Backfill only links that already respect tenant and cash-session isolation.
-- Existing inconsistent pairs remain visible for audit and are not rewritten.
UPDATE public.transactions AS reversal
SET reversal_of_transaction_id = original.id
FROM public.transactions AS original
WHERE original.reversal_transaction_id = reversal.id
  AND original.tenant_id = reversal.tenant_id
  AND original.cash_session_id IS NOT DISTINCT FROM reversal.cash_session_id
  AND reversal.reversal_of_transaction_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_one_reversal_per_original
  ON public.transactions (reversal_of_transaction_id)
  WHERE reversal_of_transaction_id IS NOT NULL;

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.enforce_reversal_original_cash()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  original_transaction public.transactions%ROWTYPE;
  target_session public.cash_sessions%ROWTYPE;
BEGIN
  IF NEW.reversal_of_transaction_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.reversal_of_transaction_id = NEW.id THEN
    RAISE EXCEPTION 'Um movimento nao pode estornar a si proprio' USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO original_transaction
  FROM public.transactions
  WHERE id = NEW.reversal_of_transaction_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Movimento original do estorno nao encontrado' USING ERRCODE = '23503';
  END IF;

  IF original_transaction.tenant_id IS DISTINCT FROM NEW.tenant_id THEN
    RAISE EXCEPTION 'O estorno deve pertencer a mesma empresa do movimento original' USING ERRCODE = '42501';
  END IF;

  IF original_transaction.cash_session_id IS DISTINCT FROM NEW.cash_session_id THEN
    RAISE EXCEPTION 'O estorno deve permanecer no mesmo caixa do movimento original' USING ERRCODE = '22023';
  END IF;

  -- Keep date-based reports aligned with the cash business date even if a
  -- future client writes the reversal without the frontend timestamp helper.
  SELECT *
  INTO target_session
  FROM public.cash_sessions
  WHERE id = original_transaction.cash_session_id;

  IF FOUND THEN
    NEW.created_at := (
      date_trunc('day', target_session.opened_at AT TIME ZONE 'America/Sao_Paulo')
      + ((coalesce(NEW.created_at, now()) AT TIME ZONE 'America/Sao_Paulo')::time)
    ) AT TIME ZONE 'America/Sao_Paulo';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.enforce_reversal_original_cash() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_transactions_reversal_original_cash ON public.transactions;
CREATE TRIGGER trg_transactions_reversal_original_cash
BEFORE INSERT OR UPDATE OF reversal_of_transaction_id, cash_session_id, tenant_id
ON public.transactions
FOR EACH ROW
EXECUTE FUNCTION private.enforce_reversal_original_cash();
