import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!);

async function check() {
  const paperId = 'paper-custom-1781451817151';

  console.log('Fetching ids...');
  const { data: idsData, error: idError } = await supabase.from('questions').select('id').eq('paper_id', paperId).order('created_at', { ascending: true });
  
  if (idsData && idsData.length > 0) {
    const ids = idsData.map((d: any) => d.id);
    console.log(`Found ${ids.length} ids. Fetching in batches of 3 with retries...`);
    
    let allData: any[] = [];
    const batchSize = 3;
    for (let i = 0; i < ids.length; i += batchSize) {
      const batchIds = ids.slice(i, i + batchSize);
      console.log(`Fetching batch ${i} to ${i + batchSize}...`);
      
      let success = false;
      let attempts = 0;
      while (!success && attempts < 3) {
        attempts++;
        console.time('batch');
        const res2 = await supabase.from('questions').select('data').in('id', batchIds);
        console.timeEnd('batch');
        if (res2.error) {
           console.error(`Batch error attempt ${attempts}:`, res2.error.message);
        } else if (res2.data) {
           allData.push(...res2.data);
           success = true;
        }
      }
    }
    console.log(`Total fetched: ${allData.length}`);
  }
}

check();
