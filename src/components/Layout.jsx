import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import Avatar from './Avatar.jsx';

// Lightweight inline SVG icons (24x24, stroke-based — no dependencies)
function IconNewPrayer() {
  return (
    <svg className="nav-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function IconFriends() {
  return (
    <svg className="nav-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="9" cy="8" r="3.25" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M3.5 19c.7-2.8 3-4.5 5.5-4.5s4.8 1.7 5.5 4.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <circle cx="17" cy="9" r="2.5" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M15 14.5c2.2 0 4.3 1.3 5 3.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconCircles() {
  return (
    <svg className="nav-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="9" cy="12" r="5" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="15" cy="12" r="5" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

export default function Layout() {
  const { profile, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const wide = location.pathname === '/';

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  const name = profile?.displayName || [profile?.firstName, profile?.lastName].filter(Boolean).join(' ') || 'Account';

  return (
    <div className="app-shell">
      <header className="topbar">
        <Link to="/" className="brand">Prayer Circle</Link>
        <nav className="nav">
          <NavLink to="/new" className="nav-btn">
            <IconNewPrayer />
            <span>New Prayer</span>
          </NavLink>
          <NavLink to="/friends" className="nav-btn">
            <IconFriends />
            <span>Friends</span>
          </NavLink>
          <NavLink to="/circles" className="nav-btn">
            <IconCircles />
            <span>Circles</span>
          </NavLink>
        </nav>
        <div className="topbar-right">
          <Link to="/settings" className="profile-chip" title="Account settings">
            <Avatar user={profile} size={32} />
            <span className="profile-chip-text">
              <span className="profile-chip-name">{name}</span>
              {profile?.username && (
                <span className="profile-chip-handle">@{profile.username}</span>
              )}
            </span>
          </Link>
          <button onClick={handleLogout}>Log out</button>
        </div>
      </header>
      <main className={wide ? 'container container-home' : 'container'}>
        <Outlet />
      </main>
    </div>
  );
}
