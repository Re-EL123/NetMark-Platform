import { VercelResponse } from '@vercel/node';

const buckets = new Map<string, { count: number; reset: number }>();

export function rateLimit(
  key: string,
  opts: { windowMs?: number; max?: number } = {}
) {
  const windowMs = opts.windowMs ?? 60000; // 60s
  const max = opts.max ?? 30;
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || b.reset < now) {
    b = { count: 0, reset: now + windowMs };
    buckets.set(key, b);
  }
  b.count += 1;
  if (b.count > max) return false;
  return true;
}

export function rateLimitFail(res: VercelResponse, message = 'Too many requests, please try again later.') {
  return res.status(429).json({ success: false, message });
}
