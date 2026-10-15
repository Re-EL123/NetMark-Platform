import { auth } from './firebase';
import { signOut } from 'firebase/auth';
import { apiRequest } from './api';

const userName = document.getElementById('userName') as HTMLElement;
const content = document.querySelector('.container .card') as HTMLElement;

(window as any).logout = async () => {
  await signOut(auth);
  localStorage.removeItem('netmark_user');
  window.location.href = import.meta.env.BASE_URL;
};

async function load() {
  const u = JSON.parse(localStorage.getItem('netmark_user') || 'null');
  if (u) userName.textContent = u.name;

  const meRes = await apiRequest('/drivers/me');
  if (!meRes.success) {
    content.innerHTML = `<h2>Driver Dashboard</h2><p>${meRes.message || 'Unable to load driver profile.'}</p>`;
    return;
  }
  const driver = meRes.data.driver;

  const statusColors: Record<string, string> = {
    approved: '#4CAF50',
    pending: '#FF9800',
    rejected: '#F44336',
    suspended: '#9E9E9E'
  };

  let html = `
    <h2>Driver Dashboard</h2>
    <p>Status: <strong style="color:${statusColors[driver.status] || '#000'}">${driver.status}</strong></p>
    <p>Availability: <strong>${driver.isAvailable ? 'Online' : 'Offline'}</strong></p>
    <p>Vehicle: ${driver.vehicleType || '-'} ${driver.vehicleNumber || ''}</p>
    <p>Total Deliveries: ${driver.stats?.totalDeliveries || 0}</p>
  `;

  if (driver.status === 'approved') {
    html += `<button id="toggleAvail">${driver.isAvailable ? 'Go Offline' : 'Go Online'}</button>`;
    const avail = await apiRequest('/drivers/deliveries/available');
    if (avail.success) {
      html += `<h3>Available Deliveries</h3>`;
      const orders = avail.data.orders || [];
      html += orders.length
        ? `<ul>${orders.map((o: any) => `<li>${o.orderNumber || o._id} - ${o.orderStatus}</li>`).join('')}</ul>`
        : '<p>No available deliveries.</p>';
    }
  } else if (driver.status === 'pending') {
    html += '<p>Your driver account is pending administrator approval.</p>';
  } else if (driver.status === 'rejected') {
    html += `<p>Your application was rejected. ${driver.rejectionReason || ''}</p>`;
  } else if (driver.status === 'suspended') {
    html += '<p>Your account is suspended. Contact your administrator.</p>';
  }

  content.innerHTML = html;

  const toggle = document.getElementById('toggleAvail');
  if (toggle) {
    toggle.addEventListener('click', async () => {
      await apiRequest('/drivers/availability', {
        method: 'PUT',
        body: JSON.stringify({ status: driver.isAvailable ? 'offline' : 'available' })
      });
      window.location.reload();
    });
  }
}
auth.onAuthStateChanged(load);
