import { useState, useEffect, useRef, useCallback, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { W, D } from './constants';
import { businessService } from '@/services/api';

interface BusinessLayoutProps {
  children: ReactNode;
  sidebar: ReactNode;
  sidebarMobile?: ReactNode;
  mobileOpen?: boolean;
  setMobileOpen?: (open: boolean) => void;
  resolvedTheme: 'light' | 'dark';
  workspaceLogo?: string | null;
  workspaceName?: string;
  workspaceId?: string;
  onNavigate?: (tab: string, focusId?: string) => void;
  fullWidthContent?: ReactNode;
}

interface SearchResultItem {
  id: string;
  name?: string;
  address?: string;
  phone?: string;
  category?: string;
  summary?: string;
  status?: string;
  propertyName?: string;
  date?: string;
  isPreferred?: boolean;
  quoteCount?: number;
  bookingCount?: number;
  relatedJobs?: Array<{ jobId: string; summary: string; category: string; status: string; propertyName: string; relation: string; date: string }>;
  tab: string;
}

function SearchIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <circle cx="9" cy="9" r="5.5" /><path d="M13.5 13.5L17 17" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <path d="M5 8a5 5 0 0110 0c0 4 2 6 2 6H3s2-2 2-6" /><path d="M8.5 17a2 2 0 003 0" />
    </svg>
  );
}

function HamburgerIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <path d="M3 5h14" /><path d="M3 10h14" /><path d="M3 15h14" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 16 16" fill="none" style={{ animation: 'spin 0.8s linear infinite' }}>
      <circle cx="8" cy="8" r="6" stroke="var(--bp-border)" strokeWidth="2" />
      <path d="M8 2a6 6 0 014.9 2.5" stroke="var(--bp-subtle)" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

interface SearchResults {
  properties: SearchResultItem[];
  providers: SearchResultItem[];
  dispatches: SearchResultItem[];
}

