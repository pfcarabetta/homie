import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { businessService, jobService, type Workspace, type WorkspaceDetail, type Property, type WorkspaceMember, type PreferredVendor, type ProviderSearchResult, type WorkspaceDispatch, type ProviderResponseItem } from '@/services/api';
import AvatarDropdown from '@/components/AvatarDropdown';

const O = '#E8632B', G = '#1B9E77', D = '#2D2926', W = '#F9F5F2';

function renderBold(text: string) {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return parts.map((part, i) =>
    i % 2 === 1 ? <strong key={i}>{part}</strong> : part
  );
}

const VENDOR_CATEGORIES: { value: string; label: string }[] = [
  { value: 'plumbing', label: 'Plumbing' },
  { value: 'electrical', label: 'Electrical' },
  { value: 'hvac', label: 'HVAC' },
  { value: 'appliance', label: 'Appliance' },
  { value: 'roofing', label: 'Roofing' },
  { value: 'general', label: 'General Contractor' },
  { value: 'pest_control', label: 'Pest Control' },
  { value: 'landscaping', label: 'Landscaping' },
  { value: 'cleaning', label: 'Cleaning' },
  { value: 'pool', label: 'Pool / Hot Tub' },
  { value: 'painting', label: 'Painting' },
  { value: 'locksmith', label: 'Locksmith' },
  { value: 'handyman', label: 'Handyman' },
  { value: 'flooring', label: 'Flooring' },
  { value: 'tree_trimming', label: 'Tree Trimming' },
  { value: 'garage_door', label: 'Garage Door' },
  { value: 'fence', label: 'Fencing' },
  { value: 'concrete', label: 'Concrete' },
  { value: 'window_cleaning', label: 'Window Cleaning' },
  { value: 'carpet_cleaning', label: 'Carpet Cleaning' },
  { value: 'pressure_washing', label: 'Pressure Washing' },
  { value: 'gutter', label: 'Gutter Cleaning' },
  { value: 'moving', label: 'Moving' },
  { value: 'masonry', label: 'Masonry' },
  { value: 'siding', label: 'Siding' },
];

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

/* ── Add Vendor Modal ──────────────────────────────────────────────────── */

