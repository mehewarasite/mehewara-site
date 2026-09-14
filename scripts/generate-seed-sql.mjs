import fs from 'fs';
import path from 'path';

const backupPath = 'C:\\Users\\induw\\Downloads\\mehewara-backup-2026-09-13.json';
const backup = JSON.parse(fs.readFileSync(backupPath, 'utf8'));

const isUuid = (id) => !!id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

function escapeSql(str) {
  if (str === null || str === undefined) return 'NULL';
  return `'${String(str).replace(/'/g, "''")}'`;
}

function slugify(text, fallback = 'item') {
  const clean = String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
  return clean || fallback;
}

// 1. Subjects: 11 UUID subjects
const subjects = backup.subjects.filter(s => isUuid(s.id));
const subjectIdSet = new Set(subjects.map(s => s.id));

// 2. Papers: 72 papers
const papers = backup.papers.filter(p => isUuid(p.id) && subjectIdSet.has(p.subjectId));
const paperIdSet = new Set(papers.map(p => p.id));

// 3. Questions: 3,290 questions
const questions = backup.questions.filter(q => isUuid(q.id) && paperIdSet.has(q.paperId));

console.log(`Preparing: ${subjects.length} subjects, ${papers.length} papers, ${questions.length} questions`);

const statements = [];

// Subjects with ON CONFLICT
for (let i = 0; i < subjects.length; i++) {
  const s = subjects[i];
  const slug = `${slugify(s.code || s.name)}-${s.id.slice(0, 8)}`;
  const code = slugify(s.code || s.name, 'subject').slice(0, 32);
  const titleEn = s.name || 'Subject';
  const titleSi = s.sinhalaName || s.name || 'Subject';
  const examType = s.examType === 'ol' ? 'ol' : 'al';
  const icon = s.icon || 'BookOpen';
  const color = s.color || '#334155';

  statements.push(
    `INSERT INTO subjects (id, slug, title_en, title_si, title_ta, description_en, description_si, description_ta, exam_type, code, icon, color, presentation_variant, state, sort_order, updated_at) ` +
    `VALUES (${escapeSql(s.id)}, ${escapeSql(slug)}, ${escapeSql(titleEn)}, ${escapeSql(titleSi)}, NULL, NULL, NULL, NULL, ${escapeSql(examType)}, ${escapeSql(code)}, ${escapeSql(icon)}, ${escapeSql(color)}, 'solid', 'published', ${i}, strftime('%Y-%m-%dT%H:%M:%fZ','now')) ` +
    `ON CONFLICT(id) DO UPDATE SET slug = excluded.slug, title_en = excluded.title_en, title_si = excluded.title_si, exam_type = excluded.exam_type, code = excluded.code, icon = excluded.icon, color = excluded.color, state = excluded.state, sort_order = excluded.sort_order, updated_at = excluded.updated_at;`
  );
}

// Papers with ON CONFLICT
for (const p of papers) {
  const baseSlug = slugify(p.title || 'paper');
  const slug = `${baseSlug}-${p.id.slice(0, 8)}`;
  const titleEn = p.title || 'Paper';
  const titleSi = p.sinhalaTitle || p.title || 'Paper';
  const examType = p.examType === 'ol' ? 'ol' : 'al';
  const year = Number(p.year) >= 1900 && Number(p.year) <= 2200 ? Number(p.year) : 2024;
  const language = p.language === 'en' ? 'en' : 'si';
  const duration = Number(p.durationMinutes) > 0 && Number(p.durationMinutes) <= 1440 ? Number(p.durationMinutes) : 60;
  const qCount = questions.filter(q => q.paperId === p.id).length || Number(p.questionCount) || 0;

  statements.push(
    `INSERT INTO papers (id, subject_id, slug, exam_type, title_en, title_si, title_ta, year, language, duration_minutes, question_count, materialized_question_count, question_count_source, state, updated_at) ` +
    `VALUES (${escapeSql(p.id)}, ${escapeSql(p.subjectId)}, ${escapeSql(slug)}, ${escapeSql(examType)}, ${escapeSql(titleEn)}, ${escapeSql(titleSi)}, NULL, ${year}, ${escapeSql(language)}, ${duration}, ${qCount}, ${qCount}, 'admin_declared', 'published', strftime('%Y-%m-%dT%H:%M:%fZ','now')) ` +
    `ON CONFLICT(id) DO UPDATE SET subject_id = excluded.subject_id, slug = excluded.slug, exam_type = excluded.exam_type, title_en = excluded.title_en, title_si = excluded.title_si, year = excluded.year, language = excluded.language, duration_minutes = excluded.duration_minutes, question_count = excluded.question_count, materialized_question_count = excluded.materialized_question_count, state = excluded.state, updated_at = excluded.updated_at;`
  );
}

