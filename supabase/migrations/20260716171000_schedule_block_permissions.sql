-- Granular permissions for schedule unavailability blocks.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid = 'public.permission_type'::regtype AND enumlabel = 'manage_schedule_blocks') THEN
    ALTER TYPE public.permission_type ADD VALUE 'manage_schedule_blocks';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid = 'public.permission_type'::regtype AND enumlabel = 'manage_all_schedule_blocks') THEN
    ALTER TYPE public.permission_type ADD VALUE 'manage_all_schedule_blocks';
  END IF;
END $$;
