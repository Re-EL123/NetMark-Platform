import { VercelRequest, VercelResponse } from '@vercel/node';
import { connectDB } from '../db';
import mongoose from 'mongoose';
import { verifyFirebaseToken, loadUser } from '../middleware';

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
      if (path === 'my/all' && req.method === 'GET') {
        return res.status(200).json({ success: true, data: [] });
      }
      return res.status(200).json({ success: true, data: { summary: {} } });
    });
  });
}
