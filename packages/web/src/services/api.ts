// ── Shared types ────────────────────────────────────────────────────────────

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';
const TOKEN_KEY = 'homie_token';

export interface ApiResponse<T> {
  data: T | null;
  error: string | null;
  meta: Record<string, unknown>;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public body: ApiResponse<null>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// ── Auth helpers ────────────────────────────────────────────────────────────

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

// ── Base fetch ──────────────────────────────────────────────────────────────

function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function fetchAPI<T>(
  path: string,
  options: RequestInit = {},
): Promise<ApiResponse<T>> {
  const url = `${API_BASE}${path}`;

  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
      ...(options.headers as Record<string, string> | undefined),
    },
  });

  const body = (await res.json()) as ApiResponse<T>;

  if (!res.ok) {
    throw new ApiError(
      body.error ?? `Request failed with status ${res.status}`,
      res.status,
      body as ApiResponse<null>,
    );
  }

  return body;
}

// ── Domain types ────────────────────────────────────────────────────────────

// Diagnosis

export interface DiagnosisPayload {
  category: string;
  severity: 'low' | 'medium' | 'high' | 'emergency';
  summary: string;
  recommendedActions: string[];
  estimatedCost?: { min: number; max: number };
}

export interface DiagnosticStreamCallbacks {
  onToken: (text: string) => void;
  onDiagnosis: (diagnosis: DiagnosisPayload) => void;
  onJobSummary: (summary: JobSummary) => void;
  onDone: () => void;
  onError: (error: Error) => void;
}

export interface JobSummary {
  title: string;
  category: string;
  severity: string;
  estimatedCost: { min: number; max: number };
}

// Jobs

export type JobTier = 'standard' | 'priority' | 'emergency';
export type JobTiming = 'asap' | 'this_week' | 'this_month' | 'flexible';
export type JobStatus = 'created' | 'dispatching' | 'collecting' | 'completed' | 'expired' | 'refunded';

export interface ChannelStats {
  attempted: number;
  connected: number;
}

export interface CreateJobResponse {
  id: string;
  status: JobStatus;
  tier: string;
  expires_at: string;
  providers_contacted: number;
  estimated_results_at: string;
}

export interface JobStatusResponse {
  id: string;
  status: string;
  tier: string;
  providers_contacted: number;
  providers_responded: number;
  providers_accepted: number;
  outreach_channels: {
    voice: ChannelStats;
    sms: ChannelStats;
    web: ChannelStats;
  };
  expires_at: string | null;
  created_at: string;
}

export interface ProviderSummary {
  id: string;
  name: string;
  phone: string | null;
  google_rating: string | null;
  review_count: number;
  categories: string[] | null;
}

export interface ProviderResponseItem {
  id: string;
  provider: ProviderSummary;
  channel: string;
  quoted_price: string | null;
  availability: string | null;
  message: string | null;
  responded_at: string;
}

export interface JobResponsesResponse {
  responses: ProviderResponseItem[];
  pending_count: number;
  more_expected: boolean;
}

export interface BookJobResponse {
  booking_id: string;
  status: string;
  provider: {
    name: string;
    phone: string | null;
  };
  scheduled: string | null;
  quoted_price: string | null;
}

// Payments

export interface ChargeResponse {
  payment_id: string;
  status: 'succeeded' | 'failed';
  amount: number;
  tier: JobTier;
}

// WebSocket events

export type JobSocketEvent =
  | { type: 'outreach.started'; data: { provider_id: string; channel: string } }
  | { type: 'outreach.response'; data: { provider_id: string; channel: string; accepted: boolean } }
  | { type: 'outreach.voicemail'; data: { provider_id: string } }
  | { type: 'job.threshold_met'; data: { providers_accepted: number } }
  | { type: 'job.expired'; data: { job_id: string } }
  | { type: 'job.completed'; data: { job_id: string } };

// ── diagnosticService ───────────────────────────────────────────────────────

