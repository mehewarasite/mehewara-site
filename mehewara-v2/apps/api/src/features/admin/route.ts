import {
  Subject, SubjectCreate, SubjectUpdate, Paper, PaperCreate, PaperUpdate,
  AdminQuestion, AdminQuestionCreate, AdminQuestionUpdate, StudyMaterial, StudyMaterialCreate, StudyMaterialUpdate,
  GalleryMetadata, GalleryItemCreate, GalleryItemUpdate, ContentPage, ContentPageCreate, ContentPageUpdate,
  AdminAboutProfile, AboutPut, PrivacyPolicy, PrivacyPut, DraftPublishCommand, AdminContentStatistics,
} from "@mehewara-v2/contracts";
import type { FeatureContext } from "../../env";
import type { BudgetGate, BudgetCapability } from "../../middleware/budget-gate";
import { withBudget } from "../../middleware/budget-gate";
import { HttpError, apiError } from "../../shared/errors";
import { normalizeAnswerShape, checkOptionsShape } from "../../shared/question-shape";
import { loc3, loc3n, loc2, bool, num, mapSubject, mapPaper, mapOption, mapQuestion, mapStudy, mapGallery, mapPage, mapAbout, aboutImageView } from "../../shared/content-mappers";
import { requireAdmin, type AccessVerifier, type AdminPrincipal } from "../../shared/auth";
import { requireIdempotencyKey } from "../../shared/idempotency";
import { parseBody, parseJson, requireMethod } from "../../shared/validation";
import type { AdminStore, AuditInput, IdempotencyDescriptor } from "./store";
import type {
  SubjectRow, PaperRow, QuestionRow, QuestionOptionRow, StudyMaterialRow,
  GalleryItemRow, ContentPageRow, AboutRow, PrivacyRow,
} from "../publication/store";

export interface AdminDeps {
  context: FeatureContext;
  store: AdminStore;
  db?: any; // Raw D1Database for auth endpoints
  verifier?: AccessVerifier;
  /** Set by the router after authentication; handlers must use it instead
   *  of re-verifying (and must never run without it). */
  principal?: AdminPrincipal;
}

// Shared route plumbing.

function badRequest(requestId: string, message: string): Response {
  return apiError("BAD_REQUEST", message, requestId, 400);
}

function parseListQuery(url: URL): { limit: number; cursor: string | null } | { error: string } {
  const rawLimit = url.searchParams.get("limit") ?? "50";
  const limit = Number(rawLimit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) return { error: "limit must be an integer between 1 and 100" };
  const cursor = url.searchParams.get("cursor");
  if (cursor !== null && !/^[A-Za-z0-9._~-]{1,200}$/.test(cursor)) return { error: "cursor is invalid" };
  return { limit, cursor };
}

function pageResponse(items: unknown[], limit: number): Response {
  const nextCursor = items.length === limit ? (items[items.length - 1] as { id: string }).id : null;
  return Response.json({ items, nextCursor });
}

async function authed(request: Request, deps: AdminDeps): Promise<AdminPrincipal> {
  if (deps.principal) return deps.principal;
  return requireAdmin(request, deps.context.access, deps.verifier);
}

/**
 * Exactly-once admin mutation wrapper. A retried Idempotency-Key replays by
 * re-reading the recorded descriptor (entity type + id) through the GET
 * mappers — never stored bodies, which are unbounded (a 5-option question
 * can exceed 3MB). A concurrent same-key race resolves to the winner's
 * record (the store maps a duplicate key insert onto CONFLICT, which
 * replays the winner). Scopes are namespaced per operation AND entity id,
 * so a key can never replay across different entities or routes.
 *
 * Only 2xx outcomes are recorded (the table CHECKs it): missing targets
 * throw NOT_FOUND before any audit or record, so a miss writes nothing.
 * Ordering inside the permit is mutation -> audit -> record: the common
 * client-timeout retry is covered by the record. Creates additionally heal
 * the crash window (applied but unrecorded) by re-reading on UNIQUE: a
 * retry finds the row, completes the sidecars, and answers 200.
 *
 * Concurrent same-key use is client misuse (keys are random per request):
 * races converge on one row with request-id-distinguishable audits, but
 * only serial reuse is exactly-once. A lease/claim scheme was deliberately
 * rejected — a crashed holder would poison the key.
 */
async function mutate(opts: {
  request: Request; deps: AdminDeps; principal: AdminPrincipal; scope: string;
  action: string; entityType: string;
  run: (permit: BudgetCapability) => Promise<{ status: number; body: unknown; entityId: string | null; deleted?: boolean; meta?: Record<string, string> }>;
}): Promise<Response> {
  const { request, deps, principal, scope, action, entityType, run } = opts;
  const key = requireIdempotencyKey(request);
  const scoped = `${scope}:${key}`;
  return withBudget(deps.context.gate, "adminContentWrite", async (permit) => {
    permit.markProviderCallStarted();
    const prior = await deps.store.findIdempotency(scoped);
    if (prior) return Response.json(await replayRead(deps, prior.descriptor), { status: prior.status });
    const out = await run(permit);
    const audit: AuditInput = {
      actorId: principal.subject, action, entityType, entityId: out.entityId,
      requestId: deps.context.requestId, metadata: out.meta ?? {},
    };
    await deps.store.appendAudit(audit);
    try {
      await deps.store.recordIdempotency(scoped, out.status, {
        entityType, entityId: out.entityId, ...(out.deleted ? { deleted: true as const } : {}),
      });
    } catch (error) {
      // Lost a same-key race after applying: the winner's record is the
      // idempotent answer. Anything else propagates.
      if (error instanceof HttpError && error.code === "CONFLICT") {
        const winner = await deps.store.findIdempotency(scoped);
        if (winner) return Response.json(await replayRead(deps, winner.descriptor), { status: winner.status });
      }
      throw error;
    }
    return Response.json(out.body, { status: out.status });
  });
}

async function read<T>(gate: BudgetGate, op: "adminContentRead", fn: (permit: BudgetCapability) => Promise<T>): Promise<T> {
  return withBudget(gate, op, async (permit) => {
    permit.markProviderCallStarted();
    return fn(permit);
  });
}

/**
 * Replays a recorded mutation by re-reading the descriptor (entity type +
 * id) through the same mappers as GET (descriptors, never stored bodies —
 * see 0005). At most 3 D1 reads (question + options), inside the caller's
 * permit. Singleton descriptors carry a null id and dispatch before the
 * UUID null-check.
 */
async function replayRead(deps: AdminDeps, descriptor: IdempotencyDescriptor): Promise<unknown> {
  const { store } = deps;
  if (descriptor.deleted) return { id: descriptor.entityId, deleted: true };
  if (descriptor.entityType === "about") {
    const about = await store.getAbout();
    if (!about) throw new HttpError("GONE", 410, "Recorded about profile no longer exists");
    return AdminAboutProfile.parse(mapAbout(about, await aboutImageView((key) => deps.context.inventory.getByObjectKey(key), about.image_object_key)));
  }
  if (descriptor.entityType === "privacy") {
    const privacy = await store.getPrivacy();
    if (!privacy) throw new HttpError("GONE", 410, "Recorded privacy policy no longer exists");
    return PrivacyPolicy.parse({
      id: "privacy", statement: privacy.statement, fullHtml: privacy.full_html,
      contentSafety: { sanitizationStatus: privacy.sanitization_status, sanitizerVersion: privacy.sanitizer_version },
      updatedAt: privacy.updated_at,
    });
  }
  const id = descriptor.entityId;
  if (!id) throw new HttpError("INTERNAL_ERROR", 500, "Idempotency record has no entity");
  switch (descriptor.entityType) {
    case "subject": {
      const row = await store.getSubject(id);
      if (!row) throw new HttpError("GONE", 410, "Recorded subject no longer exists");
      return Subject.parse(mapSubject(row));
    }
    case "paper": {
      const row = await store.getPaper(id);
      if (!row) throw new HttpError("GONE", 410, "Recorded paper no longer exists");
      return Paper.parse(mapPaper(row, await store.findStudyIdByPaper(id)));
    }
    case "question": {
      const row = await store.getQuestion(id);
      if (!row) throw new HttpError("GONE", 410, "Recorded question no longer exists");
      return AdminQuestion.parse(mapQuestion(row, await store.listOptions(id)));
    }
    case "study_material": {
      const row = await store.getStudyMaterial(id);
      if (!row) throw new HttpError("GONE", 410, "Recorded study material no longer exists");
      return StudyMaterial.parse(mapStudy(row));
    }
    case "gallery_item": {
      const row = await store.getGalleryItem(id);
      if (!row) throw new HttpError("GONE", 410, "Recorded gallery item no longer exists");
      return GalleryMetadata.parse(mapGallery(row));
    }
    case "content_page": {
      const row = await store.getContentPage(id);
      if (!row) throw new HttpError("GONE", 410, "Recorded content page no longer exists");
      return ContentPage.parse(mapPage(row));
    }
    default: throw new HttpError("INTERNAL_ERROR", 500, "Unknown recorded entity type");
  }
}

