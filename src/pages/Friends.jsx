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

// Notifications written to the target user's subcollection use a stable id
// per sender so a second request doesn't create a duplicate entry.
function friendRequestNotifId(fromUid) {
  return `friend_request_${fromUid}`;
}

// The interactive window draws a lattice of profile circles at fixed columns.
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
  const [addOpen, setAddOpen] = useState(false);
  const [requestsOpen, setRequestsOpen] = useState(false);

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
      throw new Error('A friendship or request already exists with this user.');
    }
    await setDoc(ref, {
      users: [user.uid, otherUser.id],
      requestedBy: user.uid,
      status: 'pending',
      createdAt: serverTimestamp()
    });
    await setDoc(
      doc(
        db,
        'users',
        otherUser.id,
        'notifications',
        friendRequestNotifId(user.uid)
      ),
      {
        type: 'friend_request',
        title: 'Friend request',
        body: `${profile?.displayName || 'Someone'} wants to connect with you.`,
        fromUserId: user.uid,
        fromUsername: profile?.username || '',
        fromName: profile?.displayName || '',
        read: false,
        createdAt: serverTimestamp()
      }
    );
    loadFriendshipData();
  }

  async function sendRequestFromSearch(otherUser) {
    try {
      await sendRequest(otherUser);
      setStatus(`Friend request sent to ${otherUser.displayName}.`);
    } catch (err) {
      setStatus(err.message);
    }
  }

  async function sendRequestByUsername(rawUsername) {
    const cleanUsername = (rawUsername || '').trim().toLowerCase();
    if (!cleanUsername) throw new Error('Enter a username.');
    const unameSnap = await getDoc(doc(db, 'usernames', cleanUsername));
    if (!unameSnap.exists()) throw new Error('No user with that username.');
    const otherId = unameSnap.data().uid;
    if (otherId === user.uid) throw new Error("You can't friend yourself.");
    if (profile?.friendIds?.includes(otherId)) {
      throw new Error('You are already friends.');
    }
    const userSnap = await getDoc(doc(db, 'users', otherId));
    if (!userSnap.exists()) throw new Error('User not found.');
    await sendRequest({ id: otherId, ...userSnap.data() });
  }

  async function acceptRequest(friendshipDocId, otherId) {
    const ref = doc(db, 'friendships', friendshipDocId);
    await updateDoc(ref, { status: 'accepted', acceptedAt: serverTimestamp() });
    await updateDoc(doc(db, 'users', user.uid), { friendIds: arrayUnion(otherId) });
    await updateDoc(doc(db, 'users', otherId), { friendIds: arrayUnion(user.uid) });
    await clearFriendRequestNotif(otherId);
    await refreshProfile();
    loadFriendshipData();
  }

  async function declineOrCancel(friendshipDocId, otherId) {
    await deleteDoc(doc(db, 'friendships', friendshipDocId));
    // Remove the notification so the target's bell/badge clears too.
    if (otherId) await clearFriendRequestNotif(otherId);
    loadFriendshipData();
  }

  async function clearFriendRequestNotif(otherId) {
    // I'm the recipient: notification lives under my own user doc, keyed
    // by the sender's uid. When I'm the sender and the recipient cancels,
    // we don't touch their notifications here.
    try {
      await deleteDoc(
        doc(db, 'users', user.uid, 'notifications', friendRequestNotifId(otherId))
      );
    } catch {
      /* ignore — notification may have already been dismissed */
    }
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
            see a profile, or tap an empty slot to invite someone new.
          </p>
        </div>
      </div>

      <div className="friends-network">
        <div className="friends-network-lines" aria-hidden="true" />

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
                      <button
                        type="button"
                        onClick={() => sendRequestFromSearch(u)}
                      >
                        Add
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="friends-network-requests">
          <button
            type="button"
            className="friends-network-requests-btn"
            onClick={() => setRequestsOpen((o) => !o)}
            aria-expanded={requestsOpen}
          >
            Requests
            {incoming.length > 0 && (
              <span className="friends-network-requests-badge">
                {incoming.length}
              </span>
            )}
          </button>
          {requestsOpen && (
            <div className="friends-network-requests-panel">
              {incoming.length === 0 ? (
                <p className="muted">No incoming requests.</p>
              ) : (
                incoming.map((r) => (
                  <div key={r.id} className="friends-request-card">
                    <Avatar user={r.other} size={44} />
                    <div className="friends-request-card-id">
                      <strong>
                        {r.other?.firstName} {r.other?.lastName}
                      </strong>
                      {r.other?.username && (
                        <span className="muted">@{r.other.username}</span>
                      )}
                    </div>
                    <div className="friends-request-card-actions">
                      <button
                        type="button"
                        onClick={() => acceptRequest(r.id, r.other.id)}
                      >
                        Accept
                      </button>
                      <button
                        type="button"
                        className="danger"
                        onClick={() => declineOrCancel(r.id, r.other?.id)}
                      >
                        Decline
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        <div
          className="friends-network-grid"
          style={{ '--cols': GRID_COLS, '--rows': rows }}
        >
          {cells.map((u, i) => {
            const row = Math.floor(i / GRID_COLS);
            const classes = ['friends-network-cell'];
            if (row === 0) classes.push('is-first-row');
            return (
              <div key={i} className={classes.join(' ')}>
                {u ? (
                  <FriendNode user={u} onRemove={() => removeFriend(u.id)} />
                ) : (
                  <button
                    type="button"
                    className="friends-network-circle friends-network-circle-empty"
                    onClick={() => setAddOpen(true)}
                    aria-label="Add a friend"
                    title="Add a friend"
                  >
                    <PlusIcon />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

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
                <button onClick={() => declineOrCancel(r.id, r.other?.id)}>
                  Cancel
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {addOpen && (
        <AddFriendModal
          onClose={() => setAddOpen(false)}
          onSend={sendRequestByUsername}
        />
      )}
    </div>
  );
}

function FriendNode({ user, onRemove }) {
  const name =
    user.displayName ||
    [user.firstName, user.lastName].filter(Boolean).join(' ');
  const bio = user.bio || '';
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

function AddFriendModal({ onClose, onSend }) {
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError('');
    setSuccess('');
    setBusy(true);
    try {
      await onSend(username);
      setSuccess(`Friend request sent to @${username.trim().toLowerCase()}.`);
      setUsername('');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="overlay-card" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="overlay-close"
          onClick={onClose}
          aria-label="Close"
        >
          ×
        </button>
        <h2>Add a friend</h2>
        <p className="muted">Send a friend request by their username.</p>
        <form onSubmit={submit}>
          <label>
            Username
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase())}
              pattern="[a-z0-9_]{3,20}"
              title="3-20 characters: lowercase letters, numbers, underscores"
              placeholder="e.g. prayerful_soul"
              required
              autoFocus
            />
          </label>
          {error && <p className="error">{error}</p>}
          {success && <p className="muted">{success}</p>}
          <div className="button-row">
            <button type="button" onClick={onClose}>
              Close
            </button>
            <button type="submit" disabled={busy}>
              {busy ? 'Sending…' : 'Send request'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 5v14M5 12h14"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
