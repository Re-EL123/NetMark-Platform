import { apiRequest } from './api';
import { initPanel, NavItem } from './app';
import { esc, statusBadge, badge, formatDate } from './render';
import { crudView } from './crud';
import { openModal, confirmDialog, toast, money, titleCase, emptyState, Field } from './ui';
import { icon, iconify } from './icons';
import { uploadFieldHtml, wireUploaders } from './upload';
import { overviewStats, renderOverviewCharts } from './dashboard';

const ROLE_OPTIONS = ['storeOwner', 'driver', 'customer'].map((r) => ({
  value: r,
  label: titleCase(r)
}));

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
  reset: 'refresh-cw'
};
function act(a: string, id: string, label: string, cls = '') {
  return `<button data-act="${a}" data-id="${esc(id)}" class="${cls}">${icon(ACT_ICON[a] || 'circle-dot')}<span>${esc(
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
  { id: 'users', label: 'Team', icon: 'users' },
  { id: 'stores', label: 'Stores', icon: 'store' },
  { id: 'products', label: 'Products', icon: 'package' },
  { id: 'listings', label: 'Store Listings', capability: 'products.read', icon: 'boxes' },
  { id: 'purchases', label: 'Purchase Orders', capability: 'orders.read', icon: 'shopping-bag' },
  { id: 'orders', label: 'Orders', icon: 'receipt' },
  { id: 'drivers', label: 'Drivers', icon: 'truck' },
  { id: 'appointments', label: 'Appointments', icon: 'calendar-clock' },
  { id: 'codes', label: 'Codes', icon: 'ticket-percent' },
  { id: 'payouts', label: 'Payouts', capability: 'payouts.read', icon: 'wallet' },
  { id: 'reports', label: 'Reports', icon: 'bar-chart-3' },
  { id: 'settings', label: 'Settings', icon: 'settings' }
];

initPanel({
  title: 'Company Admin',
  nav,
  tourIntro:
    'Your company control room. Manage your team, stores, products, drivers, codes that unlock your catalog for store owners, and payouts.',
  render: async (route, ctx) => {
    ctx.titleEl.textContent = nav.find((n) => n.id === route)?.label || 'Company Admin';
    const c = ctx.container;
    if (route === 'dashboard') return dashboard(c);
    if (route === 'users') return users(c);
    if (route === 'stores') return stores(c);
    if (route === 'products') return products(c);
    if (route === 'listings') return listings(c);
    if (route === 'purchases') return purchases(c);
    if (route === 'orders') return orders(c);
    if (route === 'drivers') return drivers(c);
    if (route === 'appointments') return appointments(c);
    if (route === 'codes') return codes(c);
    if (route === 'payouts') return payouts(c);
    if (route === 'reports') return reports(c);
    if (route === 'settings') return settings(c);
  }
});

async function dashboard(c: HTMLElement) {
  const [companyRes, reportRes] = await Promise.all([apiRequest('/companies'), apiRequest('/reports/overview')]);
  const company = companyRes.data?.[0];
  if (!reportRes.success) {
    c.innerHTML = emptyState(reportRes.message || 'Unable to load your dashboard.', 'alert-triangle');
    return;
  }
  const d = reportRes.data;
  c.innerHTML = `
    ${company ? `<div class="card"><h2>${esc(company.name)}</h2><p>Company dashboard — manage your team, stores, products and orders.</p></div>` : ''}
    ${overviewStats(d)}
    ${renderOverviewCharts(d)}
    <div class="card"><h3>${icon('package')} Top products</h3>${tableSimple(
      ['Product', 'Qty', 'Revenue'],
      (d.topProducts || []).map((p: any) => [esc(p.name), String(p.qty), money(p.revenue)])
    )}</div>`;
}

function tableSimple(headers: string[], rows: string[][]) {
  if (!rows.length) return emptyState('No records.', 'inbox');
  return `<div class="table-wrap"><table><thead><tr>${headers.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows
    .map((r) => `<tr>${r.map((cell) => `<td>${cell}</td>`).join('')}</tr>`)
    .join('')}</tbody></table></div>`;
}

function users(c: HTMLElement) {
  let rows: any[] = [];
  crudView(c, {
    endpoint: '/users',
    searchPlaceholder: 'Search team…',
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
      { key: 'lastLogin', label: 'Last login', render: (r) => formatDate(r.lastLogin) }
    ],
    toolbar: () => `<button class="btn btn-sm" data-new>${icon('plus')}<span>Add team member</span></button>`,
    actions: (r) => act('edit', r.id, 'Edit') + act('delete', r.id, 'Remove', 'danger'),
    bind: (root, reload) => {
      (root.querySelector('[data-new]') as HTMLElement).onclick = () => userModal(null, reload);
      wire(root, {
        edit: (id) => userModal(rows.find((r) => r.id === id), reload),
        delete: async (id) => {
          if (await confirmDialog('Remove this team member?', { danger: true, confirmLabel: 'Remove' })) {
            await apiRequest(`/users/${id}`, { method: 'DELETE' });
            reload();
          }
        }
      });
    }
  });
}

async function userModal(row: any, reload: () => void) {
  const fields: Field[] = [
    { name: 'name', label: 'Full name', required: true, value: row?.name },
    { name: 'email', label: 'Email', type: 'email', required: !row, value: row?.email },
    { name: 'phone', label: 'Phone', type: 'tel', value: row?.phone },
    { name: 'profileImage', label: 'Profile photo', type: 'image', folder: 'users', value: row?.profileImage },
    { name: 'role', label: 'Role', type: 'select', options: ROLE_OPTIONS, value: row?.role || 'customer' }
  ];
  if (!row) fields.push({ name: 'password', label: 'Password', type: 'password', help: 'Leave blank to auto-generate' });
  await openModal({
    title: row ? 'Edit team member' : 'Add team member',
    fields,
    onSubmit: async (v) => {
      const res = row
        ? await apiRequest(`/users/${row.id}`, { method: 'PUT', body: JSON.stringify(v) })
        : await apiRequest('/users', { method: 'POST', body: JSON.stringify(v) });
      if (!res.success) throw new Error(res.message || 'Failed');
      if (res.data?.temporaryPassword) alert(`Temporary password: ${res.data.temporaryPassword}`);
      toast('Saved', 'success');
      reload();
    }
  });
}

function stores(c: HTMLElement) {
  let rows: any[] = [];
  crudView(c, {
    endpoint: '/stores',
    searchPlaceholder: 'Search stores…',
    onData: (r) => (rows = r),
    columns: [
      { key: 'name', label: 'Name' },
      { key: 'address', label: 'Address' },
      { key: 'isActive', label: 'Active', render: (r) => statusBadge(r.isActive ? 'active' : 'inactive') }
    ],
    toolbar: () => `<button class="btn btn-sm" data-new>${icon('plus')}<span>New store</span></button>`,
    actions: (r) => act('edit', r.id, 'Edit') + act('toggle', r.id, r.isActive ? 'Deactivate' : 'Activate') + act('delete', r.id, 'Delete', 'danger'),
    bind: (root, reload) => {
      (root.querySelector('[data-new]') as HTMLElement).onclick = () => storeModal(null, reload);
      wire(root, {
        edit: (id) => storeModal(rows.find((r) => r.id === id), reload),
        toggle: async (id) => {
          await apiRequest(`/stores/${id}/toggle`, { method: 'POST' });
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
  await openModal({
    title: row ? 'Edit store' : 'New store',
    fields: [
      { name: 'name', label: 'Store name', required: true, value: row?.name },
      { name: 'logo', label: 'Store logo', type: 'image', folder: 'stores', value: row?.logo },
      { name: 'address', label: 'Address', value: row?.address }
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

function products(c: HTMLElement) {
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
  await openModal({
    title: row ? 'Edit product' : 'New product',
    fields: [
      { name: 'name', label: 'Name', required: true, value: row?.name },
      { name: 'price', label: 'Company price', type: 'number', step: '0.01', value: row?.price ?? 0, help: 'Wholesale price store owners buy at.' },
      { name: 'stock', label: 'Stock', type: 'number', value: row?.stock ?? 0 },
      { name: 'category', label: 'Category', value: row?.category },
      { name: 'sku', label: 'SKU', value: row?.sku },
      { name: 'description', label: 'Description', type: 'textarea', value: row?.description },
      { name: 'image', label: 'Image', type: 'image', folder: 'products', value: row?.image },
      { name: 'gallery', label: 'Gallery', type: 'gallery', folder: 'products', value: row?.gallery },
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

function listings(c: HTMLElement) {
  crudView(c, {
    endpoint: '/store-products',
    searchPlaceholder: 'Search listings…',
    columns: [
      { key: 'name', label: 'Product' },
      { key: 'storeName', label: 'Store' },
      { key: 'price', label: 'Retail', render: (r) => money(r.price) },
      { key: 'basePrice', label: 'Company', render: (r) => money(r.basePrice) },
      { key: 'margin', label: 'Store margin', render: (r) => money(r.margin) },
      { key: 'isActive', label: 'Active', render: (r) => statusBadge(r.isActive ? 'active' : 'inactive') }
    ]
  });
}

function purchases(c: HTMLElement) {
  crudView(c, {
    endpoint: '/purchases',
    searchPlaceholder: 'Search purchase orders…',
    columns: [
      { key: 'reference', label: 'Reference', render: (r) => badge(r.reference || String(r.id).slice(0, 8), 'info') },
      { key: 'items', label: 'Items', render: (r) => String((r.items || []).length) },
      { key: 'total', label: 'Total', render: (r) => money(r.total) },
      { key: 'paymentStatus', label: 'Payment', render: (r) => statusBadge(r.paymentStatus) },
      { key: 'status', label: 'Status', render: (r) => statusBadge(r.status) },
      { key: 'createdAt', label: 'Created', render: (r) => formatDate(r.createdAt) }
    ],
    actions: (r) => {
      let html = '';
      if (r.status === 'pending') html += act('confirm', r.id, 'Confirm');
      if (r.status === 'confirmed') html += act('ready', r.id, 'Mark ready');
      if (r.status === 'ready') html += act('complete', r.id, 'Complete');
      if (r.paymentStatus !== 'paid' && r.status !== 'cancelled') html += act('paid', r.id, 'Mark paid');
      return html;
    },
    bind: (root, reload) => {
      const setStatus = async (id: string, status: string) => {
        const res = await apiRequest(`/purchases/${id}/status`, { method: 'PUT', body: JSON.stringify({ status }) });
        if (!res.success) return toast(res.message || 'Failed', 'error');
        reload();
      };
      wire(root, {
        confirm: (id) => setStatus(id, 'confirmed'),
        ready: (id) => setStatus(id, 'ready'),
        complete: (id) => setStatus(id, 'completed'),
        paid: async (id) => {
          const res = await apiRequest(`/purchases/${id}/payment-status`, { method: 'PUT', body: JSON.stringify({ paymentStatus: 'paid' }) });
          if (!res.success) return toast(res.message || 'Failed', 'error');
          reload();
        }
      });
    }
  });
}

function orders(c: HTMLElement) {
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
    actions: (r) => act('status', r.id, 'Status') + act('assign', r.id, 'Assign'),
    bind: (root, reload) => {
      wire(root, {
        status: async (id) =>
          openModal({
            title: 'Update order status',
            fields: [{ name: 'status', label: 'Status', type: 'select', options: opts(['pending', 'confirmed', 'ready', 'completed', 'cancelled']), value: rows.find((r) => r.id === id)?.orderStatus }],
            onSubmit: async (v) => {
              const res = await apiRequest(`/orders/${id}/status`, { method: 'PUT', body: JSON.stringify(v) });
              if (!res.success) throw new Error(res.message);
              toast('Order updated', 'success');
              reload();
            }
          }),
        assign: async (id) => {
          const res = await apiRequest('/drivers?status=approved&pageSize=100');
          const drivers = (res.data || []).map((d: any) => ({ value: d.id, label: d.user?.name || d.id.slice(0, 8) }));
          if (!drivers.length) return toast('No approved drivers', 'error');
          await openModal({
            title: 'Assign driver',
            fields: [{ name: 'driverId', label: 'Driver', type: 'select', options: drivers }],
            onSubmit: async (v) => {
              const r = await apiRequest(`/orders/${id}/assign`, { method: 'POST', body: JSON.stringify(v) });
              if (!r.success) throw new Error(r.message);
              toast('Driver assigned', 'success');
              reload();
            }
          });
        }
      });
    }
  });
}

function drivers(c: HTMLElement) {
  crudView(c, {
    endpoint: '/drivers',
    filters: () => [{ name: 'status', label: 'Status', options: opts(['pending', 'approved', 'rejected', 'suspended']) }],
    columns: [
      { key: 'user', label: 'Driver', render: (r) => esc(r.user?.name || '') },
      { key: 'vehicleNumber', label: 'Vehicle' },
      { key: 'status', label: 'Status', render: (r) => statusBadge(r.status) },
      { key: 'isAvailable', label: 'Online', render: (r) => statusBadge(r.isAvailable ? 'active' : 'inactive') }
    ],
    actions: (r) => act('approve', r.id, 'Approve') + act('reject', r.id, 'Reject', 'danger'),
    bind: (root, reload) => {
      wire(root, {
        approve: async (id) => {
          await apiRequest(`/drivers/${id}/approve`, { method: 'POST' });
          reload();
        },
        reject: async (id) => {
          if (await confirmDialog('Reject this driver?', { danger: true, confirmLabel: 'Reject' })) {
            await apiRequest(`/drivers/${id}/reject`, { method: 'POST' });
            reload();
          }
        }
      });
    }
  });
}

function appointments(c: HTMLElement) {
  crudView(c, {
    endpoint: '/appointments',
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
        set: async (id) =>
          openModal({
            title: 'Update appointment',
            fields: [{ name: 'status', label: 'Status', type: 'select', options: opts(['pending', 'confirmed', 'completed', 'cancelled', 'no_show']) }],
            onSubmit: async (v) => {
              await apiRequest(`/appointments/${id}/status`, { method: 'PUT', body: JSON.stringify(v) });
              toast('Updated', 'success');
              reload();
            }
          })
      });
    }
  });
}

function codes(c: HTMLElement) {
  crudView(c, {
    endpoint: '/codes',
    columns: [
      { key: 'code', label: 'Code', render: (r) => badge(r.code, 'info') },
      { key: 'uses', label: 'Uses', render: (r) => `${r.uses || 0}${r.maxUses ? ' / ' + r.maxUses : ''}` },
      { key: 'isActive', label: 'Active', render: (r) => statusBadge(r.isActive ? 'active' : 'inactive') }
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

function payouts(c: HTMLElement) {
  crudView(c, {
    endpoint: '/admin/payouts',
    columns: [
      { key: 'amount', label: 'Amount', render: (r) => money(r.amount) },
      { key: 'method', label: 'Method', render: (r) => titleCase(r.method || 'eft') },
      { key: 'status', label: 'Status', render: (r) => statusBadge(r.status) },
      { key: 'createdAt', label: 'Created', render: (r) => formatDate(r.createdAt) }
    ],
    toolbar: () => `<button class="btn btn-sm" data-new>${icon('plus')}<span>New payout</span></button>`,
    actions: (r) => (r.status === 'paid' ? '' : act('process', r.id, 'Mark paid')),
    bind: (root, reload) => {
      (root.querySelector('[data-new]') as HTMLElement).onclick = async () => {
        const res = await apiRequest('/drivers?status=approved&pageSize=100');
        const drivers = (res.data || []).map((d: any) => ({ value: d.id, label: d.user?.name || d.id.slice(0, 8) }));
        if (!drivers.length) return toast('No approved drivers yet', 'error');
        await openModal({
          title: 'New payout',
          fields: [
            { name: 'driverId', label: 'Driver', type: 'select', options: drivers },
            { name: 'amount', label: 'Amount', type: 'number', step: '0.01', required: true },
            { name: 'method', label: 'Method', type: 'select', options: opts(['eft', 'cash', 'wallet']) },
            { name: 'periodStart', label: 'Period start', type: 'date' },
            { name: 'periodEnd', label: 'Period end', type: 'date' },
            { name: 'notes', label: 'Notes', type: 'textarea' }
          ],
          onSubmit: async (v) => {
            const r = await apiRequest('/admin/payouts', { method: 'POST', body: JSON.stringify(v) });
            if (!r.success) throw new Error(r.message || 'Failed');
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

async function reports(c: HTMLElement) {
  const res = await apiRequest('/reports/overview');
  if (!res.success) {
    c.innerHTML = emptyState(res.message || 'Unable to load reports.', 'alert-triangle');
    return;
  }
  const d = res.data;
  c.innerHTML = `
    ${overviewStats(d)}
    ${renderOverviewCharts(d)}
    <div class="card"><h3>${icon('package')} Top products</h3>${tableSimple(
      ['Product', 'Qty', 'Revenue'],
      (d.topProducts || []).map((p: any) => [esc(p.name), String(p.qty), money(p.revenue)])
    )}</div>
    <div class="card"><h3>${icon('store')} Top stores</h3>${tableSimple(
      ['Store', 'Orders', 'Revenue'],
      (d.topStores || []).map((s: any) => [esc(s.name), String(s.orders), money(s.revenue)])
    )}</div>`;
}

async function settings(c: HTMLElement) {
  const [res, coRes, crRes] = await Promise.all([
    apiRequest('/settings'),
    apiRequest('/companies'),
    apiRequest('/company-changes')
  ]);
  const s = res.success ? res.data.company || {} : {};
  const company = coRes.success ? (coRes.data || [])[0] : null;
  const requests: any[] = crRes.success ? crRes.data || [] : [];
  const pending = requests.find((r) => r.status === 'pending');
  const lastReview = pending ? null : requests[0];

  const changeLines = (changes: any) => {
    const out: string[] = [];
    if (changes?.name !== undefined) out.push(`Name: <strong>${esc(changes.name)}</strong>`);
    if (changes?.logo) out.push('Logo: updated');
    const st = changes?.settings || {};
    if (st.address !== undefined) out.push(`Address: <strong>${esc(st.address || '')}</strong>`);
    if (st.phone !== undefined) out.push(`Phone: <strong>${esc(st.phone || '')}</strong>`);
    if (st.deliveryFee !== undefined) out.push(`Delivery fee: <strong>${money(st.deliveryFee)}</strong>`);
    if (st.deliveryRadiusKm !== undefined) out.push(`Delivery radius: <strong>${esc(st.deliveryRadiusKm)} km</strong>`);
    return out.length ? out.join('<br>') : '<span class="muted">No field changes</span>';
  };

  let statusCard = '';
  if (pending) {
    statusCard = `<div class="card callout callout-warning"><h3>${icon('clock')} Awaiting approval</h3>
      <p class="muted">Submitted ${esc(formatDate(pending.createdAt))}. These changes take effect once a platform admin approves them.</p>
      <div class="callout-body">${changeLines(pending.changes)}</div></div>`;
  } else if (lastReview) {
    const okReview = lastReview.status === 'approved';
    statusCard = `<div class="card callout ${okReview ? 'callout-success' : 'callout-danger'}"><h3>${icon(
      okReview ? 'check-circle' : 'x-circle'
    )} Last request ${okReview ? 'approved' : 'rejected'}</h3>
      <p class="muted">${esc(formatDate(lastReview.reviewedAt || lastReview.createdAt))}${
        lastReview.reviewNote ? ` — ${esc(lastReview.reviewNote)}` : ''
      }</p></div>`;
  }

  c.innerHTML = `${statusCard}<div class="card"><h3>Company details</h3>
    <p class="muted">Changes are submitted for platform approval before they go live.</p>
    <div id="settingsForm"></div></div>`;

  const fields: Field[] = [
    { name: 'name', label: 'Company name', value: company?.name },
    { name: 'address', label: 'Business address', value: s.address },
    { name: 'phone', label: 'Contact phone', value: s.phone },
    { name: 'deliveryFee', label: 'Delivery fee', type: 'number', step: '0.01', value: s.deliveryFee ?? '' },
    { name: 'deliveryRadiusKm', label: 'Delivery radius (km)', type: 'number', value: s.deliveryRadiusKm ?? '' }
  ];
  const host = document.getElementById('settingsForm')!;
  const form = document.createElement('form');
  form.innerHTML =
    uploadFieldHtml({ name: 'logo', label: 'Company logo', kind: 'image', folder: 'companies', value: company?.logo }) +
    fields
      .map(
        (f) =>
          `<div class="form-group"><label>${esc(f.label)}</label><input name="${f.name}" type="${f.type || 'text'}" value="${esc(f.value ?? '')}" ${f.step ? `step="${f.step}"` : ''}></div>`
      )
      .join('') + `<button class="btn btn-sm" type="submit">${icon('send')}<span>Submit for approval</span></button>`;
  host.appendChild(form);
  iconify(form);
  wireUploaders(form);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const settingsValue: any = {};
    for (const f of fields) {
      if (f.name === 'name') continue;
      const el = form.querySelector(`[name="${f.name}"]`) as HTMLInputElement;
      settingsValue[f.name] = f.type === 'number' ? (el.value === '' ? null : Number(el.value)) : el.value;
    }
    const name = (form.querySelector('[name="name"]') as HTMLInputElement)?.value || '';
    const logo = (form.querySelector('[name="logo"]') as HTMLInputElement)?.value || '';
    const r = await apiRequest('/company-changes', {
      method: 'POST',
      body: JSON.stringify({ changes: { name, logo, settings: settingsValue } })
    });
    toast(r.success ? 'Submitted for approval' : r.message || 'Failed', r.success ? 'success' : 'error');
    if (r.success) settings(c);
  });
}