/**
 * Publish-readiness for questions. Write paths normalize the answer triple
 * from option flags, but legacy/imported rows predate that — so publish and
 * published-row edits re-verify the full invariant, not just status.
 */
async function assertQuestionPublishReady(row: QuestionRow, options: QuestionOptionRow[]): Promise<void> {
  if (row.sanitization_status !== "sanitized") throw new HttpError("CONFLICT", 409, "Only sanitized questions can be published");
  if (!row.sanitizer_version) throw new HttpError("CONFLICT", 409, "Published questions require a sanitizer version");
  const sorted = [...options].sort((a, b) => a.sort_order - b.sort_order);
  if (sorted.length !== row.option_count) throw new HttpError("CONFLICT", 409, "Published question option count mismatch");
  if (sorted.some((option) => option.sanitization_status !== "sanitized")) {
    throw new HttpError("CONFLICT", 409, "Only questions with all options sanitized can be published");
  }
  if (sorted.some((option) => option.sanitization_status === "sanitized" && !option.sanitizer_version)) {
    throw new HttpError("CONFLICT", 409, "Published options require a sanitizer version");
  }
  const correct = sorted.filter((option) => bool(option.is_correct)).length;
  if (correct === 0) throw new HttpError("CONFLICT", 409, "Published questions require a correct option");
  // Derive from the flags, never from the stored flag: a legacy row with
  // is_all_correct=1 but partial flags must not publish as "all".
  const allCorrect = correct === sorted.length;
  const derived = allCorrect ? "all" : correct > 1 ? "multiple" : "single";
  if (derived !== row.answer_mode || bool(row.is_all_correct) !== allCorrect) {
    throw new HttpError("CONFLICT", 409, "Published question answer shape is inconsistent");
  }
}

/** Publish-readiness for study materials (no D1 trigger covered them before
 *  migration 0006; the route check stays for clear messages). Pure over
 *  already-fetched rows so update paths reuse their cached reads. */
function checkStudyReady(
  row: { sanitization_status: string; sanitizer_version: string | null; object_key: string | null; paper_id: string | null },
  subject: { state: string } | null, paper: { state: string } | null,
): void {
  if (row.sanitization_status !== "sanitized") throw new HttpError("CONFLICT", 409, "Only sanitized study materials can be published");
  if (!row.sanitizer_version) throw new HttpError("CONFLICT", 409, "Published study materials require a sanitizer version");
  if (!row.object_key) throw new HttpError("CONFLICT", 409, "Study material has no object to serve");
  if (!subject || subject.state !== "published") throw new HttpError("CONFLICT", 409, "Study material requires a published subject");
  if (row.paper_id && (!paper || paper.state !== "published")) throw new HttpError("CONFLICT", 409, "Study material requires a published paper");
}

async function assertStudyPublishReady(store: AdminStore, row: StudyMaterialRow): Promise<void> {
  checkStudyReady(row, await store.getSubject(row.subject_id), row.paper_id ? await store.getPaper(row.paper_id) : null);
}

// Entity handlers. Each returns a Response; the router maps subpaths.

async function subjectsRoute(request: Request, deps: AdminDeps, id: string | null, sub: string | null): Promise<Response> {
  const { context, store } = deps;
  if (request.method === "GET" && id === null) {
    const query = parseListQuery(new URL(request.url));
    if ("error" in query) return badRequest(context.requestId, query.error);
    const rows = await read(context.gate, "adminContentRead", () => store.listSubjects(query.limit, query.cursor));
    return pageResponse(rows.map(mapSubject).map((body) => Subject.parse(body)), query.limit);
  }
  if (request.method === "GET" && id !== null && sub === null) {
    const row = await read(context.gate, "adminContentRead", () => store.getSubject(id));
    if (!row) return apiError("NOT_FOUND", "Subject not found", context.requestId, 404);
    return Response.json(Subject.parse(mapSubject(row)));
  }
  if (request.method === "POST" && id === null) {
    const principal = await authed(request, deps);
    const body = await parseBody(request, context.requestId, () => parseJson(request, SubjectCreate));
    if (!body.ok) return body.response;
    return mutate({
      request, deps, principal, scope: `admin:subjects:create:${body.value.id}`, action: "subject.create", entityType: "subject",
      run: async () => {
        // Crash-window healing: if the insert collides, the row may be an
        // unrecorded apply from our own crashed attempt (mutation committed,
        // record lost). Re-reading and completing the sidecars converges;
        // a genuine duplicate id answers with the existing row (200, not
        // 201), standard idempotent-create semantics for client UUIDs.
        try {
          const created = await store.insertSubject({
            id: body.value.id, slug: body.value.slug, title_en: body.value.title.en, title_si: body.value.title.si,
            title_ta: body.value.title.ta ?? null, description_en: body.value.description?.en ?? null,
            description_si: body.value.description?.si ?? null, description_ta: body.value.description?.ta ?? null,
            exam_type: body.value.examType, code: body.value.code, icon: body.value.presentation.icon,
            color: body.value.presentation.color, presentation_variant: body.value.presentation.variant,
            sort_order: body.value.sortOrder,
          });
          return { status: 201, body: Subject.parse(mapSubject(created)), entityId: created.id, meta: { slug: created.slug } };
        } catch (error) {
          if (error instanceof HttpError && error.code === "CONFLICT") {
            const existing = await store.getSubject(body.value.id);
            if (existing) return { status: 200, body: Subject.parse(mapSubject(existing)), entityId: existing.id };
          }
          throw error;
        }
      },
    });
  }
  if ((request.method === "PATCH" || request.method === "PUT") && id !== null && sub === null) {
    const principal = await authed(request, deps);
    const body = await parseBody(request, context.requestId, () => parseJson(request, SubjectUpdate));
    if (!body.ok) return body.response;
    const { expectedUpdatedAt, ...fields } = body.value;
    return mutate({
      request, deps, principal, scope: `admin:subjects:update:${id}`, action: "subject.update", entityType: "subject",
      run: async () => {
        const patch: Record<string, unknown> = {};
        if (fields.slug !== undefined) patch.slug = fields.slug;
        if (fields.title !== undefined) { patch.title_en = fields.title.en; patch.title_si = fields.title.si; patch.title_ta = fields.title.ta ?? null; }
        if (fields.description !== undefined) {
          patch.description_en = fields.description?.en ?? null;
          patch.description_si = fields.description?.si ?? null;
          patch.description_ta = fields.description?.ta ?? null;
        }
        if (fields.examType !== undefined) patch.exam_type = fields.examType;
        if (fields.code !== undefined) patch.code = fields.code;
        if (fields.presentation !== undefined) {
          patch.icon = fields.presentation.icon; patch.color = fields.presentation.color;
          patch.presentation_variant = fields.presentation.variant;
        }
        if (fields.sortOrder !== undefined) patch.sort_order = fields.sortOrder;
        const updated = await store.updateSubject(id, patch, expectedUpdatedAt);
        if (!updated) throw new HttpError("NOT_FOUND", 404, "Subject not found");
        return { status: 200, body: Subject.parse(mapSubject(updated)), entityId: id };
      },
    });
  }
  if (request.method === "POST" && id !== null && sub === "state") {
    const principal = await authed(request, deps);
    const body = await parseBody(request, context.requestId, () => parseJson(request, DraftPublishCommand));
    if (!body.ok) return body.response;
    if (body.value.entity !== "subject" || body.value.entityId !== id) return badRequest(context.requestId, "Command entity must be subject with the path id");
    return mutate({
      request, deps, principal, scope: `admin:subjects:state:${id}`, action: "subject.state", entityType: "subject",
      run: async () => {
        const updated = await store.setSubjectState(id, body.value.state, body.value.expectedUpdatedAt);
        if (!updated) throw new HttpError("NOT_FOUND", 404, "Subject not found");
        return { status: 200, body: Subject.parse(mapSubject(updated)), entityId: id, meta: { state: body.value.state } };
      },
    });
  }
  if (request.method === "DELETE" && id !== null && sub === null) {
    const principal = await authed(request, deps);
    return mutate({
      request, deps, principal, scope: `admin:subjects:delete:${id}`, action: "subject.delete", entityType: "subject",
      run: async () => {
        const existing = await store.getSubject(id);
        if (!existing) throw new HttpError("NOT_FOUND", 404, "Subject not found");
        if (existing.state === "published") throw new HttpError("CONFLICT", 409, "Published subjects cannot be deleted; archive first");
        await store.deleteSubject(id);
        return { status: 200, body: { id, deleted: true }, entityId: id, deleted: true };
      },
    });
  }
  throw new HttpError("NOT_FOUND", 404, "Route not found");
}

