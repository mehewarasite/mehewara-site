#!/usr/bin/env node
/**
 * Pure, dependency-minimal legacy -> v2 import-plan transform.
 *
 * This module only turns an in-memory legacy export into a portable plan. It
 * never reads .env, calls a provider, or writes D1/B2. UUIDs are deterministic
 * UUID-shaped SHA-256 values so rerunning the same source produces the same
 * target IDs and checksums.
 */
import { createHash } from "node:crypto";

export const PLAN_FORMAT = "mehewara-v2-migration-plan";
export const PLAN_VERSION = 1;
export const LIMITS = Object.freeze({
  // Total serialized input budget. Must comfortably exceed one gallery hex
  // payload (20M chars) plus the structured rows around it.
  inputBytes: 500_000_000,
  arrayItems: 5_000,
  objectKeys: 100,
  stringBytes: 500_000,
  htmlBytes: 500_000,
  nesting: 20,
  options: 5
});

const DEFAULT_TIME = "1970-01-01T00:00:00.000Z";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SUPABASE_OBJECT_RE = /^https:\/\/[^/]+\/storage\/v1\/object\/(?:public|sign)\/([^/]+)\/(.+)$/;
const DATA_URI_RE = /^data:([\w.+-]+\/[\w.+-]+);base64,([A-Za-z0-9+/=\s]+)$/;

const byteLength = (value) => Buffer.byteLength(value, "utf8");
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const canonical = (value) => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
};
const digest = (value) => sha256(canonical(value));

function stableUuid(kind, sourceId) {
  const hex = sha256(`mehewara-v2:${kind}:${sourceId}`);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${((parseInt(hex.slice(16, 18), 16) & 0x3f) | 0x80).toString(16).padStart(2, "0")}${hex.slice(18, 20)}-${hex.slice(20, 32)}`;
}

function fail(message) {
  throw new Error(`Migration input rejected: ${message}`);
}

// Legacy paths whose size is bounded by dedicated per-field limits
// downstream (gallery imageHex: 20M chars at processing time). The generic
// per-string cap must not reject them during inspection.
const SIZE_EXEMPT_PATHS = [/^\$\.gallery\[\d+\]\.imageHex$/];

function inspect(value, path = "$", depth = 0, seen = new Set(), budget = { remaining: LIMITS.inputBytes }) {
  if (depth > LIMITS.nesting) fail(`${path} exceeds nesting limit`);
  if (typeof value === "string") {
    const size = byteLength(value);
    budget.remaining -= size;
    if (budget.remaining < 0) fail(`${path} exceeds total input size limit`);
    // Gallery image payloads carry their own 20MB field bound enforced at
    // processing time; the generic per-string cap must not reject them here.
    if (!SIZE_EXEMPT_PATHS.some((re) => re.test(path)) && size > LIMITS.stringBytes) fail(`${path} exceeds string size limit`);
    return;
  }
  if (!value || typeof value !== "object") return;
  if (seen.has(value)) fail(`${path} contains a cyclic value`);
  seen.add(value);
  if (Array.isArray(value)) {
    if (value.length > LIMITS.arrayItems) fail(`${path} exceeds array item limit`);
    value.forEach((item, index) => inspect(item, `${path}[${index}]`, depth + 1, seen, budget));
  } else {
    const keys = Object.keys(value);
    if (keys.length > LIMITS.objectKeys) fail(`${path} exceeds object key limit`);
    keys.forEach((key) => inspect(value[key], `${path}.${key}`, depth + 1, seen, budget));
  }
  seen.delete(value);
}

function object(value, path) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${path} must be an object`);
  return value;
}

function text(value, path, { required = true, max = LIMITS.stringBytes } = {}) {
  if (value == null && !required) return "";
  if (typeof value !== "string") fail(`${path} must be a string`);
  if (byteLength(value) > max) fail(`${path} exceeds ${max} bytes`);
  if (required && !value.trim()) fail(`${path} must not be empty`);
  return value;
}

function sourceId(value, path) {
  return text(value, path, { max: 200 });
}

