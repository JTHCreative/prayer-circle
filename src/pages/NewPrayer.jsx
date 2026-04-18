import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  addDoc,
  collection,
  serverTimestamp
} from 'firebase/firestore';
import { db } from '../firebase.js';
import { useAuth } from '../context/AuthContext.jsx';
import Avatar from '../components/Avatar.jsx';
import { fetchByIds } from '../utils/fetch.js';
import {
  CircleVisibilityIcon,
  PersonIcon,
  PublicIcon
} from '../components/icons.jsx';
import { CircleIcon } from '../components/circleIcons.jsx';
import { circleBubbleBackground } from '../utils/circleGradients.js';

const VISIBILITY_OPTIONS = [
  { key: 'public', label: 'Public', Icon: PublicIcon, helper: 'Shared with your region on the globe.' },
  { key: 'circles', label: 'My Circles', Icon: CircleVisibilityIcon, helper: 'Only the prayer circles you pick.' },
  { key: 'friend', label: 'Private', Icon: PersonIcon, helper: 'Sent directly to one friend.' }
];

// Fixed particle field (no randomness on each render so the positions
// don't reshuffle when React re-renders the page). Each particle picks a
// column, size, fade, and drift cycle; the CSS keyframe handles motion.
const NP_PARTICLES = [
  { left: 6,  size: 3, delay: 0,    duration: 14, opacity: 0.55 },
  { left: 14, size: 2, delay: 3,    duration: 18, opacity: 0.45 },
  { left: 22, size: 4, delay: 6,    duration: 16, opacity: 0.6  },
  { left: 31, size: 2, delay: 1.5,  duration: 20, opacity: 0.4  },
  { left: 39, size: 3, delay: 8,    duration: 15, opacity: 0.5  },
  { left: 47, size: 2, delay: 4,    duration: 19, opacity: 0.45 },
  { left: 55, size: 4, delay: 10,   duration: 13, opacity: 0.55 },
  { left: 63, size: 2, delay: 2,    duration: 17, opacity: 0.4  },
  { left: 71, size: 3, delay: 7,    duration: 21, opacity: 0.5  },
  { left: 79, size: 2, delay: 11,   duration: 16, opacity: 0.45 },
  { left: 87, size: 4, delay: 5,    duration: 14, opacity: 0.6  },
  { left: 94, size: 2, delay: 9,    duration: 22, opacity: 0.4  },
  { left: 18, size: 2, delay: 12.5, duration: 18, opacity: 0.35 },
  { left: 51, size: 2, delay: 0.5,  duration: 24, opacity: 0.35 },
  { left: 75, size: 3, delay: 13,   duration: 15, opacity: 0.5  },
  { left: 10, size: 2, delay: 4.5,  duration: 23, opacity: 0.3  }
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

      const ref = await addDoc(collection(db, 'prayers'), {
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
      // eslint-disable-next-line no-console
      console.log('[NewPrayer] saved', {
        id: ref.id,
        visibility,
        circleIds: visibility === 'circles' ? selectedCircleIds : [],
        targetUserId: visibility === 'friend' ? targetUserId : null
      });
      navigate('/');
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[NewPrayer] save failed', err);
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
          <h1>New Prayer</h1>
          <p className="muted">
            Share what's on your heart, then pick who should see it.
          </p>
        </div>
      </div>

      <div className="new-prayer-space">
        <div className="np-particles" aria-hidden="true">
          {NP_PARTICLES.map((p, i) => (
            <span
              key={i}
              className="np-particle"
              style={{
                left: `${p.left}%`,
                width: `${p.size}px`,
                height: `${p.size}px`,
                animationDelay: `${p.delay}s`,
                animationDuration: `${p.duration}s`,
                '--np-peak': p.opacity
              }}
            />
          ))}
        </div>
        <div className="new-prayer-scroll">
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
              <h3>Who Can See This?</h3>
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
              <h3>Select Circles</h3>
              {circles.length === 0 ? (
                <p className="muted">
                  You haven't joined any prayer circles yet.
                </p>
              ) : (
                <div className="new-prayer-circle-grid">
                  {circles.map((c) => {
                    const checked = selectedCircleIds.includes(c.id);
                    const memberCount = (c.members || []).length;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        className={
                          checked
                            ? 'new-prayer-bubble is-active'
                            : 'new-prayer-bubble'
                        }
                        onClick={() => toggleCircle(c.id)}
                        aria-pressed={checked}
                        title={c.name}
                      >
                        <span
                          className="new-prayer-bubble-fill"
                          style={{ background: circleBubbleBackground(c) }}
                        >
                          {c.iconKey && (
                            <CircleIcon
                              name={c.iconKey}
                              size={26}
                              className="new-prayer-bubble-icon"
                            />
                          )}
                          <span className="new-prayer-bubble-name">{c.name}</span>
                          <span className="new-prayer-bubble-count">
                            {memberCount}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {visibility === 'friend' && (
            <div className="new-prayer-card new-prayer-selector">
              <h3>Select a Friend</h3>
              {friends.length === 0 ? (
                <p className="muted">You haven't added any friends yet.</p>
              ) : (
                <div className="new-prayer-friend-grid">
                  {friends.map((f) => {
                    const checked = targetUserId === f.id;
                    return (
                      <button
                        key={f.id}
                        type="button"
                        className={
                          checked
                            ? 'new-prayer-friend-tile is-active'
                            : 'new-prayer-friend-tile'
                        }
                        onClick={() => setTargetUserId(f.id)}
                        aria-pressed={checked}
                        title={f.displayName}
                      >
                        <span className="new-prayer-friend-avatar">
                          <Avatar user={f} size={60} />
                        </span>
                        <span className="new-prayer-friend-name">
                          {f.displayName}
                        </span>
                        {f.username && (
                          <span className="new-prayer-friend-handle">
                            @{f.username}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
        </div>
      </div>
    </div>
  );
}

