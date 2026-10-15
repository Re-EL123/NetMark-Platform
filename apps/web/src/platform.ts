import { supabase } from './supabase';
import { apiRequest } from './api';

const userName = document.getElementById('userName') as HTMLElement;
const usersDiv = document.getElementById('users') as HTMLElement;
const companiesDiv = document.getElementById('companies') as HTMLElement;

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
    usersDiv.innerHTML = `<pre>${JSON.stringify(users.data, null, 2)}</pre>`;
  }
  const companies = await apiRequest('/companies');
  if (companies.success) {
    companiesDiv.innerHTML = `<pre>${JSON.stringify(companies.data, null, 2)}</pre>`;
  }
}

supabase.auth.getSession().then(({ data }) => {
  if (data.session) load();
});
