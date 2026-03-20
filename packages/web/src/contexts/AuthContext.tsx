import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { authService, type AuthHomeowner, type ApiError } from '@/services/api';

interface AuthState {
  homeowner: AuthHomeowner | null;
  isAuthenticated: boolean;
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<string | null>;
  register: (params: { firstName: string; lastName: string; email: string; password: string; zipCode: string; phone?: string }) => Promise<string | null>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const HOMEOWNER_KEY = 'homie_homeowner';

function loadStoredHomeowner(): AuthHomeowner | null {
  try {
    const raw = localStorage.getItem(HOMEOWNER_KEY);
    return raw ? (JSON.parse(raw) as AuthHomeowner) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [homeowner, setHomeowner] = useState<AuthHomeowner | null>(loadStoredHomeowner);

  const login = useCallback(async (email: string, password: string): Promise<string | null> => {
    try {
      const res = await authService.login(email, password);
      if (res.data) {
        setHomeowner(res.data.homeowner);
        localStorage.setItem(HOMEOWNER_KEY, JSON.stringify(res.data.homeowner));
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
        return null;
      }
      return res.error ?? 'Registration failed';
    } catch (err) {
      return (err as ApiError).message ?? 'Registration failed';
    }
  }, []);

  const logout = useCallback(() => {
    authService.logout();
    localStorage.removeItem(HOMEOWNER_KEY);
    setHomeowner(null);
  }, []);

  return (
    <AuthContext.Provider value={{ homeowner, isAuthenticated: homeowner !== null, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
