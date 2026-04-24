-- Table: service_products (vincula insumos/produtos aos serviços)
-- Permite definir quais produtos são consumidos ao realizar um serviço
CREATE TABLE public.service_products (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID REFERENCES public.tenants(id),
  service_id UUID NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  quantity NUMERIC NOT NULL DEFAULT 1,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  -- Evitar duplicatas
  UNIQUE (service_id, product_id)
);

-- Enable RLS
ALTER TABLE public.service_products ENABLE ROW LEVEL SECURITY;

-- Policies for service_products
CREATE POLICY "Users can view service_products in their tenant"
ON public.service_products FOR SELECT
USING (
  tenant_id = get_user_tenant_id(auth.uid())
  OR is_super_admin(auth.jwt() ->> 'email')
);

CREATE POLICY "Users can manage service_products in their tenant"
ON public.service_products FOR ALL
USING (
  (tenant_id = get_user_tenant_id(auth.uid()) AND can_tenant_modify(tenant_id))
  OR is_super_admin(auth.jwt() ->> 'email')
);

-- Index for faster lookups
CREATE INDEX idx_service_products_service_id ON public.service_products(service_id);
CREATE INDEX idx_service_products_product_id ON public.service_products(product_id);

-- Trigger for updated_at
CREATE TRIGGER update_service_products_updated_at
BEFORE UPDATE ON public.service_products
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();