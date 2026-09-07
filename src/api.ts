import { api, publicApi, isAdmin } from './apiClient';
import type { Paper, Question, Subject, GalleryPhoto, AboutData } from './types';

// Cache for public manifest to avoid redundant fetches
let cachedManifest: any = null;
let manifestFetchPromise: Promise<any> | null = null;

async function getPublicManifest() {
  if (cachedManifest) return cachedManifest;
  if (manifestFetchPromise) return manifestFetchPromise;
  
  manifestFetchPromise = publicApi.get('/publication/current').then(res => {
    cachedManifest = res.data.manifest;
    return cachedManifest;
  }).catch(err => {
    console.error("Failed to load publication", err);
    return null;
  });
  
  return manifestFetchPromise;
}

// ─── Subjects ────────────────────────────────────────────────────────────────

export async function dbLoadSubjects(): Promise<Subject[] | null> {
  if (isAdmin()) {
    try {
      const res = await api.get('/admin/subjects?limit=1000');
      return res.data.items.map((s: any) => ({
        id: s.id,
        name: s.title?.en || '',
        sinhalaName: s.title?.si || '',
        examType: s.examType || 'al',
        code: s.slug || '',
        icon: s.presentation?.icon || 'BookOpen',
        color: s.presentation?.color || 'blue'
      }));
    } catch (e) {
      console.error(e);
      return null;
    }
  } else {
    const manifest = await getPublicManifest();
    if (!manifest) return [];
    return manifest.subjects.map((s: any) => ({
      id: s.id,
      name: s.title?.en || '',
      sinhalaName: s.title?.si || '',
      examType: s.examType || 'al',
      code: s.slug || '',
      icon: s.presentation?.icon || 'BookOpen',
      color: s.presentation?.color || 'blue'
    }));
  }
}

export async function dbSaveSubjects(subjects: Subject[]): Promise<void> {
  for (const s of subjects) {
    const payload = {
      slug: s.code || s.name.toLowerCase().replace(/\\s+/g, '-'),
      title: { en: s.name, si: s.sinhalaName },
      examType: s.examType || 'al',
      presentation: { icon: s.icon || 'BookOpen', color: s.color || 'blue', variant: 'solid' },
      sortOrder: 0
    };
    try {
      await api.patch(`/admin/subjects/${s.id}`, payload);
    } catch (e: any) {
      if (e.response?.status === 404) {
        await api.post('/admin/subjects', { id: s.id, ...payload });
      } else {
        console.error("Failed to save subject", e);
      }
    }
    // Auto-publish
    await api.post(`/admin/subjects/${s.id}/state`, { state: 'published' }).catch(console.error);
  }
}

export async function dbDeleteSubject(subjectId: string): Promise<void> {
  await api.delete(`/admin/subjects/${subjectId}`).catch(console.error);
}

// ─── Papers ──────────────────────────────────────────────────────────────────

export async function dbLoadPapers(): Promise<Paper[] | null> {
  if (isAdmin()) {
    try {
      const res = await api.get('/admin/papers?limit=1000');
      return res.data.items.map((p: any) => ({
        id: p.id,
        subjectId: p.subjectId,
        examType: p.examType || 'al',
        title: p.title?.en || '',
        sinhalaTitle: p.title?.si || '',
        year: p.year || 2024,
        durationMinutes: p.durationMinutes || 120,
        questionCount: p.questionCount || 50,
        language: p.language || 'si'
      }));
    } catch (e) {
      console.error(e);
      return null;
    }
  } else {
    const manifest = await getPublicManifest();
    if (!manifest) return [];
    return manifest.papers.map((p: any) => ({
      id: p.id,
      subjectId: p.subjectId,
      examType: p.examType || 'al',
      title: p.title?.en || '',
      sinhalaTitle: p.title?.si || '',
      year: p.year || 2024,
      durationMinutes: p.durationMinutes || 120,
      questionCount: p.questionCount || 50,
      language: p.language || 'si'
    }));
  }
}

export async function dbSavePaper(paper: Paper): Promise<void> {
  const payload = {
    subjectId: paper.subjectId,
    slug: paper.title.toLowerCase().replace(/\\s+/g, '-'),
    title: { en: paper.title, si: paper.sinhalaTitle },
    examType: paper.examType,
    year: paper.year,
    language: paper.language || 'si',
    durationMinutes: paper.durationMinutes,
    questionCount: paper.questionCount
  };
  try {
    await api.patch(`/admin/papers/${paper.id}`, payload);
  } catch (e: any) {
    if (e.response?.status === 404) {
      await api.post('/admin/papers', { id: paper.id, ...payload });
    }
  }
  await api.post(`/admin/papers/${paper.id}/state`, { state: 'published' }).catch(console.error);
}

