// ── iOS Safari audio output unlock ──────────────────────────────────────────
//
// iOS Safari refuses to play audio (via <audio>.play()) unless the call
// originates inside a synchronous user-gesture event handler — even
// lightly-async chains like `await fetch(...)` take us out of the
// allowed window. Once an audio element has been `.play()`'d during a
// gesture, though, the SAME element can be played programmatically from
// anywhere later.
//
// Strategy:
//   1. Create a single reusable <audio> element on first request.
//   2. When the user directly taps a trigger (e.g. "Talk to Homie"),
//      call `primeAudio()` — this .play()s a tiny silent mp3 on the
//      element while we're still inside the gesture window.
//   3. Subsequent playback calls (e.g. Homie's TTS reply) reuse that
//      same primed element by swapping its src + calling play(), and
//      iOS lets them through.

// 1-frame silent mp3 (~100 bytes) — enough to satisfy iOS's "played
// during a gesture" check without making a sound the user notices.
const SILENT_MP3 =
  'data:audio/mpeg;base64,//uQxAAAAAAAAAAAAAAAAAAAAAAASW5mbwAAAA8AAAACAAADQABVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV/////////////////////////////////////////wAAAABMYXZjNTcuMTAAAAAAAAAAAAAAAAAAACQAAAAAAAAAAADUAnuvAAAAAAAAAAAAAAAAAAAA//sQxAADwAABpAAAACAAADSAAAAETEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//sQxA0DwAABpAAAACAAADSAAAAEVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//sQxCmDwAABpAAAACAAADSAAAAEVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//sQxESDwAABpAAAACAAADSAAAAEVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//sQxGCDwAABpAAAACAAADSAAAAEVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//sQxHwDwAABpAAAACAAADSAAAAEVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//sQxJgDwAABpAAAACAAADSAAAAEVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//sQxLSDwAABpAAAACAAADSAAAAEVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//sQxNADwAABpAAAACAAADSAAAAEVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//sQxOyDwAABpAAAACAAADSAAAAEVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV';

let sharedAudio: HTMLAudioElement | null = null;
let primed = false;

/** Returns the shared audio element, creating it on first call. */
export function getSharedAudio(): HTMLAudioElement {
  if (!sharedAudio) {
    sharedAudio = new Audio();
    // Hint to the browser we'll be doing network-less playback
    sharedAudio.preload = 'auto';
    sharedAudio.autoplay = false;
  }
  return sharedAudio;
}

/**
 * Call this from within a synchronous user-gesture handler (click/touch)
 * to unlock audio output on iOS Safari. Safe to call repeatedly — only
 * the first call actually primes.
 */
export function primeAudio(): void {
  if (primed) return;
  const a = getSharedAudio();
  try {
    a.src = SILENT_MP3;
    a.volume = 0; // extra defensive — user shouldn't hear the silent ping
    const p = a.play();
    if (p && typeof p.catch === 'function') {
      p.catch(() => { /* gesture-less calls reject silently; that's fine */ });
    }
    // Restore volume for subsequent real playback
    a.volume = 1;
    primed = true;
  } catch {
    // Likely an old browser or a non-interactive context — not fatal
  }
}

/** For tests / diagnostics — true if primeAudio() has successfully fired. */
export function isAudioPrimed(): boolean {
  return primed;
}

// ── Shared TTS playback ──────────────────────────────────────────────────────
// Plays base64-encoded audio through the same primed <audio> element that
// later turn replies use. Resolves when playback finishes (or fails).

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

export function playBase64Audio(base64: string, mime: string): Promise<void> {
  return new Promise((resolve) => {
    try {
      const byteChars = atob(base64);
      const bytes = new Uint8Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) bytes[i] = byteChars.charCodeAt(i);
      const blob = new Blob([bytes], { type: mime || 'audio/mpeg' });
      const url = URL.createObjectURL(blob);
      const audio = getSharedAudio();
      audio.pause();
      audio.currentTime = 0;
      audio.src = url;
      audio.volume = 1;
      const cleanup = () => { try { URL.revokeObjectURL(url); } catch { /* noop */ } resolve(); };
      audio.onended = cleanup;
      audio.onerror = cleanup;
      const p = audio.play();
      if (p && typeof p.catch === 'function') p.catch(cleanup);
    } catch {
      resolve();
    }
  });
}

/**
 * Fetches TTS audio for the given text from the backend and plays it
 * through the shared audio element. Resolves when playback finishes.
 * Best-effort: silently resolves if the network or playback fails so the
 * caller can continue the conversation.
 */
export async function playTtsText(text: string): Promise<void> {
  try {
    const r = await fetch(`${API_BASE}/api/v1/voice/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!r.ok) return;
    const json = await r.json() as { data?: { audio_base64?: string; audio_mime?: string } };
    const data = json?.data;
    if (!data?.audio_base64) return;
    await playBase64Audio(data.audio_base64, data.audio_mime || 'audio/mpeg');
  } catch {
    // TTS is a nice-to-have for the greeting — if the network hiccups or
    // ElevenLabs is saturated, fall through without blocking the flow.
  }
}
