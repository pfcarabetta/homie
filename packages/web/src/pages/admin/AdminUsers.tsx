import { Fragment, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminService, type UserRow, type UserDetailData } from '@/services/admin-api';

const PAGE_SIZE = 25;

const PRODUCTS: { id: string; label: string; tone: string }[] = [
  { id: 'all',             label: 'All',         tone: 'bg-dark/5 text-dark' },
  { id: 'personal',        label: 'Personal',    tone: 'bg-blue-100 text-blue-700' },
  { id: 'business',        label: 'Business',    tone: 'bg-emerald-100 text-emerald-700' },
  { id: 'inspect_partner', label: 'Inspect',     tone: 'bg-orange-100 text-orange-700' },
  { id: 'provider',        label: 'Provider',    tone: 'bg-purple-100 text-purple-700' },
];

const PRODUCT_BADGE: Record<string, { label: string; classes: string }> = {
  personal:        { label: 'Personal',    classes: 'bg-blue-100 text-blue-700' },
  business:        { label: 'Business',    classes: 'bg-emerald-100 text-emerald-700' },
  inspect_partner: { label: 'Inspect',     classes: 'bg-orange-100 text-orange-700' },
  provider:        { label: 'Provider',    classes: 'bg-purple-100 text-purple-700' },
};

const STATUS_COLORS: Record<string, string> = {
  open: 'bg-blue-100 text-blue-700',
  dispatching: 'bg-amber-100 text-amber-700',
  collecting: 'bg-purple-100 text-purple-700',
  completed: 'bg-green-100 text-green-700',
  expired: 'bg-dark/10 text-dark/50',
  refunded: 'bg-red-100 text-red-700',
  confirmed: 'bg-green-100 text-green-700',
  parsed: 'bg-green-100 text-green-700',
  processing: 'bg-amber-100 text-amber-700',
  failed: 'bg-red-100 text-red-700',
  paid: 'bg-green-100 text-green-700',
  pending: 'bg-amber-100 text-amber-700',
};

