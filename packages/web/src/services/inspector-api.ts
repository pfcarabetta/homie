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
  /** Legacy display status — use `parsingStatus` for the source-of-truth value. */
  status: 'processing' | 'ready' | 'sent' | 'active' | 'completed';
  /** Parsing/lifecycle status straight from the DB column. */
  parsingStatus?: 'uploading' | 'processing' | 'parsed' | 'review_pending' | 'sent_to_client' | 'failed';
  parsingError?: string | null;
  pricingTier?: 'essential' | 'professional' | 'premium' | null;
  /** Additional recipient emails set in the send-to-client modal. */
  ccEmails?: string[];
  /** When the inspector hit "Send to Client". */
  clientNotifiedAt?: string | null;
  /** First time the homeowner's email tracking pixel fired (proxy for "opened"). */
  homeownerOpenedAt?: string | null;
  /** When the auto/manual reminder was last sent. */
  homeownerReminderSentAt?: string | null;
  /** Public token used in the homeowner-facing /inspect/:token URL. */
  clientAccessToken?: string;
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
  /** Cached DIY analysis (null until the homeowner taps "Try DIY" once). */
  diyAnalysis?: import('@homie/shared').DIYAnalysisPayload | null;
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

  /** Upload-and-pay: POSTs the report metadata + base64 PDF and gets
   *  back a Stripe Checkout Session URL. The caller redirects to that
   *  URL; on Stripe success the inspector lands back on
   *  /inspector/reports/:id?paid=1 where parsing is already kicking
   *  off (the webhook fires the parser, not the upload handler).
   *
   *  pricing_tier (essential | professional | premium) is required —
   *  it controls both the wholesale fee charged at checkout and which
   *  features the homeowner can access in their portal. */
  createReport(payload: {
    property_address: string;
    property_city: string;
    property_state: string;
    property_zip: string;
    client_name: string;
    client_email: string;
    client_phone?: string;
    inspection_date: string;
    inspection_type?: string;
    report_file_data_url: string;
    pricing_tier: 'essential' | 'professional' | 'premium';
  }) {
    return inspectorFetch<{
      reportId: string;
      checkoutUrl: string;
      priceCents: number;
      tier: 'essential' | 'professional' | 'premium';
      retailPriceCents: number;
    }>(
      '/api/v1/inspector/reports',
      { method: 'POST', body: JSON.stringify(payload) },
    );
  },

  /** Send a free copy of an already-parsed report to an extra
   *  recipient (spouse, agent, attorney). No charge; doesn't affect
   *  the homeowner-tracking columns. */
  sendCopyOfReport(reportId: string, payload: { email: string; name?: string }) {
    return inspectorFetch<{ sent: boolean; email: string }>(
      `/api/v1/inspector/reports/${reportId}/send-copy`,
      { method: 'POST', body: JSON.stringify(payload) },
    );
  },

  listReports(status?: string) {
    const query = status && status !== 'all' ? `?status=${status}` : '';
    return inspectorFetch<InspectionReport[]>(`/api/v1/inspector/reports${query}`);
  },

  getReport(id: string) {
    return inspectorFetch<InspectionReport>(`/api/v1/inspector/reports/${id}`);
  },

  sendToClient(reportId: string, opts?: { client_name?: string; client_email?: string; cc_emails?: string[] }) {
    return inspectorFetch<{ sent: boolean; clientAccessUrl: string; recipients: Array<{ to: string; ok: boolean }> }>(
      `/api/v1/inspector/reports/${reportId}/send-to-client`,
      { method: 'POST', body: JSON.stringify(opts ?? {}) },
    );
  },

  /** Manually nudge a sent-but-unopened report. Updates
   *  homeownerReminderSentAt and suppresses the auto-sweep for the
   *  same window. */
  sendReminder(reportId: string) {
    return inspectorFetch<{ sent: boolean }>(
      `/api/v1/inspector/reports/${reportId}/send-reminder`,
      { method: 'POST' },
    );
  },

  /** Retry parsing for a report stuck in `failed`. Calls the admin
   *  retry endpoint scoped to this inspector's own report. */
  retryParse(reportId: string) {
    return inspectorFetch<{ retrying: boolean }>(
      `/api/v1/inspector/reports/${reportId}/retry-parse`,
      { method: 'POST' },
    );
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

  /** Magic-link claim: emails a one-time link to unlock + claim the report */
  requestClaimLink(email: string, clientAccessToken: string) {
    return fetchAPI<{ sent: boolean }>(
      '/api/v1/inspect/claim/request',
      { method: 'POST', body: JSON.stringify({ email, clientAccessToken }) },
    );
  },

  /** Logged-in claim shortcut — links the report to the current homeowner without an email round-trip */
  claimNow(clientAccessToken: string) {
    return fetchAPI<{ reportId: string; alreadyClaimed: boolean; ownedByYou: boolean }>(
      '/api/v1/inspect/claim/now',
      { method: 'POST', body: JSON.stringify({ clientAccessToken }) },
    );
  },

  /** Magic-link claim: exchanges a claim token for an auth JWT + linked report */
  verifyClaim(claimToken: string) {
    return fetchAPI<{
      token: string;
      homeowner: { id: string; first_name: string | null; last_name: string | null; email: string; zip_code: string; membership_tier: string };
      reportId: string | null;
    }>(
      '/api/v1/inspect/claim/verify',
      { method: 'POST', body: JSON.stringify({ claimToken }) },
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

  /** Authenticated: fetch the Home IQ payload for a report. First call
   *  triggers generation (per-category Claude assessments + hazard
   *  lookups) and may take 5–10s; cached calls return instantly. Pass
   *  `refresh: true` to force regeneration after the homeowner edits
   *  items. */
  getHomeIQ(reportId: string, opts: { refresh?: boolean } = {}) {
    const qs = opts.refresh ? '?refresh=1' : '';
    return fetchAPI<HomeIQData>(`/api/v1/account/reports/${reportId}/home-iq${qs}`);
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

  uploadSupportingDocument(reportId: string, params: { documentType: SupportingDocumentType; fileName: string; fileDataUrl: string }) {
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

  /**
   * Authenticated: lazy + cached DIY analysis for a single inspection item.
   * Returns the same DIYAnalysisPayload shape the quote-chat panel uses.
   * Server caches the result on inspection_report_items.diy_analysis so
   * subsequent calls are instant.
   */
  analyzeItemDiy(reportId: string, itemId: string) {
    return fetchAPI<import('@homie/shared').DIYAnalysisPayload>(
      `/api/v1/account/reports/${reportId}/items/${itemId}/diy`,
      { method: 'POST' },
    );
  },

  /**
   * Authenticated: set or clear the friendly nickname for a report.
   * Pass `null` (or an empty string) to clear it — UI falls back to address.
   */
  renameReport(reportId: string, displayName: string | null) {
    return fetchAPI<{ id: string; displayName: string | null }>(
      `/api/v1/account/reports/${reportId}/rename`,
      { method: 'PATCH', body: JSON.stringify({ display_name: displayName }) },
    );
  },

  /** Authenticated: accept a quote for an inspection item */
  bookQuote(reportId: string, itemId: string, providerId: string) {
    return fetchAPI<{ bookingId: string; status: string; providerName: string; providerPhone: string; quotedPrice: string | null; scheduled: string | null }>(
      `/api/v1/account/reports/${reportId}/items/${itemId}/book`,
      { method: 'POST', body: JSON.stringify({ provider_id: providerId }) },
    );
  },

  /**
   * Authenticated: list all of the homeowner's bookings (consumer + inspect).
   * The Inspect-portal Bookings tab filters this list to entries where
   * `source === 'inspection_report'`.
   */
  listBookings() {
    return fetchAPI<{ bookings: HomeownerBooking[] }>(`/api/v1/account/bookings`);
  },
};

export interface HomeownerBooking {
  id: string;
  job_id: string;
  provider: {
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
    rating: string | null;
    review_count: number;
  };
  status: string;
  confirmed_at: string;
  completed_at: string | null;
  quoted_price: string | null;
  scheduled: string | null;
  response_message: string | null;
  response_channel: string | null;
  job_category: string | null;
  job_severity: string | null;
  job_summary: string | null;
  /** 'inspection_report' for inspect-derived bookings, null/undefined for consumer /quote bookings */
  source: string | null;
  inspection_report_id: string | null;
  service_address: string | null;
  zip_code: string | null;
  preferred_timing: string | null;
  unread_messages: number;
}

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
  /** Cached DIY analysis (null until the homeowner taps "Try DIY" once). */
  diyAnalysis?: import('@homie/shared').DIYAnalysisPayload | null;
}

// ── Home IQ types ────────────────────────────────────────────────────────
// Mirror the shape returned by GET /api/v1/account/reports/:id/home-iq.

export type HomeIQGrade = 'Excellent' | 'Good' | 'Fair' | 'Poor' | 'Critical';
export type HomeIQSystemKey = 'plumbing' | 'roofing' | 'hvac' | 'electrical' | 'structural' | 'appliance' | 'foundation';
export type HomeIQInsightType = 'insurance' | 'lifespan' | 'cross-doc' | 'bundle' | 'cohort' | 'hazard' | 'recall';

export interface HomeIQSystemBreakdown {
  key: HomeIQSystemKey;
  label: string;
  itemCount: number;
  costLowCents: number;
  costHighCents: number;
  severityCounts: { urgent: number; recommended: number; monitor: number };
  grade: HomeIQGrade;
  aiAssessmentShort: string;
  aiAssessmentLong: string;
  topFix: { title: string; cost: string; rationale: string } | null;
  smartInsight: { type: HomeIQInsightType; label: string; text: string };
  items: Array<{
    id: string;
    title: string;
    severity: string;
    location: string | null;
    description: string | null;
    costLowCents: number;
    costHighCents: number;
  }>;
  lifespan: {
    componentLabel: string;
    age: number;
    typicalLow: number;
    typicalHigh: number;
    statusLabel: string;
    statusColor: 'green' | 'amber' | 'red';
  } | null;
}

export interface HomeIQHazardCard {
  primary: string;
  sub: string;
  level: 'low' | 'moderate' | 'high';
  source: string;
  detail: string;
}

export interface HomeIQData {
  generatedAt: string;
  property: {
    yearBuilt: number | null;
    sqft: number | null;
    region: string | null;
    decade: string | null;
    decadeLabel: string | null;
    zip: string;
    address: string;
    city: string;
    state: string;
  };
  cohort: {
    medianSqft: number;
    avgItemsFound: number;
    sqftDelta: number | null;
    itemsDelta: number;
    sourceNote: string;
  } | null;
  systems: HomeIQSystemBreakdown[];
  hazards: {
    flood: HomeIQHazardCard | null;
    radon: HomeIQHazardCard | null;
  };
  warnings: string[];
}

export interface PortalReport {
  id: string;
  propertyAddress: string;
  propertyCity: string;
  propertyState: string;
  propertyZip: string;
  /** Optional homeowner-chosen nickname. UI falls back to propertyAddress when null. */
  displayName: string | null;
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

/** Backend-supported document types for the supporting-docs upload flow. */
export type SupportingDocumentType =
  | 'pest_report'
  | 'seller_disclosure'
  | 'sewer_scope'
  | 'roof_inspection'
  | 'foundation_report'
  | 'hvac_inspection'
  | 'electrical_inspection'
  | 'septic_inspection'
  | 'mold_inspection'
  | 'pool_inspection'
  | 'chimney_inspection';

export interface SupportingDocument {
  id: string;
  reportId: string;
  documentType: SupportingDocumentType;
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
