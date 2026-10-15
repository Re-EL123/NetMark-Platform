import mongoose, { Schema, Document } from 'mongoose';

export interface IUser extends Document {
  firebaseUid: string;
  name: string;
  email: string;
  phone?: string;
  role: 'platformAdmin' | 'owner' | 'distributor' | 'storeOwner' | 'customer' | 'driver';
  verificationStatus: 'pending' | 'verified' | 'rejected';
  companyId?: mongoose.Types.ObjectId;
  profileImage?: string;
  distributorCode?: string;
  createdAt: Date;
  updatedAt: Date;
  lastLogin?: Date;
}

const UserSchema = new Schema<IUser>(
  {
    firebaseUid: { type: String, unique: true, required: true },
    name: { type: String, required: true },
    email: { type: String, unique: true, required: true },
    phone: String,
    role: {
      type: String,
      enum: ['platformAdmin', 'owner', 'distributor', 'storeOwner', 'customer', 'driver'],
      default: 'customer',
      required: true
    },
    verificationStatus: {
      type: String,
      enum: ['pending', 'verified', 'rejected'],
      default: 'pending'
    },
    companyId: { type: Schema.Types.ObjectId, ref: 'Company' },
    profileImage: String,
    distributorCode: String,
    lastLogin: Date
  },
  { timestamps: true }
);

export const User = mongoose.models.User || mongoose.model<IUser>('User', UserSchema);
