import { authed, ok, fail, slugOf, getSupabase, rowOut, rowsOut } from '../http';
import { recordAudit } from '../audit';
import { entitlementsForCtx } from '../planLimits';

export default authed(async (req, res, ctx) => {
  const sb = getSupabase();
  const slug = slugOf(req);
  const isPlatform = ctx.isPlatform;

  if (slug.length === 0 && req.method === 'GET') {
    if (!isPlatform) return fail(res, 'Forbidden', 403);
    let q = sb.from('wallets').select('*').order('balance_zar', { ascending: false }).limit(200);
    const { data } = await q;
    return ok(res, { data: rowsOut(data) });
  }

  if (slug[0] === 'me' && req.method === 'GET') {
    const { data } = await sb.from('wallets').select('*').eq('user_id', ctx.userId).maybeSingle();
    if (!data) {
      const { data: w } = await sb.from('wallets').insert({ user_id: ctx.userId, tenant_id: ctx.tenantId }).select('*').single();
      return ok(res, { data: rowOut(w) });
    }
    return ok(res, { data: rowOut(data) });
  }

  if (slug[0] === 'ledger' && req.method === 'GET') {
    const { data: w } = await sb.from('wallets').select('id').eq('user_id', ctx.userId).maybeSingle();
    if (!w) return ok(res, { data: [] });
    const { data } = await sb.from('wallet_ledger').select('*').eq('wallet_id', w.id).order('created_at', { ascending: false }).limit(100);
    return ok(res, { data: rowsOut(data) });
  }

  if (slug[0] === 'withdraw' && req.method === 'POST') {
    if (ctx.companyId) {
      const ent = await entitlementsForCtx(sb, ctx);
      if (!ent.payouts) return fail(res, 'Payouts are not included in your current plan. Upgrade to withdraw.', 402);
    }
    const amount = Math.max(0, Number(req.body?.amountZar || 0));
    if (amount < 1) return fail(res, 'Invalid amount');
    const { data: w } = await sb.from('wallets').select('*').eq('user_id', ctx.userId).maybeSingle();
    if (!w) return fail(res, 'Wallet not found', 404);
    if (Number(w.balance_zar || 0) < amount) return fail(res, 'Insufficient balance');
    await sb.from('wallets').update({ pending_zar: Number(w.pending_zar||0)+amount, balance_zar: Number(w.balance_zar||0)-amount }).eq('id', w.id);
    await recordAudit(req, { action: 'wallet.withdraw', entityType: 'wallet', entityId: w.id, after: { amount } });
    return ok(res, { message: 'Withdrawal requested' });
  }
  return fail(res, 'Not found', 404);
});
