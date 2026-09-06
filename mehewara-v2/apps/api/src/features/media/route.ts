import type { B2Client } from "../../storage/b2-client";
import { sha256StreamHex, type B2TicketShape } from "../../storage/b2-client";
import { HttpError, apiError } from "../../shared/errors";
import { MediaUploadTicketRequest, MediaUploadConfirmRequest } from "@mehewara-v2/contracts";
import { requireAdmin, type AccessVerifier } from "../../shared/auth";
import { requireIdempotencyKey } from "../../shared/idempotency";
import { parseBody } from "../../shared/validation";
import { parseJson } from "../../shared/validation";
import type { FeatureContext } from "../../env";
import { withBudget, LocalValidationError } from "../../middleware/budget-gate";
import type { UploadIntent, UploadIntentStore } from "./uploads";

/** Bounded body parsing that answers 400 responses (with the request id)
 *  instead of throwing, so routes stay in their Response-returning shape
 *  while still enforcing the 1 MiB streamed cap from shared/validation. */
export interface SignedUploadRequest {
  b2: B2Client;
  objectKey: string;
  contentType: string;
  maxByteSize: number;
  expiresInSeconds: number;
}

/**
 * Streams a private B2 object back to the browser. The Worker is the only
 * origin the browser sees; the B2 endpoint is never exposed. Long-lived
 * immutable cache headers are added so Cloudflare's edge serves the
 * response and B2 is touched only on cache miss.
 *
 * Charges one b2MediaRead operation per Worker-handled read (one Class-B
 * GET plus the confirmation D1 lookup below). Edge cache hits are served by
 * Cloudflare's CDN without touching the Worker. Uses a single conditional
 * GET against B2 (forwarding If-None-Match) so the Worker never does a
 * redundant HEAD+GET.
 */
/**
 * Restricts public media reads to keys the migration transformer or admin
 * upload flow actually produces. The Worker is the only trust boundary;
 * raw B2 access is never exposed to the browser, and arbitrary keys are
 * never accepted. Anything outside the published namespaces returns 404
 * without ever reaching B2.
 */
