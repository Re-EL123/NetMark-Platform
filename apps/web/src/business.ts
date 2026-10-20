import { apiRequest, submitPayFast } from './api';
import { STOREFRONT_BASE_URL } from './config';
import { initPanel, NavItem } from './app';
import { esc, statusBadge, badge, formatDate } from './render';
import { crudView } from './crud';
import { openModal, confirmDialog, toast, money, titleCase, emptyState, act, wire, tableSimple } from './ui';
import { icon, iconify } from './icons';
import { overviewStats, renderOverviewCharts } from './dashboard';
import { renderReferrals } from './referralsView';
import { renderWallet } from './walletView';
import { getMyReferralCode, shareLink, shareUrl } from './referral';
import { qrSvg, downloadQrPng, downloadQrSvg } from './qr';

function opts(values: string[]) {
  return values.map((v) => ({ value: v, label: titleCase(v) }));
}

const nav: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', group: 'Overview', icon: 'layout-dashboard' },
  { id: 'stores', label: 'My Stores', group: 'Stores', capability: 'stores.read', icon: 'store' },
  { id: 'storefront', label: 'Storefront', group: 'Stores', capability: 'stores.read', icon: 'globe' },
  { id: 'store-market', label: 'Buy Store', group: 'Stores', icon: 'shopping-bag' },
  { id: 'code-market', label: 'Buy Codes', group: 'Stores', icon: 'shopping-cart' },
  { id: 'companies', label: 'Companies', group: 'Stores', capability: 'companies.link', icon: 'building-2' },
  { id: 'catalog', label: 'Catalog', group: 'Stores', capability: 'products.read', icon: 'package-search' },
  { id: 'listings', label: 'My Store Products', group: 'Stores', capability: 'products.read', icon: 'boxes' },
  { id: 'purchases', label: 'Buy From Company', group: 'Sales', capability: 'orders.read', icon: 'shopping-bag' },
  { id: 'orders', label: 'Orders', group: 'Sales', capability: 'orders.read', icon: 'receipt' },
  { id: 'appointments', label: 'Appointments', group: 'Sales', capability: 'appointments.read', icon: 'calendar-clock' },
  { id: 'referrals', label: 'Referrals & Network', group: 'Growth', capability: 'referrals.read', icon: 'share-2' },
  { id: 'wallet', label: 'Wallet', group: 'Finance', icon: 'wallet' },
  { id: 'reports', label: 'Reports', group: 'Finance', capability: 'reports.read', icon: 'bar-chart-3' }
];

initPanel({
  title: 'Business Portal',
  nav,
  tourIntro:
    'Manage your stores, link companies with a code, list their products at your own price, and fulfil orders. This tour shows you where everything lives.',
  render: async (route, ctx) => {
    const c = ctx.container;
    ctx.titleEl.textContent = nav.find((n) => n.id === route)?.label || 'Business';
    if (route === 'dashboard') return dashboard(c);
    if (route === 'stores') return stores(c);
    if (route === 'storefront') return storefront(c);
    if (route === 'store-market') return storeMarket(c);
    if (route === 'code-market') return codeMarket(c);
    if (route === 'companies') return companies(c);
    if (route === 'catalog') return catalog(c);
    if (route === 'listings') return listings(c);
    if (route === 'purchases') return purchases(c);
    if (route === 'orders') return orders(c);
    if (route === 'appointments') return appointments(c);
    if (route === 'referrals' || route === 'team') return referrals(c);
    if (route === 'wallet') return renderWallet(c);
    if (route === 'reports') return reports(c);
  }
});

async function myStores(): Promise<any[]> {
  const res = await apiRequest('/stores?pageSize=100');
  return res.data || [];
}

