-- Fecha as politicas legadas que autorizavam escrita apenas por pertencer ao
-- tenant. As regras abaixo espelham as operacoes realmente oferecidas pela UI:
-- recepcao pode manter clientes e criar servicos pela agenda; cadastros de
-- profissionais, produtos e estoque administrativo continuam exclusivos do
-- administrador.

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.professionals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_professionals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage clients in their tenant" ON public.clients;
DROP POLICY IF EXISTS "Tenant clients are manageable by authorized staff" ON public.clients;
CREATE POLICY "Tenant clients are manageable by authorized staff"
ON public.clients
FOR ALL
TO authenticated
USING (
  tenant_id IS NOT NULL
  AND public.can_tenant_modify(tenant_id)
  AND (
    public.has_role(auth.uid(), 'admin', tenant_id)
    OR public.has_permission(auth.uid(), 'edit_schedule', tenant_id)
    OR public.is_super_admin(auth.jwt() ->> 'email')
  )
)
WITH CHECK (
  tenant_id IS NOT NULL
  AND public.can_tenant_modify(tenant_id)
  AND (
    public.has_role(auth.uid(), 'admin', tenant_id)
    OR public.has_permission(auth.uid(), 'edit_schedule', tenant_id)
    OR public.is_super_admin(auth.jwt() ->> 'email')
  )
);

DROP POLICY IF EXISTS "Users can manage services in their tenant" ON public.services;
DROP POLICY IF EXISTS "Tenant services are manageable by authorized staff" ON public.services;
CREATE POLICY "Tenant services are manageable by authorized staff"
ON public.services
FOR ALL
TO authenticated
USING (
  tenant_id IS NOT NULL
  AND public.can_tenant_modify(tenant_id)
  AND (
    public.has_role(auth.uid(), 'admin', tenant_id)
    OR public.has_permission(auth.uid(), 'edit_schedule', tenant_id)
    OR public.is_super_admin(auth.jwt() ->> 'email')
  )
)
WITH CHECK (
  tenant_id IS NOT NULL
  AND public.can_tenant_modify(tenant_id)
  AND (
    public.has_role(auth.uid(), 'admin', tenant_id)
    OR public.has_permission(auth.uid(), 'edit_schedule', tenant_id)
    OR public.is_super_admin(auth.jwt() ->> 'email')
  )
);

DROP POLICY IF EXISTS "Users can manage service_professionals in their tenant" ON public.service_professionals;
DROP POLICY IF EXISTS "Tenant service professionals are manageable by authorized staff" ON public.service_professionals;
CREATE POLICY "Tenant service professionals are manageable by authorized staff"
ON public.service_professionals
FOR ALL
TO authenticated
USING (
  tenant_id IS NOT NULL
  AND public.can_tenant_modify(tenant_id)
  AND (
    public.has_role(auth.uid(), 'admin', tenant_id)
    OR public.has_permission(auth.uid(), 'edit_schedule', tenant_id)
    OR public.is_super_admin(auth.jwt() ->> 'email')
  )
)
WITH CHECK (
  tenant_id IS NOT NULL
  AND public.can_tenant_modify(tenant_id)
  AND (
    public.has_role(auth.uid(), 'admin', tenant_id)
    OR public.has_permission(auth.uid(), 'edit_schedule', tenant_id)
    OR public.is_super_admin(auth.jwt() ->> 'email')
  )
);

DROP POLICY IF EXISTS "Users can manage professionals in their tenant" ON public.professionals;
DROP POLICY IF EXISTS "Tenant professionals are manageable by admins" ON public.professionals;
CREATE POLICY "Tenant professionals are manageable by admins"
ON public.professionals
FOR ALL
TO authenticated
USING (
  tenant_id IS NOT NULL
  AND public.can_tenant_modify(tenant_id)
  AND (
    public.has_role(auth.uid(), 'admin', tenant_id)
    OR public.is_super_admin(auth.jwt() ->> 'email')
  )
)
WITH CHECK (
  tenant_id IS NOT NULL
  AND public.can_tenant_modify(tenant_id)
  AND (
    public.has_role(auth.uid(), 'admin', tenant_id)
    OR public.is_super_admin(auth.jwt() ->> 'email')
  )
);

DROP POLICY IF EXISTS "Users can manage products in their tenant" ON public.products;
DROP POLICY IF EXISTS "Tenant products are manageable by admins" ON public.products;
CREATE POLICY "Tenant products are manageable by admins"
ON public.products
FOR ALL
TO authenticated
USING (
  tenant_id IS NOT NULL
  AND public.can_tenant_modify(tenant_id)
  AND (
    public.has_role(auth.uid(), 'admin', tenant_id)
    OR public.is_super_admin(auth.jwt() ->> 'email')
  )
)
WITH CHECK (
  tenant_id IS NOT NULL
  AND public.can_tenant_modify(tenant_id)
  AND (
    public.has_role(auth.uid(), 'admin', tenant_id)
    OR public.is_super_admin(auth.jwt() ->> 'email')
  )
);

