import { useCallback, useEffect, useLayoutEffect, useState } from 'react';

// Each step either highlights an element inside the canvas (via CSS selector
// resolved against `containerRef`) or, when `selector` is null, shows a
// centered card on the dimmed backdrop. `optional` steps are skipped when
// their target element isn't on screen (e.g. the user has no cards or groups
// yet), so the tour still reads coherently on a freshly-seeded canvas.
export const DEFAULT_CANVAS_TUTORIAL_STEPS = [
  {
    key: 'intro',
    title: 'Welcome to the canvas',
    body:
      "This is your prayer book — every prayer you're praying for, laid out like cards on a table. Here's a quick tour of what you can do.",
    selector: null
  },
  {
    key: 'move',
    title: 'Move mode',
    body:
      'With Move selected, drag any card to rearrange it. Drag empty canvas to pan around, and scroll (or pinch) to zoom.',
    selector: '.pb-mode-group',
    focusSelector: '.pb-mode:first-child'
  },
  {
    key: 'group-mode',
    title: 'Draw a group',
    body:
      'Switch to Add Group, then drag on empty canvas to outline an area. Name it, and any card that falls inside can be moved together.',
    selector: '.pb-mode-group',
    focusSelector: '.pb-mode:last-child'
  },
  {
    key: 'zoom',
    title: 'Zoom',
    body:
      'Use − and + to step through zoom levels, or click the percentage to reset. Scrolling on the canvas zooms wherever your cursor is.',
    selector: '.pb-zoom-group'
  },
  {
    key: 'filter',
    title: 'Filter by visibility',
    body:
      'Show only Public, Circles, or Private prayers. Cards that don’t match fade out so you can focus on what matters right now.',
    selector: '.pb-filter-group'
  },
  {
    key: 'cards',
    title: 'Prayer cards',
    body:
      'Each card is a prayer you’ve saved. Add a card by tapping Pray in the feed; un-pray from the card itself to remove it.',
    selector: '.pb-card-wrap'
  },
  {
    key: 'group-controls',
    title: 'Group controls',
    body:
      'Drag a group’s border to move all its cards with it. Resize from the corners, rename or recolor with the pen, or remove with the × button.',
    selector: '.pb-group'
  },
  {
    key: 'help',
    title: 'Help is always here',
    body: 'Tap the Help button anytime to replay this tour. Happy praying.',
    selector: '.pb-help-btn'
  }
];

const SPOTLIGHT_PAD = 10;
const POPUP_WIDTH = 320;
const POPUP_GAP = 16;
const POPUP_ESTIMATED_HEIGHT = 210;
const POPUP_VIEWPORT_MARGIN = 16;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function computePopupPosition(rect, side) {
  const viewportW = window.innerWidth;
  const viewportH = window.innerHeight;

  const centeredLeft = clamp(
    rect.left + rect.width / 2 - POPUP_WIDTH / 2,
    POPUP_VIEWPORT_MARGIN,
    viewportW - POPUP_WIDTH - POPUP_VIEWPORT_MARGIN
  );

  if (side === 'bottom') {
    return {
      left: centeredLeft,
      top: rect.bottom + POPUP_GAP,
      transformOrigin: 'top center'
    };
  }
  if (side === 'top') {
    return {
      left: centeredLeft,
      top: Math.max(POPUP_VIEWPORT_MARGIN, rect.top - POPUP_GAP - POPUP_ESTIMATED_HEIGHT),
      transformOrigin: 'bottom center'
    };
  }
  if (side === 'right') {
    return {
      left: Math.min(rect.right + POPUP_GAP, viewportW - POPUP_WIDTH - POPUP_VIEWPORT_MARGIN),
      top: clamp(
        rect.top + rect.height / 2 - POPUP_ESTIMATED_HEIGHT / 2,
        POPUP_VIEWPORT_MARGIN,
        viewportH - POPUP_ESTIMATED_HEIGHT - POPUP_VIEWPORT_MARGIN
      ),
      transformOrigin: 'left center'
    };
  }
  return {
    left: Math.max(POPUP_VIEWPORT_MARGIN, rect.left - POPUP_GAP - POPUP_WIDTH),
    top: clamp(
      rect.top + rect.height / 2 - POPUP_ESTIMATED_HEIGHT / 2,
      POPUP_VIEWPORT_MARGIN,
      viewportH - POPUP_ESTIMATED_HEIGHT - POPUP_VIEWPORT_MARGIN
    ),
    transformOrigin: 'right center'
  };
}

function pickSide(rect) {
  const viewportH = window.innerHeight;
  const viewportW = window.innerWidth;
  const spaceBelow = viewportH - rect.bottom;
  const spaceAbove = rect.top;
  const needed = POPUP_ESTIMATED_HEIGHT + POPUP_GAP + POPUP_VIEWPORT_MARGIN;
  if (spaceBelow >= needed) return 'bottom';
  if (spaceAbove >= needed) return 'top';
  if (viewportW - rect.right >= POPUP_WIDTH + POPUP_GAP + POPUP_VIEWPORT_MARGIN) return 'right';
  if (rect.left >= POPUP_WIDTH + POPUP_GAP + POPUP_VIEWPORT_MARGIN) return 'left';
  return 'bottom';
}