async function dashboard(c: HTMLElement) {
  const res = await apiRequest('/reports/overview');
  if (!res.success) {
    c.innerHTML = emptyState(res.message || 'Unable to load your dashboard.', 'alert-triangle');
    return;
  }
  const d = res.data;
  c.innerHTML = `
    ${overviewStats(d)}
    ${renderOverviewCharts(d)}
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
    toolbar: () => `<button class="btn btn-sm" data-new>${icon('plus')}<span>New store</span></button>`,
    actions: (r) => act('edit', r.id, 'Edit') + act('toggle', r.id, r.isActive ? 'Deactivate' : 'Activate'),
    bind: (root, reload) => {
      (root.querySelector('[data-new]') as HTMLElement).onclick = () =>
        openModal({
          title: 'New store',
          fields: [
            { name: 'name', label: 'Store name', required: true },
            { name: 'logo', label: 'Store logo', type: 'image', folder: 'stores' },
            { name: 'address', label: 'Address', address: true }
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
              { name: 'logo', label: 'Store logo', type: 'image', folder: 'stores', value: rows.find((r) => r.id === id)?.logo },
              { name: 'address', label: 'Address', address: true, value: rows.find((r) => r.id === id)?.address }
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
          <button class="btn btn-sm" id="linkCompany">${icon('plus')}<span>Link a company</span></button>
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
                  <td>${esc(r.companyName || r.companyId || '')}</td>
                  <td>${r.code ? badge(esc(r.code), 'info') : ''}</td>
                  <td>${statusBadge(r.status)}</td>
                  <td>${r.expiresAt ? formatDate(r.expiresAt) : '<span class="empty">Never</span>'}</td>
                  <td><div class="row-actions">
                    ${act('share', r.id, 'Share')}
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
      share: async (id) => {
        const row = rows.find((r) => r.id === id);
        const code = await getMyReferralCode();
        await shareLink(shareUrl('shop/', code), row?.companyName || 'NetMark', `Shop ${row?.companyName || ''} on NetMark`.trim());
      },
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

/**
 * Store-owner Growth page: the referral link/earnings dashboard plus the
 * member's own downline network (recruited members, ranks, personal/group BV)
 * in each company they buy from.
 */
async function referrals(c: HTMLElement) {
  await renderReferrals(c);
  const heading = document.createElement('div');
  heading.className = 'network-heading';
  heading.innerHTML = `<h2>${icon('users')} Your network</h2>`;
  c.appendChild(heading);
  const section = document.createElement('div');
  section.id = 'network';
  c.appendChild(section);
  await team(section);
  iconify(heading);
}

function rankProgressHtml(me: any, ranks: any[]): string {
  if (!ranks.length) return '';
  const level = Number(me?.rankLevel || 0);
  const next = ranks
    .filter((r) => Number(r.level) > level)
    .sort((a, b) => Number(a.level) - Number(b.level))[0];
  if (!next) {
    return `<div class="card"><h3>${icon('trending-up')} Rank progress</h3>
      <p class="empty">You have reached the top rank${me?.rankName ? ` (${esc(me.rankName)})` : ''}.</p></div>`;
  }
  const bar = (label: string, current: number, target: number) => {
    const pct = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 100;
    return `<div class="progress-row">
      <span class="progress-label">${label}</span>
      <span class="progress"><span class="progress-fill" style="width:${pct}%"></span></span>
      <span class="progress-value">${money(current)} / ${money(target)}</span>
    </div>`;
  };
  return `<div class="card">
    <h3>${icon('trending-up')} Rank progress — next: ${esc(next.name)}</h3>
    <p class="empty">Promotions never expire. Grow your personal and group volume to reach the next rank.</p>
    ${next.minPersonalBv > 0 ? bar('Personal BV', Number(me?.personalBv || 0), Number(next.minPersonalBv)) : ''}
    ${next.minGroupBv > 0 ? bar('Group BV', Number(me?.groupBv || 0), Number(next.minGroupBv)) : ''}
  </div>`;
}

async function team(c: HTMLElement) {
  c.innerHTML = '<p class="empty">Loading your network…</p>';
  const [mine, ranksRes] = await Promise.all([
    apiRequest('/memberships'),
    apiRequest('/memberships/ranks').catch(() => null)
  ]);
  const memberships: any[] = (mine.success && mine.data) || [];
  const ranks: any[] = (ranksRes?.success && ranksRes.data) || [];
  if (!memberships.length) {
    c.innerHTML = emptyState(
      'You are not part of a network yet. Link a company with a code (or enter one at sign-up) to join its downline.',
      'users'
    );
    return;
  }

  const load = async (companyId: string) => {
    const res = await apiRequest(`/memberships/team?companyId=${encodeURIComponent(companyId)}`);
    const team = (res.success && res.data) || { me: null, members: [], counts: { direct: 0, total: 0 } };
    const me = team.me || memberships.find((m) => m.companyId === companyId) || null;
    const companyOpts =
      memberships.length > 1
        ? `<div class="form-group" style="max-width:320px"><label for="teamCompany">Company network</label><select id="teamCompany">${memberships
            .map((m) => `<option value="${esc(m.companyId)}" ${m.companyId === companyId ? 'selected' : ''}>${esc(m.companyName || 'Company')}</option>`)
            .join('')}</select></div>`
        : '';
    const status = me?.status || 'active';

    c.innerHTML = `
      ${companyOpts}
      <div class="card">
        <h3>Your membership</h3>
        <div class="detail-grid">
          <div><span class="empty">Member number</span><div>${badge(me?.memberNo || '—', 'info')}</div></div>
          <div><span class="empty">Rank</span><div>${esc(me?.rankName || '—')}</div></div>
          <div><span class="empty">Status</span><div>${statusBadge(status)}</div></div>
          <div><span class="empty">Personal BV</span><div>${money(me?.personalBv || 0)}</div></div>
          <div><span class="empty">Group BV</span><div>${money(me?.groupBv || 0)}</div></div>
          <div><span class="empty">Downline</span><div>${team.counts.total || 0} (${team.counts.direct || 0} direct)</div></div>
        </div>
        <p class="empty" style="margin-top:10px">Your member number never expires. Pause or resume your activity at any time.</p>
        <div class="row-actions">
          ${
            status === 'paused'
              ? `<button class="btn btn-sm" data-status="active">${icon('play')}<span>Resume activity</span></button>`
              : `<button class="btn btn-sm btn-ghost" data-status="paused">${icon('pause')}<span>Pause activity</span></button>`
          }
          <button class="btn btn-sm" id="shareRecruit">${icon('share-2')}<span>Recruit members</span></button>
        </div>
      </div>
      ${rankProgressHtml(me, ranks)}
      <div class="card">
        <h3>Your downline</h3>
        ${
          (team.members || []).length
            ? `<div class="table-wrap"><table><thead><tr><th>Member</th><th>Member no.</th><th>Rank</th><th>Status</th><th>Personal BV</th><th>Group BV</th><th>Joined</th></tr></thead><tbody>${team.members
                .map(
                  (m: any) => `<tr>
                <td>${esc(m.memberName || '—')}${m.memberEmail ? ` <span class="empty">${esc(m.memberEmail)}</span>` : ''}</td>
                <td>${badge(m.memberNo, 'info')}</td>
                <td>${esc(m.rankName || '—')}</td>
                <td>${statusBadge(m.status)}</td>
                <td>${money(m.personalBv || 0)}</td>
                <td>${money(m.groupBv || 0)}</td>
                <td>${formatDate(m.joinedAt)}</td>
              </tr>`
                )
                .join('')}</tbody></table></div>`
            : '<p class="empty">No one in your downline yet. Share your code to recruit members.</p>'
        }
      </div>`;

    const sel = c.querySelector('#teamCompany') as HTMLSelectElement | null;
    if (sel) sel.onchange = () => load(sel.value);

    c.querySelectorAll('[data-status]').forEach((b) =>
      b.addEventListener('click', async () => {
        const next = (b as HTMLElement).dataset.status!;
        const res = await apiRequest(`/memberships/${me.id}`, { method: 'PUT', body: JSON.stringify({ status: next }) });
        if (!res.success) return toast(res.message || 'Failed', 'error');
        toast(next === 'paused' ? 'Activity paused' : 'Activity resumed', 'success');
        load(companyId);
      })
    );

    const share = c.querySelector('#shareRecruit');
    if (share)
      (share as HTMLElement).onclick = async () => {
        const code = await getMyReferralCode();
        await shareLink(shareUrl('register', code), me?.companyName || 'NetMark', `Join my ${me?.companyName || 'NetMark'} team`);
      };
  };

  load(memberships[0].companyId);
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
        <div class="thumb">${p.image ? `<img src="${esc(p.image)}" alt="${esc(p.name)}">` : icon('package-search')}</div>
        <div class="body">
          <div class="name">${esc(p.name)}</div>
          <div class="desc">${esc(p.description || p.category || '')}</div>
          <div class="price">Company price ${money(p.price)}</div>
          <div class="row-actions">
            <button class="btn btn-sm" data-add="${esc(p.id)}" ${storeOpts.length ? '' : 'disabled'}>${icon(
              'shopping-cart'
            )}<span>Add to my store</span></button>
            <button class="btn btn-sm" data-share-p="${esc(p.id)}">${icon('share-2')}<span>Share</span></button>
          </div>
        </div>
      </div>`
        )
        .join('')}
    </div>`;

  if (!storeOpts.length) {
    c.querySelectorAll('[data-add]').forEach((b) => ((b as HTMLButtonElement).title = 'Create a store first'));
  }

  c.querySelectorAll('[data-share-p]').forEach((b) =>
    b.addEventListener('click', async () => {
      const product = products.find((p: any) => p.id === (b as HTMLElement).dataset.shareP);
      const code = await getMyReferralCode();
      await shareLink(shareUrl('shop/', code), product?.name || 'NetMark product', `Check out ${product?.name || 'this product'} on NetMark`);
    })
  );

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
            min: 0,
            value: product?.price,
            help: `Company price ${money(product?.price)} — set a higher price to earn a margin.`
          },
          {
            name: 'mode',
            label: 'How you source it',
            type: 'select',
            options: [
              { value: 'add', label: 'Add (no upfront buy — earn retail − wholesale)' },
              { value: 'wholesale', label: 'Wholesale (prepay stock, keep full retail)' }
            ],
            value: 'add',
            help: 'Add: the company fulfils and you earn the margin per sale. Wholesale: buy stock first from the Buy From Company tab and keep the full retail.'
          }
        ],
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
      { key: 'mode', label: 'Sourcing', render: (r) => badge(r.mode === 'wholesale' ? 'Wholesale' : 'Add', r.mode === 'wholesale' ? 'info' : 'neutral') },
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
              { name: 'price', label: 'Your retail price', type: 'number', step: '0.01', min: 0, value: row?.price, help: `Company price ${money(row?.basePrice)}` },
              {
                name: 'mode',
                label: 'Sourcing',
                type: 'select',
                value: row?.mode || 'add',
                options: [
                  { value: 'add', label: 'Add — earn the retail−wholesale spread' },
                  { value: 'wholesale', label: 'Wholesale — you own the stock, keep full retail' }
                ]
              }
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
      <button class="btn" id="placeBuy">${icon('shopping-bag')}<span>Place purchase order</span></button>
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
  toast('Redirecting to PayFast…', 'info');
  submitPayFast(processUrl, fields);
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
    )}</div>`;
}

