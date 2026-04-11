import { eq } from 'drizzle-orm';
import { db } from '../db';
import { properties, type PropertyDetails } from '../db/schema/properties';
import {
  propertyInventoryItems,
  propertyRooms,
  type PropertyInventoryItem,
  type PropertyRoom,
} from '../db/schema/property-scans';
import logger from '../logger';

/* ── Helpers ─────────────────────────────────────────────────────────────── */

function fmtAge(years: string | null | undefined): string | undefined {
  if (!years) return undefined;
  const n = parseFloat(years);
  if (isNaN(n)) return undefined;
  const rounded = Math.round(n);
  return `${rounded} year${rounded === 1 ? '' : 's'}`;
}

function capitalize(s: string | null | undefined): string | undefined {
  if (!s) return undefined;
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ');
}

/** Pick the best item for a slot: prefer pm_confirmed, then highest confidence. */
function pickBest(items: PropertyInventoryItem[]): PropertyInventoryItem | undefined {
  if (items.length === 0) return undefined;
  const rank = (s: string) => (s === 'pm_confirmed' ? 2 : s === 'ai_identified' || s === 'pm_corrected' ? 1 : 0);
  return [...items].sort((a, b) => {
    const r = rank(b.status) - rank(a.status);
    if (r !== 0) return r;
    return parseFloat(b.confidenceScore) - parseFloat(a.confidenceScore);
  })[0];
}

function roomLocation(room: PropertyRoom | undefined): string | undefined {
  if (!room) return undefined;
  return room.roomLabel || room.roomType.replace(/_/g, ' ');
}

/* ── Build patch from inventory ──────────────────────────────────────────── */

/**
 * Build a partial PropertyDetails patch from a property's scan inventory.
 * Only fields the scan can fill are populated; everything else is left
 * undefined so the merge step won't overwrite PM-entered data.
 */
