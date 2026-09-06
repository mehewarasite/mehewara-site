PRAGMA foreign_keys = ON;

-- Rollback idempotency: the same RollbackSnapshotCommand idempotency key
-- must replay the recorded outcome instead of appending duplicate history.
-- Rows are write-once; replay reads the stored snapshot id and answers from
-- persisted state.
CREATE TABLE publication_rollback_intents (
  idempotency_key TEXT PRIMARY KEY,
  snapshot_id TEXT NOT NULL REFERENCES publication_snapshots(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