/* ------------------------------- storefront ---------------------------- */
/** Public, server-rendered storefront URL (branded storefront host at /s/<slug>). */
function storefrontLink(slug: string, refCode?: string | null): string {
  const url = `${STOREFRONT_BASE_URL}/s/${encodeURIComponent(slug)}`;
  return refCode ? `${url}?ref=${encodeURIComponent(refCode)}` : url;
}

function sfConfig(r: any): any {
  const sf = r?.settings?.storefront;
  return sf && typeof sf === 'object' ? sf : {};
}

async function storefront(c: HTMLElement) {
  c.innerHTML = '<p class="empty">Loading your storefronts…</p>';
  let stores: any[] = [];
  try {
    stores = await myStores();
  } catch {
    stores = [];
  }
  stores = stores.filter((r) => r.slug);
  const refCode = await getMyReferralCode().catch(() => null);

  if (!stores.length) {
    c.innerHTML = emptyState('Create a store first — then you can publish a shareable storefront landing page for it.', 'globe');
    return;
  }

  const render = () => {
    c.innerHTML = `
      <div class="card">
        <p class="empty">Each store gets its own public landing page with a shareable link and its own SEO. Share it on WhatsApp or social media — visitors can browse your products and contact you directly.</p>
      </div>
      ${stores
        .map((r) => {
          const sf = sfConfig(r);
          const enabled = sf.enabled !== false && r.isActive;
          const url = storefrontLink(r.slug, refCode);
          const st = (r.settings && r.settings.storefrontStats) || {};
          const views = Number(st.view || 0);
          const contacts = Number(st.contact || 0);
          const featuredCount = Array.isArray(sf.featured) ? sf.featured.length : 0;
          return `<div class="card">
            <div class="sf-store-head">
              ${r.logo ? `<img class="sf-store-logo" src="${esc(r.logo)}" alt="" />` : `<span class="sf-store-logo ph">${esc((r.name || '?').charAt(0).toUpperCase())}</span>`}
              <div class="sf-store-info">
                <h3 class="sf-store-name">${esc(r.name)} ${badge(enabled ? 'Live' : r.isActive ? 'Disabled' : 'Store inactive', enabled ? 'success' : 'warning')}</h3>
                <div class="sf-store-url-row">
                  <span class="sf-store-url" title="${esc(url)}">${esc(url)}</span>
                  <button class="icon-btn" data-sf-copy="${esc(r.id)}" data-tip="Copy link" title="Copy link" aria-label="Copy storefront link">${icon('copy')}</button>
                </div>
                <div class="sf-store-meta">
                  <span>${icon('eye')} ${views} view${views === 1 ? '' : 's'}</span>
                  <span>${icon('message-circle')} ${contacts} contact${contacts === 1 ? '' : 's'}</span>
                  <span>${icon('star')} ${featuredCount} featured</span>
                </div>
              </div>
              <label class="nm-switch nm-switch-sm sf-store-toggle" title="${sf.enabled === false ? 'Storefront disabled — turn on to publish' : 'Storefront live — turn off to hide'}" data-tip="${sf.enabled === false ? 'Enable storefront' : 'Disable storefront'}" data-tip-pos="left">
                <input type="checkbox" data-sf-enable="${esc(r.id)}" ${sf.enabled === false ? '' : 'checked'} aria-label="Toggle storefront visibility" />
                <span class="nm-switch-track" aria-hidden="true"></span>
              </label>
            </div>
            <div class="row-actions sf-actions">
              <button class="btn btn-sm" data-sf-open="${esc(r.id)}">${icon('external-link')}<span>Open</span></button>
              <button class="btn btn-sm btn-ghost" data-sf-qr="${esc(r.id)}">${icon('qr-code')}<span>QR code</span></button>
              <button class="btn btn-sm btn-ghost" data-sf-share="${esc(r.id)}">${icon('share-2')}<span>Share</span></button>
              <button class="btn btn-sm btn-ghost" data-sf-featured="${esc(r.id)}">${icon('star')}<span>Featured</span></button>
              <button class="btn btn-sm btn-ghost" data-sf-edit="${esc(r.id)}">${icon('pencil')}<span>Edit page</span></button>
            </div>
            ${!r.isActive ? '<p class="empty" style="margin-top:10px">This store is deactivated, so its storefront is hidden from visitors.</p>' : ''}
          </div>`;
        })
        .join('')}`;

    const byId = (id: string) => stores.find((s) => s.id === id);

    c.querySelectorAll('[data-sf-copy]').forEach((el) => {
      (el as HTMLElement).onclick = async () => {
        const r = byId((el as HTMLElement).dataset.sfCopy!);
        if (!r) return;
        const url = storefrontLink(r.slug, refCode);
        try {
          await navigator.clipboard.writeText(url);
          toast('Storefront link copied', 'success');
        } catch {
          toast(url, 'info');
        }
      };
    });
    c.querySelectorAll('[data-sf-open]').forEach((el) => {
      (el as HTMLElement).onclick = () => {
        const r = byId((el as HTMLElement).dataset.sfOpen!);
        if (r) window.open(storefrontLink(r.slug, refCode), '_blank', 'noopener');
      };
    });
    c.querySelectorAll('[data-sf-share]').forEach((el) => {
      (el as HTMLElement).onclick = () => {
        const r = byId((el as HTMLElement).dataset.sfShare!);
        if (r) void shareLink(storefrontLink(r.slug, refCode), r.name, `Browse ${r.name} online.`);
      };
    });
    c.querySelectorAll('[data-sf-enable]').forEach((el) => {
      (el as HTMLInputElement).onchange = async () => {
        const input = el as HTMLInputElement;
        const r = byId(input.dataset.sfEnable!);
        if (!r) return;
        const sf = sfConfig(r);
        const next = { ...sf, enabled: input.checked };
        const res = await apiRequest(`/stores/${r.id}`, { method: 'PUT', body: JSON.stringify({ settings: { storefront: next } }) });
        if (!res.success) {
          input.checked = !input.checked;
          return toast(res.message || 'Could not update', 'error');
        }
        if (res.data) r.settings = res.data.settings;
        toast(next.enabled ? 'Storefront enabled' : 'Storefront disabled', 'success');
        render();
      };
    });
    c.querySelectorAll('[data-sf-edit]').forEach((el) => {
      (el as HTMLElement).onclick = () => {
        const r = byId((el as HTMLElement).dataset.sfEdit!);
        if (r) editStorefront(r, render);
      };
    });
    c.querySelectorAll('[data-sf-qr]').forEach((el) => {
      (el as HTMLElement).onclick = () => {
        const r = byId((el as HTMLElement).dataset.sfQr!);
        if (r) showStorefrontQr(r, refCode);
      };
    });
    c.querySelectorAll('[data-sf-featured]').forEach((el) => {
      (el as HTMLElement).onclick = () => {
        const r = byId((el as HTMLElement).dataset.sfFeatured!);
        if (r) editFeatured(r, render);
      };
    });
  };

  render();
}

