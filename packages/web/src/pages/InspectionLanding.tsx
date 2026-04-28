import { useState, useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import SEO from '@/components/SEO';
import { trackEvent } from '@/services/analytics';
import { captureReferrerIfPresent, getStoredReferrer } from '@/services/referral-tracking';

/**
 * Homie Inspect — landing page (Direction D · Combined).
 *
 * Composition follows the design handoff exactly:
 *   Nav → HeroA (PDF→items morph) → ModulesC (Items / Quotes / Home IQ)
 *       → NegotiationC (audience-aware doc card) → TiersB (editorial 3-up)
 *       → TestimonialsB (audience-aware) → FAQ → FinalCTA → Footer
 *
 * Audience toggle in the hero pivots buyer/owner copy across HeroA,
 * NegotiationC, TestimonialsB, and FinalCTA. Sections without buyer/
 * seller bias (Modules, Tiers, FAQ) read identically.
 */

// ─── Tokens ──────────────────────────────────────────────────────────
const C = {
  orange: '#E8632B', orangeH: '#C8531E', orangeSoft: 'rgba(232,99,43,.08)',
  green: '#1B9E77', greenH: '#168A68', greenSoft: 'rgba(27,158,119,.10)',
  greenLight: '#E1F5EE',
  red: '#DC2626', amber: '#D97706', monitor: '#9B9490',
  redSoft: 'rgba(220,38,38,.10)', amberSoft: 'rgba(217,119,6,.10)',
  dark: '#2D2926', darkMid: '#4A4543',
  muted: '#6B6560', meta: '#9B9490', faint: '#C4BFBB', line: '#E9E3DD',
  warm: '#F9F5F2', white: '#FFFFFF',
  inspectBlue: '#2563EB',
};
const FR: CSSProperties = { fontFamily: '"Fraunces", ui-serif, Georgia, serif' };
const DM: CSSProperties = { fontFamily: '"DM Sans", system-ui, sans-serif' };
const MO: CSSProperties = { fontFamily: '"DM Mono", ui-monospace, Menlo, monospace' };

// ─── Hooks ──────────────────────────────────────────────────────────
function useInView(threshold = 0.12): [React.RefObject<HTMLDivElement>, boolean] {
  const ref = useRef<HTMLDivElement>(null);
  const [v, setV] = useState(false);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setV(true); obs.disconnect(); } }, { threshold });
    obs.observe(el); return () => obs.disconnect();
  }, [threshold]);
  return [ref, v];
}

function FadeIn({ children, delay = 0, y = 14 }: { children: ReactNode; delay?: number; y?: number }) {
  const [ref, v] = useInView();
  return (
    <div ref={ref} style={{
      opacity: v ? 1 : 0, transform: v ? 'translateY(0)' : `translateY(${y}px)`,
      transition: `opacity .55s cubic-bezier(.2,.6,.2,1) ${delay}s, transform .55s cubic-bezier(.2,.6,.2,1) ${delay}s`,
    }}>{children}</div>
  );
}

// ─── Demo data ───────────────────────────────────────────────────────
const CATEGORIES: Record<string, { icon: string }> = {
  Plumbing:   { icon: '💧' },
  Electrical: { icon: '⚡' },
  HVAC:       { icon: '❄️' },
  Roofing:    { icon: '🏠' },
  Structural: { icon: '🏗️' },
  Appliances: { icon: '📦' },
  Foundation: { icon: '🏛️' },
};

interface SampleItem { id: number; title: string; cat: string; sev: string; loc: string; cost: string; }
const SAMPLE_ITEMS: SampleItem[] = [
  { id: 1, title: 'Water heater drain pan rusted, active drip', cat: 'Plumbing',   sev: 'recommended', loc: 'Basement utility room', cost: '$250–$400' },
  { id: 2, title: 'Missing GFCI outlets in two bathrooms',      cat: 'Electrical', sev: 'urgent',      loc: 'Bath 1 & 2',            cost: '$180–$320' },
  { id: 3, title: 'Roof flashing lifted near chimney',          cat: 'Roofing',    sev: 'urgent',      loc: 'NE elevation',          cost: '$300–$600' },
  { id: 4, title: 'HVAC condensate line clogged, slow drain',   cat: 'HVAC',       sev: 'recommended', loc: 'Attic air handler',     cost: '$140–$220' },
  { id: 5, title: 'Cracked grout in primary shower surround',   cat: 'Plumbing',   sev: 'monitor',     loc: 'Primary bath',          cost: '$120–$180' },
  { id: 6, title: 'Garbage disposal hum, no rotation',          cat: 'Appliances', sev: 'recommended', loc: 'Kitchen sink',          cost: '$160–$280' },
  { id: 7, title: 'Foundation hairline crack, vertical',        cat: 'Foundation', sev: 'monitor',     loc: 'SW corner',             cost: '$0–$400' },
];

const sevPalette = (sev: string): { fg: string; bg: string; label: string } => {
  if (sev === 'urgent')      return { fg: C.red,     bg: C.redSoft,                 label: 'Urgent' };
  if (sev === 'recommended') return { fg: C.amber,   bg: C.amberSoft,               label: 'Recommended' };
  return                            { fg: C.monitor, bg: 'rgba(155,148,144,.16)',   label: 'Monitor' };
};

const CARD: CSSProperties = {
  background: C.white,
  border: '1px solid rgba(0,0,0,.06)',
  borderRadius: 14,
  boxShadow: '0 12px 40px -20px rgba(0,0,0,.08)',
};

// ─── Atoms ───────────────────────────────────────────────────────────
type PillTone = 'neutral' | 'orange' | 'green' | 'blue' | 'dark' | 'amber' | 'red';
const PILL_TONES: Record<PillTone, { bg: string; fg: string }> = {
  neutral: { bg: 'rgba(0,0,0,.05)', fg: C.muted },
  orange:  { bg: C.orangeSoft, fg: C.orange },
  green:   { bg: C.greenSoft, fg: C.green },
  blue:    { bg: 'rgba(37,99,235,.10)', fg: C.inspectBlue },
  dark:    { bg: C.dark, fg: '#fff' },
  amber:   { bg: C.amberSoft, fg: C.amber },
  red:     { bg: C.redSoft, fg: C.red },
};
function Pill({ children, tone = 'neutral', style }: { children: ReactNode; tone?: PillTone; style?: CSSProperties }) {
  const t = PILL_TONES[tone];
  return (
    <span style={{
      ...DM, fontSize: 11, fontWeight: 600, letterSpacing: '.02em',
      background: t.bg, color: t.fg, padding: '4px 10px', borderRadius: 100,
      display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', ...style,
    }}>{children}</span>
  );
}

function Eyebrow({ children, color = C.orange }: { children: ReactNode; color?: string }) {
  return <span style={{ ...MO, fontSize: 11, fontWeight: 500, letterSpacing: '.18em', textTransform: 'uppercase', color }}>{children}</span>;
}

function PrimaryCTA({ children, onClick, size = 'lg', style, disabled = false }: { children: ReactNode; onClick?: () => void; size?: 'lg' | 'sm'; style?: CSSProperties; disabled?: boolean }) {
  const sz = size === 'lg' ? { padding: '15px 28px', fontSize: 16 } : { padding: '11px 22px', fontSize: 14 };
  return (
    <button onClick={onClick} disabled={disabled} style={{
      ...DM, ...sz, fontWeight: 600, color: '#fff', background: disabled ? C.meta : C.orange,
      border: 'none', borderRadius: 100, cursor: disabled ? 'not-allowed' : 'pointer',
      boxShadow: disabled ? 'none' : '0 4px 24px rgba(232,99,43,.30)',
      transition: 'background .2s, transform .2s', whiteSpace: 'nowrap',
      ...style,
    }}
    onMouseEnter={e => { if (!disabled) { e.currentTarget.style.background = C.orangeH; e.currentTarget.style.transform = 'translateY(-1px)'; } }}
    onMouseLeave={e => { if (!disabled) { e.currentTarget.style.background = C.orange; e.currentTarget.style.transform = 'translateY(0)'; } }}
    >{children}</button>
  );
}

