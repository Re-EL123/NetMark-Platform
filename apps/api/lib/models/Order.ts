import mongoose, { Schema, Document } from 'mongoose';

export type DeliveryStatus =
  | 'unassigned'
  | 'assigned'
  | 'picked_up'
  | 'in_transit'
  | 'delivered'
  | 'failed';

export interface IOrder extends Document {
  orderNumber: string;
  companyId?: mongoose.Types.ObjectId;
  userId?: mongoose.Types.ObjectId;
  storeId?: mongoose.Types.ObjectId;
  assignedDriverId?: mongoose.Types.ObjectId;
  orderStatus: string;
  deliveryStatus: DeliveryStatus;
  deliveryOtp?: string;
  acceptedAt?: Date;
  deliveredAt?: Date;
  deliveryNotes?: string;
  [key: string]: any;
}

const OrderSchema = new Schema<IOrder>(
  {
    orderNumber: String,
    companyId: { type: Schema.Types.ObjectId, ref: 'Company' },
    userId: { type: Schema.Types.ObjectId, ref: 'User' },
    storeId: { type: Schema.Types.ObjectId, ref: 'Store' },
    assignedDriverId: { type: Schema.Types.ObjectId, ref: 'Driver' },
    orderStatus: { type: String, default: 'ready' },
    deliveryStatus: {
      type: String,
      enum: ['unassigned', 'assigned', 'picked_up', 'in_transit', 'delivered', 'failed'],
      default: 'unassigned'
    },
    deliveryOtp: String,
    acceptedAt: Date,
    deliveredAt: Date,
    deliveryNotes: String
  },
  { timestamps: true, strict: false }
);

export const Order = mongoose.models.Order || mongoose.model<IOrder>('Order', OrderSchema);
