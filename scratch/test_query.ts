import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!);

async function check() {
  const paperId = 'paper-custom-1781451817151';

  console.log('Test 1: select("id").eq("paper_id")');
  console.time('test1');
  const res1 = await supabase.from('questions').select('id').eq('paper_id', paperId);
  console.timeEnd('test1');
  console.log(res1.error || `Found ${res1.data?.length}`);

  if (res1.data && res1.data.length > 0) {
    const ids = res1.data.map((d: any) => d.id);
    console.log('Test 2: select("data").in("id")');
    console.time('test2');
    const res2 = await supabase.from('questions').select('data').in('id', ids);
    console.timeEnd('test2');
    console.log(res2.error || `Found ${res2.data?.length}`);
  }
}

check();
