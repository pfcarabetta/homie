import { useState, useEffect, useRef, type ReactNode, type CSSProperties } from "react";
import SEO from '@/components/SEO';
import { trackEvent } from '@/services/analytics';

const C = {
  orange: "#E8632B", orangeDark: "#C8531E",
  green: "#1B9E77", greenLight: "#E1F5EE",
  dark: "#2D2926", darkMid: "#4A4543",
  gray: "#9B9490", grayLight: "#D3CEC9",
  warm: "#F9F5F2", white: "#FFFFFF",
};

const dm: CSSProperties = { fontFamily: "'DM Sans', sans-serif" };
const fr: CSSProperties = { fontFamily: "Fraunces, serif" };

function useInView(t = 0.15): [React.RefObject<HTMLDivElement>, boolean] {
  const ref = useRef<HTMLDivElement>(null!);
  const [v, setV] = useState(false);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setV(true); obs.disconnect(); } }, { threshold: t });
    obs.observe(el); return () => obs.disconnect();
  }, [t]);
  return [ref, v];
}

function FadeIn({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
  const [ref, v] = useInView();
  return <div ref={ref} style={{ opacity: v ? 1 : 0, transform: v ? "translateY(0)" : "translateY(20px)", transition: `opacity 0.6s ease ${delay}s, transform 0.6s ease ${delay}s` }}>{children}</div>;
}

// ─── ClientPortalDemo ──────────────────────────────────────────────────────
// Tier-tabbed visual mockups of the homeowner portal so inspectors can see
// exactly which features unlock at each tier they sell. The mockups are
// stylized — not screenshots — but mirror real components & data shapes
// from packages/web/src/pages/homeowner-inspect/ (severity badges, category
// icons, item cards, quote cards, repair-request docs, IQ timeline). When
// the homeowner portal evolves, update these to keep parity.
//
// CTA at the bottom routes to /inspect/sample, which the API special-cases
// to load DEMO_INSPECTION_REPORT_ID with the property address overridden —
// so an inspector clicking through sees a real, fully-populated report
// without exposing the underlying private token or test address.

interface DemoFeature { icon: string; title: string; desc: string }

const DEMO_TIER_META: Record<DemoTier, { title: string; sub: string; tabLabel: string; features: DemoFeature[] }> = {
  essential: {
    tabLabel: "Essential",
    title: "Essential — your client's digital report",
    sub: "AI-parsed inspection items, severity flags, AI cost estimates, source-page citations, and DIY hints.",
    features: [
      { icon: "📋", title: "Every item, prioritized", desc: "Each finding from the PDF parsed into a card with title, location, severity, and a short plain-English explanation." },
      { icon: "🚦", title: "Severity at a glance", desc: "Safety hazard / Urgent / Recommended / Monitor / Informational badges so the most important items rise to the top." },
      { icon: "💵", title: "AI cost estimates", desc: "Each item tagged with a low-high cost range based on category, severity, and regional pricing data." },
      { icon: "📄", title: "Tap-to-source citations", desc: "Every item links back to the exact page in the original inspection PDF — your client trusts what they're seeing." },
      { icon: "🔧", title: "DIY hints", desc: "Items that are safe to tackle without a pro get a DIY badge with steps, tools, and time estimate." },
    ],
  },
  professional: {
    tabLabel: "Professional",
    title: "Professional — everything in Essential, plus live contractor quotes",
    sub: "One-tap dispatch to local pros, real-time quote tracking, AI Q&A on the report, and bookings.",
    features: [
      { icon: "📋", title: "Everything in Essential", desc: "Items, severity, cost estimates, citations, DIY hints — all included." },
      { icon: "📤", title: "One-tap dispatch", desc: "Your client picks the items they want quotes for; Homie reaches out to local pros automatically via SMS, voice, and email." },
      { icon: "💬", title: "Real-time quote cards", desc: "Each pro's quote lands as a card with name, rating, price, availability, and the option to book directly." },
      { icon: "🤖", title: "AI Q&A on the report", desc: "Your client can ask questions like 'is the panel a safety issue?' or 'what would lender flag here?' and get cited answers." },
      { icon: "📅", title: "In-portal bookings", desc: "Confirmed appointments live in the Bookings tab — your client never has to chase a contractor." },
    ],
  },
  premium: {
    tabLabel: "Premium",
    title: "Premium — everything in Pro, plus negotiation + Home IQ",
    sub: "Auto-generated repair-request packages, multi-vendor coordination, and the year-round maintenance timeline.",
    features: [
      { icon: "📋", title: "Everything in Professional", desc: "Items, quotes, AI Q&A, bookings — all included." },
      { icon: "📑", title: "Negotiation documents", desc: "One click generates a polished repair-request PDF with the items your client picked, attached quotes, and the requested concession (price reduction, credit, escrow holdback)." },
      { icon: "🤝", title: "Multi-vendor coordination", desc: "Homie dispatches multiple specialists in parallel when an item touches several trades, then surfaces the bundle that gets your client to a deal." },
      { icon: "📈", title: "Home IQ timeline", desc: "Year-round maintenance roadmap auto-built from the report — when to service the HVAC, re-caulk the tub, flush the water heater. Drives renewal value long after the inspection." },
      { icon: "⚡", title: "Priority dispatching", desc: "Premium reports jump to the front of the dispatch queue — quotes back in minutes, not hours." },
    ],
  },
};

function ClientPortalDemo({ demoTier, setDemoTier }: { demoTier: DemoTier; setDemoTier: (t: DemoTier) => void }) {
  const meta = DEMO_TIER_META[demoTier];
  return (
    <section style={{ background: C.white, padding: "96px 24px", borderTop: `1px solid ${C.warm}` }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <FadeIn>
          <div style={{ textAlign: "center", marginBottom: 36 }}>
            <span style={{ ...dm, fontSize: 13, fontWeight: 600, color: C.green, letterSpacing: 1, textTransform: "uppercase" }}>What your clients get</span>
            <h2 style={{ ...fr, fontSize: "clamp(28px, 3.5vw, 42px)", fontWeight: 700, color: C.dark, margin: "12px 0 0" }}>See exactly what you're selling</h2>
            <p style={{ ...dm, fontSize: 16, color: C.darkMid, margin: "16px auto 0", maxWidth: 620, lineHeight: 1.55 }}>Click a tier to preview the homeowner portal at that tier. Same interactive view your clients open the moment you upload their report.</p>
          </div>
        </FadeIn>

        {/* Tab switcher */}
        <FadeIn delay={0.1}>
          <div role="tablist" style={{ display: "flex", justifyContent: "center", gap: 8, marginBottom: 32, flexWrap: "wrap" }}>
            {(Object.keys(DEMO_TIER_META) as DemoTier[]).map(t => {
              const active = demoTier === t;
              return (
                <button
                  key={t}
                  role="tab"
                  aria-selected={active}
                  onClick={() => setDemoTier(t)}
                  style={{
                    ...dm,
                    fontSize: 14, fontWeight: 600,
                    padding: "10px 22px", borderRadius: 100,
                    border: `1.5px solid ${active ? C.green : C.grayLight}`,
                    background: active ? C.green : C.white,
                    color: active ? C.white : C.darkMid,
                    cursor: "pointer", transition: "all 0.15s",
                  }}
                >{DEMO_TIER_META[t].tabLabel}</button>
              );
            })}
          </div>
        </FadeIn>

        {/* Two-column: mockup left, feature list right */}
        <FadeIn delay={0.15}>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.1fr) minmax(0, 1fr)", gap: 48, alignItems: "start" }} className="hpi-demo-grid">
            <div>
              {demoTier === 'essential' && <EssentialMockup />}
              {demoTier === 'professional' && <ProfessionalMockup />}
              {demoTier === 'premium' && <PremiumMockup />}
            </div>
            <div>
              <div style={{ ...dm, fontSize: 12, fontWeight: 700, color: C.green, letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>{meta.tabLabel} tier · what's included</div>
              <h3 style={{ ...fr, fontSize: 26, fontWeight: 700, color: C.dark, margin: "0 0 8px", lineHeight: 1.2 }}>{meta.title}</h3>
              <p style={{ ...dm, fontSize: 15, color: C.darkMid, margin: "0 0 24px", lineHeight: 1.6 }}>{meta.sub}</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {meta.features.map((f, i) => (
                  <div key={i} style={{ display: "flex", gap: 12 }}>
                    <span style={{ fontSize: 18, flexShrink: 0, lineHeight: 1.4 }}>{f.icon}</span>
                    <div>
                      <div style={{ ...dm, fontSize: 14, fontWeight: 600, color: C.dark, marginBottom: 2 }}>{f.title}</div>
                      <div style={{ ...dm, fontSize: 13, color: C.gray, lineHeight: 1.55 }}>{f.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </FadeIn>

        {/* Live sample CTA */}
        <FadeIn delay={0.25}>
          <div style={{ textAlign: "center", marginTop: 48, padding: "24px 20px", background: C.warm, borderRadius: 16 }}>
            <div style={{ ...dm, fontSize: 14, color: C.darkMid, marginBottom: 12 }}>Want the real thing? Open a fully-populated sample report — Premium tier, all features unlocked.</div>
            <a
              href="/inspect-portal/demo"
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => trackEvent('inspector_landing_cta_clicked', { cta_location: 'demo_sample_report' })}
              style={{
                ...dm, fontSize: 15, fontWeight: 600, color: C.white,
                background: C.dark, border: "none", borderRadius: 100,
                padding: "12px 28px", cursor: "pointer", textDecoration: "none",
                display: "inline-block",
              }}
            >Tour a live sample report →</a>
          </div>
        </FadeIn>
      </div>

      <style>{`
        @media (max-width: 820px) {
          .hpi-demo-grid { grid-template-columns: 1fr !important; gap: 32px !important; }
        }
      `}</style>
    </section>
  );
}

// ── Mockup pieces ──────────────────────────────────────────────────────────
// These are stylized illustrations of real homeowner-portal components.
// Field names + severity slugs match packages/web/src/pages/homeowner-inspect/
// constants.tsx so the visuals feel authentic.

const SEV_COLORS: Record<string, string> = {
  urgent: '#E24B4A',
  recommended: '#EF9F27',
  monitor: '#9B9490',
};

function MockFrame({ children }: { children: ReactNode }) {
  return (
    <div style={{
      background: C.white, borderRadius: 14, border: `1px solid ${C.grayLight}`,
      boxShadow: "0 12px 40px rgba(0,0,0,0.08)",
      overflow: "hidden",
    }}>
      {/* Browser-chrome header */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 14px", background: C.warm, borderBottom: `1px solid ${C.grayLight}` }}>
        <span style={{ width: 9, height: 9, borderRadius: "50%", background: "#FF5F57" }} />
        <span style={{ width: 9, height: 9, borderRadius: "50%", background: "#FFBD2E" }} />
        <span style={{ width: 9, height: 9, borderRadius: "50%", background: "#28CA41" }} />
        <span style={{ ...dm, fontSize: 11, color: C.gray, marginLeft: 10 }}>homie inspect — 1024 Maplewood Lane</span>
      </div>
      <div style={{ padding: 18 }}>{children}</div>
    </div>
  );
}

function MockItemCard({ severity, category, title, location, low, high, diy }: {
  severity: 'urgent' | 'recommended' | 'monitor';
  category: string; title: string; location: string;
  low: number; high: number; diy?: boolean;
}) {
  const sev = SEV_COLORS[severity];
  return (
    <div style={{ padding: "12px 14px", borderRadius: 10, border: `1px solid ${C.grayLight}`, background: C.white, marginBottom: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, flexWrap: "wrap" }}>
        <span style={{ ...dm, fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 10, background: `${sev}1A`, color: sev, textTransform: "capitalize" }}>{severity}</span>
        <span style={{ ...dm, fontSize: 11, color: C.gray }}>{category}</span>
        {diy && <span style={{ ...dm, fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 10, background: "#E1F5EE", color: C.green }}>🔧 DIY</span>}
      </div>
      <div style={{ ...dm, fontSize: 13, fontWeight: 600, color: C.dark, marginBottom: 2 }}>{title}</div>
      <div style={{ ...dm, fontSize: 11, color: C.gray, marginBottom: 6 }}>{location}</div>
      <div style={{ ...dm, fontSize: 11, color: C.darkMid }}>Est. <strong style={{ color: C.dark }}>${low.toLocaleString()}–${high.toLocaleString()}</strong></div>
    </div>
  );
}

function EssentialMockup() {
  return (
    <MockFrame>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
        <div>
          <div style={{ ...fr, fontSize: 16, fontWeight: 700, color: C.dark }}>Inspection items</div>
          <div style={{ ...dm, fontSize: 11, color: C.gray }}>23 items · sorted by severity</div>
        </div>
        <div style={{ ...dm, fontSize: 11, color: C.gray }}>Filter ▾</div>
      </div>
      <MockItemCard severity="urgent" category="⚡ Electrical" title="Double-tapped breaker in main panel" location="Garage · panel A" low={250} high={450} />
      <MockItemCard severity="recommended" category="💧 Plumbing" title="Slow drip at kitchen sink P-trap" location="Kitchen" low={120} high={220} diy />
      <MockItemCard severity="recommended" category="🏠 Roofing" title="Missing flashing at chimney base" location="Roof · NW corner" low={400} high={750} />
      <MockItemCard severity="monitor" category="❄️ HVAC" title="HVAC condenser nearing end of life" location="Side yard" low={3800} high={6200} />
    </MockFrame>
  );
}

function ProfessionalMockup() {
  return (
    <MockFrame>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
        <div>
          <div style={{ ...fr, fontSize: 16, fontWeight: 700, color: C.dark }}>Quotes coming in</div>
          <div style={{ ...dm, fontSize: 11, color: C.gray }}>3 of 8 pros responded · 4 still working</div>
        </div>
        <div style={{ ...dm, fontSize: 11, fontWeight: 600, color: C.green, display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: C.green, animation: "pulse 1.4s infinite" }} />Live
        </div>
      </div>
      <div style={{ marginBottom: 10, padding: "10px 12px", background: C.warm, borderRadius: 10 }}>
        <div style={{ ...dm, fontSize: 11, color: C.gray, marginBottom: 2 }}>Item · Double-tapped breaker</div>
        <div style={{ ...dm, fontSize: 12, fontWeight: 600, color: C.dark }}>3 quotes received</div>
      </div>
      {[
        { name: "Pacific Electric Co.", rating: 4.8, price: "$285", avail: "Tue 9am" },
        { name: "Coastline Wiring", rating: 4.9, price: "$340", avail: "Wed 1pm" },
        { name: "Bayside Power Pros", rating: 4.6, price: "$310", avail: "Thu 10am" },
      ].map((q, i) => (
        <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", borderRadius: 10, border: `1px solid ${C.grayLight}`, marginBottom: 8 }}>
          <div>
            <div style={{ ...dm, fontSize: 12, fontWeight: 600, color: C.dark }}>{q.name}</div>
            <div style={{ ...dm, fontSize: 10, color: C.gray }}>★ {q.rating} · earliest {q.avail}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ ...dm, fontSize: 14, fontWeight: 700, color: C.dark }}>{q.price}</span>
            <button style={{ ...dm, fontSize: 11, fontWeight: 600, color: C.white, background: C.green, border: "none", borderRadius: 100, padding: "5px 12px", cursor: "default" }}>Book</button>
          </div>
        </div>
      ))}
      <div style={{ ...dm, fontSize: 11, color: C.gray, marginTop: 8, padding: "10px 12px", background: C.greenLight, borderRadius: 8 }}>
        💬 Ask AI: "Which of these is the safest pick?"
      </div>
      <style>{`@keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }`}</style>
    </MockFrame>
  );
}

function PremiumMockup() {
  return (
    <MockFrame>
      <div style={{ marginBottom: 14 }}>
        <div style={{ ...fr, fontSize: 16, fontWeight: 700, color: C.dark }}>Repair-request package</div>
        <div style={{ ...dm, fontSize: 11, color: C.gray }}>Auto-generated · ready to send to seller's agent</div>
      </div>
      <div style={{ padding: "14px 16px", background: C.warm, borderRadius: 10, marginBottom: 14 }}>
        <div style={{ ...dm, fontSize: 10, color: C.gray, letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 6 }}>Repair request · Draft</div>
        <div style={{ ...fr, fontSize: 14, fontWeight: 700, color: C.dark, marginBottom: 10 }}>1024 Maplewood Lane</div>
        {[
          { item: "Double-tapped breaker", val: "$340" },
          { item: "Chimney flashing repair", val: "$650" },
          { item: "P-trap leak fix", val: "$180" },
          { item: "+ 2 more line items", val: "$1,420" },
        ].map((r, i, a) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: i < a.length - 1 ? `1px solid ${C.grayLight}` : "none", ...dm, fontSize: 12, color: i === a.length - 1 ? C.gray : C.darkMid, fontStyle: i === a.length - 1 ? "italic" : "normal" }}>
            <span>{r.item}</span><span style={{ fontWeight: 600 }}>{r.val}</span>
          </div>
        ))}
        <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 8, marginTop: 8, borderTop: `2px solid ${C.dark}` }}>
          <span style={{ ...dm, fontSize: 12, fontWeight: 700, color: C.dark }}>Total credit requested</span>
          <span style={{ ...fr, fontSize: 16, fontWeight: 700, color: C.green }}>$2,590</span>
        </div>
      </div>
      <div style={{ ...fr, fontSize: 13, fontWeight: 700, color: C.dark, marginBottom: 8 }}>Home IQ timeline</div>
      {[
        { mo: "Apr", task: "Service HVAC condenser before peak season", color: C.orange },
        { mo: "Jun", task: "Re-caulk master tub", color: C.gray },
        { mo: "Sep", task: "Flush water heater · check anode rod", color: C.green },
      ].map((t, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0" }}>
          <span style={{ width: 28, ...dm, fontSize: 10, fontWeight: 700, color: t.color, letterSpacing: 0.4 }}>{t.mo}</span>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: t.color, flexShrink: 0 }} />
          <span style={{ ...dm, fontSize: 12, color: C.darkMid }}>{t.task}</span>
        </div>
      ))}
    </MockFrame>
  );
}

