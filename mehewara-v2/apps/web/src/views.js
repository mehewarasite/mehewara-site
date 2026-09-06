/**
 * View renderers: manifest -> HTML strings. Mounted by app.js, which owns
 * all event wiring. Trust rule (see lib.js): manifest `*Html`/`html`
 * fields render as HTML (server-sanitized at publish time); everything
 * else is escaped at interpolation time.
 */
import { escapeHtml, pickText, routeHref, answeredCount } from "./lib.js";
import { t } from "./i18n.js";

const ICONS = {
  layers: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 12.5-8.58 3.91a2 2 0 0 1-1.66 0L2.6 12.5"/><path d="m22 17.5-8.58 3.91a2 2 0 0 1-1.66 0L2.6 17.5"/></svg>`,
  gradCap: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z"/><path d="M22 10v6"/><path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5"/></svg>`,
  arrowRight: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>`,
  arrowLeft: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>`,
  clock: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
  book: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>`,
  sun: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>`,
  moon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>`,
  images: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>`,
  atom: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"/><path d="M20.2 20.2c2.04-2.03.02-7.36-4.5-11.9-4.54-4.52-9.87-6.54-11.9-4.5-2.04 2.03-.02 7.36 4.5 11.9 4.54 4.52 9.87 6.54 11.9 4.5Z"/><path d="M15.7 8.3c4.54-4.52 6.56-9.85 4.52-11.9-2.04-2.03-7.37-.01-11.9 4.53-4.55 4.54-6.57 9.87-4.53 11.9 2.04 2.04 7.37.02 11.91-4.53Z"/></svg>`,
  flask: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 2v7.527a2 2 0 0 1-.211.896L4.72 20.55a1 1 0 0 0 .9 1.45h12.76a1 1 0 0 0 .9-1.45l-5.069-10.127A2 2 0 0 1 14 9.527V2"/><path d="M8.5 2h7"/><path d="M7 16h10"/></svg>`,
  cpu: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="16" height="16" x="4" y="4" rx="2"/><rect width="6" height="6" x="9" y="9" rx="1"/><path d="M15 2v2"/><path d="M15 20v2"/><path d="M2 15h2"/><path d="M2 9h2"/><path d="M20 15h2"/><path d="M20 9h2"/><path d="M9 2v2"/><path d="M9 20v2"/></svg>`,
  fileText: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/></svg>`,
};

function getSubjectIcon(code, examType) {
  const c = String(code || "").toLowerCase();
  if (c.includes("sci") || c.includes("phy") || c.includes("bio")) return ICONS.atom;
  if (c.includes("che")) return ICONS.flask;
  if (c.includes("ict") || c.includes("tech")) return ICONS.cpu;
  if (examType === "al") return ICONS.gradCap;
  return ICONS.layers;
}

function chrome(lang, manifest, active, body) {
  const pages = (manifest.pages ?? []).map((p) =>
    `<a href="${routeHref("page", { slug: p.slug })}" data-nav>${escapeHtml(pickText(p.title, lang))}</a>`).join("");
  return `
<div class="site-wrapper">
  <div class="ambient-glow"></div>
  <header class="topbar">
    <div class="topbar-inner">
      <a class="brand" href="#/" data-nav>
        <img src="/image/efac.png" alt="Home" class="brand-logo" />
        <div class="brand-text">
          <span class="brand-title">මෙහෙවර</span>
          <p class="brand-sub">MEHEWARA PAST PAPERS</p>
        </div>
      </a>
      <nav>
        <a href="#/" data-nav data-active="${active === "home"}">${escapeHtml(t(lang, "home"))}</a>
        <a href="#/gallery" data-nav data-active="${active === "gallery"}">${ICONS.images} <span>${escapeHtml(t(lang, "gallery"))}</span></a>
        <a href="#/attempts" data-nav data-active="${active === "attempts"}">${escapeHtml(t(lang, "attempts"))}</a>
        ${pages}
        <a href="#/about" data-nav data-active="${active === "about"}">${escapeHtml(t(lang, "about"))}</a>
      </nav>
      <div class="prefs">
        <button id="theme-toggle" class="btn-icon" type="button" aria-label="${escapeHtml(t(lang, "theme"))}" title="${escapeHtml(t(lang, "theme"))}">
          ${ICONS.sun}
        </button>
        <button id="lang-toggle" class="btn-pill btn-lang" type="button" aria-label="${escapeHtml(t(lang, "language"))}">
          ${lang === "en" ? "සිං" : "EN"}
        </button>
      </div>
    </div>
  </header>
  <main>${body}</main>
  <footer>
    <p>© Mehewara Educational Platform · Faculty of Engineering, University of Ruhuna · <a href="#/privacy" data-nav>${escapeHtml(t(lang, "privacy"))}</a></p>
  </footer>
</div>`;
}

