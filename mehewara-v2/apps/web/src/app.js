/**
 * SPA shell: boot, hash router, theme/language prefs, practice state, and
 * local attempts. Rendering lives in views.js (pure HTML strings); this
 * module owns the DOM and all event wiring.
 *
 * Attempts persist to localStorage in the LocalAttempt contract shape
 * (storage "indexeddb" is the contract's literal — the shape, not the
 * engine). No scores are stored: the public manifest carries no answers.
 */
import { fetchCurrent } from "./api.js";
import { getLang, setLang } from "./i18n.js";
import { parseRoute, buildAttempt, emptyManifest, defaultManifest } from "./lib.js";
import {
  renderHome, renderSubject, renderPaper, renderStudy, renderGallery,
  renderContentPage, renderAbout, renderPrivacy, renderAttempts,
  renderLoading, renderError,
} from "./views.js";

const THEME_KEY = "mehewara-v2-theme";
const ATTEMPTS_KEY = "mehewara-v2-attempts";

function getTheme() {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch { /* ignore */ }
  return "dark";
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.classList.toggle("light", theme === "light");
  try { localStorage.setItem(THEME_KEY, theme); } catch { /* ignore */ }
}

function loadAttempts() {
  try {
    const raw = localStorage.getItem(ATTEMPTS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveAttempts(attempts) {
  try {
    localStorage.setItem(ATTEMPTS_KEY, JSON.stringify(attempts.slice(-100)));
  } catch { /* quota: keep memory copy */ }
}

const state = {
  lang: getLang(),
  manifest: null,
  examFilter: "",
  paperSelections: new Map(), // paperId -> { [questionId]: number[] }
  paperRevealed: new Map(), // paperId -> { [questionId]: true }
  paperStartedAt: new Map(), // paperId -> epoch ms
  attempts: loadAttempts(),
};

function selectionsFor(paperId) {
  let sel = state.paperSelections.get(paperId);
  if (!sel) {
    sel = {};
    state.paperSelections.set(paperId, sel);
  }
  return sel;
}

function revealedFor(paperId) {
  let rev = state.paperRevealed.get(paperId);
  if (!rev) {
    rev = {};
    state.paperRevealed.set(paperId, rev);
  }
  return rev;
}

function root() {
  return document.getElementById("root");
}

function render() {
  const route = parseRoute(location.hash);
  const { manifest, lang } = state;
  let html;
  switch (route.name) {
    case "subject":
      html = renderSubject(manifest, lang, route.params.id);
      break;
    case "paper":
      html = renderPaper(manifest, lang, route.params.id, selectionsFor(route.params.id), revealedFor(route.params.id));
      break;
    case "study":
      html = renderStudy(manifest, lang, route.params.id);
      break;
    case "gallery":
      html = renderGallery(manifest, lang);
      break;
    case "page":
      html = renderContentPage(manifest, lang, route.params.slug);
      break;
    case "about":
      html = renderAbout(manifest, lang);
      break;
    case "privacy":
      html = renderPrivacy(manifest, lang);
      break;
    case "attempts":
      html = renderAttempts(manifest, lang, state.attempts);
      break;
    default:
      html = renderHome(manifest, lang, state.examFilter);
      break;
  }
  root().innerHTML = html;
  wire(route);
}

function wire(route) {
  const langBtn = document.getElementById("lang-toggle");
  langBtn?.addEventListener("click", () => {
    state.lang = setLang(state.lang === "en" ? "si" : "en");
    document.documentElement.lang = state.lang === "si" ? "si" : "en";
    render();
  });
  const themeBtn = document.getElementById("theme-toggle");
  themeBtn?.addEventListener("click", () => {
    applyTheme(getTheme() === "dark" ? "light" : "dark");
    render();
  });

  if (route.name === "home") {
    root().querySelectorAll("[data-filter]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.examFilter = btn.getAttribute("data-filter") ?? "";
        render();
      });
    });
  }

  if (route.name === "gallery") {
    const lightbox = document.getElementById("gallery-lightbox");
    const lightboxImg = document.getElementById("lightbox-img");
    const lightboxCaption = document.getElementById("lightbox-caption");
    const closeBtn = document.getElementById("lightbox-close");

    root().querySelectorAll("[data-lightbox-src]").forEach((card) => {
      card.addEventListener("click", () => {
        const src = card.getAttribute("data-lightbox-src");
        const caption = card.getAttribute("data-lightbox-title");
        if (lightbox && lightboxImg) {
          lightboxImg.src = src;
          if (lightboxCaption) lightboxCaption.textContent = caption || "";
          lightbox.style.display = "flex";
        }
      });
    });

    closeBtn?.addEventListener("click", () => {
      if (lightbox) lightbox.style.display = "none";
    });

    lightbox?.addEventListener("click", (e) => {
      if (e.target === lightbox) lightbox.style.display = "none";
    });
  }

  if (route.name === "paper") {
    const paperId = route.params.id;
    if (!state.paperStartedAt.has(paperId)) state.paperStartedAt.set(paperId, Date.now());
    root().querySelectorAll('input[type="checkbox"][data-q]').forEach((input) => {
      input.addEventListener("change", () => {
        const qid = input.getAttribute("data-q");
        const sel = selectionsFor(paperId);
        const checked = [...root().querySelectorAll(`input[type="checkbox"][data-q="${CSS.escape(qid)}"]:checked`)]
          .map((el) => Number(el.value))
          .sort((a, b) => a - b);
        if (checked.length > 0) sel[qid] = checked;
        else delete sel[qid];
        persistProgress(paperId);
        render();
      });
    });
    root().querySelectorAll("[data-reveal]").forEach((btn) => {
      btn.addEventListener("click", () => {
        revealedFor(paperId)[btn.getAttribute("data-reveal")] = true;
        persistProgress(paperId);
        render();
      });
    });
    document.getElementById("finish-attempt")?.addEventListener("click", () => {
      const sel = selectionsFor(paperId);
      const attempt = buildAttempt(
        paperId,
        Object.entries(sel).map(([questionId, selectedOptionIndexes]) => ({ questionId, selectedOptionIndexes })),
        true,
      );
      attempt.startedAt = state.paperStartedAt.get(paperId) ?? attempt.startedAt;
      state.attempts = [...state.attempts, attempt];
      saveAttempts(state.attempts);
      state.paperSelections.delete(paperId);
      state.paperRevealed.delete(paperId);
      state.paperStartedAt.delete(paperId);
      const note = document.getElementById("attempt-note");
      if (note) note.textContent = "✓";
      location.hash = "#/attempts";
    });
  }

  const retry = document.getElementById("retry-load");
  retry?.addEventListener("click", () => void boot(true));
}

