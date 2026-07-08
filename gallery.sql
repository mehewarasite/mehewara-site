-- SQL script to create the gallery table
-- Run this in the Supabase SQL Editor

CREATE TABLE IF NOT EXISTS public.gallery (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL DEFAULT '',
  description text DEFAULT '',
  image_hex text NOT NULL,        -- Image stored as hex-encoded bytes (e.g. "ffd8ff...")
  mime_type text NOT NULL DEFAULT 'image/jpeg',
  sort_order integer NOT NULL DEFAULT 0,
  pinned boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable Row Level Security
ALTER TABLE public.gallery ENABLE ROW LEVEL SECURITY;

-- Allow public read access (gallery is visible to all users)
DROP POLICY IF EXISTS "Allow public read on gallery" ON public.gallery;
CREATE POLICY "Allow public read on gallery"
  ON public.gallery FOR SELECT USING (true);

-- Allow all operations (admin operations are done through anon key with full access)
DROP POLICY IF EXISTS "Allow all operations on gallery" ON public.gallery;
CREATE POLICY "Allow all operations on gallery"
  ON public.gallery FOR ALL USING (true) WITH CHECK (true);

-- Index for sort ordering
CREATE INDEX IF NOT EXISTS gallery_sort_order_idx ON public.gallery (sort_order ASC, created_at ASC);

-- Reload schema cache
NOTIFY pgrst, 'reload schema';
