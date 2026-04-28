import { useState, useEffect, useRef, type CSSProperties } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import SEO from '@/components/SEO';
import { inspectService, type PartnerProfile } from '@/services/inspector-api';
import { trackEvent } from '@/services/analytics';
import { captureReferrerIfPresent } from '@/services/referral-tracking';

/**
 * Co-branded inspector partner landing page at /inspect/p/:slug.
 *
 * Mirrors the main /inspect landing page's visual language but is
 * scoped to a single inspector partner — header co-brands the
 * inspector + Homie, the "why this matters" section name-drops the
 * inspector, the pricing block uses the inspector's per-tier retail
 * prices (set in their Settings, with suggested defaults as fallback).
 *
 * On mount it captures the slug as a referrer attribution (same
 * helper the main landing uses), so when the homeowner uploads —
 * whether immediately or days later — the partner gets credited.
 */

const C = {
  orange: '#E8632B', orangeDark: '#C8531E',
  green: '#1B9E77', greenLight: '#E1F5EE',
  dark: '#2D2926', darkMid: '#4A4543',
  gray: '#9B9490', grayLight: '#D3CEC9',
  warm: '#F9F5F2', white: '#FFFFFF',
};

const dm: CSSProperties = { fontFamily: "'DM Sans', sans-serif" };
const fr: CSSProperties = { fontFamily: 'Fraunces, serif' };

function formatCents(cents: number): string {
  return `$${Math.round(cents / 100)}`;
}

function initials(name: string): string {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

const TIER_DETAILS: Record<'essential' | 'professional' | 'premium', { tagline: string; bullets: string[]; emphasis?: boolean }> = {
  essential: {
    tagline: 'See your report in a new light',
    bullets: [
      'Every item with a real cost estimate',
      'Severity + category at a glance',
      'Source page references back to the PDF',
    ],
  },
  professional: {
    tagline: 'Quote and dispatch in one tap',
    bullets: [
      'Everything in Essential',
      'Real local quotes from vetted pros',
      'Bundle multiple items into one dispatch',
    ],
    emphasis: true,
  },
  premium: {
    tagline: 'Negotiate, plan, and maintain',
    bullets: [
      'Everything in Professional',
      'Repair-request PDFs for the seller',
      'Year-round maintenance timeline',
    ],
  },
};

interface PartnerHeaderProps {
  partner: PartnerProfile;
}

function CoBrandHeader({ partner }: PartnerHeaderProps) {
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 14,
      background: C.white, borderRadius: 100, padding: '8px 18px 8px 8px',
      border: `1px solid ${C.grayLight}`,
      boxShadow: '0 2px 12px rgba(45,41,38,0.06)',
    }}>
      {partner.companyLogoUrl ? (
        <img
          src={partner.companyLogoUrl}
          alt={partner.companyName}
          style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
        />
      ) : (
        <div style={{
          width: 36, height: 36, borderRadius: '50%', background: C.dark,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: C.white, ...dm, fontSize: 13, fontWeight: 700, flexShrink: 0,
        }}>
          {initials(partner.companyName)}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, ...dm, fontSize: 13, fontWeight: 600, color: C.dark, whiteSpace: 'nowrap' }}>
        <span>{partner.companyName}</span>
        <span style={{ color: C.gray, fontSize: 11, fontWeight: 500 }}>×</span>
        <span style={{ ...fr, fontSize: 18, fontWeight: 700, color: C.orange, lineHeight: 1 }}>homie</span>
      </div>
    </div>
  );
}