async function papersRoute(request: Request, deps: AdminDeps, id: string | null, sub: string | null): Promise<Response> {
  const { context, store } = deps;
  if (request.method === "GET" && id === null) {
    const url = new URL(request.url);
    const query = parseListQuery(url);
    if ("error" in query) return badRequest(context.requestId, query.error);
    const subjectId = url.searchParams.get("subjectId");
    const rows = await read(context.gate, "adminContentRead", async () => {
      const listed = await store.listPapers(subjectId, query.limit, query.cursor);
      const links = await store.findStudyIdsByPapers(listed.map((row) => row.id));
      return listed.map((row) => Paper.parse(mapPaper(row, links.get(row.id) ?? null)));
    });
    return pageResponse(rows, query.limit);
  }
  if (request.method === "GET" && id !== null && sub === null) {
    const body = await read(context.gate, "adminContentRead", async () => {
      const row = await store.getPaper(id);
      if (!row) return null;
      return Paper.parse(mapPaper(row, await store.findStudyIdByPaper(id)));
    });
    if (!body) return apiError("NOT_FOUND", "Paper not found", context.requestId, 404);
    return Response.json(body);
  }
  if (request.method === "POST" && id === null) {
    const principal = await authed(request, deps);
    const body = await parseBody(request, context.requestId, () => parseJson(request, PaperCreate));
    if (!body.ok) return body.response;
    return mutate({
      request, deps, principal, scope: `admin:papers:create:${body.value.id}`, action: "paper.create", entityType: "paper",
      run: async () => {
        const parent = await store.getSubject(body.value.subjectId);
        if (!parent) throw new HttpError("NOT_FOUND", 404, "Subject not found");
        try {
          const created = await store.insertPaper({
            id: body.value.id, subject_id: body.value.subjectId, exam_type: body.value.examType, slug: body.value.slug,
            // Papers are bilingual by contract (Paper.title is en/si); the
            // title_ta column stays null and is never read by the build.
            title_en: body.value.title.en, title_si: body.value.title.si, title_ta: null,
            year: body.value.year, language: body.value.language, duration_minutes: body.value.durationMinutes,
            question_count: body.value.questionCount, question_count_source: body.value.questionCountSource,
          });
          return { status: 201, body: Paper.parse(mapPaper(created, null)), entityId: created.id, meta: { slug: created.slug } };
        } catch (error) {
          if (error instanceof HttpError && error.code === "CONFLICT") {
            const existing = await store.getPaper(body.value.id);
            if (existing) {
              return { status: 200, body: Paper.parse(mapPaper(existing, await store.findStudyIdByPaper(existing.id))), entityId: existing.id };
            }
          }
          throw error;
        }
      },
    });
  }
  if ((request.method === "PATCH" || request.method === "PUT") && id !== null && sub === null) {
    const principal = await authed(request, deps);
    const body = await parseBody(request, context.requestId, () => parseJson(request, PaperUpdate));
    if (!body.ok) return body.response;
    const { expectedUpdatedAt, ...fields } = body.value;
    return mutate({
      request, deps, principal, scope: `admin:papers:update:${id}`, action: "paper.update", entityType: "paper",
      run: async () => {
        if (fields.subjectId !== undefined) {
          const parent = await store.getSubject(fields.subjectId);
          if (!parent) throw new HttpError("NOT_FOUND", 404, "Subject not found");
        }
        const patch: Record<string, unknown> = {};
        if (fields.subjectId !== undefined) patch.subject_id = fields.subjectId;
        if (fields.examType !== undefined) patch.exam_type = fields.examType;
        if (fields.slug !== undefined) patch.slug = fields.slug;
        if (fields.title !== undefined) { patch.title_en = fields.title.en; patch.title_si = fields.title.si; }
        if (fields.year !== undefined) patch.year = fields.year;
        if (fields.language !== undefined) patch.language = fields.language;
        if (fields.durationMinutes !== undefined) patch.duration_minutes = fields.durationMinutes;
        if (fields.questionCount !== undefined) patch.question_count = fields.questionCount;
        if (fields.questionCountSource !== undefined) patch.question_count_source = fields.questionCountSource;
        const updated = await store.updatePaper(id, patch, expectedUpdatedAt);
        if (!updated) throw new HttpError("NOT_FOUND", 404, "Paper not found");
        return { status: 200, body: Paper.parse(mapPaper(updated, await store.findStudyIdByPaper(id))), entityId: id };
      },
    });
  }
  if (request.method === "POST" && id !== null && sub === "state") {
    const principal = await authed(request, deps);
    const body = await parseBody(request, context.requestId, () => parseJson(request, DraftPublishCommand));
    if (!body.ok) return body.response;
    if (body.value.entity !== "paper" || body.value.entityId !== id) return badRequest(context.requestId, "Command entity must be paper with the path id");
    return mutate({
      request, deps, principal, scope: `admin:papers:state:${id}`, action: "paper.state", entityType: "paper",
      run: async () => {
        const updated = await store.setPaperState(id, body.value.state, body.value.expectedUpdatedAt);
        if (!updated) throw new HttpError("NOT_FOUND", 404, "Paper not found");
        return { status: 200, body: Paper.parse(mapPaper(updated, await store.findStudyIdByPaper(id))), entityId: id, meta: { state: body.value.state } };
      },
    });
  }
  if (request.method === "DELETE" && id !== null && sub === null) {
    const principal = await authed(request, deps);
    return mutate({
      request, deps, principal, scope: `admin:papers:delete:${id}`, action: "paper.delete", entityType: "paper",
      run: async () => {
        const existing = await store.getPaper(id);
        if (!existing) throw new HttpError("NOT_FOUND", 404, "Paper not found");
        if (existing.state === "published") throw new HttpError("CONFLICT", 409, "Published papers cannot be deleted; archive first");
        await store.deletePaper(id);
        return { status: 200, body: { id, deleted: true }, entityId: id, deleted: true };
      },
    });
  }
  throw new HttpError("NOT_FOUND", 404, "Route not found");
}

