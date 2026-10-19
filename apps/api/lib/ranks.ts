import { SupabaseClient } from '@supabase/supabase-js';
import { randomBytes } from 'crypto';
import { notify } from './notify';

/**
 * Per-company downline memberships + the configurable rank ladder.
 *
 * A store owner builds a network *inside a company*: company_memberships links
 * a member (user_id) to the company and to the person who recruited them
 * (sponsor_id). The same user can hold a membership in several companies, each
 * with its own member number (which never expires), status and volume.
 *
 * Volume is measured in BV = net-of-VAT ZAR.
 *   personal_bv / group_bv         – lifetime, drives rank promotion
 *   personal_period_bv / group_bv  – reset each calendar month, drives bonuses
 *
 * Ranks promote and never demote (cumulative).
 */

export interface Rank {
  id: string;
  name: string;
  slug: string;
  level: number;
  minPersonalBv: number;
  minGroupBv: number;
  minPersonalPeriodBv: number;
  retailOverridePercent: number;
  monthlyBonusZar: number;
  leadershipPoolPercent: number;
  isActive: boolean;
  sortOrder: number;
}

export interface Membership {
  id: string;
  tenant_id: string | null;
  company_id: string;
  user_id: string;
  sponsor_id: string | null;
  member_no: string;
  status: 'active' | 'paused' | 'suspended' | 'terminated';
  rank_id: string | null;
  personal_bv: number;
  group_bv: number;
  personal_period_bv: number;
  group_period_bv: number;
  period_key: string | null;
  joined_at: string;
  last_activity_at: string;
  paused_at: string | null;
  suspended_at: string | null;
  [k: string]: any;
}

function round2(n: number) {
  return Math.round(Number(n || 0) * 100) / 100;
}

export function currentPeriodKey(d = new Date()): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export async function getRanks(sb: SupabaseClient, activeOnly = true): Promise<Rank[]> {
  let q = sb
    .from('ranks')
    .select('*')
    .order('level', { ascending: true })
    .order('sort_order', { ascending: true });
  if (activeOnly) q = q.eq('is_active', true);
  const { data } = await q;
  return (data || []).map((r: any) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    level: Number(r.level || 0),
    minPersonalBv: Number(r.min_personal_bv || 0),
    minGroupBv: Number(r.min_group_bv || 0),
    minPersonalPeriodBv: Number(r.min_personal_period_bv || 0),
    retailOverridePercent: Number(r.retail_override_percent || 0),
    monthlyBonusZar: Number(r.monthly_bonus_zar || 0),
    leadershipPoolPercent: Number(r.leadership_pool_percent || 0),
    isActive: r.is_active !== false,
    sortOrder: Number(r.sort_order || 0)
  }));
}

/** Highest rank whose BOTH personal and group lifetime thresholds are met. */
export function resolveRank(ranks: Rank[], personalBv: number, groupBv: number): Rank | null {
  let match: Rank | null = null;
  for (const r of ranks) {
    if (personalBv + 1e-9 >= r.minPersonalBv && groupBv + 1e-9 >= r.minGroupBv) {
      if (!match || r.level > match.level) match = r;
    }
  }
  return match;
}

export async function getMembership(
  sb: SupabaseClient,
  companyId: string | null,
  userId: string
): Promise<Membership | null> {
  if (!companyId || !userId) return null;
  const { data } = await sb
    .from('company_memberships')
    .select('*')
    .eq('company_id', companyId)
    .eq('user_id', userId)
    .maybeSingle();
  return (data as Membership) || null;
}

function cleanPrefix(value?: string | null): string {
  return String(value || '')
    .replace(/[^a-z0-9]/gi, '')
    .toUpperCase()
    .slice(0, 3);
}

function companyInitials(name?: string | null): string {
  return String(name || '')
    .split(/\s+/)
    .map((w) => w[0] || '')
    .join('')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 3);
}

async function companyPrefix(sb: SupabaseClient, companyId: string): Promise<string> {
  const { data } = await sb.from('companies').select('slug, name').eq('id', companyId).maybeSingle();
  return cleanPrefix(data?.slug) || companyInitials(data?.name) || 'NM';
}

function randomMemberNo(prefix: string) {
  return `${prefix}-${randomBytes(3).toString('hex').toUpperCase()}`;
}

/**
 * Fetch or create the membership for (company, user). New memberships are born
 * active at the base rank and carry a permanent member number.
 */
