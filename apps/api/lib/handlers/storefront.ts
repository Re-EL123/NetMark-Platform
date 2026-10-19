import { VercelRequest, VercelResponse } from '@vercel/node';
import { getSupabase } from '../db';
import { applyCors } from '../http';
import { rateLimit, rateLimitFail } from '../rateLimit';

/**
 * Public storefront endpoint.
 *
 * Everything here is unauthenticated: a store owner shares a link like
 * `/storefront/?s=<slug>` and any visitor (and search-engine crawler) can load
 * the landing page without an account. We therefore expose only a curated,
 * whitelisted subset of the store's data — never the raw `stores` row or its
 * full `settings` blob.
 *
 * Storefront configuration lives in `stores.settings.storefront` (a jsonb
 * merge on PUT /stores/<id>), so no migration is required.
 */

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

/** Whitelist + normalize the public-facing storefront config. */
function publicStorefront(store: any) {
  const settings = store.settings || {};
  const sf = (settings.storefront && typeof settings.storefront === 'object' && settings.storefront) || {};
  const social = (sf.social && typeof sf.social === 'object' && sf.social) || {};
  return {
    enabled: sf.enabled !== false,
    tagline: str(sf.tagline, 160),
    about: str(sf.about, 4000),
    logo: str(sf.logo) || str(store.logo) || null,
    banner: str(sf.banner) || str(store.banner) || null,
    themeColor: str(sf.themeColor, 32) || '#e50914',
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

function siteBase(): string {
  return (process.env.PUBLIC_SITE_URL || 'https://netmark.re-el.co.za').replace(/\/+$/, '');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
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
    const base = siteBase();
    const urls = (data || [])
      .filter((s: any) => s.slug && (s.settings?.storefront?.enabled !== false))
      .map((s: any) => {
        const loc = `${base}/storefront/?s=${encodeURIComponent(s.slug)}`;
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

  if (req.method !== 'GET') return res.status(405).json({ success: false, message: 'Method not allowed' });
  if (!ref) return res.status(400).json({ success: false, message: 'Missing store reference' });

  // Resolve by slug first, then by id for robustness.
  let { data: store } = await sb.from('stores').select('*').eq('slug', ref).maybeSingle();
  if (!store && /^[0-9a-f-]{36}$/i.test(ref)) {
    const byId = await sb.from('stores').select('*').eq('id', ref).maybeSingle();
    store = byId.data;
  }
  if (!store || store.is_active === false) {
    return res.status(404).json({ success: false, message: 'Storefront not found' });
  }

  const storefront = publicStorefront(store);
  if (!storefront.enabled) {
    return res.status(404).json({ success: false, message: 'This storefront is not available' });
  }

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
        return {
          id: l.id,
          productId: p.id,
          name: p.name || '',
          price,
          image: p.image || (Array.isArray(p.gallery) && p.gallery[0]) || null,
          description: p.description || '',
          category: p.category || '',
          inStock: Number(p.stock || 0) > 0
        };
      })
      .filter(Boolean);

    if (storefront.featured.length) {
      const order = new Map<string, number>(storefront.featured.map((id: string, i: number) => [id, i] as [string, number]));
      products.sort((a: any, b: any) => (order.get(a.id) ?? 9999) - (order.get(b.id) ?? 9999));
    }
  }

  res.setHeader('Cache-Control', 'public, max-age=120, stale-while-revalidate=600');
  return res.status(200).json({
    success: true,
    data: {
      store: {
        id: store.id,
        name: store.name || '',
        slug: store.slug || store.id,
        url: `${siteBase()}/storefront/?s=${encodeURIComponent(store.slug || store.id)}`
      },
      storefront,
      products
    }
  });
}
