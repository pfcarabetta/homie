import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { authService } from '@/services/api';
import AvatarDropdown from '@/components/AvatarDropdown';
import SEO from '@/components/SEO';
import { usePricing, centsToDisplay } from '@/hooks/usePricing';

const ORANGE = '#E8632B';
const GREEN = '#1B9E77';
const DARK = '#2D2926';
const WARM = '#F9F5F2';

function useInView(ref: React.RefObject<HTMLElement | null>, threshold = 0.15) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!ref.current) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setVisible(true); }, { threshold });
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, [ref, threshold]);
  return visible;
}

/* -- Big-input hero: V1b from design handoff -----------------------
   A single oversized textarea is the page's primary surface. Users:
   • Type what's broken (Send → /quote?prefill=…, auto-submits)
   • Tap "Talk to Homie" (→ /quote?start=voice, opens voice panel)
   • Tap "Video chat with Homie" (→ /quote?start=video)
   • Or click a category chip (→ /quote?prefill=<canned desc>&category=<id>)
   All four entry points land inside the existing quote flow with the
   right initial state; GetQuotes.tsx reads the URL params on mount. */

interface QuickIssue {
  /** Emoji icon shown in the chip. */
  icon: string;
  /** Short label the user sees on the chip. */
  label: string;
  /** Full description shipped as ?prefill= (must be ≥12 chars so
   *  handleDirectText in /quote doesn't drop it on the floor). */
  prefill: string;
  /** Category id that maps to a CATEGORY_FLOWS entry in /quote.
   *  If omitted, /quote falls back to 'general'. */
  category: string;
}

const QUICK_ISSUES: QuickIssue[] = [
  { icon: '\uD83D\uDCA7', label: 'Leaky faucet',    prefill: 'Leaky faucet — dripping from the base',       category: 'plumbing' },
  { icon: '\u2744\uFE0F',  label: 'AC not cooling',  prefill: 'AC is not cooling, just blowing warm air',    category: 'hvac' },
  { icon: '\uD83D\uDD0C', label: 'Dead outlet',     prefill: 'Outlet stopped working, nothing plugs in',    category: 'electrical' },
  { icon: '\uD83D\uDEBD', label: 'Toilet running',  prefill: 'Toilet keeps running after every flush',      category: 'plumbing' },
  { icon: '\uD83C\uDFE0', label: 'Roof leak',       prefill: 'Roof is leaking, water showing on ceiling',   category: 'roofing' },
  { icon: '\uD83E\uDDCA', label: 'Fridge noise',    prefill: 'Fridge making a loud grinding noise',         category: 'appliance' },
];

/** Rotating italic phrases that slot into the "Stop calling ___."
 *  slot in the headline. Sourced from the final Claude Design handoff
 *  — lands tongue-in-cheek on specific pain points (calling "every
 *  plumber on Yelp", being stuck "around for hours", "waiting on
 *  hold") rather than generic trade names. */
const HEADLINE_PHRASES = [
  'the HVAC guy',
  "your neighbor's guy",
  'every plumber on Yelp',
  '10 handymen',
  'around for hours',
  "your dad's handyman",
  'and waiting on hold',
  'the number on the fridge',
  'Angi',
  'the drywall guy',
];