export default function InspectionPartnerLanding() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [partner, setPartner] = useState<PartnerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Capture this partner as the referrer on mount (first-touch only).
  // Same helper the main landing uses — keeps attribution consistent
  // whether the homeowner enters via /inspect?ref=X or /inspect/p/X.
  useEffect(() => {
    captureReferrerIfPresent();
    if (!slug) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await inspectService.getPartnerProfile(slug);
        if (cancelled) return;
        if (res.data) {
          setPartner(res.data);
          // Stash the slug as the referrer too, since this page lands
          // without a ?ref= query param. Use the same storage keys.
          try {
            if (!localStorage.getItem('homie_referrer_partner')) {
              localStorage.setItem('homie_referrer_partner', res.data.partnerSlug);
              const expires = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toUTCString();
              document.cookie = `homie_ref=${encodeURIComponent(res.data.partnerSlug)}; expires=${expires}; path=/; SameSite=Lax`;
            }
          } catch { /* localStorage unavailable — cookie is the fallback */ }
          trackEvent('inspect_partner_landing_viewed', { partner_slug: res.data.partnerSlug });
        } else {
          setNotFound(true);
        }
      } catch {
        if (!cancelled) setNotFound(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [slug]);

  async function handleFileUpload(file: File) {
    if (file.size > 50 * 1024 * 1024) {
      setUploadStatus('File too large (max 50MB)');
      return;
    }
    setUploading(true);
    setUploadStatus('Uploading your report...');
    trackEvent('inspect_partner_landing_upload_started', { partner_slug: partner?.partnerSlug });
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(file);
      });
      const res = await inspectService.uploadReport({
        report_file_data_url: dataUrl,
        property_address: '',
        ...(partner?.partnerSlug ? { referrer_partner: partner.partnerSlug } : {}),
      });
      if (res.data) {
        setUploadStatus('Report uploaded! Redirecting...');
        setTimeout(() => navigate(`/inspect-portal?report=${res.data!.reportId}`), 800);
      } else {
        setUploadStatus(res.error ?? 'Upload failed');
        setUploading(false);
      }
    } catch (err) {
      setUploadStatus(err instanceof Error ? err.message : 'Upload failed');
      setUploading(false);
    }
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: C.warm, display: 'flex', alignItems: 'center', justifyContent: 'center', ...dm, color: C.gray }}>
        Loading...
      </div>
    );
  }
  if (notFound || !partner) {
    return (
      <div style={{ minHeight: '100vh', background: C.warm, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16, padding: 24 }}>
        <h1 style={{ ...fr, fontSize: 28, fontWeight: 700, color: C.dark, margin: 0 }}>Partner not found</h1>
        <p style={{ ...dm, fontSize: 14, color: C.gray, margin: 0 }}>Double-check the URL with your inspector.</p>
        <a href="/inspect" style={{ ...dm, fontSize: 14, color: C.orange, fontWeight: 600, textDecoration: 'none' }}>
          Go to homiepro.ai/inspect →
        </a>
      </div>
    );
  }

  const tiersInOrder: Array<'essential' | 'professional' | 'premium'> = ['essential', 'professional', 'premium'];
  const tierByName = Object.fromEntries(partner.tiers.map(t => [t.tier, t])) as Record<string, PartnerProfile['tiers'][number]>;
  const anyCustomPrice = partner.tiers.some(t => t.isCustomPrice);

  return (
    <div style={{ minHeight: '100vh', background: C.warm }}>
      <SEO
        title={`${partner.companyName} × Homie`}
        description={`Get real cost estimates, instant local quotes, and a maintenance plan for every item in your ${partner.companyName} inspection report.`}
        canonical={`/inspect/p/${partner.partnerSlug}`}
      />
      <link href="https://fonts.googleapis.com/css2?family=Fraunces:wght@400;700&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />

      {/* Top bar */}
      <nav style={{
        background: C.warm, borderBottom: `1px solid ${C.grayLight}`,
        padding: '14px 24px', position: 'sticky', top: 0, zIndex: 50,
      }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <CoBrandHeader partner={partner} />
          <a href="#pricing" onClick={() => trackEvent('inspect_partner_landing_cta_clicked', { cta_location: 'nav_pricing', partner_slug: partner.partnerSlug })} style={{
            ...dm, fontSize: 14, color: C.dark, fontWeight: 600, textDecoration: 'none',
            background: C.white, border: `1px solid ${C.grayLight}`, borderRadius: 100,
            padding: '8px 18px',
          }}>
            See pricing
          </a>
        </div>
      </nav>

      {/* HERO */}
      <section style={{
        padding: '72px 24px 56px', position: 'relative', overflow: 'hidden',
        background: `linear-gradient(165deg, ${C.warm} 0%, ${C.white} 50%, ${C.greenLight} 100%)`,
      }}>
        <div style={{ position: 'absolute', top: -180, right: -180, width: 540, height: 540, borderRadius: '50%', background: C.orange, opacity: 0.04 }} />
        <div style={{ maxWidth: 1100, margin: '0 auto', position: 'relative', zIndex: 1 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            background: C.white, border: `1px solid ${C.green}30`, borderRadius: 100,
            padding: '6px 14px', marginBottom: 20,
            ...dm, fontSize: 12, fontWeight: 600, color: C.green,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.green }} />
            Exclusive partner — {partner.companyName}
          </div>
          <h1 style={{
            ...fr, fontSize: 'clamp(34px, 4.5vw, 56px)', fontWeight: 700, color: C.dark,
            lineHeight: 1.08, margin: '0 0 20px', maxWidth: 780,
          }}>
            Your {partner.companyName} inspection,<br />
            now with <span style={{ color: C.orange }}>real numbers</span> behind every item
          </h1>
          <p style={{
            ...dm, fontSize: 'clamp(16px, 1.6vw, 19px)', color: C.darkMid, lineHeight: 1.55,
            maxWidth: 640, margin: '0 0 36px',
          }}>
            {partner.companyName} found the issues — Homie tells you what each one will actually cost to fix, with quotes from local pros and a maintenance plan that follows you home.
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              style={{
                ...dm, fontSize: 16, fontWeight: 600, color: C.white,
                background: uploading ? C.gray : C.orange, border: 'none', borderRadius: 100,
                padding: '15px 32px', cursor: uploading ? 'not-allowed' : 'pointer',
                boxShadow: '0 4px 24px rgba(232,99,43,0.25)', transition: 'all 0.2s',
              }}
              onMouseEnter={e => { if (!uploading) (e.currentTarget as HTMLElement).style.background = C.orangeDark; }}
              onMouseLeave={e => { if (!uploading) (e.currentTarget as HTMLElement).style.background = C.orange; }}
            >
              {uploading ? (uploadStatus ?? 'Uploading...') : 'Upload your inspection PDF'}
            </button>
            <a href="#pricing" style={{
              ...dm, fontSize: 14, color: C.darkMid, fontWeight: 600, textDecoration: 'none',
              padding: '15px 22px',
            }}>
              See {partner.companyName} pricing →
            </a>
          </div>
          <input
            ref={fileInputRef} type="file" accept="application/pdf" style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; if (f) void handleFileUpload(f); }}
          />
          <div style={{
            ...dm, fontSize: 12, color: C.gray, marginTop: 14,
            display: 'flex', alignItems: 'center', gap: 6, letterSpacing: 0.4,
            textTransform: 'uppercase', fontWeight: 600,
          }}>
            <span>📄 PDF or HTML · parsed in 2–5 min · no account needed</span>
          </div>

          {/* Inspector trust strip */}
          <div style={{
            display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'center',
            marginTop: 48, paddingTop: 24, borderTop: `1px solid ${C.grayLight}`,
          }}>
            {partner.licenseNumber && (
              <div>
                <div style={{ ...dm, fontSize: 10, color: C.gray, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>License</div>
                <div style={{ ...dm, fontSize: 14, color: C.dark, fontWeight: 600 }}>#{partner.licenseNumber}</div>
              </div>
            )}
            {partner.certifications.length > 0 && (
              <div>
                <div style={{ ...dm, fontSize: 10, color: C.gray, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>Certifications</div>
                <div style={{ ...dm, fontSize: 14, color: C.dark, fontWeight: 600 }}>{partner.certifications.join(' · ')}</div>
              </div>
            )}
            {partner.serviceAreaZips.length > 0 && (
              <div>
                <div style={{ ...dm, fontSize: 10, color: C.gray, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>Service area</div>
                <div style={{ ...dm, fontSize: 14, color: C.dark, fontWeight: 600 }}>
                  {partner.serviceAreaZips.slice(0, 3).join(', ')}{partner.serviceAreaZips.length > 3 ? ` +${partner.serviceAreaZips.length - 3} more` : ''}
                </div>
              </div>
            )}
            {partner.website && (
              <a href={partner.website} target="_blank" rel="noopener noreferrer" style={{
                ...dm, fontSize: 13, color: C.orange, fontWeight: 600,
                textDecoration: 'none', marginLeft: 'auto',
              }}>
                Visit {partner.companyName} →
              </a>
            )}
          </div>
        </div>
      </section>

      {/* Why this matters with the inspector */}
      <section style={{ padding: '72px 24px', background: C.white }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <div style={{ ...dm, fontSize: 12, color: C.orange, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12 }}>
              Why {partner.companyName} partners with Homie
            </div>
            <h2 style={{ ...fr, fontSize: 'clamp(28px, 3.5vw, 40px)', fontWeight: 700, color: C.dark, lineHeight: 1.15, margin: 0, maxWidth: 720, marginInline: 'auto' }}>
              The inspection report is just the start. Homie makes it actionable.
            </h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
            <ValueCard
              icon="🔍"
              title="Every item, real cost"
              desc={`${partner.companyName} flagged it — Homie tells you what it'll cost. No more "I'll get back to you" estimates from your inspector.`}
              accent={C.orange}
            />
            <ValueCard
              icon="🛠"
              title="Local pros, instant quotes"
              desc="Homie dispatches your repairs to vetted local pros and collects real quotes within hours. No phone tag, no Google rabbit hole."
              accent={C.green}
            />
            <ValueCard
              icon="📅"
              title="Your home, year-round"
              desc="When you upgrade to Premium, your report becomes a maintenance timeline. Homie reminds you what to service, when."
              accent="#1565C0"
            />
          </div>
        </div>
      </section>

      {/* Inspector-specific pricing */}
      <section id="pricing" style={{ padding: '72px 24px', background: C.warm }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <div style={{ ...dm, fontSize: 12, color: C.green, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12 }}>
              {anyCustomPrice ? `Exclusive ${partner.companyName} pricing` : `${partner.companyName} client pricing`}
            </div>
            <h2 style={{ ...fr, fontSize: 'clamp(28px, 3.5vw, 40px)', fontWeight: 700, color: C.dark, lineHeight: 1.15, margin: 0 }}>
              Pick the tier that fits your home
            </h2>
            <p style={{ ...dm, fontSize: 16, color: C.darkMid, lineHeight: 1.55, margin: '16px auto 0', maxWidth: 580 }}>
              One-time fee per report. No subscription, no surprises.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20, alignItems: 'stretch' }}>
            {tiersInOrder.map(tier => {
              const data = tierByName[tier];
              const details = TIER_DETAILS[tier];
              if (!data) return null;
              const featured = !!details.emphasis;
              return (
                <div key={tier} style={{
                  background: C.white, borderRadius: 18,
                  border: featured ? `2px solid ${C.orange}` : `1px solid ${C.grayLight}`,
                  padding: '28px 24px',
                  display: 'flex', flexDirection: 'column', gap: 18,
                  position: 'relative',
                  boxShadow: featured ? '0 12px 32px -16px rgba(232,99,43,0.4)' : '0 2px 8px -4px rgba(45,41,38,0.08)',
                  transform: featured ? 'translateY(-8px)' : 'translateY(0)',
                }}>
                  {featured && (
                    <div style={{
                      position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)',
                      background: C.orange, color: C.white, ...dm, fontSize: 10,
                      fontWeight: 700, padding: '4px 12px', borderRadius: 100,
                      textTransform: 'uppercase', letterSpacing: 0.5,
                    }}>
                      Most popular
                    </div>
                  )}
                  <div>
                    <div style={{ ...dm, fontSize: 11, color: C.gray, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700, marginBottom: 4 }}>
                      {tier}
                    </div>
                    <div style={{ ...fr, fontSize: 18, fontWeight: 600, color: C.dark }}>
                      {details.tagline}
                    </div>
                  </div>
                  <div>
                    <span style={{ ...fr, fontSize: 44, fontWeight: 700, color: C.dark, lineHeight: 1 }}>
                      {formatCents(data.retailCents)}
                    </span>
                    <span style={{ ...dm, fontSize: 14, color: C.gray, marginLeft: 6 }}>one-time</span>
                    {data.isCustomPrice && (
                      <div style={{ ...dm, fontSize: 11, color: C.green, fontWeight: 600, marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span>★</span>
                        <span>{partner.companyName} client rate</span>
                      </div>
                    )}
                  </div>
                  <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {details.bullets.map(b => (
                      <li key={b} style={{ ...dm, fontSize: 14, color: C.darkMid, display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                        <span style={{ color: C.green, fontWeight: 700, flexShrink: 0 }}>✓</span>
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>
                  <button
                    onClick={() => { trackEvent('inspect_partner_landing_pricing_clicked', { partner_slug: partner.partnerSlug, tier }); fileInputRef.current?.click(); }}
                    disabled={uploading}
                    style={{
                      ...dm, fontSize: 14, fontWeight: 600,
                      color: featured ? C.white : C.dark,
                      background: featured ? C.orange : C.white,
                      border: featured ? 'none' : `1.5px solid ${C.dark}`,
                      borderRadius: 100, padding: '12px 20px',
                      cursor: uploading ? 'not-allowed' : 'pointer',
                      marginTop: 'auto',
                      transition: 'all 0.15s',
                    }}
                  >
                    Choose {tier}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* How it works (condensed) */}
      <section style={{ padding: '72px 24px', background: C.white }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <h2 style={{ ...fr, fontSize: 'clamp(26px, 3vw, 36px)', fontWeight: 700, color: C.dark, textAlign: 'center', margin: '0 0 40px' }}>
            How it works
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 24 }}>
            {[
              { num: '1', title: `Get inspected by ${partner.companyName}`, desc: 'They deliver the standard PDF report after the inspection.' },
              { num: '2', title: 'Upload your PDF here', desc: 'Drop it on this page. Homie\'s AI parses every item in 2–5 minutes.' },
              { num: '3', title: 'Negotiate, dispatch, plan', desc: 'Use the cost estimates with the seller, dispatch to local pros, plan future maintenance.' },
            ].map(step => (
              <div key={step.num}>
                <div style={{
                  width: 36, height: 36, borderRadius: '50%', background: C.orange,
                  color: C.white, ...fr, fontSize: 18, fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  marginBottom: 14,
                }}>{step.num}</div>
                <div style={{ ...fr, fontSize: 18, fontWeight: 700, color: C.dark, marginBottom: 6 }}>{step.title}</div>
                <div style={{ ...dm, fontSize: 14, color: C.darkMid, lineHeight: 1.55 }}>{step.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section style={{ padding: '72px 24px', background: C.dark, color: C.white, textAlign: 'center' }}>
        <div style={{ maxWidth: 700, margin: '0 auto' }}>
          <h2 style={{ ...fr, fontSize: 'clamp(28px, 3.5vw, 40px)', fontWeight: 700, color: C.white, lineHeight: 1.15, margin: '0 0 16px' }}>
            Ready to make your inspection actionable?
          </h2>
          <p style={{ ...dm, fontSize: 16, color: '#D3CEC9', lineHeight: 1.55, margin: '0 0 32px' }}>
            Upload your {partner.companyName} report and see what every item will actually cost — no account required.
          </p>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            style={{
              ...dm, fontSize: 16, fontWeight: 600, color: C.white,
              background: uploading ? C.gray : C.orange, border: 'none', borderRadius: 100,
              padding: '15px 36px', cursor: uploading ? 'not-allowed' : 'pointer',
              boxShadow: '0 4px 24px rgba(232,99,43,0.4)',
            }}
          >
            {uploading ? (uploadStatus ?? 'Uploading...') : 'Upload your inspection PDF'}
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ padding: '32px 24px', background: C.dark, borderTop: '1px solid #3A3534' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ ...dm, fontSize: 12, color: C.gray }}>
            © {new Date().getFullYear()} Homie. Co-branded with {partner.companyName}.
          </div>
          <div style={{ display: 'flex', gap: 24, ...dm, fontSize: 12, color: C.gray }}>
            <a href="/inspect" style={{ color: C.gray, textDecoration: 'none' }}>About Homie Inspect</a>
            <a href="/privacy" style={{ color: C.gray, textDecoration: 'none' }}>Privacy</a>
            <a href="/terms" style={{ color: C.gray, textDecoration: 'none' }}>Terms</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

interface ValueCardProps {
  icon: string;
  title: string;
  desc: string;
  accent: string;
}

function ValueCard({ icon, title, desc, accent }: ValueCardProps) {
  return (
    <div style={{
      background: C.white, border: `1px solid ${C.grayLight}`, borderRadius: 14,
      padding: 24, transition: 'border-color 0.15s, transform 0.15s, box-shadow 0.15s',
      display: 'flex', flexDirection: 'column', gap: 12,
    }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = accent; (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'; (e.currentTarget as HTMLElement).style.boxShadow = `0 8px 24px -12px ${accent}40`; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = C.grayLight; (e.currentTarget as HTMLElement).style.transform = 'translateY(0)'; (e.currentTarget as HTMLElement).style.boxShadow = 'none'; }}
    >
      <div style={{ width: 44, height: 44, borderRadius: 12, background: `${accent}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>
        {icon}
      </div>
      <div style={{ ...fr, fontSize: 18, fontWeight: 700, color: C.dark }}>{title}</div>
      <div style={{ ...dm, fontSize: 14, color: C.darkMid, lineHeight: 1.55 }}>{desc}</div>
    </div>
  );
}

