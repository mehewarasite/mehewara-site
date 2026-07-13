import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabase';
import { idbGet, idbSet } from '../../utils/storage';
import { DEFAULT_PRIVACY_POLICY } from '../../privacyPolicyDefault';
import RichTextEditor from '../RichTextEditor';
import type { AdminThemeClasses } from './types';

interface AboutTabProps {
  theme: AdminThemeClasses;
  onAboutUpdate?: (data: any) => void;
  showFlash: (message: string, isError?: boolean) => void;
}

export default function AboutTab({ theme, onAboutUpdate, showFlash }: AboutTabProps) {
  const { isDark, cardBg, cardBdr, inputBg, inputBdr, surfaceBdr, textPrimary, textMuted, subtleBg } = theme;

  const [aboutData, setAboutData] = useState({
    description: '',
    image_url: '',
    facebook_link: '',
    youtube_link: '',
    linkedin_link: '',
    privacy_policy_statement: '',
    full_privacy_policy_html: ''
  });
  const [showPrivacyEditor, setShowPrivacyEditor] = useState(false);

  useEffect(() => {
    const fetchAboutData = async () => {
      try {
        const { data, error } = await supabase.from('about_us').select('*').eq('id', 1).maybeSingle();
        if (data && !error) {
          setAboutData(data);
        } else {
          const local = await idbGet('m_about_us');
          if (local) setAboutData(JSON.parse(local));
        }
      } catch (err) {
        const local = await idbGet('m_about_us');
        if (local) setAboutData(JSON.parse(local));
      }
    };
    fetchAboutData();
  }, []);

  return (
    <>
      <div className={`space-y-6 p-6 ${cardBg} rounded-2xl border ${cardBdr}`}>
        <h3 className={`text-xl font-bold ${textPrimary}`}>Edit "About Us" Page</h3>

        {/* Description Text */}
        <div>
          <label className={`block text-sm font-medium ${textMuted} mb-2`}>Description / Story</label>
          <textarea
            value={aboutData.description}
            onChange={(e) => setAboutData({ ...aboutData, description: e.target.value })}
            className={`w-full p-3 ${inputBg} border ${inputBdr} rounded-xl ${textPrimary} focus:ring-2 focus:ring-sky-500`}
            rows={6}
          />
        </div>

        {/* Image Upload */}
        <div className={`p-4 border border-dashed ${surfaceBdr} rounded-xl ${subtleBg}`}>
          <label className={`block text-sm font-medium ${textMuted} mb-2`}>Upload Profile/Team Photo</label>
          {aboutData.image_url && (
            <div className="mb-4 relative inline-block">
              <img src={aboutData.image_url} alt="Current" className="h-32 object-cover rounded-lg shadow-md" />
              <button
                type="button"
                onClick={async () => {
                  const url = aboutData.image_url;
                  if (url && url.includes('supabase.co/storage/v1/object/public/question-images/')) {
                    const fileName = url.split('question-images/')[1];
                    if (fileName) {
                      try {
                        await supabase.storage.from('question-images').remove([fileName]);
                      } catch (e) {
                        console.error("Failed to delete from storage", e);
                      }
                    }
                  }
                  const newAboutData = { ...aboutData, image_url: '' };
                  setAboutData(newAboutData);

                  try {
                    await supabase.from('about_us').upsert({ id: 1, ...newAboutData }, { onConflict: 'id' });
                    await idbSet('m_about_us', JSON.stringify(newAboutData));
                    onAboutUpdate?.(newAboutData);
                  } catch (err) {
                    console.error("Failed to update about us table", err);
                  }
                }}
                className="absolute -top-2 -right-2 bg-red-500 text-white p-1 rounded-full hover:bg-red-600 shadow-md transition-colors"
                title="Remove Image"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}
          <input
            type="file"
            accept="image/*"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;

              if (aboutData.image_url) {
                const url = aboutData.image_url;
                if (url && url.includes('supabase.co/storage/v1/object/public/question-images/')) {
                  const oldFileName = url.split('question-images/')[1];
                  if (oldFileName) {
                    try {
                      await supabase.storage.from('question-images').remove([oldFileName]);
                    } catch (err) {
                      console.error("Error removing old image", err);
                    }
                  }
                }
              }

              const fileExt = file.name.split('.').pop();
              const fileName = `about-${Date.now()}.${fileExt}`;
              const { error } = await supabase.storage.from('question-images').upload(fileName, file);

              if (!error) {
                const { data: { publicUrl } } = supabase.storage.from('question-images').getPublicUrl(fileName);
                const newAboutData = { ...aboutData, image_url: publicUrl };
                setAboutData(newAboutData);

                try {
                  await supabase.from('about_us').upsert({ id: 1, ...newAboutData }, { onConflict: 'id' });
                  await idbSet('m_about_us', JSON.stringify(newAboutData));
                  onAboutUpdate?.(newAboutData);
                  alert("Image uploaded and saved successfully!");
                } catch (err: any) {
                  console.error("Failed to save to database", err);
                  alert("Image uploaded but failed to save to database: " + err.message);
                }
              } else {
                alert("Error uploading image: " + error.message);
              }

              e.target.value = '';
            }}
            className={`block w-full text-sm ${textMuted} file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-sky-500/10 file:text-sky-500 hover:file:bg-sky-500/20`}
          />
        </div>

        {/* Privacy Policy Statement */}
        <div>
          <label className={`block text-sm font-medium ${textMuted} mb-2`}>Privacy Policy Additional Statement (Optional)</label>
          <p className={`text-xs ${textMuted} mb-2`}>This text will be injected at the top of the privacy policy HTML page.</p>
          <textarea
            value={aboutData.privacy_policy_statement || ''}
            onChange={(e) => setAboutData({ ...aboutData, privacy_policy_statement: e.target.value })}
            className={`w-full p-3 ${inputBg} border ${inputBdr} rounded-xl ${textPrimary} focus:ring-2 focus:ring-sky-500`}
            rows={4}
            placeholder="e.g. We have recently updated our policy regarding data collection..."
          />
        </div>

        {/* Social Links */}
        <div className="space-y-4">
          <h4 className={`font-bold ${textPrimary}`}>Social Media Links</h4>
          {['facebook_link', 'youtube_link', 'linkedin_link'].map((platform) => (
            <div key={platform} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
              <span className={`w-32 text-sm ${textMuted} uppercase tracking-wider font-bold`}>{platform.split('_')[0]}</span>
              <input
                type="text"
                placeholder="https://"
                value={aboutData[platform as keyof typeof aboutData] as string}
                onChange={(e) => setAboutData({ ...aboutData, [platform]: e.target.value })}
                className={`flex-1 p-3 ${inputBg} border ${inputBdr} rounded-xl ${textPrimary} focus:ring-2 focus:ring-sky-500`}
              />
            </div>
          ))}
        </div>

        {/* Save Button & Advanced Editors */}
        <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex gap-4 flex-wrap">
          <button
            onClick={async () => {
              try {
                const { error } = await supabase.from('about_us').upsert({ id: 1, ...aboutData }, { onConflict: 'id' });
                if (error) throw error;
                await idbSet('m_about_us', JSON.stringify(aboutData));
                onAboutUpdate?.(aboutData);
                alert("About Us page updated live!");
              } catch (err: any) {
                console.error("About Us Save Error:", err);
                await idbSet('m_about_us', JSON.stringify(aboutData));
                onAboutUpdate?.(aboutData);
                alert(`Supabase error: ${err.message || "Table might be missing"}\nSaved locally as fallback. Please ensure about_us.sql is run in Supabase.`);
              }
            }}
            className="px-6 py-3 bg-sky-500 hover:bg-sky-600 text-white font-bold rounded-xl shadow-lg shadow-sky-500/20 transition-all active:scale-[0.98]"
          >
            Save Changes Live
          </button>
          <button
            onClick={() => {
              if (!aboutData.full_privacy_policy_html) {
                setAboutData({ ...aboutData, full_privacy_policy_html: DEFAULT_PRIVACY_POLICY });
              }
              setShowPrivacyEditor(true);
            }}
            className="px-6 py-3 bg-indigo-500 hover:bg-indigo-600 text-white font-bold rounded-xl shadow-lg shadow-indigo-500/20 transition-all active:scale-[0.98]"
          >
            Open Full Privacy Policy Editor
          </button>
        </div>
      </div>

      {/* Full Privacy Policy Modal */}
      {showPrivacyEditor && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className={`w-full max-w-5xl h-[90vh] flex flex-col rounded-3xl overflow-hidden shadow-2xl border ${isDark ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200'}`}>
            <div className="flex justify-between items-center p-4 border-b border-slate-200 dark:border-slate-800">
              <h2 className={`text-xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>Full Privacy Policy Editor</h2>
              <button onClick={() => setShowPrivacyEditor(false)} className={`px-4 py-2 rounded-lg font-semibold ${isDark ? 'bg-slate-800 hover:bg-slate-700 text-white' : 'bg-slate-200 hover:bg-slate-300 text-slate-800'}`}>Done</button>
            </div>
            <div className={`flex-1 overflow-y-auto p-6 custom-scrollbar ${isDark ? 'bg-slate-950' : 'bg-slate-50'}`}>
              <RichTextEditor
                value={aboutData.full_privacy_policy_html || ''}
                onChange={(html) => setAboutData(prev => ({ ...prev, full_privacy_policy_html: html }))}
                placeholder="Write the full privacy policy here... Leave blank to use the default text."
                minHeight="500px"
              />
            </div>
            <div className={`p-4 border-t ${isDark ? 'border-slate-800 bg-slate-900 text-slate-400' : 'border-slate-200 bg-slate-100 text-slate-600'} text-sm font-medium`}>
              Click 'Done' above to close this dialog, and then use the <b>'Save Changes Live'</b> button on the main panel to apply your changes.
            </div>
          </div>
        </div>
      )}
    </>
  );
}
