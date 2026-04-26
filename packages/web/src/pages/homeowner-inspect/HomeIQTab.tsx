import { useEffect, useMemo, useState, useCallback } from 'react';
import { O, G, D } from './constants';
import {
  inspectService,
  type PortalReport,
  type HomeIQData,
  type HomeIQSystemBreakdown,
  type HomeIQGrade,
  type HomeIQInsightType,
  type HomeIQHazardCard,
} from '@/services/inspector-api';
import type { Tab } from './constants';

// ──────────────────────────────────────────────────────────────────────────
// Home IQ tab — wired to the real backend.
//
//   GET /api/v1/account/reports/:id/home-iq
//
// First open per report triggers per-category Claude assessments + hazard
// lookups (typical 5–10s). Subsequent opens return cached data instantly.
// The "Refresh" button forces regeneration after the homeowner edits items.
// ──────────────────────────────────────────────────────────────────────────

interface HomeIQTabProps {
  reports: PortalReport[];
  onNavigate: (tab: Tab) => void;
}

const ACCENT = '#2563EB';
const RED = '#DC2626';
const AMBER = '#D97706';
const GREEN = '#10B981';

const GRADE_COLOR: Record<HomeIQGrade, string> = {
  Excellent: GREEN, Good: GREEN, Fair: AMBER, Poor: RED, Critical: RED,
};

const INSIGHT_BADGE_COLOR: Record<HomeIQInsightType, string> = {
  bundle: ACCENT, lifespan: AMBER, hazard: AMBER, 'cross-doc': '#7C3AED',
  recall: RED, insurance: RED, cohort: GREEN,
};

const INSIGHT_ICON: Record<HomeIQInsightType, string> = {
  bundle: '🧩', lifespan: '⏳', hazard: '⛈️', 'cross-doc': '🔗',
  recall: '⚠️', insurance: '🛡️', cohort: '📊',
};

const LIFESPAN_COLOR: Record<'green' | 'amber' | 'red', string> = {
  green: GREEN, amber: AMBER, red: RED,
};

// ── Main component ────────────────────────────────────────────────────────

