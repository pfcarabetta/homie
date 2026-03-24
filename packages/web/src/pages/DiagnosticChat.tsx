import { useReducer, useRef, useEffect, useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AvatarDropdown from '@/components/AvatarDropdown';
import DiagnosisCard, { type DiagnosisData } from '@/components/DiagnosisCard';
import OutreachProgress from '@/components/OutreachProgress';
import ProviderCard from '@/components/ProviderCard';
import ErrorState from '@/components/ErrorState';
import { Spinner } from '@/components/Skeleton';
import { HomieAvatar, HomieLogo } from '@/components/HomieAvatar';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useAuth } from '@/contexts/AuthContext';
import {
  diagnosticService,
  authService,
  jobService,
  paymentService,
  fetchAPI,
  connectJobSocket,
  type JobStatusResponse,
} from '@/services/api';
import {
  mockStreamResponse,
  simulateOutreach,
  type OutreachState as MockOutreachState,
} from '@/mocks/diagnostic';
import type { DiagnosisPayload, JobTier, JobTiming, JobSummary } from '@/services/api';

// ── Category icons ──────────────────────────────────────────────────────────

const CAT_ICONS: Record<string, string> = {
  plumbing: '🔧', electrical: '⚡', hvac: '❄️', appliance: '🔌',
  structural: '🏗️', roofing: '🏠', pest: '🐛', landscaping: '🌿', general: '🛠️',
  painting: '🎨', flooring: '🪵', handyman: '🛠️', pest_control: '🐛', cleaning: '🧹',
};

const SEV_LABELS: Record<string, { bg: string; text: string; label: string }> = {
  low: { bg: 'bg-green-500/10', text: 'text-green-600', label: 'Low Severity' },
  medium: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Medium' },
  high: { bg: 'bg-orange-500/10', text: 'text-orange-600', label: 'High' },
  urgent: { bg: 'bg-red-100', text: 'text-red-700', label: 'Urgent' },
  unknown: { bg: 'bg-dark/5', text: 'text-dark/50', label: 'Assessing' },
};

const ALL_ISSUES = [
  { icon: '🚿', text: 'My faucet is leaking' },
  { icon: '❄️', text: "AC isn't cooling" },
  { icon: '💡', text: 'Light switch feels warm' },
  { icon: '🚽', text: 'Toilet keeps running' },
  { icon: '🔌', text: 'Outlet stopped working' },
  { icon: '🌊', text: 'Water heater issue' },
  { icon: '🏠', text: 'Roof is leaking' },
  { icon: '🔨', text: 'Drywall needs patching' },
  { icon: '🚪', text: "Door won't close right" },
  { icon: '🎨', text: 'Paint is peeling' },
  { icon: '🧊', text: 'Fridge making noise' },
  { icon: '💨', text: 'Furnace blowing cold' },
  { icon: '🪟', text: 'Window is drafty' },
  { icon: '🐛', text: 'Pest problem' },
  { icon: '🔧', text: 'Garbage disposal jammed' },
  { icon: '🧹', text: 'Gutter needs cleaning' },
  { icon: '⚡', text: 'Breaker keeps tripping' },
  { icon: '🚰', text: 'Drain is slow' },
  { icon: '🔥', text: 'Oven not heating' },
  { icon: '🪵', text: 'Fence is leaning' },
  { icon: '💧', text: 'Ceiling has water stain' },
  { icon: '🏗️', text: 'Foundation crack' },
  { icon: '🌿', text: 'Sprinkler broken' },
  { icon: '🧺', text: 'Washer won\'t drain' },
  { icon: '🛁', text: 'Tub won\'t drain' },
  { icon: '🔔', text: 'Doorbell not working' },
  { icon: '🪤', text: 'Mouse in the house' },
  { icon: '💡', text: 'Dimmer switch buzzing' },
  { icon: '🌡️', text: 'Thermostat won\'t respond' },
  { icon: '🪠', text: 'Toilet is clogged' },
  { icon: '🏚️', text: 'Siding is damaged' },
];

