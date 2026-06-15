import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { JSDOM } from 'jsdom';

dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!);

async function compressExisting() {
  const paperId = 'paper-custom-1781451817151';

  const { data: idsData } = await supabase.from('questions').select('id').eq('paper_id', paperId);
  if (!idsData || idsData.length === 0) {
    console.log('No questions found');
    return;
  }
  
  const ids = idsData.map((r: any) => r.id);
  console.log(`Found ${ids.length} questions. Fetching data in batches of 5...`);
  
  const allQuestions = [];
  for (let i = 0; i < ids.length; i += 1) {
    const batchIds = ids.slice(i, i + 1);
    console.log(`Fetching batch ${i} to ${i + 1}...`);
    const { data: qData, error } = await supabase.from('questions').select('*').in('id', batchIds);
    if (error) {
      console.error('Batch fetch error:', error);
    } else if (qData) {
      allQuestions.push(...qData);
    }
  }

  console.log(`Processing ${allQuestions.length} questions...`);

  let compressedCount = 0;
  let totalSavedBytes = 0;

  for (const row of allQuestions) {
    const question = row.data;
    let modified = false;
    
    // Helper to process html strings
    const processHtml = async (html: string) => {
      if (!html || !html.includes('<img')) return html;
      
      const dom = new JSDOM(html);
      const imgs = dom.window.document.querySelectorAll('img');
      for (const img of imgs) {
        if (img.src.startsWith('data:image/')) {
          const base64Data = img.src.split(',')[1];
          if (!base64Data) continue;
          
          const buffer = Buffer.from(base64Data, 'base64');
          if (buffer.length > 0) { // Compress all images
            console.log(`Found image: ${(buffer.length / 1024).toFixed(2)} KB`);
            try {
              const jimpModule = await import('jimp');
              const { Jimp } = jimpModule;
              const image = await Jimp.read(buffer);
              if (image.bitmap.width > 1024) {
                // Not passing AUTO, just resizing width to 1024, height auto
                image.resize({ w: 1024 });
              }
              const compressedBuffer = await image.getBuffer('image/jpeg', { quality: 75 });
                
              const newSrc = `data:image/jpeg;base64,${compressedBuffer.toString('base64')}`;
              if (newSrc !== img.src && compressedBuffer.length < buffer.length) {
                img.src = newSrc;
                modified = true;
                compressedCount++;
                totalSavedBytes += (buffer.length - compressedBuffer.length);
                console.log(`  -> Compressed to ${(compressedBuffer.length / 1024).toFixed(2)} KB!`);
              }
            } catch (e) {
              console.error('Failed to compress image:', e);
            }
          }
        }
      }
      return dom.window.document.body.innerHTML;
    };

    if (question.questionHtml) {
      question.questionHtml = await processHtml(question.questionHtml);
    }
    if (question.optionsHtml) {
      for (let i = 0; i < question.optionsHtml.length; i++) {
        question.optionsHtml[i] = await processHtml(question.optionsHtml[i]);
      }
    }
    if (question.explanationHtml) {
      question.explanationHtml = await processHtml(question.explanationHtml);
    }

    if (modified) {
      await supabase.from('questions').update({ data: question }).eq('id', row.id);
      console.log(`Updated question ${row.id}`);
    }
  }

  console.log(`\nFinished! Compressed ${compressedCount} images.`);
  console.log(`Total space saved: ${(totalSavedBytes / 1024 / 1024).toFixed(2)} MB`);
}

compressExisting();
