import { useState, useEffect } from 'react';
import { RefreshCw } from 'lucide-react';
import { Subject, Paper, Question } from '../../types';
import { renderMathInHtml } from '../../utils/parseTxt';
import type { AdminThemeClasses } from './types';

interface ManageQuestionsTabProps {
  theme: AdminThemeClasses;
  subjects: Subject[];
  papers: Paper[];
  questions: Question[];
  onDeleteQuestion: (questionId: string) => void;
  showFlash: (message: string, isError?: boolean) => void;
  onEnsureQuestionsLoaded?: (paperId: string, force?: boolean) => Promise<void>;
  loadingPaperQuestionsId?: string | null;
}

export default function ManageQuestionsTab({
  theme, subjects, papers, questions, onDeleteQuestion, showFlash,
  onEnsureQuestionsLoaded, loadingPaperQuestionsId
}: ManageQuestionsTabProps) {
  const { isDark, cardBg, cardBdr, inputBg, inputBdr, textPrimary, textMuted, dividerBdr, subtleBg, subtleBdr } = theme;

  const [filterSubjectId, setFilterSubjectId] = useState<string>('');
  const [filterLanguage, setFilterLanguage] = useState<'all' | 'si' | 'en'>('all');
  const [targetPaperId, setTargetPaperId] = useState<string>(papers[0]?.id || '');

  useEffect(() => {
    if (targetPaperId && onEnsureQuestionsLoaded) {
      onEnsureQuestionsLoaded(targetPaperId);
    }
  }, [targetPaperId, onEnsureQuestionsLoaded]);

  return (
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
              {targetPaperId && (
                <button
                  type="button"
                  onClick={() => onEnsureQuestionsLoaded?.(targetPaperId, true)}
                  disabled={loadingPaperQuestionsId === targetPaperId}
                  className={`p-1.5 rounded-lg border ${inputBdr} ${inputBg} hover:border-red-500 text-red-400 text-xs flex items-center gap-1 cursor-pointer transition-colors disabled:opacity-50`}
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

        <div className="space-y-3">
          {loadingPaperQuestionsId === targetPaperId ? (
            <div className="text-center py-12 flex flex-col items-center justify-center gap-3">
              <div className="w-8 h-8 border-4 border-red-500/30 border-t-red-500 rounded-full animate-spin"></div>
              <p className={`text-xs ${textMuted}`}>ප්‍රශ්න පූරණය වෙමින් පවතී... (Loading questions from database...)</p>
            </div>
          ) : questions.filter(q => q.paperId === targetPaperId).length === 0 ? (
            <div className="text-center py-8 space-y-3">
              <p className={`text-sm ${textMuted}`}>මෙම ප්‍රශ්න පත්‍රයේ ප්‍රශ්න නොමැත. (No questions found in this paper.)</p>
              {targetPaperId && (
                <button
                  type="button"
                  onClick={() => onEnsureQuestionsLoaded?.(targetPaperId, true)}
                  className="px-4 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-lg text-xs font-semibold cursor-pointer transition-colors inline-flex items-center gap-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> නැවත පූරණය කරන්න (Reload Questions)
                </button>
              )}
            </div>
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
  );
}
