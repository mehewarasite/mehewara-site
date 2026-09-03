export async function onRequestPost(context: {
  request: Request;
  env: {
    TURNSTILE_SECRET?: string;
    TURNSTILE_HOSTNAMES?: string;
  };
}) {
  const secretKey = context.env.TURNSTILE_SECRET;
  if (!secretKey) {
    return new Response(JSON.stringify({ error: 'TURNSTILE_SECRET is not configured in Cloudflare environment' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  let body: any;
  try {
    body = await context.request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const { token, action } = body || {};
  const expectedAction = 'admin_login';

  if (typeof token !== 'string' || token.length === 0 || token.length > 2048) {
    return new Response(JSON.stringify({ error: 'Invalid or missing Turnstile token' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  if (action && action !== expectedAction) {
    return new Response(JSON.stringify({ error: 'Turnstile action mismatch' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const clientIp = context.request.headers.get('CF-Connecting-IP') || context.request.headers.get('x-forwarded-for') || '';

  try {
    const formData = new URLSearchParams();
    formData.append('secret', secretKey);
    formData.append('response', token);
    if (clientIp) formData.append('remoteip', clientIp);

    const siteverifyRes = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData
    });

    if (!siteverifyRes.ok) {
      return new Response(JSON.stringify({ error: `Cloudflare siteverify error: ${siteverifyRes.status}` }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const outcome: any = await siteverifyRes.json();

    if (!outcome.success) {
      return new Response(JSON.stringify({ error: 'Turnstile verification rejected', codes: outcome['error-codes'] }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (outcome.action && outcome.action !== expectedAction) {
      return new Response(JSON.stringify({ error: 'Turnstile action mismatch' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Validate hostname if TURNSTILE_HOSTNAMES is configured
    const allowedHostnamesRaw = context.env.TURNSTILE_HOSTNAMES;
    if (allowedHostnamesRaw) {
      const allowedList = allowedHostnamesRaw.split(',').map(h => h.trim()).filter(Boolean);
      const host = outcome.hostname || '';
      const matched = allowedList.some(pattern => {
        if (pattern === host) return true;
        if (pattern.startsWith('*.') && host.endsWith(pattern.slice(2))) return true;
        return false;
      });
      if (!matched) {
        return new Response(JSON.stringify({ error: `Hostname ${host} is not allowed` }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    return new Response(JSON.stringify({ success: true, hostname: outcome.hostname }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || 'Internal server error during verification' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
