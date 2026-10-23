import { API_BASE_URL, STOREFRONT_BASE_URL } from './config';
import { supabase } from './supabase';
import { apiRequest } from './api';
import { iconify } from './icons';

/* ------------------------------- icons --------------------------------- */
iconify(document);

/* ----------------------------- nav + menu ------------------------------ */
const nav = document.getElementById('nav') as HTMLElement;
const menuBtn = document.getElementById('menuBtn') as HTMLButtonElement | null;

const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 12);
window.addEventListener('scroll', onScroll, { passive: true });
onScroll();

menuBtn?.addEventListener('click', () => {
  const open = nav.classList.toggle('open');
  menuBtn.setAttribute('aria-expanded', String(open));
});
nav.querySelectorAll('.l-nav-links a').forEach((a) => {
  a.addEventListener('click', () => {
    nav.classList.remove('open');
    menuBtn?.setAttribute('aria-expanded', 'false');
  });
});

document.getElementById('year')!.textContent = String(new Date().getFullYear());

/* --------------------------- rotating words ---------------------------- */
const rotate = document.getElementById('rotate');
if (rotate) {
  const words = Array.from(rotate.querySelectorAll<HTMLSpanElement>('span'));
  let i = 0;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!reduced && words.length > 1) {
    setInterval(() => {
      words[i].classList.remove('active');
      words[i].classList.add('leaving');
      const prev = i;
      i = (i + 1) % words.length;
      words[i].classList.remove('leaving');
      words[i].classList.add('active');
      window.setTimeout(() => words[prev].classList.remove('leaving'), 700);
    }, 2600);
  }
}

/* --------------------------- scroll reveal ----------------------------- */
const revealEls = Array.from(document.querySelectorAll<HTMLElement>('.reveal'));
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

if ('IntersectionObserver' in window && !reduced) {
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('in');
        io.unobserve(entry.target);
      });
    },
    { threshold: 0.14 }
  );
  revealEls.forEach((el) => io.observe(el));
} else {
  revealEls.forEach((el) => el.classList.add('in'));
}

/* ------------------------------- stats --------------------------------- */
function animateStat(el: HTMLElement, target: number, suffix: string) {
  if (!Number.isFinite(target)) target = 0;
  if (reduced) {
    el.innerHTML = `${target.toLocaleString('en-ZA')}<span class="suffix">${suffix}</span>`;
    return;
  }
  const start = performance.now();
  const dur = 1300;
  const tick = (now: number) => {
    const p = Math.min(1, (now - start) / dur);
    const eased = 1 - Math.pow(1 - p, 3);
    el.innerHTML = `${Math.round(target * eased).toLocaleString('en-ZA')}<span class="suffix">${suffix}</span>`;
    if (p < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function applyStats(stats: { storefronts?: number; products?: number; onTimeRate?: number; platform?: number }) {
  const map: [string, number, string][] = [
    ['storefronts', Number(stats?.storefronts || 0), '+'],
    ['products', Number(stats?.products || 0), '+'],
    ['onTimeRate', Number(stats?.onTimeRate || 0), '%'],
    ['platform', Number(stats?.platform || 1), '']
  ];
  for (const [key, value, suffix] of map) {
    const el = document.querySelector<HTMLElement>(`[data-stat="${key}"]`);
    if (el) animateStat(el, value, suffix);
  }
}

/* ----------------------------- helpers --------------------------------- */
function esc(v: unknown): string {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
function money(n: number): string {
  return 'R' + Number(n || 0).toLocaleString('en-ZA', { maximumFractionDigits: 0 });
}
function apiOrigin(): string {
  return API_BASE_URL.replace(/\/api\/?$/, '');
}
function storefrontHref(slug: string): string {
  // Prefer the storefront host when configured, else the API host that also
  // serves /s/<slug>. Both work; the API host is the reliable fallback.
  const base = STOREFRONT_BASE_URL || apiOrigin();
  return `${base.replace(/\/+$/, '')}/s/${encodeURIComponent(slug)}`;
}

/* --------------------------- live showcase ---------------------------- */
interface FeaturedStore {
  store: {
    name: string;
    slug: string;
    url?: string;
    tagline?: string;
    themeColor?: string;
    logo?: string | null;
    banner?: string | null;
    ratings?: { average: number; count: number };
  };
  products: { name: string; price: number; comparePrice: number; image: string | null }[];
}

function renderStore(s: FeaturedStore, index: number): string {
  const banner = s.store.banner
    ? `<img src="${esc(s.store.banner)}" alt="" loading="lazy">`
    : s.store.logo
    ? `<img src="${esc(s.store.logo)}" alt="" loading="lazy" style="object-fit:contain;padding:22px">`
    : '';
  const products = (s.products || [])
    .slice(0, 4)
    .map((p) => {
      const img = p.image
        ? `<img src="${esc(p.image)}" alt="${esc(p.name)}" loading="lazy">`
        : '';
      return `<div class="l-prod" title="${esc(p.name)}">${img}<span class="price">${money(p.price)}</span></div>`;
    })
    .join('');
  const rating = s.store.ratings?.count
    ? `<span style="font-size:12px;color:var(--muted)">★ ${s.store.ratings.average} (${s.store.ratings.count})</span>`
    : '';
  return `
    <article class="l-store reveal${index < 4 ? ' in' : ''}" style="border-color:${s.store.themeColor ? esc(s.store.themeColor) + '40' : 'var(--line)'}">
      <div class="l-store-banner" ${s.store.themeColor ? `style="background:linear-gradient(135deg, ${esc(s.store.themeColor)}55, #16161a)"` : ''}>${banner}</div>
      <div class="l-store-body">
        <div class="l-store-name">${esc(s.store.name || 'Store')} ${rating}</div>
        <div class="l-store-tagline">${esc(s.store.tagline || '')}</div>
        ${products ? `<div class="l-store-products">${products}</div>` : ''}
        <a class="l-store-link" href="${esc(storefrontHref(s.store.slug))}" target="_blank" rel="noopener">Visit store →</a>
      </div>
    </article>`;
}

async function loadFeatured() {
  const grid = document.getElementById('liveGrid');
  const empty = document.getElementById('liveEmpty');
  if (!grid) return;
  try {
    const res = await fetch(`${API_BASE_URL}/storefront/featured`, { headers: { Accept: 'application/json' } });
    const body = await res.json();
    const data: FeaturedStore[] = body?.success ? body.data || [] : [];
    if (body?.stats) applyStats(body.stats);
    if (!data.length) {
      grid.innerHTML = '';
      if (empty) empty.style.display = 'block';
      return;
    }
    grid.innerHTML = data.map(renderStore).join('');
    // Reveal the freshly-rendered cards when they scroll into view.
    grid.querySelectorAll<HTMLElement>('.reveal').forEach((el) => el.classList.add('in'));
  } catch {
    grid.innerHTML = '';
    if (empty) empty.style.display = 'block';
  }
}
loadFeatured();

/* --------------------- admin-editable hero appearance ------------------ */
const landingRoot = document.querySelector<HTMLElement>('.landing');
const heroVideo = document.querySelector<HTMLVideoElement>('.l-hero-video');

async function loadLandingConfig() {
  try {
    const res = await fetch(`${API_BASE_URL}/storefront/landing`, { headers: { Accept: 'application/json' } });
    const body = await res.json();
    const c = body?.success ? body.data : null;
    if (!c) return;
    if (landingRoot) {
      if (c.headingColor) landingRoot.style.setProperty('--l-heading', c.headingColor);
      if (c.accentColor) landingRoot.style.setProperty('--l-accent', c.accentColor);
      if (c.accentColor2) landingRoot.style.setProperty('--l-accent2', c.accentColor2);
      if (c.textColor) landingRoot.style.setProperty('--l-text', c.textColor);
      if (c.heroVideoOpacity != null) landingRoot.style.setProperty('--l-video-opacity', String(c.heroVideoOpacity));
    }
    if (heroVideo && c.heroVideo && c.heroVideo !== heroVideo.getAttribute('src')) {
      heroVideo.src = c.heroVideo;
      heroVideo.load();
      heroVideo.play().catch(() => {});
    }
  } catch {
    /* keep the built-in hero */
  }
}
loadLandingConfig();

/* ------------------------- lazy showcase video ------------------------- */
const showcase = document.getElementById('showcaseVideo') as HTMLVideoElement | null;
if (showcase && 'IntersectionObserver' in window && !reduced) {
  const vio = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          if (!showcase.src) showcase.src = '/media/showcase.mp4';
          showcase.play().catch(() => {});
        } else {
          showcase.pause();
        }
      });
    },
    { threshold: 0.25 }
  );
  vio.observe(showcase);
} else if (showcase) {
  showcase.preload = 'auto';
  showcase.autoplay = true;
}

