import DIYPanel from '@/components/DIYPanel';

/**
 * DIY Preview Demo — visual mockup of how the DIY affiliate fork sits
 * inside the quote-chat UI. Rendered at /demo/diy-preview.
 *
 * Unlike a pure mock, this preview uses the real shipped DIYPanel
 * component and the real /api/v1/diy/analyze endpoint — so what you see
 * here is what the homeowner sees in /quote. The fake user message +
 * diagnosis card are static scaffolding to provide realistic context.
 */

const O = '#E8632B', G = '#1B9E77', D = '#2D2926', W = '#F9F5F2';
const DIM = '#6B6560';

const MOCK_SCENARIO = {
  category: 'Plumbing',
  categoryIcon: '💧',
  userFirstMessage: 'Kitchen faucet drips from the base every few seconds, mostly when hot water is on',
  aiDiagnosis:
    'Based on drip location (from the base of the spout, not the aerator) and the hot-water trigger, this is almost certainly a worn O-ring or cartridge seal. Roughly 85% of base drips on single-handle pull-down faucets resolve with a $5-$20 replacement part. Around 15% of the time the cartridge itself needs swapping.',
  estimatedCostPro: { min: 150, max: 285 },
};

export default function DIYPreviewDemo() {
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
            Live Preview · Production Component
          </div>
          <div style={{ fontSize: 15, fontWeight: 600, color: D }}>DIY fork in the quote chat</div>
          <div style={{ fontSize: 13, color: DIM, marginTop: 4, lineHeight: 1.5 }}>
            This renders the real DIYPanel component against the live <code style={{ fontSize: 12 }}>/api/v1/diy/analyze</code> endpoint. Tap the panel to lazy-load actual AI-generated DIY guidance + Amazon affiliate tool links (tagged <code style={{ fontSize: 12 }}>03028471-20</code>).
          </div>
        </div>

        {/* Fake user message */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
          <div style={{
            background: O, color: '#fff', padding: '10px 14px', borderRadius: 16,
            borderBottomRightRadius: 4, maxWidth: '78%', fontSize: 14, lineHeight: 1.5,
          }}>{MOCK_SCENARIO.userFirstMessage}</div>
        </div>

        {/* Scaffolded diagnosis card — visually identical to GetQuotes */}
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
              {MOCK_SCENARIO.categoryIcon} {MOCK_SCENARIO.category} — {MOCK_SCENARIO.userFirstMessage}
            </div>
            <div style={{ fontSize: 14, color: DIM, lineHeight: 1.6, marginBottom: 8 }}>
              {MOCK_SCENARIO.aiDiagnosis}
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 12 }}>
              <div style={{ background: W, padding: '6px 12px', borderRadius: 8, fontSize: 13 }}>
                <span style={{ color: '#9B9490' }}>Category:</span> <span style={{ fontWeight: 600, color: D }}>{MOCK_SCENARIO.category}</span>
              </div>
              <div style={{ background: W, padding: '6px 12px', borderRadius: 8, fontSize: 13 }}>
                <span style={{ color: '#9B9490' }}>Est. pro cost:</span> <span style={{ fontWeight: 600, color: D }}>${MOCK_SCENARIO.estimatedCostPro.min}–${MOCK_SCENARIO.estimatedCostPro.max}</span>
              </div>
            </div>
            <p style={{ fontSize: 12, color: '#9B9490', marginTop: 12, lineHeight: 1.5 }}>
              This diagnosis will be shared with providers so they can give you an accurate quote — no need to explain twice.
            </p>
          </div>
        </div>

        {/* The real, shipping DIYPanel — calls the live endpoint. */}
        <DIYPanel
          diagnosis={MOCK_SCENARIO.aiDiagnosis}
          category={MOCK_SCENARIO.category.toLowerCase()}
          userDescription={MOCK_SCENARIO.userFirstMessage}
          onBackToPro={() => {
            // In the demo, just scroll to the mock tier cards below.
            document.getElementById('demo-tier-cards')?.scrollIntoView({ behavior: 'smooth' });
          }}
        />

        {/* Mock tier cards — show the visual hierarchy against the DIY panel */}
        <div id="demo-tier-cards" style={{ marginLeft: 42, marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: DIM, marginBottom: 8, fontWeight: 600 }}>
            Ready to get quotes?
          </div>
          <MockTierCard name="Standard" time="Within 24 hrs" detail="3–5 vetted pros reach out" price="$9" />
          <MockTierCard name="Priority" time="Within 2 hrs" detail="Faster outreach, first in queue" price="$19" popular />
          <MockTierCard name="Emergency" time="ASAP" detail="24/7 on-call pros paged now" price="$49" />
        </div>
      </div>
    </div>
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
          {name} <span style={{ fontWeight: 400, color: '#9B9490', fontSize: 13 }}>· {time}</span>
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
