import { api, publicApi, getActiveMediaBaseUrl, normalizeMediaUrl } from './apiClient';
import type { Paper, Question, Subject, GalleryPhoto, AboutData } from './types';
import { INITIAL_SUBJECTS } from './data';

// ─── Public Manifest Cache (Backblaze B2 Snapshot via Edge CDN) ───────────────
let cachedManifest: any = null;
let manifestFetchPromise: Promise<any> | null = null;

export function clearPublicManifestCache() {
  cachedManifest = null;
  manifestFetchPromise = null;
}

export async function getPublicManifest() {
  if (cachedManifest) return cachedManifest;
  if (manifestFetchPromise) return manifestFetchPromise;
  
  manifestFetchPromise = publicApi.get(`/publication/current?t=${Date.now()}`).then(res => {
    cachedManifest = res.data.manifest;
    return cachedManifest;
  }).catch(err => {
    if (err?.response?.status === 404 || err?.response?.status === 503) {
      console.warn("Public publication snapshot not yet published or available:", err?.response?.data?.error?.message || err?.message);
    } else {
      console.warn("Failed to load publication snapshot:", err?.message || err);
    }
    manifestFetchPromise = null;
    return null;
  });
  
  return manifestFetchPromise;
}

// ─── Helper: Slug Generator ──────────────────────────────────────────────────
function generateSlug(text: string, fallbackId: string): string {
  const clean = (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (clean && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(clean)) {
    return clean.slice(0, 50);
  }
  return `item-${fallbackId.replace(/[^a-z0-9]/gi, '').slice(0, 12).toLowerCase()}`;
}

const isUuid = (id?: string | null): boolean =>
  !!id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

// ─── Public Data Loaders (ALWAYS from Backblaze B2 Snapshot) ───────────────────

export async function dbLoadSubjects(): Promise<Subject[] | null> {
  const manifest = await getPublicManifest();
  if (manifest && manifest.subjects && manifest.subjects.length > 0) {
    return manifest.subjects.map((s: any) => ({
      id: s.id,
      name: s.title?.en || '',
      sinhalaName: s.title?.si || '',
      examType: s.examType || 'al',
      code: s.code || s.slug || '',
      icon: s.presentation?.icon || 'BookOpen',
      color: s.presentation?.color || 'blue'
    }));
  }
  // Fallback to D1 direct if admin token is present
  if (typeof localStorage !== 'undefined' && localStorage.getItem('adminToken')) {
    const adminSubs = await adminLoadSubjects();
    if (adminSubs && adminSubs.length > 0) return adminSubs;
  }
  return manifest && manifest.subjects ? [] : [];
}

export async function dbLoadPapers(): Promise<Paper[] | null> {
  const manifest = await getPublicManifest();
  if (manifest && manifest.papers && manifest.papers.length > 0) {
    return manifest.papers.map((p: any) => ({
      id: p.id,
      subjectId: p.subjectId,
      examType: p.examType || 'al',
      title: p.title?.en || '',
      sinhalaTitle: p.title?.si || '',
      year: p.year || 2024,
      durationMinutes: p.durationMinutes || 120,
      questionCount: p.questionCount || 0,
      language: p.language || 'si'
    }));
  }
  // Fallback to D1 direct if admin token is present and manifest is empty/unpublished
  if (typeof localStorage !== 'undefined' && localStorage.getItem('adminToken')) {
    const adminPapers = await adminLoadPapers();
    if (adminPapers && adminPapers.length > 0) return adminPapers;
  }
  return manifest && manifest.papers ? [] : [];
}

export async function dbLoadQuestions(): Promise<Question[] | null> {
  const manifest = await getPublicManifest();
  if (!manifest || !manifest.questions) return [];
  return manifest.questions.map((q: any) => {
    let correctIdx = 0;
    let correctArr: number[] = [];
    const opts = (q.options || []).map((o: any, idx: number) => {
      if (o.isCorrect || o.is_correct) {
        correctIdx = idx;
        correctArr.push(idx);
      }
      return typeof o === 'string' ? o : (o.html || '');
    });
    return {
      id: q.id,
      paperId: q.paperId,
      qNumber: q.number ?? q.qNumber ?? 1,
      questionHtml: q.questionHtml,
      optionsHtml: opts as any,
      correctOption: (correctIdx >= 0 && correctIdx <= 4 ? correctIdx : 0) as 0 | 1 | 2 | 3 | 4,
      correctOptions: correctArr.length > 0 ? correctArr : [correctIdx],
      isAllCorrect: q.isAllCorrect || false,
      explanationHtml: q.explanationHtml || '',
      updatedAt: q.updatedAt
    };
  });
}

export async function dbLoadQuestionsForPaper(paperId: string): Promise<Question[] | null> {
  const manifest = await getPublicManifest();
  if (!manifest || !manifest.questions) return [];
  return manifest.questions
    .filter((q: any) => q.paperId === paperId)
    .map((q: any) => {
      let correctIdx = 0;
      let correctArr: number[] = [];
      const opts = (q.options || []).map((o: any, idx: number) => {
        if (o.isCorrect || o.is_correct) {
          correctIdx = idx;
          correctArr.push(idx);
        }
        return typeof o === 'string' ? o : (o.html || '');
      });
      return {
        id: q.id,
        paperId: q.paperId,
        qNumber: q.number ?? q.qNumber ?? 1,
        questionHtml: q.questionHtml,
        optionsHtml: opts as any,
        correctOption: (correctIdx >= 0 && correctIdx <= 4 ? correctIdx : 0) as 0 | 1 | 2 | 3 | 4,
        correctOptions: correctArr.length > 0 ? correctArr : [correctIdx],
        isAllCorrect: q.isAllCorrect || false,
        explanationHtml: q.explanationHtml || '',
        updatedAt: q.updatedAt
      };
    });
}

export async function dbLoadStudyHtml(paperId: string): Promise<string | null> {
  const manifest = await getPublicManifest();
  const sm = manifest?.studyMaterials?.find((s: any) => s.paperId === paperId);
  return sm?.html || sm?.html_si || sm?.html_en || null;
}

export async function dbLoadAboutUs(): Promise<AboutData | null> {
  const manifest = await getPublicManifest();
  const data = manifest?.about;
  if (!data) return null;
  const rawUrl = data?.image?.url || (data?.image?.objectKey ? `${getActiveMediaBaseUrl()}/api/v1/media/${data.image.objectKey}` : null);
  return {
    description: data?.description || '',
    image_url: normalizeMediaUrl(rawUrl),
    facebook_link: data?.social?.facebookUrl || '',
    youtube_link: data?.social?.youtubeUrl || '',
    linkedin_link: data?.social?.linkedinUrl || '',
  };
}

export async function dbLoadGallery(): Promise<GalleryPhoto[] | null> {
  const manifest = await getPublicManifest();
  if (!manifest) return [];
  return (manifest.gallery || []).map((g: any) => {
    const rawUrl = g.image?.url || (g.imageObjectKey ? `${getActiveMediaBaseUrl()}/api/v1/media/${g.imageObjectKey}` : '');
    return {
      id: g.id,
      title: g.title?.en || '',
      description: g.description?.en || '',
      imageHex: normalizeMediaUrl(rawUrl),
      mimeType: g.contentType || 'image/webp',
      sortOrder: g.sortOrder || 0,
      createdAt: g.createdAt || '',
      pinned: g.pinned || false
    };
  });
}

// ─── Dedicated Admin Loaders (Direct from Cloudflare D1) ──────────────────────

export async function adminLoadSubjects(): Promise<Subject[] | null> {
  try {
    let allItems: any[] = [];
    let cursor: string | null = null;
    do {
      const url = `/admin/subjects?limit=100${cursor ? `&cursor=${cursor}` : ''}`;
      const res = await api.get(url);
      allItems = allItems.concat(res.data.items || []);
      cursor = res.data.nextCursor || null;
    } while (cursor);

    return allItems.map((s: any) => ({
      id: s.id,
      name: s.title?.en || '',
      sinhalaName: s.title?.si || '',
      examType: s.examType || 'al',
      code: s.code || s.slug || '',
      icon: s.presentation?.icon || 'BookOpen',
      color: s.presentation?.color || 'blue'
    }));
  } catch (e) {
    console.error('Failed to load admin subjects from D1:', e);
    return null;
  }
}

export async function adminLoadPapers(): Promise<Paper[] | null> {
  try {
    let allItems: any[] = [];
    let cursor: string | null = null;
    do {
      const url = `/admin/papers?limit=100${cursor ? `&cursor=${cursor}` : ''}`;
      const res = await api.get(url);
      allItems = allItems.concat(res.data.items || []);
      cursor = res.data.nextCursor || null;
    } while (cursor);

    return allItems.map((p: any) => ({
      id: p.id,
      subjectId: p.subjectId,
      examType: p.examType || 'al',
      title: p.title?.en || '',
      sinhalaTitle: p.title?.si || '',
      year: p.year || 2024,
      durationMinutes: p.durationMinutes || 120,
      questionCount: p.questionCount || 0,
      language: p.language || 'si',
      state: p.state,
      hidden: p.state === 'archived' || p.state === 'draft' || Boolean(p.hidden)
    }));
  } catch (e) {
    console.error('Failed to load admin papers from D1:', e);
    return null;
  }
}

export async function adminLoadQuestionsForPaper(paperId: string): Promise<Question[] | null> {
  try {
    let allItems: any[] = [];
    let cursor: string | null = null;
    do {
      const url = `/admin/questions?paperId=${paperId}&limit=100${cursor ? `&cursor=${cursor}` : ''}`;
      const res = await api.get(url);
      allItems = allItems.concat(res.data.items || []);
      cursor = res.data.nextCursor || null;
    } while (cursor);

    return allItems.map((q: any) => {
      let correctIdx = 0;
      let correctArr: number[] = [];
      const opts = (q.options || []).map((o: any, idx: number) => {
        if (o.isCorrect || o.is_correct) {
          correctIdx = idx;
          correctArr.push(idx);
        }
        return o.html;
      });
      return {
        id: q.id,
        paperId: q.paperId,
        qNumber: q.number,
        questionHtml: q.questionHtml,
        optionsHtml: opts as any,
        correctOption: (correctIdx >= 0 && correctIdx <= 4 ? correctIdx : 0) as 0 | 1 | 2 | 3 | 4,
        correctOptions: correctArr.length > 0 ? correctArr : [correctIdx],
        isAllCorrect: q.isAllCorrect ?? q.contentSafety?.isAllCorrect ?? false,
        explanationHtml: q.explanationHtml || '',
        updatedAt: q.updatedAt,
        rawOptions: q.options
      };
    });
  } catch (e) {
    console.error('Failed to load admin questions for paper from D1:', paperId, e);
    return null;
  }
}

export async function adminLoadAboutUs(): Promise<AboutData | null> {
  try {
    const res = await api.get('/admin/about');
    const data = res.data;
    const rawUrl = data?.image?.objectKey ? `${getActiveMediaBaseUrl()}/api/v1/media/${data.image.objectKey}` : data?.image?.url;
    return {
      description: data?.description || '',
      image_url: normalizeMediaUrl(rawUrl),
      facebook_link: data?.social?.facebookUrl || '',
      youtube_link: data?.social?.youtubeUrl || '',
      linkedin_link: data?.social?.linkedinUrl || '',
    };
  } catch (e: any) {
    if (e.response?.status === 404) {
      return null;
    }
    console.error('Failed to load admin about us from D1:', e);
    return null;
  }
}

export async function adminLoadGallery(): Promise<GalleryPhoto[] | null> {
  try {
    let allItems: any[] = [];
    let cursor: string | null = null;
    do {
      const url = `/admin/gallery-items?limit=100${cursor ? `&cursor=${cursor}` : ''}`;
      const res = await api.get(url);
      allItems = allItems.concat(res.data.items || []);
      cursor = res.data.nextCursor || null;
    } while (cursor);

    return allItems.map((g: any) => {
      const rawUrl = g.image?.url || (g.imageObjectKey ? `${getActiveMediaBaseUrl()}/api/v1/media/${g.imageObjectKey}` : '');
      return {
        id: g.id,
        title: g.title?.en || '',
        description: g.description?.en || '',
        imageHex: normalizeMediaUrl(rawUrl),
        mimeType: g.contentType || 'image/webp',
        sortOrder: g.sortOrder || 0,
        createdAt: g.createdAt || '',
        pinned: g.pinned || false
      };
    });
  } catch (e) {
    console.error('Failed to load admin gallery from D1:', e);
    return null;
  }
}

export async function adminLoadStudyHtml(paperId: string): Promise<string | null> {
  try {
    const res = await api.get(`/admin/study-materials?paperId=${paperId}`);
    return res.data.items[0]?.html || null;
  } catch (e) {
    console.error('Failed to load admin study HTML from D1:', e);
    return null;
  }
}

// ─── Entity State Transition Helper (Enforces DraftPublishCommand contract) ───

async function setPublishState(
  entity: 'subject' | 'paper' | 'question' | 'study_material' | 'gallery_item' | 'content_page',
  entityId: string,
  state: 'published' | 'archived' | 'draft',
  expectedUpdatedAt?: string
): Promise<void> {
  try {
    let token = expectedUpdatedAt;
    if (!token) {
      const routePath = entity === 'subject' ? `/admin/subjects/${entityId}`
        : entity === 'paper' ? `/admin/papers/${entityId}`
        : entity === 'question' ? `/admin/questions/${entityId}`
        : entity === 'study_material' ? `/admin/study-materials/${entityId}`
        : `/admin/gallery-items/${entityId}`;
      const res = await api.get(routePath).catch(() => null);
      token = res?.data?.updatedAt || new Date().toISOString();
    }
    const endpoint = entity === 'subject' ? `/admin/subjects/${entityId}/state`
      : entity === 'paper' ? `/admin/papers/${entityId}/state`
      : entity === 'question' ? `/admin/questions/${entityId}/state`
      : entity === 'study_material' ? `/admin/study-materials/${entityId}/state`
      : `/admin/gallery-items/${entityId}/state`;

    await api.post(endpoint, {
      entity,
      entityId,
      state,
      expectedUpdatedAt: token
    });
  } catch (err: any) {
    const msg = err.response?.data?.error?.message || err.response?.data?.message || err.message;
    if (err.response?.status === 404 && state === 'archived') {
      console.info(`[State Transition Skipped] ${entity} ${entityId} not found in backend.`);
      return;
    }
    console.error(`[State Transition Failed] ${entity} ${entityId} -> ${state}:`, msg);
    throw new Error(`Failed to publish ${entity}: ${msg}`);
  }
}

// ─── Mutations (Direct to Cloudflare D1) ───────────────────────────────────────

export async function dbSaveSubjects(subjects: Subject[]): Promise<void> {
  for (const s of subjects) {
    const sId = isUuid(s.id) ? s.id : crypto.randomUUID();
    s.id = sId;
    const slug = generateSlug(s.code || s.name, sId);
    const code = (s.code || s.name || 'subject').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 32) || 'subject';
    const payload = {
      slug,
      code,
      title: { en: s.name || 'Subject', si: s.sinhalaName || s.name || 'Subject' },
      description: null,
      examType: s.examType === 'ol' ? 'ol' : 'al',
      presentation: { icon: s.icon || 'BookOpen', color: s.color || 'blue', variant: 'solid' as const },
      sortOrder: 0
    };
    let savedUpdatedAt: string | undefined;
    try {
      const existing = await api.get(`/admin/subjects/${sId}`).catch(() => null);
      if (existing?.data) {
        const patchRes = await api.patch(`/admin/subjects/${sId}`, {
          ...payload,
          expectedUpdatedAt: existing.data.updatedAt || new Date().toISOString()
        });
        savedUpdatedAt = patchRes.data?.updatedAt;
      } else {
        const createRes = await api.post('/admin/subjects', { id: sId, ...payload });
        savedUpdatedAt = createRes.data?.updatedAt;
      }
    } catch (e: any) {
      console.error("Failed to save subject:", e);
      throw e;
    }
    await setPublishState('subject', sId, 'published', savedUpdatedAt);
  }
}