export const diagnosticService = {
  /**
   * Sends a chat message and opens an SSE stream for the assistant response.
   * Parses <diagnosis> and <job_summary> XML tags from the streamed text.
   * Returns an AbortController so the caller can cancel the stream.
   */
  sendMessage(
    sessionId: string,
    message: string,
    callbacks: DiagnosticStreamCallbacks,
    images?: string[],
    history?: { role: 'user' | 'assistant'; content: string }[],
  ): AbortController {
    const controller = new AbortController();

    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/v1/diagnostic/chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...authHeaders(),
          },
          body: JSON.stringify({
            session_id: sessionId,
            message,
            ...(images && images.length > 0 ? { images } : {}),
            ...(history && history.length > 0 ? { history } : {}),
          }),
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

        // Tag filtering state — suppress <diagnosis>...</diagnosis> and <job_summary>...</job_summary> from visible output
        let insideTag = false;
        let tagBuffer = '';
        const TAG_OPEN_RE = /^<(diagnosis|job_summary)>/;
        const TAG_CLOSE_RE = /<\/(diagnosis|job_summary)>/;

        function processToken(token: string) {
          // Character-by-character filtering to handle tags split across tokens
          for (const ch of token) {
            if (insideTag) {
              tagBuffer += ch;
              // Check if we've closed the tag
              if (TAG_CLOSE_RE.test(tagBuffer)) {
                // Parse the completed tag
                parseStructuredTags(tagBuffer, callbacks);
                insideTag = false;
                tagBuffer = '';
              }
              continue;
            }

            // Detect tag opening — buffer '<' and check subsequent chars
            if (ch === '<') {
              tagBuffer = '<';
              continue;
            }

            if (tagBuffer.length > 0) {
              tagBuffer += ch;
              // Once we have enough chars, check if it's a known tag
              if (ch === '>') {
                if (TAG_OPEN_RE.test(tagBuffer)) {
                  // Entering a structured tag — suppress from visible output
                  insideTag = true;
                } else {
                  // Not a known tag — flush the buffered text as visible
                  callbacks.onToken(tagBuffer);
                  tagBuffer = '';
                }
              }
              // If buffer gets too long without closing '>', it's not a tag
              if (tagBuffer.length > 15 && !tagBuffer.includes('>')) {
                callbacks.onToken(tagBuffer);
                tagBuffer = '';
              }
              continue;
            }

            callbacks.onToken(ch);
          }
        }

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
              // Flush any remaining tag buffer as visible text if we never closed a tag
              if (tagBuffer && !insideTag) {
                callbacks.onToken(tagBuffer);
              }
              callbacks.onDone();
              return;
            }

            try {
              const parsed = JSON.parse(payload) as { token?: string; error?: string };
              if (parsed.error) {
                callbacks.onError(new Error(parsed.error));
                return;
              }
              if (parsed.token) {
                processToken(parsed.token);
              }
            } catch {
              processToken(payload);
            }
          }
        }

        // Stream ended without [DONE]
        if (tagBuffer && !insideTag) {
          callbacks.onToken(tagBuffer);
        }
        callbacks.onDone();
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          callbacks.onError(err instanceof Error ? err : new Error(String(err)));
        }
      }
    })();

    return controller;
  },
};

/** Extracts <diagnosis> and <job_summary> JSON blocks from streamed text. */
function parseStructuredTags(
  text: string,
  callbacks: Pick<DiagnosticStreamCallbacks, 'onDiagnosis' | 'onJobSummary'>,
): void {
  const diagMatch = text.match(/<diagnosis>([\s\S]*?)<\/diagnosis>/);
  if (diagMatch) {
    try {
      callbacks.onDiagnosis(JSON.parse(diagMatch[1]) as DiagnosisPayload);
    } catch { /* malformed JSON — skip */ }
  }

  const summaryMatch = text.match(/<job_summary>([\s\S]*?)<\/job_summary>/);
  if (summaryMatch) {
    try {
      callbacks.onJobSummary(JSON.parse(summaryMatch[1]) as JobSummary);
    } catch { /* malformed JSON — skip */ }
  }
}

