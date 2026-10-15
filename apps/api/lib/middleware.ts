import { VercelRequest, VercelResponse } from '@vercel/node';
import { getSupabase } from './db';

export async function verifySupabaseToken(
  req: VercelRequest,
  res: VercelResponse,
  next: () => void
) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  const token = authHeader.slice('Bearer '.length);
  try {
    const { data, error } = await getSupabase().auth.getUser(token);
    if (error || !data?.user) {
      return res.status(401).json({ success: false, message: 'Invalid token' });
    }
    (req as any).authUser = data.user;
    next();
  } catch {
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }
}

export async function loadUser(req: VercelRequest, res: VercelResponse, next: () => void) {
  try {
    const authUser = (req as any).authUser;
    if (!authUser) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const sb = getSupabase();
    const { data: user, error } = await sb
      .from('users')
      .select('*')
      .eq('id', authUser.id)
      .maybeSingle();
    if (error) throw error;
    if (!user) return res.status(401).json({ success: false, message: 'User not found' });

    await sb.from('users').update({ last_login: new Date().toISOString() }).eq('id', user.id);

    (req as any).user = user; // raw row (snake_case); handlers use rowOut()
    next();
  } catch (err) {
    console.error('loadUser error', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
}

export function requireRole(...roles: string[]) {
  return (req: VercelRequest, res: VercelResponse, next: () => void) => {
    const user = (req as any).user;
    if (!user || !roles.includes(user.role)) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    next();
  };
}

export function requireCompanyScope(req: VercelRequest, res: VercelResponse, next: () => void) {
  const user = (req as any).user;
  if (!user) return res.status(403).json({ success: false, message: 'Forbidden' });
  if (user.role === 'platformAdmin') return next();
  if (user.role === 'owner' || user.company_id) {
    (req as any).companyFilter = { companyId: user.company_id };
    return next();
  }
  return res.status(403).json({ success: false, message: 'Forbidden' });
}
