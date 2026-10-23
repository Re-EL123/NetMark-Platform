import type { SupabaseClient } from '@supabase/supabase-js';
import { payOrderCommissions, payStoreMargins } from './commissionEngine';
import { applyVolume } from './ranks';
import { dispatchWebhook } from './webhooks';
import { notify } from './notify';

/**
 * Run every payout that becomes due when an order is delivered/completed.
 *
 * Deliberately best-effort: a commission failure must never stop the delivery
 * from being recorded. The underlying payout helpers are idempotent, so this
 * can be called again without double-paying.
 */
export async function settleOrder(sb: SupabaseClient, order: any): Promise<void> {
  try {
    await payOrderCommissions(sb, order);
  } catch (err: any) {
    console.error('commission payout failed', order?.id, err?.message || err);
  }
  try {
    await payStoreMargins(sb, order);
  } catch (err: any) {
    console.error('store margin payout failed', order?.id, err?.message || err);
  }
  try {
    await applyVolume(sb, {
      companyId: order?.company_id || null,
      userId: order?.customer_id || order?.user_id,
      bv: Number(order?.subtotal_excl_vat ?? order?.subtotal ?? 0),
      tenantId: order?.tenant_id || null
    });
  } catch (err: any) {
    console.error('volume accrual failed', order?.id, err?.message || err);
  }
  void dispatchWebhook(
    'order.completed',
    {
      orderId: order?.id,
      orderNumber: order?.order_number,
      total: order?.total,
      status: 'completed'
    },
    order?.tenant_id || null,
    order?.company_id || null
  );
}

/** Put an order's quantities back on the shelf. Used when an order is cancelled. */
export async function restoreOrderStock(sb: SupabaseClient, order: any): Promise<void> {
  const items = Array.isArray(order?.items) ? order.items : [];
  for (const line of items) {
    const productId = line?.productId || line?.product_id || line?.id;
    const qty = Number(line?.quantity || 0);
    if (!productId || qty <= 0) continue;
    const { data: product } = await sb.from('products').select('stock').eq('id', productId).maybeSingle();
    if (!product) continue;
    await sb
      .from('products')
      .update({ stock: Number(product.stock || 0) + qty })
      .eq('id', productId);
  }
}

async function releaseDriver(sb: SupabaseClient, order: any, reason: string): Promise<void> {
  if (!order?.assigned_driver_id) return;
  const { data: driver } = await sb
    .from('drivers')
    .select('user_id')
    .eq('id', order.assigned_driver_id)
    .maybeSingle();
  await sb
    .from('orders')
    .update({ assigned_driver_id: null, delivery_status: 'unassigned' })
    .eq('id', order.id);
  if (driver?.user_id) {
    await notify({
      userId: driver.user_id,
      type: 'delivery',
      title: 'Delivery cancelled',
      body: `Order ${order.order_number || order.id} was cancelled — ${reason}.`,
      data: { orderId: order.id }
    });
  }
  // A pending earning was never really earned.
  await sb.from('driver_earnings').delete().eq('order_id', order.id).eq('status', 'pending');
}

/**
 * Undo the side effects of an order: restock, release the driver, claw back
 * commissions and drop any pending driver earning. Call only when the order is
 * transitioning *into* cancelled/refunded so it never runs twice.
 */
export async function cancelOrderSideEffects(sb: SupabaseClient, order: any): Promise<void> {
  try {
    await restoreOrderStock(sb, order);
  } catch (err: any) {
    console.error('stock restore failed', order?.id, err?.message || err);
  }
  try {
    await releaseDriver(sb, order, 'the customer or store cancelled it');
  } catch (err: any) {
    console.error('driver release failed', order?.id, err?.message || err);
  }
}

/** Remove the delivery proof code from anything sent to a driver. */
export function stripDeliveryOtp<T = any>(row: T): T {
  if (row && typeof row === 'object') {
    delete (row as any).deliveryOtp;
    delete (row as any).delivery_otp;
  }
  return row;
}
