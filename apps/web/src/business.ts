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
  { id: 'companies', label: 'Companies', capability: 'companies.link' },
  { id: 'catalog', label: 'Catalog', capability: 'products.read' },
  { id: 'listings', label: 'My Store Products', capability: 'products.read' },
  { id: 'purchases', label: 'Buy From Company', capability: 'orders.read' },
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
    if (route === 'companies') return companies(c);
    if (route === 'catalog') return catalog(c);
    if (route === 'listings') return listings(c);
    if (route === 'purchases') return purchases(c);
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

function companies(c: HTMLElement) {
  let rows: any[] = [];

  const statusB = (s: string) =>
    badge(titleCase(s || ''), s === 'active' ? 'success' : s === 'expired' ? 'danger' : 'neutral');

  const load = async () => {
    const res = await apiRequest('/company-links');
    rows = (res.success && res.data) || [];
    render();
  };

  const linkModal = (existing?: any) =>
    openModal({
      title: existing ? `Renew ${existing.companyName || 'company'}` : 'Link a company',
      fields: [
        {
          name: 'code',
          label: 'Company code',
          required: true,
          help: 'The code provided by the company. Linking unlocks its catalog and wholesale prices.'
        }
      ],
      submitLabel: existing ? 'Renew link' : 'Link company',
      onSubmit: async (v) => {
        const res = await apiRequest('/company-links', { method: 'POST', body: JSON.stringify(v) });
        if (!res.success) throw new Error(res.message || 'Failed to link company');
        toast(existing ? 'Link renewed' : 'Company linked', 'success');
        load();
      }
    });

  function render() {
    c.innerHTML = `
      <div class="card">
        <div class="row-actions" style="justify-content:flex-start">
          <button class="btn btn-sm" id="linkCompany">+ Link a company</button>
        </div>
        <p class="empty">Enter a company's code to unlock its catalog and buy stock at wholesale. If a code expires or the company disables it, your listings from that company stay here but are hidden from customers until you link a valid code again.</p>
      </div>
      <div class="card"><h3>Linked companies</h3>
        ${
          rows.length
            ? `<div class="table-wrap"><table><thead><tr><th>Company</th><th>Code</th><th>Status</th><th>Expires</th><th></th></tr></thead><tbody>
                ${rows
                  .map(
                    (r) => `<tr>
                  <td>${esc(r.companyName || r.companyId || '—')}</td>
                  <td>${r.code ? badge(esc(r.code), 'info') : '<span class="empty">—</span>'}</td>
                  <td>${statusB(r.status)}</td>
                  <td>${r.expiresAt ? formatDate(r.expiresAt) : '<span class="empty">Never</span>'}</td>
                  <td><div class="row-actions">
                    ${act('renew', r.id, r.status === 'active' ? 'Renew' : 'Reactivate')}
                    ${act('toggle', r.id, r.isActive ? 'Pause' : 'Resume')}
                    ${act('unlink', r.id, 'Unlink', 'danger')}
                  </div></td>
                </tr>`
                  )
                  .join('')}
              </tbody></table></div>`
            : '<p class="empty">No companies linked yet.</p>'
        }
      </div>`;

    (c.querySelector('#linkCompany') as HTMLElement).onclick = () => linkModal();
    wire(c, {
      toggle: async (id) => {
        const row = rows.find((r) => r.id === id);
        const res = await apiRequest(`/company-links/${id}`, { method: 'PUT', body: JSON.stringify({ isActive: !row?.isActive }) });
        if (!res.success) return toast(res.message || 'Failed', 'error');
        load();
      },
      unlink: async (id) => {
        if (await confirmDialog('Unlink this company? Its products will be hidden from your storefront.', { danger: true, confirmLabel: 'Unlink' })) {
          await apiRequest(`/company-links/${id}`, { method: 'DELETE' });
          toast('Company unlinked', 'success');
          load();
        }
      }
    });
    // renew needs the row, wire() only passes the id
    c.querySelectorAll('[data-act="renew"]').forEach((b) => {
      const el = b as HTMLElement;
      el.onclick = () => linkModal(rows.find((r) => r.id === el.dataset.id));
    });
  }

  load();
}

