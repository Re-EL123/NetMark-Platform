import { VercelRequest, VercelResponse } from '@vercel/node';
import { connectDB } from '../../lib/db';
import { Order } from '../../lib/models/Order';
import { Driver } from '../../lib/models/Driver';
import { verifyFirebaseToken, loadUser } from '../../lib/middleware';

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

  return verifyFirebaseToken(req, res, async () => {
    await loadUser(req, res, async () => {
      await connectDB();
      const user = (req as any).user;
      const isScoped = user.role !== 'platformAdmin';
      const scope: any = isScoped && user.companyId ? { companyId: user.companyId } : {};

      if (path === '' && req.method === 'GET') {
        const data = await Order.find(scope).sort({ createdAt: -1 }).lean();
        return res.status(200).json({ success: true, data });
      }

      if (path === 'my/all' && req.method === 'GET') {
        const data = await Order.find({ userId: user._id }).sort({ createdAt: -1 }).lean();
        return res.status(200).json({ success: true, data });
      }

      if (path === '' && req.method === 'POST') {
        const body = req.body || {};
        const doc: any = { ...body, userId: user._id };
        if (isScoped && user.companyId) doc.companyId = user.companyId;
        if (!doc.orderNumber) {
          doc.orderNumber = 'NM' + Date.now().toString().slice(-8);
        }
        doc.deliveryStatus = doc.deliveryStatus || 'unassigned';
        doc.orderStatus = doc.orderStatus || 'ready';
        doc.deliveryOtp = doc.deliveryOtp || generateOtp();
        const created = await Order.create(doc);
        return res.status(201).json({ success: true, data: created.toObject() });
      }

      if (slug.length === 2 && slug[1] === 'status' && req.method === 'PUT') {
        const q: any = { _id: slug[0], ...scope };
        const { status } = req.body || {};
        const updated = await Order.findOneAndUpdate(
          q,
          { $set: { orderStatus: status } },
          { new: true }
        );
        if (!updated) return res.status(404).json({ success: false, message: 'Not found' });
        return res.status(200).json({ success: true, data: updated.toObject() });
      }

      if (slug.length === 2 && slug[1] === 'assign' && req.method === 'POST') {
        if (!['platformAdmin', 'owner', 'storeOwner'].includes(user.role)) {
          return res.status(403).json({ success: false, message: 'Forbidden' });
        }
        const { driverId } = req.body || {};
        const q: any = { _id: slug[0], ...scope };
        const updated = await Order.findOneAndUpdate(
          q,
          {
            $set: {
              assignedDriverId: driverId,
              deliveryStatus: 'assigned',
              orderStatus: 'in_transit',
              acceptedAt: new Date()
            }
          },
          { new: true }
        );
        if (!updated) return res.status(404).json({ success: false, message: 'Not found' });
        return res.status(200).json({ success: true, data: updated.toObject() });
      }

      if (slug.length === 2 && req.method === 'GET') {
        const q: any = { _id: slug[0], ...scope };
        const found = await Order.findOne(q).lean();
        if (!found) return res.status(404).json({ success: false, message: 'Not found' });
        return res.status(200).json({ success: true, data: found });
      }

      res.status(404).json({ success: false, message: 'Not found' });
    });
  });
}
