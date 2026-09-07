import axios from 'axios';

const baseURL = import.meta.env.VITE_API_BASE_URL || 'https://mehewara-v2-api-production.mehewara-site.workers.dev';

export const api = axios.create({
  baseURL: `${baseURL}/api/v1`,
});

export const publicApi = axios.create({
  baseURL: `${baseURL}/api/v1`,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('adminToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('adminToken');
      window.dispatchEvent(new Event('admin-logout'));
    }
    return Promise.reject(error);
  }
);

export function isAdmin() {
  return !!localStorage.getItem('adminToken');
}

export async function uploadToB2(file: File, endpoint: string): Promise<string> {
  // 1. Get upload intent
  const intentRes = await api.post(endpoint, {
    mimeType: file.type,
    byteSize: file.size
  });
  
  const { id, uploadUrl, uploadToken, objectKey } = intentRes.data;

  // 2. Upload to B2
  await axios.put(uploadUrl, file, {
    headers: {
      'Authorization': uploadToken,
      'Content-Type': file.type,
      'Content-Length': file.size.toString()
    }
  });

  // 3. Confirm upload
  await api.post(`${endpoint}/${id}/state`, { state: 'published' });

  // Return the public URL
  return `${baseURL}/api/v1/media/${objectKey}`;
}
