import { authed, ok, fail, slugOf, getSupabase, rowOut, rowsOut } from '../http';
import { recordAudit } from '../audit';

async function isEnabled(sb: any, key: string, tenantId: string | null): Promise<boolean> {
  try {
    if (tenantId) {
      const { data: t } = await sb.from('feature_flags').select('enabled').eq('key', key).eq('tenant_id', tenantId).maybeSingle();
      if (t) return !!t.enabled;
    }
    const { data: g } = await sb.from('feature_flags').select('enabled').eq('key', key).is('tenant_id', null).maybeSingle();
    return !!g?.enabled;
  } catch {
    return false;
  }
}

export default authed(async (req, res, ctx) => {
  const sb = getSupabase();
  const slug = slugOf(req);

  // any authed user may read effective flags for their tenant
  if (slug[0] === 'check' && req.method === 'GET') {
    const key = req.query?.key as string;
    if (!key) return fail(res, 'key is required');
    return ok(res, { data: { key, enabled: await isEnabled(sb, key, ctx.tenantId) } });
  }

  if (slug.length === 0 && req.method === 'GET') {
    let q = sb.from('feature_flags').select('*').order('key');
    if (!ctx.isPlatform) q = q.or(`tenant_id.is.null,tenant_id.eq.${ctx.tenantId}`);
    const { data } = await q;
    return ok(res, { data: rowsOut(data) });
  }

  if (!ctx.isPlatform) return fail(res, 'Forbidden', 403);

  if (slug.length === 0 && req.method === 'POST') {
    const key = String(req.body?.key || '').trim();
    if (!key) return fail(res, 'key is required');
    const { data, error } = await sb
      .from('feature_flags')
      .insert({
        key,
        enabled: !!req.body?.enabled,
        rollout_percent: Number(req.body?.rolloutPercent ?? 100),
        tenant_id: req.body?.tenantId || null,
        description: req.body?.description || null
      })
      .select('*')
      .single();
    if (error) return fail(res, error.message);
    await recordAudit(req, { action: 'flag.create', entityType: 'feature_flag', entityId: data.id, after: { key } });
    return ok(res, { data: rowOut(data) });
  }

  const id = slug[0];
  if (id && req.method === 'PUT') {
    const patch: any = { updated_at: new Date().toISOString() };
    if (req.body?.enabled !== undefined) patch.enabled = !!req.body.enabled;
    if (req.body?.rolloutPercent !== undefined) patch.rollout_percent = Number(req.body.rolloutPercent);
    if (req.body?.description !== undefined) patch.description = req.body.description;
    const { data, error } = await sb.from('feature_flags').update(patch).eq('id', id).select('*').single();
    if (error) return fail(res, error.message);
    await recordAudit(req, { action: 'flag.update', entityType: 'feature_flag', entityId: id, after: patch });
    return ok(res, { data: rowOut(data) });
  }

  if (id && req.method === 'DELETE') {
    const { error } = await sb.from('feature_flags').delete().eq('id', id);
    if (error) return fail(res, error.message);
    return ok(res, { data: { deleted: true } });
  }

  return fail(res, 'Not found', 404);
});
