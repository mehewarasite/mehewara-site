import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build } from "../scripts/build.mjs";
import { check } from "../scripts/check.mjs";

describe("web static shell", () => {
  it("builds dist with index.html, meta tag, mount point, and Pages files", () => {
    const outDir = join(tmpdir(), `mehewara-web-test-${Date.now()}`);
    try {
      build(outDir, "https://api.example.test");
      assert.deepEqual(check(outDir), []);
      const html = readFileSync(join(outDir, "index.html"), "utf8");
      assert.match(html, /name="api-base-url" content="https:\/\/api\.example\.test"/);
      assert.match(html, /id="root"/);
      assert.ok(existsSync(join(outDir, "_headers")));
      assert.ok(existsSync(join(outDir, "_redirects")));
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });

  it("escapes the API base URL in the meta tag", () => {
    const outDir = join(tmpdir(), `mehewara-web-test-esc-${Date.now()}`);
    try {
      build(outDir, 'https://x.test/"onload="alert(1)');
      const html = readFileSync(join(outDir, "index.html"), "utf8");
      assert.doesNotMatch(html, /onload="alert\(1\)"/);
      assert.deepEqual(check(outDir), []);
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });
});
