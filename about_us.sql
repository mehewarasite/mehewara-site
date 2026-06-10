-- SQL script to create the about_us table
-- Run this in the Supabase SQL Editor

CREATE TABLE IF NOT EXISTS public.about_us (
  id bigint PRIMARY KEY DEFAULT 1,
  description text,
  image_url text,
  facebook_link text,
  youtube_link text,
  telegram_link text,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Ensure there is a row to update
INSERT INTO public.about_us (id, description) VALUES (1, 'Welcome to Mehewara!') ON CONFLICT (id) DO NOTHING;

-- Reload schema cache so postgrest picks it up
NOTIFY pgrst, 'reload schema';
