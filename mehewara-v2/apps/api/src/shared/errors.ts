import { z } from "zod";
import { ApiError, ErrorCode } from "@mehewara-v2/contracts";

export class HttpError extends Error {
  constructor(readonly code: z.infer<typeof ErrorCode>, readonly status: number, message: string, readonly details?: Record<string, string>) {
    super(message);
    this.name = "HttpError";
  }
}

// Kept local so an unhandled exception can never expose binding or token details.
export function errorResponse(error: unknown, requestId: string): Response {
  const known = error instanceof HttpError ? error : new HttpError("INTERNAL_ERROR", 500, "An unexpected error occurred");
  return apiError(known.code, known.message, requestId, known.status, known.details ? Object.entries(known.details).map(([field, message]) => ({ field, message })) : undefined);
}

/**
 * Typed error responses: the code must be an ErrorCode member and the body
 * is validated against the ApiError contract before sending, so a typo'd
 * code fails fast instead of shipping an off-contract body.
 */
export function apiError(code: z.infer<typeof ErrorCode>, message: string, requestId: string, status: number, details?: { field: string; message: string }[]): Response {
  const body = ApiError.parse({ error: { code, message, requestId, ...(details ? { details } : {}) } });
  return Response.json(body, { status });
}

export function assertNever(value: never): never { throw new Error(`Unhandled value: ${String(value)}`); }
