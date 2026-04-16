import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase.js';
import { useAuth } from '../context/AuthContext.jsx';
import Avatar from './Avatar.jsx';
import NotificationsMenu from './NotificationsMenu.jsx';
import { BookIcon, CircleVisibilityIcon, PublicIcon } from './icons.jsx';

function IconNewPrayer() {
  return (
    <svg className="nav-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export default function Layout() {
  const { user, profile, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const wide = location.pathname === '/';
  const circlesPage = location.pathname === '/circles';
  const friendsPage = location.pathname === '/friends';
  const [pendingRequests, setPendingRequests] = useState(0);

  // Counts pending requests I didn't initiate — drives the nav alert dot.
  useEffect(() => {
    if (!user?.uid) {
      setPendingRequests(0);
      return;
    }
    const q = query(
      collection(db, 'friendships'),
      where('users', 'array-contains', user.uid)
    );
    const unsub = onSnapshot(q, (snap) => {
      let count = 0;
      snap.forEach((d) => {
        const data = d.data();
        if (data.status === 'pending' && data.requestedBy !== user.uid) count += 1;
      });
      setPendingRequests(count);
    });
    return unsub;
  }, [user?.uid]);

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
          <NavLink to="/book" className="nav-btn">
            <BookIcon className="nav-icon" />
            <span>Prayer Book</span>
          </NavLink>
          <span className="nav-btn-wrap">
            <NavLink to="/friends" className="nav-btn">
              <PublicIcon className="nav-icon" />
              <span>Friends</span>
            </NavLink>
            {pendingRequests > 0 && (
              <span
                className="nav-alert-dot"
                aria-label={`${pendingRequests} pending friend request${pendingRequests === 1 ? '' : 's'}`}
              />
            )}
          </span>
          <NavLink to="/circles" className="nav-btn">
            <CircleVisibilityIcon className="nav-icon" />
            <span>Circles</span>
          </NavLink>
        </nav>
        <div className="topbar-right">
          <NotificationsMenu />
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
      <main
        className={
          wide
            ? 'container container-home'
            : circlesPage || friendsPage
            ? 'container container-wide'
            : 'container'
        }
      >
        <Outlet />
      </main>
    </div>
  );
}
