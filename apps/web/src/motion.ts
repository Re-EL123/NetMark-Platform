/**
 * Motion helpers: staggered enter animations, animated number count-up (for
 * stat cards) and material-style button ripples. Everything honours
 * `prefers-reduced-motion`.
 */
export function prefersReduced(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function formatCount(n: number, kind: string, symbol: string): string {
  if (kind === 'money') return `${symbol}${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (kind === 'compact') return n.toLocaleString(undefined, { notation: 'compact', maximumFractionDigits: 1 });
  return Math.round(n).toLocaleString();
}

function countUp(el: HTMLElement) {
  const to = Number(el.getAttribute('data-count-to'));
  if (!Number.isFinite(to)) return;
  const kind = el.getAttribute('data-count-kind') || 'number';
  const symbol = el.getAttribute('data-count-symbol') || 'R';
  if (prefersReduced()) {
    el.textContent = formatCount(to, kind, symbol);
    return;
  }
  const dur = 750;
  const start = performance.now();
  const tick = (now: number) => {
    const t = Math.min(1, (now - start) / dur);
    const eased = 1 - Math.pow(1 - t, 3);
    el.textContent = formatCount(to * eased, kind, symbol);
    if (t < 1) requestAnimationFrame(tick);
    else el.textContent = formatCount(to, kind, symbol);
  };
  requestAnimationFrame(tick);
}

/** Replay staggered entrance + count-up for a freshly rendered region. */
export function animateIn(root: HTMLElement) {
  const kids = Array.from(root.children) as HTMLElement[];
  kids.forEach((el, i) => el.style.setProperty('--stagger', String(i)));

  const stats = root.querySelectorAll<HTMLElement>('.stats .stat');
  stats.forEach((el, i) => el.style.setProperty('--stagger', String(i)));

  const cards = root.querySelectorAll<HTMLElement>('.grid .product-card');
  cards.forEach((el, i) => el.style.setProperty('--stagger', String(i)));

  root.classList.remove('nm-enter');
  // Force a reflow so the class re-triggers the animation on re-render.
  void root.offsetWidth;
  if (!prefersReduced()) root.classList.add('nm-enter');

  root.querySelectorAll<HTMLElement>('[data-count-to]').forEach(countUp);
}

function ensureRipple(btn: HTMLElement, ev: MouseEvent) {
  const rect = btn.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height);
  const span = document.createElement('span');
  span.className = 'nm-ripple';
  span.style.width = span.style.height = `${size}px`;
  span.style.left = `${ev.clientX - rect.left - size / 2}px`;
  span.style.top = `${ev.clientY - rect.top - size / 2}px`;
  btn.appendChild(span);
  setTimeout(() => span.remove(), 650);
}

let rippleReady = false;
export function initMotion() {
  if (rippleReady) return;
  rippleReady = true;
  document.addEventListener('pointerdown', (e) => {
    if (prefersReduced()) return;
    const btn = (e.target as HTMLElement)?.closest?.(
      '.btn, .btn-sm, .link-btn, .logout-btn'
    ) as HTMLElement | null;
    if (!btn || btn.hasAttribute('disabled')) return;
    if (getComputedStyle(btn).position === 'static') btn.style.position = 'relative';
    ensureRipple(btn, e);
  });
}
