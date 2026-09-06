/**
 * Pure SPA helpers — DOM-free so node:test can import this module directly.
 * Security boundary: only manifest `*Html`/`html` fields (server-sanitized
 * before publication) are ever rendered as HTML. Every other string goes
 * through escapeHtml before interpolation.
 */

/** Escape a plain string for HTML interpolation. */
export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Pick display text for the active language. LocalizedText may carry `ta`;
 * BilingualText never does. Falls back to English when the requested
 * language is empty, then to any non-empty variant.
 */
export function pickText(text, lang) {
  if (!text || typeof text !== "object") return "";
  const primary = lang === "si" ? text.si : lang === "ta" ? text.ta : text.en;
  if (typeof primary === "string" && primary.trim() !== "") return primary;
  if (typeof text.en === "string" && text.en.trim() !== "") return text.en;
  if (typeof text.si === "string" && text.si.trim() !== "") return text.si;
  if (typeof text.ta === "string" && text.ta.trim() !== "") return text.ta;
  return "";
}

/** Parse a `#/...` hash route into { name, params }. Unknown routes -> home. */
export function parseRoute(hash) {
  const path = String(hash ?? "").replace(/^#/, "") || "/";
  const segments = path.split("/").filter(Boolean).map(decodeURIComponent);
  const [head, first] = segments;
  if (head === undefined) return { name: "home", params: {} };
  if (head === "subject" && first) return { name: "subject", params: { id: first } };
  if (head === "paper" && first) return { name: "paper", params: { id: first } };
  if (head === "study" && first) return { name: "study", params: { id: first } };
  if (head === "gallery") return { name: "gallery", params: {} };
  if (head === "page" && first) return { name: "page", params: { slug: first } };
  if (head === "about") return { name: "about", params: {} };
  if (head === "privacy") return { name: "privacy", params: {} };
  if (head === "attempts") return { name: "attempts", params: {} };
  return { name: "home", params: {} };
}

export function routeHref(name, params = {}) {
  switch (name) {
    case "subject": return `#/subject/${encodeURIComponent(params.id)}`;
    case "paper": return `#/paper/${encodeURIComponent(params.id)}`;
    case "study": return `#/study/${encodeURIComponent(params.id)}`;
    case "page": return `#/page/${encodeURIComponent(params.slug)}`;
    case "gallery": return "#/gallery";
    case "about": return "#/about";
    case "privacy": return "#/privacy";
    case "attempts": return "#/attempts";
    default: return "#/";
  }
}

/**
 * Build a LocalAttempt record (contract-shaped, storage "indexeddb").
 * Correctness is intentionally absent: the public manifest carries no
 * answers, so the SPA records selections + explanations-read, never scores.
 */
export function buildAttempt(paperId, answers, completed) {
  const record = {
    storage: "indexeddb",
    paperId,
    startedAt: Date.now(),
    answers: answers.map((a) => ({
      questionId: a.questionId,
      selectedOptionIndexes: [...a.selectedOptionIndexes].sort((x, y) => x - y),
    })),
    isCompleted: Boolean(completed),
  };
  if (completed) record.completedAt = Date.now();
  return record;
}

/** Count answered questions in a selections map { [questionId]: number[] }. */
export function answeredCount(selections) {
  return Object.values(selections ?? {}).filter((v) => Array.isArray(v) && v.length > 0).length;
}

/** Empty manifest shape: boot normalizes a 404 (nothing published yet) to
 *  this so views never dereference null. Every view treats it as the
 *  localized "empty" state. */
export function emptyManifest() {
  return {
    subjects: [], papers: [], questions: [], studyMaterials: [],
    gallery: [], pages: [], about: null, privacy: null,
  };
}

/** Group papers by subject id, newest year first. */
export function papersBySubject(papers) {
  const map = new Map();
  for (const paper of papers ?? []) {
    const arr = map.get(paper.subjectId) ?? [];
    arr.push(paper);
    map.set(paper.subjectId, arr);
  }
  for (const arr of map.values()) arr.sort((a, b) => b.year - a.year || (a.slug < b.slug ? -1 : 1));
  return map;
}

/** Questions for a paper, ordered by number. */
export function questionsForPaper(questions, paperId) {
  return (questions ?? []).filter((q) => q.paperId === paperId).sort((a, b) => a.number - b.number);
}
