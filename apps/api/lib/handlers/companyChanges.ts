import { authed, ok, fail, slugOf, getSupabase, rowOut, rowsOut } from '../http';
import { hasPermission } from '../permissions';
import { recordAudit } from '../audit';
import { notify } from '../notify';

/** Company fields an owner is allowed to propose changing. */
const ALLOWED_COMPANY = ['name', 'logo', 'coverImage', 'contact', 'address'];
/** Delivery/contact settings an owner may propose (stored in the settings blob). */
const ALLOWED_SETTINGS = ['address', 'phone', 'deliveryFee', 'deliveryRadiusKm', 'description', 'website'];

function sanitize(changes: any): { company: Record<string, any>; settings: Record<string, any> } {
  const src = changes || {};
  const company: Record<string, any> = {};
  const settings: Record<string, any> = {};
  for (const k of ALLOWED_COMPANY) {
    if (src[k] !== undefined) company[k] = src[k];
  }
  const s = src.settings || {};
  for (const k of ALLOWED_SETTINGS) {
    if (s[k] !== undefined) settings[k] = s[k];
  }
  return { company, settings };
}

async function readSetting(sb: any, companyId: string, key: string) {
  const { data } = await sb
    .from('settings')
    .select('*')
    .eq('scope', 'company')
    .eq('company_id', companyId)
    .eq('key', key)
    .maybeSingle();
  return data;
}

async function upsertSetting(sb: any, companyId: string, key: string, value: any, userId: string) {
  const existing = await readSetting(sb, companyId, key);
  if (existing) {
    await sb
      .from('settings')
      .update({ value: { ...(existing.value || {}), ...value }, updated_by: userId })
      .eq('id', existing.id);
  } else {
    await sb.from('settings').insert({ scope: 'company', company_id: companyId, key, value, updated_by: userId });
  }
}

