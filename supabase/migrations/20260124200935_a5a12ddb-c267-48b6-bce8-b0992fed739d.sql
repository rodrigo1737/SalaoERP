-- ============================================
-- ETAPA 1: Estrutura de Dados para Controle de Estoque
-- ============================================

-- Tabela de Fornecedores
CREATE TABLE public.suppliers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  trade_name TEXT,
  cnpj TEXT,
  cpf TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  zip_code TEXT,
  contact_name TEXT,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Índices para fornecedores
CREATE INDEX idx_suppliers_tenant ON public.suppliers(tenant_id);
CREATE INDEX idx_suppliers_name ON public.suppliers(tenant_id, name);

-- Expandir tabela de produtos com novos campos
ALTER TABLE public.products 
  ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS location TEXT,
  ADD COLUMN IF NOT EXISTS batch_number TEXT,
  ADD COLUMN IF NOT EXISTS expiry_date DATE,
  ADD COLUMN IF NOT EXISTS last_purchase_price NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_purchase_date TIMESTAMP WITH TIME ZONE;

-- Tabela de Movimentações de Estoque
CREATE TABLE public.stock_movements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  movement_type TEXT NOT NULL CHECK (movement_type IN ('purchase', 'sale', 'adjustment', 'service_consumption', 'return', 'loss')),
  quantity INTEGER NOT NULL,
  unit_price NUMERIC DEFAULT 0,
  total_value NUMERIC DEFAULT 0,
  previous_stock INTEGER NOT NULL,
  new_stock INTEGER NOT NULL,
  
  -- Campos para compras
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  invoice_number TEXT,
  invoice_date DATE,
  batch_number TEXT,
  expiry_date DATE,
  
  -- Campos para vendas/serviços
  appointment_id UUID REFERENCES public.appointments(id) ON DELETE SET NULL,
  transaction_id UUID REFERENCES public.transactions(id) ON DELETE SET NULL,
  
  -- Campos gerais
  reason TEXT,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Índices para movimentações
CREATE INDEX idx_stock_movements_tenant ON public.stock_movements(tenant_id);
CREATE INDEX idx_stock_movements_product ON public.stock_movements(product_id);
CREATE INDEX idx_stock_movements_type ON public.stock_movements(tenant_id, movement_type);
CREATE INDEX idx_stock_movements_date ON public.stock_movements(tenant_id, created_at DESC);

-- Trigger para atualizar updated_at em suppliers
CREATE TRIGGER update_suppliers_updated_at
  BEFORE UPDATE ON public.suppliers
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- RLS Policies para Suppliers
-- ============================================
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view suppliers in their tenant"
  ON public.suppliers
  FOR SELECT
  USING (
    (tenant_id = get_user_tenant_id(auth.uid()))
    OR is_super_admin(auth.jwt() ->> 'email')
  );

CREATE POLICY "Users can manage suppliers in their tenant"
  ON public.suppliers
  FOR ALL
  USING (
    ((tenant_id = get_user_tenant_id(auth.uid())) AND can_tenant_modify(tenant_id))
    OR is_super_admin(auth.jwt() ->> 'email')
  );

-- ============================================
-- RLS Policies para Stock Movements
-- ============================================
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view stock movements in their tenant"
  ON public.stock_movements
  FOR SELECT
  USING (
    (tenant_id = get_user_tenant_id(auth.uid()))
    OR is_super_admin(auth.jwt() ->> 'email')
  );

CREATE POLICY "Users can insert stock movements in their tenant"
  ON public.stock_movements
  FOR INSERT
  WITH CHECK (
    ((tenant_id = get_user_tenant_id(auth.uid())) AND can_tenant_modify(tenant_id))
    OR is_super_admin(auth.jwt() ->> 'email')
  );

-- Não permitir update/delete de movimentações (imutabilidade para auditoria)
-- Movimentações são registros de auditoria e não devem ser alteradas