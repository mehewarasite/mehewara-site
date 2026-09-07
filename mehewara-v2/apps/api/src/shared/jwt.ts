export async function signJwt(payload: unknown, secret: string, expiresInMs: number): Promise<string> {
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const body = {
    ...payload as Record<string, unknown>,
    iat: now,
    exp: now + Math.floor(expiresInMs / 1000),
  };

  const encHeader = btoa(JSON.stringify(header)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const encBody = btoa(JSON.stringify(body)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const data = `${encHeader}.${encBody}`;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  const encSignature = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  return `${data}.${encSignature}`;
}

export async function verifyJwt<T>(token: string, secret: string): Promise<T | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [encHeader, encBody, encSignature] = parts;
  if (!encHeader || !encBody || !encSignature) return null;
  const data = `${encHeader}.${encBody}`;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );

  const sigBytes = Uint8Array.from(atob(encSignature.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
  const isValid = await crypto.subtle.verify("HMAC", key, sigBytes, new TextEncoder().encode(data));

  if (!isValid) return null;

  try {
    const payload = JSON.parse(atob(encBody.replace(/-/g, "+").replace(/_/g, "/")));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return null; // Expired
    }
    return payload as T;
  } catch {
    return null;
  }
}

