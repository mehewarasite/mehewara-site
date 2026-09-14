import { HttpError } from "../../shared/errors";
import { AuditRecord } from "@mehewara-v2/contracts";
import type {
  SubjectRow, PaperRow, QuestionRow, QuestionOptionRow, StudyMaterialRow,
  GalleryItemRow, ContentPageRow, AboutRow, PrivacyRow,
} from "../publication/store";

/**
 * Narrow persistence capability for admin content management. Feature
 * modules receive this store — never the raw D1 binding. The entrypoint is
 * the only place that constructs it from `env.D1`.
 *
 * Row types are shared with the publication store so the admin write path
 * and the publication read path can never disagree on column shapes.
 * Updates use `WHERE id = ? AND updated_at = ? ... RETURNING *` so
 * concurrent editors get a 409 instead of silently overwriting each other;
 * the `*_updated_at` triggers then stamp the new write time.
 */

export interface IdempotencyDescriptor { entityType: string; entityId: string | null; deleted?: boolean }
export interface AdminIdempotencyRecord { status: number; descriptor: IdempotencyDescriptor }
export interface AuditInput {
  actorId: string; action: string; entityType: string; entityId: string | null;
  requestId: string; metadata: Record<string, string>;
}
export interface StatsCounts {
  subjectCount: number; paperCount: number; questionCount: number;
  publishedQuestionCount: number; galleryCount: number; draftCount: number;
}

export type SubjectInsert = Omit<SubjectRow, "created_at" | "updated_at" | "state"> & { source_legacy_id?: string | null };
export type SubjectPatch = Partial<Omit<SubjectRow, "id" | "created_at" | "updated_at" | "state">>;
export type PaperInsert = Omit<PaperRow, "created_at" | "updated_at" | "state" | "materialized_question_count"> & { source_legacy_id?: string | null };
export type PaperPatch = Partial<Omit<PaperRow, "id" | "created_at" | "updated_at" | "state" | "materialized_question_count">>;
export type QuestionInsert = Omit<QuestionRow, "created_at" | "updated_at" | "state"> & { marks_source?: string; source_legacy_id?: string | null };
export type QuestionPatch = Partial<Omit<QuestionRow, "id" | "created_at" | "updated_at" | "state">>;
export type OptionInsert = Omit<QuestionOptionRow, never> & { source_legacy_id?: string | null };
export type StudyInsert = Omit<StudyMaterialRow, "created_at" | "updated_at" | "state"> & { sha256?: string | null; source_legacy_id?: string | null };
export type StudyPatch = Partial<Omit<StudyMaterialRow, "id" | "created_at" | "updated_at" | "state">>;
export type GalleryInsert = Omit<GalleryItemRow, "created_at" | "updated_at" | "state"> & {
  image_sha256: string; thumbnail_sha256: string; thumbnail_byte_size: number; source_legacy_id?: string | null;
};
export type GalleryPatch = Partial<Omit<GalleryItemRow, "id" | "created_at" | "updated_at" | "state">>;
export type PageInsert = Omit<ContentPageRow, "created_at" | "updated_at" | "state"> & { source_legacy_id?: string | null };
export type PagePatch = Partial<Omit<ContentPageRow, "id" | "created_at" | "updated_at" | "state">>;

export interface AdminStore {
  findIdempotency(key: string): Promise<AdminIdempotencyRecord | null>;
  recordIdempotency(key: string, status: number, descriptor: IdempotencyDescriptor): Promise<void>;
  appendAudit(input: AuditInput): Promise<void>;
  listAudits(limit: number, cursor: string | null): Promise<AuditRecord[]>;
  stats(): Promise<StatsCounts>;

  listSubjects(limit: number, cursor: string | null): Promise<SubjectRow[]>;
  getSubject(id: string): Promise<SubjectRow | null>;
  insertSubject(row: SubjectInsert): Promise<SubjectRow>;
  updateSubject(id: string, patch: SubjectPatch, expectedUpdatedAt: string): Promise<SubjectRow | null>;
  setSubjectState(id: string, state: string, expectedUpdatedAt: string | null): Promise<SubjectRow | null>;
  deleteSubject(id: string): Promise<boolean>;

  listPapers(subjectId: string | null, limit: number, cursor: string | null): Promise<PaperRow[]>;
  getPaper(id: string): Promise<PaperRow | null>;
  insertPaper(row: PaperInsert): Promise<PaperRow>;
  updatePaper(id: string, patch: PaperPatch, expectedUpdatedAt: string): Promise<PaperRow | null>;
  setPaperState(id: string, state: string, expectedUpdatedAt: string | null): Promise<PaperRow | null>;
  deletePaper(id: string): Promise<boolean>;

