import { z } from "zod";
import {
  BudgetCommitRequest,
  BudgetOperation,
  BudgetPool,
  BudgetReleaseRequest,
  BudgetReserveRequest,
  BudgetWindow,
} from "@mehewara-v2/contracts";

/**
 * Cloudflare D1 and Backblaze B2 resource counters. The D1 daily limits are
 * Cloudflare's metered free tier; the B2 limits are Backblaze's free tier
 * for the Worker-driven, browser-streamed media path. b2EgressBytes is
 * tracked for observability only — the Cloudflare↔Backblaze peering is
 * free and is not billed, so it does not contribute to EXCEEDED.
 */
export type Resource = "d1Reads" | "d1Writes" | "b2ClassA" | "b2ClassB" | "b2Bytes" | "b2EgressBytes";
export type Pool = z.infer<typeof BudgetPool>;
export type WindowKind = z.infer<typeof BudgetWindow>;
export type Operation = z.infer<typeof BudgetOperation>;

export const RESOURCE_POLICIES: Readonly<Record<Resource, { limit: number; window: WindowKind }>> = {
  d1Reads: { limit: 5_000_000, window: "daily" },
  d1Writes: { limit: 100_000, window: "daily" },
  b2ClassA: { limit: 2_500, window: "daily" },
  b2ClassB: { limit: 10_000_000, window: "monthly" },
  b2Bytes: { limit: 10_000_000_000, window: "persistent" },
  b2EgressBytes: { limit: 1_000_000_000_000, window: "persistent" },
};

/** Pool partitions sum to 100%. Public traffic cannot borrow reserved capacity. */
export const POOL_RESOURCE_ALLOCATIONS: Readonly<Record<Pool, number>> = {
  public: 0.50,
  admin: 0.35,
  publication: 0.10,
  emergency: 0.025,
  margin: 0.025,
};

export const POOL_POLICIES: Readonly<Record<Pool, { limit: number; window: WindowKind }>> = {
  public: { limit: 50_000, window: "daily" },
  admin: { limit: 35_000, window: "daily" },
  publication: { limit: 10_000, window: "daily" },
  emergency: { limit: 2_500, window: "daily" },
  margin: { limit: 2_500, window: "daily" },
};

type ResourceAmounts = Partial<Record<Resource, number>>;
interface OperationPolicy {
  pool: Exclude<Pool, "emergency" | "margin">;
  resources: ResourceAmounts;
  /** Positive bytes are reserved before the B2 write; negative bytes are committed after deletion. */
  storageDelta?: number;
  /** Optional egress byte estimate. Tracked for observability; not billed. */
  egressDelta?: number;
  costUnits: number;
}

