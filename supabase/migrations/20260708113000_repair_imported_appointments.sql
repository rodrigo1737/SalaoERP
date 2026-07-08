-- Normaliza agendamentos antigos/importados com duração inválida ou sem valor.
WITH repaired AS (
  SELECT
    a.id,
    CASE
      WHEN a.end_time IS NULL OR a.end_time <= a.start_time THEN
        a.start_time + make_interval(mins => GREATEST(COALESCE(s.duration_minutes, 60), 1))
      ELSE a.end_time
    END AS normalized_end_time,
    COALESCE(a.total_value, s.default_price, 0) AS normalized_total_value
  FROM public.appointments a
  LEFT JOIN public.services s
    ON s.id = a.service_id
  WHERE a.deleted_at IS NULL
    AND (
      a.end_time IS NULL
      OR a.end_time <= a.start_time
      OR a.total_value IS NULL
    )
)
UPDATE public.appointments a
SET
  end_time = repaired.normalized_end_time,
  total_value = repaired.normalized_total_value
FROM repaired
WHERE repaired.id = a.id;
