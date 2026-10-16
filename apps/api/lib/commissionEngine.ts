import { SupabaseClient } from '@supabase/supabase-js';
import { notify } from './notify';
import { getCompanyEntitlements } from './planLimits';

/**
 * Commission engine v2.
 *
 * Model: a 3-level unilevel retail override paid out of *net-of-VAT product
 * revenue only*. Compensation is derived from completed, paid, non-refunded
 * orders (and from code/store purchases for the buyer's referrer) — never from
 * recruiting — which is what keeps it defensible under SA CPA §42.
 *
 * Money lifecycle: credit -> pending (hold window) -> approved/available.
 * A cancelled or refunded order reverses exactly what was credited.
 */

export interface CommissionConfig {
  /** Hold window in days before a pending credit becomes spendable. */
  holdDays: number;
  /** Direct referrer (order.distributor_id). */
  l1Percent: number;
  /** That referrer's sponsor. */
  l2Percent: number;
  /** One level further up. */
  l3Percent: number;
  /** Per-order ceiling across all levels, % of the net base. */
  maxTotalPercent: number;
  /** Single-level % paid to a referrer when the referred person buys a code/store. */
  purchaseReferralPercent: number;
  /** Hard ceiling the platform enforces regardless of company config. */
  capPercent: number;
  /** Skip the hold window (still reversable on refund). */
  autoApprove: boolean;
}

export const DEFAULT_COMMISSION: CommissionConfig = {
  holdDays: 7,
  l1Percent: 10,
  l2Percent: 4,
  l3Percent: 1,
  maxTotalPercent: 15,
  purchaseReferralPercent: 10,
  capPercent: 25,
  autoApprove: false
};

function clampNumber(value: unknown, fallback: number, min = 0, max = 100) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function normalize(raw: any, base: CommissionConfig): CommissionConfig {
  const out: CommissionConfig = { ...base };
  if (!raw || typeof raw !== 'object') return out;

  out.holdDays = clampNumber(raw.holdDays, out.holdDays, 0, 90);
  out.l1Percent = clampNumber(raw.l1Percent ?? raw.l1, out.l1Percent, 0, 100);
  out.l2Percent = clampNumber(raw.l2Percent ?? raw.l2, out.l2Percent, 0, 100);
  out.l3Percent = clampNumber(raw.l3Percent ?? raw.l3, out.l3Percent, 0, 100);
  out.maxTotalPercent = clampNumber(raw.maxTotalPercent ?? raw.maxTotal, out.maxTotalPercent, 0, 100);
  out.purchaseReferralPercent = clampNumber(
    raw.purchaseReferralPercent ?? raw.purchaseReferral,
    out.purchaseReferralPercent,
    0,
    100
  );
  out.capPercent = clampNumber(raw.capPercent ?? raw.cap, out.capPercent, 0, 100);
  out.autoApprove = raw.autoApprove === true || raw.autoApprove === 'true';
  return out;
}

/**
 * Effective config for a company: platform defaults, overridden per company,
 * then hardened against the platform cap so a white-labeled tenant can never
 * configure a payout that exceeds the platform's ceiling.
 */
