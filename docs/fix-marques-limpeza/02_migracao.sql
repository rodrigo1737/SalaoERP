-- Migração dos 3 agendamentos órfãos: appointments → cleaning_appointments
-- Tenant: Marques Limpeza (a1fcebcb-fae5-4794-9414-2f012fe10aa5)
--
-- IMPORTANTE:
--   1) Rode o 01_diagnostico.sql ANTES e confirme que validacao = 'OK para migrar' nas 3 linhas.
--   2) Execute esta migração dentro de uma TRANSACTION. Se algo der errado, ROLLBACK.
--   3) Os agendamentos originais em public.appointments são SOFT-DELETADOS (deleted_at = now()),
--      não removidos fisicamente — fica histórico/rollback fácil.

BEGIN;

-- 1) Insere em cleaning_appointments com snapshots derivados dos JOINs
WITH origem AS (
  SELECT
    a.id           AS old_id,
    a.tenant_id,
    a.client_id,
    a.professional_id,
    a.start_time,
    a.end_time,
    a.status,
    a.total_value,
    a.notes,
    a.created_at,
    -- clients não possui coluna address — usa placeholder; o admin pode editar
    -- depois na tela de Agenda Limpeza > Detalhe do agendamento.
    '(endereço não informado — preencher na agenda)' AS address,
    COALESCE(c.name, 'Cliente')                      AS client_name_snapshot,
    COALESCE(s.name, 'Serviço de limpeza')           AS service_name_snapshot,
    p.nickname                                       AS assignee_name_snapshot
  FROM public.appointments a
  LEFT JOIN public.clients       c ON c.id = a.client_id
  LEFT JOIN public.services      s ON s.id = a.service_id
  LEFT JOIN public.professionals p ON p.id = a.professional_id
  WHERE a.tenant_id  = 'a1fcebcb-fae5-4794-9414-2f012fe10aa5'
    AND a.deleted_at IS NULL
    AND a.client_id        IS NOT NULL  -- safety: cleaning_appointments exige NOT NULL
    AND a.professional_id  IS NOT NULL  -- safety: CHECK (professional_id OR team_id)
)
INSERT INTO public.cleaning_appointments (
  tenant_id,
  client_id,
  professional_id,
  start_time,
  end_time,
  status,
  financial_status,
  recurrence_type,
  address,
  service_name_snapshot,
  client_name_snapshot,
  assignee_name_snapshot,
  quoted_amount,
  commission_amount,
  uses_product_control,
  requires_checklist,
  requires_photos,
  internal_notes,
  created_at
)
SELECT
  tenant_id,
  client_id,
  professional_id,
  start_time,
  end_time,
  -- Mapeia status. Os enums são compatíveis (scheduled, confirmed, in_progress, completed, cancelled, no_show)
  CASE
    WHEN status IN ('scheduled', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show')
      THEN status
    ELSE 'scheduled'
  END                                AS status,
  'pending'                           AS financial_status,
  'none'                              AS recurrence_type,
  address,
  service_name_snapshot,
  client_name_snapshot,
  assignee_name_snapshot,
  COALESCE(total_value, 0)            AS quoted_amount,
  0                                   AS commission_amount,
  false                               AS uses_product_control,
  false                               AS requires_checklist,
  false                               AS requires_photos,
  notes                               AS internal_notes,
  created_at
FROM origem
RETURNING id, start_time, client_name_snapshot;

-- 2) Soft-delete dos agendamentos originais que foram migrados
--    (mantém os registros no banco para rollback, mas não aparecem mais para a UI)
UPDATE public.appointments
SET deleted_at = now(),
    notes = COALESCE(notes, '') || ' [migrado para cleaning_appointments em ' || now()::text || ']'
WHERE tenant_id  = 'a1fcebcb-fae5-4794-9414-2f012fe10aa5'
  AND deleted_at IS NULL
  AND client_id        IS NOT NULL
  AND professional_id  IS NOT NULL;

-- 3) Confere resultado antes de commitar
SELECT
  'appointments (salão) ativos'        AS tabela,
  COUNT(*)                              AS total
FROM public.appointments
WHERE tenant_id = 'a1fcebcb-fae5-4794-9414-2f012fe10aa5'
  AND deleted_at IS NULL

UNION ALL

SELECT
  'cleaning_appointments ativos'        AS tabela,
  COUNT(*)                              AS total
FROM public.cleaning_appointments
WHERE tenant_id = 'a1fcebcb-fae5-4794-9414-2f012fe10aa5'
  AND deleted_at IS NULL;

-- 4) Se o SELECT acima mostrar:
--      appointments (salão) ativos       0
--      cleaning_appointments ativos      3
--    → execute COMMIT;
-- Caso contrário, execute ROLLBACK;

-- COMMIT;
-- ROLLBACK;
