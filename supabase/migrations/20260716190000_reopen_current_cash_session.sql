-- Reabre somente o caixa fechado do dia corrente como uma sessao normal.
-- Caixas de datas anteriores continuam no fluxo de regularizacao historica.

CREATE OR REPLACE FUNCTION public.reopen_current_cash_session(_cash_session_id uuid)
RETURNS public.cash_sessions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_session public.cash_sessions%ROWTYPE;
  before_state jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sessao de usuario obrigatoria' USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO target_session
  FROM public.cash_sessions
  WHERE id = _cash_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Caixa nao encontrado' USING ERRCODE = 'P0002';
  END IF;

  IF target_session.tenant_id IS NULL
     OR NOT public.can_tenant_modify(target_session.tenant_id)
     OR NOT (
       public.has_role(auth.uid(), 'admin', target_session.tenant_id)
       OR public.has_permission(auth.uid(), 'manage_cash_flow', target_session.tenant_id)
     ) THEN
    RAISE EXCEPTION 'Sem permissao para reabrir o caixa' USING ERRCODE = '42501';
  END IF;

  IF target_session.status <> 'closed' THEN
    RAISE EXCEPTION 'Somente caixas fechados podem ser reabertos' USING ERRCODE = '22023';
  END IF;

  IF timezone('America/Sao_Paulo', target_session.opened_at)::date
     <> timezone('America/Sao_Paulo', now())::date THEN
    RAISE EXCEPTION 'Somente o caixa do dia corrente pode ser reaberto' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.cash_session_regularizations
    WHERE cash_session_id = target_session.id
      AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'Finalize ou cancele a regularizacao antes de reabrir este caixa' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.cash_sessions
    WHERE tenant_id = target_session.tenant_id
      AND status = 'open'
      AND id <> target_session.id
  ) THEN
    RAISE EXCEPTION 'Ja existe outro caixa aberto para este cliente' USING ERRCODE = '23505';
  END IF;

  before_state := to_jsonb(target_session);

  UPDATE public.cash_sessions
  SET status = 'open',
      closed_at = NULL,
      closed_by = NULL,
      closing_balance = NULL,
      expected_balance = NULL,
      difference = NULL,
      divergence_reason = NULL,
      is_late_closure = false
  WHERE id = target_session.id
  RETURNING * INTO target_session;

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
    target_session.tenant_id,
    target_session.id,
    'cash_reopened',
    'cash_session',
    'Caixa do dia reaberto.',
    before_state,
    to_jsonb(target_session),
    jsonb_build_object('reopened_as_current_day_session', true),
    auth.uid()
  );

  RETURN target_session;
END;
$$;

REVOKE ALL ON FUNCTION public.reopen_current_cash_session(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reopen_current_cash_session(uuid) TO authenticated;

-- Uma regularizacao nunca deve ser iniciada para o caixa do dia corrente.
-- Esse bloqueio tambem protege chamadas diretas ao banco, fora da interface.
CREATE OR REPLACE FUNCTION public.prevent_current_day_cash_regularization()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.cash_sessions AS cash_session
    WHERE cash_session.id = NEW.cash_session_id
      AND timezone('America/Sao_Paulo', cash_session.opened_at)::date
          = timezone('America/Sao_Paulo', now())::date
  ) THEN
    RAISE EXCEPTION 'O caixa do dia corrente deve ser reaberto normalmente, sem regularizacao historica' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_current_day_cash_regularization
  ON public.cash_session_regularizations;
CREATE TRIGGER prevent_current_day_cash_regularization
BEFORE INSERT OR UPDATE OF cash_session_id
ON public.cash_session_regularizations
FOR EACH ROW
EXECUTE FUNCTION public.prevent_current_day_cash_regularization();
