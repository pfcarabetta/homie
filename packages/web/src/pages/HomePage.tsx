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

function BigInputHero({
  onSubmit, onVoice, onVideo, onChip,
}: {
  onSubmit: (text: string) => void;
  onVoice: () => void;
  onVideo: () => void;
  onChip: (issue: QuickIssue) => void;
}) {
  const SAMPLE = "My kitchen faucet is dripping from the base — worse when hot water's on. 92103.";
  const [val, setVal] = useState('');
  const [focused, setFocused] = useState(false);
  const [typedIdx, setTypedIdx] = useState(0);
  const userInteractedRef = useRef(false);

  // Auto-type the sample when idle. The moment the user types, blurs
  // an edit, or clicks a chip, we freeze the autotype so we don't
  // fight their cursor. Also freezes once focused so the sample
  // doesn't scroll past their caret on first keystroke.
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
          <div className="hp-chip hp-chip-orange">
            <span className="hp-chip-dot" /> Describe it in your own words
          </div>
          <h1 className="hp-big-title">What&rsquo;s broken?</h1>
          <p className="hp-big-sub">
            Type it like you&rsquo;d text a friend. Homie handles diagnosis, outreach, and quotes.
          </p>
        </div>

        {/* The Big Input */}
        <div className={`hp-big-input-wrap${focused ? ' focused' : ''}`}>
          <div className="hp-big-input-eyebrow">&#9656; Tell homie about it</div>
          <textarea
            className="hp-big-textarea"
            value={text}
            onChange={e => handleChange(e.target.value)}
            onFocus={() => setFocused(true)}
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
                onClick={onVoice}
                title="Talk to Homie with your voice"
              >
                <span className="hp-big-action-ic">&#x1F3A4;</span> Talk to Homie
              </button>
              <button
                type="button"
                className="hp-big-action"
                onClick={onVideo}
                title="Video chat with Homie"
              >
                <span className="hp-big-action-ic">&#x1F4F9;</span> Video chat
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

        {/* Availability pill — moved below the input so it reads as
            a trust signal after the CTA, not a distraction above it. */}
        <div className="hp-avail-pill">
          <span className="hp-avail-dot" />
          <span>AI agent available 24/7 &middot; Pay only if pros quote</span>
        </div>
      </div>
    </section>
  );
}

