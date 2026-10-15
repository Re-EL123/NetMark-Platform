import { auth } from './firebase';
import { signOut } from 'firebase/auth';

const userName = document.getElementById('userName') as HTMLElement;
(window as any).logout = async () => {
  await signOut(auth);
  localStorage.removeItem('netmark_user');
  window.location.href = import.meta.env.BASE_URL;
};
const u = JSON.parse(localStorage.getItem('netmark_user') || 'null');
if (u) userName.textContent = u.name;
