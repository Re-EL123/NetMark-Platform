import { apiRequest } from './api';
import { esc } from './render';
import { icon, iconify } from './icons';

export interface ChecklistItem {
  id: string;
  label: string;
  hint?: string;
  /** Route id to navigate to when the step is clicked. */
  route?: string;
  /** Resolve to true when the step is satisfied. */
  done: () => Promise<boolean>;
}

interface ChecklistState {
  dismissed?: boolean;
  completed?: string[];
}

const KEY = (role: string) => `netmark_onboarding_${role}`;

function readState(role: string): ChecklistState {
  try {
    return JSON.parse(localStorage.getItem(KEY(role)) || '{}');
  } catch {
    return {};
  }
}

function writeState(role: string, state: ChecklistState) {
  try {
    localStorage.setItem(KEY(role), JSON.stringify(state));
  } catch {
    /* ignore quota / private mode */
  }
}

/** Wrap an API check so a failed request is treated as "not done" rather than throwing. */
async function hasData(
  endpoint: string,
  predicate: (data: any, res: any) => boolean
): Promise<boolean> {
  const res = await apiRequest(endpoint).catch(() => null);
  if (!res || !res.success) return false;
  try {
    return predicate(res.data, res);
  } catch {
    return false;
  }
}

export const STORE_OWNER_CHECKLIST: ChecklistItem[] = [
  {
    id: 'share',
    label: 'Copy your referral link',
    hint: 'Share it so people sign up under you and you earn on their orders.',
    route: 'referrals',
    done: () => hasData('/codes/mine', (d) => Boolean(d?.code))
  },
  {
    id: 'link-company',
    label: 'Link a company with a code',
    hint: 'Unlocks that company’s catalog so you can list their products.',
    route: 'companies',
    done: () => hasData('/company-links', (d) => Array.isArray(d) && d.length > 0)
  },
  {
    id: 'list-product',
    label: 'List a product in your store',
    hint: 'Set your own retail price and earn the margin on every sale.',
    route: 'listings',
    done: () => hasData('/store-products', (d) => Array.isArray(d) && d.length > 0)
  },
  {
    id: 'storefront',
    label: 'Publish your storefront',
    hint: 'A shareable page for your store with a WhatsApp/contact button.',
    route: 'storefront',
    done: () => hasData('/stores?pageSize=100', (d) => Array.isArray(d) && d.some((s: any) => s?.settings?.storefront?.enabled))
  },
  {
    id: 'first-sale',
    label: 'Make your first sale',
    route: 'orders',
    done: () => hasData('/orders?pageSize=1', (d) => Array.isArray(d) && d.length > 0)
  }
];

export const OWNER_CHECKLIST: ChecklistItem[] = [
  {
    id: 'catalog',
    label: 'Add products to your catalog',
    hint: 'Store owners list these at their own retail price.',
    route: 'products',
    done: () => hasData('/products?pageSize=1', (d) => Array.isArray(d) && d.length > 0)
  },
  {
    id: 'team',
    label: 'Invite your first team member',
    hint: 'Build your distributor network — commissions flow up the chain.',
    route: 'users',
    done: () => hasData('/memberships/team', (d) => Number(d?.counts?.total || 0) > 0)
  },
  {
    id: 'commissions',
    label: 'Confirm your commission settings',
    hint: 'Set the retail override levels paid from product revenue.',
    route: 'settings',
    done: () => hasData('/settings/commission', (d) => Boolean(d?.company))
  },
  {
    id: 'first-sale',
    label: 'Receive your first order',
    route: 'orders',
    done: () => hasData('/orders?pageSize=1', (d) => Array.isArray(d) && d.length > 0)
  }
];

/**
 * Renders a dismissible first-run checklist on a dashboard. Checks each step
 * against the API in parallel, persists completion + dismissal per role, and
 * reports progress. Returns the HTML string; call `wireChecklist` afterwards.
 */
export async function checklistHtml(role: string, items: ChecklistItem[]): Promise<string> {
  const state = readState(role);
  if (state.dismissed) return '';

  const results = await Promise.all(items.map((it) => it.done()));
  const completed = new Set<string>(state.completed || []);
  results.forEach((done, i) => {
    if (done) completed.add(items[i].id);
  });
  const allDone = items.every((it) => completed.has(it.id));

  // Persist what we confirmed so the card doesn't re-check every visit.
  writeState(role, { ...state, completed: [...completed] });

  const doneCount = items.filter((it) => completed.has(it.id)).length;
  const pct = Math.round((doneCount / items.length) * 100);

  const rows = items
    .map((it) => {
      const done = completed.has(it.id);
      return `<li class="chk-item${done ? ' done' : ''}" ${done ? '' : `data-chk-route="${esc(it.route || '')}"`}>
        <span class="chk-mark">${icon(done ? 'check-circle-2' : 'circle')}</span>
        <div class="chk-text">
          <strong>${esc(it.label)}</strong>
          ${it.hint ? `<p>${esc(it.hint)}</p>` : ''}
        </div>
        ${done ? '' : `<span class="chk-go">${icon('arrow-right')}</span>`}
      </li>`;
    })
    .join('');

  return `<div class="card chk-card" data-chk-role="${esc(role)}" data-chk-complete="${allDone ? '1' : '0'}">
    <div class="chk-head">
      <div>
        <h3>${icon('rocket')} Get started</h3>
        <p class="muted">${doneCount} of ${items.length} done${allDone ? ' — nice work!' : ''}</p>
      </div>
      <button class="btn btn-sm btn-ghost" data-chk-dismiss title="Dismiss">${icon('x')}<span>Hide</span></button>
    </div>
    <div class="chk-progress"><span style="width:${pct}%"></span></div>
    <ul class="chk-list">${rows}</ul>
  </div>`;
}

/** Wire checklist interactions: dismiss, and click a step to navigate to it. */
export function wireChecklist(scope: HTMLElement, role: string, navigate: (route: string) => void) {
  const card = scope.querySelector('.chk-card') as HTMLElement | null;
  if (!card) return;
  iconify(card);
  card.querySelector('[data-chk-dismiss]')?.addEventListener('click', () => {
    const state = readState(role);
    writeState(role, { ...state, dismissed: true });
    card.remove();
  });
  card.querySelectorAll('[data-chk-route]').forEach((el) => {
    el.addEventListener('click', () => {
      const route = (el as HTMLElement).dataset.chkRoute;
      if (route) navigate(route);
    });
  });
}
