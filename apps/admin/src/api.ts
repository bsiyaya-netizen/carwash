import { io, type Socket } from 'socket.io-client';

export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';
const KEY = 'carwash.admin.token';

export const getToken = () => localStorage.getItem(KEY);
export const setToken = (t: string | null) => (t ? localStorage.setItem(KEY, t) : localStorage.removeItem(KEY));

export async function api<T = any>(path: string, body?: unknown, method?: string): Promise<T> {
  const token = getToken();
  const res = await fetch(API_URL + path, {
    method: method ?? (body ? 'POST' : 'GET'),
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) {
    setToken(null);
    location.reload();
  }
  const data = res.status === 204 ? null : await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error ?? `Request failed (${res.status})`);
  return data as T;
}

let socket: Socket | null = null;
export function getSocket() {
  if (!socket) socket = io(API_URL, { auth: { token: getToken() } });
  return socket;
}

export const money = (cents: number) =>
  `R${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '–');
