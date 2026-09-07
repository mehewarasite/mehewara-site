# Mehewara — Past Paper Practice Platform

A free exam practice platform for Sri Lankan O/L and A/L students, built with React + Vite and powered by a Cloudflare Workers API backend.

## Architecture

| Layer | Technology | Purpose |
|---|---|---|
| **Frontend** | React 19 + Vite | Static SPA deployed to Cloudflare Pages |
| **API** | Cloudflare Worker | All server-side logic, auth, and media serving |
| **Database** | Cloudflare D1 | Relational data (subjects, papers, questions) |
| **Media Storage** | Backblaze B2 | Private object storage with edge caching |
| **Budget Controls** | Durable Objects | Rate limiting, quota management, abuse prevention |

## Environment Variables

| Variable | Description |
|---|---|
| `VITE_API_BASE_URL` | The Cloudflare Worker API endpoint URL. Defaults to the production worker if omitted. |

## Getting Started

```bash
# 1. Install dependencies
npm install

# 2. Copy env and configure
cp .env.example .env

# 3. Start dev server
npm run dev
```

## Project Structure

```
src/                    # Frontend React SPA
├── api.ts              # V2 API adapter (subjects, papers, questions, gallery, about)
├── apiClient.ts        # Axios HTTP client with JWT auth
├── App.tsx             # Main application with routing and data sync
├── components/         # UI components (AdminPanel, PracticeSession, Gallery, etc.)
├── utils/              # Media upload, storage, parsing utilities
└── types.ts            # TypeScript type definitions

mehewara-v2/            # Backend monorepo (Cloudflare Workers)
├── apps/api/           # Cloudflare Worker API (D1, B2, Durable Objects)
├── apps/web/           # V2 web frontend (reference copy)
├── packages/contracts/ # Shared Zod schemas and API types
├── migrations/         # D1 SQL schema migrations
├── scripts/            # Migration and deployment utilities
└── docs/               # Architecture, deployment, and operations runbooks
```

## Key Design Decisions

1. **Snapshot Publication Model**: Public users receive a pre-compiled JSON manifest from B2 edge cache — zero database load per page view.
2. **JWT Admin Authentication**: Server-side credential verification replaces client-side hash checks.
3. **Signed Upload Tickets**: Media uploads go directly to B2 via short-lived presigned URLs, bypassing Worker compute.
4. **Budget Authority**: A Durable Object circuit breaker prevents runaway costs across D1 reads, B2 egress, and Worker execution.
