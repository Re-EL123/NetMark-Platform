import { VercelRequest, VercelResponse } from '@vercel/node';
import querystring from 'querystring';
import {
  authed,
  ok,
  fail,
  slugOf,
  applyCors,
  getSupabase,
  rowOut,
  rowsOut
} from '../http';
import { recordAudit } from '../audit';
import { notify } from '../notify';
import {
  payfastConfig,
  buildPaymentFields,
  verifyItnSignature,
  validateItnWithPayFast,
  encodeForm
} from '../payfast';

/** Parse a form-encoded or already-parsed body into a flat object of strings. */
function parseFormBody(req: VercelRequest): Record<string, string> {
  const raw = req.body;
  if (typeof raw === 'string') {
    const parsed = raw.includes('=') ? querystring.parse(raw) : {};
    return Object.fromEntries(Object.entries(parsed).map(([k, v]) => [k, String(v)]));
  }
  if (raw && typeof raw === 'object') {
    return Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, String(v)]));
  }
  return {};
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  applyCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const slug = slugOf(req);
  if (slug.join('/') === 'payfast/notify') {
    return handleItn(req, res);
  }
  return authedHandler(req, res);
}

/* ------------------------- authenticated endpoints ------------------------ */

const authedHandler = authed(async (req, res, ctx) => {
  const sb = getSupabase();
  const slug = slugOf(req);

  // GET /payments  |  GET /payments/mine
  if (slug.length === 0 && req.method === 'GET') {
    if (ctx.isPlatform) {
      const { data } = await sb.from('payments').select('*').order('created_at', { ascending: false }).limit(200);
      return ok(res, { data: rowsOut(data) });
    }
    if (ctx.role === 'owner' && ctx.companyId) {
      const { data } = await sb
        .from('payments')
        .select('*')
        .eq('company_id', ctx.companyId)
        .order('created_at', { ascending: false })
        .limit(200);
      return ok(res, { data: rowsOut(data) });
    }
    return fail(res, 'Forbidden', 403);
  }

  if (slug[0] === 'mine' && req.method === 'GET') {
    const { data } = await sb
      .from('payments')
      .select('*')
      .eq('user_id', ctx.userId)
      .order('created_at', { ascending: false });
    return ok(res, { data: rowsOut(data) });
  }

  // POST /payments/payfast/initiate
  if (slug.join('/') === 'payfast/initiate' && req.method === 'POST') {
    const cfg = payfastConfig();
    if (!cfg.configured) {
      return fail(res, 'PayFast is not configured on the server.', 503);
    }
    const { orderId, returnUrl, cancelUrl } = req.body || {};
    if (!orderId) return fail(res, 'orderId is required');

    const { data: order } = await sb.from('orders').select('*').eq('id', orderId).maybeSingle();
    if (!order) return fail(res, 'Order not found', 404);
    if (!ctx.isPlatform && order.customer_id && order.customer_id !== ctx.userId && !['owner', 'storeOwner'].includes(ctx.role)) {
      return fail(res, 'Forbidden', 403);
    }

    const amount = Number(order.total || 0);
    if (amount <= 0) return fail(res, 'Order total is invalid');

    const { data: payment, error } = await sb
      .from('payments')
      .insert({
        order_id: order.id,
        user_id: ctx.userId,
        company_id: order.company_id || null,
        amount,
        status: 'pending',
        provider: 'payfast'
      })
      .select('*')
      .single();
    if (error || !payment) return fail(res, 'Could not create payment');

    const [first, ...rest] = String(ctx.user.name || 'NetMark').split(' ');
    const fields = buildPaymentFields({
      amount,
      itemName: `NetMark order ${order.order_number || order.id}`,
      itemDescription: order.notes || 'NetMark order',
      paymentId: payment.id,
      orderId: order.id,
      nameFirst: first,
      nameLast: rest.join(' '),
      email: ctx.user.email,
      cellNumber: ctx.user.phone || undefined
    });
    if (returnUrl) fields.return_url = returnUrl;
    if (cancelUrl) fields.cancel_url = cancelUrl;

    await recordAudit(req, {
      action: 'payment.initiate',
      entityType: 'payment',
      entityId: payment.id,
      companyId: order.company_id || null,
      metadata: { orderId: order.id, amount }
    });

    return ok(res, {
      data: {
        paymentId: payment.id,
        sandbox: cfg.sandbox,
        processUrl: cfg.processUrl,
        fields
      }
    });
  }

  // GET /payments/:id
  if (slug.length === 1 && req.method === 'GET') {
    const { data } = await sb.from('payments').select('*').eq('id', slug[0]).maybeSingle();
    if (!data) return fail(res, 'Not found', 404);
    const allowed = ctx.isPlatform || data.user_id === ctx.userId || (ctx.role === 'owner' && data.company_id === ctx.companyId);
    if (!allowed) return fail(res, 'Forbidden', 403);
    return ok(res, { data: rowOut(data) });
  }

  return fail(res, 'Not found', 404);
});

