import { useState, useEffect, useRef, useCallback } from 'react';
import { analyzeItem, chatItem, type StreamCallbacks } from '@/services/inspector-api';

const ACCENT = '#2563EB';

interface ItemDeepDiveProps {
  reportId: string;
  itemId: string;
  itemTitle: string;
}

export default function ItemDeepDive({ reportId, itemId, itemTitle }: ItemDeepDiveProps) {
  const [analysis, setAnalysis] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzed, setAnalyzed] = useState(false);
  const [chatMessages, setChatMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatStreaming, setChatStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // Auto-trigger analysis on mount
  useEffect(() => {
    if (analyzed || analyzing) return;
    setAnalyzing(true);
    setError(null);

    const callbacks: StreamCallbacks = {
      onToken: (token) => setAnalysis(prev => prev + token),
      onDone: () => { setAnalyzing(false); setAnalyzed(true); },
      onError: (err) => { setAnalyzing(false); setError(err.message); },
    };

    abortRef.current = analyzeItem(reportId, itemId, callbacks);

    return () => { abortRef.current?.abort(); };
  }, [reportId, itemId, analyzed, analyzing]);

  // Auto-scroll during streaming
  useEffect(() => {
    if (analyzing || chatStreaming) {
      contentRef.current?.scrollTo({ top: contentRef.current.scrollHeight });
    }
  }, [analysis, chatMessages, analyzing, chatStreaming]);

  const sendChat = useCallback(() => {
    if (!chatInput.trim() || chatStreaming) return;
    const userMsg = chatInput.trim();
    setChatInput('');

    // Build full conversation: analysis as first assistant message, then chat history
    const fullHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [
      { role: 'user', content: `Please analyze this inspection item for me.` },
      { role: 'assistant', content: analysis },
      ...chatMessages,
      { role: 'user', content: userMsg },
    ];

    setChatMessages(prev => [...prev, { role: 'user', content: userMsg }, { role: 'assistant', content: '' }]);
    setChatStreaming(true);

    const callbacks: StreamCallbacks = {
      onToken: (token) => {
        setChatMessages(prev => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last.role === 'assistant') last.content += token;
          return updated;
        });
      },
      onDone: () => setChatStreaming(false),
      onError: (err) => {
        setChatStreaming(false);
        setChatMessages(prev => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last.role === 'assistant' && !last.content) {
            updated[updated.length - 1] = { role: 'assistant', content: `Sorry, I couldn't respond: ${err.message}` };
          }
          return updated;
        });
      },
    };

    abortRef.current = chatItem(reportId, itemId, fullHistory, callbacks);
  }, [chatInput, chatStreaming, reportId, itemId, analysis, chatMessages]);

  return (
    <div style={{
      marginTop: 12, borderTop: '1px solid var(--bp-border)', paddingTop: 16,
    }}>
      {/* AI Analysis Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{
          fontFamily: "'DM Sans',sans-serif", fontSize: 10, fontWeight: 700,
          padding: '3px 8px', borderRadius: 6, background: `${ACCENT}15`, color: ACCENT,
          letterSpacing: '0.04em',
        }}>AI DEEP DIVE</span>
        {analyzing && (
          <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, color: 'var(--bp-subtle)' }}>
            Analyzing...
          </span>
        )}
      </div>

      {/* Error state */}
      {error && !analysis && (
        <div style={{
          padding: '12px 16px', borderRadius: 10, background: '#FEF2F2', border: '1px solid #FECACA',
          fontFamily: "'DM Sans',sans-serif", fontSize: 13, color: '#DC2626',
        }}>
          {error}
        </div>
      )}

      {/* Analysis content */}
      <div ref={contentRef} style={{ maxHeight: 500, overflowY: 'auto', paddingRight: 4 }}>
        {analysis && (
          <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 14, color: 'var(--bp-text)', lineHeight: 1.7 }}>
            <MarkdownLite text={analysis} />
            {analyzing && <TypingCursor />}
          </div>
        )}

        {!analysis && analyzing && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 0' }}>
            <LoadingDots />
            <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13, color: 'var(--bp-subtle)' }}>
              Analyzing "{itemTitle}"...
            </span>
          </div>
        )}

        {/* Chat messages */}
        {chatMessages.length > 0 && (
          <div style={{ marginTop: 16, borderTop: '1px solid var(--bp-border)', paddingTop: 12 }}>
            {chatMessages.map((msg, i) => (
              <div key={i} style={{
                marginBottom: 10,
                padding: '10px 14px', borderRadius: 12,
                background: msg.role === 'user' ? `${ACCENT}08` : 'var(--bp-bg)',
                border: `1px solid ${msg.role === 'user' ? `${ACCENT}20` : 'var(--bp-border)'}`,
              }}>
                <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, fontWeight: 600, color: msg.role === 'user' ? ACCENT : 'var(--bp-subtle)', marginBottom: 4 }}>
                  {msg.role === 'user' ? 'You' : 'AI Expert'}
                </div>
                <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13, color: 'var(--bp-text)', lineHeight: 1.6 }}>
                  {msg.role === 'assistant' ? (
                    <>
                      <MarkdownLite text={msg.content} />
                      {chatStreaming && i === chatMessages.length - 1 && !msg.content && <LoadingDots />}
                      {chatStreaming && i === chatMessages.length - 1 && msg.content && <TypingCursor />}
                    </>
                  ) : msg.content}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Follow-up chat input */}
      {analyzed && (
        <div style={{
          display: 'flex', gap: 8, marginTop: 12, alignItems: 'center',
        }}>
          <input
            value={chatInput}
            onChange={e => setChatInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); } }}
            placeholder="Ask a follow-up question..."
            disabled={chatStreaming}
            style={{
              flex: 1, padding: '10px 14px', borderRadius: 10,
              border: '1px solid var(--bp-border)', background: 'var(--bp-card)',
              color: 'var(--bp-text)', fontFamily: "'DM Sans',sans-serif", fontSize: 13,
              outline: 'none',
            }}
            onClick={e => e.stopPropagation()}
          />
          <button
            onClick={(e) => { e.stopPropagation(); sendChat(); }}
            disabled={chatStreaming || !chatInput.trim()}
            style={{
              padding: '10px 16px', borderRadius: 10, border: 'none',
              background: chatInput.trim() && !chatStreaming ? ACCENT : '#94A3B8',
              color: '#fff', cursor: chatInput.trim() && !chatStreaming ? 'pointer' : 'not-allowed',
              fontFamily: "'DM Sans',sans-serif", fontSize: 13, fontWeight: 600, flexShrink: 0,
            }}
          >
            {chatStreaming ? '...' : 'Ask'}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Markdown-lite renderer ──────────────────────────────────────────────────

