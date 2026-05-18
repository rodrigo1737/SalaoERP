-- Diagnóstico antes da migração — Marques Limpeza
-- Roda no SQL Editor do Supabase e me manda o resultado.
-- Vai mostrar exatamente o estado dos 3 agendamentos órfãos.

WITH tenant AS (
  SELECT id FROM public.tenants WHERE id = 'a1fcebcb-fae5-4794-9414-2f012fe10aa5'
)
SELECT
  a.id                                 AS appointment_id,
  a.client_id,
  c.name                               AS client_name,
  c.phone                              AS client_phone,
  a.service_id,
  s.name                               AS service_name,
  a.professional_id,
  p.nickname                           AS professional_nickname,
  a.start_time,
  a.end_time,
  a.status,
  a.total_value,
  a.notes,
  a.deleted_at,
  CASE
    WHEN a.client_id IS NULL        THEN 'BLOQUEIO: client_id NULL — NOT NULL em cleaning_appointments'
    WHEN a.professional_id IS NULL  THEN 'BLOQUEIO: professional_id NULL — CHECK exige professional_id OR team_id'
    WHEN s.name IS NULL             THEN 'AVISO: service sem nome — vai gravar como "Serviço de limpeza"'
    ELSE 'OK para migrar (endereço será preenchido com placeholder)'
  END AS validacao
FROM public.appointments a
LEFT JOIN public.clients       c ON c.id = a.client_id
LEFT JOIN public.services      s ON s.id = a.service_id
LEFT JOIN public.professionals p ON p.id = a.professional_id
WHERE a.tenant_id = (SELECT id FROM tenant)
  AND a.deleted_at IS NULL
ORDER BY a.start_time;
