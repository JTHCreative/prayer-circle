import { useState } from 'react';
import Globe from '../components/Globe.jsx';
import PrayerBookCanvas from '../components/PrayerBookCanvas.jsx';

export default function Feed() {
  const [view, setView] = useState('canvas');

  return (
    <div className="home-view">
      <div className="home-view-toggle" role="group" aria-label="Home view">
        <button
          type="button"
          className={`home-view-btn${view === 'canvas' ? ' active' : ''}`}
          onClick={() => setView('canvas')}
          aria-pressed={view === 'canvas'}
        >
          Canvas View
        </button>
        <button
          type="button"
          className={`home-view-btn${view === 'globe' ? ' active' : ''}`}
          onClick={() => setView('globe')}
          aria-pressed={view === 'globe'}
        >
          Globe View
        </button>
      </div>

      {view === 'canvas' ? (
        <PrayerBookCanvas />
      ) : (
        <section className="globe-pane" aria-label="Interactive globe">
          <Globe />
          <div className="globe-caption">
            <span>🌍 Drag the globe to spin it</span>
          </div>
        </section>
      )}
    </div>
  );
}
