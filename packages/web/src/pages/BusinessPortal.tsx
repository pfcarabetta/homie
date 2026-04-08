import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { usePricing, PricingConfig } from '@/hooks/usePricing';
import { businessService, jobService, slackService, templateService, estimateService, trackingService, accountService, getToken, type Workspace, type WorkspaceDetail, type Property, type BedConfig, type PropertyDetails, type WorkspaceMember, type PreferredVendor, type ProviderSearchResult, type WorkspaceDispatch, type WorkspaceBooking, type ProviderResponseItem, type SlackSettings, type DashboardData, type SeasonalSuggestion, type VendorSchedule, type DispatchSchedule, type ScheduleTemplate, type ScheduleRun, type CostEstimate, type AccountProfile, type Reservation, type GuestIssue, type GuestIssueDetail, type GuestReporterSettings, type AutoDispatchRule } from '@/services/api';
import AvatarDropdown from '@/components/AvatarDropdown';
import EstimateCard from '@/components/EstimateCard';
import EstimateBadge from '@/components/EstimateBadge';

const O = '#E8632B', G = '#1B9E77', D = '#2D2926', W = '#F9F5F2';

function cleanPrice(price: string): string {
  let p = price.replace(/^\$+/, '$');
  const bm = p.match(/between\s+\$?(\d+(?:\.\d+)?)\s*(?:and|to)\s*\$?(\d+(?:\.\d+)?)/i);
  if (bm) return `$${bm[1]}-$${bm[2]}`;
  const rm = p.match(/^(\d+(?:\.\d+)?)\s*(?:to|-|–)\s*(\d+(?:\.\d+)?)$/);
  if (rm) return `$${rm[1]}-$${rm[2]}`;
  const nm = p.match(/^(\d+(?:\.\d+)?)$/);
  if (nm) return `$${nm[1]}`;
  const em = p.match(/(?:is|are|be|charge|cost|runs?|pay)\s+(?:about|around)?\s*\$?(\d+(?:\.\d+)?)/i);
  if (em) return `$${em[1]}`;
  return p;
}

function HomieBizLogo({ size = 'default' }: { size?: 'default' | 'large' }) {
  const isLarge = size === 'large';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'flex-end', gap: 0 }}>
      <span style={{ fontFamily: "'Fraunces', serif", fontSize: isLarge ? 28 : 22, fontWeight: 700, color: O, lineHeight: 1 }}>homie</span>
      <span style={{
        fontFamily: "'DM Sans', sans-serif", fontSize: isLarge ? 11 : 9, fontWeight: 800,
        color: '#fff', background: G, padding: isLarge ? '3px 8px' : '2px 6px',
        borderRadius: 4, marginLeft: isLarge ? 10 : 7, letterSpacing: '0.08em',
        textTransform: 'uppercase' as const, lineHeight: 1,
        position: 'relative' as const, bottom: isLarge ? 3 : 2,
      }}>Business</span>
    </span>
  );
}

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
  { value: 'pool', label: 'Pool' },
  { value: 'hot_tub', label: 'Hot Tub' },
  { value: 'painting', label: 'Painting' },
  { value: 'locksmith', label: 'Locksmith' },
  { value: 'handyman', label: 'Handyman' },
  { value: 'flooring', label: 'Flooring' },
  { value: 'tile', label: 'Tile' },
  { value: 'tree_trimming', label: 'Tree Trimming' },
  { value: 'stump_removal', label: 'Stump Removal' },
  { value: 'garage_door', label: 'Garage Door' },
  { value: 'fence', label: 'Fencing' },
  { value: 'concrete', label: 'Concrete' },
  { value: 'window_cleaning', label: 'Window Cleaning' },
  { value: 'carpet_cleaning', label: 'Carpet Cleaning' },
  { value: 'pressure_washing', label: 'Pressure Washing' },
  { value: 'steam_cleaning', label: 'Steam Cleaning' },
  { value: 'furniture_assembly', label: 'Furniture Assembly' },
  { value: 'gutter', label: 'Gutter Cleaning' },
  { value: 'moving', label: 'Moving' },
  { value: 'junk_removal', label: 'Junk Removal' },
  { value: 'masonry', label: 'Masonry' },
  { value: 'siding', label: 'Siding' },
  { value: 'drywall', label: 'Drywall' },
  { value: 'insulation', label: 'Insulation' },
  { value: 'solar', label: 'Solar' },
  { value: 'security_systems', label: 'Security Systems' },
  { value: 'deck_patio', label: 'Deck & Patio' },
  { value: 'window_door_install', label: 'Window & Door Install' },
  { value: 'kitchen_remodel', label: 'Kitchen Remodel' },
  { value: 'bathroom_remodel', label: 'Bathroom Remodel' },
  { value: 'foundation_waterproofing', label: 'Foundation & Waterproofing' },
  { value: 'chimney', label: 'Chimney' },
  { value: 'septic_sewer', label: 'Septic & Sewer' },
  { value: 'sprinkler_irrigation', label: 'Sprinkler & Irrigation' },
  { value: 'tv_mounting', label: 'TV Mounting' },
  { value: 'generator_install', label: 'Generator Install' },
  { value: 'ev_charger_install', label: 'EV Charger Install' },
  { value: 'welding_metal_work', label: 'Welding & Metal Work' },
  { value: 'concierge', label: 'Concierge' },
  { value: 'photography', label: 'Professional Photography' },
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

/* ── Edit Property Modal ────────────────────────────────────────────────── */

const BED_TYPES = [
  { value: 'king', label: 'King' },
  { value: 'queen', label: 'Queen' },
  { value: 'full', label: 'Full' },
  { value: 'twin', label: 'Twin' },
  { value: 'sofa_bed', label: 'Sofa Bed' },
  { value: 'bunk', label: 'Bunk' },
  { value: 'crib', label: 'Crib' },
];

