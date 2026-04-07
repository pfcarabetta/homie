import { useEffect, useState } from 'react';
import { adminService } from '@/services/admin-api';

interface Booking {
  id: string;
  jobId: string;
  providerId: string;
  providerName: string | null;
  providerPhone: string | null;
  providerEmail: string | null;
  providerRating: string | null;
  providerReviewCount: number;
  googlePlaceId: string | null;
  homeownerEmail: string | null;
  homeownerPhone: string | null;
  homeownerName: string | null;
  serviceAddress: string | null;
  status: string;
  confirmedAt: string;
  quotedPrice: string | null;
  availability: string | null;
  message: string | null;
  channel: string | null;
  jobCategory: string | null;
  jobSummary: string | null;
  jobZipCode: string | null;
  workspaceId: string | null;
}

function cleanPrice(price: string): string {
  let p = price.replace(/^\$+/, '$');
  const bm = p.match(/between\s+\$?(\d+(?:\.\d+)?)\s*(?:and|to)\s*\$?(\d+(?:\.\d+)?)/i);
  if (bm) return `$${bm[1]}-$${bm[2]}`;
  const nm = p.match(/^(\d+(?:\.\d+)?)$/);
  if (nm) return `$${nm[1]}`;
  return p;
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    confirmed: 'bg-green-100 text-green-700',
    cancelled: 'bg-red-100 text-red-700',
    completed: 'bg-blue-100 text-blue-700',
  };
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-semibold capitalize ${colors[status] ?? 'bg-dark/5 text-dark/50'}`}>
      {status}
    </span>
  );
}

const PAGE_SIZE = 25;

export default function AdminBookings() {
  const [rows, setRows] = useState<Booking[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  function loadBookings() {
    setLoading(true);
    adminService.getBookings({ limit: PAGE_SIZE, offset, q: search || undefined })
      .then((res) => {
        setRows(res.data ?? []);
        setTotal((res.meta.total as number) ?? 0);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => { loadBookings(); }, [offset, search]);

  async function handleCancel(id: string) {
    if (!confirm('Cancel this booking? This cannot be undone.')) return;
    setCancellingId(id);
    try {
      await adminService.cancelBooking(id);
      setRows(prev => prev.map(b => b.id === id ? { ...b, status: 'cancelled' } : b));
    } catch { alert('Failed to cancel booking'); }
    setCancellingId(null);
  }

  if (error) return <div className="text-red-600">{error}</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-dark">Bookings</h1>
        <span className="text-sm text-dark/50">{total} total</span>
      </div>

      <input value={search} onChange={e => { setSearch(e.target.value); setOffset(0); }} placeholder="Search by provider, homeowner, job ID..."
        className="w-full px-4 py-2.5 mb-4 rounded-lg border border-dark/10 text-sm outline-none focus:border-orange-400 bg-white" />

      {loading ? (
        <div className="text-center py-8 text-dark/40">Loading...</div>
      ) : rows.length === 0 ? (
        <div className="text-center py-8 text-dark/40">{search ? 'No matches' : 'No bookings yet'}</div>
      ) : (
        <div className="space-y-2">
          {rows.map(b => {
            const isExpanded = expandedId === b.id;
            const catLabel = b.jobCategory ? b.jobCategory.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : 'Service';

            return (
              <div key={b.id} className={`bg-white rounded-lg border overflow-hidden transition-all cursor-pointer ${isExpanded ? 'border-orange-400 shadow-md' : 'border-dark/5'}`}
                onClick={() => setExpandedId(isExpanded ? null : b.id)}>

                {/* Collapsed row */}
                <div className="flex items-center gap-3 px-4 py-3 text-sm">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-semibold text-dark truncate">{b.providerName ?? 'Unknown Provider'}</span>
                      <StatusBadge status={b.status} />
                    </div>
                    <div className="flex gap-3 text-xs text-dark/40 flex-wrap">
                      <span>{catLabel}</span>
                      <span>{b.homeownerName ?? b.homeownerEmail ?? '-'}</span>
                      <span>{new Date(b.confirmedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                      {b.workspaceId && <span className="bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded text-[10px] font-semibold">B2B</span>}
                    </div>
                  </div>
                  {b.quotedPrice && (
                    <span className="text-lg font-bold text-orange-500 shrink-0">{cleanPrice(b.quotedPrice)}</span>
                  )}
                  <span className="text-xs text-dark/30 shrink-0">{isExpanded ? '▲' : '▼'}</span>
                </div>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="border-t border-dark/5 px-4 py-4 bg-dark/[0.01]" onClick={e => e.stopPropagation()}>

                    {/* Job summary */}
                    {b.jobSummary && (
                      <div className="text-sm text-dark/60 leading-relaxed mb-4 bg-warm rounded-lg p-3 border border-dark/5 break-words">
                        {b.jobSummary}
                      </div>
                    )}

                    {/* Details grid */}
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-4">
                      <div className="bg-warm rounded-lg p-2.5">
                        <div className="text-[10px] text-dark/40 font-semibold uppercase tracking-wider">Category</div>
                        <div className="text-xs font-semibold text-dark">{catLabel}</div>
                      </div>
                      {b.quotedPrice && (
                        <div className="bg-warm rounded-lg p-2.5">
                          <div className="text-[10px] text-dark/40 font-semibold uppercase tracking-wider">Quoted Price</div>
                          <div className="text-xs font-bold text-orange-500">{cleanPrice(b.quotedPrice)}</div>
                        </div>
                      )}
                      {b.availability && (
                        <div className="bg-warm rounded-lg p-2.5">
                          <div className="text-[10px] text-dark/40 font-semibold uppercase tracking-wider">Availability</div>
                          <div className="text-xs font-semibold text-dark">{b.availability}</div>
                        </div>
                      )}
                      {b.channel && (
                        <div className="bg-warm rounded-lg p-2.5">
                          <div className="text-[10px] text-dark/40 font-semibold uppercase tracking-wider">Channel</div>
                          <div className="text-xs font-semibold text-dark capitalize">{b.channel}</div>
                        </div>
                      )}
                      {b.jobZipCode && (
                        <div className="bg-warm rounded-lg p-2.5">
                          <div className="text-[10px] text-dark/40 font-semibold uppercase tracking-wider">Zip Code</div>
                          <div className="text-xs font-semibold text-dark">{b.jobZipCode}</div>
                        </div>
                      )}
                      <div className="bg-warm rounded-lg p-2.5">
                        <div className="text-[10px] text-dark/40 font-semibold uppercase tracking-wider">Confirmed</div>
                        <div className="text-xs font-semibold text-dark">{new Date(b.confirmedAt).toLocaleString()}</div>
                      </div>
                    </div>

                    {/* Provider info */}
                    <div className="mb-4">
                      <div className="text-[10px] text-dark/40 font-semibold uppercase tracking-wider mb-2">Provider</div>
                      <div className="bg-white rounded-lg border border-dark/5 p-3">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-semibold text-sm text-dark">{b.providerName}</span>
                          {b.providerRating && (
                            <span className="text-xs text-dark/50">★ {b.providerRating} ({b.providerReviewCount})</span>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-3 text-xs">
                          {b.providerPhone && <a href={`tel:${b.providerPhone}`} className="text-green-600 font-semibold no-underline">📞 {b.providerPhone}</a>}
                          {b.providerEmail && <a href={`mailto:${b.providerEmail}`} className="text-blue-600 no-underline">✉ {b.providerEmail}</a>}
                          {b.googlePlaceId && (
                            <a href={`https://www.google.com/maps/place/?q=place_id:${b.googlePlaceId}`} target="_blank" rel="noopener" className="text-blue-600 font-semibold no-underline">Reviews</a>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Homeowner info */}
                    <div className="mb-4">
                      <div className="text-[10px] text-dark/40 font-semibold uppercase tracking-wider mb-2">Homeowner</div>
                      <div className="bg-white rounded-lg border border-dark/5 p-3">
                        <div className="font-semibold text-sm text-dark mb-1">{b.homeownerName ?? '-'}</div>
                        <div className="flex flex-wrap gap-3 text-xs">
                          {b.homeownerEmail && <span className="text-dark/50">{b.homeownerEmail}</span>}
                          {b.homeownerPhone && <span className="text-dark/50">{b.homeownerPhone}</span>}
                        </div>
                        {b.serviceAddress && (
                          <div className="text-xs text-dark/50 mt-1">📍 {b.serviceAddress}</div>
                        )}
                      </div>
                    </div>

                    {/* Provider note */}
                    {b.message && (
                      <div className="text-xs text-dark/50 italic border-l-2 border-orange-300 pl-3 mb-4 break-words">
                        "{b.message}"
                      </div>
                    )}

                    {/* IDs */}
                    <div className="flex gap-4 text-[10px] text-dark/30 mb-4 font-mono">
                      <span>Booking: {b.id.slice(0, 8)}</span>
                      <span>Job: {b.jobId.slice(0, 8)}</span>
                    </div>

                    {/* Cancel button */}
                    {b.status !== 'cancelled' && (
                      <button
                        onClick={() => handleCancel(b.id)}
                        disabled={cancellingId === b.id}
                        className="w-full py-2.5 rounded-lg border border-red-200 bg-red-50 text-red-600 text-sm font-semibold cursor-pointer hover:bg-red-100 transition-colors disabled:opacity-50"
                      >
                        {cancellingId === b.id ? 'Cancelling...' : 'Cancel Booking'}
                      </button>
                    )}
                    {b.status === 'cancelled' && (
                      <div className="text-center text-sm text-red-400 font-semibold py-2">Booking Cancelled</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-center gap-4 mt-4">
          <button onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))} disabled={offset === 0} className="text-sm font-semibold text-dark/50 hover:text-dark disabled:text-dark/20">Previous</button>
          <span className="text-sm text-dark/40">{offset + 1}-{Math.min(offset + PAGE_SIZE, total)} of {total}</span>
          <button onClick={() => setOffset(offset + PAGE_SIZE)} disabled={offset + PAGE_SIZE >= total} className="text-sm font-semibold text-dark/50 hover:text-dark disabled:text-dark/20">Next</button>
        </div>
      )}
    </div>
  );
}