function SevDot({ sev, size = 8 }: { sev: string; size?: number }) {
  const p = sevPalette(sev);
  return <span style={{ display: 'inline-block', width: size, height: size, borderRadius: '50%', background: p.fg }} />;
}

// ─── Brand bits ──────────────────────────────────────────────────────
function HomieInspectLogo() {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, lineHeight: 1 }}>
      <span style={{ ...FR, fontWeight: 700, fontSize: 26, color: C.orange }}>homie</span>
      <span style={{
        ...DM, fontSize: 10, fontWeight: 700, letterSpacing: '.14em',
        color: '#fff', background: C.inspectBlue, padding: '4px 8px', borderRadius: 100,
      }}>INSPECT</span>
    </span>
  );
}

function Nav({ onUpload }: { onUpload: () => void }) {
  return (
    <nav className="hi-nav" style={{
      position: 'sticky', top: 0, zIndex: 50, height: 64,
      background: 'rgba(255,255,255,.92)',
      backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
      borderBottom: '1px solid rgba(0,0,0,.05)',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 32px', ...DM,
    }}>
      <HomieInspectLogo />
      <div className="hi-nav-links" style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
        {[['How it works','#how-it-works'],['Home IQ','#home-iq'],['FAQ','#faq']].map(([l, h]) => (
          <a key={l} href={h} className="hi-nav-link" style={{ fontSize: 14, fontWeight: 500, color: C.muted, textDecoration: 'none' }}>{l}</a>
        ))}
        <a href="/inspect/inspectors" className="hi-nav-link" style={{ fontSize: 14, fontWeight: 500, color: C.muted, textDecoration: 'none' }}>For inspectors →</a>
        <PrimaryCTA size="sm" onClick={onUpload}>Upload your inspection</PrimaryCTA>
      </div>
    </nav>
  );
}

function HomieFooter() {
  // Mirrors the main / homepage footer exactly so navigating between
  // surfaces feels like the same product. Auto-fit grid handles
  // responsive collapse without needing per-breakpoint overrides.
  return (
    <footer style={{ background: C.dark, padding: '64px 24px 40px' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 40, marginBottom: 48 }}>
          <div>
            <span style={{ ...FR, fontWeight: 700, fontSize: 24, color: C.orange }}>homie</span>
            <p style={{ ...DM, fontSize: 14, color: '#9B9490', lineHeight: 1.6, marginTop: 12 }}>AI-powered home services for property managers, hosts, and homeowners.</p>
          </div>
          <div>
            <h4 style={{ ...DM, fontSize: 13, fontWeight: 700, color: '#D3CEC9', letterSpacing: 1, textTransform: 'uppercase', margin: '0 0 16px' }}>Product</h4>
            {[
              { label: 'For homeowners', href: '/' },
              { label: 'For property managers/hosts', href: '/business/landing' },
              { label: 'Homie Inspect', href: '/inspect' },
              { label: 'For inspectors', href: '/inspect/inspectors' },
              { label: 'Become a Homie Pro', href: '/portal/signup' },
            ].map(l => (
              <a key={l.label} href={l.href} style={{ display: 'block', ...DM, fontSize: 14, color: '#9B9490', textDecoration: 'none', marginBottom: 10 }}>{l.label}</a>
            ))}
          </div>
          <div>
            <h4 style={{ ...DM, fontSize: 13, fontWeight: 700, color: '#D3CEC9', letterSpacing: 1, textTransform: 'uppercase', margin: '0 0 16px' }}>Company</h4>
            {['About', 'Blog', 'Careers', 'Contact'].map(l => (
              <a key={l} href="#" style={{ display: 'block', ...DM, fontSize: 14, color: '#9B9490', textDecoration: 'none', marginBottom: 10 }}>{l}</a>
            ))}
          </div>
          <div>
            <h4 style={{ ...DM, fontSize: 13, fontWeight: 700, color: '#D3CEC9', letterSpacing: 1, textTransform: 'uppercase', margin: '0 0 16px' }}>Legal</h4>
            <a href="/privacy" style={{ display: 'block', ...DM, fontSize: 14, color: '#9B9490', textDecoration: 'none', marginBottom: 10 }}>Privacy</a>
            <a href="/terms" style={{ display: 'block', ...DM, fontSize: 14, color: '#9B9490', textDecoration: 'none', marginBottom: 10 }}>Terms</a>
            <a href="/security" style={{ display: 'block', ...DM, fontSize: 14, color: '#9B9490', textDecoration: 'none', marginBottom: 10 }}>Security</a>
          </div>
        </div>
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <span style={{ ...DM, fontSize: 13, color: '#9B9490' }}>&copy; {new Date().getFullYear()} Homie. Your home's best friend.</span>
          <span style={{ ...DM, fontSize: 13, color: '#9B9490' }}>Made with love in San Diego 🌴</span>
        </div>
      </div>
    </footer>
  );
}

