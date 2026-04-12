import { useState, useEffect } from 'react';
import { usePricing } from '@/hooks/usePricing';
import { businessService, type Property, type PropertyDetails, type BedConfig, type Reservation, type PmsConnection } from '@/services/api';
import { O, G, D, W, PROPERTY_TYPES, BED_TYPES, MiniCalendar, getPlanPropertyLimit, getPlanTiersOrdered } from './constants';

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

export function EditPropertyModal({ workspaceId, property, onClose, onUpdated, onDeleted }: {
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

/* ── PMS Connection Card ──────────────────────────────────────────────── */

const PMS_OPTIONS: { id: string; label: string; fields: { key: string; label: string; placeholder: string; type?: string }[] }[] = [
  {
    id: 'track', label: 'Track PMS',
    fields: [
      { key: 'domain', label: 'Track Domain', placeholder: 'yourcompany.trackhs.com' },
      { key: 'apiKey', label: 'API Key', placeholder: 'Your Track API key' },
      { key: 'apiSecret', label: 'API Secret', placeholder: 'Your Track API secret', type: 'password' },
    ],
  },
  {
    id: 'guesty', label: 'Guesty',
    fields: [
      { key: 'clientId', label: 'Client ID', placeholder: 'Your Guesty API client ID' },
      { key: 'clientSecret', label: 'Client Secret', placeholder: 'Your Guesty API client secret', type: 'password' },
    ],
  },
];

function PmsConnectionCard({ workspaceId, plan, onPropertiesImported }: {
  workspaceId: string; plan: string; onPropertiesImported: () => void;
}) {
  const [connections, setConnections] = useState<PmsConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  const isPro = ['professional', 'business', 'enterprise'].includes(plan);

  function loadConnections() {
    businessService.getPmsConnections(workspaceId).then(res => {
      if (res.data) setConnections(res.data);
    }).catch(() => {}).finally(() => setLoading(false));
  }

  useEffect(() => { loadConnections(); }, [workspaceId]);

  async function handleSyncProperties(conn: PmsConnection) {
    setSyncing(`props-${conn.id}`); setSyncResult(null);
    try {
      const res = await businessService.syncPmsProperties(workspaceId, conn.id, true);
      if (res.data) {
        setSyncResult(`${res.data.imported} imported, ${res.data.updated} updated`);
        onPropertiesImported();
      } else if (res.error) setSyncResult(res.error);
    } catch (err) { setSyncResult((err as Error).message); }
    setSyncing(null); loadConnections();
  }

  async function handleSyncReservations(conn: PmsConnection) {
    setSyncing(`res-${conn.id}`); setSyncResult(null);
    try {
      const res = await businessService.syncPmsReservations(workspaceId, conn.id);
      if (res.data) setSyncResult(`${res.data.imported} imported, ${res.data.updated} updated`);
      else if (res.error) setSyncResult(res.error);
    } catch (err) { setSyncResult((err as Error).message); }
    setSyncing(null); loadConnections();
  }

  async function handleDisconnect(conn: PmsConnection) {
    if (!window.confirm(`Disconnect ${PMS_OPTIONS.find(p => p.id === conn.pmsType)?.label || conn.pmsType}? Properties and reservations already imported will not be removed.`)) return;
    try {
      await businessService.disconnectPms(workspaceId, conn.id);
      loadConnections();
    } catch { alert('Failed to disconnect'); }
  }

  if (loading) return null;

  if (connections.length === 0) {
    return (
      <div style={{ marginBottom: 20 }}>
        <div style={{
          background: '#fff', borderRadius: 14, border: '1px dashed #E0DAD4', padding: 24,
          display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
        }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: `${O}10`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={O} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontFamily: "'Fraunces', serif", fontSize: 16, fontWeight: 700, color: D, marginBottom: 4 }}>Connect your PMS</div>
            <div style={{ fontSize: 13, color: '#6B6560', lineHeight: 1.5 }}>
              Import properties and sync reservations automatically from Track, Guesty, and more.
            </div>
          </div>
          <button onClick={() => isPro ? setShowModal(true) : alert('Upgrade to Professional to connect a PMS')}
            style={{
              padding: '10px 22px', borderRadius: 100, border: 'none',
              background: isPro ? O : '#E0DAD4', color: isPro ? '#fff' : '#9B9490',
              fontSize: 14, fontWeight: 600, cursor: isPro ? 'pointer' : 'default',
              fontFamily: "'DM Sans', sans-serif",
            }}>{isPro ? 'Connect PMS' : 'Connect PMS (Pro+)'}</button>
        </div>
        {showModal && <PmsConnectModal workspaceId={workspaceId} onClose={() => setShowModal(false)} onConnected={() => { setShowModal(false); loadConnections(); onPropertiesImported(); }} />}
      </div>
    );
  }

  return (
    <div style={{ marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
      {connections.map(conn => {
        const pms = PMS_OPTIONS.find(p => p.id === conn.pmsType);
        const isSyncingProps = syncing === `props-${conn.id}`;
        const isSyncingRes = syncing === `res-${conn.id}`;
        return (
          <div key={conn.id} style={{
            background: '#fff', borderRadius: 14, border: '1px solid #E0DAD4', padding: 18,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 10, height: 10, borderRadius: '50%',
                  background: conn.status === 'connected' ? G : conn.status === 'error' ? '#DC2626' : '#9B9490',
                }} />
                <span style={{ fontFamily: "'Fraunces', serif", fontSize: 15, fontWeight: 700, color: D }}>
                  {pms?.label || conn.pmsType}
                </span>
                {conn.status === 'error' && (
                  <span style={{ fontSize: 11, color: '#DC2626', fontWeight: 600 }}>Error</span>
                )}
              </div>
              <button onClick={() => handleDisconnect(conn)}
                style={{ fontSize: 12, color: '#9B9490', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500 }}>Disconnect</button>
            </div>
            <div style={{ display: 'flex', gap: 16, fontSize: 12, color: '#6B6560', marginBottom: 12, flexWrap: 'wrap' }}>
              <span><strong style={{ color: D }}>{conn.propertiesSynced}</strong> properties</span>
              <span>·</span>
              <span><strong style={{ color: D }}>{conn.reservationsSynced}</strong> reservations</span>
              {conn.lastPropertySyncAt && (
                <>
                  <span>·</span>
                  <span>Last sync: {new Date(conn.lastPropertySyncAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
                </>
              )}
            </div>
            {conn.lastError && (
              <div style={{ fontSize: 12, color: '#DC2626', marginBottom: 10, padding: '6px 10px', background: '#FEF2F2', borderRadius: 8 }}>
                {conn.lastError}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button onClick={() => handleSyncProperties(conn)} disabled={!!syncing}
                style={{ padding: '7px 16px', borderRadius: 8, border: `1px solid ${O}40`, background: `${O}08`, color: O, fontSize: 12, fontWeight: 600, cursor: syncing ? 'default' : 'pointer', opacity: syncing ? 0.6 : 1 }}>
                {isSyncingProps ? 'Syncing...' : 'Sync Properties'}
              </button>
              <button onClick={() => handleSyncReservations(conn)} disabled={!!syncing}
                style={{ padding: '7px 16px', borderRadius: 8, border: `1px solid ${G}40`, background: `${G}08`, color: G, fontSize: 12, fontWeight: 600, cursor: syncing ? 'default' : 'pointer', opacity: syncing ? 0.6 : 1 }}>
                {isSyncingRes ? 'Syncing...' : 'Sync Reservations'}
              </button>
              <button onClick={() => setShowModal(true)}
                style={{ padding: '7px 16px', borderRadius: 8, border: '1px solid #E0DAD4', background: '#fff', color: '#6B6560', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                + Add PMS
              </button>
            </div>
            {syncResult && (
              <div style={{ marginTop: 10, fontSize: 12, color: G, fontWeight: 600 }}>{syncResult}</div>
            )}
          </div>
        );
      })}
      {showModal && <PmsConnectModal workspaceId={workspaceId} onClose={() => setShowModal(false)} onConnected={() => { setShowModal(false); loadConnections(); onPropertiesImported(); }} />}
    </div>
  );
}

function PmsConnectModal({ workspaceId, onClose, onConnected }: { workspaceId: string; onClose: () => void; onConnected: () => void }) {
  const [selectedPms, setSelectedPms] = useState<string>('');
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [connecting, setConnecting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');
  const [connectionId, setConnectionId] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<{ imported: number; updated: number; total: number } | null>(null);

  const pmsConfig = PMS_OPTIONS.find(p => p.id === selectedPms);

  async function handleConnect() {
    if (!selectedPms || !pmsConfig) return;
    const missing = pmsConfig.fields.filter(f => !credentials[f.key]?.trim());
    if (missing.length > 0) { setError(`${missing[0].label} is required`); return; }

    setConnecting(true); setError('');
    try {
      const res = await businessService.connectPms(workspaceId, selectedPms, credentials);
      if (res.error) { setError(res.error); setConnecting(false); return; }
      if (res.data) {
        setConnectionId(res.data.connectionId);
        // Auto-import properties
        setImporting(true);
        try {
          const importRes = await businessService.syncPmsProperties(workspaceId, res.data.connectionId, false);
          if (importRes.data) setImportResult(importRes.data);
        } catch (err) { setError((err as Error).message); }
        setImporting(false);
      }
    } catch (err) { setError((err as Error).message); }
    setConnecting(false);
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}
      onClick={() => { if (!connecting && !importing) onClose(); }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: 24, width: '100%', maxWidth: 440, boxShadow: '0 16px 48px rgba(0,0,0,0.15)' }}
        onClick={e => e.stopPropagation()}>

        {importResult ? (
          <div>
            <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 12, padding: 20, textAlign: 'center', marginBottom: 16 }}>
              <div style={{ fontSize: 36, marginBottom: 8 }}>✅</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: D, marginBottom: 4 }}>
                {importResult.imported > 0 && `${importResult.imported} imported`}
                {importResult.imported > 0 && importResult.updated > 0 && ', '}
                {importResult.updated > 0 && `${importResult.updated} updated`}
                {importResult.imported === 0 && importResult.updated === 0 && 'No new properties found'}
              </div>
              <div style={{ fontSize: 13, color: '#9B9490' }}>{importResult.total} total in {pmsConfig?.label}</div>
            </div>
            <button onClick={onConnected} style={{ width: '100%', padding: '12px 0', borderRadius: 10, border: 'none', background: O, color: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>
              Done
            </button>
          </div>
        ) : (
          <div>
            <h3 style={{ fontFamily: "'Fraunces', serif", fontSize: 20, color: D, margin: '0 0 4px' }}>Connect your PMS</h3>
            <p style={{ fontSize: 14, color: '#9B9490', marginBottom: 20 }}>Import your properties and sync reservations automatically.</p>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#6B6560', marginBottom: 4 }}>Property Management System</label>
              <select value={selectedPms} onChange={e => { setSelectedPms(e.target.value); setCredentials({}); setError(''); }}
                style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #E0DAD4', fontSize: 14, outline: 'none', boxSizing: 'border-box', cursor: 'pointer', color: D }}>
                <option value="">Select your PMS...</option>
                {PMS_OPTIONS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </div>

            {pmsConfig && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
                {pmsConfig.fields.map(f => (
                  <div key={f.key}>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#6B6560', marginBottom: 4 }}>{f.label}</label>
                    <input
                      type={f.type || 'text'}
                      value={credentials[f.key] || ''}
                      onChange={e => setCredentials(prev => ({ ...prev, [f.key]: e.target.value }))}
                      placeholder={f.placeholder}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #E0DAD4', fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
                    />
                  </div>
                ))}
              </div>
            )}

            {error && (
              <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#B91C1C', marginBottom: 12 }}>
                {error}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={onClose} disabled={connecting || importing}
                style={{ flex: 1, padding: '12px 0', borderRadius: 10, border: '1px solid #E0DAD4', background: '#fff', color: D, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                Cancel
              </button>
              <button
                onClick={handleConnect}
                disabled={connecting || importing || !selectedPms}
                style={{
                  flex: 1, padding: '12px 0', borderRadius: 10, border: 'none', fontSize: 14, fontWeight: 600, cursor: 'pointer',
                  background: selectedPms ? O : '#E0DAD4', color: selectedPms ? '#fff' : '#9B9490',
                  opacity: connecting || importing ? 0.7 : 1,
                }}>
                {connecting ? 'Connecting...' : importing ? 'Importing...' : 'Connect & Import'}
              </button>
            </div>

            {selectedPms === 'guesty' && (
              <div style={{ marginTop: 16, padding: '12px 14px', background: '#F9F5F2', borderRadius: 8, fontSize: 12, color: '#9B9490', lineHeight: 1.5 }}>
                <strong style={{ color: '#6B6560' }}>Where to find your API credentials:</strong><br />
                Go to your Guesty Dashboard → Marketplace → API → Create or manage API keys. Copy the Client ID and Client Secret.
              </div>
            )}
            {selectedPms === 'track' && (
              <div style={{ marginTop: 16, padding: '12px 14px', background: '#F9F5F2', borderRadius: 8, fontSize: 12, color: '#9B9490', lineHeight: 1.5 }}>
                <strong style={{ color: '#6B6560' }}>Where to find your API credentials:</strong><br />
                Contact your Track PMS administrator or Track support to obtain your API key and secret. Your domain is the URL you use to log into Track (e.g. yourcompany.trackhs.com).
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function PropertiesTab({ workspaceId, role, plan, onSelectProperty, onEditProperty, editPropertyId, onEditHandled }: { workspaceId: string; role: string; plan: string; onSelectProperty?: (p: Property) => void; onEditProperty?: (p: Property) => void; editPropertyId?: string | null; onEditHandled?: () => void }) {
  const { pricing } = usePricing();
  const PLAN_TIERS_ORDERED = getPlanTiersOrdered(pricing);
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editingProperty, setEditingProperty] = useState<Property | null>(null);
  const [showTrackImport, setShowTrackImport] = useState(false); // legacy — kept for backward compat
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
  const [csvImporting, setCsvImporting] = useState(false);
  const [csvResult, setCsvResult] = useState<{ imported: number; updated: number; errors: string[] } | null>(null);

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

  useEffect(() => {
    if (editPropertyId && properties.length > 0) {
      const p = properties.find(pr => pr.id === editPropertyId);
      if (p) {
        if (onEditProperty) onEditProperty(p);
        else if (onSelectProperty) onSelectProperty(p);
        else setEditingProperty(p);
      }
      onEditHandled?.();
    }
  }, [editPropertyId, properties, onEditHandled, onEditProperty, onSelectProperty]);

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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
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
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button onClick={async () => {
                try {
                  const csv = await businessService.exportPropertiesCsv(workspaceId);
                  const blob = new Blob([csv], { type: 'text/csv' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = 'properties.csv';
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  URL.revokeObjectURL(url);
                } catch { /* ignore download errors */ }
              }}
                style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #E0DAD4', background: '#fff', color: D, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                Download CSV
              </button>
              <button onClick={() => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = '.csv,text/csv';
                input.onchange = async () => {
                  const file = input.files?.[0];
                  if (!file) return;
                  setCsvImporting(true);
                  setCsvResult(null);
                  try {
                    const text = await file.text();
                    const res = await businessService.importPropertiesCsv(workspaceId, text);
                    if (res.data) {
                      setCsvResult(res.data);
                      // Refresh properties list
                      const refreshed = await businessService.listProperties(workspaceId);
                      if (refreshed.data) setProperties(refreshed.data.sort((a, b) => a.name.localeCompare(b.name)));
                    } else if (res.error) {
                      setCsvResult({ imported: 0, updated: 0, errors: [res.error] });
                    }
                  } catch (err: unknown) {
                    setCsvResult({ imported: 0, updated: 0, errors: [err instanceof Error ? err.message : 'Import failed'] });
                  } finally {
                    setCsvImporting(false);
                  }
                };
                input.click();
              }}
                disabled={csvImporting}
                style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #E0DAD4', background: '#fff', color: D, cursor: csvImporting ? 'default' : 'pointer', fontSize: 13, fontWeight: 600, opacity: csvImporting ? 0.7 : 1 }}>
                {csvImporting ? 'Importing...' : 'Upload CSV'}
              </button>
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

      {/* PMS Connection Card */}
      {canEdit && (
        <PmsConnectionCard
          workspaceId={workspaceId}
          plan={plan}
          onPropertiesImported={() => {
            businessService.listProperties(workspaceId).then(res => {
              if (res.data) setProperties(res.data.sort((a, b) => a.name.localeCompare(b.name)));
            }).catch(() => {});
          }}
        />
      )}

      {csvResult && (
        <div style={{ marginBottom: 16, padding: 16, borderRadius: 10, background: csvResult.errors.length > 0 && csvResult.imported === 0 && csvResult.updated === 0 ? '#FEF2F2' : '#F0FDF4', border: `1px solid ${csvResult.errors.length > 0 && csvResult.imported === 0 && csvResult.updated === 0 ? '#FECACA' : '#BBF7D0'}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 600, color: D, marginBottom: 4 }}>
                CSV Import Complete
                {csvResult.imported > 0 && ` — ${csvResult.imported} created`}
                {csvResult.updated > 0 && `, ${csvResult.updated} updated`}
              </div>
              {csvResult.errors.length > 0 && (
                <div style={{ fontSize: 13, color: '#DC2626', marginTop: 4 }}>
                  {csvResult.errors.map((e, i) => <div key={i}>{e}</div>)}
                </div>
              )}
            </div>
            <button onClick={() => setCsvResult(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#9B9490', padding: 0, lineHeight: 1 }}>x</button>
          </div>
        </div>
      )}

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
            }} onClick={() => onSelectProperty ? onSelectProperty(p) : togglePropertyExpand(p.id)}>
              <div className="bp-prop-inner" style={{ display: 'flex' }}>
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
                    <button onClick={(e) => {
                      e.stopPropagation();
                      if (onEditProperty) onEditProperty(p);
                      else if (onSelectProperty) onSelectProperty(p);
                      else setEditingProperty(p);
                    }} style={{
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
