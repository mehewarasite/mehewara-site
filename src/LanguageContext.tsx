import React, { createContext, useContext, useState } from 'react';

type Language = 'si' | 'en';

interface LanguageContextType {
  language: Language;
  toggleLanguage: () => void;
  setLanguage: (lang: Language) => void;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => {
    const saved = localStorage.getItem('m_language');
    if (saved === 'en' || saved === 'si') return saved;
    return 'si'; // Default to Sinhala
  });

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem('m_language', lang);
  };

  const toggleLanguage = () => {
    setLanguage(language === 'si' ? 'en' : 'si');
  };

  return (
    <LanguageContext.Provider value={{ language, toggleLanguage, setLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}
