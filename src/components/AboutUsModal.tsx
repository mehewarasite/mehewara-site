import React from 'react';
import { X, Facebook, Youtube, Linkedin, Info } from 'lucide-react';
import { useTheme } from '../ThemeContext';

interface AboutData {
  description: string;
  image_url: string;
  facebook_link: string;
  youtube_link: string;
  linkedin_link: string;
}

interface AboutUsModalProps {
  data: AboutData | null;
  onClose: () => void;
}

export default function AboutUsModal({ data, onClose }: AboutUsModalProps) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const bgModal = isDark ? 'bg-slate-900/95' : 'bg-white/95';
  const borderModal = isDark ? 'border-slate-800' : 'border-slate-200';
  const textPrimary = isDark ? 'text-white' : 'text-slate-900';
  const textMuted = isDark ? 'text-slate-400' : 'text-slate-500';

  if (!data) return null;

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 backdrop-blur-sm ${isDark ? 'bg-black/60' : 'bg-slate-900/30'}`}>
      <div 
        className={`relative w-full max-w-2xl ${bgModal} border ${borderModal} shadow-2xl rounded-3xl overflow-hidden flex flex-col max-h-[90vh] animate-fade-in`}
      >
        <button
          onClick={onClose}
          className={`absolute top-4 right-4 z-10 p-2 rounded-full ${isDark ? 'bg-slate-800/80 hover:bg-slate-700 text-slate-300' : 'bg-slate-100/80 hover:bg-slate-200 text-slate-600'} transition-colors`}
        >
          <X className="w-5 h-5" />
        </button>

        <div className="overflow-y-auto custom-scrollbar flex-grow p-6 sm:p-10">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-sky-500/10 text-sky-500 mb-4">
              <Info className="w-8 h-8" />
            </div>
            <h2 className={`text-2xl sm:text-3xl font-extrabold ${textPrimary} tracking-tight`}>About Us</h2>
            <p className={`text-sm ${textMuted} mt-2 font-medium`}>MEHEWARA EDUCATIONAL PLATFORM</p>
          </div>

          <div className="flex flex-col md:flex-row gap-8 items-center md:items-start">
            {data.image_url && (
              <div className="w-full md:w-1/2 shrink-0">
                <div className={`rounded-2xl overflow-hidden border ${borderModal} shadow-lg relative group`}>
                  <img 
                    src={data.image_url} 
                    alt="About Us" 
                    className="w-full h-auto object-cover transform transition-transform duration-700 group-hover:scale-105" 
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent pointer-events-none" />
                </div>
              </div>
            )}

            <div className={`w-full ${data.image_url ? 'md:w-1/2' : 'max-w-xl mx-auto text-center'}`}>
              <div className={`prose ${isDark ? 'prose-invert' : ''} prose-sm sm:prose-base whitespace-pre-wrap ${textPrimary} leading-relaxed`}>
                {data.description || "Welcome to Mehewara! We are dedicated to providing the best past paper practice experience."}
              </div>

              <div className={`flex flex-wrap gap-4 mt-8 ${data.image_url ? '' : 'justify-center'}`}>
                {data.facebook_link && (
                  <a href={data.facebook_link} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center w-10 h-10 rounded-full bg-blue-600 text-white hover:bg-blue-700 hover:scale-110 transition-all shadow-lg shadow-blue-600/30">
                    <Facebook className="w-5 h-5" />
                  </a>
                )}
                {data.youtube_link && (
                  <a href={data.youtube_link} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center w-10 h-10 rounded-full bg-red-600 text-white hover:bg-red-700 hover:scale-110 transition-all shadow-lg shadow-red-600/30">
                    <Youtube className="w-5 h-5" />
                  </a>
                )}
                {data.linkedin_link && (
                  <a href={data.linkedin_link} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center w-10 h-10 rounded-full bg-[#0A66C2] text-white hover:bg-[#004182] hover:scale-110 transition-all shadow-lg shadow-[#0A66C2]/30">
                    <Linkedin className="w-5 h-5" />
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
