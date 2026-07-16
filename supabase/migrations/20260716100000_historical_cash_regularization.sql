-- Regularizacao retroativa de caixa sem abrir uma segunda sessao por tenant.
-- O caixa historico continua fechado; a tabela abaixo autoriza, de forma
-- auditavel e concorrente-segura, o lancamento de baixas naquele periodo.

-- A tabela legada possui PK apenas em id. Esta chave composta permite que a
-- regularizacao valide tambem o tenant da sessao, sem confiar no frontend.
CREATE UNIQUE INDEX IF NOT EXISTS idx_cash_sessions_id_tenant
  ON public.cash_sessions (id, tenant_id);

CREATE TABLE IF NOT EXISTS public.cash_session_regularizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  cash_session_id uuid NOT NULL REFERENCES public.cash_sessions(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'closed', 'cancelled')),
  reason text NOT NULL,
  started_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ended_at timestamptz,
  ended_reason text,
  closing_balance numeric,
  expected_balance numeric,
  difference numeric,
  divergence_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cash_session_regularizations_reason_check CHECK (length(trim(reason)) >= 5),
  CONSTRAINT cash_session_regularizations_cash_session_tenant_fkey
    FOREIGN KEY (cash_session_id, tenant_id)
    REFERENCES public.cash_sessions(id, tenant_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_cash_regularization_one_active_per_tenant
  ON public.cash_session_regularizations (tenant_id)
  WHERE status = 'active';

CREATE UNIQUE INDEX IF NOT EXISTS idx_cash_regularization_one_active_per_session
  ON public.cash_session_regularizations (cash_session_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_cash_regularization_tenant_started
  ON public.cash_session_regularizations (tenant_id, started_at DESC);

ALTER TABLE public.commissions
  ADD COLUMN IF NOT EXISTS cash_session_id uuid;

ALTER TABLE public.commissions
  DROP CONSTRAINT IF EXISTS commissions_cash_session_id_fkey;

ALTER TABLE public.commissions
  ADD CONSTRAINT commissions_cash_session_id_fkey
  FOREIGN KEY (cash_session_id) REFERENCES public.cash_sessions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_commissions_tenant_cash_session
  ON public.commissions (tenant_id, cash_session_id, created_at DESC);

ALTER TABLE public.cash_session_regularizations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant cash regularizations are viewable by finance staff"
  ON public.cash_session_regularizations;
CREATE POLICY "Tenant cash regularizations are viewable by finance staff"
ON public.cash_session_regularizations
FOR SELECT
USING (
  tenant_id IS NOT NULL
  AND (
    public.has_role(auth.uid(), 'admin', tenant_id)
    OR public.has_permission(auth.uid(), 'view_financial_history', tenant_id)
    OR public.has_permission(auth.uid(), 'reverse_financial_entries', tenant_id)
    OR public.has_permission(auth.uid(), 'manage_cash_flow', tenant_id)
  )
);

DROP POLICY IF EXISTS "Tenant cash regularizations are insertable by finance staff"
  ON public.cash_session_regularizations;
CREATE POLICY "Tenant cash regularizations are insertable by finance staff"
ON public.cash_session_regularizations
FOR INSERT
WITH CHECK (
  tenant_id IS NOT NULL
  AND public.can_tenant_modify(tenant_id)
  AND (
    public.has_role(auth.uid(), 'admin', tenant_id)
    OR public.has_permission(auth.uid(), 'reverse_financial_entries', tenant_id)
  )
);

DROP POLICY IF EXISTS "Tenant cash regularizations are finishable by finance staff"
  ON public.cash_session_regularizations;
CREATE POLICY "Tenant cash regularizations are finishable by finance staff"
ON public.cash_session_regularizations
FOR UPDATE
USING (
  tenant_id IS NOT NULL
  AND public.can_tenant_modify(tenant_id)
  AND (
    public.has_role(auth.uid(), 'admin', tenant_id)
    OR public.has_permission(auth.uid(), 'reverse_financial_entries', tenant_id)
  )
)
WITH CHECK (
  tenant_id IS NOT NULL
  AND public.can_tenant_modify(tenant_id)
  AND (
    public.has_role(auth.uid(), 'admin', tenant_id)
    OR public.has_permission(auth.uid(), 'reverse_financial_entries', tenant_id)
  )
);

-- As funcoes sao SECURITY INVOKER: RLS continua sendo aplicada ao usuario que
-- iniciou a operacao. O lock do tenant impede duas regularizacoes concorrentes.
CREATE OR REPLACE FUNCTION public.start_cash_session_regularization(
  _cash_session_id uuid,
  _reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  target_session public.cash_sessions%ROWTYPE;
  active_regularization public.cash_session_regularizations%ROWTYPE;
  created_regularization public.cash_session_regularizations%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuario nao autenticado' USING ERRCODE = '42501';
  END IF;

  IF length(trim(coalesce(_reason, ''))) < 5 THEN
    RAISE EXCEPTION 'Informe o motivo da regularizacao' USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO target_session
  FROM public.cash_sessions
  WHERE id = _cash_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Caixa historico nao encontrado' USING ERRCODE = 'P0002';
  END IF;

  IF NOT (
    public.has_role(auth.uid(), 'admin', target_session.tenant_id)
    OR public.has_permission(auth.uid(), 'reverse_financial_entries', target_session.tenant_id)
  ) THEN
    RAISE EXCEPTION 'Sem permissao para regularizar caixas historicos' USING ERRCODE = '42501';
  END IF;

  IF target_session.status <> 'closed' THEN
    RAISE EXCEPTION 'Somente caixas fechados podem entrar em regularizacao' USING ERRCODE = '22023';
  END IF;

  -- Locks transacionais garantem que duas abas nao iniciem regularizacoes
  -- diferentes para o mesmo tenant antes da verificacao do indice parcial.
  PERFORM pg_advisory_xact_lock(hashtextextended(target_session.tenant_id::text, 734921));

  SELECT *
  INTO active_regularization
  FROM public.cash_session_regularizations
  WHERE tenant_id = target_session.tenant_id
    AND status = 'active'
  FOR UPDATE;

  IF FOUND THEN
    IF active_regularization.cash_session_id = target_session.id THEN
      RETURN to_jsonb(active_regularization);
    END IF;
    RAISE EXCEPTION 'Ja existe uma regularizacao ativa para esta empresa' USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.cash_session_regularizations (
    tenant_id,
    cash_session_id,
    status,
    reason,
    started_by
  )
  VALUES (
    target_session.tenant_id,
    target_session.id,
    'active',
    trim(_reason),
    auth.uid()
  )
  RETURNING * INTO created_regularization;

  INSERT INTO public.financial_audit_logs (
    tenant_id,
    cash_session_id,
    action_type,
    entity_type,
    description,
    after_state,
    metadata,
    created_by
  )
  VALUES (
    target_session.tenant_id,
    target_session.id,
    'cash_regularization_started',
    'cash_session',
    'Regularizacao retroativa iniciada.',
    to_jsonb(created_regularization),
    jsonb_build_object(
      'cash_business_date', timezone('America/Sao_Paulo', target_session.opened_at)::date,
      'reason', trim(_reason)
    ),
    auth.uid()
  );

  RETURN to_jsonb(created_regularization);
END;
$$;

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
  difference numeric;
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

  difference := round(_closing_balance - expected, 2);

  IF abs(difference) > 0.01 AND length(trim(coalesce(_divergence_reason, ''))) < 5 THEN
    RAISE EXCEPTION 'Informe a justificativa da divergencia' USING ERRCODE = '22023';
  END IF;

  UPDATE public.cash_session_regularizations
  SET status = 'closed',
      ended_by = auth.uid(),
      ended_at = now(),
      ended_reason = 'Regularizacao finalizada',
      closing_balance = _closing_balance,
      expected_balance = expected,
      difference = difference,
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
      'difference', difference,
      'divergence_reason', NULLIF(trim(_divergence_reason), '')
    ),
    auth.uid()
  );

  RETURN to_jsonb(finished_regularization);
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_cash_session_regularization(
  _regularization_id uuid,
  _reason text DEFAULT 'Regularizacao cancelada pelo operador'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  regularization public.cash_session_regularizations%ROWTYPE;
  cancelled_regularization public.cash_session_regularizations%ROWTYPE;
BEGIN
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
    RAISE EXCEPTION 'Sem permissao para cancelar a regularizacao' USING ERRCODE = '42501';
  END IF;

  UPDATE public.cash_session_regularizations
  SET status = 'cancelled',
      ended_by = auth.uid(),
      ended_at = now(),
      ended_reason = NULLIF(trim(_reason), '')
  WHERE id = regularization.id
  RETURNING * INTO cancelled_regularization;

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
    'cash_regularization_cancelled',
    'cash_session',
    'Regularizacao retroativa cancelada.',
    to_jsonb(regularization),
    to_jsonb(cancelled_regularization),
    jsonb_build_object('reason', NULLIF(trim(_reason), '')),
    auth.uid()
  );

  RETURN to_jsonb(cancelled_regularization);
END;
$$;

REVOKE ALL ON FUNCTION public.start_cash_session_regularization(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.finish_cash_session_regularization(uuid, numeric, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancel_cash_session_regularization(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_cash_session_regularization(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finish_cash_session_regularization(uuid, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_cash_session_regularization(uuid, text) TO authenticated;

-- A checagem abaixo fica em schema nao exposto para nao ampliar a superficie
-- de funcoes SECURITY DEFINER. Ela impede lancamentos diretos em um caixa
-- fechado sem uma regularizacao ativa para a mesma empresa.
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.enforce_historical_cash_regularization()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  target_session public.cash_sessions%ROWTYPE;
BEGIN
  IF NEW.cash_session_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO target_session
  FROM public.cash_sessions
  WHERE id = NEW.cash_session_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sessao de caixa nao encontrada' USING ERRCODE = '23503';
  END IF;

  IF target_session.tenant_id <> NEW.tenant_id THEN
    RAISE EXCEPTION 'A sessao de caixa pertence a outra empresa' USING ERRCODE = '42501';
  END IF;

  IF target_session.status = 'closed'
     AND NOT EXISTS (
       SELECT 1
       FROM public.cash_session_regularizations AS r
       WHERE r.tenant_id = NEW.tenant_id
         AND r.cash_session_id = NEW.cash_session_id
         AND r.status = 'active'
     ) THEN
    RAISE EXCEPTION 'Caixa fechado sem regularizacao retroativa ativa' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.enforce_historical_cash_regularization() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_transactions_historical_cash_regularization ON public.transactions;
CREATE TRIGGER trg_transactions_historical_cash_regularization
BEFORE INSERT OR UPDATE OF cash_session_id, tenant_id
ON public.transactions
FOR EACH ROW
EXECUTE FUNCTION private.enforce_historical_cash_regularization();

DROP TRIGGER IF EXISTS trg_commissions_historical_cash_regularization ON public.commissions;
CREATE TRIGGER trg_commissions_historical_cash_regularization
BEFORE INSERT OR UPDATE OF cash_session_id, tenant_id
ON public.commissions
FOR EACH ROW
EXECUTE FUNCTION private.enforce_historical_cash_regularization();
