-- Create the site_visits table
CREATE TABLE site_visits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    visited_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    path TEXT
);

-- Allow anyone to insert a visit (anonymous tracking)
ALTER TABLE site_visits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anonymous inserts to site_visits" ON site_visits
    FOR INSERT
    WITH CHECK (true);

-- Allow anyone to read site_visits (required for the GitHub Action to count visits using the anon key)
DROP POLICY IF EXISTS "Allow authenticated users to read site_visits" ON site_visits;
DROP POLICY IF EXISTS "Allow public read of site_visits" ON site_visits;

CREATE POLICY "Allow public read of site_visits" ON site_visits
    FOR SELECT
    USING (true);
