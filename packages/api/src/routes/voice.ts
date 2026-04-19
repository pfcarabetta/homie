import { Router, Request, Response } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import logger from '../logger';
import { ApiResponse } from '../types/api';

const router = Router();

// ── Voice conversation endpoint ───────────────────────────────────────────────
//
// One turn of a voice conversation with Homie:
//   1. Whisper STT → transcribe what the user said
//   2. Claude → conversational reply (same diagnostic prompt, condensed for voice)
//   3. ElevenLabs TTS → synthesize the reply into mp3 audio
//
// Designed for the Quote flow's "Talk to Homie" fast path. Keeps conversation
// state client-side (history array on each request) so the backend is stateless.

interface VoiceTurnBody {
  /** Data URL (audio/webm or audio/mp4) from the browser's MediaRecorder */
  audio_data_url?: unknown;
  /** Prior turns — each entry is the transcript OR the reply text */
  history?: unknown;
  /** Optional hint from the UI (category tile already chosen) */
  category?: unknown;
  /** True on the first turn so we greet before asking */
  is_first?: unknown;
}

interface HistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

// Warm, conversational voice prompt. Distilled from the main diagnostic prompt
// with voice-specific rules: short replies, no markdown, no JSON tags (we parse
// <ready> separately). The Homie chat flow lives in GetQuotes.tsx so we don't
// need the full <diagnosis> emission here — just a friendly back-and-forth
// with a final <ready> marker when we have enough to draft a quote.
const VOICE_SYSTEM_PROMPT = `You are Homie, a friendly AI home maintenance assistant. The homeowner is TALKING to you out loud — your replies will be spoken back to them via text-to-speech.

VOICE RULES (critical):
- Keep replies SHORT — 1-2 sentences, ideally under 40 words
- Never use markdown (**, *, lists, headers, code blocks) — they get read as symbols
- Never use emoji — they get read as "emoji"
- Talk like a warm friend, not a contractor. "Got it — that pipe under the sink, right?" not "I understand your issue regarding the under-sink plumbing"
- Use contractions and natural filler words occasionally: "okay", "yeah", "hmm", "makes sense"
- One question at a time. Don't stack questions.

GOAL:
- Help the homeowner describe a home issue so we can match them with a Homie Pro
- Ask at most 3 focused follow-up questions (when it started, severity, location/symptoms)
- Never ask for zip code, address, or budget — the app collects that separately

CLASSIFY THE JOB:
On EVERY reply, after your spoken response, emit a hidden tag with your best category guess so the UI can show the right icon and cost range. Use exactly one of these IDs:
- plumbing (leaks, drains, toilets, faucets, water pressure)
- water_heater (hot water issues, tankless)
- septic_sewer (sewer backup, septic tank)
- electrical (outlets, breakers, wiring, lights flickering)
- hvac (AC, heat, furnace, thermostat)
- appliance (fridge, washer, dryer, dishwasher, oven)
- roofing (leaks from ceiling, shingles, gutters, siding)
- general (drywall, doors, shelves, handyman odds and ends)
- garage_door (opener, springs, off-track)
- locksmith (locked out, rekey, new lock)
- security_systems (cameras, alarms, doorbell cams)
- house_cleaning (recurring or one-time cleaning)
- landscaping (mowing, yard cleanup, garden)
- tree_trimming (trimming, removal, branches)
- pool (pool cleaning, green water, equipment)
- pest_control (ants, roaches, mice, RATS, termites, spiders, bed bugs, ANY rodent/insect/pest)
- painting (interior/exterior paint)
- flooring (hardwood, tile, carpet install/repair)
- kitchen_remodel (kitchen remodel, cabinets, counters)
- bathroom_remodel (bathroom remodel, shower, tub)
- other (only when nothing above fits)

Format: <category>ID</category> — for example <category>pest_control</category>.

Pick from memory of the FULL conversation so far, not just the latest turn. If the homeowner mentions rats/mice/pests/bugs at ANY point, the category stays pest_control even if later turns talk about drywall damage.

WHEN YOU HAVE ENOUGH:
After at most 3 follow-ups (or sooner if you have a clear picture), tell the homeowner you've got what you need and end your reply with the exact tag <ready/> on its own. Example:
"Alright, I've got enough to start matching you with a pro. <category>pest_control</category> <ready/>"

Do NOT include <ready/> on earlier turns — only the final one. Always include <category>ID</category>.`;

