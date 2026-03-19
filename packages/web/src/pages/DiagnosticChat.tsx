import { useReducer, useRef, useEffect, useCallback } from 'react';
import HomieHeader from '@/components/HomieHeader';
import ChatBubble from '@/components/ChatBubble';
import DiagnosisCard from '@/components/DiagnosisCard';
import TierSelector from '@/components/TierSelector';
import OutreachProgress from '@/components/OutreachProgress';
import ProviderCard from '@/components/ProviderCard';
import ErrorState from '@/components/ErrorState';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import {
  mockStreamResponse,
  MOCK_DIAGNOSIS_CARD,
  simulateOutreach,
  type OutreachState,
  type MockProvider,
} from '@/mocks/diagnostic';
import type { DiagnosisPayload, JobTier, JobTiming } from '@/services/api';

// ── State ───────────────────────────────────────────────────────────────────

type MatchStep = 'tier' | 'preferences' | 'outreach' | 'results';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  hasDiagnosis?: boolean;
}

interface State {
  messages: ChatMessage[];
  streaming: boolean;
  streamingMessageId: string | null;
  diagnosis: DiagnosisPayload | null;
  jobSummary: { title: string; category: string; severity: string; estimatedCost: { min: number; max: number } } | null;
  showBanner: boolean;

  // Match flow
  matchFlowActive: boolean;
  matchStep: MatchStep;
  tier: JobTier;
  zipCode: string;
  timing: JobTiming;

  // Outreach
  outreach: OutreachState;
  expiresAt: string;

  // Results
  respondedProviders: MockProvider[];
  bookedProvider: MockProvider | null;

  // Error
  streamError: string | null;
}

const WELCOME: ChatMessage = {
  id: 'welcome',
  role: 'assistant',
  content:
    "Hey there! 👋 I'm Homie, your home's best friend. What's going on at your place? Describe the issue and I'll help you figure out what's happening.",
  timestamp: new Date(),
};

const initialState: State = {
  messages: [WELCOME],
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
  outreach: {
    providersContacted: 0,
    channels: {
      voice: { attempted: 0, responded: 0 },
      sms: { attempted: 0, responded: 0 },
      web: { attempted: 0, responded: 0 },
    },
    active: false,
    respondedProviders: [],
  },
  expiresAt: '',
  respondedProviders: [],
  bookedProvider: null,
  streamError: null,
};

type Action =
  | { type: 'ADD_USER_MESSAGE'; content: string }
  | { type: 'START_STREAMING'; messageId: string }
  | { type: 'APPEND_TOKEN'; token: string }
  | { type: 'FINISH_STREAMING' }
  | { type: 'SET_DIAGNOSIS'; diagnosis: DiagnosisPayload }
  | { type: 'SET_JOB_SUMMARY'; summary: State['jobSummary'] }
  | { type: 'OPEN_MATCH_FLOW' }
  | { type: 'SET_TIER'; tier: JobTier }
  | { type: 'SET_ZIP'; zip: string }
  | { type: 'SET_TIMING'; timing: JobTiming }
  | { type: 'SET_MATCH_STEP'; step: MatchStep }
  | { type: 'UPDATE_OUTREACH'; outreach: OutreachState }
  | { type: 'SET_EXPIRES'; expiresAt: string }
  | { type: 'BOOK_PROVIDER'; provider: MockProvider }
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
            ? { ...m, hasDiagnosis: state.diagnosis !== null }
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

    case 'SET_TIER':
      return { ...state, tier: action.tier };

    case 'SET_ZIP':
      return { ...state, zipCode: action.zip };

    case 'SET_TIMING':
      return { ...state, timing: action.timing };

    case 'SET_MATCH_STEP':
      return { ...state, matchStep: action.step };

    case 'UPDATE_OUTREACH':
      return {
        ...state,
        outreach: action.outreach,
        respondedProviders: action.outreach.respondedProviders,
        matchStep: !action.outreach.active && action.outreach.respondedProviders.length > 0 ? 'results' : state.matchStep,
      };

    case 'SET_EXPIRES':
      return { ...state, expiresAt: action.expiresAt };

    case 'BOOK_PROVIDER':
      return { ...state, bookedProvider: action.provider };

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

// ── Component ───────────────────────────────────────────────────────────────

