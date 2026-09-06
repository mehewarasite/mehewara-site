# Architecture and boundaries

## System shape

`@mehewara-v2/web` is a Vite-built static SPA deployed to Cloudflare Pages from
`apps/web/dist`. `@mehewara-v2/api` is a Cloudflare Worker deployed separately
from `apps/api`. The browser obtains its API origin from the sole public
`VITE_API_BASE_URL` build variable; it does not receive Worker secrets. Pages
serves HTML, JavaScript, CSS, and assets only. **There are no Pages Functions,
Pages API routes, or Pages background jobs.**

The Worker is the only application server boundary:

```text
Browser -> Cloudflare Pages static assets
Browser -> Cloudflare edge cache -> Worker -> Backblaze B2 (private S3 endpoint)
Browser -> Worker (signed PUT ticket) -> uploads directly to Backblaze B2
Browser -> Cloudflare Access (where protected) -> Worker
Worker -> D1 (relational data)
Worker -> Backblaze B2 (media, S3-compatible, private)
Worker -> Resend (outbound email, if enabled)
```

The browser never talks to B2 directly on the read path. The Worker is
the only trust boundary. The Cloudflare↔Backblaze path is on private peering, so the
B2 leg of a media read does not incur Cloudflare egress. Confirmed media
responses are stored in the Worker's edge cache (`caches.default`, no
Wrangler configuration required) with immutable year-long Cache-Control, so
repeat reads cost nothing downstream — no budget, no D1, no B2. (The Worker
isolate still executes the cache lookup itself; "edge-cached" means no
provider calls, not no compute.) Only 200s
are cached, never errors or revalidations.

Cloudflare Access JWT verification is performed in the Worker using the
configured issuer/team domain and audience. The Worker validates the RS256
signature against the team's JWKS (`<issuer>/cdn-cgi/access/certs`, cached
10 minutes, single refetch on unknown kid for rotation), plus issuer,
audience, expiry (60s skew), and required claims before protected routes
execute. Roles come from the token's `roles` array claim, falling back to the
IdP `groups` array claim (see the setup checklist for the group mapping);
operators needing stricter separation use separate Access applications
(audiences) per role tier. Every verification failure — including JWKS
fetch errors — fails closed to 401.
Public routes must be deliberately allow-listed; an Access-protected hostname
must not be treated as public merely because a request includes a familiar
header.

## Data and trust boundaries

- D1 stores metadata and authorization-relevant records. Every mutation is
  authenticated, validated, bounded, and idempotent where retries are likely.
- B2 is private. The Worker authorizes object reads and writes.
  - **Reads** stream the B2 response back to the browser with edge-cache
    headers. The B2 origin is never exposed to the browser on the read
    path; the browser only ever sees the Worker URL. The Worker's edge
    cache serves repeat reads without touching B2, D1, or the budget —
    with capability-URL semantics: final object keys embed unguessable UUIDs
    minted server-side, uploads require an authenticated admin, and only
    confirmed-intent or inventoried-migration objects resolve at all. A
    Phase-2 publication allowlist will additionally scope reads to
    currently-published content; until then, unguessability + confirmation
    is the documented interim posture, not an oversight.
  - **Writes** go through a short-lived signed PUT URL minted by the
    Worker. The browser PUTs directly to B2 because streaming the body
    through the Worker would be wasteful. This means the browser sees the
    B2 host for the duration of the upload; the URL is short-lived
    (30–3600s) and the Worker is still the only thing that can mint one.
- CORS is an explicit, environment-specific allow-list. `*` is not acceptable
  for credentialed requests. The B2 bucket also needs CORS rules for the
  PUT path; see the deployment runbook.
- Resend API keys stay in Worker secrets. Email is a side effect and should be
  queued/retried safely without making a successful data mutation repeat it.
- Migration credentials are source-only, temporary, and read by the audit
  script. They are never Vite variables, committed files, or log fields.

## Environments and ownership

Use separate `local`, Pages branch-preview/staging, and `production` values for
every account, database, B2 bucket, Access application, domain, and email
sender. Pages branch previews are staging surfaces, not production API
clients. Production must use a dedicated Cloudflare account and a dedicated
Backblaze B2 account, with distinct D1 and B2 resources. Keep the resource
ledger (with placeholders until provisioned) in the deployment checklist, and
record owner, region, creation date, and recovery contacts in the private
operations system.

## Failure posture

The frontend can remain available as static Pages content while the API is
degraded. The UI must expose a read-only/static-mode fallback rather than
retrying mutations indefinitely. The API should fail closed for authorization
and quota checks, return bounded errors, and preserve idempotency keys for
safe client retries. See the quota, deployment, and rollback runbooks for
action steps.
