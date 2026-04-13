import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { inspectorService, type InspectorProfile, type InspectorSignupData } from '@/services/inspector-api';

const TOKEN_KEY = 'homie_inspector_token';
const INSPECTOR_KEY = 'homie_inspector';

interface InspectorAuthContextValue {
  inspector: InspectorProfile | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<string | null>;
  signup: (data: InspectorSignupData) => Promise<string | null>;
  logout: () => void;
}

const InspectorAuthContext = createContext<InspectorAuthContextValue | null>(null);

function loadStored(): InspectorProfile | null {
  try {
    const raw = localStorage.getItem(INSPECTOR_KEY);
    return raw ? (JSON.parse(raw) as InspectorProfile) : null;
  } catch {
    return null;
  }
}

export function InspectorAuthProvider({ children }: { children: ReactNode }) {
  const [inspector, setInspector] = useState<InspectorProfile | null>(loadStored);

  const login = useCallback(async (email: string, password: string): Promise<string | null> => {
    try {
      const res = await inspectorService.login(email, password);
      if (res.data?.token) {
        localStorage.setItem(TOKEN_KEY, res.data.token);
        // Backend returns { token, partner: {...} } — map to InspectorProfile
        const p = res.data.partner ?? {};
        const profile: InspectorProfile = {
          id: (p.id as string) ?? '',
          companyName: (p.companyName as string) ?? '',
          email: (p.email as string) ?? email,
          phone: (p.phone as string) ?? null,
          website: null, licenseNumber: null,
          certifications: [], serviceZipCodes: [],
          inspectionSoftware: null,
          logoUrl: (p.companyLogoUrl as string) ?? null,
          partnerUrl: (p.partnerSlug as string) ? `/inspector/partner/${p.partnerSlug}` : null,
          payoutMethod: 'stripe',
          notificationPreferences: {},
          createdAt: new Date().toISOString(),
        };
        localStorage.setItem(INSPECTOR_KEY, JSON.stringify(profile));
        setInspector(profile);
        return null;
      }
      return res.error ?? 'Login failed';
    } catch (err) {
      return (err as Error).message ?? 'Login failed';
    }
  }, []);

  const signup = useCallback(async (data: InspectorSignupData): Promise<string | null> => {
    try {
      const res = await inspectorService.signup(data);
      if (res.data?.token) {
        localStorage.setItem(TOKEN_KEY, res.data.token);
        // Signup returns minimal data — fetch full profile after saving token
        try {
          const profileRes = await inspectorService.getProfile();
          if (profileRes.data) {
            localStorage.setItem(INSPECTOR_KEY, JSON.stringify(profileRes.data));
            setInspector(profileRes.data);
          } else {
            // Use a minimal profile from what we have
            const minimal: InspectorProfile = {
              id: (res.data as unknown as Record<string, string>).partnerId ?? '',
              companyName: data.companyName,
              email: data.email,
              phone: data.phone,
              website: data.website ?? null,
              licenseNumber: data.licenseNumber ?? null,
              certifications: data.certifications ?? [],
              serviceZipCodes: data.serviceZipCodes ?? [],
              inspectionSoftware: data.inspectionSoftware ?? null,
              logoUrl: null, partnerUrl: null,
              payoutMethod: 'stripe', notificationPreferences: {}, createdAt: new Date().toISOString(),
            };
            localStorage.setItem(INSPECTOR_KEY, JSON.stringify(minimal));
            setInspector(minimal);
          }
        } catch {
          // Profile fetch failed — create minimal from signup data
          const minimal: InspectorProfile = {
            id: (res.data as unknown as Record<string, string>).partnerId ?? '',
            companyName: data.companyName, email: data.email, phone: data.phone,
            website: data.website ?? null, licenseNumber: data.licenseNumber ?? null,
            certifications: data.certifications ?? [], serviceZipCodes: data.serviceZipCodes ?? [],
            inspectionSoftware: data.inspectionSoftware ?? null, logoUrl: null, partnerUrl: null,
            payoutMethod: 'stripe', notificationPreferences: {},
            createdAt: new Date().toISOString(),
          };
          localStorage.setItem(INSPECTOR_KEY, JSON.stringify(minimal));
          setInspector(minimal);
        }
        return null;
      }
      return res.error ?? 'Signup failed';
    } catch (err) {
      return (err as Error).message ?? 'Signup failed';
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(INSPECTOR_KEY);
    setInspector(null);
  }, []);

  return (
    <InspectorAuthContext.Provider value={{ inspector, isAuthenticated: inspector !== null, login, signup, logout }}>
      {children}
    </InspectorAuthContext.Provider>
  );
}

export function useInspectorAuth(): InspectorAuthContextValue {
  const ctx = useContext(InspectorAuthContext);
  if (!ctx) throw new Error('useInspectorAuth must be used within InspectorAuthProvider');
  return ctx;
}