export function buildSettingsPatchFromInventory(
  items: PropertyInventoryItem[],
  rooms: PropertyRoom[],
): Partial<PropertyDetails> {
  const roomById = new Map(rooms.map(r => [r.id, r]));

  // Group active items by itemType
  const byType = new Map<string, PropertyInventoryItem[]>();
  for (const it of items) {
    if (it.status === 'pm_dismissed') continue;
    const list = byType.get(it.itemType) || [];
    list.push(it);
    byType.set(it.itemType, list);
  }
  const first = (type: string) => pickBest(byType.get(type) || []);

  const patch: Partial<PropertyDetails> = {};

  // ── HVAC ──
  const condenser = first('hvac_condenser');
  const airHandler = first('hvac_air_handler');
  const thermostat = first('thermostat');
  const hvacUnit = condenser || airHandler;
  const hvac: NonNullable<PropertyDetails['hvac']> = {};
  if (hvacUnit?.brand) hvac.acBrand = hvacUnit.brand;
  if (hvacUnit?.modelNumber) hvac.acModel = hvacUnit.modelNumber;
  const hvacAge = fmtAge(hvacUnit?.estimatedAgeYears);
  if (hvacAge) hvac.acAge = hvacAge;
  if (hvacUnit?.fuelType === 'heat_pump') hvac.acType = 'Heat pump';
  if (airHandler?.brand) hvac.heatingBrand = airHandler.brand;
  if (airHandler?.modelNumber) hvac.heatingModel = airHandler.modelNumber;
  if (airHandler?.fuelType) {
    const ft = airHandler.fuelType;
    const heatingType =
      ft === 'gas' ? 'Gas furnace'
      : ft === 'electric' ? 'Electric'
      : ft === 'heat_pump' ? 'Heat pump'
      : ft === 'propane' ? 'Propane'
      : undefined;
    if (heatingType) hvac.heatingType = heatingType;
  }
  if (thermostat?.brand) hvac.thermostatBrand = thermostat.brand;
  if (thermostat?.modelNumber) hvac.thermostatModel = thermostat.modelNumber;
  if (Object.keys(hvac).length > 0) patch.hvac = hvac;

  // ── Water heater ──
  const wh = first('water_heater');
  if (wh) {
    const waterHeater: NonNullable<PropertyDetails['waterHeater']> = {};
    if (wh.brand) waterHeater.brand = wh.brand;
    if (wh.modelNumber) waterHeater.model = wh.modelNumber;
    const whAge = fmtAge(wh.estimatedAgeYears);
    if (whAge) waterHeater.age = whAge;
    const fuel = capitalize(wh.fuelType);
    if (fuel) waterHeater.fuel = fuel;
    if (wh.capacity) waterHeater.capacity = wh.capacity;
    const loc = roomLocation(wh.roomId ? roomById.get(wh.roomId) : undefined);
    if (loc) waterHeater.location = loc;
    if (Object.keys(waterHeater).length > 0) patch.waterHeater = waterHeater;
  }

  // ── Appliances ──
  const appliances: NonNullable<PropertyDetails['appliances']> = {};
  const fridge = first('refrigerator');
  if (fridge?.brand || fridge?.modelNumber) {
    appliances.refrigerator = {
      ...(fridge.brand ? { brand: fridge.brand } : {}),
      ...(fridge.modelNumber ? { model: fridge.modelNumber } : {}),
    };
  }
  const range = first('range');
  if (range?.brand || range?.modelNumber || range?.fuelType) {
    appliances.oven = {
      ...(range.brand ? { brand: range.brand } : {}),
      ...(range.modelNumber ? { model: range.modelNumber } : {}),
      ...(range.fuelType ? { fuel: capitalize(range.fuelType) } : {}),
    };
  }
  const dishwasher = first('dishwasher');
  if (dishwasher?.brand || dishwasher?.modelNumber) {
    appliances.dishwasher = {
      ...(dishwasher.brand ? { brand: dishwasher.brand } : {}),
      ...(dishwasher.modelNumber ? { model: dishwasher.modelNumber } : {}),
    };
  }
  const microwave = first('microwave');
  if (microwave?.brand) {
    appliances.microwave = { brand: microwave.brand };
  }
  const washer = first('washer');
  if (washer?.brand || washer?.modelNumber) {
    appliances.washer = {
      ...(washer.brand ? { brand: washer.brand } : {}),
      ...(washer.modelNumber ? { model: washer.modelNumber } : {}),
    };
  }
  const dryer = first('dryer');
  if (dryer?.brand || dryer?.modelNumber || dryer?.fuelType) {
    appliances.dryer = {
      ...(dryer.brand ? { brand: dryer.brand } : {}),
      ...(dryer.modelNumber ? { model: dryer.modelNumber } : {}),
      ...(dryer.fuelType ? { fuel: capitalize(dryer.fuelType) } : {}),
    };
  }
  const disposal = first('garbage_disposal');
  if (disposal?.brand) appliances.disposal = { brand: disposal.brand };
  if (Object.keys(appliances).length > 0) patch.appliances = appliances;

  // ── Plumbing ──
  const plumbing: NonNullable<PropertyDetails['plumbing']> = {};
  // Faucets need room-type disambiguation
  const faucets = (byType.get('faucet') || []).filter(f => f.brand);
  let kitchenFaucet: PropertyInventoryItem | undefined;
  let bathFaucet: PropertyInventoryItem | undefined;
  for (const f of faucets) {
    const room = f.roomId ? roomById.get(f.roomId) : undefined;
    const rt = room?.roomType || '';
    if (rt.includes('kitchen') && !kitchenFaucet) kitchenFaucet = f;
    else if ((rt.includes('bathroom') || rt.includes('bath')) && !bathFaucet) bathFaucet = f;
  }
  if (kitchenFaucet?.brand) plumbing.kitchenFaucetBrand = kitchenFaucet.brand;
  if (bathFaucet?.brand) plumbing.bathroomFaucetBrand = bathFaucet.brand;
  const toilet = first('toilet');
  if (toilet?.brand) plumbing.toiletBrand = toilet.brand;
  const softener = first('water_softener');
  if (softener) {
    plumbing.waterSoftener = softener.brand
      ? `${softener.brand}${softener.modelNumber ? ' ' + softener.modelNumber : ''}`
      : 'Yes';
  }
  if (Object.keys(plumbing).length > 0) patch.plumbing = plumbing;

  // ── Electrical ──
  const electrical: NonNullable<PropertyDetails['electrical']> = {};
  const panel = first('electrical_panel');
  if (panel) {
    if (panel.capacity) electrical.panelAmperage = panel.capacity;
    const loc = roomLocation(panel.roomId ? roomById.get(panel.roomId) : undefined);
    if (loc) electrical.breakerBoxLocation = loc;
  }
  const generator = first('generator');
  if (generator) {
    electrical.hasGenerator = true;
    const fuel = capitalize(generator.fuelType);
    electrical.generatorType = generator.brand
      ? `${generator.brand}${generator.modelNumber ? ' ' + generator.modelNumber : ''}${fuel ? ' (' + fuel + ')' : ''}`
      : (fuel || 'Standby');
  }
  const solar = first('solar_system');
  if (solar) {
    electrical.hasSolar = true;
    if (solar.brand) {
      electrical.solarSystem = `${solar.brand}${solar.capacity ? ' ' + solar.capacity : ''}`;
    } else if (solar.capacity) {
      electrical.solarSystem = solar.capacity;
    } else {
      electrical.solarSystem = 'Yes';
    }
  }
  const evCharger = first('ev_charger');
  if (evCharger?.brand) {
    electrical.hasEvCharger = true;
    electrical.evChargerBrand = evCharger.brand;
  }
  if (Object.keys(electrical).length > 0) patch.electrical = electrical;

  // ── Pool & Spa ──
  const poolSpa: NonNullable<PropertyDetails['poolSpa']> = {};
  const pool = first('pool');
  if (pool) poolSpa.poolType = 'In-ground';
  const poolHeater = first('pool_heater');
  if (poolHeater?.brand) poolSpa.poolHeaterBrand = poolHeater.brand;
  const poolPump = first('pool_pump');
  if (poolPump?.brand) poolSpa.poolPumpBrand = poolPump.brand;
  const hotTub = first('hot_tub');
  if (hotTub?.brand) poolSpa.hotTubBrand = hotTub.brand;
  if (hotTub?.modelNumber) poolSpa.hotTubModel = hotTub.modelNumber;
  if (Object.keys(poolSpa).length > 0) patch.poolSpa = poolSpa;

  // ── Exterior ──
  const exterior: NonNullable<PropertyDetails['exterior']> = {};
  const irrig = first('irrigation_controller');
  if (irrig?.brand) exterior.irrigationBrand = irrig.brand;
  const garageDoor = first('garage_door');
  if (garageDoor?.brand) exterior.garageDoorBrand = garageDoor.brand;
  if (Object.keys(exterior).length > 0) patch.exterior = exterior;

  return patch;
}

