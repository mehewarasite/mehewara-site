import { createClient } from '@supabase/supabase-js';
import type { Paper, Question, Subject } from './types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    'Missing Supabase credentials. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file.'
  );
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ─── Subjects ────────────────────────────────────────────────────────────────

export async function dbLoadSubjects(): Promise<Subject[] | null> {
  const { data, error } = await supabase
    .from('subjects')
    .select('data')
    .order('created_at', { ascending: true });
  if (error) { console.error('loadSubjects:', error); return null; }
  return data.map((r: any) => r.data as Subject);
}

export async function dbSaveSubjects(subjects: Subject[]): Promise<void> {
  // Upsert all subjects
  const rows = subjects.map(s => ({ id: s.id, data: s }));
  const { error } = await supabase.from('subjects').upsert(rows, { onConflict: 'id' });
  if (error) console.error('saveSubjects:', error);
}

// ─── Papers ──────────────────────────────────────────────────────────────────

export async function dbLoadPapers(): Promise<Paper[] | null> {
  const { data, error } = await supabase
    .from('papers')
    .select('data')
    .order('created_at', { ascending: false });
  if (error) { console.error('loadPapers:', error); return null; }
  return data.map((r: any) => r.data as Paper);
}

export async function dbSavePaper(paper: Paper): Promise<void> {
  // Strip studyMaterialHtml from the paper row — it's stored in study_html table
  const paperRow = { ...paper, studyMaterialHtml: undefined };
  const { error } = await supabase
    .from('papers')
    .upsert({ id: paper.id, data: paperRow }, { onConflict: 'id' });
  if (error) console.error('savePaper:', error);
}

export async function dbDeletePaper(paperId: string): Promise<void> {
  const { error } = await supabase.from('papers').delete().eq('id', paperId);
  if (error) console.error('deletePaper:', error);
}

// ─── Questions ───────────────────────────────────────────────────────────────

export async function dbLoadQuestions(): Promise<Question[] | null> {
  // First fetch just the IDs to avoid timeouts with large data columns (e.g. Base64 images)
  let allIdsData: any[] = [];
  let from = 0;
  const step = 1000;

  while (true) {
    const { data, error } = await supabase
      .from('questions')
      .select('id')
      .order('created_at', { ascending: true })
      .range(from, from + step - 1);
      
    if (error) {
      console.error('loadQuestions (ids):', error);
      return null;
    }
    if (!data || data.length === 0) break;
    allIdsData = allIdsData.concat(data);
    if (data.length < step) break;
    from += step;
  }
  
  if (allIdsData.length === 0) return [];

  const ids = allIdsData.map((row: any) => row.id);
  const results: Question[] = [];
  const batchSize = 10; // Slightly larger batch for full sync to save time, but still avoids timeouts

  for (let i = 0; i < ids.length; i += batchSize) {
    const batchIds = ids.slice(i, i + batchSize);
    
    let success = false;
    let attempts = 0;
    while (!success && attempts < 3) {
      attempts++;
      const { data, error } = await supabase
        .from('questions')
        .select('data')
        .in('id', batchIds);
        
      if (error) {
        console.warn(`Batch ${i} failed, attempt ${attempts}:`, error.message);
        if (attempts === 3) return null;
      } else if (data) {
        results.push(...data.map((r: any) => r.data as Question));
        success = true;
      }
    }
  }

  // Preserve the original created_at ordering using a Map for O(n) lookup
  const resultMap = new Map(results.map(r => [r.id, r]));
  const sortedResults: Question[] = [];
  for (const id of ids) {
    const q = resultMap.get(id);
    if (q) sortedResults.push(q);
  }

  return sortedResults;
}

