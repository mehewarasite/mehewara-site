import { describe, expect, it } from "vitest";
import { BudgetAuthorityCore, BudgetFailure, POOL_POLICIES, OPERATION_CATALOG, type BudgetPersistence } from "../src/shared/budget-authority";

function authority() {
  let time = Date.parse("2026-01-02T12:00:00.000Z");
  const persistence: BudgetPersistence = { async load() { return null; }, async save() {} };
  return { budget: new BudgetAuthorityCore(persistence, () => time), advance: (ms: number) => { time += ms; } };
}

describe("BudgetAuthorityCore", () => {
  it("reserves, commits, and keeps resource and pool counters separate", async () => {
    const { budget } = authority();
    const permit = await budget.reserve({ permitId: "permit-0000000001", operation: "adminContentRead" });
    expect(permit.permitId).toBe("permit-0000000001");
    expect((await budget.status()).resources.d1Reads.reserved).toBeGreaterThan(0);
    await budget.commit({ permitId: permit.permitId, providerCallStarted: true });
    expect((await budget.status()).resources.d1Reads).toMatchObject({ reserved: 0, committed: 2 });
    expect((await budget.status()).pools.admin.committed).toBeGreaterThan(0);
  });

  it("fails closed for malformed, duplicate, unknown, and emergency permits", async () => {
    const { budget } = authority();
    await expect(budget.reserve({ permitId: "bad", operation: "adminContentRead" })).rejects.toThrow(BudgetFailure);
    await budget.reserve({ permitId: "permit-0000000002", operation: "adminContentRead" });
    await expect(budget.reserve({ permitId: "permit-0000000002", operation: "adminContentRead" })).rejects.toMatchObject({ reason: "MALFORMED" });
    await expect(budget.release({ permitId: "unknown-01" })).rejects.toMatchObject({ reason: "UNKNOWN_PERMIT" });
  });

  it("automatically resets daily counters and expires an internally activated emergency window", async () => {
    const { budget, advance } = authority();
    await budget.reserve({ permitId: "permit-0000000004", operation: "publicSnapshotRead" });
    await budget.activateEmergency({ actorId: "admin@example.test", reason: "test reserve", auditId: "audit-0000000001", expiresAt: Date.parse("2026-01-03T00:00:00.000Z") });
    advance(24 * 60 * 60 * 1000);
    const status = await budget.status();
    expect(status.emergencyUntil).toBeNull();
    expect(status.resources.d1Reads).toMatchObject({ reserved: 0, committed: 0 });
  });

  it("resets monthly b2ClassB at the UTC month boundary and keeps b2Bytes (persistent) and b2EgressBytes (persistent) untouched", async () => {
    let time = Date.parse("2026-01-31T23:59:59.000Z");
    const persistence: BudgetPersistence = { async load() { return null; }, async save() {} };
    const budget = new BudgetAuthorityCore(persistence, () => time);
    await budget.reserve({ permitId: "permit-2026-monthly-1", operation: "snapshotArtifactWrite" });
    await budget.commit({ permitId: "permit-2026-monthly-1", providerCallStarted: true });
    expect((await budget.status()).resources.b2ClassA.committed).toBeGreaterThan(0);
    expect((await budget.status()).resources.b2Bytes.committed).toBe(2_097_152);
    // A public read does not cross the month boundary but does contribute to
    // b2EgressBytes (persistent). Drive one before the boundary, then verify
    // b2EgressBytes survives the month reset.
    await budget.reserve({ permitId: "permit-2026-monthly-read", operation: "publicSnapshotRead" });
    await budget.commit({ permitId: "permit-2026-monthly-read", providerCallStarted: true });
    time = Date.parse("2026-02-01T00:00:01.000Z");
    const after = await budget.status();
    expect(after.resources.b2ClassA).toMatchObject({ reserved: 0, committed: 0 });
    expect(after.resources.b2Bytes.committed).toBe(2_097_152);
    expect(after.resources.b2EgressBytes.committed).toBeGreaterThan(0);
  });

  it("deducts b2Bytes on b2Delete commits", async () => {
    const { budget } = authority();
    await budget.reserve({ permitId: "permit-2026-upload", operation: "b2Upload" });
    await budget.commit({ permitId: "permit-2026-upload", providerCallStarted: true });
    expect((await budget.status()).resources.b2Bytes.committed).toBe(2_097_152);
    await budget.reserve({ permitId: "permit-2026-delete", operation: "b2Delete" });
    await budget.commit({ permitId: "permit-2026-delete", providerCallStarted: true });
    expect((await budget.status()).resources.b2Bytes.committed).toBe(0);
  });

  it("rejects reserves that would exceed a pool's resource allocation even when the global limit is not yet hit", async () => {
    let time = Date.parse("2026-01-02T12:00:00.000Z");
    // Pre-seed authority state with the admin pool at its policy limit
    const { budget: seed } = authority();
    const prefilled = await seed.status();
    prefilled.pools.admin.committed = POOL_POLICIES.admin.limit;

    const persistence: BudgetPersistence = {
      async load() { return prefilled; },
      async save() {}
    };
    const budget = new BudgetAuthorityCore(persistence, () => time);
    await expect(budget.reserve({ permitId: "permit-admin-cap-overflow", operation: "adminContentRead" })).rejects.toMatchObject({ reason: "EXCEEDED" });
    await expect(budget.reserve({ permitId: "permit-public-still-ok", operation: "publicSnapshotRead" })).resolves.toBeTruthy();
  });

  it("tracks b2EgressBytes as observability only and never rejects on egress overrun", async () => {
    // Drive b2EgressBytes to a level that would exceed any sane limit if it
    // were billed. The reserve and commit must still succeed.
    const { budget } = authority();
    for (let i = 0; i < 1_000; i += 1) {
      await budget.reserve({ permitId: `permit-egress-${i}`, operation: "publicSnapshotRead" });
      await budget.commit({ permitId: `permit-egress-${i}`, providerCallStarted: true });
    }
    const status = await budget.status();
    expect(status.resources.b2EgressBytes.committed).toBeGreaterThan(0);
    // The next reserve must not be rejected by an egress overrun.
    await expect(budget.reserve({ permitId: "permit-egress-next", operation: "publicSnapshotRead" })).resolves.toBeTruthy();
  });

  it("charges declared bytes for b2Upload and rejects declaredBytes on other operations", async () => {    const { budget } = authority();
    await budget.reserve({ permitId: "permit-declared-1", operation: "b2Upload", declaredBytes: 41_943_040 });
    await budget.commit({ permitId: "permit-declared-1", providerCallStarted: true });
    // Declared 40 MiB — not the catalog's 2 MiB estimate — lands in committed bytes.
    expect((await budget.status()).resources.b2Bytes.committed).toBe(41_943_040);
    // Declared bytes on any other operation is malformed: byte accounting
    // must come from the catalog alone.
    await expect(budget.reserve({ permitId: "permit-declared-2", operation: "adminContentRead", declaredBytes: 100 })).rejects.toMatchObject({ reason: "MALFORMED" });
  });

  it("fails closed instead of resetting malformed persisted state to zero", async () => {
    const corrupt: BudgetPersistence = {
      async load() { return { emergencyUntil: null, resources: {}, pools: {}, poolResources: {}, permits: {} } as never; },
      async save() {},
    };
    const budget = new BudgetAuthorityCore(corrupt);
    // Corruption or schema drift must surface as unavailable — never as a
    // fresh zeroed budget that would forgive overspend.
    await expect(budget.reserve({ permitId: "permit-corrupt-1", operation: "publicSnapshotRead" })).rejects.toMatchObject({ reason: "PERSISTENCE_UNAVAILABLE" });
    await expect(budget.status()).rejects.toMatchObject({ reason: "PERSISTENCE_UNAVAILABLE" });
  });

  it("rejects persisted counters and permits that fail strict validation", async () => {
    const { budget } = authority();
    // Seed a valid state through the public API, then corrupt the persisted copy.
    await budget.reserve({ permitId: "permit-strict-1", operation: "publicSnapshotRead" });
    const good = await budget.status();
    const tamperedVariants: ((state: typeof good) => unknown)[] = [
      // Negative committed usage would silently restore capacity.
      (state) => ({ ...state, resources: { ...state.resources, d1Reads: { ...state.resources.d1Reads, committed: -5 } } }),
      // Fractional counters are never produced by the core.
      (state) => ({ ...state, resources: { ...state.resources, d1Reads: { ...state.resources.d1Reads, reserved: 1.5 } } }),
      // Unknown operations must not ride along on stored permits.
      (state) => ({ ...state, permits: { ...state.permits, "permit-evil": { operation: "deleteEverything", pool: "public", resources: {}, storageDelta: 0, egressDelta: 0, costUnits: 0, expiresAt: Date.now() + 9999 } } }),
      // Unknown top-level keys indicate schema drift.
      (state) => ({ ...state, futureField: true }),
      // Omitted permit fields must not load partially…
      (state) => {
        const permits = structuredClone(state.permits) as unknown as Record<string, Record<string, unknown>>;
        const first = permits["permit-strict-1"] as Record<string, unknown>;
        if (first) delete first["costUnits"];
        return { ...state, permits };
      },
      // …nor may extra ones ride along.
      (state) => {
        const permits = structuredClone(state.permits) as unknown as Record<string, Record<string, unknown>>;
        const first = permits["permit-strict-1"] as Record<string, unknown>;
        if (first) first["smuggled"] = 1;
        return { ...state, permits };
      },
      // A permit naming another operation's pool would spend the wrong allowance.
      (state) => {
        const permits = structuredClone(state.permits) as unknown as Record<string, Record<string, unknown>>;
        const first = permits["permit-strict-1"] as Record<string, unknown>;
        if (first) first["pool"] = "publication";
        return { ...state, permits };
      },
      // Fractional storage deltas must never reach the ledger…
      (state) => {
        const permits = structuredClone(state.permits) as unknown as Record<string, Record<string, unknown>>;
        const first = permits["permit-strict-1"] as Record<string, unknown>;
        if (first) first["storageDelta"] = 0.5;
        return { ...state, permits };
      },
      // …nor may a permit carry another operation's cost.
      (state) => {
        const permits = structuredClone(state.permits) as unknown as Record<string, Record<string, unknown>>;
        const first = permits["permit-strict-1"] as Record<string, unknown>;
        if (first) first["costUnits"] = 999_999;
        return { ...state, permits };
      },
    ];
    for (const [index, tamper] of tamperedVariants.entries()) {
      const tampered: BudgetPersistence = {
        async load() { return tamper(structuredClone(good)) as never; },
        async save() {},
      };
      const tamperedBudget = new BudgetAuthorityCore(tampered);
      await expect(tamperedBudget.status(), `variant ${index} must fail closed`).rejects.toMatchObject({ reason: "PERSISTENCE_UNAVAILABLE" });
    }
  });

  it("reloads a declared-byte snapshotArtifactWrite permit without corrupting state", async () => {
    // Regression: validPermit once accepted dynamic storage for b2Upload
    // only, so the first artifact reservation poisoned every later load.
    let saved: unknown = null;
    const persistence: BudgetPersistence = {
      async load() { return saved as never; },
      async save(state) { saved = structuredClone(state); },
    };
    const writer = new BudgetAuthorityCore(persistence);
    await writer.reserve({ permitId: "permit-artifact-1", operation: "snapshotArtifactWrite", declaredBytes: 123_456 });
    expect(saved).not.toBeNull();
    const reader = new BudgetAuthorityCore(persistence);
    const status = await reader.status();
    expect(status.resources.b2Bytes.reserved).toBe(123_456);
    await reader.commit({ permitId: "permit-artifact-1", providerCallStarted: true });
    expect((await reader.status()).resources.b2Bytes.committed).toBe(123_456);
  });

  it("tracks unique live users via BudgetAuthority fetch /live and handles missing SQLite gracefully", async () => {
    const { BudgetAuthority } = await import("../src/durable-objects/budget-authority");
    const mockState = {
      storage: {}
    } as unknown as DurableObjectState;
    const authority = new BudgetAuthority(mockState);

    const res1 = await authority.fetch(new Request("https://budget.internal/live", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId: "client-a" }),
    }));
    const data1 = await res1.json() as any;
    expect(data1.count).toBe(1);

    const res2 = await authority.fetch(new Request("https://budget.internal/live", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId: "client-b" }),
    }));
    const data2 = await res2.json() as any;
    expect(data2.count).toBe(2);

    const res3 = await authority.fetch(new Request("https://budget.internal/live", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId: "client-a" }),
    }));
    const data3 = await res3.json() as any;
    expect(data3.count).toBe(2);
  });
});
