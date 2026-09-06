import { describe, expect, it, beforeEach } from "vitest";
import type { B2Client } from "../src/storage/b2-client";
import type { BudgetGate, BudgetCapability, Operation } from "../src/middleware/budget-gate";
import type { FeatureContext } from "../src/env";
import type { UploadIntent, UploadIntentStore, NewUploadIntent } from "../src/features/media/uploads";
import { requireConfirmedObjectKey } from "../src/features/media/uploads";
import type { AccessVerifier } from "../src/shared/auth";
import { HttpError } from "../src/shared/errors";
import { signedUploadHttpRoute, confirmUploadHttpRoute, mediaStreamRoute, stagingKey } from "../src/features/media/route";

const BYTES = new TextEncoder().encode("hello-mehewara-upload");

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as unknown as ArrayBuffer);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function streamOf(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream({ start(c) { c.enqueue(bytes); c.close(); } });
}

function fakeB2() {
  const objects = new Map<string, { bytes: Uint8Array; contentType: string }>();
  const calls: { head: number; get: number; delete: number; ticket: number; copy: number; putObject: number } = { head: 0, get: 0, delete: 0, ticket: 0, copy: 0, putObject: 0 };
  const signals: unknown[] = [];
  let notifyHeadStarted: (() => void) | null = null;
  let unblockHead: (() => void) | null = null;
  const client: B2Client = {
    async headObject(key, opts?: { signal?: AbortSignal }) {
      signals.push(opts?.signal);
      calls.head += 1;
      if (notifyHeadStarted) {
        const notify = notifyHeadStarted;
        notifyHeadStarted = null;
        const gate = new Promise<void>((resolve) => { unblockHead = resolve; });
        notify();
        await gate;
      }
      const found = objects.get(key);
      return found ? { contentLength: found.bytes.byteLength, contentType: found.contentType, etag: '"fake-etag"' } : null;
    },
    async getObjectWithMetadata(key, _ifNoneMatch, _opts?: { signal?: AbortSignal }) {
      calls.get += 1;
      const found = objects.get(key);
      if (!found) return null;
      return { status: 200 as const, body: streamOf(found.bytes), contentLength: found.bytes.byteLength, contentType: found.contentType, etag: '"fake-etag"' };
    },
    async streamGetObject(key, opts?: { signal?: AbortSignal }) {
      signals.push(opts?.signal);
      calls.get += 1;
      const found = objects.get(key);
      if (!found) return null;
      return { body: streamOf(found.bytes), contentLength: found.bytes.byteLength, contentType: found.contentType, etag: '"fake-etag"' };
    },
    async signedUploadTicket(key, contentType, maxByteSize, expiresInSeconds) {
      calls.ticket += 1;
      return { url: `https://b2.test/${key}?sig=fake`, objectKey: key, headers: { "Content-Type": contentType }, expiresAt: new Date(Date.now() + expiresInSeconds * 1000).toISOString(), maxByteSize };
    },
    async deleteObject(key, opts?: { signal?: AbortSignal }) { signals.push(opts?.signal); calls.delete += 1; objects.delete(key); },
    async copyObject(sourceKey, destKey, opts?: { signal?: AbortSignal }) {
      signals.push(opts?.signal);
      calls.copy += 1;
      const found = objects.get(sourceKey);
      if (!found) throw new HttpError("NOT_FOUND", 404, "copy source missing");
      objects.set(destKey, { bytes: found.bytes.slice(), contentType: found.contentType });
    },
    async putObject(key: string, body: Uint8Array, contentType: string) {
      calls.putObject += 1;
      objects.set(key, { bytes: body.slice(), contentType });
      return { etag: '"fake-put-etag"' };
    },
    async inventory() { return []; },
  };
  return {
    client, objects, calls, signals,
    holdNextHead() {
      const started = new Promise<void>((resolve) => { notifyHeadStarted = resolve; });
      return { started, release() { unblockHead?.(); unblockHead = null; } };
    },
  };
}

function fakeGate() {
  const reserves: { operation: Operation; declaredBytes?: number; ttlSeconds?: number }[] = [];
  const permitOps = new Map<string, Operation>();
  let commits = 0;
  let releases = 0;
  let failReserveAt: number | null = null;
  let failNextCommit = false;
  let failCommitOp: Operation | null = null;
  let reserveCalls = 0;
  const gate: BudgetGate = {
    async reserve(operation: Operation, opts?: { declaredBytes?: number; ttlSeconds?: number }) {
      reserveCalls += 1;
      if (failReserveAt !== null && reserveCalls >= failReserveAt) {
        failReserveAt = null;
        throw new HttpError("BUDGET_EXCEEDED", 429, "budget exhausted");
      }
      reserves.push({ operation, declaredBytes: opts?.declaredBytes, ttlSeconds: opts?.ttlSeconds });
      const permitId = `permit-${reserves.length}`;
      permitOps.set(permitId, operation);
      let started = false;
      const capability: BudgetCapability = {
        permitId, expiresAt: new Date(Date.now() + 30_000).toISOString(),
        get providerCallStarted() { return started; }, markProviderCallStarted() { started = true; },
      };
      return capability;
    },
    async commit(permit: BudgetCapability) {
      if (failNextCommit || (failCommitOp !== null && permitOps.get(permit.permitId) === failCommitOp)) {
        failNextCommit = false;
        failCommitOp = null;
        throw new HttpError("INTERNAL_ERROR", 503, "commit failed");
      }
      commits += 1;
    },
    async release() { releases += 1; },
  };
  return { gate, reserves, failNextReserve(error: HttpError) { void error; failReserveAt = reserveCalls + 1; }, failReserveOnCall(n: number) { failReserveAt = n; }, failCommitOnce() { failNextCommit = true; }, failCommitFor(op: Operation) { failCommitOp = op; }, counts: { get commits() { return commits; }, get releases() { return releases; } } };
}

/** Race hook consumed by the next failIfTicketed call: simulates a
 *  concurrent claim winning first. Module-scoped and single-shot. */
let failHook: (() => void) | null = null;

