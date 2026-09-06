#!/usr/bin/env node
/** Minimal static file server for local shell development. No dependencies. */
import { createServer } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "dist");
const port = Number(process.env.PORT ?? 5173);
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png" };

createServer((request, response) => {
  const pathname = normalize(new URL(request.url ?? "/", "http://localhost").pathname).replace(/^(\.\.[\/\\])+/, "");
  let file = join(root, pathname === "/" ? "index.html" : pathname);
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
  if (!existsSync(file)) file = join(root, "index.html");
  if (!existsSync(file)) {
    response.writeHead(503, { "Content-Type": "text/plain" });
    response.end("dist/ is missing: run npm run build --workspace @mehewara-v2/web first.");
    return;
  }
  response.writeHead(200, { "Content-Type": types[extname(file)] ?? "application/octet-stream" });
  response.end(readFileSync(file));
}).listen(port, () => console.log(`web shell serving ${root} on http://localhost:${port}`));
