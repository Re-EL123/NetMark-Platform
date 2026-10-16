import { VercelRequest, VercelResponse } from '@vercel/node';
import { getSupabase, rowOut, rowsOut } from './db';
import { verifySupabaseToken, loadUser } from './middleware';

export function applyCors(res: VercelResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

export function ok(res: VercelResponse, data: any = {}, status = 200) {
  return res.status(status).json({ success: true, ...data });
}

export function fail(res: VercelResponse, message: string, status = 400) {
  return res.status(status).json({ success: false, message });
}

/**
 * Wrap an authenticated handler: handles CORS/OPTIONS, verifies the Supabase
 * token, loads the user row (with suspension check) and invokes `run` with the
 * request user. Any thrown error becomes a 500 without leaking internals.
 */
export function authed(
  run: (req: VercelRequest, res: VercelResponse, ctx: AuthenticatedContext) => Promise<unknown>
) {
  return async function handler(req: VercelRequest, res: VercelResponse) {
    applyCors(res);
    if (req.method === 'OPTIONS') return res.status(200).end();
    return verifySupabaseToken(req, res, async () => {
      await loadUser(req, res, async () => {
        try {
          const user = (req as any).user;
          await run(req, res, {
            user,
            userId: user.id,
            role: user.role,
            companyId: user.company_id,
            isPlatform: user.role === 'platformAdmin',
            tenantId: (user as any).tenant_id || user.company_id || null
          });
        } catch (err: any) {
          console.error('handler error', err?.message || err);
          if (!res.headersSent) fail(res, 'Server error', 500);
        }
      });
    });
  };
}

export interface AuthenticatedContext {
  user: any;
  userId: string;
  role: string;
  companyId: string | null;
  tenantId: string | null;
  isPlatform: boolean;
}

/** Parse the domain-relative slug segments from the rewritten URL. */
export function slugOf(req: VercelRequest): string[] {
  return Array.isArray(req.query.slug) ? (req.query.slug as string[]) : [String(req.query.slug || '')];
}

export { getSupabase, rowOut, rowsOut };
