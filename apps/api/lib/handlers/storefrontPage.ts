import { VercelRequest, VercelResponse } from '@vercel/node';
import { getSupabase } from '../db';
import { applyCors } from '../http';
import { rateLimit, rateLimitFail } from '../rateLimit';
import { loadStorefront, storefrontUrl, StorefrontData } from './storefront';

/**
 * Server-rendered storefront page (mounted at `/s/<slug>`).
 *
 * This is NOT a separate Vercel serverless function — it is a module imported
 * by `api/index.ts`, so the project still deploys a single function (Hobby's
 * 12-function limit is unaffected).
 *
 * Strategy: render the full page server-side (so crawlers and no-JS clients get
 * real content + meta), then reuse the already-built client bundle from the
 * static site so signed-in style interactivity (share, analytics) still works.
 * The client bundle lives on the web host, which serves `Access-Control-Allow-Origin: *`.
 */

const WEB_BASE = (process.env.WEB_BASE_URL || 'https://netmark.re-el.co.za').replace(/\/+$/, '');
// The static site's asset filenames are content-hashed and change on every
// deploy, so cache the shell only briefly — a long TTL would serve links to
// chunks that no longer exist. Server-rendered body content keeps the page
// usable even during this short window.
const CACHE_TTL = 60 * 1000;
let baseCache = '';
let baseCachedAt = 0;

function esc(v: any): string {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function money(v: any): string {
  return `R ${Number(v || 0).toFixed(2)}`;
}

function safeJson(obj: any): string {
  return JSON.stringify(obj).replace(/</g, '\\u003c');
}

function waDigits(v: string): string {
  const d = String(v || '').replace(/[^\d]/g, '');
  return d.startsWith('0') ? `27${d.slice(1)}` : d;
}

function waLink(number: string, text: string): string {
  return `https://wa.me/${waDigits(number)}?text=${encodeURIComponent(text)}`;
}

function buildJsonLd(d: StorefrontData, url: string): any {
  const sf = d.storefront;
  const image = sf.banner || sf.logo || undefined;
  return {
    '@context': 'https://schema.org',
    '@type': 'Store',
    name: d.store.name,
    ...(sf.metaDescription || sf.tagline ? { description: sf.metaDescription || sf.tagline } : {}),
    url,
    ...(image ? { image } : {}),
    ...(sf.logo ? { logo: sf.logo } : {}),
    ...(sf.phone ? { telephone: sf.phone } : {}),
    ...(sf.email ? { email: sf.email } : {}),
    ...(sf.address ? { address: { '@type': 'PostalAddress', streetAddress: sf.address, addressCountry: 'ZA' } } : {}),
    ...(sf.hours ? { openingHours: sf.hours } : {}),
    ...(Object.values(sf.social || {}).filter(Boolean).length
      ? { sameAs: Object.values(sf.social).filter(Boolean) }
      : {}),
    ...(d.ratings.count
      ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: d.ratings.average, reviewCount: d.ratings.count } }
      : {}),
    ...(d.products.length
      ? {
          makesOffer: d.products.slice(0, 50).map((p) => ({
            '@type': 'Offer',
            itemOffered: { '@type': 'Product', name: p.name },
            price: Number(p.price || 0).toFixed(2),
            priceCurrency: 'ZAR',
            availability: p.inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock'
          }))
        }
      : {})
  };
}

/** FAQPage structured data (Google rich results). */
function buildFaqLd(faq: { q: string; a: string }[]): any | null {
  if (!faq || !faq.length) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faq.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: item.a }
    }))
  };
}

const FONT_STACKS: Record<string, string> = {
  system: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  sora: "'Sora', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  inter: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  playfair: "'Playfair Display', Georgia, 'Times New Roman', serif",
  dmserif: "'DM Serif Display', Georgia, 'Times New Roman', serif"
};

