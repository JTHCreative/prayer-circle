import { useEffect, useMemo, useRef, useState } from 'react';
import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  documentId,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where
} from 'firebase/firestore';
import { db } from '../firebase.js';
import { useAuth } from '../context/AuthContext.jsx';
import Avatar from '../components/Avatar.jsx';
import PrayerCard from '../components/PrayerCard.jsx';
import { PencilIcon, TrashIcon } from '../components/icons.jsx';
import { CircleIcon, CIRCLE_ICON_KEYS } from '../components/circleIcons.jsx';
import { togglePraying } from '../utils/prayers.js';

// 2-color radial-gradient palettes a circle owner can pick from. The first
// entry is the default for new circles. Older circles without a saved
// gradientKey fall back to a hash-based pick from this same list, so the
// canvas keeps some visual variety even before anyone customizes.
const GRADIENT_PALETTES = [
  { key: 'blue-purple',   from: '#3b82f6', to: '#8b5cf6' }, // default
  { key: 'indigo-purple', from: '#6366f1', to: '#a855f7' },
  { key: 'sky-indigo',    from: '#0ea5e9', to: '#6366f1' },
  { key: 'violet-pink',   from: '#8b5cf6', to: '#ec4899' },
  { key: 'teal-blue',     from: '#14b8a6', to: '#3b82f6' },
  { key: 'rose-pink',     from: '#f43f5e', to: '#d946ef' },
  { key: 'orange-red',    from: '#f97316', to: '#dc2626' },
  { key: 'amber-orange',  from: '#f59e0b', to: '#ea580c' },
  { key: 'green-teal',    from: '#10b981', to: '#06b6d4' },
  { key: 'slate-gray',    from: '#475569', to: '#94a3b8' }
];
const DEFAULT_GRADIENT_KEY = GRADIENT_PALETTES[0].key;
const GRADIENT_BY_KEY = Object.fromEntries(GRADIENT_PALETTES.map((g) => [g.key, g]));

function getCircleGradient(circle) {
  if (circle.gradientKey && GRADIENT_BY_KEY[circle.gradientKey]) {
    return GRADIENT_BY_KEY[circle.gradientKey];
  }
  return GRADIENT_PALETTES[hashId(circle.id) % GRADIENT_PALETTES.length];
}

function hashId(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h);
}

