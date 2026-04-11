import Anthropic from '@anthropic-ai/sdk';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import {
  propertyScans,
  propertyRooms,
  propertyInventoryItems,
  type NewPropertyInventoryItem,
  type PropertyInventoryItem,
} from '../db/schema/property-scans';
import { decodeSerial, ageFromDate } from './serial-decoder';
import logger from '../logger';

/* ── Per-room target lists ────────────────────────────────────────────── */

/**
 * Item types we expect to find in each room. Used by the AI coach to guide
 * PMs through a thorough walkthrough and to compute per-room capture progress.
 * Only types from the vision schema are referenced.
 */
export const ROOM_TARGETS: Record<string, string[]> = {
  kitchen: ['refrigerator', 'range', 'dishwasher', 'microwave', 'faucet', 'garbage_disposal'],
  dining_room: ['light_fixture', 'ceiling_fan'],
  living_room: ['ceiling_fan', 'light_fixture', 'fireplace', 'thermostat', 'smoke_detector'],
  master_bedroom: ['ceiling_fan', 'light_fixture', 'smoke_detector'],
  bedroom: ['ceiling_fan', 'light_fixture', 'smoke_detector'],
  master_bathroom: ['toilet', 'shower', 'faucet', 'light_fixture'],
  bathroom: ['toilet', 'shower', 'faucet', 'light_fixture'],
  half_bathroom: ['toilet', 'faucet'],
  laundry: ['washer', 'dryer'],
  mechanical_room: ['water_heater', 'hvac_air_handler', 'electrical_panel', 'water_softener'],
  garage: ['garage_door', 'ev_charger', 'water_meter', 'water_heater'],
  office: ['ceiling_fan', 'light_fixture', 'smoke_detector'],
  hallway: ['smoke_detector', 'co_detector', 'thermostat', 'fire_extinguisher'],
  patio: ['ceiling_fan', 'gas_grill', 'fireplace'],
  pool_area: ['pool', 'pool_heater', 'pool_pump', 'hot_tub'],
  exterior_front: ['hvac_condenser', 'gas_meter', 'irrigation_controller'],
  exterior_back: ['hvac_condenser', 'gas_meter'],
  other: [],
};

function targetsForRoom(roomType: string): string[] {
  return ROOM_TARGETS[roomType] ?? [];
}

function prettify(itemType: string): string {
  return itemType.replace(/_/g, ' ');
}

/* ── Dedup helpers ─────────────────────────────────────────────────────── */

/** Item types that are typically unique within a single room.
 *  When we already have one of these in a room, a new detection of the
 *  same type in the same room is treated as a duplicate. */
const UNIQUE_PER_ROOM = new Set<string>([
  'water_heater', 'hvac_condenser', 'hvac_air_handler', 'electrical_panel',
  'thermostat', 'refrigerator', 'range', 'dishwasher', 'microwave',
  'washer', 'dryer', 'garbage_disposal', 'water_softener',
  'pool', 'pool_heater', 'pool_pump', 'hot_tub',
  'gas_meter', 'water_meter', 'irrigation_controller',
  'gas_grill', 'fireplace', 'fire_extinguisher', 'co_detector',
  'generator', 'solar_system', 'ev_charger', 'garage_door',
]);

function norm(s: string | null | undefined): string {
  return (s || '').trim().toLowerCase();
}

/**
 * Find an existing inventory item that the newly detected one is a duplicate of.
 * Match strategy (in order):
 *  1. Exact brand+model match anywhere in the property — strong signal
 *  2. Same type + same brand in the same room
 *  3. Unique-per-room types: same type in the same room (no brand needed)
 */
