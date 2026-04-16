import { useEffect, useMemo, useRef, useState } from 'react';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import { db } from '../firebase.js';
import { useAuth } from '../context/AuthContext.jsx';
import PrayerCard from '../components/PrayerCard.jsx';
import { togglePraying } from '../utils/prayers.js';

// Filter options for the visibility dropdown
const VISIBILITY_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'public', label: 'Public' },
  { value: 'circles', label: 'Circle' },
  { value: 'friend', label: 'Private' }
];

const SORT_OPTIONS = [
  { value: 'addedDesc', label: 'Recently added' },
  { value: 'addedAsc', label: 'Oldest added' },
  { value: 'createdDesc', label: 'Newest prayer' },
  { value: 'createdAsc', label: 'Oldest prayer' }
];

export default function PrayerBook() {
  const { user } = useAuth();
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const togglingRef = useRef(new Set());

  // Filter state
  const [visibility, setVisibility] = useState('all');
  const [circleFilter, setCircleFilter] = useState('all');
  const [friendFilter, setFriendFilter] = useState('all');
  const [sort, setSort] = useState('addedDesc');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

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
  }, [user]);

  // Derive circle & friend filter options from what's actually in the book.
  const circleOptions = useMemo(() => {
    const map = new Map();
    for (const e of entries) {
      if (e.visibility !== 'circles') continue;
      (e.circleIds || []).forEach((id, i) => {
        if (!map.has(id)) map.set(id, (e.circleNames || [])[i] || 'Circle');
      });
    }
    return Array.from(map, ([value, label]) => ({ value, label })).sort(
      (a, b) => a.label.localeCompare(b.label)
    );
  }, [entries]);

  const friendOptions = useMemo(() => {
    const map = new Map();
    for (const e of entries) {
      if (e.visibility !== 'friend') continue;
      // Whichever side of the private thread isn't me
      const otherId = e.targetUserId === user.uid ? e.authorId : e.targetUserId;
      const otherHandle =
        e.targetUserId === user.uid ? e.authorUsername : e.targetUsername;
      const otherName =
        e.targetUserId === user.uid ? e.authorName : e.targetName;
      if (otherId && !map.has(otherId)) {
        map.set(otherId, otherHandle ? `@${otherHandle}` : otherName || 'User');
      }
    }
    return Array.from(map, ([value, label]) => ({ value, label })).sort(
      (a, b) => a.label.localeCompare(b.label)
    );
  }, [entries, user.uid]);

  const filtered = useMemo(() => {
    let list = entries;

    if (visibility !== 'all') list = list.filter((e) => e.visibility === visibility);
    if (visibility === 'circles' && circleFilter !== 'all') {
      list = list.filter((e) => (e.circleIds || []).includes(circleFilter));
    }
    if (visibility === 'friend' && friendFilter !== 'all') {
      list = list.filter((e) => {
        const otherId = e.targetUserId === user.uid ? e.authorId : e.targetUserId;
        return otherId === friendFilter;
      });
    }
    if (startDate) {
      const start = new Date(startDate);
      list = list.filter((e) => {
        const d = e.createdAt?.toDate?.();
        return !d || d >= start;
      });
    }
    if (endDate) {
      const end = new Date(endDate + 'T23:59:59');
      list = list.filter((e) => {
        const d = e.createdAt?.toDate?.();
        return !d || d <= end;
      });
    }

    list = [...list].sort((a, b) => {
      const ta = a.addedAt?.toMillis?.() ?? 0;
      const tb = b.addedAt?.toMillis?.() ?? 0;
      const ca = a.createdAt?.toMillis?.() ?? 0;
      const cb = b.createdAt?.toMillis?.() ?? 0;
      switch (sort) {
        case 'addedAsc': return ta - tb;
        case 'createdDesc': return cb - ca;
        case 'createdAsc': return ca - cb;
        default: return tb - ta; // addedDesc
      }
    });

    return list;
  }, [entries, visibility, circleFilter, friendFilter, startDate, endDate, sort, user.uid]);

  async function handleUnpray(entry) {
    // All entries here are ones the user is praying for, so this always
    // removes from the book. Guard against rapid re-clicks — togglePraying
    // reads prayedBy to decide direction, so a second in-flight call with
    // the same stale snapshot would try to un-pray again and miscount.
    if (togglingRef.current.has(entry.id)) return;
    togglingRef.current.add(entry.id);
    // Drop the row optimistically so the UI reflects the tap immediately.
    setEntries((prev) => prev.filter((e) => e.id !== entry.id));
    try {
      await togglePraying(user, entry);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to remove prayer from book', err);
    } finally {
      togglingRef.current.delete(entry.id);
    }
  }

  function resetFilters() {
    setVisibility('all');
    setCircleFilter('all');
    setFriendFilter('all');
    setStartDate('');
    setEndDate('');
    setSort('addedDesc');
  }

  const hasAnyFilter =
    visibility !== 'all' ||
    circleFilter !== 'all' ||
    friendFilter !== 'all' ||
    startDate ||
    endDate ||
    sort !== 'addedDesc';

  return (
    <div className="stack">
      <div className="card">
        <h1>Prayer Book</h1>
        <p className="muted">
          Every prayer you&rsquo;ve tapped <strong>Pray</strong> for lands
          here. Click <strong>Praying</strong> on a card to remove it.
        </p>
      </div>

      <div className="card">
        <div className="filters-row">
          <label className="filter">
            <span>Sort</span>
            <select value={sort} onChange={(e) => setSort(e.target.value)}>
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>
          <label className="filter">
            <span>Visibility</span>
            <select
              value={visibility}
              onChange={(e) => {
                setVisibility(e.target.value);
                setCircleFilter('all');
                setFriendFilter('all');
              }}
            >
              {VISIBILITY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>
          {visibility === 'circles' && (
            <label className="filter">
              <span>Circle</span>
              <select
                value={circleFilter}
                onChange={(e) => setCircleFilter(e.target.value)}
              >
                <option value="all">Any circle</option>
                {circleOptions.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
          )}
          {visibility === 'friend' && (
            <label className="filter">
              <span>User</span>
              <select
                value={friendFilter}
                onChange={(e) => setFriendFilter(e.target.value)}
              >
                <option value="all">Any user</option>
                {friendOptions.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
          )}
          <label className="filter">
            <span>From</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </label>
          <label className="filter">
            <span>To</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </label>
          {hasAnyFilter && (
            <button type="button" onClick={resetFilters} className="filter-reset">
              Reset
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <p className="muted">Loading your prayer book…</p>
      ) : entries.length === 0 ? (
        <div className="card">
          <p className="muted">
            Your prayer book is empty. Tap <strong>Pray</strong> on any prayer
            in the feed to add it here.
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="card">
          <p className="muted">No prayers match the current filters.</p>
        </div>
      ) : (
        <div className="prayer-list">
          {filtered.map((entry) => (
            <PrayerCard
              key={entry.id}
              prayer={entry}
              currentUserId={user.uid}
              onPray={() => handleUnpray(entry)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
