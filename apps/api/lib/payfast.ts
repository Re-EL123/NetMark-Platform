import crypto from 'crypto';

/**
 * PayFast (South Africa) custom integration helpers.
 *
 * Docs: https://developers.payfast.co.za/docs
 *
 * Environment variables:
 *   PAYFAST_MERCHANT_ID
 *   PAYFAST_MERCHANT_KEY
 *   PAYFAST_PASSPHRASE        (optional but recommended)
 *   PAYFAST_SANDBOX           ("true" to use the sandbox, default true)
 *   PAYFAST_RETURN_URL        (browser return, success)
 *   PAYFAST_CANCEL_URL        (browser return, cancelled)
 *   PAYFAST_NOTIFY_URL        (server ITN webhook -> this API)
 *   API_PUBLIC_URL            (used to build the default notify URL)
 */

export interface PayFastConfig {
  merchantId: string;
  merchantKey: string;
  passphrase: string;
  sandbox: boolean;
  processUrl: string;
  validateUrl: string;
  returnUrl: string;
  cancelUrl: string;
  notifyUrl: string;
  configured: boolean;
}

export function payfastConfig(): PayFastConfig {
  const sandbox = String(process.env.PAYFAST_SANDBOX || 'true').toLowerCase() === 'true';
  const apiBase = process.env.API_PUBLIC_URL || 'https://netmark-api.vercel.app';
  const merchantId = process.env.PAYFAST_MERCHANT_ID || '';
  const merchantKey = process.env.PAYFAST_MERCHANT_KEY || '';
  return {
    merchantId,
    merchantKey,
    passphrase: process.env.PAYFAST_PASSPHRASE || '',
    sandbox,
    processUrl: sandbox
      ? 'https://sandbox.payfast.co.za/eng/process'
      : 'https://www.payfast.co.za/eng/process',
    validateUrl: sandbox
      ? 'https://sandbox.payfast.co.za/eng/query/validate'
      : 'https://www.payfast.co.za/eng/query/validate',
    returnUrl:
      process.env.PAYFAST_RETURN_URL || 'https://netmark.re-el.co.za/shop/?payment=success',
    cancelUrl:
      process.env.PAYFAST_CANCEL_URL || 'https://netmark.re-el.co.za/shop/?payment=cancelled',
    notifyUrl: process.env.PAYFAST_NOTIFY_URL || `${apiBase}/api/payments/payfast/notify`,
    configured: Boolean(merchantId && merchantKey)
  };
}

/** The canonical field order PayFast expects when building a signature. */
export const PAYFAST_FIELD_ORDER = [
  'merchant_id',
  'merchant_key',
  'return_url',
  'cancel_url',
  'notify_url',
  'name_first',
  'name_last',
  'email_address',
  'cell_number',
  'm_payment_id',
  'amount',
  'item_name',
  'item_description',
  'custom_int1',
  'custom_int2',
  'custom_int3',
  'custom_int4',
  'custom_int5',
  'custom_str1',
  'custom_str2',
  'custom_str3',
  'custom_str4',
  'custom_str5',
  'email_confirmation',
  'confirmation_address',
  'payment_method'
];

/** PHP-compatible urlencode used by PayFast signatures (spaces become '+'). */
export function pfEncode(value: unknown): string {
  return encodeURIComponent(String(value))
    .replace(/%20/g, '+')
    .replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}

/**
 * Build the md5 signature over the provided fields in the given order,
 * skipping empty values and appending the passphrase when configured.
 */
export function signFields(
  fields: Record<string, any>,
  passphrase: string,
  order: string[] = PAYFAST_FIELD_ORDER
): string {
  const keys = [
    ...order.filter((k) => k in fields),
    ...Object.keys(fields).filter((k) => !order.includes(k))
  ];
  const pieces: string[] = [];
  for (const key of keys) {
    const value = fields[key];
    if (value === undefined || value === null || value === '') continue;
    pieces.push(`${key}=${pfEncode(value)}`);
  }
  let str = pieces.join('&');
  if (passphrase) str += `&passphrase=${pfEncode(passphrase)}`;
  return crypto.createHash('md5').update(str).digest('hex');
}

export interface PaymentFieldInput {
  amount: number;
  itemName: string;
  itemDescription?: string;
  paymentId: string;
  nameFirst?: string;
  nameLast?: string;
  email?: string;
  cellNumber?: string;
  orderId?: string;
  /** Explicit id placed in custom_str1 (defaults to orderId). */
  relatedId?: string;
  /** Entity kind placed in custom_str2, e.g. 'order', 'purchase', 'code_purchase', 'store_purchase'. */
  kind?: string;
}

/**
 * Build the hidden form fields (including signature) for a PayFast payment.
 * The client POSTs these to `processUrl`.
 */
export function buildPaymentFields(input: PaymentFieldInput): Record<string, string> {
  const cfg = payfastConfig();
  const fields: Record<string, string> = {
    merchant_id: cfg.merchantId,
    merchant_key: cfg.merchantKey,
    return_url: cfg.returnUrl,
    cancel_url: cfg.cancelUrl,
    notify_url: cfg.notifyUrl,
    name_first: input.nameFirst || 'NetMark',
    name_last: input.nameLast || '',
    email_address: input.email || '',
    cell_number: input.cellNumber || '',
    m_payment_id: input.paymentId,
    amount: Number(input.amount || 0).toFixed(2),
    item_name: input.itemName,
    item_description: input.itemDescription || '',
    custom_str1: input.relatedId || input.orderId || '',
    custom_str2: input.kind || ''
  };
  const signature = signFields(fields, cfg.passphrase);
  return { ...fields, signature };
}

/** Recompute the signature from an ITN payload and compare it. */
export function verifyItnSignature(body: Record<string, any>, passphrase: string): boolean {
  const provided = String(body.signature || '');
  if (!provided) return false;
  const fields: Record<string, any> = { ...body };
  delete fields.signature;
  return signFields(fields, passphrase) === provided;
}

/** Server-to-server postback validation (PayFast expects the raw body back). */
export async function validateItnWithPayFast(
  rawBody: string,
  validateUrl: string
): Promise<boolean> {
  try {
    const res = await fetch(validateUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: rawBody
    });
    const text = (await res.text()).trim();
    return text.startsWith('VALID');
  } catch (err) {
    console.error('PayFast postback validation failed', err);
    return false;
  }
}

/** Encode a field map as an application/x-www-form-urlencoded body. */
export function encodeForm(fields: Record<string, any>): string {
  return Object.keys(fields)
    .filter((k) => fields[k] !== undefined && fields[k] !== null)
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(String(fields[k]))}`)
    .join('&');
}
