/**
 * Pointer-based drag and drop for board cards. Works with mouse, pen and
 * touch (press and hold to pick up a card), unlike native HTML5 drag events.
 * Drop targets are any element with a `data-drop` attribute naming a column.
 */

const DRAG_THRESHOLD_PX = 6;
const LONG_PRESS_MS = 250;
const TOUCH_SLOP_PX = 8;
const EDGE_SCROLL_PX = 48;

interface Session {
  card: HTMLElement;
  from: string;
  onDrop: (to: string) => void;
  pointerId: number;
  startX: number;
  startY: number;
  offsetX: number;
  offsetY: number;
  /** Mouse is armed immediately; touch only after a long press. */
  armed: boolean;
  timer?: number;
  ghost?: HTMLElement;
  target?: HTMLElement | null;
}

let session: Session | null = null;
let suppressClick = false;

export function makeDraggable(card: HTMLElement, from: string, onDrop: (to: string) => void): void {
  card.addEventListener('dragstart', (e) => e.preventDefault());
  card.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || session) return;
    if ((e.target as Element).closest('button, input, textarea, select')) return;
    const rect = card.getBoundingClientRect();
    const s: Session = {
      card,
      from,
      onDrop,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
      armed: e.pointerType !== 'touch',
    };
    if (!s.armed) {
      s.timer = window.setTimeout(() => {
        s.armed = true;
        start(s, s.startX, s.startY);
      }, LONG_PRESS_MS);
    }
    session = s;
  });
}

function start(s: Session, x: number, y: number): void {
  const rect = s.card.getBoundingClientRect();
  const ghost = s.card.cloneNode(true) as HTMLElement;
  ghost.classList.add('drag-ghost');
  ghost.setAttribute('aria-hidden', 'true');
  ghost.style.width = `${rect.width}px`;
  document.body.appendChild(ghost);
  s.ghost = ghost;
  s.card.classList.add('is-dragging');
  document.body.classList.add('is-dragging-card');
  move(s, x, y);
}

function move(s: Session, x: number, y: number): void {
  if (!s.ghost) return;
  s.ghost.style.transform = `translate(${x - s.offsetX}px, ${y - s.offsetY}px)`;

  const target = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-drop]') ?? null;
  if (target !== s.target) {
    s.target?.classList.remove('is-drop-target');
    if (target && target.dataset.drop !== s.from) target.classList.add('is-drop-target');
    s.target = target;
  }

  if (y < EDGE_SCROLL_PX) window.scrollBy(0, -12);
  else if (y > window.innerHeight - EDGE_SCROLL_PX) window.scrollBy(0, 12);
}

function end(drop: boolean): void {
  const s = session;
  if (!s) return;
  session = null;
  window.clearTimeout(s.timer);
  if (!s.ghost) return;

  s.ghost.remove();
  s.card.classList.remove('is-dragging');
  s.target?.classList.remove('is-drop-target');
  document.body.classList.remove('is-dragging-card');

  // The pointerup that ends a drag would otherwise click the card's link.
  suppressClick = true;
  window.setTimeout(() => (suppressClick = false), 0);

  const to = s.target?.dataset.drop;
  if (drop && to && to !== s.from) s.onDrop(to);
}

window.addEventListener('pointermove', (e) => {
  const s = session;
  if (!s || e.pointerId !== s.pointerId) return;
  const dist = Math.hypot(e.clientX - s.startX, e.clientY - s.startY);
  if (!s.armed) {
    // Finger moved before the long press: the rep is scrolling, not dragging.
    if (dist > TOUCH_SLOP_PX) end(false);
    return;
  }
  if (!s.ghost) {
    if (dist < DRAG_THRESHOLD_PX) return;
    start(s, e.clientX, e.clientY);
  }
  move(s, e.clientX, e.clientY);
});

window.addEventListener('pointerup', (e) => {
  if (session && e.pointerId === session.pointerId) end(true);
});
window.addEventListener('pointercancel', () => end(false));
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && session?.ghost) end(false);
});

// Stop the page scrolling under a card held on a touch screen.
window.addEventListener(
  'touchmove',
  (e) => {
    if (session?.armed) e.preventDefault();
  },
  { passive: false },
);
window.addEventListener('contextmenu', (e) => {
  if (session?.armed) e.preventDefault();
});
window.addEventListener(
  'click',
  (e) => {
    if (!suppressClick) return;
    suppressClick = false;
    e.preventDefault();
    e.stopPropagation();
  },
  true,
);
