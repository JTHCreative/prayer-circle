import PrayerBookCanvas from '../components/PrayerBookCanvas.jsx';

export default function PrayerBook() {
  return (
    <div className="circle-universe">
      <div className="circle-universe-header">
        <div>
          <h1>Prayer Book</h1>
          <p className="muted">
            Every prayer you&rsquo;re praying for, laid out like a table.
            Drag to arrange, draw a group to cluster them, and tap{' '}
            <strong>Pray</strong> when you&rsquo;re done.
          </p>
        </div>
      </div>
      <PrayerBookCanvas />
    </div>
  );
}
