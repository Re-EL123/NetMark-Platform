import { apiRequest } from './api';
import { initPanel, NavItem, can } from './app';
import { esc, statusBadge, badge, formatDate } from './render';
import { crudView } from './crud';
import { openModal, toast, money, titleCase, statCards } from './ui';

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

function tableSimple(headers: string[], rows: string[][]) {
  if (!rows.length) return '<p class="empty">No records.</p>';
  return `<div class="table-wrap"><table><thead><tr>${headers.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows
    .map((r) => `<tr>${r.map((cell) => `<td>${cell}</td>`).join('')}</tr>`)
    .join('')}</tbody></table></div>`;
}

const nav: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'stores', label: 'Stores', capability: 'stores.read' },
  { id: 'products', label: 'Products', capability: 'products.read' },
  { id: 'orders', label: 'Orders', capability: 'orders.read' },
  { id: 'appointments', label: 'Appointments', capability: 'appointments.read' },
  { id: 'codes', label: 'Codes', capability: 'codes.read' },
  { id: 'reports', label: 'Reports', capability: 'reports.read' }
];

initPanel({
  title: 'Business Portal',
  nav,
  render: async (route, ctx) => {
    const c = ctx.container;
    ctx.titleEl.textContent = nav.find((n) => n.id === route)?.label || 'Business';
    if (route === 'dashboard') return dashboard(c);
    if (route === 'stores') return stores(c, ctx.user.role);
    if (route === 'products') return products(c);
    if (route === 'orders') return orders(c);
    if (route === 'appointments' && ctx.user.role === 'storeOwner') return appointments(c);
    if (route === 'codes' && ctx.user.role === 'distributor') return codes(c);
    if (route === 'reports') return reports(c);
  }
});

async function dashboard(c: HTMLElement) {
  const res = await apiRequest('/reports/overview');
  const t = res.success ? res.data.totals : { revenue: 0, orders: 0 };
  c.innerHTML = `
    ${statCards([
      { label: 'Revenue', value: money(t.revenue), accent: true },
      { label: 'Orders', value: t.orders },
      { label: 'Paid orders', value: t.paidOrders || 0 }
    ])}
    <div class="card"><p>Manage your stores, products, orders and customer appointments.</p></div>`;
}

function stores(c: HTMLElement, role: string) {
  let rows: any[] = [];
  crudView(c, {
    endpoint: '/stores',
    onData: (r) => (rows = r),
    columns: [
      { key: 'name', label: 'Name' },
      { key: 'isActive', label: 'Active', render: (r) => statusBadge(r.isActive ? 'active' : 'inactive') },
      { key: 'address', label: 'Address' }
    ],
    toolbar: role === 'storeOwner' ? () => `<button class="btn btn-sm" data-new>+ New store</button>` : undefined,
    actions: role === 'storeOwner' ? (r) => act('edit', r.id, 'Edit') + act('toggle', r.id, r.isActive ? 'Deactivate' : 'Activate') : undefined,
    bind: (root, reload) => {
      if (role === 'storeOwner') {
        (root.querySelector('[data-new]') as HTMLElement).onclick = () =>
          openModal({
            title: 'New store',
            fields: [
              { name: 'name', label: 'Store name', required: true },
              { name: 'address', label: 'Address' }
            ],
            onSubmit: async (v) => {
              await apiRequest('/stores', { method: 'POST', body: JSON.stringify(v) });
              toast('Store created', 'success');
              reload();
            }
          });
        wire(root, {
          edit: (id) =>
            openModal({
              title: 'Edit store',
              fields: [{ name: 'name', label: 'Store name', value: rows.find((r) => r.id === id)?.name }, { name: 'address', label: 'Address', value: rows.find((r) => r.id === id)?.address }],
              onSubmit: async (v) => {
                await apiRequest(`/stores/${id}`, { method: 'PUT', body: JSON.stringify(v) });
                toast('Store updated', 'success');
                reload();
              }
            }),
          toggle: async (id) => {
            await apiRequest(`/stores/${id}/toggle`, { method: 'POST' });
            reload();
          }
        });
      }
    }
  });
}

