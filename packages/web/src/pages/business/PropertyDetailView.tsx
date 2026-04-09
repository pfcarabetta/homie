import { useState, useEffect } from 'react';
import { businessService, type Property, type WorkspaceDispatch, type WorkspaceBooking, type PreferredVendor, type Reservation } from '@/services/api';
import { O, G, D, PROPERTY_TYPES, VENDOR_CATEGORIES, MiniCalendar } from './constants';

/* ── Types ──────────────────────────────────────────────────────────────── */

type SubPage = 'activity' | 'jobs' | 'bookings' | 'calendar' | 'providers' | 'settings';

interface PropertyDetailViewProps {
  workspaceId: string;
  property: Property;
  plan: string;
  onBack: () => void;
  onEditProperty?: (p: Property) => void;
}

/* ── Icons ──────────────────────────────────────────────────────────────── */

function BackArrow() {
  return (
    <svg width={18} height={18} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 10H5" /><path d="M10 5l-5 5 5 5" />
    </svg>
  );
}

function NavIcon({ name }: { name: SubPage }) {
  const s = { width: 18, height: 18, display: 'inline-flex' as const, alignItems: 'center' as const, justifyContent: 'center' as const };
  const icons: Record<SubPage, JSX.Element> = {
    activity: <svg style={s} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M3 10h3l2-5 4 10 2-5h3" /></svg>,
    jobs: <svg style={s} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M2 5h16M2 10h16M2 15h10" /><circle cx="16" cy="15" r="2.5" /></svg>,
    bookings: <svg style={s} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><circle cx="10" cy="10" r="7" /><path d="M7 10l2 2 4-4" /></svg>,
    calendar: <svg style={s} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><rect x="3" y="4" width="14" height="14" rx="2" /><path d="M3 8h14M7 2v4M13 2v4" /></svg>,
    providers: <svg style={s} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><circle cx="7" cy="7" r="3" /><path d="M2 17c0-3 2.5-5 5-5s5 2 5 5" /><circle cx="14.5" cy="6" r="2" /><path d="M18 15c0-2-1.5-3.5-3.5-3.5" /></svg>,
    settings: <svg style={s} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><circle cx="10" cy="10" r="3" /><path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.2 4.2l1.4 1.4M14.4 14.4l1.4 1.4M15.8 4.2l-1.4 1.4M5.6 14.4l-1.4 1.4" /></svg>,
  };
  return icons[name] || null;
}

/* ── Nav Items ──────────────────────────────────────────────────────────── */

const NAV_ITEMS: { id: SubPage; label: string }[] = [
  { id: 'activity', label: 'Activity' },
  { id: 'jobs', label: 'Jobs' },
  { id: 'bookings', label: 'Bookings' },
  { id: 'calendar', label: 'Calendar' },
  { id: 'providers', label: 'Providers' },
  { id: 'settings', label: 'Property Settings' },
];

/* ── Status badge helper ────────────────────────────────────────────────── */

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    open: '#2563EB', dispatching: '#C2410C', collecting: '#7C3AED',
    completed: '#16A34A', expired: '#9B9490', archived: '#9B9490',
    confirmed: '#16A34A', active: '#16A34A', cancelled: '#DC2626', pending: '#D97706',
  };
  const c = colors[status] ?? '#9B9490';
  return (
    <span style={{
      fontSize: 11, fontWeight: 600, color: c, background: `${c}15`,
      padding: '2px 8px', borderRadius: 100, textTransform: 'capitalize',
    }}>
      {status}
    </span>
  );
}

/* ── Sub-page: Activity ─────────────────────────────────────────────────── */

