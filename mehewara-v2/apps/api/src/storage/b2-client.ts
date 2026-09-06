/**
 * Backblaze B2 client over the S3-compatible API.
 *
 * Goals:
 *  - Worker-only secrets (keyId, applicationKey, endpoint, bucket). Never logged.
 *  - All operations stream; we never buffer whole objects in memory.
 *  - Signed URLs are short-lived (default 60s) and content-type scoped.
 *  - Reads are private: the Worker streams the B2 response back to the
 *    browser with explicit cache headers, so the browser never learns the
 *    B2 origin and no Cloudflare egress is incurred for the B2 leg.
 *
 * The client intentionally exposes the minimum surface the routes need:
 *  - `headObject(key)` for existence/content-length/content-type checks.
 *  - `streamGetObject(key)` returns a Web ReadableStream of the B2 body.
 *  - `signedUploadTicket(key, contentType, expiresInSeconds)` returns the
 *    URL and headers a browser must use to upload directly to B2.
 *  - `deleteObject(key)` removes an object.
 *  - `inventory(prefix, max)` paginates a prefix for read-only audits.
 *
 * Note: the S3-compatible API is fully documented by Backblaze; this client
 * is a thin layer over the AWS SigV4 algorithm. A full SDK is not required
 * for our usage and would inflate the Worker bundle.
 */

import { z } from "zod";
import { HttpError } from "../shared/errors";
import { MediaUploadTicket } from "@mehewara-v2/contracts";

type MediaUploadTicketShape = z.infer<typeof MediaUploadTicket>;
/** The B2 layer mints the signed URL only. The route layer attaches the
 *  upload-intent id — intent lifecycle is not a storage concern. */
export type B2TicketShape = Omit<MediaUploadTicketShape, "intentId">;

export interface B2CallOptions { readonly signal?: AbortSignal; }

export interface B2Client {
  headObject(key: string, opts?: B2CallOptions): Promise<{ contentLength: number; contentType: string; etag: string } | null>;
  /**
   * Conditional GET that returns either 200 (with body) or 304 (no body).
   * Forwards the worker's `If-None-Match` header to B2 so a single round
   * trip serves both the fresh and the cached-bytes cases. The worker
   * never needs a separate HEAD; this is the only call against B2 for a
   * media read.
   */
  getObjectWithMetadata(key: string, ifNoneMatch?: string | null, opts?: B2CallOptions): Promise<{ status: 200 | 304; body?: ReadableStream<Uint8Array>; contentLength: number; contentType: string; etag: string } | null>;
  streamGetObject(key: string, opts?: B2CallOptions): Promise<{ body: ReadableStream<Uint8Array>; contentLength: number; contentType: string; etag: string } | null>;
  signedUploadTicket(key: string, contentType: string, maxByteSize: number, expiresInSeconds: number): Promise<B2TicketShape>;
  deleteObject(key: string, opts?: B2CallOptions): Promise<void>;
  copyObject(sourceKey: string, destKey: string, opts?: B2CallOptions): Promise<void>;
  /**
   * Worker-side PUT for small trusted artifacts (publication snapshots).
   * Unlike browser uploads, the Worker holds the keys and signs the request
   * directly — no presigned URL involved. Bodies are bounded by callers;
   * snapshots are JSON manifests, never media blobs.
   */
  putObject(key: string, body: Uint8Array, contentType: string, opts?: B2CallOptions): Promise<{ etag: string }>;
  inventory(prefix: string, max?: number): Promise<{ key: string; size: number; uploadedAt: string }[]>;
}

export interface B2Config {
  endpoint: string;
  region: string;
  bucket: string;
  keyId: string;
  applicationKey: string;
}

const MAX_KEY_LENGTH = 1024;
const KEY_PATTERN = /^[A-Za-z0-9._~\-/%]+$/;

