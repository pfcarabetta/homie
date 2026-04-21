import { useState, type CSSProperties } from 'react';
import { MiniCalendar } from './business/constants';
import type { Reservation } from '@/services/api';

// ── Design tokens (mirrors /quote) ──────────────────────────────────────────
const O = '#E8632B';
const G = '#1B9E77';
const D = '#2D2926';
const W = '#F9F5F2';
const DIM = '#6B6560';
const BORDER = 'rgba(0,0,0,.08)';
const AMBER = '#EF9F27';
const RED = '#DC2626';

// ─────────────────────────────────────────────────────────────────────────────
// PROPOSED DESIGN — read-only preview. No real API calls, no deploy impact.
// Lives at /demo/business-chat-preview so stakeholders can review the
// Business-chat redesign before it replaces the live flow. Three reservation
// states are toggleable so you can see how the occupancy signal renders
// across PMS scenarios: occupied, vacant, and unknown (no PMS connection).
// ─────────────────────────────────────────────────────────────────────────────

type ScenarioId = 'occupied' | 'vacant' | 'unknown';
type MemoryState = 'hvac' | 'all' | 'empty';
type ViewMode = 'desktop' | 'mobile';

interface Scenario {
  id: ScenarioId;
  label: string;
  property: {
    name: string;
    address: string;
  };
  /** Present only when PMS is connected and we have live reservation data. */
  reservation: null | {
    status: 'checked_in' | 'upcoming';
    guestName: string;
    startDate: string; // display-ready, e.g. "Nov 15"
    endDate: string;
    nights: number;
    /** Human-readable hint shown beneath the status block. */
    advice: string;
  };
  /** Full 60-day upcoming reservation list (for the dispatch-window calendar). */
  calendar: Reservation[];
}

// ── Sample reservation fixtures ──────────────────────────────────────────────
// Dates are intentionally anchored to the current month so the MiniCalendar
// always renders with visible bars regardless of when the preview is viewed.
function isoOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function mockReservation(
  idx: number,
  guestName: string,
  daysFromNow: number,
  nights: number,
  source: 'airbnb' | 'vrbo' | 'manual' = 'airbnb',
): Reservation {
  return {
    id: `res-${idx}`,
    propertyId: 'prop-mock',
    guestName,
    guestEmail: null,
    guestPhone: null,
    checkIn: isoOffset(daysFromNow),
    checkOut: isoOffset(daysFromNow + nights),
    status: daysFromNow <= 0 && daysFromNow + nights >= 0 ? 'checked_in' : 'confirmed',
    guests: 2 + (idx % 3),
    source,
  };
}

const OCCUPIED_CALENDAR: Reservation[] = [
  mockReservation(0, 'Jane D.', -2, 6, 'airbnb'),   // current guest
  mockReservation(1, 'M. Rivera', 6, 7, 'airbnb'),  // next guest
  mockReservation(2, 'T. Nguyen', 18, 4, 'vrbo'),   // later
];

const VACANT_CALENDAR: Reservation[] = [
  mockReservation(0, 'M. Rivera', 3, 7, 'airbnb'),
  mockReservation(1, 'T. Nguyen', 16, 4, 'vrbo'),
  mockReservation(2, 'A. Patel', 28, 5, 'airbnb'),
];

const SCENARIOS: Record<ScenarioId, Scenario> = {
  occupied: {
    id: 'occupied',
    label: 'Occupied now',
    property: { name: 'Cliffside Cottage', address: '1214 Ocean Blvd · Unit 2A · San Diego, CA 92103' },
    reservation: {
      status: 'checked_in',
      guestName: 'Jane D.',
      startDate: 'Apr 18',
      endDate: 'Apr 24',
      nights: 6,
      advice: 'Guest is on-property. Consider scheduling after Apr 24 checkout.',
    },
    calendar: OCCUPIED_CALENDAR,
  },
  vacant: {
    id: 'vacant',
    label: 'Vacant · next guest soon',
    property: { name: 'Pine Ridge Cabin', address: '42 Timber Ln · Big Bear Lake, CA 92315' },
    reservation: {
      status: 'upcoming',
      guestName: 'M. Rivera',
      startDate: 'Apr 25',
      endDate: 'May 2',
      nights: 7,
      advice: 'Clear window today through Apr 24. Safe to dispatch now.',
    },
    calendar: VACANT_CALENDAR,
  },
  unknown: {
    id: 'unknown',
    label: 'No PMS connection',
    property: { name: 'Mountain Cabin', address: '88 Juniper Way · Lake Arrowhead, CA 92352' },
    reservation: null,
    calendar: [],
  },
};

// ─────────────────────────────────────────────────────────────────────────────

export default function BusinessChatPreview() {
  const [scenario, setScenario] = useState<ScenarioId>('occupied');
  const [memoryState, setMemoryState] = useState<MemoryState>('hvac');
  const [viewMode, setViewMode] = useState<ViewMode>('desktop');
  const s = SCENARIOS[scenario];

  if (viewMode === 'mobile') {
    return (
      <div style={{ minHeight: '100vh', background: '#1a1510', fontFamily: "'DM Sans', sans-serif" }}>
        <PreviewBanner
          scenario={scenario} setScenario={setScenario}
          memoryState={memoryState} setMemoryState={setMemoryState}
          viewMode={viewMode} setViewMode={setViewMode}
        />
        <MobileFrame>
          <MobileLayout scenario={s} memoryState={memoryState} />
        </MobileFrame>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: W, fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`
        @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.4; } }
        @keyframes fadeSlide { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
        @media (max-width: 980px) {
          .bcp-split { grid-template-columns: 1fr !important; gap: 12px !important; }
          .bcp-right-panel { display: none !important; }
        }
      `}</style>

      {/* Preview banner — makes it obvious this is a design mock */}
      <PreviewBanner
        scenario={scenario}
        setScenario={setScenario}
        memoryState={memoryState}
        setMemoryState={setMemoryState}
        viewMode={viewMode}
        setViewMode={setViewMode}
      />

      {/* Nav bar mirroring /quote */}
      <nav style={{
        position: 'sticky', top: 40, zIndex: 30,
        background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(16px) saturate(180%)',
        padding: '0 24px', height: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderBottom: `1px solid ${BORDER}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <svg width={30} height={30} viewBox="0 0 48 48">
            <rect width="48" height="48" rx="14" fill={O} />
            <path d="M24 12L10 23H14V35H21V28H27V35H34V23H38L24 12Z" fill="#fff" />
            <circle cx="24" cy="22" r="3" fill={O} />
          </svg>
          <span style={{ fontFamily: "'Fraunces', serif", fontSize: 22, fontWeight: 700, color: D }}>homie</span>
          <span style={{ color: DIM, fontSize: 14 }}>·</span>
          <span style={{ fontSize: 14, color: DIM, fontWeight: 600 }}>Business · New dispatch</span>
        </div>
        <PropertyPicker property={s.property} />
      </nav>

      <section style={{ padding: '32px 24px 80px', overflowX: 'hidden' }}>
        <div className="bcp-split" style={{
          maxWidth: 1280, margin: '0 auto',
          display: 'grid', gridTemplateColumns: '1.15fr 1fr', gap: 28, alignItems: 'flex-start',
        }}>
          {/* LEFT — intake chat column */}
          <div style={{ minWidth: 0 }}>
            {/* Status pill + property microstate */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
              <StatusPill online />
              {s.reservation?.status === 'checked_in' && (
                <OccupancyPill color={RED} dot label={`Occupied · ${s.reservation.guestName} until ${s.reservation.endDate}`} />
              )}
              {s.reservation?.status === 'upcoming' && (
                <OccupancyPill color={G} label={`Vacant · next check-in ${s.reservation.startDate}`} />
              )}
              {!s.reservation && (
                <OccupancyPill color={DIM} label="PMS not connected · occupancy unknown" />
              )}
            </div>

            {/* Expandable dispatch calendar — right under the occupancy pill.
                Helps the PM spot an open window before even finishing the
                chat. Hidden when PMS isn't connected (calendar array empty). */}
            {s.calendar.length > 0 && <DispatchCalendarExpandable calendar={s.calendar} />}

            <div style={{ height: 14 }} />

            {/* Sample chat transcript */}
            <div>
              <AssistantMsg text="Hey! Which property is this for?" animate={false} />
              <UserMsg text={s.property.name} />
              <AssistantMsg text={"What's going on there?"} animate={false} />
              <UserMsg text="The upstairs AC isn't cooling — blowing warm air all afternoon." />
              <AssistantMsg text={"Got it — sounds like an HVAC issue. Is it the whole system or just one floor?"} animate={false} />
              <UserMsg text="Just the upstairs unit. Downstairs is fine." />
              <AssistantMsg text={"Perfect. What brand/model is the upstairs AC, if you know?"} animate={false} />
            </div>

            {/* Category pills + DirectInput (design from /quote) */}
            <div style={{ marginLeft: 42, display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
              <span style={{ fontSize: 9.5, fontFamily: "'DM Mono',monospace", letterSpacing: 1.4, textTransform: 'uppercase', color: DIM, fontWeight: 700 }}>Repair · most common</span>
              <span style={{ height: 1, flex: 1, background: BORDER }} />
            </div>
            <CategoryPills />

            <MoreCatsPill />

            <DirectInputMock />
          </div>

          {/* RIGHT — live split panel */}
          <div className="bcp-right-panel" style={{ position: 'sticky', top: 112, minWidth: 0 }}>
            <PropertyCard scenario={s} />
            <HomieListeningCard />
            <PropertyIQCard state={memoryState} />
            <ProsNearbyBadge />
            <AssuranceCard />
          </div>
        </div>
      </section>
    </div>
  );
}

// ─── Preview banner ──────────────────────────────────────────────────────────

function PreviewBanner({
  scenario, setScenario, memoryState, setMemoryState, viewMode, setViewMode,
}: {
  scenario: ScenarioId; setScenario: (s: ScenarioId) => void;
  memoryState: MemoryState; setMemoryState: (m: MemoryState) => void;
  viewMode: ViewMode; setViewMode: (v: ViewMode) => void;
}) {
  const memoryOpts: { id: MemoryState; label: string }[] = [
    { id: 'hvac', label: 'HVAC-filtered' },
    { id: 'all', label: 'All items' },
    { id: 'empty', label: 'Not scanned' },
  ];
  const viewOpts: { id: ViewMode; label: string }[] = [
    { id: 'desktop', label: 'Desktop' },
    { id: 'mobile', label: 'Mobile' },
  ];
  return (
    <div style={{
      position: 'sticky', top: 0, zIndex: 50,
      background: `linear-gradient(90deg, ${O}, #d45422)`,
      color: '#fff', padding: '6px 20px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      fontSize: 13, fontWeight: 600, minHeight: 40,
      fontFamily: "'DM Sans', sans-serif",
      gap: 16, flexWrap: 'wrap',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <span style={{
          background: 'rgba(255,255,255,.22)', padding: '3px 9px', borderRadius: 6,
          fontSize: 10, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase',
          fontFamily: "'DM Mono',monospace",
        }}>Preview</span>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          Business Chat redesign
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0, flexWrap: 'wrap' }}>
        <TogglePillGroup
          label="View"
          value={viewMode}
          options={viewOpts}
          onChange={setViewMode}
        />
        <TogglePillGroup
          label="Scenario"
          value={scenario}
          options={(Object.values(SCENARIOS) as Scenario[]).map(sc => ({ id: sc.id, label: sc.label }))}
          onChange={setScenario}
        />
        <TogglePillGroup
          label="Memory"
          value={memoryState}
          options={memoryOpts}
          onChange={setMemoryState}
        />
      </div>
    </div>
  );
}

function TogglePillGroup<T extends string>({
  label, value, options, onChange,
}: {
  label: string;
  value: T;
  options: { id: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ fontSize: 11, opacity: 0.85, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700 }}>{label}</span>
      {options.map(opt => (
        <button key={opt.id} onClick={() => onChange(opt.id)} style={{
          background: opt.id === value ? '#fff' : 'rgba(255,255,255,.16)',
          color: opt.id === value ? O : '#fff',
          border: 'none', borderRadius: 100,
          padding: '4px 11px', fontSize: 12, fontWeight: 700,
          cursor: 'pointer', fontFamily: "'DM Sans',sans-serif",
        }}>{opt.label}</button>
      ))}
    </div>
  );
}

