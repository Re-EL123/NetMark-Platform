import { createHash, randomBytes } from 'crypto';
import { authed, ok, fail, slugOf, getSupabase, rowOut, rowsOut } from '../http';
import { recordAudit } from '../audit';
import { entitlementsForCtx } from '../planLimits';

function hash(key: string) {
  return createHash('sha256').update(key).digest('hex');
}

export default authed(async (req, res, ctx) => {
  const sb = getSupabase();
  const slug = slugOf(req);
  if (!ctx.isPlatform && ctx.role !== 'owner') return fail(res, 'Forbidden', 403);

  if (slug.length === 0 && req.method === 'GET') {
    let q = sb.from('api_keys').select('id, name, prefix, scopes, last_used_at, revoked_at, created_at, company_id, tenant_id').order('created_at', { ascending: false });
    if (!ctx.isPlatform) q = q.eq('company_id', ctx.companyId);
    const { data } = await q;
    return ok(res, { data: rowsOut(data) });
  }

  if (slug.length === 0 && req.method === 'POST') {
    const name = String(req.body?.name || '').trim();
    if (!name) return fail(res, 'name is required');
    if (!ctx.isPlatform) {
      const ent = await entitlementsForCtx(sb, ctx);
      if (!ent.api) return fail(res, 'API access is not included in your current plan. Upgrade to enable it.', 402);
    }
    const scopes = Array.isArray(req.body?.scopes) && req.body.scopes.length ? req.body.scopes : ['read'];
    const raw = 'nm_' + randomBytes(24).toString('hex');
    const prefix = raw.slice(0, 11);
    const { data, error } = await sb
      .from('api_keys')
      .insert({
        tenant_id: ctx.tenantId,
        company_id: ctx.isPlatform ? null : ctx.companyId,
        name,
        key_hash: hash(raw),
        prefix,
        scopes,
        created_by: ctx.userId
      })
      .select('id, name, prefix, scopes, created_at')
      .single();
    if (error) return fail(res, error.message);
    await recordAudit(req, { action: 'apikey.create', entityType: 'api_key', entityId: data.id, after: { name, scopes } });
    // raw key is shown once only
    return ok(res, { data: { ...rowOut(data), key: raw } });
  }

  const id = slug[0];
  if (id && slug[1] === 'revoke' && req.method === 'POST') {
    let q = sb.from('api_keys').update({ revoked_at: new Date().toISOString() }).eq('id', id);
    if (!ctx.isPlatform) q = q.eq('company_id', ctx.companyId);
    const { error } = await q;
    if (error) return fail(res, error.message);
    await recordAudit(req, { action: 'apikey.revoke', entityType: 'api_key', entityId: id });
    return ok(res, { data: { revoked: true } });
  }

  if (id && req.method === 'DELETE') {
    let q = sb.from('api_keys').delete().eq('id', id);
    if (!ctx.isPlatform) q = q.eq('company_id', ctx.companyId);
    const { error } = await q;
    if (error) return fail(res, error.message);
    await recordAudit(req, { action: 'apikey.delete', entityType: 'api_key', entityId: id });
    return ok(res, { data: { deleted: true } });
  }

  return fail(res, 'Not found', 404);
});