export async function dbDeletePaper(paperId: string): Promise<void> {
  await api.delete(`/admin/papers/${paperId}`).catch(console.error);
}

// ─── Questions ───────────────────────────────────────────────────────────────

export async function dbLoadQuestions(): Promise<Question[] | null> {
  // Not heavily used directly except for global caching, which we don't need in v2
  return [];
}

export async function dbLoadQuestionsForPaper(paperId: string): Promise<Question[] | null> {
  if (isAdmin()) {
    try {
      const res = await api.get(`/admin/questions?paperId=${paperId}&limit=500`);
      return res.data.items.map((q: any) => {
        let correctIdx = 0;
        let correctArr: number[] = [];
        const opts = (q.options || []).map((o: any, idx: number) => {
          if (o.isCorrect) { correctIdx = idx; correctArr.push(idx); }
          return o.html;
        });
        return {
          id: q.id,
          paperId: q.paperId,
          qNumber: q.number,
          questionHtml: q.questionHtml,
          optionsHtml: opts,
          correctOption: correctIdx,
          correctOptions: correctArr.length > 0 ? correctArr : [correctIdx],
          isAllCorrect: q.contentSafety?.isAllCorrect || false,
          explanationHtml: q.explanationHtml || ''
        };
      });
    } catch (e) {
      console.error(e);
      return [];
    }
  } else {
    const manifest = await getPublicManifest();
    if (!manifest) return [];
    return manifest.questions.filter((q: any) => q.paperId === paperId).map((q: any) => {
      let correctIdx = 0;
      let correctArr: number[] = [];
      const opts = (q.options || []).map((o: any, idx: number) => {
        if (o.isCorrect) { correctIdx = idx; correctArr.push(idx); }
        return o.html;
      });
      return {
        id: q.id,
        paperId: q.paperId,
        qNumber: q.number,
        questionHtml: q.questionHtml,
        optionsHtml: opts,
        correctOption: correctIdx,
        correctOptions: correctArr.length > 0 ? correctArr : [correctIdx],
        isAllCorrect: q.isAllCorrect || false,
        explanationHtml: q.explanationHtml || ''
      };
    });
  }
}

export async function dbSaveQuestion(question: Question): Promise<void> {
  const payload = {
    paperId: question.paperId,
    number: question.qNumber,
    questionHtml: question.questionHtml,
    explanationHtml: question.explanationHtml || '',
    options: question.optionsHtml.map((html, idx) => ({
      html,
      isCorrect: question.correctOptions ? question.correctOptions.includes(idx) : idx === question.correctOption
    }))
  };
  try {
    await api.patch(`/admin/questions/${question.id}`, payload);
  } catch (e: any) {
    if (e.response?.status === 404) {
      await api.post('/admin/questions', { id: question.id, ...payload });
    }
  }
  await api.post(`/admin/questions/${question.id}/state`, { state: 'published' }).catch(console.error);
}

export async function dbSaveQuestions(questions: Question[]): Promise<void> {
  for (const q of questions) {
    await dbSaveQuestion(q);
  }
}

export async function dbDeleteQuestion(questionId: string): Promise<void> {
  await api.delete(`/admin/questions/${questionId}`).catch(console.error);
}

export async function dbDeleteQuestionsByPaper(paperId: string): Promise<void> {
  // Need to fetch and delete individually in v2
  const qs = await dbLoadQuestionsForPaper(paperId);
  if (qs) {
    for (const q of qs) await dbDeleteQuestion(q.id);
  }
}

// ─── Study HTML ───────────────────────────────────────────────────────────────

export async function dbLoadStudyHtml(paperId: string): Promise<string | null> {
  if (isAdmin()) {
    try {
      const res = await api.get(`/admin/study-materials?paperId=${paperId}`);
      return res.data.items[0]?.html || null;
    } catch { return null; }
  } else {
    const manifest = await getPublicManifest();
    const sm = manifest?.studyMaterials?.find((s: any) => s.paperId === paperId);
    return sm?.html || null;
  }
}

export async function dbSaveStudyHtml(paperId: string, html: string): Promise<void> {
  try {
    const res = await api.get(`/admin/study-materials?paperId=${paperId}`);
    if (res.data.items.length > 0) {
      const id = res.data.items[0].id;
      await api.patch(`/admin/study-materials/${id}`, { html });
      await api.post(`/admin/study-materials/${id}/state`, { state: 'published' });
    } else {
      const id = crypto.randomUUID();
      await api.post('/admin/study-materials', { id, paperId, html });
      await api.post(`/admin/study-materials/${id}/state`, { state: 'published' });
    }
  } catch (e) { console.error(e); }
}

