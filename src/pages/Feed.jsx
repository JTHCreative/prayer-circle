import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDocs,
  increment,
  limit,
  orderBy,
  query,
  updateDoc,
  where
} from 'firebase/firestore';
import { db } from '../firebase.js';
import { useAuth } from '../context/AuthContext.jsx';
import Avatar from '../components/Avatar.jsx';
import Globe from '../components/Globe.jsx';
import DailyVerseCard from '../components/DailyVerseCard.jsx';

const TABS = [
  { key: 'all', label: 'All' },
  { key: 'public', label: 'Public' },
  { key: 'circles', label: 'My circles' },
  { key: 'friend', label: 'For me' },
  { key: 'mine', label: 'My posts' }
];

export default function Feed() {
  const { user, profile } = useAuth();
  const [tab, setTab] = useState('all');
  const [prayers, setPrayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!profile) return;
      setLoading(true);
      try {
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

        // Each visibility category requires its own query because Firestore rules
        // filter on the document's visibility field at read time.
        if (tab === 'all' || tab === 'public') {
          const q = query(
            collection(db, 'prayers'),
            where('visibility', '==', 'public'),
            orderBy('createdAt', 'desc'),
            limit(50)
          );
          pushAll(await getDocs(q));
        }
        if ((tab === 'all' || tab === 'circles') && profile.circleIds?.length) {
          for (const group of chunk(profile.circleIds, 10)) {
            const q = query(
              collection(db, 'prayers'),
              where('circleIds', 'array-contains-any', group),
              orderBy('createdAt', 'desc'),
              limit(50)
            );
            pushAll(await getDocs(q));
          }
        }
        if (tab === 'all' || tab === 'friend') {
          const q = query(
            collection(db, 'prayers'),
            where('targetUserId', '==', user.uid),
            orderBy('createdAt', 'desc'),
            limit(50)
          );
          pushAll(await getDocs(q));
        }
        if (tab === 'all' || tab === 'mine') {
          const q = query(
            collection(db, 'prayers'),
            where('authorId', '==', user.uid),
            orderBy('createdAt', 'desc'),
            limit(50)
          );
          pushAll(await getDocs(q));
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
    const ref = doc(db, 'prayers', prayer.id);
    const alreadyPrayed = prayer.prayedBy?.includes(user.uid);
    await updateDoc(ref, {
      prayedBy: alreadyPrayed ? arrayRemove(user.uid) : arrayUnion(user.uid),
      prayedCount: increment(alreadyPrayed ? -1 : 1)
    });
    setPrayers((prev) =>
      prev.map((p) =>
        p.id === prayer.id
          ? {
              ...p,
              prayedBy: alreadyPrayed
                ? (p.prayedBy || []).filter((u) => u !== user.uid)
                : [...(p.prayedBy || []), user.uid],
              prayedCount: (p.prayedCount || 0) + (alreadyPrayed ? -1 : 1)
            }
          : p
      )
    );
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
              <Link to="/new" className="btn-primary">+ New prayer</Link>
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
            <ul className="prayer-list">
              {prayers.map((p) => (
                <PrayerCard
                  key={p.id}
                  prayer={p}
                  currentUserId={user.uid}
                  onPray={() => togglePrayed(p)}
                  onDelete={() => handleDelete(p)}
                />
              ))}
            </ul>
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

function PrayerCard({ prayer, currentUserId, onPray, onDelete }) {
  const prayed = prayer.prayedBy?.includes(currentUserId);
  const mine = prayer.authorId === currentUserId;
  const visibilityLabel = useMemo(() => {
    switch (prayer.visibility) {
      case 'public': return 'Public';
      case 'friend': return 'Private (friend)';
      case 'circles': return 'Circle';
      default: return prayer.visibility;
    }
  }, [prayer.visibility]);

  const createdAt = prayer.createdAt?.toDate?.();

  return (
    <li className="prayer-card">
      <div className="prayer-header">
        <Avatar
          user={{
            displayName: prayer.authorName,
            photoURL: prayer.authorPhotoURL,
            username: prayer.authorUsername
          }}
          size={40}
        />
        <div className="prayer-meta">
          <strong>{prayer.authorName || 'Someone'}</strong>
          {prayer.authorUsername && (
            <span className="muted">@{prayer.authorUsername}</span>
          )}
          {prayer.authorLocation && (
            <span className="muted">📍 {prayer.authorLocation}</span>
          )}
          <span className="pill">{visibilityLabel}</span>
          {createdAt && <span className="muted">{createdAt.toLocaleString()}</span>}
        </div>
      </div>
      <p className="prayer-text">{prayer.text}</p>
      <div className="prayer-actions">
        <button onClick={onPray} className={prayed ? 'prayed' : ''}>
          {prayed ? '🙏 Prayed' : '🙏 Pray'} {prayer.prayedCount ? `(${prayer.prayedCount})` : ''}
        </button>
        {mine && <button className="danger" onClick={onDelete}>Delete</button>}
      </div>
    </li>
  );
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
