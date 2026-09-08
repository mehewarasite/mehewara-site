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
  return env.B2 ?? createB2Client({
    endpoint: env.B2_ENDPOINT,
    region: env.B2_REGION,
    bucket: env.B2_BUCKET,
    keyId: env.B2_KEY_ID,
    applicationKey: env.B2_APPLICATION_KEY,
  });
}

function withRequestHeaders(response: Response, corsHeaders: Headers, requestIdValue: string): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of corsHeaders) headers.set(key, value);
  headers.set("X-Request-ID", requestIdValue);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Referrer-Policy", "no-referrer");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
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
      const b2 = resolveB2(env);
      // NOTE: there is deliberately no media streaming/uploading handle on
      // the context. Routes receive the raw B2 client plus narrow stores so
      // every byte flows through the budgeted, intent-gated route functions;
      // a convenience handle would be a second minting path around them.
      const context: FeatureContext = {
        requestId: id,
        environment: env.ENVIRONMENT,
        access: { adminSecret: env.ADMIN_SECRET, superAdminSecret: env.SUPER_ADMIN_SECRET },
        gate: durableBudgetGate(env, id),
        uploads: d1UploadIntentStore(env.D1),
        inventory: d1MediaInventoryStore(env.D1),
        publications: d1PublicationStore(env.D1),
        admin: d1AdminStore(env.D1),
        imports: d1ImportStore(env.D1),
      };
      let response: Response;
      if (url.pathname === "/api/v1/health") { requireMethod(request, "GET"); response = json({ ok: true, service: "mehewara-v2-api", environment: context.environment, requestId: id }); }
      else if (url.pathname === "/api/v1/status") { requireMethod(request, "GET"); response = json({ status: "operational", publication: "snapshot-only", requestId: id }); }
      else if (url.pathname === "/api/v1/publication/current") { requireMethod(request, "GET"); response = await publicationRoute(request, context, { b2, store: context.publications }); }
      else if (url.pathname === "/api/v1/admin/content") { requireMethod(request, "POST", "PUT", "PATCH", "DELETE"); throw new HttpError("GONE", 410, "Use /api/v1/admin/<resource>[/<id>[/state]]"); }
      else if (url.pathname === "/api/v1/admin/export") { requireMethod(request, "GET"); response = await importExportRouter(request, { context, store: context.imports, inventory: context.inventory }); }
      else if (url.pathname === "/api/v1/admin/import") { requireMethod(request, "POST"); response = await importExportRouter(request, { context, store: context.imports, inventory: context.inventory }); }
      else if (url.pathname === "/api/v1/admin/publications/build") { requireMethod(request, "POST"); response = await buildPublicationRoute(request, { b2, context, store: context.publications }); }
      else if (url.pathname === "/api/v1/admin/publications/rollback") { requireMethod(request, "POST"); response = await rollbackPublicationRoute(request, { context, store: context.publications }); }
      else if (url.pathname.startsWith("/api/v1/admin/")) { response = await adminRouter(request, { context, store: context.admin, db: env.D1 }); }
      else if (url.pathname === "/api/v1/media/upload-ticket") { requireMethod(request, "POST"); response = await signedUploadHttpRoute(request, { b2, context }); }
      else if (url.pathname === "/api/v1/media/upload-confirm") { requireMethod(request, "POST"); response = await confirmUploadHttpRoute(request, { b2, context }); }
      else if (url.pathname.startsWith("/api/v1/media/")) { requireMethod(request, "GET"); const objectKey = decodeURIComponent(url.pathname.slice("/api/v1/media/".length)); response = await mediaStreamRoute(request, { b2, objectKey, context }); }
      else throw new HttpError("NOT_FOUND", 404, "Route not found");
      return withRequestHeaders(response, corsHeaders, id);
    } catch (error) {
      console.error("Unhandled API error:", error);
      // Error responses carry the same CORS + request-id + security headers
      // as success responses: cross-origin admin clients must be able to
      // read the 401/403/429 status instead of seeing an opaque network
      // error, and every response must be traceable by request id.
      return withRequestHeaders(errorResponse(error, id), corsHeaders, id);
    }
  }
} satisfies ExportedHandler<Env>;
