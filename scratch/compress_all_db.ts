import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { JSDOM } from 'jsdom';

dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!);

// Threshold: compress images larger than 50 KB
const THRESHOLD_BYTES = 50 * 1024;

async function compressAllDb() {
  console.log('=== Scanning ENTIRE database for large images ===\n');

  // Step 1: Get all question IDs
  const { data: allIds, error: idErr } = await supabase
    .from('questions')
    .select('id, paper_id');

  if (idErr) {
    console.error('Failed to fetch question IDs:', idErr);
    return;
  }
  if (!allIds || allIds.length === 0) {
    console.log('No questions found in the database.');
    return;
  }

  console.log(`Found ${allIds.length} total questions across all papers.\n`);

  // Group by paper_id for reporting
  const paperMap = new Map<string, string[]>();
  for (const row of allIds) {
    const pid = row.paper_id || 'unknown';
    if (!paperMap.has(pid)) paperMap.set(pid, []);
    paperMap.get(pid)!.push(row.id);
  }
  console.log(`Papers found: ${paperMap.size}`);
  for (const [pid, ids] of paperMap) {
    console.log(`  - ${pid}: ${ids.length} questions`);
  }
  console.log('');

  let totalCompressed = 0;
  let totalSavedBytes = 0;
  let totalSkipped = 0;
  let totalAlreadySmall = 0;
  let questionsUpdated = 0;
  const errors: string[] = [];

  // Step 2: Fetch and process questions one at a time to avoid timeouts
  for (let i = 0; i < allIds.length; i++) {
    const qId = allIds[i].id;
    const paperId = allIds[i].paper_id || 'unknown';

    // Fetch full question data
    const { data: rows, error: fetchErr } = await supabase
      .from('questions')
      .select('*')
      .eq('id', qId);

    if (fetchErr) {
      console.error(`  [ERROR] Failed to fetch ${qId}: ${fetchErr.message}`);
      errors.push(`${qId}: ${fetchErr.message}`);
      continue;
    }
    if (!rows || rows.length === 0) continue;

    const row = rows[0];
    const question = row.data;
    let modified = false;

    // Process an HTML string, find <img> tags with base64 src, compress them
    const processHtml = async (html: string): Promise<string> => {
      if (!html || !html.includes('<img')) return html;

      const dom = new JSDOM(html);
      const imgs = dom.window.document.querySelectorAll('img');

      for (const img of imgs) {
        const src = img.getAttribute('src') || '';
        if (!src.startsWith('data:image/')) continue;

        const base64Data = src.split(',')[1];
        if (!base64Data) continue;

        const buffer = Buffer.from(base64Data, 'base64');

        if (buffer.length <= THRESHOLD_BYTES) {
          totalAlreadySmall++;
          continue;
        }

        // Skip already-compressed webp that's already small from a prior run
        const mimeMatch = src.match(/^data:image\/(\w+)/);
        const mime = mimeMatch ? mimeMatch[1] : 'unknown';

        console.log(`  [Q ${i + 1}/${allIds.length}] ${qId} | ${mime} | ${(buffer.length / 1024).toFixed(1)} KB`);

        try {
          const { Jimp } = await import('jimp');
          const image = await Jimp.read(buffer);

          if (image.bitmap.width > 1024) {
            image.resize({ w: 1024 });
          }

          const compressedBuffer = await image.getBuffer('image/jpeg', { quality: 75 });

          if (compressedBuffer.length < buffer.length) {
            const newSrc = `data:image/jpeg;base64,${compressedBuffer.toString('base64')}`;
            img.setAttribute('src', newSrc);
            modified = true;
            totalCompressed++;
            const saved = buffer.length - compressedBuffer.length;
            totalSavedBytes += saved;
            console.log(`    -> Compressed to ${(compressedBuffer.length / 1024).toFixed(1)} KB (saved ${(saved / 1024).toFixed(1)} KB)`);
          } else {
            totalSkipped++;
            console.log(`    -> Already optimal, skipping`);
          }
        } catch (e: any) {
          // Jimp can't decode webp — skip those
          if (e.message?.includes('webp')) {
            totalSkipped++;
            console.log(`    -> WebP (already compressed), skipping`);
          } else {
            console.error(`    -> Compression error: ${e.message}`);
            errors.push(`${qId}: ${e.message}`);
          }
        }
      }

      return dom.window.document.body.innerHTML;
    };

    // Process all HTML fields
    if (question.questionHtml) {
      question.questionHtml = await processHtml(question.questionHtml);
    }
    if (question.optionsHtml && Array.isArray(question.optionsHtml)) {
      for (let j = 0; j < question.optionsHtml.length; j++) {
        question.optionsHtml[j] = await processHtml(question.optionsHtml[j]);
      }
    }
    if (question.explanationHtml) {
      question.explanationHtml = await processHtml(question.explanationHtml);
    }

    // Update if modified
    if (modified) {
      const { error: updateErr } = await supabase
        .from('questions')
        .update({ data: question })
        .eq('id', row.id);

      if (updateErr) {
        console.error(`  [ERROR] Failed to update ${qId}: ${updateErr.message}`);
        errors.push(`${qId} update: ${updateErr.message}`);
      } else {
        questionsUpdated++;
      }
    }
  }

  // Summary
  console.log('\n========================================');
  console.log('         COMPRESSION COMPLETE');
  console.log('========================================');
  console.log(`Questions scanned:     ${allIds.length}`);
  console.log(`Questions updated:     ${questionsUpdated}`);
  console.log(`Images compressed:     ${totalCompressed}`);
  console.log(`Images already small:  ${totalAlreadySmall}`);
  console.log(`Images skipped:        ${totalSkipped}`);
  console.log(`Total space saved:     ${(totalSavedBytes / 1024 / 1024).toFixed(2)} MB`);
  if (errors.length > 0) {
    console.log(`Errors:                ${errors.length}`);
    for (const e of errors) {
      console.log(`  - ${e}`);
    }
  }
  console.log('========================================');
}

compressAllDb();
