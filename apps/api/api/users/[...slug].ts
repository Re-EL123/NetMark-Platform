import { VercelRequest, VercelResponse } from '@vercel/node';
import { connectDB } from '../../lib/db';
import { User } from '../../lib/models/User';
import { verifyFirebaseToken, loadUser, requireRole } from '../../lib/middleware';

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

      if (path === '' && req.method === 'GET') {
        if (user.role === 'platformAdmin') {
          const users = await User.find().lean();
          return res.status(200).json({ success: true, data: users });
        }
        if (user.role === 'owner') {
          const users = await User.find({ companyId: user.companyId }).lean();
          return res.status(200).json({ success: true, data: users });
        }
        return res.status(403).json({ success: false, message: 'Forbidden' });
      }

      const id = slug[0];
      if (id && req.method === 'GET') {
        let u;
        if (user.role === 'platformAdmin') {
          u = await User.findById(id).lean();
        } else if (user.role === 'owner') {
          u = await User.findOne({ _id: id, companyId: user.companyId }).lean();
        }
        if (!u) return res.status(404).json({ success: false, message: 'Not found' });
        return res.status(200).json({ success: true, data: u });
      }

      if (id && req.method === 'PUT') {
        const allowed = ['platformAdmin', 'owner'];
        if (!allowed.includes(user.role)) return res.status(403).json({ success: false, message: 'Forbidden' });
        const update: any = {};
        const { name, phone, role, verificationStatus, companyId } = req.body;
        if (name) update.name = name;
        if (phone) update.phone = phone;
        if (verificationStatus) update.verificationStatus = verificationStatus;
        if (role && user.role === 'platformAdmin') update.role = role;
        if (companyId && user.role === 'platformAdmin') update.companyId = companyId;
        let u;
        if (user.role === 'platformAdmin') {
          u = await User.findByIdAndUpdate(id, update, { new: true }).lean();
        } else {
          u = await User.findOneAndUpdate({ _id: id, companyId: user.companyId }, update, { new: true }).lean();
        }
        if (!u) return res.status(404).json({ success: false, message: 'Not found' });
        return res.status(200).json({ success: true, data: u });
      }

      if (id && req.method === 'DELETE') {
        if (user.role !== 'platformAdmin') return res.status(403).json({ success: false, message: 'Forbidden' });
        await User.findByIdAndDelete(id);
        return res.status(200).json({ success: true, message: 'Deleted' });
      }

      res.status(404).json({ success: false, message: 'Not found' });
    });
  });
}
