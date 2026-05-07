-- Allows each professional to define the color used in schedule columns.

ALTER TABLE public.professionals
  ADD COLUMN IF NOT EXISTS schedule_color text NOT NULL DEFAULT '#EFF6FF';

UPDATE public.professionals
SET schedule_color = '#EFF6FF'
WHERE schedule_color IS NULL OR schedule_color = '';

ALTER TABLE public.professionals
  DROP CONSTRAINT IF EXISTS professionals_schedule_color_hex_check;

ALTER TABLE public.professionals
  ADD CONSTRAINT professionals_schedule_color_hex_check
  CHECK (schedule_color ~ '^#[0-9A-Fa-f]{6}$');
