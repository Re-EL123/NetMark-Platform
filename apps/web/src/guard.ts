import { supabase } from './supabase';
import { apiRequest } from './api';

const loginUrl = () => `${import.meta.env.BASE_URL}`;

export async function checkAuth(requiredRoles: string[]) {
  const { data } = await supabase.auth.getSession();
  if (!data.session) {
    window.location.href = loginUrl();
    return false;
  }
  try {
    const res = await apiRequest('/auth/me');
    if (res.success && res.data.user) {
      const u = res.data.user;
      localStorage.setItem('netmark_user', JSON.stringify(u));
      localStorage.setItem('netmark_caps', JSON.stringify(res.data.capabilities || []));
      if (requiredRoles.length && !requiredRoles.includes(u.role)) {
        window.location.href = loginUrl();
        return false;
      }
      return true;
    }
    window.location.href = loginUrl();
    return false;
  } catch (e) {
    window.location.href = loginUrl();
    return false;
  }
}
