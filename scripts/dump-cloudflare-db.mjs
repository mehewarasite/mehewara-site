import fs from 'fs';
import path from 'path';

const API_BASE = 'https://mehewara-v2-api-production.mehewara-site.workers.dev';
const ADMIN_SECRET = 'a282c930e0a1d9136f9390170be404f1d5dd98a17b9ab55cd8cd65d04985fdb7';

async function fetchJson(endpoint) {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    headers: {
      'Authorization': `Bearer ${ADMIN_SECRET}`,
      'Accept': 'application/json'
    }
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} on ${endpoint}: ${await res.text()}`);
  }
  return res.json();
}

async function fetchAllPaged(endpoint) {
  let items = [];
  let cursor = null;
  do {
    const sep = endpoint.includes('?') ? '&' : '?';
    const url = `${endpoint}${sep}limit=100${cursor ? `&cursor=${cursor}` : ''}`;
    const data = await fetchJson(url);
    items = items.concat(data.items || []);
    cursor = data.nextCursor || null;
  } while (cursor);
  return items;
}

async function main() {
  console.log('Fetching subjects from Cloudflare D1...');
  const subjects = await fetchAllPaged('/api/v1/admin/subjects');
  console.log(`Found ${subjects.length} subjects.`);

  console.log('Fetching papers from Cloudflare D1...');
  const papers = await fetchAllPaged('/api/v1/admin/papers');
  console.log(`Found ${papers.length} papers.`);

  console.log('Fetching all questions paper by paper from Cloudflare D1...');
  const questionsByPaper = {};
  let totalQuestions = 0;
  let correctOptionSummary = {
    opt0: 0,
    opt1: 0,
    opt2: 0,
    opt3: 0,
    opt4: 0,
    noAnswers: 0,
    allCorrect: 0,
    sampleQuestions: []
  };

  for (let i = 0; i < papers.length; i++) {
    const paper = papers[i];
    process.stdout.write(`[${i + 1}/${papers.length}] Paper ${paper.title?.en || paper.slug}... `);
    try {
      const qList = await fetchAllPaged(`/api/v1/admin/questions?paperId=${paper.id}`);
      questionsByPaper[paper.id] = qList;
      totalQuestions += qList.length;
      console.log(`${qList.length} questions.`);

      for (const q of qList) {
        const correctIndexes = q.correctOptionIndexes || [];
        const isAll = q.isAllCorrect;
        if (isAll) {
          correctOptionSummary.allCorrect++;
        } else if (correctIndexes.length === 0) {
          correctOptionSummary.noAnswers++;
        } else {
          for (const idx of correctIndexes) {
            if (idx === 0) correctOptionSummary.opt0++;
            else if (idx === 1) correctOptionSummary.opt1++;
            else if (idx === 2) correctOptionSummary.opt2++;
            else if (idx === 3) correctOptionSummary.opt3++;
            else if (idx === 4) correctOptionSummary.opt4++;
          }
        }

        if (correctOptionSummary.sampleQuestions.length < 5) {
          correctOptionSummary.sampleQuestions.push({
            id: q.id,
            paperId: q.paperId,
            number: q.number,
            answerMode: q.answerMode,
            correctOptionIndexes: q.correctOptionIndexes,
            isAllCorrect: q.isAllCorrect,
            options: q.options?.map(o => ({ sortOrder: o.sortOrder, isCorrect: o.isCorrect, text: o.html?.slice(0, 50) }))
          });
        }
      }
    } catch (e) {
      console.log(`Error: ${e.message}`);
    }
  }

  console.log('\n--- D1 Question Answer Statistics ---');
  console.log(`Total questions in D1: ${totalQuestions}`);
  console.log(`Option 0 (Option 1) correct count: ${correctOptionSummary.opt0}`);
  console.log(`Option 1 (Option 2) correct count: ${correctOptionSummary.opt1}`);
  console.log(`Option 2 (Option 3) correct count: ${correctOptionSummary.opt2}`);
  console.log(`Option 3 (Option 4) correct count: ${correctOptionSummary.opt3}`);
  console.log(`Option 4 (Option 5) correct count: ${correctOptionSummary.opt4}`);
  console.log(`All Correct count: ${correctOptionSummary.allCorrect}`);
  console.log(`No Answers count: ${correctOptionSummary.noAnswers}`);

  console.log('\nSample Questions:');
  console.log(JSON.stringify(correctOptionSummary.sampleQuestions, null, 2));

  console.log('\nSaving full local dump...');
  const fullDump = {
    exportedAt: new Date().toISOString(),
    apiBase: API_BASE,
    counts: {
      subjects: subjects.length,
      papers: papers.length,
      totalQuestions: totalQuestions
    },
    subjects,
    papers,
    questionsByPaper
  };

  const dumpPath = path.resolve('cloudflare_full_database_dump.json');
  fs.writeFileSync(dumpPath, JSON.stringify(fullDump, null, 2), 'utf8');
  console.log(`Full dump saved to: ${dumpPath} (${(fs.statSync(dumpPath).size / 1024 / 1024).toFixed(2)} MB)`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
