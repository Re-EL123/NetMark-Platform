import { apiRequest } from './api';
import { initPanel, NavItem } from './app';
import { esc, statusBadge } from './render';
import { openModal, toast, money, statCards, tableSimple } from './ui';
import { icon } from './icons';
import { chartCard, donutChart, barChart, ChartPoint } from './charts';

const VEHICLE_TYPE_OPTIONS = ['Motorbike', 'Car', 'Van', 'Bakkie', 'Bicycle', 'Truck'].map((v) => ({
  value: v.toLowerCase(),
  label: v
}));

function addressOf(value: any): string {
  if (!value) return '';
  if (typeof value === 'string') return value;
  return value.line1 || value.street || value.address || [value.suburb, value.city].filter(Boolean).join(', ') || '';
}

const nav: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', group: 'Overview', icon: 'gauge' },
  { id: 'available', label: 'Available Jobs', group: 'Deliveries', icon: 'map-pin' },
  { id: 'deliveries', label: 'My Deliveries', group: 'Deliveries', icon: 'truck' },
  { id: 'earnings', label: 'Earnings', group: 'Account', icon: 'banknote' },
  { id: 'profile', label: 'Profile', group: 'Account', icon: 'user' }
];

let driver: any = null;

initPanel({
  title: 'Driver',
  nav,
  tourIntro:
    'Your delivery hub. Go online to receive jobs, accept deliveries, update their status and track your earnings.',
  render: async (route, ctx) => {
    ctx.titleEl.textContent = nav.find((n) => n.id === route)?.label || 'Driver';
    if (!driver) {
      const me = await apiRequest('/drivers/me');
      ctx.container.innerHTML = me.success
        ? ''
        : `<div class="card"><p class="empty">${esc(me.message || 'Unable to load driver profile.')}</p></div>`;
      if (!me.success) return;
      driver = me.data.driver;
    }
    const c = ctx.container;
    if (route === 'dashboard') return dashboard(c, ctx);
    if (route === 'available') return available(c);
    if (route === 'deliveries') return deliveries(c, ctx);
    if (route === 'earnings') return earnings(c);
    if (route === 'profile') return profile(c);
  }
});

async function dashboard(c: HTMLElement, ctx: any) {
  const res = await apiRequest('/drivers/deliveries/mine');
  const all = res.success ? res.data.orders : [];
  const active = all.filter((o: any) => !['delivered', 'failed'].includes(o.deliveryStatus));
  const done = all.filter((o: any) => o.deliveryStatus === 'delivered');
  const stats = driver.stats || {};
  c.innerHTML = `
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
        <div>
          <p>Status: ${statusBadge(driver.status)} &nbsp; Availability: ${statusBadge(driver.isAvailable ? 'online' : 'offline')}</p>
          <p class="empty">${esc(driver.vehicleType || '')} ${esc(driver.vehicleNumber || '')}</p>
        </div>
        ${
          driver.status === 'approved'
            ? `<button class="btn btn-sm" id="toggleAvail">${icon('power')}<span>${driver.isAvailable ? 'Go Offline' : 'Go Online'}</span></button>`
            : ''
        }
      </div>
    </div>
    ${statCards([
      { label: 'Total deliveries', value: Number(stats.totalDeliveries || done.length), format: 'number', icon: 'package-check', tone: 'info' },
      { label: 'Active', value: active.length, format: 'number', icon: 'truck', tone: 'warning' },
      { label: 'Earnings', value: Number(stats.totalEarnings || 0), format: 'money', accent: true, icon: 'banknote', tone: 'brand' }
    ])}
    ${
      all.length
        ? `<div class="chart-grid">${chartCard(
            'Delivery status',
            donutChart(
              [
                { label: 'Active', value: active.length },
                { label: 'Delivered', value: done.length },
                { label: 'Failed', value: all.filter((o: any) => o.deliveryStatus === 'failed').length }
              ],
              { caption: 'orders' }
            ),
            { icon: 'pie-chart' }
          )}</div>`
        : ''
    }
    ${driver.status === 'pending' ? '<div class="card"><p class="empty">Your driver account is pending administrator approval.</p></div>' : ''}
    ${driver.status === 'rejected' ? `<div class="card"><p class="empty">Your application was rejected. ${esc(driver.rejectionReason || '')}</p></div>` : ''}
    ${driver.status === 'suspended' ? '<div class="card"><p class="empty">Your account is suspended. Contact your administrator.</p></div>' : ''}
    <div class="card"><h3>${icon('truck')} Active deliveries</h3>${tableSimple(
      ['Order', 'Status', 'Delivery', ''],
      active.map((o: any) => [
        esc(o.orderNumber || o.id.slice(0, 8)),
        statusBadge(o.orderStatus),
        statusBadge(o.deliveryStatus),
        `<button class="btn btn-sm" data-open="${esc(o.id)}">${icon('arrow-right')}<span>Manage</span></button>`
      ])
    )}</div>`;
  c.querySelectorAll('[data-open]').forEach((b) =>
    b.addEventListener('click', () => manageDelivery(all.find((o: any) => o.id === (b as HTMLElement).dataset.open), ctx))
  );
  const toggle = document.getElementById('toggleAvail');
  if (toggle)
    toggle.addEventListener('click', async () => {
      const r = await apiRequest('/drivers/availability', {
        method: 'PUT',
        body: JSON.stringify({ status: driver.isAvailable ? 'offline' : 'available' })
      });
      if (!r.success) return toast(r.message || 'Failed', 'error');
      driver.isAvailable = !driver.isAvailable;
      ctx.refresh();
    });
}