// Bubble diameters by community size — three tiers so a circle's heft on
// the canvas tracks how active it is rather than scaling continuously.
const BUBBLE_SIZE_SMALL = 90;
const BUBBLE_SIZE_MEDIUM = 130;
const BUBBLE_SIZE_LARGE = 175;
function bubbleSize(memberCount) {
  const n = memberCount || 1;
  if (n >= 21) return BUBBLE_SIZE_LARGE;
  if (n >= 6) return BUBBLE_SIZE_MEDIUM;
  return BUBBLE_SIZE_SMALL;
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
  const { user, profile, refreshProfile } = useAuth();
  const [circles, setCircles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(null); // circle or null
  const [inviting, setInviting] = useState(null); // circle or null
  const [panelMembers, setPanelMembers] = useState([]);
  const [panelPrayers, setPanelPrayers] = useState([]);
  const [panelLoading, setPanelLoading] = useState(false);

  const containerRef = useRef(null);
  const bubbleRefs = useRef({});
  const dataRef = useRef([]);
  const selectedRef = useRef(null);
  const togglingRef = useRef(new Set());

  const isMemberOfSelected =
    !!selected && (selected.members || []).includes(user?.uid);

  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  // Expanded-bubble target size — used for positioning + CSS
  const EXPANDED_SIZE = 360;

  // Load full member list + (for members) the circle's prayer feed whenever
  // a bubble is selected. Members feed the bubble's avatar preview AND the
  // detail panel below the space.
  useEffect(() => {
    if (!selected) {
      setPanelMembers([]);
      setPanelPrayers([]);
      setPanelLoading(false);
      return;
    }
    let cancelled = false;
    async function load() {
      setPanelLoading(true);
      const memberIds = selected.members || [];
      try {
        const memberSnaps = await Promise.all(
          chunk(memberIds, 10).map((group) =>
            getDocs(
              query(collection(db, 'users'), where(documentId(), 'in', group))
            )
          )
        );
        if (cancelled) return;
        const members = [];
        for (const snap of memberSnaps) {
          snap.forEach((d) => members.push({ id: d.id, ...d.data() }));
        }
        // Keep members in the order they appear in the circle so the creator
        // doesn't jump around when more people join.
        const indexById = new Map(memberIds.map((id, i) => [id, i]));
        members.sort(
          (a, b) => (indexById.get(a.id) ?? 0) - (indexById.get(b.id) ?? 0)
        );
        setPanelMembers(members);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('Failed to load circle members', err);
      }

      // Prayers shared to a circle are meant for its members — skip for
      // non-members and clear any stale list.
      if (!isMemberOfSelected) {
        if (!cancelled) {
          setPanelPrayers([]);
          setPanelLoading(false);
        }
        return;
      }

      try {
        const psnap = await getDocs(
          query(
            collection(db, 'prayers'),
            where('circleIds', 'array-contains-any', [selected.id]),
            orderBy('createdAt', 'desc')
          )
        );
        if (cancelled) return;
        const prayers = [];
        psnap.forEach((d) => prayers.push({ id: d.id, ...d.data() }));
        setPanelPrayers(prayers);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('Failed to load circle prayers', err);
        if (!cancelled) setPanelPrayers([]);
      } finally {
        if (!cancelled) setPanelLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [selected?.id, selected?.members?.length, isMemberOfSelected]);

  // When selection changes, set a snap target so the bubble eases into
  // the center of the space with the expanded size.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    for (const b of dataRef.current) {
      if (selected && b.id === selected.id) {
        b.targetX = rect.width / 2 - EXPANDED_SIZE / 2;
        b.targetY = rect.height / 2 - EXPANDED_SIZE / 2;
        b.snapping = true;
      } else {
        b.snapping = false;
      }
    }
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
  // Preserve position, velocity, drag, and snap state for circles we've
  // already placed — otherwise editing a circle (which updates the
  // circles array) would re-roll every bubble's position and throw the
  // currently-selected bubble off-center away from its snap target.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || circles.length === 0) {
      dataRef.current = [];
      return;
    }
    const rect = container.getBoundingClientRect();
    const existing = new Map(dataRef.current.map((d) => [d.id, d]));
    dataRef.current = circles.map((c) => {
      const members = c.members?.length || 1;
      const size = bubbleSize(members);
      const prev = existing.get(c.id);
      if (prev) {
        // Keep motion state; only pick up the (possibly) new size.
        return { ...prev, size };
      }
      return {
        id: c.id,
        size,
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
      const selectedId = selectedRef.current?.id;
      for (const b of dataRef.current) {
        const isSelected = b.id === selectedId;
        if (b.snapping) {
          // Ease toward the target (expand-to-center animation)
          b.x += (b.targetX - b.x) * 0.18;
          b.y += (b.targetY - b.y) * 0.18;
          if (
            Math.abs(b.targetX - b.x) < 0.5 &&
            Math.abs(b.targetY - b.y) < 0.5
          ) {
            b.x = b.targetX;
            b.y = b.targetY;
            b.snapping = false;
          }
        } else if (!isSelected && !b.dragging) {
          b.x += b.vx;
          b.y += b.vy;
          if (b.x <= 0) { b.x = 0; b.vx = -b.vx; }
          if (b.x + b.size >= rect.width) { b.x = rect.width - b.size; b.vx = -b.vx; }
          if (b.y <= 0) { b.y = 0; b.vy = -b.vy; }
          if (b.y + b.size >= rect.height) { b.y = rect.height - b.size; b.vy = -b.vy; }
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

  async function handleDelete(circle) {
    if (circle.createdBy !== user.uid) return;
    const memberCount = (circle.members || []).length;
    const extra =
      memberCount > 1
        ? ` ${memberCount - 1} other member${memberCount - 1 === 1 ? '' : 's'} will be notified.`
        : '';
    if (!confirm(`Delete "${circle.name}"?${extra}\nThis cannot be undone.`)) {
      return;
    }

    // Notify every other member before the circle doc disappears.
    const otherMembers = (circle.members || []).filter((id) => id !== user.uid);
    const notifWrites = otherMembers.map((memberId) =>
      setDoc(
        doc(db, 'users', memberId, 'notifications', `circle-deleted-${circle.id}`),
        {
          type: 'circle_deleted',
          title: 'Prayer circle deleted',
          body: `"${circle.name}" was removed by @${
            profile?.username || 'a prayer leader'
          }.`,
          circleId: circle.id,
          circleName: circle.name,
          fromUserId: user.uid,
          fromName: profile?.displayName || '',
          fromUsername: profile?.username || '',
          read: false,
          createdAt: serverTimestamp()
        }
      )
    );
    await Promise.all(notifWrites);

    // Delete the circle document. Other members still have the stale id
    // in their users/{uid}.circleIds, but UI that fetches circles will
    // just silently drop any that no longer exist.
    await deleteDoc(doc(db, 'circles', circle.id));

    // Clean up the creator's own circleIds list.
    await updateDoc(doc(db, 'users', user.uid), {
      circleIds: arrayRemove(circle.id)
    });
    await refreshProfile();

    setCircles((prev) => prev.filter((c) => c.id !== circle.id));
    setSelected(null);
  }

  async function handleTogglePrayerPray(prayer) {
    // Drop rapid re-clicks — togglePraying reads prayer.prayedBy to decide
    // direction, so concurrent calls with the same stale snapshot would
    // all write +1 and stack the count.
    if (togglingRef.current.has(prayer.id)) return;
    togglingRef.current.add(prayer.id);
    const wasPraying = (prayer.prayedBy || []).includes(user.uid);
    // Optimistic update so the button flips before the DB round-trip and
    // the next render's prayer prop already reflects the new state.
    setPanelPrayers((prev) =>
      prev.map((p) => {
        if (p.id !== prayer.id) return p;
        const current = p.prayedBy || [];
        const prayedBy = wasPraying
          ? current.filter((u) => u !== user.uid)
          : current.includes(user.uid)
            ? current
            : [...current, user.uid];
        return {
          ...p,
          prayedBy,
          prayedCount: Math.max(0, (p.prayedCount || 0) + (wasPraying ? -1 : 1))
        };
      })
    );
    try {
      await togglePraying(user, prayer);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to toggle praying', err);
    } finally {
      togglingRef.current.delete(prayer.id);
    }
  }

  async function handleDeletePrayer(prayer) {
    if (prayer.authorId !== user.uid) return;
    if (!confirm('Delete this prayer?')) return;
    await deleteDoc(doc(db, 'prayers', prayer.id));
    setPanelPrayers((prev) => prev.filter((p) => p.id !== prayer.id));
  }

  async function handleCreate({ name, description, iconKey, gradientKey }) {
    const ref = await addDoc(collection(db, 'circles'), {
      name: name.trim(),
      description: description.trim(),
      iconKey: iconKey || '',
      gradientKey: gradientKey || DEFAULT_GRADIENT_KEY,
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
        iconKey: iconKey || '',
        gradientKey: gradientKey || DEFAULT_GRADIENT_KEY,
        createdBy: user.uid,
        members: [user.uid],
        createdAt: null
      },
      ...prev
    ]);
    setCreating(false);
  }

  async function handleEdit(circleId, { name, description, iconKey, gradientKey }) {
    const updates = {
      name: name.trim(),
      description: description.trim(),
      iconKey: iconKey || '',
      gradientKey: gradientKey || DEFAULT_GRADIENT_KEY
    };
    await updateDoc(doc(db, 'circles', circleId), updates);
    setCircles((prev) =>
      prev.map((c) => (c.id === circleId ? { ...c, ...updates } : c))
    );
    setSelected((prev) =>
      prev && prev.id === circleId ? { ...prev, ...updates } : prev
    );
    setEditing(null);
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

      <div
        className="circle-space"
        ref={containerRef}
        onPointerDown={(e) => {
          // Clicking empty background collapses the expanded bubble
          if (selected && e.target === e.currentTarget) setSelected(null);
        }}
      >
        {loading && <p className="muted center-abs">Loading circles…</p>}
        {!loading && circles.length === 0 && (
          <p className="muted center-abs">
            No circles yet. Create the first one!
          </p>
        )}
        {circles.map((c) => {
          const data = dataRef.current.find((d) => d.id === c.id);
          const theme = getCircleGradient(c);
          const baseSize = data?.size ?? bubbleSize(c.members?.length || 1);
          const isExpanded = selected?.id === c.id;
          const memberCount = (c.members || []).length;
          const isMember = (c.members || []).includes(user.uid);
          return (
            <div
              key={c.id}
              ref={(el) => {
                if (el) bubbleRefs.current[c.id] = el;
                else delete bubbleRefs.current[c.id];
              }}
              className={`circle-bubble${isExpanded ? ' expanded' : ''}`}
              role="button"
              tabIndex={0}
              style={{
                width: isExpanded ? EXPANDED_SIZE : baseSize,
                height: isExpanded ? EXPANDED_SIZE : baseSize,
                background: `radial-gradient(circle at 30% 25%, ${theme.from} 0%, ${theme.to} 100%)`
              }}
              onPointerDown={(e) => !isExpanded && handlePointerDown(e, c.id)}
              onPointerMove={(e) => !isExpanded && handlePointerMove(e, c.id)}
              onPointerUp={(e) => !isExpanded && handlePointerUp(e, c.id)}
              onPointerCancel={(e) => !isExpanded && handlePointerUp(e, c.id)}
              onClick={() => !isExpanded && handleBubbleClick(c)}
              onKeyDown={(e) => {
                if (isExpanded) return;
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setSelected(c);
                }
              }}
              aria-label={
                isExpanded
                  ? `${c.name} circle details`
                  : `Open circle ${c.name}`
              }
              aria-expanded={isExpanded}
            >
              {!isExpanded && (
                <>
                  {c.iconKey && (
                    <CircleIcon
                      name={c.iconKey}
                      size={Math.max(20, Math.floor(baseSize * 0.32))}
                      className="circle-bubble-icon"
                    />
                  )}
                  <span className="circle-bubble-name">{c.name}</span>
                  <span className="circle-bubble-count">{memberCount}</span>
                </>
              )}
              {isExpanded && (
                <>
                  {panelMembers.length > 0 && (
                    <div className="circle-bubble-ring" aria-hidden="true">
                      {panelMembers.slice(0, 12).map((m, i, arr) => (
                        <div
                          key={m.id}
                          className="circle-bubble-ring-item"
                          style={{ '--angle': `${(i / arr.length) * 360}deg` }}
                        >
                          <div className="circle-bubble-ring-counter">
                            <Avatar user={m} size={34} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <div
                    className="circle-bubble-content"
                    onPointerDown={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      className="circle-bubble-close"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelected(null);
                      }}
                      aria-label="Close"
                    >
                      ×
                    </button>
                    {c.iconKey && (
                      <CircleIcon
                        name={c.iconKey}
                        size={48}
                        className="circle-bubble-icon-large"
                      />
                    )}
                    <h2 className="circle-bubble-title">{c.name}</h2>
                    <p className="circle-bubble-meta">
                      {memberCount} {memberCount === 1 ? 'member' : 'members'}
                    </p>
                    {c.description && (
                      <p className="circle-bubble-desc">{c.description}</p>
                    )}
                    <div className="circle-bubble-cta">
                      {isMember ? (
                        <button
                          type="button"
                          className="danger"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleLeave(c);
                          }}
                        >
                          Leave
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleJoin(c);
                          }}
                        >
                          Join
                        </button>
                      )}
                      {isMember && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setInviting(c);
                          }}
                        >
                          Invite
                        </button>
                      )}
                      {c.createdBy === user.uid && (
                        <>
                          <button
                            type="button"
                            className="circle-bubble-edit"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditing(c);
                            }}
                            aria-label="Edit circle"
                            title="Edit circle"
                          >
                            <PencilIcon size={16} />
                          </button>
                          <button
                            type="button"
                            className="circle-bubble-trash"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(c);
                            }}
                            aria-label="Delete circle"
                            title="Delete circle"
                          >
                            <TrashIcon size={16} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>

      {selected && isMemberOfSelected && (
        <CircleDetailPanel
          circle={selected}
          members={panelMembers}
          prayers={panelPrayers}
          loading={panelLoading}
          currentUserId={user.uid}
          onClose={() => setSelected(null)}
          onPrayerCreated={(prayer) => setPanelPrayers((prev) => [prayer, ...prev])}
          onPrayerPray={handleTogglePrayerPray}
          onPrayerDelete={handleDeletePrayer}
        />
      )}

      {creating && (
        <CircleEditorModal
          mode="create"
          onCancel={() => setCreating(false)}
          onSubmit={handleCreate}
        />
      )}

      {editing && (
        <CircleEditorModal
          mode="edit"
          initialValues={{
            name: editing.name || '',
            description: editing.description || '',
            iconKey: editing.iconKey || '',
            gradientKey: editing.gradientKey || DEFAULT_GRADIENT_KEY
          }}
          onCancel={() => setEditing(null)}
          onSubmit={(values) => handleEdit(editing.id, values)}
        />
      )}

      {inviting && (
        <InviteModal
          circle={inviting}
          inviter={profile}
          currentUserId={user.uid}
          friendIds={profile?.friendIds || []}
          onClose={() => setInviting(null)}
        />
      )}
    </div>
  );
}

function CircleEditorModal({ mode = 'create', initialValues, onCancel, onSubmit }) {
  const [name, setName] = useState(initialValues?.name || '');
  const [description, setDescription] = useState(initialValues?.description || '');
  const [iconKey, setIconKey] = useState(initialValues?.iconKey || '');
  const [gradientKey, setGradientKey] = useState(
    initialValues?.gradientKey || DEFAULT_GRADIENT_KEY
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const isEdit = mode === 'edit';

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError('');
    try {
      await onSubmit({ name, description, iconKey, gradientKey });
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
        <h2>{isEdit ? 'Edit prayer circle' : 'Create a prayer circle'}</h2>
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
          <div>
            <p className="label">Icon (optional)</p>
            <div className="circle-icon-picker">
              {CIRCLE_ICON_KEYS.map((key) => (
                <button
                  key={key}
                  type="button"
                  className={`circle-icon-option${iconKey === key ? ' selected' : ''}`}
                  onClick={() => setIconKey((prev) => (prev === key ? '' : key))}
                  aria-label={`${key} icon`}
                  aria-pressed={iconKey === key}
                >
                  <CircleIcon name={key} size={22} />
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="label">Color</p>
            <div className="circle-gradient-picker">
              {GRADIENT_PALETTES.map((g) => (
                <button
                  key={g.key}
                  type="button"
                  className={`circle-gradient-option${gradientKey === g.key ? ' selected' : ''}`}
                  style={{
                    background: `radial-gradient(circle at 30% 25%, ${g.from} 0%, ${g.to} 100%)`
                  }}
                  onClick={() => setGradientKey(g.key)}
                  aria-label={`${g.key} gradient`}
                  aria-pressed={gradientKey === g.key}
                />
              ))}
            </div>
          </div>
          {error && <p className="error">{error}</p>}
          <div className="overlay-actions">
            <button type="submit" disabled={busy}>
              {busy ? (isEdit ? 'Saving…' : 'Creating…') : isEdit ? 'Save changes' : 'Create circle'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function InviteModal({ circle, inviter, currentUserId, friendIds, onClose }) {
  const [friends, setFriends] = useState([]);
  const [loadingFriends, setLoadingFriends] = useState(true);
  const [invitedIds, setInvitedIds] = useState(new Set());
  const [inviteUrl, setInviteUrl] = useState('');
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [linkError, setLinkError] = useState('');

  const memberSet = useMemo(
    () => new Set(circle.members || []),
    [circle.members]
  );

  // Load the inviter's friends (minus anyone already in the circle).
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoadingFriends(true);
      try {
        const candidateIds = (friendIds || []).filter((id) => !memberSet.has(id));
        if (candidateIds.length === 0) {
          if (!cancelled) setFriends([]);
          return;
        }
        const all = [];
        for (const group of chunk(candidateIds, 10)) {
          const snap = await getDocs(
            query(collection(db, 'users'), where(documentId(), 'in', group))
          );
          snap.forEach((d) => all.push({ id: d.id, ...d.data() }));
        }
        all.sort((a, b) =>
          (a.displayName || '').localeCompare(b.displayName || '')
        );
        if (!cancelled) setFriends(all);
      } finally {
        if (!cancelled) setLoadingFriends(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [friendIds, memberSet]);

  async function handleInviteFriend(friend) {
    if (invitedIds.has(friend.id)) return;
    await setDoc(
      doc(db, 'users', friend.id, 'notifications', `circle-invite-${circle.id}-${currentUserId}`),
      {
        type: 'circle_invite',
        title: 'Prayer circle invite',
        body: `@${inviter?.username || 'A friend'} invited you to join "${circle.name}".`,
        circleId: circle.id,
        circleName: circle.name,
        fromUserId: currentUserId,
        fromUsername: inviter?.username || '',
        fromName: inviter?.displayName || '',
        read: false,
        createdAt: serverTimestamp()
      }
    );
    setInvitedIds((prev) => {
      const next = new Set(prev);
      next.add(friend.id);
      return next;
    });
  }

  async function handleGenerateLink() {
    setGenerating(true);
    setLinkError('');
    try {
      const ref = await addDoc(collection(db, 'circleInvites'), {
        circleId: circle.id,
        circleName: circle.name,
        invitedBy: currentUserId,
        inviterUsername: inviter?.username || '',
        createdAt: serverTimestamp()
      });
      // HashRouter URL pattern
      const { origin, pathname } = window.location;
      setInviteUrl(`${origin}${pathname}#/invite/${ref.id}`);
    } catch (err) {
      setLinkError(err.message);
    } finally {
      setGenerating(false);
    }
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard may be unavailable; the URL is shown in a read-only input */
    }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="overlay-card invite-card" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="overlay-close"
          onClick={onClose}
          aria-label="Close"
        >
          ×
        </button>
        <h2>Invite to {circle.name} Prayer Circle</h2>
        <p className="muted">
          Send an invite to a friend or share a link anyone can use to join.
        </p>

        <section className="invite-section">
          <h3>Your friends</h3>
          {loadingFriends ? (
            <p className="muted">Loading friends…</p>
          ) : friends.length === 0 ? (
            <p className="muted">
              No friends to invite — either you haven&rsquo;t added any yet or
              all of them are already in this circle.
            </p>
          ) : (
            <ul className="invite-friends">
              {friends.map((f) => {
                const invited = invitedIds.has(f.id);
                return (
                  <li key={f.id}>
                    <span className="person">
                      <Avatar user={f} size={32} />
                      <span>
                        <strong>{f.displayName}</strong>
                        {f.username && (
                          <small className="muted"> · @{f.username}</small>
                        )}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => handleInviteFriend(f)}
                      disabled={invited}
                    >
                      {invited ? 'Invited ✓' : 'Invite'}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="invite-section">
          <h3>Invite link</h3>
          {!inviteUrl ? (
            <button
              type="button"
              onClick={handleGenerateLink}
              disabled={generating}
            >
              {generating ? 'Generating…' : 'Generate link'}
            </button>
          ) : (
            <div className="invite-link-row">
              <input type="text" value={inviteUrl} readOnly onFocus={(e) => e.target.select()} />
              <button type="button" onClick={handleCopy}>
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          )}
          {linkError && <p className="error">{linkError}</p>}
        </section>
      </div>
    </div>
  );
}

function CircleDetailPanel({
  circle,
  members,
  prayers,
  loading,
  currentUserId,
  onClose,
  onPrayerCreated,
  onPrayerPray,
  onPrayerDelete
}) {
  const trackRef = useRef(null);
  const panelRef = useRef(null);
  const dragRef = useRef({ active: false, startX: 0, startScroll: 0, moved: false });
  const owner = members.find((m) => m.id === circle.createdBy);
  const otherMembers = members.filter((m) => m.id !== circle.createdBy);

  // Scroll the panel into view the first time it opens for this circle, so
  // users on small screens see the new content without hunting for it.
  useEffect(() => {
    panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [circle.id]);

  function scrollPrayers(direction) {
    const track = trackRef.current;
    if (!track) return;
    const firstCard = track.querySelector('.prayer-card, .prayer-swipe-card-new');
    const step = firstCard ? firstCard.getBoundingClientRect().width + 12 : 280;
    track.scrollBy({ left: direction * step, behavior: 'smooth' });
  }

  // Mouse/pointer drag to swipe through cards. Native horizontal touch pan
  // already works via overflow-x: auto; this bridges the desktop gap.
  function handleTrackPointerDown(e) {
    // Don't hijack interactions with form controls inside the card.
    if (e.target.closest('button, textarea, input, a, select')) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const track = trackRef.current;
    if (!track) return;
    dragRef.current.active = true;
    dragRef.current.startX = e.clientX;
    dragRef.current.startScroll = track.scrollLeft;
    dragRef.current.moved = false;
    track.classList.add('dragging');
    try {
      track.setPointerCapture(e.pointerId);
    } catch {}
  }
  function handleTrackPointerMove(e) {
    if (!dragRef.current.active) return;
    const track = trackRef.current;
    if (!track) return;
    const dx = e.clientX - dragRef.current.startX;
    if (Math.abs(dx) > 4) dragRef.current.moved = true;
    track.scrollLeft = dragRef.current.startScroll - dx;
  }
  function handleTrackPointerUp(e) {
    if (!dragRef.current.active) return;
    dragRef.current.active = false;
    const track = trackRef.current;
    if (track) {
      track.classList.remove('dragging');
      try {
        track.releasePointerCapture(e.pointerId);
      } catch {}
    }
    // Swallow the click that follows a meaningful drag so cards don't
    // activate when the user was scrolling.
    if (dragRef.current.moved) {
      const suppress = (ev) => {
        ev.stopPropagation();
        ev.preventDefault();
      };
      track?.addEventListener('click', suppress, { capture: true, once: true });
    }
  }

  const hasPrayers = prayers.length > 0;

  return (
    <div
      className="circle-detail-panel"
      ref={panelRef}
      role="region"
      aria-label={`${circle.name} details`}
    >
      <div className="circle-detail-header">
        <div>
          <h2>{circle.name}</h2>
          <p className="muted">
            {members.length} {members.length === 1 ? 'member' : 'members'}
          </p>
        </div>
        <button
          type="button"
          className="circle-detail-close"
          onClick={onClose}
          aria-label="Close details"
        >
          ×
        </button>
      </div>

      {circle.description && (
        <p className="circle-detail-desc">{circle.description}</p>
      )}

      <section className="circle-detail-section">
        <div className="circle-detail-roster-labels">
          <span>Members</span>
          <span>Prayer Leaders</span>
        </div>
        <div className="circle-detail-roster">
          <div className="circle-detail-roster-side circle-detail-roster-members">
            {otherMembers.length > 0 ? (
              otherMembers.map((m) => (
                <MemberCircle key={m.id} user={m} size={56} />
              ))
            ) : (
              <span className="muted circle-detail-roster-empty">
                {loading ? 'Loading…' : 'No other members yet'}
              </span>
            )}
          </div>
          <div className="circle-detail-roster-divider" aria-hidden="true" />
          <div className="circle-detail-roster-side circle-detail-roster-owners">
            {owner ? (
              <MemberCircle key={owner.id} user={owner} size={56} />
            ) : (
              <span className="muted circle-detail-roster-empty">
                {loading ? 'Loading…' : 'Unknown'}
              </span>
            )}
          </div>
        </div>
      </section>

      <section className="circle-detail-section">
        <h3>Prayer requests</h3>
        {loading && !hasPrayers ? (
          <p className="muted">Loading prayers…</p>
        ) : (
          <div className="prayer-swipe">
            {hasPrayers && prayers.length > 1 && (
              <button
                type="button"
                className="prayer-swipe-nav prayer-swipe-prev"
                onClick={() => scrollPrayers(-1)}
                aria-label="Previous prayer"
              >
                ‹
              </button>
            )}
            <div
              className="prayer-swipe-track"
              ref={trackRef}
              onPointerDown={handleTrackPointerDown}
              onPointerMove={handleTrackPointerMove}
              onPointerUp={handleTrackPointerUp}
              onPointerCancel={handleTrackPointerUp}
            >
              {prayers.map((p) => (
                <PrayerCard
                  key={p.id}
                  prayer={p}
                  currentUserId={currentUserId}
                  onPray={() => onPrayerPray(p)}
                  onDelete={() => onPrayerDelete(p)}
                />
              ))}
              <NewPrayerCard
                circle={circle}
                hasExistingPrayers={hasPrayers}
                onCreated={onPrayerCreated}
              />
            </div>
            {hasPrayers && prayers.length > 1 && (
              <button
                type="button"
                className="prayer-swipe-nav prayer-swipe-next"
                onClick={() => scrollPrayers(1)}
                aria-label="Next prayer"
              >
                ›
              </button>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

// Profile circle that reveals the user's display name + handle on hover.
function MemberCircle({ user, size }) {
  const handle = user?.username ? `@${user.username}` : '';
  const name = user?.displayName || user?.username || '—';
  return (
    <div className="member-circle" tabIndex={0} aria-label={handle ? `${name} ${handle}` : name}>
      <Avatar user={user} size={size} />
      <div className="member-circle-tooltip" role="tooltip">
        <strong>{name}</strong>
        {handle && <span>{handle}</span>}
      </div>
    </div>
  );
}

function NewPrayerCard({ circle, hasExistingPrayers, onCreated }) {
  const { user, profile } = useAuth();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError('');
    try {
      const ref = await addDoc(collection(db, 'prayers'), {
        text: trimmed,
        authorId: user.uid,
        authorName: profile?.displayName ?? 'Anonymous',
        authorLocation: profile?.location ?? '',
        authorPhotoURL: profile?.photoURL ?? '',
        authorUsername: profile?.username ?? '',
        visibility: 'circles',
        targetUserId: null,
        targetUsername: '',
        targetName: '',
        circleIds: [circle.id],
        circleNames: [circle.name].filter(Boolean),
        prayedBy: [],
        prayedCount: 0,
        createdAt: serverTimestamp()
      });
      // Optimistically surface the new prayer in the swipe track. The
      // server will eventually fill in the real createdAt timestamp.
      // Mirror every field togglePraying's snapshot reads so praying for
      // this prayer before the page refetches still writes to the book.
      onCreated({
        id: ref.id,
        text: trimmed,
        authorId: user.uid,
        authorName: profile?.displayName ?? '',
        authorLocation: profile?.location ?? '',
        authorPhotoURL: profile?.photoURL ?? '',
        authorUsername: profile?.username ?? '',
        visibility: 'circles',
        targetUserId: null,
        targetUsername: '',
        targetName: '',
        circleIds: [circle.id],
        circleNames: [circle.name].filter(Boolean),
        prayedBy: [],
        prayedCount: 0,
        createdAt: { toDate: () => new Date() }
      });
      setText('');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="prayer-swipe-card-new" onSubmit={handleSubmit}>
      <h4>{hasExistingPrayers ? 'Add a prayer' : 'Share the first prayer'}</h4>
      <p className="muted">
        {hasExistingPrayers
          ? `Post another request to ${circle.name}.`
          : `Be the first to ask ${circle.name} for prayer.`}
      </p>
      <textarea
        rows={4}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="What's on your heart?"
      />
      {error && <p className="error">{error}</p>}
      <button type="submit" disabled={busy || !text.trim()}>
        {busy ? 'Posting…' : 'Post prayer'}
      </button>
    </form>
  );
}