function MarkdownLite({ text }: { text: string }) {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Bold headers: **text**
    if (line.startsWith('**') && line.endsWith('**')) {
      elements.push(
        <div key={i} style={{ fontWeight: 700, fontSize: 14, marginTop: i > 0 ? 14 : 0, marginBottom: 4, color: 'var(--bp-text)' }}>
          {line.slice(2, -2)}
        </div>
      );
      continue;
    }

    // Empty line = paragraph break
    if (!line.trim()) {
      elements.push(<div key={i} style={{ height: 6 }} />);
      continue;
    }

    // Inline bold within text
    const parts = line.split(/(\*\*[^*]+\*\*)/g);
    elements.push(
      <div key={i} style={{ marginBottom: 2 }}>
        {parts.map((part, j) => {
          if (part.startsWith('**') && part.endsWith('**')) {
            return <strong key={j}>{part.slice(2, -2)}</strong>;
          }
          return <span key={j}>{part}</span>;
        })}
      </div>
    );
  }

  return <>{elements}</>;
}

function TypingCursor() {
  return (
    <span style={{
      display: 'inline-block', width: 2, height: 16, background: ACCENT,
      marginLeft: 2, animation: 'blink 1s step-end infinite', verticalAlign: 'text-bottom',
    }}>
      <style>{`@keyframes blink { 50% { opacity: 0; } }`}</style>
    </span>
  );
}

function LoadingDots() {
  return (
    <span style={{ display: 'inline-flex', gap: 3 }}>
      {[0, 1, 2].map(i => (
        <span key={i} style={{
          width: 6, height: 6, borderRadius: '50%', background: ACCENT,
          animation: `dotPulse 1.2s ease-in-out ${i * 0.15}s infinite`,
        }} />
      ))}
      <style>{`@keyframes dotPulse { 0%,80%,100%{opacity:0.3} 40%{opacity:1} }`}</style>
    </span>
  );
}
