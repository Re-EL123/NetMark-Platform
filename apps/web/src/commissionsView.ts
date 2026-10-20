import { esc, formatDate, badge } from './render';
import { money } from './ui';
import { icon, iconify } from './icons';

export function commissionStatusTone(status: string): 'success' | 'warning' | 'danger' | 'info' | 'neutral' {
  const s = String(status || '').toLowerCase();
  if (s === 'approved' || s === 'paid' || s === 'released') return 'success';
  if (s === 'pending' || s === 'on_hold' || s === 'held') return 'warning';
  if (s === 'reversed' || s === 'cancelled' || s === 'rejected') return 'danger';
  return 'neutral';
}

/** Plain-language explanation of how a commission row was earned. */
function explain(row: any): string {
  const bonus = String(row.bonusType || '').toLowerCase();
  const level = row.level ? `level ${row.level}` : '';
  if (bonus === 'retail') return `Retail override on the product revenue of this order${level ? ` (${level}).` : '.'}`;
  if (bonus === 'referral') return 'One-time referral commission from a purchase made by someone you referred.';
  if (bonus === 'margin') return 'Your store margin on a sale — the difference between your retail price and the company price.';
  if (bonus === 'rank_bonus') return 'Your monthly rank bonus for meeting the rank activity requirement.';
  return `Commission earned from ${row.source || 'a sale'}.`;
}

const LEVEL_LABEL: Record<string, string> = {
  '1': 'Direct referrer',
  '2': 'Sponsor',
  '3': 'Senior sponsor'
};

export interface CommissionTableOptions {
  /** Show the user/sponsor column (platform + downline views). */
  showUser?: boolean;
  /** Show the order reference column. */
  showOrder?: boolean;
  emptyMessage?: string;
}

/**
 * Expandable commission table shared by the owner, store-owner and platform
 * panels. Each row expands to a detail grid explaining how the amount was
 * calculated, the hold window and the status.
 */
export function commissionTable(rows: any[], opts: CommissionTableOptions = {}): string {
  const showUser = opts.showUser ?? true;
  const showOrder = opts.showOrder ?? false;
  const head = [
    '',
    ...(showUser ? ['User'] : []),
    ...(showOrder ? ['Order'] : []),
    'When',
    'Detail',
    ...(showUser ? ['Level'] : []),
    'Amount',
    'Status'
  ];
  const span = head.length - 1;

  return `<div class="table-wrap"><table class="ref-table">
    <thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead>
    <tbody>${rows
      .map((r, i) => {
        const levelKey = r.level != null ? String(r.level) : '';
        const detail: [string, string][] = [
          ['How it was earned', esc(explain(r))],
          ['Source', esc(r.source || '—')],
          ['Bonus type', esc(r.bonusType ? String(r.bonusType) : '—')],
          ['Reference', esc(r.refType ? `${r.refType}${r.refId ? ' · ' + String(r.refId).slice(0, 8) : ''}` : '—')],
          ...(levelKey ? ([['Level', esc(LEVEL_LABEL[levelKey] || `Level ${levelKey}`)]] as [string, string][]) : []),
          ['Releases', r.releaseAt ? esc(formatDate(r.releaseAt)) : r.releasedAt ? 'Released' : '—'],
          ['Released', r.releasedAt ? esc(formatDate(r.releasedAt)) : '—'],
          ['Description', esc(r.description || '—')]
        ];
        return `<tr class="ref-row" data-ref-toggle="${i}">
            <td class="ref-caret">${icon('chevron-right')}</td>
            ${showUser ? `<td>${esc((r.userId || '').slice(0, 8) || '—')}</td>` : ''}
            ${showOrder ? `<td>${r.orderId ? esc(String(r.orderId).slice(0, 8)) : '—'}</td>` : ''}
            <td>${esc(formatDate(r.createdAt))}</td>
            <td>${esc(r.description || r.bonusType || r.source || '—')}</td>
            ${showUser ? `<td>${levelKey ? esc(LEVEL_LABEL[levelKey] || levelKey) : '—'}</td>` : ''}
            <td>${money(r.amountZar || 0)}</td>
            <td>${badge(r.status || '—', commissionStatusTone(r.status))}</td>
          </tr>
          <tr class="ref-detail" data-ref-detail="${i}" hidden>
            <td></td>
            <td colspan="${span}"><dl class="ref-detail-grid">${detail
              .map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${v}</dd></div>`)
              .join('')}</dl></td>
          </tr>`;
      })
      .join('')}</tbody></table></div>`;
}

/** Wire click-to-expand behaviour for a rendered commission table. */
export function wireCommissionTable(scope: HTMLElement) {
  scope.querySelectorAll('[data-ref-toggle]').forEach((row) => {
    row.addEventListener('click', () => {
      const detail = scope.querySelector(
        `[data-ref-detail="${(row as HTMLElement).dataset.refToggle}"]`
      ) as HTMLElement | null;
      if (!detail) return;
      detail.hidden = !detail.hidden;
      row.classList.toggle('open', !detail.hidden);
    });
  });
  iconify(scope);
}
