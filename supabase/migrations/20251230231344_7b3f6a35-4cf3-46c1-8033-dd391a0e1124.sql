-- Create table for cash register sessions
CREATE TABLE public.cash_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opened_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  closed_at TIMESTAMP WITH TIME ZONE,
  opening_balance DECIMAL(10,2) NOT NULL DEFAULT 0,
  closing_balance DECIMAL(10,2),
  expected_balance DECIMAL(10,2),
  difference DECIMAL(10,2),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create table for financial transactions
CREATE TABLE public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cash_session_id UUID REFERENCES public.cash_sessions(id),
  type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  category TEXT NOT NULL,
  description TEXT,
  amount DECIMAL(10,2) NOT NULL,
  payment_method TEXT CHECK (payment_method IN ('cash', 'credit_card', 'debit_card', 'pix', 'other')),
  reference_id TEXT,
  reference_type TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create table for professionals (persistent)
CREATE TABLE public.professionals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  name TEXT NOT NULL,
  nickname TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  type TEXT NOT NULL DEFAULT 'employee' CHECK (type IN ('owner', 'employee', 'freelancer')),
  commission_service DECIMAL(5,2) NOT NULL DEFAULT 50,
  commission_product DECIMAL(5,2) NOT NULL DEFAULT 10,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create table for services (persistent)
CREATE TABLE public.services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  category TEXT,
  duration_minutes INTEGER NOT NULL DEFAULT 30,
  default_price DECIMAL(10,2) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create table for clients (persistent)
CREATE TABLE public.clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  birth_date DATE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create table for appointments (persistent)
CREATE TABLE public.appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES public.clients(id),
  professional_id UUID REFERENCES public.professionals(id),
  service_id UUID REFERENCES public.services(id),
  start_time TIMESTAMP WITH TIME ZONE NOT NULL,
  end_time TIMESTAMP WITH TIME ZONE NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'confirmed', 'in_progress', 'completed', 'cancelled')),
  notes TEXT,
  total_value DECIMAL(10,2),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create table for commissions
CREATE TABLE public.commissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id UUID REFERENCES public.professionals(id) NOT NULL,
  appointment_id UUID REFERENCES public.appointments(id),
  transaction_id UUID REFERENCES public.transactions(id),
  type TEXT NOT NULL CHECK (type IN ('service', 'product')),
  base_value DECIMAL(10,2) NOT NULL,
  commission_rate DECIMAL(5,2) NOT NULL,
  commission_value DECIMAL(10,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid')),
  paid_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.cash_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.professionals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commissions ENABLE ROW LEVEL SECURITY;

-- RLS Policies - Allow authenticated users to manage data
CREATE POLICY "Authenticated users can view cash sessions"
ON public.cash_sessions FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert cash sessions"
ON public.cash_sessions FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update cash sessions"
ON public.cash_sessions FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Authenticated users can view transactions"
ON public.transactions FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert transactions"
ON public.transactions FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update transactions"
ON public.transactions FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Authenticated users can view professionals"
ON public.professionals FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can manage professionals"
ON public.professionals FOR ALL TO authenticated USING (true);

CREATE POLICY "Authenticated users can view services"
ON public.services FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can manage services"
ON public.services FOR ALL TO authenticated USING (true);

CREATE POLICY "Authenticated users can view clients"
ON public.clients FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can manage clients"
ON public.clients FOR ALL TO authenticated USING (true);

CREATE POLICY "Authenticated users can view appointments"
ON public.appointments FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can manage appointments"
ON public.appointments FOR ALL TO authenticated USING (true);

CREATE POLICY "Authenticated users can view commissions"
ON public.commissions FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can manage commissions"
ON public.commissions FOR ALL TO authenticated USING (true);

-- Trigger for updating timestamps
CREATE TRIGGER update_professionals_updated_at
  BEFORE UPDATE ON public.professionals
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_clients_updated_at
  BEFORE UPDATE ON public.clients
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();