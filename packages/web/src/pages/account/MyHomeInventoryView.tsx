import { useMemo, useState, type CSSProperties } from 'react';
import type { PropertyDetails } from '@/services/api';

/**
 * My Home IQ — Inventory view (visual-first catalog of items in the
 * homeowner's home).
 *
 * Phase 1 of the inventory redesign. The previous My Home IQ tab was a
 * single long form for entering structural details. This view sits as
 * a sibling sub-tab and gives the homeowner a browsable catalog with:
 *
 *   - Search bar at top
 *   - Horizontal category pills (Rooms / Appliances / HVAC / etc.)
 *   - Items grouped by Room (default) or by Category
 *   - Per-item card with placeholder emoji (Phase 2: real photos)
 *
 * Data comes from the existing PropertyDetails shape — we synthesize
 * inventory items by walking each section (appliances.refrigerator,
 * hvac.acBrand, waterHeater, etc.). Editing an item updates the
 * underlying PropertyDetails field via the parent's onUpdate callback,
 * so the Home Details sub-tab and this Inventory view share one source
 * of truth.
 *
 * Phase 2 will replace this with a proper homeowner_inventory_items
 * table — new items beyond the PropertyDetails taxonomy aren't
 * persistable today, so the "Add item" CTA in Phase 1 routes to the
 * Home Details form instead.
 */

const O = '#E8632B';
const D = '#2D2926';
const DIM = '#6B6560';
const SUBTLE = '#9B9490';
const GRAY_LIGHT = '#D3CEC9';
const WARM = '#F9F5F2';

const dm: CSSProperties = { fontFamily: "'DM Sans', sans-serif" };
const mono: CSSProperties = { fontFamily: "'DM Mono', monospace" };

// ─── Taxonomy ─────────────────────────────────────────────────────────

interface CategoryDef {
  key: string;
  label: string;
  icon: string;
  /** Used as the soft background tint behind the placeholder emoji. */
  bg: string;
}

/** Pills shown horizontally at the top. "Rooms" is a special view-mode
 *  — it groups items by their room rather than by category. All others
 *  filter the catalog to that category. */
const CATEGORIES: CategoryDef[] = [
  { key: 'rooms',      label: 'Rooms',      icon: '🛋️', bg: '#FFF7ED' },
  { key: 'appliances', label: 'Appliances', icon: '🍳', bg: '#FFEDD5' },
  { key: 'hvac',       label: 'HVAC',       icon: '❄️', bg: '#DBEAFE' },
  { key: 'plumbing',   label: 'Plumbing',   icon: '🚰', bg: '#CFFAFE' },
  { key: 'electrical', label: 'Electrical', icon: '⚡',  bg: '#FEF3C7' },
  { key: 'pool_spa',   label: 'Pool & Spa', icon: '🏊', bg: '#E0F2FE' },
  { key: 'exterior',   label: 'Exterior',   icon: '🏠', bg: '#DCFCE7' },
  { key: 'security',   label: 'Security',   icon: '🔒', bg: '#FCE7F3' },
];

const ROOM_ORDER = [
  'Kitchen', 'Laundry', 'Utility', 'Garage', 'Living Area', 'Outside', 'Roof', 'Whole Home',
];

interface InventoryItem {
  /** Stable, derived id — '<section>.<key>'. Used by the edit handler
   *  to write back to the right PropertyDetails field. */
  id: string;
  /** Category slug (matches CATEGORIES.key). */
  category: string;
  /** Display label for the room this item lives in. Used for the
   *  Rooms-view grouping. */
  room: string;
  /** Item type label, e.g. 'Refrigerator', 'AC Unit'. */
  type: string;
  /** Emoji rendered in the photo placeholder. Phase 2 will replace
   *  with a real photo when one exists. */
  icon: string;
  /** Brand + model joined for the card title. Falls back to "Add
   *  details" when the homeowner hasn't filled it in yet. */
  title: string;
  /** True when the item has no brand/model on file — rendered with a
   *  dashed border and "Add details" CTA copy. */
  isEmpty: boolean;
}

interface DerivedSpec {
  category: string;
  room: string;
  type: string;
  icon: string;
  /** Field accessor — pulls the brand/model string from PropertyDetails. */
  brand: (d: PropertyDetails) => string | undefined;
  model?: (d: PropertyDetails) => string | undefined;
}

/** The mapping from PropertyDetails fields to inventory items. Each
 *  entry produces zero or one items. We always include the row (empty
 *  or not) so the catalog feels complete — empty slots invite the
 *  homeowner to fill them in. */
