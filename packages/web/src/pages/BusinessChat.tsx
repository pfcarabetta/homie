import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import {
  businessService, businessChatService, jobService, connectJobSocket,
  type Property, type Workspace, type DiagnosticStreamCallbacks,
  type JobStatusResponse, type ProviderResponseItem,
} from '@/services/api';
import AvatarDropdown from '@/components/AvatarDropdown';

const O = '#E8632B', G = '#1B9E77', D = '#2D2926', W = '#F9F5F2';

/* ── Categories ─────────────────────────────────────────────────────────── */

interface CatDef {
  id: string; icon: string; label: string; group: 'repair' | 'service';
  q1: { text: string; options: string[] };
}

const B2B_CATEGORIES: CatDef[] = [
  // Repair
  { id: 'plumbing', icon: '🔧', label: 'Plumbing', group: 'repair',
    q1: { text: "What's happening?", options: ['Leaking/dripping', 'Clogged drain', 'No hot water', 'Running toilet', 'Burst/flooding', 'Other'] } },
  { id: 'electrical', icon: '⚡', label: 'Electrical', group: 'repair',
    q1: { text: "What's the problem?", options: ['Outlet not working', 'Lights flickering', 'Breaker tripping', 'Sparking/smell', 'Other'] } },
  { id: 'hvac', icon: '❄️', label: 'HVAC', group: 'repair',
    q1: { text: "What's going on?", options: ['AC not cooling', 'Heat not working', 'Strange noises', 'Thermostat issue', 'Bad smell', 'Other'] } },
  { id: 'appliance', icon: '🍳', label: 'Appliance', group: 'repair',
    q1: { text: 'Which appliance?', options: ['Washer', 'Dryer', 'Dishwasher', 'Refrigerator', 'Oven/stove', 'Disposal', 'Other'] } },
  { id: 'roofing', icon: '🏠', label: 'Roofing', group: 'repair',
    q1: { text: "What's the concern?", options: ['Active leak', 'Missing shingles', 'Storm damage', 'Gutter issue', 'Other'] } },
  { id: 'general', icon: '🔨', label: 'Handyman', group: 'repair',
    q1: { text: 'What kind of work?', options: ['Drywall repair', 'Door/window', 'Fence repair', 'Furniture', 'Other'] } },
  // Service (B2B-specific)
  { id: 'cleaning', icon: '✨', label: 'Turnover Clean', group: 'service',
    q1: { text: 'What type of clean?', options: ['Standard turnover', 'Deep clean', 'Post-construction', 'Laundry/linens', 'Other'] } },
  { id: 'pool', icon: '🏊', label: 'Pool', group: 'service',
    q1: { text: 'What do you need?', options: ['Chemical balance', 'Filter cleaning', 'Green/cloudy water', 'Equipment repair', 'Leak detection', 'Opening/closing'] } },
  { id: 'hot_tub', icon: '♨️', label: 'Hot Tub', group: 'service',
    q1: { text: 'What do you need?', options: ['Chemical balance', 'Filter cleaning', 'Drain & refill', 'Jets not working', 'Heater issue', 'Cover replacement'] } },
  { id: 'restocking', icon: '📦', label: 'Supplies Restock', group: 'service',
    q1: { text: 'What needs restocking?', options: ['Toiletries', 'Kitchen supplies', 'Linens', 'Welcome items', 'Full restock', 'Other'] } },
  { id: 'inspection', icon: '🔍', label: 'Inspection', group: 'service',
    q1: { text: 'What kind of inspection?', options: ['Pre-guest walkthrough', 'Post-guest damage check', 'Quarterly review', 'Other'] } },
  { id: 'landscaping', icon: '🌿', label: 'Landscaping', group: 'service',
    q1: { text: 'What do you need?', options: ['Lawn mowing', 'Tree trimming', 'Yard cleanup', 'Sprinkler repair', 'Other'] } },
  { id: 'pest_control', icon: '🐛', label: 'Pest Control', group: 'service',
    q1: { text: 'What kind of pest?', options: ['Ants', 'Roaches', 'Mice/rats', 'Termites', 'Bed bugs', 'Other'] } },
  { id: 'trash', icon: '🗑️', label: 'Trash Valet', group: 'service',
    q1: { text: 'What do you need?', options: ['Scheduled pickup', 'Bulk removal', 'Post-guest cleanout', 'Other'] } },
  { id: 'locksmith', icon: '🔑', label: 'Locksmith', group: 'service',
    q1: { text: 'What do you need?', options: ['Locked out', 'Rekey locks', 'New lock install', 'Smart lock setup', 'Lockbox replacement'] } },
  { id: 'pressure_washing', icon: '💦', label: 'Pressure Wash', group: 'service',
    q1: { text: 'What needs washing?', options: ['Driveway', 'Patio/deck', 'House siding', 'Fence', 'Pool area', 'Full exterior'] } },
  { id: 'window_cleaning', icon: '🪟', label: 'Window Cleaning', group: 'service',
    q1: { text: 'What do you need?', options: ['Interior only', 'Exterior only', 'Interior + exterior', 'Screens & tracks', 'Skylights'] } },
  { id: 'steam_cleaning', icon: '♨️', label: 'Steam Cleaning', group: 'service',
    q1: { text: 'What needs steam cleaning?', options: ['Carpets', 'Upholstery/couches', 'Mattresses', 'Tile & grout', 'Full property'] } },
  { id: 'furniture_assembly', icon: '🪑', label: 'Furniture Assembly', group: 'service',
    q1: { text: 'What needs assembling?', options: ['Bed frame', 'Desk/table', 'Shelving/bookcase', 'Outdoor furniture', 'Multiple pieces', 'TV mounting'] } },
  { id: 'concierge', icon: '🎩', label: 'Concierge', group: 'service',
    q1: { text: 'What service?', options: ['Private chef', 'Transport', 'Grocery delivery', 'Equipment rental', 'Activities', 'Other'] } },
];

