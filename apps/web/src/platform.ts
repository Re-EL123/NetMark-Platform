import { apiRequest } from './api';
import { initPanel, NavItem } from './app';
import { esc, statusBadge, badge, formatDate } from './render';
import { crudView } from './crud';
import { openModal, confirmDialog, toast, money, titleCase, emptyState, statCards, dataTable, Field } from './ui';
import { icon } from './icons';
import { overviewStats, renderOverviewCharts } from './dashboard';
import { donutChart, barList, chartCard } from './charts';
import { platformAdsHtml, resetDismissedAds, invalidateAds, type Ad } from './ads';

const ROLE_OPTIONS = [
  'platformAdmin',
  'owner',
  'storeOwner',
  'customer',
  'driver'
].map((r) => ({ value: r, label: titleCase(r) }));

function opts(values: string[]) {
  return values.map((v) => ({ value: v, label: titleCase(v) }));
}

const ACT_ICON: Record<string, string> = {
  edit: 'pencil',
  toggle: 'power',
  remove: 'trash-2',
  status: 'refresh-cw',
  pay: 'credit-card',
  cancel: 'ban',
  approve: 'check',
  reject: 'x',
  assign: 'truck',
  view: 'eye',
  payout: 'wallet',
  copy: 'external-link',
  activate: 'power',
  suspend: 'ban',
  reset: 'refresh-cw',
  verify: 'badge-check'
};
function act(act: string, id: string, label: string, cls = '') {
  return `<button data-act="${act}" data-id="${esc(id)}" class="${cls}">${icon(ACT_ICON[act] || 'circle-dot')}<span>${esc(
    label
  )}</span></button>`;
}

function wire(root: HTMLElement, handlers: Record<string, (id: string) => void>) {
  root.querySelectorAll('[data-act]').forEach((btn) => {
    const el = btn as HTMLElement;
    el.onclick = () => handlers[el.dataset.act || '']?.(el.dataset.id || '');
  });
}

const nav: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: 'layout-dashboard' },
  { id: 'users', label: 'Users', icon: 'users' },
  { id: 'companies', label: 'Companies', icon: 'building-2' },
  { id: 'company-changes', label: 'Company Changes', icon: 'clipboard-check' },
  { id: 'stores', label: 'Stores', icon: 'store' },
  { id: 'products', label: 'Products', icon: 'package' },
  { id: 'orders', label: 'Orders', icon: 'receipt' },
  { id: 'drivers', label: 'Drivers', icon: 'truck' },
  { id: 'appointments', label: 'Appointments', icon: 'calendar-clock' },
  { id: 'plans', label: 'Plans', icon: 'layers' },
  { id: 'codes', label: 'Distributor Codes', icon: 'ticket-percent' },
  { id: 'code-purchases', label: 'Code Purchases', icon: 'shopping-cart' },
  { id: 'store-purchases', label: 'Store Purchases', icon: 'shopping-bag' },
  { id: 'consent', label: 'Consent', icon: 'shield' },
  { id: 'dsar', label: 'DSAR', icon: 'file-text' },
  { id: 'wallets', label: 'Wallets', icon: 'wallet' },
  { id: 'commissions', label: 'Commissions', icon: 'banknote' },
  { id: 'analytics', label: 'Analytics', icon: 'trending-up' },
  { id: 'api-keys', label: 'API Keys', icon: 'key-round' },
  { id: 'webhooks', label: 'Webhooks', icon: 'webhook' },
  { id: 'feature-flags', label: 'Feature Flags', icon: 'flag' },
  { id: 'payouts', label: 'Payouts', icon: 'wallet' },
  { id: 'payout-batches', label: 'Payout Batches', icon: 'banknote' },
  { id: 'payments', label: 'Payments', icon: 'credit-card' },
  { id: 'reports', label: 'Reports', icon: 'bar-chart-3' },
  { id: 'ads', label: 'Adverts', icon: 'megaphone' },
  { id: 'announcements', label: 'Announcements', icon: 'bell' },
  { id: 'audit', label: 'Audit Log', icon: 'shield-check' },
  { id: 'settings', label: 'Settings', icon: 'settings' }
];

initPanel({
  title: 'Platform Admin',
  nav,
  tourIntro:
    'Full control of the platform. Manage every user, company, store, product, order, driver, code, payout and payment from here.',
  render: async (route, ctx) => {
    const c = ctx.container;
    ctx.titleEl.textContent = nav.find((n) => n.id === route)?.label || 'Platform Admin';

    if (route === 'dashboard') return renderDashboard(c);
    if (route === 'users') return renderUsers(c);
    if (route === 'companies') return renderCompanies(c);
    if (route === 'company-changes') return renderCompanyChanges(c);
    if (route === 'stores') return renderStores(c);
    if (route === 'products') return renderProducts(c);
    if (route === 'orders') return renderOrders(c);
    if (route === 'drivers') return renderDrivers(c);
    if (route === 'appointments') return renderAppointments(c);
    if (route === 'codes') return renderCodes(c);
    if (route === 'plans') return renderPlans(c);
    if (route === 'code-purchases') return renderCodePurchases(c);
    if (route === 'store-purchases') return renderStorePurchases(c);
    if (route === 'consent') return renderConsent(c);
    if (route === 'dsar') return renderDSAR(c);
    if (route === 'wallets') return renderWallets(c);
    if (route === 'commissions') return renderCommissions(c);
    if (route === 'analytics') return renderAnalytics(c);
    if (route === 'api-keys') return renderApiKeys(c);
    if (route === 'webhooks') return renderWebhooks(c);
    if (route === 'feature-flags') return renderFeatureFlags(c);
    if (route === 'payouts') return renderPayouts(c);
    if (route === 'payout-batches') return renderPayoutBatches(c);
    if (route === 'payments') return renderPayments(c);
    if (route === 'reports') return renderReports(c);
    if (route === 'ads') return renderAds(c);
    if (route === 'announcements') return renderAnnouncements(c);
    if (route === 'audit') return renderAudit(c);
    if (route === 'settings') return renderSettings(c);
  }
});

/* ------------------------------ dashboard ------------------------------ */
async function renderDashboard(c: HTMLElement) {
  const res = await apiRequest('/admin/stats');
  if (!res.success) {
    c.innerHTML = `<div class="card"><p class="empty">${esc(res.message)}</p></div>`;
    return;
  }
  const d = res.data;
  const [an, rt] = await Promise.all([
    apiRequest('/analytics/overview').catch(() => null),
    apiRequest('/analytics/retail').catch(() => null)
  ]);
  const o = an?.success ? an.data : null;
  const r = rt?.success ? rt.data : null;
  const roleItems = Object.entries(d.roleCounts || {}).map(([role, count]) => ({ label: titleCase(role), value: Number(count) }));
  const recentItems = (d.recentOrders || []).slice(0, 6).map((o: any) => ({ label: o.orderNumber || String(o.id).slice(0, 8), value: Number(o.total || 0) }));
  c.innerHTML = `
    ${statCards([
      { label: 'Revenue (paid)', value: Number(d.totals.revenue || 0), format: 'money', accent: true, icon: 'dollar-sign', tone: 'brand' },
      { label: 'Orders', value: d.totals.orders, format: 'number', icon: 'receipt', tone: 'info' },
      { label: 'Users', value: d.totals.users, format: 'number', icon: 'users' },
      { label: 'Companies', value: d.totals.companies, format: 'number', icon: 'building-2' },
      { label: 'Stores', value: d.totals.stores, format: 'number', icon: 'store' },
      { label: 'Products', value: d.totals.products, format: 'number', icon: 'package' },
      { label: 'Pending drivers', value: d.drivers.pending, format: 'number', icon: 'truck', tone: 'warning' },
      { label: 'Active drivers', value: d.drivers.active, format: 'number', icon: 'truck', tone: 'success' }
    ])}
    ${
      o
        ? `<div class="card">
            <h3>${icon('trending-up')} Business model</h3>
            ${statCards([
              { label: 'GMV (completed)', value: Number(o.gmvZar || 0), format: 'money', icon: 'dollar-sign', tone: 'brand' },
              { label: 'GMV this month', value: Number(o.gmvMonthZar || 0), format: 'money', icon: 'activity', tone: 'info' },
              { label: 'Avg order', value: Number(o.avgOrderZar || 0), format: 'money', icon: 'receipt' },
              { label: 'Distributor sales', value: (r?.distributorPct ?? 0) + '%', icon: 'ticket-percent' },
              { label: 'Distributor GMV', value: Number(r?.distributorGmvZar || 0), format: 'money', icon: 'hand-coins' },
              { label: 'Active users', value: Number(o.users?.active || 0), format: 'number', icon: 'users' }
            ])}
          </div>`
        : ''
    }
    <div class="chart-grid">
      ${chartCard('Users by role', donutChart(roleItems, { caption: 'users' }), { icon: 'users' })}
      ${chartCard('Recent order values', barList(recentItems, { prefix: 'R' }), { icon: 'receipt' })}
    </div>
    <div class="card">
      <h3>${icon('receipt')} Recent orders</h3>
      ${tableSimple(
        ['Order', 'Customer', 'Total', 'Payment', 'Status', 'Created'],
        d.recentOrders.map((o: any) => [
          esc(o.orderNumber || o.id),
          esc(o.customerId ? o.customerId.slice(0, 8) : ''),
          money(o.total),
          statusBadge(o.paymentStatus),
          statusBadge(o.orderStatus),
          formatDate(o.createdAt)
        ])
      )}
    </div>`;
}

function tableSimple(headers: string[], rows: string[][]) {
  if (!rows.length) return emptyState('No records.', 'inbox');
  return `<div class="table-wrap"><table><thead><tr>${headers
    .map((h) => `<th>${h}</th>`)
    .join('')}</tr></thead><tbody>${rows
    .map((r) => `<tr>${r.map((cell) => `<td>${cell}</td>`).join('')}</tr>`)
    .join('')}</tbody></table></div>`;
}

