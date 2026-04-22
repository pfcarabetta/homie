import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import {
  businessService, businessChatService, jobService, connectJobSocket, trackingService, estimateService,
  uploadDiagnosticImage,
  type Property, type PropertyDetails, type Workspace, type DiagnosticStreamCallbacks,
  type JobStatusResponse, type ProviderResponseItem, type CostEstimate, type Reservation,
  type PropertyInventoryItem,
} from '@/services/api';
import { MiniCalendar, formatReservationMoment } from './business/constants';
import AvatarDropdown from '@/components/AvatarDropdown';
import EstimateCard from '@/components/EstimateCard';
import HomieOutreachLive, { type OutreachStatus, type LogEntry } from '@/components/HomieOutreachLive';
import InlineVoicePanel from '@/components/InlineVoicePanel';
import VideoChatPanel from '@/components/VideoChatPanel';
import { primeAudio } from '@/components/audioUnlocker';

const O = '#E8632B', G = '#1B9E77', D = 'var(--bp-text)', W = 'var(--bp-bg)';

/** Map the user's timing button answer (or a picked ISO date) to the
 *  backend's JobTiming enum + a severity label. Keeps Claude's own
 *  urgency assessment out of the dispatch — the PM's choice is the only
 *  signal that drives how fast the provider is expected to respond. */
type DispatchUrgency = {
  jobTiming: 'asap' | 'this_week' | 'this_month' | 'flexible';
  severity: 'low' | 'medium' | 'high' | 'emergency';
};
/** Final-summary hygiene — strips clarifying questions that occasionally
 *  leak into the dispatch summary when Claude hedges on the final turn
 *  ("I have a couple quick questions to make sure I send the right pro.
 *  How long has this been going on?"). Splits on sentence boundaries and
 *  drops any sentence ending with a question mark, plus common hedge
 *  preambles that don't end in `?` on their own. Preserves everything
 *  else verbatim so diagnostic detail isn't lost. */
function stripQuestionsFromSummary(text: string): string {
  if (!text) return text;
  const HEDGE_PATTERNS = [
    /^i have (?:a )?(?:couple|few|quick|some)?\s*(?:quick )?questions\b/i,
    /^let me ask\b/i,
    /^could you (?:tell|share|let|clarify|confirm)\b/i,
    /^can you (?:tell|share|let|clarify|confirm)\b/i,
    /^to make sure i send the right pro\b/i,
    /^one more question\b/i,
    /^just to clarify\b/i,
  ];
  // Sentence splitter — keeps terminators attached so we can filter by them.
  const sentences = text.match(/[^.!?\n]+[.!?]+[\s\n]?|[^.!?\n]+[\s\n]?/g) ?? [text];
  const kept = sentences.filter(raw => {
    const s = raw.trim();
    if (!s) return false;
    if (s.endsWith('?')) return false;
    for (const rx of HEDGE_PATTERNS) if (rx.test(s)) return false;
    return true;
  });
  const cleaned = kept.join('').replace(/\s{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  return cleaned || text.trim();
}

/** Ordered keyword table for inferring a B2B category id from a free-
 *  form transcript (voice/video chat, direct-input description, etc).
 *  More specific categories come first so "dishwasher drain" lands on
 *  appliance rather than plumbing. Every regex is case-insensitive and
 *  anchored on word boundaries. Returns null when nothing matches so the
 *  caller can fall back to the Handyman catch-all on its own terms. */
const VOICE_CATEGORY_HINTS: Array<{ rx: RegExp; catId: string }> = [
  // Appliances — specific brand-adjacent vocabulary wins first so an
  // "appliance issue" doesn't get swept into plumbing via "drain".
  { rx: /\b(dishwasher|dishwash)\b/i, catId: 'appliance' },
  { rx: /\b(refrigerator|refrig|fridge|freezer|ice[\s-]?maker)\b/i, catId: 'appliance' },
  { rx: /\b(washing[\s-]?machine|clothes[\s-]?washer)\b/i, catId: 'appliance' },
  { rx: /\b(clothes[\s-]?dryer|laundry[\s-]?dryer|dryer)\b/i, catId: 'appliance' },
  { rx: /\b(oven|range|stove|cooktop|burner)\b/i, catId: 'appliance' },
  { rx: /\bmicrowave\b/i, catId: 'appliance' },
  { rx: /\b(garbage[\s-]?disposal|disposal)\b/i, catId: 'appliance' },
  { rx: /\bappliance\b/i, catId: 'appliance' },
  // Water heater sits above generic plumbing so "no hot water" lands here.
  { rx: /\b(water[\s-]?heater|tankless|hot[\s-]?water[\s-]?tank)\b/i, catId: 'water_heater' },
  // HVAC before electrical so "ac" / "thermostat" don't get miscategorized.
  { rx: /\b(hvac|a\/?c|ac[\s-]?unit|air[\s-]?cond|furnace|heat[\s-]?pump|thermostat|boiler|mini[\s-]?split)\b/i, catId: 'hvac' },
  // Garage door before electrical so "opener" mentions land here.
  { rx: /\b(garage[\s-]?door|garage[\s-]?opener|door[\s-]?opener)\b/i, catId: 'garage_door' },
  // Roofing / gutter / siding — specific exterior categories.
  { rx: /\b(roof|shingle|flashing|chimney[\s-]?cap)\b/i, catId: 'roofing' },
  { rx: /\b(gutter|downspout)\b/i, catId: 'gutter' },
  { rx: /\bsiding\b/i, catId: 'siding' },
  { rx: /\bchimney\b/i, catId: 'chimney' },
  // Plumbing family — septic/sewer backup is its own bucket, then
  // generic plumbing covers leak/drain/pipe/toilet/faucet/shower.
  { rx: /\b(septic|sewer[\s-]?backup|sewage)\b/i, catId: 'septic_sewer' },
  { rx: /\b(toilet|faucet|sink|shower|bathtub|tub|drain|clog|pipe|plumb|leak)\b/i, catId: 'plumbing' },
  // Electrical
  { rx: /\b(outlet|receptacle|breaker|panel|wiring|gfci|circuit|electric(al)?|socket|fuse)\b/i, catId: 'electrical' },
  // Install / specialty repairs
  { rx: /\bgenerator\b/i, catId: 'generator_install' },
  { rx: /\b(ev[\s-]?charger|level[\s-]?2[\s-]?charger)\b/i, catId: 'ev_charger_install' },
  { rx: /\b(solar|photovoltaic|inverter)\b/i, catId: 'solar' },
  { rx: /\binsulation\b/i, catId: 'insulation' },
  { rx: /\b(sprinkler|irrigation)\b/i, catId: 'sprinkler_irrigation' },
  { rx: /\b(window|sliding[\s-]?door|storm[\s-]?door|patio[\s-]?door)\b/i, catId: 'window_door_install' },
  { rx: /\b(drywall|sheetrock)\b/i, catId: 'drywall' },
  { rx: /\b(foundation|settling|basement[\s-]?water)\b/i, catId: 'foundation_waterproofing' },
  { rx: /\b(concrete|driveway|sidewalk)\b/i, catId: 'concrete' },
  { rx: /\b(brick|masonry|stone[\s-]?veneer|retaining[\s-]?wall)\b/i, catId: 'masonry' },
  { rx: /\b(tv[\s-]?mount|projector[\s-]?mount|soundbar[\s-]?install)\b/i, catId: 'tv_mounting' },
  { rx: /\b(alarm|camera|doorbell|security[\s-]?system|smoke[\s-]?detector|co[\s-]?detector|carbon[\s-]?monoxide)\b/i, catId: 'security_systems' },
  // Service categories
  { rx: /\b(turnover[\s-]?clean|deep[\s-]?clean|housekeeping)\b/i, catId: 'cleaning' },
  { rx: /\b(carpet[\s-]?clean)\b/i, catId: 'carpet_cleaning' },
  { rx: /\bpool\b/i, catId: 'pool' },
  { rx: /\b(hot[\s-]?tub|spa|jacuzzi)\b/i, catId: 'hot_tub' },
  { rx: /\brestock/i, catId: 'restocking' },
  { rx: /\b(pest|termite|roach|rodent|mice|rats?|bed[\s-]?bug)\b/i, catId: 'pest_control' },
  { rx: /\b(tree[\s-]?trim|tree[\s-]?removal|stump[\s-]?grind)\b/i, catId: 'tree_trimming' },
  { rx: /\b(landscap|lawn[\s-]?mow|garden|hedge)\b/i, catId: 'landscaping' },
  { rx: /\b(fenc|gate[\s-]?install|gate[\s-]?repair)\b/i, catId: 'fencing' },
  { rx: /\b(deck|patio|pergola)\b/i, catId: 'deck_patio' },
  { rx: /\bpaint(ing)?\b/i, catId: 'painting' },
  { rx: /\b(flooring|hardwood[\s-]?floor|refinish)\b/i, catId: 'flooring' },
  { rx: /\b(tile|regrout|backsplash)\b/i, catId: 'tile' },
];

/** Best-effort category inference for a free-form transcript. Returns
 *  the first matching category id, or null if no keyword fires. */
function inferCategoryFromText(text: string): string | null {
  if (!text) return null;
  for (const { rx, catId } of VOICE_CATEGORY_HINTS) {
    if (rx.test(text)) return catId;
  }
  return null;
}

/** Maps the voice/video backend's category IDs (from VOICE_SYSTEM_PROMPT
 *  taxonomy) to our B2B_CATEGORIES IDs. Most overlap by name; this handles
 *  the mismatches (voice "house_cleaning" → B2B "cleaning", voice IDs
 *  without a B2B equivalent → "general" fallback). Returns null when the
 *  voice ID is unknown so the caller can fall back to text inference. */
const VOICE_TO_B2B_CATEGORY: Record<string, string> = {
  plumbing: 'plumbing',
  water_heater: 'water_heater',
  septic_sewer: 'septic_sewer',
  electrical: 'electrical',
  hvac: 'hvac',
  appliance: 'appliance',
  roofing: 'roofing',
  gutter: 'gutter',
  chimney: 'chimney',
  general: 'general',
  garage_door: 'garage_door',
  security_systems: 'security_systems',
  // Service-tier translations
  house_cleaning: 'cleaning',
  window_cleaning: 'cleaning',
  pressure_washing: 'cleaning',
  landscaping: 'landscaping',
  tree_trimming: 'tree_trimming',
  deck_patio: 'deck_patio',
  fencing: 'fencing',
  pool: 'pool',
  pest_control: 'pest_control',
  painting: 'painting',
  flooring: 'flooring',
  kitchen_remodel: 'kitchen_remodel',
  bathroom_remodel: 'bathroom_remodel',
  // Voice-only IDs with no direct B2B equivalent — land on Handyman
  locksmith: 'general',
  moving: 'general',
  junk_removal: 'general',
  other: 'general',
};

function mapVoiceCategoryToB2B(voiceCategoryId: string | null): string | null {
  if (!voiceCategoryId) return null;
  return VOICE_TO_B2B_CATEGORY[voiceCategoryId.toLowerCase()] ?? null;
}

function mapUserTimingToDispatch(raw: string): DispatchUrgency {
  const t = (raw || '').trim().toLowerCase();
  if (!t || t === 'flexible') return { jobTiming: 'flexible', severity: 'low' };
  if (t === 'today' || t === 'asap' || t === 'now') return { jobTiming: 'asap', severity: 'high' };
  if (t === 'tomorrow') return { jobTiming: 'asap', severity: 'medium' };
  if (t.includes('week')) return { jobTiming: 'this_week', severity: 'medium' };
  if (t.includes('month')) return { jobTiming: 'this_month', severity: 'low' };
  // Custom date picked via the date input — measure distance from today.
  const parsed = Date.parse(raw) || Date.parse(`${raw} ${new Date().getFullYear()}`);
  if (!Number.isNaN(parsed)) {
    const days = Math.max(0, Math.floor((parsed - Date.now()) / 86_400_000));
    if (days <= 1) return { jobTiming: 'asap', severity: 'high' };
    if (days <= 7) return { jobTiming: 'this_week', severity: 'medium' };
    if (days <= 30) return { jobTiming: 'this_month', severity: 'low' };
    return { jobTiming: 'flexible', severity: 'low' };
  }
  return { jobTiming: 'flexible', severity: 'medium' };
}

/** DirectInput action button (Photo / Video Chat / Talk / Dictate) —
 *  kept identical to the `uploadBtnStyle` used on /quote so the business
 *  flow lands with the same fonts, sizes, and icon treatment. Backed by
 *  --bp-* vars so it adapts to dark mode. */
const quoteUploadBtnStyle: React.CSSProperties = {
  background: 'var(--bp-card)',
  border: '1px solid var(--bp-border)',
  color: 'var(--bp-text)',
  borderRadius: 100,
  padding: '10px 14px',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  fontFamily: "'DM Sans',sans-serif",
  transition: 'all .15s',
};

/* ── Categories ─────────────────────────────────────────────────────────── */

interface CatDef {
  id: string; icon: string; label: string; group: 'repair' | 'service';
  q1: { text: string; options: string[] };
}

// Narrow structural type for the browser SpeechRecognition API (prefixed as
// webkitSpeechRecognition in Safari). We only use start / stop / onresult
// / onend so this is all we need — avoids pulling in DOM.Speech types that
// aren't universal in TS libdom.
interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> & { length: number } }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: unknown) => void) | null;
}

interface CatGroup {
  icon: string; label: string; type: 'repair' | 'service';
  subs: Array<{ id: string; icon: string; label: string }>;
}

const B2B_CATEGORY_TREE: CatGroup[] = [
  // ── Repair ──
  { icon: '🔧', label: 'Plumbing', type: 'repair', subs: [
    { id: 'plumbing', icon: '🔧', label: 'General Plumbing' },
    { id: 'septic_sewer', icon: '🕳️', label: 'Septic & Sewer' },
    { id: 'water_heater', icon: '🔥', label: 'Water Heater' },
    { id: 'sprinkler_irrigation', icon: '💦', label: 'Sprinkler & Irrigation' },
  ]},
  { icon: '⚡', label: 'Electrical', type: 'repair', subs: [
    { id: 'electrical', icon: '⚡', label: 'General Electrical' },
    { id: 'generator_install', icon: '🔋', label: 'Generator Install' },
    { id: 'ev_charger_install', icon: '🔌', label: 'EV Charger Install' },
    { id: 'solar', icon: '☀️', label: 'Solar' },
    { id: 'security_systems', icon: '📹', label: 'Security Systems' },
  ]},
  { icon: '❄️', label: 'HVAC', type: 'repair', subs: [
    { id: 'hvac', icon: '❄️', label: 'AC & Heating' },
    { id: 'chimney', icon: '🏠', label: 'Chimney' },
    { id: 'insulation', icon: '🧱', label: 'Insulation' },
  ]},
  { icon: '🍳', label: 'Appliance', type: 'repair', subs: [
    { id: 'appliance', icon: '🍳', label: 'Appliance Repair' },
  ]},
  { icon: '🏠', label: 'Roofing & Exterior', type: 'repair', subs: [
    { id: 'roofing', icon: '🏠', label: 'Roofing' },
    { id: 'gutter', icon: '🌧️', label: 'Gutter Cleaning' },
    { id: 'siding', icon: '🪵', label: 'Siding' },
    { id: 'window_door_install', icon: '🪟', label: 'Window & Door Install' },
    { id: 'garage_door', icon: '🚨', label: 'Garage Door' },
  ]},
  { icon: '🔨', label: 'Handyman & Structural', type: 'repair', subs: [
    { id: 'general', icon: '🔨', label: 'Handyman' },
    { id: 'drywall', icon: '🪧', label: 'Drywall' },
    { id: 'concrete', icon: '🧱', label: 'Concrete' },
    { id: 'masonry', icon: '🏗️', label: 'Masonry' },
    { id: 'foundation_waterproofing', icon: '💧', label: 'Foundation & Waterproofing' },
    { id: 'welding_metal_work', icon: '⚒️', label: 'Welding & Metal Work' },
    { id: 'tv_mounting', icon: '📺', label: 'TV Mounting' },
    { id: 'furniture_assembly', icon: '🪑', label: 'Furniture Assembly' },
  ]},
  // ── Service ──
  { icon: '✨', label: 'Cleaning', type: 'service', subs: [
    { id: 'cleaning', icon: '✨', label: 'Turnover Clean' },
    { id: 'carpet_cleaning', icon: '🧹', label: 'Carpet Cleaning' },
    { id: 'window_cleaning', icon: '🪟', label: 'Window Cleaning' },
    { id: 'pressure_washing', icon: '💦', label: 'Pressure Wash' },
    { id: 'steam_cleaning', icon: '♨️', label: 'Steam Cleaning' },
  ]},
  { icon: '🏊', label: 'Pool & Spa', type: 'service', subs: [
    { id: 'pool', icon: '🏊', label: 'Pool Service' },
    { id: 'hot_tub', icon: '♨️', label: 'Hot Tub' },
  ]},
  { icon: '🌿', label: 'Outdoor & Landscaping', type: 'service', subs: [
    { id: 'landscaping', icon: '🌿', label: 'Landscaping' },
    { id: 'tree_trimming', icon: '🌳', label: 'Tree Trimming' },
    { id: 'fencing', icon: '🏡', label: 'Fencing' },
    { id: 'deck_patio', icon: '🪵', label: 'Deck & Patio' },
    { id: 'pest_control', icon: '🐛', label: 'Pest Control' },
  ]},
  { icon: '🎨', label: 'Painting & Flooring', type: 'service', subs: [
    { id: 'painting', icon: '🎨', label: 'Painting' },
    { id: 'flooring', icon: '🪵', label: 'Flooring' },
    { id: 'tile', icon: '🔲', label: 'Tile' },
  ]},
  { icon: '🏗️', label: 'Remodeling', type: 'service', subs: [
    { id: 'kitchen_remodel', icon: '🍽️', label: 'Kitchen Remodel' },
    { id: 'bathroom_remodel', icon: '🛁', label: 'Bathroom Remodel' },
  ]},
  { icon: '📦', label: 'Property Ops', type: 'service', subs: [
    { id: 'restocking', icon: '📦', label: 'Supplies Restock' },
    { id: 'inspection', icon: '🔍', label: 'Inspection' },
    { id: 'trash', icon: '🗑️', label: 'Trash Valet' },
    { id: 'locksmith', icon: '🔑', label: 'Locksmith' },
    { id: 'concierge', icon: '🎩', label: 'Concierge' },
  ]},
  { icon: '🚚', label: 'Moving & Hauling', type: 'service', subs: [
    { id: 'junk_removal', icon: '🚛', label: 'Junk Removal' },
    { id: 'moving', icon: '🚚', label: 'Moving' },
  ]},
  { icon: '📸', label: 'Photography', type: 'service', subs: [
    { id: 'photography', icon: '📸', label: 'Professional Photography' },
  ]},
];

const B2B_CATEGORIES: CatDef[] = [
  // ── Repair ──
  { id: 'plumbing', icon: '🔧', label: 'Plumbing', group: 'repair',
    q1: { text: "What's happening?", options: ['Leaking/dripping', 'Clogged drain', 'No hot water', 'Running toilet', 'Burst/flooding', 'Other'] } },
  { id: 'septic_sewer', icon: '🕳️', label: 'Septic & Sewer', group: 'repair',
    q1: { text: "What's the issue?", options: ['Backup/overflow', 'Slow drains throughout', 'Septic pumping', 'Bad smell', 'Inspection needed', 'Other'] } },
  { id: 'water_heater', icon: '🔥', label: 'Water Heater', group: 'repair',
    q1: { text: "What's going on?", options: ['No hot water', 'Not enough hot water', 'Leaking', 'Strange noises', 'Need new install', 'Other'] } },
  { id: 'sprinkler_irrigation', icon: '💦', label: 'Sprinkler & Irrigation', group: 'repair',
    q1: { text: 'What do you need?', options: ['Broken head', 'Zone not working', 'Leak in system', 'New installation', 'Winterization', 'Timer issue', 'Other'] } },
  { id: 'electrical', icon: '⚡', label: 'Electrical', group: 'repair',
    q1: { text: "What's the problem?", options: ['Outlet not working', 'Lights flickering', 'Breaker tripping', 'Sparking/smell', 'New install', 'Other'] } },
  { id: 'generator_install', icon: '🔋', label: 'Generator Install', group: 'repair',
    q1: { text: 'What do you need?', options: ['New generator install', 'Generator repair', 'Transfer switch', 'Maintenance', 'Other'] } },
  { id: 'ev_charger_install', icon: '🔌', label: 'EV Charger Install', group: 'repair',
    q1: { text: 'What do you need?', options: ['Level 2 charger install', 'Panel upgrade for EV', 'Charger not working', 'Quote for install', 'Other'] } },
  { id: 'solar', icon: '☀️', label: 'Solar', group: 'repair',
    q1: { text: 'What do you need?', options: ['New solar install', 'Panel repair', 'Inverter issue', 'Not producing enough', 'Battery storage', 'Other'] } },
  { id: 'hvac', icon: '❄️', label: 'HVAC', group: 'repair',
    q1: { text: "What's going on?", options: ['AC not cooling', 'Heat not working', 'Strange noises', 'Thermostat issue', 'Bad smell', 'Maintenance', 'Other'] } },
  { id: 'chimney', icon: '🏠', label: 'Chimney', group: 'repair',
    q1: { text: 'What do you need?', options: ['Chimney sweep', 'Inspection', 'Repair/repointing', 'Cap/damper install', 'Smoke inside', 'Other'] } },
  { id: 'insulation', icon: '🧱', label: 'Insulation', group: 'repair',
    q1: { text: 'What do you need?', options: ['Attic insulation', 'Wall insulation', 'Crawl space', 'Garage', 'Energy audit', 'Other'] } },
  { id: 'appliance', icon: '🍳', label: 'Appliance', group: 'repair',
    q1: { text: 'Which appliance?', options: ['Washer', 'Dryer', 'Dishwasher', 'Refrigerator', 'Oven/stove', 'Disposal', 'Other'] } },
  { id: 'roofing', icon: '🏠', label: 'Roofing', group: 'repair',
    q1: { text: "What's the concern?", options: ['Active leak', 'Missing shingles', 'Storm damage', 'Full replacement', 'Inspection', 'Other'] } },
  { id: 'gutter', icon: '🌧️', label: 'Gutter Cleaning', group: 'repair',
    q1: { text: 'What do you need?', options: ['Cleaning/debris removal', 'Repair/reattach', 'New gutter install', 'Gutter guards', 'Downspout issue', 'Other'] } },
  { id: 'siding', icon: '🪵', label: 'Siding', group: 'repair',
    q1: { text: "What's the issue?", options: ['Damaged/cracked', 'Full replacement', 'New install', 'Power wash only', 'Storm damage', 'Other'] } },
  { id: 'window_door_install', icon: '🪟', label: 'Window & Door Install', group: 'repair',
    q1: { text: 'What do you need?', options: ['Window replacement', 'New window', 'Door replacement', 'Sliding door', 'Storm door', 'Other'] } },
  { id: 'general', icon: '🔨', label: 'Handyman', group: 'repair',
    q1: { text: 'What kind of work?', options: ['Drywall repair', 'Door/window fix', 'Shelving/mounting', 'Multiple small jobs', 'Other'] } },
  { id: 'drywall', icon: '🪧', label: 'Drywall', group: 'repair',
    q1: { text: 'What do you need?', options: ['Hole/crack repair', 'Water damage repair', 'New drywall', 'Texture matching', 'Full room', 'Other'] } },
  { id: 'concrete', icon: '🧱', label: 'Concrete', group: 'repair',
    q1: { text: 'What do you need?', options: ['Crack repair', 'New driveway/patio', 'Sidewalk repair', 'Stamped concrete', 'Foundation work', 'Other'] } },
  { id: 'masonry', icon: '🏗️', label: 'Masonry', group: 'repair',
    q1: { text: 'What do you need?', options: ['Brick repair', 'Retaining wall', 'Stone veneer', 'Fireplace repair', 'New construction', 'Other'] } },
  { id: 'foundation_waterproofing', icon: '💧', label: 'Foundation & Waterproofing', group: 'repair',
    q1: { text: "What's the concern?", options: ['Foundation crack', 'Water in basement', 'Settling/shifting', 'Crawl space moisture', 'Drainage issue', 'Other'] } },
  { id: 'welding_metal_work', icon: '⚒️', label: 'Welding & Metal Work', group: 'repair',
    q1: { text: 'What do you need?', options: ['Gate/fence repair', 'Railing fabrication', 'Structural welding', 'Custom metalwork', 'Other'] } },
  { id: 'garage_door', icon: '🚨', label: 'Garage Door', group: 'repair',
    q1: { text: "What's the issue?", options: ["Won't open/close", 'Making noise', 'Off track', 'Opener broken', 'Spring snapped', 'Other'] } },
  { id: 'tv_mounting', icon: '📺', label: 'TV Mounting', group: 'repair',
    q1: { text: 'What do you need?', options: ['TV wall mount', 'TV + hide wires', 'Projector mount', 'Soundbar install', 'Full home theater', 'Other'] } },
  { id: 'security_systems', icon: '📹', label: 'Security Systems', group: 'repair',
    q1: { text: 'What do you need?', options: ['Camera install', 'Alarm system', 'Doorbell camera', 'System repair', 'Smart home setup', 'Other'] } },
  // ── Service ──
  { id: 'cleaning', icon: '✨', label: 'Turnover Clean', group: 'service',
    q1: { text: 'What type of clean?', options: ['Standard turnover', 'Deep clean', 'Post-construction', 'Laundry/linens', 'Other'] } },
  { id: 'carpet_cleaning', icon: '🧹', label: 'Carpet Cleaning', group: 'service',
    q1: { text: 'What do you need?', options: ['Whole house', 'One room', 'Stain removal', 'Pet odor treatment', 'Area rugs', 'Other'] } },
  { id: 'pool', icon: '🏊', label: 'Pool', group: 'service',
    q1: { text: 'What do you need?', options: ['Chemical balance', 'Filter cleaning', 'Green/cloudy water', 'Equipment repair', 'Leak detection', 'Opening/closing'] } },
  { id: 'hot_tub', icon: '♨️', label: 'Hot Tub', group: 'service',
    q1: { text: 'What do you need?', options: ['Chemical balance', 'Filter cleaning', 'Drain & refill', 'Jets not working', 'Heater issue', 'Cover replacement'] } },
  { id: 'restocking', icon: '📦', label: 'Supplies Restock', group: 'service',
    q1: { text: 'What needs restocking?', options: ['Toiletries', 'Kitchen supplies', 'Linens', 'Welcome items', 'Full restock', 'Other'] } },
  { id: 'inspection', icon: '🔍', label: 'Inspection', group: 'service',
    q1: { text: 'What kind of inspection?', options: ['Pre-guest walkthrough', 'Post-guest damage check', 'Quarterly review', 'Other'] } },
  { id: 'landscaping', icon: '🌿', label: 'Landscaping', group: 'service',
    q1: { text: 'What do you need?', options: ['Lawn mowing', 'Garden design', 'Hedge trimming', 'Yard cleanup', 'Full landscape', 'Other'] } },
  { id: 'tree_trimming', icon: '🌳', label: 'Tree Trimming', group: 'service',
    q1: { text: 'What do you need?', options: ['Trimming/pruning', 'Tree removal', 'Dead tree', 'Branches on roof', 'Stump grinding', 'Other'] } },
  { id: 'fencing', icon: '🏡', label: 'Fencing', group: 'service',
    q1: { text: 'What do you need?', options: ['New fence install', 'Fence repair', 'Gate repair/install', 'Post replacement', 'Full replacement', 'Other'] } },
  { id: 'deck_patio', icon: '🪵', label: 'Deck & Patio', group: 'service',
    q1: { text: 'What do you need?', options: ['New deck build', 'Deck repair', 'Patio install', 'Staining/sealing', 'Pergola/cover', 'Other'] } },
  { id: 'pest_control', icon: '🐛', label: 'Pest Control', group: 'service',
    q1: { text: 'What kind of pest?', options: ['Ants', 'Roaches', 'Mice/rats', 'Termites', 'Bed bugs', 'Other'] } },
  { id: 'painting', icon: '🎨', label: 'Painting', group: 'service',
    q1: { text: 'Interior or exterior?', options: ['Interior', 'Exterior', 'Both', 'Cabinet painting', 'Touch-ups only', 'Other'] } },
  { id: 'flooring', icon: '🪵', label: 'Flooring', group: 'service',
    q1: { text: 'What do you need?', options: ['New install', 'Refinishing', 'Repair', 'Removal', 'Other'] } },
  { id: 'tile', icon: '🔲', label: 'Tile', group: 'service',
    q1: { text: 'What do you need?', options: ['New tile install', 'Tile repair', 'Regrout', 'Backsplash', 'Shower/tub tile', 'Other'] } },
  { id: 'kitchen_remodel', icon: '🍽️', label: 'Kitchen Remodel', group: 'service',
    q1: { text: 'What scope?', options: ['Full remodel', 'Cabinets only', 'Countertops only', 'Layout change', 'Cosmetic update', 'Other'] } },
  { id: 'bathroom_remodel', icon: '🛁', label: 'Bathroom Remodel', group: 'service',
    q1: { text: 'What scope?', options: ['Full remodel', 'Shower/tub only', 'Vanity/sink only', 'Tile work', 'Cosmetic update', 'Other'] } },
  { id: 'trash', icon: '🗑️', label: 'Trash Valet', group: 'service',
    q1: { text: 'What do you need?', options: ['Scheduled pickup', 'Bulk removal', 'Post-guest cleanout', 'Other'] } },
  { id: 'junk_removal', icon: '🚛', label: 'Junk Removal', group: 'service',
    q1: { text: 'What needs removing?', options: ['Furniture', 'Appliances', 'Yard waste', 'Construction debris', 'Full cleanout', 'Other'] } },
  { id: 'moving', icon: '🚚', label: 'Moving', group: 'service',
    q1: { text: 'What kind of move?', options: ['Full home move', 'Apartment move', 'Few large items', 'Storage pickup', 'Other'] } },
  { id: 'locksmith', icon: '🔑', label: 'Locksmith', group: 'service',
    q1: { text: 'What do you need?', options: ['Locked out', 'Rekey locks', 'New lock install', 'Smart lock setup', 'Lockbox replacement'] } },
  { id: 'pressure_washing', icon: '💦', label: 'Pressure Wash', group: 'service',
    q1: { text: 'What needs washing?', options: ['Driveway', 'Patio/deck', 'House siding', 'Fence', 'Pool area', 'Full exterior'] } },
  { id: 'window_cleaning', icon: '🪟', label: 'Window Cleaning', group: 'service',
    q1: { text: 'What do you need?', options: ['Interior only', 'Exterior only', 'Interior + exterior', 'Screens & tracks', 'Skylights'] } },
  { id: 'steam_cleaning', icon: '♨️', label: 'Steam Cleaning', group: 'service',
    q1: { text: 'What needs steam cleaning?', options: ['Carpets', 'Upholstery/couches', 'Mattresses', 'Tile & grout', 'Full property'] } },
  { id: 'furniture_assembly', icon: '🪑', label: 'Furniture Assembly', group: 'service',
    q1: { text: 'What needs assembling?', options: ['Bed frame', 'Desk/table', 'Shelving/bookcase', 'Outdoor furniture', 'Multiple pieces'] } },
  { id: 'concierge', icon: '🎩', label: 'Concierge', group: 'service',
    q1: { text: 'What service?', options: ['Private chef', 'Transport', 'Grocery delivery', 'Equipment rental', 'Activities', 'Other'] } },
  { id: 'photography', icon: '📸', label: 'Photography', group: 'service',
    q1: { text: 'What type of shoot?', options: ['Property listing photos', 'Interior/design', 'Aerial/drone', 'Virtual tour/3D', 'Seasonal update', 'Event/lifestyle', 'Other'] } },
];