export async function getCommissionConfig(sb: SupabaseClient, companyId?: string | null): Promise<CommissionConfig> {
  let cfg: CommissionConfig = { ...DEFAULT_COMMISSION };

  try {
    const { data: platform } = await sb
      .from('settings')
      .select('value')
      .eq('scope', 'platform')
      .eq('key', 'commission')
      .maybeSingle();
    cfg = normalize(platform?.value, cfg);
  } catch {
    /* fall back to defaults */
  }

  if (companyId) {
    try {
      const { data: company } = await sb
        .from('settings')
        .select('value')
        .eq('scope', 'company')
        .eq('company_id', companyId)
        .eq('key', 'commission')
        .maybeSingle();
      cfg = normalize(company?.value, cfg);
    } catch {
      /* keep platform config */
    }
  }

  // Company may lower its ceiling but never raise it above the platform cap.
  cfg.maxTotalPercent = Math.min(cfg.maxTotalPercent, cfg.capPercent);
  cfg.l1Percent = Math.min(cfg.l1Percent, cfg.maxTotalPercent);
  cfg.l2Percent = Math.min(cfg.l2Percent, cfg.maxTotalPercent);
  cfg.l3Percent = Math.min(cfg.l3Percent, cfg.maxTotalPercent);
  if (cfg.l1Percent + cfg.l2Percent + cfg.l3Percent > cfg.maxTotalPercent) {
    // Trim from the top of the chain so the direct referrer keeps its rate.
    let remaining = cfg.maxTotalPercent;
    cfg.l1Percent = Math.min(cfg.l1Percent, remaining);
    remaining -= cfg.l1Percent;
    cfg.l2Percent = Math.min(cfg.l2Percent, remaining);
    remaining -= cfg.l2Percent;
    cfg.l3Percent = Math.min(cfg.l3Percent, remaining);
  }
  cfg.purchaseReferralPercent = Math.min(cfg.purchaseReferralPercent, cfg.capPercent);

  return cfg;
}

function round2(n: number) {
  return Math.round(Number(n || 0) * 100) / 100;
}

/** Existing payout for one (event, user, level) — the idempotency lookup. */
function findCommission(sb: SupabaseClient, refType: string, refId: string, userId: string, level: number | null) {
  let q = sb.from('commissions').select('*').eq('ref_type', refType).eq('ref_id', refId).eq('user_id', userId);
  q = level === null ? q.is('level', null) : q.eq('level', level);
  return q.maybeSingle();
}

/** Commission base: net of VAT and never the delivery fee (that belongs to the driver). */
export function commissionBase(order: any): number {
  let base = Number(order?.subtotal_excl_vat);
  if (!Number.isFinite(base)) base = Number(order?.subtotal || 0) - Number(order?.vat_amount || 0);
  if (!Number.isFinite(base)) base = 0;
  return round2(Math.max(0, base));
}

async function ensureWallet(sb: SupabaseClient, tenantId: string | null, userId: string): Promise<string | null> {
  const { data: w } = await sb.from('wallets').select('*').eq('user_id', userId).maybeSingle();
  if (w?.id) return w.id;
  const { data: nw } = await sb
    .from('wallets')
    .insert({ user_id: userId, tenant_id: tenantId, balance_zar: 0, pending_zar: 0, held_zar: 0 })
    .select('*')
    .single();
  return nw?.id || null;
}

async function writeLedger(
  sb: SupabaseClient,
  walletId: string,
  tenantId: string | null,
  type: string,
  amount: number,
  balanceAfter: number,
  refId?: string | null,
  refType?: string | null,
  description?: string
) {
  await sb.from('wallet_ledger').insert({
    wallet_id: walletId,
    tenant_id: tenantId,
    type,
    amount_zar: amount,
    balance_after: balanceAfter,
    ref_id: refId || null,
    ref_type: refType || null,
    description: description || null
  });
}

/**
 * Credit a wallet. `dest: 'pending'` holds the money until release (used for
 * commission hold windows); `'available'` credits spendable balance directly.
 */
export async function creditWallet(
  sb: SupabaseClient,
  tenantId: string | null,
  userId: string,
  amountZar: number,
  description: string,
  refId?: string,
  refType?: string,
  dest: 'available' | 'pending' = 'available'
) {
  const amount = round2(amountZar);
  if (!walletIdSafe(amount)) return;
  const walletId = await ensureWallet(sb, tenantId, userId);
  if (!walletId) return;

  const { data: w } = await sb.from('wallets').select('*').eq('id', walletId).maybeSingle();
  if (!w) return;

  const patch: any = {};
  let after = Number(w.balance_zar || 0);
  let heldAfter = Number(w.held_zar || 0);
  if (dest === 'pending') {
    heldAfter = round2(heldAfter + amount);
    patch.held_zar = heldAfter;
  } else {
    after = round2(after + amount);
    patch.balance_zar = after;
  }
  await sb.from('wallets').update(patch).eq('id', walletId);
  await writeLedger(sb, walletId, tenantId, dest === 'pending' ? 'hold' : 'credit', amount, dest === 'pending' ? heldAfter : after, refId, refType, description);
}