export default authed(async (req, res, ctx) => {
  const sb = getSupabase();
  const slug = slugOf(req);
  const isPlatform = ctx.isPlatform;
  const canApprove = isPlatform;
  const canSubmit = isPlatform || hasPermission(ctx.role, 'settings.write');

  if (ctx.role !== 'owner' && !isPlatform) return fail(res, 'Forbidden', 403);

  // ---- GET /company-changes ----
  if (slug.length === 0 && req.method === 'GET') {
    let q = sb.from('company_change_requests').select('*').order('created_at', { ascending: false });
    if (isPlatform) {
      if (req.query.status) q = q.eq('status', String(req.query.status));
      if (req.query.companyId) q = q.eq('company_id', String(req.query.companyId));
    } else {
      if (!ctx.companyId) return ok(res, { data: [] });
      q = q.eq('company_id', ctx.companyId);
    }
    const { data, error } = await q;
    if (error) return fail(res, error.message);
    const list = rowsOut(data);
    // Attach company name for the admin review list.
    const ids = [...new Set(list.map((r: any) => r.companyId).filter(Boolean))];
    if (ids.length) {
      const { data: companies } = await sb.from('companies').select('id, name, logo').in('id', ids);
      const byId = Object.fromEntries((companies || []).map((c: any) => [c.id, rowOut(c)]));
      for (const r of list) (r as any).company = byId[(r as any).companyId] || null;
    }
    return ok(res, { data: list });
  }

  if (!canSubmit) return fail(res, 'Forbidden', 403);

  // ---- POST /company-changes  (submit / replace pending proposal) ----
  if (slug.length === 0 && req.method === 'POST') {
    if (isPlatform) return fail(res, 'Admins edit companies directly', 400);
    if (!ctx.companyId) return fail(res, 'No company scope');
    const changes = sanitize(req.body?.changes || req.body || {});
    if (!Object.keys(changes.company).length && !Object.keys(changes.settings).length) {
      return fail(res, 'Nothing to change');
    }
    const { data: existing } = await sb
      .from('company_change_requests')
      .select('*')
      .eq('company_id', ctx.companyId)
      .eq('status', 'pending')
      .maybeSingle();
    let saved;
    if (existing) {
      const { data } = await sb
        .from('company_change_requests')
        .update({ changes, requested_by: ctx.userId, requested_by_email: ctx.user?.email || null })
        .eq('id', existing.id)
        .select('*')
        .single();
      saved = data;
    } else {
      const { data } = await sb
        .from('company_change_requests')
        .insert({
          company_id: ctx.companyId,
          requested_by: ctx.userId,
          requested_by_email: ctx.user?.email || null,
          changes
        })
        .select('*')
        .single();
      saved = data;
    }
    await recordAudit(req, {
      action: 'company.changeRequest',
      entityType: 'company',
      entityId: ctx.companyId,
      companyId: ctx.companyId,
      after: changes
    });
    await notify({
      role: 'platformAdmin',
      type: 'company',
      title: 'Company change request',
      body: `${ctx.user?.name || 'A company owner'} submitted changes for approval.`,
      data: { requestId: saved?.id, companyId: ctx.companyId }
    });
    try { await notify({ role: 'platformAdmin', type: 'system', title: 'New company change request', body: 'Company change request submitted.', data: { href: '#/platform/company-changes' } }); } catch (e) {}
    return ok(res, { data: rowOut(saved) }, 201);
  }

  const id = slug[0];
  if (id && slug[1] === 'approve' && req.method === 'POST') {
    if (!canApprove) return fail(res, 'Forbidden', 403);
    const { data: request } = await sb.from('company_change_requests').select('*').eq('id', id).maybeSingle();
    if (!request) return fail(res, 'Not found', 404);
    if (request.status !== 'pending') return fail(res, 'This request has already been reviewed');
    const changes = request.changes || {};
    const companyPatch: any = {};
    if (changes.name !== undefined) companyPatch.name = changes.name;
    if (changes.logo !== undefined) companyPatch.logo = changes.logo;
    if (changes.coverImage !== undefined) companyPatch.cover_image = changes.coverImage;
    if (changes.contact !== undefined) companyPatch.contact = changes.contact;
    if (changes.address !== undefined) companyPatch.address = changes.address;
    if (Object.keys(companyPatch).length) {
      await sb.from('companies').update(companyPatch).eq('id', request.company_id);
    }
    if (changes.settings && Object.keys(changes.settings).length) {
      await upsertSetting(sb, request.company_id, 'general', changes.settings, ctx.userId);
    }
    const { data: updated } = await sb
      .from('company_change_requests')
      .update({ status: 'approved', reviewer_id: ctx.userId, reviewed_at: new Date().toISOString() })
      .eq('id', id)
      .select('*')
      .single();
    await recordAudit(req, {
      action: 'company.changeApproved',
      entityType: 'company',
      entityId: request.company_id,
      companyId: request.company_id,
      after: changes
    });
    if (request.requested_by) {
      await notify({
        userId: request.requested_by,
        type: 'company',
        title: 'Company changes approved',
        body: 'Your company details were approved and updated.',
        data: { companyId: request.company_id }
      });
    }
    return ok(res, { data: rowOut(updated) });
  }

  if (id && slug[1] === 'reject' && req.method === 'POST') {
    if (!canApprove) return fail(res, 'Forbidden', 403);
    const { data: request } = await sb.from('company_change_requests').select('*').eq('id', id).maybeSingle();
    if (!request) return fail(res, 'Not found', 404);
    if (request.status !== 'pending') return fail(res, 'This request has already been reviewed');
    const note = String(req.body?.note || req.body?.reason || '') || null;
    const { data: updated } = await sb
      .from('company_change_requests')
      .update({ status: 'rejected', reviewer_id: ctx.userId, review_note: note, reviewed_at: new Date().toISOString() })
      .eq('id', id)
      .select('*')
      .single();
    await recordAudit(req, {
      action: 'company.changeRejected',
      entityType: 'company',
      entityId: request.company_id,
      companyId: request.company_id,
      metadata: { note }
    });
    if (request.requested_by) {
      await notify({
        userId: request.requested_by,
        type: 'company',
        title: 'Company changes rejected',
        body: note || 'Your proposed company changes were rejected.',
        data: { companyId: request.company_id }
      });
    }
    return ok(res, { data: rowOut(updated) });
  }

  return fail(res, 'Not found', 404);
});