/* ── Diagnosis Summary Card ──────────────────────────────────────────────── */

function TrackingShareCard({ jobId, propertyName, trackingUrl, setTrackingUrl }: {
  jobId: string | null; propertyName?: string; trackingUrl: string | null; setTrackingUrl: (url: string) => void;
}) {
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [notifySaved, setNotifySaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const createdRef = useRef(false);

  // Auto-create tracking link as soon as jobId is available
  useEffect(() => {
    if (!jobId || trackingUrl || createdRef.current) return;
    createdRef.current = true;
    setCreating(true);
    trackingService.createLink(jobId, { property_name: propertyName })
      .then(res => { if (res.data) setTrackingUrl(res.data.tracking_url); })
      .catch(() => {})
      .finally(() => setCreating(false));
  }, [jobId, trackingUrl, propertyName, setTrackingUrl]);

  // Save notification contacts (creates a new link with contacts, or could update — for simplicity, create another)
  async function saveNotify() {
    if (!jobId || (!phone.trim() && !email.trim())) return;
    setSaving(true);
    try {
      await trackingService.createLink(jobId, {
        notify_phone: phone.trim() || undefined,
        notify_email: email.trim() || undefined,
        property_name: propertyName,
      });
      setNotifySaved(true);
    } catch { /* ignore */ }
    setSaving(false);
  }

  return (
    <div style={{ marginLeft: 42, marginBottom: 16, background: W, borderRadius: 12, padding: 16, border: '1px solid rgba(0,0,0,0.06)', animation: 'fadeSlide 0.3s ease' }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: D, marginBottom: 4 }}>Share maintenance status</div>
      <div style={{ fontSize: 13, color: 'var(--bp-muted)', marginBottom: 12, lineHeight: 1.5 }}>
        Copy the tracking link or add a phone/email to send automatic updates.
      </div>

      {/* Tracking URL */}
      {creating && (
        <div style={{ fontSize: 13, color: 'var(--bp-subtle)', marginBottom: 8 }}>Creating tracking link...</div>
      )}
      {trackingUrl && (
        <div style={{
          display: 'flex', gap: 8, alignItems: 'center', background: 'var(--bp-card)', borderRadius: 8,
          padding: '8px 10px', border: '1px solid rgba(0,0,0,0.06)', marginBottom: 12,
        }}>
          <input readOnly value={trackingUrl} style={{
            flex: 1, border: 'none', outline: 'none', fontSize: 12, color: D,
            fontFamily: "'DM Mono', monospace", background: 'transparent',
          }} />
          <button onClick={() => {
            navigator.clipboard.writeText(trackingUrl);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }} style={{
            padding: '5px 12px', borderRadius: 6, border: 'none', fontSize: 12, fontWeight: 600,
            background: copied ? G : O, color: '#fff', cursor: 'pointer', flexShrink: 0,
          }}>
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
      )}

      {/* Optional notifications */}
      {trackingUrl && !notifySaved && (
        <>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--bp-subtle)', marginBottom: 6 }}>Also send updates via (optional)</div>
          <div style={{ display: 'grid', gap: 6, marginBottom: 8 }}>
            <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Phone for SMS updates"
              style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(0,0,0,0.08)', fontSize: 13, outline: 'none', fontFamily: "'DM Sans', sans-serif" }} />
            <input value={email} onChange={e => setEmail(e.target.value)} placeholder="Email for updates"
              style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(0,0,0,0.08)', fontSize: 13, outline: 'none', fontFamily: "'DM Sans', sans-serif" }} />
          </div>
          {(phone.trim() || email.trim()) && (
            <button disabled={saving} onClick={saveNotify} style={{
              width: '100%', padding: '8px 0', borderRadius: 100, border: '1px solid rgba(0,0,0,0.08)',
              background: 'var(--bp-card)', color: D, fontSize: 13, fontWeight: 600, cursor: 'pointer',
              fontFamily: "'DM Sans', sans-serif", opacity: saving ? 0.7 : 1,
            }}>
              {saving ? 'Saving...' : 'Send updates'}
            </button>
          )}
        </>
      )}

      {/* Notifications saved */}
      {notifySaved && (
        <div style={{ fontSize: 12, color: G, fontWeight: 600 }}>
          ✓ Updates will be sent{phone ? ` to ${phone}` : ''}{phone && email ? ' and' : ''}{email ? ` to ${email}` : ''}
        </div>
      )}

      {/* Preview link */}
      {trackingUrl && (
        <div style={{ marginTop: 8, fontSize: 11 }}>
          <a href={trackingUrl} target="_blank" rel="noopener" style={{ color: '#2563EB', textDecoration: 'none', fontWeight: 600 }}>Preview tracking page →</a>
        </div>
      )}
    </div>
  );
}

function DiagnosisSummaryCard({ category, property, summary, isService, onDispatch, dispatching, estimate }: {
  category: CatDef; property: Property; summary: string; isService: boolean;
  onDispatch: () => void; dispatching: boolean; estimate?: CostEstimate;
}) {
  const [expanded, setExpanded] = useState(false);
  const isLong = summary.length > 300;

  return (
    <div style={{ marginLeft: 42, marginBottom: 16, background: 'var(--bp-card)', border: `2px solid ${G}22`, borderRadius: 16, overflow: 'hidden' }}>
      <div style={{ background: `${G}10`, padding: '12px 16px', borderBottom: `1px solid ${G}22`, display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: G }} />
        <span style={{ fontSize: 13, fontWeight: 600, color: G }}>{isService ? 'Scope confirmed' : 'AI diagnosis ready'}</span>
      </div>
      <div style={{ padding: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 16, color: D, marginBottom: 8 }}>{category.icon} {category.label}</div>
        <div style={{ fontSize: 14, color: 'var(--bp-muted)', lineHeight: 1.6, marginBottom: isLong && !expanded ? 4 : 12, whiteSpace: 'pre-wrap' }}>
          {expanded || !isLong ? renderBold(summary) : <>{renderBold(summary.slice(0, 300))}...</>}
        </div>
        {isLong && (
          <button onClick={() => setExpanded(!expanded)} style={{
            background: 'none', border: 'none', padding: 0, fontSize: 13, fontWeight: 600,
            color: G, cursor: 'pointer', marginBottom: 12, display: 'block',
          }}>{expanded ? 'Show less' : 'Show full scope'}</button>
        )}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
          <div style={{ background: W, padding: '6px 12px', borderRadius: 8, fontSize: 13 }}>
            <span style={{ color: 'var(--bp-subtle)' }}>Property:</span> <span style={{ fontWeight: 600, color: D }}>{property.name}</span>
          </div>
          {property.zipCode && (
            <div style={{ background: W, padding: '6px 12px', borderRadius: 8, fontSize: 13 }}>
              <span style={{ color: 'var(--bp-subtle)' }}>Zip:</span> <span style={{ fontWeight: 600, color: D }}>{property.zipCode}</span>
            </div>
          )}
          <div style={{ background: W, padding: '6px 12px', borderRadius: 8, fontSize: 13 }}>
            <span style={{ color: 'var(--bp-subtle)' }}>Type:</span> <span style={{ fontWeight: 600, color: D }}>{isService ? 'Service' : 'Repair'}</span>
          </div>
        </div>
        {estimate && (
          <div style={{ marginBottom: 16 }}>
            <EstimateCard estimate={estimate} />
          </div>
        )}
        <p style={{ fontSize: 12, color: 'var(--bp-subtle)', lineHeight: 1.5, marginBottom: 16 }}>
          This {isService ? 'scope' : 'diagnosis'} will be shared with providers so they can respond quickly — no need to explain twice.
        </p>
        <button onClick={onDispatch} disabled={dispatching} style={{
          padding: '14px 28px', borderRadius: 10, border: 'none', background: O, color: '#fff',
          fontSize: 15, fontWeight: 700, cursor: dispatching ? 'default' : 'pointer', width: '100%',
          opacity: dispatching ? 0.7 : 1,
        }}>
          {dispatching ? 'Dispatching...' : `Dispatch ${category.label} Pro`}
        </button>
      </div>
    </div>
  );
}

/* ── Markdown bold helper ───────────────────────────────────────────────── */

function renderBold(text: string) {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return parts.map((part, i) =>
    i % 2 === 1 ? <strong key={i}>{part}</strong> : part
  );
}

/* ── Property Selector with search ─────────────────────────────────────── */

