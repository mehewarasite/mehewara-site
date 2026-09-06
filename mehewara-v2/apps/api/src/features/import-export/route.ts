import {
  BackupManifest, ImportManifest, ImportExportResult as ImportExportResultContract,
  Subject, Paper, AdminQuestion, StudyMaterial, GalleryMetadata, ContentPage,
  AdminAboutProfile, PrivacyPolicy,
} from "@mehewara-v2/contracts";
import { HttpError } from "../../shared/errors";
import { requireAdmin, type AccessVerifier, type AdminPrincipal } from "../../shared/auth";
import { requireIdempotencyKey } from "../../shared/idempotency";
import { parseBody, requireMethod } from "../../shared/validation";
import { withBudget } from "../../middleware/budget-gate";
import type { FeatureContext } from "../../env";
import type { ImportStore } from "./store";
import type { MediaInventoryStore } from "../media/inventory";
import type { QuestionOptionRow } from "../publication/store";
import { mapSubject, mapPaper, mapQuestion, mapStudy, mapGallery, mapPage, mapAbout, aboutImageView, num } from "../../shared/content-mappers";
import { normalizeAnswerShape, checkOptionsShape } from "../../shared/question-shape";

export interface ImportExportDeps {
  context: FeatureContext;
  store: ImportStore;
  inventory: MediaInventoryStore;
  verifier?: AccessVerifier;
}

async function authed(request: Request, deps: ImportExportDeps): Promise<AdminPrincipal> {
  return requireAdmin(request, deps.context.access, deps.verifier);
}

/**
 * Contract -> row shape converters for import upserts.
 * The BackupManifest uses contract shapes; upsert methods need row shapes.
 */
function toSubjectUpsert(s: Subject, state: string) {
  return {
    id: s.id, source_legacy_id: s.legacyId ?? null, slug: s.slug,
    title_en: s.title.en, title_si: s.title.si, title_ta: s.title.ta ?? null,
    description_en: s.description?.en ?? null, description_si: s.description?.si ?? null, description_ta: s.description?.ta ?? null,
    exam_type: s.examType, code: s.code, icon: s.presentation.icon, color: s.presentation.color,
    presentation_variant: s.presentation.variant, state, sort_order: s.sortOrder,
  };
}

function toPaperUpsert(p: Paper, state: string) {
  return {
    id: p.id, source_legacy_id: p.legacyId ?? null, subject_id: p.subjectId, slug: p.slug,
    exam_type: p.examType, title_en: p.title.en, title_si: p.title.si, title_ta: null,
    year: p.year, language: p.language, duration_minutes: p.durationMinutes,
    question_count: p.questionCount, materialized_question_count: p.materializedQuestionCount,
    question_count_source: p.questionCountSource, state,
  };
}

function toStudyUpsert(s: StudyMaterial, state: string) {
  return {
    id: s.id, source_legacy_id: s.legacyId ?? null, subject_id: s.subjectId, paper_id: s.paperId, slug: s.slug,
    title_en: s.title.en, title_si: s.title.si, title_ta: null,
    description_en: s.description?.en ?? null, description_si: s.description?.si ?? null, description_ta: null,
    sanitization_status: s.contentSafety.sanitizationStatus, sanitizer_version: s.contentSafety.sanitizerVersion,
    object_key: s.objectKey, content_type: s.contentType, byte_size: s.byteSize, sha256: null, state,
  };
}

function toGalleryUpsert(g: GalleryMetadata, state: string) {
  return {
    id: g.id, source_legacy_id: g.legacyId ?? null, slug: g.slug,
    title_en: g.title.en, title_si: g.title.si, title_ta: null,
    description_en: g.description?.en ?? "", description_si: g.description?.si ?? "", description_ta: null,
    alt_en: g.altText.en, alt_si: g.altText.si, alt_ta: null,
    image_object_key: g.imageObjectKey, thumbnail_object_key: g.thumbnailObjectKey,
    content_type: g.contentType, image_sha256: "", thumbnail_sha256: "",
    width: g.width, height: g.height, byte_size: g.byteSize, thumbnail_byte_size: 0,
    pinned: num(g.pinned), sort_order: g.sortOrder, state,
  };
}

