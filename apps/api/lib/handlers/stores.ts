import { VercelRequest, VercelResponse } from '@vercel/node';
import { connectDB } from '../db';
import mongoose from 'mongoose';
import { verifyFirebaseToken, loadUser } from '../middleware';

const StoreSchema = new mongoose.Schema({ name: String, slug: String, companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company' }, distributorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, isActive: { type: Boolean, default: true } }, { timestamps: true, strict: false });
const Store = mongoose.models.Store || mongoose.model('Store', StoreSchema);

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
      const filter: any = isScoped && user.companyId ? { companyId: user.companyId } : {};

      if (path === '' && req.method === 'GET') {
        const data = await Store.find(filter).lean();
        return res.status(200).json({ success: true, data });
      }
      if (path === '' && req.method === 'POST') {
        if (user.role === 'customer' || user.role === 'driver') return res.status(403).json({ success: false, message: 'Forbidden' });
        const body = req.body;
        if (!body.name) return res.status(400).json({ success: false, message: 'Name required' });
        const doc: any = { ...body };
        if (isScoped && user.companyId) doc.companyId = user.companyId;
        const c = await Store.create(doc);
        return res.status(201).json({ success: true, data: c });
      }
      const id = slug[0];
      if (id && req.method === 'GET') {
        const q: any = { _id: id };
        if (isScoped && user.companyId) q.companyId = user.companyId;
        const c = await Store.findOne(q).lean();
        if (!c) return res.status(404).json({ success: false, message: 'Not found' });
        return res.status(200).json({ success: true, data: c });
      }
      if (id && req.method === 'PUT') {
        const q: any = { _id: id };
        if (isScoped && user.companyId) q.companyId = user.companyId;
        const c = await Store.findOneAndUpdate(q, req.body, { new: true }).lean();
        if (!c) return res.status(404).json({ success: false, message: 'Not found' });
        return res.status(200).json({ success: true, data: c });
      }
      res.status(404).json({ success: false, message: 'Not found' });
    });
  });
}