/* -------------------------------- users -------------------------------- */
function renderUsers(c: HTMLElement) {
  let rows: any[] = [];
  crudView(c, {
    endpoint: '/admin/users',
    searchPlaceholder: 'Search name, email, phone…',
    onData: (r) => (rows = r),
    filters: () => [
      { name: 'role', label: 'Role', options: ROLE_OPTIONS },
      { name: 'status', label: 'Status', options: opts(['active', 'suspended']) }
    ],
    columns: [
      { key: 'name', label: 'Name' },
      { key: 'email', label: 'Email' },
      { key: 'role', label: 'Role', render: (r) => badge(r.role, 'info') },
      { key: 'status', label: 'Status', render: (r) => statusBadge(r.status || 'active') },
      { key: 'verificationStatus', label: 'Verification', render: (r) => statusBadge(r.verificationStatus) },
      { key: 'lastLogin', label: 'Last login', render: (r) => formatDate(r.lastLogin) }
    ],
    toolbar: () => `<button class="btn btn-sm" data-new>${icon('plus')}<span>New user</span></button>`,
    actions: (r) =>
      act('edit', r.id, 'Edit') +
      (r.status === 'suspended' ? act('activate', r.id, 'Reactivate') : act('suspend', r.id, 'Suspend', 'danger')) +
      act('reset', r.id, 'Reset password') +
      act('delete', r.id, 'Delete', 'danger'),
    bind: (root, reload) => {
      (root.querySelector('[data-new]') as HTMLElement).onclick = () => userModal(null, reload);
      wire(root, {
        edit: (id) => userModal(rows.find((r) => r.id === id), reload),
        suspend: async (id) => {
          if (await confirmDialog('Suspend this user?', { danger: true, confirmLabel: 'Suspend' })) {
            await apiRequest(`/admin/users/${id}/suspend`, { method: 'POST' });
            toast('User suspended', 'success');
            reload();
          }
        },
        activate: async (id) => {
          await apiRequest(`/admin/users/${id}/reactivate`, { method: 'POST' });
          toast('User reactivated', 'success');
          reload();
        },
        reset: async (id) => {
          const r = await apiRequest(`/admin/users/${id}/reset-password`, { method: 'POST' });
          if (r.success) alert(`Temporary password: ${r.data.temporaryPassword}\n\nShare this securely.`);
          else toast(r.message || 'Failed', 'error');
        },
        delete: async (id) => {
          if (await confirmDialog('Delete this user permanently?', { danger: true, confirmLabel: 'Delete' })) {
            await apiRequest(`/admin/users/${id}`, { method: 'DELETE' });
            toast('User deleted', 'success');
            reload();
          }
        }
      });
    }
  });
}

async function userModal(row: any, reload: () => void) {
  const companies = await loadCompanies();
  const fields: Field[] = [
    { name: 'name', label: 'Full name', required: true, value: row?.name },
    { name: 'email', label: 'Email', type: 'email', required: !row, value: row?.email },
    { name: 'phone', label: 'Phone', type: 'tel', value: row?.phone },
    { name: 'profileImage', label: 'Profile photo', type: 'image', folder: 'users', value: row?.profileImage },
    { name: 'role', label: 'Role', type: 'select', options: ROLE_OPTIONS, value: row?.role || 'customer' },
    { name: 'status', label: 'Status', type: 'select', options: opts(['active', 'suspended']), value: row?.status || 'active' },
    { name: 'companyId', label: 'Company', type: 'select', options: [{ value: '', label: 'None' }, ...companies], value: row?.companyId || '' }
  ];
  if (!row) fields.push({ name: 'password', label: 'Password', type: 'password', help: 'Leave blank to auto-generate' });
  await openModal({
    title: row ? 'Edit user' : 'New user',
    fields,
    onSubmit: async (v) => {
      const res = row
        ? await apiRequest(`/admin/users/${row.id}`, { method: 'PUT', body: JSON.stringify(v) })
        : await apiRequest('/admin/users', { method: 'POST', body: JSON.stringify(v) });
      if (!res.success) throw new Error(res.message || 'Failed');
      if (res.data?.temporaryPassword) alert(`Temporary password: ${res.data.temporaryPassword}`);
      toast(row ? 'User updated' : 'User created', 'success');
      reload();
    }
  });
}

async function loadCompanies(): Promise<{ value: string; label: string }[]> {
  return refOptions('companies', async () => {
    const res = await apiRequest('/companies?pageSize=100');
    return (res.data || []).map((co: any) => ({ value: co.id, label: co.name }));
  });
}

type SelectOption = { value: string; label: string };
const refCache: Record<string, { at: number; data: SelectOption[] }> = {};
const REF_TTL_MS = 60_000;

async function refOptions(key: string, loader: () => Promise<SelectOption[]>): Promise<SelectOption[]> {
  const hit = refCache[key];
  if (hit && Date.now() - hit.at < REF_TTL_MS) return hit.data;
  const data = await loader();
  refCache[key] = { at: Date.now(), data };
  return data;
}

async function loadOwners(): Promise<SelectOption[]> {
  return refOptions('owners', async () => {
    const res = await apiRequest('/admin/users?role=owner&pageSize=100');
    return (res.data || []).map((u: any) => ({ value: u.id, label: `${u.name} (${u.email})` }));
  });
}

async function loadDrivers(): Promise<SelectOption[]> {
  return refOptions('drivers', async () => {
    const res = await apiRequest('/drivers?status=approved&pageSize=100');
    return (res.data || []).map((d: any) => ({
      value: d.id,
      label: d.user?.name || d.licenseNumber || d.id.slice(0, 8)
    }));
  });
}

/* ------------------------------ companies ------------------------------ */
function renderCompanies(c: HTMLElement) {
  let rows: any[] = [];
  crudView(c, {
    endpoint: '/companies',
    searchPlaceholder: 'Search companies…',
    onData: (r) => (rows = r),
    filters: () => [{ name: 'status', label: 'Status', options: opts(['active', 'suspended', 'inactive']) }],
    columns: [
      { key: 'name', label: 'Name' },
      { key: 'slug', label: 'Slug' },
      { key: 'plan', label: 'Plan', render: (r) => badge(r.plan || 'standard', 'info') },
      { key: 'status', label: 'Status', render: (r) => statusBadge(r.status) },
      { key: 'createdAt', label: 'Created', render: (r) => formatDate(r.createdAt) }
    ],
    toolbar: () => `<button class="btn btn-sm" data-new>${icon('plus')}<span>New company</span></button>`,
    actions: (r) =>
      act('edit', r.id, 'Edit') +
      (r.status === 'suspended' ? act('activate', r.id, 'Reactivate') : act('suspend', r.id, 'Suspend', 'danger')) +
      act('delete', r.id, 'Delete', 'danger'),
    bind: (root, reload) => {
      (root.querySelector('[data-new]') as HTMLElement).onclick = () => companyModal(null, reload);
      wire(root, {
        edit: (id) => companyModal(rows.find((r) => r.id === id), reload),
        suspend: async (id) => {
          if (await confirmDialog('Suspend this company and all its users?', { danger: true, confirmLabel: 'Suspend' })) {
            await apiRequest(`/companies/${id}/suspend`, { method: 'POST', body: JSON.stringify({ reason: 'Admin action' }) });
            toast('Company suspended', 'success');
            reload();
          }
        },
        activate: async (id) => {
          await apiRequest(`/companies/${id}/reactivate`, { method: 'POST' });
          toast('Company reactivated', 'success');
          reload();
        },
        delete: async (id) => {
          if (await confirmDialog('Delete this company?', { danger: true, confirmLabel: 'Delete' })) {
            await apiRequest(`/companies/${id}`, { method: 'DELETE' });
            toast('Company deleted', 'success');
            reload();
          }
        }
      });
    }
  });
}

async function companyModal(row: any, reload: () => void) {
  const owners = [{ value: '', label: 'None' }, ...(await loadOwners())];
  await openModal({
    title: row ? 'Edit company' : 'New company',
    fields: [
      { name: 'name', label: 'Company name', required: true, value: row?.name },
      { name: 'logo', label: 'Company logo', type: 'image', folder: 'companies', value: row?.logo },
      { name: 'plan', label: 'Plan', value: row?.plan || 'standard' },
      { name: 'ownerId', label: 'Owner', type: 'select', options: owners, value: row?.ownerId || '' }
    ],
    onSubmit: async (v) => {
      const res = row
        ? await apiRequest(`/companies/${row.id}`, { method: 'PUT', body: JSON.stringify(v) })
        : await apiRequest('/companies', { method: 'POST', body: JSON.stringify(v) });
      if (!res.success) throw new Error(res.message || 'Failed');
      toast(row ? 'Company updated' : 'Company created', 'success');
      reload();
    }
  });
}

/* -------------------------- company changes ---------------------------- */
function changeDiff(changes: any): string {
  const out: string[] = [];
  if (changes?.name !== undefined) out.push(`<div><span class="detail-label">Name</span> ${esc(changes.name)}</div>`);
  if (changes?.logo) out.push(`<div><span class="detail-label">Logo</span> <img class="cell-media" src="${esc(changes.logo)}" alt="" /></div>`);
  const st = changes?.settings || {};
  if (st.address !== undefined) out.push(`<div><span class="detail-label">Address</span> ${esc(st.address || '')}</div>`);
  if (st.phone !== undefined) out.push(`<div><span class="detail-label">Phone</span> ${esc(st.phone || '')}</div>`);
  if (st.deliveryFee !== undefined) out.push(`<div><span class="detail-label">Delivery fee</span> ${money(st.deliveryFee)}</div>`);
  if (st.deliveryRadiusKm !== undefined)
    out.push(`<div><span class="detail-label">Delivery radius</span> ${esc(st.deliveryRadiusKm)} km</div>`);
  return out.join('') || '<span class="muted">No field changes</span>';
}