/** Only this catalog assigns cloud-resource charges. Routes may name an operation only. */
export const OPERATION_CATALOG: Readonly<Record<Operation, OperationPolicy>> = {
  publicSnapshotRead: { pool: "public", resources: { b2ClassB: 1, d1Reads: 2 }, egressDelta: 8_192, costUnits: 1 },
  publicSnapshotCacheFill: { pool: "public", resources: { d1Reads: 1, b2ClassB: 1 }, egressDelta: 16_384, costUnits: 2 },
  adminContentRead: { pool: "admin", resources: { d1Reads: 2 }, costUnits: 1 },
  /** Worst-case admin mutation, counted in D1 statements: idempotency lookup
   *  + entity + parent/options/inventory reads, then entity update + options
   *  + audit + idempotency record. */
  adminContentWrite: { pool: "admin", resources: { d1Reads: 7, d1Writes: 10 }, costUnits: 2 },
  /** Full backup export: ~13 base SELECTs plus one per 100-question options
   *  chunk. Capped at 2,000 questions (route refuses larger with 409), so
   *  35 reads always suffice; larger databases split restores via import
   *  chunks instead. Admin-only, human-scale. */
  adminBackupExport: { pool: "admin", resources: { d1Reads: 35 }, costUnits: 20 },
  /** One import chunk (≤50 entities): existence/parent reads plus up to ~50
   *  row writes and the job-status write. The import loop takes one permit
   *  per chunk, so arbitrarily large manifests cost proportionally while
   *  every reservation stays bounded. */
  adminBackupImportChunk: { pool: "admin", resources: { d1Reads: 3, d1Writes: 60 }, costUnits: 8 },
  publicationBuild: { pool: "publication", resources: { d1Reads: 5000, d1Writes: 0, b2ClassA: 1 }, costUnits: 110 },
  /** Moving the current-publication pointer (rollback, or a future explicit
   *  publish step): snapshot lookup, pointer upsert, history insert. Reserves
   *  the worst case: the idempotency-race path re-resolves the winner (prior
   *  lookup + target lookup + pointer read + winner lookup + winner snapshot
   *  = 5 reads); happy paths use fewer. */
  publicationPointerMove: { pool: "publication", resources: { d1Reads: 5, d1Writes: 3 }, costUnits: 5 },
  b2MediaRead: { pool: "public", resources: { b2ClassB: 1, d1Reads: 1 }, egressDelta: 8_192, costUnits: 1 },
  b2Upload: { pool: "admin", resources: { b2ClassA: 1, d1Reads: 3, d1Writes: 3 }, storageDelta: 2_097_152, costUnits: 14 },
  /** Routing lookup for the ticket/confirm flows: D1 reads (routing lookup,
   *  fresh pre-signing re-read, conditional write + reread), one conditional
   *  write, and one Class-A expiry cleanup. Terminal replays commit only
   *  this cheap permit instead of a full B2 allowance. */
  mediaIntentLookup: { pool: "admin", resources: { b2ClassA: 1, d1Reads: 3, d1Writes: 1 }, costUnits: 2 },
  /** Worst-case confirm verification, all inside one permit: HEAD staging +
   *  HEAD final (resume path) + GET final + COPY + DELETE staging (Class A
   *  covers COPY and both DELETEs) plus intent D1 reads/writes. Reserved up
   *  front; the whole permit commits even when verification short-circuits,
   *  which is conservative and documented. */
  mediaUploadConfirm: { pool: "admin", resources: { b2ClassB: 3, b2ClassA: 4, d1Reads: 2, d1Writes: 2 }, costUnits: 10 },
  b2Delete: { pool: "admin", resources: { b2ClassA: 1 }, storageDelta: -2_097_152, costUnits: 2 },
  snapshotArtifactWrite: { pool: "publication", resources: { b2ClassA: 1, d1Writes: 4 }, storageDelta: 2_097_152, costUnits: 10 },
};

export interface Counter { reserved: number; committed: number; windowStartedAt: number; }
interface Permit { operation: Operation; pool: Pool; resources: ResourceAmounts; storageDelta: number; egressDelta: number; costUnits: number; expiresAt: number; }
export interface AuthorityState {
  emergencyUntil: number | null;
  resources: Record<Resource, Counter>;
  pools: Record<Pool, Counter>;
  poolResources: Record<Pool, Record<Resource, Counter>>;
  permits: Record<string, Permit>;
}
export interface BudgetPersistence { load(): Promise<AuthorityState | null>; save(state: AuthorityState): Promise<void>; }

export class BudgetFailure extends Error {
  constructor(readonly reason: "MALFORMED" | "UNKNOWN_PERMIT" | "EXPIRED_PERMIT" | "EXCEEDED" | "EMERGENCY_REQUIRED" | "PERSISTENCE_UNAVAILABLE") {
    super(reason);
    this.name = "BudgetFailure";
  }
}

export function budgetWindowStart(now: number, window: WindowKind): number {
  if (window === "persistent") return 0;
  const date = new Date(now);
  if (window === "monthly") date.setUTCDate(1);
  date.setUTCHours(0, 0, 0, 0);
  return date.getTime();
}
export function budgetWindowEnd(start: number, window: WindowKind): number | null {
  if (window === "persistent") return null;
  const date = new Date(start);
  if (window === "monthly") date.setUTCMonth(date.getUTCMonth() + 1);
  else date.setUTCDate(date.getUTCDate() + 1);
  return date.getTime();
}

