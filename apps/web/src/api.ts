import { auth } from './firebase';
import { API_BASE_URL } from './config';

export async function apiRequest(endpoint: string, options: RequestInit = {}) {
  const user = auth.currentUser;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>)
  };
  if (user) {
    const token = await user.getIdToken();
    headers['Authorization'] = `Bearer ${token}`;
  }
  const res = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers
  });
  return res.json();
}
