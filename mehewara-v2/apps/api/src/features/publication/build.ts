import { z } from "zod";
import {
  PublicationManifest, CurrentPublication, PublicationSnapshot,
  PublishSnapshotCommand, RollbackSnapshotCommand,
} from "@mehewara-v2/contracts";
import { HttpError, apiError } from "../../shared/errors";
import { requireAdmin, type AccessVerifier } from "../../shared/auth";
import { parseJson, parseBody } from "../../shared/validation";
import { withBudget } from "../../middleware/budget-gate";
import type { FeatureContext } from "../../env";
import type { B2Client } from "../../storage/b2-client";
import type {
  PublicationStore, SubjectRow, PaperRow, QuestionRow, QuestionOptionRow,
  StudyMaterialRow, GalleryItemRow, ContentPageRow,
} from "./store";
import type { MediaEdgeCache } from "../media/route";

type Manifest = z.infer<typeof PublicationManifest>;

function text3(en: string, si: string, ta: string | null): { en: string; si: string; ta?: string } {
  return ta == null ? { en, si } : { en, si, ta };
}
/**
 * Strict bilingual text (Paper, StudyMaterial, GalleryMetadata, ContentPage
 * titles/bodies/alt): the contracts allow en/si ONLY, so Tamil columns must
 * never leak through — a ta-bearing row would otherwise fail contract
 * validation and block publication of valid Tamil content. Subjects use
 * LocalizedText (which permits ta) and keep text3.
 */
function text2(en: string, si: string): { en: string; si: string } {
  return { en, si };
}

function safety(status: string, version: string | null): { sanitizationStatus: "pending" | "sanitized" | "rejected"; sanitizerVersion: string | null } {
  if (status !== "pending" && status !== "sanitized" && status !== "rejected") {
    throw new HttpError("INTERNAL_ERROR", 500, `Unexpected sanitization status in published rows: ${status}`);
  }
  return { sanitizationStatus: status, sanitizerVersion: version };
}

/** Media a publishable manifest may reference, with its authoritative type/size. */
interface ResolvedMedia { contentType: string; byteSize: number; }

/**
 * Bulk-resolves every media key a snapshot may reference with exactly two
 * bounded D1 queries (one per store, 100-key chunks inside): confirmed
 * uploads win over migration inventory on collision. Per-item lookups would
 * multiply D1 reads by the media count and break the build permit's budget.
 */
async function resolveAllMedia(
  ctx: FeatureContext, objectKeys: string[]
): Promise<Map<string, ResolvedMedia>> {
  const unique = [...new Set(objectKeys)];
  const [confirmed, inventoried] = await Promise.all([
    ctx.uploads.getConfirmedByObjectKeys(unique),
    ctx.inventory.getManyByObjectKeys(unique),
  ]);
  const resolved = new Map<string, ResolvedMedia>();
  for (const key of unique) {
    const upload = confirmed.get(key);
    if (upload) {
      resolved.set(key, { contentType: upload.contentType, byteSize: upload.actualByteSize ?? upload.declaredByteSize });
      continue;
    }
    const record = inventoried.get(key);
    if (record) resolved.set(key, { contentType: record.contentType, byteSize: record.byteSize });
  }
  return resolved;
}

export interface BuildDeps {
  b2: B2Client;
  context: FeatureContext;
  store: PublicationStore;
}

/**
 * Assembles the current published snapshot. Every entity must already be
 * `published`; every rich-text record `sanitized`; every referenced object
 * key resolvable through a confirmed upload or the migration inventory.
 * Anything else is a 409 blocker, never a silent omission — the manifest
 * must describe exactly what the database holds.
 */
