# Deployment and environment runbook

## Before a release

1. Confirm the change is in the intended environment and that the resource
   ledger points to `REPLACE_ENV` resources.
2. Run `npm run check`, `npm run lint`, `npm test`, `npm run test:migration`,
   and `npm run build` from `mehewara-v2`. Review the generated static output.
3. Confirm CI installed through `npm ci` against the committed root lockfile.
4. Verify no `.env` file, service key, Access token, database export, or B2
   object has been staged. Run `npm run check:secrets`.
5. For Worker changes, inspect bindings and vars with the target environment
   selected. Never use production credentials in a preview shell.
6. For schema changes, follow the migration runbook first; deployment and
   migration are separate approvals.

## Cloudflare Pages frontend release

Cloudflare Pages builds/publishes only the static web workspace to
`apps/web/dist`. Configure the Pages project root as `mehewara-v2`, the build
command as `npm run build`, and the output directory as `apps/web/dist`. The
checked-in `apps/web/public/_headers` supplies security/cache headers and
`_redirects` supplies `/* /index.html 200` for SPA deep links. Confirm the
build-time `VITE_API_BASE_URL` is the matching Worker origin. Check `/`, a
deep-linked route, static asset cache behavior, and headers after deployment.
Pages Functions are not enabled or used.

Pages creates branch previews for non-production branches. Treat the preview
branch as staging: use a preview Worker/API host and preview CORS origin, never
production D1/B2 bindings. Attach the production custom domain only to the
production Pages project/branch and record `REPLACE_PAGES_DOMAIN`.

## Worker release

Deploy the Worker through the approved Cloudflare account and environment
(`REPLACE_WORKER_NAME`). Record the resulting version ID and deployment time.
Run smoke checks for: public health behavior, protected JWT acceptance/rejection,
CORS allow/deny, D1 read/write authorization, private B2 denial, signed upload
ticket issuance, media stream through the edge cache (fetch a confirmed
object twice and confirm the second serve involved no Worker B2 call via
the `cf-cache-status: HIT` response header), publication build → current
read → rollback on preview data, validation, rate
limiting, and idempotent retry. Stop and roll back if any protected route
fails closed incorrectly or an object is publicly readable.

The deploy workflow is `v2-deploy-cloudflare.yml` and lives at the parent
repository's `.github/workflows/` directory (not inside `mehewara-v2/`) so
GitHub discovers it. The Worker step maps the Pages `preview` choice to
the Wrangler `staging` environment, refuses to deploy while
`apps/api/wrangler.toml` still contains placeholder bindings, and passes
`--env` to `wrangler deploy` so the default development bindings are
never used.

## Environment variables

Local values belong in ignored `.env`/Wrangler local secrets. Preview and
production values belong in their respective Pages project environment and
Cloudflare Worker environment stores. The only public browser variable is
`VITE_API_BASE_URL`; all credentials are Worker-only secrets and there are no
secrets in Pages. Configures the CORS allow-list on the Worker. The browser also needs CORS
configured on the Backblaze B2 bucket itself, because direct browser PUTs
through signed tickets are browser-origin requests. Per environment, set the
B2 bucket's CORS rules to allow:

  - Origins: the exact Pages production and preview origins (no `*`).
  - Methods: `PUT` (and `GET`/`HEAD` if the browser ever falls back to a
    direct read; reads are normally served by the Worker through the edge
    cache, so `GET`/`HEAD` are not required).
  - ExposeHeaders: `ETag`.
  - AllowedHeaders: `Content-Type`, `Content-Length`, `x-amz-*`.
  - MaxAgeSeconds: 300.

Smoke-test the CORS configuration by issuing a `PUT` from the Pages origin
with a signed ticket and verifying the preflight and the upload both
succeed before promoting the bucket to production. B2 endpoint, region,
and bucket are non-secret Worker vars (committed to `wrangler.toml` with
`REPLACE_WITH_*_ENV_B2_*` placeholders). The application key ID and
application key are Worker secrets set with `wrangler secret put` per
environment and are never committed.

## Browser upload lifecycle (ticket → confirm)

`POST /api/v1/media/upload-ticket` (admin, idempotency key required)
returns `202` with a flat `{ intentId, url, objectKey, headers, expiresAt,
maxByteSize }` body. Routing runs inside a cheap `mediaIntentLookup` permit
(D1 reads, one conditional write, one Class-A expiry cleanup); only live
issuance opens the full `b2Upload` permit (D1 writes, declared bytes,
browser Class-A PUT) — terminal replays commit only the lookup permit, and
paid replays are served inside it with no new charge. The paid flag flips
only after the `b2Upload` permit durably commits (`strictCommit` propagates
a commit failure instead of swallowing it), so a crash or failed commit in
between leaves the intent rechargeable rather than marked paid-but-unfunded. The
Worker charges the *browser-declared* bytes pessimistically at issuance
(`b2Upload` with `declaredBytes`) and records an intent row in D1
(`media_upload_intents`, `migrations/0002_media_upload_intents.sql`). The
ticket authorizes a PUT to a `staging/<intentId>` key only, with the exact
byte count signed into the URL so B2 rejects any other size provider-side.

