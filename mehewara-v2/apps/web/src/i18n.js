/**
 * EN/SI UI strings + language preference. Tamil content (where the
 * manifest provides it) renders inline via pickText, but chrome stays
 * bilingual like the legacy app.
 */
const STRINGS = {
  en: {
    home: "Home", gallery: "Gallery", about: "About", privacy: "Privacy", attempts: "My attempts",
    subjects: "Subjects", papers: "Papers", questions: "Questions",
    startPractice: "Start practice", showExplanation: "Show explanation", hideExplanation: "Hide explanation",
    finishAttempt: "Finish attempt", attemptSaved: "Attempt saved locally.",
    answeredOf: (a, b) => `${a} of ${b} answered`,
    loading: "Loading…", loadFailed: "Could not load the publication. Check your connection and retry.",
    retry: "Retry", empty: "Nothing published yet.", noPapers: "No papers in this subject yet.",
    studyMaterial: "Study material", openDocument: "Open document",
    explanation: "Explanation", yourAnswer: "Your answer", notAnswered: "Not answered",
    minutes: (n) => `${n} min`, year: "Year", back: "Back", theme: "Theme", language: "Language",
    dark: "Dark", light: "Light", practiceSession: "Practice session",
    attemptsEmpty: "No attempts yet. Finish a practice session to see it here.",
    completedAt: "Completed", inProgress: "In progress",
  },
  si: {
    home: "මුල් පිටුව", gallery: "ගැලරිය", about: "අප ගැන", privacy: "රහස්‍යතාව", attempts: "මගේ උත්සාහයන්",
    subjects: "විෂයන්", papers: "ප්‍රශ්න පත්‍ර", questions: "ප්‍රශ්න",
    startPractice: "අභ්‍යාසය අරඹන්න", showExplanation: "පැහැදිලි කිරීම පෙන්වන්න", hideExplanation: "පැහැදිලි කිරීම සඟවන්න",
    finishAttempt: "උත්සාහය අවසන් කරන්න", attemptSaved: "උත්සාහය locally සුරකින ලදී.",
    answeredOf: (a, b) => `${b} න් ${a} පිළිතුරු දුන්නා`,
    loading: "පූරණය වෙමින්…", loadFailed: "ප්‍රකාශනය පූරණය කළ නොහැකි විය. සම්බන්ධතාව පරීක්ෂා කර නැවත උත්සාහ කරන්න.",
    retry: "නැවත උත්සාහය", empty: "තවම කිසිවක් ප්‍රකාශයට පත් කර නැහැ.", noPapers: "මෙම විෂයට තවම ප්‍රශ්න පත්‍ර නැහැ.",
    studyMaterial: "අධ්‍යයන ද්‍රව්‍ය", openDocument: "ලේඛනය අරින්න",
    explanation: "පැහැදිලි කිරීම", yourAnswer: "ඔබේ පිළිතුර", notAnswered: "පිළිතුරු නැහැ",
    minutes: (n) => `විනාඩි ${n}`, year: "වර්ෂය", back: "ආපසු", theme: "තේමාව", language: "භාෂාව",
    dark: "අඳුරු", light: "එළිය", practiceSession: "අභ්‍යාස සැසිය",
    attemptsEmpty: "තවම උත්සාහයන් නැහැ. අභ්‍යාස සැසියක් අවසන් කළ විට මෙහි පෙන්වයි.",
    completedAt: "අවසන් කළේ", inProgress: "ක්‍රියාත්මකයි",
  },
};

const LANG_KEY = "mehewara-v2-lang";

export function getLang() {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved === "si" || saved === "en") return saved;
  } catch { /* private mode: fall through */ }
  return "en";
}

export function setLang(lang) {
  const next = lang === "si" ? "si" : "en";
  try { localStorage.setItem(LANG_KEY, next); } catch { /* ignore */ }
  return next;
}

/** UI string lookup with English fallback. */
export function t(lang, key, ...args) {
  const table = STRINGS[lang] ?? STRINGS.en;
  const value = table[key] ?? STRINGS.en[key];
  return typeof value === "function" ? value(...args) : (value ?? key);
}
