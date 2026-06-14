import { useEffect, useState } from 'react';
import { api } from './api';

export type User = {
  _id: string;
  email: string;
  name?: string;
  role: 'ev_user' | 'provider' | 'operator';
};

const TOKEN_KEY = 'saasplug_token';
const REFRESH_KEY = 'saasplug_refresh';

export function getToken()   { return localStorage.getItem(TOKEN_KEY); }
export function getRefresh() { return localStorage.getItem(REFRESH_KEY); }
export function setTokens(access: string, refresh: string) {
  localStorage.setItem(TOKEN_KEY, access);
  localStorage.setItem(REFRESH_KEY, refresh);
}
export function clearTokens() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

/** Light hook — re-fetches /me whenever token changes (via the storage event or manual setUser) */
export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    const token = getToken();
    if (!token) { setUser(null); setLoading(false); return; }
    try {
      const r = await api.get<User>('/auth/me');
      setUser(r.data);
    } catch {
      clearTokens();
      setUser(null);
    }
    setLoading(false);
  }

  useEffect(() => {
    refresh();
    const handler = () => refresh();
    window.addEventListener('saasplug-auth-changed', handler);
    return () => window.removeEventListener('saasplug-auth-changed', handler);
  }, []);

  function logout() {
    clearTokens();
    setUser(null);
    window.dispatchEvent(new Event('saasplug-auth-changed'));
  }

  return { user, loading, logout, refresh };
}

export function broadcastAuthChange() {
  window.dispatchEvent(new Event('saasplug-auth-changed'));
}
