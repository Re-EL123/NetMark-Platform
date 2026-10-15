import { authed, ok, fail, slugOf, getSupabase, rowOut, rowsOut } from '../http';
import { parseListQuery, runList } from '../paginate';
import { hasPermission } from '../permissions';
import { recordAudit } from '../audit';
import { notify } from '../notify';

const STATUSES = ['pending', 'confirmed', 'completed', 'cancelled', 'no_show'];

export default authed(async (req, res, ctx) => {
  const sb = getSupabase();
  const slug = slugOf(req);
  const canWrite = ctx.isPlatform || hasPermission(ctx.role, 'appointments.write');

  function scope(q: any) {
    if (ctx.isPlatform) return q;
    if (ctx.role === 'owner' || ctx.role === 'storeOwner') return q.eq('company_id', ctx.companyId);
    if (ctx.role === 'customer') return q.eq('user_id', ctx.userId);
    return q.eq('company_id', ctx.companyId);
  }

  if (slug.length === 0 && req.method === 'GET') {
    const list = parseListQuery(req);
    let q = sb.from('appointments').select('*', { count: 'exact' });
    q = scope(q);
    if (req.query.status) q = q.eq('status', String(req.query.status));
    const result = await runList(q, list, { searchColumns: ['service', 'notes'] });
    return ok(res, { data: rowsOut(result.data), meta: { count: result.count, page: result.page, pageSize: result.pageSize } });
  }

  if (slug.length === 0 && req.method === 'POST') {
    const { storeId, service, date, time, notes, companyId, userId } = req.body || {};
    if (!date) return fail(res, 'Date is required');
    const customerId = ctx.isPlatform && userId ? userId : ctx.userId;
    let targetCompany = ctx.isPlatform ? companyId || null : ctx.companyId;
    if (storeId) {
      const { data: store } = await sb.from('stores').select('company_id').eq('id', storeId).maybeSingle();
      if (store?.company_id) targetCompany = store.company_id;
    }
    const { data, error } = await sb
      .from('appointments')
      .insert({
        user_id: customerId,
        store_id: storeId || null,
        service: service || null,
        appointment_date: date,
        appointment_time: time || null,
        notes: notes || null,
        status: 'pending',
        company_id: targetCompany
      })
      .select('*')
      .single();
    if (error) return fail(res, 'Could not create appointment');
    await recordAudit(req, { action: 'appointment.create', entityType: 'appointment', entityId: data.id, after: rowOut(data) });
    if (targetCompany) {
      await notify({ role: 'owner', companyId: targetCompany, type: 'appointment', title: 'New appointment', body: `Appointment for ${date} ${time || ''}`, data: { appointmentId: data.id } });
    }
    return ok(res, { data: rowOut(data) }, 201);
  }

  const id = slug[0];
  if (id && slug.length === 1 && req.method === 'GET') {
    const { data } = await scope(sb.from('appointments').select('*').eq('id', id)).maybeSingle();
    if (!data) return fail(res, 'Not found', 404);
    return ok(res, { data: rowOut(data) });
  }

  if (id && (slug[1] === 'status' || slug.length === 1) && (req.method === 'PUT' || req.method === 'POST')) {
    const { data: before } = await scope(sb.from('appointments').select('*').eq('id', id)).maybeSingle();
    if (!before) return fail(res, 'Not found', 404);
    const status = req.body?.status;
    if (slug[1] === 'status' && !STATUSES.includes(status)) return fail(res, 'Invalid status');
    if (slug[1] !== 'status' && !canWrite) return fail(res, 'Forbidden', 403);
    const patch: any = {};
    if (status && STATUSES.includes(status)) patch.status = status;
    if (req.body?.date) patch.appointment_date = req.body.date;
    if (req.body?.time !== undefined) patch.appointment_time = req.body.time;
    if (req.body?.notes !== undefined) patch.notes = req.body.notes;
    const { data: after } = await sb.from('appointments').update(patch).eq('id', id).select('*').single();
    await recordAudit(req, { action: 'appointment.update', entityType: 'appointment', entityId: id, after: rowOut(after) });
    if (after.user_id && status) {
      await notify({ userId: after.user_id, type: 'appointment', title: `Appointment ${status}`, body: `Your appointment is now ${status}.`, data: { appointmentId: id } });
    }
    return ok(res, { data: rowOut(after) });
  }

  if (id && req.method === 'DELETE') {
    const { data: before } = await scope(sb.from('appointments').select('*').eq('id', id)).maybeSingle();
    if (!before) return fail(res, 'Not found', 404);
    if (!canWrite && before.user_id !== ctx.userId) return fail(res, 'Forbidden', 403);
    await sb.from('appointments').delete().eq('id', id);
    await recordAudit(req, { action: 'appointment.delete', entityType: 'appointment', entityId: id });
    return ok(res, { message: 'Deleted' });
  }

  return fail(res, 'Not found', 404);
});
