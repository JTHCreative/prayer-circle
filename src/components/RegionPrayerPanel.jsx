import { useEffect, useState } from 'react';
import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  where
} from 'firebase/firestore';
import { db } from '../firebase.js';
import Avatar from './Avatar.jsx';

// Floating panel shown over the globe when a location marker is clicked.
// Lists the public prayer requests that originated from that region.
// The panel owns its own fetch so it can be mounted/unmounted freely as the
// user clicks between regions without the parent needing to manage state.
export default function RegionPrayerPanel({ region, onClose }) {
  const [prayers, setPrayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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
        // Missing composite index is the most common failure mode here.
        // Surface a friendly message; the dev can still see the underlying
        // error in the console.
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
            {prayers.map((p) => (
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
              </li>
            ))}
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