function changeCard(r: any): string {
  return `<div class="card">
    <div class="toolbar" style="margin-bottom:4px">
      <h3 style="margin:0">${icon('building-2')} ${esc(r.company?.name || 'Company')}</h3>
      <div class="spacer"></div>
      ${statusBadge(r.status)}
    </div>
    <p class="muted">Requested by ${esc(r.requestedByEmail || 'owner')} · ${esc(formatDate(r.createdAt))}</p>
    <div class="detail-grid">${changeDiff(r.changes)}</div>
    ${
      r.status === 'pending'
        ? `<div class="row-actions" style="margin-top:12px">
            <button class="btn btn-sm" data-approve="${esc(r.id)}">${icon('check')}<span>Approve</span></button>
            <button class="btn btn-sm btn-danger" data-reject="${esc(r.id)}">${icon('x')}<span>Reject</span></button>
          </div>`
        : r.reviewNote
        ? `<p class="muted">Note: ${esc(r.reviewNote)}</p>`
        : ''
    }
  </div>`;
}

async function renderCompanyChanges(c: HTMLElement) {
  let filter = 'pending';
  async function draw() {
    c.innerHTML = '<p class="empty">Loading…</p>';
    const res = await apiRequest(`/company-changes${filter === 'pending' ? '?status=pending' : ''}`);
    const rows: any[] = res.success ? res.data || [] : [];
    const tabs = (['pending', 'all'] as const)
      .map((f) => `<button class="${filter === f ? 'active' : ''}" data-filter="${f}">${f === 'pending' ? 'Pending' : 'All'}</button>`)
      .join('');
    const list = rows.length
      ? rows.map(changeCard).join('')
      : `<div class="card">${emptyState('No requests to review', 'clipboard-check')}</div>`;
    c.innerHTML = `<div class="toolbar"><div class="tabs">${tabs}</div><div class="spacer"></div></div>${list}`;
    c.querySelectorAll('[data-filter]').forEach((b) =>
      b.addEventListener('click', () => {
        filter = (b as HTMLElement).dataset.filter!;
        draw();
      })
    );
    c.querySelectorAll('[data-approve]').forEach((b) =>
      b.addEventListener('click', async () => {
        const id = (b as HTMLElement).dataset.approve;
        if (await confirmDialog('Approve and apply these company changes?', { confirmLabel: 'Approve' })) {
          const r = await apiRequest(`/company-changes/${id}/approve`, { method: 'POST' });
          toast(r.success ? 'Changes approved' : r.message || 'Failed', r.success ? 'success' : 'error');
          draw();
        }
      })
    );
    c.querySelectorAll('[data-reject]').forEach((b) =>
      b.addEventListener('click', () => rejectChangeModal((b as HTMLElement).dataset.reject!, draw))
    );
  }
  draw();
}

function rejectChangeModal(id: string, reload: () => void) {
  return openModal({
    title: 'Reject company changes',
    fields: [{ name: 'note', label: 'Reason (optional)', type: 'textarea' }],
    onSubmit: async (v) => {
      const r = await apiRequest(`/company-changes/${id}/reject`, { method: 'POST', body: JSON.stringify({ note: v.note }) });
      if (!r.success) throw new Error(r.message || 'Failed');
      toast('Request rejected', 'success');
      reload();
    }
  });
}

/* ------------------------------- stores -------------------------------- */
function renderStores(c: HTMLElement) {
  let rows: any[] = [];
  crudView(c, {
    endpoint: '/stores',
    searchPlaceholder: 'Search stores…',
    onData: (r) => (rows = r),
    columns: [
      { key: 'name', label: 'Name' },
      { key: 'slug', label: 'Slug' },
      { key: 'isActive', label: 'Active', render: (r) => statusBadge(r.isActive ? 'active' : 'inactive') },
      { key: 'createdAt', label: 'Created', render: (r) => formatDate(r.createdAt) }
    ],
    toolbar: () => `<button class="btn btn-sm" data-new>${icon('plus')}<span>New store</span></button>`,
    actions: (r) => act('edit', r.id, 'Edit') + act('toggle', r.id, r.isActive ? 'Deactivate' : 'Activate') + act('delete', r.id, 'Delete', 'danger'),
    bind: (root, reload) => {
      (root.querySelector('[data-new]') as HTMLElement).onclick = () => storeModal(null, reload);
      wire(root, {
        edit: (id) => storeModal(rows.find((r) => r.id === id), reload),
        toggle: async (id) => {
          await apiRequest(`/stores/${id}/toggle`, { method: 'POST' });
          toast('Store updated', 'success');
          reload();
        },
        delete: async (id) => {
          if (await confirmDialog('Delete this store?', { danger: true, confirmLabel: 'Delete' })) {
            await apiRequest(`/stores/${id}`, { method: 'DELETE' });
            reload();
          }
        }
      });
    }
  });
}

async function storeModal(row: any, reload: () => void) {
  const companies = await loadCompanies();
  await openModal({
    title: row ? 'Edit store' : 'New store',
    fields: [
      { name: 'name', label: 'Store name', required: true, value: row?.name },
      { name: 'logo', label: 'Store logo', type: 'image', folder: 'stores', value: row?.logo },
      { name: 'banner', label: 'Store banner', type: 'image', folder: 'stores', value: row?.banner },
      { name: 'address', label: 'Address', value: row?.address },
      { name: 'companyId', label: 'Company', type: 'select', options: [{ value: '', label: 'None' }, ...companies], value: row?.companyId || '' }
    ],
    onSubmit: async (v) => {
      const res = row
        ? await apiRequest(`/stores/${row.id}`, { method: 'PUT', body: JSON.stringify(v) })
        : await apiRequest('/stores', { method: 'POST', body: JSON.stringify(v) });
      if (!res.success) throw new Error(res.message || 'Failed');
      toast('Store saved', 'success');
      reload();
    }
  });
}

/* ------------------------------ products ------------------------------- */
function renderProducts(c: HTMLElement) {
  let rows: any[] = [];
  crudView(c, {
    endpoint: '/products',
    searchPlaceholder: 'Search products…',
    onData: (r) => (rows = r),
    columns: [
      { key: 'name', label: 'Name' },
      { key: 'sku', label: 'SKU' },
      { key: 'price', label: 'Price', render: (r) => money(r.price) },
      { key: 'stock', label: 'Stock', render: (r) => badge(String(r.stock ?? 0), Number(r.stock) <= 5 ? 'warning' : 'neutral') },
      { key: 'isActive', label: 'Active', render: (r) => statusBadge(r.isActive ? 'active' : 'inactive') }
    ],
    toolbar: () => `<button class="btn btn-sm" data-new>${icon('plus')}<span>New product</span></button>`,
    actions: (r) => act('edit', r.id, 'Edit') + act('stock', r.id, 'Stock') + act('delete', r.id, 'Delete', 'danger'),
    bind: (root, reload) => {
      (root.querySelector('[data-new]') as HTMLElement).onclick = () => productModal(null, reload);
      wire(root, {
        edit: (id) => productModal(rows.find((r) => r.id === id), reload),
        stock: async (id) => {
          const row = rows.find((r) => r.id === id);
          await openModal({
            title: `Adjust stock — ${row?.name}`,
            fields: [{ name: 'delta', label: 'Change (+/-)', type: 'number', value: 0, help: `Current: ${row?.stock ?? 0}` }],
            onSubmit: async (v) => {
              const res = await apiRequest(`/products/${id}/stock`, { method: 'POST', body: JSON.stringify(v) });
              if (!res.success) throw new Error(res.message);
              toast('Stock updated', 'success');
              reload();
            }
          });
        },
        delete: async (id) => {
          if (await confirmDialog('Delete this product?', { danger: true, confirmLabel: 'Delete' })) {
            await apiRequest(`/products/${id}`, { method: 'DELETE' });
            reload();
          }
        }
      });
    }
  });
}

async function productModal(row: any, reload: () => void) {
  const companies = await loadCompanies();
  await openModal({
    title: row ? 'Edit product' : 'New product',
    fields: [
      { name: 'name', label: 'Name', required: true, value: row?.name },
      { name: 'price', label: 'Price', type: 'number', step: '0.01', value: row?.price ?? 0 },
      { name: 'stock', label: 'Stock', type: 'number', value: row?.stock ?? 0 },
      { name: 'category', label: 'Category', value: row?.category },
      { name: 'sku', label: 'SKU', value: row?.sku },
      { name: 'description', label: 'Description', type: 'textarea', value: row?.description },
      { name: 'image', label: 'Image', type: 'image', folder: 'products', value: row?.image },
      { name: 'gallery', label: 'Gallery', type: 'gallery', folder: 'products', value: row?.gallery, help: 'Extra images shown on the product page.' },
      { name: 'companyId', label: 'Company', type: 'select', options: [{ value: '', label: 'None' }, ...companies], value: row?.companyId || '' },
      { name: 'isActive', label: 'Active', type: 'checkbox', value: row ? row.isActive !== false : true }
    ],
    onSubmit: async (v) => {
      const res = row
        ? await apiRequest(`/products/${row.id}`, { method: 'PUT', body: JSON.stringify(v) })
        : await apiRequest('/products', { method: 'POST', body: JSON.stringify(v) });
      if (!res.success) throw new Error(res.message || 'Failed');
      toast('Product saved', 'success');
      reload();
    }
  });
}

/* ------------------------------- orders -------------------------------- */
function renderOrders(c: HTMLElement) {
  let rows: any[] = [];
  crudView(c, {
    endpoint: '/orders',
    searchPlaceholder: 'Search orders…',
    onData: (r) => (rows = r),
    filters: () => [
      { name: 'status', label: 'Status', options: opts(['pending', 'confirmed', 'ready', 'completed', 'cancelled']) },
      { name: 'paymentStatus', label: 'Payment', options: opts(['unpaid', 'paid', 'refunded']) }
    ],
    columns: [
      { key: 'orderNumber', label: 'Order', render: (r) => esc(r.orderNumber || r.id.slice(0, 8)) },
      { key: 'total', label: 'Total', render: (r) => money(r.total) },
      { key: 'paymentStatus', label: 'Payment', render: (r) => statusBadge(r.paymentStatus) },
      { key: 'orderStatus', label: 'Status', render: (r) => statusBadge(r.orderStatus) },
      { key: 'deliveryStatus', label: 'Delivery', render: (r) => statusBadge(r.deliveryStatus) },
      { key: 'createdAt', label: 'Created', render: (r) => formatDate(r.createdAt) }
    ],
    actions: (r) => act('view', r.id, 'View') + act('status', r.id, 'Status') + act('assign', r.id, 'Assign') + act('refund', r.id, 'Refund', 'danger'),
    bind: (root, reload) => {
      wire(root, {
        view: (id) => orderModal(rows.find((r) => r.id === id)),
        status: (id) => orderStatusModal(rows.find((r) => r.id === id), reload),
        assign: (id) => assignModal(rows.find((r) => r.id === id), reload),
        refund: async (id) => {
          const row = rows.find((r) => r.id === id);
          if (await confirmDialog(`Refund ${money(row?.total)} for this order?`, { danger: true, confirmLabel: 'Refund' })) {
            await apiRequest(`/orders/${id}/refund`, { method: 'POST', body: JSON.stringify({ amount: row?.total }) });
            toast('Refund issued', 'success');
            reload();
          }
        }
      });
    }
  });
}

