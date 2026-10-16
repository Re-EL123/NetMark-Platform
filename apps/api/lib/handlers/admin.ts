import { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';
import { authed, ok, fail, slugOf, getSupabase, rowOut, rowsOut } from '../http';
import { recordAudit } from '../audit';
import { notifyAll, notify } from '../notify';
import { parseListQuery, runList } from '../paginate';
import { ROLES } from '../permissions';

function tempPassword(): string {
  return 'Nm-' + crypto.randomBytes(6).toString('base64url') + '!9';
}

export default authed(async (req, res, ctx) => {
  const slug = slugOf(req);
  const sb = getSupabase();
  const [section, ...rest] = slug;
  const id = rest[0];

  // Platform control only, except owners who may manage their company's payouts.
  const isPlatform = ctx.role === 'platformAdmin';
  const ownerPayouts = ctx.role === 'owner' && section === 'payouts' && !!ctx.companyId;
  if (!isPlatform && !ownerPayouts) return fail(res, 'Forbidden', 403);

  /* ------------------------------- stats -------------------------------- */
  if (section === 'stats' && req.method === 'GET') {
    const count = async (table: string, apply?: (q: any) => any) => {
      let q = sb.from(table).select('id', { count: 'exact', head: true });
      if (apply) q = apply(q);
      const { count: c } = await q;
      return c || 0;
    };

    const [users, companies, stores, products, orders, pendingDrivers, activeDrivers, pendingApps] =
      await Promise.all([
        count('users'),
        count('companies'),
        count('stores'),
        count('products'),
        count('orders'),
        count('drivers', (q) => q.eq('status', 'pending')),
        count('drivers', (q) => q.eq('status', 'approved')),
        count('appointments', (q) => q.eq('status', 'pending'))
      ]);

    const { data: paidOrders } = await sb
      .from('orders')
      .select('total, delivery_fee, created_at')
      .eq('payment_status', 'paid');
    const revenue = (paidOrders || []).reduce((s: number, o: any) => s + Number(o.total || 0), 0);

    const roleCounts: Record<string, number> = {};
    await Promise.all(
      ROLES.map(async (r) => {
        roleCounts[r] = await count('users', (q) => q.eq('role', r));
      })
    );

    const statusAgg: Record<string, number> = {};
    await Promise.all(
      ['pending', 'confirmed', 'ready', 'completed', 'cancelled'].map(async (s) => {
        statusAgg[s] = await count('orders', (q) => q.eq('order_status', s));
      })
    );

    const { data: recentOrders } = await sb
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(8);

    return ok(res, {
      data: {
        totals: { users, companies, stores, products, orders, revenue },
        drivers: { pending: pendingDrivers, active: activeDrivers },
        appointments: { pending: pendingApps },
        roleCounts,
        orderStatus: statusAgg,
        recentOrders: rowsOut(recentOrders)
      }
    });
  }

  /* ------------------------------- users -------------------------------- */
  if (section === 'users') {
    if (!id && req.method === 'GET') {
      const list = parseListQuery(req);
      const role = String(req.query.role || '');
      const status = String(req.query.status || '');
      let q = sb.from('users').select('*', { count: 'exact' });
      if (role) q = q.eq('role', role);
      if (status) q = q.eq('status', status);
      const result = await runList(q, list, { searchColumns: ['name', 'email', 'phone'] });
      return ok(res, { data: rowsOut(result.data), meta: { count: result.count, page: result.page, pageSize: result.pageSize } });
    }

    if (!id && req.method === 'POST') {
      const { name, email, phone, password, role, companyId, status, profileImage } = req.body || {};
      if (!name || !email) return fail(res, 'Name and email are required');
      if (role && !ROLES.includes(role)) return fail(res, 'Invalid role');
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
          role: role || 'customer',
          company_id: companyId || null,
          profile_image: profileImage || null,
          status: status || 'active',
          verification_status: 'verified'
        })
        .select('*')
        .single();
      if (error) return fail(res, 'Could not create user record');
      await recordAudit(req, {
        action: 'user.create',
        entityType: 'user',
        entityId: user.id,
        companyId: companyId || null,
        after: rowOut(user),
        metadata: { role: user.role }
      });
      return ok(res, { data: { user: rowOut(user), temporaryPassword: password ? undefined : pw } }, 201);
    }

    if (id && req.method === 'GET') {
      const { data: user } = await sb.from('users').select('*').eq('id', id).maybeSingle();
      if (!user) return fail(res, 'Not found', 404);
      return ok(res, { data: rowOut(user) });
    }

    if (id && req.method === 'PUT') {
      const { data: before } = await sb.from('users').select('*').eq('id', id).maybeSingle();
      if (!before) return fail(res, 'Not found', 404);
      const b = req.body || {};
      const patch: any = {};
      for (const k of ['name', 'phone', 'notes']) if (b[k] !== undefined) patch[k] = b[k];
      if (b.email) patch.email = b.email;
      if (b.profileImage !== undefined) patch.profile_image = b.profileImage;
      if (b.role && ROLES.includes(b.role)) patch.role = b.role;
      if (b.status) patch.status = b.status;
      if (b.verificationStatus) patch.verification_status = b.verificationStatus;
      if (b.companyId !== undefined) patch.company_id = b.companyId || null;
      const { data: after } = await sb.from('users').update(patch).eq('id', id).select('*').single();
      await recordAudit(req, {
        action: 'user.update',
        entityType: 'user',
        entityId: id,
        before: rowOut(before),
        after: rowOut(after)
      });
      if (patch.status && patch.status !== before.status) {
        await notify({
          userId: id,
          type: 'account',
          title: `Account ${patch.status}`,
          body: patch.status === 'active' ? 'Your account has been reactivated.' : `Your account status is now ${patch.status}.`
        });
      }
      return ok(res, { data: rowOut(after) });
    }

    if (id && rest[1] === 'reset-password' && req.method === 'POST') {
      const pw = tempPassword();
      const { error } = await sb.auth.admin.updateUserById(id, { password: pw });
      if (error) return fail(res, error.message);
      await recordAudit(req, { action: 'user.resetPassword', entityType: 'user', entityId: id });
      return ok(res, { data: { temporaryPassword: pw } });
    }

    if (id && (rest[1] === 'suspend' || rest[1] === 'reactivate') && req.method === 'POST') {
      const status = rest[1] === 'suspend' ? 'suspended' : 'active';
      const { data: after } = await sb
        .from('users')
        .update({ status, notes: req.body?.reason || null })
        .eq('id', id)
        .select('*')
        .single();
      await recordAudit(req, { action: `user.${rest[1]}`, entityType: 'user', entityId: id, after: rowOut(after) });
      await notify({
        userId: id,
        type: 'account',
        title: `Account ${status}`,
        body: status === 'suspended' ? 'Your account has been suspended by an administrator.' : 'Your account has been reactivated.'
      });
      return ok(res, { data: rowOut(after) });
    }

    if (id && req.method === 'DELETE') {
      const { data: before } = await sb.from('users').select('*').eq('id', id).maybeSingle();
      await sb.auth.admin.deleteUser(id).catch(() => {});
      await sb.from('users').delete().eq('id', id);
      await recordAudit(req, { action: 'user.delete', entityType: 'user', entityId: id, before: before ? rowOut(before) : null });
      return ok(res, { message: 'Deleted' });
    }
  }

  /* ------------------------------- audit --------------------------------- */
  if (section === 'audit' && req.method === 'GET') {
    const list = parseListQuery(req);
    let q = sb.from('audit_logs').select('*', { count: 'exact' });
    if (req.query.action) q = q.eq('action', String(req.query.action));
    if (req.query.entityType) q = q.eq('entity_type', String(req.query.entityType));
    const result = await runList(q, list, { searchColumns: ['action', 'entity_type', 'actor_email'] });
    return ok(res, { data: rowsOut(result.data), meta: { count: result.count, page: result.page, pageSize: result.pageSize } });
  }

  /* ---------------------------- announcements ---------------------------- */
  if (section === 'announcements') {
    if (!id && req.method === 'GET') {
      const { data } = await sb.from('announcements').select('*').order('created_at', { ascending: false });
      return ok(res, { data: rowsOut(data) });
    }
    if (!id && req.method === 'POST') {
      const { title, body, audience, companyId, sendNotification } = req.body || {};
      if (!title) return fail(res, 'Title is required');
      const { data } = await sb
        .from('announcements')
        .insert({
          title,
          body: body || null,
          audience: audience || 'all',
          company_id: companyId || null,
          created_by: ctx.userId
        })
        .select('*')
        .single();
      if (sendNotification !== false) {
        if ((audience || 'all') === 'all') {
          await notifyAll({ type: 'announcement', title, body: body || undefined });
        } else {
          await notify({ role: audience, companyId: companyId || null, type: 'announcement', title, body: body || undefined });
        }
      }
      await recordAudit(req, { action: 'announcement.create', entityType: 'announcement', entityId: data.id });
      return ok(res, { data: rowOut(data) }, 201);
    }
    if (id && req.method === 'DELETE') {
      await sb.from('announcements').delete().eq('id', id);
      await recordAudit(req, { action: 'announcement.delete', entityType: 'announcement', entityId: id });
      return ok(res, { message: 'Deleted' });
    }
  }

  /* ------------------------------- payouts ------------------------------- */
  if (section === 'payouts') {
    if (!id && req.method === 'GET') {
      const list = parseListQuery(req);
      let q = sb.from('payouts').select('*', { count: 'exact' });
      if (!isPlatform) q = q.eq('company_id', ctx.companyId);
      const result = await runList(q, list, { searchColumns: ['reference', 'notes'] });
      return ok(res, { data: rowsOut(result.data), meta: { count: result.count, page: result.page, pageSize: result.pageSize } });
    }
    if (!id && req.method === 'POST') {
      const { driverId, amount, method, periodStart, periodEnd, notes, companyId } = req.body || {};
      if (!driverId || !amount) return fail(res, 'Driver and amount are required');
      let targetCompany = isPlatform ? companyId || null : ctx.companyId;
      // Owners may only pay drivers that belong to their company.
      if (!isPlatform) {
        const { data: driver } = await sb.from('drivers').select('id, company_id').eq('id', driverId).maybeSingle();
        if (!driver || driver.company_id !== ctx.companyId) return fail(res, 'Driver not found', 404);
      }
      const { data } = await sb
        .from('payouts')
        .insert({
          driver_id: driverId,
          amount,
          method: method || 'eft',
          period_start: periodStart || null,
          period_end: periodEnd || null,
          notes: notes || null,
          company_id: targetCompany,
          status: 'pending'
        })
        .select('*')
        .single();
      await recordAudit(req, { action: 'payout.create', entityType: 'payout', entityId: data.id, after: rowOut(data) });
      return ok(res, { data: rowOut(data) }, 201);
    }
    if (id && rest[1] === 'process' && req.method === 'POST') {
      const { data: current } = await sb.from('payouts').select('*').eq('id', id).maybeSingle();
      if (!current) return fail(res, 'Not found', 404);
      if (!isPlatform && current.company_id !== ctx.companyId) return fail(res, 'Forbidden', 403);
      const { data: payout } = await sb
        .from('payouts')
        .update({ status: 'paid', processed_by: ctx.userId, processed_at: new Date().toISOString() })
        .eq('id', id)
        .select('*')
        .single();
      if (payout?.driver_id) {
        await sb
          .from('driver_earnings')
          .update({ status: 'paid', paid_at: new Date().toISOString() })
          .eq('driver_id', payout.driver_id)
          .eq('status', 'pending');
        const { data: drv } = await sb
          .from('drivers')
          .select('user_id')
          .eq('id', payout.driver_id)
          .maybeSingle();
        if (drv?.user_id) {
          await notify({
            userId: drv.user_id,
            type: 'payout',
            title: 'Payout processed',
            body: `A payout of ${payout.amount} was processed.`
          });
        }
      }
      await recordAudit(req, { action: 'payout.process', entityType: 'payout', entityId: id, after: rowOut(payout) });
      return ok(res, { data: rowOut(payout) });
    }
  }

  return fail(res, 'Not found', 404);
});