function ActivitySubPage({ dispatches, bookings, loading }: { dispatches: WorkspaceDispatch[]; bookings: WorkspaceBooking[]; loading: boolean }) {
  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--bp-subtle)', fontSize: 13 }}>Loading activity...</div>;

  type ActivityItem = { date: string; type: 'dispatch' | 'booking'; category: string; status: string; summary: string; id: string };
  const items: ActivityItem[] = [
    ...dispatches.map(d => ({
      date: d.createdAt,
      type: 'dispatch' as const,
      category: d.diagnosis?.category ?? 'Dispatch',
      status: d.status,
      summary: d.diagnosis?.summary ?? `${d.diagnosis?.category ?? 'Job'} dispatched`,
      id: d.id,
    })),
    ...bookings.map(b => ({
      date: b.confirmedAt,
      type: 'booking' as const,
      category: b.diagnosis?.category ?? 'Booking',
      status: b.status,
      summary: b.diagnosis?.summary ?? `Booked with ${b.providerName}`,
      id: b.id,
    })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  if (items.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--bp-subtle)' }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>&#128203;</div>
        <div style={{ fontSize: 14, fontWeight: 500 }}>No activity yet</div>
        <div style={{ fontSize: 13, marginTop: 4 }}>Dispatches and bookings for this property will appear here.</div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {items.map(item => (
        <div key={`${item.type}-${item.id}`} style={{
          background: 'var(--bp-card)', border: '1px solid var(--bp-border)', borderRadius: 10,
          padding: '14px 16px', display: 'flex', alignItems: 'flex-start', gap: 12,
        }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: item.type === 'booking' ? `${G}12` : `${O}12`, color: item.type === 'booking' ? G : O,
            fontSize: 14, flexShrink: 0,
          }}>
            {item.type === 'booking' ? '\u2713' : '\u25B6'}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--bp-text)' }}>{item.category}</span>
              <StatusBadge status={item.status} />
            </div>
            <div style={{ fontSize: 13, color: 'var(--bp-muted)', lineHeight: 1.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {item.summary}
            </div>
            <div style={{ fontSize: 11, color: 'var(--bp-subtle)', marginTop: 4 }}>
              {new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Sub-page: Jobs ─────────────────────────────────────────────────────── */

function JobsSubPage({ dispatches, loading }: { dispatches: WorkspaceDispatch[]; loading: boolean }) {
  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--bp-subtle)', fontSize: 13 }}>Loading jobs...</div>;

  if (dispatches.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--bp-subtle)' }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>&#128203;</div>
        <div style={{ fontSize: 14, fontWeight: 500 }}>No jobs</div>
        <div style={{ fontSize: 13, marginTop: 4 }}>No dispatches have been created for this property yet.</div>
      </div>
    );
  }

  const statusColors: Record<string, string> = {
    open: '#2563EB', dispatching: '#C2410C', collecting: '#7C3AED',
    completed: '#16A34A', expired: '#9B9490', archived: '#9B9490',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {dispatches.map(d => (
        <div key={d.id} style={{
          background: 'var(--bp-card)', border: '1px solid var(--bp-border)', borderRadius: 10,
          padding: '14px 16px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--bp-text)' }}>
              {d.diagnosis?.category ?? 'Dispatch'}
            </div>
            <StatusBadge status={d.status} />
          </div>
          {d.diagnosis?.summary && (
            <div style={{ fontSize: 13, color: 'var(--bp-muted)', lineHeight: 1.5, marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {d.diagnosis.summary}
            </div>
          )}
          <div style={{ display: 'flex', gap: 12, fontSize: 12, color: 'var(--bp-subtle)' }}>
            <span>{new Date(d.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
            <span>{d.responseCount} response{d.responseCount !== 1 ? 's' : ''}</span>
            {d.preferredTiming && <span>{d.preferredTiming}</span>}
          </div>
          {d.diagnosis?.estimatedCost && (
            <div style={{ fontSize: 12, color: G, fontWeight: 600, marginTop: 4 }}>
              ${d.diagnosis.estimatedCost.min} - ${d.diagnosis.estimatedCost.max}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/* ── Sub-page: Bookings ─────────────────────────────────────────────────── */

function BookingsSubPage({ bookings, loading }: { bookings: WorkspaceBooking[]; loading: boolean }) {
  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--bp-subtle)', fontSize: 13 }}>Loading bookings...</div>;

  if (bookings.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--bp-subtle)' }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>&#9989;</div>
        <div style={{ fontSize: 14, fontWeight: 500 }}>No bookings</div>
        <div style={{ fontSize: 13, marginTop: 4 }}>No bookings have been confirmed for this property yet.</div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {bookings.map(b => (
        <div key={b.id} style={{
          background: 'var(--bp-card)', border: '1px solid var(--bp-border)', borderRadius: 10,
          padding: '14px 16px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--bp-text)' }}>
                {b.diagnosis?.category ?? 'Booking'}
              </div>
              <div style={{ fontSize: 13, color: 'var(--bp-muted)', marginTop: 2 }}>{b.providerName}</div>
            </div>
            <StatusBadge status={b.status} />
          </div>
          {b.diagnosis?.summary && (
            <div style={{ fontSize: 13, color: 'var(--bp-muted)', lineHeight: 1.5, marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {b.diagnosis.summary}
            </div>
          )}
          <div style={{ display: 'flex', gap: 12, fontSize: 12, color: 'var(--bp-subtle)' }}>
            <span>{new Date(b.confirmedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
            {b.quotedPrice && <span style={{ color: G, fontWeight: 600 }}>{b.quotedPrice}</span>}
            {b.availability && <span>{b.availability}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Sub-page: Calendar ─────────────────────────────────────────────────── */

function CalendarSubPage({ workspaceId, propertyId }: { workspaceId: string; propertyId: string }) {
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const now = new Date();
    const from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const futureDate = new Date(now.getFullYear(), now.getMonth() + 2, 0);
    const to = `${futureDate.getFullYear()}-${String(futureDate.getMonth() + 1).padStart(2, '0')}-${String(futureDate.getDate()).padStart(2, '0')}`;
    businessService.getPropertyReservations(workspaceId, propertyId, from, to)
      .then(res => { if (res.data) setReservations(res.data.reservations); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [workspaceId, propertyId]);

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--bp-subtle)', fontSize: 13 }}>Loading calendar...</div>;

  return (
    <div>
      <div style={{ fontFamily: 'Fraunces, serif', fontSize: 16, fontWeight: 600, color: 'var(--bp-text)', marginBottom: 16 }}>
        Reservations
      </div>
      {reservations.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 20px', background: 'var(--bp-hover)', borderRadius: 10, color: 'var(--bp-subtle)', fontSize: 13 }}>
          No upcoming reservations
        </div>
      ) : (
        <MiniCalendar reservations={reservations} />
      )}
      {reservations.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--bp-text)', marginBottom: 10 }}>Upcoming</div>
          {reservations
            .filter(r => new Date(r.checkIn) >= new Date())
            .sort((a, b) => new Date(a.checkIn).getTime() - new Date(b.checkIn).getTime())
            .slice(0, 10)
            .map(r => (
              <div key={r.id} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '10px 0', borderBottom: '1px solid var(--bp-border)', fontSize: 13,
              }}>
                <div>
                  <div style={{ fontWeight: 500, color: 'var(--bp-text)' }}>{r.guestName || 'Guest'}</div>
                  <div style={{ color: 'var(--bp-subtle)', fontSize: 12, marginTop: 2 }}>
                    {new Date(r.checkIn).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - {new Date(r.checkOut).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </div>
                </div>
                <StatusBadge status={r.status} />
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

/* ── Sub-page: Providers ────────────────────────────────────────────────── */

function ProvidersSubPage({ vendors, loading }: { vendors: PreferredVendor[]; loading: boolean }) {
  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--bp-subtle)', fontSize: 13 }}>Loading providers...</div>;

  if (vendors.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--bp-subtle)' }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>&#128100;</div>
        <div style={{ fontSize: 14, fontWeight: 500 }}>No providers assigned</div>
        <div style={{ fontSize: 13, marginTop: 4 }}>Preferred providers for this property will appear here.</div>
      </div>
    );
  }

  function categoryLabel(val: string): string {
    return VENDOR_CATEGORIES.find(c => c.value === val)?.label ?? val;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {vendors.map(v => (
        <div key={v.id} style={{
          background: 'var(--bp-card)', border: '1px solid var(--bp-border)', borderRadius: 10,
          padding: '14px 16px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--bp-text)' }}>{v.providerName}</div>
              {v.providerPhone && <div style={{ fontSize: 12, color: 'var(--bp-muted)', marginTop: 2 }}>{v.providerPhone}</div>}
            </div>
            <span style={{
              fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 100,
              background: v.active ? '#F0FDF4' : '#F5F5F5',
              color: v.active ? '#16A34A' : '#9B9490',
            }}>
              {v.active ? 'Active' : 'Inactive'}
            </span>
          </div>
          {v.categories && v.categories.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
              {v.categories.map(cat => (
                <span key={cat} style={{
                  fontSize: 11, padding: '2px 8px', borderRadius: 100,
                  background: '#EFF6FF', color: '#2563EB', fontWeight: 500,
                }}>
                  {categoryLabel(cat)}
                </span>
              ))}
            </div>
          )}
          {v.notes && <div style={{ fontSize: 12, color: 'var(--bp-subtle)', marginTop: 6, fontStyle: 'italic' }}>{v.notes}</div>}
        </div>
      ))}
    </div>
  );
}

/* ── Sub-page: Settings ─────────────────────────────────────────────────── */

function SettingsSubPage({ property, onEdit }: { property: Property; onEdit?: () => void }) {
  const infoRow = (label: string, value: string | number | null | undefined) => {
    if (value == null || value === '' || value === 0) return null;
    return (
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--bp-border)' }}>
        <span style={{ fontSize: 13, color: 'var(--bp-subtle)' }}>{label}</span>
        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--bp-text)', textAlign: 'right', maxWidth: '60%' }}>{value}</span>
      </div>
    );
  };

  const sectionHeader = (title: string, icon: string) => (
    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--bp-text)', marginBottom: 10, marginTop: 20, display: 'flex', alignItems: 'center', gap: 6 }}>
      <span>{icon}</span> {title}
    </div>
  );

  const card = (children: React.ReactNode) => (
    <div style={{ background: 'var(--bp-card)', border: '1px solid var(--bp-border)', borderRadius: 10, padding: '4px 16px' }}>
      {children}
    </div>
  );

  const d = property.details;
  const dx = d as Record<string, unknown> | null;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div style={{ fontFamily: 'Fraunces, serif', fontSize: 16, fontWeight: 600, color: 'var(--bp-text)' }}>
          Property Details
        </div>
        {onEdit && (
          <button onClick={onEdit} style={{
            padding: '6px 16px', borderRadius: 8, border: '1px solid var(--bp-border)',
            background: 'var(--bp-card)', color: 'var(--bp-text)', cursor: 'pointer',
            fontSize: 13, fontWeight: 500,
          }}>
            Edit
          </button>
        )}
      </div>

      {/* General */}
      {card(<>
        {infoRow('Property Type', PROPERTY_TYPES[property.propertyType] || property.propertyType)}
        {infoRow('Address', [property.address, property.city, property.state, property.zipCode].filter(Boolean).join(', '))}
        {infoRow('Bedrooms', property.bedrooms)}
        {infoRow('Bathrooms', property.bathrooms)}
        {infoRow('Square Feet', property.sqft ? property.sqft.toLocaleString() : null)}
        {infoRow('Unit Count', property.unitCount > 1 ? property.unitCount : null)}
        {infoRow('Status', property.active ? 'Active' : 'Inactive')}
      </>)}

      {/* Bed Configuration */}
      {property.beds && property.beds.length > 0 && (<>
        {sectionHeader('Bed Configuration', '🛏️')}
        {card(<>
          {property.beds.map((b, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: i < property.beds!.length - 1 ? '1px solid var(--bp-border)' : 'none' }}>
              <span style={{ fontSize: 13, color: 'var(--bp-subtle)', textTransform: 'capitalize' }}>{b.type.replace('_', ' ')}</span>
              <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--bp-text)' }}>x{b.count}</span>
            </div>
          ))}
        </>)}
      </>)}

      {/* HVAC */}
      {d?.hvac && Object.values(d.hvac).some(Boolean) && (<>
        {sectionHeader('HVAC / Climate', '🌡️')}
        {card(<>
          {infoRow('AC Type', d.hvac.acType)}
          {infoRow('AC Brand', d.hvac.acBrand)}
          {infoRow('AC Model', d.hvac.acModel)}
          {infoRow('AC Age', d.hvac.acAge)}
          {infoRow('Heating Type', d.hvac.heatingType)}
          {infoRow('Heating Brand', d.hvac.heatingBrand)}
          {infoRow('Heating Model', d.hvac.heatingModel)}
          {infoRow('Thermostat Brand', d.hvac.thermostatBrand)}
          {infoRow('Thermostat Model', d.hvac.thermostatModel)}
          {infoRow('Filter Size', d.hvac.filterSize)}
        </>)}
      </>)}

      {/* Water Heater */}
      {d?.waterHeater && Object.values(d.waterHeater).some(v => !!v) && (<>
        {sectionHeader('Water Heater', '🔥')}
        {card(<>
          {infoRow('Type', d.waterHeater.type)}
          {infoRow('Brand', d.waterHeater.brand)}
          {infoRow('Model', d.waterHeater.model)}
          {infoRow('Age', d.waterHeater.age)}
          {infoRow('Fuel', d.waterHeater.fuel)}
          {infoRow('Capacity', d.waterHeater.capacity)}
          {infoRow('Location', d.waterHeater.location)}
        </>)}
      </>)}

      {/* Appliances */}
      {d?.appliances && Object.values(d.appliances).some(Boolean) && (<>
        {sectionHeader('Appliances', '🍳')}
        {card(<>
          {d.appliances.refrigerator && (d.appliances.refrigerator.brand || d.appliances.refrigerator.model) && infoRow('Refrigerator', [d.appliances.refrigerator.brand, d.appliances.refrigerator.model].filter(Boolean).join(' — '))}
          {d.appliances.washer && (d.appliances.washer.brand || d.appliances.washer.model) && infoRow('Washer', [d.appliances.washer.brand, d.appliances.washer.model].filter(Boolean).join(' — '))}
          {d.appliances.dryer && (d.appliances.dryer.brand || d.appliances.dryer.model) && infoRow('Dryer', [d.appliances.dryer.brand, d.appliances.dryer.model, d.appliances.dryer.fuel].filter(Boolean).join(' — '))}
          {d.appliances.dishwasher && (d.appliances.dishwasher.brand || d.appliances.dishwasher.model) && infoRow('Dishwasher', [d.appliances.dishwasher.brand, d.appliances.dishwasher.model].filter(Boolean).join(' — '))}
          {d.appliances.oven && (d.appliances.oven.brand || d.appliances.oven.model) && infoRow('Oven', [d.appliances.oven.brand, d.appliances.oven.model, d.appliances.oven.fuel].filter(Boolean).join(' — '))}
          {d.appliances.disposal?.brand && infoRow('Disposal', d.appliances.disposal.brand)}
          {d.appliances.microwave && (d.appliances.microwave.brand || d.appliances.microwave.type) && infoRow('Microwave', [d.appliances.microwave.brand, d.appliances.microwave.type].filter(Boolean).join(' — '))}
        </>)}
      </>)}

      {/* Plumbing */}
      {d?.plumbing && Object.values(d.plumbing).some(Boolean) && (<>
        {sectionHeader('Plumbing', '🚿')}
        {card(<>
          {infoRow('Kitchen Faucet', d.plumbing.kitchenFaucetBrand)}
          {infoRow('Bathroom Faucet', d.plumbing.bathroomFaucetBrand)}
          {infoRow('Toilet Brand', d.plumbing.toiletBrand)}
          {infoRow('Water Softener', d.plumbing.waterSoftener)}
          {infoRow('Septic / Sewer', d.plumbing.septicOrSewer)}
          {infoRow('Main Shutoff', d.plumbing.mainShutoffLocation)}
        </>)}
      </>)}

      {/* Electrical */}
      {d?.electrical && Object.values(d.electrical).some(Boolean) && (<>
        {sectionHeader('Electrical', '💡')}
        {card(<>
          {infoRow('Breaker Box', d.electrical.breakerBoxLocation)}
          {infoRow('Panel Amperage', d.electrical.panelAmperage)}
          {infoRow('Generator', d.electrical.hasGenerator ? (d.electrical.generatorType || 'Yes') : null)}
          {infoRow('Solar', d.electrical.hasSolar ? (d.electrical.solarSystem || 'Yes') : null)}
          {infoRow('EV Charger', d.electrical.hasEvCharger ? (d.electrical.evChargerBrand || 'Yes') : null)}
        </>)}
      </>)}

      {/* Pool / Spa */}
      {(() => { const pool = dx?.pool as Record<string, string> | undefined; return pool && Object.values(pool).some(Boolean) ? (<>
        {sectionHeader('Pool / Spa', '🏊')}
        {card(<>
          {infoRow('Pool Type', pool.type)}
          {infoRow('Heating', pool.heating)}
          {infoRow('Equipment', pool.equipment)}
        </>)}
      </>) : null; })()}

      {/* Exterior */}
      {(() => { const ext = dx?.exterior as Record<string, string> | undefined; return ext && Object.values(ext).some(Boolean) ? (<>
        {sectionHeader('Exterior', '🏡')}
        {card(<>
          {infoRow('Roof Type', ext.roofType)}
          {infoRow('Siding', ext.siding)}
          {infoRow('Fence', ext.fence)}
          {infoRow('Garage Door', ext.garageDoor)}
          {infoRow('Irrigation', ext.irrigation)}
        </>)}
      </>) : null; })()}

      {/* Access */}
      {(() => { const acc = dx?.access as Record<string, string> | undefined; return acc && Object.values(acc).some(Boolean) ? (<>
        {sectionHeader('Access', '🔑')}
        {card(<>
          {infoRow('Lockbox', acc.lockbox)}
          {infoRow('Gate Code', acc.gate)}
          {infoRow('Alarm Code', acc.alarm)}
          {infoRow('WiFi', acc.wifi)}
        </>)}
      </>) : null; })()}

      {/* Notes */}
      {property.notes && (<>
        {sectionHeader('Notes', '📝')}
        <div style={{
          background: 'var(--bp-card)', border: '1px solid var(--bp-border)', borderRadius: 10,
          padding: 16, fontSize: 13, color: 'var(--bp-muted)', lineHeight: 1.6, whiteSpace: 'pre-wrap',
        }}>
          {property.notes}
        </div>
      </>)}
    </div>
  );
}

/* ── Main Component ─────────────────────────────────────────────────────── */

export default function PropertyDetailView({ workspaceId, property, plan: _plan, onBack, onEditProperty }: PropertyDetailViewProps) {
  const [activePage, setActivePage] = useState<SubPage>('activity');
  const [dispatches, setDispatches] = useState<WorkspaceDispatch[]>([]);
  const [bookings, setBookings] = useState<WorkspaceBooking[]>([]);
  const [vendors, setVendors] = useState<PreferredVendor[]>([]);
  const [loadingDispatches, setLoadingDispatches] = useState(true);
  const [loadingBookings, setLoadingBookings] = useState(true);
  const [loadingVendors, setLoadingVendors] = useState(true);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  // Fetch dispatches filtered to this property
  useEffect(() => {
    setLoadingDispatches(true);
    businessService.listDispatches(workspaceId)
      .then(res => {
        if (res.data) {
          setDispatches(res.data.filter(d => d.propertyId === property.id));
        }
      })
      .catch(() => {})
      .finally(() => setLoadingDispatches(false));
  }, [workspaceId, property.id]);

  // Fetch bookings filtered to this property
  useEffect(() => {
    setLoadingBookings(true);
    businessService.listBookings(workspaceId)
      .then(res => {
        if (res.data) {
          setBookings(res.data.bookings.filter(b => b.propertyId === property.id));
        }
      })
      .catch(() => {})
      .finally(() => setLoadingBookings(false));
  }, [workspaceId, property.id]);

  // Fetch vendors filtered to this property
  useEffect(() => {
    setLoadingVendors(true);
    businessService.listVendors(workspaceId)
      .then(res => {
        if (res.data) {
          setVendors(res.data.filter(v => v.propertyId === property.id || v.propertyId === null));
        }
      })
      .catch(() => {})
      .finally(() => setLoadingVendors(false));
  }, [workspaceId, property.id]);

  const addressLine = [property.address, property.city, property.state].filter(Boolean).join(', ');
  const hasPhoto = property.photoUrls && property.photoUrls.length > 0;

  function renderContent() {
    switch (activePage) {
      case 'activity':
        return <ActivitySubPage dispatches={dispatches} bookings={bookings} loading={loadingDispatches || loadingBookings} />;
      case 'jobs':
        return <JobsSubPage dispatches={dispatches} loading={loadingDispatches} />;
      case 'bookings':
        return <BookingsSubPage bookings={bookings} loading={loadingBookings} />;
      case 'calendar':
        return <CalendarSubPage workspaceId={workspaceId} propertyId={property.id} />;
      case 'providers':
        return <ProvidersSubPage vendors={vendors} loading={loadingVendors} />;
      case 'settings':
        return <SettingsSubPage property={property} onEdit={onEditProperty ? () => onEditProperty(property) : undefined} />;
    }
  }

  /* ── Drawer content (shared between desktop and mobile) ─── */

  const drawerContent = (
    <>
      {/* Back button */}
      <div style={{
        height: 48, display: 'flex', alignItems: 'center', padding: '0 16px',
        borderBottom: '1px solid var(--bp-border)', flexShrink: 0,
      }}>
        <button onClick={() => { setMobileDrawerOpen(false); onBack(); }} style={{
          display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none',
          cursor: 'pointer', color: 'var(--bp-muted)', fontSize: 13, fontWeight: 500,
          fontFamily: "'DM Sans',sans-serif", padding: '4px 8px', borderRadius: 6,
        }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bp-hover)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
        >
          <BackArrow /> Back to Properties
        </button>
      </div>

      {/* Property photo */}
      <div style={{
        width: '100%', height: 140, flexShrink: 0, overflow: 'hidden',
        background: hasPhoto ? 'transparent' : `linear-gradient(135deg, ${O}30, ${G}20)`,
      }}>
        {hasPhoto ? (
          <img
            src={property.photoUrls![0]}
            alt={property.name}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        ) : (
          <div style={{
            width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 40, opacity: 0.5,
          }}>
            &#127968;
          </div>
        )}
      </div>

      {/* Property info */}
      <div style={{ padding: '16px 20px 12px', flexShrink: 0 }}>
        <div style={{ fontFamily: 'Fraunces, serif', fontSize: 16, fontWeight: 700, color: 'var(--bp-text)', lineHeight: 1.3 }}>
          {property.name}
        </div>
        {addressLine && (
          <div style={{ fontSize: 12, color: 'var(--bp-subtle)', marginTop: 4, lineHeight: 1.4 }}>
            {addressLine}
          </div>
        )}
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: 'var(--bp-border)', margin: '0 16px', flexShrink: 0 }} />

      {/* Nav menu */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 8px' }}>
        {NAV_ITEMS.map(item => {
          const isActive = activePage === item.id;
          return (
            <button
              key={item.id}
              onClick={() => { setActivePage(item.id); setMobileDrawerOpen(false); }}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 12px', background: isActive ? `${O}10` : 'transparent',
                color: isActive ? O : 'var(--bp-muted)', border: 'none', borderRadius: 10,
                cursor: 'pointer', fontSize: 14, fontFamily: "'DM Sans',sans-serif",
                fontWeight: isActive ? 600 : 500, transition: 'all 0.15s',
              }}
              onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'var(--bp-hover)'; }}
              onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
            >
              <span style={{ flexShrink: 0, display: 'flex' }}><NavIcon name={item.id} /></span>
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
    </>
  );

  return (
    <div style={{ display: 'flex', height: '100%', minHeight: 0 }}>
      <style>{`
        .bp-pdv-drawer-desktop { display: flex; }
        .bp-pdv-mobile-overlay { display: none; }
        .bp-pdv-hamburger { display: none; }
        @media (max-width: 768px) {
          .bp-pdv-drawer-desktop { display: none !important; }
          .bp-pdv-mobile-overlay { display: flex; }
          .bp-pdv-hamburger { display: flex !important; }
        }
      `}</style>

      {/* Desktop drawer */}
      <div className="bp-pdv-drawer-desktop" style={{
        width: 252, minWidth: 252, height: '100%', background: 'var(--bp-card)',
        borderRight: '1px solid var(--bp-border)', display: 'flex', flexDirection: 'column',
        flexShrink: 0, overflow: 'hidden',
      }}>
        {drawerContent}
      </div>

      {/* Mobile drawer overlay */}
      <div className="bp-pdv-mobile-overlay" style={{
        position: 'fixed', inset: 0, zIndex: 100,
        pointerEvents: mobileDrawerOpen ? 'auto' : 'none',
      }}>
        <div
          onClick={() => setMobileDrawerOpen(false)}
          style={{
            position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)',
            opacity: mobileDrawerOpen ? 1 : 0, transition: 'opacity 0.3s',
          }}
        />
        <div style={{
          position: 'relative', transform: mobileDrawerOpen ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 0.3s ease', height: '100%', zIndex: 1, width: 280,
          background: 'var(--bp-card)', display: 'flex', flexDirection: 'column',
        }}>
          {drawerContent}
        </div>
      </div>

      {/* Main content */}
      <div style={{ flex: 1, overflowY: 'auto', minWidth: 0 }}>
        {/* Mobile header with hamburger */}
        <div className="bp-pdv-hamburger" style={{
          display: 'none', alignItems: 'center', gap: 12, padding: '12px 16px',
          borderBottom: '1px solid var(--bp-border)', background: 'var(--bp-card)',
        }}>
          <button onClick={() => setMobileDrawerOpen(true)} style={{
            background: 'none', border: 'none', cursor: 'pointer', color: 'var(--bp-text)',
            padding: 4, display: 'flex', alignItems: 'center',
          }}>
            <svg width={20} height={20} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
              <path d="M3 5h14" /><path d="M3 10h14" /><path d="M3 15h14" />
            </svg>
          </button>
          <span style={{ fontFamily: 'Fraunces, serif', fontSize: 16, fontWeight: 600, color: 'var(--bp-text)' }}>
            {property.name}
          </span>
        </div>

        {/* Sub-page heading + content */}
        <div style={{ padding: '24px 32px', maxWidth: 900 }} className="bp-content-padding">
          <h3 style={{ fontFamily: 'Fraunces, serif', fontSize: 20, color: 'var(--bp-text)', margin: '0 0 20px' }}>
            {NAV_ITEMS.find(n => n.id === activePage)?.label ?? 'Activity'}
          </h3>
          {renderContent()}
        </div>
      </div>
    </div>
  );
}
