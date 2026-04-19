import { useCallback, useEffect, useRef, useState } from 'react';
import {
  collection,
  deleteField,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc
} from 'firebase/firestore';
import { db } from '../firebase.js';
import { useAuth } from '../context/AuthContext.jsx';
import PrayerBookCard from './PrayerBookCard.jsx';
import { togglePraying } from '../utils/prayers.js';
import {
  DEFAULT_GRADIENT_KEY,
  GRADIENT_PALETTES
} from '../utils/circleGradients.js';

const GRADIENT_BY_KEY = Object.fromEntries(
  GRADIENT_PALETTES.map((g) => [g.key, g])
);
function gradientForGroup(g) {
  return (
    GRADIENT_BY_KEY[g.gradientKey] ||
    GRADIENT_BY_KEY[DEFAULT_GRADIENT_KEY] ||
    GRADIENT_PALETTES[0]
  );
}
// Border-image + padding-box trick so rounded corners work with a gradient
// border. The first linear-gradient paints the translucent fill; the
// second paints the gradient that shows through the border gap.
function groupBorderStyle(g) {
  const theme = gradientForGroup(g);
  return {
    background:
      'linear-gradient(rgba(245, 240, 255, 0.88), rgba(245, 240, 255, 0.88)) padding-box, ' +
      `linear-gradient(135deg, ${theme.from}, ${theme.to}) border-box`,
    borderColor: 'transparent'
  };
}
function groupLabelStyle(g) {
  const theme = gradientForGroup(g);
  return {
    background:
      'linear-gradient(#fff, #fff) padding-box, ' +
      `linear-gradient(135deg, ${theme.from}, ${theme.to}) border-box`,
    borderColor: 'transparent'
  };
}

const CARD_W = 360;
const CARD_H = 220;
const GROUP_MIN = 80;

const VISIBILITY_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'public', label: 'Public' },
  { value: 'circles', label: 'Circles' },
  { value: 'friend', label: 'Private' }
];

function hashSeed(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}
function tiltFor(id) {
  const raw = (hashSeed(id) % 5) - 2;
  return raw === 0 ? 1 : raw;
}

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

function layoutDocRef(uid) {
  return doc(db, 'users', uid, 'settings', 'prayerBookCanvas');
}

