import { supabase } from './supabase';
import { apiRequest } from './api';
import { table, statusBadge, badge, esc, formatDate, setHTML } from './render';

const userName = document.getElementById('userName') as HTMLElement;

(window as any).logout = async () => {
  await supabase.auth.signOut();
  localStorage.removeItem('netmark_user');
  window.location.href = import.meta.env.BASE_URL;
};

async function load() {
  const u = JSON.parse(localStorage.getItem('netmark_user') || 'null');
  if (u) userName.textContent = u.name;

  const companies = await apiRequest('/companies');
  if (companies.success && companies.data?.length) {
    const c = companies.data[0];
    setHTML(
      'company',
      `<div class="detail-grid">
        <div><span class="detail-label">Name</span><span>${esc(c.name)}</span></div>
        <div><span class="detail-label">Slug</span><span>${esc(c.slug)}</span></div>
        <div><span class="detail-label">Status</span><span>${statusBadge(c.status)}</span></div>
        <div><span class="detail-label">Created</span><span>${formatDate(c.createdAt)}</span></div>
      </div>`
    );
  } else {
    setHTML('company', '<p class="empty">No company linked to your account.</p>');
  }

  const users = await apiRequest('/users');
  if (users.success) {
    setHTML(
      'users',
      table(
        [
          { key: 'name', label: 'Name' },
          { key: 'email', label: 'Email' },
          { key: 'role', label: 'Role', render: (r) => badge(r.role || '-', 'info') },
          {
            key: 'verificationStatus',
            label: 'Verification',
            render: (r) => statusBadge(r.verificationStatus)
          },
          { key: 'lastLogin', label: 'Last Login', render: (r) => formatDate(r.lastLogin) }
        ],
        users.data
      )
    );
  } else {
    setHTML('users', `<p class="empty">${esc(users.message || 'Unable to load users.')}</p>`);
  }

  const stores = await apiRequest('/stores');
  if (stores.success) {
    setHTML(
      'stores',
      table(
        [
          { key: 'name', label: 'Name' },
          { key: 'slug', label: 'Slug' },
          {
            key: 'isActive',
            label: 'Active',
            render: (r) => statusBadge(r.isActive ? 'active' : 'inactive')
          },
          { key: 'createdAt', label: 'Created', render: (r) => formatDate(r.createdAt) }
        ],
        stores.data
      )
    );
  } else {
    setHTML('stores', `<p class="empty">${esc(stores.message || 'Unable to load stores.')}</p>`);
  }
}

supabase.auth.getSession().then(({ data }) => {
  if (data.session) load();
});
