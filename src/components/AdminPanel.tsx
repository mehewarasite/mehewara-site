// for future developers of this site. i set a password here. use super-admin login to change it. if want to change all the password log in to the cloudflare and under the mehewara-site page setting you will fide secret tab change your pws there and redeloy the page.
//use antigravity. its far better if you do not know what you're doing.
// all the password details in the google drive.
//use this wisely do not waste your time here. logging off for the good. I'm 24. To the infinity and beyond 👾

import React, { useState, useEffect, useRef as useReactRef } from 'react';
import {
  Trash2,
  Plus,
  ArrowLeft,
  Lock,
  Unlock,
  CircleHelp,
  Check,
  BookOpen,
  FileText,
  RefreshCw,
  Upload,
  FileCode,
  ShieldCheck,
  Image,
  Images,
  Sun,
  Moon,
  BarChart2,
  TrendingUp,
  Activity,
  Globe,
  HelpCircle,
  Database,
  HardDrive,
  Edit2,
  X,
  Save,
  ChevronUp,
  ChevronDown
} from 'lucide-react';
import { Subject, Paper, Question, GalleryPhoto } from '../types';
import RichTextEditor from './RichTextEditor';
import { appendHtml, fileToImgHtml, hasRealContent, optionHasContent } from '../utils/mediaUpload';
import MathTextInput from './MathTextInput';
import { useTheme } from '../ThemeContext';
import { parseTxtToQuizData, renderMathInHtml, unrenderMathHtml } from '../utils/parseTxt';
import { supabase, dbLoadGallery, dbSaveGalleryPhoto, dbDeleteGalleryPhoto, dbUpdateGalleryPhotoOrder, dbDeleteAllGalleryPhotos } from '../supabase';
import { DEFAULT_PRIVACY_POLICY } from '../privacyPolicyDefault';
import { idbGet, idbSet } from '../utils/storage';
import { imageFileToHex, hexToDataUrl } from '../utils/imageHex';
// ── Inline HTML themer ──────────────────────────────────────────────────────
const THEME_STYLE = `<style id="mehewara-theme">
.mehewara-content *{font-family:var(--mhw-font,"Noto Sans Sinhala","Space Grotesk",system-ui,sans-serif)!important;color:var(--color-text-primary)!important;background-color:transparent!important;border-color:var(--color-border)!important}
.mehewara-content{color:var(--color-text-primary);line-height:1.8;font-size:.9rem}
.mehewara-content h1,.mehewara-content h2,.mehewara-content h3,.mehewara-content h4,.mehewara-content h5,.mehewara-content h6{color:var(--color-text-primary)!important;font-weight:700;margin-top:1.5em;margin-bottom:.5em;line-height:1.3}
.mehewara-content h1{font-size:1.5rem}.mehewara-content h2{font-size:1.25rem;border-bottom:1px solid var(--color-border);padding-bottom:.35em}.mehewara-content h3{font-size:1.1rem}
.mehewara-content p{margin-bottom:.9em;color:var(--color-text-primary)!important}
.mehewara-content a{color:#38bdf8!important;text-decoration:underline}
.mehewara-content table{width:100%;border-collapse:collapse;margin-bottom:1.2em;font-size:.85rem}
.mehewara-content th{background-color:var(--color-surface)!important;color:var(--color-text-primary)!important;font-weight:600;padding:.5em .75em;border:1px solid var(--color-border)!important;text-align:left}
.mehewara-content td{padding:.45em .75em;border:1px solid var(--color-border)!important;color:var(--color-text-primary)!important;background-color:transparent!important}
.mehewara-content tr:nth-child(even) td{background-color:var(--color-surface)!important}
.mehewara-content ul,.mehewara-content ol{padding-left:1.5em;margin-bottom:.9em}
.mehewara-content li{margin-bottom:.3em;color:var(--color-text-primary)!important}
.mehewara-content code,.mehewara-content pre{font-family:"JetBrains Mono",monospace!important;font-size:.82em;background-color:var(--color-surface)!important;color:#38bdf8!important;border-radius:6px;padding:.15em .4em}
.mehewara-content pre{padding:.9em 1em;overflow-x:auto;border:1px solid var(--color-border)}
.mehewara-content pre code{padding:0;background:none!important}
.mehewara-content blockquote{border-left:3px solid #38bdf8;margin-left:0;padding-left:1em;color:var(--color-text-secondary)!important;font-style:italic}
.mehewara-content img{max-width:100%;height:auto;border-radius:8px;margin:.5em 0}
.mehewara-content mark{background-color:rgba(56,189,248,.2)!important;color:var(--color-text-primary)!important;padding:0 .2em;border-radius:3px}
.mehewara-content hr{border:none;border-top:1px solid var(--color-border);margin:1.5em 0}
</style>`;

function themeHtml(raw: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(raw, 'text/html');

  // ── Attempt to extract and render quizData if this is a JS-rendered quiz ──
  const scripts = Array.from(doc.querySelectorAll('script'));
  let quizRendered = '';

  for (const script of scripts) {
    const src = script.textContent || '';

    // Use bracket-counting (not regex) to extract the full array.
    // Regex with *? fails when code snippets inside the data contain ];
    // which terminates a lazy match early; greedy *? can also overshoot on
    // files with multiple ]; occurrences. Bracket counting is always correct.
    const startMarker = 'const quizData = [';
    const startIdx = src.indexOf(startMarker);
    if (startIdx === -1) continue;

    let depth = 0;
    let endIdx = -1;
    for (let i = startIdx + 'const quizData = '.length; i < src.length; i++) {
      if (src[i] === '[') depth++;
      else if (src[i] === ']') { depth--; if (depth === 0) { endIdx = i; break; } }
    }
    if (endIdx === -1) continue;

    const arrayStr = src.slice(startIdx + 'const quizData = '.length, endIdx + 1);

    try {
      // eslint-disable-next-line no-new-func
      const quizData: Array<{
        id: number; part?: number; question: string;
        code?: string; options: string[]; correctIndex: number; explanation?: string;
      }> = new Function(`"use strict"; return (${arrayStr})`)();

      let html = '';
      let lastPart = 0;
      quizData.forEach((q) => {
        if (q.part && q.part !== lastPart) {
          lastPart = q.part;
          html += `<h2>Part ${q.part}</h2>`;
        }
        const esc = (s: string) => s
          .replace(/&/g, '&amp;').replace(/</g, '&lt;')
          .replace(/>/g, '&gt;').replace(/\n/g, '<br>');
        html += `<div class="mhw-question">`;
        html += `<p class="mhw-qnum">Q${q.id}. ${esc(q.question)}</p>`;
        if (q.code) {
          html += `<pre><code>${esc(q.code)}</code></pre>`;
        }
        html += `<ol type="A" class="mhw-options">`;
        q.options.forEach((opt, i) => {
          const isCorrect = i === q.correctIndex;
          html += `<li class="${isCorrect ? 'mhw-correct' : ''}">${esc(opt)}${isCorrect ? ' <span class="mhw-badge">\u2713</span>' : ''}</li>`;
        });
        html += `</ol>`;
        if (q.explanation) {
          html += `<div class="mhw-explanation"><strong>Explanation:</strong> ${esc(q.explanation)}</div>`;
        }
        html += `</div>`;
      });

      quizRendered = html;
      break;
    } catch (e) {
      console.warn('quizData parse failed:', e);
    }
  }

  // ── Strip scripts/styles ──
  doc.querySelectorAll('style, link[rel="stylesheet"], script').forEach(el => el.remove());

  // ── Strip colour/font inline styles ──
  doc.querySelectorAll('[style]').forEach(el => {
    const cleaned = (el.getAttribute('style') || '')
      .split(';')
      .filter(d => {
        const p = d.split(':')[0]?.trim().toLowerCase();
        return p && !['color', 'background', 'background-color', 'font-family', 'font-size'].includes(p) && !p.startsWith('border-color');
      })
      .join(';');
    cleaned.trim() ? el.setAttribute('style', cleaned) : el.removeAttribute('style');
  });
  ['bgcolor', 'color', 'face', 'size', 'text', 'link', 'vlink', 'alink'].forEach(attr =>
    doc.querySelectorAll(`[${attr}]`).forEach(el => el.removeAttribute(attr))
  );

  // Strip inline event handlers (onclick, onerror, onload, etc.) — XSS prevention
  doc.querySelectorAll('*').forEach(el => {
    const attrsToRemove: string[] = [];
    for (let i = 0; i < el.attributes.length; i++) {
      if (el.attributes[i].name.toLowerCase().startsWith('on')) {
        attrsToRemove.push(el.attributes[i].name);
      }
    }
    attrsToRemove.forEach(attr => el.removeAttribute(attr));
  });

  const staticHtml = doc.body?.innerHTML ?? doc.documentElement.innerHTML;
  const bodyHtml = quizRendered || staticHtml;

  const quizStyle = quizRendered ? `<style>
.mhw-question{border:1px solid var(--color-border);border-radius:10px;padding:1.2em 1.4em;margin-bottom:1.4em}
.mhw-qnum{font-weight:600;margin-bottom:.6em}
.mhw-options{padding-left:1.4em;margin:.5em 0}
.mhw-options li{padding:.35em .5em;margin-bottom:.3em;border-radius:6px}
.mhw-correct{background:rgba(16,185,129,.12)!important;color:var(--color-text-primary)!important;font-weight:600}
.mhw-badge{font-size:.7em;background:#10b981;color:#fff!important;padding:.1em .5em;border-radius:4px;margin-left:.4em;vertical-align:middle}
.mhw-explanation{margin-top:.8em;padding:.8em 1em;border-left:3px solid #38bdf8;font-size:.85em;opacity:.85}
img{max-width:100%;max-height:400px;object-fit:contain;height:auto;border-radius:8px;margin:.5em 0}
</style>` : '';

  return THEME_STYLE + quizStyle + bodyHtml;
}
// ───────────────────────────────────────────────────────────────────────────

interface AdminPanelProps {
  subjects: Subject[];
  papers: Paper[];
  questions: Question[];
  onAddPaper: (paper: Paper, importQuestions?: Question[]) => void;
  onDeletePaper: (paperId: string) => void;
  onAddQuestion: (question: Question) => void;
  onUpdateQuestion: (question: Question) => void;
  onUpdatePaper?: (paper: Paper) => void;
  onDeleteQuestion: (questionId: string) => void;
  onUpdateStudyHtml: (paperId: string, html: string) => void;
  onResetToDefaults: () => void;
  onExportData: () => void;
  onImportData: (file: File) => void;
  onSync?: () => void;
  isSyncing?: boolean;
  onAboutUpdate?: (data: any) => void;
  onClose: () => void;
  activeUsersCount?: number;
}