function formatCurrency(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

type ImpersonationRole = 'homeowner' | 'inspector' | 'provider';

/**
 * Mints an impersonation token for the chosen role and opens the matching
 * portal in a new tab. The /admin/impersonate handler stuffs the token +
 * profile blob into sessionStorage (tab-scoped) and redirects into the
 * portal — so closing the tab cleanly ends the impersonation.
 */
async function launchImpersonation(role: ImpersonationRole, ids: { homeownerId?: string | null; inspectorPartnerId?: string | null; providerId?: string | null }, onError: (msg: string) => void) {
  try {
    let token: string;
    let profile: unknown;
    if (role === 'homeowner') {
      if (!ids.homeownerId) throw new Error('No homeowner id');
      const res = await adminService.impersonateHomeowner(ids.homeownerId);
      if (!res.data?.token) throw new Error(res.error ?? 'No token returned');
      token = res.data.token; profile = res.data.homeowner;
    } else if (role === 'inspector') {
      if (!ids.inspectorPartnerId) throw new Error('No inspector partner id');
      const res = await adminService.impersonateInspectPartner(ids.inspectorPartnerId);
      if (!res.data?.token) throw new Error(res.error ?? 'No token returned');
      token = res.data.token; profile = res.data.partner;
    } else {
      if (!ids.providerId) throw new Error('No provider id');
      const res = await adminService.impersonateProvider(ids.providerId);
      if (!res.data?.token) throw new Error(res.error ?? 'No token returned');
      token = res.data.token; profile = res.data.provider;
    }
    const profileParam = encodeURIComponent(btoa(unescape(encodeURIComponent(JSON.stringify(profile)))));
    const url = `/admin/impersonate?as=${role}&token=${encodeURIComponent(token)}&profile=${profileParam}`;
    window.open(url, '_blank', 'noopener');
  } catch (err) {
    onError((err as Error).message);
  }
}

/**
 * Returns the impersonation roles available for a given user row.
 * 'business' is folded into 'homeowner' (same auth backend) — the
 * dropdown labels make it explicit when the user is also in Business.
 */
function rolesForUser(u: { homeownerId: string | null; inspectorPartnerId: string | null; providerId: string | null; products: string[] }): { role: ImpersonationRole; label: string }[] {
  const out: { role: ImpersonationRole; label: string }[] = [];
  if (u.homeownerId) {
    const isBiz = u.products.includes('business');
    out.push({ role: 'homeowner', label: isBiz ? 'Personal / Business' : 'Personal' });
  }
  if (u.inspectorPartnerId) out.push({ role: 'inspector', label: 'Inspect partner' });
  if (u.providerId)         out.push({ role: 'provider', label: 'Service provider' });
  return out;
}

function LoginAsButton({ user, onError }: { user: { homeownerId: string | null; inspectorPartnerId: string | null; providerId: string | null; products: string[] }; onError: (msg: string) => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<ImpersonationRole | null>(null);
  const roles = rolesForUser(user);
  if (roles.length === 0) return null;

  async function go(role: ImpersonationRole) {
    setBusy(role);
    setOpen(false);
    await launchImpersonation(role, user, onError);
    setBusy(null);
  }

  // Single-product user: button logs in directly. Multi-product: dropdown picker.
  if (roles.length === 1) {
    const r = roles[0];
    return (
      <button
        onClick={(e) => { e.stopPropagation(); void go(r.role); }}
        disabled={busy !== null}
        className="text-xs font-semibold px-3 py-1 rounded-md bg-dark text-white hover:bg-dark/80 disabled:opacity-50 whitespace-nowrap"
      >
        {busy ? '…' : `Log in as ${r.label} ↗`}
      </button>
    );
  }

  return (
    <div className="relative inline-block" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={() => setOpen(o => !o)}
        disabled={busy !== null}
        className="text-xs font-semibold px-3 py-1 rounded-md bg-dark text-white hover:bg-dark/80 disabled:opacity-50 whitespace-nowrap"
      >
        {busy ? '…' : 'Log in as ▾'}
      </button>
      {open && (
        <div className="absolute right-0 mt-1 bg-white border border-dark/10 rounded-lg shadow-lg z-30 min-w-[180px]">
          {roles.map(r => (
            <button
              key={r.role}
              onClick={() => void go(r.role)}
              className="block w-full text-left text-xs font-semibold px-3 py-2 hover:bg-warm whitespace-nowrap"
            >
              {r.label} ↗
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function formatRelative(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.round(days / 365)}y ago`;
}

export default function AdminUsers() {
  const [rows, setRows] = useState<UserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [search, setSearch] = useState('');
  const [productFilter, setProductFilter] = useState('all');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedEmail, setSelectedEmail] = useState<string | null>(null);
  const [detail, setDetail] = useState<UserDetailData | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }

  useEffect(() => {
    setLoading(true);
    setError(null);
    adminService.getUsers({ limit: PAGE_SIZE, offset, q: search || undefined, product: productFilter })
      .then(res => {
        setRows(res.data ?? []);
        setTotal((res.meta.total as number) ?? 0);
      })
      .catch(err => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, [offset, search, productFilter]);

  async function selectUser(email: string) {
    if (selectedEmail === email) { setSelectedEmail(null); setDetail(null); return; }
    setSelectedEmail(email);
    setDetailLoading(true);
    try {
      const res = await adminService.getUserDetail(email);
      setDetail(res.data);
    } catch {
      setDetail(null);
    }
    setDetailLoading(false);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h1 className="text-2xl font-bold text-dark">Users</h1>
        <span className="text-sm text-dark/50">{total} total</span>
      </div>

      {/* Product filter pills */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        {PRODUCTS.map(p => (
          <button
            key={p.id}
            onClick={() => { setProductFilter(p.id); setOffset(0); setSelectedEmail(null); }}
            className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-colors ${
              productFilter === p.id ? 'bg-dark text-white' : 'bg-dark/5 text-dark/60 hover:bg-dark/10'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <input
        value={search}
        onChange={e => { setSearch(e.target.value); setOffset(0); }}
        placeholder="Search by email, name, phone, or company…"
        className="w-full px-4 py-2.5 mb-4 rounded-lg border border-dark/10 text-sm outline-none focus:border-orange-400 bg-white"
      />

      {error && <div className="text-red-600 text-sm mb-3">{error}</div>}

      <div className="bg-white rounded-xl border border-dark/10 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr className="border-b border-dark/10 bg-warm">
                <th className="text-left px-4 py-3 font-semibold text-dark/60">User</th>
                <th className="text-left px-4 py-3 font-semibold text-dark/60">Products</th>
                <th className="text-right px-4 py-3 font-semibold text-dark/60">Jobs</th>
                <th className="text-right px-4 py-3 font-semibold text-dark/60">Bookings</th>
                <th className="text-right px-4 py-3 font-semibold text-dark/60">Reports</th>
                <th className="text-right px-4 py-3 font-semibold text-dark/60">Earnings</th>
                <th className="text-left px-4 py-3 font-semibold text-dark/60">Last activity</th>
                <th className="text-left px-4 py-3 font-semibold text-dark/60">Joined</th>
                <th className="text-right px-4 py-3 font-semibold text-dark/60">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-dark/40">Loading…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-dark/40">{search ? 'No matches' : 'No users yet'}</td></tr>
              ) : (
                rows.map(u => {
                  const isSelected = selectedEmail === u.email;
                  return (
                    <Fragment key={u.email}>
                      <tr
                        onClick={() => selectUser(u.email)}
                        className={`border-b border-dark/5 cursor-pointer transition-colors ${isSelected ? 'bg-orange-500/5' : 'hover:bg-warm/50'}`}
                      >
                        <td className="px-4 py-3 text-dark max-w-[260px]">
                          <div className="font-semibold truncate">{u.name ?? u.email}</div>
                          <div className="text-xs text-dark/50 truncate">{u.email}</div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex gap-1 flex-wrap">
                            {u.products.map(p => (
                              <span key={p} className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${PRODUCT_BADGE[p]?.classes ?? 'bg-dark/5 text-dark/50'}`}>
                                {PRODUCT_BADGE[p]?.label ?? p}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right text-dark/70 whitespace-nowrap">{u.jobCount || '—'}</td>
                        <td className="px-4 py-3 text-right text-dark/70 whitespace-nowrap">{u.bookingCount || '—'}</td>
                        <td className="px-4 py-3 text-right text-dark/70 whitespace-nowrap">{u.inspectorReportsUploaded || '—'}</td>
                        <td className="px-4 py-3 text-right text-dark whitespace-nowrap font-semibold">
                          {u.inspectorEarningsCents > 0 ? formatCurrency(u.inspectorEarningsCents) : '—'}
                        </td>
                        <td className="px-4 py-3 text-dark/60 whitespace-nowrap text-xs">{formatRelative(u.lastActivityAt)}</td>
                        <td className="px-4 py-3 text-dark/60 whitespace-nowrap text-xs">{new Date(u.firstSeenAt).toLocaleDateString()}</td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <LoginAsButton user={u} onError={(msg) => showToast(`Login failed: ${msg}`)} />
                        </td>
                      </tr>
                      {isSelected && (
                        <tr>
                          <td colSpan={9} className="px-0 py-0 bg-warm/30">
                            {detailLoading ? (
                              <div className="px-6 py-8 text-center text-dark/40">Loading details…</div>
                            ) : detail ? (
                              <UserDetailView detail={detail} />
                            ) : (
                              <div className="px-6 py-8 text-center text-dark/40">Failed to load details</div>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {toast && (
        <div className="fixed bottom-6 right-6 bg-dark text-white text-sm font-medium px-4 py-2 rounded-lg shadow-lg z-50">
          {toast}
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

function UserDetailView({ detail }: { detail: UserDetailData }) {
  const {
    email, products, homeowner, inspector, provider,
    personalStats, personalJobs, personalBookings, workspaceMemberships,
    receivedReports, uploadedReports, inspectorStats, providerStats,
  } = detail;

  const displayName = homeowner
    ? [homeowner.firstName, homeowner.lastName].filter(Boolean).join(' ') || homeowner.email
    : inspector?.companyName ?? provider?.name ?? email;

  async function viewAsPartner() {
    if (!inspector) return;
    await launchImpersonation('inspector', { inspectorPartnerId: inspector.id }, (msg) => alert(`Failed: ${msg}`));
  }

  return (
    <div className="px-4 sm:px-6 py-5 space-y-5 min-w-0">
      {/* Header — name + product badges */}
      <div>
        <div className="flex items-center gap-2 flex-wrap mb-2">
          <h3 className="text-lg font-bold text-dark">{displayName}</h3>
          {products.map(p => (
            <span key={p} className={`text-[11px] font-bold px-2 py-0.5 rounded ${PRODUCT_BADGE[p]?.classes ?? 'bg-dark/5 text-dark/50'}`}>
              {PRODUCT_BADGE[p]?.label ?? p}
            </span>
          ))}
        </div>
        <div className="text-sm text-dark/50">{email}</div>
      </div>

      {/* Account details */}
      <Section title="Account details">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {homeowner && (
            <>
              <InfoCard label="Homeowner ID" value={homeowner.id.slice(0, 8)} mono />
              <InfoCard label="Phone" value={homeowner.phone ?? '—'} />
              <InfoCard label="Zip" value={homeowner.zipCode} />
              <InfoCard label="Tier" value={homeowner.membershipTier} capitalize />
              <InfoCard label="Email verified" value={homeowner.emailVerified ? 'Yes' : 'No'} />
              <InfoCard label="SMS opt-in" value={homeowner.smsOptIn ? 'Yes' : 'No'} />
              <InfoCard label="Stripe customer" value={homeowner.stripeCustomerId ?? '—'} mono />
              <InfoCard label="Joined" value={new Date(homeowner.createdAt).toLocaleDateString()} />
            </>
          )}
          {!homeowner && inspector && (
            <>
              <InfoCard label="Partner ID" value={inspector.id.slice(0, 8)} mono />
              <InfoCard label="Phone" value={inspector.phone ?? '—'} />
              <InfoCard label="Status" value={inspector.status} capitalize />
              <InfoCard label="Joined" value={inspector.joinedAt ? new Date(inspector.joinedAt).toLocaleDateString() : new Date(inspector.createdAt).toLocaleDateString()} />
            </>
          )}
          {!homeowner && !inspector && provider && (
            <>
              <InfoCard label="Provider ID" value={provider.id.slice(0, 8)} mono />
              <InfoCard label="Phone" value={provider.phone ?? '—'} />
              <InfoCard label="Discovered" value={new Date(provider.discoveredAt).toLocaleDateString()} />
            </>
          )}
        </div>
      </Section>

      {/* Activity stats */}
      {(homeowner || inspector || provider) && (
        <Section title="Activity">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {homeowner && (
              <>
                <StatTile value={personalStats.total_jobs} label="Total jobs" tone="text-dark" />
                <StatTile value={personalStats.total_bookings} label="Total bookings" tone="text-orange-500" />
              </>
            )}
            {inspectorStats && (
              <>
                <StatTile value={inspectorStats.totalReports} label="Reports uploaded" tone="text-orange-600" />
                <StatTile value={formatCurrency(inspectorStats.lifetimeEarningsCents)} label="Lifetime earnings" tone="text-green-600" />
              </>
            )}
            {providerStats && (
              <>
                <StatTile value={providerStats.outreachCount} label="Outreach received" tone="text-purple-600" />
                <StatTile
                  value={providerStats.scores ? `${Math.round(parseFloat(providerStats.scores.acceptanceRate ?? '0') * 100)}%` : '—'}
                  label="Acceptance rate"
                  tone="text-purple-600"
                />
              </>
            )}
          </div>
        </Section>
      )}

      {/* Inspect partner section */}
      {inspector && inspectorStats && (
        <Section title="Inspect partner">
          <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 flex items-center justify-between gap-3 flex-wrap">
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-dark">{inspector.companyName}</div>
              <div className="text-xs text-dark/60 mt-1 break-all">
                <a href={inspectorStats.landingPageUrl} target="_blank" rel="noopener noreferrer" className="text-orange-600 hover:underline">
                  /partner/{inspector.partnerSlug} ↗
                </a>
              </div>
              <div className="text-xs text-dark/50 mt-1">
                Status: <span className="capitalize font-semibold">{inspector.status}</span>
                {inspectorStats.stripeConnected && <span className="ml-2 text-green-700">· Stripe ✓</span>}
              </div>
            </div>
            <button
              onClick={viewAsPartner}
              className="text-xs font-semibold px-3 py-1.5 rounded-md bg-dark text-white hover:bg-dark/80"
            >
              View as partner ↗
            </button>
          </div>
        </Section>
      )}

      {/* Business workspaces */}
      {workspaceMemberships.length > 0 && (
        <Section title={`Business workspaces (${workspaceMemberships.length})`}>
          <div className="flex flex-wrap gap-2">
            {workspaceMemberships.map(ws => (
              <div key={ws.workspaceId} className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 text-sm">
                <span className="font-semibold text-dark">{ws.workspaceName}</span>
                <span className="text-dark/40 ml-2 capitalize">{ws.role}</span>
                <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-700 uppercase">{ws.workspacePlan}</span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Recent jobs */}
      {personalJobs.length > 0 && (
        <Section title={`Recent jobs (${personalJobs.length})`}>
          <div className="overflow-x-auto rounded-lg border border-dark/5">
            <table className="w-full text-xs min-w-[480px]">
              <thead>
                <tr className="bg-dark/3 border-b border-dark/5">
                  <th className="text-left px-3 py-2 font-semibold text-dark/50">ID</th>
                  <th className="text-left px-3 py-2 font-semibold text-dark/50">Category</th>
                  <th className="text-left px-3 py-2 font-semibold text-dark/50">Status</th>
                  <th className="text-left px-3 py-2 font-semibold text-dark/50">Tier</th>
                  <th className="text-left px-3 py-2 font-semibold text-dark/50">Type</th>
                  <th className="text-left px-3 py-2 font-semibold text-dark/50">Created</th>
                </tr>
              </thead>
              <tbody>
                {personalJobs.map(j => (
                  <tr key={j.id} className="border-b border-dark/3">
                    <td className="px-3 py-2 font-mono whitespace-nowrap">
                      <Link to={`/admin/jobs?q=${j.id.slice(0, 8)}`} className="text-orange-500 hover:underline">{j.id.slice(0, 8)}</Link>
                    </td>
                    <td className="px-3 py-2 text-dark capitalize whitespace-nowrap">{j.diagnosis?.category?.replace(/_/g, ' ') ?? '—'}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className={`px-2 py-0.5 rounded text-xs font-semibold capitalize ${STATUS_COLORS[j.status] ?? 'bg-dark/5 text-dark/50'}`}>{j.status}</span>
                    </td>
                    <td className="px-3 py-2 text-dark/60 capitalize whitespace-nowrap">{j.tier}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {j.workspaceId ? <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-700 uppercase">Business</span> : <span className="text-dark/40">Consumer</span>}
                    </td>
                    <td className="px-3 py-2 text-dark/50 whitespace-nowrap">{new Date(j.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {/* Bookings */}
      {personalBookings.length > 0 && (
        <Section title={`Bookings (${personalBookings.length})`}>
          <div className="space-y-2">
            {personalBookings.map(b => (
              <div key={b.id} className="bg-white rounded-lg border border-dark/5 p-3 flex justify-between items-center gap-2 min-w-0">
                <div className="min-w-0">
                  <span className="text-sm font-semibold text-dark">{b.providerName ?? 'Unknown'}</span>
                  <Link to={`/admin/jobs?q=${b.jobId.slice(0, 8)}`} className="text-xs text-orange-500 hover:underline ml-2">Job {b.jobId.slice(0, 8)}</Link>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className={`px-2 py-0.5 rounded text-xs font-semibold capitalize ${STATUS_COLORS[b.status] ?? 'bg-dark/5 text-dark/50'}`}>{b.status}</span>
                  <span className="text-xs text-dark/40 whitespace-nowrap">{new Date(b.confirmedAt).toLocaleDateString()}</span>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Inspect reports — uploaded */}
      {uploadedReports.length > 0 && (
        <Section title={`Reports uploaded (${uploadedReports.length})`}>
          <div className="overflow-x-auto rounded-lg border border-dark/5">
            <table className="w-full text-xs min-w-[600px]">
              <thead>
                <tr className="bg-dark/3 border-b border-dark/5">
                  <th className="text-left px-3 py-2 font-semibold text-dark/50">Property</th>
                  <th className="text-left px-3 py-2 font-semibold text-dark/50">Client</th>
                  <th className="text-left px-3 py-2 font-semibold text-dark/50">Tier</th>
                  <th className="text-left px-3 py-2 font-semibold text-dark/50">Status</th>
                  <th className="text-right px-3 py-2 font-semibold text-dark/50">Items</th>
                  <th className="text-left px-3 py-2 font-semibold text-dark/50">Uploaded</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {uploadedReports.map(r => (
                  <tr key={r.id} className="border-b border-dark/3">
                    <td className="px-3 py-2 text-dark max-w-[200px] truncate">{r.propertyAddress}</td>
                    <td className="px-3 py-2 text-dark/60 max-w-[160px] truncate text-xs">{r.clientName}</td>
                    <td className="px-3 py-2 capitalize whitespace-nowrap"><span className="text-[11px] font-semibold">{r.pricingTier ?? 'free'}</span></td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${STATUS_COLORS[r.parsingStatus] ?? 'bg-dark/5 text-dark/50'}`}>{r.parsingStatus}</span>
                    </td>
                    <td className="px-3 py-2 text-right text-dark/60 whitespace-nowrap">{r.itemsParsed}</td>
                    <td className="px-3 py-2 text-dark/50 whitespace-nowrap">{new Date(r.createdAt).toLocaleDateString()}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <a href={`/inspect/${r.clientAccessToken}`} target="_blank" rel="noopener noreferrer" className="text-orange-500 hover:underline text-xs font-semibold">Open ↗</a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {/* Inspect reports — received */}
      {receivedReports.length > 0 && (
        <Section title={`Reports received (${receivedReports.length})`}>
          <div className="overflow-x-auto rounded-lg border border-dark/5">
            <table className="w-full text-xs min-w-[480px]">
              <thead>
                <tr className="bg-dark/3 border-b border-dark/5">
                  <th className="text-left px-3 py-2 font-semibold text-dark/50">Property</th>
                  <th className="text-left px-3 py-2 font-semibold text-dark/50">Tier</th>
                  <th className="text-left px-3 py-2 font-semibold text-dark/50">Status</th>
                  <th className="text-left px-3 py-2 font-semibold text-dark/50">Inspected</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {receivedReports.map(r => (
                  <tr key={r.id} className="border-b border-dark/3">
                    <td className="px-3 py-2 text-dark max-w-[220px] truncate">{r.propertyAddress}</td>
                    <td className="px-3 py-2 capitalize whitespace-nowrap text-[11px] font-semibold">{r.pricingTier ?? 'free'}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${STATUS_COLORS[r.parsingStatus] ?? 'bg-dark/5 text-dark/50'}`}>{r.parsingStatus}</span>
                    </td>
                    <td className="px-3 py-2 text-dark/50 whitespace-nowrap">{new Date(r.inspectionDate).toLocaleDateString()}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <a href={`/inspect/${r.clientAccessToken}`} target="_blank" rel="noopener noreferrer" className="text-orange-500 hover:underline text-xs font-semibold">Open ↗</a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {/* Provider section */}
      {provider && (
        <Section title="Service provider">
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
            <div className="font-semibold text-dark">{provider.name}</div>
            {provider.categories && provider.categories.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {provider.categories.map(c => (
                  <span key={c} className="text-[10px] font-semibold bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded uppercase">{c}</span>
                ))}
              </div>
            )}
            <div className="text-xs text-dark/60 mt-2">
              {provider.rating && <span>★ {provider.rating} ({provider.reviewCount} reviews)</span>}
              {provider.vacationMode && <span className="ml-2 text-amber-700 font-semibold">On vacation</span>}
            </div>
            <div className="mt-3">
              <Link to={`/admin/providers?q=${encodeURIComponent(provider.name)}`} className="text-xs font-semibold text-purple-700 hover:underline">View full provider record →</Link>
            </div>
          </div>
        </Section>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-sm font-bold text-dark mb-3">{title}</h3>
      {children}
    </div>
  );
}

function InfoCard({ label, value, mono, capitalize }: { label: string; value: string; mono?: boolean; capitalize?: boolean }) {
  return (
    <div className="bg-white rounded-lg border border-dark/5 px-3 py-2 min-w-0">
      <div className="text-[10px] font-semibold text-dark/40 uppercase tracking-wide">{label}</div>
      <div className={`text-sm font-medium text-dark mt-0.5 truncate ${mono ? 'font-mono text-xs' : ''} ${capitalize ? 'capitalize' : ''}`}>{value}</div>
    </div>
  );
}

function StatTile({ value, label, tone }: { value: string | number; label: string; tone: string }) {
  return (
    <div className="bg-white rounded-lg border border-dark/5 px-3 py-3 text-center">
      <div className={`text-2xl font-bold ${tone}`}>{value}</div>
      <div className="text-xs text-dark/40 mt-1">{label}</div>
    </div>
  );
}
