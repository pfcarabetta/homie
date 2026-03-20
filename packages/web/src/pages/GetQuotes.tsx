import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

const O = '#E8632B', G = '#1B9E77', D = '#2D2926', W = '#F9F5F2';

const CATEGORIES = [
  { id: 'plumbing', label: 'Plumbing', icon: '\uD83D\uDD27', examples: 'Leaks, clogs, water heater, toilet, faucet' },
  { id: 'electrical', label: 'Electrical', icon: '\u26A1', examples: 'Outlets, breakers, wiring, lights, panel' },
  { id: 'hvac', label: 'HVAC', icon: '\u2744\uFE0F', examples: 'AC, heating, thermostat, ductwork, furnace' },
  { id: 'appliance', label: 'Appliance', icon: '\uD83C\uDF73', examples: 'Washer, dryer, dishwasher, fridge, oven' },
  { id: 'roofing', label: 'Roofing', icon: '\uD83C\uDFE0', examples: 'Leaks, shingles, gutters, flashing' },
  { id: 'general', label: 'Handyman', icon: '\uD83D\uDD28', examples: 'Drywall, painting, doors, windows, misc' },
];

const TIMING = [
  { id: 'asap', label: 'ASAP', sub: 'Today or tomorrow' },
  { id: 'this_week', label: 'This week', sub: 'Next few days' },
  { id: 'this_month', label: 'This month', sub: 'No rush' },
  { id: 'flexible', label: 'Flexible', sub: 'Whenever' },
];

const BUDGETS = ['Under $200', '$200\u2013500', '$500\u20131,000', '$1,000+', 'Not sure'];

const TIERS = [
  { id: 'standard', name: 'Standard', price: '$9.99', time: '~2 hours', providers: '5\u20138 pros', channels: 'SMS + Web', popular: false },
  { id: 'priority', name: 'Priority', price: '$19.99', time: '~30 min', providers: '10+ pros', channels: 'Voice + SMS + Web', popular: true },
  { id: 'emergency', name: 'Emergency', price: '$29.99', time: '~15 min', providers: '15+ pros', channels: 'All channels (blitz)', popular: false },
];

const MOCK_PROVIDERS = [
  { name: 'Rodriguez Plumbing', rating: 4.9, reviews: 214, quote: '$175', availability: 'Tomorrow 9\u201311 AM', channel: 'voice', note: 'Done hundreds of Moen cartridge swaps. Will bring the part.', distance: '4.2 mi', delay: 4000 },
  { name: 'Atlas Home Services', rating: 4.7, reviews: 89, quote: '$150\u2013200', availability: 'Wednesday afternoon', channel: 'sms', note: 'Can bring the part with me, 12 years experience', distance: '6.1 mi', delay: 7500 },
  { name: 'Quick Fix Pros', rating: 4.6, reviews: 156, quote: '$195', availability: 'Thursday 8\u201310 AM', channel: 'web', note: 'Licensed & insured, 15 years with Moen fixtures', distance: '3.8 mi', delay: 11000 },
];

const OUTREACH_LOG = [
  { t: 0, msg: 'Starting provider discovery...', type: 'system' },
  { t: 600, msg: 'Found 14 providers in your area', type: 'system' },
  { t: 1200, msg: 'Calling Rodriguez Plumbing...', type: 'voice' },
  { t: 1800, msg: 'Texting Atlas Home Services...', type: 'sms' },
  { t: 2400, msg: 'Calling SD Premier Plumbing...', type: 'voice' },
  { t: 3000, msg: 'Texting Mike\'s Plumbing Co...', type: 'sms' },
  { t: 3600, msg: 'Submitting form on quickfixpros.com', type: 'web' },
  { t: 4200, msg: 'Rodriguez Plumbing responded \u2014 quote received!', type: 'success' },
  { t: 5000, msg: 'Calling Coastal Plumbing...', type: 'voice' },
  { t: 5600, msg: 'Texting Pacific Home Repair...', type: 'sms' },
  { t: 6200, msg: 'SD Premier Plumbing \u2014 voicemail, sending SMS follow-up', type: 'fallback' },
  { t: 7000, msg: 'Submitting form on atlashomeservices.com', type: 'web' },
  { t: 7800, msg: 'Atlas Home Services responded \u2014 quote received!', type: 'success' },
  { t: 8500, msg: 'Texting Reliable Plumbing & Drain...', type: 'sms' },
  { t: 9200, msg: 'Mike\'s Plumbing \u2014 declined (booked this week)', type: 'decline' },
  { t: 10000, msg: 'Calling ABC Plumbing...', type: 'voice' },
  { t: 11200, msg: 'Quick Fix Pros responded \u2014 quote received!', type: 'success' },
  { t: 12000, msg: '3 quotes ready \u2014 here are your options', type: 'done' },
];

