import { useState, useEffect } from 'react';
import { O, G, D, W, VENDOR_CATEGORIES, DAYS, TIME_OPTIONS, fmtTimeLabel, formatScheduleSummary, SchedulePicker, type VendorSched } from './constants';
import { businessService, type PreferredVendor, type ProviderSearchResult, type Property, type VendorSchedule } from '@/services/api';

/* ── Add Vendor Modal ──────────────────────────────────────────────── */

export function AddVendorModal({ workspaceId, onClose, onAdded, defaultPropertyId }: { workspaceId: string; onClose: () => void; onAdded: () => void; defaultPropertyId?: string }) {
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
  const [selectedPropertyIds, setSelectedPropertyIds] = useState<string[]>(defaultPropertyId ? [defaultPropertyId] : []);
  const [cityFilter, setCityFilter] = useState('');
  const [assignMode, setAssignMode] = useState<'all' | 'specific'>(defaultPropertyId ? 'specific' : 'all');

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

/* ── Grouped Vendor Types ──────────────────────────────────────────── */

export interface GroupedVendor {
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

export function groupVendors(vendors: PreferredVendor[]): GroupedVendor[] {
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

/* ── Edit Vendor Modal ────────────────────────────────────────────────── */

export function EditVendorModal({ workspaceId, vendor, allProperties, onClose, onSaved }: {
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

/* ── Vendors Tab ──────────────────────────────────────────────────── */

export default function VendorsTab({ workspaceId, role, plan }: { workspaceId: string; role: string; plan: string }) {
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
            {uniqueVendorCount} of {vendorLimit === 9999 ? '\u221E' : vendorLimit} · {plan.charAt(0).toUpperCase() + plan.slice(1)}
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
                {/* Collapsed row */}
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
                      <span style={{ fontSize: 11, color: '#C0BBB6' }}>{isExpVendor ? '\u25B2' : '\u25BC'}</span>
                    </div>
                  </div>
                </div>

                {/* Expanded detail */}
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
