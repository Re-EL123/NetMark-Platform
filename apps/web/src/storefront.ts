import './storefront.css';
import { API_BASE_URL } from './config';
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
  image: string | null;
  description: string;
  category: string;
  inStock: boolean;
}

interface StorefrontConfig {
  tagline: string;
  about: string;
  logo: string | null;
  banner: string | null;
  themeColor: string;
  phone: string;
  whatsapp: string;
  email: string;
  address: string;
  hours: string;
  ctaLabel: string;
  showProducts: boolean;
  metaTitle: string;
  metaDescription: string;
  metaKeywords: string;
  social: Record<string, string>;
}

interface Payload {
  store: { id: string; name: string; slug: string; url: string };
  storefront: StorefrontConfig;
  products: Product[];
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

function productCard(p: Product, wa: string, storeName: string): string {
  const enquire = wa
    ? `<a class="sf-btn sf-btn-ghost" href="${escAttr(waLink(wa, `Hi ${storeName}, I'm interested in "${p.name}" (${fmtMoney(p.price)}). Is it available?`))}" target="_blank" rel="noopener">Enquire</a>`
    : '';
  const initial = (p.name || '?').charAt(0).toUpperCase();
  return `
    <article class="sf-product">
      <div class="sf-product-media">
        ${p.image ? `<img src="${escAttr(p.image)}" alt="${escAttr(p.name)}" loading="lazy" />` : `<div class="sf-product-ph">${esc(initial)}</div>`}
        ${!p.inStock ? `<span class="sf-out">Out of stock</span>` : ''}
      </div>
      <div class="sf-product-body">
        ${p.category ? `<span class="sf-cat">${esc(p.category)}</span>` : ''}
        <h3>${esc(p.name)}</h3>
        ${p.description ? `<p>${esc(p.description.length > 120 ? p.description.slice(0, 120) + '…' : p.description)}</p>` : ''}
        <div class="sf-product-foot">
          <span class="sf-price">${esc(fmtMoney(p.price))}</span>
          ${enquire}
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
  const origin = location.origin;
  const base = import.meta.env.BASE_URL || '/';
  const basePath = base.endsWith('/') ? base.slice(0, -1) : base;
  const pageUrl = `${origin}${basePath}/storefront/?s=${encodeURIComponent(store.slug)}`;
  const refCode = getReferralCode();
  const shareUrl = refCode ? `${pageUrl}&ref=${encodeURIComponent(refCode)}` : pageUrl;

  const title = sf.metaTitle || `${store.name}${sf.tagline ? ' — ' + sf.tagline : ''}`;
  const description =
    sf.metaDescription || sf.tagline || sf.about.slice(0, 160) || `Browse products from ${store.name}.`;
  const image = sf.banner || sf.logo || `${origin}${base}favicon.png`;

  document.title = title;
  setMeta('name', 'description', description);
  if (sf.metaKeywords) setMeta('name', 'keywords', sf.metaKeywords);
  setMeta('name', 'theme-color', sf.themeColor);
  setMeta('property', 'og:type', 'website');
  setMeta('property', 'og:site_name', 'NetMark');
  setMeta('property', 'og:title', title);
  setMeta('property', 'og:description', description);
  setMeta('property', 'og:url', pageUrl);
  setMeta('property', 'og:image', image);
  setMeta('name', 'twitter:card', 'summary_large_image');
  setMeta('name', 'twitter:title', title);
  setMeta('name', 'twitter:description', description);
  setMeta('name', 'twitter:image', image);
  setCanonical(pageUrl);
  document.documentElement.style.setProperty('--sf-accent', sf.themeColor || '#e50914');

  const wa = sf.whatsapp;
  const storeName = store.name;
  const ctaLabel = sf.ctaLabel || (wa ? 'Order on WhatsApp' : sf.phone ? 'Call us' : 'Contact us');
  const heroCta = wa
    ? `<a class="sf-btn sf-btn-primary" href="${escAttr(waLink(wa, `Hi ${storeName}, I'd like to place an order.`))}" target="_blank" rel="noopener">${esc(ctaLabel)}</a>`
    : sf.phone
      ? `<a class="sf-btn sf-btn-primary" href="tel:${escAttr(sf.phone)}">${esc(ctaLabel)}</a>`
      : sf.email
        ? `<a class="sf-btn sf-btn-primary" href="mailto:${escAttr(sf.email)}">${esc(ctaLabel)}</a>`
        : '';

  const showProducts = sf.showProducts && products.length > 0;
  const social = socialLinks(sf.social);

  root.innerHTML = `
    <header class="sf-header">
      <a class="sf-brand" href="${escAttr(pageUrl)}">
        ${sf.logo ? `<img src="${escAttr(sf.logo)}" alt="${escAttr(storeName)} logo" />` : `<span class="sf-brand-dot"></span>`}
        <span>${esc(storeName)}</span>
      </a>
      <nav>
        ${showProducts ? `<a href="#products">Products</a>` : ''}
        ${sf.about ? `<a href="#about">About</a>` : ''}
        <a href="#contact">Contact</a>
      </nav>
      <button class="sf-share" id="sfShare" type="button">Share</button>
    </header>

    <section class="sf-hero"${sf.banner ? ` style="background-image:linear-gradient(rgba(10,10,12,.55),rgba(10,10,12,.72)),url('${escAttr(sf.banner)}')"` : ''}>
      <div class="sf-hero-inner">
        ${sf.logo ? `<img class="sf-hero-logo" src="${escAttr(sf.logo)}" alt="${escAttr(storeName)}" />` : ''}
        <h1>${esc(storeName)}</h1>
        ${sf.tagline ? `<p class="sf-tagline">${esc(sf.tagline)}</p>` : ''}
        <div class="sf-hero-cta">${heroCta}</div>
      </div>
    </section>

    <main class="sf-main">
      ${
        showProducts
          ? `<section class="sf-section" id="products">
              <h2>Products</h2>
              <div class="sf-grid">${products.map((p) => productCard(p, wa, storeName)).join('')}</div>
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

  const doShare = async () => {
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
}

void main();
