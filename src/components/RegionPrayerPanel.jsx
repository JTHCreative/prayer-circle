import { useEffect, useRef, useState } from 'react';
import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  where
} from 'firebase/firestore';
import { db } from '../firebase.js';
import { useAuth } from '../context/AuthContext.jsx';
import { togglePraying } from '../utils/prayers.js';
import Avatar from './Avatar.jsx';
import { PrayIcon } from './icons.jsx';

// Floating panel shown over the globe when a location marker is clicked.
// Lists the public prayer requests that originated from that region, and
// lets the current user add any of them to their prayer book with the Pray
// button on each card.
export default function RegionPrayerPanel({ region, onClose }) {
  const { user } = useAuth();
  const [prayers, setPrayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // Prevent rapid double-taps from stacking the count: togglePraying reads
  // prayer.prayedBy to decide direction, so two concurrent calls with the
  // same stale snapshot would both write +1.
  const togglingRef = useRef(new Set());

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    setPrayers([]);

    async function load() {
      try {
        const q = query(
          collection(db, 'prayers'),
          where('visibility', '==', 'public'),
          where('authorLocation', '==', region),
          orderBy('createdAt', 'desc'),
          limit(25)
        );
        const snap = await getDocs(q);
        const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        if (!cancelled) setPrayers(items);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('Failed to load region prayers', err);
        if (!cancelled) setError('Couldn\u2019t load prayers for this region.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [region]);

  async function onTogglePray(prayer) {
    if (!user?.uid) return;
    if (togglingRef.current.has(prayer.id)) return;
    togglingRef.current.add(prayer.id);
    const wasPraying = (prayer.prayedBy || []).includes(user.uid);
    // Optimistic update so the button flips immediately.
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
      // Roll back on failure.
      setPrayers((prev) =>
        prev.map((p) => {
          if (p.id !== prayer.id) return p;
          const current = p.prayedBy || [];
          const prayedBy = wasPraying
            ? current.includes(user.uid) ? current : [...current, user.uid]
            : current.filter((u) => u !== user.uid);
          return {
            ...p,
            prayedBy,
            prayedCount: Math.max(0, (p.prayedCount || 0) + (wasPraying ? 1 : -1))
          };
        })
      );
    } finally {
      togglingRef.current.delete(prayer.id);
    }
  }

  return (
    <aside
      className="region-prayer-panel"
      role="dialog"
      aria-label={`Public prayer requests from ${region}`}
    >
      <header className="region-prayer-panel__header">
        <div>
          <span className="region-prayer-panel__eyebrow">Region</span>
          <h2 className="region-prayer-panel__title">{region}</h2>
        </div>
        <button
          type="button"
          className="region-prayer-panel__close"
          onClick={onClose}
          aria-label="Close region panel"
          title="Close"
        >
          ×
        </button>
      </header>

      <div className="region-prayer-panel__body">
        {loading ? (
          <p className="region-prayer-panel__status">Loading prayers…</p>
        ) : error ? (
          <p className="region-prayer-panel__status is-error">{error}</p>
        ) : prayers.length === 0 ? (
          <p className="region-prayer-panel__status">
            No public prayer requests from {region} yet.
          </p>
        ) : (
          <ul className="region-prayer-panel__list">
            {prayers.map((p) => {
              const praying = (p.prayedBy || []).includes(user?.uid);
              return (
                <li key={p.id} className="region-prayer-panel__item">
                  <div className="region-prayer-panel__row">
                    <Avatar
                      user={{
                        displayName: p.authorName,
                        photoURL: p.authorPhotoURL,
                        username: p.authorUsername
                      }}
                      size={28}
                    />
                    <div className="region-prayer-panel__meta">
                      <span className="region-prayer-panel__name">
                        {p.authorName || 'Someone'}
                      </span>
                      {p.createdAt?.toDate && (
                        <time className="region-prayer-panel__time">
                          {formatDate(p.createdAt.toDate())}
                        </time>
                      )}
                    </div>
                  </div>
                  <p className="region-prayer-panel__text">{p.text}</p>
                  <div className="region-prayer-panel__footer">
                    <button
                      type="button"
                      className={
                        praying
                          ? 'region-prayer-panel__pray-btn is-praying'
                          : 'region-prayer-panel__pray-btn'
                      }
                      onClick={() => onTogglePray(p)}
                      disabled={!user?.uid}
                      aria-pressed={praying}
                      title={
                        praying
                          ? 'Remove from your prayer book'
                          : 'Add to your prayer book'
                      }
                    >
                      <PrayIcon size={14} />
                      <span>{praying ? 'Praying' : 'Pray'}</span>
                      {p.prayedCount ? (
                        <span className="region-prayer-panel__pray-count">
                          {p.prayedCount}
                        </span>
                      ) : null}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
}

function formatDate(date) {
  try {
    return date.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  } catch {
    return date.toLocaleString();
  }
}
