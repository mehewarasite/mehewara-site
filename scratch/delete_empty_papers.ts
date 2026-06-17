import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl!, supabaseKey!);

async function main() {
  console.log("Fetching papers for subject 'ol-sinhala' with language 'en'...");
  
  const { data: papers, error: papError } = await supabase.from('papers').select('*');
  if (papError) throw papError;

  const targetPapers = papers.filter(p => {
    const d = p.data || {};
    return d.subjectId === 'ol-sinhala' && d.language === 'en';
  });

  console.log(`Found ${targetPapers.length} papers in OL Sinhala (English Medium).`);

  let deletedCount = 0;

  for (const paper of targetPapers) {
    const pData = paper.data;
    
    // Check if the paper has any questions
    const { data: questions, error: qError } = await supabase
      .from('questions')
      .select('id') // We only need to count them
      .eq('paper_id', pData.id);
      
    if (qError) {
      console.error(`Failed to fetch questions for ${pData.id}:`, qError);
      continue;
    }

    if (questions.length === 0) {
      console.log(`Paper '${pData.title}' (${pData.id}) has 0 questions. Deleting...`);
      
      const { error: delError } = await supabase
        .from('papers')
        .delete()
        .eq('id', pData.id);

      if (delError) {
        console.error(`Failed to delete paper ${pData.id}:`, delError);
      } else {
        console.log(`Successfully deleted paper ${pData.id}`);
        deletedCount++;
      }
    } else {
      console.log(`Paper '${pData.title}' has ${questions.length} questions. Skipping.`);
    }
  }

  console.log(`Finished. Deleted ${deletedCount} empty papers.`);
}

main().catch(console.error);