function walletIdSafe(amount: number) {
  return Number.isFinite(amount) && amount > 0;
}

/** Remove money from a wallet, optionally from the pending bucket. */
async function debitWallet(
  sb: SupabaseClient,
  tenantId: string | null,
  userId: string,
  amountZar: number,
  description: string,
  refId?: string | null,
  refType?: string | null,
  fromPending = false
) {
  const amount = round2(amountZar);
  if (!walletIdSafe(amount)) return;
  const walletId = await ensureWallet(sb, tenantId, userId);
  if (!walletId) return;

  const { data: w } = await sb.from('wallets').select('*').eq('id', walletId).maybeSingle();
  if (!w) return;

  const patch: any = {};
  let balanceAfter = Number(w.balance_zar || 0);
  let heldAfter = Number(w.held_zar || 0);
  if (fromPending) {
    heldAfter = round2(Math.max(0, heldAfter - amount));
    patch.held_zar = heldAfter;
  } else {
    // Never let a reversal push a balance negative — the floor is 0.
    balanceAfter = round2(Math.max(0, balanceAfter - amount));
    patch.balance_zar = balanceAfter;
  }
  await sb.from('wallets').update(patch).eq('id', walletId);
  await writeLedger(sb, walletId, tenantId, 'reversal', -amount, fromPending ? heldAfter : balanceAfter, refId, refType, description);
}

export interface RecordCommissionOpts {
  tenantId: string | null;
  userId: string;
  companyId?: string | null;
  orderId?: string | null;
  refId?: string | null;
  refType?: string;
  amountZar: number;
  bonusType?: string | null;
  level?: number | null;
  source?: string;
  description?: string;
  holdDays?: number;
  autoApprove?: boolean;
}

/**
 * Record one payout. Idempotent: the same (event, user, level) can never be
 * credited twice, regardless of how many times the caller fires.
 */
export async function recordCommission(sb: SupabaseClient, opts: RecordCommissionOpts): Promise<any | null> {
  const amount = round2(opts.amountZar);
  if (!walletIdSafe(amount)) return null;

  const refType = opts.refType || (opts.orderId ? 'order' : 'manual');
  const refId = opts.refId || opts.orderId || null;
  const level = opts.level ?? null;

  if (refId) {
    const { data: existing } = await findCommission(sb, refType, refId, opts.userId, level);
    if (existing) return existing;
  }

  const holdDays = opts.holdDays ?? DEFAULT_COMMISSION.holdDays;
  const autoApprove = opts.autoApprove ?? false;
  const now = Date.now();
  const releaseAt = new Date(now + Math.max(0, holdDays) * 86400000).toISOString();
  const status = autoApprove ? 'approved' : 'pending';

  const payload: any = {
    tenant_id: opts.tenantId,
    user_id: opts.userId,
    company_id: opts.companyId || null,
    order_id: opts.orderId || null,
    ref_id: refId,
    ref_type: refType,
    level,
    source: opts.source || 'sale',
    bonus_type: opts.bonusType || null,
    amount_zar: amount,
    status,
    release_at: releaseAt,
    released_at: autoApprove ? new Date().toISOString() : null,
    description: opts.description || null
  };

  let row: any = null;
  const { data, error } = await sb.from('commissions').insert(payload).select('*').single();
  if (!error) {
    row = data;
  } else if (refId) {
    // Unique index fired: this event already paid this user at this level.
    const { data: existing } = await findCommission(sb, refType, refId, opts.userId, level);
    if (existing) return existing;
    console.error('recordCommission insert failed', error.message);
    return null;
  } else {
    console.error('recordCommission insert failed', error.message);
    return null;
  }

  await creditWallet(
    sb,
    opts.tenantId,
    opts.userId,
    amount,
    opts.description || `Commission (level ${level ?? 'n/a'})`,
    row?.id,
    'commission',
    status === 'pending' ? 'pending' : 'available'
  );

  await notify({
    userId: opts.userId,
    type: 'order',
    title: status === 'pending' ? 'Commission earned' : 'Commission paid',
    body:
      status === 'pending'
        ? `R${amount} is held until ${releaseAt.slice(0, 10)}.`
        : `R${amount} is available in your wallet.`,
    data: { commissionId: row?.id, amountZar: amount }
  });

  return row;
}

