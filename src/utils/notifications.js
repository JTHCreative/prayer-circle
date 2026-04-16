import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../firebase.js';

// Writes a circle_invite notification into the target user's
// subcollection. Used by both the Circles "Invite friends" modal and the
// Friends "Invite to circle" flow so the payload and notif id stay in
// sync with NotificationsMenu's circle_invite handler.
export async function sendCircleInviteNotification({ toUserId, circle, inviter }) {
  const notifId = `circle-invite-${circle.id}-${inviter.uid}`;
  await setDoc(doc(db, 'users', toUserId, 'notifications', notifId), {
    type: 'circle_invite',
    title: 'Prayer circle invite',
    body: `@${inviter.username || 'A friend'} invited you to join "${circle.name}".`,
    circleId: circle.id,
    circleName: circle.name,
    fromUserId: inviter.uid,
    fromUsername: inviter.username || '',
    fromName: inviter.displayName || '',
    read: false,
    createdAt: serverTimestamp()
  });
}
