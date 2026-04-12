import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminService } from '@/services/admin-api';

interface Provider {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  website: string | null;
  googleRating: string | null;
  reviewCount: number;
  categories: string[] | null;
  discoveredAt: string;
  acceptanceRate: string | null;
  totalOutreach: number | null;
  totalAccepted: number | null;
}

const PAGE_SIZE = 25;

export default function AdminProviders() {
  const [rows, setRows] = useState<Provider[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Awaited<ReturnType<typeof adminService.getProviderDetail>>['data']>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    setLoading(true);
    adminService.getProviders({ limit: PAGE_SIZE, offset, q: search || undefined })
      .then((res) => {
        setRows(res.data ?? []);
        setTotal((res.meta.total as number) ?? 0);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [offset, search]);

  async function selectProvider(id: string) {
    if (selectedId === id) { setSelectedId(null); setDetail(null); return; }
    setSelectedId(id);
    setDetailLoading(true);
    try {
      const res = await adminService.getProviderDetail(id);
      setDetail(res.data);
    } catch { setDetail(null); }
    setDetailLoading(false);
  }

  if (error) return <div className="text-red-600">{error}</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-dark">Providers</h1>
        <span className="text-sm text-dark/50">{total} total</span>
      </div>

      <input value={search} onChange={e => { setSearch(e.target.value); setOffset(0); }} placeholder="Search by name, phone, email, or category..."
        className="w-full px-4 py-2.5 mb-4 rounded-lg border border-dark/10 text-sm outline-none focus:border-orange-400 bg-white" />

      <div className="bg-white rounded-xl border border-dark/10 overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead>
            <tr className="border-b border-dark/10 bg-warm">
              <th className="text-left px-4 py-3 font-semibold text-dark/60">Name</th>
              <th className="text-left px-4 py-3 font-semibold text-dark/60">Phone</th>
              <th className="text-left px-4 py-3 font-semibold text-dark/60">Rating</th>
              <th className="text-left px-4 py-3 font-semibold text-dark/60">Categories</th>
              <th className="text-left px-4 py-3 font-semibold text-dark/60">Acceptance</th>
              <th className="text-left px-4 py-3 font-semibold text-dark/60">Outreach</th>
              <th className="text-left px-4 py-3 font-semibold text-dark/60">Discovered</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-dark/40">Loading...</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-dark/40">{search ? 'No matches' : 'No providers yet'}</td></tr>
            ) : (
              rows.map((p) => (
                <>
                  <tr key={p.id} onClick={() => selectProvider(p.id)} className={`border-b border-dark/5 cursor-pointer transition-colors ${selectedId === p.id ? 'bg-orange-500/5' : 'hover:bg-warm/50'}`}>
                    <td className="px-4 py-3 text-dark font-medium max-w-[160px] truncate whitespace-nowrap">{p.name}</td>
                    <td className="px-4 py-3 text-dark/60 whitespace-nowrap">{p.phone ?? '-'}</td>
                    <td className="px-4 py-3 text-dark/60 whitespace-nowrap">{p.googleRating ? `${p.googleRating} (${p.reviewCount})` : '-'}</td>
                    <td className="px-4 py-3 text-dark/60 text-xs max-w-[140px] truncate">{p.categories?.join(', ') ?? '-'}</td>
                    <td className="px-4 py-3 text-dark/60 whitespace-nowrap">{p.acceptanceRate ? `${(Number(p.acceptanceRate) * 100).toFixed(0)}%` : '-'}</td>
                    <td className="px-4 py-3 text-dark/60 whitespace-nowrap">{p.totalOutreach ?? 0}</td>
                    <td className="px-4 py-3 text-dark/60 whitespace-nowrap">{new Date(p.discoveredAt).toLocaleDateString()}</td>
                  </tr>
                  {selectedId === p.id && (
                    <tr key={`${p.id}-detail`}>
                      <td colSpan={7} className="px-0 py-0 bg-warm/30">
                        {detailLoading ? (
                          <div className="px-6 py-8 text-center text-dark/40">Loading details...</div>
                        ) : detail ? (
                          <ProviderDetailView detail={detail} />
                        ) : (
                          <div className="px-6 py-8 text-center text-dark/40">Failed to load details</div>
                        )}
                      </td>
                    </tr>
                  )}
                </>
              ))
            )}
          </tbody>
        </table>
        </div>
      </div>

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

function ProviderDetailView({ detail }: { detail: NonNullable<Awaited<ReturnType<typeof adminService.getProviderDetail>>['data']> }) {
  const { provider: p, scores, outreach_attempts, provider_responses, bookings, suppressed, suppression_reason } = detail;
  const [sendingLink, setSendingLink] = useState(false);
  const [linkResult, setLinkResult] = useState<string | null>(null);

  async function handleSendPortalLink() {
    setSendingLink(true);
    setLinkResult(null);
    try {
      const res = await adminService.sendProviderMagicLink(p.id);
      if (res.error) { setLinkResult(`Error: ${res.error}`); }
      else if (res.data) { setLinkResult(`Sent via ${res.data.sentVia.join(' + ')}`); }
    } catch (err) { setLinkResult(`Error: ${(err as Error).message}`); }
    setSendingLink(false);
  }

  const statusColors: Record<string, string> = {
    pending: 'bg-amber-100 text-amber-700',
    accepted: 'bg-green-100 text-green-700',
    declined: 'bg-red-100 text-red-700',
    failed: 'bg-red-100 text-red-700',
    responded: 'bg-blue-100 text-blue-700',
    no_answer: 'bg-dark/10 text-dark/50',
    confirmed: 'bg-green-100 text-green-700',
  };

  return (
    <div className="px-4 sm:px-6 py-5 space-y-5 min-w-0">
      {/* Provider Info */}
      <div>
        <h3 className="text-sm font-bold text-dark mb-3">Provider Details</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <InfoCard label="Name" value={p.name} />
          <InfoCard label="Phone" value={p.phone ?? '-'} />
          <InfoCard label="Email" value={p.email ?? '-'} />
          <InfoCard label="Website" value={p.website ?? '-'} link={p.website} />
          <InfoCard label="Rating" value={p.googleRating ? `${p.googleRating} (${p.reviewCount} reviews)` : '-'} />
          <InfoCard label="Categories" value={p.categories?.join(', ') ?? '-'} />
          <InfoCard label="Notification Pref" value={p.notificationPref} />
          <InfoCard label="Vacation Mode" value={p.vacationMode ? 'ON' : 'Off'} />
          <InfoCard label="Service Zips" value={p.serviceZips?.join(', ') ?? '-'} />
          <InfoCard label="Discovered" value={new Date(p.discoveredAt).toLocaleString()} />
        </div>
        {suppressed && (
          <div className="mt-3 bg-red-50 border border-red-200 rounded-lg px-4 py-2 text-sm text-red-700">
            Suppressed: {suppression_reason ?? 'Unknown reason'}
          </div>
        )}
        <div className="mt-3 flex items-center gap-3">
          <button
            onClick={handleSendPortalLink}
            disabled={sendingLink || (!p.phone && !p.email)}
            className="px-4 py-1.5 rounded-lg border border-orange-300 bg-orange-50 text-orange-600 text-xs font-semibold hover:bg-orange-100 disabled:opacity-50 disabled:cursor-default"
          >
            {sendingLink ? 'Sending...' : '🔗 Send Portal Link'}
          </button>
          {linkResult && (
            <span className={`text-xs font-medium ${linkResult.startsWith('Error') ? 'text-red-600' : 'text-green-600'}`}>{linkResult}</span>
          )}
        </div>
      </div>

      {/* Scores */}
      {scores && (
        <div>
          <h3 className="text-sm font-bold text-dark mb-3">Performance</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <InfoCard label="Total Outreach" value={String(scores.totalOutreach)} />
            <InfoCard label="Total Accepted" value={String(scores.totalAccepted)} />
            <InfoCard label="Acceptance Rate" value={scores.acceptanceRate ? `${(Number(scores.acceptanceRate) * 100).toFixed(0)}%` : '-'} />
            <InfoCard label="Avg Response" value={scores.avgResponseSec ? `${Math.round(Number(scores.avgResponseSec))}s` : '-'} />
            <InfoCard label="Completion Rate" value={scores.completionRate ? `${(Number(scores.completionRate) * 100).toFixed(0)}%` : '-'} />
            <InfoCard label="Homeowner Rating" value={scores.avgHomeownerRating ? `${Number(scores.avgHomeownerRating).toFixed(1)}/5` : '-'} />
          </div>
        </div>
      )}

      {/* Outreach History */}
      <div>
        <h3 className="text-sm font-bold text-dark mb-3">Outreach History ({outreach_attempts.length})</h3>
        {outreach_attempts.length === 0 ? (
          <div className="text-sm text-dark/40">No outreach attempts</div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-dark/5">
            <table className="w-full text-xs min-w-[480px]">
              <thead>
                <tr className="bg-dark/3 border-b border-dark/5">
                  <th className="text-left px-3 py-2 font-semibold text-dark/50">Category</th>
                  <th className="text-left px-3 py-2 font-semibold text-dark/50">Zip</th>
                  <th className="text-left px-3 py-2 font-semibold text-dark/50">Channel</th>
                  <th className="text-left px-3 py-2 font-semibold text-dark/50">Status</th>
                  <th className="text-left px-3 py-2 font-semibold text-dark/50">Sent</th>
                  <th className="text-left px-3 py-2 font-semibold text-dark/50">Responded</th>
                </tr>
              </thead>
              <tbody>
                {outreach_attempts.map(a => (
                  <tr key={a.id} className="border-b border-dark/3">
                    <td className="px-3 py-2 text-dark capitalize whitespace-nowrap">{a.jobCategory ?? '-'}</td>
                    <td className="px-3 py-2 text-dark/60 whitespace-nowrap">{a.jobZip ?? '-'}</td>
                    <td className="px-3 py-2 text-dark/60 capitalize whitespace-nowrap">{a.channel}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className={`px-2 py-0.5 rounded text-xs font-semibold capitalize ${statusColors[a.status] ?? 'bg-dark/5 text-dark/50'}`}>{a.status}</span>
                    </td>
                    <td className="px-3 py-2 text-dark/50 whitespace-nowrap">{new Date(a.attemptedAt).toLocaleString()}</td>
                    <td className="px-3 py-2 text-dark/50 whitespace-nowrap">{a.respondedAt ? new Date(a.respondedAt).toLocaleString() : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Quotes Submitted */}
      {provider_responses.length > 0 && (
        <div>
          <h3 className="text-sm font-bold text-dark mb-3">Quotes Submitted ({provider_responses.length})</h3>
          <div className="space-y-2">
            {provider_responses.map(r => (
              <div key={r.id} className="bg-white rounded-lg border border-dark/5 p-3">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs text-dark/50">
                    <Link to={`/admin/jobs?q=${r.jobId.slice(0, 8)}`} className="text-orange-500 hover:underline font-medium">Job {r.jobId.slice(0, 8)}</Link>
                    {' '}· via {r.channel}
                  </span>
                  {r.quotedPrice && <span className="text-sm font-bold text-orange-500">{r.quotedPrice}</span>}
                </div>
                {r.availability && <div className="text-xs text-dark/60">Availability: {r.availability}</div>}
                {r.message && <div className="text-xs text-dark/50 italic mt-1">"{r.message}"</div>}
                <div className="text-xs text-dark/30 mt-1">{new Date(r.createdAt).toLocaleString()}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bookings */}
      {bookings.length > 0 && (
        <div>
          <h3 className="text-sm font-bold text-dark mb-3">Bookings ({bookings.length})</h3>
          <div className="space-y-2">
            {bookings.map(b => (
              <div key={b.id} className="bg-green-50 rounded-lg border border-green-200 p-3">
                <div className="flex justify-between items-center">
                  <Link to={`/admin/jobs?q=${b.jobId.slice(0, 8)}`} className="text-sm font-semibold text-orange-500 hover:underline">Job {b.jobId.slice(0, 8)}</Link>
                  <span className={`px-2 py-0.5 rounded text-xs font-semibold capitalize ${statusColors[b.status] ?? 'bg-dark/5 text-dark/50'}`}>{b.status}</span>
                </div>
                {b.serviceAddress && <div className="text-xs text-dark/60 mt-1">Address: {b.serviceAddress}</div>}
                <div className="text-xs text-dark/40 mt-1">{new Date(b.confirmedAt).toLocaleString()}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function InfoCard({ label, value, link }: { label: string; value: string; link?: string | null }) {
  return (
    <div className="bg-white rounded-lg border border-dark/5 px-3 py-2 min-w-0">
      <div className="text-[10px] font-semibold text-dark/40 uppercase tracking-wide">{label}</div>
      {link ? (
        <a href={link} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-orange-500 mt-0.5 block truncate">{value}</a>
      ) : (
        <div className="text-sm font-medium text-dark mt-0.5 truncate">{value}</div>
      )}
    </div>
  );
}
