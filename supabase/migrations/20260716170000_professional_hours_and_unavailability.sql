-- Per-professional working windows and one-off schedule blocks.
-- Empty professional hours inherit the tenant's configured working hours in the UI.

ALTER TABLE public.professionals
  ADD COLUMN IF NOT EXISTS schedule_start_time time without time zone,
  ADD COLUMN IF NOT EXISTS schedule_end_time time without time zone;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'professionals_schedule_hours_check'
      AND conrelid = 'public.professionals'::regclass
  ) THEN
    ALTER TABLE public.professionals
      ADD CONSTRAINT professionals_schedule_hours_check
      CHECK (
        (schedule_start_time IS NULL AND schedule_end_time IS NULL)
        OR (
          schedule_start_time IS NOT NULL
          AND schedule_end_time IS NOT NULL
          AND schedule_start_time < schedule_end_time
        )
      );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.professional_schedule_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 2 AND 300),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled')),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT professional_schedule_blocks_period_check CHECK (starts_at < ends_at)
);

CREATE INDEX IF NOT EXISTS idx_professional_schedule_blocks_period
  ON public.professional_schedule_blocks (tenant_id, professional_id, starts_at, ends_at)
  WHERE status = 'active';

CREATE OR REPLACE FUNCTION public.validate_professional_schedule_block_tenant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.professionals p
    WHERE p.id = NEW.professional_id
      AND p.tenant_id = NEW.tenant_id
      AND p.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Profissional inválido para este cliente.' USING ERRCODE = '23514';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_professional_schedule_block_tenant ON public.professional_schedule_blocks;
CREATE TRIGGER validate_professional_schedule_block_tenant
  BEFORE INSERT OR UPDATE ON public.professional_schedule_blocks
  FOR EACH ROW EXECUTE FUNCTION public.validate_professional_schedule_block_tenant();

ALTER TABLE public.professional_schedule_blocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant schedule blocks are viewable by schedule staff" ON public.professional_schedule_blocks;
CREATE POLICY "Tenant schedule blocks are viewable by schedule staff"
ON public.professional_schedule_blocks
FOR SELECT TO authenticated
USING (
  tenant_id = public.get_user_tenant_id(auth.uid())
  AND (
    public.has_role(auth.uid(), 'admin', tenant_id)
    OR public.has_permission(auth.uid(), 'view_schedule', tenant_id)
    OR public.has_permission(auth.uid(), 'edit_schedule', tenant_id)
  )
);

DROP POLICY IF EXISTS "Tenant schedule blocks are manageable by schedule staff" ON public.professional_schedule_blocks;
CREATE POLICY "Tenant schedule blocks are manageable by schedule staff"
ON public.professional_schedule_blocks
FOR ALL TO authenticated
USING (
  tenant_id = public.get_user_tenant_id(auth.uid())
  AND (
    public.has_role(auth.uid(), 'admin', tenant_id)
    OR public.has_permission(auth.uid(), 'edit_schedule', tenant_id)
  )
)
WITH CHECK (
  tenant_id = public.get_user_tenant_id(auth.uid())
  AND (
    public.has_role(auth.uid(), 'admin', tenant_id)
    OR public.has_permission(auth.uid(), 'edit_schedule', tenant_id)
  )
);

