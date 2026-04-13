import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { inspectService, type InspectReportPublic, type InspectionItem } from '@/services/inspector-api';

const O = '#E8632B';
const G = '#1B9E77';
const D = '#2D2926';
const W = '#F9F5F2';

const SEVERITY_COLORS: Record<string, string> = {
  safety_hazard: '#E24B4A',
  urgent: '#E24B4A',
  recommended: '#EF9F27',
  monitor: '#9B9490',
  informational: '#D3CEC9',
};

const SEVERITY_LABELS: Record<string, string> = {
  safety_hazard: 'Safety Hazard',
  urgent: 'Urgent',
  recommended: 'Recommended',
  monitor: 'Monitor',
  informational: 'Informational',
};

const CATEGORY_LABELS: Record<string, string> = {
  plumbing: 'Plumbing',
  electrical: 'Electrical',
  hvac: 'HVAC',
  roofing: 'Roofing',
  structural: 'Structural',
  general_repair: 'General',
  pest_control: 'Pest Control',
  safety: 'Safety',
  cosmetic: 'Cosmetic',
  landscaping: 'Landscaping',
  appliance: 'Appliance',
  insulation: 'Insulation',
  foundation: 'Foundation',
  windows_doors: 'Windows & Doors',
  fireplace: 'Fireplace',
};

const CATEGORY_ICONS: Record<string, string> = {
  plumbing: '💧', electrical: '⚡', hvac: '❄️', roofing: '🏠', structural: '🏗️',
  general_repair: '🔧', pest_control: '🐛', safety: '⚠️', cosmetic: '🎨',
  landscaping: '🌿', appliance: '📦', insulation: '🧱', foundation: '🏛️',
  windows_doors: '🪟', fireplace: '🔥',
};

