import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  correlateItemToChat, dedupeInventory, iqCategoryKeyFromLabel,
  iqLabelFor, IQ_CATEGORY_MATCH,
} from '@/utils/home-iq';
import type { PropertyInventoryItem } from '@homie/shared';

/**
 * Home IQ panel for the consumer /quote chat — mirrors the business-side
 * Property IQ card in behavior, but rebranded and tuned for the
 * single-home consumer surface.
 *
 * Renders in the existing right-panel slot and lights up as chat content
 * names specific equipment (brand/model/item type). Never shows items
 * the user hasn't explicitly mentioned unless no category has been
 * inferred yet — then a compact "ready" state hints at the feature.
 *
 * Three render states:
 *   1. Anonymous  → "Sign in to unlock Home IQ" CTA (low-key)
 *   2. No data    → "Add equipment to get smarter quotes" CTA
 *   3. Data       → correlated items when chat specifies, category
 *                   fallback when only category is known, ready-state
 *                   when neither
 *
 * Items are tappable — opens the "edit details" modal which deep-links
 * into the My Home IQ tab of the consumer's account so they can fill in
 * missing brand/model/age for the AI to use next time.
 */

const O = '#E8632B', G = '#1B9E77', D = '#2D2926', W = '#F9F5F2';
const DIM = '#6B6560';
const BORDER = 'rgba(0,0,0,.08)';
const RED = '#DC2626', AMBER = '#EF9F27';

interface HomeIQPanelProps {
  /** The homeowner's merged inventory (scan + Equipment & Systems form). */
  items: PropertyInventoryItem[];
  /** Concatenated chat text — user + assistant messages + in-flight
   *  streaming tokens. Empty = no correlation yet. */
  chatText: string;
  /** Inferred service category ("Plumbing", "HVAC" …). Optional —
   *  used as fallback filter when chat hasn't named anything yet. */
  categoryLabel: string | null;
  /** True when the user isn't authenticated — we show a sign-in teaser
   *  instead of an inventory list. */
  anonymous: boolean;
  /** True while the initial inventory fetch is in flight. */
  loading: boolean;
}

