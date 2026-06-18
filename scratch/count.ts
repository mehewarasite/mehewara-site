import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: '.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials in .env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function countQuizzes() {
  const { count: paperCount, error: paperError } = await supabase
    .from('papers')
    .select('*', { count: 'exact', head: true });

  if (paperError) {
    console.error("Error fetching papers count:", paperError);
  } else {
    console.log(`Total Quizzes/Papers: ${paperCount}`);
  }

  const { count: questionCount, error: questionError } = await supabase
    .from('questions')
    .select('*', { count: 'exact', head: true });

  if (questionError) {
    console.error("Error fetching questions count:", questionError);
  } else {
    console.log(`Total Questions: ${questionCount}`);
  }
}

countQuizzes();
