import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, getToken, setToken } from './api';
import { closeSocket } from './socket';
import type { User } from './types';

interface AuthState {
  user: User | null;
  ready: boolean;
  signIn: (token: string, user: User) => void;
  signOut: () => void;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState>(null as unknown as AuthState);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    setUser(await api<User>('/auth/me'));
  }, []);

  useEffect(() => {
    if (!getToken()) { setReady(true); return; }
    refresh().catch(() => setToken(null)).finally(() => setReady(true));
  }, [refresh]);

  const signIn = (token: string, u: User) => {
    closeSocket();
    setToken(token);
    setUser(u);
  };
  const signOut = () => {
    closeSocket();
    setToken(null);
    setUser(null);
  };

  return <AuthContext.Provider value={{ user, ready, signIn, signOut, refresh }}>{children}</AuthContext.Provider>;
}
