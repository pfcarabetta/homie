import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { inspectService, type PortalReport, type PortalReportItem } from '@/services/inspector-api';
import { SEVERITY_COLORS, SEVERITY_LABELS, CATEGORY_ICONS, CATEGORY_LABELS, formatCurrency } from './constants';
import type { Tab } from './constants';
import PageCitation from './PageCitation';
import { SellerActionBadge } from './ItemsTab';

const ACCENT = '#2563EB';
const RED = '#DC2626';
const GREEN = '#10B981';

interface NegotiationsTabProps {
  reports: PortalReport[];
  onNavigate: (tab: Tab) => void;
  onReportsChange: () => void;
}

type ConcessionStatus = 'pending' | 'agreed' | 'credited' | 'escrow_holdback' | 'dropped';

const STATUS_LABELS: Record<ConcessionStatus, string> = {
  pending: 'Pending',
  agreed: 'Seller Agreed',
  credited: 'Credited',
  escrow_holdback: 'Escrow Holdback',
  dropped: 'Dropped',
};

const STATUS_COLORS: Record<ConcessionStatus, string> = {
  pending: '#9B9490',
  agreed: '#3B82F6',
  credited: '#10B981',
  escrow_holdback: '#8B5CF6',
  dropped: '#EF4444',
};

export default function NegotiationsTab({ reports, onNavigate, onReportsChange }: NegotiationsTabProps) {
  // Filter to reports that have items (any parsed reports)
  const reportsWithItems = useMemo(() => reports.filter(r => r.itemCount > 0), [reports]);

  const [activeReportId, setActiveReportId] = useState<string | null>(null);

  // Default to most recent report on mount
  useEffect(() => {
    if (!activeReportId && reportsWithItems.length > 0) {
      setActiveReportId(reportsWithItems[0].id);
    }
  }, [reportsWithItems, activeReportId]);

  if (reportsWithItems.length === 0) {
    return (
      <div>
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontFamily: 'Fraunces, serif', fontSize: 24, fontWeight: 700, color: 'var(--bp-text)', margin: 0 }}>Negotiations</h1>
          <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 14, color: 'var(--bp-subtle)', margin: '4px 0 0' }}>Build repair requests and track seller concessions</p>
        </div>
        <div style={{
          background: 'var(--bp-card)', borderRadius: 14, border: '1px solid var(--bp-border)',
          padding: '60px 40px', textAlign: 'center',
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>{'\uD83E\uDD1D'}</div>
          <h3 style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 18, fontWeight: 700, color: 'var(--bp-text)', margin: '0 0 8px' }}>Ready to negotiate</h3>
          <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 14, color: 'var(--bp-subtle)', margin: '0 0 20px', maxWidth: 420, marginInline: 'auto' }}>
            Upload an inspection report to start building a data-backed repair request. Select items to ask the seller to fix or credit.
          </p>
          <button onClick={() => onNavigate('reports')} style={{
            padding: '12px 28px', borderRadius: 10, border: 'none', background: ACCENT, color: '#fff',
            cursor: 'pointer', fontSize: 15, fontWeight: 600, fontFamily: "'DM Sans',sans-serif",
          }}>Upload a Report</button>
        </div>
      </div>
    );
  }

  const activeReport = reportsWithItems.find(r => r.id === activeReportId) ?? reportsWithItems[0];

  return (
    <NegotiationView
      key={activeReport.id}
      report={activeReport}
      reports={reportsWithItems}
      activeReportId={activeReport.id}
      onChangeReport={setActiveReportId}
      onReportsChange={onReportsChange}
    />
  );
}

// ── Per-report negotiation view ─────────────────────────────────────────────

