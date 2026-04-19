import { useEffect, useRef, useState } from 'react';

const O = '#E8632B';

const MAX_SECONDS = 60;

type Phase = 'permission' | 'ready' | 'recording' | 'preview' | 'error';

interface VideoRecorderProps {
  open: boolean;
  onClose: () => void;
  /** Called with a base64 data URL (video/webm or video/mp4 depending on platform) */
  onUse: (dataUrl: string, durationSec: number) => void;
}

/**
 * Full-screen video recorder modal. Uses MediaRecorder for recording and
 * FileReader to produce a base64 data URL when the user confirms the clip.
 *
 * Design intent: ask the user to narrate the issue while panning to the problem
 * area. Short clips (max 60s) keep payload size reasonable.
 *
 * Browser support: Chrome, Safari 14.1+, Firefox. iOS Safari requires a user
 * gesture to open the camera (we trigger it from the modal's open flow).
 */
export default function VideoRecorder({ open, onClose, onUse }: VideoRecorderProps) {
  const [phase, setPhase] = useState<Phase>('permission');
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const previewRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const blobRef = useRef<Blob | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mimeTypeRef = useRef<string>('video/webm');

  // Reset when modal opens
  useEffect(() => {
    if (!open) return;
    setPhase('permission');
    setError(null);
    setElapsed(0);
    setPreviewUrl(null);
    chunksRef.current = [];
    blobRef.current = null;
    startCamera();
    return () => stopEverything();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: true,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setPhase('ready');
    } catch (err) {
      const msg = (err as Error).name === 'NotAllowedError'
        ? 'Camera access denied. You can enable it in your browser settings.'
        : 'Could not access camera. Try again or use a photo instead.';
      setError(msg);
      setPhase('error');
    }
  }

  function stopEverything() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      try { recorderRef.current.stop(); } catch { /* ignore */ }
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (previewUrl) { URL.revokeObjectURL(previewUrl); }
  }

  function pickMimeType(): string {
    // Prefer mp4/h264 for broad playback compatibility; fall back to webm.
    const candidates = [
      'video/mp4;codecs=h264,aac',
      'video/mp4',
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm',
    ];
    for (const c of candidates) {
      if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(c)) return c;
    }
    return 'video/webm';
  }

  function startRecording() {
    if (!streamRef.current) return;
    chunksRef.current = [];
    const mime = pickMimeType();
    mimeTypeRef.current = mime;

    const recorder = new MediaRecorder(streamRef.current, { mimeType: mime });
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mime });
      blobRef.current = blob;
      const url = URL.createObjectURL(blob);
      setPreviewUrl(url);
      setPhase('preview');
    };
    recorder.start(500); // collect in 500ms chunks for responsive data flow
    recorderRef.current = recorder;

    setElapsed(0);
    setPhase('recording');
    const t0 = Date.now();
    timerRef.current = setInterval(() => {
      const sec = Math.floor((Date.now() - t0) / 1000);
      setElapsed(sec);
      if (sec >= MAX_SECONDS) stopRecording();
    }, 250);
  }

  function stopRecording() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (recorderRef.current && recorderRef.current.state === 'recording') {
      recorderRef.current.stop();
    }
  }

  function retake() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    blobRef.current = null;
    setElapsed(0);
    setPhase('ready');
  }

  async function useClip() {
    if (!blobRef.current) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      stopEverything();
      onUse(dataUrl, elapsed || 1);
      onClose();
    };
    reader.onerror = () => {
      setError('Could not read the recording. Try again.');
      setPhase('error');
    };
    reader.readAsDataURL(blobRef.current);
  }

  function handleClose() {
    stopEverything();
    onClose();
  }

  if (!open) return null;

  const mm = String(Math.floor(elapsed / 60)).padStart(1, '0');
  const ss = String(elapsed % 60).padStart(2, '0');

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 99999,
      background: '#000', color: '#fff',
      display: 'flex', flexDirection: 'column',
      fontFamily: "'DM Sans', sans-serif",
    }}>
      {/* Top bar */}
      <div style={{
        padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: 'linear-gradient(180deg, rgba(0,0,0,.6) 0%, rgba(0,0,0,0) 100%)',
        position: 'absolute', top: 0, left: 0, right: 0, zIndex: 2,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {phase === 'recording' && (
            <>
              <span style={{
                display: 'inline-block', width: 10, height: 10, borderRadius: '50%',
                background: '#E24B4A', animation: 'vr-pulse 1s infinite',
              }} />
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 700, letterSpacing: 1 }}>
                REC · {mm}:{ss}
              </span>
            </>
          )}
          {phase === 'preview' && (
            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 700, letterSpacing: 1, color: 'rgba(255,255,255,.85)' }}>
              {mm}:{ss}
            </span>
          )}
        </div>
        <button
          onClick={handleClose}
          aria-label="Close"
          style={{
            background: 'rgba(255,255,255,.14)', border: 'none', borderRadius: '50%',
            width: 36, height: 36, color: '#fff', fontSize: 18, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          ✕
        </button>
      </div>

      {/* Live viewfinder OR preview */}
      <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        {/* Live camera (hidden during preview) */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          style={{
            width: '100%', height: '100%', objectFit: 'cover',
            display: phase === 'preview' ? 'none' : 'block',
          }}
        />
        {/* Preview (shown after stop) */}
        {previewUrl && (
          <video
            ref={previewRef}
            src={previewUrl}
            controls
            playsInline
            style={{
              width: '100%', height: '100%', objectFit: 'contain',
              display: phase === 'preview' ? 'block' : 'none',
              background: '#000',
            }}
          />
        )}

        {/* Permission / error overlays */}
        {phase === 'permission' && (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center' }}>
            <div>
              <div style={{ fontSize: 40, marginBottom: 8 }}>🎥</div>
              <div style={{ fontFamily: "'Fraunces', serif", fontWeight: 700, fontSize: 22, marginBottom: 6 }}>Requesting camera…</div>
              <div style={{ fontSize: 14, opacity: 0.7, maxWidth: 320 }}>Your browser will ask permission to use the camera and microphone.</div>
            </div>
          </div>
        )}
        {phase === 'error' && (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center' }}>
            <div>
              <div style={{ fontSize: 40, marginBottom: 8 }}>⚠️</div>
              <div style={{ fontFamily: "'Fraunces', serif", fontWeight: 700, fontSize: 22, marginBottom: 8 }}>Camera unavailable</div>
              <div style={{ fontSize: 14, opacity: 0.7, maxWidth: 320, marginBottom: 20 }}>{error}</div>
              <button onClick={handleClose} style={primaryBtn}>Close</button>
            </div>
          </div>
        )}

        {/* Narration tip overlay — only in ready/recording */}
        {(phase === 'ready' || phase === 'recording') && (
          <div style={{
            position: 'absolute', top: 72, left: 0, right: 0,
            textAlign: 'center', padding: '0 24px',
            pointerEvents: 'none',
          }}>
            <div style={{
              display: 'inline-block',
              background: 'rgba(0,0,0,.5)', backdropFilter: 'blur(12px)',
              padding: '10px 16px', borderRadius: 100,
              fontSize: 13, fontWeight: 500, color: '#fff',
            }}>
              {phase === 'ready'
                ? 'Point at the issue and describe what you\u2019re seeing'
                : 'Narrate as you film — pros will watch this'}
            </div>
          </div>
        )}

        {/* Remaining-time bar */}
        {phase === 'recording' && (
          <div style={{
            position: 'absolute', top: 56, left: 20, right: 20, height: 3,
            background: 'rgba(255,255,255,.15)', borderRadius: 3, overflow: 'hidden',
          }}>
            <div style={{
              height: '100%', width: `${(elapsed / MAX_SECONDS) * 100}%`,
              background: O, transition: 'width 0.25s linear',
            }} />
          </div>
        )}
      </div>

      {/* Bottom control bar */}
      <div style={{
        padding: '20px 20px 32px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 20,
        background: 'linear-gradient(0deg, rgba(0,0,0,.8) 0%, rgba(0,0,0,0) 100%)',
        position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 2,
      }}>
        {phase === 'ready' && (
          <button
            onClick={startRecording}
            aria-label="Start recording"
            style={recordBtn}
          >
            <span style={{
              width: 28, height: 28, borderRadius: '50%', background: '#E24B4A',
              transition: 'all .15s',
            }} />
          </button>
        )}
        {phase === 'recording' && (
          <button
            onClick={stopRecording}
            aria-label="Stop recording"
            style={recordBtn}
          >
            <span style={{
              width: 24, height: 24, borderRadius: 4, background: '#E24B4A',
            }} />
          </button>
        )}
        {phase === 'preview' && (
          <>
            <button onClick={retake} style={secondaryBtn}>Retake</button>
            <button onClick={useClip} style={primaryBtn}>Use this clip →</button>
          </>
        )}
      </div>

      <style>{`
        @keyframes vr-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </div>
  );
}

const recordBtn: React.CSSProperties = {
  width: 72, height: 72, borderRadius: '50%',
  background: 'rgba(255,255,255,.15)',
  border: '4px solid #fff',
  cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  transition: 'all .15s',
};

const primaryBtn: React.CSSProperties = {
  background: O, color: '#fff', border: 'none', borderRadius: 100,
  padding: '14px 28px', fontSize: 15, fontWeight: 700,
  cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
  boxShadow: `0 8px 24px -8px ${O}`,
};

const secondaryBtn: React.CSSProperties = {
  background: 'rgba(255,255,255,.14)', color: '#fff',
  border: `1px solid rgba(255,255,255,.22)`, borderRadius: 100,
  padding: '14px 24px', fontSize: 15, fontWeight: 600,
  cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
};
