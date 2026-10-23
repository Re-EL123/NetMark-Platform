import { supabase } from './supabase';
import { apiRequest, submitPayFast } from './api';
import { initPanel, NavItem } from './app';
import { esc, statusBadge, badge, formatDate } from './render';
import { openModal, confirmDialog, toast, money, titleCase, emptyState, tableSimple } from './ui';
import { icon } from './icons';
import { getMyReferralCode, shareLink, shareUrl } from './referral';
import { renderReferrals } from './referralsView';

interface CartLine {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  storeId?: string;
  companyId?: string;
  companyName?: string;
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
  { id: 'catalog', label: 'Shop', group: 'Shopping', icon: 'shopping-bag' },
  { id: 'cart', label: 'Cart', group: 'Shopping', icon: 'shopping-cart' },
  { id: 'orders', label: 'My Orders', group: 'Account', icon: 'receipt' },
  { id: 'appointments', label: 'Appointments', group: 'Account', icon: 'calendar-clock' },
  { id: 'autoship', label: 'Autoship', group: 'Account', icon: 'refresh-cw' },
  { id: 'referrals', label: 'Referrals & Network', group: 'Account', icon: 'share-2' },
  { id: 'privacy', label: 'Data & Consent', group: 'Account', icon: 'shield' },
  { id: 'profile', label: 'Profile', group: 'Account', icon: 'user' }
];

initPanel({
  title: 'Shop',
  nav,
  tourIntro:
    'Browse products from every store, add them to your cart and check out. Products from different companies check out as separate orders.',
  render: async (route, ctx) => {
    ctx.titleEl.textContent = nav.find((n) => n.id === route)?.label || 'Shop';
    const c = ctx.container;
    if (route === 'catalog') return catalog(c);
    if (route === 'cart') return cart(c, ctx);
    if (route === 'orders') return orders(c, ctx);
    if (route === 'appointments') return appointments(c);
    if (route === 'autoship') return autoship(c, ctx);
    if (route === 'referrals') return renderReferrals(c);
    if (route === 'privacy') return privacy(c, ctx);
    if (route === 'profile') return profile(c, ctx);
  }
});

