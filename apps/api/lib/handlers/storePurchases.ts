import { authed, ok, fail, slugOf, getSupabase, rowOut, rowsOut } from '../http';
import { recordAudit } from '../audit';

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
    const { data: p } = await sb.from('store_purchases').select('*').eq('id', id).maybeSingle();
    if (!p) return fail(res, 'Not found', 404);
    await sb.from('stores').update({ purchased: true, purchased_by: p.purchaser_id, purchased_at: new Date().toISOString(), is_for_sale: false, owned_by_company: p.company_id }).eq('id', p.store_id);
    await sb.from('store_purchases').update({ status: 'completed', payment_status: 'paid' }).eq('id', id);
    await recordAudit(req, { action: 'store.purchase.complete', entityType: 'store_purchase', entityId: id });
    return ok(res, { message: 'Completed' });
  }

  return fail(res, 'Not found', 404);
});