export async function ensureMembership(
  sb: SupabaseClient,
  opts: { companyId: string; userId: string; sponsorId?: string | null; tenantId?: string | null }
): Promise<Membership | null> {
  const existing = await getMembership(sb, opts.companyId, opts.userId);
  if (existing) {
    if (!existing.sponsor_id && opts.sponsorId && opts.sponsorId !== opts.userId) {
      const { data } = await sb
        .from('company_memberships')
        .update({ sponsor_id: opts.sponsorId, updated_at: new Date().toISOString() })
        .eq('id', existing.id)
        .select('*')
        .single();
      return (data as Membership) || existing;
    }
    return existing;
  }

  const ranks = await getRanks(sb);
  const base = ranks[0] || null;
  const prefix = await companyPrefix(sb, opts.companyId);

  for (let attempt = 0; attempt < 5; attempt++) {
    const memberNo = randomMemberNo(prefix);
    const { data, error } = await sb
      .from('company_memberships')
      .insert({
        tenant_id: opts.tenantId || null,
        company_id: opts.companyId,
        user_id: opts.userId,
        sponsor_id: opts.sponsorId && opts.sponsorId !== opts.userId ? opts.sponsorId : null,
        member_no: memberNo,
        status: 'active',
        rank_id: base?.id || null,
        personal_bv: 0,
        group_bv: 0,
        personal_period_bv: 0,
        group_period_bv: 0,
        period_key: currentPeriodKey(),
        joined_at: new Date().toISOString(),
        last_activity_at: new Date().toISOString()
      })
      .select('*')
      .single();
    if (!error) return data as Membership;
    if (error.code === '23505') {
      const again = await getMembership(sb, opts.companyId, opts.userId);
      if (again) return again;
      continue;
    }
    console.error('ensureMembership insert failed', error.message);
    return null;
  }
  return null;
}

/**
 * Walk a member's sponsorship chain inside one company, starting with the
 * member themselves, up to `depth` levels.
 */
export async function sponsorChain(
  sb: SupabaseClient,
  companyId: string,
  userId: string,
  depth = 25
): Promise<Membership[]> {
  const chain: Membership[] = [];
  const seen = new Set<string>();
  let current: string | null = userId;
  while (current && chain.length < depth && !seen.has(current)) {
    seen.add(current);
    const m = await getMembership(sb, companyId, current);
    if (!m) break;
    chain.push(m);
    current = m.sponsor_id;
  }
  return chain;
}

/**
 * The user ids who receive override on `buyerId`'s activity inside a company,
 * most-direct first (the buyer excluded). Uses per-company membership links and
 * falls back to the global referrer for the first hop.
 */
export async function overrideChain(
  sb: SupabaseClient,
  companyId: string | null,
  buyerId: string,
  fallbackFirst?: string | null,
  depth = 3
): Promise<string[]> {
  const out: string[] = [];
  const seen = new Set<string>([buyerId]);

  let first: string | null = null;
  if (companyId) {
    const m = await getMembership(sb, companyId, buyerId);
    first = m?.sponsor_id || null;
  }
  if (!first) first = fallbackFirst || null;

  let current = first;
  let hops = 0;
  while (current && hops < depth && !seen.has(current)) {
    seen.add(current);
    out.push(current);
    hops += 1;
    if (companyId) {
      const m = await getMembership(sb, companyId, current);
      if (m) {
        current = m.sponsor_id;
        continue;
      }
    }
    const { data } = await sb.from('users').select('distributor_id').eq('id', current).maybeSingle();
    current = data?.distributor_id || null;
  }
  return out;
}

async function promoteIfEligible(sb: SupabaseClient, membership: Membership, ranks: Rank[]): Promise<void> {
  const eligible = resolveRank(ranks, Number(membership.personal_bv || 0), Number(membership.group_bv || 0));
  if (!eligible) return;
  const current = ranks.find((r) => r.id === membership.rank_id) || null;
  if (current && eligible.level <= current.level) return;

  await sb
    .from('company_memberships')
    .update({ rank_id: eligible.id, updated_at: new Date().toISOString() })
    .eq('id', membership.id);
  membership.rank_id = eligible.id;

  await notify({
    userId: membership.user_id,
    type: 'order',
    title: `Promoted to ${eligible.name}`,
    body: `Your network volume qualifies you for ${eligible.name}.`,
    data: { companyId: membership.company_id, rankId: eligible.id }
  });
}

