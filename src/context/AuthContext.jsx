import { createContext, useContext, useEffect, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updateProfile
} from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../firebase.js';

const AuthContext = createContext(null);

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

  async function signup(email, password, displayName, location = '') {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(cred.user, { displayName });
    await setDoc(doc(db, 'users', cred.user.uid), {
      displayName,
      displayNameLower: displayName.toLowerCase(),
      email,
      location: location.trim(),
      circleIds: [],
      friendIds: [],
      createdAt: serverTimestamp()
    });
    return cred.user;
  }

  async function updateUserProfile({ displayName, location }) {
    if (!user) throw new Error('Not signed in');
    const updates = {};
    if (typeof displayName === 'string') {
      const trimmed = displayName.trim();
      if (trimmed.length < 2) throw new Error('Display name must be at least 2 characters.');
      updates.displayName = trimmed;
      updates.displayNameLower = trimmed.toLowerCase();
    }
    if (typeof location === 'string') {
      updates.location = location.trim();
    }
    if (Object.keys(updates).length === 0) return;
    await updateDoc(doc(db, 'users', user.uid), updates);
    if (updates.displayName) {
      await updateProfile(user, { displayName: updates.displayName });
    }
    await refreshProfile();
  }

  async function login(email, password) {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    return cred.user;
  }

  async function logout() {
    await signOut(auth);
  }

  async function refreshProfile() {
    if (!user) return;
    const snap = await getDoc(doc(db, 'users', user.uid));
    setProfile(snap.exists() ? { id: snap.id, ...snap.data() } : null);
  }

  const value = { user, profile, loading, signup, login, logout, refreshProfile, updateUserProfile };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
