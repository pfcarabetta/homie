const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';
const TOKEN_KEY = 'homie_provider_token';

function getProviderToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

async function fetchProviderAPI<T>(path: string, options: RequestInit = {}): Promise<{ data: T | null; error: string | null; meta: Record<string, unknown> }> {
  const token = getProviderToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers as Record<string, string> | undefined),
    },
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? `Request failed: ${res.status}`);
  return body;
}

export interface DashboardStats {
  jobs_received: number;
  acceptance_rate: number;
  avg_rating: number;
  active_count: number;
  completed_count: number;
  badges: string[];
}

export interface IncomingJob {
  attempt_id: string;
  job_id: string;
  channel: string;
  attempted_at: string;
  diagnosis: { category?: string; severity?: string; summary?: string } | null;
  zip_code: string;
  timing: string | null;
  budget: string | null;
  tier: string;
  expires_at: string | null;
}

export interface HistoryJob {
  attempt_id: string;
  job_id: string;
  channel: string;
  status: string;
  attempted_at: string;
  responded_at: string | null;
  diagnosis: { category?: string; severity?: string; summary?: string } | null;
  zip_code: string;
  tier: string;
}

export interface ProviderProfile {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  categories: string[] | null;
  service_zips: string[] | null;
  license_info: Record<string, unknown> | null;
  business_hours: Record<string, unknown> | null;
  google_rating: string | null;
  review_count: number;
  yelp_url: string | null;
}

export interface ProviderSettings {
  notificationPref: string;
  vacationMode: boolean;
}

export interface ProviderBooking {
  id: string;
  status: string;
  serviceAddress: string | null;
  confirmedAt: string;
  jobId: string;
  jobStatus: string;
  diagnosis: { category?: string; severity?: string; summary?: string } | null;
  zipCode: string;
  preferredTiming: string | null;
  tier: string;
  jobCreatedAt: string;
  homeownerFirstName: string | null;
  homeownerLastName: string | null;
  homeownerEmail: string;
  homeownerPhone: string | null;
  quotedPrice: string | null;
  availability: string | null;
  responseMessage: string | null;
}

export const portalService = {
  getDashboard: () => fetchProviderAPI<DashboardStats>('/api/v1/portal/dashboard'),
  getIncomingJobs: () => fetchProviderAPI<{ jobs: IncomingJob[] }>('/api/v1/portal/jobs/incoming'),
  respondToJob: (attemptId: string, body: { action: 'accept' | 'decline'; quoted_price?: string; availability?: string; message?: string }) =>
    fetchProviderAPI<{ status: string }>(`/api/v1/portal/jobs/${attemptId}/respond`, { method: 'POST', body: JSON.stringify(body) }),
  getHistory: (params?: { status?: string; limit?: number; offset?: number }) => {
    const q = new URLSearchParams();
    if (params?.status) q.set('status', params.status);
    if (params?.limit) q.set('limit', String(params.limit));
    if (params?.offset) q.set('offset', String(params.offset));
    return fetchProviderAPI<{ jobs: HistoryJob[] }>(`/api/v1/portal/jobs/history?${q}`);
  },
  getProfile: () => fetchProviderAPI<ProviderProfile>('/api/v1/portal/profile'),
  updateProfile: (data: Partial<{ name: string; phone: string; email: string; categories: string[]; service_zips: string[]; license_info: Record<string, unknown>; business_hours: Record<string, unknown> }>) =>
    fetchProviderAPI<ProviderProfile>('/api/v1/portal/profile', { method: 'PATCH', body: JSON.stringify(data) }),
  getSettings: () => fetchProviderAPI<ProviderSettings>('/api/v1/portal/settings'),
  updateSettings: (data: Partial<{ notification_pref: string; vacation_mode: boolean }>) =>
    fetchProviderAPI<{ updated: true }>('/api/v1/portal/settings', { method: 'PATCH', body: JSON.stringify(data) }),
  optOut: () => fetchProviderAPI<{ opted_out: true }>('/api/v1/portal/opt-out', { method: 'POST' }),
  getBookings: () => fetchProviderAPI<{ bookings: ProviderBooking[] }>('/api/v1/portal/bookings'),
  cancelBooking: (bookingId: string) => fetchProviderAPI<{ cancelled: boolean }>(`/api/v1/portal/bookings/${bookingId}/cancel`, { method: 'POST' }),
  setPassword: (password: string) => fetchProviderAPI<{ set: boolean }>('/api/v1/provider-auth/set-password', {
    method: 'POST', body: JSON.stringify({ password }),
  }),
  searchGoogle: (q: string, zip?: string) => {
    const params = new URLSearchParams({ q });
    if (zip) params.set('zip', zip);
    return fetchProviderAPI<Array<{ placeId: string; name: string; rating: number; reviewCount: number; address: string }>>(`/api/v1/portal/google-search?${params}`);
  },
  claimGoogle: (data: { place_id: string; name: string; rating: number; review_count: number }) =>
    fetchProviderAPI<{ claimed: boolean }>('/api/v1/portal/google-claim', { method: 'POST', body: JSON.stringify(data) }),
};