`POST /api/v1/media/upload-confirm` with `{ intentId }` first resolves the
intent under a `mediaIntentLookup` permit, then runs verification under its
own `mediaUploadConfirm` permit (worst-case HEAD staging + HEAD final + GET
final + COPY + DELETE plus intent D1 reads/writes, 300s TTL). The permit is
marked before the first D1 touch, so even the claim UPDATE is committed —
contention paths (claim loss) still commit the permit, a conservative
overcharge on a rare admin-only race, documented here rather than hidden.
One absolute 240s deadline signal covers the whole B2 sequence (shorter
than both the 300s permit TTL and the 15-minute claim lease), combined with
60s per-call timeouts on metadata calls and 240s on streams, so a hung
provider call fails fast into a budgeted error path instead of outliving
its permit. The permit is reserved *before* the atomic claim (ticketed→verifying via
conditional UPDATE…RETURNING, so reservation failure can never wedge an
intent), and each claim mints an opaque fencing token — terminal
transitions and pre-mutation ownership checks condition on it, so a
superseded verifier can neither flip the row nor touch the winner's bytes.
A claim older than 15 minutes is reclaimable; otherwise losers read terminal
state. HEADs staging (404 → resume from the final key when it carries
exactly the declared bytes, else fail the intent), rejects size mismatches
(`422`), server-side copies staging→final, then streams
the *final* object through incremental SHA-256 (mismatch → `422` — hashing
the copy output closes the race where a replayed PUT swaps staging between
verification and promotion). Failure cleanup flips the intent terminal
FIRST (token-conditional) and deletes objects only after winning that flip,
so a superseded verifier's cleanup is skipped and the winner's persisted
state is reported instead. Terminal states are idempotent,
and every response reflects the persisted row, never an assumed state. The
final key is never a ticket target, so a replayed presigned URL cannot
overwrite a confirmed object; staging keys are outside the public read
namespace, so unconfirmed uploads are unreachable through the Worker, and
dynamic-namespace reads additionally require a confirmed intent (one D1
read; the permit is marked before the lookup, so rejections commit rather
than releasing — over-accounting rejected probes is the safe direction, and
it prices key enumeration; edge-cached for a year otherwise). Only
confirmed objects may be referenced by publishable content
(`requireConfirmedObjectKey` is the guard the Phase-2 publication build
must call). Presigned PUTs sign the exact declared `Content-Length`, so B2
rejects over- or under-size uploads provider-side; checksums stay
server-verified at confirm because presigned URLs cannot bind them.

Staging hygiene is two-layered: expiry and failure paths delete the staging
object best-effort, and the bucket carries a lifecycle rule on the
`staging/` prefix (hide 1 day after upload, delete hidden copies 1 day
later) so crashed uploads cannot accumulate storage. Apply the same rule per
environment when provisioning the bucket.
Rotate a credential after accidental exposure, even if a commit was later
deleted.

## Publication build and rollback

`POST /api/v1/admin/publications/build` (body `idempotencyKey`) validates
readiness, assembles the manifest, stores the artifact, and publishes — with
snapshot row, build record, current pointer, and published history committing
as one D1 batch, so a crash can never leave a moved pointer without history.
Replaying an idempotency key returns the recorded snapshot without
rebuilding; a version race deletes its orphan artifact and answers retry.
`POST /api/v1/admin/publications/rollback` moves the pointer to a previous
published snapshot with an audit reason; its own idempotency keys replay
without duplicating history. `GET /api/v1/publication/current` serves the
manifest edge-cached (60s alias TTL, conditional 304s). Build and rollback
evict the cached alias on every successful pointer move, so reads never
serve a superseded snapshot past the in-flight request; purge failures are
best-effort and bounded by the 60s TTL.

## Admin content management

Content lives in D1 as drafts and reaches the public only through a
publication build, which assembles the current manifest from `published`
rows. Admin endpoints under `/api/v1/admin/<resource>[/<id>[/state]]`
(subjects, papers, questions, study-materials, gallery-items, content-pages,
plus the `about`/`privacy` singletons and read-only `stats`) authenticate
once in the router (unknown resources 404 before auth) and are
budget-permitted (`adminContentRead` for lists/gets, 2 statements with
bulk-fetched relations in one permit; `adminContentWrite` worst-case 7
reads / 10 writes counted in D1 statements — a same-key create-race
recovery on a study ending in descriptor replay (steady-state worst case
is 6: a published study update changing linkage and object key), including
the `updated_at` trigger writes. Simpler entities use fewer; reservation
is worst-case by design).

