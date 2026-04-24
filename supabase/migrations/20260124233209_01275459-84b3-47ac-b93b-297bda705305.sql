-- Add pre_scheduled status to appointments for online bookings
-- Update the Schedule component to recognize this status

-- First, let's add realtime to appointments table for the online booking
ALTER PUBLICATION supabase_realtime ADD TABLE public.appointments;