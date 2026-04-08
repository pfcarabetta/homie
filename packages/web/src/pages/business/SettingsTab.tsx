import { useState, useEffect, useRef } from 'react';
import { businessService, slackService, accountService, getToken, type WorkspaceDetail, type SlackSettings, type AccountProfile } from '@/services/api';
import { O, G, D, W } from './constants';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

const SLACK_NOTIFICATION_TOGGLES: Array<{ key: keyof SlackSettings; label: string }> = [
  { key: 'notifyDispatchCreated', label: 'New dispatches' },
  { key: 'notifyProviderResponse', label: 'Provider responses' },
  { key: 'notifyBookingConfirmed', label: 'Booking confirmations' },
  { key: 'notifyApprovalNeeded', label: 'Approval requests' },
  { key: 'notifyJobCompleted', label: 'Job completions' },
  { key: 'notifyOutreachFailed', label: 'Failed outreach' },
];

function SlackIntegrationSection({ workspace, isPro, onUpdated }: {
  workspace: WorkspaceDetail;
  isPro: boolean;
  onUpdated: (w: WorkspaceDetail) => void;
}) {
  const [slackSettings, setSlackSettings] = useState<SlackSettings | null>(null);
  const [slackChannels, setSlackChannels] = useState<Array<{ id: string; name: string }>>([]);
  const [slackLoading, setSlackLoading] = useState(false);
  const [slackError, setSlackError] = useState<string | null>(null);
  const [slackSuccess, setSlackSuccess] = useState<string | null>(null);
  const [testSending, setTestSending] = useState(false);
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  useEffect(() => {
    if (!isPro) return;
    setSlackLoading(true);
    slackService.getSettings(workspace.id).then(res => {
      if (res.data) setSlackSettings(res.data);
    }).catch(() => {
      setSlackSettings({ connected: false, notifyDispatchCreated: true, notifyProviderResponse: true, notifyBookingConfirmed: true, notifyApprovalNeeded: true, notifyJobCompleted: true, notifyOutreachFailed: true, notifyDailyDigest: false, approvalThresholdCents: 50000, digestTime: '09:00' });
    }).finally(() => setSlackLoading(false));
  }, [isPro, workspace.id]);

  useEffect(() => {
    if (!slackSettings?.connected || !isPro) return;
    slackService.getChannels(workspace.id).then(res => {
      if (res.data) setSlackChannels(res.data);
    }).catch(() => { /* channels unavailable */ });
  }, [slackSettings?.connected, isPro, workspace.id]);

  async function handleToggle(key: keyof SlackSettings, value: boolean) {
    if (!slackSettings) return;
    const updated = { ...slackSettings, [key]: value };
    setSlackSettings(updated);
    setSlackError(null);
    try {
      const res = await slackService.updateSettings(workspace.id, { [key]: value });
      if (res.data) setSlackSettings(res.data);
    } catch (err: unknown) {
      setSlackError(err instanceof Error ? err.message : 'Failed to save');
      setSlackSettings(slackSettings);
    }
  }

  async function handleChannelChange(channelId: string) {
    if (!slackSettings) return;
    const channel = slackChannels.find(c => c.id === channelId);
    const updated = { ...slackSettings, slackChannelId: channelId, slackChannelName: channel?.name };
    setSlackSettings(updated);
    setSlackError(null);
    try {
      const res = await slackService.updateSettings(workspace.id, { slackChannelId: channelId });
      if (res.data) {
        setSlackSettings(res.data);
        onUpdated({ ...workspace, slackChannelId: channelId });
      }
    } catch (err: unknown) {
      setSlackError(err instanceof Error ? err.message : 'Failed to update channel');
    }
  }

  async function handleThresholdChange(dollars: string) {
    if (!slackSettings) return;
    const cents = Math.round(parseFloat(dollars || '0') * 100);
    if (isNaN(cents)) return;
    const updated = { ...slackSettings, approvalThresholdCents: cents };
    setSlackSettings(updated);
    try {
      const res = await slackService.updateSettings(workspace.id, { approvalThresholdCents: cents });
      if (res.data) setSlackSettings(res.data);
    } catch { /* ignore debounced errors */ }
  }

  async function handleDigestTimeChange(time: string) {
    if (!slackSettings) return;
    const updated = { ...slackSettings, digestTime: time };
    setSlackSettings(updated);
    try {
      const res = await slackService.updateSettings(workspace.id, { digestTime: time });
      if (res.data) setSlackSettings(res.data);
    } catch { /* ignore */ }
  }

  async function handleSendTest() {
    setTestSending(true);
    setSlackError(null);
    setSlackSuccess(null);
    try {
      await slackService.sendTest(workspace.id);
      setSlackSuccess('Test notification sent to Slack');
      setTimeout(() => setSlackSuccess(null), 4000);
    } catch (err: unknown) {
      setSlackError(err instanceof Error ? err.message : 'Failed to send test');
    } finally {
      setTestSending(false);
    }
  }

  async function handleDisconnect() {
    setDisconnecting(true);
    setSlackError(null);
    try {
      await slackService.disconnect(workspace.id);
      setSlackSettings({ ...slackSettings!, connected: false, slackTeamName: undefined, slackChannelName: undefined, slackChannelId: undefined });
      onUpdated({ ...workspace, slackChannelId: null, slackTeamId: null });
      setShowDisconnectConfirm(false);
    } catch (err: unknown) {
      setSlackError(err instanceof Error ? err.message : 'Failed to disconnect');
    } finally {
      setDisconnecting(false);
    }
  }

  const inputStyle = { width: '100%', padding: '10px 14px', border: '1px solid var(--bp-border)', borderRadius: 8, fontSize: 15, boxSizing: 'border-box' as const, background: 'var(--bp-input)', color: 'var(--bp-text)' };

  const toggleStyle = (enabled: boolean): React.CSSProperties => ({
    width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
    background: enabled ? G : 'var(--bp-border)', position: 'relative', transition: 'background 0.2s',
    flexShrink: 0,
  });

  const toggleKnobStyle = (enabled: boolean): React.CSSProperties => ({
    position: 'absolute', top: 2, left: enabled ? 22 : 2,
    width: 20, height: 20, borderRadius: '50%', background: '#fff',
    transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
  });

  return (
    <div style={{ background: 'var(--bp-card)', borderRadius: 12, border: '1px solid var(--bp-border)', padding: 24, marginTop: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zm0 1.271a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zm-1.27 0a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.163 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.163 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.163 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zm0-1.27a2.527 2.527 0 0 1-2.52-2.523 2.527 2.527 0 0 1 2.52-2.52h6.315A2.528 2.528 0 0 1 24 15.163a2.528 2.528 0 0 1-2.522 2.523h-6.315z" fill="#E01E5A"/></svg>
          <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--bp-muted)', margin: 0 }}>Slack Integration</label>
        </div>
        {!isPro && (
          <span style={{ fontSize: 11, fontWeight: 600, color: O, background: `${O}12`, padding: '3px 10px', borderRadius: 100 }}>Professional+</span>
        )}
      </div>

      {!isPro ? (
        <div style={{ fontSize: 13, color: 'var(--bp-muted)', lineHeight: 1.6, opacity: 0.7 }}>
          Get real-time Homie updates in your team's Slack workspace. Available on <strong style={{ color: O }}>Professional</strong> plan and above.
        </div>
      ) : slackLoading ? (
        <div style={{ fontSize: 13, color: 'var(--bp-muted)', padding: '20px 0', textAlign: 'center' }}>Loading Slack settings...</div>
      ) : slackSettings && !slackSettings.connected ? (
        <div style={{ textAlign: 'center', padding: '16px 0' }}>
          <div style={{ fontSize: 14, color: 'var(--bp-muted)', lineHeight: 1.7, marginBottom: 20, maxWidth: 360, margin: '0 auto 20px' }}>
            Get real-time Homie updates in your team's Slack workspace. Receive dispatch alerts, provider quotes, and approve bookings directly from Slack.
          </div>
          <a href={`${API_BASE}/api/v1/integrations/slack/install?workspace_id=${workspace.id}`}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8, padding: '12px 28px',
              borderRadius: 10, border: 'none', background: O, color: '#fff',
              fontSize: 15, fontWeight: 600, cursor: 'pointer', textDecoration: 'none',
            }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313z" fill="#fff"/></svg>
            Connect Slack
          </a>
        </div>
      ) : slackSettings ? (
        <div>
          {/* Connected status */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: G, display: 'inline-block' }} />
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--bp-text)' }}>
              Connected to {slackSettings.slackTeamName || 'Slack'}
            </span>
          </div>

          {slackError && (
            <div style={{ fontSize: 13, color: '#DC2626', marginBottom: 16, padding: '8px 12px', background: '#DC26260A', borderRadius: 8 }}>{slackError}</div>
          )}
          {slackSuccess && (
            <div style={{ fontSize: 13, color: G, marginBottom: 16, padding: '8px 12px', background: `${G}0A`, borderRadius: 8 }}>{slackSuccess}</div>
          )}

          {/* Channel selector */}
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--bp-muted)', marginBottom: 6 }}>Notification Channel</label>
            <select
              value={slackSettings.slackChannelId ?? ''}
              onChange={e => handleChannelChange(e.target.value)}
              style={{ ...inputStyle, cursor: 'pointer' }}
            >
              <option value="">Select a channel...</option>
              {slackChannels.map(ch => (
                <option key={ch.id} value={ch.id}>#{ch.name}</option>
              ))}
            </select>
          </div>

          {/* Notification toggles */}
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--bp-muted)', marginBottom: 12 }}>Notifications</label>
            {SLACK_NOTIFICATION_TOGGLES.map(({ key, label }) => (
              <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--bp-border)' }}>
                <span style={{ fontSize: 14, color: 'var(--bp-text)' }}>{label}</span>
                <button
                  onClick={() => handleToggle(key, !slackSettings[key])}
                  style={toggleStyle(slackSettings[key] as boolean)}
                  aria-label={`Toggle ${label}`}
                >
                  <span style={toggleKnobStyle(slackSettings[key] as boolean)} />
                </button>
              </div>
            ))}

            {/* Daily digest with time */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--bp-border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 14, color: 'var(--bp-text)' }}>Daily digest</span>
                {slackSettings.notifyDailyDigest && (
                  <input
                    type="time"
                    value={slackSettings.digestTime}
                    onChange={e => handleDigestTimeChange(e.target.value)}
                    style={{ padding: '4px 8px', border: '1px solid var(--bp-border)', borderRadius: 6, fontSize: 12, background: 'var(--bp-input)', color: 'var(--bp-text)' }}
                  />
                )}
              </div>
              <button
                onClick={() => handleToggle('notifyDailyDigest', !slackSettings.notifyDailyDigest)}
                style={toggleStyle(slackSettings.notifyDailyDigest)}
                aria-label="Toggle Daily digest"
              >
                <span style={toggleKnobStyle(slackSettings.notifyDailyDigest)} />
              </button>
            </div>
          </div>

          {/* Approval threshold */}
          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--bp-muted)', marginBottom: 6 }}>Approval Threshold</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 14, color: 'var(--bp-text)' }}>Require approval for jobs over</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--bp-text)' }}>$</span>
                <input
                  type="number"
                  min="0"
                  step="50"
                  value={(slackSettings.approvalThresholdCents / 100).toString()}
                  onChange={e => handleThresholdChange(e.target.value)}
                  style={{ ...inputStyle, width: 100, marginBottom: 0, textAlign: 'right' as const }}
                />
              </div>
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button
              onClick={handleSendTest}
              disabled={testSending}
              style={{
                padding: '10px 20px', borderRadius: 8, border: '1px solid var(--bp-border)',
                background: 'var(--bp-bg)', color: 'var(--bp-text)', fontSize: 13, fontWeight: 600,
                cursor: testSending ? 'default' : 'pointer', opacity: testSending ? 0.6 : 1,
              }}
            >
              {testSending ? 'Sending...' : 'Send test notification'}
            </button>
            <button
              onClick={() => setShowDisconnectConfirm(true)}
              style={{
                padding: '10px 20px', borderRadius: 8, border: '1px solid #DC262640',
                background: 'transparent', color: '#DC2626', fontSize: 13, fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Disconnect Slack
            </button>
          </div>

          {/* Disconnect confirmation dialog */}
          {showDisconnectConfirm && (
            <div style={{
              marginTop: 16, padding: 16, borderRadius: 10, border: '1px solid #DC262640',
              background: '#DC26260A',
            }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#DC2626', marginBottom: 8 }}>Disconnect Slack?</div>
              <div style={{ fontSize: 13, color: 'var(--bp-muted)', marginBottom: 16, lineHeight: 1.5 }}>
                This will remove the Slack integration and stop all notifications. You can reconnect at any time.
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  onClick={handleDisconnect}
                  disabled={disconnecting}
                  style={{
                    padding: '8px 20px', borderRadius: 8, border: 'none',
                    background: '#DC2626', color: '#fff', fontSize: 13, fontWeight: 600,
                    cursor: disconnecting ? 'default' : 'pointer', opacity: disconnecting ? 0.6 : 1,
                  }}
                >
                  {disconnecting ? 'Disconnecting...' : 'Yes, disconnect'}
                </button>
                <button
                  onClick={() => setShowDisconnectConfirm(false)}
                  style={{
                    padding: '8px 20px', borderRadius: 8, border: '1px solid var(--bp-border)',
                    background: 'var(--bp-bg)', color: 'var(--bp-text)', fontSize: 13, fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

export default function SettingsTab({ workspace, onUpdated, themeMode, onThemeChange }: {
  workspace: WorkspaceDetail; onUpdated: (w: WorkspaceDetail) => void;
  themeMode: 'light' | 'dark' | 'auto'; onThemeChange: (mode: 'light' | 'dark' | 'auto') => void;
}) {
  const [name, setName] = useState(workspace.name);
  const [slug, setSlug] = useState(workspace.slug);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(workspace.logoUrl ?? null);
  const [logoUploading, setLogoUploading] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const isPro = ['professional', 'business', 'enterprise'].includes(workspace.plan);
  const [companyAddress, setCompanyAddress] = useState(workspace.companyAddress ?? '');
  const [companyPhone, setCompanyPhone] = useState(workspace.companyPhone ?? '');
  const [companyEmail, setCompanyEmail] = useState(workspace.companyEmail ?? '');
  const [savingDetails, setSavingDetails] = useState(false);
  const [detailsMsg, setDetailsMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // My Profile state
  const profileSectionRef = useRef<HTMLDivElement>(null);
  const [myProfile, setMyProfile] = useState<AccountProfile | null>(null);
  const [myFirstName, setMyFirstName] = useState('');
  const [myLastName, setMyLastName] = useState('');
  const [myTitle, setMyTitle] = useState('');
  const [myPhone, setMyPhone] = useState('');
  const [myNotifyEmailQuotes, setMyNotifyEmailQuotes] = useState(true);
  const [myNotifySmsQuotes, setMyNotifySmsQuotes] = useState(true);
  const [myNotifyEmailBookings, setMyNotifyEmailBookings] = useState(true);
  const [myNotifySmsBookings, setMyNotifySmsBookings] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    accountService.getProfile().then(res => {
      if (res.data) {
        setMyProfile(res.data);
        setMyFirstName(res.data.first_name || '');
        setMyLastName(res.data.last_name || '');
        setMyTitle(res.data.title || '');
        setMyPhone(res.data.phone || '');
        setMyNotifyEmailQuotes(res.data.notify_email_quotes);
        setMyNotifySmsQuotes(res.data.notify_sms_quotes);
        setMyNotifyEmailBookings(res.data.notify_email_bookings);
        setMyNotifySmsBookings(res.data.notify_sms_bookings);
      }
    });
  }, []);

  async function handleSaveMyProfile() {
    setSavingProfile(true);
    setProfileMsg(null);
    try {
      const updates: Record<string, unknown> = {};
      if (myFirstName !== (myProfile?.first_name || '')) updates.first_name = myFirstName;
      if (myLastName !== (myProfile?.last_name || '')) updates.last_name = myLastName;
      if (myTitle !== (myProfile?.title || '')) updates.title = myTitle;
      if (myPhone !== (myProfile?.phone || '')) updates.phone = myPhone;
      if (myNotifyEmailQuotes !== myProfile?.notify_email_quotes) updates.notify_email_quotes = myNotifyEmailQuotes;
      if (myNotifySmsQuotes !== myProfile?.notify_sms_quotes) updates.notify_sms_quotes = myNotifySmsQuotes;
      if (myNotifyEmailBookings !== myProfile?.notify_email_bookings) updates.notify_email_bookings = myNotifyEmailBookings;
      if (myNotifySmsBookings !== myProfile?.notify_sms_bookings) updates.notify_sms_bookings = myNotifySmsBookings;
      if (Object.keys(updates).length === 0) { setProfileMsg({ type: 'error', text: 'No changes to save' }); setSavingProfile(false); return; }
      const res = await accountService.updateProfile(updates as Record<string, string>);
      if (res.data) {
        setMyProfile(res.data);
        setProfileMsg({ type: 'success', text: 'Profile updated' });
      }
    } catch (err: unknown) {
      setProfileMsg({ type: 'error', text: err instanceof Error ? err.message : 'Failed to save' });
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleSaveCompanyDetails() {
    setSavingDetails(true);
    setDetailsMsg(null);
    try {
      const res = await businessService.updateWorkspace(workspace.id, {
        company_address: companyAddress || null,
        company_phone: companyPhone || null,
        company_email: companyEmail || null,
      });
      if (res.data) {
        onUpdated({ ...workspace, ...res.data, companyAddress: companyAddress || null, companyPhone: companyPhone || null, companyEmail: companyEmail || null });
        setDetailsMsg({ type: 'success', text: 'Company details saved' });
      }
    } catch (err: unknown) {
      setDetailsMsg({ type: 'error', text: err instanceof Error ? err.message : 'Failed to save' });
    } finally {
      setSavingDetails(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setMsg(null);
    const updates: Record<string, string> = {};
    if (name !== workspace.name) updates.name = name;
    if (slug !== workspace.slug) updates.slug = slug;
    if (Object.keys(updates).length === 0) { setMsg({ type: 'error', text: 'No changes' }); setSaving(false); return; }

    try {
      const res = await businessService.updateWorkspace(workspace.id, updates);
      if (res.data) {
        onUpdated({ ...workspace, ...res.data });
        setMsg({ type: 'success', text: 'Workspace updated' });
      }
    } catch (err: unknown) {
      setMsg({ type: 'error', text: err instanceof Error ? err.message : 'Failed to update' });
    } finally {
      setSaving(false);
    }
  }

  const inputStyle = { width: '100%', padding: '10px 14px', border: '1px solid var(--bp-border)', borderRadius: 8, fontSize: 15, marginBottom: 16, boxSizing: 'border-box' as const, background: 'var(--bp-input)', color: 'var(--bp-text)' };

  return (
    <div style={{ maxWidth: 480 }}>
      {/* My Profile */}
      <div ref={profileSectionRef} id="my-profile-section">
        <h3 style={{ fontFamily: 'Fraunces, serif', fontSize: 20, color: 'var(--bp-text)', margin: '0 0 20px' }}>My Profile</h3>
        <div style={{ background: 'var(--bp-card)', borderRadius: 12, border: '1px solid var(--bp-border)', padding: 24, marginBottom: 32 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--bp-muted)', marginBottom: 6 }}>First Name</label>
              <input value={myFirstName} onChange={e => setMyFirstName(e.target.value)} placeholder="First" style={inputStyle} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--bp-muted)', marginBottom: 6 }}>Last Name</label>
              <input value={myLastName} onChange={e => setMyLastName(e.target.value)} placeholder="Last" style={inputStyle} />
            </div>
          </div>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--bp-muted)', marginBottom: 6 }}>Title</label>
          <input value={myTitle} onChange={e => setMyTitle(e.target.value)} placeholder="e.g. Property Manager" style={inputStyle} />
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--bp-muted)', marginBottom: 6 }}>Phone</label>
          <input value={myPhone} onChange={e => setMyPhone(e.target.value)} placeholder="(555) 123-4567" style={inputStyle} />
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--bp-muted)', marginBottom: 6 }}>Email</label>
          <div style={{ padding: '10px 14px', fontSize: 15, color: 'var(--bp-muted)', background: 'var(--bp-bg)', border: '1px solid var(--bp-border)', borderRadius: 8, marginBottom: 16 }}>
            {myProfile?.email ?? '...'}
          </div>

          <div style={{ borderTop: '1px solid var(--bp-border)', paddingTop: 16, marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--bp-text)', marginBottom: 12 }}>Notification Preferences</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {([
                { label: 'Email notifications for quotes', value: myNotifyEmailQuotes, set: setMyNotifyEmailQuotes },
                { label: 'SMS notifications for quotes', value: myNotifySmsQuotes, set: setMyNotifySmsQuotes },
                { label: 'Email notifications for bookings', value: myNotifyEmailBookings, set: setMyNotifyEmailBookings },
                { label: 'SMS notifications for bookings', value: myNotifySmsBookings, set: setMyNotifySmsBookings },
              ] as const).map((item, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 14, color: 'var(--bp-text)' }}>{item.label}</span>
                  <button onClick={() => item.set(!item.value)} style={{
                    width: 36, height: 20, borderRadius: 10, border: 'none', cursor: 'pointer',
                    background: item.value ? G : '#ccc', position: 'relative', transition: 'background 0.2s',
                    flexShrink: 0,
                  }}>
                    <div style={{
                      width: 16, height: 16, borderRadius: '50%', background: '#fff',
                      position: 'absolute', top: 2, left: item.value ? 18 : 2,
                      transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                    }} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {profileMsg && (
            <div style={{ fontSize: 14, marginBottom: 16, color: profileMsg.type === 'success' ? G : '#DC2626' }}>{profileMsg.text}</div>
          )}

          <button onClick={handleSaveMyProfile} disabled={savingProfile}
            style={{ padding: '10px 24px', borderRadius: 8, border: 'none', background: O, color: '#fff', cursor: savingProfile ? 'default' : 'pointer', fontSize: 14, fontWeight: 600, opacity: savingProfile ? 0.7 : 1 }}>
            {savingProfile ? 'Saving...' : 'Save Profile'}
          </button>
        </div>
      </div>

      <h3 style={{ fontFamily: 'Fraunces, serif', fontSize: 20, color: 'var(--bp-text)', margin: '0 0 20px' }}>Workspace Settings</h3>

      <div style={{ background: 'var(--bp-card)', borderRadius: 12, border: '1px solid var(--bp-border)', padding: 24 }}>
        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--bp-muted)', marginBottom: 6 }}>Workspace Name</label>
        <input value={name} onChange={e => setName(e.target.value)} style={inputStyle} />

        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--bp-muted)', marginBottom: 6 }}>Slug</label>
        <input value={slug} onChange={e => setSlug(e.target.value)} style={inputStyle} />

        {msg && (
          <div style={{ fontSize: 14, marginBottom: 16, color: msg.type === 'success' ? G : '#DC2626' }}>{msg.text}</div>
        )}

        <button onClick={handleSave} disabled={saving}
          style={{ padding: '10px 24px', borderRadius: 8, border: 'none', background: O, color: '#fff', cursor: saving ? 'default' : 'pointer', fontSize: 14, fontWeight: 600, opacity: saving ? 0.7 : 1 }}>
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>

      {/* Workspace Details */}
      <div style={{ background: 'var(--bp-card)', borderRadius: 12, border: '1px solid var(--bp-border)', padding: 24, marginTop: 20 }}>
        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--bp-muted)', marginBottom: 12 }}>Workspace Details</label>
        <div style={{ display: 'grid', gap: 10, fontSize: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--bp-muted)' }}>Workspace ID</span>
            <span style={{ color: 'var(--bp-text)', fontFamily: 'DM Mono, monospace', fontSize: 12 }}>{workspace.id}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--bp-muted)' }}>Slug</span>
            <span style={{ color: 'var(--bp-text)' }}>{workspace.slug}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--bp-muted)' }}>Plan</span>
            <span style={{ color: 'var(--bp-text)', textTransform: 'capitalize' }}>{workspace.plan}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--bp-muted)' }}>Created</span>
            <span style={{ color: 'var(--bp-text)' }}>{new Date(workspace.createdAt).toLocaleDateString()}</span>
          </div>
        </div>
      </div>

      {/* Brand Logo */}
      <div style={{ background: 'var(--bp-card)', borderRadius: 12, border: '1px solid var(--bp-border)', padding: 24, marginTop: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--bp-muted)', margin: 0 }}>Brand Logo</label>
          {!isPro && (
            <span style={{ fontSize: 11, fontWeight: 600, color: O, background: `${O}12`, padding: '3px 10px', borderRadius: 100 }}>Professional+</span>
          )}
        </div>

        {isPro ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
              {logoPreview ? (
                <div style={{ position: 'relative' }}>
                  <img src={logoPreview} alt="Brand logo" style={{ width: 72, height: 72, borderRadius: 12, objectFit: 'contain', border: '1px solid var(--bp-border)', background: 'var(--bp-bg)', padding: 4 }} />
                  <button onClick={async () => {
                    setLogoUploading(true);
                    try {
                      await businessService.updateWorkspace(workspace.id, { logo_url: null } as Record<string, unknown>);
                      setLogoPreview(null);
                      onUpdated({ ...workspace, logoUrl: null });
                    } catch { /* ignore */ }
                    setLogoUploading(false);
                  }} style={{
                    position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: '50%',
                    background: '#DC2626', color: '#fff', border: '2px solid var(--bp-card)', fontSize: 10,
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>✕</button>
                </div>
              ) : (
                <div style={{ width: 72, height: 72, borderRadius: 12, border: '2px dashed var(--bp-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <span style={{ fontSize: 28, opacity: 0.3 }}>🏢</span>
                </div>
              )}
              <div>
                <input ref={logoInputRef} type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" hidden onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  if (file.size > 2 * 1024 * 1024) { alert('Logo must be under 2MB'); return; }
                  setLogoUploading(true);
                  const reader = new FileReader();
                  reader.onload = async (ev) => {
                    const dataUrl = ev.target?.result as string;
                    try {
                      await businessService.updateWorkspace(workspace.id, { logo_url: dataUrl } as Record<string, unknown>);
                      setLogoPreview(dataUrl);
                      onUpdated({ ...workspace, logoUrl: dataUrl });
                    } catch { alert('Failed to upload logo'); }
                    setLogoUploading(false);
                  };
                  reader.readAsDataURL(file);
                  if (logoInputRef.current) logoInputRef.current.value = '';
                }} />
                <button onClick={() => logoInputRef.current?.click()} disabled={logoUploading}
                  style={{ padding: '8px 18px', borderRadius: 8, border: '1px solid var(--bp-border)', background: 'var(--bp-bg)', color: 'var(--bp-text)', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: logoUploading ? 0.6 : 1 }}>
                  {logoUploading ? 'Uploading...' : logoPreview ? 'Change Logo' : 'Upload Logo'}
                </button>
                <div style={{ fontSize: 11, color: 'var(--bp-muted)', marginTop: 6 }}>PNG, JPG, SVG, or WebP · Max 2MB</div>
              </div>
            </div>
            <div style={{ fontSize: 12, color: 'var(--bp-muted)', lineHeight: 1.5 }}>
              Your logo appears on the maintenance status tracker, estimate summary PDFs, and the business portal header.
            </div>
          </>
        ) : (
          <div style={{ fontSize: 13, color: 'var(--bp-muted)', lineHeight: 1.6 }}>
            Add your company logo to maintenance status pages shared with guests. Available on <strong style={{ color: O }}>Professional</strong> plan and above.
          </div>
        )}
      </div>

      {/* Company Details */}
      <div style={{ background: 'var(--bp-card)', borderRadius: 12, border: '1px solid var(--bp-border)', padding: 24, marginTop: 20 }}>
        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--bp-muted)', marginBottom: 12 }}>Company Details</label>

        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--bp-muted)', marginBottom: 6 }}>Company Address</label>
        <textarea
          value={companyAddress}
          onChange={e => setCompanyAddress(e.target.value)}
          rows={2}
          style={{ ...inputStyle, resize: 'vertical' as const }}
          placeholder="123 Main St, Suite 100&#10;City, ST 12345"
        />

        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--bp-muted)', marginBottom: 6 }}>Company Phone</label>
        <input
          value={companyPhone}
          onChange={e => setCompanyPhone(e.target.value)}
          style={inputStyle}
          placeholder="(555) 123-4567"
        />

        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--bp-muted)', marginBottom: 6 }}>Company Email</label>
        <input
          value={companyEmail}
          onChange={e => setCompanyEmail(e.target.value)}
          style={inputStyle}
          placeholder="info@yourcompany.com"
          type="email"
        />

        <div style={{ fontSize: 12, color: 'var(--bp-muted)', marginBottom: 16, lineHeight: 1.5 }}>
          These details appear on estimate summary PDFs.
        </div>

        {detailsMsg && (
          <div style={{ fontSize: 14, marginBottom: 16, color: detailsMsg.type === 'success' ? G : '#DC2626' }}>{detailsMsg.text}</div>
        )}

        <button onClick={handleSaveCompanyDetails} disabled={savingDetails}
          style={{ padding: '10px 24px', borderRadius: 8, border: 'none', background: O, color: '#fff', cursor: savingDetails ? 'default' : 'pointer', fontSize: 14, fontWeight: 600, opacity: savingDetails ? 0.7 : 1 }}>
          {savingDetails ? 'Saving...' : 'Save Company Details'}
        </button>
      </div>

      {/* Appearance */}
      <div style={{ background: 'var(--bp-card)', borderRadius: 12, border: '1px solid var(--bp-border)', padding: 24, marginTop: 20 }}>
        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--bp-muted)', marginBottom: 12 }}>Appearance</label>
        <div style={{ display: 'flex', gap: 8 }}>
          {([
            { value: 'light' as const, label: '☀️ Light', desc: 'Always light' },
            { value: 'dark' as const, label: '🌙 Dark', desc: 'Always dark' },
            { value: 'auto' as const, label: '🔄 Auto', desc: 'Based on time of day' },
          ]).map(opt => (
            <button key={opt.value} onClick={() => onThemeChange(opt.value)}
              style={{
                flex: 1, padding: '12px 8px', borderRadius: 10, cursor: 'pointer', textAlign: 'center',
                border: themeMode === opt.value ? `2px solid ${O}` : '1px solid var(--bp-border)',
                background: themeMode === opt.value ? `${O}12` : 'var(--bp-bg)',
                transition: 'all 0.15s',
              }}>
              <div style={{ fontSize: 20, marginBottom: 4 }}>{opt.label.split(' ')[0]}</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: themeMode === opt.value ? O : 'var(--bp-text)' }}>{opt.label.split(' ').slice(1).join(' ')}</div>
              <div style={{ fontSize: 11, color: 'var(--bp-muted)', marginTop: 2 }}>{opt.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Slack Integration */}
      <SlackIntegrationSection workspace={workspace} isPro={isPro} onUpdated={onUpdated} />
    </div>
  );
}