async function questionsRoute(request: Request, deps: AdminDeps, id: string | null, sub: string | null): Promise<Response> {
  const { context, store } = deps;
  if (request.method === "GET" && id === null) {
    const url = new URL(request.url);
    const paperId = url.searchParams.get("paperId");
    if (!paperId) return badRequest(context.requestId, "paperId query is required");
    const query = parseListQuery(url);
    if ("error" in query) return badRequest(context.requestId, query.error);
    const bodies = await read(context.gate, "adminContentRead", async () => {
      const rows = await store.listQuestionsByPaper(paperId, query.limit, query.cursor);
      const optionsByQuestion = await store.listOptionsForQuestions(rows.map((row) => row.id));
      const grouped = new Map<string, QuestionOptionRow[]>();
      for (const option of optionsByQuestion) {
        const list = grouped.get(option.question_id) ?? [];
        list.push(option);
        grouped.set(option.question_id, list);
      }
      return rows.map((row) => AdminQuestion.parse(mapQuestion(row, grouped.get(row.id) ?? [])));
    });
    return pageResponse(bodies, query.limit);
  }
  if (request.method === "GET" && id !== null && sub === null) {
    const body = await read(context.gate, "adminContentRead", async () => {
      const row = await store.getQuestion(id);
      if (!row) return null;
      return AdminQuestion.parse(mapQuestion(row, await store.listOptions(id)));
    });
    if (!body) return apiError("NOT_FOUND", "Question not found", context.requestId, 404);
    return Response.json(body);
  }
  if (request.method === "POST" && id === null) {
    const principal = await authed(request, deps);
    const body = await parseBody(request, context.requestId, () => parseJson(request, AdminQuestionCreate));
    if (!body.ok) return body.response;
    return mutate({
      request, deps, principal, scope: `admin:questions:create:${body.value.id}`, action: "question.create", entityType: "question",
      run: async () => {
        const value = body.value;
        checkOptionsShape(value.options, value.optionCount);
        const shape = normalizeAnswerShape(value.options, value.isAllCorrect);
        const parent = await store.getPaper(value.paperId);
        if (!parent) throw new HttpError("NOT_FOUND", 404, "Paper not found");
        // Single-blob HTML (legacy-compatible): the blob is the authored
        // content; there is no separable si variant, so both language
        // columns carry it and readers serve _en.
        try {
          const created = await store.insertQuestionWithOptions(
            {
              id: value.id, paper_id: value.paperId, number: value.number,
              question_html_en: value.questionHtml, question_html_si: value.questionHtml, question_html_ta: null,
              explanation_html_en: value.explanationHtml, explanation_html_si: value.explanationHtml, explanation_html_ta: null,
              sanitization_status: value.contentSafety.sanitizationStatus, sanitizer_version: value.contentSafety.sanitizerVersion,
              option_count: value.optionCount, answer_mode: shape.answerMode, is_all_correct: num(value.isAllCorrect),
              marks: value.marks ?? 1,
            },
            value.options.map((option) => ({
              id: option.id, question_id: value.id, option_html_en: option.html, option_html_si: option.html, option_html_ta: null,
              sanitization_status: option.contentSafety.sanitizationStatus, sanitizer_version: option.contentSafety.sanitizerVersion,
              sort_order: option.sortOrder, is_correct: num(option.isCorrect),
            })),
          );
          const options = await store.listOptions(created.id);
          return { status: 201, body: AdminQuestion.parse(mapQuestion(created, options)), entityId: created.id };
        } catch (error) {
          if (error instanceof HttpError && error.code === "CONFLICT") {
            const existing = await store.getQuestion(value.id);
            if (existing) {
              return { status: 200, body: AdminQuestion.parse(mapQuestion(existing, await store.listOptions(existing.id))), entityId: existing.id };
            }
          }
          throw error;
        }
      },
    });
  }
  if ((request.method === "PATCH" || request.method === "PUT") && id !== null && sub === null) {
    const principal = await authed(request, deps);
    const body = await parseBody(request, context.requestId, () => parseJson(request, AdminQuestionUpdate));
    if (!body.ok) return body.response;
    const { expectedUpdatedAt, ...fields } = body.value;
    return mutate({
      request, deps, principal, scope: `admin:questions:update:${id}`, action: "question.update", entityType: "question",
      run: async () => {
        const existing = await store.getQuestion(id);
        if (!existing) throw new HttpError("NOT_FOUND", 404, "Question not found");
        // Parent existence relies on the D1 foreign key (409 on a race or
        // unknown paper) to keep the worst case inside the permit; creates
        // still pre-check for a clean 404.
        // The answer triple derives from flags: partial answer edits
        // without the full options array are rejected.
        if ((fields.optionCount !== undefined || fields.answerMode !== undefined
          || fields.correctOptionIndexes !== undefined || fields.isAllCorrect !== undefined) && fields.options === undefined) {
          throw new HttpError("BAD_REQUEST", 400, "Answer changes require the full options array");
        }
        let replacement: NonNullable<Parameters<AdminStore["updateQuestion"]>[3]> | null = null;
        let normalized: { indexes: number[]; answerMode: "single" | "multiple" | "all" } | null = null;
        if (fields.options !== undefined) {
          // optionCount changes are allowed only with a matching full array.
          const count = fields.optionCount ?? existing.option_count;
          if (fields.optionCount !== undefined && fields.optionCount !== existing.option_count && fields.optionCount !== fields.options.length) {
            throw new HttpError("BAD_REQUEST", 400, "options length must equal optionCount");
          }
          checkOptionsShape(fields.options, count);
          normalized = normalizeAnswerShape(fields.options, fields.isAllCorrect ?? false);
          replacement = fields.options.map((option) => ({
            id: option.id, question_id: id, option_html_en: option.html, option_html_si: option.html, option_html_ta: null,
            sanitization_status: option.contentSafety.sanitizationStatus, sanitizer_version: option.contentSafety.sanitizerVersion,
            sort_order: option.sortOrder, is_correct: num(option.isCorrect),
          }));
        }
        const patch: Record<string, unknown> = {};
        if (fields.paperId !== undefined) patch.paper_id = fields.paperId;
        if (fields.number !== undefined) patch.number = fields.number;
        if (fields.questionHtml !== undefined) { patch.question_html_en = fields.questionHtml; patch.question_html_si = fields.questionHtml; }
        if (fields.explanationHtml !== undefined) { patch.explanation_html_en = fields.explanationHtml; patch.explanation_html_si = fields.explanationHtml; }
        if (fields.contentSafety !== undefined) {
          patch.sanitization_status = fields.contentSafety.sanitizationStatus;
          patch.sanitizer_version = fields.contentSafety.sanitizerVersion;
        }
        if (normalized) {
          patch.option_count = replacement!.length;
          patch.answer_mode = normalized.answerMode;
          patch.is_all_correct = num(fields.isAllCorrect ?? false);
        }
        if (fields.marks !== undefined) patch.marks = fields.marks;
        // Options for the pre-apply check and the response. Replacement
        // rows are exactly what the batch writes, so the final re-read is
        // skipped whenever they exist; existing rows are fetched only for
        // published-row checks.
        let checkOptions: QuestionOptionRow[] | null = null;
        if (replacement && existing.state === "published") {
          // Published edits are content-only: identical id→sort mapping.
          // A sort permutation would hit the UNIQUE(question_id, sort_order)
          // constraint mid-batch, failing AFTER the question update already
          // committed and spent the token — so any mapping change at all is
          // restructuring (archive first), not just id-set changes.
          const currentMap = new Map((await store.listOptions(id)).map((option) => [option.id, option.sort_order] as const));
          const nextMap = new Map(replacement.map((option) => [option.id, option.sort_order] as const));
          if (currentMap.size !== nextMap.size || [...currentMap].some(([optionId, sortOrder]) => nextMap.get(optionId) !== sortOrder)) {
            throw new HttpError("CONFLICT", 409, "Published questions accept content edits with identical option order; archive to restructure");
          }
          checkOptions = replacement as unknown as QuestionOptionRow[];
        } else if (existing.state === "published") {
          checkOptions = await store.listOptions(id);
        }
        if (checkOptions) {
          await assertQuestionPublishReady({ ...existing, ...patch } as unknown as QuestionRow, checkOptions);
        }
        const updated = await store.updateQuestion(id, patch, expectedUpdatedAt, replacement,
          existing.state === "published" ? "inplace" : "replace");
        if (!updated) throw new HttpError("NOT_FOUND", 404, "Question not found");
        const options = (replacement as unknown as QuestionOptionRow[] | null)
          ?? checkOptions ?? await store.listOptions(id);
        return { status: 200, body: AdminQuestion.parse(mapQuestion(updated, options)), entityId: id };
      },
    });
  }
  if (request.method === "POST" && id !== null && sub === "state") {
    const principal = await authed(request, deps);
    const body = await parseBody(request, context.requestId, () => parseJson(request, DraftPublishCommand));
    if (!body.ok) return body.response;
    if (body.value.entity !== "question" || body.value.entityId !== id) return badRequest(context.requestId, "Command entity must be question with the path id");
    return mutate({
      request, deps, principal, scope: `admin:questions:state:${id}`, action: "question.state", entityType: "question",
      run: async () => {
        if (body.value.state === "published") {
          const row = await store.getQuestion(id);
          if (!row) throw new HttpError("NOT_FOUND", 404, "Question not found");
          await assertQuestionPublishReady(row, await store.listOptions(id));
        }
        const updated = await store.setQuestionState(id, body.value.state, body.value.expectedUpdatedAt);
        if (!updated) throw new HttpError("NOT_FOUND", 404, "Question not found");
        return { status: 200, body: AdminQuestion.parse(mapQuestion(updated, await store.listOptions(id))), entityId: id, meta: { state: body.value.state } };
      },
    });
  }
  if (request.method === "DELETE" && id !== null && sub === null) {
    const principal = await authed(request, deps);
    return mutate({
      request, deps, principal, scope: `admin:questions:delete:${id}`, action: "question.delete", entityType: "question",
      run: async () => {
        const existing = await store.getQuestion(id);
        if (!existing) throw new HttpError("NOT_FOUND", 404, "Question not found");
        if (existing.state === "published") throw new HttpError("CONFLICT", 409, "Published questions cannot be deleted; archive first");
        await store.deleteQuestion(id);
        return { status: 200, body: { id, deleted: true }, entityId: id, deleted: true };
      },
    });
  }
  throw new HttpError("NOT_FOUND", 404, "Route not found");
}