/** Google Fonts stylesheet for the chosen storefront typeface (non-system only). */
function fontLink(font: string): string {
  const family =
    font === 'sora'
      ? 'Sora:wght@400;500;600;700;800'
      : font === 'inter'
        ? 'Inter:wght@400;500;600;700;800'
        : font === 'playfair'
          ? 'Playfair+Display:wght@500;600;700'
          : font === 'dmserif'
            ? 'DM+Serif+Display:ital@0;1'
            : '';
  if (!family) return '';
  return `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=${family}&display=swap">`;
}

function buildHead(d: StorefrontData, url: string): string {
  const sf = d.storefront;
  const title = sf.metaTitle || `${d.store.name}${sf.tagline ? ' — ' + sf.tagline : ''}`;
  const desc =
    sf.metaDescription || sf.tagline || (sf.about || '').slice(0, 160) || `Browse products from ${d.store.name}.`;
  const image = sf.banner || sf.logo || '';
  const font = FONT_STACKS[sf.font] || FONT_STACKS.system;
  const themeVars = `:root{--sf-accent:${esc(sf.themeColor)};--sf-accent-2:${esc(sf.secondaryColor || sf.themeColor)};--sf-font:${font}}body{font-family:var(--sf-font)}`;
  const faqLd = buildFaqLd(sf.faq);
  return [
    `<meta charset="UTF-8">`,
    `<meta name="viewport" content="width=device-width, initial-scale=1.0">`,
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(desc)}">`,
    sf.metaKeywords ? `<meta name="keywords" content="${esc(sf.metaKeywords)}">` : '',
    `<meta name="robots" content="index, follow">`,
    `<meta name="theme-color" content="${esc(sf.themeColor)}">`,
    `<link rel="canonical" href="${esc(url)}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="NetMark">`,
    `<meta property="og:title" content="${esc(title)}">`,
    `<meta property="og:description" content="${esc(desc)}">`,
    `<meta property="og:url" content="${esc(url)}">`,
    image ? `<meta property="og:image" content="${esc(image)}">` : '',
    `<meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}">`,
    `<meta name="twitter:title" content="${esc(title)}">`,
    `<meta name="twitter:description" content="${esc(desc)}">`,
    image ? `<meta name="twitter:image" content="${esc(image)}">` : '',
    fontLink(sf.font),
    `<style>${themeVars}</style>`,
    `<script type="application/ld+json">${safeJson(buildJsonLd(d, url))}</script>`,
    faqLd ? `<script type="application/ld+json">${safeJson(faqLd)}</script>` : ''
  ]
    .filter(Boolean)
    .join('\n    ');
}