export default function CanvasTutorial({
  containerRef,
  steps = DEFAULT_CANVAS_TUTORIAL_STEPS,
  onStepEnter,
  onClose
}) {
  const activeSteps = steps;
  const [index, setIndex] = useState(0);
  const step = activeSteps[index] || activeSteps[activeSteps.length - 1];

  // Notify the parent whenever the active step changes so it can prep the
  // canvas (e.g. pan to the relevant card or seed a demo card/group when the
  // user's book is empty). Runs once on mount for the first step too.
  useEffect(() => {
    if (step && onStepEnter) onStepEnter(step);
  }, [step, onStepEnter]);

  const [rect, setRect] = useState(null);

  const recompute = useCallback(() => {
    if (!step || !step.selector) {
      setRect((prev) => (prev === null ? prev : null));
      return;
    }
    const container = containerRef?.current || document;
    const target = container.querySelector(step.selector);
    if (!target) {
      setRect((prev) => (prev === null ? prev : null));
      return;
    }
    const next = target.getBoundingClientRect();
    setRect((prev) => {
      if (
        prev &&
        prev.left === next.left &&
        prev.top === next.top &&
        prev.width === next.width &&
        prev.height === next.height
      ) {
        return prev;
      }
      return next;
    });
  }, [step, containerRef]);

  useLayoutEffect(() => {
    recompute();
  }, [recompute]);

  // Also run after every render so the spotlight catches DOM updates driven
  // by the parent (e.g. a demo card/group appearing, or a viewport pan) in
  // the same frame instead of waiting for the interval poll.
  useLayoutEffect(() => {
    recompute();
  });

  useEffect(() => {
    if (!step || !step.selector) return undefined;
    window.addEventListener('resize', recompute);
    window.addEventListener('scroll', recompute, true);
    const id = window.setInterval(recompute, 250);
    return () => {
      window.removeEventListener('resize', recompute);
      window.removeEventListener('scroll', recompute, true);
      window.clearInterval(id);
    };
  }, [step, recompute]);

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose?.();
      else if (e.key === 'ArrowRight' || e.key === 'Enter') {
        if (index >= activeSteps.length - 1) onClose?.();
        else setIndex((i) => Math.min(i + 1, activeSteps.length - 1));
      } else if (e.key === 'ArrowLeft') {
        setIndex((i) => Math.max(0, i - 1));
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, activeSteps.length, onClose]);

  if (!step) return null;

  const isLast = index >= activeSteps.length - 1;
  const isFirst = index === 0;

  const spotlight = rect
    ? {
        left: rect.left - SPOTLIGHT_PAD,
        top: rect.top - SPOTLIGHT_PAD,
        width: rect.width + SPOTLIGHT_PAD * 2,
        height: rect.height + SPOTLIGHT_PAD * 2
      }
    : null;

  const side = rect ? pickSide(rect) : null;
  const popupPos = rect ? computePopupPosition(rect, side) : null;

  return (
    <div
      className={`canvas-tutorial${rect ? '' : ' is-centered'}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="canvas-tutorial-title"
    >
      {spotlight ? (
        <div
          className="canvas-tutorial-spotlight"
          style={{
            left: `${spotlight.left}px`,
            top: `${spotlight.top}px`,
            width: `${spotlight.width}px`,
            height: `${spotlight.height}px`
          }}
        />
      ) : (
        <div className="canvas-tutorial-backdrop" onClick={onClose} />
      )}

      <div
        key={step.key}
        className={`canvas-tutorial-popup side-${side || 'center'}`}
        style={
          popupPos
            ? {
                left: `${popupPos.left}px`,
                top: `${popupPos.top}px`,
                transformOrigin: popupPos.transformOrigin
              }
            : undefined
        }
      >
        <div className="canvas-tutorial-step">
          Step {index + 1} of {activeSteps.length}
        </div>
        <h3 id="canvas-tutorial-title">{step.title}</h3>
        <p>{step.body}</p>
        <div className="canvas-tutorial-dots" aria-hidden="true">
          {activeSteps.map((s, i) => (
            <span
              key={s.key}
              className={`canvas-tutorial-dot${i === index ? ' active' : ''}`}
            />
          ))}
        </div>
        <div className="canvas-tutorial-actions">
          <button
            type="button"
            className="canvas-tutorial-skip"
            onClick={onClose}
          >
            {isLast ? 'Close' : 'Skip'}
          </button>
          <div className="canvas-tutorial-nav">
            <button
              type="button"
              className="canvas-tutorial-back"
              onClick={() => setIndex((i) => Math.max(0, i - 1))}
              disabled={isFirst}
            >
              Back
            </button>
            <button
              type="button"
              className="canvas-tutorial-next"
              onClick={() => {
                if (isLast) onClose?.();
                else setIndex((i) => Math.min(i + 1, activeSteps.length - 1));
              }}
            >
              {isLast ? 'Got it' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
