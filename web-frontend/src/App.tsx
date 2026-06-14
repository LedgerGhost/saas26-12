import { Routes, Route, NavLink, Navigate, useNavigate, useLocation } from 'react-router-dom';
import MapPage from './pages/MapPage';
import ReservationsPage from './pages/ReservationsPage';
import AllReservationsPage from './pages/AllReservationsPage';
import AnalyticsPage from './pages/AnalyticsPage';
import LoginPage from './pages/LoginPage';
import RegisterProviderPage from './pages/RegisterProviderPage';
import ProviderAnalyticsPage from './pages/ProviderAnalyticsPage';
import InvoicesPage from './pages/InvoicesPage';
import LogExportPage from './pages/LogExportPage';
import { useAuth } from './lib/auth';
import { Icon, type IconName } from './lib/Icon';
import { Wordmark } from './lib/charts';

type NavItem = { path: string; label: string; icon: IconName };

const NAV: Record<string, NavItem[]> = {
  ev_user: [
    { path: '/map',          label: 'Map',          icon: 'map' },
    { path: '/reservations', label: 'Reservations', icon: 'history' }
  ],
  provider: [
    { path: '/provider/dashboard', label: 'Dashboard', icon: 'chart' },
    { path: '/provider/invoices',  label: 'Invoices',  icon: 'doc' },
    { path: '/provider/logs',      label: 'Logs',      icon: 'download' },
    { path: '/provider/setup',     label: 'Account',   icon: 'settings' }
  ],
  operator: [
    { path: '/operator/global',       label: 'Global',       icon: 'globe' },
    { path: '/operator/reservations', label: 'Reservations', icon: 'history' },
    { path: '/operator/map',          label: 'Map',          icon: 'map' }
  ]
};

const HOME: Record<string, string> = {
  ev_user:  '/map',
  provider: '/provider/dashboard',
  operator: '/operator/global'
};

const ROLE_LABEL: Record<string, string> = {
  ev_user: 'EV Driver', provider: 'Provider', operator: 'Operator'
};

export default function App() {
  const { user, logout, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  if (loading) {
    return <div style={{ display: 'grid', placeItems: 'center', height: '100vh', color: 'var(--text-3)' }}>Loading…</div>;
  }

  if (!user) {
    return (
      <Routes>
        <Route path="*" element={<LoginPage />} />
      </Routes>
    );
  }

  const role = user.role || 'ev_user';
  const home = HOME[role] || '/map';
  const items = NAV[role] || [];

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      <div className="topbar">
        <Wordmark />
        <div style={{ height: 24, width: 1, background: 'var(--border)', margin: '0 4px' }} />
        <div className="nav">
          {items.map(it => (
            <NavLink
              key={it.path}
              to={it.path}
              className={({ isActive }) => (isActive ? 'active' : '')}
            >
              <Icon name={it.icon} size={14} />
              {it.label}
            </NavLink>
          ))}
        </div>

        <div className="spacer" />

        <div className="row" style={{ gap: 10 }}>
          <span className="badge badge-accent">{ROLE_LABEL[role]}</span>
          <span className="t-small muted" title={user.email}>{user.email}</span>
          <button className="btn btn-ghost btn-sm" title="Sign out"
            onClick={() => { logout(); navigate('/'); }}>
            <Icon name="logout" size={14} />
          </button>
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }} key={location.pathname}>
        <Routes>
          <Route path="/" element={<Navigate to={home} replace />} />

          {/* EV-user routes */}
          {role === 'ev_user' && <Route path="/map"          element={<MapPage />} />}
          {role === 'ev_user' && <Route path="/reservations" element={<ReservationsPage />} />}

          {/* Provider routes */}
          {role === 'provider' && <Route path="/provider/dashboard" element={<ProviderAnalyticsPage />} />}
          {role === 'provider' && <Route path="/provider/invoices"  element={<InvoicesPage />} />}
          {role === 'provider' && <Route path="/provider/logs"      element={<LogExportPage />} />}
          {role === 'provider' && <Route path="/provider/setup"     element={<RegisterProviderPage />} />}

          {/* Operator routes */}
          {role === 'operator' && <Route path="/operator/global"       element={<AnalyticsPage />} />}
          {role === 'operator' && <Route path="/operator/reservations" element={<AllReservationsPage />} />}
          {role === 'operator' && <Route path="/operator/map"          element={<MapPage />} />}

          <Route path="*" element={<Navigate to={home} replace />} />
        </Routes>
      </div>
    </div>
  );
}
