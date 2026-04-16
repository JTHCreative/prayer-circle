import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  addDoc,
  collection,
  documentId,
  getDocs,
  query,
  serverTimestamp,
  where
} from 'firebase/firestore';
import { db } from '../firebase.js';
import { useAuth } from '../context/AuthContext.jsx';
import Avatar from '../components/Avatar.jsx';
import { chunk } from '../utils/arrays.js';
import {
  CircleVisibilityIcon,
  PersonIcon,
  PublicIcon
} from '../components/icons.jsx';

const VISIBILITY_OPTIONS = [
  { key: 'public', label: 'Public', Icon: PublicIcon, helper: 'Anyone on Prayer Circle can see this.' },
  { key: 'circles', label: 'My circles', Icon: CircleVisibilityIcon, helper: 'Only the prayer circles you pick.' },
  { key: 'friend', label: 'One friend', Icon: PersonIcon, helper: 'Sent directly to one friend.' }
];

export default function NewPrayer() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialVisibility = searchParams.get('visibility') || 'public';
  const initialTarget = searchParams.get('to') || '';
  const [text, setText] = useState('');
  const [visibility, setVisibility] = useState(
    initialVisibility === 'friend' || initialVisibility === 'circles'
      ? initialVisibility
      : 'public'
  );
  const [targetUserId, setTargetUserId] = useState(
    initialVisibility === 'friend' ? initialTarget : ''
  );
  const [selectedCircleIds, setSelectedCircleIds] = useState([]);
  const [friends, setFriends] = useState([]);
  const [circles, setCircles] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    async function loadRefs() {
      if (!profile) return;
      const [friendList, circleList] = await Promise.all([
        fetchByIds('users', profile.friendIds),
        fetchByIds('circles', profile.circleIds)
      ]);
      setFriends(friendList);
      setCircles(circleList);
    }
    loadRefs();
  }, [profile]);

  function toggleCircle(id) {
    setSelectedCircleIds((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!text.trim()) {
      setError('Prayer text is required.');
      return;
    }
    if (visibility === 'friend' && !targetUserId) {
      setError('Please select a friend.');
      return;
    }
    if (visibility === 'circles' && selectedCircleIds.length === 0) {
      setError('Please select at least one circle.');
      return;
    }

    setBusy(true);
    try {
      // Snapshot display info for the chosen target/circles so feed cards
      // can render immediately without a follow-up lookup.
      const selectedCircles = circles.filter((c) => selectedCircleIds.includes(c.id));
      const targetFriend = friends.find((f) => f.id === targetUserId);

      await addDoc(collection(db, 'prayers'), {
        text: text.trim(),
        authorId: user.uid,
        authorName: profile?.displayName ?? 'Anonymous',
        authorLocation: profile?.location ?? '',
        authorPhotoURL: profile?.photoURL ?? '',
        authorUsername: profile?.username ?? '',
        visibility,
        targetUserId: visibility === 'friend' ? targetUserId : null,
        targetUsername: visibility === 'friend' ? (targetFriend?.username ?? '') : '',
        targetName: visibility === 'friend' ? (targetFriend?.displayName ?? '') : '',
        circleIds: visibility === 'circles' ? selectedCircleIds : [],
        circleNames:
          visibility === 'circles'
            ? selectedCircles.map((c) => c.name).filter(Boolean)
            : [],
        prayedBy: [],
        prayedCount: 0,
        createdAt: serverTimestamp()
      });
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const activeOption = VISIBILITY_OPTIONS.find((o) => o.key === visibility);

  return (
    <div className="circle-universe">
      <div className="circle-universe-header">
        <div>
          <h1>New prayer</h1>
          <p className="muted">
            Share what's on your heart, then pick who should see it.
          </p>
        </div>
      </div>

      <div className="new-prayer-space">
        <div className="new-prayer-inner">
          <div className="new-prayer-row">
            <form
              className="new-prayer-card new-prayer-main"
              onSubmit={handleSubmit}
            >
              <label className="new-prayer-field">
                <span className="new-prayer-field-label">
                  What would you like prayer for?
                </span>
                <textarea
                  rows={7}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Share your heart…"
                  required
                />
              </label>
              {error && <p className="error">{error}</p>}
              <div className="new-prayer-submit">
                <span className="muted">{activeOption?.helper}</span>
                <button type="submit" disabled={busy}>
                  {busy ? 'Posting…' : 'Post prayer'}
                </button>
              </div>
            </form>

            <div className="new-prayer-card new-prayer-visibility">
              <h3>Who can see this?</h3>
              <div className="new-prayer-visibility-options">
                {VISIBILITY_OPTIONS.map(({ key, label, Icon }) => (
                  <button
                    key={key}
                    type="button"
                    className={
                      visibility === key
                        ? 'new-prayer-visibility-btn is-active'
                        : 'new-prayer-visibility-btn'
                    }
                    onClick={() => setVisibility(key)}
                    aria-pressed={visibility === key}
                  >
                    <Icon size={22} />
                    <span>{label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {visibility === 'circles' && (
            <div className="new-prayer-card new-prayer-selector">
              <h3>Select circles</h3>
              {circles.length === 0 ? (
                <p className="muted">
                  You haven't joined any prayer circles yet.
                </p>
              ) : (
                <ul className="new-prayer-selector-list">
                  {circles.map((c) => {
                    const checked = selectedCircleIds.includes(c.id);
                    const memberCount = (c.members || []).length;
                    return (
                      <li key={c.id}>
                        <button
                          type="button"
                          className={
                            checked
                              ? 'new-prayer-selector-row is-active'
                              : 'new-prayer-selector-row'
                          }
                          onClick={() => toggleCircle(c.id)}
                          aria-pressed={checked}
                        >
                          <span>
                            <strong>{c.name}</strong>
                            <small className="muted">
                              {' '}· {memberCount}{' '}
                              {memberCount === 1 ? 'member' : 'members'}
                            </small>
                          </span>
                          <span className="new-prayer-check" aria-hidden="true">
                            {checked ? '✓' : ''}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}

          {visibility === 'friend' && (
            <div className="new-prayer-card new-prayer-selector">
              <h3>Select a friend</h3>
              {friends.length === 0 ? (
                <p className="muted">You haven't added any friends yet.</p>
              ) : (
                <ul className="new-prayer-selector-list">
                  {friends.map((f) => {
                    const checked = targetUserId === f.id;
                    return (
                      <li key={f.id}>
                        <button
                          type="button"
                          className={
                            checked
                              ? 'new-prayer-selector-row is-active'
                              : 'new-prayer-selector-row'
                          }
                          onClick={() => setTargetUserId(f.id)}
                          aria-pressed={checked}
                        >
                          <span className="person">
                            <Avatar user={f} size={32} />
                            <span>
                              <strong>{f.displayName}</strong>
                              {f.username && (
                                <small className="muted">
                                  {' '}· @{f.username}
                                </small>
                              )}
                            </span>
                          </span>
                          <span className="new-prayer-check" aria-hidden="true">
                            {checked ? '✓' : ''}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Batch fetch docs for a collection given an array of ids. Mirrors the
// chunked `documentId() in` pattern used in Friends.jsx.
async function fetchByIds(collectionName, ids) {
  if (!ids?.length) return [];
  const snaps = await Promise.all(
    chunk(ids, 10).map((part) =>
      getDocs(query(collection(db, collectionName), where(documentId(), 'in', part)))
    )
  );
  const out = [];
  snaps.forEach((snap) => snap.forEach((d) => out.push({ id: d.id, ...d.data() })));
  return out;
}