const SPECS: Record<string, DerivedSpec> = {
  // Appliances
  'appliances.refrigerator':  { category: 'appliances', room: 'Kitchen', type: 'Refrigerator',     icon: '🧊', brand: (d) => d.appliances?.refrigerator?.brand, model: (d) => d.appliances?.refrigerator?.model },
  'appliances.dishwasher':    { category: 'appliances', room: 'Kitchen', type: 'Dishwasher',       icon: '🍽️', brand: (d) => d.appliances?.dishwasher?.brand, model: (d) => d.appliances?.dishwasher?.model },
  'appliances.oven':          { category: 'appliances', room: 'Kitchen', type: 'Oven / Range',     icon: '🍳', brand: (d) => d.appliances?.oven?.brand, model: (d) => d.appliances?.oven?.model },
  'appliances.microwave':     { category: 'appliances', room: 'Kitchen', type: 'Microwave',        icon: '📡', brand: (d) => d.appliances?.microwave?.brand },
  'appliances.disposal':      { category: 'appliances', room: 'Kitchen', type: 'Garbage Disposal', icon: '🌀', brand: (d) => d.appliances?.disposal?.brand },
  'appliances.washer':        { category: 'appliances', room: 'Laundry', type: 'Washer',           icon: '🧺', brand: (d) => d.appliances?.washer?.brand, model: (d) => d.appliances?.washer?.model },
  'appliances.dryer':         { category: 'appliances', room: 'Laundry', type: 'Dryer',            icon: '🌬️', brand: (d) => d.appliances?.dryer?.brand, model: (d) => d.appliances?.dryer?.model },
  // HVAC
  'hvac.ac':                  { category: 'hvac', room: 'Outside',     type: 'AC Unit',     icon: '❄️', brand: (d) => d.hvac?.acBrand, model: (d) => d.hvac?.acModel },
  'hvac.heating':             { category: 'hvac', room: 'Utility',     type: 'Heating',     icon: '🔥', brand: (d) => d.hvac?.heatingBrand, model: (d) => d.hvac?.heatingModel },
  'hvac.thermostat':          { category: 'hvac', room: 'Living Area', type: 'Thermostat',  icon: '🌡️', brand: (d) => d.hvac?.thermostatBrand, model: (d) => d.hvac?.thermostatModel },
  // Plumbing
  'waterHeater':              { category: 'plumbing', room: 'Utility', type: 'Water Heater',       icon: '🚿', brand: (d) => d.waterHeater?.brand, model: (d) => d.waterHeater?.model },
  'plumbing.kitchenFaucet':   { category: 'plumbing', room: 'Kitchen', type: 'Kitchen Faucet',     icon: '🚰', brand: (d) => d.plumbing?.kitchenFaucetBrand },
  'plumbing.bathroomFaucet':  { category: 'plumbing', room: 'Whole Home', type: 'Bathroom Faucet', icon: '🚿', brand: (d) => d.plumbing?.bathroomFaucetBrand },
  'plumbing.toilet':          { category: 'plumbing', room: 'Whole Home', type: 'Toilet',          icon: '🚽', brand: (d) => d.plumbing?.toiletBrand },
  'plumbing.waterSoftener':   { category: 'plumbing', room: 'Utility', type: 'Water Softener',     icon: '💧', brand: (d) => d.plumbing?.waterSoftener },
  // Electrical
  'electrical.generator':     { category: 'electrical', room: 'Outside', type: 'Generator',  icon: '🔌', brand: (d) => d.electrical?.hasGenerator ? (d.electrical?.generatorType ?? 'Installed') : undefined },
  'electrical.solar':         { category: 'electrical', room: 'Roof',    type: 'Solar',      icon: '☀️', brand: (d) => d.electrical?.hasSolar ? (d.electrical?.solarSystem ?? 'Installed') : undefined },
  'electrical.evCharger':     { category: 'electrical', room: 'Garage',  type: 'EV Charger', icon: '🔋', brand: (d) => d.electrical?.hasEvCharger ? (d.electrical?.evChargerBrand ?? 'Installed') : undefined },
  // Pool & Spa
  'poolSpa.poolHeater':       { category: 'pool_spa', room: 'Outside', type: 'Pool Heater', icon: '🔥', brand: (d) => d.poolSpa?.poolHeaterBrand },
  'poolSpa.poolPump':         { category: 'pool_spa', room: 'Outside', type: 'Pool Pump',   icon: '🌀', brand: (d) => d.poolSpa?.poolPumpBrand },
  'poolSpa.hotTub':           { category: 'pool_spa', room: 'Outside', type: 'Hot Tub',     icon: '♨️', brand: (d) => d.poolSpa?.hotTubBrand, model: (d) => d.poolSpa?.hotTubModel },
  // Exterior
  'exterior.garageDoor':      { category: 'exterior', room: 'Garage',  type: 'Garage Door', icon: '🚪', brand: (d) => d.exterior?.garageDoorBrand },
  'exterior.irrigation':      { category: 'exterior', room: 'Outside', type: 'Irrigation',  icon: '💦', brand: (d) => d.exterior?.irrigationBrand },
  // Security
  'access.alarm':             { category: 'security', room: 'Whole Home', type: 'Alarm System', icon: '🛡️', brand: (d) => d.access?.alarmBrand },
};

