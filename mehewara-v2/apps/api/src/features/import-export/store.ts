import { HttpError } from "../../shared/errors";
import type {
  SubjectRow, PaperRow, QuestionRow, QuestionOptionRow, StudyMaterialRow,
  GalleryItemRow, ContentPageRow, AboutRow, PrivacyRow, SnapshotRow,
} from "../publication/store";
import type {
  SubjectInsert, PaperInsert, QuestionInsert, OptionInsert, StudyInsert,
  GalleryInsert, PageInsert,
} from "../admin/store";

/**
 * Narrow persistence capability for backup export and import-restore.
 * Export reads full tables (all states); import upserts full rows without
 * optimistic tokens (a restore is authoritative — conflicts resolve
 * last-write-wins, and same-manifest retries converge idempotently).
 * Feature modules receive this store — never the raw D1 binding.
 */

export interface LegacyIdMapRow { source_system: string; entity_type: string; source_id: string; v2_id: string }
export interface MediaInventoryRow { object_key: string; purpose: string; sha256: string; byte_size: number; content_type: string }
export interface SnapshotHistoryRow { id: string; snapshot_id: string; version: number; action: string; actor_id: string; reason: string; created_at: string }
export interface ImportJobRow { id: string; requested_by: string; status: string; manifest_checksum: string; imported_records: number; error_code: string | null }

export type SubjectUpsert = SubjectInsert & { state: string };
export type PaperUpsert = PaperInsert & { state: string; materialized_question_count?: number };
export type StudyUpsert = StudyInsert & { state: string };
export type GalleryUpsert = GalleryInsert & { state: string };
export type PageUpsert = PageInsert & { state: string };

export interface ImportStore {
  // Export reads (all states, deterministic order).
  listAllSubjects(): Promise<SubjectRow[]>;
  listAllPapers(): Promise<PaperRow[]>;
  listAllQuestions(): Promise<QuestionRow[]>;
  countQuestions(): Promise<number>;
  listOptionsForQuestions(questionIds: string[]): Promise<QuestionOptionRow[]>;
  listAllStudyMaterials(): Promise<StudyMaterialRow[]>;
  listAllGalleryItems(): Promise<GalleryItemRow[]>;
  listAllContentPages(): Promise<ContentPageRow[]>;
  getAbout(): Promise<AboutRow | null>;
  getPrivacy(): Promise<PrivacyRow | null>;
  listLegacyIdMap(): Promise<LegacyIdMapRow[]>;
  listMediaInventory(): Promise<MediaInventoryRow[]>;
  listSnapshots(): Promise<SnapshotRow[]>;
  listSnapshotHistory(): Promise<SnapshotHistoryRow[]>;
  // Import upserts.
  upsertSubject(row: SubjectUpsert): Promise<void>;
  upsertPaper(row: PaperUpsert): Promise<void>;
  upsertQuestionDraft(question: QuestionInsert, options: OptionInsert[]): Promise<void>;
  upsertStudyMaterial(row: StudyUpsert): Promise<void>;
  upsertGalleryItem(row: GalleryUpsert): Promise<void>;
  upsertContentPage(row: PageUpsert): Promise<void>;
  upsertLegacyIdMap(rows: LegacyIdMapRow[]): Promise<void>;
  upsertMediaInventory(rows: MediaInventoryRow[]): Promise<void>;
  upsertSnapshot(snapshot: { id: string; version: number; objectKey: string; sha256: string; byteSize: number; publishedAt: string }): Promise<void>;
  upsertSnapshotHistory(row: { id: string; snapshot_id: string; version: number; action: string; actor_id: string; reason: string }): Promise<void>;
  upsertCurrentPointer(snapshotId: string, version: number): Promise<void>;
  // Jobs.
  createImportJob(id: string, actorId: string, checksum: string): Promise<void>;
  setImportJobStatus(id: string, status: string, importedRecords: number, errorCode: string | null): Promise<void>;
  getImportJob(id: string): Promise<ImportJobRow | null>;
}

function conflict(error: unknown, message: string): never {
  if (error instanceof HttpError) throw error;
  const text = error instanceof Error ? error.message : "";
  if (/UNIQUE constraint failed|FOREIGN KEY constraint failed|CHECK constraint failed|ABORT|publish|sanitized|option count|linked study material|repoint them|must belong/i.test(text)) {
    throw new HttpError("CONFLICT", 409, text.replace(/^.*ABORT,?\s*/i, "").slice(0, 300) || message);
  }
  throw error;
}

