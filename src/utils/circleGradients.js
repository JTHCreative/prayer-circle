// Radial-gradient palettes used by the floating circle bubbles on the
// Circles page. Each circle persists its chosen key in Firestore; older
// circles without a saved key fall back to a stable hash-based pick so
// the canvas still has visual variety before any customization.
export const GRADIENT_PALETTES = [
  { key: 'blue-purple',   from: '#3b82f6', to: '#8b5cf6' }, // default
  { key: 'indigo-purple', from: '#6366f1', to: '#a855f7' },
  { key: 'sky-indigo',    from: '#0ea5e9', to: '#6366f1' },
  { key: 'violet-pink',   from: '#8b5cf6', to: '#ec4899' },
  { key: 'teal-blue',     from: '#14b8a6', to: '#3b82f6' },
  { key: 'rose-pink',     from: '#f43f5e', to: '#d946ef' },
  { key: 'orange-red',    from: '#f97316', to: '#dc2626' },
  { key: 'amber-orange',  from: '#f59e0b', to: '#ea580c' },
  { key: 'green-teal',    from: '#10b981', to: '#06b6d4' },
  { key: 'slate-gray',    from: '#475569', to: '#94a3b8' }
];

export const DEFAULT_GRADIENT_KEY = GRADIENT_PALETTES[0].key;

const GRADIENT_BY_KEY = Object.fromEntries(
  GRADIENT_PALETTES.map((g) => [g.key, g])
);

export function getCircleGradient(circle) {
  if (circle.gradientKey && GRADIENT_BY_KEY[circle.gradientKey]) {
    return GRADIENT_BY_KEY[circle.gradientKey];
  }
  return GRADIENT_PALETTES[hashId(circle.id) % GRADIENT_PALETTES.length];
}

function hashId(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h);
}

// Convenience: the CSS `background` string the floating bubbles use.
export function circleBubbleBackground(circle) {
  const theme = getCircleGradient(circle);
  return `radial-gradient(circle at 30% 25%, ${theme.from} 0%, ${theme.to} 100%)`;
}
