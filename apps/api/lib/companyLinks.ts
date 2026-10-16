import { SupabaseClient } from '@supabase/supabase-js';

/**
 * Company links — the code-gated relationship between a store owner and a
 * company.
 *
 * A link is valid while:
 *   - the store owner hasn't paused it (is_active),
 *   - the snapshot expiry (link.expires_at) is in the future, and
 *   - if the link came from a code, that code is still active and unexpired.
 *
 * Legacy links (created without a code) never expire on their own.
 */

export const ZERO_UUID = '00000000-0000-0000-0000-000000000000';

export type LinkStatus = 'active' | 'expired' | 'disabled';

export function isLinkValid(link: any, code?: any): boolean {
  if (!link || link.is_active === false) return false;
  if (link.expires_at && new Date(link.expires_at) < new Date()) return false;
  if (link.code_id) {
    if (!code) return false; // the code was deleted by the company
    if (code.is_active === false) return false;
    if (code.expires_at && new Date(code.expires_at) < new Date()) return false;
  }
  return true;
}

export function linkStatus(link: any, code?: any): LinkStatus {
  if (link?.is_active === false) return 'disabled';
  if (link?.expires_at && new Date(link.expires_at) < new Date()) return 'expired';
  if (link?.code_id) {
    if (!code) return 'expired';
    if (code.is_active === false) return 'disabled';
    if (code.expires_at && new Date(code.expires_at) < new Date()) return 'expired';
  }
  return 'active';
}

/** Load the codes referenced by a set of links, keyed by code id. */
export async function codesByIds(sb: SupabaseClient, codeIds: any[]): Promise<Map<string, any>> {
  const ids = [...new Set((codeIds || []).filter(Boolean))];
  if (!ids.length) return new Map();
  const { data } = await sb.from('distributor_codes').select('*').in('id', ids);
  return new Map((data || []).map((c: any) => [c.id, c]));
}

/** Company ids a store owner can currently sell (valid links only). */
export async function validCompanyIdsForOwner(sb: SupabaseClient, ownerId: string): Promise<string[]> {
  const { data: links } = await sb.from('company_links').select('*').eq('store_owner_id', ownerId);
  if (!links || !links.length) return [];
  const codeMap = await codesByIds(sb, links.map((l: any) => l.code_id));
  const out = new Set<string>();
  for (const l of links) {
    if (l.company_id && isLinkValid(l, codeMap.get(l.code_id))) out.add(l.company_id);
  }
  return [...out];
}

/**
 * A set of `ownerId:companyId` keys for the given store owners whose links are
 * valid. Used to decide whether a store's listings are visible to customers.
 */
export async function validLinkKeysForOwners(sb: SupabaseClient, ownerIds: any[]): Promise<Set<string>> {
  const keys = new Set<string>();
  const ids = [...new Set((ownerIds || []).filter(Boolean))];
  if (!ids.length) return keys;
  const { data: links } = await sb.from('company_links').select('*').in('store_owner_id', ids);
  if (!links || !links.length) return keys;
  const codeMap = await codesByIds(sb, links.map((l: any) => l.code_id));
  for (const l of links) {
    if (isLinkValid(l, codeMap.get(l.code_id))) keys.add(`${l.store_owner_id}:${l.company_id}`);
  }
  return keys;
}
