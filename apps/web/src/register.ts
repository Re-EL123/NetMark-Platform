import { createUserWithEmailAndPassword } from 'firebase/auth';
import { auth } from './firebase';
import { API_BASE_URL } from './config';

const registerForm = document.getElementById('registerForm') as HTMLFormElement;
const errorDiv = document.getElementById('error') as HTMLDivElement;

registerForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  errorDiv.style.display = 'none';
  
  const name = (document.getElementById('name') as HTMLInputElement).value;
  const email = (document.getElementById('email') as HTMLInputElement).value;
  const phone = (document.getElementById('phone') as HTMLInputElement).value;
  const password = (document.getElementById('password') as HTMLInputElement).value;
  const role = (document.getElementById('role') as HTMLSelectElement).value;
  
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    const token = await cred.user.getIdToken();
    
    const res = await fetch(`${API_BASE_URL}/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        firebaseUid: cred.user.uid,
        name,
        email,
        phone,
        role
      })
    });
    
    const data = await res.json();
    if (data.success) {
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