/* ------------------------------ guest mode ---------------------------- */
const guestButtons = [document.getElementById('guestBtn'), document.getElementById('guestBtn2')];
function enterGuest() {
  localStorage.setItem('netmark_guest', '1');
  const live = document.getElementById('live');
  live?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  showGuestBar();
}

let guestBar: HTMLElement | null = null;
function showGuestBar() {
  if (guestBar || document.getElementById('signInBtn')?.textContent === 'Open dashboard') return;
  guestBar = document.createElement('div');
  guestBar.className = 'l-guest-bar';
  guestBar.innerHTML = `
    <span>You're browsing as a guest.</span>
    <a class="l-btn l-btn-primary" href="/register.html">Join free</a>
    <a class="l-btn l-btn-ghost" href="/login.html">Sign in</a>
    <button class="dismiss" aria-label="Dismiss">×</button>`;
  document.body.appendChild(guestBar);
  requestAnimationFrame(() => guestBar?.classList.add('show'));
  guestBar.querySelector('.dismiss')?.addEventListener('click', () => {
    guestBar?.classList.remove('show');
    window.setTimeout(() => guestBar?.remove(), 400);
    guestBar = null;
  });
}
guestButtons.forEach((b) => b?.addEventListener('click', enterGuest));

/* ---------------------- signed-in state (guest ↔ member) -------------- */
(async () => {
  try {
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      if (localStorage.getItem('netmark_guest') === '1') showGuestBar();
      return;
    }
    const res = await apiRequest('/auth/me').catch(() => null);
    const user = res?.success ? res.data?.user : null;
    if (!user) return;
    localStorage.setItem('netmark_user', JSON.stringify(user));
    const base = import.meta.env.BASE_URL;
    const routes: Record<string, string> = {
      platformAdmin: `${base}platform/`,
      owner: `${base}owner/`,
      storeOwner: `${base}business/`,
      customer: `${base}shop/`,
      driver: `${base}driver/`
    };
    const signIn = document.getElementById('signInBtn');
    const primary = document.getElementById('primaryCta');
    if (signIn) {
      signIn.textContent = 'Open dashboard';
      signIn.setAttribute('href', routes[user.role] || `${base}shop/`);
    }
    if (primary) {
      primary.textContent = 'Continue to NetMark';
      primary.setAttribute('href', routes[user.role] || `${base}shop/`);
    }
  } catch {
    /* stay in guest mode */
  }
})();
