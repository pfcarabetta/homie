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
  /**
   * Optional JPEG/PNG data URL of the current video frame — sent by the
   * video-chat panel each turn. When present, we switch to the
   * vision-aware system prompt so Claude can describe what it sees.
   */
  frame_data_url?: unknown;
  /** Prior turns — each entry is the transcript OR the reply text */
  history?: unknown;
  /** Optional hint from the UI (category tile already chosen) */
  category?: unknown;
  /**
   * Optional multi-line context string from the Business surface:
   * property, occupancy, known inventory. Prepended to the first-turn
   * user message so Claude grounds its replies in the actual property.
   */
  business_context?: unknown;
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
- roofing (leaks from ceiling, shingles)
- gutter (gutter cleaning, gutter guards, downspouts)
- chimney (chimney sweep, inspection, cap, damper, smoke inside)
- general (drywall, doors, shelves, TV mounts, handyman odds and ends)
- garage_door (opener, springs, off-track)
- locksmith (locked out, rekey, new lock)
- security_systems (cameras, alarms, doorbell cams)
- house_cleaning (RECURRING or one-time indoor cleaning — does NOT include pressure washing)
- window_cleaning (exterior window washing, interior + exterior combos)
- pressure_washing (power wash / pressure wash: patios, decks, driveways, siding, fences, concrete — ANY outdoor surface hose-down)
- landscaping (mowing, yard cleanup, garden, hedge)
- tree_trimming (trimming, removal, branches, stump)
- deck_patio (build, repair, stain/seal a deck or patio — NOT cleaning)
- fencing (new fence, fence repair, gates)
- pool (pool cleaning, green water, equipment)
- pest_control (ants, roaches, mice, RATS, termites, spiders, bed bugs, ANY rodent/insect/pest)
- painting (interior/exterior paint)
- flooring (hardwood, tile, carpet install/repair)
- kitchen_remodel (kitchen remodel, cabinets, counters)
- bathroom_remodel (bathroom remodel, shower, tub)
- moving (moving/relocating)
- junk_removal (haul away, junk removal, debris)
- other (only when nothing above fits)

Format: <category>ID</category> — for example <category>pest_control</category>.

Pick from memory of the FULL conversation so far, not just the latest turn. If the homeowner mentions rats/mice/pests/bugs at ANY point, the category stays pest_control even if later turns talk about drywall damage.

IMPORTANT TAXONOMY NOTES:
- "Power washing" / "pressure washing" the patio/deck/driveway/house/siding/fence is ALWAYS pressure_washing. Never house_cleaning.
- Gutter cleaning is gutter, not house_cleaning.
- Deck staining / repair is deck_patio; pressure-washing the deck before staining is pressure_washing.

WHEN YOU HAVE ENOUGH:
After at most 3 follow-ups (or sooner if you have a clear picture), tell the homeowner you've got what you need and end your reply with the exact tag <ready/> on its own. Example:
"Alright, I've got enough to start matching you with a pro. <category>pressure_washing</category> <ready/>"

Do NOT include <ready/> on earlier turns — only the final one. Always include <category>ID</category>.`;

// Video-chat system prompt — same rules as voice, plus vision awareness.
// Claude receives the current video frame alongside the transcript so it
// can describe what it sees (brand, model, visible damage, etc.) and
// guide the homeowner to reveal the right details.
const VIDEO_SYSTEM_PROMPT = `You are Homie, a friendly AI home maintenance assistant on a live VIDEO call with the homeowner. They're holding their phone and pointing the camera at the issue. You can SEE what they're showing you AND HEAR what they're saying.

YOU CAN SEE — LEAN INTO IT:
- Identify brand/model of appliances from visible labels ("Looks like a Samsung dishwasher, is that right?")
- Spot visible damage: leaks, rust, cracks, burn marks, stains, discoloration, frayed wires, standing water
- Reference details directly ("That crack along the base — is that new?") ("I see the drip right there at the valve")
- If the frame is blurry, dark, or not showing the issue, ask the homeowner to move closer, turn on a light, or angle differently
- Ask for specific shots: model-number sticker, inside the panel, the connection at the back, the leak when it happens

VOICE RULES (your reply will be spoken):
- Keep replies SHORT — 1-2 sentences, ideally under 40 words
- Never use markdown or emoji (get read as symbols)
- Talk like a warm friend: "Yeah, I see that — that's a classic sign of…"
- One question at a time

GOAL:
- Gather enough to brief a pro: what it is, what's wrong, when it started, severity
- Ask for brand/model when relevant (you can often read it off the frame)
- Never ask for zip, address, or budget — collected separately

CLASSIFY THE JOB:
On EVERY reply, after your spoken response, emit a hidden tag with your best category guess using exactly one of:
plumbing, water_heater, septic_sewer, electrical, hvac, appliance, roofing, gutter, chimney, general, garage_door, locksmith, security_systems, house_cleaning, window_cleaning, pressure_washing, landscaping, tree_trimming, deck_patio, fencing, pool, pest_control, painting, flooring, kitchen_remodel, bathroom_remodel, moving, junk_removal, other.

