import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  addDoc,
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

export default function Circles() {
  const { user, profile, refreshProfile } = useAuth();
  const [myCircles, setMyCircles] = useState([]);
  const [discoverable, setDiscoverable] = useState([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  async function load() {
    if (!profile) return;
    // My circles
    if (profile.circleIds?.length) {
      const all = [];
      for (const group of chunk(profile.circleIds, 10)) {
        const snap = await getDocs(
          query(collection(db, 'circles'), where(documentId(), 'in', group))
        );
        snap.forEach((d) => all.push({ id: d.id, ...d.data() }));
      }
      setMyCircles(all);
    } else {
      setMyCircles([]);
    }

    // Discoverable circles: most recent 20 that I'm not in.
    const snap = await getDocs(
      query(collection(db, 'circles'), orderBy('createdAt', 'desc'))
    );
    const all = [];
    snap.forEach((d) => {
      const data = d.data();
      if (!(data.members || []).includes(user.uid)) {
        all.push({ id: d.id, ...data });
      }
    });
    setDiscoverable(all.slice(0, 20));
  }

  async function handleCreate(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setStatus('');
    try {
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
      setName('');
      setDescription('');
      setStatus('Circle created!');
      await refreshProfile();
      load();
    } catch (err) {
      setStatus(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function joinCircle(circle) {
    await updateDoc(doc(db, 'circles', circle.id), {
      members: arrayUnion(user.uid)
    });
    await updateDoc(doc(db, 'users', user.uid), {
      circleIds: arrayUnion(circle.id)
    });
    await refreshProfile();
    load();
  }

  return (
    <div className="stack">
      <div className="card">
        <h2>Create a prayer circle</h2>
        <form onSubmit={handleCreate}>
          <label>
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <label>
            Description
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this circle about?"
            />
          </label>
          {status && <p className="muted">{status}</p>}
          <button type="submit" disabled={busy}>{busy ? 'Creating…' : 'Create circle'}</button>
        </form>
      </div>

      <div className="card">
        <h2>My circles</h2>
        {myCircles.length === 0 ? (
          <p className="muted">You haven't joined any circles yet.</p>
        ) : (
          <ul className="list">
            {myCircles.map((c) => (
              <li key={c.id} className="list-row">
                <span>
                  <Link to={`/circles/${c.id}`}>{c.name}</Link>
                  {c.description && <small className="muted"> — {c.description}</small>}
                </span>
                <span className="muted">{(c.members || []).length} members</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card">
        <h2>Discover circles</h2>
        {discoverable.length === 0 ? (
          <p className="muted">No other circles to show.</p>
        ) : (
          <ul className="list">
            {discoverable.map((c) => (
              <li key={c.id} className="list-row">
                <span>
                  <strong>{c.name}</strong>
                  {c.description && <small className="muted"> — {c.description}</small>}
                </span>
                <button onClick={() => joinCircle(c)}>Join</button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
