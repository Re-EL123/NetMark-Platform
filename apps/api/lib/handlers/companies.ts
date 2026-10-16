import { authed, ok, fail, slugOf, getSupabase, rowOut, rowsOut } from '../http';
import { parseListQuery, runList } from '../paginate';
import { hasPermission } from '../permissions';
import { recordAudit } from '../audit';

export default authed(async (req, res, ctx) => {
  const sb = getSupabase();
  const slug = slugOf(req);
  const canWrite = ctx.isPlatform || hasPermission(ctx.role, 'settings.write');

  if (slug.length === 0 && req.method === 'GET') {
    const list = parseListQuery(req);
    let q = sb.from('companies').select('*', { count: 'exact' });
    if (!ctx.isPlatform) {
      if (!ctx.companyId) return ok(res, { data: [], meta: { count: 0, page: 1, pageSize: list.pageSize } });
      q = q.eq('id', ctx.companyId);
    }
    if (req.query.status) q = q.eq('status', String(req.query.status));
    const result = await runList(q, list, { searchColumns: ['name', 'slug'] });
    return ok(res, { data: rowsOut(result.data), meta: { count: result.count, page: result.page, pageSize: result.pageSize } });
  }

  if (slug.length === 0 && req.method === 'POST') {
    if (!ctx.isPlatform) return fail(res, 'Forbidden', 403);
    const { name, slug: companySlug, plan, ownerId, address, settings, logo } = req.body || {};
    if (!name) return fail(res, 'Name is required');
    const autoSlug =
      (companySlug || name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') ||
      `company-${Date.now()}`;
    const { data, error } = await sb
      .from('companies')
      .insert({ name, slug: autoSlug, plan: plan || 'standard', logo: logo || null, owner_id: ownerId || null, settings: settings || {} })
      .select('*')
      .single();
    if (error) {
      if (String(error.message).includes('duplicate')) return fail(res, 'A company with that slug already exists');
      return fail(res, 'Could not create company');
    }
    if (ownerId) await sb.from('users').update({ company_id: data.id }).eq('id', ownerId);
    if (address) await sb.from('companies').update({ settings: { ...(data.settings || {}), address } }).eq('id', data.id);
    await recordAudit(req, { action: 'company.create', entityType: 'company', entityId: data.id, after: rowOut(data) });
    return ok(res, { data: rowOut(data) }, 201);
  }

  const id = slug[0];

  if (id && req.method === 'GET') {
    if (!ctx.isPlatform && ctx.companyId !== id) return fail(res, 'Forbidden', 403);
    const { data } = await sb.from('companies').select('*').eq('id', id).maybeSingle();
    if (!data) return fail(res, 'Not found', 404);
    return ok(res, { data: rowOut(data) });
  }

  if (id && req.method === 'PUT') {
    if (!canWrite) return fail(res, 'Forbidden', 403);
    if (!ctx.isPlatform && ctx.companyId !== id) return fail(res, 'Forbidden', 403);
    const { data: before } = await sb.from('companies').select('*').eq('id', id).maybeSingle();
    if (!before) return fail(res, 'Not found', 404);
    const b = req.body || {};
    const patch: any = {};
    for (const k of ['name', 'slug', 'plan']) if (b[k] !== undefined) patch[k] = b[k];
    if (b.logo !== undefined) patch.logo = b.logo;
    if (b.coverImage !== undefined) patch.cover_image = b.coverImage;
    if (b.documents !== undefined) patch.documents = Array.isArray(b.documents) ? b.documents : [];
    if (b.settings !== undefined) patch.settings = { ...(before.settings || {}), ...b.settings };
    if (b.ownerId !== undefined && ctx.isPlatform) patch.owner_id = b.ownerId || null;
    if (b.status && ctx.isPlatform) patch.status = b.status;
    const { data: after } = await sb.from('companies').update(patch).eq('id', id).select('*').single();
    await recordAudit(req, { action: 'company.update', entityType: 'company', entityId: id, before: rowOut(before), after: rowOut(after) });
    return ok(res, { data: rowOut(after) });
  }

  if (id && (slug[1] === 'suspend' || slug[1] === 'reactivate') && req.method === 'POST') {
    if (!ctx.isPlatform) return fail(res, 'Forbidden', 403);
    const status = slug[1] === 'suspend' ? 'suspended' : 'active';
    const { data: after } = await sb
      .from('companies')
      .update({ status, suspended_reason: req.body?.reason || null })
      .eq('id', id)
      .select('*')
      .single();
    if (!after) return fail(res, 'Not found', 404);
    // Suspend/reactivate every non-admin user in the company.
    await sb.from('users').update({ status }).eq('company_id', id).neq('role', 'platformAdmin');
    await recordAudit(req, { action: `company.${slug[1]}`, entityType: 'company', entityId: id, after: rowOut(after) });
    return ok(res, { data: rowOut(after) });
  }

  if (id && slug[1] === 'stats' && req.method === 'GET') {
    if (!ctx.isPlatform && ctx.companyId !== id) return fail(res, 'Forbidden', 403);
    const count = async (table: string, col = 'company_id') => {
      const { count: c } = await sb.from(table).select('id', { count: 'exact', head: true }).eq(col, id);
      return c || 0;
    };
    const [users, stores, products, orders, drivers, appointments] = await Promise.all([
      count('users'),
      count('stores'),
      count('products'),
      count('orders'),
      count('drivers'),
      count('appointments')
    ]);
    const { data: paid } = await sb.from('orders').select('total').eq('company_id', id).eq('payment_status', 'paid');
    const revenue = (paid || []).reduce((s: number, o: any) => s + Number(o.total || 0), 0);
    return ok(res, { data: { users, stores, products, orders, drivers, appointments, revenue } });
  }

  if (id && req.method === 'DELETE') {
    if (!ctx.isPlatform) return fail(res, 'Forbidden', 403);
    const { data: before } = await sb.from('companies').select('*').eq('id', id).maybeSingle();
    await sb.from('companies').delete().eq('id', id);
    await recordAudit(req, { action: 'company.delete', entityType: 'company', entityId: id, before: before ? rowOut(before) : null });
    return ok(res, { message: 'Deleted' });
  }

  return fail(res, 'Not found', 404);
});
