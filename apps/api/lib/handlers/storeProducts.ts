import { authed, ok, fail, slugOf, getSupabase, rowOut } from '../http';
import { parseListQuery } from '../paginate';
import { hasPermission } from '../permissions';
import { recordAudit } from '../audit';
import { storeIdsForUser } from '../scope';

/**
 * Store product listings — the bridge between a company's catalog and the
 * storefronts that sell it.
 *
 *   company (owner)  -> owns the catalog product and its wholesale price
 *   store owner      -> lists a catalog product in their store at their own
 *                       retail price; the difference is their margin
 *   customer         -> browses active listings and buys at retail price
 */

async function decorate(sb: any, listings: any[]) {
  const productIds = [...new Set(listings.map((l) => l.product_id).filter(Boolean))];
  const storeIds = [...new Set(listings.map((l) => l.store_id).filter(Boolean))];
  const [prodRes, storeRes] = await Promise.all([
    productIds.length ? sb.from('products').select('*').in('id', productIds) : Promise.resolve({ data: [] }),
    storeIds.length ? sb.from('stores').select('*').in('id', storeIds) : Promise.resolve({ data: [] })
  ]);
  const prodMap = new Map((prodRes.data || []).map((p: any) => [p.id, p]));
  const storeMap = new Map((storeRes.data || []).map((s: any) => [s.id, s]));

  return listings.map((l) => {
    const p: any = prodMap.get(l.product_id) || {};
    const s: any = storeMap.get(l.store_id) || {};
    const basePrice = Number(p.price || 0);
    const price = l.price != null ? Number(l.price) : basePrice;
    return {
      id: l.id,
      storeId: l.store_id,
      productId: l.product_id,
      companyId: l.company_id,
      price,
      basePrice,
      margin: Math.round((price - basePrice) * 100) / 100,
      isActive: l.is_active !== false,
      name: p.name,
      sku: p.sku,
      image: p.image,
      description: p.description,
      category: p.category,
      stock: p.stock ?? 0,
      productActive: p.is_active !== false,
      storeName: s.name,
      storeActive: s.is_active !== false
    };
  });
}

