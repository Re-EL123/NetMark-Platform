import { authed, ok, fail, slugOf, getSupabase, rowOut } from '../http';
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

const DEFAULT_COMMISSION = {
  holdDays: 7,
  l1Percent: 10,
  l2Percent: 4,
  l3Percent: 1,
  maxTotalPercent: 15,
  purchaseReferralPercent: 10,
  capPercent: 25,
  autoApprove: false
};

const DEFAULTS: Record<string, any> = {
  general: DEFAULT_PLATFORM,
  commission: DEFAULT_COMMISSION
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
    const platform = (await readSetting('platform', null, key))?.value || DEFAULTS[key] || {};
    let company: any = null;
    if (ctx.companyId) {
      company = (await readSetting('company', ctx.companyId, key))?.value || null;
    }
    return ok(res, { data: { platform, company } });
  }

  if (req.method === 'PUT' || req.method === 'POST') {
    const scope = String(req.body?.scope || (ctx.isPlatform ? 'platform' : 'company'));
    const value = req.body?.value ?? req.body?.values ?? {};
    const settingKey = req.body?.key || key;
    if (scope === 'platform') {
      if (!ctx.isPlatform) return fail(res, 'Forbidden', 403);
      const saved = await upsertSetting('platform', null, settingKey, value, ctx.userId);
      await recordAudit(req, { action: 'settings.update', entityType: 'settings', entityId: settingKey, after: { scope, value } });
      return ok(res, { data: rowOut(saved) });
    }
    // A company owner may tune their own commission split (the engine clamps it
    // to the platform cap); everything else still needs platform approval.
    if (!ctx.isPlatform) {
      const selfCommission = settingKey === 'commission' && !!ctx.companyId;
      if (!selfCommission) {
        return fail(res, 'Company settings changes need platform approval. Submit a change request instead.', 403);
      }
    }
    const targetCompany = ctx.isPlatform ? req.body?.companyId || ctx.companyId : ctx.companyId;
    if (!targetCompany) return fail(res, 'No company scope');
    const saved = await upsertSetting('company', targetCompany, settingKey, value, ctx.userId);
    await recordAudit(req, {
      action: 'settings.update',
      entityType: 'settings',
      entityId: settingKey,
      companyId: targetCompany,
      after: { scope, value }
    });
    return ok(res, { data: rowOut(saved) });
  }

  return fail(res, 'Method not allowed', 405);
});
