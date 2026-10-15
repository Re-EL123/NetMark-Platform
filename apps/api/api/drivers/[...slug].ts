import { VercelRequest, VercelResponse } from '@vercel/node';
import { connectDB } from '../../lib/db';
import { Driver } from '../../lib/models/Driver';
import { Order } from '../../lib/models/Order';
import { DriverEarning } from '../../lib/models/DriverEarning';
import { User } from '../../lib/models/User';
import { verifyFirebaseToken, loadUser } from '../../lib/middleware';

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

  return verifyFirebaseToken(req, res, async () => {
    await loadUser(req, res, async () => {
      await connectDB();
      const user = (req as any).user;
      const isAdmin = user.role === 'platformAdmin' || user.role === 'owner';
      const isDriver = user.role === 'driver';

      // Resolve the driver profile for driver-role requests
      let driver: any = null;
      if (isDriver) {
        driver = await Driver.findOne({ userId: user._id });
        if (!driver) {
          return res.status(404).json({ success: false, message: 'Driver profile not found' });
        }
      }

      // ---- /drivers/me ----
      if (path === 'me' && req.method === 'GET') {
        if (!driver) return res.status(403).json({ success: false, message: 'Driver only' });
        const profile = driver.toObject();
        profile.stats = profile.stats || { totalDeliveries: 0, totalEarnings: 0, rating: 0 };
        return res.status(200).json({ success: true, data: { driver: profile, driverProfile: profile } });
      }

      if (path === 'me' && req.method === 'PUT') {
        if (!driver) return res.status(403).json({ success: false, message: 'Driver only' });
        const { vehicleType, vehicleNumber, vehicleModel, licenseNumber, licenseExpiry, bankDetails } = req.body || {};
        if (vehicleType !== undefined) driver.vehicleType = vehicleType;
        if (vehicleNumber !== undefined) driver.vehicleNumber = vehicleNumber;
        if (vehicleModel !== undefined) driver.vehicleModel = vehicleModel;
        if (licenseNumber !== undefined) driver.licenseNumber = licenseNumber;
        if (licenseExpiry) driver.licenseExpiry = new Date(licenseExpiry);
        if (bankDetails !== undefined) driver.bankDetails = bankDetails;
        await driver.save();
        return res.status(200).json({ success: true, data: { driver: driver.toObject() } });
      }

      // ---- /drivers/availability ----
      if (path === 'availability' && req.method === 'PUT') {
        if (!driver) return res.status(403).json({ success: false, message: 'Driver only' });
        if (driver.status !== 'approved') {
          return res.status(403).json({ success: false, message: 'Account not approved' });
        }
        const { status } = req.body || {};
        driver.isAvailable = status === 'available' || status === 'online' || status === true;
        await driver.save();
        return res.status(200).json({ success: true, data: { isAvailable: driver.isAvailable } });
      }

      // ---- /drivers/location ----
      if (path === 'location' && req.method === 'PUT') {
        if (!driver) return res.status(403).json({ success: false, message: 'Driver only' });
        const { latitude, longitude } = req.body || {};
        if (typeof latitude !== 'number' || typeof longitude !== 'number') {
          return res.status(400).json({ success: false, message: 'latitude and longitude are required' });
        }
        driver.currentLocation = { lat: latitude, lng: longitude, updatedAt: new Date() };
        await driver.save();
        return res.status(200).json({ success: true, data: { currentLocation: driver.currentLocation } });
      }

      // ---- /drivers/push-token ----
      if (path === 'push-token' && req.method === 'PUT') {
        if (!driver) return res.status(403).json({ success: false, message: 'Driver only' });
        const { pushToken } = req.body || {};
        driver.pushToken = pushToken || '';
        await driver.save();
        return res.status(200).json({ success: true, data: { pushToken: driver.pushToken } });
      }

      // ---- /drivers/earnings ----
      if (path === 'earnings' && req.method === 'GET') {
        if (!driver) return res.status(403).json({ success: false, message: 'Driver only' });
        const earnings = await DriverEarning.find({ driverId: driver._id }).sort({ createdAt: -1 }).lean();
        const total = earnings.reduce((sum, e) => sum + (e.amount || 0), 0);
        const pending = earnings
          .filter((e) => e.status === 'pending')
          .reduce((sum, e) => sum + (e.amount || 0), 0);
        return res.status(200).json({
          success: true,
          data: { earnings },
          summary: { total, pending, count: earnings.length }
        });
      }

      if (path === 'earnings/summary' && req.method === 'GET') {
        if (!driver) return res.status(403).json({ success: false, message: 'Driver only' });
        const earnings = await DriverEarning.find({ driverId: driver._id }).lean();
        const total = earnings.reduce((sum, e) => sum + (e.amount || 0), 0);
        const paid = earnings
          .filter((e) => e.status === 'paid')
          .reduce((sum, e) => sum + (e.amount || 0), 0);
        const pending = total - paid;
        return res.status(200).json({
          success: true,
          data: { summary: { total, paid, pending, count: earnings.length } }
        });
      }

      // ---- /drivers/deliveries/available ----
      if (path === 'deliveries/available' && req.method === 'GET') {
        if (!driver) return res.status(403).json({ success: false, message: 'Driver only' });
        if (driver.status !== 'approved') {
          return res.status(403).json({ success: false, message: 'Account not approved' });
        }
        const filter: any = {
          deliveryStatus: { $in: ['unassigned', null] },
          orderStatus: { $in: AVAILABLE_ORDER_STATUSES }
        };
        if (driver.companyId) filter.companyId = driver.companyId;
        const orders = await Order.find(filter).sort({ createdAt: 1 }).lean();
        return res.status(200).json({ success: true, data: { orders } });
      }

      // ---- /drivers/deliveries/mine ----
      if (path === 'deliveries/mine' && req.method === 'GET') {
        if (!driver) return res.status(403).json({ success: false, message: 'Driver only' });
        const orders = await Order.find({ assignedDriverId: driver._id })
          .sort({ createdAt: -1 })
          .lean();
        return res.status(200).json({ success: true, data: { orders } });
      }

      // ---- /drivers/deliveries/:orderId/accept ----
      if (slug.length === 3 && slug[0] === 'deliveries' && slug[2] === 'accept' && req.method === 'POST') {
        if (!driver) return res.status(403).json({ success: false, message: 'Driver only' });
        if (driver.status !== 'approved') {
          return res.status(403).json({ success: false, message: 'Account not approved' });
        }
        const orderId = slug[1];
        const claimFilter: any = {
          _id: orderId,
          assignedDriverId: { $exists: false },
          deliveryStatus: { $in: ['unassigned', null] }
        };
        if (driver.companyId) claimFilter.companyId = driver.companyId;
        const order = await Order.findOneAndUpdate(
          { ...claimFilter, $or: [{ assignedDriverId: null }, { assignedDriverId: { $exists: false } }] },
          {
            $set: {
              assignedDriverId: driver._id,
              deliveryStatus: 'assigned',
              acceptedAt: new Date(),
              orderStatus: 'in_transit'
            }
          },
          { new: true }
        );
        if (!order) {
          return res.status(409).json({ success: false, message: 'Delivery no longer available' });
        }
        if (!order.deliveryOtp) {
          order.deliveryOtp = generateOtp();
          await order.save();
        }
        return res.status(200).json({ success: true, data: { order: order.toObject() } });
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
        const order = await Order.findOneAndUpdate(
          { _id: orderId, assignedDriverId: driver._id },
          { $set: { deliveryStatus: status, orderStatus: status, deliveryNotes: note || undefined } },
          { new: true }
        );
        if (!order) return res.status(404).json({ success: false, message: 'Delivery not found' });
        return res.status(200).json({ success: true, data: { order: order.toObject() } });
      }

      // ---- /drivers/deliveries/:orderId/complete ----
      if (slug.length === 3 && slug[0] === 'deliveries' && slug[2] === 'complete' && req.method === 'POST') {
        if (!driver) return res.status(403).json({ success: false, message: 'Driver only' });
        const orderId = slug[1];
        const { otp, notes } = req.body || {};
        const order = await Order.findOne({ _id: orderId, assignedDriverId: driver._id });
        if (!order) return res.status(404).json({ success: false, message: 'Delivery not found' });
        if (order.deliveryStatus === 'delivered') {
          return res.status(400).json({ success: false, message: 'Delivery already completed' });
        }
        if (order.deliveryOtp && order.deliveryOtp !== otp) {
          return res.status(400).json({ success: false, message: 'Invalid delivery OTP' });
        }
        order.deliveryStatus = 'delivered';
        order.orderStatus = 'delivered';
        order.deliveredAt = new Date();
        if (notes) order.deliveryNotes = notes;
        await order.save();

        // Record earnings + update driver stats
        const amount = Number(order.deliveryFee || order.driverEarning || order.total || 0);
        await DriverEarning.create({
          driverId: driver._id,
          companyId: order.companyId || driver.companyId,
          orderId: order._id,
          amount,
          status: 'pending',
          description: `Delivery for order ${order.orderNumber || order._id}`
        });
        driver.stats = driver.stats || { totalDeliveries: 0, totalEarnings: 0, rating: 0 };
        driver.stats.totalDeliveries = (driver.stats.totalDeliveries || 0) + 1;
        driver.stats.totalEarnings = (driver.stats.totalEarnings || 0) + amount;
        await driver.save();

        return res.status(200).json({ success: true, message: 'Delivery completed', data: { order: order.toObject() } });
      }

      // ---- Admin listing & lifecycle ----
      if (path === '' && req.method === 'GET') {
        if (!isAdmin) return res.status(403).json({ success: false, message: 'Forbidden' });
        const filter: any = {};
        if (user.role !== 'platformAdmin' && user.companyId) filter.companyId = user.companyId;
        const drivers = await Driver.find(filter).lean();
        return res.status(200).json({ success: true, data: drivers });
      }

      if (path === '' && req.method === 'POST') {
        if (!isAdmin) return res.status(403).json({ success: false, message: 'Forbidden' });
        const doc: any = { ...req.body };
        if (user.role !== 'platformAdmin' && user.companyId) doc.companyId = user.companyId;
        const created = await Driver.create(doc);
        return res.status(201).json({ success: true, data: created });
      }

      if (slug.length === 1 && req.method === 'GET') {
        if (!isAdmin) return res.status(403).json({ success: false, message: 'Forbidden' });
        const q: any = { _id: slug[0] };
        if (user.role !== 'platformAdmin' && user.companyId) q.companyId = user.companyId;
        const found = await Driver.findOne(q).lean();
        if (!found) return res.status(404).json({ success: false, message: 'Not found' });
        return res.status(200).json({ success: true, data: found });
      }

      if (slug.length === 2 && slug[1] === 'approve' && req.method === 'POST') {
        if (!isAdmin) return res.status(403).json({ success: false, message: 'Forbidden' });
        const q: any = { _id: slug[0] };
        if (user.role !== 'platformAdmin' && user.companyId) q.companyId = user.companyId;
        const updated = await Driver.findOneAndUpdate(
          q,
          { $set: { status: 'approved', rejectionReason: undefined } },
          { new: true }
        );
        if (!updated) return res.status(404).json({ success: false, message: 'Not found' });
        return res.status(200).json({ success: true, data: updated.toObject() });
      }

      if (slug.length === 2 && ['reject', 'suspend'].includes(slug[1]) && req.method === 'POST') {
        if (!isAdmin) return res.status(403).json({ success: false, message: 'Forbidden' });
        const q: any = { _id: slug[0] };
        if (user.role !== 'platformAdmin' && user.companyId) q.companyId = user.companyId;
        const target = slug[1] === 'reject' ? 'rejected' : 'suspended';
        const updated = await Driver.findOneAndUpdate(
          q,
          { $set: { status: target, isAvailable: false, rejectionReason: (req.body || {}).reason } },
          { new: true }
        );
        if (!updated) return res.status(404).json({ success: false, message: 'Not found' });
        return res.status(200).json({ success: true, data: updated.toObject() });
      }

      res.status(404).json({ success: false, message: 'Not found' });
    });
  });
}
