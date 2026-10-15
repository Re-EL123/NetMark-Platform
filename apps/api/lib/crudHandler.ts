import { VercelRequest, VercelResponse } from '@vercel/node';
import { getSupabase, rowOut, rowsOut, mapColumns } from './db';
import { verifySupabaseToken, loadUser } from './middleware';

/**
 * Generic CRUD handler backed by a Supabase table with the shape:
 *   id uuid, company_id uuid, data jsonb, created_at, updated_at
 */
export function createCrudHandler(
  table: string,
  options: { readRoles?: string[]; writeRoles?: string[] } = {}
) {
  const readRoles = options.readRoles || [
    'platformAdmin',
    'owner',
    'storeOwner',
    'customer',
    'driver'
  ];
  const writeRoles = options.writeRoles || ['platformAdmin', 'owner', 'storeOwner'];

  return async function handler(req: VercelRequest, res: VercelResponse) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') return res.status(200).end();

    const slug = Array.isArray(req.query.slug) ? req.query.slug : [req.query.slug || ''];

    return verifySupabaseToken(req, res, async () => {
      await loadUser(req, res, async () => {
        const sb = getSupabase();
        const user = (req as any).user;
        const isPlatform = user.role === 'platformAdmin';
        const companyId = user.company_id;

        try {
          const scoped = (q: any) => (!isPlatform && companyId ? q.eq('company_id', companyId) : q);

          if (slug.length === 0) {
            if (req.method === 'GET') {
              if (!readRoles.includes(user.role)) return res.status(403).json({ success: false, message: 'Forbidden' });
              const { data, error } = await scoped(
                sb.from(table).select('*').order('created_at', { ascending: false })
              );
              if (error) throw error;
              return res.status(200).json({ success: true, data: rowsOut(data) });
            }
            if (req.method === 'POST') {
              if (!writeRoles.includes(user.role)) return res.status(403).json({ success: false, message: 'Forbidden' });
              const { cols, rest } = mapColumns(req.body, { companyId: 'company_id' });
              if (!isPlatform && companyId) cols.company_id = companyId;
              const { data, error } = await sb
                .from(table)
                .insert({ ...cols, data: rest })
                .select('*')
                .single();
              if (error) throw error;
              return res.status(201).json({ success: true, data: rowOut(data) });
            }
          }

          const id = slug[0];

          if (req.method === 'GET') {
            if (!readRoles.includes(user.role)) return res.status(403).json({ success: false, message: 'Forbidden' });
            const { data, error } = await scoped(sb.from(table).select('*').eq('id', id)).maybeSingle();
            if (error) throw error;
            if (!data) return res.status(404).json({ success: false, message: 'Not found' });
            return res.status(200).json({ success: true, data: rowOut(data) });
          }

          if (req.method === 'PUT') {
            if (!writeRoles.includes(user.role)) return res.status(403).json({ success: false, message: 'Forbidden' });
            const { data: current, error: curErr } = await scoped(
              sb.from(table).select('*').eq('id', id)
            ).maybeSingle();
            if (curErr) throw curErr;
            if (!current) return res.status(404).json({ success: false, message: 'Not found' });

            const { cols, rest } = mapColumns(req.body, { companyId: 'company_id' });
            const patch: any = { data: { ...(current.data || {}), ...rest } };
            if (cols.company_id !== undefined) patch.company_id = cols.company_id;

            const { data, error } = await scoped(sb.from(table).update(patch).eq('id', id))
              .select('*')
              .single();
            if (error) throw error;
            return res.status(200).json({ success: true, data: rowOut(data) });
          }

          if (req.method === 'DELETE') {
            if (!writeRoles.includes(user.role)) return res.status(403).json({ success: false, message: 'Forbidden' });
            const { error } = await scoped(sb.from(table).delete().eq('id', id));
            if (error) throw error;
            return res.status(200).json({ success: true, message: 'Deleted' });
          }
        } catch (err) {
          console.error(table, 'handler error', err);
          return res.status(500).json({ success: false, message: 'Server error' });
        }

        res.status(405).json({ success: false, message: 'Method not allowed' });
      });
    });
  };
}
