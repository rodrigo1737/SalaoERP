-- Forma de acerto do profissional:
--   'commission' (padrão) — o salão recebe do cliente e paga a comissão ao profissional;
--   'transfer' (repasse) — o profissional recebe na própria maquininha e repassa
--   a porcentagem ao salão. O cálculo é o mesmo; inverte-se a direção do acerto.
ALTER TABLE public.professionals
  ADD COLUMN IF NOT EXISTS settlement_type text NOT NULL DEFAULT 'commission';

ALTER TABLE public.professionals
  DROP CONSTRAINT IF EXISTS professionals_settlement_type_check;

ALTER TABLE public.professionals
  ADD CONSTRAINT professionals_settlement_type_check
  CHECK (settlement_type IN ('commission', 'transfer'));
