import { API_BASE_URL } from './config';

const statusEl = document.getElementById('status') as HTMLElement;
const msgEl = document.getElementById('msg') as HTMLElement;
const goLogin = document.getElementById('goLogin') as HTMLButtonElement;

async function run() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');
  const email = params.get('email');
  if (!token || !email) {
    statusEl.textContent = 'Invalid verification link';
    msgEl.textContent = 'Missing token or email';
    msgEl.className = 'error';
    msgEl.style.display = 'block';
    goLogin.style.display = 'inline-flex';
    return;
  }
  try {
    const res = await fetch(`${API_BASE_URL}/auth/verify?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`);
    const data = await res.json();
    if (data.success) {
      statusEl.textContent = 'Email verified successfully';
      msgEl.className = 'success';
      msgEl.textContent = 'Your account has been verified. You can now sign in.';
      msgEl.style.display = 'block';
      goLogin.style.display = 'inline-flex';
    } else {
      throw new Error(data.message || 'Verification failed');
    }
  } catch (err: any) {
    statusEl.textContent = 'Verification failed';
    msgEl.className = 'error';
    msgEl.textContent = err.message || 'Could not verify email';
    msgEl.style.display = 'block';
    goLogin.style.display = 'inline-flex';
  }
}

goLogin.onclick = () => {
  window.location.href = `${import.meta.env.BASE_URL}login.html`;
};

run();
