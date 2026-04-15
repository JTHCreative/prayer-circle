import { useMemo } from 'react';
import Avatar from './Avatar.jsx';
import {
  CircleVisibilityIcon,
  LockIcon,
  PrayIcon,
  PublicIcon,
  TrashIcon
} from './icons.jsx';

export default function PrayerCard({
  prayer,
  currentUserId,
  onPray,
  onDelete
}) {
  const praying = (prayer.prayedBy || []).includes(currentUserId);
  const mine = prayer.authorId === currentUserId;

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
        return { Icon: LockIcon, label: prayer.visibility };
    }
  }, [prayer, currentUserId]);

  const createdAt = prayer.createdAt?.toDate?.();
  const dateLabel = createdAt ? formatDate(createdAt) : '';

  return (
    <li className="prayer-card">
      <div className="prayer-card-header">
        <Avatar
          user={{
            displayName: prayer.authorName,
            photoURL: prayer.authorPhotoURL,
            username: prayer.authorUsername
          }}
          size={40}
        />
        <div className="prayer-identity">
          <span className="prayer-handle">@{prayer.authorUsername || 'user'}</span>
          <span className="prayer-name">{prayer.authorName || 'Someone'}</span>
        </div>
        <div
          className="prayer-visibility"
          title={`Visibility: ${visibility.label}`}
        >
          <visibility.Icon size={16} />
          <span>{visibility.label}</span>
        </div>
        {dateLabel && <time className="prayer-date">{dateLabel}</time>}
      </div>

      <p className="prayer-text">{prayer.text}</p>

      <div className="prayer-footer">
        <button
          type="button"
          onClick={onPray}
          className={praying ? 'pray-btn prayed' : 'pray-btn'}
        >
          <PrayIcon size={16} />
          <span>{praying ? 'Praying' : 'Pray'}</span>
          {prayer.prayedCount ? (
            <span className="pray-count">{prayer.prayedCount}</span>
          ) : null}
        </button>
        {mine && onDelete && (
          <button
            type="button"
            className="trash-btn"
            onClick={onDelete}
            aria-label="Delete prayer"
            title="Delete prayer"
          >
            <TrashIcon size={16} />
          </button>
        )}
      </div>
    </li>
  );
}

function formatDate(date) {
  try {
    return date.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  } catch {
    return date.toLocaleString();
  }
}
