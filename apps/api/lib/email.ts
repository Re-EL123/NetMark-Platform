const RESEND_URL = 'https://api.resend.com/emails';

const EMAIL_TYPES = new Set(['order', 'payment', 'payout', 'security']);

export async function sendEmail(opts: { to: string | null | undefined; subject: string; html: string }): Promise<boolean> {
  try {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.EMAIL_FROM || 'NetMark <no-reply@re-el.co.za>';
    if (!apiKey || !opts.to) return false;
    const r = await fetch(RESEND_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [opts.to], subject: opts.subject, html: opts.html })
    });
    if (!r.ok) {
      console.error('sendEmail failed', r.status, await r.text().catch(() => ''));
      return false;
    }
    return true;
  } catch (err) {
    console.error('sendEmail error', err);
    return false;
  }
}

function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

/** Best-effort transactional email. Resolves false when Resend is unconfigured. */
export async function notifyEmail(to: string | null | undefined, title: string, body?: string): Promise<boolean> {
  const appUrl = process.env.APP_URL || 'https://netmark.re-el.co.za';
  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111">
    <div style="font-size:20px;font-weight:700;margin-bottom:4px">NetMark</div>
    <h1 style="font-size:17px;margin:16px 0 8px">${escapeHtml(title)}</h1>
    <p style="font-size:14px;line-height:1.6;color:#333;white-space:pre-line">${escapeHtml(body || '')}</p>
    <p style="font-size:12px;color:#777;margin-top:24px">You received this because you have an account on
      <a href="${appUrl}">${appUrl}</a>. Manage notifications in your account settings.</p>
  </div>`;
  return sendEmail({ to, subject: title, html });
}

/** Fire-and-forget email for allow-listed notification types. */
export async function maybeEmail(userId: string | undefined, type: string | undefined, title: string, body?: string): Promise<void> {
  try {
    if (!userId || !type || !EMAIL_TYPES.has(type)) return;
    const { getSupabase } = await import('./db');
    const sb = getSupabase();
    const { data } = await sb.from('users').select('email').eq('id', userId).maybeSingle();
    await notifyEmail(data?.email, title, body);
  } catch {
    /* never block notifications on email */
  }
}
