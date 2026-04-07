import { useReducer, useRef, useEffect, useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AvatarDropdown from '@/components/AvatarDropdown';
import DiagnosisCard, { type DiagnosisData } from '@/components/DiagnosisCard';
import HomieOutreachLive, { type OutreachStatus, type LogEntry } from '@/components/HomieOutreachLive';
import ErrorState from '@/components/ErrorState';
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
  accountService,
  estimateService,
  type JobStatusResponse,
  type HomeData,
  type CostEstimate,
  type ProviderResponseItem,
} from '@/services/api';
import EstimateCard from '@/components/EstimateCard';
import EstimateBadge from '@/components/EstimateBadge';
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

// ── Home context builder ────────────────────────────────────────────────────

function buildHomeContext(home: HomeData): string {
  const parts: string[] = [];

  const basicParts: string[] = [];
  if (home.bedrooms) basicParts.push(`${home.bedrooms} bed`);
  if (home.bathrooms) basicParts.push(`${home.bathrooms} bath`);
  if (home.sqft) basicParts.push(`${home.sqft.toLocaleString()} sqft`);
  if (basicParts.length > 0) parts.push(`Home: ${basicParts.join(' / ')}.`);
  if (home.address) parts.push(`Address: ${home.address}${home.city ? `, ${home.city}` : ''}${home.state ? ` ${home.state}` : ''}.`);

  const d = home.details;
  if (!d) return parts.join(' ');

  if (d.hvac) {
    const hvacParts: string[] = [];
    if (d.hvac.acType) hvacParts.push(`${d.hvac.acType}${d.hvac.acBrand ? ` (${d.hvac.acBrand})` : ''}${d.hvac.acAge ? `, ${d.hvac.acAge} old` : ''}`);
    if (d.hvac.heatingType) hvacParts.push(`Heating: ${d.hvac.heatingType}${d.hvac.heatingBrand ? ` (${d.hvac.heatingBrand})` : ''}`);
    if (d.hvac.thermostatBrand) hvacParts.push(`Thermostat: ${d.hvac.thermostatBrand}`);
    if (d.hvac.filterSize) hvacParts.push(`Filter: ${d.hvac.filterSize}`);
    if (hvacParts.length > 0) parts.push(`HVAC: ${hvacParts.join('. ')}.`);
  }

  if (d.waterHeater) {
    const whParts: string[] = [];
    if (d.waterHeater.type) whParts.push(d.waterHeater.type);
    if (d.waterHeater.brand) whParts.push(d.waterHeater.brand);
    if (d.waterHeater.fuel) whParts.push(d.waterHeater.fuel);
    if (d.waterHeater.capacity) whParts.push(d.waterHeater.capacity);
    if (d.waterHeater.location) whParts.push(`in ${d.waterHeater.location}`);
    if (whParts.length > 0) parts.push(`Water heater: ${whParts.join(', ')}.`);
  }

  if (d.appliances) {
    const appParts: string[] = [];
    for (const [name, info] of Object.entries(d.appliances)) {
      if (info && typeof info === 'object') {
        const appInfo = info as Record<string, string>;
        if (appInfo.brand) appParts.push(`${name}: ${appInfo.brand}${appInfo.model ? ` ${appInfo.model}` : ''}`);
      }
    }
    if (appParts.length > 0) parts.push(`Appliances: ${appParts.join('. ')}.`);
  }

  if (d.plumbing) {
    const plParts: string[] = [];
    if (d.plumbing.kitchenFaucetBrand) plParts.push(`Kitchen faucet: ${d.plumbing.kitchenFaucetBrand}`);
    if (d.plumbing.bathroomFaucetBrand) plParts.push(`Bath faucet: ${d.plumbing.bathroomFaucetBrand}`);
    if (d.plumbing.toiletBrand) plParts.push(`Toilet: ${d.plumbing.toiletBrand}`);
    if (d.plumbing.septicOrSewer) plParts.push(d.plumbing.septicOrSewer);
    if (plParts.length > 0) parts.push(`Plumbing: ${plParts.join('. ')}.`);
  }

  if (d.electrical) {
    const elParts: string[] = [];
    if (d.electrical.panelAmperage) elParts.push(`Panel: ${d.electrical.panelAmperage}`);
    if (d.electrical.hasSolar && d.electrical.solarSystem) elParts.push(`Solar: ${d.electrical.solarSystem}`);
    if (d.electrical.hasGenerator && d.electrical.generatorType) elParts.push(`Generator: ${d.electrical.generatorType}`);
    if (elParts.length > 0) parts.push(`Electrical: ${elParts.join('. ')}.`);
  }

  if (d.poolSpa) {
    const poolParts: string[] = [];
    if (d.poolSpa.poolType) poolParts.push(`Pool: ${d.poolSpa.poolType}`);
    if (d.poolSpa.hotTubBrand) poolParts.push(`Hot tub: ${d.poolSpa.hotTubBrand}`);
    if (poolParts.length > 0) parts.push(poolParts.join('. ') + '.');
  }

  if (d.exterior) {
    const extParts: string[] = [];
    if (d.exterior.roofType) extParts.push(`Roof: ${d.exterior.roofType}${d.exterior.roofAge ? `, ${d.exterior.roofAge} old` : ''}`);
    if (d.exterior.sidingMaterial) extParts.push(`Siding: ${d.exterior.sidingMaterial}`);
    if (extParts.length > 0) parts.push(`Exterior: ${extParts.join('. ')}.`);
  }

  if (d.general?.yearBuilt) parts.push(`Built: ${d.general.yearBuilt}.`);

  return parts.join(' ');
}

