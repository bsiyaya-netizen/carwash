export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';
const KEY = 'sparkle.token';

export function getToken() {
  try { return localStorage.getItem(KEY); } catch { return null; }
}
export function setToken(t: string | null) {
  try { if (t) localStorage.setItem(KEY, t); else localStorage.removeItem(KEY); } catch { /* private mode */ }
}

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(API_URL + path, {
    method: opts.method ?? (opts.body !== undefined ? 'POST' : 'GET'),
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  if (res.status === 204) return null as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data as T;
}

export interface ClientConfig {
  paymentsMode: 'stripe' | 'mock';
  stripePublishableKey: string;
  currency: string;
  pointValueCents: number;
  googleClientIds: string[];
}

let configPromise: Promise<ClientConfig> | null = null;
export const getConfig = () => (configPromise ??= api<ClientConfig>('/config'));
