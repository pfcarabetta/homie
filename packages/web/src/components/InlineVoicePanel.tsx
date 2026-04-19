import { useCallback, useEffect, useRef, useState } from 'react';
import { getSharedAudio, primeAudio } from './audioUnlocker';

// ── Visual tokens ────────────────────────────────────────────────────────────
const O = '#E8632B';
const G = '#1B9E77';
const D = '#2D2926';
const DIM = '#6B6560';
const W = '#F9F5F2';
const BORDER = 'rgba(0,0,0,.08)';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

type Phase = 'permission' | 'idle' | 'listening' | 'thinking' | 'speaking' | 'error';

interface HistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface Props {
  /** When true, the panel requests mic + is ready for interaction. */
  active: boolean;
  /** User tapped "back to typing" / the × — parent should hide the panel. */
  onExit: () => void;
  /** Optional category hint (the tile the user already chose). */
  category?: string | null;
  /**
   * Fires after every successful turn — parent pushes both into the chat.
   * `category` is Homie's current best category ID guess (from its
   * <category> tag) or null if it couldn't classify yet.
   */
  onTurn: (user: string, assistant: string, category: string | null) => void;
  /** Fires when <ready/> is detected or user taps "I'm done". */
  onReady: (payload: { transcript: string; history: HistoryMessage[] }) => void;
}

/**
 * In-page voice conversation panel. Replaces the full-screen modal so the
 * user stays on the /quote page with the chat + checklist visible as they
 * speak. Each turn emits user & assistant text up to the parent so it can
 * push normal chat bubbles into the conversation scroll.
 *
 * State machine mirrors the old modal — permission → idle → listening →
 * thinking → speaking → idle (loop) | error. <ready/> bubbles up via
 * onReady and the parent decides whether to auto-close and advance phase.
 */
