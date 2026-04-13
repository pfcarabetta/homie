import { useState, useEffect, type FormEvent } from 'react';
import { useInspectorAuth } from '@/contexts/InspectorAuthContext';
import { inspectorService, type InspectorProfile } from '@/services/inspector-api';

const O = '#E8632B';
const G = '#1B9E77';
const D = '#2D2926';
const W = '#F9F5F2';

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '12px 14px', fontSize: 14, fontFamily: "'DM Sans', sans-serif",
  border: '1px solid #E0DAD4', borderRadius: 10, background: '#ffffff', color: D,
  outline: 'none', boxSizing: 'border-box',
};

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 13, fontWeight: 600, color: D, marginBottom: 6,
  fontFamily: "'DM Sans', sans-serif",
};

const sectionStyle: React.CSSProperties = {
  background: '#ffffff', borderRadius: 14, border: '1px solid #E0DAD4', padding: 24, marginBottom: 20,
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 16, fontWeight: 700, color: D, marginBottom: 16, fontFamily: "'DM Sans', sans-serif",
};

export default function InspectorSettings() {
  const { inspector } = useInspectorAuth();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Business info
  const [companyName, setCompanyName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [website, setWebsite] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [certifications, setCertifications] = useState('');

  // Service areas
  const [serviceZipCodes, setServiceZipCodes] = useState('');

  // Inspection software
  const [inspectionSoftware, setInspectionSoftware] = useState('');

  // Payout
  const [payoutMethod, setPayoutMethod] = useState('');

  // Notifications
  const [notifNewLead, setNotifNewLead] = useState(true);
  const [notifReportReady, setNotifReportReady] = useState(true);
  const [notifItemDispatched, setNotifItemDispatched] = useState(true);
  const [notifEarnings, setNotifEarnings] = useState(true);

  // Password
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  useEffect(() => {
    if (inspector) {
      setCompanyName(inspector.companyName);
      setEmail(inspector.email);
      setPhone(inspector.phone ?? '');
      setWebsite(inspector.website ?? '');
      setLicenseNumber(inspector.licenseNumber ?? '');
      setCertifications(inspector.certifications?.join(', ') ?? '');
      setServiceZipCodes(inspector.serviceZipCodes?.join(', ') ?? '');
      setInspectionSoftware(inspector.inspectionSoftware ?? '');
      setPayoutMethod(inspector.payoutMethod ?? '');
      if (inspector.notificationPreferences) {
        setNotifNewLead(inspector.notificationPreferences.newLead !== false);
        setNotifReportReady(inspector.notificationPreferences.reportReady !== false);
        setNotifItemDispatched(inspector.notificationPreferences.itemDispatched !== false);
        setNotifEarnings(inspector.notificationPreferences.earnings !== false);
      }
    }
  }, [inspector]);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    try {
      await inspectorService.updateProfile({
        companyName,
        phone: phone || null,
        website: website || null,
        licenseNumber: licenseNumber || null,
        certifications: certifications ? certifications.split(',').map(s => s.trim()).filter(Boolean) : [],
        serviceZipCodes: serviceZipCodes ? serviceZipCodes.split(',').map(s => s.trim()).filter(Boolean) : [],
        inspectionSoftware: inspectionSoftware || null,
        payoutMethod: payoutMethod || null,
        notificationPreferences: {
          newLead: notifNewLead,
          reportReady: notifReportReady,
          itemDispatched: notifItemDispatched,
          earnings: notifEarnings,
        },
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      // silently fail
    } finally {
      setSaving(false);
    }
  }

  function Toggle({ checked, onChange }: { checked: boolean; onChange: (val: boolean) => void }) {
    return (
      <button
        onClick={() => onChange(!checked)}
        style={{
          width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
          background: checked ? G : '#E0DAD4', position: 'relative', transition: 'background 0.2s',
          flexShrink: 0,
        }}
      >
        <div style={{
          width: 18, height: 18, borderRadius: '50%', background: '#fff',
          position: 'absolute', top: 3,
          left: checked ? 23 : 3, transition: 'left 0.2s',
          boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
        }} />
      </button>
    );
  }

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif", maxWidth: 720 }}>
      <h1 style={{ fontFamily: 'Fraunces, serif', fontSize: 28, fontWeight: 700, color: D, margin: '0 0 24px' }}>
        Settings
      </h1>

      {/* Business Info */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>Business Information</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={labelStyle}>Company Name</label>
            <input style={inputStyle} value={companyName} onChange={e => setCompanyName(e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>Email</label>
            <input style={{ ...inputStyle, background: '#F5F0EB' }} value={email} disabled />
          </div>
          <div>
            <label style={labelStyle}>Phone</label>
            <input style={inputStyle} value={phone} onChange={e => setPhone(e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>Website</label>
            <input style={inputStyle} value={website} onChange={e => setWebsite(e.target.value)} placeholder="https://..." />
          </div>
          <div>
            <label style={labelStyle}>License Number</label>
            <input style={inputStyle} value={licenseNumber} onChange={e => setLicenseNumber(e.target.value)} />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={labelStyle}>Certifications</label>
            <input style={inputStyle} value={certifications} onChange={e => setCertifications(e.target.value)} placeholder="ASHI, InterNACHI, etc. (comma-separated)" />
          </div>
        </div>
      </div>

      {/* Service Areas */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>Service Areas</div>
        <label style={labelStyle}>Zip Codes</label>
        <input style={inputStyle} value={serviceZipCodes} onChange={e => setServiceZipCodes(e.target.value)} placeholder="10001, 10002, 10003 (comma-separated)" />
        <div style={{ fontSize: 12, color: '#9B9490', marginTop: 6 }}>
          Enter the zip codes you service to receive relevant leads.
        </div>
      </div>

      {/* Inspection Software */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>Inspection Software</div>
        <label style={labelStyle}>Software</label>
        <input style={inputStyle} value={inspectionSoftware} onChange={e => setInspectionSoftware(e.target.value)} placeholder="e.g., Spectora, HomeGauge, ISN" />
        <div style={{ fontSize: 12, color: '#9B9490', marginTop: 6 }}>
          Connect your inspection software for automatic report imports.
        </div>
      </div>

      {/* Payout Method */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>Payout Method</div>
        <label style={labelStyle}>Method</label>
        <select style={inputStyle} value={payoutMethod} onChange={e => setPayoutMethod(e.target.value)}>
          <option value="">Select payout method</option>
          <option value="ach">ACH Bank Transfer</option>
          <option value="check">Check</option>
          <option value="paypal">PayPal</option>
        </select>
      </div>

      {/* Notifications */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>Notifications</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {[
            { label: 'New lead available', checked: notifNewLead, onChange: setNotifNewLead },
            { label: 'Report ready for review', checked: notifReportReady, onChange: setNotifReportReady },
            { label: 'Client dispatched an item', checked: notifItemDispatched, onChange: setNotifItemDispatched },
            { label: 'New earnings', checked: notifEarnings, onChange: setNotifEarnings },
          ].map(notif => (
            <div key={notif.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 14, color: D }}>{notif.label}</span>
              <Toggle checked={notif.checked} onChange={notif.onChange} />
            </div>
          ))}
        </div>
      </div>

      {/* Partner URL */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>Partner URL</div>
        <div style={{
          padding: '10px 14px', background: W, borderRadius: 8, fontSize: 13, color: D,
          fontFamily: 'monospace', border: '1px solid #E0DAD4',
        }}>
          {inspector?.partnerUrl
            ? `${window.location.origin}/inspect?ref=${inspector.partnerUrl}`
            : `${window.location.origin}/inspect?ref=${inspector?.id ?? ''}`}
        </div>
      </div>

      {/* Change Password */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>Change Password</div>
        <div style={{ display: 'grid', gap: 12, maxWidth: 360 }}>
          <div>
            <label style={labelStyle}>Current Password</label>
            <input style={inputStyle} type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>New Password</label>
            <input style={inputStyle} type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>Confirm New Password</label>
            <input style={inputStyle} type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} />
          </div>
        </div>
      </div>

      {/* Save button */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            padding: '12px 32px', background: O, color: '#fff', border: 'none',
            borderRadius: 10, fontSize: 15, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer',
            fontFamily: "'DM Sans', sans-serif", opacity: saving ? 0.7 : 1,
          }}
        >
          {saving ? 'Saving...' : 'Save changes'}
        </button>
        {saved && (
          <span style={{ fontSize: 13, fontWeight: 600, color: G }}>Changes saved</span>
        )}
      </div>
    </div>
  );
}
