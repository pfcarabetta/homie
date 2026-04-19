import { useCallback, useEffect, useRef, useState } from 'react';

// ── Visual tokens (shared with the Quote page design) ────────────────────────
const O = '#E8632B';
const D = '#2D2926';
const DIM = '#6B6560';
const W = '#F9F5F2';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

// Voice modal state machine:
//   permission → user grants mic access
//   idle       → waiting for the user to tap the mic
//   listening  → recording user speech
//   thinking   → audio sent, waiting for Whisper+Claude+ElevenLabs
//   speaking   → mp3 reply playing back
//   ready      → Homie signalled <ready/>, conversation done
//   error      → recoverable error, user can retry
type Phase = 'permission' | 'idle' | 'listening' | 'thinking' | 'speaking' | 'ready' | 'error';

interface HistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface VoiceConversationModalProps {
  open: boolean;
  onClose: () => void;
  /** Optional category hint (the category tile the user already picked) */
  category?: string | null;
  /**
   * Called when the conversation finishes (<ready/> tag detected OR user
   * taps "I'm done"). Receives the full transcript joined plus the structured
   * history so the parent can splice it into its chat state.
   */
  onComplete: (payload: { transcript: string; history: HistoryMessage[] }) => void;
}

/**
 * Full-screen voice conversation modal. User taps mic → speaks → releases →
 * backend transcribes, replies, synthesizes speech → modal plays it → loops
 * until Homie signals readiness or the user closes.
 *
 * Design choices:
 *  - Tap-to-record (not continuous) keeps turn-taking unambiguous and avoids
 *    hot-mic anxiety. A continuous VAD-based mode could come later.
 *  - Backend is stateless — we hold the turn history client-side and send it
 *    with every request. Keeps the backend simple and lets the user resume
 *    after a dropped connection.
 *  - Visual feedback via a single pulsing ring that changes color per phase
 *    so the user always knows whose turn it is.
 */
