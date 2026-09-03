import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Supabase credentials missing in .env');
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function migrateBase64Images() {
  console.log('=== Starting Migration: Base64 Images -> Supabase Storage ===\n');

  // Fetch all question IDs and data with pagination
  let allQuestions: any[] = [];
  let from = 0;
  const step = 1000;

  while (true) {
    const { data, error } = await supabase
      .from('questions')
      .select('id, paper_id, data')
      .range(from, from + step - 1);

    if (error) {
      console.error('Failed to load questions:', error);
      return;
    }
    if (!data || data.length === 0) break;
    allQuestions = allQuestions.concat(data);
    if (data.length < step) break;
    from += step;
  }

  console.log(`Total questions scanned: ${allQuestions.length}`);

  let totalImagesUploaded = 0;
  let totalQuestionsUpdated = 0;
  let totalBytesUploaded = 0;
  const errors: string[] = [];

  // Helper to upload a single base64 string to Supabase Storage and return its public URL
  const uploadBase64ToStorage = async (base64Str: string): Promise<string> => {
    const match = base64Str.match(/^data:image\/([a-zA-Z0-9+.-]+);base64,(.+)$/);
    if (!match) {
      throw new Error('Invalid base64 image format');
    }

    const rawMimeSub = match[1].toLowerCase();
    const base64Data = match[2];
    const buffer = Buffer.from(base64Data, 'base64');

    let ext = 'png';
    let mime = 'image/png';
    if (rawMimeSub.includes('webp')) {
      ext = 'webp';
      mime = 'image/webp';
    } else if (rawMimeSub.includes('jpeg') || rawMimeSub.includes('jpg')) {
      ext = 'jpg';
      mime = 'image/jpeg';
    } else if (rawMimeSub.includes('gif')) {
      ext = 'gif';
      mime = 'image/gif';
    } else if (rawMimeSub.includes('svg')) {
      ext = 'svg';
      mime = 'image/svg+xml';
    }

    const fileName = `diagrams/migrated_${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('question-images')
      .upload(fileName, buffer, {
        contentType: mime,
        upsert: true
      });

    if (uploadError) {
      throw uploadError;
    }

    const { data: { publicUrl } } = supabase.storage
      .from('question-images')
      .getPublicUrl(fileName);

    totalBytesUploaded += buffer.length;
    totalImagesUploaded++;

    return publicUrl;
  };

  // Process an HTML string, replacing all data:image/ with storage URLs
  const processHtml = async (html: string): Promise<string> => {
    if (!html || !html.includes('data:image/')) return html;

    const regex = /data:image\/[a-zA-Z0-9+.-]+;base64,[^"'\s>)]+/g;
    const matches = Array.from(new Set(html.match(regex) || []));

    let updatedHtml = html;
    for (const base64Str of matches) {
      try {
        const publicUrl = await uploadBase64ToStorage(base64Str);
        // Replace all occurrences of this base64 string
        updatedHtml = updatedHtml.split(base64Str).join(publicUrl);
        console.log(`  Uploaded image -> ${publicUrl}`);
      } catch (err: any) {
        console.error(`  Failed to upload base64 image:`, err.message);
        errors.push(`Upload failed: ${err.message}`);
      }
    }

    return updatedHtml;
  };

  for (let i = 0; i < allQuestions.length; i++) {
    const row = allQuestions[i];
    const qData = row.data;
    if (!qData) continue;

    const fullText = [
      qData.questionHtml,
      qData.explanationHtml,
      ...(qData.optionsHtml || [])
    ].filter(Boolean).join(' ');

    if (!fullText.includes('data:image/')) {
      continue;
    }

    console.log(`\n[${i + 1}/${allQuestions.length}] Processing Question ${row.id} (paper: ${row.paper_id})...`);

    let modified = false;

    if (qData.questionHtml && qData.questionHtml.includes('data:image/')) {
      const newHtml = await processHtml(qData.questionHtml);
      if (newHtml !== qData.questionHtml) {
        qData.questionHtml = newHtml;
        modified = true;
      }
    }

    if (qData.optionsHtml && Array.isArray(qData.optionsHtml)) {
      for (let oIdx = 0; oIdx < qData.optionsHtml.length; oIdx++) {
        if (qData.optionsHtml[oIdx] && qData.optionsHtml[oIdx].includes('data:image/')) {
          const newOpt = await processHtml(qData.optionsHtml[oIdx]);
          if (newOpt !== qData.optionsHtml[oIdx]) {
            qData.optionsHtml[oIdx] = newOpt;
            modified = true;
          }
        }
      }
    }

    if (qData.explanationHtml && qData.explanationHtml.includes('data:image/')) {
      const newExp = await processHtml(qData.explanationHtml);
      if (newExp !== qData.explanationHtml) {
        qData.explanationHtml = newExp;
        modified = true;
      }
    }

    if (modified) {
      const { error: updateError } = await supabase
        .from('questions')
        .update({ data: qData })
        .eq('id', row.id);

      if (updateError) {
        console.error(`Failed to update question ${row.id}:`, updateError.message);
        errors.push(`Update DB ${row.id}: ${updateError.message}`);
      } else {
        totalQuestionsUpdated++;
        console.log(`  Updated question ${row.id} in DB.`);
      }
    }
  }

  console.log('\n========================================');
  console.log('       IMAGE MIGRATION SUMMARY');
  console.log('========================================');
  console.log(`Images uploaded to Supabase Storage: ${totalImagesUploaded}`);
  console.log(`Questions updated in database:      ${totalQuestionsUpdated}`);
  console.log(`Total payload migrated:             ${(totalBytesUploaded / 1024 / 1024).toFixed(2)} MB`);
  if (errors.length > 0) {
    console.log(`Errors encountered:                 ${errors.length}`);
    for (const e of errors.slice(0, 10)) {
      console.log(`  - ${e}`);
    }
  }
  console.log('========================================');
}

migrateBase64Images().catch(console.error);
