import { VercelRequest, VercelResponse } from '@vercel/node';
import { getSupabase } from '../db';
import { applyCors } from '../http';
import { rateLimit, rateLimitFail } from '../rateLimit';

/**
 * Public storefront endpoint.
 *
 * Everything here is unauthenticated: a store owner shares a link like
 * `/s/<slug>` and any visitor (and search-engine crawler) can load the landing
 * page without an account. We therefore expose only a curated, whitelisted
 * subset of the store's data — never the raw `stores` row or its full
 * `settings` blob.
 *
 * Storefront configuration lives in `stores.settings.storefront` (a jsonb
 * merge on PUT /stores/<id>), so no migration is required.
 */

export interface StorefrontData {
  store: any;
  storefront: ReturnType<typeof publicStorefront>;
  products: any[];
  ratings: { average: number; count: number };
  reviews: any[];
}

function clientKey(req: VercelRequest) {
  const ip =
    (req.headers['x-forwarded-for'] as string) ||
    (req.headers['x-real-ip'] as string) ||
    (req.socket as any)?.remoteAddress ||
    'unknown';
  return `storefront:${ip}`;
}

function str(v: any, max = 2000): string {
  return typeof v === 'string' ? v.slice(0, max) : '';
}

function oneOf<T extends string>(v: any, allowed: readonly T[], fallback: T): T {
  return allowed.includes(v) ? (v as T) : fallback;
}

const LAYOUTS = ['classic', 'boutique', 'bold'] as const;
const HERO_STYLES = ['image', 'gradient', 'split'] as const;
const FONTS = ['system', 'sora', 'inter', 'playfair', 'dmserif'] as const;

/** Whitelist + normalize the public-facing storefront config. */
function publicStorefront(store: any) {
  const settings = store.settings || {};
  const sf = (settings.storefront && typeof settings.storefront === 'object' && settings.storefront) || {};
  const social = (sf.social && typeof sf.social === 'object' && sf.social) || {};

  // Trust badges — short marketing claims shown as chips under the hero.
  const badges = (Array.isArray(sf.badges) ? sf.badges : [])
    .map((b: any) => str(b, 60).trim())
    .filter(Boolean)
    .slice(0, 8);

  // FAQ entries — rendered as an accordion and as FAQPage structured data.
  const faq = (Array.isArray(sf.faq) ? sf.faq : [])
    .map((item: any) => ({
      q: str(item?.q, 160).trim(),
      a: str(item?.a, 1200).trim()
    }))
    .filter((item: any) => item.q && item.a)
    .slice(0, 20);

  // Gallery — extra images shown in a hero mosaic / showcase strip.
  const gallery = (Array.isArray(sf.gallery) ? sf.gallery : [])
    .map((g: any) => str(g, 500).trim())
    .filter(Boolean)
    .slice(0, 12);

  // Section visibility toggles + ordering. Absent = shown (backward compatible).
  const rawSections = (sf.sections && typeof sf.sections === 'object' && sf.sections) || {};
  const sections: Record<string, boolean> = {
    trust: rawSections.trust !== false,
    categories: rawSections.categories !== false,
    featured: rawSections.featured !== false,
    products: rawSections.products !== false,
    about: rawSections.about !== false,
    reviews: rawSections.reviews !== false,
    faq: rawSections.faq !== false,
    contact: rawSections.contact !== false,
    gallery: rawSections.gallery !== false
  };

  return {
    enabled: sf.enabled !== false,
    layout: oneOf(sf.layout, LAYOUTS, 'classic'),
    heroStyle: oneOf(sf.heroStyle, HERO_STYLES, 'image'),
    font: oneOf(sf.font, FONTS, 'system'),
    tagline: str(sf.tagline, 160),
    about: str(sf.about, 4000),
    logo: str(sf.logo) || str(store.logo) || null,
    banner: str(sf.banner) || str(store.banner) || null,
    themeColor: str(sf.themeColor, 32) || '#e50914',
    secondaryColor: str(sf.secondaryColor, 32) || '',
    announcement: str(sf.announcement, 200),
    badges,
    gallery,
    faq,
    sections,
    phone: str(sf.phone, 40),
    whatsapp: str(sf.whatsapp, 40),
    email: str(sf.email, 200),
    address: str(sf.address, 300) || str(store.address, 300),
    hours: str(sf.hours, 300),
    ctaLabel: str(sf.ctaLabel, 60),
    showProducts: sf.showProducts !== false,
    featured: Array.isArray(sf.featured) ? sf.featured.filter((x: any) => typeof x === 'string').slice(0, 100) : [],
    metaTitle: str(sf.metaTitle, 200),
    metaDescription: str(sf.metaDescription, 320),
    metaKeywords: str(sf.metaKeywords, 300),
    social: {
      facebook: str(social.facebook, 300),
      instagram: str(social.instagram, 300),
      tiktok: str(social.tiktok, 300),
      x: str(social.x, 300),
      youtube: str(social.youtube, 300)
    }
  };
}