function freshCounter(now: number, window: WindowKind): Counter {
  return { reserved: 0, committed: 0, windowStartedAt: budgetWindowStart(now, window) };
}
function freshState(now: number): AuthorityState {
  const resources = Object.fromEntries(Object.entries(RESOURCE_POLICIES).map(([key, policy]) => [key, freshCounter(now, policy.window)])) as Record<Resource, Counter>;
  const pools = Object.fromEntries(Object.entries(POOL_POLICIES).map(([key, policy]) => [key, freshCounter(now, policy.window)])) as Record<Pool, Counter>;
  const poolResources = Object.fromEntries((Object.keys(POOL_POLICIES) as Pool[]).map((pool) => [pool, Object.fromEntries(Object.entries(RESOURCE_POLICIES).map(([key, policy]) => [key, freshCounter(now, policy.window)]))])) as Record<Pool, Record<Resource, Counter>>;
  return { emergencyUntil: null, resources, pools, poolResources, permits: {} };
}
function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
function validCounter(value: unknown): value is Counter {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  // Counters are money: integers, never negative, never fractional, and
  // exactly the three expected keys. A persisted negative `committed` would
  // otherwise silently restore capacity on the next window check.
  if (Object.keys(record).length !== 3) return false;
  return ["reserved", "committed", "windowStartedAt"].every(
    (key) => typeof record[key] === "number" && Number.isInteger(record[key]) && (record[key] as number) >= 0
  );
}
function validPermit(value: unknown): value is Permit {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  // Exactly the seven expected keys: omitted or extra fields indicate drift
  // or tampering, and either must fail closed rather than load partially.
  const keys = Object.keys(record).sort();
  if (JSON.stringify(keys) !== JSON.stringify(["costUnits", "egressDelta", "expiresAt", "operation", "pool", "resources", "storageDelta"])) return false;
  const policy = typeof record["operation"] === "string"
    ? (OPERATION_CATALOG as Record<string, OperationPolicy | undefined>)[record["operation"]]
    : undefined;
  if (!policy) return false;
  // The permit must match its operation's canonical charges exactly: a
  // stored permit naming another operation's pool, resources, or cost would
  // otherwise spend from the wrong allowance on commit.
  if (record["pool"] !== policy.pool) return false;
  const resources = record["resources"];
  if (resources === null || typeof resources !== "object" || Array.isArray(resources)) return false;
  const resourceEntries = Object.entries(resources as Record<string, unknown>);
  const policyEntries = Object.entries(policy.resources);
  if (resourceEntries.length !== policyEntries.length) return false;
  for (const [resource, amount] of policyEntries) {
    if ((resources as Record<string, unknown>)[resource] !== amount) return false;
  }
  if (record["costUnits"] !== policy.costUnits) return false;
  if (record["egressDelta"] !== (policy.egressDelta ?? 0)) return false;
  if (typeof record["expiresAt"] !== "number" || !Number.isInteger(record["expiresAt"]) || (record["expiresAt"] as number) < 0) return false;
  // Storage is caller-influenced for exactly the operations whose routes
  // measure bytes before reserving: b2Upload (browser-declared upload size)
  // and snapshotArtifactWrite (measured manifest size). Both accept any
  // nonnegative integer; everything else carries its catalog delta exactly.
  // Integers only — fractional bytes must never reach the ledger.
  if (typeof record["storageDelta"] !== "number" || !Number.isInteger(record["storageDelta"])) return false;
  if (record["operation"] === "b2Upload" || record["operation"] === "snapshotArtifactWrite") {
    if ((record["storageDelta"] as number) < 0) return false;
  } else if (record["storageDelta"] !== (policy.storageDelta ?? 0)) {
    return false;
  }
  return true;
}
function validState(value: AuthorityState | null): value is AuthorityState {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as unknown as Record<string, unknown>;
  // Exactly the five expected top-level keys: unknown keys indicate drift.
  if (Object.keys(record).length !== 5) return false;
  if (!(record["emergencyUntil"] === null || (typeof record["emergencyUntil"] === "number" && Number.isFinite(record["emergencyUntil"] as number)))) return false;
  for (const key of ["resources", "pools", "poolResources", "permits"] as const) {
    if (!record[key] || typeof record[key] !== "object" || Array.isArray(record[key])) return false;
  }
  if (!Object.keys(RESOURCE_POLICIES).every((key) => validCounter((record["resources"] as Record<string, unknown>)[key]))) return false;
  if (!Object.keys(POOL_POLICIES).every((key) => validCounter((record["pools"] as Record<string, unknown>)[key]))) return false;
  for (const pool of Object.keys(POOL_POLICIES) as Pool[]) {
    const poolResources = (record["poolResources"] as Record<string, Record<string, unknown>>)[pool];
    if (!poolResources || !Object.keys(RESOURCE_POLICIES).every((resource) => validCounter(poolResources[resource]))) return false;
  }
  for (const [permitId, permit] of Object.entries(record["permits"] as Record<string, unknown>)) {
    if (typeof permitId !== "string" || !permitId || !validPermit(permit)) return false;
  }
  for (const policy of Object.values(RESOURCE_POLICIES) as { limit: number; window: WindowKind }[]) {
    if (!["daily", "monthly", "persistent"].includes(policy.window)) return false;
  }
  return true;
}

