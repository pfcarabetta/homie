import { useEffect, useRef, useState } from 'react';
import { businessService, BookingMessage, WorkspaceBooking } from '@/services/api';

const O = '#E8632B';
const D = '#2D2926';
const W = '#F9F5F2';
const G = '#1B9E77';

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function initials(name: string): string {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

function AICostBadge({ diagnosis }: { diagnosis: WorkspaceBooking['diagnosis'] }) {
  const cost = diagnosis?.estimatedCost;
  if (!cost) return null;
  const label = `$${cost.min.toLocaleString()}–$${cost.max.toLocaleString()}`;
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      background: 'linear-gradient(135deg, #FFF7F0 0%, #FFF0E5 100%)',
      border: `1px solid ${O}30`, borderRadius: 20,
      padding: '4px 10px', fontSize: 11, fontWeight: 600, color: O,
    }}>
      <span style={{ fontSize: 13 }}>🤖</span>
      AI Estimate: {label}
    </div>
  );
}

function BookingCard({ booking }: { booking: WorkspaceBooking }) {
  const catLabel = booking.diagnosis?.category
    ? booking.diagnosis.category.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
    : 'Service';

  return (
    <div style={{
      background: W, borderBottom: '1px solid rgba(0,0,0,0.07)',
      padding: '14px 16px',
    }}>
      {/* Status row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 36, height: 36, borderRadius: '50%',
            background: `${G}15`, border: `2px solid ${G}30`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, fontWeight: 700, color: G,
          }}>
            {initials(booking.providerName)}
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: D }}>{booking.providerName}</div>
            {booking.providerRating && (
              <div style={{ fontSize: 10, color: '#9B9490' }}>
                ★ {booking.providerRating} · {booking.providerReviewCount} reviews
              </div>
            )}
          </div>
        </div>
        <div style={{
          background: `${G}12`, color: G, border: `1px solid ${G}25`,
          borderRadius: 20, padding: '3px 10px', fontSize: 10, fontWeight: 600,
          display: 'flex', alignItems: 'center', gap: 4,
        }}>
          <span>📱</span> SMS Channel
        </div>
      </div>

      {/* Details chips */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 10 }}>
        {[
          { icon: '🔧', label: catLabel },
          ...(booking.propertyName ? [{ icon: '🏠', label: booking.propertyName }] : []),
          ...(booking.availability ? [{ icon: '📅', label: booking.availability }] : []),
          ...(booking.serviceAddress ? [{ icon: '📍', label: booking.serviceAddress }] : []),
        ].map((chip, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 4,
            background: 'white', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 20,
            padding: '3px 9px', fontSize: 11, color: D,
          }}>
            <span style={{ fontSize: 11 }}>{chip.icon}</span>
            <span style={{ fontWeight: 500 }}>{chip.label}</span>
          </div>
        ))}
      </div>

      {/* Price + AI estimate row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {booking.quotedPrice && (
          <div style={{
            background: 'white', border: `1px solid ${O}25`, borderRadius: 20,
            padding: '4px 12px', fontSize: 13, fontWeight: 700, color: O,
          }}>
            {booking.quotedPrice} quoted
          </div>
        )}
        <AICostBadge diagnosis={booking.diagnosis} />
      </div>

      {/* Diagnosis summary */}
      {booking.diagnosis?.summary && (
        <div style={{
          marginTop: 10, fontSize: 12, color: '#6B6560', lineHeight: 1.5,
          background: 'white', borderRadius: 8, padding: '8px 10px',
          border: '1px solid rgba(0,0,0,0.06)',
        }}>
          {booking.diagnosis.summary}
        </div>
      )}
    </div>
  );
}

