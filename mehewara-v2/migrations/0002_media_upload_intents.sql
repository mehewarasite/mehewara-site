PRAGMA foreign_keys = ON;

-- Browser upload intents for direct-to-B2 signed PUTs. The ticket endpoint
-- records the declared size + sha256 up front (charging the declared bytes
-- pessimistically); POST /api/v1/media/upload-confirm verifies the actual
-- object (HEAD size, streamed sha256) and flips the intent terminal.
-- Terminal states (confirmed/failed) are idempotent: re-confirm returns the
-- stored result without touching B2 or the budget again.
CREATE TABLE media_upload_intents (
  id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  object_key TEXT NOT NULL UNIQUE,
  content_type TEXT NOT NULL,
  declared_byte_size INTEGER NOT NULL CHECK (declared_byte_size > 0 AND declared_byte_size <= 50000000),
  sha256 TEXT NOT NULL CHECK (length(sha256) = 64),
  status TEXT NOT NULL DEFAULT 'ticketed' CHECK (status IN ('ticketed','verifying','confirmed','failed')),
  -- 1 once the issuance budget permit has committed. A replayed ticket
  -- request for an intent with budget_committed = 0 charges the permit now
  -- instead of assuming the crashed first attempt paid.
  budget_committed INTEGER NOT NULL DEFAULT 0 CHECK (budget_committed IN (0,1)),
  actual_byte_size INTEGER CHECK (actual_byte_size IS NULL OR actual_byte_size >= 0),
  ticket_expires_at TEXT NOT NULL,
  -- Set when ticketed→verifying is claimed. A claim older than the route's
  -- verification lease (15 minutes) is treated as crashed and may be
  -- reclaimed; without this, a worker termination wedges the intent at 409.
  claimed_at TEXT,
  -- Opaque per-claim fencing token. Terminal transitions condition on it, so
  -- a superseded verifier can never flip the winner's row even if two claims
  -- land in the same millisecond (timestamps alone would collide).
  claim_token TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  confirmed_at TEXT
);
CREATE INDEX media_upload_intents_status_expiry_idx ON media_upload_intents(status, ticket_expires_at);
