-- Regras de negocio:
-- 1) commission_rate sempre representa o percentual do profissional.
-- 2) Em commission_payable, commission_value = parte do profissional.
-- 3) Em transfer_receivable, commission_value = parte do estabelecimento
--    (base - parte do profissional).
--
-- Para nao descasar historico financeiro ja liquidado, este backfill corrige
-- somente lancamentos pendentes sem baixa parcial.

update public.commissions
set commission_value = round((base_value - ((base_value * commission_rate) / 100.0))::numeric, 2)
where settlement_kind = 'transfer_receivable'
  and type = 'service'
  and status = 'pending'
  and coalesce(settled_amount, 0) = 0;
