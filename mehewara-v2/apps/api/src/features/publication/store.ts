import { HttpError } from "../../shared/errors";

/**
 * Narrow persistence capability for publication snapshots. Feature modules
 * receive this store — never the raw D1 binding. The entrypoint is the only
 * place that constructs it from `env.D1`.
 *
 * Reads return raw D1 rows (snake_case, SQLite integers for booleans);
 * `build.ts` maps them onto the public contracts and enforces publish
 * readiness. Writes are single statements; multi-statement flows in the
 * route layer are ordered so a crash can only leave a dangling snapshot row
 * (never a moved pointer without history).
 */

export interface SubjectRow { id: string; slug: string; title_en: string; title_si: string; title_ta: string | null; description_en: string | null; description_si: string | null; description_ta: string | null; exam_type: string; code: string; icon: string; color: string; presentation_variant: string; state: string; sort_order: number; updated_at: string; }
export interface PaperRow { id: string; subject_id: string; exam_type: string; slug: string; title_en: string; title_si: string; title_ta: string | null; year: number; language: string; duration_minutes: number; question_count: number; materialized_question_count: number; question_count_source: string; state: string; updated_at: string; }
export interface QuestionRow { id: string; paper_id: string; number: number; question_html_en: string; question_html_si: string; question_html_ta: string | null; explanation_html_en: string | null; explanation_html_si: string | null; explanation_html_ta: string | null; sanitization_status: string; sanitizer_version: string | null; option_count: number; answer_mode: string; is_all_correct: number; marks: number; state: string; updated_at: string; }
export interface QuestionOptionRow { id: string; question_id: string; option_html_en: string; option_html_si: string; option_html_ta: string | null; sanitization_status: string; sanitizer_version: string | null; sort_order: number; is_correct: number; }
export interface StudyMaterialRow { id: string; subject_id: string; paper_id: string | null; slug: string; title_en: string; title_si: string; title_ta: string | null; description_en: string | null; description_si: string | null; description_ta: string | null; sanitization_status: string; sanitizer_version: string | null; object_key: string | null; content_type: string | null; byte_size: number; state: string; updated_at: string; }
export interface GalleryItemRow { id: string; slug: string; title_en: string; title_si: string; title_ta: string | null; description_en: string | null; description_si: string | null; description_ta: string | null; alt_en: string; alt_si: string; alt_ta: string | null; image_object_key: string; thumbnail_object_key: string; content_type: string; width: number; height: number; byte_size: number; pinned: number; sort_order: number; state: string; created_at: string; updated_at: string; }
export interface ContentPageRow { id: string; slug: string; title_en: string; title_si: string; title_ta: string | null; body_en: string; body_si: string; body_ta: string | null; state: string; updated_at: string; }
export interface AboutRow { id: string; description: string | null; image_object_key: string | null; image_url: string | null; facebook_url: string | null; youtube_url: string | null; linkedin_url: string | null; updated_at: string; }
export interface PrivacyRow { id: string; statement: string; full_html: string | null; sanitization_status: string; sanitizer_version: string | null; updated_at: string; }
export interface SnapshotRow { id: string; version: number; object_key: string; sha256: string; byte_size: number; status: string; published_at: string; created_at: string; }

export interface PublicationStore {
  listPublishedSubjects(): Promise<SubjectRow[]>;
  listPublishedPapers(): Promise<PaperRow[]>;
  listPublishedQuestions(): Promise<QuestionRow[]>;
  listOptionsForQuestions(questionIds: string[]): Promise<QuestionOptionRow[]>;
  listPublishedStudyMaterials(): Promise<StudyMaterialRow[]>;
  listPublishedGalleryItems(): Promise<GalleryItemRow[]>;
  listPublishedContentPages(): Promise<ContentPageRow[]>;
  getAbout(): Promise<AboutRow | null>;
  getPrivacy(): Promise<PrivacyRow | null>;
  getMaxSnapshotVersion(): Promise<number>;
  getSnapshot(id: string): Promise<SnapshotRow | null>;
  getCurrent(): Promise<{ snapshot_id: string; version: number } | null>;
  findBuildByIdempotencyKey(key: string): Promise<{ snapshot_id: string } | null>;
  findRollbackByIdempotencyKey(key: string): Promise<{ snapshot_id: string } | null>;
  /**
   * Atomically finalizes a build: snapshot row + build idempotency record +
   * current pointer + published history entry commit as one D1 batch. A
   * crash can therefore never leave a moved pointer without history, or
   * history without a pointer — either everything lands or nothing does.
   * Version/id races surface as CONFLICT (UNIQUE) for the route to handle.
   */
  publishSnapshotBundle(input: {
    snapshot: { id: string; version: number; objectKey: string; sha256: string; byteSize: number; publishedAt: string };
    idempotencyKey: string; actorId: string; reason: string;
  }): Promise<void>;
  /**
   * Atomically moves the current pointer with its rolled_back history entry
   * and records rollback idempotency, as one D1 batch.
   */
  rollbackBundle(input: { snapshotId: string; version: number; actorId: string; reason: string; idempotencyKey: string }): Promise<void>;
}