export async function assembleManifest(store: PublicationStore, ctx: FeatureContext, origin: string, snapshotId: string, version: number, publishedAt: string): Promise<{ manifest: Manifest; blockers: string[] }> {
  const blockers: string[] = [];
  const mediaUrl = (objectKey: string): string => `${origin}/api/v1/media/${objectKey}`;

  const subjects = (await store.listPublishedSubjects()).map((row: SubjectRow) => ({
    id: row.id, slug: row.slug, title: text3(row.title_en, row.title_si, row.title_ta),
    description: row.description_en == null && row.description_si == null && row.description_ta == null ? null : text3(row.description_en ?? "", row.description_si ?? "", row.description_ta),
    examType: row.exam_type as "ol" | "al", code: row.code,
    presentation: { icon: row.icon, color: row.color, variant: row.presentation_variant as "solid" | "gradient" | "muted" },
    state: "published" as const, sortOrder: row.sort_order, updatedAt: row.updated_at,
  }));

  const paperRows = await store.listPublishedPapers();

  const questionRows = await store.listPublishedQuestions();
  const optionRows = await store.listOptionsForQuestions(questionRows.map((row) => row.id));
  const optionsByQuestion = new Map<string, QuestionOptionRow[]>();
  for (const option of optionRows) {
    const list = optionsByQuestion.get(option.question_id) ?? [];
    list.push(option);
    optionsByQuestion.set(option.question_id, list);
  }
  const questions = [];
  for (const row of questionRows) {
    const options = (optionsByQuestion.get(row.id) ?? []).sort((a, b) => a.sort_order - b.sort_order);
    if (options.length !== row.option_count || (options.length !== 4 && options.length !== 5)) {
      blockers.push(`question ${row.id} has ${options.length} options but declares ${row.option_count}`);
      continue;
    }
    const unsanitized = row.sanitization_status !== "sanitized" || options.some((o) => o.sanitization_status !== "sanitized");
    if (unsanitized) {
      blockers.push(`question ${row.id} is not sanitized`);
      continue;
    }
    const correctOptionIndexes = options
      .map((option, idx) => (option.is_correct === 1 || (option.is_correct as unknown) === true ? idx : -1))
      .filter((idx) => idx >= 0);
    questions.push({
      id: row.id, paperId: row.paper_id, number: row.number,
      questionHtml: row.question_html_en, explanationHtml: row.explanation_html_en,
      contentSafety: safety(row.sanitization_status, row.sanitizer_version),
      options: options.map((option) => ({
        id: option.id, questionId: option.question_id, html: option.option_html_en,
        contentSafety: safety(option.sanitization_status, option.sanitizer_version),
        sortOrder: option.sort_order,
        isCorrect: option.is_correct === 1 || (option.is_correct as unknown) === true,
      })),
      optionCount: options.length as 4 | 5,
      answerMode: (row.answer_mode as "single" | "multiple" | "all") || (correctOptionIndexes.length === options.length ? "all" : correctOptionIndexes.length > 1 ? "multiple" : "single"),
      correctOptionIndexes: correctOptionIndexes.length > 0 ? correctOptionIndexes : [0],
      isAllCorrect: row.is_all_correct === 1 || (row.is_all_correct as unknown) === true || (correctOptionIndexes.length === options.length),
      marks: row.marks, state: "published" as const, updatedAt: row.updated_at,
    });
  }

  const studyRows = await store.listPublishedStudyMaterials();
  const galleryRows = await store.listPublishedGalleryItems();
  const aboutRow = await store.getAbout();
  const mediaKeys: string[] = [];
  for (const row of studyRows) if (row.object_key) mediaKeys.push(row.object_key);
  for (const row of galleryRows) mediaKeys.push(row.image_object_key, row.thumbnail_object_key);
  if (aboutRow?.image_object_key) mediaKeys.push(aboutRow.image_object_key);
  const media = await resolveAllMedia(ctx, mediaKeys);

  const studyMaterials = [];
  for (const row of studyRows) {
    if (row.sanitization_status !== "sanitized") {
      blockers.push(`study material ${row.id} is not sanitized`);
      continue;
    }
    if (!row.object_key) {
      blockers.push(`study material ${row.id} has no object to serve`);
      continue;
    }
    const resolved = row.object_key ? media.get(row.object_key) : undefined;
    if (!resolved) {
      blockers.push(`study material ${row.id} references unknown object ${row.object_key}`);
      continue;
    }
    studyMaterials.push({
      id: row.id, subjectId: row.subject_id, paperId: row.paper_id, slug: row.slug,
      title: text2(row.title_en, row.title_si),
      description: row.description_en == null && row.description_si == null ? null : text2(row.description_en ?? "", row.description_si ?? ""),
      // Resolved media describes the actually served object; row columns are
      // the fallback for legacy rows predating strict metadata.
      contentType: resolved.contentType, byteSize: resolved.byteSize,
      state: "published" as const, updatedAt: row.updated_at,
      media: { kind: "document" as const, url: mediaUrl(row.object_key), contentType: resolved.contentType, byteSize: resolved.byteSize },
    });
  }

  // The D1 link runs study_materials.paper_id -> papers.id (papers carry no
  // study_material_id column), so resolve each paper's study material from
  // the successfully published study set. First wins deterministically;
  // blocked study rows leave no dangling reference.
  const studyIdByPaperId = new Map<string, string>();
  for (const study of studyMaterials) {
    if (study.paperId && !studyIdByPaperId.has(study.paperId)) studyIdByPaperId.set(study.paperId, study.id);
  }
  const papers = paperRows.map((row: PaperRow) => ({
    id: row.id, subjectId: row.subject_id, examType: row.exam_type as "ol" | "al", slug: row.slug,
    title: text2(row.title_en, row.title_si), year: row.year,
    language: row.language as "en" | "si", durationMinutes: row.duration_minutes,
    questionCount: row.question_count, materializedQuestionCount: row.materialized_question_count,
    questionCountSource: row.question_count_source as "legacy_import" | "derived_from_questions" | "admin_declared",
    studyMaterialId: studyIdByPaperId.get(row.id) ?? null, state: "published" as const, updatedAt: row.updated_at,
  }));

  const gallery = [];
  for (const row of galleryRows) {
    const image = media.get(row.image_object_key);
    const thumbnail = media.get(row.thumbnail_object_key);
    if (!image || !thumbnail) {
      blockers.push(`gallery item ${row.id} references unknown media`);
      continue;
    }
    gallery.push({
      id: row.id, slug: row.slug,
      title: text2(row.title_en, row.title_si),
      description: row.description_en == null && row.description_si == null ? null : text2(row.description_en ?? "", row.description_si ?? ""),
      altText: text2(row.alt_en, row.alt_si),
      contentType: image.contentType, width: row.width, height: row.height, byteSize: image.byteSize,
      state: "published" as const, createdAt: row.created_at, updatedAt: row.updated_at,
      pinned: row.pinned === 1, sortOrder: row.sort_order,
      image: { kind: "image" as const, url: mediaUrl(row.image_object_key), contentType: image.contentType, byteSize: image.byteSize, width: row.width, height: row.height },
      thumbnail: { kind: "thumbnail" as const, url: mediaUrl(row.thumbnail_object_key), contentType: thumbnail.contentType },
    });
  }

  const pages = (await store.listPublishedContentPages()).map((row: ContentPageRow) => ({
    id: row.id, slug: row.slug, title: text2(row.title_en, row.title_si),
    body: text2(row.body_en, row.body_si),
    state: "published" as const, updatedAt: row.updated_at,
  }));

  // aboutRow was already loaded for key collection above; reuse it rather
  // than spending a second read.
  let about = null;
  if (aboutRow) {
    let image = null;
    if (aboutRow.image_object_key) {
      const resolved = media.get(aboutRow.image_object_key);
      if (!resolved) {
        blockers.push(`about profile references unknown object ${aboutRow.image_object_key}`);
      } else {
        image = { kind: "image" as const, url: mediaUrl(aboutRow.image_object_key), contentType: resolved.contentType };
      }
    }
    about = {
      id: "about" as const, description: aboutRow.description, image,
      social: { facebookUrl: aboutRow.facebook_url, youtubeUrl: aboutRow.youtube_url, linkedinUrl: aboutRow.linkedin_url },
      updatedAt: aboutRow.updated_at,
    };
  }

  const privacyRow = await store.getPrivacy();
  let privacy = null;
  if (privacyRow) {
    if (privacyRow.sanitization_status !== "sanitized") {
      blockers.push("privacy policy is not sanitized");
    } else {
      privacy = {
        id: "privacy" as const, statement: privacyRow.statement, fullHtml: privacyRow.full_html,
        contentSafety: safety(privacyRow.sanitization_status, privacyRow.sanitizer_version),
        updatedAt: privacyRow.updated_at,
      };
    }
  }

  const manifest = {
    snapshotId, version, publishedAt,
    subjects, papers, questions, studyMaterials, gallery, pages, about, privacy,
  };
  const parsed = PublicationManifest.safeParse(manifest);
  if (!parsed.success) {
    blockers.push(`assembled manifest failed contract validation: ${parsed.error.issues[0]?.message ?? "unknown"}`);
    return { manifest: manifest as Manifest, blockers };
  }
  return { manifest: parsed.data, blockers };
}