export default function BusinessLayout({ children, sidebar, sidebarMobile, mobileOpen: mobileOpenProp, setMobileOpen: setMobileOpenProp, resolvedTheme, workspaceLogo, workspaceName, workspaceId, onNavigate, fullWidthContent }: BusinessLayoutProps) {
  const [mobileOpenInternal, setMobileOpenInternal] = useState(false);
  const mobileOpen = mobileOpenProp ?? mobileOpenInternal;
  const setMobileOpen = setMobileOpenProp ?? setMobileOpenInternal;

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResults | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchDropdownPos, setSearchDropdownPos] = useState<{ top: number; left: number; width: number }>({ top: 0, left: 0, width: 480 });
  const searchRef = useRef<HTMLDivElement>(null);
  const searchDropdownRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Recompute dropdown position when opening or on resize
  useEffect(() => {
    if (!searchOpen) return;
    const update = () => {
      if (!searchRef.current) return;
      const rect = searchRef.current.getBoundingClientRect();
      setSearchDropdownPos({ top: rect.bottom + 4, left: rect.left, width: Math.max(rect.width, 480) });
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [searchOpen]);

  const doSearch = useCallback(async (query: string) => {
    if (!workspaceId || query.length < 2) {
      setSearchResults(null);
      setSearchLoading(false);
      return;
    }
    setSearchLoading(true);
    try {
      const res = await businessService.search(workspaceId, query);
      if (res.data) {
        setSearchResults(res.data as unknown as SearchResults);
      }
    } catch {
      setSearchResults(null);
    } finally {
      setSearchLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (searchQuery.length < 2) {
      setSearchResults(null);
      setSearchLoading(false);
      setSearchOpen(false);
      return;
    }
    // Show loading state immediately so the dropdown is never empty
    setSearchLoading(true);
    setSearchOpen(true);
    debounceRef.current = setTimeout(() => {
      doSearch(searchQuery);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchQuery, doSearch]);

  // Close dropdown on click outside or Escape
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      const inSearchInput = searchRef.current && searchRef.current.contains(target);
      const inDropdown = searchDropdownRef.current && searchDropdownRef.current.contains(target);
      if (!inSearchInput && !inDropdown) {
        setSearchOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setSearchOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  function handleResultClick(tab: string, id?: string) {
    setSearchOpen(false);
    setSearchQuery('');
    setSearchResults(null);
    if (onNavigate) onNavigate(tab, id);
  }

  const hasResults = searchResults && (
    searchResults.properties.length > 0 ||
    searchResults.providers.length > 0 ||
    searchResults.dispatches.length > 0
  );

  return (
    <div className="bp-portal" data-theme={resolvedTheme} style={{ height: '100vh', background: 'var(--bp-bg)', display: 'flex', overflow: 'hidden' }}>
      <style>{`
        .bp-portal {
          --bp-bg: ${W};
          --bp-card: #ffffff;
          --bp-input: #ffffff;
          --bp-text: ${D};
          --bp-muted: #6B6560;
          --bp-subtle: #9B9490;
          --bp-border: #E0DAD4;
          --bp-hover: #FAFAF8;
          --bp-header: #ffffff;
          --bp-warm: ${W};
          color: var(--bp-text);
          transition: background 0.3s, color 0.3s;
        }
        .bp-portal[data-theme="dark"] {
          --bp-bg: #1A1A1A;
          --bp-card: #242424;
          --bp-input: #2E2E2E;
          --bp-text: #E8E4E0;
          --bp-muted: #9B9490;
          --bp-subtle: #6B6560;
          --bp-border: #3A3A3A;
          --bp-hover: #2E2E2E;
          --bp-header: #1E1E1E;
          --bp-warm: #2E2E2E;
        }
        .bp-portal[data-theme="dark"] input,
        .bp-portal[data-theme="dark"] select,
        .bp-portal[data-theme="dark"] textarea {
          background: var(--bp-input) !important;
          color: var(--bp-text) !important;
          border-color: var(--bp-border) !important;
        }
        .bp-portal[data-theme="dark"] button {
          transition: background 0.15s, color 0.15s;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        .bp-search-portal {
          --bp-bg: ${W};
          --bp-card: #ffffff;
          --bp-text: ${D};
          --bp-muted: #6B6560;
          --bp-subtle: #9B9490;
          --bp-border: #E0DAD4;
          --bp-hover: #FAFAF8;
          color: var(--bp-text);
          font-family: 'DM Sans', sans-serif;
        }
        .bp-search-portal .bp-search-row:hover { background: #FAFAF8; }
        @media (max-width: 640px) {
          .bp-prop-inner { flex-direction: column !important; }
          .bp-prop-img { width: 100% !important; height: 140px !important; min-height: auto !important; }
          .bp-prop-body { padding: 14px !important; }
          .bp-prop-name { font-size: 14px !important; }
          .bp-prop-addr { font-size: 12px !important; margin-top: 2px !important; }
          .bp-prop-actions { gap: 4px !important; }
          .bp-prop-badge { font-size: 10px !important; padding: 2px 8px !important; }
          .bp-prop-type { display: none !important; }
          .bp-prop-details { font-size: 12px !important; gap: 6px !important; margin-top: 6px !important; }
          .bp-prop-notes { font-size: 12px !important; margin-top: 6px !important; }
        }
        .bp-sidebar-desktop { display: flex; }
        .bp-sidebar-mobile-overlay { display: none; }
        .bp-hamburger { display: none; }
        .bp-search-desktop { display: flex; }
        @media (max-width: 768px) {
          .bp-sidebar-desktop { display: none !important; }
          .bp-sidebar-mobile-overlay { display: flex; }
          .bp-hamburger { display: flex !important; }
          .bp-search-desktop { display: none !important; }
          .bp-content-padding { padding: 16px !important; }
          .bp-dashboard-mid { grid-template-columns: 1fr !important; }
        }
        .bp-search-row:hover { background: var(--bp-hover); }
      `}</style>

      <link href="https://fonts.googleapis.com/css2?family=Fraunces:wght@400;700&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />

      {/* Desktop sidebar */}
      <div className="bp-sidebar-desktop" style={{ display: 'flex' }}>
        {sidebar}
      </div>

      {/* Mobile drawer overlay */}
      <div className="bp-sidebar-mobile-overlay" style={{ position: 'fixed', inset: 0, zIndex: 100, pointerEvents: mobileOpen ? 'auto' : 'none' }}>
        {/* Backdrop */}
        <div onClick={() => setMobileOpen(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', opacity: mobileOpen ? 1 : 0, transition: 'opacity 0.3s' }} />
        {/* Drawer */}
        <div style={{ position: 'relative', transform: mobileOpen ? 'translateX(0)' : 'translateX(-100%)', transition: 'transform 0.3s ease', height: '100%', zIndex: 1, width: 280 }}>
          {sidebarMobile || sidebar}
        </div>
      </div>

      {/* Main content area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Top bar */}
        <div style={{
          height: 64, background: 'var(--bp-header)', borderBottom: '1px solid var(--bp-border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', flexShrink: 0,
        }}>
          {/* Hamburger button (mobile only) */}
          <button className="bp-hamburger" onClick={() => setMobileOpen(true)} style={{
            display: 'none', alignItems: 'center', justifyContent: 'center',
            background: 'none', border: 'none', cursor: 'pointer', color: 'var(--bp-text)', padding: 4,
          }}>
            <HamburgerIcon />
          </button>

          {/* Search bar (desktop only) */}
          <div ref={searchRef} className="bp-search-desktop" style={{
            display: 'flex', alignItems: 'center', gap: 8, position: 'relative', width: 400,
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bp-bg)',
              borderRadius: 10, padding: '8px 14px', width: '100%',
            }}>
              <span style={{ color: 'var(--bp-subtle)', display: 'flex', flexShrink: 0 }}><SearchIcon /></span>
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onFocus={() => { if (searchQuery.length >= 2) setSearchOpen(true); }}
                placeholder="Search properties, providers, and dispatches..."
                style={{
                  fontFamily: "'DM Sans',sans-serif",
                  fontSize: 13,
                  color: 'var(--bp-text)',
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  width: '100%',
                  padding: 0,
                }}
              />
            </div>

            {/* Search dropdown — rendered via portal to escape parent containment */}
            {searchOpen && createPortal(
              <div ref={searchDropdownRef} className="bp-search-portal" style={{
                position: 'fixed',
                top: searchDropdownPos.top,
                left: searchDropdownPos.left,
                width: searchDropdownPos.width,
                background: '#ffffff',
                border: '1px solid #E0DAD4',
                borderRadius: 12,
                boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
                maxHeight: 400,
                overflowY: 'auto',
                zIndex: 99999,
                fontFamily: "'DM Sans', sans-serif",
              }}>
                {searchLoading && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, gap: 8 }}>
                    <SpinnerIcon />
                    <span style={{ fontSize: 13, color: 'var(--bp-subtle)' }}>Searching...</span>
                  </div>
                )}

                {!searchLoading && searchResults && !hasResults && (
                  <div style={{ padding: 16, textAlign: 'center', fontSize: 13, color: 'var(--bp-subtle)' }}>
                    No results
                  </div>
                )}

                {!searchLoading && searchResults && hasResults && (
                  <>
                    {searchResults.properties.length > 0 && (
                      <div>
                        <div style={{ padding: '10px 14px 4px', fontSize: 10, fontWeight: 700, color: 'var(--bp-subtle)', letterSpacing: 1, textTransform: 'uppercase' }}>
                          Properties
                        </div>
                        {searchResults.properties.map(p => (
                          <div
                            key={p.id}
                            className="bp-search-row"
                            onClick={() => handleResultClick(p.tab, p.id)}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px',
                              height: 40, cursor: 'pointer', transition: 'background 0.1s',
                            }}
                          >
                            <span style={{ fontSize: 14, flexShrink: 0 }}>&#127968;</span>
                            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--bp-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</span>
                            <span style={{ fontSize: 12, color: 'var(--bp-subtle)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginLeft: 'auto' }}>{p.address}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {searchResults.providers.length > 0 && (
                      <div>
                        <div style={{ padding: '10px 14px 4px', fontSize: 10, fontWeight: 700, color: 'var(--bp-subtle)', letterSpacing: 1, textTransform: 'uppercase' }}>
                          Providers
                        </div>
                        {searchResults.providers.map(p => (
                          <div key={p.id}>
                            <div
                              className="bp-search-row"
                              onClick={() => handleResultClick(p.tab, p.id)}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 10, padding: '6px 14px',
                                minHeight: 40, cursor: 'pointer', transition: 'background 0.1s',
                              }}
                            >
                              <span style={{ fontSize: 14, flexShrink: 0 }}>&#128100;</span>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--bp-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</span>
                                  {p.isPreferred && <span style={{ fontSize: 9, fontWeight: 700, color: '#E8632B', background: '#FFF3E8', padding: '1px 5px', borderRadius: 4, whiteSpace: 'nowrap' }}>PREFERRED</span>}
                                </div>
                                <div style={{ display: 'flex', gap: 8, fontSize: 11, color: 'var(--bp-subtle)', marginTop: 1 }}>
                                  {(p.quoteCount ?? 0) > 0 && <span>{p.quoteCount} quote{p.quoteCount !== 1 ? 's' : ''}</span>}
                                  {(p.bookingCount ?? 0) > 0 && <span>{p.bookingCount} booking{p.bookingCount !== 1 ? 's' : ''}</span>}
                                  {!(p.quoteCount || p.bookingCount) && p.phone && <span>{p.phone}</span>}
                                </div>
                              </div>
                              {(p.quoteCount || p.bookingCount) ? <span style={{ fontSize: 11, color: 'var(--bp-subtle)', whiteSpace: 'nowrap', flexShrink: 0 }}>{p.phone}</span> : null}
                            </div>
                            {p.relatedJobs && p.relatedJobs.length > 0 && (
                              <div style={{ paddingLeft: 38, paddingRight: 14, paddingBottom: 4 }}>
                                {p.relatedJobs.map(j => (
                                  <div
                                    key={j.jobId}
                                    className="bp-search-row"
                                    onClick={() => handleResultClick('dispatches', j.jobId)}
                                    style={{
                                      display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px',
                                      borderRadius: 6, cursor: 'pointer', transition: 'background 0.1s',
                                    }}
                                  >
                                    <span style={{ fontSize: 9, fontWeight: 700, color: j.relation === 'booking' ? '#1B9E77' : '#1565C0', background: j.relation === 'booking' ? '#E8F5E9' : '#E3F2FD', padding: '1px 5px', borderRadius: 3, textTransform: 'uppercase', flexShrink: 0 }}>{j.relation}</span>
                                    <span style={{ fontSize: 12, color: 'var(--bp-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{j.category || j.summary}</span>
                                    {j.propertyName && <span style={{ fontSize: 11, color: 'var(--bp-subtle)', marginLeft: 'auto', whiteSpace: 'nowrap', flexShrink: 0 }}>{j.propertyName}</span>}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {searchResults.dispatches.length > 0 && (
                      <div>
                        <div style={{ padding: '10px 14px 4px', fontSize: 10, fontWeight: 700, color: 'var(--bp-subtle)', letterSpacing: 1, textTransform: 'uppercase' }}>
                          Dispatches
                        </div>
                        {searchResults.dispatches.map(d => {
                          const statusColors: Record<string, string> = {
                            open: '#2563EB', dispatching: '#C2410C', collecting: '#7C3AED',
                            completed: '#16A34A', expired: '#9B9490', archived: '#9B9490',
                          };
                          const sc = statusColors[d.status as string] ?? '#9B9490';
                          const dateStr = d.date ? new Date(d.date as string).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
                          return (
                            <div
                              key={d.id}
                              className="bp-search-row"
                              onClick={() => handleResultClick(d.tab, d.id)}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px',
                                cursor: 'pointer', transition: 'background 0.1s',
                              }}
                            >
                              <span style={{ fontSize: 14, flexShrink: 0 }}>{'\uD83D\uDCCB'}</span>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--bp-text)' }}>{d.category || 'Dispatch'}</span>
                                  <span style={{ fontSize: 10, fontWeight: 600, color: sc, background: `${sc}15`, padding: '1px 6px', borderRadius: 100, textTransform: 'capitalize' }}>{d.status}</span>
                                </div>
                                <div style={{ fontSize: 11, color: 'var(--bp-subtle)', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {[dateStr, d.propertyName].filter(Boolean).join(' · ')}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </>
                )}
              </div>,
              document.body
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            {workspaceLogo && (
              <>
                <img src={workspaceLogo} alt={workspaceName || ''} style={{ height: 48, maxWidth: 200, objectFit: 'contain' }} />
                <div style={{ width: 1, height: 24, background: 'var(--bp-border)' }} />
              </>
            )}
            <div style={{ position: 'relative', cursor: 'pointer', color: 'var(--bp-subtle)' }}>
              <BellIcon />
              <div style={{
                position: 'absolute', top: -2, right: -2, width: 8, height: 8,
                borderRadius: '50%', background: '#E04343', border: '2px solid var(--bp-header)',
              }} />
            </div>
          </div>
        </div>

        {/* Content */}
        {fullWidthContent ? (
          <div style={{ flex: 1, overflow: 'hidden' }}>
            {fullWidthContent}
          </div>
        ) : (
          <div style={{ flex: 1, overflowY: 'auto' }}>
            <div className="bp-content-padding" style={{ padding: 32, maxWidth: 1200 }}>
              {children}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
