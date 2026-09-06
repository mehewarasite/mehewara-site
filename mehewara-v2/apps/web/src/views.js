/**
 * View renderers: manifest -> HTML strings. Mounted by app.js, which owns
 * all event wiring. Trust rule (see lib.js): manifest `*Html`/`html`
 * fields render as HTML (server-sanitized at publish time); everything
 * else is escaped at interpolation time.
 */
import { escapeHtml, pickText, routeHref, answeredCount } from "./lib.js";
import { t } from "./i18n.js";

function chrome(lang, manifest, active, body) {
  const pages = (manifest.pages ?? []).map((p) =>
    `<a href="${routeHref("page", { slug: p.slug })}" data-nav>${escapeHtml(pickText(p.title, lang))}</a>`).join("");
  return `
<header class="topbar">
  <a class="brand" href="#/" data-nav>Mehewara</a>
  <nav>
    <a href="#/" data-nav data-active="${active === "home"}">${escapeHtml(t(lang, "home"))}</a>
    <a href="#/gallery" data-nav data-active="${active === "gallery"}">${escapeHtml(t(lang, "gallery"))}</a>
    <a href="#/attempts" data-nav data-active="${active === "attempts"}">${escapeHtml(t(lang, "attempts"))}</a>
    ${pages}
    <a href="#/about" data-nav data-active="${active === "about"}">${escapeHtml(t(lang, "about"))}</a>
  </nav>
  <div class="prefs">
    <button id="lang-toggle" type="button" aria-label="${escapeHtml(t(lang, "language"))}">${lang === "en" ? "සිං" : "EN"}</button>
    <button id="theme-toggle" type="button" aria-label="${escapeHtml(t(lang, "theme"))}">◐</button>
  </div>
</header>
<main>${body}</main>
<footer><a href="#/privacy" data-nav>${escapeHtml(t(lang, "privacy"))}</a></footer>`;
}

