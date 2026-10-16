import { SupabaseClient } from '@supabase/supabase-js';
import { notify } from './notify';
import { payPurchaseReferral } from './commissionEngine';

/**
 * Mark a code purchase as paid and hand the code to the buyer. Idempotent:
 * safe to call from both the platform "complete" action and the PayFast ITN.
 *
 * Buying a code also links the buyer (a store owner) to the code's company so
 * the company catalog and wholesale pricing unlock — the same effect as
 * entering the code at signup.
 */
export async function completeCodePurchase(
  sb: SupabaseClient,
  id: string,
  paymentRef?: string | null
): Promise<boolean> {
  const { data: p } = await sb.from('code_purchases').select('*').eq('id', id).maybeSingle();
  if (!p) return false;
  if (p.status === 'completed') return true;

  const { data: code } = await sb.from('distributor_codes').select('*').eq('id', p.code_id).maybeSingle();

  await sb
    .from('distributor_codes')
    .update({
      purchased: true,
      purchased_by: p.purchaser_id,
      purchased_at: new Date().toISOString(),
      is_for_sale: false
    })
    .eq('id', p.code_id);

  if (code?.company_id && p.purchaser_id) {
    await sb.from('company_links').upsert(
      {
        store_owner_id: p.purchaser_id,
        company_id: code.company_id,
        code_id: code.id,
        code: code.code,
        is_active: true,
        expires_at: code.expires_at || null,
        last_renewed_at: new Date().toISOString()
      },
      { onConflict: 'store_owner_id,company_id' }
    );
  }

  await sb
    .from('code_purchases')
    .update({ status: 'completed', payment_status: 'paid', payment_ref: paymentRef || null })
    .eq('id', id);

  if (p.purchaser_id) {
    await notify({
      userId: p.purchaser_id,
      type: 'payment',
      title: 'Code purchased',
      body: `Your code ${p.code} is active — the company catalog is now unlocked.`,
      data: { code: p.code, companyId: code?.company_id || null }
    });
  }

  // The buyer's referrer (often a store owner) earns on the sale.
  await payPurchaseReferral(sb, {
    purchaserId: p.purchaser_id,
    priceZar: Number(p.price_zar || 0),
    refType: 'code_purchase',
    refId: p.id,
    companyId: code?.company_id || null,
    label: `code ${p.code}`
  }).catch((err) => console.error('code purchase referral failed', err?.message || err));

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
  const { data: store } = await sb.from('stores').select('id, name, company_id').eq('id', p.store_id).maybeSingle();
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

  if (p.purchaser_id) {
    await notify({
      userId: p.purchaser_id,
      type: 'payment',
      title: 'Store purchased',
      body: `You now own ${store?.name || p.store_name || 'the store'}.`,
      data: { storeId: p.store_id }
    });
  }

  // The buyer's referrer (often a store owner) earns on the sale.
  await payPurchaseReferral(sb, {
    purchaserId: p.purchaser_id,
    priceZar: Number(p.price_zar || 0),
    refType: 'store_purchase',
    refId: p.id,
    companyId: store?.company_id || null,
    label: `store ${store?.name || p.store_name || ''}`.trim()
  }).catch((err) => console.error('store purchase referral failed', err?.message || err));

  return true;
}
