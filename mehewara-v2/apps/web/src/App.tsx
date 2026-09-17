import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Atom,
  FlaskConical,
  Dna,
  Cpu,
  Lightbulb,
  Infinity as InfinityIcon,
  BookOpen,
  Calculator,
  Compass,
  ChevronRight,
  ArrowLeft,
  Clock,
  BookMarked,
  Layers,
  GraduationCap,
  Sun,
  Moon,
  Banknote,
  Map as MapIcon,
  Landmark,
  Images,
  Facebook,
  Youtube,
  Linkedin
} from 'lucide-react';
import { Subject, Paper, Question, UserAttempt, GalleryPhoto } from './types';
import { INITIAL_SUBJECTS, INITIAL_PAPERS, INITIAL_QUESTIONS } from './data';
import BootLoader from './components/BootLoader';
import { useTheme } from './ThemeContext';
import { useLanguage } from './LanguageContext';
import AboutUsModal from './components/AboutUsModal';
import HeroSlideshow from './components/HeroSlideshow';
import SiteEntryGate from './components/SiteEntryGate';
import LiveCounterBadge from './components/LiveCounterBadge';

const AdminPanel = React.lazy(() => import('./components/AdminPanel'));
const AdminLogin = React.lazy(() => import('./components/AdminLogin'));
const PracticeSession = React.lazy(() => import('./components/PracticeSession'));
const PrivacyPolicyPage = React.lazy(() => import('./components/PrivacyPolicyPage'));
const GalleryPage = React.lazy(() => import('./components/GalleryPage'));
import {
  dbLoadSubjects, dbSaveSubjects, dbDeleteSubject,
  dbLoadPapers, dbSavePaper, dbDeletePaper,
  dbLoadQuestions, dbSaveQuestion, dbSaveQuestions, dbDeleteQuestion, dbDeleteQuestionsByPaper, dbLoadQuestionsForPaper,
  dbLoadStudyHtml, dbSaveStudyHtml, dbDeleteStudyHtml, dbLoadAboutUs, dbLoadGallery,
  adminLoadSubjects, adminLoadPapers, adminLoadQuestionsForPaper, adminLoadAboutUs, adminLoadGallery, adminLoadStudyHtml,
  clearPublicManifestCache, dbBuildPublication
} from './api';

import { migrateLocalStorageToIDB, idbGet, idbSet, idbRemove } from './utils/storage';

const ICON_MAP: { [key: string]: React.ComponentType<any> } = {
  Atom, FlaskConical, Dna, Cpu, Lightbulb,
  Infinity: InfinityIcon, BookOpen, Calculator, Compass,
  Banknote, Map: MapIcon, Landmark
};

const isAdminPath = (pathname: string = typeof window !== 'undefined' ? window.location.pathname : '') => {
  const clean = pathname.toLowerCase().replace(/\/+$/, '');
  return clean === '/admin';
};

const SUBJECT_COLOR_PRESETS: Record<string, string> = {
  // Science
  'sci': 'from-emerald-600 via-teal-700 to-teal-900 border-emerald-500/30 shadow-[0_4px_20px_rgba(16,185,129,0.15)]',
  'science': 'from-emerald-600 via-teal-700 to-teal-900 border-emerald-500/30 shadow-[0_4px_20px_rgba(16,185,129,0.15)]',
  // Mathematics
  'math': 'from-indigo-600 via-violet-700 to-purple-900 border-indigo-500/30 shadow-[0_4px_20px_rgba(99,102,241,0.15)]',
  'maths': 'from-indigo-600 via-violet-700 to-purple-900 border-indigo-500/30 shadow-[0_4px_20px_rgba(99,102,241,0.15)]',
  'cmaths': 'from-blue-600 via-indigo-700 to-slate-900 border-blue-500/30 shadow-[0_4px_20px_rgba(59,130,246,0.15)]',
  'combinedmaths': 'from-blue-600 via-indigo-700 to-slate-900 border-blue-500/30 shadow-[0_4px_20px_rgba(59,130,246,0.15)]',
  'combinedmathematics': 'from-blue-600 via-indigo-700 to-slate-900 border-blue-500/30 shadow-[0_4px_20px_rgba(59,130,246,0.15)]',
  'mathematics': 'from-indigo-600 via-violet-700 to-purple-900 border-indigo-500/30 shadow-[0_4px_20px_rgba(99,102,241,0.15)]',
  // Sinhala Language
  'sinhala': 'from-amber-600 via-orange-600 to-red-800 border-orange-500/30 shadow-[0_4px_20px_rgba(249,115,22,0.15)]',
  // History
  'hist': 'from-amber-700 via-amber-800 to-stone-900 border-amber-600/30 shadow-[0_4px_20px_rgba(217,119,6,0.15)]',
  'history': 'from-amber-700 via-amber-800 to-stone-900 border-amber-600/30 shadow-[0_4px_20px_rgba(217,119,6,0.15)]',
  // ICT
  'ict': 'from-purple-600 via-fuchsia-700 to-indigo-900 border-purple-500/30 shadow-[0_4px_20px_rgba(168,85,247,0.15)]',
  // Civic Education
  'civic': 'from-pink-600 via-rose-700 to-purple-950 border-rose-500/30 shadow-[0_4px_20px_rgba(244,63,94,0.15)]',
  // A/L Physics
  'phy': 'from-amber-500 via-orange-600 to-red-800 border-amber-500/30 shadow-[0_4px_20px_rgba(245,158,11,0.15)]',
  'physics': 'from-amber-500 via-orange-600 to-red-800 border-amber-500/30 shadow-[0_4px_20px_rgba(245,158,11,0.15)]',
  // A/L Chemistry
  'chem': 'from-cyan-600 via-blue-700 to-indigo-900 border-cyan-500/30 shadow-[0_4px_20px_rgba(6,182,212,0.15)]',
  'chemistry': 'from-cyan-600 via-blue-700 to-indigo-900 border-cyan-500/30 shadow-[0_4px_20px_rgba(6,182,212,0.15)]',
  // A/L Biology
  'bio': 'from-emerald-600 via-teal-700 to-teal-900 border-emerald-500/30 shadow-[0_4px_20px_rgba(16,185,129,0.15)]',
  'biology': 'from-emerald-600 via-teal-700 to-teal-900 border-emerald-500/30 shadow-[0_4px_20px_rgba(16,185,129,0.15)]',
};

const FALLBACK_PALETTES = [
  'from-emerald-600 via-teal-700 to-teal-900 border-emerald-500/30 shadow-[0_4px_20px_rgba(16,185,129,0.15)]',
  'from-indigo-600 via-violet-700 to-purple-900 border-indigo-500/30 shadow-[0_4px_20px_rgba(99,102,241,0.15)]',
  'from-amber-600 via-orange-600 to-red-800 border-orange-500/30 shadow-[0_4px_20px_rgba(249,115,22,0.15)]',
  'from-purple-600 via-fuchsia-700 to-indigo-900 border-purple-500/30 shadow-[0_4px_20px_rgba(168,85,247,0.15)]',
  'from-cyan-600 via-blue-700 to-indigo-900 border-cyan-500/30 shadow-[0_4px_20px_rgba(6,182,212,0.15)]',
  'from-pink-600 via-rose-700 to-purple-950 border-rose-500/30 shadow-[0_4px_20px_rgba(244,63,94,0.15)]',
];

function resolveSubjectColor(sub: Subject, index: number = 0): string {
  if (sub.color && sub.color.includes('from-') && !sub.color.includes('650') && !sub.color.includes('from-slate-') && !sub.color.includes('from-black')) {
    return sub.color;
  }

  const rawKeys = [sub.code, sub.id, sub.name].filter(Boolean).map(k => (k as string).toLowerCase().replace(/^(ol|al)[-_]?/, '').replace(/[^a-z0-9]/g, ''));
  for (const k of rawKeys) {
    for (const [presetKey, presetVal] of Object.entries(SUBJECT_COLOR_PRESETS)) {
      if (k === presetKey || k.includes(presetKey) || presetKey.includes(k)) {
        return presetVal;
      }
    }
  }

  return FALLBACK_PALETTES[index % FALLBACK_PALETTES.length];
}

const LEGACY_ID_TO_UUID: Record<string, string> = {
  'al-physics': 'aa2aabf6-65f9-51d0-a993-4d385208c245',
  'al-chemistry': '9115cadf-011b-508a-ba48-6ced5cb75a05',
  'al-biology': 'cf2019b1-4121-5f26-866c-dc2e992e8244',
  'al-ict': '1128871a-03d8-5251-bca3-d8b476d56e89',
  'al-combined-maths': '5329a153-b09c-597e-9e30-37f4f0339213',
  'ol-science': '2d525961-5e47-517a-9afe-27525e46dbb8',
  'ol-maths': 'd61493fa-a854-53fd-83e8-57e99c85aad5',
  'ol-sinhala': 'c3d9ea08-548a-5b9f-b434-ce6e8eb7bc31',
  'ol-history': '19e7a0fe-dc35-5d85-be49-83fc260f6b36',
  'ol-ict': 'ff68db84-2003-597e-9ac1-df665344a348',
  'ol-civic': '655b9d9a-f257-5574-8d14-24546b8152f7',
};

const canonicalSubjectId = (id?: string | null): string => {
  if (!id) return '';
  return LEGACY_ID_TO_UUID[id] || id;
};

function deduplicateAndEnrichSubjects(loaded: Subject[], defaults: Subject[], currentPapers: Paper[], deletedIds: Set<string> = new Set()): Subject[] {
  const merged: Subject[] = [];
  const seenKeys = new Map<string, number>();

  const allCandidates = loaded
    .filter(s => !deletedIds.has(s.id) && !deletedIds.has(canonicalSubjectId(s.id)))
    .map(s => ({ ...s, id: canonicalSubjectId(s.id) }));

  for (const def of defaults) {
    const defId = canonicalSubjectId(def.id);
    if (deletedIds.has(defId) || deletedIds.has(def.id)) continue;
    const normName = (def.name || '').toLowerCase().trim();
    const normCode = (def.code || '').toLowerCase().replace(/^(ol|al)[-_]?/, '').trim();

    const alreadyPresent = allCandidates.some(s => {
      const sId = canonicalSubjectId(s.id);
      const sName = (s.name || '').toLowerCase().trim();
      const sCode = (s.code || '').toLowerCase().replace(/^(ol|al)[-_]?/, '').trim();
      return (s.examType || 'ol') === (def.examType || 'ol') && (sName === normName || sCode === normCode || sId === defId);
    });

    if (!alreadyPresent) {
      allCandidates.push({ ...def, id: defId });
    }
  }

  allCandidates.forEach((s) => {
    if (!s) return;
    s.id = canonicalSubjectId(s.id);
    const normName = (s.name || '').toLowerCase().trim();
    const normCode = (s.code || '').toLowerCase().replace(/^(ol|al)[-_]?/, '').trim();
    const key = `${s.examType || 'ol'}-${normName || normCode}`;

    const enriched: Subject = {
      ...s,
      color: resolveSubjectColor(s, merged.length),
    };

    if (!seenKeys.has(key)) {
      seenKeys.set(key, merged.length);
      merged.push(enriched);
    } else {
      const existingIdx = seenKeys.get(key)!;
      const existingSub = merged[existingIdx];
      const existingPaperCount = currentPapers.filter(p => canonicalSubjectId(p.subjectId) === existingSub.id).length;
      const newPaperCount = currentPapers.filter(p => canonicalSubjectId(p.subjectId) === s.id).length;

      // Keep the one with more papers
      if (newPaperCount > existingPaperCount) {
        merged[existingIdx] = enriched;
      }
    }
  });

  return merged;
}