function PropertySelector({ properties, workspaces, selectedWorkspace, onSelectWorkspace, onSelect, onAddClick }: {
  properties: Property[];
  workspaces: Workspace[];
  selectedWorkspace: string | null;
  onSelectWorkspace: (id: string) => void;
  onSelect: (p: Property) => void;
  onAddClick: () => void;
}) {
  const [search, setSearch] = useState('');

  const filtered = search.trim()
    ? properties.filter(p => {
        const q = search.toLowerCase();
        return p.name.toLowerCase().includes(q)
          || (p.address && p.address.toLowerCase().includes(q))
          || (p.city && p.city.toLowerCase().includes(q))
          || (p.zipCode && p.zipCode.includes(q));
      })
    : properties;

  return (
    <div>
      <AssistantMsg text="Which property is this for?" animate />
      {selectedWorkspace && (
        <div style={{ marginLeft: 42, display: 'grid', gap: 8, marginBottom: 16, animation: 'fadeSlide 0.3s ease' }}>
          {properties.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--bp-subtle)' }}>
              No properties found. <span onClick={onAddClick} style={{ color: O, cursor: 'pointer', fontWeight: 600 }}>Add properties first.</span>
            </div>
          ) : (
            <>
              {properties.length > 5 && (
                <div style={{ position: 'relative' }}>
                  <input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search properties by name, address, or city..."
                    style={{
                      width: '100%', padding: '12px 16px 12px 38px', borderRadius: 12, fontSize: 14,
                      border: '2px solid rgba(0,0,0,0.08)', outline: 'none', fontFamily: "'DM Sans', sans-serif",
                      color: D, boxSizing: 'border-box',
                    }}
                    onFocus={e => e.target.style.borderColor = O}
                    onBlur={e => e.target.style.borderColor = 'rgba(0,0,0,0.08)'}
                  />
                  <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 16, color: 'var(--bp-subtle)', pointerEvents: 'none' }}>🔍</span>
                </div>
              )}
              <div style={{ maxHeight: 'calc(100vh - 260px)', overflowY: 'auto' }}>
                {filtered.map(p => (
                  <button key={p.id} onClick={() => onSelect(p)} style={{
                    display: 'flex', alignItems: 'center', padding: '14px 18px', borderRadius: 14, cursor: 'pointer',
                    border: '2px solid rgba(0,0,0,0.07)', background: 'var(--bp-card)', textAlign: 'left', transition: 'all 0.15s',
                    fontFamily: "'DM Sans', sans-serif", width: '100%', marginBottom: 8,
                  }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = O; e.currentTarget.style.background = 'rgba(232,99,43,0.03)'; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--bp-border)'; e.currentTarget.style.background = 'var(--bp-card)'; }}
                  >
                    {p.photoUrls && p.photoUrls.length > 0 && (
                      <img src={p.photoUrls[0]} alt="" style={{ width: 48, height: 48, borderRadius: 8, objectFit: 'cover', marginRight: 12, flexShrink: 0 }} />
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 15, color: D }}>{p.name}</div>
                      {(p.address || p.city) && (
                        <div style={{ fontSize: 13, color: 'var(--bp-subtle)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {p.address}{p.city ? `, ${p.city}` : ''}{p.state ? `, ${p.state}` : ''}
                        </div>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--bp-subtle)', background: W, padding: '4px 10px', borderRadius: 8, flexShrink: 0 }}>
                      {p.unitCount} {p.unitCount === 1 ? 'unit' : 'units'}
                    </div>
                  </button>
                ))}
                {search && filtered.length === 0 && (
                  <div style={{ textAlign: 'center', padding: 24, color: 'var(--bp-subtle)', fontSize: 14 }}>
                    No properties match "{search}"
                  </div>
                )}
              </div>
            </>
          )}
          {workspaces.length > 1 && (
            <select value={selectedWorkspace} onChange={e => onSelectWorkspace(e.target.value)}
              style={{ marginTop: 8, padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(0,0,0,0.08)', fontSize: 13, color: 'var(--bp-muted)', cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>
              {workspaces.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Chat message components ────────────────────────────────────────────── */

function AssistantMsg({ text, animate = false }: { text: string; animate?: boolean }) {
  const [show, setShow] = useState(!animate);
  useEffect(() => { if (animate) { const t = setTimeout(() => setShow(true), 200); return () => clearTimeout(t); } }, [animate]);
  if (!show && animate) return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 12, animation: 'fadeIn 0.3s ease', minWidth: 0 }}>
      <div style={{ width: 32, height: 32, borderRadius: 10, background: O, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <span style={{ color: 'white', fontFamily: "'Fraunces', serif", fontWeight: 700, fontSize: 15 }}>h</span>
      </div>
      <div style={{ background: W, padding: '12px 16px', borderRadius: '16px 16px 16px 4px', maxWidth: '80%', minWidth: 0 }}>
        <div style={{ display: 'flex', gap: 4 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#ccc', animation: 'pulse 1s infinite' }} />
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#ccc', animation: 'pulse 1s infinite 0.2s' }} />
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#ccc', animation: 'pulse 1s infinite 0.4s' }} />
        </div>
      </div>
    </div>
  );
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 12, animation: animate ? 'fadeSlide 0.3s ease' : 'none', minWidth: 0 }}>
      <div style={{ width: 32, height: 32, borderRadius: 10, background: O, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <span style={{ color: 'white', fontFamily: "'Fraunces', serif", fontWeight: 700, fontSize: 15 }}>h</span>
      </div>
      <div style={{ background: W, padding: '12px 16px', borderRadius: '16px 16px 16px 4px', maxWidth: '80%', minWidth: 0, fontSize: 15, lineHeight: 1.6, color: D, overflowWrap: 'anywhere', wordBreak: 'break-word' }}>{renderBold(text)}</div>
    </div>
  );
}

function UserMsg({ text }: { text: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12, animation: 'fadeSlide 0.2s ease', minWidth: 0 }}>
      <div style={{ background: O, color: 'white', padding: '10px 18px', borderRadius: '16px 16px 4px 16px', maxWidth: '75%', minWidth: 0, fontSize: 15, lineHeight: 1.5, overflowWrap: 'anywhere', wordBreak: 'break-word' }}>{text}</div>
    </div>
  );
}

function StreamingMsg({ text }: { text: string }) {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 12, minWidth: 0 }}>
      <div style={{ width: 32, height: 32, borderRadius: 10, background: O, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <span style={{ color: 'white', fontFamily: "'Fraunces', serif", fontWeight: 700, fontSize: 15 }}>h</span>
      </div>
      <div style={{ background: W, padding: '12px 16px', borderRadius: '16px 16px 16px 4px', maxWidth: '80%', minWidth: 0, fontSize: 15, lineHeight: 1.6, color: D, overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
        {renderBold(text)}<span style={{ display: 'inline-block', width: 6, height: 16, background: O, marginLeft: 2, animation: 'blink 1s infinite' }} />
      </div>
    </div>
  );
}

/* ── Main component ─────────────────────────────────────────────────────── */

type Step = 'property' | 'category' | 'subcategory' | 'q1' | 'chat' | 'extra' | 'anything_else' | 'timing' | 'generating' | 'summary' | 'outreach' | 'results';

interface Message { role: 'user' | 'assistant'; content: string }

/** Resolve the effective business-chat theme. Priority:
 *    1. Explicit `bp_theme` localStorage entry set via the business portal's
 *       appearance toggle ("light" / "dark" / "auto").
 *    2. When no preference or "auto", fall back to the OS
 *       prefers-color-scheme media query — so a PM visiting /business/chat
 *       standalone with macOS dark mode on gets dark automatically.
 *  Re-computes on both a storage event (portal toggle in another tab) and
 *  a media-query change (OS-level flip). Consumed by BusinessChat to set
 *  data-theme on .b2b-root, which fans out the --bp-* CSS vars. */
function useBusinessChatTheme(): 'light' | 'dark' {
  const readSaved = () => {
    try { return (localStorage.getItem('bp_theme') || '') as '' | 'light' | 'dark' | 'auto'; }
    catch { return ''; }
  };
  const readOs = () => {
    if (typeof window === 'undefined' || !window.matchMedia) return 'light' as const;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' as const : 'light' as const;
  };
  const resolve = (saved: '' | 'light' | 'dark' | 'auto', os: 'light' | 'dark'): 'light' | 'dark' => {
    if (saved === 'dark') return 'dark';
    if (saved === 'light') return 'light';
    return os; // 'auto' or unset — follow OS
  };
  const [theme, setTheme] = useState<'light' | 'dark'>(() => resolve(readSaved(), readOs()));
  useEffect(() => {
    const recompute = () => setTheme(resolve(readSaved(), readOs()));
    window.addEventListener('storage', recompute);
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    mq?.addEventListener('change', recompute);
    // Also poll once in case another tab wrote to localStorage without
    // firing a storage event (same tab won't).
    const interval = setInterval(recompute, 2000);
    return () => {
      window.removeEventListener('storage', recompute);
      mq?.removeEventListener('change', recompute);
      clearInterval(interval);
    };
  }, []);
  return theme;
}

export default function BusinessChat() {
  useDocumentTitle('Business Dispatch');
  const b2bTheme = useBusinessChatTheme();
  const { homeowner } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const workspaceId = searchParams.get('workspace') || '';
  const prefillPropertyId = searchParams.get('property') || '';
  const prefillCategory = searchParams.get('category') || '';
  const prefillTitle = searchParams.get('prefill') || '';
  const prefillDescription = searchParams.get('description') || '';

  // Workspace & properties
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [selectedWorkspace, setSelectedWorkspace] = useState(workspaceId);
  const [properties, setProperties] = useState<Property[]>([]);
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);

  // Chat state
  const [step, setStep] = useState<Step>('property');
  const [messages, setMessages] = useState<Message[]>([]);
  const [streamText, setStreamText] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [category, setCategory] = useState<CatDef | null>(null);
  const [q1Answer, setQ1Answer] = useState('');
  const [aiDiagnosis, setAiDiagnosis] = useState('');
  const [inputVal, setInputVal] = useState('');
  const [readyToDispatch, setReadyToDispatch] = useState(false);
  const [exchangeCount, setExchangeCount] = useState(0);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showFreeInput, setShowFreeInput] = useState(false);
  const [showQ1Input, setShowQ1Input] = useState(false);
  const [q1InputVal, setQ1InputVal] = useState('');
  // Budget collection was removed — we no longer submit homeowner budget to
  // providers. The flow now jumps directly from "anything_else" to "timing".
  const [anythingElseText, setAnythingElseText] = useState('');
  const [anythingElseImage, setAnythingElseImage] = useState<string | null>(null);
  const anythingElseFileRef = useRef<HTMLInputElement>(null);
  /** Snapshot captured when the chat forks into the "dispatch now vs.
   *  continue diagnosing" decision. Holds the user's in-flight message
   *  + image + the conversation history as it was _before_ their message
   *  was posted, so "Continue diagnosing" can re-submit to streamAI with
   *  clean history (no decision prompt in the trail Claude sees). */
  const pendingDecisionRef = useRef<{ text: string; image: string | null; history: Message[] } | null>(null);

  // Empty until the PM actually picks a timing (button click in handleTiming
  // or implicit "Today" from a voice-dispatch ready handoff). Was 'asap' as
  // a default which made the checklist's "Urgency set" tick green from the
  // moment the PM picked a property — backwards. mapUserTimingToDispatch
  // safely treats '' as "flexible / low".
  const [timing, setTiming] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedDate, setSelectedDate] = useState('');

  // Outreach state
  const [jobId, setJobId] = useState<string | null>(null);
  const [outreachStatus, setOutreachStatus] = useState<JobStatusResponse | null>(null);
  const [responses, setResponses] = useState<ProviderResponseItem[]>([]);
  const [dispatching, setDispatching] = useState(false);
  const [selectedResponse, setSelectedResponse] = useState<number | null>(null);
  const [bookedName, setBookedName] = useState<string | null>(null);
  const [trackingUrl, setTrackingUrl] = useState<string | null>(null);
  const [costEstimate, setCostEstimate] = useState<CostEstimate | null>(null);

  // Occupancy check state
  const [occupancyCheck, setOccupancyCheck] = useState<{
    occupied: boolean;
    reservation: { guestName: string | null; guestEmail: string | null; guestPhone: string | null; checkIn: string; checkOut: string } | null;
  } | null>(null);
  const [entryPermission, setEntryPermission] = useState<string | null>(null);
  const [notifyGuest, setNotifyGuest] = useState(false);

  // Header occupancy badge + calendar state
  const [headerOccupancy, setHeaderOccupancy] = useState<{
    occupied: boolean;
    reservation: { guestName: string | null; checkIn: string; checkOut: string } | null;
    nextCheckIn?: { guestName: string | null; checkIn: string } | null;
  } | null>(null);
  const [calendarReservations, setCalendarReservations] = useState<Reservation[]>([]);
  const [showCalendar, setShowCalendar] = useState(false);

  // Property IQ — flat inventory list for the selected property. Fetched
  // once per property switch; filtered by the inferred business category
  // inside B2BPropertyIQCard so the right panel shows just the relevant
  // equipment (brand / model / age / condition) while the PM is chatting.
  const [propertyInventory, setPropertyInventory] = useState<PropertyInventoryItem[]>([]);

  // Category-picker UI: service tier collapsed behind "+ N more" pill on
  // mobile, expanded by default on desktop where vertical real estate is
  // cheap. Checks on mount; stays put afterward (user can still toggle
  // manually on either breakpoint).
  const [showAllB2BCats, setShowAllB2BCats] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth >= 981;
  });

  // Voice dictation via Web Speech API — cheaper + simpler than running a
  // second conversational AI inside the already-AI-driven B2B chat. Fills
  // the text input as the user speaks; tap the mic a second time to stop.
  const [dictating, setDictating] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  // Free-form "or just describe it" textarea shown on the category step.
  const [directText, setDirectText] = useState('');
  const [directFocus, setDirectFocus] = useState(false);

  // Voice + Video chat panels — identical to /quote, wired with business
  // context so Claude grounds its replies in the real property state
  // (address, occupancy, known inventory).
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [videoChatOpen, setVideoChatOpen] = useState(false);

  /** Equipment details Claude extracts from the live chat via <equipment>
   *  tags in its stream. Accumulates across turns; items are also folded
   *  into the dispatch summary so the provider sees the brand/model the
   *  PM mentioned (and persisted back to property inventory so the next
   *  chat has the context baked in). */
  type DiscoveredItem = {
    itemType: string;
    brand?: string;
    modelNumber?: string;
    estimatedAgeYears?: number;
    condition?: string;
    notes?: string;
    category?: string;
    /** Cache of property IDs this item has already been POSTed to so we
     *  don't double-write during the same session if the AI re-mentions
     *  the same item in a later turn. Key = propertyId+itemType+brand. */
    _persistedKey?: string;
  };
  const [discoveredEquipment, setDiscoveredEquipment] = useState<DiscoveredItem[]>([]);
  const discoveredPersistedKeysRef = useRef<Set<string>>(new Set());
  /** Latest `<category>` tag Homie emitted during a voice/video turn —
   *  updated on every handleVoiceTurn so handleVoiceReady can prefer
   *  Claude's own classification over keyword-inference at dispatch
   *  handoff. Cleared on every reset / "+ New" to avoid leaking a stale
   *  category into the next call. */
  const latestVoiceCategoryRef = useRef<string | null>(null);

  const [imgPreview, setImgPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  /** Cloudinary URLs of photos uploaded during this chat session */
  const uploadedPhotoUrlsRef = useRef<string[]>([]);
  const chatEndRef = useRef<HTMLDivElement>(null);
  /** Sentinel placed immediately after the messages list (and above the
   *  suggestion chips + input). Auto-scrolling to this instead of the
   *  very end of the chat column keeps the latest AI response pinned
   *  near the viewport bottom rather than pushing it above the fold. */
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const sessionIdRef = useRef(`b2b-${Date.now()}-${Math.random().toString(36).slice(2)}`);

  // Load workspaces
  useEffect(() => {
    if (!homeowner) { navigate('/login?redirect=/business/chat'); return; }
    businessService.listWorkspaces().then(res => {
      if (res.data) {
        setWorkspaces(res.data);
        if (!selectedWorkspace && res.data.length > 0) setSelectedWorkspace(res.data[0].id);
      }
    });
  }, [homeowner]);

  // Load properties when workspace changes
  const prefillHandledRef = useRef(false);
  useEffect(() => {
    if (!selectedWorkspace) return;
    businessService.listProperties(selectedWorkspace).then(res => {
      if (res.data) {
        const activeProps = res.data.filter(p => p.active);
        setProperties(activeProps);

        // Auto-select property (and optionally category) from URL params
        if (prefillPropertyId && !prefillHandledRef.current) {
          prefillHandledRef.current = true;
          const prop = activeProps.find(p => p.id === prefillPropertyId);
          if (prop) {
            setSelectedProperty(prop);
            if (prefillCategory) {
              // Find matching category
              const cat = B2B_CATEGORIES.find(c => c.id === prefillCategory);
              if (cat) {
                setCategory(cat);
                const propName = prop.name;
                const title = prefillTitle || cat.label;
                const desc = prefillDescription || '';
                setMessages([
                  { role: 'assistant', content: `${cat.icon} **${title}** at ${propName}${desc ? ` — ${desc}` : ''}. ${cat.q1.text}` },
                ]);
                setStep('q1');
              } else {
                setMessages([{ role: 'assistant', content: `Selected **${prop.name}**. What do you need help with?` }]);
                setStep('category');
              }
            } else {
              // Property only — skip property selection, go to category
              setMessages([{ role: 'assistant', content: `Selected **${prop.name}**. What do you need help with?` }]);
              setStep('category');
            }
          }
        }
      }
    });
  }, [selectedWorkspace]);

  // Auto-scroll: pin the tail of the messages list (not the very end of
  // the chat column) to the viewport bottom so the latest AI reply stays
  // visible after every submit instead of getting pushed above the fold
  // by suggestion chips + input controls rendered below it.
  useEffect(() => {
    if (messages.length === 0) return;
    const target = messagesEndRef.current ?? chatEndRef.current;
    target?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, streamText, step]);

  /** Flattened chat transcript used to correlate inventory items with
   *  what's actually being discussed. Only PM-sourced text contributes —
   *  user messages, the in-flight input/dictation, q1 answer, and any
   *  equipment the AI extracted via <equipment> tags (those are
   *  PM-mentioned too, per the system prompt).
   *
   *  Assistant text is DELIBERATELY excluded: when the AI asks "can you
   *  turn on the overhead light so I can see the burner?" the word
   *  "light" would otherwise correlate to every light fixture in the
   *  scan — even though lights have nothing to do with the range
   *  diagnostic. Only the PM's own words should add items to the card.
   *  The AI-in-flight streamText is also excluded for the same reason. */
  const chatCorrelationText = useCallback(() => {
    const pieces: string[] = [];
    for (const m of messages) {
      if (m.role === 'user') pieces.push(m.content);
    }
    if (inputVal) pieces.push(inputVal);
    if (directText) pieces.push(directText);
    if (q1Answer) pieces.push(q1Answer);
    for (const d of discoveredEquipment) {
      pieces.push(d.itemType);
      if (d.brand) pieces.push(d.brand);
      if (d.modelNumber) pieces.push(d.modelNumber);
    }
    return pieces.join(' \n ').toLowerCase();
  }, [messages, inputVal, directText, q1Answer, discoveredEquipment])();

  /** Scans a raw AI response for <equipment>…</equipment> JSON blocks and
   *  folds them into `discoveredEquipment` state. Dedupes by item type +
   *  brand so the same AC doesn't get recorded twice if Claude re-mentions
   *  it. Kicks off a non-blocking POST to the inventory endpoint so the
   *  discovery persists for future chats. */
  function ingestEquipmentFromRaw(raw: string) {
    if (!raw || !raw.includes('<equipment>')) return;
    const re = /<equipment>([\s\S]*?)<\/equipment>/gi;
    const fresh: DiscoveredItem[] = [];
    let match: RegExpExecArray | null;
    while ((match = re.exec(raw)) !== null) {
      try {
        const body = match[1].trim();
        const parsed = JSON.parse(body) as {
          item_type?: string; category?: string;
          brand?: string | null; model_number?: string | null;
          estimated_age_years?: number | null;
          condition?: string | null; notes?: string | null;
        };
        if (!parsed.item_type) continue;
        const dedupeKey = `${parsed.item_type}|${(parsed.brand || '').toLowerCase()}|${(parsed.model_number || '').toLowerCase()}`;
        if (discoveredPersistedKeysRef.current.has(dedupeKey)) continue;
        discoveredPersistedKeysRef.current.add(dedupeKey);
        fresh.push({
          itemType: parsed.item_type,
          category: parsed.category ?? undefined,
          brand: parsed.brand ?? undefined,
          modelNumber: parsed.model_number ?? undefined,
          estimatedAgeYears: typeof parsed.estimated_age_years === 'number' ? parsed.estimated_age_years : undefined,
          condition: parsed.condition ?? undefined,
          notes: parsed.notes ?? undefined,
          _persistedKey: dedupeKey,
        });
      } catch (err) {
        // JSON parse failure — tag was malformed; skip silently
        console.warn('[BusinessChat] Failed to parse <equipment> JSON:', err);
      }
    }
    if (fresh.length === 0) return;
    setDiscoveredEquipment(prev => [...prev, ...fresh]);
    // Persist to property inventory (best-effort, non-blocking). The
    // addManualInventoryItem endpoint accepts our fields; AI-discovered
    // items stay as the default 'ai_identified' status on the backend
    // until the PM confirms them from the inventory UI.
    if (selectedWorkspace && selectedProperty?.id) {
      for (const item of fresh) {
        businessService.addManualInventoryItem(
          selectedWorkspace,
          selectedProperty.id,
          {
            category: item.category || 'system',
            item_type: item.itemType,
            brand: item.brand,
            model_number: item.modelNumber,
            estimated_age_years: item.estimatedAgeYears,
            condition: item.condition,
            notes: item.notes ? `[Homie chat] ${item.notes}` : '[Homie chat]',
          },
        ).catch(err => console.warn('[BusinessChat] inventory persist failed:', err));
      }
    }
  }

  // Build property context string with relevant equipment details
  function getPropertyContext(): string {
    if (!selectedProperty) return '';
    const p = selectedProperty;
    // Strip access codes, door codes, gate codes from notes before sending to AI
    const safeNotes = p.notes
      ? p.notes.replace(/\b(door|gate|lock|access|entry|wifi|password|code|pin)\s*(code|number|#|:)?\s*[:\-]?\s*\S+/gi, '[access info redacted]').trim()
      : null;
    const parts: string[] = [
      `Property: ${p.name}`,
      p.address ? `Address: ${p.address}${p.city ? `, ${p.city}` : ''}${p.state ? `, ${p.state}` : ''} ${p.zipCode || ''}` : '',
      `Type: ${p.propertyType}`,
      `Units: ${p.unitCount}`,
      p.bedrooms != null && p.bedrooms > 0 ? `Bedrooms: ${p.bedrooms}` : '',
      p.bathrooms != null && +p.bathrooms > 0 ? `Bathrooms: ${p.bathrooms}` : '',
      p.sqft != null && p.sqft > 0 ? `Square footage: ${p.sqft.toLocaleString()} sqft` : '',
      p.beds && p.beds.length > 0 ? `Beds: ${p.beds.map(b => `${b.count}\u00D7 ${b.type}`).join(', ')}` : '',
      safeNotes ? `Notes: ${safeNotes}` : '',
    ].filter(Boolean);

    // Inject relevant property details based on selected category
    const d = p.details as PropertyDetails | null;
    if (d) {
      const catId = category?.id || '';

      // Helper to format an object's non-empty values
      function fmt(obj: Record<string, unknown> | undefined, prefix: string): string {
        if (!obj) return '';
        const entries = Object.entries(obj)
          .filter(([, v]) => v !== undefined && v !== '' && v !== null && v !== false)
          .map(([k, v]) => {
            const label = k.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase());
            return `${label}: ${String(v)}`;
          });
        return entries.length > 0 ? `${prefix}: ${entries.join(', ')}` : '';
      }

      // Always include access info (redacted codes for AI — just brands)
      if (d.access) {
        const accessParts = [
          d.access.alarmBrand && `Alarm: ${d.access.alarmBrand}`,
        ].filter(Boolean);
        if (accessParts.length > 0) parts.push(`Security: ${accessParts.join(', ')}`);
      }

      // Category-specific details
      if (['hvac', 'chimney', 'insulation'].includes(catId)) {
        const h = d.hvac;
        if (h) {
          const hvacParts = [
            h.acType && `${h.acType} AC`,
            h.acBrand && `(${h.acBrand}${h.acModel ? ` ${h.acModel}` : ''})`,
            h.acAge && `${h.acAge} old`,
            h.heatingType && `Heating: ${h.heatingType}`,
            h.heatingBrand && `(${h.heatingBrand}${h.heatingModel ? ` ${h.heatingModel}` : ''})`,
            h.thermostatBrand && `Thermostat: ${h.thermostatBrand}${h.thermostatModel ? ` ${h.thermostatModel}` : ''}`,
            h.filterSize && `Filter: ${h.filterSize}`,
          ].filter(Boolean);
          if (hvacParts.length > 0) parts.push(`HVAC: ${hvacParts.join(', ')}`);
        }
      }

      if (['water_heater', 'plumbing'].includes(catId)) {
        const wh = d.waterHeater;
        if (wh) {
          const whParts = [
            wh.type && `${wh.type}`,
            wh.brand && `${wh.brand}`,
            wh.model && `${wh.model}`,
            wh.fuel && `${wh.fuel}`,
            wh.capacity && `${wh.capacity}`,
            wh.age && `${wh.age} old`,
            wh.location && `in ${wh.location}`,
          ].filter(Boolean);
          if (whParts.length > 0) parts.push(`Water heater: ${whParts.join(', ')}`);
        }
      }

      if (['plumbing', 'septic_sewer'].includes(catId)) {
        const pl = d.plumbing;
        if (pl) {
          const plParts = [
            pl.kitchenFaucetBrand && `Kitchen faucet: ${pl.kitchenFaucetBrand}`,
            pl.bathroomFaucetBrand && `Bathroom faucet: ${pl.bathroomFaucetBrand}`,
            pl.toiletBrand && `Toilet: ${pl.toiletBrand}`,
            pl.waterSoftener && `Water softener: ${pl.waterSoftener}`,
            pl.septicOrSewer && `${pl.septicOrSewer}`,
            pl.mainShutoffLocation && `Main shutoff: ${pl.mainShutoffLocation}`,
          ].filter(Boolean);
          if (plParts.length > 0) parts.push(`Plumbing: ${plParts.join(', ')}`);
        }
      }

      if (['appliance', 'cleaning'].includes(catId)) {
        const ap = d.appliances;
        if (ap) {
          const appParts: string[] = [];
          for (const [name, info] of Object.entries(ap)) {
            if (!info) continue;
            const appInfo = info as Record<string, string>;
            const desc = [appInfo.brand, appInfo.model, appInfo.fuel].filter(Boolean).join(' ');
            if (desc) appParts.push(`${name.charAt(0).toUpperCase() + name.slice(1)}: ${desc}`);
          }
          if (appParts.length > 0) parts.push(`Appliances: ${appParts.join(', ')}`);
        }
      }

      if (['electrical', 'generator_install', 'ev_charger_install', 'solar', 'security_systems'].includes(catId)) {
        const el = d.electrical;
        if (el) {
          const elParts = [
            el.breakerBoxLocation && `Breaker: ${el.breakerBoxLocation}`,
            el.panelAmperage && `Panel: ${el.panelAmperage}`,
            el.hasGenerator && el.generatorType && `Generator: ${el.generatorType}`,
            el.hasSolar && el.solarSystem && `Solar: ${el.solarSystem}`,
            el.hasEvCharger && el.evChargerBrand && `EV charger: ${el.evChargerBrand}`,
          ].filter(Boolean);
          if (elParts.length > 0) parts.push(`Electrical: ${elParts.join(', ')}`);
        }
      }

      if (['pool', 'hot_tub'].includes(catId)) {
        const ps = d.poolSpa;
        if (ps) {
          const psParts = [
            ps.poolType && `Pool: ${ps.poolType}`,
            ps.poolHeaterBrand && `Heater: ${ps.poolHeaterBrand}`,
            ps.poolPumpBrand && `Pump: ${ps.poolPumpBrand}`,
            ps.hotTubBrand && `Hot tub: ${ps.hotTubBrand}${ps.hotTubModel ? ` ${ps.hotTubModel}` : ''}`,
          ].filter(Boolean);
          if (psParts.length > 0) parts.push(`Pool/Spa: ${psParts.join(', ')}`);
        }
      }

      if (['roofing', 'siding', 'gutter', 'garage_door', 'fencing', 'sprinkler_irrigation', 'landscaping', 'painting', 'pressure_washing'].includes(catId)) {
        const ex = d.exterior;
        if (ex) {
          const exParts = [
            ex.roofType && `Roof: ${ex.roofType}`,
            ex.roofAge && `(${ex.roofAge} old)`,
            ex.sidingMaterial && `Siding: ${ex.sidingMaterial}`,
            ex.fenceMaterial && `Fence: ${ex.fenceMaterial}`,
            ex.garageDoorBrand && `Garage door: ${ex.garageDoorBrand}`,
            ex.irrigationBrand && `Irrigation: ${ex.irrigationBrand}`,
          ].filter(Boolean);
          if (exParts.length > 0) parts.push(`Exterior: ${exParts.join(', ')}`);
        }
      }

      if (d.general) {
        const gParts = [
          d.general.yearBuilt && `Built: ${d.general.yearBuilt}`,
          d.general.hasHoa && `HOA${d.general.hoaContact ? `: ${d.general.hoaContact}` : ''}`,
        ].filter(Boolean);
        if (gParts.length > 0) parts.push(gParts.join(', '));
      }
    }

    return parts.join('\n');
  }

  // Stream AI response
  function streamAI(userMsg: string, history: Message[], onDone?: (fullText: string, rawText: string) => void, images?: string[]) {
    setStreaming(true);
    setStreamText('');
    let full = '';
    let raw = '';

    // Filter out XML tags from visible text
    let insideTag = false;
    let tagBuf = '';

    const callbacks: DiagnosticStreamCallbacks = {
      onToken: (token: string) => {
        raw += token;
        for (const ch of token) {
          if (insideTag) {
            tagBuf += ch;
            if (/<\/(diagnosis|job_summary|suggestions|equipment)>/.test(tagBuf)) {
              // Parse suggestions
              const sugMatch = tagBuf.match(/<suggestions>([\s\S]*?)<\/suggestions>/);
              if (sugMatch) {
                try {
                  const parsed = JSON.parse(sugMatch[1]) as string[];
                  if (Array.isArray(parsed)) setSuggestions(parsed);
                } catch { /* ignore */ }
              }
              insideTag = false; tagBuf = '';
            }
            continue;
          }
          if (ch === '<') { tagBuf = '<'; continue; }
          if (tagBuf.length > 0) {
            tagBuf += ch;
            if (ch === '>') {
              if (/^<(diagnosis|job_summary|suggestions|equipment)>/.test(tagBuf)) { insideTag = true; }
              else { full += tagBuf; setStreamText(full); tagBuf = ''; }
            }
            if (tagBuf.length > 15 && !tagBuf.includes('>')) { full += tagBuf; setStreamText(full); tagBuf = ''; }
            continue;
          }
          full += ch;
          setStreamText(full);
        }
      },
      onDiagnosis: () => {},
      onJobSummary: () => {},
      onDone: () => {
        if (tagBuf && !insideTag) { full += tagBuf; }
        setStreaming(false);
        setStreamText('');
        setMessages(prev => [...prev, { role: 'assistant', content: full.trim() }]);
        // Extract any <equipment> blocks the AI emitted this turn; fold
        // into both local state (for the dispatch summary + mobile IQ
        // card) and the property inventory (so the next chat has them).
        ingestEquipmentFromRaw(raw);
        onDone?.(full.trim(), raw);
      },
      onError: (err: Error) => {
        setStreaming(false);
        setStreamText('');
        setMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, I had trouble processing that. Please try again.' }]);
      },
    };

    const mode = category?.group === 'service' ? 'service' : 'repair';

    abortRef.current = businessChatService.sendMessage(
      userMsg,
      mode as 'repair' | 'service',
      callbacks,
      {
        history: history.map(m => ({ role: m.role, content: m.content })),
        images,
        propertyContext: getPropertyContext(),
        propertyId: selectedProperty?.id,
        workspaceId: selectedWorkspace || undefined,
      },
    );
  }

  // Fetch header occupancy + calendar when property is selected
  useEffect(() => {
    if (!selectedProperty || !selectedWorkspace) {
      setHeaderOccupancy(null);
      setCalendarReservations([]);
      return;
    }
    let cancelled = false;
    // Fetch current reservation (occupancy)
    businessService.getCurrentReservation(selectedWorkspace, selectedProperty.id)
      .then(res => {
        if (cancelled) return;
        if (res.data) {
          setHeaderOccupancy({
            occupied: res.data.occupied,
            reservation: res.data.reservation ? {
              guestName: res.data.reservation.guestName,
              checkIn: res.data.reservation.checkIn,
              checkOut: res.data.reservation.checkOut,
            } : null,
          });
        }
      }).catch(() => {});
    // Fetch 90-day reservation window for calendar
    const now = new Date();
    const from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const future = new Date(now.getFullYear(), now.getMonth() + 3, 0);
    const to = `${future.getFullYear()}-${String(future.getMonth() + 1).padStart(2, '0')}-${String(future.getDate()).padStart(2, '0')}`;
    businessService.getPropertyReservations(selectedWorkspace, selectedProperty.id, from, to)
      .then(res => {
        if (cancelled) return;
        if (res.data) {
          setCalendarReservations(res.data.reservations);
          // If not currently occupied, find next upcoming check-in
          if (!cancelled) {
            const upcoming = res.data.reservations
              .filter(r => new Date(r.checkIn) > now && r.status !== 'cancelled')
              .sort((a, b) => new Date(a.checkIn).getTime() - new Date(b.checkIn).getTime());
            if (upcoming.length > 0) {
              setHeaderOccupancy(prev => prev ? { ...prev, nextCheckIn: { guestName: upcoming[0].guestName, checkIn: upcoming[0].checkIn } } : prev);
            }
          }
        }
      }).catch(() => {});

    // Fetch property inventory for the Property IQ card. Flattens rooms +
    // unassigned items into a single list; filtering by category happens
    // at render time. Missing scan / no items just produces an empty
    // array which the card renders as an empty state.
    setPropertyInventory([]);
    businessService.getPropertyInventory(selectedWorkspace, selectedProperty.id)
      .then(res => {
        if (cancelled) return;
        const rooms = res.data?.rooms ?? [];
        const unassigned = res.data?.unassignedItems ?? [];
        const flat: PropertyInventoryItem[] = [
          ...rooms.flatMap(r => r.items),
          ...unassigned,
        ].filter(it => it.status !== 'pm_dismissed');
        setPropertyInventory(flat);
      }).catch(() => { /* best-effort — empty state falls through */ });

    return () => { cancelled = true; };
  }, [selectedProperty, selectedWorkspace]);

  // Handle property selection
  function selectProperty(p: Property) {
    setSelectedProperty(p);
    setStep('category');
    setMessages([]);
  }

  // Handle category selection
  const [activeGroup, setActiveGroup] = useState<CatGroup | null>(null);

  function handleGroupSelect(group: CatGroup) {
    if (group.subs.length === 1) {
      // Single sub — skip drill-down
      const cat = B2B_CATEGORIES.find(c => c.id === group.subs[0].id);
      if (cat) selectCategory(cat);
      return;
    }
    setActiveGroup(group);
    setMessages([{ role: 'assistant', content: `What type of **${group.label.toLowerCase()}** do you need?` }]);
    setStep('subcategory');
  }

  function handleSubSelect(subId: string) {
    const cat = B2B_CATEGORIES.find(c => c.id === subId);
    if (cat) selectCategory(cat);
  }

  // Build the business-context string that gets fed to the voice/video
  // backend. Picks up whatever we already know: property + occupancy +
  // a compact known-equipment summary from the inventory fetch. Kept
  // under ~2k chars so the Claude system-prompt stays lean.
  /** Builds the CONTEXT block sent to the voice/video backend. Mirrors
   *  what the typed-chat flow gets via getPropertyContext() PLUS the
   *  full Property IQ inventory, so voice Homie doesn't re-ask for
   *  brand/model/age details that are already on file (e.g. "what
   *  brand is the dishwasher?" when the scan knows it's a Samsung). */
  const buildBusinessContext = useCallback((): string | null => {
    if (!selectedProperty) return null;
    const lines: string[] = [];
    const p = selectedProperty;

    // ── Property identity + size ───────────────────────────────
    lines.push(`Property: ${p.name}${p.zipCode ? ` · ${p.zipCode}` : ''}`);
    if (p.address) lines.push(`Address: ${p.address}${p.city ? `, ${p.city}` : ''}${p.state ? `, ${p.state}` : ''} ${p.zipCode || ''}`.trim());
    const sizeBits: string[] = [];
    if (p.propertyType) sizeBits.push(p.propertyType);
    if (p.bedrooms != null && p.bedrooms > 0) sizeBits.push(`${p.bedrooms}bd`);
    if (p.bathrooms != null && +p.bathrooms > 0) sizeBits.push(`${p.bathrooms}ba`);
    if (p.sqft != null && p.sqft > 0) sizeBits.push(`${p.sqft.toLocaleString()} sqft`);
    if (sizeBits.length) lines.push(`Size/type: ${sizeBits.join(' · ')}`);
    if (p.beds && p.beds.length > 0) lines.push(`Beds: ${p.beds.map(b => `${b.count}× ${b.type}`).join(', ')}`);

    // ── Occupancy + upcoming reservations ──────────────────────
    // Homie uses these dates to calibrate urgency (a fix that blocks an
    // occupied guest is a TODAY job; a cosmetic repair in a vacant unit
    // with no reservations for two weeks is flexible). We spell out both
    // the current state AND the next reservation on deck so Claude can
    // weigh turnover windows without re-asking.
    const daysBetween = (iso: string): number => {
      const d = Date.parse(iso);
      if (Number.isNaN(d)) return Number.POSITIVE_INFINITY;
      return Math.round((d - Date.now()) / 86_400_000);
    };
    const fmtDay = (iso: string) => {
      try {
        return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
      } catch { return iso; }
    };
    const relative = (iso: string) => {
      const n = daysBetween(iso);
      if (n <= 0) return 'today';
      if (n === 1) return 'tomorrow';
      return `in ${n} day${n === 1 ? '' : 's'}`;
    };
    if (headerOccupancy?.occupied && headerOccupancy.reservation) {
      const out = fmtDay(headerOccupancy.reservation.checkOut);
      const days = daysBetween(headerOccupancy.reservation.checkOut);
      lines.push(`Status: OCCUPIED by ${headerOccupancy.reservation.guestName || 'a guest'}. Checkout ${out} (${relative(headerOccupancy.reservation.checkOut)}${days >= 0 ? '' : ' — overdue'}). A guest is on-property right now — factor their impact into urgency and access.`);
      if (headerOccupancy.nextCheckIn) {
        const inDate = fmtDay(headerOccupancy.nextCheckIn.checkIn);
        lines.push(`Next guest (${headerOccupancy.nextCheckIn.guestName || 'TBD'}) arrives ${inDate} (${relative(headerOccupancy.nextCheckIn.checkIn)}). Tight turnover windows are dispatch-urgent.`);
      }
    } else if (headerOccupancy?.nextCheckIn) {
      const start = fmtDay(headerOccupancy.nextCheckIn.checkIn);
      const n = daysBetween(headerOccupancy.nextCheckIn.checkIn);
      const urgency = n <= 1
        ? 'IMMINENT — this fix must be done before the guest arrives'
        : n <= 3
          ? `tight — ${n} day${n === 1 ? '' : 's'} to dispatch and complete`
          : `${n}-day window before next check-in — plenty of runway`;
      lines.push(`Status: VACANT; next guest (${headerOccupancy.nextCheckIn.guestName || 'TBD'}) arrives ${start}. Window: ${urgency}.`);
    } else if (headerOccupancy) {
      lines.push('Status: VACANT; no upcoming reservations on file. Fully flexible dispatch window.');
    }
    // Surface the next 2-3 reservations beyond the immediate pair so the
    // AI can spot back-to-back bookings ("tight turnover after this
    // guest") without re-querying the calendar.
    if (calendarReservations.length > 0) {
      const now = Date.now();
      const soon = calendarReservations
        .filter(r => Date.parse(r.checkIn) >= now - 86_400_000)
        .sort((a, b) => Date.parse(a.checkIn) - Date.parse(b.checkIn))
        .slice(0, 4);
      if (soon.length > 1) {
        const rows = soon.map(r => `  · ${r.guestName || 'Guest'}: ${fmtDay(r.checkIn)} → ${fmtDay(r.checkOut)}`);
        lines.push(`Upcoming reservations (next ${soon.length}):\n${rows.join('\n')}`);
      }
    }

    // ── Saved property notes (access codes redacted) ──────────
    if (p.notes) {
      const safeNotes = p.notes
        .replace(/\b(door|gate|lock|access|entry|wifi|password|code|pin)\s*(code|number|#|:)?\s*[:\-]?\s*\S+/gi, '[redacted]')
        .trim();
      if (safeNotes) lines.push(`Notes: ${safeNotes}`);
    }

    // ── Saved property details (equipment brands + ages) ──────
    // This is the same data the typed chat injects via
    // getPropertyContext, but without any category filter — voice
    // hasn't inferred a category yet so we hand the model every
    // equipment section that's populated.
    const d = p.details as PropertyDetails | null;
    if (d) {
      if (d.hvac) {
        const h = d.hvac;
        const bits = [
          h.acType && `${h.acType} AC`,
          h.acBrand && `(${h.acBrand}${h.acModel ? ` ${h.acModel}` : ''})`,
          h.acAge && `${h.acAge} old`,
          h.heatingType && `Heating: ${h.heatingType}`,
          h.heatingBrand && `(${h.heatingBrand}${h.heatingModel ? ` ${h.heatingModel}` : ''})`,
          h.thermostatBrand && `Thermostat: ${h.thermostatBrand}${h.thermostatModel ? ` ${h.thermostatModel}` : ''}`,
          h.filterSize && `Filter: ${h.filterSize}`,
        ].filter(Boolean);
        if (bits.length) lines.push(`HVAC: ${bits.join(', ')}`);
      }
      if (d.waterHeater) {
        const wh = d.waterHeater;
        const bits = [wh.type, wh.brand, wh.model, wh.fuel, wh.capacity, wh.age && `${wh.age} old`, wh.location && `in ${wh.location}`].filter(Boolean);
        if (bits.length) lines.push(`Water heater: ${bits.join(' · ')}`);
      }
      if (d.plumbing) {
        const pl = d.plumbing;
        const bits = [
          pl.kitchenFaucetBrand && `Kitchen faucet: ${pl.kitchenFaucetBrand}`,
          pl.bathroomFaucetBrand && `Bath faucet: ${pl.bathroomFaucetBrand}`,
          pl.toiletBrand && `Toilet: ${pl.toiletBrand}`,
          pl.waterSoftener && `Water softener: ${pl.waterSoftener}`,
          pl.septicOrSewer && `${pl.septicOrSewer}`,
          pl.mainShutoffLocation && `Main shutoff: ${pl.mainShutoffLocation}`,
        ].filter(Boolean);
        if (bits.length) lines.push(`Plumbing: ${bits.join(', ')}`);
      }
      if (d.appliances) {
        const appParts: string[] = [];
        for (const [name, info] of Object.entries(d.appliances)) {
          if (!info) continue;
          const ap = info as Record<string, string>;
          const desc = [ap.brand, ap.model, ap.fuel].filter(Boolean).join(' ');
          if (desc) appParts.push(`${name.charAt(0).toUpperCase() + name.slice(1)}: ${desc}`);
        }
        if (appParts.length) lines.push(`Appliances: ${appParts.join(', ')}`);
      }
      if (d.electrical) {
        const el = d.electrical;
        const bits = [
          el.breakerBoxLocation && `Breaker: ${el.breakerBoxLocation}`,
          el.panelAmperage && `Panel: ${el.panelAmperage}`,
          el.hasGenerator && el.generatorType && `Generator: ${el.generatorType}`,
          el.hasSolar && el.solarSystem && `Solar: ${el.solarSystem}`,
          el.hasEvCharger && el.evChargerBrand && `EV charger: ${el.evChargerBrand}`,
        ].filter(Boolean);
        if (bits.length) lines.push(`Electrical: ${bits.join(', ')}`);
      }
      if (d.poolSpa) {
        const ps = d.poolSpa;
        const bits = [
          ps.poolType && `Pool: ${ps.poolType}`,
          ps.poolHeaterBrand && `Heater: ${ps.poolHeaterBrand}`,
          ps.poolPumpBrand && `Pump: ${ps.poolPumpBrand}`,
          ps.hotTubBrand && `Hot tub: ${ps.hotTubBrand}${ps.hotTubModel ? ` ${ps.hotTubModel}` : ''}`,
        ].filter(Boolean);
        if (bits.length) lines.push(`Pool/Spa: ${bits.join(', ')}`);
      }
      if (d.exterior) {
        const ex = d.exterior;
        const bits = [
          ex.roofType && `Roof: ${ex.roofType}${ex.roofAge ? ` (${ex.roofAge} old)` : ''}`,
          ex.sidingMaterial && `Siding: ${ex.sidingMaterial}`,
          ex.fenceMaterial && `Fence: ${ex.fenceMaterial}`,
          ex.garageDoorBrand && `Garage door: ${ex.garageDoorBrand}`,
          ex.irrigationBrand && `Irrigation: ${ex.irrigationBrand}`,
        ].filter(Boolean);
        if (bits.length) lines.push(`Exterior: ${bits.join(', ')}`);
      }
      if (d.access?.alarmBrand) lines.push(`Security: Alarm ${d.access.alarmBrand}`);
      if (d.general) {
        const gBits = [
          d.general.yearBuilt && `Built ${d.general.yearBuilt}`,
          d.general.hasHoa && `HOA${d.general.hoaContact ? `: ${d.general.hoaContact}` : ''}`,
        ].filter(Boolean);
        if (gBits.length) lines.push(gBits.join(', '));
      }
    }

    // ── Property IQ scan inventory — the big one. Every item with
    // brand/model/age, up to 40 rows so large scans aren't clipped. ──
    if (propertyInventory.length > 0) {
      const rows = propertyInventory.slice(0, 40).map(it => {
        const who = [it.brand, it.modelNumber].filter(Boolean).join(' ');
        const typeLabel = it.itemType.replace(/_/g, ' ');
        const age = it.estimatedAgeYears ? `${Math.round(parseFloat(it.estimatedAgeYears))}yr` : '';
        const cond = it.condition && it.condition !== 'good' ? `(${it.condition})` : '';
        const notes = it.notes ? ` — ${it.notes}` : '';
        return `- ${typeLabel}${who ? `: ${who}` : ''}${age ? ` · ${age}` : ''}${cond ? ` ${cond}` : ''}${notes}`.trim();
      });
      lines.push(`Property IQ inventory (${propertyInventory.length} item${propertyInventory.length === 1 ? '' : 's'} on file):\n${rows.join('\n')}`);
    }

    return lines.join('\n');
  }, [selectedProperty, headerOccupancy, propertyInventory, calendarReservations]);

  // Voice-turn + voice-ready handlers (shared by InlineVoicePanel and
  // VideoChatPanel). Mirrors the /quote pattern: each turn echoes both
  // sides into the visible chat; equipment Homie discovered visually
  // (or from a brand the PM spoke) gets folded into the same
  // discoveredEquipment state the typed-chat path uses, then persisted
  // to Property IQ so future calls already know about it.
  // Not wrapped in useCallback — ingestVoiceEquipment reads live state
  // via closure, so memoizing this would freeze it against the first
  // render's state.
  const handleVoiceTurn = (
    userText: string,
    assistantText: string,
    inferredCategory: string | null,
    equipmentDiscovered?: Array<Record<string, unknown>>,
  ) => {
    const u = userText.trim();
    const a = assistantText.trim();
    if (!u) return;
    setMessages(m => {
      const next = [...m];
      next.push({ role: 'user', content: `🎤 ${u}` });
      if (a) next.push({ role: 'assistant', content: a });
      return next;
    });
    // Capture Homie's own <category> classification from this turn — the
    // voice backend extracts it from Claude's reply and passes it here.
    // Save the latest non-null hit so handleVoiceReady has the
    // authoritative classification, AND commit it to `category` state
    // immediately so the right-rail "homie is listening" card + the
    // checklist (Category row) light up on turn 1 instead of waiting
    // for the PM to say "dispatch now".
    if (inferredCategory) {
      latestVoiceCategoryRef.current = inferredCategory;
      const mapped = mapVoiceCategoryToB2B(inferredCategory);
      if (mapped) {
        const picked = B2B_CATEGORIES.find(c => c.id === mapped);
        if (picked) {
          // Only overwrite the category if it's currently empty or if
          // Claude's latest guess is different — avoids churn when every
          // turn re-emits the same ID, and lets a mid-call correction
          // (e.g. "actually it's the sink, not the dishwasher") take
          // effect immediately.
          setCategory(prev => (!prev || prev.id !== picked.id) ? picked : prev);
        }
      }
    }
    // Reuse the same <equipment> ingestion the typed-chat path uses.
    // ingestEquipmentFromRaw scans for the wrapping tag, so re-wrap the
    // structured payload into <equipment>{...}</equipment> blocks before
    // handing it in.
    if (equipmentDiscovered && equipmentDiscovered.length > 0) {
      const wrapped = equipmentDiscovered
        .map(item => `<equipment>${JSON.stringify(item)}</equipment>`)
        .join('\n');
      ingestEquipmentFromRaw(wrapped);
    }
  };

  /** Voice/video <ready/> now fires only when the PM has explicitly said
   *  "dispatch now" during the call (see the DISPATCH-OR-CONTINUE fork
   *  in BUSINESS_SYSTEM_SUFFIX). That means by the time this runs, the
   *  PM has committed — we skip the "anything else" + "when do you need
   *  this done?" chat steps entirely and jump straight to the summary
   *  screen (AI diagnosis + cost estimate + dispatch button), generating
   *  a committed final diagnosis from the voice transcript. Default
   *  urgency to "Today" since the PM chose to dispatch immediately. */
  // Not wrapped in useCallback — generateFinalDiagnosis is recreated on
  // every render (reads live state via closure), so memoizing this
  // handler would freeze it against the first render. The voice/video
  // panels re-render cheaply when this prop identity changes, and the
  // function only fires once per call anyway.
  const handleVoiceReady = (payload: {
    transcript: string;
    history: { role: 'user' | 'assistant'; content: string }[];
    urgency?: 'today' | 'tomorrow' | 'this_week' | 'flexible' | null;
  }) => {
    const trimmed = payload.transcript.trim();
    setVoiceOpen(false);
    setVideoChatOpen(false);
    if (!trimmed) return;
    // Category resolution — three fallback tiers in order of confidence:
    //   1. Claude's own <category> classification from the last voice
    //      turn (latestVoiceCategoryRef). Most accurate because Claude
    //      has full conversational + visual context.
    //   2. Keyword inference over the full transcript + history.
    //   3. Handyman (general) fallback so dispatch still has a category.
    const claudeCat = mapVoiceCategoryToB2B(latestVoiceCategoryRef.current);
    const histText = payload.history.map(h => h.content).join(' \n ');
    const keywordCat = inferCategoryFromText(`${trimmed}\n${histText}`);
    const resolvedCatId = claudeCat || keywordCat || 'general';
    const picked = B2B_CATEGORIES.find(c => c.id === resolvedCatId)
      || B2B_CATEGORIES.find(c => c.id === 'general');
    if (!picked) return;
    setCategory(picked);
    setActiveGroup(null);
    setQ1Answer(trimmed);
    // Use the urgency Homie extracted from the PM's answer to the
    // reservation-aware timing question. Maps the voice tag to the
    // same labels handleTiming takes from the text-chat button grid,
    // so mapUserTimingToDispatch produces a consistent JobTiming +
    // severity regardless of which path the PM used. Falls back to
    // "Today" if Homie forgot to pair <ready/> with an <urgency> tag.
    const voiceTimingLabel: Record<'today' | 'tomorrow' | 'this_week' | 'flexible', string> = {
      today: 'Today',
      tomorrow: 'Tomorrow',
      this_week: 'This week',
      flexible: 'Flexible',
    };
    setTiming(payload.urgency ? voiceTimingLabel[payload.urgency] : 'Today');
    // Skip the chat — run the committed-output stream straight into the
    // summary step. Pass the freshly picked category AND the voice
    // panel's own history (payload.history) through since:
    //   (a) setCategory won't have committed yet when
    //       generateFinalDiagnosis reads `category`, and
    //   (b) the chat `messages` state may be missing the latest turn
    //       that handleVoiceTurn queued just before onReady fired —
    //       React hasn't necessarily flushed that setMessages yet. The
    //       voice panel's historyRef is the authoritative transcript.
    setTimeout(() => {
      generateFinalDiagnosis(picked, payload.history);
    }, 200);
  };

  // Fast-path: PM types a free-form description on the category step and
  // bypasses the tile → sub → q1 pipeline. Infers category from the
  // description (so "dishwasher leaking" → Appliance, not Handyman);
  // falls back to Handyman only when nothing keyword-matches. Then jumps
  // straight into the chat so Claude can ask targeted follow-ups.
  function handleDirectDescription(text: string) {
    const trimmed = text.trim();
    if (trimmed.length < 10) return;
    const inferred = inferCategoryFromText(trimmed);
    const picked = (inferred && B2B_CATEGORIES.find(c => c.id === inferred))
      || B2B_CATEGORIES.find(c => c.id === 'general');
    if (!picked) return;
    setCategory(picked);
    setActiveGroup(null);
    setQ1Answer(trimmed);
    setMessages([{ role: 'user', content: trimmed }]);
    setStep('chat');
    streamAI(`A property manager at ${selectedProperty?.name || 'the property'} reported: ${trimmed}`, [], () => {
      setExchangeCount(1);
      setStep('extra');
    });
  }

  function selectCategory(cat: CatDef) {
    setCategory(cat);
    setActiveGroup(null);
    const propName = selectedProperty?.name || 'this property';
    if (cat.group === 'service') {
      setMessages([{ role: 'assistant', content: `${cat.icon} **${cat.label}** for ${propName} — got it. ${cat.q1.text}` }]);
    } else {
      setMessages([{ role: 'assistant', content: `${cat.icon} **${cat.label}** issue at ${propName} — let's figure this out. ${cat.q1.text}` }]);
    }
    setStep('q1');
  }

  // Handle Q1 answer
  function handleQ1(answer: string) {
    setQ1Answer(answer);
    setSuggestions([]);
    setShowFreeInput(false);
    const newMsgs: Message[] = [...messages, { role: 'user', content: answer }];
    setMessages(newMsgs);
    setStep('chat');

    // Stream AI follow-up
    const userContext = category?.group === 'service'
      ? `I need ${category.label} service. Specifically: ${answer}`
      : `I have a ${category?.label} issue. ${answer}`;

    streamAI(userContext, [], () => {
      setExchangeCount(1);
      setStep('extra');
    });
  }

  // Handle extra details or free-form chat
  // ── Voice dictation (Web Speech API) ───────────────────────────────────
  // Tap the mic → starts continuous transcription, interim results fill
  // inputVal live; tap again to stop. Silent on unsupported browsers
  // (the button just won't mount).
  const toggleDictation = () => {
    if (dictating) {
      try { recognitionRef.current?.stop(); } catch { /* noop */ }
      recognitionRef.current = null;
      setDictating(false);
      return;
    }
    // Find SpeechRecognition ctor (webkit prefix on Safari)
    const Ctor = (window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike })
      .SpeechRecognition ?? (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionLike }).webkitSpeechRecognition;
    if (!Ctor) return;
    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = 'en-US';
    // Target the input that's actually on screen: DirectInput textarea on
    // the category step, answer input elsewhere.
    const targetingDirect = step === 'category';
    const startBase = targetingDirect ? directText : inputVal;
    rec.onresult = (ev) => {
      let transcript = '';
      for (let i = 0; i < ev.results.length; i++) {
        transcript += ev.results[i][0].transcript;
      }
      const next = startBase ? `${startBase} ${transcript}`.trim() : transcript;
      if (targetingDirect) setDirectText(next);
      else setInputVal(next);
    };
    rec.onend = () => { setDictating(false); recognitionRef.current = null; };
    rec.onerror = () => { setDictating(false); recognitionRef.current = null; };
    try {
      rec.start();
      recognitionRef.current = rec;
      setDictating(true);
    } catch {
      setDictating(false);
    }
  };
  const dictationSupported = typeof window !== 'undefined' &&
    !!((window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition ||
       (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition);

  function handleUserInput(text: string) {
    setSuggestions([]);
    setShowFreeInput(false);
    const currentImage = imgPreview;
    const newMsgs: Message[] = [...messages, { role: 'user', content: currentImage ? `📷 ${text}` : text }];
    setMessages(newMsgs);
    setInputVal('');
    setImgPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';

    // Upload image to Cloudinary in parallel for outreach MMS/email
    if (currentImage) {
      void uploadDiagnosticImage(currentImage).then(result => {
        if (result?.url) uploadedPhotoUrlsRef.current.push(result.url);
      });
    }

    // If we've had enough exchanges, fork the flow. For REPAIR categories
    // the PM gets a dispatch-or-continue choice (sometimes two exchanges
    // is all Claude needs to triage, sometimes another round would sharpen
    // the diagnosis — this lets the PM decide rather than forcing them
    // into a "extras + photos" step). For SERVICE categories we keep the
    // original "anything else to add?" prompt since service scoping rarely
    // benefits from more back-and-forth.
    if (exchangeCount >= 2) {
      const isRepair = category?.group !== 'service';
      // Snapshot the user's in-flight message + prior history so
      // Continue-diagnosing can re-submit cleanly without the decision
      // prompt polluting what Claude sees.
      pendingDecisionRef.current = isRepair
        ? { text, image: currentImage, history: messages }
        : null;
      const promptMsg = isRepair
        ? "Got it — would you like me to dispatch this now, or continue to help diagnose the issue?"
        : 'Got it. Is there anything else you\'d like to add before we dispatch? You can also upload a photo if it helps.';
      setTimeout(() => {
        setMessages(prev => [...prev, { role: 'assistant', content: promptMsg }]);
        setStep('anything_else');
      }, 300);
      return;
    }

    streamAI(text, newMsgs.slice(0, -1), () => {
      setExchangeCount(exchangeCount + 1);
      setStep('extra');
    }, currentImage ? [currentImage] : undefined);
  }

  /** Runs the final-diagnosis stream + lands on 'summary'. Extracted from
   *  handleTiming so both the text-chat timing path AND the voice/video
   *  dispatch path (handleVoiceReady) can share the same committed-output
   *  generation logic. Caller is expected to have already set any needed
   *  messages/timing state before invoking this.
   *
   *  `historyOverride` lets the voice path pass the voice panel's own
   *  historyRef directly — necessary because React may not have flushed
   *  the last setMessages(...) from handleVoiceTurn by the time the
   *  voice panel fires onReady. Relying on the `messages` state closure
   *  could send a truncated (sometimes empty) history to Claude, which
   *  would trigger replies like "no issue has been described yet." */
  function generateFinalDiagnosis(
    overrideCategory?: CatDef,
    historyOverride?: Array<{ role: 'user' | 'assistant'; content: string }>,
  ) {
    const cat = overrideCategory ?? category;
    const promptText = cat?.group === 'service'
      ? 'I am ready to dispatch. Generate the final scope summary NOW using whatever you already know. Do NOT ask any more clarifying questions — this is the final message before the job is sent to the provider. Output a committed scope description (plain text, 2–4 sentences) followed by the <diagnosis> JSON block. If any detail is missing, fill it with your best estimate and note "pending confirmation" in the scope — do not ask for it.'
      : 'I am ready to dispatch. Generate your final diagnosis NOW using whatever you already know. Do NOT ask any more clarifying questions — this is the final message before the job is sent to the pro. Output a committed diagnosis (plain text, 2–4 sentences) followed by the <diagnosis> JSON block. If any detail is missing, fill it with your best estimate and note "pending confirmation" in the diagnosis — do not ask for it.';

    setStep('generating');
    setStreaming(true);
    setStreamText('');
    let visible = '';
    let rawFinal = '';
    let insideXml = false;
    let xmlBuf = '';
    const mode = cat?.group === 'service' ? 'service' : 'repair';

    abortRef.current = businessChatService.sendMessage(
      promptText,
      mode as 'repair' | 'service',
      {
        onToken: (token: string) => {
          rawFinal += token;
          for (const ch of token) {
            if (insideXml) {
              xmlBuf += ch;
              if (/<\/(diagnosis|job_summary|suggestions|equipment)>/.test(xmlBuf)) { insideXml = false; xmlBuf = ''; }
              continue;
            }
            if (ch === '<') { xmlBuf = '<'; continue; }
            if (xmlBuf.length > 0) {
              xmlBuf += ch;
              if (ch === '>') {
                if (/^<(diagnosis|job_summary|suggestions|equipment)>/.test(xmlBuf)) { insideXml = true; }
                else { visible += xmlBuf; }
                xmlBuf = '';
              }
              if (xmlBuf.length > 15 && !xmlBuf.includes('>')) { visible += xmlBuf; xmlBuf = ''; }
              continue;
            }
            visible += ch;
          }
        },
        onDiagnosis: () => {},
        onJobSummary: () => {},
        onDone: () => {
          if (xmlBuf && !insideXml) visible += xmlBuf;
          setStreaming(false);
          setStreamText('');
          ingestEquipmentFromRaw(rawFinal);
          setAiDiagnosis(stripQuestionsFromSummary(visible.trim()));
          setStep('summary');

          // Fetch cost estimate
          const zip = selectedProperty?.zipCode;
          if (zip && cat) {
            const details = selectedProperty?.details as PropertyDetails | null;
            const catId = cat.id;
            let brand: string | undefined;
            let systemAgeYears: number | undefined;
            if (details?.hvac && ['hvac', 'chimney', 'insulation'].includes(catId)) {
              brand = details.hvac.acBrand || details.hvac.heatingBrand;
              if (details.hvac.acAge) {
                const parsed = parseInt(details.hvac.acAge, 10);
                if (!isNaN(parsed)) systemAgeYears = parsed;
              }
            } else if (details?.waterHeater && ['water_heater', 'plumbing'].includes(catId)) {
              brand = details.waterHeater.brand;
              if (details.waterHeater.age) {
                const parsed = parseInt(details.waterHeater.age, 10);
                if (!isNaN(parsed)) systemAgeYears = parsed;
              }
            }
            estimateService.generate({
              category: catId,
              subcategory: q1Answer || catId,
              zip_code: zip,
              workspace_id: selectedWorkspace || undefined,
              property_type: selectedProperty?.propertyType,
              brand,
              system_age_years: systemAgeYears,
            }).then(res => {
              if (res.data) setCostEstimate(res.data);
            }).catch(() => { /* non-critical */ });
          }
        },
        onError: () => {
          setStreaming(false);
          setStreamText('');
          setAiDiagnosis(`${cat?.label}: ${q1Answer}`);
          setStep('summary');
        },
      },
      {
        history: historyOverride
          ? historyOverride.map(m => ({ role: m.role, content: m.content }))
          : messages.map(m => ({ role: m.role, content: m.content })),
        propertyContext: getPropertyContext(),
      },
    );
  }

  function handleTiming(selected: string) {
    setTiming(selected);
    setMessages(prev => [...prev, { role: 'user', content: selected }]);
    generateFinalDiagnosis();
  }

  // Handle dispatch (no tier selection — B2B subscription covers it)
  async function handleDispatch() {
    // Check occupancy before dispatching
    if (!occupancyCheck && selectedWorkspace && selectedProperty?.id) {
      setDispatching(true);
      try {
        const occRes = await businessService.getCurrentReservation(selectedWorkspace, selectedProperty.id);
        if (occRes.data?.occupied && occRes.data.reservation) {
          setOccupancyCheck({
            occupied: true,
            reservation: {
              guestName: occRes.data.reservation.guestName,
              guestEmail: occRes.data.reservation.guestEmail ?? null,
              guestPhone: occRes.data.reservation.guestPhone ?? null,
              checkIn: occRes.data.reservation.checkIn,
              checkOut: occRes.data.reservation.checkOut,
            },
          });
          setDispatching(false);
          return; // Show occupancy card, wait for user to choose entry permission
        }
        // Not occupied — proceed directly
        setOccupancyCheck({ occupied: false, reservation: null });
      } catch {
        // If the check fails, proceed without occupancy info
        setOccupancyCheck({ occupied: false, reservation: null });
      }
      setDispatching(false);
    }

    // Proceed with dispatch (either not occupied, or entry permission already chosen)
    await executeDispatch();
  }

  async function executeDispatch(permissionNote?: string) {
    setDispatching(true);
    setStep('outreach');

    try {
      let summaryText = aiDiagnosis || `${category?.label}: ${q1Answer}`;

      // Fold any equipment details the AI extracted from chat into the
      // dispatch summary so the provider sees exactly what they'll be
      // servicing (brand, model, age, condition, notes).
      if (discoveredEquipment.length > 0) {
        const lines = discoveredEquipment.map(d => {
          const parts: string[] = [];
          const typeLabel = d.itemType.replace(/_/g, ' ');
          parts.push(typeLabel);
          if (d.brand) parts.push(d.brand);
          if (d.modelNumber) parts.push(d.modelNumber);
          const meta: string[] = [];
          if (d.estimatedAgeYears !== undefined) meta.push(`${Math.round(d.estimatedAgeYears)}yr old`);
          if (d.condition) meta.push(d.condition);
          if (meta.length) parts.push(`(${meta.join(', ')})`);
          if (d.notes) parts.push(`— ${d.notes}`);
          return `• ${parts.join(' ')}`;
        });
        summaryText = `${summaryText}\n\nEquipment identified:\n${lines.join('\n')}`;
      }

      // Pull the user's actual timing answer into the summary so the
      // provider sees what the PM requested ("Today", a picked date,
      // etc.) and derive JobTiming + severity from it — we never let
      // Claude's self-assessed urgency override the PM's choice.
      const userTiming = (timing || '').trim();
      if (userTiming) {
        summaryText = `${summaryText}\n\nTiming requested by PM: ${userTiming}`;
      }
      const { jobTiming, severity } = mapUserTimingToDispatch(userTiming);

      const noteToAppend = permissionNote ?? entryPermission;
      if (noteToAppend) {
        summaryText = `${summaryText}\n\n${noteToAppend}`;
      }

      const diagnosis = {
        category: category?.id || 'general',
        subcategory: q1Answer || category?.id || 'general',
        severity,
        summary: summaryText,
        recommendedActions: ['Dispatch professional'],
      };

      const zipCode = selectedProperty?.zipCode || '92101';

      const res = await jobService.createJob({
        diagnosis,
        timing: jobTiming,
        tier: 'priority',
        zipCode,
        workspaceId: selectedWorkspace || undefined,
        propertyId: selectedProperty?.id || undefined,
        notifyGuest: notifyGuest || undefined,
        photos: uploadedPhotoUrlsRef.current.length > 0 ? uploadedPhotoUrlsRef.current : undefined,
      });

      if (res.data) {
        setJobId(res.data.id);

        // Connect WebSocket for live updates
        connectJobSocket(res.data.id, (status) => {
          setOutreachStatus(status);
          if (status.status === 'completed' || status.status === 'expired') {
            jobService.getResponses(res.data!.id).then(r => {
              if (r.data) {
                setResponses(r.data.responses);
                setStep('results');
              }
            });
          }
        });

        setMessages(prev => [...prev, { role: 'assistant', content: `Dispatching now. Contacting providers in the ${zipCode} area...` }]);
      }
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Failed to create job. Please try again.' }]);
      setStep('extra');
    } finally {
      setDispatching(false);
    }
  }

  if (!homeowner) return null;


  return (
    <div
      className="b2b-root"
      data-theme={b2bTheme}
      style={{
        // Inline --bp-* CSS vars guarantee the chat's theme wins over any
        // wrapper (.bp-portal, layout shell, etc.) regardless of CSS
        // specificity. Inline styles trump every non-!important rule, so
        // once useBusinessChatTheme resolves, the whole subtree flips
        // immediately — no race with parent theme toggles, no dependency
        // on stylesheet loading order.
        ...(b2bTheme === 'dark' ? {
          '--bp-bg': '#1A1A1A',
          '--bp-card': '#242424',
          '--bp-input': '#2E2E2E',
          '--bp-text': '#E8E4E0',
          '--bp-muted': '#9B9490',
          '--bp-subtle': '#6B6560',
          '--bp-border': '#3A3A3A',
          '--bp-hover': '#2E2E2E',
          '--bp-header': '#1E1E1E',
          '--bp-warm': '#2E2E2E',
        } : {
          '--bp-bg': '#F9F5F2',
          '--bp-card': '#ffffff',
          '--bp-input': '#ffffff',
          '--bp-text': '#2D2926',
          '--bp-muted': '#6B6560',
          '--bp-subtle': '#9B9490',
          '--bp-border': '#E0DAD4',
          '--bp-hover': '#FAFAF8',
          '--bp-header': '#ffffff',
          '--bp-warm': '#F9F5F2',
        }),
        colorScheme: b2bTheme,
        height: '100%',
        background: 'var(--bp-card)',
        color: 'var(--bp-text)',
        fontFamily: "'DM Sans', sans-serif",
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      } as React.CSSProperties}>
      <style>{`
        /* --bp-* theme tokens for the business chat surface.
           Three layers (from lowest to highest priority):
             1. :where(.b2b-root) light defaults — specificity 0 so any
                parent .bp-portal wrapper's vars still cascade through
                unchanged on routes rendered inside the portal.
             2. @media prefers-color-scheme dark — still :where(), still 0
                specificity. Covers standalone /business/chat visits on a
                dark-mode OS when no explicit preference is set.
             3. .b2b-root[data-theme="dark"] — specificity 0,2,0. Wins
                over the :where defaults and the portal's .bp-portal base
                rule, so once useBusinessChatTheme resolves to "dark" the
                whole chat flips regardless of whether the portal wrapper
                is present or set to light. The hook watches localStorage
                AND prefers-color-scheme so the resolved theme stays in
                sync with the portal toggle and the OS. */
        :where(.b2b-root) {
          --bp-bg: #F9F5F2;
          --bp-card: #ffffff;
          --bp-input: #ffffff;
          --bp-text: #2D2926;
          --bp-muted: #6B6560;
          --bp-subtle: #9B9490;
          --bp-border: #E0DAD4;
          --bp-hover: #FAFAF8;
          --bp-header: #ffffff;
          --bp-warm: #F9F5F2;
          color: var(--bp-text);
        }
        @media (prefers-color-scheme: dark) {
          :where(.b2b-root) {
            --bp-bg: #1A1A1A;
            --bp-card: #242424;
            --bp-input: #2E2E2E;
            --bp-text: #E8E4E0;
            --bp-muted: #9B9490;
            --bp-subtle: #6B6560;
            --bp-border: #3A3A3A;
            --bp-hover: #2E2E2E;
            --bp-header: #1E1E1E;
            --bp-warm: #2E2E2E;
          }
        }
        .b2b-root[data-theme="dark"] {
          --bp-bg: #1A1A1A;
          --bp-card: #242424;
          --bp-input: #2E2E2E;
          --bp-text: #E8E4E0;
          --bp-muted: #9B9490;
          --bp-subtle: #6B6560;
          --bp-border: #3A3A3A;
          --bp-hover: #2E2E2E;
          --bp-header: #1E1E1E;
          --bp-warm: #2E2E2E;
        }
        .b2b-root[data-theme="light"] {
          --bp-bg: #F9F5F2;
          --bp-card: #ffffff;
          --bp-input: #ffffff;
          --bp-text: #2D2926;
          --bp-muted: #6B6560;
          --bp-subtle: #9B9490;
          --bp-border: #E0DAD4;
          --bp-hover: #FAFAF8;
          --bp-header: #ffffff;
          --bp-warm: #F9F5F2;
        }
        /* Dark-mode border hardening. Many inline styles use the subtle
           black rgba borders for card edges — invisible in dark mode
           because the background is already near-black. Promote them to
           a translucent white so the card edges still read. */
        .b2b-root[data-theme="dark"] [style*="rgba(0,0,0,0.06)"],
        .b2b-root[data-theme="dark"] [style*="rgba(0,0,0,0.07)"],
        .b2b-root[data-theme="dark"] [style*="rgba(0,0,0,0.08)"],
        .b2b-root[data-theme="dark"] [style*="rgba(0,0,0,.06)"],
        .b2b-root[data-theme="dark"] [style*="rgba(0,0,0,.07)"],
        .b2b-root[data-theme="dark"] [style*="rgba(0,0,0,.08)"] {
          border-color: rgba(255,255,255,.12) !important;
        }
        @keyframes fadeSlide { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
        @keyframes spin { to { transform:rotate(360deg); } }
        @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
        @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.4; } }
        @keyframes blink { 0%, 50% { opacity: 1; } 51%, 100% { opacity: 0; } }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.1); border-radius: 4px; }
        @media (max-width: 480px) {
          .b2b-cat-grid { grid-template-columns: repeat(3, 1fr) !important; }
          .b2b-chat-badge { display: none !important; }
          .b2b-chat-status span { display: none !important; }
        }
        @media (max-width: 640px) {
          .b2b-chat-status span { font-size: 0 !important; }
        }
        /* Split layout — mirrors /quote's gq-split so the chat column and
           right-rail panel land at the same proportions across surfaces
           (1.15fr 1fr at 1280px max, collapses to single column < 981px). */
        @media (min-width: 981px) {
          /* minmax(0, Nfr) instead of plain Nfr — without the explicit 0
             minimum, each grid column implicitly has min-width: auto,
             which lets content (e.g. the voice/video panel's inner
             transcript or a long model number) push the column wider
             than its fr allotment and spill into the neighbouring card. */
          .b2b-split { display: grid !important; grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr) !important; gap: 28px !important; align-items: flex-start !important; max-width: 1280px !important; padding-left: 24px !important; padding-right: 24px !important; }
          .b2b-split > * { min-width: 0 !important; }
          .b2b-split > .b2b-chat-col { max-width: none !important; padding-left: 0 !important; padding-right: 0 !important; }
          .b2b-right-panel { display: flex !important; }
          /* Desktop gets the right-rail Property IQ card — the inline
             mobile version is redundant here. */
          .b2b-mobile-iq { display: none !important; }
        }
        @media (max-width: 980px) {
          .b2b-split { grid-template-columns: 1fr !important; gap: 12px !important; }
          .b2b-split > * { min-width: 0 !important; max-width: 100% !important; }
          .b2b-chat-col { min-width: 0 !important; max-width: 100% !important; }
        }
      `}</style>

      {/* After hours notice — sits above the header */}
      {(() => {
        const hour = new Date().getHours();
        return (hour < 8 || hour >= 18) ? (
          <div style={{
            background: 'var(--bp-card)', borderBottom: '1px solid var(--bp-border)',
            padding: '10px 20px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            fontSize: 13, color: '#9B7A3C', lineHeight: 1.4, textAlign: 'center', flexShrink: 0,
          }}>
            <span style={{ fontSize: 16, flexShrink: 0 }}>🌙</span>
            <span>Some providers may not be reachable outside business hours (8 AM – 6 PM). Responses may be limited and take longer.</span>
          </div>
        ) : null;
      })()}

      {/* Header — desktop lays out property + actions on one row; mobile
          stacks property name on its own line so the occupancy pill, status
          indicator, and New button don't collide with it. */}
      <nav className="b2b-header-nav" style={{
        zIndex: 50, background: 'var(--bp-header)', backdropFilter: 'blur(10px)',
        padding: '0 20px', minHeight: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderBottom: '1px solid var(--bp-border)', flexShrink: 0, gap: 10,
      }}>
        <div className="b2b-header-left" style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1, position: 'relative' }}>
          {selectedProperty && (
            <>
              <span className="b2b-prop-name" style={{ fontSize: 14, color: D, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0, flexShrink: 1 }}>
                {selectedProperty.name}
              </span>
              {/* Occupancy badge */}
              {headerOccupancy && (
                <button
                  onClick={() => setShowCalendar(v => !v)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    padding: '3px 10px', borderRadius: 100, border: 'none',
                    background: headerOccupancy.occupied ? '#FEF2F2' : '#F0FDF4',
                    cursor: 'pointer', flexShrink: 0, fontFamily: "'DM Sans', sans-serif",
                  }}
                  title={headerOccupancy.occupied
                    ? `Occupied by ${headerOccupancy.reservation?.guestName || 'Guest'} until ${headerOccupancy.reservation?.checkOut ? new Date(headerOccupancy.reservation.checkOut).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) : '?'}`
                    : headerOccupancy.nextCheckIn
                      ? `Vacant until ${new Date(headerOccupancy.nextCheckIn.checkIn).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}`
                      : 'Vacant — no upcoming reservations'}
                >
                  <div style={{
                    width: 7, height: 7, borderRadius: '50%',
                    background: headerOccupancy.occupied ? '#DC2626' : G,
                  }} />
                  <span style={{
                    fontSize: 11, fontWeight: 600,
                    color: headerOccupancy.occupied ? '#DC2626' : G,
                  }}>
                    {headerOccupancy.occupied ? 'Occupied' : 'Vacant'}
                  </span>
                  <span className="b2b-occ-detail" style={{ fontSize: 10, color: 'var(--bp-subtle)', fontWeight: 500 }}>
                    {headerOccupancy.occupied && headerOccupancy.reservation
                      ? `${headerOccupancy.reservation.guestName || 'Guest'} · until ${new Date(headerOccupancy.reservation.checkOut).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}`
                      : headerOccupancy.nextCheckIn
                        ? `until ${new Date(headerOccupancy.nextCheckIn.checkIn).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}`
                        : ''}
                  </span>
                  <svg width={10} height={10} viewBox="0 0 20 20" fill="none" stroke="#9B9490" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                    <polyline points="6 8 10 12 14 8" />
                  </svg>
                </button>
              )}
              {/* Calendar popover */}
              {showCalendar && (
                <>
                  <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={() => setShowCalendar(false)} />
                  <div className="b2b-cal-popover" style={{
                    position: 'absolute', top: 44, left: 0, zIndex: 100,
                    background: 'var(--bp-card)', borderRadius: 14, border: '1px solid rgba(0,0,0,0.08)',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.12)', padding: 16,
                    width: 'min(460px, calc(100vw - 40px))', maxHeight: 'calc(100vh - 120px)', overflowY: 'auto',
                  }}>
                    <div style={{ fontFamily: "'Fraunces', serif", fontSize: 15, fontWeight: 700, color: D, marginBottom: 12 }}>
                      {selectedProperty.name} — Reservations
                    </div>
                    {calendarReservations.length === 0 ? (
                      <div style={{ fontSize: 13, color: 'var(--bp-subtle)', padding: '20px 0', textAlign: 'center' }}>No upcoming reservations</div>
                    ) : (
                      <MiniCalendar reservations={calendarReservations} />
                    )}
                  </div>
                </>
              )}
            </>
          )}
        </div>
        <style>{`
          @media (max-width: 600px) {
            .b2b-occ-detail { display: none !important; }
            .b2b-cal-popover { left: -12px !important; right: -12px !important; width: auto !important; }
          }
          /* Mobile header grid — two rows:
               Row 1: property name (left)   |  + New button (right)
               Row 2: occupancy pill (left)  |  Online/After hours (right)
             display: contents flattens the wrapper divs so their children
             become direct grid children addressable by cell. The nav
             becomes position: relative so the absolutely-positioned
             calendar popover still has a local anchor after the wrappers
             collapse away. */
          @media (max-width: 640px) {
            .b2b-header-nav {
              display: grid !important;
              grid-template-columns: 1fr auto !important;
              grid-auto-rows: auto !important;
              column-gap: 10px !important;
              row-gap: 6px !important;
              padding: 10px 16px !important;
              min-height: 0 !important;
              position: relative !important;
              align-items: center !important;
            }
            .b2b-header-left, .b2b-header-actions { display: contents !important; }
            .b2b-prop-name {
              grid-column: 1 !important; grid-row: 1 !important;
              font-size: 15px !important;
              overflow: hidden !important; text-overflow: ellipsis !important; white-space: nowrap !important;
              min-width: 0 !important;
            }
            .b2b-header-actions > button { grid-column: 2 !important; grid-row: 1 !important; }
            .b2b-header-left > button { grid-column: 1 !important; grid-row: 2 !important; justify-self: start !important; }
            .b2b-header-actions > .b2b-chat-status { grid-column: 2 !important; grid-row: 2 !important; justify-self: end !important; }
            /* Calendar popover should still span the viewport when open. */
            .b2b-cal-popover { grid-column: 1 / -1 !important; }
          }
        `}</style>
        <div className="b2b-header-actions" style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {(() => {
            const hour = new Date().getHours();
            const isBusinessHours = hour >= 8 && hour < 18;
            return isBusinessHours ? (
              <div className="b2b-chat-status" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: G, boxShadow: `0 0 0 3px ${G}25` }} />
                <span style={{ fontSize: 13, color: G, fontWeight: 600 }}>Online</span>
              </div>
            ) : (
              <div className="b2b-chat-status" style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'default' }} title="Some providers may not be reachable outside business hours. Responses may be limited and take longer.">
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#EF9F27', boxShadow: '0 0 0 3px rgba(239,159,39,0.15)' }} />
                <span style={{ fontSize: 12, color: '#EF9F27', fontWeight: 600 }}>After hours</span>
              </div>
            );
          })()}
          <button onClick={() => {
            setStep('property');
            setSelectedProperty(null);
            setCategory(null);
            setMessages([]);
            setStreamText('');
            setStreaming(false);
            setQ1Answer('');
            setAiDiagnosis('');
            setInputVal('');
            setReadyToDispatch(false);
            setExchangeCount(0);
            setSuggestions([]);
            setShowFreeInput(false);
            setShowQ1Input(false);
            setQ1InputVal('');
            setTiming('');
            setShowDatePicker(false);
            setSelectedDate('');
            setJobId(null);
            setOutreachStatus(null);
            setResponses([]);
            setDispatching(false);
            setSelectedResponse(null);
            setBookedName(null);
            setDiscoveredEquipment([]);
            discoveredPersistedKeysRef.current.clear();
            pendingDecisionRef.current = null;
            latestVoiceCategoryRef.current = null;
            sessionIdRef.current = `b2b-${Date.now()}-${Math.random().toString(36).slice(2)}`;
          }} style={{
            background: 'none', border: '1px solid rgba(0,0,0,0.1)', borderRadius: 8,
            padding: '5px 12px', fontSize: 13, fontWeight: 600, color: 'var(--bp-muted)',
            cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
          }}>+ New</button>
        </div>
      </nav>

      {/* Chat area — shelled into a Q2 split on ≥981px. The chat column
          on the left carries all existing step renders; the right panel
          surfaces context cards (Homie thinks, Property IQ, pros nearby,
          assurance). On narrow screens the split collapses and the right
          panel hides (the header already carries occupancy + calendar). */}
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
      <div className="b2b-split" style={{ margin: '0 auto', padding: '16px 16px 120px' }}>
      <div className="b2b-chat-col" style={{ maxWidth: 700, margin: '0 auto', minWidth: 0 }}>

          {/* Step: Property selection */}
          {step === 'property' && (
            <PropertySelector
              properties={properties}
              workspaces={workspaces}
              selectedWorkspace={selectedWorkspace}
              onSelectWorkspace={(id) => { setSelectedWorkspace(id); setSelectedProperty(null); }}
              onSelect={selectProperty}
              onAddClick={() => navigate('/business')}
            />
          )}

          {/* Step: Category selection — pill cloud (matches /quote). */}
          {step === 'category' && (
            <div>
              <AssistantMsg text={`How can Homie help at ${selectedProperty?.name}?`} animate />

              <div style={{ marginLeft: 42, marginBottom: 12, animation: 'fadeSlide 0.3s ease' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
                  <span style={{ fontSize: 9.5, fontFamily: "'DM Mono',monospace", letterSpacing: 1.4, textTransform: 'uppercase', color: 'var(--bp-subtle)', fontWeight: 700 }}>Repair · most common</span>
                  <span style={{ height: 1, flex: 1, background: 'var(--bp-border)' }} />
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
                  {B2B_CATEGORY_TREE.filter(g => g.type === 'repair').map(g => (
                    <button key={g.label} onClick={() => handleGroupSelect(g)} style={{
                      background: 'var(--bp-card)', color: D,
                      border: '1px solid var(--bp-border)', borderRadius: 100,
                      padding: '8px 12px', fontSize: 13, fontWeight: 600,
                      cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      transition: 'all .15s',
                    }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = O; e.currentTarget.style.background = 'rgba(232,99,43,0.05)'; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--bp-border)'; e.currentTarget.style.background = 'var(--bp-card)'; }}
                    >
                      <span style={{ fontSize: 14 }}>{g.icon}</span>
                      {g.label}
                    </button>
                  ))}
                </div>

                {/* Service tier — expandable, matches /quote pattern */}
                {showAllB2BCats ? (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
                      <span style={{ fontSize: 9.5, fontFamily: "'DM Mono',monospace", letterSpacing: 1.4, textTransform: 'uppercase', color: 'var(--bp-subtle)', fontWeight: 700 }}>Services · scheduled work</span>
                      <span style={{ height: 1, flex: 1, background: 'var(--bp-border)' }} />
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {B2B_CATEGORY_TREE.filter(g => g.type === 'service').map(g => (
                        <button key={g.label} onClick={() => handleGroupSelect(g)} style={{
                          background: 'var(--bp-card)', color: D,
                          border: '1px solid var(--bp-border)', borderRadius: 100,
                          padding: '8px 12px', fontSize: 13, fontWeight: 600,
                          cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
                          display: 'inline-flex', alignItems: 'center', gap: 6,
                          transition: 'all .15s',
                        }}
                          onMouseEnter={e => { e.currentTarget.style.borderColor = O; e.currentTarget.style.background = 'rgba(232,99,43,0.05)'; }}
                          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--bp-border)'; e.currentTarget.style.background = 'var(--bp-card)'; }}
                        >
                          <span style={{ fontSize: 14 }}>{g.icon}</span>
                          {g.label}
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  <button onClick={() => setShowAllB2BCats(true)} style={{
                    width: '100%', background: 'transparent',
                    border: '1px dashed var(--bp-border)', borderRadius: 100,
                    padding: '10px 14px', fontSize: 12, fontWeight: 600,
                    color: 'var(--bp-subtle)', cursor: 'pointer',
                    fontFamily: "'DM Sans', sans-serif",
                  }}>
                    + {B2B_CATEGORY_TREE.filter(g => g.type === 'service').length} more · cleaning, landscape, painting, moving…
                  </button>
                )}

                {/* Free-form "or just describe it" fast lane — matches the
                    /quote DirectInput pattern. Skips category tiles + q1
                    and jumps straight into chat with Claude. Default
                    category is Handyman; the dispatch summary re-classifies
                    from the full conversation context at the end.
                    Voice / Video Chat panels open in place when the PM
                    taps those buttons. */}
                {voiceOpen ? (
                  <div style={{ marginTop: 18 }}>
                    <InlineVoicePanel
                      active={voiceOpen}
                      onExit={() => setVoiceOpen(false)}
                      category={null}
                      firstName={homeowner?.first_name ?? null}
                      businessContext={buildBusinessContext()}
                      onTurn={handleVoiceTurn}
                      onReady={handleVoiceReady}
                    />
                  </div>
                ) : videoChatOpen ? (
                  <div style={{ marginTop: 18 }}>
                    <VideoChatPanel
                      active={videoChatOpen}
                      onExit={() => setVideoChatOpen(false)}
                      category={null}
                      firstName={homeowner?.first_name ?? null}
                      businessContext={buildBusinessContext()}
                      onTurn={handleVoiceTurn}
                      onReady={handleVoiceReady}
                    />
                  </div>
                ) : (
                <div className="gq-direct" style={{ marginTop: 18 }}>
                  {/* "or just describe it" divider — matches /quote DirectInput */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                    <span style={{ height: 1, flex: '0 0 16px', background: 'var(--bp-border)' }} />
                    <span style={{ fontSize: 10, fontFamily: "'DM Mono',monospace", letterSpacing: 1.5, textTransform: 'uppercase', color: 'var(--bp-subtle)', fontWeight: 700 }}>or just describe it</span>
                    <span style={{ height: 1, flex: 1, background: 'var(--bp-border)' }} />
                  </div>
                  <div style={{
                    background: 'var(--bp-card)', borderRadius: 20,
                    border: directFocus ? `2px solid ${O}` : '2px solid var(--bp-border)',
                    boxShadow: directFocus ? `0 20px 60px -24px ${O}44` : '0 12px 40px -20px rgba(0,0,0,.08)',
                    padding: '20px 22px 16px', transition: 'all .2s',
                  }}>
                    <textarea
                      value={directText}
                      onChange={e => setDirectText(e.target.value)}
                      onFocus={() => setDirectFocus(true)}
                      onBlur={() => setDirectFocus(false)}
                      placeholder={dictating ? 'Listening… describe the issue freely' : `What's going on at ${selectedProperty?.name || 'the property'}? Describe it here, or chat with Homie by video or voice below.`}
                      onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && directText.trim().length >= 10) { handleDirectDescription(directText); setDirectText(''); } }}
                      style={{
                        width: '100%', border: 'none', outline: 'none', resize: 'none',
                        fontFamily: "'Fraunces',serif", fontSize: 22, lineHeight: 1.3,
                        color: 'var(--bp-text)', background: 'transparent',
                        minHeight: 96, padding: 0, letterSpacing: '-.01em',
                      }}
                    />
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--bp-border)', gap: 10, flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                        <button onClick={() => fileInputRef.current?.click()} style={quoteUploadBtnStyle} title="Add photo">
                          <svg width="15" height="13" viewBox="0 0 24 20" fill="none"><path d="M3 5h4l2-2h6l2 2h4v12H3V5z" stroke="currentColor" strokeWidth="1.8" /><circle cx="12" cy="11" r="3.5" stroke="currentColor" strokeWidth="1.8" /></svg>
                          Photo
                        </button>
                        <button
                          onClick={() => { primeAudio(); setVideoChatOpen(true); }}
                          style={quoteUploadBtnStyle}
                          title="Live video chat with Homie — point your camera at the issue and let Homie see it"
                        >
                          <svg width="15" height="13" viewBox="0 0 24 20" fill="none"><rect x="2" y="4" width="14" height="12" rx="2" stroke="currentColor" strokeWidth="1.8" /><path d="M16 9l6-3v8l-6-3V9z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /></svg>
                          Video Chat with Homie
                        </button>
                        <button
                          onClick={() => { primeAudio(); setVoiceOpen(true); }}
                          style={quoteUploadBtnStyle}
                          title="Talk with Homie"
                        >
                          <svg width="13" height="14" viewBox="0 0 18 20" fill="none"><rect x="6" y="1" width="6" height="11" rx="3" stroke="currentColor" strokeWidth="1.8" /><path d="M3 10c0 3.3 2.7 6 6 6s6-2.7 6-6M9 16v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
                          Talk to Homie
                        </button>
                        {dictationSupported && (
                          <button
                            onClick={toggleDictation}
                            title={dictating ? 'Stop dictating' : 'Dictate the description'}
                            style={{
                              ...quoteUploadBtnStyle,
                              background: dictating ? O : 'var(--bp-card)',
                              color: dictating ? '#fff' : 'var(--bp-text)',
                              border: `1px solid ${dictating ? O : 'var(--bp-border)'}`,
                              animation: dictating ? 'pulse 1.3s infinite' : 'none',
                            }}
                          >
                            <svg width="13" height="14" viewBox="0 0 18 20" fill="none"><rect x="6" y="1" width="6" height="11" rx="3" stroke="currentColor" strokeWidth="1.8" /><path d="M3 10c0 3.3 2.7 6 6 6s6-2.7 6-6M9 16v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
                            {dictating ? 'Listening…' : 'Dictate'}
                          </button>
                        )}
                      </div>
                      {directText.length > 0 && (
                        <span style={{ fontSize: 11, fontFamily: "'DM Mono',monospace", color: 'var(--bp-subtle)', letterSpacing: 1, textTransform: 'uppercase', fontWeight: 700 }}>
                          {directText.length} chars · {directText.trim().length >= 10 ? 'ready' : `${10 - directText.trim().length} more`}
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => { handleDirectDescription(directText); setDirectText(''); }}
                    disabled={directText.trim().length < 10}
                    style={{
                      marginTop: 14, width: '100%',
                      background: directText.trim().length >= 10 ? O : 'rgba(0,0,0,.06)',
                      color: directText.trim().length >= 10 ? '#fff' : '#9B9490',
                      border: 'none', borderRadius: 16, padding: '16px 24px',
                      fontSize: 15, fontWeight: 700,
                      cursor: directText.trim().length >= 10 ? 'pointer' : 'not-allowed',
                      boxShadow: directText.trim().length >= 10 ? `0 12px 32px -10px ${O}8c` : 'none',
                      fontFamily: "'DM Sans', sans-serif",
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                      transition: 'all .2s',
                    }}
                  >
                    {directText.trim().length >= 10 ? <>Continue with this description →</> : 'Type or dictate a few words, or pick a category above'}
                  </button>
                </div>
                )}
              </div>
            </div>
          )}

          {/* Chat messages */}
          {step !== 'property' && step !== 'category' && (
            <>
              {messages.map((m, i) => (
                m.role === 'user' ? <UserMsg key={i} text={m.content} /> : <AssistantMsg key={i} text={m.content} />
              ))}
              {streaming && <StreamingMsg text={streamText} />}
              {/* Inline "added to Property IQ" callouts — every item the AI
                  identified (visually or from a brand the PM spoke) gets a
                  small confirmation card right in the chat thread so the
                  PM sees what just got captured. Always visible on both
                  desktop and mobile. */}
              <InlineDiscoveredEquipment discovered={discoveredEquipment} />
              {/* Mobile inline Property IQ — surfaces correlated inventory
                  items (existing scan rows that match what's being
                  discussed) inline. Hidden on ≥981px since the right-rail
                  card covers desktop. */}
              <MobileInlinePropertyIQ
                items={propertyInventory}
                chatText={chatCorrelationText}
                discovered={discoveredEquipment}
              />
              {/* Scroll sentinel — see auto-scroll useEffect. Placed at the
                  tail of the messages list so block:'end' parks the latest
                  AI reply right at the viewport bottom. */}
              <div ref={messagesEndRef} style={{ height: 1 }} />
            </>
          )}

          {/* Subcategory selection */}
          {step === 'subcategory' && activeGroup && (
            <div style={{ marginLeft: 42, animation: 'fadeSlide 0.3s ease' }}>
              <div className="b2b-cat-grid" style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(activeGroup.subs.length, 3)}, 1fr)`, gap: 8, marginBottom: 12 }}>
                {activeGroup.subs.map(s => (
                  <button key={s.id} onClick={() => handleSubSelect(s.id)} style={{
                    padding: '14px', borderRadius: 12, cursor: 'pointer', border: '2px solid rgba(0,0,0,0.07)',
                    background: 'var(--bp-card)', fontSize: 14, color: D, fontWeight: 500, textAlign: 'center', transition: 'all 0.15s',
                    fontFamily: "'DM Sans', sans-serif",
                  }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = O; e.currentTarget.style.background = 'rgba(232,99,43,0.03)'; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--bp-border)'; e.currentTarget.style.background = 'var(--bp-card)'; }}
                  >
                    <div style={{ fontSize: 22, marginBottom: 4 }}>{s.icon}</div>
                    <div>{s.label}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Q1 options */}
          {step === 'q1' && category && !streaming && (
            <div style={{ marginLeft: 42, animation: 'fadeSlide 0.3s ease' }}>
              {!showQ1Input ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 8, marginBottom: 16 }}>
                  {category.q1.options.filter(o => o !== 'Other').map(opt => (
                    <button key={opt} onClick={() => handleQ1(opt)} style={{
                      padding: '10px 14px', borderRadius: 12, cursor: 'pointer', border: '2px solid rgba(0,0,0,0.07)',
                      background: 'var(--bp-card)', fontSize: 14, color: D, fontWeight: 500, textAlign: 'center', transition: 'all 0.15s',
                      fontFamily: "'DM Sans', sans-serif",
                    }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = O; e.currentTarget.style.background = 'rgba(232,99,43,0.03)'; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--bp-border)'; e.currentTarget.style.background = 'var(--bp-card)'; }}
                    >{opt}</button>
                  ))}
                  <button onClick={() => setShowQ1Input(true)} style={{
                    padding: '10px 14px', borderRadius: 12, cursor: 'pointer', border: '2px dashed rgba(0,0,0,0.12)',
                    background: 'var(--bp-card)', fontSize: 14, color: 'var(--bp-subtle)', fontWeight: 500, textAlign: 'center', transition: 'all 0.15s',
                    fontFamily: "'DM Sans', sans-serif",
                  }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = O; e.currentTarget.style.color = D; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(0,0,0,0.12)'; e.currentTarget.style.color = '#9B9490'; }}
                  >Something else</button>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                  <input value={q1InputVal} onChange={e => setQ1InputVal(e.target.value)} placeholder="Describe the issue..."
                    onKeyDown={e => { if (e.key === 'Enter' && q1InputVal.trim()) { handleQ1(q1InputVal.trim()); setShowQ1Input(false); setQ1InputVal(''); } }}
                    autoFocus
                    style={{
                      flex: 1, padding: '12px 16px', borderRadius: 100, fontSize: 15, border: '2px solid rgba(0,0,0,0.08)',
                      fontFamily: "'DM Sans', sans-serif", outline: 'none', color: D,
                    }}
                    onFocus={e => e.target.style.borderColor = O}
                    onBlur={e => e.target.style.borderColor = 'rgba(0,0,0,0.08)'}
                  />
                  <button onClick={() => { if (q1InputVal.trim()) { handleQ1(q1InputVal.trim()); setShowQ1Input(false); setQ1InputVal(''); } }}
                    style={{
                      width: 44, height: 44, borderRadius: '50%', border: 'none',
                      background: q1InputVal.trim() ? O : 'rgba(0,0,0,0.06)',
                      color: 'white', fontSize: 18, cursor: q1InputVal.trim() ? 'pointer' : 'default',
                      transition: 'all 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>↑</button>
                </div>
              )}
            </div>
          )}

          {/* Suggestion buttons + free input */}
          {step === 'extra' && !streaming && (
            <div style={{ marginLeft: 42, animation: 'fadeSlide 0.3s ease' }}>
              {/* Quick reply suggestions */}
              {suggestions.length > 0 && !showFreeInput && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 8, marginBottom: 12 }}>
                  {suggestions.map(s => (
                    <button key={s} onClick={() => handleUserInput(s)} style={{
                      padding: '10px 14px', borderRadius: 12, cursor: 'pointer', border: '2px solid rgba(0,0,0,0.07)',
                      background: 'var(--bp-card)', fontSize: 14, color: D, fontWeight: 500, textAlign: 'center', transition: 'all 0.15s',
                      fontFamily: "'DM Sans', sans-serif",
                    }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = O; e.currentTarget.style.background = 'rgba(232,99,43,0.03)'; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--bp-border)'; e.currentTarget.style.background = 'var(--bp-card)'; }}
                    >{s}</button>
                  ))}
                  <button onClick={() => setShowFreeInput(true)} style={{
                    padding: '10px 14px', borderRadius: 12, cursor: 'pointer', border: '2px dashed rgba(0,0,0,0.12)',
                    background: 'var(--bp-card)', fontSize: 14, color: 'var(--bp-subtle)', fontWeight: 500, textAlign: 'center', transition: 'all 0.15s',
                    fontFamily: "'DM Sans', sans-serif",
                  }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = O; e.currentTarget.style.color = D; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(0,0,0,0.12)'; e.currentTarget.style.color = '#9B9490'; }}
                  >Something else</button>
                </div>
              )}

              {/* Free text input — shown when no suggestions or user tapped "Something else" */}
              {(suggestions.length === 0 || showFreeInput) && (
                <>
                  {/* Image preview */}
                  {imgPreview && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, marginLeft: 0 }}>
                      <div style={{ position: 'relative' }}>
                        <img src={imgPreview} alt="Preview" style={{ height: 56, borderRadius: 10, border: '1px solid rgba(0,0,0,0.08)' }} />
                        <button onClick={() => { setImgPreview(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                          style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: '50%', background: D, color: '#fff', border: '2px solid white', fontSize: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
                      </div>
                      <span style={{ fontSize: 12, color: 'var(--bp-subtle)' }}>Photo attached</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                    <input type="file" ref={fileInputRef} accept="image/*" hidden onChange={e => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = ev => setImgPreview(ev.target?.result as string);
                      reader.readAsDataURL(file);
                    }} />
                    <button onClick={() => fileInputRef.current?.click()}
                      title="Attach a photo"
                      style={{
                        width: 44, height: 44, borderRadius: '50%', border: '2px solid rgba(0,0,0,0.08)',
                        background: 'var(--bp-card)', cursor: 'pointer', fontSize: 18, display: 'flex', alignItems: 'center',
                        justifyContent: 'center', flexShrink: 0, transition: 'all 0.15s',
                      }}
                      onMouseEnter={e => e.currentTarget.style.borderColor = O}
                      onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(0,0,0,0.08)'}
                    >📷</button>
                    {dictationSupported && (
                      <button onClick={toggleDictation}
                        title={dictating ? 'Stop dictating' : 'Dictate your answer'}
                        style={{
                          width: 44, height: 44, borderRadius: '50%',
                          border: dictating ? `2px solid ${O}` : '2px solid rgba(0,0,0,0.08)',
                          background: dictating ? O : 'var(--bp-card)',
                          color: dictating ? '#fff' : D,
                          cursor: 'pointer', fontSize: 18, display: 'flex', alignItems: 'center',
                          justifyContent: 'center', flexShrink: 0, transition: 'all 0.15s',
                          animation: dictating ? 'pulse 1.3s infinite' : 'none',
                          boxShadow: dictating ? `0 0 0 5px ${O}22` : 'none',
                        }}
                        onMouseEnter={e => { if (!dictating) e.currentTarget.style.borderColor = O; }}
                        onMouseLeave={e => { if (!dictating) e.currentTarget.style.borderColor = 'rgba(0,0,0,0.08)'; }}
                      >🎤</button>
                    )}
                    <input value={inputVal} onChange={e => setInputVal(e.target.value)} placeholder={imgPreview ? "Describe what you see..." : dictating ? "Listening… speak freely" : "Type your answer..."}
                      onKeyDown={e => { if (e.key === 'Enter' && (inputVal.trim() || imgPreview)) handleUserInput(inputVal.trim() || 'What do you see in this photo?'); }}
                      autoFocus
                      style={{
                        flex: 1, padding: '12px 16px', borderRadius: 100, fontSize: 15, border: '2px solid rgba(0,0,0,0.08)',
                        fontFamily: "'DM Sans', sans-serif", outline: 'none', color: D,
                      }}
                      onFocus={e => e.target.style.borderColor = O}
                      onBlur={e => e.target.style.borderColor = 'rgba(0,0,0,0.08)'}
                    />
                    <button onClick={() => { if (inputVal.trim() || imgPreview) handleUserInput(inputVal.trim() || 'What do you see in this photo?'); }}
                      style={{
                        width: 44, height: 44, borderRadius: '50%', border: 'none',
                        background: (inputVal.trim() || imgPreview) ? O : 'rgba(0,0,0,0.06)',
                        color: 'white', fontSize: 18, cursor: (inputVal.trim() || imgPreview) ? 'pointer' : 'default',
                        transition: 'all 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>↑</button>
                  </div>
                </>
              )}

            </div>
          )}

          {/* Dispatch-or-continue fork — repair only. Renders two
              buttons: the PM can either dispatch immediately (skip to
              the timing step) or ask Claude to keep diagnosing (another
              round of Q&A to sharpen the final diagnosis). The pending
              user message captured in pendingDecisionRef gets re-submitted
              to streamAI when Continue diagnosing is chosen, so nothing
              they typed is lost. */}
          {step === 'anything_else' && !streaming && category?.group !== 'service' && (
            <div style={{ marginLeft: 42, animation: 'fadeSlide 0.3s ease', marginBottom: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <button
                  onClick={() => {
                    // Dispatch now — log the choice and go straight to
                    // the urgency step. The existing diagnosis flow
                    // generates the final scope once timing is picked.
                    setMessages(prev => [
                      ...prev,
                      { role: 'user', content: 'Dispatch now' },
                      { role: 'assistant', content: 'When do you need this done?' },
                    ]);
                    pendingDecisionRef.current = null;
                    setStep('timing');
                  }}
                  style={{
                    padding: '14px 18px', borderRadius: 12, border: 'none',
                    background: O, color: '#fff',
                    fontSize: 14, fontWeight: 700, cursor: 'pointer',
                    fontFamily: "'DM Sans', sans-serif",
                    boxShadow: `0 10px 24px -10px ${O}8c`,
                    transition: 'transform .1s',
                  }}
                  onMouseDown={e => { e.currentTarget.style.transform = 'scale(0.98)'; }}
                  onMouseUp={e => { e.currentTarget.style.transform = 'scale(1)'; }}
                  onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; }}
                >Dispatch now →</button>
                <button
                  onClick={() => {
                    const pending = pendingDecisionRef.current;
                    // Drop the dispatch-or-continue prompt from visible
                    // history so Claude doesn't see its own sidebar
                    // question in the next turn's context.
                    setMessages(prev => prev.slice(0, -1));
                    pendingDecisionRef.current = null;
                    setStep('chat');
                    // Give the PM another two exchanges before we ask
                    // again — the counter resumes from zero.
                    setExchangeCount(0);
                    if (pending) {
                      setMessages(prev => [...prev, { role: 'user', content: 'Keep diagnosing' }]);
                      streamAI(
                        pending.text,
                        pending.history,
                        () => {
                          setExchangeCount(c => c + 1);
                          setStep('extra');
                        },
                        pending.image ? [pending.image] : undefined,
                      );
                    }
                  }}
                  style={{
                    padding: '14px 18px', borderRadius: 12,
                    border: '2px solid var(--bp-border)', background: 'var(--bp-card)',
                    color: 'var(--bp-text)',
                    fontSize: 14, fontWeight: 700, cursor: 'pointer',
                    fontFamily: "'DM Sans', sans-serif",
                    transition: 'all .15s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = O; e.currentTarget.style.color = O; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--bp-border)'; e.currentTarget.style.color = 'var(--bp-text)'; }}
                >Continue diagnosing</button>
              </div>
            </div>
          )}

          {/* Anything else before dispatch — service categories only
              (repair path is handled by the dispatch-or-continue fork
              above). */}
          {step === 'anything_else' && !streaming && category?.group === 'service' && (
            <div style={{ marginLeft: 42, animation: 'fadeSlide 0.3s ease', marginBottom: 16 }}>
              <div style={{ background: 'var(--bp-card)', borderRadius: 14, border: '2px solid rgba(0,0,0,0.06)', padding: 16, marginBottom: 10 }}>
                <textarea
                  value={anythingElseText}
                  onChange={e => setAnythingElseText(e.target.value)}
                  placeholder="Add any extra notes, access instructions, or details for the provider..."
                  rows={3}
                  style={{
                    width: '100%', border: '1.5px solid rgba(0,0,0,0.08)', borderRadius: 10,
                    padding: '10px 12px', fontSize: 14, fontFamily: "'DM Sans', sans-serif",
                    resize: 'none', outline: 'none', color: D, boxSizing: 'border-box',
                  }}
                  onFocus={e => { e.currentTarget.style.borderColor = O; }}
                  onBlur={e => { e.currentTarget.style.borderColor = 'rgba(0,0,0,0.08)'; }}
                />
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                  <button onClick={() => anythingElseFileRef.current?.click()} style={{
                    padding: '6px 12px', borderRadius: 8, border: '1.5px solid rgba(0,0,0,0.08)', background: 'var(--bp-card)',
                    fontSize: 13, color: 'var(--bp-subtle)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                  }}>
                    {'\uD83D\uDCF7'} {anythingElseImage ? 'Change photo' : 'Add photo'}
                  </button>
                  {anythingElseImage && (
                    <div style={{ position: 'relative', width: 40, height: 40, borderRadius: 8, overflow: 'hidden', border: '2px solid rgba(0,0,0,0.08)' }}>
                      <img src={anythingElseImage} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      <button onClick={() => setAnythingElseImage(null)} style={{
                        position: 'absolute', top: 1, right: 1, width: 16, height: 16, borderRadius: '50%',
                        background: 'rgba(0,0,0,0.5)', color: '#fff', border: 'none', fontSize: 9, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>{'\u00D7'}</button>
                    </div>
                  )}
                  <input ref={anythingElseFileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => {
                    const f = e.target.files?.[0];
                    if (f) { const r = new FileReader(); r.onload = ev => setAnythingElseImage(ev.target?.result as string); r.readAsDataURL(f); }
                    e.target.value = '';
                  }} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => {
                  if (anythingElseText.trim() || anythingElseImage) {
                    const content = anythingElseImage ? `\uD83D\uDCF7 ${anythingElseText.trim() || 'Photo attached'}` : anythingElseText.trim();
                    setMessages(prev => [...prev, { role: 'user', content }]);
                  }
                  setMessages(prev => [...prev, { role: 'assistant', content: 'When do you need this done?' }]);
                  setStep('timing');
                }} style={{
                  flex: 1, padding: '12px 20px', borderRadius: 12, border: 'none', background: O, color: '#fff',
                  fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
                }}>
                  {anythingElseText.trim() || anythingElseImage ? 'Continue' : 'Nothing else — continue'}
                </button>
              </div>
            </div>
          )}

          {/* Budget step removed — we no longer collect or send budget to
              providers. The flow goes straight from "anything_else" to
              "timing" after the user confirms. */}

          {/* Timing selection */}
          {step === 'timing' && !streaming && (
            <div style={{ marginLeft: 42, animation: 'fadeSlide 0.3s ease', marginBottom: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8, marginBottom: showDatePicker ? 10 : 0 }}>
                {['Today', 'Tomorrow', 'This week', 'Flexible'].map(t => (
                  <button key={t} onClick={() => handleTiming(t)} style={{
                    padding: '10px 14px', borderRadius: 12, cursor: 'pointer', border: '2px solid rgba(0,0,0,0.07)',
                    background: 'var(--bp-card)', fontSize: 14, color: D, fontWeight: 500, textAlign: 'center', transition: 'all 0.15s',
                    fontFamily: "'DM Sans', sans-serif",
                  }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = O; e.currentTarget.style.background = 'rgba(232,99,43,0.03)'; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--bp-border)'; e.currentTarget.style.background = 'var(--bp-card)'; }}
                  >{t}</button>
                ))}
                <button onClick={() => setShowDatePicker(!showDatePicker)} style={{
                  padding: '10px 14px', borderRadius: 12, cursor: 'pointer', border: `2px ${showDatePicker ? 'solid' : 'dashed'} ${showDatePicker ? O : 'rgba(0,0,0,0.12)'}`,
                  background: showDatePicker ? 'rgba(232,99,43,0.03)' : 'var(--bp-card)', fontSize: 14,
                  color: showDatePicker ? O : '#9B9490', fontWeight: 500, textAlign: 'center', transition: 'all 0.15s',
                  fontFamily: "'DM Sans', sans-serif",
                }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = O; e.currentTarget.style.color = D; }}
                  onMouseLeave={e => { if (!showDatePicker) { e.currentTarget.style.borderColor = 'rgba(0,0,0,0.12)'; e.currentTarget.style.color = '#9B9490'; } }}
                >{'\uD83D\uDCC5'} Pick a date</button>
              </div>
              {showDatePicker && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', animation: 'fadeSlide 0.2s ease' }}>
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={e => setSelectedDate(e.target.value)}
                    min={new Date().toISOString().split('T')[0]}
                    style={{
                      flex: 1, padding: '10px 14px', borderRadius: 10, border: '2px solid rgba(0,0,0,0.08)',
                      fontSize: 14, color: D, fontFamily: "'DM Sans', sans-serif", outline: 'none',
                    }}
                    onFocus={e => { e.currentTarget.style.borderColor = O; }}
                    onBlur={e => { e.currentTarget.style.borderColor = 'rgba(0,0,0,0.08)'; }}
                  />
                  <button
                    onClick={() => {
                      if (selectedDate) {
                        const formatted = new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                        handleTiming(formatted);
                      }
                    }}
                    disabled={!selectedDate}
                    style={{
                      padding: '10px 20px', borderRadius: 10, border: 'none',
                      background: selectedDate ? O : '#E0DAD4', color: selectedDate ? '#fff' : '#9B9490',
                      fontSize: 14, fontWeight: 600, cursor: selectedDate ? 'pointer' : 'default',
                      fontFamily: "'DM Sans', sans-serif",
                    }}
                  >Confirm</button>
                </div>
              )}
            </div>
          )}

          {/* Generating dispatch indicator */}
          {step === 'generating' && (
            <div style={{ marginLeft: 42, marginBottom: 16, animation: 'fadeSlide 0.3s ease' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: W, borderRadius: 12, padding: '14px 18px' }}>
                <div style={{ width: 20, height: 20, border: `2.5px solid ${O}30`, borderTopColor: O, borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                <span style={{ fontSize: 14, fontWeight: 600, color: D }}>Generating dispatch scope...</span>
              </div>
            </div>
          )}

          {/* Diagnosis summary card */}
          {step === 'summary' && !streaming && category && selectedProperty && !occupancyCheck?.occupied && (
            <DiagnosisSummaryCard
              category={category}
              property={selectedProperty}
              summary={aiDiagnosis}
              isService={category.group === 'service'}
              onDispatch={handleDispatch}
              dispatching={dispatching}
              estimate={costEstimate ?? undefined}
            />
          )}

          {/* Occupancy check card — shown when property is occupied */}
          {step === 'summary' && occupancyCheck?.occupied && occupancyCheck.reservation && category && (
            <div style={{
              marginLeft: 42, marginBottom: 16, background: 'var(--bp-card)', borderRadius: 16,
              border: `2px solid ${O}22`, overflow: 'hidden', animation: 'fadeSlide 0.3s ease',
              boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
            }}>
              <div style={{
                background: `${O}10`, padding: '12px 16px', borderBottom: `1px solid ${O}22`,
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <span style={{ fontSize: 16 }}>{'\u{1F3E0}'}</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: D }}>This property is currently occupied</span>
              </div>
              <div style={{ padding: 16 }}>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
                  <div style={{ background: W, padding: '6px 12px', borderRadius: 8, fontSize: 13 }}>
                    <span style={{ color: 'var(--bp-subtle)' }}>Guest:</span>{' '}
                    <span style={{ fontWeight: 600, color: D }}>{occupancyCheck.reservation.guestName || 'Unknown guest'}</span>
                  </div>
                  <div style={{ background: W, padding: '6px 12px', borderRadius: 8, fontSize: 13 }}>
                    <span style={{ color: 'var(--bp-subtle)' }}>Check-in:</span>{' '}
                    <span style={{ fontWeight: 600, color: D }}>{new Date(occupancyCheck.reservation.checkIn).toLocaleDateString()}</span>
                  </div>
                  <div style={{ background: W, padding: '6px 12px', borderRadius: 8, fontSize: 13 }}>
                    <span style={{ color: 'var(--bp-subtle)' }}>Check-out:</span>{' '}
                    <span style={{ fontWeight: 600, color: D }}>{new Date(occupancyCheck.reservation.checkOut).toLocaleDateString()}</span>
                  </div>
                </div>

                <p style={{ fontSize: 14, fontWeight: 600, color: D, marginBottom: 12 }}>
                  Does the provider have permission to enter?
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                  <button
                    disabled={dispatching}
                    onClick={() => {
                      const note = 'Note: Property is occupied. Provider has permission to enter.';
                      setEntryPermission(note);
                      setOccupancyCheck(null);
                      void executeDispatch(note);
                    }}
                    style={{
                      padding: '12px 20px', borderRadius: 10, border: 'none', background: G, color: '#fff',
                      fontSize: 14, fontWeight: 600, cursor: dispatching ? 'default' : 'pointer',
                      opacity: dispatching ? 0.7 : 1, fontFamily: "'DM Sans', sans-serif",
                    }}
                  >
                    Yes, provider can enter
                  </button>
                  <button
                    disabled={dispatching}
                    onClick={() => {
                      const note = 'Note: Property is occupied. Someone needs to be present for the provider.';
                      setEntryPermission(note);
                      setOccupancyCheck(null);
                      void executeDispatch(note);
                    }}
                    style={{
                      padding: '12px 20px', borderRadius: 10, border: `1.5px solid ${O}`,
                      background: 'var(--bp-card)', color: O, fontSize: 14, fontWeight: 600,
                      cursor: dispatching ? 'default' : 'pointer', opacity: dispatching ? 0.7 : 1,
                      fontFamily: "'DM Sans', sans-serif",
                    }}
                  >
                    Someone needs to be present
                  </button>
                </div>

                {(occupancyCheck.reservation.guestEmail || occupancyCheck.reservation.guestPhone) && (
                  <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13, color: D }}>
                    <div onClick={() => setNotifyGuest(!notifyGuest)} style={{
                      width: 40, height: 22, borderRadius: 11, background: notifyGuest ? G : '#E0DAD4',
                      position: 'relative', transition: 'background 0.2s', flexShrink: 0, cursor: 'pointer',
                    }}>
                      <div style={{
                        width: 18, height: 18, borderRadius: '50%', background: 'var(--bp-card)', position: 'absolute',
                        top: 2, left: notifyGuest ? 20 : 2, transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                      }} />
                    </div>
                    <span>Notify guest of dispatch status{occupancyCheck.reservation.guestEmail ? ` (${occupancyCheck.reservation.guestEmail})` : ''}</span>
                  </label>
                )}
              </div>
            </div>
          )}

          {/* Outreach live view */}
          {(step === 'outreach' || step === 'results') && (
            <>
              {/* Outreach progress */}
              {outreachStatus && (() => {
                const outreachStatusObj: OutreachStatus = {
                  providers_contacted: outreachStatus.providers_contacted,
                  providers_responded: outreachStatus.providers_responded,
                  outreach_channels: {
                    voice: { attempted: outreachStatus.outreach_channels.voice.attempted, connected: outreachStatus.outreach_channels.voice.connected },
                    sms: { attempted: outreachStatus.outreach_channels.sms.attempted, connected: outreachStatus.outreach_channels.sms.connected },
                    web: { attempted: outreachStatus.outreach_channels.web.attempted, connected: outreachStatus.outreach_channels.web.connected },
                  },
                  status: step === 'results' ? 'completed' : outreachStatus.status,
                };
                const logEntries: LogEntry[] = [];
                if (outreachStatus.providers_contacted > 0) logEntries.push({ msg: `Contacting ${outreachStatus.providers_contacted} providers...`, type: 'system' });
                if (outreachStatus.outreach_channels.voice.attempted > 0) logEntries.push({ msg: `${outreachStatus.outreach_channels.voice.attempted} voice calls`, type: 'voice' });
                if (outreachStatus.outreach_channels.sms.attempted > 0) logEntries.push({ msg: `${outreachStatus.outreach_channels.sms.attempted} SMS messages`, type: 'sms' });
                if (outreachStatus.outreach_channels.web.attempted > 0) logEntries.push({ msg: `${outreachStatus.outreach_channels.web.attempted} email contacts`, type: 'web' });
                if (outreachStatus.providers_responded > 0) logEntries.push({ msg: `${outreachStatus.providers_responded} quote(s) received!`, type: 'success' });
                if (step === 'results') logEntries.push({ msg: `${responses.length} quotes ready!`, type: 'done' });
                const isDone = step === 'results';
                return (
                  <div style={{ marginLeft: 42, marginBottom: 16, animation: 'fadeSlide 0.3s ease' }}>
                    <HomieOutreachLive
                      status={outreachStatusObj}
                      log={logEntries}
                      done={isDone}
                      showSafeNotice={!isDone}
                      accountLink="/business"
                    />
                  </div>
                );
              })()}

              {/* Share status tracker */}
              <TrackingShareCard
                jobId={jobId}
                propertyName={selectedProperty?.name}
                trackingUrl={trackingUrl}
                setTrackingUrl={setTrackingUrl}
              />

              {/* Provider cards */}
              {responses.map((r, i) => (
                <div key={r.id} style={{ marginLeft: 42, marginBottom: 10, animation: 'fadeSlide 0.4s ease' }}>
                  <div onClick={() => setSelectedResponse(selectedResponse === i ? null : i)} style={{
                    background: 'var(--bp-card)', borderRadius: 14, padding: '16px 18px', cursor: 'pointer',
                    border: selectedResponse === i ? `2px solid ${O}` : '1px solid rgba(0,0,0,0.06)',
                    boxShadow: selectedResponse === i ? `0 4px 20px ${O}18` : '0 1px 4px rgba(0,0,0,0.03)',
                    transition: 'all 0.2s',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <div>
                        <span style={{ fontWeight: 700, fontSize: 16, color: D }}>{r.provider.name}</span>
                        {r.provider.google_rating && (
                          <span style={{ color: 'var(--bp-subtle)', fontSize: 13, marginLeft: 8 }}>{'★'} {r.provider.google_rating} ({r.provider.review_count})</span>
                        )}
                      </div>
                      {r.quoted_price && (
                        <div style={{ textAlign: 'right' }}>
                          <span style={{ fontFamily: "'Fraunces', serif", fontSize: 24, fontWeight: 700, color: O }}>{r.quoted_price}</span>
                          <div style={{ fontSize: 11, color: 'var(--bp-subtle)', fontWeight: 500 }}>estimate</div>
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      {r.availability && <span style={{ fontSize: 14, color: D }}>{'📅'} {r.availability}</span>}
                      <span style={{ background: W, padding: '2px 10px', borderRadius: 100, fontSize: 11, color: 'var(--bp-subtle)' }}>via {r.channel}</span>
                    </div>
                    {r.message && <div style={{ fontSize: 13, color: 'var(--bp-muted)', fontStyle: 'italic', marginTop: 6 }}>"{r.message}"</div>}
                    {selectedResponse === i && (
                      <div style={{ marginTop: 14 }}>
                        <button onClick={async (e) => {
                          e.stopPropagation();
                          await jobService.bookProvider(jobId!, r.id, r.provider.id, selectedProperty?.address || undefined);
                          setBookedName(r.provider.name);
                        }} style={{
                          width: '100%', padding: '13px 0', borderRadius: 100, border: 'none',
                          background: O, color: 'white', fontSize: 16, fontWeight: 600, cursor: 'pointer',
                          fontFamily: "'DM Sans', sans-serif", boxShadow: `0 4px 16px ${O}40`,
                        }}>Book {r.provider.name.split(' ')[0]}</button>
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {/* Booking confirmation */}
              {bookedName && (
                <div style={{ marginLeft: 42, animation: 'fadeSlide 0.4s ease' }}>
                  <div style={{
                    background: 'var(--bp-card)', borderRadius: 16, padding: '28px 24px', textAlign: 'center',
                    border: `2px solid ${G}22`, boxShadow: '0 4px 20px rgba(0,0,0,0.06)',
                  }}>
                    <div style={{ width: 56, height: 56, borderRadius: '50%', background: `${G}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={G} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4.5 12.75l6 6 9-13.5" /></svg>
                    </div>
                    <div style={{ fontFamily: "'Fraunces', serif", fontSize: 22, fontWeight: 700, color: D, marginBottom: 6 }}>You're all set!</div>
                    <div style={{ fontSize: 14, color: 'var(--bp-muted)' }}>
                      <strong style={{ color: D }}>{bookedName}</strong> has been booked. They'll be in touch to confirm details.
                    </div>
                  </div>

                </div>
              )}

              {step === 'results' && responses.length > 0 && selectedResponse === null && !bookedName && (
                <div style={{ marginLeft: 42, textAlign: 'center', color: 'var(--bp-subtle)', fontSize: 14, marginTop: 8 }}>{'↑'} Tap a provider to book</div>
              )}
            </>
          )}

          <div ref={chatEndRef} />
        </div>
        {/* RIGHT PANEL — context cards (≥981px only; hidden via CSS on
            narrower breakpoints where the header already carries the
            same occupancy + calendar cues). */}
        <aside className="b2b-right-panel" style={{ display: 'none', flexDirection: 'column', gap: 12, position: 'sticky', top: 16, alignSelf: 'start', minWidth: 0 }}>
          <B2BPropertyContextCard
            property={selectedProperty}
            occupancy={headerOccupancy}
            reservations={calendarReservations}
          />
          <B2BHomieThinksCard
            property={selectedProperty}
            categoryLabel={category?.label ?? null}
            step={step}
            propertySelected={!!selectedProperty}
            describedIssue={!!q1Answer || messages.some(m => m.role === 'user')}
            // Only count equipment the AI captured DURING this chat session
            // — not the entire scan inventory (which is always populated
            // for properties with a prior scan and would auto-tick the box
            // on every new chat).
            equipmentCaptured={discoveredEquipment.length > 0}
            mediaAttached={uploadedPhotoUrlsRef.current.length > 0 || !!imgPreview}
            // Panel being merely OPEN doesn't count — the box was
            // ticking the instant the PM tapped Talk to Homie, before
            // they'd said anything. Only count actual voice turns that
            // made it into the chat thread (marked by the 🎤 prefix on
            // user messages in handleVoiceTurn).
            voiceUsed={messages.some(m => m.role === 'user' && m.content.startsWith('🎤'))}
            dispatchReady={step === 'summary' || step === 'outreach' || step === 'results'}
            // True only after the PM explicitly picks a timing button (or
            // a voice dispatch sets it implicitly). The default '' value
            // for `timing` keeps this false at session start.
            urgencyConfirmed={!!timing}
          />
          <B2BPropertyIQCard
            propertyId={selectedProperty?.id ?? null}
            categoryLabel={category?.label ?? null}
            items={propertyInventory}
            chatText={chatCorrelationText}
          />
          <B2BProsNearbyBadge
            categoryLabel={category?.label ?? null}
          />
          <B2BAssuranceCard />
        </aside>
      </div>
      </div>
    </div>
  );
}

