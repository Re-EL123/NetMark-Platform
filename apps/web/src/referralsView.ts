import { apiRequest } from './api';
import { esc } from './render';
import { statCards, emptyState, toast, openModal } from './ui';
import { icon, iconify } from './icons';
import { shareUrl, shareLink } from './referral';
import { qrSvg } from './qr';
import { commissionTable, wireCommissionTable } from './commissionsView';

function shareSheet(url: string, text: string) {
  const enc = encodeURIComponent;
  const opts: [string, string, string][] = [
    ['WhatsApp', `https://wa.me/?text=${enc(`${text} ${url}`)}`, 'message-circle'],
    ['Facebook', `https://www.facebook.com/sharer/sharer.php?u=${enc(url)}`, 'share-2'],
    ['X', `https://twitter.com/intent/tweet?text=${enc(text)}&url=${enc(url)}`, 'share-2'],
    ['Telegram', `https://t.me/share/url?url=${enc(url)}&text=${enc(text)}`, 'send'],
    ['Email', `mailto:?subject=${enc(text)}&body=${enc(`${text}\n\n${url}`)}`, 'mail'],
    ['SMS', `sms:?&body=${enc(`${text} ${url}`)}`, 'phone']
  ];
  void openModal({
    title: 'Share your link',
    submitLabel: 'Done',
    html: `<p class="empty" style="font-size:12px;margin-bottom:12px">Pick where to share — the message and your code are pre-filled.</p>
      <div class="share-grid">
        ${opts
          .map(
            ([label, href, ic]) =>
              `<a class="share-opt" href="${esc(href)}" target="_blank" rel="noopener">${icon(ic)}<span>${esc(label)}</span></a>`
          )
          .join('')}
        <button type="button" class="share-opt" id="shareCopy">${icon('copy')}<span>Copy link</span></button>
      </div>`,
    onMount: (body) => {
      (body.querySelector('#shareCopy') as HTMLElement | null)?.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(url);
          toast('Link copied to clipboard', 'success');
        } catch {
          toast(url, 'info');
        }
      });
    },
    onSubmit: () => undefined
  });
}

function sum(rows: any[], status?: string) {
  return rows
    .filter((r) => (status ? r.status === status : r.status !== 'reversed'))
    .reduce((total, r) => total + Number(r.amountZar || 0), 0);
}

/**
 * Referral dashboard shared by the company-owner and store-owner panels. Shows
 * the caller's personal link, how many people they've referred, and every
 * commission those people have generated.
 */