/* ── Diagnosis Summary Card ──────────────────────────────────────────────── */

function DiagnosisSummaryCard({ category, property, summary, isService, onDispatch, dispatching }: {
  category: CatDef; property: Property; summary: string; isService: boolean;
  onDispatch: () => void; dispatching: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const isLong = summary.length > 300;

  return (
    <div style={{ marginLeft: 42, marginBottom: 16, background: '#fff', border: `2px solid ${G}22`, borderRadius: 16, overflow: 'hidden' }}>
      <div style={{ background: `${G}10`, padding: '12px 16px', borderBottom: `1px solid ${G}22`, display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: G }} />
        <span style={{ fontSize: 13, fontWeight: 600, color: G }}>{isService ? 'Scope confirmed' : 'AI diagnosis ready'}</span>
      </div>
      <div style={{ padding: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 16, color: D, marginBottom: 8 }}>{category.icon} {category.label}</div>
        <div style={{ fontSize: 14, color: '#6B6560', lineHeight: 1.6, marginBottom: isLong && !expanded ? 4 : 12, whiteSpace: 'pre-wrap' }}>
          {expanded || !isLong ? renderBold(summary) : <>{renderBold(summary.slice(0, 300))}...</>}
        </div>
        {isLong && (
          <button onClick={() => setExpanded(!expanded)} style={{
            background: 'none', border: 'none', padding: 0, fontSize: 13, fontWeight: 600,
            color: G, cursor: 'pointer', marginBottom: 12, display: 'block',
          }}>{expanded ? 'Show less' : 'Show full scope'}</button>
        )}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
          <div style={{ background: W, padding: '6px 12px', borderRadius: 8, fontSize: 13 }}>
            <span style={{ color: '#9B9490' }}>Property:</span> <span style={{ fontWeight: 600, color: D }}>{property.name}</span>
          </div>
          {property.zipCode && (
            <div style={{ background: W, padding: '6px 12px', borderRadius: 8, fontSize: 13 }}>
              <span style={{ color: '#9B9490' }}>Zip:</span> <span style={{ fontWeight: 600, color: D }}>{property.zipCode}</span>
            </div>
          )}
          <div style={{ background: W, padding: '6px 12px', borderRadius: 8, fontSize: 13 }}>
            <span style={{ color: '#9B9490' }}>Type:</span> <span style={{ fontWeight: 600, color: D }}>{isService ? 'Service' : 'Repair'}</span>
          </div>
        </div>
        <p style={{ fontSize: 12, color: '#9B9490', lineHeight: 1.5, marginBottom: 16 }}>
          This {isService ? 'scope' : 'diagnosis'} will be shared with providers so they can respond quickly — no need to explain twice.
        </p>
        <button onClick={onDispatch} disabled={dispatching} style={{
          padding: '14px 28px', borderRadius: 10, border: 'none', background: O, color: '#fff',
          fontSize: 15, fontWeight: 700, cursor: dispatching ? 'default' : 'pointer', width: '100%',
          opacity: dispatching ? 0.7 : 1,
        }}>
          {dispatching ? 'Dispatching...' : `Dispatch ${category.label} Pro`}
        </button>
      </div>
    </div>
  );
}

/* ── Markdown bold helper ───────────────────────────────────────────────── */

function renderBold(text: string) {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return parts.map((part, i) =>
    i % 2 === 1 ? <strong key={i}>{part}</strong> : part
  );
}

/* ── Chat message components ────────────────────────────────────────────── */

function AssistantMsg({ text, animate = false }: { text: string; animate?: boolean }) {
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
      <div style={{ background: W, padding: '12px 16px', borderRadius: '16px 16px 16px 4px', maxWidth: '80%', fontSize: 15, lineHeight: 1.6, color: D }}>{renderBold(text)}</div>
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

function StreamingMsg({ text }: { text: string }) {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 12 }}>
      <div style={{ width: 32, height: 32, borderRadius: 10, background: O, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <span style={{ color: 'white', fontFamily: "'Fraunces', serif", fontWeight: 700, fontSize: 15 }}>h</span>
      </div>
      <div style={{ background: W, padding: '12px 16px', borderRadius: '16px 16px 16px 4px', maxWidth: '80%', fontSize: 15, lineHeight: 1.6, color: D }}>
        {renderBold(text)}<span style={{ display: 'inline-block', width: 6, height: 16, background: O, marginLeft: 2, animation: 'blink 1s infinite' }} />
      </div>
    </div>
  );
}

/* ── Main component ─────────────────────────────────────────────────────── */

type Step = 'property' | 'category' | 'q1' | 'chat' | 'extra' | 'budget' | 'summary' | 'outreach' | 'results';

interface Message { role: 'user' | 'assistant'; content: string }

export default function BusinessChat() {
  const { homeowner } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const workspaceId = searchParams.get('workspace') || '';

  // Workspace & properties
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [selectedWorkspace, setSelectedWorkspace] = useState(workspaceId);
  const [properties, setProperties] = useState<Property[]>([]);
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);

  // Chat state
  const [step, setStep] = useState<Step>('property');
  const [messages, setMessages] = useState<Message[]>([]);
  const [streamText, setStreamText] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [category, setCategory] = useState<CatDef | null>(null);
  const [q1Answer, setQ1Answer] = useState('');
  const [aiDiagnosis, setAiDiagnosis] = useState('');
  const [inputVal, setInputVal] = useState('');
  const [readyToDispatch, setReadyToDispatch] = useState(false);
  const [exchangeCount, setExchangeCount] = useState(0);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showFreeInput, setShowFreeInput] = useState(false);
  const [showQ1Input, setShowQ1Input] = useState(false);
  const [q1InputVal, setQ1InputVal] = useState('');
  const [budget, setBudget] = useState('flexible');

  // Outreach state
  const [jobId, setJobId] = useState<string | null>(null);
  const [outreachStatus, setOutreachStatus] = useState<JobStatusResponse | null>(null);
  const [responses, setResponses] = useState<ProviderResponseItem[]>([]);
  const [dispatching, setDispatching] = useState(false);
  const [selectedResponse, setSelectedResponse] = useState<number | null>(null);
  const [bookedName, setBookedName] = useState<string | null>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const sessionIdRef = useRef(`b2b-${Date.now()}-${Math.random().toString(36).slice(2)}`);

  // Load workspaces
  useEffect(() => {
    if (!homeowner) { navigate('/login?redirect=/business/chat'); return; }
    businessService.listWorkspaces().then(res => {
      if (res.data) {
        setWorkspaces(res.data);
        if (!selectedWorkspace && res.data.length > 0) setSelectedWorkspace(res.data[0].id);
      }
    });
  }, [homeowner]);

  // Load properties when workspace changes
  useEffect(() => {
    if (!selectedWorkspace) return;
    businessService.listProperties(selectedWorkspace).then(res => {
      if (res.data) setProperties(res.data.filter(p => p.active));
    });
  }, [selectedWorkspace]);

  // Auto-scroll
  useEffect(() => {
    if (messages.length > 0) chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamText, step]);

  // Build property context string
  function getPropertyContext(): string {
    if (!selectedProperty) return '';
    const p = selectedProperty;
    const parts = [
      `Property: ${p.name}`,
      p.address && `Address: ${p.address}${p.city ? `, ${p.city}` : ''}${p.state ? `, ${p.state}` : ''} ${p.zipCode || ''}`,
      `Type: ${p.propertyType}`,
      `Units: ${p.unitCount}`,
      p.bedrooms != null && p.bedrooms > 0 && `Bedrooms: ${p.bedrooms}`,
      p.bathrooms != null && +p.bathrooms > 0 && `Bathrooms: ${p.bathrooms}`,
      p.sqft != null && p.sqft > 0 && `Square footage: ${p.sqft.toLocaleString()} sqft`,
      p.beds && p.beds.length > 0 && `Beds: ${p.beds.map(b => `${b.count}× ${b.type}`).join(', ')}`,
      p.notes && `Notes: ${p.notes}`,
    ].filter(Boolean);
    return parts.join('\n');
  }

  // Stream AI response
  function streamAI(userMsg: string, history: Message[], onDone?: (fullText: string, rawText: string) => void) {
    setStreaming(true);
    setStreamText('');
    let full = '';
    let raw = '';

    // Filter out XML tags from visible text
    let insideTag = false;
    let tagBuf = '';

    const callbacks: DiagnosticStreamCallbacks = {
      onToken: (token: string) => {
        raw += token;
        for (const ch of token) {
          if (insideTag) {
            tagBuf += ch;
            if (/<\/(diagnosis|job_summary|suggestions)>/.test(tagBuf)) {
              // Parse suggestions
              const sugMatch = tagBuf.match(/<suggestions>([\s\S]*?)<\/suggestions>/);
              if (sugMatch) {
                try {
                  const parsed = JSON.parse(sugMatch[1]) as string[];
                  if (Array.isArray(parsed)) setSuggestions(parsed);
                } catch { /* ignore */ }
              }
              insideTag = false; tagBuf = '';
            }
            continue;
          }
          if (ch === '<') { tagBuf = '<'; continue; }
          if (tagBuf.length > 0) {
            tagBuf += ch;
            if (ch === '>') {
              if (/^<(diagnosis|job_summary|suggestions)>/.test(tagBuf)) { insideTag = true; }
              else { full += tagBuf; setStreamText(full); tagBuf = ''; }
            }
            if (tagBuf.length > 15 && !tagBuf.includes('>')) { full += tagBuf; setStreamText(full); tagBuf = ''; }
            continue;
          }
          full += ch;
          setStreamText(full);
        }
      },
      onDiagnosis: () => {},
      onJobSummary: () => {},
      onDone: () => {
        if (tagBuf && !insideTag) { full += tagBuf; }
        setStreaming(false);
        setStreamText('');
        setMessages(prev => [...prev, { role: 'assistant', content: full.trim() }]);
        onDone?.(full.trim(), raw);
      },
      onError: (err: Error) => {
        setStreaming(false);
        setStreamText('');
        setMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, I had trouble processing that. Please try again.' }]);
      },
    };

    const mode = category?.group === 'service' ? 'service' : 'repair';

    abortRef.current = businessChatService.sendMessage(
      userMsg,
      mode as 'repair' | 'service',
      callbacks,
      {
        history: history.map(m => ({ role: m.role, content: m.content })),
        propertyContext: getPropertyContext(),
      },
    );
  }

  // Handle property selection
  function selectProperty(p: Property) {
    setSelectedProperty(p);
    setStep('category');
    setMessages([]);
  }

  // Handle category selection
  function selectCategory(cat: CatDef) {
    setCategory(cat);
    const propName = selectedProperty?.name || 'this property';
    if (cat.group === 'service') {
      setMessages([{ role: 'assistant', content: `${cat.icon} **${cat.label}** for ${propName} — got it. ${cat.q1.text}` }]);
    } else {
      setMessages([{ role: 'assistant', content: `${cat.icon} **${cat.label}** issue at ${propName} — let's figure this out. ${cat.q1.text}` }]);
    }
    setStep('q1');
  }

  // Handle Q1 answer
  function handleQ1(answer: string) {
    setQ1Answer(answer);
    setSuggestions([]);
    setShowFreeInput(false);
    const newMsgs: Message[] = [...messages, { role: 'user', content: answer }];
    setMessages(newMsgs);
    setStep('chat');

    // Stream AI follow-up
    const userContext = category?.group === 'service'
      ? `I need ${category.label} service. Specifically: ${answer}`
      : `I have a ${category?.label} issue. ${answer}`;

    streamAI(userContext, [], () => {
      setExchangeCount(1);
      setStep('extra');
    });
  }

  // Handle extra details or free-form chat
  function handleUserInput(text: string) {
    setSuggestions([]);
    setShowFreeInput(false);
    const newMsgs: Message[] = [...messages, { role: 'user', content: text }];
    setMessages(newMsgs);
    setInputVal('');

    // If we've had enough exchanges, skip the AI call and go to budget
    if (exchangeCount >= 2) {
      setTimeout(() => {
        setMessages(prev => [...prev, { role: 'assistant', content: 'Got it. Would you like to set a budget for this dispatch?' }]);
        setStep('budget');
      }, 300);
      return;
    }

    streamAI(text, newMsgs.slice(0, -1), () => {
      setExchangeCount(exchangeCount + 1);
      setStep('extra');
    });
  }

  // Handle budget selection
  function handleBudget(selected: string) {
    setBudget(selected);
    setMessages(prev => [...prev, { role: 'user', content: selected === 'flexible' ? 'No budget preference' : selected }]);

    // Generate the scope silently after budget is selected
    const promptText = category?.group === 'service'
      ? 'Please generate a final scope summary so I can dispatch a provider.'
      : 'Please generate your diagnosis so I can dispatch a pro.';

    setStreaming(true);
    setStreamText('');
    let visible = '';
    let insideXml = false;
    let xmlBuf = '';
    const mode = category?.group === 'service' ? 'service' : 'repair';

    abortRef.current = businessChatService.sendMessage(
      promptText,
      mode as 'repair' | 'service',
      {
        onToken: (token: string) => {
          for (const ch of token) {
            if (insideXml) {
              xmlBuf += ch;
              if (/<\/(diagnosis|job_summary|suggestions)>/.test(xmlBuf)) { insideXml = false; xmlBuf = ''; }
              continue;
            }
            if (ch === '<') { xmlBuf = '<'; continue; }
            if (xmlBuf.length > 0) {
              xmlBuf += ch;
              if (ch === '>') {
                if (/^<(diagnosis|job_summary|suggestions)>/.test(xmlBuf)) { insideXml = true; }
                else { visible += xmlBuf; }
                xmlBuf = '';
              }
              if (xmlBuf.length > 15 && !xmlBuf.includes('>')) { visible += xmlBuf; xmlBuf = ''; }
              continue;
            }
            visible += ch;
          }
        },
        onDiagnosis: () => {},
        onJobSummary: () => {},
        onDone: () => {
          if (xmlBuf && !insideXml) visible += xmlBuf;
          setStreaming(false);
          setStreamText('');
          setAiDiagnosis(visible.trim());
          setStep('summary');
        },
        onError: () => {
          setStreaming(false);
          setStreamText('');
          setAiDiagnosis(`${category?.label}: ${q1Answer}`);
          setStep('summary');
        },
      },
      {
        history: messages.map(m => ({ role: m.role, content: m.content })),
        propertyContext: getPropertyContext(),
      },
    );
  }

  // Handle dispatch (no tier selection — B2B subscription covers it)
  async function handleDispatch() {
    setDispatching(true);
    setStep('outreach');

    try {
      const diagnosis = {
        category: category?.id || 'general',
        severity: 'medium' as const,
        summary: aiDiagnosis || `${category?.label}: ${q1Answer}`,
        recommendedActions: ['Dispatch professional'],
      };

      const zipCode = selectedProperty?.zipCode || '92101';

      const res = await jobService.createJob({
        diagnosis,
        timing: 'asap',
        budget: budget,
        tier: 'priority',
        zipCode,
        workspaceId: selectedWorkspace || undefined,
        propertyId: selectedProperty?.id || undefined,
      });

      if (res.data) {
        setJobId(res.data.id);

        // Connect WebSocket for live updates
        connectJobSocket(res.data.id, (status) => {
          setOutreachStatus(status);
          if (status.status === 'completed' || status.status === 'expired') {
            jobService.getResponses(res.data!.id).then(r => {
              if (r.data) {
                setResponses(r.data.responses);
                setStep('results');
              }
            });
          }
        });

        setMessages(prev => [...prev, { role: 'assistant', content: `Dispatching now. Contacting providers in the ${zipCode} area...` }]);
      }
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Failed to create job. Please try again.' }]);
      setStep('extra');
    } finally {
      setDispatching(false);
    }
  }

  if (!homeowner) return null;

  const repairCats = B2B_CATEGORIES.filter(c => c.group === 'repair');
  const serviceCats = B2B_CATEGORIES.filter(c => c.group === 'service');

  return (
    <div style={{ minHeight: '100vh', background: 'white', fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`
        @keyframes fadeSlide { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
        @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
        @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.4; } }
        @keyframes blink { 0%, 50% { opacity: 1; } 51%, 100% { opacity: 0; } }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.1); border-radius: 4px; }
        @media (max-width: 480px) {
          .b2b-cat-grid { grid-template-columns: repeat(3, 1fr) !important; }
        }
      `}</style>

      {/* Header */}
      <nav style={{
        position: 'sticky', top: 0, zIndex: 50, background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(10px)',
        padding: '0 20px', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderBottom: '1px solid rgba(0,0,0,0.05)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span onClick={() => navigate('/business')} style={{ fontFamily: "'Fraunces', serif", fontSize: 22, fontWeight: 700, color: O, cursor: 'pointer' }}>homie</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: G, background: `${G}15`, padding: '3px 10px', borderRadius: 20 }}>Business</span>
          {selectedProperty && (
            <span style={{ fontSize: 13, color: '#9B9490', fontWeight: 500 }}>
              {selectedProperty.name}
            </span>
          )}
        </div>
        <AvatarDropdown />
      </nav>

      {/* Chat area */}
      <div style={{ maxWidth: 600, margin: '0 auto', padding: '16px 16px 120px' }}>

          {/* Step: Property selection */}
          {step === 'property' && (
            <div>
              <AssistantMsg text="Which property is this for?" animate />
              {selectedWorkspace && (
                <div style={{ marginLeft: 42, display: 'grid', gap: 8, marginBottom: 16, animation: 'fadeSlide 0.3s ease' }}>
                  {properties.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: 40, color: '#9B9490' }}>
                      No properties found. <span onClick={() => navigate('/business')} style={{ color: O, cursor: 'pointer', fontWeight: 600 }}>Add properties first.</span>
                    </div>
                  ) : properties.map(p => (
                    <button key={p.id} onClick={() => selectProperty(p)} style={{
                      display: 'flex', alignItems: 'center', padding: '14px 18px', borderRadius: 14, cursor: 'pointer',
                      border: '2px solid rgba(0,0,0,0.07)', background: 'white', textAlign: 'left', transition: 'all 0.15s',
                      fontFamily: "'DM Sans', sans-serif",
                    }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = O; e.currentTarget.style.background = 'rgba(232,99,43,0.03)'; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(0,0,0,0.07)'; e.currentTarget.style.background = 'white'; }}
                    >
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: 16, color: D }}>{p.name}</div>
                        {p.address && <div style={{ fontSize: 13, color: '#9B9490', marginTop: 2 }}>{p.address}{p.city ? `, ${p.city}` : ''}</div>}
                      </div>
                      <div style={{ fontSize: 12, color: '#9B9490', background: W, padding: '4px 10px', borderRadius: 8 }}>
                        {p.unitCount} {p.unitCount === 1 ? 'unit' : 'units'}
                      </div>
                    </button>
                  ))}
                  {workspaces.length > 1 && (
                    <select value={selectedWorkspace} onChange={e => { setSelectedWorkspace(e.target.value); setSelectedProperty(null); }}
                      style={{ marginTop: 8, padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(0,0,0,0.08)', fontSize: 13, color: '#6B6560', cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>
                      {workspaces.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                    </select>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Step: Category selection */}
          {step === 'category' && (
            <div>
              <AssistantMsg text={`${selectedProperty?.name} selected. What do you need?`} animate />

              <div style={{ marginLeft: 42, marginBottom: 12, animation: 'fadeSlide 0.3s ease' }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#9B9490', letterSpacing: '0.05em', marginBottom: 6 }}>REPAIR</div>
                <div className="b2b-cat-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 16 }}>
                  {repairCats.map(c => (
                    <button key={c.id} onClick={() => selectCategory(c)} style={{
                      padding: '14px', borderRadius: 12, cursor: 'pointer', border: '2px solid rgba(0,0,0,0.07)',
                      background: 'white', fontSize: 14, color: D, fontWeight: 500, textAlign: 'center', transition: 'all 0.15s',
                      fontFamily: "'DM Sans', sans-serif",
                    }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = O; e.currentTarget.style.background = 'rgba(232,99,43,0.03)'; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(0,0,0,0.07)'; e.currentTarget.style.background = 'white'; }}
                    >
                      <div style={{ fontSize: 22, marginBottom: 4 }}>{c.icon}</div>
                      <div>{c.label}</div>
                    </button>
                  ))}
                </div>

                <div style={{ fontSize: 12, fontWeight: 600, color: '#9B9490', letterSpacing: '0.05em', marginBottom: 6 }}>SERVICE</div>
                <div className="b2b-cat-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                  {serviceCats.map(c => (
                    <button key={c.id} onClick={() => selectCategory(c)} style={{
                      padding: '14px', borderRadius: 12, cursor: 'pointer', border: '2px solid rgba(0,0,0,0.07)',
                      background: 'white', fontSize: 14, color: D, fontWeight: 500, textAlign: 'center', transition: 'all 0.15s',
                      fontFamily: "'DM Sans', sans-serif",
                    }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = O; e.currentTarget.style.background = 'rgba(232,99,43,0.03)'; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(0,0,0,0.07)'; e.currentTarget.style.background = 'white'; }}
                    >
                      <div style={{ fontSize: 22, marginBottom: 4 }}>{c.icon}</div>
                      <div>{c.label}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Chat messages */}
          {step !== 'property' && step !== 'category' && (
            <>
              {messages.map((m, i) => (
                m.role === 'user' ? <UserMsg key={i} text={m.content} /> : <AssistantMsg key={i} text={m.content} />
              ))}
              {streaming && <StreamingMsg text={streamText} />}
            </>
          )}

          {/* Q1 options */}
          {step === 'q1' && category && !streaming && (
            <div style={{ marginLeft: 42, animation: 'fadeSlide 0.3s ease' }}>
              {!showQ1Input ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 8, marginBottom: 16 }}>
                  {category.q1.options.filter(o => o !== 'Other').map(opt => (
                    <button key={opt} onClick={() => handleQ1(opt)} style={{
                      padding: '10px 14px', borderRadius: 12, cursor: 'pointer', border: '2px solid rgba(0,0,0,0.07)',
                      background: 'white', fontSize: 14, color: D, fontWeight: 500, textAlign: 'center', transition: 'all 0.15s',
                      fontFamily: "'DM Sans', sans-serif",
                    }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = O; e.currentTarget.style.background = 'rgba(232,99,43,0.03)'; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(0,0,0,0.07)'; e.currentTarget.style.background = 'white'; }}
                    >{opt}</button>
                  ))}
                  <button onClick={() => setShowQ1Input(true)} style={{
                    padding: '10px 14px', borderRadius: 12, cursor: 'pointer', border: '2px dashed rgba(0,0,0,0.12)',
                    background: 'white', fontSize: 14, color: '#9B9490', fontWeight: 500, textAlign: 'center', transition: 'all 0.15s',
                    fontFamily: "'DM Sans', sans-serif",
                  }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = O; e.currentTarget.style.color = D; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(0,0,0,0.12)'; e.currentTarget.style.color = '#9B9490'; }}
                  >Something else</button>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                  <input value={q1InputVal} onChange={e => setQ1InputVal(e.target.value)} placeholder="Describe the issue..."
                    onKeyDown={e => { if (e.key === 'Enter' && q1InputVal.trim()) { handleQ1(q1InputVal.trim()); setShowQ1Input(false); setQ1InputVal(''); } }}
                    autoFocus
                    style={{
                      flex: 1, padding: '12px 16px', borderRadius: 100, fontSize: 15, border: '2px solid rgba(0,0,0,0.08)',
                      fontFamily: "'DM Sans', sans-serif", outline: 'none', color: D,
                    }}
                    onFocus={e => e.target.style.borderColor = O}
                    onBlur={e => e.target.style.borderColor = 'rgba(0,0,0,0.08)'}
                  />
                  <button onClick={() => { if (q1InputVal.trim()) { handleQ1(q1InputVal.trim()); setShowQ1Input(false); setQ1InputVal(''); } }}
                    style={{
                      width: 44, height: 44, borderRadius: '50%', border: 'none',
                      background: q1InputVal.trim() ? O : 'rgba(0,0,0,0.06)',
                      color: 'white', fontSize: 18, cursor: q1InputVal.trim() ? 'pointer' : 'default',
                      transition: 'all 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>↑</button>
                </div>
              )}
            </div>
          )}

          {/* Suggestion buttons + free input */}
          {step === 'extra' && !streaming && (
            <div style={{ marginLeft: 42, animation: 'fadeSlide 0.3s ease' }}>
              {/* Quick reply suggestions */}
              {suggestions.length > 0 && !showFreeInput && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 8, marginBottom: 12 }}>
                  {suggestions.map(s => (
                    <button key={s} onClick={() => handleUserInput(s)} style={{
                      padding: '10px 14px', borderRadius: 12, cursor: 'pointer', border: '2px solid rgba(0,0,0,0.07)',
                      background: 'white', fontSize: 14, color: D, fontWeight: 500, textAlign: 'center', transition: 'all 0.15s',
                      fontFamily: "'DM Sans', sans-serif",
                    }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = O; e.currentTarget.style.background = 'rgba(232,99,43,0.03)'; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(0,0,0,0.07)'; e.currentTarget.style.background = 'white'; }}
                    >{s}</button>
                  ))}
                  <button onClick={() => setShowFreeInput(true)} style={{
                    padding: '10px 14px', borderRadius: 12, cursor: 'pointer', border: '2px dashed rgba(0,0,0,0.12)',
                    background: 'white', fontSize: 14, color: '#9B9490', fontWeight: 500, textAlign: 'center', transition: 'all 0.15s',
                    fontFamily: "'DM Sans', sans-serif",
                  }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = O; e.currentTarget.style.color = D; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(0,0,0,0.12)'; e.currentTarget.style.color = '#9B9490'; }}
                  >Something else</button>
                </div>
              )}

              {/* Free text input — shown when no suggestions or user tapped "Something else" */}
              {(suggestions.length === 0 || showFreeInput) && (
                <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                  <input value={inputVal} onChange={e => setInputVal(e.target.value)} placeholder="Type your answer..."
                    onKeyDown={e => { if (e.key === 'Enter' && inputVal.trim()) handleUserInput(inputVal.trim()); }}
                    autoFocus
                    style={{
                      flex: 1, padding: '12px 16px', borderRadius: 100, fontSize: 15, border: '2px solid rgba(0,0,0,0.08)',
                      fontFamily: "'DM Sans', sans-serif", outline: 'none', color: D,
                    }}
                    onFocus={e => e.target.style.borderColor = O}
                    onBlur={e => e.target.style.borderColor = 'rgba(0,0,0,0.08)'}
                  />
                  <button onClick={() => { if (inputVal.trim()) handleUserInput(inputVal.trim()); }}
                    style={{
                      width: 44, height: 44, borderRadius: '50%', border: 'none',
                      background: inputVal.trim() ? O : 'rgba(0,0,0,0.06)',
                      color: 'white', fontSize: 18, cursor: inputVal.trim() ? 'pointer' : 'default',
                      transition: 'all 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>↑</button>
                </div>
              )}

            </div>
          )}

          {/* Budget selection */}
          {step === 'budget' && !streaming && (
            <div style={{ marginLeft: 42, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 8, marginBottom: 16, animation: 'fadeSlide 0.3s ease' }}>
              {['Under $100', '$100–$250', '$250–$500', '$500–$1,000', '$1,000+'].map(b => (
                <button key={b} onClick={() => handleBudget(b)} style={{
                  padding: '10px 14px', borderRadius: 12, cursor: 'pointer', border: '2px solid rgba(0,0,0,0.07)',
                  background: 'white', fontSize: 14, color: D, fontWeight: 500, textAlign: 'center', transition: 'all 0.15s',
                  fontFamily: "'DM Sans', sans-serif",
                }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = O; e.currentTarget.style.background = 'rgba(232,99,43,0.03)'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(0,0,0,0.07)'; e.currentTarget.style.background = 'white'; }}
                >{b}</button>
              ))}
              <button onClick={() => handleBudget('flexible')} style={{
                padding: '10px 14px', borderRadius: 12, cursor: 'pointer', border: '2px dashed rgba(0,0,0,0.12)',
                background: 'white', fontSize: 14, color: '#9B9490', fontWeight: 500, textAlign: 'center', transition: 'all 0.15s',
                fontFamily: "'DM Sans', sans-serif",
              }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = O; e.currentTarget.style.color = D; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(0,0,0,0.12)'; e.currentTarget.style.color = '#9B9490'; }}
              >Skip</button>
            </div>
          )}

          {/* Diagnosis summary card */}
          {step === 'summary' && !streaming && category && selectedProperty && (
            <DiagnosisSummaryCard
              category={category}
              property={selectedProperty}
              summary={aiDiagnosis}
              isService={category.group === 'service'}
              onDispatch={handleDispatch}
              dispatching={dispatching}
            />
          )}

          {/* Outreach live view */}
          {(step === 'outreach' || step === 'results') && (
            <>
              {/* Safe to leave notice */}
              <div style={{ marginLeft: 42, marginBottom: 16, background: '#EFF6FF', borderRadius: 12, padding: '12px 16px', border: '1px solid rgba(37,99,235,0.1)', animation: 'fadeSlide 0.3s ease' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#2563EB', marginBottom: 4 }}>You can close this page</div>
                <div style={{ fontSize: 12, color: '#6B6560', lineHeight: 1.5 }}>We'll notify you when quotes arrive. You can also check status in your <span onClick={() => navigate('/business')} style={{ color: O, cursor: 'pointer', fontWeight: 600 }}>business portal</span>.</div>
              </div>

              {/* Compact stats */}
              {outreachStatus && (
                <div style={{ marginLeft: 42, display: 'flex', gap: 8, marginBottom: 12, animation: 'fadeSlide 0.3s ease' }}>
                  {[
                    { label: 'Contacted', val: outreachStatus.providers_contacted, icon: '📡' },
                    { label: 'Quoted', val: outreachStatus.providers_responded, icon: '✅' },
                    { label: 'Voice', val: outreachStatus.outreach_channels.voice.attempted, icon: '📞' },
                    { label: 'SMS', val: outreachStatus.outreach_channels.sms.attempted, icon: '💬' },
                  ].map((s, i) => (
                    <div key={i} style={{ flex: 1, background: W, borderRadius: 10, padding: '10px 8px', textAlign: 'center' }}>
                      <div style={{ fontSize: 14 }}>{s.icon}</div>
                      <div style={{ fontSize: 20, fontWeight: 700, color: D }}>{s.val}</div>
                      <div style={{ fontSize: 10, color: '#9B9490' }}>{s.label}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Live log */}
              {outreachStatus && (
                <div style={{ marginLeft: 42, marginBottom: 16, animation: 'fadeSlide 0.3s ease' }}>
                  <div style={{
                    background: D, borderRadius: 14, padding: 14, maxHeight: 160, overflowY: 'auto',
                    fontFamily: "'DM Mono', monospace", fontSize: 12, lineHeight: 1.9,
                  }}>
                    <div style={{ color: 'rgba(255,255,255,0.45)' }}>  Contacting {outreachStatus.providers_contacted} providers...</div>
                    {outreachStatus.outreach_channels.voice.attempted > 0 && (
                      <div style={{ color: 'rgba(255,255,255,0.45)' }}>  {outreachStatus.outreach_channels.voice.attempted} voice calls</div>
                    )}
                    {outreachStatus.outreach_channels.sms.attempted > 0 && (
                      <div style={{ color: 'rgba(255,255,255,0.45)' }}>  {outreachStatus.outreach_channels.sms.attempted} SMS messages</div>
                    )}
                    {outreachStatus.outreach_channels.web.attempted > 0 && (
                      <div style={{ color: 'rgba(255,255,255,0.45)' }}>  {outreachStatus.outreach_channels.web.attempted} email contacts</div>
                    )}
                    {outreachStatus.providers_responded > 0 && (
                      <div style={{ color: G, animation: 'fadeIn 0.2s ease' }}>{'✓ '}{outreachStatus.providers_responded} quote(s) received!</div>
                    )}
                    {step === 'results' && (
                      <div style={{ color: G, animation: 'fadeIn 0.2s ease' }}>{'✓ '}{responses.length} quotes ready!</div>
                    )}
                    {step === 'outreach' && <span style={{ color: O, animation: 'pulse 1s infinite' }}>{'▌'}</span>}
                  </div>
                </div>
              )}

              {/* Provider cards */}
              {responses.map((r, i) => (
                <div key={r.id} style={{ marginLeft: 42, marginBottom: 10, animation: 'fadeSlide 0.4s ease' }}>
                  <div onClick={() => setSelectedResponse(selectedResponse === i ? null : i)} style={{
                    background: 'white', borderRadius: 14, padding: '16px 18px', cursor: 'pointer',
                    border: selectedResponse === i ? `2px solid ${O}` : '1px solid rgba(0,0,0,0.06)',
                    boxShadow: selectedResponse === i ? `0 4px 20px ${O}18` : '0 1px 4px rgba(0,0,0,0.03)',
                    transition: 'all 0.2s',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <div>
                        <span style={{ fontWeight: 700, fontSize: 16, color: D }}>{r.provider.name}</span>
                        {r.provider.google_rating && (
                          <span style={{ color: '#9B9490', fontSize: 13, marginLeft: 8 }}>{'★'} {r.provider.google_rating} ({r.provider.review_count})</span>
                        )}
                      </div>
                      {r.quoted_price && (
                        <div style={{ textAlign: 'right' }}>
                          <span style={{ fontFamily: "'Fraunces', serif", fontSize: 24, fontWeight: 700, color: O }}>{r.quoted_price}</span>
                          <div style={{ fontSize: 11, color: '#9B9490', fontWeight: 500 }}>estimate</div>
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      {r.availability && <span style={{ fontSize: 14, color: D }}>{'📅'} {r.availability}</span>}
                      <span style={{ background: W, padding: '2px 10px', borderRadius: 100, fontSize: 11, color: '#9B9490' }}>via {r.channel}</span>
                    </div>
                    {r.message && <div style={{ fontSize: 13, color: '#6B6560', fontStyle: 'italic', marginTop: 6 }}>"{r.message}"</div>}
                    {selectedResponse === i && (
                      <div style={{ marginTop: 14 }}>
                        <button onClick={async (e) => {
                          e.stopPropagation();
                          await jobService.bookProvider(jobId!, r.id, r.provider.id, selectedProperty?.address || undefined);
                          setBookedName(r.provider.name);
                        }} style={{
                          width: '100%', padding: '13px 0', borderRadius: 100, border: 'none',
                          background: O, color: 'white', fontSize: 16, fontWeight: 600, cursor: 'pointer',
                          fontFamily: "'DM Sans', sans-serif", boxShadow: `0 4px 16px ${O}40`,
                        }}>Book {r.provider.name.split(' ')[0]}</button>
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {/* Booking confirmation */}
              {bookedName && (
                <div style={{ marginLeft: 42, animation: 'fadeSlide 0.4s ease' }}>
                  <div style={{
                    background: 'white', borderRadius: 16, padding: '28px 24px', textAlign: 'center',
                    border: `2px solid ${G}22`, boxShadow: '0 4px 20px rgba(0,0,0,0.06)',
                  }}>
                    <div style={{ width: 56, height: 56, borderRadius: '50%', background: `${G}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={G} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4.5 12.75l6 6 9-13.5" /></svg>
                    </div>
                    <div style={{ fontFamily: "'Fraunces', serif", fontSize: 22, fontWeight: 700, color: D, marginBottom: 6 }}>You're all set!</div>
                    <div style={{ fontSize: 14, color: '#6B6560' }}>
                      <strong style={{ color: D }}>{bookedName}</strong> has been booked. They'll be in touch to confirm details.
                    </div>
                  </div>
                </div>
              )}

              {step === 'results' && responses.length > 0 && selectedResponse === null && !bookedName && (
                <div style={{ marginLeft: 42, textAlign: 'center', color: '#9B9490', fontSize: 14, marginTop: 8 }}>{'↑'} Tap a provider to book</div>
              )}
            </>
          )}

          <div ref={chatEndRef} />
        </div>
    </div>
  );
}
