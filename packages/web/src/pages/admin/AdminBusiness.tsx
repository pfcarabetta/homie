import { useEffect, useState } from 'react';
import { adminService } from '@/services/admin-api';

interface BusinessAccount {
  id: string;
  name: string;
  slug: string;
  plan: string;
  searchesUsed: number;
  searchesLimit: number;
  ownerEmail: string | null;
  ownerName: string | null;
  createdAt: string;
}

interface BusinessDetail {
  workspace: {
    id: string; name: string; slug: string; plan: string;
    searchesUsed: number; searchesLimit: number;
    billingCycleStart: string; createdAt: string;
    ownerEmail: string | null; ownerName: string | null; ownerPhone: string | null;
  };
  members: Array<{ id: string; role: string; email: string; name: string }>;
  properties: Array<{ id: string; name: string; active: boolean }>;
  stats: { total_dispatches: number; total_responses: number; total_bookings: number };
}

const ALL_PLANS = ['trial', 'starter', 'professional', 'business', 'enterprise'];

const PLAN_COLORS: Record<string, string> = {
  trial: 'bg-rose-100 text-rose-700',
  starter: 'bg-gray-100 text-gray-600',
  professional: 'bg-blue-100 text-blue-700',
  business: 'bg-purple-100 text-purple-700',
  enterprise: 'bg-amber-100 text-amber-700',
};

const PLAN_LABELS: Record<string, string> = {
  trial: '14-day Trial (5 credits)',
  starter: 'Starter ($29 + $5/property)',
  professional: 'Professional ($49 + $8/property)',
  business: 'Business ($99 + $10/property)',
  enterprise: 'Enterprise (custom)',
};

