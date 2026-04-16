import { useMemo } from 'react';
import { NATURE_IMAGES, PRAYER_VERSES } from '../data/verseCards.js';
import { pickByInterval } from '../utils/daily.js';

const ROTATION_HOURS = 4;

export default function DailyVerseCard() {
  // Rotate the verse + background every 4 hours. Offset the image cycle so
  // verse+image pairings shift independently.
  const verse = useMemo(() => pickByInterval(PRAYER_VERSES, ROTATION_HOURS), []);
  const image = useMemo(() => pickByInterval(NATURE_IMAGES, ROTATION_HOURS, 7), []);

  return (
    <div
      className="verse-card"
      role="figure"
      aria-label={`Daily verse: ${verse.reference}`}
    >
      <div
        className="verse-bg"
        style={{ backgroundImage: `url("${image}")` }}
      />
      <div className="verse-overlay" />
      <div className="verse-content">
        <p className="verse-text">&ldquo;{verse.text}&rdquo;</p>
        <p className="verse-reference">{verse.reference}</p>
      </div>
    </div>
  );
}
