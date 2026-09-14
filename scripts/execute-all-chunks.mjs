import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const chunkDir = 'C:\\Users\\induw\\mehewara-site\\scripts\\sql-chunks';
const files = fs.readdirSync(chunkDir).filter(f => f.endsWith('.sql')).sort();

console.log(`Starting execution of ${files.length} chunk files into Cloudflare D1...`);

for (let i = 0; i < files.length; i++) {
  const file = files[i];
  if (file === 'chunk_000.sql') {
    console.log(`[1/${files.length}] chunk_000.sql already executed, skipping.`);
    continue;
  }
  const fullPath = path.join(chunkDir, file);
  console.log(`[${i + 1}/${files.length}] Executing ${file}...`);
  try {
    const out = execSync(`npx wrangler d1 execute mehewara-v2-production --remote --file="${fullPath}"`, {
      cwd: 'C:\\Users\\induw\\mehewara-site\\mehewara-v2\\apps\\api',
      stdio: 'pipe',
      timeout: 120000
    });
    console.log(`  ✓ ${file} completed successfully.`);
  } catch (err) {
    console.error(`  ✗ Error on ${file}:`, err.stderr?.toString() || err.message);
    process.exit(1);
  }
}

console.log('All 10 chunks executed successfully into Cloudflare D1!');
