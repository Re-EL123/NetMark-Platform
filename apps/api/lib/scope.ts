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