function AddVendorModal({ workspaceId, onClose, onAdded }: { workspaceId: string; onClose: () => void; onAdded: () => void }) {
  const [mode, setMode] = useState<'search' | 'create'>('search');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ProviderSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<ProviderSearchResult | null>(null);

  // Shared fields
  const [selectedCats, setSelectedCats] = useState<string[]>([]);
  const [priority, setPriority] = useState(1);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Create-new fields
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newEmail, setNewEmail] = useState('');

  useEffect(() => {
    if (mode !== 'search' || query.length < 2) { setResults([]); return; }
    const timer = setTimeout(() => {
      setSearching(true);
      businessService.searchProviders(workspaceId, query).then(res => {
        if (res.data) setResults(res.data);
        setSearching(false);
      }).catch(() => setSearching(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [query, workspaceId, mode]);

  async function handleAdd() {
    setSaving(true);
    setError('');
    try {
      if (mode === 'create') {
        if (!newName.trim()) { setError('Name is required'); setSaving(false); return; }
        if (!newPhone.trim() && !newEmail.trim()) { setError('Phone or email is required'); setSaving(false); return; }
        await businessService.createVendor(workspaceId, {
          name: newName.trim(),
          phone: newPhone.trim() || undefined,
          email: newEmail.trim() || undefined,
          categories: selectedCats.length > 0 ? selectedCats : undefined,
          priority,
          notes: notes || undefined,
        });
      } else {
        if (!selectedProvider) { setError('Select a provider first'); setSaving(false); return; }
        await businessService.addVendor(workspaceId, {
          provider_id: selectedProvider.id,
          categories: selectedCats.length > 0 ? selectedCats : undefined,
          priority,
          notes: notes || undefined,
        });
      }
      onAdded();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to add vendor');
    } finally {
      setSaving(false);
    }
  }

  const inputStyle = { width: '100%', padding: '10px 14px', border: '1px solid #E0DAD4', borderRadius: 8, fontSize: 15, marginBottom: 16, boxSizing: 'border-box' as const };
  const labelStyle = { display: 'block' as const, fontSize: 13, fontWeight: 600, color: '#6B6560', marginBottom: 6 };

  const showDetails = mode === 'create' || selectedProvider;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div style={{ background: '#fff', borderRadius: 12, padding: 32, width: '100%', maxWidth: 520, maxHeight: '90vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <h3 style={{ fontFamily: 'Fraunces, serif', fontSize: 22, color: D, margin: '0 0 20px' }}>Add Preferred Vendor</h3>

        {/* Mode toggle */}
        <div style={{ display: 'flex', gap: 0, marginBottom: 20, borderRadius: 8, overflow: 'hidden', border: '1px solid #E0DAD4' }}>
          <button onClick={() => { setMode('search'); setSelectedProvider(null); }}
            style={{ flex: 1, padding: '10px 0', border: 'none', fontSize: 14, fontWeight: 600, cursor: 'pointer',
              background: mode === 'search' ? O : '#fff', color: mode === 'search' ? '#fff' : '#6B6560' }}>
            Search Existing
          </button>
          <button onClick={() => { setMode('create'); setSelectedProvider(null); }}
            style={{ flex: 1, padding: '10px 0', border: 'none', fontSize: 14, fontWeight: 600, cursor: 'pointer',
              background: mode === 'create' ? O : '#fff', color: mode === 'create' ? '#fff' : '#6B6560' }}>
            Add New
          </button>
        </div>

        {mode === 'search' && !selectedProvider && (
          <>
            <label style={labelStyle}>Search Providers</label>
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Type provider name..."
              style={{ ...inputStyle, marginBottom: 8 }} />
            {searching && <div style={{ fontSize: 13, color: '#9B9490', marginBottom: 8 }}>Searching...</div>}

            <div style={{ maxHeight: 300, overflow: 'auto' }}>
              {results.map(p => (
                <div key={p.id} onClick={() => setSelectedProvider(p)}
                  style={{ padding: '12px 16px', borderRadius: 8, border: '1px solid #E0DAD4', marginBottom: 6, cursor: 'pointer', background: '#fff' }}
                  onMouseOver={e => (e.currentTarget.style.background = '#FAFAF8')}
                  onMouseOut={e => (e.currentTarget.style.background = '#fff')}>
                  <div style={{ fontSize: 15, fontWeight: 600, color: D }}>{p.name}</div>
                  <div style={{ fontSize: 13, color: '#9B9490', marginTop: 4, display: 'flex', gap: 12 }}>
                    {p.googleRating && <span>Rating: {p.googleRating} ({p.reviewCount})</span>}
                    {p.phone && <span>{p.phone}</span>}
                  </div>
                  {p.categories && <div style={{ fontSize: 12, color: '#6B6560', marginTop: 4 }}>{p.categories.join(', ')}</div>}
                </div>
              ))}
              {query.length >= 2 && !searching && results.length === 0 && (
                <div style={{ textAlign: 'center', padding: 20, color: '#9B9490', fontSize: 14 }}>
                  No providers found. <button onClick={() => { setMode('create'); setNewName(query); }}
                    style={{ background: 'none', border: 'none', color: O, fontWeight: 600, cursor: 'pointer', fontSize: 14 }}>
                    Create new vendor
                  </button>
                </div>
              )}
            </div>
          </>
        )}

        {mode === 'search' && selectedProvider && (
          <div style={{ padding: '12px 16px', borderRadius: 8, border: `2px solid ${O}`, background: `${O}08`, marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 600, color: D }}>{selectedProvider.name}</div>
                <div style={{ fontSize: 13, color: '#9B9490', marginTop: 2 }}>
                  {selectedProvider.phone || selectedProvider.email || 'No contact info'}
                </div>
              </div>
              <button onClick={() => setSelectedProvider(null)}
                style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid #E0DAD4', background: '#fff', fontSize: 12, cursor: 'pointer', color: '#6B6560' }}>
                Change
              </button>
            </div>
          </div>
        )}

        {mode === 'create' && (
          <>
            <label style={labelStyle}>Vendor Name *</label>
            <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="ABC Plumbing" style={inputStyle} />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={labelStyle}>Phone</label>
                <input value={newPhone} onChange={e => setNewPhone(e.target.value)} placeholder="(555) 123-4567" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Email</label>
                <input value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="info@vendor.com" type="email" style={inputStyle} />
              </div>
            </div>
          </>
        )}

        {showDetails && (
          <>
            <label style={labelStyle}>Categories</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
              {VENDOR_CATEGORIES.map(c => {
                const active = selectedCats.includes(c.value);
                return (
                  <button key={c.value} type="button"
                    onClick={() => setSelectedCats(prev => active ? prev.filter(x => x !== c.value) : [...prev, c.value])}
                    style={{
                      padding: '6px 14px', borderRadius: 20, fontSize: 13, fontWeight: 500, cursor: 'pointer',
                      border: active ? `2px solid ${O}` : '1px solid #E0DAD4',
                      background: active ? `${O}12` : '#fff',
                      color: active ? O : '#6B6560',
                    }}>
                    {c.label}
                  </button>
                );
              })}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              <div>
                <label style={labelStyle}>Priority</label>
                <select value={priority} onChange={e => setPriority(+e.target.value)}
                  style={{ ...inputStyle, cursor: 'pointer', marginBottom: 0 }}>
                  <option value={1}>1 — First choice</option>
                  <option value={2}>2 — Backup</option>
                  <option value={3}>3 — Third option</option>
                </select>
              </div>
            </div>

            <label style={labelStyle}>Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Agreed rate, specialties, etc."
              style={{ ...inputStyle, resize: 'vertical' as const }} />
          </>
        )}

        {error && <div style={{ color: '#DC2626', fontSize: 14, marginBottom: 16 }}>{error}</div>}

        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '10px 20px', borderRadius: 8, border: '1px solid #E0DAD4', background: '#fff', cursor: 'pointer', fontSize: 14, color: D }}>Cancel</button>
          {showDetails && (
            <button onClick={handleAdd} disabled={saving}
              style={{ padding: '10px 24px', borderRadius: 8, border: 'none', background: O, color: '#fff', cursor: saving ? 'default' : 'pointer', fontSize: 14, fontWeight: 600, opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Adding...' : mode === 'create' ? 'Create & Add' : 'Add Vendor'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Vendors Tab ──────────────────────────────────────────────────────── */

function VendorsTab({ workspaceId, role }: { workspaceId: string; role: string }) {
  const [vendors, setVendors] = useState<PreferredVendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);

  const canEdit = role === 'admin' || role === 'coordinator';

  function loadVendors() {
    businessService.listVendors(workspaceId).then(res => {
      if (res.data) setVendors(res.data);
      setLoading(false);
    }).catch(() => setLoading(false));
  }

  useEffect(() => { loadVendors(); }, [workspaceId]);

  async function handleRemove(vendorId: string, name: string) {
    if (!confirm(`Remove ${name} from preferred vendors?`)) return;
    try {
      await businessService.removeVendor(workspaceId, vendorId);
      setVendors(prev => prev.filter(v => v.id !== vendorId));
    } catch { /* ignore */ }
  }

  if (loading) return <div style={{ textAlign: 'center', padding: 40, color: '#9B9490' }}>Loading vendors...</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h3 style={{ fontFamily: 'Fraunces, serif', fontSize: 20, color: D, margin: 0 }}>Preferred Vendors</h3>
        {canEdit && (
          <button onClick={() => setShowAdd(true)}
            style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: O, color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>
            + Add Vendor
          </button>
        )}
      </div>

      <div style={{ fontSize: 13, color: '#9B9490', marginBottom: 20, lineHeight: 1.5 }}>
        Preferred vendors are contacted first when jobs are dispatched. If they decline or don't respond, backup vendors are tried before falling back to marketplace discovery.
      </div>

      {vendors.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', background: '#FAFAF8', borderRadius: 12, border: '1px dashed #E0DAD4' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🤝</div>
          <div style={{ fontSize: 16, color: D, fontWeight: 600, marginBottom: 8 }}>No preferred vendors yet</div>
          <div style={{ fontSize: 14, color: '#9B9490' }}>Add vendors you trust to get priority dispatch on your jobs.</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {vendors.map(v => (
            <div key={v.id} style={{ background: '#fff', borderRadius: 10, border: '1px solid #E0DAD4', padding: '16px 20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 16, fontWeight: 600, color: D }}>{v.providerName}</span>
                    <span style={{
                      fontSize: 11, padding: '2px 8px', borderRadius: 12, fontWeight: 600,
                      background: v.priority === 1 ? '#FEF3C7' : v.priority === 2 ? '#DBEAFE' : '#F3F4F6',
                      color: v.priority === 1 ? '#B45309' : v.priority === 2 ? '#2563EB' : '#6B7280',
                    }}>
                      Priority {v.priority}
                    </span>
                  </div>
                  <div style={{ fontSize: 13, color: '#9B9490', marginTop: 4, display: 'flex', gap: 16 }}>
                    {v.providerPhone && <span>{v.providerPhone}</span>}
                    {v.providerEmail && <span>{v.providerEmail}</span>}
                    {v.providerRating && <span>Rating: {v.providerRating} ({v.providerReviewCount})</span>}
                  </div>
                  {v.categories && v.categories.length > 0 && (
                    <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                      {v.categories.map(c => (
                        <span key={c} style={{ fontSize: 11, padding: '3px 10px', borderRadius: 12, background: `${G}15`, color: G, fontWeight: 500 }}>{c}</span>
                      ))}
                    </div>
                  )}
                  {v.notes && <div style={{ fontSize: 13, color: '#6B6560', marginTop: 6, fontStyle: 'italic' }}>{v.notes}</div>}
                </div>
                {canEdit && (
                  <button onClick={() => handleRemove(v.id, v.providerName)}
                    style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #FCA5A5', background: '#FEF2F2', fontSize: 12, cursor: 'pointer', color: '#DC2626', flexShrink: 0 }}>
                    Remove
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {showAdd && (
        <AddVendorModal workspaceId={workspaceId} onClose={() => setShowAdd(false)}
          onAdded={() => { setShowAdd(false); loadVendors(); }} />
      )}
    </div>
  );
}

/* ── Dispatches Tab ────────────────────────────────────────────────────── */

const DISPATCH_STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  open: { bg: '#EFF6FF', text: '#2563EB' },
  dispatching: { bg: '#FFF7ED', text: '#C2410C' },
  collecting: { bg: '#F5F3FF', text: '#7C3AED' },
  completed: { bg: '#F0FDF4', text: '#16A34A' },
  expired: { bg: '#F5F5F5', text: '#9B9490' },
  refunded: { bg: '#FEF2F2', text: '#DC2626' },
};

const DISPATCH_STATUS_MESSAGES: Record<string, { icon: string; label: string; desc: string }> = {
  open: { icon: '📋', label: 'Open', desc: 'Dispatch request has been created' },
  dispatching: { icon: '🚀', label: 'Searching', desc: 'AI agent is finding and contacting providers' },
  collecting: { icon: '📡', label: 'Collecting Quotes', desc: 'Providers are being contacted — quotes will appear as they respond' },
  completed: { icon: '✅', label: 'Complete', desc: 'Outreach is complete — quotes are ready' },
  expired: { icon: '⏰', label: 'Expired', desc: 'This dispatch request has expired' },
  refunded: { icon: '💰', label: 'Refunded', desc: 'Payment has been refunded' },
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

function DispatchesTab({ workspaceId }: { workspaceId: string }) {
  const navigate = useNavigate();
  const [dispatches, setDispatches] = useState<WorkspaceDispatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [responses, setResponses] = useState<Record<string, ProviderResponseItem[]>>({});
  const [loadingResponses, setLoadingResponses] = useState<string | null>(null);

  useEffect(() => {
    businessService.listDispatches(workspaceId).then(res => {
      if (res.data) setDispatches(res.data);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [workspaceId]);

  async function toggleExpand(jobId: string) {
    if (expandedId === jobId) { setExpandedId(null); return; }
    setExpandedId(jobId);
    if (!responses[jobId]) {
      setLoadingResponses(jobId);
      try {
        const res = await jobService.getResponses(jobId);
        setResponses(prev => ({ ...prev, [jobId]: res.data?.responses ?? [] }));
      } catch { setResponses(prev => ({ ...prev, [jobId]: [] })); }
      setLoadingResponses(null);
    }
  }

  if (loading) return <div style={{ textAlign: 'center', padding: 40, color: '#9B9490' }}>Loading dispatches...</div>;

  if (dispatches.length === 0) return (
    <div style={{ textAlign: 'center', padding: '60px 20px', background: '#FAFAF8', borderRadius: 12, border: '1px dashed #E0DAD4' }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>🚀</div>
      <div style={{ fontSize: 16, color: D, fontWeight: 600, marginBottom: 8 }}>No dispatches yet</div>
      <div style={{ fontSize: 14, color: '#9B9490', marginBottom: 20 }}>Dispatch requests from the chat will appear here.</div>
      <button onClick={() => navigate(`/business/chat?workspace=${workspaceId}`)}
        style={{ padding: '10px 24px', borderRadius: 100, border: 'none', background: O, color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
        New Dispatch
      </button>
    </div>
  );

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h3 style={{ fontFamily: 'Fraunces, serif', fontSize: 20, color: D, margin: 0 }}>Dispatches</h3>
        <button onClick={() => navigate(`/business/chat?workspace=${workspaceId}`)}
          style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: O, color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>
          + New Dispatch
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {dispatches.map(j => {
          const sc = DISPATCH_STATUS_COLORS[j.status] || DISPATCH_STATUS_COLORS.expired;
          const sm = DISPATCH_STATUS_MESSAGES[j.status] || DISPATCH_STATUS_MESSAGES.open;
          const isExpanded = expandedId === j.id;
          const jobResponses = responses[j.id] ?? [];
          const isActive = ['open', 'dispatching', 'collecting'].includes(j.status);

          return (
            <div key={j.id} onClick={() => toggleExpand(j.id)} style={{
              background: 'white', borderRadius: 14, padding: '16px 18px',
              border: isExpanded ? `2px solid ${O}` : '1px solid rgba(0,0,0,0.06)',
              cursor: 'pointer', transition: 'all 0.15s',
            }}>
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontWeight: 600, fontSize: 15, color: D }}>
                    {j.diagnosis?.category ? j.diagnosis.category.charAt(0).toUpperCase() + j.diagnosis.category.slice(1) : 'Dispatch'}
                  </span>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: `${G}15`, color: G, letterSpacing: '0.03em' }}>BUSINESS</span>
                </div>
                <span style={{ background: sc.bg, color: sc.text, padding: '3px 10px', borderRadius: 100, fontSize: 12, fontWeight: 600, textTransform: 'capitalize' }}>{j.status}</span>
              </div>
              {j.diagnosis?.summary && <div style={{ fontSize: 13, color: '#6B6560', lineHeight: 1.5, marginBottom: 8 }}>{renderBold(j.diagnosis.summary)}</div>}
              <div style={{ display: 'flex', gap: 16, fontSize: 12, color: '#9B9490', flexWrap: 'wrap' }}>
                {j.propertyName && <span>🏠 {j.propertyName}</span>}
                <span>{j.zipCode}</span>
                <span>{new Date(j.createdAt).toLocaleDateString()} {new Date(j.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
                <span>({timeAgo(j.createdAt)})</span>
              </div>

              {/* Expanded Detail */}
              {isExpanded && (
                <div style={{ marginTop: 16, borderTop: '1px solid rgba(0,0,0,0.06)', paddingTop: 16 }} onClick={e => e.stopPropagation()}>

                  {/* Status Banner */}
                  <div style={{ background: isActive ? '#FFF7ED' : sc.bg, borderRadius: 10, padding: '14px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
                    {isActive && <div style={{ width: 10, height: 10, borderRadius: '50%', background: O, animation: 'pulse 1.2s infinite' }} />}
                    {!isActive && <span style={{ fontSize: 18 }}>{sm.icon}</span>}
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: D }}>{sm.label}</div>
                      <div style={{ fontSize: 12, color: '#6B6560' }}>{sm.desc}</div>
                    </div>
                  </div>

                  {/* Job Details Grid */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
                    <div style={{ background: W, borderRadius: 10, padding: '10px 14px' }}>
                      <div style={{ fontSize: 11, color: '#9B9490', marginBottom: 2 }}>Category</div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: D, textTransform: 'capitalize' }}>{j.diagnosis?.category ?? 'General'}</div>
                    </div>
                    <div style={{ background: W, borderRadius: 10, padding: '10px 14px' }}>
                      <div style={{ fontSize: 11, color: '#9B9490', marginBottom: 2 }}>Severity</div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: D, textTransform: 'capitalize' }}>{j.diagnosis?.severity ?? 'Medium'}</div>
                    </div>
                    {j.propertyName && (
                      <div style={{ background: W, borderRadius: 10, padding: '10px 14px' }}>
                        <div style={{ fontSize: 11, color: '#9B9490', marginBottom: 2 }}>Property</div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: D }}>{j.propertyName}</div>
                      </div>
                    )}
                    <div style={{ background: W, borderRadius: 10, padding: '10px 14px' }}>
                      <div style={{ fontSize: 11, color: '#9B9490', marginBottom: 2 }}>Timing</div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: D }}>{j.preferredTiming ?? 'ASAP'}</div>
                    </div>
                  </div>

                  {j.expiresAt && (
                    <div style={{ fontSize: 12, color: '#9B9490', marginBottom: 16 }}>
                      {isActive ? 'Expires' : 'Expired'}: {new Date(j.expiresAt).toLocaleString()}
                    </div>
                  )}

                  {/* Provider Responses */}
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: D, marginBottom: 10 }}>Provider Responses</div>

                    {loadingResponses === j.id ? (
                      <div style={{ color: '#9B9490', fontSize: 13 }}>Loading responses...</div>
                    ) : jobResponses.length === 0 ? (
                      <div style={{ background: W, borderRadius: 10, padding: '16px', textAlign: 'center' }}>
                        <div style={{ fontSize: 13, color: '#9B9490' }}>
                          {isActive ? 'Waiting for providers to respond...' : 'No providers responded to this request'}
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {jobResponses.map(r => (
                          <div key={r.id} style={{
                            background: W, borderRadius: 12, padding: '14px 16px',
                            border: '1px solid rgba(0,0,0,0.04)',
                          }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                              <div>
                                <span style={{ fontWeight: 600, fontSize: 15, color: D }}>{r.provider.name}</span>
                                <span style={{ color: '#9B9490', fontSize: 12, marginLeft: 8 }}>★ {r.provider.google_rating ?? 'N/A'} ({r.provider.review_count})</span>
                              </div>
                              {r.quoted_price && (
                                <div style={{ textAlign: 'right' }}>
                                  <span style={{ fontFamily: "'Fraunces', serif", fontSize: 22, fontWeight: 700, color: O }}>{r.quoted_price}</span>
                                  <div style={{ fontSize: 10, color: '#9B9490' }}>estimate</div>
                                </div>
                              )}
                            </div>
                            {r.availability && <div style={{ fontSize: 13, color: D, marginBottom: 4 }}>📅 {r.availability}</div>}
                            {r.message && <div style={{ fontSize: 13, color: '#6B6560', fontStyle: 'italic' }}>"{r.message}"</div>}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                              <span style={{ fontSize: 11, color: '#9B9490' }}>via {r.channel} · {timeAgo(r.responded_at)}</span>
                              {r.provider.phone && (
                                <a href={`tel:${r.provider.phone}`} style={{ fontSize: 12, color: G, textDecoration: 'none', fontWeight: 600 }}>📞 Call</a>
                              )}
                            </div>
                            {isActive && (
                              <div style={{ marginTop: 10 }}>
                                <button onClick={async (e) => {
                                  e.stopPropagation();
                                  try {
                                    await jobService.bookProvider(j.id, r.id, r.provider.id);
                                    setDispatches(prev => prev.map(d => d.id === j.id ? { ...d, status: 'completed' } : d));
                                  } catch (err) {
                                    alert((err as Error).message || 'Booking failed');
                                  }
                                }} style={{
                                  width: '100%', padding: '11px 0', borderRadius: 100, border: 'none',
                                  background: O, color: 'white', fontSize: 14, fontWeight: 600, cursor: 'pointer',
                                  fontFamily: "'DM Sans', sans-serif",
                                }}>Book {r.provider.name.split(' ')[0]}</button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <style>{`
        @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.4; } }
      `}</style>
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

const TABS = ['overview', 'dispatches', 'properties', 'vendors', 'team', 'settings'] as const;
type Tab = typeof TABS[number];
const TAB_LABELS: Record<Tab, string> = { overview: 'Overview', dispatches: 'Dispatches', properties: 'Properties', vendors: 'Vendors', team: 'Team', settings: 'Settings' };

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
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => navigate(`/business/chat?workspace=${selectedId}`)}
                  style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: O, color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>
                  New Dispatch
                </button>
                <button onClick={() => setShowCreate(true)}
                  style={{ padding: '8px 20px', borderRadius: 8, border: '1px solid #E0DAD4', background: '#fff', cursor: 'pointer', fontSize: 14, color: D, fontWeight: 500 }}>
                  + New Workspace
                </button>
              </div>
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
            {workspace && tab === 'dispatches' && (
              <DispatchesTab workspaceId={workspace.id} />
            )}
            {workspace && tab === 'properties' && (
              <PropertiesTab workspaceId={workspace.id} role={workspace.user_role} />
            )}
            {workspace && tab === 'vendors' && (
              <VendorsTab workspaceId={workspace.id} role={workspace.user_role} />
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
