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

// Ordered as a natural property walkthrough: main living spaces → bedrooms
// → bathrooms → utility → other interior → exterior. Default starts at
// kitchen since that's typically where PMs begin a scan.
const ROOM_OPTIONS = [
  'kitchen', 'dining_room', 'living_room',
  'master_bedroom', 'bedroom',
  'master_bathroom', 'bathroom', 'half_bathroom',
  'laundry', 'mechanical_room', 'garage',
  'office', 'hallway',
  'patio', 'pool_area', 'exterior_front', 'exterior_back',
  'other',
];

export function ScanCaptureModal({ workspaceId, scanId, propertyName, onClose, onComplete }: {
  workspaceId: string;
  scanId: string;
  propertyName: string;
  onClose: () => void;
  onComplete: () => void;
}) {
  const [currentRoom, setCurrentRoom] = useState<string>('kitchen');
  const [uploading, setUploading] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [detected, setDetected] = useState<Array<{ id: string; itemType: string; brand: string | null; modelNumber: string | null; confidence: number; roomType: string }>>([]);
  const [coaching, setCoaching] = useState<string>("Let's start in the kitchen. Slowly pan your camera and capture the appliances. I'll handle the rest.");
  const [error, setError] = useState<string | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ items: string[]; key: number } | null>(null);
  const flashTimerRef = useRef<number | null>(null);
  const [roomProgress, setRoomProgress] = useState<{ expected: string[]; captured: string[]; remaining: string[] } | null>(null);
  const [roomTargets, setRoomTargets] = useState<Record<string, string[]>>({});
  // Cache last-known captured items per room so re-entering a room shows the
  // real progress immediately instead of resetting to 0.
  const capturedByRoomRef = useRef<Map<string, Set<string>>>(new Map());
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch the static per-room target lists once on mount
  useEffect(() => {
    let cancelled = false;
    businessService.getRoomTargets(workspaceId)
      .then(res => {
        if (!cancelled && res.data?.targets) setRoomTargets(res.data.targets);
      })
      .catch(() => { /* ignore */ });
    return () => { cancelled = true; };
  }, [workspaceId]);

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

  function showFlash(items: string[]) {
    if (flashTimerRef.current) window.clearTimeout(flashTimerRef.current);
    setFlash({ items, key: Date.now() });
    flashTimerRef.current = window.setTimeout(() => setFlash(null), 1800);
  }

  // Cleanup flash timer on unmount
  useEffect(() => () => {
    if (flashTimerRef.current) window.clearTimeout(flashTimerRef.current);
  }, []);

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
      });
      if (res.data) {
        const newItems = res.data.itemsDetected;
        for (const item of newItems) {
          setDetected(prev => [...prev, { ...item, roomType: res.data!.roomType }]);
        }
        if (newItems.length > 0) {
          const labels = newItems.map(i => `${i.brand || ''} ${prettifyItemType(i.itemType)}`.trim());
          showFlash(labels);
        } else {
          showToast('No new items in that frame');
        }

        // Refresh coaching based on what we just found
        try {
          const coachRes = await businessService.generateScanCoaching(workspaceId, scanId, {
            current_room: currentRoom,
            last_detected_items: newItems.map(i => ({ itemType: i.itemType, brand: i.brand, confidence: i.confidence })),
          });
          if (coachRes.data?.message) setCoaching(coachRes.data.message);
          if (coachRes.data?.roomProgress) {
            const rp = coachRes.data.roomProgress;
            setRoomProgress({
              expected: rp.expected,
              captured: rp.captured,
              remaining: rp.remaining,
            });
            capturedByRoomRef.current.set(currentRoom, new Set(rp.captured));
          }
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

  // Compute the next room in the walkthrough sequence (wraps at end)
  const currentRoomIdx = ROOM_OPTIONS.indexOf(currentRoom);
  const nextRoom = ROOM_OPTIONS[currentRoomIdx >= 0 ? (currentRoomIdx + 1) % ROOM_OPTIONS.length : 0];

  function handleNextRoom() {
    setCurrentRoom(nextRoom);
    setRoomProgress(null);
    showToast(`Now scanning: ${prettifyItemType(nextRoom)}`);
  }

  // Whenever the current room changes:
  //   1. Seed the checklist instantly from the cached targets + cached captured set
  //      so the PM sees something the moment they switch rooms.
  //   2. Fetch fresh coaching from the server, which returns the authoritative
  //      progress (with anything captured in earlier sessions) and updates the UI.
  useEffect(() => {
    const expected = roomTargets[currentRoom] ?? [];
    if (expected.length > 0) {
      const cachedCaptured = capturedByRoomRef.current.get(currentRoom) ?? new Set<string>();
      const captured = expected.filter(t => cachedCaptured.has(t));
      const remaining = expected.filter(t => !cachedCaptured.has(t));
      setRoomProgress({ expected, captured, remaining });
    } else {
      setRoomProgress(null);
    }

    let cancelled = false;
    businessService.generateScanCoaching(workspaceId, scanId, {
      current_room: currentRoom,
      last_detected_items: [],
    })
      .then(res => {
        if (cancelled) return;
        if (res.data?.message) setCoaching(res.data.message);
        if (res.data?.roomProgress) {
          const rp = res.data.roomProgress;
          setRoomProgress({
            expected: rp.expected,
            captured: rp.captured,
            remaining: rp.remaining,
          });
          // Seed the per-room cache with the authoritative captured set
          capturedByRoomRef.current.set(currentRoom, new Set(rp.captured));
        }
      })
      .catch(() => { /* ignore */ });
    return () => { cancelled = true; };
  }, [workspaceId, scanId, currentRoom, roomTargets]);

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
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--bp-subtle)', fontSize: 13 }}>
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
            <button
              onClick={handleComplete}
              disabled={completing}
              style={{
                background: G, border: 'none', color: '#fff',
                padding: '8px 14px', borderRadius: 100,
                fontSize: 12, fontWeight: 600,
                cursor: completing ? 'default' : 'pointer',
                opacity: completing ? 0.5 : 1,
                fontFamily: "'DM Sans', sans-serif",
              }}
            >{completing ? 'Ending…' : 'End scan'}</button>
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

          {/* Per-room checklist progress */}
          {roomProgress && roomProgress.expected.length > 0 && (
            <div style={{
              marginTop: 8,
              background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(8px)',
              borderRadius: 12, padding: '10px 14px',
              border: '1px solid rgba(255,255,255,0.1)',
            }}>
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                marginBottom: 8, gap: 8,
              }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.8)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Checklist
                </div>
                <div style={{ fontSize: 11, fontWeight: 700, color: roomProgress.remaining.length === 0 ? '#5DDB9D' : '#fff' }}>
                  {roomProgress.captured.length} of {roomProgress.expected.length}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                {roomProgress.expected.map(t => {
                  const done = roomProgress.captured.includes(t);
                  return (
                    <span key={t} style={{
                      fontSize: 10, fontWeight: 600,
                      padding: '3px 9px', borderRadius: 100,
                      background: done ? 'rgba(93,219,157,0.22)' : 'rgba(255,255,255,0.08)',
                      color: done ? '#5DDB9D' : 'rgba(255,255,255,0.7)',
                      border: `1px solid ${done ? 'rgba(93,219,157,0.4)' : 'rgba(255,255,255,0.15)'}`,
                      textTransform: 'capitalize',
                      whiteSpace: 'nowrap',
                    }}>
                      {done ? '✓ ' : ''}{prettifyItemType(t)}
                    </span>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Center flash — checkmark + detected item names when items are found */}
        {flash && (
          <div
            key={flash.key}
            style={{
              position: 'absolute', top: '50%', left: '50%',
              transform: 'translate(-50%, -50%)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14,
              pointerEvents: 'none', zIndex: 5,
              animation: 'scanFlash 1.8s ease forwards',
            }}
          >
            <div style={{
              width: 96, height: 96, borderRadius: '50%',
              background: 'rgba(27,158,119,0.78)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
              border: '3px solid rgba(255,255,255,0.55)',
            }}>
              <svg width={52} height={52} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <div style={{
              background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(8px)',
              padding: '10px 18px', borderRadius: 14,
              fontSize: 13, fontWeight: 700, color: '#fff',
              maxWidth: 280, textAlign: 'center', lineHeight: 1.4,
              border: '1px solid rgba(255,255,255,0.18)',
            }}>
              {flash.items.slice(0, 3).join(', ')}
              {flash.items.length > 3 && ` +${flash.items.length - 3} more`}
            </div>
          </div>
        )}

        {/* Toast — used for non-detection messages (room change, no items, etc.) */}
        {toast && (
          <div style={{
            position: 'absolute', top: 140, left: '50%', transform: 'translateX(-50%)',
            background: 'rgba(0,0,0,0.78)', color: '#fff',
            padding: '8px 16px', borderRadius: 100, fontSize: 12, fontWeight: 600,
            boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
            border: '1px solid rgba(255,255,255,0.12)',
            animation: 'scanToast 2.4s ease', zIndex: 5,
          }}>
            {toast}
          </div>
        )}
        <style>{`
          @keyframes scanToast {
            0% { opacity: 0; transform: translate(-50%, -8px); }
            10%, 85% { opacity: 1; transform: translate(-50%, 0); }
            100% { opacity: 0; transform: translate(-50%, -8px); }
          }
          @keyframes scanFlash {
            0% { opacity: 0; transform: translate(-50%, -50%) scale(0.55); }
            18% { opacity: 1; transform: translate(-50%, -50%) scale(1.08); }
            30% { transform: translate(-50%, -50%) scale(1); }
            78% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
            100% { opacity: 0; transform: translate(-50%, -50%) scale(1); }
          }
        `}</style>

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
        <div style={{ marginBottom: 12 }}>
          <select
            value={currentRoom}
            onChange={e => setCurrentRoom(e.target.value)}
            style={{
              width: '100%', padding: '8px 12px', borderRadius: 8,
              border: '1px solid rgba(255,255,255,0.2)',
              background: 'rgba(255,255,255,0.05)', color: '#fff',
              fontSize: 12, fontFamily: "'DM Sans', sans-serif",
            }}
          >
            {ROOM_OPTIONS.map(r => <option key={r} value={r} style={{ color: '#000' }}>{prettifyItemType(r)}</option>)}
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'center' }}>
          <button
            onClick={handleNextRoom}
            title={`Advance to ${prettifyItemType(nextRoom)}`}
            style={{
              background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff',
              padding: '10px 14px', borderRadius: 100, fontSize: 12, fontWeight: 600, cursor: 'pointer',
              maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              fontFamily: "'DM Sans', sans-serif",
            }}
          >Next: {prettifyItemType(nextRoom)} ›</button>

          {/* Capture button */}
          <button
            onClick={captureAndProcess}
            disabled={uploading || (!cameraReady && !!cameraError === false)}
            style={{
              width: 72, height: 72, borderRadius: '50%',
              background: 'var(--bp-card)', border: '4px solid rgba(255,255,255,0.4)',
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
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<'all' | 'appliance' | 'fixture' | 'system' | 'safety' | 'amenity'>('all');

  /**
   * Load inventory + maintenance flags. When `silent` is true, the full-screen
   * loading state is skipped — used after confirm/dismiss/delete so the user
   * doesn't lose their scroll position. A small "Updating…" indicator
   * appears in the header instead.
   */
  async function load(silent = false) {
    if (silent) setRefreshing(true);
    else setLoading(true);
    try {
      const [invRes, flagsRes] = await Promise.all([
        businessService.getPropertyInventory(workspaceId, propertyId),
        businessService.getMaintenanceFlags(workspaceId, propertyId),
      ]);
      if (invRes.data) setData(invRes.data);
      if (flagsRes.data) setFlags(flagsRes.data);
    } catch { /* ignore */ }
    if (silent) setRefreshing(false);
    else setLoading(false);
  }

  useEffect(() => { load(); }, [workspaceId, propertyId]);

  async function handleUpdate(item: PropertyInventoryItem, status: 'pm_confirmed' | 'pm_dismissed') {
    try {
      await businessService.updateInventoryItem(workspaceId, item.id, { status });
      await load(true);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update');
    }
  }

  async function handleDelete(item: PropertyInventoryItem) {
    const label = `${item.brand ? item.brand + ' ' : ''}${prettifyItemType(item.itemType)}`;
    if (!window.confirm(`Delete "${label}" from inventory? This cannot be undone.`)) return;
    try {
      await businessService.deleteInventoryItem(workspaceId, item.id);
      await load(true);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete');
    }
  }

  if (loading) {
    return (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ background: 'var(--bp-card)', padding: 32, borderRadius: 12, color: 'var(--bp-subtle)' }}>Loading inventory...</div>
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
          background: 'var(--bp-card)', borderRadius: 16, width: '100%', maxWidth: 820,
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
            <div className="bp-pi-header-title" style={{ fontFamily: 'Fraunces, serif', fontSize: 20, fontWeight: 700, color: D, lineHeight: 1.2, display: 'flex', alignItems: 'center', gap: 8 }}>
              Property inventory
              {refreshing && (
                <span style={{
                  fontSize: 11, fontWeight: 600, color: 'var(--bp-subtle)',
                  fontFamily: "'DM Sans', sans-serif",
                }}>Updating…</span>
              )}
            </div>
            <div className="bp-pi-header-meta" style={{ fontSize: 12, color: 'var(--bp-subtle)', marginTop: 2, lineHeight: 1.4 }}>
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
              cursor: 'pointer', color: 'var(--bp-subtle)', padding: 4, flexShrink: 0,
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
              border: filter === f ? `1px solid ${O}` : '1px solid var(--bp-border)',
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
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--bp-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
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
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                  <h4 style={{ fontFamily: 'Fraunces, serif', fontSize: 15, fontWeight: 700, color: D, margin: 0 }}>{room.roomLabel}</h4>
                  {room.flooringType && <span style={{ fontSize: 11, color: 'var(--bp-subtle)' }}>{room.flooringType}</span>}
                  {room.roomCount && room.roomCount > 1 && (
                    <span title={`Merged from ${room.roomCount} scan rooms`} style={{
                      fontSize: 10, fontWeight: 700, color: O, background: `${O}15`,
                      padding: '2px 8px', borderRadius: 100,
                    }}>
                      MERGED · {room.roomCount}
                    </span>
                  )}
                  <span style={{ fontSize: 11, color: 'var(--bp-subtle)', marginLeft: 'auto' }}>{roomItems.length} items</span>
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
                        background: 'var(--bp-card)', borderRadius: 10, padding: '12px 14px',
                        border: '1px solid var(--bp-border)', borderLeft: `4px solid ${borderColor}`,
                        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
                      }}>
                        <span style={{ fontSize: 18, width: 24, textAlign: 'center', flexShrink: 0 }}>{categoryIcon(item.category)}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className="bp-pi-item-title" style={{ fontSize: 13, fontWeight: 700, color: D, wordBreak: 'break-word' }}>
                            {item.brand ? `${item.brand} ` : ''}{prettifyItemType(item.itemType)}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--bp-subtle)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
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
                                padding: '5px 10px', borderRadius: 6, border: '1px solid var(--bp-border)',
                                background: 'var(--bp-card)', color: 'var(--bp-subtle)', fontSize: 11, fontWeight: 600, cursor: 'pointer',
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
                              border: '1px solid var(--bp-border)', background: 'var(--bp-card)',
                              color: 'var(--bp-subtle)', fontSize: 16, lineHeight: 1, cursor: 'pointer',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              padding: 0, flexShrink: 0,
                            }}
                            onMouseEnter={e => {
                              (e.currentTarget as HTMLElement).style.background = '#FEF2F2';
                              (e.currentTarget as HTMLElement).style.borderColor = '#FCA5A5';
                              (e.currentTarget as HTMLElement).style.color = '#DC2626';
                            }}
                            onMouseLeave={e => {
                              (e.currentTarget as HTMLElement).style.background = 'var(--bp-card)';
                              (e.currentTarget as HTMLElement).style.borderColor = 'var(--bp-border)';
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
            <div style={{ textAlign: 'center', padding: 60, color: 'var(--bp-subtle)', fontSize: 13 }}>
              No items{filter !== 'all' ? ` in ${filter}` : ''} yet.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
