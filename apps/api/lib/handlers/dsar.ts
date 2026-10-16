import { authed, ok, fail, slugOf, getSupabase, rowOut, rowsOut } from '../http';
import { recordAudit } from '../audit';

export default authed(async (req, res, ctx) => {
  const sb = getSupabase();
  const slug = slugOf(req);
  const isPlatform = ctx.isPlatform;

  if (slug.length === 0 && req.method === 'GET') {
    let q = sb.from('dsar_requests').select('*').order('created_at', { ascending: false });
    if (!isPlatform && ctx.tenantId) q = q.eq('tenant_id', ctx.tenantId);
    if (!isPlatform) q = q.eq('user_id', ctx.userId);
    const { data } = await q;
    return ok(res, { data: rowsOut(data) });
  }

  if (slug.length === 0 && req.method === 'POST') {
    const { type, details } = req.body || {};
    if (!type || !['access','correct','delete'].includes(type)) return fail(res, 'invalid type');
    const due = new Date(Date.now() + 30*24*3600*1000).toISOString();
    const { data, error } = await sb.from('dsar_requests').insert({
      user_id: ctx.userId,
      tenant_id: ctx.tenantId,
      type,
      status: 'pending',
      details: details || {},
      due_at: due
    }).select('*').single();
    if (error) return fail(res, error.message);
    await recordAudit(req, { action: 'dsar.create', entityType: 'dsar', entityId: data.id, after: rowOut(data) });
    return ok(res, { data: rowOut(data) }, 201);
  }

  const id = slug[0];
  if (id && req.method === 'PUT') {
    if (!isPlatform) return fail(res, 'Forbidden', 403);
    const { data: before } = await sb.from('dsar_requests').select('*').eq('id', id).maybeSingle();
    if (!before) return fail(res, 'Not found', 404);
    const { status, response } = req.body || {};
    const patch: any = {};
    if (status) patch.status = status;
    if (response) patch.response = response;
    if (status === 'completed') patch.completed_at = new Date().toISOString();
    const { data: after } = await sb.from('dsar_requests').update(patch).eq('id', id).select('*').single();
    await recordAudit(req, { action: 'dsar.update', entityType: 'dsar', entityId: id, after: rowOut(after) });
    return ok(res, { data: rowOut(after) });
  }
  return fail(res, 'Not found', 404);
});
