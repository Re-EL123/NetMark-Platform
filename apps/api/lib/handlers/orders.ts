import { VercelRequest, VercelResponse } from '@vercel/node';
import { getSupabase, rowOut, rowsOut } from '../db';
import { verifySupabaseToken, loadUser } from '../middleware';

function generateOtp(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
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
      const isScoped = user.role !== 'platformAdmin';

      if (path === '' && req.method === 'GET') {
        let q = sb.from('orders').select('*').order('created_at', { ascending: false });
        if (isScoped && user.company_id) q = q.eq('company_id', user.company_id);
        const { data, error } = await q;
        if (error) return res.status(500).json({ success: false, message: 'Server error' });
        return res.status(200).json({ success: true, data: rowsOut(data) });
      }

      if (path === 'my/all' && req.method === 'GET') {
        const { data, error } = await sb
          .from('orders')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });
        if (error) return res.status(500).json({ success: false, message: 'Server error' });
        return res.status(200).json({ success: true, data: rowsOut(data) });
      }

      if (path === '' && req.method === 'POST') {
        const body = req.body || {};
        const {
          orderNumber,
          companyId,
          storeId,
          orderStatus,
          deliveryStatus,
          deliveryOtp,
          userId,
          ...rest
        } = body;
        const insert: any = {
          order_number: orderNumber || 'NM' + Date.now().toString().slice(-8),
          user_id: userId || user.id,
          company_id: (isScoped && user.company_id) ? user.company_id : (companyId || null),
          store_id: storeId || null,
          order_status: orderStatus || 'ready',
          delivery_status: deliveryStatus || 'unassigned',
          delivery_otp: deliveryOtp || generateOtp(),
          data: rest
        };
        const { data, error } = await sb.from('orders').insert(insert).select('*').single();
        if (error) return res.status(500).json({ success: false, message: 'Server error' });
        return res.status(201).json({ success: true, data: rowOut(data) });
      }

      const id = slug[0];

      if (slug.length === 2 && slug[1] === 'status' && req.method === 'PUT') {
        const { status } = req.body || {};
        let q = sb.from('orders').update({ order_status: status }).eq('id', id);
        if (isScoped && user.company_id) q = q.eq('company_id', user.company_id);
        const { data } = await q.select('*').maybeSingle();
        if (!data) return res.status(404).json({ success: false, message: 'Not found' });
        return res.status(200).json({ success: true, data: rowOut(data) });
      }

      if (slug.length === 2 && slug[1] === 'assign' && req.method === 'POST') {
        if (!['platformAdmin', 'owner', 'storeOwner'].includes(user.role)) {
          return res.status(403).json({ success: false, message: 'Forbidden' });
        }
        const { driverId } = req.body || {};
        let q = sb
          .from('orders')
          .update({
            assigned_driver_id: driverId,
            delivery_status: 'assigned',
            order_status: 'in_transit',
            accepted_at: new Date().toISOString()
          })
          .eq('id', id);
        if (isScoped && user.company_id) q = q.eq('company_id', user.company_id);
        const { data } = await q.select('*').maybeSingle();
        if (!data) return res.status(404).json({ success: false, message: 'Not found' });
        return res.status(200).json({ success: true, data: rowOut(data) });
      }

      if (slug.length === 1 && req.method === 'GET') {
        let q = sb.from('orders').select('*').eq('id', id);
        if (isScoped && user.company_id) q = q.eq('company_id', user.company_id);
        const { data } = await q.maybeSingle();
        if (!data) return res.status(404).json({ success: false, message: 'Not found' });
        return res.status(200).json({ success: true, data: rowOut(data) });
      }

      res.status(404).json({ success: false, message: 'Not found' });
    });
  });
}
