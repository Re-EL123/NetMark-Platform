import { VercelRequest, VercelResponse } from '@vercel/node';
import auth from '../lib/handlers/auth';
import users from '../lib/handlers/users';
import companies from '../lib/handlers/companies';
import stores from '../lib/handlers/stores';
import products from '../lib/handlers/products';
import storeProducts from '../lib/handlers/storeProducts';
import purchases from '../lib/handlers/purchases';
import orders from '../lib/handlers/orders';
import drivers from '../lib/handlers/drivers';
import appointments from '../lib/handlers/appointments';
import payments from '../lib/handlers/payments';
import reports from '../lib/handlers/reports';
import codes from '../lib/handlers/codes';
import deliveries from '../lib/handlers/deliveries';
import admin from '../lib/handlers/admin';
import settings from '../lib/handlers/settings';
import notifications from '../lib/handlers/notifications';
import reviews from '../lib/handlers/reviews';

type Handler = (req: VercelRequest, res: VercelResponse) => unknown;

const handlers: Record<string, Handler> = {
  auth,
  users,
  companies,
  stores,
  products,
  'store-products': storeProducts,
  orders,
  drivers,
  appointments,
  payments,
  reports,
  codes,
  deliveries,
  admin,
  settings,
  notifications,
  reviews
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // The vercel.json rewrite sends every /api/* request here while preserving
  // the original URL in req.url. We split it into a domain + remaining
  // segments and hand off to the matching domain handler with req.query.slug
  // normalized to an array (what each handler expects).
  const rawUrl = req.url || '';
  const pathOnly = rawUrl.split('?')[0];
  const parts = pathOnly.replace(/^\/api\/?/, '').split('/').filter(Boolean);

  if (parts.length === 0) {
    return res.status(200).json({ success: true, message: 'NetMark API', version: '1.0.0' });
  }

  const [domain, ...rest] = parts;
  const domainHandler = handlers[domain];

  if (!domainHandler) {
    return res.status(404).json({ success: false, message: `Unknown endpoint: /${domain}` });
  }

  (req as any).query = { ...(req.query || {}), slug: rest };
  return domainHandler(req, res);
}
