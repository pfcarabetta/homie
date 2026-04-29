import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import { authService, type AuthHomeowner, type ApiError } from '@/services/api';
import { trackEvent, setUserType } from '@/services/analytics';

interface AuthState {
  homeowner: AuthHomeowner | null;
  isAuthenticated: boolean;
  /** True when the current tab is viewing a homeowner via the admin
   *  "Login as" flow (sessionStorage-scoped token). */
  isImpersonating: boolean;
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<string | null>;
  register: (params: { firstName: string; lastName: string; email: string; password: string; zipCode: string; phone?: string; smsOptIn?: boolean }) => Promise<string | null>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const HOMEOWNER_KEY = 'homie_homeowner';
const TOKEN_KEY = 'homie_token';
const IMPERSONATION_KEY = 'homie_impersonation';

function isImpersonationActive(): boolean {
  return sessionStorage.getItem(IMPERSONATION_KEY) === '1' && !!sessionStorage.getItem(TOKEN_KEY);
}

function loadStoredHomeowner(): AuthHomeowner | null {
  try {
    const store = isImpersonationActive() ? sessionStorage : localStorage;
    const raw = store.getItem(HOMEOWNER_KEY);
    return raw ? (JSON.parse(raw) as AuthHomeowner) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [homeowner, setHomeowner] = useState<AuthHomeowner | null>(loadStoredHomeowner);
  const [isImpersonating, setIsImpersonating] = useState<boolean>(isImpersonationActive);

  // Impersonation handoff: AdminImpersonate writes the token + homeowner
  // blob into sessionStorage *after* this provider already mounted with
  // empty initial state (because AuthProvider sits above the route tree).
  // Re-read once here so the impersonated portal renders with the right
  // user without needing a manual reload.
  useEffect(() => {
    if (!isImpersonationActive() || homeowner !== null) return;
    const fresh = loadStoredHomeowner();
    if (fresh) {
      setHomeowner(fresh);
      setIsImpersonating(true);
    }
  }, [homeowner]);

  const login = useCallback(async (email: string, password: string): Promise<string | null> => {
    try {
      const res = await authService.login(email, password);
      if (res.data) {
        setHomeowner(res.data.homeowner);
        localStorage.setItem(HOMEOWNER_KEY, JSON.stringify(res.data.homeowner));
        setUserType('homeowner');
        trackEvent('auth_login_completed', { user_type: 'homeowner' });
        return null;
      }
      return res.error ?? 'Login failed';
    } catch (err) {
      return (err as ApiError).message ?? 'Login failed';
    }
  }, []);

  const register = useCallback(async (params: { firstName: string; lastName: string; email: string; password: string; zipCode: string; phone?: string }): Promise<string | null> => {
    try {
      const res = await authService.register(params);
      if (res.data) {
        setHomeowner(res.data.homeowner);
        localStorage.setItem(HOMEOWNER_KEY, JSON.stringify(res.data.homeowner));
        setUserType('homeowner');
        trackEvent('auth_signup_completed', { user_type: 'homeowner' });
        return null;
      }
      return res.error ?? 'Registration failed';
    } catch (err) {
      return (err as ApiError).message ?? 'Registration failed';
    }
  }, []);

  const logout = useCallback(() => {
    if (isImpersonationActive()) {
      sessionStorage.removeItem(TOKEN_KEY);
      sessionStorage.removeItem(HOMEOWNER_KEY);
      sessionStorage.removeItem(IMPERSONATION_KEY);
      setIsImpersonating(false);
    } else {
      authService.logout();
      localStorage.removeItem(HOMEOWNER_KEY);
    }
    setHomeowner(null);
  }, []);

  return (
    <AuthContext.Provider value={{ homeowner, isAuthenticated: homeowner !== null, isImpersonating, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
