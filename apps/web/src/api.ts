import { supabase } from './supabase';
import { API_BASE_URL } from './config';

export async function apiRequest(endpoint: string, options: RequestInit = {}) {
  const { data } = await supabase.auth.getSession();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>)
  };
  const token = data.session?.access_token;
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const res = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers
  });
  return res.json();
}
