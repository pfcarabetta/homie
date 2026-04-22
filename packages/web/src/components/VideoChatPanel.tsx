import { useCallback, useEffect, useRef, useState } from 'react';
import { getSharedAudio, primeAudio, playTtsText } from './audioUnlocker';
import { pickGreeting } from './voiceGreetings';

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
  active: boolean;
  onExit: () => void;
  category?: string | null;
  /** Homeowner's first name (when known) — personalizes the greeting. */
  firstName?: string | null;
  /**
   * Optional business context — multi-line string with property,
   * occupancy, and known equipment. Passed to the backend on every
   * turn so Claude grounds its replies in the real property state.
   * Only used by the Homie Business surface.
   */
  businessContext?: string | null;
  /**
   * Called after every successful turn. `category` is Homie's classifier
   * output (or null). Parent pushes both sides of the exchange into the
   * main chat scroll. `equipmentDiscovered` carries any <equipment>
   * blocks Homie emitted this turn (visual ID of an appliance from the
   * video frame, brand/model the PM spoke) so the parent can persist
   * them to Property IQ.
   */
  onTurn: (
    user: string,
    assistant: string,
    category: string | null,
    equipmentDiscovered?: Array<Record<string, unknown>>,
  ) => void;
  /** Fires on <ready/> or when the user hits "I'm done". */
  onReady: (payload: {
    transcript: string;
    history: HistoryMessage[];
    urgency?: 'today' | 'tomorrow' | 'this_week' | 'flexible' | null;
  }) => void;
}

/**
 * In-page video chat panel. Shares the audio/VAD/TTS plumbing with
 * InlineVoicePanel but also:
 *  - requests camera + mic together (back camera on mobile)
 *  - renders a live <video> preview
 *  - captures the current frame when a turn ends and sends it alongside
 *    the audio so Claude can reason about what it sees (brand/model,
 *    visible damage, etc.)
 *
 * Turns echo into the main chat via onTurn, same shape as the voice-only
 * panel, so downstream plumbing (status card, diagnosis, Continue button)
 * works identically.
 */
