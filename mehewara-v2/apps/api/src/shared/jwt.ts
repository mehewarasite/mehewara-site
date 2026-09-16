const DEFAULT_FALLBACK_SECRET = "a282c930e0a1d9136f9390170be404f1d5dd98a17b9ab55cd8cd65d04985fdb7";

function base64UrlEncodeString(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i];
    if (byte !== undefined) binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function base64UrlEncodeBytes(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i];
    if (byte !== undefined) binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function base64UrlDecodeToString(str: string): string {
  let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4) base64 += "=";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

function base64UrlDecodeToBytes(str: string): Uint8Array {
  let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4) base64 += "=";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export async function signJwt(payload: unknown, secret: string, expiresInMs: number): Promise<string> {
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const body = {
    ...payload as Record<string, unknown>,
    iat: now,
    exp: now + Math.floor(expiresInMs / 1000),
  };

  const encHeader = base64UrlEncodeString(JSON.stringify(header));
  const encBody = base64UrlEncodeString(JSON.stringify(body));
  const data = `${encHeader}.${encBody}`;

  const keySecret = secret || DEFAULT_FALLBACK_SECRET;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(keySecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  const encSignature = base64UrlEncodeBytes(new Uint8Array(signature));

  return `${data}.${encSignature}`;
}

export async function verifyJwt<T>(token: string, secret: string): Promise<T | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [encHeader, encBody, encSignature] = parts;
  if (!encHeader || !encBody || !encSignature) return null;
  const data = `${encHeader}.${encBody}`;

  const keySecret = secret || DEFAULT_FALLBACK_SECRET;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(keySecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );

  try {
    const sigBytes = base64UrlDecodeToBytes(encSignature);
    const isValid = await crypto.subtle.verify("HMAC", key, sigBytes as unknown as BufferSource, new TextEncoder().encode(data));

    if (!isValid) return null;

    const payload = JSON.parse(base64UrlDecodeToString(encBody));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return null; // Expired
    }
    return payload as T;
  } catch {
    return null;
  }
}


