import crypto from 'crypto';
import { authed, ok, fail, slugOf, getSupabase, rowOut } from '../http';
import { recordAudit } from '../audit';
import { notify } from '../notify';
import { payfastConfig, buildPaymentFields } from '../payfast';

/**
 * Wholesale purchases — how a store owner restocks from the company they joined.
 *
 *   store owner  -> buys catalog products from their company at the wholesale
 *                   (company) price
 *   company      -> sees incoming purchases and confirms / fulfils them
 */

const STATUSES = ['pending', 'confirmed', 'ready', 'completed', 'cancelled'];
const PAYMENT_STATUSES = ['unpaid', 'paid', 'refunded'];

function makeReference() {
  return `PO-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}

function decorate(purchase: any) {
  const items = Array.isArray(purchase.items) ? purchase.items : [];
  return {
    id: purchase.id,
    reference: purchase.reference,
    companyId: purchase.company_id,
    storeId: purchase.store_id,
    storeOwnerId: purchase.store_owner_id,
    items,
    subtotal: Number(purchase.subtotal || 0),
    total: Number(purchase.total || 0),
    status: purchase.status,
    paymentStatus: purchase.payment_status,
    paymentMethod: purchase.payment_method,
    paymentRef: purchase.payment_ref,
    notes: purchase.notes,
    createdAt: purchase.created_at,
    updatedAt: purchase.updated_at
  };
}

export default authed(async (req, res, ctx) => {
  const sb = getSupabase();
  const slug = slugOf(req);

  if (ctx.role === 'driver' || ctx.role === 'customer') return fail(res, 'Forbidden', 403);

  const canReadCompany = ctx.isPlatform || ctx.role === 'owner' || ctx.role === 'storeOwner';
  if (!canReadCompany) return fail(res, 'Forbidden', 403);

  function scope(q: any) {
    if (ctx.isPlatform) return q;
    if (ctx.role === 'owner') return q.eq('company_id', ctx.companyId);
    return q.eq('store_owner_id', ctx.userId);
  }

  /* --------------------------------- GET --------------------------------- */
  if (slug.length === 0 && req.method === 'GET') {
    const { data } = await scope(
      sb.from('purchases').select('*').order('created_at', { ascending: false }).limit(200)
    );
    return ok(res, { data: (data || []).map(decorate) });
  }

  /* -------------------------------- POST --------------------------------- */
  if (slug.length === 0 && req.method === 'POST') {
    if (ctx.role !== 'storeOwner' && !ctx.isPlatform) return fail(res, 'Forbidden', 403);
    const { storeId, items, notes } = req.body || {};
    if (!storeId) return fail(res, 'Store is required');
    if (!Array.isArray(items) || !items.length) return fail(res, 'At least one item is required');
    if (!ctx.companyId) return fail(res, 'Join a company with a referral code before buying', 403);

    const { data: store } = await sb.from('stores').select('*').eq('id', storeId).maybeSingle();
    if (!store) return fail(res, 'Store not found', 404);
    if (ctx.role === 'storeOwner' && store.store_owner_id !== ctx.userId) return fail(res, 'Forbidden', 403);

    const productIds = items.map((i: any) => i.productId).filter(Boolean);
    const { data: products } = await sb.from('products').select('*').in('id', productIds);
    const prodMap = new Map((products || []).map((p: any) => [p.id, p]));

    const lines: any[] = [];
    for (const item of items) {
      const product: any = prodMap.get(item.productId);
      const qty = Math.max(1, Number(item.quantity || 1));
      if (!product) return fail(res, 'A selected product no longer exists', 404);
      if (product.company_id && product.company_id !== ctx.companyId) {
        return fail(res, `That product belongs to another company`, 403);
      }
      const price = Number(product.price || 0);
      lines.push({
        productId: product.id,
        name: product.name,
        price,
        quantity: qty,
        lineTotal: Math.round(price * qty * 100) / 100
      });
    }

    const subtotal = Math.round(lines.reduce((sum, l) => sum + l.lineTotal, 0) * 100) / 100;
    const { data, error } = await sb
      .from('purchases')
      .insert({
        reference: makeReference(),
        company_id: ctx.companyId,
        store_id: storeId,
        store_owner_id: ctx.userId,
        items: lines,
        subtotal,
        total: subtotal,
        status: 'pending',
        payment_status: 'unpaid',
        notes: notes || null
      })
      .select('*')
      .single();
    if (error || !data) return fail(res, 'Could not create purchase');
    await recordAudit(req, { action: 'purchase.create', entityType: 'purchase', entityId: data.id, companyId: ctx.companyId, after: rowOut(data) });
    if (ctx.companyId) {
      const { data: owner } = await sb.from('users').select('id').eq('company_id', ctx.companyId).eq('role', 'owner').limit(1);
      for (const o of owner || []) {
        await notify({ userId: o.id, type: 'order', title: 'New purchase order', body: `${ctx.user?.name || 'A store'} placed purchase ${data.reference}.`, data: { purchaseId: data.id } });
      }
    }
    return ok(res, { data: decorate(data) }, 201);
  }

  const id = slug[0];

  if (id && slug[1] === 'payfast' && slug[2] === 'initiate' && req.method === 'POST') {
    const { data: purchase } = await scope(sb.from('purchases').select('*').eq('id', id)).maybeSingle();
    if (!purchase) return fail(res, 'Not found', 404);
    if (purchase.payment_status === 'paid') return fail(res, 'This purchase is already paid');
    if (purchase.status === 'cancelled') return fail(res, 'This purchase was cancelled');
    const { payfastConfig, buildPaymentFields } = await import('../payfast');
    const cfg = payfastConfig();
    if (!cfg.configured) return fail(res, 'PayFast is not configured on the server.', 503);
    const amount = Number(purchase.total || 0);
    if (amount <= 0) return fail(res, 'Purchase total is invalid');
    const [first, ...rest] = String(ctx.user?.name || 'NetMark').split(' ');
    const fields = buildPaymentFields({
      amount,
      itemName: `NetMark purchase ${purchase.reference || purchase.id}`,
      itemDescription: purchase.notes || 'Wholesale restock',
      paymentId: purchase.id,
      orderId: purchase.id,
      nameFirst: first,
      nameLast: rest.join(' '),
      email: ctx.user?.email,
      cellNumber: ctx.user?.phone || undefined
    });
    await recordAudit(req, { action: 'purchase.payfast', entityType: 'purchase', entityId: purchase.id, companyId: purchase.company_id, metadata: { amount } });
    return ok(res, { data: { paymentId: purchase.id, sandbox: cfg.sandbox, processUrl: cfg.processUrl, fields } });
  }

  if (id && slug[1] === 'status' && req.method === 'PUT') {
    const { data: before } = await scope(sb.from('purchases').select('*').eq('id', id)).maybeSingle();
    if (!before) return fail(res, 'Not found', 404);
    const status = String(req.body?.status || '');
    if (!STATUSES.includes(status)) return fail(res, 'Invalid status');
    if (ctx.role === 'storeOwner') {
      if (status !== 'cancelled') return fail(res, 'Store owners can only cancel their purchases', 403);
      if (before.status !== 'pending') return fail(res, 'This purchase can no longer be cancelled');
    } else if (!ctx.isPlatform && ctx.role !== 'owner') {
      return fail(res, 'Forbidden', 403);
    }
    const patch: any = { status };
    if (status === 'cancelled') patch.payment_status = before.payment_status === 'paid' ? 'refunded' : before.payment_status;
    const { data: after } = await sb.from('purchases').update(patch).eq('id', id).select('*').single();
    await recordAudit(req, { action: 'purchase.status', entityType: 'purchase', entityId: id, before: { status: before.status }, after: { status } });
    if (before.store_owner_id && status !== before.status) {
      await notify({ userId: before.store_owner_id, type: 'order', title: `Purchase ${status}`, body: `Your purchase ${before.reference} is now ${status}.`, data: { purchaseId: id } });
    }
    return ok(res, { data: decorate(after) });
  }

  if (id && slug[1] === 'payment-status' && req.method === 'PUT') {
    const { data: before } = await scope(sb.from('purchases').select('*').eq('id', id)).maybeSingle();
    if (!before) return fail(res, 'Not found', 404);
    if (!ctx.isPlatform && ctx.role !== 'owner') return fail(res, 'Forbidden', 403);
    const ps = String(req.body?.paymentStatus || '');
    if (!PAYMENT_STATUSES.includes(ps)) return fail(res, 'Invalid payment status');
    const { data: after } = await sb.from('purchases').update({ payment_status: ps }).eq('id', id).select('*').single();
    await recordAudit(req, { action: 'purchase.payment', entityType: 'purchase', entityId: id, before: { payment_status: before.payment_status }, after: { payment_status: ps } });
    return ok(res, { data: decorate(after) });
  }

  if (id && req.method === 'GET') {
    const { data } = await scope(sb.from('purchases').select('*').eq('id', id)).maybeSingle();
    if (!data) return fail(res, 'Not found', 404);
    return ok(res, { data: decorate(data) });
  }

  if (id && req.method === 'DELETE') {
    const { data: before } = await scope(sb.from('purchases').select('*').eq('id', id)).maybeSingle();
    if (!before) return fail(res, 'Not found', 404);
    if (!ctx.isPlatform && ctx.role !== 'owner') return fail(res, 'Forbidden', 403);
    await sb.from('purchases').delete().eq('id', id);
    await recordAudit(req, { action: 'purchase.delete', entityType: 'purchase', entityId: id, before: rowOut(before) });
    return ok(res, { message: 'Deleted' });
  }

  return fail(res, 'Not found', 404);
});
