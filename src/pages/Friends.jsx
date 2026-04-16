import { useEffect, useState } from 'react';
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
    // Load current friend profiles
    if (profile?.friendIds?.length) {
      const parts = chunk(profile.friendIds, 10);
      const all = [];
      for (const p of parts) {
        const snap = await getDocs(query(collection(db, 'users'), where(documentId(), 'in', p)));
        snap.forEach((d) => all.push({ id: d.id, ...d.data() }));
      }
      setFriends(all);
    } else {
      setFriends([]);
    }

    // Load pending friendships involving me.
    const snap = await getDocs(
      query(collection(db, 'friendships'), where('users', 'array-contains', user.uid))
    );
    const inc = [];
    const out = [];
    for (const d of snap.docs) {
      const data = d.data();
      if (data.status !== 'pending') continue;
      if (data.requestedBy === user.uid) {
        const other = data.users.find((u) => u !== user.uid);
        const userSnap = await getDoc(doc(db, 'users', other));
        out.push({ id: d.id, other: userSnap.exists() ? { id: userSnap.id, ...userSnap.data() } : null });
      } else {
        const other = data.users.find((u) => u !== user.uid);
        const userSnap = await getDoc(doc(db, 'users', other));
        inc.push({ id: d.id, other: userSnap.exists() ? { id: userSnap.id, ...userSnap.data() } : null });
      }
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

  return (
    <div className="stack">
      <div className="card">
        <h2>Find friends</h2>
        <form onSubmit={handleSearch} className="inline-form">
          <input
            placeholder="Search by display name"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <button type="submit">Search</button>
        </form>
        {status && <p className="muted">{status}</p>}
        {searchResults.length > 0 && (
          <ul className="list">
            {searchResults.map((u) => {
              const isFriend = profile?.friendIds?.includes(u.id);
              const pending =
                outgoing.some((o) => o.other?.id === u.id) ||
                incoming.some((i) => i.other?.id === u.id);
              return (
                <li key={u.id} className="list-row">
                  <span className="person">
                    <Avatar user={u} size={32} />
                    <span>
                      {u.displayName}
                      {u.username && <small className="muted"> · @{u.username}</small>}
                      {u.location && <small className="muted"> · 📍 {u.location}</small>}
                    </span>
                  </span>
                  {isFriend ? (
                    <span className="pill">Friends</span>
                  ) : pending ? (
                    <span className="pill">Pending</span>
                  ) : (
                    <button onClick={() => sendRequest(u)}>Add</button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {incoming.length > 0 && (
        <div className="card">
          <h2>Incoming requests</h2>
          <ul className="list">
            {incoming.map((r) => (
              <li key={r.id} className="list-row">
                <span>{r.other?.displayName || 'Unknown user'}</span>
                <span>
                  <button onClick={() => acceptRequest(r.id, r.other.id)}>Accept</button>{' '}
                  <button className="danger" onClick={() => declineOrCancel(r.id)}>Decline</button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {outgoing.length > 0 && (
        <div className="card">
          <h2>Sent requests</h2>
          <ul className="list">
            {outgoing.map((r) => (
              <li key={r.id} className="list-row">
                <span>{r.other?.displayName || 'Unknown user'}</span>
                <button onClick={() => declineOrCancel(r.id)}>Cancel</button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="card">
        <h2>Your friends</h2>
        {friends.length === 0 && (
          <p className="muted">You haven't added any friends yet. Search above to find people you know.</p>
        )}
        <div className="friends-grid">
          {friends.map((f) => (
            <div key={f.id} className="friends-grid-item">
              <button
                type="button"
                className="friends-grid-avatar"
                title={f.displayName}
                aria-label={`Remove ${f.displayName}`}
                onClick={() => removeFriend(f.id)}
              >
                <Avatar user={f} size={72} />
                <span className="friends-grid-remove" aria-hidden="true">×</span>
              </button>
              <span className="friends-grid-name">{f.displayName}</span>
              {f.username && <span className="friends-grid-handle">@{f.username}</span>}
            </div>
          ))}
          {Array.from({ length: Math.max(0, 8 - friends.length) }).map((_, i) => (
            <div key={`empty-${i}`} className="friends-grid-item friends-grid-item-empty" aria-hidden="true">
              <div className="friends-grid-avatar friends-grid-avatar-empty" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