  listQuestionsByPaper(paperId: string, limit: number, cursor: string | null): Promise<QuestionRow[]>;
  getQuestion(id: string): Promise<QuestionRow | null>;
  listOptions(questionId: string): Promise<QuestionOptionRow[]>;
  insertQuestionWithOptions(question: QuestionInsert, options: OptionInsert[]): Promise<QuestionRow>;
  /**
   * Updates a question with optional options handling. `optionsMode`:
   * - "replace" (drafts): atomic DELETE + INSERTs. Must never run on a
   *   published question: the published-shape trigger aborts the transient
   *   empty set, so validated published edits would always fail.
   * - "inplace" (published): one UPDATE per option, never changing the
   *   count. The shape trigger sees a constant count and stays quiet.
   */
  updateQuestion(id: string, patch: QuestionPatch, expectedUpdatedAt: string, options: OptionInsert[] | null, optionsMode?: "replace" | "inplace"): Promise<QuestionRow | null>;
  setQuestionState(id: string, state: string, expectedUpdatedAt: string | null): Promise<QuestionRow | null>;
  deleteQuestion(id: string): Promise<boolean>;

  listStudyMaterials(limit: number, cursor: string | null): Promise<StudyMaterialRow[]>;
  getStudyMaterial(id: string): Promise<StudyMaterialRow | null>;
  /** Resolves a paper's admin detail `studyMaterialId` through the
   *  `study_materials.paper_id -> papers.id` direction. */
  findStudyIdByPaper(paperId: string): Promise<string | null>;
  /** Bulk variant for lists: one bounded query per 100-paper chunk instead
   *  of one read per row. First id wins per paper, matching the build. */
  findStudyIdsByPapers(paperIds: string[]): Promise<Map<string, string>>;
  /** Bulk options for question lists, chunked like the publication store. */
  listOptionsForQuestions(questionIds: string[]): Promise<QuestionOptionRow[]>;
  insertStudyMaterial(row: StudyInsert): Promise<StudyMaterialRow>;
  updateStudyMaterial(id: string, patch: StudyPatch, expectedUpdatedAt: string): Promise<StudyMaterialRow | null>;
  setStudyMaterialState(id: string, state: string, expectedUpdatedAt: string | null): Promise<StudyMaterialRow | null>;
  deleteStudyMaterial(id: string): Promise<boolean>;

  listGalleryItems(limit: number, cursor: string | null): Promise<GalleryItemRow[]>;
  getGalleryItem(id: string): Promise<GalleryItemRow | null>;
  insertGalleryItem(row: GalleryInsert): Promise<GalleryItemRow>;
  updateGalleryItem(id: string, patch: GalleryPatch, expectedUpdatedAt: string): Promise<GalleryItemRow | null>;
  setGalleryItemState(id: string, state: string, expectedUpdatedAt: string | null): Promise<GalleryItemRow | null>;
  deleteGalleryItem(id: string): Promise<boolean>;

  listContentPages(limit: number, cursor: string | null): Promise<ContentPageRow[]>;
  getContentPage(id: string): Promise<ContentPageRow | null>;
  insertContentPage(row: PageInsert): Promise<ContentPageRow>;
  updateContentPage(id: string, patch: PagePatch, expectedUpdatedAt: string): Promise<ContentPageRow | null>;
  setContentPageState(id: string, state: string, expectedUpdatedAt: string | null): Promise<ContentPageRow | null>;
  deleteContentPage(id: string): Promise<boolean>;

  getAbout(): Promise<AboutRow | null>;
  /**
   * Conditional singleton upsert. With a token, the write is one guarded
   * UPDATE: exactly one concurrent writer wins, the loser re-reads to split
   * missing-row (409: a token for nothing) from stale-token (409). Without
   * a token the row is created-or-replaced unconditionally.
   */
  upsertAbout(row: Omit<AboutRow, "updated_at">, expectedUpdatedAt?: string | null): Promise<AboutRow>;
  getPrivacy(): Promise<PrivacyRow | null>;
  upsertPrivacy(row: Omit<PrivacyRow, "updated_at">, expectedUpdatedAt?: string | null): Promise<PrivacyRow>;
}

/** Maps D1 constraint/trigger aborts onto 409; FK races onto 409. Trigger
 *  messages are matched by vocabulary (all RAISE texts are ours) because
 *  raw SQLite/D1 errors carry the bare message without an ABORT tag. */
function conflict(error: unknown, existsMessage: string): never {
  if (error instanceof HttpError) throw error;
  const message = error instanceof Error ? error.message : "";
  if (/UNIQUE constraint failed/i.test(message)) throw new HttpError("CONFLICT", 409, existsMessage);
  if (/FOREIGN KEY constraint failed/i.test(message)) throw new HttpError("CONFLICT", 409, "Referenced parent does not exist or was removed concurrently");
  if (/CHECK constraint failed|ABORT|publish|sanitized|option count|linked study material|repoint them|must belong to the study subject/i.test(message)) {
    throw new HttpError("CONFLICT", 409, message.replace(/^.*ABORT,?\s*/i, "").slice(0, 300) || "State transition rejected by content rules");
  }
  throw error;
}

