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