// ─── Hero — PDF→items morph viz ──────────────────────────────────────
function HeroPDFMorph() {
  const [phase, setPhase] = useState<0 | 1>(0);
  useEffect(() => {
    const a = setInterval(() => setPhase(p => p === 0 ? 1 : 0), 4200);
    return () => clearInterval(a);
  }, []);

  return (
    <div className="hi-pdf-morph" style={{ position: 'relative', width: '100%', maxWidth: 480, margin: '0 auto' }}>
      <style>{`
        @keyframes hi-pulseDot { 0%,100% { opacity:1 } 50% { opacity:.35 } }
        @keyframes hi-scanLine { 0% { top: 0 } 100% { top: 100% } }
      `}</style>
      <div style={{
        position: 'absolute', inset: -16, borderRadius: 24,
        background: 'linear-gradient(135deg, rgba(232,99,43,.10), rgba(27,158,119,.06))',
        filter: 'blur(28px)', opacity: 0.8,
      }}/>
      <div className="hi-pdf-morph-stage" style={{ position: 'relative', perspective: 1400, height: 520 }}>
        {/* PDF page */}
        <div style={{
          position: 'absolute', inset: 0, background: '#fff', borderRadius: 16,
          boxShadow: '0 30px 80px -28px rgba(0,0,0,.18), 0 1px 0 rgba(0,0,0,.04)',
          padding: '28px 26px', overflow: 'hidden',
          transformOrigin: 'center left',
          transform: phase === 0 ? 'rotateY(0deg) translateX(0)' : 'rotateY(-22deg) translateX(-22px)',
          opacity: phase === 0 ? 1 : 0.35,
          transition: 'all .9s cubic-bezier(.2,.6,.2,1)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: `1px solid ${C.line}`, paddingBottom: 10, marginBottom: 14 }}>
            <span style={{ ...MO, fontSize: 10, color: C.meta, letterSpacing: '.16em' }}>PROPERTY INSPECTION REPORT</span>
            <span style={{ ...MO, fontSize: 10, color: C.meta }}>p. 47 / 92</span>
          </div>
          <div style={{ ...DM, fontSize: 11, color: C.dark, lineHeight: 1.65, position: 'relative' }}>
            <div style={{ ...FR, fontSize: 14, fontWeight: 700, marginBottom: 6 }}>4.3 — Plumbing — Water Heater</div>
            {[
              'The water heater (Bradford White, 50-gal, mfg. 2011) is located in the basement utility room. Drain pan exhibits significant rust along the front edge with what appears to be active drip activity from the temperature/pressure relief discharge tube.',
              'Recommend service by a licensed plumber to evaluate the T&P valve and verify drain pan integrity. Replacement of the drain pan and assessment of the unit\'s remaining service life is advised.',
              'Section 4.4 — Plumbing — Fixtures: cracked grout observed in primary shower surround at lower courses; recommend re-grouting to prevent moisture intrusion behind the tile.',
            ].map((t, i) => (
              <p key={i} style={{ margin: '0 0 8px', color: i === 1 ? C.muted : C.dark }}>{t}</p>
            ))}
            {phase === 0 && (
              <div style={{
                position: 'absolute', left: 0, right: 0, height: 2,
                background: `linear-gradient(90deg, transparent, ${C.orange}, transparent)`,
                animation: 'hi-scanLine 2.4s ease-in-out infinite',
                opacity: 0.55,
              }}/>
            )}
            <svg style={{ position: 'absolute', inset: 0, pointerEvents: 'none', opacity: phase === 0 ? 0.9 : 0, transition: 'opacity .5s' }}>
              <rect x="22" y="78" width="380" height="14" rx="3" fill={C.orange} fillOpacity="0.10"/>
              <rect x="22" y="146" width="320" height="14" rx="3" fill={C.amber} fillOpacity="0.10"/>
            </svg>
          </div>
        </div>

        {/* Parsed item card stack */}
        <div style={{
          position: 'absolute', inset: 0,
          opacity: phase === 1 ? 1 : 0,
          transform: phase === 1 ? 'translateX(0)' : 'translateX(28px)',
          transition: 'all .9s cubic-bezier(.2,.6,.2,1)',
          display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 10, padding: '0 6px',
        }}>
          {SAMPLE_ITEMS.slice(0, 5).map((it, i) => {
            const p = sevPalette(it.sev);
            return (
              <div key={it.id} style={{
                ...CARD, padding: '12px 14px', display: 'grid',
                gridTemplateColumns: '22px 1fr auto', gap: 12, alignItems: 'center',
                transform: phase === 1 ? 'translateY(0)' : 'translateY(8px)',
                opacity: phase === 1 ? 1 : 0,
                transition: `all .6s cubic-bezier(.2,.6,.2,1) ${0.15 + i * 0.08}s`,
              }}>
                <span style={{ fontSize: 16 }}>{CATEGORIES[it.cat]?.icon}</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ ...DM, fontSize: 12.5, fontWeight: 600, color: C.dark, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.title}</div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                    <Pill style={{ background: p.bg, color: p.fg }}><SevDot sev={it.sev}/> {p.label}</Pill>
                    <Pill>{it.cat}</Pill>
                  </div>
                </div>
                <span style={{ ...FR, fontWeight: 700, fontSize: 13, color: C.dark }}>{it.cost}</span>
              </div>
            );
          })}
        </div>

        {/* Floating count chip */}
        <div style={{
          position: 'absolute', top: -14, right: -14,
          background: C.dark, color: '#fff', padding: '8px 14px',
          borderRadius: 100, ...DM, fontSize: 12, fontWeight: 600,
          boxShadow: '0 12px 30px -8px rgba(0,0,0,.25)',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{ width: 6, height: 6, borderRadius: 3, background: C.green, animation: 'hi-pulseDot 1.4s infinite' }}/>
          {phase === 0 ? '92 pages · parsing' : '34 items · ready'}
        </div>
      </div>
    </div>
  );
}

// ─── HeroA — A1 from the design ──────────────────────────────────────
type Audience = 'buyer' | 'owner';
function HeroA({ headline, sub, audience, setAudience, onUpload }: {
  headline: string; sub: string; audience: Audience; setAudience: (a: Audience) => void; onUpload: () => void;
}) {
  return (
    <section className="hi-hero" style={{
      background: `linear-gradient(180deg, #fff 0%, ${C.warm} 80%, ${C.warm} 100%)`,
      padding: '72px 32px 96px', position: 'relative', overflow: 'hidden',
    }}>
      <div style={{ position: 'absolute', top: -180, right: -160, width: 540, height: 540, borderRadius: '50%', background: C.orange, opacity: 0.04, filter: 'blur(2px)' }}/>
      <div className="hi-hero-grid" style={{ maxWidth: 1200, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 48, alignItems: 'center' }}>
        <div>
          <FadeIn>
            <div style={{ display: 'inline-flex', gap: 4, padding: 4, background: '#fff', border: `1px solid ${C.line}`, borderRadius: 100, marginBottom: 24 }}>
              {(['buyer','owner'] as Audience[]).map(a => (
                <button key={a} onClick={() => setAudience(a)} style={{
                  ...DM, fontSize: 12, fontWeight: 600, padding: '6px 14px', border: 'none', borderRadius: 100, cursor: 'pointer',
                  background: audience === a ? C.dark : 'transparent',
                  color: audience === a ? '#fff' : C.muted,
                  transition: 'all .2s',
                }}>{a === 'buyer' ? 'Buying a home' : 'I own this home'}</button>
              ))}
            </div>
          </FadeIn>
          <FadeIn delay={0.05}>
            <h1 className="hi-hero-headline" style={{ ...FR, fontWeight: 700, fontSize: 'clamp(36px,5vw,64px)', lineHeight: 1.04, letterSpacing: '-0.02em', color: C.dark, margin: 0, textWrap: 'balance' }}>
              {headline}
            </h1>
          </FadeIn>
          <FadeIn delay={0.12}>
            <p style={{ ...DM, fontSize: 19, lineHeight: 1.55, color: C.muted, maxWidth: 520, margin: '20px 0 32px', textWrap: 'pretty' }}>
              {sub}
            </p>
          </FadeIn>
          <FadeIn delay={0.18}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
              <PrimaryCTA onClick={onUpload}>Upload your inspection</PrimaryCTA>
              <span style={{ ...DM, fontSize: 13, color: C.meta, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 14 }}>📄</span> PDF or HTML · parsed in 2–5 min · no signup
              </span>
            </div>
            <div style={{ marginTop: 14 }}>
              <a href="/inspect/inspectors" onClick={() => trackEvent('inspect_landing_cta_clicked', { cta_location: 'hero_inspector_link' })} style={{ ...DM, fontSize: 13, color: C.muted, textDecoration: 'none' }}>
                Are you a home inspector? <span style={{ color: C.inspectBlue, fontWeight: 600 }}>See the partner program →</span>
              </a>
            </div>
          </FadeIn>
          <FadeIn delay={0.28}>
            <div className="hi-hero-stats" style={{ display: 'flex', gap: 32, marginTop: 48, flexWrap: 'wrap' }}>
              {(audience === 'owner' ? [
                ['9 days', 'avg. days to first offer'],
                ['$4,820', 'credits avoided at table'],
                ['34 items', 'parsed per report'],
              ] : [
                ['$8,400', 'avg. negotiation credit'],
                ['2 hrs', 'report → real quotes'],
                ['34 items', 'parsed per report'],
              ]).map(([s, l]) => (
                <div key={l}>
                  <div className="hi-stat-num" style={{ ...FR, fontWeight: 700, fontSize: 30, color: C.orange, lineHeight: 1 }}>{s}</div>
                  <div style={{ ...DM, fontSize: 13, color: C.meta, marginTop: 4 }}>{l}</div>
                </div>
              ))}
            </div>
          </FadeIn>
        </div>
        <div className="hi-hero-visual" style={{ justifySelf: 'center', width: '100%', maxWidth: 520 }}>
          <FadeIn delay={0.2} y={20}>
            <HeroPDFMorph />
          </FadeIn>
        </div>
      </div>
    </section>
  );
}

// ─── ModulesC — C3: three product modules ────────────────────────────
function ItemsPreview() {
  return (
    <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 12, overflow: 'hidden', boxShadow: '0 16px 40px -16px rgba(0,0,0,.12)' }}>
      <div style={{ padding: '10px 14px', background: '#fbfaf7', borderBottom: `1px solid ${C.line}`, display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ ...DM, fontSize: 11, fontWeight: 600, color: C.dark }}>34 items · sorted by severity</span>
        <span style={{ ...DM, fontSize: 11, color: C.meta }}>4 urgent · 12 recommended</span>
      </div>
      {SAMPLE_ITEMS.slice(0, 6).map((it, i) => {
        const p = sevPalette(it.sev);
        return (
          <div key={it.id} style={{ display: 'grid', gridTemplateColumns: '8px 1fr auto auto', gap: 12, alignItems: 'center', padding: '10px 14px', borderBottom: i < 5 ? `1px solid ${C.line}` : 'none' }}>
            <span style={{ width: 4, height: 28, borderRadius: 2, background: p.fg }}/>
            <div>
              <div style={{ ...FR, fontSize: 13, fontWeight: 600, color: C.dark, letterSpacing: '-0.005em' }}>{it.title}</div>
              <div style={{ ...DM, fontSize: 10, color: C.meta }}>{it.cat} · {it.loc}</div>
            </div>
            <span style={{ ...DM, fontSize: 9, fontWeight: 600, color: p.fg, background: p.bg, padding: '2px 7px', borderRadius: 100 }}>{p.label}</span>
            <span style={{ ...FR, fontSize: 12, fontWeight: 600, color: C.dark, minWidth: 70, textAlign: 'right' }}>{it.cost}</span>
          </div>
        );
      })}
    </div>
  );
}