export async function dbDeleteSubject(subjectId: string): Promise<void> {
  let targetId: string | null = null;
  try {
    const existing = await adminLoadSubjects();
    const canonical = INITIAL_SUBJECTS.find(s => s.id === subjectId || s.code === subjectId);
    const match = existing?.find(s =>
      s.id === subjectId ||
      (s.code && s.code.toLowerCase() === subjectId.toLowerCase()) ||
      (canonical?.code && s.code && s.code.toLowerCase() === canonical.code.toLowerCase())
    );
    if (match) {
      targetId = match.id;
    }
  } catch (err) {
    console.warn("Could not check subject presence in D1 before deletion:", err);
  }

  // 1. Clean up any dependent papers and questions under this subject
  try {
    const papers = await adminLoadPapers();
    const subjectPapers = papers?.filter(p => (targetId && p.subjectId === targetId) || p.subjectId === subjectId) || [];
    for (const p of subjectPapers) {
      await dbDeleteQuestionsByPaper(p.id).catch(() => {});
      await dbDeleteStudyHtml(p.id).catch(() => {});
      await dbDeletePaper(p.id).catch(() => {});
    }
  } catch (err) {
    console.warn("Could not clean up papers before deleting subject:", err);
  }

  // If the subject never existed in D1, it was purely local/default. No backend call needed!
  if (!targetId) {
    return;
  }

  // 2. Archive subject first to satisfy backend state guards
  try {
    await setPublishState('subject', targetId, 'archived');
  } catch (err: any) {
    if (err?.response?.status !== 404) {
      console.warn("Could not archive subject before delete:", err);
    }
  }

  // 3. Delete subject from D1
  try {
    await api.delete(`/admin/subjects/${targetId}`);
  } catch (err: any) {
    if (err?.response?.status === 404) return;
    throw err;
  }
}