/* --------------------------- ITN webhook (no auth) ------------------------ */

async function handleItn(req: VercelRequest, res: VercelResponse) {
  try {
    const cfg = payfastConfig();
    const body = parseFormBody(req);

    // 1. Signature check
    if (!verifyItnSignature(body, cfg.passphrase)) {
      console.warn('PayFast ITN: signature mismatch');
      return res.status(400).send('Invalid signature');
    }

    // 2. Merchant check (defence in depth)
    if (cfg.merchantId && body.merchant_id && body.merchant_id !== cfg.merchantId) {
      console.warn('PayFast ITN: merchant mismatch');
      return res.status(400).send('Invalid merchant');
    }

    // 3. Server-to-server validation
    const rawBody = encodeForm(body);
    const valid = await validateItnWithPayFast(rawBody, cfg.validateUrl);
    if (!valid) {
      console.warn('PayFast ITN: postback validation failed');
      return res.status(400).send('Invalid ITN');
    }

    const sb = getSupabase();
    const paymentId = body.m_payment_id;
    const status = String(body.payment_status || '').toUpperCase();

    const { data: payment } = await sb.from('payments').select('*').eq('id', paymentId).maybeSingle();

    if (payment) {
      await sb
        .from('payments')
        .update({
          status: payment.status === 'paid' ? 'paid' : payment.status,
          provider_ref: body.pf_payment_id || payment.provider_ref,
          raw: body
        })
        .eq('id', payment.id);
    }

    if (status === 'COMPLETE') {
      const orderIdToUse = body.custom_str1 || payment?.order_id;
      if (orderIdToUse) {
        const { data: order } = await sb.from('orders').select('*').eq('id', orderIdToUse).maybeSingle();
        if (order) {
          const amountGross = Number(body.amount_gross || payment?.amount || 0);
          const expected = Number(order.total || 0);
          const amountOk = !amountGross || Math.abs(amountGross - expected) < 0.01;
          if (amountOk) {
            await sb
              .from('orders')
              .update({
                payment_status: 'paid',
                payment_method: 'payfast',
                payment_ref: body.pf_payment_id || null,
                order_status: order.order_status === 'pending' ? 'confirmed' : order.order_status
              })
              .eq('id', order.id);
            if (order.customer_id) {
              await notify({
                userId: order.customer_id,
                type: 'payment',
                title: 'Payment received',
                body: `We received your payment for order ${order.order_number || order.id}.`,
                data: { orderId: order.id }
              });
            }
          } else {
            console.warn('PayFast ITN: amount mismatch', { amountGross, expected });
          }
        }
      }
    }

    // Wholesale purchases (store owner buying stock from their company) share
    // the same ITN channel — custom_str1 carries the purchase id for these.
    if (status === 'COMPLETE' && body.custom_str1) {
      const { data: purchase } = await sb.from('purchases').select('*').eq('id', body.custom_str1).maybeSingle();
      if (purchase && purchase.payment_status !== 'paid') {
        const amountGross = Number(body.amount_gross || 0);
        const expected = Number(purchase.total || 0);
        const amountOk = !amountGross || Math.abs(amountGross - expected) < 0.01;
        if (amountOk) {
          await sb
            .from('purchases')
            .update({
              payment_status: 'paid',
              payment_method: 'payfast',
              payment_ref: body.pf_payment_id || null,
              status: purchase.status === 'pending' ? 'confirmed' : purchase.status
            })
            .eq('id', purchase.id);
          if (purchase.store_owner_id) {
            await notify({
              userId: purchase.store_owner_id,
              type: 'payment',
              title: 'Payment received',
              body: `We received your payment for purchase ${purchase.reference || purchase.id}.`,
              data: { purchaseId: purchase.id }
            });
          }
        } else {
          console.warn('PayFast ITN: purchase amount mismatch', { amountGross, expected });
        }
      }
    }

    return res.status(200).send('OK');
  } catch (err) {
    console.error('PayFast ITN error', err);
    return res.status(500).send('Error');
  }
}
