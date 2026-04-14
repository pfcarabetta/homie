import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { inspectService, type PortalReport } from '@/services/inspector-api';
import { TABS, type Tab, useThemeMode } from './constants';
import { getStoredNav, setStoredNav } from './nav-storage';
import InspectLayout from './InspectLayout';
import InspectSidebar from './InspectSidebar';
import DashboardTab from './DashboardTab';
import ReportsTab from './ReportsTab';
import ItemsTab from './ItemsTab';
import QuotesTab from './QuotesTab';
import NegotiationsTab from './NegotiationsTab';
import MaintenanceTab from './MaintenanceTab';
import DocumentsTab from './DocumentsTab';
import SettingsTab from './SettingsTab';

export default function InspectPortal() {
  useDocumentTitle('Homie Inspect');
  const { homeowner } = useAuth();
  const navigate = useNavigate();
  const { mode: themeMode, resolvedTheme, setTheme } = useThemeMode();

  const [tab, setTab] = useState<Tab>(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const urlTab = params.get('tab');
      if (urlTab && (TABS as readonly string[]).includes(urlTab)) return urlTab as Tab;
    } catch { /* ignore */ }
    const stored = getStoredNav('tab');
    if (stored && (TABS as readonly string[]).includes(stored)) return stored as Tab;
    return 'dashboard';
  });

  const [loading, setLoading] = useState(true);
  const [reports, setReports] = useState<PortalReport[]>([]);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    return localStorage.getItem('hi_sidebar_collapsed') === 'true';
  });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  function handleSidebarCollapse(v: boolean) {
    setSidebarCollapsed(v);
    localStorage.setItem('hi_sidebar_collapsed', String(v));
  }

  const fetchReports = useCallback(() => {
    inspectService.getMyReports()
      .then(res => { if (res.data) setReports(res.data.reports); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!homeowner) { navigate('/login?redirect=/inspect-portal'); return; }
    fetchReports();
  }, [homeowner, navigate, fetchReports]);

  useEffect(() => {
    setStoredNav('tab', tab);
  }, [tab]);

  function handleNavigate(newTab: Tab) {
    setTab(newTab);
    setMobileMenuOpen(false);
  }

  // User info for sidebar
  const userName = homeowner
    ? [homeowner.first_name, homeowner.last_name].filter(Boolean).join(' ') || homeowner.email
    : 'User';
  const userInitials = homeowner?.first_name && homeowner?.last_name
    ? `${homeowner.first_name[0]}${homeowner.last_name[0]}`.toUpperCase()
    : homeowner?.email?.[0]?.toUpperCase() || 'U';

  if (!homeowner) return null;

  const sidebarEl = (
    <InspectSidebar
      collapsed={sidebarCollapsed}
      setCollapsed={handleSidebarCollapse}
      activeTab={tab}
      onNavigate={handleNavigate}
      userName={userName}
      userInitials={userInitials}
    />
  );

  const mobileSidebarEl = (
    <InspectSidebar
      collapsed={false}
      setCollapsed={handleSidebarCollapse}
      activeTab={tab}
      onNavigate={handleNavigate}
      userName={userName}
      userInitials={userInitials}
      onNavigateCallback={() => setMobileMenuOpen(false)}
    />
  );

  function renderTab() {
    switch (tab) {
      case 'dashboard':
        return <DashboardTab reports={reports} loading={loading} onNavigate={handleNavigate} />;
      case 'reports':
        return <ReportsTab onNavigate={handleNavigate} reports={reports} onReportsChange={fetchReports} />;
      case 'items':
        return <ItemsTab />;
      case 'quotes':
        return <QuotesTab />;
      case 'negotiations':
        return <NegotiationsTab />;
      case 'maintenance':
        return <MaintenanceTab />;
      case 'documents':
        return <DocumentsTab />;
      case 'settings':
        return <SettingsTab resolvedTheme={resolvedTheme} themeMode={themeMode} onThemeChange={setTheme} />;
      default:
        return <DashboardTab reports={reports} loading={loading} onNavigate={handleNavigate} />;
    }
  }

  return (
    <InspectLayout
      sidebar={sidebarEl}
      sidebarMobile={mobileSidebarEl}
      mobileOpen={mobileMenuOpen}
      setMobileOpen={setMobileMenuOpen}
      resolvedTheme={resolvedTheme}
    >
      {renderTab()}
    </InspectLayout>
  );
}
