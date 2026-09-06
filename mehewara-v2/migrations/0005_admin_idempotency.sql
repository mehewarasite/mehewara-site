-- Admin mutation idempotency. Every applied mutation records its
-- Idempotency-Key outcome here: a retried request with the same key replays
-- without re-applying the mutation or appending duplicate audit rows. Keys
-- are scoped per operation and entity (e.g.
-- "admin:subjects:create:<uuid>:<key>") so a key can never replay across
-- different operations or entities.
--
-- The record is a small DESCRIPTOR, not the response body: replay re-reads
-- the entity through the same mappers as GET. Full bodies are unbounded
-- (a question with five 500KB options exceeds 3MB) and would overflow any
-- sane row limit after the write already applied. Descriptors stay under
-- 2KB for every entity kind. (Greenfield file: amended pre-deploy; no D1
-- database has ever been provisioned from these migrations.)
CREATE TABLE admin_idempotency_keys (
  idempotency_key TEXT PRIMARY KEY CHECK (length(idempotency_key) BETWEEN 8 AND 200),
  status INTEGER NOT NULL CHECK (status BETWEEN 200 AND 299),
  replay_json TEXT NOT NULL CHECK (length(replay_json) BETWEEN 2 AND 2000),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK (json_valid(replay_json))
);
