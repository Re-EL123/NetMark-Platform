import { auth } from './firebase';
import { apiRequest } from './api';

const loginUrl = () => `${import.meta.env.BASE_URL}`;

export async function checkAuth(requiredRoles: string[]) {
  return new Promise((resolve) => {
    auth.onAuthStateChanged(async (user) => {
      if (!user) {
        window.location.href = loginUrl();
        resolve(false);
        return;
      }
      try {
        const res = await apiRequest('/auth/me');
        if (res.success && res.data.user) {
          const u = res.data.user;
          if (requiredRoles.length && !requiredRoles.includes(u.role)) {
            window.location.href = loginUrl();
            resolve(false);
            return;
          }
          localStorage.setItem('netmark_user', JSON.stringify(u));
          resolve(true);
        } else {
          window.location.href = loginUrl();
          resolve(false);
        }
      } catch (e) {
        window.location.href = loginUrl();
        resolve(false);
      }
    });
  });
}
