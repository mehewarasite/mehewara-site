import React, { useState } from 'react';
import {
  Lock,
  User,
  Mail,
  Eye,
  EyeOff,
  ArrowLeft,
  ShieldCheck,
  KeyRound,
  UserPlus,
  Loader2,
  AlertCircle,
  CheckCircle2
} from 'lucide-react';
import { useTheme } from '../ThemeContext';
import { useLanguage } from '../LanguageContext';
import {
  dbAdminLogin,
  dbAdminRegisterRequestOtp,
  dbAdminRegisterVerify,
  dbAdminForgotPasswordRequest,
  dbAdminForgotPasswordReset
} from '../api';

interface AdminLoginProps {
  onLoginSuccess: (token: string, user?: any) => void;
  onCancel: () => void;
}

type AuthMode = 'login' | 'register' | 'forgot';

export default function AdminLogin({ onLoginSuccess, onCancel }: AdminLoginProps) {
  const { theme } = useTheme();
  const { language } = useLanguage();
  const isDark = theme === 'dark';
  const isEn = language === 'en';

  const [mode, setMode] = useState<AuthMode>('login');

  // Login Form State
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Register Form State
  const [regUsername, setRegUsername] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');
  const [regOtp, setRegOtp] = useState('');
  const [regStep, setRegStep] = useState<1 | 2>(1); // 1: Info, 2: OTP

  // Forgot Password State
  const [forgotIdentifier, setForgotIdentifier] = useState('');
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotOtp, setForgotOtp] = useState('');
  const [forgotNewPassword, setForgotNewPassword] = useState('');
  const [forgotConfirmPassword, setForgotConfirmPassword] = useState('');
  const [forgotStep, setForgotStep] = useState<1 | 2>(1); // 1: Request, 2: Reset

  // Status & Feedback
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [devOtpNotice, setDevOtpNotice] = useState<string | null>(null);

  const resetAllErrors = () => {
    setError(null);
    setSuccessMsg(null);
    setDevOtpNotice(null);
  };

  // ── Login Handler ──
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError(isEn ? 'Please enter both username and password.' : 'කරුණාකර පරිශීලක නාමය සහ මුරපදය ඇතුළත් කරන්න.');
      return;
    }

    setIsLoading(true);
    resetAllErrors();

    try {
      const res = await dbAdminLogin(username.trim(), password);
      if (res.token) {
        localStorage.setItem('adminToken', res.token);
        if (res.user) {
          localStorage.setItem('adminUser', JSON.stringify(res.user));
        }
        onLoginSuccess(res.token, res.user);
      } else {
        throw new Error(isEn ? 'No token returned from server' : 'සත්‍යාපන ටෝකනයක් නොලැබුණි');
      }
    } catch (err: any) {
      console.error('Admin login error:', err);
      const serverMsg = err.response?.data?.error || err.response?.data?.message;
      setError(
        serverMsg ||
        (isEn ? 'Invalid credentials. Please check your username and password.' : 'වලංගු නොවන තොරතුරු. පරිශීලක නාමය සහ මුරපදය පරීක්ෂා කරන්න.')
      );
    } finally {
      setIsLoading(false);
    }
  };

  // ── Register: Step 1 (Request OTP) ──
  const handleRegisterRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regUsername.trim() || !regEmail.trim() || !regPassword) {
      setError(isEn ? 'Please fill in all fields.' : 'කරුණාකර සියලු විස්තර පුරවන්න.');
      return;
    }

    if (regPassword.length < 6) {
      setError(isEn ? 'Password must be at least 6 characters.' : 'මුරපදය අවම වශයෙන් අකුරු 6ක් විය යුතුය.');
      return;
    }

    if (regPassword !== regConfirmPassword) {
      setError(isEn ? 'Passwords do not match.' : 'මුරපද එකිනෙකට නොගැලපේ.');
      return;
    }

    setIsLoading(true);
    resetAllErrors();

    try {
      const res = await dbAdminRegisterRequestOtp(regUsername.trim(), regEmail.trim(), regPassword);
      setSuccessMsg(res.message || (isEn ? 'Verification code sent to your email.' : 'තහවුරු කිරීමේ කේතය ඔබගේ විද්‍යුත් තැපෑලට යවන ලදි.'));
      if (res.devOtp) {
        setDevOtpNotice(`[Dev Mock OTP: ${res.devOtp}]`);
      }
      setRegStep(2);
    } catch (err: any) {
      const serverMsg = err.response?.data?.error || err.response?.data?.message;
      setError(serverMsg || (isEn ? 'Failed to send verification code.' : 'තහවුරු කිරීමේ කේතය යැවීමට නොහැකි විය.'));
    } finally {
      setIsLoading(false);
    }
  };

  // ── Register: Step 2 (Verify OTP & Create Account) ──
  const handleRegisterVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regOtp.trim() || regOtp.trim().length !== 6) {
      setError(isEn ? 'Please enter the 6-digit verification code.' : 'කරුණාකර ඉලක්කම් 6 කේතය ඇතුළත් කරන්න.');
      return;
    }

    setIsLoading(true);
    resetAllErrors();

    try {
      const res = await dbAdminRegisterVerify(
        regEmail.trim(),
        regOtp.trim(),
        regUsername.trim(),
        regPassword
      );

      if (res.token) {
        localStorage.setItem('adminToken', res.token);
        if (res.user) {
          localStorage.setItem('adminUser', JSON.stringify(res.user));
        }
        onLoginSuccess(res.token, res.user);
      }
    } catch (err: any) {
      const serverMsg = err.response?.data?.error || err.response?.data?.message;
      setError(serverMsg || (isEn ? 'Verification failed. Code may be invalid or expired.' : 'සත්‍යාපනය අසාර්ථක විය.'));
    } finally {
      setIsLoading(false);
    }
  };

  // ── Forgot Password: Step 1 (Request Reset OTP) ──
  const handleForgotRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotIdentifier.trim()) {
      setError(isEn ? 'Please enter your username or email.' : 'කරුණාකර ඔබගේ පරිශීලක නාමය හෝ විද්‍යුත් තැපෑල ඇතුළත් කරන්න.');
      return;
    }

    setIsLoading(true);
    resetAllErrors();

    try {
      const res = await dbAdminForgotPasswordRequest(forgotIdentifier.trim());
      setForgotEmail(res.email || forgotIdentifier.trim());
      setSuccessMsg(res.message || (isEn ? 'Reset code sent to your email.' : 'මුරපදය යළි පිහිටුවීමේ කේතය ඔබගේ විද්‍යුත් තැපෑලට යවන ලදි.'));
      if (res.devOtp) {
        setDevOtpNotice(`[Dev Mock OTP: ${res.devOtp}]`);
      }
      setForgotStep(2);
    } catch (err: any) {
      const serverMsg = err.response?.data?.error || err.response?.data?.message;
      setError(serverMsg || (isEn ? 'Failed to process password reset request.' : 'ඉල්ලීම සැකසීමට නොහැකි විය.'));
    } finally {
      setIsLoading(false);
    }
  };

  // ── Forgot Password: Step 2 (Reset Password with OTP) ──
  const handleForgotResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotOtp.trim() || forgotOtp.trim().length !== 6) {
      setError(isEn ? 'Please enter the 6-digit verification code.' : 'කරුණාකර ඉලක්කම් 6 කේතය ඇතුළත් කරන්න.');
      return;
    }

    if (forgotNewPassword.length < 6) {
      setError(isEn ? 'Password must be at least 6 characters.' : 'මුරපදය අවම වශයෙන් අකුරු 6ක් විය යුතුය.');
      return;
    }

    if (forgotNewPassword !== forgotConfirmPassword) {
      setError(isEn ? 'Passwords do not match.' : 'මුරපද එකිනෙකට නොගැලපේ.');
      return;
    }

    setIsLoading(true);
    resetAllErrors();

    try {
      const res = await dbAdminForgotPasswordReset(
        forgotEmail,
        forgotOtp.trim(),
        forgotNewPassword
      );

      setSuccessMsg(res.message || (isEn ? 'Password reset successfully! You may now sign in.' : 'මුරපදය සාර්ථකව වෙනස් විය! දැන් පිවිසිය හැක.'));
      // Reset fields and return to login mode
      setTimeout(() => {
        setMode('login');
        setUsername(forgotIdentifier);
        setPassword('');
        setForgotStep(1);
        setForgotOtp('');
        setForgotNewPassword('');
        setForgotConfirmPassword('');
      }, 1800);
    } catch (err: any) {
      const serverMsg = err.response?.data?.error || err.response?.data?.message;
      setError(serverMsg || (isEn ? 'Failed to reset password.' : 'මුරපදය වෙනස් කිරීම අසාර්ථක විය.'));
    } finally {
      setIsLoading(false);
    }
  };

  const pageBg = isDark ? 'bg-[#030304]' : 'bg-[#f0f4f8]';
  const cardBg = isDark
    ? 'bg-gradient-to-br from-slate-900/90 to-slate-950/95 backdrop-blur-2xl border-white/[0.08] shadow-[0_8px_40px_rgba(0,0,0,0.6)]'
    : 'bg-white/90 backdrop-blur-2xl border-slate-200/90 shadow-[0_8px_40px_rgba(0,0,0,0.06)]';
  const inputBg = isDark ? 'bg-slate-950/70 border-white/10 text-white placeholder-slate-500' : 'bg-white border-slate-200 text-slate-900 placeholder-slate-400';
  const labelText = isDark ? 'text-slate-300' : 'text-slate-700';
  const titleText = isDark ? 'text-white' : 'text-slate-900';
  const subText = isDark ? 'text-slate-400' : 'text-slate-500';

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 select-none ${pageBg}`}>
      {/* Glow accents */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-sky-500/10 dark:bg-sky-500/15 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/3 w-64 h-64 bg-emerald-500/10 blur-[100px] rounded-full pointer-events-none" />

      <div className={`relative w-full max-w-md rounded-2xl border p-6 sm:p-8 ${cardBg} transition-all`}>
        {/* Back button */}
        <button
          onClick={onCancel}
          type="button"
          className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg mb-6 transition-colors ${
            isDark
              ? 'text-slate-400 hover:text-white bg-white/5 hover:bg-white/10'
              : 'text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200'
          } cursor-pointer`}
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>{isEn ? 'Back to Site' : 'මුල් පිටුවට'}</span>
        </button>

        {/* Header with Icon */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-sky-500/10 border border-sky-500/20 text-sky-400 mb-3 shadow-inner">
            {mode === 'login' && <ShieldCheck className="w-7 h-7" />}
            {mode === 'register' && <UserPlus className="w-7 h-7" />}
            {mode === 'forgot' && <KeyRound className="w-7 h-7" />}
          </div>
          <h1 className={`text-xl sm:text-2xl font-black tracking-tight ${titleText}`}>
            {mode === 'login' && (isEn ? 'Admin Portal' : 'පාලක පිවිසුම')}
            {mode === 'register' && (isEn ? 'Create Admin Account' : 'නව පාලක ගිණුමක් තැනීම')}
            {mode === 'forgot' && (isEn ? 'Reset Password' : 'මුරපදය යළි පිහිටුවීම')}
          </h1>
          <p className={`text-xs mt-1.5 ${subText}`}>
            {mode === 'login' && (isEn ? 'Enter your credentials to access system management' : 'පද්ධති පාලනය සඳහා ඔබගේ පිවිසුම් තොරතුරු ඇතුළත් කරන්න')}
            {mode === 'register' && (regStep === 1
              ? (isEn ? 'Fill in your details to receive an email verification code' : 'තහවුරු කිරීමේ කේතයක් ලබා ගැනීමට ඔබගේ තොරතුරු ඇතුළත් කරන්න')
              : (isEn ? 'Enter the 6-digit code sent to your email' : 'ඔබගේ විද්‍යුත් තැපෑලට යවන ලද ඉලක්කම් 6 කේතය ඇතුළත් කරන්න'))}
            {mode === 'forgot' && (forgotStep === 1
              ? (isEn ? 'Enter your username or email to receive a password reset code' : 'මුරපදය යළි පිහිටුවීමේ කේතයක් ලබා ගැනීමට විස්තර ඇතුළත් කරන්න')
              : (isEn ? 'Enter the verification code and set your new password' : 'කේතය ඇතුළත් කර නව මුරපදයක් සකසන්න'))}
          </p>
        </div>

        {/* Feedback Alerts */}
        {error && (
          <div className="flex items-start gap-2.5 p-3 mb-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs animate-shake">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span className="leading-relaxed">{error}</span>
          </div>
        )}

        {successMsg && (
          <div className="flex items-start gap-2.5 p-3 mb-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            <span className="leading-relaxed">{successMsg}</span>
          </div>
        )}

        {devOtpNotice && (
          <div className="flex items-center justify-between p-2.5 mb-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[11px] font-mono">
            <span>{devOtpNotice}</span>
          </div>
        )}

        {/* ─────────────────────────────────────────────────────────────
            MODE 1: SIGN IN FORM
        ────────────────────────────────────────────────────────────── */}
        {mode === 'login' && (
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className={`block text-xs font-bold mb-1.5 ${labelText}`}>
                {isEn ? 'Username or Email' : 'පරිශීලක නාමය හෝ විද්‍යුත් තැපෑල'}
              </label>
              <div className="relative">
                <User className={`absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 ${isDark ? 'text-slate-500' : 'text-slate-400'}`} />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => {
                    setUsername(e.target.value);
                    if (error) setError(null);
                  }}
                  placeholder={isEn ? 'Enter username or email' : 'පරිශීලක නාමය හෝ විද්‍යුත් තැපෑල'}
                  autoFocus
                  autoComplete="username"
                  spellCheck={false}
                  disabled={isLoading}
                  className={`w-full pl-10 pr-4 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/40 transition-all ${inputBg}`}
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className={`text-xs font-bold ${labelText}`}>
                  {isEn ? 'Password' : 'මුරපදය'}
                </label>
                <button
                  type="button"
                  onClick={() => {
                    resetAllErrors();
                    setForgotIdentifier(username);
                    setMode('forgot');
                  }}
                  className="text-[11px] text-sky-400 hover:text-sky-300 transition-colors cursor-pointer font-medium"
                >
                  {isEn ? 'Forgot password?' : 'මුරපදය අමතක වුණාද?'}
                </button>
              </div>
              <div className="relative">
                <Lock className={`absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 ${isDark ? 'text-slate-500' : 'text-slate-400'}`} />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (error) setError(null);
                  }}
                  placeholder={isEn ? 'Enter password' : 'මුරපදය ඇතුළත් කරන්න'}
                  autoComplete="current-password"
                  disabled={isLoading}
                  className={`w-full pl-10 pr-11 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/40 transition-all ${inputBg}`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  tabIndex={-1}
                  className={`absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-md text-xs transition-colors ${
                    isDark ? 'text-slate-500 hover:text-slate-300' : 'text-slate-400 hover:text-slate-600'
                  } cursor-pointer`}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full mt-2 py-3 px-4 rounded-xl bg-sky-500 hover:bg-sky-400 text-white font-bold text-sm shadow-lg shadow-sky-500/25 hover:shadow-sky-500/40 active:scale-[0.99] transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{isEn ? 'Authenticating...' : 'තහවුරු කරමින්...'}</span>
                </>
              ) : (
                <span>{isEn ? 'Sign In' : 'පිවිසෙන්න'}</span>
              )}
            </button>

            {/* Switch to Register */}
            <div className="pt-2 text-center">
              <button
                type="button"
                onClick={() => {
                  resetAllErrors();
                  setMode('register');
                  setRegStep(1);
                }}
                className={`text-xs ${subText} hover:text-sky-400 transition-colors font-medium inline-flex items-center gap-1.5 cursor-pointer`}
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>{isEn ? 'Register new admin account' : 'නව පාලක ගිණුමක් ලියාපදිංචි කරන්න'}</span>
              </button>
            </div>
          </form>
        )}

        {/* ─────────────────────────────────────────────────────────────
            MODE 2: REGISTER ADMIN (WITH EMAIL OTP)
        ────────────────────────────────────────────────────────────── */}
        {mode === 'register' && (
          <div>
            {regStep === 1 ? (
              <form onSubmit={handleRegisterRequestOtp} className="space-y-3.5">
                <div>
                  <label className={`block text-xs font-bold mb-1 ${labelText}`}>
                    {isEn ? 'Username' : 'පරිශීලක නාමය'}
                  </label>
                  <div className="relative">
                    <User className={`absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 ${isDark ? 'text-slate-500' : 'text-slate-400'}`} />
                    <input
                      type="text"
                      value={regUsername}
                      onChange={(e) => setRegUsername(e.target.value)}
                      placeholder="e.g. jsmith"
                      required
                      autoFocus
                      className={`w-full pl-10 pr-4 py-2 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/40 transition-all ${inputBg}`}
                    />
                  </div>
                </div>

                <div>
                  <label className={`block text-xs font-bold mb-1 ${labelText}`}>
                    {isEn ? 'Email Address' : 'විද්‍යුත් තැපෑල'}
                  </label>
                  <div className="relative">
                    <Mail className={`absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 ${isDark ? 'text-slate-500' : 'text-slate-400'}`} />
                    <input
                      type="email"
                      value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)}
                      placeholder="admin@mehewara.edu.lk"
                      required
                      className={`w-full pl-10 pr-4 py-2 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/40 transition-all ${inputBg}`}
                    />
                  </div>
                </div>

                <div>
                  <label className={`block text-xs font-bold mb-1 ${labelText}`}>
                    {isEn ? 'Password' : 'මුරපදය'}
                  </label>
                  <div className="relative">
                    <Lock className={`absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 ${isDark ? 'text-slate-500' : 'text-slate-400'}`} />
                    <input
                      type="password"
                      value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                      placeholder={isEn ? 'Minimum 6 characters' : 'අවම වශයෙන් අකුරු 6ක්'}
                      required
                      className={`w-full pl-10 pr-4 py-2 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/40 transition-all ${inputBg}`}
                    />
                  </div>
                </div>

                <div>
                  <label className={`block text-xs font-bold mb-1 ${labelText}`}>
                    {isEn ? 'Confirm Password' : 'මුරපදය තහවුරු කරන්න'}
                  </label>
                  <div className="relative">
                    <Lock className={`absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 ${isDark ? 'text-slate-500' : 'text-slate-400'}`} />
                    <input
                      type="password"
                      value={regConfirmPassword}
                      onChange={(e) => setRegConfirmPassword(e.target.value)}
                      placeholder={isEn ? 'Re-enter password' : 'නැවත මුරපදය ඇතුළත් කරන්න'}
                      required
                      className={`w-full pl-10 pr-4 py-2 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/40 transition-all ${inputBg}`}
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full mt-3 py-2.5 px-4 rounded-xl bg-sky-500 hover:bg-sky-400 text-white font-bold text-sm shadow-md transition-all disabled:opacity-60 flex items-center justify-center gap-2 cursor-pointer"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>{isEn ? 'Sending verification code...' : 'කේතය යවමින්...'}</span>
                    </>
                  ) : (
                    <span>{isEn ? 'Send Verification Code' : 'තහවුරු කිරීමේ කේතය එවන්න'}</span>
                  )}
                </button>
              </form>
            ) : (
              <form onSubmit={handleRegisterVerify} className="space-y-4">
                <div>
                  <label className={`block text-xs font-bold mb-2 text-center ${labelText}`}>
                    {isEn ? 'Enter 6-Digit Email Code' : 'විද්‍යුත් තැපෑලට ලැබුණු ඉලක්කම් 6 කේතය'}
                  </label>
                  <input
                    type="text"
                    value={regOtp}
                    onChange={(e) => setRegOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="123456"
                    autoFocus
                    maxLength={6}
                    required
                    className={`w-full py-3 text-center tracking-[12px] font-mono text-2xl font-bold rounded-xl border focus:outline-none focus:ring-2 focus:ring-sky-500/40 ${inputBg}`}
                  />
                </div>

                <button
                  type="submit"
                  disabled={isLoading || regOtp.length !== 6}
                  className="w-full py-3 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white font-bold text-sm shadow-lg shadow-emerald-500/25 transition-all disabled:opacity-60 flex items-center justify-center gap-2 cursor-pointer"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>{isEn ? 'Verifying & Creating Account...' : 'සත්‍යාපනය කරමින්...'}</span>
                    </>
                  ) : (
                    <span>{isEn ? 'Verify & Create Account' : 'තහවුරු කර ගිණුම තනන්න'}</span>
                  )}
                </button>

                <div className="flex items-center justify-between text-xs pt-1">
                  <button
                    type="button"
                    onClick={() => setRegStep(1)}
                    className={`${subText} hover:text-white transition-colors cursor-pointer`}
                  >
                    {isEn ? '← Change email' : '← විද්‍යුත් තැපෑල වෙනස් කරන්න'}
                  </button>
                  <button
                    type="button"
                    onClick={handleRegisterRequestOtp}
                    disabled={isLoading}
                    className="text-sky-400 hover:text-sky-300 font-semibold cursor-pointer"
                  >
                    {isEn ? 'Resend code' : 'නැවත එවන්න'}
                  </button>
                </div>
              </form>
            )}

            {/* Back to sign in */}
            <div className="mt-5 pt-3 border-t border-white/5 text-center">
              <button
                type="button"
                onClick={() => {
                  resetAllErrors();
                  setMode('login');
                }}
                className={`text-xs ${subText} hover:text-sky-400 transition-colors font-medium cursor-pointer`}
              >
                {isEn ? 'Already have an account? Sign In' : 'දැනටමත් ගිණුමක් තිබේද? පිවිසෙන්න'}
              </button>
            </div>
          </div>
        )}

        {/* ─────────────────────────────────────────────────────────────
            MODE 3: FORGOT PASSWORD (WITH EMAIL OTP RESET)
        ────────────────────────────────────────────────────────────── */}
        {mode === 'forgot' && (
          <div>
            {forgotStep === 1 ? (
              <form onSubmit={handleForgotRequestOtp} className="space-y-4">
                <div>
                  <label className={`block text-xs font-bold mb-1.5 ${labelText}`}>
                    {isEn ? 'Username or Registered Email' : 'පරිශීලක නාමය හෝ ලියාපදිංචි විද්‍යුත් තැපෑල'}
                  </label>
                  <div className="relative">
                    <User className={`absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 ${isDark ? 'text-slate-500' : 'text-slate-400'}`} />
                    <input
                      type="text"
                      value={forgotIdentifier}
                      onChange={(e) => setForgotIdentifier(e.target.value)}
                      placeholder={isEn ? 'e.g. admin or staff@mehewara.edu.lk' : 'පරිශීලක නාමය හෝ විද්‍යුත් තැපෑල'}
                      required
                      autoFocus
                      className={`w-full pl-10 pr-4 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/40 transition-all ${inputBg}`}
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-3 px-4 rounded-xl bg-sky-500 hover:bg-sky-400 text-white font-bold text-sm shadow-md transition-all disabled:opacity-60 flex items-center justify-center gap-2 cursor-pointer"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>{isEn ? 'Sending reset code...' : 'කේතය යවමින්...'}</span>
                    </>
                  ) : (
                    <span>{isEn ? 'Send Reset Code' : 'මුරපද කේතය එවන්න'}</span>
                  )}
                </button>
              </form>
            ) : (
              <form onSubmit={handleForgotResetPassword} className="space-y-3.5">
                <div>
                  <label className={`block text-xs font-bold mb-1.5 text-center ${labelText}`}>
                    {isEn ? 'Verification Code' : 'තහවුරු කිරීමේ කේතය'}
                  </label>
                  <input
                    type="text"
                    value={forgotOtp}
                    onChange={(e) => setForgotOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="123456"
                    autoFocus
                    maxLength={6}
                    required
                    className={`w-full py-2.5 text-center tracking-[12px] font-mono text-xl font-bold rounded-xl border focus:outline-none focus:ring-2 focus:ring-sky-500/40 ${inputBg}`}
                  />
                </div>

                <div>
                  <label className={`block text-xs font-bold mb-1 ${labelText}`}>
                    {isEn ? 'New Password' : 'නව මුරපදය'}
                  </label>
                  <input
                    type="password"
                    value={forgotNewPassword}
                    onChange={(e) => setForgotNewPassword(e.target.value)}
                    placeholder={isEn ? 'Minimum 6 characters' : 'අවම වශයෙන් අකුරු 6ක්'}
                    required
                    className={`w-full px-3.5 py-2 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/40 ${inputBg}`}
                  />
                </div>

                <div>
                  <label className={`block text-xs font-bold mb-1 ${labelText}`}>
                    {isEn ? 'Confirm New Password' : 'නව මුරපදය තහවුරු කරන්න'}
                  </label>
                  <input
                    type="password"
                    value={forgotConfirmPassword}
                    onChange={(e) => setForgotConfirmPassword(e.target.value)}
                    placeholder={isEn ? 'Re-type new password' : 'නැවත මුරපදය ඇතුළත් කරන්න'}
                    required
                    className={`w-full px-3.5 py-2 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/40 ${inputBg}`}
                  />
                </div>

                <button
                  type="submit"
                  disabled={isLoading || forgotOtp.length !== 6}
                  className="w-full mt-2 py-3 px-4 rounded-xl bg-sky-500 hover:bg-sky-400 text-white font-bold text-sm shadow-md transition-all disabled:opacity-60 flex items-center justify-center gap-2 cursor-pointer"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>{isEn ? 'Resetting Password...' : 'වෙනස් කරමින්...'}</span>
                    </>
                  ) : (
                    <span>{isEn ? 'Reset Password' : 'මුරපදය වෙනස් කරන්න'}</span>
                  )}
                </button>
              </form>
            )}

            {/* Back to sign in */}
            <div className="mt-5 pt-3 border-t border-white/5 text-center">
              <button
                type="button"
                onClick={() => {
                  resetAllErrors();
                  setMode('login');
                }}
                className={`text-xs ${subText} hover:text-sky-400 transition-colors font-medium cursor-pointer`}
              >
                {isEn ? '← Back to Sign In' : '← පිවිසුම් පිටුවට'}
              </button>
            </div>
          </div>
        )}

        <div className={`mt-6 pt-4 border-t ${isDark ? 'border-white/5' : 'border-slate-100'} text-center`}>
          <p className={`text-[11px] ${subText}`}>
            Mehewara Educational Platform &copy; {new Date().getFullYear()}
          </p>
        </div>
      </div>
    </div>
  );
}
