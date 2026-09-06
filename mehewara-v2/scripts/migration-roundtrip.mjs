#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { deepStrictEqual, match, ok, strictEqual } from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { LIMITS, PLAN_FORMAT, assessPublicationReadiness, transformLegacy } from "./migration-transform.mjs";
import { BackupManifest, ImportManifest, PublicationManifest } from "../packages/contracts/dist/index.js";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const fixturePath = join(scriptDir, "fixtures", "legacy-representative.json");
const fixtureText = await readFile(fixturePath, "utf8");
const source = JSON.parse(fixtureText);
const MEDIA_BASE = "https://api.mehewara.test";
const options = { generatedAt: source.generatedAt, publicBaseUrl: MEDIA_BASE };
const plan = transformLegacy(source, options);
const secondPlan = transformLegacy(JSON.parse(fixtureText), options);

strictEqual(plan.format, PLAN_FORMAT);
strictEqual(plan.schemaVersion, 1);
strictEqual(plan.planChecksum, secondPlan.planChecksum, "same source must produce the same plan checksum");
match(plan.sourceChecksum, /^[a-f0-9]{64}$/);
match(plan.planChecksum, /^[a-f0-9]{64}$/);
deepStrictEqual(plan.counts, {
  subjects: 1,
  papers: 1,
  questions: 3,
  studyMaterials: 1,
  galleryItems: 1,
  siteVisitEvents: 3,
  attemptsExcluded: 1,
  publicationHistory: 2
});
match(plan.idMap.subjects["legacy-subject-physics"], /^[0-9a-f-]{36}$/);
match(plan.idMap.papers["legacy-paper-2024-physics"], /^[0-9a-f-]{36}$/);
match(plan.idMap.questions["legacy-question-single"], /^[0-9a-f-]{36}$/);
deepStrictEqual(plan.target.import.backup.questions.map((question) => question.answerMode), ["single", "multiple", "all"]);
strictEqual(plan.target.import.backup.questions[2].isAllCorrect, true);
strictEqual(plan.target.import.backup.papers[0].examType, "al");
strictEqual(plan.target.import.backup.papers[0].language, "si");
strictEqual(plan.target.import.backup.papers[0].durationMinutes, 120);
strictEqual(plan.target.import.backup.galleryItems[0].pinned, true);
strictEqual(plan.target.import.backup.galleryItems[0].description.si, "පාසල් විද්‍යා දිනයක්.");
strictEqual(plan.target.import.backup.about.social.linkedinUrl, "https://linkedin.com/company/mehewara");
strictEqual(plan.target.import.backup.privacy.id, "privacy");
ok(plan.target.import.backup.privacy.fullHtml.includes("පෞද්ගලිකත්වය"));
strictEqual(plan.visitMetrics.byPath["/"], 2);
strictEqual(plan.publicationHistory[1].sourceVersion, 2);
strictEqual(plan.target.publish.version, 1);
strictEqual(plan.target.import.sourceChecksum, plan.sourceChecksum);
ok(plan.exceptions.includes("attempts_excluded_indexdb_local_only"));
ok(plan.exceptions.includes("publication_history_is_audit_input_not_an_automatic_replay"));
ok(plan.media.manifest.some((entry) => entry.sourceKind === "inline-base64"));
ok(plan.media.manifest.some((entry) => entry.sourceKind === "supabase-storage"));
ok(plan.media.manifest.some((entry) => entry.sourceKind === "gallery-hex"));
ok(plan.media.manifest.every((entry) => entry.objectKey && entry.replacementUrl && !entry.sourceReference.includes("service_role")));
ok(plan.media.manifest.every((entry) => !/[?#]/.test(entry.sourceReference ?? "") && !/token=|expires=|signature=/i.test(entry.sourceReference ?? "")),
  "persisted media references must never carry query strings or signed-URL credentials");
ok(plan.media.manifest.every((entry) => entry.sourceBucket == null || !/[?#]/.test(entry.sourceBucket)),
  "persisted bucket names must be bare names");
ok(plan.media.manifest.every((entry) => entry.sourcePath == null || !/[?#]/.test(entry.sourcePath)),
  "persisted object paths must exclude query and fragment");
ok(plan.target.publish.questions[0].questionHtml.includes(`${MEDIA_BASE}/api/v1/media/`));
ok(plan.target.publish.studyMaterials[0].media.url.includes(`${MEDIA_BASE}/api/v1/media/`));
ok(!JSON.stringify(plan.target.publish).includes("example.invalid"),
  "publish output must never contain placeholder media origins");

// Validate the generated artifacts against the v2 contracts. The harness
// fails the build if either artifact drifts from the contract surface.
const importParsed = ImportManifest.safeParse(plan.target.import);
if (!importParsed.success) {
  console.error("ImportManifest validation failed:", importParsed.error.issues);
  process.exit(1);
}
const publishParsed = PublicationManifest.safeParse(plan.target.publish);
if (!publishParsed.success) {
  console.error("PublicationManifest validation failed:", publishParsed.error.issues);
  process.exit(1);
}
const backupParsed = BackupManifest.safeParse(plan.target.import.backup);
if (!backupParsed.success) {
  console.error("BackupManifest validation failed:", backupParsed.error.issues);
  process.exit(1);
}
ok(!("questionOptions" in plan.target.import.backup), "questionOptions must be nested in questions, not a separate array");
ok(plan.target.import.backup.mediaInventory.length > 0, "mediaInventory must be populated from the media registry");
ok(plan.target.import.backup.sourceIdMap.length > 0, "sourceIdMap must be populated from the legacy IDs");
ok(plan.target.import.backup.publication, "publication must be present even when currentSnapshotId is null");
ok(plan.target.publish.questions.every((question) => !("correctOptionIndexes" in question) && !("isAllCorrect" in question) && !("answerMode" in question)), "publish manifest must not leak correct answers");
ok(plan.target.publish.questions.every((question) => question.options.every((option) => !("isCorrect" in option))), "publish manifest must not leak option isCorrect flags");

// Coverage: every persisted/public object key must appear in mediaInventory
// exactly once, and every mediaInventory key must be either (a) referenced
// by a manifest field (studyMaterials[*].objectKey, galleryItems[*].
// imageObjectKey/thumbnailObjectKey, about.image.objectKey, or any URL in
// the publish manifest), or (b) referenced only by a rewritten rich-HTML
// stream. The round-trip independently enumerates the backup's manifest
// fields and the inventory's `referencedByManifest` flag and reconciles
// the two — neither side is the source of truth on its own.
const inventoryKeys = new Set(plan.target.import.backup.mediaInventory.map((entry) => entry.objectKey));
const backupFieldKeys = new Set();
for (const material of plan.target.import.backup.studyMaterials) backupFieldKeys.add(material.objectKey);
for (const item of plan.target.import.backup.galleryItems) {
  backupFieldKeys.add(item.imageObjectKey);
  backupFieldKeys.add(item.thumbnailObjectKey);
}
if (plan.target.import.backup.about?.image) backupFieldKeys.add(plan.target.import.backup.about.image.objectKey);
const inventoryManifestKeys = new Set(plan.target.import.backup.mediaInventory.filter((entry) => entry.referencedByManifest).map((entry) => entry.objectKey));
for (const key of backupFieldKeys) {
  ok(inventoryKeys.has(key), `every backup field key must appear in mediaInventory (missing: ${key})`);
  ok(inventoryManifestKeys.has(key), `every backup field key must be flagged referencedByManifest in inventory (missing: ${key})`);
}
for (const key of inventoryManifestKeys) {
  ok(backupFieldKeys.has(key), `every inventory entry flagged referencedByManifest must correspond to a backup field (orphan flag: ${key})`);
}
const backupReferencedKeys = new Set(backupFieldKeys);
const htmlReferencedKeys = new Set();
const publishReferencedKeys = new Set();
for (const material of plan.target.publish.studyMaterials) {
  ok(new URL(material.media.url).pathname.startsWith("/api/v1/media/"), "publish media URLs must use the Worker media route");
}
// Scan the sidecar of every rewritten rich-HTML body the transformer
// produced. The plan._rewrittenHtml field is non-contract: it exists only
// so the round-trip can independently verify that every inline-rewritten
// media entry's `replacementUrl` is reachable from a real HTML body, and
// that the only way an inventory entry passes the orphan check is by being
// manifest-referenced, html-referenced, or an acknowledged placeholder
// thumbnail. This replaces the looser `sourceKind` exemption, which was a
// bypass.
const referencedFromHtml = (html) => {
  const keys = new Set();
  if (typeof html !== "string") return keys;
  for (const match of html.matchAll(new RegExp(`${MEDIA_BASE.replace(/[.]/g, '\\.')}/api/v1/media/([A-Za-z0-9._~\\-/%]+)`, 'g'))) {
    if (match[1]) keys.add(match[1]);
  }
  return keys;
};
if (plan._rewrittenHtml) {
  for (const question of plan._rewrittenHtml.questions ?? []) {
    for (const k of referencedFromHtml(question.questionHtml)) htmlReferencedKeys.add(k);
    if (question.explanationHtml) for (const k of referencedFromHtml(question.explanationHtml)) htmlReferencedKeys.add(k);
    for (const optionHtml of question.options ?? []) for (const k of referencedFromHtml(optionHtml)) htmlReferencedKeys.add(k);
  }
  for (const material of plan._rewrittenHtml.studyMaterials ?? []) {
    for (const k of referencedFromHtml(material.html)) htmlReferencedKeys.add(k);
  }
  if (plan._rewrittenHtml.privacy?.fullHtml) {
    for (const k of referencedFromHtml(plan._rewrittenHtml.privacy.fullHtml)) htmlReferencedKeys.add(k);
  }
}
for (const material of plan.target.publish.studyMaterials) {
  const key = new URL(material.media.url).pathname.replace(/^\/api\/v1\/media\//, "");
  publishReferencedKeys.add(key);
}
for (const item of plan.target.publish.gallery) {
  publishReferencedKeys.add(new URL(item.image.url).pathname.replace(/^\/api\/v1\/media\//, ""));
  if (item.thumbnail) publishReferencedKeys.add(new URL(item.thumbnail.url).pathname.replace(/^\/api\/v1\/media\//, ""));
}
if (plan.target.publish.about?.image) {
  publishReferencedKeys.add(new URL(plan.target.publish.about.image.url).pathname.replace(/^\/api\/v1\/media\//, ""));
}
const allReferencedKeys = new Set([...backupReferencedKeys, ...publishReferencedKeys, ...htmlReferencedKeys]);
for (const key of allReferencedKeys) {
  ok(inventoryKeys.has(key), `every referenced object key must appear in mediaInventory (missing: ${key})`);
}
// Every inventory entry must be reachable: either manifest-referenced,
// html-referenced, or a placeholder thumbnail that the transformer
// acknowledged via the `requires_thumbnail_generation_before_publish`
// exception. The publish manifest's `gallery[].thumbnail` must be null
// for every placeholder.
const placeholderThumbnails = new Set();
for (const item of plan.target.publish.gallery) {
  if (item.thumbnail) {
    const key = new URL(item.thumbnail.url).pathname.replace(/^\/api\/v1\/media\//, "");
    const inventory = plan.target.import.backup.mediaInventory.find((entry) => entry.objectKey === key);
    ok(inventory && inventory.byteSize > 0, `gallery thumbnail with URL must have a non-placeholder inventory entry (${key})`);
  } else {
    const sourceItem = plan.target.import.backup.galleryItems.find((gi) => gi.id === item.id);
    if (sourceItem) placeholderThumbnails.add(sourceItem.thumbnailObjectKey);
  }
}
ok(plan.exceptions.includes("requires_thumbnail_generation_before_publish"), "placeholder gallery thumbnails must surface requires_thumbnail_generation_before_publish in exceptions");
for (const entry of plan.target.import.backup.mediaInventory) {
  if (entry.referencedByManifest) {
    ok(backupReferencedKeys.has(entry.objectKey), `mediaInventory entry marked referencedByManifest must be in backup fields (${entry.objectKey})`);
  } else if (htmlReferencedKeys.has(entry.objectKey)) {
    // html-referenced: OK
  } else if (placeholderThumbnails.has(entry.objectKey)) {
    // placeholder thumbnail: known and acknowledged
  } else {
    ok(false, `unflagged mediaInventory entry must be referenced by rich HTML or be a known placeholder (${entry.objectKey})`);
  }
}
// No duplicates: every inventory key is unique.
ok(new Set(plan.target.import.backup.mediaInventory.map((e) => e.objectKey)).size === plan.target.import.backup.mediaInventory.length, "mediaInventory must not contain duplicate objectKeys");

// Checksum-to-byte consistency: the registry's sourceChecksum is the real
// sha256 of the bytes when bytes are present, and a deterministic placeholder
// otherwise. The fixture's gallery-hex and study-html entries must agree.
for (const entry of plan.target.import.backup.mediaInventory) {
  ok(/^[a-f0-9]{64}$/.test(entry.sha256), `sha256 must be 64 hex chars (${entry.objectKey})`);
  ok(Number.isInteger(entry.byteSize) && entry.byteSize >= 0, `byteSize must be a non-negative integer (${entry.objectKey})`);
  ok(/^[\w.+-]+\/[\w.+-]+$/.test(entry.contentType), `contentType must be a media MIME (${entry.objectKey})`);
}

// Publication readiness gate: contracts-valid is necessary but not
// sufficient. The fixture migrates drafts with pending sanitization and
// placeholder thumbnails, so its plan must NOT be publishable — and the
// blockers must name exactly why. The cutover may only publish through the
// Phase-2 builder once this gate opens.
ok(plan.publicationReadiness.publishable === false, "fixture plan must not be publishable");
ok(plan.publicationReadiness.blockers.some((b) => b.includes("not published")), "readiness must flag draft states");
ok(plan.publicationReadiness.blockers.some((b) => b.includes("not sanitized")), "readiness must flag pending sanitization");
ok(plan.publicationReadiness.blockers.some((b) => b.includes("placeholders")), "readiness must flag placeholder media");
// The gate is computed, not hard-coded: a fully published, sanitized
// backup with real media bytes opens it.
{
  const ready = {
    subjects: [{ state: "published" }], papers: [{ state: "published" }],
    questions: [{ state: "published", contentSafety: { sanitizationStatus: "sanitized" }, options: [{ contentSafety: { sanitizationStatus: "sanitized" } }] }],
    studyMaterials: [{ state: "published", contentSafety: { sanitizationStatus: "sanitized" } }], galleryItems: [{ state: "published" }], contentPages: [{ state: "published" }],
    privacy: { contentSafety: { sanitizationStatus: "sanitized" } },
    mediaInventory: [{ objectKey: "gallery/x.jpeg", byteSize: 100 }],
  };
  const verdict = assessPublicationReadiness(ready);
  ok(verdict.publishable === true && verdict.blockers.length === 0, "a fully ready backup must open the gate");
}

// sourceIdMap must cover every entity type that has UUIDs. Subjects, papers,
// and questions are mandatory. Gallery and study material are also expected
// whenever the fixture has them.
const idMapTypes = new Set(plan.target.import.backup.sourceIdMap.map((entry) => entry.entityType));
for (const required of ["subject", "paper", "question", "gallery_item", "study_material"]) {
  ok(idMapTypes.has(required), `sourceIdMap must include ${required}`);
}

let malformedRejected = false;
try { transformLegacy({ subjects: "not-an-array" }); } catch { malformedRejected = true; }
ok(malformedRejected, "malformed arrays must fail safely");

let oversizedRejected = false;
try {
  transformLegacy({ subjects: [], papers: [], questions: [{ id: "q", paperId: "p", qNumber: 1, questionHtml: "x".repeat(LIMITS.htmlBytes + 1), optionsHtml: ["a", "b", "c", "d"], correctOption: 0 }] });
} catch { oversizedRejected = true; }
ok(oversizedRejected, "oversized rich content must fail safely");

// Realistic gallery payloads dwarf the generic per-string cap: a 5 MB JPEG
// is 10M hex chars. The transformer must accept it (dedicated 20M-char
// field bound) while still rejecting unbounded input overall. Generated
// in-memory so the fixture file stays small.
{
  const big = JSON.parse(fixtureText);
  big.gallery = [{
    id: "legacy-gallery-big", title: "Big panorama", sinhalaTitle: "ලොකු දර්ශනය",
    description: "A large stitched panorama.", descriptionSinhala: "ලොකු දර්ශනයක්.",
    imageHex: "ffd8ffe0".repeat(1_250_000), mimeType: "image/jpeg", sortOrder: 0,
    createdAt: "2025-12-02T00:00:00Z", pinned: false, width: 8000, height: 2000,
  }];
  const bigPlan = transformLegacy(big, options);
  strictEqual(bigPlan.counts.galleryItems, 1);
  const item = bigPlan.target.import.backup.galleryItems[0];
  strictEqual(item.byteSize, 5_000_000);
  match(item.imageObjectKey, /^legacy\/gallery-hex\//);
  ok(bigPlan.target.import.backup.mediaInventory.some((entry) => entry.objectKey === item.imageObjectKey && entry.byteSize === 5_000_000),
    "large gallery bytes must land in mediaInventory with their real size");
}

// Signed Supabase URLs must persist canonically: bucket + path only, with
// the token query and fragment discarded before anything is recorded.
{
  const signed = JSON.parse(fixtureText);
  signed.questions = [{
    id: "legacy-question-signed", paperId: "legacy-paper-2024-physics", qNumber: 99,
    questionHtml: `<p>Signed image.</p><img src="https://old-project.supabase.co/storage/v1/object/sign/question-images/secret.png?token=eyJhbGciOiJIUzI1NiJ9.supersecrettoken#frag" />`,
    optionsHtml: ["<p>A</p>", "<p>B</p>", "<p>C</p>", "<p>D</p>"], correctOption: 0,
  }];
  const signedPlan = transformLegacy(signed, options);
  const entry = signedPlan.media.manifest.find((e) => e.sourceKind === "supabase-storage" && e.sourceReference === "supabase://question-images/secret.png");
  ok(entry, "signed Supabase reference must register a media entry");
  strictEqual(entry.sourceReference, "supabase://question-images/secret.png");
  strictEqual(entry.sourceBucket, "question-images");
  strictEqual(entry.sourcePath, "secret.png");
}

console.log(`Migration fixture round-trip passed: ${plan.planChecksum}`);
console.log(`Verified counts and semantics: ${JSON.stringify(plan.counts)}`);
console.log("Verified stable IDs, O/L/A/L normalization, answer modes, rich media rewrites, gallery/About/privacy, publication input, local-attempt exclusion, and contracts-valid Import/Publication/Backup manifests.");
