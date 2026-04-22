import { useState } from 'react';

/**
 * DIY Preview Demo — visual mockup of how the DIY affiliate fork sits
 * inside the existing quote-chat UI. Rendered at /demo/diy-preview.
 * Uses the same color + spacing tokens as GetQuotes.tsx so the panel
 * looks native when it ships. Data is mocked — no AI call is made.
 */

const O = '#E8632B', G = '#1B9E77', D = '#2D2926', W = '#F9F5F2';
const DIM = '#6B6560';
const BORDER = 'rgba(0,0,0,.08)';

// Mock diagnosis — a realistic "dripping kitchen faucet" scenario.
const MOCK = {
  category: 'Plumbing',
  categoryIcon: '\uD83D\uDCA7',
  userFirstMessage: 'Kitchen faucet drips from the base every few seconds, mostly when hot water is on',
  aiDiagnosis:
    'Based on drip location (from the base of the spout, not the aerator) and the hot-water trigger, this is almost certainly a worn O-ring or cartridge seal. Roughly 85% of base drips on single-handle pull-down faucets resolve with a $5–$20 replacement part. Around 15% of the time the cartridge itself needs swapping.',
  diyFeasible: true,
  diyTimeEstimate: '30–60 min',
  diyDifficulty: 'Beginner — no sweat',
  estimatedCostDIY: { min: 8, max: 35 },
  estimatedCostPro: { min: 150, max: 285 },
  steps: [
    'Shut off both hot and cold supply valves under the sink.',
    'Open faucet to relieve pressure. Place a towel over the drain so no screws get lost.',
    'Pry off the decorative cap on top of the handle with a flathead screwdriver.',
    'Loosen the handle set screw (usually a 2.5mm hex / Allen) and lift the handle off.',
    'Unthread the retaining nut under the handle. Pull the cartridge straight up.',
    'Slide old O-rings off with a pick, lightly grease the new ones with plumber silicone, and seat them.',
    'Reassemble in reverse order. Turn water back on slowly and check for drips.',
  ],
  toolsNeeded: [
    { name: 'O-ring assortment kit (faucet-sized)', query: 'faucet O-ring assortment kit', essential: true },
    { name: 'Plumber\u2019s silicone grease', query: 'plumbers silicone grease danco', essential: true },
    { name: 'Hex / Allen key set (metric)', query: 'metric hex allen key set small', essential: true },
    { name: 'Adjustable wrench (10-inch)', query: '10-inch adjustable wrench', essential: true },
    { name: 'Replacement faucet cartridge (universal)', query: 'universal faucet cartridge replacement', essential: false },
  ],
  safetyWarnings: [
    'Turn off both supply valves before you start — don\u2019t skip this.',
    'If you can\u2019t identify the faucet brand, snap a photo of any markings before removing parts.',
  ],
  whenToCallPro:
    'If the cartridge won\u2019t budge after firm pulling, or you see greenish corrosion around the valve seat, stop — a pro can do it in 20 minutes without damaging the fixture.',
};

// Amazon search affiliate URL. In prod this tag comes from
// VITE_AMAZON_AFFILIATE_TAG; hardcoded here for the demo.
function amazonSearchUrl(query: string): string {
  const tag = 'homie-20'; // DEMO placeholder
  return `https://www.amazon.com/s?k=${encodeURIComponent(query)}&tag=${tag}`;
}

