import { randomBytes, createHmac } from 'crypto';
import { getSupabase } from './db';

/** Fire-and-forget webhook delivery for events like 'order.completed'. */
export async function dispatchWebhook(event: string, payload: Record<string, any>, tenantId?: string | null, companyId?: string | null): Promise<void> {
  try {
    const sb = getSupabase();
    let q = sb.from('webhooks').select('*').eq('active', true);
    if (tenantId) {
      q = q.or(`tenant_id.eq.${tenantId},tenant_id.is.null`);
    } else {
      q = q.is('tenant_id', null);
    }
    const { data } = await q;
    for (const hook of data || []) {
      if (hook.company_id && companyId && hook.company_id !== companyId) continue;
      const events: string[] = hook.events || ['*'];
      if (!events.includes('*') && !events.includes(event)) continue;
      deliver(hook, event, payload);
    }
  } catch (err) {
    console.error('dispatchWebhook failed', err);
  }
}

function deliver(hook: any, event: string, payload: Record<string, any>) {
  const body = JSON.stringify({ event, data: payload, sentAt: new Date().toISOString() });
  const headers: Record<string, string> = { 'Content-Type': 'application/json', 'X-NetMark-Event': event };
  if (hook.secret) headers['X-NetMark-Signature'] = 'sha256=' + createHmac('sha256', hook.secret).update(body).digest('hex');

  fetch(hook.url, { method: 'POST', headers, body, signal: AbortSignal.timeout(10000) })
    .then(async (r) => {
      await getSupabase().from('webhook_deliveries').insert({
        webhook_id: hook.id,
        event,
        status_code: r.status,
        success: r.ok,
        error: r.ok ? null : await r.text().catch(() => 'HTTP ' + r.status)
      });
    })
    .catch(async (err) => {
      try {
        await getSupabase().from('webhook_deliveries').insert({
          webhook_id: hook.id,
          event,
          success: false,
          error: String(err?.message || err)
        });
      } catch {
        /* ignore */
      }
    });
}

export function newWebhookSecret(): string {
  return randomBytes(24).toString('hex');
}
