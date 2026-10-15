import crypto from 'crypto';
import { authed, ok, fail, slugOf, getSupabase, rowOut, rowsOut } from '../http';
import { parseListQuery, runList } from '../paginate';
import { hasPermission, ROLES } from '../permissions';
import { recordAudit } from '../audit';

function tempPassword() {
  return 'Nm-' + crypto.randomBytes(6).toString('base64url') + '!9';
}

const OWNER_CREATABLE = ['customer', 'storeOwner', 'distributor', 'driver'];

export default authed(async (req, res, ctx) => {
  const sb = getSupabase();
  const slug = slugOf(req);

  const canRead = ctx.isPlatform || hasPermission(ctx.role, 'users.read');
  const canWrite = ctx.isPlatform || hasPermission(ctx.role, 'users.write');
  if (!canRead) return fail(res, 'Forbidden', 403);

  // scope helper: platform sees everything, others see their company
  const scope = (q: any) => (ctx.isPlatform ? q : q.eq('company_id', ctx.companyId));

  if (slug.length === 0 && req.method === 'GET') {
    const list = parseListQuery(req);
    let q = sb.from('users').select('*', { count: 'exact' });
    q = scope(q);
    if (req.query.role) q = q.eq('role', String(req.query.role));
    if (req.query.status) q = q.eq('status', String(req.query.status));
    const result = await runList(q, list, { searchColumns: ['name', 'email', 'phone'] });
    return ok(res, { data: rowsOut(result.data), meta: { count: result.count, page: result.page, pageSize: result.pageSize } });
  }

  if (slug.length === 0 && req.method === 'POST') {
    if (!canWrite) return fail(res, 'Forbidden', 403);
    const { name, email, phone, password, role, companyId, status } = req.body || {};
    if (!name || !email) return fail(res, 'Name and email are required');
    const targetRole = role || 'customer';
    if (!ROLES.includes(targetRole)) return fail(res, 'Invalid role');
    const targetCompany = ctx.isPlatform ? companyId || null : ctx.companyId;
    if (!ctx.isPlatform && !OWNER_CREATABLE.includes(targetRole)) {
      return fail(res, 'You cannot create a user with that role', 403);
    }
    if (!ctx.isPlatform && !targetCompany) return fail(res, 'No company scope');

    const pw = password || tempPassword();
    const { data: created, error: authErr } = await sb.auth.admin.createUser({
      email,
      password: pw,
      email_confirm: true,
      user_metadata: { name }
    });
    if (authErr || !created?.user) return fail(res, authErr?.message || 'Could not create user');
    const { data: user, error } = await sb
      .from('users')
      .insert({
        id: created.user.id,
        name,
        email,
        phone: phone || null,
        role: targetRole,
        company_id: targetCompany,
        status: status || 'active',
        verification_status: ctx.isPlatform ? 'verified' : 'pending'
      })
      .select('*')
      .single();
    if (error) return fail(res, 'Could not create user record');
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
    if (!canWrite && id !== ctx.userId) return fail(res, 'Forbidden', 403);
    const pw = tempPassword();
    const { error } = await sb.auth.admin.updateUserById(id, { password: pw });
    if (error) return fail(res, error.message);
    await recordAudit(req, { action: 'user.resetPassword', entityType: 'user', entityId: id });
    return ok(res, { data: { temporaryPassword: pw } });
  }

  if (id && req.method === 'DELETE') {
    if (!ctx.isPlatform && !canWrite) return fail(res, 'Forbidden', 403);
    const { data: before } = await scope(sb.from('users').select('*').eq('id', id)).maybeSingle();
    if (!before) return fail(res, 'Not found', 404);
    await sb.auth.admin.deleteUser(id).catch(() => {});
    await sb.from('users').delete().eq('id', id);
    await recordAudit(req, { action: 'user.delete', entityType: 'user', entityId: id, before: rowOut(before) });
    return ok(res, { message: 'Deleted' });
  }

  return fail(res, 'Not found', 404);
});
