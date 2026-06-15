import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!);

async function checkSize() {
  const paperId = 'paper-custom-1781451817151';
  const { data } = await supabase.from('questions').select('*').eq('paper_id', paperId).limit(1);
  if (data && data.length > 0) {
    const qData = JSON.stringify(data[0].data);
    console.log(`Question data size: ${(qData.length / 1024).toFixed(2)} KB`);
    console.log(qData.substring(0, 1000));
  }
}
checkSize();