function renderStarParticles(count = 120) {
  let stars = "";
  for (let i = 0; i < count; i++) {
    const size = (1 + ((i * 13) % 20) / 10).toFixed(1) + "px";
    const left = ((i * 37) % 100).toFixed(1) + "%";
    const top = ((i * 53) % 100).toFixed(1) + "%";
    const moveX = (((i * 43) % 200) - 100) + "px";
    const moveY = (((i * 67) % 200) - 100) + "px";
    const duration = (3 + ((i * 11) % 40) / 10).toFixed(1) + "s";
    const moveDuration = (14 + ((i * 17) % 120) / 10).toFixed(1) + "s";
    const delay = "-" + (((i * 19) % 50) / 10).toFixed(1) + "s";
    stars += `<div class="star-particle" style="width:${size};height:${size};left:${left};top:${top};--moveX:${moveX};--moveY:${moveY};--duration:${duration};--move-duration:${moveDuration};--delay:${delay};"></div>`;
  }
  return `<div class="star-particles-container">${stars}</div>`;
}

function renderHeroBackground(manifest) {
  const galleryItems = (manifest.gallery ?? [])
    .map((g) => (g.image && typeof g.image === "object" ? g.image.url : (typeof g.image === "string" ? g.image : null)))
    .filter(Boolean);
  const photos = galleryItems.length > 0 ? galleryItems : ["/image/gorung.jpg"];

  const slides = photos.map((src, i) => `
    <div class="hero-slide ${i === 0 ? "active" : ""}" data-slide-index="${i}">
      <img src="${escapeHtml(src)}" alt="" draggable="false" />
    </div>`).join("");

  return `
    <div class="hero-bg-container" id="hero-bg">
      <div class="hero-slideshow">
        ${slides}
      </div>
      <div class="hero-bg-overlay"></div>
      ${renderStarParticles(120)}
    </div>`;
}

