import { API_BASE_URL } from './config';
import { getReferralCode, clearReferralCode } from './referralStore';

const registerForm = document.getElementById('registerForm') as HTMLFormElement;
const errorDiv = document.getElementById('error') as HTMLDivElement;
const roleSelect = document.getElementById('role') as HTMLSelectElement;
const codeGroup = document.getElementById('codeGroup') as HTMLElement;
const codeInput = document.getElementById('distributorCode') as HTMLInputElement | null;
const pwToggle = document.getElementById('pwToggle') as HTMLButtonElement | null;
const pwInput = document.getElementById('password') as HTMLInputElement | null;

if (pwToggle && pwInput) {
  pwToggle.addEventListener('click', () => {
    const show = pwInput.type === 'password';
    pwInput.type = show ? 'text' : 'password';
    pwToggle.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    pwToggle.innerHTML = show
      ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>'
      : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>';
  });
}

// Pre-fill any referral code carried in the link so signups are attributed to
// whoever shared it.
const incomingRef = getReferralCode();
if (incomingRef && codeInput) {
  codeInput.value = incomingRef;
  codeGroup.style.display = 'block';
}

roleSelect.addEventListener('change', () => {
  codeGroup.style.display = ['customer', 'storeOwner'].includes(roleSelect.value) ? 'block' : 'none';
});

registerForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  errorDiv.style.display = 'none';
  const submitBtn = registerForm.querySelector('button[type="submit"]') as HTMLButtonElement | null;
  const restore = () => {
    if (!submitBtn) return;
    submitBtn.disabled = false;
    submitBtn.classList.remove('btn-loading');
    if ((submitBtn as any).__origHtml !== undefined) submitBtn.innerHTML = (submitBtn as any).__origHtml;
  };
  if (submitBtn) {
    if ((submitBtn as any).__origHtml === undefined) (submitBtn as any).__origHtml = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.classList.add('btn-loading');
    submitBtn.innerHTML = '<span class="btn-spinner"></span><span>Creating account…</span>';
  }

  const name = (document.getElementById('name') as HTMLInputElement).value;
  const email = (document.getElementById('email') as HTMLInputElement).value;
  const phone = (document.getElementById('phone') as HTMLInputElement).value;
  const password = (document.getElementById('password') as HTMLInputElement).value;
  const role = roleSelect.value;
  const distributorCode = (document.getElementById('distributorCode') as HTMLInputElement).value;

  try {
    const res = await fetch(`${API_BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, phone, password, role, distributorCode: distributorCode || undefined })
    });

    const data = await res.json();
    if (data.success) {
      clearReferralCode();
      errorDiv.className = 'success';
      errorDiv.textContent = 'Registration successful! Check your email to verify your account. Redirecting to login...';
      errorDiv.style.display = 'block';
      setTimeout(() => {
        window.location.href = `${import.meta.env.BASE_URL}`;
      }, 2500);
    } else {
      throw new Error(data.message || 'Registration failed');
    }
  } catch (err: any) {
    restore();
    errorDiv.className = 'error';
    errorDiv.textContent = err.message || 'Registration failed';
    errorDiv.style.display = 'block';
  }
});