function findDuplicate(
  detected: { itemType: string; brand: string | null | undefined; modelNumber: string | null | undefined },
  existing: PropertyInventoryItem[],
  currentRoomId: string,
): PropertyInventoryItem | null {
  const dType = norm(detected.itemType);
  const dBrand = norm(detected.brand);
  const dModel = norm(detected.modelNumber);

  if (dBrand && dModel) {
    const m = existing.find(e =>
      norm(e.itemType) === dType &&
      norm(e.brand) === dBrand &&
      norm(e.modelNumber) === dModel
    );
    if (m) return m;
  }

  if (dBrand) {
    const m = existing.find(e =>
      norm(e.itemType) === dType &&
      norm(e.brand) === dBrand &&
      e.roomId === currentRoomId
    );
    if (m) return m;
  }

  if (UNIQUE_PER_ROOM.has(dType)) {
    const m = existing.find(e =>
      norm(e.itemType) === dType &&
      e.roomId === currentRoomId
    );
    if (m) return m;
  }

  return null;
}

const MODEL = 'claude-sonnet-4-6';
const MAX_TOKENS = 2500;

/* ── Types ───────────────────────────────────────────────────────────────── */

export interface ScanProcessRequest {
  scanId: string;
  imageBase64: string;
  imageMediaType: 'image/jpeg' | 'image/png' | 'image/webp';
  roomHint?: string;
  isLabelPhoto?: boolean;
  notes?: string;
}

interface VisionItem {
  category: 'appliance' | 'fixture' | 'system' | 'safety' | 'amenity' | 'infrastructure';
  item_type: string;
  brand?: string | null;
  brand_source?: 'label_ocr' | 'visual_classification';
  model_number?: string | null;
  serial_number?: string | null;
  fuel_type?: string | null;
  capacity?: string | null;
  condition?: 'new' | 'good' | 'fair' | 'aging' | 'needs_attention' | 'end_of_life' | null;
  confidence: number;
  notes?: string | null;
}

interface VisionResponse {
  room_type: string;
  room_label?: string | null;
  flooring?: string | null;
  general_condition?: string | null;
  items: VisionItem[];
  maintenance_flags?: { description: string; severity: 'info' | 'attention' | 'urgent' }[];
}

export interface ScanProcessResult {
  roomId: string;
  roomType: string;
  itemsDetected: Array<{
    id: string;
    itemType: string;
    brand: string | null;
    modelNumber: string | null;
    confidence: number;
    status: string;
  }>;
  maintenanceFlags: { description: string; severity: string }[];
}

/* ── Vision prompt ───────────────────────────────────────────────────────── */

const SYSTEM_PROMPT = `You are an expert property inspector for a vacation-rental management platform.
Your job is to identify appliances, systems, fixtures, and safety devices visible in a single photo from a property walkthrough.

Rules:
- Focus ONLY on permanently installed items: appliances, plumbing fixtures, HVAC components, electrical equipment, safety devices, pools/spas/grills.
- IGNORE furniture, decor, food, personal items, plants, art.
- For each item, provide a confidence score 0.0-1.0:
  * 0.95-0.99 if you can read a brand/model label clearly
  * 0.80-0.92 if you recognize the brand visually but can't read a label
  * 0.65-0.80 if you can identify the item type but not the brand
  * 0.40-0.65 if you're guessing
- If you can read a model number or serial number from a label, include it verbatim. Do NOT make up model numbers.
- Categories: appliance (refrigerator, range, dishwasher, microwave, washer, dryer), fixture (faucet, toilet, shower, sink, ceiling fan, light fixture), system (water heater, HVAC, electrical panel, thermostat, generator, solar system, EV charger, water softener), safety (smoke detector, CO detector, fire extinguisher), amenity (pool, pool heater, pool pump, hot tub, grill, fireplace), infrastructure (gas meter, water meter, irrigation controller, garage door).
- Return ONLY valid JSON. No markdown code fences, no commentary.`;

