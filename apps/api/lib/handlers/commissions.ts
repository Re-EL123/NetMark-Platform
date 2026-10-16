import { authed, ok, fail, slugOf, getSupabase, rowOut, rowsOut } from '../http';
import { recordAudit } from '../audit';
import { recordCommission, releaseDueCommissions } from '../commissionEngine';

export default authed(async (req, res, ctx) => {
  const sb = getSupabase();
  const slug = slugOf(req);
  const isPlatform = ctx.isPlatform;

  if (slug.length === 0 && req.method === 'GET') {
    // Lazily matures any commission whose hold window has passed so users see
    // an accurate available balance without waiting for the daily cron.
    await releaseDueCommissions(sb, 100).catch(() => {});
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
  if (slug[0] === 'simulate' && req.method === 'POST') {
    if (!isPlatform) return fail(res, 'Forbidden', 403);
    const { userId, amountZar, bonusType, level } = req.body || {};
    if (!userId || !amountZar) return fail(res, 'userId and amountZar required');
    const c = await recordCommission(sb, { tenantId: ctx.tenantId, userId, amountZar: Number(amountZar), bonusType, level: level?Number(level):null });
    return ok(res, { data: rowOut(c) });
  }
  return fail(res, 'Not found', 404);
});