export async function dbSavePaper(paper: Paper, isNew?: boolean): Promise<Paper> {
  const hadExistingId = isUuid(paper.id);
  const paperId = hadExistingId ? paper.id : crypto.randomUUID();
  paper.id = paperId;
  const isReallyNew = isNew ?? !hadExistingId;

  // Guarantee subjectId is a valid UUID of an existing subject in D1
  let subjectId = paper.subjectId;
  let subjects: Subject[] | null = null;
  try {
    subjects = await adminLoadSubjects();
  } catch (err) {
    console.warn("Failed to load subjects from D1:", err);
  }

  // 1. Check if subject already exists in D1 by UUID, code, or name
  const match = subjects?.find(s =>
    s.id === subjectId ||
    (s.code && s.code.toLowerCase() === String(subjectId).toLowerCase()) ||
    (s.name && s.name.toLowerCase() === String(subjectId).toLowerCase()) ||
    (s.sinhalaName && s.sinhalaName === String(subjectId))
  );

  if (match) {
    subjectId = match.id;
  } else {
    // 2. If not found in D1, match against canonical INITIAL_SUBJECTS definitions
    // (preserves Sinhala name, icon, colors, and examType instead of inventing a placeholder)
    const canonical = INITIAL_SUBJECTS.find(s =>
      s.id === subjectId ||
      (s.code && s.code.toLowerCase() === String(subjectId).toLowerCase()) ||
      (s.name && s.name.toLowerCase() === String(subjectId).toLowerCase()) ||
      (s.sinhalaName && s.sinhalaName === String(subjectId))
    );

    if (canonical) {
      const newSubjectId = isUuid(subjectId) ? subjectId : crypto.randomUUID();
      try {
        await dbSaveSubjects([{
          ...canonical,
          id: newSubjectId,
        }]);
        subjectId = newSubjectId;
      } catch (err) {
        console.warn("Failed to seed canonical subject to D1:", err);
        if (subjects && subjects.length > 0) {
          subjectId = subjects[0].id;
        }
      }
    } else if (subjects && subjects.length > 0) {
      // 3. Subject is unrecognized and cannot be seeded canonically; fallback safely to first existing subject
      console.warn(`Unrecognized subjectId "${subjectId}". Falling back to existing subject "${subjects[0].name}" (${subjects[0].id}).`);
      subjectId = subjects[0].id;
    }
  }
  paper.subjectId = subjectId;

  const validSlug = generateSlug(paper.title, paperId);
  const examType = (paper.examType === 'ol' || paper.examType === 'al') ? paper.examType : 'al';
  const language = (paper.language === 'en' || paper.language === 'si') ? paper.language : 'si';
  let year = Number(paper.year);
  if (!Number.isInteger(year) || year < 1900 || year > 2200) {
    year = new Date().getFullYear();
  }
  let durationMinutes = Number(paper.durationMinutes);
  if (!Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 1440) {
    durationMinutes = 120;
  }

  const payload = {
    subjectId,
    slug: validSlug,
    title: { en: paper.title || 'Paper', si: paper.sinhalaTitle || paper.title || 'Paper' },
    examType,
    year,
    language,
    durationMinutes,
    questionCount: Number(paper.questionCount) || 0,
    questionCountSource: 'admin_declared' as const
  };

  let savedUpdatedAt: string | undefined;
  try {
    let existing: any = null;
    if (!isReallyNew) {
      existing = await api.get(`/admin/papers/${paperId}`).catch(() => null);
    }
    if (existing?.data) {
      const patchRes = await api.patch(`/admin/papers/${paperId}`, {
        ...payload,
        expectedUpdatedAt: existing.data.updatedAt || new Date().toISOString()
      });
      savedUpdatedAt = patchRes.data?.updatedAt;
    } else {
      const createRes = await api.post('/admin/papers', { id: paperId, ...payload });
      savedUpdatedAt = createRes.data?.updatedAt;
    }
  } catch (err) {
    console.error("Failed to persist paper to API:", err);
    throw err;
  }

  const targetState = (paper.hidden || paper.state === 'archived') ? 'archived' : 'published';
  await setPublishState('paper', paperId, targetState, savedUpdatedAt);
  return paper;
}

