# Rollback runbook

Rollback is an operational decision, not an automatic migration reversal.
Keep the previous Pages static deployment, Worker version, and source system
available until `REPLACE_ROLLBACK_EXPIRY`.

## Trigger conditions

Start rollback for data corruption, unauthorized access/public B2 exposure,
auth failure, sustained elevated errors, quota/billing danger, or a broken
cutover invariant. Preserve logs and timestamps without recording secrets or
personal data unnecessarily.

## Steps

1. Page `REPLACE_INCIDENT_OWNER` and record incident ID, current versions, and
   last known good versions `REPLACE_GOOD_PAGES_DEPLOYMENT` and
   `REPLACE_GOOD_WORKER_VERSION`.
2. Enable static/read-only mode and pause mutations, uploads, exports, and
   email if integrity or cost is uncertain.
3. Repoint the Worker route to the last known good Worker version, or deploy
   the approved previous version. Verify bindings still point to the intended
   environment.
4. Promote the previous Cloudflare Pages static deployment or revert the
   frontend API origin to the last known good Worker. Pages rollback affects
   static assets only; it does not reverse D1/B2 data or Worker versions.
5. If migration-related, stop all copy jobs, preserve source and target
   snapshots, and do not delete either side. Re-enable source read-only access
   only through an approved operator.
6. Verify Access rejection cases, CORS, private B2, D1 reads, and a safe
   idempotent read-only request. Check provider usage and alerts.
7. Communicate status, preserve evidence, and open a follow-up before any
   forward fix or re-cutover.

## Data caution

Do not blindly reverse D1 or B2 writes: a destructive reverse migration can
erase valid post-cutover data. Use the recorded mapping and snapshots, reconcile
by stable IDs/checksums, and obtain data-owner approval. Rotate any credential
that may have been exposed and remove public bucket/debug bypasses immediately.