export default function HomeIQTab({ reports, onNavigate }: HomeIQTabProps) {
  const parsedReports = useMemo(
    () => reports.filter(r => r.parsingStatus === 'parsed' || r.parsingStatus === 'review_pending' || r.parsingStatus === 'sent_to_client'),
    [reports],
  );
  const [activeReportId, setActiveReportId] = useState<string | null>(() => parsedReports[0]?.id ?? null);
  const [data, setData] = useState<HomeIQData | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedSystem, setSelectedSystem] = useState<string | null>(null);

  // Reset selection if the user picks a different report.
  useEffect(() => { setSelectedSystem(null); }, [activeReportId]);

  // If reports load after mount and we still have no active report, pick the first parsed one.
  useEffect(() => {
    if (!activeReportId && parsedReports.length > 0) {
      setActiveReportId(parsedReports[0].id);
    }
  }, [parsedReports, activeReportId]);

  const fetchHomeIQ = useCallback(async (reportId: string, refresh = false) => {
    if (refresh) setRefreshing(true); else setLoading(true);
    setError(null);
    try {
      const res = await inspectService.getHomeIQ(reportId, { refresh });
      if (res.error || !res.data) {
        setError(res.error ?? 'Failed to load Home IQ');
        setData(null);
      } else {
        setData(res.data);
      }
    } catch (err) {
      setError((err as Error).message ?? 'Failed to load Home IQ');
      setData(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!activeReportId) return;
    setData(null);
    void fetchHomeIQ(activeReportId);
  }, [activeReportId, fetchHomeIQ]);

  const activeReport = parsedReports.find(r => r.id === activeReportId) ?? null;

  // ── Empty state — no parsed reports ─────────────────────────────────
  if (parsedReports.length === 0) {
    return (
      <div style={{ paddingBottom: 60 }}>
        <BrandHeader />
        <EmptyState onNavigate={onNavigate} />
      </div>
    );
  }

  // ── Detail view (early return) ──────────────────────────────────────
  if (selectedSystem && data) {
    const system = data.systems.find(s => s.key === selectedSystem);
    if (system) {
      return <SystemDetailView system={system} onBack={() => setSelectedSystem(null)} onNavigate={onNavigate} />;
    }
  }

  return (
    <div style={{ paddingBottom: 60 }}>
      <BrandHeader />

      {/* Title + report selector + refresh */}
      <div style={{ marginBottom: 24, display: 'flex', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ fontFamily: 'Fraunces, serif', fontSize: 28, fontWeight: 700, color: 'var(--bp-text)', margin: 0, lineHeight: 1.15 }}>
            How your home compares
          </h1>
          <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 14, color: 'var(--bp-subtle)', margin: '8px 0 0', maxWidth: 640 }}>
            Public-data benchmarks for {activeReport ? `${activeReport.propertyAddress}, ${activeReport.propertyCity}, ${activeReport.propertyState} ${activeReport.propertyZip}` : 'your home'}.
            {data?.cohort && ` Cohort comparisons use the ${data.property.decadeLabel ?? 'unknown decade'} build decade in the ${data.property.region} census region.`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {parsedReports.length > 1 && (
            <select
              value={activeReportId ?? ''}
              onChange={e => setActiveReportId(e.target.value)}
              style={{
                fontFamily: "'DM Sans',sans-serif", fontSize: 13, padding: '8px 12px',
                borderRadius: 10, border: '1px solid var(--bp-border)', background: 'var(--bp-card)', color: 'var(--bp-text)',
              }}
            >
              {parsedReports.map(r => (
                <option key={r.id} value={r.id}>{r.displayName ?? r.propertyAddress}</option>
              ))}
            </select>
          )}
          <button
            onClick={() => activeReportId && fetchHomeIQ(activeReportId, true)}
            disabled={refreshing || loading || !activeReportId}
            style={{
              all: 'unset', cursor: refreshing || loading ? 'default' : 'pointer',
              padding: '8px 14px', borderRadius: 10, background: 'var(--bp-card)',
              border: '1px solid var(--bp-border)', color: 'var(--bp-text)',
              fontFamily: "'DM Sans',sans-serif", fontSize: 13, fontWeight: 600,
              opacity: refreshing || loading ? 0.5 : 1,
            }}
            title="Re-run AI assessments + hazard lookups for this report"
          >
            {refreshing ? 'Refreshing…' : '↻ Refresh'}
          </button>
        </div>
      </div>

      {/* Loading state — initial generation can take up to ~10s */}
      {loading && (
        <LoadingState />
      )}

      {/* Error state */}
      {error && !loading && (
        <ErrorState
          message={error}
          onRetry={() => activeReportId && fetchHomeIQ(activeReportId)}
        />
      )}

      {/* Render the real payload */}
      {data && !loading && (
        <>
          {/* ── Panel 1: Cohort Snapshot ───────────────────────────────────── */}
          <SectionHeader
            title="Your home in context"
            subtitle="How this property compares to the typical home of its era and region"
          />

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: 32 }}>
            <SnapshotTile
              label="Year built"
              value={data.property.yearBuilt ? String(data.property.yearBuilt) : '—'}
              sub={data.property.decadeLabel ? `Cohort: ${data.property.decadeLabel}` : 'Year built not yet extracted from PDF'}
              color={D}
              icon={'📅'}
            />
            <SnapshotTile
              label="Items flagged"
              value={String(data.systems.reduce((s, sys) => s + sys.itemCount, 0))}
              sub={data.cohort
                ? `vs cohort avg ~${data.cohort.avgItemsFound.toFixed(1)} (${data.cohort.itemsDelta >= 0 ? '+' : ''}${data.cohort.itemsDelta.toFixed(1)})`
                : 'Cohort comparison unavailable'}
              color={data.cohort && data.cohort.itemsDelta < 0 ? G : data.cohort && data.cohort.itemsDelta < 5 ? AMBER : RED}
              icon={'📋'}
            />
            <SnapshotTile
              label="Region"
              value={data.property.region ?? '—'}
              sub={`ZIP ${data.property.zip}`}
              color={ACCENT}
              icon={'📍'}
            />
            {data.cohort && (
              <SnapshotTile
                label="Cohort median sqft"
                value={data.cohort.medianSqft.toLocaleString()}
                sub={`Median for ${data.property.decadeLabel ?? 'this cohort'} homes in your region`}
                color={D}
                icon={'📐'}
              />
            )}
          </div>

          {data.cohort && <SourceNote text={data.cohort.sourceNote} />}
          {!data.cohort && data.property.yearBuilt && (
            <SourceNote text={`Cohort data unavailable for ${data.property.region ?? 'this region'} — falling back to per-system AI assessment.`} />
          )}

          {/* ── Panel 3: System breakdown ─────────────────────────────────── */}
          <div style={{ marginTop: 36 }}>
            <SectionHeader
              title="Your home, system by system"
              subtitle="AI condition grade, estimated repair cost, and the top fix for each system. Click any card for full detail."
            />

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14, marginTop: 4 }}>
              {data.systems.map(sys => (
                <SystemCard key={sys.key} system={sys} onClick={() => setSelectedSystem(sys.key)} />
              ))}
            </div>

            <SourceNote text="Cost from inspection items · AI assessment per category · Smart insights from NAHB, AHS, FEMA, EPA, CPSC" />
          </div>

          {/* ── Panel 4: Hazard Context ───────────────────────────────────── */}
          {(data.hazards.flood || data.hazards.radon) && (
            <div style={{ marginTop: 36 }}>
              <SectionHeader
                title="Environmental & hazard context"
                subtitle="Public risk-data for the property's ZIP and county"
              />

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14, marginTop: 4 }}>
                {data.hazards.flood && (
                  <HazardCard icon={'🌊'} title="Flood zone" hazard={data.hazards.flood} />
                )}
                {data.hazards.radon && (
                  <HazardCard icon={'☢️'} title="Radon" hazard={data.hazards.radon} />
                )}
              </div>

              <SourceNote text="Sources: FEMA NFHL · EPA Map of Radon Zones" />
            </div>
          )}

          {/* Warnings (e.g. missing geocode, cohort unavailable) */}
          {data.warnings.length > 0 && <WarningsNote warnings={data.warnings} />}

          {/* Footer */}
          <div style={{
            marginTop: 40, padding: 18, borderRadius: 12,
            background: 'var(--bp-bg)', border: '1px dashed var(--bp-border)',
            fontFamily: "'DM Sans',sans-serif", fontSize: 13, color: 'var(--bp-muted)', lineHeight: 1.55,
          }}>
            <strong style={{ color: 'var(--bp-text)' }}>About Home IQ.</strong> A brand extension of Homie's Property IQ
            and consumer Home IQ surfaces — tuned for the inspection-report context. We use only public datasets
            (HUD American Housing Survey, FEMA, EPA, NAHB) plus the AI-extracted items and equipment from your
            inspection report. Last generated {timeAgo(data.generatedAt)}.
          </div>
        </>
      )}
    </div>
  );
}