// ElevenLabs voice preset — "Adam" is warm/American/conversational and fits the
// friendly-Californian brief from the product spec. Override via env if needed.
const DEFAULT_VOICE_ID = 'pNInz6obpgDQGcFmaJgB'; // Adam

function parseDataUrl(input: string): { mime: string; buffer: Buffer } | null {
  // Data URL shape: data:<mime>[;param=value]*;base64,<payload>
  // Browsers frequently include codec params (e.g. "audio/webm;codecs=opus"),
  // so we capture everything between "data:" and ";base64," as the full MIME
  // descriptor, then strip params for the base type we return. The earlier
  // regex only allowed a single `;` before `base64`, which false-rejected any
  // recorder output that included codecs.
  const m = input.match(/^data:([^,]+);base64,(.+)$/);
  if (!m) return null;
  const fullMime = m[1];
  // Drop codec/charset params so downstream code sees a clean base MIME
  // (e.g. "audio/webm") — keeps Whisper's multipart upload simple and lets
  // mimeToWhisperFilename() work with a predictable input.
  const baseMime = fullMime.split(';')[0].trim().toLowerCase();
  return { mime: baseMime, buffer: Buffer.from(m[2], 'base64') };
}

// Turn a Whisper-friendly Buffer into a File the Whisper multipart upload
// expects. Whisper infers format from the filename extension so we map MIME
// to a sensible filename.
function mimeToWhisperFilename(mime: string): string {
  if (mime.includes('webm')) return 'audio.webm';
  if (mime.includes('mp4')) return 'audio.mp4';
  if (mime.includes('mpeg')) return 'audio.mp3';
  if (mime.includes('wav')) return 'audio.wav';
  if (mime.includes('ogg')) return 'audio.ogg';
  return 'audio.webm';
}

async function transcribeWithWhisper(buffer: Buffer, mime: string): Promise<string> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY is not configured');

  const filename = mimeToWhisperFilename(mime);
  const form = new FormData();
  const blob = new Blob([new Uint8Array(buffer)], { type: mime });
  form.append('file', blob, filename);
  form.append('model', 'whisper-1');
  form.append('language', 'en');
  form.append('response_format', 'json');
  form.append('temperature', '0');

  const r = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  });
  if (!r.ok) {
    const txt = await r.text().catch(() => '');
    throw new Error(`Whisper HTTP ${r.status}: ${txt.slice(0, 300)}`);
  }
  const json = (await r.json()) as { text?: string };
  return (json.text ?? '').trim();
}

