import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { authService } from '@/services/api';

const O = '#E8632B', G = '#1B9E77', D = '#2D2926', W = '#F9F5F2';

/* -- Category-specific follow-up questions -- */
const CATEGORY_FLOWS: Record<string, {
  icon: string; label: string;
  q1: { text: string; options: string[] };
  q2: { text: string; options: string[] };
  q3: { text: string; options: string[] };
}> = {
  plumbing: {
    icon: '\uD83D\uDD27', label: 'Plumbing',
    q1: { text: "Where's the issue?", options: ['Kitchen', 'Bathroom', 'Laundry', 'Water heater', 'Outdoor', 'Other'] },
    q2: { text: "What's happening?", options: ['Leaking/dripping', 'Clogged/slow drain', 'No hot water', 'Running toilet', 'Low pressure', 'Burst/flooding'] },
    q3: { text: 'How urgent is this?', options: ['Water is actively leaking', "It works but something's wrong", 'Just noticed it', 'Been like this a while'] },
  },
  electrical: {
    icon: '\u26A1', label: 'Electrical',
    q1: { text: "What's the problem?", options: ['Outlet not working', 'Lights flickering', 'Breaker tripping', 'Sparking/burning smell', 'Need new install', 'Other'] },
    q2: { text: 'Where in the home?', options: ['One room', 'Multiple rooms', 'Whole house', 'Outdoor/garage', 'Panel/breaker box'] },
    q3: { text: 'Is there any safety concern?', options: ['Burning smell or sparks', 'Exposed wires', 'Water near electrical', 'No safety concern'] },
  },
  hvac: {
    icon: '\u2744\uFE0F', label: 'HVAC',
    q1: { text: "What's going on?", options: ['AC not cooling', 'Heat not working', 'Strange noises', 'Thermostat issue', 'Bad smell from vents', 'Maintenance/tune-up'] },
    q2: { text: 'What type of system?', options: ['Central AC', 'Mini split', 'Window unit', 'Furnace', 'Heat pump', 'Not sure'] },
    q3: { text: 'How old is the system?', options: ['Under 5 years', '5\u201310 years', '10\u201315 years', '15+ years', 'No idea'] },
  },
  appliance: {
    icon: '\uD83C\uDF73', label: 'Appliance',
    q1: { text: 'Which appliance?', options: ['Washer', 'Dryer', 'Dishwasher', 'Refrigerator', 'Oven/stove', 'Garbage disposal', 'Other'] },
    q2: { text: "What's it doing?", options: ["Won't turn on", 'Leaking water', 'Making noise', 'Not completing cycle', 'Error code showing', 'Other'] },
    q3: { text: 'Do you know the brand?', options: ['GE', 'Whirlpool', 'Samsung', 'LG', 'Maytag', 'Bosch', 'Other', 'Not sure'] },
  },
  roofing: {
    icon: '\uD83C\uDFE0', label: 'Roofing',
    q1: { text: "What's the concern?", options: ['Active leak inside', 'Missing/damaged shingles', 'Gutter issue', 'Storm damage', 'General inspection', 'Other'] },
    q2: { text: 'Roof type?', options: ['Asphalt shingles', 'Tile', 'Metal', 'Flat/low slope', 'Not sure'] },
    q3: { text: 'How old is the roof?', options: ['Under 5 years', '5\u201315 years', '15\u201325 years', '25+ years', 'No idea'] },
  },
  general: {
    icon: '\uD83D\uDD28', label: 'Handyman',
    q1: { text: 'What kind of work?', options: ['Drywall repair', 'Painting', 'Door/window issue', 'Fence repair', 'Furniture assembly', 'Other'] },
    q2: { text: 'How big is the job?', options: ['Quick fix (under 1 hour)', 'Half-day job', 'Full day or more', 'Not sure'] },
    q3: { text: 'Anything else important?', options: ['Need it done ASAP', 'Can wait a bit', 'Just getting a price', 'Multiple small jobs'] },
  },
};

const TIERS = [
  { id: 'standard', name: 'Standard', price: '$9.99', time: '~2 hours', detail: '5\u20138 pros via SMS + web' },
  { id: 'priority', name: 'Priority', price: '$19.99', time: '~30 min', detail: '10+ pros via voice + SMS + web', popular: true },
  { id: 'emergency', name: 'Emergency', price: '$29.99', time: '~15 min', detail: '15+ pros, all channels blitz' },
];