async function studyRoute(request: Request, deps: AdminDeps, id: string | null, sub: string | null): Promise<Response> {
  const { context, store } = deps;
  if (request.method === "GET" && id === null) {
    const query = parseListQuery(new URL(request.url));
    if ("error" in query) return badRequest(context.requestId, query.error);
    const rows = await read(context.gate, "adminContentRead", () => store.listStudyMaterials(query.limit, query.cursor));
    return pageResponse(rows.map(mapStudy).map((body) => StudyMaterial.parse(body)), query.limit);
  }
  if (request.method === "GET" && id !== null && sub === null) {
    const row = await read(context.gate, "adminContentRead", () => store.getStudyMaterial(id));
    if (!row) return apiError("NOT_FOUND", "Study material not found", context.requestId, 404);
    return Response.json(StudyMaterial.parse(mapStudy(row)));
  }
  if (request.method === "POST" && id === null) {
    const principal = await authed(request, deps);
    const body = await parseBody(request, context.requestId, () => parseJson(request, StudyMaterialCreate));
    if (!body.ok) return body.response;
    return mutate({
      request, deps, principal, scope: `admin:study:create:${body.value.id}`, action: "study_material.create", entityType: "study_material",
      run: async () => {
        const value = body.value;
        const subject = await store.getSubject(value.subjectId);
        if (!subject) throw new HttpError("NOT_FOUND", 404, "Subject not found");
        if (value.paperId) {
          const paper = await store.getPaper(value.paperId);
          if (!paper) throw new HttpError("NOT_FOUND", 404, "Paper not found");
          // The paper link is how builds resolve studyMaterialId; a study
          // pointing at another subject's paper would publish under the
          // wrong subject.
          if (paper.subject_id !== value.subjectId) {
            throw new HttpError("BAD_REQUEST", 400, "paperId must belong to the study subject");
          }
        }
        // Object keys resolve only through the media inventory: the key must
        // come from a confirmed upload or the migration. Size and type are
        // authoritative from inventory, never from the request.
        const inventory = await context.inventory.getByObjectKey(value.objectKey);
        if (!inventory) throw new HttpError("CONFLICT", 409, "objectKey is not a confirmed upload or migrated object");
        if (inventory.contentType !== value.contentType) throw new HttpError("BAD_REQUEST", 400, "contentType does not match the stored object");
        try {
          const created = await store.insertStudyMaterial({
            id: value.id, subject_id: value.subjectId, paper_id: value.paperId, slug: value.slug,
            // Bilingual by contract; _ta columns stay null, never read.
            title_en: value.title.en, title_si: value.title.si, title_ta: null,
            description_en: value.description?.en ?? null, description_si: value.description?.si ?? null, description_ta: null,
            sanitization_status: value.contentSafety.sanitizationStatus, sanitizer_version: value.contentSafety.sanitizerVersion,
            object_key: value.objectKey, content_type: inventory.contentType, byte_size: inventory.byteSize, sha256: inventory.sha256,
          });
          return { status: 201, body: StudyMaterial.parse(mapStudy(created)), entityId: created.id, meta: { slug: created.slug } };
        } catch (error) {
          if (error instanceof HttpError && error.code === "CONFLICT") {
            const existing = await store.getStudyMaterial(value.id);
            if (existing) return { status: 200, body: StudyMaterial.parse(mapStudy(existing)), entityId: existing.id };
          }
          throw error;
        }
      },
    });
  }
  if ((request.method === "PATCH" || request.method === "PUT") && id !== null && sub === null) {
    const principal = await authed(request, deps);
    const body = await parseBody(request, context.requestId, () => parseJson(request, StudyMaterialUpdate));
    if (!body.ok) return body.response;
    const { expectedUpdatedAt, ...fields } = body.value;
    return mutate({
      request, deps, principal, scope: `admin:study:update:${id}`, action: "study_material.update", entityType: "study_material",
      run: async () => {
        const existing = await store.getStudyMaterial(id);
        if (!existing) throw new HttpError("NOT_FOUND", 404, "Study material not found");
        // Fetch-once: subject/paper rows are reused by the match check and
        // the published-row readiness check below, keeping the worst case
        // (published + linkage change) at 5 D1 reads.
        const linkageChanging = fields.subjectId !== undefined || fields.paperId !== undefined;
        const effSubject = fields.subjectId ?? existing.subject_id;
        const effPaper = fields.paperId !== undefined ? fields.paperId : existing.paper_id;
        let subjectRow = null as Awaited<ReturnType<AdminStore["getSubject"]>>;
        let paperRow = null as Awaited<ReturnType<AdminStore["getPaper"]>>;
        if (fields.subjectId !== undefined) {
          subjectRow = await store.getSubject(effSubject);
          if (!subjectRow) throw new HttpError("NOT_FOUND", 404, "Subject not found");
        } else if (existing.state === "published") {
          subjectRow = await store.getSubject(effSubject);
        }
        if (effPaper) {
          paperRow = await store.getPaper(effPaper);
          if (!paperRow && fields.paperId !== undefined) throw new HttpError("NOT_FOUND", 404, "Paper not found");
        }
        if (linkageChanging && paperRow && paperRow.subject_id !== effSubject) {
          throw new HttpError("BAD_REQUEST", 400, "paperId must belong to the study subject");
        }
        const patch: Record<string, unknown> = {};
        if (fields.subjectId !== undefined) patch.subject_id = fields.subjectId;
        if (fields.paperId !== undefined) patch.paper_id = fields.paperId;
        if (fields.slug !== undefined) patch.slug = fields.slug;
        if (fields.title !== undefined) { patch.title_en = fields.title.en; patch.title_si = fields.title.si; }
        if (fields.description !== undefined) {
          patch.description_en = fields.description?.en ?? null;
          patch.description_si = fields.description?.si ?? null;
        }
        if (fields.objectKey !== undefined) {
          const inventory = await context.inventory.getByObjectKey(fields.objectKey);
          if (!inventory) throw new HttpError("CONFLICT", 409, "objectKey is not a confirmed upload or migrated object");
          patch.object_key = fields.objectKey;
          patch.content_type = inventory.contentType;
          patch.byte_size = inventory.byteSize;
          patch.sha256 = inventory.sha256;
        }
        if (fields.contentSafety !== undefined) {
          patch.sanitization_status = fields.contentSafety.sanitizationStatus;
          patch.sanitizer_version = fields.contentSafety.sanitizerVersion;
        }
        // Pre-apply readiness on the merged row: a rejected edit changes
        // nothing (post-apply guards would leave the row dirty). Cached
        // subject/paper rows are reused; fallbacks cover only impossible
        // paths (a fetched row vanishing mid-request).
        if (existing.state === "published") {
          const merged = { ...existing, ...patch } as unknown as StudyMaterialRow;
          const subj = subjectRow ?? await store.getSubject(merged.subject_id);
          const pap = merged.paper_id
            ? (paperRow && paperRow.id === merged.paper_id ? paperRow : await store.getPaper(merged.paper_id))
            : null;
          checkStudyReady(merged, subj, pap);
        }
        const updated = await store.updateStudyMaterial(id, patch, expectedUpdatedAt);
        if (!updated) throw new HttpError("NOT_FOUND", 404, "Study material not found");
        return { status: 200, body: StudyMaterial.parse(mapStudy(updated)), entityId: id };
      },
    });
  }
  if (request.method === "POST" && id !== null && sub === "state") {
    const principal = await authed(request, deps);
    const body = await parseBody(request, context.requestId, () => parseJson(request, DraftPublishCommand));
    if (!body.ok) return body.response;
    if (body.value.entity !== "study_material" || body.value.entityId !== id) return badRequest(context.requestId, "Command entity must be study_material with the path id");
    return mutate({
      request, deps, principal, scope: `admin:study:state:${id}`, action: "study_material.state", entityType: "study_material",
      run: async () => {
        if (body.value.state === "published") {
          // Readiness is enforced here for clear messages; migration 0006
          // triggers backstop every writer including future import.
          const row = await store.getStudyMaterial(id);
          if (!row) throw new HttpError("NOT_FOUND", 404, "Study material not found");
          await assertStudyPublishReady(store, row);
        }
        const updated = await store.setStudyMaterialState(id, body.value.state, body.value.expectedUpdatedAt);
        if (!updated) throw new HttpError("NOT_FOUND", 404, "Study material not found");
        return { status: 200, body: StudyMaterial.parse(mapStudy(updated)), entityId: id, meta: { state: body.value.state } };
      },
    });
  }
  if (request.method === "DELETE" && id !== null && sub === null) {
    const principal = await authed(request, deps);
    return mutate({
      request, deps, principal, scope: `admin:study:delete:${id}`, action: "study_material.delete", entityType: "study_material",
      run: async () => {
        const existing = await store.getStudyMaterial(id);
        if (!existing) throw new HttpError("NOT_FOUND", 404, "Study material not found");
        if (existing.state === "published") throw new HttpError("CONFLICT", 409, "Published study materials cannot be deleted; archive first");
        await store.deleteStudyMaterial(id);
        return { status: 200, body: { id, deleted: true }, entityId: id, deleted: true };
      },
    });
  }
  throw new HttpError("NOT_FOUND", 404, "Route not found");
}

