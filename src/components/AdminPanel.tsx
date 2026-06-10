import React, { useState, useEffect } from 'react';
import {
  Trash2,
  Plus,
  ArrowLeft,
  Lock,
  Unlock,
  Settings,
  HelpCircle,
  Check,
  BookOpen,
  FileText,
  RefreshCw,
  Upload,
  FileCode,
  ShieldCheck,
  Image,
  Sun,
  Moon
} from 'lucide-react';
import { Subject, Paper, Question } from '../types';
import RichTextEditor from './RichTextEditor';
import { appendHtml, fileToImgHtml, hasRealContent, optionHasContent } from '../utils/mediaUpload';
import MathTextInput from './MathTextInput';
import { useTheme } from '../ThemeContext';
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
  onDeleteQuestion: (questionId: string) => void;
  onUpdateStudyHtml: (paperId: string, html: string) => void;
  onResetToDefaults: () => void;
  onExportData: () => void;
  onImportData: (file: File) => void;
  onSync: () => Promise<void>;
  isSyncing: boolean;
  onClose: () => void;
}

export default function AdminPanel({
  subjects,
  papers,
  questions,
  onAddPaper,
  onDeletePaper,
  onAddQuestion,
  onDeleteQuestion,
  onUpdateStudyHtml,
  onResetToDefaults,
  onExportData,
  onImportData,
  onSync,
  isSyncing,
  onClose
}: AdminPanelProps) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  const importInputRef = React.useRef<HTMLInputElement>(null);
  const studyHtmlInputRef = React.useRef<HTMLInputElement>(null); // ← Added ref

  // ── Theme shortcut classes ──
  const pageBg = isDark ? 'bg-[#030304]' : 'bg-[#f0f4f8]';
  const panelBg = isDark ? 'bg-[#030304]/95' : 'bg-[#f0f4f8]';
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

  // Tab states: 'papers' | 'add-question' | 'manage-questions'
  const [activeTab, setActiveTab] = useState<'papers' | 'add-question' | 'manage-questions'>('papers');

  // Custom Paper Form
  const [selectedSubjectId, setSelectedSubjectId] = useState(subjects[0]?.id || '');
  const [newPaperTitle, setNewPaperTitle] = useState('');
  const [newPaperSinhalaTitle, setNewPaperSinhalaTitle] = useState('');
  const [newPaperYear, setNewPaperYear] = useState<number>(2026);
  const [newPaperDuration, setNewPaperDuration] = useState<number>(120);
  const [studyMaterialHtml, setStudyMaterialHtml] = useState<string>('');
  const [studyFileName, setStudyFileName] = useState<string>('');
  const [parsedQuestions, setParsedQuestions] = useState<Array<{
    id: number; part?: number; question: string;
    code?: string; options: string[]; correctIndex: number; explanation?: string;
  }>>([]);

  // Custom Question Form
  const [targetPaperId, setTargetPaperId] = useState(papers[0]?.id || '');
  const [qNumber, setQNumber] = useState<number>(1);
  const [questionHtml, setQuestionHtml] = useState('');
  const [optA, setOptA] = useState('');
  const [optB, setOptB] = useState('');
  const [optC, setOptC] = useState('');
  const [optD, setOptD] = useState('');
  const [optE, setOptE] = useState('');
  const [correctOption, setCorrectOption] = useState<0 | 1 | 2 | 3 | 4>(0);
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
      const firstId = papers[0].id;
      setTargetPaperId(firstId);
      setQNumber(questions.filter(q => q.paperId === firstId).length + 1);
    }
  }, [papers]);

  // Sync selectedSubjectId when subjects load async
  useEffect(() => {
    if (!selectedSubjectId && subjects.length > 0) {
      setSelectedSubjectId(subjects[0].id);
    }
  }, [subjects]);

  const SUPERADMIN_HASH = 'b064a7bd942c0ba4520abf9f419cc62bb448221cac9221e0f38de7ba56d22b9a';

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
  // The default hash below corresponds to 'mehewara2026' — change it immediately.
  const getAdminHash = () =>
    localStorage.getItem('m_admin_pw_hash') ||
    '48966d003781399de52006d93a238970d745bb61fc1b8f99d9d786a6086e4654'; // hash of 'mehewara2026' — change via superadmin panel

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
      correctOption: correctOption,
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

  // Authentication barrier
  if (!isAuthenticated) {
    // SUPERADMIN VIEW — change admin password
    if (isSuperAdmin) {
      const isError = pwFlash.startsWith('error:');
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
            <button
              onClick={onResetToDefaults}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 hover:border-red-500/30 rounded-xl text-xs font-semibold cursor-pointer transition-colors"
              title="Restores the pre-loaded past papers and questions, wiping out additions"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Reset to Factory Defaults
            </button>
            <button
              onClick={onSync}
              disabled={isSyncing}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold cursor-pointer transition-all ${
                isSyncing
                  ? 'bg-violet-500/20 border border-violet-500/30 text-violet-300 cursor-wait'
                  : 'bg-violet-500/10 border border-violet-500/20 text-violet-400 hover:bg-violet-500/20 hover:border-violet-500/30'
              }`}
              title="Pull the latest data from Supabase cloud database"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              {isSyncing ? 'Syncing…' : 'Sync from Cloud'}
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
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className={`text-[10px] ${subtleBg} ${textFaint} px-2 py-0.5 rounded-md font-mono font-bold tracking-wide uppercase`}>
                              {p.examType.toUpperCase()}
                            </span>
                            <span className="text-[10px] bg-sky-500/15 text-sky-400 px-2 py-0.5 rounded-md font-mono font-semibold">
                              {sub?.name || 'Subject'}
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
                              if (confirm(`කරුණාකර තහවුරු කරන්න: ඔබ "${p.sinhalaTitle}" ප්‍රශ්න පත්‍රය සහ එහි ඇති සියලුම ප්‍රශ්න මකාදැමීමට සූදානම්ද? (Are you sure you want to delete this paper and all its questions?)`)) {
                                onDeletePaper(p.id);
                              }
                            }}
                            className="p-1.5 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 text-slate-500 hover:text-red-400 rounded-lg transition-all cursor-pointer"
                            title="Delete entire paper"
                          >
                            <Trash2 className="w-4 h-4" />
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

        {activeTab === 'add-question' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

            {/* HTML Past Paper Form (Col-7) */}
            <form noValidate onSubmit={handleCreateQuestion} className={`lg:col-span-8 ${cardBg} border ${cardBdr} rounded-2xl p-6 space-y-4 ${isDark ? '' : 'shadow-md'}`}>
              <div className={`flex items-center justify-between border-b ${dividerBdr} pb-3 mb-2`}>
                <h2 className={`text-lg font-bold ${textPrimary} flex items-center gap-2`}>
                  <Plus className="w-5 h-5 text-sky-400" />
                  ප්‍රශ්නය ඇතුළත් කරන්න (Add/Upload Question MCQ)
                </h2>

                <div className="flex items-center gap-2">
                  <span className={`text-xs ${textMuted} font-medium`}>ප්‍රශ්න පත්‍රය:</span>
                  <select
                    value={targetPaperId}
                    onChange={(e) => {
                      setTargetPaperId(e.target.value);
                      const nextNum = questions.filter(q => q.paperId === e.target.value).length + 1;
                      setQNumber(nextNum);
                      setOptE(''); // clear E when switching papers
                      setCorrectOption(0);
                    }}
                    className={`${inputBg} border ${inputBdr} rounded-lg px-2.5 py-1 ${textPrimary} text-xs focus:outline-none focus:border-sky-500 cursor-pointer`}
                  >
                    {papers.map(p => (
                      <option key={p.id} value={p.id}>{p.sinhalaTitle} ({p.year})</option>
                    ))}
                  </select>
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
                      onClick={() => setCorrectOption(optIdx as 0 | 1 | 2 | 3 | 4)}
                      className={`py-1.8 text-xs font-bold rounded-xl border transition-all cursor-pointer ${correctOption === optIdx
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
                          dangerouslySetInnerHTML={{ __html: value }}
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
                  placeholder="විවරණය මෙහි ටයිප් කරන්න… (optional)"
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
                  <HelpCircle className="w-4 h-4 text-sky-400" />
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
              <div className="flex items-center gap-2">
                <span className={`text-xs ${textMuted} font-medium`}>ප්‍රශ්න පත්‍රය:</span>
                <select
                  value={targetPaperId}
                  onChange={(e) => setTargetPaperId(e.target.value)}
                  className={`${inputBg} border ${inputBdr} rounded-lg px-3 py-1.5 ${textPrimary} text-xs focus:outline-none focus:border-red-500 cursor-pointer`}
                >
                  {papers.map(p => (
                    <option key={p.id} value={p.id}>{p.sinhalaTitle} ({p.year})</option>
                  ))}
                </select>
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
                        <div className={`text-xs ${textMuted} line-clamp-2 overflow-hidden`} dangerouslySetInnerHTML={{ __html: q.questionHtml }} />
                      </div>
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
                  ))
              )}
            </div>
          </div>
        </div>
      )}

    </div>
    </div >
  );
}