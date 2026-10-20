import { authed, ok, fail, slugOf, getSupabase, rowOut, rowsOut } from '../http';
import { hasPermission } from '../permissions';
import { recordAudit } from '../audit';

/**
 * Product kits — reusable bundles of a company's products. A kit can later be
 * linked to a referral code so the code grants store owners access to exactly
 * the products in that kit.
 *
 * Routes (mounted at /api/kits):
 *   GET    /kits                 -> list kits for the caller's company
 *   POST   /kits                 -> create a kit
 *   GET    /kits/:id             -> kit + its product ids
 *   PUT    /kits/:id             -> rename / toggle a kit
 *   DELETE /kits/:id             -> delete a kit
 *   GET    /kits/:id/items       -> product ids in the kit
 *   PUT    /kits/:id/items       -> replace the kit's product ids
 */
export default authed(async (req, res, ctx) => {
  const sb = getSupabase();
  const slug = slugOf(req);
  const canWrite = ctx.isPlatform || hasPermission(ctx.role, 'codes.write');
  if (!canWrite) return fail(res, 'Forbidden', 403);

  const targetCompany = ctx.isPlatform ? (req.body?.companyId as string) || (req.query.companyId as string) || null : ctx.companyId;

  const ownsKit = async (kitId: string) => {
    const { data } = await sb.from('product_kits').select('*').eq('id', kitId).maybeSingle();
    if (!data) return null;
    if (ctx.isPlatform) return data;
    return data.company_id && data.company_id === ctx.companyId ? data : null;
  };

  // /kits
  if (slug.length === 0) {
    if (req.method === 'GET') {
      if (!targetCompany) return ok(res, { data: [] });
      const { data } = await sb.from('product_kits').select('*').eq('company_id', targetCompany).order('created_at', { ascending: false });
      return ok(res, { data: rowsOut(data || []) });
    }
    if (req.method === 'POST') {
      if (!targetCompany) return fail(res, 'Company required');
      const { name, description } = req.body || {};
      if (!name) return fail(res, 'Name required');
      const { data, error } = await sb.from('product_kits').insert({ company_id: targetCompany, name, description }).select('*').single();
      if (error) return fail(res, 'Could not create kit');
      await recordAudit(req, { action: 'product_kit.create', entityType: 'product_kit', entityId: data.id, after: rowOut(data) });
      return ok(res, { data: rowOut(data) }, 201);
    }
    return fail(res, 'Method not allowed', 405);
  }

  const kitId = slug[0];
  const kit = await ownsKit(kitId);
  if (!kit) return fail(res, 'Not found', 404);

  // /kits/:id/items
  if (slug[1] === 'items') {
    if (req.method === 'GET') {
      const { data: items } = await sb.from('product_kit_items').select('product_id').eq('kit_id', kitId);
      return ok(res, { data: { productIds: (items || []).map((i: any) => i.product_id) } });
    }
    if (req.method === 'PUT') {
      const productIds = Array.isArray(req.body?.productIds) ? req.body.productIds : [];
      await sb.from('product_kit_items').delete().eq('kit_id', kitId);
      if (productIds.length) {
        await sb.from('product_kit_items').insert(productIds.map((pid: string) => ({ kit_id: kitId, product_id: pid })));
      }
      await recordAudit(req, { action: 'product_kit.items.update', entityType: 'product_kit', entityId: kitId, after: { productIds } });
      return ok(res, { message: 'Updated' });
    }
    return fail(res, 'Method not allowed', 405);
  }

  // /kits/:id
  if (req.method === 'GET') {
    const { data: items } = await sb.from('product_kit_items').select('product_id').eq('kit_id', kitId);
    return ok(res, { data: { ...rowOut(kit), productIds: (items || []).map((i: any) => i.product_id) } });
  }
  if (req.method === 'PUT') {
    const patch: any = {};
    if (req.body?.name !== undefined) patch.name = req.body.name;
    if (req.body?.description !== undefined) patch.description = req.body.description;
    if (req.body?.isActive !== undefined) patch.is_active = !!req.body.isActive;
    const { data } = await sb.from('product_kits').update(patch).eq('id', kitId).select('*').single();
    await recordAudit(req, { action: 'product_kit.update', entityType: 'product_kit', entityId: kitId, after: rowOut(data) });
    return ok(res, { data: rowOut(data) });
  }
  if (req.method === 'DELETE') {
    await sb.from('product_kits').delete().eq('id', kitId);
    await recordAudit(req, { action: 'product_kit.delete', entityType: 'product_kit', entityId: kitId, before: rowOut(kit) });
    return ok(res, { message: 'Deleted' });
  }

  return fail(res, 'Method not allowed', 405);
});
