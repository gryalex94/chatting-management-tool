import axios from 'axios';
import toast from 'react-hot-toast';
import { isDemoMode, scrubResponse, containsMasked } from '../utils/privacy';

const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || '' });

// Token is set by AuthContext — no async getSession on every request
let _token = null;

export function setApiToken(token) {
  _token = token;
}

api.interceptors.request.use((config) => {
  if (_token) config.headers.Authorization = `Bearer ${_token}`;
  // Demo mode shows pseudonyms and placeholders in place of real fan data. If a
  // save would write one of those back, it would overwrite the real value — so
  // refuse the request instead.
  const method = (config.method || 'get').toLowerCase();
  if (isDemoMode() && method !== 'get' && containsMasked(config.data)) {
    toast.error('Demo mode is on — turn it off to save changes to fan data.');
    return Promise.reject(new axios.Cancel('Blocked in demo mode: request contained masked data'));
  }
  return config;
});

api.interceptors.response.use(
  (r) => {
    if (isDemoMode()) r.data = scrubResponse(r.data);
    return r;
  },
  (err) => {
    // Don't sign out or redirect here — let AuthContext handle auth state
    return Promise.reject(err);
  }
);

export default api;