/** Persist in-progress selections so a reload never loses answers. */
function persistProgress(paperId) {
  try {
    const sel = state.paperSelections.get(paperId) ?? {};
    const rev = state.paperRevealed.get(paperId) ?? {};
    localStorage.setItem(`mehewara-v2-progress-${paperId}`, JSON.stringify({
      selections: sel,
      revealed: rev,
      startedAt: state.paperStartedAt.get(paperId) ?? Date.now(),
    }));
  } catch { /* ignore */ }
}

function restoreProgress(paperId) {
  try {
    const raw = localStorage.getItem(`mehewara-v2-progress-${paperId}`);
    if (!raw) return;
    const saved = JSON.parse(raw);
    if (saved && typeof saved === "object") {
      if (saved.selections) state.paperSelections.set(paperId, saved.selections);
      if (saved.revealed) state.paperRevealed.set(paperId, saved.revealed);
      if (saved.startedAt) state.paperStartedAt.set(paperId, saved.startedAt);
    }
  } catch { /* ignore */ }
}

async function boot(retry = false) {
  if (!retry) {
    applyTheme(getTheme());
    document.documentElement.lang = state.lang === "si" ? "si" : "en";
  }
  // Initialize with defaultManifest immediately so the entire homepage, hero,
  // exam level cards, subjects, and navigation render with ZERO delay or blocking errors.
  if (!state.manifest) {
    state.manifest = defaultManifest();
    render();
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const current = await fetchCurrent(controller.signal);
    if (current?.manifest && (current.manifest.subjects?.length > 0 || current.manifest.papers?.length > 0)) {
      state.manifest = current.manifest;
    }
    const route = parseRoute(location.hash);
    if (route.name === "paper") restoreProgress(route.params.id);
    render();
  } catch (error) {
    console.warn("Remote publication not available, running on standard catalog:", error);
    // Keep standard catalog active and render without blocking the screen
    if (!state.manifest) state.manifest = defaultManifest();
    const route = parseRoute(location.hash);
    if (route.name === "paper") restoreProgress(route.params.id);
    render();
  } finally {
    clearTimeout(timeout);
  }
}

window.addEventListener("hashchange", () => {
  const route = parseRoute(location.hash);
  if (route.name === "paper") restoreProgress(route.params.id);
  if (state.manifest) render();
});

void boot();
