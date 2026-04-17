import { useState, useEffect, useMemo, useCallback } from 'react';
import { inspectService, type PortalReport, type PortalReportItem } from '@/services/inspector-api';
import { SEVERITY_COLORS, SEVERITY_LABELS, CATEGORY_ICONS, CATEGORY_LABELS, formatCurrency, formatDate, paidReports, reportsWithTier } from './constants';
import type { Tab } from './constants';
import LockedTabPlaceholder from './LockedTabPlaceholder';
import { getCurrentSeasonalTasks, getSeasonName, type SeasonalTask } from './seasonalTasks';
import PageCitation from './PageCitation';

const ACCENT = '#2563EB';
const RED = '#DC2626';
const AMBER = '#D97706';
const GREEN = '#10B981';
const GRAY = '#6B7280';

interface MaintenanceTabProps {
  reports: PortalReport[];
  onNavigate: (tab: Tab) => void;
  onReportsChange: () => void;
}

interface ItemWithContext extends PortalReportItem {
  _reportId: string;
  _reportAddress: string;
  _reportFileUrl: string | null;
  _pricingTier: string | null;
}

type Bucket = 'now' | 'soon' | 'later' | 'watch' | 'done';

const BUCKETS: Array<{
  id: Bucket;
  title: string;
  description: string;
  color: string;
  icon: string;
}> = [
  { id: 'now', title: 'Due Now', description: 'Safety hazards and urgent items', color: RED, icon: '\uD83D\uDEA8' },
  { id: 'soon', title: 'Within 3 Months', description: 'Recommended repairs', color: AMBER, icon: '\u23F0' },
  { id: 'later', title: '6\u201312 Months', description: 'Items to monitor and address proactively', color: ACCENT, icon: '\uD83D\uDCC5' },
  { id: 'watch', title: 'Watch List', description: 'Informational \u2014 keep an eye on these', color: GRAY, icon: '\uD83D\uDC40' },
  { id: 'done', title: 'Done', description: 'Completed or booked items', color: GREEN, icon: '\u2705' },
];

function classifyBucket(item: ItemWithContext): Bucket {
  // Done: explicitly marked complete OR dispatch is booked/completed
  if (item.maintenanceCompletedAt) return 'done';
  if (item.dispatchStatus === 'booked' || item.dispatchStatus === 'completed') return 'done';
  // Pending buckets by severity
  if (item.severity === 'safety_hazard' || item.severity === 'urgent') return 'now';
  if (item.severity === 'recommended') return 'soon';
  if (item.severity === 'monitor') return 'later';
  return 'watch';
}