/* ── Merge ───────────────────────────────────────────────────────────────── */

/**
 * Deep-merge a settings patch into existing details. Only fills empty
 * fields — never overwrites PM-entered values. Returns the merged details
 * and a list of dotted field paths that were actually updated.
 */
export function mergeSettingsPatch(
  existing: PropertyDetails | null,
  patch: Partial<PropertyDetails>,
): { merged: PropertyDetails; updatedPaths: string[] } {
  const merged = JSON.parse(JSON.stringify(existing || {})) as Record<string, Record<string, unknown>>;
  const patchRec = patch as unknown as Record<string, Record<string, unknown>>;
  const updated: string[] = [];

  for (const section of Object.keys(patchRec)) {
    const patchSection = patchRec[section];
    if (!patchSection) continue;
    if (!merged[section]) merged[section] = {};
    const existingSection = merged[section];

    for (const key of Object.keys(patchSection)) {
      const newVal = patchSection[key];
      if (newVal === undefined || newVal === null || newVal === '') continue;

      if (section === 'appliances' && typeof newVal === 'object') {
        // Per-appliance nested object
        const existingAppliance = (existingSection[key] as Record<string, unknown> | undefined) || {};
        const newAppliance = newVal as Record<string, unknown>;
        for (const f of Object.keys(newAppliance)) {
          const v = newAppliance[f];
          if (v && !existingAppliance[f]) {
            existingAppliance[f] = v;
            updated.push(`appliances.${key}.${f}`);
          }
        }
        existingSection[key] = existingAppliance;
      } else {
        if (!existingSection[key]) {
          existingSection[key] = newVal;
          updated.push(`${section}.${key}`);
        }
      }
    }
  }

  return { merged: merged as unknown as PropertyDetails, updatedPaths: updated };
}

/* ── Apply to property ───────────────────────────────────────────────────── */

/**
 * Loads a property's confirmed inventory and merges scan-derived data into
 * the property.details JSONB. Only fills empty fields. Returns the list of
 * field paths that were updated. Errors are caught and logged — this should
 * never break the calling flow.
 */
export async function applyScanToPropertySettings(propertyId: string): Promise<string[]> {
  try {
    const [prop] = await db.select().from(properties).where(eq(properties.id, propertyId)).limit(1);
    if (!prop) return [];

    const items = await db.select().from(propertyInventoryItems)
      .where(eq(propertyInventoryItems.propertyId, propertyId));
    const rooms = await db.select().from(propertyRooms)
      .where(eq(propertyRooms.propertyId, propertyId));

    const patch = buildSettingsPatchFromInventory(items, rooms);
    if (Object.keys(patch).length === 0) return [];

    const { merged, updatedPaths } = mergeSettingsPatch(prop.details ?? null, patch);
    if (updatedPaths.length === 0) return [];

    await db.update(properties)
      .set({ details: merged, updatedAt: new Date() })
      .where(eq(properties.id, propertyId));

    logger.info({ propertyId, updatedPaths }, '[scan-to-settings] applied scan results to property settings');
    return updatedPaths;
  } catch (err) {
    logger.error({ err, propertyId }, '[scan-to-settings] failed to apply scan results');
    return [];
  }
}
