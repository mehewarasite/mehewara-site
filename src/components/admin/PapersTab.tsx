import React, { useState, useRef } from 'react';
import { FileText, FileCode, Upload, Edit2, Trash2, X, Save } from 'lucide-react';
import { Subject, Paper, Question } from '../../types';
import { renderMathInHtml } from '../../utils/parseTxt';
import { themeHtml } from '../../utils/themeHtml';
import { uploadImageToStorage, insertOrReplaceImage } from '../../utils/mediaUpload';
import { validateQuizText } from '../../utils/quizValidator';
import ParserDiagnosticModal from './ParserDiagnosticModal';
import SubjectConfirmModal from './SubjectConfirmModal';
import type { AdminThemeClasses, AdminTab } from './types';

// The parser returns objects with this rough shape:
interface ParsedQuestion {
  id?: number;
  question: string;
  code?: string;
  options: string[];
  correctIndex: number;
  explanation?: string;
}

interface PapersTabProps {
  theme: AdminThemeClasses;
  subjects: Subject[];
  papers: Paper[];
  questions: Question[];
  onAddSubject?: (subject: Subject) => void;
  onAddPaper: (paper: Paper, importedQuestions?: Question[]) => void;
  onUpdatePaper: (paper: Paper) => void;
  onDeletePaper: (paperId: string) => void;
  onUpdateStudyHtml: (paperId: string, html: string) => void;
  setActiveTab: (tab: AdminTab) => void;
  setTargetPaperId: (paperId: string) => void;
  setQNumber: (num: number) => void;
  showFlash: (message: string, isError?: boolean) => void;
  onEnsureQuestionsLoaded?: (paperId: string, force?: boolean) => Promise<void>;
}

