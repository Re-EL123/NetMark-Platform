import { VercelRequest, VercelResponse } from '@vercel/node';
import driversHandler from '../drivers/[...slug]';

// Backwards-compatible alias: /deliveries/* -> /drivers/deliveries/*
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const slug = Array.isArray(req.query.slug) ? req.query.slug : [req.query.slug || ''];
  req.query.slug = ['deliveries', ...slug];
  return driversHandler(req, res);
}
