# Mehewara v2 workspace

## Implementation status

Phase 1 (operations foundation) is implemented: workspace/tooling contracts,
environment documentation, CI, Cloudflare Pages static SPA configuration,
runbooks, the `@mehewara-v2/contracts` package, and the `@mehewara-v2/api`
Cloudflare Worker (budget authority, Backblaze B2 media paths with
ticket→confirm upload intents, D1 migrations, migration transformer +
round-trip harness). Phase 2 is implemented: publication build/current/rollback
(Phase 2a), admin content CRUD for all entities plus stats (Phase 2b),
backup export + import-restore (Phase 2c), and the public SPA (Phase 2d) —
a zero-dependency vanilla-ESM app in `apps/web/src/` that reads the
publication manifest, with subject/paper browsing, self-assessment
practice, local attempts, gallery, content pages, about/privacy, EN/SI
chrome, and a dark/light theme. The reviewed root `package-lock.json` is
committed and CI installs through `npm ci`.

The deployment is a Cloudflare Pages static frontend and a separate
Cloudflare Worker API backed by D1 and private Backblaze B2 (S3-compatible).
Pages serves static assets only; there are no Pages
Functions or API routes in this architecture. API traffic goes to the Worker
through the public `VITE_API_BASE_URL` build variable.

## Local commands

Use Node 22+ and the npm version pinned in `package.json` (npm 10.9.3).

```sh
npm ci --ignore-scripts --no-audit --no-fund  # deterministic install from the reviewed lockfile
npm run dev           # delegates to @mehewara-v2/web and @mehewara-v2/api
npm run check         # API/web check (typecheck is accepted as check)
npm run lint
npm test
npm run build
npm run test:migration  # fixture round-trip incl. contracts validation
npm run check:secrets
npm run audit:migration       # safe dry-run; no network calls or writes
npm run audit:migration -- --execute  # explicit, read-only source audit
```

Before local work, copy `.env.example` to an ignored `.env` and put Worker
secrets in the Worker secret store rather than in the Pages build environment.
Only `VITE_API_BASE_URL` is a public browser build variable, baked into
`dist/index.html` as the `api-base-url` meta tag the SPA reads at boot.
The web workspace is dependency-free vanilla ESM (`apps/web/src/*.js`
ships verbatim to `dist/assets/`); its pure modules are unit-tested with
`node:test`, and `npm run check` verifies the built artifacts.

## Workspace contract

The root declares npm workspaces for `apps/*` and `packages/*`. The planned
runtime packages are named `@mehewara-v2/web` and `@mehewara-v2/api`, with
`@mehewara-v2/contracts` as the API build dependency. Root commands discover
only these exact names, fail when an implemented required command is absent,
and build contracts before API/web. The reviewed root `package-lock.json` is
used by CI through `npm ci`.

## Documentation

- [Architecture](docs/architecture.md)
- [Dedicated account and manual setup checklist](docs/setup-checklist.md)
- [Deployment and environment runbook](docs/deployment-runbook.md)
- [Quota and abuse policy](docs/quota-and-abuse.md)
- [Migration runbook](docs/migration-runbook.md)
- [Rollback runbook](docs/rollback-runbook.md)
- [Operations runbook](docs/operations-runbook.md)
