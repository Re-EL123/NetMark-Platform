import mongoose, { Schema, Document } from 'mongoose';

export interface IDriverEarning extends Document {
  driverId: mongoose.Types.ObjectId;
  companyId?: mongoose.Types.ObjectId;
  orderId: mongoose.Types.ObjectId;
  amount: number;
  status: 'pending' | 'paid';
  paidAt?: Date;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

const DriverEarningSchema = new Schema<IDriverEarning>(
  {
    driverId: { type: Schema.Types.ObjectId, ref: 'Driver', required: true },
    companyId: { type: Schema.Types.ObjectId, ref: 'Company' },
    orderId: { type: Schema.Types.ObjectId, ref: 'Order', required: true },
    amount: { type: Number, default: 0 },
    status: { type: String, enum: ['pending', 'paid'], default: 'pending' },
    paidAt: Date,
    description: String
  },
  { timestamps: true }
);

export const DriverEarning =
  mongoose.models.DriverEarning || mongoose.model<IDriverEarning>('DriverEarning', DriverEarningSchema);
