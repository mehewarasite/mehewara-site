import React, { useState, useEffect } from 'react';
import { Plus, CircleHelp, Image, RefreshCw } from 'lucide-react';
import { Subject, Paper, Question } from '../../types';
import { fileToImgHtml, insertOrReplaceImage, hasRealContent, optionHasContent } from '../../utils/mediaUpload';
import { renderMathInHtml } from '../../utils/parseTxt';
import RichTextEditor from '../RichTextEditor';
import MathTextInput from '../MathTextInput';
import type { AdminThemeClasses, AdminTab } from './types';

interface AddQuestionTabProps {
  theme: AdminThemeClasses;
  subjects: Subject[];
  papers: Paper[];
  questions: Question[];
  onAddQuestion: (question: Question) => void;
  setActiveTab: (tab: AdminTab) => void;
  showFlash: (message: string, isError?: boolean) => void;
  targetPaperId: string;
  setTargetPaperId: (id: string) => void;
  qNumber: number;
  setQNumber: (num: number) => void;
  onEnsureQuestionsLoaded?: (paperId: string, force?: boolean) => Promise<void>;
  loadingPaperQuestionsId?: string | null;
}

export default function AddQuestionTab({ 
  theme, subjects, papers, questions, onAddQuestion, setActiveTab, showFlash,
  targetPaperId, setTargetPaperId, qNumber, setQNumber,
  onEnsureQuestionsLoaded, loadingPaperQuestionsId
}: AddQuestionTabProps) {
  const { isDark, cardBg, cardBdr, inputBg, inputBdr, textPrimary, textMuted, dividerBdr } = theme;

  const [filterSubjectId, setFilterSubjectId] = useState<string>('');
  const [filterLanguage, setFilterLanguage] = useState<'all' | 'si' | 'en'>('all');
  const [questionHtml, setQuestionHtml] = useState('');
  const [optA, setOptA] = useState('');
  const [optB, setOptB] = useState('');
  const [optC, setOptC] = useState('');
  const [optD, setOptD] = useState('');
  const [optE, setOptE] = useState('');
  const [correctOptions, setCorrectOptions] = useState<number[]>([0]);
  const [isAllCorrect, setIsAllCorrect] = useState(false);
  const [explanationHtml, setExplanationHtml] = useState('');
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  useEffect(() => {
    if (targetPaperId && onEnsureQuestionsLoaded) {
      onEnsureQuestionsLoaded(targetPaperId);
    }
  }, [targetPaperId, onEnsureQuestionsLoaded]);

  useEffect(() => {
    if (targetPaperId) {
      const paperQuestions = questions.filter(q => q.paperId === targetPaperId);
      const maxNum = paperQuestions.reduce((max, q) => Math.max(max, q.qNumber), 0);
      if (maxNum > 0) {
        setQNumber(maxNum + 1);
      }
    }
  }, [targetPaperId, questions.length]);

  const isALPaper = (() => {
    const paper = papers.find(p => p.id === targetPaperId);
    if (!paper) return false;
    const subject = subjects.find(s => s.id === paper.subjectId);
    return subject?.examType === 'al';
  })();

  const handleImageFileUpload = async (
    file: File,
    apply: (html: string) => void,
    className = 'mhw-q-img'
  ) => {
    try {
      setIsUploadingImage(true);
      showFlash("Uploading image to Cloud Storage...");
      const html = await fileToImgHtml(file, className, 'diagrams');
      apply(html);
      showFlash("Image uploaded to Cloud Storage successfully!");
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Image upload failed.';
      showFlash(msg, true);
      alert(msg);
    } finally {
      setIsUploadingImage(false);
    }
  };

  const optionFilled = (value: string) =>
    optionHasContent(value) || value.startsWith('$') || value.includes('<img');

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
    const maxNum = paperQuestions.reduce((max, q) => Math.max(max, q.qNumber), 0);
    const calculatedQNumber = qNumber || (maxNum + 1);

    const newQuestion: Question = {
      id: crypto.randomUUID(),
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

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

      {/* HTML Past Paper Form (Col-8) */}
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
                  const paperQuestions = questions.filter(q => q.paperId === e.target.value);
                  const maxNum = paperQuestions.reduce((max, q) => Math.max(max, q.qNumber), 0);
                  setQNumber(maxNum + 1);
                  setOptE('');
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
              {targetPaperId && (
                <button
                  type="button"
                  onClick={() => onEnsureQuestionsLoaded?.(targetPaperId, true)}
                  disabled={loadingPaperQuestionsId === targetPaperId}
                  className={`p-1.5 rounded-lg border ${inputBdr} ${inputBg} hover:border-sky-500 text-sky-400 text-xs flex items-center gap-1 cursor-pointer transition-colors disabled:opacity-50`}
                  title="Sync paper questions from database"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingPaperQuestionsId === targetPaperId ? 'animate-spin' : ''}`} />
                  <span className="hidden xl:inline text-[10px]">
                    {loadingPaperQuestionsId === targetPaperId ? 'Syncing...' : 'Sync'}
                  </span>
                </button>
              )}
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
                      if (prev.length === 1) return prev;
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
                  if (file) handleImageFileUpload(file, (html) => setQuestionHtml((prev) => insertOrReplaceImage(prev, html)));
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
                      if (file) handleImageFileUpload(file, (html) => setter(insertOrReplaceImage(value, html)), 'mhw-opt-img');
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
                  if (file) handleImageFileUpload(file, (html) => setExplanationHtml((prev) => insertOrReplaceImage(prev, html)));
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
            disabled={isUploadingImage}
            className="px-8 py-2.5 bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-450 hover:to-blue-500 text-white rounded-xl font-bold text-xs tracking-widest transition-all shadow-[0_0_15px_rgba(14,165,233,0.2)] hover:shadow-[0_0_20px_rgba(14,165,233,0.35)] cursor-pointer disabled:opacity-50"
          >
            {isUploadingImage ? 'Uploading Image...' : 'ප්‍රශ්නය සුරකින්න (Save Question →)'}
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
  );
}
