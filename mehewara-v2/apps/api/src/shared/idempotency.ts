import { HttpError } from "./errors";

export interface IdempotencyStore { get(key: string): Promise<Response | null>; put(key: string, response: Response): Promise<void>; }
export class NoopIdempotencyStore implements IdempotencyStore {
  async get(_key: string): Promise<Response | null> { return null; }
  async put(_key: string, _response: Response): Promise<void> { /* Durable implementation is supplied with persistence. */ }
}
export function requireIdempotencyKey(request: Request): string {
  const key = request.headers.get("Idempotency-Key");
  if (!key || !/^[A-Za-z0-9._~-]{8,128}$/.test(key)) throw new HttpError("BAD_REQUEST", 400, "A valid Idempotency-Key is required");
  return key;
}
