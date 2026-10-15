import { supabase } from './supabase';

const userName = document.getElementById('userName') as HTMLElement;
(window as any).logout = async () => {
  await supabase.auth.signOut();
  localStorage.removeItem('netmark_user');
  window.location.href = import.meta.env.BASE_URL;
};
const u = JSON.parse(localStorage.getItem('netmark_user') || 'null');
if (u) userName.textContent = u.name;