const MOCK_PROVIDERS = [
  { name: 'Rodriguez Plumbing', rating: 4.9, reviews: 214, quote: '$175', availability: 'Tomorrow 9\u201311 AM', channel: 'voice', note: 'Done hundreds of Moen cartridge swaps. Will bring the part.', distance: '4.2 mi', delay: 4500 },
  { name: 'Atlas Home Services', rating: 4.7, reviews: 89, quote: '$150\u2013200', availability: 'Wednesday afternoon', channel: 'sms', note: 'Can bring the part with me, 12 years experience', distance: '6.1 mi', delay: 8000 },
  { name: 'Quick Fix Pros', rating: 4.6, reviews: 156, quote: '$195', availability: 'Thursday 8\u201310 AM', channel: 'web', note: 'Licensed & insured, 15 years with Moen fixtures', distance: '3.8 mi', delay: 11500 },
];

const OUTREACH_LOG = [
  { t: 0, msg: 'Analyzing your issue...', type: 'system' },
  { t: 800, msg: 'Diagnosis complete \u2014 generating provider briefing', type: 'system' },
  { t: 1600, msg: 'Found 14 providers near you', type: 'system' },
  { t: 2400, msg: 'Calling Rodriguez Plumbing...', type: 'voice' },
  { t: 3000, msg: 'Texting Atlas Home Services...', type: 'sms' },
  { t: 3600, msg: 'Calling SD Premier Plumbing...', type: 'voice' },
  { t: 4200, msg: 'Rodriguez Plumbing \u2014 quote received!', type: 'success' },
  { t: 5000, msg: 'Texting Mike\'s Plumbing Co...', type: 'sms' },
  { t: 5800, msg: 'Submitting form on quickfixpros.com', type: 'web' },
  { t: 6600, msg: 'SD Premier \u2014 voicemail, sending SMS fallback', type: 'fallback' },
  { t: 7400, msg: 'Atlas Home Services \u2014 quote received!', type: 'success' },
  { t: 8400, msg: 'Mike\'s Plumbing \u2014 declined (booked)', type: 'decline' },
  { t: 9400, msg: 'Texting Reliable Plumbing & Drain...', type: 'sms' },
  { t: 10200, msg: 'Calling ABC Plumbing...', type: 'voice' },
  { t: 11200, msg: 'Quick Fix Pros \u2014 quote received!', type: 'success' },
  { t: 12200, msg: '3 quotes ready!', type: 'done' },
];

interface QuoteData {
  category: string | null;
  a1: string | null;
  a2: string | null;
  a3: string | null;
  extra: string | null;
  photo: string | null;
  zip: string;
  timing: string | null;
  tier: string | null;
  description?: string;
}

interface CatOption { id: string; icon: string; label: string }

/* -- Chat message components -- */
function AssistantMsg({ text, animate = true }: { text: string; animate?: boolean }) {
  const [show, setShow] = useState(!animate);
  useEffect(() => { if (animate) { const t = setTimeout(() => setShow(true), 200); return () => clearTimeout(t); } }, [animate]);
  if (!show && animate) return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 12, animation: 'fadeIn 0.3s ease' }}>
      <div style={{ width: 32, height: 32, borderRadius: 10, background: O, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <span style={{ color: 'white', fontFamily: "'Fraunces', serif", fontWeight: 700, fontSize: 15 }}>h</span>
      </div>
      <div style={{ background: W, padding: '12px 16px', borderRadius: '16px 16px 16px 4px', maxWidth: '80%' }}>
        <div style={{ display: 'flex', gap: 4 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#ccc', animation: 'pulse 1s infinite' }} />
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#ccc', animation: 'pulse 1s infinite 0.2s' }} />
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#ccc', animation: 'pulse 1s infinite 0.4s' }} />
        </div>
      </div>
    </div>
  );
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 12, animation: animate ? 'fadeSlide 0.3s ease' : 'none' }}>
      <div style={{ width: 32, height: 32, borderRadius: 10, background: O, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <span style={{ color: 'white', fontFamily: "'Fraunces', serif", fontWeight: 700, fontSize: 15 }}>h</span>
      </div>
      <div style={{ background: W, padding: '12px 16px', borderRadius: '16px 16px 16px 4px', maxWidth: '80%', fontSize: 15, lineHeight: 1.6, color: D }}>{text}</div>
    </div>
  );
}

function UserMsg({ text }: { text: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12, animation: 'fadeSlide 0.2s ease' }}>
      <div style={{ background: O, color: 'white', padding: '10px 18px', borderRadius: '16px 16px 4px 16px', maxWidth: '75%', fontSize: 15, lineHeight: 1.5 }}>{text}</div>
    </div>
  );
}

