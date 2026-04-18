import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  where
} from 'firebase/firestore';
import { db } from '../firebase.js';
import { useAuth } from '../context/AuthContext.jsx';
import Globe from '../components/Globe.jsx';
import DailyVerseCard from '../components/DailyVerseCard.jsx';
import PrayerCard from '../components/PrayerCard.jsx';
import { togglePraying } from '../utils/prayers.js';
import { chunk } from '../utils/arrays.js';

const TABS = [
  { key: 'all', label: 'All' },
  { key: 'public', label: 'Public' },
  { key: 'circles', label: 'My circles' },
  { key: 'friend', label: 'Private' },
  { key: 'mine', label: 'My posts' }
];

export default function Feed() {
  const { user, profile } = useAuth();
  const [tab, setTab] = useState('all');
  const [prayers, setPrayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(false);
  const togglingRef = useRef(new Set());

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!profile) return;
      setLoading(true);
      const results = [];
      const seen = new Set();
      const pushAll = (snap) => {
        snap.forEach((d) => {
          if (!seen.has(d.id)) {
            seen.add(d.id);
            results.push({ id: d.id, ...d.data() });
          }
        });
      };
      // Run a single query in isolation: a permission-denied or missing
      // index in one branch shouldn't blow away all the results from the
      // others. Logs the error so the cause is visible in the console.
      const safeRun = async (label, fn) => {
        try {
          await fn();
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error(`[Feed] ${label} query failed`, err);
        }
      };

      try {
        // Each visibility category requires its own query because Firestore rules
        // filter on the document's visibility field at read time.
        if (tab === 'all' || tab === 'public') {
          await safeRun('public', async () => {
            const q = query(
              collection(db, 'prayers'),
              where('visibility', '==', 'public'),
              orderBy('createdAt', 'desc'),
              limit(50)
            );
            pushAll(await getDocs(q));
          });
        }
        if ((tab === 'all' || tab === 'circles') && profile.circleIds?.length) {
          await safeRun('circles', async () => {
            const snaps = await Promise.all(
              chunk(profile.circleIds, 10).map((group) =>
                getDocs(
                  query(
                    collection(db, 'prayers'),
                    // visibility filter is required by the security rules:
                    // without it, any non-circles doc whose circleIds happen
                    // to overlap the user's circles would fail the rule and
                    // Firestore rejects the whole query ("Missing or
                    // insufficient permissions").
                    where('visibility', '==', 'circles'),
                    where('circleIds', 'array-contains-any', group),
                    orderBy('createdAt', 'desc'),
                    limit(50)
                  )
                )
              )
            );
            snaps.forEach(pushAll);
          });
        }
        // My-circles safety net: also include the user's own circles
        // prayers so they always see their post even if profile.circleIds
        // hasn't refreshed to include the circle they shared to.
        if (tab === 'circles') {
          await safeRun('circles-own', async () => {
            const q = query(
              collection(db, 'prayers'),
              where('authorId', '==', user.uid),
              orderBy('createdAt', 'desc'),
              limit(50)
            );
            const snap = await getDocs(q);
            snap.forEach((d) => {
              const data = d.data();
              if (data.visibility === 'circles' && !seen.has(d.id)) {
                seen.add(d.id);
                results.push({ id: d.id, ...data });
              }
            });
          });
        }
        if (tab === 'all' || tab === 'friend') {
          await safeRun('friend', async () => {
            const q = query(
              collection(db, 'prayers'),
              // Match the rule's friend branch exactly, same reason as
              // above — without this filter the query can scan docs the
              // current user can't read and Firestore denies the whole
              // query.
              where('visibility', '==', 'friend'),
              where('targetUserId', '==', user.uid),
              orderBy('createdAt', 'desc'),
              limit(50)
            );
            pushAll(await getDocs(q));
          });
        }
        // Private-tab safety net: also include private prayers the user
        // authored (they're the sender, not the recipient, so the
        // targetUserId query above misses them). Reuses the existing
        // [authorId, createdAt] composite index and filters client-side
        // so we don't need a new visibility+authorId index.
        if (tab === 'friend') {
          await safeRun('friend-own', async () => {
            const q = query(
              collection(db, 'prayers'),
              where('authorId', '==', user.uid),
              orderBy('createdAt', 'desc'),
              limit(50)
            );
            const snap = await getDocs(q);
            snap.forEach((d) => {
              const data = d.data();
              if (data.visibility === 'friend' && !seen.has(d.id)) {
                seen.add(d.id);
                results.push({ id: d.id, ...data });
              }
            });
          });
        }
        if (tab === 'all' || tab === 'mine') {
          await safeRun('mine', async () => {
            const q = query(
              collection(db, 'prayers'),
              where('authorId', '==', user.uid),
              orderBy('createdAt', 'desc'),
              limit(50)
            );
            pushAll(await getDocs(q));
          });
        }

        results.sort((a, b) => {
          const ta = a.createdAt?.toMillis?.() ?? 0;
          const tb = b.createdAt?.toMillis?.() ?? 0;
          return tb - ta;
        });
        if (!cancelled) setPrayers(results);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [tab, user, profile]);

  async function togglePrayed(prayer) {
    // Drop rapid re-clicks on the same prayer: togglePraying reads
    // prayer.prayedBy to decide direction, so concurrent calls with the
    // same stale snapshot would all write +1 and stack the count.
    if (togglingRef.current.has(prayer.id)) return;
    togglingRef.current.add(prayer.id);
    const wasPraying = (prayer.prayedBy || []).includes(user.uid);
    // Update UI before the network round-trip so the button flips
    // immediately and the next render's prayer prop already has the new
    // state (which is what the next onPray closure will capture).
    setPrayers((prev) =>
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

  async function handleDelete(prayer) {
    if (!confirm('Delete this prayer?')) return;
    await deleteDoc(doc(db, 'prayers', prayer.id));
    setPrayers((prev) => prev.filter((p) => p.id !== prayer.id));
  }

  return (
    <div className="home-split">
      <aside className={`feed-pane${collapsed ? ' collapsed' : ''}`}>
        <button
          type="button"
          className="sidebar-toggle"
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? 'Expand prayer feed' : 'Collapse prayer feed'}
          title={collapsed ? 'Expand prayer feed' : 'Collapse prayer feed'}
        >
          <span className="sidebar-toggle-arrow">{collapsed ? '›' : '‹'}</span>
        </button>
        <div className="feed-scroll" aria-hidden={collapsed}>
          <DailyVerseCard />
          <div className="feed-header">
            <h1>Prayer Feed</h1>
            <div className="feed-header-actions">
              <Link to="/new" className="btn-primary">+ New Prayer</Link>
            </div>
          </div>
          <div className="tabs">
            {TABS.map((t) => (
              <button
                key={t.key}
                className={tab === t.key ? 'tab active' : 'tab'}
                onClick={() => setTab(t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>

          {loading ? (
            <p className="muted">Loading prayers…</p>
          ) : prayers.length === 0 ? (
            <p className="muted">No prayers here yet. <Link to="/new">Share one?</Link></p>
          ) : (
            <div className="prayer-list">
              {prayers.map((p) => (
                <PrayerCard
                  key={p.id}
                  prayer={p}
                  currentUserId={user.uid}
                  onPray={() => togglePrayed(p)}
                  onDelete={() => handleDelete(p)}
                />
              ))}
            </div>
          )}
        </div>
      </aside>

      <section className="globe-pane" aria-label="Interactive globe">
        <Globe />
        <div className="globe-caption">
          <span>🌍 Drag the globe to spin it</span>
        </div>
      </section>
    </div>
  );
}

