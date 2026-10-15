import { authed, ok, fail, slugOf, getSupabase, rowsOut } from '../http';
import { hasPermission } from '../permissions';
import { storeIdsForUser } from '../scope';

function rangeFromQuery(req: any): { from: string; to: string } {
  const to = req.query?.to ? new Date(String(req.query.to)) : new Date();
  const from = req.query?.from
    ? new Date(String(req.query.from))
    : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
  return { from: from.toISOString(), to: to.toISOString() };
}

export default authed(async (req, res, ctx) => {
  const sb = getSupabase();
  const slug = slugOf(req);
  const path = slug.join('/');

  if (!ctx.isPlatform && !hasPermission(ctx.role, 'reports.read')) {
    return fail(res, 'Forbidden', 403);
  }

  if (path === 'my/all' && req.method === 'GET') {
    const { data } = await sb
      .from('orders')
      .select('*')
      .eq('customer_id', ctx.userId)
      .order('created_at', { ascending: false });
    return ok(res, { data: rowsOut(data) });
  }

  if (path === 'driver' && req.method === 'GET') {
    const driverUserId = ctx.role === 'driver' ? ctx.userId : String(req.query.driverUserId || ctx.userId);
    const { data: driver } = await sb.from('drivers').select('*').eq('user_id', driverUserId).maybeSingle();
    if (!driver) return fail(res, 'Driver not found', 404);
    const { data: earnings } = await sb.from('driver_earnings').select('*').eq('driver_id', driver.id);
    const list = earnings || [];
    const total = list.reduce((s, e) => s + Number(e.amount || 0), 0);
    const paid = list.filter((e) => e.status === 'paid').reduce((s, e) => s + Number(e.amount || 0), 0);
    const { count: deliveries } = await sb
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('assigned_driver_id', driver.id)
      .eq('delivery_status', 'delivered');
    return ok(res, { data: { driver: { id: driver.id, name: null }, earnings: { total, paid, pending: total - paid }, deliveries: deliveries || 0 } });
  }

  // overview / sales / (default)
  const { from, to } = rangeFromQuery(req);
  let q = sb.from('orders').select('*').gte('created_at', from).lte('created_at', to);
  if (!ctx.isPlatform) {
    if (ctx.role === 'storeOwner') {
      const storeIds = await storeIdsForUser(sb, ctx.userId, 'store_owner_id');
      q = q.in('store_id', storeIds);
    } else if (ctx.role === 'distributor') {
      q = q.eq('distributor_id', ctx.userId);
    } else {
      q = q.eq('company_id', ctx.companyId);
    }
  }
  const { data: orders } = await q;
  const all = orders || [];

  const paid = all.filter((o: any) => o.payment_status === 'paid');
  const revenue = paid.reduce((s: number, o: any) => s + Number(o.total || 0), 0);
  const refunds = all.reduce((s: number, o: any) => s + Number(o.refund_amount || 0), 0);

  const byStatus: Record<string, number> = {};
  const byDay: Record<string, { orders: number; revenue: number }> = {};
  const productAgg: Record<string, { name: string; qty: number; revenue: number }> = {};

  for (const o of all) {
    byStatus[o.order_status] = (byStatus[o.order_status] || 0) + 1;
    const day = String(o.created_at).slice(0, 10);
    byDay[day] = byDay[day] || { orders: 0, revenue: 0 };
    byDay[day].orders += 1;
    if (o.payment_status === 'paid') byDay[day].revenue += Number(o.total || 0);
    for (const item of Array.isArray(o.items) ? o.items : []) {
      const key = item.productId || item.name;
      productAgg[key] = productAgg[key] || { name: item.name || key, qty: 0, revenue: 0 };
      productAgg[key].qty += Number(item.quantity || 0);
      productAgg[key].revenue += Number(item.lineTotal || 0);
    }
  }

  // top stores
  const storeCounts: Record<string, { orders: number; revenue: number }> = {};
  for (const o of all) {
    if (!o.store_id) continue;
    storeCounts[o.store_id] = storeCounts[o.store_id] || { orders: 0, revenue: 0 };
    storeCounts[o.store_id].orders += 1;
    storeCounts[o.store_id].revenue += Number(o.total || 0);
  }
  const storeIds = Object.keys(storeCounts);
  let storeNames: Record<string, string> = {};
  if (storeIds.length) {
    const { data: stores } = await sb.from('stores').select('id, name').in('id', storeIds);
    storeNames = Object.fromEntries((stores || []).map((s: any) => [s.id, s.name]));
  }
  const topStores = storeIds
    .map((id) => ({ id, name: storeNames[id] || id, ...storeCounts[id] }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

  const topProducts = Object.entries(productAgg)
    .map(([id, v]) => ({ id, ...v }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

  return ok(res, {
    data: {
      range: { from, to },
      totals: {
        orders: all.length,
        paidOrders: paid.length,
        revenue,
        refunds,
        averageOrderValue: paid.length ? revenue / paid.length : 0
      },
      byStatus,
      byDay: Object.entries(byDay)
        .map(([date, v]) => ({ date, ...v }))
        .sort((a, b) => a.date.localeCompare(b.date)),
      topStores,
      topProducts
    }
  });
});
