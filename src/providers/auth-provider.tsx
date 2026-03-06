'use client';

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';

type AuthState = {
  authenticated: boolean;
  hasCustomerId: boolean;
  customerId: string | null;
  loginCustomerId: string | null;
  selectedAccountName: string | null;
  loading: boolean;
};

type AuthContextType = AuthState & {
  checkAuth: () => Promise<void>;
  logout: () => Promise<void>;
  selectAccount: (selection: {
    customerId: string;
    loginCustomerId?: string | null;
    descriptiveName?: string | null;
  }) => Promise<void>;
  openrouterApiKey: string;
  setOpenrouterApiKey: (key: string) => void;
  openrouterModel: string;
  setOpenrouterModel: (model: string) => void;
};

const AuthContext = createContext<AuthContextType | null>(null);

const DEFAULT_OPENROUTER_MODEL = 'google/gemini-3-flash-preview';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    authenticated: false,
    hasCustomerId: false,
    customerId: null,
    loginCustomerId: null,
    selectedAccountName: null,
    loading: true,
  });
  const [openrouterApiKey, setOpenrouterApiKeyState] = useState(() => {
    if (typeof window === 'undefined') return '';
    return localStorage.getItem('openrouter_api_key') || '';
  });
  const [openrouterModel, setOpenrouterModelState] = useState(() => {
    if (typeof window === 'undefined') return DEFAULT_OPENROUTER_MODEL;
    return localStorage.getItem('openrouter_model') || DEFAULT_OPENROUTER_MODEL;
  });

  const checkAuth = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/status');
      const data = await res.json() as {
        authenticated?: boolean;
        hasCustomerId?: boolean;
        customerId?: string | null;
        loginCustomerId?: string | null;
        selectedAccountName?: string | null;
      };
      setState({
        authenticated: Boolean(data.authenticated),
        hasCustomerId: Boolean(data.hasCustomerId),
        customerId: data.customerId || null,
        loginCustomerId: data.loginCustomerId || null,
        selectedAccountName: data.selectedAccountName || null,
        loading: false,
      });
    } catch {
      setState((prev) => ({ ...prev, loading: false }));
    }
  }, []);

  const logout = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setState({
      authenticated: false,
      hasCustomerId: false,
      customerId: null,
      loginCustomerId: null,
      selectedAccountName: null,
      loading: false,
    });
  }, []);

  const selectAccount = useCallback(async (selection: {
    customerId: string;
    loginCustomerId?: string | null;
    descriptiveName?: string | null;
  }) => {
    const res = await fetch('/api/google-ads/accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(selection),
    });
    const data = await res.json().catch(() => null) as { error?: string } | null;
    if (!res.ok) {
      throw new Error(data?.error || 'Failed to select Google Ads account');
    }
    setState((prev) => ({
      ...prev,
      hasCustomerId: true,
      customerId: selection.customerId,
      loginCustomerId: selection.loginCustomerId || null,
      selectedAccountName: selection.descriptiveName || prev.selectedAccountName,
    }));
  }, []);

  const setOpenrouterApiKey = useCallback((key: string) => {
    setOpenrouterApiKeyState(key);
    if (typeof window !== 'undefined') {
      localStorage.setItem('openrouter_api_key', key);
    }
  }, []);

  const setOpenrouterModel = useCallback((model: string) => {
    setOpenrouterModelState(model);
    if (typeof window !== 'undefined') {
      localStorage.setItem('openrouter_model', model);
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
      value={{
        ...state,
        checkAuth,
        logout,
        selectAccount,
        openrouterApiKey,
        setOpenrouterApiKey,
        openrouterModel,
        setOpenrouterModel,
      }}
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
