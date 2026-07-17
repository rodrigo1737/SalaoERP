-- Atomic bill settlement.
-- A bill can pay the current appointment, settle previous client debts, use
-- client credit, or leave only the unpaid remainder as a new debt. All money
-- movements stay in the selected cash session and the request key prevents a
-- double click from creating a second payment.

CREATE TABLE IF NOT EXISTS public.client_ledger_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  ledger_entry_id uuid NOT NULL REFERENCES public.client_ledger_entries(id) ON DELETE RESTRICT,
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
  transaction_id uuid REFERENCES public.transactions(id) ON DELETE SET NULL,
  cash_session_id uuid REFERENCES public.cash_sessions(id) ON DELETE SET NULL,
  amount numeric NOT NULL CHECK (amount > 0),
  payment_method text NOT NULL CHECK (payment_method IN ('cash', 'pix', 'credit_card', 'debit_card', 'client_credit', 'other')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'reversed')),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  reversed_at timestamptz,
  reversed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reversal_transaction_id uuid REFERENCES public.transactions(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_client_ledger_settlements_tenant
  ON public.client_ledger_settlements (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_client_ledger_settlements_ledger
  ON public.client_ledger_settlements (ledger_entry_id, status);
CREATE INDEX IF NOT EXISTS idx_client_ledger_settlements_transaction
  ON public.client_ledger_settlements (transaction_id, status);

CREATE TABLE IF NOT EXISTS public.client_bill_payment_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  appointment_id uuid NOT NULL REFERENCES public.appointments(id) ON DELETE RESTRICT,
  idempotency_key text NOT NULL,
  result jsonb NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_client_bill_payment_batches_appointment
  ON public.client_bill_payment_batches (tenant_id, appointment_id, created_at DESC);

ALTER TABLE public.client_ledger_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_bill_payment_batches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant ledger settlements are viewable by finance staff" ON public.client_ledger_settlements;
CREATE POLICY "Tenant ledger settlements are viewable by finance staff"
ON public.client_ledger_settlements
FOR SELECT
USING (
  tenant_id IS NOT NULL
  AND (
    public.has_role(auth.uid(), 'admin', tenant_id)
    OR public.has_permission(auth.uid(), 'close_bill', tenant_id)
    OR public.has_permission(auth.uid(), 'manage_cash_flow', tenant_id)
    OR public.has_permission(auth.uid(), 'view_financial_history', tenant_id)
    OR public.has_permission(auth.uid(), 'reverse_financial_entries', tenant_id)
  )
);

DROP POLICY IF EXISTS "Tenant ledger settlements are insertable by cashier staff" ON public.client_ledger_settlements;
CREATE POLICY "Tenant ledger settlements are insertable by cashier staff"
ON public.client_ledger_settlements
FOR INSERT
WITH CHECK (
  tenant_id IS NOT NULL
  AND public.can_tenant_modify(tenant_id)
  AND (
    public.has_role(auth.uid(), 'admin', tenant_id)
    OR public.has_permission(auth.uid(), 'close_bill', tenant_id)
    OR public.has_permission(auth.uid(), 'manage_cash_flow', tenant_id)
  )
);

DROP POLICY IF EXISTS "Tenant ledger settlements are reversible by finance staff" ON public.client_ledger_settlements;
CREATE POLICY "Tenant ledger settlements are reversible by finance staff"
ON public.client_ledger_settlements
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

DROP POLICY IF EXISTS "Tenant bill payment batches are viewable by staff" ON public.client_bill_payment_batches;
CREATE POLICY "Tenant bill payment batches are viewable by staff"
ON public.client_bill_payment_batches
FOR SELECT
USING (
  tenant_id IS NOT NULL
  AND (
    public.has_role(auth.uid(), 'admin', tenant_id)
    OR public.has_permission(auth.uid(), 'close_bill', tenant_id)
    OR public.has_permission(auth.uid(), 'manage_cash_flow', tenant_id)
    OR public.has_permission(auth.uid(), 'view_financial_history', tenant_id)
  )
);

DROP POLICY IF EXISTS "Tenant bill payment batches are insertable by cashier staff" ON public.client_bill_payment_batches;
CREATE POLICY "Tenant bill payment batches are insertable by cashier staff"
ON public.client_bill_payment_batches
FOR INSERT
WITH CHECK (
  tenant_id IS NOT NULL
  AND public.can_tenant_modify(tenant_id)
  AND (
    public.has_role(auth.uid(), 'admin', tenant_id)
    OR public.has_permission(auth.uid(), 'close_bill', tenant_id)
    OR public.has_permission(auth.uid(), 'manage_cash_flow', tenant_id)
  )
);

CREATE OR REPLACE FUNCTION public.register_client_bill_payment(
  _appointment_id uuid,
  _cash_session_id uuid,
  _current_due numeric,
  _include_previous_debts boolean,
  _lines jsonb,
  _credit_deposit_amount numeric DEFAULT 0,
  _credit_deposit_method text DEFAULT NULL,
  _idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  appointment_row public.appointments%ROWTYPE;
  session_row public.cash_sessions%ROWTYPE;
  client_label text;
  previous_debt_total numeric := 0;
  total_due numeric := 0;
  declared_total numeric := 0;
  paid_total numeric := 0;
  credit_use numeric := 0;
  pending_total numeric := 0;
  credit_remaining numeric := 0;
  current_paid numeric := 0;
  old_debt_paid numeric := 0;
  unpaid_current numeric := 0;
  line_remaining numeric;
  take_amount numeric;
  movement_at timestamptz;
  payment_line record;
  debt_row record;
  credit_row record;
  transaction_row public.transactions%ROWTYPE;
  settlement_row public.client_ledger_settlements%ROWTYPE;
  existing_batch public.client_bill_payment_batches%ROWTYPE;
  batch_result jsonb;
  transaction_ids jsonb := '[]'::jsonb;
  settlement_ids jsonb := '[]'::jsonb;
  current_debt_id uuid;
  credit_deposit_tx_id uuid;
  request_lock_key bigint;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuario nao autenticado' USING ERRCODE = '42501';
  END IF;

  IF _current_due IS NULL OR _current_due < 0 THEN
    RAISE EXCEPTION 'Valor atual da comanda invalido' USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO appointment_row
  FROM public.appointments
  WHERE id = _appointment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Comanda nao encontrada' USING ERRCODE = 'P0002';
  END IF;

  IF NOT (
    public.has_role(auth.uid(), 'admin', appointment_row.tenant_id)
    OR public.has_permission(auth.uid(), 'close_bill', appointment_row.tenant_id)
    OR public.has_permission(auth.uid(), 'manage_cash_flow', appointment_row.tenant_id)
  ) THEN
    RAISE EXCEPTION 'Sem permissao para registrar pagamento' USING ERRCODE = '42501';
  END IF;

  IF _idempotency_key IS NOT NULL AND length(trim(_idempotency_key)) > 0 THEN
    request_lock_key := hashtextextended(appointment_row.tenant_id::text || ':' || trim(_idempotency_key), 7401);
    PERFORM pg_advisory_xact_lock(request_lock_key);

    SELECT *
    INTO existing_batch
    FROM public.client_bill_payment_batches
    WHERE tenant_id = appointment_row.tenant_id
      AND idempotency_key = trim(_idempotency_key)
    FOR UPDATE;

    IF FOUND THEN
      RETURN existing_batch.result || jsonb_build_object('idempotent_replay', true);
    END IF;
  END IF;

  IF appointment_row.client_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(
      hashtextextended(appointment_row.tenant_id::text || ':' || appointment_row.client_id::text, 7402)
    );
    SELECT coalesce(c.name, 'Cliente')
    INTO client_label
    FROM public.clients AS c
    WHERE c.id = appointment_row.client_id
      AND c.tenant_id = appointment_row.tenant_id;
  ELSE
    client_label := 'Cliente';
  END IF;

  SELECT
    coalesce(sum(line.amount), 0),
    coalesce(sum(line.amount) FILTER (WHERE line.method IN ('cash', 'pix', 'credit_card', 'debit_card')), 0),
    coalesce(sum(line.amount) FILTER (WHERE line.method = 'client_credit'), 0),
    coalesce(sum(line.amount) FILTER (WHERE line.method = 'pending'), 0)
  INTO declared_total, paid_total, credit_use, pending_total
  FROM jsonb_to_recordset(coalesce(_lines, '[]'::jsonb)) AS line(method text, amount numeric)
  WHERE line.amount > 0.009;

  IF declared_total <= 0.009 THEN
    RAISE EXCEPTION 'Informe ao menos uma forma de pagamento' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(coalesce(_lines, '[]'::jsonb)) AS line(method text, amount numeric)
    WHERE line.amount < -0.009
      OR line.method NOT IN ('cash', 'pix', 'credit_card', 'debit_card', 'client_credit', 'pending')
  ) THEN
    RAISE EXCEPTION 'Forma ou valor de pagamento invalido' USING ERRCODE = '22023';
  END IF;

  IF (_credit_deposit_amount IS NOT NULL AND _credit_deposit_amount < -0.009)
     OR (_credit_deposit_amount > 0.009 AND _credit_deposit_method NOT IN ('cash', 'pix', 'credit_card', 'debit_card')) THEN
    RAISE EXCEPTION 'Credito adicional invalido' USING ERRCODE = '22023';
  END IF;

  IF _include_previous_debts AND appointment_row.client_id IS NOT NULL THEN
    SELECT coalesce(sum(greatest(e.amount - e.settled_amount, 0)), 0)
    INTO previous_debt_total
    FROM public.client_ledger_entries AS e
    WHERE e.tenant_id = appointment_row.tenant_id
      AND e.client_id = appointment_row.client_id
      AND e.entry_type = 'debt'
      AND e.status = 'open';
  END IF;

  total_due := round(coalesce(_current_due, 0) + previous_debt_total, 2);
  IF abs(declared_total - total_due) > 0.01 THEN
    RAISE EXCEPTION 'O total das formas de pagamento (R$ %) deve ser R$ %',
      to_char(declared_total, 'FM999999990.00'),
      to_char(total_due, 'FM999999990.00')
      USING ERRCODE = '22023';
  END IF;

  IF (pending_total > 0.009 OR credit_use > 0.009 OR previous_debt_total > 0.009)
     AND appointment_row.client_id IS NULL THEN
    RAISE EXCEPTION 'Pendencia, credito ou baixa de divida exige cliente identificado' USING ERRCODE = '22023';
  END IF;

  IF _cash_session_id IS NOT NULL THEN
    SELECT *
    INTO session_row
    FROM public.cash_sessions
    WHERE id = _cash_session_id
      AND tenant_id = appointment_row.tenant_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Caixa selecionado nao pertence ao cliente atual' USING ERRCODE = '42501';
    END IF;

    IF session_row.status <> 'open'
       AND NOT EXISTS (
         SELECT 1
         FROM public.cash_session_regularizations AS r
         WHERE r.cash_session_id = session_row.id
           AND r.tenant_id = session_row.tenant_id
           AND r.status = 'active'
       ) THEN
      RAISE EXCEPTION 'O caixa selecionado nao esta aberto para lancamentos' USING ERRCODE = '42501';
    END IF;
    movement_at := CASE WHEN session_row.status = 'closed' THEN session_row.opened_at ELSE now() END;
  ELSIF paid_total > 0.009 OR coalesce(_credit_deposit_amount, 0) > 0.009 THEN
    RAISE EXCEPTION 'Abra ou selecione o caixa antes de registrar recebimentos' USING ERRCODE = '42501';
  END IF;

  -- Validate and consume client credit before inserting any movement. The
  -- transaction rollback protects the balance if a later step fails.
  credit_remaining := credit_use;
  IF credit_remaining > 0.009 THEN
    FOR credit_row IN
      SELECT e.*
      FROM public.client_ledger_entries AS e
      WHERE e.tenant_id = appointment_row.tenant_id
        AND e.client_id = appointment_row.client_id
        AND e.entry_type = 'credit'
        AND e.status = 'open'
        AND e.amount > e.settled_amount
      ORDER BY e.created_at, e.id
      FOR UPDATE
    LOOP
      EXIT WHEN credit_remaining <= 0.009;
      take_amount := least(credit_remaining, greatest(credit_row.amount - credit_row.settled_amount, 0));
      IF take_amount > 0.009 THEN
        UPDATE public.client_ledger_entries
        SET settled_amount = settled_amount + take_amount,
            status = CASE WHEN settled_amount + take_amount >= amount - 0.009 THEN 'settled' ELSE 'open' END,
            settled_at = CASE WHEN settled_amount + take_amount >= amount - 0.009 THEN now() ELSE NULL END
        WHERE id = credit_row.id;
        credit_remaining := credit_remaining - take_amount;
      END IF;
    END LOOP;
    IF credit_remaining > 0.009 THEN
      RAISE EXCEPTION 'Credito do cliente insuficiente' USING ERRCODE = '22023';
    END IF;
  END IF;

  -- Allocate each paid line first against the oldest debts, then against the
  -- current appointment. This makes a single payment settle both balances.
  FOR payment_line IN
    SELECT line.method, line.amount
    FROM jsonb_to_recordset(coalesce(_lines, '[]'::jsonb)) AS line(method text, amount numeric)
    WHERE line.amount > 0.009
      AND line.method <> 'pending'
  LOOP
    line_remaining := payment_line.amount;

    IF _include_previous_debts AND line_remaining > 0.009 THEN
      FOR debt_row IN
        SELECT e.*
        FROM public.client_ledger_entries AS e
        WHERE e.tenant_id = appointment_row.tenant_id
          AND e.client_id = appointment_row.client_id
          AND e.entry_type = 'debt'
          AND e.status = 'open'
          AND e.amount > e.settled_amount
        ORDER BY e.created_at, e.id
        FOR UPDATE
      LOOP
        EXIT WHEN line_remaining <= 0.009;
        take_amount := least(line_remaining, greatest(debt_row.amount - debt_row.settled_amount, 0));
        IF take_amount > 0.009 THEN
          UPDATE public.client_ledger_entries
          SET settled_amount = settled_amount + take_amount,
              status = CASE WHEN settled_amount + take_amount >= amount - 0.009 THEN 'settled' ELSE 'open' END,
              settled_at = CASE WHEN settled_amount + take_amount >= amount - 0.009 THEN now() ELSE NULL END
          WHERE id = debt_row.id;

          old_debt_paid := old_debt_paid + take_amount;
          IF payment_line.method = 'client_credit' THEN
            INSERT INTO public.client_ledger_settlements (
              tenant_id, ledger_entry_id, appointment_id, cash_session_id,
              amount, payment_method, created_by
            ) VALUES (
              appointment_row.tenant_id, debt_row.id, _appointment_id, session_row.id,
              take_amount, 'client_credit', auth.uid()
            )
            RETURNING * INTO settlement_row;
          ELSE
            INSERT INTO public.transactions (
              cash_session_id, type, category, description, amount,
              payment_method, reference_id, reference_type, created_by, tenant_id,
              created_at
            ) VALUES (
              session_row.id, 'income', 'client_debt_settlement',
              'Baixa de pendencia - ' || client_label, take_amount,
              payment_line.method, _appointment_id, 'client_ledger_settlement',
              auth.uid(), appointment_row.tenant_id, coalesce(movement_at, now())
            )
            RETURNING * INTO transaction_row;

            transaction_ids := transaction_ids || jsonb_build_array(transaction_row.id);
            INSERT INTO public.client_ledger_settlements (
              tenant_id, ledger_entry_id, appointment_id, transaction_id, cash_session_id,
              amount, payment_method, created_by
            ) VALUES (
              appointment_row.tenant_id, debt_row.id, _appointment_id, transaction_row.id, session_row.id,
              take_amount, payment_line.method, auth.uid()
            )
            RETURNING * INTO settlement_row;
          END IF;

          settlement_ids := settlement_ids || jsonb_build_array(settlement_row.id);
          line_remaining := line_remaining - take_amount;
        END IF;
      END LOOP;
    END IF;

    IF line_remaining > 0.009 THEN
      current_paid := current_paid + line_remaining;
      IF payment_line.method <> 'client_credit' THEN
        INSERT INTO public.transactions (
          cash_session_id, type, category, description, amount,
          payment_method, reference_id, reference_type, created_by, tenant_id,
          created_at
        ) VALUES (
          session_row.id, 'income', 'service', 'Comanda - ' || client_label,
          line_remaining, payment_line.method, _appointment_id, 'appointment',
          auth.uid(), appointment_row.tenant_id, coalesce(movement_at, now())
        )
        RETURNING * INTO transaction_row;
        transaction_ids := transaction_ids || jsonb_build_array(transaction_row.id);
      END IF;
    END IF;
  END LOOP;

  unpaid_current := round(greatest(_current_due - current_paid, 0), 2);
  IF unpaid_current > 0.009 THEN
    INSERT INTO public.client_ledger_entries (
      tenant_id, client_id, appointment_id, entry_type, amount, description, created_by
    ) VALUES (
      appointment_row.tenant_id, appointment_row.client_id, _appointment_id,
      'debt', unpaid_current, 'Pendencia residual da comanda', auth.uid()
    )
    RETURNING id INTO current_debt_id;
  END IF;

  IF coalesce(_credit_deposit_amount, 0) > 0.009 THEN
    INSERT INTO public.transactions (
      cash_session_id, type, category, description, amount, payment_method,
      reference_id, reference_type, created_by, tenant_id, created_at
    ) VALUES (
      session_row.id, 'income', 'client_credit', 'Credito deixado por ' || client_label,
      _credit_deposit_amount, _credit_deposit_method, _appointment_id, 'client_credit',
      auth.uid(), appointment_row.tenant_id, coalesce(movement_at, now())
    )
    RETURNING id INTO credit_deposit_tx_id;

    INSERT INTO public.client_ledger_entries (
      tenant_id, client_id, appointment_id, transaction_id, entry_type, amount,
      description, created_by
    ) VALUES (
      appointment_row.tenant_id, appointment_row.client_id, _appointment_id,
      credit_deposit_tx_id, 'credit', _credit_deposit_amount,
      'Credito deixado na comanda', auth.uid()
    );
    transaction_ids := transaction_ids || jsonb_build_array(credit_deposit_tx_id);
  END IF;

  batch_result := jsonb_build_object(
    'appointment_id', _appointment_id,
    'cash_session_id', _cash_session_id,
    'total_due', total_due,
    'current_due', _current_due,
    'previous_debt_total', previous_debt_total,
    'previous_debt_settled', old_debt_paid,
    'current_paid', current_paid,
    'current_debt_created', unpaid_current,
    'paid_total', paid_total,
    'pending_total', pending_total,
    'credit_used', credit_use,
    'credit_deposit', coalesce(_credit_deposit_amount, 0),
    'transaction_ids', transaction_ids,
    'settlement_ids', settlement_ids,
    'idempotent_replay', false
  );

  IF _idempotency_key IS NOT NULL AND length(trim(_idempotency_key)) > 0 THEN
    INSERT INTO public.client_bill_payment_batches (
      tenant_id, appointment_id, idempotency_key, result, created_by
    ) VALUES (
      appointment_row.tenant_id, _appointment_id, trim(_idempotency_key), batch_result, auth.uid()
    );
  END IF;

  INSERT INTO public.financial_audit_logs (
    tenant_id, cash_session_id, appointment_id, action_type, entity_type,
    description, after_state, metadata, created_by
  ) VALUES (
    appointment_row.tenant_id, _cash_session_id, _appointment_id,
    'client_bill_payment_registered', 'client_bill_payment',
    'Pagamento de comanda registrado com baixa de pendencias.',
    batch_result, jsonb_build_object(
      'include_previous_debts', _include_previous_debts,
      'current_debt_id', current_debt_id,
      'credit_deposit_transaction_id', credit_deposit_tx_id
    ), auth.uid()
  );

  RETURN batch_result;
END;
$$;

REVOKE ALL ON FUNCTION public.register_client_bill_payment(uuid, uuid, numeric, boolean, jsonb, numeric, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_client_bill_payment(uuid, uuid, numeric, boolean, jsonb, numeric, text, text) TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'client_ledger_settlements'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.client_ledger_settlements;
  END IF;
END $$;
