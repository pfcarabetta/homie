import { useState, useEffect } from 'react';
import { usePricing } from '@/hooks/usePricing';
import { businessService, type WorkspaceDetail } from '@/services/api';
import { O, G, D, W, getBillingPlans } from './constants';

export default function BillingTab({ workspace, onUpdated }: { workspace: WorkspaceDetail; onUpdated: (w: WorkspaceDetail) => void }) {
  const { pricing } = usePricing();
  const BILLING_PLANS = getBillingPlans(pricing);
  const [usage, setUsage] = useState<{
    plan: string; searches_used: number; searches_limit: number;
    searches_remaining: number;
    base_price: number; per_property_price: number;
    searches_per_property: number; property_count: number;
    billing_cycle_start: string; billing_cycle_end: string;
  } | null>(null);
  const [changingPlan, setChangingPlan] = useState<string | null>(null);
  const [showCancel, setShowCancel] = useState(false);
  const [wsPricing, setWsPricing] = useState<{
    plan: string; base: number; perProperty: number; maxProperties: number;
    maxTeamMembers: number; searchesPerProperty: number;
    isCustom: boolean; planLabel: string;
  } | null>(null);

  useEffect(() => {
    businessService.getUsage(workspace.id).then(res => {
      if (res.data) setUsage(res.data);
    }).catch(() => {});
    businessService.getWorkspacePricing(workspace.id).then(res => {
      if (res.data) setWsPricing(res.data);
    }).catch(() => {});
  }, [workspace.id]);

  async function handlePlanChange(newPlan: string) {
    setChangingPlan(newPlan);
    try {
      const res = await businessService.updateWorkspace(workspace.id, { plan: newPlan } as Record<string, unknown>);
      if (res.data) {
        onUpdated({ ...workspace, plan: newPlan });
        // Refresh usage
        const usageRes = await businessService.getUsage(workspace.id);
        if (usageRes.data) setUsage(usageRes.data);
      }
    } catch { /* ignore */ }
    setChangingPlan(null);
  }

  return (
    <div>
      {/* Current plan & usage */}
      {usage && (
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E0DAD4', padding: 24, marginBottom: 24 }}>
          <h4 style={{ fontFamily: 'Fraunces, serif', fontSize: 18, color: D, margin: '0 0 20px' }}>Current Plan & Usage</h4>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 16 }}>
            <div style={{ background: W, borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: '#9B9490', marginBottom: 2 }}>Plan</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: D }}>
                {wsPricing?.planLabel ?? usage.plan.charAt(0).toUpperCase() + usage.plan.slice(1)}
                {wsPricing?.isCustom && (
                  <span style={{ fontSize: 9, fontWeight: 700, background: `${O}15`, color: O, padding: '2px 6px', borderRadius: 100, marginLeft: 6, verticalAlign: 'middle' }}>CUSTOM</span>
                )}
              </div>
            </div>
            <div style={{ background: W, borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: '#9B9490', marginBottom: 2 }}>Properties</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: D }}>{usage.property_count}</div>
            </div>
            <div style={{ background: W, borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: '#9B9490', marginBottom: 2 }}>Per property</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: D }}>${wsPricing?.perProperty ?? usage.per_property_price}/mo</div>
            </div>
            <div style={{ background: W, borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: '#9B9490', marginBottom: 2 }}>Est. monthly</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: O }}>${(wsPricing?.base ?? usage.base_price) + (wsPricing?.perProperty ?? usage.per_property_price) * usage.property_count}/mo</div>
            </div>
          </div>

          <div style={{ background: W, borderRadius: 10, padding: '14px 16px' }}>
            <div style={{ fontSize: 13, color: '#6B6560', lineHeight: 1.6 }}>
              <strong style={{ color: D }}>Unlimited searches</strong> — your plan includes unlimited diagnostic chats and outreach searches across all properties. Fair use: 5 searches per property per month.
            </div>
            <div style={{ fontSize: 12, color: '#9B9490', marginTop: 8 }}>
              Searches this cycle: <strong style={{ color: D }}>{usage.searches_used}</strong> · Resets {new Date(usage.billing_cycle_end).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </div>
          </div>
        </div>
      )}

      {/* Plan comparison */}
      <div style={{ marginBottom: 24 }}>
        <h4 style={{ fontFamily: 'Fraunces, serif', fontSize: 18, color: D, margin: '0 0 16px' }}>Change Plan</h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
          {BILLING_PLANS.map(p => {
            const isCurrent = workspace.plan === p.plan;
            const isDowngrade = BILLING_PLANS.findIndex(x => x.plan === workspace.plan) > BILLING_PLANS.findIndex(x => x.plan === p.plan);
            const propertyCount = usage?.property_count ?? 0;
            const exceedsLimit = isDowngrade && propertyCount > p.maxProperties;
            return (
              <div key={p.plan} style={{
                background: '#fff', borderRadius: 14, padding: 20,
                border: isCurrent ? `2px solid ${O}` : '1px solid #E0DAD4',
                position: 'relative',
              }}>
                {isCurrent && (
                  <div style={{ position: 'absolute', top: -10, left: '50%', transform: 'translateX(-50)', background: O, color: '#fff', fontSize: 10, fontWeight: 700, padding: '3px 12px', borderRadius: 100 }}>CURRENT</div>
                )}
                <div style={{ fontSize: 18, fontWeight: 700, color: D, marginBottom: 2 }}>{p.label}</div>
                <div style={{ marginBottom: 4 }}>
                  <span style={{ fontSize: 28, fontWeight: 700, color: D }}>${p.promoPrice ?? p.price}</span>
                  <span style={{ fontSize: 13, color: '#9B9490' }}>/mo</span>
                  {p.promoPrice != null && (
                    <span style={{ fontSize: 14, color: '#9B9490', textDecoration: 'line-through', marginLeft: 6 }}>${p.price}</span>
                  )}
                  <span style={{ fontSize: 12, color: '#6B6560', marginLeft: 4 }}>+ ${p.perProperty}/property</span>
                </div>
                {p.promoLabel && <div style={{ fontSize: 11, fontWeight: 600, color: O, marginBottom: 8 }}>{p.promoLabel}</div>}
                <div style={{ borderTop: '1px solid #E0DAD4', paddingTop: 12, marginBottom: 14 }}>
                  {p.features.map((f, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, fontSize: 13, color: '#6B6560' }}>
                      <span style={{ color: G, fontSize: 11 }}>✓</span> {f}
                    </div>
                  ))}
                </div>
                {isCurrent ? (
                  <div style={{ textAlign: 'center', fontSize: 13, color: '#9B9490', fontWeight: 600, padding: '10px 0' }}>Your current plan</div>
                ) : exceedsLimit ? (
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ padding: '10px 0', fontSize: 13, color: '#DC2626', fontWeight: 600 }}>
                      You have {propertyCount} properties (max {p.maxProperties})
                    </div>
                    <div style={{ fontSize: 11, color: '#9B9490' }}>Remove properties to downgrade</div>
                  </div>
                ) : (
                  <button disabled={changingPlan === p.plan} onClick={() => handlePlanChange(p.plan)}
                    style={{
                      width: '100%', padding: '10px 0', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer',
                      border: isDowngrade ? '1px solid #E0DAD4' : 'none',
                      background: isDowngrade ? '#fff' : O,
                      color: isDowngrade ? D : '#fff',
                      opacity: changingPlan === p.plan ? 0.6 : 1,
                    }}>
                    {changingPlan === p.plan ? 'Changing...' : isDowngrade ? 'Downgrade' : 'Upgrade'}
                  </button>
                )}
              </div>
            );
          })}
        </div>
        <div style={{ textAlign: 'center', marginTop: 12 }}>
          <span style={{ fontSize: 13, color: '#9B9490' }}>Need 150+ properties? </span>
          <a href="mailto:yo@homiepro.ai" style={{ fontSize: 13, color: O, fontWeight: 600, textDecoration: 'none' }}>Contact us for Enterprise pricing →</a>
        </div>
      </div>

      {/* Cancel service */}
      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E0DAD4', padding: 24 }}>
        <h4 style={{ fontFamily: 'Fraunces, serif', fontSize: 18, color: D, margin: '0 0 8px' }}>Cancel Service</h4>
        {!showCancel ? (
          <>
            <p style={{ fontSize: 14, color: '#6B6560', marginBottom: 12, lineHeight: 1.6 }}>
              If you cancel, your workspace will remain accessible until the end of your current billing cycle. After that, all data will be retained for 30 days before deletion.
            </p>
            <button onClick={() => setShowCancel(true)}
              style={{ fontSize: 13, color: '#DC2626', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500, padding: 0 }}>
              Cancel my subscription
            </button>
          </>
        ) : (
          <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, padding: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#DC2626', marginBottom: 6 }}>Are you sure?</div>
            <div style={{ fontSize: 13, color: '#6B6560', marginBottom: 12, lineHeight: 1.6 }}>
              Your workspace and all associated data (properties, dispatches, bookings, provider settings) will be deactivated at the end of your billing cycle.
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setShowCancel(false)}
                style={{ flex: 1, padding: '10px 0', borderRadius: 8, border: '1px solid #E0DAD4', background: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', color: D }}>
                Keep my plan
              </button>
              <button onClick={() => { alert('Please contact yo@homiepro.ai to complete your cancellation.'); setShowCancel(false); }}
                style={{ flex: 1, padding: '10px 0', borderRadius: 8, border: 'none', background: '#DC2626', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                Yes, cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
