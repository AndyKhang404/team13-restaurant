import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { apiFetch, setCsrfToken } from '../lib/api.js';

export interface UserProfile {
  id: string;
  email: string;
  displayName: string | null;
  role: 'ADMIN' | 'STAFF' | 'CUSTOMER';
  createdAt: string;
  updatedAt: string;
}

interface AuthContextType {
  user: UserProfile | null;
  loading: boolean;
  refreshAuth: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const refreshAuth = useCallback(async () => {
    try {
      const data = await apiFetch<{ user: UserProfile | null; csrfToken: string }>('/auth/me');
      setUser(data.user);
      if (data.csrfToken) {
        setCsrfToken(data.csrfToken);
      }
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshAuth();
  }, [refreshAuth]);

  const logout = useCallback(async () => {
    try {
      await apiFetch('/auth/logout', { method: 'POST' });
    } finally {
      setUser(null);
      await refreshAuth();
    }
  }, [refreshAuth]);

  return (
    <AuthContext.Provider value={{ user, loading, refreshAuth, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
