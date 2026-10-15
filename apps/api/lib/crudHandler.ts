import { VercelRequest, VercelResponse } from '@vercel/node';
import mongoose from 'mongoose';
import { connectDB } from './db';
import { verifyFirebaseToken, loadUser } from './middleware';

export function createCrudHandler(modelName: string, options: {
  readRoles?: string[];
  writeRoles?: string[];
} = {}) {
  const readRoles = options.readRoles || [
    'platformAdmin',
    'owner',
    'storeOwner',
    'distributor',
    'customer',
    'driver'
  ];
  const writeRoles = options.writeRoles || ['platformAdmin', 'owner', 'storeOwner', 'distributor'];

  const schema = new mongoose.Schema({}, { timestamps: true, strict: false });
  const Model = mongoose.models[modelName] || mongoose.model(modelName, schema);

  return async function handler(req: VercelRequest, res: VercelResponse) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') return res.status(200).end();

    const slug = Array.isArray(req.query.slug) ? req.query.slug : [req.query.slug || ''];

    return verifyFirebaseToken(req, res, async () => {
      await loadUser(req, res, async () => {
        await connectDB();
        const user = (req as any).user;
        const isPlatform = user.role === 'platformAdmin';
        const scope: any = !isPlatform && user.companyId ? { companyId: user.companyId } : {};

        try {
          if (slug.length === 0) {
            if (req.method === 'GET') {
              if (!readRoles.includes(user.role)) return res.status(403).json({ success: false, message: 'Forbidden' });
              const data = await Model.find(scope).sort({ createdAt: -1 }).lean();
              return res.status(200).json({ success: true, data });
            }
            if (req.method === 'POST') {
              if (!writeRoles.includes(user.role)) return res.status(403).json({ success: false, message: 'Forbidden' });
              const doc: any = { ...(req.body || {}) };
              if (!isPlatform && user.companyId) doc.companyId = user.companyId;
              const created = await Model.create(doc);
              return res.status(201).json({ success: true, data: created.toObject() });
            }
          }

          const id = slug[0];
          if (req.method === 'GET') {
            if (!readRoles.includes(user.role)) return res.status(403).json({ success: false, message: 'Forbidden' });
            const found = await Model.findOne({ _id: id, ...scope }).lean();
            if (!found) return res.status(404).json({ success: false, message: 'Not found' });
            return res.status(200).json({ success: true, data: found });
          }
          if (req.method === 'PUT') {
            if (!writeRoles.includes(user.role)) return res.status(403).json({ success: false, message: 'Forbidden' });
            const updated = await Model.findOneAndUpdate({ _id: id, ...scope }, { $set: req.body || {} }, { new: true }).lean();
            if (!updated) return res.status(404).json({ success: false, message: 'Not found' });
            return res.status(200).json({ success: true, data: updated });
          }
          if (req.method === 'DELETE') {
            if (!writeRoles.includes(user.role)) return res.status(403).json({ success: false, message: 'Forbidden' });
            const deleted = await Model.findOneAndDelete({ _id: id, ...scope }).lean();
            if (!deleted) return res.status(404).json({ success: false, message: 'Not found' });
            return res.status(200).json({ success: true, message: 'Deleted' });
          }
        } catch (err) {
          console.error(modelName, 'handler error', err);
          return res.status(500).json({ success: false, message: 'Server error' });
        }

        res.status(405).json({ success: false, message: 'Method not allowed' });
      });
    });
  };
}
