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

/* -- Simulated outreach demo -- */
const DEMO_PROVIDERS = [
  { name: 'Rodriguez Plumbing', rating: 4.9, reviews: 214, quote: '$175', avail: 'Tomorrow 9-11 AM', channel: 'phone', note: 'Done hundreds of Moen cartridge swaps', delay: 3200 },
  { name: 'Atlas Home Services', rating: 4.7, reviews: 89, quote: '$150-200', avail: 'Wednesday afternoon', channel: 'text', note: 'Can bring the part with me', delay: 5800 },
  { name: 'Quick Fix Pros', rating: 4.6, reviews: 156, quote: '$195', avail: 'Thursday morning', channel: 'web', note: '15 years experience with Moen fixtures', delay: 8400 },
];

const OUTREACH_STEPS = [
  { time: 0, text: 'Finding plumbers near 92103...', providers: 0, contacted: 0, responded: 0 },
  { time: 800, text: '12 providers found. Starting outreach...', providers: 12, contacted: 0, responded: 0 },
  { time: 1600, text: 'Calling Rodriguez Plumbing...', providers: 12, contacted: 1, responded: 0 },
  { time: 2200, text: 'Texting Atlas Home Services...', providers: 12, contacted: 3, responded: 0 },
  { time: 3000, text: 'Rodriguez Plumbing quoted $175', providers: 12, contacted: 5, responded: 1 },
  { time: 4200, text: 'Submitting form on quickfixpros.com...', providers: 12, contacted: 7, responded: 1 },
  { time: 5600, text: 'Atlas Home Services quoted $150-200', providers: 12, contacted: 9, responded: 2 },
  { time: 7000, text: 'Following up with 3 more providers...', providers: 12, contacted: 11, responded: 2 },
  { time: 8200, text: 'Quick Fix Pros quoted $195', providers: 12, contacted: 12, responded: 3 },
  { time: 9500, text: '3 quotes ready! Here are your options:', providers: 12, contacted: 12, responded: 3 },
];

interface DemoProvider {
  name: string;
  rating: number;
  reviews: number;
  quote: string;
  avail: string;
  channel: string;
  note: string;
  delay: number;
}