export default function MaintenanceTab({ reports, onNavigate, onReportsChange }: MaintenanceTabProps) {
  const visibleReports = useMemo(() => reportsWithTier(reports, 'premium'), [reports]);
  const hasUnderTierReport = paidReports(reports).length > visibleReports.length;
  const [items, setItems] = useState<ItemWithContext[]>([]);
  const [collapsedBuckets, setCollapsedBuckets] = useState<Set<Bucket>>(new Set(['watch']));
  const [pendingActions, setPendingActions] = useState<Set<string>>(new Set());

  // Build flattened item list from paid reports only
  useEffect(() => {
    const out: ItemWithContext[] = [];
    for (const r of visibleReports) {
      for (const i of r.items) {
        out.push({
          ...i,
          _reportId: r.id,
          _reportAddress: r.propertyAddress,
          _reportFileUrl: r.reportFileUrl ?? null,
          _pricingTier: r.pricingTier,
        });
      }
    }
    setItems(out);
  }, [visibleReports]);

  // Group items into buckets
  const grouped = useMemo(() => {
    const map = new Map<Bucket, ItemWithContext[]>();
    for (const b of BUCKETS) map.set(b.id, []);
    for (const item of items) {
      map.get(classifyBucket(item))!.push(item);
    }
    return map;
  }, [items]);

  // Stat counts
  const stats = useMemo(() => {
    const dueNow = grouped.get('now')?.length ?? 0;
    const comingUp = grouped.get('soon')?.length ?? 0;
    // Completed in last 12 months
    const cutoff = Date.now() - 365 * 24 * 60 * 60 * 1000;
    const completed = items.filter(i =>
      i.maintenanceCompletedAt && new Date(i.maintenanceCompletedAt).getTime() >= cutoff
    ).length;
    return { dueNow, comingUp, completed };
  }, [grouped, items]);

  // Seasonal tasks for current month
  const currentMonth = new Date().getMonth() + 1;
  const seasonInfo = getSeasonName(currentMonth);
  const relevantCategories = useMemo(() => new Set(items.map(i => i.category)), [items]);
  const seasonalTasks = useMemo(
    () => getCurrentSeasonalTasks(currentMonth, relevantCategories),
    [currentMonth, relevantCategories],
  );

  function toggleBucket(bucket: Bucket) {
    setCollapsedBuckets(prev => {
      const next = new Set(prev);
      if (next.has(bucket)) next.delete(bucket); else next.add(bucket);
      return next;
    });
  }

  // Mark complete / undo
  const handleToggleComplete = useCallback(async (item: ItemWithContext) => {
    if (pendingActions.has(item.id)) return;
    setPendingActions(prev => new Set(prev).add(item.id));
    const newValue = item.maintenanceCompletedAt ? null : new Date().toISOString();
    // Optimistic update
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, maintenanceCompletedAt: newValue } : i));
    try {
      await inspectService.updateMaintenance(item._reportId, item.id, { maintenanceCompletedAt: newValue });
    } catch {
      // Revert on error
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, maintenanceCompletedAt: item.maintenanceCompletedAt } : i));
    }
    setPendingActions(prev => { const n = new Set(prev); n.delete(item.id); return n; });
  }, [pendingActions]);

  // Get quotes (single-item dispatch)
  const handleGetQuotes = useCallback(async (item: ItemWithContext) => {
    if (pendingActions.has(item.id)) return;
    setPendingActions(prev => new Set(prev).add(item.id));
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, dispatchStatus: 'dispatched' } : i));
    try {
      await inspectService.portalDispatch(item._reportId, [item.id]);
      onReportsChange();
    } catch {
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, dispatchStatus: item.dispatchStatus } : i));
    }
    setPendingActions(prev => { const n = new Set(prev); n.delete(item.id); return n; });
  }, [pendingActions, onReportsChange]);

  // Gate: maintenance is Premium-tier only
  if (visibleReports.length === 0) {
    return (
      <LockedTabPlaceholder
        tabName="Maintenance"
        description="Year-round maintenance plan built from your inspection findings"
        hasAnyReports={reports.length > 0}
        hasUnderTierReport={hasUnderTierReport}
        requiredTier="premium"
        onNavigate={onNavigate}
      />
    );
  }

  // Empty state
  if (reports.length === 0) {
    return (
      <div>
        <Header />
        <div style={{
          background: 'var(--bp-card)', borderRadius: 14, border: '1px solid var(--bp-border)',
          padding: '60px 40px', textAlign: 'center',
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>{'\u23F0'}</div>
          <h3 style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 18, fontWeight: 700, color: 'var(--bp-text)', margin: '0 0 8px' }}>
            No maintenance schedule yet
          </h3>
          <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 14, color: 'var(--bp-subtle)', margin: '0 0 20px', maxWidth: 420, marginInline: 'auto' }}>
            Upload an inspection report and we'll build your year-round maintenance plan based on what was found.
          </p>
          <button onClick={() => onNavigate('reports')} style={{
            padding: '12px 28px', borderRadius: 10, border: 'none', background: ACCENT, color: '#fff',
            cursor: 'pointer', fontSize: 15, fontWeight: 600, fontFamily: "'DM Sans',sans-serif",
          }}>Upload a Report</button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Header />

      {/* Summary stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 20 }}>
        <StatCard label="Due Now" value={String(stats.dueNow)} subLabel="Safety + urgent items" color={RED} icon={'\uD83D\uDEA8'} />
        <StatCard label="Coming Up" value={String(stats.comingUp)} subLabel="Recommended within 3 months" color={AMBER} icon={'\u23F0'} />
        <StatCard label="Completed" value={String(stats.completed)} subLabel="Done in last 12 months" color={GREEN} icon={'\u2705'} />
      </div>

      {/* Seasonal reminders */}
      {seasonalTasks.length > 0 && (
        <div style={{
          marginBottom: 24,
          background: 'var(--bp-card)', borderRadius: 14, border: '1px solid var(--bp-border)',
          padding: '18px 20px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <span style={{ fontSize: 18 }}>{seasonInfo.icon}</span>
            <h3 style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 15, fontWeight: 700, color: 'var(--bp-text)', margin: 0 }}>
              {seasonInfo.name} maintenance reminders
            </h3>
            <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, color: 'var(--bp-subtle)' }}>
              {seasonalTasks.length} {seasonalTasks.length === 1 ? 'task' : 'tasks'} for {new Date().toLocaleString('en-US', { month: 'long' })}
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
            {seasonalTasks.map(task => <SeasonalTaskCard key={task.id} task={task} />)}
          </div>
        </div>
      )}

      {/* Timeline buckets */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {BUCKETS.map(bucket => {
          const bucketItems = grouped.get(bucket.id) ?? [];
          if (bucketItems.length === 0) return null;
          const isCollapsed = collapsedBuckets.has(bucket.id);
          return (
            <BucketSection
              key={bucket.id}
              bucket={bucket}
              items={bucketItems}
              collapsed={isCollapsed}
              onToggle={() => toggleBucket(bucket.id)}
              onToggleComplete={handleToggleComplete}
              onGetQuotes={handleGetQuotes}
              onNavigate={onNavigate}
              pendingActions={pendingActions}
              showAddress={reports.length > 1}
            />
          );
        })}
      </div>
    </div>
  );
}

