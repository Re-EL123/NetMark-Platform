import { supabase } from './supabase';
import { apiRequest } from './api';
import { initPanel, NavItem } from './app';
import { esc, statusBadge, badge, formatDate } from './render';
import { openModal, confirmDialog, toast, money } from './ui';

interface CartLine {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  storeId?: string;
  companyId?: string;
}

const CART_KEY = 'netmark_cart';
function getCart(): CartLine[] {
  try {
    return JSON.parse(localStorage.getItem(CART_KEY) || '[]');
  } catch {
    return [];
  }
}
function setCart(lines: CartLine[]) {
  localStorage.setItem(CART_KEY, JSON.stringify(lines));
}

const nav: NavItem[] = [
  { id: 'catalog', label: 'Shop' },
  { id: 'cart', label: 'Cart' },
  { id: 'orders', label: 'My Orders' },
  { id: 'appointments', label: 'Appointments' },
  { id: 'profile', label: 'Profile' }
];

initPanel({
  title: 'Shop',
  nav,
  render: async (route, ctx) => {
    ctx.titleEl.textContent = nav.find((n) => n.id === route)?.label || 'Shop';
    const c = ctx.container;
    if (route === 'catalog') return catalog(c);
    if (route === 'cart') return cart(c, ctx);
    if (route === 'orders') return orders(c, ctx);
    if (route === 'appointments') return appointments(c);
    if (route === 'profile') return profile(c, ctx);
  }
});

/* ------------------------------- catalog ------------------------------- */
async function catalog(c: HTMLElement) {
  c.innerHTML = '<p class="empty">Loading catalog…</p>';
  const [productsRes, storesRes, settingsRes] = await Promise.all([
    apiRequest('/products?pageSize=100&isActive=true'),
    apiRequest('/stores?pageSize=100'),
    apiRequest('/settings')
  ]);
  const products = productsRes.data || [];
  const stores = storesRes.data || [];
  const symbol = settingsRes.data?.platform?.currencySymbol || 'R';

  const storeFilter = `<select id="storeFilter"><option value="">All stores</option>${stores
    .map((s: any) => `<option value="${esc(s.id)}">${esc(s.name)}</option>`)
    .join('')}</select>
    <input type="search" id="productSearch" placeholder="Search products…" />`;

  c.innerHTML = `<div class="toolbar">${storeFilter}<div class="spacer"></div><span id="cartInfo" class="empty"></span></div><div id="grid" class="grid"></div>`;

  function drawGrid() {
    const storeId = (document.getElementById('storeFilter') as HTMLSelectElement).value;
    const search = (document.getElementById('productSearch') as HTMLInputElement).value.toLowerCase();
    const filtered = products.filter(
      (p: any) => (!storeId || p.storeId === storeId) && (!search || String(p.name).toLowerCase().includes(search))
    );
    const grid = document.getElementById('grid')!;
    grid.innerHTML = filtered.length
      ? filtered
          .map(
            (p: any) => `<div class="product-card">
          <div class="thumb">${p.image ? `<img src="${esc(p.image)}" alt="${esc(p.name)}">` : '🛍️'}</div>
          <div class="body">
            <div class="name">${esc(p.name)}</div>
            <div class="desc">${esc(p.description || p.category || '')}</div>
            <div class="price">${money(p.price, symbol)}</div>
            <button class="btn btn-sm" data-add="${esc(p.id)}" ${Number(p.stock) <= 0 ? 'disabled' : ''}>
              ${Number(p.stock) <= 0 ? 'Out of stock' : 'Add to cart'}
            </button>
          </div>
        </div>`
          )
          .join('')
      : '<p class="empty">No products found.</p>';

    grid.querySelectorAll('[data-add]').forEach((b) =>
      b.addEventListener('click', () => {
        const id = (b as HTMLElement).dataset.add!;
        const product = products.find((p: any) => p.id === id);
        const cart = getCart();
        const existing = cart.find((l) => l.productId === id);
        if (existing) existing.quantity += 1;
        else cart.push({ productId: id, name: product.name, price: Number(product.price), quantity: 1, storeId: product.storeId, companyId: product.companyId });
        setCart(cart);
        toast(`${product.name} added`, 'success');
      })
    );
    const cartInfo = document.getElementById('cartInfo')!;
    const count = getCart().reduce((s, l) => s + l.quantity, 0);
    cartInfo.textContent = count ? `${count} item(s) in cart` : '';
  }

  (document.getElementById('storeFilter') as HTMLElement).addEventListener('change', drawGrid);
  (document.getElementById('productSearch') as HTMLElement).addEventListener('input', drawGrid);
  drawGrid();
}

