import { useEffect, useMemo, useRef, useState } from 'react';
import { LOCATIONS } from '../data/locations.js';

// A searchable dropdown for picking one of ~100 curated locations.
// Controlled component: the parent owns `value` (the selected string; '' for none).
export default function LocationSelect({ value, onChange, placeholder = 'Select a location' }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [highlight, setHighlight] = useState(0);
  const rootRef = useRef(null);
  const searchRef = useRef(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return LOCATIONS;
    return LOCATIONS.filter((l) => l.toLowerCase().includes(q));
  }, [search]);

  useEffect(() => {
    function onDocClick(e) {
      if (!rootRef.current?.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  useEffect(() => {
    if (open) {
      setTimeout(() => searchRef.current?.focus(), 0);
      setHighlight(0);
    } else {
      setSearch('');
    }
  }, [open]);

  function pick(loc) {
    onChange(loc);
    setOpen(false);
  }

  function handleKeyDown(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[highlight]) pick(filtered[highlight]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  return (
    <div className="combo" ref={rootRef}>
      <button
        type="button"
        className="combo-input"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span>{value || <span className="muted">{placeholder}</span>}</span>
        <span className="combo-caret">▾</span>
      </button>
      {open && (
        <div className="combo-dropdown" role="listbox">
          <input
            ref={searchRef}
            type="text"
            className="combo-search"
            placeholder="Search cities & regions…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setHighlight(0);
            }}
            onKeyDown={handleKeyDown}
          />
          <ul className="combo-list">
            {value && (
              <li>
                <button
                  type="button"
                  onClick={() => pick('')}
                >
                  Clear location
                </button>
              </li>
            )}
            {filtered.length === 0 ? (
              <li className="combo-empty">No matches</li>
            ) : (
              filtered.map((loc, i) => (
                <li key={loc}>
                  <button
                    type="button"
                    className={
                      loc === value ? 'active' : i === highlight ? 'active' : ''
                    }
                    onMouseEnter={() => setHighlight(i)}
                    onClick={() => pick(loc)}
                    role="option"
                    aria-selected={loc === value}
                  >
                    {loc}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