// ── authService ─────────────────────────────────────────────────────────────

export interface AuthHomeowner {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  zip_code: string;
  membership_tier: string;
}

export interface AuthResponse {
  token: string;
  homeowner: AuthHomeowner;
}

export const authService = {
  async register(params: {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
    zipCode: string;
    phone?: string;
    smsOptIn?: boolean;
  }): Promise<ApiResponse<AuthResponse>> {
    const res = await fetchAPI<AuthResponse>('/api/v1/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        first_name: params.firstName,
        last_name: params.lastName,
        email: params.email,
        password: params.password,
        zip_code: params.zipCode,
        ...(params.phone ? { phone: params.phone } : {}),
        sms_opt_in: params.smsOptIn ?? false,
      }),
    });
    if (res.data) setToken(res.data.token);
    return res;
  },

  async login(email: string, password: string): Promise<ApiResponse<AuthResponse>> {
    const res = await fetchAPI<AuthResponse>('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    if (res.data) setToken(res.data.token);
    return res;
  },

  logout(): void {
    clearToken();
  },

  isAuthenticated(): boolean {
    return getToken() !== null;
  },
};

// ── jobService ──────────────────────────────────────────────────────────────

export const jobService = {
  async createJob(params: {
    diagnosis: DiagnosisPayload;
    photos?: string[];
    timing: JobTiming;
    budget: string;
    tier: JobTier;
    zipCode: string;
    workspaceId?: string;
    propertyId?: string;
  }): Promise<ApiResponse<CreateJobResponse>> {
    return fetchAPI<CreateJobResponse>('/api/v1/jobs', {
      method: 'POST',
      body: JSON.stringify({
        diagnosis: params.diagnosis,
        photo_urls: params.photos,
        timing: params.timing,
        budget: params.budget,
        tier: params.tier,
        zip_code: params.zipCode,
        consent: true,
        ...(params.workspaceId ? { workspace_id: params.workspaceId } : {}),
        ...(params.propertyId ? { property_id: params.propertyId } : {}),
      }),
    });
  },

  async getJob(jobId: string): Promise<ApiResponse<JobStatusResponse>> {
    return fetchAPI<JobStatusResponse>(`/api/v1/jobs/${jobId}`);
  },

  async getResponses(jobId: string): Promise<ApiResponse<JobResponsesResponse>> {
    return fetchAPI<JobResponsesResponse>(`/api/v1/jobs/${jobId}/responses`);
  },

  async bookProvider(
    jobId: string,
    responseId: string,
    providerId: string,
    serviceAddress?: string,
  ): Promise<ApiResponse<BookJobResponse>> {
    return fetchAPI<BookJobResponse>(`/api/v1/jobs/${jobId}/book`, {
      method: 'POST',
      body: JSON.stringify({
        response_id: responseId,
        provider_id: providerId,
        ...(serviceAddress ? { service_address: serviceAddress } : {}),
      }),
    });
  },
};

// ── paymentService ──────────────────────────────────────────────────────────

export const paymentService = {
  async createCheckout(
    jobId: string,
    responseId: string,
    providerId: string,
    returnPath?: string,
  ): Promise<ApiResponse<{ checkout_url: string }>> {
    return fetchAPI<{ checkout_url: string }>('/api/v1/payments/checkout', {
      method: 'POST',
      body: JSON.stringify({
        job_id: jobId,
        response_id: responseId,
        provider_id: providerId,
        ...(returnPath ? { return_path: returnPath } : {}),
      }),
    });
  },

  async getPaymentStatus(jobId: string): Promise<ApiResponse<{ payment_status: string; job_status: string }>> {
    return fetchAPI<{ payment_status: string; job_status: string }>(`/api/v1/payments/status/${jobId}`);
  },
};

// ── WebSocket ───────────────────────────────────────────────────────────────

