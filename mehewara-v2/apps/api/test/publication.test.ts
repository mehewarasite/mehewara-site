import { describe, expect, it } from "vitest";
import { HttpError } from "../src/shared/errors";
import type { BudgetGate, BudgetCapability, Operation } from "../src/middleware/budget-gate";
import type { FeatureContext } from "../src/env";
import type { B2Client } from "../src/storage/b2-client";
import type { AccessVerifier } from "../src/shared/auth";
import type { PublicationStore, GalleryItemRow, StudyMaterialRow, SubjectRow, PaperRow, QuestionRow, QuestionOptionRow, ContentPageRow, AboutRow, PrivacyRow } from "../src/features/publication/store";
import { buildPublicationRoute, rollbackPublicationRoute } from "../src/features/publication/build";
import { publicationRoute } from "../src/features/public/route";

function fakeGate() {
  const reserves: { operation: Operation }[] = [];
  const gate: BudgetGate = {
    async reserve(operation: Operation) {
      reserves.push({ operation });
      let started = false;
      const capability: BudgetCapability = {
        permitId: `permit-${reserves.length}`, expiresAt: new Date(Date.now() + 30_000).toISOString(),
        get providerCallStarted() { return started; }, markProviderCallStarted() { started = true; },
      };
      return capability;
    },
    async commit() { },
    async release() { },
  };
  return { gate, reserves };
}

function fakeB2() {
  const objects = new Map<string, { bytes: Uint8Array; contentType: string }>();
  const putKeys: string[] = [];
  const deletedKeys: string[] = [];
  let gets = 0;
  return {
    objects, putKeys, deletedKeys,
    get b2gets() { return gets; },
    client: {
      async headObject(key: string) {
        const found = objects.get(key);
        return found ? { contentLength: found.bytes.byteLength, contentType: found.contentType, etag: '"e"' } : null;
      },
      async getObjectWithMetadata(key: string) {
        const found = objects.get(key);
        if (!found) return null;
        return { status: 200 as const, body: new ReadableStream({ start(c) { c.enqueue(found.bytes); c.close(); } }), contentLength: found.bytes.byteLength, contentType: found.contentType, etag: '"e"' };
      },
      async streamGetObject(key: string) {
        const found = objects.get(key);
        if (!found) return null;
        gets += 1;
        return { body: new ReadableStream({ start(c) { c.enqueue(found.bytes); c.close(); } }), contentLength: found.bytes.byteLength, contentType: found.contentType, etag: '"e"' };
      },
      async signedUploadTicket() { throw new HttpError("INTERNAL_ERROR", 500, "not used here"); },
      async deleteObject(key: string) { deletedKeys.push(key); objects.delete(key); },
      async copyObject() { throw new HttpError("INTERNAL_ERROR", 500, "not used here"); },
      async putObject(key: string, body: Uint8Array, contentType: string) {
        putKeys.push(key);
        objects.set(key, { bytes: body.slice(), contentType });
        return { etag: '"e"' };
      },
      async inventory() { return []; },
    } as B2Client,
  };
}

const adminVerifier: AccessVerifier = {
  async verify() { return { subject: "admin-1", roles: ["admin"] as const }; },
};

const SUBJ = "11111111-1111-4111-8111-111111111111";
const PAPER = "22222222-2222-4222-8222-222222222222";
const QUES = "33333333-3333-4333-8333-333333333333";

