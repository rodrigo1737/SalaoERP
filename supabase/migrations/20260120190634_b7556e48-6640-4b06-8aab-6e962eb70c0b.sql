-- Adicionar campo de comissão na tabela de serviços
ALTER TABLE public.services ADD COLUMN commission_rate numeric NOT NULL DEFAULT 50;

-- Comentário explicando o campo
COMMENT ON COLUMN public.services.commission_rate IS 'Taxa de comissão do profissional ao realizar este serviço (%)';