export class BudgetAuthorityCore {
  private state: AuthorityState | null = null;
  constructor(private readonly persistence: BudgetPersistence | undefined, private readonly now: () => number = Date.now) {}

  private async save(state: AuthorityState): Promise<void> {
    if (!this.persistence) throw new BudgetFailure("PERSISTENCE_UNAVAILABLE");
    try { await this.persistence.save(state); } catch { throw new BudgetFailure("PERSISTENCE_UNAVAILABLE"); }
  }

  private releasePermit(state: AuthorityState, permit: Permit): void {
    for (const [resource, amount] of Object.entries(permit.resources) as [Resource, number][]) {
      state.resources[resource].reserved = Math.max(0, state.resources[resource].reserved - amount);
      state.poolResources[permit.pool][resource].reserved = Math.max(0, state.poolResources[permit.pool][resource].reserved - amount);
    }
    if (permit.storageDelta > 0) {
      state.resources.b2Bytes.reserved = Math.max(0, state.resources.b2Bytes.reserved - permit.storageDelta);
      state.poolResources[permit.pool].b2Bytes.reserved = Math.max(0, state.poolResources[permit.pool].b2Bytes.reserved - permit.storageDelta);
    }
    if (permit.egressDelta > 0) {
      state.resources.b2EgressBytes.reserved = Math.max(0, state.resources.b2EgressBytes.reserved - permit.egressDelta);
    }
    state.pools[permit.pool].reserved = Math.max(0, state.pools[permit.pool].reserved - permit.costUnits);
  }