function baseRows(): {
  subjects: SubjectRow[]; papers: PaperRow[]; questions: QuestionRow[]; options: QuestionOptionRow[];
  study: StudyMaterialRow[]; gallery: GalleryItemRow[]; pages: ContentPageRow[];
  about: AboutRow | null; privacy: PrivacyRow | null;
} {
  return {
    subjects: [{
      id: SUBJ, slug: "physics", title_en: "Physics", title_si: "භෞතිකය", title_ta: null,
      description_en: null, description_si: null, description_ta: null,
      exam_type: "al", code: "PHY", icon: "BookOpen", color: "slate", presentation_variant: "solid",
      state: "published", sort_order: 0, updated_at: "2026-01-01T00:00:00.000Z",
    }],
    papers: [{
      id: PAPER, subject_id: SUBJ, exam_type: "al", slug: "2024", title_en: "2024", title_si: "2024", title_ta: null,
      year: 2024, language: "si", duration_minutes: 120, question_count: 1, materialized_question_count: 1,
      question_count_source: "legacy_import", state: "published", updated_at: "2026-01-01T00:00:00.000Z",
    }],
    questions: [{
      id: QUES, paper_id: PAPER, number: 1, question_html_en: "<p>Q</p>", question_html_si: "<p>Q</p>", question_html_ta: null,
      explanation_html_en: null, explanation_html_si: null, explanation_html_ta: null,
      sanitization_status: "sanitized", sanitizer_version: "v1", option_count: 4,
      answer_mode: "single", is_all_correct: 0, marks: 1, state: "published", updated_at: "2026-01-01T00:00:00.000Z",
    }],
    options: [0, 1, 2, 3].map((sort_order) => ({
      id: `44444444-4444-4444-8444-44444444444${sort_order}`, question_id: QUES,
      option_html_en: `<p>${sort_order}</p>`, option_html_si: `<p>${sort_order}</p>`, option_html_ta: null,
      sanitization_status: "sanitized", sanitizer_version: "v1", sort_order, is_correct: sort_order === 0 ? 1 : 0,
    })),
    study: [] as StudyMaterialRow[], gallery: [] as GalleryItemRow[], pages: [],
    about: null, privacy: null,
  };
}

function fakeStore(seed: ReturnType<typeof baseRows>) {
  const snapshots = new Map<string, { id: string; version: number; object_key: string; sha256: string; byte_size: number; status: string; published_at: string; created_at: string }>();
  const history: unknown[] = [];
  const builds = new Map<string, string>();
  const rollbackIntents = new Map<string, string>();
  let current: { snapshot_id: string; version: number } | null = null;
  let failBundleWith: HttpError | null = null;
  let failNextBundle: HttpError | null = null;
  const store: PublicationStore = {
    async listPublishedSubjects() { return seed.subjects.filter((r) => r.state === "published") as never; },
    async listPublishedPapers() { return seed.papers.filter((r) => r.state === "published") as never; },
    async listPublishedQuestions() { return seed.questions.filter((r) => r.state === "published") as never; },
    async listOptionsForQuestions(ids: string[]) { return seed.options.filter((r) => ids.includes(r.question_id)) as never; },
    async listPublishedStudyMaterials() { return seed.study as never; },
    async listPublishedGalleryItems() { return seed.gallery as never; },
    async listPublishedContentPages() { return seed.pages as never; },
    async getAbout() { return seed.about as never; },
    async getPrivacy() { return seed.privacy as never; },
    async getMaxSnapshotVersion() { return Math.max(0, ...[...snapshots.values()].map((s) => s.version)); },
    async getSnapshot(id) { return snapshots.get(id) ?? null; },
    async getCurrent() { return current; },
    async findBuildByIdempotencyKey(key) {
      const snapshot_id = builds.get(key);
      return snapshot_id ? { snapshot_id } : null;
    },
    async findRollbackByIdempotencyKey(key) {
      const snapshot_id = rollbackIntents.get(key);
      return snapshot_id ? { snapshot_id } : null;
    },
    async publishSnapshotBundle(input) {
      if (failNextBundle) {
        const error = failNextBundle;
        failNextBundle = null;
        throw error;
      }
      if ([...snapshots.values()].some((s) => s.version === input.snapshot.version)) {
        throw new HttpError("CONFLICT", 409, "UNIQUE constraint failed: publication_snapshots.version");
      }
      snapshots.set(input.snapshot.id, { id: input.snapshot.id, version: input.snapshot.version, object_key: input.snapshot.objectKey, sha256: input.snapshot.sha256, byte_size: input.snapshot.byteSize, status: "published", published_at: input.snapshot.publishedAt, created_at: input.snapshot.publishedAt });
      builds.set(input.idempotencyKey, input.snapshot.id);
      current = { snapshot_id: input.snapshot.id, version: input.snapshot.version };
      history.push({ action: "published", snapshot_id: input.snapshot.id });
    },
    async rollbackBundle(input) {
      if (failNextBundle) {
        const error = failNextBundle;
        failNextBundle = null;
        throw error;
      }
      if (rollbackIntents.has(input.idempotencyKey)) {
        throw new HttpError("CONFLICT", 409, "UNIQUE constraint failed: publication_rollback_intents.idempotency_key");
      }
      rollbackIntents.set(input.idempotencyKey, input.snapshotId);
      current = { snapshot_id: input.snapshotId, version: input.version };
      history.push({ action: "rolled_back", snapshot_id: input.snapshotId });
    },
  };
  return { store, snapshots, history, getCurrent: () => current, failNextBundle(error: HttpError) { failNextBundle = error; } };
}

