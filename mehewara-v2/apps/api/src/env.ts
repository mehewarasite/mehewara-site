import type { BudgetGate } from "./middleware/budget-gate";
import type { AccessConfig } from "./shared/auth";
import type { B2Client } from "./storage/b2-client";
import type { UploadIntentStore } from "./features/media/uploads";
import type { MediaInventoryStore } from "./features/media/inventory";
import type { PublicationStore } from "./features/publication/store";
import type { AdminStore } from "./features/admin/store";
import type { ImportStore } from "./features/import-export/store";

/**
 * Worker environment. Raw provider bindings live here. The Worker entrypoint
 * is the only place that holds them; feature modules see only `FeatureContext`.
 *
 * Storage uses Backblaze B2 via the S3-compatible API. The Cloudflare
 * Worker streams reads from B2 over the private Cloudflare↔Backblaze path
 * (no Cloudflare egress, no browser-direct B2 URLs). Uploads are gated by
 * the Worker and handed to the browser as short-lived signed PUTs.
 */
export interface Env {
  D1: D1Database;
  BUDGET_AUTHORITY: DurableObjectNamespace;
  ENVIRONMENT: string;
  ADMIN_SECRET: string;
  SUPER_ADMIN_SECRET: string;
  ALLOWED_ORIGINS: string;
  /** S3-compatible B2 endpoint, e.g. https://s3.us-west-002.backblazeb2.com */
  B2_ENDPOINT: string;
  B2_REGION: string;
  B2_BUCKET: string;
  /** Long-lived application key ID. Worker secret; never logged. */
  B2_KEY_ID: string;
  /** Long-lived application key. Worker secret; never logged. */
  B2_APPLICATION_KEY: string;
  /** Pre-built B2 client injected by the entrypoint. */
  B2: B2Client;
  /** Resend API Key for outbound emails. Worker secret. */
  RESEND_API_KEY?: string;
  /** From email address for outbound emails (e.g. Mehewara <noreply@mehewara.edu.lk>). */
  RESEND_FROM_EMAIL?: string;
}

/** Narrow capability a feature module may receive. Raw D1/B2 bindings are deliberately excluded. */
export interface FeatureContext {
  readonly requestId: string;
  readonly environment: string;
  readonly access: AccessConfig;
  readonly gate: BudgetGate;
  /** Upload-intent persistence. Built from D1 by the entrypoint; routes never see the raw binding. */
  readonly uploads: UploadIntentStore;
  /** Migrated media inventory. Built from D1 by the entrypoint; legacy keys
   *  resolve only through this table, never by prefix alone. */
  readonly inventory: MediaInventoryStore;
  /** Publication snapshots + current pointer. Built from D1 by the
   *  entrypoint; routes never see the raw binding. */
  readonly publications: PublicationStore;
  /** Admin content management. Built from D1 by the entrypoint; routes
   *  never see the raw binding. */
  readonly admin: AdminStore;
  /** Import/export. Built from D1 by the entrypoint; routes never see the raw binding. */
  readonly imports: ImportStore;
}
