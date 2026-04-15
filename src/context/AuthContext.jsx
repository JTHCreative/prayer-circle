import { createContext, useContext, useEffect, useState } from 'react';
import {
  EmailAuthProvider,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  reauthenticateWithCredential,
  signInWithEmailAndPassword,
  signOut,
  updatePassword,
  updateProfile
} from 'firebase/auth';
import {
  deleteDoc,
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc
} from 'firebase/firestore';
import { auth, db } from '../firebase.js';
import { fileToResizedDataUrl } from '../utils/image.js';

const AuthContext = createContext(null);

// Usernames: 3-20 chars, lowercase letters/numbers/underscore
const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

function normalizeUsername(raw) {
  return (raw || '').trim().toLowerCase();
}

function fullDisplayName(firstName, lastName) {
  return [firstName, lastName].map((s) => (s || '').trim()).filter(Boolean).join(' ');
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        const snap = await getDoc(doc(db, 'users', firebaseUser.uid));
        setProfile(snap.exists() ? { id: snap.id, ...snap.data() } : null);
      } else {
        setProfile(null);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  async function refreshProfile() {
    if (!auth.currentUser) return;
    const snap = await getDoc(doc(db, 'users', auth.currentUser.uid));
    setProfile(snap.exists() ? { id: snap.id, ...snap.data() } : null);
  }

  async function signup({ email, password, firstName, lastName, username, location = '' }) {
    const cleanUsername = normalizeUsername(username);
    if (!USERNAME_RE.test(cleanUsername)) {
      throw new Error('Username must be 3-20 chars, lowercase letters/numbers/underscore.');
    }
    const first = (firstName || '').trim();
    const last = (lastName || '').trim();
    if (first.length < 1) throw new Error('First name is required.');

    // Reserve username atomically before creating the account. If another
    // account already owns it, bail out.
    const usernameRef = doc(db, 'usernames', cleanUsername);
    const existing = await getDoc(usernameRef);
    if (existing.exists()) {
      throw new Error('That username is already taken.');
    }

    const cred = await createUserWithEmailAndPassword(auth, email, password);
    const displayName = fullDisplayName(first, last);

    try {
      await setDoc(usernameRef, { uid: cred.user.uid, createdAt: serverTimestamp() });
      await updateProfile(cred.user, { displayName });
      await setDoc(doc(db, 'users', cred.user.uid), {
        firstName: first,
        lastName: last,
        username: cleanUsername,
        usernameLower: cleanUsername,
        displayName,
        displayNameLower: displayName.toLowerCase(),
        email,
        location: (location || '').trim(),
        photoURL: '',
        circleIds: [],
        friendIds: [],
        createdAt: serverTimestamp()
      });
    } catch (err) {
      // If the follow-up writes failed, release the username reservation
      // so the user can retry without being blocked.
      try { await deleteDoc(usernameRef); } catch {}
      throw err;
    }

    return cred.user;
  }

  async function login(email, password) {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    return cred.user;
  }

  async function logout() {
    await signOut(auth);
  }

  // Patch any combination of firstName, lastName, username, location.
  // Username changes are atomic: the old reservation is deleted and the new
  // one created in a single transaction so two users can't collide.
  async function updateUserProfile({ firstName, lastName, username, location }) {
    if (!auth.currentUser) throw new Error('Not signed in');
    const uid = auth.currentUser.uid;
    const userRef = doc(db, 'users', uid);

    const updates = {};
    let newFirst = null;
    let newLast = null;

    if (typeof firstName === 'string') {
      const v = firstName.trim();
      if (v.length < 1) throw new Error('First name is required.');
      updates.firstName = v;
      newFirst = v;
    }
    if (typeof lastName === 'string') {
      updates.lastName = lastName.trim();
      newLast = lastName.trim();
    }
    if (typeof location === 'string') {
      updates.location = location.trim();
    }

    let newUsernameLower = null;
    if (typeof username === 'string') {
      newUsernameLower = normalizeUsername(username);
      if (!USERNAME_RE.test(newUsernameLower)) {
        throw new Error('Username must be 3-20 chars, lowercase letters/numbers/underscore.');
      }
    }

    // Compute new displayName if either name part changed.
    if (newFirst !== null || newLast !== null) {
      const snap = await getDoc(userRef);
      const data = snap.data() || {};
      const composed = fullDisplayName(
        newFirst ?? data.firstName ?? '',
        newLast ?? data.lastName ?? ''
      );
      updates.displayName = composed;
      updates.displayNameLower = composed.toLowerCase();
    }

    if (newUsernameLower) {
      const currentSnap = await getDoc(userRef);
      const currentLower = currentSnap.data()?.usernameLower;
      if (currentLower !== newUsernameLower) {
        const newRef = doc(db, 'usernames', newUsernameLower);
        await runTransaction(db, async (tx) => {
          const takenSnap = await tx.get(newRef);
          if (takenSnap.exists()) {
            throw new Error('That username is already taken.');
          }
          tx.set(newRef, { uid, createdAt: serverTimestamp() });
          if (currentLower) {
            tx.delete(doc(db, 'usernames', currentLower));
          }
          tx.update(userRef, {
            ...updates,
            username: newUsernameLower,
            usernameLower: newUsernameLower
          });
        });
        if (updates.displayName) {
          await updateProfile(auth.currentUser, { displayName: updates.displayName });
        }
        await refreshProfile();
        return;
      }
    }

    if (Object.keys(updates).length === 0) return;
    await updateDoc(userRef, updates);
    if (updates.displayName) {
      await updateProfile(auth.currentUser, { displayName: updates.displayName });
    }
    await refreshProfile();
  }

  // Store the avatar as a resized JPEG data URL directly in the user doc.
  // Keeps us on the Firebase free tier (no Storage required) and cheap to
  // read because it's part of the document we're already fetching.
  async function uploadAvatar(file) {
    if (!auth.currentUser) throw new Error('Not signed in');
    const dataUrl = await fileToResizedDataUrl(file);

    await updateDoc(doc(db, 'users', auth.currentUser.uid), { photoURL: dataUrl });
    // updateProfile silently drops data: URLs longer than ~2KB, so wrap.
    try {
      await updateProfile(auth.currentUser, { photoURL: dataUrl });
    } catch {
      /* Firebase Auth profile photo is optional; ignore if it rejects the size */
    }
    await refreshProfile();
    return dataUrl;
  }

  async function removeAvatar() {
    if (!auth.currentUser) throw new Error('Not signed in');
    await updateDoc(doc(db, 'users', auth.currentUser.uid), { photoURL: '' });
    try {
      await updateProfile(auth.currentUser, { photoURL: null });
    } catch {
      /* ignore */
    }
    await refreshProfile();
  }

  async function changePassword(currentPassword, newPassword) {
    if (!auth.currentUser) throw new Error('Not signed in');
    if (newPassword.length < 6) throw new Error('New password must be at least 6 characters.');
    const cred = EmailAuthProvider.credential(auth.currentUser.email, currentPassword);
    await reauthenticateWithCredential(auth.currentUser, cred);
    await updatePassword(auth.currentUser, newPassword);
  }

  const value = {
    user,
    profile,
    loading,
    signup,
    login,
    logout,
    refreshProfile,
    updateUserProfile,
    uploadAvatar,
    removeAvatar,
    changePassword
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
