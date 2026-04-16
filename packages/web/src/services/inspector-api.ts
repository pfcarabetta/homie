import { fetchAPI, getToken, type ApiResponse } from '@/services/api';

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
  photoDescriptions: string[];
  costEstimateMin: number | null;
  costEstimateMax: number | null;
  confidence: number;
  dispatchStatus: 'pending' | 'dispatched' | 'quotes_received' | 'quoted' | 'booked' | 'completed' | null;
  quoteDetails: QuoteDetails | null;
  valueImpact: ValueImpact | null;
  sourcePages?: number[] | null;
  sellerAction?: 'fix_before_listing' | 'disclose' | 'ignore' | null;
  sellerActionReason?: string | null;
  /** If set, this item was extracted from a supporting document — references that doc's id */
  sourceDocumentId?: string | null;
  /** Other inspection item IDs that cross-reference this one (bidirectional) */
  crossReferencedItemIds?: string[];
}

export interface ValueImpact {
  roiLow: number;
  roiHigh: number;
  roiMultiplier: number;
  lenderFlag: boolean;
  lenderFlagType: 'fha_va_required' | 'lender_concern' | null;
}

export interface QuoteDetails {
  providerName: string;
  providerRating: number;
  price: number;
  availability: string;
  /** > 1 means this price is a bundle covering N items. UI should show "Bundle: $X (covers N items)". */
  bundleSize?: number;
}

