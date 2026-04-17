import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { inspectService, type InspectReportPublic } from '@/services/inspector-api';
import { useAuth } from '@/contexts/AuthContext';

const O = '#E8632B';
const G = '#1B9E77';
const D = '#2D2926';
const W = '#F9F5F2';

const CATEGORY_LABELS: Record<string, string> = {
  plumbing: 'Plumbing', electrical: 'Electrical', hvac: 'HVAC', roofing: 'Roofing',
  structural: 'Structural', general_repair: 'General', pest_control: 'Pest Control',
  safety: 'Safety', cosmetic: 'Cosmetic', landscaping: 'Landscaping', appliance: 'Appliance',
  insulation: 'Insulation', foundation: 'Foundation', windows_doors: 'Windows & Doors', fireplace: 'Fireplace',
};

const CATEGORY_ICONS: Record<string, string> = {
  plumbing: '\uD83D\uDCA7', electrical: '\u26A1', hvac: '\u2744\uFE0F', roofing: '\uD83C\uDFE0',
  structural: '\uD83C\uDFD7\uFE0F', general_repair: '\uD83D\uDD27', pest_control: '\uD83D\uDC1B',
  safety: '\u26A0\uFE0F', cosmetic: '\uD83C\uDFA8', landscaping: '\uD83C\uDF3F',
  appliance: '\uD83D\uDCE6', insulation: '\uD83E\uDDF1', foundation: '\uD83C\uDFDB\uFE0F',
  windows_doors: '\uD83E\uDE9F', fireplace: '\uD83D\uDD25',
};

const SEVERITY_ORDER: Record<string, number> = {
  safety_hazard: 0, urgent: 1, recommended: 2, monitor: 3, informational: 4,
};

function formatCurrency(amount: number): string {
  if (!amount || isNaN(amount)) return '$0';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);
}