/**
 * Walk up the sponsor chain from a referrer. Cycle- and self-referral-safe: if
 * the chain loops back to any node already seen (including the customer), the
 * walk stops rather than paying the same person repeatedly.
 */
async function sponsorOf(sb: SupabaseClient, userId: string): Promise<string | null> {
  const { data } = await sb.from('users').select('distributor_id').eq('id', userId).maybeSingle();
  return (data as any)?.distributor_id || null;
}

export async function walkSponsors(sb: SupabaseClient, firstReferrerId: string, depth: number, customerId?: string | null) {
  const chain: string[] = [];
  const seen = new Set<string>();
  if (customerId) seen.add(customerId);

  let current: string | null = firstReferrerId;
  while (current && chain.length < depth) {
    if (seen.has(current)) break;
    seen.add(current);
    chain.push(current);
    current = await sponsorOf(sb, current);
  }
  return chain;
}

/**
 * Pay the 3-level retail override on a completed order, on the net-of-VAT
 * base, capped by config. Safe to call more than once for the same order.
 */
export async function payOrderCommissions(sb: SupabaseClient, order: any): Promise<number> {
  const first = order?.distributor_id;
  if (!first) return 0;

  const base = commissionBase(order);
  if (base <= 0) return 0;

  const cfg = await getCommissionConfig(sb, order.company_id);
  // A company's plan caps how deep the retail override reaches (Free = level 1).
  const { entitlements } = await getCompanyEntitlements(sb, order.company_id || null);
  const depth = Math.max(1, Math.min(3, entitlements.commissionLevels));
  const rates = [cfg.l1Percent, cfg.l2Percent, cfg.l3Percent].slice(0, depth);
  if (!rates.some((r) => r > 0)) return 0;

  const chain = await walkSponsors(sb, first, rates.length, order.customer_id);
  if (!chain.length) return 0;

  const labels = ['direct referrer', 'sponsor', 'senior sponsor'];
  let spent = 0;
  let paid = 0;

  for (let i = 0; i < chain.length; i++) {
    const pct = rates[i] || 0;
    if (pct <= 0) continue;
    if (spent + pct > cfg.maxTotalPercent) break;

    const amount = round2(base * (pct / 100));
    if (amount <= 0) continue;

    spent += pct;
    const row = await recordCommission(sb, {
      tenantId: order.tenant_id || null,
      userId: chain[i],
      companyId: order.company_id || null,
      orderId: order.id,
      refId: order.id,
      refType: 'order',
      amountZar: amount,
      bonusType: 'retail',
      level: i + 1,
      source: 'order',
      description: `${labels[i]} · ${pct}% of R${base} on order ${order.order_number || ''}`.trim(),
      holdDays: cfg.holdDays,
      autoApprove: cfg.autoApprove
    });
    if (row) paid += 1;
  }

  return paid;
}

/**
 * Pay the buyer's referrer when the buyer purchases a store or distributor
 * code. This is what lets a store owner earn from the people they referred.
 */
