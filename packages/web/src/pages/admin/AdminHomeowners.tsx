import { useEffect, useState } from 'react';
import { adminService } from '@/services/admin-api';

interface Homeowner {
  id: string;
  email: string;
  phone: string | null;
  zipCode: string;
  membershipTier: string;
  createdAt: string;
}

interface HomeownerDetail {
  homeowner: {
    id: string; firstName: string | null; lastName: string | null; email: string;
    phone: string | null; zipCode: string; membershipTier: string;
    stripeCustomerId: string | null; emailVerified: boolean; createdAt: string;
  };
  jobs: Array<{ id: string; status: string; tier: string; diagnosis: { category?: string; summary?: string } | null; zipCode: string; workspaceId: string | null; createdAt: string }>;
  bookings: Array<{ id: string; jobId: string; providerName: string | null; status: string; confirmedAt: string }>;
  workspaces: Array<{ workspaceId: string; role: string; workspaceName: string; workspacePlan: string }>;
  stats: { total_jobs: number; total_bookings: number };
}

const PAGE_SIZE = 25;

const STATUS_COLORS: Record<string, string> = {
  open: 'bg-blue-100 text-blue-700',
  dispatching: 'bg-amber-100 text-amber-700',
  collecting: 'bg-purple-100 text-purple-700',
  completed: 'bg-green-100 text-green-700',
  expired: 'bg-dark/10 text-dark/50',
  refunded: 'bg-red-100 text-red-700',
  confirmed: 'bg-green-100 text-green-700',
};