interface QuoteData {
  category: string;
  description: string;
  photos: string[];
  zip: string;
  timing: string;
  budget: string;
  tier: string;
}

/* -- Reusable bits -- */
function Pill({ children, active, onClick }: { children: React.ReactNode; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      padding: '10px 20px', borderRadius: 100, fontSize: 14, fontWeight: 500, cursor: 'pointer',
      fontFamily: "'DM Sans', sans-serif", border: active ? `2px solid ${O}` : '2px solid rgba(0,0,0,0.08)',
      background: active ? 'rgba(232,99,43,0.06)' : 'white', color: active ? O : D,
      transition: 'all 0.2s ease',
    }}>{children}</button>
  );
}

/* -- Step indicator -- */
function StepBar({ current }: { current: number }) {
  const labels = ['Issue', 'Details', 'Speed', 'Results'];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 40, width: '100%', maxWidth: 480 }}>
      {labels.map((label, i) => (
        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
          <div style={{
            width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 14, fontWeight: 600, fontFamily: "'DM Sans', sans-serif",
            background: i <= current ? O : 'rgba(0,0,0,0.06)',
            color: i <= current ? 'white' : '#9B9490',
            transition: 'all 0.3s ease',
          }}>{i < current ? '\u2713' : i + 1}</div>
          <span style={{
            fontSize: 11, fontWeight: 500, marginTop: 6,
            color: i <= current ? D : '#9B9490',
          }}>{label}</span>
          {i < labels.length - 1 && (
            <div style={{
              position: 'absolute', top: 15, left: 'calc(50% + 20px)', width: 'calc(100% - 40px)', height: 2,
              background: i < current ? O : 'rgba(0,0,0,0.06)', transition: 'background 0.4s ease',
            }} />
          )}
        </div>
      ))}
    </div>
  );
}

