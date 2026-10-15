import { VercelRequest, VercelResponse } from '@vercel/node';
import { connectDB } from '../db';
import { User } from '../models/User';
import { Driver } from '../models/Driver';
import { Company } from '../models/Company';
import { verifyFirebaseToken, loadUser } from '../middleware';
import { authAdmin } from '../firebase';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const slug = Array.isArray(req.query.slug) ? req.query.slug : [req.query.slug || ''];
  const path = slug.join('/');

  if (path === 'me' && req.method === 'GET') {
    return verifyFirebaseToken(req, res, async () => {
      await loadUser(req, res, async () => {
        const user = (req as any).user;
        const payload: any = { user: user.toObject ? user.toObject() : user };

        if (user.role === 'driver') {
          const driver = await Driver.findOne({ userId: user._id }).lean();
          if (driver) {
            payload.driverProfile = driver;
            payload.driver = driver;
          }
        } else if (user.companyId) {
          const company = await Company.findById(user.companyId).lean();
          if (company) payload.company = company;
        }

        return res.status(200).json({ success: true, data: payload });
      });
    });
  }

  if (path === 'me' && req.method === 'PUT') {
    return verifyFirebaseToken(req, res, async () => {
      await loadUser(req, res, async () => {
        const user = (req as any).user;
        const { name, phone, profileImage } = req.body || {};
        if (name) user.name = name;
        if (phone) user.phone = phone;
        if (profileImage) user.profileImage = profileImage;
        await user.save();
        return res.status(200).json({ success: true, data: { user: user.toObject() } });
      });
    });
  }

  if (path === 'register' && req.method === 'POST') {
    try {
      await connectDB();
      const {
        firebaseUid: providedUid,
        name,
        email,
        phone,
        password,
        role = 'customer',
        companyId,
        distributorCode,
        driverInfo
      } = req.body || {};

      if (!name || !email) {
        return res.status(400).json({ success: false, message: 'Missing required fields' });
      }

      const existing = await User.findOne({ email });
      if (existing) {
        return res.status(400).json({ success: false, message: 'User already exists' });
      }

      // Determine firebase uid: provided by web client, or create user server-side (mobile)
      let firebaseUid = providedUid;
      if (firebaseUid) {
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
          try {
            const decoded = await authAdmin.verifyIdToken(authHeader.split('Bearer ')[1]);
            firebaseUid = decoded.uid;
          } catch {
            return res.status(401).json({ success: false, message: 'Invalid token' });
          }
        }
      } else {
        if (!password) {
          return res.status(400).json({ success: false, message: 'Password required' });
        }
        try {
          const fbUser = await authAdmin.createUser({ email, password, displayName: name, phoneNumber: phone || undefined });
          firebaseUid = fbUser.uid;
        } catch (fbErr: any) {
          if (fbErr?.code === 'auth/email-already-exists') {
            return res.status(400).json({ success: false, message: 'Email already registered' });
          }
          if (fbErr?.code === 'auth/invalid-phone-number') {
            const fbUser = await authAdmin.createUser({ email, password, displayName: name });
            firebaseUid = fbUser.uid;
          } else {
            return res.status(400).json({ success: false, message: fbErr?.message || 'Firebase registration failed' });
          }
        }
      }

      const user = await User.create({
        firebaseUid,
        name,
        email,
        phone,
        role,
        companyId: companyId || undefined,
        distributorCode: distributorCode || undefined,
        verificationStatus: role === 'platformAdmin' ? 'verified' : 'pending'
      });

      if (role === 'driver') {
        await Driver.create({
          userId: user._id,
          firebaseUid,
          companyId: companyId || undefined,
          status: 'pending',
          isAvailable: false,
          vehicleType: driverInfo?.vehicleType,
          vehicleNumber: driverInfo?.vehicleNumber,
          vehicleModel: driverInfo?.vehicleModel,
          licenseNumber: driverInfo?.licenseNumber,
          licenseExpiry: driverInfo?.licenseExpiry ? new Date(driverInfo.licenseExpiry) : undefined
        });
      }

      return res.status(201).json({ success: true, data: { user: user.toObject() } });
    } catch (err: any) {
      console.error('register error', err);
      return res.status(500).json({ success: false, message: 'Server error' });
    }
  }

  res.status(404).json({ success: false, message: 'Not found' });
}