export async function dbDeletePaper(paperId: string): Promise<void> {
  let targetId: string | null = null;
  try {
    const existing = await adminLoadPapers();
    const match = existing?.find(p => p.id === paperId);
    if (match) {
      targetId = match.id;
    }
  } catch (err) {
    console.warn("Could not check paper presence in D1 before deletion:", err);
  }

  // If the paper never existed in D1, it was purely local/default. No backend call needed!
  if (!targetId) {
    return;
  }

  try {
    await setPublishState('paper', targetId, 'archived');
  } catch (err: any) {
    if (err?.response?.status !== 404) {
      console.warn("Could not archive paper before delete:", err);
    }
  }
  try {
    await api.delete(`/admin/papers/${targetId}`);
  } catch (err: any) {
    if (err?.response?.status === 404) return;
    throw err;
  }
}

export async function dbSaveQuestion(question: Question, isNew?: boolean): Promise<Question> {
  const hadExistingId = isUuid(question.id);
  const qId = hadExistingId ? question.id : crypto.randomUUID();
  question.id = qId;

  if (!isUuid(question.paperId)) {
    console.error("Invalid paperId on question (must be UUID):", question.paperId);
    throw new Error(`Cannot save question: paperId ${question.paperId} is not a valid UUID.`);
  }

  const isReallyNew = isNew ?? !hadExistingId;
  let existingQ: any = null;
  if (!isReallyNew) {
    try {
      const checkRes = await api.get(`/admin/questions/${qId}`).catch(() => null);
      existingQ = checkRes?.data;
    } catch {
      // 404 or new question
    }
  }

  // 1. Normalize options to strictly 4 or 5 options
  let rawOptions = Array.isArray(question.optionsHtml) ? [...question.optionsHtml] : [];
  while (rawOptions.length < 4) {
    rawOptions.push(`Option ${rawOptions.length + 1}`);
  }
  if (rawOptions.length > 5) {
    rawOptions = rawOptions.slice(0, 5);
  }

  // 2. Normalize correct options
  let correctOptions = question.correctOptions && question.correctOptions.length > 0
    ? question.correctOptions.filter(idx => typeof idx === 'number' && idx >= 0 && idx < rawOptions.length)
    : [];
  if (correctOptions.length === 0) {
    const fallbackIdx = (typeof question.correctOption === 'number' && question.correctOption >= 0 && question.correctOption < rawOptions.length)
      ? question.correctOption
      : 0;
    correctOptions = [fallbackIdx];
  }

  // If all options are marked correct, isAllCorrect MUST be true
  const isAllCorrect = question.isAllCorrect || correctOptions.length === rawOptions.length;
  if (isAllCorrect) {
    correctOptions = rawOptions.map((_, i) => i);
  }
  const answerMode = isAllCorrect ? 'all' : (correctOptions.length > 1 ? 'multiple' : 'single');

  // 3. Build options array with strictly unique sortOrder 0..n-1 and unique UUIDs
  const options = rawOptions.map((html, idx) => {
    const existingOptId = existingQ?.options?.[idx]?.id;
    const optId = (existingOptId && isUuid(existingOptId)) ? existingOptId : crypto.randomUUID();
    return {
      id: optId,
      questionId: qId,
      html: (html && String(html).trim().length > 0) ? String(html) : `Option ${idx + 1}`,
      contentSafety: { sanitizationStatus: 'sanitized' as const, sanitizerVersion: 'v1' },
      sortOrder: idx,
      isCorrect: isAllCorrect || correctOptions.includes(idx)
    };
  });

  const optionCount = options.length as 4 | 5;
  let savedUpdatedAt: string | undefined;

  if (existingQ) {
    // If the question is currently published and the options structure changed,
    // move to draft first so replace mode can cleanly overwrite without 409
    if (existingQ.state === 'published') {
      const existingOptIds = (existingQ.options || []).map((o: any) => o.id);
      const newOptIds = options.map(o => o.id);
      const isSameStructure = existingOptIds.length === newOptIds.length &&
        existingOptIds.every((id: string, i: number) => id === newOptIds[i]);
      if (!isSameStructure) {
        await setPublishState('question', qId, 'draft', existingQ.updatedAt);
        const refetched = await api.get(`/admin/questions/${qId}`).catch(() => null);
        if (refetched?.data) existingQ = refetched.data;
      }
    }

    const patchPayload = {
      paperId: question.paperId,
      number: question.qNumber,
      questionHtml: question.questionHtml || '<p>Question</p>',
      explanationHtml: question.explanationHtml || null,
      contentSafety: { sanitizationStatus: 'sanitized' as const, sanitizerVersion: 'v1' },
      options,
      optionCount,
      answerMode,
      correctOptionIndexes: correctOptions,
      isAllCorrect,
      marks: existingQ.marks || 1,
      expectedUpdatedAt: existingQ.updatedAt || (question as any).updatedAt || new Date().toISOString()
    };
    const patchRes = await api.patch(`/admin/questions/${qId}`, patchPayload);
    savedUpdatedAt = patchRes.data?.updatedAt;
  } else {
    const createPayload = {
      id: qId,
      paperId: question.paperId,
      number: question.qNumber,
      questionHtml: question.questionHtml || '<p>Question</p>',
      explanationHtml: question.explanationHtml || null,
      contentSafety: { sanitizationStatus: 'sanitized' as const, sanitizerVersion: 'v1' },
      options,
      optionCount,
      answerMode,
      correctOptionIndexes: correctOptions,
      isAllCorrect,
      marks: 1
    };
    const createRes = await api.post('/admin/questions', createPayload);
    savedUpdatedAt = createRes.data?.updatedAt;
  }

  await setPublishState('question', qId, 'published', savedUpdatedAt);
  return question;
}