  private async current(): Promise<AuthorityState> {
    if (!this.persistence) throw new BudgetFailure("PERSISTENCE_UNAVAILABLE");
    let loaded: AuthorityState | null;
    try { loaded = this.state ?? await this.persistence.load(); } catch { throw new BudgetFailure("PERSISTENCE_UNAVAILABLE"); }
    // Fail closed on corruption or schema drift: only a genuine null (fresh
    // deployment) initializes fresh state. Resetting malformed persisted
    // state to zero would silently forgive overspend.
    if (loaded !== null && !validState(loaded)) throw new BudgetFailure("PERSISTENCE_UNAVAILABLE");
    const state = loaded ?? freshState(this.now());
    const now = this.now();
    let changed = loaded === null;

    for (const [resource, policy] of Object.entries(RESOURCE_POLICIES) as [Resource, { limit: number; window: WindowKind }][]) {
      if (state.resources[resource].windowStartedAt !== budgetWindowStart(now, policy.window)) {
        state.resources[resource] = freshCounter(now, policy.window);
        for (const pool of Object.keys(POOL_POLICIES) as Pool[]) state.poolResources[pool][resource] = freshCounter(now, policy.window);
        changed = true;
      }
    }
    const resetPools = (Object.entries(POOL_POLICIES) as [Pool, { limit: number; window: WindowKind }][]).some(([pool, policy]) => state.pools[pool].windowStartedAt !== budgetWindowStart(now, policy.window));
    if (resetPools) {
      for (const permit of Object.values(state.permits)) this.releasePermit(state, permit);
      state.permits = {};
      for (const [pool, policy] of Object.entries(POOL_POLICIES) as [Pool, { limit: number; window: WindowKind }][]) state.pools[pool] = freshCounter(now, policy.window);
      changed = true;
    }
    for (const [permitId, permit] of Object.entries(state.permits)) {
      if (permit.expiresAt <= now) { this.releasePermit(state, permit); delete state.permits[permitId]; changed = true; }
    }
    if (state.emergencyUntil !== null && state.emergencyUntil <= now) { state.emergencyUntil = null; changed = true; }
    this.state = state;
    if (changed) await this.save(state);
    return state;
  }

  private checkCapacity(state: AuthorityState, pool: Pool, resource: Resource, amount: number): void {
    if (amount <= 0) return;
    const policy = RESOURCE_POLICIES[resource];
    const allowance = Math.floor(policy.limit * POOL_RESOURCE_ALLOCATIONS[pool]);
    if (state.resources[resource].reserved + state.resources[resource].committed + amount > policy.limit
      || state.poolResources[pool][resource].reserved + state.poolResources[pool][resource].committed + amount > allowance) {
      throw new BudgetFailure("EXCEEDED");
    }
  }

  async reserve(raw: unknown): Promise<{ permitId: string; expiresAt: string }> {
    const parsed = BudgetReserveRequest.safeParse(raw);
    if (!parsed.success) throw new BudgetFailure("MALFORMED");
    const state = await this.current();
    const policy = OPERATION_CATALOG[parsed.data.operation];
    if (!policy || state.permits[parsed.data.permitId]) throw new BudgetFailure("MALFORMED");
    // Declared byte counts are honored only where the route measures exact
    // bytes before reserving: b2Upload (browser-declared upload size,
    // pessimistic at ticket issuance) and snapshotArtifactWrite (measured
    // manifest bytes). Any other operation carrying declaredBytes is
    // malformed: byte accounting must come from the catalog alone.
    const allowsDeclared = parsed.data.operation === "b2Upload" || parsed.data.operation === "snapshotArtifactWrite";
    if (parsed.data.declaredBytes !== undefined && !allowsDeclared) throw new BudgetFailure("MALFORMED");
    const storage = allowsDeclared && parsed.data.declaredBytes !== undefined
      ? parsed.data.declaredBytes
      : (policy.storageDelta ?? 0);
    for (const [resource, amount] of Object.entries(policy.resources) as [Resource, number][]) this.checkCapacity(state, policy.pool, resource, amount);
    if (storage > 0) this.checkCapacity(state, policy.pool, "b2Bytes", storage);
    if (state.pools[policy.pool].reserved + state.pools[policy.pool].committed + policy.costUnits > POOL_POLICIES[policy.pool].limit) throw new BudgetFailure("EXCEEDED");
    const ttlSeconds = parsed.data.ttlSeconds ?? 30;
    const expiresAt = this.now() + ttlSeconds * 1000;
    for (const [resource, amount] of Object.entries(policy.resources) as [Resource, number][]) {
      state.resources[resource].reserved += amount;
      state.poolResources[policy.pool][resource].reserved += amount;
    }
    if (storage > 0) {
      state.resources.b2Bytes.reserved += storage;
      state.poolResources[policy.pool].b2Bytes.reserved += storage;
    }
    if ((policy.egressDelta ?? 0) > 0) {
      state.resources.b2EgressBytes.reserved += policy.egressDelta!;
    }
    state.pools[policy.pool].reserved += policy.costUnits;
    state.permits[parsed.data.permitId] = { operation: parsed.data.operation, pool: policy.pool, resources: policy.resources, storageDelta: storage, egressDelta: policy.egressDelta ?? 0, costUnits: policy.costUnits, expiresAt };
    await this.save(state);
    return { permitId: parsed.data.permitId, expiresAt: new Date(expiresAt).toISOString() };
  }

