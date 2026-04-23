/**
 * Home IQ — shared inventory correlation + merging utilities.
 *
 * Originally written as inline helpers inside BusinessChat.tsx to power
 * Property IQ. Extracted here so the consumer quote chat (/quote) can
 * reuse the exact same correlation logic, scoring tiers, and data-source
 * merge strategy. The business surface calls it "Property IQ" (one of
 * many properties), the consumer surface calls it "Home IQ" (their
 * single home) — same mechanics, different label.
 *
 * ┌────────────────────────────────────────────────────────────────────┐
 * │ What these helpers do                                              │
 * ├────────────────────────────────────────────────────────────────────┤
 * │ correlateItemToChat       score an inventory item against chat text│
 * │ inventoryFromPropertyDetails  form data → PropertyInventoryItem[]  │
 * │ mergedInventory           merge scan rows + form rows, dedup       │
 * │ dedupeInventory           collapse duplicates, keep best row       │
 * │ iqCategoryKeyFromLabel    map human label → category-match bucket  │
 * │ iqLabelFor                snake_case itemType → "Title Case"       │
 * └────────────────────────────────────────────────────────────────────┘
 */

import type { PropertyInventoryItem, PropertyDetails } from '@homie/shared';

// ── Category match map ────────────────────────────────────────────────
// Fallback filter used when the chat has NOT yet named a specific item —
// we show equipment that matches the inferred service category so the
// user still sees something contextual.

export const IQ_CATEGORY_MATCH: Record<string, (it: PropertyInventoryItem) => boolean> = {
  plumbing:     it => /plumb|faucet|sink|toilet|shower|bath|drain|pipe/i.test(it.itemType),
  water_heater: it => /water.?heater|tankless/i.test(it.itemType),
  septic_sewer: it => /sewer|septic/i.test(it.itemType),
  electrical:   it => /electric|outlet|breaker|panel|light|wiring/i.test(it.itemType),
  hvac:         it => /hvac|air.?cond|ac(_|\b)|furnace|heat.?pump|thermostat|boiler|mini.?split/i.test(it.itemType),
  appliance:    it => it.category === 'appliance' || /fridge|refrig|washer|dryer|dishwash|oven|range|microwave|stove|disposal/i.test(it.itemType),
  roofing:      it => /roof|gutter|siding|chimney/i.test(it.itemType),
  garage_door:  it => /garage/i.test(it.itemType),
  pool:         it => /pool|spa|hot.?tub/i.test(it.itemType),
  security_systems: it => /alarm|camera|doorbell|security/i.test(it.itemType),
};