function EditPropertyModal({ workspaceId, property, onClose, onUpdated, onDeleted }: {
  workspaceId: string; property: Property; onClose: () => void; onUpdated: (p: Property) => void; onDeleted: (id: string) => void;
}) {
  const [name, setName] = useState(property.name);
  const [address, setAddress] = useState(property.address || '');
  const [city, setCity] = useState(property.city || '');
  const [state, setState] = useState(property.state || '');
  const [zip, setZip] = useState(property.zipCode || '');
  const [propType, setPropType] = useState(property.propertyType);
  const [unitCount, setUnitCount] = useState(property.unitCount);
  const [bedrooms, setBedrooms] = useState(property.bedrooms ?? 0);
  const [bathrooms, setBathrooms] = useState(property.bathrooms ?? '1');
  const [sqft, setSqft] = useState(property.sqft ?? 0);
  const [beds, setBeds] = useState<BedConfig[]>(property.beds || []);
  const [notes, setNotes] = useState(property.notes || '');
  const [details, setDetails] = useState<PropertyDetails>(property.details ?? {});
  const [openSections, setOpenSections] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  function toggleSection(key: string) {
    setOpenSections(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  function updateDetails<K extends keyof PropertyDetails>(section: K, field: string, value: string | boolean) {
    setDetails(prev => ({
      ...prev,
      [section]: { ...(prev[section] as Record<string, unknown> ?? {}), [field]: value },
    }));
  }

  function updateApplianceDetails(appliance: string, field: string, value: string) {
    setDetails(prev => ({
      ...prev,
      appliances: {
        ...(prev.appliances ?? {}),
        [appliance]: { ...((prev.appliances as Record<string, Record<string, string>> ?? {})[appliance] ?? {}), [field]: value },
      },
    }));
  }

  function addBed() { setBeds(prev => [...prev, { type: 'queen', count: 1 }]); }
  function removeBed(i: number) { setBeds(prev => prev.filter((_, idx) => idx !== i)); }
  function updateBed(i: number, field: 'type' | 'count', val: string | number) {
    setBeds(prev => prev.map((b, idx) => idx === i ? { ...b, [field]: val } : b));
  }

  async function handleSave() {
    if (!name.trim()) { setError('Name is required'); return; }
    setSaving(true);
    setError('');
    try {
      const res = await businessService.updateProperty(workspaceId, property.id, {
        name: name.trim(),
        address: address || undefined,
        city: city || undefined,
        state: state || undefined,
        zip_code: zip || undefined,
        property_type: propType,
        unit_count: unitCount,
        bedrooms: bedrooms || undefined,
        bathrooms: bathrooms || undefined,
        sqft: sqft || undefined,
        beds: beds.length > 0 ? beds : undefined,
        details: Object.keys(details).length > 0 ? details : undefined,
        notes: notes || undefined,
      });
      if (res.data) onUpdated(res.data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update');
    } finally {
      setSaving(false);
    }
  }

  const inputStyle = { width: '100%', padding: '10px 14px', border: '1px solid #E0DAD4', borderRadius: 8, fontSize: 15, marginBottom: 16, boxSizing: 'border-box' as const };
  const labelStyle = { display: 'block' as const, fontSize: 13, fontWeight: 600, color: '#6B6560', marginBottom: 6 };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div style={{ background: '#fff', borderRadius: 12, padding: 32, width: '100%', maxWidth: 560, maxHeight: '90vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <h3 style={{ fontFamily: 'Fraunces, serif', fontSize: 22, color: D, margin: '0 0 20px' }}>Edit Property</h3>

        <label style={labelStyle}>Property Name *</label>
        <input value={name} onChange={e => setName(e.target.value)} style={inputStyle} />

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
        <input value={address} onChange={e => setAddress(e.target.value)} style={inputStyle} />

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 12 }}>
          <div><label style={labelStyle}>City</label><input value={city} onChange={e => setCity(e.target.value)} style={inputStyle} /></div>
          <div><label style={labelStyle}>State</label><input value={state} onChange={e => setState(e.target.value)} maxLength={2} style={inputStyle} /></div>
          <div><label style={labelStyle}>ZIP</label><input value={zip} onChange={e => setZip(e.target.value)} maxLength={10} style={inputStyle} /></div>
        </div>

        {/* Property details */}
        <div style={{ borderTop: '1px solid #E0DAD4', paddingTop: 16, marginTop: 4, marginBottom: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: D, marginBottom: 12 }}>Property Details</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>Bedrooms</label>
              <input type="number" min={0} value={bedrooms} onChange={e => setBedrooms(+e.target.value || 0)} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Bathrooms</label>
              <select value={bathrooms} onChange={e => setBathrooms(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                {['0.5', '1', '1.5', '2', '2.5', '3', '3.5', '4', '4.5', '5', '5.5', '6'].map(v => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Sq Ft</label>
              <input type="number" min={0} value={sqft} onChange={e => setSqft(+e.target.value || 0)} placeholder="0" style={inputStyle} />
            </div>
          </div>
        </div>

        {/* Bed configuration */}
        <div style={{ borderTop: '1px solid #E0DAD4', paddingTop: 16, marginTop: 4, marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: D }}>Bed Configuration</div>
            <button onClick={addBed} style={{ fontSize: 13, color: O, fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer' }}>+ Add Bed</button>
          </div>
          {beds.length === 0 && <div style={{ fontSize: 13, color: '#9B9490', marginBottom: 12 }}>No beds configured</div>}
          {beds.map((b, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
              <select value={b.type} onChange={e => updateBed(i, 'type', e.target.value)}
                style={{ flex: 2, padding: '8px 12px', border: '1px solid #E0DAD4', borderRadius: 8, fontSize: 14, cursor: 'pointer' }}>
                {BED_TYPES.map(bt => <option key={bt.value} value={bt.value}>{bt.label}</option>)}
              </select>
              <input type="number" min={1} value={b.count} onChange={e => updateBed(i, 'count', +e.target.value || 1)}
                style={{ flex: 1, padding: '8px 12px', border: '1px solid #E0DAD4', borderRadius: 8, fontSize: 14, textAlign: 'center' }} />
              <button onClick={() => removeBed(i)} style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #FCA5A5', background: '#FEF2F2', fontSize: 12, cursor: 'pointer', color: '#DC2626' }}>×</button>
            </div>
          ))}
        </div>

        {/* Equipment & Systems Details */}
        <div style={{ borderTop: '1px solid #E0DAD4', paddingTop: 16, marginTop: 4, marginBottom: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: D, marginBottom: 12 }}>Equipment & Systems</div>

          {/* HVAC & Climate */}
          <div style={{ marginBottom: 8, border: '1px solid #E0DAD4', borderRadius: 8, overflow: 'hidden' }}>
            <button onClick={() => toggleSection('hvac')} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '10px 14px', background: '#FAFAF8', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: D, textAlign: 'left' }}>
              <span style={{ fontSize: 11 }}>{openSections.has('hvac') ? '\u25BC' : '\u25B6'}</span>
              <span>HVAC & Climate</span>
            </button>
            {openSections.has('hvac') && (
              <div style={{ padding: '12px 14px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div><label style={labelStyle}>AC Type</label><input value={details.hvac?.acType || ''} onChange={e => updateDetails('hvac', 'acType', e.target.value)} placeholder="Central, Mini-split, Window..." style={inputStyle} /></div>
                  <div><label style={labelStyle}>AC Brand</label><input value={details.hvac?.acBrand || ''} onChange={e => updateDetails('hvac', 'acBrand', e.target.value)} placeholder="Carrier, Trane..." style={inputStyle} /></div>
                  <div><label style={labelStyle}>AC Model</label><input value={details.hvac?.acModel || ''} onChange={e => updateDetails('hvac', 'acModel', e.target.value)} style={inputStyle} /></div>
                  <div><label style={labelStyle}>AC Age</label><input value={details.hvac?.acAge || ''} onChange={e => updateDetails('hvac', 'acAge', e.target.value)} placeholder="5 years" style={inputStyle} /></div>
                  <div><label style={labelStyle}>Heating Type</label><input value={details.hvac?.heatingType || ''} onChange={e => updateDetails('hvac', 'heatingType', e.target.value)} placeholder="Forced air, Radiant..." style={inputStyle} /></div>
                  <div><label style={labelStyle}>Heating Brand</label><input value={details.hvac?.heatingBrand || ''} onChange={e => updateDetails('hvac', 'heatingBrand', e.target.value)} style={inputStyle} /></div>
                  <div><label style={labelStyle}>Heating Model</label><input value={details.hvac?.heatingModel || ''} onChange={e => updateDetails('hvac', 'heatingModel', e.target.value)} style={inputStyle} /></div>
                  <div><label style={labelStyle}>Thermostat Brand</label><input value={details.hvac?.thermostatBrand || ''} onChange={e => updateDetails('hvac', 'thermostatBrand', e.target.value)} placeholder="Nest, Ecobee..." style={inputStyle} /></div>
                  <div><label style={labelStyle}>Thermostat Model</label><input value={details.hvac?.thermostatModel || ''} onChange={e => updateDetails('hvac', 'thermostatModel', e.target.value)} style={inputStyle} /></div>
                  <div><label style={labelStyle}>Filter Size</label><input value={details.hvac?.filterSize || ''} onChange={e => updateDetails('hvac', 'filterSize', e.target.value)} placeholder="20x25x1" style={inputStyle} /></div>
                </div>
              </div>
            )}
          </div>

          {/* Water Heater */}
          <div style={{ marginBottom: 8, border: '1px solid #E0DAD4', borderRadius: 8, overflow: 'hidden' }}>
            <button onClick={() => toggleSection('waterHeater')} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '10px 14px', background: '#FAFAF8', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: D, textAlign: 'left' }}>
              <span style={{ fontSize: 11 }}>{openSections.has('waterHeater') ? '\u25BC' : '\u25B6'}</span>
              <span>Water Heater</span>
            </button>
            {openSections.has('waterHeater') && (
              <div style={{ padding: '12px 14px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div><label style={labelStyle}>Type</label><input value={details.waterHeater?.type || ''} onChange={e => updateDetails('waterHeater', 'type', e.target.value)} placeholder="Tankless, Tank, Hybrid..." style={inputStyle} /></div>
                  <div><label style={labelStyle}>Brand</label><input value={details.waterHeater?.brand || ''} onChange={e => updateDetails('waterHeater', 'brand', e.target.value)} placeholder="Rinnai, Rheem..." style={inputStyle} /></div>
                  <div><label style={labelStyle}>Model</label><input value={details.waterHeater?.model || ''} onChange={e => updateDetails('waterHeater', 'model', e.target.value)} style={inputStyle} /></div>
                  <div><label style={labelStyle}>Age</label><input value={details.waterHeater?.age || ''} onChange={e => updateDetails('waterHeater', 'age', e.target.value)} placeholder="3 years" style={inputStyle} /></div>
                  <div><label style={labelStyle}>Fuel</label><input value={details.waterHeater?.fuel || ''} onChange={e => updateDetails('waterHeater', 'fuel', e.target.value)} placeholder="Gas, Electric, Propane" style={inputStyle} /></div>
                  <div><label style={labelStyle}>Capacity</label><input value={details.waterHeater?.capacity || ''} onChange={e => updateDetails('waterHeater', 'capacity', e.target.value)} placeholder="50 gallons" style={inputStyle} /></div>
                  <div><label style={labelStyle}>Location</label><input value={details.waterHeater?.location || ''} onChange={e => updateDetails('waterHeater', 'location', e.target.value)} placeholder="Garage, Utility closet..." style={inputStyle} /></div>
                </div>
              </div>
            )}
          </div>

          {/* Appliances */}
          <div style={{ marginBottom: 8, border: '1px solid #E0DAD4', borderRadius: 8, overflow: 'hidden' }}>
            <button onClick={() => toggleSection('appliances')} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '10px 14px', background: '#FAFAF8', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: D, textAlign: 'left' }}>
              <span style={{ fontSize: 11 }}>{openSections.has('appliances') ? '\u25BC' : '\u25B6'}</span>
              <span>Appliances</span>
            </button>
            {openSections.has('appliances') && (
              <div style={{ padding: '12px 14px' }}>
                {[
                  { key: 'refrigerator', label: 'Refrigerator', fields: ['brand', 'model'] },
                  { key: 'washer', label: 'Washer', fields: ['brand', 'model'] },
                  { key: 'dryer', label: 'Dryer', fields: ['brand', 'model', 'fuel'] },
                  { key: 'dishwasher', label: 'Dishwasher', fields: ['brand', 'model'] },
                  { key: 'oven', label: 'Oven/Stove', fields: ['brand', 'model', 'fuel'] },
                  { key: 'disposal', label: 'Disposal', fields: ['brand'] },
                  { key: 'microwave', label: 'Microwave', fields: ['brand', 'type'] },
                ].map(app => (
                  <div key={app.key} style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#9B9490', marginBottom: 4 }}>{app.label}</div>
                    <div style={{ display: 'grid', gridTemplateColumns: app.fields.length > 2 ? '1fr 1fr 1fr' : '1fr 1fr', gap: 8 }}>
                      {app.fields.map(f => (
                        <div key={f}>
                          <label style={labelStyle}>{f.charAt(0).toUpperCase() + f.slice(1)}</label>
                          <input value={((details.appliances as Record<string, Record<string, string>> | undefined)?.[app.key]?.[f]) || ''} onChange={e => updateApplianceDetails(app.key, f, e.target.value)} style={inputStyle} />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Plumbing */}
          <div style={{ marginBottom: 8, border: '1px solid #E0DAD4', borderRadius: 8, overflow: 'hidden' }}>
            <button onClick={() => toggleSection('plumbing')} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '10px 14px', background: '#FAFAF8', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: D, textAlign: 'left' }}>
              <span style={{ fontSize: 11 }}>{openSections.has('plumbing') ? '\u25BC' : '\u25B6'}</span>
              <span>Plumbing</span>
            </button>
            {openSections.has('plumbing') && (
              <div style={{ padding: '12px 14px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div><label style={labelStyle}>Kitchen Faucet Brand</label><input value={details.plumbing?.kitchenFaucetBrand || ''} onChange={e => updateDetails('plumbing', 'kitchenFaucetBrand', e.target.value)} style={inputStyle} /></div>
                  <div><label style={labelStyle}>Bathroom Faucet Brand</label><input value={details.plumbing?.bathroomFaucetBrand || ''} onChange={e => updateDetails('plumbing', 'bathroomFaucetBrand', e.target.value)} style={inputStyle} /></div>
                  <div><label style={labelStyle}>Toilet Brand</label><input value={details.plumbing?.toiletBrand || ''} onChange={e => updateDetails('plumbing', 'toiletBrand', e.target.value)} style={inputStyle} /></div>
                  <div><label style={labelStyle}>Water Softener</label><input value={details.plumbing?.waterSoftener || ''} onChange={e => updateDetails('plumbing', 'waterSoftener', e.target.value)} style={inputStyle} /></div>
                  <div><label style={labelStyle}>Septic or Sewer</label><input value={details.plumbing?.septicOrSewer || ''} onChange={e => updateDetails('plumbing', 'septicOrSewer', e.target.value)} placeholder="Septic, Municipal sewer" style={inputStyle} /></div>
                  <div><label style={labelStyle}>Main Shutoff Location</label><input value={details.plumbing?.mainShutoffLocation || ''} onChange={e => updateDetails('plumbing', 'mainShutoffLocation', e.target.value)} style={inputStyle} /></div>
                </div>
              </div>
            )}
          </div>

          {/* Electrical */}
          <div style={{ marginBottom: 8, border: '1px solid #E0DAD4', borderRadius: 8, overflow: 'hidden' }}>
            <button onClick={() => toggleSection('electrical')} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '10px 14px', background: '#FAFAF8', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: D, textAlign: 'left' }}>
              <span style={{ fontSize: 11 }}>{openSections.has('electrical') ? '\u25BC' : '\u25B6'}</span>
              <span>Electrical</span>
            </button>
            {openSections.has('electrical') && (
              <div style={{ padding: '12px 14px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div><label style={labelStyle}>Breaker Box Location</label><input value={details.electrical?.breakerBoxLocation || ''} onChange={e => updateDetails('electrical', 'breakerBoxLocation', e.target.value)} style={inputStyle} /></div>
                  <div><label style={labelStyle}>Panel Amperage</label><input value={details.electrical?.panelAmperage || ''} onChange={e => updateDetails('electrical', 'panelAmperage', e.target.value)} placeholder="100A, 200A..." style={inputStyle} /></div>
                  <div><label style={labelStyle}>Generator Type</label><input value={details.electrical?.generatorType || ''} onChange={e => { updateDetails('electrical', 'generatorType', e.target.value); updateDetails('electrical', 'hasGenerator', e.target.value.length > 0); }} placeholder="Standby, Portable..." style={inputStyle} /></div>
                  <div><label style={labelStyle}>Solar System</label><input value={details.electrical?.solarSystem || ''} onChange={e => { updateDetails('electrical', 'solarSystem', e.target.value); updateDetails('electrical', 'hasSolar', e.target.value.length > 0); }} placeholder="Tesla, SunPower..." style={inputStyle} /></div>
                  <div><label style={labelStyle}>EV Charger Brand</label><input value={details.electrical?.evChargerBrand || ''} onChange={e => { updateDetails('electrical', 'evChargerBrand', e.target.value); updateDetails('electrical', 'hasEvCharger', e.target.value.length > 0); }} placeholder="Tesla, ChargePoint..." style={inputStyle} /></div>
                </div>
              </div>
            )}
          </div>

          {/* Pool & Spa */}
          <div style={{ marginBottom: 8, border: '1px solid #E0DAD4', borderRadius: 8, overflow: 'hidden' }}>
            <button onClick={() => toggleSection('poolSpa')} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '10px 14px', background: '#FAFAF8', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: D, textAlign: 'left' }}>
              <span style={{ fontSize: 11 }}>{openSections.has('poolSpa') ? '\u25BC' : '\u25B6'}</span>
              <span>Pool & Spa</span>
            </button>
            {openSections.has('poolSpa') && (
              <div style={{ padding: '12px 14px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div><label style={labelStyle}>Pool Type</label><input value={details.poolSpa?.poolType || ''} onChange={e => updateDetails('poolSpa', 'poolType', e.target.value)} placeholder="In-ground, Above-ground..." style={inputStyle} /></div>
                  <div><label style={labelStyle}>Pool Heater Brand</label><input value={details.poolSpa?.poolHeaterBrand || ''} onChange={e => updateDetails('poolSpa', 'poolHeaterBrand', e.target.value)} style={inputStyle} /></div>
                  <div><label style={labelStyle}>Pool Pump Brand</label><input value={details.poolSpa?.poolPumpBrand || ''} onChange={e => updateDetails('poolSpa', 'poolPumpBrand', e.target.value)} style={inputStyle} /></div>
                  <div><label style={labelStyle}>Hot Tub Brand</label><input value={details.poolSpa?.hotTubBrand || ''} onChange={e => updateDetails('poolSpa', 'hotTubBrand', e.target.value)} style={inputStyle} /></div>
                  <div><label style={labelStyle}>Hot Tub Model</label><input value={details.poolSpa?.hotTubModel || ''} onChange={e => updateDetails('poolSpa', 'hotTubModel', e.target.value)} style={inputStyle} /></div>
                </div>
              </div>
            )}
          </div>

          {/* Exterior */}
          <div style={{ marginBottom: 8, border: '1px solid #E0DAD4', borderRadius: 8, overflow: 'hidden' }}>
            <button onClick={() => toggleSection('exterior')} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '10px 14px', background: '#FAFAF8', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: D, textAlign: 'left' }}>
              <span style={{ fontSize: 11 }}>{openSections.has('exterior') ? '\u25BC' : '\u25B6'}</span>
              <span>Exterior</span>
            </button>
            {openSections.has('exterior') && (
              <div style={{ padding: '12px 14px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div><label style={labelStyle}>Roof Type</label><input value={details.exterior?.roofType || ''} onChange={e => updateDetails('exterior', 'roofType', e.target.value)} placeholder="Shingle, Tile, Metal..." style={inputStyle} /></div>
                  <div><label style={labelStyle}>Roof Age</label><input value={details.exterior?.roofAge || ''} onChange={e => updateDetails('exterior', 'roofAge', e.target.value)} placeholder="10 years" style={inputStyle} /></div>
                  <div><label style={labelStyle}>Siding Material</label><input value={details.exterior?.sidingMaterial || ''} onChange={e => updateDetails('exterior', 'sidingMaterial', e.target.value)} placeholder="Vinyl, Wood, Stucco..." style={inputStyle} /></div>
                  <div><label style={labelStyle}>Fence Material</label><input value={details.exterior?.fenceMaterial || ''} onChange={e => updateDetails('exterior', 'fenceMaterial', e.target.value)} placeholder="Wood, Vinyl, Iron..." style={inputStyle} /></div>
                  <div><label style={labelStyle}>Garage Door Brand</label><input value={details.exterior?.garageDoorBrand || ''} onChange={e => updateDetails('exterior', 'garageDoorBrand', e.target.value)} style={inputStyle} /></div>
                  <div><label style={labelStyle}>Irrigation Brand</label><input value={details.exterior?.irrigationBrand || ''} onChange={e => updateDetails('exterior', 'irrigationBrand', e.target.value)} placeholder="Rachio, Hunter..." style={inputStyle} /></div>
                </div>
              </div>
            )}
          </div>

          {/* Access & Security */}
          <div style={{ marginBottom: 8, border: '1px solid #E0DAD4', borderRadius: 8, overflow: 'hidden' }}>
            <button onClick={() => toggleSection('access')} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '10px 14px', background: '#FAFAF8', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: D, textAlign: 'left' }}>
              <span style={{ fontSize: 11 }}>{openSections.has('access') ? '\u25BC' : '\u25B6'}</span>
              <span>Access & Security</span>
            </button>
            {openSections.has('access') && (
              <div style={{ padding: '12px 14px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div><label style={labelStyle}>Lockbox Code</label><input value={details.access?.lockboxCode || ''} onChange={e => updateDetails('access', 'lockboxCode', e.target.value)} style={inputStyle} /></div>
                  <div><label style={labelStyle}>Gate Code</label><input value={details.access?.gateCode || ''} onChange={e => updateDetails('access', 'gateCode', e.target.value)} style={inputStyle} /></div>
                  <div><label style={labelStyle}>Alarm Brand</label><input value={details.access?.alarmBrand || ''} onChange={e => updateDetails('access', 'alarmBrand', e.target.value)} placeholder="ADT, Ring, SimpliSafe..." style={inputStyle} /></div>
                  <div><label style={labelStyle}>Alarm Code</label><input value={details.access?.alarmCode || ''} onChange={e => updateDetails('access', 'alarmCode', e.target.value)} style={inputStyle} /></div>
                  <div><label style={labelStyle}>WiFi Network</label><input value={details.access?.wifiNetwork || ''} onChange={e => updateDetails('access', 'wifiNetwork', e.target.value)} style={inputStyle} /></div>
                  <div><label style={labelStyle}>WiFi Password</label><input value={details.access?.wifiPassword || ''} onChange={e => updateDetails('access', 'wifiPassword', e.target.value)} style={inputStyle} /></div>
                </div>
              </div>
            )}
          </div>

          {/* General */}
          <div style={{ marginBottom: 8, border: '1px solid #E0DAD4', borderRadius: 8, overflow: 'hidden' }}>
            <button onClick={() => toggleSection('general')} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '10px 14px', background: '#FAFAF8', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: D, textAlign: 'left' }}>
              <span style={{ fontSize: 11 }}>{openSections.has('general') ? '\u25BC' : '\u25B6'}</span>
              <span>General</span>
            </button>
            {openSections.has('general') && (
              <div style={{ padding: '12px 14px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div><label style={labelStyle}>Year Built</label><input value={details.general?.yearBuilt || ''} onChange={e => updateDetails('general', 'yearBuilt', e.target.value)} placeholder="2005" style={inputStyle} /></div>
                  <div>
                    <label style={labelStyle}>HOA</label>
                    <select value={details.general?.hasHoa ? 'yes' : 'no'} onChange={e => updateDetails('general', 'hasHoa', e.target.value === 'yes')} style={{ ...inputStyle, cursor: 'pointer' }}>
                      <option value="no">No</option>
                      <option value="yes">Yes</option>
                    </select>
                  </div>
                  <div><label style={labelStyle}>HOA Contact</label><input value={details.general?.hoaContact || ''} onChange={e => updateDetails('general', 'hoaContact', e.target.value)} style={inputStyle} /></div>
                  <div><label style={labelStyle}>Pest Control Provider</label><input value={details.general?.pestControlProvider || ''} onChange={e => updateDetails('general', 'pestControlProvider', e.target.value)} style={inputStyle} /></div>
                  <div><label style={labelStyle}>Pest Control Frequency</label><input value={details.general?.pestControlFrequency || ''} onChange={e => updateDetails('general', 'pestControlFrequency', e.target.value)} placeholder="Monthly, Quarterly..." style={inputStyle} /></div>
                </div>
                <div style={{ marginTop: 8 }}>
                  <label style={labelStyle}>Cleaning Notes</label>
                  <textarea value={details.general?.cleaningNotes || ''} onChange={e => updateDetails('general', 'cleaningNotes', e.target.value)} rows={2} style={{ ...inputStyle, resize: 'vertical' as const }} />
                </div>
              </div>
            )}
          </div>
        </div>

        <label style={labelStyle}>Notes</label>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="Gate code, access instructions, etc."
          style={{ ...inputStyle, resize: 'vertical' as const }} />

        {error && <div style={{ color: '#DC2626', fontSize: 14, marginBottom: 16 }}>{error}</div>}

        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '10px 20px', borderRadius: 8, border: '1px solid #E0DAD4', background: '#fff', cursor: 'pointer', fontSize: 14, color: D }}>Cancel</button>
          <button onClick={handleSave} disabled={saving}
            style={{ padding: '10px 24px', borderRadius: 8, border: 'none', background: O, color: '#fff', cursor: saving ? 'default' : 'pointer', fontSize: 14, fontWeight: 600, opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>

        {/* Delete property */}
        <div style={{ borderTop: '1px solid #E0DAD4', marginTop: 24, paddingTop: 20 }}>
          {!confirmDelete ? (
            <button onClick={() => setConfirmDelete(true)}
              style={{ fontSize: 13, color: '#DC2626', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500 }}>
              Delete this property
            </button>
          ) : (
            <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, padding: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#DC2626', marginBottom: 6 }}>Are you sure?</div>
              <div style={{ fontSize: 13, color: '#6B6560', marginBottom: 12 }}>This will permanently remove <strong>{property.name}</strong> and cannot be undone.</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setConfirmDelete(false)}
                  style={{ flex: 1, padding: '8px 0', borderRadius: 8, border: '1px solid #E0DAD4', background: '#fff', fontSize: 13, cursor: 'pointer', color: D }}>
                  Cancel
                </button>
                <button disabled={deleting} onClick={async () => {
                  setDeleting(true);
                  try {
                    await businessService.deleteProperty(workspaceId, property.id);
                    onDeleted(property.id);
                  } catch (err) {
                    setError(err instanceof Error ? err.message : 'Failed to delete');
                    setConfirmDelete(false);
                  }
                  setDeleting(false);
                }}
                  style={{ flex: 1, padding: '8px 0', borderRadius: 8, border: 'none', background: '#DC2626', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: deleting ? 0.7 : 1 }}>
                  {deleting ? 'Deleting...' : 'Yes, delete property'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Properties Tab ─────────────────────────────────────────────────────── */

function getPlanPropertyLimit(plan: string, pricing: PricingConfig): number {
  return pricing.business[plan]?.maxProperties ?? 10;
}

function getPlanTiersOrdered(pricing: PricingConfig) {
  const bp = pricing.business;
  return [
    { plan: 'starter',      limit: bp.starter?.maxProperties      ?? 10,   label: 'Starter',      price: bp.starter?.base      === 0 ? `$0/mo + $${bp.starter?.perProperty ?? 10}/property`      : `$${bp.starter?.base}/mo + $${bp.starter?.perProperty}/property` },
    { plan: 'professional', limit: bp.professional?.maxProperties  ?? 50,   label: 'Professional', price: `$${bp.professional?.base ?? 99}/mo + $${bp.professional?.perProperty ?? 10}/property` },
    { plan: 'business',     limit: bp.business?.maxProperties      ?? 150,  label: 'Business',     price: `$${bp.business?.base ?? 249}/mo + $${bp.business?.perProperty ?? 10}/property` },
    { plan: 'enterprise',   limit: bp.enterprise?.maxProperties    ?? 9999, label: 'Enterprise',   price: 'Custom' },
  ];
}

/* ── Mini Calendar for Reservations ─────────────────────────────────── */

function MiniCalendar({ reservations }: { reservations: Reservation[] }) {
  const today = new Date();
  const months = [
    { year: today.getFullYear(), month: today.getMonth() },
    { year: today.getMonth() === 11 ? today.getFullYear() + 1 : today.getFullYear(), month: (today.getMonth() + 1) % 12 },
  ];

  const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const DAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

  // Color palette for reservation bars
  const BAR_COLORS = ['#E8632B', '#1B9E77', '#2563EB', '#9333EA', '#DC2626', '#D97706'];

  function dateKey(y: number, m: number, d: number): string {
    return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }

  function parseDate(s: string): Date {
    const dateOnly = s.includes('T') ? s.split('T')[0] : s;
    const [y, m, d] = dateOnly.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  // Build lookup: dateKey -> list of reservation indices
  const dateReservations: Record<string, Array<{ resIdx: number; isCheckIn: boolean; isCheckOut: boolean }>> = {};
  reservations.forEach((r, idx) => {
    const ci = parseDate(r.checkIn);
    const co = parseDate(r.checkOut);
    const cursor = new Date(ci);
    while (cursor <= co) {
      const key = dateKey(cursor.getFullYear(), cursor.getMonth(), cursor.getDate());
      if (!dateReservations[key]) dateReservations[key] = [];
      dateReservations[key].push({
        resIdx: idx,
        isCheckIn: cursor.getTime() === ci.getTime(),
        isCheckOut: cursor.getTime() === co.getTime(),
      });
      cursor.setDate(cursor.getDate() + 1);
    }
  });

  const [hoveredRes, setHoveredRes] = useState<number | null>(null);

  return (
    <div>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        {months.map(({ year, month }) => {
          const firstDay = new Date(year, month, 1).getDay();
          const daysInMonth = new Date(year, month + 1, 0).getDate();
          const cells: Array<{ day: number | null }> = [];
          for (let i = 0; i < firstDay; i++) cells.push({ day: null });
          for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d });

          return (
            <div key={`${year}-${month}`} style={{ flex: '1 1 220px', minWidth: 220 }}>
              <div style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 12, fontWeight: 600, color: D, marginBottom: 6, textAlign: 'center' }}>
                {MONTH_NAMES[month]} {year}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 1 }}>
                {DAY_LABELS.map(dl => (
                  <div key={dl} style={{ fontSize: 9, color: '#9B9490', textAlign: 'center', padding: '2px 0', fontFamily: 'DM Sans, sans-serif', fontWeight: 600 }}>{dl}</div>
                ))}
                {cells.map((cell, i) => {
                  if (cell.day === null) return <div key={`e-${i}`} />;
                  const key = dateKey(year, month, cell.day);
                  const isToday = year === today.getFullYear() && month === today.getMonth() && cell.day === today.getDate();
                  const dayRes = dateReservations[key] || [];
                  const hasCheckIn = dayRes.some(r => r.isCheckIn);
                  const hasCheckOut = dayRes.some(r => r.isCheckOut);
                  const hasRes = dayRes.length > 0;

                  return (
                    <div key={key} style={{
                      position: 'relative', textAlign: 'center', padding: '3px 0', fontSize: 11,
                      fontFamily: 'DM Sans, sans-serif', fontWeight: isToday ? 700 : 400,
                      color: isToday ? '#fff' : hasRes ? D : '#9B9490',
                      background: isToday ? D : 'transparent',
                      borderRadius: isToday ? 4 : 0, cursor: hasRes ? 'pointer' : 'default',
                    }}
                      onMouseEnter={() => { if (dayRes.length > 0) setHoveredRes(dayRes[0].resIdx); }}
                      onMouseLeave={() => setHoveredRes(null)}
                    >
                      {cell.day}
                      {/* Reservation bar indicators */}
                      {dayRes.length > 0 && (
                        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
                          {dayRes.slice(0, 2).map((dr, bi) => (
                            <div key={bi} style={{
                              height: 3,
                              background: BAR_COLORS[dr.resIdx % BAR_COLORS.length],
                              borderRadius: `${dr.isCheckIn ? 2 : 0}px ${dr.isCheckOut ? 2 : 0}px ${dr.isCheckOut ? 2 : 0}px ${dr.isCheckIn ? 2 : 0}px`,
                              opacity: hoveredRes === dr.resIdx ? 1 : 0.7,
                            }} />
                          ))}
                        </div>
                      )}
                      {/* Check-in / check-out dot indicators */}
                      {(hasCheckIn || hasCheckOut) && !isToday && (
                        <div style={{ position: 'absolute', top: 0, right: 1, display: 'flex', gap: 1 }}>
                          {hasCheckOut && <div style={{ width: 5, height: 5, borderRadius: '50%', background: O }} />}
                          {hasCheckIn && <div style={{ width: 5, height: 5, borderRadius: '50%', background: G }} />}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 14, marginTop: 10, fontSize: 10, color: '#9B9490', fontFamily: 'DM Sans, sans-serif', alignItems: 'center' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: G, display: 'inline-block' }} /> Check-in
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: O, display: 'inline-block' }} /> Check-out
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          <span style={{ width: 12, height: 3, borderRadius: 2, background: '#E8632B', display: 'inline-block', opacity: 0.7 }} /> Reserved
        </span>
      </div>

      {/* Hovered reservation detail or reservation list */}
      {hoveredRes !== null && reservations[hoveredRes] && (
        <div style={{
          marginTop: 8, padding: '8px 12px', background: W, borderRadius: 8,
          fontSize: 12, fontFamily: 'DM Sans, sans-serif', color: D, transition: 'all 0.15s',
          border: `1px solid ${BAR_COLORS[hoveredRes % BAR_COLORS.length]}20`,
        }}>
          <span style={{ fontWeight: 600 }}>{reservations[hoveredRes].guestName || 'Guest'}</span>
          <span style={{ color: '#9B9490', marginLeft: 8 }}>
            {new Date(reservations[hoveredRes].checkIn).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            {' - '}
            {new Date(reservations[hoveredRes].checkOut).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </span>
          {reservations[hoveredRes].guests && (
            <span style={{ color: '#9B9490', marginLeft: 8 }}>{reservations[hoveredRes].guests} guest{reservations[hoveredRes].guests! > 1 ? 's' : ''}</span>
          )}
          {reservations[hoveredRes].source && (
            <span style={{ color: '#9B9490', marginLeft: 8 }}>via {reservations[hoveredRes].source}</span>
          )}
          {(reservations[hoveredRes].guestEmail || reservations[hoveredRes].guestPhone) && (
            <div style={{ marginTop: 4, fontSize: 11, color: '#9B9490' }}>
              {reservations[hoveredRes].guestEmail && <span>{reservations[hoveredRes].guestEmail}</span>}
              {reservations[hoveredRes].guestEmail && reservations[hoveredRes].guestPhone && <span style={{ margin: '0 4px' }}>|</span>}
              {reservations[hoveredRes].guestPhone && <span>{reservations[hoveredRes].guestPhone}</span>}
            </div>
          )}
        </div>
      )}

      {/* Upcoming reservations list below calendar */}
      {reservations.length > 0 && hoveredRes === null && (
        <div style={{ marginTop: 8 }}>
          {reservations.slice(0, 5).map((r, i) => (
            <div key={r.id} style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0',
              borderBottom: i < Math.min(reservations.length, 5) - 1 ? '1px solid #F0EBE6' : 'none',
              fontSize: 12, fontFamily: 'DM Sans, sans-serif', color: D,
            }}
              onMouseEnter={() => setHoveredRes(i)}
              onMouseLeave={() => setHoveredRes(null)}
            >
              <span style={{ width: 4, height: 16, borderRadius: 2, background: BAR_COLORS[i % BAR_COLORS.length], flexShrink: 0, alignSelf: 'flex-start', marginTop: 4 }} />
              <span style={{ flex: 1, overflow: 'hidden', minWidth: 0 }}>
                <span style={{ fontWeight: 500, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.guestName || 'Guest'}
                </span>
                {(r.guestEmail || r.guestPhone) && (
                  <span style={{ display: 'block', fontSize: 10, color: '#9B9490', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {[r.guestEmail, r.guestPhone].filter(Boolean).join(' | ')}
                  </span>
                )}
              </span>
              <span style={{ color: '#9B9490', flexShrink: 0, fontSize: 11 }}>
                {new Date(r.checkIn).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                {' - '}
                {new Date(r.checkOut).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </span>
              <span style={{
                fontSize: 10, padding: '2px 6px', borderRadius: 10, fontWeight: 500,
                background: r.status === 'confirmed' ? '#F0FDF4' : r.status === 'cancelled' ? '#FEF2F2' : '#F5F5F5',
                color: r.status === 'confirmed' ? '#16A34A' : r.status === 'cancelled' ? '#DC2626' : '#9B9490',
              }}>
                {r.status}
              </span>
            </div>
          ))}
          {reservations.length > 5 && (
            <div style={{ fontSize: 11, color: '#9B9490', textAlign: 'center', paddingTop: 6 }}>
              +{reservations.length - 5} more
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PropertiesTab({ workspaceId, role, plan }: { workspaceId: string; role: string; plan: string }) {
  const { pricing } = usePricing();
  const PLAN_TIERS_ORDERED = getPlanTiersOrdered(pricing);
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editingProperty, setEditingProperty] = useState<Property | null>(null);
  const [showTrackImport, setShowTrackImport] = useState(false);
  const [showTierWarning, setShowTierWarning] = useState<{ adding: number; nextTier: typeof PLAN_TIERS_ORDERED[number] } | null>(null);
  const [trackDomain, setTrackDomain] = useState(() => localStorage.getItem('homie_track_domain') || '');
  const [trackKey, setTrackKey] = useState(() => localStorage.getItem('homie_track_key') || '');
  const [trackSecret, setTrackSecret] = useState(() => localStorage.getItem('homie_track_secret') || '');
  const [trackImporting, setTrackImporting] = useState(false);
  const [trackResult, setTrackResult] = useState<{ imported: number; updated: number; skipped: number; total: number } | null>(null);
  const [trackError, setTrackError] = useState('');
  const [trackUpdateExisting, setTrackUpdateExisting] = useState(false);
  const [expandedPropertyId, setExpandedPropertyId] = useState<string | null>(null);
  const [reservations, setReservations] = useState<Record<string, Reservation[]>>({});
  const [reservationsLoading, setReservationsLoading] = useState<Record<string, boolean>>({});
  const [syncingReservations, setSyncingReservations] = useState(false);
  const [syncReservationResult, setSyncReservationResult] = useState<{ imported: number; updated: number; total: number } | null>(null);
  const [syncReservationError, setSyncReservationError] = useState('');

  function togglePropertyExpand(propertyId: string) {
    if (expandedPropertyId === propertyId) {
      setExpandedPropertyId(null);
      return;
    }
    setExpandedPropertyId(propertyId);
    if (!reservations[propertyId] && !reservationsLoading[propertyId]) {
      setReservationsLoading(prev => ({ ...prev, [propertyId]: true }));
      const now = new Date();
      const from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
      const nextNext = new Date(now.getFullYear(), now.getMonth() + 2, 0);
      const to = `${nextNext.getFullYear()}-${String(nextNext.getMonth() + 1).padStart(2, '0')}-${String(nextNext.getDate()).padStart(2, '0')}`;
      businessService.getPropertyReservations(workspaceId, propertyId, from, to)
        .then(res => {
          if (res.data) setReservations(prev => ({ ...prev, [propertyId]: res.data!.reservations }));
          else setReservations(prev => ({ ...prev, [propertyId]: [] }));
        })
        .catch(() => setReservations(prev => ({ ...prev, [propertyId]: [] })))
        .finally(() => setReservationsLoading(prev => ({ ...prev, [propertyId]: false })));
    }
  }

  useEffect(() => {
    businessService.listProperties(workspaceId).then(res => {
      if (res.data) setProperties(res.data.sort((a, b) => a.name.localeCompare(b.name)));
      setLoading(false);
    });
  }, [workspaceId]);

  const canEdit = role === 'admin' || role === 'coordinator';
  const propertyLimit = getPlanPropertyLimit(plan, pricing);
  const activeCount = properties.filter(p => p.active).length;
  const atLimit = activeCount >= propertyLimit;

  function checkTierWarning(addCount: number) {
    const newTotal = activeCount + addCount;
    if (newTotal > propertyLimit) {
      const nextTier = PLAN_TIERS_ORDERED.find(t => t.limit >= newTotal && t.plan !== plan);
      if (nextTier) {
        setShowTierWarning({ adding: addCount, nextTier });
        return true;
      }
    }
    return false;
  }

  function formatBeds(beds: BedConfig[] | null): string {
    if (!beds || beds.length === 0) return '';
    return beds.map(b => `${b.count} ${BED_TYPES.find(bt => bt.value === b.type)?.label || b.type}`).join(', ');
  }

  if (loading) return <div style={{ textAlign: 'center', padding: 40, color: '#9B9490' }}>Loading properties...</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h3 style={{ fontFamily: 'Fraunces, serif', fontSize: 20, color: D, margin: 0 }}>Properties</h3>
          <div style={{ fontSize: 13, color: '#9B9490', marginTop: 4 }}>
            {activeCount} of {propertyLimit === 9999 ? 'unlimited' : propertyLimit} properties · {plan.charAt(0).toUpperCase() + plan.slice(1)} plan
          </div>
        </div>
        {canEdit && (
          atLimit ? (
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 13, color: '#DC2626', fontWeight: 600, marginBottom: 4 }}>Property limit reached</div>
              <div style={{ fontSize: 12, color: '#9B9490' }}>Upgrade your plan to add more properties</div>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 8 }}>
              {['professional', 'business', 'enterprise'].includes(plan) ? (
                <>
                  <button onClick={() => setShowTrackImport(true)}
                    style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #E0DAD4', background: '#fff', color: D, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                    Import from Track
                  </button>
                  {properties.length > 0 && (
                    <button onClick={() => setShowTrackImport(true)}
                      style={{ padding: '8px 16px', borderRadius: 8, border: `1px solid ${G}40`, background: `${G}08`, color: G, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                      Sync Reservations
                    </button>
                  )}
                </>
              ) : (
                <button disabled title="Upgrade to Professional to import from PMS"
                  style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #E0DAD4', background: '#fff', color: '#ccc', cursor: 'default', fontSize: 13, fontWeight: 600 }}>
                  Import from Track (Pro+)
                </button>
              )}
              <button onClick={() => {
                if (checkTierWarning(1)) return;
                setShowAdd(true);
              }}
                style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: O, color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>
                + Add Property
              </button>
            </div>
          )
        )}
      </div>

      {properties.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', background: '#FAFAF8', borderRadius: 12, border: '1px dashed #E0DAD4' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🏠</div>
          <div style={{ fontSize: 16, color: D, fontWeight: 600, marginBottom: 8 }}>No properties yet</div>
          <div style={{ fontSize: 14, color: '#9B9490' }}>Add your first property to start managing maintenance.</div>
        </div>
      ) : (
        <div className="bp-prop-grid" style={{ display: 'grid', gap: 12 }}>
          {properties.map(p => {
            const isExpanded = expandedPropertyId === p.id;
            const propReservations = reservations[p.id] ?? [];
            const propLoading = reservationsLoading[p.id] ?? false;
            return (
            <div key={p.id} className="bp-prop-card" style={{
              background: '#fff', borderRadius: 12, border: isExpanded ? `2px solid ${O}` : '1px solid #E0DAD4', overflow: 'hidden',
              opacity: p.active ? 1 : 0.5, cursor: 'pointer', transition: 'all 0.2s',
              boxShadow: isExpanded ? `0 4px 20px ${O}10` : 'none',
            }} onClick={() => togglePropertyExpand(p.id)}>
              <div style={{ display: 'flex' }}>
              {p.photoUrls && p.photoUrls.length > 0 && (
                <div className="bp-prop-img" style={{ width: 120, minHeight: 100, flexShrink: 0 }}>
                  <img src={p.photoUrls[0]} alt={p.name}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                </div>
              )}
              <div className="bp-prop-body" style={{ padding: 20, flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <div style={{ minWidth: 0 }}>
                  <div className="bp-prop-name" style={{ fontSize: 16, fontWeight: 600, color: D, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                  {p.address && (
                    <div className="bp-prop-addr" style={{ fontSize: 14, color: '#6B6560', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.address}{p.city ? `, ${p.city}` : ''}{p.state ? `, ${p.state}` : ''} {p.zipCode || ''}
                    </div>
                  )}
                </div>
                <div className="bp-prop-actions" style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                  {canEdit && (
                    <button onClick={(e) => { e.stopPropagation(); setEditingProperty(p); }} style={{
                      padding: '4px 12px', borderRadius: 6, border: '1px solid #E0DAD4', background: '#fff',
                      fontSize: 12, cursor: 'pointer', color: '#6B6560', fontWeight: 500,
                    }}>Edit</button>
                  )}
                  <span className="bp-prop-badge" style={{
                    fontSize: 12, padding: '4px 10px', borderRadius: 20, fontWeight: 600,
                    background: p.active ? '#F0FDF4' : '#F5F5F5',
                    color: p.active ? '#16A34A' : '#9B9490',
                  }}>
                    {p.active ? 'Active' : 'Inactive'}
                  </span>
                  <span className="bp-prop-badge bp-prop-type" style={{
                    fontSize: 12, padding: '4px 10px', borderRadius: 20,
                    background: '#EFF6FF', color: '#2563EB', fontWeight: 500,
                  }}>
                    {PROPERTY_TYPES[p.propertyType] || p.propertyType}
                  </span>
                </div>
              </div>

              {/* Detail chips */}
              <div className="bp-prop-details" style={{ display: 'flex', gap: 8, marginTop: 10, fontSize: 13, color: '#9B9490', flexWrap: 'wrap' }}>
                {p.bedrooms != null && p.bedrooms > 0 && <span>{p.bedrooms} bd</span>}
                {p.bathrooms != null && +p.bathrooms > 0 && <span>{p.bathrooms} ba</span>}
                {p.sqft != null && p.sqft > 0 && <span>{p.sqft.toLocaleString()} sqft</span>}
                {p.beds && p.beds.length > 0 && (
                  <span>{p.beds.map(b => `${b.count} ${BED_TYPES.find(bt => bt.value === b.type)?.label || b.type}`).join(', ')}</span>
                )}
              </div>

              {p.notes && <div className="bp-prop-notes" style={{ fontSize: 13, color: '#6B6560', marginTop: 8, fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.notes}</div>}
              </div>
              </div>

              {/* Expanded: Reservation Calendar */}
              {isExpanded && (
                <div style={{ borderTop: '1px solid #E0DAD4', padding: '16px 20px' }} onClick={e => e.stopPropagation()}>
                  <div style={{ fontFamily: 'Fraunces, serif', fontSize: 14, fontWeight: 600, color: D, marginBottom: 12 }}>Reservations</div>
                  {propLoading ? (
                    <div style={{ textAlign: 'center', padding: '20px 0', color: '#9B9490', fontSize: 13 }}>Loading reservations...</div>
                  ) : propReservations.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '20px 0', color: '#9B9490', fontSize: 13, background: '#FAFAF8', borderRadius: 8 }}>No upcoming reservations</div>
                  ) : (
                    <MiniCalendar reservations={propReservations} />
                  )}
                </div>
              )}
            </div>
            );
          })}
        </div>
      )}

      {showAdd && (
        <AddPropertyModal workspaceId={workspaceId} onClose={() => setShowAdd(false)}
          onCreated={p => { setProperties(prev => [p, ...prev]); setShowAdd(false); }} />
      )}

      {editingProperty && (
        <EditPropertyModal workspaceId={workspaceId} property={editingProperty}
          onClose={() => setEditingProperty(null)}
          onUpdated={p => { setProperties(prev => prev.map(x => x.id === p.id ? p : x)); setEditingProperty(null); }}
          onDeleted={id => { setProperties(prev => prev.filter(x => x.id !== id)); setEditingProperty(null); }} />
      )}

      {/* Track PMS Import Modal */}
      {/* Tier upgrade warning */}
      {showTierWarning && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}
          onClick={() => setShowTierWarning(null)}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 24, width: '100%', maxWidth: 420, boxShadow: '0 16px 48px rgba(0,0,0,0.15)' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>⬆️</div>
              <h3 style={{ fontFamily: 'Fraunces, serif', fontSize: 20, color: D, margin: '0 0 8px' }}>Plan upgrade required</h3>
              <p style={{ fontSize: 14, color: '#6B6560', lineHeight: 1.6, margin: 0 }}>
                Adding {showTierWarning.adding === 1 ? 'this property' : `${showTierWarning.adding} properties`} will exceed your <strong>{plan.charAt(0).toUpperCase() + plan.slice(1)}</strong> plan limit of <strong>{propertyLimit} properties</strong>.
              </p>
              <p style={{ fontSize: 14, color: '#6B6560', lineHeight: 1.6, marginTop: 8 }}>
                You'll be moved to the <strong style={{ color: O }}>{showTierWarning.nextTier.label}</strong> plan ({showTierWarning.nextTier.price}).
              </p>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setShowTierWarning(null)}
                style={{ flex: 1, padding: '12px 0', borderRadius: 10, border: '1px solid #E0DAD4', background: '#fff', color: D, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={() => { setShowTierWarning(null); setShowAdd(true); }}
                style={{ flex: 1, padding: '12px 0', borderRadius: 10, border: 'none', background: O, color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                Continue & Upgrade
              </button>
            </div>
          </div>
        </div>
      )}

      {showTrackImport && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}
          onClick={() => { if (!trackImporting) { setShowTrackImport(false); setTrackResult(null); setTrackError(''); } }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 24, width: '100%', maxWidth: 440, boxShadow: '0 16px 48px rgba(0,0,0,0.15)' }}
            onClick={e => e.stopPropagation()}>
            <h3 style={{ fontFamily: 'Fraunces, serif', fontSize: 20, color: D, margin: '0 0 4px' }}>Import from Track PMS</h3>
            <p style={{ fontSize: 14, color: '#9B9490', marginBottom: 20 }}>Connect your Track account to import properties automatically.</p>

            {trackResult ? (
              <div>
                <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 12, padding: 20, textAlign: 'center', marginBottom: 16 }}>
                  <div style={{ fontSize: 36, marginBottom: 8 }}>✅</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: D, marginBottom: 4 }}>
                    {trackResult.imported > 0 && `${trackResult.imported} imported`}
                    {trackResult.imported > 0 && trackResult.updated > 0 && ', '}
                    {trackResult.updated > 0 && `${trackResult.updated} updated`}
                    {trackResult.imported === 0 && trackResult.updated === 0 && 'No changes needed'}
                  </div>
                  {trackResult.skipped > 0 && (
                    <div style={{ fontSize: 13, color: '#6B6560' }}>{trackResult.skipped} unchanged (skipped)</div>
                  )}
                  <div style={{ fontSize: 13, color: '#9B9490', marginTop: 4 }}>{trackResult.total} total found in Track</div>
                </div>
                <button onClick={() => {
                  setShowTrackImport(false); setTrackResult(null); setTrackError('');
                  // Refresh properties list
                  businessService.listProperties(workspaceId).then(res => { if (res.data) setProperties(res.data.sort((a, b) => a.name.localeCompare(b.name))); });
                }} style={{ width: '100%', padding: '12px 0', borderRadius: 10, border: 'none', background: O, color: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>
                  Done
                </button>
              </div>
            ) : (
              <div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#6B6560', marginBottom: 4 }}>Track Domain</label>
                    <input value={trackDomain} onChange={e => { setTrackDomain(e.target.value); localStorage.setItem('homie_track_domain', e.target.value); }} placeholder="yourcompany.trackhs.com"
                      style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #E0DAD4', fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
                    <div style={{ fontSize: 11, color: '#9B9490', marginTop: 2 }}>e.g. yourcompany.trackhs.com or yourcompany.trackhs.com/api</div>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#6B6560', marginBottom: 4 }}>API Key</label>
                    <input value={trackKey} onChange={e => { setTrackKey(e.target.value); localStorage.setItem('homie_track_key', e.target.value); }} placeholder="Your Track API key"
                      style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #E0DAD4', fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#6B6560', marginBottom: 4 }}>API Secret</label>
                    <input value={trackSecret} onChange={e => { setTrackSecret(e.target.value); localStorage.setItem('homie_track_secret', e.target.value); }} placeholder="Your Track API secret" type="password"
                      style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #E0DAD4', fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                </div>

                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14, color: D }}>
                  <input type="checkbox" checked={trackUpdateExisting} onChange={e => setTrackUpdateExisting(e.target.checked)}
                    style={{ width: 16, height: 16, accentColor: O }} />
                  Update existing properties with latest data from Track
                </label>

                {trackError && (
                  <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#B91C1C', marginBottom: 12 }}>
                    {trackError}
                  </div>
                )}

                {syncReservationResult && (
                  <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#16A34A', marginBottom: 12 }}>
                    Reservations synced: {syncReservationResult.imported} imported, {syncReservationResult.updated} updated ({syncReservationResult.total} total)
                  </div>
                )}

                {syncReservationError && (
                  <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#B91C1C', marginBottom: 12 }}>
                    {syncReservationError}
                  </div>
                )}

                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={() => { setShowTrackImport(false); setTrackError(''); setSyncReservationResult(null); setSyncReservationError(''); }}
                    style={{ flex: 1, padding: '12px 0', borderRadius: 10, border: '1px solid #E0DAD4', background: '#fff', color: D, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                    Cancel
                  </button>
                  <button
                    disabled={trackImporting || !trackDomain.trim() || !trackKey.trim() || !trackSecret.trim()}
                    onClick={async () => {
                      setTrackImporting(true); setTrackError('');
                      try {
                        const res = await businessService.importFromTrack(workspaceId, {
                          track_domain: trackDomain.trim(),
                          api_key: trackKey.trim(),
                          api_secret: trackSecret.trim(),
                          update_existing: trackUpdateExisting,
                        });
                        if (res.error) { setTrackError(res.error); }
                        else if (res.data) {
                          if (res.data.total === 0 && res.meta?.hint) {
                            setTrackError(`Connected to Track but found 0 properties. Debug: ${res.meta.hint || 'No arrays found in response'}. Keys: ${(res.meta.debug_keys as string[])?.join(', ') || 'unknown'}`);
                          } else {
                            setTrackResult(res.data);
                            // Check if import pushed over tier limit
                            if (res.data.imported > 0) {
                              const newTotal = activeCount + res.data.imported;
                              if (newTotal > propertyLimit) {
                                const nextTier = PLAN_TIERS_ORDERED.find(t => t.limit >= newTotal && t.plan !== plan);
                                if (nextTier) {
                                  setTrackError(`Import complete, but you now have ${newTotal} properties which exceeds your ${plan.charAt(0).toUpperCase() + plan.slice(1)} plan limit of ${propertyLimit}. You'll need to upgrade to ${nextTier.label} (${nextTier.price}).`);
                                }
                              }
                            }
                          }
                        }
                      } catch (err) {
                        setTrackError(err instanceof Error ? err.message : 'Import failed');
                      }
                      setTrackImporting(false);
                    }}
                    style={{
                      flex: 1, padding: '12px 0', borderRadius: 10, border: 'none', fontSize: 14, fontWeight: 600, cursor: 'pointer',
                      background: (!trackDomain.trim() || !trackKey.trim() || !trackSecret.trim()) ? '#E0DAD4' : O,
                      color: (!trackDomain.trim() || !trackKey.trim() || !trackSecret.trim()) ? '#9B9490' : '#fff',
                      opacity: trackImporting ? 0.7 : 1,
                    }}>
                    {trackImporting ? 'Importing...' : 'Import Properties'}
                  </button>
                </div>

                {/* Sync Reservations button - only shown when properties already exist */}
                {properties.length > 0 && (
                  <button
                    disabled={syncingReservations || !trackDomain.trim() || !trackKey.trim() || !trackSecret.trim()}
                    onClick={async () => {
                      setSyncingReservations(true); setSyncReservationError(''); setSyncReservationResult(null);
                      try {
                        const res = await businessService.importTrackReservations(workspaceId, {
                          track_domain: trackDomain.trim(),
                          api_key: trackKey.trim(),
                          api_secret: trackSecret.trim(),
                        });
                        if (res.error) { setSyncReservationError(res.error); }
                        else if (res.data) {
                          setSyncReservationResult(res.data);
                          // Clear cached reservations so they refresh on next expand
                          setReservations({});
                        }
                      } catch (err) {
                        setSyncReservationError(err instanceof Error ? err.message : 'Reservation sync failed');
                      }
                      setSyncingReservations(false);
                    }}
                    style={{
                      width: '100%', marginTop: 10, padding: '10px 0', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                      border: `1px solid ${G}40`, background: `${G}08`, color: G,
                      opacity: (syncingReservations || !trackDomain.trim() || !trackKey.trim() || !trackSecret.trim()) ? 0.5 : 1,
                    }}>
                    {syncingReservations ? 'Syncing Reservations...' : 'Sync Reservations'}
                  </button>
                )}

                <div style={{ marginTop: 16, padding: '12px 14px', background: '#F9F5F2', borderRadius: 8, fontSize: 12, color: '#9B9490', lineHeight: 1.5 }}>
                  <strong style={{ color: '#6B6560' }}>Where to find your API credentials:</strong><br />
                  Contact your Track PMS administrator or Track support to obtain your API key and secret. Your domain is the URL you use to log into Track (e.g. yourcompany.trackhs.com).
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Dashboard Tab ──────────────────────────────────────────────────────── */

function trendArrow(current: number, previous: number): { text: string; color: string } {
  if (previous === 0) return current > 0 ? { text: `+${current}`, color: G } : { text: '—', color: '#9B9490' };
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct > 0) return { text: `↑ ${pct}%`, color: G };
  if (pct < 0) return { text: `↓ ${Math.abs(pct)}%`, color: '#DC2626' };
  return { text: '→ 0%', color: '#9B9490' };
}

function DashboardTab({ workspace, onNavigate }: { workspace: WorkspaceDetail; onNavigate: (tab: Tab, jobId?: string) => void }) {
  const navigate = useNavigate();
  const [data, setData] = useState<DashboardData | null>(null);
  const [suggestions, setSuggestions] = useState<SeasonalSuggestion[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [loading, setLoading] = useState(true);
  const [suggestionsGeneratedAt, setSuggestionsGeneratedAt] = useState<string | null>(null);
  const [dispatchSuggestion, setDispatchSuggestion] = useState<SeasonalSuggestion | null>(null);
  const [allProperties, setAllProperties] = useState<Property[]>([]);

  useEffect(() => {
    businessService.listProperties(workspace.id).then(res => {
      if (res.data) setAllProperties(res.data.filter(p => p.active).sort((a, b) => a.name.localeCompare(b.name)));
    }).catch(() => {});
  }, [workspace.id]);

  useEffect(() => {
    businessService.getDashboard(workspace.id).then(res => {
      if (res.data) setData(res.data);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [workspace.id]);

  function loadSuggestions(force = false) {
    // Check localStorage cache (24-hour TTL)
    const cacheKey = `homie_seasonal_${workspace.id}`;
    if (!force) {
      try {
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
          const { suggestions: cachedSuggestions, generatedAt } = JSON.parse(cached) as { suggestions: SeasonalSuggestion[]; generatedAt: string };
          const age = Date.now() - new Date(generatedAt).getTime();
          if (age < 24 * 60 * 60 * 1000 && cachedSuggestions.length > 0) {
            setSuggestions(cachedSuggestions);
            setSuggestionsGeneratedAt(generatedAt);
            return;
          }
        }
      } catch { /* ignore bad cache */ }
    }

    setLoadingSuggestions(true);
    businessService.getSeasonalSuggestions(workspace.id).then(res => {
      if (res.data && res.data.length > 0) {
        setSuggestions(res.data);
        const now = new Date().toISOString();
        setSuggestionsGeneratedAt(now);
        try { localStorage.setItem(cacheKey, JSON.stringify({ suggestions: res.data, generatedAt: now })); } catch { /* ignore */ }
      }
    }).catch(() => {}).finally(() => setLoadingSuggestions(false));
  }

  useEffect(() => { loadSuggestions(); }, [workspace.id]);

  if (loading) return <div style={{ textAlign: 'center', padding: 40, color: '#9B9490' }}>Loading dashboard...</div>;
  if (!data) return <div style={{ textAlign: 'center', padding: 40, color: '#9B9490' }}>Failed to load dashboard</div>;

  const dispatchTrend = trendArrow(data.dispatches_this_month, data.dispatches_last_month);
  const bookingTrend = trendArrow(data.bookings_this_month, data.bookings_last_month);

  const CAT_COLORS: Record<string, string> = {
    plumbing: '#3B82F6', electrical: '#F59E0B', hvac: '#8B5CF6', appliance: '#EC4899',
    roofing: '#6366F1', cleaning: '#14B8A6', pool: '#06B6D4', landscaping: '#22C55E',
    pest_control: '#EF4444', painting: '#F97316', general: '#6B7280',
  };

  const maxCatCount = Math.max(...data.dispatches_by_category.map(c => c.count), 1);

  return (
    <div>
      {/* ── KPI Cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 24 }}>
        {[
          { label: 'Active Dispatches', value: data.active_dispatches, icon: '📡', color: O, sub: null },
          { label: 'Completed This Month', value: data.completed_this_month, icon: '✅', color: G, sub: dispatchTrend },
          { label: 'Total Bookings', value: data.total_bookings, icon: '📋', color: '#3B82F6', sub: bookingTrend },
          { label: 'Avg Response Time', value: data.avg_response_minutes != null ? `${data.avg_response_minutes}m` : '—', icon: '⚡', color: '#8B5CF6', sub: null },
        ].map(kpi => (
          <div key={kpi.label} style={{ background: '#fff', borderRadius: 14, border: '1px solid #E0DAD4', padding: '18px 20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 13, color: '#9B9490', fontWeight: 500 }}>{kpi.label}</span>
              <span style={{ fontSize: 20 }}>{kpi.icon}</span>
            </div>
            <div style={{ fontSize: 28, fontWeight: 700, color: D }}>{kpi.value}</div>
            {kpi.sub && (
              <div style={{ fontSize: 12, fontWeight: 600, color: kpi.sub.color, marginTop: 4 }}>
                {kpi.sub.text} vs last month
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ── Middle row: Category breakdown + Top vendors ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 24 }}>
        {/* Category breakdown */}
        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #E0DAD4', padding: 20 }}>
          <h4 style={{ fontSize: 14, fontWeight: 700, color: D, margin: '0 0 14px' }}>Dispatches by Category</h4>
          {data.dispatches_by_category.length === 0 ? (
            <div style={{ fontSize: 13, color: '#9B9490', padding: '20px 0', textAlign: 'center' }}>No dispatches yet</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {data.dispatches_by_category.slice(0, 8).map(cat => (
                <div key={cat.category}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 12, fontWeight: 500, color: '#6B6560', textTransform: 'capitalize' }}>{cat.category.replace(/_/g, ' ')}</span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: D }}>{cat.count}</span>
                  </div>
                  <div style={{ height: 6, borderRadius: 3, background: '#F0EDE9' }}>
                    <div style={{ height: '100%', borderRadius: 3, background: CAT_COLORS[cat.category] ?? O, width: `${(cat.count / maxCatCount) * 100}%`, transition: 'width 0.5s ease' }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top vendors */}
        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #E0DAD4', padding: 20 }}>
          <h4 style={{ fontSize: 14, fontWeight: 700, color: D, margin: '0 0 14px' }}>Top Providers</h4>
          {data.top_vendors.length === 0 ? (
            <div style={{ fontSize: 13, color: '#9B9490', padding: '20px 0', textAlign: 'center' }}>No bookings yet</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {data.top_vendors.map((v, i) => (
                <div key={v.name} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%', background: `${O}15`, color: O,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0,
                  }}>
                    {i + 1}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: D, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.name}</div>
                    <div style={{ fontSize: 11, color: '#9B9490' }}>
                      {v.booking_count} booking{v.booking_count !== 1 ? 's' : ''}{v.avg_rating ? ` · ★ ${v.avg_rating}` : ''}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Recent Activity ── */}
      <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #E0DAD4', padding: 20, marginBottom: 24 }}>
        <h4 style={{ fontSize: 14, fontWeight: 700, color: D, margin: '0 0 14px' }}>Recent Activity</h4>
        {data.recent_activity.length === 0 ? (
          <div style={{ fontSize: 13, color: '#9B9490', padding: '20px 0', textAlign: 'center' }}>No recent activity</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {data.recent_activity.map((a, i) => {
              const icon = a.type === 'dispatch' ? '📡' : a.type === 'quote' ? '💬' : a.type === 'booking' ? '✅' : '❌';
              const typeColor = a.type === 'dispatch' ? O : a.type === 'quote' ? '#3B82F6' : a.type === 'booking' ? G : '#DC2626';
              return (
                <div key={i} onClick={() => {
                  if (a.type === 'booking') onNavigate('bookings', a.job_id);
                  else onNavigate('dispatches', a.job_id);
                }} style={{ display: 'flex', gap: 12, padding: '10px 0', borderBottom: i < data.recent_activity.length - 1 ? '1px solid #F0EDE9' : 'none', cursor: 'pointer', borderRadius: 6, transition: 'background 0.15s' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#FAFAF8'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <span style={{ fontSize: 16, flexShrink: 0, marginTop: 2 }}>{icon}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: D }}>{a.title}</div>
                    <div style={{ fontSize: 11, color: '#9B9490', marginTop: 2 }}>
                      {a.property_name && <span>{a.property_name}</span>}
                      {a.provider_name && <span> · {a.provider_name}</span>}
                      <span> · {new Date(a.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
                    </div>
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 600, color: typeColor, textTransform: 'uppercase', flexShrink: 0, marginTop: 2 }}>
                    {a.type}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Seasonal Prep Suggestions ── */}
      <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #E0DAD4', padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div>
            <h4 style={{ fontSize: 14, fontWeight: 700, color: D, margin: 0 }}>Seasonal Prep Suggestions</h4>
            <div style={{ fontSize: 12, color: '#9B9490', marginTop: 2 }}>AI-generated based on your properties, locations, and time of year</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {suggestionsGeneratedAt && (
              <span style={{ fontSize: 11, color: '#9B9490' }}>
                Generated {new Date(suggestionsGeneratedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
              </span>
            )}
            <button onClick={() => loadSuggestions(true)} disabled={loadingSuggestions}
              style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid #E0DAD4', background: '#fff', fontSize: 12, fontWeight: 600, color: '#6B6560', cursor: 'pointer', opacity: loadingSuggestions ? 0.5 : 1 }}>
              {loadingSuggestions ? 'Generating...' : '🔄 Regenerate'}
            </button>
          </div>
        </div>

        {loadingSuggestions && suggestions.length === 0 && (
          <div style={{ textAlign: 'center', padding: '30px 0' }}>
            <div style={{ width: 24, height: 24, border: `3px solid ${O}30`, borderTopColor: O, borderRadius: '50%', margin: '0 auto 10px', animation: 'spin 0.7s linear infinite' }} />
            <div style={{ fontSize: 13, color: '#9B9490' }}>Analyzing your properties and generating suggestions...</div>
          </div>
        )}

        {suggestions.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
            {suggestions.map((s, i) => {
              const priorityColor = s.priority === 'high' ? '#DC2626' : s.priority === 'medium' ? '#D4A017' : G;
              return (
                <div key={i} style={{ background: W, borderRadius: 12, padding: 16, border: '1px solid #E0DAD4' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: D, lineHeight: 1.3 }}>{s.title}</div>
                    <span style={{ fontSize: 10, fontWeight: 600, color: priorityColor, background: `${priorityColor}15`, padding: '2px 8px', borderRadius: 100, flexShrink: 0, marginLeft: 8, textTransform: 'capitalize' }}>{s.priority}</span>
                  </div>
                  <div style={{ fontSize: 12, color: '#6B6560', lineHeight: 1.5, marginBottom: 8 }}>{s.description}</div>
                  <div style={{ fontSize: 11, color: '#9B9490', marginBottom: 10 }}>
                    <span style={{ textTransform: 'capitalize' }}>{s.category.replace(/_/g, ' ')}</span>
                    {s.properties.length > 0 && <span> · {s.properties.slice(0, 3).join(', ')}{s.properties.length > 3 ? ` +${s.properties.length - 3} more` : ''}</span>}
                  </div>
                  <div style={{ fontSize: 11, color: O, fontStyle: 'italic', marginBottom: 10 }}>{s.reason}</div>
                  <button onClick={() => setDispatchSuggestion(s)}
                    style={{
                      width: '100%', padding: '8px 0', borderRadius: 8, border: 'none',
                      background: O, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    }}>
                    Dispatch
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {!loadingSuggestions && suggestions.length === 0 && (
          <div style={{ textAlign: 'center', padding: '30px 0', color: '#9B9490', fontSize: 13 }}>
            No seasonal suggestions available. Add properties to get AI-driven maintenance recommendations.
          </div>
        )}
      </div>

      {/* Property picker for suggestion dispatch */}
      {dispatchSuggestion && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}
          onClick={() => setDispatchSuggestion(null)}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 24, width: '100%', maxWidth: 440, maxHeight: '80vh', overflow: 'auto', boxShadow: '0 16px 48px rgba(0,0,0,0.15)' }}
            onClick={e => e.stopPropagation()}>
            <h3 style={{ fontFamily: 'Fraunces, serif', fontSize: 18, color: D, margin: '0 0 4px' }}>Select Property to Dispatch</h3>
            <div style={{ fontSize: 13, color: '#6B6560', marginBottom: 16 }}>
              <strong>{dispatchSuggestion.title}</strong> — {dispatchSuggestion.description}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 350, overflowY: 'auto' }}>
              {allProperties
                .sort((a, b) => {
                  const aMatch = dispatchSuggestion!.properties.some(n => a.name.includes(n) || n.includes(a.name));
                  const bMatch = dispatchSuggestion!.properties.some(n => b.name.includes(n) || n.includes(b.name));
                  if (aMatch && !bMatch) return -1;
                  if (!aMatch && bMatch) return 1;
                  return a.name.localeCompare(b.name);
                })
                .map(p => {
                  const isRecommended = dispatchSuggestion!.properties.some(n => p.name.includes(n) || n.includes(p.name));
                  return (
                    <button key={p.id} onClick={() => {
                      const params = new URLSearchParams({
                        workspace: workspace.id,
                        property: p.id,
                        category: dispatchSuggestion!.category,
                        prefill: dispatchSuggestion!.title,
                        description: dispatchSuggestion!.description,
                      });
                      setDispatchSuggestion(null);
                      navigate(`/business/chat?${params.toString()}`);
                    }} style={{
                      display: 'flex', alignItems: 'center', padding: '12px 14px', borderRadius: 10, cursor: 'pointer',
                      border: isRecommended ? `2px solid ${O}` : '1px solid #E0DAD4',
                      background: isRecommended ? `${O}04` : '#fff', textAlign: 'left',
                      fontFamily: "'DM Sans', sans-serif", transition: 'all 0.15s',
                    }}
                      onMouseEnter={e => { if (!isRecommended) e.currentTarget.style.borderColor = O; }}
                      onMouseLeave={e => { if (!isRecommended) e.currentTarget.style.borderColor = '#E0DAD4'; }}
                    >
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: D }}>{p.name}</div>
                        {p.city && <div style={{ fontSize: 12, color: '#9B9490', marginTop: 2 }}>{p.city}{p.state ? `, ${p.state}` : ''}</div>}
                      </div>
                      {isRecommended && <span style={{ fontSize: 10, fontWeight: 600, color: O, background: `${O}12`, padding: '2px 8px', borderRadius: 100, flexShrink: 0 }}>Suggested</span>}
                    </button>
                  );
                })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Billing Tab ───────────────────────────────────────────────────────── */

function getBillingPlans(pricing: PricingConfig) {
  const bp = pricing.business;
  return [
    { plan: 'starter',      label: 'Starter',       price: bp.starter?.base      ?? 0,   promoPrice: bp.starter?.promoBase      ?? null, promoLabel: bp.starter?.promoLabel      ?? null, perProperty: bp.starter?.perProperty      ?? 10, maxProperties: bp.starter?.maxProperties      ?? 10,  maxMembers: bp.starter?.maxTeamMembers      ?? 1,  features: [`Up to ${bp.starter?.maxProperties ?? 10} properties`, '1 user', 'Unlimited searches', 'Preferred providers (up to 5)', 'Basic cost tracking'] },
    { plan: 'professional', label: 'Professional',   price: bp.professional?.base ?? 99,  promoPrice: bp.professional?.promoBase ?? null, promoLabel: bp.professional?.promoLabel ?? null, perProperty: bp.professional?.perProperty ?? 10, maxProperties: bp.professional?.maxProperties ?? 50,  maxMembers: bp.professional?.maxTeamMembers ?? 5,  features: [`Up to ${bp.professional?.maxProperties ?? 50} properties`, `${bp.professional?.maxTeamMembers ?? 5} team members`, 'PMS import with sync', 'Full cost reporting', 'Provider scorecards', 'Slack integration', 'Estimate summary PDF'] },
    { plan: 'business',     label: 'Business',       price: bp.business?.base     ?? 249, promoPrice: bp.business?.promoBase     ?? null, promoLabel: bp.business?.promoLabel     ?? null, perProperty: bp.business?.perProperty     ?? 10, maxProperties: bp.business?.maxProperties     ?? 150, maxMembers: bp.business?.maxTeamMembers     ?? 15, features: [`Up to ${bp.business?.maxProperties ?? 150} properties`, `${bp.business?.maxTeamMembers ?? 15} team members with roles`, 'Multi-PMS import', 'Priority outreach', 'Advanced analytics', 'API access'] },
  ];
}

function BillingTab({ workspace, onUpdated }: { workspace: WorkspaceDetail; onUpdated: (w: WorkspaceDetail) => void }) {
  const { pricing } = usePricing();
  const BILLING_PLANS = getBillingPlans(pricing);
  const [usage, setUsage] = useState<{
    plan: string; searches_used: number; searches_limit: number;
    searches_remaining: number;
    base_price: number; per_property_price: number;
    searches_per_property: number; property_count: number;
    billing_cycle_start: string; billing_cycle_end: string;
  } | null>(null);
  const [changingPlan, setChangingPlan] = useState<string | null>(null);
  const [showCancel, setShowCancel] = useState(false);

  useEffect(() => {
    businessService.getUsage(workspace.id).then(res => {
      if (res.data) setUsage(res.data);
    }).catch(() => {});
  }, [workspace.id]);

  async function handlePlanChange(newPlan: string) {
    setChangingPlan(newPlan);
    try {
      const res = await businessService.updateWorkspace(workspace.id, { plan: newPlan } as Record<string, unknown>);
      if (res.data) {
        onUpdated({ ...workspace, plan: newPlan });
        // Refresh usage
        const usageRes = await businessService.getUsage(workspace.id);
        if (usageRes.data) setUsage(usageRes.data);
      }
    } catch { /* ignore */ }
    setChangingPlan(null);
  }

  return (
    <div>
      {/* Current plan & usage */}
      {usage && (
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E0DAD4', padding: 24, marginBottom: 24 }}>
          <h4 style={{ fontFamily: 'Fraunces, serif', fontSize: 18, color: D, margin: '0 0 20px' }}>Current Plan & Usage</h4>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 16 }}>
            <div style={{ background: W, borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: '#9B9490', marginBottom: 2 }}>Plan</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: D, textTransform: 'capitalize' }}>{usage.plan}</div>
            </div>
            <div style={{ background: W, borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: '#9B9490', marginBottom: 2 }}>Properties</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: D }}>{usage.property_count}</div>
            </div>
            <div style={{ background: W, borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: '#9B9490', marginBottom: 2 }}>Per property</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: D }}>$10/mo</div>
            </div>
            <div style={{ background: W, borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: '#9B9490', marginBottom: 2 }}>Est. monthly</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: O }}>${usage.base_price + 10 * usage.property_count}/mo</div>
            </div>
          </div>

          <div style={{ background: W, borderRadius: 10, padding: '14px 16px' }}>
            <div style={{ fontSize: 13, color: '#6B6560', lineHeight: 1.6 }}>
              <strong style={{ color: D }}>Unlimited searches</strong> — your plan includes unlimited diagnostic chats and outreach searches across all properties. Fair use: 5 searches per property per month.
            </div>
            <div style={{ fontSize: 12, color: '#9B9490', marginTop: 8 }}>
              Searches this cycle: <strong style={{ color: D }}>{usage.searches_used}</strong> · Resets {new Date(usage.billing_cycle_end).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </div>
          </div>
        </div>
      )}

      {/* Plan comparison */}
      <div style={{ marginBottom: 24 }}>
        <h4 style={{ fontFamily: 'Fraunces, serif', fontSize: 18, color: D, margin: '0 0 16px' }}>Change Plan</h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
          {BILLING_PLANS.map(p => {
            const isCurrent = workspace.plan === p.plan;
            const isDowngrade = BILLING_PLANS.findIndex(x => x.plan === workspace.plan) > BILLING_PLANS.findIndex(x => x.plan === p.plan);
            const propertyCount = usage?.property_count ?? 0;
            const exceedsLimit = isDowngrade && propertyCount > p.maxProperties;
            return (
              <div key={p.plan} style={{
                background: '#fff', borderRadius: 14, padding: 20,
                border: isCurrent ? `2px solid ${O}` : '1px solid #E0DAD4',
                position: 'relative',
              }}>
                {isCurrent && (
                  <div style={{ position: 'absolute', top: -10, left: '50%', transform: 'translateX(-50)', background: O, color: '#fff', fontSize: 10, fontWeight: 700, padding: '3px 12px', borderRadius: 100 }}>CURRENT</div>
                )}
                <div style={{ fontSize: 18, fontWeight: 700, color: D, marginBottom: 2 }}>{p.label}</div>
                <div style={{ marginBottom: 4 }}>
                  <span style={{ fontSize: 28, fontWeight: 700, color: D }}>${p.promoPrice ?? p.price}</span>
                  <span style={{ fontSize: 13, color: '#9B9490' }}>/mo</span>
                  {p.promoPrice != null && (
                    <span style={{ fontSize: 14, color: '#9B9490', textDecoration: 'line-through', marginLeft: 6 }}>${p.price}</span>
                  )}
                  <span style={{ fontSize: 12, color: '#6B6560', marginLeft: 4 }}>+ ${p.perProperty}/property</span>
                </div>
                {p.promoLabel && <div style={{ fontSize: 11, fontWeight: 600, color: O, marginBottom: 8 }}>{p.promoLabel}</div>}
                <div style={{ borderTop: '1px solid #E0DAD4', paddingTop: 12, marginBottom: 14 }}>
                  {p.features.map((f, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, fontSize: 13, color: '#6B6560' }}>
                      <span style={{ color: G, fontSize: 11 }}>✓</span> {f}
                    </div>
                  ))}
                </div>
                {isCurrent ? (
                  <div style={{ textAlign: 'center', fontSize: 13, color: '#9B9490', fontWeight: 600, padding: '10px 0' }}>Your current plan</div>
                ) : exceedsLimit ? (
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ padding: '10px 0', fontSize: 13, color: '#DC2626', fontWeight: 600 }}>
                      You have {propertyCount} properties (max {p.maxProperties})
                    </div>
                    <div style={{ fontSize: 11, color: '#9B9490' }}>Remove properties to downgrade</div>
                  </div>
                ) : (
                  <button disabled={changingPlan === p.plan} onClick={() => handlePlanChange(p.plan)}
                    style={{
                      width: '100%', padding: '10px 0', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer',
                      border: isDowngrade ? '1px solid #E0DAD4' : 'none',
                      background: isDowngrade ? '#fff' : O,
                      color: isDowngrade ? D : '#fff',
                      opacity: changingPlan === p.plan ? 0.6 : 1,
                    }}>
                    {changingPlan === p.plan ? 'Changing...' : isDowngrade ? 'Downgrade' : 'Upgrade'}
                  </button>
                )}
              </div>
            );
          })}
        </div>
        <div style={{ textAlign: 'center', marginTop: 12 }}>
          <span style={{ fontSize: 13, color: '#9B9490' }}>Need 150+ properties? </span>
          <a href="mailto:yo@homiepro.ai" style={{ fontSize: 13, color: O, fontWeight: 600, textDecoration: 'none' }}>Contact us for Enterprise pricing →</a>
        </div>
      </div>

      {/* Cancel service */}
      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E0DAD4', padding: 24 }}>
        <h4 style={{ fontFamily: 'Fraunces, serif', fontSize: 18, color: D, margin: '0 0 8px' }}>Cancel Service</h4>
        {!showCancel ? (
          <>
            <p style={{ fontSize: 14, color: '#6B6560', marginBottom: 12, lineHeight: 1.6 }}>
              If you cancel, your workspace will remain accessible until the end of your current billing cycle. After that, all data will be retained for 30 days before deletion.
            </p>
            <button onClick={() => setShowCancel(true)}
              style={{ fontSize: 13, color: '#DC2626', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500, padding: 0 }}>
              Cancel my subscription
            </button>
          </>
        ) : (
          <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, padding: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#DC2626', marginBottom: 6 }}>Are you sure?</div>
            <div style={{ fontSize: 13, color: '#6B6560', marginBottom: 12, lineHeight: 1.6 }}>
              Your workspace and all associated data (properties, dispatches, bookings, provider settings) will be deactivated at the end of your billing cycle.
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setShowCancel(false)}
                style={{ flex: 1, padding: '10px 0', borderRadius: 8, border: '1px solid #E0DAD4', background: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', color: D }}>
                Keep my plan
              </button>
              <button onClick={() => { alert('Please contact yo@homiepro.ai to complete your cancellation.'); setShowCancel(false); }}
                style={{ flex: 1, padding: '10px 0', borderRadius: 8, border: 'none', background: '#DC2626', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                Yes, cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Invite Member Modal ────────────────────────────────────────────────── */

const ROLE_OPTIONS = [
  { value: 'admin', label: 'Admin', desc: 'Full access including billing and team management' },
  { value: 'coordinator', label: 'Coordinator', desc: 'Create jobs, manage providers, view reports' },
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

function getPlanMemberLimit(plan: string, pricing: PricingConfig): number {
  return pricing.business[plan]?.maxTeamMembers ?? 1;
}

function TeamTab({ workspaceId, role, ownerId, plan }: { workspaceId: string; role: string; ownerId: string; plan: string }) {
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

/* ── Add Vendor Modal ──────────────────────────────────────────────────── */

const DAYS = [
  { key: 'mon', label: 'Mon' }, { key: 'tue', label: 'Tue' }, { key: 'wed', label: 'Wed' },
  { key: 'thu', label: 'Thu' }, { key: 'fri', label: 'Fri' }, { key: 'sat', label: 'Sat' }, { key: 'sun', label: 'Sun' },
];
const TIME_OPTIONS = ['06:00','07:00','08:00','09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00','19:00','20:00','21:00','22:00'];
function fmtTimeLabel(t: string) { const [h] = t.split(':').map(Number); const ampm = h >= 12 ? 'PM' : 'AM'; return `${h % 12 || 12} ${ampm}`; }

type VendorSched = Record<string, { start: string; end: string } | null>;

function SchedulePicker({ schedule, onChange }: { schedule: VendorSched; onChange: (s: VendorSched) => void }) {
  function toggleDay(day: string) {
    const current = schedule[day];
    onChange({ ...schedule, [day]: current ? null : { start: '08:00', end: '17:00' } });
  }
  function updateTime(day: string, field: 'start' | 'end', val: string) {
    const slot = schedule[day];
    if (!slot) return;
    onChange({ ...schedule, [day]: { ...slot, [field]: val } });
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
        {DAYS.map(d => {
          const active = !!schedule[d.key];
          return (
            <button key={d.key} type="button" onClick={() => toggleDay(d.key)} style={{
              flex: 1, padding: '6px 0', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer',
              border: active ? `2px solid ${O}` : '1px solid #E0DAD4',
              background: active ? `${O}10` : '#fff', color: active ? O : '#9B9490',
            }}>{d.label}</button>
          );
        })}
      </div>
      {DAYS.filter(d => schedule[d.key]).map(d => (
        <div key={d.key} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, fontSize: 13 }}>
          <span style={{ width: 32, fontWeight: 600, color: D, fontSize: 12 }}>{d.label}</span>
          <select value={schedule[d.key]!.start} onChange={e => updateTime(d.key, 'start', e.target.value)}
            style={{ flex: 1, padding: '5px 8px', borderRadius: 6, border: '1px solid #E0DAD4', fontSize: 12, cursor: 'pointer' }}>
            {TIME_OPTIONS.map(t => <option key={t} value={t}>{fmtTimeLabel(t)}</option>)}
          </select>
          <span style={{ color: '#9B9490', fontSize: 11 }}>to</span>
          <select value={schedule[d.key]!.end} onChange={e => updateTime(d.key, 'end', e.target.value)}
            style={{ flex: 1, padding: '5px 8px', borderRadius: 6, border: '1px solid #E0DAD4', fontSize: 12, cursor: 'pointer' }}>
            {TIME_OPTIONS.map(t => <option key={t} value={t}>{fmtTimeLabel(t)}</option>)}
          </select>
        </div>
      ))}
      {DAYS.every(d => !schedule[d.key]) && (
        <div style={{ fontSize: 12, color: '#9B9490', fontStyle: 'italic' }}>No days selected — provider available anytime</div>
      )}
    </div>
  );
}

function formatScheduleSummary(sched: VendorSched | null): string {
  if (!sched) return 'Available anytime';
  const activeDays = DAYS.filter(d => sched[d.key]);
  if (activeDays.length === 0) return 'Available anytime';
  if (activeDays.length === 7) {
    const first = sched[activeDays[0].key]!;
    const allSame = activeDays.every(d => sched[d.key]!.start === first.start && sched[d.key]!.end === first.end);
    if (allSame) return `Every day ${fmtTimeLabel(first.start)}–${fmtTimeLabel(first.end)}`;
  }
  if (activeDays.length === 5 && activeDays.every(d => ['mon','tue','wed','thu','fri'].includes(d.key))) {
    const first = sched[activeDays[0].key]!;
    const allSame = activeDays.every(d => sched[d.key]!.start === first.start && sched[d.key]!.end === first.end);
    if (allSame) return `Mon–Fri ${fmtTimeLabel(first.start)}–${fmtTimeLabel(first.end)}`;
  }
  return activeDays.map(d => d.label).join(', ');
}

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
  const [schedule, setSchedule] = useState<VendorSched>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Create-new fields
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newEmail, setNewEmail] = useState('');

  // Property assignment
  const [allProperties, setAllProperties] = useState<Property[]>([]);
  const [selectedPropertyIds, setSelectedPropertyIds] = useState<string[]>([]);
  const [cityFilter, setCityFilter] = useState('');
  const [assignMode, setAssignMode] = useState<'all' | 'specific'>('all');

  useEffect(() => {
    businessService.listProperties(workspaceId).then(res => {
      if (res.data) setAllProperties(res.data.filter(p => p.active));
    });
  }, [workspaceId]);

  const cities = [...new Set(allProperties.map(p => p.city).filter(Boolean))] as string[];
  const filteredProperties = cityFilter
    ? allProperties.filter(p => p.city === cityFilter)
    : allProperties;

  function toggleProperty(id: string) {
    setSelectedPropertyIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  function selectAllFiltered() {
    const ids = filteredProperties.map(p => p.id);
    setSelectedPropertyIds(prev => [...new Set([...prev, ...ids])]);
  }

  function deselectAllFiltered() {
    const ids = new Set(filteredProperties.map(p => p.id));
    setSelectedPropertyIds(prev => prev.filter(x => !ids.has(x)));
  }

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
      if (assignMode === 'specific' && selectedPropertyIds.length === 0) {
        setError('Select at least one property'); setSaving(false); return;
      }

      const propertyIds = assignMode === 'specific' ? selectedPropertyIds : [null];
      const cats = selectedCats.length > 0 ? selectedCats : undefined;

      if (mode === 'create') {
        if (!newName.trim()) { setError('Name is required'); setSaving(false); return; }
        if (!newPhone.trim() && !newEmail.trim()) { setError('Phone or email is required'); setSaving(false); return; }
        // Create vendor for first property (or workspace-wide), then add remaining
        const firstRes = await businessService.createVendor(workspaceId, {
          name: newName.trim(),
          phone: newPhone.trim() || undefined,
          email: newEmail.trim() || undefined,
          categories: cats,
          priority,
          notes: notes || undefined,
          property_id: propertyIds[0],
        });
        // For additional properties, add as existing vendor
        if (firstRes.data && propertyIds.length > 1) {
          const providerId = firstRes.data.providerId;
          for (let i = 1; i < propertyIds.length; i++) {
            await businessService.addVendor(workspaceId, {
              provider_id: providerId,
              property_id: propertyIds[i],
              categories: cats,
              priority,
              notes: notes || undefined,
              availability_schedule: Object.keys(schedule).length > 0 ? schedule : undefined,
            }).catch(() => {}); // skip duplicates
          }
        }
      } else {
        if (!selectedProvider) { setError('Select a provider first'); setSaving(false); return; }
        for (const propId of propertyIds) {
          await businessService.addVendor(workspaceId, {
            provider_id: selectedProvider.id,
            property_id: propId,
            categories: cats,
            priority,
            notes: notes || undefined,
            availability_schedule: Object.keys(schedule).length > 0 ? schedule : undefined,
          }).catch(() => {}); // skip duplicates
        }
      }
      onAdded();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to add provider');
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
        <h3 style={{ fontFamily: 'Fraunces, serif', fontSize: 22, color: D, margin: '0 0 20px' }}>Add Preferred Provider</h3>

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
                <div key={p.id} onClick={() => {
                  setSelectedProvider(p);
                  // Auto-select categories from provider's existing categories
                  if (p.categories && p.categories.length > 0) {
                    const matched = VENDOR_CATEGORIES
                      .filter(vc => p.categories!.some(pc => pc.toLowerCase() === vc.value.toLowerCase() || vc.label.toLowerCase() === pc.toLowerCase()))
                      .map(vc => vc.value);
                    setSelectedCats(matched);
                  }
                }}
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
                    Create new provider
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
            <label style={labelStyle}>Provider Name *</label>
            <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="ABC Plumbing" style={inputStyle} />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={labelStyle}>Phone</label>
                <input value={newPhone} onChange={e => setNewPhone(e.target.value)} placeholder="(555) 123-4567" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Email</label>
                <input value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="info@provider.com" type="email" style={inputStyle} />
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

            {/* Operating Hours */}
            <label style={labelStyle}>Operating Hours <span style={{ fontWeight: 400, color: '#9B9490' }}>(optional)</span></label>
            <SchedulePicker schedule={schedule} onChange={setSchedule} />
            <div style={{ marginBottom: 16 }} />

            <label style={labelStyle}>Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Agreed rate, specialties, etc."
              style={{ ...inputStyle, resize: 'vertical' as const }} />

            {/* Property Assignment */}
            <div style={{ borderTop: '1px solid #E0DAD4', paddingTop: 16, marginTop: 4 }}>
              <label style={labelStyle}>Assign to Properties</label>
              <div style={{ display: 'flex', gap: 0, marginBottom: 12, borderRadius: 8, overflow: 'hidden', border: '1px solid #E0DAD4' }}>
                <button onClick={() => { setAssignMode('all'); setSelectedPropertyIds([]); }}
                  style={{ flex: 1, padding: '8px 0', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                    background: assignMode === 'all' ? D : '#fff', color: assignMode === 'all' ? '#fff' : '#6B6560' }}>
                  All Properties
                </button>
                <button onClick={() => setAssignMode('specific')}
                  style={{ flex: 1, padding: '8px 0', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                    background: assignMode === 'specific' ? D : '#fff', color: assignMode === 'specific' ? '#fff' : '#6B6560' }}>
                  Specific Properties
                </button>
              </div>

              {assignMode === 'all' && (
                <div style={{ fontSize: 13, color: '#9B9490', marginBottom: 8 }}>
                  This provider will be available for dispatch to any property in your workspace.
                </div>
              )}

              {assignMode === 'specific' && (
                <>
                  {/* City filter */}
                  {cities.length > 1 && (
                    <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                      <span style={{ fontSize: 12, color: '#9B9490', fontWeight: 600 }}>Filter:</span>
                      <button onClick={() => setCityFilter('')}
                        style={{ padding: '4px 12px', borderRadius: 16, fontSize: 12, fontWeight: 500, cursor: 'pointer',
                          border: !cityFilter ? `2px solid ${O}` : '1px solid #E0DAD4',
                          background: !cityFilter ? `${O}12` : '#fff', color: !cityFilter ? O : '#6B6560' }}>
                        All Cities
                      </button>
                      {cities.sort().map(c => (
                        <button key={c} onClick={() => setCityFilter(c)}
                          style={{ padding: '4px 12px', borderRadius: 16, fontSize: 12, fontWeight: 500, cursor: 'pointer',
                            border: cityFilter === c ? `2px solid ${O}` : '1px solid #E0DAD4',
                            background: cityFilter === c ? `${O}12` : '#fff', color: cityFilter === c ? O : '#6B6560' }}>
                          {c}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Select/deselect all */}
                  <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                    <button onClick={selectAllFiltered}
                      style={{ fontSize: 12, color: O, fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer' }}>
                      Select all{cityFilter ? ` in ${cityFilter}` : ''}
                    </button>
                    <span style={{ color: '#E0DAD4' }}>|</span>
                    <button onClick={deselectAllFiltered}
                      style={{ fontSize: 12, color: '#9B9490', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer' }}>
                      Deselect all{cityFilter ? ` in ${cityFilter}` : ''}
                    </button>
                    {selectedPropertyIds.length > 0 && (
                      <span style={{ fontSize: 12, color: G, fontWeight: 600, marginLeft: 'auto' }}>
                        {selectedPropertyIds.length} selected
                      </span>
                    )}
                  </div>

                  {/* Property list */}
                  <div style={{ maxHeight: 200, overflow: 'auto', border: '1px solid #E0DAD4', borderRadius: 8 }}>
                    {filteredProperties.map(p => {
                      const checked = selectedPropertyIds.includes(p.id);
                      return (
                        <label key={p.id} style={{
                          display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', cursor: 'pointer',
                          borderBottom: '1px solid #F5F3F0', background: checked ? `${O}06` : '#fff',
                        }}>
                          <input type="checkbox" checked={checked} onChange={() => toggleProperty(p.id)}
                            style={{ width: 16, height: 16, accentColor: O, flexShrink: 0 }} />
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 14, fontWeight: 500, color: D }}>{p.name}</div>
                            {p.city && <div style={{ fontSize: 12, color: '#9B9490' }}>{p.city}{p.state ? `, ${p.state}` : ''}</div>}
                          </div>
                        </label>
                      );
                    })}
                    {filteredProperties.length === 0 && (
                      <div style={{ padding: 20, textAlign: 'center', fontSize: 13, color: '#9B9490' }}>No properties found</div>
                    )}
                  </div>
                </>
              )}
            </div>
          </>
        )}

        {error && <div style={{ color: '#DC2626', fontSize: 14, marginBottom: 16, marginTop: 16 }}>{error}</div>}

        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '10px 20px', borderRadius: 8, border: '1px solid #E0DAD4', background: '#fff', cursor: 'pointer', fontSize: 14, color: D }}>Cancel</button>
          {showDetails && (
            <button onClick={handleAdd} disabled={saving}
              style={{ padding: '10px 24px', borderRadius: 8, border: 'none', background: O, color: '#fff', cursor: saving ? 'default' : 'pointer', fontSize: 14, fontWeight: 600, opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Adding...' : mode === 'create' ? 'Create & Add' : 'Add Provider'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Vendors Tab ──────────────────────────────────────────────────────── */

interface GroupedVendor {
  providerId: string;
  providerName: string;
  providerPhone: string | null;
  providerEmail: string | null;
  providerRating: string | null;
  providerReviewCount: number;
  categories: string[] | null;
  priority: number;
  notes: string | null;
  availabilitySchedule: VendorSched | null;
  skipQuote: boolean;
  active: boolean;
  entries: PreferredVendor[]; // one per property assignment
  propertyIds: (string | null)[]; // null = workspace-wide
}

function groupVendors(vendors: PreferredVendor[]): GroupedVendor[] {
  const map = new Map<string, GroupedVendor>();
  for (const v of vendors) {
    const existing = map.get(v.providerId);
    if (existing) {
      existing.entries.push(v);
      existing.propertyIds.push(v.propertyId);
    } else {
      map.set(v.providerId, {
        providerId: v.providerId,
        providerName: v.providerName,
        providerPhone: v.providerPhone,
        providerEmail: v.providerEmail,
        providerRating: v.providerRating,
        providerReviewCount: v.providerReviewCount,
        categories: v.categories,
        priority: v.priority,
        notes: v.notes,
        availabilitySchedule: v.availabilitySchedule,
        skipQuote: v.skipQuote,
        active: v.active,
        entries: [v],
        propertyIds: [v.propertyId],
      });
    }
  }
  return [...map.values()];
}

const PLAN_VENDOR_LIMITS: Record<string, number> = {
  trial: 5, starter: 5, professional: 9999, business: 9999, enterprise: 9999,
};

function VendorsTab({ workspaceId, role, plan }: { workspaceId: string; role: string; plan: string }) {
  const [vendors, setVendors] = useState<PreferredVendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editingVendor, setEditingVendor] = useState<GroupedVendor | null>(null);
  const [allProperties, setAllProperties] = useState<Property[]>([]);
  const [expandedVendorId, setExpandedVendorId] = useState<string | null>(null);

  const canEdit = role === 'admin' || role === 'coordinator';
  const vendorLimit = PLAN_VENDOR_LIMITS[plan] ?? 5;
  const uniqueVendorCount = groupVendors(vendors).length;
  const atLimit = uniqueVendorCount >= vendorLimit;

  useEffect(() => {
    businessService.listProperties(workspaceId).then(res => {
      if (res.data) setAllProperties(res.data.filter(p => p.active));
    });
  }, [workspaceId]);

  function loadVendors() {
    businessService.listVendors(workspaceId).then(res => {
      if (res.data) setVendors(res.data);
      setLoading(false);
    }).catch(() => setLoading(false));
  }

  useEffect(() => { loadVendors(); }, [workspaceId]);

  async function handleRemove(vendorId: string, name: string) {
    if (!confirm(`Remove ${name} from preferred providers?`)) return;
    try {
      await businessService.removeVendor(workspaceId, vendorId);
      setVendors(prev => prev.filter(v => v.id !== vendorId));
    } catch { /* ignore */ }
  }

  if (loading) return <div style={{ textAlign: 'center', padding: 40, color: '#9B9490' }}>Loading providers...</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h3 style={{ fontFamily: 'Fraunces, serif', fontSize: 20, color: D, margin: 0 }}>Preferred Providers</h3>
          <div style={{ fontSize: 12, color: '#9B9490', marginTop: 3 }}>
            {uniqueVendorCount} of {vendorLimit === 9999 ? '∞' : vendorLimit} · {plan.charAt(0).toUpperCase() + plan.slice(1)}
          </div>
        </div>
        {canEdit && (
          atLimit ? (
            <div style={{ fontSize: 12, color: '#DC2626', fontWeight: 600 }}>Limit reached</div>
          ) : (
            <button onClick={() => setShowAdd(true)}
              style={{ padding: '7px 16px', borderRadius: 8, border: 'none', background: O, color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
              + Add Provider
            </button>
          )
        )}
      </div>

      {vendors.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', background: '#FAFAF8', borderRadius: 12, border: '1px dashed #E0DAD4' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🤝</div>
          <div style={{ fontSize: 16, color: D, fontWeight: 600, marginBottom: 8 }}>No preferred providers yet</div>
          <div style={{ fontSize: 14, color: '#9B9490' }}>Add providers you trust to get priority dispatch on your jobs.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {groupVendors(vendors).map(g => {
            const isWorkspaceWide = g.propertyIds.includes(null);
            const assignedProps = allProperties.filter(p => g.propertyIds.includes(p.id));
            const isExpVendor = expandedVendorId === g.providerId;
            const propSummary = isWorkspaceWide ? 'All properties' : `${assignedProps.length} propert${assignedProps.length === 1 ? 'y' : 'ies'}`;

            return (
              <div key={g.providerId}
                onClick={() => setExpandedVendorId(isExpVendor ? null : g.providerId)}
                style={{
                  background: '#fff', borderRadius: 12, overflow: 'hidden', cursor: 'pointer',
                  border: isExpVendor ? `2px solid ${O}` : '1px solid rgba(0,0,0,0.06)',
                  opacity: g.active ? 1 : 0.55, transition: 'all 0.2s',
                  boxShadow: isExpVendor ? `0 4px 20px ${O}10` : '0 1px 4px rgba(0,0,0,0.03)',
                }}>
                {/* ── Collapsed row ── */}
                <div style={{ padding: '12px 14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {/* Avatar circle */}
                    <div style={{
                      width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
                      background: g.active ? `${O}10` : '#F3F4F6',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      border: `2px solid ${g.active ? `${O}25` : '#E0DAD4'}`,
                      fontSize: 16, fontWeight: 700, color: g.active ? O : '#9B9490',
                      fontFamily: 'Fraunces, serif',
                    }}>
                      {g.providerName.charAt(0)}
                    </div>

                    {/* Name + meta */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                        <span style={{ fontWeight: 600, fontSize: 14, color: D, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{g.providerName}</span>
                        {!g.active && <span style={{ fontSize: 8, fontWeight: 700, color: '#9B9490', background: '#F3F4F6', padding: '1px 6px', borderRadius: 3, flexShrink: 0 }}>INACTIVE</span>}
                        {g.skipQuote && <span style={{ fontSize: 8, fontWeight: 700, color: '#2563EB', background: '#EFF6FF', padding: '1px 6px', borderRadius: 3, flexShrink: 0 }}>NO QUOTE</span>}
                      </div>
                      <div style={{ fontSize: 11, color: '#9B9490', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {g.providerRating && <span>★ {g.providerRating}</span>}
                        <span>{propSummary}</span>
                        <span style={{
                          fontSize: 9, padding: '1px 6px', borderRadius: 10, fontWeight: 600,
                          background: g.priority === 1 ? '#FEF3C7' : g.priority === 2 ? '#DBEAFE' : '#F3F4F6',
                          color: g.priority === 1 ? '#B45309' : g.priority === 2 ? '#2563EB' : '#6B7280',
                        }}>P{g.priority}</span>
                      </div>
                    </div>

                    {/* Toggle + chevron */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                      {canEdit && (
                        <button onClick={(e) => {
                          e.stopPropagation();
                          businessService.toggleVendor(workspaceId, g.providerId, !g.active).then(() => loadVendors());
                        }}
                          title={g.active ? 'Deactivate' : 'Activate'}
                          style={{ width: 34, height: 18, borderRadius: 9, border: 'none', cursor: 'pointer', background: g.active ? G : '#D1D5DB', position: 'relative', transition: 'background 0.2s', padding: 0 }}>
                          <div style={{ width: 14, height: 14, borderRadius: '50%', background: '#fff', position: 'absolute', top: 2, left: g.active ? 18 : 2, transition: 'left 0.2s', boxShadow: '0 1px 2px rgba(0,0,0,0.2)' }} />
                        </button>
                      )}
                      <span style={{ fontSize: 11, color: '#C0BBB6' }}>{isExpVendor ? '▲' : '▼'}</span>
                    </div>
                  </div>
                </div>

                {/* ── Expanded detail ── */}
                {isExpVendor && (
                  <div style={{ padding: '0 14px 14px', borderTop: '1px solid rgba(0,0,0,0.04)' }} onClick={e => e.stopPropagation()}>
                    {/* Contact info */}
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12, marginBottom: 10 }}>
                      {g.providerPhone && (
                        <a href={`tel:${g.providerPhone}`} style={{ fontSize: 12, color: G, textDecoration: 'none', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>📞 {g.providerPhone}</a>
                      )}
                      {g.providerEmail && (
                        <a href={`mailto:${g.providerEmail}`} style={{ fontSize: 12, color: '#2563EB', textDecoration: 'none', fontWeight: 500 }}>✉ {g.providerEmail}</a>
                      )}
                      {g.providerRating && (
                        <span style={{ fontSize: 12, color: '#9B9490' }}>★ {g.providerRating} ({g.providerReviewCount} reviews)</span>
                      )}
                    </div>

                    {/* Details grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 6, marginBottom: 10 }}>
                      <div style={{ background: W, borderRadius: 8, padding: '7px 10px' }}>
                        <div style={{ fontSize: 9, color: '#9B9490', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Priority</div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: g.priority === 1 ? '#B45309' : g.priority === 2 ? '#2563EB' : D }}>Level {g.priority}</div>
                      </div>
                      <div style={{ background: W, borderRadius: 8, padding: '7px 10px' }}>
                        <div style={{ fontSize: 9, color: '#9B9490', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Properties</div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: isWorkspaceWide ? '#9B9490' : '#2563EB' }}>{propSummary}</div>
                      </div>
                      <div style={{ background: W, borderRadius: 8, padding: '7px 10px' }}>
                        <div style={{ fontSize: 9, color: '#9B9490', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Hours</div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: D, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{formatScheduleSummary(g.availabilitySchedule)}</div>
                      </div>
                    </div>

                    {/* Assigned properties list */}
                    {!isWorkspaceWide && assignedProps.length > 0 && (
                      <div style={{ fontSize: 11, color: '#6B6560', marginBottom: 10, lineHeight: 1.6 }}>
                        📍 {assignedProps.map(p => p.name).join(', ')}
                      </div>
                    )}

                    {/* Categories */}
                    {g.categories && g.categories.length > 0 && (
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 10 }}>
                        {g.categories.map(c => (
                          <span key={c} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: `${G}12`, color: G, fontWeight: 500 }}>{c}</span>
                        ))}
                      </div>
                    )}

                    {/* Notes */}
                    {g.notes && <div style={{ fontSize: 12, color: '#6B6560', fontStyle: 'italic', marginBottom: 10 }}>{g.notes}</div>}

                    {/* Skip Quote toggle */}
                    {canEdit && (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, padding: '8px 10px', background: g.skipQuote ? '#EFF6FF' : W, borderRadius: 8, border: `1px solid ${g.skipQuote ? 'rgba(37,99,235,0.15)' : 'rgba(0,0,0,0.04)'}` }}>
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 600, color: D }}>Skip Quotes</div>
                          <div style={{ fontSize: 10, color: '#9B9490', marginTop: 1 }}>
                            {g.skipQuote ? 'Auto-dispatch without requesting a quote' : 'Provider will be asked for a quote'}
                          </div>
                        </div>
                        <button onClick={() => {
                          const newVal = !g.skipQuote;
                          Promise.all(g.entries.map(e =>
                            businessService.updateVendor(workspaceId, e.id, { skip_quote: newVal })
                          )).then(() => loadVendors());
                        }}
                          style={{ width: 36, height: 20, borderRadius: 10, border: 'none', cursor: 'pointer', background: g.skipQuote ? '#2563EB' : '#D1D5DB', position: 'relative', transition: 'background 0.2s', padding: 0 }}>
                          <div style={{ width: 16, height: 16, borderRadius: '50%', background: '#fff', position: 'absolute', top: 2, left: g.skipQuote ? 18 : 2, transition: 'left 0.2s', boxShadow: '0 1px 2px rgba(0,0,0,0.2)' }} />
                        </button>
                      </div>
                    )}

                    {/* Action buttons */}
                    {canEdit && (
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', paddingTop: 10, borderTop: '1px solid rgba(0,0,0,0.04)' }}>
                        <button onClick={() => setEditingVendor(g)}
                          style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid #E0DAD4', background: '#fff', fontSize: 12, cursor: 'pointer', color: '#6B6560', fontWeight: 600 }}>
                          Edit
                        </button>
                        <button onClick={() => {
                          if (!confirm(`Remove ${g.providerName} from preferred providers?`)) return;
                          Promise.all(g.entries.map(e => businessService.removeVendor(workspaceId, e.id).catch(() => {}))).then(() => loadVendors());
                        }}
                          style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid #FCA5A5', background: '#FEF2F2', fontSize: 12, cursor: 'pointer', color: '#DC2626', fontWeight: 600 }}>
                          Remove
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showAdd && (
        <AddVendorModal workspaceId={workspaceId} onClose={() => setShowAdd(false)}
          onAdded={() => { setShowAdd(false); loadVendors(); }} />
      )}

      {editingVendor && (
        <EditVendorModal workspaceId={workspaceId} vendor={editingVendor} allProperties={allProperties}
          onClose={() => setEditingVendor(null)}
          onSaved={() => { setEditingVendor(null); loadVendors(); }} />
      )}
    </div>
  );
}

/* ── Edit Vendor Modal ────────────────────────────────────────────────── */

function EditVendorModal({ workspaceId, vendor, allProperties, onClose, onSaved }: {
  workspaceId: string; vendor: GroupedVendor; allProperties: Property[]; onClose: () => void; onSaved: () => void;
}) {
  const [selectedCats, setSelectedCats] = useState<string[]>(vendor.categories ?? []);
  const [priority, setPriority] = useState(vendor.priority);
  const [notes, setNotes] = useState(vendor.notes ?? '');
  const [skipQuote, setSkipQuote] = useState(vendor.skipQuote);
  const [schedule, setSchedule] = useState<VendorSched>(vendor.availabilitySchedule ?? {});
  const [assignMode, setAssignMode] = useState<'all' | 'specific'>(vendor.propertyIds.includes(null) ? 'all' : 'specific');
  const [selectedPropertyIds, setSelectedPropertyIds] = useState<string[]>(vendor.propertyIds.filter(Boolean) as string[]);
  const [cityFilter, setCityFilter] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const cities = [...new Set(allProperties.map(p => p.city).filter(Boolean))] as string[];
  const filteredProperties = cityFilter ? allProperties.filter(p => p.city === cityFilter) : allProperties;

  function toggleProperty(id: string) {
    setSelectedPropertyIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }
  function selectAllFiltered() {
    const ids = filteredProperties.map(p => p.id);
    setSelectedPropertyIds(prev => [...new Set([...prev, ...ids])]);
  }
  function deselectAllFiltered() {
    const ids = new Set(filteredProperties.map(p => p.id));
    setSelectedPropertyIds(prev => prev.filter(x => !ids.has(x)));
  }

  async function handleSave() {
    if (assignMode === 'specific' && selectedPropertyIds.length === 0) {
      setError('Select at least one property'); return;
    }
    setSaving(true);
    setError('');
    try {
      const cats = selectedCats.length > 0 ? selectedCats : undefined;
      const targetPropertyIds: (string | null)[] = assignMode === 'specific' ? selectedPropertyIds : [null];

      // Remove all existing entries for this vendor
      await Promise.all(vendor.entries.map(e => businessService.removeVendor(workspaceId, e.id).catch(() => {})));

      // Re-add with updated settings for each property
      for (const propId of targetPropertyIds) {
        await businessService.addVendor(workspaceId, {
          provider_id: vendor.providerId,
          property_id: propId,
          categories: cats,
          priority,
          notes: notes || undefined,
          skip_quote: skipQuote,
          availability_schedule: Object.keys(schedule).length > 0 ? schedule : undefined,
        }).catch(() => {});
      }

      onSaved();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update provider');
    } finally {
      setSaving(false);
    }
  }

  const inputStyle = { width: '100%', padding: '10px 14px', border: '1px solid #E0DAD4', borderRadius: 8, fontSize: 15, marginBottom: 16, boxSizing: 'border-box' as const };
  const labelStyle = { display: 'block' as const, fontSize: 13, fontWeight: 600, color: '#6B6560', marginBottom: 6 };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div style={{ background: '#fff', borderRadius: 12, padding: 32, width: '100%', maxWidth: 520, maxHeight: '90vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <h3 style={{ fontFamily: 'Fraunces, serif', fontSize: 22, color: D, margin: '0 0 4px' }}>Edit Preferred Provider</h3>
        <p style={{ fontSize: 15, fontWeight: 600, color: O, marginBottom: 20 }}>{vendor.providerName}</p>

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
                  background: active ? `${O}12` : '#fff', color: active ? O : '#6B6560',
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

        {/* Operating Hours */}
        <label style={labelStyle}>Operating Hours <span style={{ fontWeight: 400, color: '#9B9490' }}>(optional)</span></label>
        <SchedulePicker schedule={schedule} onChange={setSchedule} />
        <div style={{ marginBottom: 16 }} />

        <label style={labelStyle}>Notes</label>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Agreed rate, specialties, etc."
          style={{ ...inputStyle, resize: 'vertical' as const }} />

        {/* Property Assignment */}
        <div style={{ borderTop: '1px solid #E0DAD4', paddingTop: 16, marginTop: 4 }}>
          <label style={labelStyle}>Assign to Properties</label>
          <div style={{ display: 'flex', gap: 0, marginBottom: 12, borderRadius: 8, overflow: 'hidden', border: '1px solid #E0DAD4' }}>
            <button onClick={() => { setAssignMode('all'); setSelectedPropertyIds([]); }}
              style={{ flex: 1, padding: '8px 0', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                background: assignMode === 'all' ? D : '#fff', color: assignMode === 'all' ? '#fff' : '#6B6560' }}>
              All Properties
            </button>
            <button onClick={() => setAssignMode('specific')}
              style={{ flex: 1, padding: '8px 0', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                background: assignMode === 'specific' ? D : '#fff', color: assignMode === 'specific' ? '#fff' : '#6B6560' }}>
              Specific Properties
            </button>
          </div>

          {assignMode === 'all' && (
            <div style={{ fontSize: 13, color: '#9B9490', marginBottom: 8 }}>
              This provider will be available for dispatch to any property in your workspace.
            </div>
          )}

          {assignMode === 'specific' && (
            <>
              {cities.length > 1 && (
                <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: '#9B9490', fontWeight: 600 }}>Filter:</span>
                  <button onClick={() => setCityFilter('')}
                    style={{ padding: '4px 12px', borderRadius: 16, fontSize: 12, fontWeight: 500, cursor: 'pointer',
                      border: !cityFilter ? `2px solid ${O}` : '1px solid #E0DAD4',
                      background: !cityFilter ? `${O}12` : '#fff', color: !cityFilter ? O : '#6B6560' }}>
                    All Cities
                  </button>
                  {cities.sort().map(c => (
                    <button key={c} onClick={() => setCityFilter(c)}
                      style={{ padding: '4px 12px', borderRadius: 16, fontSize: 12, fontWeight: 500, cursor: 'pointer',
                        border: cityFilter === c ? `2px solid ${O}` : '1px solid #E0DAD4',
                        background: cityFilter === c ? `${O}12` : '#fff', color: cityFilter === c ? O : '#6B6560' }}>
                      {c}
                    </button>
                  ))}
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <button onClick={selectAllFiltered}
                  style={{ fontSize: 12, color: O, fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer' }}>
                  Select all{cityFilter ? ` in ${cityFilter}` : ''}
                </button>
                <span style={{ color: '#E0DAD4' }}>|</span>
                <button onClick={deselectAllFiltered}
                  style={{ fontSize: 12, color: '#9B9490', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer' }}>
                  Deselect all{cityFilter ? ` in ${cityFilter}` : ''}
                </button>
                {selectedPropertyIds.length > 0 && (
                  <span style={{ fontSize: 12, color: G, fontWeight: 600, marginLeft: 'auto' }}>
                    {selectedPropertyIds.length} selected
                  </span>
                )}
              </div>

              <div style={{ maxHeight: 200, overflow: 'auto', border: '1px solid #E0DAD4', borderRadius: 8 }}>
                {filteredProperties.map(p => {
                  const checked = selectedPropertyIds.includes(p.id);
                  return (
                    <label key={p.id} style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', cursor: 'pointer',
                      borderBottom: '1px solid #F5F3F0', background: checked ? `${O}06` : '#fff',
                    }}>
                      <input type="checkbox" checked={checked} onChange={() => toggleProperty(p.id)}
                        style={{ width: 16, height: 16, accentColor: O, flexShrink: 0 }} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 500, color: D }}>{p.name}</div>
                        {p.city && <div style={{ fontSize: 12, color: '#9B9490' }}>{p.city}{p.state ? `, ${p.state}` : ''}</div>}
                      </div>
                    </label>
                  );
                })}
                {filteredProperties.length === 0 && (
                  <div style={{ padding: 20, textAlign: 'center', fontSize: 13, color: '#9B9490' }}>No properties found</div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Skip Quotes */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, padding: '12px 14px', background: skipQuote ? '#EFF6FF' : W, borderRadius: 10, border: `1px solid ${skipQuote ? 'rgba(37,99,235,0.15)' : 'rgba(0,0,0,0.04)'}` }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: D }}>Skip Quotes</div>
            <div style={{ fontSize: 12, color: '#9B9490', marginTop: 2 }}>
              {skipQuote ? 'This provider will be auto-dispatched without requesting a quote or budget info.' : 'This provider will be asked for a price estimate during outreach.'}
            </div>
          </div>
          <button onClick={() => setSkipQuote(!skipQuote)}
            style={{ width: 40, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer', background: skipQuote ? '#2563EB' : '#D1D5DB', position: 'relative', transition: 'background 0.2s', padding: 0, flexShrink: 0, marginLeft: 12 }}>
            <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#fff', position: 'absolute', top: 2, left: skipQuote ? 20 : 2, transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
          </button>
        </div>

        {error && <div style={{ color: '#DC2626', fontSize: 14, marginTop: 16 }}>{error}</div>}

        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 20 }}>
          <button onClick={onClose} style={{ padding: '10px 20px', borderRadius: 8, border: '1px solid #E0DAD4', background: '#fff', cursor: 'pointer', fontSize: 14, color: D }}>Cancel</button>
          <button onClick={handleSave} disabled={saving}
            style={{ padding: '10px 24px', borderRadius: 8, border: 'none', background: O, color: '#fff', cursor: saving ? 'default' : 'pointer', fontSize: 14, fontWeight: 600, opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
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

const DISPATCH_ENCOURAGEMENT = [
  'Calling around so you don\u2019t have to',
  'Nobody got you like your Homie',
  'Sit tight \u2014 quotes incoming',
  'Making moves behind the scenes',
];

const DISPATCH_CARD_STYLES = `
@keyframes dpc-spin-cw {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
@keyframes dpc-spin-ccw {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(-360deg); }
}
@keyframes dpc-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
@keyframes dpc-channel-pulse {
  0%, 100% { transform: scale(1); opacity: 0.6; }
  50% { transform: scale(1.5); opacity: 0; }
}
@keyframes dpc-rotate-msgs {
  0%, 22% { transform: translateY(0); }
  25%, 47% { transform: translateY(-25%); }
  50%, 72% { transform: translateY(-50%); }
  75%, 97% { transform: translateY(-75%); }
}
@media (prefers-reduced-motion: reduce) {
  .dpc-spin-cw, .dpc-spin-ccw, .dpc-channel-pulse, .dpc-msg-rotate { animation: none !important; }
}
`;

const DPC_CHANNELS = [
  { key: 'voice' as const, label: 'Voice', bg: '#FAECE7', color: O },
  { key: 'sms' as const, label: 'SMS', bg: '#E1F5EE', color: G },
  { key: 'web' as const, label: 'Web', bg: '#E6F1FB', color: '#2E86C1' },
];

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

function TrackingShareModal({ jobId, propertyName, onClose }: { jobId: string; propertyName?: string; onClose: () => void }) {
  const [trackingUrl, setTrackingUrl] = useState<string | null>(null);
  const [creating, setCreating] = useState(true);
  const [copied, setCopied] = useState(false);
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [notifySaved, setNotifySaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    trackingService.createLink(jobId, { property_name: propertyName })
      .then(res => { if (res.data) setTrackingUrl(res.data.tracking_url); })
      .catch(() => {})
      .finally(() => setCreating(false));
  }, [jobId, propertyName]);

  async function saveNotify() {
    if (!phone.trim() && !email.trim()) return;
    setSaving(true);
    try {
      await trackingService.createLink(jobId, {
        notify_phone: phone.trim() || undefined,
        notify_email: email.trim() || undefined,
        property_name: propertyName,
      });
      setNotifySaved(true);
    } catch { /* ignore */ }
    setSaving(false);
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 16, padding: '24px 20px', width: '100%', maxWidth: 440, margin: '0 12px', maxHeight: '90vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ fontFamily: 'Fraunces, serif', fontSize: 20, fontWeight: 700, color: D, margin: 0 }}>Share maintenance status</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, color: '#9B9490', cursor: 'pointer' }}>×</button>
        </div>
        <div style={{ fontSize: 13, color: '#6B6560', marginBottom: 16, lineHeight: 1.5 }}>
          Share a live tracking link with property owners or guests. They'll see real-time status updates as providers are contacted and quotes come in.
        </div>

        {creating && <div style={{ fontSize: 13, color: '#9B9490', marginBottom: 12 }}>Creating tracking link...</div>}

        {trackingUrl && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', background: W, borderRadius: 8, padding: '10px 12px', border: '1px solid rgba(0,0,0,0.06)', marginBottom: 16 }}>
            <input readOnly value={trackingUrl} style={{ flex: 1, border: 'none', outline: 'none', fontSize: 12, color: D, fontFamily: "'DM Mono', monospace", background: 'transparent' }} />
            <button onClick={() => { navigator.clipboard.writeText(trackingUrl); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
              style={{ padding: '6px 14px', borderRadius: 6, border: 'none', fontSize: 12, fontWeight: 600, background: copied ? G : O, color: '#fff', cursor: 'pointer', flexShrink: 0 }}>
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
        )}

        {trackingUrl && !notifySaved && (
          <>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#9B9490', marginBottom: 8 }}>Also send automatic updates via (optional)</div>
            <div style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
              <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Phone for SMS updates"
                style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid rgba(0,0,0,0.08)', fontSize: 14, outline: 'none', fontFamily: "'DM Sans', sans-serif" }} />
              <input value={email} onChange={e => setEmail(e.target.value)} placeholder="Email for updates"
                style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid rgba(0,0,0,0.08)', fontSize: 14, outline: 'none', fontFamily: "'DM Sans', sans-serif" }} />
            </div>
            {(phone.trim() || email.trim()) && (
              <button disabled={saving} onClick={saveNotify} style={{
                width: '100%', padding: '10px 0', borderRadius: 100, border: 'none',
                background: O, color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer',
                fontFamily: "'DM Sans', sans-serif", opacity: saving ? 0.7 : 1,
              }}>
                {saving ? 'Saving...' : 'Send updates'}
              </button>
            )}
          </>
        )}

        {notifySaved && (
          <div style={{ fontSize: 13, color: G, fontWeight: 600 }}>
            ✓ Updates will be sent{phone ? ` to ${phone}` : ''}{phone && email ? ' and' : ''}{email ? ` to ${email}` : ''}
          </div>
        )}

        {trackingUrl && (
          <div style={{ marginTop: 12, textAlign: 'center' }}>
            <a href={trackingUrl} target="_blank" rel="noopener" style={{ fontSize: 12, color: '#2563EB', textDecoration: 'none', fontWeight: 600 }}>Preview tracking page →</a>
          </div>
        )}
      </div>
    </div>
  );
}

function DispatchesTab({ workspaceId, onTabChange, plan, focusJobId, onFocusHandled }: { workspaceId: string; onTabChange?: (tab: Tab) => void; plan: string; focusJobId?: string | null; onFocusHandled?: () => void }) {
  const navigate = useNavigate();
  const [dispatches, setDispatches] = useState<WorkspaceDispatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [responses, setResponses] = useState<Record<string, ProviderResponseItem[]>>({});
  const [loadingResponses, setLoadingResponses] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState<string | null>(null);
  const [downloadingPdf, setDownloadingPdf] = useState<string | null>(null);
  const [sharingJobId, setSharingJobId] = useState<string | null>(null);
  const [preferredProviderIds, setPreferredProviderIds] = useState<Set<string>>(new Set());
  const [estimates, setEstimates] = useState<Record<string, CostEstimate>>({});
  const isPro = ['professional', 'business', 'enterprise'].includes(plan);

  useEffect(() => {
    businessService.listVendors(workspaceId).then(res => {
      if (res.data) setPreferredProviderIds(new Set(res.data.filter(v => v.active).map(v => v.providerId)));
    }).catch(() => {});
  }, [workspaceId]);

  async function handleDownloadEstimate(jobId: string) {
    setDownloadingPdf(jobId);
    try {
      const token = getToken();
      const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';
      const res = await fetch(`${API_BASE}/api/v1/business/${workspaceId}/jobs/${jobId}/estimate-pdf`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error('Failed to generate PDF');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `estimate-summary-${jobId.slice(0, 8)}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      alert((err as Error).message || 'Failed to download estimate PDF');
    } finally {
      setDownloadingPdf(null);
    }
  }

  useEffect(() => {
    businessService.listDispatches(workspaceId).then(async res => {
      if (res.data) setDispatches(res.data);
      setLoading(false);

      // Auto-expand focused job after data loads
      if (focusJobId && res.data?.some(d => d.id === focusJobId)) {
        setExpandedId(focusJobId);
        const focusJob = res.data.find(d => d.id === focusJobId);
        if (focusJob) fetchEstimate(focusJob);
        // Load responses for the focused job
        try {
          const respRes = await jobService.getResponses(focusJobId);
          if (respRes.data) setResponses(prev => ({ ...prev, [focusJobId]: respRes.data!.responses }));
        } catch { /* ignore */ }
        // Scroll into view after render
        requestAnimationFrame(() => {
          setTimeout(() => {
            const el = document.getElementById(`dispatch-${focusJobId}`);
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            onFocusHandled?.();
          }, 100);
        });
      }
    }).catch(() => setLoading(false));
  }, [workspaceId]);

  async function fetchEstimate(job: WorkspaceDispatch) {
    if (estimates[job.id] || !job.diagnosis?.category || !job.zipCode) return;
    try {
      const cat = job.diagnosis.category;
      const sub = job.diagnosis.subcategory || cat;
      const res = await estimateService.generate({ category: cat, subcategory: sub, zip_code: job.zipCode, workspace_id: workspaceId });
      if (res.data) setEstimates(prev => ({ ...prev, [job.id]: res.data! }));
    } catch { /* ignore */ }
  }

  async function toggleExpand(jobId: string) {
    if (expandedId === jobId) { setExpandedId(null); return; }
    setExpandedId(jobId);
    const job = dispatches.find(d => d.id === jobId);
    if (job) fetchEstimate(job);
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 8 }}>
        <h3 style={{ fontFamily: 'Fraunces, serif', fontSize: 20, color: D, margin: 0 }}>Dispatches</h3>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={() => { if (isPro) onTabChange?.('schedules'); }}
            title={isPro ? 'Set up recurring dispatches' : 'Upgrade to Professional to use Auto-Dispatch'}
            style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid #E0DAD4', background: '#fff', fontSize: 12, fontWeight: 600,
              color: isPro ? D : '#ccc', cursor: isPro ? 'pointer' : 'default', opacity: isPro ? 1 : 0.6 }}>
            🔄 Auto-Dispatch{!isPro && ' (Pro+)'}
          </button>
          <button onClick={() => navigate(`/business/chat?workspace=${workspaceId}`)}
            style={{ padding: '7px 16px', borderRadius: 8, border: 'none', background: O, color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
            + New Dispatch
          </button>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: DISPATCH_CARD_STYLES }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {dispatches.map(j => {
          const sc = DISPATCH_STATUS_COLORS[j.status] || DISPATCH_STATUS_COLORS.expired;
          const isExpanded = expandedId === j.id;
          const jobResponses = responses[j.id] ?? [];
          const isActive = ['open', 'dispatching', 'collecting'].includes(j.status);
          const catLabel = j.diagnosis?.category ? j.diagnosis.category.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : 'Dispatch';
          const responseCount = j.responseCount;
          const ringSize = 44;

          return (
            <div key={j.id} id={`dispatch-${j.id}`} onClick={() => toggleExpand(j.id)} style={{
              background: '#fff', borderRadius: 14, overflow: 'hidden', cursor: 'pointer',
              border: isExpanded ? `2px solid ${O}` : '1px solid rgba(0,0,0,0.06)',
              transition: 'all 0.2s',
              boxShadow: isExpanded ? `0 4px 20px ${O}10` : '0 1px 4px rgba(0,0,0,0.03)',
            }}>
              {/* ── Collapsed header ── */}
              <div style={{ padding: '12px 14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {isActive ? (
                    <div style={{ position: 'relative', width: 38, height: 38, flexShrink: 0 }}>
                      <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '2px solid #F0EBE6' }} />
                      <div className="dpc-spin-cw" style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '2px solid transparent', borderTopColor: O, animation: 'dpc-spin-cw 1.8s cubic-bezier(0.45,0.05,0.55,0.95) infinite' }} />
                      <div className="dpc-spin-ccw" style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '2px solid transparent', borderBottomColor: G, animation: 'dpc-spin-ccw 2.4s cubic-bezier(0.45,0.05,0.55,0.95) infinite' }} />
                      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Fraunces, serif', fontWeight: 700, fontSize: 17, color: O, lineHeight: 1 }}>h</div>
                    </div>
                  ) : (
                    <div style={{ width: 38, height: 38, borderRadius: '50%', flexShrink: 0, background: responseCount > 0 ? `${G}12` : W, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `2px solid ${responseCount > 0 ? `${G}30` : '#F0EBE6'}` }}>
                      <span style={{ fontSize: 16 }}>{responseCount > 0 ? '✓' : j.status === 'expired' ? '⏰' : '✓'}</span>
                    </div>
                  )}
                  <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                      <span style={{ fontFamily: 'Fraunces, serif', fontWeight: 700, fontSize: 15, color: D, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{catLabel}</span>
                      <span style={{ background: sc.bg, color: sc.text, padding: '2px 7px', borderRadius: 100, fontSize: 9, fontWeight: 600, flexShrink: 0 }}>{j.status.charAt(0).toUpperCase() + j.status.slice(1)}</span>
                    </div>
                    <div style={{ fontSize: 11, color: '#9B9490', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {j.propertyName && <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 140 }}>🏠 {j.propertyName}</span>}
                      <span>{new Date(j.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                      <span>{j.zipCode}</span>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0, minWidth: 50 }}>
                    {responseCount > 0 ? (
                      <>
                        <div style={{ fontFamily: 'Fraunces, serif', fontSize: 20, fontWeight: 700, color: G }}>{responseCount}</div>
                        <div style={{ fontSize: 9, color: '#9B9490' }}>quote{responseCount > 1 ? 's' : ''}</div>
                      </>
                    ) : isActive ? (
                      <div style={{ fontSize: 10, fontWeight: 600, color: O, animation: 'dpc-pulse 1.5s infinite' }}>Searching</div>
                    ) : (
                      <span style={{ fontSize: 12, color: '#C0BBB6' }}>—</span>
                    )}
                  </div>
                  <span style={{ fontSize: 11, color: '#C0BBB6', flexShrink: 0 }}>{isExpanded ? '▲' : '▼'}</span>
                </div>
              </div>

              {/* ── Expanded detail ── */}
              {isExpanded && (
                <div style={{ padding: '0 14px 16px', borderTop: '1px solid rgba(0,0,0,0.04)' }} onClick={e => e.stopPropagation()}>

                  {/* Active outreach animation + channel counts */}
                  {isActive && (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px 0 16px' }}>
                      <div style={{ position: 'relative', width: 72, height: 72, marginBottom: 12 }}>
                        <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '2.5px solid #F0EBE6' }} />
                        <div className="dpc-spin-cw" style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '2.5px solid transparent', borderTopColor: O, animation: 'dpc-spin-cw 1.8s cubic-bezier(0.45,0.05,0.55,0.95) infinite' }} />
                        <div className="dpc-spin-ccw" style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '2.5px solid transparent', borderBottomColor: G, animation: 'dpc-spin-ccw 2.4s cubic-bezier(0.45,0.05,0.55,0.95) infinite' }} />
                        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Fraunces, serif', fontWeight: 700, fontSize: 30, color: O, lineHeight: 1 }}>h</div>
                      </div>
                      <div style={{ fontFamily: 'Fraunces, serif', fontSize: 16, fontWeight: 700, color: D, textAlign: 'center' }}>Your Homie's on it</div>
                      <div style={{ fontSize: 12, color: '#9B9490', textAlign: 'center', marginTop: 2 }}>Contacting pros near {j.zipCode}</div>
                      <div style={{ height: 18, overflow: 'hidden', marginTop: 8, textAlign: 'center' }}>
                        <div className="dpc-msg-rotate" style={{ animation: 'dpc-rotate-msgs 10s ease-in-out infinite' }}>
                          {DISPATCH_ENCOURAGEMENT.map((msg, i) => (
                            <div key={i} style={{ height: 18, lineHeight: '18px', fontSize: 12, fontWeight: 500, color: O }}>{msg}</div>
                          ))}
                        </div>
                      </div>

                      {/* Channel outreach counts */}
                      <div style={{ display: 'flex', gap: 8, marginTop: 14, width: '100%' }}>
                        {DPC_CHANNELS.map(({ key, label, bg, color: chColor }, ci) => (
                          <div key={key} style={{ flex: 1, background: '#fff', borderRadius: 10, padding: '10px 6px', textAlign: 'center', border: '1px solid rgba(0,0,0,0.05)', position: 'relative', overflow: 'hidden' }}>
                            <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: '50%', background: bg, marginBottom: 4 }}>
                              <div className="dpc-channel-pulse" style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: bg, animation: `dpc-channel-pulse 2.4s ease-in-out ${ci * 0.8}s infinite` }} />
                              <span style={{ position: 'relative', fontSize: 12 }}>{key === 'voice' ? '📞' : key === 'sms' ? '💬' : '🌐'}</span>
                            </div>
                            <div style={{ fontSize: 10, color: '#9B9490', fontWeight: 500 }}>{label}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Summary */}
                  {j.diagnosis?.summary && (
                    <div style={{ fontSize: 13, color: '#6B6560', lineHeight: 1.6, marginBottom: 14, paddingTop: isActive ? 0 : 12 }}>
                      {renderBold(j.diagnosis.summary)}
                    </div>
                  )}

                  {/* No-charge notice for expired with 0 responses */}
                  {j.status === 'expired' && j.responseCount === 0 && (
                    <div style={{ background: '#EFF6FF', borderRadius: 8, padding: '10px 14px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8, border: '1px solid rgba(37,99,235,0.1)' }}>
                      <span style={{ fontSize: 14 }}>💰</span>
                      <span style={{ fontSize: 13, color: '#2563EB', fontWeight: 500 }}>No charge for dispatches with zero responses.</span>
                    </div>
                  )}

                  {/* Details grid */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 6, marginBottom: 14 }}>
                    {[
                      { label: 'Category', value: catLabel },
                      { label: 'Severity', value: (j.diagnosis?.severity ?? 'medium').replace(/^\w/, c => c.toUpperCase()), color: j.diagnosis?.severity === 'high' ? '#DC2626' : j.diagnosis?.severity === 'low' ? G : D },
                      ...(j.propertyName ? [{ label: 'Property', value: j.propertyName }] : []),
                      { label: 'Timing', value: j.preferredTiming ?? 'ASAP' },
                    ].map((item, i) => (
                      <div key={i} style={{ background: W, borderRadius: 8, padding: '7px 10px' }}>
                        <div style={{ fontSize: 9, color: '#9B9490', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{item.label}</div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: (item as { color?: string }).color ?? D, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.value}</div>
                      </div>
                    ))}
                  </div>

                  {/* Expiry */}
                  {j.expiresAt && isActive && (
                    <div style={{ fontSize: 11, color: '#9B9490', marginBottom: 12 }}>
                      Expires: {new Date(j.expiresAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                    </div>
                  )}

                  {/* Action buttons */}
                  {(jobResponses.length > 0 || !['expired', 'refunded'].includes(j.status)) && (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
                      {jobResponses.length > 0 && (
                        isPro ? (
                          <button onClick={() => handleDownloadEstimate(j.id)} disabled={downloadingPdf === j.id}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, border: `1px solid ${O}40`, background: `${O}08`, color: O, fontSize: 12, fontWeight: 600, cursor: downloadingPdf === j.id ? 'default' : 'pointer', opacity: downloadingPdf === j.id ? 0.6 : 1 }}>
                            {downloadingPdf === j.id ? 'Generating...' : '📄 Estimate PDF'}
                          </button>
                        ) : (
                          <button disabled style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, border: '1px solid #E0DAD4', background: '#F5F3F0', color: '#B0AAA4', fontSize: 12, fontWeight: 600, cursor: 'default' }}>
                            📄 Estimate PDF <span style={{ fontSize: 10 }}>(Pro+)</span>
                          </button>
                        )
                      )}
                      {!['expired', 'refunded'].includes(j.status) && (
                        <button onClick={() => setSharingJobId(j.id)}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, border: `1px solid ${G}40`, background: `${G}08`, color: G, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                          🔗 Share Status
                        </button>
                      )}
                    </div>
                  )}

                  {/* AI Cost Estimate */}
                  {estimates[j.id] && (
                    <div style={{ marginBottom: 14 }}>
                      <EstimateCard estimate={estimates[j.id]} />
                    </div>
                  )}

                  {/* Provider Responses */}
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: D, marginBottom: 8, letterSpacing: '0.02em' }}>
                      {responseCount > 0 ? `Provider Responses (${responseCount})` : 'Provider Responses'}
                    </div>

                    {loadingResponses === j.id ? (
                      <div style={{ color: '#9B9490', fontSize: 13 }}>Loading responses...</div>
                    ) : jobResponses.length === 0 ? (
                      <div style={{ background: W, borderRadius: 10, padding: '16px 14px', textAlign: 'center', border: '1px dashed rgba(0,0,0,0.08)' }}>
                        {isActive ? (
                          <>
                            <div style={{ fontSize: 13, color: '#9B9490', fontWeight: 500 }}>Waiting for providers to respond...</div>
                            <div style={{ display: 'flex', justifyContent: 'center', gap: 4, marginTop: 8 }}>
                              {[0, 1, 2].map(i => (
                                <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: O, animation: `dpc-pulse 1.2s ${i * 0.3}s infinite` }} />
                              ))}
                            </div>
                          </>
                        ) : (
                          <div style={{ fontSize: 13, color: '#9B9490' }}>No providers responded</div>
                        )}
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {jobResponses.map(r => (
                          <div key={r.id} style={{ background: W, borderRadius: 10, padding: '10px 12px', border: '1px solid rgba(0,0,0,0.04)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 4 }}>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                                  <span style={{ fontWeight: 600, fontSize: 13, color: D }}>{r.provider.name}</span>
                                  {preferredProviderIds.has(r.provider.id) && (
                                    <span style={{ fontSize: 8, fontWeight: 700, color: '#fff', background: O, padding: '2px 5px', borderRadius: 3, letterSpacing: '0.04em' }}>PREFERRED</span>
                                  )}
                                </div>
                                <div style={{ color: '#9B9490', fontSize: 10, marginTop: 1 }}>
                                  ★ {r.provider.google_rating ?? 'N/A'} ({r.provider.review_count})
                                  {r.provider.google_place_id && (
                                    <a href={`https://www.google.com/maps/place/?q=place_id:${r.provider.google_place_id}`} target="_blank" rel="noopener" onClick={e => e.stopPropagation()} style={{ color: '#2563EB', textDecoration: 'none', fontWeight: 600, marginLeft: 4 }}>Reviews</a>
                                  )}
                                </div>
                              </div>
                              {r.quoted_price && (
                                <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, flexShrink: 0 }}>
                                  <span style={{ fontFamily: "'Fraunces', serif", fontSize: 18, fontWeight: 700, color: O }}>{cleanPrice(r.quoted_price)}</span>
                                  {estimates[j.id] ? (
                                    <EstimateBadge quotedPrice={cleanPrice(r.quoted_price)} estimateLow={estimates[j.id].estimateLowCents} estimateHigh={estimates[j.id].estimateHighCents} />
                                  ) : (
                                    <div style={{ fontSize: 10, color: '#9B9490', fontWeight: 500 }}>quoted price</div>
                                  )}
                                </div>
                              )}
                            </div>
                            {r.availability && <div style={{ fontSize: 12, color: D, marginBottom: 3 }}>📅 {r.availability}</div>}
                            {r.message && <div style={{ fontSize: 12, color: '#6B6560', fontStyle: 'italic' }}>"{r.message}"</div>}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
                              <span style={{ fontSize: 11, color: '#9B9490' }}>via {r.channel} · {timeAgo(r.responded_at)}</span>
                              {r.provider.phone && (
                                <a href={`tel:${r.provider.phone}`} style={{ fontSize: 12, color: G, textDecoration: 'none', fontWeight: 600 }}>📞 Call</a>
                              )}
                            </div>
                            {j.status !== 'expired' && j.status !== 'refunded' && (
                              j.status === 'completed' ? (
                                <div style={{ width: '100%', padding: '10px 0', borderRadius: 100, marginTop: 10, background: '#E0DAD4', color: '#9B9490', fontSize: 14, fontWeight: 600, fontFamily: "'DM Sans', sans-serif", textAlign: 'center' }}>Booked</div>
                              ) : (
                                <button onClick={async (e) => {
                                  e.stopPropagation();
                                  try {
                                    const propertyAddr = j.propertyName || undefined;
                                    await jobService.bookProvider(j.id, r.id, r.provider.id, propertyAddr);
                                    setDispatches(prev => prev.map(d => d.id === j.id ? { ...d, status: 'completed' } : d));
                                    if (onTabChange) onTabChange('bookings');
                                  } catch (err) {
                                    alert((err as Error).message || 'Booking failed');
                                  }
                                }} style={{ width: '100%', padding: '10px 0', borderRadius: 100, border: 'none', marginTop: 10, background: O, color: 'white', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", boxShadow: `0 4px 16px ${O}40` }}>
                                  Book {r.provider.name.split(' ')[0]}
                                </button>
                              )
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Cancel button */}
                  {isActive && (
                    <div style={{ marginTop: 14, borderTop: '1px solid rgba(0,0,0,0.05)', paddingTop: 14 }}>
                      <button onClick={() => setShowCancelConfirm(j.id)} disabled={cancellingId === j.id} style={{
                        width: '100%', padding: '10px 0', borderRadius: 100,
                        border: '1px solid #FCA5A5', background: '#FEF2F2', color: '#DC2626',
                        fontSize: 13, fontWeight: 600, cursor: cancellingId === j.id ? 'default' : 'pointer',
                        opacity: cancellingId === j.id ? 0.6 : 1,
                      }}>{cancellingId === j.id ? 'Cancelling...' : 'Cancel Dispatch'}</button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Share tracking modal */}
      {sharingJobId && (
        <TrackingShareModal
          jobId={sharingJobId}
          propertyName={dispatches.find(d => d.id === sharingJobId)?.propertyName ?? undefined}
          onClose={() => setSharingJobId(null)}
        />
      )}

      {/* Cancel confirmation modal */}
      {showCancelConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setShowCancelConfirm(null)}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 28, width: '100%', maxWidth: 400, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }} onClick={e => e.stopPropagation()}>
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#FEF2F2', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                <span style={{ fontSize: 22 }}>⚠️</span>
              </div>
              <h3 style={{ fontFamily: 'Fraunces, serif', fontSize: 20, fontWeight: 700, color: D, margin: '0 0 8px' }}>Cancel this dispatch?</h3>
              <p style={{ fontSize: 14, color: '#6B6560', lineHeight: 1.6, margin: 0 }}>
                This will stop all outreach for this dispatch.
                {(() => {
                  const job = dispatches.find(d => d.id === showCancelConfirm);
                  return job && job.responseCount > 0
                    ? ' Any booked providers will be notified of the cancellation via SMS and email.'
                    : ' If no providers have responded, there is no charge.';
                })()}
              </p>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setShowCancelConfirm(null)} style={{
                flex: 1, padding: '12px 0', borderRadius: 100, border: '1px solid #E0DAD4',
                background: '#fff', color: D, fontSize: 14, fontWeight: 600, cursor: 'pointer',
              }}>Keep dispatch</button>
              <button onClick={async () => {
                const jobId = showCancelConfirm;
                setShowCancelConfirm(null);
                setCancellingId(jobId);
                try {
                  const res = await businessService.cancelDispatch(workspaceId, jobId);
                  setDispatches(prev => prev.map(d => d.id === jobId ? { ...d, status: 'expired' } : d));
                  if (res.data?.credit_refunded) {
                    alert('Dispatch cancelled. No charge for dispatches with zero responses.');
                  } else if (res.data?.providers_notified && res.data.providers_notified > 0) {
                    alert(`Dispatch cancelled. ${res.data.providers_notified} booked provider${res.data.providers_notified > 1 ? 's were' : ' was'} notified.`);
                  } else {
                    alert('Dispatch cancelled.');
                  }
                } catch (err) {
                  alert((err as Error).message || 'Failed to cancel');
                }
                setCancellingId(null);
              }} style={{
                flex: 1, padding: '12px 0', borderRadius: 100, border: 'none',
                background: '#DC2626', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer',
              }}>Yes, cancel</button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.4; } }
        div::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  );
}

/* ── Schedules Tab (Auto-Dispatch) ────────────────────────────────────── */

const SCHEDULE_CAT_COLORS: Record<string, string> = {
  cleaning: '#1B9E77', pool: '#2E86C1', hot_tub: '#2E86C1',
  hvac: '#E8632B', pest_control: '#C0392B', landscaping: '#D4A437',
  general: '#2D2926', restocking: '#17A589', trash: '#6C757D',
  inspection: '#2D2926', roofing: '#6366F1',
};

function formatCadence(type: string, config: Record<string, unknown> | null): string {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  if (!config) return type.replace(/_/g, ' ');
  switch (type) {
    case 'weekly': return `Every ${days[(config.day_of_week as number) ?? 1]} at ${config.time ?? '10:00'}`;
    case 'biweekly': return `Every other ${days[(config.day_of_week as number) ?? 1]} at ${config.time ?? '10:00'}`;
    case 'monthly': return `${ordinal((config.day_of_month as number) ?? 1)} of every month at ${config.time ?? '10:00'}`;
    case 'quarterly': return `Every quarter on the ${ordinal((config.day_of_month as number) ?? 1)}`;
    case 'semi_annual': return 'Twice a year';
    case 'annual': return 'Once a year';
    case 'per_checkout': return 'After each guest checkout';
    default: return type.replace(/_/g, ' ');
  }
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function relativeTime(dateStr: string): string {
  const now = new Date();
  const d = new Date(dateStr);
  const diffMs = d.getTime() - now.getTime();
  const diffH = Math.round(diffMs / 3600000);
  const diffD = Math.round(diffMs / 86400000);
  if (diffMs < 0) {
    const ago = Math.abs(diffD);
    if (ago === 0) return 'today';
    if (ago === 1) return 'yesterday';
    return `${ago} days ago`;
  }
  if (diffH < 1) return 'in less than an hour';
  if (diffH < 24) return `in ${diffH}h`;
  if (diffD === 1) return 'tomorrow';
  return `in ${diffD} days`;
}

const TEMPLATE_CATEGORIES = [
  { key: '', label: 'All' },
  { key: 'cleaning', label: 'Cleaning' },
  { key: 'outdoor', label: 'Outdoor' },
  { key: 'pool', label: 'Pool' },
  { key: 'hvac', label: 'HVAC' },
  { key: 'pest', label: 'Pest' },
  { key: 'safety', label: 'Safety' },
  { key: 'supplies', label: 'Supplies' },
  { key: 'trash', label: 'Trash' },
];

const CADENCE_OPTIONS = [
  { value: 'weekly', label: 'Weekly', desc: 'Once per week' },
  { value: 'biweekly', label: 'Biweekly', desc: 'Every 2 weeks' },
  { value: 'monthly', label: 'Monthly', desc: 'Once per month' },
  { value: 'quarterly', label: 'Quarterly', desc: 'Every 3 months' },
  { value: 'semi_annual', label: 'Semi-annual', desc: 'Twice a year' },
  { value: 'annual', label: 'Annual', desc: 'Once a year' },
  { value: 'per_checkout', label: 'After checkout', desc: 'Per guest stay' },
];

function SchedulesTab({ workspaceId, plan }: { workspaceId: string; plan: string }) {
  const [schedules, setSchedules] = useState<DispatchSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);
  const [editingSchedule, setEditingSchedule] = useState<DispatchSchedule | null>(null);
  const [cancelConfirmId, setCancelConfirmId] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const loadSchedules = () => {
    setLoading(true);
    businessService.listSchedules(workspaceId).then(res => {
      if (res.data) setSchedules(res.data);
    }).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => { loadSchedules(); }, [workspaceId]); // eslint-disable-line react-hooks/exhaustive-deps

  const activeCount = schedules.filter(s => s.status === 'active').length;
  const now = new Date();
  const weekEnd = new Date(now.getTime() + 7 * 86400000);
  const thisWeek = schedules.filter(s => s.nextDispatchAt && new Date(s.nextDispatchAt) <= weekEnd).length;
  const monthlyCost = schedules.filter(s => s.status === 'active' && s.agreedRateCents).reduce((sum, s) => sum + (s.agreedRateCents ?? 0), 0);

  const handleToggle = async (sched: DispatchSchedule) => {
    setToggling(sched.id);
    try {
      const res = sched.status === 'active'
        ? await businessService.pauseSchedule(workspaceId, sched.id)
        : await businessService.resumeSchedule(workspaceId, sched.id);
      if (res.data) {
        setSchedules(prev => prev.map(s => s.id === sched.id ? res.data! : s));
      }
    } catch { /* ignore */ }
    setToggling(null);
  };

  const stats = [
    { label: 'Active Schedules', value: String(activeCount) },
    { label: 'This Week', value: String(thisWeek) },
    { label: 'Success Rate', value: '--' },
    { label: 'Monthly Cost', value: monthlyCost > 0 ? `$${(monthlyCost / 100).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : '--' },
  ];

  return (
    <div>
      {/* Stats bar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 24 }}>
        {stats.map(s => (
          <div key={s.label} style={{ background: 'var(--bp-card)', border: '1px solid var(--bp-border)', borderRadius: 10, padding: '16px 20px' }}>
            <div style={{ fontSize: 12, color: 'var(--bp-subtle)', fontWeight: 600, marginBottom: 4 }}>{s.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--bp-text)', fontFamily: 'Fraunces, serif' }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Header + New button */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h3 style={{ fontFamily: 'Fraunces, serif', fontSize: 18, color: 'var(--bp-text)', margin: 0 }}>Schedules</h3>
        <button onClick={() => setShowNew(true)}
          style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: O, color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
          + New Schedule
        </button>
      </div>

      {/* Schedule list */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 48, color: 'var(--bp-subtle)' }}>Loading schedules...</div>
      ) : schedules.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 48, color: 'var(--bp-subtle)' }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>📅</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--bp-text)', marginBottom: 8 }}>No schedules yet</div>
          <div style={{ fontSize: 13, color: 'var(--bp-muted)', marginBottom: 20, maxWidth: 360, margin: '0 auto 20px' }}>
            Set up recurring maintenance dispatches so your properties stay in great shape automatically.
          </div>
          <button onClick={() => setShowNew(true)}
            style={{ padding: '10px 24px', borderRadius: 8, border: 'none', background: O, color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
            Create your first schedule
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {schedules.map(sched => {
            const catColor = SCHEDULE_CAT_COLORS[sched.category] ?? '#6B6560';
            const isActive = sched.status === 'active';
            const statusColor = isActive ? G : sched.status === 'needs_attention' ? '#D4A437' : '#9B9490';
            return (
              <div key={sched.id} style={{
                background: 'var(--bp-card)', border: '1px solid var(--bp-border)', borderRadius: 10,
                borderLeft: `4px solid ${catColor}`, padding: '16px 20px',
                opacity: sched.status === 'paused' ? 0.7 : 1,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: statusColor, flexShrink: 0 }} />
                      <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--bp-text)' }}>{sched.title}</span>
                      <span style={{ fontSize: 10, fontWeight: 600, color: catColor, background: `${catColor}15`, padding: '1px 8px', borderRadius: 100, textTransform: 'capitalize' }}>
                        {sched.category.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--bp-muted)', marginBottom: 2 }}>
                      {sched.propertyName ?? 'All properties'}
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--bp-subtle)' }}>
                      {formatCadence(sched.cadenceType, sched.cadenceConfig)}
                      {sched.preferredProviderName ? ` · ${sched.preferredProviderName}` : ' · Marketplace'}
                      {sched.agreedRateCents ? ` · $${(sched.agreedRateCents / 100).toFixed(0)}` : ''}
                    </div>
                    {sched.nextDispatchAt && isActive && (
                      <div style={{ fontSize: 12, color: 'var(--bp-subtle)', marginTop: 4 }}>
                        Next: {relativeTime(sched.nextDispatchAt)}
                      </div>
                    )}
                    {sched.status === 'paused' && (
                      <div style={{ fontSize: 12, color: '#9B9490', marginTop: 4, fontStyle: 'italic' }}>Paused</div>
                    )}
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, flexShrink: 0 }}>
                    {/* Active/Paused toggle */}
                    <div
                      onClick={() => { if (toggling !== sched.id) handleToggle(sched); }}
                      style={{
                        width: 44, height: 24, borderRadius: 12, cursor: 'pointer', position: 'relative',
                        background: isActive ? G : '#D0CBC6', transition: 'background 0.2s',
                        opacity: toggling === sched.id ? 0.5 : 1,
                      }}>
                      <div style={{
                        width: 20, height: 20, borderRadius: '50%', background: '#fff', position: 'absolute',
                        top: 2, left: isActive ? 22 : 2, transition: 'left 0.2s',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
                      }} />
                    </div>

                    {/* Edit + Cancel buttons */}
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => setEditingSchedule(sched)}
                        style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid var(--bp-border)', background: 'var(--bp-card)', fontSize: 11, fontWeight: 600, cursor: 'pointer', color: 'var(--bp-muted)' }}>
                        Edit
                      </button>
                      {cancelConfirmId === sched.id ? (
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button disabled={cancelling} onClick={async () => {
                            setCancelling(true);
                            try {
                              await businessService.deleteSchedule(workspaceId, sched.id);
                              setSchedules(prev => prev.filter(s => s.id !== sched.id));
                            } catch { /* ignore */ }
                            setCancelling(false);
                            setCancelConfirmId(null);
                          }} style={{ padding: '4px 8px', borderRadius: 6, border: 'none', background: '#DC2626', color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer', opacity: cancelling ? 0.5 : 1 }}>
                            Confirm
                          </button>
                          <button onClick={() => setCancelConfirmId(null)}
                            style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid var(--bp-border)', background: 'var(--bp-card)', fontSize: 11, cursor: 'pointer', color: 'var(--bp-muted)' }}>
                            No
                          </button>
                        </div>
                      ) : (
                        <button onClick={() => setCancelConfirmId(sched.id)}
                          style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #FCA5A5', background: '#FEF2F2', fontSize: 11, fontWeight: 600, cursor: 'pointer', color: '#DC2626' }}>
                          Cancel
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* New Schedule Modal */}
      {showNew && (
        <NewScheduleModal workspaceId={workspaceId} onClose={() => setShowNew(false)} onCreated={() => { setShowNew(false); loadSchedules(); }} />
      )}

      {/* Edit Schedule Modal */}
      {editingSchedule && (
        <EditScheduleModal workspaceId={workspaceId} schedule={editingSchedule}
          onClose={() => setEditingSchedule(null)}
          onSaved={() => { setEditingSchedule(null); loadSchedules(); }} />
      )}
    </div>
  );
}

/* ── New Schedule Modal ──────────────────────────────────────────────── */

function NewScheduleModal({ workspaceId, onClose, onCreated }: { workspaceId: string; onClose: () => void; onCreated: () => void }) {
  const [step, setStep] = useState<'templates' | 'form'>('templates');
  const [templates, setTemplates] = useState<ScheduleTemplate[]>([]);
  const [templateCat, setTemplateCat] = useState('');
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [properties, setProperties] = useState<Property[]>([]);
  const [vendors, setVendors] = useState<PreferredVendor[]>([]);

  // Form state
  const [selectedPropertyIds, setSelectedPropertyIds] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [cadenceType, setCadenceType] = useState('weekly');
  const [dayOfWeek, setDayOfWeek] = useState(1);
  const [dayOfMonth, setDayOfMonth] = useState(1);
  const [timeVal, setTimeVal] = useState('10:00');
  const [selectedVendorIds, setSelectedVendorIds] = useState<string[]>([]);
  const [agreedRate, setAgreedRate] = useState('');
  const [autoBookPreferred, setAutoBookPreferred] = useState(true);
  const [autoBookMarketplace, setAutoBookMarketplace] = useState(false);
  const [category, setCategory] = useState('general');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoadingTemplates(true);
    templateService.list(templateCat ? { category: templateCat } : undefined).then(res => {
      if (res.data) setTemplates(res.data);
    }).catch(() => {}).finally(() => setLoadingTemplates(false));
  }, [templateCat]);

  useEffect(() => {
    businessService.listProperties(workspaceId).then(res => { if (res.data) setProperties(res.data); }).catch(() => {});
    businessService.listVendors(workspaceId).then(res => { if (res.data) setVendors(res.data); }).catch(() => {});
  }, [workspaceId]);

  const selectTemplate = (t: ScheduleTemplate) => {
    setTitle(t.title);
    setDescription(t.description);
    setCategory(t.category);
    if (t.suggestedCadenceType) setCadenceType(t.suggestedCadenceType);
    if (t.suggestedCadenceConfig) {
      if (typeof t.suggestedCadenceConfig.day_of_week === 'number') setDayOfWeek(t.suggestedCadenceConfig.day_of_week);
      if (typeof t.suggestedCadenceConfig.day_of_month === 'number') setDayOfMonth(t.suggestedCadenceConfig.day_of_month);
      if (typeof t.suggestedCadenceConfig.time === 'string') setTimeVal(t.suggestedCadenceConfig.time);
    }
    setStep('form');
  };

  const handleSave = async () => {
    if (!title.trim()) { setError('Title is required'); return; }
    setSaving(true);
    setError('');
    const cadenceConfig: Record<string, unknown> = {};
    if (['weekly', 'biweekly'].includes(cadenceType)) {
      cadenceConfig.day_of_week = dayOfWeek;
      cadenceConfig.time = timeVal;
    } else if (['monthly', 'quarterly'].includes(cadenceType)) {
      cadenceConfig.day_of_month = dayOfMonth;
      cadenceConfig.time = timeVal;
    } else if (['semi_annual', 'annual'].includes(cadenceType)) {
      cadenceConfig.time = timeVal;
    }
    try {
      // Create a schedule for each selected property (or one for "all")
      const propIds = selectedPropertyIds.length > 0 ? selectedPropertyIds : [null];
      for (const pid of propIds) {
        await businessService.createSchedule(workspaceId, {
          property_id: pid,
          title: title.trim(),
          description: description.trim() || null,
          category,
          cadence_type: cadenceType,
          cadence_config: Object.keys(cadenceConfig).length > 0 ? cadenceConfig : null,
          preferred_provider_ids: selectedVendorIds.length > 0 ? selectedVendorIds : null,
          agreed_rate_cents: agreedRate ? Math.round(parseFloat(agreedRate) * 100) : null,
          auto_book_preferred: autoBookPreferred,
          auto_book_marketplace: autoBookMarketplace,
        });
      }
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create schedule');
    }
    setSaving(false);
  };

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, overflowY: 'auto', padding: 20 }}
      onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 680, maxHeight: '90vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #E0DAD4', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ fontFamily: 'Fraunces, serif', fontSize: 20, color: D, margin: 0 }}>
            {step === 'templates' ? 'Choose a template' : 'Configure schedule'}
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#9B9490', padding: 4 }}>×</button>
        </div>

        {step === 'templates' ? (
          <div style={{ padding: 24 }}>
            {/* Start from scratch */}
            <button onClick={() => setStep('form')} style={{
              width: '100%', padding: '12px 0', borderRadius: 10, border: '1px solid #E0DAD4',
              background: '#fff', color: D, fontSize: 14, fontWeight: 600, cursor: 'pointer',
              marginBottom: 20, transition: 'all 0.15s',
            }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = O; e.currentTarget.style.color = O; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = '#E0DAD4'; e.currentTarget.style.color = D; }}
            >
              + Start from scratch
            </button>

            {/* Category filter */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
              {TEMPLATE_CATEGORIES.map(c => (
                <button key={c.key} onClick={() => setTemplateCat(c.key)}
                  style={{
                    padding: '6px 14px', borderRadius: 20, border: '1px solid #E0DAD4',
                    background: templateCat === c.key ? O : '#fff', color: templateCat === c.key ? '#fff' : '#6B6560',
                    fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  }}>
                  {c.label}
                </button>
              ))}
            </div>

            {/* Template grid */}
            {loadingTemplates ? (
              <div style={{ textAlign: 'center', padding: 32, color: '#9B9490' }}>Loading templates...</div>
            ) : templates.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 32, color: '#9B9490' }}>No templates found for this category.</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
                {templates.map(t => {
                  const catColor = SCHEDULE_CAT_COLORS[t.category] ?? '#6B6560';
                  return (
                    <div key={t.id} style={{
                      border: '1px solid #E0DAD4', borderRadius: 10, padding: 16, cursor: 'pointer',
                      transition: 'border-color 0.15s',
                    }}
                      onMouseEnter={e => (e.currentTarget.style.borderColor = O)}
                      onMouseLeave={e => (e.currentTarget.style.borderColor = '#E0DAD4')}
                      onClick={() => selectTemplate(t)}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                        <span style={{
                          fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
                          background: catColor + '18', color: catColor, textTransform: 'uppercase',
                        }}>
                          {t.category.replace(/_/g, ' ')}
                        </span>
                        <span style={{ fontSize: 11, color: '#9B9490' }}>{t.suggestedCadenceType?.replace(/_/g, ' ')}</span>
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: D, marginBottom: 4 }}>{t.title}</div>
                      {t.whyItMatters && (
                        <div style={{ fontSize: 12, color: '#9B9490', fontStyle: 'italic', marginBottom: 6, lineHeight: 1.4 }}>{t.whyItMatters}</div>
                      )}
                      {t.estimatedCostRange && (
                        <div style={{ fontSize: 12, color: '#6B6560' }}>{t.estimatedCostRange}</div>
                      )}
                      <button style={{
                        marginTop: 10, padding: '6px 16px', borderRadius: 6, border: 'none',
                        background: O, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      }}>
                        Use this
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

          </div>
        ) : (
          <div style={{ padding: 24 }}>
            {step === 'form' && templates.length > 0 && (
              <button onClick={() => setStep('templates')} style={{ background: 'none', border: 'none', color: '#9B9490', fontSize: 13, cursor: 'pointer', marginBottom: 16, padding: 0 }}>
                ← Back to templates
              </button>
            )}

            {error && <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 13, color: '#DC2626' }}>{error}</div>}

            {/* Property multi-select */}
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#6B6560', marginBottom: 6 }}>
              Properties
            </label>
            <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
              <button onClick={() => setSelectedPropertyIds(properties.map(p => p.id))}
                style={{ background: 'none', border: 'none', color: O, fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0 }}>Select all</button>
              {selectedPropertyIds.length > 0 && (
                <><span style={{ color: '#E0DAD4' }}>|</span>
                <button onClick={() => setSelectedPropertyIds([])}
                  style={{ background: 'none', border: 'none', color: '#9B9490', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0 }}>Clear</button></>
              )}
            </div>
            <div style={{ border: '1px solid #E0DAD4', borderRadius: 8, maxHeight: 140, overflowY: 'auto', marginBottom: 16 }}>
              {properties.map(p => {
                const checked = selectedPropertyIds.includes(p.id);
                return (
                  <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #F5F3F0', background: checked ? `${O}04` : '#fff' }}>
                    <input type="checkbox" checked={checked} onChange={() => setSelectedPropertyIds(prev => checked ? prev.filter(x => x !== p.id) : [...prev, p.id])}
                      style={{ width: 14, height: 14, accentColor: O }} />
                    <span style={{ fontSize: 13, color: D }}>{p.name}</span>
                    {p.city && <span style={{ fontSize: 11, color: '#9B9490' }}>· {p.city}</span>}
                  </label>
                );
              })}
            </div>
            {selectedPropertyIds.length > 0 && (
              <div style={{ fontSize: 12, color: O, fontWeight: 600, marginTop: -12, marginBottom: 12 }}>
                {selectedPropertyIds.length} selected · <button onClick={() => setSelectedPropertyIds([])} style={{ background: 'none', border: 'none', color: '#9B9490', cursor: 'pointer', fontSize: 12, textDecoration: 'underline' }}>Clear</button>
              </div>
            )}

            {/* Title */}
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#6B6560', marginBottom: 6 }}>Title *</label>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Weekly pool cleaning"
              style={{ width: '100%', padding: '10px 14px', border: '1px solid #E0DAD4', borderRadius: 8, fontSize: 14, marginBottom: 16, boxSizing: 'border-box' }} />

            {/* Description */}
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#6B6560', marginBottom: 6 }}>Description</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional notes for the provider"
              rows={3} style={{ width: '100%', padding: '10px 14px', border: '1px solid #E0DAD4', borderRadius: 8, fontSize: 14, marginBottom: 16, boxSizing: 'border-box', resize: 'vertical' }} />

            {/* Cadence type cards */}
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#6B6560', marginBottom: 10 }}>Cadence</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 8, marginBottom: 16 }}>
              {CADENCE_OPTIONS.map(c => (
                <button key={c.value} onClick={() => setCadenceType(c.value)}
                  style={{
                    padding: '10px 12px', borderRadius: 8, cursor: 'pointer', textAlign: 'left',
                    border: cadenceType === c.value ? `2px solid ${O}` : '1px solid #E0DAD4',
                    background: cadenceType === c.value ? '#FFF5F0' : '#fff',
                  }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: cadenceType === c.value ? O : D }}>{c.label}</div>
                  <div style={{ fontSize: 11, color: '#9B9490', marginTop: 2 }}>{c.desc}</div>
                </button>
              ))}
            </div>

            {/* Day & Time pickers */}
            {['weekly', 'biweekly'].includes(cadenceType) && (
              <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#6B6560', marginBottom: 6 }}>Day of week</label>
                  <select value={dayOfWeek} onChange={e => setDayOfWeek(Number(e.target.value))}
                    style={{ width: '100%', padding: '10px 14px', border: '1px solid #E0DAD4', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' }}>
                    {dayNames.map((d, i) => <option key={i} value={i}>{d}</option>)}
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#6B6560', marginBottom: 6 }}>Time</label>
                  <input type="time" value={timeVal} onChange={e => setTimeVal(e.target.value)}
                    style={{ width: '100%', padding: '10px 14px', border: '1px solid #E0DAD4', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' }} />
                </div>
              </div>
            )}
            {['monthly', 'quarterly'].includes(cadenceType) && (
              <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#6B6560', marginBottom: 6 }}>Day of month</label>
                  <select value={dayOfMonth} onChange={e => setDayOfMonth(Number(e.target.value))}
                    style={{ width: '100%', padding: '10px 14px', border: '1px solid #E0DAD4', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' }}>
                    {Array.from({ length: 28 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#6B6560', marginBottom: 6 }}>Time</label>
                  <input type="time" value={timeVal} onChange={e => setTimeVal(e.target.value)}
                    style={{ width: '100%', padding: '10px 14px', border: '1px solid #E0DAD4', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' }} />
                </div>
              </div>
            )}

            {/* Provider multi-select */}
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#6B6560', marginBottom: 6 }}>
              Preferred providers <span style={{ fontWeight: 400, color: '#9B9490' }}>(optional — select one or more)</span>
            </label>
            <div style={{ border: '1px solid #E0DAD4', borderRadius: 8, maxHeight: 120, overflowY: 'auto', marginBottom: 16 }}>
              {[...new Map(vendors.map(v => [v.providerId, v])).values()].map(v => {
                const checked = selectedVendorIds.includes(v.providerId);
                return (
                  <label key={v.providerId} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #F5F3F0', background: checked ? `${G}08` : '#fff' }}>
                    <input type="checkbox" checked={checked} onChange={() => setSelectedVendorIds(prev => checked ? prev.filter(x => x !== v.providerId) : [...prev, v.providerId])}
                      style={{ width: 14, height: 14, accentColor: G }} />
                    <span style={{ fontSize: 13, color: D }}>{v.providerName}</span>
                    {v.providerRating && <span style={{ fontSize: 11, color: '#9B9490' }}>★ {v.providerRating}</span>}
                  </label>
                );
              })}
              {vendors.length === 0 && <div style={{ padding: '12px', fontSize: 12, color: '#9B9490', textAlign: 'center' }}>No preferred providers set up</div>}
            </div>
            {selectedVendorIds.length > 0 && (
              <div style={{ fontSize: 12, color: G, fontWeight: 600, marginTop: -12, marginBottom: 12 }}>
                {selectedVendorIds.length} provider{selectedVendorIds.length > 1 ? 's' : ''} selected
              </div>
            )}

            {/* Agreed rate */}
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#6B6560', marginBottom: 6 }}>Agreed rate (optional)</label>
            <div style={{ position: 'relative', marginBottom: 16 }}>
              <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#9B9490', fontSize: 14 }}>$</span>
              <input type="number" min="0" step="0.01" value={agreedRate} onChange={e => setAgreedRate(e.target.value)}
                placeholder="0.00"
                style={{ width: '100%', padding: '10px 14px 10px 28px', border: '1px solid #E0DAD4', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' }} />
            </div>

            {/* Auto-book toggles */}
            <div style={{ marginBottom: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <button onClick={() => setAutoBookPreferred(!autoBookPreferred)}
                  style={{
                    width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer', position: 'relative',
                    background: autoBookPreferred ? G : '#D0CBC6', transition: 'background 0.2s', flexShrink: 0,
                  }}>
                  <span style={{
                    position: 'absolute', top: 2, left: autoBookPreferred ? 22 : 2,
                    width: 20, height: 20, borderRadius: '50%', background: '#fff',
                    transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                  }} />
                </button>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: D }}>Auto-book preferred providers</div>
                  <div style={{ fontSize: 12, color: '#9B9490' }}>Automatically confirm when a preferred provider accepts</div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <button onClick={() => setAutoBookMarketplace(!autoBookMarketplace)}
                  style={{
                    width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer', position: 'relative',
                    background: autoBookMarketplace ? G : '#D0CBC6', transition: 'background 0.2s', flexShrink: 0,
                  }}>
                  <span style={{
                    position: 'absolute', top: 2, left: autoBookMarketplace ? 22 : 2,
                    width: 20, height: 20, borderRadius: '50%', background: '#fff',
                    transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                  }} />
                </button>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: D }}>Auto-book marketplace providers</div>
                  <div style={{ fontSize: 12, color: '#9B9490' }}>Automatically confirm marketplace responses (if no preferred provider available)</div>
                </div>
              </div>
            </div>

            {/* Save */}
            <button onClick={handleSave} disabled={saving}
              style={{
                width: '100%', padding: '14px 0', borderRadius: 10, border: 'none',
                background: O, color: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer',
                opacity: saving ? 0.6 : 1,
              }}>
              {saving ? 'Creating...' : 'Create schedule'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Reports Tab ──────────────────────────────────────────────────────── */

type ReportView = 'summary' | 'property' | 'category' | 'vendor' | 'monthly' | 'scorecards';

function ReportsTab({ workspaceId, plan }: { workspaceId: string; plan: string }) {
  const [report, setReport] = useState<{
    total_cost: number; total_bookings: number; avg_cost: number;
    by_property: Array<{ id: string; name: string; cost: number; count: number }>;
    by_category: Array<{ category: string; cost: number; count: number }>;
    by_vendor: Array<{ id: string; name: string; cost: number; count: number }>;
    by_month: Array<{ month: string; cost: number; count: number }>;
    line_items: Array<{ jobId: string; propertyName: string; category: string; providerName: string; quotedPrice: string | null; cost: number; confirmedAt: string }>;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ReportView>('summary');

  const [scorecards, setScorecards] = useState<Array<{
    id: string; name: string; phone: string | null;
    google_rating: string | null; review_count: number; categories: string[] | null;
    total_outreach: number; response_rate: number; acceptance_rate: number;
    avg_response_sec: number | null; avg_quote: number | null;
    total_bookings: number; booking_rate: number;
    overall_score: number; grade: string; badges: string[];
  }>>([]);
  const [expandedVendor, setExpandedVendor] = useState<string | null>(null);

  const isPremium = ['professional', 'business', 'enterprise'].includes(plan);

  useEffect(() => {
    if (!isPremium) { setLoading(false); return; }
    Promise.all([
      businessService.getCostReport(workspaceId),
      businessService.getVendorScorecards(workspaceId),
    ]).then(([costRes, vendorRes]) => {
      if (costRes.data) setReport(costRes.data);
      if (vendorRes.data) setScorecards(vendorRes.data.vendors);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [workspaceId, isPremium]);

  if (!isPremium) return (
    <div style={{ textAlign: 'center', padding: '60px 20px', background: '#FAFAF8', borderRadius: 12, border: '1px dashed #E0DAD4' }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>📊</div>
      <div style={{ fontSize: 16, color: D, fontWeight: 600, marginBottom: 8 }}>Cost reporting available on Professional+</div>
      <div style={{ fontSize: 14, color: '#9B9490' }}>Upgrade your plan to access cost breakdowns by property, category, provider, and time period.</div>
    </div>
  );

  if (loading) return <div style={{ textAlign: 'center', padding: 40, color: '#9B9490' }}>Loading reports...</div>;
  if (!report) return <div style={{ textAlign: 'center', padding: 40, color: '#9B9490' }}>Failed to load reports</div>;

  const fmt = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  const views: { id: ReportView; label: string }[] = [
    { id: 'summary', label: 'Summary' }, { id: 'property', label: 'By Property' },
    { id: 'category', label: 'By Category' }, { id: 'vendor', label: 'By Provider' },
    { id: 'monthly', label: 'Monthly' }, { id: 'scorecards', label: 'Provider Scorecards' },
  ];

  const maxCost = (arr: Array<{ cost: number }>) => Math.max(...arr.map(a => a.cost), 1);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h3 style={{ fontFamily: 'Fraunces, serif', fontSize: 20, color: D, margin: 0 }}>Cost Reports</h3>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 24 }}>
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E0DAD4', padding: 20, textAlign: 'center' }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: O, fontFamily: "'Fraunces', serif" }}>{fmt(report.total_cost)}</div>
          <div style={{ fontSize: 13, color: '#9B9490', marginTop: 4 }}>Total Spend</div>
        </div>
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E0DAD4', padding: 20, textAlign: 'center' }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: D }}>{report.total_bookings}</div>
          <div style={{ fontSize: 13, color: '#9B9490', marginTop: 4 }}>Total Jobs</div>
        </div>
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E0DAD4', padding: 20, textAlign: 'center' }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: G }}>{fmt(report.avg_cost)}</div>
          <div style={{ fontSize: 13, color: '#9B9490', marginTop: 4 }}>Avg Cost / Job</div>
        </div>
      </div>

      {/* View tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
        {views.map(v => (
          <button key={v.id} onClick={() => setView(v.id)} style={{
            padding: '6px 16px', borderRadius: 100, fontSize: 13, fontWeight: 600, cursor: 'pointer',
            border: view === v.id ? `2px solid ${O}` : '1px solid #E0DAD4',
            background: view === v.id ? `${O}08` : '#fff',
            color: view === v.id ? O : '#6B6560',
          }}>{v.label}</button>
        ))}
      </div>

      {/* By Property */}
      {view === 'property' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {report.by_property.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 30, color: '#9B9490', fontSize: 14 }}>No cost data yet</div>
          ) : report.by_property.map(p => (
            <div key={p.id} style={{ background: '#fff', borderRadius: 10, border: '1px solid #E0DAD4', padding: '14px 18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontWeight: 600, fontSize: 15, color: D }}>{p.name}</span>
                <span style={{ fontFamily: "'Fraunces', serif", fontWeight: 700, fontSize: 18, color: O }}>{fmt(p.cost)}</span>
              </div>
              <div style={{ height: 6, borderRadius: 3, background: '#E0DAD4' }}>
                <div style={{ height: '100%', borderRadius: 3, background: O, width: `${(p.cost / maxCost(report.by_property)) * 100}%`, transition: 'width 0.5s' }} />
              </div>
              <div style={{ fontSize: 12, color: '#9B9490', marginTop: 6 }}>{p.count} job{p.count !== 1 ? 's' : ''}</div>
            </div>
          ))}
        </div>
      )}

      {/* By Category */}
      {view === 'category' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {report.by_category.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 30, color: '#9B9490', fontSize: 14 }}>No cost data yet</div>
          ) : report.by_category.map(c => (
            <div key={c.category} style={{ background: '#fff', borderRadius: 10, border: '1px solid #E0DAD4', padding: '14px 18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontWeight: 600, fontSize: 15, color: D, textTransform: 'capitalize' }}>{c.category.replace(/_/g, ' ')}</span>
                <span style={{ fontFamily: "'Fraunces', serif", fontWeight: 700, fontSize: 18, color: O }}>{fmt(c.cost)}</span>
              </div>
              <div style={{ height: 6, borderRadius: 3, background: '#E0DAD4' }}>
                <div style={{ height: '100%', borderRadius: 3, background: G, width: `${(c.cost / maxCost(report.by_category)) * 100}%`, transition: 'width 0.5s' }} />
              </div>
              <div style={{ fontSize: 12, color: '#9B9490', marginTop: 6 }}>{c.count} job{c.count !== 1 ? 's' : ''} · {Math.round((c.cost / report.total_cost) * 100)}% of total</div>
            </div>
          ))}
        </div>
      )}

      {/* By Vendor */}
      {view === 'vendor' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {report.by_vendor.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 30, color: '#9B9490', fontSize: 14 }}>No cost data yet</div>
          ) : report.by_vendor.map(v => (
            <div key={v.id} style={{ background: '#fff', borderRadius: 10, border: '1px solid #E0DAD4', padding: '14px 18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontWeight: 600, fontSize: 15, color: D }}>{v.name}</span>
                <span style={{ fontFamily: "'Fraunces', serif", fontWeight: 700, fontSize: 18, color: O }}>{fmt(v.cost)}</span>
              </div>
              <div style={{ height: 6, borderRadius: 3, background: '#E0DAD4' }}>
                <div style={{ height: '100%', borderRadius: 3, background: '#7C3AED', width: `${(v.cost / maxCost(report.by_vendor)) * 100}%`, transition: 'width 0.5s' }} />
              </div>
              <div style={{ fontSize: 12, color: '#9B9490', marginTop: 6 }}>{v.count} job{v.count !== 1 ? 's' : ''} · avg {fmt(v.cost / v.count)}/job</div>
            </div>
          ))}
        </div>
      )}

      {/* Monthly */}
      {view === 'monthly' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {report.by_month.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 30, color: '#9B9490', fontSize: 14 }}>No cost data yet</div>
          ) : report.by_month.map(m => {
            const [year, month] = m.month.split('-');
            const label = new Date(+year, +month - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
            return (
              <div key={m.month} style={{ background: '#fff', borderRadius: 10, border: '1px solid #E0DAD4', padding: '14px 18px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontWeight: 600, fontSize: 15, color: D }}>{label}</span>
                  <span style={{ fontFamily: "'Fraunces', serif", fontWeight: 700, fontSize: 18, color: O }}>{fmt(m.cost)}</span>
                </div>
                <div style={{ height: 6, borderRadius: 3, background: '#E0DAD4' }}>
                  <div style={{ height: '100%', borderRadius: 3, background: '#2563EB', width: `${(m.cost / maxCost(report.by_month)) * 100}%`, transition: 'width 0.5s' }} />
                </div>
                <div style={{ fontSize: 12, color: '#9B9490', marginTop: 6 }}>{m.count} job{m.count !== 1 ? 's' : ''}</div>
              </div>
            );
          })}
        </div>
      )}

      {/* Vendor Scorecards */}
      {view === 'scorecards' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {scorecards.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 30, color: '#9B9490', fontSize: 14 }}>No provider data yet — scorecards appear after outreach.</div>
          ) : scorecards.map(v => {
            const isExpanded = expandedVendor === v.id;
            const gradeColors: Record<string, { bg: string; text: string }> = {
              A: { bg: '#F0FDF4', text: '#16A34A' }, B: { bg: '#EFF6FF', text: '#2563EB' },
              C: { bg: '#FFF7ED', text: '#C2410C' }, D: { bg: '#FEF2F2', text: '#DC2626' },
              F: { bg: '#FEF2F2', text: '#DC2626' },
            };
            const gc = gradeColors[v.grade] || gradeColors.C;
            const badgeColors: Record<string, { bg: string; text: string }> = {
              'Reliable': { bg: '#EFF6FF', text: '#2563EB' }, 'Fast Responder': { bg: '#F0FDF4', text: '#16A34A' },
              'Veteran': { bg: '#F5F3FF', text: '#7C3AED' }, 'Top Rated': { bg: '#FFF7ED', text: '#C2410C' },
            };

            return (
              <div key={v.id} onClick={() => setExpandedVendor(isExpanded ? null : v.id)} style={{
                background: '#fff', borderRadius: 12, border: isExpanded ? `2px solid ${O}` : '1px solid #E0DAD4',
                cursor: 'pointer', transition: 'all 0.15s', overflow: 'hidden',
              }}>
                {/* Collapsed */}
                <div style={{ padding: '14px 18px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{
                        width: 36, height: 36, borderRadius: 8, background: gc.bg,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontFamily: "'Fraunces', serif", fontSize: 18, fontWeight: 700, color: gc.text,
                      }}>{v.grade}</div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 15, color: D }}>{v.name}</div>
                        <div style={{ fontSize: 12, color: '#9B9490' }}>
                          {v.google_rating && `★ ${v.google_rating}`} · {v.total_outreach} outreach · {v.total_bookings} bookings
                        </div>
                      </div>
                    </div>
                    <span style={{ fontSize: 12, color: '#9B9490' }}>{isExpanded ? '▲' : '▼'}</span>
                  </div>
                  {v.badges.length > 0 && (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {v.badges.map(b => {
                        const bc = badgeColors[b] || { bg: '#F5F5F5', text: '#6B7280' };
                        return <span key={b} style={{ fontSize: 11, padding: '2px 10px', borderRadius: 12, fontWeight: 600, background: bc.bg, color: bc.text }}>{b}</span>;
                      })}
                    </div>
                  )}
                </div>

                {/* Expanded */}
                {isExpanded && (
                  <div style={{ padding: '0 18px 18px', borderTop: '1px solid rgba(0,0,0,0.05)' }} onClick={e => e.stopPropagation()}>
                    {/* Score bar */}
                    <div style={{ padding: '14px 0' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: D }}>Overall Score</span>
                        <span style={{ fontSize: 20, fontWeight: 700, color: gc.text, fontFamily: "'Fraunces', serif" }}>{v.overall_score}/100</span>
                      </div>
                      <div style={{ height: 8, borderRadius: 4, background: '#E0DAD4' }}>
                        <div style={{ height: '100%', borderRadius: 4, background: gc.text, width: `${v.overall_score}%`, transition: 'width 0.5s' }} />
                      </div>
                    </div>

                    {/* Stats grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8, marginBottom: 14 }}>
                      <div style={{ background: W, borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
                        <div style={{ fontSize: 22, fontWeight: 700, color: v.response_rate >= 70 ? G : v.response_rate >= 40 ? '#C2410C' : '#DC2626' }}>{v.response_rate}%</div>
                        <div style={{ fontSize: 11, color: '#9B9490', marginTop: 2 }}>Response Rate</div>
                      </div>
                      <div style={{ background: W, borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
                        <div style={{ fontSize: 22, fontWeight: 700, color: D }}>{v.acceptance_rate}%</div>
                        <div style={{ fontSize: 11, color: '#9B9490', marginTop: 2 }}>Acceptance Rate</div>
                      </div>
                      <div style={{ background: W, borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
                        <div style={{ fontSize: 22, fontWeight: 700, color: D }}>
                          {v.avg_response_sec != null ? (v.avg_response_sec < 60 ? `${v.avg_response_sec}s` : `${Math.round(v.avg_response_sec / 60)}m`) : '—'}
                        </div>
                        <div style={{ fontSize: 11, color: '#9B9490', marginTop: 2 }}>Avg Response</div>
                      </div>
                      <div style={{ background: W, borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
                        <div style={{ fontSize: 22, fontWeight: 700, color: O }}>{v.avg_quote != null ? `$${v.avg_quote}` : '—'}</div>
                        <div style={{ fontSize: 11, color: '#9B9490', marginTop: 2 }}>Avg Quote</div>
                      </div>
                      <div style={{ background: W, borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
                        <div style={{ fontSize: 22, fontWeight: 700, color: D }}>{v.booking_rate}%</div>
                        <div style={{ fontSize: 11, color: '#9B9490', marginTop: 2 }}>Booking Rate</div>
                      </div>
                      <div style={{ background: W, borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
                        <div style={{ fontSize: 22, fontWeight: 700, color: D }}>{v.total_bookings}</div>
                        <div style={{ fontSize: 11, color: '#9B9490', marginTop: 2 }}>Jobs Completed</div>
                      </div>
                    </div>

                    {/* Categories */}
                    {v.categories && v.categories.length > 0 && (
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                        {v.categories.map(c => (
                          <span key={c} style={{ fontSize: 11, padding: '3px 10px', borderRadius: 12, background: `${G}15`, color: G, fontWeight: 500, textTransform: 'capitalize' }}>{c}</span>
                        ))}
                      </div>
                    )}

                    {/* Contact */}
                    {v.phone && (
                      <a href={`tel:${v.phone}`} style={{
                        display: 'block', textAlign: 'center', padding: '10px 0', borderRadius: 100,
                        border: `1px solid ${O}`, color: O, fontSize: 14, fontWeight: 600,
                        textDecoration: 'none',
                      }}>📞 Call {v.name.split(' ')[0]}</a>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Summary — line items */}
      {view === 'summary' && (
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: D, marginBottom: 10 }}>Recent Jobs</div>
          {report.line_items.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 30, color: '#9B9490', fontSize: 14 }}>No booked jobs yet — costs appear when providers are booked.</div>
          ) : (
            <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #E0DAD4', overflow: 'hidden' }}>
              <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: W, borderBottom: '1px solid #E0DAD4' }}>
                    <th style={{ textAlign: 'left', padding: '10px 14px', fontWeight: 600, color: '#9B9490', fontSize: 12 }}>Date</th>
                    <th style={{ textAlign: 'left', padding: '10px 14px', fontWeight: 600, color: '#9B9490', fontSize: 12 }}>Property</th>
                    <th style={{ textAlign: 'left', padding: '10px 14px', fontWeight: 600, color: '#9B9490', fontSize: 12 }}>Category</th>
                    <th style={{ textAlign: 'left', padding: '10px 14px', fontWeight: 600, color: '#9B9490', fontSize: 12 }}>Provider</th>
                    <th style={{ textAlign: 'right', padding: '10px 14px', fontWeight: 600, color: '#9B9490', fontSize: 12 }}>Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {report.line_items.map((item, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
                      <td style={{ padding: '10px 14px', color: '#6B6560' }}>{new Date(item.confirmedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</td>
                      <td style={{ padding: '10px 14px', color: D, fontWeight: 500 }}>{item.propertyName}</td>
                      <td style={{ padding: '10px 14px', color: '#6B6560', textTransform: 'capitalize' }}>{item.category?.replace(/_/g, ' ') ?? '-'}</td>
                      <td style={{ padding: '10px 14px', color: '#6B6560' }}>{item.providerName}</td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: O }}>{item.quotedPrice ?? '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Bookings Tab ─────────────────────────────────────────────────────── */

function BusinessBookingsTab({ workspaceId, focusJobId, onFocusHandled }: { workspaceId: string; focusJobId?: string | null; onFocusHandled?: () => void }) {
  const [bookingsList, setBookingsList] = useState<WorkspaceBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [addedToPreferred, setAddedToPreferred] = useState<Set<string>>(new Set());
  const [addingProvider, setAddingProvider] = useState<string | null>(null);
  const [cancellingBooking, setCancellingBooking] = useState<string | null>(null);
  const [showCancelBooking, setShowCancelBooking] = useState<string | null>(null);

  useEffect(() => {
    businessService.listBookings(workspaceId).then(res => {
      const bList = res.data?.bookings ?? [];
      setBookingsList(bList);
      setLoading(false);

      // Auto-expand focused booking after data loads
      if (focusJobId) {
        const match = bList.find(b => b.jobId === focusJobId);
        if (match) {
          setExpandedId(match.id);
          requestAnimationFrame(() => {
            setTimeout(() => {
              const el = document.getElementById(`booking-${match.id}`);
              if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
              onFocusHandled?.();
            }, 100);
          });
        } else {
          onFocusHandled?.();
        }
      }
    }).catch(() => setLoading(false));
  }, [workspaceId]);

  if (loading) return <div style={{ textAlign: 'center', padding: 40, color: '#9B9490' }}>Loading bookings...</div>;

  if (bookingsList.length === 0) return (
    <div style={{ textAlign: 'center', padding: '60px 20px', background: '#FAFAF8', borderRadius: 12, border: '1px dashed #E0DAD4' }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
      <div style={{ fontSize: 16, color: D, fontWeight: 600, marginBottom: 8 }}>No bookings yet</div>
      <div style={{ fontSize: 14, color: '#9B9490' }}>When you book a provider from a dispatch, it will appear here.</div>
    </div>
  );

  return (
    <div>
      <h3 style={{ fontFamily: 'Fraunces, serif', fontSize: 20, color: D, margin: '0 0 20px' }}>Bookings</h3>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {bookingsList.map(b => {
          const isExpanded = expandedId === b.id;
          const catLabel = b.diagnosis?.category ? b.diagnosis.category.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : 'Service';
          const sc = b.status === 'confirmed' ? { bg: '#F0FDF4', text: '#16A34A' } : b.status === 'completed' ? { bg: '#EFF6FF', text: '#2563EB' } : { bg: '#F5F5F5', text: '#9B9490' };

          return (
            <div key={b.id} id={`booking-${b.id}`} onClick={() => setExpandedId(isExpanded ? null : b.id)} style={{
              background: '#fff', borderRadius: 14, overflow: 'hidden', cursor: 'pointer',
              border: isExpanded ? `2px solid ${O}` : '1px solid rgba(0,0,0,0.06)',
              transition: 'all 0.2s',
              boxShadow: isExpanded ? `0 4px 20px ${O}10` : '0 1px 4px rgba(0,0,0,0.03)',
            }}>
              {/* ── Collapsed header ── */}
              <div style={{ padding: '12px 14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 38, height: 38, borderRadius: '50%', flexShrink: 0, background: b.status === 'confirmed' ? `${G}12` : b.status === 'completed' ? '#EFF6FF' : W, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `2px solid ${b.status === 'confirmed' ? `${G}30` : b.status === 'completed' ? '#93C5FD' : '#F0EBE6'}` }}>
                    <span style={{ fontSize: 16 }}>{b.status === 'confirmed' ? '✓' : b.status === 'completed' ? '✓' : '✕'}</span>
                  </div>
                  <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                      <span style={{ fontFamily: 'Fraunces, serif', fontWeight: 700, fontSize: 15, color: D, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{catLabel}</span>
                      <span style={{ background: sc.bg, color: sc.text, padding: '2px 7px', borderRadius: 100, fontSize: 9, fontWeight: 600, flexShrink: 0, textTransform: 'capitalize' }}>{b.status}</span>
                    </div>
                    <div style={{ fontSize: 11, color: '#9B9490', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 500 }}>{b.providerName}</span>
                      {b.propertyName && <span>🏠 {b.propertyName}</span>}
                      <span>{new Date(b.confirmedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0, minWidth: 50 }}>
                    {b.quotedPrice ? (
                      <>
                        <div style={{ fontFamily: 'Fraunces, serif', fontSize: 20, fontWeight: 700, color: O }}>{b.quotedPrice}</div>
                        <div style={{ fontSize: 9, color: '#9B9490' }}>quoted</div>
                      </>
                    ) : (
                      <div style={{ fontSize: 10, fontWeight: 600, color: G }}>Booked</div>
                    )}
                  </div>
                  <span style={{ fontSize: 11, color: '#C0BBB6', flexShrink: 0 }}>{isExpanded ? '▲' : '▼'}</span>
                </div>
              </div>

              {/* ── Expanded detail ── */}
              {isExpanded && (
                <div style={{ padding: '0 14px 16px', borderTop: '1px solid rgba(0,0,0,0.04)' }} onClick={e => e.stopPropagation()}>

                  {/* Summary */}
                  {b.diagnosis?.summary && (
                    <div style={{ fontSize: 13, color: '#6B6560', lineHeight: 1.6, marginBottom: 14, paddingTop: 12 }}>
                      {renderBold(b.diagnosis.summary)}
                    </div>
                  )}

                  {/* Details grid */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 6, marginBottom: 14 }}>
                    {[
                      { label: 'Provider', value: b.providerName },
                      { label: 'Category', value: catLabel },
                      ...(b.propertyName ? [{ label: 'Property', value: b.propertyName }] : []),
                      ...(b.quotedPrice ? [{ label: 'Quoted Price', value: b.quotedPrice, color: O }] : []),
                      ...(b.availability ? [{ label: 'Availability', value: b.availability }] : []),
                      ...(b.serviceAddress ? [{ label: 'Service Address', value: b.serviceAddress }] : []),
                      { label: 'Booked', value: new Date(b.confirmedAt).toLocaleString() },
                      { label: 'Timing', value: b.preferredTiming ?? 'ASAP' },
                    ].map((item, i) => (
                      <div key={i} style={{ background: W, borderRadius: 8, padding: '7px 10px' }}>
                        <div style={{ fontSize: 9, color: '#9B9490', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{item.label}</div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: (item as { color?: string }).color ?? D }}>{item.value}</div>
                      </div>
                    ))}
                  </div>

                  {/* Provider contact */}
                  <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                    {b.providerPhone && (
                      <a href={`tel:${b.providerPhone}`} style={{
                        flex: 1, padding: '10px 0', borderRadius: 100, border: 'none',
                        background: O, color: 'white', fontSize: 14, fontWeight: 600,
                        textAlign: 'center', textDecoration: 'none', display: 'block',
                        boxShadow: `0 4px 16px ${O}40`,
                      }}>📞 Call {b.providerName.split(' ')[0]}</a>
                    )}
                    {b.providerEmail && (
                      <a href={`mailto:${b.providerEmail}`} style={{
                        flex: 1, padding: '10px 0', borderRadius: 100,
                        border: `2px solid ${O}`, background: 'white', color: O,
                        fontSize: 14, fontWeight: 600, textAlign: 'center', textDecoration: 'none', display: 'block',
                      }}>✉️ Email</a>
                    )}
                  </div>

                  {/* Add to preferred providers */}
                  {addedToPreferred.has(b.providerId) ? (
                    <div style={{
                      padding: '10px 0', borderRadius: 100, textAlign: 'center',
                      background: `${G}10`, border: `1px solid ${G}30`,
                      fontSize: 13, fontWeight: 600, color: G,
                    }}>✅ Added to preferred providers</div>
                  ) : (
                    <button onClick={async () => {
                      setAddingProvider(b.providerId);
                      try {
                        const categories = b.diagnosis?.category ? [b.diagnosis.category] : undefined;
                        await businessService.addVendor(workspaceId, {
                          provider_id: b.providerId,
                          property_id: b.propertyId,
                          categories,
                          priority: 1,
                        });
                        setAddedToPreferred(prev => new Set(prev).add(b.providerId));
                      } catch { /* ignore if already added */
                        setAddedToPreferred(prev => new Set(prev).add(b.providerId));
                      }
                      setAddingProvider(null);
                    }} disabled={addingProvider === b.providerId} style={{
                      width: '100%', padding: '10px 0', borderRadius: 100,
                      border: `1px solid ${G}`, background: 'white', color: G,
                      fontSize: 13, fontWeight: 600, cursor: addingProvider === b.providerId ? 'default' : 'pointer',
                      opacity: addingProvider === b.providerId ? 0.6 : 1,
                      transition: 'all 0.2s',
                    }}>{addingProvider === b.providerId ? 'Adding...' : `⭐ Add ${b.providerName.split(' ')[0]} to Preferred Providers`}</button>
                  )}

                  {/* Cancel booking */}
                  {b.status === 'confirmed' && (
                    <div style={{ marginTop: 14, borderTop: '1px solid rgba(0,0,0,0.05)', paddingTop: 14 }}>
                      <button onClick={() => setShowCancelBooking(b.id)} disabled={cancellingBooking === b.id} style={{
                        width: '100%', padding: '10px 0', borderRadius: 100,
                        border: '1px solid #FCA5A5', background: '#FEF2F2', color: '#DC2626',
                        fontSize: 13, fontWeight: 600, cursor: cancellingBooking === b.id ? 'default' : 'pointer',
                        opacity: cancellingBooking === b.id ? 0.6 : 1,
                      }}>{cancellingBooking === b.id ? 'Cancelling...' : 'Cancel Booking'}</button>
                    </div>
                  )}
                  {b.status === 'cancelled' && (
                    <div style={{ marginTop: 10, textAlign: 'center', fontSize: 13, color: '#DC2626', fontWeight: 500 }}>Booking cancelled</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Cancel booking confirmation modal */}
      {showCancelBooking && (() => {
        const booking = bookingsList.find(b => b.id === showCancelBooking);
        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setShowCancelBooking(null)}>
            <div style={{ background: '#fff', borderRadius: 16, padding: 28, width: '100%', maxWidth: 400, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }} onClick={e => e.stopPropagation()}>
              <div style={{ textAlign: 'center', marginBottom: 20 }}>
                <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#FEF2F2', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                  <span style={{ fontSize: 22 }}>⚠️</span>
                </div>
                <h3 style={{ fontFamily: 'Fraunces, serif', fontSize: 20, fontWeight: 700, color: D, margin: '0 0 8px' }}>Cancel this booking?</h3>
                <p style={{ fontSize: 14, color: '#6B6560', lineHeight: 1.6, margin: 0 }}>
                  {booking?.providerName} will be notified of the cancellation via SMS and email.
                </p>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => setShowCancelBooking(null)} style={{
                  flex: 1, padding: '12px 0', borderRadius: 100, border: '1px solid #E0DAD4',
                  background: '#fff', color: D, fontSize: 14, fontWeight: 600, cursor: 'pointer',
                }}>Keep booking</button>
                <button onClick={async () => {
                  const bookingId = showCancelBooking;
                  setShowCancelBooking(null);
                  setCancellingBooking(bookingId);
                  try {
                    const res = await businessService.cancelBooking(workspaceId, bookingId);
                    setBookingsList(prev => prev.map(b => b.id === bookingId ? { ...b, status: 'cancelled' } : b));
                    alert(`Booking cancelled. ${res.data?.provider_notified} was notified.`);
                  } catch (err) {
                    alert((err as Error).message || 'Failed to cancel');
                  }
                  setCancellingBooking(null);
                }} style={{
                  flex: 1, padding: '12px 0', borderRadius: 100, border: 'none',
                  background: '#DC2626', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer',
                }}>Yes, cancel</button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

/* ── Edit Schedule Modal ───────────────────────────────────────────────── */

function EditScheduleModal({ workspaceId, schedule, onClose, onSaved }: {
  workspaceId: string; schedule: DispatchSchedule; onClose: () => void; onSaved: () => void;
}) {
  const [title, setTitle] = useState(schedule.title);
  const [description, setDescription] = useState(schedule.description ?? '');
  const [agreedRate, setAgreedRate] = useState(schedule.agreedRateCents ? (schedule.agreedRateCents / 100).toFixed(0) : '');
  const [autoBook, setAutoBook] = useState(schedule.autoBook);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSave() {
    if (!title.trim()) { setError('Title is required'); return; }
    setSaving(true);
    setError('');
    try {
      await businessService.updateSchedule(workspaceId, schedule.id, {
        title: title.trim(),
        description: description.trim() || null,
        agreed_rate_cents: agreedRate ? Math.round(parseFloat(agreedRate) * 100) : null,
        auto_book: autoBook,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update');
    }
    setSaving(false);
  }

  const inputStyle = { width: '100%', padding: '10px 14px', border: '1px solid #E0DAD4', borderRadius: 8, fontSize: 15, marginBottom: 16, boxSizing: 'border-box' as const };
  const labelStyle = { display: 'block' as const, fontSize: 13, fontWeight: 600, color: '#6B6560', marginBottom: 6 };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
      onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 14, padding: 28, width: '100%', maxWidth: 440, boxShadow: '0 16px 48px rgba(0,0,0,0.15)' }}
        onClick={e => e.stopPropagation()}>
        <h3 style={{ fontFamily: 'Fraunces, serif', fontSize: 20, color: D, margin: '0 0 4px' }}>Edit Schedule</h3>
        <div style={{ fontSize: 13, color: '#9B9490', marginBottom: 20 }}>
          {formatCadence(schedule.cadenceType, schedule.cadenceConfig)} · {schedule.category.replace(/_/g, ' ')}
        </div>

        <label style={labelStyle}>Title</label>
        <input value={title} onChange={e => setTitle(e.target.value)} style={inputStyle} />

        <label style={labelStyle}>Description / Scope</label>
        <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3}
          style={{ ...inputStyle, resize: 'vertical' as const }} />

        <label style={labelStyle}>Agreed Rate ($)</label>
        <input value={agreedRate} onChange={e => setAgreedRate(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="Leave blank for market rate"
          style={inputStyle} />

        <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginBottom: 16 }}>
          <input type="checkbox" checked={autoBook} onChange={e => setAutoBook(e.target.checked)}
            style={{ width: 16, height: 16, accentColor: O }} />
          Auto-book when provider confirms
        </label>

        {error && <div style={{ color: '#DC2626', fontSize: 13, marginBottom: 12 }}>{error}</div>}

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose}
            style={{ flex: 1, padding: '10px 0', borderRadius: 8, border: '1px solid #E0DAD4', background: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', color: D }}>
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving}
            style={{ flex: 1, padding: '10px 0', borderRadius: 8, border: 'none', background: O, color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Settings Tab ──────────────────────────────────────────────────────── */

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

const SLACK_NOTIFICATION_TOGGLES: Array<{ key: keyof SlackSettings; label: string }> = [
  { key: 'notifyDispatchCreated', label: 'New dispatches' },
  { key: 'notifyProviderResponse', label: 'Provider responses' },
  { key: 'notifyBookingConfirmed', label: 'Booking confirmations' },
  { key: 'notifyApprovalNeeded', label: 'Approval requests' },
  { key: 'notifyJobCompleted', label: 'Job completions' },
  { key: 'notifyOutreachFailed', label: 'Failed outreach' },
];

function SlackIntegrationSection({ workspace, isPro, onUpdated }: {
  workspace: WorkspaceDetail;
  isPro: boolean;
  onUpdated: (w: WorkspaceDetail) => void;
}) {
  const [slackSettings, setSlackSettings] = useState<SlackSettings | null>(null);
  const [slackChannels, setSlackChannels] = useState<Array<{ id: string; name: string }>>([]);
  const [slackLoading, setSlackLoading] = useState(false);
  const [slackError, setSlackError] = useState<string | null>(null);
  const [slackSuccess, setSlackSuccess] = useState<string | null>(null);
  const [testSending, setTestSending] = useState(false);
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  useEffect(() => {
    if (!isPro) return;
    setSlackLoading(true);
    slackService.getSettings(workspace.id).then(res => {
      if (res.data) setSlackSettings(res.data);
    }).catch(() => {
      setSlackSettings({ connected: false, notifyDispatchCreated: true, notifyProviderResponse: true, notifyBookingConfirmed: true, notifyApprovalNeeded: true, notifyJobCompleted: true, notifyOutreachFailed: true, notifyDailyDigest: false, approvalThresholdCents: 50000, digestTime: '09:00' });
    }).finally(() => setSlackLoading(false));
  }, [isPro, workspace.id]);

  useEffect(() => {
    if (!slackSettings?.connected || !isPro) return;
    slackService.getChannels(workspace.id).then(res => {
      if (res.data) setSlackChannels(res.data);
    }).catch(() => { /* channels unavailable */ });
  }, [slackSettings?.connected, isPro, workspace.id]);

  async function handleToggle(key: keyof SlackSettings, value: boolean) {
    if (!slackSettings) return;
    const updated = { ...slackSettings, [key]: value };
    setSlackSettings(updated);
    setSlackError(null);
    try {
      const res = await slackService.updateSettings(workspace.id, { [key]: value });
      if (res.data) setSlackSettings(res.data);
    } catch (err: unknown) {
      setSlackError(err instanceof Error ? err.message : 'Failed to save');
      setSlackSettings(slackSettings);
    }
  }

  async function handleChannelChange(channelId: string) {
    if (!slackSettings) return;
    const channel = slackChannels.find(c => c.id === channelId);
    const updated = { ...slackSettings, slackChannelId: channelId, slackChannelName: channel?.name };
    setSlackSettings(updated);
    setSlackError(null);
    try {
      const res = await slackService.updateSettings(workspace.id, { slackChannelId: channelId });
      if (res.data) {
        setSlackSettings(res.data);
        onUpdated({ ...workspace, slackChannelId: channelId });
      }
    } catch (err: unknown) {
      setSlackError(err instanceof Error ? err.message : 'Failed to update channel');
    }
  }

  async function handleThresholdChange(dollars: string) {
    if (!slackSettings) return;
    const cents = Math.round(parseFloat(dollars || '0') * 100);
    if (isNaN(cents)) return;
    const updated = { ...slackSettings, approvalThresholdCents: cents };
    setSlackSettings(updated);
    try {
      const res = await slackService.updateSettings(workspace.id, { approvalThresholdCents: cents });
      if (res.data) setSlackSettings(res.data);
    } catch { /* ignore debounced errors */ }
  }

  async function handleDigestTimeChange(time: string) {
    if (!slackSettings) return;
    const updated = { ...slackSettings, digestTime: time };
    setSlackSettings(updated);
    try {
      const res = await slackService.updateSettings(workspace.id, { digestTime: time });
      if (res.data) setSlackSettings(res.data);
    } catch { /* ignore */ }
  }

  async function handleSendTest() {
    setTestSending(true);
    setSlackError(null);
    setSlackSuccess(null);
    try {
      await slackService.sendTest(workspace.id);
      setSlackSuccess('Test notification sent to Slack');
      setTimeout(() => setSlackSuccess(null), 4000);
    } catch (err: unknown) {
      setSlackError(err instanceof Error ? err.message : 'Failed to send test');
    } finally {
      setTestSending(false);
    }
  }

  async function handleDisconnect() {
    setDisconnecting(true);
    setSlackError(null);
    try {
      await slackService.disconnect(workspace.id);
      setSlackSettings({ ...slackSettings!, connected: false, slackTeamName: undefined, slackChannelName: undefined, slackChannelId: undefined });
      onUpdated({ ...workspace, slackChannelId: null, slackTeamId: null });
      setShowDisconnectConfirm(false);
    } catch (err: unknown) {
      setSlackError(err instanceof Error ? err.message : 'Failed to disconnect');
    } finally {
      setDisconnecting(false);
    }
  }

  const inputStyle = { width: '100%', padding: '10px 14px', border: '1px solid var(--bp-border)', borderRadius: 8, fontSize: 15, boxSizing: 'border-box' as const, background: 'var(--bp-input)', color: 'var(--bp-text)' };

  const toggleStyle = (enabled: boolean): React.CSSProperties => ({
    width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
    background: enabled ? G : 'var(--bp-border)', position: 'relative', transition: 'background 0.2s',
    flexShrink: 0,
  });

  const toggleKnobStyle = (enabled: boolean): React.CSSProperties => ({
    position: 'absolute', top: 2, left: enabled ? 22 : 2,
    width: 20, height: 20, borderRadius: '50%', background: '#fff',
    transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
  });

  return (
    <div style={{ background: 'var(--bp-card)', borderRadius: 12, border: '1px solid var(--bp-border)', padding: 24, marginTop: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zm0 1.271a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zm-1.27 0a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.163 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.163 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.163 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zm0-1.27a2.527 2.527 0 0 1-2.52-2.523 2.527 2.527 0 0 1 2.52-2.52h6.315A2.528 2.528 0 0 1 24 15.163a2.528 2.528 0 0 1-2.522 2.523h-6.315z" fill="#E01E5A"/></svg>
          <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--bp-muted)', margin: 0 }}>Slack Integration</label>
        </div>
        {!isPro && (
          <span style={{ fontSize: 11, fontWeight: 600, color: O, background: `${O}12`, padding: '3px 10px', borderRadius: 100 }}>Professional+</span>
        )}
      </div>

      {!isPro ? (
        <div style={{ fontSize: 13, color: 'var(--bp-muted)', lineHeight: 1.6, opacity: 0.7 }}>
          Get real-time Homie updates in your team's Slack workspace. Available on <strong style={{ color: O }}>Professional</strong> plan and above.
        </div>
      ) : slackLoading ? (
        <div style={{ fontSize: 13, color: 'var(--bp-muted)', padding: '20px 0', textAlign: 'center' }}>Loading Slack settings...</div>
      ) : slackSettings && !slackSettings.connected ? (
        <div style={{ textAlign: 'center', padding: '16px 0' }}>
          <div style={{ fontSize: 14, color: 'var(--bp-muted)', lineHeight: 1.7, marginBottom: 20, maxWidth: 360, margin: '0 auto 20px' }}>
            Get real-time Homie updates in your team's Slack workspace. Receive dispatch alerts, provider quotes, and approve bookings directly from Slack.
          </div>
          <a href={`${API_BASE}/api/v1/integrations/slack/install?workspace_id=${workspace.id}`}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8, padding: '12px 28px',
              borderRadius: 10, border: 'none', background: O, color: '#fff',
              fontSize: 15, fontWeight: 600, cursor: 'pointer', textDecoration: 'none',
            }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313z" fill="#fff"/></svg>
            Connect Slack
          </a>
        </div>
      ) : slackSettings ? (
        <div>
          {/* Connected status */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: G, display: 'inline-block' }} />
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--bp-text)' }}>
              Connected to {slackSettings.slackTeamName || 'Slack'}
            </span>
          </div>

          {slackError && (
            <div style={{ fontSize: 13, color: '#DC2626', marginBottom: 16, padding: '8px 12px', background: '#DC26260A', borderRadius: 8 }}>{slackError}</div>
          )}
          {slackSuccess && (
            <div style={{ fontSize: 13, color: G, marginBottom: 16, padding: '8px 12px', background: `${G}0A`, borderRadius: 8 }}>{slackSuccess}</div>
          )}

          {/* Channel selector */}
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--bp-muted)', marginBottom: 6 }}>Notification Channel</label>
            <select
              value={slackSettings.slackChannelId ?? ''}
              onChange={e => handleChannelChange(e.target.value)}
              style={{ ...inputStyle, cursor: 'pointer' }}
            >
              <option value="">Select a channel...</option>
              {slackChannels.map(ch => (
                <option key={ch.id} value={ch.id}>#{ch.name}</option>
              ))}
            </select>
          </div>

          {/* Notification toggles */}
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--bp-muted)', marginBottom: 12 }}>Notifications</label>
            {SLACK_NOTIFICATION_TOGGLES.map(({ key, label }) => (
              <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--bp-border)' }}>
                <span style={{ fontSize: 14, color: 'var(--bp-text)' }}>{label}</span>
                <button
                  onClick={() => handleToggle(key, !slackSettings[key])}
                  style={toggleStyle(slackSettings[key] as boolean)}
                  aria-label={`Toggle ${label}`}
                >
                  <span style={toggleKnobStyle(slackSettings[key] as boolean)} />
                </button>
              </div>
            ))}

            {/* Daily digest with time */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--bp-border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 14, color: 'var(--bp-text)' }}>Daily digest</span>
                {slackSettings.notifyDailyDigest && (
                  <input
                    type="time"
                    value={slackSettings.digestTime}
                    onChange={e => handleDigestTimeChange(e.target.value)}
                    style={{ padding: '4px 8px', border: '1px solid var(--bp-border)', borderRadius: 6, fontSize: 12, background: 'var(--bp-input)', color: 'var(--bp-text)' }}
                  />
                )}
              </div>
              <button
                onClick={() => handleToggle('notifyDailyDigest', !slackSettings.notifyDailyDigest)}
                style={toggleStyle(slackSettings.notifyDailyDigest)}
                aria-label="Toggle Daily digest"
              >
                <span style={toggleKnobStyle(slackSettings.notifyDailyDigest)} />
              </button>
            </div>
          </div>

          {/* Approval threshold */}
          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--bp-muted)', marginBottom: 6 }}>Approval Threshold</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 14, color: 'var(--bp-text)' }}>Require approval for jobs over</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--bp-text)' }}>$</span>
                <input
                  type="number"
                  min="0"
                  step="50"
                  value={(slackSettings.approvalThresholdCents / 100).toString()}
                  onChange={e => handleThresholdChange(e.target.value)}
                  style={{ ...inputStyle, width: 100, marginBottom: 0, textAlign: 'right' as const }}
                />
              </div>
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button
              onClick={handleSendTest}
              disabled={testSending}
              style={{
                padding: '10px 20px', borderRadius: 8, border: '1px solid var(--bp-border)',
                background: 'var(--bp-bg)', color: 'var(--bp-text)', fontSize: 13, fontWeight: 600,
                cursor: testSending ? 'default' : 'pointer', opacity: testSending ? 0.6 : 1,
              }}
            >
              {testSending ? 'Sending...' : 'Send test notification'}
            </button>
            <button
              onClick={() => setShowDisconnectConfirm(true)}
              style={{
                padding: '10px 20px', borderRadius: 8, border: '1px solid #DC262640',
                background: 'transparent', color: '#DC2626', fontSize: 13, fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Disconnect Slack
            </button>
          </div>

          {/* Disconnect confirmation dialog */}
          {showDisconnectConfirm && (
            <div style={{
              marginTop: 16, padding: 16, borderRadius: 10, border: '1px solid #DC262640',
              background: '#DC26260A',
            }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#DC2626', marginBottom: 8 }}>Disconnect Slack?</div>
              <div style={{ fontSize: 13, color: 'var(--bp-muted)', marginBottom: 16, lineHeight: 1.5 }}>
                This will remove the Slack integration and stop all notifications. You can reconnect at any time.
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  onClick={handleDisconnect}
                  disabled={disconnecting}
                  style={{
                    padding: '8px 20px', borderRadius: 8, border: 'none',
                    background: '#DC2626', color: '#fff', fontSize: 13, fontWeight: 600,
                    cursor: disconnecting ? 'default' : 'pointer', opacity: disconnecting ? 0.6 : 1,
                  }}
                >
                  {disconnecting ? 'Disconnecting...' : 'Yes, disconnect'}
                </button>
                <button
                  onClick={() => setShowDisconnectConfirm(false)}
                  style={{
                    padding: '8px 20px', borderRadius: 8, border: '1px solid var(--bp-border)',
                    background: 'var(--bp-bg)', color: 'var(--bp-text)', fontSize: 13, fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function SettingsTab({ workspace, onUpdated, themeMode, onThemeChange }: {
  workspace: WorkspaceDetail; onUpdated: (w: WorkspaceDetail) => void;
  themeMode: 'light' | 'dark' | 'auto'; onThemeChange: (mode: 'light' | 'dark' | 'auto') => void;
}) {
  const [name, setName] = useState(workspace.name);
  const [slug, setSlug] = useState(workspace.slug);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(workspace.logoUrl ?? null);
  const [logoUploading, setLogoUploading] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const isPro = ['professional', 'business', 'enterprise'].includes(workspace.plan);
  const [companyAddress, setCompanyAddress] = useState(workspace.companyAddress ?? '');
  const [companyPhone, setCompanyPhone] = useState(workspace.companyPhone ?? '');
  const [companyEmail, setCompanyEmail] = useState(workspace.companyEmail ?? '');
  const [savingDetails, setSavingDetails] = useState(false);
  const [detailsMsg, setDetailsMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // My Profile state
  const profileSectionRef = useRef<HTMLDivElement>(null);
  const [myProfile, setMyProfile] = useState<AccountProfile | null>(null);
  const [myFirstName, setMyFirstName] = useState('');
  const [myLastName, setMyLastName] = useState('');
  const [myTitle, setMyTitle] = useState('');
  const [myPhone, setMyPhone] = useState('');
  const [myNotifyEmailQuotes, setMyNotifyEmailQuotes] = useState(true);
  const [myNotifySmsQuotes, setMyNotifySmsQuotes] = useState(true);
  const [myNotifyEmailBookings, setMyNotifyEmailBookings] = useState(true);
  const [myNotifySmsBookings, setMyNotifySmsBookings] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    accountService.getProfile().then(res => {
      if (res.data) {
        setMyProfile(res.data);
        setMyFirstName(res.data.first_name || '');
        setMyLastName(res.data.last_name || '');
        setMyTitle(res.data.title || '');
        setMyPhone(res.data.phone || '');
        setMyNotifyEmailQuotes(res.data.notify_email_quotes);
        setMyNotifySmsQuotes(res.data.notify_sms_quotes);
        setMyNotifyEmailBookings(res.data.notify_email_bookings);
        setMyNotifySmsBookings(res.data.notify_sms_bookings);
      }
    });
  }, []);

  async function handleSaveMyProfile() {
    setSavingProfile(true);
    setProfileMsg(null);
    try {
      const updates: Record<string, unknown> = {};
      if (myFirstName !== (myProfile?.first_name || '')) updates.first_name = myFirstName;
      if (myLastName !== (myProfile?.last_name || '')) updates.last_name = myLastName;
      if (myTitle !== (myProfile?.title || '')) updates.title = myTitle;
      if (myPhone !== (myProfile?.phone || '')) updates.phone = myPhone;
      if (myNotifyEmailQuotes !== myProfile?.notify_email_quotes) updates.notify_email_quotes = myNotifyEmailQuotes;
      if (myNotifySmsQuotes !== myProfile?.notify_sms_quotes) updates.notify_sms_quotes = myNotifySmsQuotes;
      if (myNotifyEmailBookings !== myProfile?.notify_email_bookings) updates.notify_email_bookings = myNotifyEmailBookings;
      if (myNotifySmsBookings !== myProfile?.notify_sms_bookings) updates.notify_sms_bookings = myNotifySmsBookings;
      if (Object.keys(updates).length === 0) { setProfileMsg({ type: 'error', text: 'No changes to save' }); setSavingProfile(false); return; }
      const res = await accountService.updateProfile(updates as Record<string, string>);
      if (res.data) {
        setMyProfile(res.data);
        setProfileMsg({ type: 'success', text: 'Profile updated' });
      }
    } catch (err: unknown) {
      setProfileMsg({ type: 'error', text: err instanceof Error ? err.message : 'Failed to save' });
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleSaveCompanyDetails() {
    setSavingDetails(true);
    setDetailsMsg(null);
    try {
      const res = await businessService.updateWorkspace(workspace.id, {
        company_address: companyAddress || null,
        company_phone: companyPhone || null,
        company_email: companyEmail || null,
      });
      if (res.data) {
        onUpdated({ ...workspace, ...res.data, companyAddress: companyAddress || null, companyPhone: companyPhone || null, companyEmail: companyEmail || null });
        setDetailsMsg({ type: 'success', text: 'Company details saved' });
      }
    } catch (err: unknown) {
      setDetailsMsg({ type: 'error', text: err instanceof Error ? err.message : 'Failed to save' });
    } finally {
      setSavingDetails(false);
    }
  }

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

  const inputStyle = { width: '100%', padding: '10px 14px', border: '1px solid var(--bp-border)', borderRadius: 8, fontSize: 15, marginBottom: 16, boxSizing: 'border-box' as const, background: 'var(--bp-input)', color: 'var(--bp-text)' };

  return (
    <div style={{ maxWidth: 480 }}>
      {/* My Profile */}
      <div ref={profileSectionRef} id="my-profile-section">
        <h3 style={{ fontFamily: 'Fraunces, serif', fontSize: 20, color: 'var(--bp-text)', margin: '0 0 20px' }}>My Profile</h3>
        <div style={{ background: 'var(--bp-card)', borderRadius: 12, border: '1px solid var(--bp-border)', padding: 24, marginBottom: 32 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--bp-muted)', marginBottom: 6 }}>First Name</label>
              <input value={myFirstName} onChange={e => setMyFirstName(e.target.value)} placeholder="First" style={inputStyle} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--bp-muted)', marginBottom: 6 }}>Last Name</label>
              <input value={myLastName} onChange={e => setMyLastName(e.target.value)} placeholder="Last" style={inputStyle} />
            </div>
          </div>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--bp-muted)', marginBottom: 6 }}>Title</label>
          <input value={myTitle} onChange={e => setMyTitle(e.target.value)} placeholder="e.g. Property Manager" style={inputStyle} />
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--bp-muted)', marginBottom: 6 }}>Phone</label>
          <input value={myPhone} onChange={e => setMyPhone(e.target.value)} placeholder="(555) 123-4567" style={inputStyle} />
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--bp-muted)', marginBottom: 6 }}>Email</label>
          <div style={{ padding: '10px 14px', fontSize: 15, color: 'var(--bp-muted)', background: 'var(--bp-bg)', border: '1px solid var(--bp-border)', borderRadius: 8, marginBottom: 16 }}>
            {myProfile?.email ?? '...'}
          </div>

          <div style={{ borderTop: '1px solid var(--bp-border)', paddingTop: 16, marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--bp-text)', marginBottom: 12 }}>Notification Preferences</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {([
                { label: 'Email notifications for quotes', value: myNotifyEmailQuotes, set: setMyNotifyEmailQuotes },
                { label: 'SMS notifications for quotes', value: myNotifySmsQuotes, set: setMyNotifySmsQuotes },
                { label: 'Email notifications for bookings', value: myNotifyEmailBookings, set: setMyNotifyEmailBookings },
                { label: 'SMS notifications for bookings', value: myNotifySmsBookings, set: setMyNotifySmsBookings },
              ] as const).map((item, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 14, color: 'var(--bp-text)' }}>{item.label}</span>
                  <button onClick={() => item.set(!item.value)} style={{
                    width: 36, height: 20, borderRadius: 10, border: 'none', cursor: 'pointer',
                    background: item.value ? G : '#ccc', position: 'relative', transition: 'background 0.2s',
                    flexShrink: 0,
                  }}>
                    <div style={{
                      width: 16, height: 16, borderRadius: '50%', background: '#fff',
                      position: 'absolute', top: 2, left: item.value ? 18 : 2,
                      transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                    }} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {profileMsg && (
            <div style={{ fontSize: 14, marginBottom: 16, color: profileMsg.type === 'success' ? G : '#DC2626' }}>{profileMsg.text}</div>
          )}

          <button onClick={handleSaveMyProfile} disabled={savingProfile}
            style={{ padding: '10px 24px', borderRadius: 8, border: 'none', background: O, color: '#fff', cursor: savingProfile ? 'default' : 'pointer', fontSize: 14, fontWeight: 600, opacity: savingProfile ? 0.7 : 1 }}>
            {savingProfile ? 'Saving...' : 'Save Profile'}
          </button>
        </div>
      </div>

      <h3 style={{ fontFamily: 'Fraunces, serif', fontSize: 20, color: 'var(--bp-text)', margin: '0 0 20px' }}>Workspace Settings</h3>

      <div style={{ background: 'var(--bp-card)', borderRadius: 12, border: '1px solid var(--bp-border)', padding: 24 }}>
        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--bp-muted)', marginBottom: 6 }}>Workspace Name</label>
        <input value={name} onChange={e => setName(e.target.value)} style={inputStyle} />

        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--bp-muted)', marginBottom: 6 }}>Slug</label>
        <input value={slug} onChange={e => setSlug(e.target.value)} style={inputStyle} />

        {msg && (
          <div style={{ fontSize: 14, marginBottom: 16, color: msg.type === 'success' ? G : '#DC2626' }}>{msg.text}</div>
        )}

        <button onClick={handleSave} disabled={saving}
          style={{ padding: '10px 24px', borderRadius: 8, border: 'none', background: O, color: '#fff', cursor: saving ? 'default' : 'pointer', fontSize: 14, fontWeight: 600, opacity: saving ? 0.7 : 1 }}>
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>

      {/* Workspace Details */}
      <div style={{ background: 'var(--bp-card)', borderRadius: 12, border: '1px solid var(--bp-border)', padding: 24, marginTop: 20 }}>
        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--bp-muted)', marginBottom: 12 }}>Workspace Details</label>
        <div style={{ display: 'grid', gap: 10, fontSize: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--bp-muted)' }}>Workspace ID</span>
            <span style={{ color: 'var(--bp-text)', fontFamily: 'DM Mono, monospace', fontSize: 12 }}>{workspace.id}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--bp-muted)' }}>Slug</span>
            <span style={{ color: 'var(--bp-text)' }}>{workspace.slug}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--bp-muted)' }}>Plan</span>
            <span style={{ color: 'var(--bp-text)', textTransform: 'capitalize' }}>{workspace.plan}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--bp-muted)' }}>Created</span>
            <span style={{ color: 'var(--bp-text)' }}>{new Date(workspace.createdAt).toLocaleDateString()}</span>
          </div>
        </div>
      </div>

      {/* Brand Logo */}
      <div style={{ background: 'var(--bp-card)', borderRadius: 12, border: '1px solid var(--bp-border)', padding: 24, marginTop: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--bp-muted)', margin: 0 }}>Brand Logo</label>
          {!isPro && (
            <span style={{ fontSize: 11, fontWeight: 600, color: O, background: `${O}12`, padding: '3px 10px', borderRadius: 100 }}>Professional+</span>
          )}
        </div>

        {isPro ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
              {logoPreview ? (
                <div style={{ position: 'relative' }}>
                  <img src={logoPreview} alt="Brand logo" style={{ width: 72, height: 72, borderRadius: 12, objectFit: 'contain', border: '1px solid var(--bp-border)', background: 'var(--bp-bg)', padding: 4 }} />
                  <button onClick={async () => {
                    setLogoUploading(true);
                    try {
                      await businessService.updateWorkspace(workspace.id, { logo_url: null } as Record<string, unknown>);
                      setLogoPreview(null);
                      onUpdated({ ...workspace, logoUrl: null });
                    } catch { /* ignore */ }
                    setLogoUploading(false);
                  }} style={{
                    position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: '50%',
                    background: '#DC2626', color: '#fff', border: '2px solid var(--bp-card)', fontSize: 10,
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>✕</button>
                </div>
              ) : (
                <div style={{ width: 72, height: 72, borderRadius: 12, border: '2px dashed var(--bp-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <span style={{ fontSize: 28, opacity: 0.3 }}>🏢</span>
                </div>
              )}
              <div>
                <input ref={logoInputRef} type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" hidden onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  if (file.size > 2 * 1024 * 1024) { alert('Logo must be under 2MB'); return; }
                  setLogoUploading(true);
                  const reader = new FileReader();
                  reader.onload = async (ev) => {
                    const dataUrl = ev.target?.result as string;
                    try {
                      await businessService.updateWorkspace(workspace.id, { logo_url: dataUrl } as Record<string, unknown>);
                      setLogoPreview(dataUrl);
                      onUpdated({ ...workspace, logoUrl: dataUrl });
                    } catch { alert('Failed to upload logo'); }
                    setLogoUploading(false);
                  };
                  reader.readAsDataURL(file);
                  if (logoInputRef.current) logoInputRef.current.value = '';
                }} />
                <button onClick={() => logoInputRef.current?.click()} disabled={logoUploading}
                  style={{ padding: '8px 18px', borderRadius: 8, border: '1px solid var(--bp-border)', background: 'var(--bp-bg)', color: 'var(--bp-text)', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: logoUploading ? 0.6 : 1 }}>
                  {logoUploading ? 'Uploading...' : logoPreview ? 'Change Logo' : 'Upload Logo'}
                </button>
                <div style={{ fontSize: 11, color: 'var(--bp-muted)', marginTop: 6 }}>PNG, JPG, SVG, or WebP · Max 2MB</div>
              </div>
            </div>
            <div style={{ fontSize: 12, color: 'var(--bp-muted)', lineHeight: 1.5 }}>
              Your logo appears on the maintenance status tracker, estimate summary PDFs, and the business portal header.
            </div>
          </>
        ) : (
          <div style={{ fontSize: 13, color: 'var(--bp-muted)', lineHeight: 1.6 }}>
            Add your company logo to maintenance status pages shared with guests. Available on <strong style={{ color: O }}>Professional</strong> plan and above.
          </div>
        )}
      </div>

      {/* Company Details */}
      <div style={{ background: 'var(--bp-card)', borderRadius: 12, border: '1px solid var(--bp-border)', padding: 24, marginTop: 20 }}>
        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--bp-muted)', marginBottom: 12 }}>Company Details</label>

        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--bp-muted)', marginBottom: 6 }}>Company Address</label>
        <textarea
          value={companyAddress}
          onChange={e => setCompanyAddress(e.target.value)}
          rows={2}
          style={{ ...inputStyle, resize: 'vertical' as const }}
          placeholder="123 Main St, Suite 100&#10;City, ST 12345"
        />

        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--bp-muted)', marginBottom: 6 }}>Company Phone</label>
        <input
          value={companyPhone}
          onChange={e => setCompanyPhone(e.target.value)}
          style={inputStyle}
          placeholder="(555) 123-4567"
        />

        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--bp-muted)', marginBottom: 6 }}>Company Email</label>
        <input
          value={companyEmail}
          onChange={e => setCompanyEmail(e.target.value)}
          style={inputStyle}
          placeholder="info@yourcompany.com"
          type="email"
        />

        <div style={{ fontSize: 12, color: 'var(--bp-muted)', marginBottom: 16, lineHeight: 1.5 }}>
          These details appear on estimate summary PDFs.
        </div>

        {detailsMsg && (
          <div style={{ fontSize: 14, marginBottom: 16, color: detailsMsg.type === 'success' ? G : '#DC2626' }}>{detailsMsg.text}</div>
        )}

        <button onClick={handleSaveCompanyDetails} disabled={savingDetails}
          style={{ padding: '10px 24px', borderRadius: 8, border: 'none', background: O, color: '#fff', cursor: savingDetails ? 'default' : 'pointer', fontSize: 14, fontWeight: 600, opacity: savingDetails ? 0.7 : 1 }}>
          {savingDetails ? 'Saving...' : 'Save Company Details'}
        </button>
      </div>

      {/* Appearance */}
      <div style={{ background: 'var(--bp-card)', borderRadius: 12, border: '1px solid var(--bp-border)', padding: 24, marginTop: 20 }}>
        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--bp-muted)', marginBottom: 12 }}>Appearance</label>
        <div style={{ display: 'flex', gap: 8 }}>
          {([
            { value: 'light' as const, label: '☀️ Light', desc: 'Always light' },
            { value: 'dark' as const, label: '🌙 Dark', desc: 'Always dark' },
            { value: 'auto' as const, label: '🔄 Auto', desc: 'Based on time of day' },
          ]).map(opt => (
            <button key={opt.value} onClick={() => onThemeChange(opt.value)}
              style={{
                flex: 1, padding: '12px 8px', borderRadius: 10, cursor: 'pointer', textAlign: 'center',
                border: themeMode === opt.value ? `2px solid ${O}` : '1px solid var(--bp-border)',
                background: themeMode === opt.value ? `${O}12` : 'var(--bp-bg)',
                transition: 'all 0.15s',
              }}>
              <div style={{ fontSize: 20, marginBottom: 4 }}>{opt.label.split(' ')[0]}</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: themeMode === opt.value ? O : 'var(--bp-text)' }}>{opt.label.split(' ').slice(1).join(' ')}</div>
              <div style={{ fontSize: 11, color: 'var(--bp-muted)', marginTop: 2 }}>{opt.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Slack Integration */}
      <SlackIntegrationSection workspace={workspace} isPro={isPro} onUpdated={onUpdated} />
    </div>
  );
}

/* ── Guest Requests Tab ────────────────────────────────────────────────── */

const GUEST_STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  pm_reviewing: { bg: '#FFF3E0', text: '#E65100' },
  approved: { bg: '#E3F2FD', text: '#1565C0' },
  dispatching: { bg: '#F3E5F5', text: '#7B1FA2' },
  provider_booked: { bg: '#E8F5E9', text: '#2E7D32' },
  resolved: { bg: '#E8F5E9', text: '#2E7D32' },
  closed: { bg: '#F5F5F5', text: '#757575' },
  self_resolved: { bg: '#E0F2F1', text: '#00695C' },
};

const SEVERITY_COLORS: Record<string, { bg: string; text: string }> = {
  urgent: { bg: '#FFEBEE', text: '#C62828' },
  high: { bg: '#FFF3E0', text: '#E65100' },
  medium: { bg: '#FFFDE7', text: '#F9A825' },
  low: { bg: '#E8F5E9', text: '#2E7D32' },
};

const LANGUAGES = [
  { value: 'en', label: 'English' }, { value: 'es', label: 'Spanish' }, { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' }, { value: 'pt', label: 'Portuguese' }, { value: 'zh', label: 'Chinese' },
  { value: 'ja', label: 'Japanese' }, { value: 'ko', label: 'Korean' }, { value: 'ar', label: 'Arabic' },
  { value: 'it', label: 'Italian' },
];

type GuestSubTab = 'issues' | 'settings' | 'auto-dispatch' | 'qr-codes';

function GuestRequestsTab({ workspaceId, plan, onViewDispatch }: { workspaceId: string; plan: string; onViewDispatch?: (jobId: string) => void }) {
  const [subTab, setSubTab] = useState<GuestSubTab>('issues');
  const isPro = ['professional', 'business', 'enterprise'].includes(plan);
  const isBizPlus = ['business', 'enterprise'].includes(plan);

  if (!isPro) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 20px', background: '#FAFAF8', borderRadius: 12, border: '1px dashed #E0DAD4' }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🎯</div>
        <div style={{ fontSize: 16, color: D, fontWeight: 600, marginBottom: 8 }}>Upgrade to unlock Guest Requests</div>
        <div style={{ fontSize: 14, color: '#9B9490', maxWidth: 480, margin: '0 auto', lineHeight: 1.6 }}>
          Guest issue reporting, auto-dispatch rules, and QR code links are available on the <strong style={{ color: O }}>Professional</strong> plan and above.
        </div>
      </div>
    );
  }

  const subTabs: { key: GuestSubTab; label: string }[] = [
    { key: 'issues', label: 'Issues' },
    { key: 'settings', label: 'Settings' },
    { key: 'auto-dispatch', label: 'Auto-Dispatch Rules' },
    { key: 'qr-codes', label: 'QR Codes' },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ fontFamily: 'Fraunces, serif', fontSize: 20, color: D, margin: 0 }}>Guest Requests</h3>
      </div>
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid #E0DAD4', marginBottom: 20 }}>
        {subTabs.map(st => (
          <button key={st.key} onClick={() => setSubTab(st.key)}
            style={{
              padding: '10px 18px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
              color: subTab === st.key ? O : '#9B9490',
              borderBottom: subTab === st.key ? `2px solid ${O}` : '2px solid transparent',
              marginBottom: -1, whiteSpace: 'nowrap',
            }}>
            {st.label}
          </button>
        ))}
      </div>
      {subTab === 'issues' && <GuestIssuesSubTab workspaceId={workspaceId} onViewDispatch={onViewDispatch} />}
      {subTab === 'settings' && <GuestSettingsSubTab workspaceId={workspaceId} isBizPlus={isBizPlus} />}
      {subTab === 'auto-dispatch' && <GuestAutoDispatchSubTab workspaceId={workspaceId} />}
      {subTab === 'qr-codes' && <GuestQRCodesSubTab workspaceId={workspaceId} />}
    </div>
  );
}

/* ── Issues sub-tab ── */

function GuestIssuesSubTab({ workspaceId, onViewDispatch }: { workspaceId: string; onViewDispatch?: (jobId: string) => void }) {
  const [issues, setIssues] = useState<GuestIssue[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<GuestIssueDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterSeverity, setFilterSeverity] = useState('');
  const [filterProperty, setFilterProperty] = useState('');
  const [properties, setProperties] = useState<Property[]>([]);
  const [page, setPage] = useState(1);
  const [actionLoading, setActionLoading] = useState(false);
  const [rejectModalId, setRejectModalId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [preferredOnly, setPreferredOnly] = useState(false);
  const [selectedVendorIds, setSelectedVendorIds] = useState<Set<string>>(new Set());
  const [vendors, setVendors] = useState<PreferredVendor[]>([]);
  const [showArchived, setShowArchived] = useState(false);

  useEffect(() => {
    businessService.listProperties(workspaceId).then(res => {
      if (res.data) setProperties(res.data);
    }).catch(() => {});
    businessService.listVendors(workspaceId).then(res => {
      if (res.data) setVendors(res.data.filter(v => v.active));
    }).catch(() => {});
  }, [workspaceId]);

  useEffect(() => {
    setLoading(true);
    businessService.listGuestIssues(workspaceId, {
      status: showArchived ? 'archived' : (filterStatus || undefined),
      severity: filterSeverity || undefined,
      property_id: filterProperty || undefined,
      page,
      limit: 20,
    }).then(res => {
      if (res.data) {
        // Filter out archived from normal view, show only archived in archive view
        const filtered = showArchived ? res.data.issues : res.data.issues.filter(i => i.status !== 'archived');
        setIssues(filtered);
        setTotal(res.data.total);
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [workspaceId, filterStatus, filterSeverity, filterProperty, page, showArchived]);

  async function toggleExpand(issueId: string) {
    if (expandedId === issueId) { setExpandedId(null); setDetail(null); return; }
    setExpandedId(issueId);
    setDetailLoading(true);
    try {
      const res = await businessService.getGuestIssue(workspaceId, issueId);
      if (res.data) setDetail(res.data);
    } catch { /* ignore */ }
    setDetailLoading(false);
  }

  async function handleApprove(issueId: string) {
    setActionLoading(true);
    try {
      await businessService.approveGuestIssue(workspaceId, issueId, {
        preferredOnly: preferredOnly || undefined,
        preferredVendorIds: selectedVendorIds.size > 0 ? [...selectedVendorIds] : undefined,
      });
      setIssues(prev => prev.map(i => i.id === issueId ? { ...i, status: 'approved' } : i));
      if (detail?.id === issueId) setDetail({ ...detail, status: 'approved' });
      setPreferredOnly(false);
      setSelectedVendorIds(new Set());
    } catch { alert('Failed to approve issue'); }
    setActionLoading(false);
  }

  async function handleReject(issueId: string) {
    if (!rejectReason.trim()) return;
    setActionLoading(true);
    try {
      await businessService.rejectGuestIssue(workspaceId, issueId, rejectReason.trim());
      setIssues(prev => prev.map(i => i.id === issueId ? { ...i, status: 'closed' } : i));
      if (detail?.id === issueId) setDetail({ ...detail, status: 'closed' });
      setRejectModalId(null);
      setRejectReason('');
    } catch { alert('Failed to close issue'); }
    setActionLoading(false);
  }

  async function handleSelfResolve(issueId: string) {
    setActionLoading(true);
    try {
      await businessService.selfResolveGuestIssue(workspaceId, issueId);
      setIssues(prev => prev.map(i => i.id === issueId ? { ...i, status: 'self_resolved' } : i));
      if (detail?.id === issueId) setDetail({ ...detail, status: 'self_resolved' });
    } catch { alert('Failed to self-resolve issue'); }
    setActionLoading(false);
  }

  async function handleCancel(issueId: string) {
    setActionLoading(true);
    try {
      await businessService.cancelGuestIssue(workspaceId, issueId);
      setIssues(prev => prev.map(i => i.id === issueId ? { ...i, status: 'closed' } : i));
      if (detail?.id === issueId) setDetail({ ...detail, status: 'closed' });
    } catch { alert('Failed to cancel issue'); }
    setActionLoading(false);
  }

  async function handleResolve(issueId: string) {
    setActionLoading(true);
    try {
      await businessService.resolveGuestIssue(workspaceId, issueId);
      setIssues(prev => prev.map(i => i.id === issueId ? { ...i, status: 'resolved' } : i));
      if (detail?.id === issueId) setDetail({ ...detail, status: 'resolved' });
    } catch { alert('Failed to resolve issue'); }
    setActionLoading(false);
  }

  async function handleArchive(issueId: string) {
    try {
      await businessService.archiveGuestIssue(workspaceId, issueId);
      setIssues(prev => prev.filter(i => i.id !== issueId));
      setExpandedId(null);
      setDetail(null);
    } catch { alert('Failed to archive issue'); }
  }

  const selectStyle: React.CSSProperties = {
    padding: '8px 12px', borderRadius: 8, border: '1px solid #E0DAD4', fontSize: 13, color: D, background: '#fff', cursor: 'pointer',
  };

  return (
    <div>
      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(1); }} style={selectStyle}>
          <option value="">All Statuses</option>
          <option value="pm_reviewing">PM Reviewing</option>
          <option value="approved">Approved</option>
          <option value="dispatching">Dispatching</option>
          <option value="provider_booked">Provider Booked</option>
          <option value="resolved">Resolved</option>
          <option value="closed">Closed</option>
          <option value="self_resolved">Self Resolved</option>
        </select>
        <select value={filterSeverity} onChange={e => { setFilterSeverity(e.target.value); setPage(1); }} style={selectStyle}>
          <option value="">All Severities</option>
          <option value="urgent">Urgent</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <select value={filterProperty} onChange={e => { setFilterProperty(e.target.value); setPage(1); }} style={selectStyle}>
          <option value="">All Properties</option>
          {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <button onClick={() => { setShowArchived(!showArchived); setPage(1); setFilterStatus(''); }}
          style={{ marginLeft: 'auto', padding: '6px 14px', borderRadius: 8, border: `1px solid ${showArchived ? O : '#E0DAD4'}`, background: showArchived ? `${O}08` : '#fff', color: showArchived ? O : '#9B9490', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
          {showArchived ? 'Active Issues' : 'Archived'}
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#9B9490' }}>Loading issues...</div>
      ) : issues.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', background: '#FAFAF8', borderRadius: 12, border: '1px dashed #E0DAD4' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🎯</div>
          <div style={{ fontSize: 16, color: D, fontWeight: 600, marginBottom: 8 }}>No guest issues found</div>
          <div style={{ fontSize: 14, color: '#9B9490' }}>Issues reported by guests will appear here.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {issues.map(issue => {
            const sc = GUEST_STATUS_COLORS[issue.status] || GUEST_STATUS_COLORS.closed;
            const sev = SEVERITY_COLORS[issue.severity] || SEVERITY_COLORS.low;
            const isExpanded = expandedId === issue.id;
            const isReviewing = issue.status === 'pm_reviewing';

            return (
              <div key={issue.id} onClick={() => toggleExpand(issue.id)} style={{
                background: '#fff', borderRadius: 14, overflow: 'hidden', cursor: 'pointer',
                border: isReviewing ? `2px solid ${O}` : isExpanded ? `2px solid ${O}` : '1px solid rgba(0,0,0,0.06)',
                transition: 'all 0.2s',
                boxShadow: isReviewing ? `0 2px 12px ${O}15` : isExpanded ? `0 4px 20px ${O}10` : '0 1px 4px rgba(0,0,0,0.03)',
              }}>
                {/* Collapsed header */}
                <div style={{ padding: '12px 14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 38, height: 38, borderRadius: '50%', flexShrink: 0, background: W, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid #F0EBE6', fontSize: 18 }}>
                      {issue.categoryIcon || '🔧'}
                    </div>
                    <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2, flexWrap: 'wrap' }}>
                        <span style={{ fontFamily: 'Fraunces, serif', fontWeight: 700, fontSize: 15, color: D, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{issue.categoryName}</span>
                        <span style={{ background: sc.bg, color: sc.text, padding: '2px 7px', borderRadius: 100, fontSize: 9, fontWeight: 600, flexShrink: 0 }}>
                          {issue.status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                        </span>
                        <span style={{ background: sev.bg, color: sev.text, padding: '2px 7px', borderRadius: 100, fontSize: 9, fontWeight: 600, flexShrink: 0 }}>
                          {issue.severity.charAt(0).toUpperCase() + issue.severity.slice(1)}
                        </span>
                        {issue.isRecurring && <span style={{ background: '#FFF3E0', color: '#E65100', padding: '2px 7px', borderRadius: 100, fontSize: 9, fontWeight: 600 }}>Recurring</span>}
                        {issue.autoDispatched && <span style={{ background: '#E8F5E9', color: '#2E7D32', padding: '2px 7px', borderRadius: 100, fontSize: 9, fontWeight: 600 }}>Auto-dispatched</span>}
                      </div>
                      <div style={{ fontSize: 11, color: '#9B9490', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <span>🏠 {issue.propertyName}</span>
                        {issue.guestName && <span>👤 {issue.guestName}</span>}
                        <span>{timeAgo(issue.createdAt)}</span>
                      </div>
                    </div>
                    <span style={{ fontSize: 11, color: '#C0BBB6', flexShrink: 0 }}>{isExpanded ? '▲' : '▼'}</span>
                  </div>
                </div>

                {/* Expanded detail */}
                {isExpanded && (
                  <div style={{ padding: '0 14px 16px', borderTop: '1px solid rgba(0,0,0,0.04)' }} onClick={e => e.stopPropagation()}>
                    {detailLoading ? (
                      <div style={{ textAlign: 'center', padding: 20, color: '#9B9490' }}>Loading details...</div>
                    ) : detail && detail.id === issue.id ? (
                      <div style={{ paddingTop: 12 }}>
                        {/* Description */}
                        <div style={{ marginBottom: 16 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: '#6B6560', marginBottom: 6 }}>Description</div>
                          <div style={{ fontSize: 14, color: D, lineHeight: 1.6, background: W, padding: 12, borderRadius: 8 }}
                            dangerouslySetInnerHTML={{ __html: (detail.description ?? '')
                              .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
                              .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
                              .replace(/\n/g, '<br/>') }}
                          />
                        </div>

                        {/* Photos */}
                        {detail.photos.length > 0 && (
                          <div style={{ marginBottom: 16 }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: '#6B6560', marginBottom: 6 }}>Photos ({detail.photos.length})</div>
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                              {detail.photos.map(photo => (
                                <a key={photo.id} href={photo.storageUrl} target="_blank" rel="noopener noreferrer">
                                  <img src={photo.thumbnailUrl || photo.storageUrl} alt="Issue photo"
                                    style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 8, border: '1px solid #E0DAD4' }} />
                                </a>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Troubleshoot log */}
                        {detail.troubleshootLog && detail.troubleshootLog.length > 0 && (
                          <div style={{ marginBottom: 16 }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: '#6B6560', marginBottom: 6 }}>Troubleshoot Log</div>
                            <div style={{ background: W, borderRadius: 8, padding: 12 }}>
                              {detail.troubleshootLog.map((entry, i) => (
                                <div key={i} style={{ marginBottom: i < detail.troubleshootLog!.length - 1 ? 10 : 0 }}>
                                  <div style={{ fontSize: 12, fontWeight: 600, color: '#6B6560' }}>Q: {entry.question}</div>
                                  <div style={{ fontSize: 13, color: D, marginTop: 2 }}>A: {entry.answer}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Recurring alert */}
                        {issue.isRecurring && (
                          <div style={{ background: '#FFF3E0', borderRadius: 8, padding: 12, marginBottom: 16, display: 'flex', gap: 8, alignItems: 'center' }}>
                            <span style={{ fontSize: 16 }}>🔄</span>
                            <div style={{ fontSize: 13, color: '#E65100', fontWeight: 600 }}>This issue has been reported multiple times and may need a permanent fix.</div>
                          </div>
                        )}

                        {/* Guest satisfaction */}
                        {detail.guestSatisfactionRating && (
                          <div style={{ background: W, borderRadius: 8, padding: 12, marginBottom: 16 }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: '#6B6560', marginBottom: 4 }}>Guest Satisfaction</div>
                            <div style={{ fontSize: 14, color: D }}>Rating: {detail.guestSatisfactionRating}{detail.guestSatisfactionComment ? ` - "${detail.guestSatisfactionComment}"` : ''}</div>
                          </div>
                        )}

                        {/* Timeline */}
                        {detail.timeline.length > 0 && (
                          <div style={{ marginBottom: 16 }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: '#6B6560', marginBottom: 6 }}>Timeline</div>
                            <div style={{ borderLeft: '2px solid #E0DAD4', paddingLeft: 14 }}>
                              {detail.timeline.map((evt, i) => (
                                <div key={i} style={{ marginBottom: 10, position: 'relative' }}>
                                  <div style={{ position: 'absolute', left: -19, top: 4, width: 8, height: 8, borderRadius: '50%', background: O }} />
                                  <div style={{ fontSize: 12, fontWeight: 600, color: D }}>{evt.title}</div>
                                  {evt.description && <div style={{ fontSize: 12, color: '#9B9490', marginTop: 2 }}>{evt.description}</div>}
                                  <div style={{ fontSize: 11, color: '#C0BBB6', marginTop: 2 }}>{timeAgo(evt.createdAt)}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Dispatch options */}
                        {issue.status === 'pm_reviewing' && (
                          <div style={{ background: W, borderRadius: 10, padding: 14, marginBottom: 12 }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: preferredOnly ? 10 : 0 }}>
                              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13, color: D }}>
                                <div onClick={() => { setPreferredOnly(!preferredOnly); if (preferredOnly) setSelectedVendorIds(new Set()); }} style={{
                                  width: 38, height: 20, borderRadius: 10, background: preferredOnly ? G : '#E0DAD4',
                                  position: 'relative', transition: 'background 0.2s', flexShrink: 0, cursor: 'pointer',
                                }}>
                                  <div style={{
                                    width: 16, height: 16, borderRadius: '50%', background: '#fff', position: 'absolute',
                                    top: 2, left: preferredOnly ? 20 : 2, transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                                  }} />
                                </div>
                                <span style={{ fontWeight: 500 }}>Preferred vendors only</span>
                              </label>
                            </div>
                            {preferredOnly && (
                              <div style={{ animation: 'fadeSlide 0.2s ease' }}>
                                <div style={{ border: '1px solid #E0DAD4', borderRadius: 8, padding: '6px 0', maxHeight: 160, overflowY: 'auto' }}>
                                  {[...new Map(vendors.map(v => [v.providerId, v])).values()].map(v => (
                                    <label key={v.providerId} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', cursor: 'pointer', fontSize: 13, color: D }}
                                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = W; }}
                                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                                    >
                                      <input
                                        type="checkbox"
                                        checked={selectedVendorIds.has(v.providerId)}
                                        onChange={() => {
                                          setSelectedVendorIds(prev => {
                                            const next = new Set(prev);
                                            if (next.has(v.providerId)) next.delete(v.providerId);
                                            else next.add(v.providerId);
                                            return next;
                                          });
                                        }}
                                        style={{ accentColor: G, width: 16, height: 16, cursor: 'pointer' }}
                                      />
                                      {v.providerName}
                                    </label>
                                  ))}
                                </div>
                                <div style={{ fontSize: 11, color: '#9B9490', marginTop: 4 }}>
                                  {selectedVendorIds.size > 0 ? `${selectedVendorIds.size} vendor${selectedVendorIds.size > 1 ? 's' : ''} selected` : 'All preferred vendors will be contacted'}
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Actions */}
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          {issue.status === 'pm_reviewing' && (
                            <>
                              <button onClick={() => handleApprove(issue.id)} disabled={actionLoading}
                                style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: G, color: '#fff', fontSize: 13, fontWeight: 600, cursor: actionLoading ? 'default' : 'pointer', opacity: actionLoading ? 0.6 : 1 }}>
                                Approve &amp; Dispatch
                              </button>
                              <button onClick={() => handleSelfResolve(issue.id)} disabled={actionLoading}
                                style={{ padding: '8px 16px', borderRadius: 8, border: `1px solid ${G}`, background: '#fff', color: G, fontSize: 13, fontWeight: 600, cursor: actionLoading ? 'default' : 'pointer', opacity: actionLoading ? 0.6 : 1 }}>
                                Self-Resolved
                              </button>
                              <button onClick={() => { setRejectModalId(issue.id); setRejectReason(''); }}
                                style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #DC2626', background: '#fff', color: '#DC2626', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                                Close Issue
                              </button>
                            </>
                          )}
                          {['dispatching', 'approved', 'provider_responding'].includes(issue.status) && (
                            <>
                              <button onClick={() => handleSelfResolve(issue.id)} disabled={actionLoading}
                                style={{ padding: '8px 16px', borderRadius: 8, border: `1px solid ${G}`, background: '#fff', color: G, fontSize: 13, fontWeight: 600, cursor: actionLoading ? 'default' : 'pointer', opacity: actionLoading ? 0.6 : 1 }}>
                                Self-Resolved
                              </button>
                              <button onClick={() => handleCancel(issue.id)} disabled={actionLoading}
                                style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #DC2626', background: '#fff', color: '#DC2626', fontSize: 13, fontWeight: 600, cursor: actionLoading ? 'default' : 'pointer', opacity: actionLoading ? 0.6 : 1 }}>
                                Cancel
                              </button>
                            </>
                          )}
                          {issue.status === 'provider_booked' && (
                            <>
                              <button onClick={() => handleResolve(issue.id)} disabled={actionLoading}
                                style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: G, color: '#fff', fontSize: 13, fontWeight: 600, cursor: actionLoading ? 'default' : 'pointer', opacity: actionLoading ? 0.6 : 1 }}>
                                Mark Resolved
                              </button>
                              <button onClick={() => handleCancel(issue.id)} disabled={actionLoading}
                                style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #DC2626', background: '#fff', color: '#DC2626', fontSize: 13, fontWeight: 600, cursor: actionLoading ? 'default' : 'pointer', opacity: actionLoading ? 0.6 : 1 }}>
                                Cancel
                              </button>
                            </>
                          )}
                          {['closed', 'self_resolved', 'resolved'].includes(issue.status) && (
                            <button onClick={() => handleArchive(issue.id)}
                              style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #9B9490', background: '#fff', color: '#9B9490', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                              Archive
                            </button>
                          )}
                          {detail.dispatchedJobId && (
                            <button onClick={() => onViewDispatch?.(detail.dispatchedJobId!)}
                              style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #E0DAD4', background: '#fff', color: D, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
                              View Dispatch
                            </button>
                          )}
                        </div>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {total > 20 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 20 }}>
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
            style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #E0DAD4', background: '#fff', cursor: page === 1 ? 'default' : 'pointer', fontSize: 13, color: page === 1 ? '#C0BBB6' : D }}>
            Previous
          </button>
          <span style={{ padding: '8px 12px', fontSize: 13, color: '#9B9490' }}>Page {page} of {Math.ceil(total / 20)}</span>
          <button onClick={() => setPage(p => p + 1)} disabled={page >= Math.ceil(total / 20)}
            style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #E0DAD4', background: '#fff', cursor: page >= Math.ceil(total / 20) ? 'default' : 'pointer', fontSize: 13, color: page >= Math.ceil(total / 20) ? '#C0BBB6' : D }}>
            Next
          </button>
        </div>
      )}

      {/* Reject modal */}
      {rejectModalId && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={() => setRejectModalId(null)}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 32, width: '100%', maxWidth: 440, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}
            onClick={e => e.stopPropagation()}>
            <h3 style={{ fontFamily: 'Fraunces, serif', fontSize: 20, color: D, margin: '0 0 16px' }}>Close Issue</h3>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#6B6560', marginBottom: 6 }}>Reason for closing *</label>
            <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)} rows={3} placeholder="Enter reason..."
              style={{ width: '100%', padding: '10px 14px', border: '1px solid #E0DAD4', borderRadius: 8, fontSize: 14, marginBottom: 16, boxSizing: 'border-box', resize: 'vertical' }} />
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button onClick={() => setRejectModalId(null)} style={{ padding: '10px 20px', borderRadius: 8, border: '1px solid #E0DAD4', background: '#fff', cursor: 'pointer', fontSize: 14, color: D }}>Cancel</button>
              <button onClick={() => handleReject(rejectModalId)} disabled={actionLoading || !rejectReason.trim()}
                style={{ padding: '10px 24px', borderRadius: 8, border: 'none', background: '#DC2626', color: '#fff', cursor: actionLoading ? 'default' : 'pointer', fontSize: 14, fontWeight: 600, opacity: actionLoading || !rejectReason.trim() ? 0.6 : 1 }}>
                Close Issue
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Settings sub-tab ── */

function GuestSettingsSubTab({ workspaceId, isBizPlus }: { workspaceId: string; isBizPlus: boolean }) {
  const [settings, setSettings] = useState<GuestReporterSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [draft, setDraft] = useState<Partial<GuestReporterSettings>>({});

  useEffect(() => {
    businessService.getGuestReporterSettings(workspaceId).then(res => {
      if (res.data) { setSettings(res.data); setDraft(res.data); }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [workspaceId]);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    try {
      const res = await businessService.updateGuestReporterSettings(workspaceId, draft);
      if (res.data) { setSettings(res.data); setDraft(res.data); }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch { alert('Failed to save settings'); }
    setSaving(false);
  }

  if (loading) return <div style={{ textAlign: 'center', padding: 40, color: '#9B9490' }}>Loading settings...</div>;
  if (!settings) return <div style={{ textAlign: 'center', padding: 40, color: '#9B9490' }}>Could not load settings.</div>;

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 14px', border: '1px solid #E0DAD4', borderRadius: 8, fontSize: 14, boxSizing: 'border-box',
  };
  const labelStyle: React.CSSProperties = { display: 'block', fontSize: 13, fontWeight: 600, color: '#6B6560', marginBottom: 6 };

  return (
    <div style={{ maxWidth: 600 }}>
      {/* Enable toggle */}
      <div style={{ background: '#fff', borderRadius: 14, border: '1px solid rgba(0,0,0,0.06)', padding: 20, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontFamily: 'Fraunces, serif', fontSize: 16, fontWeight: 700, color: D }}>Guest Reporter</div>
            <div style={{ fontSize: 13, color: '#9B9490', marginTop: 2 }}>Allow guests to report maintenance issues via a link or QR code.</div>
          </div>
          <button onClick={() => setDraft(d => ({ ...d, isEnabled: !d.isEnabled }))}
            style={{ width: 48, height: 26, borderRadius: 13, border: 'none', cursor: 'pointer', position: 'relative', background: draft.isEnabled ? G : '#D0CBC6', transition: 'background 0.2s' }}>
            <div style={{ width: 20, height: 20, borderRadius: '50%', background: '#fff', position: 'absolute', top: 3, left: draft.isEnabled ? 25 : 3, transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
          </button>
        </div>
      </div>

      {/* Whitelabel */}
      {isBizPlus && (
        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid rgba(0,0,0,0.06)', padding: 20, marginBottom: 16 }}>
          <div style={{ fontFamily: 'Fraunces, serif', fontSize: 16, fontWeight: 700, color: D, marginBottom: 16 }}>Whitelabel</div>
          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Logo URL</label>
            <input value={draft.whitelabelLogoUrl || ''} onChange={e => setDraft(d => ({ ...d, whitelabelLogoUrl: e.target.value || null }))} placeholder="https://..." style={inputStyle} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Company Name</label>
            <input value={draft.whitelabelCompanyName || ''} onChange={e => setDraft(d => ({ ...d, whitelabelCompanyName: e.target.value || null }))} placeholder="Your Company" style={inputStyle} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input type="checkbox" checked={draft.showPoweredByHomie ?? true} onChange={e => setDraft(d => ({ ...d, showPoweredByHomie: e.target.checked }))} />
            <span style={{ fontSize: 13, color: D }}>Show "Powered by Homie" badge</span>
          </div>
        </div>
      )}

      {/* Language */}
      <div style={{ background: '#fff', borderRadius: 14, border: '1px solid rgba(0,0,0,0.06)', padding: 20, marginBottom: 16 }}>
        <div style={{ fontFamily: 'Fraunces, serif', fontSize: 16, fontWeight: 700, color: D, marginBottom: 16 }}>Language</div>
        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>Default Language</label>
          <select value={draft.defaultLanguage || 'en'} onChange={e => setDraft(d => ({ ...d, defaultLanguage: e.target.value }))}
            style={{ ...inputStyle, cursor: 'pointer' }}>
            {LANGUAGES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Supported Languages</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {LANGUAGES.map(l => (
              <label key={l.value} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, color: D, cursor: 'pointer' }}>
                <input type="checkbox" checked={(draft.supportedLanguages || []).includes(l.value)}
                  onChange={e => {
                    const current = draft.supportedLanguages || [];
                    setDraft(d => ({
                      ...d,
                      supportedLanguages: e.target.checked ? [...current, l.value] : current.filter(v => v !== l.value),
                    }));
                  }} />
                {l.label}
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* SLA */}
      <div style={{ background: '#fff', borderRadius: 14, border: '1px solid rgba(0,0,0,0.06)', padding: 20, marginBottom: 16 }}>
        <div style={{ fontFamily: 'Fraunces, serif', fontSize: 16, fontWeight: 700, color: D, marginBottom: 16 }}>SLA Response Times (minutes)</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {([['slaUrgentMinutes', 'Urgent'] as const, ['slaHighMinutes', 'High'] as const, ['slaMediumMinutes', 'Medium'] as const, ['slaLowMinutes', 'Low'] as const]).map(([key, label]) => (
            <div key={key}>
              <label style={labelStyle}>{label}</label>
              <input type="number" value={draft[key] ?? ''} onChange={e => setDraft(d => ({ ...d, [key]: parseInt(e.target.value) || 0 }))}
                style={inputStyle} min={0} />
            </div>
          ))}
        </div>
      </div>

      {/* PM Approval */}
      <div style={{ background: '#fff', borderRadius: 14, border: '1px solid rgba(0,0,0,0.06)', padding: 20, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontFamily: 'Fraunces, serif', fontSize: 16, fontWeight: 700, color: D }}>Require PM Approval</div>
            <div style={{ fontSize: 13, color: '#9B9490', marginTop: 2 }}>Issues must be reviewed by a PM before auto-dispatching.</div>
          </div>
          <button onClick={() => setDraft(d => ({ ...d, requirePmApproval: !d.requirePmApproval }))}
            style={{ width: 48, height: 26, borderRadius: 13, border: 'none', cursor: 'pointer', position: 'relative', background: draft.requirePmApproval ? G : '#D0CBC6', transition: 'background 0.2s' }}>
            <div style={{ width: 20, height: 20, borderRadius: '50%', background: '#fff', position: 'absolute', top: 3, left: draft.requirePmApproval ? 25 : 3, transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
          </button>
        </div>
      </div>

      {/* Save */}
      <button onClick={handleSave} disabled={saving}
        style={{ padding: '12px 32px', borderRadius: 10, border: 'none', background: O, color: '#fff', fontSize: 15, fontWeight: 600, cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.7 : 1 }}>
        {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Settings'}
      </button>
    </div>
  );
}

/* ── Auto-Dispatch Rules sub-tab ── */

function GuestAutoDispatchSubTab({ workspaceId }: { workspaceId: string }) {
  const [rules, setRules] = useState<AutoDispatchRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formCat, setFormCat] = useState('');
  const [formSeverity, setFormSeverity] = useState('medium');
  const [formVendor, setFormVendor] = useState('');
  const [formEnabled, setFormEnabled] = useState(true);
  const [saving, setSaving] = useState(false);
  const [vendors, setVendors] = useState<PreferredVendor[]>([]);

  useEffect(() => {
    businessService.listAutoDispatchRules(workspaceId).then(res => {
      if (res.data) setRules(res.data.rules);
      setLoading(false);
    }).catch(() => setLoading(false));
    businessService.listVendors(workspaceId).then(res => {
      if (res.data) setVendors(res.data.filter(v => v.active));
    }).catch(() => {});
  }, [workspaceId]);

  function resetForm() {
    setFormCat(''); setFormSeverity('medium'); setFormVendor(''); setFormEnabled(true);
    setShowAdd(false); setEditingId(null);
  }

  function startEdit(rule: AutoDispatchRule) {
    setEditingId(rule.id);
    setFormCat(rule.categoryId);
    setFormSeverity(rule.minSeverity);
    setFormVendor(rule.preferredVendorId || '');
    setFormEnabled(rule.isEnabled);
    setShowAdd(true);
  }

  async function handleSave() {
    if (!formCat) return;
    setSaving(true);
    try {
      if (editingId) {
        const res = await businessService.updateAutoDispatchRule(workspaceId, editingId, {
          category_id: formCat, min_severity: formSeverity,
          preferred_vendor_id: formVendor || undefined,
          is_enabled: formEnabled,
        });
        if (res.data) setRules(prev => prev.map(r => r.id === editingId ? res.data! : r));
      } else {
        const res = await businessService.createAutoDispatchRule(workspaceId, {
          category_id: formCat, min_severity: formSeverity,
          preferred_vendor_id: formVendor || undefined,
        });
        if (res.data) setRules(prev => [...prev, res.data!]);
      }
      resetForm();
    } catch { alert('Failed to save rule'); }
    setSaving(false);
  }

  async function handleDelete(ruleId: string) {
    if (!confirm('Delete this auto-dispatch rule?')) return;
    try {
      await businessService.deleteAutoDispatchRule(workspaceId, ruleId);
      setRules(prev => prev.filter(r => r.id !== ruleId));
    } catch { alert('Failed to delete rule'); }
  }

  async function handleToggle(rule: AutoDispatchRule) {
    try {
      const res = await businessService.updateAutoDispatchRule(workspaceId, rule.id, { is_enabled: !rule.isEnabled });
      if (res.data) setRules(prev => prev.map(r => r.id === rule.id ? res.data! : r));
    } catch { alert('Failed to toggle rule'); }
  }

  const selectStyle: React.CSSProperties = {
    padding: '10px 14px', borderRadius: 8, border: '1px solid #E0DAD4', fontSize: 14, boxSizing: 'border-box' as const, width: '100%', cursor: 'pointer',
  };

  if (loading) return <div style={{ textAlign: 'center', padding: 40, color: '#9B9490' }}>Loading rules...</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 14, color: '#9B9490' }}>{rules.length} rule{rules.length !== 1 ? 's' : ''}</div>
        <button onClick={() => { resetForm(); setShowAdd(true); }}
          style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: O, color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
          + Add Rule
        </button>
      </div>

      {/* Add/Edit form */}
      {showAdd && (
        <div style={{ background: '#fff', borderRadius: 14, border: `2px solid ${O}`, padding: 20, marginBottom: 16 }}>
          <div style={{ fontFamily: 'Fraunces, serif', fontSize: 16, fontWeight: 700, color: D, marginBottom: 16 }}>
            {editingId ? 'Edit Rule' : 'New Auto-Dispatch Rule'}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#6B6560', marginBottom: 6 }}>Category *</label>
              <select value={formCat} onChange={e => setFormCat(e.target.value)} style={selectStyle}>
                <option value="">Select category</option>
                {VENDOR_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#6B6560', marginBottom: 6 }}>Min Severity</label>
              <select value={formSeverity} onChange={e => setFormSeverity(e.target.value)} style={selectStyle}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#6B6560', marginBottom: 6 }}>Preferred Vendor (optional)</label>
            <select value={formVendor} onChange={e => setFormVendor(e.target.value)} style={selectStyle}>
              <option value="">None - use default matching</option>
              {vendors.map(v => <option key={v.id} value={v.providerId}>{v.providerName}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <input type="checkbox" checked={formEnabled} onChange={e => setFormEnabled(e.target.checked)} />
            <span style={{ fontSize: 13, color: D }}>Enabled</span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleSave} disabled={saving || !formCat}
              style={{ padding: '10px 24px', borderRadius: 8, border: 'none', background: O, color: '#fff', fontSize: 14, fontWeight: 600, cursor: saving ? 'default' : 'pointer', opacity: saving || !formCat ? 0.6 : 1 }}>
              {saving ? 'Saving...' : editingId ? 'Update' : 'Create'}
            </button>
            <button onClick={resetForm} style={{ padding: '10px 20px', borderRadius: 8, border: '1px solid #E0DAD4', background: '#fff', cursor: 'pointer', fontSize: 14, color: D }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Rules list */}
      {rules.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 20px', background: '#FAFAF8', borderRadius: 12, border: '1px dashed #E0DAD4' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🤖</div>
          <div style={{ fontSize: 16, color: D, fontWeight: 600, marginBottom: 8 }}>No auto-dispatch rules</div>
          <div style={{ fontSize: 14, color: '#9B9490' }}>Create rules to automatically dispatch guest issues to vendors.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {rules.map(rule => {
            const sev = SEVERITY_COLORS[rule.minSeverity] || SEVERITY_COLORS.low;
            return (
              <div key={rule.id} style={{
                background: '#fff', borderRadius: 14, padding: '14px 16px', border: '1px solid rgba(0,0,0,0.06)',
                opacity: rule.isEnabled ? 1 : 0.6,
                display: 'flex', alignItems: 'center', gap: 12,
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontFamily: 'Fraunces, serif', fontWeight: 700, fontSize: 14, color: D }}>
                      {rule.categoryName || VENDOR_CATEGORIES.find(c => c.value === rule.categoryId)?.label || rule.categoryId}
                    </span>
                    <span style={{ background: sev.bg, color: sev.text, padding: '2px 7px', borderRadius: 100, fontSize: 9, fontWeight: 600 }}>
                      {rule.minSeverity}+
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: '#9B9490' }}>
                    {rule.preferredVendorName || (rule.preferredVendorId ? 'Preferred vendor' : 'Default matching')}
                  </div>
                </div>
                <button onClick={() => handleToggle(rule)}
                  style={{ width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer', position: 'relative', background: rule.isEnabled ? G : '#D0CBC6', transition: 'background 0.2s', flexShrink: 0 }}>
                  <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#fff', position: 'absolute', top: 3, left: rule.isEnabled ? 23 : 3, transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
                </button>
                <button onClick={() => startEdit(rule)} style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #E0DAD4', background: '#fff', fontSize: 12, color: D, cursor: 'pointer' }}>Edit</button>
                <button onClick={() => handleDelete(rule.id)} style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #FECACA', background: '#FFF5F5', fontSize: 12, color: '#DC2626', cursor: 'pointer' }}>Delete</button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── QR Codes sub-tab ── */

function GuestQRCodesSubTab({ workspaceId }: { workspaceId: string }) {
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    businessService.listProperties(workspaceId).then(res => {
      if (res.data) setProperties(res.data.sort((a, b) => a.name.localeCompare(b.name)));
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [workspaceId]);

  function copyLink(propertyId: string) {
    const url = `https://homiepro.ai/guest/${workspaceId}/${propertyId}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopiedId(propertyId);
      setTimeout(() => setCopiedId(null), 2000);
    }).catch(() => { alert('Failed to copy'); });
  }

  if (loading) return <div style={{ textAlign: 'center', padding: 40, color: '#9B9490' }}>Loading properties...</div>;

  if (properties.length === 0) return (
    <div style={{ textAlign: 'center', padding: '60px 20px', background: '#FAFAF8', borderRadius: 12, border: '1px dashed #E0DAD4' }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>🏠</div>
      <div style={{ fontSize: 16, color: D, fontWeight: 600, marginBottom: 8 }}>No properties</div>
      <div style={{ fontSize: 14, color: '#9B9490' }}>Add properties first to generate guest reporting links.</div>
    </div>
  );

  return (
    <div>
      <div style={{ fontSize: 14, color: '#9B9490', marginBottom: 16 }}>
        Share these links with guests so they can report maintenance issues. QR code images coming soon.
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
        {properties.map(p => {
          const url = `https://homiepro.ai/guest/${workspaceId}/${p.id}`;
          const isCopied = copiedId === p.id;
          return (
            <div key={p.id} style={{ background: '#fff', borderRadius: 14, border: '1px solid rgba(0,0,0,0.06)', padding: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.03)' }}>
              <div style={{ fontFamily: 'Fraunces, serif', fontWeight: 700, fontSize: 15, color: D, marginBottom: 4 }}>{p.name}</div>
              {p.address && <div style={{ fontSize: 12, color: '#9B9490', marginBottom: 10 }}>{p.address}</div>}
              <div style={{ fontSize: 11, color: '#9B9490', wordBreak: 'break-all', marginBottom: 10, background: W, padding: '6px 8px', borderRadius: 6 }}>{url}</div>
              <button onClick={() => copyLink(p.id)}
                style={{ padding: '8px 16px', borderRadius: 8, border: isCopied ? `1px solid ${G}` : '1px solid #E0DAD4', background: isCopied ? `${G}10` : '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: isCopied ? G : D, width: '100%', transition: 'all 0.2s' }}>
                {isCopied ? 'Copied!' : 'Copy Link'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Main Page ──────────────────────────────────────────────────────────── */

const TABS = ['dashboard', 'dispatches', 'bookings', 'guest-requests', 'schedules', 'reports', 'properties', 'vendors', 'team', 'settings', 'billing'] as const;
type Tab = typeof TABS[number];
const TAB_LABELS: Record<Tab, string> = { dashboard: 'Dashboard', dispatches: 'Dispatches', bookings: 'Bookings', 'guest-requests': 'Guest Requests', schedules: 'Auto-Dispatch', billing: 'Billing', reports: 'Reports', properties: 'Properties', vendors: 'Providers', team: 'Team', settings: 'Settings' };

function useThemeMode() {
  const [mode, setMode] = useState<'light' | 'dark' | 'auto'>(() => {
    return (localStorage.getItem('bp_theme') as 'light' | 'dark' | 'auto') || 'light';
  });

  const resolvedTheme = mode === 'auto'
    ? (new Date().getHours() >= 18 || new Date().getHours() < 7 ? 'dark' : 'light')
    : mode;

  function setTheme(m: 'light' | 'dark' | 'auto') {
    setMode(m);
    localStorage.setItem('bp_theme', m);
  }

  // Re-check auto mode every minute
  useEffect(() => {
    if (mode !== 'auto') return;
    const interval = setInterval(() => setMode('auto'), 60000);
    return () => clearInterval(interval);
  }, [mode]);

  return { mode, resolvedTheme, setTheme };
}

export default function BusinessPortal() {
  useDocumentTitle('Business Portal');
  const { homeowner } = useAuth();
  const navigate = useNavigate();
  const { mode: themeMode, resolvedTheme, setTheme } = useThemeMode();

  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [workspace, setWorkspace] = useState<WorkspaceDetail | null>(null);
  const [tab, setTab] = useState<Tab>('dashboard');
  const [focusJobId, setFocusJobId] = useState<string | null>(null);
  const [showReportsUpgrade, setShowReportsUpgrade] = useState(false);
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

  // Handle URL params for tab navigation and profile focus
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlTab = params.get('tab');
    if (urlTab && (TABS as readonly string[]).includes(urlTab)) {
      setTab(urlTab as Tab);
    }
    if (params.get('focus') === 'profile' && urlTab === 'settings') {
      setTimeout(() => {
        const el = document.getElementById('my-profile-section');
        if (el) el.scrollIntoView({ behavior: 'smooth' });
      }, 300);
    }
  }, []);

  if (!homeowner) return null;

  return (
    <div className="bp-portal" data-theme={resolvedTheme} style={{ minHeight: '100vh', background: 'var(--bp-bg)' }}>
      <style>{`
        .bp-portal {
          --bp-bg: ${W};
          --bp-card: #ffffff;
          --bp-input: #ffffff;
          --bp-text: ${D};
          --bp-muted: #6B6560;
          --bp-subtle: #9B9490;
          --bp-border: #E0DAD4;
          --bp-hover: #FAFAF8;
          --bp-header: #ffffff;
          --bp-warm: ${W};
          color: var(--bp-text);
          transition: background 0.3s, color 0.3s;
        }
        .bp-portal[data-theme="dark"] {
          --bp-bg: #1A1A1A;
          --bp-card: #242424;
          --bp-input: #2E2E2E;
          --bp-text: #E8E4E0;
          --bp-muted: #9B9490;
          --bp-subtle: #6B6560;
          --bp-border: #3A3A3A;
          --bp-hover: #2E2E2E;
          --bp-header: #1E1E1E;
          --bp-warm: #2E2E2E;
        }
        .bp-portal[data-theme="dark"] input,
        .bp-portal[data-theme="dark"] select,
        .bp-portal[data-theme="dark"] textarea {
          background: var(--bp-input) !important;
          color: var(--bp-text) !important;
          border-color: var(--bp-border) !important;
        }
        .bp-portal[data-theme="dark"] button {
          transition: background 0.15s, color 0.15s;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        @media (max-width: 640px) {
          .bp-prop-card { flex-direction: column !important; }
          .bp-prop-img { width: 100% !important; height: 140px !important; min-height: auto !important; }
          .bp-prop-body { padding: 14px !important; }
          .bp-prop-name { font-size: 14px !important; }
          .bp-prop-addr { font-size: 12px !important; margin-top: 2px !important; }
          .bp-prop-actions { gap: 4px !important; }
          .bp-prop-badge { font-size: 10px !important; padding: 2px 8px !important; }
          .bp-prop-type { display: none !important; }
          .bp-prop-details { font-size: 12px !important; gap: 6px !important; margin-top: 6px !important; }
          .bp-prop-notes { font-size: 12px !important; margin-top: 6px !important; }
        }
      `}</style>
      {/* Header */}
      <header style={{ background: 'var(--bp-header)', borderBottom: '1px solid var(--bp-border)', padding: '0 24px', height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span onClick={() => navigate('/')} style={{ cursor: 'pointer' }}>
            <HomieBizLogo />
          </span>
          {workspace?.logoUrl && (
            <>
              <div style={{ width: 1, height: 28, background: 'var(--bp-border)' }} />
              <img src={workspace.logoUrl} alt={workspace.name} style={{ height: 44, maxWidth: 160, objectFit: 'contain' }} />
            </>
          )}
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
            <h2 style={{ fontFamily: 'Fraunces, serif', fontSize: 28, color: D, marginBottom: 12 }}>Welcome to <HomieBizLogo size="large" /></h2>
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                <select value={selectedId || ''} onChange={e => { setSelectedId(e.target.value); setTab('dashboard'); }}
                  style={{ fontFamily: 'Fraunces, serif', fontSize: 18, fontWeight: 600, color: D, border: 'none', background: 'transparent', cursor: 'pointer', padding: '4px 8px', maxWidth: '60vw' }}>
                  {workspaces.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
                {workspace && (
                  <span style={{ fontSize: 12, padding: '4px 10px', borderRadius: 20, background: `${G}15`, color: G, fontWeight: 600, flexShrink: 0 }}>
                    {workspace.plan}
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => navigate(`/business/chat?workspace=${selectedId}`)}
                  style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: O, color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                  New Dispatch
                </button>
                <button onClick={() => setShowCreate(true)}
                  style={{ padding: '8px 20px', borderRadius: 8, border: '1px solid #E0DAD4', background: '#fff', cursor: 'pointer', fontSize: 14, color: D, fontWeight: 500 }}>
                  + New Workspace
                </button>
              </div>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--bp-border)', marginBottom: 24, overflowX: 'auto', overflowY: 'hidden', scrollbarWidth: 'none', touchAction: 'pan-x' }}>
              {TABS.filter(t => {
                if (t === 'settings' && workspace?.user_role !== 'admin') return false;
                if (t === 'schedules') return false; // accessed via Auto-Dispatch button on Dispatches tab
                return true;
              }).map(t => {
                const isLocked = (t === 'reports' || t === 'schedules' || t === 'guest-requests') && !['professional', 'business', 'enterprise'].includes(workspace?.plan ?? '');
                return (
                  <button key={t} onClick={() => {
                    if (isLocked) { setShowReportsUpgrade(true); return; }
                    setTab(t);
                  }}
                    style={{
                      padding: '12px 20px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 600,
                      color: isLocked ? '#D0CBC6' : (tab === t ? O : '#9B9490'),
                      borderBottom: tab === t ? `2px solid ${O}` : '2px solid transparent',
                      marginBottom: -1, whiteSpace: 'nowrap', flexShrink: 0,
                    }}>
                    {TAB_LABELS[t]}{isLocked ? ' 🔒' : ''}
                  </button>
                );
              })}
            </div>

            {/* Tab content */}
            {workspace && tab === 'dashboard' && <DashboardTab workspace={workspace} onNavigate={(t, jobId) => { setFocusJobId(jobId ?? null); setTab(t); }} />}
            {workspace && tab === 'billing' && workspace.user_role === 'admin' && (
              <BillingTab workspace={workspace} onUpdated={w => setWorkspace(w)} />
            )}
            {workspace && tab === 'dispatches' && (
              <DispatchesTab workspaceId={workspace.id} onTabChange={setTab} plan={workspace.plan} focusJobId={focusJobId} onFocusHandled={() => setFocusJobId(null)} />
            )}
            {workspace && tab === 'bookings' && (
              <BusinessBookingsTab workspaceId={workspace.id} focusJobId={focusJobId} onFocusHandled={() => setFocusJobId(null)} />
            )}
            {workspace && tab === 'guest-requests' && (
              <GuestRequestsTab workspaceId={workspace.id} plan={workspace.plan} onViewDispatch={(jobId) => { setFocusJobId(jobId); setTab('dispatches'); }} />
            )}
            {workspace && tab === 'schedules' && (
              <SchedulesTab workspaceId={workspace.id} plan={workspace.plan} />
            )}
            {workspace && tab === 'reports' && (
              <ReportsTab workspaceId={workspace.id} plan={workspace.plan} />
            )}
            {workspace && tab === 'properties' && (
              <PropertiesTab workspaceId={workspace.id} role={workspace.user_role} plan={workspace.plan} />
            )}
            {workspace && tab === 'vendors' && (
              <VendorsTab workspaceId={workspace.id} role={workspace.user_role} plan={workspace.plan} />
            )}
            {workspace && tab === 'team' && (
              <TeamTab workspaceId={workspace.id} role={workspace.user_role} ownerId={workspace.ownerId || ''} plan={workspace.plan} />
            )}
            {workspace && tab === 'settings' && workspace.user_role === 'admin' && (
              <SettingsTab workspace={workspace} onUpdated={w => { setWorkspace(w); }} themeMode={themeMode} onThemeChange={setTheme} />
            )}
          </>
        )}
      </div>

      {showReportsUpgrade && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}
          onClick={() => setShowReportsUpgrade(false)}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 32, width: '100%', maxWidth: 420, boxShadow: '0 16px 48px rgba(0,0,0,0.15)', textAlign: 'center' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>📊</div>
            <h3 style={{ fontFamily: 'Fraunces, serif', fontSize: 22, color: D, margin: '0 0 8px' }}>Upgrade to unlock Reports</h3>
            <p style={{ fontSize: 14, color: '#6B6560', lineHeight: 1.6, marginBottom: 24 }}>
              Full cost reporting, provider scorecards, and advanced analytics are available on the <strong style={{ color: O }}>Professional</strong> plan and above.
            </p>
            <div style={{ background: W, borderRadius: 12, padding: 16, marginBottom: 24, textAlign: 'left' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: D, marginBottom: 10 }}>Professional plan includes:</div>
              {['Full cost reporting by property & category', 'Provider scorecards with response rates', 'Booking & dispatch analytics', 'Team activity log'].map((f, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, fontSize: 13, color: '#6B6560' }}>
                  <span style={{ color: G, fontSize: 12 }}>✓</span> {f}
                </div>
              ))}
            </div>
            <button onClick={() => setShowReportsUpgrade(false)}
              style={{ width: '100%', padding: '14px 0', borderRadius: 10, border: 'none', background: O, color: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>
              Got it
            </button>
          </div>
        </div>
      )}

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
