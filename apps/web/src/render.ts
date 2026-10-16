type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

export function esc(value: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function badge(text: string, tone: Tone = 'neutral'): string {
  const cls = tone === 'neutral' ? 'badge' : `badge badge-${tone}`;
  return `<span class="${cls}">${esc(text)}</span>`;
}

const STATUS_TONES: Record<string, Tone> = {
  active: 'success',
  approved: 'success',
  verified: 'success',
  completed: 'success',
  complete: 'success',
  paid: 'success',
  confirmed: 'success',
  delivered: 'success',
  ready: 'success',
  online: 'success',
  available: 'success',
  granted: 'success',
  enabled: 'success',
  pending: 'warning',
  unverified: 'warning',
  unpaid: 'warning',
  processing: 'warning',
  preparing: 'warning',
  busy: 'warning',
  shipped: 'info',
  out_for_delivery: 'info',
  refunded: 'info',
  new: 'info',
  suspended: 'danger',
  rejected: 'danger',
  cancelled: 'danger',
  canceled: 'danger',
  failed: 'danger',
  expired: 'danger',
  past_due: 'danger',
  revoked: 'danger',
  inactive: 'neutral',
  offline: 'neutral',
  draft: 'neutral',
  archived: 'neutral'
};

export function statusBadge(value: string): string {
  if (!value) return esc(value);
  return badge(value, STATUS_TONES[value.toLowerCase()] || 'info');
}

export interface Column {
  key: string;
  label: string;
  render?: (row: any) => string;
}

export function table(columns: Column[], rows: any[]): string {
  if (!rows || !rows.length) {
    return '<p class="empty">No records found.</p>';
  }
  const head = columns.map((c) => `<th>${esc(c.label)}</th>`).join('');
  const body = rows
    .map((row) => {
      const cells = columns
        .map((c) => `<td>${c.render ? c.render(row) : esc(row[c.key])}</td>`)
        .join('');
      return `<tr>${cells}</tr>`;
    })
    .join('');
  return `<div class="table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

export function formatDate(value: unknown): string {
  if (!value) return '';
  const d = new Date(String(value));
  if (isNaN(d.getTime())) return esc(value);
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

export function setHTML(id: string, html: string) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = html;
}
