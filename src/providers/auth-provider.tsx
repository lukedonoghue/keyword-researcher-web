'use client';

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';

type AuthState = {
  authenticated: boolean;
  hasCustomerId: boolean;
  customerId: string | null;
  loading: boolean;
};

type AuthContextType = AuthState & {
  checkAuth: () => Promise<void>;
  logout: () => Promise<void>;
  selectAccount: (customerId: string) => Promise<void>;
  openrouterApiKey: string;
  setOpenrouterApiKey: (key: string) => void;
};

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    authenticated: false,
    hasCustomerId: false,
    customerId: null,
    loading: true,
  });
  const [openrouterApiKey, setOpenrouterApiKeyState] = useState(() => {
    if (typeof window === 'undefined') return '';
    return localStorage.getItem('openrouter_api_key') || '';
  });

  const checkAuth = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/status');
      const data = await res.json();
      setState({
        authenticated: data.authenticated,
        hasCustomerId: data.hasCustomerId,
        customerId: data.customerId,
        loading: false,
      });
    } catch {
      setState((prev) => ({ ...prev, loading: false }));
    }
  }, []);

  const logout = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setState({ authenticated: false, hasCustomerId: false, customerId: null, loading: false });
  }, []);

  const selectAccount = useCallback(async (customerId: string) => {
    const res = await fetch('/api/google-ads/accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customerId }),
    });
    if (res.ok) {
      setState((prev) => ({ ...prev, hasCustomerId: true, customerId }));
    }
  }, []);

  const setOpenrouterApiKey = useCallback((key: string) => {
    setOpenrouterApiKeyState(key);
    if (typeof window !== 'undefined') {
      localStorage.setItem('openrouter_api_key', key);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      void checkAuth();
    }, 0);
    return () => clearTimeout(timer);
  }, [checkAuth]);

  return (
    <AuthContext.Provider
      value={{ ...state, checkAuth, logout, selectAccount, openrouterApiKey, setOpenrouterApiKey }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
