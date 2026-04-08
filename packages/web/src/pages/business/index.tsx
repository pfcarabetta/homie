import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { businessService, type Workspace, type WorkspaceDetail } from '@/services/api';
import { O, G, D, TABS, type Tab, HomieBizLogo, useThemeMode } from './constants';
import BusinessLayout from './BusinessLayout';
import BusinessSidebar from './BusinessSidebar';
import DashboardTab from './DashboardTab';
import PropertiesTab from './PropertiesTab';
import DispatchesTab from './DispatchesTab';
import BookingsTab from './BookingsTab';
import GuestRequestsTab from './GuestRequestsTab';
import SchedulesTab from './SchedulesTab';
import ReportsTab from './ReportsTab';
import VendorsTab from './VendorsTab';
import TeamTab from './TeamTab';
import SettingsTab from './SettingsTab';
import BillingTab from './BillingTab';

type ReportView = 'summary' | 'property' | 'category' | 'vendor' | 'monthly' | 'scorecards';

/* ── Create Workspace Modal ─────────────────────────────────────────────── */

function CreateWorkspaceModal({ onClose, onCreated }: { onClose: () => void; onCreated: (w: Workspace) => void }) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleCreate() {
    if (!name.trim()) { setError('Name is required'); return; }
    setSaving(true);
    setError('');
    try {
      const res = await businessService.createWorkspace({ name: name.trim(), ...(slug ? { slug } : {}) });
      if (res.data) onCreated(res.data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create workspace');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div style={{ background: '#fff', borderRadius: 12, padding: 32, width: '100%', maxWidth: 440, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <h3 style={{ fontFamily: 'Fraunces, serif', fontSize: 22, color: D, margin: '0 0 20px' }}>Create Workspace</h3>

        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#6B6560', marginBottom: 6 }}>Business Name *</label>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Acme Property Management"
          style={{ width: '100%', padding: '10px 14px', border: '1px solid #E0DAD4', borderRadius: 8, fontSize: 15, marginBottom: 16, boxSizing: 'border-box' }} />

        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#6B6560', marginBottom: 6 }}>Custom Slug (optional)</label>
        <input value={slug} onChange={e => setSlug(e.target.value)} placeholder="acme-pm"
          style={{ width: '100%', padding: '10px 14px', border: '1px solid #E0DAD4', borderRadius: 8, fontSize: 15, marginBottom: 8, boxSizing: 'border-box' }} />
        <div style={{ fontSize: 12, color: '#9B9490', marginBottom: 20 }}>Used in your workspace URL. Auto-generated from name if blank.</div>

        {error && <div style={{ color: '#DC2626', fontSize: 14, marginBottom: 16 }}>{error}</div>}

        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '10px 20px', borderRadius: 8, border: '1px solid #E0DAD4', background: '#fff', cursor: 'pointer', fontSize: 14, color: D }}>Cancel</button>
          <button onClick={handleCreate} disabled={saving}
            style={{ padding: '10px 24px', borderRadius: 8, border: 'none', background: O, color: '#fff', cursor: saving ? 'default' : 'pointer', fontSize: 14, fontWeight: 600, opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Creating...' : 'Create Workspace'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Main Page ──────────────────────────────────────────────────────────── */

export default function BusinessPortal() {
  useDocumentTitle('Business Portal');
  const { homeowner } = useAuth();
  const navigate = useNavigate();
  const { mode: themeMode, resolvedTheme, setTheme } = useThemeMode();

  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [workspace, setWorkspace] = useState<WorkspaceDetail | null>(null);
  const [tab, setTab] = useState<Tab>('dashboard');
  const [focusJobId, setFocusJobId] = useState<string | null>(null);
  const [showReportsUpgrade, setShowReportsUpgrade] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    return localStorage.getItem('bp_sidebar_collapsed') === 'true';
  });
  const [reportsInitialView, setReportsInitialView] = useState<ReportView | undefined>(undefined);

  function handleSidebarCollapse(v: boolean) {
    setSidebarCollapsed(v);
    localStorage.setItem('bp_sidebar_collapsed', String(v));
  }

  useEffect(() => {
    if (!homeowner) { navigate('/login?redirect=/business'); return; }
    businessService.listWorkspaces().then(res => {
      if (res.data) {
        setWorkspaces(res.data);
        if (res.data.length > 0) setSelectedId(res.data[0].id);
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [homeowner, navigate]);

  useEffect(() => {
    if (!selectedId) { setWorkspace(null); return; }
    businessService.getWorkspace(selectedId).then(res => {
      if (res.data) setWorkspace(res.data);
    });
  }, [selectedId]);

  // Handle URL params for tab navigation and profile focus
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlTab = params.get('tab');
    if (urlTab && (TABS as readonly string[]).includes(urlTab)) {
      setTab(urlTab as Tab);
    }
    if (params.get('focus') === 'profile' && urlTab === 'settings') {
      setTimeout(() => {
        const el = document.getElementById('my-profile-section');
        if (el) el.scrollIntoView({ behavior: 'smooth' });
      }, 300);
    }
  }, []);

  if (!homeowner) return null;

  // Build user info for sidebar
  const userName = homeowner.first_name
    ? `${homeowner.first_name} ${homeowner.last_name || ''}`.trim()
    : homeowner.email;
  const userInitials = homeowner.first_name
    ? `${homeowner.first_name[0]}${(homeowner.last_name || '')[0] || ''}`.toUpperCase()
    : homeowner.email[0].toUpperCase();

  function handleSidebarNavigate(t: Tab, options?: { initialView?: string }) {
    if (t === 'reports' && options?.initialView) {
      setReportsInitialView(options.initialView as ReportView);
    } else if (t === 'reports') {
      setReportsInitialView(undefined);
    }
    setTab(t);
  }

  // No workspaces: show full-page empty state (no sidebar)
  if (!loading && workspaces.length === 0) {
    return (
      <div className="bp-portal" data-theme={resolvedTheme} style={{ minHeight: '100vh', background: 'var(--bp-bg)' }}>
        <style>{`
          .bp-portal { --bp-bg: #F9F5F2; --bp-text: #2D2926; color: var(--bp-text); }
          .bp-portal[data-theme="dark"] { --bp-bg: #1A1A1A; --bp-text: #E8E4E0; }
        `}</style>
        <div style={{ textAlign: 'center', padding: '80px 20px' }}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>🏢</div>
          <h2 style={{ fontFamily: 'Fraunces, serif', fontSize: 28, color: D, marginBottom: 12 }}>Welcome to <HomieBizLogo size="large" /></h2>
          <p style={{ fontSize: 16, color: '#6B6560', maxWidth: 480, margin: '0 auto 32px', lineHeight: 1.6 }}>
            Manage maintenance across all your properties with one dashboard. Create your first workspace to get started.
          </p>
          <button onClick={() => setShowCreate(true)}
            style={{ padding: '14px 32px', borderRadius: 10, border: 'none', background: O, color: '#fff', fontSize: 16, fontWeight: 600, cursor: 'pointer' }}>
            Create Your First Workspace
          </button>
        </div>
        {showCreate && (
          <CreateWorkspaceModal onClose={() => setShowCreate(false)}
            onCreated={w => {
              setWorkspaces(prev => [w, ...prev]);
              setSelectedId(w.id);
              setShowCreate(false);
            }} />
        )}
      </div>
    );
  }

  // Loading state
  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#F9F5F2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', color: '#9B9490' }}>Loading workspaces...</div>
      </div>
    );
  }

  return (
    <BusinessLayout
      resolvedTheme={resolvedTheme}
      workspaceLogo={workspace?.logoUrl}
      workspaceName={workspace?.name}
      sidebar={
        <BusinessSidebar
          collapsed={sidebarCollapsed}
          setCollapsed={handleSidebarCollapse}
          activeTab={tab}
          onNavigate={handleSidebarNavigate}
          onNewDispatch={() => navigate(`/business/chat?workspace=${selectedId}`)}
          onLockedTab={() => setShowReportsUpgrade(true)}
          workspacePlan={workspace?.plan ?? 'trial'}
          userRole={workspace?.user_role ?? 'viewer'}
          userName={userName}
          userInitials={userInitials}
        />
      }
    >
      {/* Workspace selector */}
      {workspaces.length > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <select value={selectedId || ''} onChange={e => { setSelectedId(e.target.value); setTab('dashboard'); }}
            style={{ fontFamily: 'Fraunces, serif', fontSize: 18, fontWeight: 600, color: 'var(--bp-text)', border: 'none', background: 'transparent', cursor: 'pointer', padding: '4px 8px' }}>
            {workspaces.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
          {workspace && (
            <span style={{ fontSize: 12, padding: '4px 10px', borderRadius: 20, background: `${G}15`, color: G, fontWeight: 600, flexShrink: 0 }}>
              {workspace.plan}
            </span>
          )}
          <button onClick={() => setShowCreate(true)}
            style={{ marginLeft: 'auto', padding: '8px 20px', borderRadius: 8, border: '1px solid var(--bp-border)', background: 'var(--bp-card)', cursor: 'pointer', fontSize: 14, color: 'var(--bp-text)', fontWeight: 500 }}>
            + New Workspace
          </button>
        </div>
      )}

      {/* Tab content */}
      {workspace && tab === 'dashboard' && <DashboardTab workspace={workspace} onNavigate={(t, jobId) => { setFocusJobId(jobId ?? null); setTab(t); }} />}
      {workspace && tab === 'billing' && workspace.user_role === 'admin' && (
        <BillingTab workspace={workspace} onUpdated={w => setWorkspace(w)} />
      )}
      {workspace && tab === 'dispatches' && (
        <DispatchesTab workspaceId={workspace.id} onTabChange={setTab} plan={workspace.plan} focusJobId={focusJobId} onFocusHandled={() => setFocusJobId(null)} />
      )}
      {workspace && tab === 'bookings' && (
        <BookingsTab workspaceId={workspace.id} focusJobId={focusJobId} onFocusHandled={() => setFocusJobId(null)} />
      )}
      {workspace && tab === 'guest-requests' && (
        <GuestRequestsTab workspaceId={workspace.id} plan={workspace.plan} onViewDispatch={(jobId) => { setFocusJobId(jobId); setTab('dispatches'); }} />
      )}
      {workspace && tab === 'schedules' && (
        <SchedulesTab workspaceId={workspace.id} plan={workspace.plan} />
      )}
      {workspace && tab === 'reports' && (
        <ReportsTab workspaceId={workspace.id} plan={workspace.plan} initialView={reportsInitialView} />
      )}
      {workspace && tab === 'properties' && (
        <PropertiesTab workspaceId={workspace.id} role={workspace.user_role} plan={workspace.plan} />
      )}
      {workspace && tab === 'vendors' && (
        <VendorsTab workspaceId={workspace.id} role={workspace.user_role} plan={workspace.plan} />
      )}
      {workspace && tab === 'team' && (
        <TeamTab workspaceId={workspace.id} role={workspace.user_role} ownerId={workspace.ownerId || ''} plan={workspace.plan} />
      )}
      {workspace && tab === 'settings' && workspace.user_role === 'admin' && (
        <SettingsTab workspace={workspace} onUpdated={w => { setWorkspace(w); }} themeMode={themeMode} onThemeChange={setTheme} />
      )}

      {/* Upgrade modal */}
      {showReportsUpgrade && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}
          onClick={() => setShowReportsUpgrade(false)}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 32, width: '100%', maxWidth: 420, boxShadow: '0 16px 48px rgba(0,0,0,0.15)', textAlign: 'center' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>📊</div>
            <h3 style={{ fontFamily: 'Fraunces, serif', fontSize: 22, color: D, margin: '0 0 8px' }}>Upgrade to unlock this feature</h3>
            <p style={{ fontSize: 14, color: '#6B6560', lineHeight: 1.6, marginBottom: 24 }}>
              Full cost reporting, provider scorecards, guest requests, and auto-dispatch are available on the <strong style={{ color: O }}>Professional</strong> plan and above.
            </p>
            <div style={{ background: '#F9F5F2', borderRadius: 12, padding: 16, marginBottom: 24, textAlign: 'left' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: D, marginBottom: 10 }}>Professional plan includes:</div>
              {['Full cost reporting by property & category', 'Provider scorecards with response rates', 'Guest request management & auto-dispatch', 'Booking & dispatch analytics', 'Team activity log'].map((f, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, fontSize: 13, color: '#6B6560' }}>
                  <span style={{ color: G, fontSize: 12 }}>✓</span> {f}
                </div>
              ))}
            </div>
            <button onClick={() => setShowReportsUpgrade(false)}
              style={{ width: '100%', padding: '14px 0', borderRadius: 10, border: 'none', background: O, color: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>
              Got it
            </button>
          </div>
        </div>
      )}

      {showCreate && (
        <CreateWorkspaceModal onClose={() => setShowCreate(false)}
          onCreated={w => {
            setWorkspaces(prev => [w, ...prev]);
            setSelectedId(w.id);
            setShowCreate(false);
          }} />
      )}
    </BusinessLayout>
  );
}
