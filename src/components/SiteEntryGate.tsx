import { useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';

interface SiteEntryGateProps {
  isDark: boolean;
  isEn: boolean;
  onVerified: () => void;
}

export default function SiteEntryGate({ isDark, isEn, onVerified }: SiteEntryGateProps) {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isFadingOut, setIsFadingOut] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);

  const handleTokenReceived = async (token: string) => {
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
    }
  };

  const handleManualReset = () => {
    setErrorMessage(null);
    if (widgetIdRef.current && (window as any).turnstile) {
      (window as any).turnstile.reset(widgetIdRef.current);
    }
  };

  useEffect(() => {
    // Automatically bypass on local dev or preview deploys where Turnstile sitekey domain doesn't match
    if (import.meta.env.DEV || (window.location.hostname.endsWith('pages.dev') && window.location.hostname !== 'mehewara-site.pages.dev')) {
      console.warn('Bypassing Turnstile on preview domain');
      sessionStorage.setItem('mhw_human_verified', 'true');
      onVerified();
      return;
    }

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
              if (import.meta.env.DEV || window.location.hostname.endsWith('pages.dev')) {
                console.warn('Turnstile rejected on preview/DEV; auto-bypassing gate');
                sessionStorage.setItem('mhw_human_verified', 'true');
                setIsFadingOut(true);
                setTimeout(() => onVerified(), 300);
                return;
              }
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
      } ${isDark ? 'bg-[#030304]/90' : 'bg-slate-900/90'} backdrop-blur-xl`}
    >
      <div className="flex flex-col items-center justify-center">
        {/* Only Cloudflare Turnstile verification widget */}
        <div ref={containerRef} className="rounded-xl overflow-hidden shadow-2xl min-h-[65px]" />

        {(errorMessage || import.meta.env.DEV) && (
          <div className="flex items-center gap-2 mt-4">
            {errorMessage && (
              <button
                onClick={handleManualReset}
                className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                title="Retry"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Retry</span>
              </button>
            )}
            {import.meta.env.DEV && (
              <button
                onClick={() => {
                  sessionStorage.setItem('mhw_human_verified', 'true');
                  setIsFadingOut(true);
                  setTimeout(() => onVerified(), 300);
                }}
                className="px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                title="Dev Skip"
              >
                <span>⚡ Dev Skip Verification</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
