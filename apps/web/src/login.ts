import { supabase } from './supabase';
import { apiRequest } from './api';
import { captureReferral } from './referralStore';

// A visitor who lands on the login page with ?ref= still needs that code kept
// so it survives through to registration.
captureReferral();

const loginForm = document.getElementById('loginForm') as HTMLFormElement;
const errorDiv = document.getElementById('error') as HTMLDivElement;
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

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  errorDiv.style.display = 'none';

  const submitBtn = loginForm.querySelector('button[type="submit"]') as HTMLButtonElement | null;
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
    submitBtn.innerHTML = '<span class="btn-spinner"></span><span>Signing in…</span>';
  }

  const email = (document.getElementById('email') as HTMLInputElement).value;
  const password = (document.getElementById('password') as HTMLInputElement).value;

  try {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);

    const res = await apiRequest('/auth/me');
    if (res.success && res.data.user) {
      const user = res.data.user;
      localStorage.setItem('netmark_user', JSON.stringify(user));

      const base = import.meta.env.BASE_URL;
      const roleRoutes: Record<string, string> = {
        platformAdmin: `${base}platform/`,
        owner: `${base}owner/`,
        storeOwner: `${base}business/`,
        customer: `${base}shop/`,
        driver: `${base}driver/`
      };

      window.location.href = roleRoutes[user.role] || `${base}shop/`;
    } else {
      throw new Error('Failed to load user profile');
    }
  } catch (err: any) {
    restore();
    errorDiv.textContent = err.message || 'Login failed';
    errorDiv.style.display = 'block';
  }
});