function NegotiationView({ report, reports, activeReportId, onChangeReport, onReportsChange }: {
  report: PortalReport;
  reports: PortalReport[];
  activeReportId: string;
  onChangeReport: (id: string) => void;
  onReportsChange: () => void;
}) {
  // Local items state mirrors DB; updates are debounced
  const [items, setItems] = useState<PortalReportItem[]>(report.items);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [activeSeverity, setActiveSeverity] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [quotedOnly, setQuotedOnly] = useState(false);

  // Sync items from prop when report changes
  useEffect(() => {
    setItems(report.items);
  }, [report.items, report.id]);

  // Debounce updates per item field
  const updateTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  function patchItem(itemId: string, fields: Partial<PortalReportItem>) {
    // Update local state immediately
    setItems(prev => prev.map(i => i.id === itemId ? { ...i, ...fields } : i));

    // Debounce server write per item
    const existing = updateTimers.current.get(itemId);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      const apiFields: Record<string, unknown> = {};
      if (fields.isIncludedInRequest !== undefined) apiFields.isIncludedInRequest = fields.isIncludedInRequest;
      if (fields.homeownerNotes !== undefined) apiFields.homeownerNotes = fields.homeownerNotes;
      if (fields.sellerAgreedAmountCents !== undefined) apiFields.sellerAgreedAmountCents = fields.sellerAgreedAmountCents;
      if (fields.creditIssuedCents !== undefined) apiFields.creditIssuedCents = fields.creditIssuedCents;
      if (fields.concessionStatus !== undefined) apiFields.concessionStatus = fields.concessionStatus;
      if (fields.repairRequestSource !== undefined) apiFields.repairRequestSource = fields.repairRequestSource;
      if (fields.repairRequestCustomAmountCents !== undefined) apiFields.repairRequestCustomAmountCents = fields.repairRequestCustomAmountCents;
      void inspectService.updateNegotiation(report.id, itemId, apiFields);
      updateTimers.current.delete(itemId);
    }, 500);
    updateTimers.current.set(itemId, timer);
  }

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      for (const timer of updateTimers.current.values()) clearTimeout(timer);
      updateTimers.current.clear();
    };
  }, []);

  // Helper: resolve ask amount based on selected source
  function resolveAsk(item: PortalReportItem): { cents: number; sourceId: string; label: string } {
    const quotes = item.quotes ?? [];
    const high = item.costEstimateMax ?? 0;

    // User entered a custom amount
    if (item.repairRequestSource === 'custom' && item.repairRequestCustomAmountCents != null) {
      return { cents: item.repairRequestCustomAmountCents, sourceId: 'custom', label: 'Custom amount' };
    }
    // User explicitly chose AI estimate
    if (item.repairRequestSource === 'estimate') {
      return { cents: high, sourceId: 'estimate', label: 'AI estimate' };
    }
    // User selected a specific provider
    if (item.repairRequestSource) {
      const selected = quotes.find(q => q.providerId === item.repairRequestSource);
      if (selected) {
        return { cents: selected.amountCents, sourceId: selected.providerId, label: `Quote: ${selected.providerName}` };
      }
    }
    // Default to best (lowest) quote if available
    if (quotes.length > 0) {
      const best = quotes.reduce((lo, q) => q.amountCents < lo.amountCents ? q : lo, quotes[0]);
      return { cents: best.amountCents, sourceId: best.providerId, label: `Quote: ${best.providerName}` };
    }
    // Legacy single-quote field
    if (item.quoteAmount && item.quoteAmount > 0) {
      return { cents: item.quoteAmount, sourceId: 'quote', label: item.providerName ? `Quote: ${item.providerName}` : 'Provider quote' };
    }
    // Use AI estimate
    return { cents: high, sourceId: 'estimate', label: 'AI estimate' };
  }

  function askCents(item: PortalReportItem): number {
    return resolveAsk(item).cents;
  }

  // Computed totals
  const totals = useMemo(() => {
    let yourAsk = 0;
    let sellerAgreed = 0;
    let creditsReceived = 0;
    let selectedCount = 0;
    for (const item of items) {
      if (item.isIncludedInRequest) {
        yourAsk += askCents(item);
        selectedCount++;
      }
      sellerAgreed += item.sellerAgreedAmountCents ?? 0;
      creditsReceived += item.creditIssuedCents ?? 0;
    }
    return { yourAsk, sellerAgreed, creditsReceived, selectedCount };
  }, [items]);

  // Bulk select presets
  function clearAll() {
    setItems(prev => prev.map(i => ({ ...i, isIncludedInRequest: false })));
    items.forEach(i => {
      if (i.isIncludedInRequest) {
        void inspectService.updateNegotiation(report.id, i.id, { isIncludedInRequest: false });
      }
    });
  }

  // Toggle all items in a category on/off. category=null means "all" (everything except informational)
  function toggleCategory(category: string | null) {
    const targetItems = items.filter(i => i.severity !== 'informational' && (category === null || i.category === category));
    if (targetItems.length === 0) return;
    const allSelected = targetItems.every(i => i.isIncludedInRequest);
    const newValue = !allSelected;
    setItems(prev => prev.map(i => {
      if (i.severity === 'informational') return i;
      if (category !== null && i.category !== category) return i;
      return { ...i, isIncludedInRequest: newValue };
    }));
    targetItems.forEach(i => {
      if (i.isIncludedInRequest !== newValue) {
        void inspectService.updateNegotiation(report.id, i.id, { isIncludedInRequest: newValue });
      }
    });
  }

  async function handleDownloadPdf() {
    setDownloadingPdf(true);
    setPdfError(null);
    try {
      const blob = await inspectService.downloadRepairRequestPdf(report.id);
      if (!blob) {
        setPdfError('Failed to generate PDF. Make sure you have items selected.');
        setDownloadingPdf(false);
        return;
      }
      // Trigger download
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const addrSlug = report.propertyAddress.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
      a.download = `repair-request-${addrSlug}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setPdfError((err as Error).message ?? 'Failed to download PDF');
    }
    setDownloadingPdf(false);
  }

  // Base list: skip informational items (rarely worth negotiating)
  const baseItems = useMemo(() => items.filter(i => i.severity !== 'informational'), [items]);

  // Apply filters
  const negotiableItems = useMemo(() => {
    let list = baseItems;
    if (activeSeverity) list = list.filter(i => i.severity === activeSeverity);
    if (activeCategory) list = list.filter(i => i.category === activeCategory);
    if (quotedOnly) list = list.filter(i => (i.quotes && i.quotes.length > 0) || (i.quoteAmount && i.quoteAmount > 0));
    return list;
  }, [baseItems, activeSeverity, activeCategory, quotedOnly]);

  // Counts for filter pills
  const severityCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of baseItems) m.set(i.severity, (m.get(i.severity) ?? 0) + 1);
    return m;
  }, [baseItems]);

  const categoryCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of baseItems) m.set(i.category, (m.get(i.category) ?? 0) + 1);
    return m;
  }, [baseItems]);

  const quotedCount = useMemo(() => baseItems.filter(i => (i.quotes && i.quotes.length > 0) || (i.quoteAmount && i.quoteAmount > 0)).length, [baseItems]);

  const isSellerMode = report.reportMode === 'seller';

  // Seller-mode computed totals
  const sellerTotals = useMemo(() => {
    if (!isSellerMode) return { preListingCost: 0, valueLift: 0, dealKillers: 0, fixCount: 0, discloseCount: 0 };
    let preListingCost = 0;
    let valueLiftSum = 0;
    let dealKillers = 0;
    let fixCount = 0;
    let discloseCount = 0;
    for (const item of baseItems) {
      if (item.sellerAction === 'fix_before_listing' && item.isIncludedInRequest) {
        const cost = (item.costEstimateMax ?? 0);
        preListingCost += cost;
        valueLiftSum += ((item.costEstimateMin ?? 0) + (item.costEstimateMax ?? 0)) / 2;
        fixCount++;
        // Deal-killer check: safety/urgent or FHA/VA flagged-ish categories
        if (item.severity === 'safety_hazard' || item.severity === 'urgent') dealKillers++;
      }
      if (item.sellerAction === 'disclose' && item.isIncludedInRequest) discloseCount++;
    }
    const valueLift = Math.round(valueLiftSum * 1.3);
    return { preListingCost, valueLift, dealKillers, fixCount, discloseCount };
  }, [baseItems, isSellerMode]);

  async function handleDownloadPreListingPdf() {
    setDownloadingPdf(true);
    setPdfError(null);
    try {
      const blob = await inspectService.downloadPreListingPlanPdf(report.id);
      if (!blob) { setPdfError('Failed to generate PDF.'); setDownloadingPdf(false); return; }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const addrSlug = report.propertyAddress.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
      a.download = `pre-listing-plan-${addrSlug}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setPdfError((err as Error).message ?? 'Failed to download PDF');
    }
    setDownloadingPdf(false);
  }

  // Preset helpers for seller mode
  function selectAllByAction(action: 'fix_before_listing' | 'disclose') {
    const targets = baseItems.filter(i => i.sellerAction === action);
    setItems(prev => prev.map(i => i.sellerAction === action ? { ...i, isIncludedInRequest: true } : i));
    targets.forEach(i => {
      if (!i.isIncludedInRequest) {
        void inspectService.updateNegotiation(report.id, i.id, { isIncludedInRequest: true });
      }
    });
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontFamily: 'Fraunces, serif', fontSize: 24, fontWeight: 700, color: 'var(--bp-text)', margin: 0 }}>
            {isSellerMode ? 'Pre-Listing Plan' : 'Negotiations'}
          </h1>
          <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 14, color: 'var(--bp-subtle)', margin: '4px 0 0' }}>
            {isSellerMode ? 'Plan what to fix, disclose, or ignore before listing' : 'Build repair requests and track seller concessions'}
          </p>
        </div>
        {reports.length > 1 && (
          <select
            value={activeReportId}
            onChange={(e) => onChangeReport(e.target.value)}
            style={{
              padding: '8px 12px', borderRadius: 8, border: '1px solid var(--bp-border)',
              background: 'var(--bp-card)', color: 'var(--bp-text)',
              fontFamily: "'DM Sans',sans-serif", fontSize: 13, cursor: 'pointer', minWidth: 240,
            }}
          >
            {reports.map(r => (
              <option key={r.id} value={r.id}>{r.propertyAddress}</option>
            ))}
          </select>
        )}
      </div>

      {/* Property header */}
      <div style={{
        background: 'var(--bp-card)', borderRadius: 14, border: '1px solid var(--bp-border)',
        padding: '14px 18px', marginBottom: 16,
      }}>
        <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 14, fontWeight: 700, color: 'var(--bp-text)' }}>
          {report.propertyAddress}
        </div>
        <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, color: 'var(--bp-subtle)', marginTop: 2 }}>
          {report.propertyCity}, {report.propertyState} {report.propertyZip}
        </div>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 16 }}>
        {isSellerMode ? (
          <>
            <SummaryCard label="Pre-Listing Investment" subLabel={`${sellerTotals.fixCount} item${sellerTotals.fixCount !== 1 ? 's' : ''} to fix`} value={formatCurrency(sellerTotals.preListingCost / 100)} color={RED} icon={'\uD83D\uDD27'} />
            <SummaryCard label="Est. Value Lift" subLabel="If all fix items completed" value={formatCurrency(sellerTotals.valueLift / 100)} color={GREEN} icon={'\uD83D\uDCC8'} />
            <SummaryCard label="Deal-Killers" subLabel="Safety / urgent / FHA-VA" value={String(sellerTotals.dealKillers)} color={'#EA580C'} icon={'\u26A0\uFE0F'} />
          </>
        ) : (
          <>
            <SummaryCard label="Your Ask" subLabel={`${totals.selectedCount} item${totals.selectedCount !== 1 ? 's' : ''}`} value={formatCurrency(totals.yourAsk / 100)} color={RED} icon={'\uD83D\uDCCB'} />
            <SummaryCard label="Seller Agreed" subLabel="Across all items" value={formatCurrency(totals.sellerAgreed / 100)} color={ACCENT} icon={'\uD83E\uDD1D'} />
            <SummaryCard label="Credits Received" subLabel="Closed concessions" value={formatCurrency(totals.creditsReceived / 100)} color={GREEN} icon={'\u2705'} />
          </>
        )}
      </div>

      {/* Action bar — PDF download + clear */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap',
        padding: '12px 16px', background: 'var(--bp-card)', borderRadius: 10, border: '1px solid var(--bp-border)',
      }}>
        <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, color: 'var(--bp-subtle)' }}>
          {totals.selectedCount > 0
            ? `${totals.selectedCount} item${totals.selectedCount !== 1 ? 's' : ''} ${isSellerMode ? 'included in pre-listing plan' : 'included in repair request'}`
            : isSellerMode ? 'No items selected — use the quick select buttons or pick from categories' : 'No items selected — pick from the categories below'}
        </span>
        {isSellerMode && (
          <>
            <PresetButton onClick={() => selectAllByAction('fix_before_listing')}>Select All Fix</PresetButton>
            <PresetButton onClick={() => selectAllByAction('disclose')}>Select All Disclose</PresetButton>
          </>
        )}
        {totals.selectedCount > 0 && (
          <PresetButton onClick={clearAll}>Clear All</PresetButton>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          {pdfError && (
            <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, color: '#DC2626' }}>{pdfError}</span>
          )}
          <button
            onClick={isSellerMode ? handleDownloadPreListingPdf : handleDownloadPdf}
            disabled={downloadingPdf || totals.selectedCount === 0}
            style={{
              padding: '9px 18px', borderRadius: 8, border: 'none',
              background: totals.selectedCount > 0 && !downloadingPdf ? ACCENT : '#94A3B8',
              color: '#fff', cursor: totals.selectedCount > 0 && !downloadingPdf ? 'pointer' : 'not-allowed',
              fontSize: 13, fontWeight: 600, fontFamily: "'DM Sans',sans-serif",
              display: 'inline-flex', alignItems: 'center', gap: 6,
              opacity: downloadingPdf ? 0.7 : 1,
            }}
          >
            <svg width={14} height={14} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M10 4v10M5 9l5 5 5-5M3 17h14" /></svg>
            {downloadingPdf ? 'Generating...' : isSellerMode ? 'Download Pre-Listing Plan PDF' : 'Download Repair Request PDF'}
          </button>
        </div>
      </div>

      {/* Quoted-only toggle + filter row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <button
          onClick={() => setQuotedOnly(!quotedOnly)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '6px 14px', borderRadius: 20,
            border: `1px solid ${quotedOnly ? '#10B981' : 'var(--bp-border)'}`,
            background: quotedOnly ? '#10B98115' : 'var(--bp-card)',
            color: quotedOnly ? '#10B981' : 'var(--bp-text)',
            fontFamily: "'DM Sans',sans-serif", fontSize: 12, fontWeight: 600, cursor: 'pointer',
          }}
        >
          <span style={{
            width: 14, height: 14, borderRadius: 3,
            border: `2px solid ${quotedOnly ? '#10B981' : 'var(--bp-border)'}`,
            background: quotedOnly ? '#10B981' : 'transparent',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {quotedOnly && <span style={{ color: '#fff', fontSize: 9, fontWeight: 700 }}>{'\u2713'}</span>}
          </span>
          Quoted items only ({quotedCount})
        </button>
      </div>

      {/* Severity filters */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, fontWeight: 600, color: 'var(--bp-subtle)', padding: '5px 0', marginRight: 4 }}>Severity:</span>
        <FilterPill active={!activeSeverity} onClick={() => setActiveSeverity(null)}>All</FilterPill>
        {(['safety_hazard', 'urgent', 'recommended', 'monitor'] as const).map(sev => {
          const cnt = severityCounts.get(sev);
          if (!cnt) return null;
          const sevColor = SEVERITY_COLORS[sev] ?? '#9B9490';
          return (
            <FilterPill
              key={sev}
              active={activeSeverity === sev}
              activeColor={sevColor}
              onClick={() => setActiveSeverity(activeSeverity === sev ? null : sev)}
            >
              {SEVERITY_LABELS[sev]} ({cnt})
            </FilterPill>
          );
        })}
      </div>

      {/* Category filters with select-all suffix */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16, alignItems: 'center' }}>
        <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, fontWeight: 600, color: 'var(--bp-subtle)', padding: '5px 0', marginRight: 4 }}>Category:</span>

        {/* "All" pill with global select-all toggle */}
        <CategoryFilterPill
          label="All"
          active={!activeCategory}
          onFilterClick={() => setActiveCategory(null)}
          allSelected={baseItems.length > 0 && baseItems.every(i => i.isIncludedInRequest)}
          someSelected={baseItems.some(i => i.isIncludedInRequest) && !baseItems.every(i => i.isIncludedInRequest)}
          onToggleSelect={() => toggleCategory(null)}
        />

        {Array.from(categoryCounts).map(([cat, cnt]) => {
          const catItems = baseItems.filter(i => i.category === cat);
          const allSelected = catItems.length > 0 && catItems.every(i => i.isIncludedInRequest);
          const someSelected = catItems.some(i => i.isIncludedInRequest) && !allSelected;
          return (
            <CategoryFilterPill
              key={cat}
              label={`${CATEGORY_ICONS[cat] || ''} ${CATEGORY_LABELS[cat] || cat} (${cnt})`}
              active={activeCategory === cat}
              onFilterClick={() => setActiveCategory(activeCategory === cat ? null : cat)}
              allSelected={allSelected}
              someSelected={someSelected}
              onToggleSelect={() => toggleCategory(cat)}
            />
          );
        })}
      </div>

      {/* Items list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {negotiableItems.length === 0 ? (
          <div style={{
            background: 'var(--bp-card)', borderRadius: 14, border: '1px solid var(--bp-border)',
            padding: 32, textAlign: 'center',
          }}>
            <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 14, color: 'var(--bp-subtle)', margin: 0 }}>
              No items match the current filters
            </p>
          </div>
        ) : negotiableItems.map(item => (
          <NegotiationItemRow
            key={item.id}
            item={item}
            askCents={askCents(item)}
            reportFileUrl={report.reportFileUrl ?? null}
            isSellerMode={isSellerMode}
            onChange={(fields) => patchItem(item.id, fields)}
          />
        ))}
      </div>
    </div>
  );
}

// ── Filter pill ─────────────────────────────────────────────────────────────

function FilterPill({ active, activeColor, onClick, children }: { active: boolean; activeColor?: string; onClick: () => void; children: React.ReactNode }) {
  const color = activeColor ?? ACCENT;
  return (
    <button onClick={onClick} style={{
      fontFamily: "'DM Sans',sans-serif", fontSize: 12, fontWeight: 600, padding: '5px 12px',
      borderRadius: 20, border: `1px solid ${active ? color : 'var(--bp-border)'}`,
      background: active ? `${color}10` : 'transparent',
      color: active ? color : 'var(--bp-subtle)', cursor: 'pointer',
    }}>{children}</button>
  );
}

// ── Category filter pill with built-in select-all toggle ────────────────────

function CategoryFilterPill({ label, active, onFilterClick, allSelected, someSelected, onToggleSelect }: {
  label: string;
  active: boolean;
  onFilterClick: () => void;
  allSelected: boolean;
  someSelected: boolean;
  onToggleSelect: () => void;
}) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'stretch', gap: 0 }}>
      {/* Filter button (left half) */}
      <button onClick={onFilterClick} style={{
        fontFamily: "'DM Sans',sans-serif", fontSize: 12, fontWeight: 600, padding: '5px 12px',
        borderRadius: '20px 0 0 20px',
        border: `1px solid ${active ? ACCENT : 'var(--bp-border)'}`,
        borderRight: 'none',
        background: active ? `${ACCENT}10` : 'transparent',
        color: active ? ACCENT : 'var(--bp-subtle)', cursor: 'pointer',
      }}>{label}</button>
      {/* Select-all toggle (right half) */}
      <button
        onClick={onToggleSelect}
        title={allSelected ? 'Deselect all in this category' : 'Select all in this category'}
        style={{
          fontFamily: "'DM Sans',sans-serif", fontSize: 11, fontWeight: 700, padding: '5px 8px',
          borderRadius: '0 20px 20px 0',
          border: `1px solid ${active ? ACCENT : 'var(--bp-border)'}`,
          background: allSelected ? `${ACCENT}18` : someSelected ? `${ACCENT}08` : 'transparent',
          color: allSelected ? ACCENT : 'var(--bp-subtle)', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          minWidth: 28,
        }}
      >
        {allSelected ? '\u2713' : someSelected ? '\u2012' : '\u25CB'}
      </button>
    </div>
  );
}

