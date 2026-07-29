-- Professionals with edit_schedule may only change appointments that include
-- their own professional record. Internal staff without a linked professional
-- keep tenant-wide schedule operation.

CREATE OR REPLACE FUNCTION public.guard_professional_appointment_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  linked_professional_id uuid;
BEGIN
  IF auth.uid() IS NULL
     OR public.has_role(auth.uid(), 'admin', OLD.tenant_id)
     OR NOT public.has_permission(auth.uid(), 'edit_schedule', OLD.tenant_id) THEN
    RETURN NEW;
  END IF;

  SELECT p.id
    INTO linked_professional_id
  FROM public.professionals p
  WHERE p.user_id = auth.uid()
    AND p.tenant_id = OLD.tenant_id
    AND p.is_active = true
    AND p.deleted_at IS NULL
  ORDER BY p.created_at
  LIMIT 1;

  IF linked_professional_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF OLD.professional_id = linked_professional_id
     OR EXISTS (
       SELECT 1
       FROM public.appointment_services aps
       WHERE aps.appointment_id = OLD.id
         AND aps.tenant_id = OLD.tenant_id
         AND aps.professional_id = linked_professional_id
     ) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Você só pode alterar ou excluir agendamentos da sua própria agenda.'
    USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS guard_professional_appointment_scope ON public.appointments;
CREATE TRIGGER guard_professional_appointment_scope
  BEFORE UPDATE ON public.appointments
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_professional_appointment_scope();

CREATE OR REPLACE FUNCTION public.guard_professional_appointment_service_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_row public.appointment_services%ROWTYPE;
  parent_professional_id uuid;
  linked_professional_id uuid;
BEGIN
  target_row := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;

  IF auth.uid() IS NULL
     OR public.has_role(auth.uid(), 'admin', target_row.tenant_id)
     OR NOT public.has_permission(auth.uid(), 'edit_schedule', target_row.tenant_id) THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  SELECT p.id
    INTO linked_professional_id
  FROM public.professionals p
  WHERE p.user_id = auth.uid()
    AND p.tenant_id = target_row.tenant_id
    AND p.is_active = true
    AND p.deleted_at IS NULL
  ORDER BY p.created_at
  LIMIT 1;

  IF linked_professional_id IS NULL THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  SELECT a.professional_id
    INTO parent_professional_id
  FROM public.appointments a
  WHERE a.id = target_row.appointment_id
    AND a.tenant_id = target_row.tenant_id;

  IF parent_professional_id = linked_professional_id
     OR EXISTS (
       SELECT 1
       FROM public.appointment_services aps
       WHERE aps.appointment_id = target_row.appointment_id
         AND aps.tenant_id = target_row.tenant_id
         AND aps.professional_id = linked_professional_id
     ) THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  RAISE EXCEPTION 'Você só pode alterar serviços dos seus próprios agendamentos.'
    USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS guard_professional_appointment_service_scope ON public.appointment_services;
CREATE TRIGGER guard_professional_appointment_service_scope
  BEFORE INSERT OR UPDATE OR DELETE ON public.appointment_services
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_professional_appointment_service_scope();

REVOKE ALL ON FUNCTION public.guard_professional_appointment_scope() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_professional_appointment_service_scope() FROM PUBLIC;