export function renderHome(manifest, lang, examFilter) {
  const allSubjects = manifest.subjects ?? [];
  const subjects = allSubjects.filter((s) => !examFilter || s.examType === examFilter);

  const cards = subjects.map((s) => `
    <a class="card subject-card" href="${routeHref("subject", { id: s.id })}" data-nav>
      <div class="subject-card-top">
        <div class="subject-icon-box">
          ${getSubjectIcon(s.code, s.examType)}
        </div>
        <span class="exam-pill exam-pill-${escapeHtml(s.examType)}">${escapeHtml(s.examType.toUpperCase())}</span>
      </div>
      <span class="card-title subject-card-title">${escapeHtml(pickText(s.title, lang))}</span>
      <span class="card-meta subject-card-code">${escapeHtml(s.examType.toUpperCase())} · ${escapeHtml(s.code)}</span>
      ${s.description ? `<p class="card-desc subject-card-desc">${escapeHtml(pickText(s.description, lang))}</p>` : ""}
      <div class="card-footer">
        <span>${escapeHtml(t(lang, "viewPapers"))}</span>
        ${ICONS.arrowRight}
      </div>
    </a>`).join("");

  // Hero section and Level Cards shown on top-level home view
  const heroSection = !examFilter ? `
    ${renderHeroBackground(manifest)}
    <div class="hero-container animate-reveal">
      <div class="hero-logo-wrapper animate-logo">
        <div class="hero-glow-back"></div>
        <img src="/image/mehewara%20logo.png" alt="Mehewara" class="hero-logo-img" draggable="false" />
        <p class="hero-subtitle">Mehewara Educational Platform</p>
      </div>
      <div class="hero-scroll-indicator animate-bounce-slow">
        <span>${escapeHtml(t(lang, "scrollDown"))}</span>
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" /></svg>
      </div>
    </div>

    <div class="section-intro animate-reveal">
      <span class="section-kicker">${escapeHtml(t(lang, "getStarted"))}</span>
      <h2 class="section-title">${escapeHtml(t(lang, "chooseLevel"))}</h2>
      <p class="section-desc">${escapeHtml(t(lang, "chooseLevelDesc"))}</p>
    </div>

    <div class="level-cards-grid animate-reveal">
      <!-- O/L Card -->
      <button class="level-card level-card-ol" data-filter="ol" type="button">
        <div class="level-card-watermark">${ICONS.layers}</div>
        <div class="level-card-icon">${ICONS.layers}</div>
        <h3 class="level-card-title">${escapeHtml(t(lang, "olTitle"))}</h3>
        <p class="level-card-desc">${escapeHtml(t(lang, "olDesc"))}</p>
        <div class="level-card-action">
          <span>${escapeHtml(t(lang, "studyActiveSubjects"))}</span>
          ${ICONS.arrowRight}
        </div>
      </button>

      <!-- A/L Card -->
      <button class="level-card level-card-al" data-filter="al" type="button">
        <div class="level-card-watermark">${ICONS.gradCap}</div>
        <div class="level-card-icon">${ICONS.gradCap}</div>
        <h3 class="level-card-title">${escapeHtml(t(lang, "alTitle"))}</h3>
        <p class="level-card-desc">${escapeHtml(t(lang, "alDesc"))}</p>
        <div class="level-card-action">
          <span>${escapeHtml(t(lang, "studyActiveSubjects"))}</span>
          ${ICONS.arrowRight}
        </div>
      </button>
    </div>
  ` : "";

  const body = `
    ${heroSection}
    <div class="subjects-section animate-reveal">
      <div class="filter-bar">
        <h1>${escapeHtml(t(lang, "subjects"))}</h1>
        <div class="filters" role="group">
          <button data-filter="" class="filter-pill" data-active="${!examFilter}">All</button>
          <button data-filter="ol" class="filter-pill" data-active="${examFilter === "ol"}">O/L</button>
          <button data-filter="al" class="filter-pill" data-active="${examFilter === "al"}">A/L</button>
        </div>
      </div>
      <div class="grid">${cards || `<p>${escapeHtml(t(lang, "empty"))}</p>`}</div>
    </div>`;
  return chrome(lang, manifest, "home", body);
}