/* ------------------------------- catalog ------------------------------- */
async function catalog(c: HTMLElement) {
  c.innerHTML = '<p class="empty">Loading products…</p>';
  const [listingsRes, storesRes, settingsRes] = await Promise.all([
    apiRequest('/store-products?pageSize=100'),
    apiRequest('/stores?pageSize=100'),
    apiRequest('/settings')
  ]);
  const listings = listingsRes.data || [];
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
    const filtered = listings.filter(
      (l: any) => (!storeId || l.storeId === storeId) && (!search || String(l.name).toLowerCase().includes(search))
    );
    const grid = document.getElementById('grid')!;
    grid.innerHTML = filtered.length
      ? filtered
          .map(
            (l: any) => `<div class="product-card">
          <div class="thumb">${l.image ? `<img src="${esc(l.image)}" alt="${esc(l.name)}">` : icon('shopping-bag')}</div>
          <div class="body">
            <div class="name">${esc(l.name)}</div>
            <div class="desc">${esc(l.description || l.category || '')}</div>
            <div class="empty">${esc(l.storeName || '')}${l.companyName ? ` · ${esc(l.companyName)}` : ''}</div>
            <div class="price">${money(l.price, symbol)}</div>
            <div class="row-actions">
              <button class="btn btn-sm" data-add="${esc(l.id)}" ${Number(l.stock) <= 0 ? 'disabled' : ''}>
                ${Number(l.stock) <= 0 ? `${icon('ban')}<span>Out of stock</span>` : `${icon('shopping-cart')}<span>Add to cart</span>`}
              </button>
              <button class="btn btn-sm" data-share="${esc(l.id)}">${icon('share-2')}<span>Share</span></button>
            </div>
          </div>
        </div>`
          )
          .join('')
      : '<p class="empty">No products found.</p>';

    grid.querySelectorAll('[data-add]').forEach((b) =>
      b.addEventListener('click', () => {
        const id = (b as HTMLElement).dataset.add!;
        const listing = listings.find((l: any) => l.id === id);
        const cart = getCart();
        const existing = cart.find((l) => l.productId === listing.productId && l.storeId === listing.storeId);
        if (existing) existing.quantity += 1;
        else cart.push({ productId: listing.productId, name: listing.name, price: Number(listing.price), quantity: 1, storeId: listing.storeId, companyId: listing.companyId, companyName: listing.companyName });
        setCart(cart);
        toast(`${listing.name} added`, 'success');
      })
    );

    grid.querySelectorAll('[data-share]').forEach((b) =>
      b.addEventListener('click', async () => {
        const listing = listings.find((l: any) => l.id === (b as HTMLElement).dataset.share);
        const code = await getMyReferralCode();
        await shareLink(shareUrl('shop/', code), listing?.name || 'NetMark', `Check out ${listing?.name || 'this product'} on NetMark`);
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
interface CartGroup {
  key: string;
  companyId?: string;
  companyName?: string;
  storeId?: string;
  entries: { line: CartLine; index: number }[];
}

function groupCart(lines: CartLine[]): CartGroup[] {
  const groups = new Map<string, CartGroup>();
  lines.forEach((line, index) => {
    const key = line.companyId || `${line.storeId || ''}:none`;
    if (!groups.has(key)) {
      groups.set(key, { key, companyId: line.companyId, companyName: line.companyName, storeId: line.storeId, entries: [] });
    }
    groups.get(key)!.entries.push({ line, index });
  });
  return [...groups.values()];
}

async function cart(c: HTMLElement, ctx: any) {
  const lines = getCart();
  if (!lines.length) {
    c.innerHTML = `<div class="card">${emptyState(
      "Your cart is empty. Browse the shop to add products.",
      'shopping-cart',
      `<button class="btn btn-sm" onclick="location.hash='catalog'">${icon('shopping-bag')}<span>Browse products</span></button>`
    )}</div>`;
    return;
  }
  const settingsRes = await apiRequest('/settings');
  const symbol = settingsRes.data?.platform?.currencySymbol || 'R';
  const deliveryFee = Number(settingsRes.data?.platform?.deliveryFee ?? 0);

  // Fallback for listings whose company code has lapsed (or that the store no
  // longer sells): the shop hides them, so a stale cart line becomes
  // "unavailable from this store" rather than silently disappearing.
  const cartStoreIds = [...new Set(lines.map((l) => l.storeId).filter(Boolean))];
  const unavailable = new Set<number>();
  if (cartStoreIds.length) {
    const lr = await apiRequest('/store-products?pageSize=200');
    const current = (lr.success && lr.data) || [];
    lines.forEach((l, i) => {
      if (!l.storeId) return;
      const match = current.find((x: any) => x.productId === l.productId && x.storeId === l.storeId);
      if (!match) unavailable.add(i);
    });
  }
  const hasUnavailable = unavailable.size > 0;

  // An order can only contain one company (and one store), so the cart is split
  // into groups and each group is checked out separately.
  const groups = groupCart(lines);
  const multi = groups.length > 1;

  const groupCards = groups
    .map((g, gi) => {
      const subtotal = g.entries.reduce((s, e) => s + e.line.price * e.line.quantity, 0);
      const total = subtotal + deliveryFee;
      const groupUnavailable = g.entries.some((e) => unavailable.has(e.index));
      const rows = g.entries
        .map((e) => {
          const { line: l, index: i } = e;
          return `<div class="cart-line" ${unavailable.has(i) ? 'style="opacity:.55"' : ''}>
        <div><div class="name">${esc(l.name)}${unavailable.has(i) ? ' <span class="empty">— currently unavailable from this store</span>' : ''}</div><div class="empty">${money(l.price, symbol)}</div></div>
        <div class="qty">
          <button class="link-btn" data-tip="Decrease" data-dec="${i}">${icon('minus')}</button>
          <span>${l.quantity}</span>
          <button class="link-btn" data-tip="Increase" data-inc="${i}">${icon('plus')}</button>
          <button class="link-btn danger" data-rm="${i}">${icon('trash-2')}<span>Remove</span></button>
        </div>
      </div>`;
        })
        .join('');
      return `<div class="card">
        <h3>${esc(g.companyName || 'Order')}${multi ? ' <span class="empty">(separate order)</span>' : ''}</h3>
        ${rows}
        <div class="summary-row"><span>Subtotal</span><span>${money(subtotal, symbol)}</span></div>
        <div class="summary-row"><span>Delivery</span><span>${money(deliveryFee, symbol)}</span></div>
        <div class="summary-row total"><span>Total</span><span>${money(total, symbol)}</span></div>
        <button class="btn btn-sm" data-checkout="${gi}" style="margin-top:12px" ${groupUnavailable ? 'disabled title="Remove unavailable items to continue"' : ''}>${icon(
          'credit-card'
        )}<span>Checkout${g.companyName ? ` ${esc(g.companyName)}` : ''}</span></button>
      </div>`;
    })
    .join('');

  c.innerHTML = `
    ${
      hasUnavailable
        ? '<div class="card" style="border-color:var(--danger,#c0392b)"><p class="empty">Some items are no longer available from their store. Remove them to continue.</p></div>'
        : ''
    }
    ${
      multi
        ? '<div class="card"><p class="empty">Your cart contains products from more than one company. Each company is a separate order and delivery.</p></div>'
        : ''
    }
    ${groupCards}
    ${
      hasUnavailable
        ? '<div class="card"><button class="link-btn danger" id="rmUnavailable">' + icon('trash-2') + '<span>Remove unavailable items</span></button></div>'
        : ''
    }`;

  const redo = (fn: () => void) => {
    fn();
    cart(c, ctx);
  };
  c.querySelectorAll('[data-inc]').forEach((b) => b.addEventListener('click', () => redo(() => { const l = lines[Number((b as HTMLElement).dataset.inc)]; l.quantity++; setCart(lines); })));
  c.querySelectorAll('[data-dec]').forEach((b) => b.addEventListener('click', () => redo(() => { const i = Number((b as HTMLElement).dataset.dec); lines[i].quantity = Math.max(1, lines[i].quantity - 1); setCart(lines); })));
  c.querySelectorAll('[data-rm]').forEach((b) => b.addEventListener('click', () => redo(() => { lines.splice(Number((b as HTMLElement).dataset.rm), 1); setCart(lines); })));

  const rmUnavailableBtn = document.getElementById('rmUnavailable');
  if (rmUnavailableBtn)
    rmUnavailableBtn.addEventListener('click', () => {
      const kept = lines.filter((_l, i) => !unavailable.has(i));
      setCart(kept);
      cart(c, ctx);
    });

  c.querySelectorAll('[data-checkout]').forEach((b) =>
    b.addEventListener('click', () => {
      const group = groups[Number((b as HTMLElement).dataset.checkout)];
      checkoutGroup(group.entries.map((e) => e.line), ctx);
    })
  );
}

async function checkoutGroup(groupLines: CartLine[], ctx: any) {
  const storeIds = [...new Set(groupLines.map((l) => l.storeId).filter(Boolean))];
  if (storeIds.length > 1) {
    toast('Please order from one store at a time', 'error');
    return;
  }
  const storeId = storeIds[0];
  await openModal({
    title: 'Checkout',
    fields: [
      { name: 'address', label: 'Delivery address', type: 'textarea', required: true, address: true },
      { name: 'notes', label: 'Notes', type: 'textarea' },
      { name: 'orderType', label: 'Type', type: 'select', options: [{ value: 'delivery', label: 'Delivery' }, { value: 'pickup', label: 'Pickup' }], value: 'delivery' },
      { name: 'payNow', label: 'Pay now with PayFast', type: 'checkbox', value: true }
    ],
    submitLabel: 'Place order',
    onSubmit: async (v) => {
      const res = await apiRequest('/orders', {
        method: 'POST',
        body: JSON.stringify({
          storeId,
          items: groupLines.map((l) => ({ productId: l.productId, quantity: l.quantity })),
          address: v.address,
          notes: v.notes,
          orderType: v.orderType
        })
      });
      if (!res.success) throw new Error(res.message || 'Could not place order');
      const keyOf = (l: CartLine) => `${l.productId}|${l.storeId || ''}|${l.companyId || ''}`;
      const rm = new Set(groupLines.map(keyOf));
      setCart(getCart().filter((l) => !rm.has(keyOf(l))));
      toast('Order placed', 'success');
      if (v.payNow) {
        await startPayFast(res.data.id);
      } else {
        ctx.navigate('orders');
      }
    }
  });
}

async function startPayFast(orderId: string) {
  const res = await apiRequest('/payments/payfast/initiate', { method: 'POST', body: JSON.stringify({ orderId }) });
  if (!res.success) {
    toast(res.message || 'PayFast unavailable — order saved as unpaid', 'error');
    window.location.hash = 'orders';
    return;
  }
  const { processUrl, fields } = res.data;
  toast('Redirecting to PayFast…', 'info');
  submitPayFast(processUrl, fields);
}

/* ------------------------------- tracking ------------------------------ */
function addressText(address: any): string {
  if (!address) return '—';
  if (typeof address === 'string') return address;
  return [address.line1, address.line2, address.suburb, address.city, address.province, address.postalCode]
    .filter(Boolean)
    .join(', ') || address.formattedAddress || '—';
}

async function openTracking(id: string) {
  const res = await apiRequest(`/orders/${id}`);
  if (!res.success) return toast(res.message || 'Could not load order', 'error');
  const o: any = res.data;
  const delivered = o.deliveryStatus === 'delivered' || o.orderStatus === 'completed';
  const steps: [string, boolean][] = [
    ['Order placed', true],
    ['Payment confirmed', o.paymentStatus === 'paid'],
    ['Order confirmed', ['confirmed', 'ready', 'in_transit', 'completed'].includes(o.orderStatus) || o.paymentStatus === 'paid'],
    ['Ready for dispatch', ['ready', 'in_transit', 'completed'].includes(o.orderStatus)],
    ['Driver assigned', !!o.driver || ['assigned', 'picked_up', 'in_transit', 'delivered'].includes(o.deliveryStatus)],
    ['Picked up', ['picked_up', 'in_transit', 'delivered'].includes(o.deliveryStatus)],
    ['On the way', ['in_transit', 'delivered'].includes(o.deliveryStatus)],
    ['Delivered', delivered]
  ];
  const doneCount = steps.filter(([, done]) => done).length;
  const otp =
    o.deliveryOtp && ['assigned', 'picked_up', 'in_transit'].includes(o.deliveryStatus) ? String(o.deliveryOtp) : '';
  const items = Array.isArray(o.items) ? o.items : [];
  const html = `
    <div class="track-steps">
      ${steps
        .map(
          ([label, done], i) =>
            `<div class="track-step ${done ? 'done' : ''} ${i === doneCount - 1 && !delivered ? 'current' : ''}">
              <span class="track-dot">${done ? icon('check') : ''}</span>
              <span class="track-label">${esc(label)}</span>
            </div>`
        )
        .join('')}
    </div>
    ${otp ? `<div class="otp-box"><div class="otp-label">Delivery code</div><div class="otp-code">${esc(otp)}</div><div class="otp-note">Give this code to your driver only when your order arrives.</div></div>` : ''}
    ${
      o.driver
        ? `<div class="driver-card"><div><div class="driver-name">${esc(o.driver.name || 'Your driver')}</div><div class="empty">${esc([o.driver.vehicleModel, o.driver.vehicleNumber].filter(Boolean).join(' · ') || 'Delivery partner')}</div></div>${o.driver.phone ? `<a class="btn btn-sm btn-ghost" href="tel:${esc(o.driver.phone)}">${icon('phone')}<span>Call</span></a>` : ''}</div>`
        : ''
    }
    <div class="detail-grid" style="margin-top:16px">
      <div><span class="detail-label">Deliver to</span><span>${esc(addressText(o.address))}</span></div>
      <div><span class="detail-label">Total</span><span>${money(o.total)}</span></div>
    </div>
    <div style="margin-top:16px">
      <span class="detail-label">Items</span>
      ${items.map((l: any) => `<div class="cart-line"><div><div class="name">${esc(l.name)}</div><div class="empty">Qty ${Number(l.quantity || 1)}</div></div><div class="price">${money(l.lineTotal ?? Number(l.price || 0) * Number(l.quantity || 1))}</div></div>`).join('') || '<p class="empty">No items recorded.</p>'}
    </div>`;
  await openModal({ title: `Order ${o.orderNumber || o.id.slice(0, 8)}`, html, submitLabel: 'Done', onSubmit: () => {} });
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
          <div class="empty">${formatDate(o.createdAt)} · ${statusBadge(o.orderStatus)} ${statusBadge(o.paymentStatus)}${o.deliveryStatus ? ' ' + statusBadge(o.deliveryStatus) : ''}</div>
        </div>
        <div style="text-align:right">
          <div class="price">${money(o.total)}</div>
          ${o.paymentStatus !== 'paid' && o.orderStatus !== 'cancelled' ? `<button class="btn btn-sm" data-pay="${esc(o.id)}">${icon('credit-card')}<span>Pay</span></button>` : ''}
          ${o.orderType !== 'pickup' && o.orderStatus !== 'cancelled' ? `<button class="link-btn" data-track="${esc(o.id)}">${icon('map-pin')}<span>Track</span></button>` : ''}
          ${['pending', 'confirmed'].includes(o.orderStatus) ? `<button class="link-btn danger" data-cancel="${esc(o.id)}">${icon('ban')}<span>Cancel</span></button>` : ''}
          ${o.orderStatus === 'completed' ? `<button class="link-btn" data-review="${esc(o.id)}">${icon('star')}<span>Review</span></button>` : ''}
        </div>
      </div>`
              )
              .join('')
          : '<p class="empty">No orders yet.</p>'
      }
    </div>`;
  c.querySelectorAll('[data-pay]').forEach((b) => b.addEventListener('click', () => startPayFast((b as HTMLElement).dataset.pay!)));
  c.querySelectorAll('[data-track]').forEach((b) =>
    b.addEventListener('click', () => openTracking((b as HTMLElement).dataset.track!))
  );
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
    <div class="toolbar"><div class="spacer"></div><button class="btn btn-sm" id="newAppt">${icon('plus')}<span>Book appointment</span></button></div>
    <div class="card">
      ${tableSimple(
        ['Service', 'Date', 'Time', 'Status', ''],
        rows.map((a: any) => [
          esc(a.service || ''),
          formatDate(a.appointmentDate),
          esc(a.appointmentTime || ''),
          statusBadge(a.status),
          ['pending', 'confirmed'].includes(a.status) ? `<button class="link-btn danger" data-cancel="${esc(a.id)}">${icon('ban')}<span>Cancel</span></button>` : ''
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
      <div class="profile-head">
        <span class="profile-avatar">${u.profileImage ? `<img src="${esc(u.profileImage)}" alt="" />` : icon('user')}</span>
        <div class="detail-grid">
          <div><span class="detail-label">Name</span><span>${esc(u.name)}</span></div>
          <div><span class="detail-label">Email</span><span>${esc(u.email)}</span></div>
          <div><span class="detail-label">Phone</span><span>${esc(u.phone || '')}</span></div>
          <div><span class="detail-label">Role</span><span>${badge(u.role, 'info')}</span></div>
        </div>
      </div>
      <div style="margin-top:16px;display:flex;gap:10px;flex-wrap:wrap">
        <button class="btn btn-sm" id="editProfile">${icon('pencil')}<span>Edit profile</span></button>
        <button class="btn btn-sm btn-ghost" id="changePw">${icon('refresh-cw')}<span>Change password</span></button>
      </div>
    </div>`;
  (document.getElementById('editProfile') as HTMLElement).onclick = () =>
    openModal({
      title: 'Edit profile',
      fields: [
        { name: 'name', label: 'Name', value: u.name },
        { name: 'phone', label: 'Phone', type: 'tel', value: u.phone },
        { name: 'profileImage', label: 'Profile photo', type: 'image', folder: 'users', value: u.profileImage }
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

/* ------------------------------- autoship ------------------------------ */
async function autoship(c: HTMLElement, ctx: any) {
  c.innerHTML = '<p class="empty">Loading autoship…</p>';
  const [subs, ordersRes] = await Promise.all([
    apiRequest('/autoship').catch(() => null),
    apiRequest('/orders/my/all?pageSize=100').catch(() => null)
  ]);
  const rows: any[] = subs?.success ? subs.data || [] : [];
  const orders: any[] = ordersRes?.success ? ordersRes.data || [] : [];
  const orderOpts = orders.map((o) => ({ value: o.id, label: `${o.orderNumber || o.id} — ${money(o.total)}` }));
  c.innerHTML = `
    <div class="card">
      <h3>${icon('refresh-cw')} Scheduled repeat orders</h3>
      <p class="empty">Reorder your last basket automatically at an interval that suits you.</p>
      ${rows.length
        ? tableSimple(
            ['Order', 'Interval', 'Next run', 'Status', ''],
            rows.map((r) => [
              esc(r.orderId ? String(r.orderId).slice(0, 8) : '—'),
              `every ${r.intervalDays} days`,
              formatDate(r.nextRunAt),
              statusBadge(r.status),
              r.status === 'active'
                ? `<button class="btn btn-sm" data-cancel="${esc(r.id)}">${icon('ban')}<span>Cancel</span></button>`
                : ''
            ])
          )
        : '<p class="empty">No autoship subscriptions yet.</p>'}
      <div class="toolbar" style="margin-top:12px">
        <button class="btn btn-sm" id="addAutoship">${icon('plus')}<span>New autoship</span></button>
      </div>
    </div>`;
  const add = c.querySelector('#addAutoship') as HTMLElement | null;
  if (add) {
    add.onclick = async () => {
      if (!orderOpts.length) return toast('Place an order first', 'error');
      await openModal({
        title: 'New autoship',
        fields: [
          { name: 'orderId', label: 'Order to repeat', type: 'select', options: orderOpts, required: true },
          { name: 'intervalDays', label: 'Repeat every (days)', type: 'number', value: '30', min: 1 }
        ],
        onSubmit: async (v) => {
          const r = await apiRequest('/autoship', { method: 'POST', body: JSON.stringify({ orderId: v.orderId, intervalDays: v.intervalDays, items: [] }) });
          if (!r.success) throw new Error(r.message);
          toast('Autoship scheduled', 'success');
          autoship(c, ctx);
        }
      });
    };
  }
  c.querySelectorAll('[data-cancel]').forEach((b) => {
    (b as HTMLElement).onclick = async () => {
      if (!(await confirmDialog('Cancel this autoship?', { danger: true, confirmLabel: 'Cancel autoship' }))) return;
      const id = (b as HTMLElement).dataset.cancel!;
      const r = await apiRequest(`/autoship/${id}/cancel`, { method: 'POST' });
      if (!r.success) return toast(r.message || 'Could not cancel', 'error');
      toast('Autoship cancelled', 'success');
      autoship(c, ctx);
    };
  });
}

/* --------------------------- privacy / consent ------------------------- */
async function privacy(c: HTMLElement, ctx: any) {
  c.innerHTML = '<p class="empty">Loading your data…</p>';
  const [consentRes, dsarRes] = await Promise.all([
    apiRequest('/consent').catch(() => null),
    apiRequest('/dsar').catch(() => null)
  ]);
  const consents: any[] = consentRes?.success ? consentRes.data || [] : [];
  const dsars: any[] = dsarRes?.success ? dsarRes.data || [] : [];

  const purposes = ['marketing', 'communications', 'data-processing', 'profiling'];
  const wordings: Record<string, string> = {
    marketing: 'I consent to NetMark contacting me with promotions and offers.',
    communications: 'I consent to service communications about my orders and account.',
    'data-processing': 'I consent to the processing of my personal information to provide the service.',
    profiling: 'I consent to analysis of my activity to improve recommendations.'
  };

  c.innerHTML = `
    <div class="card">
      <h3>${icon('shield')} Privacy &amp; consent (POPIA)</h3>
      <p class="empty">You can grant or withdraw consent at any time, and request a copy or deletion of your data (DSAR).</p>
      <div class="toolbar">
        <button class="btn btn-sm" id="grant">${icon('check')}<span>Grant consent</span></button>
        <div class="spacer"></div>
        <button class="btn btn-sm" id="dsarBtn">${icon('file-text')}<span>New data request</span></button>
      </div>
      <div class="table-wrap" style="margin-top:12px">
        <table><thead><tr><th>Purpose</th><th>Status</th><th>Granted</th><th>Revoked</th><th></th></tr></thead>
        <tbody>${consents.length
          ? consents
              .map(
                (r) =>
                  `<tr><td>${esc(r.purpose || '—')}</td><td>${statusBadge(r.granted ? 'active' : 'inactive')}</td><td>${formatDate(
                    r.grantedAt
                  )}</td><td>${formatDate(r.revokedAt)}</td><td>${
                    r.granted ? `<button class="btn btn-sm" data-revoke="${esc(r.id)}">${icon('ban')}<span>Withdraw</span></button>` : ''
                  }</td></tr>`
              )
              .join('')
          : '<tr><td colspan="5" class="empty">No consent records yet.</td></tr>'}</tbody></table>
      </div>
    </div>
    <div class="card">
      <h3>${icon('file-text')} Data requests (DSAR)</h3>
      ${dsars.length
        ? tableSimple(
            ['Type', 'Status', 'Submitted', 'Due'],
            dsars.map((r) => [titleCase(r.type || 'access'), statusBadge(r.status), formatDate(r.createdAt), formatDate(r.dueAt)])
          )
        : '<p class="empty">No data requests yet.</p>'}
    </div>`;

  const grant = c.querySelector('#grant') as HTMLElement | null;
  if (grant) {
    grant.onclick = async () => {
      await openModal({
        title: 'Grant consent',
        fields: [
          {
            name: 'purpose',
            label: 'Purpose',
            type: 'select',
            options: purposes.map((p) => ({ value: p, label: titleCase(p) })),
            required: true
          },
          { name: 'wording', label: 'Consent wording', type: 'textarea', rows: 3, help: 'Edit if your data subject wording differs.' },
          { name: 'granted', label: 'Granted', type: 'select', options: [{ value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }] }
        ],
        onSubmit: async (v) => {
          const purpose = String(v.purpose);
          const r = await apiRequest('/consent', {
            method: 'POST',
            body: JSON.stringify({
              purpose,
              wording: v.wording || wordings[purpose] || 'I consent to the processing of my personal information.',
              mechanism: 'checkbox',
              granted: v.granted !== 'false'
            })
          });
          if (!r.success) throw new Error(r.message);
          toast('Consent recorded', 'success');
          privacy(c, ctx);
        }
      });
    };
  }

  const dsarBtn = c.querySelector('#dsarBtn') as HTMLElement | null;
  if (dsarBtn) {
    dsarBtn.onclick = async () => {
      await openModal({
        title: 'New data request',
        fields: [
          {
            name: 'type',
            label: 'Request type',
            type: 'select',
            options: [
              { value: 'access', label: 'Access my data' },
              { value: 'correct', label: 'Correct my data' },
              { value: 'delete', label: 'Delete my data' }
            ],
            required: true
          },
          { name: 'details', label: 'Details', type: 'textarea', rows: 3 }
        ],
        onSubmit: async (v) => {
          const r = await apiRequest('/dsar', { method: 'POST', body: JSON.stringify({ type: v.type, details: { note: v.details || '' } }) });
          if (!r.success) throw new Error(r.message);
          toast('Request submitted — response within 30 days', 'success');
          privacy(c, ctx);
        }
      });
    };
  }

  c.querySelectorAll('[data-revoke]').forEach((b) => {
    (b as HTMLElement).onclick = async () => {
      if (!(await confirmDialog('Withdraw this consent?', { danger: true, confirmLabel: 'Withdraw' }))) return;
      const id = (b as HTMLElement).dataset.revoke!;
      const r = await apiRequest(`/consent/${id}/revoke`, { method: 'POST' });
      if (!r.success) return toast(r.message || 'Could not withdraw', 'error');
      toast('Consent withdrawn', 'success');
      privacy(c, ctx);
    };
  });
}