export default function InspectReport() {
  const { token } = useParams<{ token: string }>();
  const { homeowner } = useAuth();

  const [report, setReport] = useState<InspectReportPublic | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Claim flow state
  const [email, setEmail] = useState(homeowner?.email ?? '');
  const [requesting, setRequesting] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);

  // Load the report metadata (used to power the preview stats)
  useEffect(() => {
    if (!token) return;
    inspectService.getReport(token).then(res => {
      if (res.data) setReport(res.data);
      else setError(res.error ?? 'Report not found');
    }).catch(err => {
      setError((err as Error).message ?? 'Failed to load');
    }).finally(() => setLoading(false));
  }, [token]);

  // Logged-in users skip the email round-trip — claim directly and redirect
  useEffect(() => {
    if (!homeowner || !token || !report) return;
    let cancelled = false;
    inspectService.claimNow(token).then(res => {
      if (cancelled) return;
      if (res.data) {
        window.location.href = `/inspect-portal?tab=reports&report=${res.data.reportId}`;
      }
    }).catch(() => {/* fall through to preview if claim fails */});
    return () => { cancelled = true; };
  }, [homeowner, token, report]);

  // Compute preview stats from the loaded report (without revealing item details)
  const stats = useMemo(() => {
    if (!report) return null;
    const items = report.items.filter(i => i.severity !== 'informational');
    const totalLow = items.reduce((s, i) => s + (i.costEstimateMin ?? 0), 0);
    const totalHigh = items.reduce((s, i) => s + (i.costEstimateMax ?? 0), 0);
    const byCategory = new Map<string, number>();
    items.forEach(i => byCategory.set(i.category, (byCategory.get(i.category) ?? 0) + 1));
    const topCategories = Array.from(byCategory.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 4);
    const topConcerns = items
      .filter(i => i.severity === 'safety_hazard' || i.severity === 'urgent')
      .sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9))
      .slice(0, 3);
    return { totalCount: items.length, totalLow, totalHigh, topCategories, topConcerns };
  }, [report]);

  async function handleSendLink(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !token) return;
    setClaimError(null);
    setRequesting(true);
    try {
      const res = await inspectService.requestClaimLink(email.trim(), token);
      if (res.data) setEmailSent(true);
      else setClaimError(res.error ?? 'Failed to send link');
    } catch (err) {
      setClaimError((err as Error).message ?? 'Network error');
    } finally {
      setRequesting(false);
    }
  }

  if (loading) {
    return (
      <Centered>
        <link href="https://fonts.googleapis.com/css2?family=Fraunces:wght@700&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />
        <div style={{ color: '#9B9490', fontSize: 14 }}>Loading your inspection report{'\u2026'}</div>
      </Centered>
    );
  }

  if (error || !report || !stats) {
    return (
      <Centered>
        <link href="https://fonts.googleapis.com/css2?family=Fraunces:wght@700&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />
        <div style={{ textAlign: 'center', maxWidth: 400 }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>{'\u26A0\uFE0F'}</div>
          <div style={{ fontSize: 17, fontWeight: 600, color: D, marginBottom: 6 }}>Report not found</div>
          <div style={{ fontSize: 14, color: '#6B6560' }}>{error ?? 'This link may have expired.'}</div>
        </div>
      </Centered>
    );
  }

  // Logged-in users see a "Redirecting…" splash until claimNow completes.
  if (homeowner) {
    return (
      <Centered>
        <link href="https://fonts.googleapis.com/css2?family=Fraunces:wght@700&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />
        <div style={{ color: '#9B9490', fontSize: 14 }}>Opening your report{'\u2026'}</div>
      </Centered>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: W, fontFamily: "'DM Sans', sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=Fraunces:wght@400;700&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />

      <div style={{ maxWidth: 640, margin: '0 auto', padding: '40px 20px 60px' }}>
        {/* Brand */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{ fontFamily: 'Fraunces, serif', fontWeight: 700, fontSize: 32, color: O }}>homie</span>
            <span style={{ fontSize: 14, color: '#9B9490', fontWeight: 500 }}>inspect</span>
          </div>
        </div>

        {/* Property card */}
        <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #E0DAD4', padding: 24, marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#9B9490', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
            Inspection report ready
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: D, fontFamily: 'Fraunces, serif', lineHeight: 1.2 }}>
            {report.propertyAddress}
          </div>
          <div style={{ fontSize: 13, color: '#6B6560', marginTop: 4 }}>
            {report.propertyCity}, {report.propertyState} {report.propertyZip}
          </div>
        </div>

        {/* Preview stats */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
          <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #E0DAD4', padding: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#9B9490', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
              Items found
            </div>
            <div style={{ fontFamily: 'Fraunces, serif', fontSize: 36, fontWeight: 700, color: D }}>
              {stats.totalCount}
            </div>
            <div style={{ fontSize: 12, color: '#9B9490', marginTop: 2 }}>across {stats.topCategories.length} {stats.topCategories.length === 1 ? 'category' : 'categories'}</div>
          </div>
          {stats.totalHigh > 0 && (
            <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #E0DAD4', padding: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#9B9490', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                Estimated total
              </div>
              <div style={{ fontFamily: 'Fraunces, serif', fontSize: 22, fontWeight: 700, color: D, lineHeight: 1.2 }}>
                {formatCurrency(stats.totalLow)}{'\u2013'}{formatCurrency(stats.totalHigh)}
              </div>
              <div style={{ fontSize: 12, color: '#9B9490', marginTop: 2 }}>AI estimate, before quotes</div>
            </div>
          )}
        </div>

        {/* Top categories preview */}
        {stats.topCategories.length > 0 && (
          <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #E0DAD4', padding: 20, marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#9B9490', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
              Top categories
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {stats.topCategories.map(([cat, count]) => (
                <span key={cat} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '6px 12px', borderRadius: 100, background: W,
                  fontSize: 13, color: D, fontWeight: 500,
                }}>
                  <span>{CATEGORY_ICONS[cat] ?? ''}</span>
                  {CATEGORY_LABELS[cat] ?? cat} ({count})
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Top concerns teaser (no item details) */}
        {stats.topConcerns.length > 0 && (
          <div style={{ background: `${'#E24B4A'}08`, borderRadius: 16, border: `1px solid ${'#E24B4A'}30`, padding: 20, marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#DC2626', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
              {stats.topConcerns.length} urgent {stats.topConcerns.length === 1 ? 'item' : 'items'} flagged
            </div>
            <div style={{ fontSize: 13, color: '#6B6560', lineHeight: 1.6 }}>
              Including high-severity findings that may affect your offer or closing. Sign in to see the details and get repair quotes.
            </div>
          </div>
        )}

        {/* Claim CTA */}
        {!emailSent ? (
          <form
            onSubmit={handleSendLink}
            style={{
              background: '#fff', borderRadius: 16, border: `2px solid ${O}`,
              padding: 24, marginTop: 8, position: 'relative', overflow: 'hidden',
            }}
          >
            <div style={{ position: 'absolute', top: -14, left: 24, background: O, color: '#fff', fontSize: 11, fontWeight: 700, padding: '4px 12px', borderRadius: 100 }}>
              Free to unlock
            </div>
            <div style={{ fontSize: 17, fontWeight: 700, color: D, marginBottom: 6, marginTop: 4 }}>
              See your full report
            </div>
            <div style={{ fontSize: 13, color: '#6B6560', lineHeight: 1.6, marginBottom: 16 }}>
              Enter your email and we'll send a one-tap link to view every item, get repair quotes, and negotiate with real numbers. No password needed.
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@email.com"
                required
                style={{
                  flex: 1, minWidth: 220, padding: '12px 14px', borderRadius: 10,
                  border: '1px solid #D3CEC9', fontSize: 15, color: D,
                  fontFamily: "'DM Sans', sans-serif",
                }}
              />
              <button
                type="submit"
                disabled={requesting}
                style={{
                  padding: '12px 24px', borderRadius: 10, border: 'none',
                  background: O, color: '#fff', fontSize: 15, fontWeight: 700,
                  cursor: requesting ? 'wait' : 'pointer', opacity: requesting ? 0.6 : 1,
                  fontFamily: "'DM Sans', sans-serif",
                }}
              >
                {requesting ? 'Sending\u2026' : 'Send my link'}
              </button>
            </div>
            {claimError && (
              <div style={{ marginTop: 12, padding: '8px 12px', borderRadius: 8, background: '#FEE2E2', color: '#DC2626', fontSize: 13 }}>
                {claimError}
              </div>
            )}
            <div style={{ marginTop: 12, fontSize: 11, color: '#9B9490' }}>
              We'll never share your email. Free to view your report.
            </div>
          </form>
        ) : (
          <div style={{
            background: `${G}10`, borderRadius: 16, border: `2px solid ${G}40`,
            padding: 28, textAlign: 'center', marginTop: 8,
          }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>{'\u2709\uFE0F'}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: D, marginBottom: 6 }}>
              Check your email
            </div>
            <div style={{ fontSize: 14, color: '#6B6560', lineHeight: 1.6 }}>
              We sent a link to <strong>{email}</strong>. Click it to unlock your report. Link expires in 15 minutes.
            </div>
            <button
              onClick={() => { setEmailSent(false); setClaimError(null); }}
              style={{
                marginTop: 16, fontSize: 13, color: O, background: 'transparent',
                border: 'none', cursor: 'pointer', textDecoration: 'underline',
                fontFamily: "'DM Sans', sans-serif",
              }}
            >
              Wrong email? Try again
            </button>
          </div>
        )}

        <div style={{ textAlign: 'center', marginTop: 32, fontSize: 12, color: '#9B9490' }}>
          Powered by <a href="https://homiepro.ai" style={{ color: O, textDecoration: 'none', fontWeight: 600 }}>Homie</a>
        </div>
      </div>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: W, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'DM Sans', sans-serif", padding: 24 }}>
      {children}
    </div>
  );
}
