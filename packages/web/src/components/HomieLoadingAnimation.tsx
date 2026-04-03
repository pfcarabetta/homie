import { type CSSProperties } from 'react';

interface HomieLoadingAnimationProps {
  headline?: string;
  subtext?: string;
  messages?: string[];
  showChannels?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

const BRAND = {
  O: '#E8632B',
  G: '#1B9E77',
  D: '#2D2926',
  W: '#F9F5F2',
} as const;

const SIZE_CONFIG = {
  sm: { ring: 64, headline: 15, hFont: 28, gap: 12 },
  md: { ring: 96, headline: 18, hFont: 40, gap: 16 },
  lg: { ring: 120, headline: 22, hFont: 50, gap: 20 },
} as const;

const STYLE_TAG_CONTENT = `
@keyframes hla-spin-cw {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
@keyframes hla-spin-ccw {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(-360deg); }
}
@keyframes hla-pulse {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.5); opacity: 0; }
}
@keyframes hla-rotate-msgs {
  0%, 22% { transform: translateY(0); }
  25%, 47% { transform: translateY(-25%); }
  50%, 72% { transform: translateY(-50%); }
  75%, 97% { transform: translateY(-75%); }
}
@media (prefers-reduced-motion: reduce) {
  .hla-spin-cw,
  .hla-spin-ccw,
  .hla-pulse-ring,
  .hla-msg-rotate {
    animation: none !important;
  }
}
`;

const PhoneIcon = ({ color }: { color: string }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M6.62 10.79a15.05 15.05 0 006.59 6.59l2.2-2.2a1 1 0 011.01-.24 11.72 11.72 0 003.66.58 1 1 0 011 1v3.61a1 1 0 01-1 1A17 17 0 013 4a1 1 0 011-1h3.63a1 1 0 011 1 11.72 11.72 0 00.58 3.66 1 1 0 01-.24 1.01l-2.35 2.12z"
      fill={color}
    />
  </svg>
);

const ChatIcon = ({ color }: { color: string }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M20 2H4a2 2 0 00-2 2v12a2 2 0 002 2h14l4 4V4a2 2 0 00-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z"
      fill={color}
    />
  </svg>
);

const GlobeIcon = ({ color }: { color: string }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.22.21-1.79L9 15v1a2 2 0 002 2v1.93zm6.9-2.54A1.99 1.99 0 0016 16h-1v-3a1 1 0 00-1-1H8v-2h2a1 1 0 001-1V7h2a2 2 0 002-2v-.41a7.984 7.984 0 012.9 12.8z"
      fill={color}
    />
  </svg>
);

const CHANNELS = [
  { label: 'Voice', bg: '#FAECE7', color: '#E8632B', Icon: PhoneIcon },
  { label: 'SMS', bg: '#E1F5EE', color: '#1B9E77', Icon: ChatIcon },
  { label: 'Web', bg: '#E6F1FB', color: '#2E86C1', Icon: GlobeIcon },
] as const;

export default function HomieLoadingAnimation({
  headline = "Your Homie's on it",
  subtext = 'Contacting pros in your area',
  messages = [
    'Calling around so you don\u2019t have to',
    'Nobody got you like your Homie',
    'Sit tight \u2014 quotes incoming',
    'Making moves behind the scenes',
  ],
  showChannels = true,
  size = 'md',
}: HomieLoadingAnimationProps) {
  const cfg = SIZE_CONFIG[size];

  const ringContainerStyle: CSSProperties = {
    position: 'relative',
    width: cfg.ring,
    height: cfg.ring,
    flexShrink: 0,
  };

  const trackStyle: CSSProperties = {
    position: 'absolute',
    inset: 0,
    borderRadius: '50%',
    border: '2.5px solid #F0EBE6',
  };

  const ringBase: CSSProperties = {
    position: 'absolute',
    inset: 0,
    borderRadius: '50%',
    border: '2.5px solid transparent',
  };

  const ring1Style: CSSProperties = {
    ...ringBase,
    borderTopColor: BRAND.O,
    animation: 'hla-spin-cw 1.8s cubic-bezier(0.45, 0.05, 0.55, 0.95) infinite',
  };

  const ring2Style: CSSProperties = {
    ...ringBase,
    borderBottomColor: BRAND.G,
    animation: 'hla-spin-ccw 2.4s cubic-bezier(0.45, 0.05, 0.55, 0.95) infinite',
  };

  const letterStyle: CSSProperties = {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: 'Fraunces, serif',
    fontWeight: 700,
    fontSize: cfg.hFont,
    color: BRAND.O,
    lineHeight: 1,
    userSelect: 'none',
  };

  const showMessages = size !== 'sm' && messages.length > 0;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: STYLE_TAG_CONTENT }} />
      <div
        role="status"
        aria-live="polite"
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '2.5rem 1rem 2rem',
          gap: cfg.gap,
          background: 'transparent',
        }}
      >
        {/* 1. Logo Ring */}
        <div style={ringContainerStyle}>
          <div style={trackStyle} aria-hidden="true" />
          <div className="hla-spin-cw" style={ring1Style} aria-hidden="true" />
          <div className="hla-spin-ccw" style={ring2Style} aria-hidden="true" />
          <div style={letterStyle} aria-hidden="true">h</div>
        </div>

        {/* 2. Channel Indicators */}
        {showChannels && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 28,
            }}
            aria-hidden="true"
          >
            {CHANNELS.map(({ label, bg, color, Icon }, i) => (
              <div
                key={label}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <div style={{ position: 'relative', width: 36, height: 36 }}>
                  {/* Pulse ring */}
                  <div
                    className="hla-pulse-ring"
                    style={{
                      position: 'absolute',
                      inset: 0,
                      borderRadius: '50%',
                      backgroundColor: bg,
                      animation: `hla-pulse 2.4s ease-in-out ${i * 0.8}s infinite`,
                    }}
                    aria-hidden="true"
                  />
                  {/* Icon circle */}
                  <div
                    style={{
                      position: 'relative',
                      width: 36,
                      height: 36,
                      borderRadius: '50%',
                      backgroundColor: bg,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Icon color={color} />
                  </div>
                </div>
                <span
                  style={{
                    fontFamily: "'DM Sans', sans-serif",
                    fontSize: 11,
                    fontWeight: 500,
                    color: '#9B9490',
                  }}
                >
                  {label}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* 3. Status Text */}
        <div style={{ textAlign: 'center' }}>
          <div
            style={{
              fontFamily: 'Fraunces, serif',
              fontSize: cfg.headline,
              fontWeight: 700,
              color: BRAND.D,
              lineHeight: 1.3,
            }}
          >
            {headline}
          </div>
          <div
            style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 13,
              color: '#9B9490',
              marginTop: 4,
            }}
          >
            {subtext}
          </div>
        </div>

        {/* 4. Rotating Messages */}
        {showMessages && (
          <div
            style={{
              height: 20,
              overflow: 'hidden',
              textAlign: 'center',
              width: '100%',
            }}
            aria-label={messages.join('. ')}
          >
            {messages.length === 1 ? (
              <div
                style={{
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: 13,
                  fontWeight: 500,
                  color: BRAND.O,
                  lineHeight: '20px',
                }}
              >
                {messages[0]}
              </div>
            ) : (
              <div
                className="hla-msg-rotate"
                style={{
                  animation: `hla-rotate-msgs 10s ease-in-out infinite`,
                }}
              >
                {messages.map((msg, i) => (
                  <div
                    key={i}
                    style={{
                      height: 20,
                      lineHeight: '20px',
                      fontFamily: "'DM Sans', sans-serif",
                      fontSize: 13,
                      fontWeight: 500,
                      color: BRAND.O,
                    }}
                  >
                    {msg}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