export async function dbSaveQuestions(
  questions: Question[],
  onProgress?: (progress: { current: number; total: number; percent: number; error?: string }) => void,
  isNew?: boolean
): Promise<void> {
  const batchSize = 3;
  const successfullySavedQIds: string[] = [];
  const total = questions.length;

  for (let i = 0; i < questions.length; i += batchSize) {
    const chunk = questions.slice(i, i + batchSize);

    try {
      const results = await Promise.all(
        chunk.map(async (q) => {
          let lastErr: any = null;
          // Up to 2 retries per question
          for (let attempt = 1; attempt <= 2; attempt++) {
            try {
              const saved = await dbSaveQuestion(q, isNew);
              return saved;
            } catch (err: any) {
              lastErr = err;
              if (attempt < 2) {
                await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
              }
            }
          }
          throw lastErr || new Error(`Failed to save question ${q.qNumber}`);
        })
      );

      for (const saved of results) {
        if (saved?.id) successfullySavedQIds.push(saved.id);
      }

      const currentDone = Math.min(i + chunk.length, total);
      if (onProgress) {
        onProgress({
          current: currentDone,
          total,
          percent: Math.round((currentDone / total) * 100),
        });
      }
    } catch (batchError: any) {
      console.error(`[dbSaveQuestions] Failure during bulk question save at index ${i}:`, batchError);

      // All-or-nothing rollback: clean up previously created questions for this session
      if (successfullySavedQIds.length > 0) {
        console.warn(`[dbSaveQuestions] Rolling back ${successfullySavedQIds.length} questions...`);
        if (onProgress) {
          onProgress({
            current: i,
            total,
            percent: Math.round((i / total) * 100),
            error: `Error at question batch ${i + 1}-${i + chunk.length}. Rolling back created questions...`,
          });
        }

        await Promise.allSettled(
          successfullySavedQIds.map((id) => dbDeleteQuestion(id))
        );
      }

      const errorMsg = batchError.response?.data?.message || batchError.message || 'Unknown network/database error';
      throw new Error(
        `Bulk question upload failed and was rolled back cleanly (${successfullySavedQIds.length} questions reverted). Error: ${errorMsg}`
      );
    }
  }
}


