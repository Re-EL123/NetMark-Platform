import './storefront.css';
import { API_BASE_URL, STOREFRONT_BASE_URL } from './config';
import { captureReferral, getReferralCode } from './referralStore';

/**
 * Public, unauthenticated storefront landing page.
 *
 * The store is identified by `?s=<slug>` (falls back to `?slug=`, `#s=` or a
 * trailing path segment). Everything is rendered client-side and the page's
 * <title>/meta/JSON-LD are rewritten for the specific store so shared links
 * and search engines get meaningful previews.
 */

const root = document.getElementById('sf-root') as HTMLElement;

interface Product {
  id: string;
  productId: string;
  name: string;
  price: number;
  comparePrice?: number;
  image: string | null;
  gallery?: string[];
  description: string;
  category: string;
  inStock: boolean;
}

interface FaqItem {
  q: string;
  a: string;
}

interface StorefrontConfig {
  layout: 'classic' | 'boutique' | 'bold';
  heroStyle: 'image' | 'gradient' | 'split';
  font: 'system' | 'sora' | 'inter' | 'playfair' | 'dmserif';
  tagline: string;
  about: string;
  logo: string | null;
  banner: string | null;
  themeColor: string;
  secondaryColor: string;
  announcement: string;
  badges: string[];
  gallery: string[];
  faq: FaqItem[];
  sections: Record<string, boolean>;
  phone: string;
  whatsapp: string;
  email: string;
  address: string;
  hours: string;
  ctaLabel: string;
  showProducts: boolean;
  featured: string[];
  metaTitle: string;
  metaDescription: string;
  metaKeywords: string;
  social: Record<string, string>;
}

interface Review {
  rating: number;
  comment: string;
  createdAt: string | null;
  author: string;
}

interface Payload {
  store: { id: string; name: string; slug: string; url: string };
  storefront: StorefrontConfig;
  products: Product[];
  ratings: { average: number; count: number };
  reviews: Review[];
}

let activeRef = '';

/** Anonymous, best-effort analytics ping. Never blocks or breaks the page. */
function beacon(type: 'view' | 'contact' | 'share' | 'product', ref: string) {
  if (!ref) return;
  const url = `${API_BASE_URL}/storefront/${encodeURIComponent(ref)}/event`;
  try {
    const body = JSON.stringify({ type });
    if (navigator.sendBeacon) {
      navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }));
      return;
    }
    void fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true });
  } catch {
    /* ignore */
  }
}

function starsHtml(rating: number): string {
  const rounded = Math.max(0, Math.min(5, Math.round(Number(rating) || 0)));
  let out = '';
  for (let i = 1; i <= 5; i++) {
    out += `<span class="sf-star${i <= rounded ? ' on' : ''}">★</span>`;
  }
  return `<span class="sf-stars" aria-label="${rounded} out of 5">${out}</span>`;
}

function reviewCard(rv: Review): string {
  return `<article class="sf-review">
    <div class="sf-review-head">
      <span class="sf-review-author">${esc(rv.author)}</span>
      ${starsHtml(rv.rating)}
    </div>
    ${rv.comment ? `<p class="sf-review-body">${esc(rv.comment)}</p>` : ''}
    ${rv.createdAt ? `<time class="sf-review-date">${esc(formatDate(rv.createdAt))}</time>` : ''}
  </article>`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return '';
  }
}

