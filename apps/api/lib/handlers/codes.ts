import crypto from 'crypto';
import { authed, ok, fail, slugOf, getSupabase, rowOut, rowsOut } from '../http';
import { parseListQuery, runList } from '../paginate';
import { hasPermission } from '../permissions';
import { recordAudit } from '../audit';

function makeCode(prefix = 'NM') {
  return `${prefix}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}

export default authed(async (req, res, ctx) => {
  const sb = getSupabase();
  const slug = slugOf(req);
  const canWrite = ctx.isPlatform || hasPermission(ctx.role, 'codes.write');

  if (slug[0] === 'validate' && req.method === 'POST') {
    const code = String(req.body?.code || '').toUpperCase();
    if (!code) return fail(res, 'Code is required');
    const { data } = await sb.from('distributor_codes').select('*').eq('code', code).maybeSingle();
    if (!data) return fail(res, 'Invalid code', 404);
    if (data.is_active === false) return fail(res, 'Code is no longer active');
    if (data.expires_at && new Date(data.expires_at) < new Date()) return fail(res, 'Code has expired');
    if (data.max_uses != null && Number(data.uses || 0) >= Number(data.max_uses)) return fail(res, 'Code usage limit reached');
    return ok(res, { data: { code: data.code, distributorId: data.distributor_id, valid: true } });
  }

  if (slug.length === 0 && req.method === 'GET') {
    const list = parseListQuery(req);
    let q = sb.from('distributor_codes').select('*', { count: 'exact' });
    if (ctx.isPlatform) { /* all */ }
    else if (ctx.role === 'owner') q = q.eq('company_id', ctx.companyId);
    else q = q.eq('distributor_id', ctx.userId);
    if (req.query.isActive !== undefined) q = q.eq('is_active', String(req.query.isActive) === 'true');
    const result = await runList(q, list, { searchColumns: ['code'] });
    return ok(res, { data: rowsOut(result.data), meta: { count: result.count, page: result.page, pageSize: result.pageSize } });
  }

  if (slug.length === 0 && req.method === 'POST') {
    if (!canWrite) return fail(res, 'Forbidden', 403);
    const { code, distributorId, maxUses, expiresAt, companyId } = req.body || {};
    const distributor = ctx.role === 'distributor' ? ctx.userId : distributorId || null;
    const targetCompany = ctx.isPlatform ? companyId || null : ctx.companyId;
    // Owners may only issue codes for distributors within their own company.
    if (ctx.role === 'owner' && distributor) {
      const { data: rep } = await sb.from('users').select('id, company_id, role').eq('id', distributor).maybeSingle();
      if (!rep || rep.role !== 'distributor' || rep.company_id !== ctx.companyId) {
        return fail(res, 'Distributor not found in your company', 404);
      }
    }
    const { data, error } = await sb
      .from('distributor_codes')
      .insert({
        code: (code || makeCode()).toUpperCase(),
        distributor_id: distributor,
        company_id: targetCompany,
        max_uses: maxUses ?? null,
        expires_at: expiresAt || null,
        is_active: true
      })
      .select('*')
      .single();
    if (error) {
      if (String(error.message).includes('duplicate')) return fail(res, 'That code already exists');
      return fail(res, 'Could not create code');
    }
    await recordAudit(req, { action: 'code.create', entityType: 'distributor_code', entityId: data.id, after: rowOut(data) });
    return ok(res, { data: rowOut(data) }, 201);
  }

  const id = slug[0];

  // A code may only be touched by its owning distributor, the owning company's
  // owner, or the platform.
  const canTouch = (code: any) => {
    if (ctx.isPlatform) return true;
    if (ctx.role === 'owner') return code.company_id && code.company_id === ctx.companyId;
    if (ctx.role === 'distributor') return code.distributor_id === ctx.userId;
    return false;
  };

  if (id && req.method === 'PUT') {
    if (!canWrite) return fail(res, 'Forbidden', 403);
    const { data: before } = await sb.from('distributor_codes').select('*').eq('id', id).maybeSingle();
    if (!before) return fail(res, 'Not found', 404);
    if (!canTouch(before)) return fail(res, 'Forbidden', 403);
    const b = req.body || {};
    const patch: any = {};
    if (b.maxUses !== undefined) patch.max_uses = b.maxUses;
    if (b.isActive !== undefined) patch.is_active = b.isActive;
    if (b.expiresAt !== undefined) patch.expires_at = b.expiresAt || null;
    const { data: after } = await sb.from('distributor_codes').update(patch).eq('id', id).select('*').single();
    await recordAudit(req, { action: 'code.update', entityType: 'distributor_code', entityId: id, after: rowOut(after) });
    return ok(res, { data: rowOut(after) });
  }

  if (id && slug[1] === 'toggle' && req.method === 'POST') {
    if (!canWrite) return fail(res, 'Forbidden', 403);
    const { data: before } = await sb.from('distributor_codes').select('*').eq('id', id).maybeSingle();
    if (!before) return fail(res, 'Not found', 404);
    if (!canTouch(before)) return fail(res, 'Forbidden', 403);
    const { data: after } = await sb.from('distributor_codes').update({ is_active: !before.is_active }).eq('id', id).select('*').single();
    return ok(res, { data: rowOut(after) });
  }

  if (id && req.method === 'DELETE') {
    if (!canWrite) return fail(res, 'Forbidden', 403);
    const { data: before } = await sb.from('distributor_codes').select('*').eq('id', id).maybeSingle();
    if (!before) return fail(res, 'Not found', 404);
    if (!canTouch(before)) return fail(res, 'Forbidden', 403);
    await sb.from('distributor_codes').delete().eq('id', id);
    await recordAudit(req, { action: 'code.delete', entityType: 'distributor_code', entityId: id, before: before ? rowOut(before) : null });
    return ok(res, { message: 'Deleted' });
  }

  return fail(res, 'Not found', 404);
});
