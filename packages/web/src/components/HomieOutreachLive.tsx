import { useState, useEffect, useRef, type CSSProperties } from 'react';

const O = '#E8632B', G = '#1B9E77', D = '#2D2926', W = '#F9F5F2';

interface ChannelStats { attempted: number; connected: number }

export interface OutreachStatus {
  providers_contacted: number;
  providers_responded: number;
  outreach_channels: {
    voice: ChannelStats;
    sms: ChannelStats;
    web: ChannelStats;
  };
  status: string; // 'open' | 'dispatching' | 'collecting' | 'completed' | 'expired'
}

export interface LogEntry {
  msg: string;
  type: 'system' | 'voice' | 'sms' | 'web' | 'success' | 'decline' | 'fallback' | 'done';
}

interface HomieOutreachLiveProps {
  /** Real-time status from WebSocket or polling */
  status?: OutreachStatus | null;
  /** Log entries to display in the activity feed */
  log?: LogEntry[];
  /** Whether outreach is complete */
  done?: boolean;
  /** Custom headline */
  headline?: string;
  /** Custom subtext */
  subtext?: string;
  /** Rotating encouragement messages */
  messages?: string[];
  /** Show the "safe to leave" notice */
  showSafeNotice?: boolean;
  /** Link for the account portal in the safe notice */
  accountLink?: string;
}

const STYLE_TAG = `
@keyframes hol-spin-cw {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
@keyframes hol-spin-ccw {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(-360deg); }
}
@keyframes hol-pulse {
  0%, 100% { transform: scale(1); opacity: 0.6; }
  50% { transform: scale(1.6); opacity: 0; }
}
@keyframes hol-msgs {
  0%, 22% { transform: translateY(0); }
  25%, 47% { transform: translateY(-25%); }
  50%, 72% { transform: translateY(-50%); }
  75%, 97% { transform: translateY(-75%); }
}
@keyframes hol-fadeIn {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes hol-countUp {
  from { transform: translateY(8px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}
@keyframes hol-blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}
@media (prefers-reduced-motion: reduce) {
  .hol-spin-cw, .hol-spin-ccw, .hol-pulse-ring, .hol-msg-rotate { animation: none !important; }
}
`;

