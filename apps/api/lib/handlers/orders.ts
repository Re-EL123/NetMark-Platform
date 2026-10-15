import { authed, ok, fail, slugOf, getSupabase, rowOut, rowsOut } from '../http';
import { parseListQuery, runList } from '../paginate';
import { hasPermission } from '../permissions';
import { recordAudit } from '../audit';
import { notify } from '../notify';

const ORDER_STATUSES = ['pending', 'confirmed', 'ready', 'completed', 'cancelled'];

function orderNumber() {
  return 'NM-' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 5).toUpperCase();
}

async function deliveryFee(): Promise<number> {
  const sb = getSupabase();
  const { data } = await sb.from('settings').select('value').eq('scope', 'platform').eq('key', 'general').maybeSingle();
  return Number(data?.value?.deliveryFee ?? 0);
}

export default authed(async (req, res, ctx) => {
  const sb = getSupabase();
  const slug = slugOf(req);
  const canWrite = ctx.isPlatform || hasPermission(ctx.role, 'orders.write');

  function scope(q: any) {
    if (ctx.isPlatform) return q;
    if (ctx.role === 'owner' || ctx.role === 'storeOwner') return q.eq('company_id', ctx.companyId);
    if (ctx.role === 'distributor') return q.eq('distributor_id', ctx.userId);
    return q.eq('customer_id', ctx.userId);
  }

  // GET /orders  |  GET /orders/my/all
  if ((slug.length === 0 || slug[0] === 'my') && req.method === 'GET') {
    const list = parseListQuery(req);
    let q = sb.from('orders').select('*', { count: 'exact' });
    if (slug[0] === 'my') {
      q = q.eq('customer_id', ctx.userId);
    } else if (ctx.role === 'driver') {
      const { data: drv } = await sb.from('drivers').select('id').eq('user_id', ctx.userId).maybeSingle();
      q = q.eq('assigned_driver_id', drv?.id || '00000000-0000-0000-0000-000000000000');
    } else {
      q = scope(q);
    }
    if (req.query.status) q = q.eq('order_status', String(req.query.status));
    if (req.query.paymentStatus) q = q.eq('payment_status', String(req.query.paymentStatus));
    const result = await runList(q, list, { searchColumns: ['order_number', 'notes'] });
    return ok(res, { data: rowsOut(result.data), meta: { count: result.count, page: result.page, pageSize: result.pageSize } });
  }

  // POST /orders
  if (slug.length === 0 && req.method === 'POST') {
    const { storeId, items, address, notes, orderType, distributorId } = req.body || {};
    if (!Array.isArray(items) || !items.length) return fail(res, 'Order must contain at least one item');

    let companyId = ctx.companyId;
    if (storeId) {
      const { data: store } = await sb.from('stores').select('*').eq('id', storeId).maybeSingle();
      if (!store) return fail(res, 'Store not found', 404);
      companyId = store.company_id;
    }

    const lines: any[] = [];
    let subtotal = 0;
    for (const item of items) {
      const productId = item.productId || item.id;
      const qty = Math.max(1, Number(item.quantity || 1));
      const { data: product } = await sb.from('products').select('*').eq('id', productId).maybeSingle();
      if (!product) return fail(res, `Product ${productId} not found`, 404);
      if (product.is_active === false) return fail(res, `${product.name} is unavailable`);
      if (Number(product.stock || 0) < qty) return fail(res, `Insufficient stock for ${product.name}`);
      const price = Number(product.price || 0);
      lines.push({ productId, name: product.name, price, quantity: qty, lineTotal: price * qty });
      subtotal += price * qty;
    }

    const fee = orderType === 'pickup' ? 0 : await deliveryFee();
    const total = subtotal + fee;

    const { data: order, error } = await sb
      .from('orders')
      .insert({
        order_number: orderNumber(),
        company_id: companyId || null,
        customer_id: ctx.userId,
        user_id: ctx.userId,
        store_id: storeId || null,
        distributor_id: distributorId || null,
        order_status: 'pending',
        delivery_status: 'unassigned',
        subtotal,
        delivery_fee: fee,
        total,
        payment_status: 'unpaid',
        items: lines,
        address: address || null,
        notes: notes || null,
        order_type: orderType || 'delivery'
      })
      .select('*')
      .single();
    if (error) return fail(res, 'Could not create order');

    // decrement stock
    for (const line of lines) {
      const { data: p } = await sb.from('products').select('stock').eq('id', line.productId).maybeSingle();
      if (p) await sb.from('products').update({ stock: Math.max(0, Number(p.stock || 0) - line.quantity) }).eq('id', line.productId);
    }

    await recordAudit(req, { action: 'order.create', entityType: 'order', entityId: order.id, after: rowOut(order) });
    if (companyId) {
      await notify({ role: 'owner', companyId, type: 'order', title: 'New order', body: `Order ${order.order_number} placed (${total}).`, data: { orderId: order.id } });
    }
    return ok(res, { data: rowOut(order) }, 201);
  }

  const id = slug[0];

  if (id && slug.length === 1 && req.method === 'GET') {
    let q = sb.from('orders').select('*').eq('id', id);
    if (ctx.role === 'driver') {
      const { data: drv } = await sb.from('drivers').select('id').eq('user_id', ctx.userId).maybeSingle();
      q = q.eq('assigned_driver_id', drv?.id || '00000000-0000-0000-0000-000000000000');
    } else {
      q = scope(q);
    }
    const { data } = await q.maybeSingle();
    if (!data) return fail(res, 'Not found', 404);
    return ok(res, { data: rowOut(data) });
  }

  if (id && slug[1] === 'status' && req.method === 'PUT') {
    if (!canWrite) return fail(res, 'Forbidden', 403);
    const status = String(req.body?.status || '');
    if (!ORDER_STATUSES.includes(status)) return fail(res, 'Invalid status');
    const { data: before } = await scope(sb.from('orders').select('*').eq('id', id)).maybeSingle();
    if (!before) return fail(res, 'Not found', 404);
    const patch: any = { order_status: status };
    if (status === 'completed') patch.delivery_status = 'delivered';
    const { data: after } = await sb.from('orders').update(patch).eq('id', id).select('*').single();
    await recordAudit(req, { action: 'order.status', entityType: 'order', entityId: id, before: { status: before.order_status }, after: { status } });
    if (before.customer_id && status === 'confirmed') {
      await notify({ userId: before.customer_id, type: 'order', title: 'Order confirmed', body: `Order ${before.order_number} is confirmed.`, data: { orderId: id } });
    }
    return ok(res, { data: rowOut(after) });
  }

  if (id && slug[1] === 'assign' && req.method === 'POST') {
    if (!canWrite) return fail(res, 'Forbidden', 403);
    const driverId = req.body?.driverId;
    if (!driverId) return fail(res, 'driverId is required');
    const { data: driver } = await sb.from('drivers').select('*').eq('id', driverId).maybeSingle();
    if (!driver) return fail(res, 'Driver not found', 404);
    const { data: after } = await sb
      .from('orders')
      .update({ assigned_driver_id: driverId, delivery_status: 'assigned' })
      .eq('id', id)
      .select('*')
      .single();
    await recordAudit(req, { action: 'order.assign', entityType: 'order', entityId: id, after: { driverId } });
    if (driver.user_id) {
      await notify({ userId: driver.user_id, type: 'delivery', title: 'New delivery assigned', body: 'You have a new delivery assigned.', data: { orderId: id } });
    }
    return ok(res, { data: rowOut(after) });
  }

  if (id && req.method === 'PUT') {
    const { data: before } = await scope(sb.from('orders').select('*').eq('id', id)).maybeSingle();
    if (!before) return fail(res, 'Not found', 404);
    const b = req.body || {};

    // customers may only cancel their own pending/confirmed orders
    if (ctx.role === 'customer') {
      if (before.customer_id !== ctx.userId) return fail(res, 'Forbidden', 403);
      if (b.status === 'cancelled') {
        if (!['pending', 'confirmed'].includes(before.order_status)) return fail(res, 'This order can no longer be cancelled');
        const { data: after } = await sb.from('orders').update({ order_status: 'cancelled' }).eq('id', id).select('*').single();
        await recordAudit(req, { action: 'order.cancel', entityType: 'order', entityId: id });
        return ok(res, { data: rowOut(after) });
      }
      return fail(res, 'Forbidden', 403);
    }

    if (!canWrite) return fail(res, 'Forbidden', 403);
    const patch: any = {};
    if (b.orderStatus && ORDER_STATUSES.includes(b.orderStatus)) patch.order_status = b.orderStatus;
    if (b.deliveryStatus) patch.delivery_status = b.deliveryStatus;
    if (b.notes !== undefined) patch.notes = b.notes;
    if (b.address !== undefined) patch.address = b.address;
    const { data: after } = await sb.from('orders').update(patch).eq('id', id).select('*').single();
    await recordAudit(req, { action: 'order.update', entityType: 'order', entityId: id, before: rowOut(before), after: rowOut(after) });
    return ok(res, { data: rowOut(after) });
  }

  if (id && slug[1] === 'refund' && req.method === 'POST') {
    if (!canWrite) return fail(res, 'Forbidden', 403);
    const { data: before } = await sb.from('orders').select('*').eq('id', id).maybeSingle();
    if (!before) return fail(res, 'Not found', 404);
    const amount = Number(req.body?.amount ?? before.total ?? 0);
    const { data: after } = await sb
      .from('orders')
      .update({ refund_amount: amount, payment_status: 'refunded' })
      .eq('id', id)
      .select('*')
      .single();
    await recordAudit(req, { action: 'order.refund', entityType: 'order', entityId: id, after: { amount } });
    if (before.customer_id) {
      await notify({ userId: before.customer_id, type: 'payment', title: 'Refund issued', body: `A refund of ${amount} was issued for order ${before.order_number}.`, data: { orderId: id } });
    }
    return ok(res, { data: rowOut(after) });
  }

  if (id && req.method === 'DELETE') {
    if (!ctx.isPlatform) return fail(res, 'Forbidden', 403);
    const { data: before } = await sb.from('orders').select('*').eq('id', id).maybeSingle();
    await sb.from('orders').delete().eq('id', id);
    await recordAudit(req, { action: 'order.delete', entityType: 'order', entityId: id, before: before ? rowOut(before) : null });
    return ok(res, { message: 'Deleted' });
  }

  return fail(res, 'Not found', 404);
});
