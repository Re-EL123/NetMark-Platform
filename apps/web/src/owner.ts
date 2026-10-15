import { apiRequest } from './api';
import { initPanel, NavItem } from './app';
import { esc, statusBadge, badge, formatDate } from './render';
import { crudView } from './crud';
import { openModal, confirmDialog, toast, money, titleCase, statCards, Field } from './ui';

const ROLE_OPTIONS = ['storeOwner', 'distributor', 'driver', 'customer'].map((r) => ({
  value: r,
  label: titleCase(r)
}));

function opts(values: string[]) {
  return values.map((v) => ({ value: v, label: titleCase(v) }));
}
function act(a: string, id: string, label: string, cls = '') {
  return `<button data-act="${a}" data-id="${esc(id)}" class="${cls}">${esc(label)}</button>`;
}
function wire(root: HTMLElement, handlers: Record<string, (id: string) => void>) {
  root.querySelectorAll('[data-act]').forEach((btn) => {
    const el = btn as HTMLElement;
    el.onclick = () => handlers[el.dataset.act || '']?.(el.dataset.id || '');
  });
}

const nav: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'users', label: 'Team' },
  { id: 'stores', label: 'Stores' },
  { id: 'products', label: 'Products' },
  { id: 'orders', label: 'Orders' },
  { id: 'drivers', label: 'Drivers' },
  { id: 'appointments', label: 'Appointments' },
  { id: 'codes', label: 'Codes' },
  { id: 'payouts', label: 'Payouts', capability: 'payouts.read' },
  { id: 'reports', label: 'Reports' },
  { id: 'settings', label: 'Settings' }
];

initPanel({
  title: 'Company Admin',
  nav,
  render: async (route, ctx) => {
    ctx.titleEl.textContent = nav.find((n) => n.id === route)?.label || 'Company Admin';
    const c = ctx.container;
    if (route === 'dashboard') return dashboard(c);
    if (route === 'users') return users(c);
    if (route === 'stores') return stores(c);
    if (route === 'products') return products(c);
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
  const t = reportRes.success ? reportRes.data.totals : { revenue: 0, orders: 0, paidOrders: 0 };
  c.innerHTML = `
    ${company ? `<div class="card"><h2>${esc(company.name)}</h2><p>Company dashboard — manage your team, stores, products and orders.</p></div>` : ''}
    ${statCards([
      { label: 'Revenue', value: money(t.revenue), accent: true },
      { label: 'Orders', value: t.orders },
      { label: 'Paid orders', value: t.paidOrders }
    ])}
    <div class="card"><h3>Top products</h3>${tableSimple(
      ['Product', 'Qty', 'Revenue'],
      (reportRes.data?.topProducts || []).map((p: any) => [esc(p.name), String(p.qty), money(p.revenue)])
    )}</div>`;
}

function tableSimple(headers: string[], rows: string[][]) {
  if (!rows.length) return '<p class="empty">No records.</p>';
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
    toolbar: () => `<button class="btn btn-sm" data-new>+ Add team member</button>`,
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
    toolbar: () => `<button class="btn btn-sm" data-new>+ New store</button>`,
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
    toolbar: () => `<button class="btn btn-sm" data-new>+ New product</button>`,
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
  const storesRes = await apiRequest('/stores?pageSize=100');
  const storeOpts = [{ value: '', label: 'None' }, ...(storesRes.data || []).map((s: any) => ({ value: s.id, label: s.name }))];
  await openModal({
    title: row ? 'Edit product' : 'New product',
    fields: [
      { name: 'name', label: 'Name', required: true, value: row?.name },
      { name: 'price', label: 'Price', type: 'number', step: '0.01', value: row?.price ?? 0 },
      { name: 'stock', label: 'Stock', type: 'number', value: row?.stock ?? 0 },
      { name: 'category', label: 'Category', value: row?.category },
      { name: 'sku', label: 'SKU', value: row?.sku },
      { name: 'description', label: 'Description', type: 'textarea', value: row?.description },
      { name: 'image', label: 'Image URL', value: row?.image },
      { name: 'storeId', label: 'Store', type: 'select', options: storeOpts, value: row?.storeId || '' },
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
      { key: 'user', label: 'Driver', render: (r) => esc(r.user?.name || '—') },
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
    toolbar: () => `<button class="btn btn-sm" data-new>+ New code</button>`,
    actions: (r) => act('toggle', r.id, r.isActive ? 'Disable' : 'Enable') + act('delete', r.id, 'Delete', 'danger'),
    bind: (root, reload) => {
      (root.querySelector('[data-new]') as HTMLElement).onclick = () =>
        openModal({
          title: 'New distributor code',
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
    toolbar: () => `<button class="btn btn-sm" data-new>+ New payout</button>`,
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
  const d = res.data;
  c.innerHTML = `
    ${statCards([
      { label: 'Revenue', value: money(d.totals.revenue), accent: true },
      { label: 'Orders', value: d.totals.orders },
      { label: 'Avg order', value: money(d.totals.averageOrderValue) }
    ])}
    <div class="card"><h3>Top products</h3>${tableSimple(
      ['Product', 'Qty', 'Revenue'],
      (d.topProducts || []).map((p: any) => [esc(p.name), String(p.qty), money(p.revenue)])
    )}</div>
    <div class="card"><h3>Top stores</h3>${tableSimple(
      ['Store', 'Orders', 'Revenue'],
      (d.topStores || []).map((s: any) => [esc(s.name), String(s.orders), money(s.revenue)])
    )}</div>`;
}

async function settings(c: HTMLElement) {
  const res = await apiRequest('/settings');
  const s = res.success ? res.data.company || {} : {};
  c.innerHTML = `<div class="card"><h3>Company settings</h3><div id="settingsForm"></div></div>`;
  const fields: Field[] = [
    { name: 'address', label: 'Business address', value: s.address },
    { name: 'phone', label: 'Contact phone', value: s.phone },
    { name: 'deliveryFee', label: 'Delivery fee', type: 'number', step: '0.01', value: s.deliveryFee ?? '' },
    { name: 'deliveryRadiusKm', label: 'Delivery radius (km)', type: 'number', value: s.deliveryRadiusKm ?? '' }
  ];
  const host = document.getElementById('settingsForm')!;
  const form = document.createElement('form');
  form.innerHTML =
    fields
      .map(
        (f) =>
          `<div class="form-group"><label>${esc(f.label)}</label><input name="${f.name}" type="${f.type || 'text'}" value="${esc(f.value ?? '')}" ${f.step ? `step="${f.step}"` : ''}></div>`
      )
      .join('') + `<button class="btn btn-sm" type="submit">Save</button>`;
  host.appendChild(form);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const value: any = {};
    for (const f of fields) {
      const el = form.querySelector(`[name="${f.name}"]`) as HTMLInputElement;
      value[f.name] = f.type === 'number' ? (el.value === '' ? null : Number(el.value)) : el.value;
    }
    const r = await apiRequest('/settings', { method: 'PUT', body: JSON.stringify({ scope: 'company', value }) });
    toast(r.success ? 'Settings saved' : r.message || 'Failed', r.success ? 'success' : 'error');
  });
}