// ── Brand header (same on all states) ─────────────────────────────────────

function BrandHeader() {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 8,
        padding: '4px 10px', borderRadius: 100,
        background: `${O}10`, border: `1px solid ${O}30`,
        fontFamily: "'DM Mono',monospace", fontSize: 10, fontWeight: 700,
        color: O, textTransform: 'uppercase', letterSpacing: '0.1em',
      }}>
        <span>{'🧠'}</span>
        <span>Home IQ</span>
        <span style={{ color: 'var(--bp-subtle)', fontWeight: 500 }}>· Beta</span>
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div style={{
      background: 'var(--bp-card)', border: '1px solid var(--bp-border)',
      borderRadius: 14, padding: 40, textAlign: 'center',
      fontFamily: "'DM Sans',sans-serif",
    }}>
      <div style={{ fontSize: 32, marginBottom: 12 }}>{'🧠'}</div>
      <div style={{ fontFamily: 'Fraunces, serif', fontSize: 18, fontWeight: 700, color: 'var(--bp-text)', marginBottom: 6 }}>
        Generating Home IQ…
      </div>
      <div style={{ fontSize: 13, color: 'var(--bp-subtle)', maxWidth: 420, margin: '0 auto', lineHeight: 1.5 }}>
        First-time generation runs a Claude assessment per system + queries FEMA & EPA. This usually takes 5–10 seconds. Subsequent loads will be instant.
      </div>
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div style={{
      background: 'var(--bp-card)', border: `1px solid ${RED}40`,
      borderRadius: 14, padding: 24, fontFamily: "'DM Sans',sans-serif",
    }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: RED, marginBottom: 6 }}>
        Couldn't load Home IQ
      </div>
      <div style={{ fontSize: 13, color: 'var(--bp-muted)', marginBottom: 14, lineHeight: 1.5 }}>
        {message}
      </div>
      <button onClick={onRetry} style={{
        all: 'unset', cursor: 'pointer', padding: '8px 14px', borderRadius: 10,
        background: ACCENT, color: '#fff', fontSize: 13, fontWeight: 700,
      }}>Try again</button>
    </div>
  );
}

