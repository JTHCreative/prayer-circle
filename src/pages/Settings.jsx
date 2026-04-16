import { useEffect, useRef, useState } from 'react';
import { BIO_MAX, useAuth } from '../context/AuthContext.jsx';
import LocationSelect from '../components/LocationSelect.jsx';
import Avatar from '../components/Avatar.jsx';

export default function Settings() {
  const {
    profile,
    updateUserProfile,
    uploadAvatar,
    removeAvatar,
    changePassword
  } = useAuth();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [username, setUsername] = useState('');
  const [location, setLocation] = useState('');
  const [bio, setBio] = useState('');
  const [profileStatus, setProfileStatus] = useState('');
  const [profileError, setProfileError] = useState('');
  const [profileBusy, setProfileBusy] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordStatus, setPasswordStatus] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordBusy, setPasswordBusy] = useState(false);

  const [avatarStatus, setAvatarStatus] = useState('');
  const [avatarError, setAvatarError] = useState('');
  const [avatarBusy, setAvatarBusy] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (profile) {
      setFirstName(profile.firstName || '');
      setLastName(profile.lastName || '');
      setUsername(profile.username || '');
      setLocation(profile.location || '');
      setBio(profile.bio || '');
    }
  }, [profile]);

  async function handleProfileSave(e) {
    e.preventDefault();
    setProfileError('');
    setProfileStatus('');
    setProfileBusy(true);
    try {
      await updateUserProfile({ firstName, lastName, username, location, bio });
      setProfileStatus('Profile saved.');
    } catch (err) {
      setProfileError(err.message);
    } finally {
      setProfileBusy(false);
    }
  }

  async function handlePasswordChange(e) {
    e.preventDefault();
    setPasswordError('');
    setPasswordStatus('');
    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match.');
      return;
    }
    setPasswordBusy(true);
    try {
      await changePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordStatus('Password updated.');
    } catch (err) {
      if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setPasswordError('Current password is incorrect.');
      } else if (err.code === 'auth/weak-password') {
        setPasswordError('New password is too weak (minimum 6 characters).');
      } else {
        setPasswordError(err.message);
      }
    } finally {
      setPasswordBusy(false);
    }
  }

  async function handleAvatarChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarError('');
    setAvatarStatus('');
    setAvatarBusy(true);
    try {
      await uploadAvatar(file);
      setAvatarStatus('Profile picture updated.');
    } catch (err) {
      setAvatarError(err.message);
    } finally {
      setAvatarBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleRemoveAvatar() {
    setAvatarError('');
    setAvatarStatus('');
    setAvatarBusy(true);
    try {
      await removeAvatar();
      setAvatarStatus('Profile picture removed.');
    } catch (err) {
      setAvatarError(err.message);
    } finally {
      setAvatarBusy(false);
    }
  }

  return (
    <div className="stack">
      <div className="card">
        <h1>Account settings</h1>
        <p className="muted">Manage your profile, login, and personal details.</p>
      </div>

      <div className="card">
        <h2>Profile picture</h2>
        <div className="avatar-row">
          <Avatar user={profile} size={72} />
          <div className="stack-sm">
            <div className="button-row">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={avatarBusy}
              >
                {profile?.photoURL ? 'Change picture' : 'Upload picture'}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleAvatarChange}
                disabled={avatarBusy}
                hidden
              />
              {profile?.photoURL && (
                <button
                  type="button"
                  className="danger"
                  onClick={handleRemoveAvatar}
                  disabled={avatarBusy}
                >
                  Remove
                </button>
              )}
            </div>
            <small className="muted">
              JPG, PNG, or WebP. Images are resized to 256×256 in your browser
              before being saved.
            </small>
            {avatarError && <p className="error">{avatarError}</p>}
            {avatarStatus && <p className="muted">{avatarStatus}</p>}
          </div>
        </div>
      </div>

      <div className="card">
        <h2>Profile details</h2>
        <form onSubmit={handleProfileSave}>
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
              pattern="[a-z0-9_]{3,20}"
              title="3-20 characters: lowercase letters, numbers, underscores"
              required
            />
            <small className="muted">
              3-20 characters: lowercase letters, numbers, underscores.
            </small>
          </label>
          <label>
            General location
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
          {profileError && <p className="error">{profileError}</p>}
          {profileStatus && <p className="muted">{profileStatus}</p>}
          <button type="submit" disabled={profileBusy}>
            {profileBusy ? 'Saving…' : 'Save profile'}
          </button>
        </form>
      </div>

      <div className="card">
        <h2>Change password</h2>
        <form onSubmit={handlePasswordChange}>
          <label>
            Current password
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
            />
          </label>
          <label>
            New password
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              minLength={6}
              required
            />
          </label>
          <label>
            Confirm new password
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              minLength={6}
              required
            />
          </label>
          {passwordError && <p className="error">{passwordError}</p>}
          {passwordStatus && <p className="muted">{passwordStatus}</p>}
          <button type="submit" disabled={passwordBusy}>
            {passwordBusy ? 'Updating…' : 'Update password'}
          </button>
        </form>
      </div>
    </div>
  );
}