export default function InlineVoicePanel({ active, onExit, category, onTurn, onReady }: Props) {
  const [phase, setPhase] = useState<Phase>('permission');
  const [error, setError] = useState<string | null>(null);
  const [lastTranscript, setLastTranscript] = useState<string>('');
  const [lastReply, setLastReply] = useState<string>('');
  const [turnCount, setTurnCount] = useState(0);
  // Hands-free mode auto-listens + auto-stops using in-browser VAD.
  // Persisted so returning users keep their preferred mode.
  const [handsFree, setHandsFree] = useState<boolean>(() => {
    try { return localStorage.getItem('homieVoiceHandsFree') !== 'false'; } catch { return true; }
  });

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mimeTypeRef = useRef<string>('audio/webm');
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const historyRef = useRef<HistoryMessage[]>([]);
  const recordingStartRef = useRef<number>(0);
  const lastAudioUrlRef = useRef<string | null>(null);
  // Mirror the handsFree state into a ref so async callbacks (mic permission,
  // playMp3 completion) read the latest value without needing to be in the
  // closure's dependency list.
  const handsFreeRef = useRef(handsFree);
  useEffect(() => {
    handsFreeRef.current = handsFree;
    try { localStorage.setItem('homieVoiceHandsFree', String(handsFree)); } catch { /* noop */ }
    // If the user flips ON hands-free while the panel's already idle, kick
    // off the listening loop so they don't have to tap anything. If they
    // flip it OFF mid-listening, drop the VAD so their current recording
    // requires a manual stop.
    if (!active) return;
    if (handsFree && streamRef.current && recorderRef.current === null) {
      // Only auto-start from idle (not during thinking/speaking etc.)
      const okPhase = ['idle', 'error'].includes(phase);
      if (okPhase) setTimeout(() => { if (handsFreeRef.current) startListening(); }, 100);
    } else if (!handsFree && phase === 'listening') {
      stopVAD();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handsFree]);

  // ── VAD (Voice Activity Detection) refs ──────────────────────────────────
  // Web Audio API-based silence detection. On each animation frame we sample
  // the mic's RMS volume; once we've heard speech AND then detected silence
  // for >SILENCE_DURATION_MS, we auto-finalize the turn.
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const vadRafRef = useRef<number | null>(null);
  const speechDetectedRef = useRef<boolean>(false);
  const silenceStartRef = useRef<number | null>(null);
  const speechStartRef = useRef<number | null>(null);
  // VAD thresholds — tuned for the typical laptop/phone mic after AGC kicks in
  const SILENCE_THRESHOLD = 0.02;     // RMS below this = silence
  const SILENCE_DURATION_MS = 1400;   // post-speech quiet window before auto-stop
  const MIN_SPEECH_DURATION_MS = 400; // ignore clicks and ultra-short triggers
  const MAX_RECORDING_MS = 30000;     // safety ceiling

  // ── Lifecycle ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!active) {
      tearDown();
      return;
    }
    // Reset everything on activation
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
  }, [active]);

  const tearDown = () => {
    stopVAD();
    try { recorderRef.current?.stop(); } catch { /* noop */ }
    recorderRef.current = null;
    try { streamRef.current?.getTracks().forEach(t => t.stop()); } catch { /* noop */ }
    streamRef.current = null;
    // Pause but DO NOT destroy the audio element — it's a module-level
    // singleton kept primed for iOS. Destroying it would require re-priming
    // on the next voice session, which won't be inside a user gesture.
    try { audioRef.current?.pause(); } catch { /* noop */ }
    if (lastAudioUrlRef.current) {
      try { URL.revokeObjectURL(lastAudioUrlRef.current); } catch { /* noop */ }
      lastAudioUrlRef.current = null;
    }
    chunksRef.current = [];
  };

  // ── VAD ────────────────────────────────────────────────────────────────────
  // Starts a requestAnimationFrame loop that samples the mic's RMS volume.
  // When we detect voice (>threshold) and then a silent stretch of
  // SILENCE_DURATION_MS, we auto-trigger stopListening. Also caps the total
  // recording length at MAX_RECORDING_MS as a safety belt.
  const startVAD = (stream: MediaStream) => {
    stopVAD();
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      audioContextRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);
      analyserRef.current = analyser;
      const dataArray = new Uint8Array(analyser.fftSize);

      speechDetectedRef.current = false;
      silenceStartRef.current = null;
      speechStartRef.current = null;

      const tick = () => {
        const a = analyserRef.current;
        if (!a) return;
        a.getByteTimeDomainData(dataArray);
        // RMS of the centered waveform (128 = silence baseline for u8)
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          const v = (dataArray[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / dataArray.length);
        const now = Date.now();

        // Total recording safety cap
        if (recordingStartRef.current && now - recordingStartRef.current >= MAX_RECORDING_MS) {
          stopListening();
          return;
        }

        if (rms > SILENCE_THRESHOLD) {
          // Voice heard — reset the silence timer and mark speech detected.
          if (!speechDetectedRef.current) {
            speechDetectedRef.current = true;
            speechStartRef.current = now;
          }
          silenceStartRef.current = null;
        } else if (speechDetectedRef.current) {
          // Post-speech quiet — start/continue the silence timer.
          if (silenceStartRef.current === null) {
            silenceStartRef.current = now;
          } else {
            const silenceElapsed = now - silenceStartRef.current;
            const speechElapsed = now - (speechStartRef.current ?? now);
            if (silenceElapsed >= SILENCE_DURATION_MS && speechElapsed >= MIN_SPEECH_DURATION_MS) {
              stopListening();
              return;
            }
          }
        }

        vadRafRef.current = requestAnimationFrame(tick);
      };
      vadRafRef.current = requestAnimationFrame(tick);
    } catch {
      // AudioContext not available — fall back silently, user can tap to stop
    }
  };

  const stopVAD = () => {
    if (vadRafRef.current !== null) {
      cancelAnimationFrame(vadRafRef.current);
      vadRafRef.current = null;
    }
    analyserRef.current = null;
    try { audioContextRef.current?.close(); } catch { /* noop */ }
    audioContextRef.current = null;
    speechDetectedRef.current = false;
    silenceStartRef.current = null;
    speechStartRef.current = null;
  };

  // ── Mic init ───────────────────────────────────────────────────────────────
  const pickMime = (): string => {
    const candidates = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4;codecs=mp4a.40.2',
      'audio/mp4',
      'audio/ogg;codecs=opus',
    ];
    for (const m of candidates) {
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
      // Hands-free: immediately start listening once the mic is ready. A tiny
      // delay lets React paint the "idle" state first so the user sees the
      // transition rather than jumping straight to "listening".
      if (handsFreeRef.current) {
        setTimeout(() => startListening(), 150);
      }
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
        stopVAD();
        void finalizeTurn();
      };
      recorderRef.current = rec;
      recordingStartRef.current = Date.now();
      rec.start(100);
      setPhase('listening');
      // Kick off VAD in hands-free mode — in manual mode the user will tap
      // to stop, so the volume-watching loop isn't needed.
      if (handsFreeRef.current) {
        startVAD(stream);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not start recording';
      setError(msg);
      setPhase('error');
    }
  };

  const stopListening = () => {
    const rec = recorderRef.current;
    if (!rec || rec.state === 'inactive') return;
    stopVAD();
    const elapsed = Date.now() - recordingStartRef.current;
    // In hands-free mode, VAD already filters out junk via MIN_SPEECH_DURATION,
    // so anything that makes it here is legitimate. In manual mode we still
    // want to guard against accidental taps shorter than 400ms.
    if (!handsFreeRef.current && elapsed < 400) {
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
          category: string | null;
        };
      };

      const { transcript, reply, audio_base64, audio_mime, is_ready, category: inferredCategory } = json.data;

      historyRef.current = [
        ...historyRef.current,
        { role: 'user', content: transcript },
        { role: 'assistant', content: reply },
      ];
      setLastTranscript(transcript);
      setLastReply(reply);
      setTurnCount((n) => n + 1);

      // Fire the turn callback immediately so the parent can push both
      // bubbles into the main chat while Homie's audio plays
      onTurn(transcript, reply, inferredCategory);

      await playMp3(audio_base64, audio_mime);

      if (is_ready) {
        // Hand off to parent — parent decides to close panel / advance phase
        onReady({
          transcript: buildTranscript(historyRef.current),
          history: [...historyRef.current],
        });
      } else {
        setPhase('idle');
        // Hands-free: auto-resume listening so the user can just keep
        // talking. Short delay gives React time to repaint idle before
        // we jump back to listening, and lets the mic settle after
        // Homie's playback stops.
        if (handsFreeRef.current && active) {
          setTimeout(() => {
            if (handsFreeRef.current && streamRef.current) startListening();
          }, 400);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong';
      // Hands-free: soft-recover from transient failures (empty Whisper
      // transcript from ambient noise, etc.) by quietly resuming listening
      // instead of parking on an error screen. Persistent errors will keep
      // firing — user can tap "back to typing" if something's really broken.
      if (handsFreeRef.current && active && /No speech detected|Whisper/i.test(msg)) {
        setPhase('idle');
        setTimeout(() => {
          if (handsFreeRef.current && streamRef.current) startListening();
        }, 500);
        return;
      }
      setError(msg);
      setPhase('error');
    }
  };

  // ── Audio playback ─────────────────────────────────────────────────────────
  // Reuses the shared HTMLAudioElement that was "primed" by the Talk-to-Homie
  // button click. Critical for iOS Safari — only an element .play()'d during
  // a user gesture is allowed to play later from async code.
  const playMp3 = useCallback((base64: string, mime: string) => new Promise<void>((resolve) => {
    const byteChars = atob(base64);
    const bytes = new Uint8Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) bytes[i] = byteChars.charCodeAt(i);
    const blob = new Blob([bytes], { type: mime || 'audio/mpeg' });
    const url = URL.createObjectURL(blob);
    if (lastAudioUrlRef.current) {
      try { URL.revokeObjectURL(lastAudioUrlRef.current); } catch { /* noop */ }
    }
    lastAudioUrlRef.current = url;

    const audio = getSharedAudio();
    audioRef.current = audio;
    // Reset any prior state (from silent-prime or a previous reply)
    audio.pause();
    audio.currentTime = 0;
    audio.src = url;
    audio.volume = 1;
    audio.onplay = () => setPhase('speaking');
    audio.onended = () => resolve();
    audio.onerror = () => resolve();
    const p = audio.play();
    if (p && typeof p.catch === 'function') {
      p.catch(() => resolve());
    }
  }), []);

  // ── Helpers ────────────────────────────────────────────────────────────────
  const handleDone = () => {
    if (historyRef.current.length === 0) {
      onExit();
      return;
    }
    onReady({
      transcript: buildTranscript(historyRef.current),
      history: [...historyRef.current],
    });
  };

  if (!active) return null;

  // ── Render ─────────────────────────────────────────────────────────────────
  // Colors per phase for the mic ring + button
  const ringColor =
    phase === 'listening' ? 'rgba(232,99,43,.55)' :
    phase === 'thinking'  ? 'rgba(0,0,0,.12)' :
    phase === 'speaking'  ? 'rgba(27,158,119,.4)' :
    phase === 'error'     ? 'rgba(255,120,110,.5)' :
    'rgba(0,0,0,.08)';

  const micBg =
    phase === 'listening' ? '#c94223' :
    phase === 'speaking'  ? G :
    phase === 'thinking'  ? DIM :
    phase === 'error'     ? '#ffb4a2' :
    O;

  return (
    <div
      style={{
        background: '#fff',
        border: `2px solid ${O}33`,
        borderRadius: 20,
        padding: 18,
        boxShadow: `0 16px 40px -20px ${O}55`,
        animation: 'fadeSlide 0.25s ease',
      }}
    >
      {/* Top row — exit link + hands-free toggle + status */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, gap: 10 }}>
        <button
          onClick={onExit}
          style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            padding: 0, fontSize: 12, color: DIM,
            fontFamily: "'DM Sans',sans-serif", fontWeight: 600,
          }}
        >
          ← back to typing
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Hands-free toggle — pill-shaped two-option switch */}
          <button
            onClick={() => setHandsFree(v => !v)}
            title={handsFree ? 'Switch to tap-to-record' : 'Switch to hands-free (auto-stop on silence)'}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '4px 10px', borderRadius: 999,
              background: handsFree ? `${O}18` : 'rgba(0,0,0,.04)',
              border: `1px solid ${handsFree ? O + '66' : BORDER}`,
              cursor: 'pointer', fontFamily: "'DM Sans',sans-serif",
              fontSize: 11, fontWeight: 700, color: handsFree ? O : DIM,
              letterSpacing: '.01em',
            }}
          >
            <span
              style={{
                width: 6, height: 6, borderRadius: '50%',
                background: handsFree ? O : DIM,
                boxShadow: handsFree ? `0 0 0 2px ${O}33` : 'none',
              }}
            />
            {handsFree ? 'Hands-free' : 'Tap to talk'}
          </button>
          <div
            style={{
              fontFamily: "'DM Mono',monospace", fontSize: 10,
              letterSpacing: 1.3, textTransform: 'uppercase',
              color: phase === 'error' ? '#c94223' : DIM, fontWeight: 700,
            }}
          >
            {phaseLabel(phase, turnCount)}
          </div>
        </div>
      </div>

      {/* Mic + action row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        {/* Mic button */}
        <button
          onClick={phase === 'idle' ? startListening : phase === 'listening' ? stopListening : undefined}
          disabled={phase !== 'idle' && phase !== 'listening'}
          aria-label={phase === 'listening' ? 'Stop recording' : 'Start recording'}
          style={{
            width: 64, height: 64, borderRadius: '50%',
            background: micBg,
            border: 'none',
            color: '#fff',
            cursor: phase === 'idle' || phase === 'listening' ? 'pointer' : 'not-allowed',
            boxShadow: `0 0 0 6px ${ringColor}, 0 10px 24px -8px ${O}66`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
            animation: phase === 'listening' ? 'homieInlinePulse 1.3s ease-out infinite' : 'none',
            transition: 'background 0.2s, box-shadow 0.2s',
          }}
        >
          {phase === 'listening' ? <StopIcon /> : <MicIcon />}
        </button>

        {/* Status + caption */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontFamily: "'Fraunces',serif", fontSize: 17,
              fontWeight: 600, lineHeight: 1.2, color: D,
            }}
          >
            {hintText(phase, handsFree)}
          </div>
          {(lastTranscript || phase === 'error') && (
            <div
              style={{
                marginTop: 4, fontSize: 12, color: DIM,
                fontFamily: "'DM Sans',sans-serif", lineHeight: 1.4,
                overflow: 'hidden', textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {phase === 'error' ? error : `“${lastTranscript}”`}
            </div>
          )}
        </div>
      </div>

      {/* Footer row — done shortcut + examples hint */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, paddingTop: 12, borderTop: `1px solid ${BORDER}`, gap: 10, flexWrap: 'wrap' }}>
        {lastReply ? (
          <div style={{ fontSize: 11, color: DIM, fontFamily: "'DM Sans',sans-serif", flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            <span style={{ color: O, fontWeight: 700 }}>Homie:</span> {lastReply}
          </div>
        ) : (
          <div style={{ fontSize: 11, color: DIM, fontFamily: "'DM Sans',sans-serif" }}>
            Tap the mic, then speak. Homie replies out loud.
          </div>
        )}
        {turnCount >= 1 && phase === 'idle' && (
          <button
            onClick={handleDone}
            style={{
              background: 'transparent', border: `1px solid ${BORDER}`,
              color: D, padding: '7px 14px', borderRadius: 999,
              fontFamily: "'DM Sans',sans-serif", fontSize: 12, fontWeight: 600,
              cursor: 'pointer', flexShrink: 0,
            }}
          >
            I'm done →
          </button>
        )}
        {phase === 'error' && (
          <button
            onClick={() => { setError(null); setPhase('idle'); }}
            style={{
              background: O, border: 'none', color: '#fff',
              padding: '7px 14px', borderRadius: 999,
              fontFamily: "'DM Sans',sans-serif", fontSize: 12, fontWeight: 600,
              cursor: 'pointer', flexShrink: 0,
            }}
          >
            Try again
          </button>
        )}
      </div>

      <style>{`
        @keyframes homieInlinePulse {
          0%   { box-shadow: 0 0 0 0 rgba(232,99,43,.55), 0 10px 24px -8px rgba(232,99,43,.4); }
          70%  { box-shadow: 0 0 0 18px rgba(232,99,43,0), 0 10px 24px -8px rgba(232,99,43,.4); }
          100% { box-shadow: 0 0 0 0 rgba(232,99,43,0),   0 10px 24px -8px rgba(232,99,43,.4); }
        }
      `}</style>
    </div>
  );
}

// ── Small svgs + helpers ─────────────────────────────────────────────────────

function MicIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <rect x="9" y="3" width="6" height="12" rx="3" fill="#fff" />
      <path d="M5 11a7 7 0 0 0 14 0" stroke="#fff" strokeWidth="2" strokeLinecap="round" fill="none" />
      <line x1="12" y1="18" x2="12" y2="21" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <rect x="3" y="3" width="10" height="10" rx="2" fill="#fff" />
    </svg>
  );
}

function phaseLabel(phase: Phase, turnCount: number): string {
  if (phase === 'permission') return 'Requesting mic…';
  if (phase === 'idle') return turnCount === 0 ? 'Ready' : `Turn ${turnCount + 1}`;
  if (phase === 'listening') return 'Listening…';
  if (phase === 'thinking') return 'Thinking…';
  if (phase === 'speaking') return 'Homie speaking';
  return 'Error';
}

function hintText(phase: Phase, handsFree: boolean): string {
  if (phase === 'permission') return 'Setting up the mic — allow access when prompted.';
  if (phase === 'idle') {
    return handsFree
      ? 'Just start talking — Homie will pick up automatically.'
      : "Tap the mic and describe what's going on.";
  }
  if (phase === 'listening') {
    return handsFree
      ? "Go ahead — I'll stop listening when you pause."
      : "Keep going — Homie's listening.";
  }
  if (phase === 'thinking') return 'Homie is thinking it over…';
  if (phase === 'speaking') return 'Homie is talking — listen up.';
  return 'Something went sideways — try again?';
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

// Keep these tokens referenced so lint stays quiet; they're held for theme clarity.
void W;
