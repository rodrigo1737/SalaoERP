ALTER TABLE public.cleaning_staff_visibility
ADD COLUMN IF NOT EXISTS can_reopen_completed_appointment boolean NOT NULL DEFAULT false;
