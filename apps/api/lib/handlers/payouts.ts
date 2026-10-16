import { authed, ok, fail, slugOf, getSupabase, rowOut, rowsOut } from '../http';
import { recordAudit } from '../audit';

export default authed(async (req, res, ctx) => {
  const sb = getSupabase();
  const slug = slugOf(req);
  const isPlatform = ctx.isPlatform;

  if (slug.length === 0 && req.method === 'GET') {
    let q = sb.from('payout_batches').select('*').order('created_at', { ascending: false });
    if (!isPlatform && ctx.tenantId) q = q.eq('tenant_id', ctx.tenantId);
    const { data } = await q;
    return ok(res, { data: rowsOut(data) });
  }

  if (slug.length === 0 && req.method === 'POST') {
    if (!isPlatform) return fail(res, 'Forbidden', 403);
    const { companyId, totalZar } = req.body || {};
    const { data, error } = await sb.from('payout_batches').insert({
      tenant_id: ctx.tenantId,
      company_id: companyId || null,
      currency: 'ZAR',
      total_zar: totalZar || 0,
      status: 'draft',
      bank_format: 'EFT'
    }).select('*').single();
    if (error) return fail(res, error.message);
    await recordAudit(req, { action: 'payout.batch.create', entityType: 'payout_batch', entityId: data.id, after: rowOut(data) });
    return ok(res, { data: rowOut(data) }, 201);
  }
  return fail(res, 'Not found', 404);
});
