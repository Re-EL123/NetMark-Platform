import { authed, ok, fail, slugOf, getSupabase, rowOut } from '../http';
import { recordAudit } from '../audit';
import { notify } from '../notify';
import { codesByIds, isLinkValid, linkStatus } from '../companyLinks';

/**
 * Company links API.
 *
 *   store owner -> enters a company code to link (and unlock that company's
 *                  catalog + wholesale purchasing); lists/renews/pauses links
 *   owner       -> sees which store owners are linked to their company
 *   platform    -> everything
 */
export default authed(async (req, res, ctx) => {
  const sb = getSupabase();
  const slug = slugOf(req);

  const canRead = ctx.isPlatform || ctx.role === 'owner' || ctx.role === 'storeOwner';
  if (!canRead) return fail(res, 'Forbidden', 403);

  async function decorate(links: any[]) {
    const codeMap = await codesByIds(sb, links.map((l) => l.code_id));
    const companyIds = [...new Set(links.map((l) => l.company_id).filter(Boolean))];
    const ownerIds = [...new Set(links.map((l) => l.store_owner_id).filter(Boolean))];
    const [compRes, userRes] = await Promise.all([
      companyIds.length ? sb.from('companies').select('id, name, slug').in('id', companyIds) : Promise.resolve({ data: [] }),
      ownerIds.length ? sb.from('users').select('id, name, email').in('id', ownerIds) : Promise.resolve({ data: [] })
    ]);
    const compMap = new Map((compRes.data || []).map((c: any) => [c.id, c]));
    const userMap = new Map((userRes.data || []).map((u: any) => [u.id, u]));
    return links.map((l) => ({
      id: l.id,
      storeOwnerId: l.store_owner_id,
      companyId: l.company_id,
      companyName: compMap.get(l.company_id)?.name || null,
      storeOwnerName: userMap.get(l.store_owner_id)?.name || null,
      storeOwnerEmail: userMap.get(l.store_owner_id)?.email || null,
      code: l.code,
      isActive: l.is_active !== false,
      expiresAt: l.expires_at,
      lastRenewedAt: l.last_renewed_at,
      status: linkStatus(l, codeMap.get(l.code_id))
    }));
  }

  /* --------------------------------- GET --------------------------------- */
  if (slug.length === 0 && req.method === 'GET') {
    let q = sb.from('company_links').select('*');
    if (ctx.isPlatform) {
      /* all */
    } else if (ctx.role === 'owner') {
      q = q.eq('company_id', ctx.companyId);
    } else {
      q = q.eq('store_owner_id', ctx.userId);
    }
    const { data } = await q.order('created_at', { ascending: false });
    return ok(res, { data: await decorate(data || []) });
  }

  /* -------------------------------- POST --------------------------------- */
  // Link (or renew) a company using that company's code.
  if (slug.length === 0 && req.method === 'POST') {
    if (ctx.role !== 'storeOwner' && !ctx.isPlatform) return fail(res, 'Forbidden', 403);
    const code = String(req.body?.code || '').trim().toUpperCase();
    if (!code) return fail(res, 'Enter the company code');

    const ownerId = ctx.role === 'storeOwner' ? ctx.userId : String(req.body?.storeOwnerId || '');
    if (!ownerId) return fail(res, 'Store owner is required');

    const { data: codeRow } = await sb.from('distributor_codes').select('*').eq('code', code).maybeSingle();
    if (!codeRow) return fail(res, 'That code is not valid', 404);
    if (codeRow.is_active === false) return fail(res, 'That code is no longer active');
    if (codeRow.expires_at && new Date(codeRow.expires_at) < new Date()) return fail(res, 'That code has expired');
    if (!codeRow.company_id) return fail(res, 'That code is not linked to a company');

    const { data: existing } = await sb
      .from('company_links')
      .select('*')
      .eq('store_owner_id', ownerId)
      .eq('company_id', codeRow.company_id)
      .maybeSingle();

    const alreadyValid = existing && isLinkValid(existing, codeRow);
    if (!alreadyValid && codeRow.max_uses != null && Number(codeRow.uses || 0) >= Number(codeRow.max_uses)) {
      return fail(res, 'That code has reached its usage limit');
    }

    const payload = {
      store_owner_id: ownerId,
      company_id: codeRow.company_id,
      code_id: codeRow.id,
      code: codeRow.code,
      is_active: true,
      expires_at: codeRow.expires_at || null,
      last_renewed_at: new Date().toISOString()
    };

    let link: any;
    if (existing) {
      const { data } = await sb.from('company_links').update(payload).eq('id', existing.id).select('*').single();
      link = data;
    } else {
      const { data, error } = await sb.from('company_links').insert(payload).select('*').single();
      if (error || !data) return fail(res, 'Could not link that company');
      link = data;
    }

    if (!alreadyValid) {
      await sb.from('distributor_codes').update({ uses: Number(codeRow.uses || 0) + 1 }).eq('id', codeRow.id);
    }

    // Adopt the company as the owner's primary if they had none (keeps legacy
    // company-scoped features working without forcing a single company).
    const { data: me } = await sb.from('users').select('company_id').eq('id', ownerId).maybeSingle();
    if (me && !me.company_id) {
      await sb.from('users').update({ company_id: codeRow.company_id, distributor_id: codeRow.distributor_id || null }).eq('id', ownerId);
    }

    await recordAudit(req, {
      action: 'company_link.create',
      entityType: 'company_link',
      entityId: link.id,
      companyId: codeRow.company_id,
      after: rowOut(link)
    });

    if (!existing) {
      const { data: company } = await sb.from('companies').select('owner_id, name').eq('id', codeRow.company_id).maybeSingle();
      if (company?.owner_id) {
        await notify({
          userId: company.owner_id,
          type: 'company',
          title: 'New store linked',
          body: `A store owner linked to ${company.name || 'your company'} with code ${codeRow.code}.`,
          data: { companyId: codeRow.company_id }
        });
      }
    }

    const [out] = await decorate([link]);
    return ok(res, { data: out }, existing ? 200 : 201);
  }

  const id = slug[0];
  if (!id) return fail(res, 'Not found', 404);

  const { data: before } = await sb.from('company_links').select('*').eq('id', id).maybeSingle();
  if (!before) return fail(res, 'Not found', 404);
  const allowed =
    ctx.isPlatform ||
    (ctx.role === 'storeOwner' && before.store_owner_id === ctx.userId) ||
    (ctx.role === 'owner' && before.company_id === ctx.companyId);
  if (!allowed) return fail(res, 'Forbidden', 403);

  if (req.method === 'PUT') {
    const patch: any = {};
    if (req.body?.isActive !== undefined) patch.is_active = !!req.body.isActive;
    if (!Object.keys(patch).length) return fail(res, 'Nothing to update');
    const { data } = await sb.from('company_links').update(patch).eq('id', id).select('*').single();
    await recordAudit(req, { action: 'company_link.update', entityType: 'company_link', entityId: id, after: rowOut(data) });
    const [out] = await decorate([data]);
    return ok(res, { data: out });
  }

  if (req.method === 'DELETE') {
    await sb.from('company_links').delete().eq('id', id);
    await recordAudit(req, { action: 'company_link.delete', entityType: 'company_link', entityId: id, before: rowOut(before) });
    return ok(res, { message: 'Unlinked' });
  }

  return fail(res, 'Not found', 404);
});