export function renderHome(manifest, lang, examFilter) {
  const subjects = (manifest.subjects ?? []).filter((s) => !examFilter || s.examType === examFilter);
  const cards = subjects.map((s) => `
    <a class="card" href="${routeHref("subject", { id: s.id })}" data-nav>
      <span class="card-title">${escapeHtml(pickText(s.title, lang))}</span>
      <span class="card-meta">${escapeHtml(s.examType.toUpperCase())} · ${escapeHtml(s.code)}</span>
      ${s.description ? `<span class="card-desc">${escapeHtml(pickText(s.description, lang))}</span>` : ""}
    </a>`).join("");
  const body = `
    <h1>${escapeHtml(t(lang, "subjects"))}</h1>
    <div class="filters" role="group">
      <button data-filter="" data-active="${!examFilter}">All</button>
      <button data-filter="ol" data-active="${examFilter === "ol"}">O/L</button>
      <button data-filter="al" data-active="${examFilter === "al"}">A/L</button>
    </div>
    <div class="grid">${cards || `<p>${escapeHtml(t(lang, "empty"))}</p>`}</div>`;
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
    <li class="row">
      <a href="${routeHref("paper", { id: p.id })}" data-nav>
        <strong>${escapeHtml(pickText(p.title, lang))}</strong>
        <span>${escapeHtml(t(lang, "year"))}: ${p.year} · ${p.questionCount} ${escapeHtml(t(lang, "questions"))} · ${escapeHtml(t(lang, "minutes", p.durationMinutes))}</span>
      </a>
      ${study ? `<a class="chip" href="${routeHref("study", { id: study.id })}" data-nav>${escapeHtml(t(lang, "studyMaterial"))}</a>` : ""}
    </li>`;
  }).join("");
  const body = `
    <p><a href="#/" data-nav>← ${escapeHtml(t(lang, "back"))}</a></p>
    <h1>${escapeHtml(pickText(subject.title, lang))}</h1>
    <h2>${escapeHtml(t(lang, "papers"))}</h2>
    <ul class="list">${rows || `<li>${escapeHtml(t(lang, "noPapers"))}</li>`}</ul>`;
  return chrome(lang, manifest, "home", body);
}

export function renderPaper(manifest, lang, paperId, selections, revealed) {
  const paper = (manifest.papers ?? []).find((p) => p.id === paperId);
  if (!paper) return chrome(lang, manifest, "home", `<p>${escapeHtml(t(lang, "empty"))}</p>`);
  const questions = (manifest.questions ?? [])
    .filter((q) => q.paperId === paperId)
    .sort((a, b) => a.number - b.number);
  const done = answeredCount(selections);
  const blocks = questions.map((q, i) => {
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
      ? `<details open><summary>${escapeHtml(t(lang, "explanation"))}</summary><div class="rich">${q.explanationHtml}</div></details>`
      : (q.explanationHtml
        ? `<button data-reveal="${escapeHtml(q.id)}" type="button">${escapeHtml(t(lang, "showExplanation"))}</button>`
        : "");
    return `
    <section class="question" id="q-${escapeHtml(q.id)}">
      <h3>Q${q.number}</h3>
      <div class="rich">${q.questionHtml}</div>
      <div class="opts">${options}</div>
      ${answerLine}
      ${expl}
    </section>`;
  }).join("");
  const body = `
    <p><a href="${routeHref("subject", { id: paper.subjectId })}" data-nav>← ${escapeHtml(t(lang, "back"))}</a></p>
    <h1>${escapeHtml(t(lang, "practiceSession"))}: ${escapeHtml(pickText(paper.title, lang))}</h1>
    <p class="dim">${escapeHtml(t(lang, "answeredOf", done, questions.length))}</p>
    ${blocks}
    <button id="finish-attempt" type="button">${escapeHtml(t(lang, "finishAttempt"))}</button>
    <p id="attempt-note" class="dim" aria-live="polite"></p>`;
  return chrome(lang, manifest, "home", body);
}

export function renderStudy(manifest, lang, studyId) {
  const study = (manifest.studyMaterials ?? []).find((s) => s.id === studyId);
  if (!study) return chrome(lang, manifest, "home", `<p>${escapeHtml(t(lang, "empty"))}</p>`);
  const body = `
    <p><a href="${routeHref("subject", { id: study.subjectId })}" data-nav>← ${escapeHtml(t(lang, "back"))}</a></p>
    <h1>${escapeHtml(pickText(study.title, lang))}</h1>
    ${study.description ? `<p>${escapeHtml(pickText(study.description, lang))}</p>` : ""}
    <p><a class="btn" href="${escapeHtml(study.media.url)}" target="_blank" rel="noopener">${escapeHtml(t(lang, "openDocument"))}</a></p>`;
  return chrome(lang, manifest, "home", body);
}

export function renderGallery(manifest, lang) {
  const items = [...(manifest.gallery ?? [])].sort((a, b) => Number(b.pinned) - Number(a.pinned) || a.sortOrder - b.sortOrder);
  const cards = items.map((g) => `
    <figure class="shot">
      <img src="${escapeHtml(g.image.url)}" alt="${escapeHtml(pickText(g.altText, lang))}" loading="lazy" />
      <figcaption>${escapeHtml(pickText(g.title, lang))}</figcaption>
    </figure>`).join("");
  const body = `<h1>${escapeHtml(t(lang, "gallery"))}</h1><div class="shots">${cards || `<p>${escapeHtml(t(lang, "empty"))}</p>`}</div>`;
  return chrome(lang, manifest, "gallery", body);
}

export function renderContentPage(manifest, lang, slug) {
  const page = (manifest.pages ?? []).find((p) => p.slug === slug);
  if (!page) return chrome(lang, manifest, "home", `<p>${escapeHtml(t(lang, "empty"))}</p>`);
  const body = `<h1>${escapeHtml(pickText(page.title, lang))}</h1><p>${escapeHtml(pickText(page.body, lang))}</p>`;
  return chrome(lang, manifest, "home", body);
}

export function renderAbout(manifest, lang) {
  const about = manifest.about;
  const desc = about?.description ? `<p>${escapeHtml(about.description)}</p>` : `<p>${escapeHtml(t(lang, "empty"))}</p>`;
  const img = about?.image ? `<img src="${escapeHtml(about.image.url)}" alt="" loading="lazy" />` : "";
  const social = about?.social
    ? ["facebookUrl", "youtubeUrl", "linkedinUrl"]
      .filter((k) => about.social[k])
      .map((k) => `<a href="${escapeHtml(about.social[k])}" target="_blank" rel="noopener">${escapeHtml(k.replace("Url", ""))}</a>`)
      .join(" ")
    : "";
  const body = `<h1>${escapeHtml(t(lang, "about"))}</h1>${img}${desc}<p>${social}</p>`;
  return chrome(lang, manifest, "about", body);
}

export function renderPrivacy(manifest, lang) {
  const privacy = manifest.privacy;
  const body = privacy
    ? `<h1>${escapeHtml(t(lang, "privacy"))}</h1><p>${escapeHtml(privacy.statement)}</p>${privacy.fullHtml ? `<div class="rich">${privacy.fullHtml}</div>` : ""}`
    : `<p>${escapeHtml(t(lang, "empty"))}</p>`;
  return chrome(lang, manifest, "privacy", body);
}

export function renderAttempts(manifest, lang, attempts) {
  const rows = [...(attempts ?? [])].reverse().map((a) => {
    const paper = (manifest.papers ?? []).find((p) => p.id === a.paperId);
    const when = a.completedAt ? new Date(a.completedAt).toLocaleString() : t(lang, "inProgress");
    return `<li class="row"><span><strong>${escapeHtml(paper ? pickText(paper.title, lang) : a.paperId)}</strong>
      <span>${escapeHtml(when)} · ${a.answers.length} ${escapeHtml(t(lang, "questions"))}</span></span></li>`;
  }).join("");
  const body = `<h1>${escapeHtml(t(lang, "attempts"))}</h1><ul class="list">${rows || `<li>${escapeHtml(t(lang, "attemptsEmpty"))}</li>`}</ul>`;
  return chrome(lang, manifest, "attempts", body);
}

export function renderLoading(lang) {
  return `<main><p aria-live="polite">${escapeHtml(t(lang, "loading"))}</p></main>`;
}

export function renderError(lang, onRetry) {
  void onRetry;
  return `<main><p role="alert">${escapeHtml(t(lang, "loadFailed"))}</p><button id="retry-load" type="button">${escapeHtml(t(lang, "retry"))}</button></main>`;
}
