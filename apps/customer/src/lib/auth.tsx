import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, loadToken, setToken } from './api';
import { closeSocket } from './socket';
import type { User } from './types';

interface AuthState {
  user: User | null;
  ready: boolean;
  signIn: (token: string, user: User) => Promise<void>;
  signOut: () => Promise<void>;
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
    (async () => {
      try {
        if (await loadToken()) await refresh();
      } catch {
        await setToken(null);
      } finally {
        setReady(true);
      }
    })();
  }, [refresh]);

  const signIn = async (token: string, u: User) => {
    await setToken(token);
    setUser(u);
  };
  const signOut = async () => {
    closeSocket();
    await setToken(null);
    setUser(null);
  };

  return <AuthContext.Provider value={{ user, ready, signIn, signOut, refresh }}>{children}</AuthContext.Provider>;
}
