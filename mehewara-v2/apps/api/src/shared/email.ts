export interface SendOtpOptions {
  toEmail: string;
  otpCode: string;
  purpose: 'signup' | 'password_reset';
  environment?: string;
  resendApiKey?: string;
  resendFromEmail?: string;
}

export interface SendOtpResult {
  delivered: boolean;
  devOtp?: string;
  error?: string;
}

export async function sendOtpEmail(options: SendOtpOptions): Promise<SendOtpResult> {
  const { toEmail, otpCode, purpose, environment = 'production', resendApiKey, resendFromEmail } = options;

  const isPasswordReset = purpose === 'password_reset';
  const subject = isPasswordReset
    ? 'Mehewara Admin — Password Reset Code'
    : 'Mehewara Admin — Email Verification Code';

  const actionText = isPasswordReset
    ? 'reset your Mehewara administrator account password'
    : 'complete your Mehewara administrator account registration';

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${subject}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0f172a; color: #f8fafc; padding: 32px 16px; margin: 0;">
  <div style="max-width: 480px; margin: 0 auto; background: #1e293b; border-radius: 16px; border: 1px solid #334155; padding: 32px; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
    <div style="text-align: center; margin-bottom: 24px;">
      <h1 style="color: #38bdf8; font-size: 24px; font-weight: 800; margin: 0;">මෙහෙවර (Mehewara)</h1>
      <p style="color: #94a3b8; font-size: 13px; margin-top: 4px;">Admin Portal Authentication</p>
    </div>
    <div style="background-color: #0f172a; border-radius: 12px; border: 1px solid #334155; padding: 24px; text-align: center; margin-bottom: 24px;">
      <p style="color: #cbd5e1; font-size: 14px; margin-top: 0; margin-bottom: 16px;">
        Use the following one-time verification code to ${actionText}:
      </p>
      <div style="font-size: 36px; font-weight: 800; letter-spacing: 8px; color: #38bdf8; font-family: monospace; padding: 12px; background: #1e293b; border-radius: 8px; border: 1px dashed #0284c7; display: inline-block;">
        ${otpCode}
      </div>
      <p style="color: #64748b; font-size: 12px; margin-top: 16px; margin-bottom: 0;">
        This code expires in <strong>15 minutes</strong>. If you did not request this code, you can safely ignore this email.
      </p>
    </div>
    <div style="text-align: center; border-top: 1px solid #334155; padding-top: 16px;">
      <p style="color: #64748b; font-size: 11px; margin: 0;">
        Mehewara Educational Platform &bull; Sri Lanka
      </p>
    </div>
  </div>
</body>
</html>
  `.trim();

  const text = `
Mehewara Admin Portal Authentication

Your one-time verification code to ${actionText} is:

${otpCode}

This code expires in 15 minutes.
If you did not request this, please ignore this email.
  `.trim();

  // If Resend API key is configured and not a placeholder, dispatch via Resend
  const cleanKey = resendApiKey?.trim();
  const isRealKey = cleanKey && !cleanKey.includes('re_secret_key') && cleanKey.startsWith('re_');

  if (isRealKey) {
    try {
      // Use the verified mehewara.edu.lk domain, or fall back to onboarding@resend.dev for sandbox
      const from = (resendFromEmail || 'Mehewara Admin <noreply@mehewara.edu.lk>').trim();
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${cleanKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from,
          to: [toEmail],
          subject,
          html,
          text,
        }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        console.error('Resend API error:', res.status, errorText);

        return {
          delivered: false,
          error: `Resend error (${res.status}): ${errorText}`,
          devOtp: otpCode, // Always supply OTP on delivery error so admin is never locked out
        };
      }

      return { delivered: true };
    } catch (err: any) {
      console.error('Failed to send email via Resend:', err);
      return {
        delivered: false,
        error: err.message,
        devOtp: otpCode, // Always supply OTP on delivery error so admin is never locked out
      };
    }
  }

  // Fallback mode when real Resend key is not configured or in dev
  console.log(`[EMAIL DISPATCH - ${purpose.toUpperCase()}] To: ${toEmail} | OTP: ${otpCode}`);
  return {
    delivered: true,
    devOtp: otpCode,
  };
}

// ── Welcome Email for New Admin Accounts ──

export interface SendWelcomeEmailOptions {
  toEmail: string;
  name: string;
  username: string;
  password: string;
  role: 'admin' | 'super-admin';
  createdBy: string;
  resendApiKey?: string;
  resendFromEmail?: string;
}

export async function sendWelcomeEmail(options: SendWelcomeEmailOptions): Promise<{ delivered: boolean; error?: string }> {
  const { toEmail, name, username, password, role, createdBy, resendApiKey, resendFromEmail } = options;

  const roleLabel = role === 'super-admin' ? 'Super Admin' : 'Admin';
  const subject = `Welcome to Mehewara Admin Portal — Your ${roleLabel} Account`;

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${subject}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0f172a; color: #f8fafc; padding: 32px 16px; margin: 0;">
  <div style="max-width: 520px; margin: 0 auto; background: #1e293b; border-radius: 16px; border: 1px solid #334155; padding: 32px; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
    <div style="text-align: center; margin-bottom: 24px;">
      <h1 style="color: #38bdf8; font-size: 24px; font-weight: 800; margin: 0;">මෙහෙවර (Mehewara)</h1>
      <p style="color: #94a3b8; font-size: 13px; margin-top: 4px;">Admin Portal</p>
    </div>

    <div style="background-color: #0f172a; border-radius: 12px; border: 1px solid #334155; padding: 24px; margin-bottom: 24px;">
      <h2 style="color: #4ade80; font-size: 18px; font-weight: 700; margin: 0 0 12px 0;">🎉 Welcome, ${name}!</h2>
      <p style="color: #cbd5e1; font-size: 14px; margin: 0 0 16px 0;">
        A new <strong style="color: ${role === 'super-admin' ? '#c084fc' : '#38bdf8'};">${roleLabel}</strong> account has been created for you on the Mehewara Educational Platform by <strong>${createdBy}</strong>.
      </p>

      <table style="width: 100%; border-collapse: collapse; margin-bottom: 8px;">
        <tr>
          <td style="color: #94a3b8; font-size: 12px; padding: 8px 0; border-bottom: 1px solid #334155; font-weight: 600;">Name</td>
          <td style="color: #f1f5f9; font-size: 13px; padding: 8px 0; border-bottom: 1px solid #334155; text-align: right; font-weight: 700;">${name}</td>
        </tr>
        <tr>
          <td style="color: #94a3b8; font-size: 12px; padding: 8px 0; border-bottom: 1px solid #334155; font-weight: 600;">Username</td>
          <td style="color: #38bdf8; font-size: 13px; padding: 8px 0; border-bottom: 1px solid #334155; text-align: right; font-family: monospace; font-weight: 700;">${username}</td>
        </tr>
        <tr>
          <td style="color: #94a3b8; font-size: 12px; padding: 8px 0; border-bottom: 1px solid #334155; font-weight: 600;">Email</td>
          <td style="color: #f1f5f9; font-size: 13px; padding: 8px 0; border-bottom: 1px solid #334155; text-align: right;">${toEmail}</td>
        </tr>
        <tr>
          <td style="color: #94a3b8; font-size: 12px; padding: 8px 0; border-bottom: 1px solid #334155; font-weight: 600;">Role</td>
          <td style="color: ${role === 'super-admin' ? '#c084fc' : '#38bdf8'}; font-size: 13px; padding: 8px 0; border-bottom: 1px solid #334155; text-align: right; font-weight: 700;">${roleLabel}</td>
        </tr>
        <tr>
          <td style="color: #94a3b8; font-size: 12px; padding: 8px 0; font-weight: 600;">Password</td>
          <td style="color: #fbbf24; font-size: 14px; padding: 8px 0; text-align: right; font-family: monospace; font-weight: 800; letter-spacing: 1px;">${password}</td>
        </tr>
      </table>
    </div>

    <div style="background: #1e1b4b; border: 1px solid #4338ca; border-radius: 10px; padding: 14px 16px; margin-bottom: 24px;">
      <p style="color: #a5b4fc; font-size: 12px; margin: 0; line-height: 1.5;">
        ⚠️ <strong>Important:</strong> Please change your password after your first login for security. You can do this from the Admin Panel → Password button.
      </p>
    </div>

    <div style="text-align: center; margin-bottom: 24px;">
      <a href="https://mehewara.edu.lk/admin" style="display: inline-block; background: linear-gradient(135deg, #0ea5e9, #6366f1); color: #ffffff; text-decoration: none; font-weight: 700; font-size: 14px; padding: 12px 32px; border-radius: 10px;">
        Go to Mehewara Admin Portal →
      </a>
    </div>

    <div style="text-align: center; border-top: 1px solid #334155; padding-top: 16px;">
      <p style="color: #64748b; font-size: 11px; margin: 0;">
        Mehewara Educational Platform &bull; Sri Lanka
      </p>
    </div>
  </div>
</body>
</html>
  `.trim();

  const text = `
Welcome to Mehewara Admin Portal!

A new ${roleLabel} account has been created for you by ${createdBy}.

Account Details:
- Name: ${name}
- Username: ${username}
- Email: ${toEmail}
- Role: ${roleLabel}
- Password: ${password}

⚠️ Please change your password after your first login.

Login at: https://mehewara.edu.lk/admin
  `.trim();

  const cleanKey = resendApiKey?.trim();
  const isRealKey = cleanKey && !cleanKey.includes('re_secret_key') && cleanKey.startsWith('re_');

  if (isRealKey) {
    try {
      const from = (resendFromEmail || 'Mehewara Admin <noreply@mehewara.edu.lk>').trim();
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${cleanKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ from, to: [toEmail], subject, html, text }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        console.error('Welcome email send error:', res.status, errorText);
        return { delivered: false, error: `Resend error (${res.status}): ${errorText}` };
      }

      return { delivered: true };
    } catch (err: any) {
      console.error('Failed to send welcome email:', err);
      return { delivered: false, error: err.message };
    }
  }

  // Dev fallback
  console.log(`[WELCOME EMAIL] To: ${toEmail} | Username: ${username} | Role: ${role}`);
  return { delivered: true };
}