function buildUserPrompt(roomHint?: string, isLabelPhoto?: boolean): string {
  let prompt = 'Analyze this property walkthrough photo and return a JSON object with the schema below.\n\n';
  if (roomHint) {
    prompt += `Hint: the photographer says this is the ${roomHint}.\n\n`;
  }
  if (isLabelPhoto) {
    prompt += 'This is a close-up of an equipment label/nameplate. Read the brand, model number, and serial number verbatim. Set confidence high (0.92+) for any text you can clearly read.\n\n';
  }
  prompt += `Schema:
{
  "room_type": "kitchen | living_room | dining_room | master_bedroom | bedroom | master_bathroom | bathroom | half_bathroom | laundry | garage | office | hallway | entryway | closet | pantry | attic | basement | crawl_space | mechanical_room | patio | deck | pool_area | yard | exterior_front | exterior_back | exterior_side | other",
  "room_label": "optional friendly name like 'Master bedroom'",
  "flooring": "hardwood | tile | carpet | vinyl | laminate | concrete | stone | null",
  "general_condition": "excellent | good | fair | needs_attention | null",
  "items": [
    {
      "category": "appliance | fixture | system | safety | amenity | infrastructure",
      "item_type": "refrigerator | range | dishwasher | microwave | washer | dryer | water_heater | hvac_condenser | hvac_air_handler | electrical_panel | thermostat | generator | solar_system | ev_charger | water_softener | faucet | toilet | shower | sink | ceiling_fan | light_fixture | smoke_detector | co_detector | fire_extinguisher | pool | pool_heater | pool_pump | hot_tub | gas_grill | fireplace | gas_meter | water_meter | irrigation_controller | garage_door | garbage_disposal | other",
      "brand": "Samsung | null",
      "brand_source": "label_ocr | visual_classification",
      "model_number": "RF28R7351SR | null",
      "serial_number": "string | null",
      "fuel_type": "gas | electric | heat_pump | propane | solar | wood | null",
      "capacity": "50 gallon | 3 ton | 200 amp | null",
      "condition": "new | good | fair | aging | needs_attention | null",
      "confidence": 0.92,
      "notes": "optional short description"
    }
  ],
  "maintenance_flags": [
    { "description": "Visible water staining around water heater base", "severity": "attention" }
  ]
}

Return JSON only.`;
  return prompt;
}

/* ── Claude vision call ──────────────────────────────────────────────────── */

async function analyzeImage(req: ScanProcessRequest): Promise<VisionResponse | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    logger.warn('[scan-processor] ANTHROPIC_API_KEY not set — returning empty result');
    return null;
  }

  const client = new Anthropic({ apiKey });

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: req.imageMediaType, data: req.imageBase64 },
          },
          { type: 'text', text: buildUserPrompt(req.roomHint, req.isLabelPhoto) },
        ],
      }],
    });

    const textBlock = response.content.find(b => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') return null;

    let raw = textBlock.text.trim();
    // Strip markdown code fences if Claude included them
    raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();

    try {
      return JSON.parse(raw) as VisionResponse;
    } catch (parseErr) {
      logger.warn({ err: parseErr, sample: raw.slice(0, 200) }, '[scan-processor] failed to parse Claude JSON');
      return null;
    }
  } catch (err) {
    logger.error({ err }, '[scan-processor] Claude API call failed');
    return null;
  }
}

/* ── Persistence ─────────────────────────────────────────────────────────── */

async function getOrCreateRoom(propertyId: string, scanId: string, roomType: string, roomLabel: string, flooring: string | null, condition: string | null): Promise<string> {
  // Look for an existing room for this scan with the same type
  const [existing] = await db
    .select({ id: propertyRooms.id })
    .from(propertyRooms)
    .where(eq(propertyRooms.scanId, scanId))
    .limit(1);
  // For simplicity in v1 we create a new room per scan-photo if none exists for this scan/type
  // (proper dedup happens via scanId+roomType uniqueness in a future iteration)
  const matching = await db
    .select({ id: propertyRooms.id, roomType: propertyRooms.roomType })
    .from(propertyRooms)
    .where(eq(propertyRooms.scanId, scanId));

  for (const r of matching) {
    if (r.roomType === roomType) return r.id;
  }

  const [inserted] = await db.insert(propertyRooms).values({
    propertyId,
    scanId,
    roomType,
    roomLabel: roomLabel || roomType.replace(/_/g, ' '),
    flooringType: flooring,
    generalCondition: condition,
  }).returning({ id: propertyRooms.id });

  return inserted.id;
}

