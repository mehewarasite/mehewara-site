import type { Env } from "../env";
import { HttpError } from "./errors";

export function requestId(request: Request): string {
  const supplied = request.headers.get("X-Request-ID");
  return supplied && /^[A-Za-z0-9._-]{1,100}$/.test(supplied) ? supplied : crypto.randomUUID();
}

export function securityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Referrer-Policy", "no-referrer");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export function cors(request: Request, env: Env): Headers {
  const origin = request.headers.get("Origin");
  const allowed = env.ALLOWED_ORIGINS.split(",").map((item) => item.trim()).filter(Boolean);
  const headers = new Headers({ "Vary": "Origin" });
  if (origin) {
    const isAllowed =
      allowed.includes(origin) ||
      /^https:\/\/([a-zA-Z0-9-]+\.)?(mehewara-site|mehewara)\.pages\.dev$/.test(origin);
    if (isAllowed) {
      headers.set("Access-Control-Allow-Origin", origin);
      // Exact echoed origin (never `*`), so credentialed admin requests are
      // safe: the browser only exposes the response to the allow-listed origin.
      headers.set("Access-Control-Allow-Credentials", "true");
      headers.set("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
      headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, Idempotency-Key, X-Request-ID");
      headers.set("Access-Control-Max-Age", "600");
    } else {
      throw new HttpError("FORBIDDEN", 403, "Origin is not allowed");
    }
  }
  return headers;
}
