-- Correct duplicate appointment income movements created on 2026-07-29 in
-- ART MAKEUP & HAIR. The first active movement remains valid; later copies
-- from the same appointment/payment/session/amount are reversed for audit.
-- Commissions and appointments are intentionally untouched.

DO $$
DECLARE
  art_tenant_id uuid := '02a3da2c-827a-4fab-b181-9f05357d48ba';
  duplicate_row record;
BEGIN
  FOR duplicate_row IN
    WITH ranked AS (
      SELECT
        t.*,
        row_number() OVER (
          PARTITION BY
            t.tenant_id,
            t.cash_session_id,
            t.reference_id,
            t.payment_method,
            t.amount
          ORDER BY t.created_at, t.id
        ) AS duplicate_position
      FROM public.transactions AS t
      WHERE t.tenant_id = art_tenant_id
        AND t.type = 'income'
        AND t.category = 'service'
        AND t.reference_type = 'appointment'
        AND t.reversed_at IS NULL
        AND (t.created_at AT TIME ZONE 'America/Sao_Paulo')::date = DATE '2026-07-29'
        AND (
          t.description ILIKE 'Comanda - JESSICA NASCIMENTO%'
          OR t.description ILIKE 'Comanda - RAQUEL ARAUJO BRANCO%'
        )
    )
    SELECT *
    FROM ranked
    WHERE duplicate_position > 1
  LOOP
    UPDATE public.transactions
    SET
      reversed_at = now(),
      reversal_reason = 'Correção de cobrança duplicada por repetição do fechamento da comanda'
    WHERE id = duplicate_row.id
      AND reversed_at IS NULL;

    INSERT INTO public.financial_audit_logs (
      tenant_id,
      transaction_id,
      cash_session_id,
      appointment_id,
      action_type,
      entity_type,
      description,
      before_state,
      after_state,
      metadata
    ) VALUES (
      duplicate_row.tenant_id,
      duplicate_row.id,
      duplicate_row.cash_session_id,
      CASE
        WHEN duplicate_row.reference_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          THEN duplicate_row.reference_id::uuid
        ELSE NULL
      END,
      'duplicate_bill_movement_reversed',
      'transaction',
      'Movimento financeiro duplicado da comanda foi estornado; o primeiro lançamento foi preservado.',
      jsonb_build_object(
        'amount', duplicate_row.amount,
        'payment_method', duplicate_row.payment_method,
        'created_at', duplicate_row.created_at,
        'reference_id', duplicate_row.reference_id
      ),
      jsonb_build_object(
        'reversed_at', now(),
        'reversal_reason', 'Correção de cobrança duplicada por repetição do fechamento da comanda'
      ),
      jsonb_build_object(
        'cleanup_migration', '20260729160000_fix_current_cash_billing_duplicates',
        'duplicate_position', duplicate_row.duplicate_position
      )
    );
  END LOOP;
END;
$$;

NOTIFY pgrst, 'reload schema';
