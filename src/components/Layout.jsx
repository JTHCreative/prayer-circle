import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import Avatar from './Avatar.jsx';

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
          <NavLink to="/" end>Feed</NavLink>
          <NavLink to="/new">New Prayer</NavLink>
          <NavLink to="/friends">Friends</NavLink>
          <NavLink to="/circles">Circles</NavLink>
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
      <main className={wide ? 'container container-wide' : 'container'}>
        <Outlet />
      </main>
    </div>
  );
}
