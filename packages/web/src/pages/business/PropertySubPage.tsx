import { useState, useEffect, useRef, useCallback } from 'react';
import { businessService, type Property, type PropertyDetails, type BedConfig, type RentalType } from '@/services/api';
import { O, G, D, PROPERTY_TYPES, BED_TYPES } from './constants';
import { PropertyScanCard, ScanCaptureModal, PropertyInventoryView } from './PropertyInventory';
import { getStoredNav, setStoredNav } from './nav-storage';
import { rentalTermsFor } from '@/hooks/useRentalTerms';

/* ── Shared styles ────────────────────────────────────────────────────────── */

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '9px 12px',
  border: '1px solid var(--bp-border)',
  borderRadius: 8,
  fontSize: 14,
  background: 'var(--bp-card)',
  color: 'var(--bp-text)',
  outline: 'none',
  fontFamily: "'DM Sans', sans-serif",
  boxSizing: 'border-box',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--bp-subtle)',
  marginBottom: 5,
};

/* ── Hook: useAutoSave ────────────────────────────────────────────────────── */

/**
 * Returns a debounced save function and a status indicator.
 * Calls the saver after `delay` ms of inactivity. Cancels prior timers.
 */
function useAutoSave<T>(
  saver: (value: T) => Promise<void>,
  delay = 600,
): {
  scheduleSave: (value: T) => void;
  status: 'idle' | 'saving' | 'saved' | 'error';
  errorMsg: string | null;
} {
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);
  const pendingValue = useRef<T | null>(null);

  const scheduleSave = useCallback((value: T) => {
    pendingValue.current = value;
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(async () => {
      const v = pendingValue.current;
      if (v === null) return;
      setStatus('saving');
      setErrorMsg(null);
      try {
        await saver(v);
        setStatus('saved');
        window.setTimeout(() => setStatus(s => (s === 'saved' ? 'idle' : s)), 1500);
      } catch (err) {
        setStatus('error');
        setErrorMsg(err instanceof Error ? err.message : 'Save failed');
      }
    }, delay);
  }, [saver, delay]);

  useEffect(() => () => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
  }, []);

  return { scheduleSave, status, errorMsg };
}

/* ── SaveStatus indicator ─────────────────────────────────────────────────── */

function SaveStatus({ status, errorMsg }: { status: 'idle' | 'saving' | 'saved' | 'error'; errorMsg: string | null }) {
  if (status === 'idle') return null;
  const text = status === 'saving' ? 'Saving…' : status === 'saved' ? 'Saved ✓' : (errorMsg || 'Save failed');
  const color = status === 'error' ? '#DC2626' : status === 'saved' ? G : 'var(--bp-subtle)';
  return (
    <span style={{
      fontSize: 11, color, fontWeight: 600,
      transition: 'opacity 0.2s', display: 'inline-block',
    }}>{text}</span>
  );
}

/* ── Section header (used in both Profile and Equipment) ─────────────────── */

function SectionHeader({ title, isOpen, onToggle, badge }: { title: string; isOpen: boolean; onToggle: () => void; badge?: string }) {
  return (
    <button onClick={onToggle} style={{
      display: 'flex', alignItems: 'center', gap: 8, width: '100%',
      padding: '12px 14px', background: 'var(--bp-hover)', border: 'none',
      cursor: 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--bp-text)',
      textAlign: 'left', fontFamily: "'DM Sans', sans-serif",
    }}>
      <span style={{ fontSize: 11 }}>{isOpen ? '\u25BC' : '\u25B6'}</span>
      <span style={{ flex: 1 }}>{title}</span>
      {badge && (
        <span style={{
          fontSize: 10, fontWeight: 700, background: `${O}15`, color: O,
          padding: '2px 8px', borderRadius: 100,
        }}>{badge}</span>
      )}
    </button>
  );
}

/* ── Section — collapsible accordion used by Profile + Equipment panels
 *  Declared at MODULE level so every render of the parent panel sees
 *  the same component TYPE. Declaring this inline inside a parent
 *  function gave React a new function reference per render, which it
 *  treated as a different component and unmounted the entire subtree
 *  on every keystroke — inputs could only accept one character before
 *  losing focus. ─────────────────────────────────────────────────── */
function Section({
  id, title, children, openSections, onToggle, alwaysOpen,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
  openSections: Set<string>;
  onToggle: (id: string) => void;
  /** When true, renders without the accordion chrome (desktop profile
   *  panel wants every section visible at once). */
  alwaysOpen?: boolean;
}) {
  if (alwaysOpen) {
    return (
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontFamily: 'Fraunces, serif', fontSize: 15, fontWeight: 600, color: 'var(--bp-text)', marginBottom: 12 }}>{title}</div>
        {children}
      </div>
    );
  }
  const isOpen = openSections.has(id);
  return (
    <div style={{ marginBottom: 8, border: '1px solid var(--bp-border)', borderRadius: 10, overflow: 'hidden' }}>
      <SectionHeader title={title} isOpen={isOpen} onToggle={() => onToggle(id)} />
      {isOpen && <div style={{ padding: '14px', background: 'var(--bp-card)' }}>{children}</div>}
    </div>
  );
}

/* ── ScannedBadge ─────────────────────────────────────────────────────────── */