export default function VoiceConversationModal({ open, onClose, category, onComplete }: VoiceConversationModalProps) {
  const [phase, setPhase] = useState<Phase>('permission');
  const [error, setError] = useState<string | null>(null);
  const [lastTranscript, setLastTranscript] = useState<string>('');
  const [lastReply, setLastReply] = useState<string>('');
  const [turnCount, setTurnCount] = useState(0);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mimeTypeRef = useRef<string>('audio/webm');
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const historyRef = useRef<HistoryMessage[]>([]);
  const recordingStartRef = useRef<number>(0);
  // Last created audio object URL so we can revoke it when the next reply plays
  const lastAudioUrlRef = useRef<string | null>(null);

  // ── Lifecycle ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    // Clean state on open
    setPhase('permission');
    setError(null);
    setLastTranscript('');
    setLastReply('');
    setTurnCount(0);
    historyRef.current = [];
    void requestMic();
    return () => {
      tearDown();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const tearDown = () => {
    try { recorderRef.current?.stop(); } catch { /* noop */ }
    recorderRef.current = null;
    try { streamRef.current?.getTracks().forEach(t => t.stop()); } catch { /* noop */ }
    streamRef.current = null;
    try { audioRef.current?.pause(); } catch { /* noop */ }
    if (lastAudioUrlRef.current) {
      try { URL.revokeObjectURL(lastAudioUrlRef.current); } catch { /* noop */ }
      lastAudioUrlRef.current = null;
    }
    chunksRef.current = [];
  };

  const pickMime = (): string => {
    const candidates = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4;codecs=mp4a.40.2',
      'audio/mp4',
      'audio/ogg;codecs=opus',
    ];
    for (const m of candidates) {
      // MediaRecorder.isTypeSupported isn't present on all SSR/test envs
      if (typeof MediaRecorder !== 'undefined' && typeof MediaRecorder.isTypeSupported === 'function' && MediaRecorder.isTypeSupported(m)) {
        return m;
      }
    }
    return 'audio/webm';
  };

  const requestMic = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      streamRef.current = stream;
      mimeTypeRef.current = pickMime();
      setPhase('idle');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Microphone permission denied';
      setError(msg);
      setPhase('error');
    }
  };

  // ── Recording ──────────────────────────────────────────────────────────────
  const startListening = () => {
    const stream = streamRef.current;
    if (!stream) return;
    try {
      const rec = new MediaRecorder(stream, { mimeType: mimeTypeRef.current });
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        void finalizeTurn();
      };
      recorderRef.current = rec;
      recordingStartRef.current = Date.now();
      rec.start(100);
      setPhase('listening');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not start recording';
      setError(msg);
      setPhase('error');
    }
  };

  const stopListening = () => {
    const rec = recorderRef.current;
    if (!rec || rec.state === 'inactive') return;
    // Discard ultra-short clips (< 400ms) — likely accidental taps
    const elapsed = Date.now() - recordingStartRef.current;
    if (elapsed < 400) {
      try { rec.stop(); } catch { /* noop */ }
      recorderRef.current = null;
      chunksRef.current = [];
      setPhase('idle');
      return;
    }
    try { rec.stop(); } catch { /* noop */ }
  };

  // ── Server round-trip ──────────────────────────────────────────────────────
  const finalizeTurn = async () => {
    setPhase('thinking');
    const chunks = chunksRef.current.slice();
    chunksRef.current = [];
    if (chunks.length === 0) {
      setPhase('idle');
      return;
    }

    try {
      const blob = new Blob(chunks, { type: mimeTypeRef.current });
      const dataUrl = await blobToDataUrl(blob);
      const isFirst = historyRef.current.length === 0;

      const r = await fetch(`${API_BASE}/api/v1/voice/turn`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audio_data_url: dataUrl,
          history: historyRef.current,
          category: category ?? null,
          is_first: isFirst,
        }),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error((body as { error?: string })?.error || `Voice turn failed (${r.status})`);
      }
      const json = (await r.json()) as {
        data: {
          transcript: string;
          reply: string;
          audio_base64: string;
          audio_mime: string;
          is_ready: boolean;
        };
      };

      const { transcript, reply, audio_base64, audio_mime, is_ready } = json.data;

      // Update UI + history
      historyRef.current = [
        ...historyRef.current,
        { role: 'user', content: transcript },
        { role: 'assistant', content: reply },
      ];
      setLastTranscript(transcript);
      setLastReply(reply);
      setTurnCount((n) => n + 1);

      // Play reply
      await playMp3(audio_base64, audio_mime);

      if (is_ready) {
        setPhase('ready');
        // Small beat, then auto-complete so the homeowner sees the final state
        setTimeout(() => {
          onComplete({
            transcript: buildTranscript(historyRef.current),
            history: [...historyRef.current],
          });
        }, 1400);
      } else {
        setPhase('idle');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong';
      setError(msg);
      setPhase('error');
    }
  };

  // ── Audio playback ─────────────────────────────────────────────────────────
  const playMp3 = useCallback((base64: string, mime: string) => new Promise<void>((resolve) => {
    // Decode base64 → Blob → object URL (fastest, avoids a long data URL)
    const byteChars = atob(base64);
    const bytes = new Uint8Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) bytes[i] = byteChars.charCodeAt(i);
    const blob = new Blob([bytes], { type: mime || 'audio/mpeg' });
    const url = URL.createObjectURL(blob);

    // Revoke the previous URL once we're playing the new one
    if (lastAudioUrlRef.current) {
      try { URL.revokeObjectURL(lastAudioUrlRef.current); } catch { /* noop */ }
    }
    lastAudioUrlRef.current = url;

    const audio = new Audio(url);
    audioRef.current = audio;
    audio.onplay = () => setPhase('speaking');
    audio.onended = () => resolve();
    audio.onerror = () => resolve();
    audio.play().catch(() => resolve());
  }), []);

  // ── Helpers ────────────────────────────────────────────────────────────────
  const handleDone = () => {
    // User taps "I'm done" — wrap up with whatever we have
    if (historyRef.current.length === 0) {
      onClose();
      return;
    }
    onComplete({
      transcript: buildTranscript(historyRef.current),
      history: [...historyRef.current],
    });
  };

  if (!open) return null;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        background: 'radial-gradient(circle at 50% 30%, #3a2f2a 0%, #1a1510 70%)',
        color: W,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      {/* Close */}
      <button
        onClick={onClose}
        aria-label="Close voice conversation"
        style={{
          position: 'absolute',
          top: 20,
          right: 20,
          background: 'rgba(255,255,255,0.12)',
          border: 'none',
          color: W,
          width: 44,
          height: 44,
          borderRadius: 12,
          fontSize: 20,
          cursor: 'pointer',
        }}
      >
        ✕
      </button>

      {/* Phase label */}
      <div
        style={{
          fontFamily: 'DM Mono, ui-monospace, monospace',
          fontSize: 11,
          letterSpacing: 1.2,
          textTransform: 'uppercase',
          color: 'rgba(255,255,255,0.55)',
          marginBottom: 20,
        }}
      >
        {phaseLabel(phase, turnCount)}
      </div>

      {/* Pulsing orb */}
      <Orb phase={phase} />

      {/* Hint under the orb */}
      <div
        style={{
          fontFamily: 'Fraunces, serif',
          fontSize: 26,
          lineHeight: 1.25,
          textAlign: 'center',
          marginTop: 28,
          maxWidth: 520,
          fontWeight: 300,
        }}
      >
        {hintText(phase)}
      </div>

      {/* Rolling transcript + last reply */}
      <div
        style={{
          marginTop: 24,
          maxWidth: 640,
          width: '100%',
          minHeight: 92,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        {lastTranscript && (
          <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)', textAlign: 'center' }}>
            <span style={{ color: 'rgba(255,255,255,0.45)', marginRight: 8 }}>You:</span>
            {lastTranscript}
          </div>
        )}
        {lastReply && (
          <div style={{ fontSize: 16, color: W, textAlign: 'center' }}>
            <span style={{ color: O, marginRight: 8, fontWeight: 700 }}>Homie:</span>
            {lastReply}
          </div>
        )}
      </div>

      {/* Action */}
      <div style={{ marginTop: 36, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
        {phase === 'idle' && (
          <button
            onClick={startListening}
            style={micButtonStyle(O)}
            aria-label="Tap to speak"
          >
            <MicIcon />
            <span style={{ marginLeft: 10, fontFamily: 'DM Sans, sans-serif', fontWeight: 600 }}>Tap to speak</span>
          </button>
        )}
        {phase === 'listening' && (
          <button
            onClick={stopListening}
            style={{ ...micButtonStyle('#c94223'), animation: 'homiePulse 1.3s ease-out infinite' }}
            aria-label="Tap to stop"
          >
            <StopIcon />
            <span style={{ marginLeft: 10, fontFamily: 'DM Sans, sans-serif', fontWeight: 600 }}>Tap when you're done</span>
          </button>
        )}
        {(phase === 'thinking' || phase === 'speaking') && (
          <div
            style={{
              fontFamily: 'DM Sans, sans-serif',
              fontSize: 14,
              color: 'rgba(255,255,255,0.55)',
            }}
          >
            {phase === 'thinking' ? 'Homie is thinking…' : 'Homie is talking…'}
          </div>
        )}
        {phase === 'ready' && (
          <div
            style={{
              fontFamily: 'DM Sans, sans-serif',
              fontSize: 15,
              color: 'rgba(255,255,255,0.85)',
            }}
          >
            Perfect — drafting your quote…
          </div>
        )}
        {phase === 'error' && (
          <>
            <div style={{ fontSize: 14, color: '#ffb4a2', textAlign: 'center', maxWidth: 420 }}>{error}</div>
            <button
              onClick={() => { setError(null); setPhase('idle'); }}
              style={{
                background: 'rgba(255,255,255,0.12)',
                border: 'none',
                color: W,
                padding: '10px 18px',
                borderRadius: 999,
                fontFamily: 'DM Sans, sans-serif',
                fontSize: 14,
                cursor: 'pointer',
              }}
            >
              Try again
            </button>
          </>
        )}
        {phase === 'permission' && (
          <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.55)', textAlign: 'center' }}>
            Requesting microphone access…
          </div>
        )}

        {/* "Done" shortcut once we have some transcript but before <ready/> */}
        {turnCount >= 1 && phase === 'idle' && (
          <button
            onClick={handleDone}
            style={{
              marginTop: 4,
              background: 'transparent',
              border: '1px solid rgba(255,255,255,0.18)',
              color: 'rgba(255,255,255,0.82)',
              padding: '8px 16px',
              borderRadius: 999,
              fontFamily: 'DM Sans, sans-serif',
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            I'm done — draft the quote
          </button>
        )}
      </div>

      {/* Footer caption */}
      <div
        style={{
          position: 'absolute',
          bottom: 18,
          left: 0,
          right: 0,
          textAlign: 'center',
          fontFamily: 'DM Mono, ui-monospace, monospace',
          fontSize: 10,
          letterSpacing: 1.1,
          textTransform: 'uppercase',
          color: 'rgba(255,255,255,0.32)',
        }}
      >
        Conversational mode · English · powered by Homie
      </div>

      {/* Keyframes for the pulse animation */}
      <style>{`
        @keyframes homiePulse {
          0%   { box-shadow: 0 0 0 0 rgba(232,99,43,0.55); }
          70%  { box-shadow: 0 0 0 26px rgba(232,99,43,0); }
          100% { box-shadow: 0 0 0 0 rgba(232,99,43,0); }
        }
        @keyframes homieBreathe {
          0%, 100% { transform: scale(1);   opacity: 0.95; }
          50%      { transform: scale(1.08); opacity: 1; }
        }
        @keyframes homieSpin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

// ── Presentational pieces ────────────────────────────────────────────────────

function Orb({ phase }: { phase: Phase }) {
  // Different animation + color per phase so the user can read state instantly
  let ringColor = 'rgba(255,255,255,0.18)';
  let animation = 'homieBreathe 3s ease-in-out infinite';
  let ringBorder = '1px solid rgba(255,255,255,0.18)';
  if (phase === 'listening') { ringColor = 'rgba(232,99,43,0.55)'; animation = 'homiePulse 1.3s ease-out infinite'; ringBorder = '2px solid rgba(232,99,43,0.9)'; }
  if (phase === 'thinking')  { ringColor = 'rgba(255,255,255,0.2)'; animation = 'homieSpin 2.2s linear infinite'; ringBorder = '2px dashed rgba(255,255,255,0.55)'; }
  if (phase === 'speaking')  { ringColor = 'rgba(27,158,119,0.35)'; animation = 'homieBreathe 1.4s ease-in-out infinite'; ringBorder = '2px solid rgba(27,158,119,0.9)'; }
  if (phase === 'ready')     { ringColor = 'rgba(27,158,119,0.4)';  animation = 'homieBreathe 2.6s ease-in-out infinite'; ringBorder = '2px solid rgba(27,158,119,1)'; }
  if (phase === 'error')     { ringColor = 'rgba(255,120,110,0.4)'; animation = 'homieBreathe 3.4s ease-in-out infinite'; ringBorder = '2px solid rgba(255,120,110,0.9)'; }

  return (
    <div
      style={{
        width: 180,
        height: 180,
        borderRadius: '50%',
        background: `radial-gradient(circle at 30% 30%, ${O}, #8a3416 65%, #1a1510 100%)`,
        border: ringBorder,
        boxShadow: `0 0 0 8px ${ringColor}, 0 20px 80px rgba(0,0,0,0.45)`,
        animation,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      aria-hidden
    >
      {/* Mini Homie mark — orange gable on a dark tile */}
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: 14,
          background: 'rgba(255,255,255,0.14)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <svg width="34" height="34" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
          <path d="M8 22 L24 10 L40 22 L40 40 L8 40 Z" stroke="#fff" strokeWidth="2.4" strokeLinejoin="round" fill="none" />
          <circle cx="24" cy="18" r="3" fill={O} />
        </svg>
      </div>
    </div>
  );
}

function MicIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <rect x="9" y="3" width="6" height="12" rx="3" fill="#fff" />
      <path d="M5 11a7 7 0 0 0 14 0" stroke="#fff" strokeWidth="2" strokeLinecap="round" fill="none" />
      <line x1="12" y1="18" x2="12" y2="21" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <rect x="3" y="3" width="10" height="10" rx="2" fill="#fff" />
    </svg>
  );
}

function micButtonStyle(bg: string): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    background: bg,
    color: '#fff',
    border: 'none',
    padding: '14px 22px',
    borderRadius: 999,
    fontSize: 15,
    cursor: 'pointer',
  };
}