function fakeIntents() {
  const byId = new Map<string, UploadIntent>();
  // D1 operation accounting mirror: each method records the reads/writes
  // the real D1 implementation performs (single-statement RETURNING forms
  // cost exactly one write and zero reads), so tests can assert worst-case
  // flows stay within their permit's catalog reservation.
  const d1 = { reads: 0, writes: 0 };
  // Single source of truth (mirrors D1): the key lookup scans the one map,
  // so tests cannot diverge indexes the way two maps could.
  const byKey = (key: string): UploadIntent | null =>
    [...byId.values()].find((i) => i.idempotencyKey === key) ?? null;
  let claimCounter = 0;
  const store: UploadIntentStore = {
    async create(input: NewUploadIntent): Promise<UploadIntent> {
      if (byKey(input.idempotencyKey)) throw new HttpError("CONFLICT", 409, "duplicate");
      const intent: UploadIntent = { ...input, status: "ticketed", budgetCommitted: false, actualByteSize: null, claimedAt: null, claimToken: null, createdAt: new Date().toISOString(), confirmedAt: null };
      d1.writes += 1; // INSERT ... RETURNING
      byId.set(intent.id, intent);
      return intent;
    },
    async getById(id) { d1.reads += 1; return byId.get(id) ?? null; },
    async getByIdempotencyKey(key) { d1.reads += 1; return byKey(key); },
    async getConfirmedByObjectKey(objectKey) {
      d1.reads += 1;
      const found = [...byId.values()].find((i) => i.objectKey === objectKey && i.status === "confirmed");
      return found ?? null;
    },
    async getConfirmedByObjectKeys(objectKeys: string[]) {
      d1.reads += 1;
      const found = new Map();
      for (const intent of byId.values()) {
        if (intent.status === "confirmed" && objectKeys.includes(intent.objectKey)) found.set(intent.objectKey, intent);
      }
      return found;
    },
    async setBudgetCommitted(id) {
      const current = byId.get(id);
      if (!current) throw new HttpError("INTERNAL_ERROR", 500, "missing");
      d1.writes += 1; // UPDATE ... RETURNING
      const updated: UploadIntent = { ...current, budgetCommitted: true };
      byId.set(id, updated);
      return updated;
    },
    async claimForVerification(id, staleCutoffIso) {
      const current = byId.get(id);
      if (!current) return null;
      const stale = current.status === "verifying" && current.claimedAt !== null && current.claimedAt < staleCutoffIso;
      if (current.status !== "ticketed" && !stale) return null;
      claimCounter += 1;
      d1.writes += 1; // UPDATE ... RETURNING
      const updated: UploadIntent = { ...current, status: "verifying", claimedAt: new Date().toISOString(), claimToken: `claim-token-${claimCounter}` };
      byId.set(id, updated);
      return updated;
    },
    async markConfirmed(claimed: Pick<UploadIntent, "id" | "claimToken">, actualByteSize: number) {
      const current = byId.get(claimed.id);
      if (!current) throw new HttpError("INTERNAL_ERROR", 500, "missing");
      if (current.status !== "verifying" || current.claimToken === null || current.claimToken !== claimed.claimToken) {
        return { transitioned: false as const, row: current };
      }
      d1.writes += 1; // UPDATE ... RETURNING
      const updated: UploadIntent = { ...current, status: "confirmed", actualByteSize, confirmedAt: new Date().toISOString() };
      byId.set(claimed.id, updated);
      return { transitioned: true as const, row: updated };
    },
    async markFailed(claimed: Pick<UploadIntent, "id" | "claimToken">) {
      const current = byId.get(claimed.id);
      if (!current) throw new HttpError("INTERNAL_ERROR", 500, "missing");
      if (current.status !== "verifying" || current.claimToken === null || current.claimToken !== claimed.claimToken) {
        return { transitioned: false as const, row: current };
      }
      d1.writes += 1; // UPDATE ... RETURNING
      const updated: UploadIntent = { ...current, status: "failed" };
      byId.set(claimed.id, updated);
      return { transitioned: true as const, row: updated };
    },
    async failIfTicketed(id) {
      if (failHook) { const hook = failHook; failHook = null; hook(); }
      const current = byId.get(id);
      if (!current) return null;
      if (current.status !== "ticketed") return null;
      d1.writes += 1; // UPDATE ... RETURNING
      const updated: UploadIntent = { ...current, status: "failed" };
      byId.set(id, updated);
      return updated;
    },
  };
  return {
    store, byId, d1,
    /** Run `mutator` inside the next failIfTicketed call, before it reads —
     *  simulates a concurrent claim winning the race. */
    armFailRace(mutator: () => void) { failHook = mutator; },
  };
}

const adminVerifier: AccessVerifier = {
  async verify() { return { subject: "admin-1", roles: ["admin"] as const }; },
};

function harness() {
  const b2 = fakeB2();
  const gate = fakeGate();
  const intents = fakeIntents();
  const inventoryRows = new Map<string, { sha256: string; byteSize: number; contentType: string }>();
  const inventory = {
    async getByObjectKey(objectKey: string) { return inventoryRows.get(objectKey) ?? null; },
    async getManyByObjectKeys(objectKeys: string[]) {
      return new Map([...inventoryRows.entries()].filter(([key]) => objectKeys.includes(key)));
    },
  };
  const entries = new Map<string, Response>();
  const edgeCalls = { match: 0, put: 0 };
  const edgeCache = {
    async match(request: Request): Promise<Response | undefined> {
      edgeCalls.match += 1;
      const hit = entries.get(request.url);
      return hit ? hit.clone() : undefined;
    },
    async put(request: Request, response: Response): Promise<void> {
      edgeCalls.put += 1;
      entries.set(request.url, response.clone());
    },
  };
  const context = {
    requestId: "req-test-1", environment: "test",
    access: { issuer: "https://team.test", audience: "mehewara-test" },
    gate: gate.gate, uploads: intents.store, inventory,
  } as unknown as FeatureContext;
  return { ...b2, ...gate, ...intents, context, edgeCache, edgeCalls, inventoryRows };
}

function ticketRequest(body: unknown, key = "idem-key-0001"): Request {
  return new Request("https://api.test/api/v1/media/upload-ticket", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": key },
    body: JSON.stringify(body),
  });
}

function confirmRequest(body: unknown, key = "idem-key-0002"): Request {
  return new Request("https://api.test/api/v1/media/upload-confirm", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": key },
    body: JSON.stringify(body),
  });
}

