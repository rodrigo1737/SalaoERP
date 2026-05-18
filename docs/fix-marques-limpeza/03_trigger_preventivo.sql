-- Trigger preventivo — defesa contra recidiva
-- Bloqueia INSERT/UPDATE em public.appointments quando o tenant é cleaning_control.
-- Roda em qualquer caminho (UI, API, edge function, seed) — defesa em camada de banco.
--
-- Se no futuro o roadmap permitir tenants híbridos (cleaning_control + salon ao mesmo tempo),
-- basta ajustar a condição para checar tenant_segments em vez de tenants.package_type.

CREATE OR REPLACE FUNCTION public.prevent_salon_appointments_for_cleaning_tenants()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.tenant_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM public.tenants
      WHERE id = NEW.tenant_id
        AND package_type = 'cleaning_control'
    ) THEN
      RAISE EXCEPTION
        'Tenant % é cleaning_control. Agendamentos devem ser gravados em cleaning_appointments, não em appointments.',
        NEW.tenant_id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS appointments_block_cleaning_tenant ON public.appointments;

CREATE TRIGGER appointments_block_cleaning_tenant
BEFORE INSERT OR UPDATE OF tenant_id ON public.appointments
FOR EACH ROW
EXECUTE FUNCTION public.prevent_salon_appointments_for_cleaning_tenants();

-- Teste rápido (deve falhar com a mensagem do trigger):
-- INSERT INTO public.appointments (tenant_id, start_time, end_time, status)
-- VALUES ('a1fcebcb-fae5-4794-9414-2f012fe10aa5', now(), now() + interval '1 hour', 'scheduled');