async function loadRemoteLayout(uid) {
  const snap = await getDoc(layoutDocRef(uid));
  if (snap.exists()) return normalizeLayout(snap.data());

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

export default function PrayerBookCanvas({ toolbarExtra = null }) {
  const { user } = useAuth();
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState('move');
  const [visibility, setVisibility] = useState('all');

  const [positions, setPositions] = useState({});
  const [groups, setGroups] = useState([]);
  const [drawingGroup, setDrawingGroup] = useState(null);
  const [viewport, setViewport] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [editingGroup, setEditingGroup] = useState(null);

  const canvasRef = useRef(null);
  const contentRef = useRef(null);
  const cardRefs = useRef({});
  const groupRefs = useRef({});
  const dragRef = useRef(null);
  const drawRef = useRef(null);
  const groupDragRef = useRef(null);
  const resizeRef = useRef(null);
  const panRef = useRef(null);
  const togglingRef = useRef(new Set());
  const layoutReadyRef = useRef(false);
  const saveTimerRef = useRef(null);

  // IDs that just showed up since the last snapshot — drives a one-shot
  // "pop" animation so the user notices when a freshly-prayed card lands on
  // the canvas (e.g. after tapping Pray in the feed sidebar).
  const [poppingIds, setPoppingIds] = useState(() => new Set());
  const knownIdsRef = useRef(null);

  useEffect(() => {
    if (!user?.uid) return;
    knownIdsRef.current = null;
    setLoading(true);
    const q = query(
      collection(db, 'users', user.uid, 'prayerBook'),
      orderBy('addedAt', 'desc')
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows = [];
        snap.forEach((d) => rows.push({ id: d.id, ...d.data() }));
        const ids = new Set(rows.map((r) => r.id));
        // First snapshot just seeds the known-set — no cards should pop on
        // the initial page load, only ones that arrive afterwards.
        if (knownIdsRef.current === null) {
          knownIdsRef.current = ids;
        } else {
          const added = [];
          for (const id of ids) {
            if (!knownIdsRef.current.has(id)) added.push(id);
          }
          knownIdsRef.current = ids;
          if (added.length > 0) {
            setPoppingIds((prev) => {
              const next = new Set(prev);
              for (const id of added) next.add(id);
              return next;
            });
            // Animation is ~600ms; clear the flag a beat later so a re-pray
            // in the same session pops again.
            setTimeout(() => {
              setPoppingIds((prev) => {
                const next = new Set(prev);
                for (const id of added) next.delete(id);
                return next;
              });
            }, 800);
          }
        }
        setEntries(rows);
        setLoading(false);
      },
      (err) => {
        // eslint-disable-next-line no-console
        console.error('Failed to subscribe to prayer book', err);
        setLoading(false);
      }
    );
    return unsub;
  }, [user?.uid]);

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

  const matchesFilter = useCallback(
    (entry) => visibility === 'all' || entry.visibility === visibility,
    [visibility]
  );

  useEffect(() => {
    if (entries.length === 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const needsSeeding = entries.some((e) => !positions[e.id]);
    if (!needsSeeding) return;

    const colW = CARD_W + 24;
    const rowH = CARD_H + 28;
    const cols = Math.max(1, Math.floor((rect.width - 40) / colW));
    const startY = 80;

    setPositions((prev) => {
      const next = { ...prev };
      const taken = new Set();
      for (const p of Object.values(next)) {
        const col = Math.round((p.x - 20) / colW);
        const row = Math.round((p.y - startY) / rowH);
        taken.add(`${col},${row}`);
      }
      for (const e of entries) {
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
  }, [entries, positions]);

  function handleCardPointerDown(e, id) {
    if (mode !== 'move') return;
    if (e.button !== undefined && e.button !== 0) return;
    if (e.target.closest('button')) return;
    const canvas = canvasRef.current;
    const pos = positions[id];
    if (!canvas || !pos) return;
    const rect = canvas.getBoundingClientRect();
    dragRef.current = {
      id,
      offsetX: (e.clientX - rect.left - viewport.x) / zoom - pos.x,
      offsetY: (e.clientY - rect.top - viewport.y) / zoom - pos.y,
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
    const x = (e.clientX - rect.left - viewport.x) / zoom - d.offsetX;
    const y = (e.clientY - rect.top - viewport.y) / zoom - d.offsetY;
    d.moved = true;
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

  function handleCanvasPointerDown(e) {
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
        startX: (e.clientX - rect.left - viewport.x) / zoom,
        startY: (e.clientY - rect.top - viewport.y) / zoom
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
      const cx = (e.clientX - rect.left - viewport.x) / zoom;
      const cy = (e.clientY - rect.top - viewport.y) / zoom;
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
      if (contentRef.current) {
        contentRef.current.style.transform =
          `translate(${nx}px, ${ny}px) scale(${zoom})`;
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
        {
          id: `g_${Date.now()}`,
          name,
          gradientKey: DEFAULT_GRADIENT_KEY,
          ...rect
        }
      ]);
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

  function cardsInsideGroup(g) {
    const ids = [];
    for (const entry of entries) {
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
    if (e.target.closest('.pb-group-label')) return;
    if (e.target.closest('button')) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const startPtX = (e.clientX - rect.left - viewport.x) / zoom;
    const startPtY = (e.clientY - rect.top - viewport.y) / zoom;
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
    const ptX = (e.clientX - rect.left - viewport.x) / zoom;
    const ptY = (e.clientY - rect.top - viewport.y) / zoom;
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

  function handleResizePointerDown(e, g, dir) {
    if (mode !== 'move') return;
    if (e.button !== undefined && e.button !== 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    resizeRef.current = {
      id: g.id,
      dir,
      startPtX: (e.clientX - rect.left - viewport.x) / zoom,
      startPtY: (e.clientY - rect.top - viewport.y) / zoom,
      startX: g.x,
      startY: g.y,
      startW: g.w,
      startH: g.h,
      moved: false
    };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
    e.stopPropagation();
  }

  function handleResizePointerMove(e) {
    const r = resizeRef.current;
    if (!r) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const ptX = (e.clientX - rect.left - viewport.x) / zoom;
    const ptY = (e.clientY - rect.top - viewport.y) / zoom;
    const dx = ptX - r.startPtX;
    const dy = ptY - r.startPtY;
    let x = r.startX;
    let y = r.startY;
    let w = r.startW;
    let h = r.startH;
    if (r.dir.includes('e')) w = Math.max(GROUP_MIN, r.startW + dx);
    if (r.dir.includes('s')) h = Math.max(GROUP_MIN, r.startH + dy);
    if (r.dir.includes('w')) {
      const maxDx = r.startW - GROUP_MIN;
      const ddx = Math.min(dx, maxDx);
      x = r.startX + ddx;
      w = r.startW - ddx;
    }
    if (r.dir.includes('n')) {
      const maxDy = r.startH - GROUP_MIN;
      const ddy = Math.min(dy, maxDy);
      y = r.startY + ddy;
      h = r.startH - ddy;
    }
    r.moved = true;
    r.lastRect = { x, y, w, h };
    const el = groupRefs.current[r.id];
    if (el) {
      el.style.transform = `translate(${x}px, ${y}px)`;
      el.style.width = `${w}px`;
      el.style.height = `${h}px`;
    }
  }

  function handleResizePointerUp(e) {
    const r = resizeRef.current;
    if (!r) return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}
    if (r.moved && r.lastRect) {
      const { id, lastRect } = r;
      setGroups((prev) =>
        prev.map((g) => (g.id === id ? { ...g, ...lastRect } : g))
      );
    }
    resizeRef.current = null;
  }

  function removeGroup(id) {
    setGroups((prev) => prev.filter((g) => g.id !== id));
  }

  function submitGroupEdit() {
    if (!editingGroup) return;
    const name = editingGroup.name.trim();
    if (!name) return;
    const gradientKey = editingGroup.gradientKey || DEFAULT_GRADIENT_KEY;
    setGroups((prev) =>
      prev.map((g) =>
        g.id === editingGroup.id ? { ...g, name, gradientKey } : g
      )
    );
    setEditingGroup(null);
  }

  const ZOOM_MIN = 0.4;
  const ZOOM_MAX = 2.5;

  const zoomRef = useRef(zoom);
  const viewportRef = useRef(viewport);
  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);
  useEffect(() => {
    viewportRef.current = viewport;
  }, [viewport]);

  function zoomAtPoint(nextZoom, anchorX, anchorY) {
    const curZ = zoomRef.current;
    const curV = viewportRef.current;
    const z = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, nextZoom));
    const cx = (anchorX - curV.x) / curZ;
    const cy = (anchorY - curV.y) / curZ;
    const nextV = { x: anchorX - cx * z, y: anchorY - cy * z };
    zoomRef.current = z;
    viewportRef.current = nextV;
    setZoom(z);
    setViewport(nextV);
  }

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    function onWheel(e) {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const ax = e.clientX - rect.left;
      const ay = e.clientY - rect.top;
      const factor = Math.exp(-e.deltaY * 0.0015);
      zoomAtPoint(zoomRef.current * factor, ax, ay);
    }
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  function bumpZoom(factor) {
    const el = canvasRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    zoomAtPoint(zoomRef.current * factor, rect.width / 2, rect.height / 2);
  }
  function resetZoom() {
    zoomRef.current = 1;
    viewportRef.current = { x: 0, y: 0 };
    setZoom(1);
    setViewport({ x: 0, y: 0 });
  }

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
    <>
      <div
        ref={canvasRef}
        className={`pb-canvas mode-${mode}`}
        style={{
          '--pb-dot-x': `${viewport.x}px`,
          '--pb-dot-y': `${viewport.y}px`,
          '--pb-dot-size': `${22 * zoom}px`
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
          <div className="pb-zoom-group" role="group" aria-label="Zoom">
            <button
              type="button"
              className="pb-zoom"
              onClick={() => bumpZoom(1 / 1.2)}
              disabled={zoom <= ZOOM_MIN + 0.001}
              aria-label="Zoom out"
              title="Zoom out"
            >
              −
            </button>
            <button
              type="button"
              className="pb-zoom pb-zoom-reset"
              onClick={resetZoom}
              title="Reset zoom"
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              type="button"
              className="pb-zoom"
              onClick={() => bumpZoom(1.2)}
              disabled={zoom >= ZOOM_MAX - 0.001}
              aria-label="Zoom in"
              title="Zoom in"
            >
              +
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
          {toolbarExtra}
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
          style={{
            transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${zoom})`
          }}
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
                height: g.h,
                ...groupBorderStyle(g)
              }}
              onPointerDown={(e) => handleGroupPointerDown(e, g)}
              onPointerMove={handleGroupPointerMove}
              onPointerUp={handleGroupPointerUp}
              onPointerCancel={handleGroupPointerUp}
            >
              <button
                type="button"
                className="pb-group-label"
                style={groupLabelStyle(g)}
                onClick={(e) => {
                  e.stopPropagation();
                  setEditingGroup({
                    id: g.id,
                    name: g.name,
                    gradientKey: g.gradientKey || DEFAULT_GRADIENT_KEY
                  });
                }}
                title="Edit group"
              >
                {g.name}
              </button>
              <button
                type="button"
                className="pb-group-edit"
                onClick={(e) => {
                  e.stopPropagation();
                  setEditingGroup({
                    id: g.id,
                    name: g.name,
                    gradientKey: g.gradientKey || DEFAULT_GRADIENT_KEY
                  });
                }}
                aria-label={`Edit group ${g.name}`}
                title="Edit group"
              >
                <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
                  <path
                    d="M4 17.25V20h2.75L17.81 8.94l-2.75-2.75L4 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"
                    fill="currentColor"
                  />
                </svg>
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
              {['n', 's', 'e', 'w', 'nw', 'ne', 'sw', 'se'].map((dir) => (
                <div
                  key={dir}
                  className={`pb-group-handle pb-group-handle-${dir}`}
                  onPointerDown={(e) => handleResizePointerDown(e, g, dir)}
                  onPointerMove={handleResizePointerMove}
                  onPointerUp={handleResizePointerUp}
                  onPointerCancel={handleResizePointerUp}
                />
              ))}
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

          {entries.map((entry) => {
            const pos = positions[entry.id];
            if (!pos) return null;
            const tilt = tiltFor(entry.id);
            const muted = !matchesFilter(entry);
            return (
              <div
                key={entry.id}
                ref={(el) => {
                  if (el) cardRefs.current[entry.id] = el;
                  else delete cardRefs.current[entry.id];
                }}
                className={`pb-card-wrap${muted ? ' is-muted' : ''}${poppingIds.has(entry.id) ? ' is-popping' : ''}`}
                aria-hidden={muted || undefined}
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
            : 'Drag cards · drag a group to move its cards · drag empty canvas to pan · scroll to zoom'}
        </div>
      </div>

      {editingGroup && (
        <div className="overlay" onClick={() => setEditingGroup(null)}>
          <div
            className="overlay-card pb-rename-card"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="overlay-close"
              onClick={() => setEditingGroup(null)}
              aria-label="Close"
            >
              ×
            </button>
            <h2>Edit group</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                submitGroupEdit();
              }}
            >
              <label>
                Group name
                <input
                  autoFocus
                  value={editingGroup.name}
                  onChange={(e) =>
                    setEditingGroup((prev) => ({ ...prev, name: e.target.value }))
                  }
                />
              </label>
              <div>
                <p className="label">Border color</p>
                <div className="circle-gradient-picker">
                  {GRADIENT_PALETTES.map((g) => (
                    <button
                      key={g.key}
                      type="button"
                      className={`circle-gradient-option${
                        editingGroup.gradientKey === g.key ? ' selected' : ''
                      }`}
                      style={{
                        background: `radial-gradient(circle at 30% 25%, ${g.from} 0%, ${g.to} 100%)`
                      }}
                      onClick={() =>
                        setEditingGroup((prev) => ({ ...prev, gradientKey: g.key }))
                      }
                      aria-label={`${g.key} gradient`}
                      aria-pressed={editingGroup.gradientKey === g.key}
                    />
                  ))}
                </div>
              </div>
              <div className="overlay-actions">
                <button type="submit" disabled={!editingGroup.name.trim()}>
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
