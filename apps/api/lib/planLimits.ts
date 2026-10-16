import { SupabaseClient } from '@supabase/supabase-js';

/**
 * Company plan entitlements.
 *
 * A company's `plans.features` jsonb holds these keys. Numeric limits use `-1`
 * for "unlimited". `getCompanyEntitlements` resolves the effective set for a
 * company, defaulting to the Free tier when it has no active assignment, and
 * to a fully-unrestricted set for platform admins and non-company roles
 * (store owners / customers, who are not billed against a company plan).
 */

export interface Entitlements {
  /** Max catalog products a company may create. -1 = unlimited. */
  maxProducts: number;
  /** Max stores a company may create. -1 = unlimited. */
  maxStores: number;
  /** Max team members under a company. -1 = unlimited. */
  maxTeamMembers: number;
  /** Max distributor codes a company may issue. -1 = unlimited. */
  maxCodes: number;
  /** How many levels of the retail override the company's network pays (1-3). */
  commissionLevels: number;
  /** Whether the company may withdraw earnings / receive payouts. */
  payouts: boolean;
  /** 'basic' exposes the overview only; 'full' unlocks cohorts/ltv/retail. */
  reports: 'basic' | 'full';
  /** Whether the company's customers may schedule autoship. */
  autoship: boolean;
  /** Whether the company may remove NetMark branding (white-label). */
  whiteLabel: boolean;
  /** Whether the company may create API keys. */
  api: boolean;
  /** Whether the company may register outbound webhooks. */
  webhooks: boolean;
}

/** The Free tier — also the fallback when a company has no assigned plan. */
export const DEFAULT_ENTITLEMENTS: Entitlements = {
  maxProducts: 10,
  maxStores: 1,
  maxTeamMembers: 1,
  maxCodes: 3,
  commissionLevels: 1,
  payouts: false,
  reports: 'basic',
  autoship: false,
  whiteLabel: false,
  api: false,
  webhooks: false
};

/** Unrestricted set for platform admins and non-company roles. */
export const FULL_ENTITLEMENTS: Entitlements = {
  maxProducts: -1,
  maxStores: -1,
  maxTeamMembers: -1,
  maxCodes: -1,
  commissionLevels: 3,
  payouts: true,
  reports: 'full',
  autoship: true,
  whiteLabel: true,
  api: true,
  webhooks: true
};

function num(value: unknown, fallback: number): number {
  if (value === null || value === undefined || value === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

/** Coerce a raw `features` blob into a complete, validated entitlements set. */
export function normalizeEntitlements(features: any): Entitlements {
  const f = features && typeof features === 'object' ? features : {};
  return {
    maxProducts: num(f.maxProducts, DEFAULT_ENTITLEMENTS.maxProducts),
    maxStores: num(f.maxStores, DEFAULT_ENTITLEMENTS.maxStores),
    maxTeamMembers: num(f.maxTeamMembers, DEFAULT_ENTITLEMENTS.maxTeamMembers),
    maxCodes: num(f.maxCodes, DEFAULT_ENTITLEMENTS.maxCodes),
    commissionLevels: Math.max(1, Math.min(3, num(f.commissionLevels, DEFAULT_ENTITLEMENTS.commissionLevels))),
    payouts: f.payouts === true,
    reports: f.reports === 'full' ? 'full' : 'basic',
    autoship: f.autoship === true,
    whiteLabel: f.whiteLabel === true,
    api: f.api === true,
    webhooks: f.webhooks === true
  };
}

export interface CompanyPlan {
  planId: string | null;
  planName: string | null;
  billingStatus: string | null;
  nextBillingAt: string | null;
  entitlements: Entitlements;
}

/** Length of a paid billing term, in days. */
export const BILLING_TERM_DAYS = 30;

/** A company's plan is in force unless it is explicitly inactive or expired. */
export function isSubscriptionActive(billingStatus?: string | null, nextBillingAt?: string | null): boolean {
  if (billingStatus && billingStatus !== 'active') return false;
  if (!nextBillingAt) return true;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(nextBillingAt).getTime() >= today.getTime();
}

/** Effective plan + entitlements for a company (Free when unassigned/expired). */
export async function getCompanyEntitlements(sb: SupabaseClient, companyId?: string | null): Promise<CompanyPlan> {
  if (!companyId) {
    return { planId: null, planName: null, billingStatus: null, nextBillingAt: null, entitlements: { ...FULL_ENTITLEMENTS } };
  }
  try {
    const { data } = await sb
      .from('companies_plans')
      .select('plan_id, billing_status, next_billing_at, plans(name, features)')
      .eq('company_id', companyId)
      .maybeSingle();
    const cp: any = data;
    const plan: any = cp?.plans;
    if (!cp || !plan) {
      return { planId: null, planName: null, billingStatus: null, nextBillingAt: null, entitlements: { ...DEFAULT_ENTITLEMENTS } };
    }
    const active = isSubscriptionActive(cp.billing_status, cp.next_billing_at);
    return {
      planId: cp.plan_id || null,
      planName: plan?.name || null,
      billingStatus: active ? (cp.billing_status || 'active') : 'past_due',
      nextBillingAt: cp.next_billing_at || null,
      entitlements: active ? normalizeEntitlements(plan?.features) : { ...DEFAULT_ENTITLEMENTS }
    };
  } catch {
    return { planId: null, planName: null, billingStatus: null, nextBillingAt: null, entitlements: { ...DEFAULT_ENTITLEMENTS } };
  }
}

/**
 * Put a company on a plan for a billing term. Idempotent: callers should only
 * invoke this once per successful payment, and may re-run it safely (an active
 * subscription is refreshed, not duplicated).
 */
export async function activatePlanSubscription(
  sb: SupabaseClient,
  companyId: string,
  planId: string,
  opts: { paymentRef?: string | null; termDays?: number | null } = {}
): Promise<{ planName: string; baseFeeZar: number; nextBillingAt: string | null } | null> {
  const { data: plan } = await sb.from('plans').select('*').eq('id', planId).maybeSingle();
  if (!plan) return null;

  const termDays = opts.termDays === undefined ? BILLING_TERM_DAYS : opts.termDays;
  const nowIso = new Date().toISOString();
  const nextBillingAt =
    termDays && termDays > 0
      ? new Date(Date.now() + termDays * 86400000).toISOString()
      : null;

  await sb.from('companies_plans').upsert(
    {
      company_id: companyId,
      plan_id: plan.id,
      billing_status: 'active',
      base_fee_zar: Number(plan.base_fee_zar || 0),
      per_active_distributor_zar: Number(plan.per_active_distributor_zar || 0),
      next_billing_at: nextBillingAt,
      last_billed_at: nowIso,
      custom_overrides: {}
    },
    { onConflict: 'company_id' }
  );

  return { planName: plan.name, baseFeeZar: Number(plan.base_fee_zar || 0), nextBillingAt };
}

/** Entitlements for the current request context. */
export async function entitlementsForCtx(
  sb: SupabaseClient,
  ctx: { isPlatform?: boolean; companyId?: string | null }
): Promise<Entitlements> {
  if (ctx.isPlatform || !ctx.companyId) return { ...FULL_ENTITLEMENTS };
  return (await getCompanyEntitlements(sb, ctx.companyId)).entitlements;
}

/** True when `count` more items may be added under a numeric limit. */
export function withinLimit(max: number, count: number): boolean {
  return max < 0 || count < max;
}

/** Human-readable limit message for a failed check. */
export function limitMessage(label: string, max: number): string {
  return `Your plan allows up to ${max} ${label}. Upgrade your plan to add more.`;
}
