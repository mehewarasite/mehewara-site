import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!);

async function check() {
  const paperId = 'paper-custom-1781451817151';

  console.log('Test 1: select("id").eq("paper_id")');
  const res1 = await supabase.from('questions').select('id').eq('paper_id', paperId);
  
  if (res1.data && res1.data.length > 0) {
    const ids = res1.data.map((d: any) => d.id);
    console.log(`Found ${ids.length} ids. Fetching in batches of 10...`);
    
    let allData: any[] = [];
    for (let i = 0; i < ids.length; i += 10) {
      const batchIds = ids.slice(i, i + 10);
      console.log(`Fetching batch ${i} to ${i + 10}...`);
      console.time('batch');
      const res2 = await supabase.from('questions').select('data').in('id', batchIds);
      console.timeEnd('batch');
      if (res2.error) {
         console.error('Batch error:', res2.error);
      } else if (res2.data) {
         allData.push(...res2.data);
      }
    }
    console.log(`Total fetched: ${allData.length}`);
  }
}

check();