/**
 * Process a single uploaded photo through Claude vision and persist any
 * detected items to property_inventory_items.
 */
export async function processScanPhoto(req: ScanProcessRequest): Promise<ScanProcessResult> {
  // Verify scan exists
  const [scan] = await db.select().from(propertyScans).where(eq(propertyScans.id, req.scanId)).limit(1);
  if (!scan) throw new Error('Scan not found');

  // Run vision analysis
  const vision = await analyzeImage(req);
  if (!vision) {
    return {
      roomId: '',
      roomType: req.roomHint || 'other',
      itemsDetected: [],
      maintenanceFlags: [],
    };
  }

  const roomType = vision.room_type || req.roomHint || 'other';
  const roomId = await getOrCreateRoom(
    scan.propertyId,
    req.scanId,
    roomType,
    vision.room_label || roomType.replace(/_/g, ' '),
    vision.flooring ?? null,
    vision.general_condition ?? null,
  );

  // Load existing inventory once for this property so we can dedup against it
  // (and against items we just inserted in this same batch).
  const existingItems: PropertyInventoryItem[] = await db
    .select()
    .from(propertyInventoryItems)
    .where(eq(propertyInventoryItems.propertyId, scan.propertyId));

  const itemsDetected: ScanProcessResult['itemsDetected'] = [];
  for (const item of vision.items || []) {
    // Decode serial to manufacture date if we got one
    const decoded = decodeSerial(item.brand, item.serial_number);
    const ageYears = decoded ? ageFromDate(decoded.manufactureDate) : null;

    // Compute final confidence — boost if serial decode succeeded
    let confidence = Math.min(0.99, Math.max(0.1, item.confidence ?? 0.5));
    if (decoded && decoded.confidence > confidence) confidence = decoded.confidence;

    const status = 'ai_identified';
    const identMethod: 'label_ocr' | 'visual_classification' =
      item.brand_source === 'label_ocr' || decoded ? 'label_ocr' : 'visual_classification';

    const maintenanceFlags: string[] = [];
    if (ageYears !== null) {
      // Rough end-of-life thresholds by category
      const eolByType: Record<string, number> = {
        water_heater: 10,
        hvac_condenser: 15,
        hvac_air_handler: 15,
        dishwasher: 9,
        refrigerator: 13,
        washer: 11,
        dryer: 13,
        garbage_disposal: 12,
        pool_heater: 10,
        pool_pump: 10,
      };
      const threshold = eolByType[item.item_type];
      if (threshold && ageYears >= threshold - 1) {
        maintenanceFlags.push('approaching_end_of_life');
      }
    }

    // ── Dedup check ──
    const dup = findDuplicate(
      { itemType: item.item_type, brand: item.brand, modelNumber: item.model_number },
      existingItems,
      roomId,
    );

    if (dup) {
      // Don't resurrect items the PM has explicitly dismissed
      if (dup.status === 'pm_dismissed') continue;

      // Enrich the existing item with any new info we now have. Only fill
      // empty fields — don't overwrite PM-confirmed data.
      const updates: Record<string, unknown> = {};
      if (item.brand && !dup.brand) updates.brand = item.brand;
      if (item.model_number && !dup.modelNumber) updates.modelNumber = item.model_number;
      if (item.serial_number && !dup.serialNumber) updates.serialNumber = item.serial_number;
      if (decoded && !dup.manufactureDate) {
        updates.manufactureDate = decoded.manufactureDate.toISOString().slice(0, 10);
        if (ageYears !== null) updates.estimatedAgeYears = ageYears.toString();
      }
      if (item.fuel_type && !dup.fuelType) updates.fuelType = item.fuel_type;
      if (item.capacity && !dup.capacity) updates.capacity = item.capacity;
      if (item.condition && !dup.condition) updates.condition = item.condition;

      // Boost confidence if the new detection is meaningfully higher
      const dupConf = parseFloat(dup.confidenceScore);
      if (confidence > dupConf + 0.05) updates.confidenceScore = confidence.toFixed(2);

      // Upgrade identification method if we now have a label OCR or serial decode
      if ((item.brand_source === 'label_ocr' || decoded) && dup.identificationMethod === 'visual_classification') {
        updates.identificationMethod = 'label_ocr';
      }

      // New maintenance flags can be appended
      if (maintenanceFlags.length > 0) {
        const existingFlags = new Set(dup.maintenanceFlags ?? []);
        for (const f of maintenanceFlags) existingFlags.add(f);
        if (existingFlags.size !== (dup.maintenanceFlags?.length ?? 0)) {
          updates.maintenanceFlags = Array.from(existingFlags);
        }
      }

      if (Object.keys(updates).length > 0) {
        updates.updatedAt = new Date();
        const [updated] = await db.update(propertyInventoryItems)
          .set(updates)
          .where(eq(propertyInventoryItems.id, dup.id))
          .returning();
        // Keep local cache in sync so subsequent items in this batch see the update
        const idx = existingItems.findIndex(e => e.id === dup.id);
        if (idx >= 0 && updated) existingItems[idx] = updated;
      }

      // Don't add to itemsDetected — this isn't a new find
      continue;
    }

    const newItem: NewPropertyInventoryItem = {
      propertyId: scan.propertyId,
      roomId,
      scanId: req.scanId,
      category: item.category,
      itemType: item.item_type,
      brand: item.brand ?? null,
      modelNumber: item.model_number ?? null,
      serialNumber: item.serial_number ?? null,
      manufactureDate: decoded ? decoded.manufactureDate.toISOString().slice(0, 10) : null,
      estimatedAgeYears: ageYears !== null ? ageYears.toString() : null,
      fuelType: item.fuel_type ?? null,
      capacity: item.capacity ?? null,
      condition: item.condition ?? null,
      identificationMethod: identMethod,
      confidenceScore: confidence.toFixed(2),
      maintenanceFlags: maintenanceFlags.length > 0 ? maintenanceFlags : null,
      notes: item.notes ?? null,
      status,
    };

    const [inserted] = await db.insert(propertyInventoryItems).values(newItem).returning();
    itemsDetected.push({
      id: inserted.id,
      itemType: item.item_type,
      brand: item.brand ?? null,
      modelNumber: item.model_number ?? null,
      confidence,
      status,
    });
    // Add to local cache so a later item in this same batch can dedup against it
    existingItems.push(inserted);
  }

  // Bump scan stats — only count newly inserted items, not updates/dedups
  const newCount = scan.itemsCataloged + itemsDetected.length;
  const newFlagged = scan.itemsFlaggedForReview + itemsDetected.filter(i => i.confidence < 0.85).length;
  await db.update(propertyScans)
    .set({
      itemsCataloged: newCount,
      itemsFlaggedForReview: newFlagged,
      status: 'in_progress',
    })
    .where(eq(propertyScans.id, req.scanId));

  return {
    roomId,
    roomType,
    itemsDetected,
    maintenanceFlags: vision.maintenance_flags ?? [],
  };
}

