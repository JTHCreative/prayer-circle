// Round avatar with a photo if provided, otherwise a single letter on a
// blue background — the first letter of the user's first name (falling
// back to display name, username, then a question mark if nothing is set).
export default function Avatar({ user, size = 32 }) {
  const fullName =
    user?.displayName || [user?.firstName, user?.lastName].filter(Boolean).join(' ');
  const firstLetterSource =
    user?.firstName || user?.displayName || user?.username || '';
  const letter = getInitial(firstLetterSource);
  const style = {
    width: size,
    height: size,
    fontSize: Math.max(13, Math.floor(size * 0.5))
  };

  if (user?.photoURL) {
    return (
      <img
        src={user.photoURL}
        alt={fullName || 'avatar'}
        className="avatar"
        style={style}
        referrerPolicy="no-referrer"
        draggable={false}
      />
    );
  }

  return (
    <div className="avatar avatar-initials" style={style} aria-label={fullName || 'avatar'}>
      {letter}
    </div>
  );
}

function getInitial(source) {
  const first = (source || '').trim().charAt(0);
  return first ? first.toUpperCase() : '?';
}