/* -- Step 1: Category + description -- */
function StepIssue({ data, onChange, onNext }: { data: QuoteData; onChange: (patch: Partial<QuoteData>) => void; onNext: () => void }) {
  const [dragActive, setDragActive] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const canProceed = data.category && data.description.trim().length > 10;

  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    const urls = Array.from(files).slice(0, 3).map(f => URL.createObjectURL(f));
    onChange({ photos: [...(data.photos || []), ...urls] });
  };

  return (
    <div style={{ animation: 'fadeSlide 0.4s ease' }}>
      <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: 32, fontWeight: 700, color: D, marginBottom: 8 }}>
        What do you need fixed?
      </h2>
      <p style={{ color: '#9B9490', fontSize: 16, marginBottom: 32 }}>Pick a category and describe the issue briefly</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 28 }}>
        {CATEGORIES.map(c => (
          <button key={c.id} onClick={() => onChange({ category: c.id })} style={{
            padding: '16px 12px', borderRadius: 14, cursor: 'pointer', textAlign: 'center',
            border: data.category === c.id ? `2px solid ${O}` : '2px solid rgba(0,0,0,0.06)',
            background: data.category === c.id ? 'rgba(232,99,43,0.04)' : 'white',
            transition: 'all 0.2s ease',
          }}>
            <div style={{ fontSize: 24, marginBottom: 6 }}>{c.icon}</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: D, fontFamily: "'DM Sans', sans-serif" }}>{c.label}</div>
            <div style={{ fontSize: 11, color: '#9B9490', marginTop: 2, lineHeight: 1.3 }}>{c.examples}</div>
          </button>
        ))}
      </div>

      <textarea
        value={data.description}
        onChange={e => onChange({ description: e.target.value })}
        placeholder="Describe the issue in a sentence or two... e.g., 'Kitchen faucet dripping from the base when turned on, single handle Moen, about 6 years old'"
        style={{
          width: '100%', minHeight: 100, padding: '16px 18px', borderRadius: 14, fontSize: 15,
          border: '2px solid rgba(0,0,0,0.08)', fontFamily: "'DM Sans', sans-serif", resize: 'vertical',
          outline: 'none', lineHeight: 1.6, color: D,
        }}
        onFocus={e => e.target.style.borderColor = O}
        onBlur={e => e.target.style.borderColor = 'rgba(0,0,0,0.08)'}
      />

      {/* Photo upload */}
      <div
        onDragOver={e => { e.preventDefault(); setDragActive(true); }}
        onDragLeave={() => setDragActive(false)}
        onDrop={e => { e.preventDefault(); setDragActive(false); handleFiles(e.dataTransfer.files); }}
        onClick={() => fileRef.current?.click()}
        style={{
          marginTop: 16, padding: (data.photos?.length) ? '12px' : '24px',
          borderRadius: 14, border: `2px dashed ${dragActive ? O : 'rgba(0,0,0,0.1)'}`,
          background: dragActive ? 'rgba(232,99,43,0.03)' : 'rgba(0,0,0,0.01)',
          cursor: 'pointer', textAlign: 'center', transition: 'all 0.2s',
        }}
      >
        <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={e => handleFiles(e.target.files)} />
        {data.photos?.length > 0 ? (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {data.photos.map((url, i) => (
              <div key={i} style={{ width: 72, height: 72, borderRadius: 10, overflow: 'hidden', position: 'relative' }}>
                <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                <button onClick={e => { e.stopPropagation(); onChange({ photos: data.photos.filter((_, j) => j !== i) }); }} style={{
                  position: 'absolute', top: 2, right: 2, width: 20, height: 20, borderRadius: '50%',
                  background: 'rgba(0,0,0,0.6)', color: 'white', border: 'none', fontSize: 12, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>\u00D7</button>
              </div>
            ))}
            <div style={{ width: 72, height: 72, borderRadius: 10, border: '2px dashed rgba(0,0,0,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9B9490', fontSize: 24 }}>+</div>
          </div>
        ) : (
          <>
            <div style={{ fontSize: 28, marginBottom: 8 }}>{'\uD83D\uDCF8'}</div>
            <div style={{ fontSize: 14, color: '#9B9490' }}>Drop photos here or click to upload <span style={{ color: '#bbb' }}>(optional)</span></div>
          </>
        )}
      </div>

      <button onClick={onNext} disabled={!canProceed} style={{
        marginTop: 28, width: '100%', padding: '16px 0', borderRadius: 100, fontSize: 17, fontWeight: 600,
        cursor: canProceed ? 'pointer' : 'not-allowed', fontFamily: "'DM Sans', sans-serif", border: 'none',
        background: canProceed ? O : 'rgba(0,0,0,0.08)', color: canProceed ? 'white' : '#9B9490',
        transition: 'all 0.2s',
      }}>Continue</button>
    </div>
  );
}

