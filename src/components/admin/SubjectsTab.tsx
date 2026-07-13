import React, { useState } from 'react';
import { BookOpen, LayoutGrid, Edit3, Trash2 } from 'lucide-react';
import { Subject } from '../../types';
import type { AdminThemeClasses } from './types';

interface SubjectsTabProps {
  theme: AdminThemeClasses;
  subjects: Subject[];
  onAddSubject?: (subject: Subject) => void;
  onUpdateSubject?: (subject: Subject) => void;
  onDeleteSubject?: (subjectId: string) => void;
  showFlash: (message: string, isError?: boolean) => void;
}

export default function SubjectsTab({ theme, subjects, onAddSubject, onUpdateSubject, onDeleteSubject, showFlash }: SubjectsTabProps) {
  const { isDark, cardBg, cardBdr, surfaceBg, surfaceBdr, inputBg, inputBdr, textPrimary, textMuted, textFaint, subtleBg } = theme;

  const [editingSubjectId, setEditingSubjectId] = useState<string | null>(null);
  const [newSubject, setNewSubject] = useState<Partial<Subject>>({
    id: '', name: '', sinhalaName: '', examType: 'ol', code: '', icon: 'BookOpen', color: 'from-blue-600 to-indigo-700'
  });

  const handleSaveSubject = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubject.name || !newSubject.sinhalaName || !newSubject.code) {
      showFlash('Please fill in all required subject fields', true);
      return;
    }

    const isEditing = !!editingSubjectId;
    let finalId = newSubject.id;
    if (!finalId) {
      finalId = `${newSubject.examType}-${newSubject.name?.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
    }

    const subjectData: Subject = {
      id: finalId,
      name: newSubject.name,
      sinhalaName: newSubject.sinhalaName,
      examType: newSubject.examType as 'al' | 'ol',
      code: newSubject.code,
      icon: newSubject.icon || 'BookOpen',
      color: newSubject.color || 'from-blue-600 to-indigo-700'
    };

    if (isEditing && onUpdateSubject) {
      onUpdateSubject(subjectData);
      showFlash('Subject updated successfully!');
    } else if (!isEditing && onAddSubject) {
      if (subjects.some(s => s.id === finalId)) {
        showFlash('A subject with this ID/Name already exists', true);
        return;
      }
      onAddSubject(subjectData);
      showFlash('Subject added successfully!');
    }

    setEditingSubjectId(null);
    setNewSubject({ id: '', name: '', sinhalaName: '', examType: 'ol', code: '', icon: 'BookOpen', color: 'from-blue-600 to-indigo-700' });
  };

  const handleEditSubjectClick = (subject: Subject) => {
    setEditingSubjectId(subject.id);
    setNewSubject(subject);
  };

  const handleDeleteSubjectClick = (subjectId: string) => {
    if (confirm('Are you sure you want to delete this subject?')) {
      if (onDeleteSubject) onDeleteSubject(subjectId);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
      {/* Create / Edit Subject Form */}
      <div className={`lg:col-span-5 ${cardBg} border ${cardBdr} rounded-2xl p-6 self-start ${isDark ? '' : 'shadow-md'}`}>
        <h2 className={`text-lg font-bold ${textPrimary} mb-4 flex items-center gap-2`}>
          <BookOpen className="w-4 h-4 text-emerald-400" />
          {editingSubjectId ? 'විෂය සංස්කරණය කරන්න (Edit Subject)' : 'නව විෂයක් සාදන්න (Create New Subject)'}
        </h2>

        <form onSubmit={handleSaveSubject} className="space-y-4">
          <div>
            <label className={`block text-xs font-semibold ${textMuted} mb-1.5`}>විෂය හැඳුනුම් අංකය (Subject ID - Optional)</label>
            <input
              type="text"
              placeholder="e.g. al-physics (Leave blank to auto-generate)"
              value={newSubject.id || ''}
              onChange={(e) => setNewSubject({ ...newSubject, id: e.target.value })}
              className={`w-full ${inputBg} border ${inputBdr} rounded-xl px-3 py-2 ${textPrimary} text-xs focus:outline-none focus:border-emerald-500 transition-colors`}
              disabled={!!editingSubjectId}
            />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={`block text-xs font-semibold ${textMuted} mb-1.5`}>විභාග වර්ගය (Exam Type)</label>
              <select
                value={newSubject.examType}
                onChange={(e) => setNewSubject({ ...newSubject, examType: e.target.value as 'al' | 'ol' })}
                className={`w-full ${inputBg} border ${inputBdr} rounded-xl px-3 py-2 ${textPrimary} text-xs focus:outline-none focus:border-emerald-500 transition-colors`}
              >
                <option value="ol">O/L</option>
                <option value="al">A/L</option>
              </select>
            </div>
            <div>
              <label className={`block text-xs font-semibold ${textMuted} mb-1.5`}>විෂය කේතය (Subject Code)</label>
              <input
                type="text"
                placeholder="e.g. phy, chem, sci"
                value={newSubject.code || ''}
                onChange={(e) => setNewSubject({ ...newSubject, code: e.target.value })}
                className={`w-full ${inputBg} border ${inputBdr} rounded-xl px-3 py-2 ${textPrimary} text-xs focus:outline-none focus:border-emerald-500 transition-colors`}
              />
            </div>
          </div>

          <div>
            <label className={`block text-xs font-semibold ${textMuted} mb-1.5`}>විෂය නාමය - ඉංග්‍රීසි (English Name)</label>
            <input
              type="text"
              placeholder="e.g. Physics"
              value={newSubject.name || ''}
              onChange={(e) => setNewSubject({ ...newSubject, name: e.target.value })}
              className={`w-full ${inputBg} border ${inputBdr} rounded-xl px-3 py-2 ${textPrimary} text-xs focus:outline-none focus:border-emerald-500 transition-colors`}
            />
          </div>

          <div>
            <label className={`block text-xs font-semibold ${textMuted} mb-1.5`}>විෂය නාමය - සිංහල (Sinhala Name)</label>
            <input
              type="text"
              placeholder="e.g. භෞතික විද්‍යාව"
              value={newSubject.sinhalaName || ''}
              onChange={(e) => setNewSubject({ ...newSubject, sinhalaName: e.target.value })}
              className={`w-full ${inputBg} border ${inputBdr} rounded-xl px-3 py-2 ${textPrimary} text-xs focus:outline-none focus:border-emerald-500 transition-colors`}
            />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={`block text-xs font-semibold ${textMuted} mb-1.5`}>අයිකනය (Icon Name)</label>
              <input
                type="text"
                placeholder="e.g. BookOpen"
                value={newSubject.icon || ''}
                onChange={(e) => setNewSubject({ ...newSubject, icon: e.target.value })}
                className={`w-full ${inputBg} border ${inputBdr} rounded-xl px-3 py-2 ${textPrimary} text-xs focus:outline-none focus:border-emerald-500 transition-colors`}
              />
            </div>
            <div>
              <label className={`block text-xs font-semibold ${textMuted} mb-1.5`}>වර්ණය (Color Gradient)</label>
              <input
                type="text"
                placeholder="e.g. from-blue-600 to-indigo-700"
                value={newSubject.color || ''}
                onChange={(e) => setNewSubject({ ...newSubject, color: e.target.value })}
                className={`w-full ${inputBg} border ${inputBdr} rounded-xl px-3 py-2 ${textPrimary} text-xs focus:outline-none focus:border-emerald-500 transition-colors`}
              />
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-2.5 rounded-xl text-xs transition-colors shadow-lg shadow-emerald-500/20"
            >
              {editingSubjectId ? 'Update Subject' : 'Create Subject'}
            </button>
            {editingSubjectId && (
              <button
                type="button"
                onClick={() => {
                  setEditingSubjectId(null);
                  setNewSubject({ id: '', name: '', sinhalaName: '', examType: 'ol', code: '', icon: 'BookOpen', color: 'from-blue-600 to-indigo-700' });
                }}
                className={`px-4 ${surfaceBg} border ${surfaceBdr} hover:${subtleBg} ${textPrimary} font-bold py-2.5 rounded-xl text-xs transition-colors`}
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      </div>

      {/* List of Subjects */}
      <div className={`lg:col-span-7 ${cardBg} border ${cardBdr} rounded-2xl p-6 ${isDark ? '' : 'shadow-md'}`}>
        <div className="flex items-center justify-between mb-6">
          <h2 className={`text-lg font-bold ${textPrimary} flex items-center gap-2`}>
            <LayoutGrid className="w-4 h-4 text-emerald-400" />
            පවතින විෂයයන් (Existing Subjects)
          </h2>
          <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${subtleBg} ${textPrimary}`}>
            Total: {subjects.length}
          </span>
        </div>

        {subjects.length === 0 ? (
          <div className={`text-center py-12 ${textMuted} text-xs font-medium bg-emerald-500/5 rounded-xl border border-emerald-500/10`}>
            No subjects found.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
            {subjects.map(s => (
              <div key={s.id} className={`${surfaceBg} border ${surfaceBdr} rounded-xl p-4 flex flex-col gap-3 group hover:border-emerald-500/30 transition-colors`}>
                <div className="flex justify-between items-start">
                  <div>
                    <div className={`text-xs font-bold text-white px-2 py-0.5 rounded flex w-max items-center gap-1.5 mb-2 bg-gradient-to-r ${s.color}`}>
                      {s.examType.toUpperCase()} | {s.code.toUpperCase()}
                    </div>
                    <div className={`text-sm font-bold ${textPrimary}`}>{s.name}</div>
                    <div className={`text-xs ${textMuted}`}>{s.sinhalaName}</div>
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => handleEditSubjectClick(s)}
                      className="p-1.5 text-blue-500 hover:bg-blue-500/10 rounded-lg transition-colors"
                      title="Edit Subject"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteSubjectClick(s.id)}
                      className="p-1.5 text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
                      title="Delete Subject"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <div className={`text-[10px] font-mono ${textFaint} mt-auto`}>ID: {s.id}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