function iso(value, fallback) {
  const candidate = value ?? fallback;
  if (typeof candidate !== "string" || Number.isNaN(Date.parse(candidate))) fail("timestamps must be ISO-compatible strings");
  return new Date(candidate).toISOString();
}

function slug(value, fallback) {
  const base = String(value ?? fallback).normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 110);
  return base || `legacy-${sha256(String(fallback)).slice(0, 12)}`;
}

function normalizePublicBaseUrl(value) {
  if (typeof value !== "string" || !value.trim()) fail("options.publicBaseUrl is required: publish output must name its serving origin");
  let url;
  try {
    url = new URL(value.trim());
  } catch {
    fail("options.publicBaseUrl must be a valid URL");
  }
  if (url.protocol !== "https:") fail("options.publicBaseUrl must use https");
  if (/example\.invalid/i.test(url.hostname)) fail("options.publicBaseUrl must not be example.invalid");
  return url.toString().replace(/\/+$/, "");
}

/**
 * Determines whether a transformed backup is actually publishable. The
 * transformer always emits draft/pending content (sanitization and review
 * happen later), so this gate is what stops the cutover from publishing a
 * manifest that is merely contracts-valid. Only the Phase-2 publication
 * builder — after sanitization, published states, and real (non-placeholder)
 * media — may flip this to true.
 */
export function assessPublicationReadiness(backup) {
  const blockers = [];
  const checkState = (items, label) => {
    const drafts = items.filter((item) => item.state !== "published").length;
    if (drafts > 0) blockers.push(`${drafts} ${label} are not published`);
  };
  checkState(backup.subjects ?? [], "subjects");
  checkState(backup.papers ?? [], "papers");
  checkState(backup.questions ?? [], "questions");
  checkState(backup.studyMaterials ?? [], "study materials");
  checkState(backup.galleryItems ?? [], "gallery items");
  checkState(backup.contentPages ?? [], "content pages");
  const unsanitized = [
    ...(backup.questions ?? []).filter((q) => q.contentSafety?.sanitizationStatus !== "sanitized"),
    ...(backup.questions ?? []).flatMap((q) => q.options ?? []).filter((o) => o.contentSafety?.sanitizationStatus !== "sanitized"),
    ...(backup.studyMaterials ?? []).filter((m) => m.contentSafety?.sanitizationStatus !== "sanitized"),
    ...(backup.privacy && backup.privacy.contentSafety?.sanitizationStatus !== "sanitized" ? [backup.privacy] : []),
  ].length;
  if (unsanitized > 0) blockers.push(`${unsanitized} rich-content records are not sanitized`);
  const placeholders = (backup.mediaInventory ?? []).filter((entry) => entry.byteSize === 0).length;
  if (placeholders > 0) blockers.push(`${placeholders} media objects are placeholders awaiting real bytes`);
  return { publishable: blockers.length === 0, blockers: [...new Set(blockers)].sort() };
}

function bilingual(en, si, path) {
  return { en: text(en ?? si, `${path}.en`), si: text(si ?? en, `${path}.si`) };
}

function examType(value, path) {
  const normalized = text(value, path, { max: 20 }).toLowerCase().replaceAll("/", "");
  if (normalized === "ol") return "ol";
  if (normalized === "al") return "al";
  fail(`${path} must be O/L or A/L`);
}

function contentSafety() {
  return { sanitizationStatus: "pending", sanitizerVersion: null };
}

function sourceRows(source, key) {
  const rows = source[key] ?? [];
  if (!Array.isArray(rows)) fail(`.${key} must be an array`);
  return rows;
}

function uniqueIds(rows, key) {
  const ids = new Set();
  rows.forEach((row, index) => {
    const id = sourceId(object(row, `${key}[${index}]`).id, `${key}[${index}].id`);
    if (ids.has(id)) fail(`${key} contains duplicate id`);
    ids.add(id);
  });
  return ids;
}

function mediaExtension(contentType) {
  return (contentType.split("/")[1] ?? "bin").replace(/[^a-z0-9.+-]/gi, "") || "bin";
}

