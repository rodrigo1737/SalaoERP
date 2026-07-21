-- Corrige o fluxo de vale para que a saida do caixa e o debito da comissao
-- sejam gravados na mesma transacao, sem duplicidade em reenvios.

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_voucher_idempotency
  ON public.transactions (tenant_id, idempotency_key)
  WHERE reference_type = 'voucher' AND idempotency_key IS NOT NULL;

-- O fluxo de vale ja existe no frontend e nas policies, mas a restricao antiga
-- aceitava apenas service/product. Sem este ajuste, a saida do caixa era
-- criada e a comissao falhava em uma segunda operacao independente.
ALTER TABLE public.commissions
  DROP CONSTRAINT IF EXISTS commissions_type_check;

ALTER TABLE public.commissions
  ADD CONSTRAINT commissions_type_check
  CHECK (type IN ('service', 'product', 'voucher'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_commissions_voucher_transaction_unique
  ON public.commissions (transaction_id)
  WHERE type = 'voucher' AND transaction_id IS NOT NULL;

-- Repara vales antigos que ficaram somente no caixa. Nenhum movimento do
-- caixa e removido e o lancamento e auditado para permitir conferencia.
-- Esses registros pertencem a caixas ja encerrados. A reconstrução ocorre
-- durante a migration, com os triggers de período temporariamente suspensos;
-- o bloqueio continua ativo para todas as operações normais do sistema.
SET session_replication_role = 'replica';

WITH repaired AS (
  INSERT INTO public.commissions (
    professional_id,
    transaction_id,
    cash_session_id,
    type,
    base_value,
    commission_rate,
    commission_value,
    status,
    settled_amount,
    tenant_id,
    settlement_kind,
    service_name_snapshot,
    professional_name_snapshot,
    calculation_source,
    created_at
  )
  SELECT
    p.id,
    t.id,
    t.cash_session_id,
    'voucher',
    round(abs(t.amount), 2),
    100,
    -round(abs(t.amount), 2),
    'pending',
    0,
    t.tenant_id,
    'commission_payable',
    'Vale',
    coalesce(p.nickname, p.name, 'Profissional'),
    'voucher',
    t.created_at
  FROM public.transactions AS t
  JOIN public.professionals AS p
    ON p.id::text = t.reference_id
   AND p.tenant_id = t.tenant_id
  WHERE t.reference_type = 'voucher'
    AND t.type = 'expense'
    AND t.reversed_at IS NULL
    AND t.tenant_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.commissions AS c
      WHERE c.transaction_id = t.id
        AND c.type = 'voucher'
    )
  RETURNING id, transaction_id, cash_session_id, tenant_id,
            professional_id, commission_value, base_value
)
INSERT INTO public.financial_audit_logs (
  tenant_id,
  transaction_id,
  cash_session_id,
  commission_id,
  action_type,
  entity_type,
  description,
  after_state,
  metadata
)
SELECT
  r.tenant_id,
  r.transaction_id,
  r.cash_session_id,
  r.id,
  'voucher_repaired',
  'commission',
  'Vale historico vinculado a comissao.',
  jsonb_build_object(
    'commission_id', r.id,
    'professional_id', r.professional_id,
    'base_value', r.base_value,
    'commission_value', r.commission_value,
    'status', 'pending'
  ),
  jsonb_build_object('source', 'voucher_transaction_repair')
FROM repaired AS r;

SET session_replication_role = 'origin';

CREATE OR REPLACE FUNCTION public.register_voucher_atomic(
  _professional_id uuid,
  _amount numeric,
  _description text DEFAULT NULL,
  _cash_session_id uuid DEFAULT NULL,
  _movement_timestamp timestamptz DEFAULT NULL,
  _idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_professional public.professionals%ROWTYPE;
  v_session public.cash_sessions%ROWTYPE;
  v_tx public.transactions%ROWTYPE;
  v_commission public.commissions%ROWTYPE;
  v_existing_tx public.transactions%ROWTYPE;
  v_existing_commission public.commissions%ROWTYPE;
  v_tenant_id uuid;
  v_key text := NULLIF(trim(coalesce(_idempotency_key, '')), '');
  v_movement_at timestamptz := coalesce(_movement_timestamp, now());
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sessao de usuario obrigatoria.' USING ERRCODE = '42501';
  END IF;

  IF _amount IS NULL OR _amount <= 0 THEN
    RAISE EXCEPTION 'O valor do vale deve ser maior que zero.' USING ERRCODE = '22023';
  END IF;

  SELECT *
    INTO v_professional
  FROM public.professionals AS p
  WHERE p.id = _professional_id
    AND p.is_active = true
    AND p.deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profissional do vale nao encontrado ou inativo.' USING ERRCODE = 'P0002';
  END IF;

  v_tenant_id := v_professional.tenant_id;

  IF v_tenant_id IS NULL OR NOT public.can_tenant_modify(v_tenant_id) THEN
    RAISE EXCEPTION 'O estabelecimento nao esta disponivel para movimentacoes.' USING ERRCODE = '42501';
  END IF;

  IF NOT (
    public.has_role(auth.uid(), 'admin', v_tenant_id)
    OR public.has_permission(auth.uid(), 'manage_cash_flow', v_tenant_id)
    OR public.has_permission(auth.uid(), 'reverse_financial_entries', v_tenant_id)
  ) THEN
    RAISE EXCEPTION 'Sem permissao para registrar vales.' USING ERRCODE = '42501';
  END IF;

  IF _cash_session_id IS NULL THEN
    RAISE EXCEPTION 'Caixa obrigatorio para registrar o vale.' USING ERRCODE = '22023';
  END IF;

  SELECT *
    INTO v_session
  FROM public.cash_sessions AS cs
  WHERE cs.id = _cash_session_id
    AND cs.tenant_id = v_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Caixa nao encontrado para este estabelecimento.' USING ERRCODE = 'P0002';
  END IF;

  IF v_session.status = 'closed' THEN
    IF NOT (
      EXISTS (
        SELECT 1
        FROM public.cash_session_regularizations AS r
        WHERE r.cash_session_id = v_session.id
          AND r.tenant_id = v_tenant_id
          AND r.status = 'active'
      )
      AND (
        public.has_role(auth.uid(), 'admin', v_tenant_id)
        OR public.has_permission(auth.uid(), 'reverse_financial_entries', v_tenant_id)
      )
    ) THEN
      RAISE EXCEPTION 'Este caixa esta fechado. Abra uma regularizacao autorizada antes de registrar o vale.' USING ERRCODE = '42501';
    END IF;
  ELSIF v_session.status <> 'open' THEN
    RAISE EXCEPTION 'O caixa selecionado nao esta disponivel para lancamentos.' USING ERRCODE = '42501';
  END IF;

  IF v_key IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(
      hashtextextended(v_tenant_id::text || ':' || v_key, 9117)
    );

    SELECT *
      INTO v_existing_tx
    FROM public.transactions AS t
    WHERE t.tenant_id = v_tenant_id
      AND t.reference_type = 'voucher'
      AND t.idempotency_key = v_key
    FOR UPDATE;

    IF FOUND THEN
      IF v_existing_tx.reference_id IS DISTINCT FROM _professional_id::text THEN
        RAISE EXCEPTION 'A chave do vale ja foi usada para outro profissional.' USING ERRCODE = '23505';
      END IF;

      SELECT *
        INTO v_existing_commission
      FROM public.commissions AS c
      WHERE c.transaction_id = v_existing_tx.id
        AND c.type = 'voucher'
      LIMIT 1;

      IF NOT FOUND THEN
        INSERT INTO public.commissions (
          professional_id,
          transaction_id,
          cash_session_id,
          type,
          base_value,
          commission_rate,
          commission_value,
          status,
          settled_amount,
          tenant_id,
          settlement_kind,
          service_name_snapshot,
          professional_name_snapshot,
          calculation_source,
          created_at
        ) VALUES (
          _professional_id,
          v_existing_tx.id,
          v_existing_tx.cash_session_id,
          'voucher',
          round(abs(v_existing_tx.amount), 2),
          100,
          -round(abs(v_existing_tx.amount), 2),
          'pending',
          0,
          v_tenant_id,
          'commission_payable',
          'Vale',
          coalesce(v_professional.nickname, v_professional.name, 'Profissional'),
          'voucher',
          v_existing_tx.created_at
        )
        RETURNING * INTO v_existing_commission;

        INSERT INTO public.financial_audit_logs (
          tenant_id,
          transaction_id,
          cash_session_id,
          commission_id,
          action_type,
          entity_type,
          description,
          after_state,
          metadata,
          created_by
        ) VALUES (
          v_tenant_id,
          v_existing_tx.id,
          v_existing_tx.cash_session_id,
          v_existing_commission.id,
          'voucher_repaired',
          'commission',
          'Vale existente vinculado a comissao durante reenvio idempotente.',
          to_jsonb(v_existing_commission),
          jsonb_build_object('source', 'voucher_idempotent_retry'),
          auth.uid()
        );
      END IF;

      RETURN jsonb_build_object(
        'transaction_id', v_existing_tx.id,
        'commission_id', v_existing_commission.id,
        'idempotent_replay', true
      );
    END IF;
  END IF;

  INSERT INTO public.transactions (
    cash_session_id,
    type,
    category,
    description,
    amount,
    payment_method,
    reference_id,
    reference_type,
    created_by,
    created_at,
    tenant_id,
    idempotency_key
  ) VALUES (
    v_session.id,
    'expense',
    'Vale',
    coalesce(NULLIF(trim(_description), ''), 'Vale para ' || coalesce(v_professional.nickname, v_professional.name, 'Profissional')),
    round(_amount, 2),
    'cash',
    _professional_id::text,
    'voucher',
    auth.uid(),
    v_movement_at,
    v_tenant_id,
    v_key
  )
  RETURNING * INTO v_tx;

  INSERT INTO public.commissions (
    professional_id,
    transaction_id,
    cash_session_id,
    type,
    base_value,
    commission_rate,
    commission_value,
    status,
    settled_amount,
    tenant_id,
    settlement_kind,
    service_name_snapshot,
    professional_name_snapshot,
    calculation_source,
    created_at
  ) VALUES (
    _professional_id,
    v_tx.id,
    v_session.id,
    'voucher',
    round(_amount, 2),
    100,
    -round(_amount, 2),
    'pending',
    0,
    v_tenant_id,
    'commission_payable',
    'Vale',
    coalesce(v_professional.nickname, v_professional.name, 'Profissional'),
    'voucher',
    v_movement_at
  )
  RETURNING * INTO v_commission;

  INSERT INTO public.financial_audit_logs (
    tenant_id,
    transaction_id,
    cash_session_id,
    commission_id,
    action_type,
    entity_type,
    description,
    after_state,
    metadata,
    created_by
  ) VALUES (
    v_tenant_id,
    v_tx.id,
    v_session.id,
    v_commission.id,
    'voucher_created',
    'transaction',
    'Vale registrado no caixa e vinculado a comissao.',
    to_jsonb(v_tx),
    jsonb_build_object(
      'professional_id', _professional_id,
      'amount', round(_amount, 2),
      'cash_session_id', v_session.id
    ),
    auth.uid()
  );

  RETURN jsonb_build_object(
    'transaction_id', v_tx.id,
    'commission_id', v_commission.id,
    'idempotent_replay', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.register_voucher_atomic(uuid, numeric, text, uuid, timestamptz, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_voucher_atomic(uuid, numeric, text, uuid, timestamptz, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
