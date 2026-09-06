-- Strictly monotonic updated_at stamps. strftime('%f') resolves to
-- milliseconds, so two writes in the same millisecond used to leave
-- updated_at unchanged — letting a spent optimistic-concurrency token win
-- twice. Each trigger now bumps past the previous stamp (+1s on collision),
-- so every successful write changes the token and guarded WHERE clauses
-- stay exact. Format and timezone are preserved (verified: SQLite parses
-- the Z-suffixed form and applies second modifiers to it).
DROP TRIGGER IF EXISTS subjects_updated_at;
CREATE TRIGGER subjects_updated_at AFTER UPDATE ON subjects BEGIN
  UPDATE subjects SET updated_at = CASE
    WHEN strftime('%Y-%m-%dT%H:%M:%fZ','now') <= OLD.updated_at
    THEN strftime('%Y-%m-%dT%H:%M:%fZ', OLD.updated_at, '+1 second')
    ELSE strftime('%Y-%m-%dT%H:%M:%fZ','now') END
  WHERE id = NEW.id; END;
DROP TRIGGER IF EXISTS papers_updated_at;
CREATE TRIGGER papers_updated_at AFTER UPDATE ON papers BEGIN
  UPDATE papers SET updated_at = CASE
    WHEN strftime('%Y-%m-%dT%H:%M:%fZ','now') <= OLD.updated_at
    THEN strftime('%Y-%m-%dT%H:%M:%fZ', OLD.updated_at, '+1 second')
    ELSE strftime('%Y-%m-%dT%H:%M:%fZ','now') END
  WHERE id = NEW.id; END;
DROP TRIGGER IF EXISTS study_materials_updated_at;
CREATE TRIGGER study_materials_updated_at AFTER UPDATE ON study_materials BEGIN
  UPDATE study_materials SET updated_at = CASE
    WHEN strftime('%Y-%m-%dT%H:%M:%fZ','now') <= OLD.updated_at
    THEN strftime('%Y-%m-%dT%H:%M:%fZ', OLD.updated_at, '+1 second')
    ELSE strftime('%Y-%m-%dT%H:%M:%fZ','now') END
  WHERE id = NEW.id; END;
DROP TRIGGER IF EXISTS questions_updated_at;
CREATE TRIGGER questions_updated_at AFTER UPDATE ON questions BEGIN
  UPDATE questions SET updated_at = CASE
    WHEN strftime('%Y-%m-%dT%H:%M:%fZ','now') <= OLD.updated_at
    THEN strftime('%Y-%m-%dT%H:%M:%fZ', OLD.updated_at, '+1 second')
    ELSE strftime('%Y-%m-%dT%H:%M:%fZ','now') END
  WHERE id = NEW.id; END;
DROP TRIGGER IF EXISTS gallery_items_updated_at;
CREATE TRIGGER gallery_items_updated_at AFTER UPDATE ON gallery_items BEGIN
  UPDATE gallery_items SET updated_at = CASE
    WHEN strftime('%Y-%m-%dT%H:%M:%fZ','now') <= OLD.updated_at
    THEN strftime('%Y-%m-%dT%H:%M:%fZ', OLD.updated_at, '+1 second')
    ELSE strftime('%Y-%m-%dT%H:%M:%fZ','now') END
  WHERE id = NEW.id; END;
DROP TRIGGER IF EXISTS content_pages_updated_at;
CREATE TRIGGER content_pages_updated_at AFTER UPDATE ON content_pages BEGIN
  UPDATE content_pages SET updated_at = CASE
    WHEN strftime('%Y-%m-%dT%H:%M:%fZ','now') <= OLD.updated_at
    THEN strftime('%Y-%m-%dT%H:%M:%fZ', OLD.updated_at, '+1 second')
    ELSE strftime('%Y-%m-%dT%H:%M:%fZ','now') END
  WHERE id = NEW.id; END;
