import { authed, ok, fail, slugOf, getSupabase, rowOut, rowsOut } from '../http';
import { parseListQuery, runList } from '../paginate';
import { hasPermission } from '../permissions';
import { recordAudit } from '../audit';
import { validCompanyIdsForOwner, ZERO_UUID } from '../companyLinks';
import { entitlementsForCtx, withinLimit, limitMessage } from '../planLimits';

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

  // Roles without products.read (e.g. drivers) have no access to the catalog,
  // matching the storefront listing endpoint's boundary.
  if (!ctx.isPlatform && !hasPermission(ctx.role, 'products.read')) {
    return fail(res, 'Forbidden', 403);
  }

  // A store owner sees the catalog of every company they have a valid link to.
  let linkedCompanyIds: string[] | null = null;
  if (ctx.role === 'storeOwner') linkedCompanyIds = await validCompanyIdsForOwner(sb, ctx.userId);

  function scope(q: any) {
    if (ctx.isPlatform) return q;
    if (ctx.role === 'owner') return q.eq('company_id', ctx.companyId);
    if (ctx.role === 'storeOwner') {
      return linkedCompanyIds && linkedCompanyIds.length
        ? q.in('company_id', linkedCompanyIds)
        : q.eq('id', ZERO_UUID);
    }
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

    // If store owner has a code link with a product kit, restrict catalog
    if (ctx.role === 'storeOwner') {
      const { data: links } = await sb.from('company_links').select('code_id').eq('store_owner_id', ctx.userId).eq('is_active', true);
      const codeIds = (links || []).map((l: any) => l.code_id).filter(Boolean);
      if (codeIds.length) {
        const { data: codes } = await sb.from('distributor_codes').select('*').in('id', codeIds);
        const restricted = (codes || []).filter((c: any) => c.allow_all_products === false);
        if (restricted.length) {
          const { data: allowed } = await sb.from('code_products').select('product_id').in('code_id', restricted.map((c: any) => c.id));
          const ids = [...new Set((allowed || []).map((a: any) => a.product_id))];
          if (ids.length) q = q.in('id', ids);
          else q = q.eq('id', '00000000-0000-0000-0000-000000000000');
        }
      }
    }

    else if (req.query.isActive !== undefined) q = q.eq('is_active', String(req.query.isActive) === 'true');
    const result = await runList(q, list, { searchColumns: ['name', 'sku', 'description'] });
    return ok(res, { data: rowsOut(result.data), meta: { count: result.count, page: result.page, pageSize: result.pageSize } });
  }

  if (slug.length === 0 && req.method === 'POST') {
    if (!canWrite) return fail(res, 'Forbidden', 403);
    const { name, price, category, stock, sku, description, image, gallery, isActive } = req.body || {};
    if (!name) return fail(res, 'Name is required');
    const targetCompany = ctx.isPlatform ? req.body.companyId || null : ctx.companyId;
    if (targetCompany) {
      const ent = await entitlementsForCtx(sb, ctx);
      const { count } = await sb
        .from('products')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', targetCompany);
      if (!withinLimit(ent.maxProducts, count || 0)) {
        return fail(res, limitMessage('products', ent.maxProducts), 402);
      }
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
        gallery: Array.isArray(gallery) ? gallery : [],
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
    if (b.gallery !== undefined) patch.gallery = Array.isArray(b.gallery) ? b.gallery : [];
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