function QuickReplies({ options, onSelect, columns }: { options: (string | CatOption)[]; onSelect: (opt: string | CatOption) => void; columns?: number }) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: columns ? `repeat(${columns}, 1fr)` : 'repeat(auto-fill, minmax(130px, 1fr))',
      gap: 8, marginBottom: 16, marginLeft: 42, animation: 'fadeSlide 0.3s ease',
    }}>
      {options.map(opt => (
        <button key={typeof opt === 'string' ? opt : opt.id} onClick={() => onSelect(opt)} style={{
          padding: typeof opt === 'string' ? '10px 14px' : '14px', borderRadius: 12, cursor: 'pointer',
          border: '2px solid rgba(0,0,0,0.07)', background: 'white', fontFamily: "'DM Sans', sans-serif",
          fontSize: 14, color: D, fontWeight: 500, textAlign: 'center', transition: 'all 0.15s',
        }}
          onMouseEnter={e => { (e.target as HTMLElement).style.borderColor = O; (e.target as HTMLElement).style.background = 'rgba(232,99,43,0.03)'; }}
          onMouseLeave={e => { (e.target as HTMLElement).style.borderColor = 'rgba(0,0,0,0.07)'; (e.target as HTMLElement).style.background = 'white'; }}
        >
          {typeof opt === 'string' ? opt : (
            <>
              <div style={{ fontSize: 22, marginBottom: 4 }}>{opt.icon}</div>
              <div>{opt.label}</div>
            </>
          )}
        </button>
      ))}
    </div>
  );
}