Every mutation requires an `Idempotency-Key` header: generate a fresh
random key per request and never reuse one concurrently. Serial retries
replay by re-reading the recorded descriptor (entity type + id) through
the GET mappers — stored bodies would be unbounded (a 5-option question
can exceed 3MB), so descriptors stay under 2KB
(`migrations/0005_admin_idempotency.sql`; scopes are namespaced per
operation AND entity id, and a duplicate record maps onto the winner's
replay). A concurrent same-key race converges on one row (UNIQUE) with
audits distinguishable by request id, but only serial reuse is
exactly-once; a lease/claim scheme was deliberately rejected because a
crashed holder would poison the key. Only 2xx outcomes are recorded —
missing targets throw 404 before any audit or record. Ordering inside the
permit is mutation → audit → record, so the common client-timeout retry is
covered; creates additionally heal the crash window by re-reading on UNIQUE
(an unrecorded apply converges to 200 with completed sidecars). Update
retries after a crash safely 409 on the spent token (refetch, new key,
re-apply converges). Every applied mutation appends an `admin_audit_log`
row in the `AuditRecord` entry-array shape (singletons record a null
entity id plus a singleton marker).

Rules the routes enforce, pre-apply (a rejected edit changes nothing):
creates start in `draft` (questions cannot be born published — option rows
do not exist at parent INSERT time, per the D1 trigger); updates carry a
required `expectedUpdatedAt` guard (409 on concurrent modification; the
response token is always re-read fresh because `UPDATE...RETURNING`
predates the `updated_at` trigger write, and all stamps are strictly
monotonic per row (`migrations/0008` bumps past same-millisecond
collisions) so a spent token can never win twice — including the
triggerless about/privacy singletons, whose guarded upserts stamp
monotonically in-statement); publishing requires sanitized
content with a sanitizer version, consistent answer triples, and published
parents (D1 triggers cover papers/questions plus study relations via
`migrations/0006_study_guards.sql`, and `migrations/0007` blocks moving a
paper with linked studies to another subject; the route checks study
parents for clear messages, and published-row content edits re-validate
readiness pre-apply on the merged row so a rejected edit changes nothing);
state transitions require `expectedUpdatedAt`, closing the guard-to-write
race (any interleaving edit spends the token; triggers backstop the rest);
published rows cannot be deleted (archive first); published questions
accept option content edits with identical ids in place (the shape trigger
aborts delete+insert intermediates — restructuring requires archive); study/gallery/about
object keys must resolve through the media inventory (confirmed uploads or
migrated objects — size, type, and checksums are inventory-authoritative,
and gallery updates always re-derive them from the effective keys);
question HTML is a single legacy-compatible blob stored identically in
`_en`/`_si`; the answer triple derives from option flags and partial answer
edits without the full options array are rejected; studies must belong to
their paper's subject (multiple studies per paper stay allowed — the build
resolves first-wins deterministically, matching the collection-shaped
contract). Bulk question import is out of scope here — it arrives with
import-export. The old `/api/v1/admin/content` placeholder is gone (410).
## Public SPA

`apps/web` builds a zero-dependency vanilla-ESM SPA into `dist/`
(`src/*.js` ships verbatim to `dist/assets/`, plus `styles.css`). At boot
the app reads the `api-base-url` meta tag (baked from `VITE_API_BASE_URL`)
and GETs `/api/v1/publication/current`; hash routes (`#/subject/:id`,
`#/paper/:id`, `#/study/:id`, `#/gallery`, `#/page/:slug`, `#/about`,
`#/privacy`, `#/attempts`) render from the cached manifest with no further
API traffic. Practice is self-assessment by design: the public manifest
carries no answers, so the SPA records selections and explanations-read
locally (LocalAttempt shape, last 100 kept) and never scores. Only
server-sanitized `*Html`/`html` manifest fields render as HTML; every
other string is escaped at interpolation time (see `src/lib.js`).

## Pages rollback

Use the Pages deployment history to identify the last known-good deployment
`REPLACE_PAGES_DEPLOYMENT_ID`, then roll back/promote it through the Pages
dashboard or approved API procedure. Record the active deployment and custom
domain mapping before changing it. Pages rollback changes static assets only;
it does not roll back the Worker, D1 schema, or B2 objects. Coordinate a
separate Worker version rollback using [rollback-runbook.md](rollback-runbook.md)
when the API contract is incompatible.
