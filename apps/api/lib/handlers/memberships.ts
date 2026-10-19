import { authed, ok, fail, slugOf, getSupabase, rowOut, rowsOut } from '../http';
import { parseListQuery, runList } from '../paginate';
import { recordAudit } from '../audit';
import { notify } from '../notify';
import { hasPermission } from '../permissions';
import { getRanks, getMembership, ensureMembership } from '../ranks';

const MEMBER_STATUSES = ['active', 'paused', 'suspended', 'terminated'];

async function usersMap(sb: any, ids: string[]): Promise<Map<string, any>> {
  const map = new Map<string, any>();
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return map;
  const { data } = await sb.from('users').select('id, name, email, role').in('id', unique);
  for (const u of data || []) map.set(u.id, u);
  return map;
}

async function companyMap(sb: any, ids: string[]): Promise<Map<string, any>> {
  const map = new Map<string, any>();
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return map;
  const { data } = await sb.from('companies').select('id, name, slug').in('id', unique);
  for (const c of data || []) map.set(c.id, c);
  return map;
}

function decorate(rows: any[], rankById: Map<string, any>, users: Map<string, any>, companies: Map<string, any>) {
  const out = rowsOut(rows);
  return out.map((m: any) => {
    const rank = m.rankId ? rankById.get(m.rankId) : null;
    const u = users.get(m.userId);
    const c = companies.get(m.companyId);
    return {
      ...m,
      rankName: rank?.name || null,
      rankLevel: rank?.level ?? null,
      memberName: u?.name || null,
      memberEmail: u?.email || null,
      memberRole: u?.role || null,
      companyName: c?.name || null,
      companySlug: c?.slug || null
    };
  });
}

