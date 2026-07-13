import React, { useState } from 'react';
import { Image } from 'lucide-react';
import { Subject, Paper, Question } from '../../types';
import { supabase } from '../../supabase';
import { appendHtml, fileToImgHtml } from '../../utils/mediaUpload';
import { renderMathInHtml, unrenderMathHtml } from '../../utils/parseTxt';
import type { AdminThemeClasses } from './types';

interface EditQuestionsTabProps {
  theme: AdminThemeClasses;
  subjects: Subject[];
  papers: Paper[];
  questions: Question[];
  onUpdateQuestion: (question: Question) => void;
  showFlash: (message: string, isError?: boolean) => void;
}

export default function EditQuestionsTab({ theme, subjects, papers, questions, onUpdateQuestion, showFlash }: EditQuestionsTabProps) {
  const { isDark, cardBg, cardBdr, surfaceBg, surfaceBdr, inputBg, inputBdr, textPrimary, textMuted, dividerBdr, subtleBg, subtleBdr } = theme;

  const [filterSubjectId, setFilterSubjectId] = useState<string>('');
  const [filterLanguage, setFilterLanguage] = useState<'all' | 'si' | 'en'>('all');
  const [targetPaperId, setTargetPaperId] = useState<string>(papers[0]?.id || '');
  const [editingLiveId, setEditingLiveId] = useState<string | null>(null);
  const [liveEditData, setLiveEditData] = useState<Question | null>(null);

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

  return (
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
                                    if (currentOpts.length === 1) return;
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
  );
}