function TextInput({ placeholder, onSubmit }: { placeholder: string; onSubmit: (val: string) => void }) {
  const [val, setVal] = useState('');
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  return (
    <div style={{ display: 'flex', gap: 8, marginLeft: 42, marginBottom: 16, animation: 'fadeSlide 0.3s ease' }}>
      <input ref={ref} value={val} onChange={e => setVal(e.target.value)} placeholder={placeholder}
        onKeyDown={e => { if (e.key === 'Enter' && val.trim()) { onSubmit(val.trim()); setVal(''); } }}
        style={{
          flex: 1, padding: '12px 16px', borderRadius: 100, fontSize: 15, border: '2px solid rgba(0,0,0,0.08)',
          fontFamily: "'DM Sans', sans-serif", outline: 'none', color: D,
        }}
        onFocus={e => e.target.style.borderColor = O}
        onBlur={e => e.target.style.borderColor = 'rgba(0,0,0,0.08)'}
      />
      <button onClick={() => { if (val.trim()) { onSubmit(val.trim()); setVal(''); } }} style={{
        width: 44, height: 44, borderRadius: '50%', border: 'none', background: val.trim() ? O : 'rgba(0,0,0,0.06)',
        color: 'white', fontSize: 18, cursor: val.trim() ? 'pointer' : 'default', transition: 'all 0.2s',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>{'\u2191'}</button>
    </div>
  );
}

function PhotoUpload({ onUpload }: { onUpload: (url: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div style={{ marginLeft: 42, marginBottom: 16, animation: 'fadeSlide 0.3s ease' }}>
      <button onClick={() => ref.current?.click()} style={{
        padding: '10px 20px', borderRadius: 100, border: '2px dashed rgba(0,0,0,0.12)',
        background: 'white', cursor: 'pointer', fontSize: 14, color: '#9B9490',
        fontFamily: "'DM Sans', sans-serif", display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <span style={{ fontSize: 18 }}>{'\uD83D\uDCF8'}</span> Add a photo (optional, helps diagnosis)
      </button>
      <input ref={ref} type="file" accept="image/*" hidden onChange={e => {
        if (e.target.files?.[0]) onUpload(URL.createObjectURL(e.target.files[0]));
      }} />
    </div>
  );
}

/* -- Diagnosis card shown before tier selection -- */
function DiagnosisSummary({ data }: { data: QuoteData }) {
  const cat = data.category ? CATEGORY_FLOWS[data.category] : null;
  return (
    <div style={{
      marginLeft: 42, marginBottom: 16, background: 'white', border: `2px solid ${G}22`,
      borderRadius: 16, overflow: 'hidden', animation: 'fadeSlide 0.4s ease',
    }}>
      <div style={{ background: `${G}10`, padding: '12px 16px', borderBottom: `1px solid ${G}22`, display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: G }} />
        <span style={{ fontSize: 13, fontWeight: 600, color: G }}>AI diagnosis ready</span>
      </div>
      <div style={{ padding: '16px' }}>
        <div style={{ fontWeight: 700, fontSize: 16, color: D, marginBottom: 8 }}>{cat?.icon} {data.a1} — {data.a2}</div>
        <div style={{ fontSize: 14, color: '#6B6560', lineHeight: 1.6, marginBottom: 8 }}>
          {data.description || `${data.a2} in ${data.a1?.toLowerCase()}. ${data.a3}. ${data.extra ? `Additional info: ${data.extra}.` : ''}`}
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 12 }}>
          <div style={{ background: W, padding: '6px 12px', borderRadius: 8, fontSize: 13 }}>
            <span style={{ color: '#9B9490' }}>Category:</span> <span style={{ fontWeight: 600, color: D }}>{cat?.label}</span>
          </div>
          <div style={{ background: W, padding: '6px 12px', borderRadius: 8, fontSize: 13 }}>
            <span style={{ color: '#9B9490' }}>Zip:</span> <span style={{ fontWeight: 600, color: D }}>{data.zip}</span>
          </div>
          <div style={{ background: W, padding: '6px 12px', borderRadius: 8, fontSize: 13 }}>
            <span style={{ color: '#9B9490' }}>Timing:</span> <span style={{ fontWeight: 600, color: D }}>{data.timing}</span>
          </div>
        </div>
        <p style={{ fontSize: 12, color: '#9B9490', marginTop: 12, lineHeight: 1.5 }}>
          This diagnosis will be shared with providers so they can give you an accurate quote — no need to explain twice.
        </p>
      </div>
    </div>
  );
}

/* -- Tier selection as chat bubbles -- */
function TierCards({ onSelect }: { onSelect: (t: typeof TIERS[number]) => void }) {
  return (
    <div style={{ marginLeft: 42, display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16, animation: 'fadeSlide 0.3s ease' }}>
      {TIERS.map(t => (
        <button key={t.id} onClick={() => onSelect(t)} style={{
          display: 'flex', alignItems: 'center', padding: '14px 18px', borderRadius: 14, cursor: 'pointer',
          border: t.popular ? `2px solid ${O}` : '2px solid rgba(0,0,0,0.06)',
          background: t.popular ? 'rgba(232,99,43,0.03)' : 'white',
          textAlign: 'left', position: 'relative', transition: 'all 0.15s',
        }}
          onMouseEnter={e => { if (!t.popular) e.currentTarget.style.borderColor = 'rgba(0,0,0,0.15)'; }}
          onMouseLeave={e => { if (!t.popular) e.currentTarget.style.borderColor = 'rgba(0,0,0,0.06)'; }}
        >
          {t.popular && <div style={{ position: 'absolute', top: -9, right: 14, background: O, color: 'white', fontSize: 10, fontWeight: 700, padding: '2px 10px', borderRadius: 100 }}>RECOMMENDED</div>}
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 16, color: D }}>{t.name} <span style={{ fontWeight: 400, color: '#9B9490', fontSize: 13 }}>· {t.time}</span></div>
            <div style={{ fontSize: 13, color: '#9B9490', marginTop: 2 }}>{t.detail}</div>
          </div>
          <div style={{ fontFamily: "'Fraunces', serif", fontSize: 24, fontWeight: 700, color: t.popular ? O : D }}>{t.price}</div>
        </button>
      ))}
    </div>
  );
}

/* -- Outreach live view -- */
function OutreachView() {
  const [log, setLog] = useState<typeof OUTREACH_LOG>([]);
  const [providers, setProviders] = useState<typeof MOCK_PROVIDERS>([]);
  const [done, setDone] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [stats, setStats] = useState({ contacted: 0, responded: 0 });
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timers = OUTREACH_LOG.map((e) => setTimeout(() => {
      setLog(p => [...p, e]);
      if (['voice', 'sms', 'web'].includes(e.type)) setStats(s => ({ ...s, contacted: s.contacted + 1 }));
      if (e.type === 'success') setStats(s => ({ ...s, responded: s.responded + 1 }));
      if (e.type === 'done') setDone(true);
    }, e.t));
    const pt = MOCK_PROVIDERS.map(p => setTimeout(() => setProviders(prev => [...prev, p]), p.delay));
    return () => { timers.forEach(clearTimeout); pt.forEach(clearTimeout); };
  }, []);

  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [log]);

  return (
    <>
      {/* Compact stats */}
      <div style={{ marginLeft: 42, display: 'flex', gap: 8, marginBottom: 12, animation: 'fadeSlide 0.3s ease' }}>
        {[
          { label: 'Contacted', val: stats.contacted, icon: '\uD83D\uDCE1' },
          { label: 'Quoted', val: stats.responded, icon: '\u2705' },
          { label: 'Voice', val: log.filter(l => l.type === 'voice').length, icon: '\uD83D\uDCDE' },
          { label: 'SMS', val: log.filter(l => l.type === 'sms').length, icon: '\uD83D\uDCAC' },
        ].map((s, i) => (
          <div key={i} style={{ flex: 1, background: W, borderRadius: 10, padding: '10px 8px', textAlign: 'center' }}>
            <div style={{ fontSize: 14 }}>{s.icon}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: D }}>{s.val}</div>
            <div style={{ fontSize: 10, color: '#9B9490' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Live log */}
      <div style={{ marginLeft: 42, marginBottom: 16, animation: 'fadeSlide 0.3s ease' }}>
        <div ref={logRef} style={{
          background: D, borderRadius: 14, padding: 14, maxHeight: 160, overflowY: 'auto',
          fontFamily: "'DM Mono', monospace", fontSize: 12, lineHeight: 1.9,
        }}>
          {log.map((e, i) => (
            <div key={i} style={{
              color: e.type === 'success' ? G : e.type === 'decline' ? '#E24B4A' : e.type === 'fallback' ? '#EF9F27' : e.type === 'done' ? G : 'rgba(255,255,255,0.45)',
              animation: 'fadeIn 0.2s ease',
            }}>
              {e.type === 'success' ? '\u2713 ' : e.type === 'decline' ? '\u2717 ' : e.type === 'fallback' ? '\u21BB ' : '  '}{e.msg}
            </div>
          ))}
          {!done && <span style={{ color: O, animation: 'pulse 1s infinite' }}>{'\u258C'}</span>}
        </div>
      </div>

      {/* Provider cards */}
      {providers.map((p, i) => (
        <div key={i} style={{ marginLeft: 42, marginBottom: 10, animation: 'fadeSlide 0.4s ease' }}>
          <div onClick={() => setSelected(selected === i ? null : i)} style={{
            background: 'white', borderRadius: 14, padding: '16px 18px', cursor: 'pointer',
            border: selected === i ? `2px solid ${O}` : '1px solid rgba(0,0,0,0.06)',
            boxShadow: selected === i ? `0 4px 20px ${O}18` : '0 1px 4px rgba(0,0,0,0.03)',
            transition: 'all 0.2s',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <div>
                <span style={{ fontWeight: 700, fontSize: 16, color: D }}>{p.name}</span>
                <span style={{ color: '#9B9490', fontSize: 13, marginLeft: 8 }}>{'\u2605'} {p.rating} ({p.reviews}) · {p.distance}</span>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontFamily: "'Fraunces', serif", fontSize: 24, fontWeight: 700, color: O }}>{p.quote}</span>
                <div style={{ fontSize: 11, color: '#9B9490', fontWeight: 500 }}>estimate</div>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 14, color: D }}>{'\uD83D\uDCC5'} {p.availability}</span>
              <span style={{ background: W, padding: '2px 10px', borderRadius: 100, fontSize: 11, color: '#9B9490' }}>via {p.channel}</span>
            </div>
            {p.note && <div style={{ fontSize: 13, color: '#6B6560', fontStyle: 'italic', marginTop: 6 }}>"{p.note}"</div>}
            {selected === i && (
              <button style={{
                marginTop: 14, width: '100%', padding: '13px 0', borderRadius: 100, border: 'none',
                background: O, color: 'white', fontSize: 16, fontWeight: 600, cursor: 'pointer',
                fontFamily: "'DM Sans', sans-serif", boxShadow: `0 4px 16px ${O}40`,
              }}>Book {p.name.split(' ')[0]}</button>
            )}
          </div>
        </div>
      ))}

      {done && providers.length > 0 && selected === null && (
        <div style={{ marginLeft: 42, textAlign: 'center', color: '#9B9490', fontSize: 14, marginTop: 8 }}>{'\u2191'} Tap a provider to book</div>
      )}
    </>
  );
}

