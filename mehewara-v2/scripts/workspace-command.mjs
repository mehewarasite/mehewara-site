#!/usr/bin/env node
/**
 * Run common commands for the planned workspaces. The contracts package is a
 * build prerequisite for the API. Web is a static shell (its Phase 2 SPA
 * replaces the build output); API and contracts are required in this phase.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";

const command = process.argv[2];
const supported = new Set(["dev", "check", "lint", "test", "build"]);
if (!supported.has(command)) {
  console.error(`Usage: node scripts/workspace-command.mjs ${[...supported].join("|")}`);
  process.exit(2);
}

const expected = new Set(["@mehewara-v2/contracts", "@mehewara-v2/api", "@mehewara-v2/web"]);
const required = new Set(["@mehewara-v2/contracts", "@mehewara-v2/api"]);
const workspaceDirs = ["apps", "packages"];
const found = new Map();
for (const parent of workspaceDirs) {
  const parentPath = join(process.cwd(), parent);
  if (!existsSync(parentPath)) continue;
  for (const child of readdirSync(parentPath, { withFileTypes: true })) {
    if (!child.isDirectory()) continue;
    const manifestPath = join(parentPath, child.name, "package.json");
    if (!existsSync(manifestPath)) continue;
    try {
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
      if (expected.has(manifest.name)) found.set(manifest.name, { name: manifest.name, scripts: manifest.scripts ?? {} });
    } catch (error) {
      console.error(`Unable to read ${manifestPath}: ${error.message}`);
      process.exitCode = 1;
    }
  }
}

const missingRequired = [...required].filter((name) => !found.has(name));
if (missingRequired.length) {
  console.error(`Required workspace package(s) are missing: ${missingRequired.join(", ")}`);
  process.exit(1);
}

const commandFor = (workspace, requested) => {
  if (requested === "check" && !workspace.scripts.check && workspace.scripts.typecheck) return "typecheck";
  return requested;
};

// Contracts is a build-only dependency today. It is always built first, but
// does not need lint/test scripts merely to make the API checkable.
const names = command === "build"
  ? ["@mehewara-v2/contracts", "@mehewara-v2/api", "@mehewara-v2/web"]
  : ["@mehewara-v2/api", "@mehewara-v2/web"];
const workspaces = [];
for (const name of names.filter((candidate) => found.has(candidate))) {
  const workspace = found.get(name);
  const actualCommand = commandFor(workspace, command);
  if (!workspace.scripts[actualCommand]) {
    console.error(`Workspace ${name} is implemented but has no '${command}' script${actualCommand !== command ? " or 'typecheck'" : ""}.`);
    process.exit(1);
  }
  workspaces.push({ name, command: actualCommand });
}

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const run = ({ name, command: actualCommand }) => new Promise((resolve) => {
  const child = spawn(npm, ["run", actualCommand, "--workspace", name], {
    cwd: process.cwd(),
    stdio: "inherit",
    env: process.env
  });
  child.on("close", (code, signal) => resolve(code ?? (signal ? 1 : 0)));
});

const codes = command === "dev"
  ? await Promise.all(workspaces.map(run))
  : [await workspaces.reduce(async (previous, workspace) => {
      const priorCode = await previous;
      return priorCode === 0 ? run(workspace) : priorCode;
    }, Promise.resolve(0))];
process.exit(codes.some((code) => code !== 0) ? 1 : 0);