type DemoTier = 'essential' | 'professional' | 'premium';

export default function InspectionInspectorsLanding() {
  const [demoTier, setDemoTier] = useState<DemoTier>('professional');
  return (
    <div style={{ ...dm, background: C.white, minHeight: "100vh" }}>
      <SEO title="Homie Inspector Partner Program — turn every inspection into recurring revenue" description="Add the Homie AI report to every inspection. Three tiers to match each client, healthy inspector margins, free to join. You set retail — we handle delivery." canonical="/inspect/inspectors" />
      <link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@0,400;0,700;1,400&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />

      {/* NAV */}
      <nav style={{ padding: "0 24px", borderBottom: `1px solid ${C.warm}` }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", height: 64 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <a href="/inspect" style={{ textDecoration: "none" }}>
              <span style={{ ...fr, fontWeight: 700, fontSize: 26, color: C.orange }}>homie</span>
              <span style={{ ...dm, fontSize: 13, color: C.gray, fontWeight: 500, marginLeft: 6 }}>inspect</span>
            </a>
          </div>
          <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
            <a href="/inspect" style={{ ...dm, fontSize: 14, color: C.darkMid, textDecoration: "none", fontWeight: 500 }}>For homeowners</a>
            <a href="/inspector/signup" onClick={() => trackEvent('inspector_landing_cta_clicked', { cta_location: 'nav_join_free' })} style={{ ...dm, fontSize: 14, fontWeight: 600, color: C.white, background: C.green, border: "none", borderRadius: 100, padding: "9px 22px", textDecoration: "none" }}>Join free</a>
          </div>
        </div>
      </nav>

      {/* HERO */}
      <section style={{ background: `linear-gradient(165deg, ${C.warm} 0%, ${C.greenLight} 50%, ${C.white} 100%)`, paddingTop: 100, paddingBottom: 80, position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: -200, right: -200, width: 600, height: 600, borderRadius: "50%", background: C.green, opacity: 0.04 }} />
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 24px", position: "relative", zIndex: 1 }}>
          <FadeIn>
            <div style={{ display: "inline-block", background: C.greenLight, borderRadius: 100, padding: "6px 14px", marginBottom: 20 }}>
              <span style={{ ...dm, fontSize: 13, fontWeight: 600, color: C.green }}>Inspector partner program</span>
            </div>
          </FadeIn>
          <FadeIn delay={0.1}>
            <h1 style={{ ...fr, fontSize: "clamp(36px, 5vw, 64px)", fontWeight: 700, color: C.dark, lineHeight: 1.08, maxWidth: 700, margin: 0 }}>
              Make your inspections<br /><span style={{ color: C.green }}>more valuable</span>
            </h1>
          </FadeIn>
          <FadeIn delay={0.2}>
            <p style={{ ...dm, fontSize: "clamp(17px, 1.8vw, 21px)", color: C.darkMid, lineHeight: 1.6, maxWidth: 580, margin: "24px 0 36px" }}>
              Add the Homie report to every inspection. Your clients walk away with an interactive AI-powered report; you walk away with a high-margin revenue stream on top of every job. Free to join, no monthly fees.
            </p>
          </FadeIn>
          <FadeIn delay={0.3}>
            <a href="/inspector/signup" onClick={() => trackEvent('inspector_landing_cta_clicked', { cta_location: 'hero' })} style={{ ...dm, fontSize: 17, fontWeight: 600, color: C.white, background: C.green, border: "none", borderRadius: 100, padding: "16px 36px", cursor: "pointer", textDecoration: "none", display: "inline-block", boxShadow: "0 4px 24px rgba(27,158,119,0.25)" }}>
              Join the Homie inspector network
            </a>
          </FadeIn>
          <FadeIn delay={0.45}>
            <div style={{ display: "flex", gap: 40, marginTop: 56, flexWrap: "wrap" }}>
              {[
                ["Your highest-margin add-on", "sells alongside every inspection"],
                ["Your retail. Your spread.", "no commission splits, no holdbacks"],
                ["Free forever", "no subscriptions, no monthly fees"],
                ["Drop-in upgrade", "works with your existing workflow"],
              ].map(([stat, label], i) => (
                <div key={i} style={{ display: "flex", flexDirection: "column", maxWidth: 220 }}>
                  <span style={{ ...fr, fontSize: 22, fontWeight: 700, color: C.green, lineHeight: 1.2 }}>{stat}</span>
                  <span style={{ ...dm, fontSize: 14, color: C.gray, fontWeight: 500, marginTop: 4 }}>{label}</span>
                </div>
              ))}
            </div>
          </FadeIn>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section style={{ background: C.white, padding: "96px 24px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <FadeIn>
            <div style={{ textAlign: "center", marginBottom: 56 }}>
              <span style={{ ...dm, fontSize: 13, fontWeight: 600, color: C.green, letterSpacing: 1, textTransform: "uppercase" }}>How it works</span>
              <h2 style={{ ...fr, fontSize: "clamp(28px, 3.5vw, 42px)", fontWeight: 700, color: C.dark, margin: "12px 0 0" }}>Three tiers, three ways to win</h2>
              <p style={{ ...dm, fontSize: 16, color: C.darkMid, margin: "16px auto 0", maxWidth: 600, lineHeight: 1.55 }}>Sell the Homie report add-on at your inspection. Pick the tier that fits each client. You set the retail price, we handle everything else.</p>
            </div>
          </FadeIn>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 24 }}>
            {[
              { num: "Essential", title: "Essential — the easy upsell", desc: "AI-parsed digital report with prioritized items, severity flags, and clean summaries. The lowest-friction add-on you can offer — perfect for first-time buyers and routine inspections.", color: C.green, badge: "Easy add-on" },
              { num: "Professional", title: "Professional — the sweet spot", desc: "Everything in Essential plus contractor quote dispatch and AI Q&A on the report. The tier most inspectors default to — best balance of client value and inspector revenue.", color: C.orange, badge: "Most popular" },
              { num: "Premium", title: "Premium — your top-tier offer", desc: "Everything in Professional plus full quote concierge, multi-vendor coordination, and priority dispatching. Built for high-stakes purchases and complex properties — your highest-margin SKU when the deal warrants it.", color: C.green, badge: "Highest margin" },
            ].map((s, i) => (
              <FadeIn key={i} delay={i * 0.1}>
                <div style={{ background: C.warm, borderRadius: 20, padding: 32, height: "100%", borderTop: `3px solid ${s.color}` }}>
                  <div style={{ display: "inline-block", padding: "6px 12px", borderRadius: 100, background: s.color, ...dm, fontSize: 13, fontWeight: 700, color: C.white, marginBottom: 14 }}>{s.num}</div>
                  <h3 style={{ ...fr, fontSize: 22, fontWeight: 700, color: C.dark, margin: "0 0 10px" }}>{s.title}</h3>
                  <p style={{ ...dm, fontSize: 15, color: C.darkMid, lineHeight: 1.6, margin: "0 0 12px" }}>{s.desc}</p>
                  <div style={{ ...dm, fontSize: 12, fontWeight: 600, color: s.color, textTransform: "uppercase", letterSpacing: 0.5 }}>{s.badge}</div>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* WHAT YOUR CLIENTS GET — tier-tabbed product demo */}
      <ClientPortalDemo demoTier={demoTier} setDemoTier={setDemoTier} />

      {/* VALUE PROPS + REVENUE MOCKUP */}
      <section style={{ background: C.warm, padding: "96px 24px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <FadeIn>
            <div style={{ display: "flex", gap: 64, alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 400px", minWidth: 300 }}>
                <h2 style={{ ...fr, fontSize: "clamp(28px, 3.5vw, 42px)", fontWeight: 700, color: C.dark, margin: "0 0 24px", lineHeight: 1.15 }}>Why inspectors love Homie</h2>
                <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                  {[
                    { icon: "\uD83D\uDCB0", title: "Keep $50–$200 per report sold", desc: "You collect retail from your client. Pay us wholesale when you upload. The spread is yours — no commission splits, no holdbacks." },
                    { icon: "\u2B50", title: "Differentiate every inspection", desc: "Hand your clients an interactive digital report with quotes, severity flags, and AI Q&A. Most inspectors hand over a static PDF — you hand over a full action plan." },
                    { icon: "\uD83C\uDFAF", title: "Sell the right tier for each client", desc: "First-time buyer with a $400k starter? Essential. Investor reviewing 6 properties? Professional. Multi-million dollar buy? Premium. You match value to price." },
                    { icon: "\uD83D\uDCCA", title: "Track every report and payout", desc: "Your partner dashboard shows every report uploaded, tier sold, and client engagement. Know exactly which tier converts best for your market." },
                    { icon: "\uD83E\uDD1D", title: "Free to join, pay only when you sell", desc: "No subscriptions, no monthly fees. Wholesale costs only kick in when you upload a report — meaning you've already collected from your client." },
                  ].map((item, i) => (
                    <div key={i} style={{ display: "flex", gap: 14 }}>
                      <span style={{ fontSize: 22, flexShrink: 0 }}>{item.icon}</span>
                      <div>
                        <div style={{ ...dm, fontSize: 15, fontWeight: 600, color: C.dark, marginBottom: 2 }}>{item.title}</div>
                        <div style={{ ...dm, fontSize: 13, color: C.gray, lineHeight: 1.55 }}>{item.desc}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Revenue mockup */}
              <div style={{ flex: "1 1 360px", minWidth: 300, maxWidth: 420 }}>
                <FadeIn delay={0.15}>
                  <div style={{ background: C.white, borderRadius: 24, padding: "28px 24px", border: `1px solid ${C.grayLight}`, boxShadow: "0 8px 40px rgba(0,0,0,0.06)" }}>
                    <div style={{ ...dm, fontSize: 12, color: C.gray, fontWeight: 500, marginBottom: 16, textTransform: "uppercase", letterSpacing: 0.5 }}>Sample month — 12 reports sold</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                      {[
                        { label: "5 × Essential @ $99 retail", value: "+$495" },
                        { label: "5 × Professional @ $199 retail", value: "+$995" },
                        { label: "2 × Premium @ $299 retail", value: "+$598" },
                        { label: "Wholesale paid to Homie", value: "−$838" },
                      ].map((row, i) => (
                        <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: i < 3 ? `1px solid ${C.warm}` : "none" }}>
                          <span style={{ ...dm, fontSize: 13, color: C.gray }}>{row.label}</span>
                          <span style={{ ...dm, fontSize: 13, fontWeight: 600, color: row.value.startsWith("−") ? C.gray : C.dark }}>{row.value}</span>
                        </div>
                      ))}
                    </div>
                    <div style={{ background: C.greenLight, borderRadius: 12, padding: "16px 20px", marginTop: 16, textAlign: "center" }}>
                      <div style={{ ...dm, fontSize: 12, color: "#085041" }}>Net inspector earnings</div>
                      <div style={{ ...fr, fontSize: 36, fontWeight: 700, color: C.green }}>$1,250</div>
                      <div style={{ ...dm, fontSize: 12, color: "#085041" }}>$15,000/year · ~$104 per report avg</div>
                    </div>
                  </div>
                </FadeIn>
              </div>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* COMPATIBLE PLATFORMS */}
      <section style={{ background: C.white, padding: "64px 24px", borderTop: `1px solid ${C.warm}` }}>
        <div style={{ maxWidth: 800, margin: "0 auto", textAlign: "center" }}>
          <FadeIn>
            <p style={{ ...dm, fontSize: 13, color: C.gray, fontWeight: 500, letterSpacing: 1, textTransform: "uppercase", marginBottom: 16 }}>Works with your inspection software</p>
            <div style={{ display: "flex", justifyContent: "center", gap: 48, flexWrap: "wrap", opacity: 0.5 }}>
              {["Spectora", "HomeGauge", "Palm-Tech", "InspectIT", "PDF Upload"].map(name => (
                <span key={name} style={{ ...dm, fontSize: 18, fontWeight: 700, color: C.dark }}>{name}</span>
              ))}
            </div>
            <p style={{ ...dm, fontSize: 14, color: C.gray, marginTop: 16 }}>Upload any format — PDF, HTML, or sync directly from Spectora and HomeGauge.</p>
          </FadeIn>
        </div>
      </section>

      {/* TESTIMONIAL */}
      <section style={{ background: C.dark, padding: "80px 24px" }}>
        <div style={{ maxWidth: 700, margin: "0 auto", textAlign: "center" }}>
          <FadeIn>
            <p style={{ ...fr, fontSize: "clamp(22px, 2.5vw, 32px)", fontWeight: 400, color: C.white, lineHeight: 1.55, margin: "0 0 28px", fontStyle: "italic" }}>
              "I started offering the Homie report add-on at every inspection. Most clients pick Professional at $199 — I pay Homie $79 and pocket $120. That's an extra $1,200–$1,500 a month I wasn't making before, and my clients walk away with something way better than a static PDF."
            </p>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12 }}>
              <div style={{ width: 44, height: 44, borderRadius: "50%", background: C.green, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ ...dm, fontSize: 16, fontWeight: 700, color: C.white }}>MC</span>
              </div>
              <div style={{ textAlign: "left" }}>
                <div style={{ ...dm, fontSize: 14, fontWeight: 600, color: C.white }}>Mike C.</div>
                <div style={{ ...dm, fontSize: 12, color: C.gray }}>ASHI Certified Inspector, San Diego</div>
              </div>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* FINAL CTA */}
      <section style={{ background: C.greenLight, padding: "96px 24px" }}>
        <div style={{ maxWidth: 600, margin: "0 auto", textAlign: "center" }}>
          <FadeIn>
            <h2 style={{ ...fr, fontSize: "clamp(28px, 4vw, 44px)", fontWeight: 700, color: C.dark, margin: "0 0 16px", lineHeight: 1.1 }}>Add $50–$200<br />to every inspection.</h2>
            <p style={{ ...dm, fontSize: 17, color: C.darkMid, lineHeight: 1.6, margin: "0 0 32px" }}>Join the Homie inspector network — free to sign up, no monthly fees. You only pay wholesale when you've already collected from your client.</p>
            <a href="/inspector/signup" onClick={() => trackEvent('inspector_landing_cta_clicked', { cta_location: 'final_cta' })} style={{ ...dm, fontSize: 17, fontWeight: 600, color: C.white, background: C.green, border: "none", borderRadius: 100, padding: "16px 36px", cursor: "pointer", textDecoration: "none", display: "inline-block", boxShadow: "0 4px 24px rgba(27,158,119,0.25)" }}>
              Create your free partner account
            </a>
            <p style={{ ...dm, fontSize: 13, color: C.gray, marginTop: 16 }}>Takes 2 minutes. No credit card required.</p>
          </FadeIn>
        </div>
      </section>

      {/* FOOTER */}
      <footer style={{ background: C.dark, padding: "64px 24px 40px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 40, marginBottom: 48 }}>
            <div>
              <span style={{ ...fr, fontWeight: 700, fontSize: 24, color: C.orange }}>homie</span>
              <p style={{ ...dm, fontSize: 14, color: "#9B9490", lineHeight: 1.6, marginTop: 12 }}>AI-powered home services for property managers, hosts, and homeowners.</p>
            </div>
            <div>
              <h4 style={{ ...dm, fontSize: 13, fontWeight: 700, color: "#D3CEC9", letterSpacing: 1, textTransform: "uppercase", margin: "0 0 16px" }}>Product</h4>
              {[
                { label: "For homeowners", href: "/" },
                { label: "For property managers/hosts", href: "/business/landing" },
                { label: "Homie Inspect", href: "/inspect" },
                { label: "For inspectors", href: "/inspect/inspectors" },
                { label: "Become a Homie Pro", href: "/portal/signup" },
              ].map(l => (
                <a key={l.label} href={l.href} style={{ display: "block", ...dm, fontSize: 14, color: "#9B9490", textDecoration: "none", marginBottom: 10 }}>{l.label}</a>
              ))}
            </div>
            <div>
              <h4 style={{ ...dm, fontSize: 13, fontWeight: 700, color: "#D3CEC9", letterSpacing: 1, textTransform: "uppercase", margin: "0 0 16px" }}>Company</h4>
              {["About", "Blog", "Careers", "Contact"].map(l => (
                <a key={l} href="#" style={{ display: "block", ...dm, fontSize: 14, color: "#9B9490", textDecoration: "none", marginBottom: 10 }}>{l}</a>
              ))}
            </div>
            <div>
              <h4 style={{ ...dm, fontSize: 13, fontWeight: 700, color: "#D3CEC9", letterSpacing: 1, textTransform: "uppercase", margin: "0 0 16px" }}>Legal</h4>
              <a href="/privacy" style={{ display: "block", ...dm, fontSize: 14, color: "#9B9490", textDecoration: "none", marginBottom: 10 }}>Privacy</a>
              <a href="/terms" style={{ display: "block", ...dm, fontSize: 14, color: "#9B9490", textDecoration: "none", marginBottom: 10 }}>Terms</a>
              <a href="/security" style={{ display: "block", ...dm, fontSize: 14, color: "#9B9490", textDecoration: "none", marginBottom: 10 }}>Security</a>
            </div>
          </div>
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 24, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
            <span style={{ ...dm, fontSize: 13, color: "#9B9490" }}>&copy; {new Date().getFullYear()} Homie. Your home's best friend.</span>
            <span style={{ ...dm, fontSize: 13, color: "#9B9490" }}>Made with love in San Diego 🌴</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