export function d1PublicationStore(db: D1Database): PublicationStore {
  const all = async <T>(sql: string, ...params: unknown[]): Promise<T[]> => {
    const result = await db.prepare(sql).bind(...params).all<T>();
    return result.results ?? [];
  };
  const first = async <T>(sql: string, ...params: unknown[]): Promise<T | null> => {
    const row = await db.prepare(sql).bind(...params).first<T>();
    return row ?? null;
  };
  return {
    listPublishedSubjects: () => all<SubjectRow>("SELECT * FROM subjects WHERE state = 'published' ORDER BY sort_order, id"),
    listPublishedPapers: () => all<PaperRow>("SELECT * FROM papers WHERE state = 'published' ORDER BY year DESC, id"),
    listPublishedQuestions: () => all<QuestionRow>("SELECT * FROM questions WHERE state = 'published' ORDER BY paper_id, number, id"),
    async listOptionsForQuestions(questionIds: string[]): Promise<QuestionOptionRow[]> {
      // D1 binds at most 100 parameters per query: chunk large publications
      // instead of one unbounded IN list.
      const out: QuestionOptionRow[] = [];
      for (let offset = 0; offset < questionIds.length; offset += 100) {
        const chunk = questionIds.slice(offset, offset + 100);
        const placeholders = chunk.map(() => "?").join(",");
        out.push(...await all<QuestionOptionRow>(`SELECT * FROM question_options WHERE question_id IN (${placeholders}) ORDER BY question_id, sort_order, id`, ...chunk));
      }
      return out;
    },
    listPublishedStudyMaterials: () => all<StudyMaterialRow>("SELECT * FROM study_materials WHERE state = 'published' ORDER BY subject_id, id"),
    listPublishedGalleryItems: () => all<GalleryItemRow>("SELECT * FROM gallery_items WHERE state = 'published' ORDER BY pinned DESC, sort_order, created_at, id"),
    listPublishedContentPages: () => all<ContentPageRow>("SELECT * FROM content_pages WHERE state = 'published' ORDER BY slug, id"),
    getAbout: () => first<AboutRow>("SELECT * FROM about_profiles WHERE id = 'about'"),
    getPrivacy: () => first<PrivacyRow>("SELECT * FROM privacy_policies WHERE id = 'privacy'"),
    async getMaxSnapshotVersion(): Promise<number> {
      const row = await first<{ version: number | null }>("SELECT MAX(version) AS version FROM publication_snapshots");
      return row?.version ?? 0;
    },
    getSnapshot: (id) => first<SnapshotRow>("SELECT * FROM publication_snapshots WHERE id = ?", id),
    getCurrent: () => first<{ snapshot_id: string; version: number }>("SELECT snapshot_id, version FROM current_publication WHERE singleton = 1"),
    async findBuildByIdempotencyKey(key) {
      return first<{ snapshot_id: string }>("SELECT snapshot_id FROM publication_builds WHERE idempotency_key = ?", key);
    },
    async findRollbackByIdempotencyKey(key) {
      return first<{ snapshot_id: string }>("SELECT snapshot_id FROM publication_rollback_intents WHERE idempotency_key = ?", key);
    },
    async publishSnapshotBundle(input) {
      const historyId = crypto.randomUUID();
      try {
        await db.batch([
          db.prepare(
            "INSERT INTO publication_snapshots (id, version, object_key, sha256, byte_size, published_at) VALUES (?, ?, ?, ?, ?, ?)"
          ).bind(input.snapshot.id, input.snapshot.version, input.snapshot.objectKey, input.snapshot.sha256, input.snapshot.byteSize, input.snapshot.publishedAt),
          db.prepare(
            "INSERT INTO publication_builds (idempotency_key, snapshot_id) VALUES (?, ?)"
          ).bind(input.idempotencyKey, input.snapshot.id),
          db.prepare(
            "INSERT INTO current_publication (singleton, snapshot_id, version) VALUES (1, ?, ?) ON CONFLICT(singleton) DO UPDATE SET snapshot_id = excluded.snapshot_id, version = excluded.version, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')"
          ).bind(input.snapshot.id, input.snapshot.version),
          db.prepare(
            "INSERT INTO publication_snapshot_history (id, snapshot_id, version, action, actor_id, reason) VALUES (?, ?, ?, 'published', ?, ?)"
          ).bind(historyId, input.snapshot.id, input.snapshot.version, input.actorId, input.reason),
        ]);
      } catch (error) {
        // Concurrent builds race on id/version/key: only a uniqueness
        // violation is a retryable conflict. Anything else (outage, syntax)
        // must propagate instead of masquerading as 409.
        if (error instanceof Error && /UNIQUE constraint failed/i.test(error.message)) {
          throw new HttpError("CONFLICT", 409, "A snapshot, build, or version from a concurrent build already exists");
        }
        throw error;
      }
    },
    async rollbackBundle(input) {
      const historyId = crypto.randomUUID();
      try {
        await db.batch([
          db.prepare(
            "INSERT INTO publication_rollback_intents (idempotency_key, snapshot_id) VALUES (?, ?)"
          ).bind(input.idempotencyKey, input.snapshotId),
          db.prepare(
            "INSERT INTO current_publication (singleton, snapshot_id, version) VALUES (1, ?, ?) ON CONFLICT(singleton) DO UPDATE SET snapshot_id = excluded.snapshot_id, version = excluded.version, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')"
          ).bind(input.snapshotId, input.version),
          db.prepare(
            "INSERT INTO publication_snapshot_history (id, snapshot_id, version, action, actor_id, reason) VALUES (?, ?, ?, 'rolled_back', ?, ?)"
          ).bind(historyId, input.snapshotId, input.version, input.actorId, input.reason),
        ]);
      } catch (error) {
        if (error instanceof Error && /UNIQUE constraint failed/i.test(error.message)) {
          throw new HttpError("CONFLICT", 409, "A rollback with this idempotency key already exists");
        }
        throw error;
      }
    },
  };
}
