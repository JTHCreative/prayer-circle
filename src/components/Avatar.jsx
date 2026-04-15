// Round avatar with a photo if provided, otherwise initials on a blue background.
export default function Avatar({ user, size = 32 }) {
  const name = user?.displayName || [user?.firstName, user?.lastName].filter(Boolean).join(' ');
  const initials = getInitials(name || user?.username || '?');
  const style = {
    width: size,
    height: size,
    fontSize: Math.max(11, Math.floor(size * 0.4))
  };

  if (user?.photoURL) {
    return (
      <img
        src={user.photoURL}
        alt={name || 'avatar'}
        className="avatar"
        style={style}
        referrerPolicy="no-referrer"
      />
    );
  }

  return (
    <div className="avatar avatar-initials" style={style} aria-label={name || 'avatar'}>
      {initials}
    </div>
  );
}

function getInitials(source) {
  const parts = source.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() || '').join('') || '?';
}
