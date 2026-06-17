import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl!, supabaseKey!);

async function main() {
  const { data: papers, error: papError } = await supabase.from('papers').select('*');
  if (papError) throw papError;

  const sinhalaPapers = papers.filter(p => {
    const d = p.data || {};
    // Look at original papers (not the newly copied ones)
    return d.subjectId === 'ol-sinhala' && (!d.language || d.language === 'si') && !p.id.includes('copy');
  });

  console.log(`Found ${sinhalaPapers.length} original papers.`);

  const { data: questions, error: qError } = await supabase.from('questions').select('*');
  if (qError) throw qError;

  console.log(`Total questions in DB: ${questions.length}`);

  for (const oldPaper of sinhalaPapers) {
    const oldData = oldPaper.data;
    
    // Check how many questions map to this paperId
    const paperQuestions = questions.filter(q => q.data?.paperId === oldData.id);
    const paperQuestionsByDbColumn = questions.filter(q => q.paper_id === oldData.id);
    
    console.log(`Paper: ${oldData.title} (ID: ${oldData.id})`);
    console.log(`  Questions matching data.paperId = ${paperQuestions.length}`);
    console.log(`  Questions matching paper_id column = ${paperQuestionsByDbColumn.length}`);
    
    // Are there any questions where data.paperId loosely matches?
    const looseMatch = questions.filter(q => String(q.data?.paperId).trim() === String(oldData.id).trim());
    if (looseMatch.length !== paperQuestions.length) {
      console.log(`  Loose match found different number: ${looseMatch.length}`);
    }
  }
}

main().catch(console.error);
