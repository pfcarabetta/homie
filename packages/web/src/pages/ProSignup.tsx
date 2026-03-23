import { useState, useEffect, useRef, type ReactNode } from "react";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

const C = {
  orange: "#E8632B", orangeDark: "#C8531E", orangeLight: "#F0997B",
  green: "#1B9E77", greenLight: "#E1F5EE",
  dark: "#2D2926", darkMid: "#4A4543",
  gray: "#9B9490", grayLight: "#D3CEC9",
  warm: "#F9F5F2", white: "#FFFFFF",
};

const dm = { fontFamily: "'DM Sans', sans-serif" };
const fr = { fontFamily: "Fraunces, serif" };

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

function SignupForm() {
  const [formStep, setFormStep] = useState(0);
  const [formData, setFormData] = useState({ name: "", business: "", phone: "", email: "", zip: "", category: "" });
  const [submitted, setSubmitted] = useState(false);

  const categories = ["Plumbing", "Electrical", "HVAC", "Appliance repair", "General handyman", "Cleaning services", "Landscaping", "Pest control", "Roofing", "Pool / hot tub", "Locksmith", "Painting", "Other"];

  const update = (k: string, v: string) => setFormData(prev => ({ ...prev, [k]: v }));

  const inputStyle: React.CSSProperties = { ...dm, width: "100%", padding: "14px 16px", fontSize: 16, border: `1px solid ${C.grayLight}`, borderRadius: 12, outline: "none", color: C.dark, background: C.white, transition: "border-color 0.2s", boxSizing: "border-box" };
  const labelStyle: React.CSSProperties = { ...dm, fontSize: 13, fontWeight: 600, color: C.darkMid, display: "block", marginBottom: 6 };

  if (submitted) {
    return (
      <div style={{ textAlign: "center", padding: "48px 24px" }}>
        <div style={{ width: 64, height: 64, borderRadius: "50%", background: C.greenLight, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
          <span style={{ color: C.green, fontSize: 28, fontWeight: 700 }}>✓</span>
        </div>
        <h3 style={{ ...fr, fontSize: 28, fontWeight: 700, color: C.dark, margin: "0 0 12px" }}>Welcome to the crew</h3>
        <p style={{ ...dm, fontSize: 16, color: C.darkMid, lineHeight: 1.6, maxWidth: 360, margin: "0 auto" }}>You're in, {formData.name.split(" ")[0]}. We'll start sending you pre-qualified leads as homeowners in your area request {formData.category.toLowerCase()} services.</p>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 4, marginBottom: 28 }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{ flex: 1, height: 4, borderRadius: 2, background: formStep >= i ? C.orange : C.grayLight, transition: "all 0.3s" }} />
        ))}
      </div>

      {formStep === 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <label style={labelStyle}>Your name</label>
            <input value={formData.name} onChange={e => update("name", e.target.value)} placeholder="Full name" style={inputStyle} onFocus={e => (e.target as HTMLElement).style.borderColor = C.orange} onBlur={e => (e.target as HTMLElement).style.borderColor = C.grayLight} />
          </div>
          <div>
            <label style={labelStyle}>Business name</label>
            <input value={formData.business} onChange={e => update("business", e.target.value)} placeholder="Your company name" style={inputStyle} onFocus={e => (e.target as HTMLElement).style.borderColor = C.orange} onBlur={e => (e.target as HTMLElement).style.borderColor = C.grayLight} />
          </div>
          <div>
            <label style={labelStyle}>Phone number</label>
            <input value={formData.phone} onChange={e => update("phone", e.target.value)} placeholder="(555) 123-4567" style={inputStyle} onFocus={e => (e.target as HTMLElement).style.borderColor = C.orange} onBlur={e => (e.target as HTMLElement).style.borderColor = C.grayLight} />
          </div>
          <button onClick={() => setFormStep(1)} disabled={!formData.name || !formData.business || !formData.phone} style={{ ...dm, width: "100%", padding: "14px 0", fontSize: 16, fontWeight: 600, color: C.white, background: (!formData.name || !formData.business || !formData.phone) ? C.grayLight : C.orange, border: "none", borderRadius: 12, cursor: (!formData.name || !formData.business || !formData.phone) ? "not-allowed" : "pointer", transition: "all 0.2s", marginTop: 4 }}>Next</button>
        </div>
      )}

      {formStep === 1 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <label style={labelStyle}>Email address</label>
            <input value={formData.email} onChange={e => update("email", e.target.value)} placeholder="you@company.com" type="email" style={inputStyle} onFocus={e => (e.target as HTMLElement).style.borderColor = C.orange} onBlur={e => (e.target as HTMLElement).style.borderColor = C.grayLight} />
          </div>
          <div>
            <label style={labelStyle}>Service area ZIP code</label>
            <input value={formData.zip} onChange={e => update("zip", e.target.value)} placeholder="92103" style={inputStyle} onFocus={e => (e.target as HTMLElement).style.borderColor = C.orange} onBlur={e => (e.target as HTMLElement).style.borderColor = C.grayLight} />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setFormStep(0)} style={{ ...dm, flex: 1, padding: "14px 0", fontSize: 16, fontWeight: 600, color: C.darkMid, background: C.warm, border: `1px solid ${C.grayLight}`, borderRadius: 12, cursor: "pointer" }}>Back</button>
            <button onClick={() => setFormStep(2)} disabled={!formData.email || !formData.zip} style={{ ...dm, flex: 2, padding: "14px 0", fontSize: 16, fontWeight: 600, color: C.white, background: (!formData.email || !formData.zip) ? C.grayLight : C.orange, border: "none", borderRadius: 12, cursor: (!formData.email || !formData.zip) ? "not-allowed" : "pointer", transition: "all 0.2s" }}>Next</button>
          </div>
        </div>
      )}

      {formStep === 2 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <label style={labelStyle}>Primary service category</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {categories.map(cat => (
                <div key={cat} onClick={() => update("category", cat)} style={{ ...dm, fontSize: 13, fontWeight: 500, padding: "8px 16px", borderRadius: 100, border: formData.category === cat ? `2px solid ${C.orange}` : `1px solid ${C.grayLight}`, background: formData.category === cat ? C.warm : C.white, color: formData.category === cat ? C.orange : C.darkMid, cursor: "pointer", transition: "all 0.15s" }}>{cat}</div>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
            <button onClick={() => setFormStep(1)} style={{ ...dm, flex: 1, padding: "14px 0", fontSize: 16, fontWeight: 600, color: C.darkMid, background: C.warm, border: `1px solid ${C.grayLight}`, borderRadius: 12, cursor: "pointer" }}>Back</button>
            <button onClick={() => setSubmitted(true)} disabled={!formData.category} style={{ ...dm, flex: 2, padding: "14px 0", fontSize: 16, fontWeight: 600, color: C.white, background: !formData.category ? C.grayLight : C.orange, border: "none", borderRadius: 12, cursor: !formData.category ? "not-allowed" : "pointer", transition: "all 0.2s" }}>Join Homie Pro — it's free</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ProSignup() {
  useDocumentTitle('Join Homie Pro — Free Provider Network');
  return (
    <div style={{ ...dm, background: C.white, minHeight: "100vh" }}>
      <link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@0,400;0,700;1,400&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />

      {/* ── NAV ── */}
      <nav style={{ padding: "0 24px", borderBottom: `1px solid ${C.warm}` }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", height: 64 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span style={{ ...fr, fontWeight: 700, fontSize: 26, color: C.orange }}>homie</span>
            <span style={{ ...dm, fontSize: 13, color: C.gray, fontWeight: 500 }}>pro</span>
          </div>
          <span style={{ ...dm, fontSize: 14, color: C.gray }}>Already a Homie? <a href="/portal/login" style={{ color: C.orange, fontWeight: 600, textDecoration: "none" }}>Sign in</a></span>
        </div>
      </nav>

      {/* ── HERO + FORM ── */}
      <section style={{ background: `linear-gradient(165deg, ${C.warm} 0%, ${C.white} 100%)`, padding: "64px 24px 80px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", gap: 64, alignItems: "flex-start", flexWrap: "wrap" }}>
          {/* Left: value prop */}
          <div style={{ flex: "1 1 440px", minWidth: 300, paddingTop: 16 }}>
            <FadeIn>
              <div style={{ display: "inline-block", background: C.greenLight, borderRadius: 100, padding: "6px 14px", marginBottom: 20 }}>
                <span style={{ ...dm, fontSize: 13, fontWeight: 600, color: C.green }}>Free to join — always</span>
              </div>
              <h1 style={{ ...fr, fontSize: "clamp(36px, 5vw, 56px)", fontWeight: 700, color: C.dark, lineHeight: 1.1, margin: "0 0 20px" }}>Get real leads,<br />not invoices</h1>
              <p style={{ ...dm, fontSize: "clamp(17px, 1.8vw, 20px)", color: C.darkMid, lineHeight: 1.65, maxWidth: 520, margin: "0 0 32px" }}>Homie sends you pre-qualified, AI-diagnosed leads from homeowners and property managers in your area. No sign-up fees. No monthly charges. No bidding wars. Just real jobs, in real time.</p>
            </FadeIn>

            <FadeIn delay={0.15}>
              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                {[
                  { icon: "💰", title: "100% free to list", desc: "No subscription, no lead fees, no hidden costs. Unlike Angi and Thumbtack, you'll never pay to be on Homie." },
                  { icon: "🎯", title: "Pre-qualified leads", desc: "Every lead comes with a full AI diagnosis — issue, severity, photos, and estimated cost. No more showing up blind." },
                  { icon: "📞", title: "Delivered in real time", desc: "When a homeowner needs help, our AI agent calls or texts you directly with the job details. Accept in seconds." },
                  { icon: "🏠", title: "Property manager jobs", desc: "Get high-volume, recurring work from PM companies and STR operators who use Homie to manage their portfolios." },
                ].map((item, i) => (
                  <div key={i} style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                    <span style={{ fontSize: 22, flexShrink: 0, marginTop: 2 }}>{item.icon}</span>
                    <div>
                      <div style={{ ...dm, fontSize: 16, fontWeight: 600, color: C.dark, marginBottom: 2 }}>{item.title}</div>
                      <div style={{ ...dm, fontSize: 14, color: C.gray, lineHeight: 1.55 }}>{item.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </FadeIn>
          </div>

          {/* Right: signup form */}
          <div style={{ flex: "1 1 380px", minWidth: 320, maxWidth: 440 }}>
            <FadeIn delay={0.1}>
              <div style={{ background: C.white, borderRadius: 24, padding: "32px 28px", border: `1px solid ${C.grayLight}`, boxShadow: "0 8px 40px rgba(0,0,0,0.06)" }}>
                <h2 style={{ ...fr, fontSize: 24, fontWeight: 700, color: C.dark, margin: "0 0 4px" }}>Join the Homie Pro network</h2>
                <p style={{ ...dm, fontSize: 14, color: C.gray, margin: "0 0 24px" }}>Takes about 60 seconds. No credit card needed.</p>
                <SignupForm />
              </div>
            </FadeIn>
          </div>
        </div>
      </section>

      {/* ── COMPARISON ── */}
      <section style={{ background: C.white, padding: "80px 24px" }}>
        <div style={{ maxWidth: 800, margin: "0 auto" }}>
          <FadeIn>
            <div style={{ textAlign: "center", marginBottom: 40 }}>
              <h2 style={{ ...fr, fontSize: "clamp(28px, 3.5vw, 40px)", fontWeight: 700, color: C.dark, margin: "0 0 8px" }}>Why pros are switching to Homie</h2>
              <p style={{ ...dm, fontSize: 16, color: C.gray }}>See how Homie stacks up</p>
            </div>
          </FadeIn>
          <FadeIn delay={0.1}>
            <div style={{ borderRadius: 20, overflow: "hidden", border: `1px solid ${C.grayLight}` }}>
              <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", background: C.dark }}>
                <div style={{ padding: "14px 20px" }} />
                {["Angi / Thumbtack", "TaskRabbit", "Homie"].map((name, i) => (
                  <div key={i} style={{ padding: "14px 12px", textAlign: "center", ...dm, fontSize: 13, fontWeight: 700, color: i === 2 ? C.orange : C.white }}>{name}</div>
                ))}
              </div>
              {[
                { label: "Cost to join", vals: ["$0 (ads extra)", "$0", "$0"] },
                { label: "Monthly fees", vals: ["$300+/mo for ads", "15–30% cut", "None, ever"] },
                { label: "Lead quality", vals: ["Generic requests", "Task-based", "AI-diagnosed"] },
                { label: "Job context", vals: ["Homeowner description", "Brief task", "Full diagnosis + photos"] },
                { label: "How leads arrive", vals: ["Email, you follow up", "You browse & bid", "We call/text you directly"] },
                { label: "Competition", vals: ["5–10 pros per lead", "Bidding marketplace", "1-on-1 referral"] },
                { label: "PM / STR jobs", vals: ["Limited", "No", "Yes, built-in"] },
              ].map((row, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", background: i % 2 === 0 ? C.warm : C.white }}>
                  <div style={{ padding: "12px 20px", ...dm, fontSize: 14, fontWeight: 600, color: C.dark }}>{row.label}</div>
                  {row.vals.map((val, j) => (
                    <div key={j} style={{ padding: "12px", textAlign: "center", ...dm, fontSize: 13, color: j === 2 ? "#085041" : C.darkMid, fontWeight: j === 2 ? 600 : 400, background: j === 2 && i % 2 === 0 ? "rgba(27,158,119,0.06)" : j === 2 && i % 2 !== 0 ? "rgba(27,158,119,0.03)" : "transparent" }}>{val}</div>
                  ))}
                </div>
              ))}
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section style={{ background: C.warm, padding: "80px 24px" }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <FadeIn>
            <div style={{ textAlign: "center", marginBottom: 48 }}>
              <h2 style={{ ...fr, fontSize: "clamp(28px, 3.5vw, 40px)", fontWeight: 700, color: C.dark, margin: "0 0 8px" }}>How Homie Pro works</h2>
              <p style={{ ...dm, fontSize: 16, color: C.gray }}>No bidding. No chasing. Leads come to you.</p>
            </div>
          </FadeIn>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 24 }}>
            {[
              { num: "1", title: "A homeowner has a problem", desc: "They describe the issue to Homie's AI. The AI diagnoses it — identifies the cause, estimates cost, and collects photos.", color: C.orange },
              { num: "2", title: "Our AI agent contacts you", desc: "Homie calls or texts you with the full diagnosis, location, and the homeowner's budget and timing preferences.", color: C.green },
              { num: "3", title: "You accept and quote", desc: "Reply with your quote and availability. No bidding against 10 other pros. The homeowner sees your response alongside 2–3 others max.", color: C.orange },
              { num: "4", title: "You get booked directly", desc: "The homeowner picks you and reaches out. You show up knowing exactly what the job is. No surprises.", color: C.green },
            ].map((s, i) => (
              <FadeIn key={i} delay={i * 0.1}>
                <div style={{ background: C.white, borderRadius: 20, padding: 28, height: "100%", borderTop: `3px solid ${s.color}` }}>
                  <div style={{ width: 36, height: 36, borderRadius: "50%", background: s.color, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16, ...dm, fontSize: 16, fontWeight: 700, color: C.white }}>{s.num}</div>
                  <h3 style={{ ...fr, fontSize: 20, fontWeight: 700, color: C.dark, margin: "0 0 10px" }}>{s.title}</h3>
                  <p style={{ ...dm, fontSize: 14, color: C.darkMid, lineHeight: 1.6, margin: 0 }}>{s.desc}</p>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ── WHAT A LEAD LOOKS LIKE ── */}
      <section style={{ background: C.white, padding: "80px 24px" }}>
        <div style={{ maxWidth: 800, margin: "0 auto" }}>
          <FadeIn>
            <div style={{ textAlign: "center", marginBottom: 40 }}>
              <h2 style={{ ...fr, fontSize: "clamp(28px, 3.5vw, 40px)", fontWeight: 700, color: C.dark, margin: "0 0 8px" }}>What a Homie lead looks like</h2>
              <p style={{ ...dm, fontSize: 16, color: C.gray }}>Not "homeowner needs plumber." This.</p>
            </div>
          </FadeIn>
          <FadeIn delay={0.1}>
            <div style={{ background: C.warm, borderRadius: 24, padding: "32px 28px", maxWidth: 480, margin: "0 auto", border: `1px solid ${C.grayLight}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ ...fr, fontWeight: 700, fontSize: 16, color: C.orange }}>homie</span>
                  <span style={{ ...dm, fontSize: 11, fontWeight: 600, color: C.white, background: C.green, padding: "2px 8px", borderRadius: 100 }}>New lead</span>
                </div>
                <span style={{ ...dm, fontSize: 12, color: C.gray }}>Just now</span>
              </div>
              <h3 style={{ ...dm, fontSize: 18, fontWeight: 700, color: C.dark, margin: "0 0 4px" }}>Leaking kitchen faucet</h3>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                <span style={{ ...dm, fontSize: 11, fontWeight: 600, color: C.darkMid, background: C.white, padding: "4px 10px", borderRadius: 100, border: `1px solid ${C.grayLight}` }}>Plumbing</span>
                <span style={{ ...dm, fontSize: 11, fontWeight: 600, color: "#854F0B", background: "#FAEEDA", padding: "4px 10px", borderRadius: 100 }}>Medium severity</span>
                <span style={{ ...dm, fontSize: 11, fontWeight: 600, color: C.darkMid, background: C.white, padding: "4px 10px", borderRadius: 100, border: `1px solid ${C.grayLight}` }}>92103 · 4.2 mi</span>
              </div>
              <div style={{ background: C.white, borderRadius: 12, padding: "14px 16px", marginBottom: 12, border: `1px solid ${C.grayLight}` }}>
                <div style={{ ...dm, fontSize: 12, fontWeight: 600, color: C.orange, marginBottom: 6 }}>AI diagnosis</div>
                <p style={{ ...dm, fontSize: 13, color: C.darkMid, lineHeight: 1.6, margin: 0 }}>Single-handle Moen faucet leaking from base when turned on. Likely worn cartridge. Faucet is ~6 years old. No water damage under cabinet. No pipe issues detected.</p>
              </div>
              <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
                <div style={{ flex: 1, background: C.white, borderRadius: 10, padding: "10px 12px", border: `1px solid ${C.grayLight}`, textAlign: "center" }}>
                  <div style={{ ...dm, fontSize: 11, color: C.gray }}>Budget</div>
                  <div style={{ ...dm, fontSize: 16, fontWeight: 700, color: C.dark }}>$200–500</div>
                </div>
                <div style={{ flex: 1, background: C.white, borderRadius: 10, padding: "10px 12px", border: `1px solid ${C.grayLight}`, textAlign: "center" }}>
                  <div style={{ ...dm, fontSize: 11, color: C.gray }}>Timing</div>
                  <div style={{ ...dm, fontSize: 16, fontWeight: 700, color: C.dark }}>This week</div>
                </div>
                <div style={{ flex: 1, background: C.white, borderRadius: 10, padding: "10px 12px", border: `1px solid ${C.grayLight}`, textAlign: "center" }}>
                  <div style={{ ...dm, fontSize: 11, color: C.gray }}>Confidence</div>
                  <div style={{ ...dm, fontSize: 16, fontWeight: 700, color: C.green }}>88%</div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button style={{ ...dm, flex: 1, padding: "12px 0", fontSize: 15, fontWeight: 600, color: C.white, background: C.orange, border: "none", borderRadius: 10, cursor: "pointer" }}>Send quote</button>
                <button style={{ ...dm, flex: 1, padding: "12px 0", fontSize: 15, fontWeight: 600, color: C.darkMid, background: C.white, border: `1px solid ${C.grayLight}`, borderRadius: 10, cursor: "pointer" }}>Pass</button>
              </div>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ── STATS BAR ── */}
      <section style={{ background: C.dark, padding: "56px 24px" }}>
        <div style={{ maxWidth: 900, margin: "0 auto", display: "flex", justifyContent: "center", gap: 64, flexWrap: "wrap" }}>
          {[
            { stat: "$0", label: "to join and list your business" },
            { stat: "$0", label: "per lead, per month, ever" },
            { stat: "88%", label: "average diagnostic confidence" },
            { stat: "<3 min", label: "from request to your phone" },
          ].map((s, i) => (
            <FadeIn key={i} delay={i * 0.1}>
              <div style={{ textAlign: "center" }}>
                <div style={{ ...fr, fontSize: 36, fontWeight: 700, color: C.orange }}>{s.stat}</div>
                <div style={{ ...dm, fontSize: 13, color: C.gray, marginTop: 4 }}>{s.label}</div>
              </div>
            </FadeIn>
          ))}
        </div>
      </section>

      {/* ── CTA ── */}
      <section style={{ background: `linear-gradient(165deg, ${C.white} 0%, ${C.warm} 100%)`, padding: "80px 24px" }}>
        <div style={{ maxWidth: 600, margin: "0 auto", textAlign: "center" }}>
          <FadeIn>
            <h2 style={{ ...fr, fontSize: "clamp(28px, 4vw, 44px)", fontWeight: 700, color: C.dark, margin: "0 0 16px", lineHeight: 1.1 }}>Good looking out, Homie</h2>
            <p style={{ ...dm, fontSize: 17, color: C.darkMid, lineHeight: 1.6, margin: "0 0 32px" }}>Join the network. Get leads that actually make sense. And never pay for the privilege of doing good work.</p>
            <button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} style={{ ...dm, fontSize: 17, fontWeight: 600, color: C.white, background: C.orange, border: "none", borderRadius: 100, padding: "16px 40px", cursor: "pointer", transition: "all 0.2s", boxShadow: "0 4px 24px rgba(232,99,43,0.25)" }} onMouseEnter={e => { (e.target as HTMLElement).style.background = C.orangeDark; (e.target as HTMLElement).style.transform = "translateY(-2px)"; }} onMouseLeave={e => { (e.target as HTMLElement).style.background = C.orange; (e.target as HTMLElement).style.transform = "translateY(0)"; }}>Join Homie Pro — it's free</button>
            <p style={{ ...dm, fontSize: 13, color: C.gray, marginTop: 14 }}>No credit card. No contracts. No catch.</p>
          </FadeIn>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{ background: C.dark, padding: "40px 24px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span style={{ ...fr, fontWeight: 700, fontSize: 22, color: C.orange }}>homie</span>
            <span style={{ ...dm, fontSize: 12, color: C.gray }}>pro</span>
          </div>
          <span style={{ ...dm, fontSize: 13, color: C.gray }}>© 2026 Homie. Your home's best friend.</span>
        </div>
      </footer>
    </div>
  );
}
