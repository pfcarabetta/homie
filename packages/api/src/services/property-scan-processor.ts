import Anthropic from '@anthropic-ai/sdk';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import {
  propertyScans,
  propertyRooms,
  propertyInventoryItems,
  type NewPropertyInventoryItem,
} from '../db/schema/property-scans';
import { decodeSerial, ageFromDate } from './serial-decoder';
import logger from '../logger';

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
- Categories: appliance (refrigerator, range, dishwasher, microwave, washer, dryer), fixture (faucet, toilet, shower, sink, ceiling fan, light fixture), system (water heater, HVAC, electrical panel, thermostat), safety (smoke detector, CO detector, fire extinguisher), amenity (pool, hot tub, grill, fireplace), infrastructure (gas meter, water meter, irrigation controller).
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
      "item_type": "refrigerator | range | dishwasher | microwave | washer | dryer | water_heater | hvac_condenser | hvac_air_handler | electrical_panel | thermostat | faucet | toilet | shower | sink | ceiling_fan | light_fixture | smoke_detector | co_detector | fire_extinguisher | pool | hot_tub | gas_grill | fireplace | gas_meter | water_meter | irrigation_controller | garbage_disposal | other",
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

  // Insert items
  const itemsDetected: ScanProcessResult['itemsDetected'] = [];
  for (const item of vision.items || []) {
    // Decode serial to manufacture date if we got one
    const decoded = decodeSerial(item.brand, item.serial_number);
    const ageYears = decoded ? ageFromDate(decoded.manufactureDate) : null;

    // Compute final confidence — boost if serial decode succeeded
    let confidence = Math.min(0.99, Math.max(0.1, item.confidence ?? 0.5));
    if (decoded && decoded.confidence > confidence) confidence = decoded.confidence;

    const status = confidence >= 0.85 ? 'ai_identified' : 'ai_identified';
    const identMethod: 'label_ocr' | 'visual_classification' =
      item.brand_source === 'label_ocr' || decoded ? 'label_ocr' : 'visual_classification';

    const maintenanceFlags: string[] = [];
    if (ageYears !== null && ageYears >= 9 && /water[ _-]?heater/i.test(item.item_type)) {
      maintenanceFlags.push('approaching_end_of_life');
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

    const [inserted] = await db.insert(propertyInventoryItems).values(newItem).returning({ id: propertyInventoryItems.id });
    itemsDetected.push({
      id: inserted.id,
      itemType: item.item_type,
      brand: item.brand ?? null,
      modelNumber: item.model_number ?? null,
      confidence,
      status,
    });
  }

  // Bump scan stats
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

/**
 * Mark a scan as complete and compute final summary stats.
 */
export async function completeScan(scanId: string): Promise<void> {
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
}