async function synthesizeWithElevenLabs(text: string): Promise<Buffer> {
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

// ── POST /api/v1/voice/turn ──────────────────────────────────────────────────
router.post('/turn', async (req: Request, res: Response) => {
  const body = req.body as VoiceTurnBody;

  if (!body.audio_data_url || typeof body.audio_data_url !== 'string') {
    const out: ApiResponse<null> = { data: null, error: 'audio_data_url is required', meta: {} };
    res.status(400).json(out);
    return;
  }

  const parsed = parseDataUrl(body.audio_data_url);
  if (!parsed || !parsed.mime.startsWith('audio/')) {
    // Peek at the first ~40 chars of the URL prefix so we can see what shape
    // the frontend sent without logging the whole payload.
    const urlStr = body.audio_data_url as string;
    const prefix = urlStr.slice(0, Math.min(60, urlStr.indexOf(',') + 1 || 60));
    logger.warn({ prefix, detectedMime: parsed?.mime }, '[voice/turn] invalid audio_data_url shape');
    const out: ApiResponse<null> = { data: null, error: 'audio_data_url must be a base64 audio/* data URL', meta: {} };
    res.status(400).json(out);
    return;
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  const elKey = process.env.ELEVENLABS_API_KEY;
  if (!anthropicKey || !openaiKey || !elKey) {
    const out: ApiResponse<null> = {
      data: null,
      error: 'Voice service is not configured (missing ANTHROPIC_API_KEY, OPENAI_API_KEY, or ELEVENLABS_API_KEY)',
      meta: {},
    };
    res.status(503).json(out);
    return;
  }

  const history: HistoryMessage[] = Array.isArray(body.history)
    ? (body.history as unknown[])
        .map((m) => m as HistoryMessage)
        .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    : [];

  const categoryHint = typeof body.category === 'string' ? body.category : null;
  const isFirst = body.is_first === true;

  try {
    // 1. Whisper STT
    const transcript = await transcribeWithWhisper(parsed.buffer, parsed.mime);
    if (!transcript) {
      logger.warn('[voice/turn] empty Whisper transcript');
      const out: ApiResponse<null> = { data: null, error: 'No speech detected — try again', meta: {} };
      res.status(422).json(out);
      return;
    }

    // 2. Claude
    const client = new Anthropic({ apiKey: anthropicKey });
    const messages: Anthropic.MessageParam[] = [];

    // Seed with prior turns the client has accumulated
    for (const m of history) {
      messages.push({ role: m.role, content: m.content });
    }

    // Current user turn — prepend a tiny scaffold on the very first turn so
    // Homie greets warmly before diving in, and optionally carries the
    // category hint the homeowner already picked (if any).
    let userText = transcript;
    if (isFirst && categoryHint) {
      userText = `The homeowner already chose the "${categoryHint}" category. They said out loud: "${transcript}"`;
    } else if (isFirst) {
      userText = `The homeowner opened the voice channel and said: "${transcript}"`;
    }
    messages.push({ role: 'user', content: userText });

    const claudeRes = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 400,
      system: VOICE_SYSTEM_PROMPT,
      messages,
    });

    const firstBlock = claudeRes.content[0];
    const replyRaw = firstBlock && firstBlock.type === 'text' ? firstBlock.text : '';
    const isReady = /<ready\s*\/?\s*>/i.test(replyRaw);
    // Extract category hint (e.g. <category>pest_control</category>) so the
    // frontend can light up the right icon + cost estimate. Non-fatal if
    // missing — we fall back to whatever category the UI already had.
    const catMatch = replyRaw.match(/<category>\s*([a-z0-9_-]+)\s*<\/category>/i);
    const category = catMatch ? catMatch[1].toLowerCase() : null;
    // Strip both the <ready/> and <category>…</category> tags before TTS so
    // they don't get read aloud.
    const replyClean = replyRaw
      .replace(/<category>[\s\S]*?<\/category>/gi, '')
      .replace(/<ready\s*\/?\s*>/gi, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
    const replyForTts = replyClean || 'Got it. Give me a sec.';

    // 3. ElevenLabs TTS
    const audioBuf = await synthesizeWithElevenLabs(replyForTts);
    const audioBase64 = audioBuf.toString('base64');

    logger.info(
      { transcriptLen: transcript.length, replyLen: replyClean.length, isReady, category, turn: history.length / 2 + 1 },
      '[voice/turn] ok',
    );

    res.json({
      data: {
        category,
        transcript,
        reply: replyClean,
        audio_base64: audioBase64,
        audio_mime: 'audio/mpeg',
        is_ready: isReady,
      },
      error: null,
      meta: {},
    });
  } catch (err) {
    logger.error({ err }, '[POST /voice/turn]');
    const out: ApiResponse<null> = {
      data: null,
      error: err instanceof Error ? err.message : 'Voice service error',
      meta: {},
    };
    res.status(500).json(out);
  }
});

export default router;
