import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  arrayRemove,
  collection,
  doc,
  documentId,
  getDoc,
  getDocs,
  orderBy,
  query,
  updateDoc,
  where
} from 'firebase/firestore';
import { db } from '../firebase.js';
import { useAuth } from '../context/AuthContext.jsx';
import Avatar from '../components/Avatar.jsx';
import { chunk } from '../utils/arrays.js';

export default function CircleDetail() {
  const { circleId } = useParams();
  const { user, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [circle, setCircle] = useState(null);
  const [members, setMembers] = useState([]);
  const [prayers, setPrayers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const snap = await getDoc(doc(db, 'circles', circleId));
      if (!snap.exists()) {
        if (!cancelled) setLoading(false);
        return;
      }
      const c = { id: snap.id, ...snap.data() };
      if (cancelled) return;
      setCircle(c);

      // Members
      if (c.members?.length) {
        const all = [];
        for (const group of chunk(c.members, 10)) {
          const msnap = await getDocs(
            query(collection(db, 'users'), where(documentId(), 'in', group))
          );
          msnap.forEach((d) => all.push({ id: d.id, ...d.data() }));
        }
        if (!cancelled) setMembers(all);
      }

      // Prayers for this circle
      const psnap = await getDocs(
        query(
          collection(db, 'prayers'),
          where('circleIds', 'array-contains', circleId),
          orderBy('createdAt', 'desc')
        )
      );
      const ps = [];
      psnap.forEach((d) => ps.push({ id: d.id, ...d.data() }));
      if (!cancelled) setPrayers(ps);

      if (!cancelled) setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [circleId]);

  async function leaveCircle() {
    if (!confirm('Leave this circle?')) return;
    await updateDoc(doc(db, 'circles', circleId), {
      members: arrayRemove(user.uid)
    });
    await updateDoc(doc(db, 'users', user.uid), {
      circleIds: arrayRemove(circleId)
    });
    await refreshProfile();
    navigate('/circles');
  }

  if (loading) return <p className="muted">Loading…</p>;
  if (!circle) return <p className="muted">Circle not found.</p>;

  const isMember = (circle.members || []).includes(user.uid);

  return (
    <div className="stack">
      <div className="card">
        <Link to="/circles">← All circles</Link>
        <h1>{circle.name}</h1>
        {circle.description && <p>{circle.description}</p>}
        <p className="muted">{(circle.members || []).length} members</p>
        {isMember && <button className="danger" onClick={leaveCircle}>Leave circle</button>}
      </div>

      <div className="card">
        <h2>Members</h2>
        <ul className="list">
          {members.map((m) => (
            <li key={m.id} className="list-row">
              <span className="person">
                <Avatar user={m} size={32} />
                <span>
                  {m.displayName}
                  {m.username && <small className="muted"> · @{m.username}</small>}
                  {m.location && <small className="muted"> · 📍 {m.location}</small>}
                </span>
              </span>
              {m.id === circle.createdBy && <span className="pill">Prayer Leader</span>}
            </li>
          ))}
        </ul>
      </div>

      <div className="card">
        <h2>Circle prayers</h2>
        {prayers.length === 0 ? (
          <p className="muted">No prayers shared with this circle yet.</p>
        ) : (
          <ul className="prayer-list">
            {prayers.map((p) => (
              <li key={p.id} className="prayer-card">
                <div className="prayer-card-header">
                  <Avatar
                    user={{
                      displayName: p.authorName,
                      photoURL: p.authorPhotoURL,
                      username: p.authorUsername
                    }}
                    size={40}
                  />
                  <div className="prayer-identity">
                    <span className="prayer-handle">
                      @{p.authorUsername || 'user'}
                    </span>
                    <span className="prayer-name">{p.authorName || 'Someone'}</span>
                  </div>
                  {p.createdAt?.toDate && (
                    <time className="prayer-date">
                      {p.createdAt.toDate().toLocaleString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit'
                      })}
                    </time>
                  )}
                </div>
                <p className="prayer-text">{p.text}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

