import { HttpError } from "../../shared/errors";

export type UploadIntentStatus = "ticketed" | "verifying" | "confirmed" | "failed";

export interface UploadIntent {
  readonly id: string;
  readonly idempotencyKey: string;
  readonly objectKey: string;
  readonly contentType: string;
  readonly declaredByteSize: number;
  readonly sha256: string;
  readonly status: UploadIntentStatus;
  readonly budgetCommitted: boolean;
  readonly actualByteSize: number | null;
  readonly ticketExpiresAt: string;
  readonly claimedAt: string | null;
  readonly claimToken: string | null;
  readonly createdAt: string;
  readonly confirmedAt: string | null;
}

export interface NewUploadIntent {
  readonly id: string;
  readonly idempotencyKey: string;
  readonly objectKey: string;
  readonly contentType: string;
  readonly declaredByteSize: number;
  readonly sha256: string;
  readonly ticketExpiresAt: string;
}

/**
 * Narrow persistence capability for browser upload intents. Feature modules
 * receive this store — never the raw D1 binding. The entrypoint is the only
 * place that constructs it from `env.D1`.
 *
 * Concurrency contract: verification must be claimed before any B2 call.
 * `claimForVerification` flips ticketed→verifying in a single conditional
 * UPDATE and returns the row only when this caller won the race (`UPDATE …
 * RETURNING`). Every terminal transition then re-checks the persisted row,
 * so a response is never built from an assumed state. `markConfirmed` and
 * `markFailed` accept rows in ticketed (legacy direct path) or verifying
 * (claimed path) state.
 */
export interface UploadIntentStore {
  create(intent: NewUploadIntent): Promise<UploadIntent>;
  getById(id: string): Promise<UploadIntent | null>;
  getByIdempotencyKey(key: string): Promise<UploadIntent | null>;
  /** Returns only confirmed intents. Phase-2 publication build must resolve
   *  every media reference through this guard so ticketed/failed uploads can
   *  never enter a publishable manifest. */
  getConfirmedByObjectKey(objectKey: string): Promise<UploadIntent | null>;
  /**
   * Bulk confirmed-intent lookup for publication assembly: one bounded query
   * per 100-key chunk instead of one D1 read per media reference. Returns
   * only confirmed intents, keyed by object key.
   */
  getConfirmedByObjectKeys(objectKeys: string[]): Promise<Map<string, UploadIntent>>;
  setBudgetCommitted(id: string): Promise<UploadIntent>;
  /**
   * Atomically claim an intent for verification (ticketed→verifying), or
   * reclaim a stale claim whose `claimedAt` predates `staleCutoffIso`.
   * Returns the claimed row only to the race winner, `null` otherwise.
   * Stale claims (worker died mid-verification) become reclaimable instead
   * of wedging the intent at 409 forever.
   */
  claimForVerification(id: string, staleCutoffIso: string): Promise<UploadIntent | null>;
  /**
   * Terminal transitions accept the *claimed snapshot*, not just the id,
   * and condition on `status='verifying' AND claim_token=?`. A verifier that
   * lost a lease race therefore cannot flip the winner's row: the update
   * hits zero rows and the caller reports persisted state. Both report
   * whether THIS caller won (`transitioned`) with the current row, so no
   * follow-up read is ever needed to answer.
   */
  markConfirmed(claimed: Pick<UploadIntent, "id" | "claimToken">, actualByteSize: number): Promise<{ transitioned: boolean; row: UploadIntent }>;
  /**
   * Reports whether THIS caller won the transition: `{ transitioned: true }`
   * with the failed row, or `{ transitioned: false }` with the current row
   * (owned by someone else) so the caller reports persisted state and —
   * critically — skips destructive cleanup it no longer owns.
   */
  markFailed(claimed: Pick<UploadIntent, "id" | "claimToken">): Promise<{ transitioned: boolean; row: UploadIntent }>;
  /** Fail an intent only while it is still ticketed. Expiry paths must use
   *  this — never the unconditional markFailed — so a stale expiry check
   *  cannot kill an active (verifying) confirmation. Returns the row only
   *  when this caller won the transition; `null` means someone else moved
   *  it first, in which case the caller must re-read and report persisted
   *  state instead of acting destructively (e.g. deleting staging). */
  failIfTicketed(id: string): Promise<UploadIntent | null>;
}

interface IntentRow {
  id: string; idempotency_key: string; object_key: string; content_type: string;
  declared_byte_size: number; sha256: string; status: string; budget_committed: number;
  actual_byte_size: number | null; ticket_expires_at: string; claimed_at: string | null;
  claim_token: string | null; created_at: string; confirmed_at: string | null;
}

function toIntent(row: IntentRow): UploadIntent {
  if (row.status !== "ticketed" && row.status !== "verifying" && row.status !== "confirmed" && row.status !== "failed") {
    throw new HttpError("INTERNAL_ERROR", 500, "Stored upload intent has an unknown status");
  }
  return {
    id: row.id, idempotencyKey: row.idempotency_key, objectKey: row.object_key,
    contentType: row.content_type, declaredByteSize: row.declared_byte_size, sha256: row.sha256,
    status: row.status, budgetCommitted: row.budget_committed === 1,
    actualByteSize: row.actual_byte_size,
    ticketExpiresAt: row.ticket_expires_at, claimedAt: row.claimed_at, claimToken: row.claim_token,
    createdAt: row.created_at, confirmedAt: row.confirmed_at,
  };
}

