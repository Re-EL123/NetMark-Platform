import { supabase } from './supabase';
import { API_BASE_URL } from './config';

// Cache the access token so a burst of parallel requests does not each call
// `supabase.auth.getSession()` (which serialises on an internal lock). The
// token is refreshed from the auth state change stream and just before expiry.
let token = '';
let expiresAt = 0;
let primed = false;

function primedPromise(): Promise<void> {
  if (primed) return Promise.resolve();
  return supabase.auth
    .getSession()
    .then(({ data }) => {
      applySession(data.session);
      primed = true;
    })
    .catch(() => {
      primed = true;
    });
}

function applySession(session: { access_token?: string; expires_at?: number } | null | undefined) {
  token = session?.access_token || '';
  expiresAt = session?.expires_at ? session.expires_at * 1000 : 0;
}

supabase.auth.onAuthStateChange((_event, session) => {
  applySession(session);
  primed = true;
});

async function currentToken(): Promise<string> {
  const fresh = token && (!expiresAt || Date.now() < expiresAt - 30_000);
  if (fresh) return token;
  await primedPromise();
  if (token && (!expiresAt || Date.now() < expiresAt - 30_000)) return token;
  const { data } = await supabase.auth.getSession();
  applySession(data.session);
  return token;
}

export async function apiRequest(endpoint: string, options: RequestInit = {}) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>)
  };
  const accessToken = await currentToken();
  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }
  const res = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers
  });
  return res.json();
}
