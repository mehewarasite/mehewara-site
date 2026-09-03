import { useEffect, useRef, useState } from 'react';
import { ShieldCheck, AlertCircle, RefreshCw } from 'lucide-react';

interface SiteEntryGateProps {
  isDark: boolean;
  isEn: boolean;
  onVerified: () => void;
}

export default function SiteEntryGate({ isDark, isEn, onVerified }: SiteEntryGateProps) {
  const [isVerifying, setIsVerifying] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isFadingOut, setIsFadingOut] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);

  const handleTokenReceived = async (token: string) => {
    setIsVerifying(true);
    setErrorMessage(null);

    try {
      const res = await fetch('/api/verify-turnstile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          action: 'site_entry',
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        sessionStorage.setItem('mhw_human_verified', 'true');
        setIsFadingOut(true);
        setTimeout(() => {
          onVerified();
        }, 500);
      } else {
        setErrorMessage(data.error || (isEn ? 'Verification failed. Please retry.' : 'සත්‍යාපනය අසාර්ථක විය. නැවත උත්සාහ කරන්න.'));
        if (widgetIdRef.current && (window as any).turnstile) {
          (window as any).turnstile.reset(widgetIdRef.current);
        }
      }
    } catch (err: any) {
      console.warn('Site entry verification error:', err);
      // If network or endpoint is unreachable in dev/offline, allow smooth progress
      sessionStorage.setItem('mhw_human_verified', 'true');
      setIsFadingOut(true);
      setTimeout(() => {
        onVerified();
      }, 500);
    } finally {
      setIsVerifying(false);
    }
  };

  const handleManualReset = () => {
    setErrorMessage(null);
    if (widgetIdRef.current && (window as any).turnstile) {
      (window as any).turnstile.reset(widgetIdRef.current);
    }
  };

  useEffect(() => {
    const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY || '0x4AAAAAAElpXtkwfy5K8yzw';
    let pollTimer: any;

    const renderWidget = () => {
      const turnstile = (window as any).turnstile;
      if (turnstile && containerRef.current && !widgetIdRef.current) {
        try {
          widgetIdRef.current = turnstile.render(containerRef.current, {
            sitekey: siteKey,
            action: 'site_entry',
            theme: isDark ? 'dark' : 'light',
            callback: (token: string) => handleTokenReceived(token),
            'expired-callback': () => {
              setErrorMessage(isEn ? 'Verification expired. Please check the box again.' : 'සත්‍යාපනය කල් ඉකුත් විය. නැවත සලකුණු කරන්න.');
            },
            'error-callback': () => {
              setErrorMessage(isEn ? 'Security challenge failed to load. Please refresh or retry.' : 'ආරක්ෂක පරීක්ෂාව පැටවීමේ දෝෂයක්. කරුණාකර නැවත උත්සාහ කරන්න.');
            },
          });
          if (pollTimer) clearInterval(pollTimer);
        } catch (err) {
          console.error('Turnstile render error:', err);
        }
      }
    };

    if ((window as any).turnstile) {
      renderWidget();
    } else {
      pollTimer = setInterval(renderWidget, 250);
    }

    return () => {
      if (pollTimer) clearInterval(pollTimer);
      if (widgetIdRef.current && (window as any).turnstile) {
        try {
          (window as any).turnstile.remove(widgetIdRef.current);
        } catch {}
        widgetIdRef.current = null;
      }
    };
  }, [isDark, isEn]);

  return (
    <div
      className={`fixed inset-0 z-[9999] flex items-center justify-center p-4 transition-opacity duration-500 select-none ${
        isFadingOut ? 'opacity-0 pointer-events-none' : 'opacity-100'
      } ${isDark ? 'bg-[#030304]/95 text-white' : 'bg-slate-100/95 text-slate-900'} backdrop-blur-2xl`}
    >
      {/* GLOWING AMBIENCE */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-sky-500/10 blur-[120px] rounded-full pointer-events-none" />

      <div
        className={`w-full max-w-md p-6 sm:p-8 rounded-3xl border shadow-2xl relative overflow-hidden text-center transition-all ${
          isDark
            ? 'bg-slate-900/80 border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.6)]'
            : 'bg-white/80 border-slate-200 shadow-[0_20px_50px_rgba(0,0,0,0.1)]'
        } backdrop-blur-xl`}
      >
        {/* TOP ACCENT LINE */}
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-sky-400 via-indigo-500 to-emerald-400" />

        {/* LOGO & BADGE */}
        <div className="flex flex-col items-center mb-5">
          <div className="relative mb-3">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center p-2.5 bg-gradient-to-br from-sky-500/10 to-indigo-500/10 border border-sky-500/20 shadow-inner">
              <img src="/image/efac.png" alt="Mehewara" className="w-full h-full object-contain drop-shadow" />
            </div>
            <div className="absolute -bottom-1 -right-1 p-1 bg-sky-500 text-white rounded-full shadow">
              <ShieldCheck className="w-3.5 h-3.5" />
            </div>
          </div>

          <h2 className="text-xl sm:text-2xl font-black tracking-tight">
            {isEn ? 'Security Verification' : 'ආරක්ෂක සත්‍යාපනය'}
          </h2>
          <p className="text-xs text-slate-400 mt-1 max-w-xs leading-relaxed">
            {isEn
              ? 'Please verify you are human to access the past papers.'
              : 'ප්‍රශ්න පත්‍ර වෙත පිවිසීමට පෙර ඔබ සැබෑ පරිශීලකයෙක් බව තහවුරු කරන්න.'}
          </p>
        </div>

        {/* TURNSTILE WIDGET CONTAINER */}
        <div className="my-6 flex flex-col items-center justify-center min-h-[70px]">
          <div ref={containerRef} className="rounded-xl overflow-hidden shadow-sm" />

          {isVerifying && (
            <div className="flex items-center gap-2 mt-3 text-xs text-sky-400 font-medium animate-pulse">
              <div className="w-2 h-2 rounded-full bg-sky-400 animate-ping" />
              <span>{isEn ? 'Verifying human response...' : 'සත්‍යාපනය වෙමින් පවතී...'}</span>
            </div>
          )}
        </div>

        {/* ERROR STATE */}
        {errorMessage && (
          <div className="mt-3 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center justify-between gap-2 text-left">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
            <button
              onClick={handleManualReset}
              className="p-1 rounded hover:bg-rose-500/20 text-rose-300 transition-colors shrink-0 cursor-pointer"
              title="Retry"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* FOOTER NOTE */}
        <div className="mt-6 pt-4 border-t border-white/5 flex items-center justify-center gap-1.5 text-[10px] text-slate-500 font-mono">
          <span>Protected by Cloudflare Turnstile</span>
        </div>
      </div>
    </div>
  );
}