const PhoneIcon = ({ color, size = 14 }: { color: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M6.62 10.79a15.05 15.05 0 006.59 6.59l2.2-2.2a1 1 0 011.01-.24 11.72 11.72 0 003.66.58 1 1 0 011 1v3.61a1 1 0 01-1 1A17 17 0 013 4a1 1 0 011-1h3.63a1 1 0 011 1 11.72 11.72 0 00.58 3.66 1 1 0 01-.24 1.01l-2.35 2.12z" fill={color} />
  </svg>
);
const ChatIcon = ({ color, size = 14 }: { color: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M20 2H4a2 2 0 00-2 2v12a2 2 0 002 2h14l4 4V4a2 2 0 00-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z" fill={color} />
  </svg>
);
const GlobeIcon = ({ color, size = 14 }: { color: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.22.21-1.79L9 15v1a2 2 0 002 2v1.93zm6.9-2.54A1.99 1.99 0 0016 16h-1v-3a1 1 0 00-1-1H8v-2h2a1 1 0 001-1V7h2a2 2 0 002-2v-.41a7.984 7.984 0 012.9 12.8z" fill={color} />
  </svg>
);

const CHANNEL_CONFIG = [
  { key: 'voice' as const, label: 'Voice', bg: '#FAECE7', color: O, Icon: PhoneIcon },
  { key: 'sms' as const, label: 'SMS', bg: '#E1F5EE', color: G, Icon: ChatIcon },
  { key: 'web' as const, label: 'Web', bg: '#E6F1FB', color: '#2E86C1', Icon: GlobeIcon },
];

const LOG_COLORS: Record<string, string> = {
  system: 'rgba(255,255,255,0.45)',
  voice: '#E8A87C',
  sms: '#7CC8AD',
  web: '#7CB8DE',
  success: G,
  decline: '#E24B4A',
  fallback: '#EF9F27',
  done: G,
};

const LOG_PREFIX: Record<string, string> = {
  success: '✓ ',
  decline: '✗ ',
  fallback: '↻ ',
  done: '✓ ',
};

export default function HomieOutreachLive({
  status,
  log = [],
  done = false,
  headline = "Your Homie's on it",
  subtext = 'Contacting pros in your area',
  messages = [
    'Calling around so you don\u2019t have to',
    'Nobody got you like your Homie',
    'Sit tight \u2014 quotes incoming',
    'Making moves behind the scenes',
  ],
  showSafeNotice = true,
  accountLink = '/account?tab=quotes',
}: HomieOutreachLiveProps) {
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [log]);

  const contacted = status?.providers_contacted ?? 0;
  const responded = status?.providers_responded ?? 0;
  const voice = status?.outreach_channels?.voice?.attempted ?? 0;
  const sms = status?.outreach_channels?.sms?.attempted ?? 0;
  const web = status?.outreach_channels?.web?.attempted ?? 0;
  const channelCounts = { voice, sms, web };

  const showMessages = messages.length > 0 && !done;

  const ringSize = 88;
  const ringFont = 36;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: STYLE_TAG }} />
      <div role="status" aria-live="polite" style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        padding: '2rem 1rem 1.5rem', gap: 0,
        fontFamily: "'DM Sans', sans-serif",
      }}>

        {/* ── Logo ring + headline ── */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 20 }}>
          <div style={{ position: 'relative', width: ringSize, height: ringSize, marginBottom: 14 }}>
            <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '2.5px solid #F0EBE6' }} aria-hidden="true" />
            <div className="hol-spin-cw" style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '2.5px solid transparent', borderTopColor: O, animation: 'hol-spin-cw 1.8s cubic-bezier(0.45,0.05,0.55,0.95) infinite' }} aria-hidden="true" />
            <div className="hol-spin-ccw" style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '2.5px solid transparent', borderBottomColor: G, animation: 'hol-spin-ccw 2.4s cubic-bezier(0.45,0.05,0.55,0.95) infinite' }} aria-hidden="true" />
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Fraunces, serif', fontWeight: 700, fontSize: ringFont, color: O, lineHeight: 1, userSelect: 'none' }} aria-hidden="true">h</div>
          </div>
          <div style={{ fontFamily: 'Fraunces, serif', fontSize: 20, fontWeight: 700, color: D, textAlign: 'center' }}>{headline}</div>
          <div style={{ fontSize: 13, color: '#9B9490', textAlign: 'center', marginTop: 3 }}>{subtext}</div>
        </div>

        {/* ── Channel cards with live counts ── */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 16, width: '100%', maxWidth: 360 }}>
          {CHANNEL_CONFIG.map(({ key, label, bg, color, Icon }, i) => {
            const count = channelCounts[key];
            return (
              <div key={key} style={{
                flex: 1, background: '#fff', borderRadius: 12, padding: '12px 8px', textAlign: 'center',
                border: '1px solid rgba(0,0,0,0.05)', position: 'relative', overflow: 'hidden',
              }}>
                {/* Pulse behind icon when active */}
                {count > 0 && (
                  <div className="hol-pulse-ring" style={{
                    position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50)',
                    width: 32, height: 32, borderRadius: '50%', background: bg,
                    animation: `hol-pulse 2.4s ease-in-out ${i * 0.8}s infinite`,
                  }} aria-hidden="true" />
                )}
                <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: '50%', background: bg, marginBottom: 6 }}>
                  <Icon color={color} size={15} />
                </div>
                <div style={{ fontSize: 22, fontWeight: 700, color: count > 0 ? D : '#D0CBC6', lineHeight: 1, animation: count > 0 ? 'hol-countUp 0.3s ease' : 'none' }}>{count}</div>
                <div style={{ fontSize: 10, color: '#9B9490', fontWeight: 500, marginTop: 2 }}>{label}</div>
              </div>
            );
          })}
        </div>

        {/* ── Summary stats bar ── */}
        <div style={{
          display: 'flex', gap: 0, width: '100%', maxWidth: 360, marginBottom: 16,
          background: W, borderRadius: 10, overflow: 'hidden', border: '1px solid rgba(0,0,0,0.04)',
        }}>
          <div style={{ flex: 1, padding: '10px 8px', textAlign: 'center', borderRight: '1px solid rgba(0,0,0,0.04)' }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: D }}>{contacted}</div>
            <div style={{ fontSize: 10, color: '#9B9490' }}>Contacted</div>
          </div>
          <div style={{ flex: 1, padding: '10px 8px', textAlign: 'center', borderRight: '1px solid rgba(0,0,0,0.04)' }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: responded > 0 ? G : D }}>{responded}</div>
            <div style={{ fontSize: 10, color: '#9B9490' }}>Quoted</div>
          </div>
          <div style={{ flex: 1, padding: '10px 8px', textAlign: 'center' }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: done ? G : O }}>{done ? '✓' : '...'}</div>
            <div style={{ fontSize: 10, color: '#9B9490' }}>{done ? 'Complete' : 'In Progress'}</div>
          </div>
        </div>

        {/* ── Activity feed ── */}
        {log.length > 0 && (
          <div style={{ width: '100%', maxWidth: 360, marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#9B9490', letterSpacing: '0.05em', marginBottom: 6 }}>LIVE ACTIVITY</div>
            <div ref={logRef} style={{
              background: D, borderRadius: 12, padding: '10px 14px', maxHeight: 140, overflowY: 'auto',
              fontFamily: "'DM Mono', 'Fira Code', monospace", fontSize: 11, lineHeight: 1.8,
            }}>
              {log.map((e, i) => (
                <div key={i} style={{
                  color: LOG_COLORS[e.type] ?? 'rgba(255,255,255,0.45)',
                  animation: 'hol-fadeIn 0.25s ease',
                }}>
                  {LOG_PREFIX[e.type] ?? '  '}{e.msg}
                </div>
              ))}
              {!done && <span style={{ color: O, animation: 'hol-blink 1s infinite' }}>▌</span>}
            </div>
          </div>
        )}

        {/* ── Rotating messages ── */}
        {showMessages && (
          <div style={{ height: 20, overflow: 'hidden', textAlign: 'center', width: '100%', maxWidth: 360, marginBottom: 12 }} aria-label={messages.join('. ')}>
            {messages.length === 1 ? (
              <div style={{ fontSize: 13, fontWeight: 500, color: O, lineHeight: '20px' }}>{messages[0]}</div>
            ) : (
              <div className="hol-msg-rotate" style={{ animation: 'hol-msgs 10s ease-in-out infinite' }}>
                {messages.map((msg, i) => (
                  <div key={i} style={{ height: 20, lineHeight: '20px', fontSize: 13, fontWeight: 500, color: O }}>{msg}</div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Safe to leave notice ── */}
        {showSafeNotice && !done && (
          <div style={{
            width: '100%', maxWidth: 360,
            background: '#EFF6FF', borderRadius: 10, padding: '10px 14px',
            border: '1px solid rgba(37,99,235,0.08)',
          }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#2563EB', marginBottom: 2 }}>You can close this page</div>
            <div style={{ fontSize: 11, color: '#6B6560', lineHeight: 1.5 }}>
              We'll notify you by text and email when quotes arrive. Check your quotes anytime in your{' '}
              <a href={accountLink} style={{ color: O, textDecoration: 'none', fontWeight: 600 }}>account</a>.
            </div>
          </div>
        )}

        {/* ── Done state ── */}
        {done && (
          <div style={{
            width: '100%', maxWidth: 360,
            background: `${G}08`, borderRadius: 10, padding: '12px 14px',
            border: `1px solid ${G}20`, textAlign: 'center',
          }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: G }}>
              {responded > 0 ? `${responded} quote${responded > 1 ? 's' : ''} ready!` : 'Outreach complete'}
            </div>
            <div style={{ fontSize: 12, color: '#6B6560', marginTop: 2 }}>
              {responded > 0 ? 'Scroll down to review and book a provider.' : 'No providers responded this time.'}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