function LiveDemo() {
  const [step, setStep] = useState(0);
  const [results, setResults] = useState<DemoProvider[]>([]);
  const [running, setRunning] = useState(false);
  const [hasRun, setHasRun] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const visible = useInView(ref, 0.3);

  useEffect(() => {
    if (visible && !hasRun) { setRunning(true); setHasRun(true); }
  }, [visible, hasRun]);

  useEffect(() => {
    if (!running) return;
    const timers = OUTREACH_STEPS.map((s, i) => setTimeout(() => setStep(i), s.time));
    const resultTimers = DEMO_PROVIDERS.map((p) => setTimeout(() => setResults(prev => [...prev, p]), p.delay));
    return () => { timers.forEach(clearTimeout); resultTimers.forEach(clearTimeout); };
  }, [running]);

  const current = OUTREACH_STEPS[step] || OUTREACH_STEPS[0];
  const pct = (current.contacted / Math.max(current.providers, 1)) * 100;

  return (
    <div ref={ref} className="hp-demo">
      <div style={{ padding: '12px 16px', background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#FF5F57' }} />
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#FEBC2E' }} />
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#28C840' }} />
        <span style={{ marginLeft: 8, color: 'rgba(255,255,255,0.4)', fontSize: 12, fontFamily: "'DM Mono', monospace" }}>homie-agent</span>
      </div>
      <div style={{ padding: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          {running && step < OUTREACH_STEPS.length - 1 ? (
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: ORANGE, animation: 'pulse 1.2s infinite', flexShrink: 0 }} />
          ) : results.length === 3 ? (
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: GREEN, flexShrink: 0 }} />
          ) : (
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'rgba(255,255,255,0.2)', flexShrink: 0 }} />
          )}
          <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13 }}>
            {running ? current.text : 'Ready to find providers...'}
          </span>
        </div>
        {running && (
          <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 6, height: 5, marginBottom: 16, overflow: 'hidden' }}>
            <div style={{ height: '100%', background: `linear-gradient(90deg, ${ORANGE}, ${GREEN})`, borderRadius: 6, width: `${pct}%`, transition: 'width 0.6s ease' }} />
          </div>
        )}
        {running && current.contacted > 0 && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            {[
              { label: 'Voice', icon: '\uD83D\uDCDE', count: Math.min(Math.floor(current.contacted * 0.4), 5) },
              { label: 'SMS', icon: '\uD83D\uDCAC', count: Math.min(Math.floor(current.contacted * 0.35), 4) },
              { label: 'Web', icon: '\uD83C\uDF10', count: Math.min(Math.floor(current.contacted * 0.25), 3) },
            ].map(ch => (
              <div key={ch.label} style={{ flex: 1, background: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: '8px 6px', textAlign: 'center' }}>
                <div style={{ fontSize: 14, marginBottom: 2 }}>{ch.icon}</div>
                <div style={{ color: 'white', fontSize: 14, fontWeight: 600 }}>{ch.count}</div>
                <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10 }}>{ch.label}</div>
              </div>
            ))}
          </div>
        )}
        {results.map((p, i) => (
          <div key={i} style={{
            background: 'rgba(255,255,255,0.06)', borderRadius: 10, padding: '10px 12px', marginBottom: 8,
            border: '1px solid rgba(255,255,255,0.08)', animation: 'slideUp 0.4s ease',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <div style={{ minWidth: 0 }}>
                <span style={{ color: 'white', fontWeight: 600, fontSize: 13 }}>{p.name}</span>
                <span className="hp-demo-meta" style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, marginLeft: 6 }}>&#9733; {p.rating}</span>
              </div>
              <span style={{ color: ORANGE, fontWeight: 700, fontSize: 16, flexShrink: 0, marginLeft: 8 }}>{p.quote}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>{p.avail}</span>
              <span style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.5)', fontSize: 10, padding: '1px 6px', borderRadius: 20 }}>
                via {p.channel}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
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

/* -- DIY section -- */
function DiagnosticPreview() {
  const [typed, setTyped] = useState('');
  const fullText = 'My kitchen faucet is dripping from the base when I turn it on...';
  const ref = useRef<HTMLDivElement>(null);
  const visible = useInView(ref, 0.4);

  useEffect(() => {
    if (!visible) return;
    let i = 0;
    const id = setInterval(() => {
      i++;
      setTyped(fullText.slice(0, i));
      if (i >= fullText.length) clearInterval(id);
    }, 35);
    return () => clearInterval(id);
  }, [visible]);

  return (
    <div ref={ref} style={{
      background: 'white', borderRadius: 16, maxWidth: 480, width: '100%',
      boxShadow: '0 8px 40px rgba(0,0,0,0.06)', border: '1px solid rgba(0,0,0,0.06)', overflow: 'hidden',
    }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(0,0,0,0.06)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: ORANGE, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ color: 'white', fontFamily: "'Fraunces', serif", fontWeight: 700, fontSize: 14 }}>h</span>
        </div>
        <div>
          <div style={{ fontWeight: 600, fontSize: 14, color: DARK }}>homie AI</div>
          <div style={{ fontSize: 11, color: '#9B9490' }}>Diagnosing...</div>
        </div>
      </div>
      <div style={{ padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
          <div style={{
            background: ORANGE, color: 'white', padding: '8px 14px', borderRadius: '14px 14px 4px 14px',
            maxWidth: '85%', fontSize: 13, lineHeight: 1.5, minHeight: 36,
          }}>
            {typed}<span style={{ opacity: typed.length < fullText.length ? 1 : 0, animation: 'blink 0.8s infinite' }}>|</span>
          </div>
        </div>
        {typed.length >= fullText.length && (
          <div style={{ display: 'flex', justifyContent: 'flex-start', animation: 'fadeIn 0.5s ease' }}>
            <div style={{
              background: WARM, padding: '8px 14px', borderRadius: '14px 14px 14px 4px',
              maxWidth: '85%', fontSize: 13, lineHeight: 1.6, color: DARK,
            }}>
              That sounds like a worn cartridge — super common on single-handle faucets. Can you tell me the brand? Look for a logo on the handle or base.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* -- Background scrolling mosaic (non-interactive) -- */
const BG_ISSUES = [
  { icon: '\uD83D\uDD27', text: 'Faucet leaking' },
  { icon: '\u2744\uFE0F', text: 'AC not cooling' },
  { icon: '\uD83D\uDCA1', text: 'Warm switch' },
  { icon: '\uD83D\uDEBD', text: 'Toilet running' },
  { icon: '\uD83D\uDD0C', text: 'Dead outlet' },
  { icon: '\uD83C\uDFE0', text: 'Roof leak' },
  { icon: '\uD83D\uDD28', text: 'Drywall crack' },
  { icon: '\uD83D\uDEAA', text: 'Door stuck' },
  { icon: '\uD83C\uDFA8', text: 'Paint peeling' },
  { icon: '\uD83E\uDDCA', text: 'Fridge noise' },
  { icon: '\uD83D\uDCA8', text: 'No heat' },
  { icon: '\uD83E\uDE9F', text: 'Drafty window' },
  { icon: '\u26A1', text: 'Breaker trips' },
  { icon: '\uD83D\uDEB0', text: 'Slow drain' },
  { icon: '\uD83D\uDD25', text: 'Oven broken' },
  { icon: '\uD83E\uDEB5', text: 'Fence leaning' },
  { icon: '\uD83D\uDCA7', text: 'Water stain' },
  { icon: '\uD83C\uDFD7\uFE0F', text: 'Foundation' },
  { icon: '\uD83C\uDF3F', text: 'Sprinkler' },
  { icon: '\uD83E\uDDFA', text: 'Washer issue' },
];

function BackgroundMosaic() {
  const columns = [[], [], [], []] as { icon: string; text: string }[][];
  const shuffled = [...BG_ISSUES].sort(() => Math.random() - 0.5);
  shuffled.forEach((item, i) => columns[i % 4].push(item));
  // Duplicate for seamless loop
  const cols = columns.map(col => [...col, ...col]);
  const durations = [26, 32, 22, 30];

  return (
    <div style={{
      position: 'absolute', inset: 0, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8,
      overflow: 'hidden', opacity: 0.35, pointerEvents: 'none',
      maskImage: 'linear-gradient(to bottom, transparent 0%, black 15%, black 85%, transparent 100%)',
      WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 15%, black 85%, transparent 100%)',
    }}>
      {cols.map((col, colIdx) => (
        <div key={colIdx} style={{
          display: 'flex', flexDirection: 'column', gap: 8,
          animation: `hpMosaicScroll ${durations[colIdx]}s linear infinite`,
        }}>
          {col.map((tile, i) => (
            <div key={`${colIdx}-${i}`} style={{
              background: 'white', border: '1px solid rgba(0,0,0,0.06)', borderRadius: 12,
              padding: '12px 6px', textAlign: 'center', flexShrink: 0,
            }}>
              <div style={{ fontSize: 20, marginBottom: 2 }}>{tile.icon}</div>
              <div style={{ fontSize: 10, fontWeight: 500, color: '#2D2926', lineHeight: 1.2 }}>{tile.text}</div>
            </div>
          ))}
        </div>
      ))}
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
        description="Stop calling around for home repair quotes. Homie's AI agent calls, texts, and emails local pros for you — and brings back quotes in minutes. Free DIY diagnostics included."
        canonical="/"
      />
      <style>{`
        @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.4; } }
        @keyframes slideUp { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:translateY(0); } }
        @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
        @keyframes blink { 0%,100% { opacity:1; } 50% { opacity:0; } }
        @keyframes hpMosaicScroll { 0% { transform: translateY(0); } 100% { transform: translateY(-50%); } }

        .hp-demo { background: ${DARK}; border-radius: 20px; overflow: hidden; max-width: 540px; width: 100%; box-shadow: 0 24px 80px rgba(0,0,0,0.25); }
        .hp-nav-links { display: flex; align-items: center; gap: 28px; }
        .hp-nav-burger { display: none; background: none; border: none; font-size: 24px; cursor: pointer; color: ${DARK}; }
        .hp-mobile-menu { display: none; }
        .hp-hero { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 100px 32px 60px; gap: 60px; flex-wrap: wrap; }
        .hp-hero-text { max-width: 520px; flex: 1 1 400px; }
        .hp-hero-demo { flex: 1 1 400px; display: flex; justify-content: center; }
        .hp-hero h1 { font-family: 'Fraunces', serif; font-size: 52px; font-weight: 700; line-height: 1.12; color: ${DARK}; margin-bottom: 20px; letter-spacing: -0.02em; }
        .hp-hero p.hp-sub { font-size: 20px; line-height: 1.65; color: #6B6560; margin-bottom: 36px; max-width: 460px; }
        .hp-section { padding: 100px 32px; }
        .hp-section-title { font-family: 'Fraunces', serif; font-size: 40px; font-weight: 700; margin-bottom: 12px; }
        .hp-section-sub { font-size: 18px; color: #6B6560; }
        .hp-step-title { font-family: 'Fraunces', serif; font-size: 20px; font-weight: 600; color: ${DARK}; margin-bottom: 8px; }
        .hp-steps-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 40px; }
        .hp-compare-table { width: 100%; border-collapse: collapse; }
        .hp-compare-table th, .hp-compare-table td { padding: 16px 20px; font-size: 14px; }
        .hp-diy-section { display: flex; align-items: center; gap: 60px; flex-wrap: wrap; }
        .hp-diy-text { flex: 1 1 400px; }
        .hp-diy-preview { flex: 1 1 400px; display: flex; justify-content: center; }
        .hp-diy-title { font-family: 'Fraunces', serif; font-size: 38px; font-weight: 700; color: ${DARK}; margin-bottom: 16px; line-height: 1.15; }
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
          .hp-hero { min-height: auto; padding: 80px 20px 40px; gap: 32px; flex-direction: column; }
          .hp-hero-text { flex: none; max-width: 100%; }
          .hp-hero-demo { flex: none; width: 100%; }
          .hp-hero h1 { font-size: 32px; }
          .hp-hero p.hp-sub { font-size: 16px; margin-bottom: 24px; }
          .hp-hero .hp-cta-buttons button, .hp-hero .hp-cta-buttons a { font-size: 15px; padding: 14px 24px; }
          .hp-section { padding: 60px 20px; }
          .hp-section-title { font-size: 28px; }
          .hp-section-sub { font-size: 16px; }
          .hp-steps-grid { grid-template-columns: 1fr 1fr; gap: 24px; }
          .hp-compare-table { display: none; }
          .hp-compare-cards { display: flex; flex-direction: column; gap: 12px; }
          .hp-diy-section { flex-direction: column; gap: 32px; }
          .hp-diy-text { flex: none; }
          .hp-diy-preview { flex: none; width: 100%; }
          .hp-diy-title { font-size: 28px; }
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
          .hp-demo { border-radius: 14px; }
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
          <a onClick={() => navigate('/chat')} style={{ textDecoration: 'none', color: '#6B6560', fontSize: 15, fontWeight: 500, cursor: 'pointer' }}>Free diagnostic</a>
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
          <a onClick={() => { setMenuOpen(false); navigate('/chat'); }} style={{ cursor: 'pointer' }}>Free diagnostic</a>
          <a href="#pricing" onClick={() => setMenuOpen(false)}>Pricing</a>
          <button onClick={() => { setMenuOpen(false); navigate('/quote'); }}>Get quotes now</button>
          <button onClick={() => { setMenuOpen(false); navigate(authService.isAuthenticated() ? '/account' : '/login'); }}>
            {authService.isAuthenticated() ? 'My Account' : 'Sign in'}
          </button>
        </div>
      )}

      {/* HERO */}
      <section className="hp-hero" style={{ background: `linear-gradient(180deg, white 0%, ${WARM} 100%)` }}>
        <div className="hp-hero-text">
          <div onClick={() => navigate('/chat')} style={{
            display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(27,158,119,0.08)',
            padding: '6px 14px', borderRadius: 100, marginBottom: 20, cursor: 'pointer',
          }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: GREEN }} />
            <span style={{ fontSize: 13, fontWeight: 500, color: GREEN }}>AI agent available 24/7</span>
          </div>

          <h1>
            Stop calling around.<br />
            <span style={{ color: ORANGE }}>Let homie do it.</span>
          </h1>

          <p className="hp-sub">
            From emergency repairs to planned upgrades — just describe what your home needs. Our AI agent simultaneously calls, texts, and contacts local pros on your behalf, and brings you back quotes and availability in minutes.
          </p>

          <div className="hp-cta-buttons" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 24 }}>
            <button onClick={() => navigate('/quote')} style={{
              background: ORANGE, color: 'white', border: 'none', borderRadius: 100,
              padding: '16px 32px', fontSize: 17, fontWeight: 600, cursor: 'pointer',
              boxShadow: '0 4px 24px rgba(232,99,43,0.3)',
            }}>Get quotes now</button>
            <button onClick={() => navigate('/chat')} style={{
              background: 'transparent', color: DARK, border: '2px solid rgba(0,0,0,0.12)', borderRadius: 100,
              padding: '14px 28px', fontSize: 17, fontWeight: 500, cursor: 'pointer',
              fontFamily: "'DM Sans', sans-serif",
            }}>Free DIY diagnostic &#8594;</button>
          </div>
        </div>

        <div className="hp-hero-demo">
          <LiveDemo />
        </div>
      </section>

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
                  { category: 'DIY support', them: 'None', us: 'Step-by-step guidance with tools & materials list' },
                ].map((row, i) => (
                  <tr key={i} style={{ borderBottom: i < 4 ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
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
              { category: 'DIY support', them: 'None', us: 'Step-by-step guidance' },
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

      {/* DIY DIAGNOSTIC */}
      <section id="diy" className="hp-section" style={{ background: WARM }}>
        <div className="hp-diy-section" style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div className="hp-diy-text">
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              background: 'rgba(232,99,43,0.08)', padding: '6px 14px', borderRadius: 100, marginBottom: 20,
            }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: ORANGE }}>100% free</span>
            </div>
            <h2 className="hp-diy-title">
              Not sure what's wrong?<br />Ask homie first.
            </h2>
            <p style={{ fontSize: 16, lineHeight: 1.65, color: '#6B6560', marginBottom: 24, maxWidth: 440 }}>
              Chat with our AI diagnostic engine for free. Describe what's happening, upload a photo, and get an expert-level diagnosis with DIY steps, cost estimates, and severity assessment — in under 2 minutes.
            </p>
            <ul style={{ listStyle: 'none', padding: 0, marginBottom: 28 }}>
              {[
                'Identifies issues across plumbing, electrical, HVAC, and more',
                'Photo analysis spots problems you might miss',
                'Step-by-step DIY instructions with tools needed',
                'Know if it\'s a $20 fix or a $2,000 problem',
              ].map((item, i) => (
                <li key={i} style={{
                  display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 10,
                  fontSize: 14, color: '#6B6560', lineHeight: 1.5,
                }}>
                  <span style={{ color: GREEN, fontSize: 16, flexShrink: 0 }}>&#10003;</span>
                  {item}
                </li>
              ))}
            </ul>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <button onClick={() => navigate('/chat')} style={{
                background: 'white', color: DARK, border: `2px solid ${DARK}`, borderRadius: 100,
                padding: '12px 24px', fontSize: 15, fontWeight: 600, cursor: 'pointer',
              }}>Try the free diagnostic</button>
              <span style={{ fontSize: 13, color: '#9B9490' }}>No account required</span>
            </div>
          </div>
          <div className="hp-diy-preview" style={{ position: 'relative', minHeight: 500, overflow: 'hidden' }}>
            <BackgroundMosaic />
            <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 500 }}>
              <DiagnosticPreview />
            </div>
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
          <button onClick={() => navigate('/chat')} style={{
            background: 'transparent', color: 'white', border: '2px solid rgba(255,255,255,0.4)', borderRadius: 100,
            padding: '12px 28px', fontSize: 16, fontWeight: 500, cursor: 'pointer',
          }}>Try free diagnostic</button>
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