export default function App() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';
  const { language, toggleLanguage } = useLanguage();
  const isEn = language === 'en';

  const isDirectAdminUrl = typeof window !== 'undefined' && isAdminPath(window.location.pathname);
  const hasAdminToken = typeof window !== 'undefined' && !!localStorage.getItem('adminToken');

  const [isHumanVerified, setIsHumanVerified] = useState<boolean>(() => {
    try {
      if (hasAdminToken || import.meta.env.DEV || (typeof window !== 'undefined' && window.location.hostname.endsWith('pages.dev') && window.location.hostname !== 'mehewara-site.pages.dev')) return true;
      return sessionStorage.getItem('mhw_human_verified') === 'true';
    } catch {
      return false;
    }
  });

  const [hasBooted, setHasBooted] = useState<boolean>(() => isDirectAdminUrl);
  const [showBootOverlay, setShowBootOverlay] = useState<boolean>(() => !isDirectAdminUrl);
  const [heroOpacity, setHeroOpacity] = useState<number>(1);
  const heroRef = useRef<HTMLDivElement>(null);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [deletedSubjectIds, setDeletedSubjectIds] = useState<Set<string>>(new Set());
  const [papers, setPapers] = useState<Paper[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [attempts, setAttempts] = useState<UserAttempt[]>([]);
  const [isLoadingQuestions, setIsLoadingQuestions] = useState<boolean>(false);
  const [selectedLevel, setSelectedLevel] = useState<'ol' | 'al' | null>(null);
  const [selectedSubject, setSelectedSubject] = useState<Subject | null>(null);
  const [activePracticePaper, setActivePracticePaper] = useState<Paper | null>(null);
  const [showAdminPanel, setShowAdminPanel] = useState<boolean>(() => isDirectAdminUrl && hasAdminToken);
  const [showAdminLogin, setShowAdminLogin] = useState<boolean>(() => isDirectAdminUrl && !hasAdminToken);
  const [showAboutUs, setShowAboutUs] = useState<boolean>(false);
  const [showGallery, setShowGallery] = useState<boolean>(false);
  const [galleryPhotos, setGalleryPhotos] = useState<GalleryPhoto[]>([]);
  const [galleryLoading, setGalleryLoading] = useState<boolean>(false);
  const [aboutData, setAboutData] = useState<any>(null);
  const [activeUsersCount, setActiveUsersCount] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('mehewara_last_active_count');
      if (saved) {
        const parsed = parseInt(saved, 10);
        if (!isNaN(parsed) && parsed > 0) return parsed;
      }
    } catch {}
    return 1;
  });

  React.useEffect(() => {
    // Generate or retrieve a persistent client ID for this browser
    let clientId: string;
    try {
      clientId = localStorage.getItem('mehewara_client_id') || '';
      if (!clientId) {
        clientId = (typeof crypto !== 'undefined' && crypto.randomUUID)
          ? crypto.randomUUID()
          : `client-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        localStorage.setItem('mehewara_client_id', clientId);
      }
    } catch {
      clientId = (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : `client-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    }

    let isMounted = true;
    
    const pingLiveUsers = async () => {
      try {
        const { publicApi } = await import('./apiClient');
        const res = await publicApi.post('/live', { clientId });
        if (isMounted && res.data && typeof res.data.count === 'number') {
          setActiveUsersCount(res.data.count);
        }
      } catch (err) {
        // Silently fail if the live counter endpoint is temporarily unreachable
      }
    };

    // Initial ping
    pingLiveUsers();
    
    // Poll every 15 seconds
    const interval = setInterval(pingLiveUsers, 15000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  const [loadingPaperQuestionsId, setLoadingPaperQuestionsId] = useState<string | null>(null);

  const fetchAdminQuestions = useCallback(async () => {
    setIsSyncing(true);
    try {
      const { dbLoadQuestions } = await import('./api');
      const allQuestions = await dbLoadQuestions();
      if (allQuestions && allQuestions.length > 0) {
        setQuestions(prev => {
          const mergedMap = new Map<string, Question>();
          allQuestions.forEach(q => mergedMap.set(q.id, q));
          prev.forEach(q => mergedMap.set(q.id, q));
          const updated = Array.from(mergedMap.values());
          idbSet('m_questions', JSON.stringify(updated));
          return updated;
        });
      }
    } catch (e) {
      console.error('Failed to load admin questions:', e);
    } finally {
      setIsSyncing(false);
    }
  }, []);

  const handleEnsureQuestionsLoaded = useCallback(async (paperId: string, force = false) => {
    if (!paperId) return;
    const existing = questions.filter(q => q.paperId === paperId);
    if (!force && existing.length > 0) return;

    setLoadingPaperQuestionsId(paperId);
    try {
      const isAdminUser = Boolean(localStorage.getItem('adminToken'));
      const remoteQuestions = (showAdminPanel || isAdminUser)
        ? await adminLoadQuestionsForPaper(paperId)
        : await dbLoadQuestionsForPaper(paperId);
      if (remoteQuestions && remoteQuestions.length > 0) {
        setQuestions(prev => {
          const updated = [...prev.filter(q => q.paperId !== paperId), ...remoteQuestions];
          idbSet('m_questions', JSON.stringify(updated));
          return updated;
        });
      }
    } catch (e) {
      console.error('Failed to load questions for paper:', paperId, e);
    } finally {
      setLoadingPaperQuestionsId(null);
    }
  }, [questions, showAdminPanel]);

  // Handle Browser/Android hardware back button and routing
  useEffect(() => {
    const handlePopState = () => {
      const onAdmin = isAdminPath();
      if (!onAdmin) {
        setShowAdminPanel(false);
        setShowAdminLogin(false);
      } else {
        if (localStorage.getItem('adminToken')) {
          setShowAdminPanel(true);
          setShowAdminLogin(false);
          fetchAdminQuestions();
        } else {
          setShowAdminLogin(true);
          setShowAdminPanel(false);
        }
      }

      if (showGallery) {
        setShowGallery(false);
      } else if (showAboutUs) {
        setShowAboutUs(false);
      } else if (activePracticePaper) {
        setActivePracticePaper(null);
      } else if (selectedSubject) {
        setSelectedSubject(null);
      } else if (selectedLevel) {
        setSelectedLevel(null);
      }
    };
    const handleLogout = () => {
      const hadActiveSession = showAdminPanel;
      setShowAdminPanel(false);
      if (isAdminPath()) {
        setShowAdminLogin(true);
      }
      if (hadActiveSession) {
        alert('Session expired. Please log in again.');
      }
    };
    window.addEventListener('admin-logout', handleLogout);
    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('admin-logout', handleLogout);
    };
  }, [showGallery, showAboutUs, showAdminPanel, showAdminLogin, activePracticePaper, selectedSubject, selectedLevel, fetchAdminQuestions]);

  const handleSetLevel = (level: 'ol' | 'al') => {
    window.history.pushState({ layer: true }, '', '');
    setSelectedLevel(level);
  };
  const handleSetSubject = (sub: Subject) => {
    window.history.pushState({ layer: true }, '', '');
    setSelectedSubject(sub);
  };
  const handleSetPracticePaper = async (paper: Paper) => {
    window.history.pushState({ layer: true }, '', '');

    const paperQuestions = questions.filter(q => q.paperId === paper.id);
    const expectedCount = paper.questionCount || 0;

    if (paperQuestions.length === 0 || (expectedCount > 0 && paperQuestions.length < expectedCount)) {
      setIsLoadingQuestions(true);
      const remoteQuestions = await dbLoadQuestionsForPaper(paper.id);
      if (remoteQuestions && remoteQuestions.length > 0) {
        setQuestions(prev => {
          const updated = [...prev.filter(q => q.paperId !== paper.id), ...remoteQuestions];
          idbSet('m_questions', JSON.stringify(updated));
          return updated;
        });
      }
      setIsLoadingQuestions(false);
    }

    setActivePracticePaper(paper);
  };

  const handleAdminLoginSuccess = () => {
    setShowAdminLogin(false);
    setShowAdminPanel(true);
    setIsHumanVerified(true);
    sessionStorage.setItem('mhw_human_verified', 'true');
    syncFromApi();
    fetchAdminQuestions();
  };

  const handleCancelAdminLogin = () => {
    setShowAdminLogin(false);
    setShowAdminPanel(false);
    if (isAdminPath()) {
      window.history.pushState(null, '', '/');
    }
  };

  const handleCloseAdminPanel = () => {
    setShowAdminPanel(false);
    setShowAdminLogin(false);
    if (isAdminPath()) {
      window.history.pushState(null, '', '/');
    } else {
      window.history.back();
    }
  };
  const handleOpenAboutUs = () => {
    window.history.pushState({ layer: true }, '', '');
    setShowAboutUs(true);
  };

  const handleOpenGallery = async () => {
    window.history.pushState({ layer: true }, '', '');
    setShowGallery(true);
    if (galleryPhotos.length === 0) {
      setGalleryLoading(true);
      const photos = await dbLoadGallery();
      if (photos) setGalleryPhotos(photos);
      setGalleryLoading(false);
    }
  };

  const loadFromLocal = async () => {
    try {
      const storedPapers = await idbGet('m_papers');
      const parsedPapers: Paper[] = storedPapers
        ? JSON.parse(storedPapers).map((p: Paper) => ({ ...p, subjectId: canonicalSubjectId(p.subjectId) }))
        : INITIAL_PAPERS;
      if (storedPapers) {
        setPapers(parsedPapers);
      } else {
        setPapers(INITIAL_PAPERS);
      }

      const storedDeleted = await idbGet('m_deleted_subjects');
      const loadedDeletedIds = new Set<string>(storedDeleted ? JSON.parse(storedDeleted) : []);
      setDeletedSubjectIds(loadedDeletedIds);

      const storedSubjects = await idbGet('m_subjects');
      let rawSubjects: Subject[] = [];
      if (storedSubjects) {
        rawSubjects = JSON.parse(storedSubjects).map((s: Subject) => ({ ...s, id: canonicalSubjectId(s.id) }));
      } else {
        rawSubjects = [...INITIAL_SUBJECTS];
      }

      const deduplicated = deduplicateAndEnrichSubjects(rawSubjects, INITIAL_SUBJECTS, parsedPapers, loadedDeletedIds);
      setSubjects(deduplicated);
      idbSet('m_subjects', JSON.stringify(deduplicated));

      const storedQuestions = await idbGet('m_questions');
      if (storedQuestions) {
        setQuestions(JSON.parse(storedQuestions));
      } else {
        setQuestions(INITIAL_QUESTIONS);
      }

      const localAbout = await idbGet('m_about_us');
      if (localAbout) setAboutData(JSON.parse(localAbout));

      const storedGallery = await idbGet('m_gallery');
      if (storedGallery) {
        setGalleryPhotos(JSON.parse(storedGallery));
      }
    } catch (err) {
      console.error('Local load failed:', err);
    }
  };

  // Reusable sync function — pulls latest data from API
  const syncFromApi = async () => {
    setIsSyncing(true);
    clearPublicManifestCache();
    try {
      const onAdmin = isAdminPath() || showAdminPanel || showAdminLogin;
      const isAdminView = showAdminPanel || Boolean(localStorage.getItem('adminToken') && isAdminPath());
      const [remoteSubjects, remotePapers, remoteQuestions, remoteAbout, remoteGallery] = await Promise.all([
        isAdminView ? adminLoadSubjects() : onAdmin ? Promise.resolve([]) : dbLoadSubjects(),
        isAdminView ? adminLoadPapers() : onAdmin ? Promise.resolve([]) : dbLoadPapers(),
        isAdminView || onAdmin ? Promise.resolve([]) : dbLoadQuestions(),
        isAdminView ? adminLoadAboutUs() : onAdmin ? Promise.resolve(null) : dbLoadAboutUs(),
        isAdminView ? adminLoadGallery() : onAdmin ? Promise.resolve([]) : dbLoadGallery(),
      ]);

      if (remoteGallery) {
        setGalleryPhotos(remoteGallery);
        idbSet('m_gallery', JSON.stringify(remoteGallery));
      }

      if (remoteQuestions && remoteQuestions.length > 0) {
        setQuestions(prev => {
          const mergedMap = new Map<string, Question>();
          remoteQuestions.forEach(q => mergedMap.set(q.id, q));
          prev.forEach(q => mergedMap.set(q.id, q));
          const updated = Array.from(mergedMap.values());
          idbSet('m_questions', JSON.stringify(updated));
          return updated;
        });
      }

      if (remoteSubjects && remoteSubjects.length > 0) {
        const deduplicated = deduplicateAndEnrichSubjects(remoteSubjects, INITIAL_SUBJECTS, remotePapers || papers, deletedSubjectIds);
        setSubjects(deduplicated);
        idbSet('m_subjects', JSON.stringify(deduplicated));
      }

      if (remotePapers) {
        setPapers(remotePapers);
        idbSet('m_papers', JSON.stringify(remotePapers.map(p => ({ ...p, studyMaterialHtml: undefined }))));
      }

      if (remoteAbout) {
        setAboutData(remoteAbout);
        idbSet('m_about_us', JSON.stringify(remoteAbout));
      }
    } catch (err) {
      console.error('API load failed:', err);
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    const init = async () => {
      await migrateLocalStorageToIDB();
      // Attempts are always local (per-user)
      const storedAttempts = await idbGet('m_attempts');
      if (storedAttempts) { setAttempts(JSON.parse(storedAttempts)); }

      // Load local data instantly
      await loadFromLocal();

      // Sync from API in background
      syncFromApi();
      if (isDirectAdminUrl && hasAdminToken) {
        fetchAdminQuestions();
      }
    };
    init();
  }, []);

  // Scroll-based fade-out for the hero background photo
  const handleHeroScroll = useCallback(() => {
    if (!heroRef.current) return;
    const scrollTop = window.scrollY || document.documentElement.scrollTop;
    const fadeDistance = window.innerHeight * 0.6; // fade fully over 60% of viewport
    const opacity = Math.max(0, 1 - scrollTop / fadeDistance);
    setHeroOpacity(opacity);
  }, []);

  useEffect(() => {
    if (hasBooted && selectedLevel === null) {
      window.addEventListener('scroll', handleHeroScroll, { passive: true });
      handleHeroScroll(); // set initial state
      return () => window.removeEventListener('scroll', handleHeroScroll);
    }
  }, [hasBooted, selectedLevel, handleHeroScroll]);

  const handleSaveAttempt = (newAttempt: UserAttempt) => {
    const updatedAttempts = [...attempts.filter(a => a.paperId !== newAttempt.paperId), newAttempt];
    setAttempts(updatedAttempts);
    idbSet('m_attempts', JSON.stringify(updatedAttempts));
  };

  const handleAddSubject = async (newSubject: Subject) => {
    const updatedSubjects = [...subjects, newSubject];
    setSubjects(updatedSubjects);
    idbSet('m_subjects', JSON.stringify(updatedSubjects));
    await dbSaveSubjects([newSubject]);
    dbBuildPublication().catch(() => {});
  };

  const handleUpdateSubject = async (updatedSubject: Subject) => {
    const newSubjects = subjects.map(s => s.id === updatedSubject.id ? updatedSubject : s);
    setSubjects(newSubjects);
    idbSet('m_subjects', JSON.stringify(newSubjects));
    await dbSaveSubjects([updatedSubject]);
    dbBuildPublication().catch(() => {});
  };

  const handleDeleteSubject = async (subjectId: string) => {
    const subjectPapers = papers.filter(p => p.subjectId === subjectId || canonicalSubjectId(p.subjectId) === subjectId);
    if (subjectPapers.length > 0) {
      const ok = confirm(`This subject has ${subjectPapers.length} paper(s) associated with it. Deleting this subject will also remove its papers and questions. Proceed?`);
      if (!ok) return;
    }

    // Update local state immediately
    const newSubjects = subjects.filter(s => s.id !== subjectId && canonicalSubjectId(s.id) !== subjectId);
    setSubjects(newSubjects);
    idbSet('m_subjects', JSON.stringify(newSubjects));

    // Remove associated papers and questions from local state
    if (subjectPapers.length > 0) {
      const newPapers = papers.filter(p => p.subjectId !== subjectId && canonicalSubjectId(p.subjectId) !== subjectId);
      setPapers(newPapers);
      idbSet('m_papers', JSON.stringify(newPapers.map(p => ({ ...p, studyMaterialHtml: undefined }))));

      const paperIdSet = new Set(subjectPapers.map(p => p.id));
      const newQuestions = questions.filter(q => !paperIdSet.has(q.paperId));
      setQuestions(newQuestions);
      idbSet('m_questions', JSON.stringify(newQuestions));
    }

    // Track as deleted so defaults never resurrect it
    setDeletedSubjectIds(prev => {
      const next = new Set(prev);
      next.add(subjectId);
      const canonical = canonicalSubjectId(subjectId);
      if (canonical) next.add(canonical);
      idbSet('m_deleted_subjects', JSON.stringify(Array.from(next)));
      return next;
    });

    if (selectedSubject?.id === subjectId) {
      setSelectedSubject(null);
    }

    try {
      await dbDeleteSubject(subjectId);
    } catch (err) {
      console.error("Failed to delete subject from backend:", err);
      alert("Failed to delete subject from the backend. Check console for details.");
    }
    dbBuildPublication().catch(() => {});
  };

  const handleUpdatePaper = async (updatedPaper: Paper) => {
    // Update local state immediately for responsive UI
    const newPapers = papers.map(p => p.id === updatedPaper.id ? updatedPaper : p);
    setPapers(newPapers);
    idbSet('m_papers', JSON.stringify(newPapers.map(p => ({ ...p, studyMaterialHtml: undefined }))));

    // Persist paper to API
    await dbSavePaper(updatedPaper);
    dbBuildPublication().catch(() => {});
  };

  const handleAddPaper = async (newPaper: Paper, importQuestions?: Question[]) => {
    const qCount = importQuestions?.length ?? 0;
    const paperWithCount = { ...newPaper, questionCount: qCount };

    // Update local state immediately for responsive UI
    const updatedPapers = [paperWithCount, ...papers];
    setPapers(updatedPapers);
    idbSet('m_papers', JSON.stringify(updatedPapers.map(p => ({ ...p, studyMaterialHtml: undefined }))));

    if (importQuestions && importQuestions.length > 0) {
      const updatedQuestions = [...questions, ...importQuestions];
      setQuestions(updatedQuestions);
      idbSet('m_questions', JSON.stringify(updatedQuestions));
    }

    // Persist paper to API (without studyMaterialHtml — stored separately)
    const saved = await dbSavePaper(paperWithCount, true);
    if (saved?.subjectId && saved.subjectId !== paperWithCount.subjectId) {
      paperWithCount.subjectId = saved.subjectId;
      setPapers(prev => prev.map(p => p.id === paperWithCount.id ? paperWithCount : p));
      idbSet('m_papers', JSON.stringify(updatedPapers.map(p => p.id === paperWithCount.id ? { ...paperWithCount, studyMaterialHtml: undefined } : { ...p, studyMaterialHtml: undefined })));
    }

    // Persist study HTML to API if present
    if (newPaper.studyMaterialHtml) {
      await dbSaveStudyHtml(newPaper.id, newPaper.studyMaterialHtml);
      // Also keep in localStorage as offline cache
      try { idbSet(`m_study_${newPaper.id}`, newPaper.studyMaterialHtml); } catch { }
    }

    // Persist questions to API
    if (importQuestions && importQuestions.length > 0) {
      await dbSaveQuestions(importQuestions, undefined, true);
    }

    // Automatically build Backblaze B2 publication snapshot so all devices see the new paper immediately
    dbBuildPublication().catch(() => {});
  };

  const handleLoadStudyMaterial = async (paperId: string) => {
    const paper = papers.find(p => p.id === paperId);
    // Skip if we already have real content loaded
    if (paper?.studyMaterialHtml) return;

    let html = await idbGet(`m_study_${paperId}`);
    if (!html) {
      const isAdminView = showAdminPanel || Boolean(localStorage.getItem('adminToken') && isAdminPath());
      const dbHtml = isAdminView ? await adminLoadStudyHtml(paperId) : await dbLoadStudyHtml(paperId);
      if (dbHtml) {
        html = dbHtml;
        try { await idbSet(`m_study_${paperId}`, dbHtml); } catch { }
      }
    }

    if (html) {
      setPapers(prev => prev.map(p => p.id === paperId ? { ...p, studyMaterialHtml: html } : p));
    }
  };

  const handleDeletePaper = async (paperId: string) => {
    // Update local state immediately
    const updatedPapers = papers.filter(p => p.id !== paperId);
    setPapers(updatedPapers);
    idbSet('m_papers', JSON.stringify(updatedPapers.map(p => ({ ...p, studyMaterialHtml: undefined }))));
    const updatedQuestions = questions.filter(q => q.paperId !== paperId);
    setQuestions(updatedQuestions);
    idbSet('m_questions', JSON.stringify(updatedQuestions));
    const updatedAttempts = attempts.filter(a => a.paperId !== paperId);
    setAttempts(updatedAttempts);
    idbSet('m_attempts', JSON.stringify(updatedAttempts));
    idbRemove(`m_study_${paperId}`);

    // Delete questions and study materials from API first, then delete the paper
    try {
      await dbDeleteQuestionsByPaper(paperId);
    } catch (e) {
      console.warn("Failed to delete paper questions:", e);
    }
    try {
      await dbDeleteStudyHtml(paperId);
    } catch (e) {
      console.warn("Failed to delete study material:", e);
    }
    try {
      await dbDeletePaper(paperId);
    } catch (e) {
      console.error("Failed to delete paper from API:", e);
    }
    dbBuildPublication().catch(() => {});
  };

  const handleAddQuestion = async (newQuestion: Question) => {
    // Shift existing questions in the same paper whose qNumber >= newQuestion.qNumber
    const samePaperQuestions = questions.filter(q => q.paperId === newQuestion.paperId && q.id !== newQuestion.id);
    const hasConflict = samePaperQuestions.some(q => q.qNumber >= newQuestion.qNumber);

    let shiftedQuestions: Question[] = [];
    let updatedQuestions: Question[];

    if (hasConflict) {
      // Increment qNumber for all questions at or after the inserted position
      shiftedQuestions = samePaperQuestions
        .filter(q => q.qNumber >= newQuestion.qNumber)
        .map(q => ({ ...q, qNumber: q.qNumber + 1 }));

      const shiftedIds = new Set(shiftedQuestions.map(q => q.id));
      updatedQuestions = [
        ...questions.filter(q => q.id !== newQuestion.id && !shiftedIds.has(q.id)),
        ...shiftedQuestions,
        newQuestion,
      ];
    } else {
      updatedQuestions = [...questions.filter(q => q.id !== newQuestion.id), newQuestion];
    }

    setQuestions(updatedQuestions);
    idbSet('m_questions', JSON.stringify(updatedQuestions));

    // Update paper question count
    const paper = papers.find(p => p.id === newQuestion.paperId);
    if (paper) {
      const qCount = updatedQuestions.filter(q => q.paperId === newQuestion.paperId).length;
      const updatedPapers = papers.map(p => p.id === paper.id ? { ...p, questionCount: qCount } : p);
      setPapers(updatedPapers);
      idbSet('m_papers', JSON.stringify(updatedPapers.map(p => ({ ...p, studyMaterialHtml: undefined }))));
      await dbSavePaper({ ...paper, questionCount: qCount });
    }

    // Persist the new question and any shifted questions to API
    await dbSaveQuestion(newQuestion);
    if (shiftedQuestions.length > 0) {
      await dbSaveQuestions(shiftedQuestions);
    }
    dbBuildPublication().catch(() => {});
  };

  const handleUpdateQuestion = async (updatedQuestion: Question) => {
    const newQuestions = questions.map(q => q.id === updatedQuestion.id ? updatedQuestion : q);
    setQuestions(newQuestions);
    idbSet('m_questions', JSON.stringify(newQuestions));
    await dbSaveQuestion(updatedQuestion);
    dbBuildPublication().catch(() => {});
  };

  const handleDeleteQuestion = async (questionId: string) => {
    const questionToDelete = questions.find(q => q.id === questionId);
    const updatedQuestions = questions.filter(q => q.id !== questionId);
    setQuestions(updatedQuestions);
    idbSet('m_questions', JSON.stringify(updatedQuestions));

    if (questionToDelete) {
      const paperId = questionToDelete.paperId;
      const qCount = updatedQuestions.filter(q => q.paperId === paperId).length;
      const updatedPapers = papers.map(p => p.id === paperId ? { ...p, questionCount: qCount } : p);
      setPapers(updatedPapers);
      idbSet('m_papers', JSON.stringify(updatedPapers.map(p => ({ ...p, studyMaterialHtml: undefined }))));
      const paper = papers.find(p => p.id === paperId);
      if (paper) await dbSavePaper({ ...paper, questionCount: qCount });
    }

    await dbDeleteQuestion(questionId);
    dbBuildPublication().catch(() => {});
  };

  const handleUpdateStudyHtml = async (paperId: string, html: string) => {
    // Save to API
    await dbSaveStudyHtml(paperId, html);
    // Update local state so it shows immediately without reload
    setPapers(prev => prev.map(p =>
      p.id === paperId ? { ...p, studyMaterialHtml: html } : p
    ));
    // Cache locally too
    try { idbSet(`m_study_${paperId}`, html); } catch { }
    dbBuildPublication().catch(() => {});
  };

  const handleResetToDefaults = async () => {
    if (confirm('Do you want to reset the database to default values? This will delete all custom papers and questions from ALL devices.')) {
      setIsSyncing(true);
      try {
        // Delete all current data from API then reseed
        await Promise.all(
          papers.map(p => Promise.all([
            dbDeletePaper(p.id),
            dbDeleteStudyHtml(p.id),
            dbDeleteQuestionsByPaper(p.id),
          ]))
        );
        await Promise.all([
          dbSaveSubjects(INITIAL_SUBJECTS),
          ...INITIAL_PAPERS.map(p => dbSavePaper(p)),
          dbSaveQuestions(INITIAL_QUESTIONS),
        ]);
        setSubjects(INITIAL_SUBJECTS);
        setPapers(INITIAL_PAPERS);
        setQuestions(INITIAL_QUESTIONS);
        setAttempts([]);
        idbSet('m_attempts', JSON.stringify([]));
        alert('System reset successful!');
      } catch (err) {
        alert('Reset failed: ' + err);
      } finally {
        setIsSyncing(false);
      }
    }
  };


  const handleExportData = async () => {
    // Collect all study HTML from IDB
    const studyHtmlMap: Record<string, string> = {};
    for (const p of papers) {
      const html = await idbGet(`m_study_${p.id}`);
      if (html) studyHtmlMap[p.id] = html;
    }

    const backup = {
      version: 1,
      exportedAt: new Date().toISOString(),
      subjects,
      papers: papers.map(p => ({ ...p, studyMaterialHtml: undefined })),
      questions,
      studyHtmlMap,
    };

    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mehewara-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportData = (file: File) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        let rawContent = (e.target?.result as string || '').trim();
        if (rawContent.charCodeAt(0) === 0xFEFF) {
          rawContent = rawContent.slice(1);
        }
        const backup = JSON.parse(rawContent);

        // Extract papers, questions, subjects, and study materials from any JSON format
        let importedPapers: Paper[] = [];
        let importedQuestions: Question[] = [];
        let importedSubjects: Subject[] = [];
        let studyHtmlMap: Record<string, string> = {};

        const isUuid = (id?: string | null) =>
          !!id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

        if (backup.papers && Array.isArray(backup.papers)) {
          importedPapers = backup.papers;
        } else if (backup.paper && typeof backup.paper === 'object') {
          importedPapers = [backup.paper];
        } else if (!Array.isArray(backup) && (backup.title || backup.name) && !backup.questions) {
          importedPapers = [backup];
        }

        if (backup.questions && Array.isArray(backup.questions)) {
          importedQuestions = backup.questions;
        } else if (Array.isArray(backup)) {
          importedQuestions = backup;
        } else if (backup.paper?.questions && Array.isArray(backup.paper.questions)) {
          importedQuestions = backup.paper.questions;
        }

        // If JSON is a single paper object with embedded questions: { title: "...", questions: [...] }
        if (importedPapers.length === 0 && !Array.isArray(backup) && (backup.title || backup.name) && importedQuestions.length > 0) {
          importedPapers = [{
            id: backup.id || crypto.randomUUID(),
            title: backup.title || backup.name || 'Paper',
            sinhalaTitle: backup.sinhalaTitle || backup.title || backup.name || 'Paper',
            subjectId: backup.subjectId || subjects[0]?.id || '',
            examType: backup.examType || 'al',
            year: Number(backup.year) || new Date().getFullYear(),
            durationMinutes: Number(backup.durationMinutes) || 120,
            questionCount: importedQuestions.length,
            language: backup.language || 'si'
          }];
        }

        if (backup.subjects && Array.isArray(backup.subjects)) {
          importedSubjects = backup.subjects.filter((s: Subject) => s.id !== 'al-combined-maths');
        }

        if (backup.studyHtmlMap && typeof backup.studyHtmlMap === 'object') {
          studyHtmlMap = { ...backup.studyHtmlMap };
        } else if (Array.isArray(backup.studyHtml)) {
          backup.studyHtml.forEach((item: any) => {
            if (item.paperId && item.html) {
              studyHtmlMap[item.paperId] = item.html;
            }
          });
        }

        if (importedPapers.length === 0 && importedQuestions.length === 0) {
          alert('Invalid JSON file. No papers or questions found.');
          return;
        }

        // If there are questions but NO papers, auto-generate a parent container paper
        if (importedPapers.length === 0 && importedQuestions.length > 0) {
          const generatedPaperId = crypto.randomUUID();
          const baseName = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]+/g, ' ').trim() || 'Imported Paper';
          const defaultSubject = subjects[0]?.id || crypto.randomUUID();
          importedPapers = [{
            id: generatedPaperId,
            subjectId: defaultSubject,
            examType: 'al',
            title: baseName,
            sinhalaTitle: baseName,
            year: new Date().getFullYear(),
            durationMinutes: 120,
            questionCount: importedQuestions.length,
            language: 'si'
          }];
        }

        // Remap legacy IDs to RFC 4122 UUIDs so Cloudflare D1 accepts them
        const paperIdMap = new Map<string, string>();
        importedPapers.forEach((p: Paper) => {
          if (!isUuid(p.id)) {
            const newId = crypto.randomUUID();
            paperIdMap.set(p.id, newId);
            p.id = newId;
          }
          if (p.examType) {
            p.examType = (p.examType.toLowerCase().includes('ol') ? 'ol' : 'al') as 'ol' | 'al';
          } else {
            p.examType = 'al';
          }
          if (typeof p.title === 'object' && p.title !== null) {
            p.title = (p.title as any).en || (p.title as any).si || 'Paper';
          }
          if (typeof p.sinhalaTitle === 'object' && p.sinhalaTitle !== null) {
            p.sinhalaTitle = (p.sinhalaTitle as any).si || (p.sinhalaTitle as any).en || p.title;
          }
          // Validate subjectId exists in subjects list or initial subjects, without wiping valid subject selections
          const matched = subjects.find(s => s.id === p.subjectId || s.code === p.subjectId || s.name.toLowerCase() === String(p.subjectId).toLowerCase())
            || INITIAL_SUBJECTS.find(s => s.id === p.subjectId || s.code === p.subjectId || s.name.toLowerCase() === String(p.subjectId).toLowerCase());
          if (matched) {
            p.subjectId = matched.id;
          } else if (!p.subjectId && subjects[0]?.id) {
            p.subjectId = subjects[0].id;
          }
        });

        // Remap questions and normalize options
        importedQuestions.forEach((q: any) => {
          if (!isUuid(q.id)) {
            q.id = crypto.randomUUID();
          }
          if (paperIdMap.has(q.paperId)) {
            q.paperId = paperIdMap.get(q.paperId)!;
          } else if (!isUuid(q.paperId) || (!importedPapers.some(p => p.id === q.paperId) && !papers.some(p => p.id === q.paperId))) {
            q.paperId = importedPapers[0]?.id || papers[0]?.id || crypto.randomUUID();
          }
          if (!q.questionHtml && q.question) q.questionHtml = `<p>${q.question}</p>`;
          if (!q.optionsHtml && q.options) {
            q.optionsHtml = q.options.map((o: any) => typeof o === 'string' ? o : (o.text || o.html || ''));
          }
          if (!Array.isArray(q.optionsHtml)) {
            q.optionsHtml = [];
          }
          while (q.optionsHtml.length < 4) {
            q.optionsHtml.push(`Option ${q.optionsHtml.length + 1}`);
          }
          if (q.optionsHtml.length > 5) {
            q.optionsHtml = q.optionsHtml.slice(0, 5);
          }
          if (q.correctOption === undefined && q.correct_option_index !== undefined) {
            q.correctOption = q.correct_option_index;
          }
          if (!q.correctOptions || q.correctOptions.length === 0) {
            q.correctOptions = [q.correctOption ?? 0];
          }
        });

        // Group questions by paperId and ensure strictly unique sequential question numbers 1..N
        const questionsByPaper = new Map<string, any[]>();
        importedQuestions.forEach(q => {
          const pId = q.paperId;
          const list = questionsByPaper.get(pId) || [];
          list.push(q);
          questionsByPaper.set(pId, list);
        });

        questionsByPaper.forEach((paperQs) => {
          paperQs.sort((a, b) => (Number(a.qNumber || a.number) || 0) - (Number(b.qNumber || b.number) || 0));
          paperQs.forEach((q, idx) => {
            q.qNumber = idx + 1;
            q.number = idx + 1;
          });
        });

        // Remap study materials
        if (paperIdMap.size > 0) {
          const remappedStudy: Record<string, string> = {};
          for (const [k, v] of Object.entries(studyHtmlMap)) {
            remappedStudy[paperIdMap.get(k) || k] = v;
          }
          studyHtmlMap = remappedStudy;
        }

        // Rehydrate papers with study HTML & actual question counts
        const rehydratedPapers = importedPapers.map((p: Paper) => ({
          ...p,
          questionCount: importedQuestions.filter(q => q.paperId === p.id).length || p.questionCount,
          studyMaterialHtml: studyHtmlMap[p.id] ?? p.studyMaterialHtml ?? undefined,
        }));

        // 1. Update local cache
        if (importedSubjects.length > 0) {
          setSubjects(importedSubjects);
          idbSet('m_subjects', JSON.stringify(importedSubjects));
        }

        if (rehydratedPapers.length > 0) {
          rehydratedPapers.forEach(p => {
            if (p.studyMaterialHtml) {
              try { idbSet(`m_study_${p.id}`, p.studyMaterialHtml); } catch { }
            }
          });
          const mergedPapers = [
            ...rehydratedPapers,
            ...papers.filter(p => !rehydratedPapers.some(rp => rp.id === p.id))
          ];
          setPapers(mergedPapers);
          idbSet('m_papers', JSON.stringify(mergedPapers.map(p => ({ ...p, studyMaterialHtml: undefined }))));
        }

        if (importedQuestions.length > 0) {
          const mergedQuestions = [
            ...importedQuestions,
            ...questions.filter(q => !importedQuestions.some(iq => iq.id === q.id))
          ];
          setQuestions(mergedQuestions);
          idbSet('m_questions', JSON.stringify(mergedQuestions));
        }

        // 2. Automatically upload to Cloudflare D1 & Backblaze B2 Snapshot
        const hasAdmin = Boolean(localStorage.getItem('adminToken'));
        if (hasAdmin) {
          setIsSyncing(true);
          try {
            if (importedSubjects.length > 0) {
              await dbSaveSubjects(importedSubjects);
            }
            for (const p of rehydratedPapers) {
              const saved = await dbSavePaper(p);
              if (saved?.subjectId && saved.subjectId !== p.subjectId) {
                p.subjectId = saved.subjectId;
              }
              if (p.studyMaterialHtml) {
                await dbSaveStudyHtml(p.id, p.studyMaterialHtml);
              }
            }
            if (importedQuestions.length > 0) {
              await dbSaveQuestions(importedQuestions, undefined, true);
            }
            // Auto-build snapshot to Backblaze B2
            await dbBuildPublication();
            clearPublicManifestCache();
            alert(`JSON uploaded to cloud successfully! ${rehydratedPapers.length} paper(s) and ${importedQuestions.length} question(s) are now live and accessible worldwide on all devices.`);
          } catch (cloudErr: any) {
            console.error('Cloud upload error:', cloudErr);
            alert(`Saved locally, but cloud upload encountered an issue: ${cloudErr.response?.data?.error?.message || cloudErr.message || 'Unknown error'}`);
          } finally {
            setIsSyncing(false);
          }
        } else {
          setShowAdminLogin(true);
          alert(`Saved locally! To sync this data to the Cloudflare D1 database and publish to the cloud, please log in as Admin.`);
        }
      } catch (err: any) {
        console.error('Failed to parse JSON file:', err);
        alert('Failed to parse JSON file. Make sure it contains valid JSON.');
      }
    };
    reader.readAsText(file);
  };

  if (window.location.pathname === '/privacy-policy' || window.location.pathname === '/privacy-policy.html') {
    return (
      <React.Suspense fallback={<div className="flex h-screen items-center justify-center bg-slate-950 text-sky-500">Loading Privacy Policy...</div>}>
        <PrivacyPolicyPage />
      </React.Suspense>
    );
  }

  const handleBootComplete = useCallback(() => {
    setHasBooted(true);
    // Keep the overlay mounted briefly so the zoom-through CSS transition finishes visually
    setTimeout(() => setShowBootOverlay(false), 200);
  }, []);

  // Shared class shortcuts based on theme
  const pageBg = isDark ? 'bg-[#030304]' : 'bg-[#f0f4f8]';
  const headerBg = isDark ? 'bg-[#030304]/40' : 'bg-[#f0f4f8]/40';
  const headerBdr = isDark ? 'border-white/5' : 'border-white/30';
  const cardBg = isDark ? 'bg-gradient-to-br from-slate-900/40 to-slate-950/40 backdrop-blur-2xl shadow-[0_8px_32px_rgba(0,0,0,0.4)] border-white/[0.05]' : 'bg-gradient-to-br from-white/60 to-white/30 backdrop-blur-2xl shadow-[0_8px_32px_rgba(0,0,0,0.08)] border-white/60';
  const cardHover = isDark ? 'hover:bg-slate-950/50' : 'hover:bg-white/60';
  const cardBdr = isDark ? 'border-white/5' : 'border-white/40';
  const surfaceBg = isDark ? 'bg-slate-950/40 backdrop-blur-lg' : 'bg-white/50 backdrop-blur-lg shadow-sm';
  const surfaceBdr = isDark ? 'border-white/5' : 'border-white/40';
  const textPrimary = isDark ? 'text-white' : 'text-slate-900';
  const textMuted = isDark ? 'text-slate-400' : 'text-slate-500';
  const textFaint = isDark ? 'text-slate-500' : 'text-slate-400';
  const dividerBdr = isDark ? 'border-white/5' : 'border-slate-200/50';
  const backBtn = isDark ? 'bg-slate-950/40 backdrop-blur-lg border-white/5' : 'bg-white/50 backdrop-blur-lg border-white/40 shadow-sm';
  const paperCard = isDark ? 'bg-slate-950/20 backdrop-blur-lg hover:bg-slate-950/40 border-white/5 shadow-md' : 'bg-white/40 backdrop-blur-lg hover:bg-white/60 border-white/40 shadow-sm';
  const infoPanel = isDark ? 'bg-slate-950/30 backdrop-blur-xl border-white/5 shadow-md' : 'bg-white/40 backdrop-blur-xl border-white/40 shadow-sm';
  const statBox = isDark ? 'bg-slate-900/30 backdrop-blur-md border-white/5' : 'bg-slate-50/50 backdrop-blur-md border-white/30';
  const paperDivider = isDark ? 'border-white/5' : 'border-white/30';


  return (
    <div className={`relative w-full min-h-screen min-h-[100dvh] ${pageBg} flex flex-col selection:bg-sky-500 selection:text-white`}>

      {/* GLOWING HEADER ACCENT */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-[800px] h-32 bg-sky-500/5 blur-3xl rounded-full pointer-events-none" />

      {/* GLOBAL SITE TOP HEAD BAR */}
      <header
        className={`sticky top-0 z-30 ${headerBg} backdrop-blur-md border-b ${headerBdr} px-3 sm:px-4 md:px-8 py-3 sm:py-4 safe-top ${activePracticePaper ? 'hidden md:block' : ''
          }`}
        style={{ opacity: showBootOverlay ? 0 : 1, pointerEvents: showBootOverlay ? 'none' : 'auto', transition: 'opacity 1s ease-in-out' }}
      >
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-2 mt-[5px] mb-[5px]">

          <div
            onClick={() => { setSelectedLevel(null); setSelectedSubject(null); setActivePracticePaper(null); }}
            className="flex items-center gap-2.5 sm:gap-3 cursor-pointer group select-none min-w-0"
          >
            <img
              src="/image/efac.png"
              alt="Home"
              className="w-9 h-9 sm:w-10 sm:h-10 shrink-0 sm:group-hover:scale-105 transition-all object-contain"
            />
            <div className="min-w-0">
              <span className={`text-lg sm:text-xl md:text-2xl font-extrabold tracking-wide font-display ${isDark ? 'text-white' : 'text-slate-900'}`}>
                මෙහෙවර
              </span>
              <p className={`hidden sm:block text-[9px] font-mono tracking-widest ${textFaint} uppercase opacity-90`}>MEHEWARA PAST PAPERS</p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* SYNC INDICATOR */}
            {isSyncing && (
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-sky-500/10 border border-sky-500/20">
                <svg className="w-3 h-3 text-sky-400 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
                <span className="text-[10px] font-semibold text-sky-400 hidden sm:inline">Syncing</span>
              </div>
            )}

            {/* LIVE USER COUNTER (Admins Only) */}
            {Boolean(hasAdminToken || showAdminPanel) && (
              <LiveCounterBadge count={activeUsersCount} variant="header" />
            )}

            {/* THEME TOGGLE BUTTON */}
            <button
              onClick={toggleTheme}
              aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
              className={`flex items-center justify-center min-h-[44px] min-w-[44px] px-3 py-2 ${surfaceBg} hover:bg-slate-100 dark:hover:bg-slate-800 ${surfaceBdr} border ${textMuted} hover:text-sky-400 rounded-xl transition-all shadow-sm cursor-pointer select-none`}
              title={isDark ? 'Light mode' : 'Dark mode'}
            >
              {isDark
                ? <Sun className="w-4 h-4" />
                : <Moon className="w-4 h-4" />
              }
            </button>

            {/* LANGUAGE TOGGLE BUTTON */}
            {selectedLevel === null && (
              <button
                onClick={toggleLanguage}
                aria-label="Toggle language"
                className={`flex items-center justify-center min-h-[44px] min-w-[44px] px-3 py-2 ${surfaceBg} hover:bg-slate-100 dark:hover:bg-slate-800 ${surfaceBdr} border text-xs font-extrabold ${isEn ? 'text-sky-500' : 'text-emerald-500'} hover:opacity-80 rounded-xl transition-all shadow-sm cursor-pointer select-none`}
                title="Change Language"
              >
                {isEn ? 'EN' : 'SI'}
              </button>
            )}

            {/* GALLERY BUTTON */}
            <button
              onClick={handleOpenGallery}
              id="gallery-nav-btn"
              aria-label="Photo Gallery"
              className={`flex items-center justify-center gap-2 min-h-[44px] min-w-[44px] sm:min-w-0 px-3 sm:px-3.5 py-2 ${surfaceBg} ${cardHover} border ${surfaceBdr} hover:border-emerald-500/30 text-xs font-semibold ${textMuted} hover:text-emerald-400 rounded-xl transition-all shadow-sm cursor-pointer select-none`}
            >
              <Images className="w-4 h-4 text-emerald-400" />
              <span className="hidden sm:inline">Gallery</span>
            </button>
          </div>

        </div>
      </header>

      {/* MAIN LAYOUT BODY */}
      <main className={`flex-grow max-w-6xl w-full mx-auto relative z-10 flex flex-col safe-bottom ${activePracticePaper
        ? 'px-0 py-0 max-w-none'
        : 'px-3 sm:px-4 md:px-8 py-4 sm:py-6 md:py-8'
        }`}>

        {showGallery ? (
          <React.Suspense fallback={<div className="flex items-center justify-center p-20 w-full"><div className="w-8 h-8 border-4 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin"></div></div>}>
            <div className="animate-fade-in">
              {/* Gallery back button */}
              <button
                onClick={() => window.history.back()}
                className={`flex items-center gap-1.5 text-xs ${textMuted} hover:text-emerald-400 transition-colors py-2 px-3 min-h-[44px] ${backBtn} rounded-lg cursor-pointer mb-6`}
              >
                <ArrowLeft className="w-3.5 h-3.5 shrink-0" />
                <span>{isEn ? 'Back' : 'ආපසු'}</span>
              </button>
              <GalleryPage photos={galleryPhotos} isLoading={galleryLoading} />
            </div>
          </React.Suspense>
        ) : activePracticePaper ? (
          <React.Suspense fallback={<div className="flex items-center justify-center p-20 w-full"><div className="w-8 h-8 border-4 border-sky-500/30 border-t-sky-500 rounded-full animate-spin"></div></div>}>
            <PracticeSession
              paper={activePracticePaper}
              questions={questions.filter(q => q.paperId === activePracticePaper.id)}
              onSaveAttempt={handleSaveAttempt}
              savedAttempt={attempts.find(a => a.paperId === activePracticePaper.id)}
              onClose={() => window.history.back()}
              onLoadStudyMaterial={handleLoadStudyMaterial}
            />
          </React.Suspense>
        ) : (
          <div className="space-y-6 sm:space-y-8 flex-grow flex flex-col">

            {/* VIEW 1: MAIN LANDING — FULL-SCREEN PHOTO BG → LOGO → LEVEL CARDS */}
            {selectedLevel === null && (
              <>
                {/* FIXED FULL-SCREEN BACKGROUND PHOTO — fades out on scroll */}
                <div
                  ref={heroRef}
                  className="fixed top-0 left-0 w-full h-[100dvh] z-0 pointer-events-none"
                  style={{ opacity: heroOpacity }}
                >
                  <HeroSlideshow photos={galleryPhotos} />
                  {/* Global dark overlay for contrast */}
                  <div className="absolute inset-0 bg-black/0 z-[1]" />

                  {/* Gradient overlay for blending into content */}
                  <div
                    className="absolute inset-0"
                    style={{
                      background: isDark
                        ? 'linear-gradient(to bottom, rgba(3,3,4,0.1) 0%, rgba(3,3,4,0.2) 50%, rgba(3,3,4,0.95) 100%)'
                        : 'linear-gradient(to bottom, rgba(240,244,248,0) 0%, rgba(240,244,248,0) 60%, rgba(240,244,248,0.95) 100%)',
                    }}
                  />
                </div>

                <div className="flex flex-col items-center w-full animate-cinematic-reveal relative z-10" style={{ animationDelay: '0.2s', animationDuration: '0.8s' }}>

                  {/* HERO: Mehewara Logo — fills viewport initially, sits on top of the photo */}
                  <div className="flex flex-col items-center justify-center w-full" style={{ minHeight: '75vh' }}>
                    <div className="relative flex flex-col items-center animate-cinematic-logo">
                      {/* Ambient glow behind logo */}
                      <div
                        className="absolute rounded-full pointer-events-none"
                        style={{
                          width: '300px', height: '300px',
                          background: 'radial-gradient(circle, rgba(255,255,255,0.12) 0%, transparent 70%)',
                          top: '50%', left: '50%',
                          transform: 'translate(-50%, -50%) scale(1.5)',
                        }}
                      />
                      <img
                        src="/image/mehewara%20logo.png"
                        alt="Mehewara"
                        draggable={false}
                        className="relative z-10"
                        style={{
                          width: 'clamp(200px, 45vw, 340px)',
                          height: 'auto',
                          filter: 'drop-shadow(0 4px 20px rgba(0,0,0,0.4))',
                        }}
                      />
                      <p className="mt-4 text-[10px] sm:text-xs font-mono tracking-[0.2em] text-white/60 uppercase text-center drop-shadow-md">
                        Mehewara Educational Platform
                      </p>
                    </div>

                    {/* Scroll indicator */}
                    <div className="mt-10 flex flex-col items-center gap-1 text-white/50 animate-bounce" style={{ opacity: showBootOverlay ? 0 : 1, pointerEvents: showBootOverlay ? 'none' : 'auto', transition: 'opacity 1s ease-in-out' }}>
                      <span className="text-[10px] font-mono tracking-widest uppercase">
                        Scroll down
                      </span>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                      </svg>
                    </div>
                  </div>

                  {/* LEVEL SELECTION CARDS */}
                  <div className="w-full mt-8 sm:mt-12 mb-4" style={{ opacity: showBootOverlay ? 0 : 1, pointerEvents: showBootOverlay ? 'none' : 'auto', transition: 'opacity 1s ease-in-out' }}>
                    <div className="text-center mb-6 sm:mb-8">
                      <span className="text-[10px] tracking-widest text-sky-400 font-mono font-bold uppercase block mb-2">
                        Get Started
                      </span>
                      <h2 className={`text-xl sm:text-2xl md:text-3xl font-extrabold ${textPrimary}`}>
                        Choose Your Exam Level
                      </h2>
                      <p className={`text-xs ${textMuted} mt-2 max-w-md mx-auto`}>
                        Select your exam level to start practicing past papers.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 max-w-3xl mx-auto w-full">

                      {/* O/L Card */}
                      <button
                        onClick={() => handleSetLevel('ol')}
                        className={`group relative ${cardBg} ${cardHover} border ${cardBdr} hover:border-emerald-500/30 rounded-2xl sm:rounded-3xl p-5 sm:p-8 text-left transition-all duration-350 shadow-lg sm:hover:shadow-[0_0_30px_rgba(16,185,129,0.06)] cursor-pointer select-none active:scale-[0.99]`}
                      >
                        <div className={`absolute top-0 right-0 p-4 sm:p-8 ${isDark ? 'text-slate-800/10' : 'text-slate-300/40'} group-hover:text-emerald-500/5 transition-colors pointer-events-none`}>
                          <Layers className="w-16 h-16 sm:w-24 sm:h-24" />
                        </div>
                        <div className="w-11 h-11 sm:w-12 sm:h-12 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl flex items-center justify-center text-emerald-400 sm:group-hover:scale-105 transition-all mb-4 sm:mb-6">
                          <Layers className="w-5 h-5 sm:w-6 sm:h-6" />
                        </div>
                        <h3 className={`text-xl sm:text-2xl font-bold ${textPrimary} group-hover:text-emerald-400 transition-colors`}>
                          {isEn ? 'Ordinary Level (O/L)' : 'සාමාන්‍ය පෙළ'}
                        </h3>
                        <p className={`text-xs ${textMuted} mt-2 leading-relaxed`}>
                          {isEn ? 'Practice Ordinary Level MCQ past papers for Science, Mathematics, and other main subjects.' : 'සාමාන්‍ය පෙළ විද්‍යාව, ගණිතය ඇතුළු ප්‍රධාන විෂයන්හි බහුවරණ ප්‍රශ්න පත්‍ර මෙහිදී සිංහල මාධ්‍යයෙන් පුහුණුවන්න.'}
                        </p>
                        <div className={`mt-5 sm:mt-8 flex items-center gap-1.5 text-xs font-bold ${textFaint} group-hover:text-emerald-400 transition-all`}>
                          <span>{isEn ? 'Study active subjects' : 'සක්‍රිය විෂයන් අධ්‍යයනය කරන්න'}</span>
                          <ChevronRight className="w-4 h-4 shrink-0 transform group-hover:translate-x-1 transition-transform" />
                        </div>
                      </button>

                      {/* A/L Card */}
                      <button
                        onClick={() => handleSetLevel('al')}
                        className={`group relative ${cardBg} ${cardHover} border ${cardBdr} hover:border-sky-500/30 rounded-2xl sm:rounded-3xl p-5 sm:p-8 text-left transition-all duration-350 shadow-lg sm:hover:shadow-[0_0_30px_rgba(14,165,233,0.06)] cursor-pointer select-none active:scale-[0.99]`}
                      >
                        <div className={`absolute top-0 right-0 p-4 sm:p-8 ${isDark ? 'text-slate-800/10' : 'text-slate-300/40'} group-hover:text-sky-500/5 transition-colors pointer-events-none`}>
                          <GraduationCap className="w-16 h-16 sm:w-24 sm:h-24" />
                        </div>
                        <div className="w-11 h-11 sm:w-12 sm:h-12 bg-sky-500/10 border border-sky-500/30 rounded-2xl flex items-center justify-center text-sky-400 sm:group-hover:scale-105 transition-all mb-4 sm:mb-6">
                          <GraduationCap className="w-5 h-5 sm:w-6 sm:h-6" />
                        </div>
                        <h3 className={`text-xl sm:text-2xl font-bold ${textPrimary} group-hover:text-sky-400 transition-colors`}>
                          {isEn ? 'Advanced Level (A/L)' : 'උසස් පෙළ'}
                        </h3>
                        <p className={`text-xs ${textMuted} mt-2 leading-relaxed`}>
                          {isEn ? 'Solve Advanced Level Science, Maths, and Tech MCQ past papers.' : 'භෞතික විද්‍යාව, රසායන විද්‍යාව සහ ජීව විද්‍යාව ඇතුළු උසස් පෙළ විද්‍යා/ගණිත/තාක්ෂණ විෂයන්හි MCQ පත්‍ර මෙහිදී විසඳන්න.'}
                        </p>
                        <div className={`mt-5 sm:mt-8 flex items-center gap-1.5 text-xs font-bold ${textFaint} group-hover:text-sky-400 transition-all`}>
                          <span>{isEn ? 'Study active subjects' : 'සක්‍රිය විෂයන් අධ්‍යයනය කරන්න'}</span>
                          <ChevronRight className="w-4 h-4 shrink-0 transform group-hover:translate-x-1 transition-transform" />
                        </div>
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* VIEW 2: SUBJECTS LIST */}
            {selectedLevel !== null && selectedSubject === null && (
              <div className="space-y-4 sm:space-y-6 flex-grow animate-cinematic-reveal">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => window.history.back()}
                    className={`flex items-center gap-1.5 text-xs ${textMuted} hover:text-sky-400 transition-colors py-2 px-3 min-h-[44px] ${backBtn} rounded-lg cursor-pointer`}
                  >
                    <ArrowLeft className="w-3.5 h-3.5 shrink-0" />
                    <span className="sm:hidden">{isEn ? 'Back' : 'ආපසු'}</span>
                    <span className="hidden sm:inline">{isEn ? 'Back (Change exam level)' : 'ආපසු'}</span>
                  </button>
                </div>

                <div className={`space-y-2 border-b ${dividerBdr} pb-3 sm:pb-4`}>
                  <span className="text-[10px] tracking-widest text-sky-400 font-mono font-bold uppercase">
                    {selectedLevel === 'ol' ? 'Ordinary Level' : 'Advanced Level'} {isEn ? 'Subjects' : 'විෂයන්'}
                  </span>
                  <h2 className={`text-xl sm:text-2xl md:text-3xl font-extrabold ${textPrimary} leading-snug`}>{isEn ? 'Select Subject' : 'විෂයන් තෝරාගන්න'}</h2>
                </div>

                {(() => {
                  const filteredSubjects = deduplicateAndEnrichSubjects(subjects, [], papers).filter(s => s.examType === selectedLevel);
                  if (filteredSubjects.length === 0) {
                    return (
                      <div className={`text-center py-12 ${textFaint} text-xs`}>
                        {isEn ? 'No active subjects found for this level.' : 'මෙම මට්ටම යටතේ විෂයන් කිසිවක් සක්‍රිය නැත.'}
                      </div>
                    );
                  }
                  return (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-5">
                      {filteredSubjects.map((sub, idx) => {
                        const IconComponent = ICON_MAP[sub.icon] || BookOpen;
                        const paperCount = papers.filter(p => p.subjectId === sub.id && (p.language || 'si') === language && !p.hidden && p.state !== 'archived' && p.state !== 'draft').length;
                        const colorClass = resolveSubjectColor(sub, idx);
                        return (
                          <button
                            key={sub.id}
                            onClick={() => handleSetSubject(sub)}
                            className={`group relative p-4 sm:p-6 text-left border rounded-2xl transition-all duration-300 cursor-pointer select-none active:scale-[0.99] bg-gradient-to-br ${colorClass}`}
                          >
                            <div className="flex justify-between items-start mb-6">
                              <div className="p-3 bg-slate-950/40 rounded-xl">
                                <IconComponent className="w-6 h-6 text-white" />
                              </div>
                              <span className="text-[10px] font-mono bg-white/10 text-white font-bold px-2 py-0.5 rounded-md uppercase">
                                {sub.code}
                              </span>
                            </div>
                            <h3 className="text-base sm:text-lg font-bold text-white line-clamp-2">{isEn ? sub.name : sub.sinhalaName}</h3>
                            <p className="text-xs text-white/70 font-mono mt-0.5 leading-normal">{sub.name}</p>
                            <div className="mt-6 pt-4 border-t border-white/5 flex items-center justify-between text-xs text-white/80">
                              <span>{isEn ? '⏱️ Active MCQ Papers: ' : '⏱️ ක්‍රියාකාරි MCQ පත්‍ර: '}<strong className="font-mono bg-white/10 px-1.5 py-0.5 rounded text-[10px]">{paperCount}</strong></span>
                              <ChevronRight className="w-4 h-4 transform group-hover:translate-x-1 transition-transform text-white/50 group-hover:text-white" />
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            )}

            {/* VIEW 3: PAST PAPERS LIST */}
            {selectedSubject !== null && activePracticePaper === null && (
              <div className="space-y-4 sm:space-y-6 flex-grow animate-cinematic-reveal">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => window.history.back()}
                    className={`flex items-center gap-1.5 text-xs ${textMuted} hover:text-sky-400 transition-colors py-2 px-3 min-h-[44px] ${backBtn} rounded-lg cursor-pointer`}
                  >
                    <ArrowLeft className="w-3.5 h-3.5 shrink-0" />
                    <span className="sm:hidden">{isEn ? 'Back' : 'ආපසු'}</span>
                    <span className="hidden sm:inline">{isEn ? 'Back to Subjects' : 'ආපසු විෂයන් වෙත'}</span>
                  </button>
                </div>

                <div className={`p-4 sm:p-6 ${infoPanel} border rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4`}>
                  <div className="space-y-1 min-w-0">
                    <span className="text-[10px] tracking-widest text-sky-400 font-mono font-bold uppercase">
                      {selectedLevel?.toUpperCase()} Exam &bull; {selectedSubject.name}
                    </span>
                    <h2 className={`text-xl sm:text-2xl font-extrabold ${textPrimary} leading-snug`}>{isEn ? `${selectedSubject.name} Past Papers` : `${selectedSubject.sinhalaName} පසුගිය ප්‍රශ්න පත්‍ර`}</h2>
                    <p className={`text-xs ${textMuted} leading-relaxed max-w-xl`}>
                      {isEn ? 'Solve past papers (old and new syllabus) matching actual exam timing.' : 'විභාග කාල නියමයන්ට අනුකූලව පසුගිය විභාග බහුවරණ ප්‍රශ්න පත්‍ර (පැරණි සහ නව නිර්දේශ) මෙහිදී විසඳන්න.'}
                    </p>
                  </div>
                  <div className={`flex items-center ${statBox} p-3 rounded-xl border self-start md:self-auto`}>
                    <BookMarked className="w-8 h-8 text-sky-400 opacity-80 mr-3" />
                    <div className="text-xs text-slate-350">
                      <span className={textMuted}>{isEn ? 'Total Papers' : 'සම්පූර්ණ ප්‍රශ්න පත්‍ර ගණන'}</span>
                      <p className={`text-lg font-bold ${textPrimary} font-mono mt-0.5`}>
                        {papers.filter(p => p.subjectId === selectedSubject.id && (p.language || 'si') === language && !p.hidden && p.state !== 'archived' && p.state !== 'draft').length} Active papers
                      </p>
                    </div>
                  </div>
                </div>

                {(() => {
                  const subjectPapers = papers.filter(p => p.subjectId === selectedSubject.id && (p.language || 'si') === language && !p.hidden && p.state !== 'archived' && p.state !== 'draft');
                  if (subjectPapers.length === 0) {
                    return (
                      <div className={`text-center py-12 ${isDark ? 'bg-slate-950/20' : 'bg-slate-50'} rounded-2xl border border-dashed ${cardBdr} ${textFaint} text-xs`}>
                        {isEn ? 'No active papers found for this subject.' : 'මෙම විෂයට අදාළ ප්‍රශ්න පත්‍ර කිසිවක් දැනට සක්‍රිය නැත.'}
                        <p className="mt-1 text-[10px]">{isEn ? 'Please add new papers via the Admin Panel.' : 'කරුණාකර පාලක පැනලයෙන් නව ප්‍රශ්න පත්‍ර එක් කිරීමට සහාය වන්න.'}</p>
                      </div>
                    );
                  }
                  return (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {subjectPapers.map((paper) => {
                        const previousAttempt = attempts.find(a => a.paperId === paper.id);
                        const paperQuestions = questions.filter(q => q.paperId === paper.id);
                        let scoreBadge = null;
                        if (previousAttempt?.isCompleted && (previousAttempt.totalCount || paper.questionCount) > 0) {
                          const correct = previousAttempt.correctCount !== undefined
                            ? previousAttempt.correctCount
                            : (paperQuestions.length > 0 ? (() => {
                              let c = 0;
                              paperQuestions.forEach(q => {
                                const userAns = previousAttempt.answers[q.id || q.qNumber.toString()];
                                if (userAns !== undefined && (q.isAllCorrect || (q.correctOptions?.includes(userAns) ?? userAns === q.correctOption))) c++;
                              });
                              return c;
                            })() : 0);

                          const total = previousAttempt.totalCount || paper.questionCount || paperQuestions.length;
                          const percent = total > 0 ? Math.round((correct / total) * 100) : 0;

                          scoreBadge = (
                            <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full font-bold font-mono">
                              ✓ {percent}% (Completed)
                            </span>
                          );
                        } else if (previousAttempt) {
                          scoreBadge = (
                            <span className="text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded-full font-bold">
                              ⌛ In Progress
                            </span>
                          );
                        }
                        return (
                          <div
                            key={paper.id}
                            className={`flex flex-col justify-between p-4 sm:p-5 ${paperCard} border rounded-2xl sm:hover:scale-[1.01] transition-all`}
                          >
                            <div className="space-y-3 sm:space-y-4">
                              <div className="flex justify-between items-start gap-2">
                                <h3
                                  className={`text-sm sm:text-base font-bold ${textPrimary} hover:text-sky-400 cursor-pointer transition-colors leading-snug flex-1 min-w-0`}
                                  onClick={() => handleSetPracticePaper(paper)}
                                >
                                  {isEn ? paper.title : paper.sinhalaTitle}
                                </h3>
                                <span className={`text-xs ${isDark ? 'bg-slate-900' : 'bg-slate-100'} text-sky-400 px-2 py-0.5 rounded-md font-mono font-bold`}>
                                  {paper.year}
                                </span>
                              </div>
                              <div className={`flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs ${textMuted}`}>
                                <span className="flex items-center gap-1">
                                  <Clock className={`w-3.5 h-3.5 ${textFaint}`} />
                                  {paper.durationMinutes} {isEn ? 'Mins' : 'විනාඩි'}
                                </span>
                                <span className="flex items-center gap-1">
                                  <Layers className={`w-3.5 h-3.5 ${textFaint}`} />
                                  {isEn ? `${paper.questionCount || paperQuestions.length} Questions` : `ප්‍රශ්න ${paper.questionCount || paperQuestions.length} ක් අඩංගුයි`}
                                </span>
                                {scoreBadge}
                              </div>
                            </div>
                            <div className={`mt-4 sm:mt-6 pt-4 border-t ${paperDivider} flex flex-col-reverse sm:flex-row sm:justify-between sm:items-center gap-3`}>
                              {previousAttempt ? (
                                <button
                                  onClick={() => handleSetPracticePaper(paper)}
                                  className="text-xs font-bold text-sky-450 hover:text-sky-350 cursor-pointer flex items-center gap-1 text-left min-h-[44px] sm:min-h-0"
                                >
                                  {previousAttempt.isCompleted ? (
                                    <>
                                      <span className="sm:hidden">{isEn ? 'Review' : 'සමාලෝචනය'}</span>
                                      <span className="hidden sm:inline">{isEn ? 'Review Answers' : 'පිළිතුරු සමාලෝචනය'}</span>
                                    </>
                                  ) : (
                                    <>
                                      <span className="sm:hidden">{isEn ? 'Continue →' : 'ඉදිරියට ගෙනයන්න →'}</span>
                                      <span className="hidden sm:inline">{isEn ? 'Continue Working →' : 'වැඩ කටයුතු ඉදිරියට ගෙනයන්න →'}</span>
                                    </>
                                  )}
                                </button>
                              ) : (
                                <span className={`text-[11px] ${textFaint} font-mono uppercase italic tracking-wider`}>NOT STARTED</span>
                              )}
                              <button
                                onClick={() => handleSetPracticePaper(paper)}
                                disabled={isLoadingQuestions}
                                className="w-full sm:w-auto min-h-[44px] px-4 py-2.5 sm:py-2 bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white rounded-xl text-xs font-bold font-sans tracking-wide transition-all cursor-pointer active:scale-[0.98] disabled:opacity-50 disabled:cursor-wait"
                              >
                                {isLoadingQuestions ? 'Loading...' : previousAttempt ? (isEn ? 'Restart' : 'නැවත අරඹන්න') : (isEn ? 'Practice' : 'පිළිතුරු ලියන්න')}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            )}

          </div>
        )}
      </main>

      {/* FOOTER */}
      <footer className={`${isDark ? 'bg-[#18181b] text-[#9ca3af] border-t border-slate-800' : 'bg-slate-200 text-slate-800 border-t border-slate-300'} py-8 px-6 w-full mt-auto select-none safe-bottom flex flex-col items-center gap-6 ${activePracticePaper ? 'hidden md:block' : ''}`} style={{ zIndex: 10, position: 'relative' }}>
        <div className="max-w-4xl mx-auto w-full flex flex-col md:flex-row items-center justify-between gap-8 text-center md:text-left">

          <div className="space-y-1 text-sm">
            <h3 className={`${isDark ? 'text-white' : 'text-black'} font-bold text-base mb-2`}>E-FAC STUDENTS' UNION</h3>
            <p>Faculty of Engineering, University of Ruhuna,</p>
            <p>Hapugala, Galle, Sri Lanka.</p>
            <p className="pt-2">
              <a href="mailto:contact@mehewara.edu.lk" className={`${isDark ? 'hover:text-white' : 'hover:text-black text-slate-700'} transition-colors`}>contact@mehewara.edu.lk</a> &bull;
            </p>
          </div>

          <div className="flex items-center gap-4">
            <a href="https://www.facebook.com/ruhuna.efac.mehewara" className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${isDark ? 'bg-slate-800 hover:bg-slate-700 hover:text-white' : 'bg-slate-200 hover:bg-slate-300 hover:text-black text-slate-700'}`}>
              <Facebook className="w-5 h-5" />
            </a>
            <a href="https://www.linkedin.com/company/%E0%B6%B8%E0%B7%99%E0%B7%84%E0%B7%99%E0%B7%80%E0%B6%BB-mehewara/?originalSubdomain=lk" className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${isDark ? 'bg-slate-800 hover:bg-slate-700 hover:text-white' : 'bg-slate-200 hover:bg-slate-300 hover:text-black text-slate-700'}`}>
              <Linkedin className="w-5 h-5" />
            </a>
            <a href="https://youtube.com/@mehewara-5108?si=N4X8F8jphX0XddXe" className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${isDark ? 'bg-slate-800 hover:bg-slate-700 hover:text-white' : 'bg-slate-200 hover:bg-slate-300 hover:text-black text-slate-700'}`}>
              <Youtube className="w-5 h-5" />
            </a>
          </div>

        </div>

        <div className={`w-full max-w-4xl border-t pt-6 text-xs flex flex-col items-center justify-center gap-2 ${isDark ? 'border-slate-800' : 'border-slate-300'}`}>
          <p>&copy; {new Date().getFullYear()} E-FAC Students' Union, All rights reserved.</p>
          <div className="flex items-center gap-2 mt-1">
            <span className="font-mono text-[10px] tracking-widest uppercase opacity-50">Mehewara Educational Platform</span>
            <span className="opacity-50">|</span>
            <button onClick={handleOpenAboutUs} className={`transition-colors ${isDark ? 'hover:text-white' : 'hover:text-black text-slate-700'}`}>About Us</button>
            <span className="opacity-50">|</span>
            <a href="/privacy-policy.html" target="_blank" rel="noopener noreferrer" className={`transition-colors ${isDark ? 'hover:text-white' : 'hover:text-black text-slate-700'}`}>Privacy</a>
          </div>
        </div>
      </footer>

      {showAboutUs && (
        <AboutUsModal
          data={aboutData || { description: "Welcome to Mehewara!" }}
          onClose={() => window.history.back()}
        />
      )}

      {/* OVERLAY: RESTRICTED ADMIN DASHBOARD */}
      {showAdminPanel && (
        <React.Suspense fallback={<div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center"><div className="w-8 h-8 border-4 border-sky-500/30 border-t-sky-500 rounded-full animate-spin"></div></div>}>
          <AdminPanel
            subjects={subjects}
            onAddSubject={handleAddSubject}
            onUpdateSubject={handleUpdateSubject}
            onDeleteSubject={handleDeleteSubject}
            papers={papers}
            questions={questions}
            onAddPaper={handleAddPaper}
            onUpdatePaper={handleUpdatePaper}
            onDeletePaper={handleDeletePaper}
            onAddQuestion={handleAddQuestion}
            onUpdateQuestion={handleUpdateQuestion}
            onDeleteQuestion={handleDeleteQuestion}
            onUpdateStudyHtml={handleUpdateStudyHtml}
            onResetToDefaults={handleResetToDefaults}
            onExportData={handleExportData}
            onImportData={handleImportData}
            onSync={syncFromApi}
            isSyncing={isSyncing}
            onEnsureQuestionsLoaded={handleEnsureQuestionsLoaded}
            loadingPaperQuestionsId={loadingPaperQuestionsId}
            onAboutUpdate={setAboutData}
            onClose={handleCloseAdminPanel}
            activeUsersCount={activeUsersCount}
          />
        </React.Suspense>
      )}

      {/* OVERLAY: ADMIN LOGIN GATEWAY */}
      {showAdminLogin && (
        <React.Suspense fallback={<div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center"><div className="w-8 h-8 border-4 border-sky-500/30 border-t-sky-500 rounded-full animate-spin"></div></div>}>
          <AdminLogin
            onLoginSuccess={handleAdminLoginSuccess}
            onCancel={handleCancelAdminLogin}
          />
        </React.Suspense>
      )}

      {/* CINEMATIC BOOT OVERLAY — renders on top of main content, zooms through */}
      {showBootOverlay && <BootLoader onBootComplete={handleBootComplete} />}

      {/* SITE ENTRY GATE — requires Turnstile verification for all visitors */}
      {!isHumanVerified && !showAdminPanel && !showAdminLogin && !isAdminPath() && (
        <SiteEntryGate
          isDark={isDark}
          isEn={isEn}
          onVerified={() => setIsHumanVerified(true)}
        />
      )}

    </div>
  );
}