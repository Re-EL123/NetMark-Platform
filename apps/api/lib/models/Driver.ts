import mongoose, { Schema, Document } from 'mongoose';

export interface IDriver extends Document {
  userId: mongoose.Types.ObjectId;
  firebaseUid: string;
  companyId?: mongoose.Types.ObjectId;
  status: 'pending' | 'approved' | 'rejected' | 'suspended';
  isAvailable: boolean;
  currentLocation?: { lat: number; lng: number; updatedAt: Date };
  vehicleType?: string;
  vehicleNumber?: string;
  vehicleModel?: string;
  licenseNumber?: string;
  licenseExpiry?: Date;
  bankDetails?: any;
  pushToken?: string;
  rejectionReason?: string;
  stats?: { totalDeliveries: number; totalEarnings: number; rating: number };
  createdAt: Date;
  updatedAt: Date;
}

const DriverSchema = new Schema<IDriver>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    firebaseUid: { type: String, required: true, unique: true },
    companyId: { type: Schema.Types.ObjectId, ref: 'Company' },
    status: { type: String, enum: ['pending', 'approved', 'rejected', 'suspended'], default: 'pending' },
    isAvailable: { type: Boolean, default: false },
    currentLocation: {
      lat: Number,
      lng: Number,
      updatedAt: Date
    },
    vehicleType: String,
    vehicleNumber: String,
    vehicleModel: String,
    licenseNumber: String,
    licenseExpiry: Date,
    bankDetails: Schema.Types.Mixed,
    pushToken: String,
    rejectionReason: String,
    stats: {
      totalDeliveries: { type: Number, default: 0 },
      totalEarnings: { type: Number, default: 0 },
      rating: { type: Number, default: 0 }
    }
  },
  { timestamps: true }
);

export const Driver = mongoose.models.Driver || mongoose.model<IDriver>('Driver', DriverSchema);