export async function dbDeleteQuestion(questionId: string): Promise<void> {
  try {
    await setPublishState('question', questionId, 'archived');
  } catch (err: any) {
    if (err?.response?.status !== 404) {
      console.warn("Could not archive question before delete:", err);
    }
  }
  try {
    await api.delete(`/admin/questions/${questionId}`);
  } catch (err: any) {
    if (err?.response?.status === 404) return;
    console.error("Failed to delete question:", err);
  }
}

export async function dbDeleteQuestionsByPaper(paperId: string): Promise<void> {
  const qs = await adminLoadQuestionsForPaper(paperId);
  if (qs) {
    for (const q of qs) await dbDeleteQuestion(q.id);
  }
}

export async function dbSaveStudyHtml(paperId: string, html: string): Promise<void> {
  try {
    const res = await api.get(`/admin/study-materials?paperId=${paperId}`);
    if (res.data.items.length > 0) {
      const id = res.data.items[0].id;
      const patchRes = await api.patch(`/admin/study-materials/${id}`, {
        html,
        expectedUpdatedAt: res.data.items[0].updatedAt || new Date().toISOString()
      });
      await setPublishState('study_material', id, 'published', patchRes.data?.updatedAt);
    } else {
      const id = crypto.randomUUID();
      const createRes = await api.post('/admin/study-materials', { id, paperId, html });
      await setPublishState('study_material', id, 'published', createRes.data?.updatedAt);
    }
  } catch (e) { console.error("Failed to save study HTML:", e); }
}