export default function AdminBusiness() {
  const [accounts, setAccounts] = useState<BusinessAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [detail, setDetail] = useState<BusinessDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Create form
  const [email, setEmail] = useState('');
  const [workspaceName, setWorkspaceName] = useState('');
  const [plan, setPlan] = useState('trial');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [createSuccess, setCreateSuccess] = useState('');

  // Actions
  const [actionMsg, setActionMsg] = useState('');

  function loadAccounts() {
    adminService.getBusinessAccounts()
      .then(res => { setAccounts(res.data ?? []); })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => { loadAccounts(); }, []);

  async function selectAccount(id: string) {
    if (selectedId === id) { setSelectedId(null); setDetail(null); return; }
    setSelectedId(id);
    setDetailLoading(true);
    setActionMsg('');
    try {
      const res = await adminService.getBusinessDetail(id);
      setDetail(res.data);
    } catch { setDetail(null); }
    setDetailLoading(false);
  }

  async function handleCreate() {
    if (!email.trim()) { setCreateError('Email is required'); return; }
    if (!workspaceName.trim()) { setCreateError('Workspace name is required'); return; }
    setCreating(true);
    setCreateError('');
    setCreateSuccess('');
    try {
      const res = await adminService.createBusinessAccount({
        email: email.trim(),
        workspace_name: workspaceName.trim(),
        plan,
      });
      if (res.data) {
        setCreateSuccess(`Business account created for ${res.data.owner.email} — workspace "${res.data.workspace.name}" (${res.data.workspace.plan})`);
        setEmail('');
        setWorkspaceName('');
        setPlan('trial');
        loadAccounts();
      }
    } catch (err: unknown) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create');
    } finally {
      setCreating(false);
    }
  }

  async function changePlan(id: string, newPlan: string) {
    try {
      await adminService.updateBusiness(id, { plan: newPlan });
      setActionMsg(`Plan changed to ${newPlan}`);
      loadAccounts();
      // Refresh detail
      const res = await adminService.getBusinessDetail(id);
      setDetail(res.data);
    } catch { setActionMsg('Failed to change plan'); }
  }

  async function resetCredits(id: string) {
    try {
      await adminService.updateBusiness(id, { searches_used: 0 });
      setActionMsg('Credits reset to 0 used');
      loadAccounts();
      const res = await adminService.getBusinessDetail(id);
      setDetail(res.data);
    } catch { setActionMsg('Failed to reset credits'); }
  }

  async function addCredits(id: string, amount: number) {
    try {
      await adminService.updateBusiness(id, { add_credits: amount });
      setActionMsg(`Added ${amount} bonus credits`);
      loadAccounts();
      const res = await adminService.getBusinessDetail(id);
      setDetail(res.data);
    } catch { setActionMsg('Failed to add credits'); }
  }

  if (error) return <div className="text-red-600">{error}</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-dark">Business Accounts</h1>
        <button onClick={() => setShowCreate(!showCreate)}
          className={`text-sm font-semibold px-4 py-2 rounded-lg transition-colors ${showCreate ? 'bg-dark/10 text-dark' : 'bg-orange-500 text-white hover:bg-orange-600'}`}>
          {showCreate ? 'Cancel' : '+ Create Business Account'}
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="bg-white rounded-xl border border-dark/10 p-6 mb-6">
          <h2 className="text-lg font-bold text-dark mb-4">Set Up New Business Account</h2>
          <p className="text-sm text-dark/50 mb-4">Enter the email of an existing Homie user to create a business workspace for them.</p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block text-xs font-semibold text-dark/50 mb-1">User Email *</label>
              <input value={email} onChange={e => setEmail(e.target.value)} placeholder="user@email.com" type="email"
                className="w-full px-3 py-2 rounded-lg border border-dark/10 text-sm outline-none focus:border-orange-400" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-dark/50 mb-1">Business Name *</label>
              <input value={workspaceName} onChange={e => setWorkspaceName(e.target.value)} placeholder="Acme Property Management"
                className="w-full px-3 py-2 rounded-lg border border-dark/10 text-sm outline-none focus:border-orange-400" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-dark/50 mb-1">Plan</label>
              <select value={plan} onChange={e => setPlan(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-dark/10 text-sm outline-none cursor-pointer">
                {ALL_PLANS.map(p => <option key={p} value={p}>{PLAN_LABELS[p] ?? p}</option>)}
              </select>
            </div>
          </div>

          {createError && <div className="text-red-600 text-sm mb-3">{createError}</div>}
          {createSuccess && <div className="text-emerald-600 text-sm mb-3 bg-emerald-50 px-3 py-2 rounded-lg">{createSuccess}</div>}

          <button onClick={handleCreate} disabled={creating}
            className="bg-orange-500 text-white text-sm font-semibold px-6 py-2 rounded-lg hover:bg-orange-600 disabled:opacity-50 transition-colors">
            {creating ? 'Creating...' : 'Create Business Account'}
          </button>
        </div>
      )}

      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by business name, owner, or plan..."
        className="w-full px-4 py-2.5 mb-4 rounded-lg border border-dark/10 text-sm outline-none focus:border-orange-400 bg-white" />

      {/* Accounts table */}
      <div className="bg-white rounded-xl border border-dark/10 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-dark/10 bg-warm">
              <th className="text-left px-4 py-3 font-semibold text-dark/60">Business Name</th>
              <th className="text-left px-4 py-3 font-semibold text-dark/60">Owner</th>
              <th className="text-left px-4 py-3 font-semibold text-dark/60">Plan</th>
              <th className="text-left px-4 py-3 font-semibold text-dark/60">Credits</th>
              <th className="text-left px-4 py-3 font-semibold text-dark/60">Created</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-dark/40">Loading...</td></tr>
            ) : (() => {
              const q = search.toLowerCase();
              const filtered = search ? accounts.filter(a =>
                a.name.toLowerCase().includes(q) || (a.ownerName ?? '').toLowerCase().includes(q) || (a.ownerEmail ?? '').toLowerCase().includes(q) || a.plan.toLowerCase().includes(q) || a.slug.toLowerCase().includes(q)
              ) : accounts;
              return filtered.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-dark/40">{search ? 'No matches' : 'No business accounts yet'}</td></tr>
            ) : (
              filtered.map(a => (
                <>
                  <tr key={a.id} onClick={() => selectAccount(a.id)}
                    className={`border-b border-dark/5 cursor-pointer transition-colors ${selectedId === a.id ? 'bg-orange-500/5' : 'hover:bg-warm/50'}`}>
                    <td className="px-4 py-3 font-medium text-dark">{a.name}</td>
                    <td className="px-4 py-3">
                      <div className="text-dark">{a.ownerName}</div>
                      <div className="text-dark/40 text-xs">{a.ownerEmail}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-semibold capitalize ${PLAN_COLORS[a.plan] ?? 'bg-dark/5 text-dark/50'}`}>
                        {a.plan}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-dark/60">
                      <span className={a.searchesUsed >= a.searchesLimit ? 'text-red-600 font-semibold' : ''}>
                        {a.searchesUsed}/{a.searchesLimit}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-dark/50">{new Date(a.createdAt).toLocaleDateString()}</td>
                  </tr>
                  {selectedId === a.id && (
                    <tr key={`${a.id}-detail`}>
                      <td colSpan={5} className="px-0 py-0 bg-warm/30">
                        {detailLoading ? (
                          <div className="px-6 py-8 text-center text-dark/40">Loading details...</div>
                        ) : detail ? (
                          <DetailView detail={detail} onChangePlan={p => changePlan(a.id, p)} onResetCredits={() => resetCredits(a.id)} onAddCredits={n => addCredits(a.id, n)} actionMsg={actionMsg} />
                        ) : (
                          <div className="px-6 py-8 text-center text-dark/40">Failed to load details</div>
                        )}
                      </td>
                    </tr>
                  )}
                </>
              ))
            ); })()}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DetailView({ detail, onChangePlan, onResetCredits, onAddCredits, actionMsg }: {
  detail: BusinessDetail;
  onChangePlan: (plan: string) => void;
  onResetCredits: () => void;
  onAddCredits: (n: number) => void;
  actionMsg: string;
}) {
  const { workspace: ws, members, properties: props, stats } = detail;
  const [newPlan, setNewPlan] = useState(ws.plan);
  const [bonusCredits, setBonusCredits] = useState(5);

  return (
    <div className="px-6 py-5 space-y-5">
      {actionMsg && (
        <div className="bg-emerald-50 text-emerald-700 text-sm px-3 py-2 rounded-lg font-medium">{actionMsg}</div>
      )}

      {/* Owner & Account */}
      <div>
        <h3 className="text-sm font-bold text-dark mb-3">Account Details</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <InfoCard label="Workspace ID" value={ws.id.slice(0, 8)} mono />
          <InfoCard label="Slug" value={ws.slug} mono />
          <InfoCard label="Owner" value={ws.ownerName ?? '-'} />
          <InfoCard label="Email" value={ws.ownerEmail ?? '-'} />
          <InfoCard label="Phone" value={ws.ownerPhone ?? '-'} />
          <InfoCard label="Created" value={new Date(ws.createdAt).toLocaleDateString()} />
          <InfoCard label="Billing Cycle Start" value={new Date(ws.billingCycleStart).toLocaleDateString()} />
        </div>
      </div>

      {/* Plan & Credits */}
      <div>
        <h3 className="text-sm font-bold text-dark mb-3">Plan & Credits</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <div className="bg-white rounded-lg border border-dark/5 px-3 py-2">
            <div className="text-[10px] font-semibold text-dark/40 uppercase tracking-wide">Current Plan</div>
            <span className={`px-2 py-0.5 rounded text-xs font-semibold capitalize mt-1 inline-block ${PLAN_COLORS[ws.plan] ?? 'bg-dark/5 text-dark/50'}`}>{ws.plan}</span>
          </div>
          <InfoCard label="Credits Used" value={`${ws.searchesUsed} / ${ws.searchesLimit}`} />
          <InfoCard label="Remaining" value={String(Math.max(0, ws.searchesLimit - ws.searchesUsed))} />
          <InfoCard label="Usage" value={`${Math.round((ws.searchesUsed / ws.searchesLimit) * 100)}%`} />
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs font-semibold text-dark/50 mb-1">Change Plan</label>
            <div className="flex gap-2">
              <select value={newPlan} onChange={e => setNewPlan(e.target.value)}
                className="px-3 py-1.5 rounded-lg border border-dark/10 text-sm outline-none cursor-pointer">
                {ALL_PLANS.map(p => <option key={p} value={p}>{PLAN_LABELS[p] ?? p}</option>)}
              </select>
              <button onClick={() => onChangePlan(newPlan)} disabled={newPlan === ws.plan}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-500 text-white disabled:opacity-30 transition-colors">
                Apply
              </button>
            </div>
          </div>
          <button onClick={onResetCredits}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-500 text-white hover:bg-amber-600 transition-colors">
            Reset Credits
          </button>
          <div>
            <label className="block text-xs font-semibold text-dark/50 mb-1">Add Bonus Credits</label>
            <div className="flex gap-2">
              <input type="number" min={1} value={bonusCredits} onChange={e => setBonusCredits(+e.target.value || 1)}
                className="w-16 px-2 py-1.5 rounded-lg border border-dark/10 text-sm text-center outline-none" />
              <button onClick={() => onAddCredits(bonusCredits)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500 text-white hover:bg-emerald-600 transition-colors">
                +Add
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Usage Stats */}
      <div>
        <h3 className="text-sm font-bold text-dark mb-3">Usage Stats</h3>
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white rounded-lg border border-dark/5 px-3 py-3 text-center">
            <div className="text-2xl font-bold text-dark">{stats.total_dispatches}</div>
            <div className="text-xs text-dark/40 mt-1">Total Dispatches</div>
          </div>
          <div className="bg-white rounded-lg border border-dark/5 px-3 py-3 text-center">
            <div className="text-2xl font-bold text-emerald-600">{stats.total_responses}</div>
            <div className="text-xs text-dark/40 mt-1">Provider Responses</div>
          </div>
          <div className="bg-white rounded-lg border border-dark/5 px-3 py-3 text-center">
            <div className="text-2xl font-bold text-orange-500">{stats.total_bookings}</div>
            <div className="text-xs text-dark/40 mt-1">Bookings</div>
          </div>
        </div>
      </div>

      {/* Team Members */}
      <div>
        <h3 className="text-sm font-bold text-dark mb-3">Team ({members.length})</h3>
        {members.length === 0 ? (
          <div className="text-sm text-dark/40">No team members</div>
        ) : (
          <div className="bg-white rounded-lg border border-dark/5 overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-dark/3 border-b border-dark/5">
                  <th className="text-left px-3 py-2 font-semibold text-dark/50">Name</th>
                  <th className="text-left px-3 py-2 font-semibold text-dark/50">Email</th>
                  <th className="text-left px-3 py-2 font-semibold text-dark/50">Role</th>
                </tr>
              </thead>
              <tbody>
                {members.map(m => (
                  <tr key={m.id} className="border-b border-dark/3">
                    <td className="px-3 py-2 text-dark font-medium">{m.name}</td>
                    <td className="px-3 py-2 text-dark/60">{m.email}</td>
                    <td className="px-3 py-2 capitalize text-dark/60">{m.role}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Properties */}
      <div>
        <h3 className="text-sm font-bold text-dark mb-3">Properties ({props.length})</h3>
        {props.length === 0 ? (
          <div className="text-sm text-dark/40">No properties</div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {props.map(p => (
              <span key={p.id} className={`px-2.5 py-1 rounded-lg text-xs font-medium ${p.active ? 'bg-emerald-50 text-emerald-700' : 'bg-dark/5 text-dark/40'}`}>
                {p.name}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function InfoCard({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="bg-white rounded-lg border border-dark/5 px-3 py-2">
      <div className="text-[10px] font-semibold text-dark/40 uppercase tracking-wide">{label}</div>
      <div className={`text-sm font-medium text-dark mt-0.5 ${mono ? 'font-mono' : ''}`}>{value}</div>
    </div>
  );
}
