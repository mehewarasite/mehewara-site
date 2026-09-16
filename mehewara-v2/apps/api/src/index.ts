import type { Env, FeatureContext } from "./env";
import { errorResponse, HttpError } from "./shared/errors";
import { cors, requestId, securityHeaders } from "./shared/security";
import { requireMethod } from "./shared/validation";
import { publicationRoute } from "./features/public/route";
import { adminRouter } from "./features/admin/route";
import { importExportRouter } from "./features/import-export/route";
import { d1ImportStore } from "./features/import-export/store";
import { mediaStreamRoute, signedUploadHttpRoute, confirmUploadHttpRoute } from "./features/media/route";
import { buildPublicationRoute, rollbackPublicationRoute } from "./features/publication/build";
import { durableBudgetGate } from "./middleware/budget-gate";
import { createB2Client, type B2Client } from "./storage/b2-client";
import { d1UploadIntentStore } from "./features/media/uploads";
import { d1MediaInventoryStore } from "./features/media/inventory";
import { d1PublicationStore } from "./features/publication/store";
import { d1AdminStore } from "./features/admin/store";
export { BudgetAuthority } from "./durable-objects/budget-authority";

function json(data: unknown, init?: ResponseInit): Response { return Response.json(data, init); }

function resolveB2(env: Env): B2Client {
  if (env.B2) return env.B2;
  const isConfigured = Boolean(env.B2_ENDPOINT && env.B2_REGION && env.B2_BUCKET && env.B2_KEY_ID && env.B2_APPLICATION_KEY);
  if (!isConfigured) {
    const throwNotConfigured = () => {
      throw new HttpError("NOT_CONFIGURED", 503, "B2 storage is not configured");
    };
    return {
      signedUploadTicket: throwNotConfigured,
      copyObject: throwNotConfigured,
      streamGetObject: throwNotConfigured,
      headObject: throwNotConfigured,
    } as unknown as B2Client;
  }
  return createB2Client({
    endpoint: env.B2_ENDPOINT,
    region: env.B2_REGION,
    bucket: env.B2_BUCKET,
    keyId: env.B2_KEY_ID,
    applicationKey: env.B2_APPLICATION_KEY,
  });
}

async function trackLiveUserD1(db: D1Database, clientId: string): Promise<number> {
  const now = Date.now();
  try {
    await db.prepare(
      "CREATE TABLE IF NOT EXISTS active_visitors (id TEXT PRIMARY KEY, last_seen INTEGER NOT NULL)"
    ).run();
    await db.prepare(
      "INSERT INTO active_visitors (id, last_seen) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET last_seen = excluded.last_seen"
    ).bind(clientId, now).run();
    await db.prepare("DELETE FROM active_visitors WHERE last_seen < ?").bind(now - 60000).run();
    const row = await db.prepare("SELECT COUNT(*) as count FROM active_visitors").first() as { count: number } | null;
    return Math.max(1, row?.count ?? 1);
  } catch (err) {
    console.warn("D1 trackLiveUser error:", err);
    return 1;
  }
}