function createMediaRegistry(exceptions, mediaUrl) {
  const media = [];
  const byKey = new Map();
  const add = ({ reference, sourceKind, owner, contentType, bytes, sourceBucket, sourcePath, purpose = "image", objectKeyOverride }) => {
    const sourceKey = `${sourceKind}:${reference}`;
    const existing = byKey.get(sourceKey);
    if (existing) return existing;
    const sourceChecksum = bytes && bytes.length ? sha256(bytes) : sha256(sourceKey);
    const mediaId = stableUuid("media", sourceKey);
    const objectKey = objectKeyOverride ?? `legacy/${sourceKind}/${mediaId}.${mediaExtension(contentType)}`;
    const replacementUrl = mediaUrl(objectKey);
    const record = {
      id: mediaId,
      owner,
      sourceKind,
      sourceReference: reference,
      sourceBucket: sourceBucket ?? null,
      sourcePath: sourcePath ?? null,
      purpose,
      contentType,
      byteSize: bytes ? bytes.length : 0,
      sourceChecksum,
      objectKey,
      replacementUrl,
      operation: bytes && bytes.length ? "extract-and-upload" : "source-object-copy-required"
    };
    byKey.set(sourceKey, record);
    media.push(record);
    if (!bytes || !bytes.length) exceptions.push("supabase_object_requires_read_only_source_copy");
    return record;
  };
  return { media, add };
}

