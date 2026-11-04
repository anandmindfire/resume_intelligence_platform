import axios, { AxiosHeaders } from 'axios';
import { API_BASE_URL, API_PATHS } from '../constants';
import { authEnabled, getAccessToken, signIn } from '../auth/oidc';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Attach the OIDC access token to every API call (the gateway rejects requests without one).
apiClient.interceptors.request.use(async (request) => {
  const token = await getAccessToken();
  if (token) {
    request.headers = AxiosHeaders.from(request.headers);
    request.headers.set('Authorization', `Bearer ${token}`);
  }
  return request;
});

// An expired or revoked session: send the user back through login instead of showing broken pages.
apiClient.interceptors.response.use(undefined, (error) => {
  if (authEnabled && axios.isAxiosError(error) && error.response?.status === 401) {
    void signIn();
  }
  return Promise.reject(error);
});

export { apiClient };

/** Build full URL for resume file (for links / download) */
export function getResumeFileUrl(id: string): string {
  return `${API_BASE_URL}${API_PATHS.UPLOAD.RESUME_FILE(id)}`;
}

/** Types the browser may show in a tab; anything else is saved as a download. */
const VIEWABLE_TYPES = ['application/pdf', 'image/png', 'image/jpeg'];

/**
 * Opens a resume's original file. A plain link can't carry the bearer token, so with auth enabled the
 * file is fetched through the authenticated client and handed to the browser as a blob URL.
 * Returns false when the caller's normal link navigation should proceed (auth disabled).
 */
export async function openResumeFile(id: string, fileName = 'resume'): Promise<boolean> {
  if (!authEnabled) return false;

  // Open the tab synchronously (inside the click) so popup blockers allow it; fill it once loaded.
  const tab = window.open('', '_blank');
  if (tab) tab.opener = null;
  try {
    const { data } = await apiClient.get<Blob>(API_PATHS.UPLOAD.RESUME_FILE(id), {
      responseType: 'blob',
    });
    const url = URL.createObjectURL(data);
    if (tab && VIEWABLE_TYPES.includes(data.type)) {
      tab.location.href = url;
    } else {
      tab?.close();
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      link.rel = 'noopener';
      link.click();
    }
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (error) {
    tab?.close();
    throw error;
  }
  return true;
}