// ─── Top-nav property picker ────────────────────────────────────────────────

function PropertyPicker({ property }: { property: { name: string; address: string } }) {
  return (
    <button style={{
      display: 'inline-flex', alignItems: 'center', gap: 10,
      background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 14,
      padding: '8px 14px', cursor: 'pointer',
      fontFamily: "'DM Sans',sans-serif",
      maxWidth: 320, minWidth: 0,
    }}>
      <span style={{ fontSize: 16 }}>🏠</span>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', minWidth: 0, flex: 1 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: D, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 240 }}>{property.name}</span>
        <span style={{ fontSize: 10.5, color: DIM, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 240 }}>{property.address}</span>
      </div>
      <span style={{ color: DIM, fontSize: 14 }}>▾</span>
    </button>
  );
}

// ─── Left-column header pills ───────────────────────────────────────────────

function StatusPill({ online }: { online: boolean }) {
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 8,
      padding: '5px 11px 5px 10px', borderRadius: 100,
      background: online ? 'rgba(27,158,119,.1)' : 'rgba(239,159,39,.12)',
      border: `1px solid ${online ? 'rgba(27,158,119,.22)' : 'rgba(239,159,39,.28)'}`,
      fontSize: 11.5, fontWeight: 700, fontFamily: "'DM Sans',sans-serif",
      color: online ? G : AMBER, letterSpacing: '.02em',
    }}>
      <span style={{
        width: 7, height: 7, borderRadius: '50%', background: online ? G : AMBER, flexShrink: 0,
        boxShadow: online ? `0 0 0 3px ${G}22` : 'none',
        animation: online ? 'pulse 1.8s infinite' : 'none',
      }} />
      {online ? 'Online' : 'After hours · responses may take longer'}
    </div>
  );
}

function OccupancyPill({ color, label, dot }: { color: string; label: string; dot?: boolean }) {
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 8,
      padding: '5px 11px 5px 10px', borderRadius: 100,
      background: `${color}14`,
      border: `1px solid ${color}33`,
      fontSize: 11.5, fontWeight: 700, fontFamily: "'DM Sans',sans-serif",
      color, letterSpacing: '.02em',
    }}>
      <span style={{
        width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0,
        animation: dot ? 'pulse 1.8s infinite' : 'none',
      }} />
      {label}
    </div>
  );
}

// ─── Dispatch calendar (expandable, left column) ────────────────────────────
//
// Collapsed by default so it doesn't push the chat below the fold; expands
// inline on click. Re-uses the MiniCalendar component the Business portal's
// Properties tab already renders, so the visual language matches.

