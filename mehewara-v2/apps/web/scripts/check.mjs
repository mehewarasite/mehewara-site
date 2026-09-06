#!/usr/bin/env node
/**
 * Verifies the built SPA: dist/index.html exists with the API meta tag,
 * mount point, stylesheet, and module boot script; dist/assets/ ships every
 * app module; the Pages _headers/_redirects ship alongside (the redirects
 * file carries the SPA fallback `/* /index.html 200`).
 * Used by `npm run check` and the test suite.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const APP_MODULES = ["lib.js", "i18n.js", "api.js", "views.js", "app.js"];

export function check(dist = join(dirname(fileURLToPath(import.meta.url)), "..", "dist")) {
  const failures = [];
  const htmlPath = join(dist, "index.html");
  if (!existsSync(htmlPath)) {
    failures.push("dist/index.html is missing (run npm run build --workspace @mehewara-v2/web)");
  } else {
    const html = readFileSync(htmlPath, "utf8");
    if (!html.includes('name="api-base-url"')) failures.push("index.html has no api-base-url meta tag");
    if (!html.includes('id="root"')) failures.push("index.html has no #root mount point");
    if (!html.includes('src="/assets/app.js"')) failures.push("index.html does not boot /assets/app.js");
    if (!html.includes('href="/styles.css"')) failures.push("index.html does not link /styles.css");
  }
  for (const module of APP_MODULES) {
    if (!existsSync(join(dist, "assets", module))) failures.push(`dist/assets/${module} is missing (src/ was not shipped)`);
  }
  if (!existsSync(join(dist, "styles.css"))) failures.push("dist/styles.css is missing (src/ was not shipped)");
  for (const file of ["_headers", "_redirects"]) {
    if (!existsSync(join(dist, file))) failures.push(`dist/${file} is missing (public/ was not copied)`);
  }
  return failures;
}

const invokedDirectly = process.argv[1] === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const failures = check();
  if (failures.length) {
    for (const failure of failures) console.error(`web check: ${failure}`);
    process.exit(1);
  }
  console.log("web check passed: SPA artifacts are present.");
}
