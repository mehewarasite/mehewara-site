import axios from 'axios';

const DEFAULT_BASE_URL = 'https://mehewara-v2-api-production.induwaradahamjith2004.workers.dev';
const FALLBACK_BASE_URL = 'https://mehewara-v2-api-production.induwaradahamjith2004.workers.dev';

// In development, route through Vite proxy (/api/v1) to avoid Cloudflare Worker CORS restrictions.
// In production (or if VITE_DIRECT_API is set), use the configured or default base URL.
const isDev = import.meta.env.DEV;
const forceDirect = import.meta.env.VITE_DIRECT_API === 'true';

let rawBaseURL = '';
if (!isDev || forceDirect) {
  rawBaseURL = (import.meta.env.VITE_API_BASE_URL || DEFAULT_BASE_URL).trim();
  if (rawBaseURL && !rawBaseURL.startsWith('http://') && !rawBaseURL.startsWith('https://')) {
    rawBaseURL = `https://${rawBaseURL}`;
  }
}
let activeBaseURL = rawBaseURL.replace(/\/+$/, '');

export function getActiveMediaBaseUrl(): string {
  let base = (activeBaseURL || (import.meta.env.VITE_API_BASE_URL || DEFAULT_BASE_URL)).trim().replace(/\/+$/, '');
  if (base && !base.startsWith('http://') && !base.startsWith('https://')) {
    base = `https://${base}`;
  }
  return base;
}

export function normalizeMediaUrl(url: string | null | undefined): string {
  if (!url) return '';
  const base = getActiveMediaBaseUrl();
  if (url.includes('/api/v1/media/')) {
    const key = url.split('/api/v1/media/')[1];
    return `${base}/api/v1/media/${key}`;
  }
  return url;
}

export const api = axios.create({
  baseURL: `${activeBaseURL}/api/v1`,
});

export const publicApi = axios.create({
  baseURL: `${activeBaseURL}/api/v1`,
});

// Setup fallback retry handler for network / DNS errors
function setupNetworkFallback(instance: typeof api) {
  instance.interceptors.response.use(
    (response) => response,
    async (error) => {
      // In production: If primary API (e.g. custom domain) fails, retry with fallback worker URL
      if (!isDev && !error.response && activeBaseURL !== FALLBACK_BASE_URL && error.config && !error.config._retriedWithFallback) {
        console.warn(`Primary API ${activeBaseURL} unreachable. Retrying with fallback: ${FALLBACK_BASE_URL}`);
        activeBaseURL = FALLBACK_BASE_URL;
        api.defaults.baseURL = `${FALLBACK_BASE_URL}/api/v1`;
        publicApi.defaults.baseURL = `${FALLBACK_BASE_URL}/api/v1`;

        error.config._retriedWithFallback = true;
        error.config.baseURL = `${FALLBACK_BASE_URL}/api/v1`;
        return instance.request(error.config);
      }

      if (error.response?.status === 401) {
        const reqUrl = error.config?.url || '';
        const isAuthEndpoint = reqUrl.includes('/admin/login') || reqUrl.includes('/admin/auth/');
        if (!isAuthEndpoint) {
          localStorage.removeItem('adminToken');
          localStorage.removeItem('adminUser');
          window.dispatchEvent(new Event('admin-logout'));
        }
      }

      if (error.response?.status === 429) {
        window.dispatchEvent(new Event('admin-budget-exceeded'));
      }

      return Promise.reject(error);
    }
  );
}

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('adminToken');
  if (token) {
    if (config.headers.set) {
      config.headers.set('Authorization', `Bearer ${token}`);
    } else {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  // The Cloudflare Worker API requires an Idempotency-Key header on every
  // admin mutation (POST/PATCH/PUT/DELETE). Auto-generate one for every
  // mutating request so callers never forget it.
  const method = (config.method || '').toUpperCase();
  if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(method)) {
    const hasKey = config.headers.get ? config.headers.get('Idempotency-Key') : config.headers['Idempotency-Key'];
    if (!hasKey) {
      const newKey = crypto.randomUUID();
      if (config.headers.set) {
        config.headers.set('Idempotency-Key', newKey);
      } else {
        config.headers['Idempotency-Key'] = newKey;
      }
    }
  }
  return config;
});

setupNetworkFallback(api);
setupNetworkFallback(publicApi);

export function isAdmin() {
  return !!localStorage.getItem('adminToken');
}

export async function computeSha256Hex(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function normalizeObjectKeyPrefix(target?: string): string {
  if (!target || typeof target !== 'string') return 'study/diagrams';
  const clean = target.trim();
  if (/^(gallery|study|about|publication)\/[a-z0-9-]{1,80}$/.test(clean)) {
    return clean;
  }
  if (clean.includes('about')) return 'about/profile';
  if (clean.includes('gallery')) return 'gallery/items';
  if (clean.includes('study')) return 'study/diagrams';
  return 'study/diagrams';
}

export async function uploadToB2(file: File | Blob, endpointOrPrefix: string = 'study/diagrams'): Promise<string> {
  const prefix = normalizeObjectKeyPrefix(endpointOrPrefix);
  const contentType = file.type || 'image/webp';
  const byteSize = file.size;
  const sha256 = await computeSha256Hex(file);

  // 1. Request signed upload ticket from Cloudflare Worker API
  const ticketRes = await api.post('/media/upload-ticket', {
    objectKeyPrefix: prefix,
    contentType,
    byteSize,
    sha256,
    expiresInSeconds: 300,
  }, {
    headers: {
      'Idempotency-Key': crypto.randomUUID(),
    },
  });

  const { intentId, url: uploadUrl } = ticketRes.data;

  // 2. Direct binary upload to Backblaze B2 presigned S3 PUT URL
  // Note: Do not send the admin Bearer token to B2 since SigV4 is in query parameters.
  let putRes: Response;
  try {
    putRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': contentType,
      },
      body: file,
    });
  } catch (err: any) {
    throw new Error(`Failed to connect to storage: ${err?.message || 'Network or CORS error'}`);
  }

  if (!putRes.ok) {
    const errText = await putRes.text().catch(() => '');
    throw new Error(`Failed to upload media to storage (HTTP ${putRes.status}${errText ? `: ${errText.substring(0, 100)}` : ''})`);
  }

  // 3. Confirm upload with API to verify sha256 and promote from staging to final key in D1
  const confirmRes = await api.post('/media/upload-confirm', {
    intentId,
  }, {
    headers: {
      'Idempotency-Key': crypto.randomUUID(),
    },
  });

  const { objectKey } = confirmRes.data;

  // 4. Return canonical public media URL served by Cloudflare Worker
  const publicBase = getActiveMediaBaseUrl();
  return `${publicBase}/api/v1/media/${objectKey}`;
}

