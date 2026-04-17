import { useMemo, useState } from 'react';
import Avatar from './Avatar.jsx';
import {
  CircleVisibilityIcon,
  LockIcon,
  PrayIcon,
  PublicIcon
} from './icons.jsx';

// A single prayer "card" for the Prayer Book canvas. Visually related to
// <PrayerCard> but the footer button is a solid orange→red "Prayed" pill,
// and tapping it plays an Amen animation before the card is removed from
// the book. The rotation comes from a per-card seed so cards look placed,
// not sorted.
export default function PrayerBookCard({
  prayer,
  currentUserId,
  onUnpray,
  tilt = 0,
  dragHandleProps
}) {
  const [amen, setAmen] = useState(false);

  const visibility = useMemo(() => {
    switch (prayer.visibility) {
      case 'public':
        return { Icon: PublicIcon, label: 'Public' };
      case 'circles': {
        const names = prayer.circleNames || [];
        const main = names[0] || 'Circle';
        const extra = names.length > 1 ? ` +${names.length - 1}` : '';
        return { Icon: CircleVisibilityIcon, label: `${main}${extra}` };
      }
      case 'friend': {
        const isRecipient = prayer.targetUserId === currentUserId;
        const handle = isRecipient
          ? prayer.authorUsername
          : prayer.targetUsername;
        return {
          Icon: LockIcon,
          label: handle ? `@${handle}` : 'Private'
        };
      }
      default:
        return { Icon: LockIcon, label: prayer.visibility || 'Private' };
    }
  }, [prayer, currentUserId]);

  const createdAt = prayer.createdAt?.toDate?.();
  const dateLabel = createdAt ? formatDate(createdAt) : '';

  function handlePrayed(e) {
    e.stopPropagation();
    if (amen) return;
    setAmen(true);
    // Let the animation play before the card disappears.
    setTimeout(() => {
      onUnpray?.();
    }, 700);
  }

  return (
    <article
      className={`pb-card${amen ? ' amen' : ''}`}
      style={{ '--pb-tilt': `${tilt}deg` }}
      {...(dragHandleProps || {})}
    >
      <div className="pb-card-accent" aria-hidden="true" />
      <div className="pb-card-header">
        <Avatar
          user={{
            displayName: prayer.authorName,
            photoURL: prayer.authorPhotoURL,
            username: prayer.authorUsername
          }}
          size={32}
        />
        <div className="pb-card-identity">
          <span className="pb-card-name">
            {prayer.authorName || 'Someone'}
          </span>
          {prayer.authorUsername && (
            <span className="pb-card-handle">@{prayer.authorUsername}</span>
          )}
        </div>
        {dateLabel && <time className="pb-card-date">{dateLabel}</time>}
      </div>

      <p className="pb-card-text">{prayer.text}</p>

      <div className="pb-card-footer">
        <div
          className="pb-card-visibility"
          title={`Visibility: ${visibility.label}`}
        >
          <visibility.Icon size={14} />
          <span>{visibility.label}</span>
        </div>
        <button
          type="button"
          className="pb-prayed-btn"
          onClick={handlePrayed}
          disabled={amen}
          aria-label="Mark as prayed"
        >
          <PrayIcon size={14} />
          <span>Prayed</span>
        </button>
      </div>

      {amen && <AmenBurst />}
    </article>
  );
}

// Overlay burst: "Amen" text floats up, sparkles shoot outward in the
// blue→purple palette. Pure CSS animation — auto-unmounts via parent
// state after ~700ms.
function AmenBurst() {
  const sparks = Array.from({ length: 8 });
  return (
    <div className="pb-amen" aria-hidden="true">
      <span className="pb-amen-text">
        <PrayIcon size={16} />
        Amen
      </span>
      {sparks.map((_, i) => (
        <span
          key={i}
          className="pb-amen-spark"
          style={{ '--i': i, '--angle': `${(360 / sparks.length) * i}deg` }}
        />
      ))}
    </div>
  );
}

function formatDate(date) {
  try {
    return date.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric'
    });
  } catch {
    return '';
  }
}
