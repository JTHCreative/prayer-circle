import { useEffect, useMemo, useRef, useState } from 'react';
import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  doc,
  documentId,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where
} from 'firebase/firestore';
import { db } from '../firebase.js';
import { useAuth } from '../context/AuthContext.jsx';
import Avatar from '../components/Avatar.jsx';

// Gentle gradient palettes for each bubble so the space has visual variety
// while still living in the app's blue/purple family.
const BUBBLE_THEMES = [
  { from: '#3b82f6', to: '#8b5cf6' }, // blue -> violet
  { from: '#6366f1', to: '#a855f7' }, // indigo -> purple
  { from: '#0ea5e9', to: '#6366f1' }, // sky -> indigo
  { from: '#8b5cf6', to: '#ec4899' }, // violet -> pink
  { from: '#14b8a6', to: '#3b82f6' }  // teal -> blue
];

function hashId(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function bubbleSize(memberCount) {
  const base = 80;
  return Math.min(170, base + Math.sqrt(memberCount || 1) * 22);
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function clamp(value, lo, hi) {
  return Math.max(lo, Math.min(hi, value));
}

export default function Circles() {
  const { user, refreshProfile } = useAuth();
  const [circles, setCircles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [creating, setCreating] = useState(false);

  const containerRef = useRef(null);
  const bubbleRefs = useRef({});
  const dataRef = useRef([]);
  const selectedRef = useRef(null);

  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  // Load every circle so the whole universe shows up in the space.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const snap = await getDocs(
        query(collection(db, 'circles'), orderBy('createdAt', 'desc'))
      );
      const all = [];
      snap.forEach((d) => all.push({ id: d.id, ...d.data() }));
      if (!cancelled) {
        setCircles(all);
        setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Seed bubble positions/velocities whenever the circle list changes.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || circles.length === 0) {
      dataRef.current = [];
      return;
    }
    const rect = container.getBoundingClientRect();
    dataRef.current = circles.map((c) => {
      const members = c.members?.length || 1;
      const size = bubbleSize(members);
      const themeIndex = hashId(c.id) % BUBBLE_THEMES.length;
      return {
        id: c.id,
        size,
        themeIndex,
        x: Math.random() * Math.max(0, rect.width - size),
        y: Math.random() * Math.max(0, rect.height - size),
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5
      };
    });
  }, [circles]);

  // Physics loop. Mutates DOM directly so we don't re-render every frame.
  useEffect(() => {
    let raf;
    function tick() {
      const container = containerRef.current;
      if (!container) {
        raf = requestAnimationFrame(tick);
        return;
      }
      const rect = container.getBoundingClientRect();
      const paused = !!selectedRef.current;
      for (const b of dataRef.current) {
        if (!paused && !b.dragging) {
          b.x += b.vx;
          b.y += b.vy;
          if (b.x <= 0) { b.x = 0; b.vx = -b.vx; }
          if (b.x + b.size >= rect.width) { b.x = rect.width - b.size; b.vx = -b.vx; }
          if (b.y <= 0) { b.y = 0; b.vy = -b.vy; }
          if (b.y + b.size >= rect.height) { b.y = rect.height - b.size; b.vy = -b.vy; }
          // Apply a little drag so flicks eventually settle to the
          // ambient drift speed.
          if (Math.abs(b.vx) > 0.5) b.vx *= 0.985;
          if (Math.abs(b.vy) > 0.5) b.vy *= 0.985;
        }
        const el = bubbleRefs.current[b.id];
        if (el) el.style.transform = `translate(${b.x}px, ${b.y}px)`;
      }
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [circles]);

  function handlePointerDown(e, circleId) {
    // Only primary button / first touch
    if (e.button !== undefined && e.button !== 0) return;
    const b = dataRef.current.find((d) => d.id === circleId);
    const container = containerRef.current;
    if (!b || !container) return;
    const rect = container.getBoundingClientRect();
    b.dragging = true;
    b.wasDragged = false;
    b.dragStartX = e.clientX;
    b.dragStartY = e.clientY;
    b.dragOffsetX = e.clientX - rect.left - b.x;
    b.dragOffsetY = e.clientY - rect.top - b.y;
    b.lastX = b.x;
    b.lastY = b.y;
    b.lastT = performance.now();
    b.releaseVx = 0;
    b.releaseVy = 0;
    b.vx = 0;
    b.vy = 0;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
    e.currentTarget.classList.add('dragging');
  }

  function handlePointerMove(e, circleId) {
    const b = dataRef.current.find((d) => d.id === circleId);
    const container = containerRef.current;
    if (!b || !b.dragging || !container) return;
    const rect = container.getBoundingClientRect();
    const newX = clamp(e.clientX - rect.left - b.dragOffsetX, 0, rect.width - b.size);
    const newY = clamp(e.clientY - rect.top - b.dragOffsetY, 0, rect.height - b.size);
    const now = performance.now();
    const dt = Math.max(1, now - b.lastT);
    // Normalize to ~16ms frame so released speed matches the physics loop
    b.releaseVx = ((newX - b.lastX) / dt) * 16;
    b.releaseVy = ((newY - b.lastY) / dt) * 16;
    b.x = newX;
    b.y = newY;
    b.lastX = newX;
    b.lastY = newY;
    b.lastT = now;
    const dx = e.clientX - b.dragStartX;
    const dy = e.clientY - b.dragStartY;
    if (dx * dx + dy * dy > 25) b.wasDragged = true; // 5px threshold
  }

  function handlePointerUp(e, circleId) {
    const b = dataRef.current.find((d) => d.id === circleId);
    if (!b) return;
    if (b.dragging) {
      b.dragging = false;
      const MAX = 4;
      const vx = b.releaseVx || 0;
      const vy = b.releaseVy || 0;
      const speed = Math.hypot(vx, vy);
      if (speed > MAX) {
        b.vx = (vx / speed) * MAX;
        b.vy = (vy / speed) * MAX;
      } else {
        b.vx = vx;
        b.vy = vy;
      }
    }
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}
    e.currentTarget.classList.remove('dragging');
  }

  function handleBubbleClick(circle) {
    const b = dataRef.current.find((d) => d.id === circle.id);
    if (b?.wasDragged) {
      b.wasDragged = false;
      return;
    }
    setSelected(circle);
  }

  async function handleJoin(circle) {
    await updateDoc(doc(db, 'circles', circle.id), {
      members: arrayUnion(user.uid)
    });
    await updateDoc(doc(db, 'users', user.uid), {
      circleIds: arrayUnion(circle.id)
    });
    await refreshProfile();
    setCircles((prev) =>
      prev.map((c) =>
        c.id === circle.id
          ? { ...c, members: [...(c.members || []), user.uid] }
          : c
      )
    );
    setSelected((prev) =>
      prev ? { ...prev, members: [...(prev.members || []), user.uid] } : prev
    );
  }

  async function handleLeave(circle) {
    if (!confirm(`Leave ${circle.name}?`)) return;
    await updateDoc(doc(db, 'circles', circle.id), {
      members: arrayRemove(user.uid)
    });
    await updateDoc(doc(db, 'users', user.uid), {
      circleIds: arrayRemove(circle.id)
    });
    await refreshProfile();
    setCircles((prev) =>
      prev.map((c) =>
        c.id === circle.id
          ? { ...c, members: (c.members || []).filter((id) => id !== user.uid) }
          : c
      )
    );
    setSelected((prev) =>
      prev ? { ...prev, members: (prev.members || []).filter((id) => id !== user.uid) } : prev
    );
  }

  async function handleCreate({ name, description }) {
    const ref = await addDoc(collection(db, 'circles'), {
      name: name.trim(),
      description: description.trim(),
      createdBy: user.uid,
      members: [user.uid],
      createdAt: serverTimestamp()
    });
    await updateDoc(doc(db, 'users', user.uid), {
      circleIds: arrayUnion(ref.id)
    });
    await refreshProfile();
    // Optimistically add to the local list so it pops into the space.
    setCircles((prev) => [
      {
        id: ref.id,
        name: name.trim(),
        description: description.trim(),
        createdBy: user.uid,
        members: [user.uid],
        createdAt: null
      },
      ...prev
    ]);
    setCreating(false);
  }

  return (
    <div className="circle-universe">
      <div className="circle-universe-header">
        <div>
          <h1>Prayer Circles</h1>
          <p className="muted">
            A living space of every prayer circle. Click a bubble to learn
            more or join in.
          </p>
        </div>
        <button type="button" onClick={() => setCreating(true)}>
          + New circle
        </button>
      </div>

      <div className="circle-space" ref={containerRef}>
        {loading && <p className="muted center-abs">Loading circles…</p>}
        {!loading && circles.length === 0 && (
          <p className="muted center-abs">
            No circles yet. Create the first one!
          </p>
        )}
        {circles.map((c) => {
          const data = dataRef.current.find((d) => d.id === c.id);
          const theme = BUBBLE_THEMES[(data?.themeIndex ?? 0)];
          const size = data?.size ?? bubbleSize(c.members?.length || 1);
          return (
            <button
              key={c.id}
              type="button"
              ref={(el) => {
                if (el) bubbleRefs.current[c.id] = el;
                else delete bubbleRefs.current[c.id];
              }}
              className="circle-bubble"
              style={{
                width: size,
                height: size,
                background: `radial-gradient(circle at 30% 25%, ${theme.from} 0%, ${theme.to} 100%)`
              }}
              onPointerDown={(e) => handlePointerDown(e, c.id)}
              onPointerMove={(e) => handlePointerMove(e, c.id)}
              onPointerUp={(e) => handlePointerUp(e, c.id)}
              onPointerCancel={(e) => handlePointerUp(e, c.id)}
              onClick={() => handleBubbleClick(c)}
              aria-label={`Open circle ${c.name}`}
            >
              <span className="circle-bubble-name">{c.name}</span>
              <span className="circle-bubble-count">
                {(c.members || []).length}
              </span>
            </button>
          );
        })}
      </div>

      {selected && (
        <CircleDetailOverlay
          circle={selected}
          currentUserId={user.uid}
          onClose={() => setSelected(null)}
          onJoin={() => handleJoin(selected)}
          onLeave={() => handleLeave(selected)}
        />
      )}

      {creating && (
        <CreateCircleModal
          onCancel={() => setCreating(false)}
          onCreate={handleCreate}
        />
      )}
    </div>
  );
}

function CircleDetailOverlay({ circle, currentUserId, onClose, onJoin, onLeave }) {
  const [members, setMembers] = useState([]);
  const [loadingMembers, setLoadingMembers] = useState(true);
  const isMember = (circle.members || []).includes(currentUserId);
  const memberCount = (circle.members || []).length;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoadingMembers(true);
      try {
        const ids = (circle.members || []).slice(0, 3);
        if (ids.length === 0) {
          if (!cancelled) setMembers([]);
          return;
        }
        const all = [];
        for (const group of chunk(ids, 10)) {
          const snap = await getDocs(
            query(collection(db, 'users'), where(documentId(), 'in', group))
          );
          snap.forEach((d) => all.push({ id: d.id, ...d.data() }));
        }
        if (!cancelled) setMembers(all);
      } finally {
        if (!cancelled) setLoadingMembers(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [circle.id, circle.members?.length]);

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
        <div className="overlay-header">
          <div className="overlay-dot" />
          <div>
            <h2>{circle.name}</h2>
            <p className="muted">
              {memberCount} {memberCount === 1 ? 'member' : 'members'}
            </p>
          </div>
        </div>

        {circle.description && (
          <p className="overlay-description">{circle.description}</p>
        )}

        <div className="overlay-members">
          {loadingMembers ? (
            <span className="muted">Loading members…</span>
          ) : (
            <>
              <div className="member-avatars">
                {members.map((m) => (
                  <Avatar key={m.id} user={m} size={44} />
                ))}
              </div>
              {memberCount > members.length && (
                <span className="muted">
                  +{memberCount - members.length} more
                </span>
              )}
            </>
          )}
        </div>

        <div className="overlay-actions">
          {isMember ? (
            <button type="button" className="danger" onClick={onLeave}>
              Leave circle
            </button>
          ) : (
            <button type="button" onClick={onJoin}>
              Join circle
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function CreateCircleModal({ onCancel, onCreate }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError('');
    try {
      await onCreate({ name, description });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="overlay" onClick={onCancel}>
      <div className="overlay-card" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="overlay-close"
          onClick={onCancel}
          aria-label="Close"
        >
          ×
        </button>
        <h2>Create a prayer circle</h2>
        <form onSubmit={handleSubmit}>
          <label>
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <label>
            Description
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this circle about?"
            />
          </label>
          {error && <p className="error">{error}</p>}
          <div className="overlay-actions">
            <button type="submit" disabled={busy}>
              {busy ? 'Creating…' : 'Create circle'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