export function d1ImportStore(db: D1Database): ImportStore {
  const all = async <T>(sql: string, ...params: unknown[]): Promise<T[]> => {
    const result = await db.prepare(sql).bind(...params).all<T>();
    return result.results ?? [];
  };
  const first = async <T>(sql: string, ...params: unknown[]): Promise<T | null> => {
    const row = await db.prepare(sql).bind(...params).first<T>();
    return row ?? null;
  };
  const run = (sql: string, ...params: unknown[]) => db.prepare(sql).bind(...params).run();

  return {
    listAllSubjects: () => all<SubjectRow>("SELECT * FROM subjects ORDER BY sort_order, id"),
    listAllPapers: () => all<PaperRow>("SELECT * FROM papers ORDER BY subject_id, year DESC, id"),
    listAllQuestions: () => all<QuestionRow>("SELECT * FROM questions ORDER BY paper_id, number, id"),
    async countQuestions() {
      const row = await first<{ count: number }>("SELECT COUNT(*) AS count FROM questions");
      return row?.count ?? 0;
    },
    listAllStudyMaterials: () => all<StudyMaterialRow>("SELECT * FROM study_materials ORDER BY subject_id, id"),
    listAllGalleryItems: () => all<GalleryItemRow>("SELECT * FROM gallery_items ORDER BY pinned DESC, sort_order, created_at, id"),
    listAllContentPages: () => all<ContentPageRow>("SELECT * FROM content_pages ORDER BY slug, id"),
    listLegacyIdMap: () => all<LegacyIdMapRow>("SELECT source_system, entity_type, source_id, v2_id FROM legacy_id_map ORDER BY source_system, entity_type, source_id"),
    listMediaInventory: () => all<MediaInventoryRow>("SELECT object_key, purpose, sha256, byte_size, content_type FROM media_inventory ORDER BY object_key"),
    listSnapshots: () => all<SnapshotRow>("SELECT * FROM publication_snapshots ORDER BY version"),
    listSnapshotHistory: () => all<SnapshotHistoryRow>("SELECT id, snapshot_id, version, action, actor_id, reason, created_at FROM publication_snapshot_history ORDER BY created_at, id"),

    async listOptionsForQuestions(questionIds: string[]): Promise<QuestionOptionRow[]> {
      const out: QuestionOptionRow[] = [];
      for (let offset = 0; offset < questionIds.length; offset += 100) {
        const chunk = questionIds.slice(offset, offset + 100);
        const placeholders = chunk.map(() => "?").join(",");
        out.push(...await all<QuestionOptionRow>(`SELECT * FROM question_options WHERE question_id IN (${placeholders}) ORDER BY question_id, sort_order, id`, ...chunk));
      }
      return out;
    },
    getAbout: () => first<AboutRow>("SELECT * FROM about_profiles WHERE id = 'about'"),
    getPrivacy: () => first<PrivacyRow>("SELECT * FROM privacy_policies WHERE id = 'privacy'"),

    async upsertSubject(row) {
      try {
        await run(`INSERT INTO subjects
          (id, source_legacy_id, slug, title_en, title_si, title_ta, description_en, description_si, description_ta, exam_type, code, icon, color, presentation_variant, state, sort_order)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET source_legacy_id = excluded.source_legacy_id, slug = excluded.slug,
            title_en = excluded.title_en, title_si = excluded.title_si, title_ta = excluded.title_ta,
            description_en = excluded.description_en, description_si = excluded.description_si, description_ta = excluded.description_ta,
            exam_type = excluded.exam_type, code = excluded.code, icon = excluded.icon, color = excluded.color,
            presentation_variant = excluded.presentation_variant, state = excluded.state, sort_order = excluded.sort_order`,
          row.id, row.source_legacy_id ?? null, row.slug, row.title_en, row.title_si, row.title_ta,
          row.description_en, row.description_si, row.description_ta, row.exam_type, row.code,
          row.icon, row.color, row.presentation_variant, row.state, row.sort_order);
      } catch (error) { conflict(error, "Subject restore rejected"); }
    },
    async upsertPaper(row) {
      try {
        await run(`INSERT INTO papers
          (id, source_legacy_id, subject_id, slug, exam_type, title_en, title_si, title_ta, year, language, duration_minutes, question_count, materialized_question_count, question_count_source, state)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET source_legacy_id = excluded.source_legacy_id, subject_id = excluded.subject_id,
            slug = excluded.slug, exam_type = excluded.exam_type, title_en = excluded.title_en, title_si = excluded.title_si,
            title_ta = excluded.title_ta, year = excluded.year, language = excluded.language, duration_minutes = excluded.duration_minutes,
            question_count = excluded.question_count, materialized_question_count = excluded.materialized_question_count,
            question_count_source = excluded.question_count_source, state = excluded.state`,
          row.id, row.source_legacy_id ?? null, row.subject_id, row.slug, row.exam_type, row.title_en, row.title_si, row.title_ta,
          row.year, row.language, row.duration_minutes, row.question_count,
          (row as { materialized_question_count?: number }).materialized_question_count ?? 0, row.question_count_source, row.state);
      } catch (error) { conflict(error, "Paper restore rejected"); }
    },
    async upsertQuestionDraft(question, options) {
      // Draft-first always: published questions cannot be born (option rows
      // do not exist at parent INSERT time); states apply in phase two.
      try {
        await db.batch([
          db.prepare(`INSERT INTO questions
            (id, source_legacy_id, paper_id, number, question_html_en, question_html_si, question_html_ta, explanation_html_en, explanation_html_si, explanation_html_ta,
             sanitization_status, sanitizer_version, option_count, answer_mode, is_all_correct, marks, marks_source, state)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft')
            ON CONFLICT(id) DO UPDATE SET source_legacy_id = excluded.source_legacy_id, paper_id = excluded.paper_id,
              number = excluded.number, question_html_en = excluded.question_html_en, question_html_si = excluded.question_html_si,
              question_html_ta = excluded.question_html_ta, explanation_html_en = excluded.explanation_html_en,
              explanation_html_si = excluded.explanation_html_si, explanation_html_ta = excluded.explanation_html_ta,
              sanitization_status = excluded.sanitization_status, sanitizer_version = excluded.sanitizer_version,
              option_count = excluded.option_count, answer_mode = excluded.answer_mode, is_all_correct = excluded.is_all_correct,
              marks = excluded.marks, marks_source = excluded.marks_source, state = 'draft'`)
            .bind(question.id, question.source_legacy_id ?? null, question.paper_id, question.number, question.question_html_en, question.question_html_si, question.question_html_ta,
              question.explanation_html_en, question.explanation_html_si, question.explanation_html_ta, question.sanitization_status, question.sanitizer_version,
              question.option_count, question.answer_mode, question.is_all_correct, question.marks, question.marks_source ?? "legacy_default"),
          db.prepare("DELETE FROM question_options WHERE question_id = ?").bind(question.id),
          ...options.map((option) => db.prepare(`INSERT INTO question_options
            (id, source_legacy_id, question_id, option_html_en, option_html_si, option_html_ta, sanitization_status, sanitizer_version, sort_order, is_correct)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
            .bind(option.id, option.source_legacy_id ?? null, question.id, option.option_html_en, option.option_html_si, option.option_html_ta,
              option.sanitization_status, option.sanitizer_version, option.sort_order, option.is_correct)),
        ]);
      } catch (error) { conflict(error, "Question restore rejected"); }
    },
    async upsertStudyMaterial(row) {
      try {
        await run(`INSERT INTO study_materials
          (id, source_legacy_id, subject_id, paper_id, slug, title_en, title_si, title_ta, description_en, description_si, description_ta,
           sanitization_status, sanitizer_version, object_key, content_type, byte_size, sha256, state)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET source_legacy_id = excluded.source_legacy_id, subject_id = excluded.subject_id,
            paper_id = excluded.paper_id, slug = excluded.slug, title_en = excluded.title_en, title_si = excluded.title_si,
            title_ta = excluded.title_ta, description_en = excluded.description_en, description_si = excluded.description_si,
            description_ta = excluded.description_ta, sanitization_status = excluded.sanitization_status,
            sanitizer_version = excluded.sanitizer_version, object_key = excluded.object_key, content_type = excluded.content_type,
            byte_size = excluded.byte_size, sha256 = excluded.sha256, state = excluded.state`,
          row.id, row.source_legacy_id ?? null, row.subject_id, row.paper_id, row.slug, row.title_en, row.title_si, row.title_ta,
          row.description_en, row.description_si, row.description_ta, row.sanitization_status, row.sanitizer_version,
          row.object_key, row.content_type, row.byte_size, row.sha256 ?? null, row.state);
      } catch (error) { conflict(error, "Study material restore rejected"); }
    },
    async upsertGalleryItem(row) {
      try {
        await run(`INSERT INTO gallery_items
          (id, source_legacy_id, slug, title_en, title_si, title_ta, description_en, description_si, description_ta, alt_en, alt_si, alt_ta,
           image_object_key, thumbnail_object_key, content_type, image_sha256, thumbnail_sha256, width, height, byte_size, thumbnail_byte_size, pinned, sort_order, state)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET source_legacy_id = excluded.source_legacy_id, slug = excluded.slug,
            title_en = excluded.title_en, title_si = excluded.title_si, title_ta = excluded.title_ta,
            description_en = excluded.description_en, description_si = excluded.description_si, description_ta = excluded.description_ta,
            alt_en = excluded.alt_en, alt_si = excluded.alt_si, alt_ta = excluded.alt_ta,
            image_object_key = excluded.image_object_key, thumbnail_object_key = excluded.thumbnail_object_key,
            content_type = excluded.content_type, image_sha256 = excluded.image_sha256, thumbnail_sha256 = excluded.thumbnail_sha256,
            width = excluded.width, height = excluded.height, byte_size = excluded.byte_size,
            thumbnail_byte_size = excluded.thumbnail_byte_size, pinned = excluded.pinned, sort_order = excluded.sort_order, state = excluded.state`,
          row.id, row.source_legacy_id ?? null, row.slug, row.title_en, row.title_si, row.title_ta, row.description_en, row.description_si, row.description_ta,
          row.alt_en, row.alt_si, row.alt_ta, row.image_object_key, row.thumbnail_object_key, row.content_type,
          row.image_sha256, row.thumbnail_sha256, row.width, row.height, row.byte_size, row.thumbnail_byte_size, row.pinned, row.sort_order, row.state);
      } catch (error) { conflict(error, "Gallery item restore rejected"); }
    },
    async upsertContentPage(row) {
      try {
        await run(`INSERT INTO content_pages
          (id, source_legacy_id, slug, title_en, title_si, title_ta, body_en, body_si, body_ta, state)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET source_legacy_id = excluded.source_legacy_id, slug = excluded.slug,
            title_en = excluded.title_en, title_si = excluded.title_si, title_ta = excluded.title_ta,
            body_en = excluded.body_en, body_si = excluded.body_si, body_ta = excluded.body_ta, state = excluded.state`,
          row.id, row.source_legacy_id ?? null, row.slug, row.title_en, row.title_si, row.title_ta, row.body_en, row.body_si, row.body_ta, row.state);
      } catch (error) { conflict(error, "Content page restore rejected"); }
    },
    async upsertLegacyIdMap(rows) {
      if (rows.length === 0) return;
      await db.batch(rows.map((entry) => db.prepare(`INSERT INTO legacy_id_map
        (source_system, entity_type, source_id, v2_id) VALUES (?, ?, ?, ?)
        ON CONFLICT(source_system, entity_type, source_id) DO UPDATE SET v2_id = excluded.v2_id`)
        .bind(entry.source_system, entry.entity_type, entry.source_id, entry.v2_id)));
    },
    async upsertMediaInventory(rows) {
      if (rows.length === 0) return;
      await db.batch(rows.map((entry) => db.prepare(`INSERT INTO media_inventory
        (object_key, purpose, sha256, byte_size, content_type) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(object_key) DO UPDATE SET purpose = excluded.purpose, sha256 = excluded.sha256,
          byte_size = excluded.byte_size, content_type = excluded.content_type`)
        .bind(entry.object_key, entry.purpose, entry.sha256, entry.byte_size, entry.content_type)));
    },
    async upsertSnapshot(snapshot) {
      // Snapshots are immutable: never overwrite an existing row.
      await run(`INSERT INTO publication_snapshots (id, version, object_key, sha256, byte_size, status, published_at)
        VALUES (?, ?, ?, ?, ?, 'published', ?) ON CONFLICT(id) DO NOTHING`,
        snapshot.id, snapshot.version, snapshot.objectKey, snapshot.sha256, snapshot.byteSize, snapshot.publishedAt);
    },
    async upsertSnapshotHistory(row) {
      await run(`INSERT INTO publication_snapshot_history (id, snapshot_id, version, action, actor_id, reason)
        VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING`,
        row.id, row.snapshot_id, row.version, row.action, row.actor_id, row.reason);
    },
    async upsertCurrentPointer(snapshotId, version) {
      await run(`INSERT INTO current_publication (singleton, snapshot_id, version) VALUES (1, ?, ?)
        ON CONFLICT(singleton) DO UPDATE SET snapshot_id = excluded.snapshot_id, version = excluded.version,
          updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')`, snapshotId, version);
    },
    async createImportJob(id, actorId, checksum) {
      await run("INSERT INTO import_jobs (id, requested_by, status, manifest_checksum) VALUES (?, ?, 'queued', ?)",
        id, actorId, checksum);
    },
    async setImportJobStatus(id, status, importedRecords, errorCode) {
      await run("UPDATE import_jobs SET status = ?, imported_records = ?, error_code = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?",
        status, importedRecords, errorCode, id);
    },
    getImportJob: (id) => first<ImportJobRow>("SELECT id, requested_by, status, manifest_checksum, imported_records, error_code FROM import_jobs WHERE id = ?", id),
  };
}
