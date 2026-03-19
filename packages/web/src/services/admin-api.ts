const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';
const ADMIN_KEY_STORAGE = 'homie_admin_key';

export function getAdminKey(): string | null {
  return sessionStorage.getItem(ADMIN_KEY_STORAGE);
}

export function setAdminKey(key: string): void {
  sessionStorage.setItem(ADMIN_KEY_STORAGE, key);
}

export function clearAdminKey(): void {
  sessionStorage.removeItem(ADMIN_KEY_STORAGE);
}

async function fetchAdmin<T>(path: string): Promise<{ data: T | null; error: string | null; meta: Record<string, unknown> }> {
  const key = getAdminKey();
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(key ? { 'x-admin-key': key } : {}),
    },
  });

  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? `Request failed: ${res.status}`);
  return body;
}

export const adminService = {
  async getStats() {
    return fetchAdmin<{
      total_homeowners: number;
      total_jobs: number;
      total_bookings: number;
      total_providers: number;
      total_outreach: number;
      jobs_by_status: Record<string, number>;
    }>('/api/v1/admin/stats');
  },

  async getHomeowners(params?: { limit?: number; offset?: number }) {
    const q = new URLSearchParams();
    if (params?.limit) q.set('limit', String(params.limit));
    if (params?.offset) q.set('offset', String(params.offset));
    return fetchAdmin<Array<{
      id: string;
      email: string;
      phone: string | null;
      zipCode: string;
      membershipTier: string;
      createdAt: string;
    }>>(`/api/v1/admin/homeowners?${q}`);
  },

  async getJobs(params?: { limit?: number; offset?: number; status?: string }) {
    const q = new URLSearchParams();
    if (params?.limit) q.set('limit', String(params.limit));
    if (params?.offset) q.set('offset', String(params.offset));
    if (params?.status) q.set('status', params.status);
    return fetchAdmin<Array<{
      id: string;
      homeownerEmail: string | null;
      diagnosis: { category?: string; severity?: string; summary?: string } | null;
      tier: string;
      status: string;
      zipCode: string;
      preferredTiming: string | null;
      budget: string | null;
      createdAt: string;
    }>>(`/api/v1/admin/jobs?${q}`);
  },

  async getProviders(params?: { limit?: number; offset?: number }) {
    const q = new URLSearchParams();
    if (params?.limit) q.set('limit', String(params.limit));
    if (params?.offset) q.set('offset', String(params.offset));
    return fetchAdmin<Array<{
      id: string;
      name: string;
      phone: string | null;
      email: string | null;
      website: string | null;
      googleRating: string | null;
      reviewCount: number;
      categories: string[] | null;
      discoveredAt: string;
      acceptanceRate: string | null;
      totalOutreach: number | null;
      totalAccepted: number | null;
    }>>(`/api/v1/admin/providers?${q}`);
  },

  async getBookings(params?: { limit?: number; offset?: number }) {
    const q = new URLSearchParams();
    if (params?.limit) q.set('limit', String(params.limit));
    if (params?.offset) q.set('offset', String(params.offset));
    return fetchAdmin<Array<{
      id: string;
      jobId: string;
      providerName: string | null;
      homeownerEmail: string | null;
      status: string;
      confirmedAt: string;
    }>>(`/api/v1/admin/bookings?${q}`);
  },
};
