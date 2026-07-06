import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import dotenv from 'dotenv';

// Load .env for local testing; GitHub Actions injects secrets directly
dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const MANAGER_EMAIL = process.env.MANAGER_EMAIL;
const FROM_EMAIL = process.env.FROM_EMAIL || 'onboarding@resend.dev';

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Missing Supabase credentials (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).');
  process.exit(1);
}

if (!RESEND_API_KEY) {
  console.error('❌ Missing RESEND_API_KEY secret.');
  process.exit(1);
}

if (!MANAGER_EMAIL) {
  console.error('❌ Missing MANAGER_EMAIL secret.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function getCount(table: string): Promise<number> {
  const { count, error } = await supabase
    .from(table)
    .select('*', { count: 'exact', head: true });
  if (error) {
    console.warn(`⚠️  Could not fetch count for "${table}":`, error.message);
    return 0;
  }
  return count ?? 0;
}

async function sendDailyStats() {
  console.log('📊 Fetching daily stats from Supabase...');

  const [subjectsCount, papersCount, questionsCount, galleryCount] = await Promise.all([
    getCount('subjects'),
    getCount('papers'),
    getCount('questions'),
    getCount('gallery'),
  ]);

  const now = new Date();
  const dateStr = now.toLocaleDateString('en-LK', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    timeZone: 'Asia/Colombo',
  });

  const statsRows = [
    { label: '📚 Total Subjects',       value: subjectsCount },
    { label: '📄 Total Papers',         value: papersCount },
    { label: '❓ Total Questions',      value: questionsCount },
    { label: '🖼️  Total Gallery Photos', value: galleryCount },
  ];

  const tableRows = statsRows.map(r => `
    <tr>
      <td style="padding:12px 16px;border-bottom:1px solid #eaeaea;">${r.label}</td>
      <td style="padding:12px 16px;border-bottom:1px solid #eaeaea;font-weight:700;font-size:18px;">${r.value.toLocaleString()}</td>
    </tr>`).join('');

  const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0"
             style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08);">

        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#0070f3,#7928ca);padding:32px 40px;text-align:center;">
            <h1 style="margin:0;color:#ffffff;font-size:26px;letter-spacing:-0.5px;">📊 Mehewara Daily Stats</h1>
            <p  style="margin:8px 0 0;color:rgba(255,255,255,.8);font-size:14px;">${dateStr}</p>
          </td>
        </tr>

        <!-- Stats table -->
        <tr>
          <td style="padding:32px 40px;">
            <p style="margin:0 0 20px;color:#444;font-size:15px;">
              Here is a snapshot of your platform's content for today:
            </p>
            <table width="100%" cellpadding="0" cellspacing="0"
                   style="border-collapse:collapse;border:1px solid #eaeaea;border-radius:8px;overflow:hidden;">
              <thead>
                <tr style="background:#f9f9f9;">
                  <th style="padding:12px 16px;text-align:left;font-size:12px;text-transform:uppercase;color:#888;letter-spacing:.5px;">Metric</th>
                  <th style="padding:12px 16px;text-align:left;font-size:12px;text-transform:uppercase;color:#888;letter-spacing:.5px;">Count</th>
                </tr>
              </thead>
              <tbody>${tableRows}</tbody>
            </table>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:0 40px 32px;text-align:center;">
            <p style="margin:0;font-size:12px;color:#aaa;">
              This email is sent automatically every day at 6:30 PM Sri Lanka Time<br>
              by the Mehewara GitHub Actions workflow.
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  console.log('📧 Sending email via Resend...');

  const resend = new Resend(RESEND_API_KEY);
  const { data, error } = await resend.emails.send({
    from: `Mehewara System <${FROM_EMAIL}>`,
    to: [MANAGER_EMAIL],
    subject: `📊 Mehewara Daily Stats — ${dateStr}`,
    html: htmlContent,
  });

  if (error) {
    console.error('❌ Failed to send email:', error);
    process.exit(1);
  }

  console.log('✅ Email sent successfully! Message ID:', data?.id);
}

sendDailyStats().catch(err => {
  console.error('❌ Unhandled error:', err);
  process.exit(1);
});
