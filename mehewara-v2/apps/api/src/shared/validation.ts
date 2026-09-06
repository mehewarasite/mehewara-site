import { z, type ZodType } from "zod";
import { HttpError, apiError } from "./errors";

export function validatePath(path: string, pattern: RegExp): void {
  if (!pattern.test(path)) throw new HttpError("NOT_FOUND", 404, "Route not found");
}

export async function parseJson<T>(request: Request, schema: ZodType<T>): Promise<T> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    throw new HttpError("BAD_REQUEST", 400, "Content-Type must be application/json");
  }
  const length = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(length) && length > 1_000_000) throw new HttpError("BAD_REQUEST", 400, "Request body is too large");
  let raw: unknown;
  try {
    const reader = request.body?.getReader();
    if (!reader) throw new Error("missing body");
    const chunks: Uint8Array[] = []; let total = 0;
    for (;;) {
      const part = await reader.read(); if (part.done) break;
      total += part.value.byteLength;
      if (total > 1_000_000) { await reader.cancel(); throw new Error("body too large"); }
      chunks.push(part.value);
    }
    const bytes = new Uint8Array(total); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    raw = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError("BAD_REQUEST", 400, error instanceof Error && error.message === "body too large" ? "Request body is too large" : "Malformed JSON body");
  }
  const result = schema.safeParse(raw);
  if (!result.success) throw new HttpError("BAD_REQUEST", 400, "Request validation failed", { issue: result.error.issues[0]?.message ?? "invalid body" });
  return result.data;
}

export function requireMethod(request: Request, ...methods: string[]): void {
  if (!methods.includes(request.method)) throw new HttpError("METHOD_NOT_ALLOWED", 405, "Method is not allowed");
}

/**
 * Bounded body parsing that answers 400 responses (with the request id)
 * instead of throwing, so routes stay in their Response-returning shape
 * while still enforcing the 1 MiB streamed cap.
 */
export async function parseBody<T>(request: Request, requestId: string, parse: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false; response: Response }> {
  try {
    return { ok: true, value: await parse() };
  } catch (error) {
    if (error instanceof HttpError && error.status === 400) {
      const details = error.details
        ? Object.entries(error.details).map(([field, message]) => ({ field, message }))
        : undefined;
      return { ok: false, response: apiError("BAD_REQUEST", error.message, requestId, 400, details) };
    }
    throw error;
  }
}

export const EmptyBody = z.object({}).strict();