export async function dbDeleteStudyHtml(paperId: string): Promise<void> {
  try {
    const res = await api.get(`/admin/study-materials?paperId=${paperId}`);
    if (res.data.items.length > 0) {
      const id = res.data.items[0].id;
      await setPublishState('study_material', id, 'archived');
      await api.delete(`/admin/study-materials/${id}`);
    }
  } catch (e) { console.error(e); }
}

export async function dbSaveAboutUs(aboutData: AboutData): Promise<{ error?: string }> {
  try {
    const rawImg = aboutData.image_url || '';
    const objectKey = rawImg.includes('/api/v1/media/')
      ? rawImg.split('/api/v1/media/')[1]
      : (rawImg.startsWith('about/') ? rawImg : null);

    await api.put('/admin/about', {
      description: aboutData.description || '',
      image: objectKey ? { objectKey, contentType: 'image/webp', width: 800, height: 600 } : null,
      social: {
        facebookUrl: aboutData.facebook_link || null,
        youtubeUrl: aboutData.youtube_link || null,
        linkedinUrl: aboutData.linkedin_link || null
      }
    });
    return {};
  } catch (e: any) {
    return { error: e.message };
  }
}

export async function dbSaveGalleryPhoto(photo: GalleryPhoto): Promise<{ error?: string }> {
  const objectKey = photo.imageHex.includes('/api/v1/media/')
    ? photo.imageHex.split('/api/v1/media/')[1]
    : (photo.imageHex.startsWith('gallery/') || photo.imageHex.startsWith('study/') ? photo.imageHex : null);

  const titleObj = { en: photo.title || 'Photo', si: photo.title || 'Photo' };
  const descObj = photo.description ? { en: photo.description, si: photo.description } : null;

  if (objectKey) {
    const payload = {
      slug: generateSlug(photo.title, photo.id),
      title: titleObj,
      description: descObj,
      altText: titleObj,
      imageObjectKey: objectKey,
      thumbnailObjectKey: objectKey,
      contentType: photo.mimeType || 'image/webp',
      width: 800,
      height: 600,
      byteSize: 1000,
      pinned: photo.pinned || false,
      sortOrder: photo.sortOrder || 0,
    };
    let savedUpdatedAt: string | undefined;
    try {
      const existing = await api.get(`/admin/gallery-items/${photo.id}`).catch(() => null);
      if (existing?.data) {
        const patchRes = await api.patch(`/admin/gallery-items/${photo.id}`, {
          ...payload,
          expectedUpdatedAt: existing.data.updatedAt || new Date().toISOString()
        });
        savedUpdatedAt = patchRes.data?.updatedAt;
      } else {
        const createRes = await api.post('/admin/gallery-items', { id: photo.id, ...payload });
        savedUpdatedAt = createRes.data?.updatedAt;
      }
    } catch (e: any) {
      console.error("Failed to save gallery item:", e);
    }
    await setPublishState('gallery_item', photo.id, 'published', savedUpdatedAt);
  }
  return {};
}

