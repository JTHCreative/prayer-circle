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
const GRID_MIN_ROWS = 10;
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
  const [acceptedAtMap, setAcceptedAtMap] = useState({});
  const [myCircles, setMyCircles] = useState([]);
  const [sortMode, setSortMode] = useState('recent');
  const [sortDir, setSortDir] = useState('desc');
  const [dragUid, setDragUid] = useState(null);
  const [dragOverIdx, setDragOverIdx] = useState(null);
  const [highlightUid, setHighlightUid] = useState(null);
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
    const [friendList, { inc, out, acceptedAt }, circleList] = await Promise.all([
      fetchFriendProfiles(profile?.friendIds || []),
      fetchAllFriendships(user.uid),
      fetchCirclesByIds(profile?.circleIds || [])
    ]);
    setFriends(friendList);
    setIncoming(inc);
    setOutgoing(out);
    setAcceptedAtMap(acceptedAt);
    setMyCircles(circleList);
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

  // Scroll the friend's circle to the vertical center of the network window
  // and pulse it briefly so the search → grid jump is easy to follow.
  function scrollToFriend(uid) {
    const scroll = scrollRef.current;
    if (!scroll) return;
    const cell = scroll.querySelector(
      `[data-friend-uid="${CSS.escape(uid)}"]`
    );
    if (!cell) return;
    const scrollRect = scroll.getBoundingClientRect();
    const cellRect = cell.getBoundingClientRect();
    const delta =
      cellRect.top - scrollRect.top - (scrollRect.height - cellRect.height) / 2;
    scroll.scrollTo({ top: scroll.scrollTop + delta, behavior: 'smooth' });
    setHighlightUid(uid);
    setTimeout(() => {
      setHighlightUid((curr) => (curr === uid ? null : curr));
    }, 1600);
  }

  const sortedFriends = useMemo(() => {
    const list = [...friends];
    // Returns a comparable key for the chosen sort mode. Friends without
    // a value sort last via the high-codepoint sentinel / -Infinity.
    function keyOf(u) {
      if (sortMode === 'recent') {
        const v = acceptedAtMap[u.id];
        if (!v) return -Infinity;
        if (typeof v.seconds === 'number') return v.seconds;
        if (typeof v.toMillis === 'function') return v.toMillis();
        return 0;
      }
      if (sortMode === 'alphabetical') {
        return (u.displayName || u.firstName || '\uffff').toLowerCase();
      }
      if (sortMode === 'location') {
        return (u.location || '\uffff').toLowerCase();
      }
      if (sortMode === 'circle') {
        const shared = (u.circleIds || []).filter((id) =>
          profile?.circleIds?.includes(id)
        );
        const names = shared
          .map((id) => myCircles.find((c) => c.id === id)?.name || '')
          .filter(Boolean)
          .map((n) => n.toLowerCase())
          .sort();
        return names[0] || '\uffff';
      }
      return 0;
    }
    list.sort((a, b) => {
      const ka = keyOf(a);
      const kb = keyOf(b);
      if (ka < kb) return -1;
      if (ka > kb) return 1;
      return (a.displayName || '').localeCompare(b.displayName || '');
    });
    if (sortDir === 'desc') list.reverse();
    return list;
  }, [friends, sortMode, sortDir, acceptedAtMap, myCircles, profile?.circleIds]);

  // Map uid -> grid index. In custom mode we honor the saved friendOrder
  // and pack unmapped friends into the leftover slots; in all other modes
  // we fill left-to-right in the sorted order.
  const positions = useMemo(() => {
    const map = new Map();
    if (sortMode === 'custom') {
      const saved = profile?.friendOrder || {};
      const used = new Set();
      const unplaced = [];
      for (const f of sortedFriends) {
        const pos = saved[f.id];
        if (typeof pos === 'number' && !used.has(pos)) {
          map.set(f.id, pos);
          used.add(pos);
        } else {
          unplaced.push(f);
        }
      }
      let slot = 0;
      for (const f of unplaced) {
        while (used.has(slot)) slot += 1;
        map.set(f.id, slot);
        used.add(slot);
        slot += 1;
      }
    } else {
      sortedFriends.forEach((f, i) => map.set(f.id, i));
    }
    return map;
  }, [sortMode, sortedFriends, profile?.friendOrder]);

  const { cells, rows, innerRows } = useMemo(() => {
    let maxIdx = -1;
    positions.forEach((i) => {
      if (i > maxIdx) maxIdx = i;
    });
    const rowCount = Math.max(
      GRID_MIN_ROWS,
      Math.ceil((maxIdx + 1) / GRID_COLS) || GRID_MIN_ROWS
    );
    const total = rowCount * GRID_COLS;
    const byId = new Map(friends.map((f) => [f.id, f]));
    const list = Array.from({ length: total }, () => null);
    positions.forEach((idx, uid) => {
      if (idx < total) list[idx] = byId.get(uid) || null;
    });
    return { cells: list, rows: rowCount, innerRows: rowCount + GRID_PAD_ROWS * 2 };
  }, [friends, positions]);

  // Drag a friend circle onto another cell. If the target has a friend,
  // swap; otherwise move. Either way we switch into 'custom' mode and
  // persist the resulting position map to the user doc.
  async function handleDropOnCell(targetIdx, draggedUid) {
    const nextOrder = {};
    cells.forEach((u, i) => {
      if (u) nextOrder[u.id] = i;
    });
    const sourceIdx = nextOrder[draggedUid];
    if (sourceIdx === undefined || sourceIdx === targetIdx) return;
    const targetUser = cells[targetIdx];
    if (targetUser) {
      nextOrder[targetUser.id] = sourceIdx;
    } else {
      delete nextOrder[draggedUid];
    }
    nextOrder[draggedUid] = targetIdx;
    await updateDoc(doc(db, 'users', user.uid), { friendOrder: nextOrder });
    setSortMode('custom');
    await refreshProfile();
  }

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
                    {isFriend ? (
                      <button
                        type="button"
                        className="person friends-network-search-person-btn"
                        onClick={() => scrollToFriend(u.id)}
                        title="Find on grid"
                      >
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
                      </button>
                    ) : (
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
                    )}
                    {isFriend ? null : pending ? (
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

        <div className="friends-network-sort">
          <SortPicker
            value={sortMode}
            onChange={setSortMode}
            sortDir={sortDir}
            onToggleDir={() =>
              setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
            }
            dirDisabled={sortMode === 'custom'}
          />
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
                        className="friends-request-action-btn"
                        onClick={() => acceptRequest(r.id, r.other.id)}
                        aria-label="Accept"
                      >
                        <ThumbsUpIcon />
                      </button>
                      <button
                        type="button"
                        className="friends-request-action-btn danger"
                        onClick={() => declineOrCancel(r.id, r.other?.id)}
                        aria-label="Decline"
                      >
                        <XIcon />
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
                if (dragOverIdx === i && dragUid && (!u || u.id !== dragUid)) {
                  classes.push('is-drop-target');
                }
                const onDragOver = (e) => {
                  if (!dragUid) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  if (dragOverIdx !== i) setDragOverIdx(i);
                };
                const onDragLeave = () => {
                  if (dragOverIdx === i) setDragOverIdx(null);
                };
                const onDrop = (e) => {
                  e.preventDefault();
                  const uid =
                    e.dataTransfer.getData('text/friend-uid') || dragUid;
                  setDragOverIdx(null);
                  setDragUid(null);
                  if (uid) handleDropOnCell(i, uid);
                };
                return (
                  <div
                    key={i}
                    className={classes.join(' ')}
                    data-friend-uid={u?.id}
                    onDragOver={onDragOver}
                    onDragLeave={onDragLeave}
                    onDrop={onDrop}
                  >
                    {u ? (
                      <FriendNode
                        user={u}
                        onSelect={() => setSelectedFriend(u)}
                        isDragging={dragUid === u.id}
                        isHighlighted={highlightUid === u.id}
                        onDragStart={() => setDragUid(u.id)}
                        onDragEnd={() => {
                          setDragUid(null);
                          setDragOverIdx(null);
                        }}
                      />
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
              <h2>Sent Requests</h2>
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

function FriendNode({
  user,
  onSelect,
  isDragging,
  isHighlighted,
  onDragStart,
  onDragEnd
}) {
  const name =
    user.displayName ||
    [user.firstName, user.lastName].filter(Boolean).join(' ');
  const bio = user.bio || '';
  const classes = ['friends-network-node'];
  if (isDragging) classes.push('is-dragging');
  if (isHighlighted) classes.push('is-highlighted');

  // Browsers default to using the <img> child as the drag image, which
  // renders as a cropped square and loses the gradient-bordered circle
  // styling. We clone the styled circle element, park it offscreen, set
  // it as the drag image, then tidy it up on the next frame.
  function installDragImage(e) {
    const circle = e.currentTarget.querySelector('.friends-network-circle');
    if (!circle) return;
    const clone = circle.cloneNode(true);
    const rect = circle.getBoundingClientRect();
    clone.style.position = 'fixed';
    clone.style.top = '-1000px';
    clone.style.left = '-1000px';
    clone.style.width = `${rect.width}px`;
    clone.style.height = `${rect.height}px`;
    clone.style.pointerEvents = 'none';
    document.body.appendChild(clone);
    const offsetX = e.clientX - rect.left;
    const offsetY = e.clientY - rect.top;
    e.dataTransfer.setDragImage(clone, offsetX, offsetY);
    setTimeout(() => clone.remove(), 0);
  }

  return (
    <div
      className={classes.join(' ')}
      role="button"
      tabIndex={0}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/friend-uid', user.id);
        installDragImage(e);
        onDragStart?.();
      }}
      onDragEnd={() => onDragEnd?.()}
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
        <h2>Add a Friend</h2>
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
              {busy ? 'Sending…' : 'Send Request'}
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
            Send Prayer Request
          </button>
          <button type="button" onClick={() => setInvitingToCircle(true)}>
            Invite to Circle
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
        <h2>Invite {firstName} to a Circle</h2>
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

const SORT_OPTIONS = [
  { value: 'recent', label: 'Recently added', icon: ClockIcon },
  { value: 'alphabetical', label: 'Alphabetical', icon: AlphaIcon },
  { value: 'circle', label: 'Circle', icon: CircleGroupIcon },
  { value: 'location', label: 'Location', icon: PinIcon },
  { value: 'custom', label: 'Custom', icon: SparkleIcon }
];

function SortPicker({ value, onChange, sortDir, onToggleDir, dirDisabled }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const selected = SORT_OPTIONS.find((o) => o.value === value) || SORT_OPTIONS[0];
  const SelectedIcon = selected.icon;

  // Close on outside click / Escape so it behaves like a native dropdown.
  useEffect(() => {
    if (!open) return;
    function onDown(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    }
    function onKey(e) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div
      className={`friends-sort-picker${open ? ' is-open' : ''}`}
      ref={rootRef}
    >
      <div className="friends-sort-trigger">
        <button
          type="button"
          className="friends-sort-trigger-main"
          onClick={() => setOpen((o) => !o)}
          aria-haspopup="listbox"
          aria-expanded={open}
        >
          <span className="friends-sort-trigger-label">Sort by</span>
          <span className="friends-sort-trigger-value">
            <SelectedIcon />
            <span>{selected.label}</span>
          </span>
          <span className="friends-sort-trigger-caret" aria-hidden="true">
            ▾
          </span>
        </button>
        <span className="friends-sort-trigger-sep" aria-hidden="true" />
        <button
          type="button"
          className="friends-sort-trigger-dir"
          onClick={onToggleDir}
          disabled={dirDisabled}
          aria-label={
            sortDir === 'asc' ? 'Sort ascending' : 'Sort descending'
          }
          title={sortDir === 'asc' ? 'Ascending' : 'Descending'}
        >
          {sortDir === 'asc' ? '↑' : '↓'}
        </button>
      </div>
      <div
        className="friends-sort-panel"
        role="listbox"
        aria-hidden={!open}
      >
        {SORT_OPTIONS.map((opt) => {
          const Icon = opt.icon;
          const isSelected = opt.value === value;
          return (
            <button
              key={opt.value}
              type="button"
              role="option"
              aria-selected={isSelected}
              className={`friends-sort-option${
                isSelected ? ' is-selected' : ''
              }`}
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
              tabIndex={open ? 0 : -1}
            >
              <Icon />
              <span>{opt.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="M12 7.5V12l3 2"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function AlphaIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 17L7 7l3 10M5 14h4"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M14 7h5l-5 10h5"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CircleGroupIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="9" cy="12" r="4.5" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="15" cy="12" r="4.5" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 21s6.5-6 6.5-10.5a6.5 6.5 0 1 0-13 0C5.5 15 12 21 12 21z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="10.5" r="2.3" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

function SparkleIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8L12 3z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M18 16l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9.9-2.1z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
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

function ThumbsUpIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M7 10v10H4V10h3zm3 10h7.5a2 2 0 0 0 2-1.6l1.4-7A2 2 0 0 0 19 9h-5l.8-4.2a1.5 1.5 0 0 0-2.7-1.1L7 10v10z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

function XIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M6 6l12 12M18 6L6 18"
        stroke="currentColor"
        strokeWidth="2.2"
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

// Load all friendships involving me. Splits into pending incoming/outgoing
// requests plus an acceptedAt map keyed by the other user's uid so the
// Friends grid can sort by "recently added".
async function fetchAllFriendships(uid) {
  const snap = await getDocs(
    query(collection(db, 'friendships'), where('users', 'array-contains', uid))
  );
  const pending = [];
  const acceptedAt = {};
  snap.forEach((d) => {
    const data = d.data();
    const other = data.users.find((u) => u !== uid);
    if (data.status === 'pending') {
      pending.push({ id: d.id, other, requestedByMe: data.requestedBy === uid });
    } else if (data.status === 'accepted') {
      acceptedAt[other] = data.acceptedAt || data.createdAt || null;
    }
  });
  const profiles = await fetchUserProfiles(pending.map((p) => p.other));
  const byId = new Map(profiles.map((p) => [p.id, p]));
  const inc = [];
  const out = [];
  for (const p of pending) {
    const entry = { id: p.id, other: byId.get(p.other) || null };
    (p.requestedByMe ? out : inc).push(entry);
  }
  return { inc, out, acceptedAt };
}