export default function DIYPreviewDemo() {
  const [expanded, setExpanded] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  return (
    <div style={{
      minHeight: '100vh', background: W, padding: '40px 20px',
      fontFamily: "'DM Sans', sans-serif", color: D,
    }}>
      <style>{`
        @keyframes fadeSlide { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>

      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        {/* Demo header */}
        <div style={{ marginBottom: 24, padding: '16px 20px', background: '#FFF7ED', border: `1px solid ${O}33`, borderRadius: 12 }}>
          <div style={{ fontSize: 11, fontFamily: "'DM Mono',monospace", letterSpacing: 1.4, textTransform: 'uppercase', color: O, fontWeight: 700, marginBottom: 4 }}>
            Design Preview · Not Wired
          </div>
          <div style={{ fontSize: 15, fontWeight: 600, color: D }}>DIY fork in the quote chat</div>
          <div style={{ fontSize: 13, color: DIM, marginTop: 4, lineHeight: 1.5 }}>
            Mockup of how the DIY affiliate-monetized path sits inside the existing diagnosis view. Dispatch-to-pros stays the primary CTA; DIY is a secondary, collapsed-by-default option — only shown when the AI flags the repair as safe to self-service.
          </div>
        </div>

        {/* Fake user message bubble */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
          <div style={{
            background: O, color: '#fff', padding: '10px 14px', borderRadius: 16,
            borderBottomRightRadius: 4, maxWidth: '78%', fontSize: 14, lineHeight: 1.5,
          }}>{MOCK.userFirstMessage}</div>
        </div>

        {/* Existing DiagnosisSummary card — copied verbatim from GetQuotes.tsx */}
        <div style={{
          marginLeft: 42, marginBottom: 16, background: 'white', border: `2px solid ${G}22`,
          borderRadius: 16, overflow: 'hidden', animation: 'fadeSlide 0.4s ease',
        }}>
          <div style={{ background: `${G}10`, padding: '12px 16px', borderBottom: `1px solid ${G}22`, display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: G }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: G }}>AI diagnosis ready</span>
          </div>
          <div style={{ padding: '16px' }}>
            <div style={{ fontWeight: 700, fontSize: 16, color: D, marginBottom: 8 }}>
              {MOCK.categoryIcon} {MOCK.category} \u2014 {MOCK.userFirstMessage}
            </div>
            <div style={{ fontSize: 14, color: '#6B6560', lineHeight: 1.6, marginBottom: 8 }}>
              {MOCK.aiDiagnosis}
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 12 }}>
              <div style={{ background: W, padding: '6px 12px', borderRadius: 8, fontSize: 13 }}>
                <span style={{ color: '#9B9490' }}>Category:</span> <span style={{ fontWeight: 600, color: D }}>{MOCK.category}</span>
              </div>
              <div style={{ background: W, padding: '6px 12px', borderRadius: 8, fontSize: 13 }}>
                <span style={{ color: '#9B9490' }}>Est. pro cost:</span> <span style={{ fontWeight: 600, color: D }}>${MOCK.estimatedCostPro.min}\u2013${MOCK.estimatedCostPro.max}</span>
              </div>
            </div>
            <p style={{ fontSize: 12, color: '#9B9490', marginTop: 12, lineHeight: 1.5 }}>
              This diagnosis will be shared with providers so they can give you an accurate quote \u2014 no need to explain twice.
            </p>
          </div>
        </div>

        {/* ── DIY PANEL — new, gated by MOCK.diyFeasible ─────────────── */}
        {MOCK.diyFeasible && !dismissed && (
          <div style={{
            marginLeft: 42, marginBottom: 16, background: 'white',
            border: `1px solid ${BORDER}`, borderRadius: 14, overflow: 'hidden',
            animation: 'fadeSlide 0.4s ease',
          }}>
            {/* Collapsed state: compact secondary CTA. Intentionally less
                visual weight than the pro dispatch button that sits below. */}
            <button
              onClick={() => setExpanded(e => !e)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                padding: '12px 16px', background: 'transparent', border: 'none',
                cursor: 'pointer', textAlign: 'left', fontFamily: "'DM Sans', sans-serif",
              }}
            >
              <div style={{
                width: 32, height: 32, borderRadius: 8, background: `${G}15`,
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
              }}>{'\uD83D\uDD27'}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: D }}>
                  Or try fixing it yourself?
                </div>
                <div style={{ fontSize: 12, color: DIM, marginTop: 2 }}>
                  {MOCK.diyDifficulty} \u00b7 {MOCK.diyTimeEstimate} \u00b7 ~${MOCK.estimatedCostDIY.min}\u2013${MOCK.estimatedCostDIY.max} in parts
                </div>
              </div>
              <div style={{
                fontSize: 18, color: DIM, transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform 0.2s', flexShrink: 0,
              }}>{'\u25BE'}</div>
            </button>

            {expanded && (
              <div style={{ padding: '0 16px 16px', borderTop: `1px solid ${BORDER}`, animation: 'fadeSlide 0.25s ease' }}>
                {/* Cost + time strip */}
                <div style={{
                  display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12, marginBottom: 16,
                  padding: 10, background: `${G}08`, borderRadius: 10, border: `1px solid ${G}1a`,
                }}>
                  <Chip label="Time" value={MOCK.diyTimeEstimate} />
                  <Chip label="DIY cost" value={`$${MOCK.estimatedCostDIY.min}\u2013${MOCK.estimatedCostDIY.max}`} accent={G} />
                  <Chip label="Pro cost" value={`$${MOCK.estimatedCostPro.min}\u2013${MOCK.estimatedCostPro.max}`} accent={DIM} strike />
                  <Chip label="Difficulty" value="Beginner" />
                </div>

                {/* Steps */}
                <SectionHeader>Steps</SectionHeader>
                <ol style={{ margin: '0 0 16px', paddingLeft: 0, listStyle: 'none' }}>
                  {MOCK.steps.map((step, i) => (
                    <li key={i} style={{
                      display: 'flex', gap: 10, marginBottom: 10, fontSize: 13.5,
                      color: D, lineHeight: 1.6,
                    }}>
                      <div style={{
                        flexShrink: 0, width: 22, height: 22, borderRadius: '50%',
                        background: `${O}14`, color: O, fontSize: 11, fontWeight: 700,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>{i + 1}</div>
                      <div style={{ flex: 1 }}>{step}</div>
                    </li>
                  ))}
                </ol>

                {/* Tools & supplies — the affiliate monetization surface */}
                <SectionHeader>Tools & supplies</SectionHeader>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                  {MOCK.toolsNeeded.map((tool, i) => (
                    <a
                      key={i}
                      href={amazonSearchUrl(tool.query)}
                      target="_blank"
                      rel="sponsored noopener noreferrer"
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '10px 12px', background: '#fff', border: `1px solid ${BORDER}`,
                        borderRadius: 10, textDecoration: 'none', color: D, transition: 'all 0.15s',
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.borderColor = O;
                        e.currentTarget.style.background = `${O}06`;
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.borderColor = BORDER;
                        e.currentTarget.style.background = '#fff';
                      }}
                    >
                      <div style={{
                        width: 28, height: 28, borderRadius: 6, background: W,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 14, flexShrink: 0,
                      }}>{tool.essential ? '\uD83D\uDD29' : '\uD83D\uDCE6'}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 600, color: D }}>
                          {tool.name}
                          {!tool.essential && (
                            <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 600, color: DIM, background: W, padding: '2px 6px', borderRadius: 4 }}>
                              If needed
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 11.5, color: DIM, marginTop: 2 }}>Search on Amazon</div>
                      </div>
                      <div style={{ fontSize: 13, color: O, fontWeight: 600, flexShrink: 0 }}>
                        View \u2197
                      </div>
                    </a>
                  ))}
                </div>

                {/* Safety */}
                <SectionHeader tone="warn">Before you start</SectionHeader>
                <ul style={{ margin: '0 0 16px', paddingLeft: 18, color: D, fontSize: 13, lineHeight: 1.6 }}>
                  {MOCK.safetyWarnings.map((w, i) => <li key={i} style={{ marginBottom: 4 }}>{w}</li>)}
                </ul>

                {/* When to give up & dispatch */}
                <div style={{
                  padding: 12, background: `${O}08`, border: `1px solid ${O}22`, borderRadius: 10,
                  marginBottom: 14,
                }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: O, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
                    When to stop & call a pro
                  </div>
                  <div style={{ fontSize: 13, color: D, lineHeight: 1.5 }}>{MOCK.whenToCallPro}</div>
                </div>

                {/* Fallback CTA — the conversion recapture */}
                <button
                  onClick={() => { setExpanded(false); setDismissed(true); }}
                  style={{
                    width: '100%', padding: '12px 16px', background: '#fff',
                    border: `1.5px solid ${O}`, color: O, fontWeight: 600,
                    borderRadius: 10, cursor: 'pointer', fontSize: 14, fontFamily: "'DM Sans', sans-serif",
                  }}
                >
                  Didn\u2019t work? Get pro quotes \u2192
                </button>

                {/* FTC-required affiliate disclosure */}
                <p style={{ fontSize: 10.5, color: '#9B9490', marginTop: 10, marginBottom: 0, lineHeight: 1.5, textAlign: 'center' }}>
                  Homie earns a small commission from qualifying Amazon purchases. It doesn\u2019t change your price.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Primary dispatch CTA — matches existing tier-card entry point */}
        <div style={{ marginLeft: 42, marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: DIM, marginBottom: 8, fontWeight: 600 }}>
            Ready to get quotes?
          </div>
          <MockTierCard
            name="Standard"
            time="Within 24 hrs"
            detail="3\u20135 vetted pros reach out"
            price="$9"
          />
          <MockTierCard
            name="Priority"
            time="Within 2 hrs"
            detail="Faster outreach, first in queue"
            price="$19"
            popular
          />
          <MockTierCard
            name="Emergency"
            time="ASAP"
            detail="24/7 on-call pros paged now"
            price="$49"
          />
        </div>
      </div>
    </div>
  );
}

function Chip({ label, value, accent, strike }: { label: string; value: string; accent?: string; strike?: boolean }) {
  return (
    <div style={{
      background: '#fff', padding: '6px 10px', borderRadius: 8, fontSize: 12,
      border: `1px solid ${BORDER}`,
    }}>
      <span style={{ color: DIM }}>{label}: </span>
      <span style={{
        fontWeight: 700, color: accent || D,
        textDecoration: strike ? 'line-through' : 'none',
      }}>{value}</span>
    </div>
  );
}

function SectionHeader({ children, tone }: { children: React.ReactNode; tone?: 'warn' }) {
  return (
    <div style={{
      fontSize: 11, fontFamily: "'DM Mono', monospace", letterSpacing: 1.2,
      textTransform: 'uppercase', fontWeight: 700,
      color: tone === 'warn' ? O : DIM,
      marginBottom: 8, marginTop: 4,
    }}>{children}</div>
  );
}

function MockTierCard({ name, time, detail, price, popular }: {
  name: string; time: string; detail: string; price: string; popular?: boolean;
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', padding: '14px 18px', borderRadius: 14,
      border: popular ? `2px solid ${O}` : '2px solid rgba(0,0,0,0.06)',
      background: popular ? 'rgba(232,99,43,0.03)' : 'white',
      marginBottom: 8, position: 'relative',
    }}>
      {popular && (
        <div style={{
          position: 'absolute', top: -9, right: 14, background: O, color: 'white',
          fontSize: 10, fontWeight: 700, padding: '2px 10px', borderRadius: 100,
        }}>RECOMMENDED</div>
      )}
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 700, fontSize: 16, color: D }}>
          {name} <span style={{ fontWeight: 400, color: '#9B9490', fontSize: 13 }}>\u00b7 {time}</span>
        </div>
        <div style={{ fontSize: 13, color: '#9B9490', marginTop: 2 }}>{detail}</div>
      </div>
      <div style={{
        fontFamily: "'Fraunces', serif", fontSize: 24, fontWeight: 700,
        color: popular ? O : D,
      }}>{price}</div>
    </div>
  );
}
