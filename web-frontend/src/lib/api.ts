import axios from 'axios';
import { getToken, clearTokens, broadcastAuthChange } from './auth';

export const api = axios.create({
  baseURL: '/api',
  timeout: 30_000
});

api.interceptors.request.use(cfg => {
  const t = getToken();
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  return cfg;
});

api.interceptors.response.use(
  r => r,
  err => {
    if (err.response?.status === 401) {
      clearTokens();
      broadcastAuthChange();
    }
    return Promise.reject(err);
  }
);