// Split issues into 4 columns for scrolling credits
function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function IssueMosaic({ onSelect }: { onSelect: (text: string) => void }) {
  const [columns] = useState(() => {
    const shuffled = shuffleArray(ALL_ISSUES);
    const cols: (typeof ALL_ISSUES)[] = [[], [], [], []];
    shuffled.forEach((item, i) => cols[i % 4].push(item));
    // Duplicate each column so the scroll loops seamlessly
    return cols.map(col => [...col, ...col]);
  });

  // Stagger speeds so columns move at different rates
  const durations = [28, 34, 24, 32];

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10,
      width: '100%', maxWidth: 520, height: 460, overflow: 'hidden',
      maskImage: 'linear-gradient(to bottom, transparent 0%, black 12%, black 88%, transparent 100%)',
      WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 12%, black 88%, transparent 100%)',
    }}>
      {columns.map((col, colIdx) => (
        <div
          key={colIdx}
          style={{
            display: 'flex', flexDirection: 'column', gap: 10,
            animation: `mosaicScroll ${durations[colIdx]}s linear infinite`,
          }}
        >
          {col.map((tile, i) => (
            <button
              key={`${colIdx}-${i}-${tile.text}`}
              onClick={() => onSelect(tile.text)}
              style={{
                background: 'white', border: '2px solid rgba(0,0,0,0.06)', borderRadius: 14,
                padding: '16px 8px', textAlign: 'center', cursor: 'pointer',
                transition: 'border-color 0.15s, background 0.15s, transform 0.15s',
                fontFamily: "'DM Sans', sans-serif", flexShrink: 0,
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = '#E8632B'; e.currentTarget.style.background = 'rgba(232,99,43,0.04)'; e.currentTarget.style.transform = 'scale(1.05)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(0,0,0,0.06)'; e.currentTarget.style.background = 'white'; e.currentTarget.style.transform = 'scale(1)'; }}
            >
              <div style={{ fontSize: 24, marginBottom: 4 }}>{tile.icon}</div>
              <div style={{ fontSize: 11, fontWeight: 500, color: '#2D2926', lineHeight: 1.3 }}>{tile.text}</div>
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

// ── State ───────────────────────────────────────────────────────────────────

type MatchStep = 'tier' | 'preferences' | 'outreach' | 'results';

interface JobSummaryV2 {
  title: string;
  category: string;
  description?: string;
  severity_estimate: string;
  details_gathered?: string[];
  details_still_needed?: string[];
  estimated_cost_pro?: string;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  image?: string;
  diagnosis?: DiagnosisData;
  jobSummary?: JobSummaryV2;
}

/** Unified provider shape used in results and booking confirmation. */
interface MatchedProvider {
  id: string;
  responseId: string;
  name: string;
  googleRating: number;
  reviewCount: number;
  quotedPrice: string;
  availability: string;
  message: string;
  channel: 'voice' | 'sms' | 'web';
}

interface OutreachChannels {
  voice: { attempted: number; responded: number };
  sms: { attempted: number; responded: number };
  web: { attempted: number; responded: number };
}

interface State {
  messages: ChatMessage[];
  streaming: boolean;
  streamingMessageId: string | null;
  diagnosis: DiagnosisData | null;
  jobSummary: JobSummaryV2 | null;
  showBanner: boolean;

  // Match flow
  matchFlowActive: boolean;
  matchStep: MatchStep;
  tier: JobTier;
  zipCode: string;
  timing: JobTiming;

  // Job / outreach
  jobId: string | null;
  outreach: {
    providersContacted: number;
    channels: OutreachChannels;
    active: boolean;
  };
  expiresAt: string;
  matchFlowError: string | null;
  matchFlowLoading: boolean;

  // Results
  respondedProviders: MatchedProvider[];
  bookedProvider: MatchedProvider | null;
  bookingLoading: boolean;

  // Screening
  screeningAnswered: boolean;

  // Error
  streamError: string | null;
}

const EMPTY_CHANNELS: OutreachChannels = {
  voice: { attempted: 0, responded: 0 },
  sms: { attempted: 0, responded: 0 },
  web: { attempted: 0, responded: 0 },
};

const initialState: State = {
  messages: [],
  streaming: false,
  streamingMessageId: null,
  diagnosis: null,
  jobSummary: null,
  showBanner: false,
  matchFlowActive: false,
  matchStep: 'tier',
  tier: 'priority',
  zipCode: '',
  timing: 'asap',
  jobId: null,
  outreach: { providersContacted: 0, channels: EMPTY_CHANNELS, active: false },
  expiresAt: '',
  matchFlowError: null,
  matchFlowLoading: false,
  respondedProviders: [],
  bookedProvider: null,
  bookingLoading: false,
  screeningAnswered: false,
  streamError: null,
};

type Action =
  | { type: 'ADD_USER_MESSAGE'; content: string }
  | { type: 'START_STREAMING'; messageId: string }
  | { type: 'APPEND_TOKEN'; token: string }
  | { type: 'FINISH_STREAMING' }
  | { type: 'SET_DIAGNOSIS'; diagnosis: DiagnosisData }
  | { type: 'SET_JOB_SUMMARY'; summary: JobSummaryV2 }
  | { type: 'OPEN_MATCH_FLOW' }
  | { type: 'SET_TIER'; tier: JobTier }
  | { type: 'SET_ZIP'; zip: string }
  | { type: 'SET_TIMING'; timing: JobTiming }
  | { type: 'SET_MATCH_STEP'; step: MatchStep }
  | { type: 'JOB_CREATED'; jobId: string; expiresAt: string }
  | { type: 'UPDATE_OUTREACH'; outreach: State['outreach'] }
  | { type: 'SET_RESULTS'; providers: MatchedProvider[] }
  | { type: 'BOOK_PROVIDER'; provider: MatchedProvider }
  | { type: 'BOOKING_LOADING'; loading: boolean }
  | { type: 'MATCH_FLOW_ERROR'; error: string }
  | { type: 'MATCH_FLOW_LOADING'; loading: boolean }
  | { type: 'CLOSE_MATCH_FLOW' }
  | { type: 'RESET_CHAT' }
  | { type: 'DISMISS_BANNER' }
  | { type: 'SCREENING_ANSWERED' }
  | { type: 'STREAM_ERROR'; error: string }
  | { type: 'RESTORE_STATE'; payload: Partial<State> };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'ADD_USER_MESSAGE':
      return {
        ...state,
        messages: [
          ...state.messages,
          { id: `user-${Date.now()}`, role: 'user', content: action.content, timestamp: new Date() },
        ],
      };

    case 'START_STREAMING':
      return {
        ...state,
        streaming: true,
        streamError: null,
        streamingMessageId: action.messageId,
        messages: [
          ...state.messages,
          { id: action.messageId, role: 'assistant', content: '', timestamp: new Date() },
        ],
      };

    case 'APPEND_TOKEN':
      return {
        ...state,
        messages: state.messages.map((m) =>
          m.id === state.streamingMessageId ? { ...m, content: m.content + action.token } : m,
        ),
      };

    case 'FINISH_STREAMING':
      return {
        ...state,
        streaming: false,
        streamingMessageId: null,
        messages: state.messages.map((m) =>
          m.id === state.streamingMessageId
            ? { ...m, diagnosis: state.diagnosis ?? undefined, jobSummary: state.jobSummary ?? undefined }
            : m,
        ),
      };

    case 'SET_DIAGNOSIS':
      return { ...state, diagnosis: action.diagnosis };

    case 'SET_JOB_SUMMARY':
      return { ...state, jobSummary: action.summary, showBanner: true };

    case 'DISMISS_BANNER':
      return { ...state, showBanner: false };

    case 'SCREENING_ANSWERED':
      return { ...state, screeningAnswered: true };

    case 'OPEN_MATCH_FLOW':
      return { ...state, matchFlowActive: true, matchStep: 'tier', showBanner: false };

    case 'CLOSE_MATCH_FLOW':
      return { ...state, matchFlowActive: false };

    case 'RESET_CHAT':
      return { ...initialState };

    case 'SET_TIER':
      return { ...state, tier: action.tier };

    case 'SET_ZIP':
      return { ...state, zipCode: action.zip };

    case 'SET_TIMING':
      return { ...state, timing: action.timing };

    case 'SET_MATCH_STEP':
      return { ...state, matchStep: action.step, matchFlowError: null };

    case 'JOB_CREATED':
      return {
        ...state,
        jobId: action.jobId,
        expiresAt: action.expiresAt,
        matchStep: 'outreach',
        matchFlowLoading: false,
        outreach: { ...state.outreach, active: true },
      };

    case 'UPDATE_OUTREACH':
      return { ...state, outreach: action.outreach };

    case 'SET_RESULTS':
      return {
        ...state,
        respondedProviders: action.providers,
        matchStep: 'results',
        outreach: { ...state.outreach, active: false },
      };

    case 'BOOK_PROVIDER':
      return { ...state, bookedProvider: action.provider, bookingLoading: false };

    case 'BOOKING_LOADING':
      return { ...state, bookingLoading: action.loading };

    case 'MATCH_FLOW_ERROR':
      return { ...state, matchFlowError: action.error, matchFlowLoading: false };

    case 'MATCH_FLOW_LOADING':
      return { ...state, matchFlowLoading: action.loading };

    case 'STREAM_ERROR':
      return {
        ...state,
        streaming: false,
        streamingMessageId: null,
        streamError: action.error,
        // Remove the empty assistant message that was being streamed
        messages: state.messages.filter((m) => m.id !== state.streamingMessageId || m.content.length > 0),
      };

    case 'RESTORE_STATE':
      return { ...state, ...action.payload };

    default:
      return state;
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

let messageCounter = 0;
function nextId(): string {
  return `assistant-${Date.now()}-${++messageCounter}`;
}

/** Converts raw parsed diagnosis (which may come as DiagnosisPayload or DiagnosisData) into DiagnosisData. */
function normalizeDiagnosis(raw: Record<string, unknown>): DiagnosisData {
  // Handle the new richer format from the updated system prompt
  return {
    issue: (raw.issue as string) ?? (raw.summary as string)?.slice(0, 60) ?? 'Home Issue',
    category: (raw.category as string) ?? 'general',
    severity: (raw.severity as string) ?? 'medium',
    diy_feasible: raw.diy_feasible === true || raw.diy_feasible === 'true',
    confidence: typeof raw.confidence === 'number' ? raw.confidence : 0.85,
    estimated_cost_diy: (raw.estimated_cost_diy as string) ?? '$0',
    estimated_cost_pro: (raw.estimated_cost_pro as string) ?? (raw.estimatedCost ? `$${(raw.estimatedCost as { min: number }).min}–$${(raw.estimatedCost as { max: number }).max}` : '$0'),
    estimated_time_diy: (raw.estimated_time_diy as string) ?? undefined,
    tools_needed: Array.isArray(raw.tools_needed) ? raw.tools_needed as string[] : undefined,
    steps: Array.isArray(raw.steps) ? raw.steps as string[] : Array.isArray(raw.recommendedActions) ? raw.recommendedActions as string[] : undefined,
    safety_warnings: Array.isArray(raw.safety_warnings) ? raw.safety_warnings as string[] : undefined,
    when_to_call_pro: (raw.when_to_call_pro as string) ?? undefined,
  };
}

// ── Component ───────────────────────────────────────────────────────────────

export default function DiagnosticChat() {
  const navigate = useNavigate();
  const isDemo = new URLSearchParams(window.location.search).has('demo');
  const [state, dispatch] = useReducer(reducer, initialState);
  // useAuth() ensures AuthProvider context is available
  useAuth();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const matchFlowRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const cleanupOutreachRef = useRef<(() => void) | null>(null);
  const sessionIdRef = useRef(crypto.randomUUID());
  const [imgPreview, setImgPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useDocumentTitle('Free DIY Home Repair Diagnostic');

  // Auto-scroll to bottom when messages change (skip if only welcome/empty)
  useEffect(() => {
    if (state.messages.length > 1) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [state.messages]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      cleanupOutreachRef.current?.();
    };
  }, []);

  // Resume after payment — restore chat and launch outreach
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const paidChat = sessionStorage.getItem('homie_paid_chat');

    // User hit back from Stripe without completing payment — full reload for clean state
    if (paidChat && !urlParams.has('paid')) {
      sessionStorage.removeItem('homie_paid_chat');
      window.location.href = '/chat';
      return;
    }

    if (paidChat && urlParams.has('paid') && authService.isAuthenticated()) {
      sessionStorage.removeItem('homie_paid_chat');
      window.history.replaceState({}, '', '/chat');
      try {
        const saved = JSON.parse(paidChat);

        // Verify payment with API
        if (saved.jobId) {
          paymentService.getPaymentStatus(saved.jobId).then(res => {
            if (!res.data || (res.data.payment_status !== 'authorized' && res.data.payment_status !== 'paid')) {
              return;
            }

            // Trigger dispatch in case webhook hasn't fired yet
            void fetchAPI('/api/v1/payments/dispatch/' + saved.jobId, { method: 'POST' }).catch(() => {});

            const restoredMessages = (saved.messages ?? []).map((m: { id: string; role: string; content: string }) => ({
              ...m, timestamp: new Date(),
            })) as ChatMessage[];

        dispatch({
          type: 'RESTORE_STATE',
          payload: {
            messages: restoredMessages,
            diagnosis: saved.diagnosis ?? null,
            jobSummary: saved.jobSummary ?? null,
            screeningAnswered: saved.screeningAnswered ?? true,
            jobId: saved.jobId,
            matchFlowActive: true,
            matchStep: 'outreach',
            outreach: { providersContacted: 0, channels: { voice: { attempted: 0, responded: 0 }, sms: { attempted: 0, responded: 0 }, web: { attempted: 0, responded: 0 } }, active: true },
          },
        });

        if (saved.jobId) {
          dispatch({ type: 'JOB_CREATED', jobId: saved.jobId, expiresAt: saved.expiresAt ?? '' });

          const jobSocket = connectJobSocket(saved.jobId, (status: JobStatusResponse) => {
            dispatch({
              type: 'UPDATE_OUTREACH',
              outreach: {
                providersContacted: status.providers_contacted,
                channels: {
                  voice: { attempted: status.outreach_channels.voice.attempted, responded: status.outreach_channels.voice.connected },
                  sms: { attempted: status.outreach_channels.sms.attempted, responded: status.outreach_channels.sms.connected },
                  web: { attempted: status.outreach_channels.web.attempted, responded: status.outreach_channels.web.connected },
                },
                active: !['completed', 'expired', 'refunded'].includes(status.status),
              },
            });
            if (['completed', 'expired'].includes(status.status) || status.providers_responded > 0) {
              void jobService.getResponses(saved.jobId).then(respRes => {
                if (respRes.data && respRes.data.responses.length > 0) {
                  dispatch({
                    type: 'SET_RESULTS',
                    providers: respRes.data.responses.map(r => ({
                      id: r.provider.id, responseId: r.id, name: r.provider.name,
                      googleRating: parseFloat(r.provider.google_rating ?? '0'), reviewCount: r.provider.review_count,
                      quotedPrice: r.quoted_price ?? 'TBD', availability: r.availability ?? 'To be confirmed',
                      message: r.message ?? '', channel: r.channel as 'voice' | 'sms' | 'web',
                    })),
                  });
                }
              });
            }
          });
          cleanupOutreachRef.current = () => jobSocket.close();
            }
          }).catch(() => { /* payment verification failed */ });
        }
      } catch { /* ignore */ }
      return;
    }
  }, []);

  // Resume after login — restore saved chat state and reopen match flow
  useEffect(() => {
    const pending = sessionStorage.getItem('homie_pending_chat');
    if (pending && authService.isAuthenticated()) {
      sessionStorage.removeItem('homie_pending_chat');
      try {
        const saved = JSON.parse(pending);
        const restoredMessages = (saved.messages ?? []).map((m: { id: string; role: string; content: string }) => ({
          ...m,
          timestamp: new Date(),
        })) as ChatMessage[];

        dispatch({
          type: 'RESTORE_STATE',
          payload: {
            messages: restoredMessages,
            diagnosis: saved.diagnosis ?? null,
            jobSummary: saved.jobSummary ?? null,
            tier: saved.tier ?? 'priority',
            zipCode: saved.zipCode ?? '',
            timing: saved.timing ?? 'asap',
            screeningAnswered: saved.screeningAnswered ?? true,
            matchFlowActive: true,
            matchStep: 'preferences',
          },
        });
      } catch { /* ignore bad data */ }
    }
  }, []);

  const sendMessage = useCallback(
    (text: string, image?: string) => {
      if (!text.trim() || state.streaming) return;

      dispatch({ type: 'ADD_USER_MESSAGE', content: text.trim() });

      const msgId = nextId();
      dispatch({ type: 'START_STREAMING', messageId: msgId });

      const callbacks = {
        onToken: (token: string) => dispatch({ type: 'APPEND_TOKEN', token }),
        onDiagnosis: (d: DiagnosisPayload) => dispatch({ type: 'SET_DIAGNOSIS', diagnosis: normalizeDiagnosis(d as unknown as Record<string, unknown>) }),
        onJobSummary: (s: JobSummary) => dispatch({ type: 'SET_JOB_SUMMARY', summary: s as unknown as JobSummaryV2 }),
        onDone: () => dispatch({ type: 'FINISH_STREAMING' }),
        onError: (err: Error) => {
          console.error('[DiagnosticChat] stream error:', err);
          dispatch({ type: 'STREAM_ERROR', error: err.message || 'Failed to get a response. Please try again.' });
        },
      };

      // Build conversation history from prior messages (exclude the welcome message and the empty streaming message we just added)
      const history = state.messages
        .filter((m) => m.id !== 'welcome' && m.content.length > 0)
        .map((m) => ({ role: m.role, content: m.content }));

      abortRef.current = diagnosticService.sendMessage(
        sessionIdRef.current,
        text.trim(),
        callbacks,
        image ? [image] : undefined,
        history,
      );
    },
    [state.streaming],
  );

  const handleSend = useCallback(() => {
    const text = textareaRef.current?.value ?? '';
    if (!text.trim()) return;
    sendMessage(text, imgPreview ?? undefined);
    if (textareaRef.current) textareaRef.current.value = '';
    resetTextareaHeight();
    setImgPreview(null);
    if (fileRef.current) fileRef.current.value = '';
  }, [sendMessage, imgPreview]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  function resetTextareaHeight() {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }

  function handleTextareaInput() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }

  function openMatchFlow() {
    dispatch({ type: 'OPEN_MATCH_FLOW' });
    setTimeout(() => matchFlowRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  }

  function runMockOutreach() {
    const tierMinutes = state.tier === 'emergency' ? 15 : state.tier === 'priority' ? 30 : 120;
    const expiresAt = new Date(Date.now() + tierMinutes * 60 * 1000).toISOString();
    dispatch({ type: 'JOB_CREATED', jobId: state.jobId ?? 'mock', expiresAt });

    cleanupOutreachRef.current = simulateOutreach(state.tier, (mock: MockOutreachState) => {
      dispatch({
        type: 'UPDATE_OUTREACH',
        outreach: { providersContacted: mock.providersContacted, channels: mock.channels, active: mock.active },
      });
      if (!mock.active && mock.respondedProviders.length > 0) {
        dispatch({
          type: 'SET_RESULTS',
          providers: mock.respondedProviders.map((p) => ({
            id: p.id,
            responseId: p.responseId,
            name: p.name,
            googleRating: p.googleRating,
            reviewCount: p.reviewCount,
            quotedPrice: p.quotedPrice,
            availability: p.availability,
            message: p.message,
            channel: p.channel,
          })),
        });
      }
    });
  }

  async function startOutreach() {
    // Demo mode — use mock outreach
    if (isDemo) {
      runMockOutreach();
      return;
    }

    // Require sign in before real outreach — save state for resume
    if (!authService.isAuthenticated()) {
      sessionStorage.setItem('homie_pending_chat', JSON.stringify({
        messages: state.messages.map(m => ({ id: m.id, role: m.role, content: m.content })),
        diagnosis: state.diagnosis,
        jobSummary: state.jobSummary,
        tier: state.tier,
        zipCode: state.zipCode,
        timing: state.timing,
        screeningAnswered: state.screeningAnswered,
      }));
      dispatch({ type: 'CLOSE_MATCH_FLOW' });
      navigate('/login?redirect=/chat');
      return;
    }

    if (!(state.diagnosis || state.jobSummary)) {
      runMockOutreach();
      return;
    }

    dispatch({ type: 'MATCH_FLOW_LOADING', loading: true });

    try {
      const diag = state.diagnosis;
      const summary = state.jobSummary;
      const category = diag?.category ?? summary?.category ?? 'general';
      const severity = diag?.severity ?? summary?.severity_estimate ?? 'medium';
      const budget = diag?.estimated_cost_pro ?? summary?.estimated_cost_pro ?? 'flexible';

      const diagPayload: DiagnosisPayload = {
        category,
        severity: severity as DiagnosisPayload['severity'],
        summary: diag?.issue ?? summary?.description ?? summary?.title ?? 'Home repair',
        recommendedActions: diag?.steps ?? [],
      };

      const res = await jobService.createJob({
        diagnosis: diagPayload,
        timing: state.timing,
        budget,
        tier: state.tier,
        zipCode: state.zipCode,
      });

      if (!res.data) {
        dispatch({ type: 'MATCH_FLOW_LOADING', loading: false });
        runMockOutreach();
        return;
      }

      // Authorize payment via Stripe before launching outreach
      try {
        const payRes = await paymentService.createCheckout(res.data.id, '', '', '/chat');
        if (payRes.data?.checkout_url) {
          // Save state for resume after payment
          sessionStorage.setItem('homie_paid_chat', JSON.stringify({
            jobId: res.data.id,
            expiresAt: res.data.expires_at,
            messages: state.messages.map(m => ({ id: m.id, role: m.role, content: m.content })),
            diagnosis: state.diagnosis,
            jobSummary: state.jobSummary,
            screeningAnswered: state.screeningAnswered,
          }));
          window.location.href = payRes.data.checkout_url;
          return;
        }
      } catch {
        // Payment not configured — continue without payment
      }

      dispatch({ type: 'JOB_CREATED', jobId: res.data.id, expiresAt: res.data.expires_at });

      // Connect WebSocket for live outreach updates
      const jobSocket = connectJobSocket(res.data.id, (status: JobStatusResponse) => {
        dispatch({
          type: 'UPDATE_OUTREACH',
          outreach: {
            providersContacted: status.providers_contacted,
            channels: {
              voice: { attempted: status.outreach_channels.voice.attempted, responded: status.outreach_channels.voice.connected },
              sms: { attempted: status.outreach_channels.sms.attempted, responded: status.outreach_channels.sms.connected },
              web: { attempted: status.outreach_channels.web.attempted, responded: status.outreach_channels.web.connected },
            },
            active: !['completed', 'expired', 'refunded'].includes(status.status),
          },
        });

        // When outreach is done, fetch real provider responses
        if (['completed', 'expired'].includes(status.status) || status.providers_responded > 0) {
          void jobService.getResponses(res.data!.id).then(respRes => {
            if (respRes.data && respRes.data.responses.length > 0) {
              dispatch({
                type: 'SET_RESULTS',
                providers: respRes.data.responses.map(r => ({
                  id: r.provider.id,
                  responseId: r.id,
                  name: r.provider.name,
                  googleRating: parseFloat(r.provider.google_rating ?? '0'),
                  reviewCount: r.provider.review_count,
                  quotedPrice: r.quoted_price ?? 'TBD',
                  availability: r.availability ?? 'To be confirmed',
                  message: r.message ?? '',
                  channel: r.channel as 'voice' | 'sms' | 'web',
                })),
              });
            }
          });
        }
      });

      cleanupOutreachRef.current = () => jobSocket.close();
    } catch {
      dispatch({ type: 'MATCH_FLOW_LOADING', loading: false });
      runMockOutreach();
    }
  }

  async function handleBook(provider: MatchedProvider) {
    if (!state.jobId) return;

    // Demo mode — book instantly
    if (isDemo) {
      dispatch({ type: 'BOOK_PROVIDER', provider });
      return;
    }

    // Payment already captured — just book directly
    dispatch({ type: 'BOOKING_LOADING', loading: true });
    try {
      const res = await jobService.bookProvider(state.jobId, provider.responseId, provider.id);
      if (!res.data) {
        dispatch({ type: 'MATCH_FLOW_ERROR', error: res.error ?? 'Booking failed' });
        dispatch({ type: 'BOOKING_LOADING', loading: false });
        return;
      }
      dispatch({ type: 'BOOK_PROVIDER', provider });
    } catch (err) {
      dispatch({ type: 'MATCH_FLOW_ERROR', error: (err as Error).message ?? 'Booking failed' });
      dispatch({ type: 'BOOKING_LOADING', loading: false });
    }
  }

  function onImgUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setImgPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  }

  function removeImg() {
    setImgPreview(null);
    if (fileRef.current) fileRef.current.value = '';
  }

  const isEmpty = state.messages.length === 0;

  // ── Render ──────────────────────────────────────────────────────────────

  const O = '#E8632B';
  const D = '#2D2926';
  const W = '#F9F5F2';

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'white', fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`
        @keyframes dcFadeSlide { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
        @keyframes dcFadeIn { from { opacity:0; } to { opacity:1; } }
        @keyframes dcPulse { 0%,100% { opacity:1; } 50% { opacity:0.4; } }
        @keyframes dcBounce { 0%,100% { transform:translateY(0); } 50% { transform:translateY(-4px); } }
        @keyframes mosaicScroll { 0% { transform: translateY(0); } 100% { transform: translateY(-50%); } }
      `}</style>

      {/* Header */}
      <nav style={{
        position: 'sticky', top: 0, zIndex: 50, background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(10px)',
        padding: '0 20px', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderBottom: '1px solid rgba(0,0,0,0.05)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => navigate('/')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px', fontSize: 18, color: '#9B9490', display: 'flex', alignItems: 'center' }} title="Back to home">←</button>
          <span onClick={() => navigate('/')}
            style={{ fontFamily: "'Fraunces', serif", fontSize: 22, fontWeight: 700, color: O, cursor: 'pointer' }}>homie</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {(() => {
            const hour = new Date().getHours();
            const isBusinessHours = hour >= 8 && hour < 18;
            return isBusinessHours ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#1B9E77', boxShadow: '0 0 0 3px rgba(27,158,119,0.15)' }} />
                <span style={{ fontSize: 13, color: '#1B9E77', fontWeight: 600 }}>Online</span>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }} title="Some businesses may not be reachable outside business hours. Responses may be limited and take longer.">
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#EF9F27', boxShadow: '0 0 0 3px rgba(239,159,39,0.15)' }} />
                <span style={{ fontSize: 12, color: '#EF9F27', fontWeight: 600 }}>After hours</span>
              </div>
            );
          })()}
          <button onClick={() => { window.location.href = '/chat'; }} style={{
            background: 'none', border: '1px solid rgba(0,0,0,0.1)', borderRadius: 8,
            padding: '5px 12px', fontSize: 13, fontWeight: 600, color: '#6B6560',
            cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
          }}>+ New</button>
          <AvatarDropdown />
        </div>
      </nav>

      {/* Demo banner */}
      {isDemo && (
        <div style={{
          background: '#EFF6FF', borderBottom: '1px solid rgba(37,99,235,0.15)',
          padding: '8px 20px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          fontSize: 13, color: '#2563EB', fontWeight: 500,
        }}>
          Demo mode — no payment required, no real outreach
        </div>
      )}

      {/* After hours notice */}
      {(() => {
        const hour = new Date().getHours();
        return (hour < 8 || hour >= 18) ? (
          <div style={{
            background: '#FFF8F0', borderBottom: '1px solid rgba(239,159,39,0.15)',
            padding: '10px 20px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            fontSize: 13, color: '#9B7A3C', lineHeight: 1.4, textAlign: 'center',
          }}>
            <span style={{ fontSize: 16, flexShrink: 0 }}>{'\uD83C\uDF19'}</span>
            <span>Some businesses may not be reachable outside business hours (8 AM – 6 PM). Responses may be limited and take longer.</span>
          </div>
        ) : null;
      })()}

      {/* Messages area */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <div style={{ maxWidth: 600, margin: '0 auto', padding: isEmpty ? '24px 16px 16px' : '24px 16px 120px', display: 'flex', flexDirection: 'column', gap: 12, minHeight: isEmpty ? '100%' : undefined }}>

          {/* Welcome screen */}
          {isEmpty && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', textAlign: 'center', padding: '24px 8px 0' }}>
              <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 32, fontWeight: 700, color: D, marginBottom: 8 }}>How can Homie help?</h1>
              <p style={{ fontSize: 17, color: '#9B9490', maxWidth: 340, lineHeight: 1.5, marginBottom: 32, fontWeight: 500 }}>
                Tap an issue below or type your own
              </p>
              <IssueMosaic onSelect={(text) => sendMessage(text)} />
            </div>
          )}

          {/* Chat messages */}
          {state.messages.map((msg) => {
            if (msg.id === state.streamingMessageId && msg.content.length === 0) return null;
            const isUser = msg.role === 'user';
            return isUser ? (
              <div key={msg.id} style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 4, animation: 'dcFadeSlide 0.2s ease' }}>
                <div style={{
                  background: O, color: 'white', padding: '10px 18px', borderRadius: '16px 16px 4px 16px',
                  maxWidth: '75%', fontSize: 15, lineHeight: 1.5, whiteSpace: 'pre-wrap',
                }}
                  dangerouslySetInnerHTML={{
                    __html: msg.content
                      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
                      .replace(/\*(.+?)\*/g, '<em>$1</em>'),
                  }}
                />
              </div>
            ) : (
              <div key={msg.id} style={{ animation: 'dcFadeSlide 0.3s ease' }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 4 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 10, background: O, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <span style={{ color: 'white', fontFamily: "'Fraunces', serif", fontWeight: 700, fontSize: 15 }}>h</span>
                  </div>
                  <div style={{ minWidth: 0 }}>
                    {msg.content && (
                      <div style={{
                        background: W, padding: '12px 16px', borderRadius: '16px 16px 16px 4px',
                        maxWidth: '100%', fontSize: 15, lineHeight: 1.6, color: D, whiteSpace: 'pre-wrap',
                      }}
                        dangerouslySetInnerHTML={{
                          __html: msg.content
                            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
                            .replace(/\*(.+?)\*/g, '<em>$1</em>'),
                        }}
                      />
                    )}
                    {msg.diagnosis && (
                      <div style={{ marginTop: 8 }}>
                        <DiagnosisCard diagnosis={msg.diagnosis} onFindPro={openMatchFlow} />
                      </div>
                    )}
                    {!msg.diagnosis && msg.jobSummary && (
                      <div style={{ marginTop: 8 }}>
                        <EarlyMatchCard summary={msg.jobSummary} onRequestPro={openMatchFlow} />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {/* Screening buttons */}
          {!state.screeningAnswered && !state.streaming && state.messages.length >= 2 && state.messages.some((m) => m.role === 'assistant' && m.content.length > 0) && (
            <div style={{ marginLeft: 42, animation: 'dcFadeSlide 0.3s ease' }}>
              <p style={{ fontSize: 13, color: '#9B9490', fontWeight: 500, marginBottom: 8 }}>How would you like to handle this?</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {[
                  { label: 'I\'ll tackle it myself', icon: '🔧', value: 'I want to try fixing this myself — walk me through it.' },
                  { label: 'Match me with a pro', icon: '👷', value: 'I\'d rather have a professional handle this — please match me with a Homie Pro.' },
                  { label: 'I\'m not sure yet', icon: '🤔', value: 'I\'m not sure yet — can you help me figure out which option makes more sense?' },
                ].map((opt) => (
                  <button
                    key={opt.label}
                    onClick={() => { dispatch({ type: 'SCREENING_ANSWERED' }); sendMessage(opt.value); }}
                    style={{
                      background: 'white', border: '2px solid rgba(0,0,0,0.07)', borderRadius: 12,
                      padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8,
                      cursor: 'pointer', transition: 'all 0.15s', fontSize: 13, fontWeight: 500, color: D,
                      fontFamily: "'DM Sans', sans-serif",
                    }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = O; e.currentTarget.style.background = 'rgba(232,99,43,0.03)'; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(0,0,0,0.07)'; e.currentTarget.style.background = 'white'; }}
                  >
                    <span style={{ fontSize: 18 }}>{opt.icon}</span>
                    <span>{opt.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Typing indicator */}
          {state.streaming && !state.messages.some((m) => m.id === state.streamingMessageId && m.content.length > 0) && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', animation: 'dcFadeIn 0.3s ease' }}>
              <div style={{ width: 32, height: 32, borderRadius: 10, background: O, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <span style={{ color: 'white', fontFamily: "'Fraunces', serif", fontWeight: 700, fontSize: 15 }}>h</span>
              </div>
              <div style={{ background: W, padding: '12px 16px', borderRadius: '16px 16px 16px 4px' }}>
                <div style={{ display: 'flex', gap: 4 }}>
                  {[0, 1, 2].map((i) => (
                    <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: '#ccc', animation: `dcPulse 1s infinite ${i * 0.2}s` }} />
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Stream error */}
          {state.streamError && (
            <div style={{ maxWidth: '85%' }}>
              <ErrorState title="Couldn't get a response" message={state.streamError} onRetry={() => dispatch({ type: 'STREAM_ERROR', error: '' })} />
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Provider modal */}
      {state.matchFlowActive && (
        <ProviderModal
          state={state}
          dispatch={dispatch}
          startOutreach={startOutreach}
          handleBook={handleBook}
          onClose={() => dispatch({ type: 'CLOSE_MATCH_FLOW' })}
          isDemo={isDemo}
        />
      )}

      {/* Image preview strip */}
      {imgPreview && (
        <div style={{ background: 'white', borderTop: '1px solid rgba(0,0,0,0.05)', padding: '8px 20px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <div style={{ position: 'relative' }}>
            <img src={imgPreview} alt="Preview" style={{ height: 56, borderRadius: 10, border: '1px solid rgba(0,0,0,0.08)' }} />
            <button onClick={removeImg} style={{
              position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: '50%',
              background: D, color: 'white', border: '2px solid white', fontSize: 11, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>✕</button>
          </div>
          <span style={{ fontSize: 12, color: '#9B9490' }}>Image attached</span>
        </div>
      )}

      {/* Input */}
      <div style={{ background: 'white', borderTop: '1px solid rgba(0,0,0,0.05)', padding: '12px 16px 20px', flexShrink: 0 }}>
        <div style={{ maxWidth: 600, margin: '0 auto' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <input type="file" ref={fileRef} onChange={onImgUpload} accept="image/*" style={{ display: 'none' }} />
            <button onClick={() => fileRef.current?.click()} style={{
              width: 48, height: 48, borderRadius: '50%', border: '2px solid rgba(0,0,0,0.08)',
              background: 'white', cursor: 'pointer', fontSize: 20, display: 'flex', alignItems: 'center',
              justifyContent: 'center', flexShrink: 0, transition: 'all 0.15s',
            }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = O; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(0,0,0,0.08)'; }}
            >{'\uD83D\uDCF7'}</button>
            <div style={{
              flex: 1, display: 'flex', alignItems: 'flex-end',
              border: '2px solid rgba(0,0,0,0.08)', borderRadius: 24,
              background: W, padding: '4px 4px 4px 18px', transition: 'border-color 0.2s',
            }}
              onFocus={() => { }}
            >
              <textarea
                ref={textareaRef}
                rows={1}
                placeholder="Hey Homie, I need help with..."
                style={{
                  flex: 1, background: 'transparent', border: 'none', outline: 'none', resize: 'none',
                  fontSize: 16, color: D, padding: '10px 0', lineHeight: 1.5, maxHeight: 120,
                  fontFamily: "'DM Sans', sans-serif",
                }}
                onInput={handleTextareaInput}
                onKeyDown={handleKeyDown}
                disabled={state.streaming}
              />
              <button
                onClick={handleSend}
                disabled={state.streaming}
                style={{
                  width: 44, height: 44, borderRadius: '50%', border: 'none', flexShrink: 0,
                  background: state.streaming ? 'rgba(0,0,0,0.06)' : O,
                  color: 'white', fontSize: 20, cursor: state.streaming ? 'default' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s',
                }}
              >{'\u2191'}</button>
            </div>
          </div>
          <p style={{ textAlign: 'center', fontSize: 11, color: '#ccc', marginTop: 8 }}>
            Homie provides guidance only — always verify with a licensed professional for safety-critical issues
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Early match card ────────────────────────────────────────────────────────

function EarlyMatchCard({ summary, onRequestPro }: { summary: JobSummaryV2; onRequestPro: () => void }) {
  const icon = CAT_ICONS[summary.category] ?? '🛠️';
  const sev = SEV_LABELS[summary.severity_estimate] ?? SEV_LABELS.unknown;

  return (
    <div className="mt-2.5 bg-white rounded-xl border border-dark/10 overflow-hidden w-[75vw] max-w-[320px]">
      <div className="px-3.5 py-3 border-b border-dark/5">
        <span className="text-2xl block mb-2">{icon}</span>
        <p className="text-[13px] font-bold text-dark leading-snug">{summary.title}</p>
        <p className="text-[11px] text-dark/40 capitalize mt-1">{summary.category}{summary.estimated_cost_pro ? ` · Est. ${summary.estimated_cost_pro}` : ''}</p>
        {summary.severity_estimate && summary.severity_estimate !== 'unknown' && (
          <span className={`${sev.bg} ${sev.text} text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide inline-block mt-2`}>{sev.label}</span>
        )}
      </div>
      <button
        onClick={onRequestPro}
        className="w-full px-3.5 py-2.5 text-[12px] font-bold text-orange-500 hover:bg-orange-500/[0.04] transition-colors flex items-center justify-center gap-1.5"
      >
        <span>👷</span> Skip ahead — get a Homie Pro <span className="text-base">→</span>
      </button>
    </div>
  );
}

// ── Provider modal ──────────────────────────────────────────────────────────

function ProviderModal({
  state,
  dispatch,
  startOutreach,
  handleBook,
  onClose,
  isDemo,
}: {
  state: State;
  dispatch: React.Dispatch<Action>;
  startOutreach: () => void;
  handleBook: (p: MatchedProvider) => void;
  onClose: () => void;
  isDemo?: boolean;
}) {
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end justify-center z-50" onClick={onClose}>
      <div
        className="bg-white rounded-t-3xl w-full max-w-[480px] max-h-[90vh] overflow-auto px-6 pt-7 pb-6 animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-center mb-5">
          <h3 className="text-xl font-extrabold text-dark">
            {state.matchStep === 'tier' ? 'Find a Pro' : state.matchStep === 'preferences' ? 'Your Details' : state.matchStep === 'outreach' ? 'Homie is on it' : 'Pros Who Responded'}
          </h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-warm flex items-center justify-center text-base">✕</button>
        </div>

        {/* Job summary mini card */}
        {state.jobSummary && (
          <div className="bg-warm rounded-xl px-4 py-3 mb-5 border border-dark/5 text-[13px] text-dark/60">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-base">{CAT_ICONS[state.jobSummary.category] ?? '🛠️'}</span>
              <strong className="text-dark">{state.jobSummary.title}</strong>
            </div>
            {state.jobSummary.description && <p className="text-xs text-dark/40">{state.jobSummary.description}</p>}
          </div>
        )}

        {state.matchFlowError && (
          <div className="mb-5">
            <ErrorState title="Something went wrong" message={state.matchFlowError} onRetry={() => dispatch({ type: 'SET_MATCH_STEP', step: 'preferences' })} />
          </div>
        )}

        {state.bookedProvider ? (
          <BookingConfirmation provider={state.bookedProvider} isDemo={isDemo} />
        ) : (
          <>
            {state.matchStep === 'tier' && <TierStep state={state} dispatch={dispatch} />}
            {state.matchStep === 'preferences' && <PreferencesStep state={state} dispatch={dispatch} startOutreach={startOutreach} />}
            {state.matchStep === 'outreach' && (
              <>
                <OutreachProgress providersContacted={state.outreach.providersContacted} channels={state.outreach.channels} active={state.outreach.active} expiresAt={state.expiresAt} />
                <div className="mt-4 bg-blue-50 rounded-xl p-3 border border-blue-100">
                  <p className="text-[13px] font-semibold text-blue-600 mb-1">You can close this page</p>
                  <p className="text-xs text-dark/60 leading-relaxed">We'll notify you by text and email when quotes arrive. You can also check your quotes anytime in your <a href="/account?tab=quotes" className="text-orange-500 font-semibold no-underline">account portal</a>.</p>
                </div>
              </>
            )}
            {state.matchStep === 'results' && <ResultsStep providers={state.respondedProviders} onBook={handleBook} />}
          </>
        )}
      </div>
    </div>
  );
}

// ── Match flow sub-components ───────────────────────────────────────────────

function TierStep({ state, dispatch }: { state: State; dispatch: React.Dispatch<Action> }) {
  const tiers = [
    { id: 'standard' as JobTier, name: 'Standard', price: '$9.99', icon: '📱', desc: 'Homie contacts 5 local pros via text & web', time: 'Results in ~2 hours', providers: '5 pros contacted' },
    { id: 'priority' as JobTier, name: 'Priority', price: '$19.99', icon: '⚡', desc: 'Homie calls & texts 10 pros simultaneously', time: 'Results in ~30 min', providers: '10 pros contacted', popular: true },
    { id: 'emergency' as JobTier, name: 'Emergency', price: '$29.99', icon: '🚨', desc: 'Homie blitzes every available pro for same-day service', time: 'Results in ~15 min', providers: '15 pros contacted' },
  ];

  return (
    <div>
      <p className="text-sm text-dark/60 mb-4 leading-relaxed">
        Homie's AI agent will call, text, and search the web to find available pros in your area. Choose your speed:
      </p>
      <div className="flex flex-col gap-2.5">
        {tiers.map((t) => (
          <button
            key={t.id}
            onClick={() => { dispatch({ type: 'SET_TIER', tier: t.id }); dispatch({ type: 'SET_MATCH_STEP', step: 'preferences' }); }}
            className={`relative text-left border-2 rounded-xl px-[18px] py-4 transition-all hover:border-orange-500 ${state.tier === t.id ? 'border-orange-500' : 'border-dark/10'}`}
          >
            {t.popular && <div className="absolute top-0 right-0 bg-orange-500 text-white text-[10px] font-bold px-2.5 py-0.5 rounded-bl-lg rounded-tr-[10px] uppercase tracking-wide">Most Popular</div>}
            <div className="flex items-center gap-3">
              <span className="text-[28px]">{t.icon}</span>
              <div className="flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-base font-extrabold text-dark">{t.name}</span>
                  <span className="text-lg font-extrabold text-orange-500">{t.price}</span>
                </div>
                <p className="text-[13px] text-dark/60 mt-0.5">{t.desc}</p>
                <p className="text-xs text-dark/40 mt-0.5">{t.time} · {t.providers}</p>
              </div>
              <span className="text-xl text-dark/15">→</span>
            </div>
          </button>
        ))}
      </div>
      <div className="text-center mt-3.5">
        <p className="text-[13px] text-green-600 font-semibold">&#10003; Only charged if you receive quotes</p>
        <p className="text-xs text-dark/40 mt-1">100% satisfaction guarantee — no quotes, no charge</p>
        <p className="text-[10px] text-dark/20 mt-2 max-w-[360px] mx-auto leading-relaxed">
          By selecting a tier, you authorize Homie to contact service providers on your behalf via phone call, text message, and email to obtain quotes for your request.
        </p>
      </div>
    </div>
  );
}

const TIMINGS: { value: JobTiming; label: string }[] = [
  { value: 'asap', label: 'ASAP' },
  { value: 'this_week', label: 'This week' },
  { value: 'this_month', label: 'This month' },
  { value: 'flexible', label: 'Flexible' },
];

const BUDGETS = ['Under $200', '$200-500', '$500-1000', 'No limit'];

function PreferencesStep({ state, dispatch, startOutreach }: { state: State; dispatch: React.Dispatch<Action>; startOutreach: () => void }) {
  const [budget, setBudget] = useState('');
  const isValid = /^\d{5}$/.test(state.zipCode) && state.timing && budget;

  return (
    <div>
      <p className="text-sm text-dark/60 mb-4 leading-relaxed">A few quick details so Homie can find the right pros:</p>
      <div className="space-y-3">
        <div>
          <label className="text-[13px] font-bold text-dark mb-1.5 block">Zip Code</label>
          <input
            value={state.zipCode} onChange={(e) => dispatch({ type: 'SET_ZIP', zip: e.target.value.replace(/\D/g, '') })}
            placeholder="e.g. 92103" maxLength={5} inputMode="numeric"
            className="w-full px-3.5 py-3 rounded-lg border border-dark/10 bg-warm text-[15px] text-dark outline-none focus:border-orange-500/30"
          />
        </div>
        <div>
          <label className="text-[13px] font-bold text-dark mb-1.5 block">When do you need this done?</label>
          <div className="grid grid-cols-2 gap-2">
            {TIMINGS.map((t) => (
              <button key={t.value} onClick={() => dispatch({ type: 'SET_TIMING', timing: t.value })}
                className={`py-2.5 px-3 rounded-lg border-[1.5px] text-[13px] font-semibold transition-all ${state.timing === t.value ? 'border-orange-500 bg-orange-500/[0.06] text-orange-600' : 'border-dark/10 text-dark/60'}`}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="text-[13px] font-bold text-dark mb-1.5 block">Budget range</label>
          <div className="grid grid-cols-2 gap-2">
            {BUDGETS.map((b) => (
              <button key={b} onClick={() => setBudget(b)}
                className={`py-2.5 px-3 rounded-lg border-[1.5px] text-[13px] font-semibold transition-all ${budget === b ? 'border-orange-500 bg-orange-500/[0.06] text-orange-600' : 'border-dark/10 text-dark/60'}`}>
                {b}
              </button>
            ))}
          </div>
        </div>
      </div>
      <button onClick={startOutreach} disabled={!isValid || state.matchFlowLoading}
        className={`w-full mt-5 py-3.5 rounded-xl text-[15px] font-bold transition-all flex items-center justify-center gap-2 ${isValid && !state.matchFlowLoading ? 'bg-gradient-to-br from-orange-500 to-orange-600 text-white' : 'bg-dark/10 text-dark/30'}`}>
        {state.matchFlowLoading && <Spinner size="sm" />}
        {state.matchFlowLoading ? 'Creating job...' : `🚀 Launch Homie Agent — ${state.tier === 'emergency' ? '$29.99' : state.tier === 'priority' ? '$19.99' : '$9.99'}`}
      </button>
      <button onClick={() => dispatch({ type: 'SET_MATCH_STEP', step: 'tier' })} className="w-full mt-2 py-2.5 text-[13px] text-dark/40 hover:text-dark/60">
        ← Back to pricing
      </button>
    </div>
  );
}

function ResultsStep({ providers, onBook }: { providers: MatchedProvider[]; onBook: (p: MatchedProvider) => void }) {
  if (providers.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-5xl mb-4">😔</p>
        <h2 className="text-2xl font-bold mb-2">No responses yet</h2>
        <p className="text-dark/50 text-sm mb-6 max-w-sm mx-auto">We weren't able to reach providers in time.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="bg-green-500/10 rounded-lg px-3.5 py-2.5 mb-4 flex items-center gap-2">
        <span className="text-lg">✅</span>
        <span className="text-[13px] font-bold text-green-600">{providers.length} pro{providers.length !== 1 ? 's' : ''} responded</span>
      </div>
      <div className="space-y-3">
        {providers.map((p) => (
          <ProviderCard key={p.id} name={p.name} googleRating={p.googleRating} reviewCount={p.reviewCount} quotedPrice={p.quotedPrice} availability={p.availability} message={p.message} channel={p.channel} onBook={() => onBook(p)} />
        ))}
      </div>
    </div>
  );
}

function BookingConfirmation({ provider, isDemo }: { provider: MatchedProvider; isDemo?: boolean }) {
  return (
    <div className="text-center py-8 animate-fade-in">
      <div className="w-16 h-16 bg-green-500/15 rounded-full flex items-center justify-center mx-auto mb-4">
        <svg className="w-8 h-8 text-green-500" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
        </svg>
      </div>
      <h2 className="text-2xl font-bold mb-2">You're all set!</h2>
      <p className="text-dark/50 text-sm mb-6 max-w-sm mx-auto">
        <strong className="text-dark">{provider.name}</strong> has been booked. They'll be in touch to confirm the details.
      </p>
      <div className="bg-warm rounded-xl p-4 max-w-sm mx-auto text-left space-y-2">
        <div className="flex justify-between text-sm"><span className="text-dark/50">Quote</span><span className="font-semibold">${provider.quotedPrice}</span></div>
        <div className="flex justify-between text-sm"><span className="text-dark/50">When</span><span className="font-semibold">{provider.availability}</span></div>
        <div className="flex justify-between text-sm"><span className="text-dark/50">Rating</span><span className="font-semibold">⭐ {provider.googleRating}</span></div>
      </div>
      {isDemo && <p className="text-dark/30 text-xs mt-4">This is a demo — no actual booking was made</p>}
    </div>
  );
}
