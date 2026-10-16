import { API_BASE_URL } from './config';
import { getReferralCode, clearReferralCode } from './referralStore';

const registerForm = document.getElementById('registerForm') as HTMLFormElement;
const errorDiv = document.getElementById('error') as HTMLDivElement;
const roleSelect = document.getElementById('role') as HTMLSelectElement;
const codeGroup = document.getElementById('codeGroup') as HTMLElement;
const codeInput = document.getElementById('distributorCode') as HTMLInputElement | null;

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
      errorDiv.textContent = 'Registration successful! Redirecting to login...';
      errorDiv.style.display = 'block';
      setTimeout(() => {
        window.location.href = `${import.meta.env.BASE_URL}`;
      }, 2000);
    } else {
      throw new Error(data.message || 'Registration failed');
    }
  } catch (err: any) {
    errorDiv.className = 'error';
    errorDiv.textContent = err.message || 'Registration failed';
    errorDiv.style.display = 'block';
  }
});