function assertSafeKey(key: string): void {
  if (typeof key !== "string" || key.length === 0 || key.length > MAX_KEY_LENGTH) throw new HttpError("BAD_REQUEST", 400, "Invalid object key");
  if (!KEY_PATTERN.test(key)) throw new HttpError("BAD_REQUEST", 400, "Invalid object key");
  // No minted key ever contains a parent segment: ticket keys are
  // `staging/<uuid>` or `<prefix>/<uuid>`, migration keys are
  // `legacy/<kind>/…`. Rejecting `..` here keeps a traversal out even if a
  // future caller forgets the route-level check.
  if (key.includes("..")) throw new HttpError("BAD_REQUEST", 400, "Invalid object key");
}

function trimSlash(s: string): string { return s.replace(/\/+$/, ""); }
function trimLeadingSlash(s: string): string { return s.replace(/^\/+/, ""); }

function toHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let out = "";
  for (let i = 0; i < bytes.length; i += 1) {
    const value = bytes[i] ?? 0;
    out += value.toString(16).padStart(2, "0");
  }
  return out;
}

async function hmacSha256(keyMaterial: ArrayBuffer | Uint8Array, payload: string): Promise<ArrayBuffer> {
  const bytes = keyMaterial instanceof Uint8Array
    ? keyMaterial
    : new Uint8Array(keyMaterial);
  const view = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    view,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(payload));
}

async function hmacSha256FromString(keyString: string, payload: string): Promise<ArrayBuffer> {
  return hmacSha256(new TextEncoder().encode(keyString), payload);
}

async function sha256Hex(payload: string | ArrayBuffer): Promise<string> {
  const bytes = typeof payload === "string" ? new TextEncoder().encode(payload) : new Uint8Array(payload);
  const view = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const digest = await crypto.subtle.digest("SHA-256", view);
  return toHex(digest);
}

/**
 * Hash a streamed response body. Prefer `sha256StreamHex` from
 * `../shared/sha256`, which hashes incrementally with O(1) memory; this
 * re-export keeps existing import sites working.
 */
export { sha256StreamHex } from "../shared/sha256";

const ALGORITHM = "AWS4-HMAC-SHA256";

function amzDate(now: Date): { date: string; datetime: string } {
  const pad = (n: number) => n.toString().padStart(2, "0");
  const date = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}`;
  const datetime = `${date}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;
  return { date, datetime };
}

