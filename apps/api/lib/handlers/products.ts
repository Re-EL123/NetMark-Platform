import { authed, ok, fail, slugOf, getSupabase, rowOut, rowsOut } from '../http';
import { parseListQuery, runList } from '../paginate';
import { hasPermission } from '../permissions';
import { recordAudit } from '../audit';
import { storeIdsForUser } from '../scope';

export default authed(async (req, res, ctx) => {
  const sb = getSupabase();
  const slug = slugOf(req);
  const canWrite = ctx.isPlatform || hasPermission(ctx.role, 'products.write');

  // storeOwner/distributor have no company, so resolve their stores up front.
  let storeIds: string[] | null = null;
  if (ctx.role === 'storeOwner') storeIds = await storeIdsForUser(sb, ctx.userId, 'store_owner_id');
  else if (ctx.role === 'distributor') storeIds = await storeIdsForUser(sb, ctx.userId, 'distributor_id');

  function scope(q: any) {
    if (ctx.isPlatform) return q;
    if (ctx.role === 'customer') return q;
    if (ctx.role === 'storeOwner' || ctx.role === 'distributor') return q.in('store_id', storeIds || []);
    return q.eq('company_id', ctx.companyId);
  }

  if (slug.length === 0 && req.method === 'GET') {
    const list = parseListQuery(req);
    let q = sb.from('products').select('*', { count: 'exact' });
    q = scope(q);
    if (req.query.storeId) q = q.eq('store_id', String(req.query.storeId));
    if (req.query.category) q = q.eq('category', String(req.query.category));
    if (ctx.role === 'customer') q = q.eq('is_active', true);
    if (req.query.isActive !== undefined && ctx.role !== 'customer') q = q.eq('is_active', String(req.query.isActive) === 'true');
    const result = await runList(q, list, { searchColumns: ['name', 'sku', 'description'] });
    return ok(res, { data: rowsOut(result.data), meta: { count: result.count, page: result.page, pageSize: result.pageSize } });
  }

  if (slug.length === 0 && req.method === 'POST') {
    if (!canWrite) return fail(res, 'Forbidden', 403);
    const { name, price, category, stock, sku, description, image, storeId, companyId, isActive } = req.body || {};
    if (!name) return fail(res, 'Name is required');
    let targetCompany = ctx.isPlatform ? companyId || null : ctx.companyId;
    // storeOwners own products through a store; require and validate it.
    if (ctx.role === 'storeOwner') {
      if (!storeId) return fail(res, 'Select one of your stores for this product');
      const { data: store } = await sb.from('stores').select('id, company_id, store_owner_id').eq('id', storeId).maybeSingle();
      if (!store || store.store_owner_id !== ctx.userId) return fail(res, 'Store not found', 403);
      targetCompany = store.company_id || null;
    }
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
        store_id: storeId || null,
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
    return ok(res, { data: rowOut(data) });
  }

  if (id && req.method === 'PUT') {
    if (!canWrite) return fail(res, 'Forbidden', 403);
    const { data: before } = await scope(sb.from('products').select('*').eq('id', id)).maybeSingle();
    if (!before) return fail(res, 'Not found', 404);
    const b = req.body || {};
    const patch: any = {};
    for (const k of ['name', 'price', 'category', 'stock', 'sku', 'description', 'image', 'store_id']) {
      if (b[k] !== undefined) patch[k] = b[k];
    }
    if (b.storeId !== undefined) patch.store_id = b.storeId || null;
    if (b.isActive !== undefined) patch.is_active = b.isActive;
    if (b.companyId !== undefined && ctx.isPlatform) patch.company_id = b.companyId || null;
    // A storeOwner may only move a product between stores they own.
    if (ctx.role === 'storeOwner' && b.storeId !== undefined) {
      if (!b.storeId) return fail(res, 'Select one of your stores for this product');
      const { data: store } = await sb.from('stores').select('id, company_id, store_owner_id').eq('id', b.storeId).maybeSingle();
      if (!store || store.store_owner_id !== ctx.userId) return fail(res, 'Store not found', 403);
      patch.company_id = store.company_id || null;
    }
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
    await recordAudit(req, { action: 'product.delete', entityType: 'product', entityId: id, before: rowOut(before) });
    return ok(res, { message: 'Deleted' });
  }

  return fail(res, 'Not found', 404);
});