function EmptyState({ onNavigate }: { onNavigate: (t: Tab) => void }) {
  return (
    <div style={{
      background: 'var(--bp-card)', border: '1px solid var(--bp-border)',
      borderRadius: 14, padding: 36, textAlign: 'center',
      fontFamily: "'DM Sans',sans-serif",
    }}>
      <div style={{ fontSize: 36, marginBottom: 12 }}>{'🏠'}</div>
      <h2 style={{ fontFamily: 'Fraunces, serif', fontSize: 20, fontWeight: 700, color: 'var(--bp-text)', margin: '0 0 8px' }}>
        Upload an inspection to unlock Home IQ
      </h2>
      <p style={{ fontSize: 13, color: 'var(--bp-subtle)', margin: '0 auto 18px', maxWidth: 480, lineHeight: 1.5 }}>
        Home IQ benchmarks each system in your home against public datasets — NAHB component lifespans, AHS cohort comparisons, FEMA flood zones, EPA radon zones, and more.
      </p>
      <button onClick={() => onNavigate('reports')} style={{
        all: 'unset', cursor: 'pointer', padding: '10px 18px', borderRadius: 10,
        background: ACCENT, color: '#fff', fontSize: 13, fontWeight: 700,
      }}>Go to My Reports {'→'}</button>
    </div>
  );
}

function WarningsNote({ warnings }: { warnings: string[] }) {
  const labels: Record<string, string> = {
    year_built_missing: 'Year built not extracted from this report — cohort comparisons disabled.',
    region_unknown: 'Property state not recognized — cohort comparisons disabled.',
    no_geocode: 'Property not yet geocoded — flood zone unavailable.',
    flood_lookup_failed: 'FEMA flood lookup failed — try refreshing in a moment.',
  };
  const visible = warnings.map(w => labels[w]).filter(Boolean);
  if (visible.length === 0) return null;
  return (
    <div style={{
      marginTop: 18, padding: '10px 14px', borderRadius: 10,
      background: 'var(--bp-bg)', border: '1px dashed var(--bp-border)',
      fontFamily: "'DM Sans',sans-serif", fontSize: 12, color: 'var(--bp-muted)', lineHeight: 1.5,
    }}>
      <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 9, fontWeight: 700, color: 'var(--bp-subtle)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>
        Notes
      </div>
      {visible.map((w, i) => <div key={i}>· {w}</div>)}
    </div>
  );
}

// ── System grid card ──────────────────────────────────────────────────────

