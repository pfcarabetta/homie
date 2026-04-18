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
  const [billingStatus, setBillingStatus] = useState<{
    hasSubscription: boolean; status: string | null; currentPeriodEnd: string | null; hasPaymentMethod: boolean;
  } | null>(null);
  const [invoices, setInvoices] = useState<Array<{ id: string; status: string | null; amountDue: number; amountPaid: number; created: number; hostedUrl: string | null; pdf: string | null }>>([]);
  const [subscribing, setSubscribing] = useState(false);
  const [openingPortal, setOpeningPortal] = useState(false);

  useEffect(() => {
    businessService.getUsage(workspace.id).then(res => { if (res.data) setUsage(res.data); }).catch(() => {});
    businessService.getWorkspacePricing(workspace.id).then(res => { if (res.data) setWsPricing(res.data); }).catch(() => {});
    businessService.getBillingStatus(workspace.id).then(res => { if (res.data) setBillingStatus(res.data); }).catch(() => {});
    businessService.getBillingInvoices(workspace.id).then(res => { if (res.data) setInvoices(res.data.invoices); }).catch(() => {});
  }, [workspace.id]);

  const isActive = billingStatus?.hasSubscription && billingStatus.status === 'active';
  const isPastDue = billingStatus?.status === 'past_due';
  const base = wsPricing?.base ?? usage?.base_price ?? 0;
  const perProp = wsPricing?.perProperty ?? usage?.per_property_price ?? 0;
  const propCount = usage?.property_count ?? 0;
  const estMonthly = base + perProp * propCount;

  async function handleSubscribe() {
    setSubscribing(true);
    try {
      const res = await businessService.createBillingCheckout(workspace.id);
      if (res.data?.checkoutUrl) {
        window.location.href = res.data.checkoutUrl;
      } else if (res.error) {
        alert(res.error);
      }
    } catch (err) { alert((err as Error).message); }
    setSubscribing(false);
  }

  async function handleManageBilling() {
    setOpeningPortal(true);
    try {
      const res = await businessService.openBillingPortal(workspace.id);
      if (res.data?.portalUrl) {
        window.location.href = res.data.portalUrl;
      } else if (res.error) {
        alert(res.error);
      }
    } catch (err) { alert((err as Error).message); }
    setOpeningPortal(false);
  }

  async function handlePlanChange(newPlan: string) {
    setChangingPlan(newPlan);
    try {
      const res = await businessService.updateWorkspace(workspace.id, { plan: newPlan } as Record<string, unknown>);
      if (res.data) {
        onUpdated({ ...workspace, plan: newPlan });
        const usageRes = await businessService.getUsage(workspace.id);
        if (usageRes.data) setUsage(usageRes.data);
        businessService.getWorkspacePricing(workspace.id).then(r => { if (r.data) setWsPricing(r.data); }).catch(() => {});
      }
    } catch { /* ignore */ }
    setChangingPlan(null);
  }

  return (
    <div>
      {/* Subscription status banner */}
      {isPastDue && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 12, padding: '14px 20px', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#DC2626' }}>Payment failed</div>
            <div style={{ fontSize: 13, color: 'var(--bp-muted)' }}>Your last payment didn't go through. Please update your payment method to keep your service active.</div>
          </div>
          <button onClick={handleManageBilling} style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: '#DC2626', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            Update payment →
          </button>
        </div>
      )}

      {/* Current plan & billing */}
      {usage && (
        <div style={{ background: 'var(--bp-card)', borderRadius: 12, border: '1px solid var(--bp-border)', padding: 24, marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
            <h4 style={{ fontFamily: 'Fraunces, serif', fontSize: 18, color: D, margin: 0 }}>Current Plan & Billing</h4>
            {isActive && (
              <button onClick={handleManageBilling} disabled={openingPortal}
                style={{ padding: '8px 18px', borderRadius: 8, border: '1px solid var(--bp-border)', background: 'var(--bp-card)', color: D, fontSize: 13, fontWeight: 600, cursor: openingPortal ? 'default' : 'pointer', opacity: openingPortal ? 0.6 : 1 }}>
                {openingPortal ? 'Opening...' : 'Manage Billing'}
              </button>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 16 }}>
            <div style={{ background: 'var(--bp-bg)', borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: 'var(--bp-subtle)', marginBottom: 2 }}>Plan</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: D }}>
                {wsPricing?.planLabel ?? usage.plan.charAt(0).toUpperCase() + usage.plan.slice(1)}
                {wsPricing?.isCustom && (
                  <span style={{ fontSize: 9, fontWeight: 700, background: `${O}15`, color: O, padding: '2px 6px', borderRadius: 100, marginLeft: 6, verticalAlign: 'middle' }}>CUSTOM</span>
                )}
              </div>
            </div>
            <div style={{ background: 'var(--bp-bg)', borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: 'var(--bp-subtle)', marginBottom: 2 }}>Properties</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: D }}>{propCount}</div>
            </div>
            <div style={{ background: 'var(--bp-bg)', borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: 'var(--bp-subtle)', marginBottom: 2 }}>Monthly total</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: O }}>
                ${estMonthly}/mo
              </div>
              <div style={{ fontSize: 10, color: 'var(--bp-subtle)' }}>
                ${base} base + ${perProp} × {propCount} properties
              </div>
            </div>
            {billingStatus?.currentPeriodEnd && (
              <div style={{ background: 'var(--bp-bg)', borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: 'var(--bp-subtle)', marginBottom: 2 }}>Next billing</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: D }}>
                  {new Date(billingStatus.currentPeriodEnd).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </div>
              </div>
            )}
          </div>

          {/* Subscribe CTA if no active subscription. Now also shown for trialing
              workspaces so they can convert before the 14-day window closes. */}
          {!isActive && !isPastDue && (
            <div style={{
              background: `${O}08`, border: `1px solid ${O}30`, borderRadius: 12,
              padding: 20, textAlign: 'center', marginBottom: 16,
            }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: D, marginBottom: 6 }}>Start your subscription</div>
              <div style={{ fontSize: 13, color: 'var(--bp-muted)', marginBottom: 14, lineHeight: 1.5 }}>
                Set up monthly billing to keep your workspace active. You'll be charged ${estMonthly}/mo based on your current plan and {propCount} properties.
                {perProp > 0 && ' If you add or remove properties, the change takes effect on your next billing cycle.'}
              </div>
              <button onClick={handleSubscribe} disabled={subscribing}
                style={{
                  padding: '12px 32px', borderRadius: 100, border: 'none',
                  background: O, color: '#fff', fontSize: 15, fontWeight: 600,
                  cursor: subscribing ? 'default' : 'pointer', opacity: subscribing ? 0.6 : 1,
                  fontFamily: "'DM Sans', sans-serif",
                }}>
                {subscribing ? 'Redirecting to checkout...' : `Subscribe — $${estMonthly}/mo`}
              </button>
            </div>
          )}

          <div style={{ background: 'var(--bp-bg)', borderRadius: 10, padding: '14px 16px' }}>
            <div style={{ fontSize: 13, color: 'var(--bp-muted)', lineHeight: 1.6 }}>
              <strong style={{ color: D }}>Unlimited searches</strong> — your plan includes unlimited diagnostic chats and outreach searches across all properties. Fair use: {wsPricing?.searchesPerProperty ?? 5} searches per property per month.
            </div>
            <div style={{ fontSize: 12, color: 'var(--bp-subtle)', marginTop: 8 }}>
              Searches this cycle: <strong style={{ color: D }}>{usage.searches_used}</strong> · Resets {new Date(usage.billing_cycle_end).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </div>
          </div>
        </div>
      )}

      {/* Invoice history */}
      {invoices.length > 0 && (
        <div style={{ background: 'var(--bp-card)', borderRadius: 12, border: '1px solid var(--bp-border)', padding: 24, marginBottom: 24 }}>
          <h4 style={{ fontFamily: 'Fraunces, serif', fontSize: 18, color: D, margin: '0 0 16px' }}>Invoice History</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {invoices.map((inv, i) => (
              <div key={inv.id} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0',
                borderBottom: i < invoices.length - 1 ? '1px solid #F0EDE9' : 'none', flexWrap: 'wrap', gap: 8,
              }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: D }}>
                    {new Date(inv.created * 1000).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--bp-subtle)', marginTop: 2 }}>
                    <span style={{
                      fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 100,
                      background: inv.status === 'paid' ? '#F0FDF4' : inv.status === 'open' ? '#FFF8F0' : '#F5F5F5',
                      color: inv.status === 'paid' ? G : inv.status === 'open' ? '#D97706' : '#9B9490',
                      textTransform: 'uppercase',
                    }}>{inv.status}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: 15, fontWeight: 700, color: D }}>${(inv.amountPaid / 100).toFixed(2)}</span>
                  {inv.hostedUrl && (
                    <a href={inv.hostedUrl} target="_blank" rel="noopener" style={{ fontSize: 12, color: O, fontWeight: 600, textDecoration: 'none' }}>View</a>
                  )}
                  {inv.pdf && (
                    <a href={inv.pdf} target="_blank" rel="noopener" style={{ fontSize: 12, color: 'var(--bp-muted)', fontWeight: 500, textDecoration: 'none' }}>PDF</a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Plan comparison */}
      <div style={{ marginBottom: 24 }}>
        <h4 style={{ fontFamily: 'Fraunces, serif', fontSize: 18, color: D, margin: '0 0 16px' }}>
          {isActive ? 'Change Plan' : 'Choose a Plan'}
        </h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
          {BILLING_PLANS.map(p => {
            const isCurrent = workspace.plan === p.plan;
            const isDowngrade = BILLING_PLANS.findIndex(x => x.plan === workspace.plan) > BILLING_PLANS.findIndex(x => x.plan === p.plan);
            const exceedsLimit = isDowngrade && propCount > p.maxProperties;
            return (
              <div key={p.plan} style={{
                background: 'var(--bp-card)', borderRadius: 14, padding: 20,
                border: isCurrent ? `2px solid ${O}` : '1px solid var(--bp-border)',
                position: 'relative',
              }}>
                {isCurrent && (
                  <div style={{ position: 'absolute', top: -10, left: '50%', transform: 'translateX(-50%)', background: O, color: '#fff', fontSize: 10, fontWeight: 700, padding: '3px 12px', borderRadius: 100 }}>CURRENT</div>
                )}
                <div style={{ fontSize: 18, fontWeight: 700, color: D, marginBottom: 2 }}>{p.label}</div>
                <div style={{ marginBottom: 4 }}>
                  <span style={{ fontSize: 28, fontWeight: 700, color: D }}>${p.promoPrice ?? p.price}</span>
                  <span style={{ fontSize: 13, color: 'var(--bp-subtle)' }}>/mo</span>
                  {p.promoPrice != null && (
                    <span style={{ fontSize: 14, color: 'var(--bp-subtle)', textDecoration: 'line-through', marginLeft: 6 }}>${p.price}</span>
                  )}
                  <span style={{ fontSize: 12, color: 'var(--bp-muted)', marginLeft: 4 }}>+ ${p.perProperty}/property</span>
                </div>
                {p.promoLabel && <div style={{ fontSize: 11, fontWeight: 600, color: O, marginBottom: 8 }}>{p.promoLabel}</div>}
                <div style={{ borderTop: '1px solid var(--bp-border)', paddingTop: 12, marginBottom: 14 }}>
                  {p.features.map((f, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, fontSize: 13, color: 'var(--bp-muted)' }}>
                      <span style={{ color: G, fontSize: 11 }}>✓</span> {f}
                    </div>
                  ))}
                </div>
                {isCurrent ? (
                  <div style={{ textAlign: 'center', fontSize: 13, color: 'var(--bp-subtle)', fontWeight: 600, padding: '10px 0' }}>Your current plan</div>
                ) : exceedsLimit ? (
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ padding: '10px 0', fontSize: 13, color: '#DC2626', fontWeight: 600 }}>
                      You have {propCount} properties (max {p.maxProperties})
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--bp-subtle)' }}>Remove properties to downgrade</div>
                  </div>
                ) : (
                  <button disabled={changingPlan === p.plan} onClick={() => handlePlanChange(p.plan)}
                    style={{
                      width: '100%', padding: '10px 0', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer',
                      border: isDowngrade ? '1px solid var(--bp-border)' : 'none',
                      background: isDowngrade ? 'var(--bp-card)' : O,
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
          <span style={{ fontSize: 13, color: 'var(--bp-subtle)' }}>Need 150+ properties? </span>
          <a href="mailto:yo@homiepro.ai" style={{ fontSize: 13, color: O, fontWeight: 600, textDecoration: 'none' }}>Contact us for Enterprise pricing →</a>
        </div>
        {isActive && (
          <div style={{ textAlign: 'center', marginTop: 8, fontSize: 12, color: 'var(--bp-subtle)' }}>
            Plan changes take effect on your next billing cycle. Property count updates are reflected at renewal.
          </div>
        )}
      </div>

      {/* Cancel service */}
      {isActive && (
        <div style={{ background: 'var(--bp-card)', borderRadius: 12, border: '1px solid var(--bp-border)', padding: 24 }}>
          <h4 style={{ fontFamily: 'Fraunces, serif', fontSize: 18, color: D, margin: '0 0 8px' }}>Cancel Subscription</h4>
          {!showCancel ? (
            <>
              <p style={{ fontSize: 14, color: 'var(--bp-muted)', marginBottom: 12, lineHeight: 1.6 }}>
                If you cancel, your workspace will remain accessible until the end of your current billing cycle{billingStatus?.currentPeriodEnd ? ` (${new Date(billingStatus.currentPeriodEnd).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })})` : ''}. After that, data is retained for 30 days.
              </p>
              <button onClick={() => setShowCancel(true)}
                style={{ fontSize: 13, color: '#DC2626', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500, padding: 0 }}>
                Cancel my subscription
              </button>
            </>
          ) : (
            <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, padding: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#DC2626', marginBottom: 6 }}>Are you sure?</div>
              <div style={{ fontSize: 13, color: 'var(--bp-muted)', marginBottom: 12, lineHeight: 1.6 }}>
                You can manage or cancel your subscription directly through the billing portal.
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setShowCancel(false)}
                  style={{ flex: 1, padding: '10px 0', borderRadius: 8, border: '1px solid var(--bp-border)', background: 'var(--bp-card)', fontSize: 13, fontWeight: 600, cursor: 'pointer', color: D }}>
                  Keep my plan
                </button>
                <button onClick={handleManageBilling}
                  style={{ flex: 1, padding: '10px 0', borderRadius: 8, border: 'none', background: '#DC2626', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                  Go to billing portal
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
