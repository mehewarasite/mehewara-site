import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Supabase URL or Key is missing');
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data: subjects, error: subError } = await supabase.from('subjects').select('*');
  if (subError) throw subError;

  console.log('--- Subjects ---');
  for (const s of subjects) {
    const d = s.data || {};
    console.log(`ID: ${s.id} | Name: ${d.name} | Sinhala Name: ${d.sinhalaName} | Exam: ${d.examType}`);
  }

  const { data: papers, error: papError } = await supabase.from('papers').select('*');
  if (papError) throw papError;

  console.log('\n--- Papers ---');
  for (const p of papers) {
    const d = p.data || {};
    console.log(`ID: ${p.id} | Subject: ${d.subjectId} | Title: ${d.title} | Lang: ${d.language}`);
  }
}

main().catch(console.error);
