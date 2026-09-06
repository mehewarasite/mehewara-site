import fs from "fs";
import { transformLegacy } from "./migration-transform.mjs";

const source = JSON.parse(fs.readFileSync("legacy-export.json", "utf-8"));
const options = { publicBaseUrl: "https://api.mehewara.edu.lk" };

const plan = transformLegacy(source, options);

fs.writeFileSync("mehewara-v2-backup.json", JSON.stringify(plan.target.import.backup, null, 2));
fs.writeFileSync("mehewara-v2-publish.json", JSON.stringify(plan.target.publish, null, 2));
fs.writeFileSync("mehewara-v2-plan.json", JSON.stringify(plan, null, 2));

console.log("Transformation complete.");
console.log("Backup written to mehewara-v2-backup.json");
console.log("Publish manifest written to mehewara-v2-publish.json");
console.log(`Subjects: ${plan.counts.subjects}`);
console.log(`Papers: ${plan.counts.papers}`);
console.log(`Questions: ${plan.counts.questions}`);
console.log(`Gallery: ${plan.counts.galleryItems}`);