export default function PapersTab({
  theme,
  subjects,
  papers,
  questions,
  onAddSubject,
  onAddPaper,
  onUpdatePaper,
  onDeletePaper,
  onUpdateStudyHtml,
  setActiveTab,
  setTargetPaperId,
  setQNumber,
  showFlash,
  onEnsureQuestionsLoaded,
}: PapersTabProps) {
  const { isDark, cardBg, cardBdr, inputBg, inputBdr, textPrimary, textMuted, textFaint, subtleBg } = theme;

  const [selectedSubjectId, setSelectedSubjectId] = useState<string>(subjects[0]?.id || '');
  const [newPaperTitle, setNewPaperTitle] = useState('');
  const [newPaperSinhalaTitle, setNewPaperSinhalaTitle] = useState('');
  const [newPaperYear, setNewPaperYear] = useState<number>(2026);
  const [newPaperDuration, setNewPaperDuration] = useState<number>(120);
  const [newPaperLanguage, setNewPaperLanguage] = useState<'si' | 'en'>('si');
  const [studyMaterialHtml, setStudyMaterialHtml] = useState('');
  const [studyFileName, setStudyFileName] = useState('');
  const [parsedQuestions, setParsedQuestions] = useState<ParsedQuestion[]>([]);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [uploadingImageIndex, setUploadingImageIndex] = useState<number | null>(null);

  // Diagnostic Modal State
  const [diagnosticModalOpen, setDiagnosticModalOpen] = useState(false);
  const [uploadedRawContent, setUploadedRawContent] = useState('');
  const [uploadedFileName, setUploadedFileName] = useState('');

  // Subject Confirmation Modal State
  const [subjectConfirmOpen, setSubjectConfirmOpen] = useState(false);
  const [unrecognizedSubjectKey, setUnrecognizedSubjectKey] = useState('');


  
  const [paperSearchQuery, setPaperSearchQuery] = useState('');
  const [editingPaperId, setEditingPaperId] = useState<string | null>(null);
  const [editPaperData, setEditPaperData] = useState<Partial<Paper>>({});
  
  const studyHtmlInputRef = useRef<HTMLInputElement>(null);

  const resetStudyHtmlInput = () => {
    if (studyHtmlInputRef.current) studyHtmlInputRef.current.value = '';
  };

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
      setUploadedRawContent(rawText);
      setUploadedFileName(file.name);

      // Run syntax validation
      const diag = validateQuizText(rawText);
      if (!diag.isValid || diag.errors.length > 0 || diag.warnings.length > 0) {
        // Open interactive split-view diagnostic inspector
        setDiagnosticModalOpen(true);
      } else {
        setParsedQuestions(diag.questions);
        showFlash(`Successfully parsed ${diag.questions.length} questions from ${file.name}!`);
      }
    };
    reader.readAsText(file);
    input.value = '';
  };

  const handleDiagnosticConfirmImport = (questionsList: any[], fileName: string) => {
    setParsedQuestions(questionsList);
    setDiagnosticModalOpen(false);
    showFlash(`Imported ${questionsList.length} validated questions from ${fileName}!`);
  };

  const handleQuestionImageUpload = async (file: File, index: number, target: 'question' | 'explanation' | number = 'question') => {
    if (!file) return;

    try {
      setUploadingImageIndex(index);
      const isOption = typeof target === 'number';
      const maxWidth = isOption ? 480 : 800;
      const quality = isOption ? 0.58 : 0.62;
      const publicUrl = await uploadImageToStorage(file, 'diagrams', maxWidth, quality);
      const alt = file.name.replace(/"/g, '&quot;');
      const imgClass = isOption ? 'mhw-opt-img' : 'mhw-q-img';
      const imgHtml = `<img src="${publicUrl}" alt="${alt}" class="${imgClass} max-w-full h-auto my-4 rounded-md shadow-sm border border-gray-200 dark:border-gray-700" />`;

      setParsedQuestions(prev => {
        const updated = [...prev];
        const targetQ = { ...updated[index] };

        if (target === 'question') {
          targetQ.question = insertOrReplaceImage(targetQ.question, imgHtml);
        } else if (target === 'explanation') {
          targetQ.explanation = insertOrReplaceImage(targetQ.explanation || '', imgHtml);
        } else if (typeof target === 'number' && targetQ.options && targetQ.options[target] !== undefined) {
          const newOpts = [...targetQ.options];
          newOpts[target] = insertOrReplaceImage(newOpts[target], imgHtml);
          targetQ.options = newOpts;
        }

        updated[index] = targetQ;
        return updated;
      });

      showFlash("Image uploaded and added to question successfully!");
    } catch (error: any) {
      console.error("Error uploading image:", error);
      showFlash(error?.message || "Failed to upload image to Cloud Storage.", true);
    } finally {
      setUploadingImageIndex(null);
    }
  };

  const commitCreatePaper = (targetSubjectId: string, customExamType?: 'ol' | 'al') => {
    const paperId = crypto.randomUUID();
    const selectedSub = subjects.find(s => s.id === targetSubjectId);
    const resolvedExamType = selectedSub?.examType || customExamType || 'al';

    const newPaper: Paper = {
      id: paperId,
      subjectId: targetSubjectId,
      examType: resolvedExamType,
      title: newPaperTitle,
      sinhalaTitle: newPaperSinhalaTitle,
      year: newPaperYear,
      durationMinutes: newPaperDuration,
      questionCount: parsedQuestions.length,
      studyMaterialHtml: studyMaterialHtml || undefined,
      language: newPaperLanguage,
    };

    let importedQuestions: Question[] | undefined;
    if (parsedQuestions.length > 0) {
      importedQuestions = parsedQuestions.map((q, idx) => {
        const rawOpts = (q.options || []).slice(0, 5);
        while (rawOpts.length < 4) {
          rawOpts.push(`Option ${rawOpts.length + 1}`);
        }
        return {
          id: crypto.randomUUID(),
          paperId: paperId,
          qNumber: q.id ?? (idx + 1),
          questionHtml: q.code
            ? `<p>${q.question}</p><pre><code>${q.code}</code></pre>`
            : `<p>${q.question}</p>`,
          optionsHtml: rawOpts as [string, string, string, string],
          correctOption: (q.correctIndex >= 0 && q.correctIndex < rawOpts.length ? q.correctIndex : 0) as 0 | 1 | 2 | 3,
          correctOptions: [q.correctIndex >= 0 && q.correctIndex < rawOpts.length ? q.correctIndex : 0],
          explanationHtml: q.explanation || undefined,
        };
      });
    }

    onAddPaper(newPaper, importedQuestions);
    setTargetPaperId(paperId);
    showFlash(importedQuestions
      ? `Paper created & ${importedQuestions.length} MCQs uploaded cleanly!`
      : 'Paper created successfully!');

    setNewPaperTitle('');
    setNewPaperSinhalaTitle('');
    setNewPaperLanguage('si');
    setStudyMaterialHtml('');
    setStudyFileName('');
    setParsedQuestions([]);
    resetStudyHtmlInput();
  };

  const handleCreatePaper = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPaperTitle || !newPaperSinhalaTitle) {
      alert('Please fill in all title fields');
      return;
    }

    // Verify if selected subject exists in active subjects list
    const existingSub = subjects.find(s => s.id === selectedSubjectId);
    if (!existingSub) {
      // Prompt user with Subject Confirmation Dialog
      setUnrecognizedSubjectKey(selectedSubjectId || newPaperTitle.split(' ')[0] || 'Subject');
      setSubjectConfirmOpen(true);
      return;
    }

    commitCreatePaper(selectedSubjectId);
  };


  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
      {/* Create New Paper Form (Col-5) */}
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
            <label className={`block text-xs font-semibold ${textMuted} mb-1.5 flex items-center gap-1.5`}>
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
                ref={studyHtmlInputRef}
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
                  <span className={`text-xs ${textMuted}`}>Click to upload .html file</span>
                )}
                {parsedQuestions.length > 0 ? (
                  <span className="text-[10px] text-sky-400 font-bold block mt-0.5">
                    ⚡ {parsedQuestions.length} MCQs detected — will auto-import on create
                  </span>
                ) : (
                  <span className={`text-[10px] ${textFaint} block mt-0.5`}>
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
            <label className={`block text-sm font-medium ${textMuted} mb-2`}>
              Import Paper via Text Format (.txt, .json)
            </label>
            <input
              type="file"
              accept=".txt,.json"
              onChange={handleTxtPaperUpload}
              className={`block w-full text-sm ${textMuted}
                file:mr-4 file:py-2 file:px-4
                file:rounded-md file:border-0
                file:text-sm file:font-semibold
                file:bg-blue-50 file:text-blue-700
                hover:file:bg-blue-100
                dark:file:bg-slate-800 dark:file:text-slate-300`}
            />
          </div>

          {parsedQuestions.length > 0 && (
            <div className={`mt-6 space-y-4 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar border ${inputBdr} rounded-xl p-4 ${subtleBg}`}>
              <h3 className={`font-bold ${textPrimary}`}>Preview & Edit Parsed Questions</h3>
              {parsedQuestions.map((q, index) => (
                <div key={index} className={`p-4 border rounded-lg ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
                  {editingIndex === index ? (
                    <div className="space-y-4">
                      <h4 className="font-bold text-lg text-blue-600">Editing Question {q.id || index + 1}</h4>
                      <div>
                        <label className={`block text-sm font-medium mb-1 ${textPrimary}`}>Question Body (HTML allowed)</label>
                        <textarea
                          value={q.question}
                          onChange={(e) => {
                            const updated = [...parsedQuestions];
                            updated[index].question = e.target.value;
                            setParsedQuestions(updated);
                          }}
                          className={`w-full p-2 border rounded ${isDark ? 'bg-slate-700 border-slate-600 text-white' : 'bg-white border-slate-300'}`}
                          rows={4}
                        />
                      </div>
                      <div className={`p-4 ${isDark ? 'bg-slate-800/50 border-slate-600' : 'bg-slate-50 border-slate-300'} border border-dashed rounded-md space-y-3`}>
                        <div className="flex items-center justify-between">
                          <label className={`block text-sm font-medium ${textPrimary}`}>
                            🖼️ Upload Missing Diagram/Image to API
                          </label>
                          {uploadingImageIndex === index && (
                            <span className="text-xs text-sky-400 font-semibold animate-pulse">
                              Compressing & uploading to API...
                            </span>
                          )}
                        </div>
                        <input
                          type="file"
                          accept="image/*"
                          disabled={uploadingImageIndex === index}
                          className={`block w-full text-sm ${textMuted}
                            file:mr-4 file:py-2 file:px-4
                            file:rounded-md file:border-0
                            file:text-sm file:font-semibold
                            file:bg-blue-50 file:text-blue-700
                            hover:file:bg-blue-100
                            dark:file:bg-blue-900/30 dark:file:text-blue-400
                            dark:hover:file:bg-blue-900/50 cursor-pointer disabled:opacity-50`}
                          onChange={(e) => {
                            if (e.target.files && e.target.files[0]) {
                              handleQuestionImageUpload(e.target.files[0], index);
                              e.target.value = '';
                            }
                          }}
                        />
                        <p className={`text-xs ${textFaint}`}>
                          Automatically compresses to WebP, uploads to Cloud Storage, and replaces any [IMAGE: ...] placeholder.
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
                    <div>
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex items-center gap-2">
                          <h4 className={`font-bold text-lg ${textMuted}`}>Q{q.id || index + 1}</h4>
                          {(q.question.includes('image-placeholder') || q.options.some(opt => opt.includes('image-placeholder'))) && (
                            <span className="px-2 py-0.5 text-[10px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30 rounded-md animate-pulse">
                              ⚠️ Missing Image Placeholder
                            </span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => setEditingIndex(index)}
                          className="px-3 py-1 text-xs font-semibold bg-blue-100 text-blue-600 rounded-lg hover:bg-blue-200 dark:bg-sky-500/10 dark:text-sky-400 dark:hover:bg-sky-500/20 transition-colors"
                        >
                          Edit Question
                        </button>
                      </div>
                      <div
                        className={`prose dark:prose-invert max-w-none text-sm ${textPrimary}`}
                        dangerouslySetInnerHTML={{ __html: renderMathInHtml(q.question) }}
                      />
                      <div className={`mt-4 pl-4 border-l-2 ${isDark ? 'border-slate-700' : 'border-slate-200'} space-y-1`}>
                        {q.options.map((opt, oIdx) => (
                          <div key={oIdx} className={`text-sm flex gap-1 items-start ${q.correctIndex === oIdx ? "text-emerald-600 dark:text-emerald-400 font-bold" : textMuted}`}>
                            <span>{String.fromCharCode(65 + oIdx)}.</span>
                            <span dangerouslySetInnerHTML={{ __html: renderMathInHtml(opt) }} />
                          </div>
                        ))}
                      </div>
                      {q.explanation && (
                        <div className={`mt-3 p-3 ${isDark ? 'bg-sky-900/20' : 'bg-blue-50'} rounded-md text-xs`}>
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
      <div className={`lg:col-span-7 flex flex-col ${cardBg} border ${cardBdr} rounded-2xl p-6 ${isDark ? '' : 'shadow-md'}`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
          <h2 className={`text-lg font-bold ${textPrimary}`}>පවතින ප්‍රශ්න පත්‍ර (Active Papers)</h2>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <svg className={`h-4 w-4 ${textMuted}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <input
              type="text"
              placeholder="Search papers..."
              value={paperSearchQuery}
              onChange={(e) => setPaperSearchQuery(e.target.value)}
              className={`pl-9 pr-4 py-2 w-full sm:w-64 text-xs ${inputBg} border ${inputBdr} ${textPrimary} rounded-xl focus:outline-none focus:border-sky-500 transition-colors`}
            />
          </div>
        </div>

        {(() => {
          const filteredPapers = papers.filter(p =>
            p.title.toLowerCase().includes(paperSearchQuery.toLowerCase()) ||
            p.sinhalaTitle.toLowerCase().includes(paperSearchQuery.toLowerCase())
          );

          return filteredPapers.length === 0 ? (
            <div className={`text-center py-8 ${isDark ? 'bg-slate-900/20 border-slate-800' : 'bg-slate-50 border-slate-300'} rounded-xl border border-dashed ${textMuted} text-xs`}>
              ප්‍රශ්න පත්‍ර කිසිවක් හමු නොවීය. (No papers found)
            </div>
          ) : (
            <div className="space-y-3">
              {filteredPapers.map((p) => {
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
                              onEnsureQuestionsLoaded?.(p.id);
                              const existingQs = questions.filter(q => q.paperId === p.id);
                              const maxNum = existingQs.reduce((max, q) => Math.max(max, q.qNumber), 0);
                              setQNumber(maxNum > 0 ? maxNum + 1 : (p.questionCount ? p.questionCount + 1 : 1));
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
          );
        })()}
      </div>

      {/* Parser Diagnostic Split-View Modal */}
      <ParserDiagnosticModal
        theme={theme}
        isOpen={diagnosticModalOpen}
        initialFileName={uploadedFileName}
        initialRawContent={uploadedRawContent}
        onClose={() => setDiagnosticModalOpen(false)}
        onConfirmImport={handleDiagnosticConfirmImport}
      />

      {/* Subject Confirmation Dialog */}
      <SubjectConfirmModal
        theme={theme}
        isOpen={subjectConfirmOpen}
        unrecognizedSubjectKey={unrecognizedSubjectKey}
        detectedExamType={newPaperTitle.toLowerCase().includes('o/l') ? 'ol' : 'al'}
        existingSubjects={subjects}
        onClose={() => setSubjectConfirmOpen(false)}
        onConfirmCreate={async (newSub) => {
          if (onAddSubject) {
            await onAddSubject(newSub);
          }
          setSelectedSubjectId(newSub.id);
          commitCreatePaper(newSub.id, newSub.examType);
        }}
        onSelectExisting={(existingSubId) => {
          setSelectedSubjectId(existingSubId);
          commitCreatePaper(existingSubId);
        }}
      />
    </div>
  );
}

