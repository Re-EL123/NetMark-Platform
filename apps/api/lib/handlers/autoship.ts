import { authed, ok, fail, slugOf, getSupabase, rowOut, rowsOut } from '../http';
import { recordAudit } from '../audit';
import { getCompanyEntitlements } from '../planLimits';

export default authed(async (req, res, ctx) => {
  const sb = getSupabase();
  const slug = slugOf(req);
  const isPlatform = ctx.isPlatform;

  if (slug.length === 0 && req.method === 'GET') {
    let q = sb.from('autoship_subscriptions').select('*').order('next_run_at');
    if (!isPlatform && ctx.userId) q = q.eq('user_id', ctx.userId);
    if (ctx.tenantId) q = q.eq('tenant_id', ctx.tenantId);
    const { data } = await q;
    return ok(res, { data: rowsOut(data) });
  }

  if (slug.length === 0 && req.method === 'POST') {
    const { orderId, intervalDays, items } = req.body || {};
    if (!orderId) return fail(res, 'orderId required');
    const { data: order } = await sb.from('orders').select('company_id').eq('id', orderId).maybeSingle();
    if (order?.company_id) {
      const { entitlements } = await getCompanyEntitlements(sb, order.company_id);
      if (!entitlements.autoship) {
        return fail(res, 'Autoship is not available for this order. The store must upgrade to enable it.', 402);
      }
    }
    const next = new Date(Date.now() + (Number(intervalDays)||30)*86400000).toISOString();
    const { data, error } = await sb.from('autoship_subscriptions').insert({
      tenant_id: ctx.tenantId,
      user_id: ctx.userId,
      order_id: orderId,
      interval_days: Number(intervalDays)||30,
      next_run_at: next,
      items: items||[],
      status: 'active'
    }).select('*').single();
    if (error) return fail(res, error.message);
    await recordAudit(req, { action: 'autoship.create', entityType: 'autoship', entityId: data.id, after: rowOut(data) });
    return ok(res, { data: rowOut(data) }, 201);
  }

  const id = slug[0];
  if (id && slug[1] === 'cancel' && req.method === 'POST') {
    const { data: before } = await sb.from('autoship_subscriptions').select('*').eq('id', id).maybeSingle();
    if (!before) return fail(res, 'Not found', 404);
    if (!isPlatform && before.user_id !== ctx.userId) return fail(res, 'Forbidden', 403);
    const { data: after } = await sb.from('autoship_subscriptions').update({ status: 'cancelled', cancelled_at: new Date().toISOString() }).eq('id', id).select('*').single();
    await recordAudit(req, { action: 'autoship.cancel', entityType: 'autoship', entityId: id, after: rowOut(after) });
    return ok(res, { data: rowOut(after) });
  }
  return fail(res, 'Not found', 404);
});