function showStorefrontQr(r: any, refCode: string | null) {
  const url = storefrontLink(r.slug, refCode);
  void openModal({
    title: `QR code — ${r.name}`,
    submitLabel: 'Done',
    html: `<div style="text-align:center">
      <div style="display:inline-block;background:#fff;padding:14px;border-radius:14px">${qrSvg(url, 5, 2)}</div>
      <p class="empty" style="word-break:break-all;font-size:12px;margin-top:14px">${esc(url)}</p>
      <div class="row-actions" style="justify-content:center;margin-top:12px">
        <button type="button" class="btn btn-sm" data-qr-png>Download PNG</button>
        <button type="button" class="btn btn-sm btn-ghost" data-qr-svg>Download SVG</button>
      </div>
      <p class="empty" style="font-size:12px;margin-top:10px">Print it on signage, flyers or packaging so customers can scan straight to your storefront.</p>
    </div>`,
    onMount: (body) => {
      (body.querySelector('[data-qr-png]') as HTMLElement | null)?.addEventListener('click', () =>
        downloadQrPng(url, `storefront-${r.slug}.png`)
      );
      (body.querySelector('[data-qr-svg]') as HTMLElement | null)?.addEventListener('click', () =>
        downloadQrSvg(url, `storefront-${r.slug}.svg`)
      );
    },
    onSubmit: () => undefined
  });
}

