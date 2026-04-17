import { useState, useEffect, useRef, type ReactNode, type CSSProperties } from "react";
import { useAuth } from "@/contexts/AuthContext";
import SEO from '@/components/SEO';

const C = {
  orange: "#E8632B", orangeDark: "#C8531E", orangeLight: "#F0997B",
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

interface ReportItem {
  id: number; title: string; category: string; severity: string; cost: string; icon: string;
}
interface QuoteInfo {
  provider: string; rating: number; price: string; time: string;
}

// Static data outside component to avoid closure/re-render issues
const DEMO_REPORT_ITEMS: ReportItem[] = [
  { id: 1, title: "Missing GFCI outlets in bathrooms", category: "Electrical", severity: "urgent", cost: "$150\u2013$280", icon: "\u26A1" },
  { id: 2, title: "Water heater approaching end of life", category: "Plumbing", severity: "recommended", cost: "$1,200\u2013$1,800", icon: "\uD83D\uDD25" },
  { id: 3, title: "Roof flashing lifted near chimney", category: "Roofing", severity: "urgent", cost: "$300\u2013$600", icon: "\uD83C\uDFE0" },
  { id: 4, title: "Slow drain in master bathroom", category: "Plumbing", severity: "recommended", cost: "$125\u2013$250", icon: "\uD83D\uDCA7" },
  { id: 5, title: "HVAC filter heavily soiled", category: "HVAC", severity: "recommended", cost: "$65\u2013$120", icon: "\u2744\uFE0F" },
  { id: 6, title: "Cracked caulking around tub surround", category: "General", severity: "monitor", cost: "$80\u2013$150", icon: "\uD83D\uDD27" },
];

const DEMO_QUOTE_DATA: Record<number, QuoteInfo> = {
  1: { provider: "Coastal Electric", rating: 4.8, price: "$195", time: "Wednesday AM" },
  3: { provider: "SD Roofing Pros", rating: 4.7, price: "$425", time: "Friday PM" },
  4: { provider: "Rodriguez Plumbing", rating: 4.9, price: "$175", time: "Tomorrow 9\u201311 AM" },
};

function InspectionDemo() {
  const [step, setStep] = useState(0);
  const [items, setItems] = useState<ReportItem[]>([]);
  const [dispatching, setDispatching] = useState<number | null>(null);
  const [quotes, setQuotes] = useState<Record<number, QuoteInfo>>({});
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (initialTimerRef.current) clearTimeout(initialTimerRef.current);
    };
  }, []);

  const parseReport = () => {
    setStep(1);
    setItems([]);
    let i = 0;
    const addNext = () => {
      if (i >= DEMO_REPORT_ITEMS.length) { setStep(2); return; }
      const item = DEMO_REPORT_ITEMS[i];
      setItems(prev => [...prev, item]);
      i++;
      timerRef.current = setTimeout(addNext, 400);
    };
    initialTimerRef.current = setTimeout(addNext, 600);
  };

  const getQuote = (id: number) => {
    setDispatching(id);
    setTimeout(() => {
      setDispatching(null);
      const q = DEMO_QUOTE_DATA[id];
      if (q) setQuotes(prev => ({ ...prev, [id]: q }));
    }, 2000);
  };

  const reset = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (initialTimerRef.current) clearTimeout(initialTimerRef.current);
    setStep(0); setItems([]); setDispatching(null); setQuotes({});
  };

  const sevColor = (s: string) => s === "urgent" ? "#E24B4A" : s === "recommended" ? "#EF9F27" : C.gray;
  const sevBg = (s: string) => s === "urgent" ? "#FCEBEB" : s === "recommended" ? "#FAEEDA" : C.warm;

  return (
    <section style={{ background: C.white, padding: "96px 24px" }}>
      {/* Keyframes at section level so they persist across step changes */}
      <style>{`
        @keyframes fadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
      `}</style>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <FadeIn>
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <span style={{ ...dm, fontSize: 13, fontWeight: 600, color: C.green, letterSpacing: 1, textTransform: "uppercase" }}>See it in action</span>
            <h2 style={{ ...fr, fontSize: "clamp(28px, 3.5vw, 42px)", fontWeight: 700, color: C.dark, margin: "12px 0 8px" }}>From inspection report to real quotes</h2>
            <p style={{ ...dm, fontSize: 16, color: C.gray }}>Click through the demo below</p>
          </div>
        </FadeIn>
        <FadeIn delay={0.15}>
          <div style={{ maxWidth: 520, margin: "0 auto" }}>
            {step === 0 && (
              <div style={{ background: C.warm, borderRadius: 24, padding: "48px 32px", textAlign: "center" }}>
                <div style={{ width: 72, height: 72, borderRadius: 16, background: C.white, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px", fontSize: 32 }}>
                  {"\uD83D\uDCCB"}
                </div>
                <h3 style={{ ...fr, fontSize: 22, fontWeight: 700, color: C.dark, margin: "0 0 8px" }}>Upload inspection report</h3>
                <p style={{ ...dm, fontSize: 14, color: C.gray, margin: "0 0 24px" }}>Homie's AI reads the report and extracts every actionable item</p>
                <button onClick={parseReport} style={{ ...dm, fontSize: 16, fontWeight: 600, color: C.white, background: C.orange, border: "none", borderRadius: 100, padding: "14px 36px", cursor: "pointer", transition: "all 0.2s" }} onMouseEnter={e => e.currentTarget.style.background = C.orangeDark} onMouseLeave={e => e.currentTarget.style.background = C.orange}>Parse sample report</button>
              </div>
            )}

            {step >= 1 && (
              <div style={{ background: C.white, borderRadius: 24, border: `1px solid ${C.grayLight}`, overflow: "hidden", boxShadow: "0 8px 40px rgba(0,0,0,0.06)" }}>
                <div style={{ background: C.warm, padding: "16px 24px", borderBottom: `1px solid ${C.grayLight}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ ...fr, fontWeight: 700, fontSize: 18, color: C.orange }}>homie</span>
                    <span style={{ ...dm, fontSize: 11, color: C.gray }}>inspection report</span>
                  </div>
                  <span style={{ ...dm, fontSize: 12, color: C.gray }}>{items.length} items found</span>
                </div>
                <div style={{ padding: "16px 20px" }}>
                  {step === 1 && items.length < DEMO_REPORT_ITEMS.length && (
                    <div style={{ textAlign: "center", padding: 12, ...dm, fontSize: 13, color: C.orange, fontWeight: 500 }}>
                      <span style={{ animation: "pulse 1.5s ease-in-out infinite", display: "inline-block" }}>Parsing inspection report...</span>
                    </div>
                  )}
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {items.map((item, i) => (
                      <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 12, border: `1px solid ${C.grayLight}`, background: quotes[item.id] ? C.greenLight : C.white, animation: "fadeUp 0.3s ease", transition: "background 0.3s" }}>
                        <span style={{ fontSize: 20, flexShrink: 0 }}>{item.icon}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ ...dm, fontSize: 13, fontWeight: 600, color: C.dark }}>{item.title}</div>
                          <div style={{ display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
                            <span style={{ ...dm, fontSize: 10, fontWeight: 600, color: sevColor(item.severity), background: sevBg(item.severity), padding: "2px 8px", borderRadius: 100 }}>{item.severity}</span>
                            <span style={{ ...dm, fontSize: 10, color: C.gray, background: C.warm, padding: "2px 8px", borderRadius: 100 }}>{item.category}</span>
                            <span style={{ ...dm, fontSize: 10, fontWeight: 600, color: C.dark, background: C.warm, padding: "2px 8px", borderRadius: 100 }}>{item.cost}</span>
                          </div>
                          {quotes[item.id] && (
                            <div style={{ marginTop: 6, padding: "6px 10px", background: C.white, borderRadius: 8, border: `1px solid #9FE1CB` }}>
                              <div style={{ ...dm, fontSize: 11, color: "#085041" }}>
                                <span style={{ fontWeight: 600 }}>{quotes[item.id].provider}</span> \u2022 {"\u2B50"} {quotes[item.id].rating} \u2022 <span style={{ fontWeight: 700 }}>{quotes[item.id].price}</span> \u2022 {quotes[item.id].time}
                              </div>
                            </div>
                          )}
                        </div>
                        {step === 2 && !quotes[item.id] && (
                          <button onClick={() => getQuote(item.id)} disabled={dispatching !== null} style={{ ...dm, fontSize: 11, fontWeight: 600, color: dispatching === item.id ? C.gray : C.orange, background: dispatching === item.id ? C.warm : "transparent", border: dispatching === item.id ? "none" : `1px solid ${C.orange}`, borderRadius: 100, padding: "6px 14px", cursor: dispatching !== null ? "not-allowed" : "pointer", whiteSpace: "nowrap", flexShrink: 0, transition: "all 0.2s" }}>
                            {dispatching === item.id ? "Finding..." : "Get quote"}
                          </button>
                        )}
                        {quotes[item.id] && (
                          <span style={{ ...dm, fontSize: 11, color: C.green, fontWeight: 600, flexShrink: 0 }}>{"\u2713"} Quoted</span>
                        )}
                      </div>
                    ))}
                  </div>
                  {step === 2 && Object.keys(quotes).length > 0 && (
                    <div style={{ marginTop: 16, padding: "14px 16px", background: C.warm, borderRadius: 12, textAlign: "center" }}>
                      <div style={{ ...dm, fontSize: 13, color: C.gray }}>Quotes received so far</div>
                      <div style={{ ...fr, fontSize: 28, fontWeight: 700, color: C.dark, marginTop: 4 }}>
                        ${Object.values(quotes).reduce((sum, q) => sum + parseInt(q.price.replace("$", "").replace(",", "")), 0).toLocaleString()}
                      </div>
                      <div style={{ ...dm, fontSize: 12, color: C.green, fontWeight: 500, marginTop: 4 }}>Use this number in your negotiation</div>
                    </div>
                  )}
                  {step === 2 && (
                    <div style={{ textAlign: "center", marginTop: 12 }}>
                      <button onClick={reset} style={{ ...dm, fontSize: 12, color: C.orange, background: "transparent", border: "none", cursor: "pointer", textDecoration: "underline" }}>Restart demo</button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </FadeIn>
      </div>
    </section>
  );
}

export default function HomieInspectionLanding() {
  const { homeowner } = useAuth();
  const [audience, setAudience] = useState("buyer");
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Page-wide drag-and-drop: when the user drags a file over the page, show a
  // full-screen drop overlay. Drop anywhere triggers the upload. Doesn't affect
  // mobile / non-drag users — the existing CTA button still works as before.
  useEffect(() => {
    let dragCounter = 0; // robustness vs. dragenter/leave firing on children

    function isFileDrag(e: DragEvent): boolean {
      const types = e.dataTransfer?.types;
      if (!types) return false;
      return Array.from(types).includes('Files');
    }

    function onDragEnter(e: DragEvent) {
      if (!isFileDrag(e)) return;
      e.preventDefault();
      dragCounter++;
      if (dragCounter === 1) setDragActive(true);
    }
    function onDragOver(e: DragEvent) {
      if (!isFileDrag(e)) return;
      e.preventDefault();
    }
    function onDragLeave(e: DragEvent) {
      if (!isFileDrag(e)) return;
      e.preventDefault();
      dragCounter--;
      if (dragCounter <= 0) {
        dragCounter = 0;
        setDragActive(false);
      }
    }
    function onDrop(e: DragEvent) {
      if (!isFileDrag(e)) return;
      e.preventDefault();
      dragCounter = 0;
      setDragActive(false);
      const file = e.dataTransfer?.files[0];
      if (file) void handleFileUpload(file);
    }

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

  async function handleFileUpload(file: File) {
    if (file.size > 50 * 1024 * 1024) { alert('File too large (max 50MB)'); return; }
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
      const res = await inspectService.uploadReport({ report_file_data_url: dataUrl });
      if (!res.data) { setUploadStatus(null); setUploading(false); alert('Upload failed'); return; }

      // Poll for parsing completion
      const reportId = res.data.reportId;
      const token = res.data.token;
      setUploadStatus('Parsing inspection items...');

      const poll = async () => {
        for (let i = 0; i < 60; i++) { // max 5 minutes
          await new Promise(r => setTimeout(r, 5000));
          try {
            const status = await inspectService.getUploadStatus(reportId);
            if (status.data?.parsingStatus === 'parsed' || status.data?.parsingStatus === 'review_pending') {
              setUploadStatus(`${status.data.itemsParsed} items found! Redirecting...`);
              // Logged-in homeowners land in the new portal (auto-linked via optionalAuth on
              // the upload endpoint). Anonymous users get the legacy public token-based view
              // since they don't have an account to authenticate against the portal.
              const destination = homeowner
                ? `/inspect-portal?tab=reports&report=${reportId}`
                : `/inspect/${token}`;
              setTimeout(() => { window.location.href = destination; }, 1500);
              return;
            }
            if (status.data?.parsingStatus === 'failed') {
              setUploadStatus(null); setUploading(false);
              alert(status.data.parsingError || 'Failed to parse report');
              return;
            }
            if (status.data?.itemsParsed && status.data.itemsParsed > 0) {
              setUploadStatus(`Found ${status.data.itemsParsed} items so far...`);
            }
          } catch { /* keep polling */ }
        }
        setUploadStatus(null); setUploading(false);
        alert('Parsing is taking longer than expected. Check back shortly.');
      };
      void poll();
    } catch (err) {
      setUploadStatus(null); setUploading(false);
      alert((err as Error).message || 'Upload failed');
    }
  }

  return (
    <div style={{ ...dm, background: C.white, minHeight: "100vh" }}>
      {/* Hidden file input for upload */}
      <input
        id="inspect-file-upload"
        ref={fileInputRef}
        type="file"
        accept=".pdf,.html"
        style={{ position: 'fixed', top: -9999, left: -9999, opacity: 0 }}
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFileUpload(f); e.target.value = ''; }}
      />

      {/* Drag-active overlay — appears when user drags a file over the page */}
      {dragActive && !uploading && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 10000,
          background: 'rgba(20, 18, 16, 0.85)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          pointerEvents: 'none',
        }}>
          <div style={{
            background: C.white, border: `3px dashed ${C.orange}`, borderRadius: 24,
            padding: '60px 80px', textAlign: 'center', maxWidth: 520,
            boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
          }}>
            <div style={{ fontSize: 56, marginBottom: 16 }}>📥</div>
            <div style={{ ...fr, fontSize: 28, fontWeight: 700, color: C.dark, marginBottom: 8 }}>
              Drop your inspection report
            </div>
            <div style={{ ...dm, fontSize: 15, color: C.gray }}>
              PDF or HTML, up to 50 MB. We'll parse it instantly.
            </div>
          </div>
        </div>
      )}

      {/* Upload progress overlay */}
      {uploading && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(45,41,38,0.7)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: C.white, borderRadius: 20, padding: '48px 56px', textAlign: 'center', maxWidth: 420 }}>
            <div style={{ width: 48, height: 48, border: `4px solid ${C.warm}`, borderTopColor: C.orange, borderRadius: '50%', margin: '0 auto 24px', animation: 'homie-spin 0.8s linear infinite' }} />
            <p style={{ ...dm, fontSize: 18, fontWeight: 600, color: C.dark, margin: '0 0 8px' }}>{uploadStatus ?? 'Processing...'}</p>
            <p style={{ ...dm, fontSize: 14, color: C.gray, margin: 0 }}>This can take a few minutes depending on the size of your report. You can leave this page open.</p>
          </div>
          <style>{`@keyframes homie-spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}
      <SEO title="Homie Inspect — Real quotes from your inspection report" description="Upload your home inspection report. Homie's AI parses every item and gets you real quotes from local pros — not estimates, actuals. Negotiate with real numbers." canonical="/inspect" />
      <link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@0,400;0,700;1,400&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />

      {/* NAV */}
      <nav style={{ padding: "0 24px", borderBottom: `1px solid ${C.warm}` }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", height: 64 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span style={{ ...fr, fontWeight: 700, fontSize: 26, color: C.orange }}>homie</span>
            <span style={{ ...dm, fontSize: 13, color: C.gray, fontWeight: 500 }}>inspect</span>
          </div>
          <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
            <a href="#how-it-works" style={{ ...dm, fontSize: 14, color: C.darkMid, textDecoration: "none", fontWeight: 500 }}>How it works</a>
            <a href="/inspect/inspectors" style={{ ...dm, fontSize: 14, color: C.darkMid, textDecoration: "none", fontWeight: 500 }}>For inspectors</a>
            <label htmlFor="inspect-file-upload" style={{ ...dm, fontSize: 14, fontWeight: 600, color: C.white, background: C.orange, border: "none", borderRadius: 100, padding: "9px 22px", cursor: "pointer", display: "inline-block" }}>Get started</label>
          </div>
        </div>
      </nav>

      {/* HERO */}
      <section style={{ background: `linear-gradient(165deg, ${C.warm} 0%, ${C.white} 50%, ${C.greenLight} 100%)`, paddingTop: 100, paddingBottom: 80, position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: -200, right: -200, width: 600, height: 600, borderRadius: "50%", background: C.orange, opacity: 0.03 }} />
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 24px", position: "relative", zIndex: 1 }}>
          <FadeIn>
            <div style={{ display: "inline-flex", background: C.white, border: `1px solid ${C.grayLight}`, borderRadius: 100, padding: 4, marginBottom: 24 }}>
              <button onClick={() => setAudience("buyer")} style={{ ...dm, fontSize: 13, fontWeight: 600, color: audience === "buyer" ? C.white : C.gray, background: audience === "buyer" ? C.dark : "transparent", border: "none", borderRadius: 100, padding: "6px 18px", cursor: "pointer", transition: "all 0.2s" }}>Buying a home</button>
              <button onClick={() => setAudience("seller")} style={{ ...dm, fontSize: 13, fontWeight: 600, color: audience === "seller" ? C.white : C.gray, background: audience === "seller" ? C.dark : "transparent", border: "none", borderRadius: 100, padding: "6px 18px", cursor: "pointer", transition: "all 0.2s" }}>Selling a home</button>
            </div>
          </FadeIn>
          <FadeIn delay={0.1}>
            <h1 style={{ ...fr, fontSize: "clamp(36px, 5vw, 64px)", fontWeight: 700, color: C.dark, lineHeight: 1.08, maxWidth: 700, margin: 0 }}>
              {audience === "buyer"
                ? <>Know what it costs<br />to fix <span style={{ color: C.orange }}>before you close</span></>
                : <>Fix it before<br />they <span style={{ color: C.orange }}>find it</span></>
              }
            </h1>
          </FadeIn>
          <FadeIn delay={0.2}>
            <p style={{ ...dm, fontSize: "clamp(17px, 1.8vw, 21px)", color: C.darkMid, lineHeight: 1.6, maxWidth: 560, margin: "24px 0 36px" }}>
              {audience === "buyer"
                ? "Your inspector finds the problems. Homie tells you exactly what they'll cost to fix \u2014 with real quotes from local pros, not guesswork. Negotiate with real numbers."
                : "Get a pre-listing inspection, then let Homie quote every item and fix what matters before buyers see it. List with confidence and documentation that builds trust."
              }
            </p>
          </FadeIn>
          <FadeIn delay={0.3}>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
              <label htmlFor="inspect-file-upload" style={{ ...dm, fontSize: 17, fontWeight: 600, color: C.white, background: C.orange, border: "none", borderRadius: 100, padding: "16px 36px", cursor: "pointer", transition: "all 0.2s", boxShadow: "0 4px 24px rgba(232,99,43,0.25)", display: "inline-block" }} onMouseEnter={e => { e.currentTarget.style.background = C.orangeDark; e.currentTarget.style.transform = "translateY(-2px)"; }} onMouseLeave={e => { e.currentTarget.style.background = C.orange; e.currentTarget.style.transform = "translateY(0)"; }}>
                {audience === "buyer" ? "Upload your inspection report" : "Get your pre-listing quotes"}
              </label>
              <button style={{ ...dm, fontSize: 17, fontWeight: 600, color: C.dark, background: "transparent", border: `2px solid ${C.grayLight}`, borderRadius: 100, padding: "14px 32px", cursor: "pointer", transition: "all 0.2s" }} onMouseEnter={e => e.currentTarget.style.borderColor = C.orange} onMouseLeave={e => e.currentTarget.style.borderColor = C.grayLight}>
                {audience === "buyer" ? "Find a Homie inspector" : "How it works"}
              </button>
            </div>
            <div style={{ ...dm, fontSize: 13, color: C.gray, marginTop: 12, display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 14 }}>📄</span>
              <span>or drag a PDF anywhere on this page · free AI parse (a few minutes for larger reports), no signup needed</span>
            </div>
          </FadeIn>
          <FadeIn delay={0.45}>
            <div style={{ display: "flex", gap: 40, marginTop: 56, flexWrap: "wrap" }}>
              {(audience === "buyer"
                ? [["$8,400", "average negotiation credit with Homie quotes"], ["2 hours", "from report to real quotes"], ["11 items", "parsed from the average inspection"]]
                : [["23%", "faster sale with pre-addressed items"], ["$0", "surprises for your buyer"], ["100%", "documented repairs for the listing"]]
              ).map(([stat, label], i) => (
                <div key={`${audience}-${i}`} style={{ display: "flex", flexDirection: "column" }}>
                  <span style={{ ...fr, fontSize: 32, fontWeight: 700, color: C.orange }}>{stat}</span>
                  <span style={{ ...dm, fontSize: 14, color: C.gray, fontWeight: 500 }}>{label}</span>
                </div>
              ))}
            </div>
          </FadeIn>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how-it-works" style={{ background: C.warm, padding: "96px 24px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <FadeIn>
            <div style={{ textAlign: "center", marginBottom: 56 }}>
              <span style={{ ...dm, fontSize: 13, fontWeight: 600, color: C.orange, letterSpacing: 1, textTransform: "uppercase" }}>How it works</span>
              <h2 style={{ ...fr, fontSize: "clamp(28px, 3.5vw, 42px)", fontWeight: 700, color: C.dark, margin: "12px 0 0" }}>Three steps to real numbers</h2>
            </div>
          </FadeIn>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 24 }}>
            {[
              { num: "1", title: "Your inspector uploads the report", desc: "After the inspection, your Homie-partnered inspector uploads their report. Any format works \u2014 Spectora, HomeGauge, PDF, or photos.", color: C.orange },
              { num: "2", title: "Homie parses every item", desc: "The AI reads the full report and extracts every actionable item. Each gets categorized by trade, rated by urgency, and estimated with a cost range based on local market data.", color: C.green },
              { num: "3", title: "You get real quotes", desc: "Tap any item to dispatch Homie\u2019s AI agent, which calls, texts, and contacts local pros on your behalf. Real quotes from real providers arrive in minutes \u2014 not estimates, actuals.", color: C.orange },
            ].map((s, i) => (
              <FadeIn key={i} delay={i * 0.1}>
                <div style={{ background: C.white, borderRadius: 20, padding: 32, height: "100%", borderTop: `3px solid ${s.color}` }}>
                  <div style={{ width: 40, height: 40, borderRadius: "50%", background: s.color, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16, ...dm, fontSize: 18, fontWeight: 700, color: C.white }}>{s.num}</div>
                  <h3 style={{ ...fr, fontSize: 22, fontWeight: 700, color: C.dark, margin: "0 0 10px" }}>{s.title}</h3>
                  <p style={{ ...dm, fontSize: 15, color: C.darkMid, lineHeight: 1.6, margin: 0 }}>{s.desc}</p>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* INTERACTIVE DEMO */}
      <InspectionDemo />

      {/* VALUE PROPS - BUYER vs SELLER */}
      <section style={{ background: C.warm, padding: "96px 24px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <FadeIn>
            <div style={{ textAlign: "center", marginBottom: 56 }}>
              <h2 style={{ ...fr, fontSize: "clamp(28px, 3.5vw, 42px)", fontWeight: 700, color: C.dark, margin: "0 0 8px" }}>
                {audience === "buyer" ? "Negotiate with confidence" : "List with confidence"}
              </h2>
              <p style={{ ...dm, fontSize: 16, color: C.gray }}>
                {audience === "buyer" ? "Stop guessing what repairs will cost" : "Address issues before buyers find them"}
              </p>
            </div>
          </FadeIn>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 24 }}>
            {(audience === "buyer" ? [
              { title: "Real quotes, not estimates", desc: "Your inspector says \u201Croof flashing needs repair.\u201D Great \u2014 but what does that cost? $200? $2,000? Homie gets you actual quotes from local roofers so you negotiate with real numbers, not hopes.", color: C.orange },
              { title: "Every item, one dashboard", desc: "11 inspection items across 6 trades. Instead of calling 6 different contractors yourself, Homie dispatches all of them simultaneously. Your punch list becomes a quote list in hours.", color: C.green },
              { title: "Leverage in negotiation", desc: "\u201CThe inspection found $8,400 in needed repairs \u2014 here are the quotes.\u201D That specificity changes the conversation. Sellers take documented numbers seriously because they can\u2019t argue with invoices.", color: C.orange },
              { title: "Know before you close", desc: "Discover the true cost of ownership before you sign. Some inspection items are $150 fixes. Some are $5,000 replacements. Knowing the difference before closing protects your investment.", color: C.green },
            ] : [
              { title: "Fix before they find it", desc: "A pre-listing inspection with Homie quotes means you can fix the $200 issues that would scare buyers and disclose the rest with full documentation. No surprises, no renegotiations.", color: C.orange },
              { title: "Homie-verified listing", desc: "Include a \u201CHomie Inspection Report\u201D in your listing packet showing every item found, what was fixed (with receipts), and what was disclosed. Buyers trust documented transparency.", color: C.green },
              { title: "Faster close", desc: "Properties with pre-addressed inspection items sell faster because the buyer\u2019s inspection triggers fewer surprises. Fewer surprises means fewer renegotiations and fewer deals falling through.", color: C.orange },
              { title: "Competitive quotes", desc: "When you need to fix something before listing, Homie gets you multiple quotes in minutes instead of you calling around for a week. Time matters when you\u2019re preparing to list.", color: C.green },
            ]).map((f, i) => (
              <FadeIn key={`${audience}-${i}`} delay={i * 0.08}>
                <div style={{ background: C.white, borderRadius: 20, padding: 32, height: "100%", borderTop: `3px solid ${f.color}`, transition: "transform 0.2s, box-shadow 0.2s" }} onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-4px)"; e.currentTarget.style.boxShadow = "0 12px 40px rgba(0,0,0,0.06)"; }} onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "none"; }}>
                  <h3 style={{ ...fr, fontSize: 20, fontWeight: 700, color: C.dark, margin: "0 0 10px" }}>{f.title}</h3>
                  <p style={{ ...dm, fontSize: 14, color: C.darkMid, lineHeight: 1.65, margin: 0 }}>{f.desc}</p>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section style={{ background: C.white, padding: "96px 24px" }}>
        <div style={{ maxWidth: 800, margin: "0 auto" }}>
          <FadeIn>
            <div style={{ textAlign: "center", marginBottom: 48 }}>
              <span style={{ ...dm, fontSize: 13, fontWeight: 600, color: C.orange, letterSpacing: 1, textTransform: "uppercase" }}>Pricing</span>
              <h2 style={{ ...fr, fontSize: "clamp(28px, 3.5vw, 42px)", fontWeight: 700, color: C.dark, margin: "12px 0 8px" }}>Less than your inspector charges for the inspection</h2>
              <p style={{ ...dm, fontSize: 16, color: C.gray }}>And it could save you thousands in negotiation</p>
            </div>
          </FadeIn>
          <FadeIn delay={0.1}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 20 }}>
              {[
                {
                  name: "Essential",
                  tagline: "Understand what's in your report",
                  price: 99,
                  features: ["AI report analysis", "Item details & severity", "Cost estimates", "Category breakdown"],
                  popular: false,
                },
                {
                  name: "Professional",
                  tagline: "Get real quotes from local pros",
                  price: 199,
                  features: ["Everything in Essential", "Dispatch to providers", "Quote comparison", "Real-time quote tracking"],
                  popular: true,
                },
                {
                  name: "Premium",
                  tagline: "Negotiate and plan with confidence",
                  price: 299,
                  features: ["Everything in Professional", "Negotiation documents", "Priority dispatch", "Maintenance timeline"],
                  popular: false,
                },
              ].map(tier => (
                <div key={tier.name} style={{
                  background: tier.popular ? C.white : C.warm, borderRadius: 24, padding: 28,
                  border: tier.popular ? `2px solid ${C.orange}` : `1px solid ${C.grayLight}`,
                  position: "relative",
                }}>
                  {tier.popular && (
                    <div style={{ position: "absolute", top: -14, left: "50%", transform: "translateX(-50%)", background: C.orange, color: C.white, ...dm, fontSize: 12, fontWeight: 700, padding: "5px 16px", borderRadius: 100 }}>
                      Most popular
                    </div>
                  )}
                  <h3 style={{ ...fr, fontSize: 22, fontWeight: 700, color: C.dark, margin: "0 0 4px" }}>{tier.name}</h3>
                  <p style={{ ...dm, fontSize: 13, color: C.gray, margin: "0 0 18px", minHeight: 20 }}>{tier.tagline}</p>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 18 }}>
                    <span style={{ ...fr, fontSize: 40, fontWeight: 700, color: C.dark }}>${tier.price}</span>
                    <span style={{ ...dm, fontSize: 14, color: C.gray }}>/report</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {tier.features.map(f => (
                      <div key={f} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ color: C.green, fontSize: 12, fontWeight: 700 }}>{"\u2713"}</span>
                        <span style={{ ...dm, fontSize: 13, color: C.darkMid }}>{f}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <p style={{ ...dm, fontSize: 13, color: C.gray, textAlign: "center", marginTop: 28 }}>
              One-time per report. Free to upload and parse {"\u2014"} pay only when you're ready to unlock quotes.
            </p>
          </FadeIn>
        </div>
      </section>

      {/* TESTIMONIAL */}
      <section style={{ background: C.dark, padding: "80px 24px" }}>
        <div style={{ maxWidth: 700, margin: "0 auto", textAlign: "center" }}>
          <FadeIn>
            <p style={{ ...fr, fontSize: "clamp(22px, 2.5vw, 32px)", fontWeight: 400, color: C.white, lineHeight: 1.55, margin: "0 0 28px", fontStyle: "italic" }}>
              "Our inspection found 14 items. I uploaded the report to Homie and had quotes for everything by dinner. We negotiated an $11,200 credit with actual invoices attached. Our agent said she'd never seen a buyer come to the table that prepared."
            </p>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12 }}>
              <div style={{ width: 44, height: 44, borderRadius: "50%", background: C.orange, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ ...dm, fontSize: 16, fontWeight: 700, color: C.white }}>DT</span>
              </div>
              <div style={{ textAlign: "left" }}>
                <div style={{ ...dm, fontSize: 14, fontWeight: 600, color: C.white }}>David T.</div>
                <div style={{ ...dm, fontSize: 12, color: C.gray }}>First-time buyer, San Diego</div>
              </div>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* INSPECTOR CTA BANNER (links to dedicated page) */}
      <section style={{ background: `linear-gradient(165deg, ${C.white} 0%, ${C.warm} 100%)`, padding: "64px 24px" }}>
        <div style={{ maxWidth: 700, margin: "0 auto", textAlign: "center" }}>
          <FadeIn>
            <div style={{ display: "inline-block", background: C.greenLight, borderRadius: 100, padding: "6px 14px", marginBottom: 16 }}>
              <span style={{ ...dm, fontSize: 13, fontWeight: 600, color: C.green }}>Inspector partner program</span>
            </div>
            <h2 style={{ ...fr, fontSize: "clamp(24px, 3vw, 36px)", fontWeight: 700, color: C.dark, margin: "0 0 12px" }}>Are you a home inspector?</h2>
            <p style={{ ...dm, fontSize: 16, color: C.darkMid, lineHeight: 1.6, margin: "0 0 24px" }}>Earn referral revenue on every dispatch. Free to join, always.</p>
            <a href="/inspect/inspectors" style={{ ...dm, fontSize: 17, fontWeight: 600, color: C.white, background: C.green, border: "none", borderRadius: 100, padding: "16px 36px", cursor: "pointer", textDecoration: "none", display: "inline-block", boxShadow: "0 4px 24px rgba(27,158,119,0.25)" }}>Learn about the partner program →</a>
          </FadeIn>
        </div>
      </section>

      {/* CTA */}
      <section style={{ background: C.warm, padding: "96px 24px" }}>
        <div style={{ maxWidth: 600, margin: "0 auto", textAlign: "center" }}>
          <FadeIn>
            <h2 style={{ ...fr, fontSize: "clamp(28px, 4vw, 44px)", fontWeight: 700, color: C.dark, margin: "0 0 16px", lineHeight: 1.1 }}>Stop guessing.<br />Start negotiating.</h2>
            <p style={{ ...dm, fontSize: 17, color: C.darkMid, lineHeight: 1.6, margin: "0 0 32px" }}>Upload your inspection report and get real quotes from local pros for every item \u2014 in hours, not weeks.</p>
            <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
              <button style={{ ...dm, fontSize: 17, fontWeight: 600, color: C.white, background: C.orange, border: "none", borderRadius: 100, padding: "16px 36px", cursor: "pointer", transition: "all 0.2s", boxShadow: "0 4px 24px rgba(232,99,43,0.25)" }} onMouseEnter={e => { e.currentTarget.style.background = C.orangeDark; e.currentTarget.style.transform = "translateY(-2px)"; }} onMouseLeave={e => { e.currentTarget.style.background = C.orange; e.currentTarget.style.transform = "translateY(0)"; }}>Upload your report</button>
              <a href="/inspect/inspectors" style={{ ...dm, fontSize: 17, fontWeight: 600, color: C.green, background: "transparent", border: `2px solid ${C.green}`, borderRadius: 100, padding: "14px 32px", cursor: "pointer", transition: "all 0.2s", textDecoration: "none", display: "inline-block" }}>I'm an inspector</a>
            </div>
            <p style={{ ...dm, fontSize: 13, color: C.gray, marginTop: 16 }}>No account required to upload. Inspector partnership is free forever.</p>
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
