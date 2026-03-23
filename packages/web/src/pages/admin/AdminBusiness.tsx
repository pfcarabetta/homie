import { useEffect, useState } from 'react';
import { adminService } from '@/services/admin-api';

interface BusinessAccount {
  id: string;
  name: string;
  slug: string;
  plan: string;
  ownerEmail: string | null;
  ownerName: string | null;
  createdAt: string;
}

const PLANS = ['starter', 'professional', 'business', 'enterprise'];

const PLAN_COLORS: Record<string, string> = {
  starter: 'bg-gray-100 text-gray-600',
  professional: 'bg-blue-100 text-blue-700',
  business: 'bg-purple-100 text-purple-700',
  enterprise: 'bg-amber-100 text-amber-700',
};

export default function AdminBusiness() {
  const [accounts, setAccounts] = useState<BusinessAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Create form
  const [email, setEmail] = useState('');
  const [workspaceName, setWorkspaceName] = useState('');
  const [plan, setPlan] = useState('starter');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [createSuccess, setCreateSuccess] = useState('');

  function loadAccounts() {
    adminService.getBusinessAccounts()
      .then(res => { setAccounts(res.data ?? []); })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => { loadAccounts(); }, []);

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
        setPlan('starter');
        loadAccounts();
      }
    } catch (err: unknown) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create');
    } finally {
      setCreating(false);
    }
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
                className="w-full px-3 py-2 rounded-lg border border-dark/10 text-sm outline-none cursor-pointer capitalize">
                {PLANS.map(p => <option key={p} value={p}>{p}</option>)}
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

      {/* Accounts table */}
      <div className="bg-white rounded-xl border border-dark/10 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-dark/10 bg-warm">
              <th className="text-left px-4 py-3 font-semibold text-dark/60">Business Name</th>
              <th className="text-left px-4 py-3 font-semibold text-dark/60">Owner</th>
              <th className="text-left px-4 py-3 font-semibold text-dark/60">Plan</th>
              <th className="text-left px-4 py-3 font-semibold text-dark/60">Slug</th>
              <th className="text-left px-4 py-3 font-semibold text-dark/60">Created</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-dark/40">Loading...</td></tr>
            ) : accounts.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-dark/40">No business accounts yet</td></tr>
            ) : (
              accounts.map(a => (
                <tr key={a.id} className="border-b border-dark/5 hover:bg-warm/50 transition-colors">
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
                  <td className="px-4 py-3 text-dark/50 font-mono text-xs">{a.slug}</td>
                  <td className="px-4 py-3 text-dark/50">{new Date(a.createdAt).toLocaleDateString()}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