export interface RoomProgress {
  roomType: string;
  expected: string[];
  captured: string[];
  remaining: string[];
}

export interface CoachingResult {
  message: string;
  roomProgress: RoomProgress;
}

/**
 * Generate a short coaching message for the PM during a live walkthrough,
 * based on what the AI just found and what's still missing. Uses per-room
 * target lists to give specific guidance on what to capture next.
 */
export async function generateCoachingMessage(args: {
  scanId: string;
  currentRoom: string;
  lastDetectedItems: Array<{ itemType: string; brand: string | null; confidence: number }>;
  totalItemsSoFar: number;
  roomsScanned: string[];
}): Promise<CoachingResult> {
  // Look up which target items have already been captured in this room for this scan.
  const expected = targetsForRoom(args.currentRoom);
  let captured: string[] = [];
  try {
    // Find the room rows for this scan with the matching room type
    const roomRows = await db
      .select({ id: propertyRooms.id })
      .from(propertyRooms)
      .where(eq(propertyRooms.scanId, args.scanId));
    const matchingRoomIds = roomRows.map(r => r.id);

    if (matchingRoomIds.length > 0) {
      const items = await db
        .select({ itemType: propertyInventoryItems.itemType, roomId: propertyInventoryItems.roomId })
        .from(propertyInventoryItems)
        .where(eq(propertyInventoryItems.scanId, args.scanId));
      // Only count items in rooms that share the current room's type
      const inRoom = items.filter(it => it.roomId && matchingRoomIds.includes(it.roomId));
      const seen = new Set<string>();
      for (const it of inRoom) {
        if (expected.includes(it.itemType)) seen.add(it.itemType);
      }
      // Also include items from the just-detected batch (they may not be persisted yet)
      for (const d of args.lastDetectedItems) {
        if (expected.includes(d.itemType)) seen.add(d.itemType);
      }
      captured = Array.from(seen);
    } else {
      // No room row yet — fall back to last-detected only
      captured = args.lastDetectedItems
        .map(d => d.itemType)
        .filter(t => expected.includes(t));
    }
  } catch (err) {
    logger.warn({ err }, '[scan-processor] failed to compute room progress');
  }

  const remaining = expected.filter(t => !captured.includes(t));
  const roomProgress: RoomProgress = {
    roomType: args.currentRoom,
    expected,
    captured,
    remaining,
  };

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { message: defaultCoaching(args, roomProgress), roomProgress };
  }

  try {
    const client = new Anthropic({ apiKey });
    const lastItemsLine = args.lastDetectedItems.length > 0
      ? args.lastDetectedItems.map(i => `${i.brand ? i.brand + ' ' : ''}${prettify(i.itemType)}${i.confidence < 0.85 ? ' (needs label)' : ''}`).join(', ')
      : 'nothing yet';

    const checklistLine = expected.length > 0
      ? `\n- Expected items in this room: ${expected.map(prettify).join(', ')}\n- Captured so far: ${captured.length > 0 ? captured.map(prettify).join(', ') : 'none'}\n- Still missing: ${remaining.length > 0 ? remaining.map(prettify).join(', ') : 'none — room is complete!'}`
      : '';

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 160,
      system: `You are a friendly AI property inspector coaching a property manager through a phone-camera walkthrough. Keep responses to 1-2 short sentences, conversational, encouraging, and actionable. Never use technical jargon. Refer to yourself as "I" and the user informally. When you have a checklist of expected items, prioritize asking for the next missing one.`,
      messages: [{
        role: 'user',
        content: `Walkthrough state:
- Currently in: ${prettify(args.currentRoom)}
- Just detected in this photo: ${lastItemsLine}
- Total items found so far: ${args.totalItemsSoFar}
- Rooms scanned: ${args.roomsScanned.join(', ') || 'none'}${checklistLine}

What's the next ONE specific thing I should ask them to capture?
- If something I just detected has low confidence, ask for a close-up of the label.
- Otherwise, if there are still missing items in the checklist, ask for the most important one (water heater > electrical panel > major appliances > fixtures > safety devices).
- If the room is complete, congratulate briefly and suggest moving on.
Keep it to 1-2 sentences max, conversational.`,
      }],
    });

    const block = response.content.find(b => b.type === 'text');
    if (block && block.type === 'text') {
      return { message: block.text.trim(), roomProgress };
    }
  } catch (err) {
    logger.warn({ err }, '[scan-processor] coaching generation failed');
  }

  return { message: defaultCoaching(args, roomProgress), roomProgress };
}

