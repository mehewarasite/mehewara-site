import React, { useState, useEffect, useRef } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, RefreshCw, X, ArrowRight, Code } from 'lucide-react';
import { DiagnosticResult, validateQuizText } from '../../utils/quizValidator';
import type { AdminThemeClasses } from './types';

interface ParserDiagnosticModalProps {
  theme: AdminThemeClasses;
  initialRawContent: string;
  initialFileName: string;
  isOpen: boolean;
  onClose: () => void;
  onConfirmImport: (questions: any[], fileName: string) => void;
}

export default function ParserDiagnosticModal({
  theme,
  initialRawContent,
  initialFileName,
  isOpen,
  onClose,
  onConfirmImport,
}: ParserDiagnosticModalProps) {
  const { isDark, cardBg, cardBdr, inputBg, inputBdr, textPrimary, textMuted, textFaint, subtleBg } = theme;

  const [rawText, setRawText] = useState(initialRawContent);
  const [diagnostic, setDiagnostic] = useState<DiagnosticResult>(() => validateQuizText(initialRawContent));
  const [selectedLine, setSelectedLine] = useState<number | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setRawText(initialRawContent);
    setDiagnostic(validateQuizText(initialRawContent));
  }, [initialRawContent]);

  if (!isOpen) return null;

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setRawText(val);
    const res = validateQuizText(val);
    setDiagnostic(res);
  };

  const jumpToLine = (lineNumber: number) => {
    setSelectedLine(lineNumber);
    if (!textareaRef.current) return;
    const lines = rawText.split('\n');
    let charPos = 0;
    for (let i = 0; i < Math.min(lineNumber - 1, lines.length); i++) {
      charPos += lines[i].length + 1;
    }
    textareaRef.current.focus();
    textareaRef.current.setSelectionRange(charPos, charPos + (lines[lineNumber - 1]?.length || 0));
    const lineHeight = 20;
    textareaRef.current.scrollTop = Math.max(0, (lineNumber - 5) * lineHeight);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className={`flex flex-col w-full max-w-7xl h-[92vh] ${cardBg} border ${cardBdr} rounded-2xl shadow-2xl overflow-hidden`}>
        {/* Header */}
        <div className={`flex items-center justify-between px-6 py-4 border-b ${cardBdr} ${subtleBg}`}>
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-xl ${diagnostic.isValid ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
              {diagnostic.isValid ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
            </div>
            <div>
              <h2 className={`text-base font-bold ${textPrimary} flex items-center gap-2`}>
                File Syntax Inspector
                <span className={`text-xs px-2 py-0.5 rounded-full font-mono ${diagnostic.isValid ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
                  {diagnostic.isValid ? 'Syntax Valid' : `${diagnostic.errors.length} Errors Found`}
                </span>
              </h2>
              <p className={`text-xs ${textMuted} font-mono mt-0.5`}>
                Inspecting: <span className="text-sky-400">{initialFileName}</span> • {diagnostic.questions.length} questions parsed
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

        {/* Body Split View */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 overflow-hidden">
          {/* Left Column: Diagnostics Report */}
          <div className={`lg:col-span-5 flex flex-col border-r ${cardBdr} overflow-hidden ${isDark ? 'bg-slate-900/50' : 'bg-slate-50/50'}`}>
            <div className={`p-4 border-b ${cardBdr} flex items-center justify-between`}>
              <span className={`text-xs font-bold uppercase tracking-wider ${textMuted}`}>
                Diagnostics ({diagnostic.errors.length} errors, {diagnostic.warnings.length} warnings)
              </span>
              <button
                onClick={() => setDiagnostic(validateQuizText(rawText))}
                className="flex items-center gap-1.5 text-xs text-sky-400 hover:text-sky-300 font-semibold transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Re-check
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
              {diagnostic.errors.length === 0 && diagnostic.warnings.length === 0 && (
                <div className="p-8 text-center flex flex-col items-center justify-center h-full">
                  <CheckCircle2 className="w-12 h-12 text-emerald-400 mb-3 animate-bounce" />
                  <p className={`text-sm font-bold ${textPrimary}`}>All Checks Passed!</p>
                  <p className={`text-xs ${textMuted} max-w-xs mt-1 text-center`}>
                    This file has 0 syntax errors. All {diagnostic.questions.length} questions have valid options, correct answers, and format markers.
                  </p>
                </div>
              )}

              {/* Errors List */}
              {diagnostic.errors.map((err, i) => (
                <div
                  key={`err-${i}`}
                  onClick={() => jumpToLine(err.line)}
                  className={`p-3 rounded-xl border transition-all cursor-pointer ${
                    selectedLine === err.line
                      ? 'bg-rose-500/15 border-rose-500/50 shadow-md'
                      : 'bg-rose-500/5 border-rose-500/20 hover:border-rose-500/40'
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-rose-400">
                          Line {err.line} {err.questionNumber ? `• Question ${err.questionNumber}` : ''}
                        </span>
                        <span className="text-[10px] text-rose-400/80 font-mono flex items-center gap-0.5 hover:underline">
                          Jump to line <ArrowRight className="w-2.5 h-2.5" />
                        </span>
                      </div>
                      <p className={`text-xs font-medium ${textPrimary} mt-1`}>{err.message}</p>
                      {err.snippet && (
                        <p className={`text-[11px] ${textFaint} font-mono mt-1.5 p-1.5 rounded bg-slate-950/40 truncate`}>
                          {err.snippet}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}

              {/* Warnings List */}
              {diagnostic.warnings.map((warn, i) => (
                <div
                  key={`warn-${i}`}
                  onClick={() => jumpToLine(warn.line)}
                  className={`p-3 rounded-xl border transition-all cursor-pointer ${
                    selectedLine === warn.line
                      ? 'bg-amber-500/15 border-amber-500/50 shadow-md'
                      : 'bg-amber-500/5 border-amber-500/20 hover:border-amber-500/40'
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-amber-400">
                          Line {warn.line} {warn.questionNumber ? `• Question ${warn.questionNumber}` : ''}
                        </span>
                        <span className="text-[10px] text-amber-400/80 font-mono flex items-center gap-0.5 hover:underline">
                          Jump <ArrowRight className="w-2.5 h-2.5" />
                        </span>
                      </div>
                      <p className={`text-xs font-medium ${textPrimary} mt-1`}>{warn.message}</p>
                      {warn.snippet && (
                        <p className={`text-[11px] ${textFaint} font-mono mt-1.5 p-1.5 rounded bg-slate-950/40 truncate`}>
                          {warn.snippet}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right Column: Live In-Modal Editor */}
          <div className="lg:col-span-7 flex flex-col overflow-hidden">
            <div className={`p-4 border-b ${cardBdr} flex items-center justify-between ${subtleBg}`}>
              <div className="flex items-center gap-2">
                <Code className="w-4 h-4 text-sky-400" />
                <span className={`text-xs font-bold uppercase tracking-wider ${textMuted}`}>
                  Quick Text Fixer (Live Validation)
                </span>
              </div>
              <span className={`text-xs ${textFaint} font-mono`}>
                {rawText.split('\n').length} lines • {rawText.length} characters
              </span>
            </div>

            <div className="flex-1 relative overflow-hidden flex flex-col p-4">
              <textarea
                ref={textareaRef}
                value={rawText}
                onChange={handleTextChange}
                placeholder="Paste or edit quiz questions here..."
                spellCheck={false}
                className={`w-full flex-1 p-4 font-mono text-xs leading-relaxed rounded-xl border ${inputBdr} ${inputBg} ${textPrimary} focus:outline-none focus:ring-2 focus:ring-sky-500/50 resize-none custom-scrollbar`}
              />
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className={`flex items-center justify-between px-6 py-4 border-t ${cardBdr} ${subtleBg}`}>
          <div className="flex items-center gap-2">
            {!diagnostic.isValid ? (
              <span className="text-xs text-rose-400 font-semibold flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4" /> Please fix all {diagnostic.errors.length} syntax error(s) before importing.
              </span>
            ) : (
              <span className="text-xs text-emerald-400 font-semibold flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" /> Ready! {diagnostic.questions.length} questions parsed cleanly.
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className={`px-4 py-2 rounded-xl border ${cardBdr} hover:${subtleBg} ${textMuted} text-xs font-semibold transition-colors`}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!diagnostic.isValid || diagnostic.questions.length === 0}
              onClick={() => onConfirmImport(diagnostic.questions, initialFileName)}
              className="px-5 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 disabled:opacity-40 disabled:hover:bg-sky-500 text-white text-xs font-bold transition-all shadow-lg shadow-sky-500/20 flex items-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4" /> Import {diagnostic.questions.length} Questions
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
