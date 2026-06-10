-- SQL script to create the about_us table
-- Run this in the Supabase SQL Editor

CREATE TABLE IF NOT EXISTS public.about_us (
  id bigint PRIMARY KEY DEFAULT 1,
  description text,
  image_url text,
  facebook_link text,
  youtube_link text,
  linkedin_link text,
  full_privacy_policy_html text,
  privacy_policy_statement text,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Ensure there is a row to update
INSERT INTO public.about_us (id, description) VALUES (1, 'Welcome to Mehewara!') ON CONFLICT (id) DO NOTHING;

-- Add new columns if table already exists (from an older version)
ALTER TABLE public.about_us ADD COLUMN IF NOT EXISTS linkedin_link text;
ALTER TABLE public.about_us ADD COLUMN IF NOT EXISTS full_privacy_policy_html text;
ALTER TABLE public.about_us ADD COLUMN IF NOT EXISTS privacy_policy_statement text;

-- Allow public access for the about_us table
ALTER TABLE public.about_us ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable all operations for all users" ON public.about_us;
CREATE POLICY "Enable all operations for all users" 
ON public.about_us FOR ALL USING (true) WITH CHECK (true);

-- Reload schema cache so postgrest picks it up
NOTIFY pgrst, 'reload schema';
