import { randomUUID } from 'crypto';
import { SupabaseClient } from '@supabase/supabase-js';

/**
 * Shared role-scoping helpers.
 *
 * The tenancy model is:
 *   - platformAdmin            -> everything
 *   - owner                    -> their company (catalog, orders, team)
 *   - storeOwner               -> stores they own (stores.store_owner_id)
 *   - customer / driver        -> their own records
 *
 * storeOwner has no company_id, so scoping them by company would either leak
 * company-less rows or return nothing. Use this helper to resolve the set of
 * store ids a user is responsible for.
 */
export async function storeIdsForUser(
  sb: SupabaseClient,
  userId: string,
  column: 'store_owner_id' | 'distributor_id'
): Promise<string[]> {
  const { data } = await sb.from('stores').select('id').eq(column, userId);
  return (data || []).map((s: any) => s.id);
}

/** True when the role resolves data through store ownership rather than company. */
export function isStoreScopedRole(role: string): boolean {
  return role === 'storeOwner';
}

/**
 * Company / tenant scope provisioning.
 *
 * Every user row carries a `tenant_id` (row-level scope key) and, when they
 * belong to a company, a `company_id`. Which scope a role *needs* differs:
 *
 *   platformAdmin  – global; no company required (company scope cleared).
 *   owner          – must own a company; one is created if missing and its
 *                    tenant is shared so owner-scoped filtering lines up.
 *   storeOwner     – may operate independently (own tenant) or belong to a
 *   customer         company they were invited into. Keeps an existing company.
 *   driver
 *
 * Scope is *never* downgraded silently beyond what a role requires: switching
 * away from `owner` leaves the company intact but ensures a tenant exists.
 */

const NO_COMPANY_ROLES = ['platformAdmin'];

function slugify(value: string, fallback: string): string {
  const base = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return base || fallback;
}

export interface EnsureScopeParams {
  userId: string;
  role: string;
  /** Used to name / slug a company created for an owner. */
  name?: string | null;
  email?: string | null;
}

export interface EnsureScopeResult {
  companyId: string | null;
  tenantId: string;
  /** True when a new company was created by this call. */
  companyCreated: boolean;
}

/**
 * Guarantee the user has the scope their role needs and persist it. Safe to
 * call repeatedly; only creates what is missing.
 */
export async function ensureScopeForRole(
  sb: SupabaseClient,
  params: EnsureScopeParams
): Promise<EnsureScopeResult> {
  const { userId, role } = params;

  const { data: user } = await sb
    .from('users')
    .select('id, name, email, company_id, tenant_id')
    .eq('id', userId)
    .maybeSingle();
  if (!user) throw new Error('User not found');

  let companyId: string | null = user.company_id || null;
  let tenantId: string | null = user.tenant_id || null;
  let companyCreated = false;

  if (NO_COMPANY_ROLES.includes(role)) {
    // Platform admins sit above any single company.
    companyId = null;
    if (!tenantId) tenantId = randomUUID();
  } else if (role === 'owner') {
    if (!companyId) {
      const displayName = params.name || user.name || params.email || user.email || 'Company';
      const slug = `${slugify(displayName, `company-${Date.now().toString(36)}`)}-${Math.random()
        .toString(36)
        .slice(2, 6)}`;
      const { data: company, error } = await sb
        .from('companies')
        .insert({ name: `${displayName}'s Company`, slug, owner_id: userId, status: 'active' })
        .select('*')
        .single();
      if (error || !company) throw new Error(error?.message || 'Could not create company scope');
      companyId = company.id;
      tenantId = company.tenant_id || randomUUID();
      companyCreated = true;
    } else {
      // Existing company: make sure they are the recorded owner and share its tenant.
      const { data: companyRow } = await sb
        .from('companies')
        .select('owner_id, tenant_id')
        .eq('id', companyId)
        .maybeSingle();
      if (companyRow) {
        tenantId = companyRow.tenant_id || tenantId;
        if (!companyRow.owner_id) {
          await sb.from('companies').update({ owner_id: userId }).eq('id', companyId);
        }
      }
    }
  }

  if (!tenantId) tenantId = randomUUID();

  await sb
    .from('users')
    .update({ company_id: companyId, tenant_id: tenantId })
    .eq('id', userId);

  return { companyId, tenantId, companyCreated };
}
