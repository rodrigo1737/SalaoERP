-- Keep the appointment contract aligned with the schedule UI.
-- A fit-in can overlap an existing appointment only after an explicit
-- confirmation in the app. Professional hours and explicit unavailability
-- blocks remain mandatory for every appointment.

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

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS is_fit_in boolean NOT NULL DEFAULT false;

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
    OR public.has_permission(auth.uid(), 'manage_all_schedule_blocks', tenant_id)
    OR (
      public.has_permission(auth.uid(), 'manage_schedule_blocks', tenant_id)
      AND professional_id IN (
        SELECT p.id
        FROM public.professionals p
        WHERE p.user_id = auth.uid()
          AND p.tenant_id = professional_schedule_blocks.tenant_id
          AND p.deleted_at IS NULL
      )
    )
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
    OR public.has_permission(auth.uid(), 'manage_all_schedule_blocks', tenant_id)
    OR (
      public.has_permission(auth.uid(), 'manage_schedule_blocks', tenant_id)
      AND professional_id IN (
        SELECT p.id
        FROM public.professionals p
        WHERE p.user_id = auth.uid()
          AND p.tenant_id = professional_schedule_blocks.tenant_id
          AND p.deleted_at IS NULL
      )
    )
  )
)
WITH CHECK (
  tenant_id = public.get_user_tenant_id(auth.uid())
  AND (
    public.has_role(auth.uid(), 'admin', tenant_id)
    OR public.has_permission(auth.uid(), 'edit_schedule', tenant_id)
    OR public.has_permission(auth.uid(), 'manage_all_schedule_blocks', tenant_id)
    OR (
      public.has_permission(auth.uid(), 'manage_schedule_blocks', tenant_id)
      AND professional_id IN (
        SELECT p.id
        FROM public.professionals p
        WHERE p.user_id = auth.uid()
          AND p.tenant_id = professional_schedule_blocks.tenant_id
          AND p.deleted_at IS NULL
      )
    )
  )
);

-- Replace the public function because the schedule window contract includes
-- the professional's configured start/end time.
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

DROP FUNCTION IF EXISTS public.get_public_booking_professional_blocks(text, timestamptz, timestamptz);
CREATE FUNCTION public.get_public_booking_professional_blocks(
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

  IF NEW.is_fit_in AND NOT (
    public.has_role(auth.uid(), 'admin', NEW.tenant_id)
    OR public.has_permission(auth.uid(), 'edit_schedule', NEW.tenant_id)
  ) THEN
    RAISE EXCEPTION 'Sem permissão para realizar encaixe.' USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.professional_id IS NOT DISTINCT FROM OLD.professional_id
     AND NEW.start_time IS NOT DISTINCT FROM OLD.start_time
     AND NEW.end_time IS NOT DISTINCT FROM OLD.end_time
     AND NEW.is_fit_in IS NOT DISTINCT FROM OLD.is_fit_in THEN
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

  -- A blocked interval is never bypassed by an encaixe.
  IF EXISTS (
    SELECT 1 FROM public.professional_schedule_blocks b
    WHERE b.tenant_id = NEW.tenant_id
      AND b.professional_id = NEW.professional_id
      AND b.status = 'active'
      AND tstzrange(b.starts_at, b.ends_at, '[)') && tstzrange(NEW.start_time, NEW.end_time, '[)')
  ) THEN
    RAISE EXCEPTION 'O profissional está indisponível neste horário.' USING ERRCODE = '23P01';
  END IF;

  -- A confirmed fit-in is the only supported exception to an appointment
  -- overlap. Normal appointments remain protected against double booking.
  IF NOT NEW.is_fit_in AND EXISTS (
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
  BEFORE INSERT OR UPDATE OF tenant_id, professional_id, start_time, end_time, status, deleted_at, is_fit_in
  ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.validate_appointment_professional_availability();