function MessageBubble({ msg }: { msg: BookingMessage }) {
  const isTeam = msg.senderType === 'team';
  const isSystem = msg.senderType === 'system';

  if (isSystem) {
    return (
      <div style={{ textAlign: 'center', padding: '4px 0' }}>
        <span style={{
          fontSize: 11, color: '#B0AAA4',
          background: 'rgba(0,0,0,0.04)', borderRadius: 20,
          padding: '2px 10px',
        }}>{msg.content}</span>
      </div>
    );
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: isTeam ? 'row-reverse' : 'row',
      alignItems: 'flex-end', gap: 6, marginBottom: 2,
    }}>
      {/* Avatar */}
      <div style={{
        width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
        background: isTeam ? `${O}15` : `${G}15`,
        border: `1.5px solid ${isTeam ? O : G}25`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 9, fontWeight: 700, color: isTeam ? O : G,
      }}>
        {initials(msg.senderName ?? (isTeam ? 'PM' : 'PR'))}
      </div>

      <div style={{ maxWidth: '72%' }}>
        {/* Sender label */}
        <div style={{
          fontSize: 10, color: '#9B9490', fontWeight: 500,
          marginBottom: 2, textAlign: isTeam ? 'right' : 'left',
        }}>
          {msg.senderName ?? (isTeam ? 'You' : 'Provider')} · {formatTime(msg.createdAt)}
        </div>

        {/* Bubble */}
        <div style={{
          background: isTeam ? O : 'white',
          color: isTeam ? 'white' : D,
          borderRadius: isTeam ? '16px 4px 16px 16px' : '4px 16px 16px 16px',
          padding: '9px 13px',
          fontSize: 13, lineHeight: 1.5,
          border: isTeam ? 'none' : '1px solid rgba(0,0,0,0.07)',
          boxShadow: isTeam ? `0 2px 8px ${O}30` : '0 1px 3px rgba(0,0,0,0.05)',
          wordBreak: 'break-word',
        }}>
          {msg.content}
        </div>
      </div>
    </div>
  );
}

interface BookingChatProps {
  booking: WorkspaceBooking;
  workspaceId: string;
  onClose: () => void;
}