export async function payPurchaseReferral(
  sb: SupabaseClient,
  opts: {
    purchaserId: string;
    priceZar: number;
    refType: 'code_purchase' | 'store_purchase';
    refId: string;
    companyId?: string | null;
    tenantId?: string | null;
    label?: string;
  }
): Promise<boolean> {
  const price = round2(opts.priceZar);
  if (!walletIdSafe(price) || !opts.purchaserId) return false;

  const { data: buyer } = await sb
    .from('users')
    .select('id, tenant_id, distributor_id, name')
    .eq('id', opts.purchaserId)
    .maybeSingle();
  const referrer = buyer?.distributor_id || null;
  if (!referrer || referrer === opts.purchaserId) return false;

  const cfg = await getCommissionConfig(sb, opts.companyId || null);
  const pct = cfg.purchaseReferralPercent;
  if (pct <= 0) return false;

  const amount = round2(price * (pct / 100));
  if (amount <= 0) return false;

  const row = await recordCommission(sb, {
    tenantId: buyer?.tenant_id || opts.tenantId || null,
    userId: referrer,
    companyId: opts.companyId || null,
    refId: opts.refId,
    refType: opts.refType,
    amountZar: amount,
    bonusType: 'referral',
    level: 1,
    source: 'purchase',
    description: `${pct}% referral on ${opts.label || 'purchase'} (R${price})`,
    holdDays: cfg.holdDays,
    autoApprove: cfg.autoApprove
  });
  return !!row;
}

/** Move every due pending commission into spendable balance. */
export async function releaseDueCommissions(sb: SupabaseClient, limit = 100): Promise<number> {
  const now = new Date().toISOString();
  const { data: due } = await sb
    .from('commissions')
    .select('*')
    .eq('status', 'pending')
    .lte('release_at', now)
    .order('release_at', { ascending: true })
    .limit(limit);

  if (!due?.length) return 0;

  let released = 0;
  for (const c of due) {
    // Conditional update: only one caller can move a given commission, so
    // concurrent release jobs can't credit the wallet twice.
    const { data: updated } = await sb
      .from('commissions')
      .update({ status: 'approved', released_at: now })
      .eq('id', c.id)
      .eq('status', 'pending')
      .select('id');
    if (!updated?.length) continue;

    const amount = round2(c.amount_zar);
    const walletId = await ensureWallet(sb, c.tenant_id, c.user_id);
    if (walletId) {
      const { data: w } = await sb.from('wallets').select('*').eq('id', walletId).maybeSingle();
      if (w) {
        const heldAfter = round2(Math.max(0, Number(w.held_zar || 0) - amount));
        const balanceAfter = round2(Number(w.balance_zar || 0) + amount);
        await sb.from('wallets').update({ held_zar: heldAfter, balance_zar: balanceAfter }).eq('id', walletId);
        await writeLedger(sb, walletId, c.tenant_id, 'release', amount, balanceAfter, c.id, 'commission', c.description);
      }
    }
    released += 1;
  }
  return released;
}

/**
 * Reverse everything credited for one event (an order that was cancelled or
 * refunded), pulling pending money back from pending and released money back
 * from balance.
 */
export async function reverseCommissions(
  sb: SupabaseClient,
  refType: string,
  refId: string,
  reason = 'Order reversed'
): Promise<number> {
  const { data: rows } = await sb
    .from('commissions')
    .select('*')
    .eq('ref_type', refType)
    .eq('ref_id', refId)
    .in('status', ['pending', 'approved']);

  if (!rows?.length) return 0;

  const now = new Date().toISOString();
  let reversed = 0;

  for (const c of rows) {
    const { data: updated } = await sb
      .from('commissions')
      .update({ status: 'reversed', reversed_at: now })
      .eq('id', c.id)
      .in('status', ['pending', 'approved'])
      .select('id');
    if (!updated?.length) continue;

    await debitWallet(
      sb,
      c.tenant_id,
      c.user_id,
      round2(c.amount_zar),
      reason,
      c.id,
      refType,
      c.status === 'pending'
    );
    reversed += 1;
  }
  return reversed;
}