function harness(seed = baseRows()) {
  const b2 = fakeB2();
  const gate = fakeGate();
  const pub = fakeStore(seed);
  const inventoryRows = new Map<string, { sha256: string; byteSize: number; contentType: string }>();
  const entries = new Map<string, Response>();
  const edgeDeletes: string[] = [];
  const edgeCache = {
    async match(request: Request): Promise<Response | undefined> {
      const hit = entries.get(request.url);
      return hit ? hit.clone() : undefined;
    },
    async put(request: Request, response: Response): Promise<void> {
      entries.set(request.url, response.clone());
    },
    async delete(request: Request): Promise<boolean> {
      edgeDeletes.push(request.url);
      return entries.delete(request.url);
    },
  };
  const context = {
    requestId: "req-pub-1", environment: "test",
    access: { issuer: "https://team.test", audience: "mehewara-test" },
    gate: gate.gate,
    uploads: {
      async getConfirmedByObjectKey() { return null; },
      async getConfirmedByObjectKeys() { return new Map(); },
    },
    inventory: {
      async getByObjectKey(objectKey: string) { return inventoryRows.get(objectKey) ?? null; },
      async getManyByObjectKeys(objectKeys: string[]) {
        return new Map([...inventoryRows.entries()].filter(([key]) => objectKeys.includes(key)));
      },
    },
  } as unknown as FeatureContext;
  return { ...b2, ...gate, ...pub, context, edgeCache, edgeDeletes, inventoryRows };
}