export function renderSubject(manifest, lang, subjectId) {
  const subject = (manifest.subjects ?? []).find((s) => s.id === subjectId);
  if (!subject) return chrome(lang, manifest, "home", `<p>${escapeHtml(t(lang, "empty"))}</p>`);
  const papers = (manifest.papers ?? [])
    .filter((p) => p.subjectId === subjectId)
    .sort((a, b) => b.year - a.year || (a.slug < b.slug ? -1 : 1));
  const studyById = new Map((manifest.studyMaterials ?? []).map((s) => [s.id, s]));
  const rows = papers.map((p) => {
    const study = p.studyMaterialId ? studyById.get(p.studyMaterialId) : null;
    return `
    <li class="row paper-card">
      <div>
        <a href="${routeHref("paper", { id: p.id })}" data-nav>
          <strong class="paper-title">${escapeHtml(pickText(p.title, lang))}</strong>
          <div class="paper-meta">
            <span class="meta-pill">${ICONS.book} ${escapeHtml(t(lang, "year"))}: ${p.year}</span>
            <span class="meta-pill">${p.questionCount} ${escapeHtml(t(lang, "questions"))}</span>
            <span class="meta-pill">${ICONS.clock} ${escapeHtml(t(lang, "minutes", p.durationMinutes))}</span>
          </div>
        </a>
        ${study ? `<div style="margin-top: 0.5rem;"><a class="chip" href="${routeHref("study", { id: study.id })}" data-nav>${ICONS.fileText} ${escapeHtml(t(lang, "studyMaterial"))}</a></div>` : ""}
      </div>
      <a class="paper-action-btn" href="${routeHref("paper", { id: p.id })}" data-nav>
        <span>${escapeHtml(t(lang, "startPractice"))}</span>
        ${ICONS.arrowRight}
      </a>
    </li>`;
  }).join("");
  const body = `
    <div class="view-header animate-reveal">
      <p><a class="back-btn" href="#/" data-nav>${ICONS.arrowLeft} <span>${escapeHtml(t(lang, "back"))}</span></a></p>
      <div class="subject-hero">
        <span class="exam-pill exam-pill-${escapeHtml(subject.examType)}">${escapeHtml(subject.examType.toUpperCase())} · ${escapeHtml(subject.code)}</span>
        <h1>${escapeHtml(pickText(subject.title, lang))}</h1>
        ${subject.description ? `<p class="dim">${escapeHtml(pickText(subject.description, lang))}</p>` : ""}
      </div>
    </div>
    <div class="animate-reveal">
      <h2 style="margin-bottom: 1rem;">${escapeHtml(t(lang, "papers"))}</h2>
      <ul class="list">${rows || `<li class="row">${escapeHtml(t(lang, "noPapers"))}</li>`}</ul>
    </div>`;
  return chrome(lang, manifest, "home", body);
}

export function renderPaper(manifest, lang, paperId, selections, revealed) {
  const paper = (manifest.papers ?? []).find((p) => p.id === paperId);
  if (!paper) return chrome(lang, manifest, "home", `<p>${escapeHtml(t(lang, "empty"))}</p>`);
  const questions = (manifest.questions ?? [])
    .filter((q) => q.paperId === paperId)
    .sort((a, b) => a.number - b.number);
  const done = answeredCount(selections);
  const blocks = questions.map((q) => {
    const picked = selections[q.id] ?? [];
    const options = q.options.map((opt, oi) => `
      <label class="opt">
        <input type="checkbox" data-q="${escapeHtml(q.id)}" value="${oi}" ${picked.includes(oi) ? "checked" : ""} />
        <span class="opt-html">${opt.html}</span>
      </label>`).join("");
    const answerLine = picked.length > 0
      ? `<p class="your-answer">${escapeHtml(t(lang, "yourAnswer"))}: ${picked.map((n) => n + 1).join(", ")}</p>`
      : `<p class="your-answer dim">${escapeHtml(t(lang, "notAnswered"))}</p>`;
    const expl = revealed[q.id] && q.explanationHtml
      ? `<details open class="explanation-box"><summary>${escapeHtml(t(lang, "explanation"))}</summary><div class="rich">${q.explanationHtml}</div></details>`
      : (q.explanationHtml
        ? `<button data-reveal="${escapeHtml(q.id)}" type="button">${escapeHtml(t(lang, "showExplanation"))}</button>`
        : "");
    return `
    <section class="question" id="q-${escapeHtml(q.id)}">
      <div class="q-header">
        <span class="q-badge">Q${q.number}</span>
      </div>
      <div class="rich mhw-question-content">${q.questionHtml}</div>
      <div class="opts">${options}</div>
      ${answerLine}
      ${expl}
    </section>`;
  }).join("");
  const body = `
    <div class="practice-header animate-reveal">
      <a class="back-btn" style="margin-bottom: 0;" href="${routeHref("subject", { id: paper.subjectId })}" data-nav>${ICONS.arrowLeft} <span>${escapeHtml(t(lang, "back"))}</span></a>
      <div style="text-align: center;">
        <h2 style="font-size: 1.125rem; font-weight: 700; margin: 0;">${escapeHtml(pickText(paper.title, lang))}</h2>
        <span class="dim" style="font-size: 0.75rem;">${escapeHtml(t(lang, "practiceSession"))}</span>
      </div>
      <span class="progress-pill">${escapeHtml(t(lang, "answeredOf", done, questions.length))}</span>
    </div>
    <div class="animate-reveal">
      ${blocks}
      <button id="finish-attempt" type="button">${escapeHtml(t(lang, "finishAttempt"))}</button>
      <p id="attempt-note" class="dim" aria-live="polite"></p>
    </div>`;
  return chrome(lang, manifest, "home", body);
}

