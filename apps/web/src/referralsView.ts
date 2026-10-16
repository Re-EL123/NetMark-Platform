import { apiRequest } from './api';
import { esc, formatDate } from './render';
import { statCards, dataTable, emptyState, money, toast } from './ui';
import { icon, iconify } from './icons';
import { shareUrl, shareLink } from './referral';

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
      <p class="empty" style="margin:10px 0">Your code: <strong>${esc(code || '—')}</strong></p>
      <div class="row-actions">
        <button class="btn btn-sm" id="shareSignup">${icon('share-2')}<span>Share invite</span></button>
        <button class="btn btn-sm" id="copySignup">${icon('link-2')}<span>Copy invite link</span></button>
        <button class="btn btn-sm" id="shareShop">${icon('shopping-bag')}<span>Share shop</span></button>
        <button class="btn btn-sm" id="copyShop">${icon('link-2')}<span>Copy shop link</span></button>
      </div>
    </div>

    ${statCards([
      { label: 'People referred', value: referred, icon: 'users', tone: 'info' },
      { label: 'Total earned (ZAR)', value: earned, format: 'money', icon: 'banknote', tone: 'success' },
      { label: 'On hold (ZAR)', value: pending, format: 'money', icon: 'clock', tone: 'warning' },
      { label: 'Available (ZAR)', value: Number(w?.balanceZar || 0), format: 'money', icon: 'wallet', tone: 'brand', accent: true }
    ])}

    <div class="card">
      <h3>${icon('banknote')} Referral earnings</h3>
      ${
        rows.length
          ? dataTable(
              [
                { key: 'createdAt', label: 'When', render: (r) => formatDate(r.createdAt) },
                { key: 'description', label: 'Detail', render: (r) => esc(r.description || r.bonusType || r.source || '—') },
                { key: 'level', label: 'Level', render: (r) => (r.level ? esc(String(r.level)) : '—') },
                { key: 'amountZar', label: 'Amount', render: (r) => money(r.amountZar || 0) },
                { key: 'status', label: 'Status', render: (r) => esc(r.status || '') }
              ],
              rows
            )
          : emptyState('No referral earnings yet. Share your link to get started.', 'share-2')
      }
    </div>`;

  iconify(c);

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
  (c.querySelector('#shareShop') as HTMLElement | null)?.addEventListener('click', () =>
    shareLink(shopUrl, 'Shop on NetMark', 'Browse the NetMark marketplace')
  );
  (c.querySelector('#copyShop') as HTMLElement | null)?.addEventListener('click', () => copy(shopUrl));
}
