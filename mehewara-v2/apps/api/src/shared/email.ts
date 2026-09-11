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
  const isRealKey = resendApiKey && !resendApiKey.includes('re_secret_key') && resendApiKey.startsWith('re_');

  if (isRealKey) {
    try {
      const from = resendFromEmail || 'Mehewara <noreply@mehewara.edu.lk>';
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendApiKey}`,
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
          devOtp: environment !== 'production' ? otpCode : undefined,
        };
      }

      return { delivered: true };
    } catch (err: any) {
      console.error('Failed to send email via Resend:', err);
      return {
        delivered: false,
        error: err.message,
        devOtp: environment !== 'production' ? otpCode : undefined,
      };
    }
  }

  // Development / fallback mode: log OTP to console
  console.log(`[EMAIL DISPATCH - ${purpose.toUpperCase()}] To: ${toEmail} | OTP: ${otpCode}`);
  return {
    delivered: true,
    devOtp: environment !== 'production' ? otpCode : undefined,
  };
}