// ── Header ──────────────────────────────────────────────────────────────────

function Header() {
  return (
    <div style={{ marginBottom: 20 }}>
      <h1 style={{ fontFamily: 'Fraunces, serif', fontSize: 24, fontWeight: 700, color: 'var(--bp-text)', margin: 0 }}>Maintenance</h1>
      <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 14, color: 'var(--bp-subtle)', margin: '4px 0 0' }}>
        Track ongoing care from your inspection items + seasonal reminders
      </p>
    </div>
  );
}

// ── Stat card ───────────────────────────────────────────────────────────────

function StatCard({ label, value, subLabel, color, icon }: { label: string; value: string; subLabel: string; color: string; icon: string }) {
  return (
    <div style={{
      background: 'var(--bp-card)', borderRadius: 12, padding: '16px 18px',
      border: '1px solid var(--bp-border)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, fontWeight: 600, color: 'var(--bp-subtle)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</span>
        <span style={{ fontSize: 16 }}>{icon}</span>
      </div>
      <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 26, fontWeight: 700, color, lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, color: 'var(--bp-subtle)', marginTop: 4 }}>{subLabel}</div>
    </div>
  );
}

// ── Seasonal task card ──────────────────────────────────────────────────────

function SeasonalTaskCard({ task }: { task: SeasonalTask }) {
  const catLabel = CATEGORY_LABELS[task.category] ?? task.category;
  const catIcon = CATEGORY_ICONS[task.category] ?? task.icon;
  return (
    <div style={{
      padding: '12px 14px', borderRadius: 10,
      background: 'var(--bp-bg)', border: '1px solid var(--bp-border)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <span style={{ fontSize: 14 }}>{task.icon}</span>
        <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13, fontWeight: 600, color: 'var(--bp-text)' }}>
          {task.title}
        </span>
      </div>
      <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, color: 'var(--bp-subtle)', marginBottom: 6, lineHeight: 1.45 }}>
        {task.description}
      </div>
      <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 10, color: 'var(--bp-subtle)', opacity: 0.7 }}>
        {catIcon} {catLabel}
      </div>
    </div>
  );
}

// ── Bucket section ──────────────────────────────────────────────────────────

