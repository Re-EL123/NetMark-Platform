import { authed, ok, fail, slugOf, getSupabase, rowOut, rowsOut } from '../http';
import { parseListQuery, runList } from '../paginate';
import { hasPermission } from '../permissions';
import { recordAudit } from '../audit';

export default authed(async (req, res, ctx) => {
  const sb = getSupabase();
  const slug = slugOf(req);
  const canWrite = ctx.isPlatform || hasPermission(ctx.role, 'stores.write');

  function scope(q: any) {
    if (ctx.isPlatform) return q;
    if (ctx.role === 'owner') return q.eq('company_id', ctx.companyId);
    if (ctx.role === 'storeOwner') return q.eq('store_owner_id', ctx.userId);
    if (ctx.role === 'customer') return q.eq('is_active', true);
    return q.eq('company_id', ctx.companyId);
  }

  if (slug.length === 0 && req.method === 'GET') {
    const list = parseListQuery(req);
    let q = sb.from('stores').select('*', { count: 'exact' });
    q = scope(q);
    if (req.query.isActive !== undefined) q = q.eq('is_active', String(req.query.isActive) === 'true');
    if (req.query.companyId && ctx.isPlatform) q = q.eq('company_id', String(req.query.companyId));
    const result = await runList(q, list, { searchColumns: ['name', 'slug', 'address'] });
    return ok(res, { data: rowsOut(result.data), meta: { count: result.count, page: result.page, pageSize: result.pageSize } });
  }

  if (slug.length === 0 && req.method === 'POST') {
    if (!canWrite) return fail(res, 'Forbidden', 403);
    const { name, address, distributorId, storeOwnerId, isActive, settings, companyId } = req.body || {};
    if (!name) return fail(res, 'Name is required');
    const autoSlug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `store-${Date.now()}`;
    const company = ctx.isPlatform ? req.body.companyId || ctx.companyId : ctx.companyId;
    const { data, error } = await sb
      .from('stores')
      .insert({
        name,
        slug: `${autoSlug}-${Math.random().toString(36).slice(2, 6)}`,
        company_id: company || null,
        store_owner_id: ctx.role === 'storeOwner' ? ctx.userId : req.body.storeOwnerId || null,
        distributor_id: req.body.distributorId || null,
        address: req.body.address || null,
        is_active: req.body.isActive !== false,
        settings: req.body.settings || {}
      })
      .select('*')
      .single();
    if (error) return fail(res, 'Could not create store');
    await recordAudit(req, { action: 'store.create', entityType: 'store', entityId: data.id, after: rowOut(data) });
    return ok(res, { data: rowOut(data) }, 201);
  }

  const id = slug[0];

  if (id && req.method === 'GET') {
    const { data } = await scope(sb.from('stores').select('*').eq('id', id)).maybeSingle();
    if (!data) return fail(res, 'Not found', 404);
    return ok(res, { data: rowOut(data) });
  }

  if (id && req.method === 'PUT') {
    if (!canWrite) return fail(res, 'Forbidden', 403);
    const { data: before } = await scope(sb.from('stores').select('*').eq('id', id)).maybeSingle();
    if (!before) return fail(res, 'Not found', 404);
    const b = req.body || {};
    const patch: any = {};
    for (const k of ['name', 'slug', 'address']) if (b[k] !== undefined) patch[k] = b[k];
    if (b.isActive !== undefined) patch.is_active = b.isActive;
    if (b.storeOwnerId !== undefined && (ctx.isPlatform || ctx.role === 'owner')) patch.store_owner_id = b.storeOwnerId || null;
    if (b.distributorId !== undefined && (ctx.isPlatform || ctx.role === 'owner')) patch.distributor_id = b.distributorId || null;
    if (b.settings !== undefined) patch.settings = { ...(before.settings || {}), ...b.settings };
    if (b.companyId !== undefined && ctx.isPlatform) patch.company_id = b.companyId || null;
    const { data: after } = await sb.from('stores').update(patch).eq('id', id).select('*').single();
    await recordAudit(req, { action: 'store.update', entityType: 'store', entityId: id, before: rowOut(before), after: rowOut(after) });
    return ok(res, { data: rowOut(after) });
  }

  if (id && slug[1] === 'toggle' && req.method === 'POST') {
    if (!canWrite) return fail(res, 'Forbidden', 403);
    const { data: before } = await scope(sb.from('stores').select('*').eq('id', id)).maybeSingle();
    if (!before) return fail(res, 'Not found', 404);
    const { data: after } = await sb.from('stores').update({ is_active: !before.is_active }).eq('id', id).select('*').single();
    await recordAudit(req, { action: 'store.toggle', entityType: 'store', entityId: id, after: rowOut(after) });
    return ok(res, { data: rowOut(after) });
  }

  if (id && req.method === 'DELETE') {
    if (!canWrite) return fail(res, 'Forbidden', 403);
    const { data: before } = await scope(sb.from('stores').select('*').eq('id', id)).maybeSingle();
    if (!before) return fail(res, 'Not found', 404);
    await sb.from('stores').delete().eq('id', id);
    await recordAudit(req, { action: 'store.delete', entityType: 'store', entityId: id, before: rowOut(before) });
    return ok(res, { message: 'Deleted' });
  }

  return fail(res, 'Not found', 404);
});
