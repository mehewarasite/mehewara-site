PRAGMA foreign_keys = ON;

-- Legacy source IDs are intentionally text and are never cast to UUID. Importers write
-- the generated v2 UUID plus the original value into legacy_id_map/source_legacy_id.
-- English and Sinhala are the guaranteed source languages; Tamil columns are optional.
-- Legacy HTML is migrated into *_html columns with sanitization_status='pending'. A trusted
-- sanitizer must produce the recorded sanitizer_version before publication.
-- Legacy gallery image_hex/base64 is not copied into D1. Media migration uploads image and
-- thumbnail bytes to private Backblaze B2, then records keys/checksums in gallery_items/media_inventory.
CREATE TABLE legacy_id_map (
  source_system TEXT NOT NULL, entity_type TEXT NOT NULL, source_id TEXT NOT NULL,
  v2_id TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (source_system, entity_type, source_id), UNIQUE (v2_id)
);

CREATE TABLE subjects (
  id TEXT PRIMARY KEY, source_legacy_id TEXT, slug TEXT NOT NULL UNIQUE CHECK (length(slug) BETWEEN 1 AND 120),
  title_en TEXT NOT NULL, title_si TEXT NOT NULL, title_ta TEXT,
  description_en TEXT, description_si TEXT, description_ta TEXT,
  exam_type TEXT NOT NULL CHECK (exam_type IN ('ol','al')), code TEXT NOT NULL CHECK (length(code) BETWEEN 1 AND 32),
  icon TEXT NOT NULL DEFAULT 'BookOpen', color TEXT NOT NULL DEFAULT '#334155', presentation_variant TEXT NOT NULL DEFAULT 'solid' CHECK (presentation_variant IN ('solid','gradient','muted')),
  state TEXT NOT NULL DEFAULT 'draft' CHECK (state IN ('draft','published','archived')), sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), UNIQUE(source_legacy_id)
);
CREATE INDEX subjects_state_order_idx ON subjects(state, sort_order, id);

