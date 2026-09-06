/**
 * migrate-media-to-b2.mjs
 *
 * Downloads all images from Supabase question-images bucket and uploads
 * to Backblaze B2 under legacy/supabase-storage/ prefix.
 *
 * Usage: node --env-file=.env scripts/migrate-media-to-b2.mjs
 */

import { S3Client, PutObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { createHash } from "crypto";

const SUPABASE_URL = process.env.MIGRATION_SOURCE_SUPABASE_URL?.replace(/\/$/, "");
const SUPABASE_KEY = process.env.MIGRATION_SOURCE_SUPABASE_SERVICE_ROLE_KEY;
const B2_BUCKET = (process.env.B2_BUCKET ?? "mehewara").replace(/"/g, "");

// B2 bucket is on us-east-005
const endpoint = "https://s3.us-east-005.backblazeb2.com";
const region = "us-east-005";

const missing = [];
if (!SUPABASE_URL) missing.push("MIGRATION_SOURCE_SUPABASE_URL");
if (!SUPABASE_KEY) missing.push("MIGRATION_SOURCE_SUPABASE_SERVICE_ROLE_KEY");
if (!process.env.B2_KEY_ID) missing.push("B2_KEY_ID");
if (!process.env.B2_APPLICATION_KEY) missing.push("B2_APPLICATION_KEY");
if (missing.length) { console.error("Missing env:", missing.join(", ")); process.exit(1); }

const s3 = new S3Client({
  endpoint,
  region,
  credentials: { accessKeyId: process.env.B2_KEY_ID, secretAccessKey: process.env.B2_APPLICATION_KEY },
  forcePathStyle: false,
});

// Exact same algorithm as migration-transform.mjs stableUuid()
// objectKey = legacy/supabase-storage/<stableUuid("media", "supabase-storage:supabase://<bucket>/<path>")>.unknown
function stableUuid(kind, sourceId) {
  const sha256 = (v) => createHash("sha256").update(v).digest("hex");
  const hex = sha256(`mehewara-v2:${kind}:${sourceId}`);
  const variant = ((parseInt(hex.slice(16, 18), 16) & 0x3f) | 0x80).toString(16).padStart(2, "0");
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-5${hex.slice(13,16)}-${variant}${hex.slice(18,20)}-${hex.slice(20,32)}`;
}

// Given a Supabase URL, compute the B2 objectKey
function supabaseUrlToObjectKey(url) {
  // e.g. https://xxx.supabase.co/storage/v1/object/public/question-images/file.png
  const m = url.match(/\/storage\/v1\/object\/(?:public|sign)\/([^/]+)\/(.+?)(?:\?|$)/);
  if (!m) return null;
  const bucket = decodeURIComponent(m[1]);
  const rawPath = decodeURIComponent(m[2].split("?")[0]);
  const sourceKey = `supabase-storage:supabase://${bucket}/${rawPath}`;
  const mediaId = stableUuid("media", sourceKey);
  return `legacy/supabase-storage/${mediaId}.unknown`;
}

function extractUrls() {
  const raw = readFileSync("legacy-export.json", "utf8");
  return [...new Set(
    raw.match(/https:\/\/[^/]+\.supabase\.co\/storage\/v1\/object\/public\/question-images\/[^"\\]+/g) ?? []
  )];
}

async function exists(key) {
  try { await s3.send(new HeadObjectCommand({ Bucket: B2_BUCKET, Key: key })); return true; }
  catch { return false; }
}

async function download(url) {
  const res = await fetch(url, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url.split("/").pop()}`);
  return {
    buf: Buffer.from(await res.arrayBuffer()),
    contentType: (res.headers.get("content-type") ?? "image/png").split(";")[0].trim()
  };
}

const PROGRESS_FILE = "scripts/.b2-upload-progress.json";
const CONCURRENCY = 6;

async function main() {
  const prog = existsSync(PROGRESS_FILE) ? JSON.parse(readFileSync(PROGRESS_FILE, "utf8")) : { done: [], failed: [] };
  const done = new Set(prog.done);
  const failed = new Set(prog.failed);

  const urls = extractUrls();
  console.log(`\n🚀 Supabase → Backblaze B2   bucket=${B2_BUCKET}   endpoint=${endpoint}`);
  console.log(`📦 ${urls.length} unique images | ✅ ${done.size} already done | ❌ ${failed.size} previously failed\n`);

  // Verify key mapping against backup before starting
  const backup = JSON.parse(readFileSync("mehewara-v2-backup.json", "utf8"));
  const inventoryKeys = new Set(backup.backup.mediaInventory.map(m => m.objectKey));
  const testUrl = urls[0];
  const testKey = supabaseUrlToObjectKey(testUrl);
  const match = inventoryKeys.has(testKey);
  if (!match) {
    console.error(`❌ Key mapping mismatch! URL: ${testUrl} → ${testKey}`);
    console.error("Key not found in media_inventory. Cannot proceed safely.");
    process.exit(1);
  }
  console.log(`✅ Key mapping verified: ${testUrl.split("/").pop()} → ${testKey}\n`);

  const todo = urls.filter(u => !done.has(u));
  let uploaded = 0, skipped = 0, failedCount = 0;

  const save = () => writeFileSync(PROGRESS_FILE, JSON.stringify({ done: [...done], failed: [...failed] }, null, 2));

  async function processUrl(url) {
    const key = supabaseUrlToObjectKey(url);
    if (!key) { console.warn(`⚠️  Could not derive key for ${url}`); return; }
    const filename = url.split("/").pop().split("?")[0];

    if (await exists(key)) {
      skipped++;
      done.add(url);
      return;
    }

    try {
      const { buf, contentType } = await download(url);
      await s3.send(new PutObjectCommand({
        Bucket: B2_BUCKET,
        Key: key,
        Body: buf,
        ContentType: contentType,
        ContentLength: buf.length,
      }));
      uploaded++;
      done.add(url);
      const total = uploaded + skipped;
      process.stdout.write(`✅ [${total}/${urls.length}] ${filename} (${(buf.length/1024).toFixed(0)}KB)\n`);
    } catch (e) {
      failedCount++;
      failed.add(url);
      process.stdout.write(`❌ ${filename}: ${e.message}\n`);
    }

    if ((uploaded + failedCount) % 20 === 0) save();
  }

  for (let i = 0; i < todo.length; i += CONCURRENCY) {
    await Promise.all(todo.slice(i, i + CONCURRENCY).map(u => processUrl(u)));
  }
  save();

  console.log(`\n🏁 Done!`);
  console.log(`   ✅ Uploaded:  ${uploaded}`);
  console.log(`   ⏭️  Skipped:   ${skipped}`);
  console.log(`   ❌ Failed:    ${failedCount}`);
  if (failedCount) { console.log("Re-run to retry failures."); process.exit(1); }
}

main().catch(e => { console.error(e); process.exit(1); });
