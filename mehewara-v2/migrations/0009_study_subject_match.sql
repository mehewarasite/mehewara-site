-- A study's paper must belong to the study's subject. The admin route
-- checks this for clear 400s, but the invariant lives in D1 so concurrent
-- paper moves and direct writers (including future import) cannot create a
-- mismatch behind the route's precheck. Missing papers are left to the
-- foreign key (NULL comparison never fires the trigger).
CREATE TRIGGER study_paper_subject_match BEFORE INSERT ON study_materials
  WHEN NEW.paper_id IS NOT NULL
  AND (SELECT subject_id FROM papers WHERE id = NEW.paper_id) <> NEW.subject_id
  BEGIN SELECT RAISE(ABORT, 'study paper must belong to the study subject'); END;
CREATE TRIGGER study_paper_subject_match_update BEFORE UPDATE OF subject_id, paper_id ON study_materials
  WHEN NEW.paper_id IS NOT NULL
  AND (SELECT subject_id FROM papers WHERE id = NEW.paper_id) <> NEW.subject_id
  BEGIN SELECT RAISE(ABORT, 'study paper must belong to the study subject'); END;