export async function renderReferrals(c: HTMLElement) {
  c.innerHTML = '<p class="empty">Loading referrals…</p>';

  const [mine, comms, wallet] = await Promise.all([
    apiRequest('/codes/mine').catch(() => null),
    apiRequest('/commissions').catch(() => null),
    apiRequest('/wallets/me').catch(() => null)
  ]);

  const code: string | null = mine?.success ? mine.data?.code || null : null;
  const referred = mine?.success ? Number(mine.data?.referred || 0) : 0;
  const rows: any[] = comms?.success ? comms.data || [] : [];
  const w: any = wallet?.success ? wallet.data : null;

  const earned = sum(rows);
  const pending = sum(rows, 'pending');

  const signupUrl = shareUrl('register.html', code);
  const shopUrl = shareUrl('shop/', code);

  c.innerHTML = `
    <div class="card">
      <h3>${icon('share-2')} Your referral link</h3>
      <p class="muted">
        Share your link — whoever signs up becomes your referral, and you earn on their orders
        and on any code or store they buy.
      </p>
      <div class="sf-store-meta" style="margin:12px 0 4px">
        <span>${icon('ticket-percent')} Your code: <strong>${esc(code || '—')}</strong></span>
      </div>
      <div class="row-actions">
        <button class="btn btn-sm" id="shareSignup">${icon('share-2')}<span>Share invite</span></button>
        <button class="btn btn-sm btn-ghost" id="copySignup">${icon('link-2')}<span>Copy invite link</span></button>
        <button class="btn btn-sm btn-ghost" id="qrSignup">${icon('qr-code')}<span>QR code</span></button>
        <button class="btn btn-sm btn-ghost" id="shareShop">${icon('shopping-bag')}<span>Share shop</span></button>
        <button class="btn btn-sm btn-ghost" id="copyShop">${icon('link-2')}<span>Copy shop link</span></button>
        <button class="btn btn-sm btn-ghost" id="shareMore">${icon('share-2')}<span>More ways…</span></button>
      </div>
      <ol class="how-steps">
        <li><span class="how-num">1</span><div><strong>Share your link</strong><p>Send it by WhatsApp, QR code or social media.</p></div></li>
        <li><span class="how-num">2</span><div><strong>They sign up</strong><p>Your code is attached automatically — they become your referral.</p></div></li>
        <li><span class="how-num">3</span><div><strong>You earn</strong><p>Commission lands in your wallet on their orders and purchases.</p></div></li>
      </ol>
    </div>

    ${statCards([
      { label: 'People referred', value: referred, icon: 'users', tone: 'info' },
      { label: 'Total earned (ZAR)', value: earned, format: 'money', icon: 'banknote', tone: 'success' },
      { label: 'On hold (ZAR)', value: pending, format: 'money', icon: 'clock', tone: 'warning' },
      { label: 'Available (ZAR)', value: Number(w?.balanceZar || 0), format: 'money', icon: 'wallet', tone: 'brand', accent: true }
    ])}

    <div class="card">
      <h3>${icon('file-text')} Income disclosure</h3>
      <p class="muted">
        Commissions are paid from product revenue only — never for recruiting. Retail overrides, margins and
        bonuses follow the published commission plan. Amounts shown are before any applicable adjustments and
        may be held for a review window before becoming available.
      </p>
    </div>

    <div class="card">
      <h3>${icon('banknote')} Referral earnings</h3>
      ${
        rows.length
          ? `<p class="empty" style="font-size:12px;margin-bottom:8px">Tap a row for full detail.</p>${commissionTable(rows, { showUser: false })}`
          : emptyState('No referral earnings yet. Share your link to get started.', 'share-2')
      }
    </div>`;

  iconify(c);
  wireCommissionTable(c);

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast('Link copied to clipboard', 'success');
    } catch {
      toast(text, 'info');
    }
  };

  (c.querySelector('#shareSignup') as HTMLElement | null)?.addEventListener('click', () =>
    shareLink(signupUrl, 'Join NetMark', `Use code ${code || ''} to join NetMark`)
  );
  (c.querySelector('#copySignup') as HTMLElement | null)?.addEventListener('click', () => copy(signupUrl));
  (c.querySelector('#qrSignup') as HTMLElement | null)?.addEventListener('click', () =>
    openModal({
      title: 'Referral QR code',
      submitLabel: 'Done',
      html: `<div style="text-align:center">
        <span class="ref-qr-wrap">${qrSvg(signupUrl, 5, 2)}</span>
        <p class="empty" style="word-break:break-all;font-size:12px;margin-top:14px">${esc(signupUrl)}</p>
        <p class="empty" style="font-size:12px;margin-top:6px">Anyone who scans this lands on the sign-up page with your code attached.</p>
      </div>`,
      onSubmit: () => undefined
    })
  );
  (c.querySelector('#shareShop') as HTMLElement | null)?.addEventListener('click', () =>
    shareLink(shopUrl, 'Shop on NetMark', 'Browse the NetMark marketplace')
  );
  (c.querySelector('#copyShop') as HTMLElement | null)?.addEventListener('click', () => copy(shopUrl));
  (c.querySelector('#shareMore') as HTMLElement | null)?.addEventListener('click', () =>
    shareSheet(signupUrl, `Join NetMark with my code${code ? ' ' + code : ''}`)
  );
}
