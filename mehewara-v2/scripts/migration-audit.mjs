#!/usr/bin/env node
/**
 * Read-only Supabase inventory audit. Dry-run is the default and performs no
 * network calls. Execute mode performs read-only requests only — GET for
 * REST tables and bucket metadata, plus POST for the Storage object listing,
 * which has no GET form (the body carries only prefix/limit/offset/sort, and
 * the call never writes). Produces a redacted count/byte inventory for each
 * requested table and storage bucket.
 *
 * Output (execute mode):
 *   - For each table: HTTP status, count header value (or "n/a"), source
 *     export timestamp. Table names and counts only; no row data.
 *   - For each bucket: bucket id, public flag, total object count, total bytes.
 *   - Final overall exit code is non-zero if any read failed.
 */
const args = new Set(process.argv.slice(2));
if (args.has("--help")) {
  console.log("Usage: node scripts/migration-audit.mjs [--dry-run|--execute]");
  process.exit(0);
}
if ([...args].some((arg) => !["--dry-run", "--execute"].includes(arg)) || (args.has("--dry-run") && args.has("--execute"))) {
  console.error("Choose one mode: --dry-run (default) or --execute.");
  process.exit(2);
}

const execute = args.has("--execute");
const url = process.env.MIGRATION_SOURCE_SUPABASE_URL?.replace(/\/$/, "");
const key = process.env.MIGRATION_SOURCE_SUPABASE_SERVICE_ROLE_KEY;
const tables = (process.env.MIGRATION_SOURCE_TABLES ?? "").split(",").map((value) => value.trim()).filter(Boolean);
const buckets = (process.env.MIGRATION_SOURCE_STORAGE_BUCKETS ?? "").split(",").map((value) => value.trim()).filter(Boolean);
const missing = [];
if (execute) {
  if (!url || url.includes("example")) missing.push("MIGRATION_SOURCE_SUPABASE_URL");
  if (!key || key.startsWith("replace-with-")) missing.push("MIGRATION_SOURCE_SUPABASE_SERVICE_ROLE_KEY");
  if (!tables.length || tables.some((table) => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(table))) missing.push("MIGRATION_SOURCE_TABLES (valid comma-separated identifiers)");
  if (!buckets.length || buckets.some((bucket) => bucket.startsWith("replace-with-") || /[/?#]/.test(bucket))) missing.push("MIGRATION_SOURCE_STORAGE_BUCKETS (comma-separated names)");
  if (missing.length) {
    console.error(`Refusing --execute; required environment is missing or still a placeholder: ${missing.join(", ")}`);
    process.exit(2);
  }
}

console.log(`Migration audit mode: ${execute ? "EXECUTE (read-only requests: GET, plus the read-only Storage listing POST)" : "DRY RUN (no network calls, no writes)"}`);
console.log(`Supabase source URL configured: ${Boolean(url && !url.includes("example"))}`);
console.log(`Service-role credential configured: ${Boolean(key && !key.startsWith("replace-with-"))}`);
console.log(`Expected REST table inputs: ${tables.length ? tables.join(", ") : "<set MIGRATION_SOURCE_TABLES>"}`);
console.log(`Expected Storage bucket inputs: ${buckets.length ? buckets.join(", ") : "<set MIGRATION_SOURCE_STORAGE_BUCKETS>"}`);
console.log("Expected inventory: table names/row counts, storage bucket names/object counts/bytes, and source export timestamps.");
console.log("Credentials and response bodies are never printed.");

if (!execute) {
  console.log("Dry run complete. Add explicit --execute and all required source variables only after reviewing this inventory.");
  process.exit(0);
}

const headers = { apikey: key, Authorization: `Bearer ${key}` };
let failed = false;
const inventory = { generatedAt: new Date().toISOString(), tables: [], buckets: [] };

async function readJson(endpoint) {
  const response = await fetch(endpoint, { method: "GET", headers });
  if (!response.ok) {
    await response.body?.cancel();
    return { status: response.status, body: null };
  }
  const body = await response.json();
  return { status: response.status, body };
}

for (const table of tables) {
  try {
    // Prefer the count header. Supabase returns the count when the request
    // includes `Prefer: count=exact` and a range. We deliberately read only
    // metadata here, never row data.
    const endpoint = `${url}/rest/v1/${table}?select=*&limit=0`;
    const response = await fetch(endpoint, { method: "GET", headers: { ...headers, Prefer: "count=exact" } });
    const count = response.headers.get("content-range")?.split("/")?.[1] ?? "n/a";
    await response.body?.cancel();
    if (!response.ok) failed = true;
    inventory.tables.push({ table, status: response.status, count, sourceExportTimestamp: null });
    console.log(`REST table ${table}: HTTP ${response.status}, count=${count}`);
  } catch (error) {
    failed = true;
    console.error(`REST table ${table}: request failed (${error.name ?? "unknown error"})`);
  }
}

for (const bucket of buckets) {
  try {
    // Bucket metadata first. Supabase Storage exposes the bucket list as a
    // GET on /storage/v1/bucket; specific bucket metadata is GET on
    // /storage/v1/bucket/{bucket}. We read only metadata here.
    const { status, body } = await readJson(`${url}/storage/v1/bucket/${bucket}`);
    if (status !== 200 || !body) {
      failed = true;
      inventory.buckets.push({ bucket, status, objectCount: null, totalBytes: null });
      console.log(`Storage bucket ${bucket}: HTTP ${status} (bucket metadata unavailable)`);
      continue;
    }
    let objectCount = 0;
    let totalBytes = 0;
    let offset = 0;
    const limit = 1000;
    let consecutiveFailures = 0;
    for (let page = 0; page < 1000; page += 1) {
      // Supabase Storage's object listing is a POST to
      // /storage/v1/object/list/{bucketName} (not /object/list/bucket/{bucketName}).
      // The body is JSON; GET returns 404. Fail loudly instead of silently
      // treating the failure as a successful empty page.
      const response = await fetch(`${url}/storage/v1/object/list/${encodeURIComponent(bucket)}`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ prefix: "", limit, offset, sortBy: { column: "name", order: "asc" } }),
      });
      if (!response.ok) {
        consecutiveFailures += 1;
        if (consecutiveFailures >= 3) {
          failed = true;
          console.error(`Storage bucket ${bucket}: list failed after 3 attempts (HTTP ${response.status})`);
          break;
        }
        await response.body?.cancel();
        continue;
      }
      consecutiveFailures = 0;
      const listBody = await response.json();
      if (!Array.isArray(listBody) || listBody.length === 0) break;
      objectCount += listBody.length;
      for (const entry of listBody) {
        const size = typeof entry?.metadata?.size === "number" ? entry.metadata.size : typeof entry?.size === "number" ? entry.size : 0;
        totalBytes += size;
      }
      if (listBody.length < limit) break;
      offset += limit;
    }
    inventory.buckets.push({ bucket, status, public: Boolean(body.public), objectCount, totalBytes });
    console.log(`Storage bucket ${bucket}: HTTP ${status}, public=${Boolean(body.public)}, objects=${objectCount}, bytes=${totalBytes}`);
  } catch (error) {
    failed = true;
    console.error(`Storage bucket ${bucket}: request failed (${error.name ?? "unknown error"})`);
  }
}

console.log(`Inventory summary: ${JSON.stringify(inventory)}`);
if (failed) process.exit(1);
console.log("Read-only audit completed; no source or destination writes were attempted.");
