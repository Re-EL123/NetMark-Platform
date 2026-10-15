import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from './firebase';
import { apiRequest } from './api';

const loginForm = document.getElementById('loginForm') as HTMLFormElement;
const errorDiv = document.getElementById('error') as HTMLDivElement;

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  errorDiv.style.display = 'none';
  
  const email = (document.getElementById('email') as HTMLInputElement).value;
  const password = (document.getElementById('password') as HTMLInputElement).value;
  
  try {
    await signInWithEmailAndPassword(auth, email, password);
    const res = await apiRequest('/auth/me');
    if (res.success && res.data.user) {
      const user = res.data.user;
      localStorage.setItem('netmark_user', JSON.stringify(user));
      
      // Route based on role
      const base = import.meta.env.BASE_URL;
      const roleRoutes: Record<string, string> = {
        platformAdmin: `${base}platform/`,
        owner: `${base}owner/`,
        storeOwner: `${base}business/`,
        distributor: `${base}business/`,
        customer: `${base}shop/`,
        driver: `${base}driver/`
      };
      
      window.location.href = roleRoutes[user.role] || `${base}shop/`;
    } else {
      throw new Error('Failed to load user profile');
    }
  } catch (err: any) {
    errorDiv.textContent = err.message || 'Login failed';
    errorDiv.style.display = 'block';
  }
});