function editFeatured(r: any, done: () => void) {
  const sf = sfConfig(r);
  const selected = new Set<string>(Array.isArray(sf.featured) ? sf.featured : []);
  let box: HTMLElement | null = null;
  void openModal({
    title: `Featured products — ${r.name}`,
    wide: true,
    submitLabel: 'Save featured',
    html: `<div id="sfFeatList"><p class="empty">Loading products…</p></div>
      <p class="empty" style="font-size:12px;margin-top:10px"><strong id="sfFeatCount">0</strong> selected · tick the products to feature, then drag the rows to set the order they appear in.</p>`,
    onMount: async (body) => {
      box = body.querySelector('#sfFeatList') as HTMLElement;
      const countEl = body.querySelector('#sfFeatCount') as HTMLElement | null;
      const res = await apiRequest(`/store-products?storeId=${encodeURIComponent(r.id)}&pageSize=200`);
      const rows: any[] = (res.success && res.data) || [];
      if (!box) return;
      if (!rows.length) {
        box.innerHTML = '<p class="empty">No products listed yet. Add products under “My Store Products” first.</p>';
        return;
      }
      box.innerHTML = `<div class="sf-feat-pick">${rows
        .map(
          (l) => `<label class="sf-feat-item">
            <input type="checkbox" value="${esc(l.id)}" ${selected.has(l.id) ? 'checked' : ''} />
            <span class="sf-feat-grip" aria-hidden="true">${icon('menu')}</span>
            ${l.image ? `<img src="${esc(l.image)}" alt="" />` : '<span class="sf-feat-ph"></span>'}
            <span class="sf-feat-name">${esc(l.name)}</span>
            <span class="empty">${money(l.price)}</span>
          </label>`
        )
        .join('')}</div>`;
      iconify(box);

      const list = box.querySelector('.sf-feat-pick') as HTMLElement;
      const syncCount = () => {
        if (countEl) countEl.textContent = String(list.querySelectorAll('input:checked').length);
      };
      list.addEventListener('change', (e) => {
        if ((e.target as HTMLElement).matches('input[type=checkbox]')) syncCount();
      });

      let dragEl: HTMLElement | null = null;
      const rowAfter = (y: number) =>
        Array.from(list.querySelectorAll<HTMLElement>('.sf-feat-item:not(.dragging)')).find((el) => {
          const b = el.getBoundingClientRect();
          return y < b.top + b.height / 2;
        }) || null;
      list.querySelectorAll<HTMLElement>('.sf-feat-item').forEach((item) => {
        item.draggable = true;
        item.addEventListener('dragstart', (e) => {
          dragEl = item;
          item.classList.add('dragging');
          const dt = (e as DragEvent).dataTransfer;
          if (dt) {
            dt.effectAllowed = 'move';
            dt.setData('text/plain', '');
          }
        });
        item.addEventListener('dragend', () => {
          item.classList.remove('dragging');
          dragEl = null;
        });
      });
      list.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (!dragEl) return;
        const ref = rowAfter((e as DragEvent).clientY);
        if (ref == null) list.appendChild(dragEl);
        else list.insertBefore(dragEl, ref);
      });
      syncCount();
    },
    onSubmit: async () => {
      const ids = Array.from(box?.querySelectorAll('input[type=checkbox]:checked') || []).map((el) => (el as HTMLInputElement).value);
      const next = { ...sfConfig(r), featured: ids };
      const res = await apiRequest(`/stores/${r.id}`, { method: 'PUT', body: JSON.stringify({ settings: { storefront: next } }) });
      if (!res.success) throw new Error(res.message || 'Could not save featured products');
      if (res.data) r.settings = res.data.settings;
      toast('Featured products saved', 'success');
      done();
    }
  });
}