export interface JobSocket {
  socket: WebSocket;
  close: () => void;
}

/**
 * Opens a WebSocket to receive real-time job updates.
 * Automatically reconnects on unexpected close (up to 5 attempts).
 */
export function connectJobSocket(
  jobId: string,
  onStatus: (status: JobStatusResponse) => void,
  onStatusChange?: (connected: boolean) => void,
): JobSocket {
  const wsBase = API_BASE.replace(/^http/, 'ws');
  const token = getToken();
  const url = `${wsBase}/ws/jobs/${jobId}${token ? `?token=${encodeURIComponent(token)}` : ''}`;

  let ws: WebSocket;
  let attempt = 0;
  let closed = false;
  const MAX_RECONNECTS = 5;

  function connect() {
    ws = new WebSocket(url);

    ws.addEventListener('open', () => {
      attempt = 0;
      onStatusChange?.(true);
    });

    ws.addEventListener('message', (e) => {
      try {
        const status = JSON.parse(e.data as string) as JobStatusResponse;
        onStatus(status);
      } catch { /* ignore malformed frames */ }
    });

    ws.addEventListener('close', () => {
      onStatusChange?.(false);
      if (!closed && attempt < MAX_RECONNECTS) {
        attempt++;
        const delay = Math.min(1000 * 2 ** attempt, 16_000);
        setTimeout(connect, delay);
      }
    });

    ws.addEventListener('error', () => {
      // Error fires before close — close handler will reconnect
    });
  }

  connect();

  return {
    get socket() {
      return ws;
    },
    close() {
      closed = true;
      ws.close();
    },
  };
}

// ── accountService ─────────────────────────────────────────────────────────

export interface AccountProfile {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  phone: string | null;
  zip_code: string;
  membership_tier: string;
  created_at: string;
}

export interface AccountJob {
  id: string;
  status: string;
  payment_status: string;
  tier: string;
  zip_code: string;
  budget: string | null;
  preferred_timing: string | null;
  diagnosis: DiagnosisPayload | null;
  created_at: string;
  expires_at: string | null;
}

export interface AccountBooking {
  id: string;
  job_id: string;
  provider: { id: string; name: string; phone: string | null };
  status: string;
  confirmed_at: string;
  quoted_price: string | null;
  scheduled: string | null;
}

// ── Tracking ────────────────────────────────────────────────────────────────

export interface TrackingStatus {
  property_name: string;
  job_title: string;
  job_category: string;
  severity: string;
  status: string;
  timeline: Array<{
    event_type: string;
    title: string;
    description: string | null;
    metadata: Record<string, unknown> | null;
    created_at: string;
  }>;
  provider: { name: string; rating: string | null; reviewCount?: number } | null;
  last_updated: string;
  brand_logo_url?: string | null;
  expired?: boolean;
}

export const trackingService = {
  getStatus: (token: string) =>
    fetchAPI<TrackingStatus>('/api/v1/tracking/' + token),
  createLink: (
    jobId: string,
    data: { notify_phone?: string; notify_email?: string; property_name?: string },
  ) =>
    fetchAPI<{
      tracking_token: string;
      tracking_url: string;
      notify_phone: string | null;
      notify_email: string | null;
    }>('/api/v1/jobs/' + jobId + '/tracking', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};

// ── accountService ─────────────────────────────────────────────────────────

export const accountService = {
  getProfile: () => fetchAPI<AccountProfile>('/api/v1/account'),
  updateProfile: (data: Partial<{ email: string; phone: string; zip_code: string; current_password: string; new_password: string }>) =>
    fetchAPI<AccountProfile>('/api/v1/account', { method: 'PATCH', body: JSON.stringify(data) }),
  getJobs: () => fetchAPI<{ jobs: AccountJob[] }>('/api/v1/account/jobs'),
  getBookings: () => fetchAPI<{ bookings: AccountBooking[] }>('/api/v1/account/bookings'),
};

// ── businessService ─────────────────────────────────────────────────────────

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  plan: string;
  role: string;
  logoUrl: string | null;
  createdAt: string;
}