// ── Component ───────────────────────────────────────────────────────────────

export default function DiagnosticChat() {
  const navigate = useNavigate();
  const isDemo = new URLSearchParams(window.location.search).has('demo');
  const [state, dispatch] = useReducer(reducer, initialState);
  // useAuth() ensures AuthProvider context is available
  const { homeowner } = useAuth();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const matchFlowRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const cleanupOutreachRef = useRef<(() => void) | null>(null);
  const sessionIdRef = useRef(crypto.randomUUID());
  const [imgPreview, setImgPreview] = useState<string | null>(null);
  const [costEstimate, setCostEstimate] = useState<CostEstimate | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const homeContextRef = useRef<string>('');

  useDocumentTitle('Free DIY Home Repair Diagnostic');

  // Load home details for context
  useEffect(() => {
    if (authService.isAuthenticated()) {
      accountService.getHome().then(res => {
        if (res.data) {
          homeContextRef.current = buildHomeContext(res.data);
        }
      }).catch(() => { /* ignore */ });
    }
  }, []);

  // Fetch cost estimate when diagnosis arrives
  useEffect(() => {
    if (!state.diagnosis) return;
    const diag = state.diagnosis;
    // Extract zip from user's auth profile or from chat messages
    const zipFromAuth = homeowner?.zip_code;
    const zipFromMessages = state.messages
      .filter(m => m.role === 'user')
      .map(m => m.content.match(/\b(\d{5})\b/))
      .filter(Boolean)
      .map(m => m![1])
      .pop();
    const zip = zipFromMessages || zipFromAuth;
    if (!zip || !diag.category) return;

    estimateService.generate({
      category: diag.category,
      subcategory: diag.issue || diag.category,
      zip_code: zip,
    }).then(res => {
      if (res.data) setCostEstimate(res.data);
    }).catch(() => { /* estimate unavailable — non-critical */ });
  }, [state.diagnosis]);

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
        if (saved.jobId) {
          // Verify payment then open the modal at outreach step
          paymentService.getPaymentStatus(saved.jobId).then(res => {
            if (!res.data || (res.data.payment_status !== 'authorized' && res.data.payment_status !== 'paid')) return;
            // Trigger dispatch in case webhook hasn't fired yet
            void fetchAPI('/api/v1/payments/dispatch/' + saved.jobId, { method: 'POST' }).catch(() => {});
            // Restore minimal state and open modal — the modal handles its own WebSocket
            dispatch({ type: 'JOB_CREATED', jobId: saved.jobId, expiresAt: '' });
            dispatch({ type: 'OPEN_MATCH_FLOW' });
          }).catch(() => {});
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
      if ((!text.trim() && !image) || state.streaming) return;

      dispatch({ type: 'ADD_USER_MESSAGE', content: text.trim() || '📷 Photo uploaded' });

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

      let messageText = text.trim() || (image ? 'What do you see in this photo? What might be wrong and how can I fix it?' : '');
      // Prepend home context to the first message if available
      if (history.length === 0 && homeContextRef.current) {
        messageText = `[Home details: ${homeContextRef.current}]\n\n${messageText}`;
      }
      abortRef.current = diagnosticService.sendMessage(
        sessionIdRef.current,
        messageText,
        callbacks,
        image ? [image] : undefined,
        history,
      );
    },
    [state.streaming],
  );

  const handleSend = useCallback(() => {
    const text = textareaRef.current?.value ?? '';
    if (!text.trim() && !imgPreview) return;
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
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      const text = textareaRef.current?.value?.trim() ?? '';
      if (!text) {
        // No text typed — send photo immediately
        sendMessage('', dataUrl);
        if (fileRef.current) fileRef.current.value = '';
      } else {
        // Text is present — attach photo and let user send
        setImgPreview(dataUrl);
      }
    };
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
                Tap an issue below, type your own, or upload a photo
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
                        {costEstimate && (
                          <EstimateCard
                            estimate={costEstimate}
                            diyEstimate={msg.diagnosis.diy_feasible ? msg.diagnosis.estimated_cost_diy : undefined}
                          />
                        )}
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
        <DiagnosticOutreachModal
          isOpen={true}
          onClose={(hasJob) => {
            dispatch({ type: 'CLOSE_MATCH_FLOW' });
            if (hasJob) navigate('/account?tab=quotes');
          }}
          diagnosis={state.diagnosis}
          jobSummary={state.jobSummary}
          isDemo={isDemo}
          initialCostEstimate={costEstimate}
          initialJobId={state.jobId}
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

      {/* Find a Pro banner */}
      {(state.diagnosis || state.jobSummary) && !state.matchFlowActive && !state.bookedProvider && (
        <div style={{
          background: `${O}08`, borderTop: `1px solid ${O}20`, padding: '12px 16px',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, flexShrink: 0,
        }}>
          <span style={{ fontSize: 13, color: D, fontWeight: 500 }}>Ready to find a pro?</span>
          <button onClick={openMatchFlow} style={{
            padding: '8px 20px', borderRadius: 100, border: 'none',
            background: O, color: '#fff', fontSize: 13, fontWeight: 600,
            cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
          }}>Find a Pro</button>
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

// ── Diagnostic Outreach Modal (matches QuoteOutreachModal pattern) ───────

const DIAG_TIERS = [
  { id: 'standard', name: 'Standard', price: '$9.99', time: '~2 hours', detail: '5 pros via SMS + web' },
  { id: 'priority', name: 'Priority', price: '$19.99', time: '~30 min', detail: '10 pros via voice + SMS + web', popular: true },
  { id: 'emergency', name: 'Emergency', price: '$29.99', time: '~15 min', detail: '15 pros, all channels blitz' },
];

const DIAG_OUTREACH_LOG = [
  { t: 0, msg: 'Analyzing your issue...', type: 'system' },
  { t: 800, msg: 'Diagnosis complete \u2014 generating provider briefing', type: 'system' },
  { t: 1600, msg: 'Found 14 providers near you', type: 'system' },
  { t: 2400, msg: 'Calling Rodriguez Plumbing...', type: 'voice' },
  { t: 3000, msg: 'Texting Atlas Home Services...', type: 'sms' },
  { t: 3600, msg: 'Calling SD Premier Plumbing...', type: 'voice' },
  { t: 4200, msg: 'Rodriguez Plumbing \u2014 quote received!', type: 'success' },
  { t: 5000, msg: "Texting Mike's Plumbing Co...", type: 'sms' },
  { t: 5800, msg: 'Submitting form on quickfixpros.com', type: 'web' },
  { t: 6600, msg: 'SD Premier \u2014 voicemail, sending SMS fallback', type: 'fallback' },
  { t: 7400, msg: 'Atlas Home Services \u2014 quote received!', type: 'success' },
  { t: 8400, msg: "Mike's Plumbing \u2014 declined (booked)", type: 'decline' },
  { t: 9400, msg: 'Texting Reliable Plumbing & Drain...', type: 'sms' },
  { t: 10200, msg: 'Calling ABC Plumbing...', type: 'voice' },
  { t: 11200, msg: 'Quick Fix Pros \u2014 quote received!', type: 'success' },
  { t: 12200, msg: '3 quotes ready!', type: 'done' },
];

const DIAG_MOCK_PROVIDERS = [
  { name: 'Rodriguez Plumbing', rating: 4.9, reviews: 214, quote: '$175', availability: 'Tomorrow 9\u201311 AM', channel: 'voice', note: 'Done hundreds of Moen cartridge swaps. Will bring the part.', distance: '4.2 mi', delay: 4500 },
  { name: 'Atlas Home Services', rating: 4.7, reviews: 89, quote: '$150\u2013200', availability: 'Wednesday afternoon', channel: 'sms', note: 'Can bring the part with me, 12 years experience', distance: '6.1 mi', delay: 8000 },
  { name: 'Quick Fix Pros', rating: 4.6, reviews: 156, quote: '$195', availability: 'Thursday 8\u201310 AM', channel: 'web', note: 'Licensed & insured, 15 years with Moen fixtures', distance: '3.8 mi', delay: 11500 },
];

interface DiagRealProvider {
  id: string;
  responseId: string;
  name: string;
  rating: number;
  reviews: number;
  quote: string;
  availability: string;
  channel: string;
  note: string;
  distance: string;
  googlePlaceId?: string | null;
}

function diagCleanPrice(price: string): string {
  let p = price.replace(/^\$+/, '$');
  const betweenMatch = p.match(/between\s+\$?(\d+(?:\.\d+)?)\s*(?:and|to)\s*\$?(\d+(?:\.\d+)?)/i);
  if (betweenMatch) return `$${betweenMatch[1]}-$${betweenMatch[2]}`;
  const rangeMatch = p.match(/^(\d+(?:\.\d+)?)\s*(?:to|-|\u2013)\s*(\d+(?:\.\d+)?)$/);
  if (rangeMatch) return `$${rangeMatch[1]}-$${rangeMatch[2]}`;
  const numMatch = p.match(/^(\d+(?:\.\d+)?)$/);
  if (numMatch) return `$${numMatch[1]}`;
  const approxMatch = p.match(/(?:about|around|charge|estimate)\s+\$?(\d+(?:\.\d+)?)/i);
  if (approxMatch && !/\$/.test(p)) return `~$${approxMatch[1]}`;
  const em = p.match(/(?:is|are|be|charge|cost|runs?|pay)\s+(?:about|around)?\s*\$?(\d+(?:\.\d+)?)/i);
  if (em) return `$${em[1]}`;
  return p;
}

interface DiagnosticOutreachModalProps {
  isOpen: boolean;
  onClose: (hasJob: boolean) => void;
  diagnosis: DiagnosisData | null;
  jobSummary: JobSummaryV2 | null;
  isDemo: boolean;
  initialCostEstimate: CostEstimate | null;
  initialJobId?: string | null;
}

function DiagnosticOutreachModal({ isOpen, onClose, diagnosis, jobSummary, isDemo, initialCostEstimate, initialJobId }: DiagnosticOutreachModalProps) {
  const navigate = useNavigate();
  const [step, setStep] = useState<'tier' | 'preferences' | 'auth_gate' | 'outreach'>(initialJobId ? 'outreach' : 'tier');
  const [tier, setTier] = useState<string | null>(null);
  const [zip, setZip] = useState('');
  const [timing, setTiming] = useState<string | null>(null);
  const [budget, setBudget] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(initialJobId ?? null);
  const [costEstimate, setCostEstimate] = useState<CostEstimate | null>(initialCostEstimate);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Outreach state
  const [log, setLog] = useState<typeof DIAG_OUTREACH_LOG>([]);
  const [providers, setProviders] = useState<(typeof DIAG_MOCK_PROVIDERS[number] | DiagRealProvider)[]>([]);
  const [outreachDone, setOutreachDone] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [booked, setBooked] = useState<(typeof DIAG_MOCK_PROVIDERS[number]) | null>(null);
  const [stats, setStats] = useState({ contacted: 0, responded: 0 });
  const [channels, setChannels] = useState({ voice: 0, sms: 0, web: 0 });
  const logRef = useRef<HTMLDivElement>(null);
  const fetchedResponses = useRef(0);

  const O = '#E8632B';
  const Gr = '#1B9E77';
  const Dk = '#2D2926';
  const Wm = '#F9F5F2';

  const category = diagnosis?.category ?? jobSummary?.category ?? 'general';
  const summaryText = diagnosis?.issue ?? jobSummary?.description ?? jobSummary?.title ?? 'Home repair';

  useEffect(() => {
    if (initialCostEstimate) setCostEstimate(initialCostEstimate);
  }, [initialCostEstimate]);

  useEffect(() => { fetchedResponses.current = 0; }, [jobId]);

  // Fetch cost estimate when entering outreach step if we don't have one
  useEffect(() => {
    if (step === 'outreach' && !costEstimate && category && zip) {
      const urgencyMap: Record<string, string> = { 'ASAP': 'asap', 'This week': 'this_week', 'This month': 'this_month', 'Flexible': 'flexible' };
      estimateService.generate({
        category,
        subcategory: category,
        zip_code: zip,
        urgency: urgencyMap[timing ?? ''] || 'flexible',
      }).then(res => { if (res.data) setCostEstimate(res.data); }).catch(() => {});
    }
  }, [step]);

  // Outreach WebSocket / demo effect
  useEffect(() => {
    if (step !== 'outreach') return;

    // Real outreach via WebSocket
    if (jobId && !isDemo) {
      setLog([{ t: 0, msg: 'Launching AI agent...', type: 'system' }]);

      const socket = connectJobSocket(jobId, (status: JobStatusResponse) => {
        setStats({ contacted: status.providers_contacted, responded: status.providers_responded });
        setChannels({
          voice: status.outreach_channels.voice.attempted,
          sms: status.outreach_channels.sms.attempted,
          web: status.outreach_channels.web.attempted,
        });

        const newLog: typeof DIAG_OUTREACH_LOG = [{ t: 0, msg: `Contacting ${status.providers_contacted} providers...`, type: 'system' }];
        if (status.outreach_channels.voice.attempted > 0) newLog.push({ t: 1, msg: `${status.outreach_channels.voice.attempted} voice calls`, type: 'voice' });
        if (status.outreach_channels.sms.attempted > 0) newLog.push({ t: 2, msg: `${status.outreach_channels.sms.attempted} SMS messages`, type: 'sms' });
        if (status.outreach_channels.web.attempted > 0) newLog.push({ t: 3, msg: `${status.outreach_channels.web.attempted} web contacts`, type: 'web' });
        if (status.providers_responded > 0) newLog.push({ t: 4, msg: `${status.providers_responded} quote(s) received!`, type: 'success' });
        if (['completed', 'expired'].includes(status.status)) {
          newLog.push({ t: 5, msg: status.providers_responded > 0 ? `${status.providers_responded} quotes ready!` : 'Outreach complete', type: 'done' });
          setOutreachDone(true);
        }
        setLog(newLog);

        if (status.providers_responded > 0) {
          void jobService.getResponses(jobId).then(res => {
            if (res.data?.responses) {
              setProviders(res.data.responses.map((r: ProviderResponseItem) => ({
                id: r.provider.id,
                responseId: r.id,
                name: r.provider.name,
                rating: parseFloat(r.provider.google_rating ?? '0'),
                reviews: r.provider.review_count,
                quote: diagCleanPrice(r.quoted_price ?? 'TBD'),
                availability: r.availability ?? 'To be confirmed',
                channel: r.channel,
                note: r.message ?? '',
                distance: '',
                googlePlaceId: r.provider.google_place_id,
              })));
            }
          });
        }
      });

      return () => socket.close();
    }

    // If authenticated but no jobId yet, wait
    if (!isDemo && authService.isAuthenticated()) {
      setLog([{ t: 0, msg: 'Setting up your search...', type: 'system' }]);
      return;
    }

    // Mock outreach for demo
    const timers = DIAG_OUTREACH_LOG.map((e) => setTimeout(() => {
      setLog(p => [...p, e]);
      if (['voice', 'sms', 'web'].includes(e.type)) setStats(s => ({ ...s, contacted: s.contacted + 1 }));
      if (e.type === 'success') setStats(s => ({ ...s, responded: s.responded + 1 }));
      if (e.type === 'done') setOutreachDone(true);
    }, e.t));
    const pt = DIAG_MOCK_PROVIDERS.map(p => setTimeout(() => setProviders(prev => [...prev, p]), p.delay));
    return () => { timers.forEach(clearTimeout); pt.forEach(clearTimeout); };
  }, [step, jobId, isDemo]);

  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [log]);

  const handleTierSelect = (t: typeof DIAG_TIERS[number]) => {
    setTier(t.id);
    setStep('preferences');
  };

  const handleLaunchAgent = async () => {
    if (!tier || !zip || !timing) return;
    setError(null);

    if (isDemo) {
      setStep('outreach');
      return;
    }

    if (!authService.isAuthenticated()) {
      setStep('auth_gate');
      return;
    }

    setLoading(true);

    // Generate cost estimate if we don't have one
    if (!costEstimate && category && zip) {
      const urgencyMap: Record<string, string> = { 'ASAP': 'asap', 'This week': 'this_week', 'This month': 'this_month', 'Flexible': 'flexible' };
      try {
        const estRes = await estimateService.generate({
          category,
          subcategory: category,
          zip_code: zip,
          urgency: urgencyMap[timing] || 'flexible',
        });
        if (estRes.data) setCostEstimate(estRes.data);
      } catch { /* ignore */ }
    }

    try {
      const severity = diagnosis?.severity ?? jobSummary?.severity_estimate ?? 'medium';
      const diagPayload: DiagnosisPayload = {
        category,
        severity: severity as DiagnosisPayload['severity'],
        summary: summaryText,
        recommendedActions: diagnosis?.steps ?? [],
      };

      const res = await jobService.createJob({
        diagnosis: diagPayload,
        timing: ({ 'ASAP': 'asap', 'This week': 'this_week', 'This month': 'this_month', 'Flexible': 'flexible' }[timing] ?? 'flexible') as 'asap' | 'this_week' | 'this_month' | 'flexible',
        budget: budget === 'Under $100' ? 'under_100' : budget === '$100-250' ? '100_250' : budget === '$250-500' ? '250_500' : budget === '$500+' ? '500_plus' : 'flexible',
        tier: tier as 'standard' | 'priority' | 'emergency',
        zipCode: zip,
      });

      if (!res.data) {
        setError('Something went wrong creating your job. Please try again.');
        setLoading(false);
        return;
      }

      // Try Stripe payment
      try {
        const payRes = await paymentService.createCheckout(res.data.id, '', '', '/chat');
        if (payRes.data?.checkout_url) {
          sessionStorage.setItem('homie_paid_chat', JSON.stringify({ jobId: res.data.id, tier }));
          window.location.href = payRes.data.checkout_url;
          return;
        }
      } catch { /* payment not configured — continue */ }

      // No checkout URL or payment not configured — launch outreach directly
      setJobId(res.data.id);
      setLoading(false);
      setStep('outreach');
    } catch (err) {
      setError(`Something went wrong: ${(err as Error).message || 'Unknown error'}. Please try again.`);
      setLoading(false);
    }
  };

  const handleSaveAndAuth = (path: string) => {
    sessionStorage.setItem('homie_pending_chat', JSON.stringify({
      category,
      summaryText,
      diagnosis,
      jobSummary,
      zip,
      timing,
      tier,
    }));
    navigate(path);
  };

  if (!isOpen) return null;

  const outreachStatusObj: OutreachStatus = {
    providers_contacted: stats.contacted,
    providers_responded: stats.responded,
    outreach_channels: {
      voice: { attempted: channels.voice, connected: 0 },
      sms: { attempted: channels.sms, connected: 0 },
      web: { attempted: channels.web, connected: 0 },
    },
    status: outreachDone ? 'completed' : 'dispatching',
  };
  const logEntries: LogEntry[] = log.map(e => ({ msg: e.msg, type: e.type as LogEntry['type'] }));
  const isPrefsValid = /^\d{5}$/.test(zip) && timing !== null && budget !== null;

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 100,
      background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={() => onClose(!!jobId)}>
      <div style={{
        background: 'white', borderRadius: 20, width: '100%', maxWidth: 520, maxHeight: '90vh',
        overflow: 'auto', padding: '28px 24px 24px', position: 'relative',
        animation: 'dcFadeSlide 0.3s ease', fontFamily: "'DM Sans', sans-serif",
      }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 style={{ fontSize: 20, fontWeight: 800, color: Dk, fontFamily: "'DM Sans', sans-serif", margin: 0 }}>
            {step === 'tier' ? 'Find a Pro' : step === 'preferences' ? 'Your Details' : step === 'auth_gate' ? 'Sign In to Continue' : 'Homie is on it'}
          </h3>
          <button onClick={() => onClose(!!jobId)} style={{
            width: 32, height: 32, borderRadius: '50%', background: Wm, border: 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, cursor: 'pointer', color: Dk,
          }}>{'\u2715'}</button>
        </div>

        {/* Diagnosis mini card */}
        {summaryText && step !== 'outreach' && (
          <div style={{
            background: Wm, borderRadius: 12, padding: '12px 16px', marginBottom: 20,
            border: `1px solid ${Dk}0D`, fontSize: 13, color: `${Dk}99`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 16 }}>{CAT_ICONS[category] ?? '\uD83D\uDEE0\uFE0F'}</span>
              <strong style={{ color: Dk }}>{jobSummary?.title ?? diagnosis?.issue ?? category}</strong>
            </div>
            <p style={{ fontSize: 12, color: `${Dk}66`, margin: 0, lineHeight: 1.5 }}>{summaryText.slice(0, 150)}{summaryText.length > 150 ? '...' : ''}</p>
          </div>
        )}

        {error && (
          <div style={{
            background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10,
            padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#DC2626',
          }}>{error}</div>
        )}

        {booked ? (
          /* Booking confirmation */
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <div style={{
              width: 56, height: 56, borderRadius: '50%', background: `${Gr}15`,
              display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px',
            }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={Gr} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4.5 12.75l6 6 9-13.5" /></svg>
            </div>
            <div style={{ fontFamily: "'Fraunces', serif", fontSize: 22, fontWeight: 700, color: Dk, marginBottom: 6 }}>You're all set!</div>
            <div style={{ fontSize: 14, color: '#6B6560', marginBottom: 16 }}>
              <strong style={{ color: Dk }}>{booked.name}</strong> has been booked. They'll be in touch to confirm details.
            </div>
            <div style={{ background: Wm, borderRadius: 12, padding: '12px 16px', textAlign: 'left', fontSize: 14, color: '#6B6560' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}><span>Quote</span><span style={{ fontWeight: 600, color: Dk }}>{booked.quote}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}><span>When</span><span style={{ fontWeight: 600, color: Dk }}>{booked.availability}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Rating</span><span style={{ fontWeight: 600, color: Dk }}>{'\u2B50'} {booked.rating}</span></div>
            </div>
            {isDemo && <div style={{ fontSize: 12, color: '#9B9490', marginTop: 12 }}>This is a demo — no actual booking was made</div>}
          </div>
        ) : (
          <>
            {/* TIER step */}
            {step === 'tier' && (
              <div>
                <p style={{ fontSize: 14, color: `${Dk}99`, marginBottom: 16, lineHeight: 1.6 }}>
                  Homie's AI agent will call, text, and search the web to find available pros in your area. Choose your speed:
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {DIAG_TIERS.map(t => (
                    <button key={t.id} onClick={() => handleTierSelect(t)} style={{
                      display: 'flex', alignItems: 'center', padding: '16px 18px', borderRadius: 14, cursor: 'pointer',
                      border: t.popular ? `2px solid ${O}` : '2px solid rgba(0,0,0,0.06)',
                      background: t.popular ? 'rgba(232,99,43,0.03)' : 'white',
                      textAlign: 'left', position: 'relative', transition: 'all 0.15s',
                    }}
                      onMouseEnter={e => { if (!t.popular) e.currentTarget.style.borderColor = 'rgba(0,0,0,0.15)'; }}
                      onMouseLeave={e => { if (!t.popular) e.currentTarget.style.borderColor = 'rgba(0,0,0,0.06)'; }}
                    >
                      {t.popular && <div style={{
                        position: 'absolute', top: -9, right: 14, background: O, color: 'white',
                        fontSize: 10, fontWeight: 700, padding: '2px 10px', borderRadius: 100,
                      }}>RECOMMENDED</div>}
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: 16, color: Dk }}>
                          {t.name} <span style={{ fontWeight: 400, color: '#9B9490', fontSize: 13 }}>{'\u00B7'} {t.time}</span>
                        </div>
                        <div style={{ fontSize: 13, color: '#9B9490', marginTop: 2 }}>{t.detail}</div>
                      </div>
                      <div style={{ fontFamily: "'Fraunces', serif", fontSize: 24, fontWeight: 700, color: t.popular ? O : Dk }}>{t.price}</div>
                    </button>
                  ))}
                </div>
                <div style={{ textAlign: 'center', marginTop: 14 }}>
                  <div style={{ fontSize: 13, color: Gr, fontWeight: 600 }}>{'\u2705'} Only charged if you receive quotes</div>
                  <div style={{ fontSize: 12, color: '#9B9490', marginTop: 2 }}>100% satisfaction guarantee — no quotes, no charge</div>
                  <div style={{ fontSize: 11, color: '#bbb', marginTop: 8, lineHeight: 1.5, maxWidth: 400, marginLeft: 'auto', marginRight: 'auto' }}>
                    By selecting a tier, you authorize Homie to contact service providers on your behalf via phone call, text message, and email to obtain quotes for your request.
                  </div>
                </div>
              </div>
            )}

            {/* PREFERENCES step */}
            {step === 'preferences' && (
              <div>
                <p style={{ fontSize: 14, color: `${Dk}99`, marginBottom: 16, lineHeight: 1.6 }}>
                  A few quick details so Homie can find the right pros:
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {/* Zip code */}
                  <div>
                    <label style={{ fontSize: 13, fontWeight: 700, color: Dk, display: 'block', marginBottom: 6 }}>Zip Code</label>
                    <input
                      value={zip}
                      onChange={e => setZip(e.target.value.replace(/\D/g, ''))}
                      placeholder="e.g. 92103"
                      maxLength={5}
                      inputMode="numeric"
                      style={{
                        width: '100%', padding: '12px 14px', borderRadius: 10, fontSize: 15,
                        border: '1.5px solid rgba(0,0,0,0.08)', outline: 'none', color: Dk,
                        fontFamily: "'DM Sans', sans-serif", background: Wm, boxSizing: 'border-box',
                      }}
                      onFocus={e => e.target.style.borderColor = `${O}50`}
                      onBlur={e => e.target.style.borderColor = 'rgba(0,0,0,0.08)'}
                    />
                  </div>
                  {/* Timing */}
                  <div>
                    <label style={{ fontSize: 13, fontWeight: 700, color: Dk, display: 'block', marginBottom: 6 }}>When do you need this done?</label>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                      {['ASAP', 'This week', 'This month', 'Flexible'].map(t => (
                        <button key={t} onClick={() => setTiming(t)} style={{
                          padding: '10px 12px', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                          border: timing === t ? `1.5px solid ${O}` : '1.5px solid rgba(0,0,0,0.08)',
                          background: timing === t ? `${O}0A` : 'white',
                          color: timing === t ? O : `${Dk}99`,
                          fontFamily: "'DM Sans', sans-serif", transition: 'all 0.15s',
                        }}>{t}</button>
                      ))}
                    </div>
                  </div>
                  {/* Budget */}
                  <div>
                    <label style={{ fontSize: 13, fontWeight: 700, color: Dk, display: 'block', marginBottom: 6 }}>Budget range</label>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                      {['Under $100', '$100-250', '$250-500', '$500+', 'Flexible'].map(b => (
                        <button key={b} onClick={() => setBudget(b)} style={{
                          padding: '10px 8px', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                          border: budget === b ? `1.5px solid ${O}` : '1.5px solid rgba(0,0,0,0.08)',
                          background: budget === b ? `${O}0A` : 'white',
                          color: budget === b ? O : `${Dk}99`,
                          fontFamily: "'DM Sans', sans-serif", transition: 'all 0.15s',
                        }}>{b}</button>
                      ))}
                    </div>
                  </div>
                </div>
                {/* Launch button */}
                <button onClick={() => { void handleLaunchAgent(); }} disabled={!isPrefsValid || loading} style={{
                  width: '100%', marginTop: 20, padding: '14px 0', borderRadius: 14, border: 'none',
                  fontSize: 15, fontWeight: 700, cursor: isPrefsValid && !loading ? 'pointer' : 'default',
                  background: isPrefsValid && !loading ? O : 'rgba(0,0,0,0.08)',
                  color: isPrefsValid && !loading ? 'white' : 'rgba(0,0,0,0.25)',
                  fontFamily: "'DM Sans', sans-serif", transition: 'all 0.2s',
                  boxShadow: isPrefsValid && !loading ? `0 4px 16px ${O}40` : 'none',
                }}>
                  {loading ? 'Creating job...' : `\uD83D\uDE80 Launch Homie Agent \u2014 ${tier === 'emergency' ? '$29.99' : tier === 'priority' ? '$19.99' : '$9.99'}`}
                </button>
                <button onClick={() => setStep('tier')} style={{
                  width: '100%', marginTop: 8, padding: '10px 0', border: 'none', background: 'none',
                  fontSize: 13, color: '#9B9490', cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
                }}>{'\u2190'} Back to pricing</button>
              </div>
            )}

            {/* AUTH GATE step */}
            {step === 'auth_gate' && (
              <div>
                <p style={{ fontSize: 14, color: `${Dk}99`, marginBottom: 16, lineHeight: 1.6 }}>
                  Almost there! You'll need to sign in so we can save your quotes and send you results.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <button onClick={() => handleSaveAndAuth('/login?redirect=/chat')} style={{
                    padding: '14px 0', borderRadius: 100, border: 'none', fontSize: 16, fontWeight: 600,
                    background: O, color: 'white', cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
                  }}>Sign in</button>
                  <button onClick={() => handleSaveAndAuth('/register?redirect=/chat')} style={{
                    padding: '14px 0', borderRadius: 100, border: `2px solid ${O}`, fontSize: 16, fontWeight: 600,
                    background: 'white', color: O, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
                  }}>Create account</button>
                </div>
                <button onClick={() => setStep('preferences')} style={{
                  width: '100%', marginTop: 12, padding: '10px 0', border: 'none', background: 'none',
                  fontSize: 13, color: '#9B9490', cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
                }}>{'\u2190'} Back</button>
              </div>
            )}

            {/* OUTREACH step */}
            {step === 'outreach' && (
              <>
                <div style={{ marginBottom: 16 }}>
                  <HomieOutreachLive
                    status={outreachStatusObj}
                    log={logEntries}
                    done={outreachDone}
                    showSafeNotice={!outreachDone}
                    accountLink="/account?tab=quotes"
                  />
                </div>

                {costEstimate && (
                  <div style={{ marginBottom: 12 }}>
                    <EstimateCard estimate={costEstimate} />
                  </div>
                )}

                {providers.map((p, i) => (
                  <div key={i} style={{ marginBottom: 10 }}>
                    <div onClick={() => setSelected(selected === i ? null : i)} style={{
                      background: 'white', borderRadius: 14, padding: '16px 18px', cursor: 'pointer',
                      border: selected === i ? `2px solid ${O}` : '1px solid rgba(0,0,0,0.06)',
                      boxShadow: selected === i ? `0 4px 20px ${O}18` : '0 1px 4px rgba(0,0,0,0.03)',
                      transition: 'all 0.2s',
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <div>
                          <span style={{ fontWeight: 700, fontSize: 16, color: Dk }}>{p.name}</span>
                          <span style={{ color: '#9B9490', fontSize: 13, marginLeft: 8 }}>{'\u2605'} {p.rating} ({p.reviews}){p.distance ? ` · ${p.distance}` : ''}</span>
                          {'googlePlaceId' in p && (p as DiagRealProvider).googlePlaceId && (
                            <a href={`https://www.google.com/maps/place/?q=place_id:${(p as DiagRealProvider).googlePlaceId}`} target="_blank" rel="noopener" onClick={e => e.stopPropagation()} style={{ fontSize: 11, color: '#2563EB', textDecoration: 'none', fontWeight: 600, marginLeft: 6 }}>Reviews</a>
                          )}
                        </div>
                        <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                          <span style={{ fontFamily: "'Fraunces', serif", fontSize: 24, fontWeight: 700, color: O }}>{p.quote}</span>
                          {costEstimate ? (
                            <EstimateBadge quotedPrice={p.quote} estimateLow={costEstimate.estimateLowCents} estimateHigh={costEstimate.estimateHighCents} />
                          ) : (
                            <div style={{ fontSize: 11, color: '#9B9490', fontWeight: 500 }}>quoted price</div>
                          )}
                        </div>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 14, color: Dk }}>{'\uD83D\uDCC5'} {p.availability}</span>
                        <span style={{ background: Wm, padding: '2px 10px', borderRadius: 100, fontSize: 11, color: '#9B9490' }}>via {p.channel}</span>
                      </div>
                      {p.note && <div style={{ fontSize: 13, color: '#6B6560', fontStyle: 'italic', marginTop: 6 }}>"{p.note}"</div>}
                      {selected === i && !booked && (
                        <div style={{ marginTop: 14 }} onClick={e => e.stopPropagation()}>
                          {!isDemo && (
                            <input
                              id={`diag-modal-addr-${i}`}
                              placeholder="Enter your service address"
                              onClick={e => e.stopPropagation()}
                              style={{
                                width: '100%', padding: '10px 14px', borderRadius: 10, fontSize: 14,
                                border: '2px solid rgba(0,0,0,0.08)', outline: 'none', color: Dk,
                                fontFamily: "'DM Sans', sans-serif", marginBottom: 8, boxSizing: 'border-box',
                              }}
                            />
                          )}
                          <button onClick={async () => {
                            if (isDemo) {
                              setBooked(p as unknown as typeof DIAG_MOCK_PROVIDERS[number]);
                              return;
                            }
                            const addrInput = document.getElementById(`diag-modal-addr-${i}`) as HTMLInputElement;
                            const address = addrInput?.value?.trim();
                            if (!address) { alert('Please enter your service address'); return; }
                            if (jobId && 'responseId' in p) {
                              try {
                                await jobService.bookProvider(jobId, (p as DiagRealProvider).responseId, (p as DiagRealProvider).id, address);
                                setBooked(p as unknown as typeof DIAG_MOCK_PROVIDERS[number]);
                              } catch (err) {
                                console.error('[DiagModal] Booking failed:', err);
                              }
                            }
                          }} style={{
                            width: '100%', padding: '13px 0', borderRadius: 100, border: 'none',
                            background: O, color: 'white', fontSize: 16, fontWeight: 600, cursor: 'pointer',
                            fontFamily: "'DM Sans', sans-serif", boxShadow: `0 4px 16px ${O}40`,
                          }}>Book {p.name.split(' ')[0]}</button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {outreachDone && providers.length > 0 && selected === null && !booked && (
                  <div style={{ textAlign: 'center', color: '#9B9490', fontSize: 14, marginTop: 8 }}>{'\u2191'} Tap a provider to book</div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