// ── Summary card ────────────────────────────────────────────────────────────

function SummaryCard({ label, subLabel, value, color, icon }: { label: string; subLabel?: string; value: string; color: string; icon: string }) {
  return (
    <div style={{
      background: 'var(--bp-card)', borderRadius: 12, padding: '16px 18px',
      border: '1px solid var(--bp-border)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, fontWeight: 600, color: 'var(--bp-subtle)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</span>
        <span style={{ fontSize: 16 }}>{icon}</span>
      </div>
      <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 22, fontWeight: 700, color, lineHeight: 1.1 }}>{value}</div>
      {subLabel && (
        <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, color: 'var(--bp-subtle)', marginTop: 4 }}>{subLabel}</div>
      )}
    </div>
  );
}

function PresetButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      fontFamily: "'DM Sans',sans-serif", fontSize: 12, fontWeight: 600, padding: '6px 12px',
      borderRadius: 6, border: '1px solid var(--bp-border)', background: 'transparent',
      color: 'var(--bp-text)', cursor: 'pointer',
    }}>{children}</button>
  );
}

// ── Single negotiation item row ─────────────────────────────────────────────

function NegotiationItemRow({ item, askCents, onChange, reportFileUrl, isSellerMode }: {
  item: PortalReportItem;
  askCents: number;
  onChange: (fields: Partial<PortalReportItem>) => void;
  reportFileUrl?: string | null;
  isSellerMode?: boolean;
}) {
  const [showNotes, setShowNotes] = useState(!!item.homeownerNotes);
  const [showSourceMenu, setShowSourceMenu] = useState(false);
  const sevColor = SEVERITY_COLORS[item.severity] ?? '#9B9490';
  const status = (item.concessionStatus as ConcessionStatus | null) ?? 'pending';

  const quotes = item.quotes ?? [];
  const hasQuotes = quotes.length > 0;
  const userExplicitlyChoseEstimate = item.repairRequestSource === 'estimate';
  const userExplicitlyChoseCustom = item.repairRequestSource === 'custom';
  const userSelectedProviderId = item.repairRequestSource && item.repairRequestSource !== 'estimate' && item.repairRequestSource !== 'custom' ? item.repairRequestSource : null;
  const selectedQuote = userSelectedProviderId ? quotes.find(q => q.providerId === userSelectedProviderId) : null;
  const bestQuote = hasQuotes ? quotes.reduce((lo, q) => q.amountCents < lo.amountCents ? q : lo, quotes[0]) : null;
  const usingEstimate = userExplicitlyChoseEstimate || (!hasQuotes && !item.quoteAmount && !userExplicitlyChoseCustom);

  // Build source label for current selection
  let currentSourceLabel: string;
  if (userExplicitlyChoseCustom) {
    currentSourceLabel = 'Custom amount';
  } else if (usingEstimate) {
    const lo = (item.costEstimateMin ?? 0) / 100;
    const hi = (item.costEstimateMax ?? 0) / 100;
    currentSourceLabel = lo > 0 && lo !== hi ? `AI estimate (${formatCurrency(lo)}-${formatCurrency(hi)})` : 'AI estimate';
  } else if (selectedQuote) {
    currentSourceLabel = `Quote: ${selectedQuote.providerName}`;
  } else if (bestQuote) {
    currentSourceLabel = `Best quote: ${bestQuote.providerName}`;
  } else if (item.providerName) {
    currentSourceLabel = `Quote: ${item.providerName}`;
  } else {
    currentSourceLabel = 'AI estimate';
  }

  // Source selector options: all quotes + estimate (if cost estimate exists)
  const hasEstimate = (item.costEstimateMax ?? 0) > 0;
  const sortedQuotes = [...quotes].sort((a, b) => a.amountCents - b.amountCents);

  return (
    <div style={{
      background: 'var(--bp-card)', borderRadius: 12,
      border: `1px solid ${item.isIncludedInRequest ? ACCENT : 'var(--bp-border)'}`,
      padding: '14px 16px',
    }}>
      {/* Top row: checkbox + info + ask + agreed + status */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        {/* Checkbox */}
        <div
          onClick={() => onChange({ isIncludedInRequest: !item.isIncludedInRequest })}
          style={{
            width: 22, height: 22, borderRadius: 5,
            border: `2px solid ${item.isIncludedInRequest ? ACCENT : 'var(--bp-border)'}`,
            background: item.isIncludedInRequest ? ACCENT : 'transparent',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', flexShrink: 0, marginTop: 2,
          }}
        >
          {item.isIncludedInRequest && <span style={{ color: '#fff', fontSize: 13, fontWeight: 700 }}>{'\u2713'}</span>}
        </div>

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
              {CATEGORY_ICONS[item.category] || ''} {CATEGORY_LABELS[item.category] || item.category}
            </span>
            {isSellerMode && item.sellerAction && (
              <SellerActionBadge action={item.sellerAction} />
            )}
          </div>
          <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 14, fontWeight: 600, color: 'var(--bp-text)' }}>
            {item.title}
          </div>
          {isSellerMode && item.sellerActionReason && (
            <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, color: 'var(--bp-subtle)', fontStyle: 'italic', marginTop: 2 }}>
              {item.sellerActionReason}
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 2 }}>
            {item.location && (
              <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, color: 'var(--bp-subtle)' }}>
                {item.location}
              </span>
            )}
            <PageCitation sourcePages={item.sourcePages} reportFileUrl={reportFileUrl} />
          </div>
        </div>

        {/* Ask / Estimated cost + source selector */}
        <div style={{ flex: '0 0 180px', textAlign: 'right', position: 'relative' }}>
          <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 10, color: 'var(--bp-subtle)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            {isSellerMode ? 'Estimated cost' : 'Ask amount'}
          </div>
          <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 18, fontWeight: 700, color: RED, lineHeight: 1.1 }}>
            {formatCurrency(askCents / 100)}
          </div>
          {/* Clickable source label */}
          <button
            onClick={(e) => { e.stopPropagation(); setShowSourceMenu(!showSourceMenu); }}
            style={{
              fontFamily: "'DM Sans',sans-serif", fontSize: 11, fontWeight: 500, color: 'var(--bp-subtle)',
              background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0',
              display: 'inline-flex', alignItems: 'center', gap: 3, textAlign: 'right',
              maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}
            title="Change source"
          >
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{currentSourceLabel}</span>
            <span style={{ fontSize: 9, opacity: 0.6 }}>{showSourceMenu ? '\u25B2' : '\u25BC'}</span>
          </button>

          {/* Source menu */}
          {showSourceMenu && (
            <div
              onMouseLeave={() => setShowSourceMenu(false)}
              style={{
                position: 'absolute', top: '100%', right: 0, marginTop: 4, zIndex: 50,
                background: 'var(--bp-card)', borderRadius: 10, border: '1px solid var(--bp-border)',
                boxShadow: '0 10px 30px rgba(0,0,0,0.15)', minWidth: 280, padding: 6, textAlign: 'left',
              }}
            >
              <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 10, color: 'var(--bp-subtle)', textTransform: 'uppercase', letterSpacing: '0.04em', padding: '6px 10px 4px' }}>
                Choose Source
              </div>

              {/* Quote options */}
              {sortedQuotes.map((q, idx) => {
                const isSelected = userSelectedProviderId === q.providerId || (!userExplicitlyChoseEstimate && !userSelectedProviderId && bestQuote?.providerId === q.providerId);
                const isBest = idx === 0;
                return (
                  <button
                    key={q.providerId}
                    onClick={() => { onChange({ repairRequestSource: q.providerId }); setShowSourceMenu(false); }}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      width: '100%', padding: '8px 10px', borderRadius: 6,
                      border: 'none',
                      background: isSelected ? `${ACCENT}10` : 'transparent',
                      cursor: 'pointer', textAlign: 'left',
                    }}
                    onMouseOver={e => { if (!isSelected) (e.currentTarget.style.background = 'var(--bp-bg)'); }}
                    onMouseOut={e => { if (!isSelected) (e.currentTarget.style.background = 'transparent'); }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, fontWeight: 600, color: isSelected ? ACCENT : 'var(--bp-text)' }}>
                          {q.providerName}
                        </span>
                        {isBest && <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 8, fontWeight: 700, padding: '1px 5px', borderRadius: 4, background: '#10B98115', color: '#10B981', letterSpacing: '0.04em' }}>BEST</span>}
                      </div>
                      <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 10, color: 'var(--bp-subtle)', marginTop: 1 }}>
                        {q.providerRating && parseFloat(q.providerRating) > 0 ? `${parseFloat(q.providerRating).toFixed(1)}\u2605` : 'No rating'}
                        {q.availability ? ` · ${q.availability}` : ''}
                      </div>
                    </div>
                    <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 14, fontWeight: 700, color: isSelected ? ACCENT : 'var(--bp-text)', marginLeft: 8 }}>
                      {formatCurrency(q.amountCents / 100)}
                    </div>
                  </button>
                );
              })}

              {/* Estimate option */}
              {hasEstimate && (
                <>
                  {sortedQuotes.length > 0 && <div style={{ height: 1, background: 'var(--bp-border)', margin: '4px 6px' }} />}
                  <button
                    onClick={() => { onChange({ repairRequestSource: 'estimate' }); setShowSourceMenu(false); }}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      width: '100%', padding: '8px 10px', borderRadius: 6,
                      border: 'none',
                      background: usingEstimate ? `${ACCENT}10` : 'transparent',
                      cursor: 'pointer', textAlign: 'left',
                    }}
                    onMouseOver={e => { if (!usingEstimate) (e.currentTarget.style.background = 'var(--bp-bg)'); }}
                    onMouseOut={e => { if (!usingEstimate) (e.currentTarget.style.background = 'transparent'); }}
                  >
                    <div>
                      <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, fontWeight: 600, color: usingEstimate ? ACCENT : 'var(--bp-text)', display: 'flex', alignItems: 'center', gap: 5 }}>
                        {'\u2728'} AI Estimate
                      </div>
                      <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 10, color: 'var(--bp-subtle)', marginTop: 1 }}>
                        Range: {formatCurrency((item.costEstimateMin ?? 0) / 100)}-{formatCurrency((item.costEstimateMax ?? 0) / 100)}
                      </div>
                    </div>
                    <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 14, fontWeight: 700, color: usingEstimate ? ACCENT : 'var(--bp-text)', marginLeft: 8 }}>
                      {formatCurrency((item.costEstimateMax ?? 0) / 100)}
                    </div>
                  </button>
                </>
              )}

              {/* Custom amount option */}
              {(sortedQuotes.length > 0 || hasEstimate) && <div style={{ height: 1, background: 'var(--bp-border)', margin: '4px 6px' }} />}
              <CustomAmountOption
                isSelected={userExplicitlyChoseCustom}
                currentAmountCents={item.repairRequestCustomAmountCents ?? null}
                onSave={(cents) => {
                  onChange({ repairRequestSource: 'custom', repairRequestCustomAmountCents: cents });
                  setShowSourceMenu(false);
                }}
              />
            </div>
          )}
        </div>

        {/* Buyer-only: Seller agreed input + Status dropdown */}
        {!isSellerMode && (
          <>
            <div style={{ flex: '0 0 110px' }}>
              <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 10, color: 'var(--bp-subtle)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 2 }}>
                Agreed
              </div>
              <DollarInput
                valueCents={item.sellerAgreedAmountCents ?? null}
                onChange={(cents) => onChange({ sellerAgreedAmountCents: cents })}
              />
            </div>

            <div style={{ flex: '0 0 130px' }}>
              <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 10, color: 'var(--bp-subtle)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 2 }}>
                Status
              </div>
              <select
                value={status}
                onChange={(e) => onChange({ concessionStatus: e.target.value })}
                style={{
                  width: '100%', padding: '6px 8px', borderRadius: 6,
                  border: '1px solid var(--bp-border)',
                  background: `${STATUS_COLORS[status]}10`,
                  color: STATUS_COLORS[status],
                  fontFamily: "'DM Sans',sans-serif", fontSize: 12, fontWeight: 600, cursor: 'pointer',
                }}
              >
                {(Object.keys(STATUS_LABELS) as ConcessionStatus[]).map(s => (
                  <option key={s} value={s} style={{ background: 'var(--bp-card)', color: 'var(--bp-text)' }}>{STATUS_LABELS[s]}</option>
                ))}
              </select>
            </div>
          </>
        )}
      </div>

      {/* Buyer-only: Credit issued (only show if status is credited or escrow_holdback) */}
      {!isSellerMode && (status === 'credited' || status === 'escrow_holdback') && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px dashed var(--bp-border)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, color: 'var(--bp-subtle)' }}>
            Credit Received:
          </span>
          <DollarInput
            valueCents={item.creditIssuedCents ?? null}
            onChange={(cents) => onChange({ creditIssuedCents: cents })}
          />
        </div>
      )}

      {/* Notes toggle/textarea */}
      <div style={{ marginTop: 10 }}>
        {!showNotes ? (
          <button
            onClick={() => setShowNotes(true)}
            style={{
              fontFamily: "'DM Sans',sans-serif", fontSize: 12, fontWeight: 500, color: 'var(--bp-subtle)',
              background: 'none', border: 'none', cursor: 'pointer', padding: 0,
              display: 'inline-flex', alignItems: 'center', gap: 4,
            }}
          >
            {'\uFF0B'} {isSellerMode ? 'Add note' : 'Add note for seller'}
          </button>
        ) : (
          <textarea
            value={item.homeownerNotes ?? ''}
            onChange={(e) => onChange({ homeownerNotes: e.target.value })}
            placeholder={isSellerMode
              ? 'Add a note about this item (will appear in the pre-listing plan PDF)...'
              : 'Add a note about this item (will appear in the repair request PDF)...'}
            rows={2}
            style={{
              width: '100%', padding: '8px 12px', borderRadius: 6,
              border: '1px solid var(--bp-border)', background: 'var(--bp-bg)',
              color: 'var(--bp-text)', fontFamily: "'DM Sans',sans-serif", fontSize: 12,
              outline: 'none', resize: 'vertical', boxSizing: 'border-box',
            }}
          />
        )}
      </div>
    </div>
  );
}

