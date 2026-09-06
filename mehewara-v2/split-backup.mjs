import fs from "fs";

const file = JSON.parse(fs.readFileSync("mehewara-v2-backup.json", "utf-8"));
const backup = file.backup;

const CHUNK_SIZE = 500;
const total = backup.questions.length;
console.log(`Total questions: ${total}`);

for (let i = 0; i < Math.ceil(total / CHUNK_SIZE); i++) {
  const start = i * CHUNK_SIZE;
  const end = Math.min((i + 1) * CHUNK_SIZE, total);
  
  const chunkBackup = {
    ...backup,
    subjects: i === 0 ? backup.subjects : [],
    papers: i === 0 ? backup.papers : [],
    studyMaterials: i === 0 ? backup.studyMaterials : [],
    galleryItems: i === 0 ? backup.galleryItems : [],
    contentPages: i === 0 ? backup.contentPages : [],
    about: i === 0 ? backup.about : null,
    privacy: i === 0 ? backup.privacy : null,
    questions: backup.questions.slice(start, end),
  };
  
  const chunkFile = {
    ...file,
    sourceChecksum: file.sourceChecksum,
    backup: chunkBackup
  };
  
  fs.writeFileSync(`mehewara-v2-backup-part${i + 1}.json`, JSON.stringify(chunkFile, null, 2));
  console.log(`Wrote part ${i + 1} with ${chunkBackup.questions.length} questions.`);
}
