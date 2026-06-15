import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function check() {
  console.log('Fetching papers...');
  const { data: papers, error: pError } = await supabase.from('papers').select('*');
  if (pError) console.error(pError);
  
  const targetPaper = papers?.find(p => p.data.title.includes('2025') && p.data.subjectId === 'al-physics');
  if (targetPaper) {
    console.log('Found target paper:', targetPaper.id);
    console.log(targetPaper.data);

    console.log('Fetching questions for this paper...');
    const { data: qForPaper, error: qError } = await supabase.from('questions').select('*').eq('paper_id', targetPaper.id);
    if (qError) console.error(qError);
    console.log(`Found ${qForPaper?.length || 0} questions with paper_id = ${targetPaper.id}`);

    if (!qForPaper || qForPaper.length === 0) {
      console.log('Let us fetch all questions to see if they got attached to a different paper_id...');
      const { data: allQ, error: allQError } = await supabase.from('questions').select('id, paper_id');
      if (allQError) console.error(allQError);
      
      const counts = allQ?.reduce((acc: any, q: any) => {
        acc[q.paper_id] = (acc[q.paper_id] || 0) + 1;
        return acc;
      }, {});
      console.log('Question counts by paper_id:', counts);
    }
  } else {
    console.log('Could not find 2025 AL physics paper. Available papers:');
    papers?.forEach(p => console.log(`- ID: ${p.id}, Title: ${p.data.title}, Subject: ${p.data.subjectId}`));
  }
}

check();
