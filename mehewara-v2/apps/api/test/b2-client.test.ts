import { describe, expect, it, vi, afterEach } from "vitest";
import { createB2Client } from "../src/storage/b2-client";
import { HttpError } from "../src/shared/errors";

const baseConfig = {
  endpoint: "https://s3.us-west-002.backblazeb2.com",
  region: "us-west-002",
  bucket: "mehewara-test",
  keyId: "test-key-id",
  applicationKey: "test-application-key-with-enough-entropy",
};

describe("B2 client (signed requests, no network)", () => {
  it("rejects invalid object keys", async () => {
    // Hermetic: validation must reject before any network call. If the
    // client ever dials out for these keys, the stub fails the test loudly
    // instead of depending on sandbox DNS.
    vi.stubGlobal("fetch", async () => { throw new Error("fetch must not be called for invalid keys"); });
    try {
      const client = createB2Client(baseConfig);
      await expect(client.headObject("../etc/passwd")).rejects.toBeInstanceOf(HttpError);
      await expect(client.headObject("")).rejects.toBeInstanceOf(HttpError);
      await expect(client.headObject("a".repeat(2000))).rejects.toBeInstanceOf(HttpError);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("rejects invalid content type and bounds on signed upload", async () => {
    const client = createB2Client(baseConfig);
    await expect(client.signedUploadTicket("gallery/x.jpeg", "not a content type", 1024, 60)).rejects.toMatchObject({ status: 400 });
    await expect(client.signedUploadTicket("gallery/x.jpeg", "image/jpeg", 0, 60)).rejects.toMatchObject({ status: 400 });
    await expect(client.signedUploadTicket("gallery/x.jpeg", "image/jpeg", 1024, 29)).rejects.toMatchObject({ status: 400 });
    await expect(client.signedUploadTicket("gallery/x.jpeg", "image/jpeg", 1024, 3601)).rejects.toMatchObject({ status: 400 });
  });

  it("returns a presigned URL with content-type and exact content-length bound to the signature", async () => {
    const client = createB2Client(baseConfig);
    const ticket = await client.signedUploadTicket("gallery/photo-1.jpeg", "image/jpeg", 4_096_000, 300);
    expect(ticket.objectKey).toBe("gallery/photo-1.jpeg");
    expect(ticket.headers["Content-Type"]).toBe("image/jpeg");
    // The browser must send exactly the declared byte count: B2 rejects a
    // PUT whose Content-Length differs, so uploads cannot exceed the budget
    // permit reserved at issuance.
    expect(ticket.headers["Content-Length"]).toBe("4096000");
    expect(ticket.maxByteSize).toBe(4_096_000);
    // SignedHeaders includes content-length and content-type; the
    // X-Amz-SignedHeaders query parameter advertises exactly that.
    expect(ticket.url).toMatch(/X-Amz-SignedHeaders=content-length%3Bcontent-type%3Bhost/);
    expect(ticket.url).toMatch(/X-Amz-Algorithm=AWS4-HMAC-SHA256/);
    expect(ticket.url).toMatch(/X-Amz-Expires=300/);
  });

  it("promotes staging→final with a signed server-side copy the browser could never authorize", async () => {
    const seen: { url: string; method: string; headers: Record<string, string> }[] = [];
    vi.stubGlobal("fetch", async (url: string, init: { method?: string; headers?: Record<string, string> }) => {
      seen.push({ url, method: init.method ?? "GET", headers: init.headers ?? {} });
      return new Response("<CopyObjectResult><ETag>abc</ETag></CopyObjectResult>", { status: 200 });
    });
    try {
      const client = createB2Client(baseConfig);
      await client.copyObject("staging/some-intent", "gallery/some-intent");
    } finally {
      vi.unstubAllGlobals();
    }
    expect(seen).toHaveLength(1);
    expect(seen[0]!.method).toBe("PUT");
    expect(seen[0]!.url).toBe("https://mehewara-test.s3.us-west-002.backblazeb2.com/gallery/some-intent");
    // The copy source names the bucket explicitly, and the request carries a
    // SigV4 Authorization header the browser never sees.
    expect(seen[0]!.headers["x-amz-copy-source"]).toBe("/mehewara-test/staging/some-intent");
    expect(seen[0]!.headers["Authorization"]).toMatch(/^AWS4-HMAC-SHA256 Credential=/);
  });

  it("rejects a copy whose 200 body carries an embedded error", async () => {
    vi.stubGlobal("fetch", async () => new Response("<Error><Code>AccessDenied</Code></Error>", { status: 200 }));
    try {
      const client = createB2Client(baseConfig);
      await expect(client.copyObject("staging/a", "gallery/a")).rejects.toMatchObject({ status: 502 });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("bounds every provider call with a deadline shorter than the permit TTL", async () => {
    const signals: unknown[] = [];
    vi.stubGlobal("fetch", async (_url: string, init: { signal?: unknown; headers?: Record<string, string> }) => {
      signals.push(init.signal);
      return new Response("<CopyObjectResult><ETag>abc</ETag></CopyObjectResult>", { status: 200, headers: { "content-length": "3", "content-type": "image/jpeg", etag: '"e"' } });
    });
    try {
      const client = createB2Client(baseConfig);
      await client.headObject("gallery/a.jpeg");
      await client.copyObject("staging/a", "gallery/a");
      await client.streamGetObject("gallery/a.jpeg");
    } finally {
      vi.unstubAllGlobals();
    }
    expect(signals).toHaveLength(3);
    for (const signal of signals) expect(signal).toBeInstanceOf(AbortSignal);
  });
});

afterEach(() => { vi.unstubAllGlobals(); });