async function orderModal(row: any) {
  if (!row) return;
  const items = (row.items || [])
    .map((i: any) => `<div class="summary-row"><span>${esc(i.name)} × ${i.quantity}</span><span>${money(i.lineTotal)}</span></div>`)
    .join('');
  await openModal({
    title: `Order ${esc(row.orderNumber || row.id)}`,
    submitLabel: 'Close',
    html: `
      <div class="detail-grid" style="margin-bottom:16px">
        <div><span class="detail-label">Status</span><span>${statusBadge(row.orderStatus)}</span></div>
        <div><span class="detail-label">Payment</span><span>${statusBadge(row.paymentStatus)}</span></div>
        <div><span class="detail-label">Delivery</span><span>${statusBadge(row.deliveryStatus)}</span></div>
        <div><span class="detail-label">Created</span><span>${formatDate(row.createdAt)}</span></div>
      </div>
      <h4>Items</h4>${items || '<p class="empty">No items</p>'}
      <div class="summary-row"><span>Subtotal</span><span>${money(row.subtotal)}</span></div>
      <div class="summary-row"><span>Delivery</span><span>${money(row.deliveryFee)}</span></div>
      <div class="summary-row total"><span>Total</span><span>${money(row.total)}</span></div>
      ${row.address ? `<p class="empty" style="margin-top:12px">Address: ${esc(typeof row.address === 'string' ? row.address : JSON.stringify(row.address))}</p>` : ''}`,
    onSubmit: async () => true
  });
}

async function orderStatusModal(row: any, reload: () => void) {
  await openModal({
    title: 'Update order status',
    fields: [{ name: 'status', label: 'Order status', type: 'select', options: opts(['pending', 'confirmed', 'ready', 'completed', 'cancelled']), value: row?.orderStatus }],
    onSubmit: async (v) => {
      const res = await apiRequest(`/orders/${row.id}/status`, { method: 'PUT', body: JSON.stringify(v) });
      if (!res.success) throw new Error(res.message);
      toast('Order updated', 'success');
      reload();
    }
  });
}

async function assignModal(row: any, reload: () => void) {
  const drivers = await loadDrivers();
  if (!drivers.length) return toast('No approved drivers available', 'error');
  await openModal({
    title: 'Assign driver',
    fields: [{ name: 'driverId', label: 'Driver', type: 'select', options: drivers }],
    onSubmit: async (v) => {
      const r = await apiRequest(`/orders/${row.id}/assign`, { method: 'POST', body: JSON.stringify(v) });
      if (!r.success) throw new Error(r.message);
      toast('Driver assigned', 'success');
      reload();
    }
  });
}

/* ------------------------------- drivers ------------------------------- */
function renderDrivers(c: HTMLElement) {
  let rows: any[] = [];
  crudView(c, {
    endpoint: '/drivers',
    searchPlaceholder: 'Search drivers…',
    onData: (r) => (rows = r),
    filters: () => [{ name: 'status', label: 'Status', options: opts(['pending', 'approved', 'rejected', 'suspended']) }],
    columns: [
      {
        key: 'user',
        label: 'Driver',
        render: (r) =>
          `<div class="cell-media"><span class="cell-thumb">${r.profileImage ? `<img src="${esc(r.profileImage)}" alt="" />` : icon('user')}</span>${esc(r.user?.name || '')}</div>`
      },
      { key: 'vehicleType', label: 'Vehicle', render: (r) => esc(`${r.vehicleType || ''} ${r.vehicleNumber || ''}`.trim()) },
      { key: 'status', label: 'Status', render: (r) => statusBadge(r.status) },
      { key: 'isAvailable', label: 'Online', render: (r) => statusBadge(r.isAvailable ? 'active' : 'inactive') },
      { key: 'stats', label: 'Deliveries', render: (r) => esc(r.stats?.totalDeliveries ?? 0) }
    ],
    actions: (r) =>
      act('view', r.id, 'View') +
      act('approve', r.id, 'Approve') +
      act('reject', r.id, 'Reject', 'danger') +
      act('suspend', r.id, 'Suspend', 'danger'),
    bind: (root, reload) => {
      wire(root, {
        view: (id) => driverModal(rows.find((r) => r.id === id), reload),
        approve: async (id) => {
          await apiRequest(`/drivers/${id}/approve`, { method: 'POST' });
          toast('Driver approved', 'success');
          reload();
        },
        reject: async (id) => {
          if (await confirmDialog('Reject this driver?', { danger: true, confirmLabel: 'Reject' })) {
            await apiRequest(`/drivers/${id}/reject`, { method: 'POST' });
            reload();
          }
        },
        suspend: async (id) => {
          if (await confirmDialog('Suspend this driver?', { danger: true, confirmLabel: 'Suspend' })) {
            await apiRequest(`/drivers/${id}/suspend`, { method: 'POST' });
            reload();
          }
        }
      });
    }
  });
}

async function driverModal(row: any, reload: () => void) {
  if (!row) return;
  await openModal({
    title: `Driver — ${row.user?.name || row.id.slice(0, 8)}`,
    fields: [
      { name: 'profileImage', label: 'Driver photo', type: 'image', folder: 'drivers', value: row.profileImage },
      { name: 'vehicleType', label: 'Vehicle type', value: row.vehicleType },
      { name: 'vehicleNumber', label: 'Vehicle number', value: row.vehicleNumber },
      { name: 'vehicleModel', label: 'Vehicle model', value: row.vehicleModel },
      { name: 'licenseNumber', label: 'Licence number', value: row.licenseNumber },
      { name: 'licenseExpiry', label: 'Licence expiry', type: 'date', value: row.licenseExpiry ? String(row.licenseExpiry).slice(0, 10) : '' },
      { name: 'documents', label: 'Documents', type: 'documents', folder: 'drivers', value: row.documents, help: 'Licence, ID and vehicle papers.' }
    ],
    onSubmit: async (v) => {
      const res = await apiRequest(`/drivers/${row.id}`, { method: 'PUT', body: JSON.stringify(v) });
      if (!res.success) throw new Error(res.message || 'Failed');
      toast('Driver updated', 'success');
      reload();
    }
  });
}

/* ---------------------------- appointments ----------------------------- */
function renderAppointments(c: HTMLElement) {
  let rows: any[] = [];
  crudView(c, {
    endpoint: '/appointments',
    onData: (r) => (rows = r),
    filters: () => [{ name: 'status', label: 'Status', options: opts(['pending', 'confirmed', 'completed', 'cancelled', 'no_show']) }],
    columns: [
      { key: 'service', label: 'Service' },
      { key: 'appointmentDate', label: 'Date', render: (r) => formatDate(r.appointmentDate) },
      { key: 'appointmentTime', label: 'Time' },
      { key: 'status', label: 'Status', render: (r) => statusBadge(r.status) }
    ],
    actions: (r) => act('set', r.id, 'Update'),
    bind: (root, reload) => {
      wire(root, {
        set: async (id) => {
          await openModal({
            title: 'Update appointment',
            fields: [{ name: 'status', label: 'Status', type: 'select', options: opts(['pending', 'confirmed', 'completed', 'cancelled', 'no_show']), value: rows.find((r) => r.id === id)?.status }],
            onSubmit: async (v) => {
              await apiRequest(`/appointments/${id}/status`, { method: 'PUT', body: JSON.stringify(v) });
              toast('Appointment updated', 'success');
              reload();
            }
          });
        }
      });
    }
  });
}

/* ------------------------------- codes --------------------------------- */
function renderCodes(c: HTMLElement) {
  crudView(c, {
    endpoint: '/codes',
    searchPlaceholder: 'Search codes…',
    columns: [
      { key: 'code', label: 'Code', render: (r) => badge(r.code, 'info') },
      { key: 'uses', label: 'Uses', render: (r) => `${r.uses || 0}${r.maxUses ? ' / ' + r.maxUses : ''}` },
      { key: 'isActive', label: 'Active', render: (r) => statusBadge(r.isActive ? 'active' : 'inactive') },
      { key: 'expiresAt', label: 'Expires', render: (r) => (r.expiresAt ? formatDate(r.expiresAt) : '') }
    ],
    toolbar: () => `<button class="btn btn-sm" data-new>${icon('plus')}<span>New code</span></button>`,
    actions: (r) => act('toggle', r.id, r.isActive ? 'Disable' : 'Enable') + act('delete', r.id, 'Delete', 'danger'),
    bind: (root, reload) => {
      (root.querySelector('[data-new]') as HTMLElement).onclick = () =>
        openModal({
          title: 'New referral code',
          fields: [
            { name: 'code', label: 'Code', help: 'Leave blank to auto-generate' },
            { name: 'maxUses', label: 'Max uses', type: 'number' },
            { name: 'expiresAt', label: 'Expires', type: 'date' }
          ],
          onSubmit: async (v) => {
            const res = await apiRequest('/codes', { method: 'POST', body: JSON.stringify(v) });
            if (!res.success) throw new Error(res.message);
            toast('Code created', 'success');
            reload();
          }
        });
      wire(root, {
        toggle: async (id) => {
          await apiRequest(`/codes/${id}/toggle`, { method: 'POST' });
          reload();
        },
        delete: async (id) => {
          if (await confirmDialog('Delete this code?', { danger: true, confirmLabel: 'Delete' })) {
            await apiRequest(`/codes/${id}`, { method: 'DELETE' });
            reload();
          }
        }
      });
    }
  });
}

