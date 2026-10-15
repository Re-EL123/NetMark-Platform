import { VercelRequest, VercelResponse } from '@vercel/node';
import { getSupabase, rowOut, rowsOut } from '../db';
import { verifySupabaseToken, loadUser } from '../middleware';

function slugify(s: string) {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

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

      if (path === '' && req.method === 'GET') {
        if (user.role === 'platformAdmin') {
          const { data, error } = await sb.from('companies').select('*');
          if (error) return res.status(500).json({ success: false, message: 'Server error' });
          return res.status(200).json({ success: true, data: rowsOut(data) });
        }
        if (user.company_id) {
          const { data } = await sb.from('companies').select('*').eq('id', user.company_id);
          return res.status(200).json({ success: true, data: rowsOut(data) });
        }
        return res.status(200).json({ success: true, data: [] });
      }

      if (path === '' && req.method === 'POST') {
        if (user.role !== 'platformAdmin' && user.role !== 'owner') {
          return res.status(403).json({ success: false, message: 'Forbidden' });
        }
        const { name, contact, address, status } = req.body || {};
        if (!name) return res.status(400).json({ success: false, message: 'Name required' });

        const base = slugify(name);
        let s = base;
        let i = 1;
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { data } = await sb.from('companies').select('id').eq('slug', s).maybeSingle();
          if (!data) break;
          s = `${base}-${i++}`;
        }

        const { data, error } = await sb
          .from('companies')
          .insert({
            name,
            slug: s,
            contact: contact || {},
            address: address || {},
            status: status || 'active',
            created_by: user.id
          })
          .select('*')
          .single();
        if (error) return res.status(500).json({ success: false, message: 'Server error' });
        return res.status(201).json({ success: true, data: rowOut(data) });
      }

      const id = slug[0];

      if (id && req.method === 'GET') {
        let query = sb.from('companies').select('*').eq('id', id);
        if (user.role !== 'platformAdmin') {
          if (user.company_id !== id) return res.status(404).json({ success: false, message: 'Not found' });
        }
        const { data } = await query.maybeSingle();
        if (!data) return res.status(404).json({ success: false, message: 'Not found' });
        return res.status(200).json({ success: true, data: rowOut(data) });
      }

      if (id && req.method === 'PUT') {
        if (user.role !== 'platformAdmin' && user.company_id !== id) {
          return res.status(403).json({ success: false, message: 'Forbidden' });
        }
        const body = { ...(req.body || {}) };
        delete body.slug;
        delete body.id;
        const { data } = await sb.from('companies').update(body).eq('id', id).select('*').maybeSingle();
        if (!data) return res.status(404).json({ success: false, message: 'Not found' });
        return res.status(200).json({ success: true, data: rowOut(data) });
      }

      if (id && req.method === 'DELETE') {
        if (user.role !== 'platformAdmin') return res.status(403).json({ success: false, message: 'Forbidden' });
        await sb.from('companies').delete().eq('id', id);
        return res.status(200).json({ success: true, message: 'Deleted' });
      }

      res.status(404).json({ success: false, message: 'Not found' });
    });
  });
}
