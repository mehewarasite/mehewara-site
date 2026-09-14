# Mehewara (මෙහෙවර) — Exam Practice Platform

[![React](https://img.shields.io/badge/Frontend-React%2019%20%7C%20Vite-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/Language-TypeScript-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Cloudflare Workers](https://img.shields.io/badge/Backend-Cloudflare%20Workers-F38020?logo=cloudflare&logoColor=white)](https://workers.cloudflare.com/)
[![Cloudflare D1](https://img.shields.io/badge/Database-Cloudflare%20D1%20(SQLite)-F38020?logo=cloudflare&logoColor=white)](https://developers.cloudflare.com/d1/)
[![Backblaze B2](https://img.shields.io/badge/Storage-Backblaze%20B2%20(S3)-E01A22?logo=backblaze&logoColor=white)](https://www.backblaze.com/b2/)
[![Tailwind CSS](https://img.shields.io/badge/Styling-Tailwind%20CSS%20v4-38B2AC?logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)

An open, high-performance, and free exam practice platform designed for Sri Lankan students preparing for **G.C.E. Ordinary Level (O/L)** and **Advanced Level (A/L)** examinations. Powered by a modern edge architecture with **React 19**, **Cloudflare Workers**, **Cloudflare D1**, and **Backblaze B2**.

---

## Key Highlights & Architecture

Mehewara is engineered to be globally fast, cost-efficient, and resilient under high traffic surges during national exam periods.

```
┌─────────────────────────────────────────────────────────────┐
│                      Cloudflare Edge                        │
│                                                             │
│   ┌───────────────────────────┐  ┌────────────────────────┐ │
│   │   Cloudflare Pages (SPA)  │  │ Cloudflare Workers API │ │
│   │   React 19 + Vite         │  │ https://api.mehewara...│ │
│   └─────────────┬─────────────┘  └───────────┬────────────┘ │
└─────────────────┼────────────────────────────┼──────────────┘
                  │ Public Read                │ Admin CRUD & Auth
                  ▼ (Snapshot Manifest)        ▼
       ┌──────────────────────┐    ┌──────────────────────────┐
       │   Backblaze B2 / CDN │    │      Cloudflare D1       │
       │   Static Question    │    │   Relational Database    │
       │   Snapshots & Media  │    │   (Subjects/Papers/Q's)  │
       └──────────────────────┘    └──────────────────────────┘
```

### Architecture Pillars

1. **Static Snapshot Publication Model**
   - Public students access exam questions via pre-compiled, versioned JSON snapshot manifests stored and served directly from edge CDN cache.
   - **Zero database load** per student page view or practice session, allowing thousands of concurrent students with negligible infrastructure cost.

2. **Cloudflare Worker Edge API**
   - High-speed serverless API (`https://api.mehewara.edu.lk`) built with Cloudflare Workers.
   - Sub-millisecond cold starts and global distribution with edge security headers and CORS origin validation.

3. **Cloudflare D1 Relational Storage**
   - Serverless SQLite at the edge backing all administrative content: subjects, exam papers, question banks, media records, and audit logs.
   - Built-in schema migrations and strict state-machine controls (`draft` → `published` → `archived`).

4. **Presigned Media Uploads via Backblaze B2**
   - Media (question diagrams, charts, past paper attachments) uses an intent-ticket workflow: the API generates a short-lived presigned S3 upload URL, and the client uploads directly to Backblaze B2, bypassing Worker compute and memory limits.

5. **Durable Objects Budget Authority**
   - Edge-enforced rate limiting and circuit-breaker controls to guard against unexpected traffic spikes or abuse, keeping operations well within zero/low-cost budget thresholds.

---

## Features

### Student Practice Portal
- **Exam Categorization**: Practice by Subject, Exam Type (O/L & A/L), Medium (Sinhala, English), and Year.
- **Interactive MCQ Engine**: Timed practice, instant answer checking, detailed rationales, and progress retention.
- **Scientific Typography**: Integrated **KaTeX** for rendering complex mathematical equations, chemical formulae, and scientific symbols.
- **Accessible & Responsive**: Optimized for smartphones, tablets, and desktops with bilingual interface support and dark/light theme switching.

### Secure Admin Management (`/admin`)
- **Direct Access**: Accessible at `/admin` with server-validated JWT credentials.
- **Question Bank Operations**:
  - **Add New Questions**: Rich editor with image uploading, options builder, and automatic sequence numbering.
  - **Edit Existing Questions**: In-place updates, rationale modification, and KaTeX previews.
  - **Manage & Delete**: Filter questions by paper, search, and delete with backend state-machine protection (automatic archive before purge).
- **Snapshot Release Engine**: One-click build and publish of public snapshots, with rollback support.
- **Data Portability**: Full database export and restore functionality.

---

## Repository Structure

```
mehewara-site/
├── src/                          # Primary React Frontend SPA
│   ├── api.ts                    # Edge API client adapter & D1 question syncing
│   ├── apiClient.ts              # Axios HTTP client with JWT interceptor & fallback
│   ├── App.tsx                   # Routing, state coordination, and data sync
│   ├── components/               # React UI Components
│   │   ├── admin/                # Admin Portal tabs (Add, Edit, Manage, Papers, etc.)
│   │   ├── AdminLogin.tsx        # Secure administrative login dialog
│   │   ├── AdminPanel.tsx        # Main admin workspace shell
│   │   ├── PracticeSession.tsx   # Student MCQ practice interface
│   │   └── RichTextEditor.tsx    # TipTap WYSIWYG editor with KaTeX & media upload
│   ├── utils/                    # Media upload helpers, storage, and text parsers
│   └── types.ts                  # Shared TypeScript models
│
├── mehewara-v2/                  # Monorepo Workspace
│   ├── apps/
│   │   ├── api/                  # Cloudflare Worker API
│   │   │   ├── src/features/     # Endpoints: admin, auth, public, publications, media
│   │   │   └── wrangler.toml     # Worker configuration, D1 bindings, and routes
│   │   └── web/                  # Web app mirror / reference implementation
│   ├── packages/
│   │   └── contracts/            # Shared Zod validation schemas and contract types
│   ├── migrations/               # Cloudflare D1 SQL database schema migrations
│   └── docs/                     # Architecture, runbooks, and operational guides
│
├── vite.config.ts                # Vite build and dev-server proxy configuration
└── package.json                  # Root scripts and frontend dependencies
```

---

## Getting Started

### Prerequisites
- **Node.js**: v20 or v22+
- **npm**: v10+
- **Wrangler CLI** (for Cloudflare Workers/D1 management): `npm install -g wrangler`

### 1. Installation

Clone the repository and install dependencies:

```bash
git clone https://github.com/induwarap/mehewara-site.git
cd mehewara-site
npm install
```

### 2. Environment Configuration

Copy the example environment file and configure the endpoints:

```bash
cp .env.example .env
```

Key environment variables:

| Variable | Description | Example |
|---|---|---|
| `VITE_API_BASE_URL` | Cloudflare Worker API URL | `https://api.mehewara.edu.lk` |
| `ALLOWED_ORIGINS` | Permitted CORS origins for local and production | `http://localhost:3000,https://mehewara.edu.lk` |
| `CLOUDFLARE_D1_DATABASE_ID` | Cloudflare D1 Database UUID | `6eb62ab0-f4a1-468a-95a8-13e9fdc53cc4` |
| `B2_BUCKET` | Backblaze B2 S3 storage bucket name | `mehewara` |

### 3. Local Development

Start the Vite development server (runs on `http://localhost:3000`):

```bash
npm run dev
```

Open your browser to:
- **Student Portal**: `http://localhost:3000/`
- **Admin Portal**: `http://localhost:3000/admin`

### 4. Code Quality & Typechecking

Ensure all TypeScript types and components are valid:

```bash
# Typecheck
npm run lint

# Build production bundle
npm run build
```

---

## Cloudflare Backend Deployment

### API Worker Deployment

To deploy the Cloudflare Worker API:

```bash
cd mehewara-v2/apps/api

# Login to Cloudflare
npx wrangler login

# Deploy migrations to production D1 database
npx wrangler d1 migrations apply mehewara-db --remote

# Deploy Worker
npx wrangler deploy
```

### Frontend Deployment (Cloudflare Pages)

The frontend is built with Vite into the `dist/` directory:

```bash
# From repository root
npm run build
```

Deploy the `dist/` folder via Cloudflare Pages:
- **Build command**: `npm run build`
- **Build output directory**: `dist`
- **Environment variables**: `VITE_API_BASE_URL=https://api.mehewara.edu.lk`

---

## Security & Best Practices

- **Zero Client-Side Admin Secrets**: Admin authentication uses server-issued JWTs verified at the edge worker.
- **CORS Strict Allowlist**: API only accepts requests from registered domains and approved local ports (`localhost:3000`, `localhost:5173`).
- **Safe State Transitions**: Published questions and papers cannot be deleted accidentally; the system enforces state transition to `archived` before deletion.
- **Turnstile Bot Protection**: Cloudflare Turnstile integration protects authentication and feedback forms against automated bots.

---

## License

This project is licensed under the [MIT License](LICENSE).
Mehewara is open-source software built for the benefit of Sri Lankan students and educators.
