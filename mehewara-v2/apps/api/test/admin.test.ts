import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import type { BudgetGate, BudgetCapability, Operation } from "../src/middleware/budget-gate";
import type { FeatureContext } from "../src/env";
import type { AccessVerifier } from "../src/shared/auth";
import { d1AdminStore, type AdminStore } from "../src/features/admin/store";
import { d1MediaInventoryStore } from "../src/features/media/inventory";
import { adminRouter } from "../src/features/admin/route";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

/** Minimal D1 shim over node:sqlite. Only the surface d1AdminStore and
 *  d1MediaInventoryStore use: prepare/bind/first/all/run/batch. */
function testD1(): D1Database {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON;");
  for (const file of ["0001_initial.sql", "0005_admin_idempotency.sql", "0006_study_guards.sql", "0007_paper_subject_guard.sql", "0008_monotonic_stamps.sql", "0009_study_subject_match.sql"]) {
    db.exec(readFileSync(join(root, "migrations", file), "utf8"));
  }
  interface Bound { readonly sql: string; readonly params: any[]; first<T>(): Promise<T | null>; all<T>(): Promise<{ results: T[] }>; run(): Promise<{ meta: { changes: number } }>; }
  const bind = (sql: string, params: any[]): Bound => ({
    sql, params,
    async first<T>() {
      try {
        return (db.prepare(sql).get(...params) as T | undefined) ?? null;
      } catch (error) {
        throw new Error((error as Error).message);
      }
    },
    async all<T>() {
      try {
        return { results: db.prepare(sql).all(...params) as T[] };
      } catch (error) {
        throw new Error((error as Error).message);
      }
    },
    async run() {
      try {
        const info = db.prepare(sql).run(...params);
        return { meta: { changes: Number(info.changes) } };
      } catch (error) {
        throw new Error((error as Error).message);
      }
    },
  });
  return {
    prepare: (sql: string) => ({ bind: (...params: any[]) => bind(sql, params) }),
    async batch(statements: Bound[]) {
      // Match D1: the batch is one atomic transaction.
      db.exec("BEGIN;");
      try {
        const out = [];
        for (const statement of statements) {
          try {
            const info = db.prepare(statement.sql).run(...statement.params);
            out.push({ meta: { changes: Number(info.changes) } });
          } catch (error) {
            throw new Error((error as Error).message);
          }
        }
        db.exec("COMMIT;");
        return out;
      } catch (error) {
        try { db.exec("ROLLBACK;"); } catch { /* already rolled back */ }
        throw error;
      }
    },
  } as unknown as D1Database;
}

function fakeGate() {
  const reserves: { operation: Operation }[] = [];
  const gate: BudgetGate = { async status() { return {} as any; }, async activateEmergency() {}, 
    async reserve(operation: Operation) {
      reserves.push({ operation });
      let started = false;
      const capability: BudgetCapability = {
        permitId: `permit-${reserves.length}`, expiresAt: new Date(Date.now() + 30_000).toISOString(),
        get providerCallStarted() { return started; }, markProviderCallStarted() { started = true; },
      };
      return capability;
    },
    async commit() {},
    async release() {},
    async reset() {},
    async live() { return 1; }
  };
  return { gate, reserves };
}

const adminVerifier: AccessVerifier = {
  async verify() { return { subject: "admin-1", roles: ["admin"] as const }; },
};

function harness() {
  const d1 = testD1();
  const { gate, reserves } = fakeGate();
  const store = d1AdminStore(d1);
  const inventory = d1MediaInventoryStore(d1);
  const context = {
    requestId: "req-test", environment: "test",
    access: { issuer: "https://issuer", audience: "aud" },
    gate, uploads: {}, inventory, publications: {}, admin: store,
  } as unknown as FeatureContext;
  return { d1, store, inventory, context, reserves };
}