/* ------------------------------ payouts -------------------------------- */
function renderPayouts(c: HTMLElement) {
  crudView(c, {
    endpoint: '/admin/payouts',
    columns: [
      { key: 'driverId', label: 'Driver', render: (r) => esc((r.driverId || '').slice(0, 8)) },
      { key: 'amount', label: 'Amount', render: (r) => money(r.amount) },
      { key: 'status', label: 'Status', render: (r) => statusBadge(r.status) },
      { key: 'createdAt', label: 'Created', render: (r) => formatDate(r.createdAt) },
      { key: 'processedAt', label: 'Processed', render: (r) => formatDate(r.processedAt) }
    ],
    toolbar: () => `<button class="btn btn-sm" data-new>${icon('plus')}<span>New payout</span></button>`,
    actions: (r) => (r.status === 'pending' ? act('process', r.id, 'Mark paid') : ''),
    bind: (root, reload) => {
      (root.querySelector('[data-new]') as HTMLElement).onclick = async () => {
        const drivers = await loadDrivers();
        await openModal({
          title: 'New payout',
          fields: [
            { name: 'driverId', label: 'Driver', type: 'select', options: drivers },
            { name: 'amount', label: 'Amount', type: 'number', step: '0.01', required: true },
            { name: 'method', label: 'Method', type: 'select', options: opts(['eft', 'cash', 'instant']) },
            { name: 'periodStart', label: 'Period start', type: 'date' },
            { name: 'periodEnd', label: 'Period end', type: 'date' }
          ],
          onSubmit: async (v) => {
            const r = await apiRequest('/admin/payouts', { method: 'POST', body: JSON.stringify(v) });
            if (!r.success) throw new Error(r.message);
            toast('Payout created', 'success');
            reload();
          }
        });
      };
      wire(root, {
        process: async (id) => {
          if (await confirmDialog('Mark this payout as paid?', { confirmLabel: 'Mark paid' })) {
            await apiRequest(`/admin/payouts/${id}/process`, { method: 'POST' });
            toast('Payout processed', 'success');
            reload();
          }
        }
      });
    }
  });
}

/* ------------------------------ payments ------------------------------- */
function renderPayments(c: HTMLElement) {
  crudView(c, {
    endpoint: '/payments',
    columns: [
      { key: 'id', label: 'Payment', render: (r) => esc(r.id.slice(0, 8)) },
      { key: 'orderId', label: 'Order', render: (r) => esc((r.orderId || '').slice(0, 8)) },
      { key: 'amount', label: 'Amount', render: (r) => money(r.amount) },
      { key: 'provider', label: 'Provider', render: (r) => badge(r.provider || 'payfast', 'info') },
      { key: 'status', label: 'Status', render: (r) => statusBadge(r.status) },
      { key: 'createdAt', label: 'Created', render: (r) => formatDate(r.createdAt) }
    ]
  });
}

/* ------------------------------- reports ------------------------------- */
async function renderReports(c: HTMLElement) {
  const res = await apiRequest('/reports/overview');
  if (!res.success) {
    c.innerHTML = `<div class="card"><p class="empty">${esc(res.message)}</p></div>`;
    return;
  }
  const d = res.data;
  c.innerHTML = `
    ${overviewStats(d)}
    ${renderOverviewCharts(d)}
    <div class="card">
      <h3>${icon('store')} Top stores</h3>
      ${tableSimple(['Store', 'Orders', 'Revenue'], (d.topStores || []).map((s: any) => [esc(s.name), String(s.orders), money(s.revenue)]))}
    </div>
    <div class="card">
      <h3>${icon('package')} Top products</h3>
      ${tableSimple(['Product', 'Qty', 'Revenue'], (d.topProducts || []).map((p: any) => [esc(p.name), String(p.qty), money(p.revenue)]))}
    </div>
    <div class="card">
      <h3>${icon('pie-chart')} Orders by status</h3>
      ${Object.entries(d.byStatus)
        .map(([s, n]) => `<div class="summary-row"><span>${titleCase(s)}</span><strong>${n}</strong></div>`)
        .join('')}
    </div>`;
}

/* ------------------------------- adverts ------------------------------- */
const PLACEMENT_OPTIONS = [
  { value: 'banner', label: 'Top banner' },
  { value: 'popup', label: 'Pop-up' },
  { value: 'section', label: 'Sponsored section' }
];
const MEDIA_TYPE_OPTIONS = [
  { value: 'image', label: 'Image' },
  { value: 'video', label: 'Video' },
  { value: 'link', label: 'External link' },
  { value: 'none', label: 'Text only' }
];

async function renderAds(c: HTMLElement) {
  const res = await apiRequest('/ads?all=true');
  const ads: Ad[] = res.success ? res.data : [];
  c.innerHTML = `
    <div class="toolbar">
      <div class="spacer"></div>
      <button class="btn btn-sm btn-ghost" id="resetAds" data-tip="Clear dismissed-ads memory on this device">${icon('rotate-ccw')}<span>Reset dismissals</span></button>
      <button class="btn btn-sm" id="newAd">${icon('plus')}<span>New advert</span></button>
    </div>
    <div class="card">${await platformAdsHtml()}</div>`;
  (document.getElementById('newAd') as HTMLElement).onclick = () => adModal(null, () => renderAds(c));
  (document.getElementById('resetAds') as HTMLElement).onclick = () => {
    resetDismissedAds();
    toast('Dismissed adverts cleared', 'success');
  };
  c.querySelectorAll('[data-ad-edit]').forEach((b) =>
    b.addEventListener('click', () => adModal(ads.find((a) => a.id === (b as HTMLElement).dataset.adEdit), () => renderAds(c)))
  );
  c.querySelectorAll('[data-ad-del]').forEach((b) =>
    b.addEventListener('click', async () => {
      if (await confirmDialog('Delete this advert?', { danger: true, confirmLabel: 'Delete' })) {
        await apiRequest(`/ads/${(b as HTMLElement).dataset.adDel}`, { method: 'DELETE' });
        invalidateAds();
        toast('Advert deleted', 'success');
        renderAds(c);
      }
    })
  );
}

function adModal(row: Ad | null | undefined, reload: () => void) {
  const placements = row?.placements || ['banner'];
  const mediaType = row?.mediaType || 'image';
  const isVideo = mediaType === 'video';
  return openModal({
    title: row ? 'Edit advert' : 'New advert',
    wide: true,
    fields: [
      { name: 'title', label: 'Title', required: true, value: row?.title },
      { name: 'body', label: 'Message', type: 'textarea', value: row?.body },
      { name: 'mediaType', label: 'Media type', type: 'select', options: MEDIA_TYPE_OPTIONS, value: mediaType },
      {
        name: 'mediaUrl',
        label: isVideo ? 'Video' : 'Image',
        type: isVideo ? 'video' : 'image',
        folder: 'ads',
        value: row?.mediaUrl,
        help: 'Upload a file, or switch Media type to "External link" and paste a URL below.'
      },
      { name: 'linkUrl', label: 'Link URL', value: row?.linkUrl, help: 'Where the call-to-action button points.' },
      { name: 'ctaLabel', label: 'Button label', value: row?.ctaLabel, placeholder: 'Learn more' },
      {
        name: 'audience',
        label: 'Audience',
        type: 'select',
        options: [{ value: 'all', label: 'Everyone' }, ...ROLE_OPTIONS],
        value: row?.audience || 'all'
      },
      { name: 'priority', label: 'Priority', type: 'number', value: row?.priority ?? 0, help: 'Higher shows first.' },
      { name: 'dismissible', label: 'Dismissible', type: 'checkbox', value: row ? row.dismissible !== false : true },
      { name: 'isActive', label: 'Active', type: 'checkbox', value: row ? row.isActive !== false : true },
      { name: 'startsAt', label: 'Starts', type: 'date', value: row?.startsAt ? String(row.startsAt).slice(0, 10) : '' },
      { name: 'endsAt', label: 'Ends', type: 'date', value: row?.endsAt ? String(row.endsAt).slice(0, 10) : '' }
    ],
    html: `<div class="form-group"><label>Placements</label><div>${PLACEMENT_OPTIONS.map(
      (p) =>
        `<label class="checkbox-inline"><input type="checkbox" name="placement_${p.value}" data-placement value="${p.value}" ${
          placements.includes(p.value as any) ? 'checked' : ''
        } /> ${esc(p.label)}</label>`
    ).join('')}</div><p class="empty" style="font-size:12px">Where the advert appears. Pick one or more.</p></div>`,
    onSubmit: async (v) => {
      const chosen = Array.from(
        document.querySelectorAll<HTMLInputElement>('[data-placement]:checked')
      ).map((el) => el.value);
      const payload: any = { ...v, placements: chosen.length ? chosen : ['banner'] };
      const res = row
        ? await apiRequest(`/ads/${row.id}`, { method: 'PUT', body: JSON.stringify(payload) })
        : await apiRequest('/ads', { method: 'POST', body: JSON.stringify(payload) });
      if (!res.success) throw new Error(res.message || 'Failed');
      invalidateAds();
      toast(row ? 'Advert updated' : 'Advert created', 'success');
      reload();
    }
  });
}

