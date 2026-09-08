import axios from 'axios';

const DEFAULT_BASE_URL = 'https://mehewara-v2-api-production.mehewara-site.workers.dev';

let rawBaseURL = (import.meta.env.VITE_API_BASE_URL || DEFAULT_BASE_URL).trim();
if (rawBaseURL && !rawBaseURL.startsWith('http://') && !rawBaseURL.startsWith('https://')) {
  rawBaseURL = `https://${rawBaseURL}`;
}
let activeBaseURL = rawBaseURL.replace(/\/+$/, '');

export function getActiveBaseURL(): string {
  return activeBaseURL;
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
      if (!error.response && activeBaseURL !== DEFAULT_BASE_URL && error.config && !error.config._retriedWithFallback) {
        console.warn(`Primary API ${activeBaseURL} unreachable. Retrying with fallback: ${DEFAULT_BASE_URL}`);
        activeBaseURL = DEFAULT_BASE_URL;
        api.defaults.baseURL = `${DEFAULT_BASE_URL}/api/v1`;
        publicApi.defaults.baseURL = `${DEFAULT_BASE_URL}/api/v1`;

        error.config._retriedWithFallback = true;
        error.config.baseURL = `${DEFAULT_BASE_URL}/api/v1`;
        return instance.request(error.config);
      }

      if (error.response?.status === 401) {
        localStorage.removeItem('adminToken');
        window.dispatchEvent(new Event('admin-logout'));
      }
      return Promise.reject(error);
    }
  );
}

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('adminToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

setupNetworkFallback(api);
setupNetworkFallback(publicApi);

export function isAdmin() {
  return !!localStorage.getItem('adminToken');
}

export async function uploadToB2(file: File, endpoint: string): Promise<string> {
  const intentRes = await api.post(endpoint, {
    mimeType: file.type,
    byteSize: file.size
  });
  
  const { id, uploadUrl, uploadToken, objectKey } = intentRes.data;

  await axios.put(uploadUrl, file, {
    headers: {
      'Authorization': uploadToken,
      'Content-Type': file.type,
      'Content-Length': file.size.toString()
    }
  });

  await api.post(`${endpoint}/${id}/state`, { state: 'published' });

  return `${activeBaseURL}/api/v1/media/${objectKey}`;
}

