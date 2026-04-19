import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BIO_MAX, useAuth } from '../context/AuthContext.jsx';
import LocationSelect from '../components/LocationSelect.jsx';
import logoUrl from '../assets/prayer-circle-logo-full.png';

export default function Signup() {
  const { signup } = useAuth();
  const navigate = useNavigate();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [username, setUsername] = useState('');
  const [location, setLocation] = useState('');
  const [bio, setBio] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await signup({
        email,
        password,
        firstName,
        lastName,
        username,
        location,
        bio
      });
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-card">
      <div className="auth-brand">
        <img src={logoUrl} alt="Prayer Circle" className="auth-logo" />
        <p className="auth-tagline">Create your account and join the circle.</p>
      </div>
      <form onSubmit={handleSubmit}>
        <div className="form-row">
          <label>
            First name
            <input value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
          </label>
          <label>
            Last name
            <input value={lastName} onChange={(e) => setLastName(e.target.value)} />
          </label>
        </div>
        <label>
          Username
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value.toLowerCase())}
            placeholder="e.g. prayerful_soul"
            pattern="[a-z0-9_]{3,20}"
            title="3-20 characters: lowercase letters, numbers, underscores"
            required
          />
          <small className="muted">
            3-20 characters: lowercase letters, numbers, underscores.
          </small>
        </label>
        <label>
          General location <span className="muted">(optional)</span>
          <LocationSelect
            value={location}
            onChange={setLocation}
            placeholder="Select a city or region"
          />
        </label>
        <label>
          About you <span className="muted">(optional)</span>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            maxLength={BIO_MAX}
            rows={3}
            placeholder="A sentence or two others will see on your profile card."
          />
          <small className="muted">
            {bio.length}/{BIO_MAX} characters.
          </small>
        </label>
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label>
          Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} required />
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={busy}>{busy ? 'Creating…' : 'Create account'}</button>
      </form>
      <p>Have an account? <Link to="/login">Log in</Link></p>
    </div>
  );
}