/* -- Step 2: Location, timing, budget -- */
function StepDetails({ data, onChange, onNext, onBack }: { data: QuoteData; onChange: (patch: Partial<QuoteData>) => void; onNext: () => void; onBack: () => void }) {
  const canProceed = data.zip?.length >= 5 && data.timing && data.budget;
  return (
    <div style={{ animation: 'fadeSlide 0.4s ease' }}>
      <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: 32, fontWeight: 700, color: D, marginBottom: 8 }}>
        A few quick details
      </h2>
      <p style={{ color: '#9B9490', fontSize: 16, marginBottom: 32 }}>So we find the right pros near you</p>

      <label style={{ display: 'block', marginBottom: 20 }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: D, marginBottom: 8, display: 'block' }}>Zip code</span>
        <input
          type="text" value={data.zip || ''} maxLength={5}
          onChange={e => onChange({ zip: e.target.value.replace(/\D/g, '') })}
          placeholder="92103"
          style={{
            width: '100%', padding: '14px 18px', borderRadius: 12, fontSize: 18, fontWeight: 500,
            border: '2px solid rgba(0,0,0,0.08)', fontFamily: "'DM Sans', sans-serif", outline: 'none',
            color: D, letterSpacing: '0.08em',
          }}
          onFocus={e => e.target.style.borderColor = O}
          onBlur={e => e.target.style.borderColor = 'rgba(0,0,0,0.08)'}
        />
      </label>

      <div style={{ marginBottom: 24 }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: D, marginBottom: 10, display: 'block' }}>When do you need this done?</span>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {TIMING.map(t => (
            <button key={t.id} onClick={() => onChange({ timing: t.id })} style={{
              flex: '1 1 auto', minWidth: 120, padding: '12px 16px', borderRadius: 12, cursor: 'pointer', textAlign: 'center',
              border: data.timing === t.id ? `2px solid ${O}` : '2px solid rgba(0,0,0,0.06)',
              background: data.timing === t.id ? 'rgba(232,99,43,0.04)' : 'white',
              transition: 'all 0.2s',
            }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: D, fontFamily: "'DM Sans', sans-serif" }}>{t.label}</div>
              <div style={{ fontSize: 12, color: '#9B9490' }}>{t.sub}</div>
            </button>
          ))}
        </div>
      </div>

      <div style={{ marginBottom: 28 }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: D, marginBottom: 10, display: 'block' }}>Budget range</span>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {BUDGETS.map(b => <Pill key={b} active={data.budget === b} onClick={() => onChange({ budget: b })}>{b}</Pill>)}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12 }}>
        <button onClick={onBack} style={{
          padding: '16px 28px', borderRadius: 100, fontSize: 16, fontWeight: 500, cursor: 'pointer',
          fontFamily: "'DM Sans', sans-serif", border: '2px solid rgba(0,0,0,0.08)', background: 'white', color: D,
        }}>Back</button>
        <button onClick={onNext} disabled={!canProceed} style={{
          flex: 1, padding: '16px 0', borderRadius: 100, fontSize: 17, fontWeight: 600,
          cursor: canProceed ? 'pointer' : 'not-allowed', fontFamily: "'DM Sans', sans-serif", border: 'none',
          background: canProceed ? O : 'rgba(0,0,0,0.08)', color: canProceed ? 'white' : '#9B9490',
        }}>Continue</button>
      </div>
    </div>
  );
}