-- The return contract gains two columns, so replace the old function explicitly.
DROP FUNCTION IF EXISTS public.get_public_booking_professionals(text);
CREATE FUNCTION public.get_public_booking_professionals(_slug text)
RETURNS TABLE (
  professional_id uuid,
  professional_name text,
  nickname text,
  photo_url text,
  schedule_start_time text,
  schedule_end_time text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id,
    p.name,
    p.nickname,
    p.photo_url,
    to_char(p.schedule_start_time, 'HH24:MI'),
    to_char(p.schedule_end_time, 'HH24:MI')
  FROM public.tenants t
  JOIN public.professionals p ON p.tenant_id = t.id
  WHERE t.booking_slug = _slug
    AND public.is_tenant_booking_active(t.id)
    AND p.is_active
    AND p.has_schedule
    AND p.deleted_at IS NULL
  ORDER BY p.name;
$$;

CREATE OR REPLACE FUNCTION public.get_public_booking_professional_blocks(
  _slug text,
  _start_date timestamptz,
  _end_date timestamptz
)
RETURNS TABLE (
  professional_id uuid,
  starts_at timestamptz,
  ends_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT b.professional_id, b.starts_at, b.ends_at
  FROM public.tenants t
  JOIN public.professional_schedule_blocks b ON b.tenant_id = t.id
  WHERE t.booking_slug = _slug
    AND public.is_tenant_booking_active(t.id)
    AND b.status = 'active'
    AND b.starts_at < _end_date
    AND b.ends_at > _start_date;
$$;

REVOKE ALL ON FUNCTION public.get_public_booking_professionals(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_public_booking_professional_blocks(text, timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_booking_professionals(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_booking_professional_blocks(text, timestamptz, timestamptz) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.validate_appointment_professional_availability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  professional_row public.professionals%ROWTYPE;
  local_start time;
  local_end time;
  tenant_start integer;
  tenant_end integer;
BEGIN
  IF NEW.deleted_at IS NOT NULL OR NEW.status = 'cancelled' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.professional_id IS NOT DISTINCT FROM OLD.professional_id
     AND NEW.start_time IS NOT DISTINCT FROM OLD.start_time
     AND NEW.end_time IS NOT DISTINCT FROM OLD.end_time THEN
    RETURN NEW;
  END IF;

  -- Appointments without a professional remain valid for reception/general use.
  IF NEW.professional_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT p.* INTO professional_row
  FROM public.professionals p
  WHERE p.id = NEW.professional_id
    AND p.tenant_id = NEW.tenant_id
    AND p.deleted_at IS NULL;

  IF NOT FOUND OR NOT professional_row.is_active OR NOT professional_row.has_schedule THEN
    RAISE EXCEPTION 'Profissional não está disponível para agendamento.' USING ERRCODE = '23514';
  END IF;

  IF NEW.start_time >= NEW.end_time THEN
    RAISE EXCEPTION 'O horário final deve ser maior que o inicial.' USING ERRCODE = '23514';
  END IF;

  local_start := (NEW.start_time AT TIME ZONE 'America/Sao_Paulo')::time;
  local_end := (NEW.end_time AT TIME ZONE 'America/Sao_Paulo')::time;

  IF (NEW.start_time AT TIME ZONE 'America/Sao_Paulo')::date
     <> ((NEW.end_time - interval '1 second') AT TIME ZONE 'America/Sao_Paulo')::date THEN
    RAISE EXCEPTION 'O agendamento deve terminar no mesmo dia.' USING ERRCODE = '23514';
  END IF;

  IF professional_row.schedule_start_time IS NOT NULL THEN
    IF local_start < professional_row.schedule_start_time
       OR local_end > professional_row.schedule_end_time THEN
      RAISE EXCEPTION 'O horário está fora do expediente do profissional.' USING ERRCODE = '23514';
    END IF;
  ELSE
    SELECT ts.working_hours_start, ts.working_hours_end
    INTO tenant_start, tenant_end
    FROM public.tenant_settings ts
    WHERE ts.tenant_id = NEW.tenant_id;
    tenant_start := COALESCE(tenant_start, 8);
    tenant_end := COALESCE(tenant_end, 20);
    IF local_start < make_time(tenant_start, 0, 0)
       OR local_end > make_time(tenant_end, 0, 0) THEN
      RAISE EXCEPTION 'O horário está fora do expediente do estabelecimento.' USING ERRCODE = '23514';
    END IF;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.tenant_id::text || ':' || NEW.professional_id::text, 0));

  IF EXISTS (
    SELECT 1 FROM public.professional_schedule_blocks b
    WHERE b.tenant_id = NEW.tenant_id
      AND b.professional_id = NEW.professional_id
      AND b.status = 'active'
      AND tstzrange(b.starts_at, b.ends_at, '[)') && tstzrange(NEW.start_time, NEW.end_time, '[)')
  ) THEN
    RAISE EXCEPTION 'O profissional está indisponível neste horário.' USING ERRCODE = '23P01';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.appointments a
    WHERE a.tenant_id = NEW.tenant_id
      AND a.professional_id = NEW.professional_id
      AND a.id IS DISTINCT FROM NEW.id
      AND a.deleted_at IS NULL
      AND a.status IN ('pre_scheduled', 'scheduled', 'confirmed', 'in_progress')
      AND tstzrange(a.start_time, a.end_time, '[)') && tstzrange(NEW.start_time, NEW.end_time, '[)')
  ) THEN
    RAISE EXCEPTION 'Já existe um agendamento neste horário para o profissional.' USING ERRCODE = '23P01';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_appointment_professional_availability ON public.appointments;
CREATE TRIGGER validate_appointment_professional_availability
  BEFORE INSERT OR UPDATE OF tenant_id, professional_id, start_time, end_time, status, deleted_at
  ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.validate_appointment_professional_availability();

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
    AND (
      SELECT COUNT(*) FROM public.appointments a
      WHERE a.tenant_id = _tenant_id AND a.client_user_id = _client_user_id
        AND a.deleted_at IS NULL
        AND a.status IN ('pre_scheduled', 'scheduled', 'confirmed', 'in_progress')
        AND a.start_time >= now()
    ) < 5
    AND EXISTS (
      SELECT 1 FROM public.client_accounts ca
      JOIN public.clients c ON c.id = ca.client_id
      WHERE ca.user_id = auth.uid() AND ca.tenant_id = _tenant_id
        AND ca.client_id = _client_id AND c.tenant_id = _tenant_id AND c.deleted_at IS NULL
    )
    AND EXISTS (
      SELECT 1 FROM public.services s
      WHERE s.id = _service_id AND s.tenant_id = _tenant_id
        AND s.is_active AND s.allow_online_booking AND s.deleted_at IS NULL
    )
    AND EXISTS (
      SELECT 1 FROM public.professionals p
      WHERE p.id = _professional_id AND p.tenant_id = _tenant_id
        AND p.is_active AND p.has_schedule AND p.deleted_at IS NULL
        AND (
          p.schedule_start_time IS NULL
          OR (
            (_start_time AT TIME ZONE 'America/Sao_Paulo')::time >= p.schedule_start_time
            AND (_end_time AT TIME ZONE 'America/Sao_Paulo')::time <= p.schedule_end_time
          )
        )
    )
    AND EXISTS (
      SELECT 1 FROM public.service_professionals sp
      WHERE sp.tenant_id = _tenant_id AND sp.service_id = _service_id AND sp.professional_id = _professional_id
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.professional_schedule_blocks b
      WHERE b.tenant_id = _tenant_id AND b.professional_id = _professional_id AND b.status = 'active'
        AND tstzrange(b.starts_at, b.ends_at, '[)') && tstzrange(_start_time, _end_time, '[)')
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.appointments a
      WHERE a.tenant_id = _tenant_id AND a.professional_id = _professional_id
        AND a.deleted_at IS NULL AND a.status IN ('pre_scheduled', 'scheduled', 'confirmed', 'in_progress')
        AND tstzrange(a.start_time, a.end_time, '[)') && tstzrange(_start_time, _end_time, '[)')
    );
$$;
