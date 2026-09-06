PRAGMA foreign_keys = ON;

-- Build idempotency: the same PublishSnapshotCommand idempotency key must
-- return the same snapshot instead of minting a second version. Rows are
-- write-once; there is intentionally no status column to flip.
CREATE TABLE publication_builds (
  idempotency_key TEXT PRIMARY KEY,
  snapshot_id TEXT NOT NULL REFERENCES publication_snapshots(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