function SystemCard({ system, onClick }: { system: HomeIQSystemBreakdown; onClick: () => void }) {
  const gradeColor = GRADE_COLOR[system.grade];
  const insightColor = INSIGHT_BADGE_COLOR[system.smartInsight.type];
  const isEmpty = system.itemCount === 0;
  const icon = SYSTEM_ICONS[system.key] ?? '🔧';

  return (
    <button
      onClick={onClick}
      style={{
        all: 'unset', cursor: 'pointer', display: 'block',
        background: 'var(--bp-card)', border: '1px solid var(--bp-border)',
        borderRadius: 14, padding: 18, transition: 'all 0.15s', position: 'relative',
        overflow: 'hidden',
      }}
      onMouseEnter={e => {
        const el = e.currentTarget;
        el.style.borderColor = gradeColor;
        el.style.boxShadow = `0 8px 28px -16px ${gradeColor}55`;
        el.style.transform = 'translateY(-2px)';
      }}
      onMouseLeave={e => {
        const el = e.currentTarget;
        el.style.borderColor = 'var(--bp-border)';
        el.style.boxShadow = 'none';
        el.style.transform = 'translateY(0)';
      }}
    >
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: gradeColor }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <span style={{
          width: 36, height: 36, borderRadius: 10, background: `${gradeColor}15`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18,
        }}>{icon}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: 'Fraunces, serif', fontSize: 18, fontWeight: 700, color: 'var(--bp-text)', lineHeight: 1.1 }}>
            {system.label}
          </div>
          <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 9, color: 'var(--bp-subtle)', textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: 3 }}>
            AI condition
          </div>
        </div>
        <span style={{
          padding: '5px 12px', borderRadius: 100,
          background: `${gradeColor}15`, color: gradeColor,
          border: `1px solid ${gradeColor}40`,
          fontFamily: "'DM Sans',sans-serif", fontSize: 11, fontWeight: 700,
        }}>{system.grade}</span>
      </div>

      <div style={{
        display: 'flex', alignItems: 'center', gap: 14, padding: '10px 12px',
        background: 'var(--bp-bg)', borderRadius: 10, marginBottom: 14,
      }}>
        <Stat label="Items" value={String(system.itemCount)} />
        <Divider />
        <Stat label="Est. cost" value={isEmpty ? '$0' : formatCostRange(system.costLowCents, system.costHighCents)} compact />
        <Divider />
        <SeverityDots counts={system.severityCounts} />
      </div>

      <div style={{ marginBottom: 14 }}>
        <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 9, color: 'var(--bp-subtle)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 5 }}>
          AI assessment
        </div>
        <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13, color: 'var(--bp-text)', lineHeight: 1.5 }}>
          {system.aiAssessmentShort}
        </div>
      </div>

      {system.topFix && !isEmpty && (
        <div style={{
          marginBottom: 12, padding: '10px 12px', borderRadius: 10,
          background: `${O}08`, border: `1px solid ${O}25`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <span style={{ fontSize: 11 }}>{'⚡'}</span>
            <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 9, color: O, textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700 }}>
              Top fix · {system.topFix.cost}
            </span>
          </div>
          <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12.5, color: 'var(--bp-text)', fontWeight: 600, lineHeight: 1.4 }}>
            {system.topFix.title}
          </div>
        </div>
      )}

      <div style={{
        padding: '10px 12px', borderRadius: 10,
        background: `${insightColor}08`, border: `1px solid ${insightColor}25`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <span style={{ fontSize: 11 }}>{INSIGHT_ICON[system.smartInsight.type]}</span>
          <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 9, color: insightColor, textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700 }}>
            {system.smartInsight.label}
          </span>
        </div>
        <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, color: 'var(--bp-muted)', lineHeight: 1.5 }}>
          {system.smartInsight.text}
        </div>
      </div>

      <div style={{
        marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--bp-border)',
        textAlign: 'right', fontFamily: "'DM Sans',sans-serif", fontSize: 12,
        color: ACCENT, fontWeight: 600,
      }}>
        View {system.label.toLowerCase()} detail {'→'}
      </div>
    </button>
  );
}

const SYSTEM_ICONS: Record<string, string> = {
  plumbing: '💧', roofing: '🏠', hvac: '❄️', electrical: '⚡',
  structural: '🏗️', appliance: '📦', foundation: '🏛️',
};

function Stat({ label, value, compact }: { label: string; value: string; compact?: boolean }) {
  return (
    <div style={{ flex: compact ? 1.4 : 1, minWidth: 0 }}>
      <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 9, color: 'var(--bp-subtle)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>{label}</div>
      <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13, fontWeight: 700, color: 'var(--bp-text)' }}>{value}</div>
    </div>
  );
}

function Divider() {
  return <div style={{ width: 1, alignSelf: 'stretch', background: 'var(--bp-border)' }} />;
}

function SeverityDots({ counts }: { counts: { urgent: number; recommended: number; monitor: number } }) {
  const total = counts.urgent + counts.recommended + counts.monitor;
  if (total === 0) {
    return (
      <div style={{ flex: 1.2 }}>
        <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 9, color: 'var(--bp-subtle)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>Severity</div>
        <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13, fontWeight: 700, color: GREEN }}>{'—'}</div>
      </div>
    );
  }
  return (
    <div style={{ flex: 1.2 }}>
      <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 9, color: 'var(--bp-subtle)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Severity</div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        {counts.urgent > 0 && <SeverityBadge n={counts.urgent} color={RED} title="Urgent" />}
        {counts.recommended > 0 && <SeverityBadge n={counts.recommended} color={AMBER} title="Recommended" />}
        {counts.monitor > 0 && <SeverityBadge n={counts.monitor} color={'#9B9490'} title="Monitor" />}
      </div>
    </div>
  );
}

function SeverityBadge({ n, color, title }: { n: number; color: string; title: string }) {
  return (
    <span title={title} style={{
      width: 18, height: 18, borderRadius: '50%', background: color,
      color: '#fff', fontFamily: "'DM Sans',sans-serif", fontSize: 10, fontWeight: 700,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    }}>{n}</span>
  );
}

// ── System detail view ───────────────────────────────────────────────────

