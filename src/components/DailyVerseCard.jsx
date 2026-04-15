import { useMemo } from 'react';
import { NATURE_IMAGES, PRAYER_VERSES } from '../data/verseCards.js';
import { pickDaily } from '../utils/daily.js';

export default function DailyVerseCard() {
  // Offset the image cycle so verse+image pairings shift independently.
  const verse = useMemo(() => pickDaily(PRAYER_VERSES), []);
  const image = useMemo(() => pickDaily(NATURE_IMAGES, 7), []);

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