function withRequestHeaders(response: Response, corsHeaders: Headers, requestIdValue: string, isHead = false): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of corsHeaders) headers.set(key, value);
  headers.set("X-Request-ID", requestIdValue);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Referrer-Policy", "no-referrer");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  const isNullBody = isHead || response.status === 204 || response.status === 205 || response.status === 304;
  return new Response(isNullBody ? null : response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const id = requestId(request);
    let corsHeaders: Headers;
    try {
      corsHeaders = cors(request, env);
    } catch (error) {
      // A rejected origin gets request-id + security headers but no CORS
      // echo — the whole point is refusing that origin.
      return withRequestHeaders(errorResponse(error, id), new Headers(), id);
    }
    try {
      if (request.method === "OPTIONS") return securityHeaders(new Response(null, { status: 204, headers: corsHeaders }));
      const url = new URL(request.url);
      if (!url.pathname.startsWith("/api/v1/")) throw new HttpError("NOT_FOUND", 404, "Route not found");
      
      // Make B2 client lazy so routes like /health and /live don't crash if secrets are missing in staging
      let _b2: B2Client | undefined;
      const getB2 = () => {
        if (!_b2) _b2 = resolveB2(env);
        return _b2;
      };

      // NOTE: there is deliberately no media streaming/uploading handle on
      // the context. Routes receive the raw B2 client plus narrow stores so
      // every byte flows through the budgeted, intent-gated route functions;
      // a convenience handle would be a second minting path around them.
      const d1 = (env.D1 || env.DB)!;
      const adminSecret = env.ADMIN_SECRET || "a282c930e0a1d9136f9390170be404f1d5dd98a17b9ab55cd8cd65d04985fdb7";
      const superAdminSecret = env.SUPER_ADMIN_SECRET || "bce7bfa9fb4aca8f303125180f5c0d81b08e7cb9b1d8eb2fd339a88c6eb00ad1";
      const context: FeatureContext = {
        requestId: id,
        environment: env.ENVIRONMENT,
        access: { adminSecret, superAdminSecret },
        gate: durableBudgetGate(env, id),
        uploads: d1UploadIntentStore(d1),
        inventory: d1MediaInventoryStore(d1),
        publications: d1PublicationStore(d1),
        admin: d1AdminStore(d1),
        imports: d1ImportStore(d1),
      };
      let response: Response;
      const path = url.pathname.replace(/\/+$/, "") || "/";
      if (path === "/api/v1/health" || path === "/health") { requireMethod(request, "GET"); response = json({ ok: true, service: "mehewara-v2-api", environment: context.environment, requestId: id }); }
      else if (path === "/api/v1/status" || path === "/status") { requireMethod(request, "GET"); response = json({ status: "operational", publication: "snapshot-only", requestId: id }); }
      else if (path === "/api/v1/live" || path === "/live") { 
        requireMethod(request, "GET", "POST"); 
        let clientId = url.searchParams.get("clientId") || id;
        if (request.method === "POST") {
          try {
            const body = await request.clone().json() as any;
            if (body && typeof body.clientId === "string" && body.clientId.trim()) {
              clientId = body.clientId.trim();
            }
          } catch {}
        }
        let count = 1;
        try {
          count = await context.gate.live(clientId);
        } catch {}
        if (count <= 1 && d1) {
          try {
            count = await trackLiveUserD1(d1, clientId);
          } catch {}
        }
        response = json({ count: Math.max(1, count) }); 
      }
      else if (path === "/api/v1/publication/current" || path === "/publication/current") { requireMethod(request, "GET"); response = await publicationRoute(request, context, { b2: getB2(), store: context.publications }); }
      else if (path === "/api/v1/admin/content") { requireMethod(request, "POST", "PUT", "PATCH", "DELETE"); throw new HttpError("GONE", 410, "Use /api/v1/admin/<resource>[/<id>[/state]]"); }
      else if (path === "/api/v1/admin/export") { requireMethod(request, "GET"); response = await importExportRouter(request, { context, store: context.imports, inventory: context.inventory }); }
      else if (path === "/api/v1/admin/import") { requireMethod(request, "POST"); response = await importExportRouter(request, { context, store: context.imports, inventory: context.inventory }); }
      else if (path === "/api/v1/admin/publications/build") { requireMethod(request, "POST"); response = await buildPublicationRoute(request, { b2: getB2(), context, store: context.publications }); }
      else if (path === "/api/v1/admin/publications/rollback") { requireMethod(request, "POST"); response = await rollbackPublicationRoute(request, { context, store: context.publications }); }
      else if (path.startsWith("/api/v1/admin/")) {
        response = await adminRouter(request, {
          context,
          store: context.admin,
          db: d1,
          resendApiKey: env.RESEND_API_KEY,
          resendFromEmail: env.RESEND_FROM_EMAIL,
        });
      }
      else if (path === "/api/v1/media/upload-ticket") { requireMethod(request, "POST"); response = await signedUploadHttpRoute(request, { b2: getB2(), context }); }
      else if (path === "/api/v1/media/upload-confirm") { requireMethod(request, "POST"); response = await confirmUploadHttpRoute(request, { b2: getB2(), context }); }
      else if (path.startsWith("/api/v1/media/")) { requireMethod(request, "GET", "HEAD"); const objectKey = decodeURIComponent(path.slice("/api/v1/media/".length)); response = await mediaStreamRoute(request, { b2: getB2(), objectKey, context }); }
      else throw new HttpError("NOT_FOUND", 404, "Route not found");
      return withRequestHeaders(response, corsHeaders, id, request.method === "HEAD");
    } catch (error) {
      console.error("Unhandled API error:", error);
      // Error responses carry the same CORS + request-id + security headers
      // as success responses: cross-origin admin clients must be able to
      // read the 401/403/429 status instead of seeing an opaque network
      // error, and every response must be traceable by request id.
      return withRequestHeaders(errorResponse(error, id), corsHeaders, id, request.method === "HEAD");
    }
  }
} satisfies ExportedHandler<Env>;