/** Server-rendered inner HTML for #sf-root — mirrors the client layout. */
function renderBody(d: StorefrontData, url: string): string {
  const sf = d.storefront;
  const name = d.store.name;
  const wa = sf.whatsapp;
  const sections = sf.sections || {};
  const ctaLabel = sf.ctaLabel || (wa ? 'Order on WhatsApp' : sf.phone ? 'Call us' : 'Contact us');
  const heroCta = wa
    ? `<a class="sf-btn sf-btn-primary" href="${esc(waLink(wa, `Hi ${name}, I'd like to place an order.`))}" target="_blank" rel="noopener">${esc(ctaLabel)}</a>`
    : sf.phone
      ? `<a class="sf-btn sf-btn-primary" href="tel:${esc(sf.phone)}">${esc(ctaLabel)}</a>`
      : '';

  const isSplit = sf.heroStyle === 'split';
  const isGradient = sf.heroStyle === 'gradient';
  const heroBg = !isGradient && !isSplit && sf.banner
    ? ` style="background-image:linear-gradient(rgba(10,10,12,.5),rgba(10,10,12,.7)),url('${esc(sf.banner)}')"`
    : '';

  const showProducts = sections.products !== false && sf.showProducts && d.products.length > 0;
  const featuredIds = new Set(sf.featured || []);
  const featured = showProducts ? d.products.filter((p) => featuredIds.has(p.id)) : [];
  const featuredSet = new Set(featured.map((p) => p.id));
  const rest = showProducts ? d.products.filter((p) => !featuredSet.has(p.id)) : [];

  const productCard = (p: any) => {
    const onSale = Number(p.comparePrice || 0) > Number(p.price || 0);
    const badges = [
      onSale ? `<span class="sf-tag sf-tag-sale">Sale</span>` : '',
      featuredIds.has(p.id) ? `<span class="sf-tag sf-tag-star">★ Featured</span>` : '',
      !p.inStock ? `<span class="sf-tag sf-tag-out">Sold out</span>` : ''
    ].join('');
    return `<article class="sf-product">
        <div class="sf-product-media">
          ${p.image ? `<img src="${esc(p.image)}" alt="${esc(p.name)}" loading="lazy" />` : `<div class="sf-product-ph">${esc((p.name || '?').charAt(0).toUpperCase())}</div>`}
          ${badges ? `<div class="sf-tags">${badges}</div>` : ''}
        </div>
        <div class="sf-product-body">
          ${p.category ? `<span class="sf-cat">${esc(p.category)}</span>` : ''}
          <h3>${esc(p.name)}</h3>
          ${p.description ? `<p>${esc(String(p.description).slice(0, 120))}</p>` : ''}
          <div class="sf-product-foot"><span class="sf-price">${esc(money(p.price))}</span>${onSale ? `<span class="sf-compare">${esc(money(p.comparePrice))}</span>` : ''}</div>
        </div>
      </article>`;
  };

  const productGrid = d.products.map(productCard).join('');

  // Category chips derived from product categories.
  const categories = showProducts
    ? [...new Set(d.products.map((p) => p.category).filter(Boolean))].slice(0, 12)
    : [];
  const categoriesHtml =
    sections.categories !== false && categories.length > 1
      ? `<section class="sf-section sf-cats-section"><div class="sf-cats">${categories
          .map((c) => `<a class="sf-chip" href="#products">${esc(c)}</a>`)
          .join('')}</div></section>`
      : '';

  const trustHtml =
    sections.trust !== false && sf.badges && sf.badges.length
      ? `<section class="sf-trust"><div class="sf-trust-inner">${sf.badges
          .map((b: string) => `<span class="sf-badge"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>${esc(b)}</span>`)
          .join('')}</div></section>`
      : '';

  const featuredHtml =
    sections.featured !== false && featured.length
      ? `<section class="sf-section" id="featured"><h2>Featured</h2><div class="sf-grid sf-grid-featured">${featured
          .map(productCard)
          .join('')}</div></section>`
      : '';

  const gallery = (sf.gallery || []).filter((g: string) => typeof g === 'string');
  const galleryHtml =
    sections.gallery !== false && gallery.length
      ? `<section class="sf-section" id="gallery"><h2>Gallery</h2><div class="sf-gallery">${gallery
          .map((g: string) => `<a class="sf-gallery-item" href="${esc(g)}" target="_blank" rel="noopener"><img src="${esc(g)}" alt="" loading="lazy" /></a>`)
          .join('')}</div></section>`
      : '';

  const faqHtml =
    sections.faq !== false && sf.faq && sf.faq.length
      ? `<section class="sf-section" id="faq"><h2>Frequently asked questions</h2><div class="sf-faq">${sf.faq
          .map(
            (f: { q: string; a: string }) => `<details class="sf-faq-item"><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`
          )
          .join('')}</div></section>`
      : '';

  const reviews = d.reviews
    .map(
      (r) => `<article class="sf-review">
        <div class="sf-review-head"><span class="sf-review-author">${esc(r.author)}</span><span class="sf-stars">${'★'.repeat(Math.max(0, Math.min(5, Math.round(r.rating))))}</span></div>
        ${r.comment ? `<p class="sf-review-body">${esc(r.comment)}</p>` : ''}
      </article>`
    )
    .join('');

  const navLinks = [
    featured.length ? '<a href="#featured">Featured</a>' : '',
    showProducts ? '<a href="#products">Products</a>' : '',
    gallery.length ? '<a href="#gallery">Gallery</a>' : '',
    sf.about ? '<a href="#about">About</a>' : '',
    d.ratings.count ? '<a href="#reviews">Reviews</a>' : '',
    sf.faq && sf.faq.length ? '<a href="#faq">FAQ</a>' : '',
    '<a href="#contact">Contact</a>'
  ]
    .filter(Boolean)
    .join('');

  return `
    ${sf.announcement ? `<div class="sf-announce"><div class="sf-announce-inner">${esc(sf.announcement)}</div></div>` : ''}
    <header class="sf-header">
      <a class="sf-brand" href="${esc(url)}">${sf.logo ? `<img src="${esc(sf.logo)}" alt="${esc(name)} logo" />` : '<span class="sf-brand-dot"></span>'}<span>${esc(name)}</span></a>
      <nav>${navLinks}</nav>
      <button class="sf-burger" id="sfBurger" type="button" aria-label="Open menu" aria-expanded="false" aria-controls="sfMobileNav"><span></span><span></span><span></span></button>
    </header>
    <div class="sf-mobile-nav" id="sfMobileNav" hidden><nav>${navLinks}</nav></div>
    <section class="sf-hero sf-hero-${esc(sf.heroStyle)}"${heroBg}>
      <div class="sf-hero-inner">
        ${
          isSplit
            ? `<div class="sf-hero-copy">${sf.logo ? `<img class="sf-hero-logo" src="${esc(sf.logo)}" alt="${esc(name)}" />` : ''}<h1>${esc(name)}</h1>${sf.tagline ? `<p class="sf-tagline">${esc(sf.tagline)}</p>` : ''}<div class="sf-hero-cta">${heroCta}</div></div>${sf.banner ? `<div class="sf-hero-media"><img src="${esc(sf.banner)}" alt="" /></div>` : ''}`
            : `${sf.logo ? `<img class="sf-hero-logo" src="${esc(sf.logo)}" alt="${esc(name)}" />` : ''}<h1>${esc(name)}</h1>${sf.tagline ? `<p class="sf-tagline">${esc(sf.tagline)}</p>` : ''}<div class="sf-hero-cta">${heroCta}</div>`
        }
      </div>
    </section>
    ${trustHtml}
    <main class="sf-main">
      ${categoriesHtml}
      ${featuredHtml}
      ${showProducts ? `<section class="sf-section" id="products"><h2>Products</h2><div class="sf-grid">${rest.length ? rest.map(productCard).join('') : productGrid}</div></section>` : ''}
      ${galleryHtml}
      ${sf.about ? `<section class="sf-section" id="about"><h2>About ${esc(name)}</h2><p>${esc(sf.about).replace(/\n/g, '<br />')}</p></section>` : ''}
      ${
        d.ratings.count
          ? `<section class="sf-section" id="reviews"><h2>Reviews</h2><div class="sf-rating-summary"><strong>${Number(d.ratings.average).toFixed(1)}</strong><span class="sf-muted">${d.ratings.count} review${d.ratings.count === 1 ? '' : 's'}</span></div><div class="sf-reviews">${reviews}</div></section>`
          : ''
      }
      ${faqHtml}
    </main>
    <section class="sf-contact" id="contact">
      <div class="sf-contact-inner">
        <h2>Get in touch</h2>
        <ul class="sf-contact-list">
          ${sf.address ? `<li><span class="sf-muted">Address</span> ${esc(sf.address)}</li>` : ''}
          ${sf.phone ? `<li><span class="sf-muted">Phone</span> <a href="tel:${esc(sf.phone)}">${esc(sf.phone)}</a></li>` : ''}
          ${sf.email ? `<li><span class="sf-muted">Email</span> <a href="mailto:${esc(sf.email)}">${esc(sf.email)}</a></li>` : ''}
          ${sf.hours ? `<li><span class="sf-muted">Hours</span> ${esc(sf.hours)}</li>` : ''}
        </ul>
        ${wa ? `<a class="sf-btn sf-btn-primary" href="${esc(waLink(wa, `Hi ${name}, I have a question.`))}" target="_blank" rel="noopener">Message on WhatsApp</a>` : ''}
      </div>
    </section>
    <footer class="sf-footer"><span>${esc(name)} · powered by <a href="${esc(WEB_BASE)}" rel="noopener">NetMark</a></span></footer>`;
}