export default function AdminHomeowners() {
  const [rows, setRows] = useState<Homeowner[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<HomeownerDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    adminService.getHomeowners({ limit: PAGE_SIZE, offset, q: search || undefined })
      .then((res) => {
        setRows(res.data ?? []);
        setTotal((res.meta.total as number) ?? 0);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [offset, search]);

  async function selectHomeowner(id: string) {
    if (selectedId === id) { setSelectedId(null); setDetail(null); return; }
    setSelectedId(id);
    setDetailLoading(true);
    try {
      const res = await adminService.getHomeownerDetail(id);
      setDetail(res.data);
    } catch { setDetail(null); }
    setDetailLoading(false);
  }

  if (error) return <div className="text-red-600">{error}</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-dark">Homeowners</h1>
        <span className="text-sm text-dark/50">{total} total</span>
      </div>

      <input value={search} onChange={e => { setSearch(e.target.value); setOffset(0); }} placeholder="Search by email, phone, or zip..."
        className="w-full px-4 py-2.5 mb-4 rounded-lg border border-dark/10 text-sm outline-none focus:border-orange-400 bg-white" />

      <div className="bg-white rounded-xl border border-dark/10 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-dark/10 bg-warm">
              <th className="text-left px-4 py-3 font-semibold text-dark/60">Email</th>
              <th className="text-left px-4 py-3 font-semibold text-dark/60">Phone</th>
              <th className="text-left px-4 py-3 font-semibold text-dark/60">Zip</th>
              <th className="text-left px-4 py-3 font-semibold text-dark/60">Tier</th>
              <th className="text-left px-4 py-3 font-semibold text-dark/60">Joined</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-dark/40">Loading...</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-dark/40">{search ? 'No matches' : 'No homeowners yet'}</td></tr>
            ) : (
              rows.map((h) => (
                <>
                  <tr key={h.id} onClick={() => selectHomeowner(h.id)}
                    className={`border-b border-dark/5 cursor-pointer transition-colors ${selectedId === h.id ? 'bg-orange-500/5' : 'hover:bg-warm/50'}`}>
                    <td className="px-4 py-3 text-dark">{h.email}</td>
                    <td className="px-4 py-3 text-dark/60">{h.phone ?? '-'}</td>
                    <td className="px-4 py-3 text-dark/60">{h.zipCode}</td>
                    <td className="px-4 py-3"><span className="bg-dark/5 px-2 py-0.5 rounded text-xs font-semibold capitalize">{h.membershipTier}</span></td>
                    <td className="px-4 py-3 text-dark/60">{new Date(h.createdAt).toLocaleDateString()}</td>
                  </tr>
                  {selectedId === h.id && (
                    <tr key={`${h.id}-detail`}>
                      <td colSpan={5} className="px-0 py-0 bg-warm/30">
                        {detailLoading ? (
                          <div className="px-6 py-8 text-center text-dark/40">Loading details...</div>
                        ) : detail ? (
                          <HomeownerDetailView detail={detail} />
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

function HomeownerDetailView({ detail }: { detail: HomeownerDetail }) {
  const { homeowner: ho, jobs: jobRows, bookings: bookingRows, workspaces: wsRows, stats } = detail;
  const fullName = [ho.firstName, ho.lastName].filter(Boolean).join(' ') || null;

  return (
    <div className="px-6 py-5 space-y-5">
      {/* Profile */}
      <div>
        <h3 className="text-sm font-bold text-dark mb-3">Account Details</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <InfoCard label="ID" value={ho.id.slice(0, 8)} mono />
          {fullName && <InfoCard label="Name" value={fullName} />}
          <InfoCard label="Email" value={ho.email} />
          <InfoCard label="Phone" value={ho.phone ?? '-'} />
          <InfoCard label="Zip Code" value={ho.zipCode} />
          <InfoCard label="Tier" value={ho.membershipTier} capitalize />
          <InfoCard label="Email Verified" value={ho.emailVerified ? 'Yes' : 'No'} />
          <InfoCard label="Stripe Customer" value={ho.stripeCustomerId ?? 'None'} mono />
          <InfoCard label="Joined" value={new Date(ho.createdAt).toLocaleString()} />
        </div>
      </div>

      {/* Stats */}
      <div>
        <h3 className="text-sm font-bold text-dark mb-3">Activity</h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white rounded-lg border border-dark/5 px-3 py-3 text-center">
            <div className="text-2xl font-bold text-dark">{stats.total_jobs}</div>
            <div className="text-xs text-dark/40 mt-1">Total Jobs</div>
          </div>
          <div className="bg-white rounded-lg border border-dark/5 px-3 py-3 text-center">
            <div className="text-2xl font-bold text-orange-500">{stats.total_bookings}</div>
            <div className="text-xs text-dark/40 mt-1">Total Bookings</div>
          </div>
        </div>
      </div>

      {/* Business workspaces */}
      {wsRows.length > 0 && (
        <div>
          <h3 className="text-sm font-bold text-dark mb-3">Business Workspaces</h3>
          <div className="flex flex-wrap gap-2">
            {wsRows.map(ws => (
              <div key={ws.workspaceId} className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 text-sm">
                <span className="font-semibold text-dark">{ws.workspaceName}</span>
                <span className="text-dark/40 ml-2 capitalize">{ws.role}</span>
                <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-700 uppercase">{ws.workspacePlan}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent jobs */}
      <div>
        <h3 className="text-sm font-bold text-dark mb-3">Recent Jobs ({jobRows.length})</h3>
        {jobRows.length === 0 ? (
          <div className="text-sm text-dark/40">No jobs</div>
        ) : (
          <div className="bg-white rounded-lg border border-dark/5 overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-dark/3 border-b border-dark/5">
                  <th className="text-left px-3 py-2 font-semibold text-dark/50">ID</th>
                  <th className="text-left px-3 py-2 font-semibold text-dark/50">Category</th>
                  <th className="text-left px-3 py-2 font-semibold text-dark/50">Status</th>
                  <th className="text-left px-3 py-2 font-semibold text-dark/50">Tier</th>
                  <th className="text-left px-3 py-2 font-semibold text-dark/50">Zip</th>
                  <th className="text-left px-3 py-2 font-semibold text-dark/50">Type</th>
                  <th className="text-left px-3 py-2 font-semibold text-dark/50">Created</th>
                </tr>
              </thead>
              <tbody>
                {jobRows.map(j => (
                  <tr key={j.id} className="border-b border-dark/3">
                    <td className="px-3 py-2 text-dark/60 font-mono">{j.id.slice(0, 8)}</td>
                    <td className="px-3 py-2 text-dark capitalize">{j.diagnosis?.category?.replace(/_/g, ' ') ?? '-'}</td>
                    <td className="px-3 py-2">
                      <span className={`px-2 py-0.5 rounded text-xs font-semibold capitalize ${STATUS_COLORS[j.status] ?? 'bg-dark/5 text-dark/50'}`}>{j.status}</span>
                    </td>
                    <td className="px-3 py-2 text-dark/60 capitalize">{j.tier}</td>
                    <td className="px-3 py-2 text-dark/60">{j.zipCode}</td>
                    <td className="px-3 py-2">
                      {j.workspaceId ? <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-700 uppercase">Business</span> : <span className="text-dark/40">Consumer</span>}
                    </td>
                    <td className="px-3 py-2 text-dark/50">{new Date(j.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Bookings */}
      {bookingRows.length > 0 && (
        <div>
          <h3 className="text-sm font-bold text-dark mb-3">Bookings ({bookingRows.length})</h3>
          <div className="space-y-2">
            {bookingRows.map(b => (
              <div key={b.id} className="bg-white rounded-lg border border-dark/5 p-3 flex justify-between items-center">
                <div>
                  <span className="text-sm font-semibold text-dark">{b.providerName ?? 'Unknown'}</span>
                  <span className="text-xs text-dark/40 ml-2">Job {b.jobId.slice(0, 8)}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`px-2 py-0.5 rounded text-xs font-semibold capitalize ${STATUS_COLORS[b.status] ?? 'bg-dark/5 text-dark/50'}`}>{b.status}</span>
                  <span className="text-xs text-dark/40">{new Date(b.confirmedAt).toLocaleDateString()}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function InfoCard({ label, value, mono, capitalize }: { label: string; value: string; mono?: boolean; capitalize?: boolean }) {
  return (
    <div className="bg-white rounded-lg border border-dark/5 px-3 py-2">
      <div className="text-[10px] font-semibold text-dark/40 uppercase tracking-wide">{label}</div>
      <div className={`text-sm font-medium text-dark mt-0.5 truncate ${mono ? 'font-mono' : ''} ${capitalize ? 'capitalize' : ''}`}>{value}</div>
    </div>
  );
}