function SystemDetailView({ system, onBack, onNavigate }: { system: HomeIQSystemBreakdown; onBack: () => void; onNavigate: (tab: Tab) => void }) {
  const gradeColor = GRADE_COLOR[system.grade];
  const insightColor = INSIGHT_BADGE_COLOR[system.smartInsight.type];
  const icon = SYSTEM_ICONS[system.key] ?? '🔧';

  return (
    <div style={{ paddingBottom: 60 }}>
      <button onClick={onBack} style={{
        all: 'unset', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
        marginBottom: 20, color: ACCENT, fontFamily: "'DM Sans',sans-serif", fontSize: 13, fontWeight: 600,
      }}>
        {'←'} Back to Home IQ
      </button>

      <div style={{
        background: 'var(--bp-card)', border: '1px solid var(--bp-border)',
        borderRadius: 16, padding: 28, marginBottom: 24, position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: gradeColor }} />
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 18, marginBottom: 20 }}>
          <span style={{
            width: 60, height: 60, borderRadius: 14, background: `${gradeColor}15`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30,
          }}>{icon}</span>
          <div style={{ flex: 1 }}>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '4px 10px', borderRadius: 100,
              background: `${O}10`, border: `1px solid ${O}30`,
              fontFamily: "'DM Mono',monospace", fontSize: 9, fontWeight: 700,
              color: O, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8,
            }}>
              {'🧠'} Home IQ · System detail
            </div>
            <h1 style={{ fontFamily: 'Fraunces, serif', fontSize: 32, fontWeight: 700, color: 'var(--bp-text)', margin: 0, lineHeight: 1.1 }}>
              {system.label}
            </h1>
          </div>
          <span style={{
            padding: '8px 16px', borderRadius: 100,
            background: `${gradeColor}15`, color: gradeColor,
            border: `1px solid ${gradeColor}40`,
            fontFamily: "'DM Sans',sans-serif", fontSize: 14, fontWeight: 700,
          }}>{system.grade}</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
          <HeroStat label="Items flagged" value={String(system.itemCount)} color={D} />
          <HeroStat label="Est. repair cost" value={system.itemCount === 0 ? '$0' : formatCostRange(system.costLowCents, system.costHighCents)} color={O} />
          <HeroStat label="Urgent items" value={String(system.severityCounts.urgent)} color={system.severityCounts.urgent > 0 ? RED : GREEN} />
          {system.lifespan && <HeroStat label="Age vs typical" value={`${system.lifespan.age} / ${system.lifespan.typicalLow}–${system.lifespan.typicalHigh} yrs`} color={LIFESPAN_COLOR[system.lifespan.statusColor]} />}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)', gap: 24, alignItems: 'start' }}>
        <div style={{ display: 'grid', gap: 20 }}>
          <DetailCard title="AI assessment" eyebrow="Full analysis">
            <p style={{ margin: 0, fontFamily: "'DM Sans',sans-serif", fontSize: 14, color: 'var(--bp-text)', lineHeight: 1.7 }}>
              {system.aiAssessmentLong}
            </p>
          </DetailCard>

          <DetailCard title="Items in this system" eyebrow={`${system.itemCount} item${system.itemCount === 1 ? '' : 's'} from your inspection report`}>
            {system.items.length === 0 ? (
              <div style={{ padding: '20px 0', textAlign: 'center', fontFamily: "'DM Sans',sans-serif", fontSize: 13, color: 'var(--bp-subtle)' }}>
                No items flagged for this system.
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 10 }}>
                {system.items.map(item => <DetailItemRow key={item.id} item={item} />)}
              </div>
            )}
          </DetailCard>
        </div>

        <div style={{ display: 'grid', gap: 14, position: 'sticky', top: 16 }}>
          {system.topFix && system.itemCount > 0 && (
            <InsightTile
              icon={'⚡'} label={`Top fix · ${system.topFix.cost}`} color={O}
              title={system.topFix.title} body={system.topFix.rationale}
            />
          )}

          <InsightTile
            icon={INSIGHT_ICON[system.smartInsight.type]}
            label={system.smartInsight.label}
            color={insightColor}
            title={null}
            body={system.smartInsight.text}
          />

          {system.lifespan && (
            <DetailCard title="Lifespan tracker" eyebrow={`NAHB component lifespans · ${system.lifespan.componentLabel}`}>
              <LifespanBar age={system.lifespan.age} low={system.lifespan.typicalLow} high={system.lifespan.typicalHigh} color={LIFESPAN_COLOR[system.lifespan.statusColor]} />
              <div style={{ marginTop: 10, fontFamily: "'DM Sans',sans-serif", fontSize: 12, color: 'var(--bp-muted)', lineHeight: 1.5 }}>
                {system.lifespan.statusLabel}
              </div>
            </DetailCard>
          )}

          {system.itemCount > 0 && (
            <button
              onClick={() => {
                sessionStorage.setItem('hi_quotes_filter_category', system.key);
                onNavigate('quotes');
              }}
              style={{
                all: 'unset', cursor: 'pointer', textAlign: 'center',
                padding: '12px 16px', borderRadius: 12, background: ACCENT, color: '#fff',
                fontFamily: "'DM Sans',sans-serif", fontSize: 13, fontWeight: 700,
              }}
            >
              Get quotes for {system.label.toLowerCase()} items {'→'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function HeroStat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div>
      <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 9, color: 'var(--bp-subtle)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>{label}</div>
      <div style={{ fontFamily: 'Fraunces, serif', fontSize: 20, fontWeight: 700, color, lineHeight: 1.1 }}>{value}</div>
    </div>
  );
}

function DetailCard({ title, eyebrow, children }: { title: string; eyebrow: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: 'var(--bp-card)', border: '1px solid var(--bp-border)',
      borderRadius: 14, padding: 22,
    }}>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 10, fontWeight: 700, color: 'var(--bp-subtle)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>
          {eyebrow}
        </div>
        <h3 style={{ fontFamily: 'Fraunces, serif', fontSize: 18, fontWeight: 700, color: 'var(--bp-text)', margin: 0 }}>
          {title}
        </h3>
      </div>
      {children}
    </div>
  );
}

