import { useState, useEffect } from 'react';
import { O, G, D, W, VENDOR_CATEGORIES, formatCadence, ordinal, relativeTime, TEMPLATE_CATEGORIES, CADENCE_OPTIONS } from './constants';
import { businessService, templateService, type DispatchSchedule, type ScheduleTemplate, type ScheduleRun, type PreferredVendor, type Property } from '@/services/api';

/* ── Schedule Category Colors ──────────────────────────────────────── */

const SCHEDULE_CAT_COLORS: Record<string, string> = {
  cleaning: '#1B9E77', pool: '#2E86C1', hot_tub: '#2E86C1',
  hvac: '#E8632B', pest_control: '#C0392B', landscaping: '#D4A437',
  general: '#2D2926', restocking: '#17A589', trash: '#6C757D',
  inspection: '#2D2926', roofing: '#6366F1',
};

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
  const [preferredOnly, setPreferredOnly] = useState(false);
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
    if (preferredOnly && selectedVendorIds.length === 0) {
      setError('Select at least one preferred provider when marketplace is disabled.');
      return;
    }
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
          fallback_to_marketplace: !preferredOnly,
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
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, opacity: preferredOnly ? 0.5 : 1 }}>
                <button
                  disabled={preferredOnly}
                  onClick={() => !preferredOnly && setAutoBookMarketplace(!autoBookMarketplace)}
                  style={{
                    width: 44, height: 24, borderRadius: 12, border: 'none', cursor: preferredOnly ? 'not-allowed' : 'pointer', position: 'relative',
                    background: autoBookMarketplace && !preferredOnly ? G : '#D0CBC6', transition: 'background 0.2s', flexShrink: 0,
                  }}>
                  <span style={{
                    position: 'absolute', top: 2, left: autoBookMarketplace && !preferredOnly ? 22 : 2,
                    width: 20, height: 20, borderRadius: '50%', background: '#fff',
                    transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                  }} />
                </button>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: D }}>Auto-book marketplace providers</div>
                  <div style={{ fontSize: 12, color: '#9B9490' }}>Automatically confirm marketplace responses (if no preferred provider available)</div>
                </div>
              </div>

              {/* Preferred-only / disable marketplace */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 12,
                marginTop: 4, padding: '12px 14px', borderRadius: 10,
                background: preferredOnly ? `${O}08` : '#FAFAF8',
                border: `1px solid ${preferredOnly ? `${O}40` : '#E0DAD4'}`,
              }}>
                <button onClick={() => {
                  const next = !preferredOnly;
                  setPreferredOnly(next);
                  if (next) setAutoBookMarketplace(false);
                }}
                  style={{
                    width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer', position: 'relative',
                    background: preferredOnly ? O : '#D0CBC6', transition: 'background 0.2s', flexShrink: 0,
                  }}>
                  <span style={{
                    position: 'absolute', top: 2, left: preferredOnly ? 22 : 2,
                    width: 20, height: 20, borderRadius: '50%', background: '#fff',
                    transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                  }} />
                </button>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: D }}>Preferred providers only</div>
                  <div style={{ fontSize: 12, color: '#9B9490' }}>Skip the Homie marketplace and only reach out to your selected preferred providers. Requires at least one preferred provider above.</div>
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

/* ── Edit Schedule Modal ──────────────────────────────────────────── */

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

/* ── Schedules Tab ──────────────────────────────────────────────────── */

export default function SchedulesTab({ workspaceId, plan }: { workspaceId: string; plan: string }) {
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
