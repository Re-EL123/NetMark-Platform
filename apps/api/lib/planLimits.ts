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
  entitlements: Entitlements;
}

/** Effective plan + entitlements for a company (Free when unassigned). */
export async function getCompanyEntitlements(sb: SupabaseClient, companyId?: string | null): Promise<CompanyPlan> {
  if (!companyId) {
    return { planId: null, planName: null, entitlements: { ...FULL_ENTITLEMENTS } };
  }
  try {
    const { data } = await sb
      .from('companies_plans')
      .select('plan_id, plans(name, features)')
      .eq('company_id', companyId)
      .maybeSingle();
    const plan: any = (data as any)?.plans;
    if (!plan) {
      return { planId: null, planName: null, entitlements: { ...DEFAULT_ENTITLEMENTS } };
    }
    return {
      planId: (data as any)?.plan_id || null,
      planName: plan?.name || null,
      entitlements: normalizeEntitlements(plan?.features)
    };
  } catch {
    return { planId: null, planName: null, entitlements: { ...DEFAULT_ENTITLEMENTS } };
  }
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
