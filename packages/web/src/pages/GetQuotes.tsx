import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { diagnosticService } from '@/services/api';
import AvatarDropdown from '@/components/AvatarDropdown';

const O = '#E8632B', G = '#1B9E77', D = '#2D2926', W = '#F9F5F2';

/* -- Category-specific follow-up questions -- */
const CATEGORY_FLOWS: Record<string, {
  icon: string; label: string; group: 'repair' | 'service';
  q1: { text: string; options: string[] };
  q2: { text: string; options: string[] };
  q3: { text: string; options: string[] };
}> = {
  // ── Repair ──
  plumbing: {
    icon: '\uD83D\uDD27', label: 'Plumbing', group: 'repair',
    q1: { text: "Where's the issue?", options: ['Kitchen', 'Bathroom', 'Laundry', 'Water heater', 'Outdoor', 'Other'] },
    q2: { text: "What's happening?", options: ['Leaking/dripping', 'Clogged/slow drain', 'No hot water', 'Running toilet', 'Low pressure', 'Burst/flooding'] },
    q3: { text: 'How urgent is this?', options: ['Water is actively leaking', "It works but something's wrong", 'Just noticed it', 'Been like this a while'] },
  },
  electrical: {
    icon: '\u26A1', label: 'Electrical', group: 'repair',
    q1: { text: "What's the problem?", options: ['Outlet not working', 'Lights flickering', 'Breaker tripping', 'Sparking/burning smell', 'Need new install', 'Other'] },
    q2: { text: 'Where in the home?', options: ['One room', 'Multiple rooms', 'Whole house', 'Outdoor/garage', 'Panel/breaker box'] },
    q3: { text: 'Is there any safety concern?', options: ['Burning smell or sparks', 'Exposed wires', 'Water near electrical', 'No safety concern'] },
  },
  hvac: {
    icon: '\u2744\uFE0F', label: 'HVAC', group: 'repair',
    q1: { text: "What's going on?", options: ['AC not cooling', 'Heat not working', 'Strange noises', 'Thermostat issue', 'Bad smell from vents', 'Maintenance/tune-up'] },
    q2: { text: 'What type of system?', options: ['Central AC', 'Mini split', 'Window unit', 'Furnace', 'Heat pump', 'Not sure'] },
    q3: { text: 'How old is the system?', options: ['Under 5 years', '5\u201310 years', '10\u201315 years', '15+ years', 'No idea'] },
  },
  appliance: {
    icon: '\uD83C\uDF73', label: 'Appliance', group: 'repair',
    q1: { text: 'Which appliance?', options: ['Washer', 'Dryer', 'Dishwasher', 'Refrigerator', 'Oven/stove', 'Garbage disposal', 'Other'] },
    q2: { text: "What's it doing?", options: ["Won't turn on", 'Leaking water', 'Making noise', 'Not completing cycle', 'Error code showing', 'Other'] },
    q3: { text: 'Do you know the brand?', options: ['GE', 'Whirlpool', 'Samsung', 'LG', 'Maytag', 'Bosch', 'Other', 'Not sure'] },
  },
  roofing: {
    icon: '\uD83C\uDFE0', label: 'Roofing', group: 'repair',
    q1: { text: "What's the concern?", options: ['Active leak inside', 'Missing/damaged shingles', 'Gutter issue', 'Storm damage', 'General inspection', 'Other'] },
    q2: { text: 'Roof type?', options: ['Asphalt shingles', 'Tile', 'Metal', 'Flat/low slope', 'Not sure'] },
    q3: { text: 'How old is the roof?', options: ['Under 5 years', '5\u201315 years', '15\u201325 years', '25+ years', 'No idea'] },
  },
  general: {
    icon: '\uD83D\uDD28', label: 'Handyman', group: 'repair',
    q1: { text: 'What kind of work?', options: ['Drywall repair', 'Door/window issue', 'Fence repair', 'Furniture assembly', 'Other'] },
    q2: { text: 'How big is the job?', options: ['Quick fix (under 1 hour)', 'Half-day job', 'Full day or more', 'Not sure'] },
    q3: { text: 'Anything else important?', options: ['Need it done ASAP', 'Can wait a bit', 'Just getting a price', 'Multiple small jobs'] },
  },
  garage_door: {
    icon: '\uD83D\uDEA8', label: 'Garage Door', group: 'repair',
    q1: { text: "What's the issue?", options: ['Won\'t open/close', 'Making noise', 'Off track', 'Opener broken', 'Spring snapped', 'Other'] },
    q2: { text: 'Door type?', options: ['Single car', 'Double car', 'Not sure'] },
    q3: { text: 'How urgent is this?', options: ['Car is stuck inside', 'Door is stuck open', 'Still works but struggling', 'Just getting a quote'] },
  },
  // ── Services ──
  house_cleaning: {
    icon: '\u2728', label: 'House Cleaning', group: 'service',
    q1: { text: 'What type of cleaning?', options: ['Regular cleaning', 'Deep clean', 'Move-in/move-out', 'Post-construction', 'One-time', 'Other'] },
    q2: { text: 'Home size?', options: ['Studio/1 bed', '2 bedrooms', '3 bedrooms', '4+ bedrooms', 'Not sure'] },
    q3: { text: 'How often?', options: ['One-time', 'Weekly', 'Bi-weekly', 'Monthly', 'Just want a quote'] },
  },
  landscaping: {
    icon: '\uD83C\uDF3F', label: 'Landscaping', group: 'service',
    q1: { text: 'What do you need?', options: ['Lawn mowing', 'Garden design', 'Tree trimming', 'Hedge trimming', 'Yard cleanup', 'Sprinkler repair', 'Other'] },
    q2: { text: 'Yard size?', options: ['Small (under 1/4 acre)', 'Medium (1/4\u20131/2 acre)', 'Large (1/2+ acre)', 'Not sure'] },
    q3: { text: 'How often?', options: ['One-time', 'Weekly', 'Bi-weekly', 'Monthly', 'Seasonal'] },
  },
  pool: {
    icon: '\uD83C\uDFCA', label: 'Pool Service', group: 'service',
    q1: { text: 'What do you need?', options: ['Regular cleaning', 'Green/cloudy water', 'Equipment repair', 'Opening/closing', 'Leak detection', 'Other'] },
    q2: { text: 'Pool type?', options: ['In-ground', 'Above-ground', 'Spa/hot tub', 'Not sure'] },
    q3: { text: 'How often?', options: ['One-time', 'Weekly service', 'Monthly', 'Just need a repair'] },
  },
  pest_control: {
    icon: '\uD83D\uDC1B', label: 'Pest Control', group: 'service',
    q1: { text: 'What kind of pest?', options: ['Ants', 'Roaches', 'Mice/rats', 'Termites', 'Spiders', 'Wasps/bees', 'Bed bugs', 'Other'] },
    q2: { text: 'Where are you seeing them?', options: ['Kitchen', 'Bathroom', 'Bedroom', 'Garage', 'Yard/exterior', 'Multiple areas'] },
    q3: { text: 'How bad is it?', options: ['Just noticed one or two', 'Seeing them regularly', 'Major infestation', 'Want preventive treatment'] },
  },
  painting: {
    icon: '\uD83C\uDFA8', label: 'Painting', group: 'service',
    q1: { text: 'Interior or exterior?', options: ['Interior', 'Exterior', 'Both', 'Cabinet painting', 'Other'] },
    q2: { text: 'How much needs painting?', options: ['One room', '2\u20133 rooms', 'Whole interior', 'Full exterior', 'Touch-ups only'] },
    q3: { text: 'Any prep work needed?', options: ['Walls are ready to paint', 'Some patching/sanding', 'Wallpaper removal', 'Not sure'] },
  },
  moving: {
    icon: '\uD83D\uDE9A', label: 'Moving', group: 'service',
    q1: { text: 'What kind of move?', options: ['Full home move', 'Apartment move', 'Few large items', 'Junk removal', 'Storage pickup/delivery', 'Other'] },
    q2: { text: 'Move size?', options: ['Studio/1 bed', '2 bedrooms', '3+ bedrooms', 'Just a few items'] },
    q3: { text: 'How far?', options: ['Same building', 'Within 10 miles', '10\u201350 miles', '50+ miles', 'Not sure'] },
  },
  pressure_washing: {
    icon: '\uD83D\uDCA6', label: 'Pressure Wash', group: 'service',
    q1: { text: 'What needs washing?', options: ['Driveway', 'Patio/deck', 'House siding', 'Fence', 'Roof', 'Multiple areas'] },
    q2: { text: 'Surface material?', options: ['Concrete', 'Wood', 'Brick', 'Vinyl siding', 'Stone', 'Not sure'] },
    q3: { text: 'Approximate area?', options: ['Small (under 500 sq ft)', 'Medium (500\u20131,000 sq ft)', 'Large (1,000+ sq ft)', 'Not sure'] },
  },
  locksmith: {
    icon: '\uD83D\uDD11', label: 'Locksmith', group: 'service',
    q1: { text: 'What do you need?', options: ['Locked out', 'Rekey locks', 'New lock install', 'Lock repair', 'Smart lock setup', 'Other'] },
    q2: { text: 'What type?', options: ['Front door', 'Car', 'Garage', 'Mailbox/safe', 'Multiple doors'] },
    q3: { text: 'How urgent is this?', options: ['Locked out right now', 'Today', 'This week', 'Just getting a price'] },
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
  aiFollowUp: string | null;
  aiDiagnosis: string | null;
  extra: string | null;
  photo: string | null;
  zip: string;
  timing: string | null;
  tier: string | null;
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
  const isCatGrid = columns && columns >= 4;
  return (
    <div className={isCatGrid ? 'gq-cat-grid' : 'gq-replies'} style={{
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
        <div style={{ fontWeight: 700, fontSize: 16, color: D, marginBottom: 8 }}>{cat?.icon} {cat?.label} — {data.a1}</div>
        <div style={{ fontSize: 14, color: '#6B6560', lineHeight: 1.6, marginBottom: 8, whiteSpace: 'pre-wrap' }}>
          {data.aiDiagnosis || `${data.a1}. ${data.extra ? `Additional info: ${data.extra}.` : ''}`}
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
  const [data, setData] = useState<QuoteData>({ category: null, a1: null, aiFollowUp: null, aiDiagnosis: null, extra: null, photo: null, zip: '', timing: null, tier: null });
  const [streaming, setStreaming] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const sessionIdRef = useRef(crypto.randomUUID());
  const abortRef = useRef<AbortController | null>(null);

  const scrollDown = () => setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);

  const addAssistant = useCallback((text: string) => {
    setMessages(m => [...m, { role: 'assistant', text }]);
    scrollDown();
  }, []);

  const addUser = useCallback((text: string) => {
    setMessages(m => [...m, { role: 'user', text }]);
    scrollDown();
  }, []);

  // Stream an AI message and call onDone with the full text when complete
  const streamAI = useCallback((userMsg: string, history: { role: 'user' | 'assistant'; content: string }[], onDone: (fullText: string) => void) => {
    setStreaming(true);
    const streamMsgId = `ai-${Date.now()}`;
    setMessages(m => [...m, { role: 'assistant', text: '', id: streamMsgId } as { role: string; text: string }]);
    scrollDown();

    let fullText = '';
    abortRef.current = diagnosticService.sendMessage(
      sessionIdRef.current,
      userMsg,
      {
        onToken: (token: string) => {
          fullText += token;
          setMessages(m => m.map(msg => ('id' in msg && (msg as { id?: string }).id === streamMsgId) ? { ...msg, text: fullText } : msg));
          scrollDown();
        },
        onDiagnosis: () => {},
        onJobSummary: () => {},
        onDone: () => { setStreaming(false); onDone(fullText); },
        onError: (err: Error) => {
          setStreaming(false);
          console.error('[GetQuotes AI]', err);
          setMessages(m => m.map(msg => ('id' in msg && (msg as { id?: string }).id === streamMsgId) ? { ...msg, text: 'Sorry, I had trouble analyzing that. Let me continue with what I have.' } : msg));
          onDone('');
        },
      },
      undefined,
      history,
    );
  }, []);

  // Greeting on mount
  useEffect(() => {
    const t = setTimeout(() => {
      addAssistant("Hey! \uD83D\uDC4B I'm Homie. Let's get you some quotes. What kind of help do you need?");
      setPhase('category');
    }, 400);
    return () => clearTimeout(t);
  }, [addAssistant]);

  useEffect(() => {
    return () => { abortRef.current?.abort(); };
  }, []);

  const flow = data.category ? CATEGORY_FLOWS[data.category] : null;

  const handleCategory = (cat: string | CatOption) => {
    const id = typeof cat === 'string' ? cat : cat.id;
    const c = CATEGORY_FLOWS[id];
    setData(d => ({ ...d, category: id }));
    setPhase('waiting');
    addUser(c.label);
    setTimeout(() => { addAssistant(c.q1.text); setPhase('q1'); }, 500);
  };

  const handleQ1 = (answer: string) => {
    setData(d => ({ ...d, a1: answer }));
    setPhase('waiting');
    addUser(answer);

    // Send context to AI for a smart follow-up question
    const cat = data.category ? CATEGORY_FLOWS[data.category] : null;
    const context = `I need help with ${cat?.label}. Specifically: ${answer}.`;
    const history: { role: 'user' | 'assistant'; content: string }[] = [
      { role: 'user', content: context },
    ];

    setTimeout(() => {
      streamAI(
        `The homeowner needs ${cat?.label} help. They said: "${answer}". Ask ONE brief, specific follow-up question to better understand the issue so we can match them with the right pro. Keep it under 2 sentences. Do not offer to fix it — we are finding them a provider.`,
        history,
        (aiText) => {
          setData(d => ({ ...d, aiFollowUp: aiText }));
          setPhase('ai_response');
          scrollDown();
        },
      );
    }, 300);
  };

  const handleAIResponse = (answer: string) => {
    setData(d => ({ ...d, aiFollowUp: d.aiFollowUp, extra: answer }));
    setPhase('waiting');
    addUser(answer);
    setTimeout(() => {
      addAssistant("Anything else you want the pro to know? You can also add a photo to help with the diagnosis.");
      setPhase('extra');
      scrollDown();
    }, 500);
  };

  const handleExtraDetails = (text: string) => {
    setData(d => ({ ...d, extra: (d.extra ? d.extra + '. ' : '') + text }));
    setPhase('waiting');
    addUser(text);
    generateDiagnosis();
  };

  const handleSkipExtra = () => {
    setPhase('waiting');
    addUser("That's everything");
    generateDiagnosis();
  };

  const generateDiagnosis = () => {
    const cat = data.category ? CATEGORY_FLOWS[data.category] : null;
    const history: { role: 'user' | 'assistant'; content: string }[] = [
      { role: 'user', content: `I need ${cat?.label} help: ${data.a1}` },
      { role: 'assistant', content: data.aiFollowUp || '' },
      { role: 'user', content: data.extra || '' },
    ];

    setStreaming(true);
    let diagText = '';
    setTimeout(() => {
      abortRef.current = diagnosticService.sendMessage(
        sessionIdRef.current,
        'Based on this conversation, write a 2-3 sentence summary of what the homeowner needs, suitable for briefing a service provider. Be specific and factual. Do not ask questions. Start with what the issue is.',
        {
          onToken: (token: string) => { diagText += token; },
          onDiagnosis: () => {},
          onJobSummary: () => {},
          onDone: () => {
            setStreaming(false);
            setData(d => ({ ...d, aiDiagnosis: diagText }));
            setTimeout(() => {
              addAssistant("Got it \u2014 what's your zip code so I can find pros near you?");
              setPhase('zip');
              scrollDown();
            }, 300);
          },
          onError: () => {
            setStreaming(false);
            setData(d => ({ ...d, aiDiagnosis: `${cat?.label}: ${data.a1}. ${data.extra || ''}` }));
            setTimeout(() => {
              addAssistant("Got it \u2014 what's your zip code so I can find pros near you?");
              setPhase('zip');
              scrollDown();
            }, 300);
          },
        },
        undefined,
        history,
      );
    }, 300);
  };

  const handlePhoto = (url: string) => {
    setData(d => ({ ...d, photo: url }));
    setMessages(m => [...m, { role: 'user', text: '\uD83D\uDCF8 Photo added' }]);
    scrollDown();
  };

  const handleSkipAI = () => {
    setPhase('waiting');
    addUser("No, that covers it");
    setTimeout(() => {
      addAssistant("Anything else you want the pro to know? You can also add a photo to help with the diagnosis.");
      setPhase('extra');
      scrollDown();
    }, 500);
  };

  const handleZip = (zip: string) => {
    setData(d => ({ ...d, zip }));
    setPhase('waiting');
    addUser(zip);
    setTimeout(() => { addAssistant('When do you need this done?'); setPhase('timing'); }, 500);
  };

  const handleTiming = (t: string) => {
    setData(d => ({ ...d, timing: t }));
    setPhase('waiting');
    addUser(t);
    setTimeout(() => {
      addAssistant("Here's what I'll brief the providers on:");
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
    setPhase('waiting');
    addUser(`${t.name} \u2014 ${t.price}`);
    setTimeout(() => {
      addAssistant('Launching your AI agent now. Watch this \uD83D\uDC47');
      setPhase('outreach');
      scrollDown();
    }, 500);
  };

  const repairOptions: CatOption[] = Object.entries(CATEGORY_FLOWS).filter(([, c]) => c.group === 'repair').map(([id, c]) => ({ id, icon: c.icon, label: c.label }));
  const serviceOptions: CatOption[] = Object.entries(CATEGORY_FLOWS).filter(([, c]) => c.group === 'service').map(([id, c]) => ({ id, icon: c.icon, label: c.label }));

  return (
    <div style={{ minHeight: '100vh', background: 'white', fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`
        @keyframes fadeSlide { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
        @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
        @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.4; } }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.1); border-radius: 4px; }
        @media (max-width: 480px) {
          .gq-cat-grid { grid-template-columns: repeat(3, 1fr) !important; margin-left: 0 !important; }
          .gq-replies { margin-left: 0 !important; }
        }
      `}</style>

      {/* Header */}
      <nav style={{
        position: 'sticky', top: 0, zIndex: 50, background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(10px)',
        padding: '0 20px', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderBottom: '1px solid rgba(0,0,0,0.05)',
      }}>
        <span onClick={() => navigate('/')} style={{ fontFamily: "'Fraunces', serif", fontSize: 22, fontWeight: 700, color: O, cursor: 'pointer' }}>homie</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {(() => {
            const hour = new Date().getHours();
            const isBusinessHours = hour >= 8 && hour < 18;
            return isBusinessHours ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#1B9E77', boxShadow: '0 0 0 3px rgba(27,158,119,0.15)' }} />
                <span style={{ fontSize: 13, color: '#1B9E77', fontWeight: 600 }}>Online</span>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'default' }} title="Some businesses may not be reachable outside business hours. Quotes may take longer as a result.">
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#EF9F27', boxShadow: '0 0 0 3px rgba(239,159,39,0.15)' }} />
                <span style={{ fontSize: 12, color: '#EF9F27', fontWeight: 600 }}>After hours</span>
              </div>
            );
          })()}
          <AvatarDropdown />
        </div>
      </nav>

      {/* After hours notice */}
      {(() => {
        const hour = new Date().getHours();
        return (hour < 8 || hour >= 18) ? (
          <div style={{
            background: '#FFF8F0', borderBottom: '1px solid rgba(239,159,39,0.15)',
            padding: '10px 20px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            fontSize: 13, color: '#9B7A3C', lineHeight: 1.4, textAlign: 'center',
          }}>
            <span style={{ fontSize: 16, flexShrink: 0 }}>{'\uD83C\uDF19'}</span>
            <span>Some businesses may not be reachable outside business hours (8 AM – 6 PM). Quotes may take longer as a result.</span>
          </div>
        ) : null;
      })()}

      {/* Chat area */}
      <div style={{ maxWidth: 600, margin: '0 auto', padding: '24px 16px 120px' }}>
        {messages.map((m, i) => (
          m.role === 'assistant'
            ? <AssistantMsg key={i} text={m.text} animate={i === messages.length - 1} />
            : <UserMsg key={i} text={m.text} />
        ))}

        {(phase === 'diagnosis' || phase === 'tier' || phase === 'outreach') && data.a1 && <DiagnosisSummary data={data} />}

        {phase === 'category' && (
          <>
            <div style={{ marginLeft: 42, fontSize: 12, fontWeight: 600, color: '#9B9490', letterSpacing: '0.05em', marginBottom: 6, animation: 'fadeSlide 0.3s ease' }}>REPAIR</div>
            <QuickReplies options={repairOptions} onSelect={(opt) => handleCategory(opt as CatOption)} columns={4} />
            <div style={{ marginLeft: 42, fontSize: 12, fontWeight: 600, color: '#9B9490', letterSpacing: '0.05em', marginBottom: 6, animation: 'fadeSlide 0.3s ease' }}>SERVICES</div>
            <QuickReplies options={serviceOptions} onSelect={(opt) => handleCategory(opt as CatOption)} columns={4} />
          </>
        )}
        {phase === 'q1' && flow && <QuickReplies options={flow.q1.options} onSelect={(opt) => handleQ1(opt as string)} />}
        {phase === 'ai_response' && !streaming && (
          <>
            <TextInput placeholder="Type your answer..." onSubmit={handleAIResponse} />
            <div style={{ marginLeft: 42, marginBottom: 16 }}>
              <button onClick={handleSkipAI} style={{
                padding: '8px 18px', borderRadius: 100, border: 'none', background: 'rgba(0,0,0,0.04)',
                color: '#9B9490', fontSize: 14, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
              }}>No, that covers it →</button>
            </div>
          </>
        )}
        {phase === 'extra' && !streaming && (
          <>
            <TextInput placeholder="Any other details..." onSubmit={handleExtraDetails} />
            <PhotoUpload onUpload={handlePhoto} />
            <div style={{ marginLeft: 42, marginBottom: 16 }}>
              <button onClick={handleSkipExtra} style={{
                padding: '8px 18px', borderRadius: 100, border: 'none', background: 'rgba(0,0,0,0.04)',
                color: '#9B9490', fontSize: 14, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
              }}>Skip — that's everything →</button>
            </div>
          </>
        )}
        {phase === 'zip' && !streaming && <TextInput placeholder="Enter zip code..." onSubmit={handleZip} />}
        {phase === 'timing' && !streaming && <QuickReplies options={['ASAP', 'This week', 'This month', 'Flexible']} onSelect={(opt) => handleTiming(opt as string)} />}
        {phase === 'tier' && !streaming && <TierCards onSelect={handleTier} />}
        {phase === 'outreach' && <OutreachView />}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}
