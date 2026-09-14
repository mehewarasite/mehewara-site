import { z } from "zod";
import type { Env } from "../env";
import { BudgetCommitRequest, BudgetOperation, BudgetReleaseRequest, BudgetReserveRequest, BudgetPermit } from "@mehewara-v2/contracts";
import { HttpError } from "../shared/errors";

export type Operation = z.infer<typeof BudgetOperation>;
export interface BudgetCapability { readonly permitId: string; readonly expiresAt: string; readonly providerCallStarted: boolean; markProviderCallStarted(): void; }
export interface ReserveOptions { readonly declaredBytes?: number; readonly ttlSeconds?: number; }
/**
 * withBudget options. `strictCommit` changes the success-path contract: a
 * commit failure propagates instead of being swallowed. Use it exactly where
 * a later step records "paid" durably (the upload ticket's budgetCommitted
 * flag) — recording payment after a failed commit would mark an unpaid
 * intent paid. Everywhere else the lenient default stands: commit can only
 * fail on TTL expiry (bounded by the caller's ttlSeconds) or total DO
 * outage, and masking it preserves successful results.
 */
export interface WithBudgetOptions extends ReserveOptions { readonly strictCommit?: boolean; }
export interface BudgetGate { status(): Promise<any>; activateEmergency(command: any): Promise<void>; reserve(operation: Operation, opts?: ReserveOptions): Promise<BudgetCapability>; commit(permit: BudgetCapability): Promise<void>; release(permit: BudgetCapability): Promise<void>; reset(): Promise<void>; }
export class LocalValidationError extends Error { readonly providerCallStarted = false; }
export class ProviderOperationError extends Error { readonly providerCallStarted: boolean; constructor(message: string, providerCallStarted = true) { super(message); this.providerCallStarted = providerCallStarted; } }

/** A callback must mark the capability immediately before touching D1/R2. Unknown provider errors consume conservatively. */
export async function withBudget<T>(gate: BudgetGate, operation: Operation, callback: (permit: BudgetCapability) => Promise<T>, opts?: WithBudgetOptions): Promise<T> {
  const permit = await gate.reserve(operation, opts);
  let result: T;
  try {
    result = await callback(permit);
  } catch (error) {
    const declared = error instanceof LocalValidationError
      ? false
      : error instanceof ProviderOperationError
        ? error.providerCallStarted
        : permit.providerCallStarted;
    const providerCallStarted = permit.providerCallStarted || declared;
    try {
      if (providerCallStarted) await gate.commit(permit);
      else await gate.release(permit);
    } catch {
      // Finalize failures are non-fatal: the permit has already expired
      // (commit → EXPIRED_PERMIT) or already disappeared (commit →
      // UNKNOWN_PERMIT). Either way the original error is the caller's
      // signal; do not mask it.
    }
    throw error;
  }
  // Success path: commit exactly once. The reserve→callback→commit triplet is
  // the only valid sequence; we never call release after a successful commit.
  try {
    await gate.commit(permit);
  } catch (commitError) {
    // The DO may have already swept the permit on TTL expiry. The work was
    // already done by the callback; a commit failure here is non-fatal and
    // must not mask the successful result — UNLESS the caller passed
    // strictCommit, in which case a later step records payment durably and
    // must observe the failure (see WithBudgetOptions).
    if (opts?.strictCommit) throw commitError;
  }
  return result;
}

const PermitResponse = z.object({ permit: BudgetPermit }).strict();
export function durableBudgetGate(env: Env, requestId: string): BudgetGate {
  const stub = env.BUDGET_AUTHORITY.get(env.BUDGET_AUTHORITY.idFromName("global"));
  const call = async (action: "reserve" | "commit" | "release" | "status" | "emergency" | "reset", payload: unknown): Promise<unknown> => {
    const response = await stub.fetch(`https://budget.internal/${action}`, { method: "POST", headers: { "Content-Type": "application/json", "X-Request-ID": requestId }, body: JSON.stringify(payload) });
    let body: unknown; try { body = await response.json(); } catch { throw new HttpError("INTERNAL_ERROR", 503, "Budget authority is unavailable"); }
    if (!response.ok) { const error = body as { error?: { code?: string; message?: string } }; throw new HttpError(error.error?.code === "BUDGET_EXCEEDED" ? "BUDGET_EXCEEDED" : "INTERNAL_ERROR", response.status >= 500 ? 503 : response.status, error.error?.message ?? "Budget request rejected"); }
    return body;
  };
  return {
    async status() { return (await call("status", {}) as any).status; },
    async activateEmergency(cmd) { await call("emergency", cmd); },
    async reset() { await call("reset", {}); },
    async reserve(operation, opts) {
      const permitId = crypto.randomUUID();
      const payload = BudgetReserveRequest.parse({ permitId, operation, ...(opts?.declaredBytes !== undefined ? { declaredBytes: opts.declaredBytes } : {}), ...(opts?.ttlSeconds !== undefined ? { ttlSeconds: opts.ttlSeconds } : {}) });
      const body = PermitResponse.safeParse(await call("reserve", payload));
      if (!body.success) throw new HttpError("INTERNAL_ERROR", 503, "Budget authority returned an invalid permit");
      let started = false;
      const capability: BudgetCapability = { permitId: body.data.permit.permitId, expiresAt: body.data.permit.expiresAt, get providerCallStarted() { return started; }, markProviderCallStarted() { started = true; } };
      return capability;
    },
    async commit(permit) { await call("commit", BudgetCommitRequest.parse({ permitId: permit.permitId, providerCallStarted: permit.providerCallStarted })); },
    async release(permit) { await call("release", BudgetReleaseRequest.parse({ permitId: permit.permitId })); }
  };
}
