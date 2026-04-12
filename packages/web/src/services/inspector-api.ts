import { fetchAPI, type ApiResponse } from '@/services/api';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';
const TOKEN_KEY = 'homie_inspector_token';

// ── Types ───────────────────────────────────────────────────────────────────

export interface InspectorProfile {
  id: string;
  companyName: string;
  email: string;
  phone: string | null;
  website: string | null;
  licenseNumber: string | null;
  certifications: string[];
  serviceZipCodes: string[];
  inspectionSoftware: string | null;
  logoUrl: string | null;
  partnerUrl: string | null;
  addonFeePercent: number;
  payoutMethod: string | null;
  notificationPreferences: Record<string, boolean>;
  createdAt: string;
}

export interface InspectorSignupData {
  companyName: string;
  email: string;
  phone: string;
  password: string;
  website?: string;
  licenseNumber?: string;
  certifications?: string[];
  serviceZipCodes?: string[];
  inspectionSoftware?: string;
}

export interface InspectionReport {
  id: string;
  inspectorId: string;
  clientName: string;
  clientEmail: string | null;
  clientPhone: string | null;
  propertyAddress: string;
  propertyCity: string;
  propertyState: string;
  propertyZip: string;
  inspectionDate: string;
  inspectionType: string;
  status: 'processing' | 'ready' | 'sent' | 'active' | 'completed';
  addonFee: number | null;
  items: InspectionItem[];
  itemCount: number;
  dispatchedCount: number;
  earnings: number;
  createdAt: string;
}

export interface InspectionItem {
  id: string;
  reportId: string;
  title: string;
  description: string;
  severity: 'safety_hazard' | 'urgent' | 'recommended' | 'monitor' | 'informational';
  category: string;
  location: string | null;
  costEstimateMin: number | null;
  costEstimateMax: number | null;
  confidence: number;
  dispatchStatus: 'pending' | 'dispatched' | 'quoted' | 'booked' | null;
  quoteDetails: QuoteDetails | null;
}

export interface QuoteDetails {
  providerName: string;
  providerRating: number;
  price: number;
  availability: string;
}

export interface Earning {
  id: string;
  type: 'addon_fee' | 'referral' | 'lead_bonus';
  description: string;
  amount: number;
  reportId: string | null;
  createdAt: string;
}

export interface EarningsSummary {
  currentMonth: number;
  lastMonth: number;
  lifetime: number;
}

export interface Lead {
  id: string;
  homeownerName: string;
  area: string;
  type: string;
  timing: string;
  status: 'new' | 'accepted' | 'converted' | 'passed' | 'expired';
  expiresAt: string;
  createdAt: string;
}

export interface InspectReportPublic {
  id: string;
  inspectorCompanyName: string;
  inspectorLogoUrl: string | null;
  propertyAddress: string;
  propertyCity: string;
  propertyState: string;
  propertyZip: string;
  inspectionDate: string;
  inspectionType: string;
  items: InspectionItem[];
  perItemPrice: number;
  bundlePrice: number;
}

// ── Auth helpers ────────────────────────────────────────────────────────────

function getInspectorToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

function inspectorAuthHeaders(): Record<string, string> {
  const token = getInspectorToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function inspectorFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<ApiResponse<T>> {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...inspectorAuthHeaders(),
      ...(options.headers as Record<string, string> | undefined),
    },
  });

  const rawText = await res.text();
  let body: ApiResponse<T> | null = null;
  if (rawText) {
    try {
      body = JSON.parse(rawText) as ApiResponse<T>;
    } catch {
      // non-JSON response
    }
  }

  if (!res.ok) {
    const fallbackMsg = `Request failed with status ${res.status}`;
    const error = new Error(body?.error ?? fallbackMsg);
    throw error;
  }

  if (!body) {
    throw new Error(`Empty response from server (${res.status})`);
  }

  return body;
}