export default authed(async (req, res, ctx) => {
  const sb = getSupabase();
  const slug = slugOf(req);
  const canWrite = ctx.isPlatform || ctx.role === 'storeOwner';

  if (ctx.role === 'driver') return fail(res, 'Forbidden', 403);

  const canRead = ctx.isPlatform || ctx.role === 'customer' || ctx.role === 'owner' || hasPermission(ctx.role, 'products.read');
  if (!canRead) return fail(res, 'Forbidden', 403);

  let ownedStoreIds: string[] | null = null;
  if (ctx.role === 'storeOwner') ownedStoreIds = await storeIdsForUser(sb, ctx.userId, 'store_owner_id');

  const ownsStore = async (storeId: string) => {
    if (ctx.isPlatform) return true;
    if (ctx.role !== 'storeOwner') return false;
    const { data } = await sb.from('stores').select('id, store_owner_id').eq('id', storeId).maybeSingle();
    return !!data && data.store_owner_id === ctx.userId;
  };

  /* --------------------------------- GET --------------------------------- */
  if (slug.length === 0 && req.method === 'GET') {
    const list = parseListQuery(req);
    let q = sb.from('store_products').select('*').order('created_at', { ascending: false });
    if (ctx.isPlatform) {
      /* all */
    } else if (ctx.role === 'owner') {
      q = q.eq('company_id', ctx.companyId);
    } else if (ctx.role === 'storeOwner') {
      q = q.in('store_id', ownedStoreIds || []);
    } else {
      // customers only ever see active listings
      q = q.eq('is_active', true);
    }
    if (req.query.storeId) q = q.eq('store_id', String(req.query.storeId));
    if (req.query.productId) q = q.eq('product_id', String(req.query.productId));
    if (req.query.isActive !== undefined && ctx.role !== 'customer') {
      q = q.eq('is_active', String(req.query.isActive) === 'true');
    }

    const { data } = await q;
    let items = await decorate(sb, data || []);

    if (ctx.role === 'customer') {
      items = items.filter((i) => i.isActive && i.productActive && i.storeActive);
    } else if (ctx.role === 'storeOwner') {
      items = items.filter((i) => (ownedStoreIds || []).includes(i.storeId));
    }
    if (list.search) {
      const s = list.search.toLowerCase();
      items = items.filter((i) => String(i.name || '').toLowerCase().includes(s));
    }

    const total = items.length;
    const start = (list.page - 1) * list.pageSize;
    const paged = items.slice(start, start + list.pageSize);
    return ok(res, { data: paged, meta: { count: total, page: list.page, pageSize: list.pageSize } });
  }

  /* -------------------------------- POST --------------------------------- */
  if (slug.length === 0 && req.method === 'POST') {
    if (!canWrite) return fail(res, 'Forbidden', 403);
    const { storeId, productId, price, isActive } = req.body || {};
    if (!storeId || !productId) return fail(res, 'Store and product are required');
    if (!(await ownsStore(storeId))) return fail(res, 'Store not found', 403);

    const { data: product } = await sb.from('products').select('*').eq('id', productId).maybeSingle();
    if (!product) return fail(res, 'Product not found', 404);
    if (product.is_active === false) return fail(res, 'That product is not available');

    // A store owner may only list products from the company they joined.
    if (ctx.role === 'storeOwner') {
      if (!ctx.companyId) return fail(res, 'Join a company with a referral code before adding products', 403);
      if (product.company_id && product.company_id !== ctx.companyId) {
        return fail(res, 'That product belongs to another company', 403);
      }
      const { data: store } = await sb.from('stores').select('company_id').eq('id', storeId).maybeSingle();
      if (store?.company_id && product.company_id && store.company_id !== product.company_id) {
        return fail(res, 'That store is linked to a different company', 403);
      }
    }

    const retail = price != null && price !== '' ? Number(price) : Number(product.price || 0);
    const { data: existing } = await sb
      .from('store_products')
      .select('*')
      .eq('store_id', storeId)
      .eq('product_id', productId)
      .maybeSingle();

    if (existing) {
      const { data } = await sb
        .from('store_products')
        .update({ price: retail, is_active: isActive !== false })
        .eq('id', existing.id)
        .select('*')
        .single();
      await recordAudit(req, { action: 'listing.update', entityType: 'store_product', entityId: existing.id, after: rowOut(data) });
      const [out] = await decorate(sb, [data]);
      return ok(res, { data: out });
    }

    const { data, error } = await sb
      .from('store_products')
      .insert({
        store_id: storeId,
        product_id: productId,
        company_id: product.company_id || null,
        price: retail,
        is_active: isActive !== false
      })
      .select('*')
      .single();
    if (error) return fail(res, 'Could not add product to store');
    await recordAudit(req, { action: 'listing.create', entityType: 'store_product', entityId: data.id, after: rowOut(data) });
    const [out] = await decorate(sb, [data]);
    return ok(res, { data: out }, 201);
  }

  const id = slug[0];

  if (id && req.method === 'PUT') {
    if (!canWrite) return fail(res, 'Forbidden', 403);
    const { data: before } = await sb.from('store_products').select('*').eq('id', id).maybeSingle();
    if (!before) return fail(res, 'Not found', 404);
    if (!(await ownsStore(before.store_id))) return fail(res, 'Forbidden', 403);
    const b = req.body || {};
    const patch: any = {};
    if (b.price !== undefined) patch.price = b.price === '' || b.price == null ? null : Number(b.price);
    if (b.isActive !== undefined) patch.is_active = b.isActive;
    const { data: after } = await sb.from('store_products').update(patch).eq('id', id).select('*').single();
    await recordAudit(req, { action: 'listing.update', entityType: 'store_product', entityId: id, after: rowOut(after) });
    const [out] = await decorate(sb, [after]);
    return ok(res, { data: out });
  }

  if (id && req.method === 'DELETE') {
    if (!canWrite) return fail(res, 'Forbidden', 403);
    const { data: before } = await sb.from('store_products').select('*').eq('id', id).maybeSingle();
    if (!before) return fail(res, 'Not found', 404);
    if (!(await ownsStore(before.store_id))) return fail(res, 'Forbidden', 403);
    await sb.from('store_products').delete().eq('id', id);
    await recordAudit(req, { action: 'listing.delete', entityType: 'store_product', entityId: id, before: rowOut(before) });
    return ok(res, { message: 'Removed from store' });
  }

  return fail(res, 'Not found', 404);
});
