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

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

export default function InspectReport() {
  const { token } = useParams<{ token: string }>();
  const [report, setReport] = useState<InspectReportPublic | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dispatchedItems, setDispatchedItems] = useState<Set<string>>(new Set());
  const [dispatchingItem, setDispatchingItem] = useState<string | null>(null);
  const [dispatchingAll, setDispatchingAll] = useState(false);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    inspectService.getReport(token).then(res => {
      if (res.data) setReport(res.data);
    }).catch(err => {
      setError((err as Error).message ?? 'Failed to load report');
    }).finally(() => setLoading(false));
  }, [token]);

  async function handleDispatchItem(itemId: string) {
    if (!token) return;
    setDispatchingItem(itemId);
    try {
      // Create Stripe checkout for single item
      const res = await inspectService.checkout(token, 'per_item', [itemId]);
      if (res.data?.checkoutUrl) {
        window.location.href = res.data.checkoutUrl;
        return;
      }
    } catch (err) {
      alert((err as Error).message || 'Checkout failed');
    } finally {
      setDispatchingItem(null);
    }
  }

  async function handleDispatchAll() {
    if (!token || !report) return;
    setDispatchingAll(true);
    try {
      // Create Stripe checkout for bundle
      const res = await inspectService.checkout(token, 'bundle');
      if (res.data?.checkoutUrl) {
        window.location.href = res.data.checkoutUrl;
        return;
      }
    } catch (err) {
      alert((err as Error).message || 'Checkout failed');
    } finally {
      setDispatchingAll(false);
    }
  }

  // After returning from Stripe checkout, trigger dispatch
  useEffect(() => {
    if (!token) return;
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get('session_id');
    const paymentSuccess = params.get('payment');
    if (paymentSuccess === 'success' && sessionId) {
      // Dispatch items after successful payment
      inspectService.dispatch(token, undefined, sessionId).then(() => {
        // Refresh report to show dispatched items
        inspectService.getReport(token).then(res => {
          if (res.data) setReport(res.data);
        }).catch(() => {});
        // Clean URL
        window.history.replaceState({}, '', window.location.pathname);
      }).catch(() => {});
    }
  }, [token]);

  // Poll for quote updates every 10 seconds when items are dispatched
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (!token || !report) return;
    const hasDispatched = report.items.some(i => i.dispatchStatus === 'dispatched' || dispatchedItems.size > 0);
    if (!hasDispatched) return;

    pollRef.current = setInterval(async () => {
      try {
        const res = await inspectService.getStatus(token);
        if (res.data) {
          // Update items with new quote data
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

          // Stop polling if all dispatched items have quotes
          const allQuoted = res.data.items.every(i => i.dispatchStatus !== 'dispatched');
          if (allQuoted && pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
          }
        }
      } catch { /* ignore polling errors */ }
    }, 10000);

    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [token, report?.items.length, dispatchedItems.size]);

  const activeItems = report?.items.filter(i => !dispatchedItems.has(i.id)) ?? [];
  const runningTotal = activeItems.length * (report?.perItemPrice ?? 9.99);
  const bundlePrice = report?.bundlePrice ?? 149;

  // Severity summary
  const severityCounts = report?.items.reduce((acc, item) => {
    const key = item.severity === 'urgent' ? 'safety_hazard' : item.severity;
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>) ?? {};

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh', background: W, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: "'DM Sans', sans-serif",
      }}>
        <link href="https://fonts.googleapis.com/css2?family=Fraunces:wght@400;700&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />
        <div style={{ color: '#9B9490', fontSize: 14 }}>Loading report...</div>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div style={{
        minHeight: '100vh', background: W, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: "'DM Sans', sans-serif",
      }}>
        <link href="https://fonts.googleapis.com/css2?family=Fraunces:wght@400;700&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: D, marginBottom: 8 }}>Report not found</div>
          <div style={{ fontSize: 14, color: '#9B9490' }}>{error ?? 'This link may have expired or is invalid.'}</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh', background: W, fontFamily: "'DM Sans', sans-serif",
    }}>
      <link href="https://fonts.googleapis.com/css2?family=Fraunces:wght@400;700&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />

      <div style={{ maxWidth: 640, margin: '0 auto', padding: '24px 16px 80px' }}>
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
        <div style={{
          background: '#ffffff', borderRadius: 14, border: '1px solid #E0DAD4', padding: 20, marginBottom: 16,
        }}>
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
              <div style={{
                fontSize: 22, fontWeight: 700, fontFamily: 'Fraunces, serif',
                color: SEVERITY_COLORS[sev] ?? '#9B9490',
              }}>
                {count}
              </div>
              <div style={{ fontSize: 11, color: '#9B9490', textTransform: 'capitalize' }}>
                {SEVERITY_LABELS[sev] ?? sev}
              </div>
            </div>
          ))}
          <div style={{ textAlign: 'center', minWidth: 70 }}>
            <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'Fraunces, serif', color: D }}>
              {report.items.length}
            </div>
            <div style={{ fontSize: 11, color: '#9B9490' }}>Total</div>
          </div>
        </div>

        {/* Pricing banner */}
        <div style={{
          background: `linear-gradient(135deg, ${D} 0%, #3D3936 100%)`, borderRadius: 14, padding: 20, marginBottom: 20,
          color: '#fff',
        }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Get instant quotes from vetted contractors</div>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 11, color: '#9B9490', marginBottom: 2 }}>Per item</div>
              <div style={{ fontFamily: 'Fraunces, serif', fontSize: 24, fontWeight: 700 }}>
                {formatCurrency(report.perItemPrice)}
              </div>
            </div>
            <div style={{ color: '#9B9490' }}>or</div>
            <div>
              <div style={{ fontSize: 11, color: '#9B9490', marginBottom: 2 }}>Bundle all {report.items.length} items</div>
              <div style={{ fontFamily: 'Fraunces, serif', fontSize: 24, fontWeight: 700, color: G }}>
                {formatCurrency(bundlePrice)}
              </div>
            </div>
          </div>
          <button
            onClick={handleDispatchAll}
            disabled={dispatchingAll || dispatchedItems.size === report.items.length}
            style={{
              width: '100%', padding: '12px 0', marginTop: 16, background: O, color: '#fff',
              border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 600, cursor: dispatchingAll ? 'not-allowed' : 'pointer',
              fontFamily: "'DM Sans', sans-serif", opacity: dispatchingAll ? 0.7 : 1,
            }}
          >
            {dispatchingAll ? 'Dispatching...' : dispatchedItems.size === report.items.length ? 'All items dispatched' : `Dispatch all - ${formatCurrency(bundlePrice)}`}
          </button>
        </div>

        {/* Items list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {report.items.map(item => {
            const sevColor = SEVERITY_COLORS[item.severity] ?? '#9B9490';
            const isDispatched = dispatchedItems.has(item.id) || item.dispatchStatus === 'dispatched' || item.dispatchStatus === 'quoted' || item.dispatchStatus === 'booked';
            const isDispatching = dispatchingItem === item.id;

            return (
              <div key={item.id} style={{
                background: '#ffffff', borderRadius: 14, border: '1px solid #E0DAD4', padding: 20,
                opacity: isDispatched ? 0.85 : 1,
              }}>
                {/* Severity badge + title */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{
                    fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 100,
                    background: `${sevColor}18`, color: sevColor,
                  }}>
                    {SEVERITY_LABELS[item.severity] ?? item.severity}
                  </span>
                  <span style={{
                    fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 100,
                    background: '#F5F0EB', color: '#6B6560',
                  }}>
                    {item.category}
                  </span>
                </div>

                <div style={{ fontSize: 16, fontWeight: 600, color: D, marginBottom: 6 }}>
                  {item.title}
                </div>

                <div style={{ fontSize: 13, color: '#6B6560', lineHeight: 1.6, marginBottom: 10 }}>
                  {item.description}
                </div>

                {(item.costEstimateMin !== null || item.costEstimateMax !== null) && (
                  <div style={{ fontSize: 13, color: D, fontWeight: 500, marginBottom: 10 }}>
                    Estimated cost: {item.costEstimateMin !== null ? formatCurrency(item.costEstimateMin) : '?'}
                    {' - '}
                    {item.costEstimateMax !== null ? formatCurrency(item.costEstimateMax) : '?'}
                  </div>
                )}

                {/* Quote display */}
                {isDispatched && item.quoteDetails && (
                  <div style={{
                    background: W, borderRadius: 10, padding: 14, marginBottom: 10,
                    border: `1px solid ${G}30`,
                  }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: G, marginBottom: 8 }}>Quote received</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: D }}>{item.quoteDetails.providerName}</div>
                        <div style={{ fontSize: 12, color: '#9B9490' }}>
                          {'*'.repeat(Math.round(item.quoteDetails.providerRating))} ({item.quoteDetails.providerRating.toFixed(1)}) | Available: {item.quoteDetails.availability}
                        </div>
                      </div>
                      <div style={{ fontFamily: 'Fraunces, serif', fontSize: 22, fontWeight: 700, color: G }}>
                        {formatCurrency(item.quoteDetails.price)}
                      </div>
                    </div>
                  </div>
                )}

                {/* Action button */}
                {!isDispatched && (
                  <button
                    onClick={() => handleDispatchItem(item.id)}
                    disabled={isDispatching}
                    style={{
                      width: '100%', padding: '10px 0', background: '#ffffff', color: O,
                      border: `1px solid ${O}`, borderRadius: 8, fontSize: 13, fontWeight: 600,
                      cursor: isDispatching ? 'not-allowed' : 'pointer', fontFamily: "'DM Sans', sans-serif",
                      opacity: isDispatching ? 0.7 : 1,
                    }}
                  >
                    {isDispatching ? 'Getting quote...' : `Get quote - ${formatCurrency(report.perItemPrice)}`}
                  </button>
                )}

                {isDispatched && !item.quoteDetails && (
                  <div style={{
                    textAlign: 'center', padding: '8px 0', fontSize: 13, fontWeight: 600, color: G,
                  }}>
                    Quote requested - we'll notify you shortly
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Running total */}
        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0,
          background: '#ffffff', borderTop: '1px solid #E0DAD4',
          padding: '12px 16px',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16,
        }}>
          <div style={{ maxWidth: 640, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 12, color: '#9B9490' }}>
                {dispatchedItems.size} of {report.items.length} items dispatched
              </div>
            </div>
            {dispatchedItems.size > 0 && (
              <div style={{ fontFamily: 'Fraunces, serif', fontSize: 20, fontWeight: 700, color: G }}>
                Total: {formatCurrency(
                  dispatchedItems.size >= report.items.length
                    ? bundlePrice
                    : dispatchedItems.size * report.perItemPrice
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
