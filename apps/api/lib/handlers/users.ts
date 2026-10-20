import crypto from 'crypto';
import { authed, ok, fail, slugOf, getSupabase, rowOut, rowsOut } from '../http';
import { parseListQuery, runList } from '../paginate';
import { hasPermission, ROLES } from '../permissions';
import { recordAudit } from '../audit';
import { rateLimit, rateLimitFail } from '../rateLimit';
import { entitlementsForCtx, withinLimit, limitMessage } from '../planLimits';
import { ensureMembership } from '../ranks';

function tempPassword() {
  return 'Nm-' + crypto.randomBytes(6).toString('base64url') + '!9';
}

const OWNER_CREATABLE = ['customer', 'storeOwner', 'driver'];

export default authed(async (req, res, ctx) => {
  const sb = getSupabase();
  const slug = slugOf(req);

  const canRead = ctx.isPlatform || hasPermission(ctx.role, 'users.read');
  const canWrite = ctx.isPlatform || hasPermission(ctx.role, 'users.write');
  if (!canRead) return fail(res, 'Forbidden', 403);

  // scope helper: platform sees everything, everyone else sees their company.
  const scope = (q: any) => {
    if (ctx.isPlatform) return q;
    return q.eq('company_id', ctx.companyId);
  };

  if (slug.length === 0 && req.method === 'GET') {
    const list = parseListQuery(req);
    let q = sb.from('users').select('*', { count: 'exact' });
    q = scope(q);
    if (req.query.role) q = q.eq('role', String(req.query.role));
    if (req.query.status) q = q.eq('status', String(req.query.status));
    else q = q.neq('status', 'deleted');
    const result = await runList(q, list, { searchColumns: ['name', 'email', 'phone'] });
    return ok(res, { data: rowsOut(result.data), meta: { count: result.count, page: result.page, pageSize: result.pageSize } });
  }

  if (slug.length === 0 && req.method === 'POST') {
    if (!canWrite) return fail(res, 'Forbidden', 403);
    const { name, email, phone, password, role, companyId, status, sponsorId } = req.body || {};
    if (!name || !email) return fail(res, 'Name and email are required');
    const targetRole = role || 'customer';
    if (!ROLES.includes(targetRole)) return fail(res, 'Invalid role');
    const targetCompany = ctx.isPlatform ? companyId || null : ctx.companyId;
    if (!ctx.isPlatform && !OWNER_CREATABLE.includes(targetRole)) {
      return fail(res, 'You cannot create a user with that role', 403);
    }
    if (!ctx.isPlatform && !targetCompany) return fail(res, 'No company scope');

    // Optional sponsor: the member who recruited this user. Must be in the same
    // company (a company cannot sponsor across tenant boundaries).
    let sponsor: string | null = null;
    if (sponsorId) {
      const { data: sponsorRow } = await sb.from('users').select('id, company_id').eq('id', sponsorId).maybeSingle();
      if (!sponsorRow) return fail(res, 'Sponsor not found');
      if (targetCompany && sponsorRow.company_id !== targetCompany) return fail(res, 'Sponsor must belong to the same company');
      sponsor = sponsorRow.id;
    }

    if (targetCompany) {
      const ent = await entitlementsForCtx(sb, ctx);
      const { count } = await sb
        .from('users')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', targetCompany);
      if (!withinLimit(ent.maxTeamMembers, count || 0)) {
        return fail(res, limitMessage('team members', ent.maxTeamMembers), 402);
      }
    }

    const pw = password || tempPassword();
    const { data: created, error: authErr } = await sb.auth.admin.createUser({
      email,
      password: pw,
      email_confirm: true,
      user_metadata: { name }
    });
    if (authErr || !created?.user) return fail(res, authErr?.message || 'Could not create user');

    // Inherit the company's tenant when scoped to one; otherwise a fresh tenant.
    let tenantId: string | null = null;
    if (targetCompany) {
      const { data: companyRow } = await sb.from('companies').select('tenant_id').eq('id', targetCompany).maybeSingle();
      tenantId = companyRow?.tenant_id || null;
    }
    if (!tenantId) tenantId = crypto.randomUUID();

    const { data: user, error } = await sb
      .from('users')
      .insert({
        id: created.user.id,
        name,
        email,
        phone: phone || null,
        role: targetRole,
        company_id: targetCompany,
        tenant_id: tenantId,
        status: status || 'active',
        distributor_id: sponsor,
        verification_status: ctx.isPlatform ? 'verified' : 'pending'
      })
      .select('*')
      .single();
    if (error) return fail(res, 'Could not create user record');
    if (sponsor && targetCompany) {
      try {
        await ensureMembership(sb, { companyId: targetCompany, userId: user.id, sponsorId: sponsor, tenantId });
      } catch (memberErr) {
        console.error('user create membership error', memberErr);
      }
    }
    await recordAudit(req, { action: 'user.create', entityType: 'user', entityId: user.id, companyId: targetCompany, after: rowOut(user) });
    if (targetRole === 'driver') {
      await sb.from('drivers').insert({ user_id: user.id, company_id: targetCompany, status: 'pending' });
    }
    return ok(res, { data: { user: rowOut(user), temporaryPassword: password ? undefined : pw } }, 201);
  }

  const id = slug[0];

  if (id && req.method === 'GET') {
    const { data } = await scope(sb.from('users').select('*').eq('id', id)).maybeSingle();
    if (!data) return fail(res, 'Not found', 404);
    return ok(res, { data: rowOut(data) });
  }

  if (id && req.method === 'PUT') {
    const { data: before } = await scope(sb.from('users').select('*').eq('id', id)).maybeSingle();
    if (!before) return fail(res, 'Not found', 404);
    const self = id === ctx.userId;
    if (!canWrite && !self) return fail(res, 'Forbidden', 403);

    const b = req.body || {};
    const patch: any = {};
    if (b.name) patch.name = b.name;
    if (b.phone !== undefined) patch.phone = b.phone;
    if (b.profileImage !== undefined) patch.profile_image = b.profileImage;

    if (!self && canWrite) {
      if (b.role && ROLES.includes(b.role)) {
        if (!ctx.isPlatform && !OWNER_CREATABLE.includes(b.role)) return fail(res, 'Cannot assign that role', 403);
        patch.role = b.role;
      }
      if (b.status) patch.status = b.status;
      if (b.verificationStatus) patch.verification_status = b.verificationStatus;
      if (b.notes !== undefined) patch.notes = b.notes;
      if (b.companyId !== undefined && ctx.isPlatform) patch.company_id = b.companyId || null;
    }

    const { data: after } = await sb.from('users').update(patch).eq('id', id).select('*').single();
    await recordAudit(req, { action: 'user.update', entityType: 'user', entityId: id, before: rowOut(before), after: rowOut(after) });
    return ok(res, { data: rowOut(after) });
  }

  if (id && slug[1] === 'reset-password' && req.method === 'POST') {
    const rk = `users:reset:${(req.headers['x-forwarded-for'] as string) || (req.headers['x-real-ip'] as string) || (req.socket as any)?.remoteAddress || id}`;
    if (!rateLimit(rk, { windowMs: 300000, max: 5 })) return rateLimitFail(res);
    if (!canWrite && id !== ctx.userId) return fail(res, 'Forbidden', 403);
    const pw = tempPassword();
    const { error } = await sb.auth.admin.updateUserById(id, { password: pw });
    if (error) return fail(res, error.message);
    await recordAudit(req, { action: 'user.resetPassword', entityType: 'user', entityId: id });
    return ok(res, { data: { temporaryPassword: pw } });
  }

  if (id && req.method === 'DELETE') {
    if (!ctx.isPlatform && !canWrite) return fail(res, 'Forbidden', 403);
    if (id === ctx.userId) return fail(res, 'Cannot delete your own account', 403);
    const { data: before } = await scope(sb.from('users').select('*').eq('id', id)).maybeSingle();
    if (!before) return fail(res, 'Not found', 404);
    // Prevent deleting the last owner of a company
    if (before.role === 'owner' && before.company_id) {
      const { count: ownerCount } = await sb
        .from('users')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', before.company_id)
        .eq('role', 'owner')
        .neq('status', 'deleted');
      if ((ownerCount || 0) <= 1) {
        return fail(res, 'Cannot delete the last owner of this company', 403);
      }
    }
    if (before.role === 'platformAdmin' && !ctx.isPlatform) {
      return fail(res, 'Only platform admins may delete platform admins', 403);
    }
    // Soft delete to preserve history
    await sb
      .from('users')
      .update({ status: 'deleted', deleted_at: new Date().toISOString() })
      .eq('id', id);
    await sb.auth.admin.deleteUser(id).catch(() => {});
    await recordAudit(req, { action: 'user.delete', entityType: 'user', entityId: id, before: rowOut(before) });
    return ok(res, { message: 'Deleted' });
  }

  return fail(res, 'Not found', 404);
});