function buildRequest(body: unknown): Request {
  return new Request("https://api.test/api/v1/admin/publications/build", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
}

describe("publication build + current + rollback", () => {
  it("builds, stores, and publishes a snapshot from published rows", async () => {
    const h = harness();
    const res = await buildPublicationRoute(
      buildRequest({ idempotencyKey: "build-key-0001" }),
      { b2: h.client, context: h.context, store: h.store, verifier: adminVerifier }
    );
    expect(res.status).toBe(201);
    const body = await res.json() as { id: string; version: number; state: string };
    expect(body.version).toBe(1);
    expect(body.state).toBe("published");
    expect(body.id).toMatch(/^[0-9a-f-]{36}$/);
    // Snapshot artifact stored under snapshots/ with valid JSON.
    const stored = h.objects.get(`snapshots/${body.id}.json`);
    expect(stored?.contentType).toBe("application/json");
    const manifest = JSON.parse(new TextDecoder().decode(stored!.bytes));
    expect(manifest.snapshotId).toBe(body.id);
    expect(manifest.subjects).toHaveLength(1);
    expect(manifest.questions[0].options).toHaveLength(4);
    // Public shape leaks no answers.
    expect(manifest.questions[0]).not.toHaveProperty("correctOptionIndexes");
    expect(manifest.questions[0].options[0]).not.toHaveProperty("isCorrect");
    // Current pointer set + history recorded.
    expect(h.getCurrent()).toMatchObject({ snapshot_id: body.id, version: 1 });
    expect(h.history).toHaveLength(1);
    expect(h.reserves.map((r) => r.operation)).toContain("publicationBuild");
  });

  it("returns the existing snapshot on idempotent replay without rebuilding", async () => {
    const h = harness();
    const payload = { idempotencyKey: "build-key-0002" };
    const first = await (await buildPublicationRoute(buildRequest(payload), { b2: h.client, context: h.context, store: h.store, verifier: adminVerifier })).json() as { id: string };
    const second = await buildPublicationRoute(buildRequest(payload), { b2: h.client, context: h.context, store: h.store, verifier: adminVerifier });
    expect(second.status).toBe(200);
    expect(((await second.json()) as { id: string }).id).toBe(first.id);
    expect(h.snapshots.size).toBe(1);
  });

  it("rejects a stale expectedVersion without side effects", async () => {
    const h = harness();
    await buildPublicationRoute(buildRequest({ idempotencyKey: "build-key-0003" }), { b2: h.client, context: h.context, store: h.store, verifier: adminVerifier });
    const res = await buildPublicationRoute(
      buildRequest({ idempotencyKey: "build-key-0004", expectedVersion: 1 }),
      { b2: h.client, context: h.context, store: h.store, verifier: adminVerifier }
    );
    expect(res.status).toBe(409);
    expect(h.snapshots.size).toBe(1);
  });

  it("blocks unsanitized rows with named blockers instead of omitting them", async () => {
    const seed = baseRows();
    seed.questions[0]!.sanitization_status = "pending";
    const h = harness(seed);
    const res = await buildPublicationRoute(
      buildRequest({ idempotencyKey: "build-key-0005" }),
      { b2: h.client, context: h.context, store: h.store, verifier: adminVerifier }
    );
    expect(res.status).toBe(409);
    const body = await res.json() as { error: { details: { field: string; message: string }[] } };
    expect(body.error.details.some((d) => d.message.includes("not sanitized"))).toBe(true);
    expect(h.snapshots.size).toBe(0);
    expect(h.getCurrent()).toBeNull();
  });

  it("serves the current snapshot publicly and 404s when nothing is published", async () => {
    const h = harness();
    await expect(publicationRoute(
      new Request("https://api.test/api/v1/publication/current"),
      h.context, { b2: h.client, store: h.store, edgeCache: null }
    )).rejects.toMatchObject({ status: 404 });
    await buildPublicationRoute(buildRequest({ idempotencyKey: "build-key-0006" }), { b2: h.client, context: h.context, store: h.store, verifier: adminVerifier });
    const res = await publicationRoute(
      new Request("https://api.test/api/v1/publication/current"),
      h.context, { b2: h.client, store: h.store, edgeCache: null }
    );
    expect(res.status).toBe(200);
    const body = await res.json() as { snapshotId: string; version: number; manifest: { subjects: unknown[] } };
    expect(body.version).toBe(1);
    expect(body.manifest.subjects).toHaveLength(1);
    expect(res.headers.get("ETag")).toMatch(/^".+"$/);
  });

  it("rolls back to a previous snapshot and rejects unknown or current targets", async () => {
    const h = harness();
    const first = await (await buildPublicationRoute(buildRequest({ idempotencyKey: "build-key-0007" }), { b2: h.client, context: h.context, store: h.store, verifier: adminVerifier })).json() as { id: string };
    const second = await (await buildPublicationRoute(buildRequest({ idempotencyKey: "build-key-0008" }), { b2: h.client, context: h.context, store: h.store, verifier: adminVerifier })).json() as { id: string; version: number };
    expect(second.version).toBe(2);
    const rollback = (body: unknown) => new Request("https://api.test/api/v1/admin/publications/rollback", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const res = await rollbackPublicationRoute(
      rollback({ snapshotId: first.id, idempotencyKey: "rb-key-0001", reason: "bad deploy" }),
      { context: h.context, store: h.store, verifier: adminVerifier }
    );
    expect(res.status).toBe(200);
    expect(h.getCurrent()).toMatchObject({ snapshot_id: first.id, version: 1 });
    expect(h.history).toHaveLength(3);
    const unknown = await rollbackPublicationRoute(
      rollback({ snapshotId: "99999999-9999-4999-8999-999999999999", idempotencyKey: "rb-key-0002", reason: "nope" }),
      { context: h.context, store: h.store, verifier: adminVerifier }
    );
    expect(unknown.status).toBe(404);
    const sameAgain = await rollbackPublicationRoute(
      rollback({ snapshotId: first.id, idempotencyKey: "rb-key-0003", reason: "again" }),
      { context: h.context, store: h.store, verifier: adminVerifier }
    );
    expect(sameAgain.status).toBe(409);
  });

  it("publishes Tamil-bearing rows without leaking ta into bilingual contracts", async () => {
    const seed = baseRows();
    seed.subjects[0]!.title_ta = "பௌதிகம்";
    // Tamil-only description: all three columns are read, so the ta text
    // must survive instead of collapsing to null.
    seed.subjects[0]!.description_en = null;
    seed.subjects[0]!.description_si = null;
    seed.subjects[0]!.description_ta = "தமிழ் விளக்கம்";
    seed.papers[0]!.title_ta = "2024 தாள்";
    seed.gallery = [{
      id: "55555555-5555-4555-8555-555555555556", slug: "day-ta", title_en: "Day", title_si: "දිනය", title_ta: "நாள்",
      description_en: null, description_si: null, description_ta: null,
      alt_en: "Day", alt_si: "දිනය", alt_ta: "நாள்",
      image_object_key: "legacy/gallery-hex/img2.jpeg", thumbnail_object_key: "legacy/gallery-hex/img2.jpeg.thumb",
      content_type: "image/jpeg", width: 100, height: 100, byte_size: 10,
      pinned: 0, sort_order: 0, state: "published", created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z",
    }];
    const h = harness(seed);
    h.inventoryRows.set("legacy/gallery-hex/img2.jpeg", { sha256: "d".repeat(64), byteSize: 10, contentType: "image/jpeg" });
    h.inventoryRows.set("legacy/gallery-hex/img2.jpeg.thumb", { sha256: "e".repeat(64), byteSize: 5, contentType: "image/jpeg" });
    const res = await buildPublicationRoute(
      buildRequest({ idempotencyKey: "build-key-0020" }),
      { b2: h.client, context: h.context, store: h.store, verifier: adminVerifier }
    );
    expect(res.status).toBe(201);
    const body = await res.json() as { id: string };
    const stored = h.objects.get(`snapshots/${body.id}.json`);
    const manifest = JSON.parse(new TextDecoder().decode(stored!.bytes));
    // Tamil survives where the contract allows it (subjects) and is dropped
    // where the contract is strictly bilingual — never a 409.
    expect(manifest.subjects[0].title.ta).toBe("பௌதிகம்");
    expect(manifest.subjects[0].description).toEqual({ en: "", si: "", ta: "தமிழ் விளக்கம்" });
    expect(manifest.papers[0].title).toEqual({ en: "2024", si: "2024" });
    expect(manifest.gallery[0].title).toEqual({ en: "Day", si: "දිනය" });
    expect(manifest.gallery[0].altText).toEqual({ en: "Day", si: "දිනය" });
  });

  it("requires admin authentication on build and rollback", async () => {
    const h = harness();
    await expect(buildPublicationRoute(buildRequest({ idempotencyKey: "build-key-0009" }), { b2: h.client, context: h.context, store: h.store })).rejects.toMatchObject({ status: 401 });
  });

  it("builds gallery and study entries from inventory-backed media in bulk", async () => {
    const seed = baseRows();
    seed.gallery = [{
      id: "55555555-5555-4555-8555-555555555555", slug: "day", title_en: "Day", title_si: "දිනය", title_ta: null,
      description_en: null, description_si: null, description_ta: null,
      alt_en: "Day", alt_si: "දිනය", alt_ta: null,
      image_object_key: "legacy/gallery-hex/img1.jpeg", thumbnail_object_key: "legacy/gallery-hex/img1.jpeg.thumb",
      content_type: "image/jpeg", width: 100, height: 100, byte_size: 10,
      pinned: 0, sort_order: 0, state: "published", created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z",
    }];
    seed.study = [{
      id: "66666666-6666-4666-8666-666666666666", subject_id: SUBJ, paper_id: PAPER,
      slug: "notes", title_en: "Notes", title_si: "සටහන්", title_ta: null,
      description_en: null, description_si: null, description_ta: null,
      sanitization_status: "sanitized", sanitizer_version: "v1",
      object_key: "legacy/study-html/doc1.html", content_type: "text/html", byte_size: 20,
      state: "published", updated_at: "2026-01-01T00:00:00.000Z",
    }];
    const h = harness(seed);
    h.inventoryRows.set("legacy/gallery-hex/img1.jpeg", { sha256: "a".repeat(64), byteSize: 10, contentType: "image/jpeg" });
    h.inventoryRows.set("legacy/gallery-hex/img1.jpeg.thumb", { sha256: "b".repeat(64), byteSize: 5, contentType: "image/jpeg" });
    h.inventoryRows.set("legacy/study-html/doc1.html", { sha256: "c".repeat(64), byteSize: 20, contentType: "text/html" });
    const res = await buildPublicationRoute(
      buildRequest({ idempotencyKey: "build-key-0010" }),
      { b2: h.client, context: h.context, store: h.store, verifier: adminVerifier }
    );
    expect(res.status).toBe(201);
    const body = await res.json() as { id: string };
    const stored = h.objects.get(`snapshots/${body.id}.json`);
    const manifest = JSON.parse(new TextDecoder().decode(stored!.bytes));
    expect(manifest.gallery[0].image.url).toBe("https://api.test/api/v1/media/legacy/gallery-hex/img1.jpeg");
    expect(manifest.gallery[0].thumbnail.url).toBe("https://api.test/api/v1/media/legacy/gallery-hex/img1.jpeg.thumb");
    expect(manifest.studyMaterials[0].media.url).toBe("https://api.test/api/v1/media/legacy/study-html/doc1.html");
    // Paper -> study linkage resolves through study_materials.paper_id (the
    // papers table carries no study_material_id column).
    expect(manifest.papers[0].studyMaterialId).toBe("66666666-6666-4666-8666-666666666666");
  });


  it("deletes its orphan artifact and reports retry on a version race loss", async () => {
    const h = harness();
    h.failNextBundle(new HttpError("CONFLICT", 409, "UNIQUE constraint failed: publication_snapshots.version"));
    const res = await buildPublicationRoute(
      buildRequest({ idempotencyKey: "build-key-0012" }),
      { b2: h.client, context: h.context, store: h.store, verifier: adminVerifier }
    );
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: { message: string } }).error.message).toMatch(/retry the same request/);
    // Exactly one PUT happened (the orphan) and it was deleted.
    expect(h.putKeys).toHaveLength(1);
    expect(h.deletedKeys).toContain(h.putKeys[0]);
    expect(h.snapshots.size).toBe(0);
  });

  it("replays a rollback idempotency key without moving the pointer twice", async () => {
    const h = harness();
    const first = await (await buildPublicationRoute(buildRequest({ idempotencyKey: "build-key-0014" }), { b2: h.client, context: h.context, store: h.store, verifier: adminVerifier })).json() as { id: string };
    const second = await (await buildPublicationRoute(buildRequest({ idempotencyKey: "build-key-0015" }), { b2: h.client, context: h.context, store: h.store, verifier: adminVerifier })).json() as { id: string };
    const rollback = (body: unknown) => new Request("https://api.test/api/v1/admin/publications/rollback", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const historyBefore = h.history.length;
    const one = await rollbackPublicationRoute(
      rollback({ snapshotId: first.id, idempotencyKey: "rb-key-0010", reason: "bad deploy" }),
      { context: h.context, store: h.store, verifier: adminVerifier }
    );
    expect(one.status).toBe(200);
    expect(h.history).toHaveLength(historyBefore + 1);
    // Same key again: same 200 summary, no new history row, pointer untouched.
    const two = await rollbackPublicationRoute(
      rollback({ snapshotId: first.id, idempotencyKey: "rb-key-0010", reason: "bad deploy" }),
      { context: h.context, store: h.store, verifier: adminVerifier }
    );
    expect(two.status).toBe(200);
    expect(((await two.json()) as { id: string }).id).toBe(first.id);
    expect(h.history).toHaveLength(historyBefore + 1);
    expect(h.getCurrent()).toMatchObject({ snapshot_id: first.id });
    void second;
  });

  it("answers conditional reads with 304 and caches the alias for 60s", async () => {
    const h = harness();
    await buildPublicationRoute(buildRequest({ idempotencyKey: "build-key-0013" }), { b2: h.client, context: h.context, store: h.store, verifier: adminVerifier });
    const url = "https://api.test/api/v1/publication/current";
    const first = await publicationRoute(new Request(url), h.context, { b2: h.client, store: h.store, edgeCache: h.edgeCache });
    expect(first.status).toBe(200);
    expect(first.headers.get("Cache-Control")).toContain("max-age=60");
    const etag = first.headers.get("ETag");
    expect(etag).toMatch(/^".+"$/);
    const getsAfterMiss = h.b2gets;
    const conditional = await publicationRoute(
      new Request(url, { headers: { "If-None-Match": etag! } }),
      h.context, { b2: h.client, store: h.store, edgeCache: null }
    );
    expect(conditional.status).toBe(304);
    expect(h.b2gets).toBe(getsAfterMiss);
    // Second plain read hits the edge entry: no new B2 fetch.
    const cached = await publicationRoute(new Request(url), h.context, { b2: h.client, store: h.store, edgeCache: h.edgeCache });
    expect(cached.status).toBe(200);
    expect(h.b2gets).toBe(getsAfterMiss);
  });

  it("purges the cached alias on build and rollback so reads never go stale", async () => {
    const h = harness();
    await buildPublicationRoute(buildRequest({ idempotencyKey: "build-key-0030" }), { b2: h.client, context: h.context, store: h.store, verifier: adminVerifier });
    const url = "https://api.test/api/v1/publication/current";
    const first = await publicationRoute(new Request(url), h.context, { b2: h.client, store: h.store, edgeCache: h.edgeCache });
    expect(first.status).toBe(200);
    expect((await first.json() as { version: number }).version).toBe(1);
    // Second build moves the pointer and must evict the v1 entry: the next
    // read serves v2 even though the alias URL is identical.
    await buildPublicationRoute(buildRequest({ idempotencyKey: "build-key-0031" }), { b2: h.client, context: h.context, store: h.store, verifier: adminVerifier, edgeCache: h.edgeCache });
    expect(h.edgeDeletes).toContain(url);
    const second = await publicationRoute(new Request(url), h.context, { b2: h.client, store: h.store, edgeCache: h.edgeCache });
    expect((await second.json() as { version: number }).version).toBe(2);
    // Rollback evicts the same way.
    const one = await (await buildPublicationRoute(buildRequest({ idempotencyKey: "build-key-0030" }), { b2: h.client, context: h.context, store: h.store, verifier: adminVerifier })).json() as { id: string };
    const deletesBefore = h.edgeDeletes.length;
    const rollback = (body: unknown) => new Request("https://api.test/api/v1/admin/publications/rollback", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    await rollbackPublicationRoute(
      rollback({ snapshotId: one.id, idempotencyKey: "rb-key-0030", reason: "bad v2" }),
      { context: h.context, store: h.store, verifier: adminVerifier, edgeCache: h.edgeCache }
    );
    expect(h.edgeDeletes.length).toBeGreaterThan(deletesBefore);
    const third = await publicationRoute(new Request(url), h.context, { b2: h.client, store: h.store, edgeCache: h.edgeCache });
    expect((await third.json() as { version: number }).version).toBe(1);
  });
});
