import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  collection,
  deleteField,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  setDoc,
  updateDoc
} from 'firebase/firestore';
import { db } from '../firebase.js';
import { useAuth } from '../context/AuthContext.jsx';
import PrayerBookCard from '../components/PrayerBookCard.jsx';
import { togglePraying } from '../utils/prayers.js';

// Card footprint in the canvas. Used for auto-placement of new cards and
// for the "is this card inside a group" hit-test.
const CARD_W = 240;
const CARD_H = 150;
// Minimum size a dragged-out group must have to be kept.
const GROUP_MIN = 80;

const VISIBILITY_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'public', label: 'Public' },
  { value: 'circles', label: 'Circles' },
  { value: 'friend', label: 'Private' }
];

// Deterministic "random-feeling" number from a string so each card's tilt
// stays stable across renders without storing it in state.
function hashSeed(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}
function tiltFor(id) {
  // -2 .. +2 degrees, skipping 0 so every card looks "placed".
  const raw = (hashSeed(id) % 5) - 2;
  return raw === 0 ? 1 : raw;
}

// Canvas layout lives on the user's profile doc so it follows them across
// devices. localStorage is kept as a synchronous fallback so the canvas
// renders with the last-known layout on reload before Firestore answers.
const EMPTY_LAYOUT = { positions: {}, groups: [] };

function normalizeLayout(raw) {
  if (!raw || typeof raw !== 'object') return EMPTY_LAYOUT;
  return {
    positions: raw.positions && typeof raw.positions === 'object' ? raw.positions : {},
    groups: Array.isArray(raw.groups) ? raw.groups : []
  };
}

function loadLocalLayout(uid) {
  try {
    const raw = localStorage.getItem(`pb:canvas:${uid}`);
    if (!raw) return EMPTY_LAYOUT;
    return normalizeLayout(JSON.parse(raw));
  } catch {
    return EMPTY_LAYOUT;
  }
}
function saveLocalLayout(uid, layout) {
  try {
    localStorage.setItem(`pb:canvas:${uid}`, JSON.stringify(layout));
  } catch {
    // storage full / disabled — Firestore still has the canonical copy
  }
}

// Canvas lives in a private subcollection — only the owner can read it,
// so one user can't see how another has arranged their book.
function layoutDocRef(uid) {
  return doc(db, 'users', uid, 'settings', 'prayerBookCanvas');
}

async function loadRemoteLayout(uid) {
  const snap = await getDoc(layoutDocRef(uid));
  if (snap.exists()) return normalizeLayout(snap.data());

  // Migration: an earlier build stored the layout on the user profile
  // doc itself, which was readable by any signed-in user. If we find
  // one, copy it into the private subcollection and strip it off the
  // profile so it stops leaking.
  const userSnap = await getDoc(doc(db, 'users', uid));
  if (userSnap.exists() && 'prayerBookCanvas' in userSnap.data()) {
    const migrated = normalizeLayout(userSnap.data().prayerBookCanvas);
    await setDoc(layoutDocRef(uid), migrated);
    await updateDoc(doc(db, 'users', uid), {
      prayerBookCanvas: deleteField()
    });
    return migrated;
  }
  return null;
}

async function saveRemoteLayout(uid, layout) {
  await setDoc(layoutDocRef(uid), layout);
}

