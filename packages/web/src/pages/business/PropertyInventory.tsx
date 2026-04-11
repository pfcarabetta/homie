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
  const [coaching, setCoaching] = useState<string>("Let's start in the kitchen. Slowly pan your camera and capture the appliances. I'll handle the rest.");
  const [error, setError] = useState<string | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Step 1: request camera access on mount
  useEffect(() => {
    let cancelled = false;
    async function openCamera() {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        setCameraError('Camera not available — falling back to file upload.');
        return;
      }
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
        if (cancelled) { s.getTracks().forEach(t => t.stop()); return; }
        setStream(s);
      } catch (err) {
        setCameraError(err instanceof Error ? err.message : 'Camera access denied');
      }
    }
    openCamera();
    return () => { cancelled = true; };
  }, []);

  // Step 2: when both the stream and video element are ready, attach + play
  useEffect(() => {
    if (!stream || !videoRef.current) return;
    const v = videoRef.current;
    v.srcObject = stream;
    // iOS Safari requires explicit play() and may require muted+playsinline
    const tryPlay = () => {
      v.play().then(() => setCameraReady(true)).catch((err: Error) => {
        // Some browsers throw if play() is interrupted — try once more
        setTimeout(() => {
          v.play().then(() => setCameraReady(true)).catch(() => {
            setCameraError(err.message || 'Could not start video playback');
          });
        }, 200);
      });
    };
    if (v.readyState >= 2) {
      tryPlay();
    } else {
      v.onloadedmetadata = tryPlay;
    }
    return () => {
      v.onloadedmetadata = null;
    };
  }, [stream]);

  // Stop the stream on unmount
  useEffect(() => {
    return () => {
      stream?.getTracks().forEach(t => t.stop());
    };
  }, [stream]);

  function showToast(text: string) {
    setToast(text);
    window.setTimeout(() => setToast(null), 2400);
  }

  async function captureAndProcess() {
    if (uploading) return;
    setError(null);

    let dataUrl: string | null = null;
    if (cameraReady && videoRef.current) {
      const v = videoRef.current;
      const canvas = document.createElement('canvas');
      canvas.width = v.videoWidth;
      canvas.height = v.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(v, 0, 0);
      dataUrl = canvas.toDataURL('image/jpeg', 0.9);
      // Downscale if huge
      if (dataUrl.length > 4_000_000) {
        dataUrl = await compressImage(dataUrl, 1600, 0.85);
      }
    }

    if (!dataUrl) {
      setError('Could not capture frame from camera.');
      return;
    }

    await processOne(dataUrl);
  }

  async function processOne(dataUrl: string) {
    setUploading(true);
    try {
      const res = await businessService.uploadScanPhoto(workspaceId, scanId, {
        image_data_url: dataUrl,
        room_hint: currentRoom,
        is_label_photo: isLabel,
      });
      if (res.data) {
        const newItems = res.data.itemsDetected;
        for (const item of newItems) {
          setDetected(prev => [...prev, { ...item, roomType: res.data!.roomType }]);
        }
        if (newItems.length > 0) {
          const summary = newItems.slice(0, 2).map(i => `${i.brand || ''} ${prettifyItemType(i.itemType)}`.trim()).join(', ');
          showToast(`Found: ${summary}${newItems.length > 2 ? ` +${newItems.length - 2} more` : ''} ✓`);
        } else {
          showToast('No items found in that frame');
        }

        // Refresh coaching based on what we just found
        try {
          const coachRes = await businessService.generateScanCoaching(workspaceId, scanId, {
            current_room: currentRoom,
            last_detected_items: newItems.map(i => ({ itemType: i.itemType, brand: i.brand, confidence: i.confidence })),
          });
          if (coachRes.data?.message) setCoaching(coachRes.data.message);
        } catch { /* ignore */ }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process photo');
    }
    setUploading(false);
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length === 0) return;
    for (const file of files) {
      if (file.size > 8 * 1024 * 1024) { setError('Photo too large (max 8MB)'); continue; }
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error('read failed'));
        reader.readAsDataURL(file);
      });
      const compressed = await compressImage(dataUrl, 1600, 0.85);
      await processOne(compressed);
    }
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

  function handleNextRoom() {
    showToast(`Moving on. Currently scanning: ${prettifyItemType(currentRoom)}`);
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000', zIndex: 9999, display: 'flex', flexDirection: 'column', fontFamily: "'DM Sans', sans-serif", color: '#fff' }}>
      {/* Camera viewfinder */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden', background: '#000' }}>
        {/* Render unconditionally so the ref is set before we attach the stream */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          {...({ 'webkit-playsinline': 'true' } as Record<string, string>)}
          style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover',
            opacity: cameraReady ? 1 : 0,
          }}
        />
        {!cameraReady && !cameraError && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9B9490', fontSize: 13 }}>
            Requesting camera access...
          </div>
        )}
        {cameraError && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32, textAlign: 'center', color: '#fff' }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>{'\uD83D\uDCF7'}</div>
            <div style={{ fontSize: 14, marginBottom: 8 }}>{cameraError}</div>
            <button onClick={() => fileInputRef.current?.click()} style={{
              marginTop: 14, padding: '10px 22px', borderRadius: 8, border: 'none', background: O, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}>Use file upload instead</button>
          </div>
        )}

        {/* Top scrim with header + AI guidance */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0,
          background: 'linear-gradient(180deg, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0) 100%)',
          padding: '14px 16px 32px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <button onClick={onClose} style={{
              background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff',
              width: 34, height: 34, borderRadius: 17, fontSize: 16, cursor: 'pointer',
            }}>×</button>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)' }}>Property scan · {propertyName}</div>
              <div style={{ fontSize: 13, fontWeight: 700, marginTop: 2 }}>
                {detected.length} item{detected.length === 1 ? '' : 's'} found · {prettifyItemType(currentRoom)}
              </div>
            </div>
            <button onClick={handleComplete} disabled={completing || detected.length === 0} style={{
              background: detected.length === 0 ? 'rgba(255,255,255,0.15)' : G,
              border: 'none', color: '#fff', padding: '8px 14px', borderRadius: 100,
              fontSize: 12, fontWeight: 600, cursor: detected.length === 0 ? 'default' : 'pointer',
              opacity: completing ? 0.5 : 1,
            }}>End scan</button>
          </div>
          {/* AI coaching text */}
          <div style={{
            background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(8px)',
            borderRadius: 12, padding: '10px 14px', fontSize: 13, lineHeight: 1.45,
            border: '1px solid rgba(255,255,255,0.1)',
          }}>
            <span style={{ fontSize: 16, marginRight: 6 }}>{'\uD83E\uDD16'}</span>
            {coaching}
          </div>
        </div>

        {/* Toast */}
        {toast && (
          <div style={{
            position: 'absolute', top: 140, left: '50%', transform: 'translateX(-50%)',
            background: 'rgba(27,158,119,0.95)', color: '#fff',
            padding: '8px 16px', borderRadius: 100, fontSize: 12, fontWeight: 600,
            boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
            animation: 'scanToast 2.4s ease',
          }}>
            {toast}
          </div>
        )}
        <style>{`@keyframes scanToast { 0% { opacity: 0; transform: translate(-50%, -8px); } 10%, 85% { opacity: 1; transform: translate(-50%, 0); } 100% { opacity: 0; transform: translate(-50%, -8px); } }`}</style>

        {error && (
          <div style={{
            position: 'absolute', bottom: 200, left: 16, right: 16,
            background: '#FEF2F2', color: '#991B1B', padding: 10, borderRadius: 8, fontSize: 12, textAlign: 'center',
          }}>
            {error}
          </div>
        )}
      </div>

      {/* Bottom action bar */}
      <div style={{
        background: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(12px)',
        padding: '14px 16px 24px', borderTop: '1px solid rgba(255,255,255,0.08)',
      }}>
        <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
          <select
            value={currentRoom}
            onChange={e => setCurrentRoom(e.target.value)}
            style={{
              flex: 1, padding: '8px 12px', borderRadius: 8,
              border: '1px solid rgba(255,255,255,0.2)',
              background: 'rgba(255,255,255,0.05)', color: '#fff',
              fontSize: 12, fontFamily: "'DM Sans', sans-serif",
            }}
          >
            {ROOM_OPTIONS.map(r => <option key={r} value={r} style={{ color: '#000' }}>{prettifyItemType(r)}</option>)}
          </select>
          <label style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 12px', borderRadius: 8,
            background: isLabel ? `${O}30` : 'rgba(255,255,255,0.05)',
            border: `1px solid ${isLabel ? O : 'rgba(255,255,255,0.2)'}`,
            cursor: 'pointer', fontSize: 11, color: isLabel ? O : 'rgba(255,255,255,0.8)',
            fontWeight: 600,
          }}>
            <input type="checkbox" checked={isLabel} onChange={e => setIsLabel(e.target.checked)} style={{ display: 'none' }} />
            🏷️ Label
          </label>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'center' }}>
          <button onClick={handleNextRoom} style={{
            background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff',
            padding: '10px 16px', borderRadius: 100, fontSize: 12, fontWeight: 600, cursor: 'pointer',
          }}>Next room</button>

          {/* Capture button */}
          <button
            onClick={captureAndProcess}
            disabled={uploading || (!cameraReady && !!cameraError === false)}
            style={{
              width: 72, height: 72, borderRadius: '50%',
              background: '#fff', border: '4px solid rgba(255,255,255,0.4)',
              cursor: uploading ? 'default' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 4px 16px rgba(255,255,255,0.2)',
              opacity: uploading ? 0.6 : 1,
            }}
            aria-label="Capture photo"
          >
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: uploading ? '#9B9490' : O }} />
          </button>

          <input ref={fileInputRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={handleFileSelect} />
          <button onClick={() => fileInputRef.current?.click()} disabled={uploading} style={{
            background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff',
            padding: '10px 16px', borderRadius: 100, fontSize: 12, fontWeight: 600, cursor: 'pointer',
          }}>Upload</button>
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

  async function handleDelete(item: PropertyInventoryItem) {
    const label = `${item.brand ? item.brand + ' ' : ''}${prettifyItemType(item.itemType)}`;
    if (!window.confirm(`Delete "${label}" from inventory? This cannot be undone.`)) return;
    try {
      await businessService.deleteInventoryItem(workspaceId, item.id);
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete');
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
    <div
      className="bp-pi-overlay"
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
        zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center',
        paddingTop: 'max(16px, env(safe-area-inset-top))',
        paddingBottom: 'max(16px, env(safe-area-inset-bottom))',
        paddingLeft: 'max(16px, env(safe-area-inset-left))',
        paddingRight: 'max(16px, env(safe-area-inset-right))',
      }}
    >
      <style>{`
        /* Use dynamic viewport height on iOS so the URL bar doesn't clip the modal */
        .bp-pi-modal {
          max-height: 92vh;
        }
        @supports (height: 100dvh) {
          .bp-pi-modal { max-height: 100dvh; }
        }
        .bp-pi-tab { flex-shrink: 0; }
        .bp-pi-tabs {
          -webkit-overflow-scrolling: touch;
          scrollbar-width: none;
        }
        .bp-pi-tabs::-webkit-scrollbar { display: none; }
        @media (max-width: 600px) {
          .bp-pi-header { padding: 14px 16px !important; gap: 10px !important; }
          .bp-pi-header-title { font-size: 17px !important; }
          .bp-pi-header-meta { font-size: 11px !important; }
          .bp-pi-tabs { padding: 10px 16px !important; }
          .bp-pi-content { padding: 14px !important; }
          .bp-pi-item { padding: 11px 12px !important; gap: 10px !important; }
          .bp-pi-item-title { font-size: 13px !important; }
          .bp-pi-item-actions { width: 100%; justify-content: flex-end; }
        }
      `}</style>
      <div
        className="bp-pi-modal"
        style={{
          background: '#fff', borderRadius: 16, width: '100%', maxWidth: 820,
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          fontFamily: "'DM Sans', sans-serif", minHeight: 0,
        }}
      >
        <div
          className="bp-pi-header"
          style={{
            padding: '18px 22px', borderBottom: '1px solid #F0EBE6',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: 12, flexShrink: 0,
          }}
        >
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="bp-pi-header-title" style={{ fontFamily: 'Fraunces, serif', fontSize: 20, fontWeight: 700, color: D, lineHeight: 1.2 }}>Property inventory</div>
            <div className="bp-pi-header-meta" style={{ fontSize: 12, color: '#9B9490', marginTop: 2, lineHeight: 1.4 }}>
              {data.summary.totalItems} items
              {data.summary.averageAge !== null && ` · avg age ${data.summary.averageAge} yrs`}
              {data.summary.agingItems > 0 && ` · ${data.summary.agingItems} aging`}
              {data.summary.safetyFlags > 0 && ` · ${data.summary.safetyFlags} flags`}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              background: 'none', border: 'none', fontSize: 26, lineHeight: 1,
              cursor: 'pointer', color: '#9B9490', padding: 4, flexShrink: 0,
              width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >×</button>
        </div>

        {/* Filter tabs */}
        <div
          className="bp-pi-tabs"
          style={{
            display: 'flex', gap: 6, padding: '12px 22px',
            borderBottom: '1px solid #F0EBE6', overflowX: 'auto', flexShrink: 0,
          }}
        >
          {(['all', 'appliance', 'fixture', 'system', 'safety', 'amenity'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)} className="bp-pi-tab" style={{
              padding: '6px 14px', borderRadius: 100,
              border: filter === f ? `1px solid ${O}` : '1px solid #E0DAD4',
              background: filter === f ? `${O}10` : '#fff',
              color: filter === f ? O : '#6B6560',
              fontSize: 12, fontWeight: 600, cursor: 'pointer',
              textTransform: 'capitalize', fontFamily: "'DM Sans', sans-serif",
              whiteSpace: 'nowrap',
            }}>
              {f}
            </button>
          ))}
        </div>

        <div className="bp-pi-content" style={{ flex: 1, overflowY: 'auto', padding: 20, minHeight: 0 }}>
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
                      <div key={item.id} className="bp-pi-item" style={{
                        background: '#fff', borderRadius: 10, padding: '12px 14px',
                        border: '1px solid #E0DAD4', borderLeft: `4px solid ${borderColor}`,
                        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
                      }}>
                        <span style={{ fontSize: 18, width: 24, textAlign: 'center', flexShrink: 0 }}>{categoryIcon(item.category)}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className="bp-pi-item-title" style={{ fontSize: 13, fontWeight: 700, color: D, wordBreak: 'break-word' }}>
                            {item.brand ? `${item.brand} ` : ''}{prettifyItemType(item.itemType)}
                          </div>
                          <div style={{ fontSize: 11, color: '#9B9490', marginTop: 2, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            {item.modelNumber && <span style={{ wordBreak: 'break-all' }}>{item.modelNumber}</span>}
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
                            <span style={{ marginLeft: 'auto', fontSize: 10, flexShrink: 0 }}>
                              {item.identificationMethod === 'label_ocr' && '🏷️'}
                              {item.identificationMethod === 'visual_classification' && '👁️'}
                              {item.identificationMethod === 'pm_manual' && '✏️'}
                              {' '}{fmtConfidence(item.confidenceScore)}
                            </span>
                          </div>
                        </div>
                        <div className="bp-pi-item-actions" style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                          {isLowConfidence ? (
                            <>
                              <button onClick={() => handleUpdate(item, 'pm_confirmed')} style={{
                                padding: '5px 10px', borderRadius: 6, border: 'none',
                                background: G, color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                              }}>Confirm</button>
                              <button onClick={() => handleUpdate(item, 'pm_dismissed')} style={{
                                padding: '5px 10px', borderRadius: 6, border: '1px solid #E0DAD4',
                                background: '#fff', color: '#9B9490', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                              }}>Dismiss</button>
                            </>
                          ) : item.status === 'ai_identified' ? (
                            <span style={{ fontSize: 10, fontWeight: 700, color: G, background: `${G}15`, padding: '3px 8px', borderRadius: 100 }}>
                              ✓ HIGH CONFIDENCE
                            </span>
                          ) : (
                            <span style={{ fontSize: 10, fontWeight: 700, color: G, background: `${G}15`, padding: '3px 8px', borderRadius: 100 }}>
                              ✓ CONFIRMED
                            </span>
                          )}
                          <button
                            onClick={() => handleDelete(item)}
                            title="Delete item"
                            aria-label="Delete item"
                            style={{
                              width: 26, height: 26, borderRadius: '50%',
                              border: '1px solid #E0DAD4', background: '#fff',
                              color: '#9B9490', fontSize: 16, lineHeight: 1, cursor: 'pointer',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              padding: 0, flexShrink: 0,
                            }}
                            onMouseEnter={e => {
                              (e.currentTarget as HTMLElement).style.background = '#FEF2F2';
                              (e.currentTarget as HTMLElement).style.borderColor = '#FCA5A5';
                              (e.currentTarget as HTMLElement).style.color = '#DC2626';
                            }}
                            onMouseLeave={e => {
                              (e.currentTarget as HTMLElement).style.background = '#fff';
                              (e.currentTarget as HTMLElement).style.borderColor = '#E0DAD4';
                              (e.currentTarget as HTMLElement).style.color = '#9B9490';
                            }}
                          >×</button>
                        </div>
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
