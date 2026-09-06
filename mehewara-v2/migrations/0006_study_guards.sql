-- Study publication invariants, mirroring the subject -> paper -> question
-- trigger chains in 0001. The admin route also checks these (for clear 409
-- messages), but triggers are the backstop: they cover every writer,
-- including the future import path.
CREATE TRIGGER study_publish_requires_subject BEFORE INSERT ON study_materials
  WHEN NEW.state = 'published' AND NOT EXISTS (SELECT 1 FROM subjects WHERE id = NEW.subject_id AND state = 'published')
  BEGIN SELECT RAISE(ABORT, 'published study material requires published subject'); END;
CREATE TRIGGER study_publish_requires_subject_update BEFORE UPDATE OF state, subject_id, paper_id ON study_materials
  WHEN NEW.state = 'published' AND NOT EXISTS (SELECT 1 FROM subjects WHERE id = NEW.subject_id AND state = 'published')
  BEGIN SELECT RAISE(ABORT, 'published study material requires published subject'); END;
CREATE TRIGGER study_publish_requires_paper BEFORE INSERT ON study_materials
  WHEN NEW.state = 'published' AND NEW.paper_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM papers WHERE id = NEW.paper_id AND state = 'published')
  BEGIN SELECT RAISE(ABORT, 'published study material requires published paper'); END;
CREATE TRIGGER study_publish_requires_paper_update BEFORE UPDATE OF state, subject_id, paper_id ON study_materials
  WHEN NEW.state = 'published' AND NEW.paper_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM papers WHERE id = NEW.paper_id AND state = 'published')
  BEGIN SELECT RAISE(ABORT, 'published study material requires published paper'); END;
-- Do not unpublish a parent while published study materials remain, and do
-- not repoint a published study under a draft parent.
CREATE TRIGGER subjects_cannot_unpublish_with_studies BEFORE UPDATE OF state ON subjects
  WHEN OLD.state = 'published' AND NEW.state IN ('draft','archived')
  AND EXISTS (SELECT 1 FROM study_materials WHERE subject_id = OLD.id AND state = 'published' AND paper_id IS NULL)
  BEGIN SELECT RAISE(ABORT, 'published subject has published study materials'); END;
CREATE TRIGGER papers_cannot_unpublish_with_studies BEFORE UPDATE OF state ON papers
  WHEN OLD.state = 'published' AND NEW.state IN ('draft','archived')
  AND EXISTS (SELECT 1 FROM study_materials WHERE paper_id = OLD.id AND state = 'published')
  BEGIN SELECT RAISE(ABORT, 'published paper has published study materials'); END;
