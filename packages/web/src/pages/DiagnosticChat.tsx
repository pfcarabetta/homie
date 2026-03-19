import { useReducer, useRef, useEffect, useCallback, useState } from 'react';
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

const SUGGESTED_PROMPTS = [
  { icon: '🚿', text: 'My faucet is leaking' },
  { icon: '❄️', text: "AC isn't cooling properly" },
  { icon: '💡', text: 'Light switch feels warm' },
  { icon: '🚽', text: 'Toilet keeps running' },
];

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
  | { type: 'DISMISS_BANNER' }
  | { type: 'STREAM_ERROR'; error: string };

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

    case 'OPEN_MATCH_FLOW':
      return { ...state, matchFlowActive: true, matchStep: 'tier', showBanner: false };

    case 'CLOSE_MATCH_FLOW':
      return { ...state, matchFlowActive: false };

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
  const [state, dispatch] = useReducer(reducer, initialState);
  // useAuth() ensures AuthProvider context is available
  useAuth();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const matchFlowRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const cleanupOutreachRef = useRef<(() => void) | null>(null);
  const sessionIdRef = useRef(crypto.randomUUID());

  useDocumentTitle('Diagnostic Chat');

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [state.messages]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      cleanupOutreachRef.current?.();
    };
  }, []);

  const sendMessage = useCallback(
    (text: string) => {
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

      // Use real API when authenticated, fall back to mock for demo
      if (authService.isAuthenticated()) {
        // Build conversation history from prior messages (exclude the welcome message and the empty streaming message we just added)
        const history = state.messages
          .filter((m) => m.id !== 'welcome' && m.content.length > 0)
          .map((m) => ({ role: m.role, content: m.content }));

        abortRef.current = diagnosticService.sendMessage(
          sessionIdRef.current,
          text.trim(),
          callbacks,
          undefined,
          history,
        );
      } else {
        abortRef.current = mockStreamResponse(callbacks);
      }
    },
    [state.streaming],
  );

  const handleSend = useCallback(() => {
    const text = textareaRef.current?.value ?? '';
    if (!text.trim()) return;
    sendMessage(text);
    if (textareaRef.current) textareaRef.current.value = '';
    resetTextareaHeight();
  }, [sendMessage]);

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
    // If authenticated and we have enough info, persist the job to the DB
    if (authService.isAuthenticated() && (state.diagnosis || state.jobSummary)) {
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

        await jobService.createJob({
          diagnosis: diagPayload,
          timing: state.timing,
          budget,
          tier: state.tier,
          zipCode: state.zipCode,
        });
      } catch {
        // Job creation failed — continue with mock anyway for demo purposes
      }

      dispatch({ type: 'MATCH_FLOW_LOADING', loading: false });
    }

    // Use mock outreach simulation (no real providers in DB yet)
    // Real provider outreach will replace this once providers are seeded
    runMockOutreach();
  }

  // NOTE: WebSocket/polling (connectJobSocket, pollJobStatus, fetchResults) removed temporarily.
  // Mock outreach is used until real providers are seeded in the database.
  // The wiring code is preserved in git history and in src/services/api.ts.

  async function handleBook(provider: MatchedProvider) {
    if (!state.jobId) return;

    // Mock mode — book instantly
    if (!authService.isAuthenticated()) {
      dispatch({ type: 'BOOK_PROVIDER', provider });
      return;
    }

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

  const [imgPreview, setImgPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

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

  return (
    <div className="min-h-screen flex flex-col bg-warm overflow-hidden" style={{ height: '100vh' }}>
      {/* Header */}
      <div className="bg-white border-b border-dark/10 px-4 shrink-0">
        <div className="max-w-2xl mx-auto h-16 flex items-center gap-3">
          <button onClick={() => dispatch({ type: 'CLOSE_MATCH_FLOW' })} className="flex items-center gap-3 flex-1 min-w-0 hover:opacity-80 transition-opacity">
            <HomieLogo size={40} />
            <div className="text-left">
              <div className="text-lg font-display font-black text-dark tracking-tight">Homie</div>
              <div className="text-[11px] text-dark/40 font-semibold uppercase tracking-wider">Your home's best friend</div>
            </div>
          </button>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_0_3px] shadow-green-500/15" />
              <span className="text-xs text-green-600 font-semibold">Online</span>
            </div>
            {authService.isAuthenticated() ? (
              <button onClick={() => { authService.logout(); window.location.reload(); }} className="text-xs text-dark/40 hover:text-dark transition-colors">
                Sign out
              </button>
            ) : (
              <a href="/login" className="bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold px-4 py-1.5 rounded-full transition-colors">
                Sign in
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 py-5 flex flex-col gap-4" style={{ minHeight: isEmpty ? '100%' : undefined }}>
          {/* Welcome screen */}
          {isEmpty && (
            <div className="flex-1 flex flex-col items-center justify-center text-center px-4">
              <HomieLogo size={80} />
              <h1 className="text-[30px] font-display font-black text-dark mt-5 mb-1 tracking-tight">Hey, I'm Homie</h1>
              <p className="text-base text-dark/50 font-medium mb-2">Your home's best friend 🏠</p>
              <p className="text-sm text-dark/40 max-w-[340px] leading-relaxed mb-8">
                Tell me what's going on or snap a photo — I'll figure out the issue and help you fix it or find the right pro.
              </p>
              <div className="grid grid-cols-2 gap-2.5 w-full max-w-[360px]">
                {SUGGESTED_PROMPTS.map((p) => (
                  <button
                    key={p.text}
                    onClick={() => sendMessage(p.text)}
                    className="bg-white border border-dark/10 rounded-xl px-4 py-3 text-left flex items-center gap-2 hover:border-orange-500 hover:bg-orange-500/[0.03] transition-all"
                  >
                    <span className="text-xl">{p.icon}</span>
                    <span className="text-[13px] font-semibold text-dark">{p.text}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Chat messages */}
          {state.messages.map((msg) => {
            // Hide the empty streaming message — the typing indicator shows instead
            if (msg.id === state.streamingMessageId && msg.content.length === 0) return null;
            const isUser = msg.role === 'user';
            return (
              <div key={msg.id} className={`flex ${isUser ? 'flex-row-reverse' : 'flex-row'} items-start gap-2.5 max-w-[85%] ${isUser ? 'self-end' : 'self-start'} animate-fade-in`}>
                {!isUser && <HomieAvatar />}
                <div className="min-w-0">
                  {/* Image */}
                  {msg.image && (
                    <div className={`mb-2 rounded-2xl overflow-hidden max-w-[240px] border border-dark/10 ${isUser ? 'ml-auto' : ''}`}>
                      <img src={msg.image} alt="Uploaded" className="w-full block" />
                    </div>
                  )}
                  {/* Text bubble */}
                  {msg.content && (
                    <div
                      className={`rounded-2xl px-[18px] py-3.5 text-[14.5px] leading-relaxed whitespace-pre-wrap ${
                        isUser
                          ? 'bg-gradient-to-br from-orange-500 to-orange-600 text-white rounded-br-sm shadow-md shadow-orange-500/20'
                          : 'bg-white text-dark border border-dark/10 rounded-bl-sm'
                      }`}
                      dangerouslySetInnerHTML={{
                        __html: msg.content
                          .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
                          .replace(/\*(.+?)\*/g, '<em>$1</em>')
                          .replace(/`(.+?)`/g, '<code class="bg-dark/10 px-1 rounded text-sm">$1</code>'),
                      }}
                    />
                  )}
                  {/* Diagnosis card */}
                  {msg.diagnosis && (
                    <DiagnosisCard diagnosis={msg.diagnosis} onFindPro={openMatchFlow} />
                  )}
                  {/* Job summary card (early match) */}
                  {!msg.diagnosis && msg.jobSummary && (
                    <EarlyMatchCard summary={msg.jobSummary} onRequestPro={openMatchFlow} />
                  )}
                </div>
              </div>
            );
          })}

          {/* Typing indicator — only show before first token arrives */}
          {state.streaming && !state.messages.some((m) => m.id === state.streamingMessageId && m.content.length > 0) && (
            <div className="flex items-center gap-2.5">
              <HomieAvatar />
              <div className="bg-white rounded-2xl rounded-bl-sm px-5 py-3.5 border border-dark/10 flex gap-1.5 items-center">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="w-[7px] h-[7px] rounded-full bg-orange-500 opacity-50 animate-bounce" style={{ animationDelay: `${i * 150}ms` }} />
                ))}
              </div>
            </div>
          )}

          {/* Stream error */}
          {state.streamError && (
            <div className="max-w-[85%]">
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
        />
      )}

      {/* Image preview strip */}
      {imgPreview && (
        <div className="bg-white border-t border-dark/5 px-5 py-2 flex items-center gap-2.5 shrink-0">
          <div className="relative">
            <img src={imgPreview} alt="Preview" className="h-14 rounded-lg border border-dark/10" />
            <button onClick={removeImg} className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-dark text-white text-[11px] border-2 border-white flex items-center justify-center leading-none">✕</button>
          </div>
          <span className="text-xs text-dark/40">Image attached</span>
        </div>
      )}

      {/* Input */}
      <div className="bg-white border-t border-dark/10 px-4 pb-5 pt-3 shrink-0">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-end gap-2 bg-warm rounded-2xl px-4 py-1.5 border border-dark/10 focus-within:border-orange-500/30 transition-colors">
            <input type="file" ref={fileRef} onChange={onImgUpload} accept="image/*" className="hidden" />
            <button onClick={() => fileRef.current?.click()} className="text-xl text-dark/40 hover:text-orange-500 transition-colors py-2 shrink-0">📷</button>
            <textarea
              ref={textareaRef}
              rows={1}
              placeholder="Hey Homie, what's wrong with my..."
              className="flex-1 bg-transparent border-none outline-none resize-none text-[15px] text-dark placeholder:text-dark/30 py-2 leading-relaxed max-h-[120px]"
              onInput={handleTextareaInput}
              onKeyDown={handleKeyDown}
              disabled={state.streaming}
            />
            <button
              onClick={handleSend}
              disabled={state.streaming}
              className="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center bg-gradient-to-br from-orange-500 to-orange-600 disabled:from-dark/15 disabled:to-dark/15 text-white text-lg transition-all"
            >
              ↑
            </button>
          </div>
          <p className="text-center text-[11px] text-dark/20 mt-2">
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
}: {
  state: State;
  dispatch: React.Dispatch<Action>;
  startOutreach: () => void;
  handleBook: (p: MatchedProvider) => void;
  onClose: () => void;
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
          <BookingConfirmation provider={state.bookedProvider} />
        ) : (
          <>
            {state.matchStep === 'tier' && <TierStep state={state} dispatch={dispatch} />}
            {state.matchStep === 'preferences' && <PreferencesStep state={state} dispatch={dispatch} startOutreach={startOutreach} />}
            {state.matchStep === 'outreach' && (
              <OutreachProgress providersContacted={state.outreach.providersContacted} channels={state.outreach.channels} active={state.outreach.active} expiresAt={state.expiresAt} />
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
    { id: 'standard' as JobTier, name: 'Standard', price: '$9.99', icon: '📱', desc: 'Homie contacts 5-8 local pros via text & web', time: 'Results in ~2 hours', providers: '5-8 pros contacted' },
    { id: 'priority' as JobTier, name: 'Priority', price: '$19.99', icon: '⚡', desc: 'Homie calls & texts 10+ pros simultaneously', time: 'Results in ~30 min', providers: '10+ pros contacted', popular: true },
    { id: 'emergency' as JobTier, name: 'Emergency', price: '$29.99', icon: '🚨', desc: 'Homie blitzes every available pro for same-day service', time: 'Results in ~15 min', providers: '15+ pros contacted' },
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
      <p className="text-center text-xs text-dark/40 mt-3.5">💳 You're only charged once results are delivered</p>
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

function BookingConfirmation({ provider }: { provider: MatchedProvider }) {
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
    </div>
  );
}
