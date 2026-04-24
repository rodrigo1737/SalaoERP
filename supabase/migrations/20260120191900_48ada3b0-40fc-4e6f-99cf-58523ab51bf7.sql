-- Criar enum para tipo de valor do serviço
CREATE TYPE public.service_price_type AS ENUM ('fixed', 'variable', 'starting_at');

-- Adicionar novos campos na tabela services
ALTER TABLE public.services 
  ADD COLUMN break_time_minutes integer NOT NULL DEFAULT 0,
  ADD COLUMN allow_online_booking boolean NOT NULL DEFAULT false,
  ADD COLUMN price_type service_price_type NOT NULL DEFAULT 'fixed',
  ADD COLUMN cost_price numeric NOT NULL DEFAULT 0,
  ADD COLUMN suggested_return_days integer DEFAULT NULL;

-- Comentários explicativos
COMMENT ON COLUMN public.services.break_time_minutes IS 'Folga necessária entre agendamentos deste serviço (minutos)';
COMMENT ON COLUMN public.services.allow_online_booking IS 'Permitir agendamento online pelo cliente';
COMMENT ON COLUMN public.services.price_type IS 'Tipo de valor: fixo, variável ou a partir de';
COMMENT ON COLUMN public.services.cost_price IS 'Custo interno do serviço';
COMMENT ON COLUMN public.services.suggested_return_days IS 'Sugestão de retorno em dias';

-- Criar tabela de vínculo profissional-serviço
CREATE TABLE public.service_professionals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id uuid NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  commission_rate numeric NOT NULL DEFAULT 50,
  assistant_commission_rate numeric NOT NULL DEFAULT 0,
  duration_minutes integer DEFAULT NULL,
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(service_id, professional_id)
);

-- Comentários explicativos
COMMENT ON TABLE public.service_professionals IS 'Vínculo entre profissionais e serviços com comissão e tempo individualizados';
COMMENT ON COLUMN public.service_professionals.commission_rate IS 'Taxa de comissão do profissional para este serviço (%)';
COMMENT ON COLUMN public.service_professionals.assistant_commission_rate IS 'Taxa de comissão quando atua como assistente (%)';
COMMENT ON COLUMN public.service_professionals.duration_minutes IS 'Tempo de execução específico deste profissional (null = usar padrão do serviço)';

-- Habilitar RLS
ALTER TABLE public.service_professionals ENABLE ROW LEVEL SECURITY;

-- Política de visualização
CREATE POLICY "Users can view service_professionals in their tenant"
ON public.service_professionals
FOR SELECT
USING (
  (tenant_id = get_user_tenant_id(auth.uid()))
  OR is_super_admin((auth.jwt() ->> 'email'::text))
);

-- Política de gerenciamento
CREATE POLICY "Users can manage service_professionals in their tenant"
ON public.service_professionals
FOR ALL
USING (
  ((tenant_id = get_user_tenant_id(auth.uid())) AND can_tenant_modify(tenant_id))
  OR is_super_admin((auth.jwt() ->> 'email'::text))
);

-- Trigger para atualizar updated_at
CREATE TRIGGER update_service_professionals_updated_at
  BEFORE UPDATE ON public.service_professionals
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Remover a coluna commission_rate da tabela services (agora é por profissional)
ALTER TABLE public.services DROP COLUMN IF EXISTS commission_rate;