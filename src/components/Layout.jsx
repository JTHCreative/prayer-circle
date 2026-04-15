import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export default function Layout() {
  const { profile, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

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
          <span className="muted">{profile?.displayName}</span>
          <button onClick={handleLogout}>Log out</button>
        </div>
      </header>
      <main className="container">
        <Outlet />
      </main>
    </div>
  );
}