export default function VideoChatPanel({ active, onExit, category, firstName, businessContext, onTurn, onReady }: Props) {
  const [phase, setPhase] = useState<Phase>('permission');
  const [error, setError] = useState<string | null>(null);
  const [lastTranscript, setLastTranscript] = useState<string>('');
  const [lastReply, setLastReply] = useState<string>('');
  const [turnCount, setTurnCount] = useState(0);
  const [handsFree, setHandsFree] = useState<boolean>(() => {
    try { return localStorage.getItem('homieVoiceHandsFree') !== 'false'; } catch { return true; }
  });
  const [frameFlash, setFrameFlash] = useState(false);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mimeTypeRef = useRef<string>('audio/webm');
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const historyRef = useRef<HistoryMessage[]>([]);
  const recordingStartRef = useRef<number>(0);
  const lastAudioUrlRef = useRef<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const handsFreeRef = useRef(handsFree);
  useEffect(() => {
    handsFreeRef.current = handsFree;
    try { localStorage.setItem('homieVoiceHandsFree', String(handsFree)); } catch { /* noop */ }
    if (!active) return;
    if (handsFree && streamRef.current && recorderRef.current === null) {
      if (['idle', 'error'].includes(phase)) setTimeout(() => { if (handsFreeRef.current) startListening(); }, 100);
    } else if (!handsFree && phase === 'listening') {
      stopVAD();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handsFree]);

  // VAD refs — same pattern as InlineVoicePanel
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const vadRafRef = useRef<number | null>(null);
  const speechDetectedRef = useRef<boolean>(false);
  const silenceStartRef = useRef<number | null>(null);
  const speechStartRef = useRef<number | null>(null);
  const SILENCE_THRESHOLD = 0.02;
  const SILENCE_DURATION_MS = 1400;
  const MIN_SPEECH_DURATION_MS = 400;
  const MAX_RECORDING_MS = 30000;

  // ── Lifecycle ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!active) { tearDown(); return; }
    setPhase('permission');
    setError(null);
    setLastTranscript('');
    setLastReply('');
    setTurnCount(0);
    historyRef.current = [];
    void requestCamAndMic();
    return () => { tearDown(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const tearDown = () => {
    stopVAD();
    try { recorderRef.current?.stop(); } catch { /* noop */ }
    recorderRef.current = null;
    try { streamRef.current?.getTracks().forEach(t => t.stop()); } catch { /* noop */ }
    streamRef.current = null;
    if (videoRef.current) {
      try { videoRef.current.srcObject = null; } catch { /* noop */ }
    }
    try { audioRef.current?.pause(); } catch { /* noop */ }
    if (lastAudioUrlRef.current) {
      try { URL.revokeObjectURL(lastAudioUrlRef.current); } catch { /* noop */ }
      lastAudioUrlRef.current = null;
    }
    chunksRef.current = [];
  };

  // ── VAD ────────────────────────────────────────────────────────────────────
  const startVAD = (stream: MediaStream) => {
    stopVAD();
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      audioContextRef.current = ctx;
      // Only tap the audio tracks so VAD doesn't chew on the video track's
      // bitstream (which wouldn't produce useful RMS anyway)
      const audioOnly = new MediaStream(stream.getAudioTracks());
      const source = ctx.createMediaStreamSource(audioOnly);
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
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          const v = (dataArray[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / dataArray.length);
        const now = Date.now();

        if (recordingStartRef.current && now - recordingStartRef.current >= MAX_RECORDING_MS) {
          stopListening();
          return;
        }

        if (rms > SILENCE_THRESHOLD) {
          if (!speechDetectedRef.current) {
            speechDetectedRef.current = true;
            speechStartRef.current = now;
          }
          silenceStartRef.current = null;
        } else if (speechDetectedRef.current) {
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
    } catch { /* fall back silently */ }
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

  // ── Camera + mic request ───────────────────────────────────────────────────
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

  const requestCamAndMic = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        // Prefer the back camera on mobile so users point at the issue, not
        // at themselves. Falls back to whatever's available on desktop.
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      streamRef.current = stream;
      mimeTypeRef.current = pickMime();
      // Wire the stream into the <video> preview
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.playsInline = true;
        videoRef.current.muted = true; // we don't want to feedback-loop our own mic
        try { await videoRef.current.play(); } catch { /* noop */ }
      }
      setPhase('idle');
      // Greet before we start listening so the homeowner hears Homie
      // acknowledge them by name before they need to speak. Seeds the
      // history so Claude gets the greeting as context on the first
      // real user turn.
      const greeting = pickGreeting(firstName);
      historyRef.current = [{ role: 'assistant', content: greeting }];
      setLastReply(greeting);
      setPhase('speaking');
      await playTtsText(greeting);
      if (!active) return;
      setPhase('idle');
      if (handsFreeRef.current) setTimeout(() => startListening(), 250);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Camera / microphone permission denied';
      setError(msg);
      setPhase('error');
    }
  };

  // ── Recording ──────────────────────────────────────────────────────────────
  const startListening = () => {
    const stream = streamRef.current;
    if (!stream) return;
    try {
      // Record audio tracks only — we send frames separately, no need to
      // bundle the video bitstream into the audio blob.
      const audioOnly = new MediaStream(stream.getAudioTracks());
      const rec = new MediaRecorder(audioOnly, { mimeType: mimeTypeRef.current });
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
      if (handsFreeRef.current) startVAD(stream);
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
    if (!handsFreeRef.current && elapsed < 400) {
      try { rec.stop(); } catch { /* noop */ }
      recorderRef.current = null;
      chunksRef.current = [];
      setPhase('idle');
      return;
    }
    try { rec.stop(); } catch { /* noop */ }
  };

  // ── Frame capture ──────────────────────────────────────────────────────────
  // Grabs the current <video> frame into the offscreen <canvas>, downscales
  // so the longest edge is ≤1024px (Claude handles anything, but we don't
  // need 4k), and returns a base64 JPEG data URL at 60% quality. Typical
  // output ~60-180KB.
  const captureFrame = (): string | null => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return null;
    if (video.readyState < 2) return null; // no frame yet
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) return null;
    const MAX = 1024;
    const scale = Math.min(1, MAX / Math.max(vw, vh));
    const w = Math.round(vw * scale);
    const h = Math.round(vh * scale);
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, w, h);
    try {
      return canvas.toDataURL('image/jpeg', 0.6);
    } catch {
      return null;
    }
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

    // Snap the frame NOW — same moment as the audio cutoff, so the image
    // reflects what the user was pointing at when they stopped talking.
    const frameDataUrl = captureFrame();
    if (frameDataUrl) {
      setFrameFlash(true);
      setTimeout(() => setFrameFlash(false), 200);
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
          frame_data_url: frameDataUrl,
          history: historyRef.current,
          category: category ?? null,
          business_context: businessContext ?? null,
          is_first: isFirst,
        }),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error((body as { error?: string })?.error || `Video turn failed (${r.status})`);
      }
      const json = (await r.json()) as {
        data: {
          transcript: string;
          reply: string;
          audio_base64: string;
          audio_mime: string;
          is_ready: boolean;
          category: string | null;
          urgency?: 'today' | 'tomorrow' | 'this_week' | 'flexible' | null;
          equipment_discovered?: Array<Record<string, unknown>>;
        };
      };

      const { transcript, reply, audio_base64, audio_mime, is_ready, category: inferredCategory, urgency, equipment_discovered } = json.data;

      historyRef.current = [
        ...historyRef.current,
        { role: 'user', content: transcript },
        { role: 'assistant', content: reply },
      ];
      setLastTranscript(transcript);
      setLastReply(reply);
      setTurnCount(n => n + 1);
      onTurn(transcript, reply, inferredCategory, equipment_discovered);

      await playMp3(audio_base64, audio_mime);

      if (is_ready) {
        onReady({
          transcript: buildTranscript(historyRef.current),
          history: [...historyRef.current],
          urgency: urgency ?? null,
        });
      } else {
        setPhase('idle');
        if (handsFreeRef.current && active) {
          setTimeout(() => {
            if (handsFreeRef.current && streamRef.current) startListening();
          }, 400);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong';
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

  // ── Playback ───────────────────────────────────────────────────────────────
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
    audio.pause();
    audio.currentTime = 0;
    audio.src = url;
    audio.volume = 1;
    audio.onplay = () => setPhase('speaking');
    audio.onended = () => resolve();
    audio.onerror = () => resolve();
    const p = audio.play();
    if (p && typeof p.catch === 'function') p.catch(() => resolve());
  }), []);

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

  const micBg =
    phase === 'listening' ? '#c94223' :
    phase === 'speaking'  ? G :
    phase === 'thinking'  ? DIM :
    phase === 'error'     ? '#ffb4a2' :
    O;
  const ringColor =
    phase === 'listening' ? 'rgba(232,99,43,.55)' :
    phase === 'thinking'  ? 'rgba(0,0,0,.12)' :
    phase === 'speaking'  ? 'rgba(27,158,119,.4)' :
    phase === 'error'     ? 'rgba(255,120,110,.5)' :
    'rgba(0,0,0,.08)';

  return (
    <div
      style={{
        background: '#fff',
        border: `2px solid ${O}33`,
        borderRadius: 20,
        padding: 16,
        boxShadow: `0 16px 40px -20px ${O}55`,
        animation: 'fadeSlide 0.25s ease',
        maxWidth: '100%',
      }}
    >
      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, gap: 10 }}>
        <button
          onClick={onExit}
          style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, fontSize: 12, color: DIM, fontFamily: "'DM Sans',sans-serif", fontWeight: 600 }}
        >
          ← back to typing
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
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
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: handsFree ? O : DIM, boxShadow: handsFree ? `0 0 0 2px ${O}33` : 'none' }} />
            {handsFree ? 'Hands-free' : 'Tap to talk'}
          </button>
          <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 10, letterSpacing: 1.3, textTransform: 'uppercase', color: phase === 'error' ? '#c94223' : DIM, fontWeight: 700 }}>
            {phaseLabel(phase, turnCount)}
          </div>
        </div>
      </div>

      {/* Video preview — core of the panel */}
      <div
        style={{
          position: 'relative',
          aspectRatio: '4 / 3',
          borderRadius: 14,
          overflow: 'hidden',
          background: '#000',
          marginBottom: 12,
          border: `1px solid ${BORDER}`,
        }}
      >
        {/* The live camera feed */}
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', background: '#000' }}
        />
        {/* Hidden canvas used for frame capture */}
        <canvas ref={canvasRef} style={{ display: 'none' }} />
        {/* Capture flash — subtle brightening when we snap a frame */}
        {frameFlash && (
          <div
            aria-hidden
            style={{
              position: 'absolute', inset: 0,
              background: 'rgba(255,255,255,.5)',
              animation: 'homieFrameFlash 0.2s ease-out',
              pointerEvents: 'none',
            }}
          />
        )}
        {/* Small indicators top-left */}
        <div
          style={{
            position: 'absolute', top: 10, left: 10,
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '4px 10px 4px 8px', borderRadius: 100,
            background: 'rgba(0,0,0,.55)', color: '#fff',
            fontFamily: "'DM Mono',monospace", fontSize: 10,
            letterSpacing: 1, textTransform: 'uppercase', fontWeight: 700,
            backdropFilter: 'blur(8px)',
          }}
        >
          <span
            style={{
              width: 6, height: 6, borderRadius: '50%',
              background: phase === 'listening' ? '#ff5656' : phase === 'speaking' ? G : 'rgba(255,255,255,.7)',
              animation: phase === 'listening' ? 'pulse 1s infinite' : 'none',
            }}
          />
          {phase === 'listening' ? 'REC' : phase === 'speaking' ? 'HOMIE' : phase === 'thinking' ? 'SYNC' : 'LIVE'}
        </div>
      </div>

      {/* Mic row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <button
          onClick={phase === 'idle' ? startListening : phase === 'listening' ? stopListening : undefined}
          disabled={phase !== 'idle' && phase !== 'listening'}
          aria-label={phase === 'listening' ? 'Stop recording' : 'Start recording'}
          style={{
            width: 56, height: 56, borderRadius: '50%',
            background: micBg,
            border: 'none', color: '#fff',
            cursor: phase === 'idle' || phase === 'listening' ? 'pointer' : 'not-allowed',
            boxShadow: `0 0 0 5px ${ringColor}, 0 8px 20px -6px ${O}66`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
            animation: phase === 'listening' ? 'homieVoicePulse 1.3s ease-out infinite' : 'none',
            transition: 'background 0.2s, box-shadow 0.2s',
          }}
        >
          {phase === 'listening' ? <StopIcon /> : <MicIcon />}
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "'Fraunces',serif", fontSize: 16, fontWeight: 600, lineHeight: 1.2, color: D }}>
            {hintText(phase, handsFree)}
          </div>
          {(lastTranscript || phase === 'error') && (
            <div style={{ marginTop: 3, fontSize: 12, color: DIM, fontFamily: "'DM Sans',sans-serif", lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {phase === 'error' ? error : `"${lastTranscript}"`}
            </div>
          )}
        </div>
      </div>

      {/* Footer with reply + done */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, paddingTop: 10, borderTop: `1px solid ${BORDER}`, gap: 10, flexWrap: 'wrap' }}>
        {lastReply ? (
          <div style={{ fontSize: 11, color: DIM, fontFamily: "'DM Sans',sans-serif", flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            <span style={{ color: O, fontWeight: 700 }}>Homie:</span> {lastReply}
          </div>
        ) : (
          <div style={{ fontSize: 11, color: DIM, fontFamily: "'DM Sans',sans-serif" }}>
            Point the camera at the issue. Homie can see it.
          </div>
        )}
        {turnCount >= 1 && phase === 'idle' && (
          <button
            onClick={handleDone}
            style={{ background: 'transparent', border: `1px solid ${BORDER}`, color: D, padding: '7px 14px', borderRadius: 999, fontFamily: "'DM Sans',sans-serif", fontSize: 12, fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}
          >
            I'm done →
          </button>
        )}
        {phase === 'error' && (
          <button
            onClick={() => { setError(null); setPhase('idle'); primeAudio(); }}
            style={{ background: O, border: 'none', color: '#fff', padding: '7px 14px', borderRadius: 999, fontFamily: "'DM Sans',sans-serif", fontSize: 12, fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}
          >
            Try again
          </button>
        )}
      </div>

      <style>{`
        @keyframes homieVoicePulse {
          0%   { box-shadow: 0 0 0 0 rgba(232,99,43,.55), 0 8px 20px -6px rgba(232,99,43,.4); }
          70%  { box-shadow: 0 0 0 16px rgba(232,99,43,0), 0 8px 20px -6px rgba(232,99,43,.4); }
          100% { box-shadow: 0 0 0 0 rgba(232,99,43,0),   0 8px 20px -6px rgba(232,99,43,.4); }
        }
        @keyframes homieFrameFlash {
          0% { opacity: 0.5; }
          100% { opacity: 0; }
        }
      `}</style>
    </div>
  );
}

// ── Small svgs + helpers (shared shapes with InlineVoicePanel) ──────────────

function MicIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
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

function phaseLabel(phase: Phase, turnCount: number): string {
  if (phase === 'permission') return 'Cam + mic';
  if (phase === 'idle') return turnCount === 0 ? 'Live' : `Turn ${turnCount + 1}`;
  if (phase === 'listening') return 'Listening…';
  if (phase === 'thinking') return 'Looking…';
  if (phase === 'speaking') return 'Homie';
  return 'Error';
}

function hintText(phase: Phase, handsFree: boolean): string {
  if (phase === 'permission') return 'Allow camera + mic when prompted.';
  if (phase === 'idle') {
    return handsFree
      ? 'Show Homie the issue and describe it — auto-paced.'
      : 'Tap the mic and show the issue while you describe it.';
  }
  if (phase === 'listening') {
    return handsFree
      ? "Go ahead — I'm watching and listening."
      : "Keep going — I'm watching.";
  }
  if (phase === 'thinking') return 'Homie is looking at what you showed…';
  if (phase === 'speaking') return 'Homie is talking — listen up.';
  return 'Something went sideways — try again?';
}

function buildTranscript(history: HistoryMessage[]): string {
  return history
    .filter(m => m.role === 'user')
    .map(m => m.content.trim())
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

// Kill unused-var warnings for theme tokens kept for clarity
void W;