function defaultCoaching(
  args: { currentRoom: string; lastDetectedItems: Array<{ itemType: string; brand: string | null; confidence: number }>; totalItemsSoFar: number },
  progress: RoomProgress,
): string {
  const lowConf = args.lastDetectedItems.find(i => i.confidence < 0.85);
  if (lowConf) {
    return `I spotted a ${prettify(lowConf.itemType)} but I can't quite read the label. Can you get a close-up of the brand/model sticker?`;
  }
  // If there's a checklist with remaining items, prompt for the next one
  if (progress.remaining.length > 0) {
    const next = progress.remaining[0];
    return `Nice. Next in the ${prettify(args.currentRoom)}: try to capture the ${prettify(next)}.`;
  }
  if (progress.expected.length > 0 && progress.remaining.length === 0) {
    return `${prettify(args.currentRoom)} looks complete. Tap "Next" to move on when you're ready.`;
  }
  if (args.lastDetectedItems.length > 0) {
    const last = args.lastDetectedItems[args.lastDetectedItems.length - 1];
    return `Got it — ${last.brand || ''} ${prettify(last.itemType)}. Keep going, or move to the next room when you're ready.`;
  }
  return `I'm ready when you are. Walk me through the ${prettify(args.currentRoom)} and capture any appliances, fixtures, or systems you see.`;
}

