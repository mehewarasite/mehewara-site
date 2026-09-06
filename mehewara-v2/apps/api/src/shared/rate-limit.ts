import { HttpError } from "./errors";

export interface CostRouteRateLimiter { check(key: string): Promise<boolean>; }
/**
 * Per-subject fairness rate limiting (Phase 2). Provider spend is already
 * bounded by the budget pools in Phase 1; this seam adds per-subject
 * fairness once a durable counter store exists (own design + migration +
 * tests — see quota-and-abuse.md). Production must inject a real bounded
 * Durable Object/service. Missing capacity fails closed.
 */
export async function requireCostRouteRateLimit(limiter: CostRouteRateLimiter | undefined, key: string): Promise<void> {
  if (!limiter) throw new HttpError("INTERNAL_ERROR", 503, "Cost-route rate limiter is unavailable");
  let allowed: boolean;
  try { allowed = await limiter.check(key); } catch { throw new HttpError("INTERNAL_ERROR", 503, "Cost-route rate limiter is unavailable"); }
  if (!allowed) throw new HttpError("BUDGET_EXCEEDED", 429, "Rate limit exceeded");
}
