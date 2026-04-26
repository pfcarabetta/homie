import { useState, useMemo, useCallback } from 'react';
import { inspectService, type PortalReport, type InspectionItem } from '@/services/inspector-api';
import { SEVERITY_COLORS, SEVERITY_LABELS, CATEGORY_ICONS, CATEGORY_LABELS, formatCurrency, isLikelyDiy, paidReports, reportsWithTier } from './constants';
import type { Tab } from './constants';
import ItemDeepDive from './ItemDeepDive';
import PageCitation from './PageCitation';
import LockedTabPlaceholder from './LockedTabPlaceholder';
import DIYBadge from './DIYBadge';

const ACCENT = '#2563EB';

interface ItemsTabProps {
  reports: PortalReport[];
  onNavigate: (tab: Tab) => void;
  onReportsChange: () => void;
}

// Extend InspectionItem with parent report context
interface ItemWithContext extends InspectionItem {
  _reportId: string;
  _reportAddress: string;
  _pricingTier: string | null;
  _clientAccessToken: string;
  _reportFileUrl: string | null;
  _reportMode: 'buyer' | 'seller';
}

const SEVERITY_ORDER = ['safety_hazard', 'urgent', 'recommended', 'monitor', 'informational'];

export default function ItemsTab({ reports, onNavigate, onReportsChange }: ItemsTabProps) {
  // Gate: Items requires Essential or higher. Placeholder rendered after all
  // hooks (rules-of-hooks ordering).
  const visibleReports = useMemo(() => reportsWithTier(reports, 'essential'), [reports]);
  const hasUnderTierReport = paidReports(reports).length > visibleReports.length;
  // Flatten all items from all reports with parent context
  const allItems = useMemo<ItemWithContext[]>(() => {
    const items: ItemWithContext[] = [];
    for (const report of reports) {
      // We need full items — PortalReport only has summary items.
      // For now, use what we have; full items load when user opens report detail.
      // We'll use the inspectService.getReport to load full items.
    }
    return items;
  }, [reports]);

  // We need full item data from each report. Fetch on mount.
  const [fullItems, setFullItems] = useState<ItemWithContext[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [activeSeverity, setActiveSeverity] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [activeReportId, setActiveReportId] = useState<string | null>(null);
  const [activeSellerAction, setActiveSellerAction] = useState<'fix_before_listing' | 'disclose' | 'ignore' | null>(null);
  const [xrefOnly, setXrefOnly] = useState(false);
  const [diyOnly, setDiyOnly] = useState(false);
  const [dispatching, setDispatching] = useState(false);
  const [dispatchResult, setDispatchResult] = useState<string | null>(null);
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);

  // Fetch full items from all reports
  useState(() => {
    (async () => {
      const items: ItemWithContext[] = [];
      for (const report of visibleReports) {
        if (!report.clientAccessToken) continue;
        try {
          const res = await inspectService.getReport(report.clientAccessToken);
          if (res.data) {
            for (const item of res.data.items) {
              items.push({
                ...item,
                _reportId: report.id,
                _reportAddress: report.propertyAddress,
                _pricingTier: report.pricingTier,
                _clientAccessToken: report.clientAccessToken,
                _reportFileUrl: res.data.reportFileUrl ?? report.reportFileUrl ?? null,
                _reportMode: (res.data.reportMode ?? report.reportMode ?? 'buyer') as 'buyer' | 'seller',
              });
            }
          }
        } catch { /* skip failed reports */ }
      }
      // Sort by severity priority
      items.sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity));
      setFullItems(items);

      // Start with no items selected — user picks what to dispatch

      setLoading(false);
    })();
  });

  // Derived data
  const dispatchableItems = useMemo(() => fullItems.filter(isDispatchable), [fullItems]);

  const filteredItems = useMemo(() => {
    let items = fullItems;
    if (activeReportId) items = items.filter(i => i._reportId === activeReportId);
    if (activeSeverity) items = items.filter(i => i.severity === activeSeverity);
    if (activeCategory) items = items.filter(i => i.category === activeCategory);
    if (activeSellerAction) items = items.filter(i => i.sellerAction === activeSellerAction);
    if (xrefOnly) items = items.filter(i => (i.crossReferencedItemIds?.length ?? 0) > 0);
    if (diyOnly) items = items.filter(i => isLikelyDiy({
      severity: i.severity,
      category: i.category,
      title: i.title,
      costEstimateMax: i.costEstimateMax,
    }, i.diyAnalysis?.feasible ?? null));
    return items;
  }, [fullItems, activeReportId, activeSeverity, activeCategory, activeSellerAction, xrefOnly, diyOnly]);

  const diyCount = useMemo(
    () => fullItems.filter(i => isLikelyDiy({
      severity: i.severity,
      category: i.category,
      title: i.title,
      costEstimateMax: i.costEstimateMax,
    }, i.diyAnalysis?.feasible ?? null)).length,
    [fullItems],
  );

  const xrefCount = useMemo(
    () => fullItems.filter(i => (i.crossReferencedItemIds?.length ?? 0) > 0).length,
    [fullItems],
  );

  // Has any items in seller mode — show seller action filter only if so
  const hasSellerModeItems = useMemo(() => fullItems.some(i => i._reportMode === 'seller'), [fullItems]);
  const sellerActionCounts = useMemo(() => {
    const m = { fix_before_listing: 0, disclose: 0, ignore: 0 };
    for (const i of fullItems) {
      if (i._reportMode === 'seller' && i.sellerAction) m[i.sellerAction]++;
    }
    return m;
  }, [fullItems]);

  // Unique reports for filter
  const reportOptions = useMemo(() => {
    const seen = new Map<string, { id: string; address: string; count: number }>();
    for (const item of fullItems) {
      const existing = seen.get(item._reportId);
      if (existing) { existing.count++; } else { seen.set(item._reportId, { id: item._reportId, address: item._reportAddress, count: 1 }); }
    }
    return Array.from(seen.values());
  }, [fullItems]);

  const categories = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of fullItems) map.set(item.category, (map.get(item.category) ?? 0) + 1);
    return map;
  }, [fullItems]);

  const severityCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of fullItems) map.set(item.severity, (map.get(item.severity) ?? 0) + 1);
    return map;
  }, [fullItems]);

  const selectedCount = selectedItems.size;
  const dispatchableCount = dispatchableItems.length;

  // Selection handlers
  const toggleItem = useCallback((id: string) => {
    setSelectedItems(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedItems(new Set(dispatchableItems.map(i => i.id)));
  }, [dispatchableItems]);

  const deselectAll = useCallback(() => {
    setSelectedItems(new Set());
  }, []);

  const toggleCategory = useCallback((cat: string) => {
    const catItems = dispatchableItems.filter(i => i.category === cat);
    const catIds = catItems.map(i => i.id);
    const allSelected = catIds.every(id => selectedItems.has(id));
    setSelectedItems(prev => {
      const next = new Set(prev);
      if (allSelected) {
        for (const id of catIds) next.delete(id);
      } else {
        for (const id of catIds) next.add(id);
      }
      return next;
    });
  }, [dispatchableItems, selectedItems]);

  // Dispatch handler
  async function handleDispatch() {
    if (selectedCount === 0) return;
    setDispatching(true);
    setDispatchResult(null);

    // Group selected items by report
    const byReport = new Map<string, string[]>();
    for (const item of fullItems) {
      if (!selectedItems.has(item.id)) continue;
      const list = byReport.get(item._reportId) ?? [];
      list.push(item.id);
      byReport.set(item._reportId, list);
    }

    let totalDispatched = 0;
    for (const [reportId, itemIds] of byReport) {
      try {
        const res = await inspectService.portalDispatch(reportId, itemIds);
        totalDispatched += res.data?.totalDispatched ?? 0;
      } catch { /* ignore per-report errors */ }
    }

    setDispatchResult(`${totalDispatched} item${totalDispatched !== 1 ? 's' : ''} dispatched! Quotes will arrive as providers respond.`);
    setSelectedItems(new Set());
    onReportsChange();

    // Reload items
    const items: ItemWithContext[] = [];
    for (const report of visibleReports) {
      if (!report.clientAccessToken) continue;
      try {
        const res = await inspectService.getReport(report.clientAccessToken);
        if (res.data) {
          for (const item of res.data.items) {
            items.push({ ...item, _reportId: report.id, _reportAddress: report.propertyAddress, _pricingTier: report.pricingTier, _clientAccessToken: report.clientAccessToken, _reportFileUrl: res.data.reportFileUrl ?? report.reportFileUrl ?? null, _reportMode: (res.data.reportMode ?? report.reportMode ?? 'buyer') as 'buyer' | 'seller' });
          }
        }
      } catch { /* skip */ }
    }
    items.sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity));
    setFullItems(items);
    setDispatching(false);
  }

  // Gate: hide all items behind a paywall reminder if no reports meet Essential
  if (visibleReports.length === 0) {
    return (
      <LockedTabPlaceholder
        tabName="Items"
        description="Browse and dispatch every item across your inspection reports"
        hasAnyReports={reports.length > 0}
        hasUnderTierReport={hasUnderTierReport}
        requiredTier="essential"
        onNavigate={onNavigate}
      />
    );
  }

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 0' }}>
        <Spinner />
        <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 14, color: 'var(--bp-subtle)', marginTop: 16 }}>Loading items...</p>
      </div>
    );
  }

  if (fullItems.length === 0) {
    return (
      <div>
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontFamily: 'Fraunces, serif', fontSize: 24, fontWeight: 700, color: 'var(--bp-text)', margin: 0 }}>All Items</h1>
          <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 14, color: 'var(--bp-subtle)', margin: '4px 0 0' }}>Browse, filter, and select items for quotes</p>
        </div>
        <div style={{
          background: 'var(--bp-card)', borderRadius: 14, border: '1px solid var(--bp-border)',
          padding: '60px 40px', textAlign: 'center',
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>{'\uD83D\uDD0D'}</div>
          <h3 style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 18, fontWeight: 700, color: 'var(--bp-text)', margin: '0 0 8px' }}>No items to display</h3>
          <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 14, color: 'var(--bp-subtle)', margin: '0 0 20px', maxWidth: 400, marginInline: 'auto' }}>
            Items will appear here after you upload an inspection report. Each item includes AI-powered analysis, cost estimates, and deep-dive recommendations.
          </p>
          <button onClick={() => onNavigate('reports')} style={{
            padding: '12px 28px', borderRadius: 10, border: 'none', background: ACCENT, color: '#fff',
            cursor: 'pointer', fontSize: 15, fontWeight: 600, fontFamily: "'DM Sans',sans-serif",
          }}>Upload a Report</button>
        </div>
      </div>
    );
  }

  const hasAnyDispatchable = dispatchableCount > 0;

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontFamily: 'Fraunces, serif', fontSize: 24, fontWeight: 700, color: 'var(--bp-text)', margin: 0 }}>All Items</h1>
          <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 14, color: 'var(--bp-subtle)', margin: '4px 0 0' }}>
            {fullItems.length} item{fullItems.length !== 1 ? 's' : ''} across {reports.length} report{reports.length !== 1 ? 's' : ''}
          </p>
        </div>
        {hasAnyDispatchable && (
          <button onClick={handleDispatch} disabled={dispatching || selectedCount === 0} style={{
            padding: '10px 22px', borderRadius: 10, border: 'none',
            background: selectedCount > 0 ? ACCENT : '#94A3B8', color: '#fff',
            cursor: selectedCount > 0 && !dispatching ? 'pointer' : 'not-allowed',
            fontSize: 14, fontWeight: 600, fontFamily: "'DM Sans',sans-serif",
            opacity: dispatching ? 0.7 : 1, whiteSpace: 'nowrap',
          }}>
            {dispatching ? 'Dispatching...' : selectedCount > 0 ? `Get Quotes for ${selectedCount} Item${selectedCount !== 1 ? 's' : ''}` : 'Select Items for Quotes'}
          </button>
        )}
      </div>

      {/* Dispatch result banner */}
      {dispatchResult && (
        <div style={{
          background: '#10B98118', border: '1px solid #10B98130', borderRadius: 14,
          padding: '14px 20px', marginBottom: 16,
          fontFamily: "'DM Sans',sans-serif", fontSize: 14, color: '#10B981', fontWeight: 600,
        }}>{dispatchResult}</div>
      )}

      {/* Selection bar */}
      {hasAnyDispatchable && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16,
          padding: '10px 16px', background: 'var(--bp-card)', borderRadius: 10,
          border: '1px solid var(--bp-border)',
        }}>
          <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13, color: 'var(--bp-text)', fontWeight: 600 }}>
            {selectedCount} of {dispatchableCount} selected
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={selectAll} style={{
              fontFamily: "'DM Sans',sans-serif", fontSize: 12, fontWeight: 600,
              padding: '4px 12px', borderRadius: 6, border: '1px solid var(--bp-border)',
              background: selectedCount === dispatchableCount ? `${ACCENT}10` : 'transparent',
              color: selectedCount === dispatchableCount ? ACCENT : 'var(--bp-subtle)', cursor: 'pointer',
            }}>Select All</button>
            <button onClick={deselectAll} style={{
              fontFamily: "'DM Sans',sans-serif", fontSize: 12, fontWeight: 600,
              padding: '4px 12px', borderRadius: 6, border: '1px solid var(--bp-border)',
              background: selectedCount === 0 ? `${ACCENT}10` : 'transparent',
              color: selectedCount === 0 ? ACCENT : 'var(--bp-subtle)', cursor: 'pointer',
            }}>Deselect All</button>
          </div>
        </div>
      )}

      {/* Property / Report dropdown — primary filter for users juggling
          multiple home inspections. Sits above the other filters so the
          rest of the chips read as "within this property". */}
      {reportOptions.length > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
          <label
            htmlFor="hi-items-report-filter"
            style={{
              fontFamily: "'DM Sans',sans-serif", fontSize: 13, fontWeight: 600,
              color: 'var(--bp-text)',
            }}
          >
            Property:
          </label>
          <select
            id="hi-items-report-filter"
            value={activeReportId ?? ''}
            onChange={(e) => setActiveReportId(e.target.value || null)}
            style={{
              fontFamily: "'DM Sans',sans-serif", fontSize: 13, fontWeight: 500,
              padding: '8px 36px 8px 12px', borderRadius: 8,
              border: `1px solid ${activeReportId ? ACCENT : 'var(--bp-border)'}`,
              background: activeReportId ? `${ACCENT}08` : 'var(--bp-card)',
              color: activeReportId ? ACCENT : 'var(--bp-text)',
              cursor: 'pointer', minWidth: 260, maxWidth: 480,
              appearance: 'none',
              backgroundImage:
                "url(\"data:image/svg+xml;charset=US-ASCII,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8' fill='none'%3E%3Cpath d='M1 1L6 6L11 1' stroke='%239B9490' stroke-width='1.6' stroke-linecap='round'/%3E%3C/svg%3E\")",
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'right 12px center',
            }}
          >
            <option value="">All properties ({fullItems.length} items)</option>
            {reportOptions.map((r) => (
              <option key={r.id} value={r.id}>
                {r.address} ({r.count} item{r.count !== 1 ? 's' : ''})
              </option>
            ))}
          </select>
          {activeReportId && (
            <button
              onClick={() => setActiveReportId(null)}
              style={{
                fontFamily: "'DM Sans',sans-serif", fontSize: 12, fontWeight: 600,
                padding: '6px 10px', borderRadius: 8, border: 'none',
                background: '#F5F5F5', color: 'var(--bp-subtle)', cursor: 'pointer',
              }}
            >
              Clear
            </button>
          )}
        </div>
      )}

      {/* Seller action filter (only when any item is in a seller-mode report) */}
      {hasSellerModeItems && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
          <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, fontWeight: 600, color: 'var(--bp-subtle)', padding: '5px 0', marginRight: 4 }}>Action:</span>
          <button onClick={() => setActiveSellerAction(null)} style={{
            fontFamily: "'DM Sans',sans-serif", fontSize: 12, fontWeight: 600, padding: '5px 12px',
            borderRadius: 20, border: `1px solid ${!activeSellerAction ? ACCENT : 'var(--bp-border)'}`,
            background: !activeSellerAction ? `${ACCENT}10` : 'transparent',
            color: !activeSellerAction ? ACCENT : 'var(--bp-subtle)', cursor: 'pointer',
          }}>All</button>
          {(['fix_before_listing', 'disclose', 'ignore'] as const).map(act => {
            const m = SELLER_ACTION_META[act];
            const active = activeSellerAction === act;
            return (
              <button key={act} onClick={() => setActiveSellerAction(active ? null : act)} style={{
                fontFamily: "'DM Sans',sans-serif", fontSize: 12, fontWeight: 600, padding: '5px 12px',
                borderRadius: 20, border: `1px solid ${active ? m.color : 'var(--bp-border)'}`,
                background: active ? m.bg : 'transparent',
                color: active ? m.color : 'var(--bp-subtle)', cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: 4,
              }}>
                <span style={{ fontSize: 11 }}>{m.icon}</span>
                {m.label} ({sellerActionCounts[act]})
              </button>
            );
          })}
        </div>
      )}

      {/* Cross-referenced + DIY filter row */}
      {(xrefCount > 0 || diyCount > 0) && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
          <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, fontWeight: 600, color: 'var(--bp-subtle)', padding: '5px 0', marginRight: 4 }}>Filters:</span>
          <button
            onClick={() => setXrefOnly(v => !v)}
            title="Items the AI found correlations for across the inspection and supporting documents"
            style={{
              fontFamily: "'DM Sans',sans-serif", fontSize: 12, fontWeight: 600, padding: '5px 12px',
              borderRadius: 20,
              border: `1px solid ${xrefOnly ? '#7C3AED' : 'var(--bp-border)'}`,
              background: xrefOnly ? '#F3E8FF' : 'transparent',
              color: xrefOnly ? '#7C3AED' : 'var(--bp-subtle)', cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 4,
            }}
          >
            {'\uD83D\uDD17'} Cross-referenced ({xrefCount})
          </button>
          {diyCount > 0 && (
            <button
              onClick={() => setDiyOnly(v => !v)}
              title="Items that look safe to fix yourself — open AI Deep Dive to confirm + see steps"
              style={{
                fontFamily: "'DM Sans',sans-serif", fontSize: 12, fontWeight: 600, padding: '5px 12px',
                borderRadius: 20,
                border: `1px solid ${diyOnly ? '#1B9E77' : 'var(--bp-border)'}`,
                background: diyOnly ? '#E1F5EE' : 'transparent',
                color: diyOnly ? '#1B9E77' : 'var(--bp-subtle)', cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: 4,
              }}
            >
              {'🔧'} DIY-friendly ({diyCount})
            </button>
          )}
        </div>
      )}

      {/* Severity filters */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <button onClick={() => setActiveSeverity(null)} style={{
          fontFamily: "'DM Sans',sans-serif", fontSize: 12, fontWeight: 600, padding: '5px 12px',
          borderRadius: 20, border: `1px solid ${!activeSeverity ? ACCENT : 'var(--bp-border)'}`,
          background: !activeSeverity ? `${ACCENT}10` : 'transparent',
          color: !activeSeverity ? ACCENT : 'var(--bp-subtle)', cursor: 'pointer',
        }}>All Severity</button>
        {SEVERITY_ORDER.map(sev => {
          const cnt = severityCounts.get(sev);
          if (!cnt) return null;
          const sevColor = SEVERITY_COLORS[sev] ?? '#9B9490';
          return (
            <button key={sev} onClick={() => setActiveSeverity(activeSeverity === sev ? null : sev)} style={{
              fontFamily: "'DM Sans',sans-serif", fontSize: 12, fontWeight: 600, padding: '5px 12px',
              borderRadius: 20, border: `1px solid ${activeSeverity === sev ? sevColor : 'var(--bp-border)'}`,
              background: activeSeverity === sev ? `${sevColor}18` : 'transparent',
              color: activeSeverity === sev ? sevColor : 'var(--bp-subtle)', cursor: 'pointer',
            }}>
              {SEVERITY_LABELS[sev]} ({cnt})
            </button>
          );
        })}
      </div>

      {/* Category filters with selection toggle */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
        <button onClick={() => setActiveCategory(null)} style={{
          fontFamily: "'DM Sans',sans-serif", fontSize: 12, fontWeight: 600, padding: '5px 12px',
          borderRadius: 20, border: `1px solid ${!activeCategory ? ACCENT : 'var(--bp-border)'}`,
          background: !activeCategory ? `${ACCENT}10` : 'transparent',
          color: !activeCategory ? ACCENT : 'var(--bp-subtle)', cursor: 'pointer',
        }}>All Categories</button>
        {Array.from(categories).map(([cat, cnt]) => {
          const catDispatchable = dispatchableItems.filter(i => i.category === cat);
          const catSelectedCount = catDispatchable.filter(i => selectedItems.has(i.id)).length;
          const allCatSelected = catDispatchable.length > 0 && catSelectedCount === catDispatchable.length;
          const someCatSelected = catSelectedCount > 0 && !allCatSelected;

          return (
            <div key={cat} style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
              {/* Category filter button */}
              <button onClick={() => setActiveCategory(activeCategory === cat ? null : cat)} style={{
                fontFamily: "'DM Sans',sans-serif", fontSize: 12, fontWeight: 600, padding: '5px 12px',
                borderRadius: catDispatchable.length > 0 ? '20px 0 0 20px' : '20px',
                border: `1px solid ${activeCategory === cat ? ACCENT : 'var(--bp-border)'}`,
                borderRight: catDispatchable.length > 0 ? 'none' : undefined,
                background: activeCategory === cat ? `${ACCENT}10` : 'transparent',
                color: activeCategory === cat ? ACCENT : 'var(--bp-subtle)', cursor: 'pointer',
              }}>
                {CATEGORY_ICONS[cat] || ''} {CATEGORY_LABELS[cat] || cat} ({cnt})
              </button>
              {/* Category select toggle */}
              {catDispatchable.length > 0 && (
                <button onClick={() => toggleCategory(cat)} title={allCatSelected ? `Deselect all ${CATEGORY_LABELS[cat] || cat}` : `Select all ${CATEGORY_LABELS[cat] || cat}`} style={{
                  fontFamily: "'DM Sans',sans-serif", fontSize: 11, fontWeight: 700, padding: '5px 8px',
                  borderRadius: '0 20px 20px 0',
                  border: `1px solid ${activeCategory === cat ? ACCENT : 'var(--bp-border)'}`,
                  background: allCatSelected ? `${ACCENT}18` : someCatSelected ? `${ACCENT}08` : 'transparent',
                  color: allCatSelected ? ACCENT : 'var(--bp-subtle)', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  minWidth: 28, height: '100%',
                }}>
                  {allCatSelected ? '\u2713' : someCatSelected ? '\u2012' : '\u25CB'}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Item cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {filteredItems.map(item => {
          const canSelect = isDispatchable(item);
          const isSelected = selectedItems.has(item.id);
          const isDispatched = item.dispatchStatus === 'dispatched' || item.dispatchStatus === 'quotes_received' || item.dispatchStatus === 'quoted';
          const hasQuote = !!item.quoteDetails;

          return (
            <div
              key={item.id}
              onClick={canSelect ? () => toggleItem(item.id) : undefined}
              style={{
                background: 'var(--bp-card)', borderRadius: 14,
                border: `1px solid ${isSelected ? ACCENT : 'var(--bp-border)'}`,
                padding: '16px 18px', cursor: canSelect ? 'pointer' : 'default',
                transition: 'border-color 0.15s',
              }}
            >
              <div style={{ display: 'flex', gap: 12 }}>
                {/* Checkbox */}
                <div style={{ flexShrink: 0, paddingTop: 2 }}>
                  {canSelect ? (
                    <div style={{
                      width: 20, height: 20, borderRadius: 4,
                      border: `2px solid ${isSelected ? ACCENT : 'var(--bp-border)'}`,
                      background: isSelected ? ACCENT : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      transition: 'all 0.15s',
                    }}>
                      {isSelected && <span style={{ color: '#fff', fontSize: 12, fontWeight: 700 }}>{'\u2713'}</span>}
                    </div>
                  ) : (
                    <div style={{
                      width: 20, height: 20, borderRadius: 4,
                      background: isDispatched ? `${ACCENT}15` : '#94A3B815',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {isDispatched && <span style={{ color: ACCENT, fontSize: 10, fontWeight: 700 }}>{hasQuote ? '\uD83D\uDCB0' : '\u2713'}</span>}
                    </div>
                  )}
                </div>

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  {/* Badges row */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
                    <span style={{
                      fontFamily: "'DM Sans',sans-serif", fontSize: 10, fontWeight: 600, padding: '2px 7px',
                      borderRadius: 10, background: `${SEVERITY_COLORS[item.severity] ?? '#9B9490'}18`,
                      color: SEVERITY_COLORS[item.severity] ?? '#9B9490',
                    }}>
                      {SEVERITY_LABELS[item.severity] ?? item.severity}
                    </span>
                    <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, color: 'var(--bp-subtle)' }}>
                      {CATEGORY_ICONS[item.category] || ''} {CATEGORY_LABELS[item.category] || item.category}
                    </span>
                    {isDispatched && !hasQuote && (
                      <span style={{
                        fontFamily: "'DM Sans',sans-serif", fontSize: 10, fontWeight: 600, padding: '2px 7px',
                        borderRadius: 10, background: `${ACCENT}15`, color: ACCENT,
                      }}>Dispatched</span>
                    )}
                    {hasQuote && (
                      <span style={{
                        fontFamily: "'DM Sans',sans-serif", fontSize: 10, fontWeight: 600, padding: '2px 7px',
                        borderRadius: 10, background: '#10B98115', color: '#10B981',
                      }}>Quoted</span>
                    )}
                    {/* Seller action badge (when parent report is in seller mode) */}
                    {item._reportMode === 'seller' && item.sellerAction && (
                      <SellerActionBadge action={item.sellerAction} />
                    )}
                    {/* DIY badge — heuristic by default, "confirmed" when AI verdict is cached. */}
                    {isLikelyDiy({
                      severity: item.severity,
                      category: item.category,
                      title: item.title,
                      costEstimateMax: item.costEstimateMax,
                    }, item.diyAnalysis?.feasible ?? null) && (
                      <DIYBadge confirmed={item.diyAnalysis?.feasible === true} compact />
                    )}
                  </div>

                  {/* Title */}
                  <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 14, fontWeight: 600, color: 'var(--bp-text)', marginBottom: 2 }}>
                    {item.title}
                  </div>

                  {/* Description */}
                  {item.description && (
                    <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, color: 'var(--bp-subtle)', lineHeight: 1.4, marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const }}>
                      {item.description}
                    </div>
                  )}

                  {/* Photo descriptions */}
                  {item.photoDescriptions && item.photoDescriptions.length > 0 && (
                    <div style={{ marginTop: 4, marginBottom: 4, padding: '6px 10px', background: 'var(--bp-bg)', borderRadius: 6 }}>
                      {item.photoDescriptions.map((desc, i) => (
                        <div key={i} style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, color: 'var(--bp-subtle)', marginBottom: i < item.photoDescriptions.length - 1 ? 3 : 0 }}>
                          <span style={{ opacity: 0.5 }}>Photo {i + 1}:</span> {desc}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Report address + Page citation */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 2 }}>
                    <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, color: 'var(--bp-subtle)', opacity: 0.7 }}>
                      {item._reportAddress}
                    </span>
                    <PageCitation sourcePages={item.sourcePages} reportFileUrl={item._reportFileUrl} />
                  </div>

                  {/* Quote display */}
                  {item.quoteDetails && (
                    <div style={{
                      marginTop: 8, padding: '8px 12px', borderRadius: 8,
                      background: '#10B98110', border: '1px solid #10B98120',
                    }}>
                      <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13, fontWeight: 600, color: '#10B981' }}>
                        {item.quoteDetails.bundleSize && item.quoteDetails.bundleSize > 1
                          ? `Bundle: ${formatCurrency(item.quoteDetails.price)} (covers ${item.quoteDetails.bundleSize} items)`
                          : `Quote: ${formatCurrency(item.quoteDetails.price)}`}
                      </span>
                      <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, color: 'var(--bp-subtle)', marginLeft: 8 }}>
                        {item.quoteDetails.providerName}
                        {item.quoteDetails.providerRating > 0 && <> &middot; {item.quoteDetails.providerRating} stars</>}
                      </span>
                    </div>
                  )}

                  {/* Value Impact */}
                  {item.valueImpact && (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                      <span style={{
                        fontFamily: "'DM Sans',sans-serif", fontSize: 10, fontWeight: 600, padding: '2px 8px',
                        borderRadius: 6, background: '#8B5CF615', color: '#7C3AED', display: 'inline-flex', alignItems: 'center', gap: 3,
                      }}>
                        {'\u2191'} ~{formatCurrency(item.valueImpact.roiLow)}-{formatCurrency(item.valueImpact.roiHigh)} value
                      </span>
                      {item.valueImpact.lenderFlagType === 'fha_va_required' && (
                        <span style={{
                          fontFamily: "'DM Sans',sans-serif", fontSize: 10, fontWeight: 600, padding: '2px 8px',
                          borderRadius: 6, background: '#EF444415', color: '#DC2626',
                        }}>FHA/VA Required</span>
                      )}
                      {item.valueImpact.lenderFlagType === 'lender_concern' && (
                        <span style={{
                          fontFamily: "'DM Sans',sans-serif", fontSize: 10, fontWeight: 600, padding: '2px 8px',
                          borderRadius: 6, background: '#F59E0B15', color: '#D97706',
                        }}>Lender Concern</span>
                      )}
                    </div>
                  )}
                </div>

                {/* Cost estimate */}
                {(item.costEstimateMin || item.costEstimateMax) && (
                  <div style={{ flexShrink: 0, textAlign: 'right' }}>
                    <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13, fontWeight: 600, color: 'var(--bp-text)' }}>
                      {formatCurrency(item.costEstimateMin ?? 0)}
                    </div>
                    <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, color: 'var(--bp-subtle)' }}>
                      to {formatCurrency(item.costEstimateMax ?? 0)}
                    </div>
                  </div>
                )}
              </div>

              {/* AI Deep Dive button */}
              {(item._pricingTier === 'professional' || item._pricingTier === 'premium' || item._pricingTier === 'essential') && (
                <button
                  onClick={(e) => { e.stopPropagation(); setExpandedItemId(expandedItemId === item.id ? null : item.id); }}
                  style={{
                    width: '100%', marginTop: 10, padding: '9px 0', borderRadius: 8,
                    border: `1px solid ${expandedItemId === item.id ? ACCENT : `${ACCENT}30`}`,
                    background: expandedItemId === item.id ? `${ACCENT}08` : 'transparent',
                    color: ACCENT, cursor: 'pointer',
                    fontFamily: "'DM Sans',sans-serif", fontSize: 13, fontWeight: 600,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    transition: 'all 0.15s',
                  }}
                >
                  <span style={{ fontSize: 14 }}>{expandedItemId === item.id ? '\u2715' : '\u2728'}</span>
                  {expandedItemId === item.id ? 'Close AI Analysis' : 'AI Deep Dive'}
                </button>
              )}

              {/* AI Deep Dive expanded content */}
              {expandedItemId === item.id && (
                <ItemDeepDive
                  reportId={item._reportId}
                  itemId={item.id}
                  itemTitle={item.title}
                  diyContext={{
                    severity: item.severity,
                    category: item.category,
                    costEstimateMax: item.costEstimateMax,
                    initialAnalysis: item.diyAnalysis ?? null,
                  }}
                />
              )}
            </div>
          );
        })}
      </div>

      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
    </div>
  );
}