function snapshotSummary(row: { id: string; version: number; published_at: string; created_at: string }): z.infer<typeof PublicationSnapshot> {
  return { id: row.id, version: row.version, state: "published", publishedAt: row.published_at, createdAt: row.created_at };
}

/** Hard ceiling for one snapshot artifact: the budget charges declared
 *  bytes, and unbounded manifests would let a runaway catalog reserve past
 *  any sane allowance. 10 MiB holds hundreds of thousands of entities. */
export const MAX_SNAPSHOT_BYTES = 10_000_000;

/** POST /api/v1/admin/publications/build — validate, assemble, store, publish. */
export async function buildPublicationRoute(request: Request, deps: { b2: B2Client; context: FeatureContext; store: PublicationStore; verifier?: AccessVerifier; edgeCache?: MediaEdgeCache | null }): Promise<Response> {
  const principal = await requireAdmin(request, deps.context.access, deps.verifier);
  const body = await parseBody(request, deps.context.requestId, () => parseJson(request, PublishSnapshotCommand));
  if (!body.ok) return body.response;
  const command = body.value;
  // TTL 300 covers assembly of large catalogs plus the artifact PUT; the
  // default 30s permit could be swept mid-build, stranding work unaccounted.
  // TTL 300 covers assembly of large catalogs plus the artifact PUT; the
  // default 30s permit could be swept mid-build, stranding work unaccounted.
  return withBudget(deps.context.gate, "publicationBuild", async (permit) => {
    permit.markProviderCallStarted();
    const replay = await deps.store.findBuildByIdempotencyKey(command.idempotencyKey);
    if (replay) {
      const snapshot = await deps.store.getSnapshot(replay.snapshot_id);
      if (!snapshot) throw new HttpError("INTERNAL_ERROR", 500, "Build record points at a missing snapshot");
      return Response.json(snapshotSummary(snapshot), { status: 200 });
    }
    const version = (await deps.store.getMaxSnapshotVersion()) + 1;
    if (command.expectedVersion !== undefined && command.expectedVersion !== version) {
      return apiError("CONFLICT", `Expected version ${command.expectedVersion} but the next version is ${version}`, deps.context.requestId, 409);
    }
    const origin = new URL(request.url).origin;
    const snapshotId = crypto.randomUUID();
    const publishedAt = new Date().toISOString();
    const { manifest, blockers } = await assembleManifest(deps.store, deps.context, origin, snapshotId, version, publishedAt);
    if (blockers.length > 0) {
      const details = blockers.slice(0, 50).map((message, index) => ({ field: `blockers[${index}]`, message }));
      return apiError("CONFLICT", "Published content is not ready for snapshotting", deps.context.requestId, 409, details);
    }
    const bytes = new TextEncoder().encode(JSON.stringify(manifest));
    if (bytes.byteLength > MAX_SNAPSHOT_BYTES) {
      return apiError("BAD_REQUEST", `Snapshot artifact ${bytes.byteLength} bytes exceeds the ${MAX_SNAPSHOT_BYTES} byte ceiling`, deps.context.requestId, 400);
    }
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const sha256 = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
    const objectKey = `snapshots/${snapshotId}.json`;
    // The artifact PUT + snapshot row run under their own snapshotArtifactWrite
    // permit with the exact declared bytes (the outer publicationBuild permit
    // covers assembly reads + pointer/history writes, not the artifact).
    // D1 insert failure propagates: the B2 object may dangle without a row,
    // which is the safe direction (dangling bytes are never served; a row
    // without bytes would 404 the public read). Orphaned artifacts carry the
    // snapshots/ prefix for sweeper reconciliation.
    try {
      await withBudget(deps.context.gate, "snapshotArtifactWrite", async (artifactPermit) => {
        artifactPermit.markProviderCallStarted();
        await deps.b2.putObject(objectKey, bytes, "application/json");
        await deps.store.publishSnapshotBundle({
          snapshot: { id: snapshotId, version, objectKey, sha256, byteSize: bytes.byteLength, publishedAt },
          idempotencyKey: command.idempotencyKey,
          actorId: principal.subject,
          reason: command.reason ?? "snapshot build",
        });
      }, { declaredBytes: bytes.byteLength, ttlSeconds: 300 });
    } catch (error) {
      if (error instanceof HttpError && error.status === 409) {
        // Lost a version/id race with a concurrent build: remove our orphan
        // artifact, then answer from our own idempotency record if it somehow
        // exists, else tell the caller to retry (which mints a fresh version).
        await deps.b2.deleteObject(objectKey).catch(() => undefined);
        const winner = await deps.store.findBuildByIdempotencyKey(command.idempotencyKey);
        if (winner) {
          const snapshot = await deps.store.getSnapshot(winner.snapshot_id);
          if (snapshot) return Response.json(snapshotSummary(snapshot), { status: 200 });
        }
        return apiError("CONFLICT", `Version ${version} raced with a concurrent build; retry the same request`, deps.context.requestId, 409);
      }
      throw error;
    }
    const stored = await deps.store.getSnapshot(snapshotId);
    if (!stored) throw new HttpError("INTERNAL_ERROR", 500, "Snapshot was not stored");
    await purgeCurrentAlias(request, deps.edgeCache);
    return Response.json(snapshotSummary(stored), { status: 201 });
  }, { ttlSeconds: 300 });
}