export default function DiagnosticChat() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const matchFlowRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const cleanupOutreachRef = useRef<(() => void) | null>(null);

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

      abortRef.current = mockStreamResponse({
        onToken: (token) => dispatch({ type: 'APPEND_TOKEN', token }),
        onDiagnosis: (d) => dispatch({ type: 'SET_DIAGNOSIS', diagnosis: d }),
        onJobSummary: (s) => dispatch({ type: 'SET_JOB_SUMMARY', summary: s }),
        onDone: () => dispatch({ type: 'FINISH_STREAMING' }),
        onError: (err) => {
          console.error('[DiagnosticChat] stream error:', err);
          dispatch({ type: 'STREAM_ERROR', error: err.message || 'Failed to get a response. Please try again.' });
        },
      });
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

  function startOutreach() {
    const tierMinutes = state.tier === 'emergency' ? 15 : state.tier === 'priority' ? 30 : 120;
    const expiresAt = new Date(Date.now() + tierMinutes * 60 * 1000).toISOString();
    dispatch({ type: 'SET_EXPIRES', expiresAt });
    dispatch({ type: 'SET_MATCH_STEP', step: 'outreach' });

    cleanupOutreachRef.current = simulateOutreach(state.tier, (outreach) => {
      dispatch({ type: 'UPDATE_OUTREACH', outreach });
    });
  }

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen flex flex-col bg-warm">
      <HomieHeader />

      {/* Banner */}
      {state.showBanner && !state.matchFlowActive && (
        <div className="bg-dark text-white px-4 py-2.5 flex items-center justify-center gap-3 animate-fade-in">
          <span className="text-sm">Need help fast?</span>
          <button
            onClick={openMatchFlow}
            className="text-sm font-semibold text-orange-500 hover:text-orange-400 transition-colors"
          >
            Find a Homie Pro →
          </button>
          <button
            onClick={() => dispatch({ type: 'DISMISS_BANNER' })}
            className="ml-2 text-white/40 hover:text-white/70 transition-colors text-lg leading-none"
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      )}

      {/* Chat messages */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
          {state.messages.map((msg) => (
            <div key={msg.id}>
              <ChatBubble role={msg.role} content={msg.content} timestamp={msg.timestamp} />

              {/* Inline diagnosis card after the message that contained it */}
              {msg.hasDiagnosis && state.diagnosis && (
                <div className="mt-4 animate-fade-in">
                  <DiagnosisCard {...MOCK_DIAGNOSIS_CARD} onFindPro={openMatchFlow} />
                  <div className="flex flex-col sm:flex-row gap-3 mt-4">
                    <button className="flex-1 border-2 border-dark/20 text-dark font-semibold py-3 rounded-full hover:border-dark/40 transition-colors">
                      Try fixing it yourself
                    </button>
                    <button
                      onClick={openMatchFlow}
                      className="flex-1 bg-orange-500 hover:bg-orange-600 text-white font-semibold py-3 rounded-full transition-colors"
                    >
                      Find a Homie Pro
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* Streaming indicator */}
          {state.streaming && (
            <div className="flex items-center gap-1.5 pl-2 text-dark/30">
              <span className="w-1.5 h-1.5 bg-dark/30 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 bg-dark/30 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 bg-dark/30 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          )}

          {/* Stream error */}
          {state.streamError && (
            <div className="max-w-[85%] sm:max-w-[70%]">
              <ErrorState
                title="Couldn't get a response"
                message={state.streamError}
                onRetry={() => {
                  dispatch({ type: 'STREAM_ERROR', error: '' }); // clear, re-inlined to avoid exposing dispatch
                  // User can resend via the input
                }}
              />
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Match flow */}
        {state.matchFlowActive && (
          <div ref={matchFlowRef} className="border-t border-dark/10 bg-white">
            <div className="max-w-2xl mx-auto px-4 py-8">
              {state.bookedProvider ? (
                <BookingConfirmation provider={state.bookedProvider} />
              ) : (
                <>
                  {state.matchStep === 'tier' && (
                    <TierStep
                      tier={state.tier}
                      onSelect={(t) => dispatch({ type: 'SET_TIER', tier: t })}
                      onNext={() => dispatch({ type: 'SET_MATCH_STEP', step: 'preferences' })}
                    />
                  )}
                  {state.matchStep === 'preferences' && (
                    <PreferencesStep
                      zipCode={state.zipCode}
                      timing={state.timing}
                      summary={state.jobSummary}
                      onZipChange={(z) => dispatch({ type: 'SET_ZIP', zip: z })}
                      onTimingChange={(t) => dispatch({ type: 'SET_TIMING', timing: t })}
                      onBack={() => dispatch({ type: 'SET_MATCH_STEP', step: 'tier' })}
                      onSubmit={startOutreach}
                    />
                  )}
                  {state.matchStep === 'outreach' && (
                    <OutreachStep outreach={state.outreach} expiresAt={state.expiresAt} />
                  )}
                  {state.matchStep === 'results' && (
                    <ResultsStep
                      providers={state.respondedProviders}
                      onBook={(p) => dispatch({ type: 'BOOK_PROVIDER', provider: p })}
                    />
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Input area — hidden when match flow is active and past chat */}
      {!state.matchFlowActive && (
        <div className="sticky bottom-0 bg-white border-t border-dark/10">
          <div className="max-w-2xl mx-auto px-4 py-3 flex items-end gap-3">
            <label className="cursor-pointer text-dark/40 hover:text-dark/60 transition-colors shrink-0 pb-2">
              <input type="file" accept="image/*" multiple className="hidden" />
              <CameraIcon />
            </label>
            <textarea
              ref={textareaRef}
              rows={1}
              placeholder="Describe what's going on..."
              className="flex-1 resize-none bg-warm rounded-2xl px-4 py-2.5 text-sm text-dark placeholder:text-dark/30 focus:outline-none focus:ring-2 focus:ring-orange-500/30 max-h-40"
              onInput={handleTextareaInput}
              onKeyDown={handleKeyDown}
              disabled={state.streaming}
            />
            <button
              onClick={handleSend}
              disabled={state.streaming}
              className="shrink-0 w-10 h-10 flex items-center justify-center bg-orange-500 hover:bg-orange-600 disabled:bg-dark/20 text-white rounded-full transition-colors"
            >
              <SendIcon />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Match flow sub-components ───────────────────────────────────────────────

function TierStep({
  tier,
  onSelect,
  onNext,
}: {
  tier: JobTier;
  onSelect: (t: JobTier) => void;
  onNext: () => void;
}) {
  return (
    <div className="animate-fade-in">
      <h2 className="text-2xl font-bold text-center mb-2">Choose your plan</h2>
      <p className="text-dark/50 text-center text-sm mb-6">
        Pick the speed that works for you. Faster plans contact more providers.
      </p>
      <TierSelector selected={tier} onSelect={onSelect} />
      <button
        onClick={onNext}
        className="mt-6 w-full bg-orange-500 hover:bg-orange-600 text-white font-semibold py-3 rounded-full transition-colors"
      >
        Continue
      </button>
    </div>
  );
}

const TIMINGS: { value: JobTiming; label: string }[] = [
  { value: 'asap', label: 'ASAP' },
  { value: 'this_week', label: 'This week' },
  { value: 'this_month', label: 'This month' },
  { value: 'flexible', label: 'Flexible' },
];

function PreferencesStep({
  zipCode,
  timing,
  summary,
  onZipChange,
  onTimingChange,
  onBack,
  onSubmit,
}: {
  zipCode: string;
  timing: JobTiming;
  summary: State['jobSummary'];
  onZipChange: (z: string) => void;
  onTimingChange: (t: JobTiming) => void;
  onBack: () => void;
  onSubmit: () => void;
}) {
  const isValid = /^\d{5}$/.test(zipCode);

  return (
    <div className="animate-fade-in">
      <h2 className="text-2xl font-bold text-center mb-6">A few quick details</h2>

      {summary && (
        <div className="bg-warm rounded-xl p-4 mb-6">
          <p className="text-sm font-semibold text-dark">{summary.title}</p>
          <p className="text-xs text-dark/50 mt-1">
            {summary.category} · {summary.severity} severity · est. ${summary.estimatedCost.min}–${summary.estimatedCost.max}
          </p>
        </div>
      )}

      <div className="space-y-5">
        <div>
          <label className="block text-sm font-semibold text-dark mb-2">Your zip code</label>
          <input
            type="text"
            inputMode="numeric"
            maxLength={5}
            value={zipCode}
            onChange={(e) => onZipChange(e.target.value.replace(/\D/g, ''))}
            placeholder="e.g. 90210"
            className="w-full bg-warm rounded-xl px-4 py-3 text-sm text-dark placeholder:text-dark/30 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-dark mb-2">When do you need this done?</label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {TIMINGS.map((t) => (
              <button
                key={t.value}
                onClick={() => onTimingChange(t.value)}
                className={`rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${
                  timing === t.value
                    ? 'bg-orange-500 text-white'
                    : 'bg-warm text-dark/70 hover:bg-dark/5'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex gap-3 mt-8">
        <button
          onClick={onBack}
          className="flex-1 border-2 border-dark/15 text-dark font-semibold py-3 rounded-full hover:border-dark/30 transition-colors"
        >
          Back
        </button>
        <button
          onClick={onSubmit}
          disabled={!isValid}
          className="flex-1 bg-orange-500 hover:bg-orange-600 disabled:bg-dark/20 text-white font-semibold py-3 rounded-full transition-colors"
        >
          Find providers
        </button>
      </div>
    </div>
  );
}

function OutreachStep({
  outreach,
  expiresAt,
}: {
  outreach: OutreachState;
  expiresAt: string;
}) {
  return (
    <div className="animate-fade-in">
      <h2 className="text-2xl font-bold text-center mb-2">Finding your pros</h2>
      <p className="text-dark/50 text-center text-sm mb-6">
        Sit tight — we're reaching out to top-rated providers in your area.
      </p>
      <OutreachProgress
        providersContacted={outreach.providersContacted}
        channels={outreach.channels}
        active={outreach.active}
        expiresAt={expiresAt}
      />
    </div>
  );
}

function ResultsStep({
  providers,
  onBook,
}: {
  providers: MockProvider[];
  onBook: (p: MockProvider) => void;
}) {
  if (providers.length === 0) {
    return (
      <div className="animate-fade-in text-center py-8">
        <p className="text-5xl mb-4">😔</p>
        <h2 className="text-2xl font-bold mb-2">No responses yet</h2>
        <p className="text-dark/50 text-sm mb-6 max-w-sm mx-auto">
          We weren't able to reach providers in time. Here are your options:
        </p>
        <div className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
          <button className="flex-1 border-2 border-dark/15 text-dark font-semibold py-3 rounded-full hover:border-dark/30 transition-colors">
            Extend search
          </button>
          <button className="flex-1 bg-orange-500 hover:bg-orange-600 text-white font-semibold py-3 rounded-full transition-colors">
            Upgrade tier
          </button>
          <button className="flex-1 border-2 border-dark/15 text-dark/60 font-semibold py-3 rounded-full hover:border-dark/30 transition-colors">
            Get a refund
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <h2 className="text-2xl font-bold text-center mb-2">Your matches are in!</h2>
      <p className="text-dark/50 text-center text-sm mb-6">
        {providers.length} provider{providers.length !== 1 ? 's' : ''} responded. Pick the one that works best for you.
      </p>
      <div className="space-y-4">
        {providers.map((p) => (
          <ProviderCard
            key={p.id}
            name={p.name}
            googleRating={p.googleRating}
            reviewCount={p.reviewCount}
            quotedPrice={p.quotedPrice}
            availability={p.availability}
            message={p.message}
            channel={p.channel}
            onBook={() => onBook(p)}
          />
        ))}
      </div>
    </div>
  );
}

function BookingConfirmation({ provider }: { provider: MockProvider }) {
  return (
    <div className="animate-fade-in text-center py-8">
      <div className="w-16 h-16 bg-green-500/15 rounded-full flex items-center justify-center mx-auto mb-4">
        <svg className="w-8 h-8 text-green-500" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
        </svg>
      </div>
      <h2 className="text-2xl font-bold mb-2">You're all set!</h2>
      <p className="text-dark/50 text-sm mb-6 max-w-sm mx-auto">
        <strong className="text-dark">{provider.name}</strong> has been booked.
        They'll be in touch to confirm the details.
      </p>
      <div className="bg-warm rounded-xl p-4 max-w-sm mx-auto text-left space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-dark/50">Quote</span>
          <span className="font-semibold">${provider.quotedPrice}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-dark/50">When</span>
          <span className="font-semibold">{provider.availability}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-dark/50">Rating</span>
          <span className="font-semibold">⭐ {provider.googleRating}</span>
        </div>
      </div>
    </div>
  );
}

// ── Icons ───────────────────────────────────────────────────────────────────

function CameraIcon() {
  return (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.04l-.821 1.315z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
    </svg>
  );
}
