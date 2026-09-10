import React, { useState } from 'react';
import { Lock, User, Eye, EyeOff, ArrowLeft, ShieldCheck, Loader2, AlertCircle } from 'lucide-react';
import { useTheme } from '../ThemeContext';
import { useLanguage } from '../LanguageContext';
import { api } from '../apiClient';

interface AdminLoginProps {
  onLoginSuccess: (token: string) => void;
  onCancel: () => void;
}

export default function AdminLogin({ onLoginSuccess, onCancel }: AdminLoginProps) {
  const { theme } = useTheme();
  const { language } = useLanguage();
  const isDark = theme === 'dark';
  const isEn = language === 'en';

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError(isEn ? 'Please enter both username and password' : 'කරුණාකර පරිශීලක නාමය සහ මුරපදය ඇතුළත් කරන්න');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const res = await api.post('/admin/login', {
        username: username.trim(),
        password,
      });

      if (res.data?.token) {
        localStorage.setItem('adminToken', res.data.token);
        onLoginSuccess(res.data.token);
      } else {
        throw new Error(isEn ? 'No token returned from server' : 'සත්‍යාපන ටෝකනයක් නොලැබුණි');
      }
    } catch (err: any) {
      console.error('Admin login error:', err);
      const serverMsg = err.response?.data?.error || err.response?.data?.message;
      setError(
        serverMsg ||
        (isEn ? 'Invalid credentials. Please check username and password.' : 'වලංගු නොවන තොරතුරු. පරිශීලක නාමය සහ මුරපදය පරීක්ෂා කරන්න.')
      );
    } finally {
      setIsLoading(false);
    }
  };

  const pageBg = isDark ? 'bg-[#030304]' : 'bg-[#f0f4f8]';
  const cardBg = isDark
    ? 'bg-gradient-to-br from-slate-900/80 to-slate-950/90 backdrop-blur-2xl border-white/[0.08] shadow-[0_8px_40px_rgba(0,0,0,0.6)]'
    : 'bg-white/80 backdrop-blur-2xl border-slate-200/80 shadow-[0_8px_40px_rgba(0,0,0,0.06)]';
  const inputBg = isDark ? 'bg-slate-950/60 border-white/10 text-white placeholder-slate-500' : 'bg-white border-slate-200 text-slate-900 placeholder-slate-400';
  const labelText = isDark ? 'text-slate-300' : 'text-slate-700';
  const titleText = isDark ? 'text-white' : 'text-slate-900';
  const subText = isDark ? 'text-slate-400' : 'text-slate-500';

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 select-none ${pageBg}`}>
      {/* Background glow accents */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-sky-500/10 dark:bg-sky-500/15 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/3 w-64 h-64 bg-emerald-500/10 blur-[100px] rounded-full pointer-events-none" />

      {/* Login Card */}
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

        {/* Header with Badge */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-sky-500/10 border border-sky-500/20 text-sky-400 mb-3 shadow-inner">
            <ShieldCheck className="w-7 h-7" />
          </div>
          <h1 className={`text-xl sm:text-2xl font-black tracking-tight ${titleText}`}>
            {isEn ? 'Admin Portal' : 'පාලක පිවිසුම'}
          </h1>
          <p className={`text-xs mt-1.5 ${subText}`}>
            {isEn
              ? 'Enter your credentials to access system management'
              : 'පද්ධති පාලනය සඳහා ඔබගේ පිවිසුම් තොරතුරු ඇතුළත් කරන්න'}
          </p>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="flex items-start gap-2.5 p-3 mb-5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs animate-shake">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span className="leading-relaxed">{error}</span>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className={`block text-xs font-bold mb-1.5 ${labelText}`}>
              {isEn ? 'Username' : 'පරිශීලක නාමය'}
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
                placeholder={isEn ? 'Enter username' : 'පරිශීලක නාමය ඇතුළත් කරන්න'}
                autoFocus
                autoComplete="username"
                spellCheck={false}
                disabled={isLoading}
                className={`w-full pl-10 pr-4 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/40 transition-all ${inputBg}`}
              />
            </div>
          </div>

          <div>
            <label className={`block text-xs font-bold mb-1.5 ${labelText}`}>
              {isEn ? 'Password' : 'මුරපදය'}
            </label>
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
                }`}
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
        </form>

        <div className={`mt-6 pt-4 border-t ${isDark ? 'border-white/5' : 'border-slate-100'} text-center`}>
          <p className={`text-[11px] ${subText}`}>
            Mehewara Educational Platform &copy; {new Date().getFullYear()}
          </p>
        </div>
      </div>
    </div>
  );
}