/* ---------------------------- announcements ---------------------------- */
async function renderAnnouncements(c: HTMLElement) {
  const res = await apiRequest('/admin/announcements');
  const rows = res.success ? res.data : [];
  c.innerHTML = `
    <div class="toolbar"><div class="spacer"></div><button class="btn btn-sm" id="newAnn">${icon('plus')}<span>New announcement</span></button></div>
    ${tableSimple(
      ['Title', 'Audience', 'Created', ''],
      rows.map((a: any) => [
        esc(a.title),
        badge(a.audience || 'all', 'info'),
        formatDate(a.createdAt),
        `<button class="link-btn danger" data-del="${esc(a.id)}">${icon('trash-2')}Delete</button>`
      ])
    )}`;
  (document.getElementById('newAnn') as HTMLElement).onclick = () =>
    openModal({
      title: 'New announcement',
      fields: [
        { name: 'title', label: 'Title', required: true },
        { name: 'body', label: 'Message', type: 'textarea' },
        {
          name: 'audience',
          label: 'Audience',
          type: 'select',
          options: [{ value: 'all', label: 'Everyone' }, ...ROLE_OPTIONS]
        },
        { name: 'sendNotification', label: 'Send in-app notification', type: 'checkbox', value: true }
      ],
      onSubmit: async (v) => {
        const r = await apiRequest('/admin/announcements', { method: 'POST', body: JSON.stringify(v) });
        if (!r.success) throw new Error(r.message);
        toast('Announcement published', 'success');
        renderAnnouncements(c);
      }
    });
  c.querySelectorAll('[data-del]').forEach((b) =>
    b.addEventListener('click', async () => {
      if (await confirmDialog('Delete this announcement?', { danger: true, confirmLabel: 'Delete' })) {
        await apiRequest(`/admin/announcements/${(b as HTMLElement).dataset.del}`, { method: 'DELETE' });
        renderAnnouncements(c);
      }
    })
  );
}

/* -------------------------------- audit -------------------------------- */
function renderAudit(c: HTMLElement) {
  crudView(c, {
    endpoint: '/admin/audit',
    searchPlaceholder: 'Search action, entity, actor…',
    columns: [
      { key: 'action', label: 'Action', render: (r) => badge(r.action, 'info') },
      { key: 'actorEmail', label: 'Actor' },
      { key: 'actorRole', label: 'Role' },
      { key: 'entityType', label: 'Entity' },
      { key: 'createdAt', label: 'When', render: (r) => new Date(r.createdAt).toLocaleString() }
    ]
  });
}

/* ------------------------------- settings ------------------------------ */
async function renderSettings(c: HTMLElement) {
  const res = await apiRequest('/settings');
  const s = res.success ? res.data.platform || {} : {};
  c.innerHTML = `
    <div class="card">
      <h3>Platform settings</h3>
      <div id="settingsForm"></div>
    </div>`;

  const fields: Field[] = [
    { name: 'platformName', label: 'Platform name', value: s.platformName },
    { name: 'supportEmail', label: 'Support email', type: 'email', value: s.supportEmail },
    { name: 'currency', label: 'Currency code', value: s.currency || 'ZAR' },
    { name: 'currencySymbol', label: 'Currency symbol', value: s.currencySymbol || 'R' },
    { name: 'deliveryFee', label: 'Delivery fee', type: 'number', step: '0.01', value: s.deliveryFee ?? 0 },
    { name: 'commissionPercent', label: 'Commission %', type: 'number', value: s.commissionPercent ?? 0 },
    { name: 'driverCommissionPercent', label: 'Driver share %', type: 'number', value: s.driverCommissionPercent ?? 80 },
    { name: 'minOrderAmount', label: 'Minimum order', type: 'number', value: s.minOrderAmount ?? 0 },
    { name: 'deliveryRadiusKm', label: 'Delivery radius (km)', type: 'number', value: s.deliveryRadiusKm ?? 15 },
    { name: 'maintenanceMode', label: 'Maintenance mode', type: 'checkbox', value: s.maintenanceMode === true },
    { name: 'allowRegistrations', label: 'Allow registrations', type: 'checkbox', value: s.allowRegistrations !== false }
  ];

  const host = document.getElementById('settingsForm')!;
  const form = document.createElement('form');
  form.innerHTML =
    fields
      .map((f) => {
        if (f.type === 'checkbox')
          return `<div class="form-group" style="display:flex;gap:10px;align-items:center"><input type="checkbox" name="${f.name}" id="s_${f.name}" ${f.value ? 'checked' : ''} style="width:auto"><label for="s_${f.name}" style="margin:0">${esc(f.label)}</label></div>`;
        return `<div class="form-group"><label for="s_${f.name}">${esc(f.label)}</label><input id="s_${f.name}" name="${f.name}" type="${f.type || 'text'}" value="${esc(f.value)}" ${f.step ? `step="${f.step}"` : ''}></div>`;
      })
      .join('') + `<button class="btn btn-sm" type="submit">${icon('check')}<span>Save settings</span></button>`;
  host.appendChild(form);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const value: any = {};
    for (const f of fields) {
      const el = form.querySelector(`[name="${f.name}"]`) as HTMLInputElement;
      value[f.name] = f.type === 'checkbox' ? el.checked : f.type === 'number' ? Number(el.value) : el.value;
    }
    const r = await apiRequest('/settings', { method: 'PUT', body: JSON.stringify({ scope: 'platform', key: 'general', value }) });
    if (r.success) toast('Settings saved', 'success');
    else toast(r.message || 'Failed', 'error');
  });

  await renderPlatformCommission(c);
}

/* ------------------------- referral commission -------------------------- */
async function renderPlatformCommission(c: HTMLElement) {
  const res = await apiRequest('/settings/commission');
  const s = res.success ? res.data.platform || {} : {};
  const host = document.createElement('div');
  host.className = 'card';
  host.innerHTML = `<h3>${icon('hand-coins')} Referral commission</h3>
    <p class="muted">Platform-wide defaults for the 3-level retail override. Companies may tune their own split, but the engine clamps every chain to the total and hard caps below.</p>
    <div id="platformCommissionForm"></div>`;
  c.appendChild(host);

  const fields = [
    { name: 'l1Percent', label: 'Level 1 (%)', value: s.l1Percent ?? 10 },
    { name: 'l2Percent', label: 'Level 2 (%)', value: s.l2Percent ?? 4 },
    { name: 'l3Percent', label: 'Level 3 (%)', value: s.l3Percent ?? 1 },
    { name: 'maxTotalPercent', label: 'Max chain total (%)', value: s.maxTotalPercent ?? 15 },
    { name: 'capPercent', label: 'Hard platform cap (%)', value: s.capPercent ?? 25 },
    { name: 'purchaseReferralPercent', label: 'Code / store purchase referral (%)', value: s.purchaseReferralPercent ?? 10 },
    { name: 'holdDays', label: 'Hold period (days)', value: s.holdDays ?? 7 }
  ];

  const form = document.createElement('form');
  form.innerHTML =
    fields
      .map(
        (f) =>
          `<div class="form-group"><label>${esc(f.label)}</label><input name="${f.name}" type="number" step="0.5" value="${esc(
            f.value
          )}"></div>`
      )
      .join('') + `<button class="btn btn-sm" type="submit">${icon('check')}<span>Save commission</span></button>`;

  (host.querySelector('#platformCommissionForm') as HTMLElement).appendChild(form);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const value: any = {};
    for (const f of fields) {
      value[f.name] = Number((form.querySelector(`[name="${f.name}"]`) as HTMLInputElement).value) || 0;
    }
    const r = await apiRequest('/settings/commission', {
      method: 'PUT',
      body: JSON.stringify({ scope: 'platform', key: 'commission', value })
    });
    if (r.success) toast('Commission saved', 'success');
    else toast(r.message || 'Failed', 'error');
  });
}

/* ------------------------------ plans ---------------------------------- */
function planEntitlementFields(p: any = {}): any[] {
  const f = p.features || {};
  return [
    { name: 'maxProducts', label: 'Max products', type: 'number', value: String(f.maxProducts ?? 10), help: '-1 = unlimited' },
    { name: 'maxStores', label: 'Max stores', type: 'number', value: String(f.maxStores ?? 1), help: '-1 = unlimited' },
    { name: 'maxTeamMembers', label: 'Max team seats', type: 'number', value: String(f.maxTeamMembers ?? 1), help: '-1 = unlimited' },
    { name: 'maxCodes', label: 'Max referral codes', type: 'number', value: String(f.maxCodes ?? 3), help: '-1 = unlimited' },
    {
      name: 'commissionLevels',
      label: 'Commission depth',
      type: 'select',
      value: String(f.commissionLevels ?? 1),
      options: [
        { value: '1', label: '1 level' },
        { value: '2', label: '2 levels' },
        { value: '3', label: '3 levels' }
      ]
    },
    { name: 'reports', label: 'Reports', type: 'select', value: f.reports || 'basic', options: [{ value: 'basic', label: 'Basic' }, { value: 'full', label: 'Full' }] },
    { name: 'payouts', label: 'Payouts (withdrawals)', type: 'checkbox', value: !!f.payouts },
    { name: 'autoship', label: 'Autoship', type: 'checkbox', value: !!f.autoship },
    { name: 'whiteLabel', label: 'White-label', type: 'checkbox', value: !!f.whiteLabel },
    { name: 'api', label: 'API access', type: 'checkbox', value: !!f.api },
    { name: 'webhooks', label: 'Webhooks', type: 'checkbox', value: !!f.webhooks }
  ];
}

function planFeaturesFrom(v: any) {
  return {
    maxProducts: v.maxProducts === null ? -1 : Number(v.maxProducts),
    maxStores: v.maxStores === null ? -1 : Number(v.maxStores),
    maxTeamMembers: v.maxTeamMembers === null ? -1 : Number(v.maxTeamMembers),
    maxCodes: v.maxCodes === null ? -1 : Number(v.maxCodes),
    commissionLevels: Number(v.commissionLevels) || 1,
    payouts: !!v.payouts,
    reports: v.reports === 'full' ? 'full' : 'basic',
    autoship: !!v.autoship,
    whiteLabel: !!v.whiteLabel,
    api: !!v.api,
    webhooks: !!v.webhooks
  };
}

function planLimit(r: any, key: string, fallback = 0): string {
  const f = r.features || {};
  const n = Number(f[key] ?? fallback);
  return n < 0 ? 'Unlimited' : String(n);
}

