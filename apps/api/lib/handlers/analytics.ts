import { authed, ok, fail, slugOf, getSupabase } from '../http';
import { entitlementsForCtx } from '../planLimits';

// Best-effort metrics: any query against a not-yet-migrated table returns null
// instead of failing the whole endpoint.

async function scalar(sb: any, table: string, select: string, filter?: (q: any) => any) {
  try {
    let q = sb.from(table).select(select);
    if (filter) q = filter(q);
    const { data, error } = await q;
    if (error) return null;
    return data;
  } catch {
    return null;
  }
}

export default authed(async (req, res, ctx) => {
  const sb = getSupabase();
  const slug = slugOf(req);
  if (!ctx.isPlatform && !ctx.companyId && ctx.role !== 'owner') return fail(res, 'Forbidden', 403);

  // The 'basic' reports entitlement exposes the overview only; the deeper
  // cohort / LTV / retail analyses need the 'full' reports plan.
  if (!ctx.isPlatform && ['cohorts', 'ltv', 'retail'].includes(slug[0])) {
    const ent = await entitlementsForCtx(sb, ctx);
    if (ent.reports !== 'full') {
      return fail(res, 'Advanced analytics are not included in your current plan. Upgrade to unlock them.', 402);
    }
  }

  function scope<T extends any>(q: T): any {
    if (ctx.isPlatform) return q;
    return (q as any).eq('company_id', ctx.companyId);
  }

  if (slug[0] === 'overview' && req.method === 'GET') {
    const orders = (await scalar(sb, 'orders', 'id, total, order_status, payment_status, created_at, company_id', (q: any) => scope(q))) || [];
    const users = (await scalar(sb, 'users', 'id, role, status', (q: any) => (ctx.isPlatform ? q : q.eq('company_id', ctx.companyId)))) || [];
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const completed = orders.filter((o: any) => o.order_status === 'completed');
    const paid = completed.filter((o: any) => o.payment_status === 'paid');
    const gmv = completed.reduce((s: number, o: any) => s + Number(o.total || 0), 0);
    const mtd = completed.filter((o: any) => o.created_at >= monthStart);
    return ok(res, {
      data: {
        orders: { total: orders.length, completed: completed.length, paid: paid.length },
        gmvZar: Math.round(gmv * 100) / 100,
        gmvMonthZar: Math.round(mtd.reduce((s: number, o: any) => s + Number(o.total || 0), 0) * 100) / 100,
        users: {
          total: users.length,
          active: users.filter((u: any) => u.status === 'active').length,
          owners: users.filter((u: any) => u.role === 'owner').length,
          customers: users.filter((u: any) => u.role === 'customer').length,
          drivers: users.filter((u: any) => u.role === 'driver').length,
          storeOwners: users.filter((u: any) => u.role === 'storeOwner').length
        },
        avgOrderZar: completed.length ? Math.round((gmv / completed.length) * 100) / 100 : 0
      }
    });
  }

  if (slug[0] === 'cohorts' && req.method === 'GET') {
    const orders = (await scalar(sb, 'orders', 'customer_id, total, order_status, created_at, company_id', (q: any) => scope(q))) || [];
    // first order month per customer, then orders per month-since-first
    const first: Record<string, string> = {};
    for (const o of orders) {
      if (!o.customer_id) continue;
      const m = o.created_at.slice(0, 7);
      if (!first[o.customer_id] || m < first[o.customer_id]) first[o.customer_id] = m;
    }
    const cohorts: Record<string, { size: number; retention: Record<number, number> }> = {};
    for (const o of orders) {
      if (!o.customer_id) continue;
      const fm = first[o.customer_id];
      const diff =
        (Number(o.created_at.slice(0, 4)) - Number(fm.slice(0, 4))) * 12 +
        (Number(o.created_at.slice(5, 7)) - Number(fm.slice(5, 7)));
      if (!cohorts[fm]) cohorts[fm] = { size: 0, retention: {} };
      cohorts[fm].retention[diff] = (cohorts[fm].retention[diff] || 0) + 1;
    }
    for (const k of Object.keys(cohorts)) {
      const ids = Object.keys(first).filter((c) => first[c] === k);
      cohorts[k].size = ids.length;
    }
    return ok(res, { data: cohorts });
  }

  if (slug[0] === 'ltv' && req.method === 'GET') {
    const orders = (await scalar(sb, 'orders', 'customer_id, total, order_status, created_at, company_id', (q: any) => scope(q))) || [];
    const byUser: Record<string, { orders: number; spend: number; last: string }> = {};
    for (const o of orders) {
      if (!o.customer_id || o.order_status === 'cancelled') continue;
      const e = (byUser[o.customer_id] ||= { orders: 0, spend: 0, last: '' });
      e.orders += 1;
      e.spend += Number(o.total || 0);
      if (o.created_at > e.last) e.last = o.created_at;
    }
    const top = Object.entries(byUser)
      .map(([userId, v]) => ({ userId, orders: v.orders, ltvZar: Math.round(v.spend * 100) / 100, lastOrderAt: v.last }))
      .sort((a, b) => b.ltvZar - a.ltvZar)
      .slice(0, 100);
    return ok(res, { data: top });
  }

  if (slug[0] === 'retail' && req.method === 'GET') {
    const orders = (await scalar(sb, 'orders', 'distributor_id, order_status, total, company_id', (q: any) => scope(q))) || [];
    const valid = orders.filter((o: any) => o.order_status !== 'cancelled');
    const withDist = valid.filter((o: any) => o.distributor_id);
    const pct = valid.length ? Math.round((withDist.length / valid.length) * 1000) / 10 : 0;
    return ok(res, {
      data: {
        total: valid.length,
        distributorSales: withDist.length,
        retailSales: valid.length - withDist.length,
        distributorPct: pct,
        distributorGmvZar: Math.round(withDist.reduce((s: number, o: any) => s + Number(o.total || 0), 0) * 100) / 100
      }
    });
  }

  return fail(res, 'Not found', 404);
});