/** Phase-2 seam: resolve a media reference only when its upload confirmed. */
export async function requireConfirmedObjectKey(store: UploadIntentStore, objectKey: string): Promise<UploadIntent> {
  const intent = await store.getConfirmedByObjectKey(objectKey);
  if (!intent) throw new HttpError("CONFLICT", 409, "Media object is not from a confirmed upload");
  return intent;
}

export function d1UploadIntentStore(db: D1Database): UploadIntentStore {
  return {
    async create(intent) {
      // RETURNING returns the stored row in the same statement: no
      // read-after-write, so creation costs exactly one D1 write. Only a
      // uniqueness violation maps to 409; anything else is a real failure.
      let row: IntentRow | null;
      try {
        row = await db.prepare(
          "INSERT INTO media_upload_intents (id, idempotency_key, object_key, content_type, declared_byte_size, sha256, status, ticket_expires_at) VALUES (?, ?, ?, ?, ?, ?, 'ticketed', ?) RETURNING *"
        ).bind(intent.id, intent.idempotencyKey, intent.objectKey, intent.contentType, intent.declaredByteSize, intent.sha256, intent.ticketExpiresAt).first<IntentRow>();
      } catch (error) {
        if (error instanceof Error && /UNIQUE constraint failed/i.test(error.message)) {
          throw new HttpError("CONFLICT", 409, "An upload intent already exists for this idempotency key or object key");
        }
        throw error;
      }
      if (!row) throw new HttpError("INTERNAL_ERROR", 500, "Upload intent was not stored");
      return toIntent(row);
    },
    async getById(id) {
      const row = await db.prepare("SELECT * FROM media_upload_intents WHERE id = ?").bind(id).first<IntentRow>();
      return row ? toIntent(row) : null;
    },
    async getByIdempotencyKey(key) {
      const row = await db.prepare("SELECT * FROM media_upload_intents WHERE idempotency_key = ?").bind(key).first<IntentRow>();
      return row ? toIntent(row) : null;
    },
    async getConfirmedByObjectKey(objectKey) {
      const row = await db.prepare("SELECT * FROM media_upload_intents WHERE object_key = ? AND status = 'confirmed'").bind(objectKey).first<IntentRow>();
      return row ? toIntent(row) : null;
    },
    async getConfirmedByObjectKeys(objectKeys) {
      const found = new Map<string, UploadIntent>();
      for (let offset = 0; offset < objectKeys.length; offset += 100) {
        const chunk = objectKeys.slice(offset, offset + 100);
        const placeholders = chunk.map(() => "?").join(",");
        const result = await db.prepare(`SELECT * FROM media_upload_intents WHERE object_key IN (${placeholders}) AND status = 'confirmed'`).bind(...chunk).all<IntentRow>();
        for (const row of result.results ?? []) found.set(row.object_key, toIntent(row));
      }
      return found;
    },
    async setBudgetCommitted(id) {
      const row = await db.prepare("UPDATE media_upload_intents SET budget_committed = 1 WHERE id = ? RETURNING *").bind(id).first<IntentRow>();
      if (!row) throw new HttpError("INTERNAL_ERROR", 500, "Upload intent was not stored");
      return toIntent(row);
    },
    async claimForVerification(id, staleCutoffIso) {
      // Each claim mints a fresh opaque fencing token. Terminal transitions
      // and pre-mutation ownership checks compare tokens, so two claims in
      // the same millisecond still fence correctly (timestamps alone would
      // collide at ms precision).
      const token = crypto.randomUUID();
      const row = await db.prepare(
        "UPDATE media_upload_intents SET status = 'verifying', claimed_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'), claim_token = ? WHERE id = ? AND (status = 'ticketed' OR (status = 'verifying' AND claimed_at IS NOT NULL AND claimed_at < ?)) RETURNING *"
      ).bind(token, id, staleCutoffIso).first<IntentRow>();
      return row ? toIntent(row) : null;
    },
    async markConfirmed(claimed, actualByteSize) {
      const row = await db.prepare(
        "UPDATE media_upload_intents SET status = 'confirmed', actual_byte_size = ?, confirmed_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ? AND status = 'verifying' AND claim_token IS NOT NULL AND claim_token = ? RETURNING *"
      ).bind(actualByteSize, claimed.id, claimed.claimToken).first<IntentRow>();
      if (row) return { transitioned: true as const, row: toIntent(row) };
      const current = await this.getById(claimed.id);
      if (!current) throw new HttpError("INTERNAL_ERROR", 500, "Upload intent was not stored");
      return { transitioned: false as const, row: current };
    },
    async markFailed(claimed) {
      const row = await db.prepare("UPDATE media_upload_intents SET status = 'failed' WHERE id = ? AND status = 'verifying' AND claim_token IS NOT NULL AND claim_token = ? RETURNING *").bind(claimed.id, claimed.claimToken).first<IntentRow>();
      if (row) return { transitioned: true as const, row: toIntent(row) };
      const current = await this.getById(claimed.id);
      if (!current) throw new HttpError("INTERNAL_ERROR", 500, "Upload intent was not stored");
      return { transitioned: false as const, row: current };
    },
    async failIfTicketed(id) {
      const row = await db.prepare("UPDATE media_upload_intents SET status = 'failed' WHERE id = ? AND status = 'ticketed' RETURNING *").bind(id).first<IntentRow>();
      return row ? toIntent(row) : null;
    },
  };
}
