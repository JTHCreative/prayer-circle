// Flat single-color icon set for prayer circles. Each icon inherits color
// via currentColor, so it renders white when used inside the bubble (which
// sets `color: #fff`) and adopts the picker button's color in the modal.

function makeIcon(content) {
  return function CircleIconSvg({ size = 18, className }) {
    return (
      <svg
        className={className}
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden="true"
      >
        {content}
      </svg>
    );
  };
}

const ICONS = {
  cross: makeIcon(<path d="M10 2h4v7h7v4h-7v9h-4v-9H3V9h7z" />),
  heart: makeIcon(
    <path d="M12 21l-1.45-1.32C5.4 15 2 12 2 8.5 2 5.4 4.4 3 7.5 3c1.7 0 3.4.8 4.5 2.1C13.1 3.8 14.8 3 16.5 3 19.6 3 22 5.4 22 8.5c0 3.5-3.4 6.5-8.55 11.18L12 21z" />
  ),
  star: makeIcon(
    <path d="M12 2l2.4 7.4H22l-6.2 4.5L18.2 22 12 17.3 5.8 22l2.4-8.1L2 9.4h7.6L12 2z" />
  ),
  sun: makeIcon(
    <>
      <circle cx="12" cy="12" r="4" />
      <path
        d="M12 2v3m0 14v3M2 12h3m14 0h3M4.5 4.5l2 2m11 11l2 2M4.5 19.5l2-2m11-11l2-2"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
    </>
  ),
  moon: makeIcon(
    <path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z" />
  ),
  flame: makeIcon(
    <path d="M12 2c0 5-6 7-6 12a6 6 0 0 0 12 0c0-3-2-5-3-7-.5 1-.5 3-2 3 0-3-1-5-1-8z" />
  ),
  drop: makeIcon(
    <path d="M12 2C9 7 5 11 5 15a7 7 0 0 0 14 0c0-4-4-8-7-13z" />
  ),
  leaf: makeIcon(
    <path d="M19 4c-8 0-14 5-14 13 0 1 0 2 1 3 1-7 6-13 13-14V4z" />
  ),
  tree: makeIcon(
    <path d="M12 2l-5 8h2.5L6 16h3l-3 4h12l-3-4h3l-3.5-6H17zM11 18h2v4h-2z" />
  ),
  mountain: makeIcon(<path d="M3 20L9 8l4 7 3-5 5 10z" />),
  globe: makeIcon(
    <>
      <circle
        cx="12"
        cy="12"
        r="9"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M3 12h18M12 3c2.5 3 2.5 15 0 18M12 3c-2.5 3-2.5 15 0 18"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
    </>
  ),
  crown: makeIcon(<path d="M2 8l3 4 3-6 4 6 4-6 3 6 3-4v10H2z" />),
  shield: makeIcon(<path d="M12 2l8 3v6c0 5-4 9-8 11-4-2-8-6-8-11V5z" />),
  anchor: makeIcon(
    <>
      <circle
        cx="12"
        cy="4"
        r="2"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M12 6v14M7 11h10M4.5 16c1 4 5 5.5 7.5 5.5s6.5-1.5 7.5-5.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </>
  ),
  book: makeIcon(<path d="M4 3h7v18H4zm9 0h7v18h-7z" />),
  compass: makeIcon(
    <>
      <circle
        cx="12"
        cy="12"
        r="9"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path d="M9 15l3-8 3 8-3-2z" />
    </>
  ),
  dove: makeIcon(
    <path d="M3 13c4-1 7-4 8-7 1 1.5 2 2.5 4 2.5h3l-3 3c-1 4-4 7-9 7-2 0-3-1-3-2z" />
  ),
  note: makeIcon(
    <>
      <path
        d="M9 17V4l10-1v13"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="6" cy="17" r="3" />
      <circle cx="16" cy="16" r="3" />
    </>
  ),
  sparkle: makeIcon(<path d="M12 2l2 7 7 2-7 2-2 7-2-7-7-2 7-2z" />),
  wheat: makeIcon(
    <path
      d="M12 22V6M8 9l4-3 4 3M8 13l4-3 4 3M8 17l4-3 4 3"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    />
  )
};

export const CIRCLE_ICON_KEYS = Object.keys(ICONS);

export function CircleIcon({ name, size = 18, className }) {
  const Icon = ICONS[name];
  if (!Icon) return null;
  return <Icon size={size} className={className} />;
}
