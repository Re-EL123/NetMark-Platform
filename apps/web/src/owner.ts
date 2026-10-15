import { auth } from './firebase';
import { signOut } from 'firebase/auth';
import { apiRequest } from './api';

const userName = document.getElementById('userName') as HTMLElement;
const companyDiv = document.getElementById('company') as HTMLElement;
const usersDiv = document.getElementById('users') as HTMLElement;
const storesDiv = document.getElementById('stores') as HTMLElement;

(window as any).logout = async () => {
  await signOut(auth);
  localStorage.removeItem('netmark_user');
  window.location.href = import.meta.env.BASE_URL;
};

async function load() {
  const u = JSON.parse(localStorage.getItem('netmark_user') || 'null');
  if (u) userName.textContent = u.name;
  const companies = await apiRequest('/companies');
  if (companies.success) {
    companyDiv.innerHTML = `<pre>${JSON.stringify(companies.data, null, 2)}</pre>`;
  }
  const users = await apiRequest('/users');
  if (users.success) {
    usersDiv.innerHTML = `<pre>${JSON.stringify(users.data, null, 2)}</pre>`;
  }
  const stores = await apiRequest('/stores');
  if (stores.success) {
    storesDiv.innerHTML = `<pre>${JSON.stringify(stores.data, null, 2)}</pre>`;
  }
}
auth.onAuthStateChanged(load);