export interface Earning {
  id: string;
  type: 'referral_commission' | 'referral' | 'inbound_lead_bonus' | 'lead_bonus' | 'partner_referral_bonus';
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
  reportFileUrl?: string | null;
  reportMode?: 'buyer' | 'seller';
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
      body: JSON.stringify({
        company_name: data.companyName,
        email: data.email,
        phone: data.phone,
        password: data.password,
        website: data.website,
        license_number: data.licenseNumber,
        certifications: data.certifications,
        service_area_zips: data.serviceZipCodes,
        inspection_software: data.inspectionSoftware,
      }),
    });
  },

  login(email: string, password: string) {
    return inspectorFetch<{ token: string; partner: Record<string, unknown> }>('/api/v1/inspector/login', {
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

export interface InspectPricing {
  perItemCents: number;
  bundlePriceCents: number;
  bundleItemCount: number;
  perItemTotal: number;
  savings: number;
}

export interface InspectQuote {
  providerId: string;
  providerName: string;
  providerRating: string | null;
  amountCents: number;
  availability: string | null;
  receivedAt: string;
  /** > 1 means this price is a bundle covering N items (provider didn't itemize). UI should show "Bundle: $X (covers N items)". */
  bundleSize?: number;
}

export interface InspectStatusItem {
  id: string;
  dispatchStatus: string;
  quoteAmountCents: number | null;
  providerName: string | null;
  providerRating: string | null;
  providerAvailability: string | null;
  quoteCount: number;
  quotes: InspectQuote[];
}

export const inspectService = {
  /** Homeowner self-upload — no auth required */
  uploadReport(data: { report_file_data_url: string; property_address?: string; property_city?: string; property_state?: string; property_zip?: string; client_name?: string; client_email?: string }) {
    return fetchAPI<{ reportId: string; token: string; reportUrl: string; parsingStatus: string }>(
      '/api/v1/inspect/upload', { method: 'POST', body: JSON.stringify(data) },
    );
  },

  /** Poll parsing progress for self-uploads */
  getUploadStatus(reportId: string) {
    return fetchAPI<{ parsingStatus: string; parsingError: string | null; itemsParsed: number; clientAccessToken: string }>(
      `/api/v1/inspect/upload/${reportId}/status`,
    );
  },

  getReport(token: string) {
    return fetchAPI<InspectReportPublic>(`/api/v1/inspect/${token}`);
  },

  getPricing(token: string) {
    return fetchAPI<InspectPricing>(`/api/v1/inspect/${token}/pricing`);
  },

  checkout(token: string, mode: 'bundle' | 'per_item', itemIds?: string[], clientEmail?: string) {
    return fetchAPI<{ checkoutUrl: string; amountCents: number; itemCount: number }>(
      `/api/v1/inspect/${token}/checkout`,
      { method: 'POST', body: JSON.stringify({ mode, item_ids: itemIds, client_email: clientEmail }) },
    );
  },

  dispatch(token: string, itemIds?: string[], sessionId?: string) {
    return fetchAPI<{ dispatched: Array<{ itemId: string; jobId: string }>; totalDispatched: number }>(
      `/api/v1/inspect/${token}/dispatch`,
      { method: 'POST', body: JSON.stringify({ item_ids: itemIds, session_id: sessionId }) },
    );
  },

  getStatus(token: string) {
    return fetchAPI<{ itemsDispatched: number; itemsQuoted: number; totalQuoteValueCents: number; items: InspectStatusItem[] }>(
      `/api/v1/inspect/${token}/status`,
    );
  },

  claimReport(token: string, homeownerId: string) {
    return fetchAPI<{ claimed: boolean }>(
      `/api/v1/inspect/${token}/claim`,
      { method: 'POST', body: JSON.stringify({ homeowner_id: homeownerId }) },
    );
  },

  // ── Portal (authenticated) methods ──────────────────────────────────────

  /** Authenticated: list homeowner's reports */
  getMyReports() {
    return fetchAPI<{ reports: PortalReport[] }>('/api/v1/account/reports');
  },

  /** Authenticated: delete a report */
  deleteReport(reportId: string) {
    return fetchAPI<{ deleted: boolean }>(`/api/v1/account/reports/${reportId}`, { method: 'DELETE' });
  },

  /** Authenticated: checkout for portal report tier */
  portalCheckout(reportId: string, tier: 'essential' | 'professional' | 'premium') {
    return fetchAPI<{ checkoutUrl: string; amountCents: number; tier: string }>(
      `/api/v1/account/reports/${reportId}/checkout`,
      { method: 'POST', body: JSON.stringify({ tier }) },
    );
  },

  /** Authenticated: confirm payment and set tier */
  confirmPayment(reportId: string, sessionId: string) {
    return fetchAPI<{ tier: string; confirmed: boolean }>(
      `/api/v1/account/reports/${reportId}/confirm-payment`,
      { method: 'POST', body: JSON.stringify({ session_id: sessionId }) },
    );
  },

  /** Authenticated: dispatch items after payment. Pass itemIds to dispatch specific items only. */
  portalDispatch(reportId: string, itemIds?: string[]) {
    return fetchAPI<{ dispatched: Array<{ itemId: string; jobId: string }>; totalDispatched: number }>(
      `/api/v1/account/reports/${reportId}/dispatch`,
      { method: 'POST', body: JSON.stringify(itemIds ? { item_ids: itemIds } : {}) },
    );
  },

  /** Authenticated: seed fake quotes for testing (dev only) */
  seedMockQuotes(reportId: string) {
    return fetchAPI<{ quotesGenerated: number; itemsQuoted: number }>(
      `/api/v1/account/reports/${reportId}/seed-mock-quotes`,
      { method: 'POST', body: JSON.stringify({}) },
    );
  },

  /** Authenticated: update negotiation state on an inspection item */
  updateNegotiation(reportId: string, itemId: string, fields: {
    isIncludedInRequest?: boolean;
    homeownerNotes?: string | null;
    sellerAgreedAmountCents?: number | null;
    creditIssuedCents?: number | null;
    concessionStatus?: string | null;
    repairRequestSource?: string | null;
    repairRequestCustomAmountCents?: number | null;
  }) {
    return fetchAPI<{
      id: string;
      isIncludedInRequest: boolean;
      homeownerNotes: string | null;
      sellerAgreedAmountCents: number | null;
      creditIssuedCents: number | null;
      concessionStatus: string | null;
      repairRequestSource: string | null;
      repairRequestCustomAmountCents: number | null;
    }>(
      `/api/v1/account/reports/${reportId}/items/${itemId}/negotiation`,
      { method: 'PATCH', body: JSON.stringify(fields) },
    );
  },

  /** Authenticated: download repair request PDF as a blob */
  async downloadRepairRequestPdf(reportId: string): Promise<Blob | null> {
    const token = getToken();
    const res = await fetch(`${API_BASE}/api/v1/account/reports/${reportId}/repair-request.pdf`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    if (!res.ok) return null;
    return res.blob();
  },

  /** Authenticated: download seller pre-listing plan PDF as a blob */
  async downloadPreListingPlanPdf(reportId: string): Promise<Blob | null> {
    const token = getToken();
    const res = await fetch(`${API_BASE}/api/v1/account/reports/${reportId}/pre-listing-plan.pdf`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    if (!res.ok) return null;
    return res.blob();
  },

  /** Authenticated: switch report buyer/seller mode */
  updateReportMode(reportId: string, mode: 'buyer' | 'seller') {
    return fetchAPI<{ id: string; reportMode: string }>(
      `/api/v1/account/reports/${reportId}/mode`,
      { method: 'PATCH', body: JSON.stringify({ mode }) },
    );
  },

  /** Authenticated: mark/unmark a maintenance item complete */
  updateMaintenance(reportId: string, itemId: string, fields: { maintenanceCompletedAt: string | null }) {
    return fetchAPI<{ id: string; maintenanceCompletedAt: string | null }>(
      `/api/v1/account/reports/${reportId}/items/${itemId}/maintenance`,
      { method: 'PATCH', body: JSON.stringify(fields) },
    );
  },

  // ── Supporting documents (multi-doc analysis) ────────────────────────────

  uploadSupportingDocument(reportId: string, params: { documentType: 'pest_report' | 'seller_disclosure'; fileName: string; fileDataUrl: string }) {
    return fetchAPI<SupportingDocument>(
      `/api/v1/account/reports/${reportId}/documents`,
      { method: 'POST', body: JSON.stringify({ document_type: params.documentType, file_name: params.fileName, file_data_url: params.fileDataUrl }) },
    );
  },

  listSupportingDocuments(reportId: string) {
    return fetchAPI<{ documents: SupportingDocument[] }>(`/api/v1/account/reports/${reportId}/documents`);
  },

  deleteSupportingDocument(reportId: string, docId: string) {
    return fetchAPI<{ deleted: boolean }>(
      `/api/v1/account/reports/${reportId}/documents/${docId}`,
      { method: 'DELETE' },
    );
  },

  reprocessSupportingDocument(reportId: string, docId: string) {
    return fetchAPI<{ itemsExtracted: number; insightsGenerated: number }>(
      `/api/v1/account/reports/${reportId}/documents/${docId}/reprocess`,
      { method: 'POST' },
    );
  },

  getCrossReferenceInsights(reportId: string) {
    return fetchAPI<{ insights: CrossReferenceInsight[]; generatedAt: string | null }>(
      `/api/v1/account/reports/${reportId}/insights`,
    );
  },

  listAllSupportingDocuments() {
    return fetchAPI<{ documents: SupportingDocumentWithReport[] }>(`/api/v1/account/documents`);
  },

  /** Authenticated: accept a quote for an inspection item */
  bookQuote(reportId: string, itemId: string, providerId: string) {
    return fetchAPI<{ bookingId: string; status: string; providerName: string; providerPhone: string; quotedPrice: string | null; scheduled: string | null }>(
      `/api/v1/account/reports/${reportId}/items/${itemId}/book`,
      { method: 'POST', body: JSON.stringify({ provider_id: providerId }) },
    );
  },
};

// ── SSE streaming helpers for AI deep dive ────────────────────────────────

export interface StreamCallbacks {
  onToken: (token: string) => void;
  onDone: () => void;
  onError: (err: Error) => void;
}

function streamSSE(
  path: string,
  body: Record<string, unknown>,
  callbacks: StreamCallbacks,
): AbortController {
  const controller = new AbortController();
  const token = getToken();

  (async () => {
    try {
      const res = await fetch(`${API_BASE}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        const text = await res.text();
        callbacks.onError(new Error(text || `SSE failed: ${res.status}`));
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const payload = line.slice(6);

          if (payload === '[DONE]') {
            callbacks.onDone();
            return;
          }

          try {
            const data = JSON.parse(payload) as { token?: string; error?: string };
            if (data.error) { callbacks.onError(new Error(data.error)); return; }
            if (data.token) callbacks.onToken(data.token);
          } catch { /* skip malformed lines */ }
        }
      }

      callbacks.onDone();
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        callbacks.onError(err as Error);
      }
    }
  })();

  return controller;
}

/** Stream AI analysis for an inspection item */
export function analyzeItem(reportId: string, itemId: string, callbacks: StreamCallbacks): AbortController {
  return streamSSE(`/api/v1/account/reports/${reportId}/items/${itemId}/analyze`, {}, callbacks);
}

/** Stream AI follow-up chat about an inspection item */
export function chatItem(
  reportId: string,
  itemId: string,
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  callbacks: StreamCallbacks,
): AbortController {
  return streamSSE(`/api/v1/account/reports/${reportId}/items/${itemId}/chat`, { messages }, callbacks);
}

// ── Portal types ──────────────────────────────────────────────────────────

export interface PortalReportItem {
  id: string;
  title: string;
  severity: string;
  category: string;
  location?: string | null;
  costEstimateMin: number | null;
  costEstimateMax: number | null;
  dispatchStatus: string | null;
  quoteAmount: number | null;
  providerName?: string | null;
  /** All quotes received for this item (full list, not just best). bundleSize > 1 = price covers multiple items. */
  quotes?: Array<{ providerId: string; providerName: string; providerRating: string | null; amountCents: number; availability: string | null; receivedAt: string; bundleSize?: number }>;
  isIncludedInRequest?: boolean;
  homeownerNotes?: string | null;
  sellerAgreedAmountCents?: number | null;
  creditIssuedCents?: number | null;
  concessionStatus?: string | null;
  /** Source for repair request ask: null = default, 'estimate' = AI estimate, 'custom' = use repairRequestCustomAmountCents, otherwise = provider UUID */
  repairRequestSource?: string | null;
  /** Homeowner-entered custom amount, used when repairRequestSource === 'custom' */
  repairRequestCustomAmountCents?: number | null;
  /** 1-indexed page numbers in the source PDF where this item was found */
  sourcePages?: number[] | null;
  /** Seller action recommendation: fix_before_listing | disclose | ignore */
  sellerAction?: 'fix_before_listing' | 'disclose' | 'ignore' | null;
  sellerActionReason?: string | null;
  /** ISO timestamp when homeowner marked this item complete (Maintenance tab) */
  maintenanceCompletedAt?: string | null;
  /** If set, this item was extracted from a supporting document — references that doc's id */
  sourceDocumentId?: string | null;
  /** Other inspection item IDs that cross-reference this one (bidirectional) */
  crossReferencedItemIds?: string[];
}

export interface PortalReport {
  id: string;
  propertyAddress: string;
  propertyCity: string;
  propertyState: string;
  propertyZip: string;
  inspectionDate: string;
  inspectionType: string;
  parsingStatus: string;
  clientAccessToken: string;
  pricingTier: string | null;
  reportFileUrl?: string | null;
  reportMode?: 'buyer' | 'seller';
  itemCount: number;
  dispatchedCount: number;
  quotedCount: number;
  totalEstimateLow: number;
  totalEstimateHigh: number;
  totalQuoteValue: number;
  createdAt: string;
  items: PortalReportItem[];
}

// ── Supporting Documents + Cross-Reference Insights ────────────────────────

export interface SupportingDocument {
  id: string;
  reportId: string;
  documentType: 'pest_report' | 'seller_disclosure';
  fileName: string;
  documentFileUrl: string | null;
  parsingStatus: 'uploading' | 'processing' | 'parsed' | 'failed';
  parsingError?: string | null;
  parsedSummary: Record<string, unknown> | null;
  createdAt: string;
}

export interface SupportingDocumentWithReport extends SupportingDocument {
  reportAddress: string;
}

export interface CrossReferenceInsight {
  id: string;
  title: string;
  description: string;
  severity: 'info' | 'warning' | 'concern';
  relatedDocIds: string[];
  relatedItemIds: string[];
}
