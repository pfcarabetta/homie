import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { O, G, D, SEVERITY_COLORS, SEVERITY_LABELS, CATEGORY_ICONS, CATEGORY_LABELS, formatCurrency, formatDate, isLikelyDiy, timeAgo } from './constants';
import type { Tab } from './constants';
import type { DIYAnalysisPayload } from '@homie/shared';

interface DashboardTabProps {
  reports: DashboardReport[];
  loading: boolean;
  onNavigate: (tab: Tab) => void;
}

interface DashboardReport {
  id: string;
  propertyAddress: string;
  propertyCity: string;
  propertyState: string;
  inspectionDate: string;
  itemCount: number;
  dispatchedCount: number;
  quotedCount: number;
  totalEstimateLow: number;
  totalEstimateHigh: number;
  totalQuoteValue: number;
  createdAt: string;
  items: DashboardItem[];
}

interface DashboardItem {
  id: string;
  title: string;
  severity: string;
  category: string;
  costEstimateMin: number | null;
  costEstimateMax: number | null;
  dispatchStatus: string | null;
  quoteAmount: number | null;
  diyAnalysis?: DIYAnalysisPayload | null;
}

function StatCard({ label, value, sub, color, icon }: { label: string; value: string; sub?: string; color: string; icon: string }) {
  return (
    <div style={{
      background: 'var(--bp-card)', borderRadius: 14, padding: '20px 22px',
      border: '1px solid var(--bp-border)', flex: '1 1 200px', minWidth: 180,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--bp-subtle)', fontFamily: "'DM Sans',sans-serif", textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
        <span style={{ fontSize: 20 }}>{icon}</span>
      </div>
      <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 28, fontWeight: 700, color, lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: 'var(--bp-subtle)', marginTop: 4, fontFamily: "'DM Sans',sans-serif" }}>{sub}</div>}
    </div>
  );
}

