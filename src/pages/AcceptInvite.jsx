import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  arrayUnion,
  doc,
  getDoc,
  updateDoc
} from 'firebase/firestore';
import { db } from '../firebase.js';
import { useAuth } from '../context/AuthContext.jsx';

export default function AcceptInvite() {
  const { code } = useParams();
  const { user, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [invite, setInvite] = useState(null);
  const [circle, setCircle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [joining, setJoining] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError('');
      try {
        const inviteSnap = await getDoc(doc(db, 'circleInvites', code));
        if (!inviteSnap.exists()) {
          if (!cancelled) setError('This invite link is invalid or has expired.');
          return;
        }
        const inviteData = { id: inviteSnap.id, ...inviteSnap.data() };
        const circleSnap = await getDoc(doc(db, 'circles', inviteData.circleId));
        if (!circleSnap.exists()) {
          if (!cancelled) setError('This circle no longer exists.');
          return;
        }
        if (cancelled) return;
        setInvite(inviteData);
        setCircle({ id: circleSnap.id, ...circleSnap.data() });
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [code]);

  const alreadyMember = !!(
    circle && user && (circle.members || []).includes(user.uid)
  );

  async function handleAccept() {
    if (!circle || !user) return;
    setJoining(true);
    try {
      await updateDoc(doc(db, 'circles', circle.id), {
        members: arrayUnion(user.uid)
      });
      await updateDoc(doc(db, 'users', user.uid), {
        circleIds: arrayUnion(circle.id)
      });
      await refreshProfile();
      setDone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setJoining(false);
    }
  }

  if (loading) {
    return (
      <div className="card">
        <p className="muted">Loading invite…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card">
        <h1>Invite Unavailable</h1>
        <p className="muted">{error}</p>
        <Link to="/circles">Back to circles</Link>
      </div>
    );
  }

  if (done || alreadyMember) {
    return (
      <div className="card">
        <h1>You&rsquo;re in!</h1>
        <p className="muted">
          Welcome to <strong>{circle.name}</strong>.
        </p>
        <div className="overlay-actions">
          <button type="button" onClick={() => navigate('/circles')}>
            View Circles
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <h1>Join {circle.name}?</h1>
      {circle.description && <p>{circle.description}</p>}
      <p className="muted">
        {(circle.members || []).length}{' '}
        {(circle.members || []).length === 1 ? 'member' : 'members'}
        {invite?.inviterUsername && (
          <> · Invited by @{invite.inviterUsername}</>
        )}
      </p>
      <div className="overlay-actions">
        <button type="button" onClick={handleAccept} disabled={joining}>
          {joining ? 'Joining…' : 'Join circle'}
        </button>
      </div>
    </div>
  );
}