CREATE TABLE papers (
  id TEXT PRIMARY KEY, source_legacy_id TEXT, subject_id TEXT NOT NULL REFERENCES subjects(id) ON DELETE RESTRICT,
  slug TEXT NOT NULL, exam_type TEXT NOT NULL CHECK (exam_type IN ('ol','al')), title_en TEXT NOT NULL, title_si TEXT NOT NULL, title_ta TEXT,
  year INTEGER NOT NULL CHECK (year BETWEEN 1900 AND 2200), language TEXT NOT NULL DEFAULT 'en' CHECK (language IN ('en','si')),
  duration_minutes INTEGER NOT NULL DEFAULT 60 CHECK (duration_minutes > 0 AND duration_minutes <= 1440), question_count INTEGER NOT NULL DEFAULT 0 CHECK (question_count >= 0),
  materialized_question_count INTEGER NOT NULL DEFAULT 0 CHECK (materialized_question_count >= 0), question_count_source TEXT NOT NULL DEFAULT 'legacy_import' CHECK (question_count_source IN ('legacy_import','derived_from_questions','admin_declared')),
  state TEXT NOT NULL DEFAULT 'draft' CHECK (state IN ('draft','published','archived')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(subject_id, slug), UNIQUE(source_legacy_id)
);
CREATE INDEX papers_subject_state_idx ON papers(subject_id, state, year DESC, id);

CREATE TABLE study_materials (
  id TEXT PRIMARY KEY, source_legacy_id TEXT, subject_id TEXT NOT NULL REFERENCES subjects(id) ON DELETE RESTRICT, paper_id TEXT REFERENCES papers(id) ON DELETE RESTRICT,
  slug TEXT NOT NULL, title_en TEXT NOT NULL, title_si TEXT NOT NULL, title_ta TEXT,
  description_en TEXT, description_si TEXT, description_ta TEXT, html_en TEXT, html_si TEXT, html_ta TEXT,
  sanitization_status TEXT NOT NULL DEFAULT 'pending' CHECK (sanitization_status IN ('pending','sanitized','rejected')), sanitizer_version TEXT,
  object_key TEXT, content_type TEXT, byte_size INTEGER NOT NULL DEFAULT 0 CHECK (byte_size >= 0), sha256 TEXT CHECK (sha256 IS NULL OR length(sha256) = 64),
  state TEXT NOT NULL DEFAULT 'draft' CHECK (state IN ('draft','published','archived')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(subject_id, slug), UNIQUE(source_legacy_id)
);
CREATE INDEX study_materials_paper_idx ON study_materials(paper_id, state, id);

CREATE TABLE questions (
  id TEXT PRIMARY KEY, source_legacy_id TEXT, paper_id TEXT NOT NULL REFERENCES papers(id) ON DELETE RESTRICT, number INTEGER NOT NULL CHECK (number > 0),
  question_html_en TEXT NOT NULL, question_html_si TEXT NOT NULL, question_html_ta TEXT,
  explanation_html_en TEXT, explanation_html_si TEXT, explanation_html_ta TEXT,
  sanitization_status TEXT NOT NULL DEFAULT 'pending' CHECK (sanitization_status IN ('pending','sanitized','rejected')), sanitizer_version TEXT,
  option_count INTEGER NOT NULL DEFAULT 4 CHECK (option_count IN (4,5)), answer_mode TEXT NOT NULL DEFAULT 'single' CHECK (answer_mode IN ('single','multiple','all')),
  is_all_correct INTEGER NOT NULL DEFAULT 0 CHECK (is_all_correct IN (0,1)), marks INTEGER NOT NULL DEFAULT 1 CHECK (marks > 0), marks_source TEXT NOT NULL DEFAULT 'legacy_default' CHECK (marks_source IN ('legacy_default','source','admin')),
  state TEXT NOT NULL DEFAULT 'draft' CHECK (state IN ('draft','published','archived')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(paper_id, number), UNIQUE(source_legacy_id)
);
CREATE INDEX questions_paper_state_idx ON questions(paper_id, state, number, id);

CREATE TABLE question_options (
  id TEXT PRIMARY KEY, source_legacy_id TEXT, question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  option_html_en TEXT NOT NULL, option_html_si TEXT NOT NULL, option_html_ta TEXT,
  sanitization_status TEXT NOT NULL DEFAULT 'pending' CHECK (sanitization_status IN ('pending','sanitized','rejected')), sanitizer_version TEXT,
  sort_order INTEGER NOT NULL CHECK (sort_order >= 0), is_correct INTEGER NOT NULL DEFAULT 0 CHECK (is_correct IN (0,1)),
  UNIQUE(question_id, sort_order), UNIQUE(source_legacy_id)
);
CREATE INDEX question_options_question_idx ON question_options(question_id, sort_order, id);

CREATE TABLE gallery_items (
  id TEXT PRIMARY KEY, source_legacy_id TEXT, slug TEXT NOT NULL UNIQUE, title_en TEXT NOT NULL DEFAULT '', title_si TEXT NOT NULL DEFAULT '', title_ta TEXT,
  description_en TEXT NOT NULL DEFAULT '', description_si TEXT NOT NULL DEFAULT '', description_ta TEXT,
  alt_en TEXT NOT NULL DEFAULT '', alt_si TEXT NOT NULL DEFAULT '', alt_ta TEXT,
  image_object_key TEXT NOT NULL, thumbnail_object_key TEXT NOT NULL, content_type TEXT NOT NULL CHECK (content_type LIKE 'image/%'),
  image_sha256 TEXT NOT NULL CHECK (length(image_sha256) = 64), thumbnail_sha256 TEXT NOT NULL CHECK (length(thumbnail_sha256) = 64),
  width INTEGER NOT NULL CHECK (width > 0), height INTEGER NOT NULL CHECK (height > 0), byte_size INTEGER NOT NULL CHECK (byte_size >= 0), thumbnail_byte_size INTEGER NOT NULL CHECK (thumbnail_byte_size >= 0),
  pinned INTEGER NOT NULL DEFAULT 0 CHECK (pinned IN (0,1)), sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0), state TEXT NOT NULL DEFAULT 'draft' CHECK (state IN ('draft','published','archived')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), UNIQUE(source_legacy_id)
);
CREATE INDEX gallery_pinned_order_idx ON gallery_items(state, pinned DESC, sort_order, created_at, id);

CREATE TABLE content_pages (
  id TEXT PRIMARY KEY, source_legacy_id TEXT, slug TEXT NOT NULL UNIQUE, title_en TEXT NOT NULL, title_si TEXT NOT NULL, title_ta TEXT,
  body_en TEXT NOT NULL, body_si TEXT NOT NULL, body_ta TEXT, state TEXT NOT NULL DEFAULT 'draft' CHECK (state IN ('draft','published','archived')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), UNIQUE(source_legacy_id)
);

CREATE TABLE about_profiles (
  id TEXT PRIMARY KEY CHECK (id = 'about'), description TEXT, image_object_key TEXT, image_url TEXT,
  facebook_url TEXT, youtube_url TEXT, linkedin_url TEXT, updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE privacy_policies (
  id TEXT PRIMARY KEY CHECK (id = 'privacy'), statement TEXT NOT NULL DEFAULT '', full_html TEXT, sanitization_status TEXT NOT NULL DEFAULT 'pending' CHECK (sanitization_status IN ('pending','sanitized','rejected')), sanitizer_version TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Snapshot bodies are immutable B2 JSON artifacts. D1 stores metadata and pointers only.
CREATE TABLE publication_snapshots (
  id TEXT PRIMARY KEY, version INTEGER NOT NULL UNIQUE CHECK (version > 0), object_key TEXT NOT NULL UNIQUE,
  sha256 TEXT NOT NULL CHECK (length(sha256) = 64), byte_size INTEGER NOT NULL CHECK (byte_size >= 0), status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published','retired')),
  published_at TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE current_publication (
  singleton INTEGER PRIMARY KEY DEFAULT 1 CHECK (singleton = 1), snapshot_id TEXT NOT NULL REFERENCES publication_snapshots(id) ON DELETE RESTRICT,
  version INTEGER NOT NULL, updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE publication_snapshot_history (
  id TEXT PRIMARY KEY, snapshot_id TEXT NOT NULL REFERENCES publication_snapshots(id) ON DELETE RESTRICT, version INTEGER NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('published','rolled_back')), actor_id TEXT NOT NULL, reason TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE media_inventory (
  object_key TEXT PRIMARY KEY, purpose TEXT NOT NULL CHECK (purpose IN ('image','thumbnail','document','snapshot')), sha256 TEXT NOT NULL CHECK (length(sha256) = 64), byte_size INTEGER NOT NULL CHECK (byte_size >= 0), content_type TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE daily_metrics (
  metric_date TEXT PRIMARY KEY, publication_views INTEGER NOT NULL DEFAULT 0 CHECK (publication_views >= 0), paper_starts INTEGER NOT NULL DEFAULT 0 CHECK (paper_starts >= 0), completed_attempts INTEGER NOT NULL DEFAULT 0 CHECK (completed_attempts >= 0), gallery_views INTEGER NOT NULL DEFAULT 0 CHECK (gallery_views >= 0), updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE admin_audit_log (
  id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, action TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT, request_id TEXT NOT NULL, metadata_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), CHECK (json_valid(metadata_json))
);
CREATE INDEX admin_audit_actor_time_idx ON admin_audit_log(actor_id, created_at);
CREATE TABLE import_jobs (
  id TEXT PRIMARY KEY, requested_by TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','completed','failed','cancelled')), manifest_checksum TEXT NOT NULL CHECK (length(manifest_checksum) = 64), error_code TEXT, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX import_jobs_status_time_idx ON import_jobs(status, created_at);

-- Do not draft/archive a parent while published dependents remain.
CREATE TRIGGER subjects_cannot_unpublish_with_papers BEFORE UPDATE OF state ON subjects WHEN OLD.state = 'published' AND NEW.state IN ('draft','archived') AND EXISTS (SELECT 1 FROM papers WHERE subject_id = OLD.id AND state = 'published') BEGIN SELECT RAISE(ABORT, 'published subject has published papers'); END;
CREATE TRIGGER papers_cannot_unpublish_with_questions BEFORE UPDATE OF state ON papers WHEN OLD.state = 'published' AND NEW.state IN ('draft','archived') AND EXISTS (SELECT 1 FROM questions WHERE paper_id = OLD.id AND state = 'published') BEGIN SELECT RAISE(ABORT, 'published paper has published questions'); END;
CREATE TRIGGER papers_publish_requires_subject BEFORE INSERT ON papers WHEN NEW.state = 'published' AND NOT EXISTS (SELECT 1 FROM subjects WHERE id = NEW.subject_id AND state = 'published') BEGIN SELECT RAISE(ABORT, 'published paper requires published subject'); END;
CREATE TRIGGER papers_publish_requires_subject_update BEFORE UPDATE OF state, subject_id ON papers WHEN NEW.state = 'published' AND NOT EXISTS (SELECT 1 FROM subjects WHERE id = NEW.subject_id AND state = 'published') BEGIN SELECT RAISE(ABORT, 'published paper requires published subject'); END;
CREATE TRIGGER questions_publish_requires_paper BEFORE INSERT ON questions WHEN NEW.state = 'published' AND NOT EXISTS (SELECT 1 FROM papers WHERE id = NEW.paper_id AND state = 'published') BEGIN SELECT RAISE(ABORT, 'published question requires published paper'); END;
CREATE TRIGGER questions_publish_requires_paper_update BEFORE UPDATE OF state, paper_id ON questions WHEN NEW.state = 'published' AND NOT EXISTS (SELECT 1 FROM papers WHERE id = NEW.paper_id AND state = 'published') BEGIN SELECT RAISE(ABORT, 'published question requires published paper'); END;
CREATE TRIGGER question_publish_shape BEFORE UPDATE OF state, option_count ON questions WHEN NEW.state = 'published' AND (SELECT count(*) FROM question_options WHERE question_id = NEW.id) <> NEW.option_count BEGIN SELECT RAISE(ABORT, 'published question option count mismatch'); END;
-- Published questions cannot be born published: option rows do not exist at
-- parent INSERT time, so no count check is possible yet. Force the
-- draft-first workflow — full shape is validated by the UPDATE trigger
-- above when the question is published.
CREATE TRIGGER question_publish_requires_update BEFORE INSERT ON questions WHEN NEW.state = 'published' BEGIN SELECT RAISE(ABORT, 'publish questions via state update so option shape is validated'); END;
-- Published parents stay valid under option mutation: options can only be
-- added/changed/removed while the resulting count still matches.
CREATE TRIGGER question_options_published_shape_insert AFTER INSERT ON question_options WHEN (SELECT state FROM questions WHERE id = NEW.question_id) = 'published' AND (SELECT count(*) FROM question_options WHERE question_id = NEW.question_id) <> (SELECT option_count FROM questions WHERE id = NEW.question_id) BEGIN SELECT RAISE(ABORT, 'published question option count mismatch'); END;
CREATE TRIGGER question_options_published_shape_update AFTER UPDATE ON question_options WHEN ((SELECT state FROM questions WHERE id = NEW.question_id) = 'published' AND (SELECT count(*) FROM question_options WHERE question_id = NEW.question_id) <> (SELECT option_count FROM questions WHERE id = NEW.question_id)) OR ((SELECT state FROM questions WHERE id = OLD.question_id) = 'published' AND OLD.question_id <> NEW.question_id AND (SELECT count(*) FROM question_options WHERE question_id = OLD.question_id) <> (SELECT option_count FROM questions WHERE id = OLD.question_id)) BEGIN SELECT RAISE(ABORT, 'published question option count mismatch'); END;
CREATE TRIGGER question_options_published_shape_delete AFTER DELETE ON question_options WHEN (SELECT state FROM questions WHERE id = OLD.question_id) = 'published' AND (SELECT count(*) FROM question_options WHERE question_id = OLD.question_id) <> (SELECT option_count FROM questions WHERE id = OLD.question_id) BEGIN SELECT RAISE(ABORT, 'published question option count mismatch'); END;
CREATE TRIGGER snapshot_published_immutable BEFORE UPDATE ON publication_snapshots WHEN OLD.status = 'published' BEGIN SELECT RAISE(ABORT, 'published snapshot is immutable'); END;
CREATE TRIGGER snapshot_published_no_delete BEFORE DELETE ON publication_snapshots WHEN OLD.status = 'published' BEGIN SELECT RAISE(ABORT, 'published snapshot is immutable'); END;
CREATE TRIGGER current_publication_matches_snapshot BEFORE INSERT ON current_publication WHEN NOT EXISTS (SELECT 1 FROM publication_snapshots WHERE id = NEW.snapshot_id AND version = NEW.version AND status = 'published') BEGIN SELECT RAISE(ABORT, 'current pointer must reference published snapshot'); END;
CREATE TRIGGER current_publication_matches_snapshot_update BEFORE UPDATE OF snapshot_id, version ON current_publication WHEN NOT EXISTS (SELECT 1 FROM publication_snapshots WHERE id = NEW.snapshot_id AND version = NEW.version AND status = 'published') BEGIN SELECT RAISE(ABORT, 'current pointer must reference published snapshot'); END;

CREATE TRIGGER subjects_updated_at AFTER UPDATE ON subjects BEGIN UPDATE subjects SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id; END;
CREATE TRIGGER papers_updated_at AFTER UPDATE ON papers BEGIN UPDATE papers SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id; END;
CREATE TRIGGER study_materials_updated_at AFTER UPDATE ON study_materials BEGIN UPDATE study_materials SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id; END;
CREATE TRIGGER questions_updated_at AFTER UPDATE ON questions BEGIN UPDATE questions SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id; END;
CREATE TRIGGER gallery_items_updated_at AFTER UPDATE ON gallery_items BEGIN UPDATE gallery_items SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id; END;
CREATE TRIGGER content_pages_updated_at AFTER UPDATE ON content_pages BEGIN UPDATE content_pages SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id; END;