  async commit(raw: unknown): Promise<void> {
    const parsed = BudgetCommitRequest.safeParse(raw);
    if (!parsed.success) throw new BudgetFailure("MALFORMED");
    const state = await this.current();
    const permit = state.permits[parsed.data.permitId];
    if (!permit) throw new BudgetFailure("UNKNOWN_PERMIT");
    if (!parsed.data.providerCallStarted) { this.releasePermit(state, permit); delete state.permits[parsed.data.permitId]; await this.save(state); return; }
    if (permit.expiresAt <= this.now()) { this.releasePermit(state, permit); delete state.permits[parsed.data.permitId]; await this.save(state); throw new BudgetFailure("EXPIRED_PERMIT"); }
    for (const [resource, amount] of Object.entries(permit.resources) as [Resource, number][]) {
      state.resources[resource].reserved -= amount;
      state.poolResources[permit.pool][resource].reserved -= amount;
      state.resources[resource].committed += amount;
      state.poolResources[permit.pool][resource].committed += amount;
    }
    if (permit.storageDelta > 0) {
      state.resources.b2Bytes.reserved -= permit.storageDelta;
      state.poolResources[permit.pool].b2Bytes.reserved -= permit.storageDelta;
      state.resources.b2Bytes.committed += permit.storageDelta;
      state.poolResources[permit.pool].b2Bytes.committed += permit.storageDelta;
    } else if (permit.storageDelta < 0) {
      state.resources.b2Bytes.committed = Math.max(0, state.resources.b2Bytes.committed + permit.storageDelta);
      state.poolResources[permit.pool].b2Bytes.committed = Math.max(0, state.poolResources[permit.pool].b2Bytes.committed + permit.storageDelta);
    }
    if (permit.egressDelta > 0) {
      state.resources.b2EgressBytes.reserved = Math.max(0, state.resources.b2EgressBytes.reserved - permit.egressDelta);
      state.resources.b2EgressBytes.committed += permit.egressDelta;
    }
    state.pools[permit.pool].reserved -= permit.costUnits;
    state.pools[permit.pool].committed += permit.costUnits;
    delete state.permits[parsed.data.permitId];
    await this.save(state);
  }

  async release(raw: unknown): Promise<void> {
    const parsed = BudgetReleaseRequest.safeParse(raw);
    if (!parsed.success) throw new BudgetFailure("MALFORMED");
    const state = await this.current();
    const permit = state.permits[parsed.data.permitId];
    if (!permit) throw new BudgetFailure("UNKNOWN_PERMIT");
    this.releasePermit(state, permit);
    delete state.permits[parsed.data.permitId];
    await this.save(state);
  }

  /** Not reachable through the DO HTTP API. A future super-admin service must audit this call first. */
  async activateEmergency(command: { actorId: string; reason: string; expiresAt: number; auditId: string }): Promise<void> {
    if (!command.actorId || !command.reason || !command.auditId || !Number.isFinite(command.expiresAt) || command.expiresAt <= this.now()) throw new BudgetFailure("MALFORMED");
    const state = await this.current();
    state.emergencyUntil = command.expiresAt;
    await this.save(state);
  }

  async status(): Promise<AuthorityState> { return clone(await this.current()); }

  async resetCounters(): Promise<void> {
    const now = this.now();
    const fresh = freshState(now);
    this.state = fresh;
    await this.save(fresh);
  }
}

export function budgetErrorStatus(error: BudgetFailure): number {
  return error.reason === "PERSISTENCE_UNAVAILABLE" ? 503 : error.reason === "EXCEEDED" ? 429 : 400;
}
