import { useEffect, useState } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { getAdminKey, clearAdminKey } from '@/services/admin-api';

const NAV_ITEMS = [
  { to: '/admin/dashboard', label: 'Dashboard' },
  { to: '/admin/homeowners', label: 'Homeowners' },
  { to: '/admin/jobs', label: 'Jobs' },
  { to: '/admin/inspect', label: 'Inspect' },
  { to: '/admin/providers', label: 'Providers' },
  { to: '/admin/bookings', label: 'Bookings' },
  { to: '/admin/business', label: 'Business' },
  { to: '/admin/pricing', label: 'Pricing' },
];

export default function AdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!getAdminKey()) navigate('/admin');
  }, [navigate]);

  // Close drawer on route change
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  function handleLogout() {
    clearAdminKey();
    navigate('/admin');
  }

  return (
    <div className="min-h-screen bg-warm">
      {/* Nav bar */}
      <nav className="bg-dark text-white px-6 py-3 flex items-center gap-6">
        <span className="font-display font-bold text-lg mr-4">
          homie <span className="text-white/40 text-sm">admin</span>
        </span>

        {/* Desktop nav links */}
        <div className="hidden md:flex items-center gap-6 flex-1">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `text-sm font-medium transition-colors ${isActive ? 'text-orange-400' : 'text-white/60 hover:text-white'}`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </div>

        {/* Desktop logout */}
        <button
          onClick={handleLogout}
          className="hidden md:block ml-auto text-sm text-white/40 hover:text-white transition-colors"
        >
          Logout
        </button>

        {/* Mobile: logout + hamburger */}
        <div className="md:hidden ml-auto flex items-center gap-3">
          <button
            onClick={handleLogout}
            className="text-sm text-white/40 hover:text-white transition-colors"
          >
            Logout
          </button>
          <button
            onClick={() => setMenuOpen((o) => !o)}
            className="p-1 text-white/70 hover:text-white transition-colors"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          >
            {menuOpen ? (
              /* X icon */
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              /* Hamburger icon */
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>
      </nav>

      {/* Mobile slide-down menu */}
      {menuOpen && (
        <div className="md:hidden bg-dark border-t border-white/10">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `block px-6 py-3 text-sm font-medium border-b border-white/5 transition-colors ${
                  isActive ? 'text-orange-400 bg-white/5' : 'text-white/60 hover:text-white hover:bg-white/5'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </div>
      )}

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <Outlet />
      </div>
    </div>
  );
}