export default function AdminPanel({
  subjects,
  papers,
  questions,
  onAddPaper,
  onDeletePaper,
  onAddQuestion,
  onUpdateQuestion,
  onUpdatePaper,
  onDeleteQuestion,
  onUpdateStudyHtml,
  onResetToDefaults,
  onExportData,
  onImportData,
  onSync,
  isSyncing,
  onAboutUpdate,
  onClose,
  activeUsersCount = 1
}: AdminPanelProps) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  const importInputRef = React.useRef<HTMLInputElement>(null);
  const studyHtmlInputRef = React.useRef<HTMLInputElement>(null); // ← Added ref

  // ── Theme shortcut classes ──
  const pageBg = isDark ? 'bg-[#030304]' : 'bg-[#f0f4f8]';
  const cardBg = isDark ? 'bg-slate-950/80' : 'bg-white';
  const cardBdr = isDark ? 'border-slate-900' : 'border-slate-200';
  const surfaceBg = isDark ? 'bg-slate-950' : 'bg-white';
  const surfaceBdr = isDark ? 'border-slate-800' : 'border-slate-200';
  const inputBg = isDark ? 'bg-slate-900' : 'bg-white';
  const inputBdr = isDark ? 'border-slate-800' : 'border-slate-300';
  const textPrimary = isDark ? 'text-white' : 'text-slate-900';
  const textMuted = isDark ? 'text-slate-400' : 'text-slate-500';
  const textFaint = isDark ? 'text-slate-500' : 'text-slate-400';
  const dividerBdr = isDark ? 'border-slate-900' : 'border-slate-200';
  const subtleBg = isDark ? 'bg-slate-900' : 'bg-slate-100';
  const subtleBdr = isDark ? 'border-slate-800' : 'border-slate-200';

  const [passcode, setPasscode] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Superadmin change-password form state
  const [newAdminPw, setNewAdminPw] = useState('');
  const [confirmAdminPw, setConfirmAdminPw] = useState('');
  const [pwFlash, setPwFlash] = useState('');

  // Tab states: 'papers' | 'add-question' | 'manage-questions' | 'edit-questions' | 'about' | 'stats' | 'gallery'
  const [activeTab, setActiveTab] = useState<'papers' | 'add-question' | 'manage-questions' | 'edit-questions' | 'about' | 'stats' | 'gallery'>('papers');

  // ── Gallery state ──
  const [galleryPhotos, setGalleryPhotos] = useState<GalleryPhoto[]>([]);
  const [galleryLoading, setGalleryLoading] = useState(false);
  const [galleryUploadFile, setGalleryUploadFile] = useState<File | null>(null);
  const [galleryUploadPreview, setGalleryUploadPreview] = useState<string>('');
  const [galleryUploadTitle, setGalleryUploadTitle] = useState('');
  const [galleryUploadDesc, setGalleryUploadDesc] = useState('');
  const [galleryUploading, setGalleryUploading] = useState(false);
  const [galleryUploadProgress, setGalleryUploadProgress] = useState(0);
  const galleryFileInputRef = useReactRef<HTMLInputElement>(null);

  const fetchGallery = React.useCallback(async () => {
    setGalleryLoading(true);
    const photos = await dbLoadGallery();
    if (photos) setGalleryPhotos(photos);
    setGalleryLoading(false);
  }, []);

  useEffect(() => {
    if (activeTab === 'gallery' && isAuthenticated) {
      fetchGallery();
    }
  }, [activeTab, isAuthenticated]);

  const handleGalleryFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setGalleryUploadFile(file);
    // Show original preview before compression
    const url = URL.createObjectURL(file);
    setGalleryUploadPreview(url);
  };

  const handleGalleryUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!galleryUploadFile || !galleryUploadTitle.trim()) {
      showFlash('Please choose a photo and enter a title.', true);
      return;
    }
    setGalleryUploading(true);
    setGalleryUploadProgress(0);
    try {
      const { hex, mimeType, fileSizeKB } = await imageFileToHex(galleryUploadFile, setGalleryUploadProgress);
      const newPhoto: GalleryPhoto = {
        id: crypto.randomUUID(),
        title: galleryUploadTitle.trim(),
        description: galleryUploadDesc.trim(),
        imageHex: hex,
        mimeType,
        sortOrder: galleryPhotos.length,
        createdAt: new Date().toISOString(),
      };
      const { error } = await dbSaveGalleryPhoto(newPhoto);
      if (error) {
        showFlash(`Upload failed: ${error}`, true);
      } else {
        showFlash(`Photo saved! (~${fileSizeKB} KB compressed)`);
        setGalleryPhotos(prev => [...prev, newPhoto]);
        setGalleryUploadFile(null);
        setGalleryUploadPreview('');
        setGalleryUploadTitle('');
        setGalleryUploadDesc('');
        if (galleryFileInputRef.current) galleryFileInputRef.current.value = '';
      }
    } catch (err: any) {
      showFlash(`Error: ${err?.message || 'Upload failed'}`, true);
    } finally {
      setGalleryUploading(false);
      setGalleryUploadProgress(0);
    }
  };

  const handleGalleryDelete = async (id: string) => {
    if (!window.confirm('Delete this photo from the gallery?')) return;
    const { error } = await dbDeleteGalleryPhoto(id);
    if (error) {
      showFlash(`Delete failed: ${error}`, true);
    } else {
      setGalleryPhotos(prev => prev.filter(p => p.id !== id));
      showFlash('Photo deleted.');
    }
  };

  const handleGalleryMoveUp = async (index: number) => {
    if (index === 0) return;
    const updated = [...galleryPhotos];
    [updated[index - 1], updated[index]] = [updated[index], updated[index - 1]];
    const reordered = updated.map((p, i) => ({ ...p, sortOrder: i }));
    setGalleryPhotos(reordered);
    await dbUpdateGalleryPhotoOrder(reordered[index - 1].id, index - 1);
    await dbUpdateGalleryPhotoOrder(reordered[index].id, index);
  };

  const handleGalleryMoveDown = async (index: number) => {
    if (index === galleryPhotos.length - 1) return;
    const updated = [...galleryPhotos];
    [updated[index], updated[index + 1]] = [updated[index + 1], updated[index]];
    const reordered = updated.map((p, i) => ({ ...p, sortOrder: i }));
    setGalleryPhotos(reordered);
    await dbUpdateGalleryPhotoOrder(reordered[index].id, index);
    await dbUpdateGalleryPhotoOrder(reordered[index + 1].id, index + 1);
  };

  const handleGalleryDeleteAll = async () => {
    if (!window.confirm('WARNING: Are you sure you want to delete ALL photos from the gallery? This cannot be undone.')) return;
    
    setGalleryLoading(true);
    const { error } = await dbDeleteAllGalleryPhotos();
    if (error) {
      showFlash(`Delete all failed: ${error}`, true);
    } else {
      setGalleryPhotos([]);
      showFlash('All photos have been deleted.');
    }
    setGalleryLoading(false);
  };

  // ── Database Storage Usage State ──
  interface StorageTableInfo {
    name: string;
    label: string;
    rows: number;
    sizeBytes: number;
    color: string;
  }
  const [storageData, setStorageData] = useState<StorageTableInfo[]>([]);
  const [storageLoading, setStorageLoading] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [storageBucketSize, setStorageBucketSize] = useState<{ files: number; sizeBytes: number }>({ files: 0, sizeBytes: 0 });

  const fetchStorageUsage = React.useCallback(async () => {
    setStorageLoading(true);
    setStorageError(null);
    try {
      const tables = [
        { name: 'subjects', label: 'Subjects', color: '#10b981' },
        { name: 'papers', label: 'Papers', color: '#3b82f6' },
        { name: 'questions', label: 'Questions', color: '#a855f7' },
        { name: 'study_html', label: 'Study HTML', color: '#f59e0b' },
        { name: 'about_us', label: 'About Us', color: '#ef4444' },
      ];

      const results: StorageTableInfo[] = [];
      for (const t of tables) {
        try {
          const { data, error } = await supabase.from(t.name).select('*');
          if (error) {
            results.push({ name: t.name, label: t.label, rows: 0, sizeBytes: 0, color: t.color });
          } else {
            const jsonStr = JSON.stringify(data || []);
            const sizeBytes = new TextEncoder().encode(jsonStr).length;
            results.push({ name: t.name, label: t.label, rows: data?.length || 0, sizeBytes, color: t.color });
          }
        } catch {
          results.push({ name: t.name, label: t.label, rows: 0, sizeBytes: 0, color: t.color });
        }
      }
      setStorageData(results);

      // Fetch storage bucket info (question-images)
      try {
        const { data: files } = await supabase.storage.from('question-images').list('', { limit: 1000 });
        const { data: diagrams } = await supabase.storage.from('question-images').list('diagrams', { limit: 1000 });
        const allFiles = [...(files || []), ...(diagrams || [])];
        const totalSize = allFiles.reduce((sum, f) => sum + (f.metadata?.size || 0), 0);
        setStorageBucketSize({ files: allFiles.length, sizeBytes: totalSize });
      } catch {
        setStorageBucketSize({ files: 0, sizeBytes: 0 });
      }
    } catch (err: any) {
      setStorageError(err?.message || 'Failed to fetch storage data');
    } finally {
      setStorageLoading(false);
    }
  }, []);

  // Auto-fetch storage usage when stats tab is opened
  useEffect(() => {
    if (activeTab === 'stats' && isAuthenticated && storageData.length === 0) {
      fetchStorageUsage();
    }
  }, [activeTab, isAuthenticated]);

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Stats Calculations
  const stats = React.useMemo(() => {
    const olSubjects = subjects.filter(s => s.examType === 'ol').length;
    const alSubjects = subjects.filter(s => s.examType === 'al').length;

    const enPapers = papers.filter(p => p.language === 'en').length;
    const siPapers = papers.filter(p => !p.language || p.language === 'si').length;

    const avgQuestions = papers.length > 0 ? (questions.length / papers.length).toFixed(1) : '0';

    // Subject with most papers
    const subjectCounts = papers.reduce((acc, p) => {
      acc[p.subjectId] = (acc[p.subjectId] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    let topSubjectId = '';
    let topSubjectCount = 0;
    for (const [sId, count] of Object.entries(subjectCounts)) {
      if (count > topSubjectCount) {
        topSubjectCount = count;
        topSubjectId = sId;
      }
    }
    const topSubject = subjects.find(s => s.id === topSubjectId);

    return {
      olSubjects,
      alSubjects,
      enPapers,
      siPapers,
      avgQuestions,
      topSubject: topSubject ? topSubject.name : 'N/A',
      topSubjectCount
    };
  }, [subjects, papers, questions]);

  // Custom Paper Form
  const [selectedSubjectId, setSelectedSubjectId] = useState(subjects[0]?.id || '');
  const [newPaperTitle, setNewPaperTitle] = useState('');
  const [newPaperSinhalaTitle, setNewPaperSinhalaTitle] = useState('');
  const [newPaperLanguage, setNewPaperLanguage] = useState<'si' | 'en'>('si');
  const [newPaperYear, setNewPaperYear] = useState<number>(2026);
  const [newPaperDuration, setNewPaperDuration] = useState<number>(120);
  const [studyMaterialHtml, setStudyMaterialHtml] = useState<string>('');
  const [studyFileName, setStudyFileName] = useState<string>('');
  const [parsedQuestions, setParsedQuestions] = useState<Array<{
    id: number; part?: number; question: string;
    code?: string; options: string[]; correctIndex: number; explanation?: string;
  }>>([]);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingLiveId, setEditingLiveId] = useState<string | null>(null);
  const [liveEditData, setLiveEditData] = useState<Question | null>(null);
  const [editingPaperId, setEditingPaperId] = useState<string | null>(null);
  const [editPaperData, setEditPaperData] = useState<Partial<Paper>>({});

  const [aboutData, setAboutData] = useState({
    description: '',
    image_url: '',
    facebook_link: '',
    youtube_link: '',
    linkedin_link: '',
    privacy_policy_statement: '',
    full_privacy_policy_html: ''
  });

  useEffect(() => {
    const fetchAboutData = async () => {
      try {
        const { data, error } = await supabase.from('about_us').select('*').eq('id', 1).maybeSingle();
        if (data && !error) {
          setAboutData(data);
        } else {
          const local = await idbGet('m_about_us');
          if (local) setAboutData(JSON.parse(local));
        }
      } catch (err) {
        const local = await idbGet('m_about_us');
        if (local) setAboutData(JSON.parse(local));
      }
    };
    if (isAuthenticated) {
      fetchAboutData();
    }
  }, [isAuthenticated]);

  // Custom Question Form
  const [targetPaperId, setTargetPaperId] = useState<string>('');
  const [filterSubjectId, setFilterSubjectId] = useState<string>('');
  const [filterLanguage, setFilterLanguage] = useState<'all' | 'si' | 'en'>('all');
  const [showPrivacyEditor, setShowPrivacyEditor] = useState<boolean>(false);

  const [qNumber, setQNumber] = useState<number>(1);
  const [questionHtml, setQuestionHtml] = useState('');
  const [optA, setOptA] = useState('');
  const [optB, setOptB] = useState('');
  const [optC, setOptC] = useState('');
  const [optD, setOptD] = useState('');
  const [optE, setOptE] = useState('');
  const [correctOptions, setCorrectOptions] = useState<number[]>([0]);
  const [isAllCorrect, setIsAllCorrect] = useState<boolean>(false);
  const [explanationHtml, setExplanationHtml] = useState('');

  const [flashMessage, setFlashMessage] = useState('');
  const [flashIsError, setFlashIsError] = useState(false);

  const showFlash = (message: string, isError = false) => {
    setFlashMessage(message);
    setFlashIsError(isError);
    setTimeout(() => {
      setFlashMessage('');
      setFlashIsError(false);
    }, isError ? 6000 : 4000);
  };

  // Sync targetPaperId when papers load async from Supabase (initial state may be stale '')
  useEffect(() => {
    if (!targetPaperId && papers.length > 0) {
      setTargetPaperId(papers[0].id);
    }
  }, [papers, targetPaperId]);

  // Sync qNumber when targetPaperId changes
  useEffect(() => {
    if (targetPaperId) {
      setQNumber(questions.filter(q => q.paperId === targetPaperId).length + 1);
    }
  }, [targetPaperId]);

  // Sync selectedSubjectId when subjects load async
  useEffect(() => {
    if (!selectedSubjectId && subjects.length > 0) {
      setSelectedSubjectId(subjects[0].id);
    }
  }, [subjects]);

  const SUPERADMIN_HASH = import.meta.env.VITE_SUPERADMIN_HASH || '';

  // Brute-force lockout state — persisted in sessionStorage so reloads don't reset it
  const [loginAttempts, setLoginAttempts] = useState<number>(() => {
    const stored = sessionStorage.getItem('m_login_attempts');
    return stored ? parseInt(stored, 10) : 0;
  });
  const [lockedUntil, setLockedUntil] = useState<number | null>(() => {
    const stored = sessionStorage.getItem('m_locked_until');
    if (!stored) return null;
    const ts = parseInt(stored, 10);
    return ts > Date.now() ? ts : null; // discard if already expired
  });

  const sha256 = async (text: string): Promise<string> => {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  };

  // Get stored admin password hash (set by superadmin, or a bootstrap default)
  // IMPORTANT: after first deploy, use the superadmin panel to set a real password.

  const getAdminHash = () =>
    localStorage.getItem('m_admin_pw_hash') ||
    import.meta.env.VITE_DEFAULT_ADMIN_HASH ||
    '';

  // Handle Passcode verification
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    // Lockout check
    if (lockedUntil && Date.now() < lockedUntil) {
      const secs = Math.ceil((lockedUntil - Date.now()) / 1000);
      setErrorMessage(`Too many failed attempts. Try again in ${secs}s.`);
      return;
    }

    const inputHash = await sha256(passcode);

    if (inputHash === SUPERADMIN_HASH) {
      setIsSuperAdmin(true);
      setIsAuthenticated(false);
      setErrorMessage('');
      setLoginAttempts(0);
      sessionStorage.removeItem('m_login_attempts');
      sessionStorage.removeItem('m_locked_until');
    } else if (inputHash === getAdminHash()) {
      setIsAuthenticated(true);
      setIsSuperAdmin(false);
      setErrorMessage('');
      setLoginAttempts(0);
      sessionStorage.removeItem('m_login_attempts');
      sessionStorage.removeItem('m_locked_until');
    } else {
      const attempts = loginAttempts + 1;
      setLoginAttempts(attempts);
      sessionStorage.setItem('m_login_attempts', String(attempts));
      if (attempts >= 5) {
        const until = Date.now() + 30_000; // 30-second lockout
        setLockedUntil(until);
        sessionStorage.setItem('m_locked_until', String(until));
        setLoginAttempts(0);
        sessionStorage.setItem('m_login_attempts', '0');
        setErrorMessage('Too many failed attempts. Locked for 30 seconds.');
      } else {
        setErrorMessage(`Incorrect passcode. (${5 - attempts} attempt${5 - attempts === 1 ? '' : 's'} left)`);
      }
    }
  };

  // Handle admin password change by superadmin
  const handleChangeAdminPw = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newAdminPw.length < 8) {
      setPwFlash('error:Password must be at least 8 characters.');
      return;
    }
    if (newAdminPw !== confirmAdminPw) {
      setPwFlash('error:Passwords do not match.');
      return;
    }
    const newHash = await sha256(newAdminPw);
    localStorage.setItem('m_admin_pw_hash', newHash);
    setNewAdminPw('');
    setConfirmAdminPw('');
    setPwFlash('success:Admin password updated successfully!');
    setTimeout(() => setPwFlash(''), 4000);
  };

  const handleResetWithPassword = async () => {
    const pw = prompt('Please enter your admin password to confirm factory reset:');
    if (!pw) return;
    const hash = await sha256(pw);
    if (hash === getAdminHash() || hash === SUPERADMIN_HASH) {
      onResetToDefaults();
    } else {
      alert('Incorrect password. Reset aborted.');
    }
  };

  const resetStudyHtmlInput = () => {
    if (studyHtmlInputRef.current) studyHtmlInputRef.current.value = '';
  };
  // True when the currently selected target paper belongs to an A/L subject
  const isALPaper = (() => {
    const paper = papers.find(p => p.id === targetPaperId);
    if (!paper) return false;
    const subject = subjects.find(s => s.id === paper.subjectId);
    return subject?.examType === 'al';
  })();

  // Create Paper
  const handleCreatePaper = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPaperTitle || !newPaperSinhalaTitle) {
      alert('Please fill in all title fields');
      return;
    }

    const selectedSub = subjects.find(s => s.id === selectedSubjectId);
    if (!selectedSub) return;

    const paperId = `paper-custom-${Date.now()}`;
    const newPaper: Paper = {
      id: paperId,
      subjectId: selectedSubjectId,
      examType: selectedSub.examType,
      title: newPaperTitle,
      sinhalaTitle: newPaperSinhalaTitle,
      year: newPaperYear,
      durationMinutes: newPaperDuration,
      questionCount: 0,
      studyMaterialHtml: studyMaterialHtml || undefined,
      language: newPaperLanguage,
    };

    // Build imported questions first so we can pass them atomically with the paper
    let importedQuestions: Question[] | undefined;
    if (parsedQuestions.length > 0) {
      const ts = Date.now();
      importedQuestions = parsedQuestions.map((q, idx) => ({
        id: `q-custom-${ts}-${idx}`,
        paperId: paperId,
        qNumber: q.id ?? (idx + 1),
        questionHtml: q.code
          ? `<p>${q.question}</p><pre><code>${q.code}</code></pre>`
          : `<p>${q.question}</p>`,
        optionsHtml: q.options as [string, string, string, string],
        correctOption: q.correctIndex as 0 | 1 | 2 | 3,
        correctOptions: [q.correctIndex],
        explanationHtml: q.explanation || undefined,
      }));
    }

    // Single call — paper + questions saved atomically, no async state race
    onAddPaper(newPaper, importedQuestions);
    setTargetPaperId(paperId);
    setFlashMessage(importedQuestions
      ? `Paper created + ${importedQuestions.length} MCQs imported!`
      : 'Paper created successfully!');

    setNewPaperTitle('');
    setNewPaperSinhalaTitle('');
    setNewPaperLanguage('si');
    setStudyMaterialHtml('');
    setStudyFileName('');
    setParsedQuestions([]);
    resetStudyHtmlInput();
    setTimeout(() => setFlashMessage(''), 5000);
  };

  const handleImageFileUpload = async (
    file: File,
    apply: (html: string) => void,
    className = 'mhw-q-img'
  ) => {
    try {
      const html = await fileToImgHtml(file, className);
      apply(html);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Image upload failed.');
    }
  };

  const optionFilled = (value: string) =>
    optionHasContent(value) || value.startsWith('$') || value.includes('<img');

  // Add Question
  const handleCreateQuestion = (e: React.FormEvent) => {
    e.preventDefault();

    const missing: string[] = [];
    if (!targetPaperId) missing.push('paper');
    if (!qNumber || qNumber < 1) missing.push('question number');
    if (!hasRealContent(questionHtml)) missing.push('question text');
    if (!optionFilled(optA)) missing.push('option A');
    if (!optionFilled(optB)) missing.push('option B');
    if (!optionFilled(optC)) missing.push('option C');
    if (!optionFilled(optD)) missing.push('option D');
    if (isALPaper && !optionFilled(optE)) missing.push('option E (A/L papers need 5 options)');

    if (missing.length > 0) {
      showFlash(`Fill in all required fields: ${missing.join(', ')}`, true);
      return;
    }

    const paperQuestions = questions.filter(q => q.paperId === targetPaperId);
    const calculatedQNumber = qNumber || (paperQuestions.length + 1);

    const newQuestion: Question = {
      id: `q-custom-${Date.now()}`,
      paperId: targetPaperId,
      qNumber: calculatedQNumber,
      questionHtml: questionHtml,
      optionsHtml: isALPaper
        ? [optA, optB, optC, optD, optE]
        : [optA, optB, optC, optD],
      correctOption: correctOptions[0] as 0 | 1 | 2 | 3 | 4,
      correctOptions: correctOptions,
      isAllCorrect: isAllCorrect,
      explanationHtml: explanationHtml || undefined
    };

    onAddQuestion(newQuestion);

    setQNumber(calculatedQNumber + 1);
    setQuestionHtml('');
    setOptA('');
    setOptB('');
    setOptC('');
    setOptD('');
    setOptE('');
    setCorrectOptions([0]);
    setIsAllCorrect(false);
    setExplanationHtml('');

    showFlash(`Question ${calculatedQNumber} saved!`);
  };


  // Extract quizData array from raw HTML script content
  const extractQuizData = (raw: string) => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(raw, 'text/html');
    const scripts = Array.from(doc.querySelectorAll('script'));
    for (const script of scripts) {
      const src = script.textContent || '';
      const startMarker = 'const quizData = [';
      const startIdx = src.indexOf(startMarker);
      if (startIdx === -1) continue;
      let depth = 0, endIdx = -1;
      for (let i = startIdx + 'const quizData = '.length; i < src.length; i++) {
        if (src[i] === '[') depth++;
        else if (src[i] === ']') { depth--; if (depth === 0) { endIdx = i; break; } }
      }
      if (endIdx === -1) continue;
      const arrayStr = src.slice(startIdx + 'const quizData = '.length, endIdx + 1);
      try {
        // eslint-disable-next-line no-new-func
        const data = new Function(`"use strict"; return (${arrayStr})`)();
        if (Array.isArray(data) && data.length > 0) return data;
      } catch (e) {
        console.warn('quizData parse failed:', e);
      }
    }
    return [];
  };

  // Handle HTML study material upload — also auto-parses MCQs if quizData found
  const handleHtmlUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const file = input.files?.[0];
    if (!file) return;
    if (!file.name.endsWith('.html') && !file.name.endsWith('.htm')) {
      alert('Please upload an .html or .htm file.');
      input.value = '';
      return;
    }
    setStudyFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const raw = ev.target?.result as string;
      const themed = themeHtml(raw);
      setStudyMaterialHtml(themed);
      const parsed = extractQuizData(raw);
      setParsedQuestions(parsed);
    };
    reader.readAsText(file);
    input.value = '';
  };

  const handleTxtPaperUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const file = input.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const rawText = ev.target?.result as string;

      try {
        // 1. Run your new parser
        const parsed = parseTxtToQuizData(rawText);

        if (parsed.length === 0) {
          alert("No questions found. Please check your formatting tags like [EN], [SIN], or ---.");
          return;
        }

        // 2. Feed it into your existing form state!
        // This will automatically populate the question preview list in your UI
        setParsedQuestions(parsed);

        alert(`Successfully loaded ${parsed.length} questions from text file!`);
      } catch (error) {
        console.error("Parsing error:", error);
        alert("Failed to parse file. Make sure it follows the exact formatting rules.");
      }
    };

    reader.readAsText(file);
    input.value = ''; // Clear input so you can re-upload if needed
  };

  const handleQuestionImageUpload = async (file: File, index: number) => {
    if (!file) return;

    try {
      // 1. Upload to Supabase Storage
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
      const filePath = `diagrams/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('question-images')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // 2. Get the public URL of the uploaded image
      const { data: { publicUrl } } = supabase.storage
        .from('question-images')
        .getPublicUrl(filePath);

      // 3. Create the HTML img tag
      const imgHtml = `<img src="${publicUrl}" alt="Question Diagram" class="max-w-full h-auto my-4 rounded-md shadow-sm border border-gray-200 dark:border-gray-700" />`;

      // 4. Update the specific question in your state
      setParsedQuestions(prev => {
        const updated = [...prev];
        let currentQuestionText = updated[index].question;

        // Check if there is a placeholder to replace. 
        // If there is, replace it. If not, just append the image to the end of the question.
        if (currentQuestionText.includes('class="image-placeholder')) {
          // Regex to find and replace the placeholder div created by parseTxt.ts
          currentQuestionText = currentQuestionText.replace(
            /<div class="image-placeholder[^>]*>.*?<\/div>/i,
            imgHtml
          );
        } else {
          currentQuestionText += imgHtml;
        }

        updated[index].question = currentQuestionText;
        return updated;
      });

      alert("Image uploaded and added to question successfully!");

    } catch (error) {
      console.error("Error uploading image:", error);
      alert("Failed to upload image. Check your Supabase storage permissions.");
    }
  };

  const handleUpdateLiveQuestion = async (dbQuestionId: string, updatedQ: Question) => {
    try {
      const { error } = await supabase
        .from('questions')
        .update({ data: updatedQ })
        .eq('id', dbQuestionId);

      if (error) throw error;

      alert("✅ Question updated successfully in the live database!");

      onUpdateQuestion(updatedQ);
      setEditingLiveId(null);
      setLiveEditData(null);

    } catch (error) {
      console.error("Error updating live question:", error);
      alert("❌ Failed to update question in database.");
    }
  };

  const extractImages = (html: string) => {
    const images: string[] = [];
    const regex = /<img[^>]*src="([^"]+)"[^>]*>/gi;
    let match;
    while ((match = regex.exec(html)) !== null) {
      if (match[1]) images.push(match[1]);
    }
    return images;
  };

  const handleDeleteImage = async (src: string, field: 'questionHtml' | 'explanationHtml' | 'optionsHtml', oIdx?: number) => {
    if (!liveEditData) return;
    if (!window.confirm('Are you sure you want to delete this image?')) return;

    if (field === 'optionsHtml' && typeof oIdx === 'number') {
      const newOpts = [...liveEditData.optionsHtml];
      let updatedHtml = newOpts[oIdx];
      const startIdx = updatedHtml.indexOf(src);
      if (startIdx !== -1) {
        const tagStart = updatedHtml.lastIndexOf('<img', startIdx);
        const tagEnd = updatedHtml.indexOf('>', startIdx) + 1;
        if (tagStart !== -1 && tagEnd !== -1) {
          updatedHtml = updatedHtml.substring(0, tagStart) + updatedHtml.substring(tagEnd);
        }
      }
      newOpts[oIdx] = updatedHtml;
      setLiveEditData({ ...liveEditData, optionsHtml: newOpts as any });
    } else {
      let updatedHtml = liveEditData[field as 'questionHtml' | 'explanationHtml'] || '';
      const startIdx = updatedHtml.indexOf(src);
      if (startIdx !== -1) {
        const tagStart = updatedHtml.lastIndexOf('<img', startIdx);
        const tagEnd = updatedHtml.indexOf('>', startIdx) + 1;
        if (tagStart !== -1 && tagEnd !== -1) {
          updatedHtml = updatedHtml.substring(0, tagStart) + updatedHtml.substring(tagEnd);
        }
      }
      setLiveEditData({ ...liveEditData, [field as 'questionHtml' | 'explanationHtml']: updatedHtml });
    }

    if (src.includes('supabase.co/storage/v1/object/public/question-images/')) {
      const filePath = src.split('question-images/')[1];
      if (filePath) {
        try {
          await supabase.storage.from('question-images').remove([filePath]);
          showFlash("Image deleted from database.");
        } catch (err) {
          console.error("Failed to delete image from storage:", err);
        }
      }
    }
  };

  // Authentication barrier
  if (!isAuthenticated) {
    // SUPERADMIN VIEW — change admin password
    if (isSuperAdmin) {
      const isSuccess = pwFlash.startsWith('success:');
      const pwMsg = pwFlash.replace(/^(error|success):/, '');

      return (
        <div className={`fixed inset-0 z-50 ${isDark ? 'bg-[#030304]/95' : 'bg-slate-100/95'} backdrop-blur-xl flex justify-center items-center p-4`}>
          <div className={`w-full max-w-md ${isDark ? 'bg-slate-900/80 border-slate-800/80' : 'bg-white border-slate-200'} border rounded-2xl p-8 shadow-2xl relative`}>
            <button
              onClick={() => { setIsSuperAdmin(false); setPasscode(''); }}
              className={`absolute top-4 right-4 ${textMuted} ${isDark ? 'hover:text-white hover:bg-slate-800/60' : 'hover:text-slate-900 hover:bg-slate-100'} p-1 rounded-full transition-colors`}
            >
              <ArrowLeft className="w-5 h-5" />
            </button>

            <div className="text-center mb-6">
              <div className="mx-auto w-14 h-14 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-center justify-center text-amber-400 mb-3">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <h2 className={`${textPrimary} font-bold text-base`}>Super Admin</h2>
              <p className="text-xs text-amber-400 mt-1 font-mono tracking-widest uppercase">Change Admin Password</p>
            </div>

            {pwMsg && (
              <div className={`mb-4 px-4 py-3 rounded-xl text-xs font-semibold border ${isSuccess
                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                : 'bg-red-500/10 border-red-500/20 text-red-400'
                }`}>
                {isSuccess ? '✓ ' : '✕ '}{pwMsg}
              </div>
            )}

            <form onSubmit={handleChangeAdminPw} className="space-y-4">
              <div>
                <label className={`block text-xs font-semibold tracking-wider ${textMuted} uppercase mb-2`}>
                  නව මුරපදය (New Admin Password)
                </label>
                <input
                  type="password"
                  placeholder="Min. 6 characters"
                  value={newAdminPw}
                  onChange={(e) => setNewAdminPw(e.target.value)}
                  className={`w-full ${isDark ? 'bg-slate-950' : 'bg-slate-50'} border ${inputBdr} focus:border-amber-500 rounded-xl px-4 py-3 ${textPrimary} text-center focus:outline-none focus:ring-1 focus:ring-amber-500 transition-all font-mono`}
                  autoFocus
                />
              </div>
              <div>
                <label className={`block text-xs font-semibold tracking-wider ${textMuted} uppercase mb-2`}>
                  නැවත ඇතුළත් කරන්න (Confirm Password)
                </label>
                <input
                  type="password"
                  placeholder="Re-enter new password"
                  value={confirmAdminPw}
                  onChange={(e) => setConfirmAdminPw(e.target.value)}
                  className={`w-full ${isDark ? 'bg-slate-950' : 'bg-slate-50'} border ${inputBdr} focus:border-amber-500 rounded-xl px-4 py-3 ${textPrimary} text-center focus:outline-none focus:ring-1 focus:ring-amber-500 transition-all font-mono`}
                />
              </div>

              <button
                type="submit"
                className="w-full py-3 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-white rounded-xl font-bold font-sans text-sm tracking-widest transition-all hover:shadow-[0_0_15px_rgba(245,158,11,0.3)] cursor-pointer"
              >
                මුරපදය වෙනස් කරන්න / Update Password
              </button>
            </form>

            <div className={`mt-6 pt-4 border-t ${dividerBdr} text-center`}>
              <p className={`text-[10px] ${textFaint} font-mono`}>
                SUPER ADMIN MODE &nbsp;&bull;&nbsp; PASSWORD CHANGE ONLY
              </p>
            </div>
          </div>
        </div>
      );
    }

    // NORMAL ADMIN LOGIN VIEW
    return (
      <div className={`fixed inset-0 z-50 ${isDark ? 'bg-[#030304]/95' : 'bg-slate-100/95'} backdrop-blur-xl flex justify-center items-center p-4`}>
        <div className={`w-full max-w-md ${isDark ? 'bg-slate-900/80 border-slate-800/80' : 'bg-white border-slate-200'} border rounded-2xl p-8 shadow-2xl relative`}>
          <button
            onClick={onClose}
            className={`absolute top-4 right-4 ${textMuted} ${isDark ? 'hover:text-white hover:bg-slate-800/60' : 'hover:text-slate-900 hover:bg-slate-100'} p-1 rounded-full transition-colors`}
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          <div className="text-center mb-6">
            <div className={`mx-auto w-14 h-14 ${isDark ? 'bg-sky-500/10 border-sky-500/30' : 'bg-sky-500/5 border-sky-500/20'} rounded-xl flex items-center justify-center ${isDark ? 'text-sky-400' : 'text-sky-600'} mb-3 animate-pulse`}>
              <Lock className="w-6 h-6" />
            </div>
            <h2 className={`text-xs ${isDark ? 'text-cyan-400' : 'text-cyan-700'} mt-1 font-mono tracking-widest uppercase`}>Admin Verification</h2>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className={`block text-xs font-semibold tracking-wider ${textMuted} uppercase mb-2`}>මුරපදය ඇතුළත් කරන්න (Passcode)</label>
              <input
                type="password"
                placeholder="Enter admin or superadmin password"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                className={`w-full ${isDark ? 'bg-slate-950' : 'bg-slate-50'} border ${inputBdr} focus:border-sky-500 rounded-xl px-4 py-3 ${textPrimary} text-center focus:outline-none focus:ring-1 focus:ring-sky-500 transition-all font-mono`}
                autoFocus
              />
            </div>
            {errorMessage && (
              <p className="text-red-500 text-xs text-center font-sans tracking-wide">{errorMessage}</p>
            )}

            <button
              type="submit"
              className="w-full py-3 bg-gradient-to-r from-sky-500 to-sky-600 hover:from-sky-400 hover:to-sky-500 text-white rounded-xl font-bold font-sans text-sm tracking-widest transition-all hover:shadow-[0_0_15px_rgba(56,189,248,0.3)] cursor-pointer"
            >
              තහවුරු කරන්න / Unlock
            </button>
          </form>

          <div className={`mt-6 pt-4 border-t ${dividerBdr} text-center`}>
            <p className={`text-[10px] ${textFaint} font-mono`}>
              SECURE ADMINISTRATION PROTOCOL &nbsp;&bull;&nbsp; v1.0.2
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`fixed inset-0 z-50 ${pageBg} overflow-y-auto p-4 md:p-8`}>
      <div className="max-w-6xl mx-auto">

        {/* Admin Header */}
        <div className={`flex flex-col md:flex-row md:items-center justify-between border-b ${dividerBdr} pb-6 mb-8 gap-4`}>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className={`p-2 ${isDark ? 'hover:bg-slate-900' : 'hover:bg-slate-100'} border ${cardBdr} rounded-xl ${textMuted} ${isDark ? 'hover:text-white' : 'hover:text-slate-900'} transition-all cursor-pointer`}
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs bg-sky-500/10 text-sky-400 border border-sky-500/20 px-2 py-0.5 rounded-full font-mono font-bold">ADMIN MODE</span>
                <Unlock className="w-3.5 h-3.5 text-emerald-400" />
              </div>
              <h1 className={`text-lg sm:text-2xl md:text-3xl font-extrabold ${textPrimary} font-display tracking-wide mt-1 leading-snug`}>මෙහෙවර ප්‍රශ්න පත්‍ර පාලක පැනලය</h1>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Hidden file input for import */}
            <input
              ref={importInputRef}
              type="file"
              accept=".json"
              style={{ display: 'none' }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) { onImportData(file); e.target.value = ''; }
              }}
            />
            <button
              onClick={onExportData}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-500/10 border border-sky-500/20 text-sky-400 hover:bg-sky-500/20 hover:border-sky-500/30 rounded-xl text-xs font-semibold cursor-pointer transition-colors"
              title="Download all papers, questions and study materials as a JSON backup"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
              Export Database
            </button>
            <button
              onClick={() => importInputRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 hover:border-emerald-500/30 rounded-xl text-xs font-semibold cursor-pointer transition-colors"
              title="Import a previously exported JSON backup — restores all papers, questions and study materials"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
              Import Database
            </button>
            {onSync && (
              <button
                onClick={onSync}
                disabled={isSyncing}
                className={`flex items-center gap-1.5 px-3 py-1.5 bg-blue-500/10 border border-blue-500/20 text-blue-400 hover:bg-blue-500/20 hover:border-blue-500/30 rounded-xl text-xs font-semibold transition-colors ${isSyncing ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                title="Sync database changes to cloud"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                {isSyncing ? 'Syncing...' : 'Sync Data'}
              </button>
            )}
            <button
              onClick={handleResetWithPassword}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 hover:border-red-500/30 rounded-xl text-xs font-semibold cursor-pointer transition-colors"
              title="Restores the pre-loaded past papers and questions, wiping out additions"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Reset to Factory Defaults
            </button>
            <button
              onClick={toggleTheme}
              aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
              className={`flex items-center justify-center min-h-[32px] min-w-[32px] px-2 py-1.5 ${subtleBg} border ${subtleBdr} ${textMuted} ${isDark ? 'hover:text-white' : 'hover:text-slate-900'} rounded-xl cursor-pointer transition-colors`}
              title={isDark ? 'Light mode' : 'Dark mode'}
            >
              {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            <button
              onClick={() => setIsAuthenticated(false)}
              className={`px-3 py-1.5 ${subtleBg} border ${subtleBdr} ${textMuted} ${isDark ? 'hover:text-white' : 'hover:text-slate-900'} rounded-xl text-xs font-semibold cursor-pointer transition-colors`}
            >
              Lock Panel
            </button>
          </div>
        </div>

        {/* Action Flash Message */}
        {flashMessage && (
          <div className={`mb-6 p-4 rounded-xl flex items-center gap-2 text-xs font-semibold animate-fade-in ${flashIsError
            ? 'bg-red-500/10 border border-red-500/20 text-red-300'
            : 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-350'
            }`}>
            <Check className={`w-4 h-4 shrink-0 ${flashIsError ? 'text-red-400' : 'text-emerald-400'}`} />
            {flashMessage}
          </div>
        )}

        {/* TAB CONTROLS */}
        <div className={`flex gap-2 mb-6 border-b ${dividerBdr} pb-3 overflow-x-auto -mx-1 px-1 scrollbar-thin`}>
          <button
            onClick={() => setActiveTab('papers')}
            className={`shrink-0 min-h-[44px] px-4 sm:px-5 py-2.5 rounded-xl text-xs font-bold tracking-wider uppercase transition-all flex items-center gap-2 cursor-pointer ${activeTab === 'papers'
              ? 'bg-sky-500 text-white shadow-[0_0_15px_rgba(14,165,233,0.25)]'
              : `${surfaceBg} border ${cardBdr} ${textMuted} ${isDark ? 'hover:text-white' : 'hover:text-slate-900'}`
              }`}
          >
            <BookOpen className="w-4 h-4 shrink-0" />
            <span className="whitespace-nowrap">ප්‍රශ්න පත්‍ර (Papers)</span>
          </button>
          <button
            onClick={() => {
              setActiveTab('add-question');
              if (!targetPaperId && papers.length > 0) {
                setTargetPaperId(papers[0].id);
              }
            }}
            className={`shrink-0 min-h-[44px] px-4 sm:px-5 py-2.5 rounded-xl text-xs font-bold tracking-wider uppercase transition-all flex items-center gap-2 cursor-pointer ${activeTab === 'add-question'
              ? 'bg-sky-500 text-white shadow-[0_0_15px_rgba(14,165,233,0.25)]'
              : `${surfaceBg} border ${cardBdr} ${textMuted} ${isDark ? 'hover:text-white' : 'hover:text-slate-900'}`
              }`}
          >
            <Plus className="w-4 h-4 shrink-0" />
            <span className="whitespace-nowrap">ප්‍රශ්න ඇතුළත් කිරීම (MCQs)</span>
          </button>
          <button
            onClick={() => {
              setActiveTab('edit-questions');
              if (!targetPaperId && papers.length > 0) {
                setTargetPaperId(papers[0].id);
              }
            }}
            className={`shrink-0 min-h-[44px] px-4 sm:px-5 py-2.5 rounded-xl text-xs font-bold tracking-wider uppercase transition-all flex items-center gap-2 cursor-pointer ${activeTab === 'edit-questions'
              ? 'bg-sky-500 text-white shadow-[0_0_15px_rgba(14,165,233,0.4)]'
              : `${surfaceBg} border ${cardBdr} ${textMuted} ${isDark ? 'hover:text-white' : 'hover:text-slate-900'}`
              }`}
          >
            <span className="whitespace-nowrap">ප්‍රශ්න සංස්කරණය (Edit MCQs)</span>
          </button>
          <button
            onClick={() => {
              setActiveTab('manage-questions');
              if (!targetPaperId && papers.length > 0) {
                setTargetPaperId(papers[0].id);
              }
            }}
            className={`shrink-0 min-h-[44px] px-4 sm:px-5 py-2.5 rounded-xl text-xs font-bold tracking-wider uppercase transition-all flex items-center gap-2 cursor-pointer ${activeTab === 'manage-questions'
              ? 'bg-red-500 text-white shadow-[0_0_15px_rgba(239,68,68,0.25)]'
              : `${surfaceBg} border ${cardBdr} ${textMuted} ${isDark ? 'hover:text-white' : 'hover:text-slate-900'}`
              }`}
          >
            <span className="whitespace-nowrap">ප්‍රශ්න මකන්න (Delete MCQs)</span>
          </button>

          <button
            onClick={() => setActiveTab('about')}
            className={`shrink-0 min-h-[44px] px-4 sm:px-5 py-2.5 rounded-xl text-xs font-bold tracking-wider uppercase transition-all flex items-center gap-2 cursor-pointer ${activeTab === 'about'
              ? 'bg-sky-500 text-white shadow-[0_0_15px_rgba(14,165,233,0.4)]'
              : `${surfaceBg} border ${cardBdr} ${textMuted} ${isDark ? 'hover:text-white' : 'hover:text-slate-900'}`
              }`}
          >
            <span className="whitespace-nowrap">About Us</span>
          </button>
          <button
            onClick={() => setActiveTab('stats')}
            className={`shrink-0 min-h-[44px] px-4 sm:px-5 py-2.5 rounded-xl text-xs font-bold tracking-wider uppercase transition-all flex items-center gap-2 cursor-pointer ${activeTab === 'stats'
              ? 'bg-fuchsia-500 text-white shadow-[0_0_15px_rgba(217,70,239,0.4)]'
              : `${surfaceBg} border ${cardBdr} ${textMuted} ${isDark ? 'hover:text-white' : 'hover:text-slate-900'}`
              }`}
          >
            <BarChart2 className="w-4 h-4 shrink-0" />
            <span className="whitespace-nowrap">Stats</span>
          </button>
          <button
            onClick={() => setActiveTab('gallery')}
            className={`shrink-0 min-h-[44px] px-4 sm:px-5 py-2.5 rounded-xl text-xs font-bold tracking-wider uppercase transition-all flex items-center gap-2 cursor-pointer ${activeTab === 'gallery'
              ? 'bg-emerald-500 text-white shadow-[0_0_15px_rgba(16,185,129,0.4)]'
              : `${surfaceBg} border ${cardBdr} ${textMuted} ${isDark ? 'hover:text-white' : 'hover:text-slate-900'}`
              }`}
          >
            <Images className="w-4 h-4 shrink-0" />
            <span className="whitespace-nowrap">Gallery</span>
          </button>
        </div>

        {/* TAB CONTENTS */}
        {activeTab === 'papers' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

            {/* Create New Paper Form (Col-4) */}
            <div className={`lg:col-span-5 ${cardBg} border ${cardBdr} rounded-2xl p-6 self-start ${isDark ? '' : 'shadow-md'}`}>
              <h2 className={`text-lg font-bold ${textPrimary} mb-4 flex items-center gap-2`}>
                <FileText className="w-4 h-4 text-sky-400" />
                නව පත්‍රයක් සාදන්න (Create New Paper)
              </h2>

              <form onSubmit={handleCreatePaper} className="space-y-4">
                <div>
                  <label className={`block text-xs font-semibold ${textMuted} mb-1.5`}>විෂය තෝරන්න (Select Subject)</label>
                  <select
                    value={selectedSubjectId}
                    onChange={(e) => setSelectedSubjectId(e.target.value)}
                    className={`w-full ${inputBg} border ${inputBdr} rounded-xl px-3 py-2 ${textPrimary} text-xs focus:outline-none focus:border-sky-500 transition-colors`}
                  >
                    {subjects.map(sub => (
                      <option key={sub.id} value={sub.id}>
                        [{sub.examType.toUpperCase()}] {sub.name} - {sub.sinhalaName}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className={`block text-xs font-semibold ${textMuted} mb-1.5`}>ප්‍රශ්න පත්‍ර නාමය - ඉංග්‍රීසි (English Title)</label>
                  <input
                    type="text"
                    placeholder="e.g. 2026 A/L Physics MCQ"
                    value={newPaperTitle}
                    onChange={(e) => setNewPaperTitle(e.target.value)}
                    className={`w-full ${inputBg} border ${inputBdr} rounded-xl px-3 py-2 ${textPrimary} text-xs focus:outline-none focus:border-sky-500 transition-colors`}
                  />
                </div>

                <div>
                  <label className={`block text-xs font-semibold ${textMuted} mb-1.5`}>ප්‍රශ්න පත්‍ර නාමය - සිංහල (Sinhala Title)</label>
                  <input
                    type="text"
                    placeholder="e.g. 2026 උසස් පෙළ භෞතික විද්‍යාව"
                    value={newPaperSinhalaTitle}
                    onChange={(e) => setNewPaperSinhalaTitle(e.target.value)}
                    className={`w-full ${inputBg} border ${inputBdr} rounded-xl px-3 py-2 ${textPrimary} text-xs focus:outline-none focus:border-sky-500 transition-colors`}
                  />
                </div>

                <div>
                  <label className={`block text-xs font-semibold ${textMuted} mb-1.5`}>භාෂාව (Language)</label>
                  <select
                    value={newPaperLanguage}
                    onChange={(e) => setNewPaperLanguage(e.target.value as 'si' | 'en')}
                    className={`w-full ${inputBg} border ${inputBdr} rounded-xl px-3 py-2 ${textPrimary} text-xs focus:outline-none focus:border-sky-500 transition-colors`}
                  >
                    <option value="si">Sinhala (සිංහල)</option>
                    <option value="en">English (English)</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={`block text-xs font-semibold ${textMuted} mb-1.5`}>වසර (Year)</label>
                    <input
                      type="number"
                      value={newPaperYear}
                      onChange={(e) => setNewPaperYear(parseInt(e.target.value) || 2026)}
                      className={`w-full ${inputBg} border ${inputBdr} rounded-xl px-3 py-2 ${textPrimary} text-xs focus:outline-none focus:border-sky-500 transition-colors`}
                    />
                  </div>
                  <div>
                    <label className={`block text-xs font-semibold ${textMuted} mb-1.5`}>කාලය (Duration Mins)</label>
                    <input
                      type="number"
                      value={newPaperDuration}
                      onChange={(e) => setNewPaperDuration(parseInt(e.target.value) || 120)}
                      className={`w-full ${inputBg} border ${inputBdr} rounded-xl px-3 py-2 ${textPrimary} text-xs focus:outline-none focus:border-sky-500 transition-colors`}
                    />
                  </div>
                </div>

                {/* Study Material HTML Upload */}
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5 flex items-center gap-1.5">
                    <FileCode className="w-3.5 h-3.5 text-sky-400" />
                    අධ්‍යයන ද්‍රව්‍ය HTML (Study Material — Optional)
                  </label>
                  <label
                    className={`flex items-center gap-3 w-full px-3 py-3 rounded-xl border-2 border-dashed cursor-pointer transition-all ${studyMaterialHtml
                      ? 'border-emerald-500/40 bg-emerald-500/5'
                      : `${isDark ? 'border-slate-700 bg-slate-900/50' : 'border-slate-300 bg-slate-50'} hover:border-sky-500/50`
                      }`}
                  >
                    <input
                      type="file"
                      accept=".html,.htm"
                      ref={studyHtmlInputRef}          // ← Added ref
                      onChange={handleHtmlUpload}
                      className="sr-only"
                    />
                    <Upload className={`w-4 h-4 shrink-0 ${studyMaterialHtml ? 'text-emerald-400' : 'text-slate-500'}`} />
                    <div className="min-w-0">
                      {studyMaterialHtml ? (
                        <span className="text-xs text-emerald-400 font-semibold truncate block">
                          ✓ {studyFileName}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">Click to upload .html file</span>
                      )}
                      {parsedQuestions.length > 0 ? (
                        <span className="text-[10px] text-sky-400 font-bold block mt-0.5">
                          ⚡ {parsedQuestions.length} MCQs detected — will auto-import on create
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-500 block mt-0.5">
                          Colors & fonts will be auto-replaced with site theme
                        </span>
                      )}
                    </div>
                    {studyMaterialHtml && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setStudyMaterialHtml('');
                          setStudyFileName('');
                          setParsedQuestions([]);
                          resetStudyHtmlInput();
                        }}
                        className="ml-auto text-[10px] text-red-400 hover:text-red-300 shrink-0 px-2 py-1 rounded-lg hover:bg-red-500/10 transition-colors"
                      >
                        Remove
                      </button>
                    )}
                  </label>
                </div>

                {/* Text Format Upload */}
                <div className="mt-4">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Import Paper via Text Format (.txt, .json)
                  </label>
                  <input
                    type="file"
                    accept=".txt,.json"
                    onChange={handleTxtPaperUpload}
                    className="block w-full text-sm text-gray-500
                      file:mr-4 file:py-2 file:px-4
                      file:rounded-md file:border-0
                      file:text-sm file:font-semibold
                      file:bg-blue-50 file:text-blue-700
                      hover:file:bg-blue-100
                      dark:file:bg-gray-800 dark:file:text-gray-300"
                  />
                </div>

                {parsedQuestions.length > 0 && (
                  <div className="mt-6 space-y-4 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar border border-gray-200 dark:border-gray-800 rounded-xl p-4 bg-gray-50 dark:bg-gray-900/50">
                    <h3 className="font-bold text-gray-700 dark:text-gray-300">Preview & Edit Parsed Questions</h3>
                    {parsedQuestions.map((q, index) => (
                      <div key={index} className="p-4 border rounded-lg bg-white dark:bg-gray-800 dark:border-gray-700">

                        {/* ===== EDIT MODE ===== */}
                        {editingIndex === index ? (
                          <div className="space-y-4">
                            <h4 className="font-bold text-lg text-blue-600">Editing Question {q.id || index + 1}</h4>

                            {/* Question Text Input */}
                            <div>
                              <label className="block text-sm font-medium mb-1">Question Body (HTML allowed)</label>
                              <textarea
                                value={q.question}
                                onChange={(e) => {
                                  const updated = [...parsedQuestions];
                                  updated[index].question = e.target.value;
                                  setParsedQuestions(updated);
                                }}
                                className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600"
                                rows={4}
                              />
                            </div>

                            {/* Manual Image Upload for this specific question */}
                            <div className="p-4 bg-gray-50 dark:bg-gray-800/50 border border-dashed border-gray-300 dark:border-gray-600 rounded-md">
                              <label className="block text-sm font-medium mb-3 text-gray-700 dark:text-gray-300">
                                🖼️ Upload Missing Diagram/Image
                              </label>
                              <input
                                type="file"
                                accept="image/*"
                                className="block w-full text-sm text-gray-500 dark:text-gray-400
                                  file:mr-4 file:py-2 file:px-4
                                  file:rounded-md file:border-0
                                  file:text-sm file:font-semibold
                                  file:bg-blue-50 file:text-blue-700
                                  hover:file:bg-blue-100
                                  dark:file:bg-blue-900/30 dark:file:text-blue-400
                                  dark:hover:file:bg-blue-900/50 cursor-pointer"
                                onChange={(e) => {
                                  if (e.target.files && e.target.files[0]) {
                                    handleQuestionImageUpload(e.target.files[0], index);
                                  }
                                }}
                              />
                              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                                This will automatically replace the image placeholder.
                              </p>
                            </div>

                            <button
                              type="button"
                              onClick={() => setEditingIndex(null)}
                              className="px-4 py-2 bg-emerald-500 text-white font-semibold text-sm rounded-lg hover:bg-emerald-600 transition-colors"
                            >
                              Done Editing
                            </button>
                          </div>
                        ) : (

                          /* ===== PREVIEW MODE ===== */
                          <div>
                            <div className="flex justify-between items-start mb-2">
                              <h4 className="font-bold text-lg text-gray-500">Q{q.id || index + 1}</h4>
                              <button
                                type="button"
                                onClick={() => setEditingIndex(index)}
                                className="px-3 py-1 text-xs font-semibold bg-blue-100 text-blue-600 rounded-lg hover:bg-blue-200 dark:bg-sky-500/10 dark:text-sky-400 dark:hover:bg-sky-500/20 transition-colors"
                              >
                                Edit Question
                              </button>
                            </div>

                            {/* Safely render the question HTML so you can see if the image works */}
                            <div
                              className="prose dark:prose-invert max-w-none text-sm text-gray-700 dark:text-gray-300"
                              dangerouslySetInnerHTML={{ __html: renderMathInHtml(q.question) }}
                            />

                            <div className="mt-4 pl-4 border-l-2 border-gray-200 dark:border-gray-700 space-y-1">
                              {q.options.map((opt, oIdx) => (
                                <div key={oIdx} className={`text-sm flex gap-1 items-start ${q.correctIndex === oIdx ? "text-emerald-600 dark:text-emerald-400 font-bold" : "text-gray-600 dark:text-gray-400"}`}>
                                  <span>{String.fromCharCode(65 + oIdx)}.</span>
                                  <span dangerouslySetInnerHTML={{ __html: renderMathInHtml(opt) }} />
                                </div>
                              ))}
                            </div>
                            {q.explanation && (
                              <div className="mt-3 p-3 bg-blue-50 dark:bg-sky-900/20 rounded-md text-xs">
                                <strong>Explanation:</strong> <span dangerouslySetInnerHTML={{ __html: renderMathInHtml(q.explanation) }} />
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                <button
                  type="submit"
                  className="w-full py-2.5 bg-sky-500 hover:bg-sky-400 text-white rounded-xl font-bold text-xs tracking-wider transition-all shadow-[0_0_10px_rgba(14,165,233,0.1)] hover:shadow-[0_0_15px_rgba(14,165,233,0.25)] cursor-pointer"
                >
                  නව ප්‍රශ්න පත්‍රය සාදන්න (Create Paper Structure &rarr;)
                </button>
              </form>
            </div>

            {/* Existing Papers List (Col-7) */}
            <div className={`lg:col-span-7 ${cardBg} border ${cardBdr} rounded-2xl p-6 ${isDark ? '' : 'shadow-md'}`}>
              <h2 className={`text-lg font-bold ${textPrimary} mb-4`}>පවතින ප්‍රශ්න පත්‍ර ලැයිස්තුව (Current Active Papers)</h2>

              {papers.length === 0 ? (
                <div className={`text-center py-8 ${isDark ? 'bg-slate-900/20 border-slate-800' : 'bg-slate-50 border-slate-300'} rounded-xl border border-dashed ${textMuted} text-xs`}>
                  ප්‍රශ්න පත්‍ර කිසිවක් සක්‍රිය නැත.
                </div>
              ) : (
                <div className="space-y-3">
                  {papers.map((p) => {
                    const paperQCount = questions.filter(q => q.paperId === p.id).length;
                    const sub = subjects.find(s => s.id === p.subjectId);
                    return (
                      <div
                        key={p.id}
                        className={`flex items-center justify-between p-4 ${isDark ? 'bg-slate-900/50 hover:bg-slate-900 border-slate-800' : 'bg-slate-50 hover:bg-white border-slate-200'} border rounded-xl transition-all`}
                      >
                        {editingPaperId === p.id ? (
                          <div className="flex-1 w-full space-y-3">
                            <div className="flex flex-wrap gap-2 items-center">
                              <select
                                value={editPaperData.language || 'si'}
                                onChange={(e) => setEditPaperData({ ...editPaperData, language: e.target.value as 'si' | 'en' })}
                                className={`text-xs px-2 py-1.5 rounded-md ${inputBg} border ${inputBdr} ${textPrimary} outline-none focus:border-sky-500`}
                              >
                                <option value="si">Sinhala</option>
                                <option value="en">English</option>
                              </select>
                              <input
                                type="number"
                                value={editPaperData.year || 2026}
                                onChange={(e) => setEditPaperData({ ...editPaperData, year: parseInt(e.target.value) || 2026 })}
                                className={`text-xs px-2 py-1.5 w-24 rounded-md ${inputBg} border ${inputBdr} ${textPrimary} outline-none focus:border-sky-500`}
                                placeholder="Year"
                              />
                              <input
                                type="number"
                                value={editPaperData.durationMinutes || 120}
                                onChange={(e) => setEditPaperData({ ...editPaperData, durationMinutes: parseInt(e.target.value) || 120 })}
                                className={`text-xs px-2 py-1.5 w-24 rounded-md ${inputBg} border ${inputBdr} ${textPrimary} outline-none focus:border-sky-500`}
                                placeholder="Duration (mins)"
                              />
                              <span className={`text-xs ${textMuted}`}>mins</span>
                            </div>
                            <input
                              type="text"
                              value={editPaperData.sinhalaTitle || ''}
                              onChange={(e) => setEditPaperData({ ...editPaperData, sinhalaTitle: e.target.value })}
                              className={`w-full text-sm font-semibold px-2 py-1.5 rounded-md ${inputBg} border ${inputBdr} ${textPrimary} outline-none focus:border-sky-500`}
                              placeholder="Sinhala Title"
                            />
                            <input
                              type="text"
                              value={editPaperData.title || ''}
                              onChange={(e) => setEditPaperData({ ...editPaperData, title: e.target.value })}
                              className={`w-full text-xs font-mono px-2 py-1.5 rounded-md ${inputBg} border ${inputBdr} ${textPrimary} outline-none focus:border-sky-500`}
                              placeholder="English Title"
                            />
                            <div className="flex justify-end gap-2 mt-2">
                              <button
                                onClick={() => {
                                  setEditingPaperId(null);
                                  setEditPaperData({});
                                }}
                                className="flex items-center gap-1 px-3 py-1.5 bg-slate-500/10 text-slate-500 hover:bg-slate-500/20 hover:text-slate-700 dark:hover:text-slate-300 rounded-lg text-xs font-semibold transition-colors"
                              >
                                <X className="w-3 h-3" /> Cancel
                              </button>
                              <button
                                onClick={() => {
                                  if (onUpdatePaper && editPaperData) {
                                    onUpdatePaper({ ...p, ...editPaperData } as Paper);
                                    setEditingPaperId(null);
                                    setEditPaperData({});
                                  }
                                }}
                                className="flex items-center gap-1 px-3 py-1.5 bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 hover:text-emerald-600 dark:hover:text-emerald-400 rounded-lg text-xs font-semibold transition-colors"
                              >
                                <Save className="w-3 h-3" /> Save Changes
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className={`text-[10px] ${subtleBg} ${textFaint} px-2 py-0.5 rounded-md font-mono font-bold tracking-wide uppercase`}>
                              {p.examType.toUpperCase()}
                            </span>
                            {onUpdatePaper ? (
                              <select
                                value={p.subjectId}
                                onChange={(e) => {
                                  const newSubId = e.target.value;
                                  const newSub = subjects.find(s => s.id === newSubId);
                                  if (newSub) {
                                    if (confirm(`Move paper "${p.title}" to ${newSub.name}?`)) {
                                      onUpdatePaper({ ...p, subjectId: newSubId, examType: newSub.examType });
                                    }
                                  }
                                }}
                                className="text-[10px] bg-sky-500/15 text-sky-400 px-2 py-0.5 rounded-md font-mono font-semibold outline-none cursor-pointer border border-transparent hover:border-sky-500/30 transition-colors"
                                title="Change Subject Category"
                              >
                                {subjects.map(s => (
                                  <option key={s.id} value={s.id} className={isDark ? 'bg-slate-900 text-white' : 'bg-white text-slate-900'}>
                                    {s.name} ({s.examType.toUpperCase()})
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <span className="text-[10px] bg-sky-500/15 text-sky-400 px-2 py-0.5 rounded-md font-mono font-semibold">
                                {sub?.name || 'Subject'}
                              </span>
                            )}
                            <span className={`text-[10px] px-2 py-0.5 rounded-md font-mono font-semibold ${p.language === 'en' ? 'bg-indigo-500/15 text-indigo-400' : 'bg-emerald-500/15 text-emerald-400'}`}>
                              {p.language === 'en' ? 'EN' : 'SI'}
                            </span>
                          </div>
                          <p className={`text-sm font-semibold ${textPrimary}`}>{p.sinhalaTitle}</p>
                          <p className={`text-xs ${textFaint} font-mono italic`}>{p.title} ({p.year})</p>
                          <div className={`flex items-center gap-4 text-[11px] ${textMuted} mt-1 font-sans`}>
                            <span>⏱️ විනාඩි {p.durationMinutes}</span>
                            <span className={`${subtleBg} px-1.5 py-0.5 rounded text-sky-400 text-[10px] font-mono`}>
                              <strong>{paperQCount}</strong> MCQs Uploaded
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => {
                              setTargetPaperId(p.id);
                              // Calculate next question number
                              const nextNum = questions.filter(q => q.paperId === p.id).length + 1;
                              setQNumber(nextNum);
                              setActiveTab('add-question');
                            }}
                            className="px-3 py-1.5 bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/20 hover:border-sky-500/30 text-sky-450 hover:text-sky-400 rounded-lg text-xs font-semibold cursor-pointer transition-colors"
                          >
                            + ප්‍රශ්න එකතු කරන්න (+ MCQ)
                          </button>

                          <button
                            onClick={() => {
                              setEditingPaperId(p.id);
                              setEditPaperData(p);
                            }}
                            className="p-1.5 hover:bg-amber-500/10 border border-transparent hover:border-amber-500/20 text-slate-500 hover:text-amber-500 rounded-lg transition-all cursor-pointer"
                            title="Edit Paper Details"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>

                          {/* Upload / Replace study HTML for existing paper */}
                          <label
                            title="Upload or replace study material HTML for this paper"
                            className={`p-1.5 border rounded-lg transition-all cursor-pointer ${p.studyMaterialHtml
                              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20'
                              : 'border-transparent text-slate-500 hover:bg-sky-500/10 hover:border-sky-500/20 hover:text-sky-400'
                              }`}
                          >
                            <input
                              type="file"
                              accept=".html,.htm"
                              className="sr-only"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (!file) return;
                                const reader = new FileReader();
                                reader.onload = (ev) => {
                                  const html = ev.target?.result as string;
                                  if (html) onUpdateStudyHtml(p.id, html);
                                };
                                reader.readAsText(file);
                                e.target.value = '';
                              }}
                            />
                            <Upload className="w-4 h-4" />
                          </label>

                          <button
                            onClick={() => {
                              if (confirm(`කරුණාකර තහවුරු කරන්න: ඔබ "${p.sinhalaTitle}" ප්‍රශ්න පත්‍රය සහ එහි ඇති සියලුම ප්‍රශ්න මකාදැමීමට සූදානම්ද?`)) {
                                onDeletePaper(p.id);
                              }
                            }}
                            className="p-1.5 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 text-slate-500 hover:text-red-400 rounded-lg transition-all cursor-pointer"
                            title="Delete entire paper"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </div>
        )}

        {activeTab === 'add-question' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

            {/* HTML Past Paper Form (Col-7) */}
            <form noValidate onSubmit={handleCreateQuestion} className={`lg:col-span-8 ${cardBg} border ${cardBdr} rounded-2xl p-6 space-y-4 ${isDark ? '' : 'shadow-md'}`}>
              <div className={`flex items-center justify-between border-b ${dividerBdr} pb-3 mb-2`}>
                <h2 className={`text-lg font-bold ${textPrimary} flex items-center gap-2`}>
                  <Plus className="w-5 h-5 text-sky-400" />
                  ප්‍රශ්නය ඇතුළත් කරන්න (Add/Upload Question MCQ)
                </h2>

                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs ${textMuted} font-medium`}>විෂය:</span>
                    <select
                      value={filterSubjectId}
                      onChange={(e) => {
                        const newSubjectId = e.target.value;
                        setFilterSubjectId(newSubjectId);
                        const subjectPapers = papers.filter(p => 
                          (!newSubjectId || p.subjectId === newSubjectId) &&
                          (filterLanguage === 'all' || p.language === filterLanguage || (!p.language && filterLanguage === 'si'))
                        );
                        if (subjectPapers.length > 0) {
                          setTargetPaperId(subjectPapers[0].id);
                          const nextNum = questions.filter(q => q.paperId === subjectPapers[0].id).length + 1;
                          setQNumber(nextNum);
                          setOptE('');
                          setCorrectOptions([0]);
                        } else {
                          setTargetPaperId('');
                        }
                      }}
                      className={`${inputBg} border ${inputBdr} rounded-lg px-2.5 py-1 ${textPrimary} text-xs focus:outline-none focus:border-sky-500 cursor-pointer`}
                    >
                      <option value="">සියලුම විෂයයන් (All Subjects)</option>
                      {subjects.map(s => (
                        <option key={s.id} value={s.id}>{s.name} ({s.sinhalaName})</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs ${textMuted} font-medium`}>මාධ්‍යය:</span>
                    <select
                      value={filterLanguage}
                      onChange={(e) => {
                        const newLang = e.target.value as any;
                        setFilterLanguage(newLang);
                        const subjectPapers = papers.filter(p => 
                          (!filterSubjectId || p.subjectId === filterSubjectId) && 
                          (newLang === 'all' || p.language === newLang || (!p.language && newLang === 'si'))
                        );
                        if (subjectPapers.length > 0) {
                          setTargetPaperId(subjectPapers[0].id);
                          const nextNum = questions.filter(q => q.paperId === subjectPapers[0].id).length + 1;
                          setQNumber(nextNum);
                          setOptE('');
                          setCorrectOptions([0]);
                        } else {
                          setTargetPaperId('');
                        }
                      }}
                      className={`${inputBg} border ${inputBdr} rounded-lg px-2.5 py-1 ${textPrimary} text-xs focus:outline-none focus:border-sky-500 cursor-pointer`}
                    >
                      <option value="all">සියලුම මාධ්‍යය (All Mediums)</option>
                      <option value="si">සිංහල මාධ්‍යය (Sinhala)</option>
                      <option value="en">ඉංග්‍රීසි මාධ්‍යය (English)</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs ${textMuted} font-medium`}>ප්‍රශ්න පත්‍රය:</span>
                    <select
                      value={targetPaperId}
                      onChange={(e) => {
                        setTargetPaperId(e.target.value);
                        const nextNum = questions.filter(q => q.paperId === e.target.value).length + 1;
                        setQNumber(nextNum);
                        setOptE(''); // clear E when switching papers
                        setCorrectOptions([0]);
                      }}
                      className={`${inputBg} border ${inputBdr} rounded-lg px-2.5 py-1 ${textPrimary} text-xs focus:outline-none focus:border-sky-500 cursor-pointer`}
                    >
                      {papers.filter(p => 
                        (!filterSubjectId || p.subjectId === filterSubjectId) && 
                        (filterLanguage === 'all' || p.language === filterLanguage || (!p.language && filterLanguage === 'si'))
                      ).map(p => (
                        <option key={p.id} value={p.id}>{p.sinhalaTitle} ({p.year}) {p.language === 'en' ? '[EN]' : '[SI]'}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className={`block text-xs font-semibold ${textMuted} mb-1`}>ප්‍රශ්න අංකය (Q Number)</label>
                  <input
                    type="number"
                    min="1"
                    placeholder="e.g. 1"
                    value={qNumber}
                    onChange={(e) => setQNumber(parseInt(e.target.value) || 1)}
                    className={`w-full ${inputBg} border ${inputBdr} rounded-xl px-3 py-2 ${textPrimary} text-xs focus:outline-none focus:border-sky-500 font-mono`}
                  />
                </div>

                <div className="md:col-span-2">
                </div>
              </div>
              {/* Correct Option */}
              <div>
                <label className={`block text-xs font-semibold ${textMuted} mb-1.5`}>
                  නිවැරදි පිළිතුර (Correct Option)
                </label>

                <div className={`grid gap-2 ${isALPaper ? 'grid-cols-5' : 'grid-cols-4'}`}>
                  {(isALPaper ? [0, 1, 2, 3, 4] : [0, 1, 2, 3]).map((optIdx) => (
                    <button
                      key={optIdx}
                      type="button"
                      onClick={() => {
                        setCorrectOptions(prev => {
                          if (prev.includes(optIdx)) {
                            if (prev.length === 1) return prev; // Keep at least one
                            return prev.filter(x => x !== optIdx);
                          }
                          return [...prev, optIdx].sort((a, b) => a - b);
                        });
                      }}
                      className={`py-1.8 text-xs font-bold rounded-xl border transition-all cursor-pointer ${correctOptions.includes(optIdx)
                        ? 'bg-sky-500 border-sky-400 text-white'
                        : isDark
                          ? 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                          : 'bg-slate-50 border-slate-300 text-slate-500 hover:text-slate-900 hover:bg-slate-100'
                        }`}
                    >
                      Option {String.fromCharCode(65 + optIdx)}
                    </button>
                  ))}
                </div>

                <div className="mt-3 flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="isAllCorrect"
                    checked={isAllCorrect}
                    onChange={(e) => setIsAllCorrect(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-sky-500 focus:ring-sky-500 cursor-pointer"
                  />
                  <label htmlFor="isAllCorrect" className={`text-xs font-semibold ${textMuted} cursor-pointer`}>
                    සියලුම පිළිතුරු නිවැරදියි (All Answers Correct / 'All')
                  </label>
                </div>
              </div>

              {/* Question HTML */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className={`block text-xs font-semibold ${textMuted}`}>
                    ප්‍රශ්නය - HTML / රූපය
                  </label>
                  <label className="flex items-center gap-1 text-[10px] text-sky-400 font-semibold cursor-pointer hover:text-sky-300 transition-colors">
                    <Image className="w-3 h-3" />
                    Ref image
                    <input
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleImageFileUpload(file, (html) => setQuestionHtml((prev) => appendHtml(prev, html)));
                        e.target.value = '';
                      }}
                    />
                  </label>
                </div>

                <RichTextEditor
                  value={questionHtml}
                  onChange={setQuestionHtml}
                  placeholder="ප්‍රශ්නය මෙහි ටයිප් කරන්න…"
                  minHeight="96px"
                />
              </div>

              {/* Options A, B, C, D — text or image */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {([
                  ['A', optA, setOptA] as const,
                  ['B', optB, setOptB] as const,
                  ['C', optC, setOptC] as const,
                  ['D', optD, setOptD] as const,
                  ...(isALPaper ? [['E', optE, setOptE] as const] : []),
                ]).map(([label, value, setter]) => (
                  <div key={label}>
                    <div className="flex items-center justify-between mb-1">
                      <label className={`text-xs font-semibold ${textMuted} flex items-center gap-1.5`}>
                        <span className={`w-5 h-5 rounded-full ${isDark ? 'bg-slate-850 border-slate-800 text-slate-300' : 'bg-slate-100 border-slate-300 text-slate-600'} border font-mono text-[10px] font-bold flex items-center justify-center`}>{label}</span>
                        පිළිතුර {label} — Text / Image
                      </label>
                      <label className="flex items-center gap-1 text-[10px] text-sky-400 font-semibold cursor-pointer hover:text-sky-300 transition-colors">
                        <Image className="w-3 h-3" />
                        Image
                        <input
                          type="file"
                          accept="image/*"
                          className="sr-only"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleImageFileUpload(file, setter, 'mhw-opt-img');
                            e.target.value = '';
                          }}
                        />
                      </label>
                    </div>
                    {value.includes('<img') ? (
                      <input
                        type="text"
                        readOnly
                        placeholder="Image answer loaded"
                        value=""
                        className={`w-full ${inputBg} border ${inputBdr} rounded-xl px-3 py-2 ${textPrimary} text-xs focus:outline-none focus:border-sky-500 opacity-60`}
                      />
                    ) : (
                      <MathTextInput
                        value={value}
                        onChange={setter}
                        placeholder="e.g. 50 Hz, 230 V, or paste an equation"
                      />
                    )}
                    {value.includes('<img') && (
                      <div className="mt-1.5 flex items-center gap-2">
                        <div
                          className={`p-1.5 ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-slate-50 border-slate-200'} border rounded-lg overflow-hidden max-h-20`}
                          dangerouslySetInnerHTML={{ __html: renderMathInHtml(value) }}
                        />
                        <button
                          type="button"
                          onClick={() => setter('')}
                          className="text-[10px] text-red-400 hover:text-red-300 shrink-0 cursor-pointer"
                        >
                          Clear
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className={`block text-xs font-semibold ${textMuted}`}>විවරණය (Explanation — Optional)</label>
                  <label className="flex items-center gap-1 text-[10px] text-sky-400 font-semibold cursor-pointer hover:text-sky-300 transition-colors">
                    <Image className="w-3 h-3" />
                    Image
                    <input
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleImageFileUpload(file, (html) => setExplanationHtml((prev) => appendHtml(prev, html)));
                        e.target.value = '';
                      }}
                    />
                  </label>
                </div>
                <RichTextEditor
                  value={explanationHtml}
                  onChange={setExplanationHtml}
                  placeholder="විවරණය මෙහි ටයිප් කරන්න…"
                  minHeight="80px"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('papers');
                  }}
                  className={`px-5 py-2.5 rounded-xl text-xs font-semibold tracking-wider transition-colors cursor-pointer border ${isDark ? 'bg-slate-900 hover:bg-slate-850 text-slate-400 hover:text-white border-slate-800/80' : 'bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 border-slate-300'}`}
                >
                  ආපසු (Cancel)
                </button>
                <button
                  type="submit"
                  className="px-8 py-2.5 bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-450 hover:to-blue-500 text-white rounded-xl font-bold text-xs tracking-widest transition-all shadow-[0_0_15px_rgba(14,165,233,0.2)] hover:shadow-[0_0_20px_rgba(14,165,233,0.35)] cursor-pointer"
                >
                  ප්‍රශ්නය සුරකින්න (Save Question &rarr;)
                </button>
              </div>
            </form>

            {/* HTML guidelines (Col-4) */}
            <div className="lg:col-span-4 space-y-4 self-start">
              <div className={`${cardBg} border ${cardBdr} rounded-2xl p-5 space-y-4 ${isDark ? '' : 'shadow-md'}`}>
                <h3 className={`text-sm font-bold flex items-center gap-1.5 border-b ${dividerBdr} pb-2 ${textPrimary}`}>
                  <CircleHelp className="w-4 h-4 text-sky-400" />
                  HTML &amp; Image Guidelines
                </h3>

                <div className={`text-[11px] ${textMuted} space-y-2.5 leading-relaxed`}>
                  <p>Use standard HTML tags to upload complex formulas or special characters:</p>

                  <div>
                    <span className={`font-mono px-1 py-0.5 rounded text-[10px] ${isDark ? 'bg-slate-900 text-cyan-400' : 'bg-slate-100 text-cyan-700'}`}>&lt;sub&gt;</span>
                    <p className="mt-0.5">For subscripts (e.g. c<sub>rms</sub> write: <code className={`text-[10px] ${isDark ? 'text-white' : 'text-slate-800 font-semibold'}`}>c&lt;sub&gt;rms&lt;/sub&gt;</code>)</p>
                  </div>

                  <div>
                    <span className={`font-mono px-1 py-0.5 rounded text-[10px] ${isDark ? 'bg-slate-900 text-cyan-400' : 'bg-slate-100 text-cyan-700'}`}>&lt;sup&gt;</span>
                    <p className="mt-0.5">For superscripts / powers (e.g. m s<sup>-2</sup> write: <code className={`text-[10px] ${isDark ? 'text-white' : 'text-slate-800 font-semibold'}`}>m s&lt;sup&gt;-2&lt;/sup&gt;</code>)</p>
                  </div>

                  <div>
                    <span className={`font-mono px-1 py-0.5 rounded text-[10px] ${isDark ? 'bg-slate-900 text-cyan-400' : 'bg-slate-100 text-cyan-700'}`}>&amp;radic;</span>
                    <p className="mt-0.5">For square roots: <code className={`text-[10px] ${isDark ? 'text-white' : 'text-slate-800 font-semibold'}`}>&amp;radic;(2GM / R)</code></p>
                  </div>

                  <div>
                    <span className={`font-mono px-1 py-0.5 rounded text-[10px] ${isDark ? 'bg-slate-900 text-cyan-400' : 'bg-slate-100 text-cyan-700'}`}>&amp;prop;</span>
                    <p className="mt-0.5">Proportional symbol: <code className={`text-[10px] ${isDark ? 'text-white' : 'text-slate-800 font-semibold'}`}>&amp;prop;</code></p>
                  </div>

                  <div>
                    <span className={`font-mono px-1 py-0.5 rounded text-[10px] ${isDark ? 'bg-slate-900 text-cyan-400' : 'bg-slate-100 text-cyan-700'}`}>&amp;theta; &amp;lambda; &amp;times;</span>
                    <p className="mt-0.5">Greek symbols: <code className={`text-[10px] ${isDark ? 'text-white' : 'text-slate-800 font-semibold'}`}>&amp;theta;</code> (&theta;), <code className={`text-[10px] ${isDark ? 'text-white' : 'text-slate-800 font-semibold'}`}>&amp;lambda;</code> (&lambda;), <code className={`text-[10px] ${isDark ? 'text-white' : 'text-slate-800 font-semibold'}`}>&amp;times;</code> (&times;)</p>
                  </div>

                  <div className={`pt-2 border-t ${dividerBdr}`}>
                    <p className={`font-semibold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>Images in questions &amp; answers:</p>
                    <p className="mt-1">Upload a reference diagram for the question, or image files for options A–D.</p>
                  </div>

                  <div className={`pt-2 border-t ${dividerBdr}`}>
                    <p className={`font-semibold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>Preview Sample:</p>
                    <div className={`p-2.5 border rounded-lg text-[10px] font-mono leading-normal mt-1 ${isDark ? 'bg-slate-900 border-slate-800 text-slate-300' : 'bg-slate-50 border-slate-300 text-slate-600'}`}>
                      &lt;p&gt;Acceleration a &amp;prop; F&lt;/p&gt;<br />
                      &lt;p&gt;H&lt;sub&gt;2&lt;/sub&gt;O molecule&lt;/p&gt;
                    </div>
                  </div>
                </div>
              </div>
            </div>

          </div>
        )}

        {activeTab === 'manage-questions' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            <div className={`lg:col-span-12 ${cardBg} border ${cardBdr} rounded-2xl p-6 space-y-6 ${isDark ? '' : 'shadow-md'}`}>
              <div className={`flex items-center justify-between border-b ${dividerBdr} pb-4`}>
                <h2 className={`text-lg font-bold ${textPrimary} flex items-center gap-2`}>
                  ප්‍රශ්න මකන්න (Delete Questions)
                </h2>
                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs ${textMuted} font-medium`}>විෂය:</span>
                    <select
                      value={filterSubjectId}
                      onChange={(e) => {
                        const newSubjectId = e.target.value;
                        setFilterSubjectId(newSubjectId);
                        const subjectPapers = papers.filter(p => 
                          (!newSubjectId || p.subjectId === newSubjectId) &&
                          (filterLanguage === 'all' || p.language === filterLanguage || (!p.language && filterLanguage === 'si'))
                        );
                        if (subjectPapers.length > 0) {
                          setTargetPaperId(subjectPapers[0].id);
                        } else {
                          setTargetPaperId('');
                        }
                      }}
                      className={`${inputBg} border ${inputBdr} rounded-lg px-3 py-1.5 ${textPrimary} text-xs focus:outline-none focus:border-red-500 cursor-pointer`}
                    >
                      <option value="">සියලුම විෂයයන් (All Subjects)</option>
                      {subjects.map(s => (
                        <option key={s.id} value={s.id}>{s.name} ({s.sinhalaName})</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs ${textMuted} font-medium`}>මාධ්‍යය:</span>
                    <select
                      value={filterLanguage}
                      onChange={(e) => {
                        const newLang = e.target.value as any;
                        setFilterLanguage(newLang);
                        const subjectPapers = papers.filter(p => 
                          (!filterSubjectId || p.subjectId === filterSubjectId) && 
                          (newLang === 'all' || p.language === newLang || (!p.language && newLang === 'si'))
                        );
                        if (subjectPapers.length > 0) {
                          setTargetPaperId(subjectPapers[0].id);
                        } else {
                          setTargetPaperId('');
                        }
                      }}
                      className={`${inputBg} border ${inputBdr} rounded-lg px-3 py-1.5 ${textPrimary} text-xs focus:outline-none focus:border-red-500 cursor-pointer`}
                    >
                      <option value="all">සියලුම මාධ්‍යය (All Mediums)</option>
                      <option value="si">සිංහල මාධ්‍යය (Sinhala)</option>
                      <option value="en">ඉංග්‍රීසි මාධ්‍යය (English)</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs ${textMuted} font-medium`}>ප්‍රශ්න පත්‍රය:</span>
                    <select
                      value={targetPaperId}
                      onChange={(e) => setTargetPaperId(e.target.value)}
                      className={`${inputBg} border ${inputBdr} rounded-lg px-3 py-1.5 ${textPrimary} text-xs focus:outline-none focus:border-red-500 cursor-pointer`}
                    >
                      {papers.filter(p => 
                        (!filterSubjectId || p.subjectId === filterSubjectId) &&
                        (filterLanguage === 'all' || p.language === filterLanguage || (!p.language && filterLanguage === 'si'))
                      ).map(p => (
                        <option key={p.id} value={p.id}>{p.sinhalaTitle} ({p.year}) {p.language === 'en' ? '[EN]' : '[SI]'}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                {questions.filter(q => q.paperId === targetPaperId).length === 0 ? (
                  <p className={`text-sm ${textMuted} text-center py-8`}>මෙම ප්‍රශ්න පත්‍රයේ ප්‍රශ්න නොමැත. (No questions found in this paper.)</p>
                ) : (
                  questions
                    .filter(q => q.paperId === targetPaperId)
                    .sort((a, b) => a.qNumber - b.qNumber)
                    .map(q => (
                      <div key={q.id} className={`flex items-start justify-between p-4 rounded-xl border ${subtleBdr} ${subtleBg}`}>
                        <div className="flex-1 min-w-0 pr-4">
                          <div className={`font-bold text-sm ${textPrimary} mb-2`}>ප්‍රශ්න අංකය (Q Number): {q.qNumber}</div>
                          <div className={`text-xs ${textMuted} line-clamp-2 overflow-hidden mb-2`} dangerouslySetInnerHTML={{ __html: renderMathInHtml(q.questionHtml) }} />
                          <div className="pl-2 border-l-2 border-slate-300 dark:border-slate-700 space-y-1">
                            {q.optionsHtml.map((opt, oIdx) => (
                              <div key={oIdx} className={`text-xs flex gap-1 items-start ${(q.correctOptions?.includes(oIdx) ?? q.correctOption === oIdx) ? 'text-emerald-500 font-bold' : textMuted}`}>
                                <span>{String.fromCharCode(65 + oIdx)}.</span>
                                <span dangerouslySetInnerHTML={{ __html: renderMathInHtml(opt) }} />
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="flex flex-col gap-2">
                          <button
                            onClick={() => {
                              if (window.confirm(`Are you sure you want to delete Question ${q.qNumber}?`)) {
                                onDeleteQuestion(q.id);
                                showFlash(`Question ${q.qNumber} deleted!`);
                              }
                            }}
                            className="shrink-0 px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 hover:text-red-600 border border-red-500/20 rounded-lg text-xs font-bold transition-colors cursor-pointer"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'edit-questions' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            <div className={`lg:col-span-12 ${cardBg} border ${cardBdr} rounded-2xl p-6 space-y-6 ${isDark ? '' : 'shadow-md'}`}>
              <div className={`flex items-center justify-between border-b ${dividerBdr} pb-4`}>
                <h2 className={`text-lg font-bold ${textPrimary} flex items-center gap-2`}>
                  ප්‍රශ්න සංස්කරණය (Edit Questions)
                </h2>
                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs ${textMuted} font-medium`}>විෂය:</span>
                    <select
                      value={filterSubjectId}
                      onChange={(e) => {
                        const newSubjectId = e.target.value;
                        setFilterSubjectId(newSubjectId);
                        const subjectPapers = papers.filter(p => 
                          (!newSubjectId || p.subjectId === newSubjectId) &&
                          (filterLanguage === 'all' || p.language === filterLanguage || (!p.language && filterLanguage === 'si'))
                        );
                        if (subjectPapers.length > 0) {
                          setTargetPaperId(subjectPapers[0].id);
                        } else {
                          setTargetPaperId('');
                        }
                      }}
                      className={`${inputBg} border ${inputBdr} rounded-lg px-3 py-1.5 ${textPrimary} text-xs focus:outline-none focus:border-blue-500 cursor-pointer`}
                    >
                      <option value="">සියලුම විෂයයන් (All Subjects)</option>
                      {subjects.map(s => (
                        <option key={s.id} value={s.id}>{s.name} ({s.sinhalaName})</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs ${textMuted} font-medium`}>මාධ්‍යය:</span>
                    <select
                      value={filterLanguage}
                      onChange={(e) => {
                        const newLang = e.target.value as any;
                        setFilterLanguage(newLang);
                        const subjectPapers = papers.filter(p => 
                          (!filterSubjectId || p.subjectId === filterSubjectId) && 
                          (newLang === 'all' || p.language === newLang || (!p.language && newLang === 'si'))
                        );
                        if (subjectPapers.length > 0) {
                          setTargetPaperId(subjectPapers[0].id);
                        } else {
                          setTargetPaperId('');
                        }
                      }}
                      className={`${inputBg} border ${inputBdr} rounded-lg px-3 py-1.5 ${textPrimary} text-xs focus:outline-none focus:border-blue-500 cursor-pointer`}
                    >
                      <option value="all">සියලුම මාධ්‍යය (All Mediums)</option>
                      <option value="si">සිංහල මාධ්‍යය (Sinhala)</option>
                      <option value="en">ඉංග්‍රීසි මාධ්‍යය (English)</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs ${textMuted} font-medium`}>ප්‍රශ්න පත්‍රය:</span>
                    <select
                      value={targetPaperId}
                      onChange={(e) => setTargetPaperId(e.target.value)}
                      className={`${inputBg} border ${inputBdr} rounded-lg px-3 py-1.5 ${textPrimary} text-xs focus:outline-none focus:border-blue-500 cursor-pointer`}
                    >
                      {papers.filter(p => 
                        (!filterSubjectId || p.subjectId === filterSubjectId) &&
                        (filterLanguage === 'all' || p.language === filterLanguage || (!p.language && filterLanguage === 'si'))
                      ).map(p => (
                        <option key={p.id} value={p.id}>{p.sinhalaTitle} ({p.year}) {p.language === 'en' ? '[EN]' : '[SI]'}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                {questions.filter(q => q.paperId === targetPaperId).length === 0 ? (
                  <p className={`text-sm ${textMuted} text-center py-8`}>මෙම ප්‍රශ්න පත්‍රයේ ප්‍රශ්න නොමැත. (No questions found in this paper.)</p>
                ) : (
                  questions
                    .filter(q => q.paperId === targetPaperId)
                    .sort((a, b) => a.qNumber - b.qNumber)
                    .map(q => (
                      <div key={q.id} className={`flex items-start justify-between p-4 rounded-xl border ${subtleBdr} ${subtleBg}`}>
                        {/* ===== LIVE EDIT MODE ===== */}
                        {editingLiveId === q.id && liveEditData ? (
                          <div className="space-y-4 w-full">
                            <div className="flex justify-between items-center">
                              <h4 className="font-bold text-lg text-blue-600">Editing Question {liveEditData.qNumber}</h4>
                            </div>

                            {/* Live Preview Section */}
                            <div className={`p-4 border rounded-xl ${surfaceBg} ${surfaceBdr}`}>
                              <h5 className="font-bold text-sm mb-4 text-emerald-500">Live Preview</h5>
                              <div className={`text-sm ${textPrimary} mb-4`} dangerouslySetInnerHTML={{ __html: renderMathInHtml(liveEditData.questionHtml) }} />

                              {/* Ref Images Preview & Delete */}
                              <div className="flex flex-wrap gap-4 mb-4">
                                {(() => {
                                  const allImages = [
                                    ...extractImages(liveEditData.questionHtml).map(src => ({ src, field: 'questionHtml' as const, oIdx: undefined })),
                                    ...extractImages(liveEditData.explanationHtml || '').map(src => ({ src, field: 'explanationHtml' as const, oIdx: undefined })),
                                    ...liveEditData.optionsHtml.flatMap((opt, oIdx) => extractImages(opt).map(src => ({ src, field: 'optionsHtml' as const, oIdx })))
                                  ];

                                  return allImages.map(({ src, field, oIdx }, i) => (
                                    <div key={i} className={`relative border ${inputBdr} p-2 rounded-lg ${subtleBg} inline-block`}>
                                      <img src={src} className="max-h-48 object-contain" alt="Ref Image" />
                                      <div className="text-[10px] text-gray-500 mt-1 uppercase text-center w-full">{field === 'optionsHtml' ? `Option ${String.fromCharCode(65 + (oIdx || 0))}` : field === 'questionHtml' ? 'Question Body' : 'Explanation'}</div>
                                      <button
                                        onClick={() => handleDeleteImage(src, field, oIdx)}
                                        className="absolute -top-2 -right-2 bg-red-500 hover:bg-red-600 text-white rounded-full p-1 shadow-md"
                                        title="Delete Image"
                                      >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                      </button>
                                    </div>
                                  ));
                                })()}
                              </div>

                              <div className="pl-4 border-l-2 border-slate-300 dark:border-slate-700 space-y-2">
                                {liveEditData.optionsHtml.map((opt, oIdx) => (
                                  <div key={oIdx} className={`text-sm flex gap-2 items-start ${(liveEditData!.correctOptions?.includes(oIdx) ?? liveEditData!.correctOption === oIdx) ? 'text-emerald-500 font-bold' : textMuted}`}>
                                    <span className="mt-1">{String.fromCharCode(65 + oIdx)}.</span>
                                    <span dangerouslySetInnerHTML={{ __html: renderMathInHtml(opt) }} />
                                  </div>
                                ))}
                              </div>
                            </div>

                            {/* Question Text Input */}
                            <div>
                              <div className="flex justify-between items-center mb-1">
                                <label className="block text-sm font-medium">Question Body (HTML allowed)</label>
                                <label className="flex items-center gap-1 text-[10px] text-sky-400 font-semibold cursor-pointer hover:text-sky-300 transition-colors">
                                  <Image className="w-3 h-3" />
                                  Ref image
                                  <input
                                    type="file"
                                    accept="image/*"
                                    className="sr-only"
                                    onChange={(e) => {
                                      const file = e.target.files?.[0];
                                      if (file) handleImageFileUpload(file, (html) => setLiveEditData({ ...liveEditData, questionHtml: appendHtml(liveEditData.questionHtml, html) }));
                                      e.target.value = '';
                                    }}
                                  />
                                </label>
                              </div>
                              <textarea
                                value={liveEditData.questionHtml}
                                onChange={(e) => setLiveEditData({ ...liveEditData, questionHtml: e.target.value })}
                                className={`w-full p-2 border rounded text-sm ${inputBg} ${inputBdr} ${textPrimary}`}
                                rows={5}
                              />
                            </div>

                            {/* Options */}
                            <div className="space-y-2">
                              <label className="block text-sm font-medium mb-1">Options (Check the radio button for correct answer)</label>
                              {liveEditData.optionsHtml.map((opt, oIdx) => (
                                <div key={oIdx} className="flex gap-2 items-center">
                                  <span className="font-bold w-4">{String.fromCharCode(65 + oIdx)}.</span>
                                  <label className="flex items-center gap-1 text-[10px] text-sky-400 font-semibold cursor-pointer hover:text-sky-300 transition-colors shrink-0">
                                    <Image className="w-3 h-3" />
                                    Image
                                    <input
                                      type="file"
                                      accept="image/*"
                                      className="sr-only"
                                      onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file) handleImageFileUpload(file, (html) => {
                                          const newOpts = [...liveEditData.optionsHtml];
                                          newOpts[oIdx] = appendHtml(newOpts[oIdx], html);
                                          setLiveEditData({ ...liveEditData, optionsHtml: newOpts as any });
                                        }, 'mhw-opt-img');
                                        e.target.value = '';
                                      }}
                                    />
                                  </label>
                                  <textarea
                                    value={opt}
                                    onChange={(e) => {
                                      const newOpts = [...liveEditData.optionsHtml];
                                      newOpts[oIdx] = e.target.value;
                                      setLiveEditData({ ...liveEditData, optionsHtml: newOpts as any });
                                    }}
                                    className={`flex-1 p-1.5 border rounded text-sm ${inputBg} ${inputBdr} ${textPrimary}`}
                                    rows={3}
                                  />
                                  <label className="flex flex-col items-center justify-center gap-1 cursor-pointer bg-slate-50 dark:bg-slate-800 border dark:border-slate-700 p-2 rounded hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
                                    <input
                                      type="checkbox"
                                      name={`correctOption_${q.id}_${oIdx}`}
                                      checked={(liveEditData.correctOptions || [liveEditData.correctOption]).includes(oIdx)}
                                      onChange={() => {
                                        const currentOpts = liveEditData.correctOptions || [liveEditData.correctOption];
                                        let newOpts;
                                        if (currentOpts.includes(oIdx)) {
                                          if (currentOpts.length === 1) return; // Keep at least one
                                          newOpts = currentOpts.filter(x => x !== oIdx);
                                        } else {
                                          newOpts = [...currentOpts, oIdx].sort((a, b) => a - b);
                                        }
                                        setLiveEditData({
                                          ...liveEditData,
                                          correctOption: newOpts[0] as any,
                                          correctOptions: newOpts
                                        });
                                      }}
                                      className="w-4 h-4 cursor-pointer"
                                    />
                                    <span className="text-[10px] font-bold text-gray-500">Correct</span>
                                  </label>
                                </div>
                              ))}
                            </div>

                            <div className="mt-3 flex items-center gap-2 mb-4">
                              <input
                                type="checkbox"
                                id={`liveEdit_allCorrect_${q.id}`}
                                checked={liveEditData.isAllCorrect || false}
                                onChange={(e) => setLiveEditData({ ...liveEditData, isAllCorrect: e.target.checked })}
                                className="w-4 h-4 rounded border-slate-300 text-sky-500 focus:ring-sky-500 cursor-pointer"
                              />
                              <label htmlFor={`liveEdit_allCorrect_${q.id}`} className="text-sm font-semibold text-gray-700 dark:text-gray-300 cursor-pointer">
                                All Answers Correct ('All')
                              </label>
                            </div>

                            {/* Explanation */}
                            <div>
                              <div className="flex justify-between items-center mb-1">
                                <label className="block text-sm font-medium">Explanation (Optional)</label>
                                <label className="flex items-center gap-1 text-[10px] text-sky-400 font-semibold cursor-pointer hover:text-sky-300 transition-colors">
                                  <Image className="w-3 h-3" />
                                  Image
                                  <input
                                    type="file"
                                    accept="image/*"
                                    className="sr-only"
                                    onChange={(e) => {
                                      const file = e.target.files?.[0];
                                      if (file) handleImageFileUpload(file, (html) => setLiveEditData({ ...liveEditData, explanationHtml: appendHtml(liveEditData.explanationHtml || '', html) }));
                                      e.target.value = '';
                                    }}
                                  />
                                </label>
                              </div>
                              <textarea
                                value={liveEditData.explanationHtml || ''}
                                onChange={(e) => setLiveEditData({ ...liveEditData, explanationHtml: e.target.value })}
                                className={`w-full p-2 border rounded text-sm ${inputBg} ${inputBdr} ${textPrimary}`}
                                rows={3}
                              />
                            </div>

                            <div className="flex gap-2 pt-2">
                              <button
                                type="button"
                                onClick={() => handleUpdateLiveQuestion(q.id, liveEditData)}
                                className="px-4 py-2 bg-blue-600 text-white font-semibold text-sm rounded-lg hover:bg-blue-700 transition-colors"
                              >
                                Save Changes to Database
                              </button>
                              <button
                                type="button"
                                onClick={() => { setEditingLiveId(null); setLiveEditData(null); }}
                                className="px-4 py-2 bg-slate-500 text-white font-semibold text-sm rounded-lg hover:bg-slate-600 transition-colors"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex-1 min-w-0 pr-4">
                            <div className={`font-bold text-sm ${textPrimary} mb-2`}>ප්‍රශ්න අංකය (Q Number): {q.qNumber}</div>
                            <div className={`text-xs ${textMuted} line-clamp-2 overflow-hidden mb-2`} dangerouslySetInnerHTML={{ __html: renderMathInHtml(q.questionHtml) }} />
                            <div className="pl-2 border-l-2 border-slate-300 dark:border-slate-700 space-y-1">
                              {q.optionsHtml.map((opt, oIdx) => (
                                <div key={oIdx} className={`text-xs flex gap-1 items-start ${(q.correctOptions?.includes(oIdx) ?? q.correctOption === oIdx) ? 'text-blue-500 font-bold' : textMuted}`}>
                                  <span>{String.fromCharCode(65 + oIdx)}.</span>
                                  <span dangerouslySetInnerHTML={{ __html: renderMathInHtml(opt) }} />
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Buttons: only show if not currently editing this specific question */}
                        {editingLiveId !== q.id && (
                          <div className="flex flex-col gap-2">
                            <button
                              onClick={() => {
                                setEditingLiveId(q.id);
                                setLiveEditData({
                                  ...q,
                                  questionHtml: unrenderMathHtml(q.questionHtml),
                                  optionsHtml: q.optionsHtml.map(o => unrenderMathHtml(o)) as any,
                                  explanationHtml: q.explanationHtml ? unrenderMathHtml(q.explanationHtml) : undefined
                                });
                              }}
                              className="shrink-0 px-4 py-2 bg-blue-500/10 hover:bg-blue-500/20 text-blue-500 hover:text-blue-600 border border-blue-500/20 rounded-lg text-xs font-bold transition-colors cursor-pointer"
                            >
                              Edit Question
                            </button>
                          </div>
                        )}
                      </div>
                    ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* ABOUT US EDIT TAB */}
        {activeTab === 'about' && (
          <div className={`space-y-6 p-6 ${cardBg} rounded-2xl border ${cardBdr}`}>
            <h3 className={`text-xl font-bold ${textPrimary}`}>Edit "About Us" Page</h3>

            {/* Description Text */}
            <div>
              <label className={`block text-sm font-medium ${textMuted} mb-2`}>Description / Story</label>
              <textarea
                value={aboutData.description}
                onChange={(e) => setAboutData({ ...aboutData, description: e.target.value })}
                className={`w-full p-3 ${inputBg} border ${inputBdr} rounded-xl ${textPrimary} focus:ring-2 focus:ring-sky-500`}
                rows={6}
              />
            </div>

            {/* Image Upload */}
            <div className={`p-4 border border-dashed ${surfaceBdr} rounded-xl ${subtleBg}`}>
              <label className={`block text-sm font-medium ${textMuted} mb-2`}>Upload Profile/Team Photo</label>
              {aboutData.image_url && (
                <div className="mb-4 relative inline-block">
                  <img src={aboutData.image_url} alt="Current" className="h-32 object-cover rounded-lg shadow-md" />
                  <button
                    type="button"
                    onClick={async () => {
                      const url = aboutData.image_url;
                      if (url && url.includes('supabase.co/storage/v1/object/public/question-images/')) {
                        const fileName = url.split('question-images/')[1];
                        if (fileName) {
                          try {
                            await supabase.storage.from('question-images').remove([fileName]);
                          } catch (e) {
                            console.error("Failed to delete from storage", e);
                          }
                        }
                      }
                      const newAboutData = { ...aboutData, image_url: '' };
                      setAboutData(newAboutData);

                      // Auto-save the deletion
                      try {
                        await supabase.from('about_us').upsert({ id: 1, ...newAboutData }, { onConflict: 'id' });
                        await idbSet('m_about_us', JSON.stringify(newAboutData));
                        onAboutUpdate?.(newAboutData);
                      } catch (err) {
                        console.error("Failed to update about us table", err);
                      }
                    }}
                    className="absolute -top-2 -right-2 bg-red-500 text-white p-1 rounded-full hover:bg-red-600 shadow-md transition-colors"
                    title="Remove Image"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              )}
              <input
                type="file"
                accept="image/*"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;

                  // 1. If an image already exists, delete it first to prevent orphaned files
                  if (aboutData.image_url) {
                    const url = aboutData.image_url;
                    if (url && url.includes('supabase.co/storage/v1/object/public/question-images/')) {
                      const oldFileName = url.split('question-images/')[1];
                      if (oldFileName) {
                        try {
                          await supabase.storage.from('question-images').remove([oldFileName]);
                        } catch (err) {
                          console.error("Error removing old image", err);
                        }
                      }
                    }
                  }

                  // 2. Upload new image
                  const fileExt = file.name.split('.').pop();
                  const fileName = `about-${Date.now()}.${fileExt}`;
                  const { error } = await supabase.storage.from('question-images').upload(fileName, file);

                  if (!error) {
                    const { data: { publicUrl } } = supabase.storage.from('question-images').getPublicUrl(fileName);
                    const newAboutData = { ...aboutData, image_url: publicUrl };
                    setAboutData(newAboutData);

                    // 3. Auto-save the new image URL to the database immediately
                    try {
                      await supabase.from('about_us').upsert({ id: 1, ...newAboutData }, { onConflict: 'id' });
                      await idbSet('m_about_us', JSON.stringify(newAboutData));
                      onAboutUpdate?.(newAboutData);
                      alert("Image uploaded and saved successfully!");
                    } catch (err: any) {
                      console.error("Failed to save to database", err);
                      alert("Image uploaded but failed to save to database: " + err.message);
                    }
                  } else {
                    alert("Error uploading image: " + error.message);
                  }

                  // Reset input
                  e.target.value = '';
                }}
                className={`block w-full text-sm ${textMuted} file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-sky-500/10 file:text-sky-500 hover:file:bg-sky-500/20`}
              />
            </div>

            {/* Privacy Policy Statement */}
            <div>
              <label className={`block text-sm font-medium ${textMuted} mb-2`}>Privacy Policy Additional Statement (Optional)</label>
              <p className={`text-xs ${textMuted} mb-2`}>This text will be injected at the top of the privacy policy HTML page.</p>
              <textarea
                value={aboutData.privacy_policy_statement || ''}
                onChange={(e) => setAboutData({ ...aboutData, privacy_policy_statement: e.target.value })}
                className={`w-full p-3 ${inputBg} border ${inputBdr} rounded-xl ${textPrimary} focus:ring-2 focus:ring-sky-500`}
                rows={4}
                placeholder="e.g. We have recently updated our policy regarding data collection..."
              />
            </div>

            {/* Social Links */}
            <div className="space-y-4">
              <h4 className={`font-bold ${textPrimary}`}>Social Media Links</h4>
              {['facebook_link', 'youtube_link', 'linkedin_link'].map((platform) => (
                <div key={platform} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                  <span className={`w-32 text-sm ${textMuted} uppercase tracking-wider font-bold`}>{platform.split('_')[0]}</span>
                  <input
                    type="text"
                    placeholder="https://"
                    value={aboutData[platform as keyof typeof aboutData] as string}
                    onChange={(e) => setAboutData({ ...aboutData, [platform]: e.target.value })}
                    className={`flex-1 p-3 ${inputBg} border ${inputBdr} rounded-xl ${textPrimary} focus:ring-2 focus:ring-sky-500`}
                  />
                </div>
              ))}
            </div>

            {/* Save Button & Advanced Editors */}
            <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex gap-4 flex-wrap">
              <button
                onClick={async () => {
                  try {
                    const { error } = await supabase.from('about_us').upsert({ id: 1, ...aboutData }, { onConflict: 'id' });
                    if (error) throw error;
                    await idbSet('m_about_us', JSON.stringify(aboutData));
                    onAboutUpdate?.(aboutData);
                    alert("About Us page updated live!");
                  } catch (err: any) {
                    console.error("About Us Save Error:", err);
                    await idbSet('m_about_us', JSON.stringify(aboutData));
                    onAboutUpdate?.(aboutData);
                    alert(`Supabase error: ${err.message || "Table might be missing"}\nSaved locally as fallback. Please ensure about_us.sql is run in Supabase.`);
                  }
                }}
                className="px-6 py-3 bg-sky-500 hover:bg-sky-600 text-white font-bold rounded-xl shadow-lg shadow-sky-500/20 transition-all active:scale-[0.98]"
              >
                Save Changes Live
              </button>
              <button
                onClick={() => {
                  if (!aboutData.full_privacy_policy_html) {
                    setAboutData({ ...aboutData, full_privacy_policy_html: DEFAULT_PRIVACY_POLICY });
                  }
                  setShowPrivacyEditor(true);
                }}
                className="px-6 py-3 bg-indigo-500 hover:bg-indigo-600 text-white font-bold rounded-xl shadow-lg shadow-indigo-500/20 transition-all active:scale-[0.98]"
              >
                Open Full Privacy Policy Editor
              </button>
            </div>
          </div>
        )}

        {/* Full Privacy Policy Modal */}
        {showPrivacyEditor && (
          <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className={`w-full max-w-5xl h-[90vh] flex flex-col rounded-3xl overflow-hidden shadow-2xl border ${isDark ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200'}`}>
              <div className="flex justify-between items-center p-4 border-b border-slate-200 dark:border-slate-800">
                <h2 className={`text-xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>Full Privacy Policy Editor</h2>
                <button onClick={() => setShowPrivacyEditor(false)} className={`px-4 py-2 rounded-lg font-semibold ${isDark ? 'bg-slate-800 hover:bg-slate-700 text-white' : 'bg-slate-200 hover:bg-slate-300 text-slate-800'}`}>Done</button>
              </div>
              <div className={`flex-1 overflow-y-auto p-6 custom-scrollbar ${isDark ? 'bg-slate-950' : 'bg-slate-50'}`}>
                <RichTextEditor
                  value={aboutData.full_privacy_policy_html || ''}
                  onChange={(html) => setAboutData(prev => ({ ...prev, full_privacy_policy_html: html }))}
                  placeholder="Write the full privacy policy here... Leave blank to use the default text."
                  minHeight="500px"
                />
              </div>
              <div className={`p-4 border-t ${isDark ? 'border-slate-800 bg-slate-900 text-slate-400' : 'border-slate-200 bg-slate-100 text-slate-600'} text-sm font-medium`}>
                Click 'Done' above to close this dialog, and then use the <b>'Save Changes Live'</b> button on the main panel to apply your changes.
              </div>
            </div>
          </div>
        )}

        {/* Stats Tab Content */}
        {activeTab === 'stats' && (
          <div className={`p-4 md:p-5 ${cardBg} border ${cardBdr} rounded-2xl ${isDark ? '' : 'shadow-md'} lg:h-[calc(100vh-12rem)] flex flex-col`}>
            {/* Compact Header */}
            <div className={`flex items-center justify-between border-b ${dividerBdr} pb-3 mb-4`}>
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-xl ${isDark ? 'bg-fuchsia-500/10' : 'bg-fuchsia-100'} border ${isDark ? 'border-fuchsia-500/20' : 'border-fuchsia-200'}`}>
                  <BarChart2 className={`w-5 h-5 ${isDark ? 'text-fuchsia-400' : 'text-fuchsia-600'}`} />
                </div>
                <div>
                  <h1 className={`text-xl font-extrabold ${textPrimary} font-display tracking-wide leading-tight`}>
                    Stats
                  </h1>
                  <p className={`text-xs ${textMuted} font-mono`}>Global Content Metrics & System Health</p>
                </div>
              </div>
            </div>

            {/* Two-column layout: Metrics | Storage */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 flex-1 min-h-0">

              {/* LEFT: Compact Metric Cards */}
              <div className="lg:col-span-3 grid grid-cols-2 md:grid-cols-3 gap-3 auto-rows-min lg:auto-rows-fr content-start">

                {/* Total Questions - Hero */}
                <div className={`col-span-2 md:col-span-2 ${surfaceBg} border ${surfaceBdr} rounded-2xl p-4 relative overflow-hidden flex flex-col justify-between`}>
                  <div className="absolute top-0 right-0 p-4 opacity-10">
                    <HelpCircle className="w-20 h-20 text-fuchsia-500" />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5 text-fuchsia-500 font-bold text-xs mb-1">
                      <Activity className="w-3.5 h-3.5" />
                      TOTAL QUESTION BANK
                    </div>
                    <h2 className={`text-4xl md:text-5xl font-black ${textPrimary} font-display tracking-tighter`}>
                      {questions.length.toLocaleString()}
                    </h2>
                  </div>
                  <p className={`text-xs ${textMuted} mt-2 max-w-[85%] leading-snug`}>
                    MCQs loaded across all papers.
                  </p>
                </div>

                {/* Active Users */}
                <div className={`col-span-1 ${surfaceBg} border ${surfaceBdr} rounded-2xl p-4 flex flex-col justify-between relative overflow-hidden`}>
                  <div className="absolute top-0 right-0 p-2 opacity-[0.08]">
                    <Activity className="w-16 h-16 text-emerald-500" />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5 text-emerald-500 font-bold text-xs mb-1 relative z-10">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
                      ACTIVE USERS
                    </div>
                    <h2 className={`text-3xl md:text-4xl font-black ${textPrimary} font-display tracking-tighter relative z-10`}>
                      {activeUsersCount}
                    </h2>
                  </div>
                  <p className={`text-[10px] ${textMuted} mt-2 relative z-10`}>Real-time sessions</p>
                </div>

                {/* Avg Q / Paper */}
                <div className={`col-span-1 ${surfaceBg} border ${surfaceBdr} rounded-2xl p-4 flex flex-col justify-between`}>
                  <div>
                    <div className="flex items-center gap-1.5 text-indigo-500 font-bold text-xs mb-1">
                      <TrendingUp className="w-3.5 h-3.5" />
                      AVG Q / PAPER
                    </div>
                    <h2 className={`text-3xl md:text-4xl font-black ${textPrimary} font-display tracking-tighter`}>
                      {stats.avgQuestions}
                    </h2>
                  </div>
                  <p className={`text-[10px] ${textMuted} mt-2`}>Per active paper</p>
                </div>

                {/* Top Subject */}
                <div className={`col-span-1 ${surfaceBg} border ${surfaceBdr} rounded-2xl p-4 flex flex-col justify-between`}>
                  <div>
                    <div className="flex items-center gap-1.5 text-amber-500 font-bold text-xs mb-1">
                      <Activity className="w-3.5 h-3.5" />
                      TOP SUBJECT
                    </div>
                    <h2 className={`text-lg font-black ${textPrimary} font-display leading-tight truncate`} title={stats.topSubject}>
                      {stats.topSubject}
                    </h2>
                    <p className={`text-base font-bold ${textMuted} font-mono`}>
                      {stats.topSubjectCount} Papers
                    </p>
                  </div>
                </div>

                {/* Total Papers */}
                <div className={`col-span-1 ${surfaceBg} border ${surfaceBdr} rounded-2xl p-4`}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5 text-sky-500 font-bold text-xs">
                      <FileText className="w-3.5 h-3.5" />
                      PAPERS
                    </div>
                    <span className={`text-2xl font-black ${textPrimary} font-display`}>{papers.length}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className={`p-2 rounded-xl ${isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'} border`}>
                      <div className="flex items-center gap-1 text-[10px] font-bold text-emerald-500 mb-0.5">
                        <Globe className="w-3 h-3" /> SI
                      </div>
                      <div className={`text-xl font-bold ${textPrimary}`}>{stats.siPapers}</div>
                    </div>
                    <div className={`p-2 rounded-xl ${isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'} border`}>
                      <div className="flex items-center gap-1 text-[10px] font-bold text-indigo-500 mb-0.5">
                        <Globe className="w-3 h-3" /> EN
                      </div>
                      <div className={`text-xl font-bold ${textPrimary}`}>{stats.enPapers}</div>
                    </div>
                  </div>
                </div>

                {/* Total Subjects */}
                <div className={`col-span-1 ${surfaceBg} border ${surfaceBdr} rounded-2xl p-4`}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5 text-emerald-500 font-bold text-xs">
                      <BookOpen className="w-3.5 h-3.5" />
                      SUBJECTS
                    </div>
                    <span className={`text-2xl font-black ${textPrimary} font-display`}>{subjects.length}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className={`p-2 rounded-xl ${isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'} border`}>
                      <div className={`text-[10px] font-bold ${textMuted} mb-0.5 tracking-wider`}>O/L</div>
                      <div className={`text-xl font-bold ${textPrimary}`}>{stats.olSubjects}</div>
                    </div>
                    <div className={`p-2 rounded-xl ${isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'} border`}>
                      <div className={`text-[10px] font-bold ${textMuted} mb-0.5 tracking-wider`}>A/L</div>
                      <div className={`text-xl font-bold ${textPrimary}`}>{stats.alSubjects}</div>
                    </div>
                  </div>
                </div>

              </div>

              {/* RIGHT: Database Storage Usage */}
              <div className={`lg:col-span-2 ${surfaceBg} border ${surfaceBdr} rounded-2xl p-4 relative overflow-hidden flex flex-col`}>
                <div className="flex items-center justify-between mb-3 gap-2">
                  <div className="flex items-center gap-2">
                    <div className={`p-1.5 rounded-lg ${isDark ? 'bg-cyan-500/10 border-cyan-500/20' : 'bg-cyan-50 border-cyan-200'} border`}>
                      <Database className={`w-4 h-4 ${isDark ? 'text-cyan-400' : 'text-cyan-600'}`} />
                    </div>
                    <div>
                      <div className="text-cyan-500 font-bold text-xs">DB STORAGE</div>
                      <p className={`text-[10px] ${textMuted}`}>Supabase tables & bucket</p>
                    </div>
                  </div>
                  <button
                    onClick={fetchStorageUsage}
                    disabled={storageLoading}
                    className={`flex items-center gap-1 px-2 py-1 text-[10px] font-semibold rounded-lg transition-all cursor-pointer ${isDark
                      ? 'bg-cyan-500/10 border-cyan-500/20 text-cyan-400 hover:bg-cyan-500/20'
                      : 'bg-cyan-50 border-cyan-200 text-cyan-600 hover:bg-cyan-100'
                      } border ${storageLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <RefreshCw className={`w-3 h-3 ${storageLoading ? 'animate-spin' : ''}`} />
                    {storageLoading ? '...' : 'Refresh'}
                  </button>
                </div>

                {storageError && (
                  <div className="mb-2 px-3 py-2 rounded-lg text-[10px] font-semibold border bg-red-500/10 border-red-500/20 text-red-400">
                    ✕ {storageError}
                  </div>
                )}

                <div className="flex-1 min-h-0 overflow-y-auto">
                  {storageLoading && storageData.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 gap-2">
                      <RefreshCw className={`w-6 h-6 ${isDark ? 'text-cyan-400' : 'text-cyan-500'} animate-spin`} />
                      <p className={`text-xs ${textMuted} font-medium`}>Calculating...</p>
                    </div>
                  ) : storageData.length > 0 ? (
                    <div className="space-y-3">
                      {/* Table Bars */}
                      <div className="space-y-2">
                        {(() => {
                          const maxSize = Math.max(...storageData.map(t => t.sizeBytes), 1);
                          return storageData.map((table) => (
                            <div key={table.name} className="group">
                              <div className="flex items-center justify-between mb-0.5">
                                <div className="flex items-center gap-1.5">
                                  <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: table.color }} />
                                  <span className={`text-[11px] font-bold ${textPrimary}`}>{table.label}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className={`text-[10px] font-mono ${textMuted}`}>{table.rows}r</span>
                                  <span className={`text-[11px] font-bold ${textPrimary}`}>{formatBytes(table.sizeBytes)}</span>
                                </div>
                              </div>
                              <div className={`w-full h-1.5 rounded-full overflow-hidden ${isDark ? 'bg-slate-900' : 'bg-slate-100'}`}>
                                <div
                                  className="h-full rounded-full transition-all duration-700 ease-out"
                                  style={{
                                    width: `${Math.max((table.sizeBytes / maxSize) * 100, 1)}%`,
                                    backgroundColor: table.color,
                                    opacity: 0.75
                                  }}
                                />
                              </div>
                            </div>
                          ));
                        })()}
                      </div>

                      {/* Divider */}
                      <div className={`border-t ${dividerBdr}`} />

                      {/* Summary Cards */}
                      <div className="grid grid-cols-3 gap-2">
                        <div className={`p-2.5 rounded-xl ${isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'} border`}>
                          <div className="flex items-center gap-1 mb-1">
                            <Database className={`w-3 h-3 ${isDark ? 'text-cyan-400' : 'text-cyan-600'}`} />
                            <span className={`text-[9px] font-bold ${textMuted} tracking-wider`}>DB</span>
                          </div>
                          <div className={`text-base font-black ${textPrimary} font-display`}>
                            {formatBytes(storageData.reduce((sum, t) => sum + t.sizeBytes, 0))}
                          </div>
                          <p className={`text-[9px] ${textFaint} font-mono`}>
                            {storageData.reduce((sum, t) => sum + t.rows, 0)} rows
                          </p>
                        </div>

                        <div className={`p-2.5 rounded-xl ${isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'} border`}>
                          <div className="flex items-center gap-1 mb-1">
                            <HardDrive className={`w-3 h-3 ${isDark ? 'text-violet-400' : 'text-violet-600'}`} />
                            <span className={`text-[9px] font-bold ${textMuted} tracking-wider`}>IMG</span>
                          </div>
                          <div className={`text-base font-black ${textPrimary} font-display`}>
                            {formatBytes(storageBucketSize.sizeBytes)}
                          </div>
                          <p className={`text-[9px] ${textFaint} font-mono`}>
                            {storageBucketSize.files} files
                          </p>
                        </div>

                        <div className={`p-2.5 rounded-xl border-2 ${isDark ? 'bg-cyan-500/5 border-cyan-500/20' : 'bg-cyan-50 border-cyan-200'}`}>
                          <div className="flex items-center gap-1 mb-1">
                            <BarChart2 className={`w-3 h-3 ${isDark ? 'text-cyan-400' : 'text-cyan-600'}`} />
                            <span className={`text-[9px] font-bold ${isDark ? 'text-cyan-400' : 'text-cyan-700'} tracking-wider`}>ALL</span>
                          </div>
                          <div className={`text-base font-black ${isDark ? 'text-cyan-300' : 'text-cyan-700'} font-display`}>
                            {formatBytes(storageData.reduce((sum, t) => sum + t.sizeBytes, 0) + storageBucketSize.sizeBytes)}
                          </div>
                          <p className={`text-[9px] ${isDark ? 'text-cyan-500/60' : 'text-cyan-600/60'} font-mono`}>
                            Combined
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className={`text-center py-6 ${textMuted} text-xs`}>
                      <Database className={`w-8 h-8 mx-auto mb-2 ${textFaint}`} />
                      <p>Click <strong>Refresh</strong> to load metrics</p>
                    </div>
                  )}
                </div>
              </div>

            </div>
          </div>
        )}

        {/* GALLERY TAB */}
        {activeTab === 'gallery' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

            {/* Upload Form */}
            <div className={`lg:col-span-4 ${cardBg} border ${cardBdr} rounded-2xl p-6 self-start ${isDark ? '' : 'shadow-md'}`}>
              <h2 className={`text-lg font-bold ${textPrimary} mb-4 flex items-center gap-2`}>
                <Images className="w-4 h-4 text-emerald-400" />
                Add New Photo
              </h2>

              <form onSubmit={handleGalleryUpload} className="space-y-4">
                {/* File picker */}
                <div>
                  <label className={`block text-xs font-semibold ${textMuted} mb-1.5`}>Photo File</label>
                  <input
                    ref={galleryFileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleGalleryFileChange}
                    className={`w-full ${inputBg} border ${inputBdr} rounded-xl px-3 py-2 ${textPrimary} text-xs focus:outline-none focus:border-emerald-500 transition-colors file:mr-3 file:py-1 file:px-2 file:rounded-lg file:border-0 file:text-xs file:bg-emerald-500/10 file:text-emerald-400 cursor-pointer`}
                  />
                  <p className={`text-[10px] mt-1 ${textFaint}`}>Auto-compressed to max 1200px JPEG before saving as hex.</p>
                </div>

                {/* Preview */}
                {galleryUploadPreview && (
                  <div className={`rounded-xl overflow-hidden border ${cardBdr}`}>
                    <img src={galleryUploadPreview} alt="Preview" className="w-full max-h-48 object-cover" />
                  </div>
                )}

                {/* Title */}
                <div>
                  <label className={`block text-xs font-semibold ${textMuted} mb-1.5`}>Title *</label>
                  <input
                    type="text"
                    placeholder="e.g. Annual Prize Giving 2025"
                    value={galleryUploadTitle}
                    onChange={(e) => setGalleryUploadTitle(e.target.value)}
                    className={`w-full ${inputBg} border ${inputBdr} rounded-xl px-3 py-2 ${textPrimary} text-xs focus:outline-none focus:border-emerald-500 transition-colors`}
                  />
                </div>

                {/* Description */}
                <div>
                  <label className={`block text-xs font-semibold ${textMuted} mb-1.5`}>Description (optional)</label>
                  <textarea
                    placeholder="Short description of this photo..."
                    value={galleryUploadDesc}
                    onChange={(e) => setGalleryUploadDesc(e.target.value)}
                    rows={3}
                    className={`w-full ${inputBg} border ${inputBdr} rounded-xl px-3 py-2 ${textPrimary} text-xs focus:outline-none focus:border-emerald-500 transition-colors resize-none`}
                  />
                </div>

                {/* Progress bar */}
                {galleryUploading && (
                  <div className={`rounded-xl overflow-hidden border ${cardBdr} h-2 ${isDark ? 'bg-slate-900' : 'bg-slate-100'}`}>
                    <div
                      className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-200 rounded-xl"
                      style={{ width: `${galleryUploadProgress}%` }}
                    />
                  </div>
                )}

                <button
                  type="submit"
                  disabled={galleryUploading || !galleryUploadFile}
                  className="w-full py-3 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-bold font-sans text-xs tracking-widest transition-all cursor-pointer"
                >
                  {galleryUploading ? `Encoding... ${galleryUploadProgress}%` : 'Save Photo to Gallery'}
                </button>
              </form>
            </div>

            {/* Gallery List */}
            <div className="lg:col-span-8 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className={`text-lg font-bold ${textPrimary} flex items-center gap-2`}>
                  <Images className="w-4 h-4 text-emerald-400" />
                  Gallery Photos
                  <span className={`text-xs font-mono ${textFaint} border ${cardBdr} px-2 py-0.5 rounded-lg`}>{galleryPhotos.length}</span>
                </h2>
                <div className="flex items-center gap-2">
                  <button
                    onClick={fetchGallery}
                    disabled={galleryLoading}
                    className={`flex items-center gap-1.5 px-3 py-1.5 ${subtleBg} border ${subtleBdr} ${textMuted} hover:text-emerald-400 rounded-xl text-xs font-semibold cursor-pointer transition-colors`}
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${galleryLoading ? 'animate-spin' : ''}`} />
                    Refresh
                  </button>
                  <button
                    onClick={handleGalleryDeleteAll}
                    disabled={galleryLoading || galleryPhotos.length === 0}
                    className={`flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 hover:border-red-500/30 rounded-xl text-xs font-semibold transition-colors ${(galleryLoading || galleryPhotos.length === 0) ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                    title="Delete all photos"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete All
                  </button>
                </div>
              </div>

              {galleryLoading && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {[1,2,3,4,5,6].map(i => (
                    <div key={i} className={`rounded-xl overflow-hidden animate-pulse ${isDark ? 'bg-slate-900' : 'bg-slate-100'}`}>
                      <div className={`w-full aspect-[4/3] ${isDark ? 'bg-slate-800' : 'bg-slate-200'}`} />
                      <div className="p-2 space-y-1">
                        <div className={`h-3 w-3/4 rounded ${isDark ? 'bg-slate-800' : 'bg-slate-200'}`} />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {!galleryLoading && galleryPhotos.length === 0 && (
                <div className={`text-center py-16 rounded-2xl border border-dashed ${cardBdr} ${textFaint} text-xs`}>
                  <Images className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p>No photos uploaded yet.</p>
                  <p className="mt-1 text-[10px]">Use the form on the left to add your first photo.</p>
                </div>
              )}

              {!galleryLoading && galleryPhotos.length > 0 && (
                <div className="space-y-3">
                  {galleryPhotos.map((photo, index) => {
                    const dataUrl = photo.imageHex ? hexToDataUrl(photo.imageHex, photo.mimeType) : '';
                    return (
                      <div
                        key={photo.id}
                        className={`flex items-start gap-4 p-3 rounded-2xl border ${cardBdr} ${isDark ? 'bg-slate-900/50' : 'bg-white'} transition-all`}
                      >
                        {/* Thumbnail */}
                        <div className="shrink-0 w-20 h-16 rounded-xl overflow-hidden border border-slate-700/30">
                          {dataUrl && (
                            <img src={dataUrl} alt={photo.title} className="w-full h-full object-cover" />
                          )}
                        </div>

                        {/* Details */}
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-bold ${textPrimary} truncate`}>{photo.title}</p>
                          {photo.description && (
                            <p className={`text-xs ${textMuted} mt-0.5 line-clamp-2`}>{photo.description}</p>
                          )}
                          <p className={`text-[10px] font-mono ${textFaint} mt-1`}>
                            #{index + 1} · {photo.mimeType} · {Math.round(photo.imageHex.length / 2048)} KB
                          </p>
                        </div>

                        {/* Actions */}
                        <div className="flex flex-col gap-1 shrink-0">
                          <button
                            onClick={() => handleGalleryMoveUp(index)}
                            disabled={index === 0}
                            className={`p-1.5 rounded-lg border ${cardBdr} ${textMuted} disabled:opacity-20 hover:text-emerald-400 transition-colors cursor-pointer`}
                            title="Move up"
                          >
                            <ChevronUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleGalleryMoveDown(index)}
                            disabled={index === galleryPhotos.length - 1}
                            className={`p-1.5 rounded-lg border ${cardBdr} ${textMuted} disabled:opacity-20 hover:text-emerald-400 transition-colors cursor-pointer`}
                            title="Move down"
                          >
                            <ChevronDown className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleGalleryDelete(photo.id)}
                            className="p-1.5 rounded-lg border border-red-500/20 text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
                            title="Delete photo"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </div>
        )}

      </div>
    </div >
  );
}