export async function dbLoadQuestionsForPaper(paperId: string): Promise<Question[] | null> {
  // First fetch just the IDs to avoid timeouts with large data columns (e.g. Base64 images)
  const { data: idsData, error: idError } = await supabase
    .from('questions')
    .select('id')
    .eq('paper_id', paperId)
    .order('created_at', { ascending: true });
    
  if (idError) { 
    console.error('loadQuestionsForPaper (ids):', idError); 
    return null; 
  }
  
  if (!idsData || idsData.length === 0) return [];

  const ids = idsData.map((row: any) => row.id);
  const results: Question[] = [];
  const batchSize = 5; // Small batch size to prevent statement timeout on massive rows

  for (let i = 0; i < ids.length; i += batchSize) {
    const batchIds = ids.slice(i, i + batchSize);
    
    let success = false;
    let attempts = 0;
    while (!success && attempts < 3) {
      attempts++;
      const { data, error } = await supabase
        .from('questions')
        .select('data')
        .in('id', batchIds);
        
      if (error) {
        console.warn(`Batch ${i} failed, attempt ${attempts}:`, error.message);
        if (attempts === 3) return null; // Abort if repeatedly failing
      } else if (data) {
        results.push(...data.map((r: any) => r.data as Question));
        success = true;
      }
    }
  }

  // Preserve the original created_at ordering using a Map for O(n) lookup
  const resultMap = new Map(results.map(r => [r.id, r]));
  const sortedResults: Question[] = [];
  for (const id of ids) {
    const q = resultMap.get(id);
    if (q) sortedResults.push(q);
  }

  return sortedResults;
}

export async function dbSaveQuestion(question: Question): Promise<void> {
  const { error } = await supabase
    .from('questions')
    .upsert({ id: question.id, paper_id: question.paperId, data: question }, { onConflict: 'id' });
  if (error) console.error('saveQuestion:', error);
}

export async function dbSaveQuestions(questions: Question[]): Promise<void> {
  if (!questions.length) return;
  const rows = questions.map(q => ({ id: q.id, paper_id: q.paperId, data: q }));
  const { error } = await supabase.from('questions').upsert(rows, { onConflict: 'id' });
  if (error) console.error('saveQuestions:', error);
}

export async function dbDeleteQuestion(questionId: string): Promise<void> {
  const { error } = await supabase.from('questions').delete().eq('id', questionId);
  if (error) console.error('deleteQuestion:', error);
}

export async function dbDeleteQuestionsByPaper(paperId: string): Promise<void> {
  const { error } = await supabase.from('questions').delete().eq('paper_id', paperId);
  if (error) console.error('deleteQuestionsByPaper:', error);
}

// ─── Study HTML ───────────────────────────────────────────────────────────────

export async function dbLoadStudyHtml(paperId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('study_html')
    .select('html')
    .eq('paper_id', paperId)
    .maybeSingle();
  if (error) { return null; }
  return data?.html ?? null;
}

export async function dbSaveStudyHtml(paperId: string, html: string): Promise<void> {
  const { error } = await supabase
    .from('study_html')
    .upsert({ paper_id: paperId, html }, { onConflict: 'paper_id' });
  if (error) console.error('saveStudyHtml:', error);
}

export async function dbDeleteStudyHtml(paperId: string): Promise<void> {
  const { error } = await supabase.from('study_html').delete().eq('paper_id', paperId);
  if (error) console.error('deleteStudyHtml:', error);
}

// ─── About Us ────────────────────────────────────────────────────────────────

export async function dbLoadAboutUs(): Promise<any | null> {
  try {
    const { data, error } = await supabase
      .from('about_us')
      .select('*')
      .eq('id', 1)
      .maybeSingle();
    if (error) return null;
    return data;
  } catch (err) {
    return null;
  }
}

export async function dbSaveAboutUs(aboutData: any): Promise<{error?: Error} | null> {
  try {
    const { error } = await supabase
      .from('about_us')
      .upsert({ id: 1, ...aboutData }, { onConflict: 'id' });
    if (error) return { error: new Error(error.message) };
    return null;
  } catch (err: any) {
    return { error: err };
  }
}