/** Lightweight live preview of the public storefront, fed by the edit form. */
function sfPreview(host: HTMLElement, store: any): string {
  const val = (n: string) => {
    const el = host.querySelector(`[name="${n}"]`) as HTMLInputElement | HTMLTextAreaElement | null;
    return (el?.value || '').trim();
  };
  const on = (n: string) => !!(host.querySelector(`[name="${n}"]`) as HTMLInputElement | null)?.checked;
  const accent = val('themeColor') || '#e50914';
  const logo = val('logo');
  const banner = val('banner');
  const tagline = val('tagline');
  const about = val('about');
  const cta = val('ctaLabel') || 'Contact us';
  const contact = [
    val('phone') ? `${icon('phone')} ${esc(val('phone'))}` : '',
    val('whatsapp') ? `${icon('message-circle')} ${esc(val('whatsapp'))}` : '',
    val('email') ? `${icon('mail')} ${esc(val('email'))}` : '',
    val('address') ? `${icon('map-pin')} ${esc(val('address'))}` : '',
    val('hours') ? `${icon('clock')} ${esc(val('hours'))}` : ''
  ].filter(Boolean);
  const socials = (['facebook', 'instagram', 'tiktok', 'x'] as const).filter((k) => val(k));

  return `<div class="sfp" style="--sf-accent:${esc(accent)}">
    <div class="sfp-hero"${banner ? ` style="background-image:linear-gradient(rgba(0,0,0,.5),rgba(0,0,0,.5)),url('${esc(banner)}')"` : ''}>
      ${logo ? `<img class="sfp-logo" src="${esc(logo)}" alt="" />` : ''}
      <h1>${esc(store?.name || 'Your store')}</h1>
      ${tagline ? `<p class="sfp-tag">${esc(tagline)}</p>` : ''}
      <span class="sfp-cta">${esc(cta)}</span>
    </div>
    <div class="sfp-body">
      ${about ? `<p class="sfp-about">${esc(about)}</p>` : ''}
      ${on('showProducts') ? `<div class="sfp-products">${'<span class="sfp-prod"></span>'.repeat(3)}</div>` : ''}
      ${contact.length ? `<ul class="sfp-contact">${contact.map((c) => `<li>${c}</li>`).join('')}</ul>` : ''}
      ${socials.length ? `<div class="sfp-socials">${socials.map((s) => `<span>${esc(s)}</span>`).join('')}</div>` : ''}
      ${!tagline && !about && !contact.length ? '<p class="sfp-empty">Fill in the form to see a live preview.</p>' : ''}
    </div>
  </div>`;
}