function BucketSection({ bucket, items, collapsed, onToggle, onToggleComplete, onGetQuotes, onNavigate, pendingActions, showAddress }: {
  bucket: typeof BUCKETS[number];
  items: ItemWithContext[];
  collapsed: boolean;
  onToggle: () => void;
  onToggleComplete: (item: ItemWithContext) => void;
  onGetQuotes: (item: ItemWithContext) => void;
  onNavigate: (tab: Tab) => void;
  pendingActions: Set<string>;
  showAddress: boolean;
}) {
  return (
    <div style={{
      background: 'var(--bp-card)', borderRadius: 14, border: `1px solid ${bucket.color}25`,
      overflow: 'hidden',
    }}>
      <button
        onClick={onToggle}
        style={{
          width: '100%', padding: '14px 18px',
          background: `${bucket.color}08`, border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 18 }}>{bucket.icon}</span>
          <div style={{ textAlign: 'left' }}>
            <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 14, fontWeight: 700, color: bucket.color }}>
              {bucket.title}
              <span style={{ marginLeft: 8, padding: '2px 8px', borderRadius: 10, background: `${bucket.color}20`, fontSize: 11, fontWeight: 600 }}>
                {items.length}
              </span>
            </div>
            <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, color: 'var(--bp-subtle)', marginTop: 2 }}>
              {bucket.description}
            </div>
          </div>
        </div>
        <span style={{ fontSize: 11, color: bucket.color, opacity: 0.8 }}>{collapsed ? '\u25BC' : '\u25B2'}</span>
      </button>
      {!collapsed && (
        <div style={{ padding: '8px 12px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map(item => (
            <ItemRow
              key={item.id}
              item={item}
              onToggleComplete={() => onToggleComplete(item)}
              onGetQuotes={() => onGetQuotes(item)}
              onNavigate={onNavigate}
              pending={pendingActions.has(item.id)}
              showAddress={showAddress}
              isDone={bucket.id === 'done'}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Item row ────────────────────────────────────────────────────────────────

function ItemRow({ item, onToggleComplete, onGetQuotes, onNavigate, pending, showAddress, isDone }: {
  item: ItemWithContext;
  onToggleComplete: () => void;
  onGetQuotes: () => void;
  onNavigate: (tab: Tab) => void;
  pending: boolean;
  showAddress: boolean;
  isDone: boolean;
}) {
  const sevColor = SEVERITY_COLORS[item.severity] ?? '#9B9490';
  const catLabel = CATEGORY_LABELS[item.category] ?? item.category;
  const catIcon = CATEGORY_ICONS[item.category] ?? '';
  const cost = item.quoteAmount ?? item.costEstimateMax ?? null;
  const canDispatch = !item.dispatchStatus || item.dispatchStatus === 'pending' || item.dispatchStatus === 'not_dispatched' || item.dispatchStatus === 'pending_dispatch';
  const tierAllowsDispatch = item._pricingTier === 'professional' || item._pricingTier === 'premium';
  const isDispatched = item.dispatchStatus === 'dispatched' || item.dispatchStatus === 'quotes_received' || item.dispatchStatus === 'quoted';
  const isBooked = item.dispatchStatus === 'booked' || item.dispatchStatus === 'completed';
  const hasQuotes = (item.quotes && item.quotes.length > 0) || !!item.quoteAmount;

  return (
    <div style={{
      background: 'var(--bp-bg)', borderRadius: 10,
      border: '1px solid var(--bp-border)',
      padding: '12px 14px',
      opacity: item.maintenanceCompletedAt ? 0.65 : 1,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        {/* Item info */}
        <div style={{ flex: '1 1 240px', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
            <span style={{
              fontFamily: "'DM Sans',sans-serif", fontSize: 10, fontWeight: 600, padding: '2px 7px',
              borderRadius: 10, background: `${sevColor}18`, color: sevColor,
            }}>
              {SEVERITY_LABELS[item.severity] ?? item.severity}
            </span>
            <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, color: 'var(--bp-subtle)' }}>
              {catIcon} {catLabel}
            </span>
            {isBooked && (
              <span style={{
                fontFamily: "'DM Sans',sans-serif", fontSize: 10, fontWeight: 600, padding: '2px 7px',
                borderRadius: 10, background: '#10B98115', color: '#10B981',
              }}>Booked</span>
            )}
            {item.maintenanceCompletedAt && (
              <span style={{
                fontFamily: "'DM Sans',sans-serif", fontSize: 10, fontWeight: 600, padding: '2px 7px',
                borderRadius: 10, background: '#10B98115', color: '#10B981',
              }}>Done {formatDate(item.maintenanceCompletedAt)}</span>
            )}
          </div>
          <div style={{
            fontFamily: "'DM Sans',sans-serif", fontSize: 14, fontWeight: 600, color: 'var(--bp-text)',
            textDecoration: item.maintenanceCompletedAt ? 'line-through' : 'none',
          }}>
            {item.title}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 2 }}>
            {showAddress && (
              <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, color: 'var(--bp-subtle)', opacity: 0.7 }}>
                {item._reportAddress}
              </span>
            )}
            {item.location && (
              <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, color: 'var(--bp-subtle)', opacity: 0.7 }}>
                &middot; {item.location}
              </span>
            )}
            <PageCitation sourcePages={item.sourcePages} reportFileUrl={item._reportFileUrl} />
          </div>
        </div>

        {/* Cost */}
        {cost !== null && cost > 0 && (
          <div style={{ flex: '0 0 auto', textAlign: 'right' }}>
            <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 10, color: 'var(--bp-subtle)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {item.quoteAmount ? 'Quote' : 'Estimate'}
            </div>
            <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 14, fontWeight: 700, color: 'var(--bp-text)' }}>
              {formatCurrency(cost / 100)}
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div style={{ flex: '0 0 auto', display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Dispatch / quote actions for non-done items */}
          {!isDone && (
            <>
              {canDispatch && tierAllowsDispatch && (
                <ActionButton onClick={onGetQuotes} disabled={pending} color={ACCENT}>
                  {pending ? 'Dispatching...' : 'Get Quotes'}
                </ActionButton>
              )}
              {canDispatch && !tierAllowsDispatch && (
                <ActionButton onClick={() => onNavigate('reports')} color={'#94A3B8'} variant="link">
                  Upgrade to dispatch
                </ActionButton>
              )}
              {isDispatched && !hasQuotes && (
                <span style={{
                  fontFamily: "'DM Sans',sans-serif", fontSize: 11, color: ACCENT,
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                }}>
                  <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: ACCENT, animation: 'pulse 1.5s ease-in-out infinite' }} />
                  Waiting for quotes
                </span>
              )}
              {isDispatched && hasQuotes && (
                <ActionButton onClick={() => onNavigate('quotes')} color={'#10B981'}>
                  View Quotes{item.quotes ? ` (${item.quotes.length})` : ''}
                </ActionButton>
              )}
            </>
          )}
          {/* Mark complete / undo */}
          <ActionButton
            onClick={onToggleComplete}
            disabled={pending}
            color={item.maintenanceCompletedAt ? GRAY : GREEN}
            variant={item.maintenanceCompletedAt ? 'outline' : 'solid'}
          >
            {pending ? '...' : item.maintenanceCompletedAt ? 'Undo' : 'Mark Complete'}
          </ActionButton>
        </div>
      </div>
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
    </div>
  );
}

// ── Action button ───────────────────────────────────────────────────────────

function ActionButton({ children, onClick, disabled, color, variant = 'solid' }: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  color: string;
  variant?: 'solid' | 'outline' | 'link';
}) {
  const styles: React.CSSProperties = {
    fontFamily: "'DM Sans',sans-serif", fontSize: 12, fontWeight: 600,
    padding: variant === 'link' ? '6px 0' : '6px 12px',
    borderRadius: variant === 'link' ? 0 : 6,
    border: variant === 'outline' ? `1px solid ${color}` : 'none',
    background: variant === 'solid' ? color : variant === 'outline' ? 'transparent' : 'transparent',
    color: variant === 'solid' ? '#fff' : color,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.6 : 1,
    textDecoration: variant === 'link' ? 'underline' : 'none',
    whiteSpace: 'nowrap',
  };
  return (
    <button onClick={onClick} disabled={disabled} style={styles}>
      {children}
    </button>
  );
}
