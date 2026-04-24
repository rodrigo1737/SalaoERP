-- Add photo_url column to clients table
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS photo_url text;

-- Create storage bucket for client photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('client-photos', 'client-photos', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for client photos
CREATE POLICY "Anyone can view client photos"
ON storage.objects FOR SELECT
USING (bucket_id = 'client-photos');

CREATE POLICY "Authenticated users can upload client photos"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'client-photos' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update client photos"
ON storage.objects FOR UPDATE
USING (bucket_id = 'client-photos' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete client photos"
ON storage.objects FOR DELETE
USING (bucket_id = 'client-photos' AND auth.role() = 'authenticated');