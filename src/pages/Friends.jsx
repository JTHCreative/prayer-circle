import { useEffect, useMemo, useState } from 'react';
import {
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  documentId,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where
} from 'firebase/firestore';
import { db } from '../firebase.js';
import { useAuth } from '../context/AuthContext.jsx';
import Avatar from '../components/Avatar.jsx';

// Friendship doc id is the two uids sorted alphabetically joined by "_".
function friendshipId(a, b) {
  return [a, b].sort().join('_');
}

// The interactive window draws a lattice of profile circles at fixed columns
// so the horizontal + vertical connectors line up regardless of friend count.
const GRID_COLS = 6;
const GRID_MIN_ROWS = 4;

export default function Friends() {
  const { user, profile, refreshProfile } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [friends, setFriends] = useState([]);
  const [incoming, setIncoming] = useState([]);
  const [outgoing, setOutgoing] = useState([]);
  const [status, setStatus] = useState('');

  useEffect(() => {
    loadFriendshipData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  async function loadFriendshipData() {
    if (!user) return;
    if (profile?.friendIds?.length) {
      const parts = chunk(profile.friendIds, 10);
      const all = [];
      for (const p of parts) {
        const snap = await getDocs(
          query(collection(db, 'users'), where(documentId(), 'in', p))
        );
        snap.forEach((d) => all.push({ id: d.id, ...d.data() }));
      }
      setFriends(all);
    } else {
      setFriends([]);
    }

    const snap = await getDocs(
      query(collection(db, 'friendships'), where('users', 'array-contains', user.uid))
    );
    const inc = [];
    const out = [];
    for (const d of snap.docs) {
      const data = d.data();
      if (data.status !== 'pending') continue;
      const other = data.users.find((u) => u !== user.uid);
      const userSnap = await getDoc(doc(db, 'users', other));
      const entry = {
        id: d.id,
        other: userSnap.exists() ? { id: userSnap.id, ...userSnap.data() } : null
      };
      if (data.requestedBy === user.uid) out.push(entry);
      else inc.push(entry);
    }
    setIncoming(inc);
    setOutgoing(out);
  }

  async function handleSearch(e) {
    e.preventDefault();
    setStatus('');
    const term = searchTerm.trim().toLowerCase();
    if (term.length < 2) {
      setSearchResults([]);
      return;
    }
    const q = query(
      collection(db, 'users'),
      where('displayNameLower', '>=', term),
      where('displayNameLower', '<=', term + '\uf8ff')
    );
    const snap = await getDocs(q);
    const results = [];
    snap.forEach((d) => {
      if (d.id !== user.uid) results.push({ id: d.id, ...d.data() });
    });
    setSearchResults(results);
  }

  async function sendRequest(otherUser) {
    const id = friendshipId(user.uid, otherUser.id);
    const ref = doc(db, 'friendships', id);
    const existing = await getDoc(ref);
    if (existing.exists()) {
      setStatus('A friendship or request already exists with this user.');
      return;
    }
    await setDoc(ref, {
      users: [user.uid, otherUser.id],
      requestedBy: user.uid,
      status: 'pending',
      createdAt: serverTimestamp()
    });
    setStatus(`Friend request sent to ${otherUser.displayName}.`);
    loadFriendshipData();
  }

  async function acceptRequest(friendshipDocId, otherId) {
    const ref = doc(db, 'friendships', friendshipDocId);
    await updateDoc(ref, { status: 'accepted', acceptedAt: serverTimestamp() });
    await updateDoc(doc(db, 'users', user.uid), { friendIds: arrayUnion(otherId) });
    await updateDoc(doc(db, 'users', otherId), { friendIds: arrayUnion(user.uid) });
    await refreshProfile();
    loadFriendshipData();
  }

  async function declineOrCancel(friendshipDocId) {
    await deleteDoc(doc(db, 'friendships', friendshipDocId));
    loadFriendshipData();
  }

  async function removeFriend(otherId) {
    if (!confirm('Remove this friend?')) return;
    const id = friendshipId(user.uid, otherId);
    await deleteDoc(doc(db, 'friendships', id));
    await updateDoc(doc(db, 'users', user.uid), { friendIds: arrayRemove(otherId) });
    await updateDoc(doc(db, 'users', otherId), { friendIds: arrayRemove(user.uid) });
    await refreshProfile();
    loadFriendshipData();
  }

  function resetSearch() {
    setSearchTerm('');
    setSearchResults([]);
    setStatus('');
  }

  // Lay friends out on a fixed column grid, padding with empty slots so the
  // lattice always looks full even when the user only has a handful of friends.
  const { cells, rows } = useMemo(() => {
    const rowCount = Math.max(
      GRID_MIN_ROWS,
      Math.ceil(friends.length / GRID_COLS) || GRID_MIN_ROWS
    );
    const total = rowCount * GRID_COLS;
    const list = Array.from({ length: total }, (_, i) => friends[i] || null);
    return { cells: list, rows: rowCount };
  }, [friends]);

  return (
    <div className="circle-universe">
      <div className="circle-universe-header">
        <div>
          <h1>Friends</h1>
          <p className="muted">
            Your connected network of prayer companions. Hover a circle to
            see a profile, or search to find someone new.
          </p>
        </div>
      </div>

      <div className="friends-network">
        <div className="friends-network-search-wrap">
          <form onSubmit={handleSearch} className="friends-network-search">
            <input
              placeholder="Search people by name"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                if (!e.target.value.trim()) {
                  setSearchResults([]);
                  setStatus('');
                }
              }}
            />
            <button type="submit">Search</button>
            {(searchResults.length > 0 || status) && (
              <button
                type="button"
                className="friends-network-search-clear"
                onClick={resetSearch}
                aria-label="Clear search"
              >
                ×
              </button>
            )}
          </form>
          {status && (
            <p className="muted friends-network-search-status">{status}</p>
          )}
          {searchResults.length > 0 && (
            <div className="friends-network-search-results" role="listbox">
              {searchResults.map((u) => {
                const isFriend = profile?.friendIds?.includes(u.id);
                const pending =
                  outgoing.some((o) => o.other?.id === u.id) ||
                  incoming.some((i) => i.other?.id === u.id);
                return (
                  <div key={u.id} className="friends-network-search-row">
                    <span className="person">
                      <Avatar user={u} size={32} />
                      <span>
                        {u.displayName}
                        {u.username && (
                          <small className="muted"> · @{u.username}</small>
                        )}
                        {u.location && (
                          <small className="muted"> · 📍 {u.location}</small>
                        )}
                      </span>
                    </span>
                    {isFriend ? (
                      <span className="pill">Friends</span>
                    ) : pending ? (
                      <span className="pill">Pending</span>
                    ) : (
                      <button type="button" onClick={() => sendRequest(u)}>
                        Add
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div
          className="friends-network-grid"
          style={{ '--cols': GRID_COLS, '--rows': rows }}
        >
          {cells.map((u, i) => {
            const col = i % GRID_COLS;
            const row = Math.floor(i / GRID_COLS);
            const classes = ['friends-network-cell'];
            if (col === GRID_COLS - 1) classes.push('is-last-col');
            if (row === rows - 1) classes.push('is-last-row');
            if (row === 0) classes.push('is-first-row');
            return (
              <div key={i} className={classes.join(' ')}>
                {u ? (
                  <FriendNode user={u} onRemove={() => removeFriend(u.id)} />
                ) : (
                  <div
                    className="friends-network-circle friends-network-circle-empty"
                    aria-hidden="true"
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {incoming.length > 0 && (
        <div className="circle-detail-panel">
          <div className="circle-detail-header">
            <div>
              <h2>Incoming requests</h2>
              <p className="muted">People who'd like to pray alongside you.</p>
            </div>
          </div>
          <ul className="list">
            {incoming.map((r) => (
              <li key={r.id} className="list-row">
                <span className="person">
                  {r.other && <Avatar user={r.other} size={32} />}
                  <span>{r.other?.displayName || 'Unknown user'}</span>
                </span>
                <span>
                  <button onClick={() => acceptRequest(r.id, r.other.id)}>
                    Accept
                  </button>{' '}
                  <button
                    className="danger"
                    onClick={() => declineOrCancel(r.id)}
                  >
                    Decline
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {outgoing.length > 0 && (
        <div className="circle-detail-panel">
          <div className="circle-detail-header">
            <div>
              <h2>Sent requests</h2>
              <p className="muted">Waiting for a response.</p>
            </div>
          </div>
          <ul className="list">
            {outgoing.map((r) => (
              <li key={r.id} className="list-row">
                <span className="person">
                  {r.other && <Avatar user={r.other} size={32} />}
                  <span>{r.other?.displayName || 'Unknown user'}</span>
                </span>
                <button onClick={() => declineOrCancel(r.id)}>Cancel</button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function FriendNode({ user, onRemove }) {
  const name =
    user.displayName ||
    [user.firstName, user.lastName].filter(Boolean).join(' ');
  const bio = user.bio || user.description || '';
  return (
    <div className="friends-network-node" tabIndex={0}>
      <div className="friends-network-circle">
        <Avatar user={user} size={56} />
      </div>
      <div className="friends-network-card" role="tooltip">
        <div className="friends-network-card-head">
          <Avatar user={user} size={56} />
          <div className="friends-network-card-id">
            {name && <strong>{name}</strong>}
            {user.username && <span className="muted">@{user.username}</span>}
          </div>
        </div>
        {bio && <p className="friends-network-card-bio">{bio}</p>}
        {user.location && (
          <p className="friends-network-card-meta">📍 {user.location}</p>
        )}
        <button
          type="button"
          className="danger friends-network-card-remove"
          onClick={onRemove}
        >
          Remove friend
        </button>
      </div>
    </div>
  );
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