function escAttr(v: any): string {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function esc(v: any): string {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function fmtMoney(value: number): string {
  return `R ${Number(value || 0).toFixed(2)}`;
}

function refFromUrl(): string {
  try {
    const sp = new URLSearchParams(location.search);
    const q = sp.get('s') || sp.get('slug');
    if (q) return q.trim();
    const hp = new URLSearchParams(location.hash.replace(/^#/, ''));
    const h = hp.get('s') || hp.get('slug');
    if (h) return h.trim();
  } catch {
    /* ignore */
  }
  const parts = location.pathname.split('/').filter(Boolean);
  const last = parts[parts.length - 1];
  if (last && last !== 'storefront' && last !== 'index.html') return last;
  return '';
}

function setMeta(attr: 'name' | 'property', key: string, content: string) {
  if (!content) return;
  let el = document.head.querySelector(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function setCanonical(href: string) {
  let el = document.head.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
  if (!el) {
    el = document.createElement('link');
    el.rel = 'canonical';
    document.head.appendChild(el);
  }
  el.href = href;
}

function digitsOnly(value: string): string {
  const d = String(value || '').replace(/[^\d]/g, '');
  if (d.startsWith('0')) return `27${d.slice(1)}`;
  return d;
}

function waLink(number: string, text: string): string {
  return `https://wa.me/${digitsOnly(number)}?text=${encodeURIComponent(text)}`;
}

function socialLinks(social: Record<string, string>): string {
  if (!social) return '';
  const map: [string, string][] = [
    ['facebook', 'Facebook'],
    ['instagram', 'Instagram'],
    ['tiktok', 'TikTok'],
    ['x', 'X'],
    ['youtube', 'YouTube']
  ];
  return map
    .filter(([k]) => social[k])
    .map(([k, label]) => `<a href="${escAttr(social[k])}" target="_blank" rel="noopener">${label}</a>`)
    .join('');
}

function productCard(p: Product, featured: boolean): string {
  const onSale = Number(p.comparePrice || 0) > Number(p.price || 0);
  const tags = [
    onSale ? '<span class="sf-tag sf-tag-sale">Sale</span>' : '',
    featured ? '<span class="sf-tag sf-tag-star">★ Featured</span>' : '',
    !p.inStock ? '<span class="sf-out sf-tag sf-tag-out">Sold out</span>' : ''
  ].join('');
  const initial = (p.name || '?').charAt(0).toUpperCase();
  return `
    <article class="sf-product" data-product="${escAttr(p.id)}" role="button" tabindex="0">
      <div class="sf-product-media">
        ${p.image ? `<img src="${escAttr(p.image)}" alt="${escAttr(p.name)}" loading="lazy" />` : `<div class="sf-product-ph">${esc(initial)}</div>`}
        ${tags ? `<div class="sf-tags">${tags}</div>` : ''}
      </div>
      <div class="sf-product-body">
        ${p.category ? `<span class="sf-cat">${esc(p.category)}</span>` : ''}
        <h3>${esc(p.name)}</h3>
        ${p.description ? `<p>${esc(p.description.length > 120 ? p.description.slice(0, 120) + '…' : p.description)}</p>` : ''}
        <div class="sf-product-foot">
          <span><span class="sf-price">${esc(fmtMoney(p.price))}</span>${onSale ? `<span class="sf-compare">${esc(fmtMoney(p.comparePrice || 0))}</span>` : ''}</span>
        </div>
      </div>
    </article>`;
}

function notFound(message?: string) {
  document.title = 'Store not found — NetMark';
  if (!root) return;
  root.innerHTML = `
    <div class="sf-notfound">
      <h1>Store not found</h1>
      <p>${esc(message || 'This storefront does not exist or is no longer available.')}</p>
      <a class="sf-btn sf-btn-primary" href="/">Go to NetMark</a>
    </div>`;
}

function jsonLdScript(data: any): string {
  return `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;
}

async function main() {
  captureReferral();
  if (!root) return;

  const ref = refFromUrl();
  if (!ref) return notFound('No store was specified in the link.');

  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}/storefront/${encodeURIComponent(ref)}`);
  } catch {
    return notFound('We could not reach the store right now. Please try again.');
  }
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.success) return notFound(body?.message);

  const { store, storefront: sf, products } = body.data as Payload;
  const ratings = body.data.ratings || { average: 0, count: 0 };
  const reviews: Review[] = body.data.reviews || [];
  activeRef = store.slug;
  // Canonical + share URL points at the server-rendered page so link previews
  // carry the store's meta regardless of which host renders this client.
  const pageUrl = `${STOREFRONT_BASE_URL}/s/${encodeURIComponent(store.slug)}`;
  const refCode = getReferralCode();
  const shareUrl = refCode ? `${pageUrl}&ref=${encodeURIComponent(refCode)}` : pageUrl;

  const title = sf.metaTitle || `${store.name}${sf.tagline ? ' — ' + sf.tagline : ''}`;
  const description =
    sf.metaDescription || sf.tagline || sf.about.slice(0, 160) || `Browse products from ${store.name}.`;
  const image = sf.banner || sf.logo || '';

  document.title = title;
  setMeta('name', 'description', description);
  if (sf.metaKeywords) setMeta('name', 'keywords', sf.metaKeywords);
  setMeta('name', 'theme-color', sf.themeColor);
  setMeta('property', 'og:type', 'website');
  setMeta('property', 'og:site_name', 'NetMark');
  setMeta('property', 'og:title', title);
  setMeta('property', 'og:description', description);
  setMeta('property', 'og:url', pageUrl);
  if (image) setMeta('property', 'og:image', image);
  setMeta('name', 'twitter:card', image ? 'summary_large_image' : 'summary');
  setMeta('name', 'twitter:title', title);
  setMeta('name', 'twitter:description', description);
  if (image) setMeta('name', 'twitter:image', image);
  setCanonical(pageUrl);
  document.documentElement.style.setProperty('--sf-accent', sf.themeColor || '#e50914');

  const wa = sf.whatsapp;
  const storeName = store.name;
  const sections = sf.sections || {};
  const ctaLabel = sf.ctaLabel || (wa ? 'Order on WhatsApp' : sf.phone ? 'Call us' : 'Contact us');
  const heroCta = wa
    ? `<a class="sf-btn sf-btn-primary" href="${escAttr(waLink(wa, `Hi ${storeName}, I'd like to place an order.`))}" target="_blank" rel="noopener">${esc(ctaLabel)}</a>`
    : sf.phone
      ? `<a class="sf-btn sf-btn-primary" href="tel:${escAttr(sf.phone)}">${esc(ctaLabel)}</a>`
      : sf.email
        ? `<a class="sf-btn sf-btn-primary" href="mailto:${escAttr(sf.email)}">${esc(ctaLabel)}</a>`
        : '';

  const showProducts = sections.products !== false && sf.showProducts && products.length > 0;
  const social = socialLinks(sf.social);
  const featuredIds = new Set(sf.featured || []);
  const featuredProducts = showProducts ? products.filter((p) => featuredIds.has(p.id)) : [];
  const restProducts = showProducts ? products.filter((p) => !featuredIds.has(p.id)) : [];
  const categories = showProducts
    ? [...new Set(products.map((p) => p.category).filter(Boolean))].slice(0, 12)
    : [];
  const gallery = (sf.gallery || []).filter(Boolean);

  // Apply theme/font + layout classes to <html>/<body>.
  const fonts: Record<string, string> = {
    system: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    sora: "'Sora', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    inter: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    playfair: "'Playfair Display', Georgia, 'Times New Roman', serif",
    dmserif: "'DM Serif Display', Georgia, 'Times New Roman', serif"
  };
  if (sf.font && sf.font !== 'system') {
    const fam =
      sf.font === 'sora'
        ? 'Sora:wght@400;500;600;700;800'
        : sf.font === 'inter'
          ? 'Inter:wght@400;500;600;700;800'
          : sf.font === 'playfair'
            ? 'Playfair+Display:wght@500;600;700'
            : 'DM+Serif+Display:ital@0;1';
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?family=${fam}&display=swap`;
    document.head.appendChild(link);
  }
  document.documentElement.style.setProperty('--sf-accent', sf.themeColor || '#e50914');
  document.documentElement.style.setProperty('--sf-accent-2', sf.secondaryColor || sf.themeColor || '#e50914');
  document.documentElement.style.setProperty('--sf-font', fonts[sf.font] || fonts.system);
  document.body.classList.add(`sf-layout-${sf.layout || 'classic'}`);

  const isSplit = sf.heroStyle === 'split';
  const isGradient = sf.heroStyle === 'gradient';
  const heroBg = !isGradient && !isSplit && sf.banner
    ? ` style="background-image:linear-gradient(rgba(10,10,12,.5),rgba(10,10,12,.7)),url('${escAttr(sf.banner)}')"`
    : '';
  const heroInner = isSplit
    ? `<div class="sf-hero-copy">
        ${sf.logo ? `<img class="sf-hero-logo" src="${escAttr(sf.logo)}" alt="${escAttr(storeName)}" />` : ''}
        <h1>${esc(storeName)}</h1>
        ${sf.tagline ? `<p class="sf-tagline">${esc(sf.tagline)}</p>` : ''}
        <div class="sf-hero-cta">${heroCta}</div>
      </div>
      ${sf.banner ? `<div class="sf-hero-media"><img src="${escAttr(sf.banner)}" alt="${escAttr(storeName)}" /></div>` : ''}`
    : `${sf.logo ? `<img class="sf-hero-logo" src="${escAttr(sf.logo)}" alt="${escAttr(storeName)}" />` : ''}
      <h1>${esc(storeName)}</h1>
      ${sf.tagline ? `<p class="sf-tagline">${esc(sf.tagline)}</p>` : ''}
      <div class="sf-hero-cta">${heroCta}</div>`;

  const navLinks = [
    sections.featured !== false && featuredProducts.length ? '<a href="#featured">Featured</a>' : '',
    showProducts ? '<a href="#products">Products</a>' : '',
    sections.gallery !== false && gallery.length ? '<a href="#gallery">Gallery</a>' : '',
    sf.about ? '<a href="#about">About</a>' : '',
    ratings.count ? '<a href="#reviews">Reviews</a>' : '',
    sections.faq !== false && sf.faq?.length ? '<a href="#faq">FAQ</a>' : '',
    '<a href="#contact">Contact</a>'
  ]
    .filter(Boolean)
    .join('');

  root.innerHTML = `
    ${sf.announcement ? `<div class="sf-announce"><div class="sf-announce-inner">${esc(sf.announcement)}</div></div>` : ''}
    <header class="sf-header">
      <a class="sf-brand" href="${escAttr(pageUrl)}">
        ${sf.logo ? `<img src="${escAttr(sf.logo)}" alt="${escAttr(storeName)} logo" />` : `<span class="sf-brand-dot"></span>`}
        <span>${esc(storeName)}</span>
      </a>
      <nav>${navLinks}</nav>
      <button class="sf-share" id="sfShare" type="button">Share</button>
      <button class="sf-burger" id="sfBurger" type="button" aria-label="Open menu" aria-expanded="false" aria-controls="sfMobileNav">
        <span></span><span></span><span></span>
      </button>
    </header>
    <div class="sf-mobile-nav" id="sfMobileNav" hidden>
      <nav>${navLinks}</nav>
    </div>

    <section class="sf-hero sf-hero-${escAttr(sf.heroStyle)}"${heroBg}>
      <div class="sf-hero-inner">${heroInner}</div>
    </section>

    ${
      sections.trust !== false && sf.badges?.length
        ? `<section class="sf-trust"><div class="sf-trust-inner">${sf.badges
            .map((b) => `<span class="sf-badge"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>${esc(b)}</span>`)
            .join('')}</div></section>`
        : ''
    }

    <main class="sf-main">
      ${
        sections.categories !== false && categories.length > 1
          ? `<section class="sf-section sf-cats-section"><div class="sf-cats">${categories
              .map((cat) => `<a class="sf-chip" href="#products" data-cat="${escAttr(cat)}">${esc(cat)}</a>`)
              .join('')}</div></section>`
          : ''
      }
      ${
        sections.featured !== false && featuredProducts.length
          ? `<section class="sf-section" id="featured">
              <h2>Featured</h2>
              <div class="sf-grid sf-grid-featured">${featuredProducts.map((p) => productCard(p, true)).join('')}</div>
            </section>`
          : ''
      }
      ${
        showProducts
          ? `<section class="sf-section" id="products">
              <h2>Products</h2>
              <div class="sf-grid" id="sfProductGrid">${(restProducts.length ? restProducts : products).map((p) => productCard(p, featuredIds.has(p.id))).join('')}</div>
            </section>`
          : ''
      }
      ${
        sections.gallery !== false && gallery.length
          ? `<section class="sf-section" id="gallery">
              <h2>Gallery</h2>
              <div class="sf-gallery">${gallery
                .map((g) => `<a class="sf-gallery-item" href="${escAttr(g)}" target="_blank" rel="noopener"><img src="${escAttr(g)}" alt="" loading="lazy" /></a>`)
                .join('')}</div>
            </section>`
          : ''
      }
      ${
        sf.about
          ? `<section class="sf-section" id="about">
              <h2>About ${esc(storeName)}</h2>
              <p>${esc(sf.about).replace(/\n/g, '<br />')}</p>
            </section>`
          : ''
      }
      ${
        ratings.count
          ? `<section class="sf-section" id="reviews">
              <h2>Reviews</h2>
              <div class="sf-rating-summary">
                ${starsHtml(ratings.average)}
                <strong>${(Number(ratings.average) || 0).toFixed(1)}</strong>
                <span class="sf-muted">${ratings.count} review${ratings.count === 1 ? '' : 's'}</span>
              </div>
              <div class="sf-reviews">${reviews.map(reviewCard).join('')}</div>
            </section>`
          : ''
      }
      ${
        sections.faq !== false && sf.faq?.length
          ? `<section class="sf-section" id="faq">
              <h2>Frequently asked questions</h2>
              <div class="sf-faq">${sf.faq
                .map((f) => `<details class="sf-faq-item"><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`)
                .join('')}</div>
            </section>`
          : ''
      }
    </main>

    <section class="sf-contact" id="contact">
      <div class="sf-contact-inner">
        <h2>Get in touch</h2>
        <ul class="sf-contact-list">
          ${sf.address ? `<li><span class="sf-muted">Address</span> ${esc(sf.address)}</li>` : ''}
          ${sf.phone ? `<li><span class="sf-muted">Phone</span> <a href="tel:${escAttr(sf.phone)}">${esc(sf.phone)}</a></li>` : ''}
          ${sf.email ? `<li><span class="sf-muted">Email</span> <a href="mailto:${escAttr(sf.email)}">${esc(sf.email)}</a></li>` : ''}
          ${sf.hours ? `<li><span class="sf-muted">Hours</span> ${esc(sf.hours)}</li>` : ''}
        </ul>
        ${wa ? `<a class="sf-btn sf-btn-primary" href="${escAttr(waLink(wa, `Hi ${storeName}, I have a question.`))}" target="_blank" rel="noopener">Message on WhatsApp</a>` : ''}
        ${social ? `<div class="sf-social">${social}</div>` : ''}
      </div>
    </section>

    <footer class="sf-footer">
      <span>${esc(storeName)} · powered by <a href="/" rel="noopener">NetMark</a></span>
      <button class="sf-linkbtn" id="sfShare2" type="button">Copy link</button>
    </footer>

    ${
      wa
        ? `<div class="sf-sticky-cta"><a class="sf-btn sf-btn-primary" href="${escAttr(waLink(wa, `Hi ${storeName}, I'd like to place an order.`))}" target="_blank" rel="noopener">${esc(ctaLabel)}</a></div>`
        : ''
    }

    <div class="sf-quick" id="sfQuick" aria-hidden="true">
      <div class="sf-quick-card">
        <button class="sf-quick-close" type="button" id="sfQuickClose" aria-label="Close">×</button>
        <div class="sf-quick-media"><img id="sfQuickImg" src="" alt="" /></div>
        <div class="sf-quick-body">
          <span class="sf-cat" id="sfQuickCat"></span>
          <h2 id="sfQuickName"></h2>
          <div><span class="sf-price" id="sfQuickPrice"></span><span class="sf-compare" id="sfQuickCompare"></span></div>
          <p class="sf-quick-desc" id="sfQuickDesc"></p>
          <div class="sf-quick-foot" id="sfQuickFoot"></div>
        </div>
      </div>
    </div>

    ${jsonLdScript({
      '@context': 'https://schema.org',
      '@type': 'Store',
      name: storeName,
      description,
      url: pageUrl,
      image: image || undefined,
      ...(sf.logo ? { logo: sf.logo } : {}),
      ...(sf.phone ? { telephone: sf.phone } : {}),
      ...(sf.email ? { email: sf.email } : {}),
      ...(sf.address ? { address: { '@type': 'PostalAddress', streetAddress: sf.address, addressCountry: 'ZA' } } : {}),
      ...(sf.hours ? { openingHours: sf.hours } : {}),
      ...(Object.values(sf.social || {}).filter(Boolean).length ? { sameAs: Object.values(sf.social).filter(Boolean) } : {}),
      ...(ratings.count
        ? {
            aggregateRating: {
              '@type': 'AggregateRating',
              ratingValue: ratings.average,
              reviewCount: ratings.count
            },
            review: reviews.slice(0, 10).map((rv) => ({
              '@type': 'Review',
              reviewRating: { '@type': 'Rating', ratingValue: rv.rating },
              author: { '@type': 'Person', name: rv.author },
              ...(rv.comment ? { reviewBody: rv.comment } : {})
            }))
          }
        : {}),
      ...(showProducts
        ? {
            makesOffer: products.slice(0, 50).map((p) => ({
              '@type': 'Offer',
              itemOffered: { '@type': 'Product', name: p.name },
              price: Number(p.price || 0).toFixed(2),
              priceCurrency: 'ZAR',
              availability: p.inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock'
            }))
          }
        : {})
    })}`;

  root.insertAdjacentHTML('beforeend', sf.faq?.length
    ? jsonLdScript({
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: sf.faq.map((f) => ({
          '@type': 'Question',
          name: f.q,
          acceptedAnswer: { '@type': 'Answer', text: f.a }
        }))
      })
    : '');

  const doShare = async () => {
    beacon('share', activeRef);
    try {
      const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
      if (typeof nav.share === 'function') {
        await nav.share({ title, text: description, url: shareUrl });
        return;
      }
    } catch {
      return;
    }
    try {
      await navigator.clipboard.writeText(shareUrl);
      const btn = document.getElementById('sfShare');
      if (btn) btn.textContent = 'Copied!';
    } catch {
      /* clipboard unavailable */
    }
  };
  document.getElementById('sfShare')?.addEventListener('click', doShare);
  document.getElementById('sfShare2')?.addEventListener('click', doShare);

  /* --------------------------- mobile nav menu ---------------------------- */
  const burger = document.getElementById('sfBurger') as HTMLButtonElement | null;
  const mobileNav = document.getElementById('sfMobileNav') as HTMLElement | null;
  const closeMenu = () => {
    if (!burger || !mobileNav) return;
    burger.setAttribute('aria-expanded', 'false');
    burger.classList.remove('sf-burger-open');
    mobileNav.classList.remove('sf-mobile-nav-open');
    mobileNav.hidden = true;
  };
  if (burger && mobileNav) {
    burger.addEventListener('click', () => {
      const open = burger.getAttribute('aria-expanded') === 'true';
      if (open) return closeMenu();
      burger.setAttribute('aria-expanded', 'true');
      burger.classList.add('sf-burger-open');
      mobileNav.hidden = false;
      mobileNav.classList.add('sf-mobile-nav-open');
    });
    mobileNav.querySelectorAll('a').forEach((a) => a.addEventListener('click', closeMenu));
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeMenu();
    });
    window.addEventListener('resize', () => {
      if (window.innerWidth > 640) closeMenu();
    });
  }

  /* ------------------------------ quick view ------------------------------ */
  const byId = new Map(products.map((p) => [p.id, p]));
  const quick = document.getElementById('sfQuick') as HTMLElement | null;
  const qImg = document.getElementById('sfQuickImg') as HTMLImageElement | null;
  const qCat = document.getElementById('sfQuickCat') as HTMLElement | null;
  const qName = document.getElementById('sfQuickName') as HTMLElement | null;
  const qPrice = document.getElementById('sfQuickPrice') as HTMLElement | null;
  const qCompare = document.getElementById('sfQuickCompare') as HTMLElement | null;
  const qDesc = document.getElementById('sfQuickDesc') as HTMLElement | null;
  const qFoot = document.getElementById('sfQuickFoot') as HTMLElement | null;

  const closeQuick = () => quick?.classList.remove('open');
  const openQuick = (p: Product) => {
    if (!quick) return;
    if (qImg) {
      qImg.src = p.image || '';
      qImg.alt = p.name;
      qImg.style.visibility = p.image ? 'visible' : 'hidden';
    }
    if (qCat) qCat.textContent = p.category || '';
    if (qName) qName.textContent = p.name;
    if (qPrice) qPrice.textContent = fmtMoney(p.price);
    const onSale = Number(p.comparePrice || 0) > Number(p.price || 0);
    if (qCompare) {
      qCompare.textContent = onSale ? fmtMoney(p.comparePrice || 0) : '';
      qCompare.style.display = onSale ? 'inline' : 'none';
    }
    if (qDesc) qDesc.textContent = p.description || '';
    if (qFoot) {
      const enquireMsg = `Hi ${storeName}, I'm interested in "${p.name}" (${fmtMoney(p.price)}). Is it available?`;
      qFoot.innerHTML = [
        wa
          ? `<a class="sf-btn sf-btn-primary" href="${escAttr(waLink(wa, enquireMsg))}" target="_blank" rel="noopener">Enquire on WhatsApp</a>`
          : '',
        sf.phone ? `<a class="sf-btn sf-btn-ghost" href="tel:${escAttr(sf.phone)}">Call to order</a>` : '',
        !p.inStock ? `<span class="sf-badge" style="margin-left:auto">Currently sold out</span>` : ''
      ]
        .filter(Boolean)
        .join('');
    }
    quick.classList.add('open');
    quick.setAttribute('aria-hidden', 'false');
    beacon('product', activeRef);
  };

  document.getElementById('sfQuickClose')?.addEventListener('click', closeQuick);
  quick?.addEventListener('click', (e) => {
    if (e.target === quick) closeQuick();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeQuick();
  });
  root.querySelectorAll<HTMLElement>('.sf-product[data-product]').forEach((card) => {
    const p = byId.get(card.dataset.product || '');
    if (!p) return;
    card.addEventListener('click', () => openQuick(p));
    card.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter' || (e as KeyboardEvent).key === ' ') {
        e.preventDefault();
        openQuick(p);
      }
    });
  });

  /* --------------------------- category filtering ------------------------- */
  root.querySelectorAll<HTMLElement>('.sf-chip[data-cat]').forEach((chip) => {
    chip.addEventListener('click', (e) => {
      e.preventDefault();
      const cat = chip.dataset.cat || '';
      const grid = document.getElementById('sfProductGrid');
      if (!grid) return;
      grid.querySelectorAll<HTMLElement>('.sf-product').forEach((card) => {
        const p = byId.get(card.dataset.product || '');
        card.style.display = !cat || p?.category === cat ? '' : 'none';
      });
      root.querySelectorAll('.sf-chip').forEach((c) => c.classList.remove('sf-chip-active'));
      chip.classList.add('sf-chip-active');
      grid.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  /* ------------------------------ scroll spy ------------------------------ */
  const spy = () => {
    const links = root.querySelectorAll<HTMLAnchorElement>('nav a[href^="#"]');
    const pos = window.scrollY + 120;
    let current = '';
    links.forEach((a) => {
      const id = a.getAttribute('href')?.slice(1);
      const el = id ? document.getElementById(id) : null;
      if (el && el.offsetTop <= pos) current = id || '';
    });
    links.forEach((a) => a.classList.toggle('active', a.getAttribute('href') === `#${current}`));
  };
  window.addEventListener('scroll', spy, { passive: true });

  // Anonymous analytics: one view per load, plus contact intent clicks.
  document
    .querySelectorAll('a[href^="tel:"], a[href^="mailto:"], a[href*="wa.me"]')
    .forEach((el) => el.addEventListener('click', () => beacon('contact', activeRef)));
  beacon('view', activeRef);
}

void main();