async function galleryRoute(request: Request, deps: AdminDeps, id: string | null, sub: string | null): Promise<Response> {
  const { context, store } = deps;
  if (request.method === "GET" && id === null) {
    const query = parseListQuery(new URL(request.url));
    if ("error" in query) return badRequest(context.requestId, query.error);
    const rows = await read(context.gate, "adminContentRead", () => store.listGalleryItems(query.limit, query.cursor));
    return pageResponse(rows.map(mapGallery).map((body) => GalleryMetadata.parse(body)), query.limit);
  }
  if (request.method === "GET" && id !== null && sub === null) {
    const row = await read(context.gate, "adminContentRead", () => store.getGalleryItem(id));
    if (!row) return apiError("NOT_FOUND", "Gallery item not found", context.requestId, 404);
    return Response.json(GalleryMetadata.parse(mapGallery(row)));
  }
  if (request.method === "POST" && id === null) {
    const principal = await authed(request, deps);
    const body = await parseBody(request, context.requestId, () => parseJson(request, GalleryItemCreate));
    if (!body.ok) return body.response;
    return mutate({
      request, deps, principal, scope: `admin:gallery:create:${body.value.id}`, action: "gallery_item.create", entityType: "gallery_item",
      run: async () => {
        const value = body.value;
        const resolved = await context.inventory.getManyByObjectKeys([value.imageObjectKey, value.thumbnailObjectKey]);
        const image = resolved.get(value.imageObjectKey);
        const thumbnail = resolved.get(value.thumbnailObjectKey);
        if (!image || !thumbnail) throw new HttpError("CONFLICT", 409, "Image keys must be confirmed uploads or migrated objects");
        if (image.contentType !== value.contentType) throw new HttpError("BAD_REQUEST", 400, "contentType does not match the stored image");
        try {
          const created = await store.insertGalleryItem({
            id: value.id, slug: value.slug, title_en: value.title.en, title_si: value.title.si, title_ta: null,
            description_en: value.description?.en ?? "", description_si: value.description?.si ?? "", description_ta: null,
            alt_en: value.altText.en, alt_si: value.altText.si, alt_ta: null,
            image_object_key: value.imageObjectKey, thumbnail_object_key: value.thumbnailObjectKey,
            content_type: image.contentType, image_sha256: image.sha256, thumbnail_sha256: thumbnail.sha256,
            width: value.width, height: value.height, byte_size: image.byteSize, thumbnail_byte_size: thumbnail.byteSize,
            pinned: num(value.pinned), sort_order: value.sortOrder,
          });
          return { status: 201, body: GalleryMetadata.parse(mapGallery(created)), entityId: created.id, meta: { slug: created.slug } };
        } catch (error) {
          if (error instanceof HttpError && error.code === "CONFLICT") {
            const existing = await store.getGalleryItem(value.id);
            if (existing) return { status: 200, body: GalleryMetadata.parse(mapGallery(existing)), entityId: existing.id };
          }
          throw error;
        }
      },
    });
  }
  if ((request.method === "PATCH" || request.method === "PUT") && id !== null && sub === null) {
    const principal = await authed(request, deps);
    const body = await parseBody(request, context.requestId, () => parseJson(request, GalleryItemUpdate));
    if (!body.ok) return body.response;
    const { expectedUpdatedAt, ...fields } = body.value;
    return mutate({
      request, deps, principal, scope: `admin:gallery:update:${id}`, action: "gallery_item.update", entityType: "gallery_item",
      run: async () => {
        const existing = await store.getGalleryItem(id);
        if (!existing) throw new HttpError("NOT_FOUND", 404, "Gallery item not found");
        const patch: Record<string, unknown> = {};
        if (fields.slug !== undefined) patch.slug = fields.slug;
        if (fields.title !== undefined) { patch.title_en = fields.title.en; patch.title_si = fields.title.si; }
        if (fields.description !== undefined) {
          patch.description_en = fields.description?.en ?? "";
          patch.description_si = fields.description?.si ?? "";
        }
        if (fields.altText !== undefined) { patch.alt_en = fields.altText.en; patch.alt_si = fields.altText.si; }
        // Media columns always derive from the inventory for the effective
        // keys — never from client-supplied contentType/byteSize. Body
        // values for those fields are accepted but ignored when the key is
        // unchanged, and rejected when they contradict a new key.
        const effectiveImage = fields.imageObjectKey ?? existing.image_object_key;
        const effectiveThumb = fields.thumbnailObjectKey ?? existing.thumbnail_object_key;
        const resolved = await context.inventory.getManyByObjectKeys([effectiveImage, effectiveThumb]);
        const image = resolved.get(effectiveImage);
        const thumbnail = resolved.get(effectiveThumb);
        if (!image || !thumbnail) throw new HttpError("CONFLICT", 409, "Image keys must be confirmed uploads or migrated objects");
        if (fields.contentType !== undefined && fields.contentType !== image.contentType) {
          throw new HttpError("BAD_REQUEST", 400, "contentType does not match the stored image");
        }
        if (fields.byteSize !== undefined && fields.byteSize !== image.byteSize) {
          throw new HttpError("BAD_REQUEST", 400, "byteSize does not match the stored image");
        }
        patch.image_object_key = effectiveImage;
        patch.thumbnail_object_key = effectiveThumb;
        patch.content_type = image.contentType;
        patch.image_sha256 = image.sha256;
        patch.thumbnail_sha256 = thumbnail.sha256;
        patch.byte_size = image.byteSize;
        patch.thumbnail_byte_size = thumbnail.byteSize;
        if (fields.width !== undefined) patch.width = fields.width;
        if (fields.height !== undefined) patch.height = fields.height;
        if (fields.pinned !== undefined) patch.pinned = num(fields.pinned);
        if (fields.sortOrder !== undefined) patch.sort_order = fields.sortOrder;
        const updated = await store.updateGalleryItem(id, patch, expectedUpdatedAt);
        if (!updated) throw new HttpError("NOT_FOUND", 404, "Gallery item not found");
        return { status: 200, body: GalleryMetadata.parse(mapGallery(updated)), entityId: id };
      },
    });
  }
  if (request.method === "POST" && id !== null && sub === "state") {
    const principal = await authed(request, deps);
    const body = await parseBody(request, context.requestId, () => parseJson(request, DraftPublishCommand));
    if (!body.ok) return body.response;
    if (body.value.entity !== "gallery_item" || body.value.entityId !== id) return badRequest(context.requestId, "Command entity must be gallery_item with the path id");
    return mutate({
      request, deps, principal, scope: `admin:gallery:state:${id}`, action: "gallery_item.state", entityType: "gallery_item",
      run: async () => {
        const updated = await store.setGalleryItemState(id, body.value.state, body.value.expectedUpdatedAt);
        if (!updated) throw new HttpError("NOT_FOUND", 404, "Gallery item not found");
        return { status: 200, body: GalleryMetadata.parse(mapGallery(updated)), entityId: id, meta: { state: body.value.state } };
      },
    });
  }
  if (request.method === "DELETE" && id !== null && sub === null) {
    const principal = await authed(request, deps);
    return mutate({
      request, deps, principal, scope: `admin:gallery:delete:${id}`, action: "gallery_item.delete", entityType: "gallery_item",
      run: async () => {
        const existing = await store.getGalleryItem(id);
        if (!existing) throw new HttpError("NOT_FOUND", 404, "Gallery item not found");
        if (existing.state === "published") throw new HttpError("CONFLICT", 409, "Published gallery items cannot be deleted; archive first");
        await store.deleteGalleryItem(id);
        return { status: 200, body: { id, deleted: true }, entityId: id, deleted: true };
      },
    });
  }
  throw new HttpError("NOT_FOUND", 404, "Route not found");
}