export default function BookingChat({ booking, workspaceId, onClose }: BookingChatProps) {
  const [messages, setMessages] = useState<BookingMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function loadMessages() {
    try {
      const res = await businessService.listMessages(workspaceId, booking.id);
      if (res.data) setMessages(res.data);
    } catch { /* silent */ }
  }

  useEffect(() => {
    setLoading(true);
    loadMessages().finally(() => setLoading(false));

    // Mark provider messages as read
    businessService.markMessagesRead(workspaceId, booking.id).catch(() => null);

    // Poll every 5 seconds for new messages
    pollRef.current = setInterval(() => {
      loadMessages();
      businessService.markMessagesRead(workspaceId, booking.id).catch(() => null);
    }, 5000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [booking.id, workspaceId]);

  // Scroll to bottom when messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function handleSend() {
    const text = input.trim();
    if (!text || sending) return;
    setInput('');
    setSending(true);
    setError(null);

    // Optimistic update
    const optimistic: BookingMessage = {
      id: `opt-${Date.now()}`,
      bookingId: booking.id,
      senderType: 'team',
      senderId: null,
      senderName: 'You',
      content: text,
      readAt: null,
      createdAt: new Date().toISOString(),
    };
    setMessages(prev => [...prev, optimistic]);

    try {
      const res = await businessService.sendMessage(workspaceId, booking.id, text);
      if (res.data) {
        setMessages(prev => prev.map(m => m.id === optimistic.id ? res.data! : m));
      }
    } catch (err) {
      setError('Failed to send message. Please try again.');
      setMessages(prev => prev.filter(m => m.id !== optimistic.id));
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  // Group messages by date
  function groupByDate(msgs: BookingMessage[]) {
    const groups: { date: string; msgs: BookingMessage[] }[] = [];
    for (const msg of msgs) {
      const date = new Date(msg.createdAt).toDateString();
      const last = groups[groups.length - 1];
      if (last?.date === date) { last.msgs.push(msg); }
      else { groups.push({ date, msgs: [msg] }); }
    }
    return groups;
  }

  const groups = groupByDate(messages);
  const providerFirstName = booking.providerName.split(' ')[0];

  return (
    <div style={{
      position: 'fixed', top: 0, right: 0, bottom: 0,
      width: 'min(420px, 100vw)',
      background: 'white',
      boxShadow: '-4px 0 40px rgba(0,0,0,0.12)',
      display: 'flex', flexDirection: 'column',
      zIndex: 9999,
      borderLeft: '1px solid rgba(0,0,0,0.06)',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '12px 16px',
        borderBottom: '1px solid rgba(0,0,0,0.07)',
        background: 'white',
        flexShrink: 0,
      }}>
        <button onClick={onClose} style={{
          width: 32, height: 32, borderRadius: '50%', border: 'none',
          background: 'rgba(0,0,0,0.05)', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 16, color: D, flexShrink: 0,
        }}>←</button>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: D, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {booking.providerName}
          </div>
          <div style={{ fontSize: 11, color: '#9B9490', display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: G, display: 'inline-block' }} />
            SMS via Homie · {booking.providerPhone ?? 'No phone'}
          </div>
        </div>

        {booking.providerPhone && (
          <a href={`tel:${booking.providerPhone}`} style={{
            width: 32, height: 32, borderRadius: '50%', border: `1px solid ${O}30`,
            background: `${O}08`, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 15, textDecoration: 'none', flexShrink: 0,
          }}>📞</a>
        )}
      </div>

      {/* Booking card */}
      <div style={{ flexShrink: 0, overflowX: 'hidden' }}>
        <BookingCard booking={booking} />
      </div>

      {/* Message thread */}
      <div style={{
        flex: 1, overflowY: 'auto', padding: '16px 14px',
        display: 'flex', flexDirection: 'column', gap: 12,
      }}>
        {loading ? (
          <div style={{ textAlign: 'center', color: '#9B9490', fontSize: 13, paddingTop: 20 }}>
            Loading messages...
          </div>
        ) : messages.length === 0 ? (
          <div style={{ textAlign: 'center', paddingTop: 30 }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>💬</div>
            <div style={{ fontSize: 14, color: D, fontWeight: 600, marginBottom: 6 }}>
              Start the conversation
            </div>
            <div style={{ fontSize: 12, color: '#9B9490', lineHeight: 1.5 }}>
              Message {providerFirstName} directly via SMS through Homie. They'll reply to the same thread.
            </div>
          </div>
        ) : (
          groups.map(group => (
            <div key={group.date}>
              {/* Date divider */}
              <div style={{ textAlign: 'center', marginBottom: 10 }}>
                <span style={{
                  fontSize: 10, color: '#B0AAA4', fontWeight: 500,
                  background: 'rgba(0,0,0,0.04)', borderRadius: 20, padding: '2px 10px',
                }}>
                  {new Date(group.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {group.msgs.map(msg => <MessageBubble key={msg.id} msg={msg} />)}
              </div>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* Error */}
      {error && (
        <div style={{
          padding: '8px 14px', background: '#FEF2F2',
          color: '#DC2626', fontSize: 12, textAlign: 'center',
          borderTop: '1px solid #FECACA',
        }}>{error}</div>
      )}

      {/* Composer */}
      <div style={{
        padding: '10px 14px 14px',
        borderTop: '1px solid rgba(0,0,0,0.07)',
        background: 'white', flexShrink: 0,
      }}>
        <div style={{ fontSize: 10, color: '#B0AAA4', marginBottom: 6, textAlign: 'center' }}>
          Message will be sent via SMS as <strong>HomiePro</strong>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Message ${providerFirstName}...`}
            rows={1}
            style={{
              flex: 1, resize: 'none', border: `1.5px solid ${input ? O : 'rgba(0,0,0,0.12)'}`,
              borderRadius: 20, padding: '9px 14px',
              fontSize: 13, outline: 'none', fontFamily: 'inherit',
              lineHeight: 1.4, maxHeight: 100, overflowY: 'auto',
              transition: 'border-color 0.15s',
              background: 'white',
            }}
            onInput={e => {
              const t = e.currentTarget;
              t.style.height = 'auto';
              t.style.height = Math.min(t.scrollHeight, 100) + 'px';
            }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || sending}
            style={{
              width: 38, height: 38, borderRadius: '50%', border: 'none',
              background: input.trim() && !sending ? O : 'rgba(0,0,0,0.08)',
              color: input.trim() && !sending ? 'white' : '#9B9490',
              cursor: input.trim() && !sending ? 'pointer' : 'default',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 16, transition: 'all 0.15s', flexShrink: 0,
              boxShadow: input.trim() && !sending ? `0 2px 8px ${O}40` : 'none',
            }}
          >
            {sending ? '…' : '↑'}
          </button>
        </div>
        <div style={{ fontSize: 10, color: '#C0BBB6', marginTop: 5, textAlign: 'center' }}>
          Enter to send · Shift+Enter for new line
        </div>
      </div>
    </div>
  );
}
