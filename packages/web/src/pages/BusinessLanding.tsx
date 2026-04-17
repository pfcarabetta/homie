import React, { useState, useEffect, useRef, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import SEO from "@/components/SEO";
import { usePricing } from "@/hooks/usePricing";

const COLORS = {
  orange: "#E8632B",
  orangeLight: "#F0997B",
  orangeDark: "#C8531E",
  green: "#1B9E77",
  greenLight: "#E1F5EE",
  dark: "#2D2926",
  darkMid: "#4A4543",
  gray: "#9B9490",
  grayLight: "#D3CEC9",
  warm: "#F9F5F2",
  white: "#FFFFFF",
};

function useInView(threshold = 0.15): [React.RefObject<HTMLDivElement>, boolean] {
  const ref = useRef<HTMLDivElement>(null!);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect(); } }, { threshold });
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return [ref, visible];
}

function FadeIn({ children, delay = 0, className = "" }: { children: ReactNode; delay?: number; className?: string }) {
  const [ref, visible] = useInView();
  return (
    <div ref={ref} className={className} style={{ opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(24px)", transition: `opacity 0.7s ease ${delay}s, transform 0.7s ease ${delay}s` }}>
      {children}
    </div>
  );
}

function Nav() {
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (!mobile) setMenuOpen(false);
    };
    window.addEventListener("resize", handleResize, { passive: true });
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const navLinkStyle: React.CSSProperties = { fontFamily: "'DM Sans', sans-serif", fontSize: 15, color: COLORS.darkMid, textDecoration: "none", fontWeight: 500 };

  return (
    <>
      <nav style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 100, background: scrolled || menuOpen ? "rgba(255,255,255,0.97)" : "transparent", backdropFilter: scrolled || menuOpen ? "blur(12px)" : "none", borderBottom: scrolled || menuOpen ? "1px solid rgba(0,0,0,0.06)" : "1px solid transparent", transition: "all 0.3s ease", padding: "0 24px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", height: 72 }}>
          <div onClick={() => navigate("/")} style={{ display: "inline-flex", alignItems: "flex-end", gap: 8, cursor: "pointer" }}>
            <span style={{ fontFamily: "Fraunces, serif", fontWeight: 700, fontSize: 28, color: COLORS.orange, lineHeight: 1 }}>homie</span>
            <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 9, fontWeight: 800, color: COLORS.white, background: COLORS.green, padding: "2px 7px", borderRadius: 4, letterSpacing: "0.08em", textTransform: "uppercase", lineHeight: 1, position: "relative", bottom: 2 }}>Business</span>
          </div>
          {isMobile ? (
            <button
              onClick={() => setMenuOpen(o => !o)}
              style={{ background: "none", border: "none", cursor: "pointer", padding: 8, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", gap: 5 }}
              aria-label={menuOpen ? "Close menu" : "Open menu"}
            >
              <span style={{ display: "block", width: 22, height: 2, background: COLORS.dark, borderRadius: 2, transition: "all 0.2s", transform: menuOpen ? "rotate(45deg) translate(5px, 5px)" : "none" }} />
              <span style={{ display: "block", width: 22, height: 2, background: COLORS.dark, borderRadius: 2, transition: "all 0.2s", opacity: menuOpen ? 0 : 1 }} />
              <span style={{ display: "block", width: 22, height: 2, background: COLORS.dark, borderRadius: 2, transition: "all 0.2s", transform: menuOpen ? "rotate(-45deg) translate(5px, -5px)" : "none" }} />
            </button>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 32 }}>
              <a href="#features" style={navLinkStyle}>Features</a>
              <a href="#pricing" style={navLinkStyle}>Pricing</a>
              <a href="#how-it-works" style={navLinkStyle}>How it works</a>
              <button onClick={() => navigate("/login?redirect=/business")} style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 15, fontWeight: 600, color: COLORS.white, background: COLORS.orange, border: "none", borderRadius: 100, padding: "10px 24px", cursor: "pointer", transition: "background 0.2s" }} onMouseEnter={e => (e.target as HTMLElement).style.background = COLORS.orangeDark} onMouseLeave={e => (e.target as HTMLElement).style.background = COLORS.orange}>Get started</button>
            </div>
          )}
        </div>
        {isMobile && menuOpen && (
          <div style={{ borderTop: `1px solid ${COLORS.grayLight}`, padding: "16px 0 24px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              {[["#features", "Features"], ["#pricing", "Pricing"], ["#how-it-works", "How it works"]].map(([href, label]) => (
                <a key={href} href={href} onClick={() => setMenuOpen(false)} style={{ ...navLinkStyle, padding: "14px 0", borderBottom: `1px solid ${COLORS.warm}` }}>{label}</a>
              ))}
              <button onClick={() => { setMenuOpen(false); navigate("/login?redirect=/business"); }} style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 15, fontWeight: 600, color: COLORS.white, background: COLORS.orange, border: "none", borderRadius: 100, padding: "14px 24px", cursor: "pointer", marginTop: 16 }}>Get started</button>
            </div>
          </div>
        )}
      </nav>
    </>
  );
}

function Hero() {
  const navigate = useNavigate();
  return (
    <section style={{ background: `linear-gradient(165deg, ${COLORS.warm} 0%, ${COLORS.white} 50%, ${COLORS.greenLight} 100%)`, paddingTop: 140, paddingBottom: 80, position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: -200, right: -200, width: 600, height: 600, borderRadius: "50%", background: COLORS.orange, opacity: 0.03 }} />
      <div style={{ position: "absolute", bottom: -100, left: -100, width: 400, height: 400, borderRadius: "50%", background: COLORS.green, opacity: 0.04 }} />
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 24px", position: "relative", zIndex: 1 }}>
        <FadeIn>
          <div style={{ display: "inline-block", background: COLORS.white, border: `1px solid ${COLORS.grayLight}`, borderRadius: 100, padding: "6px 16px", marginBottom: 24 }}>
            <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: COLORS.green, fontWeight: 600 }}>Built for property managers & hosts</span>
          </div>
        </FadeIn>
        <FadeIn delay={0.1}>
          <h1 style={{ fontFamily: "Fraunces, serif", fontSize: "clamp(40px, 5.5vw, 72px)", fontWeight: 700, color: COLORS.dark, lineHeight: 1.08, maxWidth: 800, margin: 0 }}>
            Your entire portfolio's<br /><span style={{ color: COLORS.orange }}>best friend</span>
          </h1>
        </FadeIn>
        <FadeIn delay={0.2}>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "clamp(18px, 2vw, 22px)", color: COLORS.darkMid, lineHeight: 1.6, maxWidth: 620, margin: "24px 0 40px", fontWeight: 400 }}>
            Whether it's a repair, turnover clean, hot tub service, or concierge request — describe what you need. Your Homie dispatches local pros and brings back quotes in minutes, across every property.
          </p>
        </FadeIn>
        <FadeIn delay={0.3}>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
            <button onClick={() => navigate("/register?redirect=/business")} style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 17, fontWeight: 600, color: COLORS.white, background: COLORS.orange, border: "none", borderRadius: 100, padding: "16px 36px", cursor: "pointer", transition: "all 0.2s", boxShadow: "0 4px 24px rgba(232,99,43,0.25)" }} onMouseEnter={e => { (e.target as HTMLElement).style.background = COLORS.orangeDark; (e.target as HTMLElement).style.transform = "translateY(-2px)"; }} onMouseLeave={e => { (e.target as HTMLElement).style.background = COLORS.orange; (e.target as HTMLElement).style.transform = "translateY(0)"; }}>Start free trial</button>
          </div>
        </FadeIn>
        <FadeIn delay={0.45}>
          <div style={{ display: "flex", gap: 40, marginTop: 56, flexWrap: "wrap" }}>
            {[["50%", "less time on vendor calls"], ["3 taps", "to dispatch a turnover clean"], ["85%", "cheaper than a full-time coordinator"]].map(([stat, label], i) => (
              <div key={i} style={{ display: "flex", flexDirection: "column" }}>
                <span style={{ fontFamily: "Fraunces, serif", fontSize: 32, fontWeight: 700, color: COLORS.orange }}>{stat}</span>
                <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: COLORS.gray, fontWeight: 500 }}>{label}</span>
              </div>
            ))}
          </div>
        </FadeIn>
      </div>
    </section>
  );
}