function products(c: HTMLElement) {
  let rows: any[] = [];
  const writable = can('products.write');
  crudView(c, {
    endpoint: '/products',
    onData: (r) => (rows = r),
    columns: [
      { key: 'name', label: 'Name' },
      { key: 'price', label: 'Price', render: (r) => money(r.price) },
      { key: 'stock', label: 'Stock' },
      { key: 'isActive', label: 'Active', render: (r) => statusBadge(r.isActive ? 'active' : 'inactive') }
    ],
    toolbar: writable ? () => `<button class="btn btn-sm" data-new>+ New product</button>` : undefined,
    actions: writable ? (r) => act('edit', r.id, 'Edit') + act('stock', r.id, 'Stock') : undefined,
    bind: (root, reload) => {
      if (!writable) return;
      (root.querySelector('[data-new]') as HTMLElement).onclick = () =>
        openModal({
          title: 'New product',
          fields: [
            { name: 'name', label: 'Name', required: true },
            { name: 'price', label: 'Price', type: 'number', step: '0.01' },
            { name: 'stock', label: 'Stock', type: 'number' },
            { name: 'category', label: 'Category' },
            { name: 'description', label: 'Description', type: 'textarea' },
            { name: 'isActive', label: 'Active', type: 'checkbox', value: true }
          ],
          onSubmit: async (v) => {
            await apiRequest('/products', { method: 'POST', body: JSON.stringify(v) });
            toast('Product created', 'success');
            reload();
          }
        });
      wire(root, {
        edit: (id) =>
          openModal({
            title: 'Edit product',
            fields: [
              { name: 'name', label: 'Name', value: rows.find((r) => r.id === id)?.name },
              { name: 'price', label: 'Price', type: 'number', step: '0.01', value: rows.find((r) => r.id === id)?.price },
              { name: 'stock', label: 'Stock', type: 'number', value: rows.find((r) => r.id === id)?.stock },
              { name: 'isActive', label: 'Active', type: 'checkbox', value: rows.find((r) => r.id === id)?.isActive !== false }
            ],
            onSubmit: async (v) => {
              await apiRequest(`/products/${id}`, { method: 'PUT', body: JSON.stringify(v) });
              toast('Product updated', 'success');
              reload();
            }
          }),
        stock: async (id) =>
          openModal({
            title: 'Adjust stock',
            fields: [{ name: 'delta', label: 'Change (+/-)', type: 'number', value: 0 }],
            onSubmit: async (v) => {
              await apiRequest(`/products/${id}/stock`, { method: 'POST', body: JSON.stringify(v) });
              toast('Stock updated', 'success');
              reload();
            }
          })
      });
    }
  });
}

function orders(c: HTMLElement) {
  let rows: any[] = [];
  const writable = can('orders.write');
  crudView(c, {
    endpoint: '/orders',
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
      { key: 'createdAt', label: 'Created', render: (r) => formatDate(r.createdAt) }
    ],
    actions: writable ? (r) => act('status', r.id, 'Status') : undefined,
    bind: (root, reload) => {
      wire(root, {
        status: async (id) =>
          openModal({
            title: 'Update order status',
            fields: [{ name: 'status', label: 'Status', type: 'select', options: opts(['pending', 'confirmed', 'ready', 'completed', 'cancelled']), value: rows.find((r) => r.id === id)?.orderStatus }],
            onSubmit: async (v) => {
              await apiRequest(`/orders/${id}/status`, { method: 'PUT', body: JSON.stringify(v) });
              toast('Updated', 'success');
              reload();
            }
          })
      });
    }
  });
}

function appointments(c: HTMLElement) {
  crudView(c, {
    endpoint: '/appointments',
    columns: [
      { key: 'service', label: 'Service' },
      { key: 'appointmentDate', label: 'Date', render: (r) => formatDate(r.appointmentDate) },
      { key: 'appointmentTime', label: 'Time' },
      { key: 'status', label: 'Status', render: (r) => statusBadge(r.status) }
    ],
    actions: (r) =>
      act(
        'status',
        r.id,
        r.status === 'confirmed' ? 'Complete' : 'Confirm'
      ),
    bind: (root, reload) => {
      wire(root, {
        status: async (id) => {
          await apiRequest(`/appointments/${id}/status`, { method: 'PUT', body: JSON.stringify({ status: 'confirmed' }) });
          reload();
        }
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
    actions: (r) => act('toggle', r.id, r.isActive ? 'Disable' : 'Enable'),
    bind: (root, reload) => {
      (root.querySelector('[data-new]') as HTMLElement).onclick = () =>
        openModal({
          title: 'New code',
          fields: [
            { name: 'code', label: 'Code', help: 'Leave blank to auto-generate' },
            { name: 'maxUses', label: 'Max uses', type: 'number' },
            { name: 'expiresAt', label: 'Expires', type: 'date' }
          ],
          onSubmit: async (v) => {
            await apiRequest('/codes', { method: 'POST', body: JSON.stringify(v) });
            toast('Code created', 'success');
            reload();
          }
        });
      wire(root, {
        toggle: async (id) => {
          await apiRequest(`/codes/${id}/toggle`, { method: 'POST' });
          reload();
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
      { label: 'Orders', value: d.totals.orders }
    ])}
    <div class="card"><h3>Top products</h3>${tableSimple(
      ['Product', 'Qty', 'Revenue'],
      (d.topProducts || []).map((p: any) => [esc(p.name), String(p.qty), money(p.revenue)])
    )}</div>`;
}