function renderPlans(c: HTMLElement) {
  let plans: any[] = [];
  crudView(c, {
    endpoint: '/plans',
    onData: (r) => {
      plans = r;
    },
    columns: [
      { key: 'name', label: 'Name' },
      { key: 'slug', label: 'Slug' },
      { key: 'baseFeeZar', label: 'Price / mo', render: (r) => money(r.baseFeeZar || 0) },
      { key: 'maxProducts', label: 'Products', render: (r) => planLimit(r, 'maxProducts', 10) },
      { key: 'maxStores', label: 'Stores', render: (r) => planLimit(r, 'maxStores', 1) },
      { key: 'commissionLevels', label: 'Commission', render: (r) => `${Number((r.features || {}).commissionLevels ?? 1)}-level` },
      { key: 'payouts', label: 'Payouts', render: (r) => ((r.features || {}).payouts ? 'Yes' : 'No') },
      { key: 'isDefault', label: 'Default', render: (r) => (r.isDefault ? 'Yes' : 'No') },
      { key: 'isActive', label: 'Active', render: (r) => statusBadge(r.isActive ? 'active' : 'inactive') }
    ],
    toolbar: () => `<button class="btn btn-sm" data-assign>${icon('building-2')}<span>Assign to company</span></button><button class="btn btn-sm" data-new>${icon('plus')}<span>New plan</span></button>`,
    actions: (r) => act('edit', r.id, 'Edit'),
    bind: (root, reload) => {
      (root.querySelector('[data-new]') as HTMLElement).onclick = async () => {
        await openModal({
          title: 'New plan',
          wide: true,
          fields: [
            { name: 'name', label: 'Name', required: true },
            { name: 'slug', label: 'Slug', help: 'Leave blank to derive from the name' },
            { name: 'baseFeeZar', label: 'Monthly fee (ZAR)', type: 'number', value: '0' },
            ...planEntitlementFields({}),
            { name: 'isDefault', label: 'Default plan for new companies', type: 'checkbox' },
            { name: 'sortOrder', label: 'Sort order', type: 'number', value: '0' }
          ],
          submitLabel: 'Create plan',
          onSubmit: async (v) => {
            const res = await apiRequest('/plans', {
              method: 'POST',
              body: JSON.stringify({
                name: v.name,
                slug: v.slug || undefined,
                baseFeeZar: v.baseFeeZar || 0,
                features: planFeaturesFrom(v),
                isDefault: !!v.isDefault,
                sortOrder: v.sortOrder || 0,
                isActive: true
              })
            });
            if (!res.success) throw new Error(res.message);
            toast('Plan created', 'success');
            reload();
          }
        });
      };
      (root.querySelector('[data-assign]') as HTMLElement).onclick = async () => {
        const companiesRes = await apiRequest('/companies?pageSize=100');
        const companyOpts = (companiesRes.data || []).map((x: any) => ({ value: x.id, label: x.name || String(x.id).slice(0, 8) }));
        if (!companyOpts.length) return toast('No companies yet', 'error');
        await openModal({
          title: 'Assign plan to company',
          wide: true,
          fields: [
            { name: 'companyId', label: 'Company', type: 'select', options: companyOpts, required: true },
            { name: 'planId', label: 'Plan', type: 'select', options: plans.map((p) => ({ value: p.id, label: `${p.name} — ${money(p.baseFeeZar || 0)}/mo` })) },
            { name: 'baseFeeZar', label: 'Override monthly fee (ZAR)', type: 'number', help: 'Leave blank to use the plan default' }
          ],
          onSubmit: async (v) => {
            const body: any = { companyId: v.companyId, planId: v.planId || null };
            if (v.baseFeeZar !== null && v.baseFeeZar !== '') body.baseFeeZar = v.baseFeeZar;
            const res = await apiRequest('/plans/assign', { method: 'POST', body: JSON.stringify(body) });
            if (!res.success) throw new Error(res.message);
            toast('Plan assigned', 'success');
          }
        });
      };
      wire(root, {
        edit: async (id) => {
          const p = plans.find((x) => x.id === id);
          if (!p) return;
          await openModal({
            title: 'Edit plan',
            wide: true,
            fields: [
              { name: 'name', label: 'Name', value: p.name },
              { name: 'tier', label: 'Tier', value: p.tier || '' },
              { name: 'baseFeeZar', label: 'Monthly fee (ZAR)', type: 'number', value: String(p.baseFeeZar ?? 0) },
              ...planEntitlementFields(p),
              { name: 'isDefault', label: 'Default plan for new companies', type: 'checkbox', value: !!p.isDefault },
              { name: 'sortOrder', label: 'Sort order', type: 'number', value: String(p.sortOrder ?? 0) },
              { name: 'isActive', label: 'Active', type: 'checkbox', value: p.isActive !== false }
            ],
            onSubmit: async (v) => {
              const res = await apiRequest(`/plans/${id}`, {
                method: 'PUT',
                body: JSON.stringify({
                  name: v.name,
                  tier: v.tier || undefined,
                  baseFeeZar: v.baseFeeZar || 0,
                  features: planFeaturesFrom(v),
                  isDefault: !!v.isDefault,
                  sortOrder: v.sortOrder || 0,
                  isActive: !!v.isActive
                })
              });
              if (!res.success) throw new Error(res.message);
              toast('Plan updated', 'success');
              reload();
            }
          });
        }
      });
    }
  });
}

/* ------------------------- code purchases ----------------------------- */
function renderCodePurchases(c: HTMLElement) {
  crudView(c, {
    endpoint: '/code-purchases',
    columns: [
      { key: 'code', label: 'Code' },
      { key: 'priceZar', label: 'Price (ZAR)', render: (r) => money(r.priceZar || 0) },
      { key: 'status', label: 'Status', render: (r) => statusBadge(r.status) },
      { key: 'paymentStatus', label: 'Payment', render: (r) => statusBadge(r.paymentStatus) },
      { key: 'createdAt', label: 'Created', render: (r) => formatDate(r.createdAt) }
    ],
    actions: (r) => (r.status === 'pending' ? act('complete', r.id, 'Complete') : ''),
    bind: (root, reload) => {
      wire(root, {
        complete: async (id) => {
          await apiRequest(`/code-purchases/${id}/complete`, { method: 'POST' });
          reload();
        }
      });
    }
  });
}

/* ----------------------- store purchases ----------------------------- */
function renderStorePurchases(c: HTMLElement) {
  crudView(c, {
    endpoint: '/store-purchases',
    columns: [
      { key: 'storeName', label: 'Store' },
      { key: 'priceZar', label: 'Price (ZAR)', render: (r) => money(r.priceZar || 0) },
      { key: 'status', label: 'Status', render: (r) => statusBadge(r.status) },
      { key: 'paymentStatus', label: 'Payment', render: (r) => statusBadge(r.paymentStatus) },
      { key: 'createdAt', label: 'Created', render: (r) => formatDate(r.createdAt) }
    ],
    actions: (r) => (r.status === 'pending' ? act('complete', r.id, 'Complete') : ''),
    bind: (root, reload) => {
      wire(root, {
        complete: async (id) => {
          await apiRequest(`/store-purchases/${id}/complete`, { method: 'POST' });
          reload();
        }
      });
    }
  });
}

/* ------------------------------ consent ------------------------------- */
function renderConsent(c: HTMLElement) {
  crudView(c, {
    endpoint: '/consent',
    columns: [
      { key: 'purpose', label: 'Purpose' },
      { key: 'granted', label: 'Granted', render: (r) => statusBadge(r.granted ? 'active' : 'inactive') },
      { key: 'grantedAt', label: 'Granted', render: (r) => formatDate(r.grantedAt) },
      { key: 'revokedAt', label: 'Revoked', render: (r) => formatDate(r.revokedAt) }
    ],
    actions: (r) => (r.granted ? act('revoke', r.id, 'Revoke', 'danger') : ''),
    bind: (root, reload) => {
      wire(root, {
        revoke: async (id) => {
          if (await confirmDialog('Revoke this consent?', { danger: true, confirmLabel: 'Revoke' })) {
            await apiRequest(`/consent/${id}/revoke`, { method: 'POST' });
            reload();
          }
        }
      });
    }
  });
}

/* ------------------------------- dsar --------------------------------- */
function renderDSAR(c: HTMLElement) {
  crudView(c, {
    endpoint: '/dsar',
    columns: [
      { key: 'type', label: 'Type', render: (r) => titleCase(r.type || 'access') },
      { key: 'status', label: 'Status', render: (r) => statusBadge(r.status) },
      { key: 'createdAt', label: 'Created', render: (r) => formatDate(r.createdAt) },
      { key: 'dueAt', label: 'Due', render: (r) => formatDate(r.dueAt) }
    ],
    actions: (r) => (r.status === 'completed' ? '' : act('process', r.id, 'Mark completed')),
    bind: (root, reload) => {
      wire(root, {
        process: async (id) => {
          if (await confirmDialog('Mark this request as completed?', { confirmLabel: 'Complete' })) {
            await apiRequest(`/dsar/${id}`, { method: 'PUT', body: JSON.stringify({ status: 'completed', response: 'Completed by platform admin.' }) });
            toast('Request completed', 'success');
            reload();
          }
        }
      });
    }
  });
}

/* ------------------------------ wallets ------------------------------ */
function renderWallets(c: HTMLElement) {
  crudView(c, {
    endpoint: '/wallets',
    columns: [
      { key: 'balanceZar', label: 'Balance (ZAR)', render: (r) => money(r.balanceZar || 0) },
      { key: 'pendingZar', label: 'Pending (ZAR)', render: (r) => money(r.pendingZar || 0) },
      { key: 'currency', label: 'Currency' },
      { key: 'createdAt', label: 'Created', render: (r) => formatDate(r.createdAt) }
    ]
  });
}

/* ---------------------------- commissions ---------------------------- */
function renderCommissions(c: HTMLElement) {
  crudView(c, {
    endpoint: '/commissions',
    columns: [
      { key: 'userId', label: 'User', render: (r) => esc((r.userId || '').slice(0, 8)) },
      { key: 'amountZar', label: 'Amount (ZAR)', render: (r) => money(r.amountZar || 0) },
      { key: 'bonusType', label: 'Bonus' },
      { key: 'status', label: 'Status', render: (r) => statusBadge(r.status) },
      { key: 'createdAt', label: 'Created', render: (r) => formatDate(r.createdAt) }
    ]
  });
}

