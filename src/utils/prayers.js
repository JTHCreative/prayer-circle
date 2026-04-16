import {
  arrayRemove,
  arrayUnion,
  deleteDoc,
  doc,
  increment,
  serverTimestamp,
  setDoc,
  updateDoc
} from 'firebase/firestore';
import { db } from '../firebase.js';

// Toggle whether the current user is praying for a prayer.
// When they start praying we:
//   - add their uid to the source prayer's prayedBy + bump prayedCount
//   - write a snapshot to users/{uid}/prayerBook/{prayerId} so they can
//     find it in their personal book even if they later lose access to
//     the source (e.g. leave the circle it was shared to)
// When they stop praying we reverse both writes.
// Returns the new state (true = now praying).
export async function togglePraying(user, prayer) {
  if (!user?.uid) throw new Error('Not signed in');

  const alreadyPraying = (prayer.prayedBy || []).includes(user.uid);
  const prayerRef = doc(db, 'prayers', prayer.id);
  const bookRef = doc(db, 'users', user.uid, 'prayerBook', prayer.id);

  if (alreadyPraying) {
    await Promise.all([
      updateDoc(prayerRef, {
        prayedBy: arrayRemove(user.uid),
        prayedCount: increment(-1)
      }),
      deleteDoc(bookRef)
    ]);
    return false;
  }

  // Firestore rejects the whole write if ANY field is undefined, so every
  // snapshot field gets a hard default here. Optimistic prayer objects
  // (e.g. the one the circle new-prayer card pushes to local state before
  // the Firestore ack) commonly omit some of these.
  const snapshot = {
    prayerId: prayer.id,
    text: prayer.text || '',
    authorId: prayer.authorId || '',
    authorName: prayer.authorName || '',
    authorUsername: prayer.authorUsername || '',
    authorPhotoURL: prayer.authorPhotoURL || '',
    authorLocation: prayer.authorLocation || '',
    visibility: prayer.visibility || 'public',
    circleIds: prayer.circleIds || [],
    circleNames: prayer.circleNames || [],
    targetUserId: prayer.targetUserId ?? null,
    targetUsername: prayer.targetUsername || '',
    targetName: prayer.targetName || '',
    // Preserve the original creation timestamp so the card + filters
    // show "when the prayer was shared", not "when I added it".
    createdAt: prayer.createdAt || null,
    addedAt: serverTimestamp(),
    // So the card's Pray button reads as "Praying" in the book view.
    prayedBy: [user.uid],
    prayedCount: (prayer.prayedCount || 0) + 1
  };

  await Promise.all([
    updateDoc(prayerRef, {
      prayedBy: arrayUnion(user.uid),
      prayedCount: increment(1)
    }),
    setDoc(bookRef, snapshot)
  ]);
  return true;
}