function ScannedBadge({ onClick }: { onClick?: () => void }) {
  return (
    <button onClick={onClick} title="Filled by AI Property Scan — click to view in inventory"
      style={{
        fontSize: 9, fontWeight: 700, background: `${O}15`, color: O,
        padding: '1px 6px', borderRadius: 100, border: 'none',
        cursor: onClick ? 'pointer' : 'default', marginLeft: 6,
        fontFamily: "'DM Sans', sans-serif",
      }}>
      SCANNED
    </button>
  );
}

/* ── Field component (handles auto-save on blur) ─────────────────────────── */

function TextField({
  label, value, onChange, onBlur, placeholder, type = 'text', maxLength, scanned, onBadgeClick,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onBlur: () => void;
  placeholder?: string;
  type?: string;
  maxLength?: number;
  scanned?: boolean;
  onBadgeClick?: () => void;
}) {
  return (
    <div>
      <label style={labelStyle}>
        {label}
        {scanned && <ScannedBadge onClick={onBadgeClick} />}
      </label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        onBlur={onBlur}
        placeholder={placeholder}
        maxLength={maxLength}
        style={inputStyle}
      />
    </div>
  );
}

/* ── PropertyProfilePanel ─────────────────────────────────────────────────── */

export function PropertyProfilePanel({ workspaceId, workspaceRentalType, property, onPropertyUpdated, onDeleted, isMobile }: {
  workspaceId: string;
  /** Workspace-level rental_type default — renders inside the "Use
   *  workspace default" option label so the PM can see exactly which
   *  mode they'd inherit from. */
  workspaceRentalType: RentalType;
  property: Property;
  onPropertyUpdated: (p: Property) => void;
  onDeleted: () => void;
  isMobile: boolean;
}) {
  // Local form state
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
  const [openSections, setOpenSections] = useState<Set<string>>(() => new Set(['basic']));
  /** 'inherit' (null in the DB) | 'short_term' | 'long_term'. 'inherit'
   *  is the frontend representation; the saver translates it to null. */
  const [rentalTypeOverride, setRentalTypeOverride] = useState<'inherit' | RentalType>(
    property.rentalType ?? 'inherit',
  );

  // Delete state
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  // Save handler
  const saver = useCallback(async () => {
    const res = await businessService.updateProperty(workspaceId, property.id, {
      name: name.trim(),
      address: address || null,
      city: city || null,
      state: state || null,
      zip_code: zip || null,
      property_type: propType,
      unit_count: unitCount,
      bedrooms: bedrooms || null,
      bathrooms: bathrooms || null,
      sqft: sqft || null,
      beds: beds.length > 0 ? beds : null,
      details: Object.keys(details).length > 0 ? details : null,
      notes: notes || null,
      // 'inherit' serializes as null to clear the per-property override.
      // Backend PATCH handler treats null as a valid value (vs undefined
      // = no change), so we must send the key even when clearing.
      rental_type: rentalTypeOverride === 'inherit' ? null : rentalTypeOverride,
    });
    if (res.error) throw new Error(res.error);
    if (res.data) onPropertyUpdated(res.data);
  }, [workspaceId, property.id, name, address, city, state, zip, propType, unitCount, bedrooms, bathrooms, sqft, beds, details, notes, rentalTypeOverride, onPropertyUpdated]);

  const { scheduleSave, status, errorMsg } = useAutoSave(saver);

  // Auto-save on any field change (after blur)
  function commit() {
    scheduleSave(undefined as never);
  }

  function toggleSection(key: string) {
    setOpenSections(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  function updateAccess(field: string, value: string) {
    setDetails(prev => ({
      ...prev,
      access: { ...(prev.access ?? {}), [field]: value },
    }));
  }

  function addBed() { setBeds(prev => [...prev, { type: 'queen', count: 1 }]); commit(); }
  function removeBed(i: number) { setBeds(prev => prev.filter((_, idx) => idx !== i)); commit(); }
  function updateBed(i: number, field: 'type' | 'count', val: string | number) {
    setBeds(prev => prev.map((b, idx) => idx === i ? { ...b, [field]: val } : b));
  }

  async function handleDelete() {
    setDeleting(true);
    setDeleteError('');
    try {
      await businessService.deleteProperty(workspaceId, property.id);
      onDeleted();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete');
      setConfirmDelete(false);
    }
    setDeleting(false);
  }

  // Uses module-level Section component. `alwaysOpen` on desktop so
  // every section is visible at once; mobile uses the accordion.

  return (
    <div>
      {/* Save status pinned top-right */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', minHeight: 18, marginBottom: 8 }}>
        <SaveStatus status={status} errorMsg={errorMsg} />
      </div>

      {/* Basic info */}
      <Section id="basic" title="Basic info" openSections={openSections} onToggle={toggleSection} alwaysOpen={!isMobile}>
        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>Property name</label>
          <input value={name} onChange={e => setName(e.target.value)} onBlur={commit} style={inputStyle} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div>
            <label style={labelStyle}>Property type</label>
            <select value={propType} onChange={e => { setPropType(e.target.value); commit(); }} style={{ ...inputStyle, cursor: 'pointer' }}>
              {Object.entries(PROPERTY_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Unit count</label>
            <input type="number" min={1} value={unitCount} onChange={e => setUnitCount(+e.target.value || 1)} onBlur={commit} style={inputStyle} />
          </div>
        </div>
        {/* Rental type override — 'inherit' maps to null on the backend
            and means "fall back to the workspace default". The label
            spells out the effective default so the PM can see what
            inherit resolves to without flipping over to Settings. */}
        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>Rental type</label>
          <select
            value={rentalTypeOverride}
            onChange={e => { setRentalTypeOverride(e.target.value as 'inherit' | RentalType); commit(); }}
            style={{ ...inputStyle, cursor: 'pointer' }}
          >
            <option value="inherit">
              Use workspace default ({rentalTermsFor(workspaceRentalType).Occupant === 'Tenant' ? 'Long-term rental' : 'Short-term rental'})
            </option>
            <option value="short_term">Short-term rental (guests)</option>
            <option value="long_term">Long-term rental (tenants)</option>
          </select>
          <div style={{ fontSize: 11, color: 'var(--bp-subtle)', marginTop: 4, lineHeight: 1.5 }}>
            Overrides the workspace default for this specific property. Useful for mixed portfolios (e.g. most properties are vacation rentals, but a few units are long-term leases).
          </div>
        </div>
      </Section>

      {/* Address */}
      <Section id="address" title="Address" openSections={openSections} onToggle={toggleSection} alwaysOpen={!isMobile}>
        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>Street address</label>
          <input value={address} onChange={e => setAddress(e.target.value)} onBlur={commit} style={inputStyle} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 12 }}>
          <div>
            <label style={labelStyle}>City</label>
            <input value={city} onChange={e => setCity(e.target.value)} onBlur={commit} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>State</label>
            <input value={state} onChange={e => setState(e.target.value)} onBlur={commit} maxLength={2} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>ZIP</label>
            <input value={zip} onChange={e => setZip(e.target.value)} onBlur={commit} maxLength={10} style={inputStyle} />
          </div>
        </div>
      </Section>

      {/* Layout */}
      <Section id="layout" title="Layout" openSections={openSections} onToggle={toggleSection} alwaysOpen={!isMobile}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
          <div>
            <label style={labelStyle}>Bedrooms</label>
            <input type="number" min={0} value={bedrooms} onChange={e => setBedrooms(+e.target.value || 0)} onBlur={commit} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Bathrooms</label>
            <select value={bathrooms} onChange={e => { setBathrooms(e.target.value); commit(); }} style={{ ...inputStyle, cursor: 'pointer' }}>
              {['0.5', '1', '1.5', '2', '2.5', '3', '3.5', '4', '4.5', '5', '5.5', '6'].map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Sq ft</label>
            <input type="number" min={0} value={sqft} onChange={e => setSqft(+e.target.value || 0)} onBlur={commit} style={inputStyle} />
          </div>
        </div>
        {/* Bed config */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ ...labelStyle, marginBottom: 0 }}>Bed configuration</span>
          <button onClick={addBed} style={{ fontSize: 12, color: O, fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer' }}>+ Add bed</button>
        </div>
        {beds.length === 0 && <div style={{ fontSize: 12, color: 'var(--bp-subtle)', marginBottom: 8 }}>No beds configured</div>}
        {beds.map((b, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
            <select value={b.type} onChange={e => { updateBed(i, 'type', e.target.value); commit(); }}
              style={{ flex: 2, padding: '8px 12px', border: '1px solid var(--bp-border)', borderRadius: 8, fontSize: 13, cursor: 'pointer', background: 'var(--bp-card)', color: 'var(--bp-text)' }}>
              {BED_TYPES.map(bt => <option key={bt.value} value={bt.value}>{bt.label}</option>)}
            </select>
            <input type="number" min={1} value={b.count} onChange={e => updateBed(i, 'count', +e.target.value || 1)} onBlur={commit}
              style={{ flex: 1, padding: '8px 12px', border: '1px solid var(--bp-border)', borderRadius: 8, fontSize: 13, textAlign: 'center', background: 'var(--bp-card)', color: 'var(--bp-text)' }} />
            <button onClick={() => removeBed(i)} style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #FCA5A5', background: '#FEF2F2', fontSize: 12, cursor: 'pointer', color: '#DC2626' }}>×</button>
          </div>
        ))}
      </Section>

      {/* Access & Security */}
      <Section id="access" title="Access & security" openSections={openSections} onToggle={toggleSection} alwaysOpen={!isMobile}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <TextField label="Lockbox code" value={details.access?.lockboxCode || ''} onChange={v => updateAccess('lockboxCode', v)} onBlur={commit} />
          <TextField label="Gate code" value={details.access?.gateCode || ''} onChange={v => updateAccess('gateCode', v)} onBlur={commit} />
          <TextField label="Alarm brand" value={details.access?.alarmBrand || ''} onChange={v => updateAccess('alarmBrand', v)} onBlur={commit} placeholder="ADT, Ring, SimpliSafe…" />
          <TextField label="Alarm code" value={details.access?.alarmCode || ''} onChange={v => updateAccess('alarmCode', v)} onBlur={commit} />
          <TextField label="WiFi network" value={details.access?.wifiNetwork || ''} onChange={v => updateAccess('wifiNetwork', v)} onBlur={commit} />
          <TextField label="WiFi password" value={details.access?.wifiPassword || ''} onChange={v => updateAccess('wifiPassword', v)} onBlur={commit} />
        </div>
      </Section>

      {/* Notes */}
      <Section id="notes" title="Notes" openSections={openSections} onToggle={toggleSection} alwaysOpen={!isMobile}>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} onBlur={commit} rows={4}
          placeholder="Any general notes about this property…"
          style={{ ...inputStyle, resize: 'vertical' }} />
      </Section>

      {/* Danger zone */}
      <div style={{ marginTop: 32, paddingTop: 24, borderTop: '1px solid var(--bp-border)' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#DC2626', marginBottom: 8 }}>Danger zone</div>
        {!confirmDelete ? (
          <button onClick={() => setConfirmDelete(true)}
            style={{
              padding: '10px 18px', borderRadius: 8, border: '1px solid #FCA5A5',
              background: 'transparent', color: '#DC2626', fontSize: 13, fontWeight: 600,
              cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
            }}>
            Delete this property
          </button>
        ) : (
          <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, padding: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#DC2626', marginBottom: 6 }}>Are you sure?</div>
            <div style={{ fontSize: 13, color: 'var(--bp-muted)', marginBottom: 12 }}>
              This will permanently remove <strong>{property.name}</strong>, its inventory, and its scan history. Cannot be undone.
            </div>
            {deleteError && <div style={{ fontSize: 12, color: '#DC2626', marginBottom: 10 }}>{deleteError}</div>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setConfirmDelete(false)} disabled={deleting}
                style={{ flex: 1, padding: '8px 14px', borderRadius: 8, border: '1px solid var(--bp-border)', background: 'var(--bp-card)', fontSize: 13, cursor: 'pointer', color: 'var(--bp-text)' }}>
                Cancel
              </button>
              <button onClick={handleDelete} disabled={deleting}
                style={{ flex: 1, padding: '8px 14px', borderRadius: 8, border: 'none', background: '#DC2626', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: deleting ? 0.6 : 1 }}>
                {deleting ? 'Deleting…' : 'Yes, delete'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── PropertyEquipmentPanel ───────────────────────────────────────────────── */

export function PropertyEquipmentPanel({ workspaceId, property, plan, onPropertyUpdated, onJumpToInventory, isMobile }: {
  workspaceId: string;
  property: Property;
  plan: string;
  onPropertyUpdated: (p: Property) => void;
  onJumpToInventory: () => void;
  isMobile: boolean;
}) {
  const [details, setDetails] = useState<PropertyDetails>(property.details ?? {});
  const [openSections, setOpenSections] = useState<Set<string>>(() => new Set(['hvac']));
  const [scanPaths, setScanPaths] = useState<Set<string>>(new Set());

  // Load scan-source paths
  useEffect(() => {
    let cancelled = false;
    businessService.getScanSourcePaths(workspaceId, property.id)
      .then(res => {
        if (!cancelled && res.data) setScanPaths(new Set(res.data.paths));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [workspaceId, property.id]);

  // Save handler
  const saver = useCallback(async () => {
    const res = await businessService.updateProperty(workspaceId, property.id, {
      details: Object.keys(details).length > 0 ? details : null,
    });
    if (res.error) throw new Error(res.error);
    if (res.data) onPropertyUpdated(res.data);
  }, [workspaceId, property.id, details, onPropertyUpdated]);

  const { scheduleSave, status, errorMsg } = useAutoSave(saver);
  function commit() { scheduleSave(undefined as never); }

  function update<K extends keyof PropertyDetails>(section: K, field: string, value: string | boolean) {
    setDetails(prev => ({
      ...prev,
      [section]: { ...(prev[section] as Record<string, unknown> ?? {}), [field]: value },
    }));
  }

  function updateAppliance(appKey: string, field: string, value: string) {
    setDetails(prev => ({
      ...prev,
      appliances: {
        ...(prev.appliances ?? {}),
        [appKey]: { ...((prev.appliances as Record<string, Record<string, string>> ?? {})[appKey] ?? {}), [field]: value },
      },
    }));
  }

  function toggleSection(key: string) {
    setOpenSections(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  const isScanned = (path: string) => scanPaths.has(path);

  // Using the module-level EquipmentSection component (defined below).
  // Must NOT re-declare as a local function — doing so gives every
  // render a fresh function TYPE, which makes React unmount and remount
  // the entire subtree on every keystroke, destroying the input DOM
  // node and killing the caret. One-letter-then-stops territory.

  return (
    <div>
      {/* Scan status header strip */}
      <div style={{ marginBottom: 16 }}>
        <PropertyScanCard
          workspaceId={workspaceId}
          property={property}
          plan={plan}
          onScanStart={() => onJumpToInventory()}
          onViewInventory={onJumpToInventory}
        />
      </div>

      {/* Save status */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: 'var(--bp-subtle)' }}>
          Edits save automatically. Fields marked <span style={{ color: O, fontWeight: 700 }}>SCANNED</span> were filled by the AI Property Scan.
        </div>
        <SaveStatus status={status} errorMsg={errorMsg} />
      </div>

      {/* HVAC */}
      <Section id="hvac" title="HVAC & Climate" openSections={openSections} onToggle={toggleSection}>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
          <TextField label="AC type" value={details.hvac?.acType || ''} onChange={v => update('hvac', 'acType', v)} onBlur={commit} placeholder="Central, Mini-split, Window…" scanned={isScanned('hvac.acType')} onBadgeClick={onJumpToInventory} />
          <TextField label="AC brand" value={details.hvac?.acBrand || ''} onChange={v => update('hvac', 'acBrand', v)} onBlur={commit} placeholder="Carrier, Trane…" scanned={isScanned('hvac.acBrand')} onBadgeClick={onJumpToInventory} />
          <TextField label="AC model" value={details.hvac?.acModel || ''} onChange={v => update('hvac', 'acModel', v)} onBlur={commit} scanned={isScanned('hvac.acModel')} onBadgeClick={onJumpToInventory} />
          <TextField label="AC age" value={details.hvac?.acAge || ''} onChange={v => update('hvac', 'acAge', v)} onBlur={commit} placeholder="5 years" scanned={isScanned('hvac.acAge')} onBadgeClick={onJumpToInventory} />
          <TextField label="Heating type" value={details.hvac?.heatingType || ''} onChange={v => update('hvac', 'heatingType', v)} onBlur={commit} placeholder="Forced air, Radiant…" scanned={isScanned('hvac.heatingType')} onBadgeClick={onJumpToInventory} />
          <TextField label="Heating brand" value={details.hvac?.heatingBrand || ''} onChange={v => update('hvac', 'heatingBrand', v)} onBlur={commit} scanned={isScanned('hvac.heatingBrand')} onBadgeClick={onJumpToInventory} />
          <TextField label="Heating model" value={details.hvac?.heatingModel || ''} onChange={v => update('hvac', 'heatingModel', v)} onBlur={commit} scanned={isScanned('hvac.heatingModel')} onBadgeClick={onJumpToInventory} />
          <TextField label="Thermostat brand" value={details.hvac?.thermostatBrand || ''} onChange={v => update('hvac', 'thermostatBrand', v)} onBlur={commit} placeholder="Nest, Ecobee…" scanned={isScanned('hvac.thermostatBrand')} onBadgeClick={onJumpToInventory} />
          <TextField label="Thermostat model" value={details.hvac?.thermostatModel || ''} onChange={v => update('hvac', 'thermostatModel', v)} onBlur={commit} scanned={isScanned('hvac.thermostatModel')} onBadgeClick={onJumpToInventory} />
          <TextField label="Filter size" value={details.hvac?.filterSize || ''} onChange={v => update('hvac', 'filterSize', v)} onBlur={commit} placeholder="20x25x1" />
        </div>
      </Section>

      {/* Water heater */}
      <Section id="waterHeater" title="Water heater" openSections={openSections} onToggle={toggleSection}>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
          <TextField label="Type" value={details.waterHeater?.type || ''} onChange={v => update('waterHeater', 'type', v)} onBlur={commit} placeholder="Tankless, Tank, Hybrid…" />
          <TextField label="Brand" value={details.waterHeater?.brand || ''} onChange={v => update('waterHeater', 'brand', v)} onBlur={commit} placeholder="Rinnai, Rheem…" scanned={isScanned('waterHeater.brand')} onBadgeClick={onJumpToInventory} />
          <TextField label="Model" value={details.waterHeater?.model || ''} onChange={v => update('waterHeater', 'model', v)} onBlur={commit} scanned={isScanned('waterHeater.model')} onBadgeClick={onJumpToInventory} />
          <TextField label="Age" value={details.waterHeater?.age || ''} onChange={v => update('waterHeater', 'age', v)} onBlur={commit} placeholder="3 years" scanned={isScanned('waterHeater.age')} onBadgeClick={onJumpToInventory} />
          <TextField label="Fuel" value={details.waterHeater?.fuel || ''} onChange={v => update('waterHeater', 'fuel', v)} onBlur={commit} placeholder="Gas, Electric, Propane" scanned={isScanned('waterHeater.fuel')} onBadgeClick={onJumpToInventory} />
          <TextField label="Capacity" value={details.waterHeater?.capacity || ''} onChange={v => update('waterHeater', 'capacity', v)} onBlur={commit} placeholder="50 gallons" scanned={isScanned('waterHeater.capacity')} onBadgeClick={onJumpToInventory} />
          <TextField label="Location" value={details.waterHeater?.location || ''} onChange={v => update('waterHeater', 'location', v)} onBlur={commit} placeholder="Garage, Utility closet…" scanned={isScanned('waterHeater.location')} onBadgeClick={onJumpToInventory} />
        </div>
      </Section>

      {/* Appliances */}
      <Section id="appliances" title="Appliances" openSections={openSections} onToggle={toggleSection}>
        {[
          { key: 'refrigerator', label: 'Refrigerator', fields: ['brand', 'model'] },
          { key: 'washer', label: 'Washer', fields: ['brand', 'model'] },
          { key: 'dryer', label: 'Dryer', fields: ['brand', 'model', 'fuel'] },
          { key: 'dishwasher', label: 'Dishwasher', fields: ['brand', 'model'] },
          { key: 'oven', label: 'Oven / Stove', fields: ['brand', 'model', 'fuel'] },
          { key: 'disposal', label: 'Disposal', fields: ['brand'] },
          { key: 'microwave', label: 'Microwave', fields: ['brand', 'type'] },
        ].map(app => (
          <div key={app.key} style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--bp-subtle)', marginBottom: 6 }}>{app.label}</div>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : (app.fields.length > 2 ? '1fr 1fr 1fr' : '1fr 1fr'), gap: 8 }}>
              {app.fields.map(f => {
                const path = `appliances.${app.key}.${f}`;
                const val = ((details.appliances as Record<string, Record<string, string>> | undefined)?.[app.key]?.[f]) || '';
                return (
                  <TextField key={f} label={f.charAt(0).toUpperCase() + f.slice(1)}
                    value={val} onChange={v => updateAppliance(app.key, f, v)} onBlur={commit}
                    scanned={isScanned(path)} onBadgeClick={onJumpToInventory} />
                );
              })}
            </div>
          </div>
        ))}
      </Section>

      {/* Plumbing */}
      <Section id="plumbing" title="Plumbing" openSections={openSections} onToggle={toggleSection}>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
          <TextField label="Kitchen faucet brand" value={details.plumbing?.kitchenFaucetBrand || ''} onChange={v => update('plumbing', 'kitchenFaucetBrand', v)} onBlur={commit} scanned={isScanned('plumbing.kitchenFaucetBrand')} onBadgeClick={onJumpToInventory} />
          <TextField label="Bathroom faucet brand" value={details.plumbing?.bathroomFaucetBrand || ''} onChange={v => update('plumbing', 'bathroomFaucetBrand', v)} onBlur={commit} scanned={isScanned('plumbing.bathroomFaucetBrand')} onBadgeClick={onJumpToInventory} />
          <TextField label="Toilet brand" value={details.plumbing?.toiletBrand || ''} onChange={v => update('plumbing', 'toiletBrand', v)} onBlur={commit} scanned={isScanned('plumbing.toiletBrand')} onBadgeClick={onJumpToInventory} />
          <TextField label="Water softener" value={details.plumbing?.waterSoftener || ''} onChange={v => update('plumbing', 'waterSoftener', v)} onBlur={commit} scanned={isScanned('plumbing.waterSoftener')} onBadgeClick={onJumpToInventory} />
          <TextField label="Septic or sewer" value={details.plumbing?.septicOrSewer || ''} onChange={v => update('plumbing', 'septicOrSewer', v)} onBlur={commit} placeholder="Septic, Municipal sewer" />
          <TextField label="Main shutoff location" value={details.plumbing?.mainShutoffLocation || ''} onChange={v => update('plumbing', 'mainShutoffLocation', v)} onBlur={commit} />
        </div>
      </Section>

      {/* Electrical */}
      <Section id="electrical" title="Electrical" openSections={openSections} onToggle={toggleSection}>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
          <TextField label="Breaker box location" value={details.electrical?.breakerBoxLocation || ''} onChange={v => update('electrical', 'breakerBoxLocation', v)} onBlur={commit} scanned={isScanned('electrical.breakerBoxLocation')} onBadgeClick={onJumpToInventory} />
          <TextField label="Panel amperage" value={details.electrical?.panelAmperage || ''} onChange={v => update('electrical', 'panelAmperage', v)} onBlur={commit} placeholder="100A, 200A…" scanned={isScanned('electrical.panelAmperage')} onBadgeClick={onJumpToInventory} />
          <TextField label="Generator type" value={details.electrical?.generatorType || ''} onChange={v => { update('electrical', 'generatorType', v); update('electrical', 'hasGenerator', v.length > 0); }} onBlur={commit} placeholder="Standby, Portable…" scanned={isScanned('electrical.generatorType')} onBadgeClick={onJumpToInventory} />
          <TextField label="Solar system" value={details.electrical?.solarSystem || ''} onChange={v => { update('electrical', 'solarSystem', v); update('electrical', 'hasSolar', v.length > 0); }} onBlur={commit} placeholder="Tesla, SunPower…" scanned={isScanned('electrical.solarSystem')} onBadgeClick={onJumpToInventory} />
          <TextField label="EV charger brand" value={details.electrical?.evChargerBrand || ''} onChange={v => { update('electrical', 'evChargerBrand', v); update('electrical', 'hasEvCharger', v.length > 0); }} onBlur={commit} placeholder="Tesla, ChargePoint…" scanned={isScanned('electrical.evChargerBrand')} onBadgeClick={onJumpToInventory} />
        </div>
      </Section>

      {/* Pool & Spa */}
      <Section id="poolSpa" title="Pool & Spa" openSections={openSections} onToggle={toggleSection}>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
          <TextField label="Pool type" value={details.poolSpa?.poolType || ''} onChange={v => update('poolSpa', 'poolType', v)} onBlur={commit} placeholder="In-ground, Above-ground…" scanned={isScanned('poolSpa.poolType')} onBadgeClick={onJumpToInventory} />
          <TextField label="Pool heater brand" value={details.poolSpa?.poolHeaterBrand || ''} onChange={v => update('poolSpa', 'poolHeaterBrand', v)} onBlur={commit} scanned={isScanned('poolSpa.poolHeaterBrand')} onBadgeClick={onJumpToInventory} />
          <TextField label="Pool pump brand" value={details.poolSpa?.poolPumpBrand || ''} onChange={v => update('poolSpa', 'poolPumpBrand', v)} onBlur={commit} scanned={isScanned('poolSpa.poolPumpBrand')} onBadgeClick={onJumpToInventory} />
          <TextField label="Hot tub brand" value={details.poolSpa?.hotTubBrand || ''} onChange={v => update('poolSpa', 'hotTubBrand', v)} onBlur={commit} scanned={isScanned('poolSpa.hotTubBrand')} onBadgeClick={onJumpToInventory} />
          <TextField label="Hot tub model" value={details.poolSpa?.hotTubModel || ''} onChange={v => update('poolSpa', 'hotTubModel', v)} onBlur={commit} scanned={isScanned('poolSpa.hotTubModel')} onBadgeClick={onJumpToInventory} />
        </div>
      </Section>

      {/* Exterior */}
      <Section id="exterior" title="Exterior" openSections={openSections} onToggle={toggleSection}>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
          <TextField label="Roof type" value={details.exterior?.roofType || ''} onChange={v => update('exterior', 'roofType', v)} onBlur={commit} placeholder="Shingle, Tile, Metal…" />
          <TextField label="Roof age" value={details.exterior?.roofAge || ''} onChange={v => update('exterior', 'roofAge', v)} onBlur={commit} placeholder="10 years" />
          <TextField label="Siding material" value={details.exterior?.sidingMaterial || ''} onChange={v => update('exterior', 'sidingMaterial', v)} onBlur={commit} placeholder="Vinyl, Wood, Stucco…" />
          <TextField label="Fence material" value={details.exterior?.fenceMaterial || ''} onChange={v => update('exterior', 'fenceMaterial', v)} onBlur={commit} placeholder="Wood, Vinyl, Iron…" />
          <TextField label="Garage door brand" value={details.exterior?.garageDoorBrand || ''} onChange={v => update('exterior', 'garageDoorBrand', v)} onBlur={commit} scanned={isScanned('exterior.garageDoorBrand')} onBadgeClick={onJumpToInventory} />
          <TextField label="Irrigation brand" value={details.exterior?.irrigationBrand || ''} onChange={v => update('exterior', 'irrigationBrand', v)} onBlur={commit} placeholder="Rachio, Hunter…" scanned={isScanned('exterior.irrigationBrand')} onBadgeClick={onJumpToInventory} />
        </div>
      </Section>

      {/* General */}
      <Section id="general" title="General" openSections={openSections} onToggle={toggleSection}>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <TextField label="Year built" value={details.general?.yearBuilt || ''} onChange={v => update('general', 'yearBuilt', v)} onBlur={commit} placeholder="2005" />
          <div>
            <label style={labelStyle}>HOA</label>
            <select value={details.general?.hasHoa ? 'yes' : 'no'} onChange={e => { update('general', 'hasHoa', e.target.value === 'yes'); commit(); }} style={{ ...inputStyle, cursor: 'pointer' }}>
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </select>
          </div>
          <TextField label="HOA contact" value={details.general?.hoaContact || ''} onChange={v => update('general', 'hoaContact', v)} onBlur={commit} />
          <TextField label="Pest control provider" value={details.general?.pestControlProvider || ''} onChange={v => update('general', 'pestControlProvider', v)} onBlur={commit} />
          <TextField label="Pest control frequency" value={details.general?.pestControlFrequency || ''} onChange={v => update('general', 'pestControlFrequency', v)} onBlur={commit} placeholder="Monthly, Quarterly…" />
        </div>
        <div>
          <label style={labelStyle}>Cleaning notes</label>
          <textarea value={details.general?.cleaningNotes || ''} onChange={e => update('general', 'cleaningNotes', e.target.value)} onBlur={commit} rows={2}
            style={{ ...inputStyle, resize: 'vertical' }} />
        </div>
      </Section>
    </div>
  );
}

/* ── PropertyInventoryPanel ───────────────────────────────────────────────── */

export function PropertyInventoryPanel({ workspaceId, property, plan, onPropertyUpdated }: {
  workspaceId: string;
  property: Property;
  plan: string;
  onPropertyUpdated: (p: Property) => void;
}) {
  const [activeScanId, setActiveScanId] = useState<string | null>(null);
  const [showInventory, setShowInventory] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applyResult, setApplyResult] = useState<{ count: number } | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);

  async function handleApplyToSettings() {
    setApplying(true);
    setApplyError(null);
    setApplyResult(null);
    try {
      const res = await businessService.applyInventoryToSettings(workspaceId, property.id);
      if (res.error) throw new Error(res.error);
      if (res.data) {
        setApplyResult({ count: res.data.count });
        // Refresh the property so the equipment panel sees the new values
        const fresh = await businessService.getProperty(workspaceId, property.id);
        if (fresh.data) onPropertyUpdated(fresh.data);
      }
    } catch (err) {
      setApplyError(err instanceof Error ? err.message : 'Failed to apply');
    }
    setApplying(false);
  }

  return (
    <div>
      <PropertyScanCard
        workspaceId={workspaceId}
        property={property}
        plan={plan}
        onScanStart={(scanId) => setActiveScanId(scanId)}
        onViewInventory={() => setShowInventory(true)}
      />

      {/* Push to settings */}
      <div style={{
        background: 'var(--bp-card)', border: '1px solid var(--bp-border)',
        borderRadius: 12, padding: 18, marginBottom: 20,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontFamily: 'Fraunces, serif', fontSize: 15, fontWeight: 700, color: 'var(--bp-text)', marginBottom: 4 }}>
              Push scan results to property settings
            </div>
            <div style={{ fontSize: 12, color: 'var(--bp-subtle)', lineHeight: 1.5 }}>
              Backfills empty Equipment & Systems fields with scanned data. Won't overwrite anything you've entered manually.
            </div>
          </div>
          <button onClick={handleApplyToSettings} disabled={applying}
            style={{
              padding: '10px 18px', borderRadius: 8, border: 'none',
              background: O, color: '#fff', fontSize: 13, fontWeight: 600,
              cursor: applying ? 'default' : 'pointer', opacity: applying ? 0.6 : 1,
              fontFamily: "'DM Sans', sans-serif",
            }}>
            {applying ? 'Applying…' : 'Apply to settings'}
          </button>
        </div>
        {applyResult && (
          <div style={{ marginTop: 12, padding: '8px 12px', background: `${G}10`, border: `1px solid ${G}40`, borderRadius: 8, fontSize: 12, color: G, fontWeight: 600 }}>
            ✓ Filled {applyResult.count} field{applyResult.count === 1 ? '' : 's'} in property settings
          </div>
        )}
        {applyError && (
          <div style={{ marginTop: 12, padding: '8px 12px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, fontSize: 12, color: '#DC2626' }}>
            {applyError}
          </div>
        )}
      </div>

      {/* Open inventory viewer button */}
      <button onClick={() => setShowInventory(true)}
        style={{
          width: '100%', padding: '14px 20px', borderRadius: 12,
          border: '1px solid var(--bp-border)', background: 'var(--bp-card)',
          color: 'var(--bp-text)', fontSize: 14, fontWeight: 600,
          cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
        }}>
        Browse full inventory →
      </button>

      {activeScanId && (
        <ScanCaptureModal
          workspaceId={workspaceId}
          scanId={activeScanId}
          propertyName={property.name}
          onClose={() => setActiveScanId(null)}
          onComplete={() => {
            setActiveScanId(null);
            // Refresh property to pick up auto-filled settings
            businessService.getProperty(workspaceId, property.id).then(res => {
              if (res.data) onPropertyUpdated(res.data);
            }).catch(() => {});
          }}
        />
      )}

      {showInventory && (
        <PropertyInventoryView
          workspaceId={workspaceId}
          propertyId={property.id}
          onClose={() => setShowInventory(false)}
        />
      )}
    </div>
  );
}

/* ── PropertySubPage (container with tabs) ────────────────────────────────── */

type PropertyTab = 'profile' | 'equipment' | 'inventory';
const VALID_PROPERTY_TABS: PropertyTab[] = ['profile', 'equipment', 'inventory'];

export default function PropertySubPage({ workspaceId, workspaceRentalType, property, plan, onPropertyUpdated, onDeleted }: {
  workspaceId: string;
  /** Workspace-level default rental type — threaded through so the
   *  per-property override select can spell out the effective
   *  default ("Use workspace default (Short-term rental)"). */
  workspaceRentalType: RentalType;
  property: Property;
  plan: string;
  onPropertyUpdated: (p: Property) => void;
  onDeleted: () => void;
}) {
  // Restore last-viewed sub-tab from localStorage so refreshes land back here
  const [activeTab, setActiveTab] = useState<PropertyTab>(() => {
    const stored = getStoredNav('propertySubTab');
    if (stored && VALID_PROPERTY_TABS.includes(stored as PropertyTab)) return stored as PropertyTab;
    return 'profile';
  });
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth <= 768);

  // Persist sub-tab to localStorage on every change
  useEffect(() => {
    setStoredNav('propertySubTab', activeTab);
  }, [activeTab]);

  useEffect(() => {
    function onResize() { setIsMobile(window.innerWidth <= 768); }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const TABS: { id: PropertyTab; label: string }[] = [
    { id: 'profile', label: 'Profile' },
    { id: 'equipment', label: 'Equipment & Systems' },
    { id: 'inventory', label: 'Inventory & Scan' },
  ];

  return (
    <div>
      {/* Pill tabs */}
      <div style={{
        display: 'flex', gap: 6, marginBottom: 24, flexWrap: 'wrap',
        borderBottom: '1px solid var(--bp-border)', paddingBottom: 12,
      }}>
        {TABS.map(t => {
          const isActive = activeTab === t.id;
          return (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              style={{
                padding: '8px 16px', borderRadius: 100,
                border: isActive ? `1px solid ${O}` : '1px solid var(--bp-border)',
                background: isActive ? `${O}10` : 'var(--bp-card)',
                color: isActive ? O : 'var(--bp-muted)',
                fontSize: 13, fontWeight: 600, cursor: 'pointer',
                fontFamily: "'DM Sans', sans-serif",
              }}>
              {t.label}
            </button>
          );
        })}
      </div>

      {activeTab === 'profile' && (
        <PropertyProfilePanel
          workspaceId={workspaceId}
          workspaceRentalType={workspaceRentalType}
          property={property}
          onPropertyUpdated={onPropertyUpdated}
          onDeleted={onDeleted}
          isMobile={isMobile}
        />
      )}
      {activeTab === 'equipment' && (
        <PropertyEquipmentPanel
          workspaceId={workspaceId}
          property={property}
          plan={plan}
          onPropertyUpdated={onPropertyUpdated}
          onJumpToInventory={() => setActiveTab('inventory')}
          isMobile={isMobile}
        />
      )}
      {activeTab === 'inventory' && (
        <PropertyInventoryPanel
          workspaceId={workspaceId}
          property={property}
          plan={plan}
          onPropertyUpdated={onPropertyUpdated}
        />
      )}
    </div>
  );
}
