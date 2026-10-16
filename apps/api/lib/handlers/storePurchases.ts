import { authed, ok, fail, slugOf, getSupabase, rowOut, rowsOut } from '../http';
import { recordAudit } from '../audit';
import { completeStorePurchase } from '../purchases';
import { payfastConfig, buildPaymentFields } from '../payfast';

export default authed(async (req, res, ctx) => {
  const sb = getSupabase();
  const slug = slugOf(req);
  const isPlatform = ctx.isPlatform;

  if (slug.length === 0 && req.method === 'GET') {
    let q = sb.from('store_purchases').select('*').order('created_at', { ascending: false });
    if (!isPlatform && ctx.companyId) q = q.eq('company_id', ctx.companyId);
    if (!isPlatform && !ctx.companyId) q = q.eq('purchaser_id', ctx.userId);
    const { data } = await q;
    return ok(res, { data: rowsOut(data) });
  }

  if (slug.length === 0 && req.method === 'POST') {
    const { storeId } = req.body || {};
    if (!storeId) return fail(res, 'storeId required');
    const { data: store } = await sb.from('stores').select('*').eq('id', storeId).maybeSingle();
    if (!store) return fail(res, 'Store not found', 404);
    if (!store.is_for_sale) return fail(res, 'Store not for sale', 400);
    if (store.purchased) return fail(res, 'Store already purchased', 400);
    const price = Number(store.price_zar || 0);
    const { data: p, error } = await sb.from('store_purchases').insert({
      company_id: ctx.companyId || null,
      purchaser_id: ctx.userId,
      purchaser_email: ctx.user?.email || null,
      store_id: store.id,
      store_name: store.name,
      price_zar: price,
      status: 'pending',
      payment_status: 'unpaid'
    }).select('*').single();
    if (error) return fail(res, error.message);
    await recordAudit(req, { action: 'store.purchase.create', entityType: 'store_purchase', entityId: p.id, after: rowOut(p) });
    return ok(res, { data: rowOut(p) }, 201);
  }

  const id = slug[0];
  if (id && slug[1] === 'complete' && req.method === 'POST') {
    if (!isPlatform) return fail(res, 'Forbidden', 403);
    const done = await completeStorePurchase(sb, id);
    if (!done) return fail(res, 'Not found', 404);
    await recordAudit(req, { action: 'store.purchase.complete', entityType: 'store_purchase', entityId: id });
    return ok(res, { message: 'Completed' });
  }

  if (id && slug[1] === 'payfast' && slug[2] === 'initiate' && req.method === 'POST') {
    const { data: p } = await sb.from('store_purchases').select('*').eq('id', id).maybeSingle();
    if (!p) return fail(res, 'Not found', 404);
    if (p.purchaser_id !== ctx.userId && !isPlatform) return fail(res, 'Forbidden', 403);
    if (p.payment_status === 'paid') return fail(res, 'This purchase is already paid');
    const cfg = payfastConfig();
    if (!cfg.configured) return fail(res, 'PayFast is not configured on the server.', 503);
    const amount = Number(p.price_zar || 0);
    if (amount <= 0) return fail(res, 'Purchase price is invalid');
    const [first, ...rest] = String(ctx.user?.name || 'NetMark').split(' ');
    const fields = buildPaymentFields({
      amount,
      itemName: `NetMark store ${p.store_name || p.id}`,
      itemDescription: 'Store ownership purchase',
      paymentId: p.id,
      relatedId: p.id,
      kind: 'store_purchase',
      nameFirst: first,
      nameLast: rest.join(' '),
      email: ctx.user?.email,
      cellNumber: ctx.user?.phone || undefined
    });
    await recordAudit(req, { action: 'store.purchase.payfast', entityType: 'store_purchase', entityId: p.id, companyId: p.company_id, metadata: { amount } });
    return ok(res, { data: { paymentId: p.id, sandbox: cfg.sandbox, processUrl: cfg.processUrl, fields } });
  }

  return fail(res, 'Not found', 404);
});
