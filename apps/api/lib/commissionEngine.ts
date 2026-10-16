import { SupabaseClient } from '@supabase/supabase-js';

export async function creditWallet(sb: SupabaseClient, tenantId: string | null, userId: string, amountZar: number, description: string, refId?: string, refType?: string) {
  const { data: w } = await sb.from('wallets').select('*').eq('user_id', userId).maybeSingle();
  let walletId = w?.id;
  if (!w) {
    const { data: nw } = await sb.from('wallets').insert({ user_id: userId, tenant_id: tenantId, balance_zar: 0 }).select('*').single();
    walletId = nw?.id;
  }
  if (!walletId) return;
  const balanceAfter = Number((w?.balance_zar || 0)) + Number(amountZar || 0);
  await sb.from('wallets').update({ balance_zar: balanceAfter }).eq('id', walletId);
  await sb.from('wallet_ledger').insert({
    wallet_id: walletId,
    tenant_id: tenantId,
    type: 'credit',
    amount_zar: amountZar,
    balance_after: balanceAfter,
    ref_id: refId || null,
    ref_type: refType || null,
    description
  });
}

export async function recordCommission(sb: SupabaseClient, opts: {
  tenantId: string | null;
  userId: string;
  companyId?: string | null;
  orderId?: string | null;
  amountZar: number;
  bonusType?: string | null;
  level?: number | null;
  source?: string;
}) {
  const { data: c } = await sb.from('commissions').insert({
    tenant_id: opts.tenantId,
    user_id: opts.userId,
    company_id: opts.companyId || null,
    order_id: opts.orderId || null,
    source: opts.source || 'sale',
    bonus_type: opts.bonusType || null,
    level: opts.level ?? null,
    amount_zar: opts.amountZar,
    status: 'approved'
  }).select('*').single();
  await creditWallet(sb, opts.tenantId, opts.userId, opts.amountZar, 'Commission', c?.id, 'commission');
  return c;
}
