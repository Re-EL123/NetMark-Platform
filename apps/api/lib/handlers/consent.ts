import { authed, ok, fail, slugOf, getSupabase, rowOut, rowsOut } from '../http';
import { recordAudit } from '../audit';

export default authed(async (req, res, ctx) => {
  const sb = getSupabase();
  const slug = slugOf(req);
  const isPlatform = ctx.isPlatform;

  if (slug.length === 0 && req.method === 'GET') {
    let q = sb.from('consent_records').select('*').order('created_at', { ascending: false });
    if (!isPlatform && ctx.tenantId) q = q.eq('tenant_id', ctx.tenantId);
    if (req.query.userId && (isPlatform || String(req.query.userId) === ctx.userId)) q = q.eq('user_id', String(req.query.userId));
    const { data } = await q;
    return ok(res, { data: rowsOut(data) });
  }

  if (slug.length === 0 && req.method === 'POST') {
    const { purpose, wording, mechanism, granted } = req.body || {};
    if (!purpose || !wording) return fail(res, 'purpose and wording required');
    const { data, error } = await sb.from('consent_records').insert({
      user_id: ctx.userId,
      tenant_id: ctx.tenantId,
      purpose,
      wording,
      mechanism: mechanism || 'checkbox',
      granted: granted !== false,
      granted_at: granted !== false ? new Date().toISOString() : null,
      revoked_at: granted === false ? new Date().toISOString() : null
    }).select('*').single();
    if (error) return fail(res, error.message);
    await recordAudit(req, { action: 'consent.record', entityType: 'consent', entityId: data.id, after: rowOut(data) });
    return ok(res, { data: rowOut(data) }, 201);
  }

  const id = slug[0];
  if (id && slug[1] === 'revoke' && req.method === 'POST') {
    const { data: c } = await sb.from('consent_records').select('*').eq('id', id).maybeSingle();
    if (!c) return fail(res, 'Not found', 404);
    if (!isPlatform && c.user_id !== ctx.userId && c.tenant_id !== ctx.tenantId) return fail(res, 'Forbidden', 403);
    const { data: after } = await sb.from('consent_records').update({ granted: false, revoked_at: new Date().toISOString() }).eq('id', id).select('*').single();
    await recordAudit(req, { action: 'consent.revoke', entityType: 'consent', entityId: id, after: rowOut(after) });
    return ok(res, { data: rowOut(after) });
  }
  return fail(res, 'Not found', 404);
});
