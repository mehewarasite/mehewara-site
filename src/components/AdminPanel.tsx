// for future developers of this site. i set a password here. use super-admin login to change it. if want to change all the password log in to the cloudflare and under the mehewara-site page setting you will find secret tab change your pws there and redeloy the page.
//use antigravity. its far better if you do not know what you're doing.
// all the password details in the google drive.
//use this wisely do not waste your time here. logging off for the good. I'm 24. To the infinity and beyond 👾

import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  Lock,
  Unlock,
  Check,
  BookOpen,
  FileText,
  RefreshCw,
  Upload,
  Database,
  HardDrive,
  LayoutGrid,
  Images,
  Activity,
  Globe,
  HelpCircle,
  X,
  Plus,
  Trash2
} from 'lucide-react';

import { Subject, Paper, Question } from '../types';
import { useTheme } from '../ThemeContext';

// --- Import new sub-components ---
import GalleryTab from './admin/GalleryTab';
import StatsTab from './admin/StatsTab';
import AboutTab from './admin/AboutTab';
import SubjectsTab from './admin/SubjectsTab';
import PapersTab from './admin/PapersTab';
import AddQuestionTab from './admin/AddQuestionTab';
import EditQuestionsTab from './admin/EditQuestionsTab';
import ManageQuestionsTab from './admin/ManageQuestionsTab';
import type { AdminThemeClasses, AdminTab } from './admin/types';

// ───────────────────────────────────────────────────────────────────────────

interface AdminPanelProps {
  subjects: Subject[];
  onAddSubject?: (subject: Subject) => void;
  onUpdateSubject?: (subject: Subject) => void;
  onDeleteSubject?: (subjectId: string) => void;
  papers: Paper[];
  questions: Question[];
  onAddPaper: (paper: Paper, importQuestions?: Question[]) => void;
  onDeletePaper: (paperId: string) => void;
  onAddQuestion: (question: Question) => void;
  onUpdateQuestion: (question: Question) => void;
  onUpdatePaper?: (paper: Paper) => void;
  onDeleteQuestion: (questionId: string) => void;
  onUpdateStudyHtml: (paperId: string, html: string) => void;
  onResetToDefaults: () => void;
  onExportData: () => void;
  onImportData: (file: File) => void;
  onSync?: () => void;
  isSyncing?: boolean;
  onAboutUpdate?: (data: any) => void;
  onClose: () => void;
  activeUsersCount?: number;
}

