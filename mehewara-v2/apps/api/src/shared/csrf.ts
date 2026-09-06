import { HttpError } from "./errors";

export interface MutationOriginPolicy { verify(request: Request): void; }
export function mutationOriginPolicy(allowedOrigins: readonly string[]): MutationOriginPolicy {
  return { verify(request) {
    const origin = request.headers.get("Origin");
    if (!origin || !allowedOrigins.includes(origin)) throw new HttpError("FORBIDDEN", 403, "A trusted mutation origin is required");
    const csrf = request.headers.get("X-CSRF-Token");
    if (!csrf || !/^[A-Za-z0-9._~-]{16,256}$/.test(csrf)) throw new HttpError("FORBIDDEN", 403, "CSRF proof is required");
  } };
}
