import { useState, useEffect, useRef, type ReactNode, type CSSProperties } from "react";
import SEO from '@/components/SEO';

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

export default function InspectionInspectorsLanding() {
  return (
    <div style={{ ...dm, background: C.white, minHeight: "100vh" }}>
      <SEO title="Homie Inspector Partner Program — Earn more from every inspection" description="Join the Homie inspector network. Upload your reports, earn referral revenue on every dispatch, and make your inspections more valuable. Free to join, always." canonical="/inspect/inspectors" />
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
            <a href="/inspector/signup" style={{ ...dm, fontSize: 14, fontWeight: 600, color: C.white, background: C.green, border: "none", borderRadius: 100, padding: "9px 22px", textDecoration: "none" }}>Join free</a>
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
            <p style={{ ...dm, fontSize: "clamp(17px, 1.8vw, 21px)", color: C.darkMid, lineHeight: 1.6, maxWidth: 560, margin: "24px 0 36px" }}>
              Your clients love your inspections. They hate what comes next — calling around for quotes on every item you found. Homie eliminates that headache, and you earn referral revenue on every dispatch. Free to join, always.
            </p>
          </FadeIn>
          <FadeIn delay={0.3}>
            <a href="/inspector/signup" style={{ ...dm, fontSize: 17, fontWeight: 600, color: C.white, background: C.green, border: "none", borderRadius: 100, padding: "16px 36px", cursor: "pointer", textDecoration: "none", display: "inline-block", boxShadow: "0 4px 24px rgba(27,158,119,0.25)" }}>
              Join the Homie inspector network
            </a>
          </FadeIn>
          <FadeIn delay={0.45}>
            <div style={{ display: "flex", gap: 40, marginTop: 56, flexWrap: "wrap" }}>
              {[
                ["$587/mo", "average extra income for partners"],
                ["60%", "of add-on fee goes to you"],
                ["15–20%", "referral commission per dispatch"],
                ["$0", "cost to join — free forever"],
              ].map(([stat, label], i) => (
                <div key={i} style={{ display: "flex", flexDirection: "column" }}>
                  <span style={{ ...fr, fontSize: 32, fontWeight: 700, color: C.green }}>{stat}</span>
                  <span style={{ ...dm, fontSize: 14, color: C.gray, fontWeight: 500 }}>{label}</span>
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
              <h2 style={{ ...fr, fontSize: "clamp(28px, 3.5vw, 42px)", fontWeight: 700, color: C.dark, margin: "12px 0 0" }}>Three ways to earn</h2>
            </div>
          </FadeIn>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 24 }}>
            {[
              { num: "1", title: "Sell the Homie add-on", desc: "Offer the Homie Report as a premium add-on to every inspection ($99–$129). You keep 60% of the fee. That's $59–$77 per inspection with zero extra work.", color: C.green },
              { num: "2", title: "Earn on every dispatch", desc: "When your client uses Homie to get quotes from your report, you earn 15–20% referral commission on each search. Clients love the convenience — your earnings compound.", color: C.orange },
              { num: "3", title: "Get inbound leads", desc: "Homeowners searching for inspectors on Homie get matched to partners in their area. You receive qualified leads and earn a $25 bonus when they convert to a booking.", color: C.green },
            ].map((s, i) => (
              <FadeIn key={i} delay={i * 0.1}>
                <div style={{ background: C.warm, borderRadius: 20, padding: 32, height: "100%", borderTop: `3px solid ${s.color}` }}>
                  <div style={{ width: 40, height: 40, borderRadius: "50%", background: s.color, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16, ...dm, fontSize: 18, fontWeight: 700, color: C.white }}>{s.num}</div>
                  <h3 style={{ ...fr, fontSize: 22, fontWeight: 700, color: C.dark, margin: "0 0 10px" }}>{s.title}</h3>
                  <p style={{ ...dm, fontSize: 15, color: C.darkMid, lineHeight: 1.6, margin: 0 }}>{s.desc}</p>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* VALUE PROPS + REVENUE MOCKUP */}
      <section style={{ background: C.warm, padding: "96px 24px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <FadeIn>
            <div style={{ display: "flex", gap: 64, alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 400px", minWidth: 300 }}>
                <h2 style={{ ...fr, fontSize: "clamp(28px, 3.5vw, 42px)", fontWeight: 700, color: C.dark, margin: "0 0 24px", lineHeight: 1.15 }}>Why inspectors love Homie</h2>
                <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                  {[
                    { icon: "\uD83D\uDCB0", title: "Increase your ticket by $99–$129", desc: "Offer the Homie Report as a premium add-on to every inspection. You keep 60% of the add-on fee." },
                    { icon: "\uD83D\uDD01", title: "Earn on every dispatch", desc: "When your client uses Homie to get quotes from your report, you earn 15–20% referral commission on each search." },
                    { icon: "\u2B50", title: "Stand out from competitors", desc: "You're not just finding problems — you're delivering solutions. Clients remember the inspector who gave them an actionable plan, not just a list." },
                    { icon: "\uD83D\uDCCA", title: "Track your earnings in real time", desc: "Your partner dashboard shows every earning, dispatch, and client action. Know exactly how much Homie is adding to your bottom line." },
                    { icon: "\uD83E\uDD1D", title: "Free to join, always", desc: "No fees, no subscriptions. Upload reports, earn referrals, and make your clients happier. There's literally no downside." },
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
                    <div style={{ ...dm, fontSize: 12, color: C.gray, fontWeight: 500, marginBottom: 16, textTransform: "uppercase", letterSpacing: 0.5 }}>Your monthly earnings with Homie</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                      {[
                        { label: "Inspections this month", value: "12" },
                        { label: "Homie add-ons sold (60%)", value: "7" },
                        { label: "Add-on revenue (@ $99 × 60%)", value: "$415" },
                        { label: "Dispatches from your reports", value: "43" },
                        { label: "Referral commissions", value: "$172" },
                      ].map((row, i) => (
                        <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: i < 4 ? `1px solid ${C.warm}` : "none" }}>
                          <span style={{ ...dm, fontSize: 13, color: C.gray }}>{row.label}</span>
                          <span style={{ ...dm, fontSize: 13, fontWeight: 600, color: C.dark }}>{row.value}</span>
                        </div>
                      ))}
                    </div>
                    <div style={{ background: C.greenLight, borderRadius: 12, padding: "16px 20px", marginTop: 16, textAlign: "center" }}>
                      <div style={{ ...dm, fontSize: 12, color: "#085041" }}>Extra monthly income</div>
                      <div style={{ ...fr, fontSize: 36, fontWeight: 700, color: C.green }}>$587</div>
                      <div style={{ ...dm, fontSize: 12, color: "#085041" }}>$7,044/year with zero additional work</div>
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
              "I added Homie as a $99 add-on and 60% of my clients take it. That's an extra $400-500/month in add-on revenue alone — plus the referral commissions add another $150-200. It literally pays for my coffee subscription and then some."
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
            <h2 style={{ ...fr, fontSize: "clamp(28px, 4vw, 44px)", fontWeight: 700, color: C.dark, margin: "0 0 16px", lineHeight: 1.1 }}>Start earning more<br />from every inspection.</h2>
            <p style={{ ...dm, fontSize: 17, color: C.darkMid, lineHeight: 1.6, margin: "0 0 32px" }}>Join the Homie inspector network — free forever. Upload your first report and watch the earnings roll in.</p>
            <a href="/inspector/signup" style={{ ...dm, fontSize: 17, fontWeight: 600, color: C.white, background: C.green, border: "none", borderRadius: 100, padding: "16px 36px", cursor: "pointer", textDecoration: "none", display: "inline-block", boxShadow: "0 4px 24px rgba(27,158,119,0.25)" }}>
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