DROP POLICY IF EXISTS "Users can insert stock movements in their tenant" ON public.stock_movements;
DROP POLICY IF EXISTS "Tenant stock movements are insertable by admins" ON public.stock_movements;
CREATE POLICY "Tenant stock movements are insertable by admins"
ON public.stock_movements
FOR INSERT
TO authenticated
WITH CHECK (
  tenant_id IS NOT NULL
  AND public.can_tenant_modify(tenant_id)
  AND (
    public.has_role(auth.uid(), 'admin', tenant_id)
    OR public.is_super_admin(auth.jwt() ->> 'email')
  )
);

-- Remove as politicas financeiras permissivas herdadas do schema inicial.
-- As politicas "Tenant ..." criadas pelas migrations financeiras permanecem.
DROP POLICY IF EXISTS "Users can view transactions in their tenant" ON public.transactions;
DROP POLICY IF EXISTS "Users can insert transactions in their tenant" ON public.transactions;
DROP POLICY IF EXISTS "Users can update transactions in their tenant" ON public.transactions;
DROP POLICY IF EXISTS "Users can manage transactions in their tenant" ON public.transactions;
DROP POLICY IF EXISTS "Users can manage commissions in their tenant" ON public.commissions;

-- register_client_bill_payment usa SELECT ... FOR UPDATE para reproduzir uma
-- operacao existente. O PostgreSQL tambem exige uma politica UPDATE para esse
-- lock. WITH CHECK (false) libera somente o lock e continua proibindo qualquer
-- alteracao direta do lote pela API.
DROP POLICY IF EXISTS "Tenant bill payment batches can be locked by cashier staff"
ON public.client_bill_payment_batches;
CREATE POLICY "Tenant bill payment batches can be locked by cashier staff"
ON public.client_bill_payment_batches
FOR UPDATE
TO authenticated
USING (
  tenant_id IS NOT NULL
  AND (
    public.has_role(auth.uid(), 'admin', tenant_id)
    OR public.has_permission(auth.uid(), 'close_bill', tenant_id)
    OR public.has_permission(auth.uid(), 'manage_cash_flow', tenant_id)
  )
)
WITH CHECK (false);

-- A operacao de venda/consumo precisa atualizar movimento e saldo no mesmo
-- commit. A chave da operacao da comanda torna reenvios seguros.
ALTER TABLE public.stock_movements
  ADD COLUMN IF NOT EXISTS idempotency_key uuid;

CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_movements_sale_idempotency
  ON public.stock_movements (tenant_id, idempotency_key, product_id)
  WHERE idempotency_key IS NOT NULL AND movement_type = 'sale';

CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_movements_consumption_idempotency
  ON public.stock_movements (tenant_id, idempotency_key, appointment_id, product_id)
  WHERE idempotency_key IS NOT NULL AND movement_type = 'service_consumption';

CREATE SCHEMA IF NOT EXISTS private;

