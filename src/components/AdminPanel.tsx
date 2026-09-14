// for future developers of this site. i set a password here. use super-admin login to change it. if want to change all the password log in to the cloudflare and under the mehewara-site page setting you will find secret tab change your pws there and redeloy the page.
//use antigravity. its far better if you do not know what you're doing.
// all the password details in the google drive.
//use this wisely do not waste your time here. logging off for the good. I'm 24. To the infinity and beyond 👾

import React, { useState} from 'react';
import {
  ArrowLeft,


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
  Trash2,
  Users,
  KeyRound,
  Loader2,
  Mail,
  CheckCircle2,
  Lock,
  Eye,
  EyeOff,
  History
} from 'lucide-react';

import { Subject, Paper, Question } from '../types';
import { useTheme } from '../ThemeContext';
import { dbAdminGetMe, dbAdminChangePassword, dbAdminForgotPasswordRequest } from '../api';

// --- Import new sub-components ---
import GalleryTab from './admin/GalleryTab';
import StatsTab from './admin/StatsTab';
import AboutTab from './admin/AboutTab';
import SubjectsTab from './admin/SubjectsTab';
import PapersTab from './admin/PapersTab';
import AddQuestionTab from './admin/AddQuestionTab';
import EditQuestionsTab from './admin/EditQuestionsTab';
import ManageQuestionsTab from './admin/ManageQuestionsTab';
import AccountsTab from './admin/AccountsTab';
import AuditTab from './admin/AuditTab';
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
  onEnsureQuestionsLoaded?: (paperId: string, force?: boolean) => Promise<void>;
  loadingPaperQuestionsId?: string | null;
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
  onEnsureQuestionsLoaded,
  loadingPaperQuestionsId,
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

  const { pageBg, cardBg, cardBdr, textPrimary, textMuted } = adminTheme;

  const handleLogout = () => {
    localStorage.removeItem('adminToken');
    localStorage.removeItem('adminUser');
    window.location.reload();
  };

  // ── Current User Profile ──
  const [currentUser, setCurrentUser] = useState<{ id: string; username: string; name?: string; email: string; role: string } | null>(() => {
    try {
      const stored = localStorage.getItem('adminUser');
      return stored ? JSON.parse(stored) : null;
    } catch { return null; }
  });

  React.useEffect(() => {
    dbAdminGetMe().then(res => {
      if (res?.user) {
        setCurrentUser(res.user);
        localStorage.setItem('adminUser', JSON.stringify(res.user));
      }
    }).catch(() => {});
  }, []);

  // ── Change Password Modal ──
  const [showChangePwModal, setShowChangePwModal] = useState(false);
  const [oldPw, setOldPw] = useState('');
  const [showOldPw, setShowOldPw] = useState(false);
  const [changePwOtp, setChangePwOtp] = useState('');
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [otpNotice, setOtpNotice] = useState<string | null>(null);
  const [newPw, setNewPw] = useState('');
  const [showNewPw, setShowNewPw] = useState(false);
  const [confirmNewPw, setConfirmNewPw] = useState('');
  const [showConfirmNewPw, setShowConfirmNewPw] = useState(false);
  const [isChangingPw, setIsChangingPw] = useState(false);
  const [changePwError, setChangePwError] = useState<string | null>(null);
  const [changePwSuccess, setChangePwSuccess] = useState<string | null>(null);

  const handleClosePwModal = () => {
    setShowChangePwModal(false);
    setOldPw('');
    setChangePwOtp('');
    setNewPw('');
    setConfirmNewPw('');
    setShowOldPw(false);
    setShowNewPw(false);
    setShowConfirmNewPw(false);
    setOtpSent(false);
    setOtpNotice(null);
    setChangePwError(null);
    setChangePwSuccess(null);
  };

  const handleSendChangePwOtp = async () => {
    const targetEmail = currentUser?.email || 'induwaradahamjith2004@gmail.com';
    setIsSendingOtp(true);
    setChangePwError(null);
    setChangePwSuccess(null);
    try {
      const res = await dbAdminForgotPasswordRequest(targetEmail);
      setOtpSent(true);
      setChangePwSuccess(res.message || 'Verification code sent to your email!');
      if (res.devOtp) {
        setOtpNotice(`[Verification Code: ${res.devOtp}]`);
      }
    } catch (err: any) {
      const msg = err.response?.data?.error?.message || err.response?.data?.message || err.message;
      setChangePwError(msg || 'Failed to send verification code.');
    } finally {
      setIsSendingOtp(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setChangePwError(null);
    setChangePwSuccess(null);

    if (!oldPw) {
      setChangePwError('Please enter your old password.');
      return;
    }
    if (!changePwOtp.trim() || changePwOtp.trim().length !== 6) {
      setChangePwError('Please enter the 6-digit verification code.');
      return;
    }
    if (newPw.length < 6) {
      setChangePwError('New password must be at least 6 characters.');
      return;
    }
    if (newPw !== confirmNewPw) {
      setChangePwError('New passwords do not match.');
      return;
    }

    setIsChangingPw(true);

    try {
      await dbAdminChangePassword(oldPw, changePwOtp.trim(), newPw);

      showFlash('Password changed successfully!');
      setChangePwSuccess('Password changed successfully!');
      setTimeout(() => {
        handleClosePwModal();
      }, 1500);
    } catch (err: any) {
      const msg = err.response?.data?.error?.message || err.response?.data?.message || err.message;
      setChangePwError(msg || 'Failed to change password.');
    } finally {
      setIsChangingPw(false);
    }
  };

  const [activeTab, setActiveTab] = useState<AdminTab>('subjects');

  React.useEffect(() => {
    if (activeTab === 'accounts' && currentUser && currentUser.role !== 'super-admin') {
      setActiveTab('papers');
    }
  }, [activeTab, currentUser]);

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

  // Calculate some stats for the top bar
  const olSubjects = subjects.filter(s => s.examType === 'ol').length;
  const alSubjects = subjects.filter(s => s.examType === 'al').length;

  return (
    <div className={`fixed inset-0 w-full h-full min-h-screen z-50 flex flex-col ${pageBg} transition-colors overflow-hidden`}>
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
              <span className="flex items-center gap-1"><BookOpen className="w-3.5 h-3.5" /> {olSubjects} O/L</span>
              <span className="flex items-center gap-1"><BookOpen className="w-3.5 h-3.5" /> {alSubjects} A/L</span>
              <span className="flex items-center gap-1"><FileText className="w-3.5 h-3.5" /> {papers.length}</span>
              <span className="flex items-center gap-1"><Database className="w-3.5 h-3.5" /> {questions.length} Qs</span>
            </div>
          </div>

          {onSync && (
            <button
              onClick={async () => {
                onSync();
                if (targetPaperId && onEnsureQuestionsLoaded) {
                  await onEnsureQuestionsLoaded(targetPaperId, true);
                }
              }}
              disabled={isSyncing}
              className={`flex items-center gap-2 px-4 py-2 ${isDark ? 'bg-slate-900 hover:bg-slate-800 text-slate-300' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'} rounded-xl font-bold text-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer`}
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
                if (window.confirm('Importing data will MERGE with existing data. Backup recommended first. Proceed?')) {
                  onImportData(file);
                }
              }
              if (importInputRef.current) importInputRef.current.value = '';
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

          {/* User Profile Pill */}
          {currentUser && (
            <div className={`hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl border ${cardBdr} ${isDark ? 'bg-slate-900/60' : 'bg-slate-100/80'}`}>
              <div className={`w-5 h-5 rounded-full flex items-center justify-center font-bold text-[9px] uppercase ${
                currentUser.role === 'super-admin'
                  ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                  : 'bg-sky-500/20 text-sky-400 border border-sky-500/30'
              }`}>
                {(currentUser.name || currentUser.username).slice(0, 2)}
              </div>
              <span className={`text-xs font-bold ${textPrimary}`}>{currentUser.name || currentUser.username}</span>
              <span className={`text-[10px] font-semibold px-1.5 py-0.2 rounded-full ${
                currentUser.role === 'super-admin' ? 'bg-purple-500/20 text-purple-400' : 'bg-sky-500/20 text-sky-400'
              }`}>
                {currentUser.role === 'super-admin' ? 'Super Admin' : 'Admin'}
              </span>
            </div>
          )}

          {/* Change Password Button */}
          <button
            onClick={() => {
              setChangePwError(null);
              setShowChangePwModal(true);
            }}
            className={`flex items-center gap-1.5 px-3 py-2 ${isDark ? 'bg-slate-900 hover:bg-slate-800 text-slate-300' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'} rounded-xl font-bold text-xs transition-colors border border-transparent cursor-pointer`}
            title="Change Password"
          >
            <KeyRound className="w-3.5 h-3.5 text-sky-500" />
            <span className="hidden md:inline">Password</span>
          </button>

          <button
            onClick={handleLogout}
            className={`px-4 py-2 ${isDark ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20' : 'bg-red-50 text-red-600 hover:bg-red-100'} rounded-xl font-bold text-xs transition-colors cursor-pointer`}
          >
            Logout
          </button>
        </div>
      </header>

      {/* FLASH MESSAGE */}
      {flashMessage && (
        <div className={`absolute top-20 right-6 z-50 px-4 py-3 rounded-xl shadow-lg border flex items-center gap-3 animate-slide-in ${flashIsError
            ? 'bg-red-500/10 border-red-500/20 text-red-500 backdrop-blur-md'
            : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500 backdrop-blur-md'
          }`}>
          {flashIsError ? <X className="w-5 h-5" /> : <Check className="w-5 h-5" />}
          <span className="font-bold text-sm">{flashMessage}</span>
        </div>
      )}

      {/* MAIN CONTENT AREA */}
      <div className="flex-1 w-full min-h-0 h-full overflow-hidden flex flex-col md:flex-row relative z-0">

        {/* SIDEBAR NAVIGATION */}
        <nav className={`w-full md:w-64 lg:w-72 shrink-0 h-full ${cardBg} border-r ${cardBdr} flex flex-col overflow-y-auto custom-scrollbar shadow-[4px_0_24px_rgba(0,0,0,0.02)] z-10`}>
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
            {currentUser?.role === 'super-admin' && (
              <NavButton
                active={activeTab === 'accounts'}
                onClick={() => setActiveTab('accounts')}
                icon={Users}
                label="Admin Accounts"
                theme={adminTheme}
              />
            )}
            <NavButton
              active={activeTab === 'audit'}
              onClick={() => setActiveTab('audit')}
              icon={History}
              label="Audit Logs"
              theme={adminTheme}
            />
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
        <div className={`flex-1 h-full min-h-0 overflow-y-auto p-4 md:p-6 lg:p-8 custom-scrollbar ${pageBg}`}>
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
                onEnsureQuestionsLoaded={onEnsureQuestionsLoaded}
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
                onEnsureQuestionsLoaded={onEnsureQuestionsLoaded}
                loadingPaperQuestionsId={loadingPaperQuestionsId}
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
                onEnsureQuestionsLoaded={onEnsureQuestionsLoaded}
                loadingPaperQuestionsId={loadingPaperQuestionsId}
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
                onEnsureQuestionsLoaded={onEnsureQuestionsLoaded}
                loadingPaperQuestionsId={loadingPaperQuestionsId}
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

            {activeTab === 'accounts' && currentUser?.role === 'super-admin' && (
              <AccountsTab
                theme={adminTheme}
                showFlash={showFlash}
                currentUsername={currentUser?.username}
              />
            )}

            {activeTab === 'audit' && (
              <AuditTab
                theme={adminTheme}
                showFlash={showFlash}
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

      {/* Change Password Modal */}
      {showChangePwModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className={`relative w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl border ${cardBdr} ${cardBg} p-6 shadow-2xl animate-scale-up`}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-sky-500/10 text-sky-400 flex items-center justify-center">
                  <KeyRound className="w-4 h-4" />
                </div>
                <div>
                  <h3 className={`text-base font-bold ${textPrimary}`}>Change Password</h3>
                  <p className={`text-[11px] ${textMuted}`}>Verify old password and email OTP to update</p>
                </div>
              </div>
              <button
                onClick={handleClosePwModal}
                className={`p-1.5 rounded-lg text-slate-400 hover:${textPrimary} transition-colors cursor-pointer`}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {changePwError && (
              <div className="flex items-center gap-2 p-3 mb-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs">
                <X className="w-4 h-4 shrink-0" />
                <span>{changePwError}</span>
              </div>
            )}

            {changePwSuccess && (
              <div className="flex items-center gap-2 p-3 mb-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{changePwSuccess}</span>
              </div>
            )}

            {otpNotice && (
              <div className="p-2.5 mb-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[11px] font-mono text-center">
                {otpNotice}
              </div>
            )}

            <form onSubmit={handleChangePassword} className="space-y-4">
              {/* 1. Old Password */}
              <div>
                <label className={`block text-xs font-bold mb-1.5 ${textPrimary}`}>
                  1. Old Password
                </label>
                <div className="relative">
                  <Lock className={`absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 ${adminTheme.isDark ? 'text-slate-500' : 'text-slate-400'}`} />
                  <input
                    type={showOldPw ? 'text' : 'password'}
                    value={oldPw}
                    onChange={(e) => setOldPw(e.target.value)}
                    placeholder="Enter current / old password"
                    required
                    autoFocus
                    className={`w-full pl-10 pr-10 py-2 rounded-xl border ${adminTheme.inputBdr} ${adminTheme.inputBg} ${textPrimary} text-xs focus:ring-2 focus:ring-sky-500/40 focus:outline-none`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowOldPw(!showOldPw)}
                    tabIndex={-1}
                    className={`absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded text-slate-400 hover:${textPrimary}`}
                  >
                    {showOldPw ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              {/* 2. OTP Verification */}
              <div>
                <label className={`block text-xs font-bold mb-1.5 ${textPrimary}`}>
                  2. Email Verification Code (OTP)
                </label>
                <div className={`p-2.5 rounded-xl border ${adminTheme.surfaceBdr} ${adminTheme.subtleBg} mb-2`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Mail className="w-4 h-4 text-sky-400 shrink-0" />
                      <div className="min-w-0">
                        <p className={`text-[11px] font-semibold truncate ${textPrimary}`}>Registered Email</p>
                        <p className={`text-[10px] font-mono truncate ${textMuted}`}>{currentUser?.email || 'induwaradahamjith2004@gmail.com'}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleSendChangePwOtp}
                      disabled={isSendingOtp}
                      className="shrink-0 px-2.5 py-1 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 text-sky-400 border border-sky-500/30 text-[11px] font-bold transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                    >
                      {isSendingOtp ? (
                        <>
                          <Loader2 className="w-3 h-3 animate-spin" />
                          <span>Sending...</span>
                        </>
                      ) : (
                        <span>{otpSent ? 'Resend OTP' : 'Send OTP'}</span>
                      )}
                    </button>
                  </div>
                </div>

                <input
                  type="text"
                  value={changePwOtp}
                  onChange={(e) => setChangePwOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="Enter 6-digit OTP"
                  maxLength={6}
                  required
                  className={`w-full py-2.5 text-center font-mono tracking-[8px] text-base font-bold rounded-xl border ${adminTheme.inputBdr} ${adminTheme.inputBg} ${textPrimary} focus:ring-2 focus:ring-sky-500/40 focus:outline-none`}
                />
              </div>

              {/* 3. New Password */}
              <div>
                <label className={`block text-xs font-bold mb-1.5 ${textPrimary}`}>
                  3. New Password
                </label>
                <div className="relative">
                  <Lock className={`absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 ${adminTheme.isDark ? 'text-slate-500' : 'text-slate-400'}`} />
                  <input
                    type={showNewPw ? 'text' : 'password'}
                    value={newPw}
                    onChange={(e) => setNewPw(e.target.value)}
                    placeholder="Minimum 6 characters"
                    required
                    className={`w-full pl-10 pr-10 py-2 rounded-xl border ${adminTheme.inputBdr} ${adminTheme.inputBg} ${textPrimary} text-xs focus:ring-2 focus:ring-sky-500/40 focus:outline-none`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPw(!showNewPw)}
                    tabIndex={-1}
                    className={`absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded text-slate-400 hover:${textPrimary}`}
                  >
                    {showNewPw ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              {/* 4. Confirm New Password */}
              <div>
                <label className={`block text-xs font-bold mb-1.5 ${textPrimary}`}>
                  4. Confirm New Password
                </label>
                <div className="relative">
                  <Lock className={`absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 ${adminTheme.isDark ? 'text-slate-500' : 'text-slate-400'}`} />
                  <input
                    type={showConfirmNewPw ? 'text' : 'password'}
                    value={confirmNewPw}
                    onChange={(e) => setConfirmNewPw(e.target.value)}
                    placeholder="Re-enter new password"
                    required
                    className={`w-full pl-10 pr-10 py-2 rounded-xl border ${adminTheme.inputBdr} ${adminTheme.inputBg} ${textPrimary} text-xs focus:ring-2 focus:ring-sky-500/40 focus:outline-none`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmNewPw(!showConfirmNewPw)}
                    tabIndex={-1}
                    className={`absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded text-slate-400 hover:${textPrimary}`}
                  >
                    {showConfirmNewPw ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={handleClosePwModal}
                  className={`px-3.5 py-2 rounded-xl text-xs font-semibold ${textMuted} hover:${textPrimary} cursor-pointer`}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isChangingPw || !oldPw || changePwOtp.length !== 6 || newPw.length < 6 || !confirmNewPw}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-white font-bold text-xs shadow-md transition-all cursor-pointer disabled:opacity-50"
                >
                  {isChangingPw ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <span>Change Password</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
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
      className={`w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all duration-200 group ${active
          ? 'bg-gradient-to-r from-sky-500/10 to-indigo-500/10 text-sky-500 font-bold'
          : `${isDark ? 'hover:bg-slate-900' : 'hover:bg-slate-100'} ${textMuted} hover:${textPrimary} font-semibold`
        }`}
    >
      <div className="flex items-center gap-3">
        <Icon className={`w-5 h-5 ${active ? 'text-sky-500' : 'opacity-70 group-hover:opacity-100'}`} />
        <span className="text-sm">{label}</span>
      </div>
      {count !== undefined && (
        <span className={`text-[10px] font-mono px-2 py-0.5 rounded-md ${active
            ? 'bg-sky-500/20 text-sky-500'
            : `${isDark ? 'bg-slate-800' : 'bg-slate-200'}`
          }`}>
          {count}
        </span>
      )}
    </button>
  );
}
