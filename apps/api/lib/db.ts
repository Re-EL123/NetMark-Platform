import { createClient, SupabaseClient } from '@supabase/supabase-js';

let _client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (_client) return _client;
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    '';
  if (!url || !key) {
    throw new Error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY environment variables');
  }
  _client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  return _client;
}

// Shallow snake_case -> camelCase for top-level keys only.
// Values (including nested jsonb blobs) are left untouched.
export function toCamel(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  const out: any = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k.replace(/_([a-z])/g, (_m, c) => c.toUpperCase())] = v;
  }
  return out;
}

// A database row -> API object. Spreads the `data` jsonb blob first, then the
// real columns (camelCased) so columns always win on key collisions.
export function rowOut(row: any): any {
  if (!row) return row;
  const { data, ...cols } = row;
  return { ...(data || {}), ...toCamel(cols) };
}

export function rowsOut(rows: any[] | null | undefined): any[] {
  return (rows || []).map(rowOut);
}

// Split an API body into known DB columns (mapped to snake_case, values stored
// verbatim) and the remaining fields destined for the `data` jsonb blob.
export function mapColumns(
  body: any,
  mapping: Record<string, string>
): { cols: Record<string, any>; rest: Record<string, any> } {
  const src = body || {};
  const cols: Record<string, any> = {};
  const rest: Record<string, any> = {};
  const used = new Set<string>();
  for (const [apiKey, col] of Object.entries(mapping)) {
    if (src[apiKey] !== undefined) {
      cols[col] = src[apiKey];
      used.add(apiKey);
    }
  }
  for (const [k, v] of Object.entries(src)) {
    if (!used.has(k)) rest[k] = v;
  }
  return { cols, rest };
}

export function nowIso(): string {
  return new Date().toISOString();
}