IMPORTANT TAXONOMY NOTES:
- "Power washing" / "pressure washing" the patio/deck/driveway/house/siding/fence is ALWAYS pressure_washing. Never house_cleaning.
- Gutter cleaning is gutter, not house_cleaning.
- Deck staining / repair is deck_patio; pressure-washing the deck before staining is pressure_washing.

Format: <category>ID</category>. Use the FULL conversation context — if the first frame shows a dishwasher, it stays 'appliance' even if later turns reveal drywall damage from the leak.

WHEN YOU HAVE ENOUGH:
After at most 3-4 turns (or sooner if the picture is clear), wrap up and end with <ready/>. Example:
"Alright, I've got a good picture of what's going on. <category>appliance</category> <ready/>"

Do NOT include <ready/> on earlier turns. Always include <category>ID</category>.`;

// Appended to the system prompt when the caller is a property manager using
// the Homie Business surface. Shifts the persona just enough that Homie
// asks PM-appropriate questions (unit number, access, guest impact) rather
// than owner-flavoured ones ("when did YOU first notice it?").
const BUSINESS_SYSTEM_SUFFIX = `\n\nYOU'RE ON A CALL WITH A PROPERTY MANAGER of short-term rentals / managed properties — NOT the end-user homeowner. This property is part of a portfolio the PM operates (guests check in and out; the PM coordinates maintenance and turnover). Speak to them like a dispatcher/ops partner, not a homeowner.

A CONTEXT block at the start of the first user turn carries: property address + size, occupancy status, current guest + checkout date, next guest + check-in date, the next few upcoming reservations, saved property notes, every saved equipment section (HVAC / water heater / plumbing fixtures / appliances / electrical / pool-spa / exterior), and the full Property IQ scan inventory (every known appliance + system with brand, model, age, condition).

BEFORE asking ANY clarifying question, scan the CONTEXT top to bottom. If the answer is already there, USE IT and don't ask. Specifically:

EQUIPMENT / PROPERTY DETAILS — already on file:
- When the PM mentions an appliance or system, check both the "Property IQ inventory" list and the saved sections ("Appliances:", "HVAC:", "Water heater:", "Plumbing:", "Electrical:", "Pool/Spa:", "Exterior:") for a matching entry. Reference the brand/model/age on file verbatim ("the Samsung DW80N3030US dishwasher", "the 8-year-old Trane XR16 AC") instead of asking "what brand is it?" or "how old is it?"
- If the PM says "the dishwasher is leaking" and the inventory lists a Samsung dishwasher, speak about the Samsung dishwasher — do NOT ask which one or what brand.
- Only ask for equipment details that are NOT in the CONTEXT. If an item appears in neither the saved sections nor the inventory, then ask.

OCCUPANCY-DRIVEN URGENCY — read the "Status:" line and use it to shape the conversation:
- OCCUPIED (guest on-property right now): factor guest impact into every recommendation. If the issue blocks the guest (no hot water, AC out, clogged toilet, smoke alarm), treat it as immediate — ask about access permission and expected guest disruption. If it's non-blocking (cosmetic, outdoor), suggest scheduling after checkout so the guest isn't bothered. Reference the checkout date when framing timing ("could be scheduled the morning after checkout on Fri Nov 8").
- VACANT with IMMINENT check-in (≤1 day) or TIGHT turnover (≤3 days): flag time pressure explicitly. The repair has to be completed BEFORE the next guest arrives — recommend dispatching today/tomorrow and mention the deadline. Treat this as urgent even if the underlying issue would normally be low-priority.
- VACANT with a longer runway (4+ days): lots of dispatch flexibility — suggest scheduling within the window that works for the provider, reference the next check-in as the soft deadline.
- VACANT with NO upcoming reservations: fully flexible. Recommend dispatch when convenient, no deadline pressure.
- NEVER ask "is the property occupied?" or "when's the next guest?" — that's in the CONTEXT. Just use it.

