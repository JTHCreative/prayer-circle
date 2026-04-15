import { useEffect, useRef, useState } from 'react';
import {
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  updateDoc
} from 'firebase/firestore';
import { db } from '../firebase.js';
import { useAuth } from '../context/AuthContext.jsx';
import { BellIcon } from './icons.jsx';

export default function NotificationsMenu() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!user?.uid) return;
    const q = query(
      collection(db, 'users', user.uid, 'notifications'),
      orderBy('createdAt', 'desc'),
      limit(20)
    );
    const unsub = onSnapshot(q, (snap) => {
      const rows = [];
      snap.forEach((d) => rows.push({ id: d.id, ...d.data() }));
      setItems(rows);
    });
    return unsub;
  }, [user?.uid]);

  useEffect(() => {
    function onDocClick(e) {
      if (!rootRef.current?.contains(e.target)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const unreadCount = items.filter((n) => !n.read).length;

  async function markRead(n) {
    if (!user?.uid || n.read) return;
    await updateDoc(doc(db, 'users', user.uid, 'notifications', n.id), {
      read: true
    });
  }

  async function dismiss(n) {
    if (!user?.uid) return;
    await deleteDoc(doc(db, 'users', user.uid, 'notifications', n.id));
  }

  async function markAllRead() {
    if (!user?.uid) return;
    await Promise.all(
      items
        .filter((n) => !n.read)
        .map((n) =>
          updateDoc(doc(db, 'users', user.uid, 'notifications', n.id), {
            read: true
          })
        )
    );
  }

  return (
    <div className="notifications" ref={rootRef}>
      <button
        type="button"
        className="bell-btn"
        onClick={() => setOpen((o) => !o)}
        aria-label={`Notifications${unreadCount ? ` (${unreadCount} unread)` : ''}`}
      >
        <BellIcon size={18} />
        {unreadCount > 0 && (
          <span className="bell-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
        )}
      </button>
      {open && (
        <div className="bell-dropdown" role="menu">
          <div className="bell-dropdown-head">
            <span>Notifications</span>
            {unreadCount > 0 && (
              <button
                type="button"
                className="bell-mark-all"
                onClick={markAllRead}
              >
                Mark all read
              </button>
            )}
          </div>
          {items.length === 0 ? (
            <p className="bell-empty">You&rsquo;re all caught up.</p>
          ) : (
            <ul className="bell-list">
              {items.map((n) => (
                <li
                  key={n.id}
                  className={n.read ? 'bell-item' : 'bell-item unread'}
                >
                  <div className="bell-item-body">
                    <strong>{n.title || 'Notification'}</strong>
                    {n.body && <p>{n.body}</p>}
                    {n.createdAt?.toDate && (
                      <span className="muted">
                        {formatRelative(n.createdAt.toDate())}
                      </span>
                    )}
                  </div>
                  <div className="bell-item-actions">
                    {!n.read && (
                      <button
                        type="button"
                        className="bell-mini-btn"
                        onClick={() => markRead(n)}
                        title="Mark as read"
                      >
                        ✓
                      </button>
                    )}
                    <button
                      type="button"
                      className="bell-mini-btn"
                      onClick={() => dismiss(n)}
                      title="Dismiss"
                    >
                      ×
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function formatRelative(date) {
  const s = Math.floor((Date.now() - date.getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
  return date.toLocaleDateString();
}
