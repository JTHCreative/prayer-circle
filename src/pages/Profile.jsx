import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';

export default function Profile() {
  const { profile, updateUserProfile } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [location, setLocation] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.displayName || '');
      setLocation(profile.location || '');
    }
  }, [profile]);

  async function handleSave(e) {
    e.preventDefault();
    setError('');
    setStatus('');
    setBusy(true);
    try {
      await updateUserProfile({ displayName, location });
      setStatus('Saved.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <h1>Your profile</h1>
      <form onSubmit={handleSave}>
        <label>
          Display name
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            required
          />
        </label>
        <label>
          General location
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="e.g. San Francisco Bay Area, Los Angeles, Tokyo, Bangladesh"
            maxLength={80}
          />
          <small className="muted">
            Use a general region (city, metro area, or country). Please don't enter a street address.
          </small>
        </label>
        {error && <p className="error">{error}</p>}
        {status && <p className="muted">{status}</p>}
        <button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
      </form>
    </div>
  );
}
