import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { SupportProduct } from '@/content/support-articles';

const ACCENT = '#E8632B';
const DARK = '#2D2926';
const MUTED = '#6B6560';
const LINE = '#E9E3DD';

interface ChatContext {
  /** Where the widget is mounted — used to ground the AI's context. */
  surface: 'support' | 'inspect-portal' | 'business';
  /** Optional product hint when the user is on a product-specific page. */
  product?: SupportProduct;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Floating chat widget — bubble in the bottom-right corner that expands
 * into a side panel. Streams answers from `/api/v1/support/chat`, which
 * grounds them in the support knowledge base via Anthropic prompt caching.
 *
 * Mounted on /support, /inspect-portal, and /business. The `surface` prop
 * goes to the backend so the AI can be slightly more concise on the
 * portals (where the user is mid-task) vs the support page (where they
 * came specifically to read).
 */
export default function SupportChatWidget({ context }: { context: ChatContext }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Auto-scroll to bottom on new tokens
  useEffect(() => {
    if (open && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, open, streaming]);

  // Welcome message on first open
  useEffect(() => {
    if (open && messages.length === 0) {
      setMessages([{
        role: 'assistant',
        content: greeting(context),
      }]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Cleanup any in-flight stream on unmount
  useEffect(() => () => abortRef.current?.abort(), []);

  async function sendMessage() {
    const text = input.trim();
    if (!text || streaming) return;
    setInput('');
    setError(null);

    const next: Message[] = [...messages, { role: 'user', content: text }, { role: 'assistant', content: '' }];
    setMessages(next);
    setStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const apiBase = (import.meta.env.VITE_API_URL ?? 'http://localhost:3001') as string;
      const res = await fetch(`${apiBase}/api/v1/support/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify({
          messages: next.slice(0, -1).map((m) => ({ role: m.role, content: m.content })),
          surface: context.surface,
          product: context.product ?? null,
        }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        throw new Error(`Chat failed (${res.status})`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        // Parse SSE: lines starting with "data: " — JSON-encoded token strings.
        let nlIdx;
        while ((nlIdx = buf.indexOf('\n\n')) !== -1) {
          const event = buf.slice(0, nlIdx);
          buf = buf.slice(nlIdx + 2);
          for (const line of event.split('\n')) {
            if (!line.startsWith('data:')) continue;
            const payload = line.slice(5).trim();
            if (!payload || payload === '[DONE]') continue;
            try {
              const parsed = JSON.parse(payload) as { token?: string; error?: string };
              if (parsed.error) {
                setError(parsed.error);
                continue;
              }
              if (parsed.token) {
                setMessages((prev) => {
                  const last = prev[prev.length - 1];
                  if (last?.role !== 'assistant') return prev;
                  const updated = [...prev];
                  updated[updated.length - 1] = { ...last, content: last.content + parsed.token };
                  return updated;
                });
              }
            } catch {
              // ignore malformed events
            }
          }
        }
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      setError((err as Error).message || 'Chat failed');
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === 'assistant' && !last.content) {
          return [...prev.slice(0, -1), { role: 'assistant', content: 'Sorry, something went wrong. Try again — or use the Contact button to email us.' }];
        }
        return prev;
      });
    }
    setStreaming(false);
    abortRef.current = null;
  }

  function reset() {
    abortRef.current?.abort();
    setMessages([{ role: 'assistant', content: greeting(context) }]);
    setError(null);
    setStreaming(false);
  }

  return (
    <>
      {/* Floating bubble */}
      {!open && (
        <button onClick={() => setOpen(true)} aria-label="Open Homie support chat" style={bubbleStyle}>
          <span style={{ fontSize: 22 }}>💬</span>
        </button>
      )}

      {/* Side panel */}
      {open && (
        <div style={panelStyle}>
          <div style={panelHeader}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 22 }}>🤖</span>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: DARK, fontFamily: "'DM Sans', sans-serif" }}>Ask Homie</div>
                <div style={{ fontSize: 11, color: MUTED, fontFamily: "'DM Sans', sans-serif" }}>Answers grounded in our help docs</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={reset} title="Start over" style={iconBtn}>↺</button>
              <button onClick={() => setOpen(false)} title="Close" style={iconBtn}>✕</button>
            </div>
          </div>

          <div ref={scrollRef} style={panelBody}>
            {messages.map((m, i) => (
              <MessageBubble key={i} message={m} streaming={streaming && i === messages.length - 1} />
            ))}
            {error && (
              <div style={{ padding: '10px 14px', background: '#FEE2E2', color: '#991B1B', borderRadius: 10, fontSize: 13, marginTop: 6 }}>
                {error}
              </div>
            )}
          </div>

          <form onSubmit={(e) => { e.preventDefault(); void sendMessage(); }} style={panelFooter}>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask anything…"
              disabled={streaming}
              style={inputStyle}
            />
            <button type="submit" disabled={streaming || !input.trim()} style={{
              ...sendBtn,
              opacity: streaming || !input.trim() ? 0.5 : 1,
              cursor: streaming || !input.trim() ? 'not-allowed' : 'pointer',
            }}>
              {streaming ? '…' : '↑'}
            </button>
          </form>

          <div style={{ padding: '0 16px 12px', fontSize: 10.5, color: MUTED, fontFamily: "'DM Sans', sans-serif", textAlign: 'center', lineHeight: 1.4 }}>
            AI answers are grounded in our help docs but can be wrong — for anything urgent, email yo@homiepro.ai.
          </div>
        </div>
      )}
    </>
  );
}

function MessageBubble({ message, streaming }: { message: Message; streaming: boolean }) {
  const isUser = message.role === 'user';
  return (
    <div style={{
      display: 'flex',
      justifyContent: isUser ? 'flex-end' : 'flex-start',
      marginBottom: 10,
    }}>
      <div style={{
        maxWidth: '85%',
        padding: '10px 14px',
        borderRadius: 12,
        background: isUser ? ACCENT : '#F5F0EB',
        color: isUser ? '#fff' : DARK,
        fontSize: 14,
        lineHeight: 1.55,
        fontFamily: "'DM Sans', sans-serif",
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
      }}>
        {message.content}
        {streaming && message.content && (
          <span style={{ display: 'inline-block', width: 2, height: 14, background: ACCENT, marginLeft: 2, animation: 'blink 1s step-end infinite', verticalAlign: 'text-bottom' }}>
            <style>{`@keyframes blink { 50% { opacity: 0; } }`}</style>
          </span>
        )}
        {streaming && !message.content && (
          <span style={{ color: MUTED, fontStyle: 'italic' }}>thinking…</span>
        )}
      </div>
    </div>
  );
}

function greeting(context: ChatContext): string {
  if (context.surface === 'inspect-portal') {
    return "Hey! I'm Homie's support AI. I know everything about Homie Inspect — claiming reports, tier features, AI Deep Dive, repair requests, all of it. Ask me anything.";
  }
  if (context.surface === 'business') {
    return "Hey! I'm Homie's support AI. I know all about Homie Business — workspaces, properties, dispatching, vendor scorecards. What's up?";
  }
  return "Hey! I'm Homie's support AI. I cover all three Homie products: Homie (consumer quotes), Homie Inspect (inspection reports), and Homie Business (property management). What can I help with?";
}

// ───────────────────────────────────────────────────────────────────────────
// Styles
// ───────────────────────────────────────────────────────────────────────────

const bubbleStyle: CSSProperties = {
  position: 'fixed',
  bottom: 'max(20px, env(safe-area-inset-bottom))',
  right: 20,
  width: 56, height: 56, borderRadius: '50%',
  background: ACCENT, color: '#fff',
  border: 'none', cursor: 'pointer',
  boxShadow: '0 8px 24px rgba(232,99,43,0.4)',
  zIndex: 9999,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  transition: 'transform 0.15s',
};

const panelStyle: CSSProperties = {
  position: 'fixed',
  bottom: 'max(20px, env(safe-area-inset-bottom))',
  right: 20,
  width: 380, maxWidth: 'calc(100vw - 32px)',
  height: 580, maxHeight: 'calc(100vh - 40px)',
  background: '#fff', borderRadius: 16,
  boxShadow: '0 20px 60px rgba(0,0,0,0.18)',
  border: `1px solid ${LINE}`,
  zIndex: 9999,
  display: 'flex', flexDirection: 'column',
  overflow: 'hidden',
};

const panelHeader: CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  padding: '14px 16px', borderBottom: `1px solid ${LINE}`,
  flexShrink: 0,
};

const panelBody: CSSProperties = {
  flex: 1, overflowY: 'auto', padding: 16,
};

const panelFooter: CSSProperties = {
  display: 'flex', gap: 8, padding: '12px 16px 8px', borderTop: `1px solid ${LINE}`,
  flexShrink: 0,
};

const inputStyle: CSSProperties = {
  flex: 1, padding: '10px 14px', fontSize: 14,
  border: `1px solid ${LINE}`, borderRadius: 100,
  outline: 'none', fontFamily: "'DM Sans', sans-serif", color: DARK, background: '#fff',
};

const sendBtn: CSSProperties = {
  width: 38, height: 38, borderRadius: '50%',
  background: ACCENT, color: '#fff', border: 'none',
  fontSize: 16, fontWeight: 700, fontFamily: "'DM Sans', sans-serif",
  flexShrink: 0,
};

const iconBtn: CSSProperties = {
  width: 28, height: 28, borderRadius: 6, border: 'none', background: 'transparent',
  color: MUTED, cursor: 'pointer', fontSize: 16, fontFamily: "'DM Sans', sans-serif",
};
