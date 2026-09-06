#!/usr/bin/env node
/**
 * Builds the Phase-2 SPA: copies `public/` to `dist/`, ships `src/*.js` as
 * immutable `dist/assets/` modules plus `src/styles.css`, and writes an
 * `index.html` that boots the app from the `api-base-url` meta tag (the
 * only runtime config; baked at build time from VITE_API_BASE_URL).
 */
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");

const APP_MODULES = ["lib.js", "i18n.js", "api.js", "views.js", "app.js"];

export function build(outDir = dist, apiBaseUrl = process.env.VITE_API_BASE_URL ?? "") {
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  const publicDir = join(root, "public");
  if (existsSync(publicDir)) cpSync(publicDir, outDir, { recursive: true });
  const assetsDir = join(outDir, "assets");
  mkdirSync(assetsDir, { recursive: true });
  const srcDir = join(root, "src");
  for (const module of APP_MODULES) {
    const from = join(srcDir, module);
    if (!existsSync(from)) throw new Error(`web build: src/${module} is missing`);
    cpSync(from, join(assetsDir, module));
  }
  const cssFrom = join(srcDir, "styles.css");
  if (!existsSync(cssFrom)) throw new Error("web build: src/styles.css is missing");
  cpSync(cssFrom, join(outDir, "styles.css"));
  const api = String(apiBaseUrl).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  writeFileSync(join(outDir, "index.html"), `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="api-base-url" content="${api}" />
<title>Mehewara v2</title>
<link rel="stylesheet" href="/styles.css" />
</head>
<body>
<div id="root"></div>
<script type="module" src="/assets/app.js"></script>
</body>
</html>
`);
  return outDir;
}

const invokedDirectly = process.argv[1] === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  build();
  console.log("web SPA built: apps/web/dist/index.html + assets/");
}
