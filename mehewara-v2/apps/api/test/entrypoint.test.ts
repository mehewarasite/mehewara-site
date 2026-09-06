import { describe, expect, it } from "vitest";
import worker from "../src/index";
import type { Env } from "../src/env";

function testEnv(): Env {
  return {
    D1: {} as D1Database,
    BUDGET_AUTHORITY: {
      idFromName: () => ({}),
      get: () => ({ fetch: async () => new Response(JSON.stringify({ ok: true }), { status: 200 }) }),
    } as unknown as DurableObjectNamespace,
    ENVIRONMENT: "test",
    ACCESS_ISSUER: "https://team.cloudflareaccess.com",
    ACCESS_AUDIENCE: "mehewara-test",
    ALLOWED_ORIGINS: "https://app.mehewara.test",
    B2_ENDPOINT: "https://s3.us-west-002.backblazeb2.com",
    B2_REGION: "us-west-002",
    B2_BUCKET: "mehewara-test",
    B2_KEY_ID: "test-key",
    B2_APPLICATION_KEY: "test-secret-with-enough-entropy",
    B2: undefined as never,
  } as unknown as Env;
}

describe("Worker entrypoint (CORS + request identity on every path)", () => {
  it("rejects a disallowed origin with 403, request id, security headers, and no CORS echo", async () => {
    const res = await worker.fetch(
      new Request("https://api.test/api/v1/health", { headers: { Origin: "https://evil.test" } }),
      testEnv()
    );
    expect(res.status).toBe(403);
    expect(res.headers.get("X-Request-ID")).toMatch(/^[A-Za-z0-9._-]{1,100}$/);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it("decorates error responses with CORS, credentials, and request id", async () => {
    const res = await worker.fetch(
      new Request("https://api.test/no-such-route", { headers: { Origin: "https://app.mehewara.test" } }),
      testEnv()
    );
    expect(res.status).toBe(404);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://app.mehewara.test");
    expect(res.headers.get("Access-Control-Allow-Credentials")).toBe("true");
    expect(res.headers.get("X-Request-ID")).toMatch(/^[A-Za-z0-9._-]{1,100}$/);
  });

  it("decorates success responses the same way", async () => {
    const res = await worker.fetch(
      new Request("https://api.test/api/v1/health", { headers: { Origin: "https://app.mehewara.test" } }),
      testEnv()
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://app.mehewara.test");
    expect(res.headers.get("Access-Control-Allow-Credentials")).toBe("true");
    expect(res.headers.get("X-Request-ID")).toMatch(/^[A-Za-z0-9._-]{1,100}$/);
    expect((await res.json() as { service: string }).service).toBe("mehewara-v2-api");
  });

  it("answers OPTIONS preflights with the CORS set", async () => {
    const res = await worker.fetch(
      new Request("https://api.test/api/v1/media/upload-ticket", { method: "OPTIONS", headers: { Origin: "https://app.mehewara.test" } }),
      testEnv()
    );
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://app.mehewara.test");
  });
});