// ─── Right-panel context components ─────────────────────────────────────────
// Used on ≥981px screens. Each card accepts primitive props so they don't
// know anything about the BusinessChat state machine; wiring is done at the
// <aside> call-site above.

// These theme-bound tokens resolve via the portal's --bp-* CSS variables
// so the right-rail components adapt to light/dark the same way the rest
// of the BusinessChat shell does (the CSS variables are defined on the
// surrounding .bp-portal wrapper and flip on data-theme="dark").
// Accent hex values (orange/green/amber/red) stay static — they read
// acceptably on both backgrounds.
const _DIM_R = 'var(--bp-subtle)';
const _O_R = '#E8632B';
const _G_R = '#1B9E77';
const _BORDER_R = 'var(--bp-border)';
const _AMBER_R = '#EF9F27';
const _RED_R = '#DC2626';
const _D_R = 'var(--bp-text)';
const _W_R = 'var(--bp-bg)';
/** Card background token — resolves to #fff in light mode, #242424 in dark. */
const _CARD_R = 'var(--bp-card)';

type HeaderOccupancy = {
  occupied: boolean;
  reservation: { guestName: string | null; checkIn: string; checkOut: string } | null;
  nextCheckIn?: { guestName: string | null; checkIn: string } | null;
} | null;

function fmtShortDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  } catch { return iso; }
}

