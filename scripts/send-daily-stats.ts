import { createClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

// Load environment variables (mostly for local testing, GitHub Actions provides them directly)
dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587', 10);
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const MANAGER_EMAIL = process.env.MANAGER_EMAIL;
const FROM_EMAIL = process.env.FROM_EMAIL || SMTP_USER;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing Supabase credentials.");
  process.exit(1);
}

if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS || !MANAGER_EMAIL) {
  console.error("Missing SMTP or Manager Email credentials.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function getCount(table: string): Promise<number> {
  const { count, error } = await supabase
    .from(table)
    .select('*', { count: 'exact', head: true });
  
  if (error) {
    console.error(`Error fetching count for ${table}:`, error);
    return 0;
  }
  return count || 0;
}

async function sendDailyStats() {
  console.log("Fetching daily stats from Supabase...");
  
  const subjectsCount = await getCount('subjects');
  const papersCount = await getCount('papers');
  const questionsCount = await getCount('questions');
  const galleryCount = await getCount('gallery');

  const dateStr = new Date().toLocaleDateString('en-LK', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  const htmlContent = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #eaeaea; border-radius: 8px; padding: 20px;">
      <h2 style="color: #0070f3;">Mehewara Daily Site Stats</h2>
      <p>Here are the latest statistics for your platform as of <strong>${dateStr}</strong>:</p>
      
      <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
        <tr style="background-color: #f9f9f9; text-align: left;">
          <th style="padding: 12px; border-bottom: 2px solid #ddd;">Metric</th>
          <th style="padding: 12px; border-bottom: 2px solid #ddd;">Count</th>
        </tr>
        <tr>
          <td style="padding: 12px; border-bottom: 1px solid #ddd;">Total Subjects</td>
          <td style="padding: 12px; border-bottom: 1px solid #ddd;"><strong>${subjectsCount}</strong></td>
        </tr>
        <tr>
          <td style="padding: 12px; border-bottom: 1px solid #ddd;">Total Papers</td>
          <td style="padding: 12px; border-bottom: 1px solid #ddd;"><strong>${papersCount}</strong></td>
        </tr>
        <tr>
          <td style="padding: 12px; border-bottom: 1px solid #ddd;">Total Questions</td>
          <td style="padding: 12px; border-bottom: 1px solid #ddd;"><strong>${questionsCount}</strong></td>
        </tr>
        <tr>
          <td style="padding: 12px; border-bottom: 1px solid #ddd;">Total Gallery Photos</td>
          <td style="padding: 12px; border-bottom: 1px solid #ddd;"><strong>${galleryCount}</strong></td>
        </tr>
      </table>
      
      <p style="margin-top: 24px;">Keep up the great work!</p>
      <hr style="border: none; border-top: 1px solid #eaeaea; margin: 30px 0;" />
      <p style="font-size: 12px; color: #888; text-align: center;">
        This is an automated email sent from the Mehewara GitHub Actions workflow.
      </p>
    </div>
  `;

  console.log("Preparing to send email...");
  
  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465, 
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });

  try {
    const info = await transporter.sendMail({
      from: `"Mehewara System" <${FROM_EMAIL}>`,
      to: MANAGER_EMAIL,
      subject: `📊 Mehewara Daily Stats - ${dateStr}`,
      html: htmlContent,
    });
    
    console.log("Email sent successfully: %s", info.messageId);
  } catch (err) {
    console.error("Failed to send email:", err);
    process.exit(1);
  }
}

sendDailyStats().catch(err => {
  console.error("Unhandled error:", err);
  process.exit(1);
});
