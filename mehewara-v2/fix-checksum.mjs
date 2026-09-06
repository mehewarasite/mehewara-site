import fs from "fs";
import crypto from "crypto";
import fastJsonStableStringify from "fast-json-stable-stringify";

const file = JSON.parse(fs.readFileSync("mehewara-v2-backup.json", "utf-8"));
const hash = crypto.createHash("sha256");
hash.update(fastJsonStableStringify(file.backup));
const checksum = hash.digest("hex");

file.sourceChecksum = checksum;
fs.writeFileSync("mehewara-v2-backup.json", JSON.stringify(file, null, 2));
console.log("Checksum updated to", checksum);