/* --------------------------------- cart -------------------------------- */
function cart(c: HTMLElement, ctx: any) {
  const lines = getCart();
  if (!lines.length) {
    c.innerHTML = `<div class="card"><p class="empty">Your cart is empty.</p><button class="btn btn-sm" onclick="location.hash='catalog'">Browse products</button></div>`;
    return;
  }
  const subtotal = lines.reduce((s, l) => s + l.price * l.quantity, 0);
  const deliveryFee = 25;
  const total = subtotal + deliveryFee;

  c.innerHTML = `
    <div class="card">
      <h3>Cart</h3>
      ${lines
        .map(
          (l, i) => `<div class="cart-line">
        <div><div class="name">${esc(l.name)}</div><div class="empty">${money(l.price)}</div></div>
        <div class="qty">
          <button class="link-btn" data-dec="${i}">−</button>
          <span>${l.quantity}</span>
          <button class="link-btn" data-inc="${i}">+</button>
          <button class="link-btn danger" data-rm="${i}">Remove</button>
        </div>
      </div>`
        )
        .join('')}
      <div class="summary-row"><span>Subtotal</span><span>${money(subtotal)}</span></div>
      <div class="summary-row"><span>Delivery</span><span>${money(deliveryFee)}</span></div>
      <div class="summary-row total"><span>Total</span><span>${money(total)}</span></div>
      <button class="btn btn-sm" id="checkoutBtn" style="margin-top:12px">Checkout</button>
    </div>`;

  const redo = (fn: () => void) => {
    fn();
    cart(c, ctx);
  };
  c.querySelectorAll('[data-inc]').forEach((b) => b.addEventListener('click', () => redo(() => { const l = lines[Number((b as HTMLElement).dataset.inc)]; l.quantity++; setCart(lines); })));
  c.querySelectorAll('[data-dec]').forEach((b) => b.addEventListener('click', () => redo(() => { const i = Number((b as HTMLElement).dataset.dec); lines[i].quantity = Math.max(1, lines[i].quantity - 1); setCart(lines); })));
  c.querySelectorAll('[data-rm]').forEach((b) => b.addEventListener('click', () => redo(() => { lines.splice(Number((b as HTMLElement).dataset.rm), 1); setCart(lines); })));

  (document.getElementById('checkoutBtn') as HTMLElement).onclick = async () => {
    await openModal({
      title: 'Checkout',
      fields: [
        { name: 'address', label: 'Delivery address', type: 'textarea', required: true },
        { name: 'notes', label: 'Notes', type: 'textarea' },
        { name: 'orderType', label: 'Type', type: 'select', options: [{ value: 'delivery', label: 'Delivery' }, { value: 'pickup', label: 'Pickup' }], value: 'delivery' },
        { name: 'payNow', label: 'Pay now with PayFast', type: 'checkbox', value: true }
      ],
      submitLabel: 'Place order',
      onSubmit: async (v) => {
        const storeId = lines[0]?.storeId;
        const res = await apiRequest('/orders', {
          method: 'POST',
          body: JSON.stringify({
            storeId,
            items: lines.map((l) => ({ productId: l.productId, quantity: l.quantity })),
            address: v.address,
            notes: v.notes,
            orderType: v.orderType
          })
        });
        if (!res.success) throw new Error(res.message || 'Could not place order');
        setCart([]);
        const order = res.data;
        toast('Order placed', 'success');
        if (v.payNow) {
          await startPayFast(order.id);
        } else {
          ctx.navigate('orders');
        }
      }
    });
  };
}