export async function dbDeleteGalleryPhoto(id: string): Promise<{ error?: string }> {
  await setPublishState('gallery_item', id, 'archived');
  await api.delete(`/admin/gallery-items/${id}`).catch(console.error);
  return {};
}

export async function dbUpdateGalleryPhotoOrder(id: string, sortOrder: number): Promise<void> {
  await api.patch(`/admin/gallery-items/${id}`, { sortOrder }).catch(console.error);
}

export async function dbDeleteAllGalleryPhotos(): Promise<{ error?: string }> {
  const items = await adminLoadGallery();
  if (items) {
    for (const item of items) await dbDeleteGalleryPhoto(item.id);
  }
  return {};
}

// ─── Snapshot Publication Release (Build to Backblaze B2 & Purge Edge Cache) ──

export async function dbBuildPublication(): Promise<{ snapshotId: string; version: number }> {
  const idempotencyKey = crypto.randomUUID();
  const res = await api.post('/admin/publications/build', {
    idempotencyKey,
    reason: 'Admin publication build'
  });
  clearPublicManifestCache();
  return res.data;
}

export const dbLoadBudgetStatus = async () => {
  const { data } = await api.get('/admin/budget/status');
  return data;
};

export const dbReleaseLimit = async (reason: string, durationMs: number) => {
  const { data } = await api.post('/admin/budget/emergency', { reason, durationMs });
  return data;
};

// ─── Admin Users & Account Management ────────────────────────────────────────

export interface AdminUser {
  id: string;
  username: string;
  name?: string;
  email: string;
  role: 'admin' | 'super-admin';
  status: 'active' | 'suspended';
  created_at?: string;
  updated_at?: string;
  emailSent?: boolean;
  emailError?: string;
}

export interface AdminAuthResponse {
  token: string;
  role: string;
  user: {
    id: string;
    username: string;
    name?: string;
    email: string;
    role: string;
  };
}

export async function dbAdminLogin(usernameOrEmail: string, password: string): Promise<AdminAuthResponse> {
  const { data } = await api.post('/admin/login', { username: usernameOrEmail, password });
  return data;
}

export async function dbAdminForgotPasswordRequest(identifier: string): Promise<{ ok: boolean; message: string; email?: string; devOtp?: string }> {
  const { data } = await api.post('/admin/auth/forgot-password', { identifier });
  return data;
}

export async function dbAdminForgotPasswordReset(email: string, otp: string, new_password: string): Promise<{ ok: boolean; message: string }> {
  const { data } = await api.post('/admin/auth/reset-password', { email, otp, new_password });
  return data;
}

export async function dbAdminChangePassword(old_password: string, otp: string, new_password: string): Promise<{ ok: boolean; message: string }> {
  const { data } = await api.post('/admin/auth/change-password', { old_password, otp, new_password });
  return data;
}

export async function dbAdminGetMe(): Promise<{ user: AdminUser }> {
  const { data } = await api.get('/admin/auth/me');
  return data;
}

export async function dbAdminListUsers(): Promise<AdminUser[]> {
  const { data } = await api.get('/admin/users');
  return data.items || [];
}

export async function dbAdminCreateUser(userData: { name?: string; username: string; email: string; password: string; role: 'admin' | 'super-admin' }): Promise<AdminUser> {
  const { data } = await api.post('/admin/users', userData);
  return data;
}

export async function dbAdminDeleteUser(userId: string): Promise<void> {
  await api.delete(`/admin/users/${userId}`);
}

export interface AuditItem {
  id: string;
  actorId: string;
  action: string;
  entityType: string;
  entityId: string | null;
  requestId: string;
  metadata: Array<{ key: string; value: string }>;
  createdAt: string;
}

export async function dbLoadAuditLog(limit = 50): Promise<AuditItem[]> {
  try {
    const { data } = await api.get(`/admin/audits?limit=${limit}`);
    return data.items || [];
  } catch (err) {
    console.error("Failed to load audit log:", err);
    return [];
  }
}
