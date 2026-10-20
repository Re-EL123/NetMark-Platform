import { apiRequest } from './api';
import { esc, formatDate } from './render';
import { statCards, dataTable, openModal, toast, money, emptyState } from './ui';
import { icon, iconify } from './icons';

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

  c.innerHTML = `
    <div class="card">
      <h3>${icon('wallet')} Balance</h3>
      ${statCards([
        { label: 'Available (ZAR)', value: Number(wd?.balanceZar || 0), format: 'money', accent: true, tone: 'brand' },
        { label: 'On hold (releases soon)', value: Number(wd?.heldZar || 0), format: 'money', tone: 'warning' },
        { label: 'Pending withdrawal (ZAR)', value: Number(wd?.pendingZar || 0), format: 'money', tone: 'warning' }
      ])}
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
                { key: 'type', label: 'Type', render: (r) => esc(r.type || '—') },
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
        fields: [{ name: 'amountZar', label: 'Amount', type: 'number', step: '0.01', min: 0.01, suffix: 'ZAR', required: true }],
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