export default authed(async (req, res, ctx) => {
  const sb = getSupabase();
  const slug = slugOf(req);
  const isAdmin = ctx.isPlatform;
  const isOwner = ctx.role === 'owner';
  const canManage = isAdmin || isOwner;

  // ---- ranks ladder -------------------------------------------------------
  if (slug[0] === 'ranks') {
    const rankId = slug[1];

    if (req.method === 'GET' && !rankId) {
      const ranks = await getRanks(sb, false);
      return ok(res, { data: ranks });
    }

    if (!isAdmin) return fail(res, 'Forbidden', 403);

    if (req.method === 'POST' && !rankId) {
      const b = req.body || {};
      if (!b.name || !b.slug) return fail(res, 'name and slug are required');
      const { data, error } = await sb
        .from('ranks')
        .insert({
          name: b.name,
          slug: String(b.slug).toLowerCase().replace(/[^a-z0-9-]+/g, '-'),
          level: Number(b.level || 0),
          min_personal_bv: Number(b.minPersonalBv || 0),
          min_group_bv: Number(b.minGroupBv || 0),
          min_personal_period_bv: Number(b.minPersonalPeriodBv || 0),
          retail_override_percent: Number(b.retailOverridePercent || 0),
          monthly_bonus_zar: Number(b.monthlyBonusZar || 0),
          leadership_pool_percent: Number(b.leadershipPoolPercent || 0),
          is_active: b.isActive !== false,
          sort_order: Number(b.sortOrder || 0)
        })
        .select('*')
        .single();
      if (error) return fail(res, error.message);
      await recordAudit(req, { action: 'rank.create', entityType: 'rank', entityId: data.id, after: rowOut(data) });
      return ok(res, { data }, 201);
    }

    if (rankId && req.method === 'PUT') {
      const b = req.body || {};
      const patch: any = {};
      if (b.name !== undefined) patch.name = b.name;
      if (b.slug !== undefined) patch.slug = String(b.slug).toLowerCase().replace(/[^a-z0-9-]+/g, '-');
      if (b.level !== undefined) patch.level = Number(b.level);
      if (b.minPersonalBv !== undefined) patch.min_personal_bv = Number(b.minPersonalBv);
      if (b.minGroupBv !== undefined) patch.min_group_bv = Number(b.minGroupBv);
      if (b.minPersonalPeriodBv !== undefined) patch.min_personal_period_bv = Number(b.minPersonalPeriodBv);
      if (b.retailOverridePercent !== undefined) patch.retail_override_percent = Number(b.retailOverridePercent);
      if (b.monthlyBonusZar !== undefined) patch.monthly_bonus_zar = Number(b.monthlyBonusZar);
      if (b.leadershipPoolPercent !== undefined) patch.leadership_pool_percent = Number(b.leadershipPoolPercent);
      if (b.isActive !== undefined) patch.is_active = !!b.isActive;
      if (b.sortOrder !== undefined) patch.sort_order = Number(b.sortOrder);
      patch.updated_at = new Date().toISOString();
      const { data, error } = await sb.from('ranks').update(patch).eq('id', rankId).select('*').single();
      if (error) return fail(res, error.message);
      await recordAudit(req, { action: 'rank.update', entityType: 'rank', entityId: rankId, after: rowOut(data) });
      return ok(res, { data });
    }

    if (rankId && req.method === 'DELETE') {
      const { error } = await sb.from('ranks').delete().eq('id', rankId);
      if (error) return fail(res, error.message);
      return ok(res, { message: 'Deleted' });
    }

    return fail(res, 'Not found', 404);
  }

  // ---- my memberships (all companies) ------------------------------------
  if (slug.length === 0 && req.method === 'GET') {
    const { data } = await sb
      .from('company_memberships')
      .select('*')
      .eq('user_id', ctx.userId)
      .order('created_at', { ascending: false });
    const rows = data || [];
    const ranks = await getRanks(sb, false);
    const rankById = new Map(ranks.map((r) => [r.id, r]));
    const companies = await companyMap(sb, rows.map((r) => r.company_id));
    return ok(res, {
      data: decorate(rows, rankById, new Map([[ctx.userId, ctx.user]]), companies)
    });
  }

  // ---- team (my downline in a company) -----------------------------------
  if (slug[0] === 'team' && req.method === 'GET') {
    let companyId = req.query.companyId ? String(req.query.companyId) : ctx.companyId;
    if (!companyId) {
      const { data } = await sb
        .from('company_memberships')
        .select('company_id')
        .eq('user_id', ctx.userId)
        .limit(1)
        .maybeSingle();
      companyId = data?.company_id || null;
    }
    if (!companyId) return ok(res, { data: { me: null, members: [], counts: { direct: 0, total: 0 } } });

    const rootId = req.query.rootId ? String(req.query.rootId) : ctx.userId;
    const ranks = await getRanks(sb, false);
    const rankById = new Map(ranks.map((r) => [r.id, r]));

    const { data: all } = await sb
      .from('company_memberships')
      .select('*')
      .eq('company_id', companyId)
      .limit(2000);
    const rows = all || [];
    const bySponsor = new Map<string, any[]>();
    for (const r of rows) {
      const key = r.sponsor_id || '';
      if (!bySponsor.has(key)) bySponsor.set(key, []);
      bySponsor.get(key)!.push(r);
    }

    // BFS the subtree under rootId (exclusive of root as a "member" row).
    const collected: any[] = [];
    const queue = [rootId];
    const seen = new Set<string>([rootId]);
    while (queue.length && collected.length < 1000) {
      const current = queue.shift()!;
      for (const child of bySponsor.get(current) || []) {
        if (seen.has(child.user_id)) continue;
        seen.add(child.user_id);
        collected.push(child);
        queue.push(child.user_id);
      }
    }

    const users = await usersMap(sb, [rootId, ...collected.map((m) => m.user_id)]);
    const me = rows.find((r) => r.user_id === rootId) || (await getMembership(sb, companyId, rootId));
    return ok(res, {
      data: {
        me: decorate(rootId ? [await getMembership(sb, companyId, rootId)].filter(Boolean) : [], rankById, users, new Map())[0] || null,
        members: decorate(collected, rankById, users, new Map()),
        counts: { direct: (bySponsor.get(rootId) || []).length, total: collected.length }
      }
    });
  }

  // ---- whole-company network (owner/platform) ----------------------------
  if (slug[0] === 'network' && req.method === 'GET') {
    const companyId = req.query.companyId ? String(req.query.companyId) : ctx.companyId;
    if (!companyId) return fail(res, 'companyId is required');
    if (!canManage && !hasPermission(ctx.role, 'referrals.read')) return fail(res, 'Forbidden', 403);
    if (isOwner && companyId !== ctx.companyId) return fail(res, 'Forbidden', 403);

    const list = parseListQuery(req);
    let q = sb.from('company_memberships').select('*', { count: 'exact' }).eq('company_id', companyId);
    if (req.query.status) q = q.eq('status', String(req.query.status));
    const result = await runList(q, list, { searchColumns: ['member_no'] });
    const ranks = await getRanks(sb, false);
    const rankById = new Map(ranks.map((r) => [r.id, r]));
    const users = await usersMap(sb, (result.data || []).map((r: any) => r.user_id));
    const companies = await companyMap(sb, [companyId]);
    return ok(res, {
      data: decorate(result.data || [], rankById, users, companies),
      meta: { count: result.count, page: result.page, pageSize: result.pageSize }
    });
  }

  // ---- recruit a member into a company -----------------------------------
  if (slug.length === 0 && req.method === 'POST') {
    const b = req.body || {};
    const companyId = b.companyId || (isOwner ? ctx.companyId : null);
    if (!companyId) return fail(res, 'companyId is required');

    // Owner may only recruit into their own company; store owners use codes.
    if (!isAdmin && isOwner && companyId !== ctx.companyId) return fail(res, 'Forbidden', 403);
    if (!isAdmin && !isOwner) return fail(res, 'Forbidden', 403);

    let userId = b.userId || null;
    if (!userId && b.email) {
      const { data: u } = await sb.from('users').select('id').eq('email', String(b.email)).maybeSingle();
      if (!u) return fail(res, 'No user with that email', 404);
      userId = u.id;
    }
    if (!userId) return fail(res, 'userId or email is required');

    const sponsorId = b.sponsorId || ctx.userId;
    const membership = await ensureMembership(sb, { companyId, userId, sponsorId, tenantId: ctx.tenantId });
    if (!membership) return fail(res, 'Could not create membership', 500);

    await recordAudit(req, { action: 'membership.create', entityType: 'membership', entityId: membership.id, after: rowOut(membership) });
    if (userId !== ctx.userId) {
      await notify({
        userId,
        type: 'order',
        title: 'You have been added to a network',
        body: `You now have member number ${membership.member_no}.`,
        data: { companyId }
      });
    }
    return ok(res, { data: rowOut(membership) }, 201);
  }

  const id = slug[0];

  if (id && slug.length === 1 && req.method === 'GET') {
    const { data } = await sb.from('company_memberships').select('*').eq('id', id).maybeSingle();
    if (!data) return fail(res, 'Not found', 404);
    if (data.user_id !== ctx.userId && !canManage && ctx.role !== 'storeOwner') return fail(res, 'Forbidden', 403);
    if (isOwner && data.company_id !== ctx.companyId) return fail(res, 'Forbidden', 403);
    const ranks = await getRanks(sb, false);
    const rankById = new Map(ranks.map((r) => [r.id, r]));
    const users = await usersMap(sb, [data.user_id]);
    const companies = await companyMap(sb, [data.company_id]);
    return ok(res, { data: decorate([data], rankById, users, companies)[0] });
  }

  if (id && slug.length === 1 && req.method === 'PUT') {
    const { data: before } = await sb.from('company_memberships').select('*').eq('id', id).maybeSingle();
    if (!before) return fail(res, 'Not found', 404);

    const isSelf = before.user_id === ctx.userId;
    if (!isSelf && !canManage) return fail(res, 'Forbidden', 403);
    if (isOwner && before.company_id !== ctx.companyId) return fail(res, 'Forbidden', 403);

    const b = req.body || {};
    const patch: any = { updated_at: new Date().toISOString() };

    if (b.sponsorId !== undefined && canManage) patch.sponsor_id = b.sponsorId || null;

    if (b.status !== undefined) {
      if (!MEMBER_STATUSES.includes(b.status)) return fail(res, 'Invalid status');
      // A member may only pause/resume their own membership; admins may do
      // anything. Nobody but an admin can mark themselves terminated.
      if (isSelf && !canManage && !['active', 'paused'].includes(b.status)) {
        return fail(res, 'Forbidden', 403);
      }
      patch.status = b.status;
      if (b.status === 'paused') patch.paused_at = new Date().toISOString();
      if (b.status === 'active') {
        patch.paused_at = null;
        patch.suspended_at = null;
      }
      if (b.status === 'suspended') patch.suspended_at = new Date().toISOString();
    }

    const { data, error } = await sb.from('company_memberships').update(patch).eq('id', id).select('*').single();
    if (error) return fail(res, error.message);
    await recordAudit(req, { action: 'membership.update', entityType: 'membership', entityId: id, before: rowOut(before), after: rowOut(data) });
    return ok(res, { data: rowOut(data) });
  }

  return fail(res, 'Not found', 404);
});