export default function HomeIQPanel(props: HomeIQPanelProps) {
  const navigate = useNavigate();
  const [editTarget, setEditTarget] = useState<PropertyInventoryItem | null>(null);

  // ── Anonymous state ────────────────────────────────────────────────
  if (props.anonymous) {
    return (
      <div style={shell(false)}>
        <Header subtitle="Personalize your quotes" />
        <div style={{ fontSize: 12, color: DIM, lineHeight: 1.5, marginBottom: 12 }}>
          Sign in and Homie remembers your appliances \u2014 faster diagnostics, better pro matches, no re-typing the model number every time.
        </div>
        <button onClick={() => navigate('/login')} style={primaryBtn}>Sign in</button>
      </div>
    );
  }

  // ── Loading / initial fetch ────────────────────────────────────────
  if (props.loading) {
    return (
      <div style={shell(false)}>
        <Header subtitle="Loading\u2026" />
        <div style={{ display: 'grid', gap: 6 }}>
          {[0, 1, 2].map(i => (
            <div key={i} style={{
              height: 44, borderRadius: 10, background: W, border: `1px solid ${BORDER}`,
              opacity: 0.7 - i * 0.2,
            }} />
          ))}
        </div>
      </div>
    );
  }

  const items = dedupeInventory(props.items);

  // ── Empty inventory ────────────────────────────────────────────────
  if (items.length === 0) {
    return (
      <div style={shell(false)}>
        <Header subtitle="No equipment on file" />
        <div style={{ fontSize: 12, color: DIM, lineHeight: 1.5, marginBottom: 12 }}>
          Add your water heater, HVAC, appliances \u2014 Homie will use them for sharper diagnoses and accurate quotes.
        </div>
        <button onClick={() => navigate('/account?tab=home')} style={primaryBtn}>
          Add equipment \u2192
        </button>
      </div>
    );
  }

  // ── Correlation + filter ───────────────────────────────────────────
  const catKey = iqCategoryKeyFromLabel(props.categoryLabel);
  const scored = props.chatText
    ? items
        .map(it => ({ it, strength: correlateItemToChat(it, props.chatText) }))
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

  // ── Ready state — data on file but nothing narrowed down yet ──────
  if (!hasChatHits && !hasCategory) {
    return (
      <div style={shell(false)}>
        <Header subtitle={`${items.length} on file \u00b7 ready`} />
        <div style={{ fontSize: 12, color: DIM, lineHeight: 1.5 }}>
          Mention an appliance or system \u2014 Homie will surface the matching equipment here.
        </div>
      </div>
    );
  }

  const titleSuffix = hasChatHits
    ? ' \u00b7 in chat'
    : hasCategory && props.categoryLabel ? ` \u00b7 ${props.categoryLabel}` : '';

  return (
    <>
      <div style={shell(true)}>
        <Header
          titleSuffix={titleSuffix}
          subtitle={`${filtered.length} ${hasChatHits ? 'mentioned' : 'matching'} item${filtered.length === 1 ? '' : 's'}`}
        />
        {filtered.length === 0 ? (
          <div style={{
            padding: 10, borderRadius: 10, background: W,
            fontSize: 12, color: DIM, lineHeight: 1.5,
          }}>
            No {props.categoryLabel?.toLowerCase() ?? 'matching'} equipment on file \u2014 Homie will record what you mention.
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 6 }}>
            {filtered.slice(0, 4).map(item => (
              <HomeIQRow
                key={item.id}
                item={item}
                onClick={() => setEditTarget(item)}
              />
            ))}
          </div>
        )}
        <div style={{ marginTop: 12, textAlign: 'right' }}>
          <button onClick={() => navigate('/account?tab=home')} style={secondaryBtn}>
            Manage equipment \u2192
          </button>
        </div>
      </div>

      {editTarget && (
        <EditItemModal
          item={editTarget}
          onClose={() => setEditTarget(null)}
          onGoToAccount={() => {
            setEditTarget(null);
            navigate('/account?tab=home');
          }}
        />
      )}
    </>
  );
}

/**
 * Compact inline variant for mobile — used inside the chat stream
 * since the right panel is hidden below 981px. Renders only when
 * correlation has fired.
 */