function Logos() {
  return (
    <section style={{ background: COLORS.white, padding: "40px 24px", borderBottom: `1px solid ${COLORS.warm}` }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", textAlign: "center" }}>
        <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: COLORS.gray, fontWeight: 500, letterSpacing: 1, textTransform: "uppercase", marginBottom: 20 }}>Integrates with your property management tools</p>
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 48, flexWrap: "wrap", opacity: 0.4 }}>
          {["Guesty", "Hostaway", "AppFolio", "Lodgify", "Track", "Streamline"].map(name => (
            <span key={name} style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 20, fontWeight: 700, color: COLORS.dark }}>{name}</span>
          ))}
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    { num: "1", title: "Select your property", desc: "Pick from your imported portfolio. Access codes, appliance details, and preferred vendors load automatically.", icon: "🏠" },
    { num: "2", title: "Describe or select the job", desc: "Chat with the AI for repairs, or quick-select a service category — turnover clean, hot tub, restock, concierge.", icon: "💬" },
    { num: "3", title: "Your Homie dispatches", desc: "The AI agent contacts your preferred vendors first. If they're unavailable, it finds new pros from the local marketplace.", icon: "📞" },
    { num: "4", title: "Get quotes, book, done", desc: "Responses come back with quotes and availability. Book with one tap. Everything's tracked to the property.", icon: "✅" },
  ];
  return (
    <section id="how-it-works" style={{ background: COLORS.white, padding: "96px 24px" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <FadeIn>
          <div style={{ textAlign: "center", marginBottom: 64 }}>
            <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, color: COLORS.orange, letterSpacing: 1, textTransform: "uppercase" }}>How it works</span>
            <h2 style={{ fontFamily: "Fraunces, serif", fontSize: "clamp(32px, 4vw, 48px)", fontWeight: 700, color: COLORS.dark, margin: "12px 0 0" }}>Three taps. That's it.</h2>
          </div>
        </FadeIn>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 32 }}>
          {steps.map((s, i) => (
            <FadeIn key={i} delay={i * 0.1}>
              <div style={{ position: "relative", padding: 32, background: COLORS.warm, borderRadius: 20, height: "100%" }}>
                <div style={{ width: 48, height: 48, borderRadius: 12, background: COLORS.white, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20, fontSize: 22 }}>{s.icon}</div>
                <div style={{ fontFamily: "Fraunces, serif", fontSize: 14, fontWeight: 700, color: COLORS.orange, marginBottom: 8 }}>Step {s.num}</div>
                <h3 style={{ fontFamily: "Fraunces, serif", fontSize: 22, fontWeight: 700, color: COLORS.dark, margin: "0 0 12px" }}>{s.title}</h3>
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 15, color: COLORS.darkMid, lineHeight: 1.6, margin: 0 }}>{s.desc}</p>
              </div>
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  );
}

function Features() {
  const features = [
    { title: "Property workspace", desc: "Every property's details, access codes, appliance inventory, and maintenance history in one place. Select a property and the AI already knows the context.", color: COLORS.orange },
    { title: "Preferred vendor cascade", desc: "Set preferred vendors per property and category. Your Homie tries them first, then backups, then the open marketplace. The job always gets filled.", color: COLORS.green },
    { title: "Team accounts", desc: "Invite your coordinators, field techs, and property owners. Everyone sees the same dashboard. Full activity log shows who did what.", color: COLORS.orange },
    { title: "PMS import", desc: "Connect Guesty, Hostaway, or AppFolio and import your properties in one click. No double entry. Weekly sync keeps everything current.", color: COLORS.green },
    { title: "16 job categories", desc: "Plumbing, HVAC, turnover cleaning, hot tub service, supplies restocking, concierge, home inspections, trash valet, and more. If your property needs it, Homie handles it.", color: COLORS.orange },
    { title: "Cost tracking", desc: "See total spend by property, category, and vendor. Know which properties are money pits and which vendors are over-quoting. Export to CSV for your accountant.", color: COLORS.green },
    { title: "Human outreach manager", desc: "On Professional and Business plans, a dedicated human outreach manager works alongside the AI engine to follow up with providers, negotiate quotes, and ensure you get the best response rate.", color: COLORS.orange },
  ];
  return (
    <section id="features" style={{ background: COLORS.warm, padding: "96px 24px" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <FadeIn>
          <div style={{ textAlign: "center", marginBottom: 64 }}>
            <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, color: COLORS.green, letterSpacing: 1, textTransform: "uppercase" }}>Features</span>
            <h2 style={{ fontFamily: "Fraunces, serif", fontSize: "clamp(32px, 4vw, 48px)", fontWeight: 700, color: COLORS.dark, margin: "12px 0 0" }}>Everything your portfolio needs</h2>
          </div>
        </FadeIn>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 24 }}>
          {features.map((f, i) => (
            <FadeIn key={i} delay={i * 0.08}>
              <div style={{ background: COLORS.white, borderRadius: 20, padding: 36, height: "100%", borderTop: `3px solid ${f.color}`, transition: "transform 0.2s, box-shadow 0.2s" }} onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-4px)"; e.currentTarget.style.boxShadow = "0 12px 40px rgba(0,0,0,0.06)"; }} onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "none"; }}>
                <h3 style={{ fontFamily: "Fraunces, serif", fontSize: 22, fontWeight: 700, color: COLORS.dark, margin: "0 0 12px" }}>{f.title}</h3>
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 15, color: COLORS.darkMid, lineHeight: 1.65, margin: 0 }}>{f.desc}</p>
              </div>
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  );
}

