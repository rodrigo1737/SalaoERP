-- Allows salons to keep professionals registered without showing them in the schedule.

ALTER TABLE public.professionals
  ADD COLUMN IF NOT EXISTS has_schedule boolean NOT NULL DEFAULT true;

UPDATE public.professionals
SET has_schedule = true
WHERE has_schedule IS NULL;

CREATE OR REPLACE FUNCTION public.can_client_create_online_appointment(
  _tenant_id uuid,
  _client_id uuid,
  _professional_id uuid,
  _service_id uuid,
  _client_user_id uuid,
  _start_time timestamp with time zone,
  _end_time timestamp with time zone
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _client_user_id = auth.uid()
    AND _start_time < _end_time
    AND public.is_tenant_booking_active(_tenant_id)
    AND EXISTS (
      SELECT 1
      FROM public.client_accounts ca
      JOIN public.clients c ON c.id = ca.client_id
      WHERE ca.user_id = auth.uid()
        AND ca.tenant_id = _tenant_id
        AND ca.client_id = _client_id
        AND c.tenant_id = _tenant_id
        AND c.deleted_at IS NULL
    )
    AND EXISTS (
      SELECT 1
      FROM public.services s
      WHERE s.id = _service_id
        AND s.tenant_id = _tenant_id
        AND s.is_active = true
        AND s.allow_online_booking = true
        AND s.deleted_at IS NULL
    )
    AND EXISTS (
      SELECT 1
      FROM public.professionals p
      WHERE p.id = _professional_id
        AND p.tenant_id = _tenant_id
        AND p.is_active = true
        AND p.has_schedule = true
        AND p.deleted_at IS NULL
    )
    AND EXISTS (
      SELECT 1
      FROM public.service_professionals sp
      WHERE sp.tenant_id = _tenant_id
        AND sp.service_id = _service_id
        AND sp.professional_id = _professional_id
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.appointments a
      WHERE a.tenant_id = _tenant_id
        AND a.professional_id = _professional_id
        AND a.deleted_at IS NULL
        AND a.status IN ('pre_scheduled', 'scheduled', 'confirmed', 'in_progress')
        AND tstzrange(a.start_time, a.end_time, '[)') && tstzrange(_start_time, _end_time, '[)')
    )
$$;