function toPageUpsert(c: ContentPage, state: string) {
  return {
    id: c.id, source_legacy_id: c.legacyId ?? null, slug: c.slug,
    title_en: c.title.en, title_si: c.title.si, title_ta: null,
    body_en: c.body.en, body_si: c.body.si, body_ta: null, state,
  };
}

/** Canonical JSON: sorted keys, no whitespace. The export checksum and the
 *  import verification must hash identical bytes for identical manifests. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) as string;
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([key, val]) => `${JSON.stringify(key)}:${stableStringify(val)}`).join(",")}}`;
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Bounded JSON body parsing with a caller-chosen cap (import manifests
 *  legitimately exceed the shared 1 MiB API cap; 10 MiB bounds memory). */
async function parseBoundedJson<T>(request: Request, schema: { safeParse(raw: unknown): { success: true; data: T } | { success: false; error: { issues: { message?: string }[] } } }, maxBytes: number): Promise<T> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    throw new HttpError("BAD_REQUEST", 400, "Content-Type must be application/json");
  }
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError("BAD_REQUEST", 400, "Missing request body");
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const part = await reader.read();
    if (part.done) break;
    total += part.value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new HttpError("BAD_REQUEST", 400, "Request body is too large");
    }
    chunks.push(part.value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch {
    throw new HttpError("BAD_REQUEST", 400, "Malformed JSON body");
  }
  const result = schema.safeParse(raw);
  if (!result.success) { console.error(JSON.stringify(result.error.issues, null, 2));
    throw new HttpError("BAD_REQUEST", 400, "Request validation failed", {
      issue: result.error.issues[0]?.message ?? "invalid body",
    });
  }
  if (!result.success) console.error(JSON.stringify(result.error.issues, null, 2));
  return result.data;
}

const EXPORT_QUESTION_CEILING = 2000;
export const IMPORT_BODY_CAP = 50_000_000;

/**
 * GET /api/v1/admin/export — full BackupManifest download. Pure read:
 * authenticated + budgeted, no idempotency key (nothing mutates). The
 * manifest bytes are the response body; their SHA-256 rides along in
 * X-Backup-Checksum so import can verify end-to-end integrity.
 */
async function exportRoute(request: Request, deps: ImportExportDeps): Promise<Response> {
  const { context, store, inventory } = deps;
  requireMethod(request, "GET");
  await authed(request, deps);

  const manifest = await withBudget(context.gate, "adminBackupExport", async (permit) => {
    permit.markProviderCallStarted();

    const count = await store.countQuestions();
    if (count > EXPORT_QUESTION_CEILING) {
      throw new HttpError("CONFLICT", 409, "Backup export capped at 2000 questions; larger databases restore through chunked import files");
    }

    const subjects = (await store.listAllSubjects()).map((row) => Subject.parse(mapSubject(row)));
    const studyRows = await store.listAllStudyMaterials();
    const galleryRows = await store.listAllGalleryItems();
    const paperRows = await store.listAllPapers();

    const studyIdByPaperId = new Map<string, string>();
    for (const study of studyRows) {
      if (study.paper_id && !studyIdByPaperId.has(study.paper_id)) studyIdByPaperId.set(study.paper_id, study.id);
    }

    const papers = paperRows.map((row) => Paper.parse(mapPaper(row, studyIdByPaperId.get(row.id) ?? null)));
    const questions = await store.listAllQuestions();
    const optionRows = await store.listOptionsForQuestions(questions.map((q) => q.id));
    const optionsByQuestion = new Map<string, QuestionOptionRow[]>();
    for (const opt of optionRows) {
      const arr = optionsByQuestion.get(opt.question_id) ?? [];
      arr.push(opt);
      optionsByQuestion.set(opt.question_id, arr);
    }

    const adminQuestions = questions.map((q) => AdminQuestion.parse(mapQuestion(q, optionsByQuestion.get(q.id) ?? [])));
    const studyMaterials = studyRows.map((row) => StudyMaterial.parse(mapStudy(row)));
    const gallery = galleryRows.map((row) => GalleryMetadata.parse(mapGallery(row)));
    const pages = (await store.listAllContentPages()).map((row) => ContentPage.parse(mapPage(row)));

    const aboutRow = await store.getAbout();
    const about = aboutRow
      ? AdminAboutProfile.parse(mapAbout(aboutRow, await aboutImageView(
        (objectKey) => inventory.getByObjectKey(objectKey), aboutRow.image_object_key)))
      : null;

    const privacyRow = await store.getPrivacy();
    const privacy = privacyRow ? PrivacyPolicy.parse({
      id: "privacy", statement: privacyRow.statement, fullHtml: privacyRow.full_html,
      contentSafety: { sanitizationStatus: privacyRow.sanitization_status, sanitizerVersion: privacyRow.sanitizer_version },
      updatedAt: privacyRow.updated_at,
    }) : null;

    const legacyMap = await store.listLegacyIdMap();
    const mediaInv = await store.listMediaInventory();
    const snapHistory = await store.listSnapshotHistory();

    return BackupManifest.parse({
      format: "mehewara-v2-backup",
      schemaVersion: 1,
      createdAt: new Date().toISOString(),
      subjects,
      papers,
      questions: adminQuestions,
      studyMaterials,
      galleryItems: gallery,
      contentPages: pages,
      mediaInventory: mediaInv.map((row) => ({
        objectKey: row.object_key,
        purpose: row.purpose,
        sha256: row.sha256,
        byteSize: row.byte_size,
        contentType: row.content_type,
        referencedByManifest: true,
        sourceKind: "other" as const,
      })),
      sourceIdMap: legacyMap.map((row) => ({
        sourceSystem: row.source_system, entityType: row.entity_type, sourceId: row.source_id, v2Id: row.v2_id,
      })),
      publication: {
        currentSnapshotId: null,
        snapshotHistory: snapHistory.map((row) => ({
          snapshotId: row.snapshot_id,
          version: row.version,
          action: row.action as "published" | "rolled_back",
          at: row.created_at,
        })),
      },
      about,
      privacy,
    });
  });

  const body = stableStringify(manifest);
  const response = new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "X-Backup-Checksum": await sha256Hex(body),
    },
  });
  return response;
}

