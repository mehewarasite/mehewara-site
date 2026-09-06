import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { escapeHtml, pickText, parseRoute, routeHref, buildAttempt, answeredCount, papersBySubject, questionsForPaper, emptyManifest } from "../src/lib.js";
import { t, getLang } from "../src/i18n.js";
import { renderHome, renderSubject, renderPaper, renderGallery, renderAbout, renderPrivacy } from "../src/views.js";

describe("escapeHtml", () => {
  it("escapes markup-significant characters", () => {
    assert.equal(escapeHtml('<script>alert("x")</script>'), "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
    assert.equal(escapeHtml("a'b&c"), "a&#39;b&amp;c");
    assert.equal(escapeHtml(null), "");
    assert.equal(escapeHtml(undefined), "");
  });
});

describe("pickText", () => {
  it("prefers the active language with English fallback", () => {
    assert.equal(pickText({ en: "Physics", si: "භෞතිකය" }, "si"), "භෞතිකය");
    assert.equal(pickText({ en: "Physics", si: "" }, "si"), "Physics");
    assert.equal(pickText({ en: "", si: "", ta: "பௌதிகம்" }, "en"), "பௌதிகம்");
    assert.equal(pickText(null, "en"), "");
    assert.equal(pickText("raw", "en"), "");
  });
});

describe("parseRoute", () => {
  it("parses hash routes and falls back to home", () => {
    assert.deepEqual(parseRoute("#/"), { name: "home", params: {} });
    assert.deepEqual(parseRoute(""), { name: "home", params: {} });
    assert.deepEqual(parseRoute("#/subject/abc"), { name: "subject", params: { id: "abc" } });
    assert.deepEqual(parseRoute("#/paper/p1"), { name: "paper", params: { id: "p1" } });
    assert.deepEqual(parseRoute("#/study/s1"), { name: "study", params: { id: "s1" } });
    assert.deepEqual(parseRoute("#/gallery"), { name: "gallery", params: {} });
    assert.deepEqual(parseRoute("#/page/terms"), { name: "page", params: { slug: "terms" } });
    assert.deepEqual(parseRoute("#/about"), { name: "about", params: {} });
    assert.deepEqual(parseRoute("#/privacy"), { name: "privacy", params: {} });
    assert.deepEqual(parseRoute("#/attempts"), { name: "attempts", params: {} });
    assert.deepEqual(parseRoute("#/nope"), { name: "home", params: {} });
    assert.deepEqual(parseRoute("#/subject"), { name: "home", params: {} });
  });

  it("round-trips route hrefs", () => {
    assert.equal(routeHref("subject", { id: "a/b" }), "#/subject/a%2Fb");
    assert.deepEqual(parseRoute(routeHref("page", { slug: "terms" })), { name: "page", params: { slug: "terms" } });
    assert.equal(routeHref("home"), "#/");
  });
});

describe("buildAttempt", () => {
  it("builds contract-shaped attempts without scores", () => {
    const attempt = buildAttempt("paper-1", [
      { questionId: "q1", selectedOptionIndexes: [2, 0] },
      { questionId: "q2", selectedOptionIndexes: [] },
    ], true);
    assert.equal(attempt.storage, "indexeddb");
    assert.equal(attempt.paperId, "paper-1");
    assert.equal(attempt.isCompleted, true);
    assert.deepEqual(attempt.answers, [
      { questionId: "q1", selectedOptionIndexes: [0, 2] },
      { questionId: "q2", selectedOptionIndexes: [] },
    ]);
    assert.ok(!("correctCount" in attempt), "no scores: the public manifest carries no answers");
    assert.equal(typeof attempt.startedAt, "number");
    assert.equal(typeof attempt.completedAt, "number");
  });
});

describe("answeredCount", () => {
  it("counts questions with at least one selection", () => {
    assert.equal(answeredCount({ a: [0], b: [], c: [1, 2] }), 2);
    assert.equal(answeredCount({}), 0);
    assert.equal(answeredCount(null), 0);
  });
});

describe("papersBySubject / questionsForPaper", () => {
  it("groups newest-first and orders by number", () => {
    const bySubject = papersBySubject([
      { id: "p1", subjectId: "s", year: 2022, slug: "b" },
      { id: "p2", subjectId: "s", year: 2024, slug: "a" },
      { id: "p3", subjectId: "t", year: 2023, slug: "c" },
    ]);
    assert.deepEqual(bySubject.get("s").map((p) => p.id), ["p2", "p1"]);
    assert.deepEqual(bySubject.get("t").map((p) => p.id), ["p3"]);
    const qs = questionsForPaper([
      { id: "q2", paperId: "p", number: 2 },
      { id: "q1", paperId: "p", number: 1 },
      { id: "qx", paperId: "other", number: 1 },
    ], "p");
    assert.deepEqual(qs.map((q) => q.id), ["q1", "q2"]);
  });
});

describe("i18n", () => {
  it("resolves strings with English fallback", () => {
    assert.equal(t("si", "home"), "මුල් පිටුව");
    assert.equal(t("en", "home"), "Home");
    assert.equal(t("xx", "home"), "Home");
    assert.equal(t("en", "missing-key"), "missing-key");
    assert.equal(t("en", "answeredOf", 2, 5), "2 of 5 answered");
  });

  it("defaults language to English outside browsers", () => {
    assert.equal(getLang(), "en");
  });
});

describe("empty manifest", () => {
  it("renders every view without crashing on nothing-published-yet", () => {
    const empty = emptyManifest();
    assert.match(renderHome(empty, "en", ""), /Nothing published yet/);
    assert.match(renderSubject(empty, "en", "bogus"), /Nothing published yet/);
    assert.match(renderPaper(empty, "en", "bogus", {}, {}), /Nothing published yet/);
    assert.match(renderGallery(empty, "en"), /Nothing published yet/);
    assert.match(renderAbout(empty, "en"), /Nothing published yet/);
    assert.match(renderPrivacy(empty, "en"), /Nothing published yet/);
  });
});
