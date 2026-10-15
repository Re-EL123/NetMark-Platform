import { apiRequest } from './api';
import { initPanel, NavItem } from './app';
import { esc, statusBadge, badge, formatDate } from './render';
import { crudView } from './crud';
import { openModal, confirmDialog, toast, money, titleCase, statCards } from './ui';

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
  { id: 'stores', label: 'My Stores', capability: 'stores.read' },
  { id: 'catalog', label: 'Catalog', capability: 'products.read' },
  { id: 'listings', label: 'My Store Products', capability: 'products.read' },
  { id: 'orders', label: 'Orders', capability: 'orders.read' },
  { id: 'appointments', label: 'Appointments', capability: 'appointments.read' },
  { id: 'reports', label: 'Reports', capability: 'reports.read' }
];

initPanel({
  title: 'Business Portal',
  nav,
  render: async (route, ctx) => {
    const c = ctx.container;
    ctx.titleEl.textContent = nav.find((n) => n.id === route)?.label || 'Business';
    if (route === 'dashboard') return dashboard(c);
    if (route === 'stores') return stores(c);
    if (route === 'catalog') return catalog(c);
    if (route === 'listings') return listings(c);
    if (route === 'orders') return orders(c);
    if (route === 'appointments') return appointments(c);
    if (route === 'reports') return reports(c);
  }
});

async function myStores(): Promise<any[]> {
  const res = await apiRequest('/stores?pageSize=100');
  return res.data || [];
}

async function dashboard(c: HTMLElement) {
  const res = await apiRequest('/reports/overview');
  const t = res.success ? res.data.totals : { revenue: 0, orders: 0 };
  c.innerHTML = `
    ${statCards([
      { label: 'Revenue', value: money(t.revenue), accent: true },
      { label: 'Orders', value: t.orders },
      { label: 'Paid orders', value: t.paidOrders || 0 }
    ])}
    <div class="card"><p>Browse the company catalog, add products to your store with your own retail price, and manage orders.</p></div>`;
}