/* -- Step 3: Tier selection -- */
function StepTier({ data, onChange, onNext, onBack }: { data: QuoteData; onChange: (patch: Partial<QuoteData>) => void; onNext: () => void; onBack: () => void }) {
  return (
    <div style={{ animation: 'fadeSlide 0.4s ease' }}>
      <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: 32, fontWeight: 700, color: D, marginBottom: 8 }}>
        How fast do you need quotes?
      </h2>
      <p style={{ color: '#9B9490', fontSize: 16, marginBottom: 32 }}>You only pay if we find you providers</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 28 }}>
        {TIERS.map(t => (
          <button key={t.id} onClick={() => onChange({ tier: t.id })} style={{
            display: 'flex', alignItems: 'center', padding: '20px 24px', borderRadius: 16, cursor: 'pointer',
            border: data.tier === t.id ? `2px solid ${O}` : '2px solid rgba(0,0,0,0.06)',
            background: data.tier === t.id ? 'rgba(232,99,43,0.03)' : 'white',
            textAlign: 'left', position: 'relative', transition: 'all 0.2s',
          }}>
            {t.popular && (
              <div style={{
                position: 'absolute', top: -10, right: 16, background: O, color: 'white',
                fontSize: 11, fontWeight: 700, padding: '3px 12px', borderRadius: 100,
              }}>MOST POPULAR</div>
            )}
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 18, color: D, fontFamily: "'DM Sans', sans-serif", marginBottom: 4 }}>{t.name}</div>
              <div style={{ fontSize: 13, color: '#9B9490' }}>{t.providers} \u00B7 {t.channels}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontFamily: "'Fraunces', serif", fontSize: 28, fontWeight: 700, color: data.tier === t.id ? O : D }}>{t.price}</div>
              <div style={{ fontSize: 13, color: '#9B9490' }}>{t.time}</div>
            </div>
            <div style={{
              width: 24, height: 24, borderRadius: '50%', marginLeft: 16, flexShrink: 0,
              border: data.tier === t.id ? `7px solid ${O}` : '2px solid rgba(0,0,0,0.15)',
              transition: 'all 0.2s',
            }} />
          </button>
        ))}
      </div>

      {/* Summary */}
      <div style={{ background: W, borderRadius: 14, padding: '16px 20px', marginBottom: 24 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#9B9490', marginBottom: 8, letterSpacing: '0.03em' }}>YOUR REQUEST</div>
        <div style={{ fontSize: 15, color: D, lineHeight: 1.6 }}>
          <span style={{ fontWeight: 600 }}>{CATEGORIES.find(c => c.id === data.category)?.label}</span> \u00B7 {data.zip} \u00B7 {TIMING.find(t => t.id === data.timing)?.label} \u00B7 {data.budget}
        </div>
        <div style={{ fontSize: 14, color: '#6B6560', marginTop: 4 }}>{data.description}</div>
      </div>

      <div style={{ display: 'flex', gap: 12 }}>
        <button onClick={onBack} style={{
          padding: '16px 28px', borderRadius: 100, fontSize: 16, fontWeight: 500, cursor: 'pointer',
          fontFamily: "'DM Sans', sans-serif", border: '2px solid rgba(0,0,0,0.08)', background: 'white', color: D,
        }}>Back</button>
        <button onClick={onNext} disabled={!data.tier} style={{
          flex: 1, padding: '16px 0', borderRadius: 100, fontSize: 17, fontWeight: 600,
          cursor: data.tier ? 'pointer' : 'not-allowed', fontFamily: "'DM Sans', sans-serif", border: 'none',
          background: data.tier ? O : 'rgba(0,0,0,0.08)', color: data.tier ? 'white' : '#9B9490',
          boxShadow: data.tier ? '0 4px 20px rgba(232,99,43,0.3)' : 'none',
        }}>
          Launch AI agent \u2014 {TIERS.find(t => t.id === data.tier)?.price || ''}
        </button>
      </div>
    </div>
  );
}