function xmlEscape(v: any): string {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Base URL for canonical/shareable storefront links (the SSR host). */
export function storefrontBase(): string {
  return (
    process.env.STOREFRONT_BASE_URL ||
    process.env.API_PUBLIC_URL ||
    'https://shop.netmark.re-el.co.za'
  ).replace(/\/+$/, '');
}

export function storefrontUrl(slug: string): string {
  return `${storefrontBase()}/s/${encodeURIComponent(slug)}`;
}

/** First name only — reviews are public, so we don't expose full names. */
function displayName(name: string | null | undefined): string {
  const n = String(name || '').trim();
  if (!n) return 'Verified customer';
  return n.split(/\s+/)[0].slice(0, 40);
}

const EVENT_TYPES = new Set(['view', 'contact', 'share', 'product']);

async function resolveStore(sb: any, ref: string) {
  let { data: store } = await sb.from('stores').select('*').eq('slug', ref).maybeSingle();
  if (!store && /^[0-9a-f-]{36}$/i.test(ref)) {
    const byId = await sb.from('stores').select('*').eq('id', ref).maybeSingle();
    store = byId.data;
  }
  return store;
}

/**
 * Load everything the public storefront needs. Returns null when the store is
 * missing, inactive or its storefront is switched off. Shared by the JSON
 * endpoint and the server-rendered page so their output never diverges.
 */
export async function loadStorefront(sb: any, ref: string): Promise<StorefrontData | null> {
  if (!ref) return null;
  const store = await resolveStore(sb, ref);
  if (!store || store.is_active === false) return null;

  const storefront = publicStorefront(store);
  if (!storefront.enabled) return null;

  let products: any[] = [];
  if (storefront.showProducts) {
    const { data: listings } = await sb
      .from('store_products')
      .select('*')
      .eq('store_id', store.id)
      .eq('is_active', true);
    const ids = [...new Set((listings || []).map((l: any) => l.product_id).filter(Boolean))];
    const { data: prods } = ids.length
      ? await sb.from('products').select('*').in('id', ids).eq('is_active', true)
      : { data: [] as any[] };
    const pmap = new Map((prods || []).map((p: any) => [p.id, p]));
    products = (listings || [])
      .map((l: any) => {
        const p: any = pmap.get(l.product_id);
        if (!p) return null;
        const price = l.price != null ? Number(l.price) : Number(p.price || 0);
        const compare = l.compare_price != null ? Number(l.compare_price) : Number(p.compare_price || 0);
        const gallery = Array.isArray(p.gallery) ? p.gallery.filter((g: any) => typeof g === 'string').slice(0, 8) : [];
        return {
          id: l.id,
          productId: p.id,
          name: p.name || '',
          price,
          comparePrice: compare > price ? compare : 0,
          image: p.image || gallery[0] || null,
          gallery,
          description: p.description || '',
          category: p.category || '',
          inStock: Number(p.stock || 0) > 0
        };
      })
      .filter(Boolean);

    if (storefront.featured.length) {
      const order = new Map<string, number>(
        storefront.featured.map((id: string, i: number) => [id, i] as [string, number])
      );
      products.sort((a: any, b: any) => (order.get(a.id) ?? 9999) - (order.get(b.id) ?? 9999));
    }
  }

  // Reviews/ratings — degrade silently if the reviews table isn't present yet.
  let ratings = { average: 0, count: 0 };
  let reviews: any[] = [];
  try {
    const { data: rv } = await sb
      .from('reviews')
      .select('*')
      .eq('store_id', store.id)
      .order('created_at', { ascending: false })
      .limit(60);
    const all = (rv || []).filter((r: any) => Number(r.rating || 0) > 0);
    if (all.length) {
      const userIds = [...new Set(all.map((r: any) => r.user_id).filter(Boolean))];
      const { data: us } = userIds.length
        ? await sb.from('users').select('id,name').in('id', userIds)
        : { data: [] as any[] };
      const umap = new Map((us || []).map((u: any) => [u.id, u.name]));
      const sum = all.reduce((a: number, r: any) => a + Number(r.rating || 0), 0);
      ratings = { average: Math.round((sum / all.length) * 10) / 10, count: all.length };
      reviews = all.slice(0, 30).map((r: any) => ({
        rating: Number(r.rating || 0),
        comment: str(r.comment, 800),
        createdAt: r.created_at || null,
        author: displayName(umap.get(r.user_id) as string)
      }));
    }
  } catch {
    /* reviews not available — storefront still renders */
  }

  return { store, storefront, products, ratings, reviews };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  applyCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const slug = Array.isArray(req.query.slug) ? req.query.slug : [String(req.query.slug || '')];
  const ref = String(slug[0] || '').trim();

  if (!rateLimit(clientKey(req), { windowMs: 60000, max: 180 })) return rateLimitFail(res);

  const sb = getSupabase();

  // GET /api/storefront/sitemap -> XML index of every enabled storefront.
  if (ref === 'sitemap' || ref === 'sitemap.xml') {
    if (req.method !== 'GET') return res.status(405).json({ success: false, message: 'Method not allowed' });
    const { data } = await sb
      .from('stores')
      .select('slug,updated_at,settings')
      .eq('is_active', true)
      .limit(5000);
    const urls = (data || [])
      .filter((s: any) => s.slug && s.settings?.storefront?.enabled !== false)
      .map((s: any) => {
        const loc = storefrontUrl(s.slug);
        const lastmod = s.updated_at ? String(s.updated_at).slice(0, 10) : '';
        return `<url><loc>${xmlEscape(loc)}</loc>${lastmod ? `<lastmod>${xmlEscape(lastmod)}</lastmod>` : ''}<changefreq>weekly</changefreq></url>`;
      })
      .join('');
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    return res
      .status(200)
      .send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`);
  }

  // GET /api/storefront/landing -> public hero/landing appearance config set by
  // a platform admin (text colours, hero video). Safe to expose; no secrets.
  if (ref === 'landing') {
    if (req.method !== 'GET') return res.status(405).json({ success: false, message: 'Method not allowed' });
    const LANDING_DEFAULTS = {
      heroVideo: '/media/hero.mp4',
      heroVideoOpacity: 0.42,
      headingColor: '#fafafa',
      accentColor: '#e50914',
      accentColor2: '#f5c451',
      textColor: '#a1a1aa'
    };
    const { data } = await sb
      .from('settings')
      .select('value')
      .eq('scope', 'platform')
      .eq('key', 'landing')
      .is('company_id', null)
      .maybeSingle();
    res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    return res.status(200).json({ success: true, data: { ...LANDING_DEFAULTS, ...(data?.value || {}) } });
  }

  if (!ref) return res.status(400).json({ success: false, message: 'Missing store reference' });

  // GET /api/storefront/featured -> public showcase of live storefronts for the
  // landing page. Returns a handful of enabled stores with a few products each.
  if (ref === 'featured') {
    if (req.method !== 'GET') return res.status(405).json({ success: false, message: 'Method not allowed' });
    const { data: stores } = await sb
      .from('stores')
      .select('id,slug,settings')
      .eq('is_active', true)
      .limit(2000);
    const allLive = (stores || []).filter(
      (s: any) => s.slug && s.settings?.storefront?.enabled !== false
    );
    const live = allLive.slice(0, 8);
    const results = await Promise.all(
      live.map(async (s: any) => {
        const data = await loadStorefront(sb, s.slug).catch(() => null);
        if (!data) return null;
        return {
          store: {
            name: data.store.name || '',
            slug: data.store.slug || data.store.id,
            url: storefrontUrl(data.store.slug || data.store.id),
            tagline: data.storefront.tagline,
            themeColor: data.storefront.themeColor,
            logo: data.storefront.logo,
            banner: data.storefront.banner,
            ratings: data.ratings
          },
          products: data.products.slice(0, 4).map((p: any) => ({
            name: p.name,
            price: p.price,
            comparePrice: p.comparePrice,
            image: p.image
          }))
        };
      })
    );

    // Real network stats for the hero counters.
    let storefrontCount = allLive.length;
    let productCount = 0;
    try {
      const { count: pc } = await sb
        .from('products')
        .select('id', { count: 'exact', head: true })
        .eq('is_active', true);
      productCount = pc || 0;
    } catch {
      /* counts are best-effort */
    }

    let onTimeRate: number | null = null;
    try {
      const { data: orders } = await sb
        .from('orders')
        .select('created_at, delivered_at, delivery_status')
        .eq('delivery_status', 'delivered')
        .not('delivered_at', 'is', null)
        .limit(2000);
      const rows = (orders || []).filter((o: any) => o.delivered_at && o.created_at);
      if (rows.length) {
        // "On time" = delivered within 48h of being placed (default SLA).
        const SLA_MS = 48 * 60 * 60 * 1000;
        const onTime = rows.filter(
          (o: any) => new Date(o.delivered_at).getTime() - new Date(o.created_at).getTime() <= SLA_MS
        ).length;
        onTimeRate = Math.round((onTime / rows.length) * 100);
      }
    } catch {
      /* deliveries data may not exist yet */
    }

    res.setHeader('Cache-Control', 'public, max-age=120, stale-while-revalidate=600');
    return res.status(200).json({
      success: true,
      data: results.filter(Boolean),
      stats: { storefronts: storefrontCount, products: productCount, onTimeRate, platform: 1 }
    });
  }

  // POST /api/storefront/:slug/event — best-effort, anonymous analytics counter.
  if (String(slug[1] || '') === 'event') {
    if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method not allowed' });
    if (!rateLimit(`storefront-event:${clientKey(req)}`, { windowMs: 60000, max: 300 })) return rateLimitFail(res);
    const type = String((req.body || {}).type || '');
    if (!EVENT_TYPES.has(type)) return res.status(400).json({ success: false, message: 'Unknown event type' });
    const store = await resolveStore(sb, ref);
    if (!store || store.is_active === false) return res.status(404).json({ success: false, message: 'Storefront not found' });
    const settings = store.settings && typeof store.settings === 'object' ? store.settings : {};
    const sf = settings.storefront && typeof settings.storefront === 'object' ? settings.storefront : {};
    if (sf.enabled === false) return res.status(404).json({ success: false, message: 'This storefront is not available' });
    const stats = settings.storefrontStats && typeof settings.storefrontStats === 'object' ? settings.storefrontStats : {};
    const next = { ...stats, [type]: Number(stats[type] || 0) + 1, lastEventAt: new Date().toISOString() };
    await sb.from('stores').update({ settings: { ...settings, storefrontStats: next } }).eq('id', store.id);
    return res.status(200).json({ success: true });
  }

  if (req.method !== 'GET') return res.status(405).json({ success: false, message: 'Method not allowed' });

  const data = await loadStorefront(sb, ref);
  if (!data) return res.status(404).json({ success: false, message: 'Storefront not found' });

  res.setHeader('Cache-Control', 'public, max-age=120, stale-while-revalidate=600');
  return res.status(200).json({
    success: true,
    data: {
      store: {
        id: data.store.id,
        name: data.store.name || '',
        slug: data.store.slug || data.store.id,
        url: storefrontUrl(data.store.slug || data.store.id)
      },
      storefront: data.storefront,
      products: data.products,
      ratings: data.ratings,
      reviews: data.reviews
    }
  });
}
