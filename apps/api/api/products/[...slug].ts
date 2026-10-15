import { VercelRequest, VercelResponse } from '@vercel/node';
import { connectDB } from '../../lib/db';
import mongoose from 'mongoose';
import { verifyFirebaseToken, loadUser } from '../../lib/middleware';

const ProductSchema = new mongoose.Schema({ name: String, companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company' }, price: Number, category: String }, { timestamps: true, strict: false });
const Product = mongoose.models.Product || mongoose.model('Product', ProductSchema);
const StoreProductSchema = new mongoose.Schema({ storeId: mongoose.Schema.Types.ObjectId, productId: mongoose.Schema.Types.ObjectId, companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company' } }, { timestamps: true, strict: false });
const StoreProduct = mongoose.models.StoreProduct || mongoose.model('StoreProduct', StoreProductSchema);

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
        const data = await Product.find(filter).lean();
        return res.status(200).json({ success: true, data });
      }
      if (path === '' && req.method === 'POST') {
        if (user.role === 'customer' || user.role === 'driver') return res.status(403).json({ success: false, message: 'Forbidden' });
        const body = req.body;
        if (!body.name) return res.status(400).json({ success: false, message: 'Name required' });
        const doc: any = { ...body };
        if (isScoped && user.companyId) doc.companyId = user.companyId;
        const c = await Product.create(doc);
        return res.status(201).json({ success: true, data: c });
      }
      res.status(404).json({ success: false, message: 'Not found' });
    });
  });
}