/* -- Step 4: Live outreach + results -- */
function StepOutreach({ data }: { data: QuoteData }) {
  const [log, setLog] = useState<typeof OUTREACH_LOG>([]);
  const [providers, setProviders] = useState<typeof MOCK_PROVIDERS>([]);
  const [stats, setStats] = useState({ found: 0, contacted: 0, responded: 0, declined: 0 });
  const [done, setDone] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [selectedProvider, setSelectedProvider] = useState<number | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timers = OUTREACH_LOG.map((entry) =>
      setTimeout(() => {
        setLog(prev => [...prev, entry]);
        if (entry.type === 'system' && entry.msg.includes('Found')) setStats(s => ({ ...s, found: 14 }));
        if (['voice', 'sms', 'web'].includes(entry.type)) setStats(s => ({ ...s, contacted: s.contacted + 1 }));
        if (entry.type === 'success') setStats(s => ({ ...s, responded: s.responded + 1 }));
        if (entry.type === 'decline') setStats(s => ({ ...s, declined: s.declined + 1 }));
        if (entry.type === 'done') setDone(true);
      }, entry.t)
    );
    const provTimers = MOCK_PROVIDERS.map((p) =>
      setTimeout(() => setProviders(prev => [...prev, p]), p.delay)
    );
    const tick = setInterval(() => setElapsed(e => e + 1), 1000);
    return () => { timers.forEach(clearTimeout); provTimers.forEach(clearTimeout); clearInterval(tick); };
  }, []);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [log]);

  return (
    <div style={{ animation: 'fadeSlide 0.4s ease' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        {!done ? (
          <div style={{ width: 12, height: 12, borderRadius: '50%', background: O, animation: 'pulse 1.2s infinite' }} />
        ) : (
          <div style={{ width: 12, height: 12, borderRadius: '50%', background: G }} />
        )}
        <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: 28, fontWeight: 700, color: D }}>
          {done ? `${providers.length} quotes ready` : 'Homie is working for you...'}
        </h2>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 24 }}>
        {[
          { label: 'Found', val: String(stats.found), color: D },
          { label: 'Contacted', val: String(stats.contacted), color: O },
          { label: 'Quoted', val: String(stats.responded), color: G },
          { label: 'Elapsed', val: `${elapsed}s`, color: D },
        ].map((s, i) => (
          <div key={i} style={{ background: W, borderRadius: 12, padding: '14px 12px', textAlign: 'center' }}>
            <div style={{ fontSize: 26, fontWeight: 700, color: s.color, fontFamily: "'DM Sans', sans-serif" }}>{s.val}</div>
            <div style={{ fontSize: 12, color: '#9B9490' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Channel breakdown */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {[
          { label: 'Voice', icon: '\uD83D\uDCDE', count: log.filter(l => l.type === 'voice').length },
          { label: 'SMS', icon: '\uD83D\uDCAC', count: log.filter(l => l.type === 'sms').length },
          { label: 'Web', icon: '\uD83C\uDF10', count: log.filter(l => l.type === 'web').length },
        ].map(ch => (
          <div key={ch.label} style={{
            flex: 1, background: 'white', border: '1px solid rgba(0,0,0,0.06)',
            borderRadius: 10, padding: '10px', textAlign: 'center',
          }}>
            <span style={{ fontSize: 16 }}>{ch.icon}</span>
            <span style={{ marginLeft: 6, fontWeight: 600, fontSize: 16, color: D }}>{ch.count}</span>
            <div style={{ fontSize: 11, color: '#9B9490' }}>{ch.label}</div>
          </div>
        ))}
      </div>

      {/* Live log */}
      <div ref={logRef} style={{
        background: D, borderRadius: 14, padding: '16px', maxHeight: 180, overflowY: 'auto',
        marginBottom: 24, fontFamily: "'DM Mono', monospace", fontSize: 12, lineHeight: 1.8,
      }}>
        {log.map((entry, i) => (
          <div key={i} style={{
            color: entry.type === 'success' ? G : entry.type === 'decline' ? '#E24B4A' :
                   entry.type === 'fallback' ? '#EF9F27' : entry.type === 'done' ? G : 'rgba(255,255,255,0.5)',
            animation: 'fadeIn 0.3s ease',
          }}>
            <span style={{ color: 'rgba(255,255,255,0.2)', marginRight: 8 }}>
              {String(Math.floor(entry.t / 60000)).padStart(2, '0')}:{String(Math.floor((entry.t % 60000) / 1000)).padStart(2, '0')}
            </span>
            {entry.type === 'success' ? '\u2713 ' : entry.type === 'decline' ? '\u2717 ' : entry.type === 'fallback' ? '\u21BB ' : '  '}
            {entry.msg}
          </div>
        ))}
        {!done && <span style={{ color: O, animation: 'pulse 1s infinite' }}>{'\u258C'}</span>}
      </div>

      {/* Provider results */}
      {providers.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <h3 style={{ fontFamily: "'Fraunces', serif", fontSize: 20, fontWeight: 600, color: D, marginBottom: 16 }}>
            {done ? 'Your quotes' : 'Quotes so far'}
          </h3>
          {providers.map((p, i) => (
            <div key={i} style={{
              background: 'white', borderRadius: 16, padding: '20px 24px', marginBottom: 12,
              border: selectedProvider === i ? `2px solid ${O}` : '1px solid rgba(0,0,0,0.06)',
              boxShadow: selectedProvider === i ? '0 4px 20px rgba(232,99,43,0.12)' : '0 2px 8px rgba(0,0,0,0.03)',
              cursor: 'pointer', transition: 'all 0.2s', animation: 'slideUp 0.4s ease',
            }} onClick={() => setSelectedProvider(i)}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 17, color: D, fontFamily: "'DM Sans', sans-serif" }}>{p.name}</div>
                  <div style={{ fontSize: 13, color: '#9B9490', marginTop: 2 }}>
                    \u2605 {p.rating} ({p.reviews} reviews) \u00B7 {p.distance}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontFamily: "'Fraunces', serif", fontSize: 28, fontWeight: 700, color: O }}>{p.quote}</div>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 14, color: D, fontWeight: 500 }}>{'\uD83D\uDCC5'} {p.availability}</span>
                <span style={{
                  background: W, padding: '3px 10px', borderRadius: 100, fontSize: 12, color: '#9B9490',
                }}>via {p.channel}</span>
              </div>
              {p.note && <div style={{ fontSize: 13, color: '#6B6560', fontStyle: 'italic', lineHeight: 1.5 }}>"{p.note}"</div>}

              {selectedProvider === i && (
                <button style={{
                  marginTop: 16, width: '100%', padding: '14px 0', borderRadius: 100, fontSize: 16, fontWeight: 600,
                  cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", border: 'none',
                  background: O, color: 'white', boxShadow: '0 4px 16px rgba(232,99,43,0.3)',
                }}>Book {p.name.split(' ')[0]}</button>
              )}
            </div>
          ))}
        </div>
      )}

      {done && providers.length > 0 && selectedProvider === null && (
        <p style={{ textAlign: 'center', color: '#9B9490', fontSize: 14 }}>Tap a provider to book them</p>
      )}
    </div>
  );
}

