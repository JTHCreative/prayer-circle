// Number of full days since the Unix epoch in the viewer's local timezone.
// We want the rotation to flip at local midnight rather than UTC, so compute
// against a local YYYY-MM-DD anchor.
function localDayNumber(now = new Date()) {
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  return Math.floor(Date.UTC(y, m, d) / 86_400_000);
}

// Pick an item from an array deterministically by day. Pass an `offset` if
// you want two lists (e.g. verses vs. images) to decouple their cycles so
// the same pairing doesn't repeat in lockstep.
export function pickDaily(array, offset = 0) {
  if (!array.length) return null;
  const day = localDayNumber();
  const index = ((day + offset) % array.length + array.length) % array.length;
  return array[index];
}
