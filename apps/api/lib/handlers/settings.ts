import { authed, ok, fail, slugOf, getSupabase, rowOut, rowsOut } from '../http';
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

  if (key === 'navigation' && req.method === 'GET') {
    const sbn = getSupabase();
    if (ctx.isPlatform) {
      const { data } = await sbn.from('navigation_settings').select('*').eq('scope', 'platform').order('order_index', { ascending: true });
      return ok(res, { data: rowsOut(data || []) });
    }
    const list: any[] = [];
    const { data: g } = await sbn.from('navigation_settings').select('*').eq('scope', 'platform').is('role', null);
    const { data: r } = await sbn.from('navigation_settings').select('*').eq('scope', 'platform').eq('role', ctx.role);
    (g || []).forEach((x: any) => list.push(rowOut(x)));
    (r || []).forEach((x: any) => list.push(rowOut(x)));
    return ok(res, { data: list });
  }

  if (key === 'navigation' && req.method === 'PUT') {
    if (!ctx.isPlatform) return fail(res, 'Only platform admins can configure navigation', 403);
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    const sbn = getSupabase();
    await sbn.from('navigation_settings').delete().eq('scope', 'platform');
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (!it.navKey) continue;
      await sbn.from('navigation_settings').insert({
        scope: 'platform',
        nav_key: it.navKey,
        role: it.role || null,
        visible: it.visible !== false,
        order_index: i
      });
    }
    await recordAudit(req, { action: 'settings.navigation.update', entityType: 'settings', entityId: 'navigation' });
    return ok(res, { message: 'Navigation saved' });
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