function DetailItemRow({ item }: { item: HomeIQSystemBreakdown['items'][number] }) {
  const sevColor = item.severity === 'safety_hazard' || item.severity === 'urgent' ? RED
    : item.severity === 'recommended' ? AMBER : '#9B9490';
  const sevLabel = item.severity === 'safety_hazard' ? 'Safety hazard'
    : item.severity === 'urgent' ? 'Urgent'
    : item.severity === 'recommended' ? 'Recommended'
    : 'Monitor';
  const cost = item.costLowCents === 0 && item.costHighCents === 0
    ? 'Free / no estimate'
    : formatCostRange(item.costLowCents, item.costHighCents);
  return (
    <div style={{
      padding: 14, borderRadius: 10,
      background: 'var(--bp-bg)', border: '1px solid var(--bp-border)',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 6 }}>
        <span style={{
          padding: '3px 9px', borderRadius: 100,
          background: `${sevColor}15`, color: sevColor, border: `1px solid ${sevColor}30`,
          fontFamily: "'DM Sans',sans-serif", fontSize: 10, fontWeight: 700, flexShrink: 0,
        }}>{sevLabel}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13.5, fontWeight: 700, color: 'var(--bp-text)', lineHeight: 1.35 }}>
            {item.title}
          </div>
          {item.location && (
            <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 10, color: 'var(--bp-subtle)', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 3 }}>
              {item.location}
            </div>
          )}
        </div>
        <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, fontWeight: 700, color: 'var(--bp-muted)', flexShrink: 0 }}>
          {cost}
        </div>
      </div>
      {item.description && (
        <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, color: 'var(--bp-muted)', lineHeight: 1.55 }}>
          {item.description}
        </div>
      )}
    </div>
  );
}

function InsightTile({ icon, label, color, title, body }: {
  icon: string; label: string; color: string; title: string | null; body: string;
}) {
  return (
    <div style={{
      padding: 16, borderRadius: 12,
      background: `${color}08`, border: `1px solid ${color}30`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <span style={{ fontSize: 13 }}>{icon}</span>
        <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 10, color, textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700 }}>
          {label}
        </span>
      </div>
      {title && (
        <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 14, fontWeight: 700, color: 'var(--bp-text)', marginBottom: 6, lineHeight: 1.4 }}>
          {title}
        </div>
      )}
      <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13, color: 'var(--bp-muted)', lineHeight: 1.55 }}>
        {body}
      </div>
    </div>
  );
}

