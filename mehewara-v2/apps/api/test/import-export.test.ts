import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { BackupManifest, ImportManifest } from "@mehewara-v2/contracts";
import type { BudgetGate, BudgetCapability, Operation } from "../src/middleware/budget-gate";
import type { FeatureContext } from "../src/env";
import type { AccessVerifier } from "../src/shared/auth";
import { d1AdminStore } from "../src/features/admin/store";
import { d1ImportStore } from "../src/features/import-export/store";
import { d1MediaInventoryStore } from "../src/features/media/inventory";
import { importExportRouter, stableStringify, sha256Hex } from "../src/features/import-export/route";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

function testD1(): D1Database {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON;");
  for (const file of [
    "0001_initial.sql", "0005_admin_idempotency.sql", "0006_study_guards.sql",
    "0007_paper_subject_guard.sql", "0008_monotonic_stamps.sql", "0009_study_subject_match.sql",
    "0010_import_counts.sql",
  ]) {
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
  const admin = d1AdminStore(d1);
  const store = d1ImportStore(d1);
  const inventory = d1MediaInventoryStore(d1);
  const context = {
    requestId: "req-test", environment: "test",
    access: { issuer: "https://issuer", audience: "aud" },
    gate, uploads: {}, inventory, publications: {}, admin, imports: store,
  } as unknown as FeatureContext;
  return { d1, admin, store, inventory, context, reserves };
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

async function seedPublishedChain(h: ReturnType<typeof harness>) {
  const deps = { context: h.context, store: h.admin, verifier: adminVerifier };
  const { adminRouter } = await import("../src/features/admin/route");
  const subject = {
    id: SUBJ, slug: "physics", title: { en: "Physics", si: "භෞතිකය" },
    description: null, examType: "al", code: "PHY",
    presentation: { icon: "BookOpen", color: "slate", variant: "solid" }, sortOrder: 0,
  };
  expect((await adminRouter(adminRequest("/api/v1/admin/subjects", { body: subject }), deps)).status).toBe(201);
  const paper = {
    id: PAPER, subjectId: SUBJ, examType: "al", slug: "2024", title: { en: "2024", si: "2024" },
    year: 2024, language: "si", durationMinutes: 120, questionCount: 0, questionCountSource: "admin_declared",
  };
  expect((await adminRouter(adminRequest("/api/v1/admin/papers", { body: paper }), deps)).status).toBe(201);
  const options = [0, 1, 2, 3].map((sortOrder) => ({
    id: `44444444-4444-4444-8444-44444444444${sortOrder}`, questionId: QUES,
    html: `<p>Option ${sortOrder}</p>`,
    contentSafety: { sanitizationStatus: "sanitized", sanitizerVersion: "v1" },
    sortOrder, isCorrect: sortOrder === 0,
  }));
  const question = {
    id: QUES, paperId: PAPER, number: 1, questionHtml: "<p>What is force?</p>", explanationHtml: null,
    contentSafety: { sanitizationStatus: "sanitized", sanitizerVersion: "v1" },
    options, optionCount: 4, answerMode: "single", correctOptionIndexes: [0], isAllCorrect: false, marks: 2,
  };
  expect((await adminRouter(adminRequest("/api/v1/admin/questions", { body: question }), deps)).status).toBe(201);

  const state = async (resource: string, entity: string, entityId: string, target: string) => {
    const row = await (async () => {
      switch (resource) {
        case "subjects": return h.admin.getSubject(entityId);
        case "papers": return h.admin.getPaper(entityId);
        default: return h.admin.getQuestion(entityId);
      }
    })();
    const res = await adminRouter(adminRequest(`/api/v1/admin/${resource}/${entityId}/state`, {
      body: { entity, entityId, state: target, expectedUpdatedAt: (row as { updated_at: string })!.updated_at },
    }), deps);
    expect(res.status).toBe(200);
  };
  await state("subjects", "subject", SUBJ, "published");
  await state("papers", "paper", PAPER, "published");
  await state("questions", "question", QUES, "published");
}

describe("import-export backup round-trip", () => {
  it("exports an empty database as a valid manifest with a matching checksum", async () => {
    const h = harness();
    const deps = { context: h.context, store: h.store, inventory: h.inventory, verifier: adminVerifier };
    const res = await importExportRouter(adminRequest("/api/v1/admin/export", { method: "GET" }), deps);
    expect(res.status).toBe(200);
    const checksum = res.headers.get("X-Backup-Checksum");
    expect(checksum).toMatch(/^[a-f0-9]{64}$/);
    const text = await res.text();
    expect(await sha256Hex(text)).toBe(checksum);
    // Body is canonical JSON: re-parsing validates the manifest contract.
    const manifest = BackupManifest.parse(JSON.parse(text) as unknown);
    expect(manifest.subjects).toHaveLength(0);
    expect(manifest.schemaVersion).toBe(1);
  });

  it("exports seeded content and restores it into a fresh database", async () => {
    const a = harness();
    await seedPublishedChain(a);
    const depsA = { context: a.context, store: a.store, inventory: a.inventory, verifier: adminVerifier };
    const exportRes = await importExportRouter(adminRequest("/api/v1/admin/export", { method: "GET" }), depsA);
    expect(exportRes.status).toBe(200);
    const text = await exportRes.text();
    expect(await sha256Hex(text)).toBe(exportRes.headers.get("X-Backup-Checksum"));
    const backup = BackupManifest.parse(JSON.parse(text) as unknown);
    expect(backup.subjects).toHaveLength(1);
    expect(backup.papers).toHaveLength(1);
    expect(backup.questions).toHaveLength(1);
    expect(backup.questions[0]!.state).toBe("published");
    expect(backup.questions[0]!.correctOptionIndexes).toEqual([0]);

    // Import into a fresh database.
    const b = harness();
    const depsB = { context: b.context, store: b.store, inventory: b.inventory, verifier: adminVerifier };
    const importBody = {
      format: "mehewara-v2-backup", schemaVersion: 1,
      sourceChecksum: await sha256Hex(stableStringify(backup)),
      requestedAt: new Date().toISOString(), backup,
    };
    const parsed = ImportManifest.parse(importBody);
    expect(parsed.backup.subjects).toHaveLength(1);
    const importRes = await importExportRouter(adminRequest("/api/v1/admin/import", { body: importBody, key: "import-key-0001" }), depsB);
    expect(importRes.status).toBe(200);
    const result = (await importRes.json()) as { jobId: string; status: string; importedRecords: number };
    expect(result.status).toBe("completed");
    expect(result.importedRecords).toBeGreaterThan(0);

    // Restored data matches with states intact.
    const subject = await b.admin.getSubject(SUBJ);
    expect(subject?.state).toBe("published");
    expect(subject?.title_en).toBe("Physics");
    const question = await b.admin.getQuestion(QUES);
    expect(question?.state).toBe("published");
    expect(await b.admin.listOptions(QUES)).toHaveLength(4);

    // Idempotent re-import: same key replays the same job, no duplicates.
    const replay = await importExportRouter(adminRequest("/api/v1/admin/import", { body: importBody, key: "import-key-0001" }), depsB);
    expect(replay.status).toBe(200);
    expect(((await replay.json()) as { jobId: string }).jobId).toBe(result.jobId);
    expect(await b.admin.listSubjects(10, null)).toHaveLength(1);
  });

  it("rejects tampered manifests and unsupported versions", async () => {
    const h = harness();
    const deps = { context: h.context, store: h.store, inventory: h.inventory, verifier: adminVerifier };
    const backup = BackupManifest.parse({
      format: "mehewara-v2-backup", schemaVersion: 1, createdAt: new Date().toISOString(),
      subjects: [], papers: [], questions: [], studyMaterials: [], galleryItems: [], contentPages: [],
      mediaInventory: [], sourceIdMap: [],
      publication: { currentSnapshotId: null, snapshotHistory: [] },
      about: null, privacy: null,
    });
    const good = {
      format: "mehewara-v2-backup", schemaVersion: 1,
      sourceChecksum: await sha256Hex(stableStringify(backup)),
      requestedAt: new Date().toISOString(), backup,
    };
    // Tampered checksum.
    await expect(importExportRouter(
      adminRequest("/api/v1/admin/import", { body: { ...good, sourceChecksum: "0".repeat(64) } }), deps)
    ).rejects.toMatchObject({ status: 400 });
    // Unsupported version.
    await expect(importExportRouter(
      adminRequest("/api/v1/admin/import", {
        body: { ...good, schemaVersion: 2, sourceChecksum: await sha256Hex(stableStringify(backup)) },
      }), deps)
    ).rejects.toMatchObject({ status: 400 });
  });

  it("requires authentication on export and import", async () => {
    const h = harness();
    const noAuth = { context: h.context, store: h.store, inventory: h.inventory };
    await expect(importExportRouter(adminRequest("/api/v1/admin/export", { method: "GET" }), noAuth))
      .rejects.toMatchObject({ status: 401 });
    await expect(importExportRouter(adminRequest("/api/v1/admin/import", { body: {} }), noAuth))
      .rejects.toMatchObject({ status: 401 });
  });

  it("stable-stringifies deterministically regardless of key order", async () => {
    const a = stableStringify({ z: 1, a: { d: 4, b: [3, 2] } });
    const b = stableStringify({ a: { b: [3, 2], d: 4 }, z: 1 });
    expect(a).toBe(b);
    expect(await sha256Hex(a)).toMatch(/^[a-f0-9]{64}$/);
  });
});