function uriEscape(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

interface SignedRequest {
  method: string;
  canonicalUri: string;
  canonicalQuery: string;
  host: string;
  service: string;
  payloadHash: string;
  extraHeaders?: Record<string, string>;
}

async function sign(config: B2Config, request: SignedRequest, now: Date = new Date()): Promise<{ authorization: string; amzDate: string }> {
  const { date, datetime } = amzDate(now);
  const credentialScope = `${date}/${config.region}/${request.service}/aws4_request`;
  const baseHeaders = ["host", "x-amz-content-sha256", "x-amz-date"];
  const extra = request.extraHeaders ?? {};
  const allHeaders = [...new Set([...baseHeaders, ...Object.keys(extra).map((k) => k.toLowerCase())])].sort();
  const signedHeaders = allHeaders.join(";");
  const headerLines = allHeaders.map((h) => {
    if (h === "host") return `host:${request.host}`;
    if (h === "x-amz-content-sha256") return `x-amz-content-sha256:${request.payloadHash}`;
    if (h === "x-amz-date") return `x-amz-date:${datetime}`;
    const value = extra[h] ?? extra[Object.keys(extra).find((k) => k.toLowerCase() === h) ?? ""] ?? "";
    return `${h}:${value}`;
  });
  const canonicalHeaders = headerLines.join("\n") + "\n";
  const canonicalRequest = [
    request.method,
    request.canonicalUri,
    request.canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    request.payloadHash
  ].join("\n");
  const stringToSign = [ALGORITHM, datetime, credentialScope, await sha256Hex(canonicalRequest)].join("\n");
  const kDate = await hmacSha256FromString(`AWS4${config.applicationKey}`, date);
  const kRegion = await hmacSha256(kDate, config.region);
  const kService = await hmacSha256(kRegion, request.service);
  const kSigning = await hmacSha256(kService, "aws4_request");
  const signature = toHex(await hmacSha256(kSigning, stringToSign));
  const authorization = `${ALGORITHM} Credential=${config.keyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  return { authorization, amzDate: datetime };
}

export function createB2Client(config: B2Config): B2Client {
  if (!config.endpoint || !config.region || !config.bucket || !config.keyId || !config.applicationKey) {
    throw new HttpError("NOT_CONFIGURED", 503, "B2 storage is not configured");
  }
  const endpoint = trimSlash(config.endpoint);
  const host = new URL(endpoint).host;
  const bucketHost = `${config.bucket}.${host}`;

  async function signedFetch(target: { method: string; path: string; query?: Record<string, string>; body?: BodyInit; extraHeaders?: Record<string, string>; unsignedPayload?: boolean; timeoutMs?: number; outerSignal?: AbortSignal }): Promise<Response> {
    const path = `/${trimLeadingSlash(target.path)}`;
    const queryString = Object.entries(target.query ?? {}).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${uriEscape(k)}=${uriEscape(v)}`).join("&");
    let payloadHash: string;
    if (target.unsignedPayload) {
      payloadHash = "UNSIGNED-PAYLOAD";
    } else if (typeof target.body === "string") {
      payloadHash = await sha256Hex(target.body);
    } else if (target.body instanceof Uint8Array) {
      payloadHash = await sha256Hex(target.body.buffer.slice(target.body.byteOffset, target.body.byteOffset + target.body.byteLength) as ArrayBuffer);
    } else {
      payloadHash = await sha256Hex(new ArrayBuffer(0));
    }
    const { authorization, amzDate } = await sign(config, {
      method: target.method,
      canonicalUri: uriEscape(path).replace(/%2F/g, "/"),
      canonicalQuery: queryString,
      host: bucketHost,
      service: "s3",
      payloadHash,
      extraHeaders: target.extraHeaders,
    });
    const url = `https://${bucketHost}${path}${queryString ? `?${queryString}` : ""}`;
    const headers: Record<string, string> = { host: bucketHost, "x-amz-content-sha256": payloadHash, "x-amz-date": amzDate, Authorization: authorization, ...target.extraHeaders };
    // Every provider call carries a deadline shorter than the confirm
    // permit TTL (300s) and the verification lease (15min): a hung B2 call
    // fails fast into a budgeted error path instead of running past permit
    // expiry, which would leave provider work unaccounted. Callers may pass
    // an outer deadline (the confirm flow uses one absolute 240s deadline
    // for the whole sequence); it is combined, not replaced.
    const timeouts: AbortSignal[] = [];
    if (target.outerSignal) timeouts.push(target.outerSignal);
    if (target.timeoutMs !== undefined) timeouts.push(AbortSignal.timeout(target.timeoutMs));
    const signal = timeouts.length === 0 ? undefined : timeouts.length === 1 ? timeouts[0] : AbortSignal.any(timeouts);
    return fetch(url, { method: target.method, headers, body: target.body, ...(signal ? { signal } : {}) });
  }

  /** Metadata calls (HEAD/DELETE/COPY/LIST) carry small bodies and must
   *  answer quickly; 60s bounds each well under the permit TTL. */
  const METADATA_TIMEOUT_MS = 60_000;
  /** Streaming GETs move up to 50 MB; 240s still clears the 300s permit TTL
   *  with margin, and hashing is incremental so no extra buffering accrues. */
  const STREAM_TIMEOUT_MS = 240_000;

/**
 * Extracts an ETag from a B2 response header. Preserves the weak/strong
 * distinction: a B2 weak ETag (`W/"abc"`) stays weak, a strong ETag
 * (`"abc"`) stays strong. Never fabricates a validator when the upstream
 * omits the header — the caller must surface that as an error rather than
 * silently downgrade the cache contract.
 */
