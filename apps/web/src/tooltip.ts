/**
 * Lightweight global tooltips. Any element with `data-tip="text"` gets a
 * floating label on hover/focus. Optional `data-tip-pos="top|bottom|left|right"`
 * overrides the preferred placement. One shared node is reused for all tips.
 */
let tipEl: HTMLElement | null = null;
let current: HTMLElement | null = null;
let initialized = false;

const MARGIN = 10;

function ensureEl(): HTMLElement {
  if (!tipEl) {
    tipEl = document.createElement('div');
    tipEl.className = 'nm-tooltip';
    tipEl.setAttribute('role', 'tooltip');
    document.body.appendChild(tipEl);
  }
  return tipEl;
}

function place(el: HTMLElement, pos: string) {
  const tip = ensureEl();
  const r = el.getBoundingClientRect();
  const t = tip.getBoundingClientRect();
  let top = 0;
  let left = 0;

  const fitsTop = r.top - t.height - MARGIN > 0;
  const fitsBottom = r.bottom + t.height + MARGIN < window.innerHeight;
  const fitsLeft = r.left - t.width - MARGIN > 0;
  const fitsRight = r.right + t.width + MARGIN < window.innerWidth;

  let side = pos;
  if (side === 'top' && !fitsTop) side = fitsBottom ? 'bottom' : 'top';
  else if (side === 'bottom' && !fitsBottom) side = fitsTop ? 'top' : 'bottom';
  else if (side === 'left' && !fitsLeft) side = fitsRight ? 'right' : 'left';
  else if (side === 'right' && !fitsRight) side = fitsLeft ? 'left' : 'right';

  switch (side) {
    case 'bottom':
      top = r.bottom + MARGIN;
      left = r.left + r.width / 2 - t.width / 2;
      break;
    case 'left':
      top = r.top + r.height / 2 - t.height / 2;
      left = r.left - t.width - MARGIN;
      break;
    case 'right':
      top = r.top + r.height / 2 - t.height / 2;
      left = r.right + MARGIN;
      break;
    default:
      top = r.top - t.height - MARGIN;
      left = r.left + r.width / 2 - t.width / 2;
  }

  left = Math.max(8, Math.min(left, window.innerWidth - t.width - 8));
  top = Math.max(8, Math.min(top, window.innerHeight - t.height - 8));
  tip.style.transform = `translate3d(${Math.round(left)}px, ${Math.round(top)}px, 0)`;
  tip.dataset.side = side;
}

function show(el: HTMLElement) {
  const text = el.getAttribute('data-tip');
  if (!text) return;
  current = el;
  const tip = ensureEl();
  tip.textContent = text;
  tip.classList.add('show');
  // Measure after the text is set.
  place(el, el.getAttribute('data-tip-pos') || 'top');
}

function hide() {
  current = null;
  if (tipEl) tipEl.classList.remove('show');
}

function targetOf(e: Event): HTMLElement | null {
  const t = e.target as HTMLElement | null;
  return (t?.closest?.('[data-tip]') as HTMLElement) || null;
}

export function initTooltips() {
  if (initialized) return;
  initialized = true;

  document.addEventListener('mouseover', (e) => {
    const el = targetOf(e);
    if (el && el !== current) show(el);
  });
  document.addEventListener('mouseout', (e) => {
    const el = targetOf(e);
    if (!el || el !== current) return;
    const to = e.relatedTarget as Node | null;
    if (to && el.contains(to)) return;
    hide();
  });
  document.addEventListener('focusin', (e) => {
    const el = targetOf(e);
    if (el) show(el);
  });
  document.addEventListener('focusout', (e) => {
    if (targetOf(e)) hide();
  });
  window.addEventListener('scroll', hide, true);
  window.addEventListener('resize', hide);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hide();
  });
}

export function destroyTooltips() {
  hide();
  tipEl?.remove();
  tipEl = null;
  initialized = false;
}