/* -- How it works step -- */
function Step({ number, title, description, accent }: { number: number; title: string; description: string; accent: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const visible = useInView(ref);
  return (
    <div ref={ref} style={{
      opacity: visible ? 1 : 0, transform: visible ? 'translateY(0)' : 'translateY(30px)',
      transition: 'all 0.6s ease', transitionDelay: `${number * 0.12}s`,
    }}>
      <div style={{
        width: 44, height: 44, borderRadius: 12, background: accent, color: 'white',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 18, fontWeight: 700, marginBottom: 14,
      }}>{number}</div>
      <h3 className="hp-step-title">{title}</h3>
      <p style={{ fontSize: 15, lineHeight: 1.65, color: '#6B6560' }}>{description}</p>
    </div>
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
        .hp-big-hero-inner { max-width: 900px; width: 100%; margin: 0 auto; }
        .hp-big-hero-head { text-align: center; margin-bottom: 40px; }
        .hp-big-title {
          font-family: 'Fraunces', serif;
          font-size: clamp(44px, 6.5vw, 84px);
          font-weight: 700;
          line-height: 1.02;
          letter-spacing: -0.03em;
          color: ${DARK};
          margin: 18px 0 16px;
        }
        .hp-big-sub {
          font-size: 20px;
          color: #6B6560;
          max-width: 560px;
          margin: 0 auto;
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

        /* ── Availability pill ── */
        .hp-avail-pill {
          display: inline-flex; align-items: center; gap: 8px;
          background: rgba(27,158,119,0.08);
          padding: 8px 16px; border-radius: 100px;
          margin: 28px auto 0;
          font-size: 13px; font-weight: 500; color: ${GREEN};
        }
        .hp-avail-pill {
          display: flex; width: fit-content;
        }
        .hp-avail-dot {
          display: inline-block; width: 8px; height: 8px; border-radius: 50%;
          background: ${GREEN};
        }

        .hp-section { padding: 100px 32px; }
        .hp-section-title { font-family: 'Fraunces', serif; font-size: 40px; font-weight: 700; margin-bottom: 12px; }
        .hp-section-sub { font-size: 18px; color: #6B6560; }
        .hp-step-title { font-family: 'Fraunces', serif; font-size: 20px; font-weight: 600; color: ${DARK}; margin-bottom: 8px; }
        .hp-steps-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 40px; }
        .hp-compare-table { width: 100%; border-collapse: collapse; }
        .hp-compare-table th, .hp-compare-table td { padding: 16px 20px; font-size: 14px; }
        .hp-pricing-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 20px; }
        .hp-pricing-price { font-family: 'DM Sans', sans-serif; font-size: 44px; font-weight: 700; margin-bottom: 4px; }
        .hp-cta-title { font-family: 'Fraunces', serif; font-size: 40px; font-weight: 700; color: white; margin-bottom: 16px; }
        .hp-social-bar { display: flex; align-items: center; justify-content: center; gap: 48px; flex-wrap: wrap; padding: 24px 32px; }
        .hp-social-item { display: flex; align-items: center; gap: 8px; }

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
          .hp-big-title { font-size: 38px !important; }
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
          .hp-steps-grid { grid-template-columns: 1fr 1fr; gap: 24px; }
          .hp-compare-table { display: none; }
          .hp-compare-cards { display: flex; flex-direction: column; gap: 12px; }
          .hp-pricing-grid { grid-template-columns: 1fr; gap: 14px; }
          .hp-pricing-grid > div { padding: 20px 18px !important; border-radius: 16px !important; }
          .hp-pricing-price { font-size: 32px !important; }
          .hp-pricing-features { display: block; }
          .hp-pricing-grid button { font-size: 14px !important; padding: 12px 0 !important; margin-top: 12px !important; }
          .hp-popular-tag { font-size: 10px !important; padding: 3px 12px !important; top: -10px !important; }
          .hp-cta-title { font-size: 28px; }
          .hp-social-bar { gap: 16px; padding: 20px 16px; flex-direction: column; align-items: flex-start; }
          .hp-social-item { gap: 6px; }
          .hp-social-item span { font-size: 13px !important; }
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
        onChip={(q) => {
          const params = new URLSearchParams({ prefill: q.prefill, category: q.category });
          navigate(`/quote?${params.toString()}`);
        }}
      />

      {/* SOCIAL PROOF BAR */}
      <section className="hp-social-bar" style={{ background: DARK }}>
        {[
          'No provider network required',
          'Works with any local pro',
          'AI calls, texts & fills forms simultaneously',
          'Pay only after you get results',
        ].map((t, i) => (
          <div key={i} className="hp-social-item">
            <div style={{ color: GREEN, fontSize: 14 }}>&#10003;</div>
            <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: 14, fontWeight: 500 }}>{t}</span>
          </div>
        ))}
      </section>

      {/* HOW IT WORKS */}
      <section id="how" className="hp-section" style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <h2 className="hp-section-title" style={{ color: DARK }}>Quotes in minutes, not days</h2>
          <p className="hp-section-sub" style={{ maxWidth: 560, margin: '0 auto' }}>
            Our AI agent does the work that used to take you an entire afternoon of phone calls
          </p>
        </div>
        <div className="hp-steps-grid">
          <Step number={1} title="Describe what you need" description="Tell homie what you need help with — in plain English. Upload photos if you have them. Our AI figures out the rest." accent={ORANGE} />
          <Step number={2} title="AI contacts pros" description="Homie's agent simultaneously calls, texts, and fills out contact forms for local providers — all in real time." accent={DARK} />
          <Step number={3} title="Get quotes back" description="Providers respond with pricing and availability. You see everything in one place, ranked by fit." accent={GREEN} />
          <Step number={4} title="Book and relax" description="Pick the pro that works for you. They arrive already briefed on the issue. No explaining twice." accent={ORANGE} />
        </div>
      </section>

      {/* WHY HOMIE */}
      <section className="hp-section" style={{ background: DARK }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <h2 className="hp-section-title" style={{ color: 'white' }}>Not your typical home services platform</h2>
            <p className="hp-section-sub" style={{ color: 'rgba(255,255,255,0.5)', maxWidth: 520, margin: '0 auto' }}>
              Angi and Thumbtack make you wait for bids from their network. homie goes out and finds pros for you — anywhere.
            </p>
          </div>

          {/* Desktop table */}
          <div style={{ borderRadius: 16, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)' }}>
            <table className="hp-compare-table">
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', color: 'rgba(255,255,255,0.4)', fontWeight: 500, borderBottom: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.03)' }}></th>
                  <th style={{ textAlign: 'center', color: 'rgba(255,255,255,0.4)', fontWeight: 500, borderBottom: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.03)' }}>Thumbtack / Angi</th>
                  <th style={{ textAlign: 'center', fontWeight: 700, color: ORANGE, borderBottom: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.03)' }}>homie</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { category: 'Diagnosis', them: 'None — you describe the problem yourself', us: 'AI diagnostic with photo analysis & confidence score' },
                  { category: 'Finding pros', them: 'Post a job and wait for bids', us: 'AI agent actively calls, texts & contacts pros for you' },
                  { category: 'Provider pool', them: 'Limited to their signed-up network', us: 'Any local pro — no signup required' },
                  { category: 'Lead quality', them: 'Generic requests, high competition', us: 'Pre-qualified leads with full diagnosis & context' },
                ].map((row, i, arr) => (
                  <tr key={i} style={{ borderBottom: i < arr.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
                    <td style={{ fontWeight: 600, color: 'white' }}>{row.category}</td>
                    <td style={{ textAlign: 'center', color: 'rgba(255,255,255,0.4)' }}>
                      <span style={{ color: '#FF6B6B', marginRight: 6 }}>&#10007;</span>{row.them}
                    </td>
                    <td style={{ textAlign: 'center', color: 'rgba(255,255,255,0.85)', fontWeight: 500 }}>
                      <span style={{ color: GREEN, marginRight: 6 }}>&#10003;</span>{row.us}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="hp-compare-cards">
            {[
              { category: 'Diagnosis', them: 'None', us: 'AI diagnostic with photo analysis' },
              { category: 'Finding pros', them: 'Post and wait for bids', us: 'AI agent contacts pros for you' },
              { category: 'Provider pool', them: 'Their network only', us: 'Any local pro' },
              { category: 'Lead quality', them: 'Generic requests', us: 'Pre-qualified with diagnosis' },
            ].map((row, i) => (
              <div key={i} style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: '16px', border: '1px solid rgba(255,255,255,0.08)' }}>
                <div style={{ fontWeight: 700, color: 'white', fontSize: 15, marginBottom: 10 }}>{row.category}</div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 6, fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>
                  <span style={{ color: '#FF6B6B', flexShrink: 0 }}>&#10007;</span>
                  <span><span style={{ fontWeight: 600, color: 'rgba(255,255,255,0.3)' }}>Others:</span> {row.them}</span>
                </div>
                <div style={{ display: 'flex', gap: 8, fontSize: 13, color: 'rgba(255,255,255,0.85)' }}>
                  <span style={{ color: GREEN, flexShrink: 0 }}>&#10003;</span>
                  <span><span style={{ fontWeight: 600, color: ORANGE }}>homie:</span> {row.us}</span>
                </div>
              </div>
            ))}
          </div>

          <div style={{ textAlign: 'center', marginTop: 36 }}>
            <button onClick={() => navigate('/quote')} style={{
              background: ORANGE, color: 'white', border: 'none', borderRadius: 100,
              padding: '14px 32px', fontSize: 16, fontWeight: 600, cursor: 'pointer',
              boxShadow: '0 4px 24px rgba(232,99,43,0.3)',
            }}>See the difference — get quotes now</button>
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

      {/* CTA */}
      <section className="hp-section" style={{ background: ORANGE, textAlign: 'center' }}>
        <h2 className="hp-cta-title">Every home needs a homie.</h2>
        <p style={{ fontSize: 16, color: 'rgba(255,255,255,0.8)', marginBottom: 28, maxWidth: 440, margin: '0 auto 28px' }}>
          Stop spending hours calling around. Describe the problem, and homie handles the rest.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button onClick={() => navigate('/quote')} style={{
            background: 'white', color: ORANGE, border: 'none', borderRadius: 100,
            padding: '14px 32px', fontSize: 16, fontWeight: 700, cursor: 'pointer',
          }}>Get quotes now</button>
        </div>
      </section>

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
