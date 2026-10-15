import { authed, ok, fail, slugOf, getSupabase, rowOut, rowsOut } from '../http';
import { parseListQuery, runList } from '../paginate';
import { hasPermission } from '../permissions';
import { recordAudit } from '../audit';

/**
 * Company product catalog.
 *
 * A company (owner) owns products and their wholesale price. Store owners do
 * not create products here — they list catalog products in their store and set
 * a retail price via /store-products.
 */
export default authed(async (req, res, ctx) => {
  const sb = getSupabase();
  const slug = slugOf(req);
  const canWrite = ctx.isPlatform || ctx.role === 'owner';

  function scope(q: any) {
    if (ctx.isPlatform) return q;
    if (ctx.role === 'owner') return q.eq('company_id', ctx.companyId);
    // store owners browse the whole marketplace catalog; customers only see
    // active products.
    return q;
  }

  if (slug.length === 0 && req.method === 'GET') {
    const list = parseListQuery(req);
    let q = sb.from('products').select('*', { count: 'exact' });
    q = scope(q);
    if (req.query.storeId) q = q.eq('store_id', String(req.query.storeId));
    if (req.query.category) q = q.eq('category', String(req.query.category));
    if (req.query.companyId && (ctx.isPlatform || ctx.role === 'owner')) {
      q = q.eq('company_id', String(req.query.companyId));
    }
    // store owners and customers only ever see active products
    if (ctx.role === 'storeOwner' || ctx.role === 'customer') q = q.eq('is_active', true);
    else if (req.query.isActive !== undefined) q = q.eq('is_active', String(req.query.isActive) === 'true');
    const result = await runList(q, list, { searchColumns: ['name', 'sku', 'description'] });
    return ok(res, { data: rowsOut(result.data), meta: { count: result.count, page: result.page, pageSize: result.pageSize } });
  }

  if (slug.length === 0 && req.method === 'POST') {
    if (!canWrite) return fail(res, 'Forbidden', 403);
    const { name, price, category, stock, sku, description, image, isActive } = req.body || {};
    if (!name) return fail(res, 'Name is required');
    const targetCompany = ctx.isPlatform ? req.body.companyId || null : ctx.companyId;
    const { data, error } = await sb
      .from('products')
      .insert({
        name,
        price: price ?? 0,
        category: category || null,
        stock: stock ?? 0,
        sku: sku || null,
        description: description || null,
        image: image || null,
        store_id: null,
        company_id: targetCompany,
        is_active: isActive !== false
      })
      .select('*')
      .single();
    if (error) return fail(res, 'Could not create product');
    await recordAudit(req, { action: 'product.create', entityType: 'product', entityId: data.id, after: rowOut(data) });
    return ok(res, { data: rowOut(data) }, 201);
  }

  const id = slug[0];

  if (id && req.method === 'GET') {
    const { data } = await scope(sb.from('products').select('*').eq('id', id)).maybeSingle();
    if (!data) return fail(res, 'Not found', 404);
    if ((ctx.role === 'storeOwner' || ctx.role === 'customer') && data.is_active === false) {
      return fail(res, 'Not found', 404);
    }
    return ok(res, { data: rowOut(data) });
  }

  if (id && req.method === 'PUT') {
    if (!canWrite) return fail(res, 'Forbidden', 403);
    const { data: before } = await scope(sb.from('products').select('*').eq('id', id)).maybeSingle();
    if (!before) return fail(res, 'Not found', 404);
    const b = req.body || {};
    const patch: any = {};
    for (const k of ['name', 'price', 'category', 'stock', 'sku', 'description', 'image']) {
      if (b[k] !== undefined) patch[k] = b[k];
    }
    if (b.isActive !== undefined) patch.is_active = b.isActive;
    if (b.companyId !== undefined && ctx.isPlatform) patch.company_id = b.companyId || null;
    const { data: after } = await sb.from('products').update(patch).eq('id', id).select('*').single();
    await recordAudit(req, { action: 'product.update', entityType: 'product', entityId: id, before: rowOut(before), after: rowOut(after) });
    return ok(res, { data: rowOut(after) });
  }

  if (id && slug[1] === 'stock' && req.method === 'POST') {
    if (!canWrite) return fail(res, 'Forbidden', 403);
    const { data: before } = await scope(sb.from('products').select('*').eq('id', id)).maybeSingle();
    if (!before) return fail(res, 'Not found', 404);
    const delta = Number(req.body?.delta ?? req.body?.stock ?? 0);
    const next = Math.max(0, Number(before.stock || 0) + delta);
    const { data: after } = await sb.from('products').update({ stock: next }).eq('id', id).select('*').single();
    await recordAudit(req, { action: 'product.stock', entityType: 'product', entityId: id, before: { stock: before.stock }, after: { stock: after.stock } });
    return ok(res, { data: rowOut(after) });
  }

  if (id && req.method === 'DELETE') {
    if (!canWrite) return fail(res, 'Forbidden', 403);
    const { data: before } = await scope(sb.from('products').select('*').eq('id', id)).maybeSingle();
    if (!before) return fail(res, 'Not found', 404);
    await sb.from('products').delete().eq('id', id);
    await sb.from('store_products').delete().eq('product_id', id);
    await recordAudit(req, { action: 'product.delete', entityType: 'product', entityId: id, before: rowOut(before) });
    return ok(res, { message: 'Deleted' });
  }

  return fail(res, 'Not found', 404);
});