export function renderStudy(manifest, lang, studyId) {
  const study = (manifest.studyMaterials ?? []).find((s) => s.id === studyId);
  if (!study) return chrome(lang, manifest, "home", `<p>${escapeHtml(t(lang, "empty"))}</p>`);
  const body = `
    <div class="view-header animate-reveal">
      <p><a class="back-btn" href="${routeHref("subject", { id: study.subjectId })}" data-nav>${ICONS.arrowLeft} <span>${escapeHtml(t(lang, "back"))}</span></a></p>
      <h1>${escapeHtml(pickText(study.title, lang))}</h1>
      ${study.description ? `<p class="dim">${escapeHtml(pickText(study.description, lang))}</p>` : ""}
      <p style="margin-top: 1.5rem;"><a class="btn paper-action-btn" href="${escapeHtml(study.media.url)}" target="_blank" rel="noopener">${ICONS.fileText} ${escapeHtml(t(lang, "openDocument"))}</a></p>
    </div>`;
  return chrome(lang, manifest, "home", body);
}

export function renderGallery(manifest, lang) {
  const items = [...(manifest.gallery ?? [])].sort((a, b) => Number(b.pinned) - Number(a.pinned) || a.sortOrder - b.sortOrder);
  const cards = items.map((g) => `
    <figure class="shot gallery-card" data-lightbox-src="${escapeHtml(g.image.url)}" data-lightbox-title="${escapeHtml(pickText(g.title, lang))}">
      ${g.pinned ? `<span class="pinned-badge">★ Pinned</span>` : ""}
      <img src="${escapeHtml(g.image.url)}" alt="${escapeHtml(pickText(g.altText, lang))}" loading="lazy" />
      <figcaption>${escapeHtml(pickText(g.title, lang))}</figcaption>
    </figure>`).join("");
  const body = `
    <div class="gallery-header animate-reveal">
      <h1>${escapeHtml(t(lang, "gallery"))}</h1>
      <p class="dim" style="margin-top: 0.5rem;">Memories and events from Faculty of Engineering</p>
    </div>
    <div class="shots gallery-grid animate-reveal">${cards || `<p>${escapeHtml(t(lang, "empty"))}</p>`}</div>
    <div id="gallery-lightbox" class="lightbox-modal" style="display: none;">
      <div class="lightbox-content">
        <button id="lightbox-close" class="lightbox-close" type="button">&times;</button>
        <img id="lightbox-img" src="" alt="" />
        <p id="lightbox-caption" class="lightbox-caption"></p>
      </div>
    </div>`;
  return chrome(lang, manifest, "gallery", body);
}

export function renderContentPage(manifest, lang, slug) {
  const page = (manifest.pages ?? []).find((p) => p.slug === slug);
  if (!page) return chrome(lang, manifest, "home", `<p>${escapeHtml(t(lang, "empty"))}</p>`);
  const body = `
    <div class="privacy-box animate-reveal">
      <h1>${escapeHtml(pickText(page.title, lang))}</h1>
      <div class="rich" style="margin-top: 1rem;">${escapeHtml(pickText(page.body, lang))}</div>
    </div>`;
  return chrome(lang, manifest, "home", body);
}

