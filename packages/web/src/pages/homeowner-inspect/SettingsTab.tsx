import { useAuth } from '@/contexts/AuthContext';
import { D } from './constants';

interface SettingsTabProps {
  resolvedTheme: 'light' | 'dark';
  themeMode: 'light' | 'dark' | 'auto';
  onThemeChange: (m: 'light' | 'dark' | 'auto') => void;
}

export default function SettingsTab({ resolvedTheme, themeMode, onThemeChange }: SettingsTabProps) {
  const { homeowner } = useAuth();

  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontFamily: 'Fraunces, serif', fontSize: 24, fontWeight: 700, color: 'var(--bp-text)', margin: 0 }}>Settings</h1>
        <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 14, color: 'var(--bp-subtle)', margin: '4px 0 0' }}>Manage your preferences and notifications</p>
      </div>

      {/* Profile section */}
      <div style={{ background: 'var(--bp-card)', borderRadius: 14, border: '1px solid var(--bp-border)', padding: 24, marginBottom: 20 }}>
        <h3 style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 15, fontWeight: 700, color: 'var(--bp-text)', margin: '0 0 16px' }}>Profile</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--bp-subtle)', marginBottom: 6, fontFamily: "'DM Sans',sans-serif" }}>Email</label>
            <div style={{ fontSize: 14, color: 'var(--bp-text)', fontFamily: "'DM Sans',sans-serif" }}>{homeowner?.email || '—'}</div>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--bp-subtle)', marginBottom: 6, fontFamily: "'DM Sans',sans-serif" }}>Name</label>
            <div style={{ fontSize: 14, color: 'var(--bp-text)', fontFamily: "'DM Sans',sans-serif" }}>
              {homeowner?.first_name ? `${homeowner.first_name} ${homeowner.last_name || ''}`.trim() : '—'}
            </div>
          </div>
        </div>
      </div>

      {/* Appearance */}
      <div style={{ background: 'var(--bp-card)', borderRadius: 14, border: '1px solid var(--bp-border)', padding: 24, marginBottom: 20 }}>
        <h3 style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 15, fontWeight: 700, color: 'var(--bp-text)', margin: '0 0 16px' }}>Appearance</h3>
        <div style={{ display: 'flex', gap: 8 }}>
          {(['light', 'dark', 'auto'] as const).map(m => (
            <button key={m} onClick={() => onThemeChange(m)} style={{
              padding: '8px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600,
              fontFamily: "'DM Sans',sans-serif", cursor: 'pointer',
              border: themeMode === m ? '2px solid #2563EB' : '1px solid var(--bp-border)',
              background: themeMode === m ? '#2563EB10' : 'var(--bp-card)',
              color: themeMode === m ? '#2563EB' : 'var(--bp-muted)',
              textTransform: 'capitalize',
            }}>
              {m}
            </button>
          ))}
        </div>
      </div>

      {/* Notifications placeholder */}
      <div style={{ background: 'var(--bp-card)', borderRadius: 14, border: '1px solid var(--bp-border)', padding: 24 }}>
        <h3 style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 15, fontWeight: 700, color: 'var(--bp-text)', margin: '0 0 16px' }}>Notifications</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {[
            { label: 'New quotes received', desc: 'Get notified when a provider responds with a quote' },
            { label: 'Maintenance reminders', desc: 'Seasonal and scheduled maintenance alerts' },
            { label: 'Report processing complete', desc: 'Notified when AI finishes parsing your report' },
          ].map(item => (
            <div key={item.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--bp-text)', fontFamily: "'DM Sans',sans-serif" }}>{item.label}</div>
                <div style={{ fontSize: 12, color: 'var(--bp-subtle)', fontFamily: "'DM Sans',sans-serif" }}>{item.desc}</div>
              </div>
              <div style={{
                width: 40, height: 22, borderRadius: 11, background: '#2563EB', cursor: 'pointer',
                display: 'flex', alignItems: 'center', padding: '0 2px',
              }}>
                <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#fff', marginLeft: 'auto', transition: 'margin 0.2s' }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
