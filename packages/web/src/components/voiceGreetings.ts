// ── Greeting intros spoken when a voice or video chat first opens ───────────
//
// Keeps the experience warm and personalized when we know the homeowner's
// first name; falls back to a generic-but-still-friendly line when we
// don't. Picks one at random per session so repeat users don't hear the
// same line every time.

const NAMED_GREETINGS: string[] = [
  "Hi {name}, how can your Homie help around the house today?",
  "Hey {name}! What's going on at the house?",
  "Hi {name}, Homie here. What are we tackling today?",
  "Hey {name} — what can I help you fix?",
  "{name}, good to see you. What's giving you trouble?",
  "Hi {name}, ready when you are. What's the issue?",
  "Hey {name}, point me at the problem and let's figure it out.",
  "{name}! I'm all ears — what's broken?",
  "Hi {name}, welcome back. What's up around the house?",
  "{name}, what can your Homie help you with today?",
  "Hey {name} — got a project, a pain point, or a mystery for me?",
  "Hi {name}, tell me what's been bugging you at home.",
];

const ANON_GREETINGS: string[] = [
  "Hi there, how can your Homie help around the house today?",
  "Hey! What's going on at the house?",
  "Hi! Homie here. What are we tackling today?",
  "Hey — what can I help you fix?",
  "Hi there, ready when you are. What's the issue?",
  "Hey, point me at the problem and let's figure it out.",
  "Hi! I'm all ears — what's broken?",
  "What can your Homie help you with today?",
  "Hey — got a project, a pain point, or a mystery for me?",
  "Hi, tell me what's been bugging you at home.",
];

/**
 * Normalize first names. Strips extra whitespace, capitalises first
 * letter, and discards empty / placeholder values.
 */
function cleanName(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.toLowerCase() === 'null' || trimmed.toLowerCase() === 'undefined') return null;
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

/**
 * Pick a greeting line, interpolating the homeowner's first name when we
 * have one. Returns a plain string — no side effects.
 */
export function pickGreeting(firstName?: string | null): string {
  const name = cleanName(firstName);
  const list = name ? NAMED_GREETINGS : ANON_GREETINGS;
  const line = list[Math.floor(Math.random() * list.length)];
  return name ? line.replace(/\{name\}/g, name) : line;
}
