import { HttpError } from "./errors";
import type {
  SubjectRow, PaperRow, QuestionRow, QuestionOptionRow, StudyMaterialRow,
  GalleryItemRow, ContentPageRow, AboutRow,
} from "../features/publication/store";

/**
 * Row -> contract mappers, the single mapping truth for admin reads and
 * backup export. Every mapper output is validated against its contract by
 * the caller (Subject.parse etc.), so a shape drift fails fast in tests
 * instead of shipping off-contract bodies.
 */

type Localized = { en: string; si: string; ta?: string };
export const loc3 = (en: string, si: string, ta: string | null): Localized =>
  (ta == null ? { en, si } : { en, si, ta });
export const loc3n = (en: string | null, si: string | null, ta: string | null): Localized | null =>
  (en == null && si == null && ta == null ? null : { en: en ?? "", si: si ?? "", ...(ta != null ? { ta } : {}) });
export const loc2 = (en: string, si: string): { en: string; si: string } => ({ en, si });
export const bool = (value: number): boolean => value === 1;
export const num = (value: boolean): number => (value ? 1 : 0);

export function mapSubject(row: SubjectRow): unknown {
  return {
    id: row.id, slug: row.slug, title: loc3(row.title_en, row.title_si, row.title_ta),
    description: loc3n(row.description_en, row.description_si, row.description_ta),
    examType: row.exam_type, code: row.code,
    presentation: { icon: row.icon, color: row.color, variant: row.presentation_variant },
    state: row.state, sortOrder: row.sort_order, updatedAt: row.updated_at,
  };
}

export function mapPaper(row: PaperRow, studyMaterialId: string | null): unknown {
  return {
    id: row.id, subjectId: row.subject_id, examType: row.exam_type, slug: row.slug,
    title: loc2(row.title_en, row.title_si), year: row.year, language: row.language,
    durationMinutes: row.duration_minutes, questionCount: row.question_count,
    materializedQuestionCount: row.materialized_question_count, questionCountSource: row.question_count_source,
    studyMaterialId, state: row.state, updatedAt: row.updated_at,
  };
}

export function mapOption(row: QuestionOptionRow): { id: string; questionId: string; html: string; contentSafety: unknown; sortOrder: number; isCorrect: boolean } {
  return {
    id: row.id, questionId: row.question_id, html: row.option_html_en,
    contentSafety: { sanitizationStatus: row.sanitization_status, sanitizerVersion: row.sanitizer_version },
    sortOrder: row.sort_order, isCorrect: bool(row.is_correct),
  };
}

export function mapQuestion(row: QuestionRow, options: QuestionOptionRow[]): unknown {
  const sorted = [...options].sort((a, b) => a.sort_order - b.sort_order);
  const indexes = sorted.map((option, index) => (bool(option.is_correct) ? index : -1)).filter((index) => index >= 0);
  return {
    id: row.id, paperId: row.paper_id, number: row.number,
    questionHtml: row.question_html_en, explanationHtml: row.explanation_html_en,
    contentSafety: { sanitizationStatus: row.sanitization_status, sanitizerVersion: row.sanitizer_version },
    options: sorted.map(mapOption), optionCount: row.option_count,
    answerMode: row.answer_mode, correctOptionIndexes: indexes, isAllCorrect: bool(row.is_all_correct),
    marks: row.marks, state: row.state, updatedAt: row.updated_at,
  };
}

export function mapStudy(row: StudyMaterialRow): unknown {
  // Draft/legacy rows can predate the inventory gate with no attached
  // object. That is actionable data corruption, not a server bug: answer
  // 422 naming the row instead of 500ing on the contract, and the admin
  // can attach a key through update.
  if (row.object_key == null || row.content_type == null) {
    throw new HttpError("UNPROCESSABLE", 422, `Study material ${row.id} has no servable object; attach one via update`);
  }
  return {
    id: row.id, subjectId: row.subject_id, paperId: row.paper_id, slug: row.slug,
    title: loc2(row.title_en, row.title_si),
    description: row.description_en == null && row.description_si == null ? null : loc2(row.description_en ?? "", row.description_si ?? ""),
    objectKey: row.object_key, contentType: row.content_type, byteSize: row.byte_size,
    contentSafety: { sanitizationStatus: row.sanitization_status, sanitizerVersion: row.sanitizer_version },
    state: row.state, updatedAt: row.updated_at,
  };
}

export function mapGallery(row: GalleryItemRow): unknown {
  return {
    id: row.id, slug: row.slug, title: loc2(row.title_en, row.title_si),
    description: loc2(row.description_en ?? "", row.description_si ?? ""), altText: loc2(row.alt_en, row.alt_si),
    imageObjectKey: row.image_object_key, thumbnailObjectKey: row.thumbnail_object_key,
    contentType: row.content_type, width: row.width, height: row.height, byteSize: row.byte_size,
    pinned: bool(row.pinned), sortOrder: row.sort_order, state: row.state,
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

export function mapPage(row: ContentPageRow): unknown {
  return {
    id: row.id, slug: row.slug, title: loc2(row.title_en, row.title_si), body: loc2(row.body_en, row.body_si),
    state: row.state, updatedAt: row.updated_at,
  };
}

export function mapAbout(row: AboutRow, image: unknown): unknown {
  return {
    id: "about", description: row.description, image,
    social: { facebookUrl: row.facebook_url, youtubeUrl: row.youtube_url, linkedinUrl: row.linkedin_url },
    updatedAt: row.updated_at,
  };
}

/**
 * Canonical admin about-image view: the key persists, dimensions do not
 * (D1 keeps the key only), so every response resolves the content type
 * live and reports the stored 1x1 fallback, exactly like the migration
 * transformer. The lookup is injected so both admin and import-export
 * routes share this without layering on the inventory store.
 */
export async function aboutImageView(
  lookup: (objectKey: string) => Promise<{ contentType: string } | null>,
  objectKey: string | null,
): Promise<unknown> {
  if (!objectKey) return null;
  const record = await lookup(objectKey);
  return { objectKey, contentType: record?.contentType ?? "image/jpeg", width: 1, height: 1 };
}
