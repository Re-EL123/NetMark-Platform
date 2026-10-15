import { VercelRequest, VercelResponse } from '@vercel/node';
import { getSupabase, rowOut, rowsOut } from '../db';
import { verifySupabaseToken, loadUser } from '../middleware';

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
          const { data, error } = await sb.from('users').select('*');
          if (error) return res.status(500).json({ success: false, message: 'Server error' });
          return res.status(200).json({ success: true, data: rowsOut(data) });
        }
        if (user.role === 'owner') {
          const { data, error } = await sb.from('users').select('*').eq('company_id', user.company_id);
          if (error) return res.status(500).json({ success: false, message: 'Server error' });
          return res.status(200).json({ success: true, data: rowsOut(data) });
        }
        return res.status(403).json({ success: false, message: 'Forbidden' });
      }

      const id = slug[0];

      if (id && req.method === 'GET') {
        let query = sb.from('users').select('*').eq('id', id);
        if (user.role !== 'platformAdmin') {
          if (user.role !== 'owner') return res.status(403).json({ success: false, message: 'Forbidden' });
          query = query.eq('company_id', user.company_id);
        }
        const { data } = await query.maybeSingle();
        if (!data) return res.status(404).json({ success: false, message: 'Not found' });
        return res.status(200).json({ success: true, data: rowOut(data) });
      }

      if (id && req.method === 'PUT') {
        if (!['platformAdmin', 'owner'].includes(user.role)) {
          return res.status(403).json({ success: false, message: 'Forbidden' });
        }
        const { name, phone, role, verificationStatus, companyId } = req.body || {};
        const patch: any = {};
        if (name) patch.name = name;
        if (phone) patch.phone = phone;
        if (verificationStatus) patch.verification_status = verificationStatus;
        if (role && user.role === 'platformAdmin') patch.role = role;
        if (companyId && user.role === 'platformAdmin') patch.company_id = companyId;

        let upd = sb.from('users').update(patch).eq('id', id);
        if (user.role === 'owner') upd = upd.eq('company_id', user.company_id);
        const { data } = await upd.select('*').maybeSingle();
        if (!data) return res.status(404).json({ success: false, message: 'Not found' });
        return res.status(200).json({ success: true, data: rowOut(data) });
      }

      if (id && req.method === 'DELETE') {
        if (user.role !== 'platformAdmin') return res.status(403).json({ success: false, message: 'Forbidden' });
        await sb.auth.admin.deleteUser(id).catch(() => {});
        await sb.from('users').delete().eq('id', id);
        return res.status(200).json({ success: true, message: 'Deleted' });
      }

      res.status(404).json({ success: false, message: 'Not found' });
    });
  });
}
