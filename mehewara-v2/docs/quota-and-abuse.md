# Quota, abuse, and free-tier policy

Free tiers are a budget guardrail, not a capacity or availability guarantee.
Cloudflare Pages, Cloudflare Workers/D1, Backblaze B2, Resend, and other providers can change prices, quotas,
included allowances, enforcement, and fair-use terms. Re-check current provider
documentation before launch and record the date of the review.

## Conservative application policy

The API must enforce application-level caps before provider calls. Initial
values are deliberately conservative placeholders and require product-owner
approval:

| Resource | Initial cap | Action when exceeded |
| --- | ---: | --- |
| Request body | 1 MiB | Reject with 413 |
| Media object | 50 MiB | Reject before B2 write (matches the `MediaUploadTicketRequest.byteSize` contract cap) |
| Objects per authenticated user/day | 20 | 429 and audit event |
| API mutations per user/minute | 30 | 429 with retry guidance |
| Email sends per user/day | 5 | Queue/reject and alert |
| Export rows per request | 1,000 | Paginate or reject |
| Worker execution budget | Defined per route | Fail closed before expensive work |

Pages static delivery and Worker execution are different quota surfaces. A
cached/static asset request consumes Pages delivery/cache capacity, while an API
request consumes Worker request/CPU/subrequest capacity and may also consume D1,
B2, or Resend quotas. Pages availability does not make Worker calls free, and
Worker limits do not limit already-published static files. Apply application
caps at the Worker boundary and monitor both provider surfaces independently.

Use stricter edge and anonymous-route limits. Apply quotas by authenticated
subject, route, and environment; do not trust client-provided identity. Keep
idempotency keys for retried mutations and cap retries/backoff.

## Abuse controls

- Require valid Access JWTs for protected operations and enforce ownership in
  every D1/B2 call.
- Allow-list CORS origins; reject unexpected origins rather than reflecting them.
- Validate content type, size, object key, pagination, and filter complexity.
- Rate-limit authentication failures, uploads, exports, email, and expensive
  reads separately. Alert on sudden 401/403/404/429/5xx changes.
- Per-subject fairness rate limiting (uploads/user/day and mutations/user/min
  rows above) is DEFERRED to Phase 2: it needs durable per-subject counters
  (own design + migration + tests), and the budget pools already bound
  provider spend per surface in Phase 1. The `requireCostRouteRateLimit`
  seam in `apps/api/src/shared/rate-limit.ts` is the Phase-2 wiring point —
  it fails closed when no limiter is injected, so nothing silently skips it.
- Do not expose B2 origins or public bucket URLs, debug routes, service-role credentials, or
  detailed storage errors.
- Keep an emergency kill switch for mutations, email, uploads, and exports.

## Reserve and static fallback

Maintain a manual emergency reserve: pause nonessential mutations, email,
uploads, and exports when budget/abuse alerts fire; preserve enough provider
capacity for authenticated read access and incident response. Static mode may
continue serving already-built public content while API mutations are disabled.
The UI must label stale/read-only data and provide a support path, not silently
claim success.

B2's free allowance is **not a guaranteed billing hard stop**. Storage, download, and transaction-class usage,
operations, and related account charges can still occur or terms can change.
Configure provider alerts and an owner review, but enforce application caps and
manual shutdown controls as the actual safety mechanism.