/* -- Main flow -- */
export default function GetQuotes() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [data, setData] = useState<QuoteData>({
    category: '', description: '', photos: [],
    zip: '', timing: '', budget: '',
    tier: 'priority',
  });

  const update = useCallback((patch: Partial<QuoteData>) => setData(d => ({ ...d, ...patch })), []);

  return (
    <div style={{ minHeight: '100vh', background: 'white', fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`
        @keyframes fadeSlide { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:translateY(0); } }
        @keyframes slideUp { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
        @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
        @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.4; } }
      `}</style>

      {/* Header */}
      <nav style={{
        padding: '0 24px', height: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderBottom: '1px solid rgba(0,0,0,0.05)',
      }}>
        <span onClick={() => navigate('/')} style={{ fontFamily: "'Fraunces', serif", fontSize: 24, fontWeight: 700, color: O, cursor: 'pointer' }}>homie</span>
        {step < 3 && <span style={{ fontSize: 13, color: '#9B9490' }}>Step {step + 1} of 3</span>}
      </nav>

      {/* Content */}
      <div style={{ maxWidth: 580, margin: '0 auto', padding: '32px 24px 80px' }}>
        {step < 3 && <StepBar current={step} />}

        {step === 0 && <StepIssue data={data} onChange={update} onNext={() => setStep(1)} />}
        {step === 1 && <StepDetails data={data} onChange={update} onNext={() => setStep(2)} onBack={() => setStep(0)} />}
        {step === 2 && <StepTier data={data} onChange={update} onNext={() => setStep(3)} onBack={() => setStep(1)} />}
        {step === 3 && <StepOutreach data={data} />}
      </div>
    </div>
  );
}