/* -- MAIN COMPONENT -- */
export default function GetQuotes() {
  const navigate = useNavigate();
  const [messages, setMessages] = useState<{ role: string; text: string }[]>([]);
  const [phase, setPhase] = useState('greeting');
  const [data, setData] = useState<QuoteData>({ category: null, a1: null, a2: null, a3: null, extra: null, photo: null, zip: '', timing: null, tier: null });
  const bottomRef = useRef<HTMLDivElement>(null);

  const scrollDown = () => setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);

  const addAssistant = useCallback((text: string) => {
    setMessages(m => [...m, { role: 'assistant', text }]);
    scrollDown();
  }, []);

  const addUser = useCallback((text: string) => {
    setMessages(m => [...m, { role: 'user', text }]);
    scrollDown();
  }, []);

  // Greeting on mount
  useEffect(() => {
    const t = setTimeout(() => {
      addAssistant("Hey! \uD83D\uDC4B I'm Homie. Let's get you some quotes. What kind of help do you need?");
      setPhase('category');
    }, 400);
    return () => clearTimeout(t);
  }, [addAssistant]);

  const flow = data.category ? CATEGORY_FLOWS[data.category] : null;

  const handleCategory = (cat: string | CatOption) => {
    const id = typeof cat === 'string' ? cat : cat.id;
    const c = CATEGORY_FLOWS[id];
    setData(d => ({ ...d, category: id }));
    addUser(c.label);
    setTimeout(() => { addAssistant(c.q1.text); setPhase('q1'); }, 500);
  };

  const handleQ1 = (answer: string) => {
    setData(d => ({ ...d, a1: answer }));
    addUser(answer);
    setTimeout(() => { addAssistant(flow!.q2.text); setPhase('q2'); }, 500);
  };

  const handleQ2 = (answer: string) => {
    setData(d => ({ ...d, a2: answer }));
    addUser(answer);
    setTimeout(() => { addAssistant(flow!.q3.text); setPhase('q3'); }, 500);
  };

  const handleQ3 = (answer: string) => {
    setData(d => ({ ...d, a3: answer }));
    addUser(answer);
    setTimeout(() => { addAssistant("Got it. Anything else you want the pro to know? You can also add a photo. Or just skip ahead."); setPhase('extra'); }, 500);
  };

  const handleExtra = (text: string) => {
    setData(d => ({ ...d, extra: text }));
    addUser(text);
    goToZip();
  };

  const handlePhoto = (url: string) => {
    setData(d => ({ ...d, photo: url }));
    setMessages(m => [...m, { role: 'user', text: '\uD83D\uDCF8 Photo added' }]);
    scrollDown();
  };

  const goToZip = () => {
    setTimeout(() => { addAssistant("Almost there \u2014 what's your zip code?"); setPhase('zip'); }, 500);
  };

  const handleZip = (zip: string) => {
    setData(d => ({ ...d, zip }));
    addUser(zip);
    setTimeout(() => { addAssistant('When do you need this done?'); setPhase('timing'); }, 500);
  };

  const handleTiming = (t: string) => {
    setData(d => ({ ...d, timing: t }));
    addUser(t);
    setTimeout(() => {
      addAssistant("Nice \u2014 I've got a solid picture. Here's what I'll brief the providers on:");
      setTimeout(() => {
        setPhase('diagnosis');
        scrollDown();
        setTimeout(() => {
          setMessages(m => [...m, { role: 'assistant', text: 'How fast do you want quotes? Pick a speed:' }]);
          setPhase('tier');
          scrollDown();
        }, 1500);
      }, 400);
    }, 500);
  };

  const handleTier = (t: typeof TIERS[number]) => {
    setData(d => ({ ...d, tier: t.id }));
    addUser(`${t.name} \u2014 ${t.price}`);
    setTimeout(() => {
      addAssistant('Launching your AI agent now. Watch this \uD83D\uDC47');
      setPhase('outreach');
      scrollDown();
    }, 500);
  };

  const handleSkip = () => {
    addUser("Skip \u2014 let's go");
    goToZip();
  };

  const catOptions: CatOption[] = Object.entries(CATEGORY_FLOWS).map(([id, c]) => ({ id, icon: c.icon, label: c.label }));

  return (
    <div style={{ minHeight: '100vh', background: 'white', fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`
        @keyframes fadeSlide { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
        @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
        @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.4; } }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.1); border-radius: 4px; }
      `}</style>

      {/* Header */}
      <nav style={{
        position: 'sticky', top: 0, zIndex: 50, background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(10px)',
        padding: '0 20px', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderBottom: '1px solid rgba(0,0,0,0.05)',
      }}>
        <span onClick={() => navigate('/')} style={{ fontFamily: "'Fraunces', serif", fontSize: 22, fontWeight: 700, color: O, cursor: 'pointer' }}>homie</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#1B9E77', boxShadow: '0 0 0 3px rgba(27,158,119,0.15)' }} />
            <span style={{ fontSize: 13, color: '#1B9E77', fontWeight: 600 }}>Online</span>
          </div>
          {authService.isAuthenticated() ? (
            <button onClick={() => { authService.logout(); window.location.reload(); }} style={{
              background: 'none', border: '1.5px solid rgba(0,0,0,0.1)', borderRadius: 100,
              padding: '6px 16px', fontSize: 13, fontWeight: 500, color: '#9B9490', cursor: 'pointer',
              fontFamily: "'DM Sans', sans-serif",
            }}>Sign out</button>
          ) : (
            <button onClick={() => navigate('/login')} style={{
              background: '#E8632B', border: 'none', borderRadius: 100,
              padding: '7px 18px', fontSize: 13, fontWeight: 600, color: 'white', cursor: 'pointer',
              fontFamily: "'DM Sans', sans-serif",
            }}>Sign in</button>
          )}
        </div>
      </nav>

      {/* Chat area */}
      <div style={{ maxWidth: 600, margin: '0 auto', padding: '24px 16px 120px' }}>
        {messages.map((m, i) => (
          m.role === 'assistant'
            ? <AssistantMsg key={i} text={m.text} animate={i === messages.length - 1} />
            : <UserMsg key={i} text={m.text} />
        ))}

        {(phase === 'diagnosis' || phase === 'tier' || phase === 'outreach') && data.a1 && <DiagnosisSummary data={data} />}

        {phase === 'category' && <QuickReplies options={catOptions} onSelect={(opt) => handleCategory(opt as CatOption)} columns={3} />}
        {phase === 'q1' && flow && <QuickReplies options={flow.q1.options} onSelect={(opt) => handleQ1(opt as string)} />}
        {phase === 'q2' && flow && <QuickReplies options={flow.q2.options} onSelect={(opt) => handleQ2(opt as string)} />}
        {phase === 'q3' && flow && <QuickReplies options={flow.q3.options} onSelect={(opt) => handleQ3(opt as string)} />}
        {phase === 'extra' && (
          <>
            <TextInput placeholder="Any other details..." onSubmit={handleExtra} />
            <PhotoUpload onUpload={handlePhoto} />
            <div style={{ marginLeft: 42, marginBottom: 16 }}>
              <button onClick={handleSkip} style={{
                padding: '8px 18px', borderRadius: 100, border: 'none', background: 'rgba(0,0,0,0.04)',
                color: '#9B9490', fontSize: 14, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
              }}>Skip — let's go →</button>
            </div>
          </>
        )}
        {phase === 'zip' && <TextInput placeholder="Enter zip code..." onSubmit={handleZip} />}
        {phase === 'timing' && <QuickReplies options={['ASAP', 'This week', 'This month', 'Flexible']} onSelect={(opt) => handleTiming(opt as string)} />}
        {phase === 'tier' && <TierCards onSelect={handleTier} />}
        {phase === 'outreach' && <OutreachView />}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}