async function pagesRoute(request: Request, deps: AdminDeps, id: string | null, sub: string | null): Promise<Response> {
  const { context, store } = deps;
  if (request.method === "GET" && id === null) {
    const query = parseListQuery(new URL(request.url));
    if ("error" in query) return badRequest(context.requestId, query.error);
    const rows = await read(context.gate, "adminContentRead", () => store.listContentPages(query.limit, query.cursor));
    return pageResponse(rows.map(mapPage).map((body) => ContentPage.parse(body)), query.limit);
  }
  if (request.method === "GET" && id !== null && sub === null) {
    const row = await read(context.gate, "adminContentRead", () => store.getContentPage(id));
    if (!row) return apiError("NOT_FOUND", "Content page not found", context.requestId, 404);
    return Response.json(ContentPage.parse(mapPage(row)));
  }
  if (request.method === "POST" && id === null) {
    const principal = await authed(request, deps);
    const body = await parseBody(request, context.requestId, () => parseJson(request, ContentPageCreate));
    if (!body.ok) return body.response;
    return mutate({
      request, deps, principal, scope: `admin:pages:create:${body.value.id}`, action: "content_page.create", entityType: "content_page",
      run: async () => {
        const value = body.value;
        try {
          const created = await store.insertContentPage({
            id: value.id, slug: value.slug, title_en: value.title.en, title_si: value.title.si, title_ta: null,
            body_en: value.body.en, body_si: value.body.si, body_ta: null,
          });
          return { status: 201, body: ContentPage.parse(mapPage(created)), entityId: created.id, meta: { slug: created.slug } };
        } catch (error) {
          if (error instanceof HttpError && error.code === "CONFLICT") {
            const existing = await store.getContentPage(value.id);
            if (existing) return { status: 200, body: ContentPage.parse(mapPage(existing)), entityId: existing.id };
          }
          throw error;
        }
      },
    });
  }
  if ((request.method === "PATCH" || request.method === "PUT") && id !== null && sub === null) {
    const principal = await authed(request, deps);
    const body = await parseBody(request, context.requestId, () => parseJson(request, ContentPageUpdate));
    if (!body.ok) return body.response;
    const { expectedUpdatedAt, ...fields } = body.value;
    return mutate({
      request, deps, principal, scope: `admin:pages:update:${id}`, action: "content_page.update", entityType: "content_page",
      run: async () => {
        const patch: Record<string, unknown> = {};
        if (fields.slug !== undefined) patch.slug = fields.slug;
        if (fields.title !== undefined) { patch.title_en = fields.title.en; patch.title_si = fields.title.si; }
        if (fields.body !== undefined) { patch.body_en = fields.body.en; patch.body_si = fields.body.si; }
        const updated = await store.updateContentPage(id, patch, expectedUpdatedAt);
        if (!updated) throw new HttpError("NOT_FOUND", 404, "Content page not found");
        return { status: 200, body: ContentPage.parse(mapPage(updated)), entityId: id };
      },
    });
  }
  if (request.method === "POST" && id !== null && sub === "state") {
    const principal = await authed(request, deps);
    const body = await parseBody(request, context.requestId, () => parseJson(request, DraftPublishCommand));
    if (!body.ok) return body.response;
    if (body.value.entity !== "content_page" || body.value.entityId !== id) return badRequest(context.requestId, "Command entity must be content_page with the path id");
    return mutate({
      request, deps, principal, scope: `admin:pages:state:${id}`, action: "content_page.state", entityType: "content_page",
      run: async () => {
        const updated = await store.setContentPageState(id, body.value.state, body.value.expectedUpdatedAt);
        if (!updated) throw new HttpError("NOT_FOUND", 404, "Content page not found");
        return { status: 200, body: ContentPage.parse(mapPage(updated)), entityId: id, meta: { state: body.value.state } };
      },
    });
  }
  if (request.method === "DELETE" && id !== null && sub === null) {
    const principal = await authed(request, deps);
    return mutate({
      request, deps, principal, scope: `admin:pages:delete:${id}`, action: "content_page.delete", entityType: "content_page",
      run: async () => {
        const existing = await store.getContentPage(id);
        if (!existing) throw new HttpError("NOT_FOUND", 404, "Content page not found");
        if (existing.state === "published") throw new HttpError("CONFLICT", 409, "Published content pages cannot be deleted; archive first");
        await store.deleteContentPage(id);
        return { status: 200, body: { id, deleted: true }, entityId: id, deleted: true };
      },
    });
  }
  throw new HttpError("NOT_FOUND", 404, "Route not found");
}