CREATE OR REPLACE FUNCTION private.register_operational_stock_movement_impl(
  _product_id uuid,
  _movement_type text,
  _quantity integer,
  _unit_price numeric DEFAULT NULL,
  _transaction_id uuid DEFAULT NULL,
  _appointment_id uuid DEFAULT NULL,
  _idempotency_key uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller uuid := auth.uid();
  product_row public.products%ROWTYPE;
  existing_row public.stock_movements%ROWTYPE;
  applied_quantity integer;
  next_stock integer;
  movement_row public.stock_movements%ROWTYPE;
BEGIN
  IF caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF _movement_type NOT IN ('sale', 'service_consumption') THEN
    RAISE EXCEPTION 'Unsupported operational stock movement: %', _movement_type;
  END IF;

  IF _quantity IS NULL OR _quantity <= 0 THEN
    RAISE EXCEPTION 'Quantity must be greater than zero';
  END IF;

  IF _movement_type = 'service_consumption' AND _appointment_id IS NULL THEN
    RAISE EXCEPTION 'Appointment is required for service consumption';
  END IF;

  IF _idempotency_key IS NOT NULL THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        _idempotency_key::text || ':' || _movement_type || ':' || _product_id::text || ':' || COALESCE(_appointment_id::text, ''),
        0
      )
    );

    SELECT movement.*
    INTO existing_row
    FROM public.stock_movements AS movement
    WHERE movement.idempotency_key = _idempotency_key
      AND movement.product_id = _product_id
      AND movement.movement_type = _movement_type
      AND (
        _movement_type = 'sale'
        OR movement.appointment_id = _appointment_id
      )
    LIMIT 1;

    IF existing_row.id IS NOT NULL THEN
      RETURN jsonb_build_object(
        'movement_id', existing_row.id,
        'previous_stock', existing_row.previous_stock,
        'new_stock', existing_row.new_stock,
        'replayed', true
      );
    END IF;
  END IF;

  SELECT product.*
  INTO product_row
  FROM public.products AS product
  WHERE product.id = _product_id
    AND product.deleted_at IS NULL
  FOR UPDATE;

  IF product_row.id IS NULL OR product_row.tenant_id IS NULL THEN
    RAISE EXCEPTION 'Product not found';
  END IF;

  IF NOT public.can_tenant_modify(product_row.tenant_id) THEN
    RAISE EXCEPTION 'Tenant is read-only';
  END IF;

  IF NOT (
    public.has_role(caller, 'admin', product_row.tenant_id)
    OR public.has_permission(caller, 'close_bill', product_row.tenant_id)
    OR public.is_super_admin(auth.jwt() ->> 'email')
  ) THEN
    RAISE EXCEPTION 'Insufficient permission for stock operation';
  END IF;

  IF _transaction_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.transactions AS transaction
    WHERE transaction.id = _transaction_id
      AND transaction.tenant_id = product_row.tenant_id
  ) THEN
    RAISE EXCEPTION 'Transaction does not belong to product tenant';
  END IF;

  IF _appointment_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.appointments AS appointment
    WHERE appointment.id = _appointment_id
      AND appointment.tenant_id = product_row.tenant_id
  ) THEN
    RAISE EXCEPTION 'Appointment does not belong to product tenant';
  END IF;

  IF _movement_type = 'sale' AND product_row.stock_quantity < _quantity THEN
    RAISE EXCEPTION 'Insufficient stock';
  END IF;

  applied_quantity := CASE
    WHEN _movement_type = 'service_consumption'
      THEN LEAST(product_row.stock_quantity, _quantity)
    ELSE _quantity
  END;
  next_stock := product_row.stock_quantity - applied_quantity;

  INSERT INTO public.stock_movements (
    tenant_id,
    product_id,
    movement_type,
    quantity,
    unit_price,
    total_value,
    previous_stock,
    new_stock,
    appointment_id,
    transaction_id,
    notes,
    created_by,
    idempotency_key
  ) VALUES (
    product_row.tenant_id,
    product_row.id,
    _movement_type,
    -applied_quantity,
    COALESCE(_unit_price, 0),
    CASE WHEN _movement_type = 'sale' THEN applied_quantity * COALESCE(_unit_price, 0) ELSE 0 END,
    product_row.stock_quantity,
    next_stock,
    _appointment_id,
    _transaction_id,
    CASE
      WHEN _movement_type = 'service_consumption' AND applied_quantity < _quantity
        THEN 'Consumo automatico parcial por estoque insuficiente'
      WHEN _movement_type = 'service_consumption'
        THEN 'Consumo automatico - Servico'
      ELSE NULL
    END,
    caller,
    _idempotency_key
  )
  RETURNING * INTO movement_row;

  UPDATE public.products
  SET stock_quantity = next_stock
  WHERE id = product_row.id;

  RETURN jsonb_build_object(
    'movement_id', movement_row.id,
    'previous_stock', movement_row.previous_stock,
    'new_stock', movement_row.new_stock,
    'replayed', false
  );
END;
$$;

REVOKE ALL ON FUNCTION private.register_operational_stock_movement_impl(uuid, text, integer, numeric, uuid, uuid, uuid)
FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.register_operational_stock_movement_impl(uuid, text, integer, numeric, uuid, uuid, uuid)
TO authenticated;

-- A funcao exposta pela Data API permanece SECURITY INVOKER. A elevacao fica
-- isolada no schema private, fora dos schemas publicados pelo PostgREST, e a
-- implementacao privada ainda valida tenant e permissoes antes de escrever.
CREATE OR REPLACE FUNCTION public.register_operational_stock_movement(
  _product_id uuid,
  _movement_type text,
  _quantity integer,
  _unit_price numeric DEFAULT NULL,
  _transaction_id uuid DEFAULT NULL,
  _appointment_id uuid DEFAULT NULL,
  _idempotency_key uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT private.register_operational_stock_movement_impl(
    _product_id,
    _movement_type,
    _quantity,
    _unit_price,
    _transaction_id,
    _appointment_id,
    _idempotency_key
  );
$$;

REVOKE ALL ON FUNCTION public.register_operational_stock_movement(uuid, text, integer, numeric, uuid, uuid, uuid)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_operational_stock_movement(uuid, text, integer, numeric, uuid, uuid, uuid)
TO authenticated;