export interface WorkspaceDetail extends Workspace {
  member_count: number;
  property_count: number;
  user_role: string;
  ownerId: string;
  stripeCustomerId: string | null;
  companyAddress: string | null;
  companyPhone: string | null;
  companyEmail: string | null;
  slackChannelId: string | null;
  slackTeamId: string | null;
  updatedAt: string;
}

export interface BedConfig {
  type: string;
  count: number;
}

export interface PropertyDetails {
  hvac?: {
    acType?: string; acBrand?: string; acModel?: string; acAge?: string;
    heatingType?: string; heatingBrand?: string; heatingModel?: string;
    thermostatBrand?: string; thermostatModel?: string;
    filterSize?: string;
  };
  waterHeater?: {
    type?: string; brand?: string; model?: string; age?: string;
    fuel?: string; capacity?: string; location?: string;
  };
  appliances?: {
    refrigerator?: { brand?: string; model?: string };
    washer?: { brand?: string; model?: string };
    dryer?: { brand?: string; model?: string; fuel?: string };
    dishwasher?: { brand?: string; model?: string };
    oven?: { brand?: string; model?: string; fuel?: string };
    disposal?: { brand?: string };
    microwave?: { brand?: string; type?: string };
  };
  plumbing?: {
    kitchenFaucetBrand?: string; bathroomFaucetBrand?: string;
    toiletBrand?: string; waterSoftener?: string;
    septicOrSewer?: string; mainShutoffLocation?: string;
  };
  electrical?: {
    breakerBoxLocation?: string; panelAmperage?: string;
    hasGenerator?: boolean; generatorType?: string;
    hasSolar?: boolean; solarSystem?: string;
    hasEvCharger?: boolean; evChargerBrand?: string;
  };
  poolSpa?: {
    poolType?: string; poolHeaterBrand?: string; poolPumpBrand?: string;
    hotTubBrand?: string; hotTubModel?: string;
  };
  exterior?: {
    roofType?: string; roofAge?: string; sidingMaterial?: string;
    fenceMaterial?: string; garageDoorBrand?: string;
    irrigationBrand?: string;
  };
  access?: {
    lockboxCode?: string; gateCode?: string;
    alarmBrand?: string; alarmCode?: string;
    wifiNetwork?: string; wifiPassword?: string;
  };
  general?: {
    yearBuilt?: string; hasHoa?: boolean; hoaContact?: string;
    pestControlProvider?: string; pestControlFrequency?: string;
    cleaningNotes?: string;
  };
}

