import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

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
    const timers = OUTREACH_STEPS.map((s, i) =>
      setTimeout(() => setStep(i), s.time)
    );
    const resultTimers = DEMO_PROVIDERS.map((p) =>
      setTimeout(() => setResults(prev => [...prev, p]), p.delay)
    );
    return () => { timers.forEach(clearTimeout); resultTimers.forEach(clearTimeout); };
  }, [running]);

  const current = OUTREACH_STEPS[step] || OUTREACH_STEPS[0];
  const pct = (current.contacted / Math.max(current.providers, 1)) * 100;

  return (
    <div ref={ref} style={{ background: DARK, borderRadius: 20, overflow: 'hidden', maxWidth: 540, width: '100%', boxShadow: '0 24px 80px rgba(0,0,0,0.25)' }}>
      <div style={{ padding: '14px 20px', background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#FF5F57' }} />
        <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#FEBC2E' }} />
        <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#28C840' }} />
        <span style={{ marginLeft: 12, color: 'rgba(255,255,255,0.4)', fontSize: 13, fontFamily: "'DM Mono', monospace" }}>homie-agent</span>
      </div>

      <div style={{ padding: '24px 24px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          {running && step < OUTREACH_STEPS.length - 1 ? (
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: ORANGE, animation: 'pulse 1.2s infinite' }} />
          ) : results.length === 3 ? (
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: GREEN }} />
          ) : (
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: 'rgba(255,255,255,0.2)' }} />
          )}
          <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14, fontFamily: "'DM Sans', sans-serif" }}>
            {running ? current.text : 'Ready to find providers...'}
          </span>
        </div>

        {running && (
          <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 6, height: 6, marginBottom: 20, overflow: 'hidden' }}>
            <div style={{ height: '100%', background: `linear-gradient(90deg, ${ORANGE}, ${GREEN})`, borderRadius: 6, width: `${pct}%`, transition: 'width 0.6s ease' }} />
          </div>
        )}

        {running && current.contacted > 0 && (
          <div style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
            {[
              { label: 'Voice', icon: '\uD83D\uDCDE', count: Math.min(Math.floor(current.contacted * 0.4), 5) },
              { label: 'SMS', icon: '\uD83D\uDCAC', count: Math.min(Math.floor(current.contacted * 0.35), 4) },
              { label: 'Web', icon: '\uD83C\uDF10', count: Math.min(Math.floor(current.contacted * 0.25), 3) },
            ].map(ch => (
              <div key={ch.label} style={{ flex: 1, background: 'rgba(255,255,255,0.05)', borderRadius: 10, padding: '10px 12px', textAlign: 'center' }}>
                <div style={{ fontSize: 18, marginBottom: 4 }}>{ch.icon}</div>
                <div style={{ color: 'white', fontSize: 16, fontWeight: 600, fontFamily: "'DM Sans', sans-serif" }}>{ch.count}</div>
                <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>{ch.label}</div>
              </div>
            ))}
          </div>
        )}

        {results.map((p, i) => (
          <div key={i} style={{
            background: 'rgba(255,255,255,0.06)', borderRadius: 12, padding: '14px 16px', marginBottom: 10,
            border: '1px solid rgba(255,255,255,0.08)', animation: 'slideUp 0.4s ease',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <div>
                <span style={{ color: 'white', fontWeight: 600, fontSize: 15, fontFamily: "'DM Sans', sans-serif" }}>{p.name}</span>
                <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, marginLeft: 8 }}>&#9733; {p.rating} ({p.reviews})</span>
              </div>
              <span style={{ color: ORANGE, fontWeight: 700, fontSize: 20, fontFamily: "'DM Sans', sans-serif" }}>{p.quote}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>{p.avail}</span>
              <span style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.5)', fontSize: 11, padding: '2px 8px', borderRadius: 20 }}>
                via {p.channel}
              </span>
            </div>
            {p.note && <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12, fontStyle: 'italic', marginTop: 6 }}>"{p.note}"</div>}
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
        width: 48, height: 48, borderRadius: 14, background: accent, color: 'white',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 20, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", marginBottom: 16,
      }}>{number}</div>
      <h3 style={{ fontFamily: "'Fraunces', serif", fontSize: 22, fontWeight: 600, color: DARK, marginBottom: 8 }}>{title}</h3>
      <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 16, lineHeight: 1.65, color: '#6B6560' }}>{description}</p>
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
      background: 'white', borderRadius: 20, maxWidth: 480, width: '100%',
      boxShadow: '0 8px 40px rgba(0,0,0,0.06)', border: '1px solid rgba(0,0,0,0.06)', overflow: 'hidden',
    }}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(0,0,0,0.06)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: ORANGE, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ color: 'white', fontFamily: "'Fraunces', serif", fontWeight: 700, fontSize: 16 }}>h</span>
        </div>
        <div>
          <div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 15, color: DARK }}>Homie AI</div>
          <div style={{ fontSize: 12, color: '#9B9490' }}>Diagnosing...</div>
        </div>
      </div>

      <div style={{ padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
          <div style={{
            background: ORANGE, color: 'white', padding: '10px 16px', borderRadius: '16px 16px 4px 16px',
            maxWidth: '85%', fontSize: 14, lineHeight: 1.5, fontFamily: "'DM Sans', sans-serif", minHeight: 40,
          }}>
            {typed}<span style={{ opacity: typed.length < fullText.length ? 1 : 0, animation: 'blink 0.8s infinite' }}>|</span>
          </div>
        </div>

        {typed.length >= fullText.length && (
          <div style={{ display: 'flex', justifyContent: 'flex-start', animation: 'fadeIn 0.5s ease' }}>
            <div style={{
              background: WARM, padding: '10px 16px', borderRadius: '16px 16px 16px 4px',
              maxWidth: '85%', fontSize: 14, lineHeight: 1.6, color: DARK, fontFamily: "'DM Sans', sans-serif",
            }}>
              That sounds like a worn cartridge — super common on single-handle faucets. Can you tell me the brand? Look for a logo on the handle or base. Also, roughly how old is the faucet?
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* -- Main page -- */
export default function HomePage() {
  const navigate = useNavigate();

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif", background: 'white', overflowX: 'hidden' }}>
      <style>{`
        @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.4; } }
        @keyframes slideUp { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:translateY(0); } }
        @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
        @keyframes blink { 0%,100% { opacity:1; } 50% { opacity:0; } }
      `}</style>

      {/* NAV */}
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
        background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(0,0,0,0.05)', padding: '0 32px', height: 64,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span onClick={() => navigate('/')} style={{ fontFamily: "'Fraunces', serif", fontSize: 26, fontWeight: 700, color: ORANGE, cursor: 'pointer' }}>homie</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
          <a href="#how" style={{ textDecoration: 'none', color: '#6B6560', fontSize: 15, fontWeight: 500 }}>How it works</a>
          <a href="#diy" style={{ textDecoration: 'none', color: '#6B6560', fontSize: 15, fontWeight: 500 }}>Free diagnostic</a>
          <a href="#pricing" style={{ textDecoration: 'none', color: '#6B6560', fontSize: 15, fontWeight: 500 }}>Pricing</a>
          <button onClick={() => navigate('/quote')} style={{
            background: ORANGE, color: 'white', border: 'none', borderRadius: 100,
            padding: '10px 24px', fontSize: 15, fontWeight: 600, cursor: 'pointer',
            fontFamily: "'DM Sans', sans-serif",
          }}>Get quotes now</button>
        </div>
      </nav>

      {/* HERO */}
      <section style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '100px 32px 60px', gap: 60, flexWrap: 'wrap',
        background: `linear-gradient(180deg, white 0%, ${WARM} 100%)`,
      }}>
        <div style={{ maxWidth: 520, flex: '1 1 400px' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(27,158,119,0.08)',
            padding: '6px 14px', borderRadius: 100, marginBottom: 24,
          }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: GREEN }} />
            <span style={{ fontSize: 14, fontWeight: 500, color: GREEN }}>AI agent available 24/7</span>
          </div>

          <h1 style={{
            fontFamily: "'Fraunces', serif", fontSize: 52, fontWeight: 700, lineHeight: 1.12,
            color: DARK, marginBottom: 20, letterSpacing: '-0.02em',
          }}>
            Stop calling around.{' '}
            <span style={{ color: ORANGE }}>Let Homie do it.</span>
          </h1>

          <p style={{
            fontSize: 20, lineHeight: 1.65, color: '#6B6560', marginBottom: 36, maxWidth: 460,
          }}>
            Describe your home issue. Our AI agent simultaneously calls, texts, and contacts local pros — and brings you back quotes and availability in minutes.
          </p>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 32 }}>
            <button onClick={() => navigate('/quote')} style={{
              background: ORANGE, color: 'white', border: 'none', borderRadius: 100,
              padding: '16px 32px', fontSize: 17, fontWeight: 600, cursor: 'pointer',
              fontFamily: "'DM Sans', sans-serif", boxShadow: '0 4px 24px rgba(232,99,43,0.3)',
            }}>Get quotes in minutes</button>
            <a href="#diy" style={{
              background: 'transparent', color: DARK, border: '2px solid rgba(0,0,0,0.12)', borderRadius: 100,
              padding: '14px 28px', fontSize: 17, fontWeight: 500, cursor: 'pointer',
              fontFamily: "'DM Sans', sans-serif", textDecoration: 'none', display: 'inline-flex', alignItems: 'center',
            }}>Free DIY diagnostic &#8594;</a>
          </div>

        </div>

        <div style={{ flex: '1 1 400px', display: 'flex', justifyContent: 'center' }}>
          <LiveDemo />
        </div>
      </section>

      {/* SOCIAL PROOF BAR */}
      <section style={{
        background: DARK, padding: '24px 32px', display: 'flex', alignItems: 'center',
        justifyContent: 'center', gap: 48, flexWrap: 'wrap',
      }}>
        {[
          'No provider network required',
          'Works with any local pro',
          'AI calls, texts & fills forms simultaneously',
          'Pay only after you get results',
        ].map((t, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ color: GREEN, fontSize: 16 }}>&#10003;</div>
            <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: 14, fontWeight: 500 }}>{t}</span>
          </div>
        ))}
      </section>

      {/* HOW IT WORKS */}
      <section id="how" style={{ padding: '100px 32px', maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 64 }}>
          <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: 40, fontWeight: 700, color: DARK, marginBottom: 12 }}>
            Quotes in minutes, not days
          </h2>
          <p style={{ fontSize: 18, color: '#6B6560', maxWidth: 560, margin: '0 auto' }}>
            Our AI agent does the work that used to take you an entire afternoon of phone calls
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 40 }}>
          <Step number={1} title="Describe the issue" description="Tell Homie what's wrong — in plain English. Upload photos if you have them. Our AI figures out the rest." accent={ORANGE} />
          <Step number={2} title="AI contacts pros" description="Homie's agent simultaneously calls, texts, and fills out contact forms for local providers — all in real time." accent={DARK} />
          <Step number={3} title="Get quotes back" description="Providers respond with pricing and availability. You see everything in one place, ranked by fit." accent={GREEN} />
          <Step number={4} title="Book and relax" description="Pick the pro that works for you. They arrive already briefed on the issue. No explaining twice." accent={ORANGE} />
        </div>
      </section>

      {/* WHY HOMIE */}
      <section style={{ padding: '100px 32px', background: DARK }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 56 }}>
            <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: 40, fontWeight: 700, color: 'white', marginBottom: 12 }}>
              Not your typical home services platform
            </h2>
            <p style={{ fontSize: 18, color: 'rgba(255,255,255,0.5)', maxWidth: 520, margin: '0 auto' }}>
              Angi and Thumbtack make you wait for bids from their network. Homie goes out and finds pros for you — anywhere.
            </p>
          </div>

          <div style={{ borderRadius: 16, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: "'DM Sans', sans-serif" }}>
              <thead>
                <tr>
                  <th style={{ padding: '16px 24px', textAlign: 'left', fontSize: 14, color: 'rgba(255,255,255,0.4)', fontWeight: 500, borderBottom: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.03)' }}></th>
                  <th style={{ padding: '16px 24px', textAlign: 'center', fontSize: 14, color: 'rgba(255,255,255,0.4)', fontWeight: 500, borderBottom: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.03)' }}>Thumbtack / Angi</th>
                  <th style={{ padding: '16px 24px', textAlign: 'center', fontSize: 14, fontWeight: 700, color: ORANGE, borderBottom: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.03)' }}>Homie</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { category: 'Diagnosis', them: 'None — you describe the problem yourself', us: 'AI diagnostic with photo analysis & confidence score', icon: '&#10007;', usIcon: '&#10003;' },
                  { category: 'Finding pros', them: 'Post a job and wait for bids', us: 'AI agent actively calls, texts & contacts pros for you', icon: '&#10007;', usIcon: '&#10003;' },
                  { category: 'Provider pool', them: 'Limited to their signed-up network', us: 'Any local pro — no signup required', icon: '&#10007;', usIcon: '&#10003;' },
                  { category: 'Lead quality', them: 'Generic requests, high competition', us: 'Pre-qualified leads with full diagnosis & context', icon: '&#10007;', usIcon: '&#10003;' },
                  { category: 'DIY support', them: 'None', us: 'Step-by-step guidance with tools & materials list', icon: '&#10007;', usIcon: '&#10003;' },
                ].map((row, i) => (
                  <tr key={i} style={{ borderBottom: i < 4 ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
                    <td style={{ padding: '18px 24px', fontSize: 15, fontWeight: 600, color: 'white' }}>{row.category}</td>
                    <td style={{ padding: '18px 24px', textAlign: 'center', fontSize: 14, color: 'rgba(255,255,255,0.4)' }}>
                      <span style={{ color: '#FF6B6B', marginRight: 8 }} dangerouslySetInnerHTML={{ __html: row.icon }} />
                      {row.them}
                    </td>
                    <td style={{ padding: '18px 24px', textAlign: 'center', fontSize: 14, color: 'rgba(255,255,255,0.85)', fontWeight: 500 }}>
                      <span style={{ color: GREEN, marginRight: 8 }} dangerouslySetInnerHTML={{ __html: row.usIcon }} />
                      {row.us}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ textAlign: 'center', marginTop: 40 }}>
            <button onClick={() => navigate('/quote')} style={{
              background: ORANGE, color: 'white', border: 'none', borderRadius: 100,
              padding: '16px 36px', fontSize: 17, fontWeight: 600, cursor: 'pointer',
              fontFamily: "'DM Sans', sans-serif", boxShadow: '0 4px 24px rgba(232,99,43,0.3)',
            }}>See the difference — get quotes now</button>
          </div>
        </div>
      </section>

      {/* DIY DIAGNOSTIC */}
      <section id="diy" style={{ padding: '100px 32px', background: WARM }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 60, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 400px' }}>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              background: 'rgba(232,99,43,0.08)', padding: '6px 14px', borderRadius: 100, marginBottom: 20,
            }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: ORANGE }}>100% free</span>
            </div>
            <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: 38, fontWeight: 700, color: DARK, marginBottom: 16, lineHeight: 1.15 }}>
              Not sure what's wrong?<br />Ask Homie first.
            </h2>
            <p style={{ fontSize: 18, lineHeight: 1.65, color: '#6B6560', marginBottom: 24, maxWidth: 440 }}>
              Chat with our AI diagnostic engine for free. Describe what's happening, upload a photo, and get an expert-level diagnosis with DIY steps, cost estimates, and severity assessment — in under 2 minutes.
            </p>
            <ul style={{ listStyle: 'none', padding: 0, marginBottom: 32 }}>
              {[
                'Identifies issues across plumbing, electrical, HVAC, and more',
                'Photo analysis spots problems you might miss',
                'Step-by-step DIY instructions with tools needed',
                'Know if it\'s a $20 fix or a $2,000 problem',
              ].map((item, i) => (
                <li key={i} style={{
                  display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 12,
                  fontSize: 15, color: '#6B6560', lineHeight: 1.5,
                }}>
                  <span style={{ color: GREEN, fontSize: 18, marginTop: -1, flexShrink: 0 }}>&#10003;</span>
                  {item}
                </li>
              ))}
            </ul>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <button onClick={() => navigate('/chat')} style={{
                background: 'white', color: DARK, border: `2px solid ${DARK}`, borderRadius: 100,
                padding: '14px 28px', fontSize: 16, fontWeight: 600, cursor: 'pointer',
                fontFamily: "'DM Sans', sans-serif",
              }}>Try the free diagnostic</button>
              <span style={{ fontSize: 14, color: '#9B9490' }}>No account required</span>
            </div>
          </div>
          <div style={{ flex: '1 1 400px', display: 'flex', justifyContent: 'center' }}>
            <DiagnosticPreview />
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section id="pricing" style={{ padding: '100px 32px', maxWidth: 1000, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 56 }}>
          <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: 40, fontWeight: 700, color: DARK, marginBottom: 12 }}>
            Pay only when you get results
          </h2>
          <p style={{ fontSize: 18, color: '#6B6560' }}>
            No subscription. No commitment. Zero cost if no providers respond.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 20 }}>
          {[
            { tier: 'Standard', price: '$9.99', time: '~2 hours', providers: '5-8 contacted', channels: 'SMS + Web', popular: false },
            { tier: 'Priority', price: '$19.99', time: '~30 minutes', providers: '10+ contacted', channels: 'Voice + SMS + Web', popular: true },
            { tier: 'Emergency', price: '$29.99', time: '~15 minutes', providers: '15+ contacted', channels: 'All channels (blitz)', popular: false },
          ].map((t, i) => (
            <div key={i} style={{
              background: t.popular ? DARK : 'white', borderRadius: 20, padding: '36px 28px',
              border: t.popular ? 'none' : '1px solid rgba(0,0,0,0.08)', position: 'relative',
              boxShadow: t.popular ? '0 16px 60px rgba(45,41,38,0.2)' : 'none',
              transform: t.popular ? 'scale(1.04)' : 'none',
            }}>
              {t.popular && (
                <div style={{
                  position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)',
                  background: ORANGE, color: 'white', fontSize: 12, fontWeight: 700,
                  padding: '4px 16px', borderRadius: 100, letterSpacing: '0.04em',
                }}>MOST POPULAR</div>
              )}
              <div style={{ fontSize: 16, fontWeight: 600, color: t.popular ? 'rgba(255,255,255,0.6)' : '#9B9490', marginBottom: 8 }}>{t.tier}</div>
              <div style={{ fontFamily: "'Fraunces', serif", fontSize: 44, fontWeight: 700, color: t.popular ? 'white' : DARK, marginBottom: 4 }}>{t.price}</div>
              <div style={{ fontSize: 14, color: t.popular ? 'rgba(255,255,255,0.4)' : '#9B9490', marginBottom: 24 }}>per search</div>
              {[t.time, t.providers, t.channels, 'Full diagnostic included', 'Money-back guarantee'].map((f, j) => (
                <div key={j} style={{
                  display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10,
                  fontSize: 14, color: t.popular ? 'rgba(255,255,255,0.75)' : '#6B6560',
                }}>
                  <span style={{ color: GREEN }}>&#10003;</span> {f}
                </div>
              ))}
              <button onClick={() => navigate('/quote')} style={{
                width: '100%', marginTop: 20, padding: '14px 0', borderRadius: 100, fontSize: 16, fontWeight: 600,
                cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", border: 'none',
                background: t.popular ? ORANGE : WARM, color: t.popular ? 'white' : DARK,
              }}>
                {t.popular ? 'Get priority quotes' : `Choose ${t.tier.toLowerCase()}`}
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section style={{ padding: '80px 32px', background: ORANGE, textAlign: 'center' }}>
        <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: 40, fontWeight: 700, color: 'white', marginBottom: 16 }}>
          Every home needs a Homie.
        </h2>
        <p style={{ fontSize: 18, color: 'rgba(255,255,255,0.8)', marginBottom: 32, maxWidth: 480, margin: '0 auto 32px' }}>
          Stop spending hours calling around. Describe the problem, and Homie handles the rest.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button onClick={() => navigate('/quote')} style={{
            background: 'white', color: ORANGE, border: 'none', borderRadius: 100,
            padding: '16px 36px', fontSize: 17, fontWeight: 700, cursor: 'pointer',
            fontFamily: "'DM Sans', sans-serif",
          }}>Get quotes now</button>
          <button onClick={() => navigate('/chat')} style={{
            background: 'transparent', color: 'white', border: '2px solid rgba(255,255,255,0.4)', borderRadius: 100,
            padding: '14px 32px', fontSize: 17, fontWeight: 500, cursor: 'pointer',
            fontFamily: "'DM Sans', sans-serif",
          }}>Try free diagnostic</button>
        </div>
      </section>

      {/* FOOTER */}
      <footer style={{ padding: '40px 32px', background: DARK, textAlign: 'center' }}>
        <span style={{ fontFamily: "'Fraunces', serif", fontSize: 20, fontWeight: 700, color: ORANGE }}>homie</span>
        <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13, marginTop: 8 }}>
          Your home's best friend. &copy; {new Date().getFullYear()} Homie Technologies, Inc.
        </p>
      </footer>
    </div>
  );
}