async function bumpMembership(
  sb: SupabaseClient,
  membership: Membership,
  opts: { personal: number; group: number; period: string; ranks: Rank[] }
): Promise<void> {
  const { personal, group, period, ranks } = opts;
  const inPeriod = membership.period_key === period;
  const basePersonalPeriod = inPeriod ? Number(membership.personal_period_bv || 0) : 0;
  const baseGroupPeriod = inPeriod ? Number(membership.group_period_bv || 0) : 0;

  const patch: any = {
    personal_bv: round2(Number(membership.personal_bv || 0) + personal),
    group_bv: round2(Number(membership.group_bv || 0) + group),
    personal_period_bv: round2(basePersonalPeriod + personal),
    group_period_bv: round2(baseGroupPeriod + group),
    period_key: period,
    last_activity_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  // Any activity revives a suspended member (their member number is intact).
  if (membership.status === 'suspended') {
    patch.status = 'active';
    patch.suspended_at = null;
  }

  membership.personal_bv = patch.personal_bv;
  membership.group_bv = patch.group_bv;
  membership.personal_period_bv = patch.personal_period_bv;
  membership.group_period_bv = patch.group_period_bv;
  membership.period_key = period;
  if (patch.status) membership.status = patch.status;

  await sb.from('company_memberships').update(patch).eq('id', membership.id);
  await promoteIfEligible(sb, membership, ranks);
}

/**
 * Record volume for a buyer's activity and cascade group volume up the
 * company sponsorship chain. Reactivates suspended memberships and promotes
 * ranks. Call once per completed order/purchase.
 */
export async function applyVolume(
  sb: SupabaseClient,
  opts: { companyId: string | null; userId: string; bv: number; tenantId?: string | null; sponsorId?: string | null }
): Promise<void> {
  const amount = round2(opts.bv);
  if (!opts.companyId || !opts.userId || amount <= 0) return;

  const self = await ensureMembership(sb, {
    companyId: opts.companyId,
    userId: opts.userId,
    sponsorId: opts.sponsorId || null,
    tenantId: opts.tenantId || null
  });
  if (!self) return;

  const ranks = await getRanks(sb);
  const period = currentPeriodKey();
  const chain = await sponsorChain(sb, opts.companyId, opts.userId);

  // Self earns personal + group volume, then every sponsor earns group volume
  // (and is kept active by their downline's activity — group volume counts).
  for (const member of chain) {
    const personal = member.user_id === opts.userId ? amount : 0;
    await bumpMembership(sb, member, { personal, group: amount, period, ranks });
  }
}

/** Suspend memberships dormant for more than `days`. Their IDs are retained. */
export async function suspendInactiveMemberships(sb: SupabaseClient, days: number): Promise<number> {
  const cutoff = new Date(Date.now() - Math.max(1, days) * 86400000).toISOString();
  const { data } = await sb
    .from('company_memberships')
    .select('id')
    .eq('status', 'active')
    .lt('last_activity_at', cutoff);
  if (!data?.length) return 0;

  let suspended = 0;
  for (const row of data) {
    const { data: updated } = await sb
      .from('company_memberships')
      .update({ status: 'suspended', suspended_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', row.id)
      .eq('status', 'active')
      .select('id');
    if (updated?.length) suspended += 1;
  }
  return suspended;
}

/** Recalculate lifetime ranks across every active membership (promotion only). */
export async function recalcRanks(sb: SupabaseClient, limit = 1000): Promise<number> {
  const ranks = await getRanks(sb);
  const { data } = await sb
    .from('company_memberships')
    .select('*')
    .in('status', ['active', 'paused', 'suspended'])
    .limit(limit);
  if (!data?.length) return 0;
  let promoted = 0;
  for (const row of data as Membership[]) {
    const before = row.rank_id;
    await promoteIfEligible(sb, row, ranks);
    if (row.rank_id !== before) promoted += 1;
  }
  return promoted;
}

/** Pay each qualifying active membership its rank's fixed monthly bonus once. */
export async function runMonthlyBonuses(sb: SupabaseClient, period = currentPeriodKey()): Promise<number> {
  const ranks = await getRanks(sb);
  const byId = new Map(ranks.map((r) => [r.id, r]));
  const { data } = await sb
    .from('company_memberships')
    .select('*')
    .eq('status', 'active')
    .eq('period_key', period)
    .limit(1000);
  if (!data?.length) return 0;

  const { recordCommission } = await import('./commissionEngine');
  let paid = 0;
  for (const m of data as Membership[]) {
    const rank = m.rank_id ? byId.get(m.rank_id) : null;
    if (!rank || rank.monthlyBonusZar <= 0) continue;
    if (Number(m.personal_period_bv || 0) < rank.minPersonalPeriodBv) continue;
    const row = await recordCommission(sb, {
      tenantId: m.tenant_id,
      userId: m.user_id,
      companyId: m.company_id,
      refType: 'rank_bonus',
      amountZar: rank.monthlyBonusZar,
      bonusType: 'rank_bonus',
      source: 'rank_bonus',
      dedupeKey: `rank_bonus:${m.company_id}:${m.user_id}:${period}`,
      description: `${rank.name} monthly bonus (${period})`,
      autoApprove: true
    });
    if (row) paid += 1;
  }
  return paid;
}
