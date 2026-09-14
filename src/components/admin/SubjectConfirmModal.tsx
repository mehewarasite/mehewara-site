import React, { useState } from 'react';
import { BookOpen, Check, X, Layers, Sparkles } from 'lucide-react';
import { Subject } from '../../types';
import type { AdminThemeClasses } from './types';

interface SubjectConfirmModalProps {
  theme: AdminThemeClasses;
  unrecognizedSubjectKey: string;
  detectedExamType?: 'ol' | 'al';
  existingSubjects: Subject[];
  isOpen: boolean;
  onClose: () => void;
  onConfirmCreate: (newSubject: Subject) => Promise<void>;
  onSelectExisting: (existingSubjectId: string) => void;
}

export default function SubjectConfirmModal({
  theme,
  unrecognizedSubjectKey,
  detectedExamType = 'al',
  existingSubjects,
  isOpen,
  onClose,
  onConfirmCreate,
  onSelectExisting,
}: SubjectConfirmModalProps) {
  const { isDark, cardBg, cardBdr, inputBg, inputBdr, textPrimary, textMuted, textFaint, subtleBg } = theme;

  const [mode, setMode] = useState<'create' | 'select'>('create');
  const [name, setName] = useState(unrecognizedSubjectKey);
  const [sinhalaName, setSinhalaName] = useState(unrecognizedSubjectKey);
  const [examType, setExamType] = useState<'ol' | 'al'>(detectedExamType);
  const [code, setCode] = useState(unrecognizedSubjectKey.toLowerCase().replace(/[^a-z0-9]/g, '-'));
  const [selectedSubjectId, setSelectedSubjectId] = useState(existingSubjects[0]?.id || '');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !sinhalaName.trim()) return;

    setIsSubmitting(true);
    try {
      const newSub: Subject = {
        id: `${examType}-${code.trim() || name.trim().toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
        name: name.trim(),
        sinhalaName: sinhalaName.trim(),
        examType,
        code: code.trim() || name.trim().toLowerCase().replace(/[^a-z0-9]/g, '-'),
        icon: 'BookOpen',
        color: examType === 'ol' ? 'from-emerald-600 to-teal-700' : 'from-blue-600 to-indigo-700',
      };
      await onConfirmCreate(newSub);
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSelectSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSubjectId) return;
    onSelectExisting(selectedSubjectId);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className={`flex flex-col w-full max-w-lg ${cardBg} border ${cardBdr} rounded-2xl shadow-2xl overflow-hidden`}>
        {/* Header */}
        <div className={`flex items-center justify-between px-6 py-4 border-b ${cardBdr} ${subtleBg}`}>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className={`text-base font-bold ${textPrimary}`}>
                Confirm Subject Registration
              </h2>
              <p className={`text-xs ${textMuted} font-mono mt-0.5`}>
                Subject identifier: <span className="text-amber-400 font-semibold">{unrecognizedSubjectKey}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className={`p-2 hover:bg-slate-500/10 rounded-xl text-slate-400 hover:${textPrimary} transition-colors`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab switcher */}
        <div className={`flex border-b ${cardBdr} ${subtleBg} p-1`}>
          <button
            type="button"
            onClick={() => setMode('create')}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
              mode === 'create'
                ? 'bg-sky-500 text-white shadow-sm'
                : `${textMuted} hover:${textPrimary}`
            }`}
          >
            Create New Subject in D1
          </button>
          <button
            type="button"
            onClick={() => setMode('select')}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
              mode === 'select'
                ? 'bg-sky-500 text-white shadow-sm'
                : `${textMuted} hover:${textPrimary}`
            }`}
          >
            Assign to Existing Subject
          </button>
        </div>

        {/* Body */}
        {mode === 'create' ? (
          <form onSubmit={handleCreateSubmit} className="p-6 space-y-4">
            <p className={`text-xs ${textMuted}`}>
              This subject is not yet registered in Cloudflare D1. Confirm the official titles and exam stream below to create it automatically:
            </p>

            <div>
              <label className={`block text-xs font-bold ${textMuted} mb-1 uppercase tracking-wider`}>
                Subject Name (English)
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={`w-full p-2.5 rounded-xl border ${inputBdr} ${inputBg} ${textPrimary} text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-sky-500/50`}
              />
            </div>

            <div>
              <label className={`block text-xs font-bold ${textMuted} mb-1 uppercase tracking-wider`}>
                Sinhala Title (සිංහල නම)
              </label>
              <input
                type="text"
                required
                value={sinhalaName}
                onChange={(e) => setSinhalaName(e.target.value)}
                className={`w-full p-2.5 rounded-xl border ${inputBdr} ${inputBg} ${textPrimary} text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-sky-500/50`}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={`block text-xs font-bold ${textMuted} mb-1 uppercase tracking-wider`}>
                  Exam Stream
                </label>
                <select
                  value={examType}
                  onChange={(e) => setExamType(e.target.value as 'ol' | 'al')}
                  className={`w-full p-2.5 rounded-xl border ${inputBdr} ${inputBg} ${textPrimary} text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-sky-500/50`}
                >
                  <option value="al">Advanced Level (A/L)</option>
                  <option value="ol">Ordinary Level (O/L)</option>
                </select>
              </div>

              <div>
                <label className={`block text-xs font-bold ${textMuted} mb-1 uppercase tracking-wider`}>
                  Subject Code / Slug
                </label>
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className={`w-full p-2.5 rounded-xl border ${inputBdr} ${inputBg} ${textPrimary} text-xs font-mono font-semibold focus:outline-none focus:ring-2 focus:ring-sky-500/50`}
                />
              </div>
            </div>

            <div className={`flex items-center justify-end gap-3 pt-4 border-t ${cardBdr}`}>
              <button
                type="button"
                onClick={onClose}
                className={`px-4 py-2 rounded-xl border ${cardBdr} hover:${subtleBg} ${textMuted} text-xs font-semibold`}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-5 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-white text-xs font-bold shadow-lg shadow-sky-500/20 flex items-center gap-2"
              >
                <Check className="w-4 h-4" /> {isSubmitting ? 'Registering...' : 'Create & Link Subject'}
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleSelectSubmit} className="p-6 space-y-4">
            <p className={`text-xs ${textMuted}`}>
              Instead of creating a new subject, choose an existing registered subject to assign this paper to:
            </p>

            <div>
              <label className={`block text-xs font-bold ${textMuted} mb-1 uppercase tracking-wider`}>
                Choose Existing Subject
              </label>
              <select
                value={selectedSubjectId}
                onChange={(e) => setSelectedSubjectId(e.target.value)}
                className={`w-full p-2.5 rounded-xl border ${inputBdr} ${inputBg} ${textPrimary} text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-sky-500/50`}
              >
                {existingSubjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.sinhalaName}) • {s.examType.toUpperCase()}
                  </option>
                ))}
              </select>
            </div>

            <div className={`flex items-center justify-end gap-3 pt-4 border-t ${cardBdr}`}>
              <button
                type="button"
                onClick={onClose}
                className={`px-4 py-2 rounded-xl border ${cardBdr} hover:${subtleBg} ${textMuted} text-xs font-semibold`}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-white text-xs font-bold shadow-lg shadow-sky-500/20 flex items-center gap-2"
              >
                <Check className="w-4 h-4" /> Assign Subject
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
