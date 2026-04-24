import { pgTable, uuid, text, timestamp, integer, boolean, numeric, jsonb } from 'drizzle-orm/pg-core';
import { workspaces } from './workspaces';

export interface BedConfig {
  type: string; // 'king' | 'queen' | 'full' | 'twin' | 'sofa_bed' | 'bunk' | 'crib'
  count: number;
}

export interface PropertyDetails {
  hvac?: {
    acType?: string; acBrand?: string; acModel?: string; acAge?: string;
    heatingType?: string; heatingBrand?: string; heatingModel?: string;
    thermostatBrand?: string; thermostatModel?: string;
    filterSize?: string;
  };
  waterHeater?: {
    type?: string; brand?: string; model?: string; age?: string;
    fuel?: string; capacity?: string; location?: string;
  };
  appliances?: {
    refrigerator?: { brand?: string; model?: string };
    washer?: { brand?: string; model?: string };
    dryer?: { brand?: string; model?: string; fuel?: string };
    dishwasher?: { brand?: string; model?: string };
    oven?: { brand?: string; model?: string; fuel?: string };
    disposal?: { brand?: string };
    microwave?: { brand?: string; type?: string };
  };
  plumbing?: {
    kitchenFaucetBrand?: string; bathroomFaucetBrand?: string;
    toiletBrand?: string; waterSoftener?: string;
    septicOrSewer?: string; mainShutoffLocation?: string;
  };
  electrical?: {
    breakerBoxLocation?: string; panelAmperage?: string;
    hasGenerator?: boolean; generatorType?: string;
    hasSolar?: boolean; solarSystem?: string;
    hasEvCharger?: boolean; evChargerBrand?: string;
  };
  poolSpa?: {
    poolType?: string; poolHeaterBrand?: string; poolPumpBrand?: string;
    hotTubBrand?: string; hotTubModel?: string;
  };
  exterior?: {
    roofType?: string; roofAge?: string; sidingMaterial?: string;
    fenceMaterial?: string; garageDoorBrand?: string;
    irrigationBrand?: string;
  };
  access?: {
    lockboxCode?: string; gateCode?: string;
    alarmBrand?: string; alarmCode?: string;
    wifiNetwork?: string; wifiPassword?: string;
  };
  general?: {
    yearBuilt?: string; hasHoa?: boolean; hoaContact?: string;
    pestControlProvider?: string; pestControlFrequency?: string;
    cleaningNotes?: string;
  };
}

export const properties = pgTable('properties', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  address: text('address'),
  city: text('city'),
  state: text('state'),
  zipCode: text('zip_code'),
  propertyType: text('property_type').notNull().default('residential'),
  unitCount: integer('unit_count').notNull().default(1),
  bedrooms: integer('bedrooms'),
  bathrooms: numeric('bathrooms', { precision: 3, scale: 1 }),
  sqft: integer('sqft'),
  beds: jsonb('beds').$type<BedConfig[]>(),
  pmsSource: text('pms_source'),
  pmsExternalId: text('pms_external_id'),
  /** Per-property rental-type override. Null = inherit from
   *  workspaces.rentalType. PMs with mixed portfolios (some Airbnbs
   *  + some LTR apartments in one workspace) set this per-property
   *  so each unit shows the right occupant terminology + calendar
   *  visibility. Same enum as workspaces.rentalType. */
  rentalType: text('rental_type'),
  details: jsonb('details').$type<PropertyDetails>(),
  notes: text('notes'),
  photoUrls: text('photo_urls').array(),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Property = typeof properties.$inferSelect;
export type NewProperty = typeof properties.$inferInsert;