async function inspectorFetchMultipart<T>(
  path: string,
  formData: FormData,
): Promise<ApiResponse<T>> {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      ...inspectorAuthHeaders(),
    },
    body: formData,
  });

  const rawText = await res.text();
  let body: ApiResponse<T> | null = null;
  if (rawText) {
    try {
      body = JSON.parse(rawText) as ApiResponse<T>;
    } catch {
      // non-JSON response
    }
  }

  if (!res.ok) {
    const fallbackMsg = `Request failed with status ${res.status}`;
    throw new Error(body?.error ?? fallbackMsg);
  }

  if (!body) {
    throw new Error(`Empty response from server (${res.status})`);
  }

  return body;
}

// ── Inspector Service (authenticated) ───────────────────────────────────────

export const inspectorService = {
  signup(data: InspectorSignupData) {
    return inspectorFetch<{ token: string; inspector: InspectorProfile }>('/api/v1/inspector/signup', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  login(email: string, password: string) {
    return inspectorFetch<{ token: string; inspector: InspectorProfile }>('/api/v1/inspector/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  },

  getProfile() {
    return inspectorFetch<InspectorProfile>('/api/v1/inspector/profile');
  },

  updateProfile(data: Partial<InspectorProfile>) {
    return inspectorFetch<InspectorProfile>('/api/v1/inspector/profile', {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  createReport(formData: FormData) {
    return inspectorFetchMultipart<InspectionReport>('/api/v1/inspector/reports', formData);
  },

  listReports(status?: string) {
    const query = status && status !== 'all' ? `?status=${status}` : '';
    return inspectorFetch<InspectionReport[]>(`/api/v1/inspector/reports${query}`);
  },

  getReport(id: string) {
    return inspectorFetch<InspectionReport>(`/api/v1/inspector/reports/${id}`);
  },

  sendToClient(reportId: string) {
    return inspectorFetch<InspectionReport>(`/api/v1/inspector/reports/${reportId}/send`, {
      method: 'POST',
    });
  },

  updateItem(reportId: string, itemId: string, data: Partial<InspectionItem>) {
    return inspectorFetch<InspectionItem>(`/api/v1/inspector/reports/${reportId}/items/${itemId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  addItem(reportId: string, data: Partial<InspectionItem>) {
    return inspectorFetch<InspectionItem>(`/api/v1/inspector/reports/${reportId}/items`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  deleteItem(reportId: string, itemId: string) {
    return inspectorFetch<void>(`/api/v1/inspector/reports/${reportId}/items/${itemId}`, {
      method: 'DELETE',
    });
  },

  getEarningsSummary() {
    return inspectorFetch<EarningsSummary>('/api/v1/inspector/earnings/summary');
  },

  getEarnings() {
    return inspectorFetch<Earning[]>('/api/v1/inspector/earnings');
  },

  getLeads(status?: string) {
    const query = status && status !== 'all' ? `?status=${status}` : '';
    return inspectorFetch<Lead[]>(`/api/v1/inspector/leads${query}`);
  },

  acceptLead(leadId: string) {
    return inspectorFetch<Lead>(`/api/v1/inspector/leads/${leadId}/accept`, {
      method: 'POST',
    });
  },

  passLead(leadId: string) {
    return inspectorFetch<Lead>(`/api/v1/inspector/leads/${leadId}/pass`, {
      method: 'POST',
    });
  },

  convertLead(leadId: string) {
    return inspectorFetch<Lead>(`/api/v1/inspector/leads/${leadId}/convert`, {
      method: 'POST',
    });
  },
};

// ── Inspect Service (client-facing, public) ─────────────────────────────────

export const inspectService = {
  getReport(token: string) {
    return fetchAPI<InspectReportPublic>(`/api/v1/inspect/${token}`);
  },

  dispatchItem(token: string, itemId: string) {
    return fetchAPI<{ dispatched: boolean }>(`/api/v1/inspect/${token}/dispatch/${itemId}`, {
      method: 'POST',
    });
  },

  dispatchAll(token: string) {
    return fetchAPI<{ dispatched: boolean }>(`/api/v1/inspect/${token}/dispatch-all`, {
      method: 'POST',
    });
  },
};
