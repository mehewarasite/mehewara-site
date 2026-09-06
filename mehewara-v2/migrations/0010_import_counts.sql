-- Import job result counts. import_jobs records lifecycle + checksum, but
-- the ImportExportResult contract also reports imported record counts, so
-- the count persists with the job for idempotent replay-by-reread.
ALTER TABLE import_jobs ADD COLUMN imported_records INTEGER NOT NULL DEFAULT 0 CHECK (imported_records >= 0);