/* ----------------------------- analytics ------------------------------ */
async function renderAnalytics(c: HTMLElement) {
  c.innerHTML = '<p class="empty">Loading…</p>';
  const [overview, retail, ltv] = await Promise.all([
    apiRequest('/analytics/overview').catch(() => null),
    apiRequest('/analytics/retail').catch(() => null),
    apiRequest('/analytics/ltv').catch(() => null)
  ]);
  const o = overview?.data || {};
  const r = retail?.data || {};
  const top = (ltv?.data || []) as any[];
  c.innerHTML = `
    ${statCards([
      { label: 'GMV (ZAR)', value: o.gmvZar || 0, format: 'money' },
      { label: 'GMV this month', value: o.gmvMonthZar || 0, format: 'money' },
      { label: 'Orders', value: o.orders?.total ?? 0 },
      { label: 'Completed', value: o.orders?.completed ?? 0 },
      { label: 'Avg order', value: o.avgOrderZar || 0, format: 'money' },
      { label: 'Active users', value: o.users?.active ?? 0 },
      { label: 'Distributor sales %', value: (r.distributorPct ?? 0) + '%' },
      { label: 'Distributor GMV', value: r.distributorGmvZar || 0, format: 'money' }
    ])}
    <div class="card">
      <h3>Top customers by lifetime value</h3>
      ${dataTable(
        [
          { key: 'userId', label: 'Customer', render: (x: any) => esc((x.userId || '').slice(0, 8)) },
          { key: 'orders', label: 'Orders', render: (x: any) => String(x.orders ?? '') },
          { key: 'ltvZar', label: 'LTV (ZAR)', render: (x: any) => money(x.ltvZar || 0) },
          { key: 'lastOrderAt', label: 'Last order', render: (x: any) => formatDate(x.lastOrderAt) }
        ],
        top,
        { empty: 'No data yet.' }
      )}
    </div>`;
}

/* ----------------------------- API keys ------------------------------- */
function renderApiKeys(c: HTMLElement) {
  crudView(c, {
    endpoint: '/api-keys',
    columns: [
      { key: 'name', label: 'Name' },
      { key: 'prefix', label: 'Prefix', render: (r) => esc(r.prefix + '…') },
      { key: 'scopes', label: 'Scopes', render: (r) => esc((r.scopes || []).join(', ')) },
      { key: 'lastUsedAt', label: 'Last used', render: (r) => formatDate(r.lastUsedAt) },
      { key: 'revokedAt', label: 'Status', render: (r) => statusBadge(r.revokedAt ? 'revoked' : 'active') },
      { key: 'createdAt', label: 'Created', render: (r) => formatDate(r.createdAt) }
    ],
    toolbar: () => `<button class="btn btn-sm" data-new>${icon('plus')}<span>New key</span></button>`,
    actions: (r) => (r.revokedAt ? act('delete', r.id, 'Delete', 'danger') : act('revoke', r.id, 'Revoke', 'danger')),
    bind: (root, reload) => {
      (root.querySelector('[data-new]') as HTMLElement).onclick = async () => {
        await openModal({
          title: 'New API key',
          fields: [
            { name: 'name', label: 'Name', required: true },
            { name: 'scopes', label: 'Scopes', value: 'read', help: 'Comma-separated, e.g. read,write,orders' }
          ],
          onSubmit: async (v: any) => {
            const scopes = String(v.scopes || 'read')
              .split(',')
              .map((x: string) => x.trim())
              .filter(Boolean);
            const res = await apiRequest('/api-keys', {
              method: 'POST',
              body: JSON.stringify({ name: v.name, scopes: scopes.length ? scopes : ['read'] })
            });
            if (!res.success) throw new Error(res.message);
            await openModal({
              title: 'Copy your API key',
              html: `<p class="empty">This key is shown once. Store it securely.</p><pre class="code-block" style="user-select:all">${esc(res.data.key)}</pre>`,
              submitLabel: 'Done',
              onSubmit: async () => {}
            });
            reload();
          }
        });
      };
      wire(root, {
        revoke: async (id) => {
          if (await confirmDialog('Revoke this API key?', { danger: true, confirmLabel: 'Revoke' })) {
            await apiRequest(`/api-keys/${id}/revoke`, { method: 'POST' });
            toast('Key revoked', 'success');
            reload();
          }
        },
        delete: async (id) => {
          if (await confirmDialog('Delete this key?', { danger: true, confirmLabel: 'Delete' })) {
            await apiRequest(`/api-keys/${id}`, { method: 'DELETE' });
            reload();
          }
        }
      });
    }
  });
}

/* ----------------------------- webhooks ------------------------------- */
function renderWebhooks(c: HTMLElement) {
  crudView(c, {
    endpoint: '/webhooks',
    columns: [
      { key: 'url', label: 'URL' },
      { key: 'events', label: 'Events', render: (r) => esc((r.events || []).join(', ')) },
      { key: 'active', label: 'Active', render: (r) => statusBadge(r.active ? 'active' : 'inactive') },
      { key: 'createdAt', label: 'Created', render: (r) => formatDate(r.createdAt) }
    ],
    toolbar: () => `<button class="btn btn-sm" data-new>${icon('plus')}<span>New webhook</span></button>`,
    actions: (r) => `${act('toggle', r.id, r.active ? 'Disable' : 'Enable')}${act('delete', r.id, 'Delete', 'danger')}`,
    bind: (root, reload) => {
      (root.querySelector('[data-new]') as HTMLElement).onclick = async () => {
        await openModal({
          title: 'New webhook',
          fields: [
            { name: 'url', label: 'HTTPS URL', required: true },
            { name: 'events', label: 'Events', value: '*', help: 'Comma-separated, e.g. order.created,order.completed or *' }
          ],
          onSubmit: async (v: any) => {
            const events = String(v.events || '*')
              .split(',')
              .map((x: string) => x.trim())
              .filter(Boolean);
            const res = await apiRequest('/webhooks', {
              method: 'POST',
              body: JSON.stringify({ url: v.url, events: events.length ? events : ['*'] })
            });
            if (!res.success) throw new Error(res.message);
            await openModal({
              title: 'Signing secret',
              html: `<p class="empty">Use this secret to verify the X-NetMark-Signature header.</p><pre class="code-block" style="user-select:all">${esc(res.data.secret)}</pre>`,
              submitLabel: 'Done',
              onSubmit: async () => {}
            });
            reload();
          }
        });
      };
      wire(root, {
        toggle: async (id) => {
          await apiRequest(`/webhooks/${id}/toggle`, { method: 'POST' });
          reload();
        },
        delete: async (id) => {
          if (await confirmDialog('Delete this webhook?', { danger: true, confirmLabel: 'Delete' })) {
            await apiRequest(`/webhooks/${id}`, { method: 'DELETE' });
            reload();
          }
        }
      });
    }
  });
}

/* -------------------------- feature flags ----------------------------- */
function renderFeatureFlags(c: HTMLElement) {
  let rows: any[] = [];
  crudView(c, {
    endpoint: '/feature-flags',
    columns: [
      { key: 'key', label: 'Key' },
      { key: 'enabled', label: 'Enabled', render: (r) => statusBadge(r.enabled ? 'active' : 'inactive') },
      { key: 'rolloutPercent', label: 'Rollout %' },
      { key: 'description', label: 'Description' },
      { key: 'tenantId', label: 'Tenant', render: (r) => (r.tenantId ? esc(String(r.tenantId).slice(0, 8)) : 'global') }
    ],
    toolbar: () => `<button class="btn btn-sm" data-new>${icon('plus')}<span>New flag</span></button>`,
    actions: (r) => `${act('toggle', r.id, r.enabled ? 'Disable' : 'Enable')}${act('delete', r.id, 'Delete', 'danger')}`,
    onData: (r) => {
      rows = r;
    },
    bind: (root, reload) => {
      (root.querySelector('[data-new]') as HTMLElement).onclick = async () => {
        await openModal({
          title: 'New feature flag',
          fields: [
            { name: 'key', label: 'Key', required: true },
            { name: 'description', label: 'Description' },
            { name: 'rolloutPercent', label: 'Rollout %', type: 'number', value: '100' }
          ],
          onSubmit: async (v) => {
            const res = await apiRequest('/feature-flags', {
              method: 'POST',
              body: JSON.stringify({ ...v, enabled: false })
            });
            if (!res.success) throw new Error(res.message);
            reload();
          }
        });
      };
      wire(root, {
        toggle: async (id) => {
          const row = rows.find((r) => r.id === id);
          await apiRequest(`/feature-flags/${id}`, {
            method: 'PUT',
            body: JSON.stringify({ enabled: !row?.enabled })
          });
          reload();
        },
        delete: async (id) => {
          if (await confirmDialog('Delete this flag?', { danger: true, confirmLabel: 'Delete' })) {
            await apiRequest(`/feature-flags/${id}`, { method: 'DELETE' });
            reload();
          }
        }
      });
    }
  });
}

/* --------------------------- payout batches --------------------------- */
function renderPayoutBatches(c: HTMLElement) {
  crudView(c, {
    endpoint: '/payouts',
    columns: [
      { key: 'companyId', label: 'Company', render: (r) => (r.companyId ? esc(String(r.companyId).slice(0, 8)) : 'All') },
      { key: 'totalZar', label: 'Total (ZAR)', render: (r) => money(r.totalZar || 0) },
      { key: 'currency', label: 'Currency' },
      { key: 'bankFormat', label: 'Format', render: (r) => esc(r.bankFormat || 'EFT') },
      { key: 'status', label: 'Status', render: (r) => statusBadge(r.status) },
      { key: 'createdAt', label: 'Created', render: (r) => formatDate(r.createdAt) }
    ],
    toolbar: () => `<button class="btn btn-sm" data-new>${icon('plus')}<span>New batch</span></button>`,
    bind: (root, reload) => {
      (root.querySelector('[data-new]') as HTMLElement).onclick = async () => {
        await openModal({
          title: 'New payout batch (EFT)',
          fields: [
            { name: 'totalZar', label: 'Total (ZAR)', type: 'number', step: '0.01', required: true }
          ],
          onSubmit: async (v) => {
            const res = await apiRequest('/payouts', { method: 'POST', body: JSON.stringify(v) });
            if (!res.success) throw new Error(res.message);
            toast('Payout batch created', 'success');
            reload();
          }
        });
      };
    }
  });
}