function mediaFromReference(reference, owner, registry, exceptions) {
  const data = DATA_URI_RE.exec(reference);
  if (data) {
    let bytes;
    try { bytes = Buffer.from(data[2].replace(/\s/g, ""), "base64"); } catch { fail(`${owner} contains invalid base64 image data`); }
    if (!bytes.length) fail(`${owner} contains empty base64 image data`);
    return registry.add({ reference: `data:${data[1]};sha256=${sha256(bytes)}`, sourceKind: "inline-base64", owner, contentType: data[1], bytes });
  }
  const supabase = SUPABASE_OBJECT_RE.exec(reference);
  if (supabase) {
    // Signed Supabase URLs (`/object/sign/…?token=…`) carry credentials in
    // the query string. Persist only the canonical bucket/path — never the
    // query or fragment — so tokens cannot leak into the migration plan.
    const bucket = decodeURIComponent(supabase[1]);
    const rawPath = decodeURIComponent(supabase[2]).split(/[?#]/)[0];
    if (!rawPath) {
      exceptions.push("supabase_object_reference_has_no_usable_path_requires_manual_review");
      return null;
    }
    return registry.add({ reference: `supabase://${bucket}/${rawPath}`, sourceKind: "supabase-storage", owner, contentType: "image/unknown", sourceBucket: bucket, sourcePath: rawPath });
  }
  exceptions.push("unsupported_external_media_reference_requires_manual_review");
  return null;
}

function rewriteHtml(value, owner, registry, exceptions) {
  const html = text(value, owner, { required: false, max: LIMITS.htmlBytes });
  return html.replace(/(?:data:[^"'\s>]+|https:\/\/[^"'\s>]+\/storage\/v1\/object\/(?:public|sign)\/[^"'\s>]+)/g, (reference) => {
    const media = mediaFromReference(reference, owner, registry, exceptions);
    return media?.replacementUrl ?? reference;
  });
}

function questionMode(row, optionCount, path) {
  if (row.isAllCorrect === true) return { answerMode: "all", indexes: Array.from({ length: optionCount }, (_, index) => index), isAllCorrect: true };
  const explicit = Array.isArray(row.correctOptions) ? row.correctOptions : row.correctOption == null ? [] : [row.correctOption];
  if (!explicit.length || explicit.some((index) => !Number.isInteger(index) || index < 0 || index >= optionCount)) fail(`${path} has invalid correct option indexes`);
  const indexes = [...new Set(explicit)].sort((a, b) => a - b);
  return { answerMode: indexes.length > 1 ? "multiple" : "single", indexes, isAllCorrect: false };
}

export function transformLegacy(input, options = {}) {
  object(input, "source");
  inspect(input);
  const now = iso(options.generatedAt ?? input.generatedAt ?? DEFAULT_TIME, DEFAULT_TIME);
  // Publish output must name a real serving origin: placeholder media URLs
  // in a published manifest would ship broken links. The origin is required
  // (https, never example.invalid) so cutover cannot accidentally publish
  // the fixture default.
  const publicOrigin = normalizePublicBaseUrl(options.publicBaseUrl);
  /** Public media URL for a migrated object key: the Worker's media route. */
  const mediaUrl = (objectKey) => `${publicOrigin}/api/v1/media/${objectKey}`;
  const subjects = sourceRows(input, "subjects");
  const papers = sourceRows(input, "papers");
  const questions = sourceRows(input, "questions");
  const studyRows = sourceRows(input, "studyHtml");
  const gallery = sourceRows(input, "gallery");
  uniqueIds(subjects, "subjects"); uniqueIds(papers, "papers"); uniqueIds(questions, "questions"); uniqueIds(gallery, "gallery");
  const subjectBySource = new Map(subjects.map((row) => [row.id, stableUuid("subject", row.id)]));
  const paperBySource = new Map(papers.map((row) => [row.id, stableUuid("paper", row.id)]));
  const questionBySource = new Map(questions.map((row) => [row.id, stableUuid("question", row.id)]));
  const exceptions = [];
  const registry = createMediaRegistry(exceptions, mediaUrl);

  const targetSubjects = subjects.map((row, index) => {
    const legacyId = sourceId(row.id, `subjects[${index}].id`);
    return {
      id: subjectBySource.get(legacyId), legacyId,
      slug: slug(row.slug ?? row.code ?? row.name, legacyId),
      title: bilingual(row.name, row.sinhalaName, `subjects[${index}].name`),
      description: row.description ? { en: text(row.description, `subjects[${index}].description`), si: text(row.sinhalaDescription ?? row.description, `subjects[${index}].sinhalaDescription`, { required: false }) } : null,
      examType: examType(row.examType, `subjects[${index}].examType`),
      code: text(row.code, `subjects[${index}].code`, { max: 32 }),
      presentation: { icon: text(row.icon ?? "BookOpen", `subjects[${index}].icon`, { max: 80 }), color: text(row.color ?? "slate", `subjects[${index}].color`, { max: 160 }), variant: "gradient" },
      state: "draft",
      sortOrder: Number.isInteger(row.sortOrder) ? row.sortOrder : index,
      updatedAt: now,
    };
  });

  const studyByPaper = new Map(studyRows.map((row) => [sourceId(row.paperId, "studyHtml.paperId"), row]));
  const targetStudies = [];
  const targetPapers = papers.map((row, index) => {
    const legacyId = sourceId(row.id, `papers[${index}].id`);
    const subjectId = subjectBySource.get(sourceId(row.subjectId, `papers[${index}].subjectId`));
    if (!subjectId) fail(`papers[${index}] references an unknown subject`);
    const study = studyByPaper.get(legacyId) ?? (row.studyMaterialHtml ? { paperId: legacyId, html: row.studyMaterialHtml } : null);
    let studyMaterialId = null;
    if (study) {
      const html = rewriteHtml(study.html, `studyHtml[${legacyId}].html`, registry, exceptions);
      studyMaterialId = stableUuid("study-material", legacyId);
      // The study HTML's B2 object key is the source of truth; the public
      // manifest's media.url is derived from it. Registering the bytes here
      // ensures mediaInventory and the manifest agree.
      const objectKey = `legacy/study-html/${studyMaterialId}.html`;
      registry.add({ reference: `study-html:${legacyId}:${sha256(html)}`, sourceKind: "study-html", owner: `studyHtml[${legacyId}]`, contentType: "text/html", bytes: Buffer.from(html, "utf8"), purpose: "document", objectKeyOverride: objectKey });
      targetStudies.push({ id: studyMaterialId, legacyId, subjectId, paperId: paperBySource.get(legacyId), slug: slug(`study-${row.title}`, legacyId), title: bilingual(row.title, row.sinhalaTitle, `papers[${index}].title`), description: null, objectKey, contentType: "text/html", byteSize: byteLength(html), contentSafety: contentSafety(), state: "draft", updatedAt: now, html, mediaUrl: mediaUrl(objectKey) });
    }
    const exam = examType(row.examType, `papers[${index}].examType`);
    const language = row.language === "en" ? "en" : "si";
    return { id: paperBySource.get(legacyId), legacyId, subjectId, examType: exam, slug: slug(row.slug ?? `${row.year}-${row.title}`, legacyId), title: bilingual(row.title, row.sinhalaTitle, `papers[${index}].title`), year: Number(row.year), language, durationMinutes: Number(row.durationMinutes), questionCount: Number(row.questionCount ?? 0), materializedQuestionCount: questions.filter((question) => question.paperId === legacyId).length, questionCountSource: "legacy_import", studyMaterialId, state: "draft", updatedAt: now };
  });

  const targetQuestions = [];
  for (const [index, row] of questions.entries()) {
    const legacyId = sourceId(row.id, `questions[${index}].id`);
    const paperId = paperBySource.get(sourceId(row.paperId, `questions[${index}].paperId`));
    if (!paperId) fail(`questions[${index}] references an unknown paper`);
    if (!Array.isArray(row.optionsHtml) || ![4, 5].includes(row.optionsHtml.length)) fail(`questions[${index}].optionsHtml must contain four or five options`);
    const mode = questionMode(row, row.optionsHtml.length, `questions[${index}]`);
    const questionId = questionBySource.get(legacyId);
    const options = row.optionsHtml.map((html, optionIndex) => ({ id: stableUuid("question-option", `${legacyId}:${optionIndex}`), questionId, html: rewriteHtml(html, `questions[${index}].optionsHtml[${optionIndex}]`, registry, exceptions), contentSafety: contentSafety(), sortOrder: optionIndex, isCorrect: mode.indexes.includes(optionIndex) }));
    targetQuestions.push({ id: questionId, legacyId, paperId, number: Number(row.qNumber), questionHtml: rewriteHtml(row.questionHtml, `questions[${index}].questionHtml`, registry, exceptions), explanationHtml: row.explanationHtml ? rewriteHtml(row.explanationHtml, `questions[${index}].explanationHtml`, registry, exceptions) : null, contentSafety: contentSafety(), options, optionCount: options.length, answerMode: mode.answerMode, correctOptionIndexes: mode.indexes, isAllCorrect: mode.isAllCorrect, marks: 1, state: "draft", updatedAt: now });
  }

  const targetGallery = gallery.map((row, index) => {
    const legacyId = sourceId(row.id, `gallery[${index}].id`);
    const hex = text(row.imageHex, `gallery[${index}].imageHex`, { max: 20_000_000 });
    if (!/^[0-9a-f]+$/i.test(hex) || hex.length % 2) fail(`gallery[${index}].imageHex must be even-length hexadecimal`);
    const bytes = Buffer.from(hex, "hex");
    const media = registry.add({ reference: `hex:${sha256(bytes)}`, sourceKind: "gallery-hex", owner: `gallery[${index}]`, contentType: row.mimeType || "image/jpeg", bytes, purpose: "image" });
    // Register the thumbnail as its own B2 object so the public manifest's
    // `thumbnail.url` resolves to a real mediaInventory entry. The Worker
    // generates the actual thumbnail bytes during cutover; the sourceChecksum
    // here is a placeholder derived from the source image so the inventory
    // stays internally consistent. The objectKey must match the backup's
    // `thumbnailObjectKey` exactly, so no extension is added.
    const thumbnailObjectKey = `${media.objectKey}.thumb`;
    registry.add({ reference: `thumb:${sha256(bytes)}`, sourceKind: "gallery-thumb", owner: `gallery[${index}].thumbnail`, contentType: row.mimeType || "image/jpeg", bytes: Buffer.alloc(0), purpose: "thumbnail", objectKeyOverride: thumbnailObjectKey });
    // The thumbnail has no real bytes yet; record the exception now so the
    // round-trip and cutover tooling can see it before the publish manifest
    // is assembled.
    exceptions.push("requires_thumbnail_generation_before_publish");
    const width = Number.isInteger(row.width) && row.width > 0 ? row.width : 1;
    const height = Number.isInteger(row.height) && row.height > 0 ? row.height : 1;
    if (!row.width || !row.height) exceptions.push("gallery_dimensions_require_image_probe_before_publish");
    const createdAt = iso(row.createdAt, now);
    return { id: stableUuid("gallery", legacyId), legacyId, slug: slug(row.slug ?? row.title, legacyId), title: bilingual(row.title, row.sinhalaTitle, `gallery[${index}].title`), description: row.description ? bilingual(row.description, row.descriptionSinhala, `gallery[${index}].description`) : null, altText: bilingual(row.title, row.sinhalaTitle, `gallery[${index}].title`), imageObjectKey: media.objectKey, thumbnailObjectKey: `${media.objectKey}.thumb`, contentType: row.mimeType || "image/jpeg", width, height, byteSize: bytes.length, pinned: Boolean(row.pinned), sortOrder: Number.isInteger(row.sortOrder) ? row.sortOrder : index, state: "draft", createdAt, updatedAt: now };
  });

  const about = input.about ? object(input.about, "about") : null;
  const aboutMedia = about?.image_url ? mediaFromReference(text(about.image_url, "about.image_url"), "about.image_url", registry, exceptions) : null;
  const aboutTarget = about ? { id: "about", description: about.description ?? null, image: aboutMedia ? { objectKey: aboutMedia.objectKey, contentType: aboutMedia.contentType, width: about.width ?? 1, height: about.height ?? 1 } : null, social: { facebookUrl: about.facebook_link || null, youtubeUrl: about.youtube_link || null, linkedinUrl: about.linkedin_link || null }, updatedAt: now } : null;
  const privacyTarget = about ? { id: "privacy", statement: text(about.privacy_policy_statement ?? "", "about.privacy_policy_statement", { required: false, max: 50_000 }), fullHtml: about.full_privacy_policy_html ? rewriteHtml(about.full_privacy_policy_html, "about.full_privacy_policy_html", registry, exceptions) : null, contentSafety: contentSafety(), updatedAt: now } : null;
  if (about?.image_url && (!about.width || !about.height)) exceptions.push("about_image_dimensions_require_image_probe_before_publish");

  const sourceVisits = sourceRows(input, "siteVisits");
  const visitMetrics = { totalEvents: sourceVisits.length, byPath: Object.fromEntries([...new Set(sourceVisits.map((visit) => String(visit.path ?? "/")))].sort().map((path) => [path, sourceVisits.filter((visit) => String(visit.path ?? "/") === path).length])) };
  const publicationHistory = sourceRows(input, "publicationHistory").map((row, index) => ({ sourceVersion: Number(row.version ?? index + 1), publishedAt: iso(row.publishedAt, now), targetSnapshotId: stableUuid("publication-snapshot", String(row.version ?? index + 1)) }));
  const attempts = sourceRows(input, "attempts");
  if (attempts.length) exceptions.push("attempts_excluded_indexdb_local_only");
  exceptions.push("source_ids_replaced_with_deterministic_uuid_mapping", "rich_html_requires_target_sanitization", "publication_history_is_audit_input_not_an_automatic_replay", "visit_events_are_aggregated_into_daily_metrics_during_import");
  const uniqueExceptions = [...new Set(exceptions)].sort();

  const sourceChecksum = digest(input);
  const snapshotId = stableUuid("publication-snapshot", `import:${sourceChecksum}`);

  // Build the canonical backup first. The publish manifest is then derived from
  // this backup, never assembled in parallel from draft objects. The
  // mediaInventory carries a `referencedByManifest` flag that distinguishes
  // manifest-referenced objects (study HTML, gallery, about image) from
  // inline-rewritten objects (images inside rich HTML). The latter are real
  // B2 objects but are only reachable through the document body, so the
  // round-trip treats them as "reference-by-html" rather than
  // "reference-by-manifest-field".
  const manifestReferencedKeys = new Set();
  for (const material of targetStudies) manifestReferencedKeys.add(material.objectKey);
  for (const item of targetGallery) { manifestReferencedKeys.add(item.imageObjectKey); manifestReferencedKeys.add(item.thumbnailObjectKey); }
  if (aboutMedia) manifestReferencedKeys.add(aboutMedia.objectKey);
  for (const media of registry.media) if (manifestReferencedKeys.has(media.objectKey)) media.referencedByManifest = true;
  const mediaInventory = registry.media.map((media) => ({
    objectKey: media.objectKey,
    purpose: media.purpose,
    sha256: media.sourceChecksum,
    byteSize: media.byteSize,
    contentType: media.contentType,
    referencedByManifest: media.referencedByManifest === true,
    sourceKind: media.sourceKind,
  }));
  const sourceIdMap = [
    ...subjects.map((row) => ({ sourceSystem: "supabase", entityType: "subject", sourceId: String(row.id), v2Id: subjectBySource.get(String(row.id)) })),
    ...papers.map((row) => ({ sourceSystem: "supabase", entityType: "paper", sourceId: String(row.id), v2Id: paperBySource.get(String(row.id)) })),
    ...questions.map((row) => ({ sourceSystem: "supabase", entityType: "question", sourceId: String(row.id), v2Id: questionBySource.get(String(row.id)) })),
    ...targetStudies.map((material) => ({ sourceSystem: "supabase", entityType: "study_material", sourceId: material.legacyId, v2Id: material.id })),
    ...targetGallery.map((item) => ({ sourceSystem: "supabase", entityType: "gallery_item", sourceId: item.legacyId, v2Id: item.id })),
  ];
  const backup = {
    format: "mehewara-v2-backup",
    schemaVersion: 1,
    createdAt: now,
    subjects: targetSubjects,
    papers: targetPapers,
    questions: targetQuestions,
    studyMaterials: targetStudies.map(({ html, mediaUrl, ...material }) => material),
    galleryItems: targetGallery,
    contentPages: [],
    mediaInventory,
    sourceIdMap,
    publication: { currentSnapshotId: null, snapshotHistory: publicationHistory.map((entry, index) => ({ snapshotId: entry.targetSnapshotId, version: entry.sourceVersion, action: "published", at: entry.publishedAt })) },
    about: aboutTarget ? { id: "about", description: aboutTarget.description, image: aboutMedia ? { objectKey: aboutMedia.objectKey, contentType: aboutMedia.contentType, width: about.width ?? 1, height: about.height ?? 1 } : null, social: aboutTarget.social, updatedAt: aboutTarget.updatedAt } : null,
    privacy: privacyTarget,
  };

  // Publish manifest derives from the backup. Public questions drop the
  // admin-only fields and the options are stripped of `isCorrect`.
  //
  // A gallery thumbnail whose sourceChecksum was synthesized (no real bytes
  // in the registry) is emitted as `thumbnail: null` in the public manifest
  // and the plan records `requires_thumbnail_generation_before_publish`.
  // The cutover process generates the real thumbnail bytes, at which point
  // a re-run of the transformer emits a complete thumbnail URL. Until then
  // the Worker serves a placeholder from Cloudflare's edge so the public
  // gallery remains browseable.
  const publicSubjects = backup.subjects;
  const publicPapers = backup.papers;
  const publicQuestions = backup.questions.map(({ correctOptionIndexes, isAllCorrect, answerMode, ...question }) => ({
    ...question,
    options: question.options.map(({ isCorrect, ...option }) => option),
  }));
  const publicStudyMaterials = backup.studyMaterials.map((material) => ({
    id: material.id, legacyId: material.legacyId, subjectId: material.subjectId, paperId: material.paperId,
    slug: material.slug, title: material.title, description: material.description, contentType: material.contentType, byteSize: material.byteSize,
    state: material.state, updatedAt: material.updatedAt,
    media: { kind: "document", url: mediaUrl(material.objectKey), contentType: material.contentType, byteSize: material.byteSize },
  }));
  const publicGallery = backup.galleryItems.map((item) => {
    const { imageObjectKey, thumbnailObjectKey, ...rest } = item;
    const thumbnailInventory = backup.mediaInventory.find((entry) => entry.objectKey === thumbnailObjectKey);
    const thumbnailIsPlaceholder = !thumbnailInventory || thumbnailInventory.byteSize === 0;
    return {
      ...rest,
      image: { kind: "image", url: mediaUrl(imageObjectKey), contentType: item.contentType, byteSize: item.byteSize, width: item.width, height: item.height },
      thumbnail: thumbnailIsPlaceholder ? null : { kind: "thumbnail", url: mediaUrl(thumbnailObjectKey), contentType: item.contentType },
    };
  });
  const publicAbout = backup.about ? { id: "about", description: backup.about.description, image: aboutMedia ? { kind: "image", url: mediaUrl(aboutMedia.objectKey), contentType: aboutMedia.contentType, width: about.width ?? 1, height: about.height ?? 1 } : null, social: backup.about.social, updatedAt: backup.about.updatedAt } : null;
  const publishManifest = { snapshotId, version: 1, publishedAt: now, subjects: publicSubjects, papers: publicPapers, questions: publicQuestions, studyMaterials: publicStudyMaterials, gallery: publicGallery, pages: backup.contentPages, about: publicAbout, privacy: backup.privacy };

  const planWithoutChecksum = { format: PLAN_FORMAT, schemaVersion: PLAN_VERSION, generatedAt: now, sourceChecksum, idMap: { subjects: Object.fromEntries(subjectBySource), papers: Object.fromEntries(paperBySource), questions: Object.fromEntries(questionBySource) }, target: { import: { format: "mehewara-v2-backup", schemaVersion: 1, sourceChecksum, requestedAt: now, backup }, publish: publishManifest }, media: { count: registry.media.length, manifest: registry.media }, counts: { subjects: targetSubjects.length, papers: targetPapers.length, questions: targetQuestions.length, studyMaterials: targetStudies.length, galleryItems: targetGallery.length, siteVisitEvents: sourceVisits.length, attemptsExcluded: attempts.length, publicationHistory: publicationHistory.length }, visitMetrics, publicationHistory, exceptions: uniqueExceptions,
    /**
     * Publication readiness gate: contracts-valid is necessary but not
     * sufficient for publishing. The cutover must refuse to publish while
     * `publishable` is false; only the Phase-2 publication builder — after
     * sanitization, published states, and real media bytes — may produce a
     * publishable plan.
     */
    publicationReadiness: assessPublicationReadiness(backup),
    /**
     * Sidecar: every rewritten rich-HTML body the transformer produced.
     * The round-trip scans this to verify that every inline-rewritten media
     * entry's `replacementUrl` is reachable from a real HTML body, without
     * leaking admin HTML into the contract.
     */
    _rewrittenHtml: {
      questions: targetQuestions.map((question) => ({ id: question.id, questionHtml: question.questionHtml, explanationHtml: question.explanationHtml, options: question.options.map((option) => option.html) })),
      studyMaterials: targetStudies.map((material) => ({ id: material.id, html: material.html })),
      about: aboutTarget ? { fullHtml: null } : null,
      privacy: privacyTarget ? { fullHtml: privacyTarget.fullHtml } : null,
    },
  };
  return { ...planWithoutChecksum, planChecksum: digest(planWithoutChecksum) };
}

export function validateLegacyInput(input) {
  object(input, "source");
  inspect(input);
  ["subjects", "papers", "questions", "studyHtml", "gallery", "siteVisits", "attempts", "publicationHistory"].forEach((key) => sourceRows(input, key));
  return true;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.error("migration-transform.mjs is a library; use migration-roundtrip.mjs for the fixture command.");
  process.exit(2);
}