function BigInputHero({
  onSubmit, onVoice, onVideo, onPhoto, onChip,
}: {
  onSubmit: (text: string) => void;
  onVoice: () => void;
  onVideo: () => void;
  onPhoto: () => void;
  onChip: (issue: QuickIssue) => void;
}) {
  // Dropped the "92103." zip at the end — the quote page handles zip
  // collection in the pricing modal, so showing one here was confusing
  // (users thought they had to type theirs too, and copying the
  // sample literally sent 92103 as their zip).
  const SAMPLE = "My kitchen faucet is dripping from the base — worse when hot water's on.";
  const [val, setVal] = useState('');
  const [focused, setFocused] = useState(false);
  const [typedIdx, setTypedIdx] = useState(0);
  const userInteractedRef = useRef(false);

  // Auto-type the sample while the textarea is idle. Freezes the
  // moment the user focuses, types, or the sample finishes.
  useEffect(() => {
    if (userInteractedRef.current) return;
    if (focused) return;
    if (typedIdx >= SAMPLE.length) return;
    const id = setTimeout(() => {
      setVal(SAMPLE.slice(0, typedIdx + 1));
      setTypedIdx(i => i + 1);
    }, 55);
    return () => clearTimeout(id);
  }, [typedIdx, focused]);

  /** When the user focuses the textarea, clear any auto-typed sample
   *  so they start with a blank field instead of having to
   *  cmd+A-delete the placeholder. Only runs when the sample is still
   *  there (userInteractedRef stays false until they type). Once
   *  cleared, we also flip the ref so the autotype useEffect above
   *  doesn't re-seed the sample after they tab out without typing. */
  function handleFocus() {
    setFocused(true);
    if (!userInteractedRef.current) {
      userInteractedRef.current = true;
      setVal('');
      setTypedIdx(SAMPLE.length); // stop the autotype timer
    }
  }

  // Headline phrase rotator. 2.6s dwell + 0.6s exit/enter gap so the
  // word has time to read before it swaps. Timing + easing mirror
  // the design handoff (cubic-bezier(.16,1,.3,1) for a soft settle).
  const [catIdx, setCatIdx] = useState(0);
  const [catPhase, setCatPhase] = useState<'in' | 'out'>('in');
  useEffect(() => {
    if (catPhase !== 'in') return;
    const id = setTimeout(() => setCatPhase('out'), 2600);
    return () => clearTimeout(id);
  }, [catIdx, catPhase]);
  useEffect(() => {
    if (catPhase !== 'out') return;
    const id = setTimeout(() => {
      setCatIdx(c => (c + 1) % HEADLINE_PHRASES.length);
      setCatPhase('in');
    }, 600);
    return () => clearTimeout(id);
  }, [catPhase]);

  const text = val;
  const ready = text.trim().length >= 12;

  function handleChange(v: string) {
    userInteractedRef.current = true;
    setVal(v);
  }

  function handleSend() {
    if (!ready) return;
    onSubmit(text.trim());
  }

  return (
    <section className="hp-big-hero">
      <div className="hp-big-hero-inner">
        <div className="hp-big-hero-head">
          <h1 className="hp-big-title">
            <span className="hp-big-title-row">
              <span>Stop calling&nbsp;</span>
              <span className="hp-rotator">
                {/* Invisible spacer keeps the rotator slot on the same
                    baseline as "Stop calling". Without it the absolutely-
                    positioned rotating span has zero intrinsic height. */}
                <span aria-hidden="true" className="hp-rotator-spacer">M</span>
                <span
                  key={catIdx}
                  className={`hp-rotator-word hp-rotator-word-${catPhase}`}
                >
                  {HEADLINE_PHRASES[catIdx]}.
                </span>
              </span>
            </span>
            <br />
            <span>Let <span className="hp-homie-inline">homie</span> do it.</span>
          </h1>
          <p className="hp-big-sub">
            Homie calls, texts, and contacts local pros, and brings you back quotes and availability in minutes.
          </p>
          <div className="hp-chip hp-chip-orange">
            <span className="hp-chip-dot" /> Describe it in your own words
          </div>
        </div>

        {/* The Big Input */}
        <div className={`hp-big-input-wrap${focused ? ' focused' : ''}`}>
          <div className="hp-big-input-eyebrow">&#9656; Tell homie about it</div>
          <textarea
            className="hp-big-textarea"
            value={text}
            onChange={e => handleChange(e.target.value)}
            onFocus={handleFocus}
            onBlur={() => setFocused(false)}
            onKeyDown={e => {
              // Cmd/Ctrl+Enter submits from the textarea so keyboard-
              // native users can send without reaching for the button.
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="My dishwasher makes a grinding noise when it drains\u2026"
          />
          <div className="hp-big-input-bar">
            <div className="hp-big-actions">
              <button
                type="button"
                className="hp-big-action"
                onClick={onPhoto}
                title="Attach a photo and go straight to the quote chat"
              >
                <span className="hp-big-action-ic">&#x1F4F7;</span> Photo
              </button>
              <button
                type="button"
                className="hp-big-action"
                onClick={onVideo}
                title="Video chat with Homie"
              >
                <span className="hp-big-action-ic">&#x1F4F9;</span> Video chat
              </button>
              <button
                type="button"
                className="hp-big-action"
                onClick={onVoice}
                title="Talk to Homie with your voice"
              >
                <span className="hp-big-action-ic">&#x1F3A4;</span> Talk to Homie
              </button>
            </div>
            <button
              type="button"
              className={`hp-big-send${ready ? ' ready' : ''}`}
              disabled={!ready}
              onClick={handleSend}
            >
              {ready ? 'Send to homie \u2192' : 'Describe your issue'}
            </button>
          </div>
        </div>

        {/* Quick category chips */}
        <div className="hp-big-chips">
          <span className="hp-big-chips-label">Or pick one:</span>
          {QUICK_ISSUES.map(q => (
            <button
              key={q.label}
              type="button"
              className="hp-big-chip"
              onClick={() => onChip(q)}
            >
              <span>{q.icon}</span>{q.label}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

/** Sticky bottom-right CTA pill that fades in after the user has
 *  scrolled past the hero. Single tap → /quote. Mirrors the design
 *  handoff's V1S StickyCTA: compact dark pill with a "live counter"
 *  prefix + orange action button. */
function StickyCTA({ onClick }: { onClick: () => void }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const h = () => setShow(window.scrollY > 800);
    window.addEventListener('scroll', h);
    h();
    return () => window.removeEventListener('scroll', h);
  }, []);
  return (
    <div className="hp-sticky-cta" style={{
      position: 'fixed', bottom: 20, left: '50%',
      transform: `translateX(-50%) translateY(${show ? 0 : 80}px)`,
      opacity: show ? 1 : 0,
      transition: 'all 0.3s',
      zIndex: 40,
      background: DARK, color: '#fff', borderRadius: 100,
      padding: '6px 6px 6px 20px',
      display: 'flex', alignItems: 'center', gap: 14,
      boxShadow: '0 16px 48px -12px rgba(0,0,0,0.3)',
      pointerEvents: show ? 'auto' : 'none',
    }}>
      <span style={{ fontSize: 13 }}>
        <span style={{ color: GREEN, marginRight: 6 }}>&bull;</span>
        <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12 }}>127 quotes generated today</span>
      </span>
      <button onClick={onClick} style={{
        background: ORANGE, color: '#fff', border: 'none', borderRadius: 100,
        padding: '10px 20px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
        fontFamily: "'DM Sans', sans-serif",
      }}>Get quotes now &rarr;</button>
    </div>
  );
}

/** Mini animated demo that sits above each HowItWorks step tile.
 *  Four distinct visuals matching the design handoff:
 *    n=1  User typing a message, Homie's "…" dots reply
 *    n=2  Central Homie node connected to 4 provider nodes with
 *         pulsing dashed lines + ring pulses (parallel outreach)
 *    n=3  3 quote rows sliding in from the right ($189, $245, $212)
 *    n=4  Calendar week with Thursday highlighted + pulsing ✓ */
function StepDemo({ n }: { n: 1 | 2 | 3 | 4 }) {
  const base: React.CSSProperties = {
    width: '100%', height: 120, borderRadius: 12,
    background: '#FAF6F2', border: '1px solid rgba(0,0,0,0.06)',
    marginBottom: 20, position: 'relative', overflow: 'hidden',
  };

  if (n === 1) {
    return (
      <div style={base}>
        <div style={{ position: 'absolute', inset: 0, padding: 14, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 6 }}>
          <div style={{
            alignSelf: 'flex-start', background: '#fff', border: '1px solid rgba(0,0,0,0.08)',
            borderRadius: 14, padding: '8px 12px', fontSize: 11.5, color: DARK,
            maxWidth: '85%', overflow: 'hidden', whiteSpace: 'nowrap',
            animation: 'hiw-type 4.5s ease-in-out infinite',
          }}>
            <span>My AC is blowing warm air</span>
          </div>
          <div style={{
            alignSelf: 'flex-start', background: ORANGE, color: '#fff',
            borderRadius: 14, padding: '8px 12px', fontSize: 11.5,
            display: 'flex', gap: 3, alignItems: 'center', opacity: 0,
            animation: 'hiw-dots-fade 4.5s ease-in-out infinite',
          }}>
            {[0, 0.2, 0.4].map(d => (
              <span key={d} style={{
                width: 4, height: 4, borderRadius: 4, background: '#fff',
                animation: 'hiw-dot 1.2s ease-in-out infinite',
                animationDelay: `${d}s`,
              }} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (n === 2) {
    const providers = [
      { x: 12, y: 22, delay: '0s' },
      { x: 88, y: 22, delay: '0.4s' },
      { x: 12, y: 78, delay: '0.8s' },
      { x: 88, y: 78, delay: '1.2s' },
    ];
    return (
      <div style={base}>
        {/* Connecting dashed lines from center to each provider */}
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
          {providers.map((p, i) => (
            <line
              key={i} x1="50" y1="50" x2={p.x} y2={p.y}
              stroke={ORANGE} strokeWidth="0.5" strokeDasharray="2 2" opacity="0.4"
              style={{ animation: 'hiw-line 2.4s ease-in-out infinite', animationDelay: p.delay }}
            />
          ))}
        </svg>
        {providers.map((p, i) => (
          <div key={i} style={{
            position: 'absolute', left: `${p.x}%`, top: `${p.y}%`,
            width: 18, height: 18, marginLeft: -9, marginTop: -9,
            borderRadius: 6, background: '#fff', border: '1px solid rgba(0,0,0,0.12)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9,
            animation: 'hiw-pulse 2.4s ease-in-out infinite', animationDelay: p.delay,
          }}>&#x1F527;</div>
        ))}
        {/* Central Homie node */}
        <div style={{
          position: 'absolute', left: '50%', top: '50%',
          width: 30, height: 30, marginLeft: -15, marginTop: -15,
          borderRadius: 10, background: ORANGE, color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: "'Fraunces', serif", fontWeight: 700, fontSize: 14,
          boxShadow: '0 4px 12px rgba(232,99,43,0.35)',
        }}>h</div>
      </div>
    );
  }

  if (n === 3) {
    const quotes = [
      { price: '$189', delay: '0s' },
      { price: '$245', delay: '0.6s' },
      { price: '$212', delay: '1.2s' },
    ];
    return (
      <div style={base}>
        <div style={{ position: 'absolute', inset: 0, padding: 12, display: 'flex', flexDirection: 'column', gap: 5, justifyContent: 'center' }}>
          {quotes.map((q, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              background: '#fff', border: '1px solid rgba(0,0,0,0.08)',
              borderRadius: 8, padding: '6px 10px', fontSize: 11,
              opacity: 0, transform: 'translateX(20px)',
              animation: 'hiw-slide 3s ease-out infinite', animationDelay: q.delay,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 14, height: 14, borderRadius: 4, background: '#F0EAE2' }} />
                <div style={{ width: 40, height: 3, background: '#E5DED4', borderRadius: 2 }} />
              </div>
              <div style={{ fontFamily: "'DM Mono', monospace", fontWeight: 600, color: DARK }}>{q.price}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // n === 4 — Calendar with Thursday highlighted + pulsing check
  const days = [0, 1, 2, 3, 4, 5, 6];
  return (
    <div style={base}>
      <div style={{ position: 'absolute', inset: 0, padding: 16, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 8 }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
            <div key={i} style={{ width: 18, fontSize: 9, textAlign: 'center', color: '#9B9490', fontWeight: 600 }}>{d}</div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {days.map(d => {
            const picked = d === 3;
            return (
              <div key={d} style={{
                width: 18, height: 18, borderRadius: 5,
                background: picked ? ORANGE : '#fff',
                border: '1px solid rgba(0,0,0,0.08)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 9, color: picked ? '#fff' : DARK, fontWeight: 600,
                animation: picked ? 'hiw-book-pulse 2.4s ease-in-out infinite' : 'none',
              }}>
                {picked ? <span style={{ animation: 'hiw-check 2.4s ease-in-out infinite' }}>&#10003;</span> : d + 10}
              </div>
            );
          })}
        </div>
        <div style={{ fontSize: 10, color: '#6B6560', marginTop: 2 }}>Thu &middot; 9:00 AM &middot; booked</div>
      </div>
    </div>
  );
}

/** One of the four tiles in the "Quotes in minutes, not days"
 *  grid. Shared tile chrome wraps a small "01" / "02" / "03" / "04"
 *  eyebrow, the per-step animated demo, then the title + blurb. */
function StepTile({ n, title, description }: {
  n: 1 | 2 | 3 | 4; title: string; description: string;
}) {
  return (
    <div style={{ background: '#fff', padding: '32px 24px', position: 'relative' }}>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
        <div style={{
          fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: 14,
          color: '#9B9490', letterSpacing: 0.5,
        }}>0{n}</div>
      </div>
      <StepDemo n={n} />
      <h3 style={{
        fontFamily: "'Fraunces', serif", fontSize: 20, fontWeight: 600,
        margin: '0 0 8px', color: DARK, letterSpacing: '-0.01em',
      }}>{title}</h3>
      <p style={{ fontSize: 13.5, lineHeight: 1.55, color: '#6B6560', margin: 0 }}>{description}</p>
    </div>
  );
}

/** Little phone-framed mockup shown on the right side of the
 *  Explainer section. Five screens, one per "reason homeowners love
 *  homie" — swap by passing n=1..5. The frame, screen, header, and
 *  orange "h" badge are shared; each branch renders its own body. */
function PhoneDemo({ n }: { n: 1 | 2 | 3 | 4 | 5 }) {
  const frame: React.CSSProperties = {
    width: 280, height: 560, borderRadius: 42,
    background: DARK, padding: 10,
    boxShadow: '0 30px 80px -20px rgba(0,0,0,0.35), 0 0 0 1px rgba(0,0,0,0.08)',
    position: 'relative', margin: '0 auto',
  };
  const screen: React.CSSProperties = {
    width: '100%', height: '100%', borderRadius: 32,
    background: '#FAF6F2', overflow: 'hidden',
    position: 'relative', display: 'flex', flexDirection: 'column',
  };
  const header: React.CSSProperties = {
    padding: '14px 16px 10px', display: 'flex', alignItems: 'center',
    gap: 8, borderBottom: '1px solid rgba(0,0,0,0.05)', background: '#fff',
  };
  const dot: React.CSSProperties = {
    width: 22, height: 22, borderRadius: 7, background: ORANGE, color: '#fff',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontFamily: "'Fraunces', serif", fontWeight: 700, fontSize: 12,
  };

  if (n === 1) {
    // Diagnostic chat
    return (
      <div style={frame}>
        <div style={screen}>
          <div style={header}><div style={dot}>h</div><div style={{ fontSize: 12, fontWeight: 600, color: DARK }}>Diagnosing your issue</div></div>
          <div style={{ flex: 1, padding: 14, display: 'flex', flexDirection: 'column', gap: 10, overflow: 'hidden' }}>
            <div style={{ alignSelf: 'flex-end', background: ORANGE, color: '#fff', borderRadius: '14px 14px 4px 14px', padding: '9px 12px', fontSize: 12.5, maxWidth: '85%' }}>My AC is blowing warm air</div>
            <div style={{ alignSelf: 'flex-start', background: '#fff', borderRadius: '14px 14px 14px 4px', padding: '9px 12px', fontSize: 12.5, maxWidth: '90%', border: '1px solid rgba(0,0,0,0.06)', color: DARK }}>Got it. A few quick questions so pros don&rsquo;t have to ask:</div>
            <div style={{ alignSelf: 'flex-start', background: '#fff', borderRadius: '14px 14px 14px 4px', padding: '9px 12px', fontSize: 12.5, maxWidth: '90%', border: '1px solid rgba(0,0,0,0.06)', color: DARK }}>Is the outdoor unit running? Any ice on the lines?</div>
            <div style={{ alignSelf: 'flex-end', background: ORANGE, color: '#fff', borderRadius: '14px 14px 4px 14px', padding: '9px 12px', fontSize: 12.5, maxWidth: '85%' }}>Running but loud. No ice.</div>
            <div style={{ alignSelf: 'flex-start', background: '#FFF4EC', border: '1px solid rgba(232,99,43,0.2)', borderRadius: 12, padding: 10, fontSize: 11.5, color: DARK, maxWidth: '95%' }}>
              <div style={{ fontWeight: 700, fontSize: 10.5, color: ORANGE, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 }}>Diagnostic ready</div>
              <div style={{ lineHeight: 1.45 }}>Likely low refrigerant or failing capacitor. Sending this brief to 8 HVAC pros.</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (n === 2) {
    const pros: { name: string; ch: string; status: string; c: string }[] = [
      { name: 'ProCool HVAC',  ch: '\uD83D\uDCDE Calling',   status: 'Ringing\u2026', c: ORANGE },
      { name: 'Aire Tech',     ch: '\uD83D\uDCAC Texting',   status: 'Sent',          c: GREEN },
      { name: 'Frost Masters', ch: '\uD83C\uDF10 Web form',  status: 'Filling',       c: '#9B9490' },
      { name: 'Cool Crew',     ch: '\uD83D\uDCDE On call',   status: '2:14',          c: ORANGE },
      { name: 'Arctic Air',    ch: '\uD83D\uDCAC Replied',   status: 'Quote $189',    c: GREEN },
      { name: 'Breeze Pros',   ch: '\uD83C\uDF10 Submitted', status: 'Waiting',       c: '#9B9490' },
    ];
    return (
      <div style={frame}>
        <div style={screen}>
          <div style={header}>
            <div style={dot}>h</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: DARK, flex: 1 }}>Reaching out &middot; 6 pros</div>
            <div style={{ width: 6, height: 6, borderRadius: 6, background: GREEN, animation: 'pulse 1.2s infinite' }} />
          </div>
          <div style={{ flex: 1, padding: 10, display: 'flex', flexDirection: 'column', gap: 6, overflow: 'hidden' }}>
            {pros.map((p, i) => (
              <div key={i} style={{ background: '#fff', borderRadius: 10, padding: '9px 11px', display: 'flex', alignItems: 'center', gap: 8, border: '1px solid rgba(0,0,0,0.05)' }}>
                <div style={{ width: 26, height: 26, borderRadius: 6, background: '#F0EAE2', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontFamily: "'Fraunces', serif", fontWeight: 700, color: DARK }}>{p.name[0]}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11.5, fontWeight: 600, color: DARK, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
                  <div style={{ fontSize: 10, color: '#9B9490', marginTop: 1 }}>{p.ch}</div>
                </div>
                <div style={{ fontSize: 10, fontWeight: 700, color: p.c, fontFamily: "'DM Mono', monospace" }}>{p.status}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (n === 3) {
    const quotes: { name: string; rating: number; price: string; eta: string; badge: string | null }[] = [
      { name: 'Arctic Air',    rating: 4.9, price: '$189', eta: 'Tomorrow 9am', badge: 'Best match' },
      { name: 'ProCool HVAC',  rating: 4.7, price: '$212', eta: 'Fri 2pm',      badge: null },
      { name: 'Frost Masters', rating: 4.6, price: '$245', eta: 'Mon 10am',     badge: null },
    ];
    return (
      <div style={frame}>
        <div style={screen}>
          <div style={header}><div style={dot}>h</div><div style={{ fontSize: 12, fontWeight: 600, color: DARK }}>3 quotes &middot; apples-to-apples</div></div>
          <div style={{ flex: 1, padding: 12, display: 'flex', flexDirection: 'column', gap: 8, overflow: 'hidden' }}>
            {quotes.map((q, i) => (
              <div key={i} style={{ background: '#fff', borderRadius: 14, padding: 12, border: `1.5px solid ${q.badge ? ORANGE : 'rgba(0,0,0,0.06)'}`, position: 'relative' }}>
                {q.badge && <div style={{ position: 'absolute', top: -8, left: 10, background: ORANGE, color: '#fff', fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 100, letterSpacing: 0.5, textTransform: 'uppercase' }}>{q.badge}</div>}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: DARK, fontFamily: "'Fraunces', serif" }}>{q.name}</div>
                    <div style={{ fontSize: 10.5, color: '#9B9490', marginTop: 2 }}>&#9733; {q.rating} &middot; {q.eta}</div>
                  </div>
                  <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 15, fontWeight: 700, color: DARK }}>{q.price}</div>
                </div>
                <div style={{ marginTop: 10, display: 'flex', gap: 6 }}>
                  <button style={{ flex: 1, background: q.badge ? ORANGE : '#F0EAE2', color: q.badge ? '#fff' : DARK, border: 'none', borderRadius: 8, padding: '7px 0', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Book</button>
                  <button style={{ background: '#fff', border: '1px solid rgba(0,0,0,0.1)', borderRadius: 8, padding: '7px 10px', fontSize: 11, color: DARK, cursor: 'pointer' }}>Details</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (n === 4) {
    return (
      <div style={frame}>
        <div style={screen}>
          <div style={header}><div style={dot}>h</div><div style={{ fontSize: 12, fontWeight: 600, color: DARK }}>Fair-price estimate</div></div>
          <div style={{ flex: 1, padding: 16, display: 'flex', flexDirection: 'column', gap: 14, overflow: 'hidden' }}>
            <div>
              <div style={{ fontSize: 10.5, color: '#9B9490', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 700 }}>AC capacitor replacement</div>
              <div style={{ fontSize: 11, color: '#6B6560', marginTop: 3 }}>Based on 847 jobs in 92103</div>
            </div>
            <div style={{ background: '#fff', borderRadius: 12, padding: 14, border: '1px solid rgba(0,0,0,0.06)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                <div style={{ fontSize: 10, color: '#9B9490', fontWeight: 600 }}>Typical range</div>
                <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: DARK, fontWeight: 700 }}>$150&ndash;$280</div>
              </div>
              <div style={{ position: 'relative', height: 8, background: 'linear-gradient(to right, #F0EAE2, #FFE6D4, #F0EAE2)', borderRadius: 100, marginBottom: 18 }}>
                <div style={{ position: 'absolute', left: '32%', top: -4, width: 16, height: 16, borderRadius: 16, background: ORANGE, border: '3px solid #fff', boxShadow: '0 2px 6px rgba(232,99,43,0.5)' }} />
                <div style={{ position: 'absolute', left: '32%', top: 18, transform: 'translateX(-50%)', fontSize: 9.5, fontWeight: 700, color: ORANGE, whiteSpace: 'nowrap' }}>Your quote &middot; $189</div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: "'DM Mono', monospace", fontSize: 9.5, color: '#9B9490' }}>
                <span>$150</span><span>Median $215</span><span>$280</span>
              </div>
            </div>
            <div style={{ background: '#F0F9F5', border: '1px solid rgba(27,158,119,0.25)', borderRadius: 12, padding: 12, display: 'flex', gap: 10 }}>
              <div style={{ width: 22, height: 22, borderRadius: 22, background: GREEN, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>&#10003;</div>
              <div style={{ fontSize: 11, color: DARK, lineHeight: 1.45 }}><b>Fair price.</b> $26 below the local median. Green flag to book.</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // n === 5 — Pros don't pay to be on homie
  const ProCard = ({ name, rating, jobs, badge }: { name: string; rating: number; jobs: number; badge: string }) => (
    <div style={{ background: '#fff', borderRadius: 12, padding: 12, border: '1px solid rgba(0,0,0,0.06)', display: 'flex', gap: 10, alignItems: 'center' }}>
      <div style={{ width: 36, height: 36, borderRadius: 10, background: '#F0EAE2', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Fraunces', serif", fontWeight: 700, color: DARK, fontSize: 14, flexShrink: 0 }}>{name[0]}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: DARK, fontFamily: "'Fraunces', serif", whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</div>
        <div style={{ fontSize: 10, color: '#9B9490', marginTop: 1 }}>&#9733; {rating} &middot; {jobs} jobs</div>
      </div>
      <div style={{ background: 'rgba(27,158,119,0.1)', color: GREEN, fontSize: 9, fontWeight: 700, padding: '3px 8px', borderRadius: 100, letterSpacing: 0.4, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{badge}</div>
    </div>
  );
  return (
    <div style={frame}>
      <div style={screen}>
        <div style={header}><div style={dot}>h</div><div style={{ fontSize: 12, fontWeight: 600, color: DARK }}>How pros get on homie</div></div>
        <div style={{ flex: 1, padding: 14, display: 'flex', flexDirection: 'column', gap: 10, overflow: 'hidden' }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: '12px 14px', border: '1px solid rgba(0,0,0,0.06)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <div style={{ fontSize: 10, color: '#9B9490', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 700 }}>Lead fee to pros</div>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 14, fontWeight: 700, color: GREEN }}>$0.00</div>
            </div>
            <div style={{ fontSize: 10.5, color: '#6B6560', lineHeight: 1.45 }}>Pros don&rsquo;t pay us per lead, so nothing gets padded into your quote.</div>
          </div>
          <div style={{ fontSize: 9.5, color: '#9B9490', textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: 700, marginTop: 2 }}>Invited based on</div>
          <ProCard name="Arctic Air" rating={4.9} jobs={312} badge="Top rated" />
          <ProCard name="ProCool HVAC" rating={4.8} jobs={187} badge="Fast reply" />
          <ProCard name="Marco Rodriguez" rating={5.0} jobs={94} badge="Local pick" />
          <div style={{ marginTop: 'auto', background: '#FFF4EC', border: '1px solid rgba(232,99,43,0.2)', borderRadius: 12, padding: 10, display: 'flex', gap: 10 }}>
            <div style={{ width: 22, height: 22, borderRadius: 22, background: ORANGE, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>&#10003;</div>
            <div style={{ fontSize: 10.5, color: DARK, lineHeight: 1.45 }}><b>No pay-to-play.</b> Other sites charge $20&ndash;$80 per lead &mdash; that cost ends up in your price.</div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** "Why homeowners love homie" — split-screen explainer. Left is a
 *  stack of 5 clickable reason cards, right is a sticky PhoneDemo
 *  whose screen swaps to match the active reason. Matches the
 *  design handoff's Explainer section. */
function Explainer() {
  const [active, setActive] = useState<1 | 2 | 3 | 4 | 5>(1);
  const reasons: { n: 1 | 2 | 3 | 4 | 5; t: string; d: string }[] = [
    { n: 1, t: 'Homie diagnoses before it dials', d: "A quick back-and-forth turns 'my AC is broken' into a brief that pros trust — so you get accurate, well-informed quotes instead of guesses." },
    { n: 2, t: 'Homie does the legwork — in parallel', d: 'Our agent calls, texts, and fills web forms for a dozen local pros at the same time. You never chase anyone, and nothing gets forgotten.' },
    { n: 3, t: 'Real quotes, apples to apples', d: 'Every pro answers the same brief, so you compare real prices and real availability side-by-side — not bids you still have to decode.' },
    { n: 4, t: 'Know a fair price before you commit', d: 'Our AI estimator shows what other homeowners actually paid for similar work in your area — so you can tell at a glance whether a quote is a fair one or a gotcha.' },
    { n: 5, t: "Pros don't pay to be on homie", d: "Other sites charge pros for every lead — then pros bake those fees into your price. On homie, good pros are invited based on results and reviews. No lead fees, no kickbacks, no padded quotes." },
  ];

  return (
    <section className="hp-explainer" style={{ padding: '120px 32px', background: WARM, position: 'relative', overflow: 'hidden' }}>
      {/* Subtle dot pattern backdrop — same as the design */}
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(0,0,0,0.04) 1px, transparent 0)',
        backgroundSize: '24px 24px', pointerEvents: 'none',
      }} />
      <div style={{ maxWidth: 1200, margin: '0 auto', position: 'relative' }}>
        <div style={{ textAlign: 'center', marginBottom: 64 }}>
          <div className="hp-chip hp-chip-orange" style={{ marginBottom: 16 }}>
            <span className="hp-chip-dot" /> Why homeowners love it
          </div>
          <h2 style={{
            fontFamily: "'Fraunces', serif", fontSize: 52, fontWeight: 700,
            margin: '0 0 12px', color: DARK, letterSpacing: '-0.02em',
          }}>Why homeowners love homie</h2>
          <p style={{ fontSize: 18, color: '#6B6560', maxWidth: 560, margin: '0 auto' }}>
            Tap a reason &mdash; see what it actually looks like on your phone.
          </p>
        </div>
        <div className="hp-explainer-grid">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {reasons.map(r => {
              const on = r.n === active;
              return (
                <button key={r.n} onClick={() => setActive(r.n)} style={{
                  textAlign: 'left',
                  background: on ? '#fff' : 'transparent',
                  border: `1.5px solid ${on ? ORANGE : 'rgba(0,0,0,0.08)'}`,
                  borderRadius: 16, padding: '20px 22px', cursor: 'pointer',
                  fontFamily: "'DM Sans', sans-serif", transition: 'all 0.2s',
                  boxShadow: on ? '0 8px 24px -12px rgba(232,99,43,0.3)' : 'none',
                  display: 'flex', gap: 14, alignItems: 'flex-start',
                }}>
                  <div style={{
                    fontFamily: "'Fraunces', serif", fontSize: 14, fontWeight: 600,
                    color: on ? ORANGE : '#9B9490', letterSpacing: 0.5,
                    marginTop: 3, minWidth: 20,
                  }}>{`0${r.n}`}</div>
                  <div style={{ flex: 1 }}>
                    <h3 style={{
                      fontFamily: "'Fraunces', serif", fontSize: 20, fontWeight: 600,
                      color: DARK, margin: 0, letterSpacing: '-0.01em', lineHeight: 1.3,
                    }}>{r.t}</h3>
                    <p style={{
                      fontSize: 14, color: '#6B6560', margin: '6px 0 0', lineHeight: 1.55,
                      maxHeight: on ? 200 : 0, opacity: on ? 1 : 0, overflow: 'hidden',
                      transition: 'all 0.3s',
                    }}>{r.d}</p>
                  </div>
                </button>
              );
            })}
          </div>
          <div className="hp-explainer-phone" style={{ position: 'sticky', top: 100 }}>
            <PhoneDemo n={active} />
          </div>
        </div>
      </div>
    </section>
  );
}

/* -- Main page -- */
export default function HomePage() {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const { pricing } = usePricing();

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif", background: 'white', overflowX: 'hidden' }}>
      <SEO
        title="AI-Powered Home Maintenance & Repair Quotes"
        description="Stop calling around for home repair quotes. Homie's AI agent calls, texts, and emails local pros for you — and brings back quotes in minutes."
        canonical="/"
      />
      <style>{`
        @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.4; } }
        @keyframes slideUp { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:translateY(0); } }
        @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
        @keyframes blink { 0%,100% { opacity:1; } 50% { opacity:0; } }

        /* ── HowItWorks tile animations ──
           hiw-type: reveals the user message by expanding its
           max-width. hiw-dots-fade: delays the Homie reply until
           after the typing finishes. hiw-dot: bounces each of
           the three reply dots. hiw-pulse / hiw-line: step 2's
           provider nodes pulse and their connector lines blink
           in sequence. hiw-slide: step 3's quotes slide in from
           the right. hiw-book-pulse / hiw-check: step 4's booked
           day pulses + fades in the checkmark. Infinite loops so
           the demos keep running as the user reads. */
        @keyframes hiw-type {
          0%, 20% { max-width: 0; }
          40%, 60% { max-width: 85%; }
          100% { max-width: 85%; }
        }
        @keyframes hiw-dots-fade {
          0%, 55% { opacity: 0; transform: translateY(4px); }
          65%, 90% { opacity: 1; transform: translateY(0); }
          100% { opacity: 0; }
        }
        @keyframes hiw-dot {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
          30% { transform: translateY(-3px); opacity: 1; }
        }
        @keyframes hiw-pulse {
          0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(232,99,43,0); }
          30% { transform: scale(1.15); box-shadow: 0 0 0 6px rgba(232,99,43,0.15); }
          60% { transform: scale(1); box-shadow: 0 0 0 0 rgba(232,99,43,0); }
        }
        @keyframes hiw-line {
          0%, 100% { stroke-opacity: 0.15; }
          25% { stroke-opacity: 0.9; }
          50% { stroke-opacity: 0.15; }
        }
        @keyframes hiw-slide {
          0% { opacity: 0; transform: translateX(20px); }
          30%, 90% { opacity: 1; transform: translateX(0); }
          100% { opacity: 0; transform: translateX(-10px); }
        }
        @keyframes hiw-book-pulse {
          0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(232,99,43,0); }
          40% { transform: scale(1.15); box-shadow: 0 0 0 4px rgba(232,99,43,0.2); }
        }
        @keyframes hiw-check {
          0%, 30% { opacity: 0; transform: scale(0.3); }
          50%, 100% { opacity: 1; transform: scale(1); }
        }

        /* HowItWorks grid — 4 tiles, 2px gap on a dark backdrop so
           the white tiles read as connected cells in a slab. */
        .hp-hiw-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 2px;
          background: rgba(0,0,0,0.06);
          border-radius: 24px;
          overflow: hidden;
          border: 1px solid rgba(0,0,0,0.06);
        }

        /* Explainer — two-column grid with reasons on the left and
           a sticky phone demo on the right. On tablet/mobile the
           phone column hides because it doesn't fit the viewport
           gracefully and the reasons alone read fine. */
        .hp-explainer-grid {
          display: grid;
          grid-template-columns: 1fr 320px;
          gap: 56px;
          align-items: flex-start;
        }
        @keyframes hpMosaicScroll { 0% { transform: translateY(0); } 100% { transform: translateY(-50%); } }

        .hp-nav-links { display: flex; align-items: center; gap: 28px; }
        .hp-nav-burger { display: none; background: none; border: none; font-size: 24px; cursor: pointer; color: ${DARK}; }
        .hp-mobile-menu { display: none; }

        /* ── Big-input hero (V1b) ─────────────────────────────────────
           Sits directly under the sticky 56px nav. Centered column, ~900
           max — matches the design handoff's centered layout. */
        .hp-big-hero {
          background: linear-gradient(180deg, #fff 0%, ${WARM} 100%);
          padding: 100px 32px 72px;
          min-height: calc(100vh - 56px);
          display: flex; align-items: flex-start; justify-content: center;
        }
        .hp-big-hero-inner { max-width: 1100px; width: 100%; margin: 0 auto; }
        .hp-big-hero-head { text-align: center; margin-bottom: 28px; }
        .hp-big-title {
          font-family: 'Fraunces', serif;
          font-size: 50px;
          font-weight: 700;
          line-height: 1.04;
          letter-spacing: -0.03em;
          color: ${DARK};
          margin: 0 0 14px;
        }
        .hp-big-title-row {
          display: inline-flex;
          align-items: baseline;
          gap: 0.28em;
          flex-wrap: wrap;
          justify-content: center;
        }
        .hp-homie-inline { color: ${ORANGE}; }
        /* Rotating phrase slot — fixed-size box so the h1 doesn't
           reflow on every swap. The absolutely-positioned word slides
           up/out + fades for each rotation. Spacer "M" inside is
           invisible but keeps the slot height locked to the line. */
        .hp-rotator {
          position: relative;
          display: inline-block;
          min-width: clamp(280px, 46vw, 680px);
          height: 1.1em;
          line-height: 1;
          text-align: left;
          overflow: hidden;
          vertical-align: baseline;
        }
        .hp-rotator-spacer {
          visibility: hidden;
          display: inline-block;
        }
        .hp-rotator-word {
          display: inline-block;
          font-style: italic;
          color: ${ORANGE};
          position: absolute;
          left: 0;
          top: 0;
          line-height: 1;
          white-space: nowrap;
          transition: transform 0.7s cubic-bezier(.16,1,.3,1), opacity 0.55s ease;
        }
        .hp-rotator-word-in  { transform: translateY(0);    opacity: 1; }
        .hp-rotator-word-out { transform: translateY(-100%); opacity: 0; }
        .hp-big-sub {
          font-size: 20px;
          color: #6B6560;
          max-width: 560px;
          margin: 14px auto 22px;
          line-height: 1.55;
        }
        .hp-chip {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 6px 14px; border-radius: 100;
          font-size: 13px; font-weight: 600;
          font-family: 'DM Sans', sans-serif;
        }
        .hp-chip-orange { background: rgba(232,99,43,0.1); color: ${ORANGE}; }
        .hp-chip-dot {
          display: inline-block; width: 6px; height: 6px; border-radius: 50%;
          background: currentColor;
        }

        /* ── The big card ──
           White surface, heavy rounding, orange focus ring. Textarea
           fills the card; toolbar sits in a footer row. */
        .hp-big-input-wrap {
          background: #fff;
          border-radius: 32px;
          border: 2px solid rgba(0,0,0,0.08);
          box-shadow: 0 24px 64px -28px rgba(0,0,0,0.18);
          padding: 32px 32px 24px;
          transition: all 0.25s;
        }
        .hp-big-input-wrap.focused {
          border-color: ${ORANGE};
          box-shadow: 0 24px 72px -20px rgba(232,99,43,0.35);
        }
        .hp-big-input-eyebrow {
          font-size: 12px; color: #9B9490;
          font-family: 'DM Mono', monospace;
          letter-spacing: 1.2px;
          margin-bottom: 12px;
          text-transform: uppercase;
        }
        .hp-big-textarea {
          width: 100%; border: none; outline: none; resize: none;
          font-family: 'Fraunces', serif;
          font-size: 32px; line-height: 1.25;
          color: ${DARK};
          background: transparent;
          min-height: 120px; padding: 0;
          letter-spacing: -0.01em;
        }
        .hp-big-textarea::placeholder { color: #C4BFBB; }
        .hp-big-input-bar {
          display: flex; align-items: center; justify-content: space-between;
          gap: 12px; flex-wrap: wrap;
          margin-top: 14px; padding-top: 14px;
          border-top: 1px solid rgba(0,0,0,0.06);
        }
        .hp-big-actions { display: flex; gap: 10px; flex-wrap: wrap; }
        .hp-big-action {
          background: ${WARM};
          border: 1px solid rgba(0,0,0,0.08);
          border-radius: 100px;
          padding: 8px 14px;
          font-size: 13px; color: ${DARK}; cursor: pointer;
          display: inline-flex; align-items: center; gap: 6px;
          font-family: 'DM Sans', sans-serif;
          transition: all 0.15s;
        }
        .hp-big-action:hover {
          background: #fff;
          border-color: ${ORANGE};
          color: ${ORANGE};
        }
        .hp-big-action-ic { font-size: 15px; line-height: 1; }
        .hp-big-send {
          background: rgba(0,0,0,0.08);
          color: #9B9490;
          border: none;
          border-radius: 100px;
          padding: 14px 28px;
          font-size: 15px; font-weight: 700;
          cursor: not-allowed;
          transition: all 0.2s;
          font-family: 'DM Sans', sans-serif;
        }
        .hp-big-send.ready {
          background: ${ORANGE};
          color: #fff;
          cursor: pointer;
          box-shadow: 0 8px 24px -6px rgba(232,99,43,0.55);
        }
        .hp-big-send.ready:hover { background: #C8531E; }

        /* ── Quick category chips ── */
        .hp-big-chips {
          display: flex; gap: 8px;
          justify-content: center; flex-wrap: wrap;
          margin-top: 18px;
        }
        .hp-big-chips-label {
          font-size: 12px; color: #9B9490;
          padding: 8px 0; margin-right: 4px;
        }
        .hp-big-chip {
          background: #fff;
          border: 1px solid rgba(0,0,0,0.1);
          border-radius: 100px;
          padding: 8px 14px;
          font-size: 13px; color: ${DARK}; cursor: pointer;
          display: inline-flex; align-items: center; gap: 6px;
          font-family: 'DM Sans', sans-serif;
          transition: all 0.15s;
        }
        .hp-big-chip:hover {
          border-color: ${ORANGE};
          background: rgba(232,99,43,0.05);
        }

        .hp-section { padding: 100px 32px; }
        .hp-section-title { font-family: 'Fraunces', serif; font-size: 40px; font-weight: 700; margin-bottom: 12px; }
        .hp-section-sub { font-size: 18px; color: #6B6560; }
        .hp-step-title { font-family: 'Fraunces', serif; font-size: 20px; font-weight: 600; color: ${DARK}; margin-bottom: 8px; }
        /* .hp-steps-grid is retained empty for legacy compat — the
           live HowItWorks layout lives on .hp-hiw-grid above. */
        .hp-compare-table { width: 100%; border-collapse: collapse; }
        .hp-compare-table th, .hp-compare-table td { padding: 16px 20px; font-size: 14px; }
        .hp-pricing-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 20px; }
        .hp-pricing-price { font-family: 'DM Sans', sans-serif; font-size: 44px; font-weight: 700; margin-bottom: 4px; }
        .hp-cta-title { font-family: 'Fraunces', serif; font-size: 40px; font-weight: 700; color: white; margin-bottom: 16px; }
        /* .hp-social-bar + .hp-social-item were the old minimal
           social-proof bar; replaced by .hp-social-bar-v2 with a
           richer value-prop grid. Kept empty to avoid churn in the
           @media block below referencing the legacy class. */

        /* ── Mobile comparison cards (hidden on desktop) ── */
        .hp-compare-cards { display: none; }

        @media (max-width: 768px) {
          .hp-nav-links { display: none; }
          .hp-nav-burger { display: block; }
          .hp-mobile-menu {
            display: flex; flex-direction: column; gap: 0;
            position: fixed; top: 56px; left: 0; right: 0; z-index: 99;
            background: white; border-bottom: 1px solid rgba(0,0,0,0.08);
            box-shadow: 0 8px 24px rgba(0,0,0,0.08);
          }
          .hp-mobile-menu a, .hp-mobile-menu button {
            padding: 16px 24px; text-decoration: none; color: ${DARK}; font-size: 16px; font-weight: 500;
            border: none; background: none; text-align: left; cursor: pointer; border-bottom: 1px solid rgba(0,0,0,0.05);
            font-family: 'DM Sans', sans-serif;
          }
          .hp-mobile-menu button { color: ${ORANGE}; font-weight: 600; }
          .hp-big-hero { padding: 64px 16px 48px; min-height: auto; }
          .hp-big-title { font-size: 34px !important; line-height: 1.08 !important; }
          /* On phones the rotating slot takes a full line so it
             doesn't wrap mid-phrase. The headline reads as two
             stacked lines: "Stop calling _____." / "Let homie do it." */
          .hp-rotator { min-width: 100% !important; display: block !important; text-align: center !important; }
          .hp-big-sub { font-size: 16px; }
          .hp-big-input-wrap { padding: 22px 20px 18px; border-radius: 24px; }
          .hp-big-textarea { font-size: 22px; min-height: 90px; }
          .hp-big-input-bar { flex-direction: column; align-items: stretch; }
          .hp-big-actions { justify-content: center; }
          .hp-big-send { width: 100%; padding: 14px; }
          .hp-big-chip { font-size: 12px; padding: 7px 12px; }
          .hp-section { padding: 60px 20px; }
          .hp-section-title { font-size: 28px; }
          .hp-section-sub { font-size: 16px; }
          /* Stack the 4-tile HowItWorks slab on phones. */
          .hp-hiw-grid { grid-template-columns: 1fr !important; gap: 2px; }
          /* Explainer — collapse to a single column and hide the
             sticky phone demo. The reasons alone read well. */
          .hp-explainer-grid { grid-template-columns: 1fr !important; gap: 32px !important; }
          .hp-explainer-phone { display: none !important; }
          .hp-compare-table { display: none; }
          .hp-compare-cards { display: flex; flex-direction: column; gap: 12px; }
          .hp-pricing-grid { grid-template-columns: 1fr; gap: 14px; }
          .hp-pricing-grid > div { padding: 20px 18px !important; border-radius: 16px !important; }
          .hp-pricing-price { font-size: 32px !important; }
          .hp-pricing-features { display: block; }
          .hp-pricing-grid button { font-size: 14px !important; padding: 12px 0 !important; margin-top: 12px !important; }
          .hp-popular-tag { font-size: 10px !important; padding: 3px 12px !important; top: -10px !important; }
          .hp-cta-title { font-size: 28px; }
          /* Social bar — tighter padding + smaller Fraunces text on phones. */
          .hp-social-bar-v2 { padding: 40px 20px !important; }
          .hp-social-grid { gap: 20px !important; }
          .hp-social-bar-v2 div[style*="Fraunces"] { font-size: 16px !important; }
          /* Drop the "old way vs homie way" block on mobile — per the
             design handoff it's desktop-only; mobile goes
             social → testimonials → pricing. */
          .hp-why-section { display: none !important; }
          /* Testimonials stack single column on phones. */
          .hp-testi-grid { grid-template-columns: 1fr !important; gap: 16px !important; }
          /* Sticky CTA shrinks on small screens so it doesn't block
             primary content while scrolling. */
          .hp-sticky-cta { font-size: 12px !important; padding: 4px 4px 4px 14px !important; bottom: 14px !important; }
          .hp-sticky-cta button { padding: 9px 14px !important; font-size: 12px !important; }
        }
      `}</style>

      {/* NAV */}
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
        background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(0,0,0,0.05)', padding: '0 20px', height: 56,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span onClick={() => navigate('/')} style={{ fontFamily: "'Fraunces', serif", fontSize: 24, fontWeight: 700, color: ORANGE, cursor: 'pointer' }}>homie</span>
        <div className="hp-nav-links">
          <a href="#how" style={{ textDecoration: 'none', color: '#6B6560', fontSize: 15, fontWeight: 500 }}>How it works</a>
          <a href="#pricing" style={{ textDecoration: 'none', color: '#6B6560', fontSize: 15, fontWeight: 500 }}>Pricing</a>
          <button onClick={() => navigate('/quote')} style={{
            background: ORANGE, color: 'white', border: 'none', borderRadius: 100,
            padding: '10px 24px', fontSize: 15, fontWeight: 600, cursor: 'pointer',
          }}>Get quotes now</button>
          <AvatarDropdown />
        </div>
        <button className="hp-nav-burger" onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? '\u2715' : '\u2630'}</button>
      </nav>
      {menuOpen && (
        <div className="hp-mobile-menu">
          <a href="#how" onClick={() => setMenuOpen(false)}>How it works</a>
          <a href="#pricing" onClick={() => setMenuOpen(false)}>Pricing</a>
          <button onClick={() => { setMenuOpen(false); navigate('/quote'); }}>Get quotes now</button>
          <button onClick={() => { setMenuOpen(false); navigate(authService.isAuthenticated() ? '/account' : '/login'); }}>
            {authService.isAuthenticated() ? 'My Account' : 'Sign in'}
          </button>
        </div>
      )}

      {/* HERO — V1b "Big Input" from the design handoff. The textarea
          + action buttons are the homepage's primary CTA; each path
          hands off to /quote with URL params that GetQuotes reads on
          mount to land the user in the right initial state. */}
      <BigInputHero
        onSubmit={(t) => {
          const params = new URLSearchParams({ prefill: t });
          navigate(`/quote?${params.toString()}`);
        }}
        onVoice={() => navigate('/quote?start=voice')}
        onVideo={() => navigate('/quote?start=video')}
        onPhoto={() => navigate('/quote')}
        onChip={(q) => {
          const params = new URLSearchParams({ prefill: q.prefill, category: q.category });
          navigate(`/quote?${params.toString()}`);
        }}
      />

      {/* SOCIAL PROOF BAR — value-prop grid on dark with an orange
          top border. Four Fraunces-set value statements paired with
          rounded orange checkmark tiles. Matches the design handoff. */}
      <section className="hp-social-bar-v2" style={{
        padding: '56px 32px', background: DARK,
        borderTop: `3px solid ${ORANGE}`,
      }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div className="hp-social-grid" style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: 32,
          }}>
            {[
              'No provider network required',
              'Works with any local pro',
              'AI calls, texts & fills forms simultaneously',
              'Pay only after you get results',
            ].map((t, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                <div style={{
                  flexShrink: 0, width: 28, height: 28, borderRadius: 8,
                  background: ORANGE, display: 'flex', alignItems: 'center',
                  justifyContent: 'center', marginTop: 2,
                }}>
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M2.5 7L5.5 10L11.5 4" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <div style={{
                  fontFamily: "'Fraunces', serif", fontSize: 20, fontWeight: 500,
                  color: '#fff', lineHeight: 1.35, letterSpacing: '-0.01em',
                }}>{t}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS — "Quotes in minutes, not days". 4-column grid
          of tiles, each with a small animated demo above the copy.
          Grid uses a 2px gap + shared outer border so the tiles look
          like a single connected slab (matches the design handoff). */}
      <section id="how" style={{ padding: '120px 32px', background: '#fff' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 64 }}>
            <div className="hp-chip hp-chip-orange" style={{ marginBottom: 16 }}>
              <span className="hp-chip-dot" /> How it works
            </div>
            <h2 style={{
              fontFamily: "'Fraunces', serif", fontSize: 52, fontWeight: 700,
              margin: '0 0 12px', color: DARK, letterSpacing: '-0.02em',
            }}>Quotes in minutes, not days</h2>
            <p style={{ fontSize: 18, color: '#6B6560', maxWidth: 560, margin: '0 auto' }}>
              What used to take an afternoon of phone calls now happens while you refill your coffee.
            </p>
          </div>
          <div className="hp-hiw-grid">
            <StepTile n={1} title="Describe the problem"   description="Type or talk. Homie figures out what you actually need and sends a thorough diagnostic to pros." />
            <StepTile n={2} title="Homie contacts pros"    description="Our agent calls, texts, and fills web forms for a dozen local pros — simultaneously." />
            <StepTile n={3} title="Quotes come back"       description="Real pricing, real availability, ranked by fit. No bidding, no waiting." />
            <StepTile n={4} title="Book and relax"         description="Pick your pro. They arrive already briefed. You never repeat yourself." />
          </div>
        </div>
      </section>

      {/* EXPLAINER — "Why homeowners love homie". Interactive left-
          side reasons list paired with a sticky phone-mock demo on
          the right. Tapping a reason swaps the phone screen. On
          phones the phone column is hidden (see .hp-explainer-grid
          mobile media rule). */}
      <Explainer />

      {/* COMPARISON — "The old way vs. the homie way". Dueling two-
          column cards on dark with soft orange/green glows. Each row
          is a pair of cells: Angi/Thumbtack's cross + grey copy on
          the left, homie's check + white copy on the right. Hidden
          on mobile (per the handoff, phones jump straight to
          testimonials). */}
      <section className="hp-section hp-why-section" style={{
        padding: '140px 32px', background: DARK, color: '#fff',
        position: 'relative', overflow: 'hidden',
      }}>
        {/* Soft orange + green radial glows */}
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: `radial-gradient(ellipse 60% 40% at 80% 10%, rgba(232,99,43,0.18), transparent 60%), radial-gradient(ellipse 50% 35% at 10% 90%, rgba(27,158,119,0.12), transparent 65%)`,
          pointerEvents: 'none',
        }} />
        <div style={{ maxWidth: 1200, margin: '0 auto', position: 'relative' }}>
          <div style={{ textAlign: 'center', marginBottom: 64 }}>
            <span style={{
              display: 'inline-block', padding: '6px 14px',
              background: 'rgba(232,99,43,0.15)', color: ORANGE,
              borderRadius: 100, fontSize: 13, fontWeight: 600,
              marginBottom: 20, border: '1px solid rgba(232,99,43,0.3)',
            }}>Why homie</span>
            <h2 style={{
              fontFamily: "'Fraunces', serif",
              fontSize: 'clamp(40px, 5.5vw, 64px)', fontWeight: 700,
              margin: '0 0 16px', letterSpacing: '-0.025em', lineHeight: 1.05,
              color: '#fff',
            }}>
              The old way vs. <em style={{ color: ORANGE, fontStyle: 'italic', fontWeight: 700 }}>the homie way</em>
            </h2>
            <p style={{
              fontSize: 19, color: 'rgba(255,255,255,0.6)',
              maxWidth: 600, margin: '0 auto', lineHeight: 1.5,
            }}>
              Angi and Thumbtack make you post a job and wait for bids. Homie goes out and finds pros for you &mdash; anywhere, usually within minutes.
            </p>
          </div>

          {/* Dueling column headers */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 4 }}>
            <div style={{
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,107,107,0.18)',
              borderRadius: '20px 20px 0 0',
              padding: '22px 28px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              borderBottom: 'none',
            }}>
              <div>
                <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 1.4, fontWeight: 700, marginBottom: 4 }}>The old way</div>
                <div style={{ fontFamily: "'Fraunces', serif", fontSize: 22, fontWeight: 700, color: 'rgba(255,255,255,0.85)', letterSpacing: '-0.01em' }}>Angi &middot; Thumbtack</div>
              </div>
              <div style={{
                width: 44, height: 44, borderRadius: 12,
                background: 'rgba(255,107,107,0.1)',
                border: '1px solid rgba(255,107,107,0.25)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#FF6B6B', fontSize: 20, fontWeight: 700,
              }}>&#10007;</div>
            </div>
            <div style={{
              background: 'linear-gradient(135deg, rgba(232,99,43,0.15), rgba(27,158,119,0.12))',
              border: `1px solid ${ORANGE}`,
              borderRadius: '20px 20px 0 0',
              padding: '22px 28px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              position: 'relative',
              boxShadow: `0 -4px 0 ${ORANGE}`,
            }}>
              <div>
                <div style={{ fontSize: 10.5, color: ORANGE, textTransform: 'uppercase', letterSpacing: 1.4, fontWeight: 700, marginBottom: 4 }}>The homie way</div>
                <div style={{ fontFamily: "'Fraunces', serif", fontSize: 22, fontWeight: 700, color: '#fff', letterSpacing: '-0.01em' }}>homie</div>
              </div>
              <div style={{
                width: 44, height: 44, borderRadius: 12,
                background: 'rgba(27,158,119,0.18)',
                border: `1px solid ${GREEN}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: GREEN, fontSize: 20, fontWeight: 700,
              }}>&#10003;</div>
            </div>
          </div>

          {/* Comparison rows */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0, borderRadius: '0 0 20px 20px', overflow: 'hidden' }}>
            {[
              { k: 'Diagnosis',     them: 'None',                     us: 'AI diagnostic with photo analysis' },
              { k: 'Finding pros',  them: 'Post a job, wait for bids', us: 'Agent actively calls, texts, fills forms' },
              { k: 'Provider pool', them: 'Their network only',       us: 'Any local pro — no signup required' },
              { k: 'Lead quality',  them: 'Generic requests',         us: 'Pre-qualified with full context' },
            ].map((row, i, arr) => {
              const last = i === arr.length - 1;
              return (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div style={{
                    background: 'rgba(255,255,255,0.02)',
                    borderLeft: '1px solid rgba(255,107,107,0.12)',
                    borderRight: '1px solid rgba(255,107,107,0.12)',
                    borderBottom: last ? '1px solid rgba(255,107,107,0.18)' : 'none',
                    borderRadius: last ? '0 0 0 20px' : 0,
                    padding: '26px 28px',
                    display: 'flex', gap: 16, alignItems: 'flex-start',
                  }}>
                    <div style={{
                      flexShrink: 0, width: 32, height: 32, borderRadius: 10,
                      background: 'rgba(255,107,107,0.08)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: '#FF6B6B', fontSize: 14, fontWeight: 700, marginTop: 2,
                    }}>&#10007;</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 1.2, fontWeight: 700, marginBottom: 6 }}>{row.k}</div>
                      <div style={{ fontSize: 16, color: 'rgba(255,255,255,0.7)', fontFamily: "'Fraunces', serif", fontWeight: 500, lineHeight: 1.4, letterSpacing: '-0.005em' }}>{row.them}</div>
                    </div>
                  </div>
                  <div style={{
                    background: 'rgba(232,99,43,0.04)',
                    borderLeft: `1px solid ${ORANGE}`,
                    borderRight: `1px solid ${ORANGE}`,
                    borderBottom: last ? `1px solid ${ORANGE}` : 'none',
                    borderRadius: last ? '0 0 20px 0' : 0,
                    padding: '26px 28px',
                    display: 'flex', gap: 16, alignItems: 'flex-start', position: 'relative',
                  }}>
                    <div style={{
                      flexShrink: 0, width: 32, height: 32, borderRadius: 10,
                      background: 'rgba(27,158,119,0.15)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: GREEN, fontSize: 14, fontWeight: 700, marginTop: 2,
                    }}>&#10003;</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 11, color: ORANGE, textTransform: 'uppercase', letterSpacing: 1.2, fontWeight: 700, marginBottom: 6 }}>{row.k}</div>
                      <div style={{ fontSize: 16, color: '#fff', fontFamily: "'Fraunces', serif", fontWeight: 600, lineHeight: 1.4, letterSpacing: '-0.005em' }}>{row.us}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Verdict footer pill */}
          <div style={{ marginTop: 40, display: 'flex', justifyContent: 'center' }}>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 14,
              background: 'rgba(232,99,43,0.08)',
              border: '1px solid rgba(232,99,43,0.25)',
              borderRadius: 100, padding: '12px 8px 12px 24px',
            }}>
              <span style={{ fontSize: 15, color: 'rgba(255,255,255,0.85)', fontFamily: "'Fraunces', serif", fontStyle: 'italic' }}>Stop posting jobs. Start getting quotes.</span>
              <button onClick={() => navigate('/quote')} style={{
                background: ORANGE, color: '#fff', border: 'none', borderRadius: 100,
                padding: '10px 22px', fontSize: 14, fontWeight: 700, cursor: 'pointer',
                boxShadow: '0 8px 20px -6px rgba(232,99,43,0.6)',
                fontFamily: "'DM Sans', sans-serif",
              }}>Try homie &rarr;</button>
            </div>
          </div>
        </div>
      </section>

      {/* TESTIMONIALS — three quote cards on warm backdrop. Matches
          the design handoff's V1S Testimonials section. Stacks to a
          single column on phones via .hp-testi-grid media rule. */}
      <section className="hp-section" style={{ padding: '100px 32px', background: '#fff' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div className="hp-testi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24 }}>
            {[
              { q: "I asked homie at 11pm. Woke up to three quotes.", a: "Jenna R.", loc: "Austin, TX" },
              { q: "It called pros I didn't even know existed.", a: "Marcus D.", loc: "San Diego, CA" },
              { q: "Booked the plumber in under 10 minutes.", a: "Priya S.", loc: "Brooklyn, NY" },
            ].map((t, i) => (
              <div key={i} style={{
                background: WARM, borderRadius: 20, padding: '32px 28px',
                border: '1px solid rgba(0,0,0,0.06)',
              }}>
                <div style={{
                  fontSize: 24, color: ORANGE, marginBottom: 14,
                  fontFamily: "'Fraunces', serif", lineHeight: 0,
                }}>&ldquo;</div>
                <p style={{
                  fontFamily: "'Fraunces', serif", fontSize: 22, fontWeight: 500,
                  lineHeight: 1.35, color: DARK, margin: '0 0 24px', letterSpacing: '-0.01em',
                }}>{t.q}</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: '50%',
                    background: `linear-gradient(135deg, ${ORANGE}, #C8531E)`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#fff', fontWeight: 700,
                  }}>{t.a[0]}</div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14, color: DARK }}>{t.a}</div>
                    <div style={{ fontSize: 12, color: '#9B9490' }}>{t.loc}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section id="pricing" className="hp-section" style={{ maxWidth: 1000, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <h2 className="hp-section-title" style={{ color: DARK }}>Pay only when you get results</h2>
          <p className="hp-section-sub">No subscription. No commitment. Zero cost if no providers respond.</p>
        </div>

        <div className="hp-pricing-grid">
          {([
            { tierId: 'standard', tier: 'Standard', time: '~2 hours', popular: false,
              features: ['Results in ~2 hours', '5 pros contacted via SMS + web', 'Full AI diagnostic included', 'Only charged if you get quotes'] },
            { tierId: 'priority', tier: 'Priority', time: '~30 minutes', popular: true,
              features: ['Results in ~30 minutes', '10 pros contacted simultaneously', 'AI voice calls + SMS + web', 'Full AI diagnostic included', 'Only charged if you get quotes'] },
            { tierId: 'emergency', tier: 'Emergency', time: '~15 minutes', popular: false,
              features: ['Results in ~15 minutes', '15 pros blitzed across all channels', 'Contacts closed businesses too', 'Human Outreach Manager gathers additional quotes', 'Full AI diagnostic included', 'Only charged if you get quotes'] },
          ] as const).map((t, i) => {
            const tierPricing = pricing.homeowner[t.tierId];
            const regularPrice = tierPricing ? centsToDisplay(tierPricing.priceCents) : '';
            const promoPrice = tierPricing?.promoPriceCents != null ? centsToDisplay(tierPricing.promoPriceCents) : null;
            return (
            <div key={i} style={{
              background: t.popular ? DARK : 'white', borderRadius: 20, padding: '32px 24px',
              border: t.popular ? 'none' : '1px solid rgba(0,0,0,0.08)', position: 'relative',
              boxShadow: t.popular ? '0 16px 60px rgba(45,41,38,0.2)' : 'none',
            }}>
              {t.popular && (
                <div className="hp-popular-tag" style={{
                  position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)',
                  background: ORANGE, color: 'white', fontSize: 11, fontWeight: 700,
                  padding: '4px 14px', borderRadius: 100, letterSpacing: '0.04em', whiteSpace: 'nowrap',
                }}>MOST POPULAR</div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: t.popular ? 'rgba(255,255,255,0.6)' : '#9B9490' }}>{t.tier}</div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <div className="hp-pricing-price" style={{ color: t.popular ? 'white' : DARK, margin: 0 }}>{promoPrice ?? regularPrice}</div>
                    {promoPrice && <div style={{ fontSize: 16, color: t.popular ? 'rgba(255,255,255,0.4)' : '#9B9490', textDecoration: 'line-through' }}>{regularPrice}</div>}
                  </div>
                  {tierPricing?.promoLabel && <div style={{ fontSize: 11, fontWeight: 600, color: ORANGE, marginTop: 2 }}>{tierPricing.promoLabel}</div>}
                  <div style={{ fontSize: 13, color: t.popular ? 'rgba(255,255,255,0.4)' : '#9B9490' }}>per search</div>
                </div>
                <div style={{
                  background: t.popular ? ORANGE : 'rgba(27,158,119,0.1)', borderRadius: 10, padding: '8px 14px',
                  textAlign: 'center',
                }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: t.popular ? 'white' : GREEN }}>{t.time.replace('~', '')}</div>
                  <div style={{ fontSize: 10, color: t.popular ? 'rgba(255,255,255,0.7)' : '#9B9490', fontWeight: 500 }}>avg response</div>
                </div>
              </div>
              <div className="hp-pricing-features">
                {t.features.map((f, j) => (
                  <div key={j} style={{
                    display: 'flex', alignItems: 'center', gap: 8, marginBottom: 9,
                    fontSize: 13, color: t.popular ? 'rgba(255,255,255,0.75)' : '#6B6560',
                  }}>
                    <span style={{ color: GREEN, flexShrink: 0 }}>&#10003;</span> {f}
                  </div>
                ))}
              </div>
              <button onClick={() => navigate('/quote')} style={{
                width: '100%', marginTop: 16, padding: '13px 0', borderRadius: 100, fontSize: 15, fontWeight: 600,
                cursor: 'pointer', border: 'none',
                background: t.popular ? ORANGE : WARM, color: t.popular ? 'white' : DARK,
              }}>
                {t.popular ? 'Get priority quotes' : `Choose ${t.tier.toLowerCase()}`}
              </button>
            </div>
            );
          })}
        </div>
        <p style={{ textAlign: 'center', fontSize: 12, color: '#9B9490', marginTop: 20, maxWidth: 480, margin: '20px auto 0', lineHeight: 1.5 }}>
          Quote response times may be longer outside of normal business hours, on weekends, and during holidays.
        </p>
      </section>

      {/* FINAL CTA — gradient orange band with a big Fraunces
          "Every home needs a homie." headline, a supporting line,
          and a single big white CTA. Design handoff treatment:
          linear-gradient + subtle white dot pattern, clamp-based
          responsive type, drop-shadowed CTA. */}
      <section style={{
        padding: '140px 32px', background: `linear-gradient(135deg, ${ORANGE}, #C8531E)`,
        textAlign: 'center', color: '#fff', position: 'relative', overflow: 'hidden',
      }}>
        {/* Subtle dot pattern backdrop */}
        <div style={{
          position: 'absolute', inset: 0, opacity: 0.1,
          backgroundImage: 'radial-gradient(circle at 20% 30%, white 2px, transparent 2px), radial-gradient(circle at 80% 70%, white 1px, transparent 1px)',
          backgroundSize: '60px 60px, 40px 40px',
          pointerEvents: 'none',
        }} />
        <div style={{ position: 'relative', maxWidth: 720, margin: '0 auto' }}>
          <h2 className="hp-cta-title" style={{
            fontFamily: "'Fraunces', serif",
            fontSize: 'clamp(40px, 6vw, 72px)', fontWeight: 700,
            margin: '0 0 20px', letterSpacing: '-0.02em', lineHeight: 1.05,
            color: '#fff',
          }}>Every home needs a homie.</h2>
          <p style={{
            fontSize: 20, opacity: 0.85, marginBottom: 36,
            maxWidth: 480, margin: '0 auto 36px', color: '#fff',
          }}>
            Stop spending hours calling around. Describe the problem, we&rsquo;ll handle the rest.
          </p>
          <button onClick={() => navigate('/quote')} style={{
            background: '#fff', color: ORANGE, border: 'none', borderRadius: 100,
            padding: '18px 36px', fontSize: 17, fontWeight: 700, cursor: 'pointer',
            boxShadow: '0 16px 40px -12px rgba(0,0,0,0.3)',
            fontFamily: "'DM Sans', sans-serif",
          }}>Get quotes now &rarr;</button>
        </div>
      </section>

      {/* STICKY CTA — appears once the user scrolls past the hero,
          gives a persistent one-tap route to /quote throughout the
          lower sections. */}
      <StickyCTA onClick={() => navigate('/quote')} />

      {/* FOOTER */}
      <footer style={{ background: DARK, padding: '64px 24px 40px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 40, marginBottom: 48 }}>
            <div>
              <span style={{ fontFamily: "'Fraunces', serif", fontWeight: 700, fontSize: 24, color: ORANGE }}>homie</span>
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: '#9B9490', lineHeight: 1.6, marginTop: 12 }}>AI-powered home services for property managers, hosts, and homeowners.</p>
            </div>
            <div>
              <h4 style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 700, color: '#D3CEC9', letterSpacing: 1, textTransform: 'uppercase', margin: '0 0 16px' }}>Product</h4>
              {[
                { label: 'For homeowners', href: '/' },
                { label: 'For property managers/hosts', href: '/business/landing' },
                { label: 'Homie Inspect', href: '/inspect' },
                { label: 'For inspectors', href: '/inspect/inspectors' },
                { label: 'Become a Homie Pro', href: '/portal/signup' },
              ].map(l => (
                <a key={l.label} href={l.href} style={{ display: 'block', fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: '#9B9490', textDecoration: 'none', marginBottom: 10 }}>{l.label}</a>
              ))}
            </div>
            <div>
              <h4 style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 700, color: '#D3CEC9', letterSpacing: 1, textTransform: 'uppercase', margin: '0 0 16px' }}>Company</h4>
              {['About', 'Blog', 'Careers', 'Contact'].map(l => (
                <a key={l} href="#" style={{ display: 'block', fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: '#9B9490', textDecoration: 'none', marginBottom: 10 }}>{l}</a>
              ))}
            </div>
            <div>
              <h4 style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 700, color: '#D3CEC9', letterSpacing: 1, textTransform: 'uppercase', margin: '0 0 16px' }}>Legal</h4>
              <a href="/privacy" style={{ display: 'block', fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: '#9B9490', textDecoration: 'none', marginBottom: 10 }}>Privacy</a>
              <a href="/terms" style={{ display: 'block', fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: '#9B9490', textDecoration: 'none', marginBottom: 10 }}>Terms</a>
              <a href="/security" style={{ display: 'block', fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: '#9B9490', textDecoration: 'none', marginBottom: 10 }}>Security</a>
            </div>
          </div>
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: '#9B9490' }}>&copy; {new Date().getFullYear()} Homie. Your home's best friend.</span>
            <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: '#9B9490' }}>Made with love in San Diego 🌴</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
