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

-- Only authenticated users (admins) can view the visits
CREATE POLICY "Allow authenticated users to read site_visits" ON site_visits
    FOR SELECT
    USING (auth.role() = 'authenticated');