function B2BPropertyContextCard({
  property, occupancy, reservations,
}: {
  property: { name: string; zipCode?: string | null } | null;
  occupancy: HeaderOccupancy;
  reservations: Reservation[];
}) {
  const [calOpen, setCalOpen] = useState(false);
  if (!property) return null;
  const isOccupied = !!occupancy?.occupied;
  const hasNext = !!occupancy?.nextCheckIn;
  const accent = isOccupied ? _RED_R : hasNext ? _G_R : _DIM_R;
  return (
    <div style={{
      background: _CARD_R, borderRadius: 18, border: `1px solid ${_BORDER_R}`,
      padding: 18, boxShadow: '0 12px 40px -20px rgba(0,0,0,.08)',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 14 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 10,
          background: `${_O_R}14`, display: 'flex', alignItems: 'center',
          justifyContent: 'center', fontSize: 18, flexShrink: 0,
        }}>🏠</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "'Fraunces',serif", fontSize: 15, fontWeight: 700, color: _D_R, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {property.name}
          </div>
          {property.zipCode && (
            <div style={{ fontSize: 11, color: _DIM_R, marginTop: 2, fontFamily: "'DM Mono',monospace", letterSpacing: .4 }}>
              {property.zipCode}
            </div>
          )}
        </div>
      </div>

      {/* Reservation block */}
      <div style={{ fontSize: 10, color: _DIM_R, textTransform: 'uppercase', letterSpacing: 1.2, fontWeight: 700, fontFamily: "'DM Mono',monospace", marginBottom: 8 }}>
        Reservation
      </div>
      {occupancy ? (
        <div style={{
          padding: 12, borderRadius: 12,
          background: `linear-gradient(90deg, ${accent}12, ${accent}04)`,
          border: `1px solid ${accent}24`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <div style={{ position: 'relative', width: 8, height: 8, flexShrink: 0 }}>
              <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: accent }} />
              {isOccupied && (
                <span style={{ position: 'absolute', inset: -3, borderRadius: '50%', background: accent, opacity: .25, animation: 'pulse 1.8s infinite' }} />
              )}
            </div>
            <span style={{ fontSize: 11, fontWeight: 700, color: accent, letterSpacing: 1, textTransform: 'uppercase', fontFamily: "'DM Mono',monospace" }}>
              {isOccupied ? 'Occupied' : hasNext ? 'Vacant · next check-in soon' : 'Vacant'}
            </span>
          </div>
          {occupancy.reservation && isOccupied && (
            <>
              <div style={{ fontFamily: "'Fraunces',serif", fontSize: 14, fontWeight: 700, color: _D_R, lineHeight: 1.3 }}>
                {occupancy.reservation.guestName || 'Guest'}
              </div>
              <div style={{ fontSize: 12, color: _DIM_R, marginTop: 2 }}>
                {fmtShortDate(occupancy.reservation.checkIn)} → {fmtShortDate(occupancy.reservation.checkOut)}
              </div>
              <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px dashed ${accent}33`, fontSize: 11.5, color: _D_R, lineHeight: 1.5 }}>
                ⚠ Guest is on-property — consider scheduling after checkout.
              </div>
            </>
          )}
          {!isOccupied && hasNext && occupancy.nextCheckIn && (
            <>
              <div style={{ fontFamily: "'Fraunces',serif", fontSize: 14, fontWeight: 700, color: _D_R, lineHeight: 1.3 }}>
                Next: {occupancy.nextCheckIn.guestName || 'Guest'}
              </div>
              <div style={{ fontSize: 12, color: _DIM_R, marginTop: 2 }}>
                Check-in {fmtShortDate(occupancy.nextCheckIn.checkIn)}
              </div>
              <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px dashed ${accent}33`, fontSize: 11.5, color: _D_R, lineHeight: 1.5 }}>
                ✓ Safe window to dispatch now.
              </div>
            </>
          )}
          {!isOccupied && !hasNext && (
            <div style={{ fontSize: 12, color: _DIM_R, marginTop: 2 }}>
              No upcoming reservations.
            </div>
          )}

          {/* Expandable MiniCalendar */}
          {reservations.length > 0 && (
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px dashed ${accent}33` }}>
              <button onClick={() => setCalOpen(o => !o)} style={{
                width: '100%', background: 'transparent', border: 'none', padding: 0,
                display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
                fontSize: 11.5, fontWeight: 700, color: _D_R, textAlign: 'left',
                fontFamily: "'DM Sans',sans-serif",
              }}>
                <span>📅</span>
                <span style={{ flex: 1 }}>Best dispatch windows · next 60 days</span>
                <span style={{ fontSize: 9, color: _DIM_R, transform: calOpen ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}>▾</span>
              </button>
              {calOpen && (
                <div style={{ marginTop: 10 }}>
                  <MiniCalendar reservations={reservations} />
                  <div style={{ marginTop: 8, padding: '6px 8px', borderRadius: 6, background: `${_G_R}0f`, border: `1px solid ${_G_R}22`, fontSize: 10.5, color: _D_R, lineHeight: 1.5 }}>
                    <strong style={{ color: _G_R }}>Open days</strong> are safe windows — unless it's an urgent guest request.
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div style={{
          padding: 12, borderRadius: 12,
          background: 'var(--bp-hover)', border: `1px dashed ${_BORDER_R}`,
          fontSize: 12, color: _DIM_R, lineHeight: 1.5,
        }}>
          Connect your PMS to see live occupancy.
        </div>
      )}
    </div>
  );
}

/** "Homie is listening" panel — merges the diagnosis-grid header, status
 *  panel, and the live Checklist into a single right-rail card. Mirrors
 *  the /quote panel layout: panel header → diagnosis grid → divider →
 *  checklist (with NEXT pill on the first incomplete row). One card
 *  instead of two keeps the right rail visually anchored and gives the
 *  progress signal more room to breathe. */
function B2BHomieThinksCard({
  property, categoryLabel, step,
  propertySelected, describedIssue, equipmentCaptured,
  mediaAttached, voiceUsed, dispatchReady, urgencyConfirmed,
}: {
  property: { name: string } | null;
  categoryLabel: string | null;
  step: string;
  propertySelected: boolean;
  describedIssue: boolean;
  equipmentCaptured: boolean;
  mediaAttached: boolean;
  voiceUsed: boolean;
  dispatchReady: boolean;
  urgencyConfirmed: boolean;
}) {
  const ready = !!categoryLabel;
  const items: Array<{ done: boolean; txt: string; opt?: boolean }> = [
    { done: propertySelected, txt: propertySelected ? 'Property selected' : 'Pick a property' },
    { done: !!categoryLabel, txt: categoryLabel ? `Category: ${categoryLabel}` : 'Matching a category' },
    { done: describedIssue, txt: describedIssue ? 'Issue described' : 'Describe the issue' },
    { done: equipmentCaptured, txt: equipmentCaptured ? 'Equipment captured' : 'Equipment on file', opt: true },
    { done: mediaAttached || voiceUsed, txt: 'Photo / video / voice attached', opt: true },
    { done: dispatchReady, txt: dispatchReady ? 'Dispatch brief ready' : 'Generate dispatch brief' },
    { done: urgencyConfirmed || dispatchReady, txt: urgencyConfirmed || dispatchReady ? 'Urgency set' : 'Next: confirm urgency & dispatch' },
  ];
  const nextIdx = items.findIndex(x => !x.done);

  return (
    <div style={{
      background: _CARD_R, borderRadius: 18, border: `1px solid ${_BORDER_R}`,
      padding: 18, boxShadow: '0 12px 40px -20px rgba(0,0,0,.08)',
    }}>
      {/* Panel header — avatar + label */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <div style={{ width: 34, height: 34, borderRadius: 10, background: _O_R, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
          <svg width={16} height={16} viewBox="0 0 24 24" fill="none">
            <path d="M12 2l2 7 7 2-7 2-2 7-2-7-7-2 7-2 2-7z" fill="#fff" />
          </svg>
          <span style={{ position: 'absolute', top: -2, right: -2, width: 9, height: 9, borderRadius: '50%', background: _G_R, border: '2px solid #fff', animation: 'pulse 1.8s infinite' }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "'Fraunces',serif", fontWeight: 700, fontSize: 16, color: _D_R }}>homie is listening</div>
          <div style={{ fontSize: 11, color: _DIM_R, fontFamily: "'DM Mono',monospace", letterSpacing: .4, textTransform: 'uppercase' }}>updates as you chat</div>
        </div>
      </div>

      {/* Diagnosis grid — property / category / step / priority.
          Collapses to a "start describing" empty-state until a category
          has been inferred. */}
      {ready ? (
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, padding: 12, borderRadius: 12, background: _W_R,
        }}>
          <div>
            <div style={{ fontSize: 9, color: _DIM_R, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700 }}>Property</div>
            <div style={{ fontFamily: "'Fraunces',serif", fontSize: 13, fontWeight: 700, color: _D_R, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{property?.name || '—'}</div>
          </div>
          <div>
            <div style={{ fontSize: 9, color: _DIM_R, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700 }}>Category</div>
            <div style={{ fontFamily: "'Fraunces',serif", fontSize: 13, fontWeight: 700, color: _D_R, marginTop: 2 }}>{categoryLabel}</div>
          </div>
          <div>
            <div style={{ fontSize: 9, color: _DIM_R, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700 }}>Step</div>
            <div style={{ fontFamily: "'Fraunces',serif", fontSize: 13, fontWeight: 700, color: _AMBER_R, marginTop: 2 }}>{step === 'summary' ? 'Ready' : step === 'outreach' ? 'Dispatching' : 'In progress'}</div>
          </div>
          <div>
            <div style={{ fontSize: 9, color: _DIM_R, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700 }}>Priority</div>
            <div style={{ fontFamily: "'Fraunces',serif", fontSize: 13, fontWeight: 700, color: _D_R, marginTop: 2 }}>Standard</div>
          </div>
        </div>
      ) : (
        <div style={{ padding: '20px 14px', borderRadius: 12, background: _W_R, textAlign: 'center', color: _DIM_R, fontSize: 12.5, border: `1px dashed ${_BORDER_R}` }}>
          Start describing — I'll read along ↗
        </div>
      )}

      {/* Checklist — merged inline below the diagnosis grid. Each row
          gets a green check + green tint when done, hollow circle when
          pending, orange NEXT pill on the first incomplete row. */}
      <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px dashed ${_BORDER_R}` }}>
        <div style={{ fontSize: 10.5, color: _DIM_R, textTransform: 'uppercase', letterSpacing: 1.4, fontWeight: 700, marginBottom: 8, fontFamily: "'DM Mono',monospace" }}>
          Checklist
        </div>
        <div style={{ display: 'grid', gap: 5 }}>
          {items.map((p, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 9,
              background: p.done ? `${_G_R}13` : 'transparent',
              border: `1px solid ${p.done ? `${_G_R}33` : 'transparent'}`,
              transition: 'all .2s',
            }}>
              <div style={{
                width: 16, height: 16, borderRadius: '50%',
                background: p.done ? _G_R : 'transparent',
                border: p.done ? 'none' : `1.5px solid ${_BORDER_R}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontSize: 9, fontWeight: 700, flexShrink: 0,
              }}>
                {p.done ? '✓' : ''}
              </div>
              <div style={{ flex: 1, fontSize: 12, color: p.done ? _D_R : _DIM_R, fontWeight: p.done ? 600 : 500, fontFamily: "'DM Sans',sans-serif", minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {p.txt} {p.opt && <span style={{ fontSize: 9.5, color: _DIM_R, fontWeight: 500, marginLeft: 3 }}>(optional)</span>}
              </div>
              {i === nextIdx && step !== 'outreach' && step !== 'results' && (
                <span style={{ fontSize: 9, color: _O_R, fontFamily: "'DM Mono',monospace", letterSpacing: 1, fontWeight: 700, flexShrink: 0 }}>NEXT</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Maps our B2B category labels to the inventory itemType substrings they
// should match. Intentionally permissive — "HVAC" pulls any item whose
// itemType mentions ac/hvac/furnace/etc, whether it came in as 'system'
// or 'appliance' in the scan.
const IQ_CATEGORY_MATCH: Record<string, (it: PropertyInventoryItem) => boolean> = {
  plumbing:   it => /plumb|faucet|sink|toilet|shower|bath|drain|pipe/i.test(it.itemType),
  water_heater: it => /water.?heater|tankless/i.test(it.itemType),
  septic_sewer: it => /sewer|septic/i.test(it.itemType),
  electrical: it => /electric|outlet|breaker|panel|light|wiring/i.test(it.itemType),
  hvac:       it => /hvac|air.?cond|ac(_|\b)|furnace|heat.?pump|thermostat|boiler|mini.?split/i.test(it.itemType),
  appliance:  it => it.category === 'appliance' || /fridge|refrig|washer|dryer|dishwash|oven|range|microwave|stove|disposal/i.test(it.itemType),
  roofing:    it => /roof|gutter|siding|chimney/i.test(it.itemType),
  garage_door: it => /garage/i.test(it.itemType),
  pool:       it => /pool|spa|hot.?tub/i.test(it.itemType),
  security_systems: it => /alarm|camera|doorbell|security/i.test(it.itemType),
};

function iqLabelFor(itemType: string): string {
  return itemType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function iqCategoryKeyFromLabel(label: string | null): keyof typeof IQ_CATEGORY_MATCH | null {
  if (!label) return null;
  const l = label.toLowerCase();
  if (l.includes('plumb')) return 'plumbing';
  if (l.includes('water heater')) return 'water_heater';
  if (l.includes('electric')) return 'electrical';
  if (l.includes('hvac')) return 'hvac';
  if (l.includes('appliance')) return 'appliance';
  if (l.includes('roof')) return 'roofing';
  if (l.includes('garage')) return 'garage_door';
  if (l.includes('pool')) return 'pool';
  if (l.includes('security')) return 'security_systems';
  return null;
}

/** Synonym map for detecting when an inventory item is being called out
 *  by an unambiguous synonym ("fridge" for a refrigerator, "AC" for an
 *  HVAC AC unit). Every row is now MEDIUM — a direct name reference.
 *  Broad category signals ("drain", "leak", "wire", "sensor") used to
 *  live in a 'weak' tier but caused follow-up questions to pull in
 *  unrelated items; we now drop them entirely so Property IQ only lights
 *  up on 100% name matches.
 *
 *  - `match`   : regex tested against the item's itemType — picks which
 *                items this row applies to. Uses word boundaries so
 *                "washer" doesn't match inside "dishwasher".
 *  - `signals` : regex tested against the chat text — if it fires on
 *                an applicable item, that's a correlation. */
const IQ_SYNONYMS: Array<{ match: RegExp; signals: RegExp }> = [
  { match: /\b(hvac|air.?cond|ac_unit|ac|furnace|heat.?pump|thermostat|boiler|mini.?split)\b/i,
    signals: /\b(hvac|a\/?c|air[\s-]?cond|ac[\s-]?unit|furnace|heat[\s-]?pump|thermostat|boiler|mini[\s-]?split)\b/i },
  { match: /\b(water.?heater|tankless)\b/i,
    signals: /\b(water[\s-]?heater|hot[\s-]?water|tankless|water[\s-]?tank)\b/i },
  { match: /\b(fridge|refrig)/i, signals: /\b(fridge|refrigerat|freezer|ice[\s-]?maker)\b/i },
  { match: /\bwasher\b/i, signals: /\b(washer|washing[\s-]?machine|clothes[\s-]?washer)\b/i },
  { match: /\bdryer\b/i, signals: /\b(dryer|clothes[\s-]?dryer|laundry[\s-]?dryer)\b/i },
  { match: /\bdishwash/i, signals: /\b(dishwasher|dishwash)\b/i },
  { match: /\b(oven|range|stove|cooktop)\b/i, signals: /\b(oven|range|stove|cooktop)\b/i },
  { match: /\bmicrowave\b/i, signals: /\bmicrowave\b/i },
  { match: /\bdisposal\b/i, signals: /\b(garbage[\s-]?disposal|disposal)\b/i },
  { match: /\b(faucet|sink|tap|spigot)\b/i, signals: /\b(faucet|tap|spigot)\b/i },
  { match: /\btoilet\b/i, signals: /\b(toilet|commode)\b/i },
  { match: /\b(shower|bath|bathtub|tub)\b/i, signals: /\b(shower|bathtub|tub)\b/i },
  { match: /\b(outlet|receptacle|breaker|panel|wiring|gfci|circuit)\b/i, signals: /\b(outlet|receptacle|breaker|panel|wiring|gfci|circuit)\b/i },
  { match: /\b(lamp|sconce|chandelier)\b/i, signals: /\b(lamp|sconce|chandelier)\b/i },
  { match: /\b(roof|gutter|siding|chimney|shingle)\b/i, signals: /\b(roof|shingle|gutter|siding|chimney|flashing)\b/i },
  { match: /\bgarage\b/i, signals: /\b(garage[\s-]?door|door[\s-]?opener)\b/i },
  { match: /\b(pool|spa|hot.?tub|jacuzzi)\b/i, signals: /\b(pool|spa|hot[\s-]?tub|jacuzzi)\b/i },
  { match: /\b(alarm|camera|doorbell)\b/i, signals: /\b(alarm|camera|doorbell|smoke|carbon[\s-]?monoxide|co[\s-]?detector)\b/i },
];

/** Words that sit in item types but don't uniquely identify an item —
 *  e.g. "kitchen_faucet" shouldn't correlate to every chat that mentions
 *  "kitchen". Each word here is filtered out of the itemType-word match
 *  pass, so the item only matches via its DISTINCTIVE token (or via a
 *  synonym row).
 *
 *  Three buckets:
 *    1. Locations / rooms — kitchen, bathroom, garage, etc.
 *    2. Generic descriptors — main, unit, system, fixture, new, old.
 *    3. Compound prefix words that bleed across many appliances — "water"
 *       sits in water_heater AND water_softener AND water_filter, so
 *       chat mentioning "water heater" was also lighting up the softener
 *       via the shared "water" token. Demoting these forces each item
 *       to match on its own distinctive suffix instead. Same logic for
 *       hot/gas/air/electric prefixes that combine with other words. */
const IQ_GENERIC_TOKENS = new Set([
  // Generic descriptors
  'main', 'unit', 'room', 'rooms', 'system', 'fixture', 'line', 'new', 'old', 'home', 'house',
  // Rooms / locations
  'kitchen', 'bath', 'bathroom', 'bedroom', 'living', 'laundry', 'garage',
  'upstairs', 'downstairs', 'outdoor', 'indoor', 'front', 'back', 'side',
  // Compound prefix words (shared across several appliance itemTypes)
  'water', 'hot', 'cold', 'gas', 'air', 'electric', 'mini', 'heat', 'sub',
]);

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Correlation — tells how specifically an inventory item is being
 *  discussed in the chat. Only two positive tiers now:
 *    - 'strong'  : brand or model number appears verbatim in the chat.
 *    - 'medium'  : the item's type name (or an unambiguous synonym like
 *                  "fridge" → refrigerator) appears. Uses word
 *                  boundaries so "washer" doesn't light up "dishwasher".
 *    - null      : no direct call-out. Broad signals like "drain",
 *                  "leak", "wire", "sensor" used to produce a weak tier
 *                  but they'd surface unrelated items once follow-up
 *                  questions started — we now drop them entirely so
 *                  Property IQ only shows items explicitly named. */
type CorrelationStrength = 'strong' | 'medium' | null;

function correlateItemToChat(item: PropertyInventoryItem, chatText: string): CorrelationStrength {
  if (!chatText) return null;

  // Tier 1 — brand / model hit. Highest specificity.
  if (item.brand && item.brand.trim().length >= 2) {
    if (new RegExp(`\\b${escapeRegex(item.brand)}\\b`, 'i').test(chatText)) return 'strong';
  }
  if (item.modelNumber && item.modelNumber.trim().length >= 2) {
    if (new RegExp(escapeRegex(item.modelNumber), 'i').test(chatText)) return 'strong';
  }

  // Tier 2 — distinctive itemType word. Drop generic tokens
  // ("kitchen", "main", …) that don't uniquely identify a single item.
  const itemType = (item.itemType || '').toLowerCase();
  const words = itemType.split(/[_\s]/).filter(w => w.length >= 4 && !IQ_GENERIC_TOKENS.has(w));
  for (const w of words) {
    if (new RegExp(`\\b${escapeRegex(w)}\\b`, 'i').test(chatText)) return 'medium';
  }

  // Tier 2 continued — synonym rows that unambiguously name an appliance
  // family ("fridge" → refrigerator, "AC" → HVAC unit). Row must match
  // this item's type via word-boundary AND the signal must fire in chat.
  for (const syn of IQ_SYNONYMS) {
    if (!syn.match.test(itemType)) continue;
    if (syn.signals.test(chatText)) return 'medium';
  }

  return null;
}

/** Kept for backwards-compat with MobileInlinePropertyIQ. Returns true
 *  for any non-null correlation — callers that care about specificity
 *  should use correlateItemToChat directly. */
function itemCorrelatesWithChat(item: PropertyInventoryItem, chatText: string): boolean {
  return correlateItemToChat(item, chatText) !== null;
}

function B2BPropertyIQCard({
  propertyId, categoryLabel, items, chatText,
}: {
  propertyId: string | null;
  categoryLabel: string | null;
  items: PropertyInventoryItem[];
  /** Concatenated lowercased text of the current chat (user + assistant
   *  messages + in-flight streaming text). Used to narrow which inventory
   *  items are actually being discussed. Empty = no correlation yet. */
  chatText: string;
}) {
  // Empty-state — no scan or zero items. Show the run-scan nudge.
  if (!propertyId || items.length === 0) {
    return (
      <div style={{
        background: _CARD_R, borderRadius: 18, border: `1px dashed ${_BORDER_R}`,
        padding: 16,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <div style={{ width: 30, height: 30, borderRadius: 9, background: 'var(--bp-hover)', border: `1px solid ${_BORDER_R}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, opacity: .6 }}>🧠</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: "'Fraunces',serif", fontSize: 14, fontWeight: 700, color: _D_R }}>Property IQ</div>
            <div style={{ fontSize: 10, color: _DIM_R, marginTop: 1, fontFamily: "'DM Mono',monospace", letterSpacing: .4, textTransform: 'uppercase' }}>No scan on file</div>
          </div>
        </div>
        <div style={{ fontSize: 12, color: _D_R, lineHeight: 1.5, marginBottom: 8 }}>
          Run a property scan and Homie will remember brands + service history for next time.
        </div>
      </div>
    );
  }

  // Tiered filter — prefer items directly discussed by brand/model
  // (strong) or by name/synonym (medium). Weak-only matches (broad
  // Show only items the chat explicitly named (by itemType, synonym, or
  // brand/model). No weak/category-keyword matches — a follow-up like
  // "does it drain?" must not widen the card to faucets/toilets just
  // because they share a plumbing keyword with the dishwasher. When
  // brand/model hits exist they take priority over simple name hits.
  const catKey = iqCategoryKeyFromLabel(categoryLabel);
  const scored = chatText
    ? items
        .map(it => ({ it, strength: correlateItemToChat(it, chatText) }))
        .filter((x): x is { it: PropertyInventoryItem; strength: 'strong' | 'medium' } => x.strength !== null)
    : [];
  const hasStrong = scored.some(x => x.strength === 'strong');
  const correlated = hasStrong
    ? scored.filter(x => x.strength === 'strong').map(x => x.it)
    : scored.map(x => x.it);
  const hasChatHits = correlated.length > 0;
  const fallback = catKey ? items.filter(IQ_CATEGORY_MATCH[catKey]) : [];
  const filtered = hasChatHits ? correlated : fallback;
  const hasCategory = !!catKey;

  // If we have a scan but nothing is being discussed yet (chat empty OR no
  // keywords fire AND no category is inferred), collapse to a compact
  // "ready" state rather than spamming the whole inventory — matches the
  // user's ask that only correlated items appear.
  if (!hasChatHits && !hasCategory) {
    return (
      <div style={{
        background: _CARD_R, borderRadius: 18, border: `1px dashed ${_BORDER_R}`,
        padding: 16,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <div style={{ width: 30, height: 30, borderRadius: 9, background: `${_O_R}14`, border: `1px solid ${_O_R}33`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15 }}>🧠</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: "'Fraunces',serif", fontSize: 14, fontWeight: 700, color: _D_R }}>Property IQ</div>
            <div style={{ fontSize: 10, color: _DIM_R, marginTop: 1, fontFamily: "'DM Mono',monospace", letterSpacing: .4, textTransform: 'uppercase' }}>{items.length} on file · ready</div>
          </div>
        </div>
        <div style={{ fontSize: 12, color: _DIM_R, lineHeight: 1.5 }}>
          Mention a system or appliance — Homie will surface the matching equipment here.
        </div>
      </div>
    );
  }

  return (
    <div style={{
      background: _CARD_R, borderRadius: 18, border: `1px solid ${_BORDER_R}`,
      padding: 16, boxShadow: '0 12px 40px -20px rgba(0,0,0,.08)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <div style={{
          width: 30, height: 30, borderRadius: 9,
          background: `${_O_R}14`, border: `1px solid ${_O_R}33`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 15, flexShrink: 0,
        }}>🧠</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "'Fraunces',serif", fontSize: 14, fontWeight: 700, color: _D_R }}>
            Property IQ{hasChatHits ? ' · in chat' : hasCategory && categoryLabel ? ` · ${categoryLabel}` : ''}
          </div>
          <div style={{ fontSize: 10, color: _DIM_R, marginTop: 1, fontFamily: "'DM Mono',monospace", letterSpacing: .4, textTransform: 'uppercase' }}>
            {filtered.length} {hasChatHits ? 'mentioned' : 'matching'} item{filtered.length === 1 ? '' : 's'}
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div style={{ padding: 10, borderRadius: 10, background: 'var(--bp-hover)', fontSize: 12, color: _DIM_R, lineHeight: 1.5 }}>
          No {categoryLabel?.toLowerCase() ?? 'matching'} equipment on file — Homie will record what you mention.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 6 }}>
          {filtered.slice(0, 4).map(item => <B2BIQRow key={item.id} item={item} />)}
        </div>
      )}
    </div>
  );
}

