import { authed, ok, fail, slugOf, getSupabase, rowOut, rowsOut } from '../http';
import { parseListQuery, runList } from '../paginate';
import { recordAudit } from '../audit';
import { getCompanyEntitlements, activatePlanSubscription, BILLING_TERM_DAYS } from '../planLimits';
import { payfastConfig, buildPaymentFields } from '../payfast';

export default authed(async (req, res, ctx) => {
  const sb = getSupabase();
  const slug = slugOf(req);
  const isPlatform = ctx.isPlatform;
  const canWrite = isPlatform;

  if (slug.length === 0 && req.method === 'GET') {
    const list = parseListQuery(req);
    let q = sb.from('plans').select('*', { count: 'exact' }).order('sort_order');
    if (req.query.isActive !== undefined) q = q.eq('is_active', String(req.query.isActive) === 'true');
    const result = await runList(q, list);
    return ok(res, { data: rowsOut(result.data), meta: { count: result.count, page: result.page, pageSize: result.pageSize } });
  }

  if (slug[0] === 'my' && req.method === 'GET') {
    if (!ctx.companyId) return ok(res, { data: null });

    const { entitlements, planName, planId, billingStatus, nextBillingAt } = await getCompanyEntitlements(sb, ctx.companyId);

    const count = async (table: string) => {
      const { count: c } = await sb
        .from(table)
        .select('id', { count: 'exact', head: true })
        .eq('company_id', ctx.companyId);
      return c || 0;
    };
    const [products, stores, teamMembers, codes] = await Promise.all([
      count('products'),
      count('stores'),
      count('users'),
      count('distributor_codes')
    ]);

    const { data: cp } = await sb.from('companies_plans').select('*, plan:plans(*)').eq('company_id', ctx.companyId).maybeSingle();
    const data: any = cp ? rowOut(cp) : { plan: null };
    if (cp?.plan) (data as any).plan = rowOut((cp as any).plan);
    data.planName = planName;
    data.planId = planId;
    data.billingStatus = billingStatus;
    data.nextBillingAt = nextBillingAt;
    return ok(res, { data: { ...data, entitlements, usage: { products, stores, teamMembers, codes } } });
  }

  // Self-serve plan change for a company owner. Free plans switch immediately;
  // paid plans return PayFast form fields and settle via the ITN webhook.
  if (slug[0] === 'subscribe' && req.method === 'POST') {
    if (!ctx.companyId) return fail(res, 'Only company owners can subscribe to a plan', 403);
    if (ctx.role !== 'owner' && !isPlatform) return fail(res, 'Forbidden', 403);

    const { planId } = req.body || {};
    if (!planId) return fail(res, 'planId required');
    const { data: plan } = await sb.from('plans').select('*').eq('id', planId).maybeSingle();
    if (!plan || plan.is_active === false) return fail(res, 'That plan is not available', 404);

    const amount = Number(plan.base_fee_zar || 0);
    if (amount <= 0) {
      const activated = await activatePlanSubscription(sb, ctx.companyId, plan.id, { termDays: null });
      await recordAudit(req, { action: 'plan.subscribe', entityType: 'company', entityId: ctx.companyId, after: { planId: plan.id, free: true } });
      return ok(res, { data: { free: true, planId: plan.id, planName: activated?.planName || plan.name } });
    }

    const cfg = payfastConfig();
    if (!cfg.configured) return fail(res, 'PayFast is not configured on the server.', 503);

    const { data: payment, error } = await sb
      .from('payments')
      .insert({
        company_id: ctx.companyId,
        user_id: ctx.userId,
        amount,
        status: 'pending',
        provider: 'payfast',
        kind: 'plan_subscription',
        related_id: plan.id
      })
      .select('*')
      .single();
    if (error || !payment) return fail(res, 'Could not create payment');

    const [first, ...rest] = String(ctx.user?.name || 'NetMark').split(' ');
    const fields = buildPaymentFields({
      amount,
      itemName: `NetMark plan ${plan.name}`,
      itemDescription: `${plan.name} subscription (${BILLING_TERM_DAYS} days)`,
      paymentId: payment.id,
      relatedId: payment.id,
      kind: 'plan_subscription',
      nameFirst: first,
      nameLast: rest.join(' '),
      email: ctx.user?.email,
      cellNumber: ctx.user?.phone || undefined,
      custom: { custom_str3: plan.id, custom_str4: ctx.companyId }
    });
    await recordAudit(req, { action: 'plan.subscribe', entityType: 'company', entityId: ctx.companyId, after: { planId: plan.id, paymentId: payment.id, amount } });
    return ok(res, { data: { paymentId: payment.id, sandbox: cfg.sandbox, processUrl: cfg.processUrl, fields } });
  }


  if (slug[0] === 'assign' && req.method === 'POST') {
    if (!isPlatform) return fail(res, 'Forbidden', 403);
    const { companyId, planId, baseFeeZar, perActiveDistributorZar } = req.body || {};
    if (!companyId) return fail(res, 'companyId required');
    const plan = planId ? (await sb.from('plans').select('*').eq('id', planId).maybeSingle()).data : null;
    const payload: any = {
      company_id: companyId,
      plan_id: planId || null,
      base_fee_zar: baseFeeZar ?? plan?.base_fee_zar ?? 0,
      per_active_distributor_zar: perActiveDistributorZar ?? plan?.per_active_distributor_zar ?? 0
    };
    const { data } = await sb.from('companies_plans').upsert(payload, { onConflict: 'company_id' }).select('*').single();
    await recordAudit(req, { action: 'plan.assign', entityType: 'company', entityId: companyId, after: rowOut(data) });
    return ok(res, { data: rowOut(data) });
  }

  if (!canWrite) return fail(res, 'Forbidden', 403);

  if (slug.length === 0 && req.method === 'POST') {
    const { name, slug: sl, tier, baseFeeZar, perActiveDistributorZar, minDistributors, maxDistributors, features, isActive, isDefault, sortOrder } = req.body || {};
    if (!name) return fail(res, 'name required');
    const { data, error } = await sb.from('plans').insert({
      name,
      slug: sl || name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,''),
      tier: tier || 'standard',
      base_fee_zar: baseFeeZar || 0,
      per_active_distributor_zar: perActiveDistributorZar || 0,
      min_distributors: minDistributors ?? null,
      max_distributors: maxDistributors ?? null,
      features: features || {},
      is_active: isActive !== false,
      is_default: isDefault === true,
      sort_order: Number(sortOrder) || 0
    }).select('*').single();
    if (error) return fail(res, error.message);
    await recordAudit(req, { action: 'plan.create', entityType: 'plan', entityId: data.id, after: rowOut(data) });
    return ok(res, { data: rowOut(data) }, 201);
  }

  const id = slug[0];
  if (id && req.method === 'PUT') {
    const { data: before } = await sb.from('plans').select('*').eq('id', id).maybeSingle();
    if (!before) return fail(res, 'Not found', 404);
    const b = req.body || {};
    const patch: any = {};
    if (b.name) patch.name = b.name;
    if (b.slug) patch.slug = b.slug;
    if (b.tier) patch.tier = b.tier;
    if (b.baseFeeZar !== undefined) patch.base_fee_zar = b.baseFeeZar;
    if (b.perActiveDistributorZar !== undefined) patch.per_active_distributor_zar = b.perActiveDistributorZar;
    if (b.minDistributors !== undefined) patch.min_distributors = b.minDistributors;
    if (b.maxDistributors !== undefined) patch.max_distributors = b.maxDistributors;
    if (b.features !== undefined) patch.features = b.features;
    if (b.isActive !== undefined) patch.is_active = b.isActive;
    if (b.isDefault !== undefined) patch.is_default = b.isDefault;
    if (b.sortOrder !== undefined) patch.sort_order = Number(b.sortOrder) || 0;
    const { data: after } = await sb.from('plans').update(patch).eq('id', id).select('*').single();
    await recordAudit(req, { action: 'plan.update', entityType: 'plan', entityId: id, before: rowOut(before), after: rowOut(after) });
    return ok(res, { data: rowOut(after) });
  }

  return fail(res, 'Not found', 404);
});