/** POST /api/v1/admin/publications/rollback — move the current pointer back. */
export async function rollbackPublicationRoute(request: Request, deps: { context: FeatureContext; store: PublicationStore; verifier?: AccessVerifier; edgeCache?: MediaEdgeCache | null }): Promise<Response> {
  const principal = await requireAdmin(request, deps.context.access, deps.verifier);
  const body = await parseBody(request, deps.context.requestId, () => parseJson(request, RollbackSnapshotCommand));
  if (!body.ok) return body.response;
  const command = body.value;
  return withBudget(deps.context.gate, "publicationPointerMove", async (permit) => {
    permit.markProviderCallStarted();
    // Idempotent replay first: the same key returns the recorded outcome
    // without appending duplicate history or moving the pointer again.
    const prior = await deps.store.findRollbackByIdempotencyKey(command.idempotencyKey);
    if (prior) {
      const snapshot = await deps.store.getSnapshot(prior.snapshot_id);
      if (!snapshot) throw new HttpError("INTERNAL_ERROR", 500, "Rollback record points at a missing snapshot");
      return Response.json(snapshotSummary(snapshot), { status: 200 });
    }
    const snapshot = await deps.store.getSnapshot(command.snapshotId);
    if (!snapshot || snapshot.status !== "published") {
      return apiError("NOT_FOUND", "Snapshot not found or not published", deps.context.requestId, 404);
    }
    const current = await deps.store.getCurrent();
    if (current && current.snapshot_id === snapshot.id) {
      return apiError("CONFLICT", "That snapshot is already current", deps.context.requestId, 409);
    }
    try {
      await deps.store.rollbackBundle({
        snapshotId: snapshot.id, version: snapshot.version,
        actorId: principal.subject, reason: command.reason, idempotencyKey: command.idempotencyKey,
      });
    } catch (error) {
      // Lost an idempotency race with a concurrent identical rollback: the
      // winner's record is the idempotent answer.
      if (error instanceof HttpError && error.status === 409) {
        const winner = await deps.store.findRollbackByIdempotencyKey(command.idempotencyKey);
        if (winner) {
          const winnerSnapshot = await deps.store.getSnapshot(winner.snapshot_id);
          if (winnerSnapshot) return Response.json(snapshotSummary(winnerSnapshot), { status: 200 });
        }
      }
      throw error;
    }
    // Summary from the already-read target row: no reread needed, and the
    // bundle above is the only writer, so this cannot be stale.
    await purgeCurrentAlias(request, deps.edgeCache);
    return Response.json(snapshotSummary({ ...snapshot, created_at: snapshot.created_at }), { status: 200 });
  });
}

