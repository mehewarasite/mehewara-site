import { useEffect, useState } from 'react';
import { ArrowLeft, ShieldCheck, Mail } from 'lucide-react';
import { useTheme } from '../ThemeContext';
import { DEFAULT_PRIVACY_POLICY } from '../privacyPolicyDefault';
import { idbGet } from '../utils/storage';

export default function PrivacyPolicyPage() {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const [content, setContent] = useState<string>('');
  const [statement, setStatement] = useState<string>('');

  useEffect(() => {
    const fetchPolicy = async () => {
      const saved = await idbGet('m_about_us');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (parsed.full_privacy_policy_html) {
            setContent(parsed.full_privacy_policy_html);
          } else {
            setContent(DEFAULT_PRIVACY_POLICY);
          }
          if (parsed.privacy_policy_statement) {
            setStatement(parsed.privacy_policy_statement);
          }
        } catch (e) {
          setContent(DEFAULT_PRIVACY_POLICY);
        }
      } else {
        setContent(DEFAULT_PRIVACY_POLICY);
      }
    };
    fetchPolicy();
  }, []);

  const bgPage = isDark ? 'bg-[#030304]' : 'bg-[#f0f4f8]';
  const headerBg = isDark ? 'bg-[#030304]/90' : 'bg-[#f0f4f8]/90';
  const textPrimary = isDark ? 'text-slate-100' : 'text-slate-900';
  const textSecondary = isDark ? 'text-slate-300' : 'text-slate-700';
  const textMuted = isDark ? 'text-slate-400' : 'text-slate-500';
  const borderCol = isDark ? 'border-slate-800' : 'border-slate-200';
  const cardBg = isDark ? 'bg-[#0c0c14]' : 'bg-white';
  const cardBorder = isDark ? 'border-slate-800' : 'border-slate-200';
  const cardHoverBorder = isDark ? 'hover:border-slate-700' : 'hover:border-slate-300';

  return (
    <div className={`min-h-screen ${bgPage} font-sans selection:bg-sky-500/30 selection:text-sky-200 pb-20`}>
      {/* Navbar */}
      <nav className={`sticky top-0 z-50 ${headerBg} backdrop-blur-md border-b ${borderCol}`}>
        <div className="max-w-4xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-sky-500/10 flex items-center justify-center text-sky-500">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <span className={`font-bold tracking-tight text-lg ${textPrimary}`}>Mehewara Privacy</span>
          </div>
          <a href="/" className={`flex items-center gap-2 text-sm font-medium ${textMuted} hover:text-sky-500 transition-colors`}>
            <ArrowLeft className="w-4 h-4" /> Back to App
          </a>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-3xl mx-auto px-6 mt-12">
        <header className="mb-10 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-sky-500/10 text-sky-500 mb-6">
            <ShieldCheck className="w-8 h-8" />
          </div>
          <h1 className={`text-4xl md:text-5xl font-extrabold tracking-tight ${textPrimary} mb-4`}>Privacy Policy</h1>
          <p className={`text-lg ${textMuted}`}>Last updated: {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
        </header>

        {statement && (
          <div className={`mb-10 p-6 rounded-2xl border ${cardBorder} ${cardBg} shadow-lg ${cardHoverBorder} transition-all`}>
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 shrink-0 rounded-full bg-sky-500/10 flex items-center justify-center text-sky-500 mt-1">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h3 className={`text-sm font-bold uppercase tracking-wider ${textMuted} mb-2`}>Special Update</h3>
                <p className={`text-sm sm:text-base leading-relaxed ${textPrimary}`}>{statement}</p>
              </div>
            </div>
          </div>
        )}

        {/* The Document Area */}
        <div className={`p-8 sm:p-10 rounded-3xl border ${cardBorder} ${cardBg} shadow-xl ${cardHoverBorder} transition-all`}>
          <div className={`prose ${isDark ? 'prose-invert' : ''} prose-sky max-w-none 
            prose-headings:font-bold prose-h2:text-2xl prose-h2:border-b prose-h2:pb-3 prose-h2:mb-4
            prose-p:text-base prose-p:leading-relaxed prose-li:text-base 
            prose-a:text-sky-500 prose-a:no-underline hover:prose-a:underline
            ${isDark ? 'prose-h2:border-slate-800 prose-p:text-slate-300 prose-li:text-slate-300' : 'prose-h2:border-slate-200 prose-p:text-slate-600 prose-li:text-slate-600'}`}>
            
            {content ? (
              <div dangerouslySetInnerHTML={{ __html: content }} />
            ) : (
              <div className="text-center py-10">
                <p className={textMuted}>Loading privacy policy content...</p>
              </div>
            )}
            
          </div>
        </div>

        {/* Footer contact block */}
        <div className={`mt-12 p-8 rounded-3xl border ${cardBorder} ${cardBg} shadow-lg text-center`}>
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-slate-800 text-sky-400 mb-4">
            <Mail className="w-6 h-6" />
          </div>
          <h3 className={`text-xl font-bold ${textPrimary} mb-2`}>Contact Us</h3>
          <p className={`${textSecondary} mb-4`}>For any privacy-related questions or concerns, reach us at:</p>
          <a href="mailto:contact@mehewara.edu.lk" className="text-sky-500 font-medium text-lg hover:underline">
            contact@mehewara.edu.lk
          </a>
        </div>

        {/* Footer text */}
        <div className={`mt-12 text-center text-sm ${textMuted} pb-8`}>
          © 2026 Mehewara  &middot;  mehewara.edu.lk  &middot;  Privacy Policy  &middot;  All rights reserved
        </div>
      </main>
    </div>
  );
}