function deriveItems(details: PropertyDetails): InventoryItem[] {
  return Object.entries(SPECS).map(([id, spec]) => {
    const brand = spec.brand(details);
    const model = spec.model ? spec.model(details) : undefined;
    const parts = [brand, model].filter(Boolean).map((s) => String(s).trim()).filter(Boolean);
    const title = parts.length > 0 ? parts.join(' ') : 'Add details';
    return {
      id,
      category: spec.category,
      room: spec.room,
      type: spec.type,
      icon: spec.icon,
      title,
      isEmpty: parts.length === 0,
    };
  });
}

// ─── Component ────────────────────────────────────────────────────────

interface MyHomeInventoryViewProps {
  details: PropertyDetails;
  onGoToHomeDetails: () => void;
  onSelectItem: (item: InventoryItem) => void;
}

export default function MyHomeInventoryView({ details, onGoToHomeDetails, onSelectItem }: MyHomeInventoryViewProps) {
  const [activeCategory, setActiveCategory] = useState<string>('rooms');
  const [search, setSearch] = useState('');

  const allItems = useMemo(() => deriveItems(details), [details]);

  const filteredItems = useMemo(() => {
    let items = allItems;
    if (activeCategory !== 'rooms') {
      items = items.filter((i) => i.category === activeCategory);
    }
    if (search.trim().length > 0) {
      const q = search.trim().toLowerCase();
      items = items.filter(
        (i) =>
          i.title.toLowerCase().includes(q) ||
          i.type.toLowerCase().includes(q) ||
          i.room.toLowerCase().includes(q),
      );
    }
    return items;
  }, [allItems, activeCategory, search]);

  // Group either by Room (when Rooms is active) or by Type/Category.
  const groups = useMemo(() => {
    if (activeCategory === 'rooms') {
      const map = new Map<string, InventoryItem[]>();
      for (const item of filteredItems) {
        if (!map.has(item.room)) map.set(item.room, []);
        map.get(item.room)!.push(item);
      }
      // Stable room ordering — kitchen first, garage middle, whole home last.
      return [...map.entries()].sort(([a], [b]) => ROOM_ORDER.indexOf(a) - ROOM_ORDER.indexOf(b));
    }
    // For category views, single group named after the category.
    const def = CATEGORIES.find((c) => c.key === activeCategory);
    if (!def || filteredItems.length === 0) return [];
    return [[def.label, filteredItems]] as Array<[string, InventoryItem[]]>;
  }, [filteredItems, activeCategory]);

  const nonEmptyCount = allItems.filter((i) => !i.isEmpty).length;

  return (
    <div>
      {/* Search bar */}
      <div style={{ position: 'relative', marginBottom: 14 }}>
        <span
          style={{
            position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)',
            fontSize: 14, color: SUBTLE, pointerEvents: 'none',
          }}
        >🔍</span>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search inventory"
          style={{
            ...dm,
            width: '100%',
            padding: '12px 14px 12px 38px',
            fontSize: 14,
            border: `1px solid ${GRAY_LIGHT}`,
            borderRadius: 100,
            outline: 'none',
            background: '#fff',
            color: D,
            boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Category pills (horizontal scroll) */}
      <div
        style={{
          display: 'flex', gap: 6, marginBottom: 20,
          overflowX: 'auto', paddingBottom: 4,
          WebkitOverflowScrolling: 'touch',
          scrollbarWidth: 'none',
        }}
        className="hide-scrollbar"
      >
        <style>{`.hide-scrollbar::-webkit-scrollbar { display: none; }`}</style>
        {CATEGORIES.map((cat) => {
          const isActive = activeCategory === cat.key;
          return (
            <button
              key={cat.key}
              onClick={() => setActiveCategory(cat.key)}
              style={{
                ...dm,
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                gap: 4, padding: '8px 14px', minWidth: 70,
                background: 'transparent', border: 'none', cursor: 'pointer',
                borderBottom: isActive ? `2px solid ${D}` : '2px solid transparent',
                color: isActive ? D : DIM,
                flexShrink: 0,
              }}
            >
              <span style={{ fontSize: 20 }}>{cat.icon}</span>
              <span style={{ fontSize: 11, fontWeight: isActive ? 700 : 500, whiteSpace: 'nowrap' }}>
                {cat.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* Empty state — no items at all in PropertyDetails. */}
      {nonEmptyCount === 0 && search.length === 0 && (
        <EmptyInventory onGoToHomeDetails={onGoToHomeDetails} />
      )}

      {/* No matches for the active filter / search. */}
      {nonEmptyCount > 0 && groups.length === 0 && (
        <div
          style={{
            ...dm, padding: '40px 20px', textAlign: 'center',
            color: SUBTLE, fontSize: 14,
          }}
        >
          {search.length > 0 ? `No items match "${search}"` : 'Nothing in this category yet'}
        </div>
      )}

      {/* Grouped sections */}
      {groups.map(([groupName, items]) => (
        <InventoryGroup
          key={groupName}
          name={groupName}
          items={items}
          onSelect={onSelectItem}
        />
      ))}
    </div>
  );
}

// ─── Group ────────────────────────────────────────────────────────────

function InventoryGroup({
  name, items, onSelect,
}: {
  name: string;
  items: InventoryItem[];
  onSelect: (item: InventoryItem) => void;
}) {
  // Pick an icon for the group header. Rooms get a generic 🏠;
  // category-view groups get the matching category icon.
  const cat = CATEGORIES.find((c) => c.label === name);
  const headerIcon = cat?.icon ?? '🏠';

  return (
    <section style={{ marginBottom: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            style={{
              width: 24, height: 24, borderRadius: 6, background: WARM,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 14,
            }}
          >{headerIcon}</span>
          <span style={{ ...dm, fontSize: 14, fontWeight: 700, color: D }}>{name}</span>
        </div>
        <span style={{ ...mono, fontSize: 11, color: SUBTLE, textTransform: 'uppercase', letterSpacing: 1 }}>
          {items.length} item{items.length === 1 ? '' : 's'}
        </span>
      </div>

      {/* Grid — 3 across on phones, 4-5 on desktop via auto-fit. */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
          gap: 10,
        }}
      >
        {items.map((item) => (
          <ItemCard key={item.id} item={item} onSelect={onSelect} />
        ))}
      </div>
    </section>
  );
}

// ─── Item card ────────────────────────────────────────────────────────

function ItemCard({ item, onSelect }: { item: InventoryItem; onSelect: (i: InventoryItem) => void }) {
  const cat = CATEGORIES.find((c) => c.key === item.category);
  const bg = cat?.bg ?? WARM;

  return (
    <button
      onClick={() => onSelect(item)}
      style={{
        ...dm,
        background: '#fff',
        borderRadius: 12,
        border: item.isEmpty ? `1px dashed ${GRAY_LIGHT}` : `1px solid ${GRAY_LIGHT}`,
        padding: 0,
        cursor: 'pointer',
        textAlign: 'left',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        opacity: item.isEmpty ? 0.7 : 1,
        transition: 'transform 0.15s, box-shadow 0.15s',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-2px)';
        e.currentTarget.style.boxShadow = '0 6px 16px rgba(0,0,0,0.06)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = 'none';
      }}
    >
      {/* Photo placeholder — emoji on tinted background. Phase 2 swaps
          for a real photo when present. */}
      <div
        style={{
          aspectRatio: '1 / 1',
          background: bg,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 44,
        }}
      >
        <span style={{ opacity: item.isEmpty ? 0.4 : 1 }}>{item.icon}</span>
      </div>

      {/* Title + type */}
      <div style={{ padding: '10px 12px 12px' }}>
        <div
          style={{
            fontSize: 12, fontWeight: 600, color: item.isEmpty ? SUBTLE : D,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            lineHeight: 1.3,
          }}
        >
          {item.title}
        </div>
        <div style={{ fontSize: 11, color: SUBTLE, marginTop: 2, lineHeight: 1.3 }}>
          {item.type}
        </div>
      </div>
    </button>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────

function EmptyInventory({ onGoToHomeDetails }: { onGoToHomeDetails: () => void }) {
  return (
    <div
      style={{
        ...dm,
        background: '#fff',
        borderRadius: 16,
        border: `1px dashed ${GRAY_LIGHT}`,
        padding: '40px 24px',
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: 44, marginBottom: 12 }}>🏠</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: D, marginBottom: 6 }}>Your home, mapped</div>
      <p style={{ fontSize: 13, color: DIM, lineHeight: 1.55, maxWidth: 380, margin: '0 auto 18px' }}>
        Add details about your appliances, HVAC, and other systems and they'll show up here as a browsable catalog.
      </p>
      <button
        onClick={onGoToHomeDetails}
        style={{
          ...dm,
          padding: '10px 20px', borderRadius: 100, border: 'none',
          background: O, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
        }}
      >
        Add home details
      </button>
    </div>
  );
}

// Re-export the InventoryItem type so the parent can type its selection handler.
export type { InventoryItem };