/**
 * Compare the items detected in a new photo against an existing inventory
 * for a quick-scan change detection. Returns a list of changes.
 */
export async function detectChanges(args: {
  scanId: string;
  propertyId: string;
  detectedItems: Array<{ itemType: string; brand: string | null; modelNumber: string | null }>;
  roomType: string;
}): Promise<Array<{ changeType: string; description: string; severity: string }>> {
  const { propertyInventoryItems } = await import('../db/schema/property-scans');
  const { eq, and } = await import('drizzle-orm');

  const existingItems = await db
    .select()
    .from(propertyInventoryItems)
    .where(and(
      eq(propertyInventoryItems.propertyId, args.propertyId),
    ));

  const changes: Array<{ changeType: string; description: string; severity: string }> = [];

  for (const detected of args.detectedItems) {
    // Match by item_type + (brand if known)
    const match = existingItems.find(e =>
      e.itemType === detected.itemType &&
      (detected.brand ? e.brand?.toLowerCase() === detected.brand.toLowerCase() : true),
    );

    if (!match) {
      changes.push({
        changeType: 'item_added',
        description: `New ${detected.itemType.replace(/_/g, ' ')}${detected.brand ? ` (${detected.brand}${detected.modelNumber ? ' ' + detected.modelNumber : ''})` : ''} detected in ${args.roomType.replace(/_/g, ' ')}`,
        severity: 'attention',
      });
    } else if (detected.modelNumber && match.modelNumber && detected.modelNumber !== match.modelNumber) {
      changes.push({
        changeType: 'item_modified',
        description: `${detected.itemType.replace(/_/g, ' ')} model changed: was ${match.modelNumber}, now ${detected.modelNumber}`,
        severity: 'attention',
      });
    }
  }
  return changes;
}

/**
 * Mark a scan as complete and compute final summary stats. Also pushes
 * scan-derived equipment data into the property settings JSONB (filling
 * empty fields only).
 */
export async function completeScan(scanId: string): Promise<{ settingsUpdatedPaths: string[] }> {
  const [scan] = await db.select().from(propertyScans).where(eq(propertyScans.id, scanId)).limit(1);
  if (!scan) throw new Error('Scan not found');

  // Count rooms
  const rooms = await db.select({ id: propertyRooms.id }).from(propertyRooms).where(eq(propertyRooms.scanId, scanId));

  await db.update(propertyScans)
    .set({
      roomsScanned: rooms.length,
      status: 'review_pending',
      completedAt: new Date(),
      durationSeconds: scan.createdAt ? Math.round((Date.now() - scan.createdAt.getTime()) / 1000) : null,
    })
    .where(eq(propertyScans.id, scanId));

  // Push scan results into property.details (Equipment & Systems settings).
  // This is best-effort — failures are logged but won't break scan completion.
  const { applyScanToPropertySettings } = await import('./scan-to-settings-mapper');
  const settingsUpdatedPaths = await applyScanToPropertySettings(scan.propertyId);

  return { settingsUpdatedPaths };
}