describe("media upload ticket + confirm", () => {
  let sha: string;
  beforeEach(async () => { sha = await sha256Hex(BYTES); });

  it("issues a 202 ticket to a staging key, stores the intent, and charges declared bytes", async () => {
    const h = harness();
    const res = await signedUploadHttpRoute(
      ticketRequest({ objectKeyPrefix: "gallery/sunset", contentType: "image/jpeg", byteSize: BYTES.byteLength, sha256: sha, expiresInSeconds: 300 }),
      { b2: h.client, context: h.context, verifier: adminVerifier }
    );
    expect(res.status).toBe(202);
    const body = await res.json() as { intentId: string; objectKey: string };
    expect(body.intentId).toMatch(/^[0-9a-f-]{36}$/);
    // The ticket target is the staging key; the final key is never client-writable.
    expect(body.objectKey).toBe(`staging/${body.intentId}`);
    expect(h.reserves).toHaveLength(2);
    expect(h.reserves[0]).toMatchObject({ operation: "mediaIntentLookup" });
    expect(h.reserves[1]).toMatchObject({ operation: "b2Upload", declaredBytes: BYTES.byteLength });
    const stored = await h.store.getById(body.intentId);
    expect(stored?.status).toBe("ticketed");
    expect(stored?.budgetCommitted).toBe(true);
    expect(stored?.objectKey).toBe(`gallery/sunset/${body.intentId}`);
    expect(stored?.sha256).toBe(sha);
    // Worst-case D1 for issuance (create + flag + single-authority signing
    // read) fits the b2Upload reservation of 3 reads / 3 writes.
    expect(h.d1.reads).toBeLessThanOrEqual(3);
    expect(h.d1.writes).toBeLessThanOrEqual(3);
  });

  it("replays the same idempotency key without a second budget charge", async () => {
    const h = harness();
    const payload = { objectKeyPrefix: "gallery/sunset", contentType: "image/jpeg", byteSize: BYTES.byteLength, sha256: sha, expiresInSeconds: 300 };
    const first = await (await signedUploadHttpRoute(ticketRequest(payload), { b2: h.client, context: h.context, verifier: adminVerifier })).json() as { intentId: string };
    const second = await signedUploadHttpRoute(ticketRequest(payload), { b2: h.client, context: h.context, verifier: adminVerifier });
    expect(second.status).toBe(200);
    expect(((await second.json()) as { intentId: string }).intentId).toBe(first.intentId);
    expect(h.reserves).toHaveLength(3);
    expect(h.reserves[2]).toMatchObject({ operation: "mediaIntentLookup" });
  });

  it("charges an unpaid replay instead of assuming the crashed attempt paid", async () => {
    const h = harness();
    // Simulate a crash between intent insert and budget commit.
    const created = await h.store.create({
      id: "11111111-2222-4333-8444-555555555555", idempotencyKey: "idem-key-0009",
      objectKey: "gallery/crash/11111111-2222-4333-8444-555555555555", contentType: "image/jpeg",
      declaredByteSize: BYTES.byteLength, sha256: sha, ticketExpiresAt: new Date(Date.now() + 300_000).toISOString(),
    });
    expect(created.budgetCommitted).toBe(false);
    const res = await signedUploadHttpRoute(
      ticketRequest({ objectKeyPrefix: "gallery/crash", contentType: "image/jpeg", byteSize: BYTES.byteLength, sha256: sha, expiresInSeconds: 300 }, "idem-key-0009"),
      { b2: h.client, context: h.context, verifier: adminVerifier }
    );
    expect(res.status).toBe(200);
    expect(h.reserves).toHaveLength(2);
    expect(h.reserves[0]).toMatchObject({ operation: "mediaIntentLookup" });
    expect(h.reserves[1]).toMatchObject({ operation: "b2Upload", declaredBytes: BYTES.byteLength });
    expect((await h.store.getById(created.id))?.budgetCommitted).toBe(true);
  });

  it("confirms a matching upload, promotes staging→final, and is idempotent on re-confirm", async () => {
    const h = harness();
    const ticket = await (await signedUploadHttpRoute(
      ticketRequest({ objectKeyPrefix: "study/notes", contentType: "image/png", byteSize: BYTES.byteLength, sha256: sha, expiresInSeconds: 300 }, "idem-key-0010"),
      { b2: h.client, context: h.context, verifier: adminVerifier }
    )).json() as { intentId: string; objectKey: string };
    // Simulate the browser PUT to the staging key.
    h.objects.set(ticket.objectKey, { bytes: BYTES, contentType: "image/png" });
    const headsBefore = h.calls.head;
    const reservesBefore = h.reserves.length;
    const d1ReadsBefore = h.d1.reads;
    const d1WritesBefore = h.d1.writes;
    const res = await confirmUploadHttpRoute(confirmRequest({ intentId: ticket.intentId }, "idem-key-0011"), { b2: h.client, context: h.context, verifier: adminVerifier });
    expect(res.status).toBe(200);
    const finalKey = `study/notes/${ticket.intentId}`;
    expect(await res.json()).toMatchObject({ intentId: ticket.intentId, objectKey: finalKey, byteSize: BYTES.byteLength, sha256: sha, status: "confirmed" });
    // Promote happened server-side: final exists, staging is gone.
    expect(h.objects.has(finalKey)).toBe(true);
    expect(h.objects.has(ticket.objectKey)).toBe(false);
    // Worst-case D1 for a confirming run (claim + ownership read +
    // terminal flip) fits the mediaUploadConfirm reservation of 2/2.
    expect(h.d1.reads - d1ReadsBefore).toBeLessThanOrEqual(2);
    expect(h.d1.writes - d1WritesBefore).toBeLessThanOrEqual(2);
    // Every provider call in the confirm sequence carried the absolute
    // deadline signal (shorter than the 300s permit TTL).
    expect(h.signals.length).toBeGreaterThan(0);
    for (const signal of h.signals) expect(signal).toBeInstanceOf(AbortSignal);
    expect(h.reserves[reservesBefore]).toMatchObject({ operation: "mediaIntentLookup" });
    expect(h.reserves[reservesBefore + 1]).toMatchObject({ operation: "mediaUploadConfirm" });
    const again = await confirmUploadHttpRoute(confirmRequest({ intentId: ticket.intentId }, "idem-key-0012"), { b2: h.client, context: h.context, verifier: adminVerifier });
    expect(again.status).toBe(200);
    // Re-confirm is served from the terminal intent state: no extra B2 calls,
    // one cheap lookup permit.
    expect(h.calls.head).toBe(headsBefore + 1);
    expect(h.reserves).toHaveLength(reservesBefore + 3);
  });

  it("rejects a size mismatch with 422, deletes staging, never creates the final key", async () => {
    const h = harness();
    const ticket = await (await signedUploadHttpRoute(
      ticketRequest({ objectKeyPrefix: "gallery/big", contentType: "image/jpeg", byteSize: 999, sha256: sha, expiresInSeconds: 300 }, "idem-key-0020"),
      { b2: h.client, context: h.context, verifier: adminVerifier }
    )).json() as { intentId: string; objectKey: string };
    h.objects.set(ticket.objectKey, { bytes: BYTES, contentType: "image/jpeg" });
    const res = await confirmUploadHttpRoute(confirmRequest({ intentId: ticket.intentId }, "idem-key-0021"), { b2: h.client, context: h.context, verifier: adminVerifier });
    expect(res.status).toBe(422);
    expect(h.objects.has(ticket.objectKey)).toBe(false);
    expect(h.objects.has(`gallery/big/${ticket.intentId}`)).toBe(false);
    expect((await h.store.getById(ticket.intentId))?.status).toBe("failed");
  });

  it("rejects a checksum mismatch with 422, deletes staging, never creates the final key", async () => {
    const h = harness();
    const other = await sha256Hex(new TextEncoder().encode("different-bytes"));
    const ticket = await (await signedUploadHttpRoute(
      ticketRequest({ objectKeyPrefix: "gallery/evil", contentType: "image/jpeg", byteSize: BYTES.byteLength, sha256: other, expiresInSeconds: 300 }, "idem-key-0030"),
      { b2: h.client, context: h.context, verifier: adminVerifier }
    )).json() as { intentId: string; objectKey: string };
    h.objects.set(ticket.objectKey, { bytes: BYTES, contentType: "image/jpeg" });
    const res = await confirmUploadHttpRoute(confirmRequest({ intentId: ticket.intentId }, "idem-key-0031"), { b2: h.client, context: h.context, verifier: adminVerifier });
    expect(res.status).toBe(422);
    expect(h.objects.has(ticket.objectKey)).toBe(false);
    expect(h.objects.has(`gallery/evil/${ticket.intentId}`)).toBe(false);
    expect((await h.store.getById(ticket.intentId))?.status).toBe("failed");
  });

  it("returns 404 and fails the intent when nothing was uploaded", async () => {
    const h = harness();
    const ticket = await (await signedUploadHttpRoute(
      ticketRequest({ objectKeyPrefix: "gallery/ghost", contentType: "image/jpeg", byteSize: BYTES.byteLength, sha256: sha, expiresInSeconds: 300 }, "idem-key-0040"),
      { b2: h.client, context: h.context, verifier: adminVerifier }
    )).json() as { intentId: string };
    const res = await confirmUploadHttpRoute(confirmRequest({ intentId: ticket.intentId }, "idem-key-0041"), { b2: h.client, context: h.context, verifier: adminVerifier });
    expect(res.status).toBe(404);
    expect((await h.store.getById(ticket.intentId))?.status).toBe("failed");
  });

  it("returns 409 without touching B2 when another request already claimed verification", async () => {
    const h = harness();
    const ticket = await (await signedUploadHttpRoute(
      ticketRequest({ objectKeyPrefix: "gallery/race", contentType: "image/jpeg", byteSize: BYTES.byteLength, sha256: sha, expiresInSeconds: 300 }, "idem-key-0050"),
      { b2: h.client, context: h.context, verifier: adminVerifier }
    )).json() as { intentId: string; objectKey: string };
    h.objects.set(ticket.objectKey, { bytes: BYTES, contentType: "image/jpeg" });
    // Another worker claimed the intent first.
    expect(await h.store.claimForVerification(ticket.intentId, new Date().toISOString())).not.toBeNull();
    const headsBefore = h.calls.head;
    const reservesBefore = h.reserves.length;
    const res = await confirmUploadHttpRoute(confirmRequest({ intentId: ticket.intentId }, "idem-key-0051"), { b2: h.client, context: h.context, verifier: adminVerifier });
    expect(res.status).toBe(409);
    expect(h.calls.head).toBe(headsBefore);
    // The entry lookup permit is the only cost: no B2, no verify permit.
    expect(h.reserves).toHaveLength(reservesBefore + 1);
    expect(h.reserves[reservesBefore]).toMatchObject({ operation: "mediaIntentLookup" });
  });

  it("never serves staging keys through the public read path", async () => {
    const h = harness();
    h.objects.set("staging/some-intent", { bytes: BYTES, contentType: "image/jpeg" });
    const req = new Request("https://api.test/api/v1/media/staging/some-intent", { method: "GET" });
    await expect(mediaStreamRoute(req, { b2: h.client, objectKey: "staging/some-intent", context: h.context })).rejects.toMatchObject({ status: 404 });
    expect(h.calls.head).toBe(0);
    expect(h.calls.get).toBe(0);
  });

  it("requireConfirmedObjectKey resolves confirmed uploads and rejects anything else", async () => {
    const h = harness();
    const ticket = await (await signedUploadHttpRoute(
      ticketRequest({ objectKeyPrefix: "gallery/guard", contentType: "image/jpeg", byteSize: BYTES.byteLength, sha256: sha, expiresInSeconds: 300 }, "idem-key-0060"),
      { b2: h.client, context: h.context, verifier: adminVerifier }
    )).json() as { intentId: string; objectKey: string };
    const finalKey = `gallery/guard/${ticket.intentId}`;
    await expect(requireConfirmedObjectKey(h.store, finalKey)).rejects.toMatchObject({ status: 409 });
    h.objects.set(ticket.objectKey, { bytes: BYTES, contentType: "image/jpeg" });
    await confirmUploadHttpRoute(confirmRequest({ intentId: ticket.intentId }, "idem-key-0061"), { b2: h.client, context: h.context, verifier: adminVerifier });
    const resolved = await requireConfirmedObjectKey(h.store, finalKey);
    expect(resolved.id).toBe(ticket.intentId);
    await expect(requireConfirmedObjectKey(h.store, "gallery/guard/no-such-object")).rejects.toMatchObject({ status: 409 });
  });

  it("reclaims a stale verifying claim instead of wedging at 409", async () => {
    const h = harness();
    const ticket = await (await signedUploadHttpRoute(
      ticketRequest({ objectKeyPrefix: "gallery/stale", contentType: "image/jpeg", byteSize: BYTES.byteLength, sha256: sha, expiresInSeconds: 300 }, "idem-key-0070"),
      { b2: h.client, context: h.context, verifier: adminVerifier }
    )).json() as { intentId: string; objectKey: string };
    h.objects.set(ticket.objectKey, { bytes: BYTES, contentType: "image/jpeg" });
    // A dead worker claimed an hour ago.
    const claimed = await h.store.claimForVerification(ticket.intentId, new Date().toISOString());
    expect(claimed?.status).toBe("verifying");
    const stale = h.byId.get(ticket.intentId)!;
    h.byId.set(ticket.intentId, { ...stale, claimedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString() });
    const res = await confirmUploadHttpRoute(confirmRequest({ intentId: ticket.intentId }, "idem-key-0071"), { b2: h.client, context: h.context, verifier: adminVerifier });
    expect(res.status).toBe(200);
    expect((await res.json() as { status: string }).status).toBe("confirmed");
    expect(h.objects.has(`gallery/stale/${ticket.intentId}`)).toBe(true);
  });

  it("resumes a confirm whose worker crashed after promoting", async () => {
    const h = harness();
    const ticket = await (await signedUploadHttpRoute(
      ticketRequest({ objectKeyPrefix: "gallery/resume", contentType: "image/jpeg", byteSize: BYTES.byteLength, sha256: sha, expiresInSeconds: 300 }, "idem-key-0080"),
      { b2: h.client, context: h.context, verifier: adminVerifier }
    )).json() as { intentId: string; objectKey: string };
    // Crash state: staging already promoted and cleaned, intent still verifying
    // from over 15 minutes ago, so the lease allows reclaiming.
    h.objects.set(`gallery/resume/${ticket.intentId}`, { bytes: BYTES, contentType: "image/jpeg" });
    await h.store.claimForVerification(ticket.intentId, new Date().toISOString());
    const crashed = h.byId.get(ticket.intentId)!;
    h.byId.set(ticket.intentId, { ...crashed, claimedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString() });
    const res = await confirmUploadHttpRoute(confirmRequest({ intentId: ticket.intentId }, "idem-key-0081"), { b2: h.client, context: h.context, verifier: adminVerifier });
    expect(res.status).toBe(200);
    expect((await res.json() as { status: string }).status).toBe("confirmed");
  });

  it("refuses dynamic-namespace reads for unconfirmed uploads, serves confirmed ones", async () => {
    const h = harness();
    const ticket = await (await signedUploadHttpRoute(
      ticketRequest({ objectKeyPrefix: "gallery/gated", contentType: "image/jpeg", byteSize: BYTES.byteLength, sha256: sha, expiresInSeconds: 300 }, "idem-key-0090"),
      { b2: h.client, context: h.context, verifier: adminVerifier }
    )).json() as { intentId: string; objectKey: string };
    const finalKey = `gallery/gated/${ticket.intentId}`;
    // Bytes exist under the final key (e.g. written out of band) but the
    // intent never confirmed: unreadable, and no B2 call is spent.
    h.objects.set(finalKey, { bytes: BYTES, contentType: "image/jpeg" });
    const blocked = new Request(`https://api.test/api/v1/media/${finalKey}`, { method: "GET" });
    const headsBefore = h.calls.head;
    const commitsBefore = h.counts.commits;
    const releasesBefore = h.counts.releases;
    await expect(mediaStreamRoute(blocked, { b2: h.client, objectKey: finalKey, context: h.context })).rejects.toMatchObject({ status: 404 });
    expect(h.calls.head).toBe(headsBefore);
    // The mark precedes the confirmation lookup so the consumed D1 read is
    // committed, never silently unaccounted. Over-accounting a rejected
    // probe is the safe direction — and it prices key enumeration.
    expect(h.counts.commits).toBe(commitsBefore + 1);
    expect(h.counts.releases).toBe(releasesBefore);
    // After confirmation the same key streams normally.
    h.objects.set(ticket.objectKey, { bytes: BYTES, contentType: "image/jpeg" });
    await confirmUploadHttpRoute(confirmRequest({ intentId: ticket.intentId }, "idem-key-0091"), { b2: h.client, context: h.context, verifier: adminVerifier });
    const allowed = new Request(`https://api.test/api/v1/media/${finalKey}`, { method: "GET" });
    const res = await mediaStreamRoute(allowed, { b2: h.client, objectKey: finalKey, context: h.context });
    expect(res.status).toBe(200);
  });

  it("never wedges an intent when the confirm permit cannot be reserved", async () => {
    const h = harness();
    const ticket = await (await signedUploadHttpRoute(
      ticketRequest({ objectKeyPrefix: "gallery/nopermit", contentType: "image/jpeg", byteSize: BYTES.byteLength, sha256: sha, expiresInSeconds: 300 }, "idem-key-0100"),
      { b2: h.client, context: h.context, verifier: adminVerifier }
    )).json() as { intentId: string; objectKey: string };
    h.objects.set(ticket.objectKey, { bytes: BYTES, contentType: "image/jpeg" });
    h.failNextReserve(new HttpError("BUDGET_EXCEEDED", 429, "budget exhausted"));
    await expect(confirmUploadHttpRoute(confirmRequest({ intentId: ticket.intentId }, "idem-key-0101"), { b2: h.client, context: h.context, verifier: adminVerifier })).rejects.toMatchObject({ status: 429 });
    // Reservation failed before any claim: the intent is still ticketed and
    // retryable, with zero B2 calls spent.
    const current = await h.store.getById(ticket.intentId);
    expect(current?.status).toBe("ticketed");
    expect(current?.claimedAt).toBeNull();
    expect(h.calls.head).toBe(0);
  });

  it("leaves an actively verifying intent alone when its ticket expired", async () => {
    const h = harness();
    const ticket = await (await signedUploadHttpRoute(
      ticketRequest({ objectKeyPrefix: "gallery/expiry", contentType: "image/jpeg", byteSize: BYTES.byteLength, sha256: sha, expiresInSeconds: 300 }, "idem-key-0110"),
      { b2: h.client, context: h.context, verifier: adminVerifier }
    )).json() as { intentId: string };
    await h.store.claimForVerification(ticket.intentId, new Date().toISOString());
    // Expire the ticket while verification is live.
    const live = h.byId.get(ticket.intentId)!;
    h.byId.set(ticket.intentId, { ...live, ticketExpiresAt: new Date(Date.now() - 1000).toISOString() });
    const reservesBefore = h.reserves.length;
    const res = await confirmUploadHttpRoute(confirmRequest({ intentId: ticket.intentId }, "idem-key-0111"), { b2: h.client, context: h.context, verifier: adminVerifier });
    expect(res.status).toBe(409);
    expect((await h.store.getById(ticket.intentId))?.status).toBe("verifying");
    // Only the cheap entry-lookup permit: the live claim is never touched.
    expect(h.reserves).toHaveLength(reservesBefore + 1);
    expect(h.reserves[reservesBefore]).toMatchObject({ operation: "mediaIntentLookup" });
    expect(h.calls.head).toBe(0);
  });

  it("a superseded verifier neither copies nor deletes the winner's object", async () => {
    const h = harness();
    const ticket = await (await signedUploadHttpRoute(
      ticketRequest({ objectKeyPrefix: "gallery/fence", contentType: "image/jpeg", byteSize: BYTES.byteLength, sha256: sha, expiresInSeconds: 300 }, "idem-key-0120"),
      { b2: h.client, context: h.context, verifier: adminVerifier }
    )).json() as { intentId: string; objectKey: string };
    h.objects.set(ticket.objectKey, { bytes: BYTES, contentType: "image/jpeg" });
    const hold = h.holdNextHead();
    const pending = confirmUploadHttpRoute(confirmRequest({ intentId: ticket.intentId }, "idem-key-0121"), { b2: h.client, context: h.context, verifier: adminVerifier });
    await hold.started;
    // While A is blocked inside HEAD, its claim goes stale and B reclaims it.
    const aged = h.byId.get(ticket.intentId)!;
    h.byId.set(ticket.intentId, { ...aged, claimedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString() });
    expect(await h.store.claimForVerification(ticket.intentId, new Date().toISOString())).not.toBeNull();
    hold.release();
    const res = await pending;
    expect(res.status).toBe(409);
    // A fenced out: no copy, no delete, winner's claim intact. Note both
    // claims share a millisecond timestamp here — fencing keys off the
    // opaque claim token, not the clock.
    expect(h.calls.copy).toBe(0);
    expect(h.calls.delete).toBe(0);
    const winner = await h.store.getById(ticket.intentId);
    expect(winner?.status).toBe("verifying");
    expect(winner?.claimToken).not.toBe(aged.claimToken);
    expect(h.objects.has(ticket.objectKey)).toBe(true);
  });

  it("a superseded verifier does not delete staging on a size mismatch either", async () => {
    const h = harness();
    const ticket = await (await signedUploadHttpRoute(
      ticketRequest({ objectKeyPrefix: "gallery/fencemismatch", contentType: "image/jpeg", byteSize: BYTES.byteLength, sha256: sha, expiresInSeconds: 300 }, "idem-key-0125"),
      { b2: h.client, context: h.context, verifier: adminVerifier }
    )).json() as { intentId: string; objectKey: string };
    // Staging holds FEWER bytes than declared: the owner would 422+delete.
    h.objects.set(ticket.objectKey, { bytes: BYTES.subarray(0, 8), contentType: "image/jpeg" });
    const hold = h.holdNextHead();
    const pending = confirmUploadHttpRoute(confirmRequest({ intentId: ticket.intentId }, "idem-key-0126"), { b2: h.client, context: h.context, verifier: adminVerifier });
    await hold.started;
    // While A is blocked inside HEAD, its claim goes stale and B reclaims it.
    const aged = h.byId.get(ticket.intentId)!;
    h.byId.set(ticket.intentId, { ...aged, claimedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString() });
    expect(await h.store.claimForVerification(ticket.intentId, new Date().toISOString())).not.toBeNull();
    hold.release();
    const res = await pending;
    expect(res.status).toBe(409);
    // A lost ownership before the mismatch branch: no delete, winner intact.
    expect(h.calls.delete).toBe(0);
    expect(h.objects.has(ticket.objectKey)).toBe(true);
    expect((await h.store.getById(ticket.intentId))?.status).toBe("verifying");
  });

  it("reserves the confirm permit with a 300s TTL covering streamed verification", async () => {
    const h = harness();
    const ticket = await (await signedUploadHttpRoute(
      ticketRequest({ objectKeyPrefix: "gallery/ttl", contentType: "image/jpeg", byteSize: BYTES.byteLength, sha256: sha, expiresInSeconds: 300 }, "idem-key-0130"),
      { b2: h.client, context: h.context, verifier: adminVerifier }
    )).json() as { intentId: string; objectKey: string };
    h.objects.set(ticket.objectKey, { bytes: BYTES, contentType: "image/jpeg" });
    await confirmUploadHttpRoute(confirmRequest({ intentId: ticket.intentId }, "idem-key-0131"), { b2: h.client, context: h.context, verifier: adminVerifier });
    const confirmReserve = h.reserves.find((r) => r.operation === "mediaUploadConfirm");
    expect(confirmReserve).toMatchObject({ operation: "mediaUploadConfirm", ttlSeconds: 300 });
  });

  it("never marks an intent paid when the issuance commit fails", async () => {
    const h = harness();
    h.failCommitFor("b2Upload");
    const payload = { objectKeyPrefix: "gallery/strict", contentType: "image/jpeg", byteSize: BYTES.byteLength, sha256: sha, expiresInSeconds: 300 };
    await expect(signedUploadHttpRoute(ticketRequest(payload, "idem-key-0200"), { b2: h.client, context: h.context, verifier: adminVerifier })).rejects.toMatchObject({ status: 503 });
    // The row exists (created inside the permit) but the flag is untouched:
    // a crash or failed commit can never produce a paid-but-unfunded intent.
    const intents = [...h.byId.values()].filter((i) => i.idempotencyKey === "idem-key-0200");
    expect(intents).toHaveLength(1);
    expect(intents[0]!.budgetCommitted).toBe(false);
    expect(intents[0]!.status).toBe("ticketed");
    // Replay recharges instead of assuming payment, then serves the ticket.
    const replay = await signedUploadHttpRoute(ticketRequest(payload, "idem-key-0200"), { b2: h.client, context: h.context, verifier: adminVerifier });
    expect(replay.status).toBe(200);
    expect((await h.store.getById(intents[0]!.id))?.budgetCommitted).toBe(true);
    expect(h.reserves.filter((r) => r.operation === "b2Upload")).toHaveLength(2);
  });

    it("refuses to extend a near-expiry replay and fails the intent instead", async () => {    const h = harness();
    const payload = { objectKeyPrefix: "gallery/nearly", contentType: "image/jpeg", byteSize: BYTES.byteLength, sha256: sha, expiresInSeconds: 300 };
    const first = await (await signedUploadHttpRoute(ticketRequest(payload, "idem-key-0210"), { b2: h.client, context: h.context, verifier: adminVerifier })).json() as { intentId: string };
    // Age the ticket to 10s of remaining life: below the 30s signing floor.
    const current = h.byId.get(first.intentId)!;
    const aged = { ...current, ticketExpiresAt: new Date(Date.now() + 10_000).toISOString() };
    h.byId.set(first.intentId, aged);
    const res = await signedUploadHttpRoute(ticketRequest(payload, "idem-key-0210"), { b2: h.client, context: h.context, verifier: adminVerifier });
    expect(res.status).toBe(410);
    expect((await h.store.getById(first.intentId))?.status).toBe("failed");
    // No fresh URL was minted for the dying ticket.
    expect(h.calls.ticket).toBe(1);
  });

  it("fails an unpaid near-expiry replay instead of minting a dying URL", async () => {
    const h = harness();
    // Unpaid intent (crashed before commit), nearly expired.
    const created = await h.store.create({
      id: "22222222-3333-4444-8555-666666666666", idempotencyKey: "idem-key-0220",
      objectKey: "gallery/unpaid-near/22222222-3333-4444-8555-666666666666", contentType: "image/jpeg",
      declaredByteSize: BYTES.byteLength, sha256: sha, ticketExpiresAt: new Date(Date.now() + 10_000).toISOString(),
    });
    expect(created.budgetCommitted).toBe(false);
    const ticketsBefore = h.calls.ticket;
    const res = await signedUploadHttpRoute(
      ticketRequest({ objectKeyPrefix: "gallery/unpaid-near", contentType: "image/jpeg", byteSize: BYTES.byteLength, sha256: sha, expiresInSeconds: 300 }, "idem-key-0220"),
      { b2: h.client, context: h.context, verifier: adminVerifier }
    );
    expect(res.status).toBe(410);
    expect((await h.store.getById(created.id))?.status).toBe("failed");
    expect(h.calls.ticket).toBe(ticketsBefore);
  });

  it("reports persisted state when a concurrent claim wins the expiry race", async () => {
    const h = harness();
    const created = await h.store.create({
      id: "33333333-4444-4555-8666-777777777777", idempotencyKey: "idem-key-0230",
      objectKey: "gallery/race-expiry/33333333-4444-4555-8666-777777777777", contentType: "image/jpeg",
      declaredByteSize: BYTES.byteLength, sha256: sha, ticketExpiresAt: new Date(Date.now() + 10_000).toISOString(),
    });
    // A concurrent confirm claims the row inside our failIfTicketed call,
    // so our transition loses: report the winner's verifying state.
    h.armFailRace(() => {
      const cur = h.byId.get(created.id)!;
      h.byId.set(created.id, { ...cur, status: "verifying", claimedAt: new Date().toISOString(), claimToken: "claim-token-winner" });
    });
    const ticketsBefore = h.calls.ticket;
    const res = await signedUploadHttpRoute(
      ticketRequest({ objectKeyPrefix: "gallery/race-expiry", contentType: "image/jpeg", byteSize: BYTES.byteLength, sha256: sha, expiresInSeconds: 300 }, "idem-key-0230"),
      { b2: h.client, context: h.context, verifier: adminVerifier }
    );
    expect(res.status).toBe(409);
    expect(h.calls.ticket).toBe(ticketsBefore);
    expect((await h.store.getById(created.id))?.status).toBe("verifying");
  });

  it("serves edge-cache hits with zero budget, D1, and B2 cost", async () => {
    const h = harness();
    const ticket = await (await signedUploadHttpRoute(
      ticketRequest({ objectKeyPrefix: "gallery/cached", contentType: "image/jpeg", byteSize: BYTES.byteLength, sha256: sha, expiresInSeconds: 300 }, "idem-key-0300"),
      { b2: h.client, context: h.context, verifier: adminVerifier }
    )).json() as { intentId: string; objectKey: string };
    const finalKey = `gallery/cached/${ticket.intentId}`;
    h.objects.set(ticket.objectKey, { bytes: BYTES, contentType: "image/jpeg" });
    await confirmUploadHttpRoute(confirmRequest({ intentId: ticket.intentId }, "idem-key-0301"), { b2: h.client, context: h.context, verifier: adminVerifier });
    const url = `https://api.test/api/v1/media/${finalKey}`;
    const first = await mediaStreamRoute(new Request(url, { method: "GET" }), { b2: h.client, objectKey: finalKey, context: h.context, edgeCache: h.edgeCache });
    expect(first.status).toBe(200);
    expect(await first.text()).toBe(new TextDecoder().decode(BYTES));
    const getsAfterMiss = h.calls.get;
    const reservesAfterMiss = h.reserves.length;
    const second = await mediaStreamRoute(new Request(url, { method: "GET" }), { b2: h.client, objectKey: finalKey, context: h.context, edgeCache: h.edgeCache });
    expect(second.status).toBe(200);
    expect(await second.text()).toBe(new TextDecoder().decode(BYTES));
    // The hit cost nothing downstream: no new permit, no B2, no D1.
    expect(h.calls.get).toBe(getsAfterMiss);
    expect(h.reserves).toHaveLength(reservesAfterMiss);
    expect(h.edgeCalls.put).toBe(1);
  });

  it("never caches errors or revalidation responses", async () => {
    const h = harness();
    const missing = new Request("https://api.test/api/v1/media/gallery/nope/missing", { method: "GET" });
    // No confirmed intent: 404 twice, and neither response is cached —
    // each attempt still reaches the route (and its budget permit).
    const reservesBefore = h.reserves.length;
    await expect(mediaStreamRoute(missing, { b2: h.client, objectKey: "gallery/nope/missing", context: h.context, edgeCache: h.edgeCache })).rejects.toMatchObject({ status: 404 });
    await expect(mediaStreamRoute(missing, { b2: h.client, objectKey: "gallery/nope/missing", context: h.context, edgeCache: h.edgeCache })).rejects.toMatchObject({ status: 404 });
    expect(h.reserves).toHaveLength(reservesBefore + 2);
    expect(h.edgeCalls.put).toBe(0);
  });

  it("resolves legacy keys only through the migrated inventory, never by prefix", async () => {
    const h = harness();
    const key = "legacy/gallery-hex/50638459-1b72-55d7-8efb-eb8b6f18a0b2.jpeg";
    // Bytes exist in B2 but the key was never migrated: 404, zero B2 calls.
    h.objects.set(key, { bytes: BYTES, contentType: "image/jpeg" });
    const blocked = new Request(`https://api.test/api/v1/media/${key}`, { method: "GET" });
    const headsBefore = h.calls.head;
    const commitsBefore = h.counts.commits;
    await expect(mediaStreamRoute(blocked, { b2: h.client, objectKey: key, context: h.context })).rejects.toMatchObject({ status: 404 });
    expect(h.calls.head).toBe(headsBefore);
    expect(h.calls.get).toBe(0);
    expect(h.counts.commits).toBe(commitsBefore + 1);
    // After migration records it, the same key streams normally.
    h.inventoryRows.set(key, { sha256: sha, byteSize: BYTES.byteLength, contentType: "image/jpeg" });
    const allowed = new Request(`https://api.test/api/v1/media/${key}`, { method: "GET" });
    const res = await mediaStreamRoute(allowed, { b2: h.client, objectKey: key, context: h.context });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(new TextDecoder().decode(BYTES));
  });

  it("rejects executable types in image namespaces but allows study documents", async () => {
    const h = harness();
    const htmlPayload = { objectKeyPrefix: "gallery/evil", contentType: "text/html", byteSize: 100, sha256: sha, expiresInSeconds: 300 };
    const rejected = await signedUploadHttpRoute(ticketRequest(htmlPayload, "idem-key-0400"), { b2: h.client, context: h.context, verifier: adminVerifier });
    expect(rejected.status).toBe(400);
    expect(h.reserves).toHaveLength(0);
    // Same type is legitimate study material.
    const studyPayload = { objectKeyPrefix: "study/notes", contentType: "text/html", byteSize: BYTES.byteLength, sha256: sha, expiresInSeconds: 300 };
    const allowed = await signedUploadHttpRoute(ticketRequest(studyPayload, "idem-key-0401"), { b2: h.client, context: h.context, verifier: adminVerifier });
    expect(allowed.status).toBe(202);
  });

  it("serves active content sandboxed and images without sandboxing", async () => {
    const h = harness();
    const htmlBytes = new TextEncoder().encode("<p>study</p>");
    const htmlSha = await sha256Hex(htmlBytes);
    const ticket = await (await signedUploadHttpRoute(
      ticketRequest({ objectKeyPrefix: "study/sandboxed", contentType: "text/html", byteSize: htmlBytes.byteLength, sha256: htmlSha, expiresInSeconds: 300 }, "idem-key-0410"),
      { b2: h.client, context: h.context, verifier: adminVerifier }
    )).json() as { intentId: string; objectKey: string };
    const finalKey = `study/sandboxed/${ticket.intentId}`;
    h.objects.set(ticket.objectKey, { bytes: htmlBytes, contentType: "text/html" });
    await confirmUploadHttpRoute(confirmRequest({ intentId: ticket.intentId }, "idem-key-0411"), { b2: h.client, context: h.context, verifier: adminVerifier });
    const doc = await mediaStreamRoute(new Request(`https://api.test/api/v1/media/${finalKey}`, { method: "GET" }), { b2: h.client, objectKey: finalKey, context: h.context });
    expect(doc.status).toBe(200);
    expect(doc.headers.get("Content-Security-Policy")).toBe("sandbox");
    // Images stream without the sandbox directive.
    const imgTicket = await (await signedUploadHttpRoute(
      ticketRequest({ objectKeyPrefix: "gallery/plain", contentType: "image/jpeg", byteSize: BYTES.byteLength, sha256: sha, expiresInSeconds: 300 }, "idem-key-0412"),
      { b2: h.client, context: h.context, verifier: adminVerifier }
    )).json() as { intentId: string; objectKey: string };
    const imgKey = `gallery/plain/${imgTicket.intentId}`;
    h.objects.set(imgTicket.objectKey, { bytes: BYTES, contentType: "image/jpeg" });
    await confirmUploadHttpRoute(confirmRequest({ intentId: imgTicket.intentId }, "idem-key-0413"), { b2: h.client, context: h.context, verifier: adminVerifier });
    const img = await mediaStreamRoute(new Request(`https://api.test/api/v1/media/${imgKey}`, { method: "GET" }), { b2: h.client, objectKey: imgKey, context: h.context });
    expect(img.status).toBe(200);
    expect(img.headers.get("Content-Security-Policy")).toBeNull();
  });

  it("signs at 31s remaining but fails at 29s, from the same persisted row", async () => {
    const h = harness();
    const payload = { objectKeyPrefix: "gallery/boundary", contentType: "image/jpeg", byteSize: BYTES.byteLength, sha256: sha, expiresInSeconds: 300 };
    const first = await (await signedUploadHttpRoute(ticketRequest(payload, "idem-key-0500"), { b2: h.client, context: h.context, verifier: adminVerifier })).json() as { intentId: string };
    // 31s left: signs normally with the persisted deadline echoed back.
    h.byId.set(first.intentId, { ...h.byId.get(first.intentId)!, ticketExpiresAt: new Date(Date.now() + 31_000).toISOString() });
    const okRes = await signedUploadHttpRoute(ticketRequest(payload, "idem-key-0500"), { b2: h.client, context: h.context, verifier: adminVerifier });
    expect(okRes.status).toBe(200);
    const okBody = await okRes.json() as { expiresAt: string };
    expect(Date.parse(okBody.expiresAt) - Date.now()).toBeGreaterThan(0);
    expect(Date.parse(okBody.expiresAt) - Date.now()).toBeLessThanOrEqual(31_000);
    // 29s left: no URL is minted; the intent fails instead.
    h.byId.set(first.intentId, { ...h.byId.get(first.intentId)!, ticketExpiresAt: new Date(Date.now() + 29_000).toISOString(), status: "ticketed" as const });
    const ticketsBefore = h.calls.ticket;
    const gone = await signedUploadHttpRoute(ticketRequest(payload, "idem-key-0500"), { b2: h.client, context: h.context, verifier: adminVerifier });
    expect(gone.status).toBe(410);
    expect(h.calls.ticket).toBe(ticketsBefore);
    expect((await h.store.getById(first.intentId))?.status).toBe("failed");
  });

  it("rejects unauthenticated ticket issuance with 401", async () => {    const h = harness();
    await expect(signedUploadHttpRoute(
      ticketRequest({ objectKeyPrefix: "gallery/x", contentType: "image/jpeg", byteSize: 10, sha256: sha, expiresInSeconds: 60 }),
      { b2: h.client, context: h.context }
    )).rejects.toMatchObject({ status: 401 });
    expect(h.reserves).toHaveLength(0);
  });
});