// ── Custom amount option in source dropdown ────────────────────────────────

function CustomAmountOption({ isSelected, currentAmountCents, onSave }: {
  isSelected: boolean;
  currentAmountCents: number | null;
  onSave: (cents: number) => void;
}) {
  const [text, setText] = useState(currentAmountCents != null ? (currentAmountCents / 100).toString() : '');
  const [editing, setEditing] = useState(isSelected);

  function handleSave() {
    const num = parseFloat(text);
    if (!isNaN(num) && num > 0) {
      onSave(Math.round(num * 100));
    }
  }

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          width: '100%', padding: '8px 10px', borderRadius: 6,
          border: 'none',
          background: isSelected ? `${ACCENT}10` : 'transparent',
          cursor: 'pointer', textAlign: 'left',
        }}
        onMouseOver={e => { if (!isSelected) (e.currentTarget.style.background = 'var(--bp-bg)'); }}
        onMouseOut={e => { if (!isSelected) (e.currentTarget.style.background = 'transparent'); }}
      >
        <div>
          <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, fontWeight: 600, color: isSelected ? ACCENT : 'var(--bp-text)', display: 'flex', alignItems: 'center', gap: 5 }}>
            {'\u270F\uFE0F'} Custom amount
          </div>
          <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 10, color: 'var(--bp-subtle)', marginTop: 1 }}>
            {isSelected && currentAmountCents ? `Currently $${(currentAmountCents / 100).toLocaleString()}` : 'Enter your own ask amount'}
          </div>
        </div>
        {isSelected && currentAmountCents != null && (
          <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 14, fontWeight: 700, color: ACCENT, marginLeft: 8 }}>
            ${(currentAmountCents / 100).toLocaleString()}
          </div>
        )}
      </button>
    );
  }

  return (
    <div style={{ padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, fontWeight: 600, color: 'var(--bp-text)' }}>$</span>
      <input
        type="text"
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value.replace(/[^0-9.]/g, ''))}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); handleSave(); }
          if (e.key === 'Escape') setEditing(false);
        }}
        placeholder="0.00"
        style={{
          flex: 1, padding: '6px 8px', borderRadius: 6,
          border: `1px solid ${ACCENT}`, background: 'var(--bp-card)',
          color: 'var(--bp-text)', fontFamily: "'DM Sans',sans-serif", fontSize: 13, fontWeight: 600,
          outline: 'none',
        }}
      />
      <button
        onClick={handleSave}
        disabled={!text || parseFloat(text) <= 0}
        style={{
          padding: '6px 12px', borderRadius: 6, border: 'none',
          background: text && parseFloat(text) > 0 ? ACCENT : '#94A3B8',
          color: '#fff', cursor: text && parseFloat(text) > 0 ? 'pointer' : 'not-allowed',
          fontFamily: "'DM Sans',sans-serif", fontSize: 12, fontWeight: 600,
        }}
      >
        Use
      </button>
    </div>
  );
}