/**
 * Evicts the cached `/api/v1/publication/current` alias after a pointer
 * move. The read path keys entries by request URL, so the canonical
 * same-origin alias URL addresses exactly the entry a browser would hit.
 * Best-effort by design: a failed purge only extends the documented 60s
 * alias staleness bound, and the 60s Cache-Control caps CDN copies anyway.
 */
async function purgeCurrentAlias(request: Request, edgeCache?: MediaEdgeCache | null): Promise<void> {
  const edge = edgeCache ?? (globalThis as { caches?: { default?: MediaEdgeCache } }).caches?.default ?? null;
  if (!edge?.delete) return;
  try {
    await edge.delete(new Request(new URL(request.url).origin + "/api/v1/publication/current"));
  } catch {
    // Purge failures must never fail the pointer move itself.
  }
}

/**
 * GET /api/v1/publication/current — the only public read contract. Resolves
 * the current pointer, streams the immutable snapshot JSON from B2,
 * validates it against the contract, and serves it with the same edge-cache
 * semantics as media (hits cost zero downstream; only 200s populate).
 */
export async function currentPublicationRoute(
  request: Request,
  deps: { b2: B2Client; context: FeatureContext; store: PublicationStore; edgeCache?: MediaEdgeCache | null },
): Promise<Response> {
  const edge = deps.edgeCache ?? (globalThis as { caches?: { default?: MediaEdgeCache } }).caches?.default ?? null;
  if (edge) {
    const hit = await edge.match(request);
    if (hit) return hit;
  }
  return withBudget(deps.context.gate, "publicSnapshotRead", async (permit) => {
    permit.markProviderCallStarted();
    const current = await deps.store.getCurrent();
    if (!current) throw new HttpError("NOT_FOUND", 404, "No publication has been published yet");
    const snapshot = await deps.store.getSnapshot(current.snapshot_id);
    if (!snapshot || snapshot.status !== "published") throw new HttpError("NOT_FOUND", 404, "Current snapshot is unavailable");
    const etag = `"${snapshot.sha256}"`;
    // Conditional read before the B2 fetch: matching ETags answer 304 with
    // D1 costs only, never touching object storage.
    if (request.headers.get("If-None-Match") === etag) {
      return new Response(null, { status: 304, headers: { ETag: etag, "Cache-Control": "public, max-age=60, must-revalidate" } });
    }
    const object = await deps.b2.streamGetObject(snapshot.object_key);
    if (!object) throw new HttpError("NOT_FOUND", 404, "Current snapshot is unavailable");
    const text = await new Response(object.body).text();
    let manifest: unknown;
    try {
      manifest = JSON.parse(text);
    } catch {
      throw new HttpError("INTERNAL_ERROR", 502, "Stored snapshot is not valid JSON");
    }
    const parsed = PublicationManifest.safeParse(manifest);
    if (!parsed.success || parsed.data.snapshotId !== snapshot.id || parsed.data.version !== snapshot.version) {
      throw new HttpError("INTERNAL_ERROR", 502, "Stored snapshot failed contract validation");
    }
    const body: z.infer<typeof CurrentPublication> = {
      snapshotId: snapshot.id, version: snapshot.version, publishedAt: snapshot.published_at, manifest: parsed.data,
    };
    const response = Response.json(body, {
      status: 200,
      // Short alias TTL: build/rollback purge the edge entry on pointer
      // moves, but CDN copies keyed by URL can linger — 60s bounds that
      // staleness for the mutable alias (immutable snapshot bytes are
      // addressed by content hash and never change).
      headers: { "Cache-Control": "public, max-age=60, must-revalidate", "ETag": etag },
    });
    if (edge) {
      // Purge-then-fill is unnecessary: the entry key is this request URL and
      // pointer moves overwrite via put on next miss. Explicitly evict first
      // so a crashed put cannot leave the previous snapshot behind.
      await edge.delete?.(request).catch(() => false);
      await edge.put(request, response.clone());
    }
    return response;
  });
}