function DispatchCalendarExpandable({ calendar }: { calendar: Reservation[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginBottom: 12 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          background: open ? `${O}0a` : '#fff',
          border: `1px solid ${open ? O + '33' : BORDER}`,
          borderRadius: 12,
          padding: '8px 12px',
          display: 'flex', alignItems: 'center', gap: 10,
          fontSize: 12.5, fontWeight: 700, color: D,
          cursor: 'pointer', fontFamily: "'DM Sans',sans-serif",
          width: '100%', textAlign: 'left',
          transition: 'all .15s',
        }}
      >
        <span style={{ fontSize: 15 }}>📅</span>
        <span style={{ flex: 1 }}>
          Best dispatch windows
          <span style={{ color: DIM, fontWeight: 500, marginLeft: 6 }}>· {calendar.length} upcoming</span>
        </span>
        <span style={{
          fontSize: 10, color: open ? O : DIM, fontFamily: "'DM Mono',monospace",
          letterSpacing: .6, textTransform: 'uppercase',
          transform: open ? 'rotate(180deg)' : 'rotate(0)',
          transition: 'transform .2s',
        }}>▾</span>
      </button>
      {open && (
        <div style={{
          marginTop: 8, padding: 14, borderRadius: 12,
          background: '#fff', border: `1px solid ${BORDER}`,
          animation: 'fadeSlide 0.2s ease',
          boxShadow: '0 6px 20px -10px rgba(0,0,0,.08)',
        }}>
          <MiniCalendar reservations={calendar} />
          <div style={{
            marginTop: 10, padding: '8px 10px', borderRadius: 8,
            background: `${G}0f`, border: `1px solid ${G}22`,
            fontSize: 11, color: D, lineHeight: 1.5,
          }}>
            <strong style={{ color: G }}>Open days</strong> are safe dispatch windows — unless it's an urgent guest request.
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Chat bubbles ────────────────────────────────────────────────────────────

function AssistantMsg({ text, animate }: { text: string; animate: boolean }) {
  return (
    <div style={{
      display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 12,
      animation: animate ? 'fadeSlide 0.3s ease' : 'none',
    }}>
      <div style={{
        width: 32, height: 32, borderRadius: 10, background: O,
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <span style={{ color: 'white', fontFamily: "'Fraunces', serif", fontWeight: 700, fontSize: 15 }}>h</span>
      </div>
      <div style={{
        background: W, padding: '12px 16px', borderRadius: '16px 16px 16px 4px',
        maxWidth: '80%', fontSize: 15, lineHeight: 1.6, color: D,
        overflowWrap: 'anywhere', wordBreak: 'break-word',
      }}>{text}</div>
    </div>
  );
}

function UserMsg({ text }: { text: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
      <div style={{
        background: O, color: 'white', padding: '10px 18px',
        borderRadius: '16px 16px 4px 16px', maxWidth: '75%',
        fontSize: 15, lineHeight: 1.5,
        overflowWrap: 'anywhere', wordBreak: 'break-word',
      }}>{text}</div>
    </div>
  );
}

// ─── Category pills (subset) ────────────────────────────────────────────────

const REPAIR_PILLS: { id: string; icon: string; label: string; active?: boolean }[] = [
  { id: 'plumbing', icon: '🔧', label: 'Plumbing' },
  { id: 'electrical', icon: '⚡', label: 'Electrical' },
  { id: 'hvac', icon: '❄️', label: 'HVAC', active: true },
  { id: 'appliance', icon: '🍳', label: 'Appliance' },
  { id: 'roofing', icon: '🏠', label: 'Roofing & Exterior' },
  { id: 'handyman', icon: '🔨', label: 'Handyman & Structural' },
  { id: 'garage', icon: '🚨', label: 'Garage Door' },
  { id: 'locksmith', icon: '🔑', label: 'Locksmith & Security' },
];

function CategoryPills() {
  return (
    <div style={{ marginLeft: 42, marginBottom: 14, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {REPAIR_PILLS.map(p => (
        <button key={p.id} style={{
          background: p.active ? `${O}14` : '#fff',
          color: p.active ? O : D,
          border: `1px solid ${p.active ? O : BORDER}`,
          borderRadius: 100, padding: '8px 12px', fontSize: 13, fontWeight: 600,
          cursor: 'pointer', fontFamily: "'DM Sans',sans-serif",
          display: 'inline-flex', alignItems: 'center', gap: 6,
          position: 'relative',
        }}>
          <span style={{ fontSize: 14 }}>{p.icon}</span>
          {p.label}
          {p.active && (
            <span style={{ fontSize: 9, fontFamily: "'DM Mono',monospace", letterSpacing: 1, color: O, fontWeight: 700, marginLeft: 4, textTransform: 'uppercase' }}>AI</span>
          )}
        </button>
      ))}
    </div>
  );
}

function MoreCatsPill() {
  return (
    <div style={{ marginLeft: 42, marginBottom: 14 }}>
      <button style={{
        width: '100%', background: 'transparent',
        border: `1px dashed ${BORDER}`, borderRadius: 100,
        padding: '10px 14px', fontSize: 12, fontWeight: 600,
        color: DIM, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif",
      }}>
        + 8 more · cleaning, landscape, painting, moving…
      </button>
    </div>
  );
}

// ─── DirectInput (text + photo + video + voice) ─────────────────────────────

function DirectInputMock() {
  return (
    <div style={{ marginLeft: 42, marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <span style={{ height: 1, flex: '0 0 16px', background: BORDER }} />
        <span style={{ fontSize: 10, fontFamily: "'DM Mono',monospace", letterSpacing: 1.5, textTransform: 'uppercase', color: DIM, fontWeight: 700 }}>or just describe it</span>
        <span style={{ height: 1, flex: 1, background: BORDER }} />
      </div>
      <div style={{
        background: '#fff', borderRadius: 20,
        border: `2px solid ${BORDER}`,
        boxShadow: '0 12px 40px -20px rgba(0,0,0,.08)',
        padding: '20px 22px 16px',
      }}>
        <div style={{
          minHeight: 72,
          fontFamily: "'Fraunces',serif", fontSize: 22, lineHeight: 1.3,
          color: DIM, letterSpacing: '-.01em',
        }}>
          Describe it here, or chat with Homie by video or voice below.
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, paddingTop: 12, borderTop: `1px solid ${BORDER}`, gap: 10, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <UploadBtn icon="camera" label="Photo" />
            <UploadBtn icon="video" label="Video Chat with Homie" />
            <UploadBtn icon="mic" label="Talk to Homie" />
          </div>
        </div>
      </div>
      <button style={{
        marginTop: 14, width: '100%',
        background: `${O}0f`, color: DIM,
        border: `1px dashed ${O}55`, borderRadius: 16,
        padding: '16px 24px', fontSize: 15, fontWeight: 700,
        cursor: 'default', fontFamily: "'DM Sans',sans-serif",
      }}>
        Continue — confirm timing &amp; tier →
      </button>
    </div>
  );
}

function UploadBtn({ icon, label }: { icon: 'camera' | 'video' | 'mic'; label: string }) {
  return (
    <button style={{
      background: W, border: `1px solid ${BORDER}`, color: D,
      borderRadius: 100, padding: '10px 14px',
      fontSize: 13, fontWeight: 600, cursor: 'pointer',
      display: 'inline-flex', alignItems: 'center', gap: 8,
      fontFamily: "'DM Sans',sans-serif",
    }}>
      {icon === 'camera' && (
        <svg width="15" height="13" viewBox="0 0 24 20" fill="none">
          <path d="M3 5h4l2-2h6l2 2h4v12H3V5z" stroke={D} strokeWidth="1.8" />
          <circle cx="12" cy="11" r="3.5" stroke={D} strokeWidth="1.8" />
        </svg>
      )}
      {icon === 'video' && (
        <svg width="15" height="13" viewBox="0 0 24 20" fill="none">
          <rect x="2" y="4" width="14" height="12" rx="2" stroke={D} strokeWidth="1.8" />
          <path d="M16 9l6-3v8l-6-3V9z" stroke={D} strokeWidth="1.8" strokeLinejoin="round" />
        </svg>
      )}
      {icon === 'mic' && (
        <svg width="13" height="14" viewBox="0 0 18 20" fill="none">
          <rect x="6" y="1" width="6" height="11" rx="3" stroke={D} strokeWidth="1.8" />
          <path d="M3 10c0 3.3 2.7 6 6 6s6-2.7 6-6M9 16v3" stroke={D} strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      )}
      {label}
    </button>
  );
}

// ─── RIGHT PANEL · Property + Reservation card ──────────────────────────────

function PropertyCard({ scenario: s }: { scenario: Scenario }) {
  const r = s.reservation;
  const isOccupied = r?.status === 'checked_in';
  const isUpcoming = r?.status === 'upcoming';
  const accent = isOccupied ? RED : isUpcoming ? G : DIM;
  const [calOpen, setCalOpen] = useState(false);

  return (
    <div style={{
      background: '#fff', borderRadius: 20, border: `1px solid ${BORDER}`,
      padding: 20, marginBottom: 14,
      boxShadow: '0 20px 60px -24px rgba(0,0,0,.08)',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{
          width: 40, height: 40, borderRadius: 10, background: `${O}14`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 20, flexShrink: 0,
        }}>🏠</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "'Fraunces',serif", fontSize: 17, fontWeight: 700, color: D, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {s.property.name}
          </div>
          <div style={{ fontSize: 12, color: DIM, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {s.property.address}
          </div>
        </div>
      </div>

      {/* Occupancy strip */}
      <div style={{ marginTop: 16 }}>
        <div style={{ fontSize: 10, color: DIM, textTransform: 'uppercase', letterSpacing: 1.2, fontWeight: 700, fontFamily: "'DM Mono',monospace", marginBottom: 8 }}>
          Reservation
        </div>

        {r ? (
          <div style={{
            padding: 14, borderRadius: 14,
            background: `linear-gradient(90deg, ${accent}12, ${accent}04)`,
            border: `1px solid ${accent}24`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <div style={{ position: 'relative', width: 10, height: 10, flexShrink: 0 }}>
                <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: accent }} />
                {isOccupied && (
                  <span style={{ position: 'absolute', inset: -4, borderRadius: '50%', background: accent, opacity: .25, animation: 'pulse 1.8s infinite' }} />
                )}
              </div>
              <span style={{ fontSize: 12, fontWeight: 700, color: accent, letterSpacing: 1.1, textTransform: 'uppercase', fontFamily: "'DM Mono',monospace" }}>
                {isOccupied ? 'Occupied' : 'Vacant · next check-in soon'}
              </span>
            </div>
            <div style={{ fontFamily: "'Fraunces',serif", fontSize: 15, fontWeight: 700, color: D, lineHeight: 1.3 }}>
              {r.guestName} · {r.startDate} → {r.endDate}
            </div>
            <div style={{ fontSize: 12, color: DIM, marginTop: 2 }}>
              {r.nights} {r.nights === 1 ? 'night' : 'nights'}
            </div>
            <div style={{
              marginTop: 10, paddingTop: 10, borderTop: `1px dashed ${accent}33`,
              fontSize: 12, color: D, fontWeight: 500, lineHeight: 1.5,
            }}>
              {isOccupied ? '⚠ ' : '✓ '}{r.advice}
            </div>

            {/* Expandable dispatch calendar — same MiniCalendar used on the
                Business > Properties tab, embedded here so PMs can spot
                open windows without leaving chat. */}
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px dashed ${accent}33` }}>
              <button
                onClick={() => setCalOpen(o => !o)}
                style={{
                  background: 'transparent', border: 'none', padding: 0,
                  display: 'flex', alignItems: 'center', gap: 8,
                  fontSize: 12, fontWeight: 700, color: D,
                  cursor: 'pointer', fontFamily: "'DM Sans',sans-serif",
                  width: '100%', textAlign: 'left',
                }}
              >
                <span style={{ fontSize: 14 }}>📅</span>
                <span style={{ flex: 1 }}>Best dispatch windows · next 60 days</span>
                <span style={{
                  fontSize: 10, color: DIM, fontFamily: "'DM Mono',monospace",
                  letterSpacing: .6, textTransform: 'uppercase',
                  transform: calOpen ? 'rotate(180deg)' : 'rotate(0)',
                  transition: 'transform .2s',
                }}>▾</span>
              </button>
              {calOpen && (
                <div style={{ marginTop: 12, animation: 'fadeSlide 0.2s ease' }}>
                  <MiniCalendar reservations={s.calendar} />
                  <div style={{
                    marginTop: 10, padding: '8px 10px', borderRadius: 8,
                    background: `${G}0f`, border: `1px solid ${G}22`,
                    fontSize: 11, color: D, lineHeight: 1.5,
                  }}>
                    <strong style={{ color: G }}>Open days</strong> are safe dispatch windows — unless it's an urgent guest request.
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div style={{
            padding: 14, borderRadius: 14,
            background: 'rgba(0,0,0,.02)',
            border: `1px dashed ${BORDER}`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: DIM }} />
              <span style={{ fontSize: 12, fontWeight: 700, color: DIM, letterSpacing: 1.1, textTransform: 'uppercase', fontFamily: "'DM Mono',monospace" }}>
                PMS not connected
              </span>
            </div>
            <div style={{ fontSize: 13, color: D, lineHeight: 1.5 }}>
              Connect Guesty, Hospitable, or Track to see live occupancy here.
            </div>
            <button style={{
              marginTop: 10, background: '#fff', border: `1px solid ${BORDER}`,
              borderRadius: 100, padding: '6px 12px', fontSize: 12, fontWeight: 700, color: D,
              cursor: 'pointer', fontFamily: "'DM Sans',sans-serif",
            }}>Connect PMS →</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── RIGHT PANEL · Property IQ card ─────────────────────────────────────────
//
// Pulls from what we already scan into property_inventory_items. Three
// states modelled below: HVAC-filtered (category known, one item pinned
// by the AI), All items (pre-category, summary grid of everything), and
// Empty (no scan on file yet → nudge to run one).

interface InventoryItem {
  id: string;
  category: 'hvac' | 'plumbing' | 'appliance' | 'electrical' | 'other';
  room: string;
  name: string;
  brand: string;
  model: string;
  installedYear: number;
  lastServiced?: string;
  overdue?: boolean;
  pinned?: boolean;
  condition?: 'good' | 'fair' | 'poor';
}

const MOCK_INVENTORY: InventoryItem[] = [
  {
    id: 'hvac-1', category: 'hvac', room: 'Upstairs', name: 'Central AC',
    brand: 'Trane', model: 'XR16', installedYear: 2019,
    lastServiced: 'Jun 2024', condition: 'good', pinned: true,
  },
  {
    id: 'hvac-2', category: 'hvac', room: 'Downstairs', name: 'Central AC',
    brand: 'Trane', model: 'XR14', installedYear: 2015,
    condition: 'fair', overdue: true,
  },
  {
    id: 'hvac-3', category: 'hvac', room: 'Basement', name: 'Furnace',
    brand: 'Carrier', model: '59TP6B', installedYear: 2018,
    condition: 'good',
  },
  {
    id: 'wh-1', category: 'plumbing', room: 'Garage', name: 'Water heater',
    brand: 'Rheem', model: '50-gal tank', installedYear: 2021, condition: 'good',
  },
  {
    id: 'wh-2', category: 'plumbing', room: 'Master bath', name: 'Fixtures',
    brand: 'Moen', model: 'Brantford', installedYear: 2020, condition: 'good',
  },
  {
    id: 'ap-1', category: 'appliance', room: 'Kitchen', name: 'Fridge',
    brand: 'Samsung', model: 'RF28R7551SR', installedYear: 2020, condition: 'good',
  },
  {
    id: 'ap-2', category: 'appliance', room: 'Kitchen', name: 'Dishwasher',
    brand: 'Bosch', model: 'SHPM78Z55N', installedYear: 2020, condition: 'good',
  },
  {
    id: 'ap-3', category: 'appliance', room: 'Kitchen', name: 'Range',
    brand: 'GE', model: 'JGS760SPSS', installedYear: 2020, condition: 'good',
  },
];

function PropertyIQCard({ state }: { state: MemoryState }) {
  if (state === 'empty') return <IQEmptyState />;
  if (state === 'hvac') return <IQFiltered category="hvac" items={MOCK_INVENTORY.filter(i => i.category === 'hvac')} />;
  return <IQOverview items={MOCK_INVENTORY} />;
}

function IQFiltered({ category, items }: { category: InventoryItem['category']; items: InventoryItem[] }) {
  return (
    <div style={{
      background: '#fff', borderRadius: 20, border: `1px solid ${BORDER}`,
      padding: 20, marginBottom: 14,
      boxShadow: '0 20px 60px -24px rgba(0,0,0,.08)',
      animation: 'fadeSlide 0.3s ease',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <div style={{
          width: 34, height: 34, borderRadius: 10,
          background: `${O}14`, border: `1px solid ${O}33`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 16, flexShrink: 0,
        }}>🧠</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "'Fraunces',serif", fontSize: 16, fontWeight: 700, color: D, lineHeight: 1.2 }}>
            Property IQ · {category.toUpperCase()}
          </div>
          <div style={{ fontSize: 11, color: DIM, marginTop: 2, fontFamily: "'DM Mono',monospace", letterSpacing: .6, textTransform: 'uppercase' }}>
            From last scan · 14d ago
          </div>
        </div>
      </div>

      {/* Items */}
      <div style={{ display: 'grid', gap: 8 }}>
        {items.map(item => <InventoryRow key={item.id} item={item} />)}
      </div>

      {/* Footer hint */}
      <div style={{
        marginTop: 12, paddingTop: 12, borderTop: `1px dashed ${BORDER}`,
        fontSize: 11.5, color: DIM, lineHeight: 1.5,
      }}>
        💡 Homie auto-references this in the dispatch brief — no need to type brand or model again.
      </div>
    </div>
  );
}

function InventoryRow({ item }: { item: InventoryItem }) {
  const accent = item.pinned ? O : BORDER;
  const age = new Date().getFullYear() - item.installedYear;
  return (
    <div style={{
      padding: 12, borderRadius: 12,
      background: item.pinned ? `${O}08` : 'rgba(0,0,0,.02)',
      border: `1px solid ${item.pinned ? `${O}33` : BORDER}`,
      display: 'flex', alignItems: 'flex-start', gap: 10,
      position: 'relative',
    }}>
      <div style={{
        width: 30, height: 30, borderRadius: 8,
        background: item.pinned ? O : '#fff',
        border: item.pinned ? 'none' : `1px solid ${BORDER}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 14, flexShrink: 0,
      }}>
        {item.category === 'hvac' && '❄️'}
        {item.category === 'plumbing' && '🚰'}
        {item.category === 'appliance' && '🍳'}
        {item.category === 'electrical' && '⚡'}
        {item.category === 'other' && '🔨'}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
          <span style={{ fontSize: 10, color: DIM, textTransform: 'uppercase', letterSpacing: .8, fontWeight: 700, fontFamily: "'DM Mono',monospace" }}>
            {item.room}
          </span>
          <span style={{ color: accent, opacity: .4 }}>·</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: D }}>{item.name}</span>
          {item.pinned && (
            <span style={{
              background: O, color: '#fff',
              padding: '1px 7px', borderRadius: 100,
              fontSize: 9, fontWeight: 800, letterSpacing: .6, textTransform: 'uppercase',
              fontFamily: "'DM Mono',monospace",
              marginLeft: 'auto',
            }}>Pinned by AI</span>
          )}
        </div>
        <div style={{ fontFamily: "'Fraunces',serif", fontSize: 14, fontWeight: 600, color: D, lineHeight: 1.25 }}>
          {item.brand} · {item.model}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3, fontSize: 11.5, color: DIM, flexWrap: 'wrap' }}>
          <span>{item.installedYear} ({age}yr)</span>
          {item.lastServiced && (
            <>
              <span style={{ opacity: .4 }}>·</span>
              <span>Serviced {item.lastServiced}</span>
            </>
          )}
          {item.condition && (
            <>
              <span style={{ opacity: .4 }}>·</span>
              <span style={{ color: item.condition === 'good' ? G : item.condition === 'fair' ? AMBER : RED, fontWeight: 700, textTransform: 'capitalize' }}>
                {item.condition}
              </span>
            </>
          )}
          {item.overdue && (
            <span style={{
              background: `${AMBER}14`, color: AMBER,
              padding: '2px 7px', borderRadius: 100,
              fontSize: 10, fontWeight: 800, letterSpacing: .5, textTransform: 'uppercase',
              fontFamily: "'DM Mono',monospace",
              marginLeft: 2,
            }}>⚠ Overdue</span>
          )}
        </div>
      </div>
    </div>
  );
}

function IQOverview({ items }: { items: InventoryItem[] }) {
  const counts = items.reduce<Record<string, number>>((acc, it) => {
    acc[it.category] = (acc[it.category] || 0) + 1;
    return acc;
  }, {});
  const groups: { id: InventoryItem['category']; icon: string; label: string }[] = [
    { id: 'hvac', icon: '❄️', label: 'HVAC' },
    { id: 'plumbing', icon: '🚰', label: 'Plumbing' },
    { id: 'appliance', icon: '🍳', label: 'Appliances' },
    { id: 'electrical', icon: '⚡', label: 'Electrical' },
  ];
  return (
    <div style={{
      background: '#fff', borderRadius: 20, border: `1px solid ${BORDER}`,
      padding: 20, marginBottom: 14,
      boxShadow: '0 20px 60px -24px rgba(0,0,0,.08)',
      animation: 'fadeSlide 0.3s ease',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <div style={{
          width: 34, height: 34, borderRadius: 10,
          background: `${O}14`, border: `1px solid ${O}33`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 16, flexShrink: 0,
        }}>🧠</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "'Fraunces',serif", fontSize: 16, fontWeight: 700, color: D, lineHeight: 1.2 }}>
            Property IQ
          </div>
          <div style={{ fontSize: 11, color: DIM, marginTop: 2, fontFamily: "'DM Mono',monospace", letterSpacing: .6, textTransform: 'uppercase' }}>
            {items.length} items on file · scanned 14d ago
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
        {groups.map(g => (
          <div key={g.id} style={{
            padding: '12px 14px', borderRadius: 12,
            background: 'rgba(0,0,0,.02)', border: `1px solid ${BORDER}`,
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <span style={{ fontSize: 18 }}>{g.icon}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: D }}>{g.label}</div>
              <div style={{ fontSize: 11, color: DIM, fontFamily: "'DM Mono',monospace" }}>
                {counts[g.id] || 0} {counts[g.id] === 1 ? 'item' : 'items'}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div style={{
        marginTop: 12, paddingTop: 12, borderTop: `1px dashed ${BORDER}`,
        fontSize: 11.5, color: DIM, lineHeight: 1.5,
      }}>
        💡 Homie narrows this list the moment a category is inferred from chat.
      </div>
    </div>
  );
}

function IQEmptyState() {
  return (
    <div style={{
      background: '#fff', borderRadius: 20, border: `1px dashed ${BORDER}`,
      padding: 20, marginBottom: 14,
      animation: 'fadeSlide 0.3s ease',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <div style={{
          width: 34, height: 34, borderRadius: 10,
          background: 'rgba(0,0,0,.04)', border: `1px solid ${BORDER}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 16, flexShrink: 0, opacity: .6,
        }}>🧠</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "'Fraunces',serif", fontSize: 16, fontWeight: 700, color: D, lineHeight: 1.2 }}>
            Property IQ
          </div>
          <div style={{ fontSize: 11, color: DIM, marginTop: 2, fontFamily: "'DM Mono',monospace", letterSpacing: .6, textTransform: 'uppercase' }}>
            Nothing on file yet
          </div>
        </div>
      </div>
      <div style={{ fontSize: 13, color: D, lineHeight: 1.5, marginBottom: 10 }}>
        Run a quick scan of the property so Homie can remember brands, models, and service history for next time.
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button style={{
          background: O, color: '#fff', border: 'none',
          borderRadius: 100, padding: '8px 14px',
          fontSize: 12, fontWeight: 700, cursor: 'pointer',
          fontFamily: "'DM Sans',sans-serif",
        }}>Run property scan →</button>
        <button style={{
          background: 'transparent', color: D, border: `1px solid ${BORDER}`,
          borderRadius: 100, padding: '8px 14px',
          fontSize: 12, fontWeight: 700, cursor: 'pointer',
          fontFamily: "'DM Sans',sans-serif",
        }}>Skip — record as we go</button>
      </div>
    </div>
  );
}

// ─── RIGHT PANEL · Homie listening card (diagnosis + checklist) ─────────────

function HomieListeningCard() {
  const checklist: { done: boolean; txt: string; next?: boolean }[] = [
    { done: true, txt: 'Property selected' },
    { done: true, txt: 'Category inferred (HVAC)' },
    { done: true, txt: 'Problem area located' },
    { done: false, txt: 'Severity assessed', next: true },
    { done: false, txt: 'Dispatch brief ready' },
  ];
  return (
    <div style={{
      background: '#fff', borderRadius: 24, border: `1px solid ${BORDER}`,
      padding: '24px 24px 22px', boxShadow: '0 20px 60px -24px rgba(0,0,0,.1)',
      marginBottom: 14,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: O, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
          <svg width={18} height={18} viewBox="0 0 24 24" fill="none">
            <path d="M12 2l2 7 7 2-7 2-2 7-2-7-7-2 7-2 2-7z" fill="#fff" />
          </svg>
          <span style={{ position: 'absolute', top: -2, right: -2, width: 10, height: 10, borderRadius: '50%', background: G, border: '2px solid #fff', animation: 'pulse 1.8s infinite' }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "'Fraunces',serif", fontWeight: 700, fontSize: 18, color: D }}>homie is listening</div>
          <div style={{ fontSize: 12, color: DIM, fontFamily: "'DM Mono',monospace" }}>updates as you chat</div>
        </div>
      </div>

      {/* Diagnosis grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, padding: 14, borderRadius: 14, background: W, marginBottom: 18 }}>
        <KV label="Problem" value="Upstairs AC not cooling" accent="serif" />
        <KV label="Category" value="HVAC" accent="serif-bold" />
        <KV label="Severity" value="Medium" accent="amber" />
        <KV label="Est." value="$180 – $320" accent="serif-bold" />
      </div>

      {/* Checklist */}
      <div style={{ fontSize: 11, color: DIM, textTransform: 'uppercase', letterSpacing: 1.4, fontWeight: 700, marginBottom: 10, fontFamily: "'DM Mono',monospace" }}>Checklist</div>
      <div style={{ display: 'grid', gap: 6 }}>
        {checklist.map((p, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 10,
            background: p.done ? 'rgba(27,158,119,.07)' : 'transparent',
            border: `1px solid ${p.done ? 'rgba(27,158,119,.2)' : 'transparent'}`,
          }}>
            <div style={{
              width: 18, height: 18, borderRadius: '50%',
              background: p.done ? G : 'transparent',
              border: p.done ? 'none' : `1.5px solid ${BORDER}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontSize: 10, fontWeight: 700, flexShrink: 0,
            }}>{p.done && '✓'}</div>
            <div style={{ flex: 1, fontSize: 13, color: p.done ? D : DIM, fontWeight: p.done ? 600 : 500 }}>
              {p.txt}
            </div>
            {p.next && (
              <span style={{ fontSize: 10, color: O, fontFamily: "'DM Mono',monospace", letterSpacing: 1, fontWeight: 700 }}>NEXT</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function KV({ label, value, accent }: { label: string; value: string; accent: 'serif' | 'serif-bold' | 'amber' }) {
  const color = accent === 'amber' ? AMBER : D;
  const weight = accent === 'serif-bold' || accent === 'amber' ? 700 : 600;
  return (
    <div>
      <div style={{ fontSize: 10, color: DIM, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700 }}>{label}</div>
      <div style={{ fontFamily: "'Fraunces',serif", fontSize: 15, fontWeight: weight, color, marginTop: 3, lineHeight: 1.25 }}>
        {value}
      </div>
    </div>
  );
}

// ─── RIGHT PANEL · Pros-nearby + assurance cards ────────────────────────────

function ProsNearbyBadge() {
  return (
    <div style={{
      padding: '10px 14px', borderRadius: 12, marginBottom: 14,
      background: `linear-gradient(90deg, ${O}14, ${O}06)`,
      border: `1px solid ${O}22`,
      display: 'flex', alignItems: 'center', gap: 10,
    }}>
      <div style={{ position: 'relative', width: 10, height: 10, flexShrink: 0 }}>
        <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: G }} />
        <span style={{ position: 'absolute', inset: -4, borderRadius: '50%', background: G, opacity: .25, animation: 'pulse 2s infinite' }} />
      </div>
      <div style={{ fontSize: 12.5, color: D, fontWeight: 600, flex: 1, minWidth: 0 }}>
        <span style={{ color: O, fontWeight: 700 }}>11 HVAC pros</span>
        <span style={{ color: DIM, fontWeight: 500 }}> available near you</span>
      </div>
      <div style={{ fontSize: 10, color: DIM, fontFamily: "'DM Mono',monospace", letterSpacing: 1, fontWeight: 700, textTransform: 'uppercase' }}>Live</div>
    </div>
  );
}

// ─── MOBILE PREVIEW ─────────────────────────────────────────────────────────
//
// Renders the same conversation + context inside a phone-shaped frame so
// reviewers can feel the narrow-viewport version. Single-column layout:
// sticky property strip up top (occupancy + expandable calendar), chat +
// DirectInput in the middle, then the right-panel cards stacked below.

function MobileFrame({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'center', alignItems: 'flex-start',
      padding: '40px 16px 60px', minHeight: 'calc(100vh - 48px)',
    }}>
      {/* Phone shell — rounded rect with a subtle inner shadow */}
      <div style={{
        width: 402, height: 844,
        background: '#000', borderRadius: 54,
        padding: 12,
        boxShadow: '0 30px 90px rgba(0,0,0,.55), 0 0 0 2px rgba(255,255,255,.05)',
        position: 'relative',
      }}>
        {/* Dynamic-island-style notch */}
        <div style={{
          position: 'absolute', top: 18, left: '50%', transform: 'translateX(-50%)',
          width: 124, height: 36, background: '#000', borderRadius: 20, zIndex: 10,
          boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.04)',
        }} />
        {/* Screen */}
        <div style={{
          width: '100%', height: '100%',
          background: W, borderRadius: 42, overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
        }}>
          {children}
        </div>
      </div>
    </div>
  );
}

function MobileLayout({ scenario: s, memoryState }: { scenario: Scenario; memoryState: MemoryState }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', fontFamily: "'DM Sans', sans-serif" }}>
      {/* Status bar fake */}
      <div style={{
        padding: '14px 26px 6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        fontSize: 13, fontWeight: 700, color: D, flexShrink: 0,
      }}>
        <span>9:41</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
          📶 🔋
        </span>
      </div>

      {/* Nav */}
      <MobileNav />

      {/* Scrollable body */}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
        <MobilePropertyStrip scenario={s} />

        <div style={{ padding: '12px 16px 24px' }}>
          {/* Chat */}
          <MobileChat scenario={s} memoryState={memoryState} />

          {/* Category pills (compact, 3 per row) */}
          <div style={{ marginTop: 16, marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
              <span style={{ fontSize: 9, fontFamily: "'DM Mono',monospace", letterSpacing: 1.4, textTransform: 'uppercase', color: DIM, fontWeight: 700 }}>Repair · common</span>
              <span style={{ height: 1, flex: 1, background: BORDER }} />
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {REPAIR_PILLS.slice(0, 6).map(p => (
                <button key={p.id} style={{
                  background: p.active ? `${O}14` : '#fff',
                  color: p.active ? O : D,
                  border: `1px solid ${p.active ? O : BORDER}`,
                  borderRadius: 100, padding: '7px 10px', fontSize: 12, fontWeight: 600,
                  cursor: 'pointer', fontFamily: "'DM Sans',sans-serif",
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                }}>
                  <span style={{ fontSize: 13 }}>{p.icon}</span>
                  {p.label}
                  {p.active && <span style={{ fontSize: 8, fontFamily: "'DM Mono',monospace", letterSpacing: .8, color: O, fontWeight: 700, marginLeft: 3 }}>AI</span>}
                </button>
              ))}
            </div>
            <button style={{
              marginTop: 8, width: '100%', background: 'transparent',
              border: `1px dashed ${BORDER}`, borderRadius: 100,
              padding: '8px 12px', fontSize: 11, fontWeight: 600, color: DIM,
              cursor: 'pointer', fontFamily: "'DM Sans',sans-serif",
            }}>+ 10 more · cleaning, landscape, painting…</button>
          </div>

          {/* DirectInput (compact) */}
          <MobileDirectInput />

          {/* Continue stub */}
          <button style={{
            marginTop: 12, width: '100%',
            background: `${O}0f`, color: DIM,
            border: `1px dashed ${O}55`, borderRadius: 14,
            padding: '14px', fontSize: 13, fontWeight: 700,
            cursor: 'default', fontFamily: "'DM Sans',sans-serif",
          }}>
            Continue — confirm timing &amp; tier →
          </button>

          {/* Bottom context stack — replaces desktop right panel */}
          <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <MobileHomieThinksCard />
            <MobilePropertyIQCard state={memoryState} />
            <MobileProsNearby />
            <MobileChecklist />
            <MobileAssurance />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Mobile · Nav ────────────────────────────────────────────────────────────

function MobileNav() {
  return (
    <div style={{
      padding: '8px 16px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      borderBottom: `1px solid ${BORDER}`, flexShrink: 0, background: '#fff',
    }}>
      <button style={{ background: 'transparent', border: 'none', fontSize: 22, color: DIM, cursor: 'pointer', padding: 0, width: 32 }}>‹</button>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <svg width={22} height={22} viewBox="0 0 48 48">
          <rect width="48" height="48" rx="14" fill={O} />
          <path d="M24 12L10 23H14V35H21V28H27V35H34V23H38L24 12Z" fill="#fff" />
          <circle cx="24" cy="22" r="3" fill={O} />
        </svg>
        <span style={{ fontFamily: "'Fraunces', serif", fontSize: 17, fontWeight: 700, color: D }}>homie</span>
        <span style={{ fontSize: 11, color: DIM, fontWeight: 600 }}>· Business</span>
      </div>
      <div style={{ width: 32 }} />
    </div>
  );
}

// ─── Mobile · Sticky property strip ─────────────────────────────────────────

function MobilePropertyStrip({ scenario: s }: { scenario: Scenario }) {
  const [calOpen, setCalOpen] = useState(false);
  const r = s.reservation;
  const isOccupied = r?.status === 'checked_in';

  return (
    <div style={{
      background: '#fff', borderBottom: `1px solid ${BORDER}`, padding: '12px 16px',
      position: 'sticky', top: 0, zIndex: 5,
    }}>
      {/* Property + chevron */}
      <button style={{
        width: '100%', background: 'transparent', border: 'none', padding: 0,
        display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
        fontFamily: "'DM Sans',sans-serif", textAlign: 'left',
      }}>
        <span style={{ fontSize: 18, flexShrink: 0 }}>🏠</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "'Fraunces',serif", fontSize: 15, fontWeight: 700, color: D, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {s.property.name}
          </div>
          <div style={{ fontSize: 10.5, color: DIM, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {s.property.address}
          </div>
        </div>
        <span style={{ color: DIM, fontSize: 12 }}>▾</span>
      </button>

      {/* Status + occupancy pills */}
      <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
        <StatusPill online />
        {isOccupied && r && (
          <OccupancyPill color={RED} dot label={`Occupied · until ${r.endDate}`} />
        )}
        {r?.status === 'upcoming' && (
          <OccupancyPill color={G} label={`Vacant · next ${r.startDate}`} />
        )}
        {!r && (
          <OccupancyPill color={DIM} label="PMS not connected" />
        )}
      </div>

      {/* Dispatch calendar toggle */}
      {s.calendar.length > 0 && (
        <>
          <button
            onClick={() => setCalOpen(o => !o)}
            style={{
              marginTop: 10, width: '100%',
              background: calOpen ? `${O}0a` : 'rgba(0,0,0,.02)',
              border: `1px solid ${calOpen ? O + '33' : BORDER}`,
              borderRadius: 10, padding: '7px 10px',
              display: 'flex', alignItems: 'center', gap: 8,
              fontSize: 11.5, fontWeight: 700, color: D,
              cursor: 'pointer', fontFamily: "'DM Sans',sans-serif",
              textAlign: 'left',
            }}
          >
            <span style={{ fontSize: 13 }}>📅</span>
            <span style={{ flex: 1 }}>
              Best dispatch windows
              <span style={{ color: DIM, fontWeight: 500, marginLeft: 5 }}>· {s.calendar.length} upcoming</span>
            </span>
            <span style={{
              fontSize: 9, color: calOpen ? O : DIM, fontFamily: "'DM Mono',monospace",
              transform: calOpen ? 'rotate(180deg)' : 'rotate(0)',
              transition: 'transform .2s',
            }}>▾</span>
          </button>
          {calOpen && (
            <div style={{
              marginTop: 8, padding: 10, borderRadius: 10,
              background: '#fff', border: `1px solid ${BORDER}`,
              boxShadow: '0 4px 14px -8px rgba(0,0,0,.08)',
            }}>
              <MiniCalendar reservations={s.calendar} />
              <div style={{
                marginTop: 8, padding: '6px 8px', borderRadius: 6,
                background: `${G}0f`, border: `1px solid ${G}22`,
                fontSize: 10.5, color: D, lineHeight: 1.4,
              }}>
                <strong style={{ color: G }}>Open days</strong> are safe windows.
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Mobile · Chat ───────────────────────────────────────────────────────────

function MobileChat({ scenario: s, memoryState }: { scenario: Scenario; memoryState: MemoryState }) {
  return (
    <div style={{ marginTop: 4 }}>
      <AssistantMsg text={`What's going on at ${s.property.name}?`} animate={false} />
      <UserMsg text="Upstairs AC isn't cooling — blowing warm air all afternoon." />

      {/* Special Property IQ inline bubble — appears ONLY when we have HVAC
          context AND inventory data. Mobile-specific pattern that replaces
          the right-panel card with an AI reference directly in chat. */}
      {memoryState === 'hvac' && (
        <PropertyIQInlineBubble />
      )}
      {memoryState === 'empty' && (
        <AssistantMsg text={"Got it — sounds like an HVAC issue. What brand is the upstairs AC, if you know?"} animate={false} />
      )}
      {memoryState === 'all' && (
        <AssistantMsg text={"Got it — HVAC. Upstairs unit? I have 2 HVAC systems on file for this property."} animate={false} />
      )}

      <UserMsg text="Yeah, the upstairs Trane." />
      <AssistantMsg text={"Perfect. When did it start?"} animate={false} />
    </div>
  );
}

function PropertyIQInlineBubble() {
  return (
    <div style={{
      display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 12,
    }}>
      <div style={{
        width: 30, height: 30, borderRadius: 10, background: O,
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <span style={{ color: 'white', fontFamily: "'Fraunces', serif", fontWeight: 700, fontSize: 14 }}>h</span>
      </div>
      <div style={{
        background: '#fff', padding: '10px 12px', borderRadius: '14px 14px 14px 4px',
        maxWidth: '85%',
        border: `1px solid ${O}33`,
        boxShadow: `0 2px 8px -2px ${O}22`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
          <span style={{
            fontSize: 9, fontFamily: "'DM Mono',monospace", letterSpacing: 1,
            textTransform: 'uppercase', color: O, fontWeight: 800,
            background: `${O}14`, padding: '2px 6px', borderRadius: 4,
          }}>🧠 Property IQ</span>
        </div>
        <div style={{ fontSize: 13.5, color: D, lineHeight: 1.5, marginBottom: 8 }}>
          I have this on file — is this the one?
        </div>
        {/* Pinned item — compact card inside bubble */}
        <div style={{
          padding: 10, borderRadius: 10,
          background: `${O}0a`, border: `1px solid ${O}22`,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <div style={{
            width: 28, height: 28, borderRadius: 8, background: O,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 14, flexShrink: 0,
          }}>❄️</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 9, color: DIM, textTransform: 'uppercase', letterSpacing: .8, fontWeight: 700, fontFamily: "'DM Mono',monospace" }}>
              Upstairs
            </div>
            <div style={{ fontFamily: "'Fraunces',serif", fontSize: 13, fontWeight: 700, color: D, lineHeight: 1.2 }}>
              Trane XR16
            </div>
            <div style={{ fontSize: 10.5, color: DIM, marginTop: 1 }}>
              2019 (6yr) · Serviced Jun 2024
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Mobile · DirectInput ────────────────────────────────────────────────────

function MobileDirectInput() {
  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <span style={{ height: 1, flex: '0 0 14px', background: BORDER }} />
        <span style={{ fontSize: 9, fontFamily: "'DM Mono',monospace", letterSpacing: 1.5, textTransform: 'uppercase', color: DIM, fontWeight: 700 }}>or just describe it</span>
        <span style={{ height: 1, flex: 1, background: BORDER }} />
      </div>
      <div style={{
        background: '#fff', borderRadius: 16,
        border: `2px solid ${BORDER}`,
        boxShadow: '0 8px 24px -14px rgba(0,0,0,.08)',
        padding: '14px 14px 12px',
      }}>
        <div style={{
          minHeight: 48,
          fontFamily: "'Fraunces',serif", fontSize: 15, lineHeight: 1.3,
          color: DIM, letterSpacing: '-.01em',
        }}>
          Describe it here, or chat with Homie by video or voice below.
        </div>
        <div style={{ display: 'flex', gap: 5, alignItems: 'center', marginTop: 10, paddingTop: 10, borderTop: `1px solid ${BORDER}`, flexWrap: 'wrap' }}>
          <MobileUploadBtn icon="camera" label="Photo" />
          <MobileUploadBtn icon="video" label="Video" />
          <MobileUploadBtn icon="mic" label="Voice" />
        </div>
      </div>
    </div>
  );
}

function MobileUploadBtn({ icon, label }: { icon: 'camera' | 'video' | 'mic'; label: string }) {
  return (
    <button style={{
      background: W, border: `1px solid ${BORDER}`, color: D,
      borderRadius: 100, padding: '7px 11px',
      fontSize: 11.5, fontWeight: 600, cursor: 'pointer',
      display: 'inline-flex', alignItems: 'center', gap: 6,
      fontFamily: "'DM Sans',sans-serif",
    }}>
      {icon === 'camera' && (
        <svg width="12" height="10" viewBox="0 0 24 20" fill="none">
          <path d="M3 5h4l2-2h6l2 2h4v12H3V5z" stroke={D} strokeWidth="1.8" />
          <circle cx="12" cy="11" r="3.5" stroke={D} strokeWidth="1.8" />
        </svg>
      )}
      {icon === 'video' && (
        <svg width="12" height="10" viewBox="0 0 24 20" fill="none">
          <rect x="2" y="4" width="14" height="12" rx="2" stroke={D} strokeWidth="1.8" />
          <path d="M16 9l6-3v8l-6-3V9z" stroke={D} strokeWidth="1.8" strokeLinejoin="round" />
        </svg>
      )}
      {icon === 'mic' && (
        <svg width="10" height="11" viewBox="0 0 18 20" fill="none">
          <rect x="6" y="1" width="6" height="11" rx="3" stroke={D} strokeWidth="1.8" />
          <path d="M3 10c0 3.3 2.7 6 6 6s6-2.7 6-6M9 16v3" stroke={D} strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      )}
      {label}
    </button>
  );
}

// ─── Mobile · Compact context cards (below chat) ────────────────────────────

function MobileHomieThinksCard() {
  return (
    <div style={{
      padding: 12, borderRadius: 14, background: '#fff',
      border: `1px solid ${BORDER}`, boxShadow: '0 6px 20px -12px rgba(0,0,0,.08)',
      display: 'flex', gap: 10, alignItems: 'center',
    }}>
      <div style={{
        width: 34, height: 34, borderRadius: 9, background: `${O}22`, border: `1px solid ${O}33`,
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0,
      }}>❄️</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 9, color: DIM, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700, fontFamily: "'DM Mono',monospace" }}>Homie thinks</div>
        <div style={{ fontFamily: "'Fraunces',serif", fontSize: 13.5, fontWeight: 700, color: D, lineHeight: 1.25 }}>
          Upstairs Trane XR16 not cooling
        </div>
        <div style={{ fontSize: 10.5, color: DIM, marginTop: 1 }}>
          <span style={{ color: AMBER, fontWeight: 700 }}>Medium</span>
          <span style={{ opacity: .4, margin: '0 5px' }}>·</span>
          <span style={{ color: D, fontWeight: 700 }}>$180 – $320</span>
        </div>
      </div>
    </div>
  );
}

function MobilePropertyIQCard({ state }: { state: MemoryState }) {
  if (state === 'empty') {
    return (
      <div style={{
        padding: 12, borderRadius: 14, background: '#fff',
        border: `1px dashed ${BORDER}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <span style={{ fontSize: 16, opacity: .6 }}>🧠</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: D }}>Property IQ</span>
          <span style={{ fontSize: 10, color: DIM, fontFamily: "'DM Mono',monospace", letterSpacing: .5, textTransform: 'uppercase' }}>Empty</span>
        </div>
        <div style={{ fontSize: 12, color: D, lineHeight: 1.5, marginBottom: 8 }}>
          Run a scan so Homie remembers brands + service history for next time.
        </div>
        <button style={{
          background: O, color: '#fff', border: 'none',
          borderRadius: 100, padding: '6px 12px', fontSize: 11, fontWeight: 700,
          cursor: 'pointer', fontFamily: "'DM Sans',sans-serif",
        }}>Run scan →</button>
      </div>
    );
  }
  const hvacItems = MOCK_INVENTORY.filter(i => i.category === 'hvac');
  const items = state === 'hvac' ? hvacItems : MOCK_INVENTORY.slice(0, 5);
  return (
    <div style={{
      padding: 12, borderRadius: 14, background: '#fff',
      border: `1px solid ${BORDER}`, boxShadow: '0 6px 20px -12px rgba(0,0,0,.08)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 14 }}>🧠</span>
        <span style={{ fontFamily: "'Fraunces',serif", fontSize: 13, fontWeight: 700, color: D }}>
          Property IQ{state === 'hvac' ? ' · HVAC' : ''}
        </span>
        <span style={{ fontSize: 9, color: DIM, fontFamily: "'DM Mono',monospace", letterSpacing: .5, textTransform: 'uppercase', marginLeft: 'auto' }}>
          {state === 'hvac' ? `${items.length} items` : `${MOCK_INVENTORY.length} total`}
        </span>
      </div>
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4, marginLeft: -2, marginRight: -2 }}>
        {items.map(item => (
          <MobileIQChip key={item.id} item={item} />
        ))}
      </div>
    </div>
  );
}

function MobileIQChip({ item }: { item: InventoryItem }) {
  const pinned = item.pinned;
  return (
    <div style={{
      flex: '0 0 auto',
      padding: '8px 10px', borderRadius: 10,
      background: pinned ? `${O}0d` : 'rgba(0,0,0,.02)',
      border: `1px solid ${pinned ? `${O}44` : BORDER}`,
      minWidth: 160, maxWidth: 200,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <span style={{ fontSize: 12 }}>
          {item.category === 'hvac' && '❄️'}
          {item.category === 'plumbing' && '🚰'}
          {item.category === 'appliance' && '🍳'}
          {item.category === 'electrical' && '⚡'}
          {item.category === 'other' && '🔨'}
        </span>
        <span style={{ fontSize: 9, color: DIM, textTransform: 'uppercase', letterSpacing: .8, fontWeight: 700, fontFamily: "'DM Mono',monospace" }}>
          {item.room}
        </span>
        {pinned && (
          <span style={{
            background: O, color: '#fff',
            padding: '1px 5px', borderRadius: 100,
            fontSize: 7.5, fontWeight: 800, letterSpacing: .5, textTransform: 'uppercase',
            fontFamily: "'DM Mono',monospace",
            marginLeft: 'auto',
          }}>AI</span>
        )}
      </div>
      <div style={{ fontFamily: "'Fraunces',serif", fontSize: 12, fontWeight: 700, color: D, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {item.brand} {item.model}
      </div>
      <div style={{ fontSize: 9.5, color: DIM, marginTop: 2 }}>
        {item.installedYear}
        {item.overdue && <span style={{ color: AMBER, fontWeight: 700, marginLeft: 4 }}>⚠ Overdue</span>}
      </div>
    </div>
  );
}

function MobileProsNearby() {
  return (
    <div style={{
      padding: '8px 12px', borderRadius: 12,
      background: `linear-gradient(90deg, ${O}14, ${O}06)`,
      border: `1px solid ${O}22`,
      display: 'flex', alignItems: 'center', gap: 8,
    }}>
      <div style={{ position: 'relative', width: 9, height: 9, flexShrink: 0 }}>
        <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: G }} />
        <span style={{ position: 'absolute', inset: -3, borderRadius: '50%', background: G, opacity: .25, animation: 'pulse 2s infinite' }} />
      </div>
      <div style={{ fontSize: 11.5, color: D, fontWeight: 600, flex: 1, minWidth: 0 }}>
        <span style={{ color: O, fontWeight: 700 }}>11 HVAC pros</span>
        <span style={{ color: DIM, fontWeight: 500 }}> near you</span>
      </div>
      <div style={{ fontSize: 8.5, color: DIM, fontFamily: "'DM Mono',monospace", letterSpacing: .8, fontWeight: 700, textTransform: 'uppercase' }}>Live</div>
    </div>
  );
}

function MobileChecklist() {
  const items = [
    { done: true, txt: 'Property selected' },
    { done: true, txt: 'Category inferred' },
    { done: true, txt: 'Problem area located' },
    { done: false, txt: 'Severity assessed', next: true },
    { done: false, txt: 'Dispatch brief ready' },
  ];
  return (
    <div style={{
      padding: 12, borderRadius: 14, background: '#fff',
      border: `1px solid ${BORDER}`,
    }}>
      <div style={{ fontSize: 10, color: DIM, textTransform: 'uppercase', letterSpacing: 1.2, fontWeight: 700, marginBottom: 8, fontFamily: "'DM Mono',monospace" }}>Checklist</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {items.map((p, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '5px 6px', borderRadius: 6,
            background: p.done ? 'rgba(27,158,119,.07)' : 'transparent',
          }}>
            <div style={{
              width: 14, height: 14, borderRadius: '50%',
              background: p.done ? G : 'transparent',
              border: p.done ? 'none' : `1.5px solid ${BORDER}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontSize: 8, fontWeight: 700, flexShrink: 0,
            }}>{p.done && '✓'}</div>
            <div style={{ flex: 1, fontSize: 11.5, color: p.done ? D : DIM, fontWeight: p.done ? 600 : 500 }}>
              {p.txt}
            </div>
            {p.next && <span style={{ fontSize: 8.5, color: O, fontFamily: "'DM Mono',monospace", letterSpacing: 1, fontWeight: 700 }}>NEXT</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

function MobileAssurance() {
  return (
    <div style={{
      padding: '10px 14px',
      background: `linear-gradient(135deg, ${D} 0%, #3A3430 100%)`,
      color: '#fff', borderRadius: 14, fontFamily: "'DM Sans',sans-serif",
      display: 'flex', alignItems: 'center', gap: 10,
    }}>
      <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(255,255,255,.14)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, flexShrink: 0 }}>⚡</div>
      <div>
        <div style={{ fontSize: 12, fontWeight: 700 }}>Quotes in ~2 minutes</div>
        <div style={{ fontSize: 10.5, opacity: .75, marginTop: 1 }}>No calling around. No forms.</div>
      </div>
    </div>
  );
}

// ─── End mobile preview ─────────────────────────────────────────────────────

function AssuranceCard() {
  const style: CSSProperties = {
    padding: '14px 18px',
    background: `linear-gradient(135deg, ${D} 0%, #3A3430 100%)`,
    color: '#fff', borderRadius: 16, fontFamily: "'DM Sans',sans-serif",
    display: 'flex', alignItems: 'center', gap: 12,
    boxShadow: `0 10px 30px -12px ${D}66`,
  };
  return (
    <div style={style}>
      <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'rgba(255,255,255,.14)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>⚡</div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700 }}>Quotes in ~2 minutes</div>
        <div style={{ fontSize: 12, opacity: .75, marginTop: 2 }}>No calling around. No endless forms.</div>
      </div>
    </div>
  );
}
