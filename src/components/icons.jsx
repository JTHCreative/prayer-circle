// Lightweight inline stroke SVG icons. All inherit currentColor via
// stroke="currentColor" so they pick up the surrounding text color.
// Default size: 18px. Override via the `size` prop on each icon.

function Svg({ size = 18, children, label, className }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? 'img' : 'presentation'}
    >
      {children}
    </svg>
  );
}

// Two people — used for "public" visibility
export function PublicIcon(props) {
  return (
    <Svg {...props}>
      <circle cx="9" cy="8" r="3.25" />
      <path d="M3.5 19c.7-2.8 3-4.5 5.5-4.5s4.8 1.7 5.5 4.5" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M15 14.5c2.2 0 4.3 1.3 5 3.5" />
    </Svg>
  );
}

// Two overlapping circles — used for "circle" visibility
export function CircleVisibilityIcon(props) {
  return (
    <Svg {...props}>
      <circle cx="9" cy="12" r="5" />
      <circle cx="15" cy="12" r="5" />
    </Svg>
  );
}

// Padlock — used for private/friend visibility
export function LockIcon(props) {
  return (
    <Svg {...props}>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </Svg>
  );
}

// Trash can — used for delete
export function TrashIcon(props) {
  return (
    <Svg {...props}>
      <path d="M4 7h16" />
      <path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
      <path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" />
      <path d="M10 11v6M14 11v6" />
    </Svg>
  );
}

// Bell — used for the notifications button in the top bar
export function BellIcon(props) {
  return (
    <Svg {...props}>
      <path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2.5H4.5L6 16z" />
      <path d="M10 19.5a2 2 0 0 0 4 0" />
    </Svg>
  );
}

// Open book — used for the Prayer Book nav link
export function BookIcon(props) {
  return (
    <Svg {...props}>
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v14H6.5A2.5 2.5 0 0 0 4 19.5V5.5z" />
      <path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20" />
      <path d="M12 7v10" opacity="0.6" />
    </Svg>
  );
}

// Praying hands — Phosphor Icons (regular weight), MIT licensed.
// Source: https://github.com/phosphor-icons/core/blob/main/raw/regular/hands-praying.svg
export function PrayIcon({ size = 18, label, className }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 256 256"
      fill="none"
      stroke="currentColor"
      strokeWidth="16"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? 'img' : 'presentation'}
    >
      <path d="M141.78,16h0A13.77,13.77,0,0,1,155,25.78L192,148l20.27,20.27-45,43-29.94-29.94A32,32,0,0,1,128,158.75v-129A13.78,13.78,0,0,1,141.78,16Z" />
      <path d="M167.31,211.31l18.35,18.35a8,8,0,0,0,11.31,0L229.66,197a8,8,0,0,0,0-11.31l-18.35-18.35" />
      <path d="M118.63,181.37,88.69,211.31l-44-44L64,148,101,25.78A13.77,13.77,0,0,1,114.22,16h0A13.78,13.78,0,0,1,128,29.78v129A32,32,0,0,1,118.63,181.37Z" />
      <path d="M44.69,167.31,26.34,185.66a8,8,0,0,0,0,11.31L59,229.66a8,8,0,0,0,11.31,0l18.35-18.35" />
    </svg>
  );
}
