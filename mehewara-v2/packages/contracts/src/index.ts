import { z } from "zod";

export const UUID = z.string().uuid();
export const Slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "must be a lowercase slug").max(120);
export const IsoTimestamp = z.string().datetime({ offset: true });
export const PublishState = z.enum(["draft", "published", "archived"]);
export const ExamType = z.enum(["ol", "al"]);
export const PaperLanguage = z.enum(["en", "si"]);
export const RichHtml = z.string().trim().max(500_000);
export const SanitizationStatus = z.enum(["pending", "sanitized", "rejected"]);
export const RichContentSafety = z.object({ sanitizationStatus: SanitizationStatus, sanitizerVersion: z.string().max(80).nullable() }).strict();
export const LocalizedText = z.object({ en: z.string().trim().max(20_000), si: z.string().trim().max(20_000), ta: z.string().trim().max(20_000).optional() }).strict();
export const BilingualText = z.object({ en: z.string().trim().max(20_000), si: z.string().trim().max(20_000) }).strict();

export const SubjectPresentation = z.object({ icon: z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,79}$/), color: z.string().regex(/^[A-Za-z0-9#(),.%_ -]{1,160}$/), variant: z.enum(["solid", "gradient", "muted"]) }).strict();
export const Subject = z.object({
  id: UUID, legacyId: z.string().min(1).max(300).nullable().optional(), slug: Slug, title: LocalizedText, description: LocalizedText.nullable(), examType: ExamType,
  code: z.string().regex(/^[A-Za-z0-9_-]{1,32}$/), presentation: SubjectPresentation, state: PublishState,
  sortOrder: z.number().int().nonnegative(), updatedAt: IsoTimestamp
}).strict();

export const QuestionOption = z.object({
  id: UUID, legacyId: z.string().min(1).max(300).nullable().optional(), questionId: UUID, html: RichHtml, contentSafety: RichContentSafety,
  sortOrder: z.number().int().nonnegative(), isCorrect: z.boolean()
}).strict();
export const PublicQuestionOption = QuestionOption.omit({ isCorrect: true });
export const CorrectAnswerMode = z.enum(["single", "multiple", "all"]);
export const AdminQuestion = z.object({
  id: UUID, legacyId: z.string().min(1).max(300).nullable().optional(), paperId: UUID, number: z.number().int().positive(), questionHtml: RichHtml,
  explanationHtml: RichHtml.nullable(), contentSafety: RichContentSafety, options: z.array(QuestionOption).min(4).max(5),
  optionCount: z.union([z.literal(4), z.literal(5)]), answerMode: CorrectAnswerMode,
  correctOptionIndexes: z.array(z.number().int().min(0).max(4)).max(5), isAllCorrect: z.boolean(),
  marks: z.number().int().positive().default(1), state: PublishState, updatedAt: IsoTimestamp
}).strict();
export const Question = AdminQuestion.omit({ correctOptionIndexes: true, isAllCorrect: true, answerMode: true }).extend({ options: z.array(PublicQuestionOption).min(4).max(5) }).strict();

export const StudyMaterial = z.object({
  id: UUID, legacyId: z.string().min(1).max(300).nullable().optional(), subjectId: UUID, paperId: UUID.nullable(), slug: Slug, title: BilingualText,
  description: BilingualText.nullable(), objectKey: z.string().min(1).max(512), contentType: z.string().regex(/^[\w.+-]+\/[\w.+-]+$/),
  byteSize: z.number().int().nonnegative(), contentSafety: RichContentSafety, state: PublishState, updatedAt: IsoTimestamp
}).strict();
export const PublicMediaReference = z.object({ kind: z.enum(["image", "thumbnail", "document"]), url: z.string().url().refine((value) => value.startsWith("https://"), "public media must use HTTPS"), contentType: z.string().regex(/^[\w.+-]+\/[\w.+-]+$/), byteSize: z.number().int().nonnegative().optional(), width: z.number().int().positive().optional(), height: z.number().int().positive().optional() }).strict();
/**
 * Internal reference to a B2 object. Never exposed to the browser; the
 * Worker translates it to a public edge-cached URL at read time.
 */
export const B2ObjectReference = z.object({ objectKey: z.string().min(1).max(512), sha256: z.string().regex(/^[a-f0-9]{64}$/), byteSize: z.number().int().nonnegative(), contentType: z.string().regex(/^[\w.+-]+\/[\w.+-]+$/), purpose: z.enum(["image", "thumbnail", "document", "snapshot"]) }).strict();
/** Signed PUT ticket the browser uses to upload directly to B2 via the Worker.
 *  The ticket is a *reservation*, not a confirmation: the Worker charges the
 *  declared bytes pessimistically at issuance and verifies the actual bytes
 *  (size + sha256) on POST /api/v1/media/upload-confirm before the object
 *  becomes publishable. */
export const MediaUploadTicket = z.object({ intentId: UUID, url: z.string().url(), objectKey: z.string().min(1).max(512), headers: z.record(z.string(), z.string()), expiresAt: IsoTimestamp, maxByteSize: z.number().int().positive() }).strict();
/**
 * Upload ticket request. The `objectKeyPrefix` is server-controlled (the
 * Worker is the only thing that mints the final key); the `byteSize` is
 * declared up front so the Worker can bound the request and reconcile the
 * budget permit after the upload completes. The `sha256` is required so the
 * Worker can verify the uploaded bytes before publishing.
 */
export const MediaUploadTicketRequest = z.object({ objectKeyPrefix: z.string().regex(/^(gallery|study|about|publication)\/[a-z0-9-]{1,80}$/), contentType: z.string().regex(/^[\w.+-]+\/[\w.+-]+$/), byteSize: z.number().int().positive().max(50_000_000), sha256: z.string().regex(/^[a-f0-9]{64}$/), expiresInSeconds: z.number().int().min(30).max(3600) }).strict();
/** Confirm a browser upload: the Worker HEADs the object, rejects on size
 *  mismatch (deleting the object), streams the body to verify sha256, and
 *  marks the intent confirmed. Terminal states are idempotent. */
export const MediaUploadConfirmRequest = z.object({ intentId: UUID }).strict();
export const MediaUploadIntentStatus = z.enum(["ticketed", "verifying", "confirmed", "failed"]);
export const MediaUploadConfirmResult = z.object({ intentId: UUID, objectKey: z.string().min(1).max(512), byteSize: z.number().int().nonnegative(), sha256: z.string().regex(/^[a-f0-9]{64}$/), status: MediaUploadIntentStatus }).strict();
export const PublicStudyMaterial = StudyMaterial.omit({ objectKey: true, contentSafety: true }).extend({ media: PublicMediaReference }).strict();

export const GalleryMetadata = z.object({
  id: UUID, legacyId: z.string().min(1).max(300).nullable().optional(), slug: Slug, title: BilingualText, description: BilingualText.nullable(), altText: BilingualText,
  imageObjectKey: z.string().min(1).max(512), thumbnailObjectKey: z.string().min(1).max(512),
  contentType: z.string().regex(/^image\/[\w.+-]+$/), width: z.number().int().positive().max(20_000), height: z.number().int().positive().max(20_000),
  byteSize: z.number().int().nonnegative(), pinned: z.boolean(), sortOrder: z.number().int().nonnegative(),
  state: PublishState, createdAt: IsoTimestamp, updatedAt: IsoTimestamp
}).strict();
export const PublicGalleryItem = GalleryMetadata.omit({ imageObjectKey: true, thumbnailObjectKey: true }).extend({ image: PublicMediaReference, thumbnail: PublicMediaReference.nullable() }).strict();

export const SocialLinks = z.object({
  facebookUrl: z.string().url().nullable(), youtubeUrl: z.string().url().nullable(), linkedinUrl: z.string().url().nullable()
}).strict();
export const ProfileImageMetadata = z.object({ objectKey: z.string().min(1).max(512), contentType: z.string().regex(/^image\/[\w.+-]+$/), width: z.number().int().positive(), height: z.number().int().positive() }).strict();
export const AboutProfile = z.object({ id: z.literal("about"), description: z.string().max(50_000).nullable(), image: PublicMediaReference.nullable(), social: SocialLinks, updatedAt: IsoTimestamp }).strict();
export const AdminAboutProfile = AboutProfile.omit({ image: true }).extend({ image: ProfileImageMetadata.nullable() }).strict();
export const PrivacyPolicy = z.object({ id: z.literal("privacy"), statement: z.string().max(50_000), fullHtml: RichHtml.nullable(), contentSafety: RichContentSafety, updatedAt: IsoTimestamp }).strict();
export const ContentPage = z.object({ id: UUID, legacyId: z.string().min(1).max(300).nullable().optional(), slug: Slug, title: BilingualText, body: BilingualText, state: PublishState, updatedAt: IsoTimestamp }).strict();

export const Paper = z.object({
  id: UUID, legacyId: z.string().min(1).max(300).nullable().optional(), subjectId: UUID, examType: ExamType, slug: Slug, title: BilingualText, year: z.number().int().min(1900).max(2200),
  language: PaperLanguage, durationMinutes: z.number().int().positive().max(1_440), questionCount: z.number().int().nonnegative(),
  materializedQuestionCount: z.number().int().nonnegative(), questionCountSource: z.enum(["legacy_import", "derived_from_questions", "admin_declared"]),
  studyMaterialId: UUID.nullable(), state: PublishState, updatedAt: IsoTimestamp
}).strict();

export const PublicationManifest = z.object({
  snapshotId: UUID, version: z.number().int().positive(), publishedAt: IsoTimestamp,
  subjects: z.array(Subject), papers: z.array(Paper), questions: z.array(Question), studyMaterials: z.array(PublicStudyMaterial),
  gallery: z.array(PublicGalleryItem), pages: z.array(ContentPage), about: AboutProfile.nullable(), privacy: PrivacyPolicy.nullable()
}).strict();
export const CurrentPublication = z.object({ snapshotId: UUID, version: z.number().int().positive(), publishedAt: IsoTimestamp, manifest: PublicationManifest }).strict();

// Attempts intentionally model IndexedDB only. There is no account or API persistence contract.
export const LocalAttempt = z.object({
  storage: z.literal("indexeddb"), paperId: UUID, startedAt: z.number().int().nonnegative(), completedAt: z.number().int().nonnegative().optional(),
  answers: z.array(z.object({ questionId: UUID, selectedOptionIndexes: z.array(z.number().int().min(0).max(4)).max(5) }).strict()),
  isCompleted: z.boolean(), correctCount: z.number().int().nonnegative().optional(), totalCount: z.number().int().nonnegative().optional()
}).strict();

export const BackupManifest = z.object({
  format: z.literal("mehewara-v2-backup"), schemaVersion: z.number().int().positive(), createdAt: IsoTimestamp,
  subjects: z.array(Subject).max(50_000), papers: z.array(Paper).max(100_000), questions: z.array(AdminQuestion).max(1_000_000),
  // Canonical representation: options are nested in each question; there is no second option array.
  studyMaterials: z.array(StudyMaterial).max(50_000), galleryItems: z.array(GalleryMetadata).max(50_000), contentPages: z.array(ContentPage).max(10_000),
  mediaInventory: z.array(z.object({
    objectKey: z.string().min(1).max(512),
    purpose: z.enum(["image", "thumbnail", "document", "snapshot"]),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    byteSize: z.number().int().nonnegative(),
    contentType: z.string().regex(/^[\w.+-]+\/[\w.+-]+$/),
    /** True when this B2 object is referenced by a manifest field
     *  (studyMaterials[*].objectKey, galleryItems[*].imageObjectKey/
     *  thumbnailObjectKey, about.image.objectKey). False when it is only
     *  reachable through rewritten rich HTML. */
    referencedByManifest: z.boolean(),
    /** Origin of the object in the legacy source system. */
    sourceKind: z.enum(["inline-base64", "supabase-storage", "gallery-hex", "gallery-thumb", "study-html", "other"])
  }).strict()).max(150_000),
  sourceIdMap: z.array(z.object({ sourceSystem: z.string().min(1).max(80), entityType: z.string().min(1).max(80), sourceId: z.string().min(1).max(300), v2Id: UUID }).strict()).max(2_000_000),
  publication: z.object({ currentSnapshotId: UUID.nullable(), snapshotHistory: z.array(z.object({ snapshotId: UUID, version: z.number().int().positive(), action: z.enum(["published", "rolled_back"]), at: IsoTimestamp }).strict()).max(10_000) }).strict(),
  about: AdminAboutProfile.nullable(), privacy: PrivacyPolicy.nullable()
}).strict();
export const ImportManifest = z.object({ format: z.literal("mehewara-v2-backup"), schemaVersion: z.number().int().positive(), sourceChecksum: z.string().regex(/^[a-f0-9]{64}$/), requestedAt: IsoTimestamp, backup: BackupManifest }).strict();
/**
 * Draft <-> published <-> archived transitions. `expectedUpdatedAt` is
 * REQUIRED (not advisory): the guard reads a row version and the state
 * write is conditional on the same stamp, so any concurrent edit between
 * guard and write fails the token instead of publishing unguarded content.
 */
export const DraftPublishCommand = z.object({ entity: z.enum(["subject", "paper", "question", "study_material", "gallery_item", "content_page"]), entityId: UUID, state: PublishState, expectedUpdatedAt: IsoTimestamp }).strict();
export const PublishSnapshotCommand = z.object({ expectedVersion: z.number().int().positive().optional(), idempotencyKey: z.string().min(8).max(128), reason: z.string().max(500).optional() }).strict();
export const RollbackSnapshotCommand = z.object({ snapshotId: UUID, idempotencyKey: z.string().min(8).max(128), reason: z.string().min(1).max(500) }).strict();
export const SnapshotLifecycle = z.enum(["draft", "published", "current", "rolled_back"]);
export const PublicationSnapshot = z.object({ id: UUID, version: z.number().int().positive(), state: SnapshotLifecycle, publishedAt: IsoTimestamp.nullable(), createdAt: IsoTimestamp }).strict();

export const AdminContentStatistics = z.object({ generatedAt: IsoTimestamp, subjectCount: z.number().int().nonnegative(), paperCount: z.number().int().nonnegative(), questionCount: z.number().int().nonnegative(), publishedQuestionCount: z.number().int().nonnegative(), galleryCount: z.number().int().nonnegative(), draftCount: z.number().int().nonnegative() }).strict();
export const DailyAggregateMetrics = z.object({ metricDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), publicationViews: z.number().int().nonnegative(), paperStarts: z.number().int().nonnegative(), completedAttempts: z.number().int().nonnegative(), galleryViews: z.number().int().nonnegative(), updatedAt: IsoTimestamp }).strict();
export const ApproximateActiveUserPresence = z.object({ bucketStartedAt: IsoTimestamp, bucketSeconds: z.number().int().positive(), approximateActiveUsers: z.number().int().nonnegative(), method: z.literal("privacy_preserving_approximation") }).strict();
export const ImportExportResult = z.object({ jobId: UUID, operation: z.enum(["import", "export"]), status: z.enum(["queued", "running", "completed", "failed", "cancelled"]), importedRecords: z.number().int().nonnegative(), exportedRecords: z.number().int().nonnegative(), checksum: z.string().regex(/^[a-f0-9]{64}$/).nullable(), errorCode: z.string().regex(/^[A-Z0-9_]+$/).nullable() }).strict();
export const AuditRecord = z.object({ id: UUID, actorId: z.string().min(1).max(200), action: z.string().regex(/^[a-z][a-z0-9_.-]{1,100}$/), entityType: z.string().regex(/^[a-z][a-z0-9_.-]{1,100}$/), entityId: UUID.nullable(), requestId: z.string().min(1).max(100), metadata: z.array(z.object({ key: z.string().min(1).max(80), value: z.string().max(500) }).strict()).max(50), createdAt: IsoTimestamp }).strict();

export const BudgetResource = z.enum(["d1Reads", "d1Writes", "b2ClassA", "b2ClassB", "b2Bytes", "b2EgressBytes"]);
export const BudgetPool = z.enum(["public", "admin", "publication", "emergency", "margin"]);
export const BudgetWindow = z.enum(["daily", "monthly", "persistent"]);
export const BudgetOperation = z.enum(["publicSnapshotRead", "publicSnapshotCacheFill", "adminContentRead", "adminContentWrite", "adminBackupExport", "adminBackupImportChunk", "publicationBuild", "publicationPointerMove", "b2MediaRead", "b2Upload", "mediaIntentLookup", "mediaUploadConfirm", "b2Delete", "snapshotArtifactWrite"]);
export const BudgetPermit = z.object({ permitId: z.string().regex(/^[A-Za-z0-9._~-]{8,128}$/), expiresAt: IsoTimestamp }).strict();
export const BudgetReserveRequest = z.object({ permitId: z.string().regex(/^[A-Za-z0-9._~-]{8,128}$/), operation: BudgetOperation, ttlSeconds: z.number().int().positive().max(600).optional(), declaredBytes: z.number().int().nonnegative().max(5_368_709_120).optional() }).strict();
export const BudgetCommitRequest = z.object({ permitId: z.string().regex(/^[A-Za-z0-9._~-]{8,128}$/), providerCallStarted: z.boolean() }).strict();
export const BudgetReleaseRequest = z.object({ permitId: z.string().regex(/^[A-Za-z0-9._~-]{8,128}$/) }).strict();
export const BudgetCounter = z.object({ limit: z.number().int().nonnegative(), reserved: z.number().int().nonnegative(), committed: z.number().int().nonnegative(), window: BudgetWindow, windowStartedAt: IsoTimestamp, windowEndsAt: IsoTimestamp.nullable() }).strict();
export const BudgetStatus = z.object({ emergencyUntil: IsoTimestamp.nullable(), resources: z.record(BudgetResource, BudgetCounter), pools: z.record(BudgetPool, BudgetCounter), poolResourceAllocations: z.record(BudgetPool, z.record(BudgetResource, BudgetCounter)) }).strict();
export const EmergencyActivationRequest = z.object({ actorId: z.string().min(1).max(200), reason: z.string().min(1).max(500), expiresAt: IsoTimestamp, auditId: UUID }).strict();

export const ApiError = z.object({ error: z.object({ code: z.string().regex(/^[A-Z0-9_]+$/), message: z.string().min(1).max(500), requestId: z.string().min(1).max(100), details: z.array(z.object({ field: z.string().min(1).max(100), message: z.string().min(1).max(300) }).strict()).max(50).optional() }).strict() }).strict();
export const ErrorCode = z.enum(["BAD_REQUEST", "UNAUTHORIZED", "FORBIDDEN", "NOT_FOUND", "METHOD_NOT_ALLOWED", "CONFLICT", "GONE", "UNPROCESSABLE", "BUDGET_EXCEEDED", "NOT_CONFIGURED", "INTERNAL_ERROR"]);

/**
 * Admin write commands. Creates carry client-supplied UUIDs (natural
 * idempotency across retries) and always start in `draft` — publication
 * happens only through DraftPublishCommand, never inline. Updates are
 * partial with a required `expectedUpdatedAt` guard so concurrent editors
 * cannot silently overwrite each other. Server-owned fields (state,
 * updatedAt, and Paper's derived studyMaterialId/materializedQuestionCount)
 * are omitted: the route fills them in.
 */
export const SubjectCreate = Subject.omit({ state: true, updatedAt: true }).strict();
export const SubjectUpdate = SubjectCreate.partial().extend({ expectedUpdatedAt: IsoTimestamp }).strict();
export const PaperCreate = Paper.omit({ state: true, updatedAt: true, studyMaterialId: true, materializedQuestionCount: true }).strict();
export const PaperUpdate = PaperCreate.partial().extend({ expectedUpdatedAt: IsoTimestamp }).strict();
export const AdminQuestionCreate = AdminQuestion.omit({ state: true, updatedAt: true }).strict();
export const AdminQuestionUpdate = AdminQuestionCreate.partial().extend({ expectedUpdatedAt: IsoTimestamp }).strict();
export const StudyMaterialCreate = StudyMaterial.omit({ state: true, updatedAt: true }).strict();
export const StudyMaterialUpdate = StudyMaterialCreate.partial().extend({ expectedUpdatedAt: IsoTimestamp }).strict();
export const GalleryItemCreate = GalleryMetadata.omit({ state: true, createdAt: true, updatedAt: true }).strict();
export const GalleryItemUpdate = GalleryItemCreate.partial().extend({ expectedUpdatedAt: IsoTimestamp }).strict();
export const ContentPageCreate = ContentPage.omit({ state: true, updatedAt: true }).strict();
export const ContentPageUpdate = ContentPageCreate.partial().extend({ expectedUpdatedAt: IsoTimestamp }).strict();
export const AboutPut = AdminAboutProfile.omit({ updatedAt: true }).extend({ expectedUpdatedAt: IsoTimestamp.optional() }).strict();
export const PrivacyPut = PrivacyPolicy.omit({ updatedAt: true }).extend({ expectedUpdatedAt: IsoTimestamp.optional() }).strict();

export type Subject = z.infer<typeof Subject>; export type Paper = z.infer<typeof Paper>; export type Question = z.infer<typeof Question>; export type AdminQuestion = z.infer<typeof AdminQuestion>; export type QuestionOption = z.infer<typeof QuestionOption>; export type PublicQuestionOption = z.infer<typeof PublicQuestionOption>;
export type StudyMaterial = z.infer<typeof StudyMaterial>; export type PublicStudyMaterial = z.infer<typeof PublicStudyMaterial>; export type GalleryMetadata = z.infer<typeof GalleryMetadata>; export type PublicGalleryItem = z.infer<typeof PublicGalleryItem>;
export type AboutProfile = z.infer<typeof AboutProfile>; export type AdminAboutProfile = z.infer<typeof AdminAboutProfile>; export type PrivacyPolicy = z.infer<typeof PrivacyPolicy>; export type ContentPage = z.infer<typeof ContentPage>;
export type PublicationManifest = z.infer<typeof PublicationManifest>; export type BackupManifest = z.infer<typeof BackupManifest>; export type ImportManifest = z.infer<typeof ImportManifest>; export type LocalAttempt = z.infer<typeof LocalAttempt>;
export type DraftPublishCommand = z.infer<typeof DraftPublishCommand>; export type PublishSnapshotCommand = z.infer<typeof PublishSnapshotCommand>; export type RollbackSnapshotCommand = z.infer<typeof RollbackSnapshotCommand>; export type PublicationSnapshot = z.infer<typeof PublicationSnapshot>;
export type AdminContentStatistics = z.infer<typeof AdminContentStatistics>; export type DailyAggregateMetrics = z.infer<typeof DailyAggregateMetrics>; export type ApproximateActiveUserPresence = z.infer<typeof ApproximateActiveUserPresence>; export type ImportExportResult = z.infer<typeof ImportExportResult>; export type AuditRecord = z.infer<typeof AuditRecord>; export type BudgetStatus = z.infer<typeof BudgetStatus>; export type ApiError = z.infer<typeof ApiError>;
export type BudgetOperation = z.infer<typeof BudgetOperation>; export type BudgetPermit = z.infer<typeof BudgetPermit>; export type BudgetReserveRequest = z.infer<typeof BudgetReserveRequest>; export type BudgetCommitRequest = z.infer<typeof BudgetCommitRequest>; export type BudgetReleaseRequest = z.infer<typeof BudgetReleaseRequest>; export type EmergencyActivationRequest = z.infer<typeof EmergencyActivationRequest>;
export type MediaUploadTicket = z.infer<typeof MediaUploadTicket>; export type MediaUploadTicketRequest = z.infer<typeof MediaUploadTicketRequest>; export type MediaUploadConfirmRequest = z.infer<typeof MediaUploadConfirmRequest>; export type MediaUploadConfirmResult = z.infer<typeof MediaUploadConfirmResult>; export type MediaUploadIntentStatus = z.infer<typeof MediaUploadIntentStatus>; export type B2ObjectReference = z.infer<typeof B2ObjectReference>;
export type SubjectCreate = z.infer<typeof SubjectCreate>; export type SubjectUpdate = z.infer<typeof SubjectUpdate>; export type PaperCreate = z.infer<typeof PaperCreate>; export type PaperUpdate = z.infer<typeof PaperUpdate>;
export type AdminQuestionCreate = z.infer<typeof AdminQuestionCreate>; export type AdminQuestionUpdate = z.infer<typeof AdminQuestionUpdate>; export type StudyMaterialCreate = z.infer<typeof StudyMaterialCreate>; export type StudyMaterialUpdate = z.infer<typeof StudyMaterialUpdate>;
export type GalleryItemCreate = z.infer<typeof GalleryItemCreate>; export type GalleryItemUpdate = z.infer<typeof GalleryItemUpdate>; export type ContentPageCreate = z.infer<typeof ContentPageCreate>; export type ContentPageUpdate = z.infer<typeof ContentPageUpdate>;
export type AboutPut = z.infer<typeof AboutPut>; export type PrivacyPut = z.infer<typeof PrivacyPut>;

export const publicContracts = { Subject, Paper, Question, PublicQuestionOption, PublicStudyMaterial, PublicGalleryItem, AboutProfile, PrivacyPolicy, ContentPage, PublicationManifest, CurrentPublication, LocalAttempt } as const;
export const adminContracts = { Subject, Paper, AdminQuestion, QuestionOption, StudyMaterial, GalleryMetadata, AdminAboutProfile, PrivacyPolicy, ContentPage, BackupManifest, ImportManifest, DraftPublishCommand, PublishSnapshotCommand, RollbackSnapshotCommand, PublicationSnapshot, AdminContentStatistics, DailyAggregateMetrics, ApproximateActiveUserPresence, ImportExportResult, AuditRecord, BudgetStatus, BudgetReserveRequest, BudgetCommitRequest, BudgetReleaseRequest, EmergencyActivationRequest, MediaUploadTicket, MediaUploadTicketRequest, MediaUploadConfirmRequest, MediaUploadConfirmResult, B2ObjectReference, SubjectCreate, SubjectUpdate, PaperCreate, PaperUpdate, AdminQuestionCreate, AdminQuestionUpdate, StudyMaterialCreate, StudyMaterialUpdate, GalleryItemCreate, GalleryItemUpdate, ContentPageCreate, ContentPageUpdate, AboutPut, PrivacyPut } as const;
