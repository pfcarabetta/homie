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
  ): Promise<ApiResponse<BookJobResponse>> {
    return fetchAPI<BookJobResponse>(`/api/v1/jobs/${jobId}/book`, {
      method: 'POST',
      body: JSON.stringify({
        response_id: responseId,
        provider_id: providerId,
      }),
    });
  },
};

// ── paymentService ──────────────────────────────────────────────────────────

export const paymentService = {
  async charge(
    jobId: string,
    tier: JobTier,
    paymentMethodId: string,
  ): Promise<ApiResponse<ChargeResponse>> {
    return fetchAPI<ChargeResponse>('/api/v1/payments/charge', {
      method: 'POST',
      body: JSON.stringify({
        job_id: jobId,
        tier,
        payment_method_id: paymentMethodId,
      }),
    });
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
  onEvent: (event: JobSocketEvent) => void,
  onStatusChange?: (connected: boolean) => void,
): JobSocket {
  const wsBase = API_BASE.replace(/^http/, 'ws');
  const token = getToken();
  const url = `${wsBase}/api/v1/jobs/${jobId}/ws${token ? `?token=${encodeURIComponent(token)}` : ''}`;

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
        const event = JSON.parse(e.data as string) as JobSocketEvent;
        onEvent(event);
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
  tier: string;
  zip_code: string;
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

export const accountService = {
  getProfile: () => fetchAPI<AccountProfile>('/api/v1/account'),
  updateProfile: (data: Partial<{ email: string; phone: string; zip_code: string; current_password: string; new_password: string }>) =>
    fetchAPI<AccountProfile>('/api/v1/account', { method: 'PATCH', body: JSON.stringify(data) }),
  getJobs: () => fetchAPI<{ jobs: AccountJob[] }>('/api/v1/account/jobs'),
  getBookings: () => fetchAPI<{ bookings: AccountBooking[] }>('/api/v1/account/bookings'),
};