export interface Property {
  id: string;
  workspaceId: string;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  propertyType: string;
  unitCount: number;
  bedrooms: number | null;
  bathrooms: string | null;
  sqft: number | null;
  beds: BedConfig[] | null;
  details: PropertyDetails | null;
  photoUrls: string[] | null;
  notes: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceMember {
  id: string;
  role: string;
  homeownerId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  invitedAt: string;
  acceptedAt: string | null;
}

export interface WorkspaceDispatch {
  id: string;
  status: string;
  paymentStatus: string;
  tier: string;
  zipCode: string;
  diagnosis: DiagnosisPayload | null;
  preferredTiming: string | null;
  propertyId: string | null;
  propertyName: string | null;
  responseCount: number;
  createdAt: string;
  expiresAt: string | null;
}

export interface WorkspaceBooking {
  id: string;
  status: string;
  serviceAddress: string | null;
  confirmedAt: string;
  jobId: string;
  providerId: string;
  providerName: string;
  providerPhone: string | null;
  providerEmail: string | null;
  providerRating: string | null;
  providerReviewCount: number;
  diagnosis: DiagnosisPayload | null;
  zipCode: string;
  preferredTiming: string | null;
  propertyId: string | null;
  propertyName: string | null;
  jobCreatedAt: string;
  quotedPrice: string | null;
  availability: string | null;
}

export interface VendorSchedule {
  [day: string]: { start: string; end: string } | null;
}

export interface PreferredVendor {
  id: string;
  providerId: string;
  propertyId: string | null;
  categories: string[] | null;
  priority: number;
  notes: string | null;
  availabilitySchedule: VendorSchedule | null;
  active: boolean;
  createdAt: string;
  providerName: string;
  providerPhone: string | null;
  providerEmail: string | null;
  providerRating: string | null;
  providerReviewCount: number;
}

export interface ProviderSearchResult {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  googleRating: string | null;
  reviewCount: number;
  categories: string[] | null;
}

export interface DashboardData {
  active_dispatches: number;
  completed_this_month: number;
  total_bookings: number;
  avg_response_minutes: number | null;
  dispatches_this_month: number;
  dispatches_last_month: number;
  bookings_this_month: number;
  bookings_last_month: number;
  recent_activity: Array<{ type: string; title: string; property_name: string | null; provider_name: string | null; job_id: string; created_at: string }>;
  top_vendors: Array<{ name: string; booking_count: number; avg_rating: string | null }>;
  dispatches_by_category: Array<{ category: string; count: number }>;
}

export interface SeasonalSuggestion {
  title: string;
  description: string;
  category: string;
  priority: string;
  properties: string[];
  reason: string;
}

export const businessChatService = {
  sendMessage(
    message: string,
    mode: 'repair' | 'service',
    callbacks: DiagnosticStreamCallbacks,
    options?: {
      history?: { role: 'user' | 'assistant'; content: string }[];
      images?: string[];
      propertyContext?: string;
    },
  ): AbortController {
    const controller = new AbortController();

    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/v1/business-chat/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify({
            message,
            mode,
            ...(options?.history?.length ? { history: options.history } : {}),
            ...(options?.images?.length ? { images: options.images } : {}),
            ...(options?.propertyContext ? { property_context: options.propertyContext } : {}),
          }),
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
            if (payload === '[DONE]') { callbacks.onDone(); return; }
            try {
              const parsed = JSON.parse(payload) as { token?: string; error?: string };
              if (parsed.error) { callbacks.onError(new Error(parsed.error)); return; }
              if (parsed.token) callbacks.onToken(parsed.token);
            } catch { callbacks.onToken(payload); }
          }
        }
        callbacks.onDone();
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          callbacks.onError(err instanceof Error ? err : new Error(String(err)));
        }
      }
    })();

    return controller;
  },
};

