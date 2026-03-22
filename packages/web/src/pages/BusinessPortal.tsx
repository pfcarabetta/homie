import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { businessService, type Workspace, type WorkspaceDetail, type Property, type WorkspaceMember } from '@/services/api';
import AvatarDropdown from '@/components/AvatarDropdown';

const O = '#E8632B', G = '#1B9E77', D = '#2D2926', W = '#F9F5F2';

const PROPERTY_TYPES: Record<string, string> = {
  residential: 'Residential',
  commercial: 'Commercial',
  vacation_rental: 'Vacation Rental',
  hoa: 'HOA',
  multi_family: 'Multi-Family',
};

/* ── Create Workspace Modal ─────────────────────────────────────────────── */

function CreateWorkspaceModal({ onClose, onCreated }: { onClose: () => void; onCreated: (w: Workspace) => void }) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleCreate() {
    if (!name.trim()) { setError('Name is required'); return; }
    setSaving(true);
    setError('');
    try {
      const res = await businessService.createWorkspace({ name: name.trim(), ...(slug ? { slug } : {}) });
      if (res.data) onCreated(res.data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create workspace');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div style={{ background: '#fff', borderRadius: 12, padding: 32, width: '100%', maxWidth: 440, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <h3 style={{ fontFamily: 'Fraunces, serif', fontSize: 22, color: D, margin: '0 0 20px' }}>Create Workspace</h3>

        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#6B6560', marginBottom: 6 }}>Business Name *</label>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Acme Property Management"
          style={{ width: '100%', padding: '10px 14px', border: '1px solid #E0DAD4', borderRadius: 8, fontSize: 15, marginBottom: 16, boxSizing: 'border-box' }} />

        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#6B6560', marginBottom: 6 }}>Custom Slug (optional)</label>
        <input value={slug} onChange={e => setSlug(e.target.value)} placeholder="acme-pm"
          style={{ width: '100%', padding: '10px 14px', border: '1px solid #E0DAD4', borderRadius: 8, fontSize: 15, marginBottom: 8, boxSizing: 'border-box' }} />
        <div style={{ fontSize: 12, color: '#9B9490', marginBottom: 20 }}>Used in your workspace URL. Auto-generated from name if blank.</div>

        {error && <div style={{ color: '#DC2626', fontSize: 14, marginBottom: 16 }}>{error}</div>}

        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '10px 20px', borderRadius: 8, border: '1px solid #E0DAD4', background: '#fff', cursor: 'pointer', fontSize: 14, color: D }}>Cancel</button>
          <button onClick={handleCreate} disabled={saving}
            style={{ padding: '10px 24px', borderRadius: 8, border: 'none', background: O, color: '#fff', cursor: saving ? 'default' : 'pointer', fontSize: 14, fontWeight: 600, opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Creating...' : 'Create Workspace'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Add Property Modal ─────────────────────────────────────────────────── */

function AddPropertyModal({ workspaceId, onClose, onCreated }: { workspaceId: string; onClose: () => void; onCreated: (p: Property) => void }) {
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zip, setZip] = useState('');
  const [propType, setPropType] = useState('residential');
  const [unitCount, setUnitCount] = useState(1);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleCreate() {
    if (!name.trim()) { setError('Property name is required'); return; }
    setSaving(true);
    setError('');
    try {
      const res = await businessService.createProperty(workspaceId, {
        name: name.trim(),
        ...(address ? { address } : {}),
        ...(city ? { city } : {}),
        ...(state ? { state } : {}),
        ...(zip ? { zip_code: zip } : {}),
        property_type: propType,
        unit_count: unitCount,
        ...(notes ? { notes } : {}),
      });
      if (res.data) onCreated(res.data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create property');
    } finally {
      setSaving(false);
    }
  }

  const inputStyle = { width: '100%', padding: '10px 14px', border: '1px solid #E0DAD4', borderRadius: 8, fontSize: 15, marginBottom: 16, boxSizing: 'border-box' as const };
  const labelStyle = { display: 'block' as const, fontSize: 13, fontWeight: 600, color: '#6B6560', marginBottom: 6 };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div style={{ background: '#fff', borderRadius: 12, padding: 32, width: '100%', maxWidth: 520, maxHeight: '90vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <h3 style={{ fontFamily: 'Fraunces, serif', fontSize: 22, color: D, margin: '0 0 20px' }}>Add Property</h3>

        <label style={labelStyle}>Property Name *</label>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="123 Main Street" style={inputStyle} />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={labelStyle}>Property Type</label>
            <select value={propType} onChange={e => setPropType(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
              {Object.entries(PROPERTY_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Unit Count</label>
            <input type="number" min={1} value={unitCount} onChange={e => setUnitCount(+e.target.value || 1)} style={inputStyle} />
          </div>
        </div>

        <label style={labelStyle}>Street Address</label>
        <input value={address} onChange={e => setAddress(e.target.value)} placeholder="123 Main St" style={inputStyle} />

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 12 }}>
          <div>
            <label style={labelStyle}>City</label>
            <input value={city} onChange={e => setCity(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>State</label>
            <input value={state} onChange={e => setState(e.target.value)} maxLength={2} placeholder="CA" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>ZIP</label>
            <input value={zip} onChange={e => setZip(e.target.value)} maxLength={10} style={inputStyle} />
          </div>
        </div>

        <label style={labelStyle}>Notes</label>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="Gate code, access instructions, etc."
          style={{ ...inputStyle, resize: 'vertical' as const }} />

        {error && <div style={{ color: '#DC2626', fontSize: 14, marginBottom: 16 }}>{error}</div>}

        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '10px 20px', borderRadius: 8, border: '1px solid #E0DAD4', background: '#fff', cursor: 'pointer', fontSize: 14, color: D }}>Cancel</button>
          <button onClick={handleCreate} disabled={saving}
            style={{ padding: '10px 24px', borderRadius: 8, border: 'none', background: O, color: '#fff', cursor: saving ? 'default' : 'pointer', fontSize: 14, fontWeight: 600, opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Adding...' : 'Add Property'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Properties Tab ─────────────────────────────────────────────────────── */

function PropertiesTab({ workspaceId, role }: { workspaceId: string; role: string }) {
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);

  useEffect(() => {
    businessService.listProperties(workspaceId).then(res => {
      if (res.data) setProperties(res.data);
      setLoading(false);
    });
  }, [workspaceId]);

  const canEdit = role === 'admin' || role === 'coordinator';

  if (loading) return <div style={{ textAlign: 'center', padding: 40, color: '#9B9490' }}>Loading properties...</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h3 style={{ fontFamily: 'Fraunces, serif', fontSize: 20, color: D, margin: 0 }}>Properties</h3>
        {canEdit && (
          <button onClick={() => setShowAdd(true)}
            style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: O, color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>
            + Add Property
          </button>
        )}
      </div>

      {properties.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', background: '#FAFAF8', borderRadius: 12, border: '1px dashed #E0DAD4' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🏠</div>
          <div style={{ fontSize: 16, color: D, fontWeight: 600, marginBottom: 8 }}>No properties yet</div>
          <div style={{ fontSize: 14, color: '#9B9490' }}>Add your first property to start managing maintenance.</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {properties.map(p => (
            <div key={p.id} style={{
              background: '#fff', borderRadius: 12, border: '1px solid #E0DAD4', padding: 20,
              opacity: p.active ? 1 : 0.5,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 600, color: D }}>{p.name}</div>
                  {p.address && (
                    <div style={{ fontSize: 14, color: '#6B6560', marginTop: 4 }}>
                      {p.address}{p.city ? `, ${p.city}` : ''}{p.state ? `, ${p.state}` : ''} {p.zipCode || ''}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{
                    fontSize: 12, padding: '4px 10px', borderRadius: 20, fontWeight: 600,
                    background: p.active ? '#F0FDF4' : '#F5F5F5',
                    color: p.active ? '#16A34A' : '#9B9490',
                  }}>
                    {p.active ? 'Active' : 'Inactive'}
                  </span>
                  <span style={{
                    fontSize: 12, padding: '4px 10px', borderRadius: 20,
                    background: '#EFF6FF', color: '#2563EB', fontWeight: 500,
                  }}>
                    {PROPERTY_TYPES[p.propertyType] || p.propertyType}
                  </span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 20, marginTop: 12, fontSize: 13, color: '#9B9490' }}>
                <span>{p.unitCount} {p.unitCount === 1 ? 'unit' : 'units'}</span>
                <span>Added {new Date(p.createdAt).toLocaleDateString()}</span>
              </div>
              {p.notes && <div style={{ fontSize: 13, color: '#6B6560', marginTop: 8, fontStyle: 'italic' }}>{p.notes}</div>}
            </div>
          ))}
        </div>
      )}

      {showAdd && (
        <AddPropertyModal workspaceId={workspaceId} onClose={() => setShowAdd(false)}
          onCreated={p => { setProperties(prev => [p, ...prev]); setShowAdd(false); }} />
      )}
    </div>
  );
}

/* ── Overview Tab ───────────────────────────────────────────────────────── */

function OverviewTab({ workspace }: { workspace: WorkspaceDetail }) {
  const stats = [
    { label: 'Properties', value: workspace.property_count, icon: '🏠' },
    { label: 'Team Members', value: workspace.member_count, icon: '👥' },
    { label: 'Plan', value: workspace.plan.charAt(0).toUpperCase() + workspace.plan.slice(1), icon: '📋' },
    { label: 'Your Role', value: workspace.user_role.charAt(0).toUpperCase() + workspace.user_role.slice(1), icon: '🔑' },
  ];

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 32 }}>
        {stats.map(s => (
          <div key={s.label} style={{ background: '#fff', borderRadius: 12, border: '1px solid #E0DAD4', padding: 20, textAlign: 'center' }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>{s.icon}</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: D }}>{s.value}</div>
            <div style={{ fontSize: 13, color: '#9B9490', marginTop: 4 }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E0DAD4', padding: 24 }}>
        <h4 style={{ fontFamily: 'Fraunces, serif', fontSize: 18, color: D, margin: '0 0 16px' }}>Workspace Details</h4>
        <div style={{ display: 'grid', gap: 12, fontSize: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#6B6560' }}>Workspace ID</span>
            <span style={{ color: D, fontFamily: 'DM Mono, monospace', fontSize: 12 }}>{workspace.id}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#6B6560' }}>Slug</span>
            <span style={{ color: D }}>{workspace.slug}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#6B6560' }}>Created</span>
            <span style={{ color: D }}>{new Date(workspace.createdAt).toLocaleDateString()}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Invite Member Modal ────────────────────────────────────────────────── */

const ROLE_OPTIONS = [
  { value: 'admin', label: 'Admin', desc: 'Full access including billing and team management' },
  { value: 'coordinator', label: 'Coordinator', desc: 'Create jobs, manage vendors, view reports' },
  { value: 'field_tech', label: 'Field Tech', desc: 'View assigned jobs, update status' },
  { value: 'viewer', label: 'Viewer', desc: 'Read-only access to dashboard' },
];

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

const ROLE_COLORS: Record<string, { bg: string; text: string }> = {
  admin: { bg: '#FEF3C7', text: '#B45309' },
  coordinator: { bg: '#DBEAFE', text: '#2563EB' },
  field_tech: { bg: '#E0E7FF', text: '#4338CA' },
  viewer: { bg: '#F3F4F6', text: '#6B7280' },
};

function TeamTab({ workspaceId, role, ownerId }: { workspaceId: string; role: string; ownerId: string }) {
  const { homeowner } = useAuth();
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRole, setEditRole] = useState('');

  const isAdmin = role === 'admin';

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
        <h3 style={{ fontFamily: 'Fraunces, serif', fontSize: 20, color: D, margin: 0 }}>Team Members</h3>
        {isAdmin && (
          <button onClick={() => setShowInvite(true)}
            style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: O, color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>
            + Invite Member
          </button>
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

/* ── Settings Tab ──────────────────────────────────────────────────────── */

function SettingsTab({ workspace, onUpdated }: { workspace: WorkspaceDetail; onUpdated: (w: WorkspaceDetail) => void }) {
  const [name, setName] = useState(workspace.name);
  const [slug, setSlug] = useState(workspace.slug);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  async function handleSave() {
    setSaving(true);
    setMsg(null);
    const updates: Record<string, string> = {};
    if (name !== workspace.name) updates.name = name;
    if (slug !== workspace.slug) updates.slug = slug;
    if (Object.keys(updates).length === 0) { setMsg({ type: 'error', text: 'No changes' }); setSaving(false); return; }

    try {
      const res = await businessService.updateWorkspace(workspace.id, updates);
      if (res.data) {
        onUpdated({ ...workspace, ...res.data });
        setMsg({ type: 'success', text: 'Workspace updated' });
      }
    } catch (err: unknown) {
      setMsg({ type: 'error', text: err instanceof Error ? err.message : 'Failed to update' });
    } finally {
      setSaving(false);
    }
  }

  const inputStyle = { width: '100%', padding: '10px 14px', border: '1px solid #E0DAD4', borderRadius: 8, fontSize: 15, marginBottom: 16, boxSizing: 'border-box' as const };

  return (
    <div style={{ maxWidth: 480 }}>
      <h3 style={{ fontFamily: 'Fraunces, serif', fontSize: 20, color: D, margin: '0 0 20px' }}>Workspace Settings</h3>

      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E0DAD4', padding: 24 }}>
        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#6B6560', marginBottom: 6 }}>Workspace Name</label>
        <input value={name} onChange={e => setName(e.target.value)} style={inputStyle} />

        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#6B6560', marginBottom: 6 }}>Slug</label>
        <input value={slug} onChange={e => setSlug(e.target.value)} style={inputStyle} />

        {msg && (
          <div style={{ fontSize: 14, marginBottom: 16, color: msg.type === 'success' ? G : '#DC2626' }}>{msg.text}</div>
        )}

        <button onClick={handleSave} disabled={saving}
          style={{ padding: '10px 24px', borderRadius: 8, border: 'none', background: O, color: '#fff', cursor: saving ? 'default' : 'pointer', fontSize: 14, fontWeight: 600, opacity: saving ? 0.7 : 1 }}>
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
}

/* ── Main Page ──────────────────────────────────────────────────────────── */

const TABS = ['overview', 'properties', 'team', 'settings'] as const;
type Tab = typeof TABS[number];
const TAB_LABELS: Record<Tab, string> = { overview: 'Overview', properties: 'Properties', team: 'Team', settings: 'Settings' };

export default function BusinessPortal() {
  const { homeowner } = useAuth();
  const navigate = useNavigate();

  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [workspace, setWorkspace] = useState<WorkspaceDetail | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    if (!homeowner) { navigate('/login?redirect=/business'); return; }
    businessService.listWorkspaces().then(res => {
      if (res.data) {
        setWorkspaces(res.data);
        if (res.data.length > 0) setSelectedId(res.data[0].id);
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [homeowner, navigate]);

  useEffect(() => {
    if (!selectedId) { setWorkspace(null); return; }
    businessService.getWorkspace(selectedId).then(res => {
      if (res.data) setWorkspace(res.data);
    });
  }, [selectedId]);

  if (!homeowner) return null;

  return (
    <div style={{ minHeight: '100vh', background: W }}>
      {/* Header */}
      <header style={{ background: '#fff', borderBottom: '1px solid #E0DAD4', padding: '0 24px', height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span onClick={() => navigate('/')} style={{ fontFamily: 'Fraunces, serif', fontSize: 22, fontWeight: 700, color: O, cursor: 'pointer' }}>Homie</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: G, background: `${G}15`, padding: '4px 10px', borderRadius: 20 }}>Business</span>
        </div>
        <AvatarDropdown />
      </header>

      <div style={{ maxWidth: 960, margin: '0 auto', padding: '32px 24px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#9B9490' }}>Loading workspaces...</div>
        ) : workspaces.length === 0 ? (
          /* Empty state — no workspaces */
          <div style={{ textAlign: 'center', padding: '80px 20px' }}>
            <div style={{ fontSize: 56, marginBottom: 16 }}>🏢</div>
            <h2 style={{ fontFamily: 'Fraunces, serif', fontSize: 28, color: D, marginBottom: 12 }}>Welcome to Homie for Business</h2>
            <p style={{ fontSize: 16, color: '#6B6560', maxWidth: 480, margin: '0 auto 32px', lineHeight: 1.6 }}>
              Manage maintenance across all your properties with one dashboard. Create your first workspace to get started.
            </p>
            <button onClick={() => setShowCreate(true)}
              style={{ padding: '14px 32px', borderRadius: 10, border: 'none', background: O, color: '#fff', fontSize: 16, fontWeight: 600, cursor: 'pointer' }}>
              Create Your First Workspace
            </button>
          </div>
        ) : (
          <>
            {/* Workspace selector */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <select value={selectedId || ''} onChange={e => { setSelectedId(e.target.value); setTab('overview'); }}
                  style={{ fontFamily: 'Fraunces, serif', fontSize: 20, fontWeight: 600, color: D, border: 'none', background: 'transparent', cursor: 'pointer', padding: '4px 8px' }}>
                  {workspaces.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
                {workspace && (
                  <span style={{ fontSize: 12, padding: '4px 10px', borderRadius: 20, background: `${G}15`, color: G, fontWeight: 600 }}>
                    {workspace.plan}
                  </span>
                )}
              </div>
              <button onClick={() => setShowCreate(true)}
                style={{ padding: '8px 20px', borderRadius: 8, border: '1px solid #E0DAD4', background: '#fff', cursor: 'pointer', fontSize: 14, color: D, fontWeight: 500 }}>
                + New Workspace
              </button>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid #E0DAD4', marginBottom: 24 }}>
              {TABS.filter(t => t !== 'settings' || workspace?.user_role === 'admin').map(t => (
                <button key={t} onClick={() => setTab(t)}
                  style={{
                    padding: '12px 24px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 600,
                    color: tab === t ? O : '#9B9490',
                    borderBottom: tab === t ? `2px solid ${O}` : '2px solid transparent',
                    marginBottom: -1,
                  }}>
                  {TAB_LABELS[t]}
                </button>
              ))}
            </div>

            {/* Tab content */}
            {workspace && tab === 'overview' && <OverviewTab workspace={workspace} />}
            {workspace && tab === 'properties' && (
              <PropertiesTab workspaceId={workspace.id} role={workspace.user_role} />
            )}
            {workspace && tab === 'team' && (
              <TeamTab workspaceId={workspace.id} role={workspace.user_role} ownerId={workspace.ownerId || ''} />
            )}
            {workspace && tab === 'settings' && workspace.user_role === 'admin' && (
              <SettingsTab workspace={workspace} onUpdated={w => { setWorkspace(w); }} />
            )}
          </>
        )}
      </div>

      {showCreate && (
        <CreateWorkspaceModal onClose={() => setShowCreate(false)}
          onCreated={w => {
            setWorkspaces(prev => [w, ...prev]);
            setSelectedId(w.id);
            setShowCreate(false);
          }} />
      )}
    </div>
  );
}
