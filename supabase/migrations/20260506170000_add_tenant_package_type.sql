-- Adds a commercial package selector for each B2B client.
-- The default preserves the current salon/barbershop behavior.

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS package_type text NOT NULL DEFAULT 'salon';

ALTER TABLE public.tenants
  DROP CONSTRAINT IF EXISTS tenants_package_type_check;

ALTER TABLE public.tenants
  ADD CONSTRAINT tenants_package_type_check
  CHECK (package_type IN ('salon', 'aesthetic_clinic'));

COMMENT ON COLUMN public.tenants.package_type IS
  'Commercial package used to enable product modules. salon = current package; aesthetic_clinic = clinical/aesthetic module package.';
