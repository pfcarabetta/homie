import { Link } from 'react-router-dom';

const O = '#E8632B', G = '#1B9E77', D = '#2D2926', W = '#F9F5F2';

function ShieldIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke={G} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

function SectionCard({ icon, title, items }: { icon: string; title: string; items: string[] }) {
  return (
    <div style={{
      background: '#fff', borderRadius: 16, padding: 28, border: '1px solid rgba(0,0,0,0.06)',
      transition: 'box-shadow 0.2s',
    }}>
      <div style={{ fontSize: 28, marginBottom: 12 }}>{icon}</div>
      <h3 style={{ fontFamily: "'Fraunces', serif", fontSize: 20, fontWeight: 700, color: D, margin: '0 0 16px' }}>{title}</h3>
      <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {items.map((item, i) => (
          <li key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 14, color: '#6B6560', lineHeight: 1.6 }}>
            <span style={{ color: G, fontWeight: 700, fontSize: 14, marginTop: 1, flexShrink: 0 }}>✓</span>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function Security() {
  return (
    <div style={{ minHeight: '100vh', background: W, fontFamily: "'DM Sans', sans-serif" }}>
      <header style={{ padding: '24px 0', textAlign: 'center' }}>
        <Link to="/" style={{ fontFamily: "'Fraunces', serif", fontSize: 28, fontWeight: 700, color: O, textDecoration: 'none' }}>homie</Link>
      </header>

      <div style={{ maxWidth: 800, margin: '0 auto', padding: '0 24px 80px' }}>
        {/* Hero */}
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
            <ShieldIcon />
          </div>
          <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 36, fontWeight: 700, color: D, marginBottom: 12 }}>Security at Homie</h1>
          <p style={{ fontSize: 16, color: '#6B6560', lineHeight: 1.6, maxWidth: 560, margin: '0 auto' }}>
            We take the security of your data seriously. Here's how we protect your information across every part of the platform.
          </p>
          <p style={{ color: '#9B9490', fontSize: 13, marginTop: 12 }}>Last updated: March 22, 2026</p>
        </div>

        {/* Cards grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 20, marginBottom: 48 }}>
          <SectionCard
            icon="🔒"
            title="Data Protection"
            items={[
              'All data encrypted in transit via TLS/HTTPS',
              'Database encrypted at rest with AES-256',
              'Passwords hashed with bcrypt (12 rounds) — never stored in plain text',
              'JWT tokens with short expiry for session management',
              'No sensitive data logged in application logs',
            ]}
          />
          <SectionCard
            icon="💳"
            title="Payment Security"
            items={[
              'All payments processed through Stripe (PCI DSS Level 1 compliant)',
              'Homie never stores, processes, or has access to credit card numbers',
              'Authorize-then-capture model — your card is only charged when quotes are received',
              'Payment authorization automatically released if no providers respond',
            ]}
          />
          <SectionCard
            icon="📱"
            title="Communication Security"
            items={[
              'Provider outreach via Twilio (enterprise-grade voice and SMS infrastructure)',
              'Cryptographic signature verification on all inbound webhook callbacks',
              'STOP/START/HELP keyword compliance for SMS communications',
              'Email outreach via SendGrid with authenticated sender verification',
            ]}
          />
          <SectionCard
            icon="🔑"
            title="Access Controls"
            items={[
              'Role-based workspace permissions (admin, coordinator, field tech, viewer)',
              'Rate limiting on authentication, API, and diagnostic endpoints',
              'Security headers on all responses (X-Frame-Options, X-Content-Type-Options, Referrer-Policy)',
              'Admin access requires separate authentication with constant-time secret comparison',
            ]}
          />
          <SectionCard
            icon="🛡️"
            title="Privacy & Consent"
            items={[
              'Explicit consent recorded with timestamp, IP address, and disclosure text for every outreach request',
              'Consumer and business account data fully separated',
              'Personal information only shared with providers when a job is actively dispatched',
              'Users can request data deletion at any time',
            ]}
          />
          <SectionCard
            icon="🏗️"
            title="Infrastructure"
            items={[
              'API hosted on Railway (SOC 2 compliant infrastructure)',
              'Frontend hosted on Vercel (enterprise-grade CDN with edge network)',
              'PostgreSQL database with automated backups',
              'Structured logging and real-time error tracking via Sentry',
              'Environment variable validation at startup — server won\'t start without critical secrets',
            ]}
          />
        </div>

        {/* Architecture summary */}
        <div style={{ background: '#fff', borderRadius: 16, padding: 32, border: '1px solid rgba(0,0,0,0.06)', marginBottom: 48 }}>
          <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: 24, fontWeight: 700, color: D, margin: '0 0 20px' }}>Security Architecture</h2>
          <div style={{ fontSize: 14, color: '#6B6560', lineHeight: 1.8 }}>
            <p style={{ marginBottom: 16 }}>
              Homie's architecture is designed with security at every layer. User authentication uses industry-standard JWT tokens with HS256 signing and explicit algorithm validation to prevent algorithm confusion attacks. All database queries use parameterized statements through Drizzle ORM, eliminating SQL injection vulnerabilities.
            </p>
            <p style={{ marginBottom: 16 }}>
              Our outreach engine communicates with providers through three channels — voice, SMS, and email — each with its own security model. Twilio webhook callbacks are verified using cryptographic signature validation. Web-based quote submission forms use HMAC tokens with timing-safe comparison to prevent forgery.
            </p>
            <p>
              For business accounts, workspace membership is verified on every API request through database-backed authorization checks. Team members are assigned granular roles that control access to properties, vendors, dispatches, and settings. The workspace owner cannot be demoted or removed, ensuring continuity of access.
            </p>
          </div>
        </div>

        {/* Responsible disclosure */}
        <div style={{
          background: `linear-gradient(135deg, ${G}08 0%, ${O}05 100%)`,
          borderRadius: 16, padding: 32, border: `1px solid ${G}20`, textAlign: 'center',
        }}>
          <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: 24, fontWeight: 700, color: D, margin: '0 0 12px' }}>Responsible Disclosure</h2>
          <p style={{ fontSize: 15, color: '#6B6560', lineHeight: 1.6, maxWidth: 520, margin: '0 auto 20px' }}>
            If you discover a security vulnerability, we want to hear from you. We're committed to working with security researchers to resolve issues quickly and responsibly.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
            <a href="mailto:security@homiepro.ai" style={{
              display: 'inline-block', padding: '12px 32px', borderRadius: 100,
              background: G, color: '#fff', fontSize: 15, fontWeight: 600,
              textDecoration: 'none', transition: 'opacity 0.2s',
            }}>security@homiepro.ai</a>
            <p style={{ fontSize: 13, color: '#9B9490', margin: 0 }}>We commit to responding within 48 hours</p>
          </div>
        </div>

        {/* Footer links */}
        <div style={{ textAlign: 'center', marginTop: 48, fontSize: 14, color: '#9B9490' }}>
          <Link to="/terms" style={{ color: '#9B9490', textDecoration: 'none', marginRight: 24 }}>Terms of Service</Link>
          <Link to="/privacy" style={{ color: '#9B9490', textDecoration: 'none', marginRight: 24 }}>Privacy Policy</Link>
          <Link to="/" style={{ color: O, textDecoration: 'none', fontWeight: 600 }}>Back to Homie</Link>
        </div>
      </div>
    </div>
  );
}
