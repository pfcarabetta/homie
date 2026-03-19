import { useEffect } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { getAdminKey, clearAdminKey } from '@/services/admin-api';

const NAV_ITEMS = [
  { to: '/admin/dashboard', label: 'Dashboard' },
  { to: '/admin/homeowners', label: 'Homeowners' },
  { to: '/admin/jobs', label: 'Jobs' },
  { to: '/admin/providers', label: 'Providers' },
  { to: '/admin/bookings', label: 'Bookings' },
];

export default function AdminLayout() {
  const navigate = useNavigate();

  useEffect(() => {
    if (!getAdminKey()) navigate('/admin');
  }, [navigate]);

  function handleLogout() {
    clearAdminKey();
    navigate('/admin');
  }

  return (
    <div className="min-h-screen bg-warm">
      <nav className="bg-dark text-white px-6 py-3 flex items-center gap-6">
        <span className="font-display font-bold text-lg mr-4">homie <span className="text-white/40 text-sm">admin</span></span>
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
        <button onClick={handleLogout} className="ml-auto text-sm text-white/40 hover:text-white transition-colors">
          Logout
        </button>
      </nav>
      <div className="max-w-6xl mx-auto px-6 py-8">
        <Outlet />
      </div>
    </div>
  );
}
