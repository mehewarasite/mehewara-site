import { readFileSync } from "fs";
import { createHash, createHmac } from "crypto";

// Load environment variables
const SUPABASE_URL = process.env.MIGRATION_SOURCE_SUPABASE_URL?.replace(/\/$/, "");
const SUPABASE_KEY = process.env.MIGRATION_SOURCE_SUPABASE_SERVICE_ROLE_KEY;
const B2_BUCKET = (process.env.B2_BUCKET ?? "mehewara").replace(/"/g, "");
const B2_KEY_ID = process.env.B2_KEY_ID;
const B2_APPLICATION_KEY = process.env.B2_APPLICATION_KEY;
const B2_REGION = "us-east-005";
const B2_ENDPOINT = "https://s3.us-east-005.backblazeb2.com";

if (!SUPABASE_URL || !SUPABASE_KEY || !B2_KEY_ID || !B2_APPLICATION_KEY) {
  console.error("Missing required environment variables.");
  process.exit(1);
}

// SigV4 helper for uploading objects to Backblaze B2 S3 API
async function putB2Object(key, buffer, contentType) {
  const now = new Date();
  const pad = (n) => n.toString().padStart(2, "0");
  const date = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}`;
  const datetime = `${date}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;
  const credentialScope = `${date}/${B2_REGION}/s3/aws4_request`;

  const bucketHost = `${B2_BUCKET}.${new URL(B2_ENDPOINT).host}`;
  const escapedKey = encodeURIComponent(key).replace(/%2F/g, "/");
  const canonicalUri = `/${escapedKey.replace(/^\/+/, "")}`;
  const canonicalQuery = "";

  const payloadHash = createHash("sha256").update(buffer).digest("hex");
  const canonicalHeaders = `content-length:${buffer.length}\ncontent-type:${contentType}\nhost:${bucketHost}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${datetime}\n`;
  const signedHeaders = "content-length;content-type;host;x-amz-content-sha256;x-amz-date";
  const canonicalRequest = ["PUT", canonicalUri, canonicalQuery, canonicalHeaders, signedHeaders, payloadHash].join("\n");

  const sha256Hex = (str) => createHash("sha256").update(str).digest("hex");
  const hmacSha = (k, d) => createHmac("sha256", k).update(d).digest();

  const kD = hmacSha("AWS4" + B2_APPLICATION_KEY, date);
  const kR = hmacSha(kD, B2_REGION);
  const kS = hmacSha(kR, "s3");
  const kSigning = hmacSha(kS, "aws4_request");

  const stringToSign = ["AWS4-HMAC-SHA256", datetime, credentialScope, sha256Hex(canonicalRequest)].join("\n");
  const signature = createHmac("sha256", kSigning).update(stringToSign).digest("hex");
  const authHeader = `AWS4-HMAC-SHA256 Credential=${B2_KEY_ID}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const res = await fetch(`https://${bucketHost}${canonicalUri}`, {
    method: "PUT",
    headers: {
      "Host": bucketHost,
      "Content-Length": String(buffer.length),
      "Content-Type": contentType,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": datetime,
      "Authorization": authHeader,
    },
    body: buffer,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`B2 PUT failed (${res.status}) for ${key}: ${text}`);
  }
}

async function main() {
  console.log("1. Loading gallery mappings from scripts/gallery-mappings.json...");
  const d1Raw = readFileSync("scripts/gallery-mappings.json", "utf8");
  const d1Parsed = JSON.parse(d1Raw);
  const rows = d1Parsed[0]?.results || [];
  console.log(`Loaded ${rows.length} gallery mappings.`);

  const keyMap = new Map();
  for (const r of rows) {
    keyMap.set(r.source_legacy_id, {
      imageKey: r.image_object_key,
      thumbKey: r.thumbnail_object_key,
    });
  }

  console.log("2. Fetching gallery records with image_hex from Supabase...");
  const sbRes = await fetch(`${SUPABASE_URL}/rest/v1/gallery?select=id,title,image_hex,mime_type`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }
  });
  if (!sbRes.ok) throw new Error(`Supabase gallery fetch failed: ${sbRes.status}`);
  const sbGallery = await sbRes.json();
  console.log(`Fetched ${sbGallery.length} gallery records from Supabase.`);

  let uploadedImages = 0;
  let uploadedThumbs = 0;

  for (const [idx, item] of sbGallery.entries()) {
    const mapping = keyMap.get(item.id);
    if (!mapping) {
      console.warn(`[${idx + 1}/${sbGallery.length}] No D1 mapping for legacy ID ${item.id}`);
      continue;
    }

    const hex = item.image_hex || "";
    if (!hex) {
      console.warn(`[${idx + 1}/${sbGallery.length}] Empty image_hex for ${item.title}`);
      continue;
    }

    const buffer = Buffer.from(hex, "hex");
    const mimeType = item.mime_type || "image/jpeg";

    // Upload full image
    await putB2Object(mapping.imageKey, buffer, mimeType);
    uploadedImages++;

    // Upload thumbnail (using same buffer so thumbnail requests resolve immediately)
    await putB2Object(mapping.thumbKey, buffer, mimeType);
    uploadedThumbs++;

    process.stdout.write(`✅ [${idx + 1}/${sbGallery.length}] Uploaded: ${item.title} (${(buffer.length / 1024).toFixed(1)} KB)\n`);
  }

  console.log("\n3. Uploading About Us image to B2...");
  const aboutUrl = "https://znolstwxybjibumbghoa.supabase.co/storage/v1/object/public/question-images/about-1783486421788.png";
  const aboutRes = await fetch(aboutUrl);
  if (aboutRes.ok) {
    const aboutBuf = Buffer.from(await aboutRes.arrayBuffer());
    const aboutKey = "legacy/supabase-storage/55ab1286-1e23-5110-958e-eb84674cb024.unknown";
    await putB2Object(aboutKey, aboutBuf, "image/png");
    console.log(`✅ Uploaded About Us image to ${aboutKey} (${(aboutBuf.length / 1024).toFixed(1)} KB)`);
  } else {
    console.error("Failed to fetch About Us image from Supabase:", aboutRes.status);
  }

  console.log(`\n🎉 Completed migration to B2: ${uploadedImages} images and ${uploadedThumbs} thumbnails uploaded successfully!`);
}

main().catch((err) => {
  console.error("Migration error:", err);
  process.exit(1);
});
