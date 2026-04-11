import { useState, useEffect, useRef } from 'react';
import { businessService, type Property, type PropertyScan, type PropertyInventoryItem, type PropertyInventoryResponse, type MaintenanceFlag } from '@/services/api';

const O = '#E8632B', G = '#1B9E77', D = '#2D2926', W = '#F9F5F2';

/* ── Helpers ────────────────────────────────────────────────────────────── */

function fmtConfidence(score: string): string {
  return `${Math.round(parseFloat(score) * 100)}%`;
}

function ageColor(age: number | null | undefined): string {
  if (age === null || age === undefined) return '#9B9490';
  if (age < 5) return G;
  if (age < 10) return '#6B6560';
  if (age < 15) return '#D4A437';
  return '#E24B4A';
}

function categoryIcon(cat: string): string {
  const icons: Record<string, string> = {
    appliance: '\uD83C\uDFE0',
    fixture: '\uD83D\uDEBF',
    system: '\u2699\uFE0F',
    safety: '\uD83D\uDEA8',
    amenity: '\uD83C\uDFD6\uFE0F',
    infrastructure: '\uD83D\uDD27',
  };
  return icons[cat] || '\uD83D\uDCE6';
}

function prettifyItemType(type: string): string {
  return type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function formatRelativeDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

/* ── PropertyScanCard ───────────────────────────────────────────────────── */

export function PropertyScanCard({ workspaceId, property, plan, onScanStart, onViewInventory }: {
  workspaceId: string;
  property: Property;
  plan: string;
  onScanStart?: (scanId: string) => void;
  onViewInventory?: () => void;
}) {
  const [history, setHistory] = useState<PropertyScan[]>([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);

  const isPro = ['professional', 'business', 'enterprise'].includes(plan);

  useEffect(() => {
    setLoading(true);
    businessService.getScanHistory(workspaceId, property.id)
      .then(res => { if (res.data) setHistory(res.data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [workspaceId, property.id]);

  if (loading) return null;

  const latest = history.find(s => s.status === 'completed' || s.status === 'review_pending');

  async function handleStartScan() {
    if (!isPro) return;
    setStarting(true);
    try {
      const res = await businessService.startPropertyScan(workspaceId, property.id, 'full');
      if (res.data && onScanStart) onScanStart(res.data.id);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to start scan');
    }
    setStarting(false);
  }

  if (!isPro) {
    return (
      <div style={{
        background: 'var(--bp-card)', borderRadius: 12, border: '1px dashed var(--bp-border)',
        padding: 24, marginBottom: 20, textAlign: 'center', opacity: 0.85,
      }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>{'\uD83D\uDCF1'}</div>
        <div style={{ fontFamily: 'Fraunces, serif', fontSize: 16, fontWeight: 600, color: 'var(--bp-text)', marginBottom: 6 }}>
          AI Property Scan
        </div>
        <div style={{ fontSize: 13, color: 'var(--bp-subtle)', maxWidth: 400, margin: '0 auto 14px', lineHeight: 1.5 }}>
          Walk through your property with your camera and let AI catalog every appliance, fixture, and system automatically.
        </div>
        <div style={{ fontSize: 12, color: O, fontWeight: 600 }}>
          Upgrade to Professional to use AI Property Scan
        </div>
      </div>
    );
  }

  if (!latest) {
    return (
      <div style={{
        background: 'var(--bp-card)', borderRadius: 12, border: '1px solid var(--bp-border)',
        padding: 24, marginBottom: 20, textAlign: 'center',
      }}>
        <div style={{ fontSize: 36, marginBottom: 10 }}>{'\uD83D\uDCF1'}</div>
        <div style={{ fontFamily: 'Fraunces, serif', fontSize: 18, fontWeight: 600, color: 'var(--bp-text)', marginBottom: 6 }}>
          Give your Homie a tour
        </div>
        <div style={{ fontSize: 13, color: 'var(--bp-subtle)', maxWidth: 440, margin: '0 auto 18px', lineHeight: 1.5 }}>
          Walk through the property with your camera. The AI catalogs appliances, systems, and features automatically. Takes about 10–15 minutes.
        </div>
        <button
          onClick={handleStartScan}
          disabled={starting}
          style={{
            padding: '12px 28px', borderRadius: 10, border: 'none',
            background: O, color: '#fff', fontSize: 14, fontWeight: 600,
            cursor: starting ? 'default' : 'pointer', opacity: starting ? 0.6 : 1,
            fontFamily: "'DM Sans', sans-serif",
          }}
        >
          {starting ? 'Starting...' : 'Start property scan'}
        </button>
      </div>
    );
  }

  return (
    <div style={{
      background: 'var(--bp-card)', borderRadius: 12, border: '1px solid var(--bp-border)',
      padding: 18, marginBottom: 20,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <span style={{ fontSize: 22 }}>{'\uD83D\uDCF1'}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: 'Fraunces, serif', fontSize: 15, fontWeight: 700, color: 'var(--bp-text)' }}>
            Property profile
          </div>
          <div style={{ fontSize: 11, color: 'var(--bp-subtle)' }}>
            Last scanned {formatRelativeDate(latest.completedAt || latest.createdAt)}
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 16, marginBottom: 14, fontSize: 12, color: 'var(--bp-muted)' }}>
        <span><strong style={{ color: 'var(--bp-text)' }}>{latest.itemsCataloged}</strong> items</span>
        <span>·</span>
        <span><strong style={{ color: G }}>{latest.itemsConfirmed}</strong> confirmed</span>
        {latest.itemsFlaggedForReview > 0 && (
          <>
            <span>·</span>
            <span><strong style={{ color: '#D4A437' }}>{latest.itemsFlaggedForReview}</strong> flagged</span>
          </>
        )}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          onClick={onViewInventory}
          style={{
            padding: '8px 18px', borderRadius: 8, border: '1px solid var(--bp-border)',
            background: 'var(--bp-card)', color: 'var(--bp-text)', fontSize: 12, fontWeight: 600,
            cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
          }}
        >
          View inventory
        </button>
        <button
          onClick={handleStartScan}
          disabled={starting}
          style={{
            padding: '8px 18px', borderRadius: 8, border: 'none',
            background: O, color: '#fff', fontSize: 12, fontWeight: 600,
            cursor: starting ? 'default' : 'pointer', opacity: starting ? 0.6 : 1,
            fontFamily: "'DM Sans', sans-serif",
          }}
        >
          Rescan property
        </button>
      </div>
    </div>
  );
}

/* ── ScanCaptureModal ───────────────────────────────────────────────────── */

const ROOM_OPTIONS = [
  'kitchen', 'living_room', 'dining_room', 'master_bedroom', 'bedroom',
  'master_bathroom', 'bathroom', 'half_bathroom', 'laundry', 'garage',
  'office', 'hallway', 'pool_area', 'patio', 'exterior_front', 'exterior_back',
  'mechanical_room', 'other',
];

export function ScanCaptureModal({ workspaceId, scanId, propertyName, onClose, onComplete }: {
  workspaceId: string;
  scanId: string;
  propertyName: string;
  onClose: () => void;
  onComplete: () => void;
}) {
  const [currentRoom, setCurrentRoom] = useState<string>('kitchen');
  const [isLabel, setIsLabel] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [detected, setDetected] = useState<Array<{ id: string; itemType: string; brand: string | null; modelNumber: string | null; confidence: number; roomType: string }>>([]);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length === 0) return;

    setError(null);
    setUploading(true);
    for (const file of files) {
      try {
        if (file.size > 8 * 1024 * 1024) { setError('Photo too large (max 8MB)'); continue; }
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => reject(new Error('read failed'));
          reader.readAsDataURL(file);
        });
        // Downscale before upload
        const compressed = await compressImage(dataUrl, 1600, 0.85);
        const res = await businessService.uploadScanPhoto(workspaceId, scanId, {
          image_data_url: compressed,
          room_hint: currentRoom,
          is_label_photo: isLabel,
        });
        if (res.data) {
          for (const item of res.data.itemsDetected) {
            setDetected(prev => [...prev, { ...item, roomType: res.data!.roomType }]);
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Upload failed');
      }
    }
    setUploading(false);
  }

  async function handleComplete() {
    setCompleting(true);
    try {
      await businessService.completePropertyScan(workspaceId, scanId);
      onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to complete scan');
    }
    setCompleting(false);
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 560, maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', fontFamily: "'DM Sans', sans-serif" }}>
        <div style={{ padding: '18px 20px', borderBottom: '1px solid #F0EBE6', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontFamily: 'Fraunces, serif', fontSize: 18, fontWeight: 700, color: D }}>Property scan</div>
            <div style={{ fontSize: 11, color: '#9B9490' }}>{propertyName}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#9B9490' }}>×</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
          <div style={{ background: W, borderRadius: 10, padding: 14, marginBottom: 16, fontSize: 13, color: '#6B6560', lineHeight: 1.5 }}>
            Walk through the property and upload photos one room at a time. The AI will identify appliances, systems, and fixtures from each photo. For best results, capture labels and nameplates closely.
          </div>

          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#6B6560', marginBottom: 6 }}>Current room</label>
          <select
            value={currentRoom}
            onChange={e => setCurrentRoom(e.target.value)}
            style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #E0DAD4', fontSize: 13, marginBottom: 14, background: '#fff' }}
          >
            {ROOM_OPTIONS.map(r => <option key={r} value={r}>{prettifyItemType(r)}</option>)}
          </select>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, cursor: 'pointer' }}>
            <input type="checkbox" checked={isLabel} onChange={e => setIsLabel(e.target.checked)} />
            <span style={{ fontSize: 12, color: '#6B6560' }}>Close-up of an equipment label / nameplate</span>
          </label>

          <input ref={fileInputRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={handleFileSelect} />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            style={{
              width: '100%', padding: '14px 0', borderRadius: 10, border: `2px dashed ${O}40`,
              background: `${O}05`, color: O, fontSize: 14, fontWeight: 600,
              cursor: uploading ? 'default' : 'pointer', opacity: uploading ? 0.6 : 1,
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            {uploading ? 'Processing...' : '+ Add photo(s) for this room'}
          </button>

          {error && (
            <div style={{ marginTop: 10, padding: 10, borderRadius: 8, background: '#FEF2F2', color: '#991B1B', fontSize: 12 }}>
              {error}
            </div>
          )}

          {detected.length > 0 && (
            <>
              <div style={{ marginTop: 20, marginBottom: 10, fontSize: 13, fontWeight: 700, color: D }}>
                Items detected this session ({detected.length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 240, overflowY: 'auto' }}>
                {detected.map((item, i) => (
                  <div key={`${item.id}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: W, borderRadius: 8, fontSize: 12 }}>
                    <span style={{
                      width: 6, height: 6, borderRadius: '50%',
                      background: item.confidence >= 0.85 ? G : '#D4A437',
                    }} />
                    <span style={{ fontWeight: 600, color: D }}>
                      {item.brand ? `${item.brand} ` : ''}{prettifyItemType(item.itemType)}
                    </span>
                    {item.modelNumber && <span style={{ color: '#9B9490' }}>· {item.modelNumber}</span>}
                    <span style={{ marginLeft: 'auto', fontSize: 10, color: '#9B9490' }}>
                      {Math.round(item.confidence * 100)}%
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div style={{ padding: '14px 20px', borderTop: '1px solid #F0EBE6', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '10px 18px', borderRadius: 8, border: '1px solid #E0DAD4', background: '#fff', color: '#6B6560', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            Cancel
          </button>
          <button
            onClick={handleComplete}
            disabled={completing || detected.length === 0}
            style={{
              padding: '10px 22px', borderRadius: 8, border: 'none',
              background: O, color: '#fff', fontSize: 13, fontWeight: 600,
              cursor: completing || detected.length === 0 ? 'default' : 'pointer',
              opacity: completing || detected.length === 0 ? 0.5 : 1,
            }}
          >
            {completing ? 'Finalizing...' : 'Finish scan'}
          </button>
        </div>
      </div>
    </div>
  );
}

async function compressImage(dataUrl: string, maxDim: number, quality: number): Promise<string> {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        const ratio = Math.min(maxDim / width, maxDim / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) { resolve(dataUrl); return; }
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

/* ── PropertyInventoryView ──────────────────────────────────────────────── */

export function PropertyInventoryView({ workspaceId, propertyId, onClose }: {
  workspaceId: string;
  propertyId: string;
  onClose: () => void;
}) {
  const [data, setData] = useState<PropertyInventoryResponse | null>(null);
  const [flags, setFlags] = useState<MaintenanceFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'appliance' | 'fixture' | 'system' | 'safety' | 'amenity'>('all');

  async function load() {
    setLoading(true);
    try {
      const [invRes, flagsRes] = await Promise.all([
        businessService.getPropertyInventory(workspaceId, propertyId),
        businessService.getMaintenanceFlags(workspaceId, propertyId),
      ]);
      if (invRes.data) setData(invRes.data);
      if (flagsRes.data) setFlags(flagsRes.data);
    } catch { /* ignore */ }
    setLoading(false);
  }

  useEffect(() => { load(); }, [workspaceId, propertyId]);

  async function handleUpdate(item: PropertyInventoryItem, status: 'pm_confirmed' | 'pm_dismissed') {
    try {
      await businessService.updateInventoryItem(workspaceId, item.id, { status });
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update');
    }
  }

  if (loading) {
    return (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ background: '#fff', padding: 32, borderRadius: 12, color: '#9B9490' }}>Loading inventory...</div>
      </div>
    );
  }

  if (!data) return null;

  const allItems = data.rooms.flatMap(r => r.items.map(i => ({ ...i, roomLabel: r.roomLabel })))
    .concat(data.unassignedItems.map(i => ({ ...i, roomLabel: 'Unassigned' })));

  const filtered = filter === 'all' ? allItems : allItems.filter(i => i.category === filter);

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 820, maxHeight: '92vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', fontFamily: "'DM Sans', sans-serif" }}>
        <div style={{ padding: '18px 22px', borderBottom: '1px solid #F0EBE6', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontFamily: 'Fraunces, serif', fontSize: 20, fontWeight: 700, color: D }}>Property inventory</div>
            <div style={{ fontSize: 12, color: '#9B9490' }}>
              {data.summary.totalItems} items
              {data.summary.averageAge !== null && ` · avg age ${data.summary.averageAge} yrs`}
              {data.summary.agingItems > 0 && ` · ${data.summary.agingItems} aging`}
              {data.summary.safetyFlags > 0 && ` · ${data.summary.safetyFlags} safety flags`}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#9B9490' }}>×</button>
        </div>

        {/* Filter tabs */}
        <div style={{ display: 'flex', gap: 6, padding: '12px 22px', borderBottom: '1px solid #F0EBE6', overflowX: 'auto' }}>
          {(['all', 'appliance', 'fixture', 'system', 'safety', 'amenity'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{
              padding: '6px 14px', borderRadius: 100,
              border: filter === f ? `1px solid ${O}` : '1px solid #E0DAD4',
              background: filter === f ? `${O}10` : '#fff',
              color: filter === f ? O : '#6B6560',
              fontSize: 12, fontWeight: 600, cursor: 'pointer',
              textTransform: 'capitalize', fontFamily: "'DM Sans', sans-serif",
            }}>
              {f}
            </button>
          ))}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
          {/* Maintenance flags */}
          {flags.length > 0 && (
            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#6B6560', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Maintenance flags ({flags.length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {flags.map(f => (
                  <div key={f.itemId} style={{
                    padding: '12px 14px', borderRadius: 10,
                    background: f.severity === 'urgent' ? '#FEF2F2' : f.severity === 'attention' ? '#FFF8F0' : '#EFF6FF',
                    border: `1px solid ${f.severity === 'urgent' ? '#FECACA' : f.severity === 'attention' ? '#F5C9A8' : '#BFDBFE'}`,
                    fontSize: 12, color: D,
                  }}>
                    {f.severity === 'urgent' ? '🔴 ' : f.severity === 'attention' ? '⚠️ ' : 'ℹ️ '}
                    {f.description}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Items grouped by room */}
          {data.rooms.map(room => {
            const roomItems = filter === 'all' ? room.items : room.items.filter(i => i.category === filter);
            if (roomItems.length === 0) return null;
            return (
              <div key={room.id} style={{ marginBottom: 22 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
                  <h4 style={{ fontFamily: 'Fraunces, serif', fontSize: 15, fontWeight: 700, color: D, margin: 0 }}>{room.roomLabel}</h4>
                  {room.flooringType && <span style={{ fontSize: 11, color: '#9B9490' }}>{room.flooringType}</span>}
                  <span style={{ fontSize: 11, color: '#9B9490', marginLeft: 'auto' }}>{roomItems.length} items</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {roomItems.map(item => {
                    const confidence = parseFloat(item.confidenceScore);
                    const age = item.estimatedAgeYears ? parseFloat(item.estimatedAgeYears) : null;
                    const isLowConfidence = confidence < 0.85 && item.status === 'ai_identified';
                    const borderColor = item.status === 'pm_confirmed' || item.status === 'pm_corrected' ? G
                      : isLowConfidence ? '#D4A437'
                      : '#9B9490';
                    return (
                      <div key={item.id} style={{
                        background: '#fff', borderRadius: 10, padding: '12px 14px',
                        border: '1px solid #E0DAD4', borderLeft: `4px solid ${borderColor}`,
                        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
                      }}>
                        <span style={{ fontSize: 18, width: 24, textAlign: 'center' }}>{categoryIcon(item.category)}</span>
                        <div style={{ flex: 1, minWidth: 200 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: D }}>
                            {item.brand ? `${item.brand} ` : ''}{prettifyItemType(item.itemType)}
                          </div>
                          <div style={{ fontSize: 11, color: '#9B9490', marginTop: 2, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            {item.modelNumber && <span>{item.modelNumber}</span>}
                            {age !== null && (
                              <>
                                {item.modelNumber && <span>·</span>}
                                <span style={{ color: ageColor(age), fontWeight: 600 }}>{age} yrs old</span>
                              </>
                            )}
                            {item.condition && (
                              <>
                                <span>·</span>
                                <span style={{ textTransform: 'capitalize' }}>{item.condition.replace(/_/g, ' ')}</span>
                              </>
                            )}
                            <span style={{ marginLeft: 'auto', fontSize: 10 }}>
                              {item.identificationMethod === 'label_ocr' && '🏷️'}
                              {item.identificationMethod === 'visual_classification' && '👁️'}
                              {item.identificationMethod === 'pm_manual' && '✏️'}
                              {' '}{fmtConfidence(item.confidenceScore)}
                            </span>
                          </div>
                        </div>
                        {isLowConfidence ? (
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button onClick={() => handleUpdate(item, 'pm_confirmed')} style={{
                              padding: '5px 10px', borderRadius: 6, border: 'none',
                              background: G, color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                            }}>Confirm</button>
                            <button onClick={() => handleUpdate(item, 'pm_dismissed')} style={{
                              padding: '5px 10px', borderRadius: 6, border: '1px solid #E0DAD4',
                              background: '#fff', color: '#9B9490', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                            }}>Dismiss</button>
                          </div>
                        ) : item.status === 'ai_identified' ? (
                          <span style={{ fontSize: 10, fontWeight: 700, color: G, background: `${G}15`, padding: '3px 8px', borderRadius: 100 }}>
                            ✓ HIGH CONFIDENCE
                          </span>
                        ) : (
                          <span style={{ fontSize: 10, fontWeight: 700, color: G, background: `${G}15`, padding: '3px 8px', borderRadius: 100 }}>
                            ✓ CONFIRMED
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {filtered.length === 0 && (
            <div style={{ textAlign: 'center', padding: 60, color: '#9B9490', fontSize: 13 }}>
              No items{filter !== 'all' ? ` in ${filter}` : ''} yet.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
