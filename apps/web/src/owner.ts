import { apiRequest, submitPayFast } from './api';
import { initPanel, NavItem } from './app';
import { esc, statusBadge, badge, formatDate } from './render';
import { crudView } from './crud';
import { openModal, confirmDialog, toast, money, titleCase, emptyState, statCards, act, wire, tableSimple, Field } from './ui';
import { icon, iconify } from './icons';
import { uploadFieldHtml, wireUploaders } from './upload';
import { overviewStats, renderOverviewCharts } from './dashboard';
import { getMyReferralCode, shareLink, shareUrl } from './referral';
import { renderReferrals } from './referralsView';
import { renderWallet } from './walletView';

const ROLE_OPTIONS = ['storeOwner', 'driver', 'customer'].map((r) => ({
  value: r,
  label: titleCase(r)
}));

function opts(values: string[]) {
  return values.map((v) => ({ value: v, label: titleCase(v) }));
}

const nav: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', group: 'Overview', icon: 'layout-dashboard' },
  { id: 'users', label: 'Team', group: 'Organisation', icon: 'users' },
  { id: 'stores', label: 'Stores', group: 'Organisation', icon: 'store' },
  { id: 'drivers', label: 'Drivers', group: 'Organisation', icon: 'truck' },
  { id: 'appointments', label: 'Appointments', group: 'Organisation', icon: 'calendar-clock' },
  { id: 'products', label: 'Products', group: 'Catalog', icon: 'package' },
  { id: 'listings', label: 'Store Listings', group: 'Catalog', capability: 'products.read', icon: 'boxes' },
  { id: 'codes', label: 'Codes', group: 'Catalog', icon: 'ticket-percent' },
  { id: 'purchases', label: 'Purchase Orders', group: 'Sales', capability: 'orders.read', icon: 'shopping-bag' },
  { id: 'orders', label: 'Orders', group: 'Sales', icon: 'receipt' },
  { id: 'referrals', label: 'Referrals', group: 'Growth', capability: 'referrals.read', icon: 'share-2' },
  { id: 'network', label: 'Network', group: 'Growth', capability: 'referrals.read', icon: 'users' },
  { id: 'billing', label: 'Billing', group: 'Finance', icon: 'credit-card' },
  { id: 'wallet', label: 'Wallet', group: 'Finance', icon: 'wallet' },
  { id: 'commissions', label: 'Commissions', group: 'Finance', icon: 'banknote' },
  { id: 'payouts', label: 'Payouts', group: 'Finance', capability: 'payouts.read', icon: 'wallet' },
  { id: 'reports', label: 'Reports', group: 'Finance', icon: 'bar-chart-3' },
  { id: 'settings', label: 'Settings', group: 'System', icon: 'settings' }
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
    if (route === 'referrals') return renderReferrals(c);
    if (route === 'network') return network(c);
    if (route === 'billing') return billing(c);
    if (route === 'wallet') return wallet(c);
    if (route === 'commissions') return commissions(c);
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
    actions: (r) => act('share', r.id, 'Share') + act('edit', r.id, 'Edit') + act('toggle', r.id, r.isActive ? 'Deactivate' : 'Activate') + act('delete', r.id, 'Delete', 'danger'),
    bind: (root, reload) => {
      (root.querySelector('[data-new]') as HTMLElement).onclick = () => storeModal(null, reload);
      wire(root, {
        share: async (id) => {
          const row = rows.find((r) => r.id === id);
          const code = await getMyReferralCode();
          await shareLink(shareUrl('shop/', code), row?.name || 'NetMark store', `Shop ${row?.name || ''} on NetMark`.trim());
        },
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
    actions: (r) => act('share', r.id, 'Share') + act('edit', r.id, 'Edit') + act('stock', r.id, 'Stock') + act('delete', r.id, 'Delete', 'danger'),
    bind: (root, reload) => {
      (root.querySelector('[data-new]') as HTMLElement).onclick = () => productModal(null, reload);
      wire(root, {
        share: async (id) => {
          const row = rows.find((r) => r.id === id);
          const code = await getMyReferralCode();
          await shareLink(shareUrl('shop/', code), row?.name || 'NetMark product', `Check out ${row?.name || 'this product'} on NetMark`);
        },
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
  let rows: any[] = [];
  const marketFields = (row?: any): Field[] => [
    {
      name: 'priceZar',
      label: 'Price for store owners (ZAR)',
      type: 'number',
      step: '0.01',
      min: '0',
      value: row?.priceZar ?? 0,
      help: 'What a store owner pays to buy this code.'
    },
    {
      name: 'isForSale',
      label: 'List for sale to store owners',
      type: 'checkbox',
      value: row ? !!row.isForSale : false,
      help: 'Store owners see for-sale codes under Buy Codes in the business portal.'
    }
  ];
  crudView(c, {
    endpoint: '/codes',
    onData: (r) => {
      rows = r;
    },
    columns: [
      { key: 'code', label: 'Code', render: (r) => badge(r.code, 'info') },
      { key: 'uses', label: 'Uses', render: (r) => `${r.uses || 0}${r.maxUses ? ' / ' + r.maxUses : ''}` },
      { key: 'priceZar', label: 'Price', render: (r) => money(r.priceZar || 0) },
      {
        key: 'isForSale',
        label: 'For sale',
        render: (r) => (r.purchased ? badge('Sold', 'neutral') : r.isForSale ? badge('For sale', 'success') : badge('Internal', 'neutral'))
      },
      { key: 'isActive', label: 'Active', render: (r) => statusBadge(r.isActive ? 'active' : 'inactive') }
    ],
    toolbar: () => `<button class="btn btn-sm" data-new>${icon('plus')}<span>New code</span></button>`,
    actions: (r) =>
      act('share', r.id, 'Share') +
      act('edit', r.id, 'Edit') +
      act('toggle', r.id, r.isActive ? 'Disable' : 'Enable') +
      act('delete', r.id, 'Delete', 'danger'),
    bind: (root, reload) => {
      (root.querySelector('[data-new]') as HTMLElement).onclick = () =>
        openModal({
          title: 'New referral code',
          fields: [
            { name: 'code', label: 'Code', help: 'Leave blank to auto-generate' },
            ...marketFields(),
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
        share: async (id) => {
          const row = rows.find((r) => r.id === id);
          if (!row?.code) return;
          await shareLink(shareUrl('register.html', row.code), 'Join NetMark', `Use code ${row.code} to join NetMark`);
        },
        edit: (id) => {
          const row = rows.find((r) => r.id === id);
          if (!row) return;
          openModal({
            title: `Edit code ${row.code}`,
            fields: [...marketFields(row)],
            onSubmit: async (v) => {
              const res = await apiRequest(`/codes/${id}`, { method: 'PUT', body: JSON.stringify(v) });
              if (!res.success) throw new Error(res.message);
              toast('Code updated', 'success');
              reload();
            }
          });
        },
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

  await commissionCard(c);
}

/* ----------------------------- commission ------------------------------ */
async function commissionCard(c: HTMLElement) {
  const res = await apiRequest('/settings/commission');
  const comm = res.success ? { ...(res.data.platform || {}), ...(res.data.company || {}) } : {};
  const host = document.createElement('div');
  host.className = 'card';
  host.innerHTML = `<h3>${icon('hand-coins')} Commission split</h3>
    <p class="muted">How much of each product sale flows up your referral chain (level 1 → 3). The total is capped by the platform.</p>
    <div id="commissionFields"></div>`;
  c.appendChild(host);

  const fields = [
    { name: 'l1Percent', label: 'Level 1 (%)', value: comm.l1Percent ?? 10 },
    { name: 'l2Percent', label: 'Level 2 (%)', value: comm.l2Percent ?? 4 },
    { name: 'l3Percent', label: 'Level 3 (%)', value: comm.l3Percent ?? 1 },
    { name: 'purchaseReferralPercent', label: 'Code / store purchase referral (%)', value: comm.purchaseReferralPercent ?? 10 },
    { name: 'holdDays', label: 'Hold period (days)', value: comm.holdDays ?? 7 }
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
      .join('') +
    `<p class="muted">Chain total capped at ${esc(comm.maxTotalPercent ?? 15)}% · platform hard cap ${esc(
      comm.capPercent ?? 25
    )}%</p>
    <button class="btn btn-sm" type="submit">${icon('check')}<span>Save commission</span></button>`;

  (host.querySelector('#commissionFields') as HTMLElement).appendChild(form);
  iconify(form);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const value: any = {};
    for (const f of fields) {
      value[f.name] = Number((form.querySelector(`[name="${f.name}"]`) as HTMLInputElement).value) || 0;
    }
    const r = await apiRequest('/settings/commission', { method: 'PUT', body: JSON.stringify({ value }) });
    toast(r.success ? 'Commission updated' : r.message || 'Failed', r.success ? 'success' : 'error');
  });
}

/* -------------------------------- network ------------------------------ */
function network(c: HTMLElement) {
  let rows: any[] = [];
  crudView(c, {
    endpoint: '/memberships/network',
    onData: (r) => {
      rows = r;
    },
    searchPlaceholder: 'Search member number…',
    filters: () => [{ name: 'status', label: 'Status', options: opts(['active', 'paused', 'suspended', 'terminated']) }],
    columns: [
      { key: 'memberName', label: 'Member', render: (r) => `${esc(r.memberName || '—')}${r.memberEmail ? ` <span class="empty">${esc(r.memberEmail)}</span>` : ''}` },
      { key: 'memberNo', label: 'Member no.', render: (r) => badge(r.memberNo, 'info') },
      { key: 'rankName', label: 'Rank', render: (r) => esc(r.rankName || '—') },
      { key: 'status', label: 'Status', render: (r) => statusBadge(r.status) },
      { key: 'personalBv', label: 'Personal BV', render: (r) => money(r.personalBv || 0) },
      { key: 'groupBv', label: 'Group BV', render: (r) => money(r.groupBv || 0) },
      { key: 'joinedAt', label: 'Joined', render: (r) => formatDate(r.joinedAt) }
    ],
    toolbar: () =>
      `<button class="btn btn-sm" data-add>${icon('user-plus')}<span>Add member</span></button><button class="btn btn-sm" id="shareNetwork">${icon('share-2')}<span>Invite</span></button>`,
    actions: (r) => act('status', r.id, 'Status'),
    empty: 'No members in your network yet. Invite people with your code.',
    bind: (root, reload) => {
      (root.querySelector('[data-add]') as HTMLElement).onclick = () =>
        openModal({
          title: 'Add member to your network',
          fields: [
            { name: 'email', label: 'Member email', required: true, help: 'They must already have a NetMark account.' },
            { name: 'sponsorId', label: 'Sponsor user ID (optional)', help: 'Leave blank to place them directly under you.' }
          ],
          submitLabel: 'Add member',
          onSubmit: async (v) => {
            const res = await apiRequest('/memberships', { method: 'POST', body: JSON.stringify(v) });
            if (!res.success) throw new Error(res.message);
            toast('Member added', 'success');
            reload();
          }
        });
      (root.querySelector('#shareNetwork') as HTMLElement).onclick = async () => {
        const code = await getMyReferralCode();
        await shareLink(shareUrl('register', code), 'NetMark', 'Join my NetMark team');
      };
      wire(root, {
        status: (id) => {
          const row = rows.find((r) => r.id === id);
          openModal({
            title: `Membership — ${row?.memberName || ''}`,
            fields: [
              {
                name: 'status',
                label: 'Status',
                type: 'select',
                value: row?.status || 'active',
                options: opts(['active', 'paused', 'suspended', 'terminated'])
              }
            ],
            onSubmit: async (v) => {
              const res = await apiRequest(`/memberships/${id}`, { method: 'PUT', body: JSON.stringify(v) });
              if (!res.success) throw new Error(res.message);
              toast('Membership updated', 'success');
              reload();
            }
          });
        }
      });
    }
  });
}

/* -------------------------------- billing ------------------------------ */
async function billing(c: HTMLElement) {
  c.innerHTML = '<p class="empty">Loading plan…</p>';
  const [mine, catalog] = await Promise.all([
    apiRequest('/plans/my').catch(() => null),
    apiRequest('/plans?isActive=true').catch(() => null)
  ]);
  const my: any = mine?.success ? mine.data : null;
  const plans: any[] = catalog?.success ? catalog.data || [] : [];
  const ent = my?.entitlements || {};
  const usage = my?.usage || {};
  const planName = my?.planName || my?.plan?.name || 'Free';
  const status = my?.billingStatus || (planName === 'Free' ? 'free' : 'active');
  const currentPlanId = my?.plan?.id || my?.planId || null;
  const renews = my?.nextBillingAt ? formatDate(my.nextBillingAt) : status === 'free' ? 'Free forever' : '—';

  c.innerHTML = `
    <div class="card">
      <h3>${icon('credit-card')} Your current plan</h3>
      ${statCards([
        { label: 'Plan', value: planName, format: 'text', accent: true, tone: 'brand' },
        { label: 'Status', value: status === 'past_due' ? 'Payment due' : status === 'free' ? 'Free' : 'Active', format: 'text' },
        { label: 'Monthly price', value: Number(my?.plan?.baseFeeZar ?? my?.baseFeeZar ?? 0), format: 'money' },
        { label: 'Renews', value: renews, format: 'text' }
      ])}
      ${status === 'past_due' ? '<p class="empty" style="margin-top:8px;color:var(--warning)">Your plan has lapsed — choose a plan below to restore your features.</p>' : ''}
    </div>
    <div class="card">
      <h3>${icon('gauge')} Usage</h3>
      ${tableSimple(
        ['Resource', 'Used', 'Limit'],
        [
          ['Products', String(usage.products ?? 0), entValue(ent.maxProducts)],
          ['Stores', String(usage.stores ?? 0), entValue(ent.maxStores)],
          ['Team seats', String(usage.teamMembers ?? 0), entValue(ent.maxTeamMembers)],
          ['Referral codes', String(usage.codes ?? 0), entValue(ent.maxCodes)]
        ]
      )}
    </div>
    <div class="card">
      <h3>${icon('layers')} What your plan includes</h3>
      ${tableSimple(
        ['Feature', 'Included'],
        entRows(ent)
      )}
    </div>
    <div class="card">
      <h3>${icon('tag')} Available plans</h3>
      ${plans.length
        ? tableSimple(
            ['Plan', 'Price / month', 'Highlights', ''],
            plans.map((p: any) => {
              const isCurrent = currentPlanId === p.id && status === 'active';
              const label = isCurrent ? 'Current' : status === 'past_due' && currentPlanId === p.id ? 'Renew' : 'Choose';
              const btn = isCurrent
                ? '<span class="badge">current</span>'
                : `<button class="btn btn-sm" data-sub="${esc(p.id)}">${esc(label)}</button>`;
              return [
                `${esc(p.name)}${p.isDefault ? ' <span class="badge">default</span>' : ''}`,
                money(p.baseFeeZar || 0),
                esc(planHighlights(p.features || {})),
                btn
              ];
            })
          )
        : '<p class="empty">No plans available.</p>'}
    </div>`;
  iconify(c);

  c.querySelectorAll('[data-sub]').forEach((b) =>
    b.addEventListener('click', async () => {
      const planId = (b as HTMLElement).dataset.sub!;
      const res = await apiRequest('/plans/subscribe', { method: 'POST', body: JSON.stringify({ planId }) });
      if (!res.success) return toast(res.message || 'Could not change plan', 'error');
      if (res.data?.free) {
        toast(`You are now on the ${res.data.planName || 'selected'} plan`, 'success');
        billing(c);
        return;
      }
      toast('Redirecting to PayFast…', 'info');
      submitPayFast(res.data.processUrl, res.data.fields);
    })
  );
}

function entValue(max: unknown): string {
  const n = Number(max);
  if (!Number.isFinite(n)) return '—';
  return n < 0 ? 'Unlimited' : String(n);
}

function entRows(ent: any): string[][] {
  if (!ent || !Object.keys(ent).length) return [['—', '—']];
  return [
    ['Products', entValue(ent.maxProducts)],
    ['Stores', entValue(ent.maxStores)],
    ['Team seats', entValue(ent.maxTeamMembers)],
    ['Referral codes', entValue(ent.maxCodes)],
    ['Commission depth', Number(ent.commissionLevels) >= 3 ? '3 levels' : `Level ${ent.commissionLevels || 1}`],
    ['Payouts', ent.payouts ? 'Yes' : 'No'],
    ['Reports', ent.reports === 'full' ? 'Full' : 'Basic'],
    ['Autoship', ent.autoship ? 'Yes' : 'No'],
    ['White-label', ent.whiteLabel ? 'Yes' : 'No'],
    ['API & webhooks', ent.api || ent.webhooks ? 'Yes' : 'No']
  ];
}

function planHighlights(f: any): string {
  const bits: string[] = [];
  bits.push(`${entValue(f.maxProducts)} products`);
  bits.push(`${entValue(f.maxStores)} stores`);
  bits.push(Number(f.commissionLevels) >= 3 ? '3-level commissions' : 'Level-1 commissions');
  if (f.payouts === true) bits.push('payouts');
  if (f.whiteLabel === true) bits.push('white-label');
  if (f.api === true || f.webhooks === true) bits.push('API');
  if (f.autoship === true) bits.push('autoship');
  return bits.join(' · ');
}


/* -------------------------------- wallet ------------------------------- */
async function wallet(c: HTMLElement) {
  return renderWallet(c);
}

/* ------------------------------ commissions ---------------------------- */
function commissions(c: HTMLElement) {
  crudView(c, {
    endpoint: '/commissions',
    searchPlaceholder: 'Search commissions…',
    columns: [
      { key: 'orderId', label: 'Order', render: (r) => (r.orderId ? esc(String(r.orderId).slice(0, 8)) : '—') },
      { key: 'amountZar', label: 'Amount (ZAR)', render: (r) => money(r.amountZar || 0) },
      { key: 'bonusType', label: 'Type', render: (r) => titleCase(r.bonusType || 'sale') },
      { key: 'status', label: 'Status', render: (r) => statusBadge(r.status) },
      { key: 'createdAt', label: 'Earned', render: (r) => formatDate(r.createdAt) }
    ],
    empty: 'No commissions earned yet.'
  });
}