/** Rewrite root-relative asset/icon paths to the static web host. */
function rebaseAssets(html: string): string {
  return html
    .replace(/(["'])\/assets\//g, `$1${WEB_BASE}/assets/`)
    .replace(/(["'])\/favicon/g, `$1${WEB_BASE}/favicon`);
}

function inject(html: string, head: string, body: string): string {
  let out = html
    .replace(/<title>[\s\S]*?<\/title>/gi, '')
    .replace(/<meta\b[^>]*>/gi, '')
    .replace(/<link\b[^>]*rel=["']?canonical["']?[^>]*>/gi, '')
    .replace(/<script type="application\/ld\+json" id="sf-jsonld">[\s\S]*?<\/script>/gi, '');
  out = out.replace(/<head([^>]*)>/i, `<head$1>\n    ${head}`);
  out = out.replace(
    /<div id="sf-root">[\s\S]*?<\/div>(\s*(?:<script|<\/body>))/i,
    `<div id="sf-root">${body}</div>$1`
  );
  return out;
}

async function fetchBase(): Promise<string> {
  const now = Date.now();
  if (baseCache && now - baseCachedAt < CACHE_TTL) return baseCache;
  try {
    const res = await fetch(`${WEB_BASE}/storefront/`, { cache: 'no-store' });
    if (res.ok) {
      baseCache = await res.text();
      baseCachedAt = now;
    }
  } catch {
    /* keep stale cache if any */
  }
  return baseCache;
}

function standaloneHtml(d: StorefrontData, head: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    ${head}
    <link rel="stylesheet" href="${WEB_BASE}/assets/storefront.css">
</head>
<body>
  <div id="sf-root">${body}</div>
</body>
</html>`;
}

function notFoundHtml(): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Store not found — NetMark</title><meta name="robots" content="noindex"></head><body style="font-family:system-ui,sans-serif;text-align:center;padding:80px 24px"><h1>Store not found</h1><p>This storefront does not exist or is no longer available.</p><a href="${esc(WEB_BASE)}">Go to NetMark</a></body></html>`;
}

export default async function storefrontPage(req: VercelRequest, res: VercelResponse, slug: string) {
  applyCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ success: false, message: 'Method not allowed' });

  const ip = (req.headers['x-forwarded-for'] as string) || (req.socket as any)?.remoteAddress || 'unknown';
  if (!rateLimit(`storefront-page:${ip}`, { windowMs: 60000, max: 180 })) return rateLimitFail(res);

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  const ref = String(slug || '').trim();
  if (!ref) {
    res.status(404);
    return res.send(notFoundHtml());
  }

  const sb = getSupabase();
  const data = await loadStorefront(sb, ref);
  if (!data) {
    res.status(404);
    return res.send(notFoundHtml());
  }

  const url = storefrontUrl(data.store.slug || data.store.id);
  const head = buildHead(data, url);
  const body = renderBody(data, url);
  const base = await fetchBase();
  const html = base ? inject(rebaseAssets(base), head, body) : standaloneHtml(data, head, body);

  res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=600, stale-while-revalidate=86400');
  return res.status(200).send(html);
}