function extractEtag(header: string | null): { value: string; weak: boolean } | null {
  if (!header) return null;
  const trimmed = header.trim();
  if (trimmed.startsWith("W/")) {
    const value = trimmed.slice(2).replace(/^"|"$/g, "");
    if (!value) return null;
    return { value, weak: true };
  }
  const value = trimmed.replace(/^"|"$/g, "");
  if (!value) return null;
  return { value, weak: false };
}

function formatEtag(extracted: { value: string; weak: boolean }): string {
  return extracted.weak ? `W/"${extracted.value}"` : `"${extracted.value}"`;
}

  return {
    async headObject(key, opts) {
      assertSafeKey(key);
      const response = await signedFetch({ method: "HEAD", path: key, timeoutMs: METADATA_TIMEOUT_MS, outerSignal: opts?.signal });
      if (response.status === 404) return null;
      if (!response.ok) throw new HttpError("INTERNAL_ERROR", response.status, `B2 head failed (${response.status})`);
      const contentLength = Number(response.headers.get("content-length") ?? "0");
      const contentType = response.headers.get("content-type") ?? "application/octet-stream";
      const etag = extractEtag(response.headers.get("etag"));
      if (!etag) throw new HttpError("INTERNAL_ERROR", 502, "B2 head did not return an ETag");
      return { contentLength, contentType, etag: formatEtag(etag) };
    },
    /**
     * Conditional GET that returns either 200 (with body) or 304 (no body).
     * Forwards the worker's `If-None-Match` header to B2 so a single round
     * trip serves both the fresh and the cached-bytes cases. The worker
     * never needs a separate HEAD; this is the only call against B2 for a
     * media read.
     */
    async getObjectWithMetadata(key, ifNoneMatch, opts) {
      assertSafeKey(key);
      const extraHeaders: Record<string, string> = {};
      if (ifNoneMatch) extraHeaders["If-None-Match"] = ifNoneMatch;
      const response = await signedFetch({ method: "GET", path: key, extraHeaders, timeoutMs: STREAM_TIMEOUT_MS, outerSignal: opts?.signal });
      if (response.status === 404) return null;
      if (response.status !== 200 && response.status !== 304) throw new HttpError("INTERNAL_ERROR", response.status, `B2 get failed (${response.status})`);
      const etag = extractEtag(response.headers.get("etag"));
      if (!etag) throw new HttpError("INTERNAL_ERROR", 502, "B2 get did not return an ETag");
      const contentType = response.headers.get("content-type") ?? "application/octet-stream";
      const contentLength = Number(response.headers.get("content-length") ?? "0");
      if (response.status === 304) {
        return { status: 304, contentLength, contentType, etag: formatEtag(etag) };
      }
      return { status: 200, body: response.body as ReadableStream<Uint8Array>, contentLength, contentType, etag: formatEtag(etag) };
    },
    async streamGetObject(key, opts) {
      assertSafeKey(key);
      const response = await signedFetch({ method: "GET", path: key, timeoutMs: STREAM_TIMEOUT_MS, outerSignal: opts?.signal });
      if (response.status === 404) return null;
      if (!response.ok) throw new HttpError("INTERNAL_ERROR", response.status, `B2 get failed (${response.status})`);
      const etag = extractEtag(response.headers.get("etag"));
      if (!etag) throw new HttpError("INTERNAL_ERROR", 502, "B2 get did not return an ETag");
      return {
        body: response.body as ReadableStream<Uint8Array>,
        contentLength: Number(response.headers.get("content-length") ?? "0"),
        contentType: response.headers.get("content-type") ?? "application/octet-stream",
        etag: formatEtag(etag),
      };
    },
    async signedUploadTicket(key, contentType, maxByteSize, expiresInSeconds) {
      assertSafeKey(key);
      if (typeof contentType !== "string" || !/^[\w.+-]+\/[\w.+-]+$/.test(contentType) || contentType.length > 200) throw new HttpError("BAD_REQUEST", 400, "Invalid content type");
      if (!Number.isInteger(maxByteSize) || maxByteSize < 1 || maxByteSize > 5_368_709_120) throw new HttpError("BAD_REQUEST", 400, "maxByteSize must be a positive integer up to 5 GiB");
      if (!Number.isInteger(expiresInSeconds) || expiresInSeconds < 30 || expiresInSeconds > 3600) throw new HttpError("BAD_REQUEST", 400, "expiresInSeconds must be 30..3600");
      // SigV4 presigning: use `now` for the credential scope and X-Amz-Date.
      // The ticket is valid for `expiresInSeconds` from `now`, not from the
      // expiry time. Using `expires` as the signing time can cause the B2
      // endpoint to reject the request as future-dated for longer tickets.
      const now = new Date();
      const expires = new Date(now.getTime() + expiresInSeconds * 1000);
      const { date, datetime } = amzDate(now);
      const credentialScope = `${date}/${config.region}/s3/aws4_request`;
      // The signed headers must include every header the browser is required
      // to send on the PUT, so the content type is cryptographically bound to
      // the URL. Returning a `Content-Type` header the URL was not signed for
      // would let the browser upload with a different MIME than what B2
      // recorded for the object.
      //
      // `content-length` is signed with the *exact declared byte count*: B2
      // rejects a PUT whose Content-Length differs, so a client cannot upload
      // more (or fewer) bytes than the budget permit reserved. `maxByteSize`
      // remains advisory for the browser UI; enforcement is provider-side.
      const signedHeaders = "content-length;content-type;host";
      const canonicalUri = uriEscape(`/${trimLeadingSlash(key)}`).replace(/%2F/g, "/");
      const canonicalQuery = `X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=${uriEscape(`${config.keyId}/${credentialScope}`)}&X-Amz-Date=${datetime}&X-Amz-Expires=${expiresInSeconds}&X-Amz-SignedHeaders=${uriEscape("content-length;content-type;host")}`;
      const canonicalHeaders = `content-length:${maxByteSize}\ncontent-type:${contentType}\nhost:${bucketHost}\n`;
      const canonicalRequest = ["PUT", canonicalUri, canonicalQuery, canonicalHeaders, signedHeaders, "UNSIGNED-PAYLOAD"].join("\n");
      const stringToSign = [ALGORITHM, datetime, credentialScope, await sha256Hex(canonicalRequest)].join("\n");
      const kDate = await hmacSha256FromString(`AWS4${config.applicationKey}`, date);
      const kRegion = await hmacSha256(kDate, config.region);
      const kService = await hmacSha256(kRegion, "s3");
      const kSigning = await hmacSha256(kService, "aws4_request");
      const signature = toHex(await hmacSha256(kSigning, stringToSign));
      const url = `https://${bucketHost}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`;
      return {
        url,
        objectKey: key,
        headers: { "Content-Type": contentType, "Content-Length": String(maxByteSize) },
        expiresAt: expires.toISOString(),
        maxByteSize,
      };
    },
    async deleteObject(key, opts) {
      assertSafeKey(key);
      const response = await signedFetch({ method: "DELETE", path: key, timeoutMs: METADATA_TIMEOUT_MS, outerSignal: opts?.signal });
      if (response.status === 404) return;
      if (!response.ok) throw new HttpError("INTERNAL_ERROR", response.status, `B2 delete failed (${response.status})`);
    },
    /**
     * Server-side copy used to promote a verified staging upload to its
     * immutable final key. The browser can never write the final key: only
     * the Worker holds the keys that authorize this call, so a confirmed
     * object cannot be overwritten through a replayed presigned URL.
     */
    async copyObject(sourceKey, destKey, opts) {
      assertSafeKey(sourceKey);
      assertSafeKey(destKey);
      const response = await signedFetch({
        method: "PUT",
        path: destKey,
        extraHeaders: { "x-amz-copy-source": `/${config.bucket}/${sourceKey}` },
        timeoutMs: METADATA_TIMEOUT_MS,
        outerSignal: opts?.signal,
      });
      if (!response.ok) throw new HttpError("INTERNAL_ERROR", response.status, `B2 copy failed (${response.status})`);
      // S3-compatible CopyObject can report failure inside a 200 body
      // (`<Error>` instead of `<CopyObjectResult>`). A bare status check
      // would promote a failed copy as success, so the body must name the
      // result and carry its ETag.
      const body = await response.text();
      if (!/<CopyObjectResult[\s>]/.test(body) || !/<ETag>.+<\/ETag>/.test(body) || /<Error[\s>]/.test(body)) {
        throw new HttpError("INTERNAL_ERROR", 502, "B2 copy did not return a CopyObjectResult");
      }
    },
    async putObject(key, body, contentType, opts) {
      assertSafeKey(key);
      if (!(body instanceof Uint8Array)) throw new HttpError("BAD_REQUEST", 400, "Invalid object body");
      if (typeof contentType !== "string" || !/^[\w.+-]+\/[\w.+-]+$/.test(contentType)) throw new HttpError("BAD_REQUEST", 400, "Invalid content type");
      // Copy into a fresh ArrayBuffer-backed view: BodyInit typing requires
      // ArrayBuffer, not a generic ArrayBufferLike view. signedFetch hashes
      // the bytes it sends for the SigV4 payload hash.
      const bytes = Uint8Array.from(body);
      const response = await signedFetch({
        method: "PUT",
        path: key,
        body: bytes,
        extraHeaders: { "Content-Type": contentType },
        timeoutMs: STREAM_TIMEOUT_MS,
        outerSignal: opts?.signal,
      });
      if (!response.ok) throw new HttpError("INTERNAL_ERROR", response.status, `B2 put failed (${response.status})`);
      // The PUT contract requires exactly 200: like CopyObject, a 2xx with
      // an unexpected shape must not read as success.
      if (response.status !== 200) throw new HttpError("INTERNAL_ERROR", 502, `B2 put returned unexpected status ${response.status}`);
      await response.body?.cancel().catch(() => undefined);
      return { etag: response.headers.get("etag")?.replace(/^W\//, "").replace(/^"|"$/g, "") ?? "" };
    },
    async inventory(prefix, max = 1_000) {
      const safePrefix = prefix ? trimLeadingSlash(prefix) : "";
      if (safePrefix && !KEY_PATTERN.test(safePrefix)) throw new HttpError("BAD_REQUEST", 400, "Invalid prefix");
      const out: { key: string; size: number; uploadedAt: string }[] = [];
      let continuationToken: string | undefined;
      while (out.length < max) {
        const query: Record<string, string> = { "list-type": "2", prefix: safePrefix, "max-keys": String(Math.min(1_000, max - out.length)) };
        if (continuationToken) query["continuation-token"] = continuationToken;
        const response = await signedFetch({ method: "GET", path: "", query, timeoutMs: METADATA_TIMEOUT_MS });
        if (!response.ok) throw new HttpError("INTERNAL_ERROR", response.status, `B2 list failed (${response.status})`);
        const xml = await response.text();
        for (const match of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
          const block = match[1] ?? "";
          const key = /<Key>([\s\S]*?)<\/Key>/.exec(block)?.[1] ?? null;
          const sizeStr = /<Size>([\s\S]*?)<\/Size>/.exec(block)?.[1] ?? "0";
          const uploadedAt = /<LastModified>([\s\S]*?)<\/LastModified>/.exec(block)?.[1] ?? "";
          if (key) out.push({ key, size: Number(sizeStr), uploadedAt });
          if (out.length >= max) break;
        }
        const isTruncated = /<IsTruncated>([\s\S]*?)<\/IsTruncated>/.exec(xml)?.[1] === "true";
        if (!isTruncated) break;
        continuationToken = /<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/.exec(xml)?.[1];
        if (!continuationToken) break;
      }
      return out;
    },
  };
}