function editStorefront(r: any, done: () => void) {
  const sf = sfConfig(r);
  void openModal({
    title: `Storefront — ${r.name}`,
    wide: true,
    submitLabel: 'Save storefront',
    fields: [
      { name: 'secPublish', label: 'Publishing', type: 'section' },
      { name: 'enabled', label: 'Publish storefront', type: 'switch', value: sf.enabled !== false, help: 'Turn off to hide the page from visitors.' },
      { name: 'showProducts', label: 'Show products on the page', type: 'switch', value: sf.showProducts !== false },
      { name: 'tagline', label: 'Tagline', value: sf.tagline, placeholder: 'Fresh produce delivered daily', full: true },
      { name: 'about', label: 'About your store', type: 'textarea', rows: 4, value: sf.about, placeholder: 'Tell customers who you are and what you sell.', full: true },

      { name: 'secBrand', label: 'Branding & call to action', type: 'section' },
      { name: 'logo', label: 'Logo', type: 'image', folder: 'stores', value: sf.logo || r.logo },
      { name: 'banner', label: 'Banner image', type: 'image', folder: 'stores', value: sf.banner || r.banner, help: 'Wide image shown behind the top of the page.' },
      { name: 'themeColor', label: 'Accent colour', type: 'color', value: sf.themeColor || '#e50914', help: 'Used for the hero and buttons on your page.' },
      { name: 'ctaLabel', label: 'Main button label', value: sf.ctaLabel, placeholder: 'Order on WhatsApp' },

      { name: 'secContact', label: 'Contact details', type: 'section' },
      { name: 'phone', label: 'Phone', type: 'tel', value: sf.phone },
      { name: 'whatsapp', label: 'WhatsApp number', type: 'tel', value: sf.whatsapp, help: 'Include country code, e.g. +27…' },
      { name: 'email', label: 'Email', type: 'email', value: sf.email },
      { name: 'address', label: 'Address', address: true, value: sf.address || r.address },
      { name: 'hours', label: 'Opening hours', value: sf.hours, placeholder: 'Mon–Fri 8:00–17:00' },

      { name: 'secSocial', label: 'Social links', type: 'section' },
      { name: 'facebook', label: 'Facebook URL', type: 'url', value: sf.social?.facebook, placeholder: 'https://facebook.com/…' },
      { name: 'instagram', label: 'Instagram URL', type: 'url', value: sf.social?.instagram, placeholder: 'https://instagram.com/…' },
      { name: 'tiktok', label: 'TikTok URL', type: 'url', value: sf.social?.tiktok, placeholder: 'https://tiktok.com/…' },
      { name: 'x', label: 'X (Twitter) URL', type: 'url', value: sf.social?.x, placeholder: 'https://x.com/…' },

      { name: 'secSeo', label: 'Search engine listing', type: 'section' },
      { name: 'metaTitle', label: 'SEO title', value: sf.metaTitle, placeholder: r.name, help: 'Shown in Google and link previews.', counter: 60, full: true },
      { name: 'metaDescription', label: 'SEO description', type: 'textarea', rows: 2, value: sf.metaDescription, placeholder: 'A one-sentence summary of what you sell.', help: 'Aim for about 150–160 characters.', counter: 160, full: true },
      { name: 'metaKeywords', label: 'SEO keywords', value: sf.metaKeywords, placeholder: 'comma, separated, keywords', full: true }
    ],
    onMount: (body, overlay) => {
      (overlay.querySelector('.modal') as HTMLElement | null)?.classList.add('sf-edit-wide');
      const fieldsCol = document.createElement('div');
      fieldsCol.className = 'sf-edit-fields';
      const previewCol = document.createElement('aside');
      previewCol.className = 'sf-edit-preview';
      const errBox = body.querySelector('.error-modal');
      Array.from(body.children).forEach((ch) => {
        if (ch !== errBox) fieldsCol.appendChild(ch);
      });
      const grid = document.createElement('div');
      grid.className = 'sf-edit-grid';
      grid.appendChild(fieldsCol);
      grid.appendChild(previewCol);
      body.appendChild(grid);
      const refresh = () => {
        previewCol.innerHTML = sfPreview(fieldsCol, r);
        iconify(previewCol);
      };
      fieldsCol.addEventListener('input', refresh);
      fieldsCol.addEventListener('change', refresh);
      refresh();
    },
    onSubmit: async (v) => {
      const next = {
        enabled: !!v.enabled,
        tagline: v.tagline || '',
        about: v.about || '',
        logo: v.logo || '',
        banner: v.banner || '',
        themeColor: v.themeColor || '#e50914',
        ctaLabel: v.ctaLabel || '',
        phone: v.phone || '',
        whatsapp: v.whatsapp || '',
        email: v.email || '',
        address: v.address || '',
        hours: v.hours || '',
        showProducts: !!v.showProducts,
        social: {
          facebook: v.facebook || '',
          instagram: v.instagram || '',
          tiktok: v.tiktok || '',
          x: v.x || '',
          youtube: sf.social?.youtube || ''
        },
        metaTitle: v.metaTitle || '',
        metaDescription: v.metaDescription || '',
        metaKeywords: v.metaKeywords || '',
        featured: Array.isArray(sf.featured) ? sf.featured : []
      };
      const res = await apiRequest(`/stores/${r.id}`, { method: 'PUT', body: JSON.stringify({ settings: { storefront: next } }) });
      if (!res.success) throw new Error(res.message || 'Could not save storefront');
      if (res.data) r.settings = res.data.settings;
      toast('Storefront saved', 'success');
      done();
    }
  });
}

