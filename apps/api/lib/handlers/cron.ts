import { VercelRequest, VercelResponse } from '@vercel/node';
import { slugOf, getSupabase } from '../http';
import { notify } from '../notify';
import { recordAudit } from '../audit';
import { releaseDueCommissions } from '../commissionEngine';

function orderNumber() {
  return 'NM-' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 5).toUpperCase();
}

/** Vercel Cron calls this endpoint. Guarded by CRON_SECRET when configured. */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const secret = process.env.CRON_SECRET;
  const auth = String(req.headers['authorization'] || '');
  const provided = auth.replace(/^Bearer\s+/i, '');
  const isVercelCron = String(req.headers['x-vercel-cron'] || '') === '1';
  if (secret ? provided !== secret : !isVercelCron) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  const slug = slugOf(req);
  if (slug[0] === 'autoship' && (req.method === 'GET' || req.method === 'POST')) {
    return runAutoship(req, res);
  }
  if (slug[0] === 'commissions' && (req.method === 'GET' || req.method === 'POST')) {
    return runCommissionRelease(res);
  }
  if (slug[0] === 'plans' && (req.method === 'GET' || req.method === 'POST')) {
    return runPlanBilling(res);
  }
  return res.status(404).json({ success: false, message: 'Unknown cron job' });
}

/** Move commission credits whose hold window has elapsed into available balance. */
async function runCommissionRelease(res: VercelResponse) {
  const sb = getSupabase();
  const released = await releaseDueCommissions(sb, 200);
  return res.status(200).json({ success: true, data: { released } });
}

/** Expire paid plan terms and prompt company owners to renew. */
async function runPlanBilling(res: VercelResponse) {
  const sb = getSupabase();
  const today = new Date().toISOString().slice(0, 10);
  const { data: due } = await sb
    .from('companies_plans')
    .select('id, company_id, next_billing_at, plans(name)')
    .eq('billing_status', 'active')
    .not('next_billing_at', 'is', null)
    .lte('next_billing_at', today)
    .limit(200);

  let expired = 0;
  for (const cp of due || []) {
    const { error } = await sb
      .from('companies_plans')
      .update({ billing_status: 'past_due' })
      .eq('id', cp.id)
      .eq('billing_status', 'active');
    if (error) {
      console.error('plan billing expire failed', cp.id, error.message);
      continue;
    }
    expired += 1;
    const { data: owners } = await sb.from('users').select('id').eq('company_id', cp.company_id).eq('role', 'owner');
    for (const o of owners || []) {
      await notify({
        userId: o.id,
        type: 'payment',
        title: 'Plan renewal due',
        body: `Your ${(cp as any).plans?.name || 'subscription'} plan has lapsed. Renew to restore your full features.`,
        data: { companyId: cp.company_id }
      });
    }
  }

  return res.status(200).json({ success: true, data: { expired } });
}

async function runAutoship(req: VercelRequest, res: VercelResponse) {
  const sb = getSupabase();
  const now = new Date().toISOString();
  const { data: subs } = await sb
    .from('autoship_subscriptions')
    .select('*')
    .eq('status', 'active')
    .lte('next_run_at', now)
    .limit(50);

  let created = 0;
  const errors: string[] = [];

  for (const s of subs || []) {
    try {
      const { data: orig } = await sb.from('orders').select('*').eq('id', s.order_id).maybeSingle();
      const items: any[] = (Array.isArray(s.items) && s.items.length ? s.items : orig?.items) || [];
      if (!items.length) {
        await advance(sb, s, 'no items on subscription or source order');
        continue;
      }

      // Re-price lines against the current product price so autoship stays correct.
      const lines = [] as any[];
      let subtotal = 0;
      for (const l of items) {
        let price = Number(l.price || 0);
        const { data: p } = await sb.from('products').select('price, name, company_id, stock').eq('id', l.productId).maybeSingle();
        if (p) price = Number(p.price ?? price);
        const qty = Number(l.quantity || 1);
        lines.push({ productId: l.productId, name: p?.name || l.name, companyId: p?.company_id || l.companyId || null, price, quantity: qty, lineTotal: price * qty });
        subtotal += price * qty;
      }

      const vatRate = 0.15;
      const vat = Math.round(subtotal * vatRate * 100) / 100;
      const fee = Number(orig?.delivery_fee || 0);
      const total = subtotal + fee + vat;

      const { data: order, error } = await sb
        .from('orders')
        .insert({
          order_number: orderNumber(),
          company_id: orig?.company_id || null,
          customer_id: s.user_id,
          user_id: s.user_id,
          store_id: orig?.store_id || null,
          distributor_id: orig?.distributor_id || null,
          order_status: 'pending',
          delivery_status: 'unassigned',
          subtotal,
          subtotal_excl_vat: subtotal,
          vat_rate: vatRate,
          vat_amount: vat,
          delivery_fee: fee,
          total,
          payment_status: 'unpaid',
          items: lines,
          address: orig?.address || null,
          notes: `Autoship of ${orig?.order_number || s.order_id}`,
          order_type: orig?.order_type || 'delivery'
        })
        .select('*')
        .single();

      if (error || !order) {
        errors.push(`${s.id}: ${error?.message || 'insert failed'}`);
        await advance(sb, s, 'order insert failed');
        continue;
      }

      for (const line of lines) {
        const { data: p } = await sb.from('products').select('stock').eq('id', line.productId).maybeSingle();
        if (p) await sb.from('products').update({ stock: Math.max(0, Number(p.stock || 0) - line.quantity) }).eq('id', line.productId);
      }

      await advance(sb, s, null);
      created += 1;
      await notify({
        userId: s.user_id,
        type: 'order',
        title: 'Autoship order created',
        body: `Order ${order.order_number} was placed automatically.`,
        data: { orderId: order.id }
      });
      await recordAudit(req, { action: 'autoship.run', entityType: 'order', entityId: order.id, metadata: { subscriptionId: s.id } });
    } catch (err: any) {
      errors.push(`${s.id}: ${String(err?.message || err)}`);
    }
  }

  return res.status(200).json({ success: true, data: { processed: (subs || []).length, created, errors } });
}

async function advance(sb: any, s: any, note: string | null) {
  const next = new Date(Date.now() + (Number(s.interval_days) || 30) * 86400000).toISOString();
  const base = { next_run_at: next, last_run_at: new Date().toISOString() };
  const patch: any = { ...base, last_error: note };
  if (note) patch.failed_count = Number(s.failed_count || 0) + 1;

  // `last_error` is added by migration 013, which may not be applied yet. Never
  // let that block advancing next_run_at — if the update fails, the subscription
  // stays "due" and the cron would create a duplicate order on every run.
  let { error } = await sb.from('autoship_subscriptions').update(patch).eq('id', s.id);
  if (error) {
    delete patch.last_error;
    ({ error } = await sb.from('autoship_subscriptions').update(patch).eq('id', s.id));
  }
  if (error) ({ error } = await sb.from('autoship_subscriptions').update(base).eq('id', s.id));
  if (error) console.error('autoship advance failed', s.id, error.message);
}
