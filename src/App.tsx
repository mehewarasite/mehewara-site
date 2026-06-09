import React, { useState, useEffect } from 'react';
import { 
  Atom, 
  FlaskConical, 
  Dna, 
  Calculator, 
  Cpu, 
  Lightbulb, 
  Infinity as InfinityIcon, 
  BookOpen, 
  Compass, 
  ChevronRight, 
  ArrowLeft, 
  Award, 
  History, 
  Settings, 
  ShieldAlert, 
  Sparkles, 
  Clock, 
  Plus,
  BookMarked,
  Layers,
  GraduationCap,
  Sun,
  Moon
} from 'lucide-react';
import { Subject, Paper, Question, UserAttempt } from './types';
import { INITIAL_SUBJECTS, INITIAL_PAPERS, INITIAL_QUESTIONS } from './data';
import BootLoader from './components/BootLoader';
import AdminPanel from './components/AdminPanel';
import PracticeSession from './components/PracticeSession';
import { useTheme } from './ThemeContext';
import {
  dbLoadSubjects, dbSaveSubjects,
  dbLoadPapers, dbSavePaper, dbDeletePaper,
  dbLoadQuestions, dbSaveQuestion, dbSaveQuestions, dbDeleteQuestion, dbDeleteQuestionsByPaper,
  dbLoadStudyHtml, dbSaveStudyHtml, dbDeleteStudyHtml
} from './supabase';

const ICON_MAP: { [key: string]: React.ComponentType<any> } = {
  Atom, FlaskConical, Dna, Calculator, Cpu, Lightbulb,
  Infinity: InfinityIcon, BookOpen, Compass
};