/** Compact inline Property IQ card for mobile — surfaces inventory items
 *  that correlate with the current chat directly inside the chat column
 *  (the desktop right-rail version is hidden under 981px). Also shows any
 *  equipment the AI discovered on the fly, so the PM sees what's been
 *  captured for the dispatch summary. Entire component hides itself on
 *  ≥981px via the .b2b-mobile-iq CSS class. */
/** Always-visible "added to Property IQ" callout. Renders a compact
 *  confirmation card right in the chat thread for every new item the AI
 *  identified this session — visual recognition from a video frame, a
 *  brand the PM just spoke, etc. Lets the PM see exactly what got
 *  captured and routed to inventory without having to glance at the
 *  right rail. Hides itself when nothing has been discovered yet. */
function InlineDiscoveredEquipment({
  discovered,
}: {
  discovered: Array<{ itemType: string; brand?: string; modelNumber?: string; estimatedAgeYears?: number; condition?: string }>;
}) {
  if (!discovered || discovered.length === 0) return null;
  return (
    <div style={{
      marginLeft: 42, marginRight: 0, marginTop: 8, marginBottom: 12,
      background: _CARD_R, borderRadius: 14, border: `1px solid ${_G_R}55`,
      padding: 12, animation: 'fadeSlide 0.3s ease',
      boxShadow: `0 8px 24px -16px ${_G_R}66`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <div style={{ width: 22, height: 22, borderRadius: 7, background: _G_R, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700 }}>+</div>
        <span style={{ fontFamily: "'Fraunces',serif", fontSize: 12.5, fontWeight: 700, color: _D_R }}>
          Added to Property IQ
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 9.5, color: _DIM_R, fontFamily: "'DM Mono',monospace", letterSpacing: 1, textTransform: 'uppercase', fontWeight: 700 }}>
          {discovered.length} new
        </span>
      </div>
      <div style={{ display: 'grid', gap: 6 }}>
        {discovered.map((d, i) => (
          <div key={`disc-inline-${i}`} style={{
            padding: 10, borderRadius: 10,
            background: `${_G_R}0e`, border: `1px dashed ${_G_R}55`,
            display: 'flex', gap: 8, alignItems: 'flex-start',
          }}>
            <div style={{ width: 22, height: 22, borderRadius: 6, background: _G_R, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>✓</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: "'Fraunces',serif", fontSize: 12.5, fontWeight: 700, color: _D_R, lineHeight: 1.2 }}>
                {[d.brand, d.modelNumber].filter(Boolean).join(' · ') || iqLabelFor(d.itemType)}
              </div>
              <div style={{ fontSize: 10, color: _DIM_R, marginTop: 2, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ textTransform: 'capitalize' }}>{iqLabelFor(d.itemType)}</span>
                {d.estimatedAgeYears !== undefined && (
                  <><span style={{ opacity: .4 }}>·</span><span>{Math.round(d.estimatedAgeYears)}yr</span></>
                )}
                {d.condition && (
                  <><span style={{ opacity: .4 }}>·</span><span>{d.condition}</span></>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MobileInlinePropertyIQ({
  items, chatText, discovered,
}: {
  items: PropertyInventoryItem[];
  chatText: string;
  discovered: Array<{ itemType: string; brand?: string; modelNumber?: string; estimatedAgeYears?: number; condition?: string }>;
}) {
  // Only items explicitly called out by name/synonym/brand. Matches the
  // desktop card — no broad category keywords, so a follow-up question
  // can't pull unrelated items into the list.
  const scored = chatText
    ? items
        .map(it => ({ it, strength: correlateItemToChat(it, chatText) }))
        .filter((x): x is { it: PropertyInventoryItem; strength: 'strong' | 'medium' } => x.strength !== null)
    : [];
  const hasStrong = scored.some(x => x.strength === 'strong');
  const correlated = hasStrong
    ? scored.filter(x => x.strength === 'strong').map(x => x.it)
    : scored.map(x => x.it);
  if (correlated.length === 0 && discovered.length === 0) return null;

  return (
    <div className="b2b-mobile-iq" style={{
      marginLeft: 42, marginRight: 0, marginTop: 8, marginBottom: 8,
      background: _CARD_R, borderRadius: 14, border: `1px solid ${_BORDER_R}`,
      padding: 12, animation: 'fadeSlide 0.3s ease',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <div style={{ width: 22, height: 22, borderRadius: 7, background: `${_O_R}14`, border: `1px solid ${_O_R}33`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}>🧠</div>
        <span style={{ fontFamily: "'Fraunces',serif", fontSize: 12.5, fontWeight: 700, color: _D_R }}>
          Property IQ · {correlated.length + discovered.length} {correlated.length + discovered.length === 1 ? 'item' : 'items'} in play
        </span>
      </div>
      <div style={{ display: 'grid', gap: 6 }}>
        {correlated.slice(0, 3).map(item => <B2BIQRow key={item.id} item={item} />)}
        {discovered.slice(0, 3).map((d, i) => (
          <div key={`disc-${i}`} style={{
            padding: 10, borderRadius: 10,
            background: `${_G_R}0e`, border: `1px dashed ${_G_R}66`,
            display: 'flex', gap: 8, alignItems: 'flex-start',
          }}>
            <div style={{ width: 22, height: 22, borderRadius: 6, background: _G_R, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
              +
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: "'Fraunces',serif", fontSize: 12.5, fontWeight: 700, color: _D_R, lineHeight: 1.2 }}>
                {[d.brand, d.modelNumber].filter(Boolean).join(' · ') || iqLabelFor(d.itemType)}
              </div>
              <div style={{ fontSize: 10, color: _DIM_R, marginTop: 2, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ textTransform: 'capitalize' }}>{iqLabelFor(d.itemType)}</span>
                {d.estimatedAgeYears !== undefined && (
                  <><span style={{ opacity: .4 }}>·</span><span>{Math.round(d.estimatedAgeYears)}yr</span></>
                )}
                <span style={{ opacity: .4 }}>·</span>
                <span style={{ color: _G_R, fontWeight: 700 }}>new from chat</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function B2BIQRow({ item }: { item: PropertyInventoryItem }) {
  const ageYears = item.estimatedAgeYears ? parseFloat(item.estimatedAgeYears) : null;
  const pinned = item.status === 'pm_confirmed';
  return (
    <div style={{
      padding: 10, borderRadius: 10,
      background: pinned ? `${_O_R}08` : 'var(--bp-hover)',
      border: `1px solid ${pinned ? `${_O_R}33` : _BORDER_R}`,
      display: 'flex', gap: 8, alignItems: 'flex-start',
    }}>
      <div style={{
        width: 26, height: 26, borderRadius: 7,
        background: pinned ? _O_R : _CARD_R,
        border: pinned ? 'none' : `1px solid ${_BORDER_R}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 12, flexShrink: 0,
      }}>
        {item.category === 'appliance' && '🍳'}
        {item.category === 'fixture' && '🚰'}
        {item.category === 'system' && '❄️'}
        {item.category === 'safety' && '🛡️'}
        {item.category === 'amenity' && '✨'}
        {item.category === 'infrastructure' && '🔨'}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: "'Fraunces',serif", fontSize: 12.5, fontWeight: 700, color: _D_R, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {[item.brand, item.modelNumber].filter(Boolean).join(' · ') || iqLabelFor(item.itemType)}
        </div>
        <div style={{ fontSize: 10, color: _DIM_R, marginTop: 2, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ textTransform: 'capitalize' }}>{iqLabelFor(item.itemType)}</span>
          {ageYears !== null && (
            <>
              <span style={{ opacity: .4 }}>·</span>
              <span>{Math.round(ageYears)}yr</span>
            </>
          )}
          {item.condition && item.condition !== 'good' && (
            <>
              <span style={{ opacity: .4 }}>·</span>
              <span style={{ color: item.condition === 'poor' ? _RED_R : _AMBER_R, fontWeight: 700 }}>
                {item.condition}
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// Deterministic "pros available nearby" count keyed by category label.
// Mirrors the /quote PROS_NEARBY_BY_GROUP map so both surfaces agree.
// Swap in a real discovery-backed count when that endpoint lands.
const B2B_PROS_NEARBY: Record<string, number> = {
  Plumbing: 18, Electrical: 14, HVAC: 11, 'Appliance Repair': 9,
  'Roofing & Exterior': 7, Roofing: 7,
  'Handyman & Structural': 26, Handyman: 26,
  'Garage Door': 13, Locksmith: 8, 'Locksmith & Security': 8,
  Cleaning: 22, 'House Cleaning': 22, 'Outdoor & Landscaping': 15, Landscaping: 15,
  'Pool & Spa': 10, 'Pest Control': 8, Painting: 17, 'Painting & Flooring': 17,
  Remodeling: 12, 'Moving & Hauling': 14, Photography: 9,
};

function B2BProsNearbyBadge({ categoryLabel }: { categoryLabel: string | null }) {
  if (!categoryLabel) return null;
  const count = B2B_PROS_NEARBY[categoryLabel] ?? 12;
  return (
    <div style={{
      padding: '10px 14px', borderRadius: 12,
      background: `linear-gradient(90deg, ${_O_R}14, ${_O_R}06)`,
      border: `1px solid ${_O_R}22`,
      display: 'flex', alignItems: 'center', gap: 10,
    }}>
      <div style={{ position: 'relative', width: 9, height: 9, flexShrink: 0 }}>
        <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: _G_R }} />
        <span style={{ position: 'absolute', inset: -3, borderRadius: '50%', background: _G_R, opacity: .25, animation: 'pulse 2s infinite' }} />
      </div>
      <div style={{ fontSize: 12, color: _D_R, fontWeight: 600, flex: 1, minWidth: 0 }}>
        <span style={{ color: _O_R, fontWeight: 700 }}>{count} {categoryLabel?.toLowerCase()} pros</span>
        <span style={{ color: _DIM_R, fontWeight: 500 }}> near you</span>
      </div>
      <div style={{ fontSize: 9.5, color: _DIM_R, fontFamily: "'DM Mono',monospace", letterSpacing: 1, fontWeight: 700, textTransform: 'uppercase' }}>Live</div>
    </div>
  );
}

function B2BAssuranceCard() {
  // Intentionally pinned to the light-mode dark gradient — this CTA is
  // meant to read as an accent surface on both themes (_D_R resolves via
  // CSS var and can't carry an alpha suffix in the boxShadow, so we use
  // literal hex here).
  return (
    <div style={{
      padding: '14px 16px',
      background: 'linear-gradient(135deg, #2D2926 0%, #3A3430 100%)',
      color: '#fff', borderRadius: 14, fontFamily: "'DM Sans',sans-serif",
      display: 'flex', alignItems: 'center', gap: 12,
      boxShadow: '0 10px 30px -12px rgba(45,41,38,.4)',
    }}>
      <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(255,255,255,.14)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, flexShrink: 0 }}>⚡</div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700 }}>Quotes in ~2 minutes</div>
        <div style={{ fontSize: 11.5, opacity: .75, marginTop: 1 }}>No calling around. No endless forms.</div>
      </div>
    </div>
  );
}
