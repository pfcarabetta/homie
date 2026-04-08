import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { usePricing } from '@/hooks/usePricing';
import { businessService, type WorkspaceMember } from '@/services/api';
import { O, G, D, getPlanMemberLimit } from './constants';

const ROLE_OPTIONS = [
  { value: 'admin', label: 'Admin', desc: 'Full access including billing and team management' },
  { value: 'coordinator', label: 'Coordinator', desc: 'Create jobs, manage providers, view reports' },
  { value: 'field_tech', label: 'Field Tech', desc: 'View assigned jobs, update status' },
  { value: 'viewer', label: 'Viewer', desc: 'Read-only access to dashboard' },
];

const ROLE_COLORS: Record<string, { bg: string; text: string }> = {
  admin: { bg: '#FEF3C7', text: '#B45309' },
  coordinator: { bg: '#DBEAFE', text: '#2563EB' },
  field_tech: { bg: '#E0E7FF', text: '#4338CA' },
  viewer: { bg: '#F3F4F6', text: '#6B7280' },
};

/* ── Invite Member Modal ────────────────────────────────────────────────── */

function InviteMemberModal({ workspaceId, onClose, onInvited }: { workspaceId: string; onClose: () => void; onInvited: () => void }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('viewer');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleInvite() {
    if (!email.trim()) { setError('Email is required'); return; }
    setSaving(true);
    setError('');
    try {
      await businessService.inviteMember(workspaceId, { email: email.trim(), role });
      onInvited();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to invite member');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div style={{ background: '#fff', borderRadius: 12, padding: 32, width: '100%', maxWidth: 480, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <h3 style={{ fontFamily: 'Fraunces, serif', fontSize: 22, color: D, margin: '0 0 20px' }}>Invite Team Member</h3>

        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#6B6560', marginBottom: 6 }}>Email Address *</label>
        <input value={email} onChange={e => setEmail(e.target.value)} placeholder="teammate@company.com" type="email"
          style={{ width: '100%', padding: '10px 14px', border: '1px solid #E0DAD4', borderRadius: 8, fontSize: 15, marginBottom: 20, boxSizing: 'border-box' }} />

        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#6B6560', marginBottom: 10 }}>Role</label>
        <div style={{ display: 'grid', gap: 8, marginBottom: 20 }}>
          {ROLE_OPTIONS.map(r => (
            <label key={r.value} style={{
              display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 16px', borderRadius: 8, cursor: 'pointer',
              border: role === r.value ? `2px solid ${O}` : '2px solid #E0DAD4',
              background: role === r.value ? `${O}08` : '#fff',
            }}>
              <input type="radio" name="role" value={r.value} checked={role === r.value} onChange={() => setRole(r.value)}
                style={{ marginTop: 2, accentColor: O }} />
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: D }}>{r.label}</div>
                <div style={{ fontSize: 12, color: '#9B9490', marginTop: 2 }}>{r.desc}</div>
              </div>
            </label>
          ))}
        </div>

        {error && <div style={{ color: '#DC2626', fontSize: 14, marginBottom: 16 }}>{error}</div>}

        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '10px 20px', borderRadius: 8, border: '1px solid #E0DAD4', background: '#fff', cursor: 'pointer', fontSize: 14, color: D }}>Cancel</button>
          <button onClick={handleInvite} disabled={saving}
            style={{ padding: '10px 24px', borderRadius: 8, border: 'none', background: O, color: '#fff', cursor: saving ? 'default' : 'pointer', fontSize: 14, fontWeight: 600, opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Inviting...' : 'Send Invite'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Team Tab ──────────────────────────────────────────────────────────── */

export default function TeamTab({ workspaceId, role, ownerId, plan }: { workspaceId: string; role: string; ownerId: string; plan: string }) {
  const { pricing } = usePricing();
  const { homeowner } = useAuth();
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRole, setEditRole] = useState('');

  const isAdmin = role === 'admin';
  const memberLimit = getPlanMemberLimit(plan, pricing);
  const atLimit = members.length >= memberLimit;

  function loadMembers() {
    businessService.listMembers(workspaceId).then(res => {
      if (res.data) setMembers(res.data);
      setLoading(false);
    }).catch(() => setLoading(false));
  }

  useEffect(() => { loadMembers(); }, [workspaceId]);

  async function handleRoleChange(memberId: string) {
    try {
      await businessService.updateMemberRole(workspaceId, memberId, editRole);
      setEditingId(null);
      loadMembers();
    } catch { /* ignore */ }
  }

  async function handleRemove(memberId: string, memberName: string) {
    if (!confirm(`Remove ${memberName} from this workspace?`)) return;
    try {
      await businessService.removeMember(workspaceId, memberId);
      setMembers(prev => prev.filter(m => m.id !== memberId));
    } catch { /* ignore */ }
  }

  if (loading) return <div style={{ textAlign: 'center', padding: 40, color: '#9B9490' }}>Loading team...</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h3 style={{ fontFamily: 'Fraunces, serif', fontSize: 20, color: D, margin: 0 }}>Team Members</h3>
          <div style={{ fontSize: 13, color: '#9B9490', marginTop: 4 }}>
            {members.length} of {memberLimit === 9999 ? 'unlimited' : memberLimit} {memberLimit === 1 ? 'user' : 'users'} · {plan.charAt(0).toUpperCase() + plan.slice(1)} plan
          </div>
        </div>
        {isAdmin && (
          atLimit ? (
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 13, color: '#DC2626', fontWeight: 600, marginBottom: 4 }}>Team limit reached</div>
              <div style={{ fontSize: 12, color: '#9B9490' }}>Upgrade your plan to add more members</div>
            </div>
          ) : (
            <button onClick={() => setShowInvite(true)}
              style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: O, color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>
              + Invite Member
            </button>
          )
        )}
      </div>

      <div style={{ display: 'grid', gap: 8 }}>
        {members.map(m => {
          const name = [m.firstName, m.lastName].filter(Boolean).join(' ') || m.email;
          const isOwner = m.homeownerId === ownerId;
          const isSelf = m.homeownerId === homeowner?.id;
          const rc = ROLE_COLORS[m.role] || ROLE_COLORS.viewer;

          return (
            <div key={m.id} style={{
              background: '#fff', borderRadius: 10, border: '1px solid #E0DAD4', padding: '16px 20px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{
                  width: 40, height: 40, borderRadius: '50%', background: `${O}15`, color: O,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 16,
                }}>
                  {(m.firstName?.[0] || m.email[0]).toUpperCase()}
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: D }}>
                    {name}
                    {isSelf && <span style={{ fontSize: 12, color: '#9B9490', fontWeight: 400, marginLeft: 8 }}>(you)</span>}
                    {isOwner && <span style={{ fontSize: 12, color: G, fontWeight: 400, marginLeft: 8 }}>Owner</span>}
                  </div>
                  <div style={{ fontSize: 13, color: '#9B9490' }}>{m.email}</div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {editingId === m.id ? (
                  <>
                    <select value={editRole} onChange={e => setEditRole(e.target.value)}
                      style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #E0DAD4', fontSize: 13 }}>
                      {ROLE_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                    </select>
                    <button onClick={() => handleRoleChange(m.id)}
                      style={{ padding: '6px 14px', borderRadius: 6, border: 'none', background: G, color: '#fff', fontSize: 13, cursor: 'pointer' }}>Save</button>
                    <button onClick={() => setEditingId(null)}
                      style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid #E0DAD4', background: '#fff', fontSize: 13, cursor: 'pointer', color: D }}>Cancel</button>
                  </>
                ) : (
                  <>
                    <span style={{ fontSize: 12, padding: '4px 12px', borderRadius: 20, fontWeight: 600, background: rc.bg, color: rc.text }}>
                      {m.role.replace('_', ' ')}
                    </span>
                    {isAdmin && !isOwner && !isSelf && (
                      <>
                        <button onClick={() => { setEditingId(m.id); setEditRole(m.role); }}
                          style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #E0DAD4', background: '#fff', fontSize: 12, cursor: 'pointer', color: '#6B6560' }}>
                          Edit
                        </button>
                        <button onClick={() => handleRemove(m.id, name)}
                          style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #FCA5A5', background: '#FEF2F2', fontSize: 12, cursor: 'pointer', color: '#DC2626' }}>
                          Remove
                        </button>
                      </>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {showInvite && (
        <InviteMemberModal workspaceId={workspaceId} onClose={() => setShowInvite(false)}
          onInvited={() => { setShowInvite(false); loadMembers(); }} />
      )}
    </div>
  );
}