function QuotesPreview() {
  const provs = [
    { n: 'Atlas Plumbing',   s: '4.8★ · 142 jobs', p: '$295', when: 'Tomorrow 9–11 AM', best: true },
    { n: 'Bayside Plumbers', s: '4.7★ · 89 jobs',  p: '$340', when: 'Wed 10 AM' },
    { n: 'Coastal Repair',   s: '4.6★ · 211 jobs', p: '$385', when: 'Thu 1 PM' },
  ];
  return (
    <div className="hi-quotes-preview" style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 12, padding: 18, boxShadow: '0 16px 40px -16px rgba(0,0,0,.12)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div className="hi-quotes-title" style={{ ...FR, fontSize: 15, fontWeight: 700, color: C.dark, letterSpacing: '-0.005em' }}>3 quotes for: Water heater drain pan</div>
          <div className="hi-quotes-sub" style={{ ...DM, fontSize: 11, color: C.meta, marginTop: 2 }}>Dispatched 4 hrs ago · all licensed in San Diego County</div>
        </div>
        <Pill style={{ background: 'rgba(27,158,119,.10)', color: C.green, flexShrink: 0 }}>● Live</Pill>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {provs.map(p => (
          <div key={p.n} className="hi-quote-row" style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto auto', gap: 14, alignItems: 'center', padding: '12px 14px', border: `1px solid ${p.best ? C.orange : C.line}`, borderRadius: 10, background: p.best ? 'rgba(232,99,43,.04)' : '#fff' }}>
            <span className="hi-quote-avatar" style={{ width: 36, height: 36, borderRadius: '50%', background: C.line, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>🔧</span>
            <div style={{ minWidth: 0 }}>
              <div className="hi-quote-name-row" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ ...FR, fontSize: 14, fontWeight: 700, color: C.dark }}>{p.n}</span>
                {p.best && <span style={{ ...MO, fontSize: 9, fontWeight: 700, color: C.orange, letterSpacing: '.12em' }}>RECOMMENDED</span>}
              </div>
              <div style={{ ...DM, fontSize: 11, color: C.meta }}>{p.s} · {p.when}</div>
            </div>
            <div className="hi-quote-price" style={{ ...FR, fontSize: 18, fontWeight: 700, color: C.dark }}>{p.p}</div>
            <button className="hi-quote-action" style={{ ...DM, fontSize: 12, fontWeight: 600, background: p.best ? C.orange : '#fff', color: p.best ? '#fff' : C.dark, border: p.best ? 'none' : `1px solid ${C.line}`, padding: '7px 14px', borderRadius: 8, cursor: 'pointer' }}>{p.best ? 'Book' : 'View'}</button>
          </div>
        ))}
      </div>
    </div>
  );
}

