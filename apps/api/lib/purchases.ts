import { SupabaseClient } from '@supabase/supabase-js';

/**
 * Mark a code purchase as paid and hand the code to the buyer. Idempotent:
 * safe to call from both the platform "complete" action and the PayFast ITN.
 */
export async function completeCodePurchase(
  sb: SupabaseClient,
  id: string,
  paymentRef?: string | null
): Promise<boolean> {
  const { data: p } = await sb.from('code_purchases').select('*').eq('id', id).maybeSingle();
  if (!p) return false;
  if (p.status === 'completed') return true;
  await sb
    .from('distributor_codes')
    .update({
      purchased: true,
      purchased_by: p.purchaser_id,
      purchased_at: new Date().toISOString(),
      is_for_sale: false
    })
    .eq('id', p.code_id);
  await sb
    .from('code_purchases')
    .update({ status: 'completed', payment_status: 'paid', payment_ref: paymentRef || null })
    .eq('id', id);
  return true;
}

/** Mark a store purchase as paid and transfer store ownership to the buyer. */
export async function completeStorePurchase(
  sb: SupabaseClient,
  id: string,
  paymentRef?: string | null
): Promise<boolean> {
  const { data: p } = await sb.from('store_purchases').select('*').eq('id', id).maybeSingle();
  if (!p) return false;
  if (p.status === 'completed') return true;
  await sb
    .from('stores')
    .update({
      purchased: true,
      purchased_by: p.purchaser_id,
      purchased_at: new Date().toISOString(),
      is_for_sale: false,
      owned_by_company: p.company_id,
      store_owner_id: p.purchaser_id
    })
    .eq('id', p.store_id);
  await sb
    .from('store_purchases')
    .update({ status: 'completed', payment_status: 'paid', payment_ref: paymentRef || null })
    .eq('id', id);
  return true;
}
