import { BudgetAuthorityCore, BudgetFailure, budgetErrorStatus, budgetWindowEnd, type BudgetPersistence, POOL_POLICIES, POOL_RESOURCE_ALLOCATIONS, RESOURCE_POLICIES, type Resource, type Pool } from "../shared/budget-authority";
import { errorResponse } from "../shared/errors";
import { BudgetStatus } from "@mehewara-v2/contracts";

export class BudgetAuthority implements DurableObject {
  private readonly core: BudgetAuthorityCore;
  constructor(private readonly ctx: DurableObjectState) {
    const persistence: BudgetPersistence = {
      async load() {
        const row = [...ctx.storage.sql.exec<{ state_json: string }>("SELECT state_json FROM budget_authority_state WHERE singleton = 1")][0];
        return row ? JSON.parse(row.state_json) : null;
      },
      async save(state) {
        ctx.storage.sql.exec("INSERT INTO budget_authority_state(singleton, state_json) VALUES(1, ?) ON CONFLICT(singleton) DO UPDATE SET state_json = excluded.state_json", JSON.stringify(state));
      }
    };
    ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS budget_authority_state (singleton INTEGER PRIMARY KEY CHECK(singleton = 1), state_json TEXT NOT NULL)");
    this.core = new BudgetAuthorityCore(persistence);
  }

  async fetch(request: Request): Promise<Response> {
    const requestId = request.headers.get("X-Request-ID") ?? crypto.randomUUID();
    try {
      if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
      let body: unknown;
      try { body = await request.json(); } catch { throw new BudgetFailure("MALFORMED"); }
      const path = new URL(request.url).pathname;
      if (path === "/reserve") return Response.json({ permit: await this.core.reserve(body) });
      if (path === "/commit") { await this.core.commit(body); return Response.json({ ok: true }); }
      if (path === "/release") { await this.core.release(body); return Response.json({ ok: true }); }
      if (path === "/emergency") { await this.core.activateEmergency(body as any); return Response.json({ ok: true }); }
      if (path === "/reset") {
        this.ctx.storage.sql.exec("DELETE FROM budget_authority_state");
        await this.core.resetCounters();
        return Response.json({ ok: true, message: "Budget authority counters reset" });
      }
      if (path === "/status") {
        const state = await this.core.status();
        const status = BudgetStatus.parse({
          emergencyUntil: state.emergencyUntil === null ? null : new Date(state.emergencyUntil).toISOString(),
          resources: Object.fromEntries((Object.keys(RESOURCE_POLICIES) as Resource[]).map((resource) => {
            const counter = state.resources[resource]; const policy = RESOURCE_POLICIES[resource];
            const windowEnd = budgetWindowEnd(counter.windowStartedAt, policy.window);
            return [resource, { ...counter, limit: policy.limit, window: policy.window, windowStartedAt: new Date(counter.windowStartedAt).toISOString(), windowEndsAt: windowEnd === null ? null : new Date(windowEnd).toISOString() }];
          })),
          pools: Object.fromEntries((Object.keys(POOL_POLICIES) as Pool[]).map((pool) => {
            const counter = state.pools[pool]; const policy = POOL_POLICIES[pool];
            const windowEnd = budgetWindowEnd(counter.windowStartedAt, policy.window);
            return [pool, { ...counter, limit: policy.limit, window: policy.window, windowStartedAt: new Date(counter.windowStartedAt).toISOString(), windowEndsAt: windowEnd === null ? null : new Date(windowEnd).toISOString() }];
          })),
          poolResourceAllocations: Object.fromEntries((Object.keys(POOL_POLICIES) as Pool[]).map((pool) => [pool, Object.fromEntries((Object.keys(RESOURCE_POLICIES) as Resource[]).map((resource) => {
            const counter = state.poolResources[pool][resource]; const policy = RESOURCE_POLICIES[resource];
            const windowEnd = budgetWindowEnd(counter.windowStartedAt, policy.window);
            return [resource, { ...counter, limit: Math.floor(policy.limit * POOL_RESOURCE_ALLOCATIONS[pool]), window: policy.window, windowStartedAt: new Date(counter.windowStartedAt).toISOString(), windowEndsAt: windowEnd === null ? null : new Date(windowEnd).toISOString() }];
          }))]))
        });
        return Response.json({ status });
      }
      return new Response("Not Found", { status: 404 });
    } catch (error) {
      if (error instanceof BudgetFailure) return Response.json({ error: { code: error.reason === "EXCEEDED" || error.reason === "EMERGENCY_REQUIRED" ? "BUDGET_EXCEEDED" : "BAD_REQUEST", message: "Budget request rejected", requestId } }, { status: budgetErrorStatus(error) });
      return errorResponse(error, requestId);
    }
  }
}