function HomeIQPreviewC() {
  const rows: Array<[string, number, string]> = [
    ['💧 Plumbing',   62, C.amber],
    ['🏠 Roofing',    78, C.green],
    ['❄️ HVAC',       88, C.green],
    ['⚡ Electrical', 58, C.amber],
    ['🏗️ Structural', 82, C.green],
    ['📦 Appliances', 70, C.green],
  ];
  return (
    <div className="hi-iq-preview-wrap" style={{ background: `linear-gradient(135deg, ${C.dark}, #2c2724)`, borderRadius: 14, padding: 20, color: '#fff', boxShadow: '0 16px 40px -16px rgba(0,0,0,.20)' }}>
      <div className="hi-iq-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, alignItems: 'center' }}>
        <div className="hi-iq-gauge" style={{ position: 'relative', aspectRatio: '1 / 1', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="100%" height="100%" viewBox="0 0 200 200">
            <circle cx="100" cy="100" r="84" fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="14"/>
            <circle cx="100" cy="100" r="84" fill="none" stroke={C.orange} strokeWidth="14" strokeDasharray={`${(72/100) * 528} 528`} strokeLinecap="round" transform="rotate(-90 100 100)"/>
          </svg>
          <div style={{ position: 'absolute', textAlign: 'center' }}>
            <div className="hi-iq-gauge-num" style={{ ...FR, fontSize: 54, fontWeight: 700, color: '#fff', lineHeight: 1, letterSpacing: '-0.02em' }}>72</div>
            <div className="hi-iq-gauge-label" style={{ ...MO, fontSize: 10, letterSpacing: '.16em', color: 'rgba(255,255,255,.6)', marginTop: 4 }}>HOME IQ</div>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {rows.map(([n, v, col]) => (
            <div key={n} style={{ display: 'grid', gridTemplateColumns: '1fr 60px 26px', gap: 8, alignItems: 'center' }}>
              <span style={{ ...DM, fontSize: 11, color: 'rgba(255,255,255,.85)' }}>{n}</span>
              <div style={{ height: 5, background: 'rgba(255,255,255,.08)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ width: `${v}%`, height: '100%', background: col, borderRadius: 3 }}/>
              </div>
              <span style={{ ...MO, fontSize: 10, color: 'rgba(255,255,255,.6)', textAlign: 'right' }}>{v}</span>
            </div>
          ))}
        </div>
      </div>
      <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,.10)', display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ ...DM, fontSize: 11, color: 'rgba(255,255,255,.65)' }}>Better than 64% of 1965-built homes in 92103</span>
        <span style={{ ...DM, fontSize: 11, color: C.orange, fontWeight: 600 }}>+8 with one fix →</span>
      </div>
    </div>
  );
}

function ModulesC() {
  const mods = [
    { label: '01 · Items',
      title: 'Every finding becomes a line item',
      desc: 'A 92-page narrative becomes 34 actionable items — each tagged with severity, category, location, and cost range.',
      color: C.orange,
      preview: <ItemsPreview/> },
    { label: '02 · Quotes',
      title: 'Real prices from real local pros',
      desc: 'Tap any item and Homie\'s AI dispatches local providers. Quotes arrive in hours — not weeks of phone tag.',
      color: C.inspectBlue,
      preview: <QuotesPreview/> },
    { label: '03 · Home IQ',
      title: 'A score for every home, system, and component',
      desc: 'Public datasets benchmark your home against millions of others. See your weakest system and the one fix that lifts it most.',
      color: C.green,
      preview: <HomeIQPreviewC/> },
  ];
  return (
    <section id="how-it-works" className="hi-modules" style={{ background: '#fff', padding: '80px 28px' }}>
      <div style={{ maxWidth: 1340, margin: '0 auto' }}>
        <FadeIn>
          <div style={{ textAlign: 'center', marginBottom: 56 }}>
            <Eyebrow color={C.orange}>The product</Eyebrow>
            <h2 className="hi-section-headline" style={{ ...FR, fontWeight: 700, fontSize: 'clamp(32px,4.6vw,56px)', color: C.dark, margin: '14px 0 14px', lineHeight: 1.05, letterSpacing: '-0.02em', textWrap: 'balance' }}>
              Three modules. One link.
            </h2>
            <p style={{ ...DM, fontSize: 17, color: C.muted, maxWidth: 640, margin: '0 auto', textWrap: 'pretty' }}>
              Everything we do feeds one URL your inspector sends you within 5 minutes.
            </p>
          </div>
        </FadeIn>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {mods.map((m, i) => (
            <FadeIn key={m.label} delay={i * 0.06}>
              <div className="hi-module-card" style={{ display: 'grid', gridTemplateColumns: i % 2 === 0 ? '.85fr 1.15fr' : '1.15fr .85fr', gap: 32, alignItems: 'center', background: '#fbfaf7', border: `1px solid ${C.line}`, borderRadius: 18, padding: 32, overflow: 'hidden' }}>
                <div className="hi-module-text" style={{ order: i % 2 === 0 ? 1 : 2, padding: '8px 16px' }}>
                  <div style={{ ...MO, fontSize: 11, letterSpacing: '.18em', color: m.color, fontWeight: 700 }}>{m.label}</div>
                  <h3 className="hi-module-title" style={{ ...FR, fontSize: 32, fontWeight: 700, color: C.dark, margin: '10px 0 12px', letterSpacing: '-0.015em', lineHeight: 1.1, textWrap: 'balance' }}>{m.title}</h3>
                  <p style={{ ...DM, fontSize: 16, color: C.muted, margin: '0 0 18px', lineHeight: 1.6, textWrap: 'pretty' }}>{m.desc}</p>
                  <a href="#how-it-works" style={{ ...DM, fontSize: 13, fontWeight: 600, color: m.color, textDecoration: 'none', borderBottom: `2px solid ${m.color}`, paddingBottom: 1 }}>See it live →</a>
                </div>
                <div className="hi-module-preview" style={{ order: i % 2 === 0 ? 2 : 1 }}>{m.preview}</div>
              </div>
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── NegotiationC — C4: audience-aware doc card ──────────────────────
function NegotiationC({ audience }: { audience: Audience }) {
  const isOwner = audience === 'owner';
  const bullets: Array<[string, string]> = isOwner ? [
    ['📎', '14 line items, with status: Fixed / Credited / As-is'],
    ['🧾', '9 fixed at $4,820 — receipts attached'],
    ['💵', '5 credited at $4,380 — quoted by your pros'],
    ['🔁', 'Update and re-export anytime as offers come in'],
  ] : [
    ['📎', '14 line items, each with quoted price'],
    ['💵', '$11,200 total credit requested'],
    ['📄', 'Auto-formatted to match buyer/seller addendum'],
    ['🔁', 'Edit and re-export anytime'],
  ];
  const docRows: Array<[string, string]> = isOwner ? [
    ['Water heater drain pan rusted', 'Fixed · $295'],
    ['GFCI in two bathrooms',         'Fixed · $180'],
    ['Re-flash chimney saddle',       'Credit · $840'],
    ['Garbage disposal replacement',  'Fixed · $220'],
    ['+ 10 more items',               '$8,265'],
  ] : [
    ['Water heater drain pan rusted', '$295'],
    ['GFCI in two bathrooms',         '$180'],
    ['Re-flash chimney saddle',       '$840'],
    ['Garbage disposal replacement',  '$220'],
    ['+ 10 more items',               '$9,665'],
  ];
  return (
    <section className="hi-negotiation" style={{ background: C.warm, padding: '80px 28px' }}>
      <div className="hi-negotiation-grid" style={{ maxWidth: 1340, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 48, alignItems: 'center' }}>
        <FadeIn>
          <Eyebrow color={C.orange}>{isOwner ? 'For sellers' : 'For buyers'}</Eyebrow>
          <h2 className="hi-section-headline" style={{ ...FR, fontWeight: 700, fontSize: 'clamp(28px,4vw,52px)', color: C.dark, margin: '14px 0 14px', lineHeight: 1.05, letterSpacing: '-0.02em', textWrap: 'balance' }}>
            {isOwner
              ? <>List with a <span style={{ color: C.orange }}>packet,</span> not a prayer.</>
              : <>Walk into negotiation with a <span style={{ color: C.orange }}>number,</span> not a hope.</>}
          </h2>
          <p style={{ ...DM, fontSize: 16, color: C.muted, lineHeight: 1.6, marginBottom: 24, textWrap: 'pretty' }}>
            {isOwner
              ? 'Decide what to fix, what to credit, and what to disclose as-is. Homie generates a buyer-ready disclosure packet with line-item quotes and receipts attached, so questions land as math, not as surprises.'
              : 'Pick the items, pick the format (price reduction, repair credit, escrow holdback). Homie generates a polished repair-request package with line-item quotes attached.'}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 440 }}>
            {bullets.map(([i, t]) => (
              <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: '#fff', border: `1px solid ${C.line}`, borderRadius: 10 }}>
                <span style={{ fontSize: 18 }}>{i}</span>
                <span style={{ ...DM, fontSize: 14, color: C.dark }}>{t}</span>
              </div>
            ))}
          </div>
        </FadeIn>
        <FadeIn delay={0.1}>
          <div className="hi-negotiation-doc" style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, padding: '28px 32px', boxShadow: '0 30px 60px -28px rgba(0,0,0,.12)', maxWidth: 520, marginLeft: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: `1px solid ${C.line}`, paddingBottom: 14, marginBottom: 14 }}>
              <div>
                <div style={{ ...MO, fontSize: 10, letterSpacing: '.16em', color: C.meta }}>{isOwner ? 'PRE-LISTING PACKET · DRAFT' : 'REPAIR REQUEST · DRAFT'}</div>
                <div style={{ ...FR, fontSize: 18, fontWeight: 700, color: C.dark, marginTop: 4 }}>4825 Maple Ave</div>
              </div>
              <Pill style={{ background: 'rgba(27,158,119,.10)', color: C.green }}>● Ready</Pill>
            </div>
            {docRows.map(([n, p], i, a) => (
              <div key={n} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: i < a.length - 1 ? `1px solid ${C.line}` : 'none', ...DM, fontSize: 13, color: i === a.length - 1 ? C.meta : C.dark, fontStyle: i === a.length - 1 ? 'italic' : 'normal' }}>
                <span>{n}</span>
                <span style={{ ...FR, fontWeight: 600 }}>{p}</span>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '14px 0 0', marginTop: 8, borderTop: `2px solid ${C.dark}` }}>
              <span style={{ ...FR, fontSize: 16, fontWeight: 700, color: C.dark }}>{isOwner ? 'Total prep + credits' : 'Total credit requested'}</span>
              <span style={{ ...FR, fontSize: 22, fontWeight: 700, color: C.orange }}>{isOwner ? '$9,200' : '$11,200'}</span>
            </div>
          </div>
        </FadeIn>
      </div>
    </section>
  );
}

// ─── TiersB — B5: editorial 3-up with dark "popular" tier ────────────
function TiersB() {
  const tiers = [
    { name: 'Essential',    sub: 'Understand what\'s in your report', f: ['Item details', 'Severity ratings', 'AI cost estimates', 'Category breakdown'], pop: false },
    { name: 'Professional', sub: 'Real numbers from real pros',       f: ['Everything in Essential', 'Dispatch + provider quotes', 'Value-impact estimates', 'Lender flags'], pop: true },
    { name: 'Premium',      sub: 'Negotiate, plan, benchmark',        f: ['Everything in Professional', 'Negotiation documents', 'Maintenance timeline', 'Priority dispatch', 'Full Home IQ'], pop: false },
  ];
  return (
    <section className="hi-tiers" style={{ background: C.white, padding: '120px 36px' }}>
      <div style={{ maxWidth: 1240, margin: '0 auto' }}>
        <FadeIn>
          <h2 className="hi-section-headline" style={{ ...FR, fontWeight: 700, fontSize: 'clamp(34px,5vw,72px)', color: C.dark, margin: '0 0 8px', lineHeight: 1.0, letterSpacing: '-0.025em', maxWidth: 880, textWrap: 'balance' }}>
            Unlock your <em style={{ fontStyle: 'italic', color: C.orange }}>inspection report</em>.
          </h2>
          <p style={{ ...DM, fontSize: 17, lineHeight: 1.6, color: C.muted, maxWidth: 600, margin: '0 0 56px', textWrap: 'pretty' }}>
            Three tiers, full of features to get the most out of your inspection report.
          </p>
        </FadeIn>
        <div className="hi-tiers-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 0, border: `1px solid ${C.line}`, borderRadius: 16, overflow: 'hidden', background: '#fff' }}>
          {tiers.map((t, i) => (
            <FadeIn key={t.name} delay={i * 0.08}>
              <div className="hi-tier" data-popular={t.pop ? 'true' : 'false'} style={{ padding: 36, background: t.pop ? C.dark : '#fff', color: t.pop ? '#fff' : C.dark, borderRight: i < 2 ? `1px solid ${t.pop ? 'rgba(255,255,255,.1)' : C.line}` : 'none', position: 'relative', height: '100%' }}>
                {t.pop && <span style={{ position: 'absolute', top: 16, right: 16, ...DM, fontSize: 10, fontWeight: 700, color: C.orange, background: 'rgba(232,99,43,.18)', padding: '4px 10px', borderRadius: 100, letterSpacing: '.10em' }}>MOST POPULAR</span>}
                <div style={{ ...MO, fontSize: 10, letterSpacing: '.18em', color: t.pop ? 'rgba(255,255,255,.5)' : C.meta, textTransform: 'uppercase' }}>Tier {String(i + 1).padStart(2, '0')}</div>
                <h3 style={{ ...FR, fontWeight: 700, fontSize: 36, margin: '8px 0 6px', letterSpacing: '-0.015em', color: t.pop ? '#fff' : C.dark }}>{t.name}</h3>
                <p style={{ ...FR, fontSize: 18, fontStyle: 'italic', color: t.pop ? 'rgba(255,255,255,.7)' : C.muted, margin: '0 0 28px', fontWeight: 400 }}>{t.sub}</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {t.f.map(x => (
                    <div key={x} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                      <span style={{ color: t.pop ? '#7fe5c5' : C.green, fontWeight: 700, fontSize: 14 }}>✓</span>
                      <span style={{ ...DM, fontSize: 14, color: t.pop ? 'rgba(255,255,255,.9)' : C.dark }}>{x}</span>
                    </div>
                  ))}
                </div>
              </div>
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── TestimonialsB — B7: audience-aware editorial blockquote ─────────
function TestimonialsB({ audience }: { audience: Audience }) {
  const isOwner = audience === 'owner';
  const hero = isOwner ? {
    body: <>"We pre-listed with Homie's packet attached. Three offers in nine days, and not one repair-request reduction at the table. The buyer's agent told us they couldn't find anything to push back on — every line had a <span style={{ color: C.orange, fontWeight: 600, fontStyle: 'normal' }}>quote and a receipt</span> already."</>,
    cite: '— Priya R., seller, Austin',
  } : {
    body: <>"Our inspection found 14 items. By dinner I had quotes for everything. We negotiated an <span style={{ color: C.orange, fontWeight: 600, fontStyle: 'normal' }}>$11,200 credit</span> with quotes attached. Our agent had never seen a buyer come to the table that prepared."</>,
    cite: '— David T., first-time buyer, San Diego',
  };
  const small = isOwner ? [
    { q: 'My listing agent stopped calling them "surprises" and started calling them "line items." That shifted the whole tone of every showing.', n: 'Marcus B.', r: 'Seller · Raleigh' },
    { q: 'I priced the credits I didn\'t want to fix. The buyer accepted the math because the quotes were right there.',                            n: 'Dana K.',  r: 'Seller · Portland' },
  ] : [
    { q: 'I sold a house in three weeks because every "what about this?" was already answered with a fix and a receipt.',                            n: 'Priya R.', r: 'Seller · Austin' },
    { q: 'The Home IQ score told me which $400 fix would save my insurance rider. That alone paid for the whole thing.',                            n: 'Marcus B.', r: 'Owner · Raleigh' },
  ];
  return (
    <section className="hi-testimonials" style={{ background: C.dark, padding: '120px 36px', color: '#fff' }}>
      <div style={{ maxWidth: 1240, margin: '0 auto' }}>
        <FadeIn delay={0.05}>
          <blockquote className="hi-blockquote" style={{ ...FR, fontSize: 'clamp(24px,3.6vw,44px)', lineHeight: 1.25, fontWeight: 400, fontStyle: 'italic', color: '#fff', margin: '24px 0 36px', maxWidth: 1000, letterSpacing: '-0.005em', textWrap: 'balance' }}>
            {hero.body}
          </blockquote>
          <div style={{ ...DM, fontSize: 14, color: 'rgba(255,255,255,.7)' }}>{hero.cite}</div>
        </FadeIn>
        <div className="hi-testimonials-small" style={{ marginTop: 64, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 48, paddingTop: 48, borderTop: '1px solid rgba(255,255,255,.10)' }}>
          {small.map(Q => (
            <div key={Q.n}>
              <p style={{ ...FR, fontSize: 21, fontStyle: 'italic', lineHeight: 1.5, color: 'rgba(255,255,255,.92)', margin: '0 0 14px', fontWeight: 400, textWrap: 'pretty' }}>"{Q.q}"</p>
              <div style={{ ...DM, fontSize: 13, color: 'rgba(255,255,255,.6)' }}>— {Q.n}, {Q.r}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── FAQ — A8 ────────────────────────────────────────────────────────
const FAQS: Array<[string, string]> = [
  ['Who\'s Homie Inspect for?', 'Homeowners and home buyers. Both pre-purchase and post-close — same product, different use.'],
  ['Does this replace my home inspector?', 'No. Inspectors find the issues; Homie translates their report into actionable items, cost estimates, and real quotes. The inspector\'s expertise is the foundation.'],
  ['Do I pay for this?', 'Almost never. Your inspector picks a tier at upload and the cost is rolled into your inspection fee. You won\'t see a separate Homie charge.'],
  ['Is the AI accurate?', 'Every item is sourced directly from the inspector\'s findings — Homie never invents issues. Severity and cost ranges are AI-generated and confidence-rated; if confidence is low, the item is flagged for your inspector\'s review.'],
  ['What happens if parsing fails?', 'You\'ll get a notice and your inspector is alerted. Most failures are PDF formatting issues that resolve on re-upload. We don\'t bill for failed parses.'],
  ['Can I add documents later (sewer scope, radon, mold, pest, disclosure)?', 'Yes. Upload supplementals to the same property and they\'ll merge into one Home IQ profile, with cross-document references where relevant.'],
  ['Is my data private?', 'Your report and address are visible only to you and people you invite. Public-data benchmarks are computed from anonymous inputs — your address never leaves your account.'],
  ['Can my agent, spouse, or co-buyer access the report too?', 'Yes — invite by email from the share menu. They get view-only by default, with optional comment access.'],
  ['How do I find my report if I lost the email link?', 'Your inspector can re-send. Or sign in with the email you provided at inspection — your reports show up in your dashboard.'],
];

function FAQ() {
  const [open, setOpen] = useState<number>(0);
  return (
    <section id="faq" className="hi-faq" style={{ background: C.white, padding: '96px 32px' }}>
      <div style={{ maxWidth: 880, margin: '0 auto' }}>
        <FadeIn>
          <div style={{ marginBottom: 48, textAlign: 'center' }}>
            <Eyebrow>FAQ</Eyebrow>
            <h2 style={{ ...FR, fontWeight: 700, fontSize: 'clamp(30px,3.6vw,42px)', color: C.dark, margin: '12px 0 0', letterSpacing: '-0.01em' }}>Plainspoken answers.</h2>
          </div>
        </FadeIn>
        <div style={{ borderTop: `1px solid ${C.line}` }}>
          {FAQS.map(([q, a], i) => (
            <div key={q} style={{ borderBottom: `1px solid ${C.line}` }}>
              <button onClick={() => setOpen(open === i ? -1 : i)} style={{
                width: '100%', textAlign: 'left', padding: '22px 0', background: 'none', border: 'none', cursor: 'pointer',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, ...DM,
              }}>
                <span style={{ ...FR, fontSize: 19, fontWeight: 600, color: C.dark, letterSpacing: '-0.005em' }}>{q}</span>
                <span style={{ ...DM, fontSize: 22, color: open === i ? C.orange : C.meta, transition: 'transform .25s', transform: open === i ? 'rotate(45deg)' : 'rotate(0)' }}>+</span>
              </button>
              <div style={{ maxHeight: open === i ? 200 : 0, overflow: 'hidden', transition: 'max-height .35s ease' }}>
                <p style={{ ...DM, fontSize: 15, color: C.muted, lineHeight: 1.65, margin: '0 0 24px', maxWidth: 720, textWrap: 'pretty' }}>{a}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── FinalCTA — A9: audience-aware, warm gradient ────────────────────
function FinalCTA({ audience, onUpload }: { audience: Audience; onUpload: () => void }) {
  const isOwner = audience === 'owner';
  return (
    <section className="hi-final-cta" style={{ background: `linear-gradient(180deg, ${C.warm} 0%, #fff 100%)`, padding: '96px 32px' }}>
      <div style={{ maxWidth: 720, margin: '0 auto', textAlign: 'center' }}>
        <FadeIn>
          <Eyebrow>Ready when you are</Eyebrow>
          <h2 style={{ ...FR, fontWeight: 700, fontSize: 'clamp(36px,4.4vw,52px)', color: C.dark, margin: '14px 0 18px', lineHeight: 1.05, letterSpacing: '-0.02em', textWrap: 'balance' }}>
            {isOwner ? 'Your home is more than a listing. Make the offer real.' : 'Your inspection is more than a PDF. Make it count.'}
          </h2>
          <p style={{ ...DM, fontSize: 18, color: C.muted, lineHeight: 1.55, margin: '0 0 32px', maxWidth: 560, marginInline: 'auto', textWrap: 'pretty' }}>
            {isOwner
              ? 'Order a pre-listing inspection or upload one you already have. Homie parses, prices, and packets it for buyers.'
              : 'Upload your report and Homie does the rest — parse, price, dispatch, and benchmark.'}
          </p>
          <div style={{ display: 'flex', gap: 16, justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap' }}>
            <PrimaryCTA onClick={onUpload}>{isOwner ? 'Order a pre-listing inspection' : 'Upload your inspection'}</PrimaryCTA>
          </div>
          <p style={{ ...DM, fontSize: 13, color: C.meta, marginTop: 18, fontStyle: 'italic' }}>
            {isOwner
              ? 'Already have one in hand? Upload it — we\'ll convert it into a buyer-ready packet in minutes.'
              : 'Already received an inspection? Find your link in the email from your inspector.'}
          </p>
        </FadeIn>
      </div>
    </section>
  );
}

// ─── Page ────────────────────────────────────────────────────────────
const HEADLINES: Record<Audience, { headline: string; sub: string }> = {
  buyer: {
    headline: 'Your home inspection isn\'t a PDF. It\'s a plan.',
    sub: 'Your inspector finds the problems. Homie tells you exactly what they\'ll cost to fix — with real quotes from local pros, not guesswork. Negotiate with real numbers.',
  },
  owner: {
    headline: 'Your inspection isn\'t a disclosure. It\'s a deal closer.',
    sub: 'Pre-list, your inspection is the strongest signal you can offer. Homie turns every finding into a fix-it-or-credit-it line — with quotes already attached — so buyers stop asking "what about this?"',
  },
};

export default function HomieInspectionLanding() {
  const { homeowner } = useAuth();
  const [audience, setAudience] = useState<Audience>('buyer');
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Capture inspector partner referrer on first touch.
  useEffect(() => { captureReferrerIfPresent(); }, []);

  // Page-wide drag-and-drop overlay.
  useEffect(() => {
    let dragCounter = 0;
    const isFileDrag = (e: DragEvent): boolean => {
      const types = e.dataTransfer?.types;
      if (!types) return false;
      return Array.from(types).includes('Files');
    };
    const onDragEnter = (e: DragEvent) => {
      if (!isFileDrag(e)) return;
      e.preventDefault(); dragCounter++;
      if (dragCounter === 1) setDragActive(true);
    };
    const onDragOver = (e: DragEvent) => { if (isFileDrag(e)) e.preventDefault(); };
    const onDragLeave = (e: DragEvent) => {
      if (!isFileDrag(e)) return;
      e.preventDefault(); dragCounter--;
      if (dragCounter <= 0) { dragCounter = 0; setDragActive(false); }
    };
    const onDrop = (e: DragEvent) => {
      if (!isFileDrag(e)) return;
      e.preventDefault(); dragCounter = 0; setDragActive(false);
      const file = e.dataTransfer?.files[0];
      if (file) void handleFileUpload(file);
    };
    window.addEventListener('dragenter', onDragEnter);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onDragEnter);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('drop', onDrop);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function triggerUpload() {
    if (uploading) return;
    trackEvent('inspect_landing_cta_clicked', { cta_location: 'upload_button' });
    fileInputRef.current?.click();
  }

  async function handleFileUpload(file: File) {
    if (file.size > 50 * 1024 * 1024) { alert('File too large (max 50MB)'); return; }
    const uploadStartedAt = Date.now();
    trackEvent('inspect_upload_started', { source: 'consumer_landing' });
    setUploading(true);
    setUploadStatus('Uploading report...');
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(file);
      });
      setUploadStatus('Processing with AI...');
      const { inspectService } = await import('@/services/inspector-api');
      const referrerPartner = getStoredReferrer();
      const res = await inspectService.uploadReport({
        report_file_data_url: dataUrl,
        ...(referrerPartner ? { referrer_partner: referrerPartner } : {}),
      });
      if (!res.data) {
        trackEvent('inspect_upload_failed', { source: 'consumer_landing', reason: 'upload_api_error' });
        setUploadStatus(null); setUploading(false); alert('Upload failed'); return;
      }
      const reportId = res.data.reportId;
      const token = res.data.token;
      trackEvent('inspect_report_uploaded', {
        source: 'consumer_landing',
        report_id: reportId,
        file_size_kb: Math.round(file.size / 1024),
      });
      setUploadStatus('Parsing inspection items...');
      const poll = async () => {
        for (let i = 0; i < 60; i++) {
          await new Promise(r => setTimeout(r, 5000));
          try {
            const status = await inspectService.getUploadStatus(reportId);
            if (status.data?.parsingStatus === 'parsed' || status.data?.parsingStatus === 'review_pending') {
              trackEvent('inspect_upload_parsed', {
                source: 'consumer_landing',
                report_id: reportId,
                time_to_parse_ms: Date.now() - uploadStartedAt,
              });
              setUploadStatus(`${status.data.itemsParsed} items found! Redirecting...`);
              const destination = homeowner
                ? `/inspect-portal?tab=reports&report=${reportId}`
                : `/inspect/${token}`;
              setTimeout(() => { window.location.href = destination; }, 1500);
              return;
            }
            if (status.data?.parsingStatus === 'failed') {
              trackEvent('inspect_upload_failed', { source: 'consumer_landing', reason: 'parse_failed' });
              setUploadStatus(null); setUploading(false);
              alert(status.data.parsingError || 'Failed to parse report');
              return;
            }
            if (status.data?.itemsParsed && status.data.itemsParsed > 0) {
              setUploadStatus(`Found ${status.data.itemsParsed} items so far...`);
            }
          } catch { /* keep polling */ }
        }
        trackEvent('inspect_upload_failed', { source: 'consumer_landing', reason: 'parse_timeout' });
        setUploadStatus(null); setUploading(false);
        alert('Parsing is taking longer than expected. Check back shortly.');
      };
      void poll();
    } catch (err) {
      trackEvent('inspect_upload_failed', { source: 'consumer_landing', reason: 'unexpected_error' });
      setUploadStatus(null); setUploading(false);
      alert((err as Error).message || 'Upload failed');
    }
  }

  const copy = HEADLINES[audience];

  return (
    <div style={{ ...DM, background: C.white, minHeight: '100vh' }}>
      <SEO
        title="Homie Inspect — Real items, real quotes, from any inspection report"
        description="Upload your home inspection PDF and Homie's AI turns it into actionable items with real cost estimates, local provider quotes, and a Home IQ benchmark."
        canonical="/inspect"
      />
      <link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;0,9..144,600;0,9..144,700;1,9..144,400;1,9..144,500;1,9..144,600&family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />

      {/* Responsive rules. Two breakpoints — 768 (tablet/mobile) and 480
          (small phones). Single source of truth so the inline-style
          components above can stay focused on desktop layout. */}
      <style>{`
        @media (max-width: 768px) {
          .hi-nav { padding: 0 20px !important; }
          .hi-nav-links { gap: 12px !important; }
          .hi-nav-link { display: none !important; }

          .hi-hero { padding: 56px 20px 64px !important; }
          .hi-hero-grid { grid-template-columns: 1fr !important; gap: 40px !important; }
          .hi-hero-visual { order: 2; max-width: 360px !important; margin: 0 auto !important; }
          .hi-hero-stats { gap: 24px !important; margin-top: 32px !important; }
          .hi-stat-num { font-size: 26px !important; }
          .hi-pdf-morph { max-width: 360px !important; }
          .hi-pdf-morph-stage { height: 440px !important; }

          .hi-modules { padding: 56px 20px !important; }
          .hi-module-card { grid-template-columns: minmax(0, 1fr) !important; padding: 24px !important; gap: 24px !important; }
          .hi-module-text { padding: 0 !important; order: 1 !important; min-width: 0 !important; }
          .hi-module-preview { order: 2 !important; min-width: 0 !important; overflow: hidden !important; }
          .hi-module-title { font-size: 26px !important; }

          .hi-negotiation { padding: 56px 20px !important; }
          .hi-negotiation-grid { grid-template-columns: 1fr !important; gap: 32px !important; }
          .hi-negotiation-doc { margin: 0 auto !important; padding: 22px 22px !important; }

          .hi-tiers { padding: 64px 20px !important; }
          .hi-tiers-grid { grid-template-columns: 1fr !important; }
          .hi-tier { border-right: none !important; border-bottom: 1px solid rgba(0,0,0,.06) !important; padding: 28px !important; }
          .hi-tier[data-popular="true"] { border-bottom-color: rgba(255,255,255,.10) !important; }
          .hi-tier:last-child { border-bottom: none !important; }

          .hi-testimonials { padding: 72px 20px !important; }
          .hi-testimonials-small { grid-template-columns: 1fr !important; gap: 32px !important; }

          .hi-faq { padding: 64px 20px !important; }

          .hi-final-cta { padding: 64px 20px !important; }

          .hi-section-headline { font-size: clamp(28px, 6.5vw, 40px) !important; }

          /* QuotesPreview — drop the action button on mobile (it's
             decorative on the landing) and tighten the inner padding so
             the price stops crowding the right edge. */
          .hi-quotes-preview { padding: 14px !important; }
          .hi-quote-row { grid-template-columns: 32px minmax(0, 1fr) auto !important; gap: 10px !important; padding: 10px 12px !important; }
          .hi-quote-avatar { width: 32px !important; height: 32px !important; font-size: 13px !important; }
          .hi-quote-action { display: none !important; }
          .hi-quote-price { font-size: 15px !important; }
          .hi-quote-name-row span:first-child { font-size: 13px !important; }

          /* HomeIQ — stack gauge above system rows and shrink the score
             so the "72" sits inside the dial instead of overflowing. */
          .hi-iq-grid { grid-template-columns: 1fr !important; gap: 18px !important; }
          .hi-iq-gauge { aspect-ratio: 1 / 1 !important; max-width: 200px !important; margin: 0 auto !important; }
          .hi-iq-gauge-num { font-size: 44px !important; }
        }
        @media (max-width: 480px) {
          .hi-nav { padding: 0 14px !important; }
          .hi-nav button { padding: 9px 14px !important; font-size: 13px !important; }
          .hi-hero { padding: 40px 16px 56px !important; }
          .hi-hero-headline { font-size: clamp(30px, 8vw, 38px) !important; }
          .hi-hero-stats { gap: 16px !important; }
          .hi-stat-num { font-size: 22px !important; }
          .hi-pdf-morph-stage { height: 380px !important; }
          .hi-module-card { padding: 18px !important; }
          .hi-module-title { font-size: 22px !important; }
          .hi-tier { padding: 24px !important; }
          .hi-blockquote { font-size: 22px !important; }
          .hi-quote-row { padding: 10px !important; gap: 8px !important; }
          .hi-quote-price { font-size: 14px !important; }
          .hi-iq-gauge-num { font-size: 38px !important; }
          .hi-iq-gauge { max-width: 170px !important; }
        }
      `}</style>

      {/* Hidden file input */}
      <input
        ref={fileInputRef} type="file" accept="application/pdf,text/html"
        style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; if (f) void handleFileUpload(f); }}
      />

      <Nav onUpload={triggerUpload} />
      <HeroA headline={copy.headline} sub={copy.sub} audience={audience} setAudience={setAudience} onUpload={triggerUpload} />
      <ModulesC />
      <NegotiationC audience={audience} />
      <TiersB />
      <TestimonialsB audience={audience} />
      <FAQ />
      <FinalCTA audience={audience} onUpload={triggerUpload} />
      <HomieFooter />

      {/* Drag-active overlay */}
      {dragActive && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 100,
          background: 'rgba(45,41,38,.85)', backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          ...DM, color: '#fff', textAlign: 'center', pointerEvents: 'none',
        }}>
          <div>
            <div style={{ fontSize: 80, marginBottom: 16 }}>📄</div>
            <div style={{ ...FR, fontSize: 36, fontWeight: 700, marginBottom: 8 }}>Drop to upload</div>
            <div style={{ ...DM, fontSize: 16, opacity: 0.7 }}>Your report parses in 2–5 minutes</div>
          </div>
        </div>
      )}

      {/* Upload-status toast */}
      {uploadStatus && (
        <div style={{
          position: 'fixed', bottom: 32, right: 32, zIndex: 99,
          background: C.dark, color: '#fff', padding: '14px 20px', borderRadius: 100,
          boxShadow: '0 16px 40px -12px rgba(0,0,0,.35)',
          ...DM, fontSize: 14, fontWeight: 600,
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: C.green, animation: 'hi-pulseDot 1.4s infinite' }}/>
          {uploadStatus}
        </div>
      )}
    </div>
  );
}