async function catalog(c: HTMLElement) {
  c.innerHTML = '<p class="empty">Loading catalog…</p>';
  const [prodRes, storeRes] = await Promise.all([apiRequest('/products?pageSize=100&isActive=true'), myStores()]);
  const products = prodRes.data || [];
  const stores = storeRes;

  const storeOpts = stores.map((s: any) => ({ value: s.id, label: s.name }));
  c.innerHTML = `
    <div class="card"><p class="empty">These are products published by companies you are linked to. Add them to one of your stores and set your own selling price.</p></div>
    ${
      products.length
        ? ''
        : '<div class="card"><p class="empty">No products to show. Open the Companies tab and enter a company code to unlock its catalog.</p></div>'
    }
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
      { key: 'companyLinked', label: 'Company link', render: (r) => (r.companyLinked ? statusBadge('active') : badge('Hidden — renew code', 'danger')) },
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

function purchases(c: HTMLElement) {
  let stores: any[] = [];
  let products: any[] = [];
  let companies: { id: string; name: string }[] = [];

  const load = async () => {
    const [pRes, sRes, prRes, clRes] = await Promise.all([
      apiRequest('/purchases'),
      myStores(),
      apiRequest('/products?pageSize=200&isActive=true'),
      apiRequest('/company-links')
    ]);
    stores = sRes;
    products = (prRes.success && prRes.data) || [];
    const links = (clRes.success && clRes.data) || [];
    const nameById = new Map(links.map((l: any) => [l.companyId, l.companyName]));
    const ids = [...new Set(products.map((p: any) => p.companyId).filter(Boolean))] as string[];
    companies = ids.map((id) => ({ id, name: String(nameById.get(id) || 'Company') }));
    render((pRes.success && pRes.data) || []);
  };

  function render(rows: any[]) {
    const storeOpts = stores.map((s: any) => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('');
    const linked = products.length > 0;
    const noStores = !stores.length;
    c.innerHTML = `
      ${noStores ? '<div class="card"><p class="empty">Create a store first on the My Stores tab.</p></div>' : ''}
      ${
        !noStores && !linked
          ? '<div class="card"><p class="empty">You have no linked companies. Open the Companies tab and enter a company code to buy its products.</p></div>'
          : ''
      }
      ${!noStores && linked ? builderHtml(storeOpts) : ''}
      <div class="card"><h3>Your purchase orders</h3>
        ${rows.length ? purchaseTable(rows) : '<p class="empty">No purchases yet.</p>'}
      </div>`;

    wireBuilder();
    wireRows(rows);
  }

  function builderHtml(storeOpts: string) {
    const companyOpts = companies
      .map((co) => `<option value="${esc(co.id)}">${esc(co.name)}</option>`)
      .join('');
    return `
    <div class="card" id="buyCard">
      <h3>Buy from a company</h3>
      <p class="empty">Pick a company and store, choose products at the company (wholesale) price, then place the order. You keep the margin when you resell them. One purchase order covers a single company.</p>
      <div class="form-group"><label for="buyCompany">Company</label><select id="buyCompany">${companyOpts}</select></div>
      <div class="form-group"><label for="buyStore">Store</label><select id="buyStore">${storeOpts}</select></div>
      <div class="table-wrap"><table><thead><tr><th>Product</th><th>Company price</th><th>Quantity</th></tr></thead><tbody id="buyRows"></tbody></table></div>
      <div class="form-group"><label for="buyNotes">Notes</label><input type="text" id="buyNotes" placeholder="Optional delivery notes" /></div>
      <div class="summary-row total"><span>Total</span><span id="buyTotal">${money(0)}</span></div>
      <button class="btn" id="placeBuy">Place purchase order</button>
    </div>`;
  }

  function purchaseTable(rows: any[]) {
    return `<div class="table-wrap"><table><thead><tr><th>Reference</th><th>Items</th><th>Total</th><th>Payment</th><th>Status</th><th>Created</th><th></th></tr></thead><tbody>
      ${rows
        .map(
          (r) => `<tr>
        <td>${badge(r.reference || String(r.id).slice(0, 8), 'info')}</td>
        <td>${(r.items || []).length}</td>
        <td>${money(r.total)}</td>
        <td>${statusBadge(r.paymentStatus)}</td>
        <td>${statusBadge(r.status)}</td>
        <td>${formatDate(r.createdAt)}</td>
        <td><div class="row-actions">${
          r.paymentStatus !== 'paid' && r.status !== 'cancelled' ? act('pay', r.id, 'Pay') : ''
        }${r.status === 'pending' ? act('cancel', r.id, 'Cancel', 'danger') : ''}</div></td>
      </tr>`
        )
        .join('')}
    </tbody></table></div>`;
  }

  function wireBuilder() {
    const card = c.querySelector('#buyCard');
    if (!card) return;
    const rowsEl = c.querySelector('#buyRows') as HTMLElement | null;
    const companySel = c.querySelector('#buyCompany') as HTMLSelectElement | null;
    if (!rowsEl || !companySel) return;

    const updateTotal = () => {
      let total = 0;
      c.querySelectorAll<HTMLInputElement>('[data-buy-qty]').forEach((inp) => {
        const id = (inp as HTMLElement).dataset.buyQty || '';
        const p = products.find((x: any) => x.id === id);
        total += Number(p?.price || 0) * Math.max(0, Number(inp.value || 0));
      });
      const el = c.querySelector('#buyTotal');
      if (el) el.textContent = money(total);
    };

    const renderRows = () => {
      const cid = companySel.value;
      const list = products.filter((p: any) => p.companyId === cid);
      rowsEl.innerHTML = list.length
        ? list
            .map(
              (p: any) => `<tr>
            <td>${esc(p.name)}${p.category ? ` <span class="empty">${esc(p.category)}</span>` : ''}</td>
            <td>${money(p.price)}</td>
            <td><input type="number" min="0" step="1" value="0" data-buy-qty="${esc(p.id)}" style="width:90px" /></td>
          </tr>`
            )
            .join('')
        : '<tr><td colspan="3" class="empty">No products available for this company.</td></tr>';
      rowsEl.querySelectorAll('[data-buy-qty]').forEach((inp) => inp.addEventListener('input', updateTotal));
      updateTotal();
    };

    companySel.onchange = renderRows;
    renderRows();

    const place = c.querySelector('#placeBuy') as HTMLButtonElement | null;
    if (place) {
      place.onclick = async () => {
        const storeId = (c.querySelector('#buyStore') as HTMLSelectElement).value;
        const items: any[] = [];
        c.querySelectorAll<HTMLInputElement>('[data-buy-qty]').forEach((inp) => {
          const id = (inp as HTMLElement).dataset.buyQty || '';
          const qty = Number(inp.value || 0);
          if (qty > 0) items.push({ productId: id, quantity: qty });
        });
        if (!items.length) return toast('Choose a product and quantity', 'error');
        const notes = (c.querySelector('#buyNotes') as HTMLInputElement)?.value;
        place.disabled = true;
        const res = await apiRequest('/purchases', { method: 'POST', body: JSON.stringify({ storeId, items, notes }) });
        place.disabled = false;
        if (!res.success) return toast(res.message || 'Could not place order', 'error');
        toast('Purchase order placed', 'success');
        load();
      };
    }
  }

  function wireRows(rows: any[]) {
    wire(c, {
      pay: (id) => startPurchasePayFast(id),
      cancel: async (id) => {
        if (await confirmDialog('Cancel this purchase order?', { danger: true, confirmLabel: 'Cancel order' })) {
          const res = await apiRequest(`/purchases/${id}/status`, { method: 'PUT', body: JSON.stringify({ status: 'cancelled' }) });
          if (!res.success) return toast(res.message || 'Could not cancel', 'error');
          toast('Purchase cancelled', 'success');
          load();
        }
      }
    });
    void rows;
  }

  load();
}

async function startPurchasePayFast(purchaseId: string) {
  const res = await apiRequest(`/purchases/${purchaseId}/payfast/initiate`, { method: 'POST' });
  if (!res.success) return toast(res.message || 'PayFast unavailable', 'error');
  const { processUrl, fields } = res.data;
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = processUrl;
  for (const [k, val] of Object.entries(fields)) {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = k;
    input.value = String(val);
    form.appendChild(input);
  }
  document.body.appendChild(form);
  toast('Redirecting to PayFast…', 'info');
  form.submit();
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
