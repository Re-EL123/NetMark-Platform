import { authed, ok, fail, slugOf, getSupabase, rowOut, rowsOut } from '../http';
import { recordAudit } from '../audit';
import { newWebhookSecret } from '../webhooks';

const EVENTS = ['*', 'order.completed', 'order.created', 'commission.paid', 'payout.paid', 'customer.created'];

export default authed(async (req, res, ctx) => {
  const sb = getSupabase();
  const slug = slugOf(req);
  if (!ctx.isPlatform && ctx.role !== 'owner') return fail(res, 'Forbidden', 403);

  if (slug.length === 0 && req.method === 'GET') {
    let q = sb.from('webhooks').select('id, url, events, active, company_id, tenant_id, created_at').order('created_at', { ascending: false });
    if (!ctx.isPlatform) q = q.eq('company_id', ctx.companyId);
    const { data } = await q;
    return ok(res, { data: rowsOut(data) });
  }

  if (slug.length === 0 && req.method === 'POST') {
    const url = String(req.body?.url || '').trim();
    if (!/^https:\/\//i.test(url)) return fail(res, 'A valid https:// URL is required');
    const events = Array.isArray(req.body?.events) && req.body.events.length ? req.body.events.filter((e: string) => EVENTS.includes(e)) : ['*'];
    if (!events.length) return fail(res, 'No valid events supplied');
    const secret = req.body?.secret ? String(req.body.secret) : newWebhookSecret();
    const { data, error } = await sb
      .from('webhooks')
      .insert({
        tenant_id: ctx.tenantId,
        company_id: ctx.isPlatform ? null : ctx.companyId,
        url,
        secret,
        events,
        active: req.body?.active !== false
      })
      .select('id, url, events, active, created_at')
      .single();
    if (error) return fail(res, error.message);
    await recordAudit(req, { action: 'webhook.create', entityType: 'webhook', entityId: data.id, after: { url, events } });
    return ok(res, { data: { ...rowOut(data), secret } });
  }

  const id = slug[0];
  if (id && slug[1] === 'toggle' && req.method === 'POST') {
    let q = sb.from('webhooks').select('active').eq('id', id);
    if (!ctx.isPlatform) q = q.eq('company_id', ctx.companyId);
    const { data: cur } = await q.maybeSingle();
    if (!cur) return fail(res, 'Not found', 404);
    await sb.from('webhooks').update({ active: !cur.active }).eq('id', id);
    return ok(res, { data: { active: !cur.active } });
  }

  if (id && slug[1] === 'deliveries' && req.method === 'GET') {
    const { data } = await sb.from('webhook_deliveries').select('*').eq('webhook_id', id).order('created_at', { ascending: false }).limit(50);
    return ok(res, { data: rowsOut(data) });
  }

  if (id && req.method === 'DELETE') {
    let q = sb.from('webhooks').delete().eq('id', id);
    if (!ctx.isPlatform) q = q.eq('company_id', ctx.companyId);
    const { error } = await q;
    if (error) return fail(res, error.message);
    await recordAudit(req, { action: 'webhook.delete', entityType: 'webhook', entityId: id });
    return ok(res, { data: { deleted: true } });
  }

  return fail(res, 'Not found', 404);
});
