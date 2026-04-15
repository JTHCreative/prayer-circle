import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getAnalytics, isSupported as analyticsIsSupported } from 'firebase/analytics';

// Firebase web config. Safe to commit to a public repo — these values
// identify the project, they don't authenticate anyone. Security is
// enforced by Firestore rules and Firebase Auth, not by hiding these.
// Docs: https://firebase.google.com/docs/projects/api-keys
const firebaseConfig = {
  apiKey: 'AIzaSyAECEMTo-iWmiJ6Q7NWiSPPT1aYfJ5DfQs',
  authDomain: 'prayer-circle-a9b3d.firebaseapp.com',
  projectId: 'prayer-circle-a9b3d',
  storageBucket: 'prayer-circle-a9b3d.firebasestorage.app',
  messagingSenderId: '662483850965',
  appId: '1:662483850965:web:fae434d738d527ccec745c',
  measurementId: 'G-06DFMNMDRB'
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Analytics only runs in the browser and when the host supports it.
export let analytics = null;
if (typeof window !== 'undefined' && firebaseConfig.measurementId) {
  analyticsIsSupported()
    .then((ok) => {
      if (ok) analytics = getAnalytics(app);
    })
    .catch(() => {});
}
