import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { loadSession, setAuthToken } from '../lib/api';
import { authApi } from '../lib/resources';
import type { AuthUser } from '../lib/types';

interface AuthValue {
  user: AuthUser | null;
  loading: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthValue>({
  user: null,
  loading: true,
  refresh: async () => {},
  signOut: async () => {},
});

/** Holds only the authenticated user (Bearer token session), not list/record data. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const data = await loadSession();
      setUser(data.user);
    } catch {
      setUser(null);
      setAuthToken(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const signOut = async () => {
    try {
      await authApi.logout();
    } finally {
      setAuthToken(null);
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, refresh, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthValue {
  return useContext(AuthContext);
}