function formatCurrency(amount: number): string {
  if (isNaN(amount) || amount === null || amount === undefined) return '$0';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

export default function InspectReport() {
  const { token } = useParams<{ token: string }>();
  const [report, setReport] = useState<InspectReportPublic | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [checkingOut, setCheckingOut] = useState(false);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    inspectService.getReport(token).then(res => {
      if (res.data) {
        setReport(res.data);
        // Pre-select all undispatched items
        const undispatched = res.data.items.filter(i => !i.dispatchStatus || i.dispatchStatus === 'pending').map(i => i.id);
        setSelectedItems(new Set(undispatched));
      }
    }).catch(err => {
      setError((err as Error).message ?? 'Failed to load report');
    }).finally(() => setLoading(false));
  }, [token]);

  // After returning from Stripe checkout, trigger dispatch
  useEffect(() => {
    if (!token) return;
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get('session_id');
    const paymentSuccess = params.get('payment');
    if (paymentSuccess === 'success' && sessionId) {
      inspectService.dispatch(token, undefined, sessionId).then(() => {
        inspectService.getReport(token).then(res => {
          if (res.data) setReport(res.data);
        }).catch(() => {});
        window.history.replaceState({}, '', window.location.pathname);
      }).catch(() => {});
    }
  }, [token]);

  // Poll for quote updates every 10 seconds when items are dispatched
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (!token || !report) return;
    const hasDispatched = report.items.some(i => i.dispatchStatus === 'dispatched' || i.dispatchStatus === 'quotes_received');
    if (!hasDispatched) return;

    pollRef.current = setInterval(async () => {
      try {
        const res = await inspectService.getStatus(token);
        if (res.data) {
          setReport(prev => {
            if (!prev) return prev;
            const updatedItems = prev.items.map(item => {
              const statusItem = res.data!.items.find(s => s.id === item.id);
              if (statusItem && statusItem.dispatchStatus === 'quotes_received' && statusItem.quoteAmountCents) {
                return {
                  ...item,
                  dispatchStatus: 'quoted' as const,
                  quoteDetails: {
                    providerName: statusItem.providerName ?? 'Provider',
                    providerRating: parseFloat(statusItem.providerRating ?? '0'),
                    price: (statusItem.quoteAmountCents ?? 0) / 100,
                    availability: statusItem.providerAvailability ?? '',
                  },
                };
              }
              return item;
            });
            return { ...prev, items: updatedItems };
          });

          const allQuoted = res.data.items.every(i => i.dispatchStatus !== 'dispatched');
          if (allQuoted && pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
          }
        }
      } catch { /* ignore */ }
    }, 10000);

    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [token, report?.items.length]);

  async function handleCheckout() {
    if (!token || !report || selectedItems.size === 0) return;
    setCheckingOut(true);
    try {
      const ids = Array.from(selectedItems);
      const mode = ids.length >= report.items.length ? 'bundle' : (ids.length === 1 ? 'per_item' : 'bundle');
      const res = await inspectService.checkout(token, mode, ids);
      if (res.data?.checkoutUrl) {
        window.location.href = res.data.checkoutUrl;
        return;
      }
    } catch (err) {
      alert((err as Error).message || 'Checkout failed');
    } finally {
      setCheckingOut(false);
    }
  }

  function toggleItem(id: string) {
    setSelectedItems(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (!report) return;
    const undispatched = report.items.filter(i => !i.dispatchStatus || i.dispatchStatus === 'pending');
    if (selectedItems.size === undispatched.length) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(undispatched.map(i => i.id)));
    }
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: W, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'DM Sans', sans-serif" }}>
        <link href="https://fonts.googleapis.com/css2?family=Fraunces:wght@400;700&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />
        <div style={{ color: '#9B9490', fontSize: 14 }}>Loading report...</div>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div style={{ minHeight: '100vh', background: W, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'DM Sans', sans-serif" }}>
        <link href="https://fonts.googleapis.com/css2?family=Fraunces:wght@400;700&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: D, marginBottom: 8 }}>Report not found</div>
          <div style={{ fontSize: 14, color: '#9B9490' }}>{error ?? 'This link may have expired or is invalid.'}</div>
        </div>
      </div>
    );
  }

  // Derive categories from items
  const categories = [...new Set(report.items.map(i => i.category))].sort();
  const filteredItems = activeCategory
    ? report.items.filter(i => i.category === activeCategory)
    : report.items;

  // Group by category
  const grouped = filteredItems.reduce<Record<string, InspectionItem[]>>((acc, item) => {
    const cat = item.category;
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {});
  const groupEntries = Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b));

  const perItemPrice = report.perItemPrice ?? 9.99;
  const bundlePrice = report.bundlePrice ?? 149;
  const undispatchedItems = report.items.filter(i => !i.dispatchStatus || i.dispatchStatus === 'pending');
  const allSelected = selectedItems.size === undispatchedItems.length && undispatchedItems.length > 0;

  // Pricing for selected items
  const selectedCount = selectedItems.size;
  const allItemsCount = report.items.length;
  const useBundle = selectedCount >= allItemsCount;
  const selectedPrice = useBundle ? bundlePrice : selectedCount * perItemPrice;

  // Severity summary
  const severityCounts = report.items.reduce((acc, item) => {
    const key = item.severity === 'urgent' ? 'safety_hazard' : item.severity;
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div style={{ minHeight: '100vh', background: W, fontFamily: "'DM Sans', sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=Fraunces:wght@400;700&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />

      <div style={{ maxWidth: 640, margin: '0 auto', padding: '24px 16px 140px' }}>
        {/* Branding */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 6, marginBottom: 4 }}>
            <span style={{ fontFamily: 'Fraunces, serif', fontWeight: 700, fontSize: 28, color: O }}>homie</span>
            <span style={{ fontSize: 13, color: '#9B9490', fontWeight: 500 }}>inspect</span>
          </div>
          {(report.inspectorCompanyName || report.inspectorLogoUrl) && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 8 }}>
              {report.inspectorLogoUrl && (
                <img src={report.inspectorLogoUrl} alt="" style={{ height: 28, objectFit: 'contain' }} />
              )}
              <span style={{ fontSize: 13, color: '#6B6560', fontWeight: 500 }}>{report.inspectorCompanyName}</span>
            </div>
          )}
        </div>

        {/* Property info */}
        <div style={{ background: '#ffffff', borderRadius: 14, border: '1px solid #E0DAD4', padding: 20, marginBottom: 16 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: D, marginBottom: 4, fontFamily: 'Fraunces, serif' }}>
            {report.propertyAddress}
          </div>
          <div style={{ fontSize: 13, color: '#6B6560', marginBottom: 4 }}>
            {report.propertyCity}, {report.propertyState} {report.propertyZip}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: 12, color: '#9B9490' }}>
              Inspected {formatDate(report.inspectionDate)} | {report.inspectionType}
            </div>
            <a
              href={`${import.meta.env.VITE_API_URL ?? 'http://localhost:3001'}/api/v1/inspect/${token}/pdf`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                fontSize: 12, fontWeight: 600, color: O, textDecoration: 'none',
                padding: '4px 10px', borderRadius: 6, border: `1px solid ${O}`,
                cursor: 'pointer', transition: 'all 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = O; e.currentTarget.style.color = '#fff'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = O; }}
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M8 2v8m0 0l-3-3m3 3l3-3M3 13h10" /></svg>
              PDF
            </a>
          </div>
        </div>

        {/* Severity summary */}
        <div style={{
          background: '#ffffff', borderRadius: 14, border: '1px solid #E0DAD4', padding: 16, marginBottom: 16,
          display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap',
        }}>
          {Object.entries(severityCounts).map(([sev, count]) => (
            <div key={sev} style={{ textAlign: 'center', minWidth: 70 }}>
              <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'Fraunces, serif', color: SEVERITY_COLORS[sev] ?? '#9B9490' }}>
                {count}
              </div>
              <div style={{ fontSize: 11, color: '#9B9490', textTransform: 'capitalize' }}>
                {SEVERITY_LABELS[sev] ?? sev}
              </div>
            </div>
          ))}
          <div style={{ textAlign: 'center', minWidth: 70 }}>
            <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'Fraunces, serif', color: D }}>{report.items.length}</div>
            <div style={{ fontSize: 11, color: '#9B9490' }}>Total</div>
          </div>
        </div>

        {/* Category filters */}
        <div style={{
          display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16, padding: '0 2px',
        }}>
          <button
            onClick={() => setActiveCategory(null)}
            style={{
              fontSize: 12, fontWeight: 600, padding: '6px 14px', borderRadius: 100, cursor: 'pointer',
              border: `1px solid ${!activeCategory ? O : '#E0DAD4'}`,
              background: !activeCategory ? O : '#fff',
              color: !activeCategory ? '#fff' : '#6B6560',
              fontFamily: "'DM Sans', sans-serif", transition: 'all 0.15s',
            }}
          >
            All ({report.items.length})
          </button>
          {categories.map(cat => {
            const count = report.items.filter(i => i.category === cat).length;
            const isActive = activeCategory === cat;
            return (
              <button
                key={cat}
                onClick={() => setActiveCategory(isActive ? null : cat)}
                style={{
                  fontSize: 12, fontWeight: 600, padding: '6px 14px', borderRadius: 100, cursor: 'pointer',
                  border: `1px solid ${isActive ? O : '#E0DAD4'}`,
                  background: isActive ? O : '#fff',
                  color: isActive ? '#fff' : '#6B6560',
                  fontFamily: "'DM Sans', sans-serif", transition: 'all 0.15s',
                  display: 'flex', alignItems: 'center', gap: 4,
                }}
              >
                <span>{CATEGORY_ICONS[cat] ?? '🔧'}</span>
                {CATEGORY_LABELS[cat] ?? cat} ({count})
              </button>
            );
          })}
        </div>

        {/* Select all / deselect */}
        {undispatchedItems.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, padding: '0 4px' }}>
            <button
              onClick={toggleAll}
              style={{
                fontSize: 13, fontWeight: 600, color: O, background: 'none', border: 'none',
                cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", padding: 0,
              }}
            >
              {allSelected ? 'Deselect all' : 'Select all'}
            </button>
            <span style={{ fontSize: 12, color: '#9B9490' }}>
              {selectedCount} of {undispatchedItems.length} selected
            </span>
          </div>
        )}

        {/* Items grouped by category */}
        {groupEntries.map(([cat, items]) => (
          <div key={cat} style={{ marginBottom: 24 }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, padding: '0 2px',
            }}>
              <span style={{ fontSize: 16 }}>{CATEGORY_ICONS[cat] ?? '🔧'}</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: D }}>{CATEGORY_LABELS[cat] ?? cat}</span>
              <span style={{ fontSize: 12, color: '#9B9490' }}>({items.length})</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {items.map(item => {
                const sevColor = SEVERITY_COLORS[item.severity] ?? '#9B9490';
                const isDispatched = item.dispatchStatus === 'dispatched' || item.dispatchStatus === 'quoted' || item.dispatchStatus === 'booked' || item.dispatchStatus === 'quotes_received';
                const isSelected = selectedItems.has(item.id);
                const canSelect = !isDispatched;

                return (
                  <div key={item.id} style={{
                    background: '#ffffff', borderRadius: 14,
                    border: `1px solid ${isSelected && canSelect ? O : '#E0DAD4'}`,
                    padding: 20, opacity: isDispatched ? 0.85 : 1,
                    transition: 'border-color 0.15s',
                  }}>
                    <div style={{ display: 'flex', gap: 12 }}>
                      {/* Checkbox */}
                      {canSelect && (
                        <div
                          onClick={() => toggleItem(item.id)}
                          style={{
                            width: 22, height: 22, minWidth: 22, borderRadius: 6, marginTop: 2,
                            border: `2px solid ${isSelected ? O : '#D3CEC9'}`,
                            background: isSelected ? O : '#fff',
                            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            transition: 'all 0.15s',
                          }}
                        >
                          {isSelected && (
                            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M3 8.5l3.5 3.5 6.5-8" />
                            </svg>
                          )}
                        </div>
                      )}

                      <div style={{ flex: 1 }}>
                        {/* Severity badge */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                          <span style={{
                            fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 100,
                            background: `${sevColor}18`, color: sevColor,
                          }}>
                            {SEVERITY_LABELS[item.severity] ?? item.severity}
                          </span>
                          {item.location && (
                            <span style={{ fontSize: 11, color: '#9B9490' }}>{item.location}</span>
                          )}
                        </div>

                        <div style={{ fontSize: 15, fontWeight: 600, color: D, marginBottom: 6 }}>
                          {item.title}
                        </div>

                        {item.description && (
                          <div style={{ fontSize: 13, color: '#6B6560', lineHeight: 1.6, marginBottom: 10 }}>
                            {item.description}
                          </div>
                        )}

                        {/* Cost estimate */}
                        {(item.costEstimateMin != null && item.costEstimateMin > 0) && (
                          <div style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                            fontSize: 13, color: D, fontWeight: 500,
                            background: W, padding: '4px 10px', borderRadius: 6, marginBottom: 10,
                          }}>
                            Est. {formatCurrency(item.costEstimateMin)}
                            {item.costEstimateMax != null && item.costEstimateMax > 0 && ` – ${formatCurrency(item.costEstimateMax)}`}
                          </div>
                        )}

                        {/* Quote display */}
                        {isDispatched && item.quoteDetails && (
                          <div style={{
                            background: `${G}08`, borderRadius: 10, padding: 14, marginTop: 4,
                            border: `1px solid ${G}30`,
                          }}>
                            <div style={{ fontSize: 12, fontWeight: 600, color: G, marginBottom: 8 }}>Quote received</div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                              <div>
                                <div style={{ fontSize: 14, fontWeight: 600, color: D }}>{item.quoteDetails.providerName}</div>
                                {item.quoteDetails.providerRating > 0 && (
                                  <div style={{ fontSize: 12, color: '#9B9490' }}>
                                    {'★'.repeat(Math.round(item.quoteDetails.providerRating))} ({item.quoteDetails.providerRating.toFixed(1)})
                                    {item.quoteDetails.availability ? ` · ${item.quoteDetails.availability}` : ''}
                                  </div>
                                )}
                              </div>
                              <div style={{ fontFamily: 'Fraunces, serif', fontSize: 22, fontWeight: 700, color: G }}>
                                {formatCurrency(item.quoteDetails.price)}
                              </div>
                            </div>
                          </div>
                        )}

                        {isDispatched && !item.quoteDetails && (
                          <div style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            padding: '8px 0', fontSize: 13, fontWeight: 600, color: G,
                          }}>
                            <div style={{
                              width: 14, height: 14, border: `2px solid ${G}`, borderTopColor: 'transparent',
                              borderRadius: '50%', animation: 'inspect-spin 0.8s linear infinite',
                            }} />
                            Finding quotes...
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        <style>{`@keyframes inspect-spin { to { transform: rotate(360deg); } }`}</style>
      </div>

      {/* Sticky bottom bar */}
      {undispatchedItems.length > 0 && (
        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 100,
          background: '#ffffff', borderTop: '1px solid #E0DAD4',
          padding: '12px 16px', boxShadow: '0 -4px 20px rgba(0,0,0,0.06)',
        }}>
          <div style={{ maxWidth: 640, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: D }}>
                {selectedCount} item{selectedCount !== 1 ? 's' : ''} selected
              </div>
              <div style={{ fontSize: 12, color: '#9B9490' }}>
                {useBundle ? (
                  <>Bundle: <span style={{ color: G, fontWeight: 600 }}>{formatCurrency(bundlePrice)}</span> <span style={{ textDecoration: 'line-through' }}>{formatCurrency(selectedCount * perItemPrice)}</span></>
                ) : selectedCount > 0 ? (
                  <>{formatCurrency(perItemPrice)}/item · <span style={{ fontWeight: 600 }}>{formatCurrency(selectedPrice)}</span></>
                ) : null}
              </div>
            </div>
            <button
              onClick={handleCheckout}
              disabled={checkingOut || selectedCount === 0}
              style={{
                padding: '12px 28px', background: selectedCount > 0 ? O : '#D3CEC9',
                color: '#fff', border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 600,
                cursor: selectedCount > 0 && !checkingOut ? 'pointer' : 'not-allowed',
                fontFamily: "'DM Sans', sans-serif", opacity: checkingOut ? 0.7 : 1,
                whiteSpace: 'nowrap', transition: 'all 0.15s',
              }}
            >
              {checkingOut ? 'Processing...' : `Get quotes${selectedCount > 0 ? ` – ${formatCurrency(selectedPrice)}` : ''}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