function jobResult(job: { id: string; status: string; manifest_checksum: string; imported_records: number; error_code: string | null }): Response {
  const status = job.status === "completed" ? "completed" : job.status === "failed" ? "failed" : "running";
  return Response.json(ImportExportResultContract.parse({
    jobId: job.id,
    operation: "import",
    status,
    importedRecords: job.imported_records,
    exportedRecords: 0,
    checksum: job.manifest_checksum,
    errorCode: job.error_code,
  }));
}

/**
 * POST /api/v1/admin/import — restore a BackupManifest. Idempotent by key
 * (descriptor {entityType:"import"} replays the job row), audited, and
 * checksummed end-to-end. Two phases: draft upserts in chunked permits,
 * then state application in dependency order, then manifest metadata.
 * Upserts make same-manifest retries converge; a mid-import crash marks
 * the job failed and the retry resumes to completion.
 */
async function importRoute(request: Request, deps: ImportExportDeps): Promise<Response> {
  const { context, store } = deps;
  const admin = context.admin;
  requireMethod(request, "POST");
  const principal = await authed(request, deps);
  const key = requireIdempotencyKey(request);
  const scoped = `admin:import:${key}`;
  const manifest = await parseBoundedJson(request, ImportManifest, IMPORT_BODY_CAP);

  if (manifest.schemaVersion !== 1) throw new HttpError("BAD_REQUEST", 400, "Unsupported backup schema version");
  const backup = manifest.backup;
  const checksum = await sha256Hex(stableStringify(backup));
  if (checksum !== manifest.sourceChecksum) throw new HttpError("BAD_REQUEST", 400, "Manifest checksum mismatch");

  return withBudget(context.gate, "adminBackupImportChunk", async (permit) => {
    permit.markProviderCallStarted();
    const prior = await admin.findIdempotency(scoped);
    if (prior) {
      const job = await store.getImportJob(prior.descriptor.entityId ?? "");
      if (job) return jobResult(job);
    }

    const jobId = crypto.randomUUID();
    await store.createImportJob(jobId, principal.subject, checksum);
    await store.setImportJobStatus(jobId, "running", 0, null);

    const finish = async (status: "completed" | "failed", importedRecords: number, errorCode: string | null): Promise<Response> => {
      await store.setImportJobStatus(jobId, status, importedRecords, errorCode);
      await admin.appendAudit({
        actorId: principal.subject, action: "backup.import", entityType: "import", entityId: jobId,
        requestId: context.requestId, metadata: { status, checksum },
      });
      try {
        await admin.recordIdempotency(scoped, 200, { entityType: "import", entityId: jobId });
      } catch (error) {
        if (error instanceof HttpError && error.code === "CONFLICT") {
          const winner = await admin.findIdempotency(scoped);
          if (winner) {
            const job = await store.getImportJob(winner.descriptor.entityId ?? "");
            if (job) return jobResult(job);
          }
        }
        throw error;
      }
      const job = await store.getImportJob(jobId);
      if (!job) throw new HttpError("INTERNAL_ERROR", 500, "Import job vanished");
      return jobResult(job);
    };

    try {
      let imported = 0;
      const chunk = async <T>(items: T[], size: number, fn: (batch: T[]) => Promise<void>): Promise<void> => {
        for (let i = 0; i < items.length; i += size) {
          const batch = items.slice(i, i + size);
          await withBudget(context.gate, "adminBackupImportChunk", async (chunkPermit) => {
            chunkPermit.markProviderCallStarted();
            await fn(batch);
          });
          imported += batch.length;
          await store.setImportJobStatus(jobId, "running", imported, null);
        }
      };

      // Phase 1: draft upserts (trigger-safe: questions cannot be born published).
      // Manifest inventory is the authoritative checksum/size source on
      // restore (the live inventory may be empty on a fresh database).
      const manifestInventory = new Map(backup.mediaInventory.map((m) => [m.objectKey, m]));
      await chunk(backup.subjects, 50, async (batch) => {
        for (const s of batch) await store.upsertSubject(toSubjectUpsert(s, "draft"));
      });
      await chunk(backup.papers, 50, async (batch) => {
        for (const p of batch) await store.upsertPaper(toPaperUpsert(p, "draft"));
      });
      await chunk(backup.questions, 5, async (batch) => {
        for (const q of batch) {
          checkOptionsShape(q.options, q.optionCount);
          const shape = normalizeAnswerShape(
            q.options.map((opt, index) => ({ isCorrect: q.correctOptionIndexes.includes(index) })),
            q.isAllCorrect,
          );
          const options = q.options.map((opt) => ({
            id: opt.id, question_id: q.id, option_html_en: opt.html, option_html_si: opt.html, option_html_ta: null,
            sanitization_status: opt.contentSafety.sanitizationStatus, sanitizer_version: opt.contentSafety.sanitizerVersion,
            sort_order: opt.sortOrder, is_correct: num(q.correctOptionIndexes.includes(opt.sortOrder)),
          }));
          await store.upsertQuestionDraft({
            id: q.id, paper_id: q.paperId, number: q.number, question_html_en: q.questionHtml,
            question_html_si: q.questionHtml, question_html_ta: null,
            explanation_html_en: q.explanationHtml, explanation_html_si: q.explanationHtml, explanation_html_ta: null,
            sanitization_status: q.contentSafety.sanitizationStatus, sanitizer_version: q.contentSafety.sanitizerVersion,
            option_count: q.optionCount, answer_mode: shape.answerMode, is_all_correct: num(q.isAllCorrect),
            marks: q.marks ?? 1, marks_source: "admin",
          }, options);
        }
      });
      await chunk(backup.studyMaterials, 50, async (batch) => {
        for (const s of batch) {
          const row = toStudyUpsert(s, "draft");
          const inv = manifestInventory.get(s.objectKey);
          await store.upsertStudyMaterial({ ...row, sha256: inv?.sha256 ?? null });
        }
      });
      await chunk(backup.galleryItems, 50, async (batch) => {
        for (const g of batch) {
          const row = toGalleryUpsert(g, "draft");
          const image = manifestInventory.get(g.imageObjectKey);
          const thumb = manifestInventory.get(g.thumbnailObjectKey);
          await store.upsertGalleryItem({
            ...row,
            image_sha256: image?.sha256 ?? "",
            thumbnail_sha256: thumb?.sha256 ?? "",
            thumbnail_byte_size: thumb?.byteSize ?? 0,
          });
        }
      });
      await chunk(backup.contentPages, 50, async (batch) => {
        for (const c of batch) await store.upsertContentPage(toPageUpsert(c, "draft"));
      });

      // Phase 2: states in dependency order (parents before children, so
      // publish-requires triggers hold). Null tokens: a restore is
      // authoritative, not an edit.
      const applyStates = async <T extends { id: string; state: string }>(
        items: T[], size: number, setState: (id: string, state: string) => Promise<unknown>,
      ): Promise<void> => {
        for (let i = 0; i < items.length; i += size) {
          const batch = items.slice(i, i + size);
          await withBudget(context.gate, "adminBackupImportChunk", async (chunkPermit) => {
            chunkPermit.markProviderCallStarted();
            for (const item of batch) await setState(item.id, item.state);
          });
        }
      };
      await applyStates(backup.subjects, 50, (id, state) => admin.setSubjectState(id, state, null));
      await applyStates(backup.papers, 50, (id, state) => admin.setPaperState(id, state, null));
      await applyStates(backup.questions, 5, (id, state) => admin.setQuestionState(id, state, null));
      await applyStates(backup.studyMaterials, 50, (id, state) => admin.setStudyMaterialState(id, state, null));
      await applyStates(backup.galleryItems, 50, (id, state) => admin.setGalleryItemState(id, state, null));
      await applyStates(backup.contentPages, 50, (id, state) => admin.setContentPageState(id, state, null));

      // Phase 3: manifest metadata (id map, inventory, snapshot history).
      // Snapshot B2 artifacts are NOT recreated here; the pointer rebuilds
      // on the next publish (or stays as restored below when artifacts exist).
      await withBudget(context.gate, "adminBackupImportChunk", async (chunkPermit) => {
        chunkPermit.markProviderCallStarted();
        await store.upsertLegacyIdMap(backup.sourceIdMap.map((m) => ({
          source_system: m.sourceSystem, entity_type: m.entityType, source_id: m.sourceId, v2_id: m.v2Id,
        })));
        await store.upsertMediaInventory(backup.mediaInventory.map((m) => ({
          object_key: m.objectKey, purpose: m.purpose, sha256: m.sha256, byte_size: m.byteSize, content_type: m.contentType,
        })));
        for (const snap of backup.publication.snapshotHistory) {
          await store.upsertSnapshotHistory({
            id: crypto.randomUUID(), snapshot_id: snap.snapshotId, version: snap.version,
            action: snap.action, actor_id: principal.subject, reason: "restored",
          });
        }
        if (backup.publication.currentSnapshotId) {
          const current = backup.publication.snapshotHistory.find((s) => s.snapshotId === backup.publication.currentSnapshotId);
          if (current) await store.upsertCurrentPointer(current.snapshotId, current.version);
        }
      });

      if (backup.about) {
        await admin.upsertAbout({
          id: "about",
          description: backup.about.description,
          image_object_key: backup.about.image?.objectKey ?? null,
          image_url: null,
          facebook_url: backup.about.social.facebookUrl,
          youtube_url: backup.about.social.youtubeUrl,
          linkedin_url: backup.about.social.linkedinUrl,
        });
        imported += 1;
      }
      if (backup.privacy) {
        await admin.upsertPrivacy({
          id: "privacy",
          statement: backup.privacy.statement,
          full_html: backup.privacy.fullHtml,
          sanitization_status: backup.privacy.contentSafety.sanitizationStatus,
          sanitizer_version: backup.privacy.contentSafety.sanitizerVersion,
        });
        imported += 1;
      }

      return finish("completed", imported, null);
    } catch (error) {
      console.error(error);
      const code = error instanceof HttpError ? error.code : "INTERNAL_ERROR";
      return finish("failed", 0, code);
    }
  });
}

async function importExportRouter(request: Request, deps: ImportExportDeps): Promise<Response> {
  const url = new URL(request.url);
  const rest = url.pathname.slice("/api/v1/admin/".length);
  const [resource] = rest.split("/");
  if (!resource) throw new HttpError("NOT_FOUND", 404, "Route not found");

  if (resource === "export") return exportRoute(request, deps);
  if (resource === "import") return importRoute(request, deps);
  throw new HttpError("NOT_FOUND", 404, "Route not found");
}

export { importRoute, exportRoute, importExportRouter };
