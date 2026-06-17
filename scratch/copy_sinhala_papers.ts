import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl!, supabaseKey!);

async function main() {
  console.log("Fetching papers for subject 'ol-sinhala' with language 'si'...");
  
  const { data: papers, error: papError } = await supabase.from('papers').select('*');
  if (papError) throw papError;

  const sinhalaPapers = papers.filter(p => {
    const d = p.data || {};
    return d.subjectId === 'ol-sinhala' && (!d.language || d.language === 'si') && !p.id.includes('copy');
  });

  console.log(`Found ${sinhalaPapers.length} original papers to copy.`);

  for (const oldPaper of sinhalaPapers) {
    const oldData = oldPaper.data;
    const newPaperId = `paper-custom-copy-v2-${Date.now()}-${Math.floor(Math.random()*10000)}`;
    
    // Create new paper data
    const newPaperData = {
      ...oldData,
      id: newPaperId,
      language: 'en'
    };

    console.log(`Copying paper: ${oldData.title} -> New ID: ${newPaperId}`);

    // Insert new paper
    const { error: insertPapError } = await supabase.from('papers').insert({
      id: newPaperId,
      data: newPaperData
    });

    if (insertPapError) {
      console.error(`Failed to insert paper ${newPaperId}:`, insertPapError);
      continue;
    }

    // Fetch ALL questions for this specific paper
    // Using select('*') with an eq filter avoids the 1000 row overall limit
    // as long as the paper has < 1000 questions (which it does)
    const { data: questions, error: qError } = await supabase
      .from('questions')
      .select('*')
      .eq('paper_id', oldData.id);
      
    if (qError) {
      console.error(`Failed to fetch questions for ${oldData.id}:`, qError);
      continue;
    }

    console.log(`Found ${questions.length} questions for paper ${oldData.title}`);

    for (const oldQ of questions) {
      const oldQData = oldQ.data;
      const newQId = `q-custom-copy-v2-${Date.now()}-${Math.floor(Math.random()*10000)}`;
      
      const newQData = {
        ...oldQData,
        id: newQId,
        paperId: newPaperId
      };

      const { error: insertQError } = await supabase.from('questions').insert({
        id: newQId,
        paper_id: newPaperId,
        data: newQData
      });

      if (insertQError) {
        console.error(`Failed to insert question ${newQId}:`, insertQError);
      }
    }
  }

  console.log("Copy complete.");
}

main().catch(console.error);
