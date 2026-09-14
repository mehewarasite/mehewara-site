import { api, publicApi, isAdmin, getActiveMediaBaseUrl, normalizeMediaUrl } from './apiClient';
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
        code: s.slug || '',
        icon: s.presentation?.icon || 'BookOpen',
        color: s.presentation?.color || 'blue'
      }));
    } catch (e) {
      console.error('Failed to load admin subjects:', e);
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
      slug: s.code || s.name.toLowerCase().replace(/\s+/g, '-'),
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
  await api.post(`/admin/subjects/${subjectId}/state`, { state: 'archived' }).catch(() => {});
  await api.delete(`/admin/subjects/${subjectId}`).catch(console.error);
}

// ─── Papers ──────────────────────────────────────────────────────────────────

export async function dbLoadPapers(): Promise<Paper[] | null> {
  if (isAdmin()) {
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
        questionCount: p.questionCount || 50,
        language: p.language || 'si'
      }));
    } catch (e) {
      console.error('Failed to load admin papers:', e);
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
    slug: paper.title.toLowerCase().replace(/\s+/g, '-'),
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
  await api.post(`/admin/papers/${paperId}/state`, { state: 'archived' }).catch(() => {});
  await api.delete(`/admin/papers/${paperId}`).catch(console.error);
}

// ─── Questions ───────────────────────────────────────────────────────────────

export async function dbLoadQuestions(): Promise<Question[] | null> {
  const manifest = await getPublicManifest();
  if (!manifest || !manifest.questions) return [];
  return manifest.questions.map((q: any) => {
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
  if (isAdmin()) {
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
          if (o.isCorrect) { correctIdx = idx; correctArr.push(idx); }
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
      console.error('Failed to load questions for paper from admin API:', paperId, e);
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
          optionsHtml: opts as any,
          correctOption: (correctIdx >= 0 && correctIdx <= 4 ? correctIdx : 0) as 0 | 1 | 2 | 3 | 4,
          correctOptions: correctArr.length > 0 ? correctArr : [correctIdx],
          isAllCorrect: q.isAllCorrect || false,
          explanationHtml: q.explanationHtml || '',
          updatedAt: q.updatedAt
        };
      });
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
        optionsHtml: opts as any,
        correctOption: (correctIdx >= 0 && correctIdx <= 4 ? correctIdx : 0) as 0 | 1 | 2 | 3 | 4,
        correctOptions: correctArr.length > 0 ? correctArr : [correctIdx],
        isAllCorrect: q.isAllCorrect || false,
        explanationHtml: q.explanationHtml || '',
        updatedAt: q.updatedAt
      };
    });
  }
}

export async function dbSaveQuestion(question: Question): Promise<void> {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const qId = isUuid.test(question.id) ? question.id : crypto.randomUUID();
  question.id = qId;

  let existingQ: any = null;
  try {
    const checkRes = await api.get(`/admin/questions/${qId}`);
    existingQ = checkRes.data;
  } catch {
    // 404 or new question
  }

  const isAllCorrect = question.isAllCorrect || false;
  const correctOptions = question.correctOptions && question.correctOptions.length > 0
    ? question.correctOptions
    : [question.correctOption ?? 0];
  const answerMode = isAllCorrect ? 'all' : (correctOptions.length > 1 ? 'multiple' : 'single');

  const options = question.optionsHtml.map((html, idx) => {
    const existingOptId = existingQ?.options?.[idx]?.id;
    const optId = (existingOptId && isUuid.test(existingOptId)) ? existingOptId : crypto.randomUUID();
    return {
      id: optId,
      questionId: qId,
      html,
      contentSafety: { sanitizationStatus: 'sanitized' as const, sanitizerVersion: 'v1' },
      sortOrder: idx,
      isCorrect: isAllCorrect || correctOptions.includes(idx)
    };
  });

  const optionCount = options.length as 4 | 5;

  if (existingQ) {
    const patchPayload = {
      paperId: question.paperId,
      number: question.qNumber,
      questionHtml: question.questionHtml,
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
    await api.patch(`/admin/questions/${qId}`, patchPayload);
  } else {
    const createPayload = {
      id: qId,
      paperId: question.paperId,
      number: question.qNumber,
      questionHtml: question.questionHtml,
      explanationHtml: question.explanationHtml || null,
      contentSafety: { sanitizationStatus: 'sanitized' as const, sanitizerVersion: 'v1' },
      options,
      optionCount,
      answerMode,
      correctOptionIndexes: correctOptions,
      isAllCorrect,
      marks: 1
    };
    await api.post('/admin/questions', createPayload);
  }

  await api.post(`/admin/questions/${qId}/state`, { state: 'published' }).catch(console.error);
}

export async function dbSaveQuestions(questions: Question[]): Promise<void> {
  for (const q of questions) {
    await dbSaveQuestion(q);
  }
}

export async function dbDeleteQuestion(questionId: string): Promise<void> {
  await api.post(`/admin/questions/${questionId}/state`, { state: 'archived' }).catch(() => {});
  await api.delete(`/admin/questions/${questionId}`).catch(console.error);
}

export async function dbDeleteQuestionsByPaper(paperId: string): Promise<void> {
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
      const rawUrl = data?.image?.objectKey ? `${getActiveMediaBaseUrl()}/api/v1/media/${data.image.objectKey}` : data?.image?.url;
      return {
        description: data?.description || '',
        image_url: normalizeMediaUrl(rawUrl),
        facebook_link: data?.social?.facebookUrl || '',
        youtube_link: data?.social?.youtubeUrl || '',
        linkedin_link: data?.social?.linkedinUrl || '',
      };
    } catch { return null; }
  } else {
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

// ─── Gallery ──────────────────────────────────────────────────────────────────

export async function dbLoadGallery(): Promise<GalleryPhoto[] | null> {
  if (isAdmin()) {
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
    } catch { return null; }
  } else {
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
}

export async function dbSaveGalleryPhoto(photo: GalleryPhoto): Promise<{ error?: string }> {
  const objectKey = photo.imageHex.includes('/api/v1/media/')
    ? photo.imageHex.split('/api/v1/media/')[1]
    : (photo.imageHex.startsWith('gallery/') || photo.imageHex.startsWith('study/') ? photo.imageHex : null);

  const titleObj = { en: photo.title || 'Photo', si: photo.title || 'Photo' };
  const descObj = photo.description ? { en: photo.description, si: photo.description } : null;

  if (objectKey) {
    const payload = {
      slug: photo.id.slice(0, 36),
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
    try {
      await api.patch(`/admin/gallery-items/${photo.id}`, payload);
    } catch (e: any) {
      if (e.response?.status === 404) {
        await api.post('/admin/gallery-items', { id: photo.id, ...payload });
      }
    }
    await api.post(`/admin/gallery-items/${photo.id}/state`, { state: 'published' }).catch(console.error);
  }
  return {};
}

export async function dbDeleteGalleryPhoto(id: string): Promise<{ error?: string }> {
  await api.post(`/admin/gallery-items/${id}/state`, { state: 'archived' }).catch(() => {});
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