async function aboutRoute(request: Request, deps: AdminDeps): Promise<Response> {
  const { context, store } = deps;
  if (request.method === "GET") {
    const body = await read(context.gate, "adminContentRead", async () => {
      const row = await store.getAbout();
      if (!row) return null;
      return AdminAboutProfile.parse(mapAbout(row, await aboutImageView((key) => deps.context.inventory.getByObjectKey(key), row.image_object_key)));
    });
    if (!body) return apiError("NOT_FOUND", "About profile not found", context.requestId, 404);
    return Response.json(body);
  }
  if (request.method === "PUT" || request.method === "PATCH") {
    const principal = await authed(request, deps);
    const body = await parseBody(request, context.requestId, () => parseJson(request, AboutPut));
    if (!body.ok) return body.response;
    return mutate({
      request, deps, principal, scope: "admin:about:put", action: "about.put", entityType: "about",
      run: async () => {
        const value = body.value;
        // Width/height/contentType are validated against the stored object;
        // the key is what persists (the build resolves live metadata).
        if (value.image) {
          const record = await context.inventory.getByObjectKey(value.image.objectKey);
          if (!record) throw new HttpError("CONFLICT", 409, "image objectKey is not a confirmed upload or migrated object");
          if (record.contentType !== value.image.contentType) throw new HttpError("BAD_REQUEST", 400, "contentType does not match the stored object");
        }
        // Concurrency token (when supplied) is enforced atomically by the
        // store's guarded upsert: exactly one same-token writer wins.
        const updated = await store.upsertAbout({
          id: "about", description: value.description, image_object_key: value.image?.objectKey ?? null, image_url: null,
          facebook_url: value.social.facebookUrl, youtube_url: value.social.youtubeUrl, linkedin_url: value.social.linkedinUrl,
        }, value.expectedUpdatedAt ?? null);
        return {
          status: 200,
          // Canonical image view (see aboutImage): replay-identical.
          body: AdminAboutProfile.parse(mapAbout(updated, await aboutImageView((key) => deps.context.inventory.getByObjectKey(key), updated.image_object_key))),
          // Singletons have no UUID: the audit row records a null entity id
          // plus a singleton marker, matching the AuditRecord contract.
          entityId: null, meta: { singleton: "about" },
        };
      },
    });
  }
  throw new HttpError("NOT_FOUND", 404, "Route not found");
}

async function privacyRoute(request: Request, deps: AdminDeps): Promise<Response> {
  const { context, store } = deps;
  if (request.method === "GET") {
    const row = await read(context.gate, "adminContentRead", () => store.getPrivacy());
    if (!row) return apiError("NOT_FOUND", "Privacy policy not found", context.requestId, 404);
    return Response.json(PrivacyPolicy.parse({
      id: "privacy", statement: row.statement, fullHtml: row.full_html,
      contentSafety: { sanitizationStatus: row.sanitization_status, sanitizerVersion: row.sanitizer_version },
      updatedAt: row.updated_at,
    }));
  }
  if (request.method === "PUT" || request.method === "PATCH") {
    const principal = await authed(request, deps);
    const body = await parseBody(request, context.requestId, () => parseJson(request, PrivacyPut));
    if (!body.ok) return body.response;
    return mutate({
      request, deps, principal, scope: "admin:privacy:put", action: "privacy.put", entityType: "privacy",
      run: async () => {
        const value = body.value;
        if (value.fullHtml && value.contentSafety.sanitizationStatus !== "sanitized") {
          throw new HttpError("CONFLICT", 409, "Privacy HTML must be sanitized before saving");
        }
        const updated = await store.upsertPrivacy({
          id: "privacy", statement: value.statement, full_html: value.fullHtml,
          sanitization_status: value.contentSafety.sanitizationStatus, sanitizer_version: value.contentSafety.sanitizerVersion,
        }, value.expectedUpdatedAt ?? null);
        return {
          status: 200,
          body: PrivacyPolicy.parse({
            id: "privacy", statement: updated.statement, fullHtml: updated.full_html,
            contentSafety: { sanitizationStatus: updated.sanitization_status, sanitizerVersion: updated.sanitizer_version },
            updatedAt: updated.updated_at,
          }),
          entityId: null, meta: { singleton: "privacy" },
        };
      },
    });
  }
  throw new HttpError("NOT_FOUND", 404, "Route not found");
}

async function statsRoute(request: Request, deps: AdminDeps): Promise<Response> {
  requireMethod(request, "GET");
  await authed(request, deps);
  const counts = await read(deps.context.gate, "adminContentRead", () => deps.store.stats());
  return Response.json(AdminContentStatistics.parse({ generatedAt: new Date().toISOString(), ...counts }));
}

import { loginRoute, usersRoute } from "./auth-routes";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validates the admin principal, enforces idempotency, and routes to the correct handler.
 * D1 mutations should NOT instantiate a new IdempotencyGate; it is enforced
 * exactly once here, and handlers receive the principal through deps.
 * Every read is budget-permitted (adminContentRead); every mutation
 * additionally requires a valid Idempotency-Key and records an audit row.
 */
export async function adminRouter(request: Request, deps: AdminDeps): Promise<Response> {
  const url = new URL(request.url);
  const rest = url.pathname.slice("/api/v1/admin/".length);
  const [resource, id, sub, extra] = rest.split("/");
  if (!resource || extra !== undefined) throw new HttpError("NOT_FOUND", 404, "Route not found");

  if (resource === "login") { return loginRoute(request, deps); }
  if (resource === "users") { return usersRoute(request, deps, id ?? null); }

  const known = ["stats", "about", "privacy", "subjects", "papers", "questions", "study-materials", "gallery-items", "content-pages", "publications", "budget"];
  if (!known.includes(resource)) throw new HttpError("NOT_FOUND", 404, "Route not found");

  const principal = await requireAdmin(request, deps.context.access, deps.verifier);
  const authedDeps: AdminDeps = { ...deps, principal };


  if (resource === "budget" && id === "status") { return import("./budget-route").then(m => m.budgetStatusRoute(request, authedDeps)); }
  if (resource === "budget" && id === "emergency") { return import("./budget-route").then(m => m.budgetEmergencyRoute(request, authedDeps)); }
  if (resource === "stats") { requireMethod(request, "GET"); return statsRoute(request, authedDeps); }
  if (resource === "about" && id === undefined) { requireMethod(request, "GET", "PUT", "PATCH"); return aboutRoute(request, authedDeps); }
  if (resource === "privacy" && id === undefined) { requireMethod(request, "GET", "PUT", "PATCH"); return privacyRoute(request, authedDeps); }
  if (id !== undefined && !UUID_PATTERN.test(id)) {
    return apiError("BAD_REQUEST", "Entity id must be a UUID", deps.context.requestId, 400);
  }
  if (sub !== undefined && sub !== "state") throw new HttpError("NOT_FOUND", 404, "Route not found");
  const entityId = id ?? null;
  const qualifier = sub ?? null;
  if (entityId === null) requireMethod(request, "GET", "POST");
  else if (qualifier === "state") requireMethod(request, "POST");
  else requireMethod(request, "GET", "PATCH", "PUT", "DELETE");
  switch (resource) {
    case "subjects": return subjectsRoute(request, authedDeps, entityId, qualifier);
    case "papers": return papersRoute(request, authedDeps, entityId, qualifier);
    case "questions": return questionsRoute(request, authedDeps, entityId, qualifier);
    case "study-materials": return studyRoute(request, authedDeps, entityId, qualifier);
    case "gallery-items": return galleryRoute(request, authedDeps, entityId, qualifier);
    case "content-pages": return pagesRoute(request, authedDeps, entityId, qualifier);
    default: throw new HttpError("NOT_FOUND", 404, "Route not found");
  }
}
