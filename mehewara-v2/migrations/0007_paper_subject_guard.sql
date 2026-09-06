-- A paper move must not silently strand linked studies under another
-- subject: the build resolves studyMaterialId through paper_id, so a moved
-- paper would publish its studies under the wrong subject. Repoint (or
-- remove) the studies first. Covers every writer including future import.
CREATE TRIGGER papers_cannot_change_subject_with_studies BEFORE UPDATE OF subject_id ON papers
  WHEN OLD.subject_id <> NEW.subject_id AND EXISTS (SELECT 1 FROM study_materials WHERE paper_id = OLD.id)
  BEGIN SELECT RAISE(ABORT, 'paper has linked study materials; repoint them first'); END;
