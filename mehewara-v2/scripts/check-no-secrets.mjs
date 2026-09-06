#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";

const workspaceRoot = resolve(process.cwd());
const repositoryRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
const tracked = execFileSync("git", ["-C", repositoryRoot, "ls-files", "-co", "--exclude-standard", "-z"], { encoding: "utf8" })
  .split("\0").filter(Boolean)
  .map((file) => ({
    absolute: join(repositoryRoot, file),
    relative: relative(workspaceRoot, join(repositoryRoot, file))
  }))
  .filter(({ absolute }) => absolute === workspaceRoot || absolute.startsWith(`${workspaceRoot}/`));
// The deployment workflows live at the repository root (GitHub only
// discovers `.github/workflows/` there), outside the workspace directory
// above — but they carry deployment tokens and project names, so scan the
// v2 ones explicitly. belt-and-braces if the workspace ever moves.
try {
  for (const entry of readdirSync(join(repositoryRoot, ".github", "workflows"))) {
    if (!/^v2-.*\.yml$/.test(entry)) continue;
    const absolute = join(repositoryRoot, ".github", "workflows", entry);
    if (tracked.some((file) => file.absolute === absolute)) continue;
    tracked.push({ absolute, relative: relative(workspaceRoot, absolute) });
  }
} catch { /* no parent workflows directory — nothing extra to scan */ }
const violations = [];
for (const { absolute, relative: file } of tracked) {
  const isExample = /(^|\/)\.env(?:\..+)?\.example$/.test(file);
  if (/(^|\/)\.env(?:\.|$)/.test(file) && !isExample) {
    violations.push(`${file} (dotenv file)`);
    continue;
  }
  if (isExample || [".png", ".jpg", ".jpeg", ".gif", ".ico", ".woff", ".woff2", ".pdf"].includes(extname(file))) continue;
  let content;
  try { content = readFileSync(absolute, "utf8"); } catch { continue; }
  const highConfidenceSecret = /(?:sk_live_[A-Za-z0-9]{16,}|re_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})/;
  if (highConfidenceSecret.test(content)) violations.push(`${file} (high-confidence secret pattern)`);
}

if (violations.length) {
  console.error("Potential credentials found in tracked files:");
  for (const violation of violations) console.error(`- ${violation}`);
  console.error("Remove the secret and rotate it before committing.");
  process.exit(1);
}
console.log(`Secret check passed for ${tracked.length} tracked workspace file(s); example environment files were ignored.`);
