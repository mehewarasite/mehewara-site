/** Shared theme classes passed to all admin tab components */
export interface AdminThemeClasses {
  isDark: boolean;
  pageBg: string;
  cardBg: string;
  cardBdr: string;
  surfaceBg: string;
  surfaceBdr: string;
  inputBg: string;
  inputBdr: string;
  textPrimary: string;
  textMuted: string;
  textFaint: string;
  dividerBdr: string;
  subtleBg: string;
  subtleBdr: string;
}

/** Tab identifiers used in the admin panel */
export type AdminTab = 'subjects' | 'papers' | 'add-question' | 'manage-questions' | 'edit-questions' | 'about' | 'stats' | 'gallery' | 'accounts';