STYLE:
- Keep the tone professional and efficient; PMs manage many jobs and appreciate speed over warmth. Do not use homeowner phrasing like "your home" or "when did YOU notice it" — say "the unit", "the property", "your guest mentioned", "when was it first reported".
- Never read the CONTEXT block aloud — treat it as background knowledge you already have.`;

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

// ── POST /api/v1/voice/tts ───────────────────────────────────────────────────
// Text-only → ElevenLabs → audio. Used by the voice/video panels to speak
// a greeting before the conversation starts (and potentially for other
// pure-speech use cases later). No Claude call — cheap & fast.
router.post('/tts', async (req: Request, res: Response) => {
  const body = req.body as { text?: unknown };
  if (!body.text || typeof body.text !== 'string' || !body.text.trim()) {
    const out: ApiResponse<null> = { data: null, error: 'text is required', meta: {} };
    res.status(400).json(out);
    return;
  }
  if (!process.env.ELEVENLABS_API_KEY) {
    const out: ApiResponse<null> = { data: null, error: 'Voice TTS is not configured', meta: {} };
    res.status(503).json(out);
    return;
  }
  // Clamp so we can't be asked to synthesize a whole article on the free tier
  const text = body.text.trim().slice(0, 500);
  try {
    const audioBuf = await synthesizeWithElevenLabs(text);
    res.json({
      data: { audio_base64: audioBuf.toString('base64'), audio_mime: 'audio/mpeg' },
      error: null,
      meta: {},
    });
  } catch (err) {
    logger.error({ err }, '[POST /voice/tts]');
    const out: ApiResponse<null> = {
      data: null,
      error: err instanceof Error ? err.message : 'TTS error',
      meta: {},
    };
    res.status(500).json(out);
  }
});

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
  // Business-surface context: property, occupancy, known equipment. Fed
  // into the first-turn user message so Claude has the real facts of the
  // property before the conversation starts — it can reference the right
  // appliance brand/model, know whether the unit is occupied, etc.
  // Ceiling raised from 2k → 12k so the whole Property IQ inventory +
  // saved property details can ride along. A big scan can easily be
  // 3-5k of text; clipping at 2k was dropping the inventory rows and
  // forcing Homie to re-ask brand/model questions it should already know.
  const businessContext = typeof body.business_context === 'string' && body.business_context.trim().length > 0
    ? body.business_context.trim().slice(0, 12000)
    : null;

  // Optional video frame (only sent by the video-chat panel). When present
  // we swap to the vision-aware system prompt so Claude can describe what
  // it sees.
  let frameBlock: Anthropic.ImageBlockParam | null = null;
  if (typeof body.frame_data_url === 'string' && body.frame_data_url.startsWith('data:image/')) {
    const imgMatch = body.frame_data_url.match(/^data:(image\/\w+);base64,(.+)$/);
    if (imgMatch) {
      frameBlock = {
        type: 'image',
        source: {
          type: 'base64',
          media_type: imgMatch[1] as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
          data: imgMatch[2],
        },
      };
    } else {
      logger.warn('[voice/turn] frame_data_url present but unparseable');
    }
  }
  const hasFrame = frameBlock !== null;

  try {
    // 1. Whisper STT
    const transcript = await transcribeWithWhisper(parsed.buffer, parsed.mime);
    if (!transcript && !hasFrame) {
      // Audio-only mode with no speech detected — user either tapped the
      // mic without speaking or ambient noise tripped VAD. Worth retrying.
      logger.warn('[voice/turn] empty Whisper transcript');
      const out: ApiResponse<null> = { data: null, error: 'No speech detected — try again', meta: {} };
      res.status(422).json(out);
      return;
    }
    // In video mode, an empty transcript is OK — the user might be
    // silently pointing the camera. Synthesize a placeholder so Claude
    // still has a text turn to anchor its reply.
    const effectiveTranscript = transcript || (hasFrame ? '(showing camera — no audio this turn)' : '');

    // 2. Claude
    const client = new Anthropic({ apiKey: anthropicKey });
    const messages: Anthropic.MessageParam[] = [];

    // Seed with prior turns the client has accumulated
    for (const m of history) {
      messages.push({ role: m.role, content: m.content });
    }

    // Current user turn — prepend a tiny scaffold on the very first turn so
    // Homie greets warmly before diving in, and optionally carries the
    // category hint the caller already picked (if any).
    let userText = effectiveTranscript;
    if (isFirst && categoryHint) {
      userText = `The caller already chose the "${categoryHint}" category. ${hasFrame ? 'They just opened the camera and said' : 'They said out loud'}: "${effectiveTranscript}"`;
    } else if (isFirst) {
      userText = `The caller ${hasFrame ? 'opened the video channel and is pointing the camera at the issue. They said' : 'opened the voice channel and said'}: "${effectiveTranscript}"`;
    }

    // Business surface: stitch the property / occupancy / inventory
    // context ahead of the first turn so Claude's replies reference the
    // real appliance brands / models + the current guest situation.
    // Persists via `messages` history so Claude keeps access on later
    // turns without us having to re-send it.
    if (isFirst && businessContext) {
      userText = `CONTEXT (from Homie Business — do NOT read this aloud, just use it to ground your replies):\n${businessContext}\n\n---\n\n${userText}`;
    }

    // Pack the turn as a content array — image block first (so Claude
    // grounds the reply in what it sees), then the text transcript.
    const userContent: Anthropic.ContentBlockParam[] = [];
    if (frameBlock) userContent.push(frameBlock);
    userContent.push({ type: 'text', text: userText });
    messages.push({ role: 'user', content: userContent });

    const claudeRes = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 400,
      system: (hasFrame ? VIDEO_SYSTEM_PROMPT : VOICE_SYSTEM_PROMPT) + (businessContext ? BUSINESS_SYSTEM_SUFFIX : ''),
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
      { mode: hasFrame ? 'video' : 'voice', transcriptLen: transcript.length, replyLen: replyClean.length, isReady, category, turn: history.length / 2 + 1 },
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