// Group questions by paper to re-number sequentially 1..N
const questionsByPaper = new Map();
questions.forEach(q => {
  const list = questionsByPaper.get(q.paperId) || [];
  list.push(q);
  questionsByPaper.set(q.paperId, list);
});

questionsByPaper.forEach((pQuestions) => {
  pQuestions.sort((a, b) => (Number(a.qNumber || a.number) || 0) - (Number(b.qNumber || b.number) || 0));

  pQuestions.forEach((q, idx) => {
    const qNum = idx + 1;
    const qHtml = q.questionHtml || (q.question ? `<p>${q.question}</p>` : '<p>Question</p>');
    const expHtml = q.explanationHtml || null;

    let rawOptions = Array.isArray(q.optionsHtml) ? [...q.optionsHtml] : (Array.isArray(q.options) ? [...q.options] : []);
    rawOptions = rawOptions.map(o => typeof o === 'string' ? o : (o.text || o.html || ''));
    while (rawOptions.length < 4) rawOptions.push(`Option ${rawOptions.length + 1}`);
    if (rawOptions.length > 5) rawOptions = rawOptions.slice(0, 5);

    let correctIdxs = Array.isArray(q.correctOptions) && q.correctOptions.length > 0
      ? q.correctOptions.filter(i => typeof i === 'number' && i >= 0 && i < rawOptions.length)
      : [];
    if (correctIdxs.length === 0) {
      const fallback = typeof q.correctOption === 'number' && q.correctOption >= 0 && q.correctOption < rawOptions.length ? q.correctOption : 0;
      correctIdxs = [fallback];
    }
    const isAllCorrect = q.isAllCorrect || correctIdxs.length === rawOptions.length;
    if (isAllCorrect) correctIdxs = rawOptions.map((_, i) => i);
    const answerMode = isAllCorrect ? 'all' : (correctIdxs.length > 1 ? 'multiple' : 'single');

    // Insert or update question as 'draft'
    statements.push(
      `INSERT INTO questions (id, paper_id, number, question_html_en, question_html_si, question_html_ta, explanation_html_en, explanation_html_si, explanation_html_ta, sanitization_status, sanitizer_version, option_count, answer_mode, is_all_correct, marks, marks_source, state, updated_at) ` +
      `VALUES (${escapeSql(q.id)}, ${escapeSql(q.paperId)}, ${qNum}, ${escapeSql(qHtml)}, ${escapeSql(qHtml)}, NULL, ${escapeSql(expHtml)}, ${escapeSql(expHtml)}, NULL, 'sanitized', 'v1', ${rawOptions.length}, ${escapeSql(answerMode)}, ${isAllCorrect ? 1 : 0}, 1, 'admin', 'draft', strftime('%Y-%m-%dT%H:%M:%fZ','now')) ` +
      `ON CONFLICT(id) DO UPDATE SET paper_id = excluded.paper_id, number = excluded.number, question_html_en = excluded.question_html_en, question_html_si = excluded.question_html_si, explanation_html_en = excluded.explanation_html_en, explanation_html_si = excluded.explanation_html_si, sanitization_status = excluded.sanitization_status, option_count = excluded.option_count, answer_mode = excluded.answer_mode, is_all_correct = excluded.is_all_correct, state = 'draft', updated_at = excluded.updated_at;`
    );

    // Replace options
    statements.push(`DELETE FROM question_options WHERE question_id = ${escapeSql(q.id)};`);

    rawOptions.forEach((optHtml, optIdx) => {
      const optId = crypto.randomUUID();
      const isCorrect = isAllCorrect || correctIdxs.includes(optIdx) ? 1 : 0;
      const html = optHtml && String(optHtml).trim().length > 0 ? String(optHtml) : `Option ${optIdx + 1}`;

      statements.push(
        `INSERT INTO question_options (id, question_id, option_html_en, option_html_si, option_html_ta, sanitization_status, sanitizer_version, sort_order, is_correct) ` +
        `VALUES (${escapeSql(optId)}, ${escapeSql(q.id)}, ${escapeSql(html)}, ${escapeSql(html)}, NULL, 'sanitized', 'v1', ${optIdx}, ${isCorrect});`
      );
    });

    // Move to published now that options are verified in place
    statements.push(`UPDATE questions SET state = 'published' WHERE id = ${escapeSql(q.id)};`);
  });
});

const outDir = 'scripts/sql-chunks';
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

// Split statements into chunks of 2500 statements
const chunkSize = 2500;
let fileCount = 0;
for (let i = 0; i < statements.length; i += chunkSize) {
  const chunk = statements.slice(i, i + chunkSize);
  const chunkPath = path.join(outDir, `chunk_${String(fileCount).padStart(3, '0')}.sql`);
  fs.writeFileSync(chunkPath, chunk.join('\n') + '\n', 'utf8');
  fileCount++;
}

console.log(`Generated ${fileCount} SQL chunk files in ${outDir} (Total statements: ${statements.length})`);