function LifespanBar({ age, low, high, color }: { age: number; low: number; high: number; color: string }) {
  const max = Math.max(high + 5, age + 2);
  const agePct = Math.min(100, (age / max) * 100);
  const lowPct = (low / max) * 100;
  const highPct = (high / max) * 100;
  return (
    <div style={{ position: 'relative', height: 36, marginTop: 6 }}>
      <div style={{ position: 'absolute', top: 14, left: 0, right: 0, height: 8, background: 'var(--bp-bg)', borderRadius: 100 }} />
      <div style={{
        position: 'absolute', top: 14, left: `${lowPct}%`, width: `${highPct - lowPct}%`,
        height: 8, background: `${GREEN}30`, borderRadius: 100,
      }} />
      <div style={{
        position: 'absolute', top: 8, left: `calc(${agePct}% - 8px)`, width: 16, height: 20,
        background: color, borderRadius: 4, border: '2px solid var(--bp-card)',
      }} />
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        display: 'flex', justifyContent: 'space-between',
        fontFamily: "'DM Mono',monospace", fontSize: 9, color: 'var(--bp-subtle)',
        textTransform: 'uppercase', letterSpacing: '0.05em',
      }}>
        <span>0 yr</span>
        <span style={{ color: GREEN, fontWeight: 700 }}>typical {low}–{high}</span>
        <span>{Math.round(max)} yr</span>
      </div>
    </div>
  );
}

// ── Hazard card ──────────────────────────────────────────────────────────

function HazardCard({ icon, title, hazard }: { icon: string; title: string; hazard: HomeIQHazardCard }) {
  const color = hazard.level === 'high' ? RED : hazard.level === 'moderate' ? AMBER : GREEN;
  return (
    <div style={{
      background: 'var(--bp-card)', border: '1px solid var(--bp-border)',
      borderRadius: 14, padding: 18, position: 'relative', overflow: 'hidden',
    }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: color }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <span style={{
          width: 36, height: 36, borderRadius: 10, background: `${color}15`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18,
        }}>{icon}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13, fontWeight: 700, color: 'var(--bp-text)' }}>{title}</div>
          <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 9, color: 'var(--bp-subtle)', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 2 }}>
            {hazard.source}
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
        <span style={{ fontFamily: 'Fraunces, serif', fontSize: 24, fontWeight: 700, color, lineHeight: 1 }}>{hazard.primary}</span>
        <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, color: 'var(--bp-subtle)' }}>{hazard.sub}</span>
      </div>
      <div style={{
        marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--bp-border)',
        fontFamily: "'DM Sans',sans-serif", fontSize: 12, color: 'var(--bp-muted)', lineHeight: 1.5,
      }}>{hazard.detail}</div>
    </div>
  );
}

// ── Shared sub-components ─────────────────────────────────────────────────

function SectionHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <h2 style={{ fontFamily: 'Fraunces, serif', fontSize: 20, fontWeight: 700, color: 'var(--bp-text)', margin: 0 }}>
        {title}
      </h2>
      <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13, color: 'var(--bp-subtle)', margin: '4px 0 0' }}>
        {subtitle}
      </p>
    </div>
  );
}

function SnapshotTile({ label, value, sub, color, icon }: {
  label: string; value: string; sub: string; color: string; icon: string;
}) {
  return (
    <div style={{
      background: 'var(--bp-card)', border: '1px solid var(--bp-border)',
      borderRadius: 14, padding: '18px 20px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{
          fontFamily: "'DM Mono',monospace", fontSize: 10, fontWeight: 700,
          color: 'var(--bp-subtle)', textTransform: 'uppercase', letterSpacing: '0.08em',
        }}>{label}</span>
        <span style={{ fontSize: 18 }}>{icon}</span>
      </div>
      <div style={{ fontFamily: 'Fraunces, serif', fontSize: 26, fontWeight: 700, color, lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, color: 'var(--bp-subtle)', marginTop: 6 }}>{sub}</div>
    </div>
  );
}

function SourceNote({ text }: { text: string }) {
  return (
    <div style={{
      marginTop: 10, fontFamily: "'DM Mono',monospace", fontSize: 10,
      color: 'var(--bp-subtle)', letterSpacing: '0.04em',
    }}>
      {'→'} {text}
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────

function formatCostRange(lowCents: number, highCents: number): string {
  const fmt = (cents: number) => {
    const dollars = cents / 100;
    if (dollars >= 10000) return `$${(dollars / 1000).toFixed(0)}K`;
    if (dollars >= 1000) return `$${(dollars / 1000).toFixed(1)}K`;
    return `$${Math.round(dollars).toLocaleString()}`;
  };
  return `${fmt(lowCents)}–${fmt(highCents)}`;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

// G is imported for future "ready/positive" accents — reserved.
void G;
