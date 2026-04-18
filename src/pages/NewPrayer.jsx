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
// don't reshuffle when React re-renders the page). Each particle picks
// a left%, top%, size, duration, and delay; the CSS keyframe handles a
// gentle twinkle-in-place so every speck is visible at any given moment.
const NP_PARTICLES = [
  { left:  6, top: 82, size: 5, delay: 0,    duration: 4.2, peak: 0.9  },
  { left: 14, top: 18, size: 4, delay: 1.5,  duration: 5.0, peak: 0.75 },
  { left: 22, top: 64, size: 6, delay: 0.4,  duration: 4.6, peak: 1    },
  { left: 31, top: 36, size: 4, delay: 2.3,  duration: 5.4, peak: 0.7  },
  { left: 39, top: 90, size: 5, delay: 0.9,  duration: 3.8, peak: 0.85 },
  { left: 47, top: 12, size: 4, delay: 1.1,  duration: 5.6, peak: 0.7  },
  { left: 55, top: 72, size: 6, delay: 2.0,  duration: 4.2, peak: 0.95 },
  { left: 63, top: 28, size: 4, delay: 0.3,  duration: 5.0, peak: 0.75 },
  { left: 71, top: 58, size: 5, delay: 1.8,  duration: 4.4, peak: 0.9  },
  { left: 79, top: 8,  size: 4, delay: 2.6,  duration: 5.2, peak: 0.7  },
  { left: 87, top: 48, size: 6, delay: 0.6,  duration: 3.9, peak: 1    },
  { left: 94, top: 76, size: 4, delay: 1.3,  duration: 5.8, peak: 0.7  },
  { left: 18, top: 42, size: 4, delay: 3.2,  duration: 4.8, peak: 0.65 },
  { left: 51, top: 50, size: 4, delay: 0.7,  duration: 6.0, peak: 0.65 },
  { left: 75, top: 88, size: 5, delay: 2.4,  duration: 4.2, peak: 0.9  },
  { left: 10, top: 30, size: 4, delay: 1.9,  duration: 5.4, peak: 0.6  }
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
                top: `${p.top}%`,
                width: `${p.size}px`,
                height: `${p.size}px`,
                animationDelay: `${p.delay}s`,
                animationDuration: `${p.duration}s`,
                '--np-peak': p.peak
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

