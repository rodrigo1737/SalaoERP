-- Create products table
CREATE TABLE public.products (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    category TEXT DEFAULT 'revenda',
    sku TEXT,
    barcode TEXT,
    cost_price NUMERIC NOT NULL DEFAULT 0,
    sale_price NUMERIC NOT NULL,
    stock_quantity INTEGER NOT NULL DEFAULT 0,
    min_stock INTEGER DEFAULT 5,
    unit TEXT DEFAULT 'un',
    type TEXT NOT NULL DEFAULT 'revenda' CHECK (type IN ('revenda', 'uso_interno')),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

-- Create policies for authenticated users
CREATE POLICY "Authenticated users can view products" 
ON public.products 
FOR SELECT 
USING (true);

CREATE POLICY "Authenticated users can manage products" 
ON public.products 
FOR ALL 
USING (true);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_products_updated_at
BEFORE UPDATE ON public.products
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for better performance
CREATE INDEX idx_products_type ON public.products(type);
CREATE INDEX idx_products_category ON public.products(category);
CREATE INDEX idx_products_is_active ON public.products(is_active);