export default function DashboardTab({ reports, loading, onNavigate }: DashboardTabProps) {
  const { homeowner } = useAuth();
  const firstName = homeowner?.first_name || homeowner?.email?.split('@')[0] || 'there';

  // Aggregate stats across all reports
  const totalItems = reports.reduce((sum, r) => sum + r.itemCount, 0);
  const totalDispatched = reports.reduce((sum, r) => sum + r.dispatchedCount, 0);
  const totalQuoted = reports.reduce((sum, r) => sum + r.quotedCount, 0);
  const totalEstLow = reports.reduce((sum, r) => sum + r.totalEstimateLow, 0);
  const totalEstHigh = reports.reduce((sum, r) => sum + r.totalEstimateHigh, 0);
  const totalQuoteValue = reports.reduce((sum, r) => sum + r.totalQuoteValue, 0);

  // Collect all items and compute severity breakdown
  const allItems = reports.flatMap(r => r.items);
  const urgentItems = allItems.filter(i => i.severity === 'safety_hazard' || i.severity === 'urgent');
  const recommendedItems = allItems.filter(i => i.severity === 'recommended');
  const monitorItems = allItems.filter(i => i.severity === 'monitor' || i.severity === 'informational');

  // DIY items — heuristic for the badge count, AI verdict trumps when cached.
  // Savings only counted when the AI confirms feasibility AND a cost range
  // is available — keeps the dashboard number truthful, not speculative.
  const diyItems = allItems.filter(i => isLikelyDiy(
    { severity: i.severity, category: i.category, title: i.title, costEstimateMax: i.costEstimateMax },
    i.diyAnalysis?.feasible ?? null,
  ));
  const diyConfirmedSavingsCents = allItems.reduce((sum, i) => {
    const diy = i.diyAnalysis;
    if (!diy?.feasible || !diy.costDiyCents) return sum;
    const proHigh = i.costEstimateMax ?? 0;
    const supplyLow = diy.costDiyCents.min;
    return sum + Math.max(0, proHigh - supplyLow);
  }, 0);

  // Home Health Score — normalized against industry averages
  // Source: ASHI/InterNACHI data — average inspection finds ~30 items
  // Typical severity distribution: 5 safety, 10 recommended, 15 monitor
  // Score = 100 minus weighted severity ratio vs. industry norms
  const healthScore = (() => {
    if (allItems.length === 0) return 100;
    // Industry baselines (average report)
    const baselineSafety = 5;
    const baselineRecommended = 12;
    const baselineMonitor = 13;
    // How this report compares — ratio to baseline (1.0 = average, 2.0 = 2x worse)
    const safetyRatio = urgentItems.length / baselineSafety;
    const recommendedRatio = recommendedItems.length / baselineRecommended;
    const monitorRatio = monitorItems.length / baselineMonitor;
    // Weighted severity impact (safety matters most)
    const weightedScore = (safetyRatio * 0.50) + (recommendedRatio * 0.35) + (monitorRatio * 0.15);
    // Convert to 0-100 scale: ratio of 1.0 (average) = score of 65
    // Below average issues = higher score, above average = lower score
    // Score drops steeply for safety items, gently for monitor
    const raw = 100 - (weightedScore * 35);
    return Math.max(15, Math.min(100, Math.round(raw)));
  })();
  const scoreColor = healthScore >= 80 ? G : healthScore >= 60 ? '#EF9F27' : '#E24B4A';
  const scoreLabel = healthScore >= 85 ? 'Excellent condition'
    : healthScore >= 75 ? 'Good condition'
    : healthScore >= 65 ? 'Average — typical findings'
    : healthScore >= 50 ? 'Below average — needs attention'
    : 'Significant issues found';

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300, fontFamily: "'DM Sans',sans-serif", color: 'var(--bp-subtle)' }}>
        Loading your inspection data...
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontFamily: 'Fraunces, serif', fontSize: 26, fontWeight: 700, color: 'var(--bp-text)', margin: 0 }}>
          Welcome back, {firstName}
        </h1>
        <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 14, color: 'var(--bp-subtle)', margin: '6px 0 0' }}>
          {reports.length > 0
            ? `You have ${reports.length} inspection report${reports.length !== 1 ? 's' : ''} with ${totalItems} total items.`
            : 'Upload your first inspection report to get started.'}
        </p>
      </div>

      {/* Stats Row */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 28 }}>
        <StatCard
          label="Home Health"
          value={reports.length > 0 ? `${healthScore}` : '--'}
          sub={reports.length > 0 ? scoreLabel : 'No reports yet'}
          color={reports.length > 0 ? scoreColor : 'var(--bp-subtle)'}
          icon={'\uD83C\uDFE0'}
        />
        <StatCard
          label="Total Items"
          value={totalItems.toString()}
          sub={urgentItems.length > 0 ? `${urgentItems.length} urgent` : 'No urgent items'}
          color={D}
          icon={'\uD83D\uDCCB'}
        />
        <StatCard
          label="Quotes Received"
          value={totalQuoted.toString()}
          sub={totalQuoteValue > 0 ? `${formatCurrency(totalQuoteValue / 100)} total` : 'No quotes yet'}
          color={G}
          icon={'\uD83D\uDCB0'}
        />
        <StatCard
          label="Est. Repair Cost"
          value={totalEstLow > 0 ? formatCurrency(totalEstLow / 100) : '--'}
          sub={totalEstHigh > 0 ? `up to ${formatCurrency(totalEstHigh / 100)}` : 'Upload a report to see'}
          color={O}
          icon={'\uD83D\uDD27'}
        />
        {diyItems.length > 0 && (
          <button
            onClick={() => onNavigate('items')}
            title="Open the Items tab and filter to DIY-friendly to see them all"
            style={{
              all: 'unset', cursor: 'pointer', flex: '1 1 200px', minWidth: 180, display: 'block',
              borderRadius: 14, transition: 'transform 0.12s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
          >
            <StatCard
              label="DIY Opportunities"
              value={diyConfirmedSavingsCents > 0 ? `~${formatCurrency(diyConfirmedSavingsCents / 100)}` : `${diyItems.length}`}
              sub={diyConfirmedSavingsCents > 0
                ? `Save across ${diyItems.length} item${diyItems.length !== 1 ? 's' : ''} you could fix yourself`
                : `${diyItems.length} item${diyItems.length !== 1 ? 's' : ''} look DIY-friendly · open one to see`}
              color={'#1B9E77'}
              icon={'🔧'}
            />
          </button>
        )}
      </div>

      {/* Two-column on desktop, stacks on mobile */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
        {/* Urgent Items */}
        <div style={{ background: 'var(--bp-card)', borderRadius: 14, border: '1px solid var(--bp-border)', padding: 22, gridColumn: urgentItems.length === 0 && reports.length === 0 ? '1 / -1' : undefined }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h3 style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 15, fontWeight: 700, color: 'var(--bp-text)', margin: 0 }}>
              {urgentItems.length > 0 ? 'Action Required' : 'Quick Actions'}
            </h3>
            {urgentItems.length > 0 && (
              <span style={{ fontSize: 11, fontWeight: 600, color: '#E24B4A', background: '#E24B4A15', padding: '3px 10px', borderRadius: 100 }}>
                {urgentItems.length} item{urgentItems.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          {urgentItems.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {urgentItems.slice(0, 5).map(item => (
                <div key={item.id} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
                  background: 'var(--bp-bg)', borderRadius: 10, cursor: 'pointer',
                }}
                  onClick={() => onNavigate('items')}
                >
                  <span style={{ fontSize: 18 }}>{CATEGORY_ICONS[item.category] || '\uD83D\uDD27'}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--bp-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.title}</div>
                    <div style={{ fontSize: 11, color: 'var(--bp-subtle)' }}>
                      {CATEGORY_LABELS[item.category] || item.category}
                      {item.costEstimateMin && ` \u00B7 ${formatCurrency(item.costEstimateMin / 100)}`}
                      {item.costEstimateMax && `-${formatCurrency(item.costEstimateMax / 100)}`}
                    </div>
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 600, color: SEVERITY_COLORS[item.severity], background: `${SEVERITY_COLORS[item.severity]}15`, padding: '3px 8px', borderRadius: 100 }}>
                    {SEVERITY_LABELS[item.severity]}
                  </span>
                </div>
              ))}
              {urgentItems.length > 5 && (
                <button onClick={() => onNavigate('items')} style={{
                  background: 'none', border: 'none', color: '#2563EB', fontSize: 13, fontWeight: 600,
                  cursor: 'pointer', fontFamily: "'DM Sans',sans-serif", padding: '6px 0',
                }}>
                  View all {urgentItems.length} urgent items
                </button>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button onClick={() => onNavigate('reports')} style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px',
                background: 'var(--bp-bg)', borderRadius: 10, border: '1px solid var(--bp-border)',
                cursor: 'pointer', width: '100%', textAlign: 'left',
                fontFamily: "'DM Sans',sans-serif",
              }}>
                <span style={{ fontSize: 22 }}>{'\uD83D\uDCC4'}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--bp-text)' }}>Upload Inspection Report</div>
                  <div style={{ fontSize: 12, color: 'var(--bp-subtle)' }}>Upload a PDF and get AI-powered analysis</div>
                </div>
                <span style={{ color: 'var(--bp-subtle)', fontSize: 16 }}>{'\u2192'}</span>
              </button>
              <button onClick={() => onNavigate('quotes')} style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px',
                background: 'var(--bp-bg)', borderRadius: 10, border: '1px solid var(--bp-border)',
                cursor: 'pointer', width: '100%', textAlign: 'left',
                fontFamily: "'DM Sans',sans-serif",
              }}>
                <span style={{ fontSize: 22 }}>{'\uD83D\uDCB0'}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--bp-text)' }}>Get Repair Quotes</div>
                  <div style={{ fontSize: 12, color: 'var(--bp-subtle)' }}>Dispatch items to our provider network</div>
                </div>
                <span style={{ color: 'var(--bp-subtle)', fontSize: 16 }}>{'\u2192'}</span>
              </button>
              <button onClick={() => onNavigate('negotiations')} style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px',
                background: 'var(--bp-bg)', borderRadius: 10, border: '1px solid var(--bp-border)',
                cursor: 'pointer', width: '100%', textAlign: 'left',
                fontFamily: "'DM Sans',sans-serif",
              }}>
                <span style={{ fontSize: 22 }}>{'\uD83D\uDCC3'}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--bp-text)' }}>Build Repair Request</div>
                  <div style={{ fontSize: 12, color: 'var(--bp-subtle)' }}>Generate a negotiation document for your seller</div>
                </div>
                <span style={{ color: 'var(--bp-subtle)', fontSize: 16 }}>{'\u2192'}</span>
              </button>
            </div>
          )}
        </div>

        {/* Recent Reports */}
        {reports.length > 0 && (
          <div style={{ background: 'var(--bp-card)', borderRadius: 14, border: '1px solid var(--bp-border)', padding: 22 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <h3 style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 15, fontWeight: 700, color: 'var(--bp-text)', margin: 0 }}>Recent Reports</h3>
              <button onClick={() => onNavigate('reports')} style={{
                background: 'none', border: 'none', color: '#2563EB', fontSize: 12, fontWeight: 600,
                cursor: 'pointer', fontFamily: "'DM Sans',sans-serif",
              }}>View all</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {reports.slice(0, 4).map(report => (
                <div key={report.id} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
                  background: 'var(--bp-bg)', borderRadius: 10, cursor: 'pointer',
                }}
                  onClick={() => onNavigate('reports')}
                >
                  <div style={{
                    width: 40, height: 40, borderRadius: 10, background: '#2563EB10',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0,
                  }}>{'\uD83C\uDFE0'}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--bp-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {report.propertyAddress}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--bp-subtle)' }}>
                      {report.propertyCity}, {report.propertyState} &middot; {report.itemCount} items
                      {report.quotedCount > 0 && ` \u00B7 ${report.quotedCount} quoted`}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 11, color: 'var(--bp-subtle)' }}>{timeAgo(report.createdAt)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Severity Breakdown */}
      {reports.length > 0 && (
        <div style={{ marginTop: 20, background: 'var(--bp-card)', borderRadius: 14, border: '1px solid var(--bp-border)', padding: 22 }}>
          <h3 style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 15, fontWeight: 700, color: 'var(--bp-text)', margin: '0 0 16px' }}>Item Breakdown</h3>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {([
              { key: 'safety_hazard', items: allItems.filter(i => i.severity === 'safety_hazard') },
              { key: 'urgent', items: allItems.filter(i => i.severity === 'urgent') },
              { key: 'recommended', items: recommendedItems },
              { key: 'monitor', items: allItems.filter(i => i.severity === 'monitor') },
              { key: 'informational', items: allItems.filter(i => i.severity === 'informational') },
            ] as const).filter(g => g.items.length > 0).map(group => (
              <div key={group.key} style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px',
                background: `${SEVERITY_COLORS[group.key]}10`, borderRadius: 8,
                border: `1px solid ${SEVERITY_COLORS[group.key]}25`,
              }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: SEVERITY_COLORS[group.key], flexShrink: 0 }} />
                <span style={{ fontSize: 13, fontWeight: 600, color: SEVERITY_COLORS[group.key] }}>{group.items.length}</span>
                <span style={{ fontSize: 12, color: 'var(--bp-muted)' }}>{SEVERITY_LABELS[group.key]}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
