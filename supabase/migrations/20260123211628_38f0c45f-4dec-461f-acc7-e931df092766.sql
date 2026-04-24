-- Add photo_url column to professionals table
ALTER TABLE public.professionals 
ADD COLUMN IF NOT EXISTS photo_url TEXT;

-- Create storage bucket for professional photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('professional-photos', 'professional-photos', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload their own photos
CREATE POLICY "Authenticated users can upload professional photos"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'professional-photos' 
  AND auth.role() = 'authenticated'
);

-- Allow public read access to professional photos
CREATE POLICY "Public read access to professional photos"
ON storage.objects FOR SELECT
USING (bucket_id = 'professional-photos');

-- Allow authenticated users to update/delete their photos
CREATE POLICY "Authenticated users can update professional photos"
ON storage.objects FOR UPDATE
USING (bucket_id = 'professional-photos' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete professional photos"
ON storage.objects FOR DELETE
USING (bucket_id = 'professional-photos' AND auth.role() = 'authenticated');