function Categories() {
  const cats = [
    { name: "Plumbing", type: "repair" }, { name: "Electrical", type: "repair" }, { name: "HVAC", type: "repair" },
    { name: "Appliance", type: "repair" }, { name: "Structural", type: "repair" }, { name: "Roofing", type: "repair" },
    { name: "Pest control", type: "repair" }, { name: "Landscaping", type: "repair" },
    { name: "Turnover cleaning", type: "service" }, { name: "Hot tub / pool", type: "service" },
    { name: "Supplies restocking", type: "service" }, { name: "Home inspection", type: "service" },
    { name: "Concierge", type: "service" }, { name: "Trash valet", type: "service" },
    { name: "Locksmith / access", type: "service" }, { name: "General handyman", type: "repair" },
    { name: "Photography", type: "service" },
  ];
  return (
    <section style={{ background: COLORS.white, padding: "96px 24px" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <FadeIn>
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, color: COLORS.orange, letterSpacing: 1, textTransform: "uppercase" }}>Categories</span>
            <h2 style={{ fontFamily: "Fraunces, serif", fontSize: "clamp(28px, 3.5vw, 42px)", fontWeight: 700, color: COLORS.dark, margin: "12px 0 8px" }}>Whatever your property needs</h2>
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 16, color: COLORS.gray, margin: 0 }}>Repairs, services, and everything in between</p>
          </div>
        </FadeIn>
        <FadeIn delay={0.15}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "center", maxWidth: 800, margin: "0 auto" }}>
            {cats.map((c, i) => (
              <div key={i} style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 500, color: c.type === "service" ? "#085041" : COLORS.darkMid, background: c.type === "service" ? COLORS.greenLight : COLORS.warm, borderRadius: 100, padding: "10px 20px", transition: "transform 0.15s" }} onMouseEnter={e => e.currentTarget.style.transform = "scale(1.05)"} onMouseLeave={e => e.currentTarget.style.transform = "scale(1)"}>{c.name}</div>
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "center", gap: 20, marginTop: 24 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: COLORS.warm, border: `1px solid ${COLORS.grayLight}` }} />
              <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: COLORS.gray }}>Home repairs</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: COLORS.greenLight, border: `1px solid #9FE1CB` }} />
              <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: COLORS.gray }}>Property services</span>
            </div>
          </div>
        </FadeIn>
      </div>
    </section>
  );
}