/* ---------------------------- store marketplace ------------------------ */
async function storeMarket(c: HTMLElement) {
  c.innerHTML = '<p class="empty">Loading stores for sale…</p>';
  const res = await apiRequest('/stores?forSale=true&pageSize=50');
  if (!res.success) {
    c.innerHTML = `<div class="card"><p class="empty">${esc(res.message)}</p></div>`;
    return;
  }
  const rows: any[] = res.data || [];
  if (!rows.length) {
    c.innerHTML = emptyState('No stores are currently for sale.', 'store');
    return;
  }
  c.innerHTML = `
    <p class="empty" style="margin-bottom:12px">Stores you can purchase and take ownership of.</p>
    <div class="card">
      ${tableSimple(
        ['Store', 'Company', 'Price', ''],
        rows.map((r) => [
          esc(r.name),
          esc((r.companyId || '').slice(0, 8) || '—'),
          money(r.priceZar || 0),
          `<button class="btn btn-sm" data-buy="${esc(r.id)}">${icon('shopping-cart')}<span>Buy</span></button>`
        ])
      )}
    </div>`;
  c.querySelectorAll('[data-buy]').forEach((b) => {
    (b as HTMLElement).onclick = async () => {
      const id = (b as HTMLElement).dataset.buy!;
      if (!(await confirmDialog('Purchase this store?', { confirmLabel: 'Purchase' }))) return;
      const r = await apiRequest('/store-purchases', { method: 'POST', body: JSON.stringify({ storeId: id }) });
      if (!r.success) return toast(r.message || 'Could not purchase', 'error');
      const purchaseId = r.data?.id;
      if (!purchaseId) return toast('Store purchased — awaiting payment confirmation', 'success');
      const pay = await apiRequest(`/store-purchases/${purchaseId}/payfast/initiate`, { method: 'POST' });
      if (!pay.success) {
        toast(pay.message || 'Purchase saved — awaiting payment confirmation', 'info');
        return;
      }
      toast('Redirecting to PayFast…', 'info');
      submitPayFast(pay.data.processUrl, pay.data.fields);
    };
  });
}

/* ---------------------------- code marketplace ------------------------- */
async function codeMarket(c: HTMLElement) {
  c.innerHTML = '<p class="empty">Loading codes for sale…</p>';
  const res = await apiRequest('/codes?forSale=true&pageSize=50');
  if (!res.success) {
    c.innerHTML = `<div class="card"><p class="empty">${esc(res.message)}</p></div>`;
    return;
  }
  const rows: any[] = res.data || [];
  if (!rows.length) {
    c.innerHTML = emptyState('No codes are currently for sale.', 'ticket-percent');
    return;
  }
  c.innerHTML = `
    <p class="empty" style="margin-bottom:12px">Buy a company code to unlock that company's catalog and wholesale pricing for your store.</p>
    <div class="card">
      ${tableSimple(
        ['Code', 'Company', 'Price', 'Uses', ''],
        rows.map((r) => [
          badge(r.code, 'info'),
          esc((r.companyId || '').slice(0, 8) || '—'),
          money(r.priceZar || 0),
          `${r.uses || 0}${r.maxUses ? ' / ' + r.maxUses : ''}`,
          `<button class="btn btn-sm" data-buy="${esc(r.id)}">${icon('shopping-cart')}<span>Buy</span></button>`
        ])
      )}
    </div>`;
  c.querySelectorAll('[data-buy]').forEach((b) => {
    (b as HTMLElement).onclick = async () => {
      const id = (b as HTMLElement).dataset.buy!;
      if (!(await confirmDialog('Buy this code?', { confirmLabel: 'Buy' }))) return;
      const r = await apiRequest('/code-purchases', { method: 'POST', body: JSON.stringify({ codeId: id }) });
      if (!r.success) return toast(r.message || 'Could not purchase', 'error');
      const purchaseId = r.data?.id;
      if (!purchaseId) return toast('Code purchased — awaiting payment confirmation', 'success');
      const pay = await apiRequest(`/code-purchases/${purchaseId}/payfast/initiate`, { method: 'POST' });
      if (!pay.success) {
        toast(pay.message || 'Purchase saved — awaiting payment confirmation', 'info');
        return;
      }
      toast('Redirecting to PayFast…', 'info');
      submitPayFast(pay.data.processUrl, pay.data.fields);
    };
  });
}
