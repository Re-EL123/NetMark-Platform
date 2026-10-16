import { authed, ok, fail, slugOf, getSupabase, rowOut, rowsOut } from '../http';
import { recordAudit } from '../audit';

export default authed(async (req, res, ctx) => {
  const sb = getSupabase();
  const slug = slugOf(req);
  const isPlatform = ctx.isPlatform;

  if (slug.length === 0 && req.method === 'GET') {
    let q = sb.from('commissions').select('*').order('created_at', { ascending: false });
    if (!isPlatform && ctx.tenantId) q = q.eq('tenant_id', ctx.tenantId);
    if (!isPlatform) q = q.eq('user_id', ctx.userId);
    const { data } = await q;
    return ok(res, { data: rowsOut(data) });
  }

  if (slug[0] === 'preview' && req.method === 'POST') {
    if (!isPlatform) return fail(res, 'Forbidden', 403);
    return ok(res, { data: { preview: true, total: 0 } });
  }
  return fail(res, 'Not found', 404);
});