export default function AdminPanel({
  subjects,
  onAddSubject,
  onUpdateSubject,
  onDeleteSubject,
  papers,
  questions,
  onAddPaper,
  onDeletePaper,
  onAddQuestion,
  onUpdateQuestion,
  onUpdatePaper,
  onDeleteQuestion,
  onUpdateStudyHtml,
  onExportData,
  onImportData,
  onSync,
  isSyncing,
  onAboutUpdate,
  onClose,
  activeUsersCount = 1
}: AdminPanelProps) {
  const { theme: currentTheme } = useTheme();
  const isDark = currentTheme === 'dark';
  const importInputRef = React.useRef<HTMLInputElement>(null);

  // ── Theme shortcut classes ──
  const adminTheme: AdminThemeClasses = {
    isDark,
    pageBg: isDark ? 'bg-[#030304]' : 'bg-[#f0f4f8]',
    cardBg: isDark ? 'bg-slate-950/80' : 'bg-white',
    cardBdr: isDark ? 'border-slate-900' : 'border-slate-200',
    surfaceBg: isDark ? 'bg-slate-950' : 'bg-white',
    surfaceBdr: isDark ? 'border-slate-800' : 'border-slate-200',
    inputBg: isDark ? 'bg-slate-900' : 'bg-white',
    inputBdr: isDark ? 'border-slate-800' : 'border-slate-300',
    textPrimary: isDark ? 'text-white' : 'text-slate-900',
    textMuted: isDark ? 'text-slate-400' : 'text-slate-500',
    textFaint: isDark ? 'text-slate-500' : 'text-slate-400',
    dividerBdr: isDark ? 'border-slate-800' : 'border-slate-200',
    subtleBg: isDark ? 'bg-slate-900' : 'bg-slate-50',
    subtleBdr: isDark ? 'border-slate-800' : 'border-slate-200',
  };

  const { pageBg, cardBg, cardBdr, inputBg, inputBdr, textPrimary, textMuted } = adminTheme;

  // Login state
  const [authLevel, setAuthLevel] = useState<'admin' | 'superadmin' | null>(null);
  const [passcode, setPasscode] = useState('');
  
  const [activeTab, setActiveTab] = useState<AdminTab>('subjects');

  // We still lift QNumber and targetPaperId slightly out of AddQuestionTab
  // so that PapersTab can set them when the user clicks "+ MCQ" on an existing paper.
  const [targetPaperId, setTargetPaperId] = useState<string>('');
  const [qNumber, setQNumber] = useState<number>(1);

  const [flashMessage, setFlashMessage] = useState('');
  const [flashIsError, setFlashIsError] = useState(false);

  const showFlash = (message: string, isError = false) => {
    setFlashMessage(message);
    setFlashIsError(isError);
    setTimeout(() => setFlashMessage(''), 3000);
  };

  // Auth Effect
  useEffect(() => {
    const checkAuth = async () => {
      const storedHash = localStorage.getItem('mhw_admin_hash');
      if (!storedHash) return;

      const superAdminHash = import.meta.env.VITE_SUPERADMIN_HASH;
      const defaultAdminHash = import.meta.env.VITE_DEFAULT_ADMIN_HASH;
      if (storedHash === superAdminHash) {
        setAuthLevel('superadmin');
      } else if (storedHash === defaultAdminHash) {
        setAuthLevel('admin');
      }
    };
    checkAuth();
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const encoder = new TextEncoder();
    const data = encoder.encode(passcode);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    const superAdminHash = import.meta.env.VITE_SUPERADMIN_HASH;
    const defaultAdminHash = import.meta.env.VITE_DEFAULT_ADMIN_HASH;
    if (hashHex === superAdminHash) {
      localStorage.setItem('mhw_admin_hash', hashHex);
      setAuthLevel('superadmin');
    } else if (hashHex === defaultAdminHash) {
      localStorage.setItem('mhw_admin_hash', hashHex);
      setAuthLevel('admin');
    } else {
      alert('Access Denied');
      setPasscode('');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('mhw_admin_hash');
    setAuthLevel(null);
    setPasscode('');
  };

  const [newAdminPassword, setNewAdminPassword] = useState('');
  const [generatedHash, setGeneratedHash] = useState('');

  const handleGenerateHash = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAdminPassword) return;
    const encoder = new TextEncoder();
    const data = encoder.encode(newAdminPassword);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    setGeneratedHash(hashHex);
  };

  if (!authLevel) {
    return (
      <div className={`fixed inset-0 z-50 flex items-center justify-center ${isDark ? 'bg-black/90' : 'bg-slate-100/90'} backdrop-blur-xl transition-colors`}>
        <div className={`w-full max-w-sm ${cardBg} border ${cardBdr} p-8 rounded-2xl shadow-2xl relative overflow-hidden`}>
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-500 via-sky-500 to-indigo-500" />
          <div className="flex flex-col items-center mb-6">
            <div className={`w-14 h-14 ${isDark ? 'bg-slate-900' : 'bg-slate-100'} rounded-full flex items-center justify-center mb-4`}>
              <Lock className={`w-6 h-6 ${isDark ? 'text-slate-400' : 'text-slate-500'}`} />
            </div>
            <h2 className={`text-xl font-bold ${textPrimary} tracking-tight`}>Admin Access</h2>
            <p className={`text-xs ${textMuted} mt-1 text-center`}>Enter passcode to manage contents</p>
          </div>
          <form onSubmit={handleLogin} className="space-y-4">
            <input
              type="password"
              placeholder="Enter Passcode"
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              className={`w-full px-4 py-3 rounded-xl border ${isDark ? 'bg-slate-900 border-slate-800 text-white focus:border-sky-500' : 'bg-slate-50 border-slate-300 text-slate-900 focus:border-sky-500'} focus:outline-none transition-colors font-mono tracking-widest text-center text-lg`}
              autoFocus
            />
            <button
              type="submit"
              className="w-full bg-slate-900 dark:bg-white dark:text-slate-900 text-white font-bold py-3 rounded-xl transition-all hover:scale-[1.02] active:scale-95 shadow-lg flex items-center justify-center gap-2"
            >
              <Unlock className="w-4 h-4" />
              Unlock Panel
            </button>
          </form>
          <button onClick={onClose} className={`mt-6 w-full text-xs font-semibold ${textMuted} hover:${textPrimary} transition-colors`}>
            &larr; Return to Application
          </button>
        </div>
      </div>
    );
  }

  // SUPER ADMIN VIEW
  if (authLevel === 'superadmin') {
    return (
      <div className={`fixed inset-0 z-50 flex items-center justify-center ${isDark ? 'bg-slate-950' : 'bg-slate-50'} p-4`}>
        <div className={`w-full max-w-xl ${cardBg} border ${cardBdr} p-8 rounded-2xl shadow-xl relative`}>
          <div className="flex items-center gap-4 mb-6 pb-6 border-b border-dashed border-slate-700">
            <div className="w-12 h-12 bg-red-500/10 rounded-full flex items-center justify-center">
              <Lock className="w-6 h-6 text-red-500" />
            </div>
            <div>
              <h1 className={`text-2xl font-black ${textPrimary}`}>Super Admin Panel</h1>
              <p className={`text-sm ${textMuted}`}>Manage administrative credentials</p>
            </div>
            <button
              onClick={handleLogout}
              className={`ml-auto px-4 py-2 bg-slate-800 text-white hover:bg-slate-700 rounded-lg text-sm font-bold transition-colors`}
            >
              Logout
            </button>
          </div>

          <div className="space-y-6">
            <div>
              <h2 className={`text-lg font-bold ${textPrimary} mb-2`}>Change Admin Password</h2>
              <p className={`text-sm ${textMuted} mb-4`}>
                Generate a new SHA-256 hash for the default admin password. You will need to copy the generated hash and place it into your <code className="text-sky-400">.env</code> file or Cloudflare environment variables as <code className="text-sky-400">VITE_DEFAULT_ADMIN_HASH</code>.
              </p>
            </div>

            <form onSubmit={handleGenerateHash} className="space-y-4">
              <div>
                <label className={`block text-xs font-bold ${textMuted} mb-1 uppercase tracking-wider`}>New Password</label>
                <input
                  type="text"
                  placeholder="Enter new admin password"
                  value={newAdminPassword}
                  onChange={(e) => setNewAdminPassword(e.target.value)}
                  className={`w-full px-4 py-3 rounded-xl border ${inputBg} ${inputBdr} ${textPrimary} focus:border-sky-500 focus:outline-none transition-colors`}
                />
              </div>
              <button
                type="submit"
                className="w-full py-3 bg-red-600 hover:bg-red-500 text-white rounded-xl font-bold transition-colors"
              >
                Generate Hash
              </button>
            </form>

            {generatedHash && (
              <div className="mt-6 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                <h3 className="text-emerald-500 font-bold text-sm mb-2">Hash Generated Successfully!</h3>
                <p className={`text-xs ${textMuted} mb-3`}>Copy this exact hash and update your environment configuration:</p>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={generatedHash}
                    className={`flex-1 px-3 py-2 bg-black/20 text-emerald-400 font-mono text-xs rounded-lg border border-emerald-500/30 outline-none`}
                  />
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(generatedHash);
                      alert('Hash copied to clipboard!');
                    }}
                    className="px-3 py-2 bg-emerald-500 hover:bg-emerald-400 text-white rounded-lg text-xs font-bold transition-colors"
                  >
                    Copy
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Calculate some stats for the top bar
  const olSubjects = subjects.filter(s => s.examType === 'ol').length;
  const alSubjects = subjects.filter(s => s.examType === 'al').length;

  return (
    <div className={`fixed inset-0 z-50 flex flex-col ${pageBg} transition-colors overflow-hidden`}>
      {/* HEADER */}
      <header className={`${cardBg} border-b ${cardBdr} px-6 py-4 flex items-center justify-between shrink-0 shadow-sm z-10`}>
        <div className="flex items-center gap-4">
          <button
            onClick={onClose}
            className={`p-2 rounded-xl ${isDark ? 'hover:bg-slate-900' : 'hover:bg-slate-100'} transition-colors flex items-center gap-2 ${textPrimary} font-bold`}
          >
            <ArrowLeft className="w-5 h-5" />
            <span className="hidden sm:inline">Back</span>
          </button>
          <div className={`h-6 w-px ${isDark ? 'bg-slate-800' : 'bg-slate-300'}`} />
          <h1 className={`text-xl font-black ${textPrimary} tracking-tight flex items-center gap-2`}>
            Control Panel <span className="text-emerald-500 text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-500/10">v2.0</span>
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden md:flex items-center gap-4 mr-4 text-xs font-semibold">
             <div className="flex items-center gap-1.5 text-emerald-500 bg-emerald-500/10 px-3 py-1.5 rounded-lg">
                <Globe className="w-3.5 h-3.5" />
                Live: {activeUsersCount} {activeUsersCount === 1 ? 'user' : 'users'}
             </div>
             <div className={`flex items-center gap-3 px-3 py-1.5 rounded-lg ${isDark ? 'bg-slate-900 text-slate-300' : 'bg-slate-100 text-slate-600'}`}>
                <span className="flex items-center gap-1"><BookOpen className="w-3.5 h-3.5"/> {olSubjects} O/L</span>
                <span className="flex items-center gap-1"><BookOpen className="w-3.5 h-3.5"/> {alSubjects} A/L</span>
                <span className="flex items-center gap-1"><FileText className="w-3.5 h-3.5"/> {papers.length}</span>
                <span className="flex items-center gap-1"><Database className="w-3.5 h-3.5"/> {questions.length} Qs</span>
             </div>
          </div>
          
          {onSync && (
            <button
              onClick={onSync}
              disabled={isSyncing}
              className={`flex items-center gap-2 px-4 py-2 ${isDark ? 'bg-slate-900 hover:bg-slate-800 text-slate-300' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'} rounded-xl font-bold text-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">{isSyncing ? 'Syncing...' : 'Sync Data'}</span>
            </button>
          )}

          <input 
            type="file" 
            ref={importInputRef} 
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                if(window.confirm('Importing data will MERGE with existing data. Backup recommended first. Proceed?')) {
                  onImportData(file);
                }
              }
              if(importInputRef.current) importInputRef.current.value = '';
            }} 
            className="hidden" 
            accept=".json"
          />
          <button
            onClick={() => importInputRef.current?.click()}
            className={`flex items-center gap-2 px-3 py-2 ${isDark ? 'bg-slate-900 hover:bg-slate-800 text-indigo-400' : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-600'} rounded-xl font-bold text-xs transition-colors border border-transparent hover:border-indigo-500/30`}
            title="Import Full Backup"
          >
            <Upload className="w-4 h-4" />
          </button>
          <button
            onClick={() => {
              if (window.confirm('Exporting all data to JSON...')) {
                onExportData();
              }
            }}
            className={`flex items-center gap-2 px-3 py-2 ${isDark ? 'bg-slate-900 hover:bg-slate-800 text-sky-400' : 'bg-sky-50 hover:bg-sky-100 text-sky-600'} rounded-xl font-bold text-xs transition-colors border border-transparent hover:border-sky-500/30`}
            title="Export Full Backup"
          >
            <HardDrive className="w-4 h-4" />
          </button>

          <div className={`h-6 w-px ${isDark ? 'bg-slate-800' : 'bg-slate-300'} mx-1`} />
          <button
            onClick={handleLogout}
            className={`px-4 py-2 ${isDark ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20' : 'bg-red-50 text-red-600 hover:bg-red-100'} rounded-xl font-bold text-xs transition-colors`}
          >
            Logout
          </button>
        </div>
      </header>

      {/* FLASH MESSAGE */}
      {flashMessage && (
        <div className={`absolute top-20 right-6 z-50 px-4 py-3 rounded-xl shadow-lg border flex items-center gap-3 animate-slide-in ${
          flashIsError 
            ? 'bg-red-500/10 border-red-500/20 text-red-500 backdrop-blur-md' 
            : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500 backdrop-blur-md'
        }`}>
          {flashIsError ? <X className="w-5 h-5" /> : <Check className="w-5 h-5" />}
          <span className="font-bold text-sm">{flashMessage}</span>
        </div>
      )}

      {/* MAIN CONTENT AREA */}
      <div className="flex-1 overflow-hidden flex flex-col md:flex-row relative z-0">
        
        {/* SIDEBAR NAVIGATION */}
        <nav className={`w-full md:w-64 lg:w-72 shrink-0 ${cardBg} border-r ${cardBdr} flex flex-col overflow-y-auto custom-scrollbar shadow-[4px_0_24px_rgba(0,0,0,0.02)] z-10`}>
          <div className="p-4 space-y-1">
            <div className={`text-[10px] font-bold ${textMuted} uppercase tracking-wider mb-3 px-3 mt-2`}>Content Management</div>
            <NavButton 
              active={activeTab === 'subjects'} 
              onClick={() => setActiveTab('subjects')} 
              icon={BookOpen} 
              label="Subjects" 
              count={subjects.length}
              theme={adminTheme}
            />
            <NavButton 
              active={activeTab === 'papers'} 
              onClick={() => setActiveTab('papers')} 
              icon={FileText} 
              label="Papers" 
              count={papers.length}
              theme={adminTheme}
            />
            
            <div className={`text-[10px] font-bold ${textMuted} uppercase tracking-wider mb-3 px-3 mt-6`}>Question Bank</div>
            <NavButton 
              active={activeTab === 'add-question'} 
              onClick={() => setActiveTab('add-question')} 
              icon={Plus} 
              label="Add New Questions" 
              theme={adminTheme}
            />
            <NavButton 
              active={activeTab === 'edit-questions'} 
              onClick={() => setActiveTab('edit-questions')} 
              icon={LayoutGrid} 
              label="Edit Existing" 
              count={questions.length}
              theme={adminTheme}
            />
            <NavButton 
              active={activeTab === 'manage-questions'} 
              onClick={() => setActiveTab('manage-questions')} 
              icon={Trash2} 
              label="Delete Questions" 
              theme={adminTheme}
            />

            <div className={`text-[10px] font-bold ${textMuted} uppercase tracking-wider mb-3 px-3 mt-6`}>Site Content</div>
            <NavButton 
              active={activeTab === 'gallery'} 
              onClick={() => setActiveTab('gallery')} 
              icon={Images} 
              label="Gallery" 
              theme={adminTheme}
            />
            <NavButton 
              active={activeTab === 'about'} 
              onClick={() => setActiveTab('about')} 
              icon={HelpCircle} 
              label="About Us & Privacy" 
              theme={adminTheme}
            />

            <div className={`text-[10px] font-bold ${textMuted} uppercase tracking-wider mb-3 px-3 mt-6`}>System</div>
            <NavButton 
              active={activeTab === 'stats'} 
              onClick={() => setActiveTab('stats')} 
              icon={Activity} 
              label="Database Storage" 
              theme={adminTheme}
            />
          </div>
        </nav>

        {/* TAB CONTENTS */}
        <div className={`flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 custom-scrollbar ${pageBg}`}>
          <div className="max-w-[1600px] mx-auto w-full h-full min-h-full">
            
            {activeTab === 'subjects' && (
              <SubjectsTab 
                theme={adminTheme}
                subjects={subjects}
                onAddSubject={onAddSubject}
                onUpdateSubject={onUpdateSubject}
                onDeleteSubject={onDeleteSubject}
                showFlash={showFlash}
              />
            )}

            {activeTab === 'papers' && (
              <PapersTab
                theme={adminTheme}
                subjects={subjects}
                papers={papers}
                questions={questions}
                onAddPaper={onAddPaper}
                onUpdatePaper={onUpdatePaper!}
                onDeletePaper={onDeletePaper}
                onUpdateStudyHtml={onUpdateStudyHtml}
                setActiveTab={setActiveTab}
                setTargetPaperId={setTargetPaperId}
                setQNumber={setQNumber}
                showFlash={showFlash}
              />
            )}

            {activeTab === 'add-question' && (
              <AddQuestionTab
                theme={adminTheme}
                subjects={subjects}
                papers={papers}
                questions={questions}
                onAddQuestion={onAddQuestion}
                setActiveTab={setActiveTab}
                showFlash={showFlash}
                targetPaperId={targetPaperId}
                setTargetPaperId={setTargetPaperId}
                qNumber={qNumber}
                setQNumber={setQNumber}
              />
            )}

            {activeTab === 'edit-questions' && (
              <EditQuestionsTab
                theme={adminTheme}
                subjects={subjects}
                papers={papers}
                questions={questions}
                onUpdateQuestion={onUpdateQuestion}
                showFlash={showFlash}
              />
            )}

            {activeTab === 'manage-questions' && (
              <ManageQuestionsTab
                theme={adminTheme}
                subjects={subjects}
                papers={papers}
                questions={questions}
                onDeleteQuestion={onDeleteQuestion}
                showFlash={showFlash}
              />
            )}

            {activeTab === 'gallery' && (
              <GalleryTab 
                theme={adminTheme}
                showFlash={showFlash}
              />
            )}

            {activeTab === 'stats' && (
              <StatsTab 
                theme={adminTheme}
                subjects={subjects}
                papers={papers}
                questions={questions}
                activeUsersCount={activeUsersCount}
              />
            )}

            {activeTab === 'about' && (
              <AboutTab 
                theme={adminTheme}
                onAboutUpdate={onAboutUpdate}
                showFlash={showFlash}
              />
            )}

          </div>
        </div>

      </div>
    </div>
  );
}

// ── NavButton Subcomponent ──
function NavButton({ 
  active, 
  onClick, 
  icon: Icon, 
  label, 
  count,
  theme
}: { 
  active: boolean; 
  onClick: () => void; 
  icon: any; 
  label: string; 
  count?: number;
  theme: AdminThemeClasses;
}) {
  const { isDark, textPrimary, textMuted } = theme;
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all duration-200 group ${
        active 
          ? 'bg-gradient-to-r from-sky-500/10 to-indigo-500/10 text-sky-500 font-bold' 
          : `${isDark ? 'hover:bg-slate-900' : 'hover:bg-slate-100'} ${textMuted} hover:${textPrimary} font-semibold`
      }`}
    >
      <div className="flex items-center gap-3">
        <Icon className={`w-5 h-5 ${active ? 'text-sky-500' : 'opacity-70 group-hover:opacity-100'}`} />
        <span className="text-sm">{label}</span>
      </div>
      {count !== undefined && (
        <span className={`text-[10px] font-mono px-2 py-0.5 rounded-md ${
          active 
            ? 'bg-sky-500/20 text-sky-500' 
            : `${isDark ? 'bg-slate-800' : 'bg-slate-200'}`
        }`}>
          {count}
        </span>
      )}
    </button>
  );
}
