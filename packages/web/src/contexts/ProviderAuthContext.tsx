import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';
const TOKEN_KEY = 'homie_provider_token';
const PROVIDER_KEY = 'homie_provider';

export interface ProviderInfo {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  categories: string[] | null;
}

interface ProviderAuthContextValue {
  provider: ProviderInfo | null;
  isProviderAuthenticated: boolean;
  loginWithToken: (token: string) => Promise<string | null>;
  requestMagicLink: (phoneOrEmail: string) => Promise<string | null>;
  logout: () => void;
}

const ProviderAuthContext = createContext<ProviderAuthContextValue | null>(null);

function loadStored(): ProviderInfo | null {
  try {
    const raw = localStorage.getItem(PROVIDER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function ProviderAuthProvider({ children }: { children: ReactNode }) {
  const [provider, setProvider] = useState<ProviderInfo | null>(loadStored);

  // Check URL for magic link token on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    if (token && !provider) {
      void loginWithToken(token);
    }
  }, []);

  const loginWithToken = useCallback(async (token: string): Promise<string | null> => {
    try {
      const res = await fetch(`${API_BASE}/api/v1/provider-auth/verify?token=${encodeURIComponent(token)}`);
      const body = await res.json();
      if (!res.ok || !body.data) return body.error ?? 'Verification failed';

      localStorage.setItem(TOKEN_KEY, body.data.token);
      localStorage.setItem(PROVIDER_KEY, JSON.stringify(body.data.provider));
      setProvider(body.data.provider);

      // Clean token from URL
      const url = new URL(window.location.href);
      url.searchParams.delete('token');
      window.history.replaceState({}, '', url.pathname + url.search);

      return null;
    } catch (err) {
      return (err as Error).message ?? 'Verification failed';
    }
  }, []);

  const requestMagicLink = useCallback(async (phoneOrEmail: string): Promise<string | null> => {
    try {
      const isEmail = phoneOrEmail.includes('@');
      const body = isEmail ? { email: phoneOrEmail } : { phone: phoneOrEmail };
      const res = await fetch(`${API_BASE}/api/v1/provider-auth/magic-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) return data.error ?? 'Failed to send link';
      return null;
    } catch (err) {
      return (err as Error).message ?? 'Failed to send link';
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(PROVIDER_KEY);
    setProvider(null);
  }, []);

  return (
    <ProviderAuthContext.Provider value={{ provider, isProviderAuthenticated: provider !== null, loginWithToken, requestMagicLink, logout }}>
      {children}
    </ProviderAuthContext.Provider>
  );
}

export function useProviderAuth(): ProviderAuthContextValue {
  const ctx = useContext(ProviderAuthContext);
  if (!ctx) throw new Error('useProviderAuth must be used within ProviderAuthProvider');
  return ctx;
}
