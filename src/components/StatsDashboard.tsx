import React, { useState, useMemo } from 'react';
import { 
  X, 
  BarChart2, 
  BookOpen, 
  FileText, 
  HelpCircle, 
  Lock, 
  Unlock,
  TrendingUp,
  Activity,
  Layers,
  Globe
} from 'lucide-react';
import { Subject, Paper, Question } from '../types';
import { useTheme } from '../ThemeContext';

interface StatsDashboardProps {
  subjects: Subject[];
  papers: Paper[];
  questions: Question[];
  onClose: () => void;
}

export default function StatsDashboard({ subjects, papers, questions, onClose }: StatsDashboardProps) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [passcode, setPasscode] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  // Theming constants
  const overlayBg = isDark ? 'bg-slate-950/90' : 'bg-white/90';
  const pageBg = isDark ? 'bg-slate-950' : 'bg-slate-50';
  const cardBg = isDark ? 'bg-slate-900' : 'bg-white';
  const textPrimary = isDark ? 'text-white' : 'text-slate-900';
  const textMuted = isDark ? 'text-slate-400' : 'text-slate-500';
  const textFaint = isDark ? 'text-slate-500' : 'text-slate-400';
  const cardBdr = isDark ? 'border-slate-800' : 'border-slate-200';
  const inputBg = isDark ? 'bg-slate-900/50' : 'bg-slate-50';
  const inputBdr = isDark ? 'border-slate-800' : 'border-slate-300';
  const dividerBdr = isDark ? 'border-slate-800' : 'border-slate-200';

  // Stats Calculations
  const stats = useMemo(() => {
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

  const handleAuth = (e: React.FormEvent) => {
    e.preventDefault();
    if (passcode === 'stats2026') {
      setIsAuthenticated(true);
      setErrorMessage('');
    } else {
      setErrorMessage('Access Denied. Invalid Authorization Code.');
      setPasscode('');
    }
  };

  if (!isAuthenticated) {
    return (
      <div className={`fixed inset-0 z-[60] flex items-center justify-center p-4 backdrop-blur-md ${overlayBg}`}>
        <div className={`w-full max-w-sm ${cardBg} border ${cardBdr} rounded-3xl p-8 shadow-2xl relative overflow-hidden`}>
          
          {/* Close button for login screen */}
          <button 
            onClick={onClose}
            className={`absolute top-4 right-4 p-2 rounded-full ${isDark ? 'hover:bg-slate-800 text-slate-400 hover:text-white' : 'hover:bg-slate-100 text-slate-500 hover:text-slate-900'} transition-colors`}
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex justify-center mb-6">
            <div className={`p-4 rounded-2xl ${isDark ? 'bg-fuchsia-500/10' : 'bg-fuchsia-100'}`}>
              <BarChart2 className={`w-10 h-10 ${isDark ? 'text-fuchsia-400' : 'text-fuchsia-600'}`} />
            </div>
          </div>
          
          <h2 className={`text-2xl font-black ${textPrimary} text-center mb-2 font-display`}>Stats for Nerds</h2>
          <p className={`text-xs ${textMuted} text-center mb-8 font-mono`}>Enter clearance code to view global metrics.</p>
          
          <form onSubmit={handleAuth} className="space-y-4">
            <div>
              <input
                type="password"
                placeholder="Passcode"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                className={`w-full ${inputBg} border ${inputBdr} focus:border-fuchsia-500 rounded-xl px-4 py-3 ${textPrimary} text-center focus:outline-none focus:ring-1 focus:ring-fuchsia-500 transition-all font-mono`}
                autoFocus
              />
            </div>
            {errorMessage && (
              <p className="text-red-500 text-xs text-center font-sans tracking-wide animate-fade-in">{errorMessage}</p>
            )}

            <button
              type="submit"
              className="w-full py-3 bg-gradient-to-r from-fuchsia-500 to-fuchsia-600 hover:from-fuchsia-400 hover:to-fuchsia-500 text-white rounded-xl font-bold font-sans text-sm tracking-widest transition-all hover:shadow-[0_0_15px_rgba(217,70,239,0.3)] cursor-pointer flex items-center justify-center gap-2"
            >
              <Unlock className="w-4 h-4" />
              AUTHENTICATE
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className={`fixed inset-0 z-[60] ${pageBg} overflow-y-auto p-4 md:p-8 animate-fade-in`}>
      <div className="max-w-5xl mx-auto">
        
        {/* Header */}
        <div className={`flex flex-col md:flex-row md:items-center justify-between border-b ${dividerBdr} pb-6 mb-8 gap-4`}>
          <div className="flex items-center gap-4">
            <div className={`p-3 rounded-2xl ${isDark ? 'bg-fuchsia-500/10' : 'bg-fuchsia-100'} border ${isDark ? 'border-fuchsia-500/20' : 'border-fuchsia-200'}`}>
              <BarChart2 className={`w-6 h-6 ${isDark ? 'text-fuchsia-400' : 'text-fuchsia-600'}`} />
            </div>
            <div>
              <h1 className={`text-2xl md:text-3xl font-extrabold ${textPrimary} font-display tracking-wide leading-tight`}>
                Stats for Nerds
              </h1>
              <p className={`text-sm ${textMuted} font-mono mt-1`}>Global Content Metrics & System Health</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className={`flex items-center gap-2 px-4 py-2 ${isDark ? 'bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white' : 'bg-white hover:bg-slate-50 text-slate-600 hover:text-slate-900'} border ${cardBdr} rounded-xl font-semibold transition-all cursor-pointer shadow-sm`}
          >
            <X className="w-4 h-4" />
            Close Dashboard
          </button>
        </div>

        {/* Bento Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
          
          {/* Total Questions - Hero Card */}
          <div className={`col-span-1 md:col-span-2 lg:col-span-2 ${cardBg} border ${cardBdr} rounded-3xl p-6 relative overflow-hidden ${isDark ? '' : 'shadow-md'} flex flex-col justify-between`}>
            <div className="absolute top-0 right-0 p-8 opacity-10">
              <HelpCircle className="w-32 h-32 text-fuchsia-500" />
            </div>
            <div>
              <div className="flex items-center gap-2 text-fuchsia-500 font-bold text-sm mb-2">
                <Activity className="w-4 h-4" />
                TOTAL QUESTION BANK
              </div>
              <h2 className={`text-6xl md:text-7xl font-black ${textPrimary} font-display tracking-tighter`}>
                {questions.length.toLocaleString()}
              </h2>
            </div>
            <p className={`text-sm ${textMuted} mt-6 max-w-[80%]`}>
              Total number of multiple-choice questions actively loaded across all available past papers and practice tests.
            </p>
          </div>

          {/* Average Questions per Paper */}
          <div className={`col-span-1 lg:col-span-1 ${cardBg} border ${cardBdr} rounded-3xl p-6 ${isDark ? '' : 'shadow-md'} flex flex-col justify-between`}>
            <div>
              <div className="flex items-center gap-2 text-indigo-500 font-bold text-sm mb-2">
                <TrendingUp className="w-4 h-4" />
                AVG Q / PAPER
              </div>
              <h2 className={`text-5xl font-black ${textPrimary} font-display tracking-tighter`}>
                {stats.avgQuestions}
              </h2>
            </div>
            <p className={`text-xs ${textMuted} mt-4`}>Average questions loaded per active paper.</p>
          </div>

          {/* Top Subject */}
          <div className={`col-span-1 lg:col-span-1 ${cardBg} border ${cardBdr} rounded-3xl p-6 ${isDark ? '' : 'shadow-md'} flex flex-col justify-between`}>
            <div>
              <div className="flex items-center gap-2 text-amber-500 font-bold text-sm mb-2">
                <Activity className="w-4 h-4" />
                TOP SUBJECT
              </div>
              <h2 className={`text-2xl font-black ${textPrimary} font-display leading-tight truncate`} title={stats.topSubject}>
                {stats.topSubject}
              </h2>
              <p className={`text-xl font-bold ${textMuted} font-mono mt-1`}>
                {stats.topSubjectCount} Papers
              </p>
            </div>
          </div>

          {/* Total Papers - Split */}
          <div className={`col-span-1 md:col-span-2 ${cardBg} border ${cardBdr} rounded-3xl p-6 ${isDark ? '' : 'shadow-md'}`}>
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2 text-sky-500 font-bold text-sm">
                <FileText className="w-4 h-4" />
                TOTAL PAPERS
              </div>
              <span className={`text-3xl font-black ${textPrimary} font-display`}>{papers.length}</span>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className={`p-4 rounded-2xl ${isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'} border`}>
                <div className="flex items-center gap-2 text-xs font-bold text-emerald-500 mb-1">
                  <Globe className="w-3.5 h-3.5" /> SINHALA (SI)
                </div>
                <div className={`text-3xl font-bold ${textPrimary}`}>{stats.siPapers}</div>
              </div>
              <div className={`p-4 rounded-2xl ${isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'} border`}>
                <div className="flex items-center gap-2 text-xs font-bold text-indigo-500 mb-1">
                  <Globe className="w-3.5 h-3.5" /> ENGLISH (EN)
                </div>
                <div className={`text-3xl font-bold ${textPrimary}`}>{stats.enPapers}</div>
              </div>
            </div>
          </div>

          {/* Total Subjects - Split */}
          <div className={`col-span-1 md:col-span-2 ${cardBg} border ${cardBdr} rounded-3xl p-6 ${isDark ? '' : 'shadow-md'}`}>
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2 text-emerald-500 font-bold text-sm">
                <BookOpen className="w-4 h-4" />
                TOTAL SUBJECTS
              </div>
              <span className={`text-3xl font-black ${textPrimary} font-display`}>{subjects.length}</span>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className={`p-4 rounded-2xl ${isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'} border`}>
                <div className={`text-xs font-bold ${textMuted} mb-1 tracking-wider`}>O/L STREAM</div>
                <div className={`text-3xl font-bold ${textPrimary}`}>{stats.olSubjects}</div>
              </div>
              <div className={`p-4 rounded-2xl ${isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'} border`}>
                <div className={`text-xs font-bold ${textMuted} mb-1 tracking-wider`}>A/L STREAM</div>
                <div className={`text-3xl font-bold ${textPrimary}`}>{stats.alSubjects}</div>
              </div>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
