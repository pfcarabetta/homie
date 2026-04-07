import { useState, useEffect } from 'react';
import { adminService } from '@/services/admin-api';
import { PricingConfig, HomeownerTierConfig, BusinessPlanConfig, DEFAULT_PRICING } from '@/hooks/usePricing';

/* ── helpers ─────────────────────────────────────────────────────────────── */

function centsToStr(cents: number): string {
  return (cents / 100).toFixed(2);
}
function strToCents(s: string): number {
  return Math.round(parseFloat(s) * 100);
}

/* ── Homeowner tier editor ────────────────────────────────────────────────── */

interface HomeownerTierRowProps {
  tierId: string;
  label: string;
  config: HomeownerTierConfig;
  onChange: (updated: HomeownerTierConfig) => void;
}

function HomeownerTierRow({ tierId, label, config, onChange }: HomeownerTierRowProps) {
  const hasPromo = config.promoPriceCents != null;

  return (
    <div className="bg-white rounded-xl border border-dark/10 p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-dark capitalize">{label}</h3>
        <span className="text-xs text-dark/40 font-mono">{tierId}</span>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <label className="block text-xs text-dark/50 mb-1">Regular price ($)</label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={centsToStr(config.priceCents)}
            onChange={(e) => onChange({ ...config, priceCents: strToCents(e.target.value) })}
            className="w-full border border-dark/15 rounded-lg px-3 py-2 text-sm text-dark focus:outline-none focus:border-orange-500"
          />
        </div>
        <div>
          <label className="block text-xs text-dark/50 mb-1">Effective price (after promo)</label>
          <div className="w-full border border-dark/10 rounded-lg px-3 py-2 text-sm text-dark/40 bg-warm">
            ${hasPromo ? centsToStr(config.promoPriceCents!) : centsToStr(config.priceCents)}
          </div>
        </div>
      </div>

      <div className="border-t border-dark/8 pt-4">
        <label className="flex items-center gap-2 cursor-pointer mb-3">
          <input
            type="checkbox"
            checked={hasPromo}
            onChange={(e) => {
              if (e.target.checked) {
                onChange({ ...config, promoPriceCents: config.priceCents, promoLabel: 'Limited time offer' });
              } else {
                onChange({ ...config, promoPriceCents: null, promoLabel: null });
              }
            }}
            className="accent-orange-500"
          />
          <span className="text-sm font-medium text-dark">Active promo (strikethrough display)</span>
        </label>

        {hasPromo && (
          <div className="grid grid-cols-2 gap-4 mt-2">
            <div>
              <label className="block text-xs text-dark/50 mb-1">Promo price ($)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={centsToStr(config.promoPriceCents!)}
                onChange={(e) => onChange({ ...config, promoPriceCents: strToCents(e.target.value) })}
                className="w-full border border-orange-300 rounded-lg px-3 py-2 text-sm text-dark focus:outline-none focus:border-orange-500"
              />
            </div>
            <div>
              <label className="block text-xs text-dark/50 mb-1">Promo label</label>
              <input
                type="text"
                placeholder="e.g. Limited time offer"
                value={config.promoLabel ?? ''}
                onChange={(e) => onChange({ ...config, promoLabel: e.target.value || null })}
                className="w-full border border-orange-300 rounded-lg px-3 py-2 text-sm text-dark focus:outline-none focus:border-orange-500"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Business plan editor ─────────────────────────────────────────────────── */

interface BusinessPlanRowProps {
  planId: string;
  label: string;
  config: BusinessPlanConfig;
  onChange: (updated: BusinessPlanConfig) => void;
  readOnly?: boolean;
}

function BusinessPlanRow({ planId, label, config, onChange, readOnly }: BusinessPlanRowProps) {
  const hasPromo = config.promoBase != null;

  return (
    <div className={`bg-white rounded-xl border p-5 ${readOnly ? 'border-dark/5 opacity-60' : 'border-dark/10'}`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-dark">{label}</h3>
        {readOnly && <span className="text-xs bg-dark/8 text-dark/50 rounded-full px-2 py-0.5">not editable</span>}
        {!readOnly && <span className="text-xs text-dark/40 font-mono">{planId}</span>}
      </div>

      {readOnly ? (
        <p className="text-sm text-dark/40">Enterprise pricing is handled separately via direct contact.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <div>
              <label className="block text-xs text-dark/50 mb-1">Base ($/mo)</label>
              <input
                type="number"
                min="0"
                value={config.base}
                onChange={(e) => onChange({ ...config, base: parseFloat(e.target.value) || 0 })}
                className="w-full border border-dark/15 rounded-lg px-3 py-2 text-sm text-dark focus:outline-none focus:border-orange-500"
              />
            </div>
            <div>
              <label className="block text-xs text-dark/50 mb-1">Per property ($/mo)</label>
              <input
                type="number"
                min="0"
                value={config.perProperty}
                onChange={(e) => onChange({ ...config, perProperty: parseFloat(e.target.value) || 0 })}
                className="w-full border border-dark/15 rounded-lg px-3 py-2 text-sm text-dark focus:outline-none focus:border-orange-500"
              />
            </div>
            <div>
              <label className="block text-xs text-dark/50 mb-1">Max properties</label>
              <input
                type="number"
                min="1"
                value={config.maxProperties >= 9999 ? '' : config.maxProperties}
                placeholder="9999 = unlimited"
                onChange={(e) => onChange({ ...config, maxProperties: parseInt(e.target.value) || 9999 })}
                className="w-full border border-dark/15 rounded-lg px-3 py-2 text-sm text-dark focus:outline-none focus:border-orange-500"
              />
            </div>
            <div>
              <label className="block text-xs text-dark/50 mb-1">Max team members</label>
              <input
                type="number"
                min="1"
                value={config.maxTeamMembers >= 9999 ? '' : config.maxTeamMembers}
                placeholder="9999 = unlimited"
                onChange={(e) => onChange({ ...config, maxTeamMembers: parseInt(e.target.value) || 9999 })}
                className="w-full border border-dark/15 rounded-lg px-3 py-2 text-sm text-dark focus:outline-none focus:border-orange-500"
              />
            </div>
          </div>

          <div className="border-t border-dark/8 pt-4">
            <label className="flex items-center gap-2 cursor-pointer mb-3">
              <input
                type="checkbox"
                checked={hasPromo}
                onChange={(e) => {
                  if (e.target.checked) {
                    onChange({ ...config, promoBase: config.base, promoLabel: 'Launch pricing' });
                  } else {
                    onChange({ ...config, promoBase: null, promoLabel: null });
                  }
                }}
                className="accent-orange-500"
              />
              <span className="text-sm font-medium text-dark">Active promo (strikethrough display)</span>
            </label>

            {hasPromo && (
              <div className="grid grid-cols-2 gap-4 mt-2">
                <div>
                  <label className="block text-xs text-dark/50 mb-1">Promo base price ($/mo)</label>
                  <input
                    type="number"
                    min="0"
                    value={config.promoBase!}
                    onChange={(e) => onChange({ ...config, promoBase: parseFloat(e.target.value) || 0 })}
                    className="w-full border border-orange-300 rounded-lg px-3 py-2 text-sm text-dark focus:outline-none focus:border-orange-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-dark/50 mb-1">Promo label</label>
                  <input
                    type="text"
                    placeholder="e.g. Launch pricing"
                    value={config.promoLabel ?? ''}
                    onChange={(e) => onChange({ ...config, promoLabel: e.target.value || null })}
                    className="w-full border border-orange-300 rounded-lg px-3 py-2 text-sm text-dark focus:outline-none focus:border-orange-500"
                  />
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/* ── Main page ────────────────────────────────────────────────────────────── */

const HOMEOWNER_TIER_LABELS: Record<string, string> = {
  standard: 'Standard',
  priority: 'Priority',
  emergency: 'Emergency',
};

const BUSINESS_PLAN_LABELS: Record<string, string> = {
  trial: 'Trial',
  starter: 'Starter',
  professional: 'Professional',
  business: 'Business',
  enterprise: 'Enterprise',
};

export default function AdminPricing() {
  const [config, setConfig] = useState<PricingConfig>(DEFAULT_PRICING);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminService.getPricing().then((res) => {
      if (res.data) setConfig(res.data);
    }).catch(() => {});
  }, []);

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await adminService.updatePricing(config);
      if (res.data) setConfig(res.data);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    }
    setSaving(false);
  }

  function updateHomeownerTier(tierId: string, updated: HomeownerTierConfig) {
    setConfig((c) => ({ ...c, homeowner: { ...c.homeowner, [tierId]: updated } }));
  }

  function updateBusinessPlan(planId: string, updated: BusinessPlanConfig) {
    setConfig((c) => ({ ...c, business: { ...c.business, [planId]: updated } }));
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-dark">Pricing Editor</h1>
          <p className="text-sm text-dark/50 mt-1">Changes propagate site-wide within 60 seconds.</p>
        </div>
        <div className="flex items-center gap-3">
          {saved && <span className="text-sm text-green-600 font-medium">Saved!</span>}
          {error && <span className="text-sm text-red-500">{error}</span>}
          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-orange-500 text-white text-sm font-semibold px-5 py-2 rounded-lg hover:bg-orange-600 transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>

      {/* Homeowner tiers */}
      <section className="mb-8">
        <h2 className="text-lg font-bold text-dark mb-1">Homeowner Quote Tiers</h2>
        <p className="text-sm text-dark/50 mb-4">One-time payment per quote search. Charged via Stripe only when providers respond.</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Object.entries(HOMEOWNER_TIER_LABELS).map(([tierId, label]) => (
            <HomeownerTierRow
              key={tierId}
              tierId={tierId}
              label={label}
              config={config.homeowner[tierId] ?? DEFAULT_PRICING.homeowner[tierId]}
              onChange={(updated) => updateHomeownerTier(tierId, updated)}
            />
          ))}
        </div>
      </section>

      {/* Business plans */}
      <section>
        <h2 className="text-lg font-bold text-dark mb-1">Business Plans</h2>
        <p className="text-sm text-dark/50 mb-4">Monthly subscription pricing. Per-property fees apply on top of base price.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Object.entries(BUSINESS_PLAN_LABELS).map(([planId, label]) => (
            <BusinessPlanRow
              key={planId}
              planId={planId}
              label={label}
              config={config.business[planId] ?? DEFAULT_PRICING.business[planId]}
              onChange={(updated) => updateBusinessPlan(planId, updated)}
              readOnly={planId === 'enterprise' || planId === 'trial'}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