const PUBLIC_MEDIA_PREFIXES = [/^legacy\/gallery-hex\//, /^legacy\/gallery-thumb\//, /^legacy\/study-html\//, /^legacy\/inline-base64\//, /^legacy\/supabase-storage\//, /^gallery\//, /^study\//, /^about\//, /^publication\//];

function isPublicMediaKey(key: string): boolean {
  return PUBLIC_MEDIA_PREFIXES.some((re) => re.test(key));
}

/** Namespaces whose keys are minted by the upload flow (not the migration).
 *  These resolve only through confirmed intents; see below. */
const DYNAMIC_MEDIA_NAMESPACES = /^(gallery|study|about|publication)\//;

/**
 * Content types the browser may execute as active content when served
 * inline from the API origin. Served with a sandbox CSP (below) so even a
 * malicious upload cannot touch the origin; images and other inert types
 * need no sandboxing.
 */
const ACTIVE_CONTENT_TYPES = new Set([
  "text/html",
  "application/xhtml+xml",
  "image/svg+xml",
  "text/xml",
  "application/xml",
]);

/**
 * Per-namespace MIME allowlist, enforced at ticket issuance (before any
 * budget is spent) so an admin cannot mint an upload ticket for an
 * executable type in an image namespace. Study/publication namespaces may
 * carry documents (including HTML study material); gallery/about are
 * images only.
 */
function contentTypeAllowedForPrefix(prefix: string, contentType: string): boolean {
  const namespace = prefix.split("/")[0];
  if (namespace === "gallery" || namespace === "about") return contentType.startsWith("image/");
  return true;
}

/** Edge-cache surface used for confirmed media responses. Compatible with
 *  the Workers `caches.default` Cache API; injectable for tests. */
export interface MediaEdgeCache {
  match(request: Request): Promise<Response | undefined>;
  put(request: Request, response: Response): Promise<void>;
  /** Optional eviction (Cache API `delete`). Absence means overwrite-on-put. */
  delete?(request: Request): Promise<boolean>;
}

function defaultEdgeCache(): MediaEdgeCache | null {
  const caches = (globalThis as { caches?: { default?: MediaEdgeCache } }).caches;
  return caches?.default ?? null;
}

export async function mediaStreamRoute(request: Request, deps: { b2: B2Client; objectKey: string; context: FeatureContext; edgeCache?: MediaEdgeCache | null }): Promise<Response> {
  if (deps.objectKey.length === 0 || deps.objectKey.includes("..")) throw new HttpError("BAD_REQUEST", 400, "Invalid object key");
  if (!isPublicMediaKey(deps.objectKey)) throw new HttpError("NOT_FOUND", 404, "Media not found");
  // Edge cache first: a hit serves bytes with zero budget, zero D1, zero
  // B2. Entries are written only below, after confirmation-guard + B2
  // success, with immutable year-long Cache-Control — so a cached response
  // is always one the Worker already authorized. Conditional-request
  // variants may fragment entries; duplicates are harmless (same bytes).
  const edge = deps.edgeCache ?? defaultEdgeCache();
  if (edge) {
    const hit = await edge.match(request);
    if (hit) return hit;
  }
  const ifNoneMatch = request.headers.get("If-None-Match");
  return withBudget(deps.context.gate, "b2MediaRead", async (permit) => {
    // Mark before the confirmation lookup below: the D1 read is part of
    // this operation's budget (b2MediaRead includes d1Reads: 1), so a
    // rejection commits rather than releasing. Over-accounting a rejected
    // probe is the safe direction — and it prices key enumeration.
    permit.markProviderCallStarted();
    // Dynamically uploaded namespaces resolve only through confirmed
    // intents: a ticketed or failed upload must never be servable, even if
    // its bytes somehow exist under a final key.
    if (DYNAMIC_MEDIA_NAMESPACES.test(deps.objectKey)) {
      const confirmed = await deps.context.uploads.getConfirmedByObjectKey(deps.objectKey);
      if (!confirmed) throw new HttpError("NOT_FOUND", 404, "Media not found");
    } else {
      // Legacy migration keys predate intents: they resolve only through
      // the migrated media_inventory table, never by prefix alone. A
      // syntactically valid but never-migrated legacy key 404s here without
      // ever reaching B2. Confirmed reads are edge-cached for a year, so
      // either lookup happens only on cache miss.
      const inventoried = await deps.context.inventory.getByObjectKey(deps.objectKey);
      if (!inventoried) throw new HttpError("NOT_FOUND", 404, "Media not found");
    }
    const result = await deps.b2.getObjectWithMetadata(deps.objectKey, ifNoneMatch);
    if (!result) throw new HttpError("NOT_FOUND", 404, "Media not found");
    // The B2 client preserves the weak/strong distinction and emits a
    // properly-formatted ETag. Use it as-is for both 304 and 200.
    const etagHeader = result.etag;
    if (result.status === 304) {
      return new Response(null, { status: 304, headers: { ETag: etagHeader, "Cache-Control": "public, max-age=31536000, immutable" } });
    }
    const headers = new Headers();
    headers.set("Content-Type", result.contentType);
    headers.set("Content-Length", String(result.contentLength));
    headers.set("ETag", etagHeader);
    headers.set("Cache-Control", "public, max-age=31536000, immutable");
    headers.set("X-Content-Type-Options", "nosniff");
    // Active content (study HTML, SVG) renders but can never execute: the
    // sandbox strips script execution and same-origin access, so a malicious
    // upload served from the API origin cannot touch admin sessions or
    // exfiltrate. Inert types are unaffected.
    if (ACTIVE_CONTENT_TYPES.has(result.contentType.toLowerCase().split(";")[0]?.trim() ?? "")) {
      headers.set("Content-Security-Policy", "sandbox");
    }
    const response = new Response(result.body, { status: 200, headers });
    // Populate the edge on success only: 304s and errors are never cached.
    if (edge) await edge.put(request, response.clone());
    return response;
  });
}

export interface SignedUploadRequest {
  b2: B2Client;
  objectKey: string;
  contentType: string;
  maxByteSize: number;
  expiresInSeconds: number;
}

/**
 * Mints a short-lived signed PUT URL the browser can use to upload directly
 * to B2. The Worker is the only trust boundary. Caller-side concerns:
 *  - the final object key is server-controlled (prefix + intent id) so
 *    the client cannot overwrite or namespace-collide with another upload;
 *  - the URL is bound to the declared content type and the exact declared
 *    byte count (B2 rejects any other Content-Length provider-side);
 *  - the caller is an admin authenticated by Cloudflare Access;
 *  - a `b2Upload` permit is reserved and committed only on success.
 */
export async function signedUploadRoute(req: SignedUploadRequest): Promise<B2TicketShape> {
  return req.b2.signedUploadTicket(req.objectKey, req.contentType, req.maxByteSize, req.expiresInSeconds);
}

/** HTTP wrapper for the signed-upload route. Validates, namespaces, and budgets.
 *
 *  Accounting invariant: the routing decision runs inside a cheap
 *  `mediaIntentLookup` permit (D1 reads, one conditional write, one Class-A
 *  expiry cleanup), and only live issuance paths open the full `b2Upload`
 *  permit — terminal replays never consume B2 allowance. Error responses may
 *  over-account but never under-account; all callers are admins, so this is
 *  bounded and fail-safe.
 *
 *  The ticket is a *reservation*, not a confirmation:
 *  - 202 Accepted with `{ intentId, ticket }`. The budget permit commits
 *    pessimistically against the *declared* bytes at issuance, and the intent
 *    records `budgetCommitted`.
 *  - The browser PUTs to a `staging/<intentId>` key it can write. The final
 *    `<prefix>/<intentId>` key is never a ticket target: only the Worker can
 *    create it (via server-side copy at confirm), so a replayed presigned URL
 *    can never overwrite a confirmed object.
 *  - Re-issuing with the same Idempotency-Key returns the same intent with a
 *    freshly signed URL. An intent whose first attempt crashed before the
 *    budget commit (`budgetCommitted = false`) is charged now instead of
 *    assuming the crashed attempt paid. A verifying intent — fresh or stale —
 *    is never failed from here: only the confirm path owns live claims, so
 *    replay answers 409 and leaves verification alone.
 *  - The object becomes publishable only after POST /api/v1/media/upload-confirm
 *    verifies size + sha256 and promotes staging→final. The confirm step runs
 *    under its own `mediaUploadConfirm` permit.
 *  - `verifier` is an optional seam override so tests can inject a stub
 *    without touching the production Cloudflare Access verifier.
 */
export async function signedUploadHttpRoute(request: Request, deps: { b2: B2Client; context: FeatureContext; verifier?: AccessVerifier }): Promise<Response> {
  await requireAdmin(request, deps.context.access, deps.verifier);
  const idempotencyKey = requireIdempotencyKey(request);
  // Bounded parse (1 MiB streamed cap): an unbounded request.json() would
  // buffer up to the platform limit despite the documented body policy.
  const body = await parseBody(request, deps.context.requestId, () => parseJson(request, MediaUploadTicketRequest));
  if (!body.ok) return body.response;
  const parsed = body.value;
  // Namespace MIME allowlist first: an executable type in an image namespace
  // is rejected before any D1 read, budget permit, or ticket is minted.
  if (!contentTypeAllowedForPrefix(parsed.objectKeyPrefix, parsed.contentType)) {
    return apiError("BAD_REQUEST", `Content type ${parsed.contentType} is not allowed in the ${parsed.objectKeyPrefix.split("/")[0] ?? ""} namespace`, deps.context.requestId, 400);
  }
  type TicketRoute =
    | { readonly kind: "respond"; readonly response: Response }
    | { readonly kind: "issue"; readonly existing: UploadIntent | null };
  // Routing first: the lookup permit covers the decision reads, one
  // conditional write, and one Class-A expiry cleanup. Live paths open
  // their own b2Upload permit below.
  const route: TicketRoute = await withBudget(deps.context.gate, "mediaIntentLookup", async (permit) => {
    permit.markProviderCallStarted();
    const existing = await deps.context.uploads.getByIdempotencyKey(idempotencyKey);
    if (!existing) return { kind: "issue", existing: null } as const;
    if (existing.status === "confirmed") {
      return { kind: "respond", response: apiError("CONFLICT", "This upload is already confirmed", deps.context.requestId, 409) } as const;
    }
    if (existing.status === "failed") {
      return { kind: "respond", response: apiError("CONFLICT", "This upload intent failed; issue a new ticket with a new idempotency key", deps.context.requestId, 409) } as const;
    }
    if (existing.status === "verifying") {
      return { kind: "respond", response: apiError("CONFLICT", "This upload is being confirmed; retry the confirm", deps.context.requestId, 409) } as const;
    }
    // Expiry — full or near (under 30s, unusable for signing) — is handled
    // in one place so every ticketed replay takes the same won-transition-
    // or-persisted-state path. Handling it here keeps the live b2Upload
    // block expiry-free: every ticket it signs has ≥30s left.
    const expired = await failExpiredTicket(deps, existing);
    if (expired) return { kind: "respond", response: expired } as const;
    // Paid replay: the first attempt already committed its permit, so serve
    // a freshly signed URL inside this cheap lookup permit — no new charge.
    // Unpaid replays (crashed before commit) fall through to the b2Upload
    // block below, which is the charge.
    if (existing.budgetCommitted) {
      return { kind: "respond", response: await signLiveTicket(deps, existing.id, 200) } as const;
    }
    return { kind: "issue", existing } as const;
  }, { ttlSeconds: LOOKUP_PERMIT_TTL_SECONDS });
  if (route.kind === "respond") return route.response;
  // Live paths only (new issuance, or a replay whose first attempt crashed
  // before committing): one b2Upload permit covers the D1 writes, the
  // declared bytes, and the browser's Class-A PUT. The paid flag flips only
  // AFTER the permit durably commits — strictCommit propagates a commit
  // failure instead of swallowing it, so a crash or failed/expired commit
  // between commit and flag can never mark an unpaid intent paid; the next
  // replay safely recharges. Reserve failure rejects before any row exists,
  // so failed issuance leaves nothing behind.
  //
  // Mint server-controlled keys up front (pure computation, no I/O). The
  // client's prefix is used as a namespace for the final key so keys stay
  // grouped for observability, but the client cannot choose either key:
  // staging is `staging/<intentId>`, final is `<prefix>/<intentId>`.
  const liveId = route.existing?.id ?? crypto.randomUUID();
  const newKey = `${parsed.objectKeyPrefix}/${liveId}`;
  const newTicketExpiresAt = new Date(Date.now() + parsed.expiresInSeconds * 1000).toISOString();
  // Declared bytes for the permit: the existing declaration on replay, the
  // request declaration on new issuance. The enforced byte count always
  // comes from the persisted row below, never from this pre-commit value.
  const declaredBytes = route.existing?.declaredByteSize ?? parsed.byteSize;
  await withBudget(deps.context.gate, "b2Upload", async (permit) => {
    permit.markProviderCallStarted();
    if (!route.existing) {
      await deps.context.uploads.create({
        id: liveId, idempotencyKey, objectKey: newKey, contentType: parsed.contentType,
        declaredByteSize: parsed.byteSize, sha256: parsed.sha256, ticketExpiresAt: newTicketExpiresAt,
      });
    }
    // strictCommit: setBudgetCommitted below must observe commit success.
  }, { declaredBytes, strictCommit: true });
  await deps.context.uploads.setBudgetCommitted(liveId);
  // Sign from the persisted row via the single authority: it re-reads for
  // freshness, fails sub-30s tickets, and mints otherwise. No separate
  // pre-read here — that would spend a third D1 read for no new information.
  // (A concurrent expiry-fail between commit and signing surfaces inside the
  // helper as failed → 409, safe direction.)
  return signLiveTicket(deps, liveId, route.existing ? 200 : 202);
}

/**
 * The one and only place that mints a ticket URL. Derives the signing TTL
 * from a freshly re-read persisted row — never from a value computed
 * earlier in the request — and routes sub-30s tickets through
 * failExpiredTicket instead of signing.
 */
async function signLiveTicket(
  deps: { b2: B2Client; context: FeatureContext },
  intentId: string,
  httpStatus: 200 | 202,
): Promise<Response> {
  const live = await deps.context.uploads.getById(intentId);
  if (!live || live.status !== "ticketed") {
    const fallback = live ? terminalConfirmResponse(live) : null;
    if (fallback) return terminalResponse(fallback, deps.context.requestId);
    throw new HttpError("INTERNAL_ERROR", 500, "Upload intent disappeared before signing");
  }
  const remaining = Math.floor((Date.parse(live.ticketExpiresAt) - Date.now()) / 1000);
  if (remaining < 30) {
    const expired = await failExpiredTicket(deps, live);
    if (expired) return expired;
    // Unreachable in practice — failExpiredTicket always answers sub-30s
    // rows — but fail closed rather than signing below the floor: a URL
    // must never be minted from a stale TTL computation.
    return apiError("GONE", "This upload ticket expired; issue a new ticket with a new idempotency key", deps.context.requestId, 410);
  }
  const ticket = await signedUploadRoute({ b2: deps.b2, objectKey: stagingKey(live.id), contentType: live.contentType, maxByteSize: live.declaredByteSize, expiresInSeconds: Math.max(remaining, 1) });
  // The response deadline is the persisted ticket deadline, not the
  // signer's recomputation: a single authority for what the client may
  // rely on, even though the two differ only by milliseconds.
  return Response.json({ ...ticket, intentId: live.id, expiresAt: live.ticketExpiresAt }, { status: httpStatus });
}

/** Staging keys are browser-writable ticket targets. They are outside the
 *  public media namespace, so unconfirmed uploads are unreachable through
 *  the Worker's read path. */
export function stagingKey(intentId: string): string { return `staging/${intentId}`; }

/**
 * Expiry for ticketed intents — full or near (under 30s, unusable for
 * signing). May only fail a still-ticketed row: if a concurrent confirm
 * claimed it first, failIfTicketed reports null and we defer to the
 * persisted state instead of deleting a live verification's staging.
 * Staging cleanup happens only on a won transition. Returns a response when
 * the intent is expired, `null` when it is still live.
 */
async function failExpiredTicket(
  deps: { b2: B2Client; context: FeatureContext },
  existing: UploadIntent,
): Promise<Response | null> {
  if (Date.parse(existing.ticketExpiresAt) - Date.now() >= 30_000) return null;
  const transitioned = await deps.context.uploads.failIfTicketed(existing.id);
  if (!transitioned) {
    const current = await deps.context.uploads.getById(existing.id);
    const again = current ? terminalConfirmResponse(current) : null;
    if (again) return terminalResponse(again, deps.context.requestId);
    return apiError("CONFLICT", "This upload is being confirmed by another request", deps.context.requestId, 409);
  }
  await deps.b2.deleteObject(stagingKey(existing.id)).catch(() => undefined);
  return apiError("GONE", "This upload ticket expired; issue a new ticket with a new idempotency key", deps.context.requestId, 410);
}

/** How long a verification claim lives before a crashed worker's intent
 *  becomes reclaimable. Without a lease, a termination between claim and
 *  terminal transition would wedge the intent at 409 forever. */
export const VERIFY_LEASE_MS = 15 * 60 * 1000;

/** Upper bound for one confirm run: HEAD staging + HEAD final + GET final +
 *  COPY + DELETE against B2 plus streamed hashing of up to 50 MB. The permit
 *  TTL must cover it, otherwise the DO sweeps the permit mid-verification. */
export const CONFIRM_PERMIT_TTL_SECONDS = 300;

/** Absolute deadline for one confirm run's B2 calls. Shorter than both the
 *  permit TTL (300s) and the claim lease (15min): a hung provider call fails
 *  fast into a budgeted error path, and a live verifier can never go stale
 *  mid-run, so a superseding claim implies genuine death, not slowness. */
export const CONFIRM_DEADLINE_MS = 240_000;

/** Lookup permits only route D1 reads plus one conditional write/cleanup, so
 *  a short TTL suffices — but it must still cover the worst case (a 60s
 *  expiry staging delete), hence 120s rather than the 30s default. */
export const LOOKUP_PERMIT_TTL_SECONDS = 120;

function staleCutoffIso(nowMs: number): string { return new Date(nowMs - VERIFY_LEASE_MS).toISOString(); }

function isStaleClaim(intent: UploadIntent, nowMs: number): boolean {
  return intent.status === "verifying" && (intent.claimedAt === null || Date.parse(intent.claimedAt) <= nowMs - VERIFY_LEASE_MS);
}

/** Confirm a browser upload. Verifies the staging object, promotes it to the
 *  immutable final key, and flips the intent terminal.
 *
 *  Ordering is deliberate: the `mediaUploadConfirm` permit is reserved
 *  *before* the verification claim, so a reservation failure can never wedge
 *  an intent in `verifying`. The claim itself is atomic (conditional
 *  UPDATE…RETURNING); losers re-read and report terminal state. Claim loss
 *  inside the permit throws LocalValidationError, which releases the permit
 *  uncommitted — no B2 call has happened yet at that point.
 *
 *  Promotion is copy-then-verify-final: HEAD staging (404 → resume from the
 *  final key when it carries exactly the declared bytes, else fail the
 *  intent) → size check (mismatch → delete staging, fail intent, 422) →
 *  server-side copy staging→final, delete staging → stream the *final*
 *  object and verify sha256 incrementally (mismatch → delete final,
 *  fail, 422 — hashing the copy output closes the race where a replayed PUT
 *  swaps staging between verification and promotion) → mark confirmed, 200.
 *
 *  Mutations after the claim are fenced on claim ownership
 *  (`status='verifying' AND claimed_at=?`): a stale verifier that lost a
 *  lease race can neither overwrite nor delete the winner's final object —
 *  its terminal transitions hit zero rows and it reports persisted state.
 *  Responses always reflect the persisted row, never an assumed state.
 */
export async function confirmUploadHttpRoute(request: Request, deps: { b2: B2Client; context: FeatureContext; verifier?: AccessVerifier }): Promise<Response> {
  await requireAdmin(request, deps.context.access, deps.verifier);
  requireIdempotencyKey(request);
  const body = await parseBody(request, deps.context.requestId, () => parseJson(request, MediaUploadConfirmRequest));
  if (!body.ok) return body.response;
  const parsed = body.value;
  type ConfirmRoute =
    | { readonly kind: "respond"; readonly response: Response }
    | { readonly kind: "proceed" };
  const route: ConfirmRoute = await withBudget(deps.context.gate, "mediaIntentLookup", async (permit) => {
    permit.markProviderCallStarted();
    const intent = await deps.context.uploads.getById(parsed.intentId);
    if (!intent) {
      return { kind: "respond", response: apiError("NOT_FOUND", "Upload intent not found", deps.context.requestId, 404) } as const;
    }
    const terminal = terminalConfirmResponse(intent);
    // Non-verifying terminals are answered on the cheap lookup permit. A
    // fresh verifying claim belongs to a live verifier → 409. A stale one
    // falls through: the atomic claim below either reclaims it or reports
    // the new owner's state.
    if (terminal && (terminal.status !== "verifying" || !isStaleClaim(intent, Date.now()))) {
      return { kind: "respond", response: terminalResponse(terminal, deps.context.requestId) } as const;
    }
    return { kind: "proceed" } as const;
  }, { ttlSeconds: LOOKUP_PERMIT_TTL_SECONDS });
  if (route.kind === "respond") return route.response;
  // NOTE: no ticket-expiry 410 here. Expiry bounds the PUT URL, not
  // verification: staged bytes from a crashed-then-recovered upload remain
  // confirmable, and missing staging resolves to 404 via the normal path.
  return withBudget(deps.context.gate, "mediaUploadConfirm", async (permit) => {
    // Mark before the first D1 touch so the claim UPDATE below is committed,
    // never silently unaccounted. Contention paths (claim loss) still commit
    // this permit — conservative overcharge on a rare admin-only race,
    // documented here rather than hidden.
    permit.markProviderCallStarted();
    // One absolute deadline for the whole sequence, shorter than both the
    // permit TTL (300s) and the claim lease (15min). Combined with each
    // call's own timeout, a hung provider call fails fast into this
    // budgeted error path instead of outliving its permit.
    const deadline = AbortSignal.timeout(CONFIRM_DEADLINE_MS);
    const claimed = await deps.context.uploads.claimForVerification(parsed.intentId, staleCutoffIso(Date.now()));
    if (!claimed) {
      const current = await deps.context.uploads.getById(parsed.intentId);
      const again = current ? terminalConfirmResponse(current) : null;
      // Every persisted state gets its proper response here (confirmed→200,
      // failed/verifying→409); LocalValidationError only fires when the row
      // vanished, which cannot happen (intents are never deleted).
      if (again) return terminalResponse(again, deps.context.requestId);
      throw new LocalValidationError("Upload confirmation is already claimed");
    }
    const staging = stagingKey(claimed.id);
    const staged = await deps.b2.headObject(staging, { signal: deadline });
    if (!staged) {
      // Staging is gone: either nothing was uploaded, or a previous attempt
      // crashed after promoting. Resume from the final key when it carries
      // exactly the declared bytes; otherwise fail closed.
      return resumeFromFinal(deps, claimed, deadline);
    }
    if (staged.contentLength !== claimed.declaredByteSize) {
      return failClaimed(deps, claimed,
        { code: "UNPROCESSABLE", message: `Uploaded size ${staged.contentLength} does not match declared size ${claimed.declaredByteSize}`, status: 422 },
        async (b2) => { await b2.deleteObject(staging, { signal: deadline }).catch(() => undefined); });
    }
    // Fence the promotion: a verifier that lost a lease race while its HEAD
    // was in flight must not copy over the winner's final object. Losers
    // report persisted state instead of mutating.
    if (!(await stillOwnsClaim(deps.context.uploads, claimed))) {
      const current = await deps.context.uploads.getById(claimed.id);
      const fallback = current ? terminalConfirmResponse(current) : null;
      if (fallback) return terminalResponse(fallback, deps.context.requestId);
      throw new LocalValidationError("Upload confirmation lost its claim");
    }
    await deps.b2.copyObject(staging, claimed.objectKey, { signal: deadline });
    await deps.b2.deleteObject(staging, { signal: deadline }).catch(() => undefined);
    return verifyFinalAndConfirm(deps, claimed, deadline);
  }, { ttlSeconds: CONFIRM_PERMIT_TTL_SECONDS });
}

/** Resume a confirm whose worker crashed after promoting: if the final key
 *  carries exactly the declared bytes and its sha matches, confirm it;
 *  otherwise fail closed and clean up. */
async function resumeFromFinal(deps: { b2: B2Client; context: FeatureContext }, claimed: UploadIntent, deadline: AbortSignal): Promise<Response> {
  const final = await deps.b2.headObject(claimed.objectKey, { signal: deadline });
  if (!final || final.contentLength !== claimed.declaredByteSize) {
    return failClaimed(deps, claimed,
      { code: "NOT_FOUND", message: "No object was uploaded for this intent", status: 404 });
  }
  return verifyFinalAndConfirm(deps, claimed, deadline);
}

/**
 * Flip a live claim to failed and answer from the persisted row — never from
 * an assumed state. Ordering is load-bearing: the token-conditional flip
 * runs BEFORE any destructive cleanup, so cleanup below executes only when
 * this verifier actually won the transition (`transitioned: true`). A
 * superseded verifier gets the winner's row back and reports its persisted
 * state instead, touching nothing.
 */
async function failClaimed(
  deps: { b2: B2Client; context: FeatureContext },
  claimed: UploadIntent,
  specific: { code: "NOT_FOUND" | "UNPROCESSABLE"; message: string; status: 404 | 422 },
  cleanup?: (b2: B2Client) => Promise<void>,
): Promise<Response> {
  const { transitioned, row } = await deps.context.uploads.markFailed(claimed);
  if (!transitioned) {
    const fallback = terminalConfirmResponse(row);
    if (fallback) return terminalResponse(fallback, deps.context.requestId);
    throw new LocalValidationError("Upload confirmation lost its claim");
  }
  if (cleanup) await cleanup(deps.b2);
  return apiError(specific.code, specific.message, deps.context.requestId, specific.status);
}

/** Stream the final key, compare its sha256 to the declaration, and flip the
 *  intent terminal. Mismatches delete the final key so a corrupt object can
 *  never become publishable — but only after winning the terminal flip, so a
 *  superseded verifier never touches the winner's object. The reported
 *  outcome always reflects the persisted row. */
async function verifyFinalAndConfirm(deps: { b2: B2Client; context: FeatureContext }, claimed: UploadIntent, deadline: AbortSignal): Promise<Response> {
  const body = await deps.b2.streamGetObject(claimed.objectKey, { signal: deadline });
  if (!body) {
    return failClaimed(deps, claimed,
      { code: "NOT_FOUND", message: "Uploaded object disappeared before verification", status: 404 });
  }
  const actualSha = await sha256StreamHex(body.body);
  if (actualSha !== claimed.sha256) {
    return failClaimed(deps, claimed,
      { code: "UNPROCESSABLE", message: "Uploaded checksum does not match the declared sha256", status: 422 },
      async (b2) => {
        await b2.deleteObject(claimed.objectKey, { signal: deadline }).catch(() => undefined);
        await b2.deleteObject(stagingKey(claimed.id), { signal: deadline }).catch(() => undefined);
      });
  }
  const { row } = await deps.context.uploads.markConfirmed(claimed, claimed.declaredByteSize);
  // The returned row IS the fresh read (RETURNING): a won flip reports
  // confirmed, a lost race reports the winner's persisted state. No second
  // read is needed, keeping the run within the reserved D1 reads. The row
  // cannot be missing (intents are never deleted); anything else is terminal.
  const result = terminalConfirmResponse(row);
  if (result) return terminalResponse(result, deps.context.requestId);
  throw new HttpError("INTERNAL_ERROR", 500, "Upload confirmation lost its intent row");
}

/** True while no newer claim has superseded this verifier. Mutations of the
 *  final object and terminal transitions are gated on the opaque claim token
 *  (not the timestamp, which can collide at ms precision): a stale worker
 *  that lost a lease race must neither flip the row nor touch the winner's
 *  bytes. */
async function stillOwnsClaim(store: UploadIntentStore, claimed: UploadIntent): Promise<boolean> {
  const current = await store.getById(claimed.id);
  return !!current && current.status === "verifying" && current.claimToken !== null && claimed.claimToken !== null && current.claimToken === claimed.claimToken;
}

interface TerminalConfirm { status: "confirmed" | "failed" | "verifying"; intent: UploadIntent }

function terminalConfirmResponse(intent: UploadIntent): TerminalConfirm | null {
  if (intent.status === "confirmed" || intent.status === "failed" || intent.status === "verifying") {
    return { status: intent.status, intent };
  }
  return null;
}

function terminalResponse(terminal: TerminalConfirm, requestId: string): Response {
  if (terminal.status === "confirmed") {
    return Response.json({ intentId: terminal.intent.id, objectKey: terminal.intent.objectKey, byteSize: terminal.intent.actualByteSize ?? terminal.intent.declaredByteSize, sha256: terminal.intent.sha256, status: "confirmed" as const }, { status: 200 });
  }
  if (terminal.status === "failed") {
    return apiError("CONFLICT", "This upload intent failed and cannot be confirmed", requestId, 409);
  }
  return apiError("CONFLICT", "This upload is being confirmed by another request", requestId, 409);
}