export const businessService = {
  // Workspaces
  listWorkspaces: () => fetchAPI<Workspace[]>('/api/v1/business'),
  getWorkspace: (id: string) => fetchAPI<WorkspaceDetail>(`/api/v1/business/${id}`),
  createWorkspace: (data: { name: string; slug?: string }) =>
    fetchAPI<Workspace>('/api/v1/business', { method: 'POST', body: JSON.stringify(data) }),
  updateWorkspace: (id: string, data: { name?: string; slug?: string; company_address?: string | null; company_phone?: string | null; company_email?: string | null }) =>
    fetchAPI<Workspace>(`/api/v1/business/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  // Properties
  listProperties: (workspaceId: string) =>
    fetchAPI<Property[]>(`/api/v1/business/${workspaceId}/properties`),
  getProperty: (workspaceId: string, propertyId: string) =>
    fetchAPI<Property>(`/api/v1/business/${workspaceId}/properties/${propertyId}`),
  createProperty: (workspaceId: string, data: {
    name: string; address?: string; city?: string; state?: string;
    zip_code?: string; property_type?: string; unit_count?: number; notes?: string;
  }) => fetchAPI<Property>(`/api/v1/business/${workspaceId}/properties`, {
    method: 'POST', body: JSON.stringify(data),
  }),
  updateProperty: (workspaceId: string, propertyId: string, data: Record<string, unknown>) =>
    fetchAPI<Property>(`/api/v1/business/${workspaceId}/properties/${propertyId}`, {
      method: 'PATCH', body: JSON.stringify(data),
    }),
  deleteProperty: (workspaceId: string, propertyId: string) =>
    fetchAPI<{ deactivated: boolean }>(`/api/v1/business/${workspaceId}/properties/${propertyId}`, {
      method: 'DELETE',
    }),

  // Track PMS Import
  importFromTrack: (workspaceId: string, data: { track_domain: string; api_key: string; api_secret: string; update_existing?: boolean }) =>
    fetchAPI<{ imported: number; updated: number; skipped: number; total: number }>(`/api/v1/business/${workspaceId}/import/track`, {
      method: 'POST', body: JSON.stringify(data),
    }),

  // Members
  listMembers: (workspaceId: string) =>
    fetchAPI<WorkspaceMember[]>(`/api/v1/business/${workspaceId}/members`),
  inviteMember: (workspaceId: string, data: { email: string; role?: string }) =>
    fetchAPI<WorkspaceMember>(`/api/v1/business/${workspaceId}/members`, {
      method: 'POST', body: JSON.stringify(data),
    }),
  updateMemberRole: (workspaceId: string, memberId: string, role: string) =>
    fetchAPI<WorkspaceMember>(`/api/v1/business/${workspaceId}/members/${memberId}`, {
      method: 'PATCH', body: JSON.stringify({ role }),
    }),
  removeMember: (workspaceId: string, memberId: string) =>
    fetchAPI<{ removed: boolean }>(`/api/v1/business/${workspaceId}/members/${memberId}`, {
      method: 'DELETE',
    }),

  // Preferred Vendors
  listVendors: (workspaceId: string) =>
    fetchAPI<PreferredVendor[]>(`/api/v1/business/${workspaceId}/vendors`),
  searchProviders: (workspaceId: string, q: string) =>
    fetchAPI<ProviderSearchResult[]>(`/api/v1/business/${workspaceId}/vendors/search?q=${encodeURIComponent(q)}`),
  addVendor: (workspaceId: string, data: {
    provider_id: string; property_id?: string | null; categories?: string[];
    priority?: number; notes?: string; availability_schedule?: VendorSchedule | null;
  }) => fetchAPI<PreferredVendor>(`/api/v1/business/${workspaceId}/vendors`, {
    method: 'POST', body: JSON.stringify(data),
  }),
  createVendor: (workspaceId: string, data: {
    name: string; phone?: string; email?: string; categories?: string[];
    priority?: number; notes?: string; property_id?: string | null;
  }) => fetchAPI<PreferredVendor>(`/api/v1/business/${workspaceId}/vendors/create`, {
    method: 'POST', body: JSON.stringify(data),
  }),
  updateVendor: (workspaceId: string, vendorId: string, data: Record<string, unknown>) =>
    fetchAPI<PreferredVendor>(`/api/v1/business/${workspaceId}/vendors/${vendorId}`, {
      method: 'PATCH', body: JSON.stringify(data),
    }),
  removeVendor: (workspaceId: string, vendorId: string) =>
    fetchAPI<{ removed: boolean }>(`/api/v1/business/${workspaceId}/vendors/${vendorId}`, {
      method: 'DELETE',
    }),

  // Reports
  getCostReport: (workspaceId: string) =>
    fetchAPI<{
      total_cost: number;
      total_bookings: number;
      avg_cost: number;
      by_property: Array<{ id: string; name: string; cost: number; count: number }>;
      by_category: Array<{ category: string; cost: number; count: number }>;
      by_vendor: Array<{ id: string; name: string; cost: number; count: number }>;
      by_month: Array<{ month: string; cost: number; count: number }>;
      line_items: Array<{ jobId: string; propertyName: string; category: string; providerName: string; quotedPrice: string | null; cost: number; confirmedAt: string }>;
    }>(`/api/v1/business/${workspaceId}/reports/costs`),

  // Vendor scorecards
  getVendorScorecards: (workspaceId: string) =>
    fetchAPI<{
      vendors: Array<{
        id: string; name: string; phone: string | null;
        google_rating: string | null; review_count: number; categories: string[] | null;
        total_outreach: number; response_rate: number; acceptance_rate: number;
        avg_response_sec: number | null; avg_quote: number | null;
        total_bookings: number; booking_rate: number;
        overall_score: number; grade: string; badges: string[];
      }>;
    }>(`/api/v1/business/${workspaceId}/reports/vendors`),

  // Usage
  getUsage: (workspaceId: string) =>
    fetchAPI<{
      plan: string;
      searches_used: number;
      searches_limit: number;
      searches_remaining: number;
      base_price: number;
      per_property_price: number;
      searches_per_property: number;
      max_properties: number;
      property_count: number;
      billing_cycle_start: string;
      billing_cycle_end: string;
    }>(`/api/v1/business/${workspaceId}/usage`),

  // Dispatches
  listDispatches: (workspaceId: string) =>
    fetchAPI<WorkspaceDispatch[]>(`/api/v1/business/${workspaceId}/dispatches`),
  cancelDispatch: (workspaceId: string, jobId: string) =>
    fetchAPI<{ cancelled: boolean; credit_refunded: boolean; providers_notified: number }>(
      `/api/v1/business/${workspaceId}/dispatches/${jobId}/cancel`, { method: 'POST' }),

  // Bookings
  listBookings: (workspaceId: string) =>
    fetchAPI<{ bookings: WorkspaceBooking[] }>(`/api/v1/business/${workspaceId}/bookings`),
  cancelBooking: (workspaceId: string, bookingId: string) =>
    fetchAPI<{ cancelled: boolean; provider_notified: string }>(`/api/v1/business/${workspaceId}/bookings/${bookingId}/cancel`, { method: 'POST' }),

  // Dashboard
  getDashboard: (workspaceId: string) => fetchAPI<DashboardData>(`/api/v1/business/${workspaceId}/dashboard`),
  getSeasonalSuggestions: (workspaceId: string) => fetchAPI<SeasonalSuggestion[]>(`/api/v1/business/${workspaceId}/dashboard/seasonal-suggestions`, { method: 'POST' }),
};

// ── Slack Integration ───────────────────────────────────────────────────────

export interface SlackSettings {
  connected: boolean;
  slackTeamName?: string;
  slackChannelName?: string;
  slackChannelId?: string;
  notifyDispatchCreated: boolean;
  notifyProviderResponse: boolean;
  notifyBookingConfirmed: boolean;
  notifyApprovalNeeded: boolean;
  notifyJobCompleted: boolean;
  notifyOutreachFailed: boolean;
  notifyDailyDigest: boolean;
  approvalThresholdCents: number;
  digestTime: string;
}

export const slackService = {
  getSettings: (workspaceId: string) =>
    fetchAPI<SlackSettings>('/api/v1/integrations/slack/settings?workspace_id=' + workspaceId),
  updateSettings: (workspaceId: string, data: Partial<SlackSettings>) =>
    fetchAPI<SlackSettings>('/api/v1/integrations/slack/settings', {
      method: 'PUT',
      body: JSON.stringify({ workspace_id: workspaceId, ...data }),
    }),
  getChannels: (workspaceId: string) =>
    fetchAPI<Array<{ id: string; name: string }>>('/api/v1/integrations/slack/channels?workspace_id=' + workspaceId),
  disconnect: (workspaceId: string) =>
    fetchAPI<{ disconnected: boolean }>('/api/v1/integrations/slack/disconnect', {
      method: 'DELETE',
      body: JSON.stringify({ workspace_id: workspaceId }),
    }),
  sendTest: (workspaceId: string) =>
    fetchAPI<{ sent: boolean }>('/api/v1/integrations/slack/test', {
      method: 'POST',
      body: JSON.stringify({ workspace_id: workspaceId }),
    }),
};