export function HomeIQInlineChip({
  items, chatText,
}: { items: PropertyInventoryItem[]; chatText: string }) {
  const deduped = dedupeInventory(items);
  const scored = chatText
    ? deduped
        .map(it => ({ it, strength: correlateItemToChat(it, chatText) }))
        .filter((x): x is { it: PropertyInventoryItem; strength: 'strong' | 'medium' } => x.strength !== null)
    : [];
  const hasStrong = scored.some(x => x.strength === 'strong');
  const correlated = hasStrong
    ? scored.filter(x => x.strength === 'strong').map(x => x.it)
    : scored.map(x => x.it);
  if (correlated.length === 0) return null;

  return (
    <div className="gq-mobile-iq" style={{
      marginLeft: 42, marginRight: 0, marginTop: 8, marginBottom: 8,
      background: '#fff', borderRadius: 14, border: `1px solid ${BORDER}`,
      padding: 12, animation: 'fadeSlide 0.3s ease',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <div style={{
          width: 22, height: 22, borderRadius: 7, background: `${O}14`,
          border: `1px solid ${O}33`, display: 'flex', alignItems: 'center',
          justifyContent: 'center', fontSize: 12,
        }}>{'\uD83E\uDDE0'}</div>
        <span style={{ fontFamily: "'Fraunces',serif", fontSize: 12.5, fontWeight: 700, color: D }}>
          Home IQ \u00b7 {correlated.length} {correlated.length === 1 ? 'match' : 'matches'}
        </span>
      </div>
      <div style={{ display: 'grid', gap: 6 }}>
        {correlated.slice(0, 3).map(item => <HomeIQRow key={item.id} item={item} />)}
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────

function Header({ titleSuffix, subtitle }: { titleSuffix?: string; subtitle: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
      <div style={{
        width: 30, height: 30, borderRadius: 9, background: `${O}14`,
        border: `1px solid ${O}33`, display: 'flex', alignItems: 'center',
        justifyContent: 'center', fontSize: 15, flexShrink: 0,
      }}>{'\uD83E\uDDE0'}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: "'Fraunces',serif", fontSize: 14, fontWeight: 700, color: D }}>
          Home IQ{titleSuffix || ''}
        </div>
        <div style={{
          fontSize: 10, color: DIM, marginTop: 1, fontFamily: "'DM Mono',monospace",
          letterSpacing: 0.4, textTransform: 'uppercase',
        }}>{subtitle}</div>
      </div>
    </div>
  );
}

function HomeIQRow({ item, onClick }: { item: PropertyInventoryItem; onClick?: () => void }) {
  const ageYears = item.estimatedAgeYears ? parseFloat(item.estimatedAgeYears) : null;
  const pinned = item.status === 'pm_confirmed';
  const clickable = !!onClick;

  return (
    <button
      onClick={onClick}
      disabled={!clickable}
      style={{
        all: 'unset',
        cursor: clickable ? 'pointer' : 'default',
        padding: 10, borderRadius: 10,
        background: pinned ? `${O}08` : W,
        border: `1px solid ${pinned ? `${O}33` : BORDER}`,
        display: 'flex', gap: 8, alignItems: 'flex-start',
        transition: 'all 0.15s',
      }}
      onMouseEnter={clickable ? (e) => {
        (e.currentTarget as HTMLButtonElement).style.borderColor = O;
        (e.currentTarget as HTMLButtonElement).style.background = `${O}10`;
      } : undefined}
      onMouseLeave={clickable ? (e) => {
        (e.currentTarget as HTMLButtonElement).style.borderColor = pinned ? `${O}33` : BORDER;
        (e.currentTarget as HTMLButtonElement).style.background = pinned ? `${O}08` : W;
      } : undefined}
    >
      <div style={{
        width: 26, height: 26, borderRadius: 7,
        background: pinned ? O : '#fff',
        border: pinned ? 'none' : `1px solid ${BORDER}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 12, flexShrink: 0,
      }}>
        {item.category === 'appliance' && '\uD83C\uDF73'}
        {item.category === 'fixture' && '\uD83D\uDEB0'}
        {item.category === 'system' && '\u2744\uFE0F'}
        {item.category === 'safety' && '\uD83D\uDEE1\uFE0F'}
        {item.category === 'amenity' && '\u2728'}
        {item.category === 'infrastructure' && '\uD83D\uDD28'}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontFamily: "'Fraunces',serif", fontSize: 12.5, fontWeight: 700, color: D,
          lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {[item.brand, item.modelNumber].filter(Boolean).join(' \u00b7 ') || iqLabelFor(item.itemType)}
        </div>
        <div style={{
          fontSize: 10, color: DIM, marginTop: 2,
          display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center',
        }}>
          <span style={{ textTransform: 'capitalize' }}>{iqLabelFor(item.itemType)}</span>
          {ageYears !== null && (
            <>
              <span style={{ opacity: 0.4 }}>\u00b7</span>
              <span>{Math.round(ageYears)}yr</span>
            </>
          )}
          {item.condition && item.condition !== 'good' && (
            <>
              <span style={{ opacity: 0.4 }}>\u00b7</span>
              <span style={{ color: item.condition === 'poor' ? RED : AMBER, fontWeight: 700 }}>
                {item.condition}
              </span>
            </>
          )}
        </div>
      </div>
      {clickable && (
        <div style={{ fontSize: 11, color: DIM, flexShrink: 0, alignSelf: 'center' }}>
          {'\u270F\uFE0F'}
        </div>
      )}
    </button>
  );
}

function EditItemModal({
  item, onClose, onGoToAccount,
}: {
  item: PropertyInventoryItem;
  onClose: () => void;
  onGoToAccount: () => void;
}) {
  const name = [item.brand, item.modelNumber].filter(Boolean).join(' \u00b7 ') || iqLabelFor(item.itemType);
  const missing: string[] = [];
  if (!item.brand) missing.push('brand');
  if (!item.modelNumber) missing.push('model number');
  if (!item.estimatedAgeYears) missing.push('age');

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000, padding: 20, animation: 'fadeSlide 0.15s ease',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: 18, maxWidth: 440, width: '100%',
          padding: 24, fontFamily: "'DM Sans',sans-serif",
        }}
      >
        <div style={{ fontSize: 11, color: DIM, fontFamily: "'DM Mono',monospace", letterSpacing: 1.2, textTransform: 'uppercase', fontWeight: 700, marginBottom: 6 }}>
          Home IQ \u00b7 {iqLabelFor(item.itemType)}
        </div>
        <div style={{ fontFamily: "'Fraunces',serif", fontSize: 22, fontWeight: 700, color: D, marginBottom: 10 }}>
          {name}
        </div>

        <div style={{ background: W, borderRadius: 12, padding: 14, marginBottom: 16 }}>
          <Row label="Type" value={iqLabelFor(item.itemType)} />
          <Row label="Brand" value={item.brand || '\u2014'} missing={!item.brand} />
          <Row label="Model" value={item.modelNumber || '\u2014'} missing={!item.modelNumber} />
          <Row label="Age" value={item.estimatedAgeYears ? `${Math.round(parseFloat(item.estimatedAgeYears))} yrs` : '\u2014'} missing={!item.estimatedAgeYears} />
          {item.condition && <Row label="Condition" value={item.condition.replace(/_/g, ' ')} />}
          {item.fuelType && <Row label="Fuel" value={item.fuelType} />}
          {item.capacity && <Row label="Capacity" value={item.capacity} />}
        </div>

        {missing.length > 0 && (
          <div style={{
            padding: 10, borderRadius: 10, background: `${O}08`, border: `1px solid ${O}22`,
            marginBottom: 16, fontSize: 12, color: D, lineHeight: 1.5,
          }}>
            <strong>Fill in {missing.join(', ')}</strong> \u2014 Homie will use it in every future chat so you don\u2019t have to re-describe this {iqLabelFor(item.itemType).toLowerCase()}.
          </div>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onClose} style={{ ...secondaryBtn, flex: 1 }}>Close</button>
          <button onClick={onGoToAccount} style={{ ...primaryBtn, flex: 1 }}>Edit in Home IQ \u2192</button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, missing }: { label: string; value: string; missing?: boolean }) {
  return (
    <div style={{ display: 'flex', padding: '4px 0', fontSize: 13 }}>
      <div style={{ width: 90, color: DIM }}>{label}</div>
      <div style={{ flex: 1, fontWeight: 600, color: missing ? DIM : D, fontStyle: missing ? 'italic' : 'normal' }}>
        {value}
      </div>
    </div>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────

function shell(active: boolean): React.CSSProperties {
  return {
    background: '#fff', borderRadius: 18,
    border: active ? `1px solid ${BORDER}` : `1px dashed ${BORDER}`,
    padding: 16,
    boxShadow: active ? '0 12px 40px -20px rgba(0,0,0,.08)' : undefined,
  };
}

const primaryBtn: React.CSSProperties = {
  padding: '10px 14px', background: O, color: '#fff', border: 'none',
  borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer',
  fontFamily: "'DM Sans',sans-serif",
};

const secondaryBtn: React.CSSProperties = {
  padding: '8px 14px', background: '#fff', color: D,
  border: `1px solid ${BORDER}`, borderRadius: 10, fontSize: 12, fontWeight: 600,
  cursor: 'pointer', fontFamily: "'DM Sans',sans-serif",
};
// G reserved for future use (ready-state accent) — kept importable, unused below
void G;