let keySeq = 0;
function adminRequest(path: string, init?: { method?: string; body?: unknown; key?: string }): Request {
  keySeq += 1;
  const headers: Record<string, string> = { "Idempotency-Key": init?.key ?? `test-key-${keySeq}` };
  if (init?.body !== undefined) headers["Content-Type"] = "application/json";
  return new Request(`https://api.test${path}`, {
    method: init?.method ?? (init?.body !== undefined ? "POST" : "GET"),
    headers,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
}

const SUBJ = "11111111-1111-4111-8111-111111111111";
const PAPER = "22222222-2222-4222-8222-222222222222";
const QUES = "33333333-3333-4333-8333-333333333333";

function subjectBody(id = SUBJ) {
  return {
    id, slug: `physics-${id.slice(0, 4)}`, title: { en: "Physics", si: "භෞතිකය", ta: "பௌதிகம்" },
    description: null, examType: "al", code: "PHY",
    presentation: { icon: "BookOpen", color: "slate", variant: "solid" }, sortOrder: 0,
  };
}

function paperBody(id = PAPER, subjectId = SUBJ) {
  return {
    id, subjectId, examType: "al", slug: `2024-${id.slice(0, 4)}`, title: { en: "2024", si: "2024" },
    year: 2024, language: "si", durationMinutes: 120, questionCount: 0, questionCountSource: "admin_declared",
  };
}

function questionBody(id = QUES, paperId = PAPER) {
  const options = [0, 1, 2, 3].map((sortOrder) => ({
    id: `44444444-4444-4444-8444-44444444444${sortOrder}`, questionId: id,
    html: `<p>Option ${sortOrder}</p>`,
    contentSafety: { sanitizationStatus: "sanitized", sanitizerVersion: "v1" as string | null },
    sortOrder, isCorrect: sortOrder === 0,
  }));
  return {
    id, paperId, number: 1, questionHtml: "<p>What is force?</p>", explanationHtml: null,
    contentSafety: { sanitizationStatus: "sanitized", sanitizerVersion: "v1" as string | null },
    options, optionCount: 4, answerMode: "single", correctOptionIndexes: [0], isAllCorrect: false, marks: 2,
  };
}

async function createSubject(h: ReturnType<typeof harness>, id = SUBJ) {
  const res = await adminRouter(adminRequest("/api/v1/admin/subjects", { body: subjectBody(id) }),
    { context: h.context, store: h.store, verifier: adminVerifier });
  expect(res.status).toBe(201);
  return (await res.json()) as { id: string; updatedAt: string };
}

const ENTITY: Record<string, string> = {
  subjects: "subject", papers: "paper", questions: "question", "study-materials": "study_material",
  "gallery-items": "gallery_item", "content-pages": "content_page",
};

async function transition(h: ReturnType<typeof harness>, resource: string, entityId: string, state: string, key?: string) {
  const entity = ENTITY[resource];
  const current = await (async (): Promise<{ updated_at: string } | null> => {
    switch (resource) {
      case "subjects": return h.store.getSubject(entityId);
      case "papers": return h.store.getPaper(entityId);
      case "questions": return h.store.getQuestion(entityId);
      case "study-materials": return h.store.getStudyMaterial(entityId);
      case "gallery-items": return h.store.getGalleryItem(entityId);
      case "content-pages": return h.store.getContentPage(entityId);
      default: throw new Error(`unknown resource ${resource}`);
    }
  })();
  if (!current) throw new Error(`missing ${resource}/${entityId} for transition`);
  return adminRouter(
    adminRequest(`/api/v1/admin/${resource}/${entityId}/state`, {
      body: { entity, entityId, state, expectedUpdatedAt: current.updated_at }, key,
    }),
    { context: h.context, store: h.store, verifier: adminVerifier });
}

describe("admin content CRUD", () => {
  it("runs the subject lifecycle with optimistic concurrency and publish guards", async () => {
    const h = harness();
    const deps = { context: h.context, store: h.store, verifier: adminVerifier };
    const created = await createSubject(h);
    const get = await adminRouter(adminRequest(`/api/v1/admin/subjects/${SUBJ}`, { method: "GET" }), deps);
    expect(get.status).toBe(200);
    expect(((await get.json()) as { title: { ta: string } }).title.ta).toBe("பௌதிகம்");

    const list = await adminRouter(adminRequest("/api/v1/admin/subjects?limit=10"), deps);
    expect(list.status).toBe(200);
    expect(((await list.json()) as { items: unknown[] }).items).toHaveLength(1);

    const stale = adminRouter(
      adminRequest(`/api/v1/admin/subjects/${SUBJ}`, { method: "PATCH", body: { code: "X", expectedUpdatedAt: "2000-01-01T00:00:00.000Z" } }), deps);
    await expect(stale).rejects.toMatchObject({ status: 409 });

    const updated = await adminRouter(
      adminRequest(`/api/v1/admin/subjects/${SUBJ}`, { method: "PATCH", body: { code: "PHYS", expectedUpdatedAt: created.updatedAt } }), deps);
    expect(updated.status).toBe(200);
    expect(((await updated.json()) as { code: string }).code).toBe("PHYS");

    const published = await transition(h, "subjects", SUBJ, "published");
    expect(published.status).toBe(200);

    const delPublished = adminRouter(adminRequest(`/api/v1/admin/subjects/${SUBJ}`, { method: "DELETE" }), deps);
    await expect(delPublished).rejects.toMatchObject({ status: 409 });

    expect((await transition(h, "subjects", SUBJ, "archived")).status).toBe(200);
    const deleted = await adminRouter(adminRequest(`/api/v1/admin/subjects/${SUBJ}`, { method: "DELETE" }), deps);
    expect(deleted.status).toBe(200);
    expect((await adminRouter(adminRequest(`/api/v1/admin/subjects/${SUBJ}`, { method: "GET" }), deps)).status).toBe(404);
  });

  it("allows deleting a published subject directly when force=true is provided", async () => {
    const h = harness();
    const deps = { context: h.context, store: h.store, verifier: adminVerifier };
    await adminRouter(adminRequest("/api/v1/admin/subjects", { body: subjectBody() }), deps);
    await transition(h, "subjects", SUBJ, "published");
    const forced = await adminRouter(adminRequest(`/api/v1/admin/subjects/${SUBJ}?force=true`, { method: "DELETE" }), deps);
    expect(forced.status).toBe(200);
    expect((await adminRouter(adminRequest(`/api/v1/admin/subjects/${SUBJ}`, { method: "GET" }), deps)).status).toBe(404);
  });

  it("replays an idempotency key without re-applying the mutation or audit", async () => {
    const h = harness();
    const deps = { context: h.context, store: h.store, verifier: adminVerifier };
    const first = await adminRouter(adminRequest("/api/v1/admin/subjects", { body: subjectBody(), key: "replay-key-0001" }), deps);
    expect(first.status).toBe(201);
    const firstBody = await first.json();
    const second = await adminRouter(adminRequest("/api/v1/admin/subjects", { body: subjectBody(), key: "replay-key-0001" }), deps);
    expect(second.status).toBe(201);
    expect(await second.json()).toEqual(firstBody);
    const subjects = await h.store.listSubjects(10, null);
    expect(subjects).toHaveLength(1);
    const audits = (h.d1 as unknown as { prepare: (sql: string) => { bind: (...p: unknown[]) => { all<T>(): Promise<{ results: T[] }> } } })
      .prepare("SELECT * FROM admin_audit_log").bind().all();
    expect((await audits).results).toHaveLength(1);
  });

  it("enforces paper parents and publication triggers", async () => {
    const h = harness();
    const deps = { context: h.context, store: h.store, verifier: adminVerifier };
    const orphan = adminRouter(adminRequest("/api/v1/admin/papers", { body: paperBody() }), deps);
    await expect(orphan).rejects.toMatchObject({ status: 404 });

    await createSubject(h);
    const created = await adminRouter(adminRequest("/api/v1/admin/papers", { body: paperBody() }), deps);
    expect(created.status).toBe(201);
    const paper = (await created.json()) as { updatedAt: string; studyMaterialId: null };
    expect(paper.studyMaterialId).toBeNull();

    // Draft subject blocks paper publication via the D1 trigger.
    await expect(transition(h, "papers", PAPER, "published")).rejects.toMatchObject({ status: 409 });
    expect((await transition(h, "subjects", SUBJ, "published")).status).toBe(200);
    expect((await transition(h, "papers", PAPER, "published")).status).toBe(200);

    // Published paper blocks unpublishing its subject.
    await expect(transition(h, "subjects", SUBJ, "archived")).rejects.toMatchObject({ status: 409 });

    // Stale expectedUpdatedAt on transitions conflicts.
    const stale = adminRouter(
      adminRequest(`/api/v1/admin/papers/${PAPER}/state`, {
        body: { entity: "paper", entityId: PAPER, state: "archived", expectedUpdatedAt: "2000-01-01T00:00:00.000Z" },
      }), deps);
    await expect(stale).rejects.toMatchObject({ status: 409 });
    expect((await transition(h, "papers", PAPER, "archived")).status).toBe(200);
    expect((await transition(h, "subjects", SUBJ, "archived")).status).toBe(200);

    // Deleting the subject cascades and removes its papers without foreign key failure
    const delSubj = await adminRouter(adminRequest(`/api/v1/admin/subjects/${SUBJ}`, { method: "DELETE" }), deps);
    expect(delSubj.status).toBe(200);
    expect((await adminRouter(adminRequest(`/api/v1/admin/subjects/${SUBJ}`, { method: "GET" }), deps)).status).toBe(404);
    expect((await adminRouter(adminRequest(`/api/v1/admin/papers/${PAPER}`, { method: "GET" }), deps)).status).toBe(404);
  });

  it("creates questions draft-first with normalized answers and cascades deletes", async () => {
    const h = harness();
    const deps = { context: h.context, store: h.store, verifier: adminVerifier };
    await createSubject(h);
    await adminRouter(adminRequest("/api/v1/admin/papers", { body: paperBody() }), deps);

    const created = await adminRouter(adminRequest("/api/v1/admin/questions", { body: questionBody() }), deps);
    expect(created.status).toBe(201);
    const question = (await created.json()) as {
      updatedAt: string; state: string; answerMode: string; correctOptionIndexes: number[]; options: { html: string }[];
    };
    expect(question.state).toBe("draft");
    expect(question.answerMode).toBe("single");
    expect(question.correctOptionIndexes).toEqual([0]);
    expect(question.options[0]!.html).toBe("<p>Option 0</p>");

    // Mismatched optionCount is rejected before any write.
    const badCount = { ...questionBody("55555555-5555-4555-8555-555555555555"), optionCount: 5 };
    await expect(adminRouter(adminRequest("/api/v1/admin/questions", { body: badCount }), deps)).rejects.toMatchObject({ status: 400 });

    // No correct option is rejected.
    const noCorrect = questionBody("66666666-6666-4666-8666-666666666666");
    noCorrect.options.forEach((option) => { option.isCorrect = false; });
    await expect(adminRouter(adminRequest("/api/v1/admin/questions", { body: noCorrect }), deps)).rejects.toMatchObject({ status: 400 });

    // Publish the chain first: the question trigger requires a published paper.
    expect((await transition(h, "subjects", SUBJ, "published")).status).toBe(200);
    expect((await transition(h, "papers", PAPER, "published")).status).toBe(200);

    // Publish + archive + delete cascade the options.
    expect((await transition(h, "questions", QUES, "published")).status).toBe(200);
    expect((await transition(h, "questions", QUES, "archived")).status).toBe(200);
    const deleted = await adminRouter(adminRequest(`/api/v1/admin/questions/${QUES}`, { method: "DELETE" }), deps);
    expect(deleted.status).toBe(200);
    expect(await h.store.listOptions(QUES)).toHaveLength(0);

    // Question listing is paper-scoped.
    const missing = await adminRouter(adminRequest("/api/v1/admin/questions"), deps);
    expect(missing.status).toBe(400);
  });

  it("blocks publishing unsanitized questions and rejects partial answer edits", async () => {
    const h = harness();
    const deps = { context: h.context, store: h.store, verifier: adminVerifier };
    await createSubject(h);
    await adminRouter(adminRequest("/api/v1/admin/papers", { body: paperBody() }), deps);
    const pending = questionBody();
    pending.contentSafety = { sanitizationStatus: "pending", sanitizerVersion: null };
    expect((await adminRouter(adminRequest("/api/v1/admin/questions", { body: pending }), deps)).status).toBe(201);
    await expect(transition(h, "questions", QUES, "published")).rejects.toMatchObject({ status: 409 });

    const row = await h.store.getQuestion(QUES);
    const partial = adminRouter(
      adminRequest(`/api/v1/admin/questions/${QUES}`, {
        method: "PATCH", body: { isAllCorrect: true, expectedUpdatedAt: row!.updated_at },
      }), deps);
    await expect(partial).rejects.toMatchObject({ status: 400 });
  });

  it("gates study objects on inventory and enforces published parents", async () => {
    const h = harness();
    const deps = { context: h.context, store: h.store, verifier: adminVerifier };
    await createSubject(h);
    await adminRouter(adminRequest("/api/v1/admin/papers", { body: paperBody() }), deps);
    const studyId = "77777777-7777-4777-8777-777777777777";
    const study = {
      id: studyId, subjectId: SUBJ, paperId: PAPER, slug: "notes", title: { en: "Notes", si: "සටහන්" },
      description: null, objectKey: "study/doc1.html", contentType: "text/html", byteSize: 999,
      contentSafety: { sanitizationStatus: "sanitized", sanitizerVersion: "v1" },
    };
    await expect(adminRouter(adminRequest("/api/v1/admin/study-materials", { body: study }), deps)).rejects.toMatchObject({ status: 409 });

    await (h.d1 as unknown as { prepare: (sql: string) => { bind: (...p: unknown[]) => { run(): Promise<unknown> } } })
      .prepare("INSERT INTO media_inventory (object_key, purpose, sha256, byte_size, content_type) VALUES (?, ?, ?, ?, ?)")
      .bind("study/doc1.html", "document", "a".repeat(64), 20, "text/html").run();
    const createdRes = await adminRouter(adminRequest("/api/v1/admin/study-materials", { body: study }), deps);
    expect(createdRes.status).toBe(201);
    // Server-authoritative size from inventory, not the request's 999.
    expect(((await createdRes.json()) as { byteSize: number }).byteSize).toBe(20);

    // Draft parents block publication at the route (no D1 trigger covers study).
    await expect(transition(h, "study-materials", studyId, "published")).rejects.toMatchObject({ status: 409 });
    expect((await transition(h, "subjects", SUBJ, "published")).status).toBe(200);
    expect((await transition(h, "papers", PAPER, "published")).status).toBe(200);
    expect((await transition(h, "study-materials", studyId, "published")).status).toBe(200);

    // Paper detail now resolves the reverse link.
    const paper = await adminRouter(adminRequest(`/api/v1/admin/papers/${PAPER}`, { method: "GET" }), deps);
    expect(((await paper.json()) as { studyMaterialId: string }).studyMaterialId).toBe(studyId);
  });

  it("creates gallery items from inventoried keys and runs page lifecycles", async () => {
    const h = harness();
    const deps = { context: h.context, store: h.store, verifier: adminVerifier };
    const galleryId = "88888888-8888-4888-8888-888888888888";
    const gallery = {
      id: galleryId, slug: "day", title: { en: "Day", si: "දිනය" }, description: null,
      altText: { en: "Day", si: "දිනය" }, imageObjectKey: "gallery/img.jpeg", thumbnailObjectKey: "gallery/img.jpeg.thumb",
      contentType: "image/jpeg", width: 100, height: 100, byteSize: 0, pinned: false, sortOrder: 0,
    };
    await expect(adminRouter(adminRequest("/api/v1/admin/gallery-items", { body: gallery }), deps)).rejects.toMatchObject({ status: 409 });
    const d1 = h.d1 as unknown as { prepare: (sql: string) => { bind: (...p: unknown[]) => { run(): Promise<unknown> } } };
    await d1.prepare("INSERT INTO media_inventory (object_key, purpose, sha256, byte_size, content_type) VALUES (?, ?, ?, ?, ?)")
      .bind("gallery/img.jpeg", "image", "b".repeat(64), 10, "image/jpeg").run();
    await d1.prepare("INSERT INTO media_inventory (object_key, purpose, sha256, byte_size, content_type) VALUES (?, ?, ?, ?, ?)")
      .bind("gallery/img.jpeg.thumb", "thumbnail", "c".repeat(64), 5, "image/jpeg").run();
    const createdRes = await adminRouter(adminRequest("/api/v1/admin/gallery-items", { body: gallery }), deps);
    expect(createdRes.status).toBe(201);
    expect(((await createdRes.json()) as { byteSize: number }).byteSize).toBe(10);
    expect((await transition(h, "gallery-items", galleryId, "published")).status).toBe(200);

    const pageId = "99999999-9999-4999-8999-999999999999";
    const page = { id: pageId, slug: "terms", title: { en: "Terms", si: "කොන්දේසි" }, body: { en: "Body", si: "අන්තර්ගතය" } };
    expect((await adminRouter(adminRequest("/api/v1/admin/content-pages", { body: page }), deps)).status).toBe(201);
    expect((await transition(h, "content-pages", pageId, "published")).status).toBe(200);
    const fetched = await adminRouter(adminRequest(`/api/v1/admin/content-pages/${pageId}`, { method: "GET" }), deps);
    expect(((await fetched.json()) as { state: string }).state).toBe("published");
  });

  it("manages about/privacy singletons and reports stats", async () => {
    const h = harness();
    const deps = { context: h.context, store: h.store, verifier: adminVerifier };
    expect((await adminRouter(adminRequest("/api/v1/admin/about", { method: "GET" }), deps)).status).toBe(404);
    const about = {
      id: "about", description: "We teach.", image: null,
      social: { facebookUrl: null, youtubeUrl: null, linkedinUrl: null },
    };
    expect((await adminRouter(adminRequest("/api/v1/admin/about", { method: "PUT", body: about }), deps)).status).toBe(200);

    const privacy = {
      id: "privacy", statement: "Policy.", fullHtml: "<p>Policy</p>",
      contentSafety: { sanitizationStatus: "pending", sanitizerVersion: null },
    };
    await expect(adminRouter(adminRequest("/api/v1/admin/privacy", { method: "PUT", body: privacy }), deps)).rejects.toMatchObject({ status: 409 });
    const clean = { ...privacy, contentSafety: { sanitizationStatus: "sanitized", sanitizerVersion: "v1" } };
    expect((await adminRouter(adminRequest("/api/v1/admin/privacy", { method: "PUT", body: clean }), deps)).status).toBe(200);

    await createSubject(h);
    const stats = await adminRouter(adminRequest("/api/v1/admin/stats", { method: "GET" }), deps);
    expect(stats.status).toBe(200);
    const body = (await stats.json()) as { subjectCount: number; draftCount: number };
    expect(body.subjectCount).toBe(1);
    expect(body.draftCount).toBe(1);
  });

  it("rejects unauthenticated, malformed, and mistargeted admin calls", async () => {
    const h = harness();
    const noAuth = adminRouter(adminRequest("/api/v1/admin/stats", { method: "GET" }), { context: h.context, store: h.store });
    await expect(noAuth).rejects.toMatchObject({ status: 401 });

    const deps = { context: h.context, store: h.store, verifier: adminVerifier };
    await expect(adminRouter(adminRequest("/api/v1/admin/nope", { method: "GET" }), deps)).rejects.toMatchObject({ status: 404 });
    expect((await adminRouter(adminRequest("/api/v1/admin/subjects/not-a-uuid", { method: "GET" }), deps)).status).toBe(400);
    await expect(adminRouter(adminRequest("/api/v1/admin/subjects", { method: "DELETE" }), deps)).rejects.toMatchObject({ status: 405 });

    await createSubject(h);
    const mismatched = await adminRouter(
      adminRequest(`/api/v1/admin/subjects/${SUBJ}/state`, { body: { entity: "paper", entityId: SUBJ, state: "published" } }), deps);
    expect(mismatched.status).toBe(400);
  });

  it("writes no audit and no idempotency record for missing targets", async () => {
    const h = harness();
    const deps = { context: h.context, store: h.store, verifier: adminVerifier };
    const missing = "00000000-0000-4000-8000-000000000000";
    await expect(adminRouter(
      adminRequest(`/api/v1/admin/subjects/${missing}`, {
        method: "PATCH", body: { code: "X", expectedUpdatedAt: new Date().toISOString() },
      }), deps)).rejects.toMatchObject({ status: 404 });
    const db = h.d1 as unknown as { prepare: (sql: string) => { bind: (...p: unknown[]) => { all<T>(): Promise<{ results: T[] }> } } };
    expect((await db.prepare("SELECT * FROM admin_audit_log").bind().all()).results).toHaveLength(0);
    expect((await db.prepare("SELECT * FROM admin_idempotency_keys").bind().all()).results).toHaveLength(0);
  });

  it("converges a same-key create race onto one row and one record", async () => {
    const h = harness();
    const deps = { context: h.context, store: h.store, verifier: adminVerifier };
    const call = () => adminRouter(adminRequest("/api/v1/admin/subjects", { body: subjectBody(), key: "race-key-0001" }), deps);
    const [first, second] = await Promise.all([call(), call()]);
    // Both outcomes converge: replay echoes the recorded 201, while a true
    // same-tick collision heals through the winner record (200). Either way
    // one row, one record, identical bodies.
    expect([first.status, second.status].every((status) => status === 200 || status === 201)).toBe(true);
    expect(await first.json()).toEqual(await second.json());
    expect(await h.store.listSubjects(10, null)).toHaveLength(1);
    const db = h.d1 as unknown as { prepare: (sql: string) => { bind: (...p: unknown[]) => { all<T>(): Promise<{ results: T[] }> } } };
    expect((await db.prepare("SELECT * FROM admin_idempotency_keys").bind().all()).results).toHaveLength(1);
  });

  it("scopes idempotency keys per operation and entity", async () => {
    const h = harness();
    const deps = { context: h.context, store: h.store, verifier: adminVerifier };
    // Same key, different entity ids: both apply (different scopes).
    const other = subjectBody("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    other.slug = "physics-other";
    expect((await adminRouter(adminRequest("/api/v1/admin/subjects", { body: subjectBody(), key: "shared-key-1" }), deps)).status).toBe(201);
    expect((await adminRouter(adminRequest("/api/v1/admin/subjects", { body: other, key: "shared-key-1" }), deps)).status).toBe(201);
    expect(await h.store.listSubjects(10, null)).toHaveLength(2);
  });

  it("replaces the full option set on update with renormalized answers", async () => {
    const h = harness();
    const deps = { context: h.context, store: h.store, verifier: adminVerifier };
    await createSubject(h);
    await adminRouter(adminRequest("/api/v1/admin/papers", { body: paperBody() }), deps);
    await adminRouter(adminRequest("/api/v1/admin/questions", { body: questionBody() }), deps);
    const row = await h.store.getQuestion(QUES);
    const options = [0, 1, 2, 3, 4].map((sortOrder) => ({
      id: `55555555-5555-4555-8555-55555555555${sortOrder}`, questionId: QUES,
      html: `<p>New ${sortOrder}</p>`,
      contentSafety: { sanitizationStatus: "sanitized", sanitizerVersion: "v1" as string | null },
      sortOrder, isCorrect: sortOrder < 2,
    }));
    const updated = await adminRouter(adminRequest(`/api/v1/admin/questions/${QUES}`, {
      method: "PATCH",
      body: { options, optionCount: 5, isAllCorrect: false, expectedUpdatedAt: row!.updated_at },
    }), deps);
    expect(updated.status).toBe(200);
    const body = (await updated.json()) as { optionCount: number; answerMode: string; correctOptionIndexes: number[]; options: { id: string }[] };
    expect(body.optionCount).toBe(5);
    expect(body.answerMode).toBe("multiple");
    expect(body.correctOptionIndexes).toEqual([0, 1]);
    expect(body.options.some((option) => option.id.startsWith("44444444"))).toBe(false);
  });

  it("rejects sort permutations on published options without spending the token", async () => {
    const h = harness();
    const deps = { context: h.context, store: h.store, verifier: adminVerifier };
    await createSubject(h);
    await adminRouter(adminRequest("/api/v1/admin/papers", { body: paperBody() }), deps);
    await adminRouter(adminRequest("/api/v1/admin/questions", { body: questionBody() }), deps);
    expect((await transition(h, "subjects", SUBJ, "published")).status).toBe(200);
    expect((await transition(h, "papers", PAPER, "published")).status).toBe(200);
    expect((await transition(h, "questions", QUES, "published")).status).toBe(200);
    const row = await h.store.getQuestion(QUES);
    // Same ids, swapped order: restructuring, not a content edit.
    const permuted = [0, 1, 2, 3].map((sortOrder) => ({
      id: `44444444-4444-4444-8444-44444444444${3 - sortOrder}`, questionId: QUES,
      html: `<p>Option ${sortOrder}</p>`,
      contentSafety: { sanitizationStatus: "sanitized", sanitizerVersion: "v1" as string | null },
      sortOrder, isCorrect: sortOrder === 3,
    }));
    await expect(adminRouter(adminRequest(`/api/v1/admin/questions/${QUES}`, {
      method: "PATCH", body: { options: permuted, expectedUpdatedAt: row!.updated_at },
    }), deps)).rejects.toMatchObject({ status: 409 });
    // Token unspent and options untouched: the guard ran before any write.
    const after = await h.store.getQuestion(QUES);
    expect(after!.updated_at).toBe(row!.updated_at);
    expect((await h.store.listOptions(QUES)).map((option) => option.sort_order)).toEqual([0, 1, 2, 3]);
  });

  it("rejects published-row edits that break readiness but allows safe ones", async () => {
    const h = harness();
    const deps = { context: h.context, store: h.store, verifier: adminVerifier };
    await createSubject(h);
    await adminRouter(adminRequest("/api/v1/admin/papers", { body: paperBody() }), deps);
    await adminRouter(adminRequest("/api/v1/admin/questions", { body: questionBody() }), deps);
    expect((await transition(h, "subjects", SUBJ, "published")).status).toBe(200);
    expect((await transition(h, "papers", PAPER, "published")).status).toBe(200);
    expect((await transition(h, "questions", QUES, "published")).status).toBe(200);
    const row = await h.store.getQuestion(QUES);
    await expect(adminRouter(adminRequest(`/api/v1/admin/questions/${QUES}`, {
      method: "PATCH",
      body: { contentSafety: { sanitizationStatus: "pending", sanitizerVersion: null }, expectedUpdatedAt: row!.updated_at },
    }), deps)).rejects.toMatchObject({ status: 409 });
    const fresh = await h.store.getQuestion(QUES);
    const ok = await adminRouter(adminRequest(`/api/v1/admin/questions/${QUES}`, {
      method: "PATCH", body: { marks: 5, expectedUpdatedAt: fresh!.updated_at },
    }), deps);
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as { marks: number }).marks).toBe(5);
  });

  it("rejects studies pointing at another subject's paper", async () => {
    const h = harness();
    const deps = { context: h.context, store: h.store, verifier: adminVerifier };
    await createSubject(h);
    const otherSubj = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const other = subjectBody(otherSubj);
    other.slug = "chemistry";
    await adminRouter(adminRequest("/api/v1/admin/subjects", { body: other }), deps);
    await adminRouter(adminRequest("/api/v1/admin/papers", { body: paperBody() }), deps);
    const db = h.d1 as unknown as { prepare: (sql: string) => { bind: (...p: unknown[]) => { run(): Promise<unknown> } } };
    await db.prepare("INSERT INTO media_inventory (object_key, purpose, sha256, byte_size, content_type) VALUES (?, ?, ?, ?, ?)")
      .bind("study/x.html", "document", "d".repeat(64), 20, "text/html").run();
    const study = {
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", subjectId: otherSubj, paperId: PAPER, slug: "notes",
      title: { en: "Notes", si: "සටහන්" }, description: null, objectKey: "study/x.html",
      contentType: "text/html", byteSize: 20,
      contentSafety: { sanitizationStatus: "sanitized", sanitizerVersion: "v1" },
    };
    await expect(adminRouter(adminRequest("/api/v1/admin/study-materials", { body: study }), deps)).rejects.toMatchObject({ status: 400 });
  });

  it("answers 422 for unservable legacy study rows", async () => {
    const h = harness();
    const deps = { context: h.context, store: h.store, verifier: adminVerifier };
    const db = h.d1 as unknown as { prepare: (sql: string) => { bind: (...p: unknown[]) => { run(): Promise<unknown> } } };
    await db.prepare("INSERT INTO subjects (id, slug, title_en, title_si, exam_type, code, state) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(SUBJ, "physics", "E", "S", "al", "C", "draft").run();
    await db.prepare("INSERT INTO study_materials (id, subject_id, slug, title_en, title_si, state) VALUES (?, ?, ?, ?, ?, ?)")
      .bind("cccccccc-cccc-4ccc-8ccc-cccccccccccc", SUBJ, "legacy-notes", "E", "S", "draft").run();
    await expect(adminRouter(
      adminRequest("/api/v1/admin/study-materials/cccccccc-cccc-4ccc-8ccc-cccccccccccc", { method: "GET" }), deps)
    ).rejects.toMatchObject({ status: 422 });
  });

  it("blocks unpublishing parents with published paperless studies", async () => {
    const h = harness();
    const deps = { context: h.context, store: h.store, verifier: adminVerifier };
    await createSubject(h);
    const db = h.d1 as unknown as { prepare: (sql: string) => { bind: (...p: unknown[]) => { run(): Promise<unknown> } } };
    await db.prepare("INSERT INTO media_inventory (object_key, purpose, sha256, byte_size, content_type) VALUES (?, ?, ?, ?, ?)")
      .bind("study/y.html", "document", "e".repeat(64), 20, "text/html").run();
    const study = {
      id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", subjectId: SUBJ, paperId: null, slug: "guide",
      title: { en: "Guide", si: "මාර්ගෝපදේශය" }, description: null, objectKey: "study/y.html",
      contentType: "text/html", byteSize: 20,
      contentSafety: { sanitizationStatus: "sanitized", sanitizerVersion: "v1" },
    };
    expect((await adminRouter(adminRequest("/api/v1/admin/study-materials", { body: study }), deps)).status).toBe(201);
    expect((await transition(h, "subjects", SUBJ, "published")).status).toBe(200);
    expect((await transition(h, "study-materials", "dddddddd-dddd-4ddd-8ddd-dddddddddddd", "published")).status).toBe(200);
    await expect(transition(h, "subjects", SUBJ, "archived")).rejects.toMatchObject({ status: 409 });
  });

  it("guards singletons with optimistic tokens and audits the contract shape", async () => {
    const h = harness();
    const deps = { context: h.context, store: h.store, verifier: adminVerifier };
    const about = {
      id: "about", description: "We teach.", image: null,
      social: { facebookUrl: null, youtubeUrl: null, linkedinUrl: null },
    };
    const first = await adminRouter(adminRequest("/api/v1/admin/about", { method: "PUT", body: about }), deps);
    expect(first.status).toBe(200);
    const token = ((await first.json()) as { updatedAt: string }).updatedAt;
    await expect(adminRouter(adminRequest("/api/v1/admin/about", {
      method: "PUT", body: { ...about, description: "Stale", expectedUpdatedAt: "2000-01-01T00:00:00.000Z" },
    }), deps)).rejects.toMatchObject({ status: 409 });
    const second = await adminRouter(adminRequest("/api/v1/admin/about", {
      method: "PUT", body: { ...about, description: "Fresh", expectedUpdatedAt: token },
    }), deps);
    expect(second.status).toBe(200);
    // Audit rows match the AuditRecord entry-array shape with null UUIDs.
    const db = h.d1 as unknown as { prepare: (sql: string) => { bind: (...p: unknown[]) => { all<T>(): Promise<{ results: T[] }> } } };
    const audits = (await db.prepare("SELECT entity_id, metadata_json FROM admin_audit_log ORDER BY created_at").bind().all<{
      entity_id: string | null; metadata_json: string;
    }>()).results;
    expect(audits).toHaveLength(2);
    for (const audit of audits) {
      expect(audit.entity_id).toBeNull();
      const entries = JSON.parse(audit.metadata_json) as { key: string; value: string }[];
      expect(Array.isArray(entries)).toBe(true);
      expect(entries[0]).toEqual({ key: "singleton", value: "about" });
    }
  });

  it("requires authentication on reads and reserves budgeted operations", async () => {    const h = harness();
    await expect(adminRouter(adminRequest("/api/v1/admin/subjects?limit=5", { method: "GET" }),
      { context: h.context, store: h.store })).rejects.toMatchObject({ status: 401 });
    const deps = { context: h.context, store: h.store, verifier: adminVerifier };
    await createSubject(h);
    await adminRouter(adminRequest("/api/v1/admin/subjects?limit=5", { method: "GET" }), deps);
    expect(h.reserves.map((reserve) => reserve.operation)).toEqual(
      expect.arrayContaining(["adminContentWrite", "adminContentRead"]));
  });

  it("edits published option content in place but rejects restructuring", async () => {
    const h = harness();
    const deps = { context: h.context, store: h.store, verifier: adminVerifier };
    await createSubject(h);
    await adminRouter(adminRequest("/api/v1/admin/papers", { body: paperBody() }), deps);
    await adminRouter(adminRequest("/api/v1/admin/questions", { body: questionBody() }), deps);
    expect((await transition(h, "subjects", SUBJ, "published")).status).toBe(200);
    expect((await transition(h, "papers", PAPER, "published")).status).toBe(200);
    expect((await transition(h, "questions", QUES, "published")).status).toBe(200);
    // Same ids, new HTML: succeeds without tripping the shape trigger.
    const row = await h.store.getQuestion(QUES);
    const sameIds = [0, 1, 2, 3].map((sortOrder) => ({
      id: `44444444-4444-4444-8444-44444444444${sortOrder}`, questionId: QUES,
      html: `<p>Edited ${sortOrder}</p>`,
      contentSafety: { sanitizationStatus: "sanitized", sanitizerVersion: "v1" as string | null },
      sortOrder, isCorrect: sortOrder === 1,
    }));
    const edited = await adminRouter(adminRequest(`/api/v1/admin/questions/${QUES}`, {
      method: "PATCH", body: { options: sameIds, expectedUpdatedAt: row!.updated_at },
    }), deps);
    expect(edited.status).toBe(200);
    const editedBody = (await edited.json()) as { answerMode: string; correctOptionIndexes: number[]; options: { html: string }[] };
    expect(editedBody.options[1]!.html).toBe("<p>Edited 1</p>");
    expect(editedBody.correctOptionIndexes).toEqual([1]);
    // New ids (restructure): rejected, row untouched.
    const fresh = await h.store.getQuestion(QUES);
    const newIds = sameIds.map((option, index) => ({
      ...option, id: `66666666-6666-4666-8666-66666666666${index}`,
    }));
    await expect(adminRouter(adminRequest(`/api/v1/admin/questions/${QUES}`, {
      method: "PATCH", body: { options: newIds, expectedUpdatedAt: fresh!.updated_at },
    }), deps)).rejects.toMatchObject({ status: 409 });
    expect((await h.store.getQuestion(QUES))!.updated_at).toBe(fresh!.updated_at);
  });

  it("rejects moving a paper with linked studies to another subject", async () => {
    const h = harness();
    const deps = { context: h.context, store: h.store, verifier: adminVerifier };
    await createSubject(h);
    const otherSubj = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const other = subjectBody(otherSubj);
    other.slug = "chemistry";
    await adminRouter(adminRequest("/api/v1/admin/subjects", { body: other }), deps);
    await adminRouter(adminRequest("/api/v1/admin/papers", { body: paperBody() }), deps);
    const db = h.d1 as unknown as { prepare: (sql: string) => { bind: (...p: unknown[]) => { run(): Promise<unknown> } } };
    await db.prepare("INSERT INTO media_inventory (object_key, purpose, sha256, byte_size, content_type) VALUES (?, ?, ?, ?, ?)")
      .bind("study/z.html", "document", "f".repeat(64), 20, "text/html").run();
    const study = {
      id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", subjectId: SUBJ, paperId: PAPER, slug: "notes",
      title: { en: "Notes", si: "සටහන්" }, description: null, objectKey: "study/z.html",
      contentType: "text/html", byteSize: 20,
      contentSafety: { sanitizationStatus: "sanitized", sanitizerVersion: "v1" },
    };
    expect((await adminRouter(adminRequest("/api/v1/admin/study-materials", { body: study }), deps)).status).toBe(201);
    const paper = await h.store.getPaper(PAPER);
    await expect(adminRouter(adminRequest(`/api/v1/admin/papers/${PAPER}`, {
      method: "PATCH", body: { subjectId: otherSubj, expectedUpdatedAt: paper!.updated_at },
    }), deps)).rejects.toMatchObject({ status: 409 });
  });

  it("lets exactly one same-token singleton writer win", async () => {
    const h = harness();
    const deps = { context: h.context, store: h.store, verifier: adminVerifier };
    const about = {
      id: "about", description: "v1.", image: null,
      social: { facebookUrl: null, youtubeUrl: null, linkedinUrl: null },
    };
    expect((await adminRouter(adminRequest("/api/v1/admin/about", { method: "PUT", body: about }), deps)).status).toBe(200);
    const token = (await h.store.getAbout())!.updated_at;
    const put = (description: string, key: string) => adminRouter(
      adminRequest("/api/v1/admin/about", { method: "PUT", body: { ...about, description, expectedUpdatedAt: token }, key }), deps);
    const results = await Promise.allSettled([put("winner-a", "tok-race-1"), put("winner-b", "tok-race-1")]);
    const fulfilled = results.filter((result) => result.status === "fulfilled") as PromiseFulfilledResult<Response>[];
    const rejected = results.filter((result) => result.status === "rejected") as PromiseRejectedResult[];
    // Deterministic with the conditional upsert + monotonic stamps: the
    // guarded UPDATE matches exactly one writer, the loser re-reads a
    // changed stamp and 409s (same-key concurrent reuse converges).
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]!.reason).toMatchObject({ status: 409 });
    const final = await h.store.getAbout();
    expect(["winner-a", "winner-b"]).toContain(final!.description);
  });

  it("replays singleton mutations identically through the canonical view", async () => {
    const h = harness();
    const deps = { context: h.context, store: h.store, verifier: adminVerifier };
    const db = h.d1 as unknown as { prepare: (sql: string) => { bind: (...p: unknown[]) => { run(): Promise<unknown> } } };
    await db.prepare("INSERT INTO media_inventory (object_key, purpose, sha256, byte_size, content_type) VALUES (?, ?, ?, ?, ?)")
      .bind("about/face.jpeg", "image", "a".repeat(64), 42, "image/jpeg").run();
    const about = {
      id: "about", description: "With face.",
      image: { objectKey: "about/face.jpeg", contentType: "image/jpeg", width: 800, height: 600 },
      social: { facebookUrl: null, youtubeUrl: null, linkedinUrl: null },
    };
    const first = await adminRouter(adminRequest("/api/v1/admin/about", { method: "PUT", body: about, key: "about-replay-1" }), deps);
    expect(first.status).toBe(200);
    const firstBody = await first.json();
    // Stored dimensions are canonical (1x1), not the request's 800x600.
    expect(firstBody).toMatchObject({ image: { objectKey: "about/face.jpeg", contentType: "image/jpeg", width: 1, height: 1 } });
    const second = await adminRouter(adminRequest("/api/v1/admin/about", { method: "PUT", body: about, key: "about-replay-1" }), deps);
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual(firstBody);
  });

  it("stamps strictly increasing updated_at across rapid writes", async () => {
    const h = harness();
    const deps = { context: h.context, store: h.store, verifier: adminVerifier };
    await createSubject(h);
    const stamps: string[] = [];
    for (let i = 0; i < 5; i += 1) {
      const current = await h.store.getSubject(SUBJ);
      const updated = await adminRouter(adminRequest(`/api/v1/admin/subjects/${SUBJ}`, {
        method: "PATCH", body: { sortOrder: i, expectedUpdatedAt: current!.updated_at },
      }), deps);
      expect(updated.status).toBe(200);
      stamps.push(((await updated.json()) as { updatedAt: string }).updatedAt);
    }
    const ordered = [...stamps].sort();
    expect(stamps).toEqual(ordered);
    expect(new Set(stamps).size).toBe(stamps.length);
  });

  it("rejects publishing options sanitized without a version", async () => {
    const h = harness();
    const deps = { context: h.context, store: h.store, verifier: adminVerifier };
    await createSubject(h);
    await adminRouter(adminRequest("/api/v1/admin/papers", { body: paperBody() }), deps);
    const body = questionBody();
    body.options.forEach((option) => { option.contentSafety.sanitizerVersion = null; });
    expect((await adminRouter(adminRequest("/api/v1/admin/questions", { body }), deps)).status).toBe(201);
    expect((await transition(h, "subjects", SUBJ, "published")).status).toBe(200);
    expect((await transition(h, "papers", PAPER, "published")).status).toBe(200);
    await expect(transition(h, "questions", QUES, "published")).rejects.toMatchObject({ status: 409 });
  });
});