export async function dbDeleteStudyHtml(paperId: string): Promise<void> {
  try {
    const res = await api.get(`/admin/study-materials?paperId=${paperId}`);
    if (res.data.items.length > 0) {
      await api.delete(`/admin/study-materials/${res.data.items[0].id}`);
    }
  } catch (e) { console.error(e); }
}

// ─── About Us ────────────────────────────────────────────────────────────────

export async function dbLoadAboutUs(): Promise<AboutData | null> {
  if (isAdmin()) {
    try {
      const res = await api.get('/admin/about');
      const data = res.data;
      return {
        description: data.description,
        image_url: data.image?.url,
        facebook_link: data.social?.facebookUrl,
        youtube_link: data.social?.youtubeUrl,
        linkedin_link: data.social?.linkedinUrl,
      };
    } catch { return null; }
  } else {
    const manifest = await getPublicManifest();
    const data = manifest?.about;
    if (!data) return null;
    return {
      description: data.description,
      image_url: data.image?.url,
      facebook_link: data.social?.facebookUrl,
      youtube_link: data.social?.youtubeUrl,
      linkedin_link: data.social?.linkedinUrl,
    };
  }
}

export async function dbSaveAboutUs(aboutData: AboutData): Promise<{ error?: string }> {
  try {
    await api.put('/admin/about', {
      description: aboutData.description || '',
      image: aboutData.image_url ? { kind: 'image', url: aboutData.image_url, contentType: 'image/jpeg' } : undefined,
      social: {
        facebookUrl: aboutData.facebook_link || '',
        youtubeUrl: aboutData.youtube_link || '',
        linkedinUrl: aboutData.linkedin_link || ''
      }
    });
    return {};
  } catch (e: any) {
    return { error: e.message };
  }
}

// ─── Gallery ──────────────────────────────────────────────────────────────────

export async function dbLoadGallery(): Promise<GalleryPhoto[] | null> {
  if (isAdmin()) {
    try {
      const res = await api.get('/admin/gallery-items?limit=1000');
      return res.data.items.map((g: any) => ({
        id: g.id,
        title: g.title?.en || '',
        description: g.description?.en || '',
        imageHex: g.image?.url || '', // Hex acts as URL now
        mimeType: g.contentType || 'image/jpeg',
        sortOrder: g.sortOrder || 0,
        createdAt: g.createdAt || '',
        pinned: g.pinned || false
      }));
    } catch { return null; }
  } else {
    const manifest = await getPublicManifest();
    if (!manifest) return [];
    return manifest.gallery.map((g: any) => ({
      id: g.id,
      title: g.title?.en || '',
      description: g.description?.en || '',
      imageHex: g.image?.url || '',
      mimeType: g.contentType || 'image/jpeg',
      sortOrder: g.sortOrder || 0,
      createdAt: g.createdAt || '',
      pinned: g.pinned || false
    }));
  }
}

export async function dbSaveGalleryPhoto(photo: GalleryPhoto): Promise<{ error?: string }> {
  const payload = {
    slug: photo.id, // Using id as slug
    title: { en: photo.title || 'Photo', si: photo.title || 'Photo' },
    description: { en: photo.description || '', si: photo.description || '' },
    contentType: photo.mimeType,
    pinned: photo.pinned || false,
    sortOrder: photo.sortOrder || 0,
    // The actual image bytes must be uploaded separately. If imageHex is a URL, we preserve it.
    image: photo.imageHex.startsWith('http') ? { kind: 'image', url: photo.imageHex, contentType: photo.mimeType } : undefined
  };
  try {
    await api.patch(`/admin/gallery-items/${photo.id}`, payload);
  } catch (e: any) {
    if (e.response?.status === 404) {
      await api.post('/admin/gallery-items', { id: photo.id, ...payload });
    }
  }
  await api.post(`/admin/gallery-items/${photo.id}/state`, { state: 'published' }).catch(console.error);
  return {};
}

export async function dbDeleteGalleryPhoto(id: string): Promise<{ error?: string }> {
  await api.delete(`/admin/gallery-items/${id}`).catch(console.error);
  return {};
}

export async function dbUpdateGalleryPhotoOrder(id: string, sortOrder: number): Promise<void> {
  await api.patch(`/admin/gallery-items/${id}`, { sortOrder }).catch(console.error);
}

export async function dbDeleteAllGalleryPhotos(): Promise<{ error?: string }> {
  const items = await dbLoadGallery();
  if (items) {
    for (const item of items) await dbDeleteGalleryPhoto(item.id);
  }
  return {};
}

export const dbLoadBudgetStatus = async () => {
  const { data } = await api.get('/admin/budget/status');
  return data;
};

export const dbReleaseLimit = async (reason: string, durationMs: number) => {
  const { data } = await api.post('/admin/budget/emergency', { reason, durationMs });
  return data;
};