async function available(c: HTMLElement) {
  c.innerHTML = '<p class="empty">Loading…</p>';
  const res = await apiRequest('/drivers/deliveries/available');
  if (!res.success) {
    c.innerHTML = `<div class="card"><p class="empty">${esc(res.message || 'Unavailable')}</p></div>`;
    return;
  }
  const orders = res.data.orders || [];
  c.innerHTML = `<div class="card"><h3>Available jobs</h3>${tableSimple(
    ['Order', 'Amount', 'Deliver to', ''],
    orders.map((o: any) => [
      esc(o.orderNumber || o.id.slice(0, 8)),
      money(o.deliveryFee || o.total),
      esc(addressOf(o.address)),
      `<button class="btn btn-sm" data-accept="${esc(o.id)}">${icon('check')}<span>Accept</span></button>`
    ])
  )}</div>`;
  c.querySelectorAll('[data-accept]').forEach((b) =>
    b.addEventListener('click', async () => {
      const r = await apiRequest(`/drivers/deliveries/${(b as HTMLElement).dataset.accept}/accept`, { method: 'POST' });
      toast(r.success ? 'Job accepted' : r.message || 'Failed', r.success ? 'success' : 'error');
      if (r.success) available(c);
    })
  );
}

async function deliveries(c: HTMLElement, ctx: any) {
  c.innerHTML = '<p class="empty">Loading…</p>';
  const res = await apiRequest('/drivers/deliveries/mine');
  const orders = res.success ? res.data.orders : [];
  c.innerHTML = `<div class="card"><h3>My deliveries</h3>${tableSimple(
    ['Order', 'Status', 'Delivery', 'Earnings', ''],
    orders.map((o: any) => [
      esc(o.orderNumber || o.id.slice(0, 8)),
      statusBadge(o.orderStatus),
      statusBadge(o.deliveryStatus),
      money(o.deliveryFee || 0),
      `<button class="btn btn-sm" data-open="${esc(o.id)}">${icon('arrow-right')}<span>Open</span></button>`
    ])
  )}</div>`;
  c.querySelectorAll('[data-open]').forEach((b) =>
    b.addEventListener('click', () => manageDelivery(orders.find((o: any) => o.id === (b as HTMLElement).dataset.open), ctx))
  );
}

