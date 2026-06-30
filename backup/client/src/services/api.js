import axios from 'axios';

const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || '' });

// Token is set by AuthContext — no async getSession on every request
let _token = null;

export function setApiToken(token) {
  _token = token;
}

api.interceptors.request.use((config) => {
  if (_token) config.headers.Authorization = `Bearer ${_token}`;
  return config;
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    // Don't sign out or redirect here — let AuthContext handle auth state
    return Promise.reject(err);
  }
);

export default api;