function stores(c: HTMLElement) {
  let rows: any[] = [];
  crudView(c, {
    endpoint: '/stores',
    onData: (r) => (rows = r),
    columns: [
      { key: 'name', label: 'Name' },
      { key: 'isActive', label: 'Active', render: (r) => statusBadge(r.isActive ? 'active' : 'inactive') },
      { key: 'address', label: 'Address' }
    ],
    toolbar: () => `<button class="btn btn-sm" data-new>+ New store</button>`,
    actions: (r) => act('edit', r.id, 'Edit') + act('toggle', r.id, r.isActive ? 'Deactivate' : 'Activate'),
    bind: (root, reload) => {
      (root.querySelector('[data-new]') as HTMLElement).onclick = () =>
        openModal({
          title: 'New store',
          fields: [
            { name: 'name', label: 'Store name', required: true },
            { name: 'address', label: 'Address' }
          ],
          onSubmit: async (v) => {
            const res = await apiRequest('/stores', { method: 'POST', body: JSON.stringify(v) });
            if (!res.success) throw new Error(res.message || 'Failed');
            toast('Store created', 'success');
            reload();
          }
        });
      wire(root, {
        edit: (id) =>
          openModal({
            title: 'Edit store',
            fields: [
              { name: 'name', label: 'Store name', value: rows.find((r) => r.id === id)?.name },
              { name: 'address', label: 'Address', value: rows.find((r) => r.id === id)?.address }
            ],
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
  });
}

async function catalog(c: HTMLElement) {
  c.innerHTML = '<p class="empty">Loading catalog…</p>';
  const [prodRes, storeRes] = await Promise.all([apiRequest('/products?pageSize=100&isActive=true'), myStores()]);
  const products = prodRes.data || [];
  const stores = storeRes;

  const storeOpts = stores.map((s: any) => ({ value: s.id, label: s.name }));
  c.innerHTML = `
    <div class="card"><p class="empty">These are products published by companies. Add them to one of your stores and set your own selling price.</p></div>
    <div class="grid">
      ${products
        .map(
          (p: any) => `<div class="product-card">
        <div class="thumb">${p.image ? `<img src="${esc(p.image)}" alt="${esc(p.name)}">` : '🛍️'}</div>
        <div class="body">
          <div class="name">${esc(p.name)}</div>
          <div class="desc">${esc(p.description || p.category || '')}</div>
          <div class="price">Company price ${money(p.price)}</div>
          <button class="btn btn-sm" data-add="${esc(p.id)}" ${storeOpts.length ? '' : 'disabled'}>Add to my store</button>
        </div>
      </div>`
        )
        .join('')}
    </div>`;

  if (!storeOpts.length) {
    c.querySelectorAll('[data-add]').forEach((b) => ((b as HTMLButtonElement).title = 'Create a store first'));
  }

  c.querySelectorAll('[data-add]').forEach((b) =>
    b.addEventListener('click', () => {
      const productId = (b as HTMLElement).dataset.add!;
      const product = products.find((p: any) => p.id === productId);
      openModal({
        title: 'Add to my store',
        fields: [
          { name: 'storeId', label: 'Store', type: 'select', options: storeOpts, value: storeOpts[0]?.value },
          {
            name: 'price',
            label: 'Your selling price',
            type: 'number',
            step: '0.01',
            value: product?.price,
            help: `Company price ${money(product?.price)} — set a higher price to earn a margin.`
          }
        ],
        submitLabel: 'Add to store',
        onSubmit: async (v) => {
          const res = await apiRequest('/store-products', { method: 'POST', body: JSON.stringify({ productId, ...v }) });
          if (!res.success) throw new Error(res.message || 'Failed');
          toast('Added to store', 'success');
        }
      });
    })
  );
}

function listings(c: HTMLElement) {
  let rows: any[] = [];
  crudView(c, {
    endpoint: '/store-products',
    onData: (r) => (rows = r),
    columns: [
      { key: 'name', label: 'Product' },
      { key: 'storeName', label: 'Store' },
      { key: 'price', label: 'Retail', render: (r) => money(r.price) },
      { key: 'basePrice', label: 'Company', render: (r) => money(r.basePrice) },
      { key: 'margin', label: 'Margin', render: (r) => badge(money(r.margin), Number(r.margin) > 0 ? 'success' : 'neutral') },
      { key: 'isActive', label: 'Active', render: (r) => statusBadge(r.isActive ? 'active' : 'inactive') }
    ],
    actions: (r) => act('edit', r.id, 'Edit price') + act('toggle', r.id, r.isActive ? 'Hide' : 'Show') + act('remove', r.id, 'Remove', 'danger'),
    bind: (root, reload) => {
      wire(root, {
        edit: (id) => {
          const row = rows.find((r) => r.id === id);
          openModal({
            title: `Retail price — ${row?.name || ''}`,
            fields: [
              { name: 'price', label: 'Your retail price', type: 'number', step: '0.01', value: row?.price, help: `Company price ${money(row?.basePrice)}` }
            ],
            onSubmit: async (v) => {
              const res = await apiRequest(`/store-products/${id}`, { method: 'PUT', body: JSON.stringify(v) });
              if (!res.success) throw new Error(res.message || 'Failed');
              toast('Price updated', 'success');
              reload();
            }
          });
        },
        toggle: async (id) => {
          const row = rows.find((r) => r.id === id);
          await apiRequest(`/store-products/${id}`, { method: 'PUT', body: JSON.stringify({ isActive: !row?.isActive }) });
          reload();
        },
        remove: async (id) => {
          if (await confirmDialog('Remove this product from your store?', { danger: true, confirmLabel: 'Remove' })) {
            await apiRequest(`/store-products/${id}`, { method: 'DELETE' });
            toast('Removed', 'success');
            reload();
          }
        }
      });
    }
  });
}

function orders(c: HTMLElement) {
  let rows: any[] = [];
  const writable = true;
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
    actions: (r) => act('status', r.id, r.status === 'confirmed' ? 'Complete' : 'Confirm'),
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