// ── Dollar input ────────────────────────────────────────────────────────────

function DollarInput({ valueCents, onChange }: { valueCents: number | null; onChange: (cents: number | null) => void }) {
  const [text, setText] = useState(valueCents != null ? (valueCents / 100).toString() : '');

  // Sync from prop
  useEffect(() => {
    setText(valueCents != null ? (valueCents / 100).toString() : '');
  }, [valueCents]);

  function handleBlur() {
    const num = parseFloat(text);
    if (isNaN(num) || text.trim() === '') {
      onChange(null);
      setText('');
    } else {
      const cents = Math.round(num * 100);
      onChange(cents);
      setText((cents / 100).toString());
    }
  }

  return (
    <div style={{ position: 'relative' }}>
      <span style={{
        position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)',
        fontFamily: "'DM Sans',sans-serif", fontSize: 12, color: 'var(--bp-subtle)', pointerEvents: 'none',
      }}>$</span>
      <input
        type="text"
        value={text}
        onChange={(e) => {
          // Allow numbers and decimal point only
          const cleaned = e.target.value.replace(/[^0-9.]/g, '');
          setText(cleaned);
        }}
        onBlur={handleBlur}
        placeholder="0"
        style={{
          width: '100%', padding: '6px 8px 6px 18px', borderRadius: 6,
          border: '1px solid var(--bp-border)', background: 'var(--bp-card)',
          color: 'var(--bp-text)', fontFamily: "'DM Sans',sans-serif", fontSize: 13, fontWeight: 600,
          outline: 'none', boxSizing: 'border-box',
        }}
      />
    </div>
  );
}
