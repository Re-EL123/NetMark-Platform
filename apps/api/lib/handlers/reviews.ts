import { authed, ok, fail, slugOf, getSupabase, rowOut, rowsOut } from '../http';

export default authed(async (req, res, ctx) => {
  const sb = getSupabase();
  const slug = slugOf(req);

  if (slug.length === 0 && req.method === 'GET') {
    let q = sb.from('reviews').select('*').order('created_at', { ascending: false }).limit(200);
    if (req.query.storeId) q = q.eq('store_id', String(req.query.storeId));
    if (req.query.productId) q = q.eq('product_id', String(req.query.productId));
    const { data } = await q;
    return ok(res, { data: rowsOut(data) });
  }

  if (slug[0] === 'mine' && req.method === 'GET') {
    const { data } = await sb.from('reviews').select('*').eq('user_id', ctx.userId).order('created_at', { ascending: false });
    return ok(res, { data: rowsOut(data) });
  }

  if (slug.length === 0 && req.method === 'POST') {
    const { orderId, storeId, productId, rating, comment, companyId } = req.body || {};
    if (!rating) return fail(res, 'Rating is required');
    // Only platform may attribute a review to an arbitrary company; otherwise
    // derive it from the referenced store.
    let targetCompany = ctx.isPlatform ? companyId || null : ctx.companyId || null;
    if (storeId) {
      const { data: store } = await sb.from('stores').select('company_id').eq('id', storeId).maybeSingle();
      if (store?.company_id) targetCompany = store.company_id;
    }
    const { data } = await sb
      .from('reviews')
      .insert({
        order_id: orderId || null,
        store_id: storeId || null,
        product_id: productId || null,
        user_id: ctx.userId,
        company_id: targetCompany,
        rating: Math.min(5, Math.max(1, Number(rating))),
        comment: comment || null
      })
      .select('*')
      .single();
    return ok(res, { data: rowOut(data) }, 201);
  }

  if (slug[0] && req.method === 'DELETE') {
    let q = sb.from('reviews').delete().eq('id', slug[0]);
    if (ctx.isPlatform) {
      /* platform may delete any review */
    } else if (ctx.role === 'owner') {
      q = q.eq('company_id', ctx.companyId);
    } else {
      q = q.eq('user_id', ctx.userId);
    }
    await q;
    return ok(res, { message: 'Deleted' });
  }

  return fail(res, 'Not found', 404);
});
