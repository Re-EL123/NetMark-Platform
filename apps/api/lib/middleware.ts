import { VercelRequest, VercelResponse } from '@vercel/node';
import { authAdmin } from './firebase';
import { User } from './models/User';
import { connectDB } from './db';

export async function verifyFirebaseToken(req: VercelRequest, res: VercelResponse, next: () => void) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  const token = authHeader.split('Bearer ')[1];
  try {
    const decoded = await authAdmin.verifyIdToken(token);
    (req as any).decodedToken = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }
}

export async function loadUser(req: VercelRequest, res: VercelResponse, next: () => void) {
  try {
    await connectDB();
    const decoded = (req as any).decodedToken;
    if (!decoded) return res.status(401).json({ success: false, message: 'Unauthorized' });
    const user = await User.findOne({ firebaseUid: decoded.uid });
    if (!user) return res.status(401).json({ success: false, message: 'User not found' });
    user.lastLogin = new Date();
    await user.save();
    (req as any).user = user;
    next();
  } catch (err) {
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
  // platformAdmin can access all
  if (user.role === 'platformAdmin') return next();
  // owner and others scoped to their companyId
  if (user.role === 'owner' || user.companyId) {
    (req as any).companyFilter = { companyId: user.companyId };
    return next();
  }
  return res.status(403).json({ success: false, message: 'Forbidden' });
}
