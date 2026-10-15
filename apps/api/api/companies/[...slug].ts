import { VercelRequest, VercelResponse } from '@vercel/node';
import { connectDB } from '../../lib/db';
import { Company } from '../../lib/models/Company';
import { verifyFirebaseToken, loadUser } from '../../lib/middleware';
import mongoose from 'mongoose';

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

  return verifyFirebaseToken(req, res, async () => {
    await loadUser(req, res, async () => {
      await connectDB();
      const user = (req as any).user;

      if (path === '' && req.method === 'GET') {
        if (user.role === 'platformAdmin') {
          const companies = await Company.find().lean();
          return res.status(200).json({ success: true, data: companies });
        }
        if (user.companyId) {
          const c = await Company.findById(user.companyId).lean();
          return res.status(200).json({ success: true, data: c ? [c] : [] });
        }
        return res.status(200).json({ success: true, data: [] });
      }

      if (path === '' && req.method === 'POST') {
        if (user.role !== 'platformAdmin' && user.role !== 'owner') {
          return res.status(403).json({ success: false, message: 'Forbidden' });
        }
        const { name, contact, address, status } = req.body;
        if (!name) return res.status(400).json({ success: false, message: 'Name required' });
        let base = slugify(name);
        let s = base;
        let i = 1;
        while (await Company.findOne({ slug: s })) { s = base + '-' + i++; }
        const c = await Company.create({
          name,
          slug: s,
          contact: contact || {},
          address: address || {},
          status: status || 'active',
          createdBy: user._id
        });
        return res.status(201).json({ success: true, data: c });
      }

      const id = slug[0];
      if (id && req.method === 'GET') {
        let c;
        if (user.role === 'platformAdmin') c = await Company.findById(id).lean();
        else if (user.companyId?.toString() === id) c = await Company.findById(id).lean();
        if (!c) return res.status(404).json({ success: false, message: 'Not found' });
        return res.status(200).json({ success: true, data: c });
      }

      if (id && req.method === 'PUT') {
        if (user.role !== 'platformAdmin' && user.companyId?.toString() !== id) {
          return res.status(403).json({ success: false, message: 'Forbidden' });
        }
        const update = { ...req.body };
        delete update.slug;
        const c = await Company.findByIdAndUpdate(id, update, { new: true }).lean();
        if (!c) return res.status(404).json({ success: false, message: 'Not found' });
        return res.status(200).json({ success: true, data: c });
      }

      if (id && req.method === 'DELETE') {
        if (user.role !== 'platformAdmin') return res.status(403).json({ success: false, message: 'Forbidden' });
        await Company.findByIdAndDelete(id);
        return res.status(200).json({ success: true, message: 'Deleted' });
      }

      res.status(404).json({ success: false, message: 'Not found' });
    });
  });
}
