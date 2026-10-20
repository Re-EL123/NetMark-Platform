import { apiRequest } from './api';
import { esc, formatDate, badge } from './render';
import { statCards, dataTable, openModal, toast, money, emptyState } from './ui';
import { icon, iconify } from './icons';

const LEDGER_TONES: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  credit: 'success',
  release: 'success',
  hold: 'warning',
  reversal: 'danger',
  debit: 'danger',
  withdraw: 'warning',
  payout: 'success'
};

function ledgerTone(type: string) {
  return LEDGER_TONES[String(type || '').toLowerCase()] || 'neutral';
}

/**
 * Wallet + withdrawal view shared by the company-owner and store-owner panels.
 * Shows available / on-hold / pending-withdrawal balances and ledger history.
 */
export async function renderWallet(c: HTMLElement) {
  c.innerHTML = '<p class="empty">Loading wallet…</p>';
  const [w, ledger, plan] = await Promise.all([
    apiRequest('/wallets/me').catch(() => null),
    apiRequest('/wallets/ledger').catch(() => null),
    apiRequest('/plans/my').catch(() => null)
  ]);
  const wd: any = w?.success ? w.data : null;
  const rows: any[] = ledger?.success ? ledger.data || [] : [];
  const planData: any = plan?.success ? plan.data : null;
  const payoutsAllowed = !planData || planData.entitlements?.payouts !== false;

  const available = Number(wd?.balanceZar || 0);
  const held = Number(wd?.heldZar || 0);
  const pending = Number(wd?.pendingZar || 0);
  const total = available + held + pending;

  const pendingWithdrawals = rows.filter((r) => String(r.type || '').toLowerCase() === 'withdraw');
  const latest = pendingWithdrawals[0];

  c.innerHTML = `
    <div class="card">
      <h3>${icon('wallet')} Balance</h3>
      ${statCards([
        { label: 'Available (ZAR)', value: available, format: 'money', accent: true, tone: 'brand', sub: 'Ready to withdraw' },
        { label: 'On hold (ZAR)', value: held, format: 'money', tone: 'warning', sub: 'Releases after the hold window' },
        { label: 'Pending withdrawal (ZAR)', value: pending, format: 'money', tone: 'warning', sub: 'Being processed' }
      ])}
      <div class="wallet-breakdown">
        <div class="wb-row"><span>Available</span><strong>${money(available)}</strong></div>
        <div class="wb-row"><span>On hold</span><strong>${money(held)}</strong></div>
        <div class="wb-row"><span>Pending withdrawal</span><strong>${money(pending)}</strong></div>
        <div class="wb-row wb-total"><span>Total earned</span><strong>${money(total)}</strong></div>
      </div>
      ${
        held > 0
          ? `<p class="muted wb-note">${icon('clock')} ${money(held)} is on hold and will become available after the commission hold window (typically 7 days). You can see the exact release date on each commission.</p>`
          : ''
      }
      ${
        pending > 0 || latest
          ? `<div class="payout-timeline"><h4>${icon('banknote')} Withdrawal status</h4><div class="pt-list">
              <div class="pt-item done"><span class="pt-dot"></span><div><strong>Requested</strong><p>${latest ? esc(formatDate(latest.createdAt)) : 'In progress'}</p></div></div>
              <div class="pt-item ${pending > 0 ? 'active' : 'done'}"><span class="pt-dot"></span><div><strong>Batched / Under review</strong><p>${pending > 0 ? 'Awaiting processing by admin' : 'Processed'}</p></div></div>
              <div class="pt-item ${pending > 0 ? '' : 'done'}"><span class="pt-dot"></span><div><strong>Paid</strong><p>${pending > 0 ? 'Pending' : 'Completed'}</p></div></div>
            </div></div>`
          : ''
      }
      <div class="toolbar" style="margin-top:12px">
        ${
          payoutsAllowed
            ? `<button class="btn btn-sm" id="withdraw">${icon('banknote')}<span>Withdraw</span></button>`
            : `<p class="empty">Withdrawals are not included in your current plan. Upgrade to enable payouts.</p>`
        }
      </div>
    </div>
    <div class="card">
      <h3>${icon('receipt')} Recent activity</h3>
      ${
        rows.length
          ? dataTable(
              [
                { key: 'description', label: 'Description', render: (r) => esc(r.description || '—') },
                { key: 'type', label: 'Type', render: (r) => badge(r.type || '—', ledgerTone(r.type)) },
                { key: 'amountZar', label: 'Amount', render: (r) => money(r.amountZar || 0) },
                { key: 'createdAt', label: 'Date', render: (r) => formatDate(r.createdAt) }
              ],
              rows
            )
          : emptyState('No wallet activity yet.', 'receipt')
      }
    </div>`;
  iconify(c);

  const btn = c.querySelector('#withdraw') as HTMLElement | null;
  if (btn) {
    btn.onclick = async () => {
      await openModal({
        title: 'Request withdrawal',
        fields: [
          {
            name: 'amountZar',
            label: 'Amount',
            type: 'number',
            step: '0.01',
            min: 0.01,
            max: available || undefined,
            suffix: 'ZAR',
            help: `You can withdraw up to ${money(available)}.`,
            required: true
          }
        ],
        onSubmit: async (v) => {
          const r = await apiRequest('/wallets/withdraw', { method: 'POST', body: JSON.stringify(v) });
          if (!r.success) throw new Error(r.message);
          toast('Withdrawal requested', 'success');
          renderWallet(c);
        }
      });
    };
  }
}
