import { VercelRequest, VercelResponse } from '@vercel/node';
import { getSupabase, rowOut, rowsOut } from '../db';
import { verifySupabaseToken, loadUser } from '../middleware';

function generateOtp(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

const AVAILABLE_ORDER_STATUSES = ['ready', 'confirmed', 'preparing', 'pending'];

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
      const isAdmin = user.role === 'platformAdmin' || user.role === 'owner';
      const isDriver = user.role === 'driver';

      let driver: any = null;
      if (isDriver) {
        const { data } = await sb.from('drivers').select('*').eq('user_id', user.id).maybeSingle();
        if (!data) {
          return res.status(404).json({ success: false, message: 'Driver profile not found' });
        }
        driver = data;
      }

      // ---- /drivers/me ----
      if (path === 'me' && req.method === 'GET') {
        if (!driver) return res.status(403).json({ success: false, message: 'Driver only' });
        const profile = rowOut(driver);
        profile.stats = profile.stats || { totalDeliveries: 0, totalEarnings: 0, rating: 0 };
        return res.status(200).json({ success: true, data: { driver: profile, driverProfile: profile } });
      }

      if (path === 'me' && req.method === 'PUT') {
        if (!driver) return res.status(403).json({ success: false, message: 'Driver only' });
        const { vehicleType, vehicleNumber, vehicleModel, licenseNumber, licenseExpiry, bankDetails } = req.body || {};
        const patch: any = {};
        if (vehicleType !== undefined) patch.vehicle_type = vehicleType;
        if (vehicleNumber !== undefined) patch.vehicle_number = vehicleNumber;
        if (vehicleModel !== undefined) patch.vehicle_model = vehicleModel;
        if (licenseNumber !== undefined) patch.license_number = licenseNumber;
        if (licenseExpiry) patch.license_expiry = new Date(licenseExpiry).toISOString().slice(0, 10);
        if (bankDetails !== undefined) patch.bank_details = bankDetails;
        const { data } = await sb.from('drivers').update(patch).eq('id', driver.id).select('*').single();
        return res.status(200).json({ success: true, data: { driver: rowOut(data) } });
      }

      // ---- /drivers/availability ----
      if (path === 'availability' && req.method === 'PUT') {
        if (!driver) return res.status(403).json({ success: false, message: 'Driver only' });
        if (driver.status !== 'approved') {
          return res.status(403).json({ success: false, message: 'Account not approved' });
        }
        const { status } = req.body || {};
        const isAvailable = status === 'available' || status === 'online' || status === true;
        await sb.from('drivers').update({ is_available: isAvailable }).eq('id', driver.id);
        return res.status(200).json({ success: true, data: { isAvailable } });
      }

      // ---- /drivers/location ----
      if (path === 'location' && req.method === 'PUT') {
        if (!driver) return res.status(403).json({ success: false, message: 'Driver only' });
        const { latitude, longitude } = req.body || {};
        if (typeof latitude !== 'number' || typeof longitude !== 'number') {
          return res.status(400).json({ success: false, message: 'latitude and longitude are required' });
        }
        const currentLocation = { lat: latitude, lng: longitude, updatedAt: new Date().toISOString() };
        await sb.from('drivers').update({ current_location: currentLocation }).eq('id', driver.id);
        return res.status(200).json({ success: true, data: { currentLocation } });
      }

      // ---- /drivers/push-token ----
      if (path === 'push-token' && req.method === 'PUT') {
        if (!driver) return res.status(403).json({ success: false, message: 'Driver only' });
        const { pushToken } = req.body || {};
        await sb.from('drivers').update({ push_token: pushToken || '' }).eq('id', driver.id);
        return res.status(200).json({ success: true, data: { pushToken: pushToken || '' } });
      }

      // ---- /drivers/earnings ----
      if (path === 'earnings' && req.method === 'GET') {
        if (!driver) return res.status(403).json({ success: false, message: 'Driver only' });
        const { data } = await sb
          .from('driver_earnings')
          .select('*')
          .eq('driver_id', driver.id)
          .order('created_at', { ascending: false });
        const earnings = rowsOut(data);
        const total = earnings.reduce((sum, e) => sum + Number(e.amount || 0), 0);
        const pending = earnings
          .filter((e) => e.status === 'pending')
          .reduce((sum, e) => sum + Number(e.amount || 0), 0);
        return res.status(200).json({
          success: true,
          data: { earnings },
          summary: { total, pending, count: earnings.length }
        });
      }

      if (path === 'earnings/summary' && req.method === 'GET') {
        if (!driver) return res.status(403).json({ success: false, message: 'Driver only' });
        const { data } = await sb.from('driver_earnings').select('*').eq('driver_id', driver.id);
        const earnings = rowsOut(data);
        const total = earnings.reduce((sum, e) => sum + Number(e.amount || 0), 0);
        const paid = earnings
          .filter((e) => e.status === 'paid')
          .reduce((sum, e) => sum + Number(e.amount || 0), 0);
        return res.status(200).json({
          success: true,
          data: { summary: { total, paid, pending: total - paid, count: earnings.length } }
        });
      }

      // ---- /drivers/deliveries/available ----
      if (path === 'deliveries/available' && req.method === 'GET') {
        if (!driver) return res.status(403).json({ success: false, message: 'Driver only' });
        if (driver.status !== 'approved') {
          return res.status(403).json({ success: false, message: 'Account not approved' });
        }
        let q = sb
          .from('orders')
          .select('*')
          .eq('delivery_status', 'unassigned')
          .in('order_status', AVAILABLE_ORDER_STATUSES)
          .order('created_at', { ascending: true });
        if (driver.company_id) q = q.eq('company_id', driver.company_id);
        const { data, error } = await q;
        if (error) return res.status(500).json({ success: false, message: 'Server error' });
        return res.status(200).json({ success: true, data: { orders: rowsOut(data) } });
      }

      // ---- /drivers/deliveries/mine ----
      if (path === 'deliveries/mine' && req.method === 'GET') {
        if (!driver) return res.status(403).json({ success: false, message: 'Driver only' });
        const { data, error } = await sb
          .from('orders')
          .select('*')
          .eq('assigned_driver_id', driver.id)
          .order('created_at', { ascending: false });
        if (error) return res.status(500).json({ success: false, message: 'Server error' });
        return res.status(200).json({ success: true, data: { orders: rowsOut(data) } });
      }

      // ---- /drivers/deliveries/:orderId/accept ----
      if (slug.length === 3 && slug[0] === 'deliveries' && slug[2] === 'accept' && req.method === 'POST') {
        if (!driver) return res.status(403).json({ success: false, message: 'Driver only' });
        if (driver.status !== 'approved') {
          return res.status(403).json({ success: false, message: 'Account not approved' });
        }
        const orderId = slug[1];
        // Atomic claim: the WHERE clause guarantees only one driver wins.
        let q = sb
          .from('orders')
          .update({
            assigned_driver_id: driver.id,
            delivery_status: 'assigned',
            accepted_at: new Date().toISOString(),
            order_status: 'in_transit'
          })
          .eq('id', orderId)
          .eq('delivery_status', 'unassigned')
          .is('assigned_driver_id', null);
        if (driver.company_id) q = q.eq('company_id', driver.company_id);
        const { data: claimed } = await q.select('*').maybeSingle();
        if (!claimed) {
          return res.status(409).json({ success: false, message: 'Delivery no longer available' });
        }
        let order = claimed;
        if (!order.delivery_otp) {
          order.delivery_otp = generateOtp();
          await sb.from('orders').update({ delivery_otp: order.delivery_otp }).eq('id', order.id);
        }
        return res.status(200).json({ success: true, data: { order: rowOut(order) } });
      }

      // ---- /drivers/deliveries/:orderId/status ----
      if (slug.length === 3 && slug[0] === 'deliveries' && slug[2] === 'status' && req.method === 'PUT') {
        if (!driver) return res.status(403).json({ success: false, message: 'Driver only' });
        const orderId = slug[1];
        const { status, note } = req.body || {};
        const allowed = ['assigned', 'picked_up', 'in_transit', 'failed'];
        if (!allowed.includes(status)) {
          return res.status(400).json({ success: false, message: 'Invalid status' });
        }
        const { data } = await sb
          .from('orders')
          .update({ delivery_status: status, order_status: status, delivery_notes: note || null })
          .eq('id', orderId)
          .eq('assigned_driver_id', driver.id)
          .select('*')
          .maybeSingle();
        if (!data) return res.status(404).json({ success: false, message: 'Delivery not found' });
        return res.status(200).json({ success: true, data: { order: rowOut(data) } });
      }

      // ---- /drivers/deliveries/:orderId/complete ----
      if (slug.length === 3 && slug[0] === 'deliveries' && slug[2] === 'complete' && req.method === 'POST') {
        if (!driver) return res.status(403).json({ success: false, message: 'Driver only' });
        const orderId = slug[1];
        const { otp, notes } = req.body || {};
        const { data: orderRow } = await sb
          .from('orders')
          .select('*')
          .eq('id', orderId)
          .eq('assigned_driver_id', driver.id)
          .maybeSingle();
        if (!orderRow) return res.status(404).json({ success: false, message: 'Delivery not found' });
        if (orderRow.delivery_status === 'delivered') {
          return res.status(400).json({ success: false, message: 'Delivery already completed' });
        }
        if (orderRow.delivery_otp && orderRow.delivery_otp !== otp) {
          return res.status(400).json({ success: false, message: 'Invalid delivery OTP' });
        }
        const orderPatch: any = {
          delivery_status: 'delivered',
          order_status: 'delivered',
          delivered_at: new Date().toISOString()
        };
        if (notes) orderPatch.delivery_notes = notes;
        const { data: updated } = await sb
          .from('orders')
          .update(orderPatch)
          .eq('id', orderId)
          .select('*')
          .single();

        const order = rowOut(updated);
        const amount = Number(order.deliveryFee || order.driverEarning || order.total || 0);
        await sb.from('driver_earnings').insert({
          driver_id: driver.id,
          company_id: order.companyId || driver.company_id,
          order_id: order.id,
          amount,
          status: 'pending',
          description: `Delivery for order ${order.orderNumber || order.id}`
        });

        const stats = driver.stats || { totalDeliveries: 0, totalEarnings: 0, rating: 0 };
        stats.totalDeliveries = (stats.totalDeliveries || 0) + 1;
        stats.totalEarnings = (stats.totalEarnings || 0) + amount;
        await sb.from('drivers').update({ stats }).eq('id', driver.id);

        return res.status(200).json({ success: true, message: 'Delivery completed', data: { order } });
      }

      // ---- Admin listing & lifecycle ----
      if (path === '' && req.method === 'GET') {
        if (!isAdmin) return res.status(403).json({ success: false, message: 'Forbidden' });
        let q = sb.from('drivers').select('*');
        if (user.role !== 'platformAdmin' && user.company_id) q = q.eq('company_id', user.company_id);
        const { data, error } = await q;
        if (error) return res.status(500).json({ success: false, message: 'Server error' });
        return res.status(200).json({ success: true, data: rowsOut(data) });
      }

      if (path === '' && req.method === 'POST') {
        if (!isAdmin) return res.status(403).json({ success: false, message: 'Forbidden' });
        const insert: any = { ...req.body };
        if (user.role !== 'platformAdmin' && user.company_id) insert.company_id = user.company_id;
        const { data, error } = await sb.from('drivers').insert(insert).select('*').single();
        if (error) return res.status(500).json({ success: false, message: 'Server error' });
        return res.status(201).json({ success: true, data: rowOut(data) });
      }

      if (slug.length === 1 && req.method === 'GET') {
        if (!isAdmin) return res.status(403).json({ success: false, message: 'Forbidden' });
        let q = sb.from('drivers').select('*').eq('id', slug[0]);
        if (user.role !== 'platformAdmin' && user.company_id) q = q.eq('company_id', user.company_id);
        const { data } = await q.maybeSingle();
        if (!data) return res.status(404).json({ success: false, message: 'Not found' });
        return res.status(200).json({ success: true, data: rowOut(data) });
      }

      if (slug.length === 2 && slug[1] === 'approve' && req.method === 'POST') {
        if (!isAdmin) return res.status(403).json({ success: false, message: 'Forbidden' });
        let q = sb
          .from('drivers')
          .update({ status: 'approved', rejection_reason: null })
          .eq('id', slug[0]);
        if (user.role !== 'platformAdmin' && user.company_id) q = q.eq('company_id', user.company_id);
        const { data } = await q.select('*').maybeSingle();
        if (!data) return res.status(404).json({ success: false, message: 'Not found' });
        return res.status(200).json({ success: true, data: rowOut(data) });
      }

      if (slug.length === 2 && ['reject', 'suspend'].includes(slug[1]) && req.method === 'POST') {
        if (!isAdmin) return res.status(403).json({ success: false, message: 'Forbidden' });
        const target = slug[1] === 'reject' ? 'rejected' : 'suspended';
        let q = sb
          .from('drivers')
          .update({ status: target, is_available: false, rejection_reason: (req.body || {}).reason || null })
          .eq('id', slug[0]);
        if (user.role !== 'platformAdmin' && user.company_id) q = q.eq('company_id', user.company_id);
        const { data } = await q.select('*').maybeSingle();
        if (!data) return res.status(404).json({ success: false, message: 'Not found' });
        return res.status(200).json({ success: true, data: rowOut(data) });
      }

      res.status(404).json({ success: false, message: 'Not found' });
    });
  });
}
