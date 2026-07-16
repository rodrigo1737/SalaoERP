-- Fixes PL/pgSQL name resolution during historical cash finalization.
-- The previous function used `difference` as both a local variable and a
-- table column, which makes the UPDATE expression ambiguous in PostgreSQL.

CREATE OR REPLACE FUNCTION public.finish_cash_session_regularization(
  _regularization_id uuid,
  _closing_balance numeric,
  _divergence_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  regularization public.cash_session_regularizations%ROWTYPE;
  target_session public.cash_sessions%ROWTYPE;
  expected numeric;
  calculated_difference numeric;
  finished_regularization public.cash_session_regularizations%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuario nao autenticado' USING ERRCODE = '42501';
  END IF;

  IF _closing_balance IS NULL OR _closing_balance < 0 THEN
    RAISE EXCEPTION 'Informe um saldo fisico valido' USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO regularization
  FROM public.cash_session_regularizations
  WHERE id = _regularization_id
    AND status = 'active'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Regularizacao ativa nao encontrada' USING ERRCODE = 'P0002';
  END IF;

  IF NOT (
    public.has_role(auth.uid(), 'admin', regularization.tenant_id)
    OR public.has_permission(auth.uid(), 'reverse_financial_entries', regularization.tenant_id)
  ) THEN
    RAISE EXCEPTION 'Sem permissao para finalizar a regularizacao' USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO target_session
  FROM public.cash_sessions
  WHERE id = regularization.cash_session_id
  FOR UPDATE;

  SELECT round(
    target_session.opening_balance
    + coalesce(sum(
        CASE
          WHEN t.type = 'income' THEN t.amount
          WHEN t.type = 'expense' THEN -t.amount
          ELSE 0
        END
      ), 0),
    2
  )
  INTO expected
  FROM public.transactions AS t
  WHERE t.tenant_id = regularization.tenant_id
    AND t.cash_session_id = regularization.cash_session_id
    AND t.payment_method = 'cash'
    AND t.reversed_at IS NULL;

  calculated_difference := round(_closing_balance - expected, 2);

  IF abs(calculated_difference) > 0.01 AND length(trim(coalesce(_divergence_reason, ''))) < 5 THEN
    RAISE EXCEPTION 'Informe a justificativa da divergencia' USING ERRCODE = '22023';
  END IF;

  UPDATE public.cash_session_regularizations
  SET status = 'closed',
      ended_by = auth.uid(),
      ended_at = now(),
      ended_reason = 'Regularizacao finalizada',
      closing_balance = _closing_balance,
      expected_balance = expected,
      difference = calculated_difference,
      divergence_reason = NULLIF(trim(_divergence_reason), '')
  WHERE id = regularization.id
  RETURNING * INTO finished_regularization;

  INSERT INTO public.financial_audit_logs (
    tenant_id,
    cash_session_id,
    action_type,
    entity_type,
    description,
    before_state,
    after_state,
    metadata,
    created_by
  )
  VALUES (
    regularization.tenant_id,
    regularization.cash_session_id,
    'cash_regularization_finished',
    'cash_session',
    'Regularizacao retroativa finalizada.',
    to_jsonb(regularization),
    to_jsonb(finished_regularization),
    jsonb_build_object(
      'expected_balance', expected,
      'closing_balance', _closing_balance,
      'difference', calculated_difference,
      'divergence_reason', NULLIF(trim(_divergence_reason), '')
    ),
    auth.uid()
  );

  RETURN to_jsonb(finished_regularization);
END;
$$;
