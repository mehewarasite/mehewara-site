import { useState, useEffect, useCallback, useMemo } from 'react';
import { BarChart2, TrendingUp, Activity, Globe, HelpCircle, Database, HardDrive, RefreshCw, FileText, BookOpen } from 'lucide-react';
import { Subject, Paper, Question } from '../../types';

import type { AdminThemeClasses } from './types';

interface StorageTableInfo {
  name: string;
  label: string;
  rows: number;
  sizeBytes: number;
  color: string;
}

interface StatsTabProps {
  theme: AdminThemeClasses;
  subjects: Subject[];
  papers: Paper[];
  questions: Question[];
  activeUsersCount: number;
}

export default function StatsTab({ theme, subjects, papers, questions, activeUsersCount }: StatsTabProps) {
  const { isDark, cardBg, cardBdr, surfaceBg, surfaceBdr, textPrimary, textMuted, textFaint, dividerBdr } = theme;

  const [storageData, setStorageData] = useState<StorageTableInfo[]>([]);
  const [storageLoading, setStorageLoading] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [storageBucketSize, setStorageBucketSize] = useState<{ files: number; sizeBytes: number }>({ files: 0, sizeBytes: 0 });

  const [budgetStatus, setBudgetStatus] = useState<any>(null);

  const fetchStorageUsage = useCallback(async () => {
    setStorageLoading(true);
    setStorageError(null);
    try {
      const { dbLoadBudgetStatus } = await import('../../api');
      const status = await dbLoadBudgetStatus();
      setBudgetStatus(status);
      
      const results: StorageTableInfo[] = [
        { name: 'subjects', label: 'Subjects', rows: subjects.length, sizeBytes: new TextEncoder().encode(JSON.stringify(subjects)).length, color: '#3b82f6' },
        { name: 'papers', label: 'Papers', rows: papers.length, sizeBytes: new TextEncoder().encode(JSON.stringify(papers)).length, color: '#f59e0b' },
        { name: 'questions', label: 'Questions', rows: questions.length, sizeBytes: new TextEncoder().encode(JSON.stringify(questions)).length, color: '#10b981' }
      ];
      setStorageData(results);
      setStorageBucketSize({ files: 0, sizeBytes: 0 });
    } catch (err: any) {
      setStorageError(err?.message || 'Failed to fetch storage data');
    } finally {
      setStorageLoading(false);
    }
  }, [subjects, papers, questions]);

  const handleReleaseLimit = async () => {
    try {
      setStorageLoading(true);
      const { dbReleaseLimit } = await import('../../api');
      await dbReleaseLimit('Admin manual override', 24 * 60 * 60 * 1000); // 24 hours
      await fetchStorageUsage();
    } catch (err: any) {
      setStorageError(err?.message || 'Failed to release limits');
    } finally {
      setStorageLoading(false);
    }
  };

  useEffect(() => {
    if (storageData.length === 0) {
      fetchStorageUsage();
    }
  }, []);

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const stats = useMemo(() => {
    const olSubjects = subjects.filter(s => s.examType === 'ol').length;
    const alSubjects = subjects.filter(s => s.examType === 'al').length;
    const enPapers = papers.filter(p => p.language === 'en').length;
    const siPapers = papers.filter(p => !p.language || p.language === 'si').length;
    const avgQuestions = papers.length > 0 ? (questions.length / papers.length).toFixed(1) : '0';

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
      olSubjects, alSubjects, enPapers, siPapers, avgQuestions,
      topSubject: topSubject ? topSubject.name : 'N/A',
      topSubjectCount
    };
  }, [subjects, papers, questions]);

  return (
    <div className={`p-4 md:p-5 ${cardBg} border ${cardBdr} rounded-2xl ${isDark ? '' : 'shadow-md'} lg:h-[calc(100vh-12rem)] flex flex-col`}>
      {/* Compact Header */}
      <div className={`flex items-center justify-between border-b ${dividerBdr} pb-3 mb-4`}>
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-xl ${isDark ? 'bg-fuchsia-500/10' : 'bg-fuchsia-100'} border ${isDark ? 'border-fuchsia-500/20' : 'border-fuchsia-200'}`}>
            <BarChart2 className={`w-5 h-5 ${isDark ? 'text-fuchsia-400' : 'text-fuchsia-600'}`} />
          </div>
          <div>
            <h1 className={`text-xl font-extrabold ${textPrimary} font-display tracking-wide leading-tight`}>
              Stats
            </h1>
            <p className={`text-xs ${textMuted} font-mono`}>Global Content Metrics &amp; System Health</p>
          </div>
        </div>
      </div>

      {/* Two-column layout: Metrics | Storage */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 flex-1 min-h-0">

        {/* LEFT: Compact Metric Cards */}
        <div className="lg:col-span-3 grid grid-cols-2 md:grid-cols-3 gap-3 auto-rows-min lg:auto-rows-fr content-start">

          {/* Total Questions - Hero */}
          <div className={`col-span-2 md:col-span-2 ${surfaceBg} border ${surfaceBdr} rounded-2xl p-4 relative overflow-hidden flex flex-col justify-between`}>
            <div className="absolute top-0 right-0 p-4 opacity-10">
              <HelpCircle className="w-20 h-20 text-fuchsia-500" />
            </div>
            <div>
              <div className="flex items-center gap-1.5 text-fuchsia-500 font-bold text-xs mb-1">
                <Activity className="w-3.5 h-3.5" />
                TOTAL QUESTION BANK
              </div>
              <h2 className={`text-4xl md:text-5xl font-black ${textPrimary} font-display tracking-tighter`}>
                {questions.length.toLocaleString()}
              </h2>
            </div>
            <p className={`text-xs ${textMuted} mt-2 max-w-[85%] leading-snug`}>
              MCQs loaded across all papers.
            </p>
          </div>

          {/* Active Users */}
          <div className={`col-span-1 ${surfaceBg} border ${surfaceBdr} rounded-2xl p-4 flex flex-col justify-between relative overflow-hidden`}>
            <div className="absolute top-0 right-0 p-2 opacity-[0.08]">
              <Activity className="w-16 h-16 text-emerald-500" />
            </div>
            <div>
              <div className="flex items-center gap-1.5 text-emerald-500 font-bold text-xs mb-1 relative z-10">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
                ACTIVE USERS
              </div>
              <h2 className={`text-3xl md:text-4xl font-black ${textPrimary} font-display tracking-tighter relative z-10`}>
                {activeUsersCount}
              </h2>
            </div>
            <p className={`text-[10px] ${textMuted} mt-2 relative z-10`}>Real-time sessions</p>
          </div>

          {/* Avg Q / Paper */}
          <div className={`col-span-1 ${surfaceBg} border ${surfaceBdr} rounded-2xl p-4 flex flex-col justify-between`}>
            <div>
              <div className="flex items-center gap-1.5 text-indigo-500 font-bold text-xs mb-1">
                <TrendingUp className="w-3.5 h-3.5" />
                AVG Q / PAPER
              </div>
              <h2 className={`text-3xl md:text-4xl font-black ${textPrimary} font-display tracking-tighter`}>
                {stats.avgQuestions}
              </h2>
            </div>
            <p className={`text-[10px] ${textMuted} mt-2`}>Per active paper</p>
          </div>

          {/* Top Subject */}
          <div className={`col-span-1 ${surfaceBg} border ${surfaceBdr} rounded-2xl p-4 flex flex-col justify-between`}>
            <div>
              <div className="flex items-center gap-1.5 text-amber-500 font-bold text-xs mb-1">
                <Activity className="w-3.5 h-3.5" />
                TOP SUBJECT
              </div>
              <h2 className={`text-lg font-black ${textPrimary} font-display leading-tight truncate`} title={stats.topSubject}>
                {stats.topSubject}
              </h2>
              <p className={`text-base font-bold ${textMuted} font-mono`}>
                {stats.topSubjectCount} Papers
              </p>
            </div>
          </div>

          {/* Total Papers */}
          <div className={`col-span-1 ${surfaceBg} border ${surfaceBdr} rounded-2xl p-4`}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5 text-sky-500 font-bold text-xs">
                <FileText className="w-3.5 h-3.5" />
                PAPERS
              </div>
              <span className={`text-2xl font-black ${textPrimary} font-display`}>{papers.length}</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className={`p-2 rounded-xl ${isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'} border`}>
                <div className="flex items-center gap-1 text-[10px] font-bold text-emerald-500 mb-0.5">
                  <Globe className="w-3 h-3" /> SI
                </div>
                <div className={`text-xl font-bold ${textPrimary}`}>{stats.siPapers}</div>
              </div>
              <div className={`p-2 rounded-xl ${isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'} border`}>
                <div className="flex items-center gap-1 text-[10px] font-bold text-indigo-500 mb-0.5">
                  <Globe className="w-3 h-3" /> EN
                </div>
                <div className={`text-xl font-bold ${textPrimary}`}>{stats.enPapers}</div>
              </div>
            </div>
          </div>

          {/* Total Subjects */}
          <div className={`col-span-1 ${surfaceBg} border ${surfaceBdr} rounded-2xl p-4`}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5 text-emerald-500 font-bold text-xs">
                <BookOpen className="w-3.5 h-3.5" />
                SUBJECTS
              </div>
              <span className={`text-2xl font-black ${textPrimary} font-display`}>{subjects.length}</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className={`p-2 rounded-xl ${isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'} border`}>
                <div className={`text-[10px] font-bold ${textMuted} mb-0.5 tracking-wider`}>O/L</div>
                <div className={`text-xl font-bold ${textPrimary}`}>{stats.olSubjects}</div>
              </div>
              <div className={`p-2 rounded-xl ${isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'} border`}>
                <div className={`text-[10px] font-bold ${textMuted} mb-0.5 tracking-wider`}>A/L</div>
                <div className={`text-xl font-bold ${textPrimary}`}>{stats.alSubjects}</div>
              </div>
            </div>
          </div>

        </div>

        {/* RIGHT: Database Storage Usage & Limits */}
        {budgetStatus && (
          <div className={`lg:col-span-2 ${surfaceBg} border ${surfaceBdr} rounded-2xl p-4 flex flex-col mb-4`}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className={`p-1.5 rounded-lg ${isDark ? 'bg-fuchsia-500/10 border-fuchsia-500/20' : 'bg-fuchsia-50 border-fuchsia-200'} border`}>
                  <Activity className={`w-4 h-4 ${isDark ? 'text-fuchsia-400' : 'text-fuchsia-600'}`} />
                </div>
                <div>
                  <div className="text-fuchsia-500 font-bold text-xs">QUOTA LIMITS</div>
                  <p className={`text-[10px] ${textMuted}`}>API Budget & Usage</p>
                </div>
              </div>
              
              <button
                onClick={handleReleaseLimit}
                disabled={storageLoading || budgetStatus.emergencyUntil}
                className={`flex items-center gap-1 px-3 py-1 text-[10px] font-semibold rounded-lg transition-all ${
                  budgetStatus.emergencyUntil 
                    ? (isDark ? 'bg-emerald-500/20 text-emerald-400' : 'bg-emerald-100 text-emerald-700')
                    : (isDark ? 'bg-fuchsia-500/20 text-fuchsia-400 hover:bg-fuchsia-500/30' : 'bg-fuchsia-100 text-fuchsia-700 hover:bg-fuchsia-200')
                }`}
              >
                {budgetStatus.emergencyUntil ? 'Limits Released (24h)' : 'Release Limits'}
              </button>
            </div>
            
            <div className="space-y-3">
              {['admin', 'public'].map(pool => {
                const b2Bytes = budgetStatus.poolResourceAllocations[pool]?.b2Bytes;
                if (!b2Bytes) return null;
                const used = b2Bytes.reserved + b2Bytes.committed;
                const limit = b2Bytes.limit;
                const percent = Math.min(100, Math.max(0, (used / limit) * 100));
                
                return (
                  <div key={pool}>
                    <div className="flex justify-between text-[10px] font-bold mb-1">
                      <span className={textPrimary}>{pool.toUpperCase()} Pool (Files)</span>
                      <span className={textMuted}>{formatBytes(used)} / {formatBytes(limit)} ({percent.toFixed(1)}%)</span>
                    </div>
                    <div className={`w-full h-1.5 rounded-full overflow-hidden ${isDark ? 'bg-slate-900' : 'bg-slate-100'}`}>
                      <div 
                        className={`h-full rounded-full ${percent > 90 ? 'bg-red-500' : percent > 75 ? 'bg-amber-500' : 'bg-emerald-500'}`} 
                        style={{ width: `${Math.max(percent, 1)}%` }} 
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* DB STORAGE TABLE */}
        <div className={`lg:col-span-2 ${surfaceBg} border ${surfaceBdr} rounded-2xl p-4 relative overflow-hidden flex flex-col`}>
          <div className="flex items-center justify-between mb-3 gap-2">
            <div className="flex items-center gap-2">
              <div className={`p-1.5 rounded-lg ${isDark ? 'bg-cyan-500/10 border-cyan-500/20' : 'bg-cyan-50 border-cyan-200'} border`}>
                <Database className={`w-4 h-4 ${isDark ? 'text-cyan-400' : 'text-cyan-600'}`} />
              </div>
              <div>
                <div className="text-cyan-500 font-bold text-xs">DB STORAGE</div>
                <p className={`text-[10px] ${textMuted}`}>API tables &amp; bucket</p>
              </div>
            </div>
            <button
              onClick={fetchStorageUsage}
              disabled={storageLoading}
              className={`flex items-center gap-1 px-2 py-1 text-[10px] font-semibold rounded-lg transition-all cursor-pointer ${isDark
                ? 'bg-cyan-500/10 border-cyan-500/20 text-cyan-400 hover:bg-cyan-500/20'
                : 'bg-cyan-50 border-cyan-200 text-cyan-600 hover:bg-cyan-100'
                } border ${storageLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <RefreshCw className={`w-3 h-3 ${storageLoading ? 'animate-spin' : ''}`} />
              {storageLoading ? '...' : 'Refresh'}
            </button>
          </div>

          {storageError && (
            <div className="mb-2 px-3 py-2 rounded-lg text-[10px] font-semibold border bg-red-500/10 border-red-500/20 text-red-400">
              ✕ {storageError}
            </div>
          )}

          <div className="flex-1 min-h-0 overflow-y-auto">
            {storageLoading && storageData.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 gap-2">
                <RefreshCw className={`w-6 h-6 ${isDark ? 'text-cyan-400' : 'text-cyan-500'} animate-spin`} />
                <p className={`text-xs ${textMuted} font-medium`}>Calculating...</p>
              </div>
            ) : storageData.length > 0 ? (
              <div className="space-y-3">
                {/* Table Bars */}
                <div className="space-y-2">
                  {(() => {
                    const maxSize = Math.max(...storageData.map(t => t.sizeBytes), 1);
                    return storageData.map((table) => (
                      <div key={table.name} className="group">
                        <div className="flex items-center justify-between mb-0.5">
                          <div className="flex items-center gap-1.5">
                            <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: table.color }} />
                            <span className={`text-[11px] font-bold ${textPrimary}`}>{table.label}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`text-[10px] font-mono ${textMuted}`}>{table.rows}r</span>
                            <span className={`text-[11px] font-bold ${textPrimary}`}>{formatBytes(table.sizeBytes)}</span>
                          </div>
                        </div>
                        <div className={`w-full h-1.5 rounded-full overflow-hidden ${isDark ? 'bg-slate-900' : 'bg-slate-100'}`}>
                          <div
                            className="h-full rounded-full transition-all duration-700 ease-out"
                            style={{
                              width: `${Math.max((table.sizeBytes / maxSize) * 100, 1)}%`,
                              backgroundColor: table.color,
                              opacity: 0.75
                            }}
                          />
                        </div>
                      </div>
                    ));
                  })()}
                </div>

                {/* Divider */}
                <div className={`border-t ${dividerBdr}`} />

                {/* Summary Cards */}
                <div className="grid grid-cols-3 gap-2">
                  <div className={`p-2.5 rounded-xl ${isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'} border`}>
                    <div className="flex items-center gap-1 mb-1">
                      <Database className={`w-3 h-3 ${isDark ? 'text-cyan-400' : 'text-cyan-600'}`} />
                      <span className={`text-[9px] font-bold ${textMuted} tracking-wider`}>DB</span>
                    </div>
                    <div className={`text-base font-black ${textPrimary} font-display`}>
                      {formatBytes(storageData.reduce((sum, t) => sum + t.sizeBytes, 0))}
                    </div>
                    <p className={`text-[9px] ${textFaint} font-mono`}>
                      {storageData.reduce((sum, t) => sum + t.rows, 0)} rows
                    </p>
                  </div>

                  <div className={`p-2.5 rounded-xl ${isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'} border`}>
                    <div className="flex items-center gap-1 mb-1">
                      <HardDrive className={`w-3 h-3 ${isDark ? 'text-violet-400' : 'text-violet-600'}`} />
                      <span className={`text-[9px] font-bold ${textMuted} tracking-wider`}>IMG</span>
                    </div>
                    <div className={`text-base font-black ${textPrimary} font-display`}>
                      {formatBytes(storageBucketSize.sizeBytes)}
                    </div>
                    <p className={`text-[9px] ${textFaint} font-mono`}>
                      {storageBucketSize.files} files
                    </p>
                  </div>

                  <div className={`p-2.5 rounded-xl border-2 ${isDark ? 'bg-cyan-500/5 border-cyan-500/20' : 'bg-cyan-50 border-cyan-200'}`}>
                    <div className="flex items-center gap-1 mb-1">
                      <BarChart2 className={`w-3 h-3 ${isDark ? 'text-cyan-400' : 'text-cyan-600'}`} />
                      <span className={`text-[9px] font-bold ${isDark ? 'text-cyan-400' : 'text-cyan-700'} tracking-wider`}>ALL</span>
                    </div>
                    <div className={`text-base font-black ${isDark ? 'text-cyan-300' : 'text-cyan-700'} font-display`}>
                      {formatBytes(storageData.reduce((sum, t) => sum + t.sizeBytes, 0) + storageBucketSize.sizeBytes)}
                    </div>
                    <p className={`text-[9px] ${isDark ? 'text-cyan-500/60' : 'text-cyan-600/60'} font-mono`}>
                      Combined
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className={`text-center py-6 ${textMuted} text-xs`}>
                <Database className={`w-8 h-8 mx-auto mb-2 ${textFaint}`} />
                <p>Click <strong>Refresh</strong> to load metrics</p>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