function phaseLabel(phase: Phase, turnCount: number): string {
  if (phase === 'permission') return 'Asking for mic access';
  if (phase === 'idle') return turnCount === 0 ? 'Ready when you are' : `Turn ${turnCount + 1}`;
  if (phase === 'listening') return 'Listening…';
  if (phase === 'thinking') return 'Thinking…';
  if (phase === 'speaking') return 'Homie is talking';
  if (phase === 'ready') return 'Got it';
  return 'Error';
}

function hintText(phase: Phase): string {
  if (phase === 'permission') return 'Hang tight, setting up the mic.';
  if (phase === 'idle') return 'Tell Homie what\'s going on at home. Short and plain is fine.';
  if (phase === 'listening') return 'Keep going — Homie\'s listening.';
  if (phase === 'thinking') return 'Homie is thinking it over…';
  if (phase === 'speaking') return 'Listen up.';
  if (phase === 'ready') return 'Perfect — pulling your quote together.';
  if (phase === 'error') return 'Something went sideways. Try again?';
  return '';
}

function buildTranscript(history: HistoryMessage[]): string {
  return history
    .filter((m) => m.role === 'user')
    .map((m) => m.content.trim())
    .filter(Boolean)
    .join(' ');
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const r = reader.result;
      if (typeof r === 'string') resolve(r);
      else reject(new Error('Unexpected reader result'));
    };
    reader.onerror = () => reject(reader.error || new Error('Read failed'));
    reader.readAsDataURL(blob);
  });
}

// Kill unused-var warnings for tokens held for theming clarity
void D;
void DIM;