function Pricing({ onSignup }: { onSignup: () => void }) {
  const { pricing } = usePricing();
  const bp = pricing.business;
  const [propertyCount, setPropertyCount] = useState(20);
  const tiers = [
    { name: "Starter", platformFee: bp.starter?.base ?? 0, promoFee: bp.starter?.promoBase ?? null, promoLabel: bp.starter?.promoLabel ?? null, perProperty: bp.starter?.perProperty ?? 10, maxProperties: bp.starter?.maxProperties ?? 10, members: `${bp.starter?.maxTeamMembers ?? 1} user${(bp.starter?.maxTeamMembers ?? 1) > 1 ? 's' : ''}`, badge: "Free to start", badgeColor: COLORS.green, popular: false,
      features: ["Unlimited AI diagnostics & estimates", "Automated provider outreach (SMS + email)", "Booking & dispatch management", "Preferred vendors (up to 5)", "iCal calendar sync", "Basic cost tracking per job"] },
    { name: "Professional", platformFee: bp.professional?.base ?? 99, promoFee: bp.professional?.promoBase ?? null, promoLabel: bp.professional?.promoLabel ?? null, perProperty: bp.professional?.perProperty ?? 10, maxProperties: bp.professional?.maxProperties ?? 150, members: `${bp.professional?.maxTeamMembers ?? 5} team members`, badge: "Most popular", badgeColor: COLORS.orange, popular: true,
      features: ["Everything in Starter, plus:", "Up to 150 properties", "Priority dispatch (phone, text & email)", "Track PMS sync", "Cost reporting & vendor scorecards", "Auto-dispatch rules & Slack alerts", "White-label guest portal with QR codes & property links", "Branded estimate PDFs"] },
    { name: "Business", platformFee: bp.business?.base ?? 249, promoFee: bp.business?.promoBase ?? null, promoLabel: bp.business?.promoLabel ?? null, perProperty: bp.business?.perProperty ?? 10, maxProperties: bp.business?.maxProperties ?? 500, members: `Unlimited team members`, badge: null, badgeColor: "", popular: false,
      features: ["Everything in Professional, plus:", "Up to 500 properties", "Unlimited team members with roles", "Dedicated outreach manager", "Priority email support with SLA", "Custom workspace onboarding", "Quarterly business review"] },
  ];

  return (
    <section id="pricing" style={{ background: COLORS.warm, padding: "96px 24px" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <FadeIn>
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, color: COLORS.orange, letterSpacing: 1, textTransform: "uppercase" }}>Pricing</span>
            <h2 style={{ fontFamily: "Fraunces, serif", fontSize: "clamp(32px, 4vw, 48px)", fontWeight: 700, color: COLORS.dark, margin: "12px 0 8px" }}>Simple per-property pricing. Every plan.</h2>
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 18, color: COLORS.gray, margin: "0 0 32px", maxWidth: 520, marginLeft: "auto", marginRight: "auto" }}>Choose the features your team needs. Your homie handles the rest.</p>

            {/* Property count slider */}
            <div style={{ maxWidth: 480, margin: "0 auto", background: COLORS.white, borderRadius: 16, padding: "24px 32px", border: `1px solid ${COLORS.grayLight}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 600, color: COLORS.dark }}>How many properties?</span>
                <span style={{ fontFamily: "Fraunces, serif", fontSize: 28, fontWeight: 700, color: COLORS.orange }}>{propertyCount}</span>
              </div>
              <input type="range" min={1} max={500} value={propertyCount} onChange={e => setPropertyCount(+e.target.value)}
                style={{ width: "100%", accentColor: COLORS.orange, cursor: "pointer" }} />
              <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: COLORS.gray, marginTop: 4 }}>
                <span>1</span><span>125</span><span>250</span><span>375</span><span>500</span>
              </div>
            </div>
          </div>
        </FadeIn>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 24, alignItems: "start" }}>
          {tiers.map((t, i) => {
            const props = Math.min(propertyCount, t.maxProperties);
            const activeFee = (t.promoFee != null && t.promoFee !== t.platformFee) ? t.promoFee : t.platformFee;
            const total = activeFee + (props * t.perProperty);
            return (
              <FadeIn key={i} delay={i * 0.1}>
                <div style={{ background: COLORS.white, borderRadius: 24, padding: 36, position: "relative", border: t.popular ? `2px solid ${COLORS.orange}` : `1px solid ${COLORS.grayLight}`, transition: "transform 0.2s, box-shadow 0.2s" }} onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-4px)"; e.currentTarget.style.boxShadow = "0 16px 48px rgba(0,0,0,0.08)"; }} onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "none"; }}>
                  {t.badge && <div style={{ position: "absolute", top: -14, left: "50%", transform: "translateX(-50%)", background: t.badgeColor, color: COLORS.white, fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 700, padding: "5px 16px", borderRadius: 100, whiteSpace: "nowrap" }}>{t.badge}</div>}
                  <h3 style={{ fontFamily: "Fraunces, serif", fontSize: 24, fontWeight: 700, color: COLORS.dark, margin: "0 0 4px" }}>{t.name}</h3>
                  <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: COLORS.gray, margin: "0 0 20px" }}>Up to {t.maxProperties} properties · {t.members}</p>
                  <div style={{ marginBottom: 24 }}>
                    {t.promoFee != null && t.promoFee !== t.platformFee ? (
                      <div>
                        {t.promoLabel && <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 700, color: COLORS.white, background: COLORS.green, padding: "3px 10px", borderRadius: 100, marginBottom: 8, display: "inline-block" }}>{t.promoLabel}</span>}
                        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                          <span style={{ fontFamily: "Fraunces, serif", fontSize: 48, fontWeight: 700, color: COLORS.dark }}>${t.promoFee}</span>
                          <span style={{ fontFamily: "Fraunces, serif", fontSize: 24, fontWeight: 700, color: COLORS.gray, textDecoration: "line-through" }}>${t.platformFee}</span>
                          <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 16, color: COLORS.gray }}>/mo</span>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                        <span style={{ fontFamily: "Fraunces, serif", fontSize: 48, fontWeight: 700, color: COLORS.dark }}>${t.platformFee}</span>
                        <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 16, color: COLORS.gray }}>/mo platform</span>
                      </div>
                    )}
                    <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 15, color: COLORS.darkMid, marginTop: 4 }}>
                      + <strong>${t.perProperty}</strong>/property/mo
                    </div>
                    {propertyCount > 0 && (
                      <div style={{
                        marginTop: 12, background: COLORS.warm, borderRadius: 10, padding: "10px 14px",
                        fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: COLORS.dark,
                      }}>
                        {propertyCount > t.maxProperties ? (
                          <span style={{ color: COLORS.gray }}>Supports up to {t.maxProperties} properties</span>
                        ) : (
                          <><strong style={{ fontSize: 20, color: COLORS.orange }}>${total}</strong><span style={{ color: COLORS.gray }}>/mo for {props} {props === 1 ? 'property' : 'properties'}</span></>
                        )}
                      </div>
                    )}
                  </div>
                  <button onClick={onSignup} style={{ width: "100%", fontFamily: "'DM Sans', sans-serif", fontSize: 16, fontWeight: 600, color: t.popular ? COLORS.white : COLORS.dark, background: t.popular ? COLORS.orange : COLORS.warm, border: t.popular ? "none" : `1px solid ${COLORS.grayLight}`, borderRadius: 12, padding: "14px 0", cursor: "pointer", transition: "all 0.2s", marginBottom: 28 }} onMouseEnter={e => { if (t.popular) (e.target as HTMLElement).style.background = COLORS.orangeDark; else (e.target as HTMLElement).style.background = COLORS.grayLight; }} onMouseLeave={e => { if (t.popular) (e.target as HTMLElement).style.background = COLORS.orange; else (e.target as HTMLElement).style.background = COLORS.warm; }}>{t.platformFee === 0 ? 'Start for free' : 'Start free trial'}</button>
                  <div style={{ borderTop: `1px solid ${COLORS.warm}`, paddingTop: 20 }}>
                    {t.features.map((f, j) => (
                      <div key={j} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                        <div style={{ width: 18, height: 18, borderRadius: "50%", background: COLORS.greenLight, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          <span style={{ color: COLORS.green, fontSize: 11, fontWeight: 700 }}>✓</span>
                        </div>
                        <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: COLORS.darkMid }}>{f}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </FadeIn>
            );
          })}
        </div>
        <FadeIn delay={0.4}>
          <div style={{ textAlign: "center", marginTop: 40 }}>
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 16, color: COLORS.gray }}>Managing 500+ properties? <a href="#" style={{ color: COLORS.orange, fontWeight: 600, textDecoration: "none" }}>Talk to us about Enterprise — custom platform fee, volume discounts, white-label, dedicated account manager →</a></p>
          </div>
        </FadeIn>
      </div>
    </section>
  );
}

function Testimonial() {
  return (
    <section style={{ background: COLORS.dark, padding: "80px 24px" }}>
      <div style={{ maxWidth: 800, margin: "0 auto", textAlign: "center" }}>
        <FadeIn>
          <p style={{ fontFamily: "Fraunces, serif", fontSize: "clamp(24px, 3vw, 36px)", fontWeight: 400, color: COLORS.white, lineHeight: 1.5, margin: "0 0 32px", fontStyle: "italic" }}>
            "I used to spend two hours every Monday calling around for quotes. Now I describe the issue, pick the property, and my Homie handles the rest. I got those two hours back."
          </p>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12 }}>
            <div style={{ width: 48, height: 48, borderRadius: "50%", background: COLORS.orange, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 18, fontWeight: 700, color: COLORS.white }}>JR</span>
            </div>
            <div style={{ textAlign: "left" }}>
              <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 15, fontWeight: 600, color: COLORS.white }}>Jessica R.</div>
              <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: COLORS.gray }}>PM, 38 units in San Diego</div>
            </div>
          </div>
        </FadeIn>
      </div>
    </section>
  );
}

function CTA({ onSignup }: { onSignup: () => void }) {
  return (
    <section style={{ background: `linear-gradient(165deg, ${COLORS.white} 0%, ${COLORS.warm} 100%)`, padding: "96px 24px" }}>
      <div style={{ maxWidth: 700, margin: "0 auto", textAlign: "center" }}>
        <FadeIn>
          <h2 style={{ fontFamily: "Fraunces, serif", fontSize: "clamp(32px, 4vw, 52px)", fontWeight: 700, color: COLORS.dark, margin: "0 0 16px", lineHeight: 1.1 }}>Every property needs a Homie</h2>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 18, color: COLORS.darkMid, lineHeight: 1.6, margin: "0 0 36px" }}>Start your 14-day free trial. Import your properties, dispatch your first job, and see why operators are switching to Homie.</p>
          <button onClick={onSignup} style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 18, fontWeight: 600, color: COLORS.white, background: COLORS.orange, border: "none", borderRadius: 100, padding: "18px 48px", cursor: "pointer", transition: "all 0.2s", boxShadow: "0 4px 24px rgba(232,99,43,0.3)" }} onMouseEnter={e => { (e.target as HTMLElement).style.background = COLORS.orangeDark; (e.target as HTMLElement).style.transform = "translateY(-2px)"; }} onMouseLeave={e => { (e.target as HTMLElement).style.background = COLORS.orange; (e.target as HTMLElement).style.transform = "translateY(0)"; }}>Get started free</button>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: COLORS.gray, marginTop: 16 }}>No credit card required. Setup takes 5 minutes.</p>
        </FadeIn>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer style={{ background: COLORS.dark, padding: "64px 24px 40px" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 40, marginBottom: 48 }}>
          <div>
            <span style={{ fontFamily: "Fraunces, serif", fontWeight: 700, fontSize: 24, color: COLORS.orange }}>homie</span>
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: COLORS.gray, lineHeight: 1.6, marginTop: 12 }}>AI-powered home services for property managers, hosts, and homeowners.</p>
          </div>
          <div>
            <h4 style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 700, color: COLORS.grayLight, letterSpacing: 1, textTransform: "uppercase", margin: "0 0 16px" }}>Product</h4>
            {[
              { label: "For homeowners", href: "/" },
              { label: "For property managers/hosts", href: "/business/landing" },
              { label: "Homie Inspect", href: "/inspect" },
              { label: "For inspectors", href: "/inspect/inspectors" },
              { label: "Become a Homie Pro", href: "/portal/signup" },
            ].map(l => (
              <a key={l.label} href={l.href} style={{ display: "block", fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: COLORS.gray, textDecoration: "none", marginBottom: 10, transition: "color 0.2s" }} onMouseEnter={e => (e.target as HTMLElement).style.color = COLORS.white} onMouseLeave={e => (e.target as HTMLElement).style.color = COLORS.gray}>{l.label}</a>
            ))}
          </div>
          <div>
            <h4 style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 700, color: COLORS.grayLight, letterSpacing: 1, textTransform: "uppercase", margin: "0 0 16px" }}>Company</h4>
            {["About", "Blog", "Careers", "Contact"].map(l => (
              <a key={l} href="#" style={{ display: "block", fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: COLORS.gray, textDecoration: "none", marginBottom: 10, transition: "color 0.2s" }} onMouseEnter={e => (e.target as HTMLElement).style.color = COLORS.white} onMouseLeave={e => (e.target as HTMLElement).style.color = COLORS.gray}>{l}</a>
            ))}
          </div>
          <div>
            <h4 style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 700, color: COLORS.grayLight, letterSpacing: 1, textTransform: "uppercase", margin: "0 0 16px" }}>Legal</h4>
            {[
              { label: "Privacy", href: "/privacy" },
              { label: "Terms", href: "/terms" },
              { label: "Security", href: "/security" },
            ].map(l => (
              <a key={l.label} href={l.href} style={{ display: "block", fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: COLORS.gray, textDecoration: "none", marginBottom: 10, transition: "color 0.2s" }} onMouseEnter={e => (e.target as HTMLElement).style.color = COLORS.white} onMouseLeave={e => (e.target as HTMLElement).style.color = COLORS.gray}>{l.label}</a>
            ))}
          </div>
        </div>
        <div style={{ borderTop: `1px solid rgba(255,255,255,0.08)`, paddingTop: 24, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: COLORS.gray }}>© 2026 Homie. Your home's best friend.</span>
          <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: COLORS.gray }}>Made with love in San Diego 🌴</span>
        </div>
      </div>
    </footer>
  );
}

interface DemoProperty { name: string; addr: string; beds: number; baths: number; img: string }
interface DemoCategory { name: string; icon: string; type: string }
interface DemoMsg { role: string; text: string }

function InteractiveDemo() {
  const [step, setStep] = useState(0);
  const [selectedProperty, setSelectedProperty] = useState<DemoProperty | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<DemoCategory | null>(null);
  const [chatMessages, setChatMessages] = useState<DemoMsg[]>([]);
  const [typing, setTyping] = useState(false);
  const [dispatching, setDispatching] = useState(false);
  const [dispatchStep, setDispatchStep] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const properties = [
    { name: "Beach House #4", addr: "2847 Ocean Front Walk", beds: 3, baths: 2, img: "🏖️" },
    { name: "Downtown Loft", addr: "1124 J Street, Unit 8B", beds: 1, baths: 1, img: "🏙️" },
    { name: "Mission Hills Cottage", addr: "4021 Hawk Street", beds: 2, baths: 1, img: "🏡" },
  ];

  const categories = [
    { name: "Plumbing", icon: "🔧", type: "repair" },
    { name: "HVAC", icon: "❄️", type: "repair" },
    { name: "Turnover clean", icon: "🧹", type: "service" },
    { name: "Hot tub", icon: "🛁", type: "service" },
    { name: "Restock", icon: "📦", type: "service" },
    { name: "Electrical", icon: "⚡", type: "repair" },
  ];

  const chatFlow = [
    { role: "assistant", text: "What's acting up at Beach House #4?" },
    { role: "user", text: "The guest says the hot water isn't working in the master bath shower" },
    { role: "assistant", text: "Got it — no hot water in the master shower. Quick question: is the hot water working at other fixtures in the house, like the kitchen sink?" },
    { role: "user", text: "Yes, the kitchen is fine. Just the master shower" },
    { role: "assistant", text: "That narrows it down — since hot water works elsewhere, it's likely the shower mixing valve or cartridge, not the water heater. This is a Moen fixture based on your property profile (installed 2021). Probably needs a cartridge replacement. I'd estimate $150–250 for a pro to handle it.\n\nWant me to find a Homie Pro?" },
  ];

  const dispatchSteps = [
    { text: "Contacting Rodriguez Plumbing (preferred)...", channel: "SMS" },
    { text: "Rodriguez Plumbing responded!", channel: "SMS", result: "$185 · Available tomorrow 9–11 AM" },
    { text: "Contacting Pacific Plumbing Co...", channel: "Voice" },
    { text: "Pacific Plumbing Co responded!", channel: "Voice", result: "$210 · Available tomorrow 1–3 PM" },
    { text: "Contacting SD Quick Fix...", channel: "Web" },
  ];

  useEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  const selectProperty = (p: DemoProperty) => {
    setSelectedProperty(p);
    setTimeout(() => setStep(1), 400);
  };

  const selectCategory = (c: DemoCategory) => {
    setSelectedCategory(c);
    setChatMessages([]);
    setStep(2);
    let i = 0;
    const addNext = () => {
      if (i >= chatFlow.length) return;
      const msg = chatFlow[i];
      if (msg.role === "assistant") {
        setTyping(true);
        timerRef.current = setTimeout(() => {
          setTyping(false);
          setChatMessages(prev => [...prev, msg]);
          i++;
          timerRef.current = setTimeout(addNext, 1200);
        }, 1000 + msg.text.length * 8);
      } else {
        timerRef.current = setTimeout(() => {
          setChatMessages(prev => [...prev, msg]);
          i++;
          timerRef.current = setTimeout(addNext, 800);
        }, 600);
      }
    };
    setTimeout(addNext, 500);
  };

  const startDispatch = () => {
    setStep(3);
    setDispatching(true);
    setDispatchStep(0);
    let i = 0;
    const next = () => {
      if (i >= dispatchSteps.length) { setDispatching(false); return; }
      setDispatchStep(i);
      i++;
      timerRef.current = setTimeout(next, i <= dispatchSteps.length ? 1800 : 0);
    };
    setTimeout(next, 600);
  };

  const reset = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setStep(0); setSelectedProperty(null); setSelectedCategory(null);
    setChatMessages([]); setTyping(false); setDispatching(false); setDispatchStep(0);
  };

  const dm = { fontFamily: "'DM Sans', sans-serif" };
  const fr = { fontFamily: "Fraunces, serif" };

  const Phone = ({ children, title }: { children: ReactNode; title: string }) => (
    <div style={{ background: COLORS.white, borderRadius: 24, border: `1px solid ${COLORS.grayLight}`, overflow: "hidden", maxWidth: 380, width: "100%", boxShadow: "0 8px 40px rgba(0,0,0,0.08)" }}>
      <div style={{ background: COLORS.warm, padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: `1px solid ${COLORS.grayLight}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ ...fr, fontWeight: 700, fontSize: 18, color: COLORS.orange }}>homie</span>
          <span style={{ ...dm, fontSize: 11, color: COLORS.gray, fontWeight: 500 }}>for business</span>
        </div>
        <span style={{ ...dm, fontSize: 11, color: COLORS.gray }}>{title}</span>
      </div>
      <div style={{ padding: 0, minHeight: 360, display: "flex", flexDirection: "column" }}>
        {children}
      </div>
    </div>
  );

  return (
    <section style={{ background: `linear-gradient(180deg, ${COLORS.white} 0%, ${COLORS.warm} 100%)`, padding: "96px 24px" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <FadeIn>
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <span style={{ ...dm, fontSize: 13, fontWeight: 600, color: COLORS.green, letterSpacing: 1, textTransform: "uppercase" }}>See it in action</span>
            <h2 style={{ ...fr, fontSize: "clamp(32px, 4vw, 48px)", fontWeight: 700, color: COLORS.dark, margin: "12px 0 8px" }}>From issue to quote in minutes</h2>
            <p style={{ ...dm, fontSize: 16, color: COLORS.gray, margin: 0 }}>Click through the demo below</p>
          </div>
        </FadeIn>
        <FadeIn delay={0.15}>
          <div style={{ display: "flex", justifyContent: "center", gap: 12, marginBottom: 32 }}>
            {["Select property", "Pick a category", "Diagnose", "Dispatch"].map((label, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 28, height: 28, borderRadius: "50%", background: step >= i ? COLORS.orange : COLORS.grayLight, color: step >= i ? COLORS.white : COLORS.gray, display: "flex", alignItems: "center", justifyContent: "center", ...dm, fontSize: 12, fontWeight: 700, transition: "all 0.3s" }}>{i + 1}</div>
                <span style={{ ...dm, fontSize: 13, color: step >= i ? COLORS.dark : COLORS.gray, fontWeight: step === i ? 600 : 400, display: i > 1 ? "none" : undefined }}>{label}</span>
                {i < 3 && <div style={{ width: 24, height: 2, background: step > i ? COLORS.orange : COLORS.grayLight, borderRadius: 1, transition: "all 0.3s" }} />}
              </div>
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "center" }}>
            {step === 0 && (
              <Phone title="Select property">
                <div style={{ padding: 16 }}>
                  <p style={{ ...dm, fontSize: 13, color: COLORS.gray, margin: "0 0 16px" }}>Which property is this for?</p>
                  {properties.map((p, i) => (
                    <div key={i} onClick={() => selectProperty(p)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", marginBottom: 8, borderRadius: 12, border: `1px solid ${COLORS.grayLight}`, cursor: "pointer", transition: "all 0.2s", background: COLORS.white }} onMouseEnter={e => { e.currentTarget.style.borderColor = COLORS.orange; e.currentTarget.style.background = COLORS.warm; }} onMouseLeave={e => { e.currentTarget.style.borderColor = COLORS.grayLight; e.currentTarget.style.background = COLORS.white; }}>
                      <span style={{ fontSize: 28 }}>{p.img}</span>
                      <div>
                        <div style={{ ...dm, fontSize: 15, fontWeight: 600, color: COLORS.dark }}>{p.name}</div>
                        <div style={{ ...dm, fontSize: 12, color: COLORS.gray }}>{p.addr}</div>
                        <div style={{ ...dm, fontSize: 11, color: COLORS.gray }}>{p.beds} bed · {p.baths} bath</div>
                      </div>
                    </div>
                  ))}
                </div>
              </Phone>
            )}

            {step === 1 && selectedProperty && (
              <Phone title={selectedProperty.name}>
                <div style={{ padding: "12px 16px 8px", borderBottom: `1px solid ${COLORS.warm}` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <span style={{ fontSize: 20 }}>{selectedProperty?.img}</span>
                    <div>
                      <span style={{ ...dm, fontSize: 14, fontWeight: 600, color: COLORS.dark }}>{selectedProperty?.name}</span>
                      <span style={{ ...dm, fontSize: 11, color: COLORS.gray, display: "block" }}>Context loaded: access codes, appliances, vendors</span>
                    </div>
                  </div>
                </div>
                <div style={{ padding: 16 }}>
                  <p style={{ ...dm, fontSize: 13, color: COLORS.gray, margin: "0 0 12px" }}>What do you need?</p>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                    {categories.map((c, i) => (
                      <div key={i} onClick={() => selectCategory(c)} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "16px 8px", borderRadius: 12, border: `1px solid ${COLORS.grayLight}`, cursor: "pointer", transition: "all 0.2s", background: COLORS.white }} onMouseEnter={e => { e.currentTarget.style.borderColor = COLORS.orange; e.currentTarget.style.background = COLORS.warm; }} onMouseLeave={e => { e.currentTarget.style.borderColor = COLORS.grayLight; e.currentTarget.style.background = COLORS.white; }}>
                        <span style={{ fontSize: 24 }}>{c.icon}</span>
                        <span style={{ ...dm, fontSize: 12, fontWeight: 500, color: COLORS.dark, textAlign: "center" }}>{c.name}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ textAlign: "center", margin: "16px 0 0" }}>
                    <span style={{ ...dm, fontSize: 13, color: COLORS.orange, fontWeight: 500, cursor: "pointer" }}>or describe the issue in chat →</span>
                  </div>
                </div>
              </Phone>
            )}

            {step === 2 && selectedProperty && (
              <Phone title={selectedProperty.name}>
                <div style={{ flex: 1, padding: 16, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10 }}>
                  {chatMessages.map((m, i) => (
                    <div key={i} style={{ alignSelf: m.role === "user" ? "flex-end" : "flex-start", maxWidth: "85%", padding: "10px 14px", borderRadius: 14, borderBottomRightRadius: m.role === "user" ? 4 : 14, borderBottomLeftRadius: m.role === "assistant" ? 4 : 14, background: m.role === "user" ? COLORS.orange : COLORS.warm, color: m.role === "user" ? COLORS.white : COLORS.dark, ...dm, fontSize: 13, lineHeight: 1.55, whiteSpace: "pre-wrap", animation: "fadeUp 0.3s ease" }}>
                      {m.text}
                    </div>
                  ))}
                  {typing && (
                    <div style={{ alignSelf: "flex-start", padding: "10px 14px", borderRadius: 14, borderBottomLeftRadius: 4, background: COLORS.warm, ...dm, fontSize: 13, color: COLORS.gray }}>
                      <span style={{ animation: "pulse 1s ease infinite" }}>Your Homie is thinking...</span>
                    </div>
                  )}
                  {chatMessages.length >= 5 && !typing && (
                    <div style={{ textAlign: "center", marginTop: 8 }}>
                      <button onClick={startDispatch} style={{ ...dm, fontSize: 14, fontWeight: 600, color: COLORS.white, background: COLORS.orange, border: "none", borderRadius: 100, padding: "10px 24px", cursor: "pointer", transition: "all 0.2s", boxShadow: "0 2px 12px rgba(232,99,43,0.3)" }} onMouseEnter={e => (e.target as HTMLElement).style.background = COLORS.orangeDark} onMouseLeave={e => (e.target as HTMLElement).style.background = COLORS.orange}>Find a Homie Pro</button>
                    </div>
                  )}
                </div>
              </Phone>
            )}

            {step === 3 && (
              <Phone title="Outreach in progress">
                <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
                  <div style={{ background: COLORS.warm, borderRadius: 12, padding: "12px 16px", textAlign: "center" }}>
                    <div style={{ ...dm, fontSize: 12, color: COLORS.gray, marginBottom: 4 }}>Dispatching for {selectedProperty?.name}</div>
                    <div style={{ ...fr, fontSize: 18, fontWeight: 700, color: COLORS.dark }}>Shower mixing valve replacement</div>
                    <div style={{ ...dm, fontSize: 12, color: COLORS.orange, fontWeight: 600, marginTop: 4 }}>$150–$250 estimated</div>
                  </div>
                  <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
                    {[{ label: "Voice", count: 1 }, { label: "SMS", count: 1 }, { label: "Web", count: 1 }].map((ch, i) => (
                      <div key={i} style={{ background: COLORS.white, border: `1px solid ${COLORS.grayLight}`, borderRadius: 8, padding: "8px 14px", textAlign: "center", flex: 1 }}>
                        <div style={{ ...dm, fontSize: 11, color: COLORS.gray }}>{ch.label}</div>
                        <div style={{ ...fr, fontSize: 18, fontWeight: 700, color: dispatchStep >= i ? COLORS.orange : COLORS.grayLight, transition: "color 0.3s" }}>{dispatchStep >= i * 2 ? "1" : "0"}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {dispatchSteps.slice(0, dispatchStep + 1).map((s, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: 10, background: s.result ? COLORS.greenLight : COLORS.warm, animation: "fadeUp 0.3s ease" }}>
                        <div style={{ width: 8, height: 8, borderRadius: "50%", background: s.result ? COLORS.green : COLORS.orange, flexShrink: 0 }} />
                        <div style={{ flex: 1 }}>
                          <div style={{ ...dm, fontSize: 12, color: s.result ? "#085041" : COLORS.darkMid }}>{s.text}</div>
                          {s.result && <div style={{ ...dm, fontSize: 13, fontWeight: 600, color: "#085041", marginTop: 2 }}>{s.result}</div>}
                        </div>
                        <span style={{ ...dm, fontSize: 10, color: COLORS.gray, background: COLORS.white, padding: "2px 8px", borderRadius: 100, border: `1px solid ${COLORS.grayLight}` }}>{s.channel}</span>
                      </div>
                    ))}
                    {dispatching && (
                      <div style={{ textAlign: "center", padding: 8 }}>
                        <span style={{ ...dm, fontSize: 12, color: COLORS.gray, animation: "pulse 1.5s ease infinite" }}>Your Homie's working the phones...</span>
                      </div>
                    )}
                  </div>
                  {!dispatching && dispatchStep >= 4 && (
                    <div style={{ textAlign: "center", marginTop: 4 }}>
                      <div style={{ ...dm, fontSize: 14, fontWeight: 600, color: COLORS.green, marginBottom: 12 }}>Your Homie came through — 2 quotes ready</div>
                      <button onClick={reset} style={{ ...dm, fontSize: 13, fontWeight: 600, color: COLORS.orange, background: "transparent", border: `1px solid ${COLORS.orange}`, borderRadius: 100, padding: "8px 20px", cursor: "pointer", transition: "all 0.2s" }} onMouseEnter={e => { (e.target as HTMLElement).style.background = COLORS.orange; (e.target as HTMLElement).style.color = COLORS.white; }} onMouseLeave={e => { (e.target as HTMLElement).style.background = "transparent"; (e.target as HTMLElement).style.color = COLORS.orange; }}>Restart demo</button>
                    </div>
                  )}
                </div>
              </Phone>
            )}
          </div>
          <style>{`
            @keyframes fadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
            @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
          `}</style>
        </FadeIn>
      </div>
    </section>
  );
}

function OutreachEngine() {
  const [active, setActive] = useState(false);
  const [step, setStep] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const providers = [
    { name: "Rodriguez Plumbing", channel: "SMS", rating: 4.9, badge: "Preferred", status: "accepted", quote: "$185", time: "Tomorrow 9–11 AM" },
    { name: "Pacific Plumbing Co", channel: "Voice", rating: 4.7, badge: "", status: "accepted", quote: "$210", time: "Tomorrow 1–3 PM" },
    { name: "SD Quick Fix", channel: "Web", rating: 4.5, badge: "", status: "pending", quote: "—", time: "—" },
    { name: "All City Plumbing", channel: "SMS", rating: 4.4, badge: "", status: "declined", quote: "—", time: "—" },
    { name: "Coastal Home Services", channel: "Voice", rating: 4.8, badge: "", status: "no answer", quote: "—", time: "—" },
  ];

  const startAnimation = () => {
    if (active) return;
    setActive(true);
    setStep(0);
    let i = 0;
    const next = () => {
      if (i >= providers.length) return;
      setStep(i);
      i++;
      timerRef.current = setTimeout(next, 1200);
    };
    next();
  };

  useEffect(() => { return () => { if (timerRef.current) clearTimeout(timerRef.current); }; }, []);

  const dm = { fontFamily: "'DM Sans', sans-serif" };
  const fr = { fontFamily: "Fraunces, serif" };

  const statusColor = (s: string) => s === "accepted" ? COLORS.green : s === "declined" ? "#E24B4A" : s === "pending" ? COLORS.orange : COLORS.gray;
  const statusBg = (s: string) => s === "accepted" ? COLORS.greenLight : s === "declined" ? "#FCEBEB" : s === "pending" ? "#FAECE7" : COLORS.warm;
  const channelIcon = (c: string) => c === "Voice" ? "📞" : c === "SMS" ? "💬" : "🌐";

  return (
    <section style={{ background: COLORS.dark, padding: "96px 24px", overflow: "hidden" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <FadeIn>
          <div style={{ display: "flex", gap: 64, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 400px", minWidth: 300 }}>
              <span style={{ ...dm, fontSize: 13, fontWeight: 600, color: COLORS.orange, letterSpacing: 1, textTransform: "uppercase" }}>The outreach engine</span>
              <h2 style={{ ...fr, fontSize: "clamp(28px, 3.5vw, 42px)", fontWeight: 700, color: COLORS.white, margin: "12px 0 20px", lineHeight: 1.15 }}>Your Homie calls so you don't have to</h2>
              <p style={{ ...dm, fontSize: 16, color: COLORS.gray, lineHeight: 1.7, margin: "0 0 24px" }}>When you dispatch a job, the AI agent contacts providers simultaneously across three channels — voice calls, text messages, and web forms. Preferred vendors get first priority. Responses stream back in real time with quotes and availability.</p>
              <div style={{ display: "flex", gap: 24, marginBottom: 32 }}>
                {[{ label: "Voice calls", desc: "Real AI phone calls to providers", icon: "📞" }, { label: "SMS outreach", desc: "Smart text conversations", icon: "💬" }, { label: "Web discovery", desc: "Contact forms & booking", icon: "🌐" }].map((c, i) => (
                  <div key={i} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <span style={{ fontSize: 20 }}>{c.icon}</span>
                    <span style={{ ...dm, fontSize: 14, fontWeight: 600, color: COLORS.white }}>{c.label}</span>
                    <span style={{ ...dm, fontSize: 12, color: COLORS.gray }}>{c.desc}</span>
                  </div>
                ))}
              </div>
              {!active && (
                <button onClick={startAnimation} style={{ ...dm, fontSize: 16, fontWeight: 600, color: COLORS.dark, background: COLORS.white, border: "none", borderRadius: 100, padding: "14px 32px", cursor: "pointer", transition: "all 0.2s" }} onMouseEnter={e => { (e.target as HTMLElement).style.background = COLORS.orange; (e.target as HTMLElement).style.color = COLORS.white; }} onMouseLeave={e => { (e.target as HTMLElement).style.background = COLORS.white; (e.target as HTMLElement).style.color = COLORS.dark; }}>Watch it work →</button>
              )}
              {active && step >= providers.length - 1 && (
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 40, height: 40, borderRadius: "50%", background: COLORS.green, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <span style={{ color: COLORS.white, fontSize: 18, fontWeight: 700 }}>✓</span>
                  </div>
                  <div>
                    <div style={{ ...dm, fontSize: 16, fontWeight: 600, color: COLORS.white }}>2 quotes ready in under 3 minutes</div>
                    <div style={{ ...dm, fontSize: 13, color: COLORS.gray }}>5 providers contacted across 3 channels</div>
                  </div>
                </div>
              )}
            </div>
            <div style={{ flex: "1 1 420px", minWidth: 320 }}>
              <div style={{ background: "rgba(255,255,255,0.05)", borderRadius: 20, border: "1px solid rgba(255,255,255,0.08)", padding: 24 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                  <span style={{ ...dm, fontSize: 14, fontWeight: 600, color: COLORS.white }}>Provider outreach</span>
                  <span style={{ ...dm, fontSize: 12, color: active ? COLORS.orange : COLORS.gray }}>{active ? (step >= providers.length - 1 ? "Complete" : "In progress...") : "Waiting to start"}</span>
                </div>
                {providers.map((p, i) => {
                  const visible = active && i <= step;
                  return (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", marginBottom: 6, borderRadius: 12, background: visible ? "rgba(255,255,255,0.06)" : "transparent", border: visible ? "1px solid rgba(255,255,255,0.08)" : "1px solid transparent", opacity: visible ? 1 : 0.2, transition: "all 0.5s ease", transform: visible ? "translateX(0)" : "translateX(20px)" }}>
                      <span style={{ fontSize: 16, width: 24, textAlign: "center" }}>{channelIcon(p.channel)}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ ...dm, fontSize: 13, fontWeight: 600, color: COLORS.white, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
                          {p.badge && <span style={{ ...dm, fontSize: 9, fontWeight: 700, color: COLORS.orange, background: "rgba(232,99,43,0.15)", padding: "2px 6px", borderRadius: 4 }}>{p.badge}</span>}
                        </div>
                        <div style={{ ...dm, fontSize: 11, color: COLORS.gray }}>
                          ★ {p.rating} · {p.channel}
                          {visible && p.status === "accepted" && <span style={{ color: COLORS.green, fontWeight: 600 }}> · {p.quote} · {p.time}</span>}
                        </div>
                      </div>
                      {visible && (
                        <span style={{ ...dm, fontSize: 10, fontWeight: 600, color: statusColor(p.status), background: statusBg(p.status), padding: "3px 8px", borderRadius: 100, whiteSpace: "nowrap" }}>{p.status}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </FadeIn>
      </div>
    </section>
  );
}

export default function BusinessLanding() {
  const navigate = useNavigate();
  const handleSignup = () => navigate("/register?redirect=/business");
  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif", background: COLORS.white, minHeight: "100vh" }}>
      <SEO
        title="Homie for Business — Property Management Maintenance Platform"
        description="Dispatch local pros across your entire property portfolio in 3 taps. AI-powered vendor coordination for property managers and vacation rental hosts."
        canonical="/business/landing"
      />
      <link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@0,400;0,700;1,400&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />
      <Nav />
      <Hero />
      <Logos />
      <InteractiveDemo />
      <HowItWorks />
      <Features />
      <OutreachEngine />
      <Categories />
      <Testimonial />
      <Pricing onSignup={handleSignup} />
      <CTA onSignup={handleSignup} />
      <Footer />
    </div>
  );
}
