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
      // Load friend profiles
      if (profile.friendIds && profile.friendIds.length > 0) {
        const chunks = chunk(profile.friendIds, 10);
        const all = [];
        for (const part of chunks) {
          const q = query(collection(db, 'users'), where(documentId(), 'in', part));
          const snap = await getDocs(q);
          snap.forEach((d) => all.push({ id: d.id, ...d.data() }));
        }
        setFriends(all);
      } else {
        setFriends([]);
      }
      // Load circles
      if (profile.circleIds && profile.circleIds.length > 0) {
        const chunks = chunk(profile.circleIds, 10);
        const all = [];
        for (const part of chunks) {
          const q = query(collection(db, 'circles'), where(documentId(), 'in', part));
          const snap = await getDocs(q);
          snap.forEach((d) => all.push({ id: d.id, ...d.data() }));
        }
        setCircles(all);
      } else {
        setCircles([]);
      }
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

      const base = {
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
      };
      await addDoc(collection(db, 'prayers'), base);
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <h1>Share a prayer request</h1>
      <form onSubmit={handleSubmit}>
        <label>
          What would you like prayer for?
          <textarea
            rows={5}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Share your heart…"
            required
          />
        </label>

        <fieldset className="visibility">
          <legend>Who can see this?</legend>
          <label className="radio">
            <input
              type="radio"
              name="visibility"
              value="public"
              checked={visibility === 'public'}
              onChange={(e) => setVisibility(e.target.value)}
            />
            <span>Public — all users</span>
          </label>
          <label className="radio">
            <input
              type="radio"
              name="visibility"
              value="circles"
              checked={visibility === 'circles'}
              onChange={(e) => setVisibility(e.target.value)}
            />
            <span>My prayer circles</span>
          </label>
          <label className="radio">
            <input
              type="radio"
              name="visibility"
              value="friend"
              checked={visibility === 'friend'}
              onChange={(e) => setVisibility(e.target.value)}
            />
            <span>One specific friend</span>
          </label>
        </fieldset>

        {visibility === 'friend' && (
          <label>
            Friend
            <select
              value={targetUserId}
              onChange={(e) => setTargetUserId(e.target.value)}
              required
            >
              <option value="">Select a friend…</option>
              {friends.map((f) => (
                <option key={f.id} value={f.id}>{f.displayName}</option>
              ))}
            </select>
            {friends.length === 0 && (
              <small className="muted">You haven't added any friends yet.</small>
            )}
          </label>
        )}

        {visibility === 'circles' && (
          <div>
            <p className="label">Select circles</p>
            {circles.length === 0 && <p className="muted">You haven't joined any circles yet.</p>}
            <div className="checkbox-list">
              {circles.map((c) => (
                <label key={c.id} className="checkbox">
                  <input
                    type="checkbox"
                    checked={selectedCircleIds.includes(c.id)}
                    onChange={() => toggleCircle(c.id)}
                  />
                  <span>{c.name}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={busy}>{busy ? 'Posting…' : 'Post prayer'}</button>
      </form>
    </div>
  );
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