export function d1AdminStore(db: D1Database): AdminStore {
  const all = async <T>(sql: string, ...params: unknown[]): Promise<T[]> => {
    const result = await db.prepare(sql).bind(...params).all<T>();
    return result.results ?? [];
  };
  const first = async <T>(sql: string, ...params: unknown[]): Promise<T | null> => {
    const row = await db.prepare(sql).bind(...params).first<T>();
    return row ?? null;
  };
  const run = (sql: string, ...params: unknown[]) => db.prepare(sql).bind(...params).run();

  /** Builds `SET a = ?, b = ?` from defined patch entries only: explicit
   *  null clears a column, undefined leaves it untouched. */
  const setClause = (patch: Record<string, unknown>): { clause: string; values: unknown[] } => {
    const entries = Object.entries(patch).filter(([, value]) => value !== undefined);
    return { clause: entries.map(([key]) => `${key} = ?`).join(", "), values: entries.map(([, value]) => value) };
  };

  /**
   * Singleton stamp. about_profiles/privacy_policies have no *_updated_at
   * triggers, so triggerless writes stamp monotonically here: every write
   * changes the token, and same-millisecond tokens cannot win twice. Bare
   * `updated_at` is the pre-write row in both UPDATE...WHERE and
   * ON CONFLICT DO UPDATE positions.
   */
  const MONOTONIC_STAMP = `CASE
    WHEN strftime('%Y-%m-%dT%H:%M:%fZ','now') <= updated_at
    THEN strftime('%Y-%m-%dT%H:%M:%fZ', updated_at, '+1 second')
    ELSE strftime('%Y-%m-%dT%H:%M:%fZ','now') END`;

  const page = <T>(table: string, where: string, limit: number, cursor: string | null, ...params: unknown[]): Promise<T[]> =>
    all<T>(`SELECT * FROM ${table} WHERE ${where}${cursor ? " AND id > ?" : ""} ORDER BY id LIMIT ?`, ...params, ...(cursor ? [cursor] : []), limit);

  /**
   * Guarded update + fresh re-read. `UPDATE ... RETURNING *` cannot serve
   * as the response row: the `*_updated_at` AFTER triggers stamp the row
   * after RETURNING snapshots it (verified: RETURNING sees the old stamp),
   * so the returned concurrency token would be stale and the next guarded
   * write would falsely conflict. `meta.changes` splits applied (1) from
   * missed (0); a miss re-reads to split 404 from 409. Table names are
   * caller constants, never request input.
   */
  const guardedUpdate = async <T>(
    table: string, setSql: string, get: (id: string) => Promise<T | null>,
    id: string, expectedUpdatedAt: string | null, ...values: unknown[]
  ): Promise<T | null> => {
    const where = expectedUpdatedAt ? "id = ? AND updated_at = ?" : "id = ?";
    const params = expectedUpdatedAt ? [...values, id, expectedUpdatedAt] : [...values, id];
    const result = await run(`UPDATE ${table} SET ${setSql} WHERE ${where}`, ...params);
    if ((result.meta.changes ?? 0) === 0) {
      const existing = await get(id);
      if (!existing) return null;
      throw new HttpError("CONFLICT", 409, "Row was modified concurrently; reload and retry");
    }
    const fresh = await get(id);
    if (!fresh) throw new HttpError("INTERNAL_ERROR", 500, "Updated row vanished");
    return fresh;
  };

  /** Empty-patch guard: a no-op update still validates the concurrency
   *  token instead of silently succeeding. */
  const checkToken = async <T extends { updated_at: string }>(
    get: (id: string) => Promise<T | null>, id: string, expectedUpdatedAt: string,
  ): Promise<T | null> => {
    const existing = await get(id);
    if (!existing) return null;
    if (existing.updated_at !== expectedUpdatedAt) {
      throw new HttpError("CONFLICT", 409, "Row was modified concurrently; reload and retry");
    }
    return existing;
  };

  return {
    async findIdempotency(key) {
      const row = await first<{ status: number; replay_json: string }>(
        "SELECT status, replay_json FROM admin_idempotency_keys WHERE idempotency_key = ?", key);
      if (!row) return null;
      return { status: row.status, descriptor: JSON.parse(row.replay_json) as IdempotencyDescriptor };
    },
    async recordIdempotency(key, status, descriptor: IdempotencyDescriptor) {
      try {
        await run("INSERT INTO admin_idempotency_keys (idempotency_key, status, replay_json) VALUES (?, ?, ?)",
          key, status, JSON.stringify(descriptor));
      } catch (error) {
        // A concurrent same-key mutation won the race: surface CONFLICT so
        // the route replays the winner's record instead of 500ing.
        conflict(error, "An identical admin operation is already recorded");
      }
    },
    async appendAudit(input) {
      // Stored as the AuditRecord entry array (max 50), not a free-form
      // object, so audit rows always match the contract shape.
      const entries = Object.entries(input.metadata).slice(0, 50)
        .map(([key, value]) => ({ key: key.slice(0, 80), value: value.slice(0, 500) }));
      await run(
        "INSERT INTO admin_audit_log (id, actor_id, action, entity_type, entity_id, request_id, metadata_json) VALUES (?, ?, ?, ?, ?, ?, ?)",
        crypto.randomUUID(), input.actorId, input.action, input.entityType, input.entityId, input.requestId, JSON.stringify(entries));
    },
    async listAudits(limit = 50, cursor = null) {
      const boundedLimit = Math.min(Math.max(limit, 1), 100);
      let query = "SELECT id, actor_id, action, entity_type, entity_id, request_id, metadata_json, created_at FROM admin_audit_log";
      const params: unknown[] = [];
      if (cursor) {
        query += " WHERE created_at < (SELECT created_at FROM admin_audit_log WHERE id = ?)";
        params.push(cursor);
      }
      query += " ORDER BY created_at DESC, id DESC LIMIT ?";
      params.push(boundedLimit);

      const rows = await all<{
        id: string;
        actor_id: string;
        action: string;
        entity_type: string;
        entity_id: string | null;
        request_id: string;
        metadata_json: string;
        created_at: string;
      }>(query, ...params);

      return rows.map((r) => {
        let metadata: { key: string; value: string }[] = [];
        try {
          const parsed = JSON.parse(r.metadata_json);
          if (Array.isArray(parsed)) metadata = parsed;
          else if (parsed && typeof parsed === "object") {
            metadata = Object.entries(parsed).map(([k, v]) => ({ key: String(k), value: String(v) }));
          }
        } catch {
          metadata = [];
        }
        return {
          id: r.id,
          actorId: r.actor_id,
          action: r.action,
          entityType: r.entity_type,
          entityId: r.entity_id,
          requestId: r.request_id,
          metadata,
          createdAt: r.created_at,
        };
      });
    },
    async stats() {
      const row = await first<StatsCounts>(`SELECT
        (SELECT COUNT(*) FROM subjects) AS subjectCount,
        (SELECT COUNT(*) FROM papers) AS paperCount,
        (SELECT COUNT(*) FROM questions) AS questionCount,
        (SELECT COUNT(*) FROM questions WHERE state = 'published') AS publishedQuestionCount,
        (SELECT COUNT(*) FROM gallery_items) AS galleryCount,
        ((SELECT COUNT(*) FROM subjects WHERE state = 'draft') + (SELECT COUNT(*) FROM papers WHERE state = 'draft')
          + (SELECT COUNT(*) FROM questions WHERE state = 'draft') + (SELECT COUNT(*) FROM study_materials WHERE state = 'draft')
          + (SELECT COUNT(*) FROM gallery_items WHERE state = 'draft') + (SELECT COUNT(*) FROM content_pages WHERE state = 'draft')) AS draftCount`);
      if (!row) throw new HttpError("INTERNAL_ERROR", 500, "Statistics query returned no row");
      return row;
    },

    listSubjects: (limit, cursor) => page<SubjectRow>("subjects", "1 = 1", limit, cursor),
    getSubject: (id) => first<SubjectRow>("SELECT * FROM subjects WHERE id = ?", id),
    async insertSubject(row) {
      try {
        return await first<SubjectRow>(`INSERT INTO subjects
          (id, source_legacy_id, slug, title_en, title_si, title_ta, description_en, description_si, description_ta, exam_type, code, icon, color, presentation_variant, state, sort_order)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?) RETURNING *`,
          row.id, row.source_legacy_id ?? null, row.slug, row.title_en, row.title_si, row.title_ta,
          row.description_en, row.description_si, row.description_ta, row.exam_type, row.code, row.icon, row.color, row.presentation_variant, row.sort_order,
        ).then((created) => {
          if (!created) throw new HttpError("INTERNAL_ERROR", 500, "Subject insert returned no row");
          return created;
        });
      } catch (error) { conflict(error, "A subject with this id or slug already exists"); }
    },
    async updateSubject(id, patch, expectedUpdatedAt) {
      const { clause, values } = setClause(patch as Record<string, unknown>);
      if (!clause) return checkToken((rowId) => this.getSubject(rowId), id, expectedUpdatedAt);
      try {
        return await guardedUpdate("subjects", clause, (rowId) => this.getSubject(rowId), id, expectedUpdatedAt, ...values);
      } catch (error) { conflict(error, "A subject with this slug already exists"); }
    },
    async setSubjectState(id, state, expectedUpdatedAt) {
      try {
        return await guardedUpdate("subjects", "state = ?", (rowId) => this.getSubject(rowId), id, expectedUpdatedAt, state);
      } catch (error) { conflict(error, "Subject state transition rejected"); }
    },
    async deleteSubject(id) {
      try {
        const result = await run("DELETE FROM subjects WHERE id = ?", id);
        return (result.meta.changes ?? 0) > 0;
      } catch (error) { conflict(error, "Subject has dependent papers and cannot be deleted"); }
    },

    listPapers: (subjectId, limit, cursor) => subjectId
      ? page<PaperRow>("papers", "subject_id = ?", limit, cursor, subjectId)
      : page<PaperRow>("papers", "1 = 1", limit, cursor),
    getPaper: (id) => first<PaperRow>("SELECT * FROM papers WHERE id = ?", id),
    async insertPaper(row) {
      try {
        const created = await first<PaperRow>(`INSERT INTO papers
          (id, source_legacy_id, subject_id, slug, exam_type, title_en, title_si, title_ta, year, language, duration_minutes, question_count, materialized_question_count, question_count_source, state)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 'draft') RETURNING *`,
          row.id, row.source_legacy_id ?? null, row.subject_id, row.slug, row.exam_type, row.title_en, row.title_si, row.title_ta,
          row.year, row.language, row.duration_minutes, row.question_count, row.question_count_source);
        if (!created) throw new HttpError("INTERNAL_ERROR", 500, "Paper insert returned no row");
        return created;
      } catch (error) { conflict(error, "A paper with this id or slug already exists"); }
    },
    async updatePaper(id, patch, expectedUpdatedAt) {
      const { clause, values } = setClause(patch as Record<string, unknown>);
      if (!clause) return checkToken((rowId) => this.getPaper(rowId), id, expectedUpdatedAt);
      try {
        return await guardedUpdate("papers", clause, (rowId) => this.getPaper(rowId), id, expectedUpdatedAt, ...values);
      } catch (error) { conflict(error, "A paper with this slug already exists"); }
    },
    async setPaperState(id, state, expectedUpdatedAt) {
      try {
        return await guardedUpdate("papers", "state = ?", (rowId) => this.getPaper(rowId), id, expectedUpdatedAt, state);
      } catch (error) { conflict(error, "Paper state transition rejected"); }
    },
    async deletePaper(id) {
      try {
        const result = await run("DELETE FROM papers WHERE id = ?", id);
        return (result.meta.changes ?? 0) > 0;
      } catch (error) { conflict(error, "Paper has dependent questions or study materials and cannot be deleted"); }
    },

    listQuestionsByPaper: (paperId, limit, cursor) => page<QuestionRow>("questions", "paper_id = ?", limit, cursor, paperId),
    getQuestion: (id) => first<QuestionRow>("SELECT * FROM questions WHERE id = ?", id),
    listOptions: (questionId) => all<QuestionOptionRow>("SELECT * FROM question_options WHERE question_id = ? ORDER BY sort_order, id", questionId),
    async insertQuestionWithOptions(question, options) {
      try {
        await db.batch([
          db.prepare(`INSERT INTO questions
            (id, source_legacy_id, paper_id, number, question_html_en, question_html_si, question_html_ta, explanation_html_en, explanation_html_si, explanation_html_ta,
             sanitization_status, sanitizer_version, option_count, answer_mode, is_all_correct, marks, marks_source, state)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft')`)
            .bind(question.id, question.source_legacy_id ?? null, question.paper_id, question.number, question.question_html_en, question.question_html_si, question.question_html_ta,
              question.explanation_html_en, question.explanation_html_si, question.explanation_html_ta, question.sanitization_status, question.sanitizer_version,
              question.option_count, question.answer_mode, question.is_all_correct, question.marks, question.marks_source ?? "admin"),
          ...options.map((option) => db.prepare(`INSERT INTO question_options
            (id, source_legacy_id, question_id, option_html_en, option_html_si, option_html_ta, sanitization_status, sanitizer_version, sort_order, is_correct)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
            .bind(option.id, option.source_legacy_id ?? null, question.id, option.option_html_en, option.option_html_si, option.option_html_ta,
              option.sanitization_status, option.sanitizer_version, option.sort_order, option.is_correct)),
        ]);
      } catch (error) { conflict(error, "A question with this id or number already exists"); }
      const created = await this.getQuestion(question.id);
      if (!created) throw new HttpError("INTERNAL_ERROR", 500, "Question insert did not persist");
      return created;
    },
    async updateQuestion(id, patch, expectedUpdatedAt, options, optionsMode = "replace") {
      const { clause, values } = setClause(patch as Record<string, unknown>);
      try {
        // Token-guarded question write FIRST: a stale token or missing row
        // writes nothing — options are untouched on 404/409. A crash
        // between the question write and the options batch heals on retry
        // (options replace is idempotent; the spent token 409s toward
        // refetch + new key, which re-applies both halves).
        if (clause) {
          const result = await run(`UPDATE questions SET ${clause} WHERE id = ? AND updated_at = ?`, ...values, id, expectedUpdatedAt);
          if ((result.meta.changes ?? 0) === 0) {
            const existing = await this.getQuestion(id);
            if (!existing) return null;
            throw new HttpError("CONFLICT", 409, "Question was modified concurrently; reload and retry");
          }
        } else {
          const checked = await checkToken((rowId) => this.getQuestion(rowId), id, expectedUpdatedAt);
          if (!checked) return null;
        }
        if (options && optionsMode === "replace") {
          try {
            await db.batch([
              db.prepare("DELETE FROM question_options WHERE question_id = ?").bind(id),
              ...options.map((option) => db.prepare(`INSERT INTO question_options
              (id, source_legacy_id, question_id, option_html_en, option_html_si, option_html_ta, sanitization_status, sanitizer_version, sort_order, is_correct)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
                .bind(option.id, option.source_legacy_id ?? null, id, option.option_html_en, option.option_html_si, option.option_html_ta,
                  option.sanitization_status, option.sanitizer_version, option.sort_order, option.is_correct)),
            ]);
          } catch (error) {
            // The question existed a moment ago (guarded write above): a
            // foreign-key failure here means it was deleted concurrently.
            if (error instanceof Error && /FOREIGN KEY constraint failed/i.test(error.message)) return null;
            throw error;
          }
        }
        if (options && optionsMode === "inplace") {
          await db.batch(options.map((option) => db.prepare(`UPDATE question_options SET
            option_html_en = ?, option_html_si = ?, option_html_ta = ?, sanitization_status = ?, sanitizer_version = ?,
            sort_order = ?, is_correct = ? WHERE id = ? AND question_id = ?`)
            .bind(option.option_html_en, option.option_html_si, option.option_html_ta, option.sanitization_status,
              option.sanitizer_version, option.sort_order, option.is_correct, option.id, id)));
        }
      } catch (error) { conflict(error, "Question update rejected by content rules"); }
      return this.getQuestion(id);
    },
    async setQuestionState(id, state, expectedUpdatedAt) {
      try {
        return await guardedUpdate("questions", "state = ?", (rowId) => this.getQuestion(rowId), id, expectedUpdatedAt, state);
      } catch (error) { conflict(error, "Question state transition rejected"); }
    },
    async deleteQuestion(id) {
      // Options cascade via ON DELETE CASCADE in the same statement.
      const result = await run("DELETE FROM questions WHERE id = ?", id);
      return (result.meta.changes ?? 0) > 0;
    },

    listStudyMaterials: (limit, cursor) => page<StudyMaterialRow>("study_materials", "1 = 1", limit, cursor),
    getStudyMaterial: (id) => first<StudyMaterialRow>("SELECT * FROM study_materials WHERE id = ?", id),
    async findStudyIdByPaper(paperId) {
      const row = await first<{ id: string }>("SELECT id FROM study_materials WHERE paper_id = ? ORDER BY id LIMIT 1", paperId);
      return row?.id ?? null;
    },
    async findStudyIdsByPapers(paperIds) {
      const found = new Map<string, string>();
      for (let offset = 0; offset < paperIds.length; offset += 100) {
        const chunk = paperIds.slice(offset, offset + 100);
        const placeholders = chunk.map(() => "?").join(",");
        const rows = await all<{ paper_id: string; id: string }>(
          `SELECT paper_id, id FROM study_materials WHERE paper_id IN (${placeholders}) ORDER BY paper_id, id`, ...chunk);
        for (const row of rows) {
          if (row.paper_id && !found.has(row.paper_id)) found.set(row.paper_id, row.id);
        }
      }
      return found;
    },
    async listOptionsForQuestions(questionIds) {
      const out: QuestionOptionRow[] = [];
      for (let offset = 0; offset < questionIds.length; offset += 100) {
        const chunk = questionIds.slice(offset, offset + 100);
        const placeholders = chunk.map(() => "?").join(",");
        out.push(...await all<QuestionOptionRow>(`SELECT * FROM question_options WHERE question_id IN (${placeholders}) ORDER BY question_id, sort_order, id`, ...chunk));
      }
      return out;
    },
    async insertStudyMaterial(row) {
      try {
        const created = await first<StudyMaterialRow>(`INSERT INTO study_materials
          (id, source_legacy_id, subject_id, paper_id, slug, title_en, title_si, title_ta, description_en, description_si, description_ta,
           sanitization_status, sanitizer_version, object_key, content_type, byte_size, sha256, state)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft') RETURNING *`,
          row.id, row.source_legacy_id ?? null, row.subject_id, row.paper_id, row.slug, row.title_en, row.title_si, row.title_ta,
          row.description_en, row.description_si, row.description_ta, row.sanitization_status, row.sanitizer_version,
          row.object_key, row.content_type, row.byte_size, row.sha256 ?? null);
        if (!created) throw new HttpError("INTERNAL_ERROR", 500, "Study material insert returned no row");
        return created;
      } catch (error) { conflict(error, "A study material with this id or slug already exists"); }
    },
    async updateStudyMaterial(id, patch, expectedUpdatedAt) {
      const { clause, values } = setClause(patch as Record<string, unknown>);
      if (!clause) return checkToken((rowId) => this.getStudyMaterial(rowId), id, expectedUpdatedAt);
      try {
        return await guardedUpdate("study_materials", clause, (rowId) => this.getStudyMaterial(rowId), id, expectedUpdatedAt, ...values);
      } catch (error) { conflict(error, "A study material with this slug already exists"); }
    },
    async setStudyMaterialState(id, state, expectedUpdatedAt) {
      // No publish-requires triggers cover study materials, so the route
      // checks parent publication before calling this.
      try {
        return await guardedUpdate("study_materials", "state = ?", (rowId) => this.getStudyMaterial(rowId), id, expectedUpdatedAt, state);
      } catch (error) { conflict(error, "Study material state transition rejected"); }
    },
    async deleteStudyMaterial(id) {
      const result = await run("DELETE FROM study_materials WHERE id = ?", id);
      return (result.meta.changes ?? 0) > 0;
    },

    listGalleryItems: (limit, cursor) => page<GalleryItemRow>("gallery_items", "1 = 1", limit, cursor),
    getGalleryItem: (id) => first<GalleryItemRow>("SELECT * FROM gallery_items WHERE id = ?", id),
    async insertGalleryItem(row) {
      try {
        const created = await first<GalleryItemRow>(`INSERT INTO gallery_items
          (id, source_legacy_id, slug, title_en, title_si, title_ta, description_en, description_si, description_ta, alt_en, alt_si, alt_ta,
           image_object_key, thumbnail_object_key, content_type, image_sha256, thumbnail_sha256, width, height, byte_size, thumbnail_byte_size, pinned, sort_order, state)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft') RETURNING *`,
          row.id, row.source_legacy_id ?? null, row.slug, row.title_en, row.title_si, row.title_ta, row.description_en, row.description_si, row.description_ta,
          row.alt_en, row.alt_si, row.alt_ta, row.image_object_key, row.thumbnail_object_key, row.content_type,
          row.image_sha256, row.thumbnail_sha256, row.width, row.height, row.byte_size, row.thumbnail_byte_size, row.pinned, row.sort_order);
        if (!created) throw new HttpError("INTERNAL_ERROR", 500, "Gallery item insert returned no row");
        return created;
      } catch (error) { conflict(error, "A gallery item with this id or slug already exists"); }
    },
    async updateGalleryItem(id, patch, expectedUpdatedAt) {
      const { clause, values } = setClause(patch as Record<string, unknown>);
      if (!clause) return checkToken((rowId) => this.getGalleryItem(rowId), id, expectedUpdatedAt);
      try {
        return await guardedUpdate("gallery_items", clause, (rowId) => this.getGalleryItem(rowId), id, expectedUpdatedAt, ...values);
      } catch (error) { conflict(error, "A gallery item with this slug already exists"); }
    },
    async setGalleryItemState(id, state, expectedUpdatedAt) {
      try {
        return await guardedUpdate("gallery_items", "state = ?", (rowId) => this.getGalleryItem(rowId), id, expectedUpdatedAt, state);
      } catch (error) { conflict(error, "Gallery item state transition rejected"); }
    },
    async deleteGalleryItem(id) {
      const result = await run("DELETE FROM gallery_items WHERE id = ?", id);
      return (result.meta.changes ?? 0) > 0;
    },

    listContentPages: (limit, cursor) => page<ContentPageRow>("content_pages", "1 = 1", limit, cursor),
    getContentPage: (id) => first<ContentPageRow>("SELECT * FROM content_pages WHERE id = ?", id),
    async insertContentPage(row) {
      try {
        const created = await first<ContentPageRow>(`INSERT INTO content_pages
          (id, source_legacy_id, slug, title_en, title_si, title_ta, body_en, body_si, body_ta, state)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft') RETURNING *`,
          row.id, row.source_legacy_id ?? null, row.slug, row.title_en, row.title_si, row.title_ta, row.body_en, row.body_si, row.body_ta);
        if (!created) throw new HttpError("INTERNAL_ERROR", 500, "Content page insert returned no row");
        return created;
      } catch (error) { conflict(error, "A content page with this id or slug already exists"); }
    },
    async updateContentPage(id, patch, expectedUpdatedAt) {
      const { clause, values } = setClause(patch as Record<string, unknown>);
      if (!clause) return checkToken((rowId) => this.getContentPage(rowId), id, expectedUpdatedAt);
      try {
        return await guardedUpdate("content_pages", clause, (rowId) => this.getContentPage(rowId), id, expectedUpdatedAt, ...values);
      } catch (error) { conflict(error, "A content page with this slug already exists"); }
    },
    async setContentPageState(id, state, expectedUpdatedAt) {
      try {
        return await guardedUpdate("content_pages", "state = ?", (rowId) => this.getContentPage(rowId), id, expectedUpdatedAt, state);
      } catch (error) { conflict(error, "Content page state transition rejected"); }
    },
    async deleteContentPage(id) {
      const result = await run("DELETE FROM content_pages WHERE id = ?", id);
      return (result.meta.changes ?? 0) > 0;
    },

    getAbout: () => first<AboutRow>("SELECT * FROM about_profiles WHERE id = 'about'"),
    async upsertAbout(row, expectedUpdatedAt) {
      if (expectedUpdatedAt !== undefined && expectedUpdatedAt !== null) {
        const result = await run(`UPDATE about_profiles SET description = ?, image_object_key = ?, image_url = ?,
          facebook_url = ?, youtube_url = ?, linkedin_url = ?, updated_at = ${MONOTONIC_STAMP}
          WHERE id = 'about' AND updated_at = ?`,
          row.description, row.image_object_key, row.image_url, row.facebook_url, row.youtube_url, row.linkedin_url, expectedUpdatedAt);
        if ((result.meta.changes ?? 0) === 0) {
          const existing = await first<AboutRow>("SELECT * FROM about_profiles WHERE id = 'about'");
          if (!existing) throw new HttpError("CONFLICT", 409, "About profile does not exist; retry without a token");
          throw new HttpError("CONFLICT", 409, "About profile was modified concurrently; reload and retry");
        }
        const fresh = await first<AboutRow>("SELECT * FROM about_profiles WHERE id = 'about'");
        if (!fresh) throw new HttpError("INTERNAL_ERROR", 500, "Updated row vanished");
        return fresh;
      }
      const updated = await first<AboutRow>(`INSERT INTO about_profiles
        (id, description, image_object_key, image_url, facebook_url, youtube_url, linkedin_url)
        VALUES ('about', ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET description = excluded.description, image_object_key = excluded.image_object_key,
          image_url = excluded.image_url, facebook_url = excluded.facebook_url, youtube_url = excluded.youtube_url,
          linkedin_url = excluded.linkedin_url, updated_at = ${MONOTONIC_STAMP} RETURNING *`,
        row.description, row.image_object_key, row.image_url, row.facebook_url, row.youtube_url, row.linkedin_url);
      if (!updated) throw new HttpError("INTERNAL_ERROR", 500, "About upsert returned no row");
      return updated;
    },
    getPrivacy: () => first<PrivacyRow>("SELECT * FROM privacy_policies WHERE id = 'privacy'"),
    async upsertPrivacy(row, expectedUpdatedAt) {
      if (expectedUpdatedAt !== undefined && expectedUpdatedAt !== null) {
        const result = await run(`UPDATE privacy_policies SET statement = ?, full_html = ?,
          sanitization_status = ?, sanitizer_version = ?, updated_at = ${MONOTONIC_STAMP}
          WHERE id = 'privacy' AND updated_at = ?`,
          row.statement, row.full_html, row.sanitization_status, row.sanitizer_version, expectedUpdatedAt);
        if ((result.meta.changes ?? 0) === 0) {
          const existing = await first<PrivacyRow>("SELECT * FROM privacy_policies WHERE id = 'privacy'");
          if (!existing) throw new HttpError("CONFLICT", 409, "Privacy policy does not exist; retry without a token");
          throw new HttpError("CONFLICT", 409, "Privacy policy was modified concurrently; reload and retry");
        }
        const fresh = await first<PrivacyRow>("SELECT * FROM privacy_policies WHERE id = 'privacy'");
        if (!fresh) throw new HttpError("INTERNAL_ERROR", 500, "Updated row vanished");
        return fresh;
      }
      const updated = await first<PrivacyRow>(`INSERT INTO privacy_policies
        (id, statement, full_html, sanitization_status, sanitizer_version)
        VALUES ('privacy', ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET statement = excluded.statement, full_html = excluded.full_html,
          sanitization_status = excluded.sanitization_status, sanitizer_version = excluded.sanitizer_version,
          updated_at = ${MONOTONIC_STAMP} RETURNING *`,
        row.statement, row.full_html, row.sanitization_status, row.sanitizer_version);
      if (!updated) throw new HttpError("INTERNAL_ERROR", 500, "Privacy upsert returned no row");
      return updated;
    },
  };
}
