import { VercelRequest, VercelResponse } from '@vercel/node';
import { getSupabase, rowOut, rowsOut, mapColumns } from '../db';
import { verifySupabaseToken, loadUser } from '../middleware';

const STORE_COLS = {
  name: 'name',
  slug: 'slug',
  companyId: 'company_id',
  distributorId: 'distributor_id',
  isActive: 'is_active'
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const slug = Array.isArray(req.query.slug) ? req.query.slug : [req.query.slug || ''];
  const path = slug.join('/');

  return verifySupabaseToken(req, res, async () => {
    await loadUser(req, res, async () => {
      const sb = getSupabase();
      const user = (req as any).user;
      const isScoped = user.role !== 'platformAdmin';
      const scoped = (q: any) => (isScoped && user.company_id ? q.eq('company_id', user.company_id) : q);

      if (path === '' && req.method === 'GET') {
        const { data, error } = await scoped(sb.from('stores').select('*'));
        if (error) return res.status(500).json({ success: false, message: 'Server error' });
        return res.status(200).json({ success: true, data: rowsOut(data) });
      }

      if (path === '' && req.method === 'POST') {
        if (user.role === 'customer' || user.role === 'driver') {
          return res.status(403).json({ success: false, message: 'Forbidden' });
        }
        const body = req.body || {};
        if (!body.name) return res.status(400).json({ success: false, message: 'Name required' });
        const { cols, rest } = mapColumns(body, STORE_COLS);
        if (isScoped && user.company_id) cols.company_id = user.company_id;
        const { data, error } = await sb.from('stores').insert({ ...cols, data: rest }).select('*').single();
        if (error) return res.status(500).json({ success: false, message: 'Server error' });
        return res.status(201).json({ success: true, data: rowOut(data) });
      }

      const id = slug[0];

      if (id && req.method === 'GET') {
        const { data } = await scoped(sb.from('stores').select('*').eq('id', id)).maybeSingle();
        if (!data) return res.status(404).json({ success: false, message: 'Not found' });
        return res.status(200).json({ success: true, data: rowOut(data) });
      }

      if (id && req.method === 'PUT') {
        const { data: current } = await scoped(sb.from('stores').select('*').eq('id', id)).maybeSingle();
        if (!current) return res.status(404).json({ success: false, message: 'Not found' });
        const { cols, rest } = mapColumns(req.body || {}, STORE_COLS);
        const patch: any = { data: { ...(current.data || {}), ...rest } };
        Object.assign(patch, cols);
        const { data } = await scoped(sb.from('stores').update(patch).eq('id', id)).select('*').single();
        return res.status(200).json({ success: true, data: rowOut(data) });
      }

      res.status(404).json({ success: false, message: 'Not found' });
    });
  });
}