export function renderAbout(manifest, lang) {
  const about = manifest.about;
  if (!about || (!about.description && !about.image)) {
    return chrome(lang, manifest, "about", `<p>${escapeHtml(t(lang, "empty"))}</p>`);
  }
  const desc = about?.description ? `<p class="about-desc">${escapeHtml(about.description)}</p>` : `<p>${escapeHtml(t(lang, "empty"))}</p>`;
  const img = about?.image ? `<img src="${escapeHtml(about.image.url)}" alt="Mehewara" class="about-avatar" loading="lazy" />` : "";
  const social = about?.social
    ? ["facebookUrl", "youtubeUrl", "linkedinUrl"]
      .filter((k) => about.social[k])
      .map((k) => `<a class="social-link" href="${escapeHtml(about.social[k])}" target="_blank" rel="noopener">${escapeHtml(k.replace("Url", ""))}</a>`)
      .join(" ")
    : "";
  const body = `
    <div class="about-box animate-reveal">
      ${img}
      <h1 style="margin-bottom: 0.5rem;">${escapeHtml(t(lang, "about"))}</h1>
      <p class="about-faculty">FACULTY OF ENGINEERING, UNIVERSITY OF RUHUNA<br>ORGANISED BY THE ENGINEERING STUDENTS' UNION</p>
      ${desc}
      ${social ? `<div class="social-links">${social}</div>` : ""}
    </div>`;
  return chrome(lang, manifest, "about", body);
}

export function renderPrivacy(manifest, lang) {
  const privacy = manifest.privacy;
  const body = privacy
    ? `<div class="privacy-box animate-reveal">
        <h1 style="margin-bottom: 1rem;">${escapeHtml(t(lang, "privacy"))}</h1>
        <p class="dim" style="font-size: 1.0625rem; margin-bottom: 1.5rem;">${escapeHtml(privacy.statement)}</p>
        ${privacy.fullHtml ? `<div class="rich">${privacy.fullHtml}</div>` : ""}
      </div>`
    : `<p>${escapeHtml(t(lang, "empty"))}</p>`;
  return chrome(lang, manifest, "privacy", body);
}

export function renderAttempts(manifest, lang, attempts) {
  const rows = [...(attempts ?? [])].reverse().map((a) => {
    const paper = (manifest.papers ?? []).find((p) => p.id === a.paperId);
    const when = a.completedAt ? new Date(a.completedAt).toLocaleString() : t(lang, "inProgress");
    return `<li class="row paper-card">
      <div>
        <strong class="paper-title">${escapeHtml(paper ? pickText(paper.title, lang) : a.paperId)}</strong>
        <div class="paper-meta">
          <span class="meta-pill">${ICONS.clock} ${escapeHtml(when)}</span>
          <span class="meta-pill">${a.answers.length} ${escapeHtml(t(lang, "questions"))}</span>
        </div>
      </div>
    </li>`;
  }).join("");
  const body = `
    <div class="animate-reveal">
      <h1 style="margin-bottom: 1.5rem;">${escapeHtml(t(lang, "attempts"))}</h1>
      <ul class="list">${rows || `<li class="row">${escapeHtml(t(lang, "attemptsEmpty"))}</li>`}</ul>
    </div>`;
  return chrome(lang, manifest, "attempts", body);
}

export function renderLoading(lang) {
  return `<main><div class="spinner-box"><div class="spinner"></div><p aria-live="polite">${escapeHtml(t(lang, "loading"))}</p></div></main>`;
}

export function renderError(lang, onRetry) {
  void onRetry;
  return `<main><div class="about-box animate-reveal"><p role="alert" style="color: #ef4444; font-weight: 700; margin-bottom: 1rem;">${escapeHtml(t(lang, "loadFailed"))}</p><button id="retry-load" class="btn paper-action-btn" type="button">${escapeHtml(t(lang, "retry"))}</button></div></main>`;
}
