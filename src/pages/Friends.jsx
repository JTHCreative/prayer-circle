import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { chunk } from '../utils/arrays.js';
import { sendCircleInviteNotification } from '../utils/notifications.js';

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
// Extra empty rows padded above and below the friends grid so the window
// can be dragged / scrolled up and down into blank lattice space.
const GRID_PAD_ROWS = 8;

export default function Friends() {
  const { user, profile, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [friends, setFriends] = useState([]);
  const [incoming, setIncoming] = useState([]);
  const [outgoing, setOutgoing] = useState([]);
  const [status, setStatus] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [requestsOpen, setRequestsOpen] = useState(false);
  const [selectedFriend, setSelectedFriend] = useState(null);
  const scrollRef = useRef(null);

  useEffect(() => {
    loadFriendshipData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  // Click-and-drag vertical panning. Any pointerdown on the scroll area
  // that isn't on an interactive element (a friend circle, + button, etc.)
  // starts a grab, and pointermoves translate into scrollTop updates.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let dragging = false;
    let startY = 0;
    let startScrollTop = 0;
    let startX = 0;
    let pointerId = null;

    function onDown(e) {
      if (e.target.closest('button, a, input, .friends-network-node')) return;
      dragging = true;
      startY = e.clientY;
      startX = e.clientX;
      startScrollTop = el.scrollTop;
      pointerId = e.pointerId;
      el.classList.add('is-grabbing');
    }
    function onMove(e) {
      if (!dragging) return;
      const dy = e.clientY - startY;
      const dx = e.clientX - startX;
      // Only hijack once the gesture clearly becomes a drag so short
      // clicks (on empty lattice cells that bubble up) still feel snappy.
      if (Math.abs(dy) + Math.abs(dx) < 4) return;
      el.scrollTop = startScrollTop - dy;
      if (pointerId != null) {
        try {
          el.setPointerCapture(pointerId);
        } catch {
          /* ignore */
        }
      }
    }
    function onUp(e) {
      dragging = false;
      el.classList.remove('is-grabbing');
      if (pointerId != null) {
        try {
          el.releasePointerCapture(pointerId);
        } catch {
          /* ignore */
        }
        pointerId = null;
      }
    }
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
    };
  }, []);

  // Center the scroll position so users see the friends grid on load and
  // can drag in either direction from there.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = Math.max(0, (el.scrollHeight - el.clientHeight) / 2);
  }, [friends.length]);

  async function loadFriendshipData() {
    if (!user) return;
    const [friendList, { inc, out }] = await Promise.all([
      fetchFriendProfiles(profile?.friendIds || []),
      fetchPendingRequests(user.uid)
    ]);
    setFriends(friendList);
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
    } catch (err) {
      // Non-fatal — the notification may have already been dismissed —
      // but surface it so misconfigured rules don't fail silently.
      console.warn('Failed to clear friend-request notification', err);
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

  const { cells, rows, innerRows } = useMemo(() => {
    const rowCount = Math.max(
      GRID_MIN_ROWS,
      Math.ceil(friends.length / GRID_COLS) || GRID_MIN_ROWS
    );
    const total = rowCount * GRID_COLS;
    const list = Array.from({ length: total }, (_, i) => friends[i] || null);
    // Pad the scrollable inner area with extra empty lattice rows above
    // and below the grid so it can be dragged further than the content.
    return { cells: list, rows: rowCount, innerRows: rowCount + GRID_PAD_ROWS * 2 };
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
                        {r.other?.username && (
                          <small className="muted"> · @{r.other.username}</small>
                        )}
                      </strong>
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

        <div className="friends-network-scroll" ref={scrollRef}>
          <div
            className="friends-network-inner"
            style={{ '--inner-rows': innerRows }}
          >
            <div className="friends-network-lines" aria-hidden="true" />
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
                      <FriendNode user={u} onSelect={() => setSelectedFriend(u)} />
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

      {selectedFriend && (
        <FriendProfileModal
          friend={selectedFriend}
          onClose={() => setSelectedFriend(null)}
          onSendPrayer={() => {
            navigate(`/new?visibility=friend&to=${selectedFriend.id}`);
            setSelectedFriend(null);
          }}
          onRemove={async () => {
            await removeFriend(selectedFriend.id);
            setSelectedFriend(null);
          }}
        />
      )}
    </div>
  );
}

function FriendNode({ user, onSelect }) {
  const name =
    user.displayName ||
    [user.firstName, user.lastName].filter(Boolean).join(' ');
  const bio = user.bio || '';
  return (
    <div
      className="friends-network-node"
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      <div className="friends-network-circle">
        <Avatar user={user} size={60} />
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

function FriendProfileModal({ friend, onClose, onSendPrayer, onRemove }) {
  const [invitingToCircle, setInvitingToCircle] = useState(false);
  const name =
    friend.displayName ||
    [friend.firstName, friend.lastName].filter(Boolean).join(' ');

  return (
    <div className="overlay" onClick={onClose}>
      <div
        className="overlay-card friend-profile-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="overlay-close"
          onClick={onClose}
          aria-label="Close"
        >
          ×
        </button>
        <div className="friend-profile-head">
          <Avatar user={friend} size={96} />
          <div className="friend-profile-id">
            {name && <h2>{name}</h2>}
            {friend.username && (
              <p className="muted">@{friend.username}</p>
            )}
            {friend.location && (
              <p className="muted">📍 {friend.location}</p>
            )}
          </div>
        </div>
        {friend.bio && <p className="friend-profile-bio">{friend.bio}</p>}
        <div className="friend-profile-actions">
          <button type="button" onClick={onSendPrayer}>
            Send prayer request
          </button>
          <button type="button" onClick={() => setInvitingToCircle(true)}>
            Invite to circle
          </button>
          <button type="button" className="danger" onClick={onRemove}>
            Remove friend
          </button>
        </div>

        {invitingToCircle && (
          <InviteToCircleModal
            friend={friend}
            onClose={() => setInvitingToCircle(false)}
          />
        )}
      </div>
    </div>
  );
}

function InviteToCircleModal({ friend, onClose }) {
  const { user, profile } = useAuth();
  const [circles, setCircles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [invitedIds, setInvitedIds] = useState(new Set());

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const all = await fetchCirclesByIds(profile?.circleIds || []);
      const eligible = all
        .filter((c) => !(c.members || []).includes(friend.id))
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      if (!cancelled) {
        setCircles(eligible);
        setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [profile, friend.id]);

  async function invite(circle) {
    if (invitedIds.has(circle.id)) return;
    await sendCircleInviteNotification({
      toUserId: friend.id,
      circle,
      inviter: {
        uid: user.uid,
        username: profile?.username,
        displayName: profile?.displayName
      }
    });
    setInvitedIds((prev) => {
      const next = new Set(prev);
      next.add(circle.id);
      return next;
    });
  }

  const firstName = friend.firstName || friend.displayName || 'your friend';

  return (
    <div
      className="overlay"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <div className="overlay-card" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="overlay-close"
          onClick={onClose}
          aria-label="Close"
        >
          ×
        </button>
        <h2>Invite {firstName} to a circle</h2>
        <p className="muted">Pick one of your prayer circles.</p>
        {loading ? (
          <p className="muted">Loading circles…</p>
        ) : circles.length === 0 ? (
          <p className="muted">
            No eligible circles — {firstName} is already in all of yours, or
            you haven&rsquo;t joined any circles yet.
          </p>
        ) : (
          <ul className="invite-friends">
            {circles.map((c) => {
              const sent = invitedIds.has(c.id);
              return (
                <li key={c.id}>
                  <span className="person">
                    <span>
                      <strong>{c.name}</strong>
                      <small className="muted">
                        {' '}
                        · {(c.members || []).length}{' '}
                        {(c.members || []).length === 1 ? 'member' : 'members'}
                      </small>
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => invite(c)}
                    disabled={sent}
                  >
                    {sent ? 'Invited ✓' : 'Invite'}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
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

// Batch-fetch user profiles for a list of uids. Firestore caps
// `in` queries at 10, so we chunk and run the batches in parallel.
async function fetchUserProfiles(uids) {
  if (!uids?.length) return [];
  const snaps = await Promise.all(
    chunk(uids, 10).map((part) =>
      getDocs(query(collection(db, 'users'), where(documentId(), 'in', part)))
    )
  );
  const out = [];
  snaps.forEach((snap) => snap.forEach((d) => out.push({ id: d.id, ...d.data() })));
  return out;
}

async function fetchFriendProfiles(friendIds) {
  return fetchUserProfiles(friendIds);
}

async function fetchCirclesByIds(circleIds) {
  if (!circleIds?.length) return [];
  const snaps = await Promise.all(
    chunk(circleIds, 10).map((part) =>
      getDocs(query(collection(db, 'circles'), where(documentId(), 'in', part)))
    )
  );
  const out = [];
  snaps.forEach((snap) => snap.forEach((d) => out.push({ id: d.id, ...d.data() })));
  return out;
}

// Load pending friendships involving me and hydrate each with the other
// party's profile in a single batched call, avoiding the N+1 getDoc loop.
async function fetchPendingRequests(uid) {
  const snap = await getDocs(
    query(collection(db, 'friendships'), where('users', 'array-contains', uid))
  );
  const pending = [];
  snap.forEach((d) => {
    const data = d.data();
    if (data.status !== 'pending') return;
    const other = data.users.find((u) => u !== uid);
    pending.push({ id: d.id, other, requestedByMe: data.requestedBy === uid });
  });
  const profiles = await fetchUserProfiles(pending.map((p) => p.other));
  const byId = new Map(profiles.map((p) => [p.id, p]));
  const inc = [];
  const out = [];
  for (const p of pending) {
    const entry = { id: p.id, other: byId.get(p.other) || null };
    (p.requestedByMe ? out : inc).push(entry);
  }
  return { inc, out };
}