export function iqLabelFor(itemType: string): string {
  return itemType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export function iqCategoryKeyFromLabel(label: string | null): keyof typeof IQ_CATEGORY_MATCH | null {
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

// ── Synonym + generic-token tables ────────────────────────────────────
// Used by correlateItemToChat for medium-tier matches. A row fires when
// the inventory item's itemType matches `match` AND the chat text fires
// `signals`.

export const IQ_SYNONYMS: Array<{ match: RegExp; signals: RegExp }> = [
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

/** Tokens that don't uniquely identify any single item — kitchen,
 *  water, main, etc. Filtered out of the itemType word-match pass so
 *  "kitchen_faucet" doesn't correlate against every chat that mentions
 *  "kitchen". */
export const IQ_GENERIC_TOKENS = new Set([
  'main', 'unit', 'room', 'rooms', 'system', 'fixture', 'line', 'new', 'old', 'home', 'house',
  'kitchen', 'bath', 'bathroom', 'bedroom', 'living', 'laundry', 'garage',
  'upstairs', 'downstairs', 'outdoor', 'indoor', 'front', 'back', 'side',
  'water', 'hot', 'cold', 'gas', 'air', 'electric', 'mini', 'heat', 'sub',
]);

export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ── Correlation ───────────────────────────────────────────────────────

export type CorrelationStrength = 'strong' | 'medium' | null;

/** Score an inventory item against the live chat text.
 *   strong : brand or model number appears verbatim in chat
 *   medium : distinctive itemType word OR an unambiguous synonym fires
 *   null   : broad / generic signals — deliberately dropped so a
 *            follow-up question can't widen the card to unrelated items */
export function correlateItemToChat(item: PropertyInventoryItem, chatText: string): CorrelationStrength {
  if (!chatText) return null;

  if (item.brand && item.brand.trim().length >= 2) {
    if (new RegExp(`\\b${escapeRegex(item.brand)}\\b`, 'i').test(chatText)) return 'strong';
  }
  if (item.modelNumber && item.modelNumber.trim().length >= 2) {
    if (new RegExp(escapeRegex(item.modelNumber), 'i').test(chatText)) return 'strong';
  }

  const itemType = (item.itemType || '').toLowerCase();
  const words = itemType.split(/[_\s]/).filter(w => w.length >= 4 && !IQ_GENERIC_TOKENS.has(w));
  for (const w of words) {
    if (new RegExp(`\\b${escapeRegex(w)}\\b`, 'i').test(chatText)) return 'medium';
  }

  for (const syn of IQ_SYNONYMS) {
    if (!syn.match.test(itemType)) continue;
    if (syn.signals.test(chatText)) return 'medium';
  }

  return null;
}

/** Back-compat — returns true for any non-null correlation. */
export function itemCorrelatesWithChat(item: PropertyInventoryItem, chatText: string): boolean {
  return correlateItemToChat(item, chatText) !== null;
}

// ── Form → virtual inventory rows ─────────────────────────────────────
// Turns the saved Equipment & Systems form into PropertyInventoryItem-
// shaped rows so correlation + rendering don't care where the data
// came from.

export function inventoryFromPropertyDetails(
  propertyId: string,
  details: PropertyDetails | null | undefined,
): PropertyInventoryItem[] {
  if (!details) return [];
  const out: PropertyInventoryItem[] = [];
  const now = new Date().toISOString();

  const parseAge = (raw?: string): string | null => {
    if (!raw) return null;
    const m = raw.match(/(\d+(?:\.\d+)?)/);
    return m ? m[1] : null;
  };

  const make = (
    itemType: string,
    category: PropertyInventoryItem['category'],
    bits: {
      brand?: string | null;
      model?: string | null;
      age?: string | null;
      fuel?: string | null;
      capacity?: string | null;
      condition?: string | null;
      notes?: string | null;
    } = {},
  ): PropertyInventoryItem | null => {
    // Skip rows with nothing useful — no brand, no model, no age. Those
    // would just clutter the IQ card.
    if (!bits.brand && !bits.model && !bits.age) return null;
    return {
      id: `details:${propertyId}:${itemType}`,
      propertyId,
      roomId: null,
      scanId: null,
      category,
      itemType,
      brand: bits.brand || null,
      modelNumber: bits.model || null,
      serialNumber: null,
      manufactureDate: null,
      estimatedAgeYears: bits.age || null,
      fuelType: bits.fuel || null,
      capacity: bits.capacity || null,
      condition: bits.condition || null,
      identificationMethod: 'pm_manual',
      confidenceScore: '1.00',
      photoFrameUrl: null,
      labelPhotoUrl: null,
      maintenanceFlags: null,
      notes: bits.notes || null,
      status: 'pm_confirmed',
      confirmedBy: null,
      confirmedAt: now,
      createdAt: now,
      updatedAt: now,
    } as PropertyInventoryItem;
  };

  const push = (it: PropertyInventoryItem | null) => { if (it) out.push(it); };

  if (details.hvac) {
    const h = details.hvac;
    push(make('hvac_ac_unit', 'system', { brand: h.acBrand, model: h.acModel, age: parseAge(h.acAge) }));
    push(make(h.heatingType?.toLowerCase().includes('heat pump') ? 'heat_pump' : 'furnace', 'system', { brand: h.heatingBrand, model: h.heatingModel }));
    push(make('thermostat', 'system', { brand: h.thermostatBrand, model: h.thermostatModel }));
  }
  if (details.waterHeater) {
    const w = details.waterHeater;
    push(make('water_heater', 'system', { brand: w.brand, model: w.model, age: parseAge(w.age), fuel: w.fuel, capacity: w.capacity }));
  }
  if (details.appliances) {
    const a = details.appliances;
    if (a.refrigerator) push(make('refrigerator', 'appliance', { brand: a.refrigerator.brand, model: a.refrigerator.model }));
    if (a.washer)       push(make('washer', 'appliance', { brand: a.washer.brand, model: a.washer.model }));
    if (a.dryer)        push(make('dryer', 'appliance', { brand: a.dryer.brand, model: a.dryer.model, fuel: a.dryer.fuel }));
    if (a.dishwasher)   push(make('dishwasher', 'appliance', { brand: a.dishwasher.brand, model: a.dishwasher.model }));
    if (a.oven)         push(make('oven', 'appliance', { brand: a.oven.brand, model: a.oven.model, fuel: a.oven.fuel }));
    if (a.disposal)     push(make('garbage_disposal', 'appliance', { brand: a.disposal.brand }));
    if (a.microwave)    push(make('microwave', 'appliance', { brand: a.microwave.brand, notes: a.microwave.type ?? null }));
  }
  if (details.plumbing) {
    const p = details.plumbing;
    push(make('kitchen_faucet', 'fixture', { brand: p.kitchenFaucetBrand }));
    push(make('bathroom_faucet', 'fixture', { brand: p.bathroomFaucetBrand }));
    push(make('toilet', 'fixture', { brand: p.toiletBrand }));
    push(make('water_softener', 'system', { brand: p.waterSoftener }));
  }
  if (details.electrical) {
    const e = details.electrical;
    if (e.hasGenerator && e.generatorType) push(make('generator', 'system', { brand: e.generatorType }));
    if (e.hasSolar && e.solarSystem)       push(make('solar', 'system', { brand: e.solarSystem }));
    if (e.hasEvCharger && e.evChargerBrand) push(make('ev_charger', 'system', { brand: e.evChargerBrand }));
  }
  if (details.poolSpa) {
    const ps = details.poolSpa;
    push(make('pool_heater', 'amenity', { brand: ps.poolHeaterBrand }));
    push(make('pool_pump', 'amenity', { brand: ps.poolPumpBrand }));
    push(make('hot_tub', 'amenity', { brand: ps.hotTubBrand, model: ps.hotTubModel }));
  }
  if (details.exterior) {
    const ex = details.exterior;
    push(make('garage_door_opener', 'system', { brand: ex.garageDoorBrand }));
    push(make('irrigation_controller', 'system', { brand: ex.irrigationBrand }));
  }
  return out;
}

// ── Merge + dedupe ────────────────────────────────────────────────────
// Scan rows win on condition/status tiebreak — they carry photo + assessment
// evidence the form doesn't. Pass scan rows FIRST so they take precedence
// in dedupeInventory.

export function mergedInventory(
  scanRows: PropertyInventoryItem[],
  formRows: PropertyInventoryItem[],
): PropertyInventoryItem[] {
  return dedupeInventory([...scanRows, ...formRows]);
}

export function dedupeInventory(items: PropertyInventoryItem[]): PropertyInventoryItem[] {
  const conditionRank: Record<string, number> = {
    new: 0, good: 1, fair: 2, aging: 3, needs_attention: 4, end_of_life: 5,
  };
  const statusRank: Record<string, number> = {
    pm_confirmed: 0, pm_corrected: 1, ai_identified: 2, pm_dismissed: 99,
  };
  const keyFor = (it: PropertyInventoryItem) =>
    `${(it.itemType || '').toLowerCase()}|${(it.brand || '').toLowerCase()}|${(it.modelNumber || '').toLowerCase()}`;

  const best = new Map<string, PropertyInventoryItem>();
  for (const it of items) {
    const k = keyFor(it);
    const existing = best.get(k);
    if (!existing) { best.set(k, it); continue; }
    const curCondR = conditionRank[it.condition ?? ''] ?? 99;
    const exCondR = conditionRank[existing.condition ?? ''] ?? 99;
    if (curCondR !== exCondR) {
      if (curCondR < exCondR) best.set(k, it);
      continue;
    }
    const curStatusR = statusRank[it.status ?? ''] ?? 10;
    const exStatusR = statusRank[existing.status ?? ''] ?? 10;
    if (curStatusR !== exStatusR) {
      if (curStatusR < exStatusR) best.set(k, it);
      continue;
    }
    const curTime = it.updatedAt ? new Date(it.updatedAt).getTime() : 0;
    const exTime = existing.updatedAt ? new Date(existing.updatedAt).getTime() : 0;
    if (curTime > exTime) best.set(k, it);
  }
  return Array.from(best.values());
}
