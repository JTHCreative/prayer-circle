// Number of completed `intervalHours` blocks since the Unix epoch. Used to
// pick a deterministic item from a list that rotates on a fixed cadence
// (e.g. every 4 hours). The block boundary aligns to UTC midnight, so a
// 4-hour cadence flips at 00:00, 04:00, 08:00, … UTC.
function intervalBlockNumber(intervalHours, now = new Date()) {
  const ms = intervalHours * 60 * 60 * 1000;
  return Math.floor(now.getTime() / ms);
}

// Pick an item from an array deterministically by time interval. Pass an
// `offset` to decouple two lists (e.g. verses vs. images) so the same
// pairing doesn't repeat in lockstep.
export function pickByInterval(array, intervalHours = 24, offset = 0) {
  if (!array.length) return null;
  const block = intervalBlockNumber(intervalHours);
  const index = ((block + offset) % array.length + array.length) % array.length;
  return array[index];
}
