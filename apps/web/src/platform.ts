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
          { key: 'phone', label: 'Phone' },
          { key: 'lastLogin', label: 'Last Login', render: (r) => formatDate(r.lastLogin) }
        ],
        users.data
      )
    );
  } else {
    setHTML('users', `<p class="empty">${esc(users.message || 'Unable to load users.')}</p>`);
  }

  const companies = await apiRequest('/companies');
  if (companies.success) {
    setHTML(
      'companies',
      table(
        [
          { key: 'name', label: 'Name' },
          { key: 'slug', label: 'Slug' },
          { key: 'status', label: 'Status', render: (r) => statusBadge(r.status) },
          { key: 'createdAt', label: 'Created', render: (r) => formatDate(r.createdAt) }
        ],
        companies.data
      )
    );
  } else {
    setHTML(
      'companies',
      `<p class="empty">${esc(companies.message || 'Unable to load companies.')}</p>`
    );
  }
}

supabase.auth.getSession().then(({ data }) => {
  if (data.session) load();
});