async function manageDelivery(order: any, ctx: any) {
  if (!order) return;
  const steps: Record<string, string | null> = {
    assigned: 'picked_up',
    picked_up: 'in_transit',
    in_transit: null
  };
  const nextStatus = steps[order.deliveryStatus];
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" style="max-width:460px">
      <div class="modal-header">
        <h3>Order ${esc(order.orderNumber || order.id.slice(0, 8))}</h3>
        <button class="modal-close" data-close>&times;</button>
      </div>
      <div class="modal-body">
        <div class="detail-grid">
          <div><span class="detail-label">Status</span><span>${statusBadge(order.orderStatus)}</span></div>
          <div><span class="detail-label">Delivery</span><span>${statusBadge(order.deliveryStatus)}</span></div>
          <div><span class="detail-label">Address</span><span>${esc(addressOf(order.address))}</span></div>
          <div><span class="detail-label">OTP</span><span>${esc(order.deliveryOtp || '')}</span></div>
        </div>
        ${
          order.deliveryStatus === 'delivered'
            ? '<p class="empty" style="margin-top:12px;display:flex;align-items:center;gap:6px">' + icon('check-circle-2') + 'Delivered</p>'
            : `<div style="margin-top:16px;display:flex;gap:10px;flex-wrap:wrap">
                ${nextStatus ? `<button class="btn btn-sm" id="advanceBtn">${icon('arrow-right')}<span>Mark ${esc(nextStatus.replace('_', ' '))}</span></button>` : ''}
                <button class="btn btn-sm" id="completeBtn">${icon('check')}<span>Complete delivery</span></button>
              </div>`
        }
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.querySelector('[data-close]')?.addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  document.getElementById('advanceBtn')?.addEventListener('click', async () => {
    const r = await apiRequest(`/drivers/deliveries/${order.id}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status: nextStatus })
    });
    toast(r.success ? 'Updated' : r.message || 'Failed', r.success ? 'success' : 'error');
    close();
    ctx.refresh();
  });
  document.getElementById('completeBtn')?.addEventListener('click', () => {
    close();
    openModal({
      title: 'Complete delivery',
      fields: [{ name: 'otp', label: 'Delivery OTP', required: true }, { name: 'notes', label: 'Notes', type: 'textarea' }],
      submitLabel: 'Confirm delivery',
      onSubmit: async (v) => {
        const r = await apiRequest(`/drivers/deliveries/${order.id}/complete`, { method: 'POST', body: JSON.stringify(v) });
        if (!r.success) throw new Error(r.message || 'Failed');
        toast('Delivery completed', 'success');
        ctx.refresh();
      }
    });
  });
}

async function earnings(c: HTMLElement) {
  const res = await apiRequest('/drivers/earnings');
  const list = res.success ? res.data.earnings : [];
  const summary = res.summary || { total: 0, pending: 0, count: 0 };

  const byDate = new Map<string, number>();
  for (const e of list) {
    const day = e.createdAt ? String(e.createdAt).slice(0, 10) : '';
    if (!day) continue;
    byDate.set(day, (byDate.get(day) || 0) + Number(e.amount || 0));
  }
  const series: ChartPoint[] = [...byDate.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-10)
    .map(([date, value]) => ({
      label: new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      value
    }));

  c.innerHTML = `
    ${statCards([
      { label: 'Total earned', value: Number(summary.total || 0), format: 'money', accent: true, icon: 'wallet', tone: 'brand' },
      { label: 'Pending', value: Number(summary.pending || 0), format: 'money', icon: 'clock', tone: 'warning' },
      { label: 'Deliveries paid', value: Number(summary.count || 0), format: 'number', icon: 'check-circle-2', tone: 'success' }
    ])}
    ${series.length ? `<div class="chart-grid">${chartCard('Earnings by day', barChart(series), { icon: 'bar-chart-3', sub: 'Last 10 days' })}</div>` : ''}
    <div class="card"><h3>${icon('receipt')} Earnings history</h3>${tableSimple(
      ['Order', 'Amount', 'Status', 'Date'],
      list.map((e: any) => [
        esc(e.orderId || ''),
        money(e.amount),
        statusBadge(e.status),
        e.createdAt ? new Date(e.createdAt).toLocaleDateString() : ''
      ])
    )}</div>`;
}

async function profile(c: HTMLElement) {
  const docs = Array.isArray(driver.documents) ? driver.documents : [];
  c.innerHTML = `
    <div class="card">
      <h3>Driver profile</h3>
      <div class="profile-head">
        <span class="profile-avatar">${driver.profileImage ? `<img src="${esc(driver.profileImage)}" alt="" />` : icon('truck')}</span>
        <div class="detail-grid">
          <div><span class="detail-label">Vehicle type</span><span>${esc(driver.vehicleType || '')}</span></div>
          <div><span class="detail-label">Vehicle number</span><span>${esc(driver.vehicleNumber || '')}</span></div>
          <div><span class="detail-label">Model</span><span>${esc(driver.vehicleModel || '')}</span></div>
          <div><span class="detail-label">Licence no.</span><span>${esc(driver.licenseNumber || '')}</span></div>
        </div>
      </div>
      ${
        docs.length
          ? `<div class="doc-list">${docs
              .map((d: any) => `<a class="doc-chip" href="${esc(d.url)}" target="_blank" rel="noopener">${icon('file-text')}<span>${esc(d.name || 'Document')}</span></a>`)
              .join('')}</div>`
          : ''
      }
      <button class="btn btn-sm" id="editVehicle" style="margin-top:16px">${icon('pencil')}<span>Edit vehicle details</span></button>
    </div>`;
  (document.getElementById('editVehicle') as HTMLElement).onclick = () =>
    openModal({
      title: 'Edit vehicle details',
      fields: [
        { name: 'profileImage', label: 'Profile photo', type: 'image', folder: 'drivers', value: driver.profileImage },
        { name: 'vehicleType', label: 'Vehicle type', type: 'select', options: VEHICLE_TYPE_OPTIONS, value: driver.vehicleType },
        { name: 'vehicleNumber', label: 'Vehicle number', value: driver.vehicleNumber },
        { name: 'vehicleModel', label: 'Vehicle model', value: driver.vehicleModel },
        { name: 'licenseNumber', label: 'Licence number', value: driver.licenseNumber },
        { name: 'licenseExpiry', label: 'Licence expiry', type: 'date', value: driver.licenseExpiry ? String(driver.licenseExpiry).slice(0, 10) : '' },
        { name: 'documents', label: 'Documents', type: 'documents', folder: 'drivers', value: driver.documents, help: 'Licence, ID and vehicle papers.' }
      ],
      onSubmit: async (v) => {
        const r = await apiRequest('/drivers/me', { method: 'PUT', body: JSON.stringify(v) });
        if (!r.success) throw new Error(r.message || 'Failed');
        driver = { ...driver, ...v };
        toast('Profile updated', 'success');
        profile(c);
      }
    });
}
