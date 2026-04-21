import logger from '../logger';
import { uploadFile } from './image-upload';

/**
 * Shared ElevenLabs text-to-speech service.
 *
 * Originally lived inside `routes/voice.ts` for the in-app voice/video chat
 * feature. Extracted here so all surfaces — voice/video chat, outreach phone
 * calls (Homie consumer, Homie Business, Homie Inspect), and any future
 * audio surfaces — share the same Adam voice and model settings.
 *
 * The voice ID + model + voice_settings here are the canonical defaults.
 * Callers should NOT clone the fetch logic; import `synthesizeWithElevenLabs`
 * (raw Buffer) or `synthesizeAndUploadAudio` (Cloudinary URL ready to drop
 * into Twilio's <Play> verb) instead.
 */

// "Adam" — warm/American/conversational. Override via env if a future
// product decision picks a different voice.
export const DEFAULT_VOICE_ID = 'pNInz6obpgDQGcFmaJgB';

export async function synthesizeWithElevenLabs(text: string): Promise<Buffer> {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error('ELEVENLABS_API_KEY is not configured');

  const voiceId = process.env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE_ID;
  const r = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': key,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_turbo_v2_5',
        voice_settings: {
          stability: 0.45,
          similarity_boost: 0.75,
          style: 0.35,
          use_speaker_boost: true,
        },
      }),
    },
  );
  if (!r.ok) {
    const txt = await r.text().catch(() => '');
    throw new Error(`ElevenLabs HTTP ${r.status}: ${txt.slice(0, 300)}`);
  }
  const ab = await r.arrayBuffer();
  return Buffer.from(ab);
}

/**
 * Synthesize `text` via ElevenLabs and upload the resulting MP3 to
 * Cloudinary. Returns a public URL ready to drop into a Twilio <Play>
 * verb. Returns null on any failure so callers can fall back to Polly
 * without breaking the call.
 */
export async function synthesizeAndUploadAudio(
  text: string,
  folder = 'homie/outreach-voice',
): Promise<string | null> {
  if (!process.env.ELEVENLABS_API_KEY) return null;
  try {
    const buffer = await synthesizeWithElevenLabs(text);
    const dataUrl = `data:audio/mpeg;base64,${buffer.toString('base64')}`;
    const result = await uploadFile(dataUrl, folder);
    return result?.url ?? null;
  } catch (err) {
    logger.warn({ err, textPreview: text.slice(0, 80) }, '[tts] synthesizeAndUploadAudio failed');
    return null;
  }
}

/**
 * Static-prompt cache for short repeated lines like "Are you interested
 * in this job?" or "I didn't catch that." We synthesize + upload once
 * per process and reuse the URL across every call, saving both
 * ElevenLabs credits and Cloudinary uploads.
 */
const cachedAudioUrls = new Map<string, string>();
const inFlightAudioPromises = new Map<string, Promise<string | null>>();

/**
 * Cached variant — only call for STATIC text. Identical input always
 * returns the same Cloudinary URL for the lifetime of the process.
 */
export async function getCachedAudioUrl(
  key: string,
  text: string,
  folder = 'homie/outreach-voice/static',
): Promise<string | null> {
  const existing = cachedAudioUrls.get(key);
  if (existing) return existing;
  const inFlight = inFlightAudioPromises.get(key);
  if (inFlight) return inFlight;
  const p = synthesizeAndUploadAudio(text, folder).then(url => {
    inFlightAudioPromises.delete(key);
    if (url) cachedAudioUrls.set(key, url);
    return url;
  });
  inFlightAudioPromises.set(key, p);
  return p;
}