async function startPayFast(orderId: string) {
  const res = await apiRequest('/payments/payfast/initiate', { method: 'POST', body: JSON.stringify({ orderId }) });
  if (!res.success) {
    toast(res.message || 'PayFast unavailable — order saved as unpaid', 'error');
    window.location.hash = 'orders';
    return;
  }
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

/* -------------------------------- orders ------------------------------- */
async function orders(c: HTMLElement, ctx: any) {
  const res = await apiRequest('/orders/my/all?pageSize=100');
  const rows = res.data || [];
  c.innerHTML = `
    <div class="card">
      <h3>My Orders</h3>
      ${
        rows.length
          ? rows
              .map(
                (o: any) => `<div class="cart-line">
        <div>
          <div class="name">${esc(o.orderNumber || o.id.slice(0, 8))}</div>
          <div class="empty">${formatDate(o.createdAt)} · ${statusBadge(o.orderStatus)} ${statusBadge(o.paymentStatus)}</div>
        </div>
        <div style="text-align:right">
          <div class="price">${money(o.total)}</div>
          ${o.paymentStatus !== 'paid' && o.orderStatus !== 'cancelled' ? `<button class="btn btn-sm" data-pay="${esc(o.id)}">Pay</button>` : ''}
          ${['pending', 'confirmed'].includes(o.orderStatus) ? `<button class="link-btn danger" data-cancel="${esc(o.id)}">Cancel</button>` : ''}
          ${o.orderStatus === 'completed' ? `<button class="link-btn" data-review="${esc(o.id)}">Review</button>` : ''}
        </div>
      </div>`
              )
              .join('')
          : '<p class="empty">No orders yet.</p>'
      }
    </div>`;
  c.querySelectorAll('[data-pay]').forEach((b) => b.addEventListener('click', () => startPayFast((b as HTMLElement).dataset.pay!)));
  c.querySelectorAll('[data-cancel]').forEach((b) =>
    b.addEventListener('click', async () => {
      if (await confirmDialog('Cancel this order?', { danger: true, confirmLabel: 'Cancel order' })) {
        await apiRequest(`/orders/${(b as HTMLElement).dataset.cancel}`, { method: 'PUT', body: JSON.stringify({ status: 'cancelled' }) });
        toast('Order cancelled', 'success');
        orders(c, ctx);
      }
    })
  );
  c.querySelectorAll('[data-review]').forEach((b) =>
    b.addEventListener('click', () =>
      openModal({
        title: 'Leave a review',
        fields: [
          { name: 'rating', label: 'Rating (1-5)', type: 'number', min: 1, max: 5, value: 5 },
          { name: 'comment', label: 'Comment', type: 'textarea' }
        ],
        onSubmit: async (v) => {
          await apiRequest('/reviews', { method: 'POST', body: JSON.stringify({ ...v, orderId: (b as HTMLElement).dataset.review }) });
          toast('Thanks for your review', 'success');
        }
      })
    )
  );
}

/* ---------------------------- appointments ----------------------------- */
async function appointments(c: HTMLElement) {
  const [listRes, storesRes] = await Promise.all([apiRequest('/appointments?pageSize=100'), apiRequest('/stores?pageSize=100')]);
  const rows = listRes.data || [];
  const stores = storesRes.data || [];
  c.innerHTML = `
    <div class="toolbar"><div class="spacer"></div><button class="btn btn-sm" id="newAppt">+ Book appointment</button></div>
    <div class="card">
      ${tableSimple(
        ['Service', 'Date', 'Time', 'Status', ''],
        rows.map((a: any) => [
          esc(a.service || '—'),
          formatDate(a.appointmentDate),
          esc(a.appointmentTime || ''),
          statusBadge(a.status),
          ['pending', 'confirmed'].includes(a.status) ? `<button class="link-btn danger" data-cancel="${esc(a.id)}">Cancel</button>` : ''
        ])
      )}
    </div>`;
  (document.getElementById('newAppt') as HTMLElement).onclick = () =>
    openModal({
      title: 'Book appointment',
      fields: [
        { name: 'storeId', label: 'Store', type: 'select', options: [{ value: '', label: 'Any' }, ...stores.map((s: any) => ({ value: s.id, label: s.name }))] },
        { name: 'service', label: 'Service', required: true },
        { name: 'date', label: 'Date', type: 'date', required: true },
        { name: 'time', label: 'Time', type: 'time' },
        { name: 'notes', label: 'Notes', type: 'textarea' }
      ],
      onSubmit: async (v) => {
        const res = await apiRequest('/appointments', { method: 'POST', body: JSON.stringify(v) });
        if (!res.success) throw new Error(res.message);
        toast('Appointment booked', 'success');
        appointments(c);
      }
    });
  c.querySelectorAll('[data-cancel]').forEach((b) =>
    b.addEventListener('click', async () => {
      if (await confirmDialog('Cancel this appointment?', { danger: true, confirmLabel: 'Cancel' })) {
        await apiRequest(`/appointments/${(b as HTMLElement).dataset.cancel}`, { method: 'DELETE' });
        appointments(c);
      }
    })
  );
}

/* ------------------------------- profile ------------------------------- */
async function profile(c: HTMLElement, ctx: any) {
  const u = ctx.user;
  c.innerHTML = `
    <div class="card">
      <h3>My profile</h3>
      <div class="detail-grid">
        <div><span class="detail-label">Name</span><span>${esc(u.name)}</span></div>
        <div><span class="detail-label">Email</span><span>${esc(u.email)}</span></div>
        <div><span class="detail-label">Phone</span><span>${esc(u.phone || '—')}</span></div>
        <div><span class="detail-label">Role</span><span>${badge(u.role, 'info')}</span></div>
      </div>
      <div style="margin-top:16px;display:flex;gap:10px;flex-wrap:wrap">
        <button class="btn btn-sm" id="editProfile">Edit profile</button>
        <button class="btn btn-sm btn-ghost" id="changePw">Change password</button>
      </div>
    </div>`;
  (document.getElementById('editProfile') as HTMLElement).onclick = () =>
    openModal({
      title: 'Edit profile',
      fields: [
        { name: 'name', label: 'Name', value: u.name },
        { name: 'phone', label: 'Phone', type: 'tel', value: u.phone }
      ],
      onSubmit: async (v) => {
        const res = await apiRequest('/auth/me', { method: 'PUT', body: JSON.stringify(v) });
        if (!res.success) throw new Error(res.message);
        toast('Profile updated', 'success');
        ctx.refresh();
      }
    });
  (document.getElementById('changePw') as HTMLElement).onclick = () =>
    openModal({
      title: 'Change password',
      fields: [{ name: 'password', label: 'New password', type: 'password', required: true }],
      onSubmit: async (v) => {
        const { error } = await supabase.auth.updateUser({ password: v.password });
        if (error) throw new Error(error.message);
        toast('Password updated', 'success');
      }
    });
}

function tableSimple(headers: string[], rows: string[][]) {
  if (!rows.length) return '<p class="empty">No records.</p>';
  return `<div class="table-wrap"><table><thead><tr>${headers.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows
    .map((r) => `<tr>${r.map((cell) => `<td>${cell}</td>`).join('')}</tr>`)
    .join('')}</tbody></table></div>`;
}