export default function PrayerBook() {
  const { user } = useAuth();
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState('move'); // 'move' | 'group'
  const [visibility, setVisibility] = useState('all');

  const [positions, setPositions] = useState({});
  const [groups, setGroups] = useState([]);
  // Group rectangle being drawn in "+ Group" mode (in canvas coords).
  const [drawingGroup, setDrawingGroup] = useState(null);
  // Canvas pan offset — purely ephemeral, not persisted.
  const [viewport, setViewport] = useState({ x: 0, y: 0 });
  // When set, shows a modal to rename the group; also holds the draft name.
  const [renamingGroup, setRenamingGroup] = useState(null);

  const canvasRef = useRef(null);
  const contentRef = useRef(null);
  const cardRefs = useRef({});
  const groupRefs = useRef({});
  const dragRef = useRef(null); // { id, offsetX, offsetY, moved }
  const drawRef = useRef(null); // { startX, startY }
  const groupDragRef = useRef(null); // group + attached card drag state
  const panRef = useRef(null); // canvas pan state
  const togglingRef = useRef(new Set());
  // Blocks the save effect until the initial load has hydrated state —
  // otherwise the first render's empty {positions, groups} would race the
  // remote fetch and overwrite the user's saved layout with nothing.
  const layoutReadyRef = useRef(false);
  const saveTimerRef = useRef(null);

  // Load the user's prayer book entries once per user, same source as the
  // old list view: the users/{uid}/prayerBook subcollection.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!user?.uid) return;
      setLoading(true);
      try {
        const q = query(
          collection(db, 'users', user.uid, 'prayerBook'),
          orderBy('addedAt', 'desc')
        );
        const snap = await getDocs(q);
        const rows = [];
        snap.forEach((d) => rows.push({ id: d.id, ...d.data() }));
        if (!cancelled) setEntries(rows);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [user?.uid]);

  // Rehydrate canvas layout whenever the user changes. Paints localStorage
  // immediately so the canvas doesn't flash empty, then reconciles with
  // Firestore once it answers (Firestore wins — it's the source of truth).
  useEffect(() => {
    if (!user?.uid) return;
    let cancelled = false;
    layoutReadyRef.current = false;
    const local = loadLocalLayout(user.uid);
    setPositions(local.positions);
    setGroups(local.groups);

    (async () => {
      try {
        const remote = await loadRemoteLayout(user.uid);
        if (cancelled) return;
        if (remote) {
          setPositions(remote.positions);
          setGroups(remote.groups);
          saveLocalLayout(user.uid, remote);
        } else if (
          Object.keys(local.positions).length > 0 ||
          local.groups.length > 0
        ) {
          // User has a local layout but nothing on Firestore yet — seed
          // Firestore from local so their next device inherits it.
          await saveRemoteLayout(user.uid, local);
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('Failed to load prayer book layout', err);
      } finally {
        if (!cancelled) layoutReadyRef.current = true;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.uid]);

  // Persist layout. localStorage write is synchronous so reloads are
  // instant; Firestore write is debounced so a drag commits once at rest
  // instead of on every micro-state change.
  useEffect(() => {
    if (!user?.uid || !layoutReadyRef.current) return;
    const layout = { positions, groups };
    saveLocalLayout(user.uid, layout);

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveRemoteLayout(user.uid, layout).catch((err) => {
        // eslint-disable-next-line no-console
        console.error('Failed to save prayer book layout', err);
      });
    }, 600);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [user?.uid, positions, groups]);

  const filtered = useMemo(() => {
    if (visibility === 'all') return entries;
    return entries.filter((e) => e.visibility === visibility);
  }, [entries, visibility]);

  // Seed a sensible position for any card we haven't placed yet. Walks a
  // simple grid inside the canvas and picks the first slot that doesn't
  // already have a card on it.
  useEffect(() => {
    if (filtered.length === 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const needsSeeding = filtered.some((e) => !positions[e.id]);
    if (!needsSeeding) return;

    const colW = CARD_W + 24;
    const rowH = CARD_H + 28;
    const cols = Math.max(1, Math.floor((rect.width - 40) / colW));
    // Reserve room at the top for the floating toolbar so freshly-seeded
    // cards don't land underneath it.
    const startY = 80;

    setPositions((prev) => {
      const next = { ...prev };
      // Taken slots from already-placed cards so fresh ones slot between
      // them rather than landing on top.
      const taken = new Set();
      for (const p of Object.values(next)) {
        const col = Math.round((p.x - 20) / colW);
        const row = Math.round((p.y - startY) / rowH);
        taken.add(`${col},${row}`);
      }
      for (const e of filtered) {
        if (next[e.id]) continue;
        let placed = false;
        for (let row = 0; row < 200 && !placed; row++) {
          for (let col = 0; col < cols && !placed; col++) {
            const key = `${col},${row}`;
            if (taken.has(key)) continue;
            taken.add(key);
            next[e.id] = { x: 20 + col * colW, y: startY + row * rowH };
            placed = true;
          }
        }
      }
      return next;
    });
  }, [filtered, positions]);

  // --- Card drag -----------------------------------------------------------

  function handleCardPointerDown(e, id) {
    if (mode !== 'move') return;
    if (e.button !== undefined && e.button !== 0) return;
    if (e.target.closest('button')) return; // let the Prayed button click
    const canvas = canvasRef.current;
    const pos = positions[id];
    if (!canvas || !pos) return;
    const rect = canvas.getBoundingClientRect();
    dragRef.current = {
      id,
      // Positions live in content space; back out the viewport pan so the
      // card follows the cursor regardless of how far we've panned.
      offsetX: e.clientX - rect.left - viewport.x - pos.x,
      offsetY: e.clientY - rect.top - viewport.y - pos.y,
      moved: false
    };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
    e.currentTarget.classList.add('dragging');
    e.stopPropagation();
  }

  function handleCardPointerMove(e) {
    const d = dragRef.current;
    if (!d || d.id == null) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    // No bounds clamp: with a pannable canvas a card can sit outside the
    // visible window and still be reached by panning to it.
    const x = e.clientX - rect.left - viewport.x - d.offsetX;
    const y = e.clientY - rect.top - viewport.y - d.offsetY;
    d.moved = true;
    // Mutate DOM directly for smooth drag; commit to state on release.
    const el = cardRefs.current[d.id];
    if (el) el.style.transform = `translate(${x}px, ${y}px) rotate(var(--pb-tilt))`;
    d.lastX = x;
    d.lastY = y;
  }

  function handleCardPointerUp(e) {
    const d = dragRef.current;
    if (!d) return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}
    e.currentTarget.classList.remove('dragging');
    if (d.moved && d.lastX != null) {
      setPositions((prev) => ({
        ...prev,
        [d.id]: { x: d.lastX, y: d.lastY }
      }));
    }
    dragRef.current = null;
  }

  // --- Group drawing / canvas panning --------------------------------------

  function handleCanvasPointerDown(e) {
    // Only start on empty canvas — not on a card, group, or toolbar child.
    // The content wrapper (.pb-canvas-content) covers the canvas so a simple
    // target===currentTarget check is no longer enough; we ask "did this
    // pointer-down land on any interactive surface?" instead.
    if (
      e.target.closest('.pb-card-wrap') ||
      e.target.closest('.pb-group') ||
      e.target.closest('.pb-toolbar')
    ) {
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (mode === 'group') {
      drawRef.current = {
        startX: e.clientX - rect.left - viewport.x,
        startY: e.clientY - rect.top - viewport.y
      };
      setDrawingGroup({
        x: drawRef.current.startX,
        y: drawRef.current.startY,
        w: 0,
        h: 0
      });
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {}
    } else if (mode === 'move') {
      if (e.button !== undefined && e.button !== 0) return;
      panRef.current = {
        startClientX: e.clientX,
        startClientY: e.clientY,
        startVX: viewport.x,
        startVY: viewport.y,
        moved: false
      };
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {}
      e.currentTarget.classList.add('panning');
    }
  }

  function handleCanvasPointerMove(e) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (mode === 'group' && drawRef.current) {
      const rect = canvas.getBoundingClientRect();
      const cx = e.clientX - rect.left - viewport.x;
      const cy = e.clientY - rect.top - viewport.y;
      const { startX, startY } = drawRef.current;
      setDrawingGroup({
        x: Math.min(startX, cx),
        y: Math.min(startY, cy),
        w: Math.abs(cx - startX),
        h: Math.abs(cy - startY)
      });
    } else if (mode === 'move' && panRef.current) {
      const p = panRef.current;
      const nx = p.startVX + (e.clientX - p.startClientX);
      const ny = p.startVY + (e.clientY - p.startClientY);
      p.moved = true;
      p.lastX = nx;
      p.lastY = ny;
      // Mutate DOM directly for smooth pan; commit to state on release so
      // subsequent mouse-to-canvas math uses the updated viewport.
      if (contentRef.current) {
        contentRef.current.style.transform = `translate(${nx}px, ${ny}px)`;
      }
      canvas.style.setProperty('--pb-dot-x', `${nx}px`);
      canvas.style.setProperty('--pb-dot-y', `${ny}px`);
    }
  }

  function handleCanvasPointerUp(e) {
    const canvas = canvasRef.current;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}
    if (mode === 'group' && drawRef.current) {
      drawRef.current = null;
      const rect = drawingGroup;
      setDrawingGroup(null);
      if (!rect || rect.w < GROUP_MIN || rect.h < GROUP_MIN) return;
      const name = (window.prompt('Name this group area', 'Group') || '').trim();
      if (!name) return;
      setGroups((prev) => [
        ...prev,
        { id: `g_${Date.now()}`, name, ...rect }
      ]);
      // Flip back to move mode so the user can immediately start arranging
      // cards into the fresh region.
      setMode('move');
    } else if (mode === 'move' && panRef.current) {
      const p = panRef.current;
      if (canvas) canvas.classList.remove('panning');
      if (p.moved && p.lastX != null) {
        setViewport({ x: p.lastX, y: p.lastY });
      }
      panRef.current = null;
    }
  }

  // --- Group drag (moves the region + every card inside it) ---------------

  function cardsInsideGroup(g) {
    const ids = [];
    for (const entry of filtered) {
      const p = positions[entry.id];
      if (!p) continue;
      const cx = p.x + CARD_W / 2;
      const cy = p.y + CARD_H / 2;
      if (cx >= g.x && cx <= g.x + g.w && cy >= g.y && cy <= g.y + g.h) {
        ids.push(entry.id);
      }
    }
    return ids;
  }

  function handleGroupPointerDown(e, g) {
    if (mode !== 'move') return;
    if (e.button !== undefined && e.button !== 0) return;
    // Clicks on interactive children (label = rename, × = remove) have their
    // own behavior — don't swallow them into a drag.
    if (e.target.closest('.pb-group-label')) return;
    if (e.target.closest('button')) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const startPtX = e.clientX - rect.left - viewport.x;
    const startPtY = e.clientY - rect.top - viewport.y;
    const contained = cardsInsideGroup(g);
    const cardStarts = {};
    for (const id of contained) cardStarts[id] = { ...positions[id] };
    groupDragRef.current = {
      id: g.id,
      startGX: g.x,
      startGY: g.y,
      startPtX,
      startPtY,
      cardStarts,
      moved: false
    };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
    e.currentTarget.classList.add('dragging');
    e.stopPropagation();
  }

  function handleGroupPointerMove(e) {
    const d = groupDragRef.current;
    if (!d) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const ptX = e.clientX - rect.left - viewport.x;
    const ptY = e.clientY - rect.top - viewport.y;
    const dx = ptX - d.startPtX;
    const dy = ptY - d.startPtY;
    d.moved = true;
    d.lastDx = dx;
    d.lastDy = dy;
    const groupEl = groupRefs.current[d.id];
    if (groupEl) {
      groupEl.style.transform = `translate(${d.startGX + dx}px, ${d.startGY + dy}px)`;
    }
    for (const [cid, cpos] of Object.entries(d.cardStarts)) {
      const cel = cardRefs.current[cid];
      if (cel) {
        cel.style.transform = `translate(${cpos.x + dx}px, ${cpos.y + dy}px) rotate(var(--pb-tilt))`;
      }
    }
  }

  function handleGroupPointerUp(e) {
    const d = groupDragRef.current;
    if (!d) return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}
    e.currentTarget.classList.remove('dragging');
    if (d.moved && d.lastDx != null && (d.lastDx !== 0 || d.lastDy !== 0)) {
      const { lastDx: dx, lastDy: dy, cardStarts, startGX, startGY, id } = d;
      setGroups((prev) =>
        prev.map((g) => (g.id === id ? { ...g, x: startGX + dx, y: startGY + dy } : g))
      );
      setPositions((prev) => {
        const next = { ...prev };
        for (const [cid, cpos] of Object.entries(cardStarts)) {
          next[cid] = { x: cpos.x + dx, y: cpos.y + dy };
        }
        return next;
      });
    }
    groupDragRef.current = null;
  }

  function removeGroup(id) {
    setGroups((prev) => prev.filter((g) => g.id !== id));
  }

  function submitRename() {
    if (!renamingGroup) return;
    const name = renamingGroup.name.trim();
    if (!name) return;
    setGroups((prev) =>
      prev.map((g) => (g.id === renamingGroup.id ? { ...g, name } : g))
    );
    setRenamingGroup(null);
  }

  // --- Unpray (from Amen animation) ---------------------------------------

  const handleUnpray = useCallback(
    async (entry) => {
      if (togglingRef.current.has(entry.id)) return;
      togglingRef.current.add(entry.id);
      setEntries((prev) => prev.filter((e) => e.id !== entry.id));
      setPositions((prev) => {
        const next = { ...prev };
        delete next[entry.id];
        return next;
      });
      try {
        await togglePraying(user, entry);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('Failed to remove prayer from book', err);
      } finally {
        togglingRef.current.delete(entry.id);
      }
    },
    [user]
  );

  return (
    <div className="circle-universe">
      <div className="circle-universe-header">
        <div>
          <h1>Prayer Book</h1>
          <p className="muted">
            Every prayer you&rsquo;re praying for, laid out like a table.
            Drag to arrange, draw a group to cluster them, and tap{' '}
            <strong>Prayed</strong> when you&rsquo;re done.
          </p>
        </div>
      </div>

      <div
        ref={canvasRef}
        className={`pb-canvas mode-${mode}`}
        style={{
          '--pb-dot-x': `${viewport.x}px`,
          '--pb-dot-y': `${viewport.y}px`
        }}
        onPointerDown={handleCanvasPointerDown}
        onPointerMove={handleCanvasPointerMove}
        onPointerUp={handleCanvasPointerUp}
        onPointerCancel={handleCanvasPointerUp}
      >
        <div className="pb-toolbar">
          <div className="pb-mode-group" role="group" aria-label="Canvas mode">
            <button
              type="button"
              className={`pb-mode${mode === 'move' ? ' active' : ''}`}
              onClick={() => setMode('move')}
            >
              Move
            </button>
            <button
              type="button"
              className={`pb-mode${mode === 'group' ? ' active' : ''}`}
              onClick={() => setMode('group')}
            >
              + Group area
            </button>
          </div>
          <div className="pb-filter-group" role="group" aria-label="Visibility filter">
            {VISIBILITY_FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                className={`pb-filter${visibility === f.value ? ' active' : ''}`}
                onClick={() => setVisibility(f.value)}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {loading && (
          <p className="muted center-abs">Loading your prayer book…</p>
        )}
        {!loading && entries.length === 0 && (
          <p className="muted center-abs">
            Your prayer book is empty. Tap <strong>Pray</strong> on any
            prayer in the feed to add it here.
          </p>
        )}

        <div
          ref={contentRef}
          className="pb-canvas-content"
          style={{ transform: `translate(${viewport.x}px, ${viewport.y}px)` }}
        >
          {groups.map((g) => (
            <div
              key={g.id}
              ref={(el) => {
                if (el) groupRefs.current[g.id] = el;
                else delete groupRefs.current[g.id];
              }}
              className="pb-group"
              style={{
                transform: `translate(${g.x}px, ${g.y}px)`,
                width: g.w,
                height: g.h
              }}
              onPointerDown={(e) => handleGroupPointerDown(e, g)}
              onPointerMove={handleGroupPointerMove}
              onPointerUp={handleGroupPointerUp}
              onPointerCancel={handleGroupPointerUp}
            >
              <button
                type="button"
                className="pb-group-label"
                onClick={(e) => {
                  e.stopPropagation();
                  setRenamingGroup({ id: g.id, name: g.name });
                }}
                title="Rename group"
              >
                {g.name}
              </button>
              <button
                type="button"
                className="pb-group-remove"
                onClick={(e) => {
                  e.stopPropagation();
                  removeGroup(g.id);
                }}
                aria-label={`Remove group ${g.name}`}
                title="Remove group"
              >
                ×
              </button>
            </div>
          ))}

          {drawingGroup && (
            <div
              className="pb-group pb-group-draft"
              style={{
                transform: `translate(${drawingGroup.x}px, ${drawingGroup.y}px)`,
                width: drawingGroup.w,
                height: drawingGroup.h
              }}
            />
          )}

          {filtered.map((entry) => {
            const pos = positions[entry.id];
            if (!pos) return null;
            const tilt = tiltFor(entry.id);
            return (
              <div
                key={entry.id}
                ref={(el) => {
                  if (el) cardRefs.current[entry.id] = el;
                  else delete cardRefs.current[entry.id];
                }}
                className="pb-card-wrap"
                style={{
                  transform: `translate(${pos.x}px, ${pos.y}px) rotate(${tilt}deg)`,
                  '--pb-tilt': `${tilt}deg`
                }}
                onPointerDown={(e) => handleCardPointerDown(e, entry.id)}
                onPointerMove={handleCardPointerMove}
                onPointerUp={handleCardPointerUp}
                onPointerCancel={handleCardPointerUp}
              >
                <PrayerBookCard
                  prayer={entry}
                  currentUserId={user.uid}
                  tilt={0}
                  onUnpray={() => handleUnpray(entry)}
                />
              </div>
            );
          })}
        </div>

        <div className="pb-canvas-hint" aria-hidden="true">
          {mode === 'group'
            ? 'Drag on empty canvas to draw a group area'
            : 'Drag cards · drag a group to move its cards with it · drag empty canvas to pan'}
        </div>
      </div>

      {renamingGroup && (
        <div className="overlay" onClick={() => setRenamingGroup(null)}>
          <div
            className="overlay-card pb-rename-card"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="overlay-close"
              onClick={() => setRenamingGroup(null)}
              aria-label="Close"
            >
              ×
            </button>
            <h2>Rename group</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                submitRename();
              }}
            >
              <label>
                Group name
                <input
                  autoFocus
                  value={renamingGroup.name}
                  onChange={(e) =>
                    setRenamingGroup((prev) => ({ ...prev, name: e.target.value }))
                  }
                />
              </label>
              <div className="overlay-actions">
                <button type="submit" disabled={!renamingGroup.name.trim()}>
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