// Helper: can this item be selected for dispatch?
function isDispatchable(item: ItemWithContext): boolean {
  if (item.severity === 'informational') return false;
  if (item._pricingTier !== 'professional' && item._pricingTier !== 'premium') return false;
  if (item.dispatchStatus === 'dispatched' || item.dispatchStatus === 'quotes_received' || item.dispatchStatus === 'quoted' || item.dispatchStatus === 'booked' || item.dispatchStatus === 'completed') return false;
  return true;
}

// ── Seller Action Badge (shared colors/labels exported as helpers) ─────────

const SELLER_ACTION_META: Record<'fix_before_listing' | 'disclose' | 'ignore', { label: string; color: string; bg: string; icon: string }> = {
  fix_before_listing: { label: 'Fix', color: '#DC2626', bg: '#FEE2E2', icon: '\uD83D\uDD27' },
  disclose:           { label: 'Disclose', color: '#D97706', bg: '#FEF3C7', icon: '\uD83D\uDCCB' },
  ignore:             { label: 'Ignore', color: '#6B7280', bg: '#E5E7EB', icon: '\u23ED\uFE0F' },
};

function SellerActionBadge({ action }: { action: 'fix_before_listing' | 'disclose' | 'ignore' }) {
  const m = SELLER_ACTION_META[action];
  return (
    <span style={{
      fontFamily: "'DM Sans',sans-serif", fontSize: 10, fontWeight: 700, padding: '2px 7px',
      borderRadius: 10, background: m.bg, color: m.color,
      display: 'inline-flex', alignItems: 'center', gap: 3,
    }}>
      <span style={{ fontSize: 10 }}>{m.icon}</span>
      {m.label}
    </span>
  );
}

export { SELLER_ACTION_META, SellerActionBadge };

function Spinner() {
  return (
    <div style={{
      width: 40, height: 40, border: '3px solid var(--bp-border)',
      borderTopColor: ACCENT, borderRadius: '50%', animation: 'spin 0.8s linear infinite',
      margin: '0 auto',
    }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