export default function App() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  const [hasBooted, setHasBooted] = useState<boolean>(false);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [papers, setPapers] = useState<Paper[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [attempts, setAttempts] = useState<UserAttempt[]>([]);
  const [selectedLevel, setSelectedLevel] = useState<'ol' | 'al' | null>(null);
  const [selectedSubject, setSelectedSubject] = useState<Subject | null>(null);
  const [activePracticePaper, setActivePracticePaper] = useState<Paper | null>(null);
  const [showAdminPanel, setShowAdminPanel] = useState<boolean>(false);

  useEffect(() => {
    // Attempts are always local (per-user)
    const storedAttempts = localStorage.getItem('m_attempts');
    if (storedAttempts) { setAttempts(JSON.parse(storedAttempts)); }

    // Load shared content from Supabase; fall back to localStorage if offline
    const loadFromSupabase = async () => {
      setIsSyncing(true);
      try {
        const [remoteSubjects, remotePapers, remoteQuestions] = await Promise.all([
          dbLoadSubjects(),
          dbLoadPapers(),
          dbLoadQuestions(),
        ]);

        if (remoteSubjects && remoteSubjects.length > 0) {
          setSubjects(remoteSubjects);
        } else {
          // First run — seed Supabase with initial data
          await dbSaveSubjects(INITIAL_SUBJECTS);
          setSubjects(INITIAL_SUBJECTS);
        }

        if (remotePapers && remotePapers.length > 0) {
          // Load study HTML for each paper from Supabase
          const withHtml = await Promise.all(
            remotePapers.map(async (p) => {
              const html = await dbLoadStudyHtml(p.id);
              return html ? { ...p, studyMaterialHtml: html } : p;
            })
          );
          setPapers(withHtml);
        } else {
          // First run — seed Supabase with initial papers
          await Promise.all(INITIAL_PAPERS.map(p => dbSavePaper(p)));
          setPapers(INITIAL_PAPERS);
        }

        if (remoteQuestions && remoteQuestions.length > 0) {
          setQuestions(remoteQuestions);
        } else {
          // First run — seed Supabase with initial questions
          await dbSaveQuestions(INITIAL_QUESTIONS);
          setQuestions(INITIAL_QUESTIONS);
        }
      } catch (err) {
        console.error('Supabase load failed, falling back to localStorage:', err);
        // Offline fallback
        const storedSubjects = localStorage.getItem('m_subjects');
        setSubjects(storedSubjects ? JSON.parse(storedSubjects) : INITIAL_SUBJECTS);

        const storedPapers = localStorage.getItem('m_papers');
        if (storedPapers) {
          const parsed: Paper[] = JSON.parse(storedPapers);
          const rehydrated = parsed.map(p => {
            const html = localStorage.getItem(`m_study_${p.id}`);
            return html ? { ...p, studyMaterialHtml: html } : p;
          });
          setPapers(rehydrated);
        } else {
          setPapers(INITIAL_PAPERS);
        }

        const storedQuestions = localStorage.getItem('m_questions');
        setQuestions(storedQuestions ? JSON.parse(storedQuestions) : INITIAL_QUESTIONS);
      } finally {
        setIsSyncing(false);
      }
    };

    loadFromSupabase();
  }, []);

  const handleSaveAttempt = (newAttempt: UserAttempt) => {
    const updatedAttempts = [...attempts.filter(a => a.paperId !== newAttempt.paperId), newAttempt];
    setAttempts(updatedAttempts);
    localStorage.setItem('m_attempts', JSON.stringify(updatedAttempts));
  };

  const handleAddPaper = async (newPaper: Paper, importQuestions?: Question[]) => {
    const qCount = importQuestions?.length ?? 0;
    const paperWithCount = { ...newPaper, questionCount: qCount };

    // Update local state immediately for responsive UI
    const updatedPapers = [paperWithCount, ...papers];
    setPapers(updatedPapers);

    // Persist paper to Supabase (without studyMaterialHtml — stored separately)
    await dbSavePaper(paperWithCount);

    // Persist study HTML to Supabase if present
    if (newPaper.studyMaterialHtml) {
      await dbSaveStudyHtml(newPaper.id, newPaper.studyMaterialHtml);
      // Also keep in localStorage as offline cache
      try { localStorage.setItem(`m_study_${newPaper.id}`, newPaper.studyMaterialHtml); } catch {}
    }

    // Persist questions to Supabase
    if (importQuestions && importQuestions.length > 0) {
      const updatedQuestions = [...questions, ...importQuestions];
      setQuestions(updatedQuestions);
      await dbSaveQuestions(importQuestions);
    }
  };

  const handleDeletePaper = async (paperId: string) => {
    // Update local state immediately
    const updatedPapers = papers.filter(p => p.id !== paperId);
    setPapers(updatedPapers);
    const updatedQuestions = questions.filter(q => q.paperId !== paperId);
    setQuestions(updatedQuestions);
    const updatedAttempts = attempts.filter(a => a.paperId !== paperId);
    setAttempts(updatedAttempts);
    localStorage.setItem('m_attempts', JSON.stringify(updatedAttempts));
    localStorage.removeItem(`m_study_${paperId}`);

    // Delete from Supabase
    await Promise.all([
      dbDeletePaper(paperId),
      dbDeleteStudyHtml(paperId),
      dbDeleteQuestionsByPaper(paperId),
    ]);
  };

  const handleAddQuestion = async (newQuestion: Question) => {
    // Shift existing questions in the same paper whose qNumber >= newQuestion.qNumber
    const samePaperQuestions = questions.filter(q => q.paperId === newQuestion.paperId && q.id !== newQuestion.id);
    const hasConflict = samePaperQuestions.some(q => q.qNumber >= newQuestion.qNumber);
    
    let shiftedQuestions: Question[] = [];
    let updatedQuestions: Question[];

    if (hasConflict) {
      // Increment qNumber for all questions at or after the inserted position
      shiftedQuestions = samePaperQuestions
        .filter(q => q.qNumber >= newQuestion.qNumber)
        .map(q => ({ ...q, qNumber: q.qNumber + 1 }));

      const shiftedIds = new Set(shiftedQuestions.map(q => q.id));
      updatedQuestions = [
        ...questions.filter(q => q.id !== newQuestion.id && !shiftedIds.has(q.id)),
        ...shiftedQuestions,
        newQuestion,
      ];
    } else {
      updatedQuestions = [...questions.filter(q => q.id !== newQuestion.id), newQuestion];
    }

    setQuestions(updatedQuestions);

    // Update paper question count
    const paper = papers.find(p => p.id === newQuestion.paperId);
    if (paper) {
      const qCount = updatedQuestions.filter(q => q.paperId === newQuestion.paperId).length;
      const updatedPapers = papers.map(p => p.id === paper.id ? { ...p, questionCount: qCount } : p);
      setPapers(updatedPapers);
      await dbSavePaper({ ...paper, questionCount: qCount });
    }

    // Persist the new question and any shifted questions to Supabase
    await dbSaveQuestion(newQuestion);
    if (shiftedQuestions.length > 0) {
      await dbSaveQuestions(shiftedQuestions);
    }
  };



  const handleDeleteQuestion = async (questionId: string) => {
    const questionToDelete = questions.find(q => q.id === questionId);
    const updatedQuestions = questions.filter(q => q.id !== questionId);
    setQuestions(updatedQuestions);

    if (questionToDelete) {
      const paperId = questionToDelete.paperId;
      const qCount = updatedQuestions.filter(q => q.paperId === paperId).length;
      const updatedPapers = papers.map(p => p.id === paperId ? { ...p, questionCount: qCount } : p);
      setPapers(updatedPapers);
      const paper = papers.find(p => p.id === paperId);
      if (paper) await dbSavePaper({ ...paper, questionCount: qCount });
    }

    await dbDeleteQuestion(questionId);
  };

  const handleUpdateStudyHtml = async (paperId: string, html: string) => {
    // Save to Supabase
    await dbSaveStudyHtml(paperId, html);
    // Update local state so it shows immediately without reload
    setPapers(prev => prev.map(p =>
      p.id === paperId ? { ...p, studyMaterialHtml: html } : p
    ));
    // Cache locally too
    try { localStorage.setItem(`m_study_${paperId}`, html); } catch {}
  };

  const handleResetToDefaults = async () => {
    if (confirm('Do you want to reset the database to default values? This will delete all custom papers and questions from ALL devices.')) {
      setIsSyncing(true);
      try {
        // Delete all current data from Supabase then reseed
        await Promise.all(
          papers.map(p => Promise.all([
            dbDeletePaper(p.id),
            dbDeleteStudyHtml(p.id),
            dbDeleteQuestionsByPaper(p.id),
          ]))
        );
        await Promise.all([
          dbSaveSubjects(INITIAL_SUBJECTS),
          ...INITIAL_PAPERS.map(p => dbSavePaper(p)),
          dbSaveQuestions(INITIAL_QUESTIONS),
        ]);
        setSubjects(INITIAL_SUBJECTS);
        setPapers(INITIAL_PAPERS);
        setQuestions(INITIAL_QUESTIONS);
        setAttempts([]);
        localStorage.setItem('m_attempts', JSON.stringify([]));
        alert('System reset successful!');
      } catch (err) {
        alert('Reset failed: ' + err);
      } finally {
        setIsSyncing(false);
      }
    }
  };


  const handleExportData = () => {
    // Collect all study HTML from localStorage
    const studyHtmlMap: Record<string, string> = {};
    papers.forEach(p => {
      const html = localStorage.getItem(`m_study_${p.id}`);
      if (html) studyHtmlMap[p.id] = html;
    });

    const backup = {
      version: 1,
      exportedAt: new Date().toISOString(),
      subjects,
      papers: papers.map(p => ({ ...p, studyMaterialHtml: undefined })),
      questions,
      studyHtmlMap,
    };

    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mehewara-backup-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportData = (file: File) => {
    if (!confirm('Importing will replace all current papers, questions and study materials. Continue?')) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const backup = JSON.parse(e.target?.result as string);
        if (!backup.version || !backup.papers || !backup.questions) {
          alert('Invalid backup file.');
          return;
        }

        // Restore subjects
        const importedSubjects = backup.subjects ?? subjects;
        setSubjects(importedSubjects);
        localStorage.setItem('m_subjects', JSON.stringify(importedSubjects));

        // Restore study HTML per paper
        const studyHtmlMap: Record<string, string> = backup.studyHtmlMap ?? {};
        const rehydratedPapers = (backup.papers as Paper[]).map((p: Paper) => ({
          ...p,
          studyMaterialHtml: studyHtmlMap[p.id] ?? undefined,
        }));

        // Save study HTML to separate localStorage keys
        rehydratedPapers.forEach(p => {
          if (p.studyMaterialHtml) {
            try { localStorage.setItem(`m_study_${p.id}`, p.studyMaterialHtml); } catch {}
          } else {
            localStorage.removeItem(`m_study_${p.id}`);
          }
        });

        setPapers(rehydratedPapers);
        localStorage.setItem('m_papers', JSON.stringify(
          rehydratedPapers.map(p => ({ ...p, studyMaterialHtml: undefined }))
        ));

        // Restore questions
        setQuestions(backup.questions);
        localStorage.setItem('m_questions', JSON.stringify(backup.questions));

        // Clear attempts (they reference question ids which may have changed)
        setAttempts([]);
        localStorage.setItem('m_attempts', JSON.stringify([]));

        alert(`Import successful! ${rehydratedPapers.length} papers and ${backup.questions.length} questions restored.`);
      } catch {
        alert('Failed to parse backup file. Make sure it is a valid Mehewara export.');
      }
    };
    reader.readAsText(file);
  };

  if (!hasBooted) {
    return <BootLoader onBootComplete={() => setHasBooted(true)} />;
  }

  // Shared class shortcuts based on theme
  const pageBg      = isDark ? 'bg-[#030304]'           : 'bg-[#f0f4f8]';
  const headerBg    = isDark ? 'bg-[#030304]/80'         : 'bg-[#f0f4f8]/85';
  const headerBdr   = isDark ? 'border-slate-900'        : 'border-slate-200';
  const cardBg      = isDark ? 'bg-slate-950/40'         : 'bg-white/70';
  const cardHover   = isDark ? 'hover:bg-slate-900'      : 'hover:bg-white';
  const cardBdr     = isDark ? 'border-slate-900'        : 'border-slate-200';
  const surfaceBg   = isDark ? 'bg-slate-950'            : 'bg-white';
  const surfaceBdr  = isDark ? 'border-slate-800/80'     : 'border-slate-200';
  const btnText     = isDark ? 'text-slate-300'          : 'text-slate-600';
  const btnHover    = isDark ? 'hover:text-white'        : 'hover:text-slate-900';
  const textPrimary = isDark ? 'text-white'              : 'text-slate-900';
  const textMuted   = isDark ? 'text-slate-400'          : 'text-slate-500';
  const textFaint   = isDark ? 'text-slate-500'          : 'text-slate-400';
  const dividerBdr  = isDark ? 'border-slate-900'        : 'border-slate-200';
  const backBtn     = isDark ? 'bg-slate-950 border-slate-900' : 'bg-white border-slate-200 shadow-sm';
  const paperCard   = isDark ? 'bg-slate-950/20 hover:bg-slate-900/30 border-slate-900' : 'bg-white hover:bg-slate-50 border-slate-200 shadow-sm';
  const infoPanel   = isDark ? 'bg-slate-950/40 border-slate-900' : 'bg-white border-slate-200 shadow-sm';
  const statBox     = isDark ? 'bg-slate-900 border-slate-800/50' : 'bg-slate-50 border-slate-200';
  const paperDivider= isDark ? 'border-slate-900/50'     : 'border-slate-100';
  const footerBdr   = isDark ? 'border-slate-900/80'     : 'border-slate-200';
  const footerText  = isDark ? 'text-slate-500'          : 'text-slate-400';
  const footerSub   = isDark ? 'text-slate-600'          : 'text-slate-300';

  return (
    <div className={`relative w-full min-h-screen min-h-[100dvh] ${pageBg} flex flex-col selection:bg-sky-500 selection:text-white`}>
      
      {/* GLOWING HEADER ACCENT */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-[800px] h-32 bg-sky-500/5 blur-3xl rounded-full pointer-events-none" />

      {/* GLOBAL SITE TOP HEAD BAR */}
      <header
        className={`sticky top-0 z-30 ${headerBg} backdrop-blur-md border-b ${headerBdr} px-3 sm:px-4 md:px-8 py-3 sm:py-4 safe-top ${
          activePracticePaper ? 'hidden md:block' : ''
        }`}
      >
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-2 mt-[5px] mb-[5px]">
          
          <div 
            onClick={() => { setSelectedLevel(null); setSelectedSubject(null); setActivePracticePaper(null); }}
            className="flex items-center gap-2.5 sm:gap-3 cursor-pointer group select-none min-w-0"
          >
            <div className="w-9 h-9 sm:w-10 sm:h-10 shrink-0 bg-gradient-to-br from-sky-500 to-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-sky-500/10 sm:group-hover:scale-105 transition-all">
              <GraduationCap className="w-5 h-5 sm:w-5.5 sm:h-5.5" />
            </div>
            <div className="min-w-0">
              <span className="text-lg sm:text-xl md:text-2xl font-extrabold tracking-wide font-display text-transparent bg-clip-text bg-gradient-to-r from-sky-400 via-sky-305 to-blue-400">
                මෙහෙවර
              </span>
              <p className={`hidden sm:block text-[9px] font-mono tracking-widest ${textFaint} uppercase opacity-90`}>MEHEWARA PAST PAPERS</p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* SYNC INDICATOR */}
            {isSyncing && (
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-sky-500/10 border border-sky-500/20">
                <svg className="w-3 h-3 text-sky-400 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                </svg>
                <span className="text-[10px] font-semibold text-sky-400 hidden sm:inline">Syncing</span>
              </div>
            )}
            {/* THEME TOGGLE BUTTON */}
            <button
              onClick={toggleTheme}
              aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
              className={`flex items-center justify-center min-h-[44px] min-w-[44px] px-3 py-2 ${surfaceBg} hover:bg-slate-100 dark:hover:bg-slate-800 ${surfaceBdr} border ${textMuted} hover:text-sky-400 rounded-xl transition-all shadow-sm cursor-pointer select-none`}
              title={isDark ? 'Light mode' : 'Dark mode'}
            >
              {isDark
                ? <Sun className="w-4 h-4" />
                : <Moon className="w-4 h-4" />
              }
            </button>

            <button
              onClick={() => setShowAdminPanel(true)}
              aria-label="Admin panel"
              className={`flex items-center justify-center gap-2 min-h-[44px] min-w-[44px] sm:min-w-0 px-3 sm:px-3.5 py-2 ${surfaceBg} ${cardHover} border ${surfaceBdr} hover:border-slate-700/80 dark:hover:border-slate-700/80 text-xs font-semibold ${btnText} ${btnHover} rounded-xl transition-all shadow-sm cursor-pointer select-none`}
            >
              <Settings className="w-4 h-4 text-sky-400 animate-spin-slow" />
              <span className="hidden sm:inline">Admin</span>
            </button>
          </div>

        </div>
      </header>

      {/* MAIN LAYOUT BODY */}
      <main className={`flex-grow max-w-6xl w-full mx-auto relative z-10 flex flex-col safe-bottom ${
        activePracticePaper
          ? 'px-0 py-0 max-w-none'
          : 'px-3 sm:px-4 md:px-8 py-4 sm:py-6 md:py-8'
      }`}>
        
        {activePracticePaper ? (
          <PracticeSession
            paper={activePracticePaper}
            questions={questions.filter(q => q.paperId === activePracticePaper.id)}
            onSaveAttempt={handleSaveAttempt}
            savedAttempt={attempts.find(a => a.paperId === activePracticePaper.id)}
            onClose={() => setActivePracticePaper(null)}
          />
        ) : (
          <div className="space-y-6 sm:space-y-8 flex-grow flex flex-col">
            
            {/* VIEW 1: CHOOSE LEVEL */}
            {selectedLevel === null && (
              <div className="flex-grow flex flex-col justify-center py-2 sm:py-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 max-w-3xl mx-auto w-full">
                  
                  {/* O/L Card */}
                  <button
                    onClick={() => setSelectedLevel('ol')}
                    className={`group relative ${cardBg} ${cardHover} border ${cardBdr} hover:border-emerald-500/30 rounded-2xl sm:rounded-3xl p-5 sm:p-8 text-left transition-all duration-350 shadow-lg sm:hover:shadow-[0_0_30px_rgba(16,185,129,0.06)] cursor-pointer select-none active:scale-[0.99]`}
                  >
                    <div className={`absolute top-0 right-0 p-4 sm:p-8 ${isDark ? 'text-slate-800/10' : 'text-slate-300/40'} group-hover:text-emerald-500/5 transition-colors pointer-events-none`}>
                      <Layers className="w-16 h-16 sm:w-24 sm:h-24" />
                    </div>
                    <div className="w-11 h-11 sm:w-12 sm:h-12 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl flex items-center justify-center text-emerald-400 sm:group-hover:scale-105 transition-all mb-4 sm:mb-6">
                      <Layers className="w-5 h-5 sm:w-6 sm:h-6" />
                    </div>
                    <h3 className={`text-xl sm:text-2xl font-bold ${textPrimary} group-hover:text-emerald-400 transition-colors`}>
                      සාමාන්‍ය පෙළ (O/L)
                    </h3>
                    <p className={`text-xs ${textMuted} mt-2 leading-relaxed`}>
                      සාමාන්‍ය පෙළ විද්‍යාව, ගණිතය ඇතුළු ප්‍රධාන විෂයන්හි බහුවරණ ප්‍රශ්න පත්‍ර මෙහිදී සිංහල මාධ්‍යයෙන් පුහුණුවන්න.
                    </p>
                    <div className={`mt-5 sm:mt-8 flex items-center gap-1.5 text-xs font-bold ${textFaint} group-hover:text-emerald-400 transition-all`}>
                      <span>සක්‍රිය විෂයන් අධ්‍යයනය කරන්න</span>
                      <ChevronRight className="w-4 h-4 shrink-0 transform group-hover:translate-x-1 transition-transform" />
                    </div>
                  </button>

                  {/* A/L Card */}
                  <button
                    onClick={() => setSelectedLevel('al')}
                    className={`group relative ${cardBg} ${cardHover} border ${cardBdr} hover:border-sky-500/30 rounded-2xl sm:rounded-3xl p-5 sm:p-8 text-left transition-all duration-350 shadow-lg sm:hover:shadow-[0_0_30px_rgba(14,165,233,0.06)] cursor-pointer select-none active:scale-[0.99]`}
                  >
                    <div className={`absolute top-0 right-0 p-4 sm:p-8 ${isDark ? 'text-slate-800/10' : 'text-slate-300/40'} group-hover:text-sky-500/5 transition-colors pointer-events-none`}>
                      <GraduationCap className="w-16 h-16 sm:w-24 sm:h-24" />
                    </div>
                    <div className="w-11 h-11 sm:w-12 sm:h-12 bg-sky-500/10 border border-sky-500/30 rounded-2xl flex items-center justify-center text-sky-400 sm:group-hover:scale-105 transition-all mb-4 sm:mb-6">
                      <GraduationCap className="w-5 h-5 sm:w-6 sm:h-6" />
                    </div>
                    <h3 className={`text-xl sm:text-2xl font-bold ${textPrimary} group-hover:text-sky-400 transition-colors`}>
                      උසස් පෙළ (A/L)
                    </h3>
                    <p className={`text-xs ${textMuted} mt-2 leading-relaxed`}>
                      භෞතික විද්‍යාව, රසායන විද්‍යාව සහ ජීව විද්‍යාව ඇතුළු උසස් පෙළ විද්‍යා/ගණිත/තාක්ෂණ විෂයන්හි MCQ පත්‍ර මෙහිදී විසඳන්න.
                    </p>
                    <div className={`mt-5 sm:mt-8 flex items-center gap-1.5 text-xs font-bold ${textFaint} group-hover:text-sky-400 transition-all`}>
                      <span>සක්‍රිය විෂයන් අධ්‍යයනය කරන්න</span>
                      <ChevronRight className="w-4 h-4 shrink-0 transform group-hover:translate-x-1 transition-transform" />
                    </div>
                  </button>
                </div>
              </div>
            )}

            {/* VIEW 2: SUBJECTS LIST */}
            {selectedLevel !== null && selectedSubject === null && (
              <div className="space-y-4 sm:space-y-6 flex-grow animate-fade-in">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setSelectedLevel(null)}
                    className={`flex items-center gap-1.5 text-xs ${textMuted} hover:text-sky-400 transition-colors py-2 px-3 min-h-[44px] ${backBtn} rounded-lg cursor-pointer`}
                  >
                    <ArrowLeft className="w-3.5 h-3.5 shrink-0" />
                    <span className="sm:hidden">ආපසු</span>
                    <span className="hidden sm:inline">ආපසු (Change exam level)</span>
                  </button>
                </div>

                <div className={`space-y-2 border-b ${dividerBdr} pb-3 sm:pb-4`}>
                  <span className="text-[10px] tracking-widest text-sky-400 font-mono font-bold uppercase">
                    {selectedLevel === 'ol' ? 'Ordinary Level' : 'Advanced Level'} විෂයන්
                  </span>
                  <h2 className={`text-xl sm:text-2xl md:text-3xl font-extrabold ${textPrimary} leading-snug`}>විෂයන් තෝරාගන්න (Select Subject)</h2>
                </div>

                {(() => {
                  const filteredSubjects = subjects.filter(s => s.examType === selectedLevel);
                  if (filteredSubjects.length === 0) {
                    return (
                      <div className={`text-center py-12 ${textFaint} text-xs`}>
                        මෙම මට්ටම යටතේ විෂයන් කිසිවක් සක්‍රිය නැත.
                      </div>
                    );
                  }
                  return (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-5">
                      {filteredSubjects.map((sub) => {
                        const IconComponent = ICON_MAP[sub.icon] || BookOpen;
                        const paperCount = papers.filter(p => p.subjectId === sub.id).length;
                        return (
                          <button
                            key={sub.id}
                            onClick={() => setSelectedSubject(sub)}
                            className={`group relative p-4 sm:p-6 text-left border rounded-2xl transition-all duration-300 cursor-pointer select-none active:scale-[0.99] bg-gradient-to-br ${sub.color}`}
                          >
                            <div className="flex justify-between items-start mb-6">
                              <div className="p-3 bg-slate-950/40 rounded-xl">
                                <IconComponent className="w-6 h-6 text-white" />
                              </div>
                              <span className="text-[10px] font-mono bg-white/10 text-white font-bold px-2 py-0.5 rounded-md uppercase">
                                {sub.code}
                              </span>
                            </div>
                            <h3 className="text-base sm:text-lg font-bold text-white line-clamp-2">{sub.sinhalaName}</h3>
                            <p className="text-xs text-white/70 font-mono mt-0.5 leading-normal">{sub.name}</p>
                            <div className="mt-6 pt-4 border-t border-white/5 flex items-center justify-between text-xs text-white/80">
                              <span>⏱️ ක්‍රියාකාරි MCQ පත්‍ර: <strong className="font-mono bg-white/10 px-1.5 py-0.5 rounded text-[10px]">{paperCount}</strong></span>
                              <ChevronRight className="w-4 h-4 transform group-hover:translate-x-1 transition-transform text-white/50 group-hover:text-white" />
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            )}

            {/* VIEW 3: PAST PAPERS LIST */}
            {selectedSubject !== null && activePracticePaper === null && (
              <div className="space-y-4 sm:space-y-6 flex-grow animate-fade-in">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setSelectedSubject(null)}
                    className={`flex items-center gap-1.5 text-xs ${textMuted} hover:text-sky-400 transition-colors py-2 px-3 min-h-[44px] ${backBtn} rounded-lg cursor-pointer`}
                  >
                    <ArrowLeft className="w-3.5 h-3.5 shrink-0" />
                    <span className="sm:hidden">ආපසු</span>
                    <span className="hidden sm:inline">ආපසු විෂයන් වෙත (Back to Subjects)</span>
                  </button>
                </div>

                <div className={`p-4 sm:p-6 ${infoPanel} border rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4`}>
                  <div className="space-y-1 min-w-0">
                    <span className="text-[10px] tracking-widest text-sky-400 font-mono font-bold uppercase">
                      {selectedLevel?.toUpperCase()} Exam &bull; {selectedSubject.name}
                    </span>
                    <h2 className={`text-xl sm:text-2xl font-extrabold ${textPrimary} leading-snug`}>{selectedSubject.sinhalaName} පසුගිය ප්‍රශ්න පත්‍ර</h2>
                    <p className={`text-xs ${textMuted} leading-relaxed max-w-xl`}>
                      විභාග කාල නියමයන්ට අනුකූලව පසුගිය විභාග බහුවරණ ප්‍රශ්න පත්‍ර (පැරණි සහ නව නිර්දේශ) මෙහිදී විසඳන්න.
                    </p>
                  </div>
                  <div className={`flex items-center ${statBox} p-3 rounded-xl border self-start md:self-auto`}>
                    <BookMarked className="w-8 h-8 text-sky-400 opacity-80 mr-3" />
                    <div className="text-xs text-slate-350">
                      <span className={textMuted}>සම්පූර්ණ ප්‍රශ්න පත්‍ර ගණන</span>
                      <p className={`text-lg font-bold ${textPrimary} font-mono mt-0.5`}>
                        {papers.filter(p => p.subjectId === selectedSubject.id).length} Active papers
                      </p>
                    </div>
                  </div>
                </div>

                {(() => {
                  const subjectPapers = papers.filter(p => p.subjectId === selectedSubject.id);
                  if (subjectPapers.length === 0) {
                    return (
                      <div className={`text-center py-12 ${isDark ? 'bg-slate-950/20' : 'bg-slate-50'} rounded-2xl border border-dashed ${cardBdr} ${textFaint} text-xs`}>
                        මෙම විෂයට අදාළ ප්‍රශ්න පත්‍ර කිසිවක් දැනට සක්‍රිය නැත.
                        <p className="mt-1 text-[10px]">කරුණාකර පාලක පැනලයෙන් නව ප්‍රශ්න පත්‍ර එක් කිරීමට සහාය වන්න.</p>
                      </div>
                    );
                  }
                  return (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {subjectPapers.map((paper) => {
                        const previousAttempt = attempts.find(a => a.paperId === paper.id);
                        const paperQuestions = questions.filter(q => q.paperId === paper.id);
                        let scoreBadge = null;
                        if (previousAttempt?.isCompleted && paperQuestions.length > 0) {
                          let correct = 0;
                          paperQuestions.forEach((q) => {
                            if (previousAttempt.answers[q.id] === q.correctOption) correct++;
                          });
                          const percent = Math.round((correct / paperQuestions.length) * 100);
                          scoreBadge = (
                            <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full font-bold font-mono">
                              ✓ {percent}% (Completed)
                            </span>
                          );
                        } else if (previousAttempt) {
                          scoreBadge = (
                            <span className="text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded-full font-bold">
                              ⌛ In Progress
                            </span>
                          );
                        }
                        return (
                          <div
                            key={paper.id}
                            className={`flex flex-col justify-between p-4 sm:p-5 ${paperCard} border rounded-2xl sm:hover:scale-[1.01] transition-all`}
                          >
                            <div className="space-y-3 sm:space-y-4">
                              <div className="flex justify-between items-start gap-2">
                                <h3
                                  className={`text-sm sm:text-base font-bold ${textPrimary} hover:text-sky-400 cursor-pointer transition-colors leading-snug flex-1 min-w-0`}
                                  onClick={() => setActivePracticePaper(paper)}
                                >
                                  {paper.sinhalaTitle}
                                </h3>
                                <span className={`text-xs ${isDark ? 'bg-slate-900' : 'bg-slate-100'} text-sky-400 px-2 py-0.5 rounded-md font-mono font-bold`}>
                                  {paper.year}
                                </span>
                              </div>
                              <div className={`flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs ${textMuted}`}>
                                <span className="flex items-center gap-1">
                                  <Clock className={`w-3.5 h-3.5 ${textFaint}`} />
                                  විනාඩි {paper.durationMinutes}
                                </span>
                                <span className="flex items-center gap-1">
                                  <Layers className={`w-3.5 h-3.5 ${textFaint}`} />
                                  ප්‍රශ්න {paperQuestions.length} ක් අඩංගුයි
                                </span>
                                {scoreBadge}
                              </div>
                            </div>
                            <div className={`mt-4 sm:mt-6 pt-4 border-t ${paperDivider} flex flex-col-reverse sm:flex-row sm:justify-between sm:items-center gap-3`}>
                              {previousAttempt ? (
                                <button
                                  onClick={() => setActivePracticePaper(paper)}
                                  className="text-xs font-bold text-sky-450 hover:text-sky-350 cursor-pointer flex items-center gap-1 text-left min-h-[44px] sm:min-h-0"
                                >
                                  {previousAttempt.isCompleted ? (
                                    <>
                                      <span className="sm:hidden">සමාලෝචනය</span>
                                      <span className="hidden sm:inline">පිළිතුරු සමාලෝචනය (Review Answers)</span>
                                    </>
                                  ) : (
                                    <>
                                      <span className="sm:hidden">ඉදිරියට ගෙනයන්න →</span>
                                      <span className="hidden sm:inline">වැඩ කටයුතු ඉදිරියට ගෙනයන්න →</span>
                                    </>
                                  )}
                                </button>
                              ) : (
                                <span className={`text-[11px] ${textFaint} font-mono uppercase italic tracking-wider`}>NOT STARTED</span>
                              )}
                              <button
                                onClick={() => setActivePracticePaper(paper)}
                                className="w-full sm:w-auto min-h-[44px] px-4 py-2.5 sm:py-2 bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white rounded-xl text-xs font-bold font-sans tracking-wide transition-all cursor-pointer active:scale-[0.98]"
                              >
                                {previousAttempt ? 'නැවත අරඹන්න' : 'පිළිතුරු ලියන්න (Practice)'}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            )}

          </div>
        )}
      </main>

      {/* FOOTER */}
      <footer className={`border-t ${footerBdr} py-4 sm:py-6 px-3 text-center text-xs ${footerText} select-none safe-bottom flex flex-col items-center gap-1 ${activePracticePaper ? 'hidden md:block' : ''}`}>
        <p className="font-mono text-[11px] sm:text-xs">මෙහෙවර &copy; 2026 MEHEWARA EDUCATIONAL PLATFORM</p>
        <div className="mt-0.5 text-[10px]">
          <span className={`hidden sm:inline ${footerSub}`}>by 26 E-FAC RUH - MADE WITH ❤️ &nbsp;&nbsp;&nbsp;&nbsp;</span>
          <a href="/privacy-policy.html" target="_blank" rel="noopener noreferrer" className="hover:underline hover:text-sky-400 transition-colors">Privacy Policy</a>
        </div>
      </footer>

      {/* OVERLAY: RESTRICTED ADMIN DASHBOARD */}
      {showAdminPanel && (
        <AdminPanel
          subjects={subjects}
          papers={papers}
          questions={questions}
          onAddPaper={handleAddPaper}
          onDeletePaper={handleDeletePaper}
          onAddQuestion={handleAddQuestion}
          onDeleteQuestion={handleDeleteQuestion}
          onUpdateStudyHtml={handleUpdateStudyHtml}
          onResetToDefaults={handleResetToDefaults}
          onExportData={handleExportData}
          onImportData={handleImportData}
          onClose={() => setShowAdminPanel(false)}
        />
      )}

    </div>
  );
}