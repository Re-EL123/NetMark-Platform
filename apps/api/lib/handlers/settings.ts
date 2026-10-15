import { authed, ok, fail, slugOf, getSupabase, rowOut } from '../http';
import { hasPermission } from '../permissions';
import { recordAudit } from '../audit';

const DEFAULT_PLATFORM = {
  platformName: 'NetMark',
  currency: 'ZAR',
  currencySymbol: 'R',
  supportEmail: 'support@re-el.co.za',
  deliveryFee: 25,
  commissionPercent: 10,
  driverCommissionPercent: 80,
  minOrderAmount: 50,
  deliveryRadiusKm: 15,
  maintenanceMode: false,
  allowRegistrations: true
};

async function readSetting(scope: string, companyId: string | null, key: string) {
  const sb = getSupabase();
  let q = sb.from('settings').select('*').eq('scope', scope).eq('key', key);
  q = companyId ? q.eq('company_id', companyId) : q.is('company_id', null);
  const { data } = await q.maybeSingle();
  return data;
}

async function upsertSetting(scope: string, companyId: string | null, key: string, value: any, userId: string) {
  const sb = getSupabase();
  const existing = await readSetting(scope, companyId, key);
  if (existing) {
    const { data } = await sb
      .from('settings')
      .update({ value, updated_by: userId })
      .eq('id', existing.id)
      .select('*')
      .single();
    return data;
  }
  const { data } = await sb
    .from('settings')
    .insert({ scope, company_id: companyId, key, value, updated_by: userId })
    .select('*')
    .single();
  return data;
}

export default authed(async (req, res, ctx) => {
  const slug = slugOf(req);
  const key = slug[0] || 'general';

  if (req.method === 'GET') {
    const platform = (await readSetting('platform', null, key))?.value || (key === 'general' ? DEFAULT_PLATFORM : {});
    let company: any = null;
    if (ctx.companyId) {
      company = (await readSetting('company', ctx.companyId, key))?.value || null;
    }
    return ok(res, { data: { platform, company } });
  }

  if (req.method === 'PUT' || req.method === 'POST') {
    const scope = String(req.body?.scope || (ctx.isPlatform ? 'platform' : 'company'));
    const value = req.body?.value ?? req.body?.values ?? {};
    if (scope === 'platform') {
      if (!ctx.isPlatform) return fail(res, 'Forbidden', 403);
      const saved = await upsertSetting('platform', null, req.body?.key || key, value, ctx.userId);
      await recordAudit(req, { action: 'settings.update', entityType: 'settings', entityId: req.body?.key || key, after: { scope, value } });
      return ok(res, { data: rowOut(saved) });
    }
    if (!hasPermission(ctx.role, 'settings.write') && !ctx.isPlatform) {
      return fail(res, 'Forbidden', 403);
    }
    const targetCompany = ctx.isPlatform ? req.body?.companyId || ctx.companyId : ctx.companyId;
    if (!targetCompany) return fail(res, 'No company scope');
    const saved = await upsertSetting('company', targetCompany, req.body?.key || key, value, ctx.userId);
    await recordAudit(req, {
      action: 'settings.update',
      entityType: 'settings',
      entityId: req.body?.key || key,
      companyId: targetCompany,
      after: { scope, value }
    });
    return ok(res, { data: rowOut(saved) });
  }

  return fail(res, 'Method not allowed', 405);
});
